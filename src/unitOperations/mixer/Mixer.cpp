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
#include "unitOperations/flash/StreamEquilibrium.H"
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

    //  THE DECLARED OUTLET TEMPERATURE, read BEFORE the inlet loop.  It used
    //  to be read after it, which cost nothing until an inlet arrived that
    //  the package cannot PRICE: the loop summed inlet enthalpies
    //  unconditionally, and `Hin_total` feeds exactly one thing -- `h_req`,
    //  the target of the ADIABATIC Newton.  An isothermal mixer never reads
    //  it, so a case that DECLARES its outlet temperature was being refused
    //  over an arithmetic the run does not perform (found 2026-09-16 on an
    //  electrodialysis recycle loop whose ionic components carry no liquid
    //  heat capacity -- a refusal that is right for the adiabatic balance and
    //  meaningless here).  The isothermal mixer DOES price its streams since
    //  2026-10-17 (DEV.md 4c C74), for the duty its declared T implies -- and
    //  a term it cannot price makes that duty UNAVAILABLE, said, never a
    //  refusal of the run (see the duty block below the phase decision).
    bool   isothermal = false;
    scalar T_spec     = 0.0;
    if (dict->found("operation"))
    {
        auto operDict0 = dict->subDict("operation");
        if (operDict0->found("T"))
        { isothermal = true; T_spec = operDict0->lookupScalar("T"); }
    }

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

    //  Each inlet's state AS THE ENERGY REPORT WILL PRICE IT, kept for the
    //  duty a declared outlet T implies (C74, below).  `vf` is the RESOLVED
    //  reading (`resolvedInletVaporFraction`), not the dominant-phase vote
    //  the one-phase balance may override it with.
    struct InletState
    {
        std::string name;
        scalar      F = 0.0, T = 0.0, P = 0.0, vf = 0.0;
        bool        pinned = false;
        sVector     z, s;
    };
    std::vector<InletState> inletStates;
    //  Every inlet's crystals and temperature, kept for a merge of SOLIDS
    //  ONLY (below the inlet loop, DEV.md 4c C97); read by nothing else.
    struct SolidInlet { std::string name; scalar T = 0.0, P = 0.0; sVector s; };
    std::vector<SolidInlet> solidInlets;

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
        //  The inlet's phase prices its enthalpy and votes for the outlet's
        //  dominant phase.  An UNPINNED authored inlet means its own
        //  equilibrium (R-E2), single phase included: the carried default 0
        //  read an all-vapour feed as a liquid (DEV.md C33/C34).  A produced
        //  inlet keeps its producer's answer.
        //
        //  A TWO-PHASE authored inlet is the exception, TAKEN ON A STATED
        //  DEFAULT (2026-10-04, C34) and announced: this mixer balances its
        //  energy on ONE dominant phase and never splits, so a resolved
        //  fraction would flip that vote and price a quality blend the model
        //  cannot carry to its outlet.  Measured on cavett01, whose 322 K,
        //  18.6 bar feed is two-phase: the vote went to vapour and the
        //  adiabatic Newton found no outlet temperature in [150, 2500] K.
        //  What a two-phase authored inlet into this mixer should do (an
        //  isothermal mixer, a flash in front, the resolved fraction) is the
        //  case's and Vitor's call; until then it is read as carried, and
        //  said.
        const std::string inName = sd->lookupWordOrDefault("streamName", "?");
        const scalar vfCarried = sd->lookupScalarOrDefault("vf", 0.0);
        scalar vf = flashState::resolvedInletVaporFraction(
            sd, T, P, z, thermo, "mixer inlet '" + inName + "'");
        const scalar vfResolved = vf;
        if (vf > 1.0e-9 && vf < 1.0 - 1.0e-9 && vf != vfCarried)
        {
            const std::string msg =
                "inlet '" + inName + "' resolves TWO-PHASE at its own (T, P, z)"
                " (V/F = " + std::to_string(vf) + "), but this mixer balances"
                " on one dominant phase and never splits: it is read as the"
                " state it carries (vf = " + std::to_string(vfCarried) + ")."
                "  Put a flash in front of the mixer, or declare it isothermal,"
                " to make the split explicit (DEV.md C33)";
            AdvisoryLog::instance().add("mixer", "info", "mixer inlet '"
                                        + inName + "'", msg);
            if (verbosity >= 2) std::cout << "  [mixer] " << msg << "\n";
            vf = vfCarried;
        }

        sVector s_in(n, 0.0);
        if (sd->found("solids"))
        {
            auto sol = sd->subDict("solids");
            if (sol->found("solidMolarFlows"))
            {
                auto sf = sol->subDict("solidMolarFlows");
                for (const auto& key : sf->keys())
                {
                    const std::size_t i = thermo.indexOf(key);
                    s_in[i]  += sf->lookupScalar(key);
                    s_out[i] += sf->lookupScalar(key);
                }
            }
        }
        solidInlets.push_back({ inName, T, P, s_in });
        if (isothermal)
        {
            InletState st;
            st.name   = inName;
            st.F = F; st.T = T; st.P = P; st.vf = vfResolved;
            st.pinned = sd->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
            st.z = z; st.s = s_in;
            inletStates.push_back(std::move(st));
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
        if (!isothermal) Hin_total += F * hInlet(T, P, vf, z);
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

    //  ---- A MERGE OF SOLIDS ONLY (2026-10-18, DEV.md 4c C97) -------------
    //
    //  Powders are blended: every inlet carries its material in `s[]` and no
    //  fluid at all.  Until then this unit refused such a merge ("total inlet
    //  flow is zero") although its material balance is exact -- the solids
    //  are summed -- and the only thing missing was a temperature.  It is now
    //  solved on the SOLID rung, the leg the energy report prices crystals
    //  on (`flashState::priceSolids`):
    //      SUM_k H_solid(s_k, T_k) = H_solid(s_out, T_out)        (adiabatic)
    //  or, with `operation { T ...; }`, T_out is declared and the duty
    //  Q = H_solid(s_out, T_out) - SUM_k H_solid(s_k, T_k) is published as
    //  `Q_kW`, exactly as the fluid branch's declared-T duty is.  A merge
    //  that carries any fluid never reaches this block, so every case that
    //  ran before is untouched.
    scalar s_total = 0.0;
    for (auto v : s_out) s_total += v;
    if (F_out <= 0.0 && s_total > 0.0)
    {
        scalar H_in = 0.0;                                         // kW
        for (const auto& si : solidInlets)
            H_in += flashState::priceSolids(si.s, si.T, thermo);
        scalar T_sol = isothermal ? T_spec : T_first;
        if (!isothermal)
        {
            //  H_solid(s_out, T) rises with T (a positive heat capacity), so
            //  the root is bracketed by the coldest and the hottest inlet.
            scalar lo = 1.0e300, hi = -1.0e300;
            for (const auto& si : solidInlets)
            {
                scalar m = 0.0; for (auto v : si.s) m += v;
                if (m > 0.0) { lo = std::min(lo, si.T); hi = std::max(hi, si.T); }
            }
            auto g = [&](scalar T) { return flashState::priceSolids(s_out, T, thermo) - H_in; };
            if (hi - lo < 1.0e-12) T_sol = lo;
            else
            {
                scalar a = lo, b = hi, ga = g(a);
                for (int k = 0; k < 200 && (b - a) > 1.0e-10; ++k)
                {
                    const scalar m = 0.5 * (a + b), gm = g(m);
                    if ((gm > 0.0) == (ga > 0.0)) { a = m; ga = gm; } else b = m;
                }
                T_sol = 0.5 * (a + b);
            }
        }
        const scalar Q_sol = flashState::priceSolids(s_out, T_sol, thermo) - H_in;   // kW
        if (verbosity >= 2)
        {
            std::cout << "\n=========================  Mixer Result  =========================\n"
                      << "  Inlets:        " << inputs.size() << "  (SOLIDS ONLY -- no fluid phase)\n"
                      << "  Solids out:    " << std::fixed << std::setprecision(6)
                      << (s_total * 3600.0) << "  kmol/h\n"
                      << "  T_out:         " << std::fixed << std::setprecision(2) << T_sol
                      << "  K  <- " << (isothermal
                          ? "declared (the duty below brings the powder there)"
                          : "result (adiabatic, on the SOLID rung: SUM H_solid(in) = H_solid(out))")
                      << "\n";
            if (isothermal)
                std::cout << "  Duty Q:        " << std::fixed << std::setprecision(6) << Q_sol
                          << "  kW  = H_solid(outlet) - SUM H_solid(inlets)\n";
            std::cout << "==================================================================\n\n";
        }
        produced_.clear();
        ProcessStream out;
        out.name = "mixed";
        out.F    = 0.0;
        out.T    = T_sol;
        out.P    = std::isfinite(P_out) ? P_out : 101325.0;
        out.z    = sVector(n, 0.0);
        out.vf   = 0.0;
        out.s    = s_out;
        produced_.push_back(out);
        kpis_.clear();
        kpis_["F_out"] = 0.0;
        kpis_["T_out"] = T_sol;
        kpis_["P_out"] = out.P;
        kpis_["vf"]    = 0.0;
        kpis_["n_in"]  = static_cast<scalar>(inputs.size());
        if (isothermal) kpis_["Q_kW"] = Q_sol;
        return 0;
    }
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
    // and explicit --- the mixer ANNOUNCES it, and since C74 PUBLISHES the
    // duty that temperature implies (`Q_kW`, the block below the phase
    // decision): the heat has a source, as the header asks.  Use it when (a) a furnace /
    // heater downstream fixes T anyway (e.g. the HDA reactor feed lumps its
    // furnace into operation.T 900), or (b) the adiabatic single-phase balance
    // is ill-posed: in a genuine gas+liquid mix the liquid species carry a
    // large formation+latent gap on the dominant (gas) basis, which can push
    // the 1-D Newton in T off its [150, 2500] K bracket (no root -> "failed to
    // converge").  Mixing is exact regardless; only the energy datum for T is
    // the question, and here the author owns it.
    //  (`isothermal` / `T_spec` are read above the inlet loop -- see there.)
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

    //  ---- THE DUTY A DECLARED OUTLET TEMPERATURE IMPLIES (DEV.md 4c C74) ----
    //
    //  A declared `operation { T ...; }` is legitimate -- it is a mixer and a
    //  heater (or cooler) drawn as one box -- but the heat that takes the
    //  merged stream to T_spec has to come from somewhere.  Until 2026-10-17
    //  this unit published NO duty for it, so the heat came from nowhere: the
    //  energy report priced the outlet at T_spec, found no energy item to
    //  reconcile it against, and the plant boundary carried it as a residual.
    //  Measured on aceticAcid02_plant, whose M1 merges a 300 K liquid, a
    //  300 K gas and a 330 K recycle at a declared 320 K: +82.77 kW
    //  unattributed at M1, and the plant's first law open at -79.98 kW --
    //  the family CLAUDE.md 6 names, a unit computing with a state (T_spec)
    //  whose energy nobody paid for.
    //
    //  The duty is  Q = H(outlet) - SUM H(inlets),  every term through
    //  `flashState::priceState` (+ `priceSolids` for the crystals), the call
    //  the energy report's own rule is: each inlet on the state it carries
    //  (an unpinned authored inlet at its own resolved vapour fraction, the
    //  reading the flowsheet's surface pass publishes; a produced one at its
    //  producer's answer), the outlet unpinned at the label this unit
    //  publishes.  So the report's remainder for this unit is zero by
    //  construction, and `Q_kW` reaches the plant boundary and the utility
    //  allocation exactly as a heater's does (`reporting::energyItemKpis`,
    //  `reporting::unitHeatDuties`, served at `T_out`).
    //
    //  When a term has NO enthalpy route (a present species with no datum on
    //  the elements surface -- an electrodialysis loop's ions), the duty is
    //  UNAVAILABLE: no `Q_kW` is published and that is SAID, never a partial
    //  sum, and the run is NOT refused -- the material mix is exact and the
    //  report is UNAVAILABLE for the same streams anyway.  An adiabatic mixer
    //  publishes no duty, because it has none.
    const std::string unitName = dict->name().empty() ? type() : dict->name();
    bool   haveDuty = false;
    scalar Q_kW     = 0.0;
    std::vector<std::string> dutyNotes;
    std::string              dutyGap;
    if (isothermal)
    {
        try
        {
            scalar H_in = 0.0;                                     // kW
            for (const auto& st : inletStates)
                H_in += flashState::priceState(st.T, st.P, st.z, st.F,
                            st.pinned, st.vf, thermo,
                            "mixer '" + unitName + "' inlet '" + st.name + "'",
                            &dutyNotes)
                      + flashState::priceSolids(st.s, st.T, thermo);
            //  The outlet as this unit publishes it: unpinned (it pins
            //  nothing), carrying the dominant label.
            const scalar H_out =
                  flashState::priceState(T_out, P_out, z_out, F_out,
                      false, vf_out, thermo,
                      "mixer '" + unitName + "' outlet", &dutyNotes)
                + flashState::priceSolids(s_out, T_out, thermo);
            Q_kW     = H_out - H_in;       // F[kmol/s] x h[kJ/kmol] = kW
            haveDuty = std::isfinite(Q_kW);
            if (!haveDuty) dutyGap = "the priced enthalpies are not finite";
        }
        catch (const std::exception& ex)
        {
            haveDuty = false;
            dutyGap  = ex.what();
        }
        if (!haveDuty)
        {
            const std::string msg =
                "mixer '" + unitName + "' declares its outlet temperature ("
                + std::to_string(T_out) + " K) but the duty that temperature"
                " implies is UNAVAILABLE: a stream it merges has no enthalpy"
                " route on the elements datum (" + dutyGap + ").  No `Q_kW` is"
                " published -- the material mix is exact, the energy balance"
                " of this unit is not computed.  Curate the missing datum to"
                " have the duty priced (DEV.md 4c C74)";
            if (AdvisoryLog::instance().addAnnouncedOnce(
                    "mixerDutyUnavailable:" + unitName, "model", "warning",
                    "mixer '" + unitName + "'", msg))
                std::cerr << "[mixer] " << msg << "\n";
        }
    }

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
                  << (!isothermal ? "result (adiabatic energy balance)"
                      : haveDuty    ? "declared (isothermal; the duty below brings it there)"
                                    : "declared (isothermal; duty UNAVAILABLE -- see above)")
                  << "\n";
        if (isothermal && haveDuty)
        {
            std::cout << "  Duty Q:        " << std::fixed << std::setprecision(4)
                      << Q_kW << "  kW" << (Q_kW < 0.0 ? "  (removed)" : "  (added)")
                      << "  = H(outlet) - SUM H(inlets), priced on the package's"
                         " own surface\n"
                         "                 -- the SAME rule the energy report"
                         " prices these streams with\n";
            for (const auto& note : dutyNotes)
                std::cout << "    [state] " << note << "\n";
        }
        std::cout
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
    //  Only an ISOTHERMAL mixer has a duty, and only a priced one is
    //  published: an adiabatic mixer's row is byte-identical to before C74.
    if (isothermal && haveDuty) kpis_["Q_kW"] = Q_kW;

    return converged ? 0 : 1;
}

} // namespace Choupo
