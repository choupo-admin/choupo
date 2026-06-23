/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "Flowsheet.H"
#include "core/Advisory.H"
#include "core/DisplayUnits.H"
#include "core/ExprEval.H"
#include "reporting/ModelBoundaryAudit.H"   // model-boundary audit (H conserved, T is the readout)

#include <cstdio>   // snprintf for advisory message formatting (no ostringstream)
#include "solver/NewtonRaphson.H"
#include "solver/NewtonND.H"
#include "solver/Wegstein.H"
#include "streams/Composition.H"
#include "streams/StreamMass.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "unitOperations/flash/IsothermalFlash.H"   // solveCore: feed-flash for the true vf

// The dispatcher for unit-op types lives in UnitOperation::New().
// The Flowsheet no longer needs to know about each derived class.

#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <memory>
#include <set>
#include <stdexcept>

namespace Choupo {

namespace {

// Invert Psat(T) = P for T via Newton-1D.  Used by the `state`-based
// stream specification when the user gives P but not T (or vice
// versa) and declares e.g. saturatedVapour --- T is the saturation
// temperature at that pressure for the pure component.
scalar invertPsat(const Component& c, scalar P_target_Pa)
{
    auto f  = [&](scalar T){ return c.vp().Psat_Pa(T) - P_target_Pa; };
    auto df = [&](scalar T){
        const scalar dT = 0.5;
        return (f(T+dT) - f(T-dT)) / (2.0*dT);
    };
    solver::NROptions opt;
    opt.tolerance = 1.0;             // 1 Pa
    opt.maxIter   = 60;
    opt.lower     = 250.0;
    opt.upper     = c.Tc() > 0 ? std::min(c.Tc()-1.0, 1500.0) : 1500.0;
    opt.bracket   = true;
    opt.monotoneIncreasing = true;
    auto r = solver::newton1D(f, df, std::max(c.Tb(), 273.15), opt);
    return r.x;
}

ProcessStream readSourceStream(const std::string& name,
                               const DictPtr& sd,
                               const ThermoPackage& thermo)
{
    ProcessStream s;
    s.name     = name;
    s.category = sd->lookupWordOrDefault("category", "");

    // -----------------------------------------------------------------
    // Step 0 -- utility expansion (optional sugar)
    //
    //   A stream block may say `utility steamMP;`.  In that case we
    //   look the name up in UtilityCatalogue and use it to fill the
    //   per-stream defaults (P, T, state, composition) when the user
    //   does NOT explicitly declare them.  Explicit user keys always
    //   win — the catalogue is a default-pulling convenience, not an
    //   override.  The `category` field is set to the utility name so
    //   the consumption report can aggregate by utility type.
    // -----------------------------------------------------------------
    const Utility* util = nullptr;
    if (sd->found("utility"))
    {
        const std::string utilName = sd->lookupWord("utility");
        if (!UtilityCatalogue::has(utilName))
            throw std::runtime_error("Stream '" + name +
                "': unknown utility '" + utilName + "' --- check"
                " data/standards/utilities/ for available names");
        util = &UtilityCatalogue::byName(utilName);
        if (s.category.empty()) s.category = util->name;
    }

    // -----------------------------------------------------------------
    // Step 1 -- composition  (need it before T/P inversion so we can
    //                          pick the dominant component for T_sat)
    // -----------------------------------------------------------------
    s.z.assign(thermo.n(), 0.0);
    const bool hasMolFlows  = sd->found("molarFlows");
    const bool hasMassFlows = sd->found("massFlows");
    const bool fromFlows    = hasMolFlows || hasMassFlows;

    if (hasMolFlows && hasMassFlows)
        throw std::runtime_error("Stream '" + name +
            "': specify exactly ONE of `molarFlows` / `massFlows`");
    if (fromFlows && sd->found("F"))
        throw std::runtime_error("Stream '" + name +
            "': total `F` cannot coexist with `molarFlows`/`massFlows`"
            " --- per-species flows already imply the total");

    scalar Ftot_from_perspecies = 0.0;     // populated when fromFlows

    if (fromFlows)
    {
        auto cd = sd->subDict(hasMolFlows ? "molarFlows" : "massFlows");
        sVector Fmol(thermo.n(), 0.0);

        if (hasMolFlows)
        {
            for (const auto& key : cd->keys())
            {
                std::size_t i = thermo.indexOf(key);
                Fmol[i] = cd->lookupScalar(key, Dims::molarFlow);
                Ftot_from_perspecies += Fmol[i];
            }
            if (Ftot_from_perspecies <= 0.0)
                throw std::runtime_error("Stream '" + name +
                    "': molarFlows sums to zero");
        }
        else
        {
            sVector m(thermo.n(), 0.0);
            for (const auto& key : cd->keys())
            {
                std::size_t i = thermo.indexOf(key);
                m[i] = cd->lookupScalar(key, Dims::massFlow);
            }
            for (std::size_t i = 0; i < thermo.n(); ++i)
            {
                const scalar mw = thermo.comp(i).MW();
                if (m[i] > 0.0 && mw <= 0.0)
                    throw std::runtime_error("Stream '" + name +
                        "': component '" + thermo.comp(i).name() +
                        "' has no MW --- needed to convert mass to molar"
                        " flow");
                Fmol[i] = (mw > 0.0) ? m[i] / mw : 0.0;
                Ftot_from_perspecies += Fmol[i];
            }
            if (Ftot_from_perspecies <= 0.0)
                throw std::runtime_error("Stream '" + name +
                    "': massFlows sums to zero");
        }
        for (std::size_t i = 0; i < thermo.n(); ++i)
            s.z[i] = Fmol[i] / Ftot_from_perspecies;
    }
    else if (sd->found("molarComposition")
          || sd->found("massComposition")
          || sd->found("composition"))
    {
        s.z = readComposition(sd, thermo, "Stream '" + name + "'");
    }
    else if (util != nullptr)
    {
        // Utility default: composition derived from the catalogue entry.
        // Single-component utilities (water steam, water cooling, oils,
        // salts, brines) give a clean x_i = 1 on the named species.
        // Mixture utilities are not supported as defaults — declare
        // the composition explicitly if you ever need one.
        if (util->componentsList.size() != 1)
            throw std::runtime_error("Stream '" + name +
                "': utility '" + util->name + "' has " +
                std::to_string(util->componentsList.size()) +
                " components in the catalogue — declare `molarComposition`"
                " explicitly when using a mixed-utility default");
        const std::string& comp = util->componentsList[0];
        const std::size_t i = thermo.indexOf(comp);
        s.z[i] = 1.0;
    }
    else
    {
        throw std::runtime_error("Stream '" + name +
            "': missing composition --- declare `molarComposition {... }`,"
            " `massComposition {... }`, `molarFlows {... }`,"
            " `massFlows {... }`, or `utility <name>;`");
    }

    // -----------------------------------------------------------------
    // Step 2 -- T, P, state-based completion
    //
    //   The user can declare `state <name>;` and omit one of T / P;
    //   the simulator computes the missing variable from the saturation
    //   curve of the dominant pure component.  Supported states:
    //
    //     saturatedVapour   -> vf = 1.0,  T = T_sat(P)  or P = P_sat(T)
    //     saturatedLiquid   -> vf = 0.0,  T = T_sat(P)  or P = P_sat(T)
    //     subcooledLiquid   -> vf = 0.0   (T, P both required)
    //     superheatedVapour -> vf = 1.0   (T, P both required)
    //
    //   Mixtures via `state` are NOT supported yet --- specify T and P
    //   explicitly until adds bubble-T / dew-T from state.
    // -----------------------------------------------------------------
    const bool hasState = sd->found("state");
    const bool hasT     = sd->found("T");
    const bool hasP     = sd->found("P");
    std::string state;
    if (hasState)
        state = sd->lookupWord("state");
    else if (util != nullptr && !util->state.empty())
        state = util->state;

    const bool effState = hasState || (util != nullptr && !util->state.empty());
    const bool effHasT  = hasT     || (util != nullptr && util->T_in  > 0.0);
    const bool effHasP  = hasP     || (util != nullptr && util->P     > 0.0);

    if (!effState && (!effHasT || !effHasP))
        throw std::runtime_error("Stream '" + name +
            "': missing T or P --- declare both, or declare `state` so the"
            " simulator can derive the missing one from the saturation curve,"
            " or use `utility <name>;` to pull defaults from the catalogue");

    if (effState && state != "saturatedVapour" && state != "saturatedLiquid"
                 && state != "subcooledLiquid" && state != "superheatedVapour")
        throw std::runtime_error("Stream '" + name + "': unknown state '"
            + state + "' (supported: saturatedVapour, saturatedLiquid,"
            " subcooledLiquid, superheatedVapour)");

    s.T = hasT ? sd->lookupScalar("T", Dims::temperature)
               : (util != nullptr ? util->T_in : 0.0);
    s.P = hasP ? sd->lookupScalar("P", Dims::pressure)
               : (util != nullptr ? util->P    : 0.0);

    if (effState && (state == "saturatedVapour" || state == "saturatedLiquid"))
    {
        // Find the dominant component (x_i >= 0.999).  Mixtures fall
        // through to "specify T and P explicitly".
        std::size_t dom = thermo.n();
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (s.z[i] > 0.999) { dom = i; break; }
        if (dom == thermo.n())
            throw std::runtime_error("Stream '" + name + "': state '" + state
                + "' currently supports only pure-component streams (x_i"
                  " >= 0.999 on one species); for mixtures specify T and P"
                  " explicitly");
        const Component& c = thermo.comp(dom);

        if (effHasP && !effHasT)        s.T = invertPsat(c, s.P);
        else if (effHasT && !effHasP)   s.P = c.vp().Psat_Pa(s.T);
        else if (effHasT && effHasP)
        {
            const scalar P_sat = c.vp().Psat_Pa(s.T);
            const scalar tol = 0.05 * std::max(s.P, P_sat);
            if (std::abs(P_sat - s.P) > tol)
                throw std::runtime_error("Stream '" + name + "': state '"
                    + state + "' is inconsistent: T = "
                    + std::to_string(s.T) + " K and P = "
                    + std::to_string(s.P) + " Pa, but Psat(T) = "
                    + std::to_string(P_sat) + " Pa for "
                    + c.name() + " (mismatch > 5 %)");
        }

        s.vf = (state == "saturatedVapour") ? 1.0 : 0.0;
    }
    else if (effState && state == "subcooledLiquid")  s.vf = 0.0;
    else if (effState && state == "superheatedVapour") s.vf = 1.0;

    // A raw `vf` key sets the vapour fraction directly (no silent crutch: this
    // used to be ignored, so `vf 1;` looked accepted but did nothing -- the
    // trap that made the HDA mixer pick a liquid energy basis for a gas mix).
    // An explicit `state` already pins vf; otherwise honour the declared vf.
    if (sd->found("vf") && !(effState &&
        (state == "saturatedVapour" || state == "saturatedLiquid"
         || state == "subcooledLiquid" || state == "superheatedVapour")))
    {
        const scalar vfIn = sd->lookupScalar("vf");
        if (vfIn < 0.0 || vfIn > 1.0)
            throw std::runtime_error("Stream '" + name + "': vf = "
                + std::to_string(vfIn) + " is outside [0, 1].");
        s.vf = vfIn;
    }

    // -----------------------------------------------------------------
    // Step 2b -- phase is a CONSEQUENCE of (T, P, z), and the engine must
    //            ANNOUNCE the consequence it inferred --- never bury it.
    //
    //   When the user declares NEITHER `state` NOR `vf`, do NOT silently
    //   assume the feed is liquid (vf = 0).  Two distinct silent traps once
    //   lived here:
    //
    //   (1) PHANTOM LATENT HEAT.  Stamping a two-phase feed LIQUID made the
    //       downstream flash "pay" steam to boil what was already boiled
    //       (flash01: feed at 370 K / 1 bar is ~30 % vapour).  Cured by
    //       flashing the feed at its OWN (T, P, z) --- Duhem fixes the state.
    //
    //   (2) "LIQUID NITROGEN" / "LIQUID STEAM" (QA T3).  A carrier gas declared
    //       by (T, P) only (sprayDryer drying air = N2 at 200 C; utility02
    //       water at 499 C / 40 bar) flashed to vf = 0 because the pure-
    //       component Psat is extrapolated FAR outside its Antoine range above
    //       Tc, so the VL split is physically meaningless --- yet the stream
    //       silently became a cold liquid.  A species at T > Tc CANNOT be
    //       liquid, so a liquid verdict there is a numerical artefact.
    //
    //   The credo (no silent crutch): the engine either INFERS the phase and
    //   says so, or WARNS when the inference is untrustworthy.  An explicit
    //   `state`/`vf` above is the author's deliberate override and is left
    //   untouched (and unannounced).  vf is intensive, so F is irrelevant.
    // -----------------------------------------------------------------
    //   Only meaningful when the package can actually do VLE: an LL-only
    //   package (a decanter's two-liquid thermo, no vapour phase / EoS)
    //   has nothing to flash against, so the feed is liquid (vf = 0) by
    //   construction --- skip it (and avoid a VL flash with no EoS).
    const bool phaseDeclared = effState || sd->found("vf");
    const bool canVLE        = !thermo.phasesOfType("vapor").empty();
    scalar zsum_phase = 0.0;
    for (const scalar zi : s.z) zsum_phase += zi;
    if (!phaseDeclared && canVLE && zsum_phase > 1.0e-9 && s.T > 0.0 && s.P > 0.0)
    {
        // Is the stream supercritical in its dominant species?  A component
        // with a finite Tc below the stream T cannot condense; if such species
        // make up the majority of the stream, any "liquid" flash verdict is a
        // Psat-extrapolation artefact, not a phase.  (Tc <= 0 = unknown -> not
        // counted; we never override on missing data.)
        scalar      z_supercrit = 0.0;
        std::string scWorst;            // worst offender, for the message
        scalar      scWorstZ = 0.0;
        for (std::size_t i = 0; i < thermo.n() && i < s.z.size(); ++i)
        {
            const scalar zi = s.z[i] / zsum_phase;
            const scalar Tc = thermo.comp(i).Tc();
            if (zi > 1.0e-9 && Tc > 0.0 && s.T > Tc)
            {
                z_supercrit += zi;
                if (zi > scWorstZ) { scWorstZ = zi; scWorst = thermo.comp(i).name(); }
            }
        }
        const bool supercriticalFeed = z_supercrit > 0.5;   // majority cannot condense

        FlashInput fin;
        fin.F = 1.0;                       // intensive: vf is F-independent
        fin.T = s.T;
        fin.P = s.P;
        fin.z = s.z;
        for (auto& zi : fin.z) zi /= zsum_phase;   // normalise defensively
        FlashOptions fopts;
        fopts.verbosity = 0;               // silent: we only want the vf
        const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fopts);
        const bool   flashOK  = fs.converged && std::isfinite(fs.V_over_F);
        const scalar vfFlash  = flashOK
            ? std::min(1.0, std::max(0.0, fs.V_over_F)) : 0.0;

        // Display-unit temperature for the human-readable advisory.
        const auto& du = DisplayUnits::instance();
        const auto [T_disp, T_lbl] = du.convert(s.T, Dims::temperature);
        char tbuf[24];
        std::snprintf(tbuf, sizeof(tbuf), "%.1f", static_cast<double>(T_disp));
        const std::string Tstr  = std::string(tbuf) + " " + T_lbl;
        const std::string locus = "stream '" + name + "'";

        if (supercriticalFeed && vfFlash < 0.5)
        {
            // The VL flash says liquid, but the stream is supercritical in its
            // dominant species -- a liquid here is a Psat-extrapolation ghost.
            // Override to vapour and WARN: this is the "liquid N2" trap (QA T3).
            s.vf = 1.0;
            const std::string msg =
                "vf/state unspecified and the feed-flash returned liquid, but '"
                + scWorst + "' is supercritical at " + Tstr
                + " (T > Tc) -- a liquid verdict is a vapour-pressure"
                  " extrapolation artefact, not physics.  Treating the stream"
                  " as VAPOUR (vf = 1).  Declare `state superheatedVapour;`"
                  " (or an explicit `vf`) to silence this.";
            if (AdvisoryLog::instance().add("phase", "warning", locus, msg))
                std::cout << "  [phase] WARNING: " << locus << ": " << msg << "\n";
        }
        else if (flashOK)
        {
            s.vf = vfFlash;
            // Announce the NON-trivial inferences (two-phase or all-vapour).
            // A plain vf = 0 (subcooled liquid) is the unsurprising case and is
            // left unannounced so every liquid-feed tutorial is not flooded.
            if (s.vf > 1.0e-6)
            {
                char vbuf[16];
                std::snprintf(vbuf, sizeof(vbuf), "%.3f",
                              static_cast<double>(s.vf));
                const std::string phaseWord =
                    (s.vf > 1.0 - 1.0e-6) ? "VAPOUR" : "two-phase (VL)";
                const std::string msg =
                    "vf/state unspecified; feed-flash at " + Tstr
                    + " gives vf = " + vbuf + " -> " + phaseWord
                    + ".  (Declare `state`/`vf` to fix the phase explicitly.)";
                if (AdvisoryLog::instance().add("phase", "info", locus, msg))
                    std::cout << "  [phase] " << locus << ": " << msg << "\n";
            }
        }
        else if (supercriticalFeed)
        {
            // Flash did not even converge AND the feed is supercritical: the
            // package cannot represent a phase split here.  Honest vapour.
            s.vf = 1.0;
            const std::string msg =
                "vf/state unspecified, the feed-flash did not converge, and '"
                + scWorst + "' is supercritical at " + Tstr
                + " -- treating the stream as VAPOUR (vf = 1) rather than"
                  " silently liquid.  Declare `state superheatedVapour;` to be"
                  " explicit.";
            if (AdvisoryLog::instance().add("phase", "warning", locus, msg))
                std::cout << "  [phase] WARNING: " << locus << ": " << msg << "\n";
        }
        // else: flash failed and the feed is not supercritical -> leave the
        // vf = 0 default (no basis to infer otherwise; a genuine cold liquid).
    }

    // -----------------------------------------------------------------
    // Step 3 -- F (total molar flow)
    //
    //   * fromFlows: F = sum of per-species flows (already computed)
    //   * has(F)   : explicit value
    //   * else     : default to 0 IF state implies the stream is
    //                  utility-like (saturatedVapour heating chest of
    //                  evaporators / heat exchangers); the consuming
    //                  unit op writes the actual demand back into the
    //                  stream registry after solve.
    // -----------------------------------------------------------------
    if (fromFlows)
    {
        s.F = Ftot_from_perspecies;
    }
    else if (sd->found("F"))
    {
        s.F = sd->lookupScalar("F", Dims::molarFlow);
    }
    else
    {
        throw std::runtime_error("Stream '" + name +
            "': missing total flow `F` --- every stream needs a real F "
            "(or per-species molarFlows / massFlows).  For heating "
            "utilities, provide an initial estimate; an outer DesignSpec "
            "can then iterate it to satisfy the cascade.");
    }

    // ---- Solid phase ------------------------------------------
    //  solids { solidFlows { dust 50 kg/h;... }
    //           diameters ( 1e-6 5e-6... );  massFractions ( 0.1 0.3... ); }
    //  solidFlows are read as mass flows and converted to molar (s[i]) via
    //  MW, keeping s[] parallel to z[].  The PSD is two parallel lists.
    if (sd->found("solids"))
    {
        auto sol = sd->subDict("solids");
        s.s.assign(thermo.n(), 0.0);
        if (sol->found("solidFlows"))
        {
            auto sf = sol->subDict("solidFlows");
            for (const auto& key : sf->keys())
            {
                const std::size_t i = thermo.indexOf(key);
                const scalar mflow = sf->lookupScalar(key, Dims::massFlow); // kg/s
                const scalar mw    = thermo.comp(i).MW();
                s.s[i] = (mw > 0.0) ? mflow / mw : 0.0;                     // kmol/s
            }
        }
        if (sol->found("diameters"))
        {
            s.psd.diameter = sol->lookupList("diameters");
            s.psd.massFrac = sol->lookupList("massFractions");
            scalar sm = 0.0; for (auto v : s.psd.massFrac) sm += v;
            if (sm > 0.0) for (auto& v : s.psd.massFrac) v /= sm;
        }
    }

    return s;
}

void printStream(const ProcessStream& s, const ThermoPackage& thermo)
{
    const auto& du = DisplayUnits::instance();
    // Flow: molar (kmol/s SI) or mass (kg/s SI, derived via MW_mix).
    const bool mass = du.flowBasis() == FlowBasis::Mass;
    const Dimensions Fdims = mass ? Dims::massFlow : Dims::molarFlow;
    const auto [F_disp, F_lbl] = mass
        ? du.convert(F_mass(s, thermo), Dims::massFlow)
      : du.convert(s.F,               Dims::molarFlow);
    const auto [T_disp, T_lbl] = du.convert(s.T, Dims::temperature);
    const auto [P_disp, P_lbl] = du.convert(s.P, Dims::pressure);
    const int pF    = du.precisionFor(Fdims);
    const int pT    = du.precisionFor(Dims::temperature);
    const int pP    = du.precisionFor(Dims::pressure);
    const int pComp = du.compositionPrecision();

    std::cout << "    " << std::left << std::setw(20) << s.name
              << " F = " << std::fixed << std::setprecision(pF)
              << std::setw(9) << F_disp << " " << F_lbl
              << "   T = " << std::setw(7) << std::setprecision(pT) << T_disp << " " << T_lbl
              << "   P = " << std::setw(7) << std::setprecision(pP) << P_disp << " " << P_lbl
              << "   vf = " << std::setprecision(3) << s.vf;

    // Solid phase: a powder / captured-solids stream carries its
    // mass in s[] (kmol/s of solid per species), NOT in the molar fluid
    // flow F.  Without this, a pure-solids stream prints F = 0 and looks
    // empty --- so print the solid mass flow explicitly when present.
    scalar solidMass = 0.0;
    for (std::size_t i = 0; i < s.s.size() && i < thermo.n(); ++i)
        solidMass += s.s[i] * thermo.comp(i).MW();          // kg/s
    if (solidMass > 0.0)
    {
        const auto [sm_disp, sm_lbl] = du.convert(solidMass, Dims::massFlow);
        std::cout << "   solids = " << std::setprecision(pF) << sm_disp << " " << sm_lbl;
    }
    std::cout << "\n";

    // Composition: x_i (mole fractions, the stored z) when molar basis,
    // w_i (mass fractions, derived as z_i * MW_i / Sigma_j z_j * MW_j)
    // when mass basis.  Labels switch too so the student sees `x_` or
    // `w_` and knows which set she is looking at.
    std::cout << "      " << std::setprecision(pComp);
    if (mass)
    {
        const scalar mw_mix = MWmix(s.z, thermo);
        for (std::size_t i = 0; i < s.z.size(); ++i)
        {
            const scalar wi = (mw_mix > 0)
                ? s.z[i] * thermo.comp(i).MW() / mw_mix
              : 0.0;
            std::cout << "w_" << thermo.comp(i).name() << "=" << wi << "  ";
        }
    }
    else
    {
        for (std::size_t i = 0; i < s.z.size(); ++i)
            std::cout << thermo.comp(i).name() << "=" << s.z[i] << "  ";
    }
    std::cout << "\n";
}

// ---------------------------------------------------------------------------
//  Helpers for building a stream's sub-dict (used by Mixer multi-input)
// ---------------------------------------------------------------------------
DictPtr streamToDict(const ProcessStream& s, const ThermoPackage& thermo)
{
    auto out = std::make_shared<Dictionary>(s.name);
    out->insert("F", s.F);
    out->insert("T", s.T);
    out->insert("P", s.P);
    // Utility identity travels with the stream: a unit fed by a categorised
    // carrier (heating steam, cooling water) can declare its RETURN leg as
    // the same utility (e.g. the evaporator condensate).
    if (!s.category.empty()) out->insert("category", s.category);
    out->insert("vf", s.vf);
    auto cd = std::make_shared<Dictionary>("composition");
    for (std::size_t i = 0; i < thermo.n(); ++i)
        cd->insert(thermo.comp(i).name(), s.z[i]);
    out->insert("composition", cd);

    // ---- Solid phase: serialise s[] (MOLAR, internal) + PSD ----
    bool hasSolid = false;
    for (auto v : s.s) if (v > 0.0) { hasSolid = true; break; }
    if (hasSolid || !s.psd.empty())
    {
        auto sol = std::make_shared<Dictionary>("solids");
        auto sf  = std::make_shared<Dictionary>("solidMolarFlows");
        for (std::size_t i = 0; i < thermo.n() && i < s.s.size(); ++i)
            if (s.s[i] != 0.0) sf->insert(thermo.comp(i).name(), s.s[i]);
        sol->insert("solidMolarFlows", sf);
        if (!s.psd.empty())
        {
            sol->insert("diameters", s.psd.diameter);
            sol->insert("massFractions", s.psd.massFrac);
        }
        out->insert("solids", sol);
    }
    return out;
}

// ---------------------------------------------------------------------------
// A tear stream declared inside a composite node.  Collected by
// flattenNode during recursive expansion and handed back to
// Flowsheet::solve, which seeds streams_[] with the initial guess and
// adds the qualified name to the outer-loop iteration list.  Internal
// recycle in a sector then works exactly like a flat-case recycle,
// with the tear name namespaced by its composite path.
struct CompositeTear
{
    std::string   qualifiedName;       // e.g. "FERMENTATION.Recycle"
    ProcessStream initial;              // initial guess from this composite's streams{}
};

//  Recursively flatten a fractal NODE into leaf units (fractal step 2/3).
//
//  A node is COMPOSITE (`children` + `connections` + `boundary`) or LEAF
//  (`type`).  We walk the tree, emitting one synthesised unit dict per LEAF
//  with a fully-qualified name (plant.sector.unit) and cabling each inlet to
//  its source per the `connections` at each level.  Returns this node's
//  boundary-outlet map { outlet -> global stream }, so its parent can resolve
//  `<child>/<outlet>` references.
//    nsPrefix : namespace prefix for stream/unit names ("" at the root,
//                 "concentration." inside the plant's first child,...).
//    folderPath : filesystem prefix to locate child folders ("" at the root
//                 [cwd is the case dir], "concentration/" one level down).
//    inletMap : this node's boundary-inlet name -> the global stream feeding it.
//    outTears : OUT.  Each composite (root + recursive children) appends its
//                 own `tearStreams` here with the initial guess read from its
//                 `streams {}` block.  Internal recycle within a sector
//                 becomes a flat-case-style tear after flattening.
//    thermo   : needed by readSourceStream to interpret tear initial guesses.
// ---------------------------------------------------------------------------
std::map<std::string,std::string> flattenNode(const DictPtr&                                  dict,
    const std::string&                              nsPrefix,
    const std::string&                              folderPath,
    const std::map<std::string,std::string>&        inletMap,
    std::vector<DictPtr>&                           units,
    std::vector<CompositeTear>&                     outTears,
    const ThermoPackage&                            thermo,
    const std::map<std::string, ProcessStream>&     streamReg)
{
    auto children = dict->lookupWordList("children");
    std::vector<DictPtr> conns;
    if (dict->found("connections")) conns = dict->lookupDictList("connections");

    // Tear streams declared at THIS composite's level: bare name (as
    // used in connections within this node) -> qualified name (used in
    // the global streams_ registry and the outer-loop iteration).
    std::map<std::string,std::string> tearMap;
    if (dict->found("tearStreams"))
    {
        auto tearNames = dict->lookupWordList("tearStreams");
        DictPtr streamsBlock;
        if (dict->found("streams")) streamsBlock = dict->subDict("streams");
        for (const auto& bareName : tearNames)
        {
            const std::string qname = nsPrefix.empty()
                                    ? bareName
                                    : nsPrefix + bareName;
            tearMap[bareName] = qname;
            if (!streamsBlock || !streamsBlock->found(bareName))
                throw std::runtime_error("Flowsheet: tear stream '" + bareName
                    + "' in composite node '"
                    + (nsPrefix.empty() ? std::string("root") : nsPrefix)
                    + "' has no initial guess in `streams { " + bareName + " { ... } }`");
            outTears.push_back({
                qname,
                readSourceStream(qname, streamsBlock->subDict(bareName), thermo)
            });
        }
    }

    auto sourceFor = [&](const std::string& target) -> std::string {
        for (const auto& c : conns)
            if (c->lookupWordOrDefault("to", "") == target)
                return c->lookupWordOrDefault("from", "");
        return "";
    };

    // childOutletMaps[child][outlet] = the global stream the child produces.
    std::map<std::string, std::map<std::string,std::string>> childOutletMaps;

    // Resolve a connection endpoint to a GLOBAL stream name.  A bare name is a
    // boundary inlet of THIS node (fed by the parent via inletMap); `child/port`
    // is a child output (the child must already have been processed --- children
    // are listed in flow order).
    auto resolveGlobal = [&](const std::string& ep) -> std::string {
        auto p = ep.find('/');
        if (p == std::string::npos)
        {
            auto it = inletMap.find(ep);
            if (it != inletMap.end()) return it->second;
            // Tear stream: a bare name declared in this composite's
            // `tearStreams` resolves to its initial-guess global name on
            // the first pass; subsequent passes use whatever the producing
            // unit wrote into the same global slot.  Same single-name
            // pattern that flat recycle cases use.
            auto tit = tearMap.find(ep);
            if (tit != tearMap.end()) return tit->second;
            throw std::runtime_error("Flowsheet: boundary inlet '" + ep
                + "' of node '" + nsPrefix + "' is not fed by the parent");
        }
        const std::string ch = ep.substr(0, p), port = ep.substr(p + 1);
        auto cit = childOutletMaps.find(ch);
        if (cit == childOutletMaps.end() || !cit->second.count(port))
            throw std::runtime_error("Flowsheet: connection source '" + ep
                + "' is an unknown child output (wrong order or name?)");
        return cit->second.at(port);
    };

    for (const auto& child : children)
    {
        DictPtr cd;
        const std::string folderDict = folderPath + child + "/system/flowsheetDict";
        if (std::filesystem::exists(folderDict)) cd = Dictionary::fromFile(folderDict);
        else if (dict->found(child))             cd = dict->subDict(child);
        else throw std::runtime_error("Flowsheet: child '" + child
            + "' has neither a folder (" + folderDict + ") nor an inline block");

        auto cb = cd->subDict("boundary");
        auto inlets = cb->lookupWordList("inlets");

        std::map<std::string,std::string> childInletMap;
        std::vector<std::string> qins;
        for (const auto& inl : inlets)
        {
            const std::string src = sourceFor(child + "/" + inl);
            if (src.empty())
                throw std::runtime_error("Flowsheet: child inlet '" + child
                    + "/" + inl + "' is not cabled by any connection");
            const std::string g = resolveGlobal(src);
            childInletMap[inl] = g;
            qins.push_back(g);
        }

        if (cd->found("type"))            // LEAF
        {
            const std::string qname = nsPrefix + child;

            // -----------------------------------------------------------
            //  Utility-port wiring validation.  Instantiate a throwaway
            //  unit op of this type so we can query its `utilityPorts()`;
            //  warn (non-fatal) when a process stream is cabled to a
            //  utility port or a utility stream is cabled to a process
            //  port.  Caught early it saves a student a confusing run.
            // -----------------------------------------------------------
            try {
                auto probe = UnitOperation::New(cd->lookupWord("type"));
                if (probe)
                {
                    const auto utilPorts = probe->utilityPorts();
                    std::set<std::size_t> utilPortSet(utilPorts.begin(),
                                                     utilPorts.end());
                    for (std::size_t i = 0; i < inlets.size(); ++i)
                    {
                        const std::string& g = qins[i];
                        auto sit = streamReg.find(g);
                        const bool srcIsUtility = (sit != streamReg.end())
                                                  && !sit->second.category.empty();
                        const bool portIsUtility = utilPortSet.count(i) > 0;
                        if (portIsUtility && !srcIsUtility)
                            std::cerr << "WARNING: unit '" << qname
                                      << "' input '" << inlets[i] << "' (index "
                                      << i << ") expects a UTILITY stream but is"
                                      << " cabled to a process stream '" << g
                                      << "' (no `category` -- did you forget"
                                      << " `utility <name>;`?)\n";
                        else if (!portIsUtility && srcIsUtility)
                            std::cerr << "WARNING: unit '" << qname
                                      << "' input '" << inlets[i] << "' (index "
                                      << i << ") is a process port but a utility"
                                      << " stream '" << g << "' (category="
                                      << sit->second.category
                                      << ") is cabled to it\n";
                    }
                }
            } catch (const std::exception&) {
                // Unknown type or probe failure: the regular leaf-build
                // code below will surface the same error with full
                // diagnostic context, so swallow here.
            }

            auto outlets = cb->lookupWordList("outlets");
            std::vector<std::string> qouts;
            std::map<std::string,std::string> omap;
            for (const auto& o : outlets)
            {
                // Default qualified name: <prefix>.<unit>.<port>.
                // OVERRIDE when a connection routes this output to a
                // tear stream of THIS composite: write directly into
                // the tear's qualified slot so the outer loop reads
                // the latest value from streams_[tearQ] each pass.
                std::string finalQ = qname + "." + o;
                const std::string srcEp = child + "/" + o;
                for (const auto& c : conns)
                {
                    if (c->lookupWordOrDefault("from", "") != srcEp) continue;
                    const std::string toEp = c->lookupWordOrDefault("to", "");
                    if (toEp.find('/') != std::string::npos) continue;
                    auto tit = tearMap.find(toEp);
                    if (tit != tearMap.end()) { finalQ = tit->second; break; }
                }
                qouts.push_back(finalQ);
                omap[o] = finalQ;
            }
            childOutletMaps[child] = omap;

            auto u = std::make_shared<Dictionary>(qname);
            u->insert("name", std::string(qname));
            u->insert("type", cd->entryValue("type"));
            for (const char* k : { "operation", "model", "thermo" })
                if (cd->found(k)) u->insert(k, cd->entryValue(k));
            // reaction: PER-NODE resolution (Item 0 of the props foundation).
            // A sector/unit's kinetics live WITH it (its own constant/reactions),
            // not only the plant root.  Resolve the named reference HERE from
            // the child's folder (same pattern as dryingCurve/crystallisation)
            // and carry the resolved sub-dict; the CSTR/PFR read an inline
            // `reaction {}` sub-dict, and buildAugmentedDict only does the global
            // lookup when `reaction` is still a string -- so a sub-dict here wins
            // and a bare name still falls through to the global library.
            if (cd->found("reaction"))
            {
                const auto& rv = cd->entryValue("reaction");
                bool resolved = false;
                if (std::holds_alternative<std::string>(rv))
                {
                    const std::string rp = folderPath + child + "/constant/reactions";
                    if (std::filesystem::exists(rp))
                    {
                        auto rlib = Dictionary::fromFile(rp);
                        const std::string rn = std::get<std::string>(rv);
                        if (rlib->found(rn)) { u->insert("reaction", rlib->entryValue(rn)); resolved = true; }
                    }
                }
                if (!resolved) u->insert("reaction", rv);  // bare name -> global library
            }
            // dryingCurve: the kinetics live WITH the unit (its own
            // constant/dryingKinetics), not the sector --- so resolve the
            // named reference HERE, from the child's folder, and carry the
            // resolved sub-dict (buildAugmentedDict leaves a sub-dict alone).
            if (cd->found("dryingCurve"))
            {
                const auto& dv = cd->entryValue("dryingCurve");
                bool resolved = false;
                if (std::holds_alternative<std::string>(dv))
                {
                    const std::string dk = folderPath + child + "/constant/dryingKinetics";
                    if (std::filesystem::exists(dk))
                    {
                        auto dlib = Dictionary::fromFile(dk);
                        const std::string dn = std::get<std::string>(dv);
                        if (dlib->found(dn)) { u->insert("dryingCurve", dlib->entryValue(dn)); resolved = true; }
                    }
                }
                if (!resolved) u->insert("dryingCurve", dv);  // leave for global resolution
            }
            // crystallisation: same pattern as dryingCurve --- the
            // nucleation / growth kinetics live with the unit in its
            // own constant/crystallisation library.  Resolve from the
            // child's folder when running a parent composite (the
            // plant root doesn't carry per-unit kinetics) so the
            // Crystalliser(MSMPR) finds its sucroseKinetics block.
            if (cd->found("crystallisation"))
            {
                const auto& kv = cd->entryValue("crystallisation");
                bool resolved = false;
                if (std::holds_alternative<std::string>(kv))
                {
                    const std::string kp = folderPath + child + "/constant/crystallisation";
                    if (std::filesystem::exists(kp))
                    {
                        auto klib = Dictionary::fromFile(kp);
                        const std::string kn = std::get<std::string>(kv);
                        if (klib->found(kn)) { u->insert("crystallisation", klib->entryValue(kn)); resolved = true; }
                    }
                }
                if (!resolved) u->insert("crystallisation", kv);  // leave for global resolution
            }
            // binaryPairs: PER-NODE resolution (Item 0b).  If this node owns a
            // constant/binaryPairs folder, hand its base path to the unit's
            // thermo so NRTL searches the node FIRST (a sector/unit's
            // PARTICULAR pair beats the plant root + the standard library).
            // Carried via the per-unit `thermo {}` override (thermoFor), so it
            // only affects units that actually own local pairs.
            {
                const std::string nodeBase = folderPath + child;
                if (std::filesystem::exists(nodeBase + "/constant/binaryPairs"))
                {
                    DictPtr th = u->found("thermo")
                        ? u->subDict("thermo")
                        : std::make_shared<Dictionary>("thermo");
                    th->insert("binaryPairsBase", std::string(nodeBase));
                    if (!u->found("thermo")) u->insert("thermo", EntryValue(th));
                }
            }
            if (qins.size() == 1) u->insert("in", std::string(qins[0]));
            else                  u->insert("inputs", EntryValue(qins));
            u->insert("outputs", EntryValue(qouts));
            units.push_back(u);
        }
        else if (cd->found("children"))   // COMPOSITE child -> recurse
        {
            childOutletMaps[child] = flattenNode(cd, nsPrefix + child + ".", folderPath + child + "/",
                childInletMap, units, outTears, thermo, streamReg);
        }
        else
            throw std::runtime_error("Flowsheet: child '" + child
                + "' is neither a leaf (`type`) nor a composite (`children`)");
    }

    // This node's boundary-outlet map: connections whose `to` is a bare name.
    // A bare name that's actually a TEAR (this composite's own internal recycle)
    // is NOT a boundary outlet -- it's internal -- so we skip it; the parent
    // never sees it.
    std::map<std::string,std::string> myOutletMap;
    for (const auto& c : conns)
    {
        const std::string to   = c->lookupWordOrDefault("to", "");
        const std::string from = c->lookupWordOrDefault("from", "");
        if (to.find('/') == std::string::npos && from.find('/') != std::string::npos)
        {
            if (tearMap.count(to)) continue;       // tear, not a boundary outlet
            myOutletMap[to] = resolveGlobal(from);
        }
    }
    return myOutletMap;
}

// ---------------------------------------------------------------------------
//  Augment a unit's user dict with feed/composition (single-input) or
//  inputStreams (multi-input), solver defaults, and resolved reaction ref.
// ---------------------------------------------------------------------------
DictPtr buildAugmentedDict(const DictPtr&                          udict,
    const std::string&                      utype,
    const std::map<std::string,ProcessStream>& streams,
    const ThermoPackage&                    thermo,
    const DictPtr&                          solverDict,
    const DictPtr&                          reactionsDict,
    const DictPtr&                          dryingDict,
    const DictPtr&                          crystDict)
{
    auto out = std::make_shared<Dictionary>(udict->lookupWord("name"));
    out->setSource("flowsheet-augmented");

    // 1.  Copy user entries (skip meta and reserved names)
    for (const auto& key : udict->keys())
    {
        if (key == "name" || key == "type"
         || key == "in"   || key == "inputs" || key == "outputs"
         || key == "feed" || key == "composition" || key == "inputStreams"
         || key == "energyInputs" || key == "energyOutputs")  // wires
            continue;
        out->insert(key, udict->entryValue(key));
    }

    // Make the DECLARED output names visible to the unit op: a few ops adapt
    // their product set to how many outputs the case declares (e.g. an
    // equilibrium crystalliser gives ONE `magma` or TWO `crystals`+`motherLiquor`).
    if (udict->found("outputs"))
        out->insert("outputs", udict->entryValue("outputs"));

    // 2.  Merge solver defaults
    if (solverDict && solverDict->found(utype))
    {
        auto sd = solverDict->subDict(utype);
        for (const auto& key : sd->keys())
            if (!out->found(key))
                out->insert(key, sd->entryValue(key));
    }

    // 3.  Resolve named-reaction reference
    if (out->found("reaction"))
    {
        const auto& v = out->entryValue("reaction");
        if (std::holds_alternative<std::string>(v))
        {
            const std::string rxnName = std::get<std::string>(v);
            if (!reactionsDict || !reactionsDict->found(rxnName))
                throw std::runtime_error("Flowsheet: reaction '"
                    + rxnName + "' not in constant/reactions");
            out->insert("reaction", reactionsDict->entryValue(rxnName));
        }
    }

    // 3b. Resolve named drying-curve reference (drying KINETICS --- the
    //     characteristic drying curve + critical moisture --- kept separate
    //     from the material's equilibrium sorption isotherm, exactly like a
    //     reaction's kinetics is kept in constant/reactions).
    if (out->found("dryingCurve"))
    {
        const auto& v = out->entryValue("dryingCurve");
        if (std::holds_alternative<std::string>(v))
        {
            const std::string name = std::get<std::string>(v);
            if (!dryingDict || !dryingDict->found(name))
                throw std::runtime_error("Flowsheet: drying curve '"
                    + name + "' not in constant/dryingKinetics");
            out->insert("dryingCurve", dryingDict->entryValue(name));
        }
    }

    // 3c. Resolve named crystallisation-kinetics reference (the nucleation /
    //     growth kinetics that set the PSD --- kept separate from the
    //     solute's equilibrium solubility curve on the.dat, exactly like a
    //     reaction's kinetics live in constant/reactions).
    if (out->found("crystallisation"))
    {
        const auto& v = out->entryValue("crystallisation");
        if (std::holds_alternative<std::string>(v))
        {
            const std::string name = std::get<std::string>(v);
            if (!crystDict || !crystDict->found(name))
                throw std::runtime_error("Flowsheet: crystallisation kinetics '"
                    + name + "' not in constant/crystallisation");
            out->insert("crystallisation", crystDict->entryValue(name));
        }
    }

    // 4.  Inject inputs (single `in` or multi `inputs (...)`)
    if (udict->found("inputs"))
    {
        auto names = udict->lookupWordList("inputs");
        std::vector<DictPtr> dicts;
        for (const auto& n : names)
        {
            if (streams.find(n) == streams.end())
                throw std::runtime_error("Flowsheet: input stream '" + n
                    + "' not in registry");
            dicts.push_back(streamToDict(streams.at(n), thermo));
        }
        out->insert("inputStreams", dicts);
    }
    else if (udict->found("in"))
    {
        const std::string inName = udict->lookupWord("in");
        if (streams.find(inName) == streams.end())
            throw std::runtime_error("Flowsheet: input stream '" + inName
                + "' not in registry");
        const auto& s = streams.at(inName);

        auto feed = std::make_shared<Dictionary>("feed");
        feed->insert("F",     s.F);
        feed->insert("T",     s.T);
        feed->insert("Tfeed", s.T);
        feed->insert("P",     s.P);
        feed->insert("Pfeed", s.P);
        out->insert("feed", feed);

        feed->insert("vf", s.vf);

        auto comp = std::make_shared<Dictionary>("composition");
        for (std::size_t i = 0; i < thermo.n(); ++i)
            comp->insert(thermo.comp(i).name(), s.z[i]);
        out->insert("composition", comp);

        // Solid phase: serialise s[] (MOLAR) + PSD for the unit.
        bool hasSolid = false;
        for (auto v : s.s) if (v > 0.0) { hasSolid = true; break; }
        if (hasSolid || !s.psd.empty())
        {
            auto sol = std::make_shared<Dictionary>("solids");
            auto sf  = std::make_shared<Dictionary>("solidMolarFlows");
            for (std::size_t i = 0; i < thermo.n() && i < s.s.size(); ++i)
                if (s.s[i] != 0.0) sf->insert(thermo.comp(i).name(), s.s[i]);
            sol->insert("solidMolarFlows", sf);
            if (!s.psd.empty())
            {
                sol->insert("diameters", s.psd.diameter);
                sol->insert("massFractions", s.psd.massFrac);
            }
            out->insert("solids", sol);
        }
    }
    // No `in` and no `inputs`: legal for passive shaft sinks like
    // `electricLoad` that cross only an energy wire.  The augmented
    // dict simply carries no inputStreams / feed block; the unit's
    // solve() reads its KPI inputs through the wire-injected
    // `operation.<target>` keys.

    return out;
}

// ---------------------------------------------------------------------------
//  Energy-wire resolution (Option C just-wiring).  The consumer
//  unit declares `energyInputs ( { from <srcUnit>.<srcPort>; kind <work|heat>;
//  target <operation-key>; } );`.  The producer declares
//  `energyOutputs ( { name <srcPort>; kind <...>; expression <expr>; } );`.
//  Before the consumer's solve(), we evaluate the expression in the
//  producer's local scope (its operation values + its KPIs) and write
//  the resulting scalar into the consumer's `operation.<target>` key.
//  The unit's solve() then reads it exactly as if the user had written it.
//
//  Returns the list of resolved wires for bookkeeping (the EnergyStreams
//  report).  Throws on a mis-declared wire (missing endpoint, kind
//  mismatch, or unsolved producer).
// ---------------------------------------------------------------------------
std::vector<EnergyWire> resolveEnergyInputs(const DictPtr&                                          udict,
    const std::vector<DictPtr>&                             units,
    const std::map<std::string,std::map<std::string,scalar>>& unitKpis)
{
    std::vector<EnergyWire> resolved;
    if (!udict->found("energyInputs")) return resolved;

    // A shaft NODE sums several work inputs onto one target: e.g. a generator
    // on a gas-turbine shaft receives the turbine's gross work (+) AND the
    // compressor's load (-), netting to the power delivered.  So when a SECOND
    // energyInput targets a key already written this pass, we ACCUMULATE
    // instead of overwriting.  (One input -> plain set, as before.)
    std::set<std::string> writtenTargets;
    auto applyToTarget = [&](const std::string& target, scalar value)
    {
        auto oper = udict->subDict("operation");
        if (writtenTargets.count(target))
            value += oper->lookupScalarOrDefault(target, 0.0);   // shaft sum
        udict->setScalarAtPath("operation." + target, value);
        oper->setDimensions(target, Dims::power);
        writtenTargets.insert(target);
    };

    const std::string consumerName = udict->lookupWord("name");
    auto eins = udict->lookupDictList("energyInputs");
    for (const auto& ein : eins)
    {
        // "<srcUnit>.<srcPort>"
        const std::string from   = ein->lookupWord("from");
        const std::string target = ein->lookupWord("target");
        const std::string kind   = ein->lookupWordOrDefault("kind", "work");

        const auto dot = from.find('.');
        if (dot == std::string::npos)
            throw std::runtime_error("Flowsheet: energyInput on unit '"
                + consumerName + "' has malformed `from " + from
                + "` --- expected `<unit>.<port>`");
        const std::string srcUnit = from.substr(0, dot);
        const std::string srcPort = from.substr(dot + 1);

        // Find the source unit's declaration.
        DictPtr srcDict;
        for (const auto& u : units)
            if (u->lookupWord("name") == srcUnit) { srcDict = u; break; }
        if (!srcDict)
            throw std::runtime_error("Flowsheet: energyInput on unit '"
                + consumerName + "' refers to source unit '" + srcUnit
                + "' which is not declared");

        // Distillation columns expose two INTRINSIC heat ports --- the
        // condenser (rejected heat, +; heats the consumer) and the reboiler
        // (heat demand, -; a unit supplying it is cooled).  No energyOutputs
        // block needed: the value IS the column's duty KPI.  Heat integration
        // wires onto a column the SAME consumer-side way as every other
        // energy link, so the student learns one rule.  Forward links only:
        // the column must already have solved (a feedback link --- e.g. the
        // condenser preheating the column's own feed --- is an energy tear,
        // handled in a later step).
        const std::string srcType = srcDict->lookupWordOrDefault("type", "");
        if ((srcType == "distillationColumn" || srcType == "shortcutColumn")
            && (srcPort == "condenser" || srcPort == "reboiler"))
        {
            if (kind != "heat")
                throw std::runtime_error("Flowsheet: heat-link '" + from + " -> "
                    + consumerName + "' must be `kind heat` --- a column's "
                    + srcPort + " is a heat port");
            const auto& km = unitKpis.count(srcUnit) ? unitKpis.at(srcUnit)
                                                     : std::map<std::string,scalar>{};
            const std::string kpiKey =
                (srcPort == "condenser") ? "Q_condenser_kW" : "Q_reboiler_kW";
            auto it = km.find(kpiKey);
            // FORWARD link: the column has already solved this pass -> use its
            // duty.  FEEDBACK link (the column is downstream of this consumer,
            // e.g. its condenser preheats the column's own feed): the duty is
            // not known yet on the first pass -> use 0 as the initial guess.
            // `unitKpis` PERSISTS across recycle sweeps, so on later passes
            // `it` finds the previous pass's value and the energy tear
            // converges by successive substitution (the outer loop is forced
            // on when a feedback link is present; see the solve dispatch).
            const scalar dutyKW = (it != km.end()) ? it->second : 0.0;
            // Heat available to the consumer: condenser rejects (+ heats),
            // reboiler demands (- cools whoever supplies it).  kW -> W.
            const scalar value = -dutyKW * 1000.0;
            applyToTarget(target, value);
            EnergyWire w;
            w.fromUnit = srcUnit;  w.fromPort = srcPort;
            w.toUnit   = consumerName;  w.toTarget = target;
            w.kind     = "heat";  w.value = value;
            resolved.push_back(std::move(w));
            continue;
        }

        // Locate the matching energyOutputs entry on the source.
        if (!srcDict->found("energyOutputs"))
            throw std::runtime_error("Flowsheet: source unit '" + srcUnit
                + "' has no `energyOutputs` block, but '" + consumerName
                + "' tries to read its port '" + srcPort + "'");
        auto eouts = srcDict->lookupDictList("energyOutputs");
        DictPtr eout;
        for (const auto& eo : eouts)
            if (eo->lookupWord("name") == srcPort) { eout = eo; break; }
        if (!eout)
            throw std::runtime_error("Flowsheet: source unit '" + srcUnit
                + "' declares no energyOutputs port named '" + srcPort + "'");

        // Validate kind match (typed ports: a `work` wire cannot connect
        // to a `heat` input --- caught here, at build time).
        const std::string srcKind = eout->lookupWordOrDefault("kind", "work");
        if (srcKind != kind)
            throw std::runtime_error("Flowsheet: energy wire '" + from
                + " -> " + consumerName + "." + target + "' kind mismatch"
                  " --- producer is '" + srcKind + "', consumer expects '"
                + kind + "'");

        // Build the resolver scope: producer's operation values FIRST
        // (the hardware spec --- e.g. turbine.operation.W_shaft), then its
        // KPIs (results --- e.g. eta_isen, T_out).  Dotted identifiers are
        // not supported  (local scope only); the user can build
        // any cross-unit dependency via DesignSpec.
        DictPtr srcOper = srcDict->subDict("operation");
        const auto& srcKpiMap = unitKpis.count(srcUnit)
                                ? unitKpis.at(srcUnit)
                              : std::map<std::string,scalar>{};

        auto resolve = [&](const std::string& name) -> scalar
        {
            if (srcOper->found(name))
                return srcOper->lookupScalar(name);
            auto it = srcKpiMap.find(name);
            if (it != srcKpiMap.end()) return it->second;
            throw std::runtime_error("Flowsheet: energy expression on '"
                + srcUnit + "." + srcPort + "' references unknown identifier"
                  " '" + name + "' (not in producer's operation or KPIs)");
        };

        const std::string expr = eout->lookupWord("expression");
        const scalar value = evalExpr(expr, resolve);

        // Inject into the consumer's operation block (summing onto the target
        // if a shaft node receives several work inputs); applyToTarget also
        // marks the entry's dimensions so `lookupScalar(..., Dims::power)`
        // accepts it.
        applyToTarget(target, value);

        EnergyWire w;
        w.fromUnit = srcUnit;
        w.fromPort = srcPort;
        w.toUnit   = consumerName;
        w.toTarget = target;
        w.kind     = kind;
        w.value    = value;
        resolved.push_back(std::move(w));
    }
    return resolved;
}

// ---------------------------------------------------------------------------
//  Execute a single unit op, register its produced streams under the
//  user-given names.  Used both in single-pass and Wegstein-outer modes.
// ---------------------------------------------------------------------------
void runUnit(const DictPtr&                                          udict,
             std::map<std::string,ProcessStream>&                     streams,
             std::map<std::string,std::map<std::string,scalar>>&      unitKpis,
             std::map<std::string,std::vector<scalar>>&               unitResiduals,
             std::map<std::string,UnitProfile>&                       unitProfiles,
             const ThermoPackage&                                     thermo,
             const DictPtr&                                           solverDict,
             const DictPtr&                                           reactionsDict,
             const DictPtr&                                           dryingDict,
             const DictPtr&                                           crystDict,
             int                                                      verbosity,
             int                                                      unitIdx,
             bool                                                     quiet)
{
    const std::string uname  = udict->lookupWord("name");
    const std::string utype  = udict->lookupWord("type");
    // Some unit ops (the passive shaft sinks like `electricLoad`) carry
    // no process streams across their boundary — only an energy wire.
    // Missing `outputs` is harmless for those: the producedStreams()
    // contract returns an empty list and the iteration below skips
    // cleanly.  Default to an empty list when omitted.
    std::vector<std::string> outputs;
    if (udict->found("outputs"))
        outputs = udict->lookupWordList("outputs");

    if (!quiet)
    {
        std::cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n"
                  << ">>>  Unit [" << unitIdx << "]:  " << uname
                  << "   (type = " << utype << ")\n";
        std::cout << ">>>  ";
        if (udict->found("inputs"))
        {
            std::cout << "Inputs: ";
            for (const auto& n : udict->lookupWordList("inputs"))
                std::cout << n << "  ";
        }
        else if (udict->found("in"))
            std::cout << "Input: " << udict->lookupWord("in");
        else
            std::cout << "(no process streams; energy-wire only)";
        std::cout << "  →  ";
        for (const auto& on : outputs) std::cout << on << "  ";
        // Thermo-model provenance (the cascade made LOUD): which model this
        // unit runs, and whether it INHERITS the global package or carries a
        // LOCAL `thermo {}` override.  Inheritance-by-omission is otherwise
        // invisible; glass-box says show it.  See CLAUDE.md sec.10.
        std::cout << "\n>>>  thermo: ";
        if (udict->found("thermo"))
        {
            std::cout << "LOCAL override —";
            auto th = udict->subDict("thermo");
            for (const auto& k : th->keys())
            {
                std::string m = "?";
                try { m = th->subDict(k)->lookupWordOrDefault("model", "?"); }
                catch (const std::exception&) {}
                std::cout << " " << k << "=" << m;
            }
            std::cout << "  (components inherited)";
        }
        else
            std::cout << "inherited (global package)";
        std::cout << "\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n";
    }

    auto augmented = buildAugmentedDict(udict, utype, streams, thermo, solverDict, reactionsDict, dryingDict, crystDict);

    auto unit = UnitOperation::New(utype);

    // Silence inner logs during outer Wegstein iterations except the last one
    int vUsed = quiet ? 0 : verbosity;
    int rc = unit->solve(augmented, thermo, vUsed);
    if (rc != 0)
        throw std::runtime_error("Flowsheet: unit '" + uname
            + "' failed to converge");

    auto produced = unit->producedStreams();
    if (produced.size() < outputs.size())
        throw std::runtime_error("Flowsheet: unit '" + uname + "' produced "
            + std::to_string(produced.size()) + " streams but "
            + std::to_string(outputs.size()) + " names declared");

    // Inherit P from first input if unit did not set it
    scalar P_inherit = 1.0;
    if (udict->found("in"))
        P_inherit = streams.at(udict->lookupWord("in")).P;
    else if (udict->found("inputs"))
        P_inherit = streams.at(udict->lookupWordList("inputs").front()).P;

    for (std::size_t k = 0; k < outputs.size(); ++k)
    {
        ProcessStream s = produced[k];
        s.name = outputs[k];
        if (s.P <= 0.0) s.P = P_inherit;
        streams[outputs[k]] = s;
    }

    // Capture KPIs declared by this unit op (empty if it didn't override kpis()).
    unitKpis[uname] = unit->kpis();

    // Convergence history (per-iteration residuals).  Empty for algebraic
    // units; pushed by iterative ones via UnitOperation::recordResidual.
    // For tear-stream Wegstein passes the unit op is invoked multiple
    // times: keep the latest history so the GUI sees the final pass.
    const auto& rh = unit->residuals();
    if (!rh.empty()) unitResiduals[uname] = rh;

    // Internal 1-D profile (PFR axial sweep, future column stage table).
    // Same overwrite-on-each-pass policy as residuals.
    if (auto p = unit->profile(); p.has_value())
        unitProfiles[uname] = *p;

    // Demand-driven input writeback.  If the unit op reported
    // how much it consumed of each input (e.g. evaporator's heating-
    // chest demand), AND the corresponding stream was declared as
    // demand-driven (state saturatedVapour without an F), copy the
    // computed F back to the stream registry so the Streams panel
    // shows the actual demand instead of zero.
    auto consumed = unit->consumedInputs();
    if (!consumed.empty() && udict->found("inputs"))
    {
        auto inputNames = udict->lookupWordList("inputs");
        for (const auto& [idx, F_kmol_s] : consumed)
        {
            if (idx >= inputNames.size()) continue;
            auto& stream = streams.at(inputNames[idx]);
            if (stream.demandDriven) stream.F = F_kmol_s;
        }
    }
}

// ---------------------------------------------------------------------------
//  Pack / unpack the tear-stream vector for Wegstein
//  Per tear stream we expose:  [F,  z_0, z_1,..., z_{n-1},  T]
// ---------------------------------------------------------------------------
// ---- Author-declared stream bounds (Slice 2) -------------------------------
// A stream block may carry an optional `bounds {}` sub-dict with absolute
// per-variable cages, reusing the {min;max}+unit grammar of DesignSpec:
//     bounds { F { min 0 kmol/h; max 20 kmol/h; }  T { min 300 K; max 420 K; } }
// These are OPTIONAL aids: a TEAR iterate is clamped into the cage and the
// clamp is ANNOUNCED when it binds (no silent crutch -- a bound active at the
// solution means the spec, not the solver, is the constraint).  Slice 2 reads
// absolute F/T bounds on tear streams; relative/rating bounds + non-tear +
// per-component bounds are later slices.
// A bound is either ABSOLUTE (lo/hi are SI values, e.g. `max 20 kmol/h`) or
// RELATIVE (Slice 3): `reference <alias>; max 120 %;` -- lo/hi are FRACTIONS of
// a FROZEN reference value (the `%` unit makes 120 % parse to 1.2).  The
// reference must be a frozen quantity (feedTotal / feedMax / feedMin /
// feedMean / <feed>.T / <feed>.F), NEVER the moving iterate.  resolveRelative()
// turns a relative bound into concrete SI lo/hi once the feeds are frozen, so
// all downstream cage/check logic sees plain SI.
struct VarBound
{
    bool hasMin = false, hasMax = false;
    scalar lo = 0.0, hi = 0.0;          // SI (absolute, or resolved relative)
    bool relative = false;
    // How the relative bound combines with the frozen reference:
    //   additive=false  MULTIPLICATIVE -- loRel/hiRel are dimensionless
    //                   FRACTIONS (flow, a ratio scale): lo = loRel * ref.
    //   additive=true   ADDITIVE       -- loRel/hiRel are signed SI OFFSETS
    //                   (temperature, an interval scale): lo = ref + loRel.
    // The student chose this (small round): flow SCALES (x), temperature
    // SHIFTS (+/- K).  The kind is fixed by the bounded variable + the value's
    // dimensions (a dimensionless value on a T bound is a parse error).
    bool additive = false;
    scalar loRel = 0.0, hiRel = 0.0;    // fraction (additive=false) or SI offset (true)
    std::string reference;
};
struct StreamBounds { VarBound F, T; bool any = false; };

static VarBound parseVarBound(const DictPtr& bd, const char* key)
{
    VarBound vb;
    if (!bd->found(key)) return vb;
    auto sub = bd->subDict(key);
    if (sub->found("reference"))
    {
        vb.relative  = true;
        vb.reference = sub->lookupWord("reference");
        if (vb.reference == "iterateMean" || vb.reference == "iterate"
            || vb.reference == "current")
            throw std::runtime_error("Flowsheet: bounds `reference " + vb.reference +
                "` is forbidden -- a relative bound must use a FROZEN reference"
                " (feedTotal / feedMax / feedMin / feedMean / <feed>.F / <feed>.T),"
                " never the moving iterate (it would oscillate and hurt convergence).");
        // The combination kind is fixed by the bounded variable (student round):
        //  - FLOW is a ratio scale -> MULTIPLICATIVE: min/max are dimensionless
        //    FRACTIONS (`min 0.1; max 8;` = 0.1x..8x).  No `%` token (common in
        //    dict comments); 5 % is simply 0.05.
        //  - TEMPERATURE is an interval scale -> ADDITIVE: min/max are signed K
        //    OFFSETS (`min -10 K; max +15 K;` = [ref-10, ref+15]).  A fraction of
        //    T is meaningless, so a dimensionless value is REJECTED here by the
        //    dimension check (lookupScalar with Dims::temperature throws).
        if (std::string(key) == "F")
        {
            vb.additive = false;
            if (sub->found("min")) { vb.hasMin = true; vb.loRel = sub->lookupScalar("min"); }
            if (sub->found("max")) { vb.hasMax = true; vb.hiRel = sub->lookupScalar("max"); }
        }
        else if (std::string(key) == "T")
        {
            vb.additive = true;
            // The offset MUST carry an explicit temperature unit (K).  A bare
            // number would be silently taken as canonical SI (the dict's "raw
            // SI" convention), so a student who wrote `min 0.9` meaning a
            // fraction would get a 0.9 K offset -- exactly the silent surprise
            // the students' rejection guards against.  dimensionsOf() throws if
            // no unit was declared; we turn that into a clear message.
            auto kOffset = [&](const char* mk) -> scalar {
                Dimensions d;
                try { d = sub->dimensionsOf(mk); }
                catch (const std::exception&)
                {
                    throw std::runtime_error(std::string("Flowsheet: relative T bound '")
                        + mk + "' must be a signed K OFFSET with an explicit unit"
                        " (e.g. " + mk + " -10 K), not a bare number -- a fraction of"
                        " temperature is meaningless (T is an interval scale).");
                }
                if (d != Dims::temperature)
                    throw std::runtime_error(std::string("Flowsheet: relative T bound '")
                        + mk + "' must be a temperature offset in K, e.g. " + mk + " -10 K.");
                return sub->lookupScalar(mk);   // SI: K offset
            };
            if (sub->found("min")) { vb.hasMin = true; vb.loRel = kOffset("min"); }
            if (sub->found("max")) { vb.hasMax = true; vb.hiRel = kOffset("max"); }
        }
        else
            throw std::runtime_error(std::string("Flowsheet: a relative bound is not"
                " supported for '") + key + "' (only F as a fraction, T as a K offset)."
                "  Use an absolute bound, e.g. " + key + " { min ..; max ..; }.");
    }
    else
    {
        if (sub->found("min")) { vb.hasMin = true; vb.lo = sub->lookupScalar("min"); }
        if (sub->found("max")) { vb.hasMax = true; vb.hi = sub->lookupScalar("max"); }
    }
    return vb;
}

static StreamBounds parseStreamBounds(const DictPtr& streamDict)
{
    StreamBounds b;
    if (streamDict && streamDict->found("bounds"))
    {
        auto bd = streamDict->subDict("bounds");
        b.F = parseVarBound(bd, "F");
        b.T = parseVarBound(bd, "T");
        b.any = b.F.hasMin || b.F.hasMax || b.T.hasMin || b.T.hasMax;
    }
    return b;
}

// Resolve a relative bound's FROZEN reference to an SI value.  `field` is 'F'
// or 'T' so the feed aggregate is taken of the right quantity (feedMax of T =
// the hottest feed).  Feeds = the non-tear streams carrying flow.
static scalar resolveReferenceValue(const std::string& ref, char field,
    const std::map<std::string,ProcessStream>& streams,
    const std::set<std::string>& tearSet)
{
    if (ref == "feedTotal")
    {
        if (field != 'F')
            throw std::runtime_error("Flowsheet: bounds reference `feedTotal` is a"
                " flow sum -- use feedMax / feedMin / feedMean for a T bound.");
        scalar sum = 0.0;
        for (const auto& [nm, s] : streams) if (!tearSet.count(nm)) sum += s.F;
        return sum;
    }
    if (ref == "feedMax" || ref == "feedMin" || ref == "feedMean")
    {
        scalar acc = (ref == "feedMax") ? -1e300 : (ref == "feedMin") ? 1e300 : 0.0;
        std::size_t n = 0;
        for (const auto& [nm, s] : streams)
        {
            if (tearSet.count(nm) || s.F <= 0.0) continue;        // real feeds only
            const scalar v = (field == 'T') ? s.T : s.F;
            ++n;
            if      (ref == "feedMax") acc = std::max(acc, v);
            else if (ref == "feedMin") acc = std::min(acc, v);
            else                       acc += v;
        }
        if (n == 0)
            throw std::runtime_error("Flowsheet: bounds reference `" + ref +
                "` has no feeds to aggregate.");
        return (ref == "feedMean") ? acc / static_cast<scalar>(n) : acc;
    }
    const auto dot = ref.find('.');                              // <feed>.F / <feed>.T
    if (dot != std::string::npos)
    {
        const std::string fn = ref.substr(0, dot), fld = ref.substr(dot + 1);
        auto it = streams.find(fn);
        if (it == streams.end())
            throw std::runtime_error("Flowsheet: bounds reference `" + ref +
                "` names an unknown stream '" + fn + "'.");
        if (fld == "F") return it->second.F;
        if (fld == "T") return it->second.T;
        throw std::runtime_error("Flowsheet: bounds reference `" + ref +
            "` field must be .F or .T.");
    }
    throw std::runtime_error("Flowsheet: bounds reference `" + ref + "` unknown -- use"
        " feedTotal / feedMax / feedMin / feedMean / <feed>.F / <feed>.T.");
}

// Turn a stream's RELATIVE bounds into concrete SI lo/hi against the frozen
// feeds.  Called once per solve (and once per sweep point, since SweepDriver
// re-parses + re-solves -- so a relative band auto-scales across the sweep).
static void resolveStreamBounds(StreamBounds& b,
    const std::map<std::string,ProcessStream>& streams,
    const std::set<std::string>& tearSet)
{
    auto res = [&](VarBound& vb, char field) {
        if (!vb.relative) return;
        const scalar r = resolveReferenceValue(vb.reference, field, streams, tearSet);
        // ADDITIVE (T, interval scale): ref + offset.  MULTIPLICATIVE (F, ratio
        // scale): fraction * ref.
        if (vb.additive)
        {
            if (vb.hasMin) vb.lo = r + vb.loRel;
            if (vb.hasMax) vb.hi = r + vb.hiRel;
        }
        else
        {
            if (vb.hasMin) vb.lo = vb.loRel * r;
            if (vb.hasMax) vb.hi = vb.hiRel * r;
        }
        if (vb.hasMin && vb.hasMax && vb.lo > vb.hi)
            throw std::runtime_error("Flowsheet: relative bound min > max after"
                " resolving against its reference.");
    };
    res(b.F, 'F');
    res(b.T, 'T');
}

// Clamp a tear stream into its author cage (total F + T), announcing each
// bind.  Composition z is untouched -- clamping the total flow scales every
// component flow together, preserving the mixture.  F is shown in kmol/h (the
// basis authors write); T in K.
static void applyStreamBounds(ProcessStream& s, const StreamBounds& b,
                              const std::string& name, bool announce)
{
    auto clamp1 = [&](scalar& v, const VarBound& vb, const char* var,
                      scalar disp, const char* unit) {
        if (vb.hasMax && v > vb.hi)
        {
            if (announce)
                std::cout << "  [bound] tear '" << name << "': " << var
                          << " caged to your max " << std::fixed << std::setprecision(3)
                          << vb.hi * disp << " " << unit
                          << " during the recycle solve (author bound)\n";
            v = vb.hi;
        }
        else if (vb.hasMin && v < vb.lo)
        {
            if (announce)
                std::cout << "  [bound] tear '" << name << "': " << var
                          << " caged to your min " << std::fixed << std::setprecision(3)
                          << vb.lo * disp << " " << unit
                          << " during the recycle solve (author bound)\n";
            v = vb.lo;
        }
    };
    clamp1(s.F, b.F, "F", 3600.0, "kmol/h");
    clamp1(s.T, b.T, "T", 1.0, "K");
}

// Post-convergence sanity check: does the PHYSICAL converged stream value
// violate an author bound?  The cage shapes the SEARCH, but the recycle stream
// is an OUTPUT (the splitter computes it), so the converged value is physical
// and may lie outside the cage -- which is the meaningful signal: the cage
// excludes the physical solution, so the spec (not the solver) is the limit.
// Loud WARN, never silent, never faked.
// Format a scalar to 3 decimals without <sstream> (clang/WASM dislikes
// std::ostringstream in this TU); used to build advisory-message strings.
static std::string num3(scalar v)
{
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.3f", static_cast<double>(v));
    return std::string(buf);
}

static void checkBoundsAtSolution(const ProcessStream& s, const StreamBounds& b,
                                  const std::string& name)
{
    auto chk = [&](scalar v, const VarBound& vb, const char* var,
                   scalar disp, const char* unit) {
        if (vb.hasMax && v > vb.hi * (1.0 + 1e-6))
        {
            const std::string msg = std::string("converged ") + var + " = "
                + num3(v * disp) + " " + unit + " EXCEEDS your max "
                + num3(vb.hi * disp) + " " + unit
                + " -- the bound excludes the physical solution; widen it or revisit the spec";
            std::cout << "  [bound] WARNING: tear '" << name << "': " << msg << "\n";
            AdvisoryLog::instance().add("bound", "warning", "tear '" + name + "'", msg);
        }
        if (vb.hasMin && v < vb.lo * (1.0 - 1e-6))
        {
            const std::string msg = std::string("converged ") + var + " = "
                + num3(v * disp) + " " + unit + " is BELOW your min "
                + num3(vb.lo * disp) + " " + unit
                + " -- the bound excludes the physical solution";
            std::cout << "  [bound] WARNING: tear '" << name << "': " << msg << "\n";
            AdvisoryLog::instance().add("bound", "warning", "tear '" + name + "'", msg);
        }
    };
    chk(s.F, b.F, "F", 3600.0, "kmol/h");
    chk(s.T, b.T, "T", 1.0, "K");
}

sVector packTears(const std::vector<std::string>& tears,
                  const std::map<std::string,ProcessStream>& streams)
{
    sVector v;
    for (const auto& name : tears)
    {
        const auto& s = streams.at(name);
        v.push_back(s.F);
        for (auto z : s.z) v.push_back(z);
        v.push_back(s.T);
    }
    return v;
}

// Unpack a Wegstein tear vector [F, z_0..z_{nC-1}, T] per tear back onto the
// streams.  Negative total flows / fractions are floored to zero (a PHYSICAL
// bound, F >= 0, z_i >= 0).  Per the "no silent crutch" credo this clip is
// announced -- but only when `announce` is set (the loop passes it on the
// ACCEPTED extrapolated step, never silently): a tear whose accelerated step
// overshoots negative tells the student the recycle is struggling, and a
// negative at the converged step signals an ill-posed spec.
void unpackTears(const std::vector<std::string>& tears,
                 std::map<std::string,ProcessStream>& streams,
                 const sVector& v,
                 std::size_t nComp,
                 bool announce = false,
                 const std::map<std::string,StreamBounds>* bounds = nullptr)
{
    std::size_t off = 0;
    for (const auto& name : tears)
    {
        auto& s = streams.at(name);
        if (announce && v[off] < 0.0)
            std::cout << "  [bound] tear '" << name << "': total flow "
                      << std::scientific << std::setprecision(2) << v[off]
                      << " floored to 0 (physical: F >= 0)\n";
        s.F = std::max(v[off], 0.0);                 ++off;
        scalar zsum = 0.0;
        for (std::size_t i = 0; i < nComp; ++i)
        {
            if (announce && v[off] < 0.0)
                std::cout << "  [bound] tear '" << name << "': component " << i
                          << " fraction " << std::scientific << std::setprecision(2)
                          << v[off] << " floored to 0 (physical: z_i >= 0)\n";
            s.z[i] = std::max(v[off], 0.0);
            zsum  += s.z[i];
            ++off;
        }
        if (zsum > 0.0) for (auto& z : s.z) z /= zsum;
        if (announce && v[off] <= 0.0)
            std::cout << "  [bound] tear '" << name << "': temperature "
                      << std::fixed << std::setprecision(2) << v[off]
                      << " K is non-physical (T > 0) -- check the spec\n";
        s.T = v[off];                                 ++off;
        // Author absolute bounds (after the physical floors).
        if (bounds)
        {
            auto it = bounds->find(name);
            if (it != bounds->end() && it->second.any)
                applyStreamBounds(s, it->second, name, announce);
        }
    }
}

scalar normL2(const sVector& a, const sVector& b)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < a.size(); ++i)
    {
        scalar d = a[i] - b[i];
        s += d * d;
    }
    return std::sqrt(s);
}

} // anonymous namespace

// ===========================================================================
//   Per-unit thermo override
// ===========================================================================
//   A unit may carry a `thermo {... }` block selecting different models
//   (e.g. a high-P compressor wants SRK; a non-ideal-liquid column wants
//   NRTL).  We rebuild a ThermoPackage = the global COMPONENTS + the unit's
//   override MODELS, build it once, and cache it.  Units without an override
//   (the overwhelming majority) keep using the global thermo unchanged.
const ThermoPackage& Flowsheet::thermoFor(const std::string&   uname,
                                          const DictPtr&       udict,
                                          const ThermoPackage& global)
{
    if (!udict->found("thermo") || !db_ || !thermoDict_)
        return global;

    auto it = unitThermo_.find(uname);
    if (it != unitThermo_.end()) return *it->second;

    // Merge: copy the global thermoPackage, then let the unit's override
    // block REPLACE the model sub-dicts it names (activityModel /
    // equationOfState / transport).  Components stay global.
    auto merged = std::make_shared<Dictionary>("thermoPackage");
    for (const auto& k : thermoDict_->keys())
        merged->insert(k, thermoDict_->entryValue(k));
    auto over = udict->subDict("thermo");
    for (const auto& k : over->keys())
        merged->insert(k, over->entryValue(k));

    auto tp = std::make_unique<ThermoPackage>();
    tp->readFromDict(merged, *db_);
    const ThermoPackage& ref = *tp;
    unitThermo_[uname] = std::move(tp);
    return ref;
}

// ===========================================================================
//   Flowsheet::solve
// ===========================================================================

int Flowsheet::solve(const DictPtr& dict,
                     const ThermoPackage& thermo,
                     int verbosity)
{
    // Reset per-run state (stream registry + per-unit KPI table + per-
    // unit residual history + per-unit 1-D profiles).
    streams_.clear();
    topology_.clear();
    unitKpis_.clear();
    unitResiduals_.clear();
    unitProfiles_.clear();

    // ---- Seed the stream registry --------------------------------------
    //  A leaf node (one unit) carries its default boundary feeds in
    //  `streams`; a node cabled by a parent may have none (the parent
    //  overrides them) --- so `streams` is optional.
    std::map<std::string,StreamBounds> streamBounds;   // optional author cages
    if (dict->found("streams"))
    {
        auto sblock = dict->subDict("streams");
        for (const auto& sname : sblock->keys())
        {
            auto sd = sblock->subDict(sname);
            streams_[sname] = readSourceStream(sname, sd, thermo);
            StreamBounds b = parseStreamBounds(sd);
            if (b.any) streamBounds[sname] = b;
        }
    }

    // ---- Read execution sequence & tear-stream declaration -------------
    //  A flowsheetDict is a fractal NODE: a LEAF if it carries
    //  `type` directly (one unit op --- "a unit op is a flowsheet of one"),
    //  a COMPOSITE if it carries a `units (...)` list.  For a leaf we
    //  synthesise the one-unit list here, so the rest of solve() is
    //  unchanged; single- vs multi-input is decided by the boundary size
    //  (1 inlet -> the `in` feed/composition path; >1 -> `inputs`/
    //  inputStreams), matching what buildAugmentedDict expects.
    std::vector<std::pair<std::string,std::string>> outletAliases;  // child output -> parent boundary outlet
    std::vector<DictPtr> units;
    // Tears collected from composite-level `tearStreams` declarations.
    // Empty for flat / leaf cases; populated by flattenNode for composites.
    std::vector<CompositeTear> compositeTears;
    if (dict->found("units"))
    {
        units = dict->lookupDictList("units");
    }
    else if (dict->found("type"))
    {
        const std::string nodeName = dict->lookupWordOrDefault("name", "node");
        auto u = std::make_shared<Dictionary>(nodeName);
        u->insert("name", std::string(nodeName));
        u->insert("type", dict->entryValue("type"));
        for (const char* k : { "operation", "model", "dryingCurve", "crystallisation", "thermo", "reaction" })
            if (dict->found(k)) u->insert(k, dict->entryValue(k));
        auto b = dict->subDict("boundary");
        auto inlets = b->lookupWordList("inlets");
        if (inlets.size() == 1) u->insert("in", std::string(inlets[0]));
        else                    u->insert("inputs",  b->entryValue("inlets"));
        u->insert("outputs", b->entryValue("outlets"));
        units = { u };
    }
    else if (dict->found("children"))
    {
        // COMPOSITE node (fractal step 2/3): flatten the children TREE
        // recursively into namespaced leaf units, cabling per `connections` at
        // each level.  A child may itself be composite --- flattenNode recurses
        // (plant -> sector -> unit), so the same code lights up a sector run
        // alone OR the whole plant.  The root's boundary inlets ARE the source
        // streams already seeded above.
        std::map<std::string,std::string> rootInletMap;
        if (dict->found("boundary"))
        {
            auto b = dict->subDict("boundary");
            if (b->found("inlets"))
                for (const auto& inl : b->lookupWordList("inlets"))
                    rootInletMap[inl] = inl;
        }
        auto outMap = flattenNode(dict, "", "", rootInletMap, units,
                                  compositeTears, thermo, streams_);
        for (const auto& [outlet, src] : outMap)
            outletAliases.emplace_back(src, outlet);
    }
    else
    {
        throw std::runtime_error("Flowsheet: node has neither a `units (...)`"
            " list, a `children (...)` list, nor a `type` (leaf node)");
    }
    // Record the flattened unit interface (name / type / resolved in+out
    // stream names) so the per-unit reports can iterate the real equipment
    // even for a composite plant.  Works uniformly: the units-list, the
    // synthesised leaf, and the flattened composite all land in `units`.
    for (const auto& u : units)
    {
        FlatUnit fu;
        fu.name = u->lookupWordOrDefault("name", "?");
        fu.type = u->lookupWordOrDefault("type", "");
        if (u->found("inputs"))   fu.ins = u->lookupWordList("inputs");
        else if (u->found("in"))  fu.ins = { u->lookupWord("in") };
        if (u->found("outputs"))  fu.outs = u->lookupWordList("outputs");
        topology_.push_back(std::move(fu));
    }

    std::vector<std::string> tears;
    if (dict->found("tearStreams"))
        tears = dict->lookupWordList("tearStreams");
    // Composite tears (from any composite level inside the fractal
    // expansion): seed streams_ with the initial guess and add the
    // qualified name to the outer-loop tear list.  After this, internal
    // recycle in a sector iterates exactly like flat-case recycle.
    for (auto& ct : compositeTears)
    {
        if (!streams_.count(ct.qualifiedName))
            streams_[ct.qualifiedName] = std::move(ct.initial);
        tears.push_back(ct.qualifiedName);
    }

    // ---- Auto-seed unguessed tears (honest feed propagation) -----------
    //  A tear named in `tearStreams` normally carries its own initial guess
    //  in the `streams {}` block (process03_recycle does).  If the author
    //  OMITTED it, seed it from the FEED AGGREGATE -- a physically-defensible
    //  guess derived from the actual feeds (the fresh material entering the
    //  loop), never a magic universal constant (the "1 kg/s"
    //  anti-pattern).  Per "no silent crutch" the seed is ANNOUNCED, with a
    //  nudge: an explicit hand-written guess converges faster.
    {
        std::set<std::string> tearSet(tears.begin(), tears.end());
        for (const auto& t : tears)
        {
            if (streams_.count(t)) continue;            // author supplied a guess
            scalar Ftot = 0.0, Tw = 0.0;
            const ProcessStream* tmpl = nullptr;
            sVector zsum;
            for (const auto& [nm, s] : streams_)
            {
                if (tearSet.count(nm) || s.F <= 0.0) continue;   // skip tears + empties
                if (!tmpl) tmpl = &s;
                if (zsum.size() < s.z.size()) zsum.resize(s.z.size(), 0.0);
                for (std::size_t i = 0; i < s.z.size(); ++i) zsum[i] += s.F * s.z[i];
                Tw   += s.F * s.T;
                Ftot += s.F;
            }
            if (!tmpl || Ftot <= 0.0)
                throw std::runtime_error("Flowsheet: tear stream '" + t +
                    "' has no initial guess and no feed to propagate from --"
                    " declare it (its initial guess) in the `streams {}` block.");
            ProcessStream seed = *tmpl;     // inherit P, vf, vector sizes, sane fields
            seed.name = t;
            seed.F = Ftot;
            seed.T = Tw / Ftot;
            seed.z = zsum;
            for (auto& zi : seed.z) zi /= Ftot;   // flow-averaged composition
            streams_[t] = std::move(seed);
            const std::string imsg = "no guess supplied -- seeded from the feed aggregate (F="
                + num3(Ftot * 3600.0) + " kmol/h, T=" + num3(Tw / Ftot)
                + " K).  An explicit guess in `streams." + t + "` will converge faster.";
            std::cout << "  [init] tear '" << t << "': " << imsg << "\n";
            AdvisoryLog::instance().add("init", "info", "tear '" + t + "'", imsg);
        }
    }

    // ---- Resolve RELATIVE bounds against the now-frozen feeds (Slice 3) -
    //  Feeds + tears are settled, so the feed aggregates (feedTotal/feedMax/
    //  feedMin/feedMean) and per-feed references are stable.  A relative band
    //  becomes concrete SI lo/hi here; downstream cage/check logic is unchanged.
    if (!streamBounds.empty())
    {
        std::set<std::string> tearSet(tears.begin(), tears.end());
        for (auto& [nm, b] : streamBounds)
            resolveStreamBounds(b, streams_, tearSet);
    }

    std::cout << "\n================  Flowsheet topology  ================\n";
    std::cout << "Source streams declared in `streams`:\n";
    for (const auto& [name, s] : streams_) printStream(s, thermo);
    if (!tears.empty())
    {
        std::cout << "Tear streams (initial guesses):\n";
        for (const auto& t : tears) printStream(streams_.at(t), thermo);
    }
    std::cout << "------------------------------------------------------\n";

    // Drying-curve library (constant/dryingKinetics): drying KINETICS ---
    // the characteristic drying curve + critical moisture --- loaded lazily
    // here, kept SEPARATE from the material's equilibrium sorption isotherm
    // (which lives on the component.dat).  Same split between
    // the sorption isotherm and the drying-rate curve.
    if (!dryingKineticsDict_ && std::filesystem::exists("constant/dryingKinetics"))
        dryingKineticsDict_ = Dictionary::fromFile("constant/dryingKinetics");

    // Crystallisation-kinetics library (constant/crystallisation): nucleation
    // + growth kinetics that set the PSD, lazily loaded, kept SEPARATE from
    // the solute's equilibrium solubility curve (which lives on the.dat).
    if (!crystallisationDict_ && std::filesystem::exists("constant/crystallisation"))
        crystallisationDict_ = Dictionary::fromFile("constant/crystallisation");

    // Energy wires: clear from any previous solve; we accumulate as
    // each unit's wires are resolved, so the final list reflects the last
    // pass (the only relevant one for reports).  The resolve step happens
    // just BEFORE each consumer's runUnit() call --- the producer must
    // already be solved (units are in topological order in single-pass; in
    // recycle the tear iteration converges values that propagate through).
    energyWires_.clear();

    // Feedback heat-links (energy tears): a unit's energyInput `from
    // <col>.<port>` (kind heat) where the producer column is listed AFTER this
    // consumer.  The duty is unknown when the consumer solves, so it is NOT a
    // forward link --- it is a FEEDBACK loop (e.g. a condenser preheating the
    // column's OWN feed).  Detecting any forces the recycle outer loop on (even
    // with no material tears); it converges by successive substitution
    // (resolveEnergyInputs uses the persisted previous-pass duty, 0 on pass 1).
    struct EFeedback { std::string consumer, col, kpiKey; };
    std::vector<EFeedback> feedbackEnergy;
    {
        std::map<std::string,int> uidx;
        for (int i = 0; i < static_cast<int>(units.size()); ++i)
            uidx[units[i]->lookupWord("name")] = i;
        for (int i = 0; i < static_cast<int>(units.size()); ++i)
        {
            if (!units[i]->found("energyInputs")) continue;
            const std::string cons = units[i]->lookupWord("name");
            for (const auto& ein : units[i]->lookupDictList("energyInputs"))
            {
                if (ein->lookupWordOrDefault("kind", "work") != "heat") continue;
                const std::string fr = ein->lookupWordOrDefault("from", "");
                const auto dot = fr.find('.');
                if (dot == std::string::npos) continue;
                const std::string col = fr.substr(0, dot), port = fr.substr(dot + 1);
                if (port != "condenser" && port != "reboiler") continue;
                auto pit = uidx.find(col);
                if (pit == uidx.end() || pit->second <= i) continue;   // forward / self
                feedbackEnergy.push_back({ cons, col,
                    port == "condenser" ? "Q_condenser_kW" : "Q_reboiler_kW" });
            }
        }
    }
    // Current feedback-duty vector (kW), read from the persisted KPIs --- the
    // G(x) of the energy tear; used for the outer-loop convergence test.
    auto energyVec = [&]() {
        sVector v;
        for (const auto& e : feedbackEnergy)
        {
            auto u = unitKpis_.find(e.col);
            scalar q = 0.0;
            if (u != unitKpis_.end()) { auto k = u->second.find(e.kpiKey); if (k != u->second.end()) q = k->second; }
            v.push_back(q);
        }
        return v;
    };

    // ===================  Single-pass mode  =============================
    if (tears.empty() && feedbackEnergy.empty())
    {
        int unitIdx = 0;
        for (const auto& udict : units)
        {
            auto wires = resolveEnergyInputs(udict, units, unitKpis_);
            for (auto& w : wires) energyWires_.push_back(std::move(w));
            runUnit(udict, streams_, unitKpis_, unitResiduals_, unitProfiles_, thermoFor(udict->lookupWord("name"), udict, thermo),
                    solverDict_, reactionsDict_, dryingKineticsDict_, crystallisationDict_,
                    verbosity, unitIdx++, /*quiet=*/false);
        }
    }
    // ===================  Recycle outer loop  ===========================
    else
    {
        const int    maxOuter = static_cast<int>(dict->lookupScalarOrDefault("recycleMaxIter", 100));
        const scalar tearTol  = dict->lookupScalarOrDefault("recycleTol", 1.0e-5);
        // Default to Newton-on-tears; `recycleSolver Wegstein;` keeps
        // the fixed-point accelerator.  Both converge to the same tear
        // solution (the recycle fixed point is unique).
        std::string recSolver =
            dict->lookupWordOrDefault("recycleSolver", "Newton");
        // An energy heat-link feedback is a scalar fixed-point -> converge it
        // by Wegstein successive substitution (the Newton-on-tears step is for
        // material recycle Jacobians).  Wegstein handles any material tears too.
        if (!feedbackEnergy.empty() && recSolver != "Wegstein")
        {
            std::cout << "  (energy heat-link feedback present -> Wegstein successive substitution)\n";
            recSolver = "Wegstein";
        }

        // One SM sweep through every unit (quiet during iteration).
        auto sweep = [&](bool quiet)
        {
            energyWires_.clear();   // re-accumulate per sweep
            int unitIdx = 0;
            for (const auto& udict : units)
            {
                auto wires = resolveEnergyInputs(udict, units, unitKpis_);
                for (auto& w : wires) energyWires_.push_back(std::move(w));
                runUnit(udict, streams_, unitKpis_, unitResiduals_, unitProfiles_,
                        thermoFor(udict->lookupWord("name"), udict, thermo),
                        solverDict_, reactionsDict_, dryingKineticsDict_, crystallisationDict_,
                        verbosity, unitIdx++, quiet);
            }
        };

        // ---- Solution-directory: restart + seed (opt-in, default off) ----
        //  The hooks are empty unless main.cpp installed them (solutionControl
        //  write true;).  When empty, this whole block is two null-tests ---
        //  zero behavioural change, byte-identical stdout.
        //
        //  Restart FIRST (reseeds the tear streams from solution/latest/streams
        //  and resets the acceleration history --- it is NOT restored; the
        //  recycle fixed point is unique to topology+feeds, so we converge to
        //  the SAME answer along a possibly different path), then write 0/ as
        //  the seed reflecting the (possibly resumed) tear state.
        int itBase = 0;   // iteration offset; >0 after a restart
        if (onRestart_)
        {
            const int resumed = onRestart_(streams_, tears);
            if (resumed >= 0)
            {
                itBase = resumed;
                std::cout << "  RESTART from solution/" << resumed
                          << " -- tears reseeded from disk; acceleration history"
                             " reset; iteration count resumes at " << resumed << ".\n";
            }
        }
        if (onInstant_)
            onInstant_(itBase, "seed", 0.0, false, streams_, tears);

        // Final-instant state, set by whichever branch runs, emitted after the
        // final logged sweep (the converged answer == the canonical result).
        bool        finalConverged = false;
        scalar      finalResidual  = 0.0;
        int         finalIteration = itBase;
        const char* finalSolver    = "recycle";

        if (recSolver == "Wegstein")
        {
            std::cout << "Recycle outer loop (Wegstein over "
                      << tears.size() << " tear stream(s)):\n"
                      << "   it    |Δtear|2     |F_tear|                      γ-info\n"
                      << "  ----  -----------  ----------\n";
            const scalar qmin = dict->lookupScalarOrDefault("recycleWegsteinQmin", -1.0);
            const scalar qmax = dict->lookupScalarOrDefault("recycleWegsteinQmax",  0.0);
            sVector x = packTears(tears, streams_);
            solver::Wegstein accel(x.size(), qmin, qmax);
            // Energy-tear values ride via unitKpis_ (plain successive
            // substitution, not accelerated): the column overwrites its duty
            // KPI each sweep, resolveEnergyInputs reads the previous one.
            sVector prevE = energyVec();

            bool converged = false; int outerIt = 0; scalar lastDelta = 0.0;
            for (outerIt = 0; outerIt < maxOuter; ++outerIt)
            {
                sweep(/*quiet=*/true);
                sVector gx = packTears(tears, streams_);
                lastDelta = normL2(gx, x);
                // Energy-tear convergence: RELATIVE (duties are ~1e6 W, so an
                // absolute L2 tol would never trip).
                sVector curE = energyVec();
                bool eConv = true; scalar eRel = 0.0;
                for (std::size_t i = 0; i < curE.size(); ++i)
                {
                    const scalar d = std::abs(curE[i] - prevE[i]) / std::max(1.0, std::abs(curE[i]));
                    if (d > eRel) eRel = d;
                    if (d > tearTol) eConv = false;
                }
                scalar Ftear = 0.0; for (const auto& t : tears) Ftear += streams_[t].F;
                std::cout << "  " << std::setw(4) << outerIt
                          << "  " << std::scientific << std::setprecision(3) << std::setw(11) << lastDelta
                          << "  " << std::fixed << std::setprecision(4) << std::setw(10) << Ftear << "  kmol/h";
                if (!feedbackEnergy.empty())
                    std::cout << "   |dQ/Q|=" << std::scientific << std::setprecision(2) << eRel;
                std::cout << "\n";
                // Solution-directory tap: streams_ is in the post-sweep state
                // for this outer iteration.  Cadence + final-always are decided
                // by the installed callback (empty => no-op).
                if (onInstant_)
                    onInstant_(itBase + outerIt + 1, "wegstein", lastDelta,
                               false, streams_, tears);
                if (lastDelta < tearTol && eConv) { converged = true; ++outerIt; break; }
                sVector x_next = accel.step(x, gx);
                // announce: this is an ACCEPTED extrapolated step, so a clip
                // here is a real event (overshoot), not a silent crutch.
                unpackTears(tears, streams_, x_next, thermo.n(), /*announce=*/true, &streamBounds);
                x = x_next;
                prevE = curE;
            }
            std::cout << "  ----  -----------  ----------\n";
            if (converged)
                std::cout << "Recycle converged in " << outerIt
                          << " Wegstein iteration(s)  (|Δtear|2 = "
                          << std::scientific << std::setprecision(3) << lastDelta << ").\n";
            else
                std::cout << "WARNING: recycle did NOT converge in " << maxOuter
                          << " iterations (last |Δtear|2 = " << std::scientific << lastDelta << ").\n";
            finalConverged = converged;
            finalResidual  = lastDelta;
            finalIteration = itBase + outerIt;
            finalSolver    = "wegstein";
        }
        else   // Newton-on-tears  (the EO-flavoured step: r(x) = G(x) − x = 0)
        {
            // Tear variables = per stream the component MOLAR FLOWS F_i and T.
            // These are independent coordinates: the (F, z_i) parametrisation
            // would be redundant (Σz=1) and need re-normalising onto the
            // simplex each step, so we tear on the unconstrained component
            // flows instead.  (Redundancy alone does not make the Jacobian
            // singular -- the surplus direction maps to a benign eigenvalue
            // -1 -- it is just wasteful.)  One residual eval = one SM sweep.
            const std::size_t nc = thermo.n();
            auto packFlow = [&]() -> sVector {
                sVector v;
                for (const auto& name : tears) {
                    const auto& s = streams_.at(name);
                    for (std::size_t i = 0; i < nc; ++i)
                        v.push_back(s.F * (i < s.z.size() ? s.z[i] : 0.0));
                    v.push_back(s.T);
                }
                return v;
            };
            // `announce` is set ONLY on the final accepted unpack (after the
            // Newton solve), never on the thousands of finite-difference
            // Jacobian probes -- those transient negatives are numerical
            // machinery, not a crutch.  A negative component flow AT the
            // converged solution is the meaningful signal (no-silent-crutch):
            // the spec is giving this tear a non-physical composition.
            auto unpackFlow = [&](const sVector& v, bool announce = false) {
                std::size_t off = 0;
                for (const auto& name : tears) {
                    auto& s = streams_.at(name);
                    scalar F = 0.0; std::vector<scalar> Fi(nc);
                    for (std::size_t i = 0; i < nc; ++i) {
                        const scalar raw = v[off++];
                        if (announce && raw < 0.0)
                            std::cout << "  [bound] tear '" << name << "': "
                                      << thermo.comp(i).name() << " flow "
                                      << std::scientific << std::setprecision(2) << raw
                                      << " floored to 0 at the converged solution"
                                      << " (physical: flow >= 0) -- the spec may be ill-posed\n";
                        Fi[i] = std::max(raw, 0.0); F += Fi[i];
                    }
                    s.F = F;
                    for (std::size_t i = 0; i < nc; ++i) s.z[i] = (F > 0.0) ? Fi[i] / F : 0.0;
                    if (announce && v[off] <= 0.0)
                        std::cout << "  [bound] tear '" << name << "': temperature "
                                  << std::fixed << std::setprecision(2) << v[off]
                                  << " K is non-physical (T > 0) -- check the spec\n";
                    s.T = v[off++];
                    // Author absolute bounds (after the physical floors).
                    auto bit = streamBounds.find(name);
                    if (bit != streamBounds.end() && bit->second.any)
                        applyStreamBounds(s, bit->second, name, announce);
                }
            };
            sVector x0 = packFlow();
            // Characteristic scales so the residual is RELATIVE: flows by the
            // tear's total flow, T by T.  Without this the absolute tolerance
            // is dominated by the large variables (T ~ 365) and a tiny tear
            // flow converges only loosely (the latent under-convergence the
            // old Wegstein default also had).
            sVector scale(x0.size(), 1.0);
            {
                std::size_t off = 0;
                for (std::size_t t = 0; t < tears.size(); ++t)
                {
                    scalar Ftot = 0.0;
                    for (std::size_t i = 0; i < nc; ++i) Ftot += x0[off + i];
                    Ftot = std::max(Ftot, 1.0e-12);
                    for (std::size_t i = 0; i < nc; ++i) scale[off + i] = Ftot;
                    off += nc;
                    scale[off] = std::max(std::abs(x0[off]), 1.0);   // T
                    off += 1;
                }
            }
            std::cout << "Recycle outer loop (Newton over " << tears.size()
                      << " tear stream(s), " << x0.size() << " variables):\n"
                      << "   it    |r|2 (relative)\n  ----  -----------\n";
            auto residual = [&](const sVector& x) -> sVector {
                unpackFlow(x);
                sweep(/*quiet=*/true);
                sVector gx = packFlow();
                sVector r(x.size());
                for (std::size_t i = 0; i < x.size(); ++i)
                    r[i] = (gx[i] - x[i]) / scale[i];   // relative residual
                return r;
            };
            solver::NDOptions ndo;
            ndo.tolerance = tearTol;
            ndo.maxIter   = maxOuter;
            ndo.onIter = [&](const solver::NDTrace& tr) {
                std::cout << "  " << std::setw(4) << tr.iteration
                          << "  " << std::scientific << std::setprecision(3)
                          << std::setw(11) << tr.normF << "\n";
                // Solution-directory tap.  `tr.normF` describes the iterate
                // `tr.x`; the last residual call inside newtonND left streams_
                // at a line-search probe, NOT at tr.x.  Re-sync to tr.x so the
                // written instant matches the reported residual (one extra
                // sweep, only when the writer is installed).  Cadence/final are
                // decided by the installed callback (empty => no-op).
                if (onInstant_)
                {
                    residual(tr.x);   // place streams_ exactly at tr.x
                    onInstant_(itBase + tr.iteration + 1, "newtonOnTears",
                               tr.normF, false, streams_, tears);
                }
            };
            auto res = solver::newtonND(residual, x0, ndo);
            unpackFlow(res.x, /*announce=*/true);   // accepted solution: clips here are real
            std::cout << "  ----  -----------\n";
            if (res.converged)
                std::cout << "Recycle converged in " << res.iterations
                          << " Newton iteration(s)  (|r|2 = "
                          << std::scientific << std::setprecision(3) << res.residual << ").\n";
            else
                std::cout << "WARNING: recycle Newton did NOT converge in " << maxOuter
                          << " iterations (last |r|2 = " << std::scientific << res.residual << ").\n";
            finalConverged = res.converged;
            finalResidual  = res.residual;
            finalIteration = itBase + res.iterations;
            finalSolver    = "newtonOnTears";
        }

        // One final pass with full logging (common to both solvers).
        std::cout << "\n----- Final pass with full unit logging -----\n";
        sweep(/*quiet=*/false);

        // Solution-directory: write the converged final instant (tagged
        // converged true;).  This is the canonical result that feeds the JSON
        // and reports/.  Always written (off-cadence is fine), so a restart
        // and the answer are never confused with a mid-convergence snapshot.
        if (onInstant_)
            onInstant_(finalIteration, finalSolver, finalResidual,
                       finalConverged, streams_, tears);

        // Author bounds vs the PHYSICAL converged values (Slice 2): the cage
        // shaped the search; here we check whether the physical solution
        // actually respects the author's cage, and WARN loudly if not.
        for (const auto& t : tears)
        {
            auto it = streamBounds.find(t);
            if (it != streamBounds.end() && it->second.any && streams_.count(t))
                checkBoundsAtSolution(streams_.at(t), it->second, t);
        }
    }

    // ---- Composite boundary outlets (fractal step 2): alias the chosen
    //      child outputs under the parent's boundary-outlet names, so a
    //      parent (the plant) can cable `<sector>/<outlet>` next. ---------
    for (const auto& [src, alias] : outletAliases)
        if (streams_.count(src)) streams_[alias] = streams_.at(src);

    // ---- Summary -------------------------------------------------------
    std::cout << "\n================  Flowsheet summary  ================\n";
    std::cout << "Final stream table (all registered streams):\n";
    for (const auto& [name, s] : streams_) printStream(s, thermo);
    std::cout << "======================================================\n\n";

    // ---- Utility consumption ---------------------------------
    //  Aggregate by ProcessStream::category.  Streams without a
    //  category are process streams and do not appear in the report.
    //  Multiple streams sharing a category (e.g. two heaters tapping
    //  the same plant header) are summed automatically.
    std::map<std::string, scalar> utilityTotals;
    for (const auto& [name, s] : streams_)
    {
        if (s.category.empty()) continue;
        utilityTotals[s.category] += F_mass(s, thermo);
    }
    if (!utilityTotals.empty())
    {
        std::cout << "================  Utility consumption  ===============\n";
        std::cout << "  category                              kg/s        kg/h\n";
        std::cout << "  -----------------------------------  --------  ----------\n";
        for (const auto& [cat, kg_s] : utilityTotals)
        {
            std::cout << "  " << std::left << std::setw(37) << cat
                      << std::right
                      << std::fixed << std::setprecision(4)
                      << std::setw(8)  << kg_s
                      << std::setw(12) << kg_s * 3600.0 << "\n";
        }
        std::cout << "======================================================\n\n";
    }

    // ---- Stream enthalpy (post-solve, formation reference) ----------
    // Choupo-native datum: each component contributes from its OWN
    // tabulated phase (gibbsFormation.phase -- gas / liquid / solid),
    // applying the right phase transition at 298 K only when the
    // stream's phase differs from the natural one.  This carries the
    // heat of formation: h_out − h_in across a reactor IS the heat of
    // reaction at the reactor T, exactly the energy-balance contract.
    //
    // Crucially this does NOT require a Cp_ig for components that are
    // never gas (sucrose, glucose, NaCl,...).  Their tabulated Hf in
    // the solid phase is used directly; the dissolved-solute path uses
    // Cp_liquid as the sensible heat from 298 K.
    for (auto& [name, s] : streams_)
    {
        try
        {
            // A two-phase stream's enthalpy is the sum of its equilibrium
            // PHASES (the split), not H_stream's blend-by-z over the overall
            // z --- the two differ by the latent heat of separation, which
            // otherwise surfaces as a spurious ~0.4 % energy-balance
            // non-closure on a two-phase feed (its shown H would not match
            // the flash duty's H_in).  Recover the split by flashing at
            // (T,P,z); single-phase streams keep the cheap pure-phase form.
            if (s.vf > 1.0e-9 && s.vf < 1.0 - 1.0e-9
                && !thermo.phasesOfType("vapor").empty())
            {
                FlashInput fin; fin.F = 1.0; fin.T = s.T; fin.P = s.P; fin.z = s.z;
                FlashOptions fopts; fopts.verbosity = 0;
                const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fopts);
                if (fs.converged
                    && fs.V_over_F > 1.0e-9 && fs.V_over_F < 1.0 - 1.0e-9)
                    s.H = (1.0 - fs.V_over_F) * thermo.H_stream(s.T, s.P, 0.0, fs.x)
                        +        fs.V_over_F  * thermo.H_stream(s.T, s.P, 1.0, fs.y);
                else
                    s.H = thermo.H_stream(s.T, s.P, s.vf, s.z);
            }
            else
                s.H = thermo.H_stream(s.T, s.P, s.vf, s.z);
            s.H_valid = std::isfinite(s.H);
        }
        catch (const std::exception&)
        {
            s.H_valid = false;
        }
    }

    // ---- Model-boundary audit (H conserved, T is the model-dependent readout)
    // Where adjacent units use different thermo models, make the enthalpy the
    // two models disagree about VISIBLE -- it is held, never silently absorbed
    // into a T-nudge.  Refuses across a speciation change.  See energy.md sec.7.
    modelBoundaries_ = computeModelBoundaries(units, streams_,
        [&](const DictPtr& u) -> const ThermoPackage&
        { return thermoFor(u->lookupWord("name"), u, thermo); });
    printModelBoundaries(modelBoundaries_, verbosity);

    return 0;
}

} // namespace Choupo
