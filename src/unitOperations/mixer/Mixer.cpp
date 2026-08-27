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

#include "Mixer.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <sstream>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace Choupo {

// Phase-aware adiabatic mixer (credo / FLOWTRAN AFLSH, combine half).
// Combines N inlet streams into ONE outlet:
//
//   * P_out = min(P_inlet) --- high-P streams let down into the lowest-P
//     header (the physical outcome of an unguarded junction); the surplus
//     mechanical energy dissipates.  To RECOVER it, put an explicit
//     turbine / pressure-exchanger upstream (a visible step, never hidden).
//   * F_out = Σ F_k,  z_out = Σ F_k z_k / F_out,  solids summed through.
//   * Mass + energy balance on the DOMINANT phase; T_out is a RESULT.  No
//     heat is added (heat has a source -> a visible heater, never inside
//     the mixer).
//
// The mixer MIXES; it does NOT do the V/L split.  That is a flash drum's
// job downstream ("mixers mix, flashes separate").  A gas+gas or
// liquid+liquid mix never changes phase, so a single-phase energy balance
// on the dominant phase is exact AND robust (smooth, monotonic Newton --- no
// fragile flash inside a recycle loop).  A genuine gas+liquid (direct-contact)
// mix gets the dominant-phase T; feed its outlet to a flash drum to resolve
// the split.
//
// Enthalpy datum: formation-reference H_stream when every component carries
// standardThermochemistry (the only datum that sums a gas and a liquid stream
// consistently); else the sensible Hliquid datum (legacy liquid-only cases).
// For a non-reacting mix the datum cancels in H_out - H_in.
int Mixer::solve(const DictPtr& dict,
                 const ThermoPackage& thermo,
                 int verbosity)
{
    auto inputs = dict->lookupDictList("inputStreams");
    if (inputs.empty())
        throw std::runtime_error("Mixer: no input streams");

    const std::size_t n = thermo.n();
    const scalar Tref = 298.15;

    bool useFormation = true;
    for (std::size_t i = 0; i < n; ++i)
        if (!thermo.comp(i).hasGibbsData()) { useFormation = false; break; }

    scalar  F_out     = 0.0;
    sVector Fz(n, 0.0);
    sVector s_out(n, 0.0);
    scalar  Hin_total = 0.0;            // Σ F_k · h_k   [(kmol/s)(J/mol)]
    scalar  vfw       = 0.0;            // Σ F_k · vf_k  (flow-weighted vf)
    //  How many inlets arrive on each side -- not for the arithmetic (that is
    //  vfw's job) but so the unit can say whether the dominant label was a
    //  choice at all.  See the announcement below the phase decision.
    std::size_t nVapIn = 0, nLiqIn = 0;
    int     nLiquidInlets = 0;          // vf < 0.5 count (the emulsion line)
    scalar  P_out     = std::numeric_limits<scalar>::infinity();
    scalar  T_first   = 0.0;
    bool    haveFirst = false;

    auto hInlet = [&](scalar T, scalar P, scalar vf, const sVector& z) -> scalar
    {
        return useFormation ? thermo.H_stream_formation(T, P, vf, z)
                            : thermo.Hliquid(T, z, Tref);
    };

    if (verbosity >= 3) std::cout << "Mixer inputs:\n";
    for (const auto& sd : inputs)
    {
        const scalar F  = sd->lookupScalar("F");
        const scalar T  = sd->lookupScalar("T");
        const scalar P  = sd->lookupScalar("P");
        const scalar vf = sd->lookupScalarOrDefault("vf", 0.0);

        auto cd = sd->subDict("composition");
        sVector z(n, 0.0);
        scalar zsum = 0.0;
        for (const auto& key : cd->keys())
        {
            std::size_t i = thermo.indexOf(key);
            z[i] = cd->lookupScalar(key);
            zsum += z[i];
        }
        if (zsum > 0.0) for (auto& v : z) v /= zsum;

        if (sd->found("solids"))
        {
            auto sol = sd->subDict("solids");
            if (sol->found("solidMolarFlows"))
            {
                auto sf = sol->subDict("solidMolarFlows");
                for (const auto& key : sf->keys())
                    s_out[thermo.indexOf(key)] += sf->lookupScalar(key);
            }
        }

        if (verbosity >= 3)
        {
            std::cout << "  F = " << std::setw(8) << (F * 3600.0) << " kmol/h"
                      << "   T = " << std::setw(7) << T << " K"
                      << "   P = " << (P * 1.0e-5) << " bar"
                      << "   vf = " << std::setprecision(3) << vf << "    (";
            for (std::size_t i = 0; i < n; ++i)
                std::cout << thermo.comp(i).name() << "=" << z[i]
                          << (i+1<n?", ":")");
            std::cout << "\n";
        }

        F_out += F;
        for (std::size_t i = 0; i < n; ++i) Fz[i] += F * z[i];
        if (P < P_out) P_out = P;
        Hin_total += F * hInlet(T, P, vf, z);
        vfw       += F * vf;
        (vf >= 0.5 ? nVapIn : nLiqIn)++;
        if (vf < 0.5) ++nLiquidInlets;
        if (!haveFirst) { T_first = T; haveFirst = true; }
    }

    //  THE UNSOLVED DECOMPOSITION, said at its site (DEV.md item 9, the
    //  lithium plant's emulsion; announcement authorised 2026-08-24, the
    //  stream-grammar half stays with the C3 uniform-phases review).  A
    //  mixer merges and never solves a phase split, so two liquid inlets
    //  leave as ONE apparent liquid whether they are miscible or not --
    //  and the outlet FILE cannot say which.  This line says so where the
    //  merge happens.  LOG-ONLY, deliberately: it is true of every
    //  liquid+liquid merge (no immiscibility is claimed or checked --
    //  that would be a phase model this unit does not have), so riding
    //  the durable caveat surface would put a conditional sentence in
    //  every converged result; the file-level answer is C3's.
    if (verbosity >= 2 && nLiquidInlets >= 2)
        std::cout << "  [mixer] " << nLiquidInlets << " liquid inlets merged"
                     " as ONE apparent liquid -- no phase split is solved"
                     " here; if these liquids are immiscible the outlet is"
                     " an unresolved emulsion until a downstream unit"
                     " (settler / flash) owns the split\n";

    if (F_out <= 0.0)
        throw std::runtime_error("Mixer: total inlet flow is zero");

    sVector z_out(n);
    for (std::size_t i = 0; i < n; ++i) z_out[i] = Fz[i] / F_out;

    const scalar h_req = Hin_total / F_out;                // J/mol target
    const scalar vf_in = vfw / F_out;                      // dominant phase

    // Energy basis: the dominant phase (flow-weighted vf) --- smooth, monotonic.
    const bool   gasDominant = useFormation && (vf_in >= 0.5);
    const scalar vfFix       = gasDominant ? 1.0 : 0.0;

    // ISOTHERMAL OPTION (operation.T given): the student DECLARES the mix
    // temperature and the mixer skips the adiabatic energy balance.  Honest
    // and explicit --- the mixer ANNOUNCES it.  Use it when (a) a furnace /
    // heater downstream fixes T anyway (e.g. the HDA reactor feed lumps its
    // furnace into operation.T 900), or (b) the adiabatic single-phase balance
    // is ill-posed: in a genuine gas+liquid mix the liquid species carry a
    // large formation+latent gap on the dominant (gas) basis, which can push
    // the 1-D Newton in T off its [150, 2500] K bracket (no root -> "failed to
    // converge").  Mixing is exact regardless; only the energy datum for T is
    // the question, and here the author owns it.
    bool   isothermal = false;
    scalar T_spec     = 0.0;
    if (dict->found("operation"))
    {
        auto operDict = dict->subDict("operation");
        if (operDict->found("T")) { isothermal = true; T_spec = operDict->lookupScalar("T"); }
    }

    scalar T_out     = T_first;
    bool   converged = true;

    if (isothermal)
    {
        T_out = T_spec;
    }
    else
    {
        // Energy balance on the dominant phase --- smooth, monotonic, robust.
        auto f  = [&](scalar T) {
            const scalar h = useFormation ? thermo.H_stream_formation(T, P_out, vfFix, z_out)
                                          : thermo.Hliquid(T, z_out, Tref);
            return h - h_req;
        };
        auto df = [&](scalar T) { const scalar d = 0.5; return (f(T+d) - f(T-d)) / (2.0*d); };

        solver::NROptions nro;
        nro.tolerance          = 1.0;
        nro.maxIter            = 40;
        nro.lower              = 150.0;
        nro.upper              = gasDominant ? 2500.0 : 700.0;
        nro.bracket            = true;
        nro.monotoneIncreasing = true;
        nro.maxStep            = 50.0;
        auto r = solver::newton1D(f, df, T_first, nro);
        T_out     = r.x;
        converged = r.converged;

        //  ---- THE DIAGNOSIS EXISTED AND ONLY THE COMMENT HAD IT ----------
        //
        //  The paragraph above this block states precisely why an adiabatic
        //  mix fails and what the author should do about it -- and it said so
        //  to a reader of the SOURCE.  A student saw `Flowsheet: unit 'mix'
        //  failed to converge`, with no residual, no bracket, no iterate and
        //  no remedy, on what is the single commonest failure in a first
        //  flowsheet: a recycle whose seed is not yet near its answer.  That
        //  is a field the engine cannot see, one level up -- the engine KNEW
        //  and told nobody.
        //
        //  It throws here rather than returning 1, because the flowsheet
        //  turns any non-zero return into a generic sentence and the detail
        //  would be discarded at exactly the moment it is needed.
        //
        //  MIXING IS EXACT REGARDLESS, and saying so is not consolation: it
        //  tells the reader the material balance is not in question and stops
        //  them looking for an error in their flowsheet's topology.
        if (!converged)
        {
            std::ostringstream m;
            m << "Mixer: the ADIABATIC energy balance found no outlet"
                 " temperature.\n"
                 "  The material mix is EXACT and is not in question -- only"
                 " the temperature is.\n"
                 "  Newton on H(T) = H_inlets searched ["
              << nro.lower << ", " << nro.upper << "] K (the "
              << (gasDominant ? "vapour" : "liquid")
              << "-dominant bracket), reached T = " << r.x
              << " K after " << r.iterations << " iteration(s), and the"
                 " enthalpy still misses by " << f(r.x) << " J/s.\n"
                 "  THIS IS USUALLY NOT A TOLERANCE.  Two causes, and both"
                 " are about the DATUM, not the solver:\n"
                 "    * the inlets are at very different states and the"
                 " adiabatic mix is genuinely ill-posed\n"
                 "      on one phase basis -- a liquid species mixed into a"
                 " dominant gas carries a large\n"
                 "      formation+latent gap, and the balance has no root"
                 " inside any physical bracket;\n"
                 "    * a RECYCLE seed that is still far from its answer, so"
                 " the mix is being asked about\n"
                 "      a state the converged flowsheet never visits.\n"
                 "  REMEDY: if a downstream unit fixes the temperature anyway"
                 " (a furnace, a reactor with\n"
                 "  its own operation.T), declare the mixer ISOTHERMAL --"
                 " `operation { T <K>; }` -- and the\n"
                 "  author owns that datum explicitly instead of the solver"
                 " inventing one.  Otherwise give\n"
                 "  the tear a better seed in 0/, or tear a different stream.";
            throw std::runtime_error(m.str());
        }
    }

    const scalar      vf_out = vfFix;
    const std::string regime = gasDominant ? "vapour" : "liquid";

    //  ---- "DOMINANT" IS A LABEL, AND THE READER CANNOT ACT ON THE WORD ----
    //
    //  This unit MIXES; it does not FLASH.  The outlet carries the
    //  flow-weighted dominant phase as a single label, which is exact when
    //  the inlets agree and is a CHOICE when they do not.  Printing the word
    //  "dominant" told the reader a decision had been made without telling
    //  them one had been available.
    //
    //  It matters because the consequence surfaces far away and in someone
    //  else's voice: mixing a vapour reactor feed with a liquid recycle
    //  labelled the outlet LIQUID at 900 K, and the energy report -- 200
    //  lines later, per unit, several times over -- proved with a
    //  Rachford-Rice residual that no fluid can hold that label.  The report
    //  is right and its detection stays the ONE home for the check; what was
    //  missing is the unit saying what it DID, where it did it.
    //
    //  A statement about the action, never a second detection.
    if (verbosity >= 2)
    {
        if (nVapIn > 0 && nLiqIn > 0)
            std::cout << "\n  [mixer] the inlets are of UNLIKE phases ("
                      << nVapIn << " vapour, " << nLiqIn << " liquid) and this"
                         " unit mixes without flashing, so\n"
                         "          the outlet carries the flow-weighted"
                         " dominant label (" << regime << ").  If the mixed"
                         " state is really\n"
                         "          two-phase, that label is a CHOICE and not"
                         " a result: put a `flash` or a\n"
                         "          `phaseChanger` after this unit and let it"
                         " resolve the split.  The energy report\n"
                         "          checks the label against Rachford-Rice and"
                         " will say so if it is impossible.\n";
    }

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Mixer Result  =========================\n"
                  << "  Inlets:        " << inputs.size() << "\n"
                  << "  Total F_out:   " << std::fixed << std::setprecision(4)
                  << (F_out * 3600.0) << "  kmol/h\n"
                  << "  P_out:         " << std::fixed << std::setprecision(3)
                  << (P_out * 1.0e-5) << "  bar  (= min of inlet pressures)\n"
                  << "  T_out:         " << std::fixed << std::setprecision(2)
                  << T_out << "  K  (" << (T_out - 273.15) << " °C)   <- "
                  << (isothermal ? "declared (isothermal; energy balance skipped)"
                                 : "result (adiabatic energy balance)") << "\n"
                  << "  Phase:         " << regime << "  (dominant; vf = "
                  << std::fixed << std::setprecision(3) << vf_out << ")\n"
                  << "  Datum:         " << (useFormation ? "formation (H_stream)"
                                                          : "sensible (Hliquid)") << "\n"
                  << "  Composition:\n";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "    " << thermo.comp(i).name() << "  = "
                      << std::fixed << std::setprecision(6) << z_out[i] << "\n";
        std::cout << "==================================================================\n\n";
    }

    produced_.clear();
    ProcessStream out;
    out.name = "mixed";
    out.F    = F_out;
    out.T    = T_out;
    out.P    = P_out;
    out.z    = z_out;
    out.vf   = vf_out;
    out.s    = s_out;
    produced_.push_back(out);

    kpis_.clear();
    kpis_["F_out"] = F_out;
    kpis_["T_out"] = T_out;
    kpis_["P_out"] = P_out;
    kpis_["vf"]    = vf_out;
    kpis_["n_in"]  = static_cast<scalar>(inputs.size());

    return converged ? 0 : 1;
}

} // namespace Choupo
