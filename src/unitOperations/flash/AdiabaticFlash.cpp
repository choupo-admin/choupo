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

#include "AdiabaticFlash.H"
#include "thermo/PropertyDomainError.H"
#include "core/Advisory.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include "unitOperations/flash/SpecifiedFlash.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace Choupo {

int AdiabaticFlash::solve(const DictPtr& dict,
                          const ThermoPackage& thermo,
                          int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F      = feedDict->lookupScalar("F",     Dims::molarFlow);
    const scalar Tfeed  = feedDict->lookupScalar("Tfeed", Dims::temperature);
    const scalar Pout   = operDict->lookupScalar("P",     Dims::pressure);
    const scalar Pfeed  = feedDict->lookupScalarOrDefault("Pfeed", Pout,
                                                          Dims::pressure);
    // The operation block carries ONLY hardware: outlet pressure P.  A duty
    // Q (an earlier optional setting) is GONE --- an adiabatic flash has
    // Q == 0 by definition; "flash with heat input" is a heater + flash
    // chain (the credo-pure way, separating the two physical pieces).  The
    // When every component has the elements datum, solve on the SAME canonical
    // surface published as stream H/H_kW.  Otherwise retain the sensible
    // surface as an announced data-limited fallback; the GUI will refuse an
    // elements-datum plant balance for that case rather than print a false one.
    const scalar Tref = Tfeed;

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    bool useFormation = true;
    for (std::size_t i = 0; i < n; ++i)
        if (!thermo.hasEnthalpyDatum(i)) { useFormation = false; break; }

    //  THE INLET'S PHASE STATE IS READ, NOT ASSUMED.  This used to price the
    //  feed as a sub-cooled liquid unconditionally, with the comment "the
    //  authored feed is a sub-cooled liquid" -- true of every authored 0/ file
    //  in the corpus (no `vaporFraction` key means vf = 0), and silently wrong
    //  for any stream arriving with vapour in it.  A unit that mis-prices its
    //  own inlet cannot close an energy balance no matter how good its solver
    //  is, and the error is invisible: the flash simply converges to the wrong
    //  temperature.  The feed's vf is on the stream (`Flowsheet` writes it
    //  beside T and P), so it is read from there -- the same rule the column
    //  already enforces on a feed's thermal state.  A vf of 0 reproduces the
    //  previous value exactly, which is why every existing case is untouched.
    //  An UNPINNED inlet means its own equilibrium (R-E2), single phase
    //  included -- read in this unit's own thermo world (DEV.md C33).
    const scalar vfFeed = flashState::resolvedInletVaporFraction(
        feedDict, Tfeed, Pfeed, z, thermo,
        "adiabaticFlash inlet");
    //  PRICED AS THE ENERGY REPORT PRICES IT (2026-10-24).  A two-phase inlet
    //  was priced as `H_stream_formation(T, P, vf, z)` -- a QUALITY BLEND at
    //  the overall z, exact only for a pure fluid -- while the report prices
    //  the same stream on its equilibrium phases (`flashState::priceState`),
    //  so the unit and the report disagreed by the blend's error.  No case
    //  reached it until the adiabatic mixer started publishing its outlet
    //  RESOLVED: column12's `recombine` hands `restage` the stage's own
    //  two-phase mixture, and the blend moved the restaged flash off the
    //  stage (V/F 0.5066 against 0.5, 1.2494 kW unattributed) -- breaking the
    //  very identity that case exists to witness.  A single-phase inlet is
    //  priced exactly as before (`priceState` falls through to
    //  `H_stream_formation` at the carried vapour fraction).
    std::vector<std::string> inletNotes;
    const bool feedPinned =
        feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const scalar Hin  = useFormation
        ? flashState::priceState(Tfeed, Pfeed, z, 1.0, feedPinned, vfFeed,
                                 thermo, "adiabaticFlash inlet", &inletNotes)
        : (1.0 - vfFeed) * thermo.Hliquid(Tfeed, z, Tref)
          +      vfFeed  * thermo.Hvapour(Tfeed, z, Tref);
    const scalar Hreq = Hin;            // adiabatic: H_out = H_in

    std::cout << "Feed:       F = " << (F * 3600.0) << " kmol/h, T = " << Tfeed
              << " K, P = " << (Pfeed * 1.0e-5) << " bar, vf = " << vfFeed << "\n"
              << "Outlet:     P = " << (Pout * 1.0e-5) << " bar  (adiabatic, Q = 0)\n"
              << "Enthalpy:   "
              << (useFormation ? "elements datum (same surface as stream H/H_kW)"
                               : "sensible fallback (missing elements datum)")
              << "\n";
    std::cout << "Feed composition (z):\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << thermo.comp(i).name() << "  = " << z[i] << "\n";
    std::cout << "Inlet enthalpy H_in = " << std::scientific
              << std::setprecision(5) << Hin << " J/mol of feed\n\n";

    //  THE OUTLET STATE IS `flashState::specifiedFlash`'s (D8, 2026-11-28; the
    //  migration planned in docs/design/a-general-flash-specification.md
    //  sections 5-6): the state at (P_out, H_in), by the one (P, H) home.  The
    //  unit's own nested Newton in T had no root where a PURE fluid is
    //  flashed into its saturation plateau (H jumps by the latent heat at
    //  Tsat: IF97 water 450 K, 20 -> 1 bar published "Outer T search
    //  converged: NO", V/F 1.000, 3.5e4 J/mol unclosed); the home answers it
    //  in closed form and every other state by its bracketed search.  What the
    //  old search carried and the home does not: the declared HIGH-SIDE rule
    //  (an unanswerable trial counted as above the answer), removed
    //  2026-11-28: no shipped case reached it once the mixer priced its real
    //  two-phase state; the home refuses by name a trial it cannot answer.
    FlashOptions iopts;
    iopts.tolerance  = 1.0e-9;          // inner flash: H error ~1e-5 J/mol
    iopts.maxIter    = 60;
    iopts.verbosity  = (verbosity >= 4) ? 3 : 0;
    iopts.accelerator = OuterAccelerator::Wegstein;

    flashState::FlashSpecification spec;
    spec.pair   = flashState::SpecPair::PH;
    spec.P      = Pout;
    spec.target = Hreq;
    spec.seed   = Tfeed;
    spec.flash  = iopts;
    spec.controls = flashState::FlashSpecification::defaultControls(flashState::SpecPair::PH);
    //  The unit's own absolute tolerance, 0.01 J/mol (as its Newton kept): with
    //  terms {phi, target} the home's normalisation is degenerate for a
    //  near-pure feed and the verdict reads the RAW residual, so the number
    //  declared here is in J/mol, not relative (review of the valve, 11-28).
    constexpr scalar kTolJmol = 0.01;
    spec.controls.tolerance = kTolJmol;
    spec.controlsDeclared = true;
    //  A state the home cannot answer is reported NOT converged and the unit
    //  still publishes (the feed's own T at P_out), as the old search did:
    //  inside a recycle one bad tear iterate must not kill the run.  A hard
    //  refusal (C398 TG-01) is never turned into a number.

    flashState::SpecifiedState st;
    bool searchOk = true;
    std::string searchWhy;
    //  No private search remains: a refusal of the home (an unanswerable
    //  package trial included) is reported NOT converged with its reason,
    //  as the valve does.
    try
    {
        st = flashState::specifiedFlash(thermo, z, spec, verbosity, false);
    }
    catch (const std::exception& e)
    {
        rethrowHardRefusal();
        searchOk = false;
        searchWhy = e.what();
        std::cout << "  [adiabaticFlash] the (P, H) flash could not answer: "
                  << searchWhy << "\n";
        FlashInput in;
        in.F = F; in.T = Tfeed; in.P = Pout; in.z = z;
        std::string scDiscarded;
        st.phases = flashState::flashDiscardingSupercriticalSplit(
            in, thermo, iopts, scDiscarded);
        flashState::reportSupercriticalDiscard(scDiscarded, "adiabaticFlash",
                                               "adiabaticFlash outlet", verbosity);
        st.T = Tfeed;
        st.route = "NOT CONVERGED: outlet shown at the feed temperature";
        st.H = flashState::priceState(Tfeed, Pout, z, 1.0, false,
                                      st.phases.V_over_F, thermo,
                                      "adiabaticFlash outlet", nullptr);
    }
    FlashSolution lastSol = st.phases;
    const scalar Tout = st.T;
    const bool innerFinalOk = lastSol.converged;
    const int  innerFailedTrials = 0;
    if (verbosity >= 3)
        std::cout << "Outlet state (P, H) flash: " << st.route << "\n";
    for (const auto& note : st.notes) std::cout << note << "\n";   // C34, said once
    const scalar Hout = st.H;
    recordResidual(std::abs(Hout - Hreq));
    //  Converged only if the ENERGY balance at the published outlet closes
    //  (C467 R-001: a search that never ran was published converged).
    const bool energyClosed = searchOk && std::abs(Hout - Hin) <= kTolJmol;
    const bool allOk = innerFinalOk && energyClosed;

    // Outlet streams (liquid + vapor) at the converged T_out and the outlet P.
    // The products ARE the point of a flash -- emit them so the flowsheet
    // summary shows them (was the empty `outputs ( )` / "v0.7" gap).
    produced_.clear();
    {
        ProcessStream liq;
        liq.name = "liquid"; liq.F = F * (1.0 - lastSol.V_over_F);
        liq.T = Tout; liq.P = Pout; liq.z = lastSol.x; liq.vf = 0.0;
        produced_.push_back(liq);
        ProcessStream vap;
        vap.name = "vapor"; vap.F = F * lastSol.V_over_F;
        vap.T = Tout; vap.P = Pout; vap.z = lastSol.y; vap.vf = 1.0;
        produced_.push_back(vap);
    }

    // KPIs -- the watchable objectives (feeds sensitivity/optim/sizing AND the
    // GUI What-if instrument).  T_out is THE result of an adiabatic flash: the
    // outlet T falls out of the energy balance, so it is the natural thing to
    // watch as the student turns the outlet pressure P.
    kpis_.clear();
    kpis_["T_out"]     = Tout;                                 // K -- the result
    kpis_["T_feed"]    = Tfeed;                               // K
    kpis_["T_drop"]    = Tfeed - Tout;                         // K (flash cooling)
    kpis_["P"]         = Pout;                                // Pa
    kpis_["F_in"]      = F;
    kpis_["V_over_F"]  = lastSol.V_over_F;
    kpis_["F_liquid"]  = F * (1.0 - lastSol.V_over_F);
    kpis_["F_vapor"]   = F * lastSol.V_over_F;
    kpis_["H_residual"] = Hout - Hin;                         // J/mol (~0, adiabatic)

    std::cout << "\n========================  Adiabatic Flash Result  ===================\n"
              << "  Converged:     " << (allOk ? "yes" : "NO") << "\n"
              << "  Outlet route:  " << st.route << "\n"
              << "  Inner flash converged:     " << (innerFinalOk ? "yes" : "NO")
              << "  (" << innerFailedTrials << " trial(s) refused)\n"
              << "  T_out:         " << std::fixed << std::setprecision(4)
              << Tout << "  K  ( " << (Tout - 273.15) << " °C )\n"
              << "  ΔT (drop):     " << std::fixed << std::setprecision(2)
              << (Tfeed - Tout) << "  K\n"
              << "  H_in:          " << std::scientific << std::setprecision(5)
              << Hin << "  J/mol\n"
              << "  H_out:         " << Hout << "  J/mol\n"
              << "  Energy-balance residual: " << (Hout - Hin)
              << "  J/mol  "
              << (energyClosed ? "(~0; adiabatic, Q = 0 by definition)"
                               : "(NOT CLOSED: exceeds the tolerance of "
                                 + std::to_string(kTolJmol)
                                 + " J/mol -- the outlet is not an adiabatic"
                                   " state)")
              << "\n"
              << "  Regime:        " << lastSol.regime << "\n"
              << "  V/F:           " << std::fixed << std::setprecision(6)
              << lastSol.V_over_F << "\n"
              << "  V flow:        " << (F * lastSol.V_over_F * 3600.0) << "  kmol/h\n"
              << "  L flow:        " << (F * (1.0 - lastSol.V_over_F) * 3600.0) << "  kmol/h\n\n";

    std::cout << "  Component         z          x          y          K\n"
              << "  -----------------------------------------------------------\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << std::left << std::setw(14) << thermo.comp(i).name()
                  << std::right << std::fixed
                  << "  " << std::setprecision(6) << std::setw(8) << z[i]
                  << "  " << std::setprecision(6) << std::setw(8) << lastSol.x[i]
                  << "  " << std::setprecision(6) << std::setw(8) << lastSol.y[i]
                  << "  " << std::setprecision(4) << std::setw(8) << lastSol.K[i]
                  << "\n";
    std::cout << "====================================================================\n\n";

    return allOk ? 0 : 1;
}

//  WHAT THE UNIT ACCEPTS (DEV.md 4c C188 item 5, slice D): the unit models
//  whatever component it is handed, in any phase, as its sentence says; it
//  has no component-subset rule, so the sentence is the whole contract.
UnitAcceptance AdiabaticFlash::acceptance() const
{
    UnitAcceptance a;
    a.declared = true;
    a.models.sentence =
        "every component of the feed, split among the phases the package's "
        "equilibrium finds at the outlet pressure and the inlet's enthalpy "
        "(a vapour, one or two liquids, and any solid phase the case "
        "declares)";
    return a;
}

} // namespace Choupo
