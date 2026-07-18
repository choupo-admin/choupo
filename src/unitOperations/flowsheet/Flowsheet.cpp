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
#include "thermo/ThermoAnnounce.H"
#include "core/DisplayUnits.H"
#include "core/ExprEval.H"
#include "reporting/BalanceMath.H"          // missingEnthalpyData: name no-datum species
#include "reporting/ModelBoundaryAudit.H"
#include "thermo/ThermoPackageBuilder.H"
#include "streams/StreamOverrides.H"
#include "streams/StreamOwnership.H"
#include "streams/StreamStateIO.H"
#include <fstream>
#include <functional>   // model-boundary audit (H conserved, T is the readout)

#include <cstdio>   // snprintf for advisory message formatting (no ostringstream)
#include "solver/NewtonRaphson.H"
#include "solver/NewtonND.H"
#include "solver/Wegstein.H"
#include "streams/Composition.H"
#include "streams/StreamMass.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/PropertyContext.H"
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

// Mixture-aware thermal-state completion: given the composition z and ONE of
// {P, T} plus a target vapour fraction, find the MISSING variable so the
// equilibrium flash returns that vf.  This is what makes `vaporFraction` a
// COMPLETE stream spec for a MIXTURE -- the counterpart of invertPsat() for a
// pure component -- because on the phase boundary T and P are NOT independent,
// so a saturated/two-phase feed MUST pin vf (with P or T).  vf=0 is the bubble
// point, vf=1 the dew point, in between a flash-at-vf.  Bisection on the flash
// vf, which is monotone (increasing in T at fixed P, decreasing in P at fixed
// T); robust to flash non-convergence at the extremes via a sign-change scan.
scalar solveStateForVf(const ThermoPackage& thermo, sVector z,
                       bool knownIsP, scalar known, scalar vfTarget,
                       const std::string& name)
{
    scalar zsum = 0.0; for (scalar zi : z) zsum += zi;
    if (zsum > 0.0) for (auto& zi : z) zi /= zsum;          // normalise
    // Aim a hair inside (0,1): the bubble/dew edge is the vf=0/1 limit, and the
    // clamped flash vf is flat there, so target vf-eps to land ON the edge.
    const scalar vfEff = std::min(1.0 - 1.0e-6, std::max(1.0e-6, vfTarget));
    auto vfAt = [&](scalar x) -> scalar
    {
        FlashInput fin; fin.F = 1.0; fin.z = z;
        if (knownIsP) { fin.T = x; fin.P = known; }
        else          { fin.T = known; fin.P = x; }
        FlashOptions fo; fo.verbosity = 0;
        const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fo);
        if (!fs.converged || !std::isfinite(fs.V_over_F)) return std::nan("");
        return std::min(1.0, std::max(0.0, fs.V_over_F));
    };
    // Scan for a sign-change bracket of f(x) = vf(x) - vfEff.
    scalar lo, hi;
    if (knownIsP) { lo = 80.0;  hi = 1500.0; }             // T in K
    else          { lo = 100.0; hi = 5.0e7;  }             // P in Pa (1 mbar..500 bar)
    const int NS = 60;
    scalar a = lo, b = hi, fa = std::nan(""); bool bracketed = false;
    scalar xPrev = lo, fPrev = std::nan("");
    for (int i = 0; i <= NS; ++i)
    {
        const scalar x = knownIsP ? lo + (hi - lo) * scalar(i) / NS
                                  : lo * std::pow(hi / lo, scalar(i) / NS);
        const scalar v = vfAt(x);
        const scalar fx = std::isfinite(v) ? v - vfEff : std::nan("");
        if (std::isfinite(fPrev) && std::isfinite(fx) && fPrev * fx <= 0.0)
        { a = xPrev; b = x; fa = fPrev; bracketed = true; break; }
        xPrev = x; fPrev = fx;
    }
    if (!bracketed)
        throw std::runtime_error("Stream '" + name + "': could not find a "
            + std::string(knownIsP ? "temperature" : "pressure")
            + " giving vaporFraction = " + std::to_string(vfTarget)
            + " -- the mixture is likely single-phase at the given "
            + (knownIsP ? "pressure" : "temperature")
            + ", or outside the thermo model's range.  Give T and P explicitly.");
    for (int it = 0; it < 90 && std::abs(b - a) > (knownIsP ? 1.0e-4 : 1.0e-1); ++it)
    {
        const scalar m = 0.5 * (a + b);
        const scalar v = vfAt(m);
        if (!std::isfinite(v)) { b = m; continue; }        // pull in from the bad side
        const scalar fm = v - vfEff;
        if (fa * fm <= 0.0) b = m; else { a = m; fa = fm; }
    }
    return 0.5 * (a + b);
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
    const bool hasVf    = sd->found("vaporFraction") || sd->found("vf");
    std::string state;
    if (hasState)
        state = sd->lookupWord("state");
    else if (util != nullptr && !util->state.empty())
        state = util->state;

    const bool effState = hasState || (util != nullptr && !util->state.empty());
    const bool effHasT  = hasT     || (util != nullptr && util->T_in  > 0.0);
    const bool effHasP  = hasP     || (util != nullptr && util->P     > 0.0);

    // A complete thermal state needs TWO independent specs: (T and P), OR a
    // `state` keyword, OR a `vaporFraction` with ONE of {T, P} (the engine then
    // solves the other -- bubble/dew/flash-at-vf).  vaporFraction is ESSENTIAL
    // for a saturated/two-phase feed, where T and P are NOT independent.
    if (!effState && !(effHasT && effHasP) && !(hasVf && (effHasT || effHasP)))
        throw std::runtime_error("Stream '" + name +
            "': under-specified thermal state.  Give TWO of {T, P, vaporFraction}"
            " --- (T and P), or `vaporFraction` with one of {T, P} (the engine"
            " solves the other; vaporFraction is essential for a saturated or"
            " two-phase feed, where T and P are not independent on the phase"
            " boundary), or a `state` keyword, or `utility <name>;`.");

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

    // -----------------------------------------------------------------
    // vaporFraction (alias vf) as a COMPLETE thermal-state spec, mixture-aware.
    // With ONE of {T, P} the engine solves the OTHER so the flash returns the
    // declared vf (the pure `state` path above does vf=0/1 via Psat; this is
    // general -- any mixture, any vf).  T, P AND vf all given is OVER-specified:
    // verify against the flash and REFUSE a contradiction (no silent crutch).
    // An explicit `state` already pinned vf -> skip.
    // -----------------------------------------------------------------
    if (hasVf && !effState)
    {
        const scalar vfDecl = sd->found("vaporFraction")
            ? sd->lookupScalar("vaporFraction") : sd->lookupScalar("vf");
        if (vfDecl < 0.0 || vfDecl > 1.0)
            throw std::runtime_error("Stream '" + name + "': vaporFraction = "
                + std::to_string(vfDecl) + " is outside [0, 1].");

        if (effHasT && effHasP)
        {
            // OVER-specified (T, P AND vf): the flash at (T, P) already fixes vf.
            sVector zf = s.z; scalar zs = 0.0; for (scalar zi : zf) zs += zi;
            if (zs > 0.0) for (auto& zi : zf) zi /= zs;
            FlashInput fin; fin.F = 1.0; fin.T = s.T; fin.P = s.P; fin.z = zf;
            FlashOptions fo; fo.verbosity = 0;
            const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fo);
            const scalar vfFl = (fs.converged && std::isfinite(fs.V_over_F))
                ? std::min(1.0, std::max(0.0, fs.V_over_F)) : vfDecl;
            if (std::abs(vfFl - vfDecl) > 0.02)
                throw std::runtime_error("Stream '" + name + "': over-specified"
                    " and inconsistent --- (T, P) flash to vaporFraction "
                    + std::to_string(vfFl) + ", but vaporFraction "
                    + std::to_string(vfDecl) + " was also declared.  Give only"
                    " TWO of {T, P, vaporFraction}.");
            s.vf = vfDecl;
        }
        else if (effHasP)   // P + vaporFraction -> solve T (bubble/dew/flash-at-vf)
        {
            s.T  = solveStateForVf(thermo, s.z, true, s.P, vfDecl, name);
            s.vf = vfDecl;
        }
        else                // T + vaporFraction -> solve P
        {
            s.P  = solveStateForVf(thermo, s.z, false, s.T, vfDecl, name);
            s.vf = vfDecl;
        }

        // LOUD: announce the resolved thermal state -- the spec the student reads.
        const auto& du = DisplayUnits::instance();
        const auto [Td, Tl] = du.convert(s.T, Dims::temperature);
        const auto [Pd, Pl] = du.convert(s.P, Dims::pressure);
        const char* ph = (s.vf <= 1.0e-6) ? "saturated liquid"
                       : (s.vf >= 1.0 - 1.0e-6) ? "saturated vapour" : "two-phase (VL)";
        char buf[160];
        std::snprintf(buf, sizeof(buf),
            "vaporFraction %.4g -> T = %.2f %s, P = %.4g %s  (%s)",
            static_cast<double>(vfDecl), static_cast<double>(Td), Tl.c_str(),
            static_cast<double>(Pd), Pl.c_str(), ph);
        const std::string locus = "stream '" + name + "'";
        if (AdvisoryLog::instance().add("phase", "info", locus, buf))
            std::cout << "  [phase] " << locus << ": " << buf << "\n";
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
    const bool phaseDeclared = effState || hasVf;
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
        // ALL components supercritical: the stream is unambiguously a GAS --
        // above Tc there is no vapour/liquid distinction to warn about, and
        // demanding a `state` declaration for pure N2 at 300 K is nonsense
        // (round-4: the engine must know what it can know; no busywork).
        const bool allSupercritical = z_supercrit > 1.0 - 1.0e-9;

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

        if (allSupercritical)
        {
            // Unambiguous: a wholly supercritical composition is a gas.
            s.vf = 1.0;
            if (thermoAnnounce(3))
                std::cout << "  [phase] stream '" << s.name << "': every"
                             " FLUID component is above its Tc -> gas"
                             " (vf = 1; any solids ride their own channel).\n";
        }
        else if (supercriticalFeed && vfFlash < 0.5)
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
                // 3 significant digits below 0.01: "%.3f" would print a
                // tiny-but-real vf = 4e-4 as "0.000" and contradict the
                // two-phase verdict on the same line.
                std::snprintf(vbuf, sizeof(vbuf),
                              (s.vf < 0.01) ? "%.3g" : "%.3f",
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

    // vf: fixed 3 decimals normally, but 3 significant digits (scientific
    // below 1e-4) when 0 < vf < 0.01 -- a tiny-but-real vapour fraction must
    // never display as 0.000 next to a two-phase verdict.
    char vfbuf[16];
    std::snprintf(vfbuf, sizeof(vfbuf),
                  (s.vf > 0.0 && s.vf < 0.01) ? "%.3g" : "%.3f",
                  static_cast<double>(s.vf));

    std::cout << "    " << std::left << std::setw(20) << s.name
              << " F = " << std::fixed << std::setprecision(pF)
              << std::setw(9) << F_disp << " " << F_lbl
              << "   T = " << std::setw(7) << std::setprecision(pT) << T_disp << " " << T_lbl
              << "   P = " << std::setw(7) << std::setprecision(pP) << P_disp << " " << P_lbl
              << "   vf = " << vfbuf;

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
    // A solids-carrying stream with (near-)zero fluid flow: the mole-fraction
    // line describes an EMPTY fluid phase -- label it so 'silica=0.0000' is
    // never read as 'no silica here' beside 41 kg/h of solids (student pass-4).
    if (solidMass > 0.0 && s.F < 1.0e-12)
        std::cout << "      (fluid phase empty -- the solids above ARE the stream)\n";
    else if (solidMass > 0.0)
        std::cout << "      (mole fractions below are the FLUID phase only --"
                     " the solids ride their own channel, listed above)\n";
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
    bool          hasInitial = true;    // false: resolve AFTER the manifest-based
                                        // 0/ seeding (topology-first reader,
                                        // forum #83 -- flatten no longer requires
                                        // pre-seeded streams)
};

//  Recursively flatten a fractal NODE into leaf units (fractal step 2/3).
//
//  A node is COMPOSITE (`members` + `connections` + `boundary`) or LEAF
//  (`type`).  We walk the tree, emitting one synthesised unit dict per LEAF
//  with a fully-qualified name (plant.sector.unit) and cabling each inlet to
//  its source per the `connections` at each level.  Returns this node's
//  boundary-outlet map { outlet -> global stream }, so its parent can resolve
//  `<member>/<outlet>` references.
//    nsPrefix : namespace prefix for stream/unit names ("" at the root,
//                 "concentration." inside the plant's first member,...).
//    folderPath : filesystem prefix to locate member folders ("" at the root
//                 [cwd is the case dir], "concentration/" one level down).
//    inletMap : this node's boundary-inlet name -> the global stream feeding it.
//    outTears : OUT.  Each composite (root + recursive members) appends its
//                 own `tearStreams` here with the initial guess read from its
//                 `streams {}` block.  Internal recycle within a sector
//                 becomes a flat-case-style tear after flattening.
//    thermo   : needed by readSourceStream to interpret tear initial guesses.
// ---------------------------------------------------------------------------
// Resolve a flowsheet MEMBER's DIRECTORY (with trailing '/').  A member is a
// UNIT operation or a SECTOR -- never a generic "member": a dignified unit lives
// under `unitOperations/<name>/`, a real sector under `sectors/<name>/`; the
// bare `<name>/` layout (member folder at the domain root) is still read for
// cases not yet migrated to the grouped layout.  The first location that
// actually carries a flowsheetDict wins, and the resolved base is used for the
// member's dict AND every `constant/` lookup below, so a member is found in
// exactly one place.
static std::string resolveMemberBase(const std::string& folderPath,
                                     const std::string& member)
{
    for (const std::string& cand : { folderPath + "unitOperations/" + member + "/",
                                     folderPath + "sectors/"        + member + "/",
                                     folderPath + member + "/" })
        if (std::filesystem::exists(cand + "system/flowsheetDict")
         || std::filesystem::exists(cand + "flowsheetDict"))
            return cand;
    return folderPath + member + "/";   // inline block / legacy fallback
}

std::map<std::string,std::string> flattenNode(const DictPtr&                                  dict,
    const std::string&                              nsPrefix,
    const std::string&                              folderPath,
    const std::map<std::string,std::string>&        inletMap,
    std::vector<DictPtr>&                           units,
    std::vector<CompositeTear>&                     outTears,
    const ThermoPackage&                            thermo,
    const std::map<std::string, ProcessStream>&     streamReg)
{
    // A composite lists its MEMBERS by folder name under `sectors` (UPPERCASE
    // composite sub-flowsheets) and/or `units` (lowercase dignified unit ops --
    // a leaf folder with a `type`).  Both are folder references flattened here;
    // the keyword is the author's SEMANTIC label (a plant has sectors; a
    // flowsheet has units), and a member's real kind is read from its own dict
    // (has `sectors`/`units` -> composite; has `type` -> leaf unit).
    std::vector<std::string> members;
    if (dict->found("sectors"))
        for (const auto& s : dict->lookupWordList("sectors")) members.push_back(s);
    if (dict->found("units"))
        for (const auto& u : dict->lookupWordList("units")) members.push_back(u);

    // ---- Named-edge connection grammar (stream-state architecture) ---------
    //  A physical stream is a NAMED graph edge with ONE stable identity: the
    //  connection KEY is the stream ID (== its `0/` state filename); `from`/`to`
    //  are producer/consumer PORTS, never identities.  Grammar (the ONLY one --
    //  the anonymous list was retired with the corpus, forum #55 D3):
    //      connections { liquor { from BRINE/liquor; to EXTRACTION/liquor; } }
    struct Edge { std::string name, from, to; };
    std::vector<Edge> edges;
    if (dict->found("connections"))
    {
        const auto& cv = dict->entryValue("connections");
        if (std::holds_alternative<DictPtr>(cv))          // named-edge dict
        {
            auto cd = std::get<DictPtr>(cv);
            for (const auto& key : cd->keys())
            {
                auto e = cd->subDict(key);
                edges.push_back({ key, e->lookupWordOrDefault("from",""),
                                       e->lookupWordOrDefault("to","") });
            }
        }
        else
            throw std::runtime_error("Flowsheet: `connections ( { from; to; } )` "
                "-- the ANONYMOUS list grammar -- was retired (constitution 2.2: "
                "a stream is a NAMED edge whose key is its identity and its 0/ "
                "filename).  Write\n"
                "    connections\n"
                "    {\n"
                "        <streamName> { from <unit>/<port>; to <unit>/<port>; }\n"
                "        <feedName>   { to <unit>/<port>; }     // inlet\n"
                "        <outName>    { from <unit>/<port>; }   // outlet\n"
                "    }\n"
                "An edge that carries a member's output takes the producing "
                "PORT's name; the root may rename a boundary outlet.");
    }
    // port (SECTOR/streamOrChild-port) -> the NAMED edge it belongs to.
    std::map<std::string,std::string> edgeFrom, edgeTo;
    for (const auto& e : edges)
    {
        if (!e.name.empty() && !e.from.empty()) edgeFrom[e.from] = e.name;
        if (!e.name.empty() && !e.to.empty())   edgeTo[e.to]     = e.name;
    }

    // Tear streams declared at THIS composite's level: bare name (as
    // used in connections within this node) -> qualified name (used in
    // the global streams_ registry and the outer-loop iteration).
    std::map<std::string,std::string> tearMap;
    if (dict->found("tearStreams"))
    {
        auto tearNames = dict->lookupWordList("tearStreams");
        for (const auto& bareName : tearNames)
        {
            const std::string qname = nsPrefix.empty()
                                    ? bareName
                                    : nsPrefix + bareName;
            tearMap[bareName] = qname;
            if (streamReg.count(qname))
                // the tear's initial state was seeded from 0/ (the new model)
                outTears.push_back({ qname, streamReg.at(qname) });
            else
                // Not resolvable at flatten time.  In a 0/ case the manifest-
                // based seeding runs AFTER flattening (topology-first reader,
                // forum #83), so defer: solve() resolves it post-seed and
                // throws the honest "no initial guess" there if still missing.
                outTears.push_back({ qname, ProcessStream{}, false });
        }
    }

    auto sourceFor = [&](const std::string& target) -> std::string {
        for (const auto& e : edges)
            if (e.to == target)
                return e.from;
        return "";
    };

    // memberOutletMaps[member][outlet] = the global stream the member produces.
    std::map<std::string, std::map<std::string,std::string>> memberOutletMaps;

    // Resolve a connection endpoint to a GLOBAL stream name.  A bare name is a
    // boundary inlet of THIS node (fed by the parent via inletMap); `member/port`
    // is a member output (the member must already have been processed --- members
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
        auto cit = memberOutletMaps.find(ch);
        if (cit == memberOutletMaps.end() || !cit->second.count(port))
            throw std::runtime_error("Flowsheet: connection source '" + ep
                + "' is an unknown member output (wrong order or name?)");
        return cit->second.at(port);
    };

    for (const auto& member : members)
    {
        const std::string memberBase = resolveMemberBase(folderPath, member);
        // GUARD (forum 2026-07-03, reproducibility): a purely-NUMERIC sector
        // name collides with the OpenFOAM-style instant directories (0/ 1/ 2/)
        // the SolutionWriter puts at the case root -- and .gitignore excludes
        // purely-numeric dirs, so a sector named e.g. `2024` would have its
        // system/ + constant/ SILENTLY IGNORED on commit (data loss).  Refuse
        // it loudly; sector names must carry at least one non-digit.
        if (!member.empty()
            && member.find_first_not_of("0123456789") == std::string::npos)
            throw std::runtime_error("Flowsheet: sector/member name '" + member
                + "' is purely numeric -- it would collide with the "
                  "OpenFOAM-style instant directories (0/ 1/ 2/) and be "
                  "gitignored.  Rename it with at least one letter.");
        DictPtr cd;
        // DUAL-READER (fractal folder discipline).  A member node carries its
        // flowsheetDict in one of two places, tried in this order:
        //   (1) <member>/flowsheetDict        -- the LEAN layout: the dict rises
        //       to the node root, no sparse per-node system/ wrapper, so each
        //       branch is still an independently-runnable case (its dict + the
        //       inherited constant/ + controlDict via the cascade).  This is the
        //       ChemicalPlantTutorial pilot's layout.
        //   (2) <member>/system/flowsheetDict -- the original layout, KEPT for
        //       backwards-compat: the other fractal cases (esterification2sector,
        //       twoSectorDemo) load UNCHANGED via this fallback.
        // The two are never both present for a given node; if neither exists the
        // member must be an inline block in the parent dict.
        const std::string leanDict   = memberBase + "flowsheetDict";
        const std::string systemDict = memberBase + "system/flowsheetDict";
        if      (std::filesystem::exists(leanDict))   cd = Dictionary::fromFile(leanDict);
        else if (std::filesystem::exists(systemDict)) cd = Dictionary::fromFile(systemDict);
        else if (dict->found(member))                  cd = dict->subDict(member);
        else throw std::runtime_error("Flowsheet: member '" + member
            + "' has neither a folder (" + leanDict + " or " + systemDict
            + ") nor an inline block");

        // The member's INTERFACE PORTS.  With named edges there is NO boundary{}:
        // a port `member/p` referenced as a connection `to` is an inlet, as a
        // `from` an outlet -- topology is the truth.  A legacy boundary{} block
        // is still honoured during migration.
        std::vector<std::string> inlets;
        if (cd->found("boundary") && cd->subDict("boundary")->found("inlets"))
            inlets = cd->subDict("boundary")->lookupWordList("inlets");
        else
            for (const auto& e : edges)
            {
                const std::string pre = member + "/";
                if (e.to.rfind(pre, 0) == 0) inlets.push_back(e.to.substr(pre.size()));
            }

        std::map<std::string,std::string> memberInletMap;
        std::vector<std::string> qins;
        for (const auto& inl : inlets)
        {
            const std::string inletPort = member + "/" + inl;
            std::string g;
            auto et = edgeTo.find(inletPort);
            if (et != edgeTo.end())
            {
                // NAMED edge feeds this port.  The physical STREAM is the edge
                // name (namespaced by this domain).  A to-only edge (no `from`)
                // is an EXTERNAL feed -> the edge name IS the global source
                // stream (seeded from 0/); a from+to edge is internal -> resolve
                // the producer (whose edge-named output equals this same name).
                const Edge* ne = nullptr;
                for (const auto& e : edges) if (e.name == et->second) { ne = &e; break; }
                auto teIt = tearMap.find(ne->name);
                if (teIt != tearMap.end())
                    // TEAR edge: the producer is DOWNSTREAM (a recycle back-edge),
                    // not yet flattened -- read the tear's recycle slot instead.
                    g = teIt->second;
                else if (!ne->from.empty())
                    g = resolveGlobal(ne->from);            // internal: the producer
                else
                {
                    // to-only edge = this domain's INLET.  Fed by the PARENT
                    // (inletMap) when nested; an EXTERNAL feed (the edge name)
                    // only at the root, where no parent feeds it.
                    auto im = inletMap.find(ne->name);
                    g = (im != inletMap.end()) ? im->second : (nsPrefix + ne->name);
                }
            }
            else
            {
                const std::string src = sourceFor(inletPort);
                if (src.empty())
                    throw std::runtime_error("Flowsheet: member inlet '" + inletPort
                        + "' is not cabled by any connection");
                g = resolveGlobal(src);
            }
            memberInletMap[inl] = g;
            qins.push_back(g);
        }

        if (cd->found("type"))            // LEAF
        {
            const std::string qname = nsPrefix + member;

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
                    const std::string thisType = cd->lookupWord("type");
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

                        // Multi-effect cabling is PHYSICALLY CORRECT: effect-1
                        // vapour heats effect-2, so an evaporator's `Steam` port
                        // legitimately receives a sister evaporator's vapour
                        // outlet -- a process stream by nature (it is real
                        // material that leaves as the next condensate, not a
                        // utility tapped off the plant header).  Suppress the
                        // "expects a UTILITY stream" warning exactly for that
                        // case: this unit is an evaporator and the source
                        // endpoint is another evaporator member's outlet.
                        bool multiEffectVapour = false;
                        if (portIsUtility && !srcIsUtility
                            && thisType == "evaporator")
                        {
                            const std::string ep =
                                sourceFor(member + "/" + inlets[i]);
                            const auto slash = ep.find('/');
                            if (slash != std::string::npos)
                            {
                                const std::string srcMember = ep.substr(0, slash);
                                const std::string srcBase =
                                    resolveMemberBase(folderPath, srcMember);
                                const std::string sysPath = srcBase + "system/flowsheetDict";
                                const std::string leanP   = srcBase + "flowsheetDict";
                                std::string srcType;
                                if      (std::filesystem::exists(leanP))
                                    srcType = Dictionary::fromFile(leanP)
                                              ->lookupWordOrDefault("type", "");
                                else if (std::filesystem::exists(sysPath))
                                    srcType = Dictionary::fromFile(sysPath)
                                              ->lookupWordOrDefault("type", "");
                                else if (dict->found(srcMember))
                                    srcType = dict->subDict(srcMember)
                                              ->lookupWordOrDefault("type", "");
                                multiEffectVapour = (srcType == "evaporator");
                            }
                        }

                        if (portIsUtility && !srcIsUtility && !multiEffectVapour)
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

            std::vector<std::string> outlets;
            if (cd->found("boundary") && cd->subDict("boundary")->found("outlets"))
                outlets = cd->subDict("boundary")->lookupWordList("outlets");
            else
                for (const auto& e : edges)
                {
                    const std::string pre = member + "/";
                    if (e.from.rfind(pre, 0) == 0) outlets.push_back(e.from.substr(pre.size()));
                }
            std::vector<std::string> qouts;
            std::map<std::string,std::string> omap;
            for (const auto& o : outlets)
            {
                // STREAM IDENTITY = the NAMED EDGE this output port feeds.
                // A named connection `stream { from member/port; ... }` makes the
                // physical stream `stream` (namespaced by this domain); the port
                // is only an endpoint.  Absent a named edge (legacy anonymous
                // list) fall back to the port-qualified name <prefix>.<unit>.<port>.
                const std::string srcEp = member + "/" + o;
                std::string finalQ = qname + "." + o;
                auto ef = edgeFrom.find(srcEp);
                if (ef != edgeFrom.end())
                {
                    finalQ = nsPrefix + ef->second;
                    // A named edge that IS a tear: the producer writes into the
                    // recycle slot so the next pass reads the updated value.
                    auto tit = tearMap.find(ef->second);
                    if (tit != tearMap.end()) finalQ = tit->second;
                }
                // OVERRIDE when a connection routes this output to a tear stream
                // of THIS composite: write directly into the tear's slot.
                for (const auto& e : edges)
                {
                    if (e.from != srcEp) continue;
                    const std::string toEp = e.to;
                    if (toEp.find('/') != std::string::npos) continue;
                    auto tit = tearMap.find(toEp);
                    if (tit != tearMap.end()) { finalQ = tit->second; break; }
                }
                qouts.push_back(finalQ);
                omap[o] = finalQ;
            }
            memberOutletMaps[member] = omap;

            auto u = std::make_shared<Dictionary>(qname);
            u->insert("name", std::string(qname));
            u->insert("type", cd->entryValue("type"));
            for (const char* k : { "operation", "model", "thermo" })
                if (cd->found(k)) u->insert(k, cd->entryValue(k));
            // reaction: PER-NODE resolution (Item 0 of the props foundation).
            // A sector/unit's kinetics live WITH it (its own constant/reactions),
            // not only the plant root.  Resolve the named reference HERE from
            // the member's folder (same pattern as dryingCurve/crystallisation)
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
                    const std::string rn = std::get<std::string>(rv);
                    // Walk UP from the unit's own folder through its parent
                    // composites (the sector, then the plant root), taking the
                    // FIRST constant/reactions that defines this reaction.  This
                    // mirrors the thermoPackage / component-overlay cascade: a
                    // reaction declared at the SECTOR that owns it
                    // (e.g. FERMENTATION/constant/reactions -> sucroseToEthanol)
                    // is found by the leaf unit below it during a whole-plant
                    // run -- not only when it sits in the unit's own folder.
                    std::filesystem::path node =
                        std::filesystem::path(memberBase);
                    for (int up = 0; up < 6 && !resolved; ++up)
                    {
                        const std::filesystem::path rp = node / "constant" / "reactions";
                        if (std::filesystem::exists(rp))
                        {
                            auto rlib = Dictionary::fromFile(rp.string());
                            if (rlib->found(rn))
                            {
                                u->insert("reaction", rlib->entryValue(rn));
                                resolved = true;
                                break;
                            }
                        }
                        if (!node.has_parent_path() || node.parent_path() == node) break;
                        node = node.parent_path();
                    }
                }
                if (!resolved) u->insert("reaction", rv);  // bare name -> global library
            }
            // reactions ( r1 r2 ... ): the SAME per-node walk-up as the single
            // `reaction` above.  Without this a whole-plant run resolves the list
            // only against the ROOT constant/reactions -- so a sector that owns its
            // own kinetics (the whole point of the fractal constant/) is invisible
            // from the root, and the reactor falls through to "missing sub-dictionary
            // 'reaction'".  Resolve here, from the member's folder upward; leave an
            // unresolved list alone for the global library (buildAugmentedDict 3a).
            if (cd->found("reactions") && !cd->hasDictList("reactions"))
            {
                const auto names = cd->lookupWordList("reactions");
                std::vector<DictPtr> resolvedList;
                resolvedList.reserve(names.size());
                std::filesystem::path node = std::filesystem::path(memberBase);
                DictPtr rlib;
                for (int up = 0; up < 6; ++up)
                {
                    const std::filesystem::path rp = node / "constant" / "reactions";
                    if (std::filesystem::exists(rp)) { rlib = Dictionary::fromFile(rp.string()); break; }
                    if (!node.has_parent_path() || node.parent_path() == node) break;
                    node = node.parent_path();
                }
                if (rlib)
                {
                    bool all = true;
                    for (const auto& rn : names)
                    {
                        if (!rlib->found(rn)) { all = false; break; }
                        auto rd = rlib->subDict(rn);
                        if (!rd->found("name")) rd->insert("name", EntryValue(rn));
                        resolvedList.push_back(rd);
                    }
                    if (all && !resolvedList.empty())
                        u->insert("reactions", EntryValue(resolvedList));
                }
            }
            // dryingCurve: the kinetics live WITH the unit (its own
            // constant/dryingKinetics), not the sector --- so resolve the
            // named reference HERE, from the member's folder, and carry the
            // resolved sub-dict (buildAugmentedDict leaves a sub-dict alone).
            if (cd->found("dryingCurve"))
            {
                const auto& dv = cd->entryValue("dryingCurve");
                bool resolved = false;
                if (std::holds_alternative<std::string>(dv))
                {
                    const std::string dk = memberBase + "constant/dryingKinetics";
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
            // member's folder when running a parent composite (the
            // plant root doesn't carry per-unit kinetics) so the
            // Crystalliser(MSMPR) finds its sucroseKinetics block.
            if (cd->found("crystallisation"))
            {
                const auto& kv = cd->entryValue("crystallisation");
                bool resolved = false;
                if (std::holds_alternative<std::string>(kv))
                {
                    const std::string kp = memberBase + "constant/crystallisation";
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
                // WALK UP, like the reaction libraries above.  A PARTICULAR pair is
                // usually owned by the SECTOR that needs it, not by the leaf unit --
                // that is what "the data lives with the sector that owns it" means.
                // Looking only at the unit's own folder made the sector's pair
                // invisible from a whole-plant run, and the standard library won
                // silently.  Nearest owner wins; the standard library is the floor.
                std::filesystem::path node =
                    std::filesystem::path(memberBase.substr(0, memberBase.size() - 1));
                for (int up = 0; up < 6; ++up)
                {
                    if (std::filesystem::exists(node / "constant" / "parameters"))
                    {
                        DictPtr th = u->found("thermo")
                            ? u->subDict("thermo")
                            : std::make_shared<Dictionary>("thermo");
                        th->insert("binaryPairsBase", node.string());
                        // Active-set projection rides the SAME walk-up: the
                        // node that owns the pair base may also declare the
                        // context's active domain -- forward it so the pair
                        // matrix + announcement restrict to it (components
                        // stay GLOBAL; ThermoPackage pushes it into every
                        // activity block).
                        {
                            const std::filesystem::path cpd =
                                node / "constant" / "propertyDict";
                            if (std::filesystem::exists(cpd))
                            {
                                auto cd = Dictionary::fromFile(cpd.string());
                                if (cd->found("activeComponents")
                                    && !th->found("activeComponents"))
                                    th->insert("activeComponents",
                                               cd->entryValue("activeComponents"));
                            }
                        }
                        if (!u->found("thermo")) u->insert("thermo", EntryValue(th));
                        break;
                    }
                    if (!node.has_parent_path() || node.parent_path() == node) break;
                    node = node.parent_path();
                }
            }
            // PER-UNIT PROPERTY CONTEXT (F2): hand the unit the `constant/` base of
            // the NEAREST ancestor that owns a constant/propertyDict -- its own
            // local override, else its SECTOR's world (sectors/<S>/constant, which
            // `inherits` the plant), else the plant's.  thermoFor resolves the
            // inherits chain; this is the F2 replacement for an inline thermo{} and
            // is what gives a nested unit (sectors/BRINE/unitOperations/crystNaCl)
            // its sector's thermo world without repeating it on the unit.
            {
                std::string base = memberBase.substr(0, memberBase.size() - 1);
                for (int up = 0; up < 8 && !base.empty(); ++up)
                {
                    // G7: both grammar names anchor a property context (v2
                    // first is resolvePropertyContext's job; HERE either name
                    // marks the owning node).
                    if (std::filesystem::exists(base + "/constant/thermoPhysPropDict"))
                    { u->insert("propertyContextBase", std::string(base + "/constant")); break; }
                    const auto slash = base.rfind('/');
                    if (slash == std::string::npos) break;
                    base = base.substr(0, slash);
                }
            }
            if (qins.size() == 1) u->insert("in", std::string(qins[0]));
            else                  u->insert("inputs", EntryValue(qins));
            u->insert("outputs", EntryValue(qouts));
            units.push_back(u);
        }
        else if (cd->found("sectors") || cd->found("units"))   // COMPOSITE member -> recurse
        {
            // A composite member lists its own members by `sectors` (sub-domains)
            // AND/OR `units` (unit ops) -- a sector with a SINGLE unit (BRINE ->
            // unitOperations/crystNaCl) is `units ( crystNaCl )`, still composite.
            memberOutletMaps[member] = flattenNode(cd, nsPrefix + member + ".", memberBase,
                memberInletMap, units, outTears, thermo, streamReg);
        }
        else
            throw std::runtime_error("Flowsheet: member '" + member
                + "' is neither a leaf (`type`) nor a composite (`sectors`/`units`)");
    }

    // This node's boundary-outlet map: connections whose `to` is a bare name.
    // A bare name that's actually a TEAR (this composite's own internal recycle)
    // is NOT a boundary outlet -- it's internal -- so we skip it; the parent
    // never sees it.
    std::map<std::string,std::string> myOutletMap;
    for (const auto& e : edges)
    {
        // NAMED outlet edge: from-only (`from member/port;` no `to`) -- the edge
        // NAME is the domain-outlet stream, aliased to the producer's resolved
        // output.  (A from+to edge is internal; a to-only edge is a feed.)
        if (!e.name.empty() && !e.from.empty() && e.to.empty())
        {
            if (tearMap.count(e.name)) continue;
            myOutletMap[e.name] = resolveGlobal(e.from);
        }
        // Legacy anonymous: `to` is a bare boundary-outlet name, `from` a port.
        else if (e.to.find('/') == std::string::npos && !e.to.empty()
                 && e.from.find('/') != std::string::npos)
        {
            if (tearMap.count(e.to)) continue;
            myOutletMap[e.to] = resolveGlobal(e.from);
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

    // 3a. Resolve a named-reaction LIST --- `reactions ( r1 r2 ... );` --- the ONE
    //     multi-reaction grammar across the engine (the batch/dynamic reactors
    //     already take it).  Each name is looked up in constant/reactions and the
    //     resolved sub-dict is carried in a dict LIST, tagged with its own name so
    //     a reactor can label per-reaction KPIs.  Stoichiometry lives in the
    //     reactions library, never repeated inside each unit.
    if (out->found("reactions") && !out->hasDictList("reactions"))
    {
        const auto names = out->lookupWordList("reactions");
        std::vector<DictPtr> resolved;
        resolved.reserve(names.size());
        for (const auto& rn : names)
        {
            if (!reactionsDict || !reactionsDict->found(rn))
                throw std::runtime_error("Flowsheet: reaction '" + rn
                    + "' (in a `reactions ( ... )` list) not in constant/reactions");
            auto rd = reactionsDict->subDict(rn);
            if (!rd->found("name")) rd->insert("name", EntryValue(rn));   // for KPI labels
            resolved.push_back(rd);
        }
        out->insert("reactions", EntryValue(resolved));
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

// ---------------------------------------------------------------------------
//   Physical, feed-normalised tear residuals (mass + energy)
// ---------------------------------------------------------------------------
//   The scaled L2 tear residual |r|2 (relative to per-tear flow/T scales) is the
//   number the Newton/Wegstein solvers converge on, but it mixes flows and
//   temperatures into one dimensionless figure.  For the convergence PLOT we
//   want two PHYSICAL curves a student recognises: the recycle MASS imbalance
//   and the recycle ENERGY imbalance, each normalised by a plant-inlet scale so
//   it is dimensionless and O(1) at the start, marching to ~0 at convergence.
//
//   For a torn stream the SM sweep computes G(x) from the assumed x.  The tear
//   mismatch on that stream is (computed - assumed).  Summed over tears and
//   normalised:
//     massResidual   = Sigma_tears |Fmass_computed - Fmass_assumed| / Mfeed
//     energyResidual = Sigma_tears |Hdot_computed   - Hdot_assumed| / Efeed
//   where Hdot = F * H_blendPerNaturalPhase(T,P,vf,z) is the stream enthalpy FLOW
//   (kmol/s * J/mol).  The per-stream `.H` field is NOT maintained during the
//   recycle sweeps (Flowsheet fills it only AFTER convergence), so the enthalpy
//   is recomputed HERE from (T,P,vf,z) via the SAME per-natural-phase formation-
//   reference call on both sides -- the absolute datum cancels in the difference
//   anyway, but using one consistent evaluator keeps the residual honest.
//
//   The normalisers (a STABLE, non-zero scale -- see computeFeedScales) are the
//   total plant-inlet mass flow and a representative inlet energy scale; the
//   ratios are therefore the imbalance as a FRACTION of what enters the plant.
struct TearImbalance
{
    scalar mass   = 0.0;   // normalised mass imbalance   [-]
    scalar energy = 0.0;   // normalised energy imbalance [-]
};

// The plant-inlet normalisers.  Feeds are the Dirichlet streams: consumed by a
// unit but produced by none (and carrying flow).  massScale = sum of feed mass
// flows.  energyScale is built to be STABLE and NON-ZERO regardless of the
// enthalpy reference: it is the larger of (a) the absolute feed enthalpy flow
// sum and (b) a temperature-driven floor  Mfeed_molar * R * Tmean  (an
// ideal-gas-ish energy scale ~ n*R*T).  Choosing the max guards the degenerate
// case where the feed enthalpies happen to sum to ~0 by the reference choice
// (e.g. all feeds at the datum T) -- there the R*T floor keeps the denominator
// physically meaningful instead of exploding the ratio.
struct FeedScales { scalar mass = 1.0; scalar energy = 1.0; };

FeedScales computeFeedScales(const std::map<std::string, ProcessStream>& streams,
                             const std::vector<FlatUnit>&                units,
                             const std::set<std::string>&                tearSet,
                             const ThermoPackage&                        thermo)
{
    // Produced set: any stream that is an OUTLET of some unit.
    std::set<std::string> produced;
    for (const auto& u : units)
        for (const auto& o : u.outs) produced.insert(o);

    scalar mFeed = 0.0;       // total feed mass flow            [kg/s]
    scalar eFeedAbs = 0.0;    // |sum of feed enthalpy flows|    [W-basis]
    scalar molarFeed = 0.0;   // total feed molar flow           [kmol/s]
    scalar tAcc = 0.0; std::size_t nT = 0;

    for (const auto& [name, s] : streams)
    {
        if (tearSet.count(name)) continue;          // a tear is not a feed
        if (produced.count(name)) continue;          // produced => interior/product
        if (s.F <= 0.0) continue;                    // empty placeholder
        mFeed     += F_mass(s, thermo);
        // Feed enthalpy flow from (T,P,vf,z) -- the stream `.H` is not yet
        // populated when this runs (pre-recycle), so recompute it here.  Use the
        // per-natural-phase blend (handles solutes; see computeTearImbalance).
        scalar h = 0.0;
        try { h = thermo.H_blendPerNaturalPhase(s.T, s.P, s.vf, s.z); }   // AUTHORIZED-BLEND: tear-residual feed scale
        catch (const std::exception&) { h = 0.0; }
        eFeedAbs  += s.F * h;                          // kmol/s * J/mol
        molarFeed += s.F;
        tAcc += s.T; ++nT;
    }

    FeedScales fs;
    fs.mass = std::max(mFeed, 1.0e-12);              // never divide by zero
    const scalar Tmean = (nT > 0) ? tAcc / static_cast<scalar>(nT) : 298.15;
    // n*R*T floor: R = 8.314 J/(mol K); molarFeed in kmol/s -> *1 keeps the
    // SAME kmol/s * J/mol basis as F*H above (units consistent within the ratio).
    const scalar rtFloor = std::max(molarFeed, 1.0e-12) * 8.314 * Tmean;
    fs.energy = std::max(std::abs(eFeedAbs), rtFloor);
    fs.energy = std::max(fs.energy, 1.0e-12);
    return fs;
}

// Compare the COMPUTED tear streams (post-sweep, in `computed`) against the
// ASSUMED ones (the pre-sweep snapshot in `assumed`) and return the physical,
// feed-normalised mass & energy imbalance.  Both maps must hold every tear.
TearImbalance computeTearImbalance(
    const std::map<std::string, ProcessStream>& assumed,
    const std::map<std::string, ProcessStream>& computed,
    const std::vector<std::string>&             tears,
    const ThermoPackage&                        thermo,
    const FeedScales&                           fs)
{
    // Enthalpy FLOW [kmol/s * J/mol] from (T,P,vf,z) at the formation datum.
    // Recomputed here because the stream `.H` is unpopulated mid-recycle.  Use
    // the per-natural-phase H_stream (the SAME call Flowsheet uses to fill the
    // converged stream H), NOT the strict ideal-gas H_stream_formation: the
    // latter THROWS for a solute like sucrose that carries no idealGasHeatCapacity
    // block (it has no gas phase).  The blend lets each species contribute from
    // its own tabulated phase, so a sucrose-bearing recycle yields a real number.
    // A thermo failure (rare, ill-posed probe) contributes 0 to that tear's
    // energy term rather than aborting the residual.
    auto hDot = [&](const ProcessStream& s) -> scalar {
        try { return s.F * thermo.H_blendPerNaturalPhase(s.T, s.P, s.vf, s.z); }   // AUTHORIZED-BLEND: tear-residual energy norm
        catch (const std::exception&) { return 0.0; }
    };
    scalar dMass = 0.0, dEnergy = 0.0;
    for (const auto& t : tears)
    {
        auto ia = assumed.find(t), ic = computed.find(t);
        if (ia == assumed.end() || ic == computed.end()) continue;
        const ProcessStream& a = ia->second;
        const ProcessStream& c = ic->second;
        dMass   += std::abs(F_mass(c, thermo) - F_mass(a, thermo));
        dEnergy += std::abs(hDot(c) - hDot(a));
    }
    TearImbalance r;
    r.mass   = dMass   / fs.mass;
    r.energy = dEnergy / fs.energy;
    return r;
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
    // A `thermo {}` that carries only per-node AUXILIARIES (binaryPairsBase /
    // activeComponents -- synthesized by the constant/parameters walk-up at
    // wiring time) selects NO world: it must not eclipse the unit's property
    // context (F2).  Only a thermo{} naming a MODEL is a world override.
    const bool hasThermoBlock = udict->found("thermo");
    auto declaresWorld = [](const DictPtr& th)
    {
        return th->found("activityModel") || th->found("phases")
            || th->found("equationOfState") || th->found("propertyMethods")
            || th->found("chemistry");
    };
    const bool hasThermo  = hasThermoBlock
                            && declaresWorld(udict->subDict("thermo"));
    const bool hasContext = udict->found("propertyContextBase");
    if ((!hasThermo && !hasContext) || !db_)
        return global;

    auto it = unitThermo_.find(uname);
    if (it != unitThermo_.end()) return *it->second;

    // Merge: the unit's `thermo {}` override REPLACES the model sub-dicts it names
    // (activityModel / equationOfState / transport); the COMPONENTS stay global.
    // Two routes for "the global components":
    //   - legacy thermoPackage: copy the global thermoDict_ (it carries `components`);
    //   - propertyPackage (thermoDict_ null): synthesize `components ( ... )` from
    //     the built global package, so a per-unit override (e.g. an NRTL recovery
    //     column over an electrolyte global) builds on the SAME component set --
    //     readFromDict re-loads them (case-local, full) exactly as the legacy merge.
    auto merged = std::make_shared<Dictionary>("thermoPackage");
    if (thermoDict_)
    {
        for (const auto& k : thermoDict_->keys())
            merged->insert(k, thermoDict_->entryValue(k));
    }
    else
    {
        std::string clist = "components ( ";
        for (std::size_t i = 0; i < global.n(); ++i)
            clist += global.comp(i).name() + " ";
        clist += ");\nequationOfState { model idealGas; }\n";   // package EoS default;
        // the unit override REPLACES it below if it declares its own.
        auto cdict = Dictionary::fromString(clist, "thermoFor.components");
        for (const auto& k : cdict->keys())
            merged->insert(k, cdict->entryValue(k));
    }
    // The override sub-dicts come EITHER from an inline `thermo {}` (F1) OR from the
    // unit's resolved property context (F2: constant/propertyDict + `inherits`),
    // translated to the same override shape.  The SELECTED liquid method defines the
    // ACTIVE world: `activity.*` -> a molecular activityModel (inherited electrolyte
    // chemistry stays available but INACTIVE); `electrolyte.*` -> a manifest world.
    DictPtr over;
    if (hasThermo)
        over = udict->subDict("thermo");
    else
    {
        std::set<std::string> visited;
        DictPtr ctx = resolvePropertyContext(udict->lookupWord("propertyContextBase"),
                                             visited);
        // G7: a v2 chain resolves in the AUTHORED grammar; translate ONCE on
        // the completed system so the F2 logic below reads the v1 shape.
        const bool wasV2 = isV2System(ctx);
        if (wasV2)
            ctx = ThermoPackageBuilder::translateV2(ctx);
        // A v2 translation may resolve to the FLAT shape (gammaGamma phases,
        // inline pairs) -- no propertyMethods to parse; the flat blocks ARE
        // the override.  Copy them (+ the per-node auxiliaries) directly.
        if (wasV2 && !ctx->found("propertyMethods"))
        {
            over = std::make_shared<Dictionary>("thermo");
            for (const char* k : {"phases", "activityModel", "equationOfState",
                                  "transport", "pureFluids", "activeComponents",
                                  "chemistry"})
                if (ctx->found(k)) over->insert(k, ctx->entryValue(k));
            {
                const std::string pcb = udict->lookupWord("propertyContextBase");
                const auto s = pcb.rfind("/constant");
                if (s != std::string::npos && s + 9 == pcb.size())
                    over->insert("binaryPairsBase", pcb.substr(0, s));
            }
            if (hasThermoBlock)
            {
                auto aux = udict->subDict("thermo");
                for (const auto& k : aux->keys())
                    over->insert(k, aux->entryValue(k));
            }
            for (const auto& k : over->keys())
                merged->insert(k, over->entryValue(k));
            std::unique_ptr<ThermoPackage> tpf = std::make_unique<ThermoPackage>();
            tpf->readFromDict(merged, *db_);
            const ThermoPackage& reff = *tpf;
            unitThermo_[uname] = std::move(tpf);
            return reff;
        }
        over = std::make_shared<Dictionary>("thermo");
        std::string liq;
        if (ctx->found("propertyMethods")
            && ctx->subDict("propertyMethods")->found("liquid"))
            liq = ctx->subDict("propertyMethods")->lookupWord("liquid");
        if (liq.rfind("activity.", 0) == 0)
        {
            const std::string model = liq.substr(std::string("activity.").size());
            // MULTI-PHASE LLE: the property context may declare 2+ LIQUID phases
            // (an NRTL gamma-gamma settler).  Translate the F2 `phases { <name> {
            // type liquid; activityModel <M>; } }` into the internal phases list so
            // readFromDict builds >= 2 liquid phases; else a single implicit liquid
            // via activityModel.
            if (ctx->found("phases"))
            {
                std::string pt = "phases (\n";
                auto ph = ctx->subDict("phases");
                for (const auto& pn : ph->keys())
                {
                    auto pd = ph->subDict(pn);
                    const std::string ptype = pd->lookupWordOrDefault("type", "liquid");
                    std::string pm = model;
                    if (pd->found("activityModel")) pm = pd->lookupWord("activityModel");
                    else if (pd->found("activity") && pd->subDict("activity")->found("model"))
                        pm = pd->subDict("activity")->lookupWord("model");
                    pt += "    { name " + pn + "; type " + ptype
                        + "; activity { model " + pm + "; } }\n";
                }
                pt += "    { name vapour; type vapor; eos { model idealGas; } }\n);\n";
                auto pdict = Dictionary::fromString(pt, "thermoFor.phases");
                over->insert("phases", pdict->entryValue("phases"));
            }
            else
            {
                auto am = std::make_shared<Dictionary>("activityModel");
                am->insert("model", std::string(model));
                over->insert("activityModel", EntryValue(am));
            }
            // Point the F2 model-parameter resolver at THIS context's propertyData:
            // an NRTL pair lives under <context>/constant/propertyData/parameters/,
            // NOT the plant root that fs::current_path() resolves to.  Without this
            // a nested unit's NRTL falls back to ideal (no pairs) -> a kerosene/water
            // settler finds NO liquid-liquid split (the loaded organic comes out
            // empty).  NRTL's per-node snapshot reads binaryPairsBase/constant/...
            {
                const std::string pcb = udict->lookupWord("propertyContextBase");
                const auto s = pcb.rfind("/constant");
                if (s != std::string::npos && s + 9 == pcb.size())
                    over->insert("binaryPairsBase", pcb.substr(0, s));
            }
            // Active-set projection: forward the context's declared domain --
            // ThermoPackage pushes it down into every activity block, the
            // NRTL restricts its pair matrix + announcement to it (components
            // stay GLOBAL; the doctrine is untouched).
            if (ctx->found("activeComponents"))
                over->insert("activeComponents", ctx->entryValue("activeComponents"));
            if (ctx->found("chemistry"))
                std::cout << "  [context] " << uname << ": liquid method " << liq
                          << " -> molecular world; inherited chemistry INACTIVE"
                             " (not required by " << liq << ")\n";
        }
        else if (liq.rfind("electrolyte.", 0) == 0)
        {
            auto pm = std::make_shared<Dictionary>("propertyMethods");
            pm->insert("liquid", std::string(liq));
            over->insert("propertyMethods", EntryValue(pm));
        }
        else
            return global;   // context does not change the liquid world -> global
        // Fold the auxiliary-only thermo{} (binaryPairsBase / activeComponents
        // from the wiring walk-up) OVER the context translation -- the nearest
        // pair-owning node wins, exactly the Item-0b precedence.
        if (hasThermoBlock)
        {
            auto aux = udict->subDict("thermo");
            for (const auto& k : aux->keys())
                over->insert(k, aux->entryValue(k));
        }
    }
    for (const auto& k : over->keys())
        merged->insert(k, over->entryValue(k));

    // MANIFEST-WORLD override (general solver): a per-unit `thermo {}` may select
    // a manifest world -- electrolyte.* etc. -- not only a flat activity/eos
    // model.  Those are ASSEMBLED by the ThermoPackageBuilder (subset-aware on
    // the global components), not readFromDict.  Detect an electrolyte liquid
    // method and route through the builder; every other override stays on the
    // flat readFromDict path exactly as before.
    bool manifestWorld = false;
    if (over->found("propertyMethods")
        && over->subDict("propertyMethods")->found("liquid"))
    {
        const std::string liq = over->subDict("propertyMethods")->lookupWord("liquid");
        if (liq.rfind("electrolyte.", 0) == 0) manifestWorld = true;
    }

    std::unique_ptr<ThermoPackage> tp;
    if (manifestWorld)
    {
        // Build a propertyPackage dict: the GLOBAL components + the override's
        // manifest fields (propertyMethods / chemistry / parameters).
        auto pkg = std::make_shared<Dictionary>("propertyPackage");
        std::string clist = "components ( ";
        for (std::size_t i = 0; i < global.n(); ++i)
            clist += global.comp(i).name() + " ";
        clist += ");";
        auto cd = Dictionary::fromString(clist, "thermoFor.pkgComponents");
        pkg->insert("components", cd->entryValue("components"));
        for (const auto& k : over->keys())
            if (k != "binaryPairsBase") pkg->insert(k, over->entryValue(k));
        tp = std::make_unique<ThermoPackage>(ThermoPackageBuilder::build(pkg, *db_));
    }
    else
    {
        tp = std::make_unique<ThermoPackage>();
        tp->readFromDict(merged, *db_);
    }
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
    globalMassResiduals_.clear();
    globalEnergyResiduals_.clear();
    unitProfiles_.clear();

    // ---- Seed the stream registry --------------------------------------
    //  Inlet stream state comes from the case's 0/ directory (one file per
    //  stream); a node cabled by a parent inherits its inlets from the
    //  parent's persisted state instead.
    std::map<std::string,StreamBounds> streamBounds;   // optional author cages

    // ---- Stream-state precedence (R2 dual reader, 2026-07-06) -----------
    //  If a `0/` directory exists, the COMPLETE initial state lives there --
    //  one file per stream in canonical componentFlows grammar
    //  (docs/architecture/stream-state-architecture.md).  Read it and IGNORE
    //  any legacy streams{} block: never a mixed source of truth.  This is the
    //  disk truth a topological drill-in materialises a member 0/ from.
    // Topology-first reader (forum #83): read the raw 0/ tree ONCE, keyed by
    // its dotted RELATIVE PATH (the file's identity) -- no basename step, no
    // seeding yet.  The actual seeding happens AFTER flattening, when the
    // canonical manifest (streamId -> path) exists: each graph stream is read
    // from its EXACT manifest path, and the manifest is compared against the
    // file set BEFORE the solve (missing/orphan is fatal pre-solve, so an
    // invalid 0/ can never contaminate the seeds it is rejected for).
    bool seededFrom0 = false;
    std::map<std::string, ProcessStream> rawState;   // dotted path -> state
    if (std::filesystem::exists("0") && std::filesystem::is_directory("0"))
    {
        rawState    = StreamStateIO::readStateDir("0", thermo);
        seededFrom0 = !rawState.empty();
    }

    // The legacy `streams {}` reader is REMOVED (forum #91-3 / #97-2: the
    // corpus debt reached zero, the doctrine gate blocks regression, and the
    // reader's continued existence was itself the shadow risk).  A steady
    // flowsheetDict carrying stream STATE refuses loudly -- never a silent
    // fallback, never a second source of truth beside 0/.
    if (dict->found("streams"))
        throw std::runtime_error(std::string("Flowsheet: this flowsheetDict "
            "carries a `streams {}` block -- the legacy steady stream-state "
            "reader is RETIRED.  Stream state lives in per-stream 0/ files ")
            + (seededFrom0
                ? "(this case HAS a 0/ tree; the block would silently shadow "
                  "it -- delete the block)."
                : "(author the domain inlets as 0/ files and run "
                  "bin/choupo-init0 to materialise the rest; then delete the "
                  "block).  See docs/architecture/stream-state-architecture.md."));
    // (Stream bounds{} rode only the retired reader; the cage returns, if
    //  ever, through the 0/ grammar -- streamBounds stays empty until then.)

    // (The phase-resolution Tc screen runs AFTER the manifest-based seeding
    //  below -- the streams to screen do not exist in the registry yet.)

    // ---- Read execution sequence & tear-stream declaration -------------
    //  A flowsheetDict is a fractal NODE: a LEAF if it carries
    //  `type` directly (one unit op --- "a unit op is a flowsheet of one"),
    //  a COMPOSITE if it carries a `units (...)` list.  For a leaf we
    //  synthesise the one-unit list here, so the rest of solve() is
    //  unchanged; single- vs multi-input is decided by the boundary size
    //  (1 inlet -> the `in` feed/composition path; >1 -> `inputs`/
    //  inputStreams), matching what buildAugmentedDict expects.
    std::vector<std::pair<std::string,std::string>> outletAliases;  // member output -> parent boundary outlet
    std::vector<DictPtr> units;
    // Tears collected from composite-level `tearStreams` declarations.
    // Empty for flat / leaf cases; populated by flattenNode for composites.
    std::vector<CompositeTear> compositeTears;
    // FLAT case: `units ( { ... } { ... } )` -- INLINE unit blocks (a dict list).
    // If `units` is instead a WORD list (bare folder names -- dignified units),
    // it falls through to the composite path below, exactly like `sectors`.
    // Mixed root REFUSES (forum #91): `units` + `sectors` on the same root
    // used to let the inline-units branch short-circuit the composite path
    // and silently DROP the sectors (found live: a case ran green with a
    // whole sector discarded).  Joining the two lists is not a fix -- order,
    // ownership and boundary semantics would be lost; a future heterogeneous
    // root will be ONE ordered `members (...)` list, decided at the forum.
    if (dict->found("units") && dict->found("sectors"))
        throw std::runtime_error("Flowsheet: this root declares BOTH `units` "
            "and `sectors` -- the two lists cannot coexist (the inline-units "
            "path silently discarded the sectors).  Put every member in ONE "
            "list: `units ( m1 m2 ... );` of folder names resolves each "
            "member's real kind (leaf or composite) from its own dict.");
    if (dict->hasDictList("units"))
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
        // A standalone unit MENTIONS its streams directly (sequential-modular:
        // a unit is defined by the streams it consumes and produces).  Preferred
        // grammar: `inputs ( ... ); outputs ( ... );` on the leaf itself; a
        // legacy `boundary { inlets; outlets; }` block is still accepted.
        std::vector<std::string> inlets, outlets;
        if (dict->found("boundary"))
        {
            auto b = dict->subDict("boundary");
            if (b->found("inlets"))  inlets  = b->lookupWordList("inlets");
            if (b->found("outlets")) outlets = b->lookupWordList("outlets");
        }
        else
        {
            if (dict->found("inputs"))     inlets = dict->lookupWordList("inputs");
            else if (dict->found("in"))    inlets = { dict->lookupWord("in") };
            if (dict->found("outputs"))    outlets = dict->lookupWordList("outputs");
        }
        if (inlets.empty() && outlets.empty())
            throw std::runtime_error("Flowsheet: standalone unit '" + nodeName
                + "' must MENTION its streams -- `inputs ( ... ); outputs ( ... );`"
                " (a sequential-modular unit is defined by its streams)");
        if (inlets.size() == 1) u->insert("in", std::string(inlets[0]));
        else                    u->insert("inputs",  EntryValue(inlets));
        u->insert("outputs", EntryValue(outlets));
        units = { u };
    }
    else if (dict->found("sectors") || dict->found("units"))
    {
        // COMPOSITE node (fractal step 2/3): flatten the members TREE
        // recursively into namespaced leaf units, cabling per `connections` at
        // each level.  A member may itself be composite --- flattenNode recurses
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
        // Tear designation may live in solverDict (the clean home); flattenNode
        // reads tearStreams off the flowsheetDict, so surface the solverDict list
        // onto the in-memory root dict before flattening (root only -- nested
        // composites keep their own tearStreams in their own dict).
        if (solverDict_ && solverDict_->found("tearStreams") && !dict->found("tearStreams"))
            dict->insert("tearStreams", solverDict_->entryValue("tearStreams"));
        // In a 0/ case the registry is still empty here (topology-first
        // reader): hand flattenNode the raw path-keyed state instead.  It
        // only uses the registry for tear lookups by qualified name (which
        // EQUALS the dotted path for a sector-owned tear) and for the
        // utility-port cabling ADVISORY -- never for stream identity.
        auto outMap = flattenNode(dict, "", "", rootInletMap, units,
                                  compositeTears, thermo,
                                  seededFrom0 ? rawState : streams_);
        for (const auto& [outlet, src] : outMap)
            outletAliases.emplace_back(src, outlet);
    }
    else
    {
        throw std::runtime_error("Flowsheet: node has neither a `units (...)`"
            " list, a `members (...)` list, nor a `type` (leaf node)");
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

    // ---- Manifest-based 0/ seeding (topology-first reader, forum #83) ---
    //  The flat topology now exists, so the canonical manifest
    //  (streamId -> relative path) is constructible -- the SAME
    //  StreamOwnership::canonicalManifest the converged/ writer and the
    //  post-run validator use, so the three can never disagree.  Each graph
    //  stream is seeded from its EXACT manifest path; a basename never
    //  participates in identity (A/feed and B/feed are two streams).
    //  COMPLETENESS is enforced HERE, before the solve: a graph stream with
    //  no state file (MISSING) or a state file no graph stream owns (ORPHAN)
    //  is fatal -- except under choupo-init0, whose whole purpose is to
    //  materialise the missing files (it keeps its own accounting).
    if (seededFrom0)
    {
        std::set<std::string> names;
        for (const auto& u : topology_)
        {
            for (const auto& i : u.ins)  names.insert(i);
            for (const auto& o : u.outs) names.insert(o);
        }
        // Pre-solve mirror of the post-solve boundaryAliases_: a parent's
        // RENAME of a member outlet (src != alias) is a label, not a file.
        std::set<std::string> aliases;
        for (const auto& [src, alias] : outletAliases)
            if (src != alias) aliases.insert(alias);

        const auto manifest =
            StreamOwnership::canonicalManifest(topology_, names, aliases);

        std::vector<std::string> missing, orphan;
        std::set<std::string> claimed;
        for (const auto& [id, p] : manifest)
        {
            std::string key;                      // dotted spelling of the path
            for (const auto& seg : p)
                key += (key.empty() ? "" : ".") + seg.string();
            auto it = rawState.find(key);
            if (it == rawState.end()) { missing.push_back(p.generic_string()); continue; }
            claimed.insert(key);
            ProcessStream s = it->second;
            s.name = id;
            streams_[id] = std::move(s);
        }
        for (const auto& [key, s] : rawState)
        { (void) s; if (!claimed.count(key)) orphan.push_back(key); }

        if ((!missing.empty() || !orphan.empty()) && !init0_)
        {
            std::string msg = "Flowsheet: 0/ COMPLETENESS violated BEFORE the "
                "solve (graph stream IDs != 0/ state files):\n";
            for (const auto& m : missing)
                msg += "  MISSING  0/" + m + "  (graph stream, no state file)\n";
            for (auto o : orphan)
            {
                for (auto& c : o) if (c == '.') c = '/';
                msg += "  ORPHAN   0/" + o + "  (state file, no graph stream)\n";
            }
            msg += "An invalid 0/ must never contaminate the seeds -- fix the "
                   "state tree (bin/choupo-init0 materialises missing files).";
            throw std::runtime_error(msg);
        }
        if (verbosity >= 2)
            std::cout << "[state] seeded " << claimed.size()
                      << " stream(s) from 0/ via the canonical manifest; "
                         "legacy streams{} ignored\n";
    }

    // ---- Phase resolution, layer 1: the Tc screen -----------------------
    //  (Vítor's rule + the ChatGPT design forum, ClaudeChat s.48/51.)  A
    //  stream whose spec does NOT pin the phase and whose T exceeds every
    //  present component's critical temperature cannot form a liquid: it is a
    //  permanent gas / supercritical SINGLE phase, so vf = 1.  This screen is
    //  cheap and thermo-context-INDEPENDENT (Tc is a global constant), so it
    //  belongs HERE in the resolver -- never in the file reader (the reader
    //  stays thermo-free; it reads only pins).  Sub-critical resolution by a
    //  flash, in the consuming unit's effective context, is layer 2 (a later
    //  increment); until then a non-pinned sub-critical stream keeps vf = 0.
    for (auto& [nm, s] : streams_)
    {
        (void) nm;
        if (s.vf > 1.0e-6 || s.T <= 0.0) continue;   // pinned/computed vapour, or no T
        scalar maxTc = 0.0; bool allHaveTc = true, anyPresent = false;
        for (std::size_t i = 0; i < thermo.n() && i < s.z.size(); ++i)
        {
            if (s.z[i] <= 0.0) continue;
            anyPresent = true;
            const scalar tci = thermo.comp(i).Tc();
            if (tci > 0.0) { if (tci > maxTc) maxTc = tci; }
            else { allHaveTc = false; break; }       // missing Tc -> do not screen
        }
        if (anyPresent && allHaveTc && s.T > maxTc)
            s.vf = 1.0;                               // above every Tc: no liquid possible
    }

    // Snapshot the AUTHORED state names (whatever 0/ or the legacy streams{}
    // supplied) BEFORE any tear auto-seeding -- choupo-init0 must distinguish
    // what the author wrote from what the engine estimated.
    std::set<std::string> authoredStates;
    for (const auto& [nm0, s0] : streams_) { (void) s0; authoredStates.insert(nm0); }

    // Tear designation is a NUMERICAL property: read it from solverDict (the
    // clean home) with a fallback to the flowsheetDict for un-migrated cases.
    std::vector<std::string> tears;
    if (solverDict_ && solverDict_->found("tearStreams"))
        tears = solverDict_->lookupWordList("tearStreams");
    else if (dict->found("tearStreams"))
        tears = dict->lookupWordList("tearStreams");
    // Composite tears (from any composite level inside the fractal
    // expansion): seed streams_ with the initial guess and add the
    // qualified name to the outer-loop tear list.  After this, internal
    // recycle in a sector iterates exactly like flat-case recycle.
    for (auto& ct : compositeTears)
    {
        // Deferred tear (topology-first reader): flattenNode found neither a
        // legacy streams{} guess nor a pre-seeded state.  The manifest-based
        // seeding above has run by now -- if the tear is STILL absent from
        // the registry, the case genuinely lacks an initial guess.
        if (!ct.hasInitial && !streams_.count(ct.qualifiedName))
            throw std::runtime_error("Flowsheet: tear stream '"
                + ct.qualifiedName + "' has no initial guess -- neither in "
                "`streams { " + ct.qualifiedName + " { ... } }` nor as a 0/ "
                "state file");
        if (ct.hasInitial && !streams_.count(ct.qualifiedName))
            streams_[ct.qualifiedName] = std::move(ct.initial);
        // Dedupe: a recycle the author ALSO named in `tearStreams` (a named-edge
        // root recycle detected here as a composite tear) must be torn ONCE.
        // Double-adding it made the outer Newton carry two identical tear slots
        // for one stream -- the phantom copy started unseeded and drove a fixed-D
        // column below B=0.
        if (std::find(tears.begin(), tears.end(), ct.qualifiedName) == tears.end())
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

    // ---- Outer-driver stream overrides (forum #52/#53) -------------------
    //  The driver's declared hand on stream state, applied to the SEEDED
    //  registry -- never a dict, so it works identically over 0/ and legacy.
    //  Only a BOUNDARY stream (a domain inlet) or an explicitly declared tear
    //  seed may be manipulated: an internal stream's state is a guess the
    //  solver overwrites, so steering it means nothing and is refused.
    if (!streamOverrides_.empty())
    {
        // Who produces what, from the flat unit list (the role rule).
        std::set<std::string> producedSet;
        for (const auto& u : units)
            if (u->found("outputs"))
                for (const auto& o : u->lookupWordList("outputs"))
                    producedSet.insert(o);
        const std::set<std::string> tearSet(tears.begin(), tears.end());

        for (const auto& [path, val] : streamOverrides_.all())
        {
            const auto dot = path.find('.');
            const std::string snm   = path.substr(0, dot);
            const std::string field = (dot == std::string::npos)
                                      ? std::string() : path.substr(dot + 1);
            auto it = streams_.find(snm);
            if (it == streams_.end())
                throw std::runtime_error("stream override '" + path
                    + "': no stream named '" + snm + "' in this domain");
            if (producedSet.count(snm) && !tearSet.count(snm))
                throw std::runtime_error("stream override '" + path + "': '"
                    + snm + "' is an INTERNAL/OUTLET stream -- its state is a "
                    "guess the solver overwrites, so steering it means nothing."
                    "  Manipulable: a domain inlet, or a tear declared in "
                    "solverDict `tearStreams`.");
            ProcessStream& st = it->second;
            const bool isTear = tearSet.count(snm) > 0;
            scalar base = 0.0;
            if      (field == "F") base = st.F;
            else if (field == "T") base = st.T;
            else if (field == "P") base = st.P;
            if      (field == "F") st.F = val;
            else if (field == "T") st.T = val;
            else if (field == "P") st.P = val;
            else if (field.rfind("moleFraction.", 0) == 0)
            {
                const std::string comp = field.substr(13);
                const std::size_t ci = thermo.indexOf(comp);
                if (val < 0.0 || val > 1.0)
                    throw std::runtime_error("stream override '" + path
                        + "': a mole fraction must lie in [0,1]");
                // Set this component's fraction; rescale the OTHERS to 1-val.
                const scalar rest = 1.0 - st.z[ci];
                for (std::size_t i = 0; i < st.z.size(); ++i)
                    st.z[i] = (i == ci) ? val
                            : (rest > 0.0 ? st.z[i] * (1.0 - val) / rest : 0.0);
            }
            else
                throw std::runtime_error("stream override '" + path
                    + "': unknown field '" + field + "' (F | T | P | "
                    "moleFraction.<component>)");
            // Observability (forum #53 pitfall 6): base -> applied, and the
            // target's ROLE.  A tear-seed manipulation is INITIALISATION-ONLY
            // -- announced as such; after this the recycle solver owns the
            // stream, so the knob steers where the iteration STARTS, never a
            // physical plant condition.
            if (verbosity >= 2)
            {
                std::cout << "  [driver] stream override ("
                          << (isTear ? "TEAR SEED, initialisation-only" : "inlet")
                          << "): " << snm << "." << field;
                if (field.rfind("moleFraction.", 0) == 0)
                    std::cout << " = " << val << "\n";
                else
                    std::cout << ": " << base << " -> " << val << " (SI)\n";
            }
        }
    }

    // ---- choupo-init0: materialise 0/ instead of solving -----------------
    if (init0_)
    {
        return runInit0(units, thermo, verbosity, authoredStates, tears);
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
    std::cout << "Source streams (case inlets, from 0/):\n";
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
        // Solution-directory tap for a TEAR-FREE flowsheet: there is no recycle
        // loop, so the single pass IS the converged answer --- emit it as the
        // lone instant 0 (pseudo-time 0, residual 0, converged).  This makes a
        // feed-forward branch (e.g. CONCENTRATION run standalone: a double-effect
        // evaporator + crystalliser, no recycle) write its own instant in place,
        // exactly like a recycle case writes its march.  Empty `tears` => no
        // tear flags, the per-branch bucketing still applies.
        if (onInstant_)
            onInstant_(0, "singlePass", 0.0, /*mass=*/0.0, /*energy=*/0.0,
                       /*converged=*/true, streams_, tears, topology_);
    }
    // ===================  Recycle outer loop  ===========================
    else
    {
        // Recycle numerics live in solverDict (clean home), flowsheetDict as a
        // fallback for un-migrated cases.
        auto recScalar = [&](const char* k, scalar def) {
            if (solverDict_ && solverDict_->found(k)) return solverDict_->lookupScalar(k);
            return dict->lookupScalarOrDefault(k, def);
        };
        auto recWord = [&](const char* k, const std::string& def) {
            if (solverDict_ && solverDict_->found(k)) return solverDict_->lookupWord(k);
            return dict->lookupWordOrDefault(k, def);
        };
        const int    maxOuter = static_cast<int>(recScalar("recycleMaxIter", 100));
        const scalar tearTol  = recScalar("recycleTol", 1.0e-5);
        // Default to Newton-on-tears; `recycleSolver Wegstein;` keeps
        // the fixed-point accelerator.  Both converge to the same tear
        // solution (the recycle fixed point is unique).
        std::string recSolver = recWord("recycleSolver", "Newton");
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

        // ---- Feed-normalisers for the physical residual plot --------------
        //  Computed ONCE from the frozen feeds (tears excluded), used to turn
        //  each iteration's tear mass/energy mismatch into a dimensionless,
        //  plant-relative residual.  Computed whenever there is a recycle loop:
        //  the GLOBAL mass / energy closure residuals are accumulated every
        //  outer iteration (globalMassResiduals_ / globalEnergyResiduals_) so
        //  the GUI convergence plot can draw them WITHOUT the solution-directory
        //  writer being installed -- the same physical residual the CLI plot
        //  reads from residuals.dat.  The cost is one tear-stream enthalpy/mass
        //  comparison per outer iteration (no extra sweep).
        const std::set<std::string> feedTearSet(tears.begin(), tears.end());
        const FeedScales feedScales =
            computeFeedScales(streams_, topology_, feedTearSet, thermo);

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
                // The restart hook (restartFromLatest) has ALREADY announced
                // the truthful reseed count / any missing tears; here we only
                // state the bookkeeping it can't know (history reset + base).
                itBase = resumed;
                std::cout << "  RESTART from instant " << resumed
                          << " -- acceleration history reset; iteration count"
                             " resumes at " << resumed << ".\n";
            }
        }
        if (onInstant_)
            onInstant_(itBase, "seed", 0.0, /*mass=*/0.0, /*energy=*/0.0,
                       false, streams_, tears, topology_);

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
                // Snapshot the ASSUMED tear streams (pre-sweep) so the physical
                // mass/energy imbalance can compare computed-vs-assumed below.
                // Always taken: the GLOBAL closure residual feeds the GUI plot,
                // not just the (opt-in) solution-directory writer.
                std::map<std::string, ProcessStream> assumedTears;
                for (const auto& t : tears) assumedTears[t] = streams_.at(t);
                sweep(/*quiet=*/true);
                sVector gx = packTears(tears, streams_);
                lastDelta = normL2(gx, x);
                const TearImbalance imb = computeTearImbalance(
                    assumedTears, streams_, tears, thermo, feedScales);
                globalMassResiduals_.push_back(imb.mass);
                globalEnergyResiduals_.push_back(imb.energy);
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
                               imb.mass, imb.energy,
                               false, streams_, tears, topology_);
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
            // The converged final instant is a SEPARATE point (its residual is
            // the post-convergence sweep, not the last iterate's), so it takes
            // the NEXT iteration number -- otherwise it collides with the last
            // marched iteration (both would land on the same x and the residual
            // plot shows two values at one iteration / a vertical plunge).
            finalIteration = itBase + outerIt + 1;
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
                // GLOBAL closure residual.  `tr.normF` describes the iterate
                // `tr.x`; the last residual call inside newtonND left streams_
                // at a line-search probe, NOT at tr.x.  Re-sync to tr.x (one
                // extra sweep) so the physical mass/energy imbalance compares
                // the ASSUMED tear (tr.x) against its image G(tr.x), matching
                // the reported residual.  Done EVERY outer iteration so the GUI
                // convergence plot has the global curves even when the
                // solution-directory writer is off; the writer (when installed)
                // reuses the same imbalance.
                residual(tr.x);   // place streams_ exactly at G(tr.x)
                // Decode the ASSUMED tear streams from tr.x (same layout as
                // packFlow: per tear, nc component flows then T) to measure
                // the physical computed-vs-assumed mass/energy imbalance.
                std::map<std::string, ProcessStream> assumedTears;
                {
                    std::size_t off = 0;
                    for (const auto& name : tears)
                    {
                        ProcessStream a = streams_.at(name);   // template (P, etc.)
                        scalar F = 0.0; std::vector<scalar> Fi(nc);
                        for (std::size_t i = 0; i < nc; ++i)
                        { Fi[i] = std::max(tr.x[off++], 0.0); F += Fi[i]; }
                        a.F = F;
                        a.z.assign(nc, 0.0);
                        for (std::size_t i = 0; i < nc; ++i)
                            a.z[i] = (F > 0.0) ? Fi[i] / F : 0.0;
                        a.T = tr.x[off++];
                        // a.vf carries over from the template (computed) as
                        // the phase proxy; computeTearImbalance recomputes
                        // the enthalpy from (T,P,vf,z) consistently on both
                        // sides, so we need not set a.H here.
                        assumedTears[name] = a;
                    }
                }
                const TearImbalance imb = computeTearImbalance(
                    assumedTears, streams_, tears, thermo, feedScales);
                globalMassResiduals_.push_back(imb.mass);
                globalEnergyResiduals_.push_back(imb.energy);
                // Solution-directory tap (cadence/final decided by the
                // installed callback; empty => no-op).
                if (onInstant_)
                    onInstant_(itBase + tr.iteration + 1, "newtonOnTears",
                               tr.normF, imb.mass, imb.energy,
                               false, streams_, tears, topology_);
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
            // NEXT iteration number for the converged instant (see the Wegstein
            // branch): the marched iterations wrote itBase+1 .. itBase+iters, so
            // the final converged point is itBase+iters+1 -- never the same x as
            // the last iterate (which caused two values at iteration N / the
            // vertical drop in the residual plot).
            finalIteration = itBase + res.iterations + 1;
            finalSolver    = "newtonOnTears";
        }

        // One final pass with full logging (common to both solvers).
        std::cout << "\n----- Final pass with full unit logging -----\n";
        // Snapshot the converged tear streams so the FINAL instant's physical
        // residuals reflect the (near-zero) mismatch of this last sweep.  Taken
        // always: the final point is the converged tail of the GUI plot's
        // global mass/energy curves (and the writer reuses it when installed).
        std::map<std::string, ProcessStream> finalAssumedTears;
        for (const auto& t : tears)
            if (streams_.count(t)) finalAssumedTears[t] = streams_.at(t);
        sweep(/*quiet=*/false);
        const TearImbalance finalImb = computeTearImbalance(
            finalAssumedTears, streams_, tears, thermo, feedScales);
        globalMassResiduals_.push_back(finalImb.mass);
        globalEnergyResiduals_.push_back(finalImb.energy);

        // Solution-directory: write the converged final instant (tagged
        // converged true;).  This is the canonical result that feeds the JSON
        // and reports/.  Always written (off-cadence is fine), so a restart
        // and the answer are never confused with a mid-convergence snapshot.
        //
        // R3 (pseudo-time must advance): when the recycle converged in ZERO
        // outer iterations (a restart whose seed was already the fixed point),
        // finalIteration == itBase == the seed instant's number.  Writing the
        // final there would OVERWRITE the seed (remove_all+rename) and `latest`
        // would never advance, so repeated restarts would stall.  Bump the
        // final by one so each restart cleanly advances (and is idempotent).
        if (onInstant_)
        {
            const int finalInstNum =
                (finalIteration == itBase) ? itBase + 1 : finalIteration;
            onInstant_(finalInstNum, finalSolver, finalResidual,
                       finalImb.mass, finalImb.energy,
                       finalConverged, streams_, tears, topology_);
        }

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
    //      member outputs under the parent's boundary-outlet names, so a
    //      parent (the plant) can cable `<sector>/<outlet>` next. ---------
    for (const auto& [src, alias] : outletAliases)
        // A named-edge outlet's producer output IS the edge name (src == alias):
        // that is the stream IDENTITY, not a boundary rename -- don't mark it as
        // an alias (else the state writer would skip its file).  Only a genuine
        // rename (legacy anonymous: BRINE.halite -> halite) is a boundary alias.
        if (streams_.count(src) && src != alias)
        { streams_[alias] = streams_.at(src); boundaryAliases_.insert(alias); }

    // ---- Reconcile named-edge LABELS with the streams that carry them ----
    //  The 0/ reader seeds every state file under its BARE name (`liquor`), but a
    //  stream PRODUCED inside a sector is written back under its QUALIFIED name
    //  (`BRINE.liquor`) -- the label and the identity part company.  The bare copy
    //  then survives as a fossil of the initial GUESS: harmless to the solve, which
    //  never reads it, and poisonous to the report, which prints it as though it
    //  were the answer.  It stayed invisible only because a plant's 0/ is usually
    //  materialised FROM a converged run, so the fossil happened to equal the
    //  solution.  Perturb the seed and the fossil shows.
    //
    //  Point each label at the stream it names.  Only when the match is
    //  UNAMBIGUOUS (exactly one `<sector>.<label>`); a domain inlet has no producer
    //  and therefore no qualified counterpart, so it is untouched.
    {
        // Candidate bare labels: every base that exactly ONE qualified stream
        // carries.  Two kinds are (re)pointed at the stream they name:
        //   * an EXISTING bare entry (a legacy fossil of the old byBase
        //     seeding, or a legacy streams{} seed) -- refreshed in place;
        //   * an ABSENT one -- CREATED, because the author's connection KEY is
        //     the bare edge name (`reactorOut`, not `REACTION.reactorOut`) and
        //     the report + goldens speak the author's vocabulary.  The
        //     topology-first reader seeds by manifest ID only, so without this
        //     the label would exist solely as an accident of the old reader.
        // Either way it is a LABEL (boundaryAliases_), never a second state
        // file -- the canonical manifest skips aliases.
        // A bare name that IS a real graph stream (someone produces or
        // consumes it AS SPELLED) is NEVER a label slot: a top-level `feed`
        // next to a sector-internal `A.feed` is two different streams
        // (forum #87-P0) -- hijacking the real one with a label copy of the
        // qualified twin corrupted the registry.
        std::set<std::string> topoNames;
        for (const auto& fu : topology_)
        {
            for (const auto& i : fu.ins)  topoNames.insert(i);
            for (const auto& o : fu.outs) topoNames.insert(o);
        }
        std::map<std::string, std::pair<std::string,int>> byBase;  // base -> (qualified, hits)
        for (const auto& [other, os] : streams_)
        {
            (void) os;
            const auto dot = other.rfind('.');
            if (dot == std::string::npos) continue;
            auto& e = byBase[other.substr(dot + 1)];
            e.first = other; ++e.second;
        }
        for (const auto& [bare, m] : byBase)
        {
            if (m.second != 1) continue;                      // ambiguous: no label
            if (topoNames.count(bare)) continue;              // a REAL stream, not a label slot
            streams_[bare] = streams_.at(m.first);
            streams_[bare].name = bare;
            boundaryAliases_.insert(bare);       // a label, not a second state file
        }
    }

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
    // tabulated phase (standardThermochemistry.phase -- gas / liquid / solid),
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
            // ONE enthalpy surface everywhere: the published .H uses the SAME
            // canonical elements-datum form (h_ig − ΔHvap_latent(T)) that the
            // energy-balance report reads (H_stream_formation), so the number
            // the student SEES on the stream and the number that closes the
            // balance are byte-identical -- not two latent models that differ
            // by ∫cpLiq-vs-Watson and silently disagree.
            if (s.vf > 1.0e-9 && s.vf < 1.0 - 1.0e-9
                && !thermo.phasesOfType("vapor").empty())
            {
                FlashInput fin; fin.F = 1.0; fin.T = s.T; fin.P = s.P; fin.z = s.z;
                FlashOptions fopts; fopts.verbosity = 0;
                const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fopts);
                if (fs.converged
                    && fs.V_over_F > 1.0e-9 && fs.V_over_F < 1.0 - 1.0e-9)
                    s.H = (1.0 - fs.V_over_F) * thermo.H_stream_formation(s.T, s.P, 0.0, fs.x)
                        +        fs.V_over_F  * thermo.H_stream_formation(s.T, s.P, 1.0, fs.y);
                else
                    s.H = thermo.H_stream_formation(s.T, s.P, s.vf, s.z);
            }
            else
                s.H = thermo.H_stream_formation(s.T, s.P, s.vf, s.z);
            s.H_valid = std::isfinite(s.H);
        }
        catch (const std::exception& e)
        {
            // LOUD fallback (forum 2026-06-28; no silent crutch): a species could
            // not be placed on the formation datum.  Announce it ONCE per distinct
            // cause (the kernel names the species), then fall back to the SENSIBLE
            // datum so the stream enthalpy is VALID and the boundary balance CLOSES
            // -- the missing formation reference cancels in h_out - h_in for a
            // conserved species; only a reacting / crystallising one would be
            // mis-counted, and THAT is exactly what the announcement flags.  Never
            // silent: the user sees the downgrade, never a hidden one.
            if (AdvisoryLog::instance().add("thermo", "warning", "enthalpy-gap", e.what()))
                std::cerr << "[thermo] enthalpy GAP (formation datum): " << e.what()
                          << "\n          -> using the per-natural-phase BLEND for"
                             " this stream (a degraded datum: it drifts from the"
                             " canonical surface and never enters a closed"
                             " balance; fix the species data to close it).\n";
            try { s.H = thermo.H_blendPerNaturalPhase(s.T, s.P, s.vf, s.z); s.H_valid = std::isfinite(s.H); }   // AUTHORIZED-BLEND: announced degraded .H fallback
            catch (const std::exception&) { s.H_valid = false; }
        }
        // Record WHICH present species (if any) have no elements-datum enthalpy
        // -- so a downstream consumer (the energy-balance report, the GUI
        // energy plot) can tell a missing-DATA skip (refuse + name it) from a
        // composition skip (z_i = 0, legitimately silent), instead of seeing a
        // bare H_valid = false and quietly dropping the stream.
        s.H_missing = reporting::missingEnthalpyData(s, thermo);
        // Total FLOW enthalpy [kW]: the fluid (F*H) PLUS the crystalline phase
        // (s[] on the solid datum, Σ s[i]*h°(solid,T) -- the SAME leg the energy
        // report's solidH_elements uses).  A solid product (sucrose Powder) keeps
        // its mass in s[], not F*H, so without this the boundary balance is short
        // by the crystal formation enthalpy and the GUI plot does not close.
        try
        {
            scalar solidH = 0.0;            // kW
            for (std::size_t i = 0; i < s.s.size() && i < thermo.n(); ++i)
                if (s.s[i] > 0.0)
                    solidH += s.s[i] * thermo.comp(i).h_formation(s.T, "solid");
            s.H_flow_kW = (s.H_valid ? s.F * s.H : 0.0) + solidH;
            s.H_flow_valid = std::isfinite(s.H_flow_kW)
                          && (s.H_valid || solidH != 0.0);
        }
        catch (const std::exception&)
        {
            s.H_flow_valid = false;
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

// ===========================================================================
//  choupo-init0 -- materialise 0/ by explicit propagation (arch step 2).
//
//  The author supplies the DOMAIN INLETS (and any cycle-breaking seeds); this
//  pass walks the flat unit list in flow order and writes an initial-state
//  file for every stream the author did not.  The estimates are deliberately
//  naive -- a unit's outputs get its MIXED inlet state with the flow split
//  evenly -- because they are GUESSES the solver will overwrite; what matters
//  is that they exist ON DISK, announced and inspectable, instead of being
//  invented silently in memory.  A stream trapped inside an unseeded recycle
//  cannot be propagated from the feeds (that is only honest on an acyclic
//  graph), so it is a FATAL asking for a seed, never a magic constant.
// ===========================================================================
int Flowsheet::runInit0(const std::vector<DictPtr>&     units,
                        const ThermoPackage&            thermo,
                        int                             verbosity,
                        const std::set<std::string>&    authored,
                        const std::vector<std::string>& tears)
{
    namespace fs = std::filesystem;

    // ---- The flat graph: who consumes / produces each stream --------------
    auto inputsOf = [](const DictPtr& u) {
        std::vector<std::string> in;
        if (u->found("in"))          in.push_back(u->lookupWord("in"));
        else if (u->found("inputs")) in = u->lookupWordList("inputs");
        return in;
    };
    auto outputsOf = [](const DictPtr& u) {
        return u->found("outputs") ? u->lookupWordList("outputs")
                                   : std::vector<std::string>{};
    };

    std::map<std::string, std::string> producerOf, firstConsumerOf;
    std::set<std::string> graphStreams;
    for (const auto& u : units)
    {
        const std::string uname = u->lookupWordOrDefault("name", "unit");
        for (const auto& si : inputsOf(u))
        {
            graphStreams.insert(si);
            if (!firstConsumerOf.count(si)) firstConsumerOf[si] = uname;
        }
        for (const auto& so : outputsOf(u))
        {
            graphStreams.insert(so);
            producerOf[so] = uname;
        }
    }

    // ---- Where each stream's 0/ file lives: THE ownership rule, in its ONE
    //  home (StreamOwnership::ownershipPath -- D1, forum #55).  This replica
    //  used to re-derive it and got it wrong on its first outing.
    auto pathOf = [&](const std::string& nm) -> fs::path {
        return fs::path("0")
             / StreamOwnership::ownershipPath(nm, producerOf, firstConsumerOf);
    };

    // ---- Every INLET must be authored: it is a boundary spec, not a guess --
    std::vector<std::string> missingInlets;
    for (const auto& nm : graphStreams)
        if (!producerOf.count(nm) && !authored.count(nm))
            missingInlets.push_back(nm);
    if (!missingInlets.empty())
    {
        std::cerr << "\nERROR: choupo-init0: a domain INLET is a boundary "
                     "specification the author must write -- it cannot be "
                     "estimated from nothing:\n";
        for (const auto& m : missingInlets)
            std::cerr << "  MISSING INLET  " << pathOf(m).generic_string()
                      << "  (stream '" << m << "')\n";
        return 1;
    }

    // ---- Propagate: a unit whose inputs are all known estimates its outputs.
    std::set<std::string> known;
    for (const auto& nm : graphStreams)
        if (streams_.count(nm)) known.insert(nm);      // authored + tear seeds

    std::set<std::string> generated;
    bool progress = true;
    while (progress)
    {
        progress = false;
        for (const auto& u : units)
        {
            const auto ins  = inputsOf(u);
            const auto outs = outputsOf(u);
            if (outs.empty()) continue;
            bool ready = true;
            for (const auto& si : ins) if (!known.count(si)) { ready = false; break; }
            if (!ready) continue;
            bool anyUnknown = false;
            for (const auto& so : outs) if (!known.count(so)) { anyUnknown = true; break; }
            if (!anyUnknown) continue;

            // Mixed inlet state: flows add, T flow-weighted, P the lowest inlet.
            ProcessStream mix;
            mix.z.assign(thermo.n(), 0.0);
            scalar Tw = 0.0, Pmin = 0.0;
            for (const auto& si : ins)
            {
                const auto& st = streams_.at(si);
                for (std::size_t i = 0; i < st.z.size() && i < mix.z.size(); ++i)
                    mix.z[i] += st.F * st.z[i];
                Tw    += st.F * st.T;
                mix.F += st.F;
                mix.vf += st.F * st.vf;
                Pmin = (Pmin <= 0.0) ? st.P : std::min(Pmin, st.P);
            }
            if (mix.F > 0.0)
            {
                for (auto& zi : mix.z) zi /= mix.F;
                mix.T  = Tw / mix.F;
                mix.vf = std::min(1.0, std::max(0.0, mix.vf / mix.F));
            }
            mix.P = (Pmin > 0.0) ? Pmin : 101325.0;

            const scalar Fout = (outs.empty() ? 0.0 : mix.F / scalar(outs.size()));
            for (const auto& so : outs)
            {
                if (known.count(so)) continue;
                ProcessStream est = mix;
                est.name = so;
                est.F    = Fout;
                streams_[so] = est;
                known.insert(so);
                generated.insert(so);
                progress = true;
            }
        }
    }

    // ---- Anything still unknown sits inside an unseeded recycle ------------
    std::vector<std::string> stuck;
    for (const auto& nm : graphStreams) if (!known.count(nm)) stuck.push_back(nm);
    if (!stuck.empty())
    {
        std::cerr << "\nERROR: choupo-init0: these streams sit inside a RECYCLE "
                     "the feeds cannot reach (propagation is only honest on an "
                     "acyclic graph).  Break the cycle: declare a tear in "
                     "solverDict `tearStreams ( ... );` (its seed is then "
                     "derived and persisted), or author the file yourself:\n";
        for (const auto& m : stuck)
            std::cerr << "  UNREACHED  " << pathOf(m).generic_string()
                      << "  (stream '" << m << "')\n";
        return 1;
    }

    // ---- Persist: every non-authored state becomes a 0/ file ---------------
    //  A tear the engine auto-seeded is persisted too (arch 2.5: "a tear
    //  carries its seed here").  An authored file is NEVER rewritten; --force
    //  regenerates existing INTERNAL/OUTLET files, never an inlet.
    std::size_t nWritten = 0, nKept = 0;
    for (const auto& nm : graphStreams)
    {
        const bool isInlet = !producerOf.count(nm);
        const fs::path f = pathOf(nm);
        if (authored.count(nm) && !generated.count(nm))
        {
            const bool isTearSeed =
                std::find(tears.begin(), tears.end(), nm) != tears.end();
            if (fs::exists(f)) { ++nKept; continue; }        // authored on disk
            if (!isTearSeed && isInlet) continue;              // legacy inlet: written below
        }
        if (fs::exists(f) && !init0Force_)
        {
            if (verbosity >= 2)
                std::cout << "  [init0] kept      " << f.generic_string()
                          << "  (exists; --force regenerates)\n";
            ++nKept;
            continue;
        }
        if (fs::exists(f) && isInlet) { ++nKept; continue; }  // never touch an inlet
        if (!streams_.count(nm)) continue;

        fs::create_directories(f.parent_path());
        StreamStateIO::writeStreamState(streams_.at(nm), thermo, f);
        {
            std::ofstream app(f, std::ios::app);
            app << "\n// generated by choupo-init0 -- an initial ESTIMATE "
                   "propagated from the authored inlets;\n"
                   "// the solver overwrites it.  Edit freely; "
                   "choupo-init0 never overwrites without --force.\n";
        }
        if (verbosity >= 1)
            std::cout << "  [init0] wrote     " << f.generic_string()
                      << "  (" << (isInlet ? "inlet, from legacy streams{}"
                                 : producerOf.count(nm) && !firstConsumerOf.count(nm)
                                   ? "outlet estimate" : "internal estimate")
                      << ")\n";
        ++nWritten;
    }

    // Legacy-migration path: an authored LEGACY inlet (streams{} block, no 0/
    // yet) must be materialised too, or 0/ stays incomplete.
    for (const auto& nm : graphStreams)
    {
        const fs::path f = pathOf(nm);
        if (fs::exists(f) || !streams_.count(nm)) continue;
        fs::create_directories(f.parent_path());
        StreamStateIO::writeStreamState(streams_.at(nm), thermo, f);
        if (verbosity >= 1)
            std::cout << "  [init0] wrote     " << f.generic_string()
                      << "  (migrated from legacy streams{})\n";
        ++nWritten;
    }

    std::cout << "\n[init0] 0/ materialised: " << graphStreams.size()
              << " graph streams == " << (nWritten + nKept)
              << " state files  (" << nWritten << " written, "
              << nKept << " kept)\n"
              << "[init0] no simulation was run -- `choupoSolve` solves from "
                 "this state.\n";
    return 0;
}


} // namespace Choupo
