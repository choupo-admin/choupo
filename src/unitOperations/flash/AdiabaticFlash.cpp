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
#include "core/Advisory.H"
#include "thermo/PropertyDomainError.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <exception>
#include <iomanip>
#include <iostream>
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

    auto liquidH = [&](scalar T, scalar P, const sVector& x) -> scalar
    {
        return useFormation ? thermo.H_stream_formation(T, P, 0.0, x)
                            : thermo.Hliquid(T, x, Tref);
    };
    auto vapourH = [&](scalar T, scalar P, const sVector& y) -> scalar
    {
        return useFormation ? thermo.H_stream_formation(T, P, 1.0, y)
                            : thermo.Hvapour(T, y, Tref);
    };
    auto splitH = [&](scalar T, scalar P, const FlashSolution& sol) -> scalar
    {
        return (1.0 - sol.V_over_F) * liquidH(T, P, sol.x)
             +        sol.V_over_F  * vapourH(T, P, sol.y);
    };

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

    // Outer residual:  f(T) = H_out(T) - Hreq, where H_out comes from a
    // fully converged isothermal flash at (T, Pout, z).
    FlashOptions iopts;
    //  C245 3g: the inner tolerance is on the composition step; H changes by
    //  ~1e4 J/mol per unit of it, so 1e-9 puts the inner flash's H error at
    //  ~1e-5 J/mol, 1e3 below the outer 0.01 J/mol.
    iopts.tolerance  = 1.0e-9;
    iopts.maxIter    = 60;
    iopts.verbosity  = (verbosity >= 4) ? 3 : 0;
    iopts.accelerator = OuterAccelerator::Wegstein;

    FlashSolution lastSol;
    //  C245 3g: the inner flash's own `converged` is READ.  Every trial whose
    //  inner flash stopped unconverged is counted and treated as unanswerable
    //  (it is not a point of the surface H_out(T); differencing it would put
    //  an arbitrary number into the Newton slope).
    int innerFailedTrials = 0;

    //  A two-phase root above every present component's Tc is not a split:
    //  the outlet is the single fluid phase, and the discard is said once,
    //  at the answer (the one home, StreamEquilibrium.H -- C34).
    std::string scDiscarded;
    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in;
        in.F = F; in.T = T; in.P = Pout; in.z = z;
        return flashState::flashDiscardingSupercriticalSplit(in, thermo, iopts,
                                                             scDiscarded);
    };

    //  A TRIAL TEMPERATURE THE PACKAGE CANNOT ANSWER MUST NOT KILL THE
    //  SEARCH.  The molecular isothermal flash answers anywhere in the
    //  bracket, so the outer Newton never noticed it had no strategy for an
    //  inner failure -- until a REACTIVE package met a trial far above its
    //  two-phase band (the ReactiveVLE has no liquid to speciate there and
    //  refuses, correctly).  The named case: column13's re-flash arm, whose
    //  mixer inlet carries a two-phase enthalpy under a FICTITIOUS
    //  dominant-phase temperature (483 K on a 367 K stage -- the enthalpy is
    //  exact, the readout is not, and the case header says so), so the very
    //  first evaluation sat 110 K above the dew point.
    //
    //  The rule, stated because it is a modelling claim and not a
    //  convenience: H_out(T) rises with T, and the reactive path fails on
    //  the HIGH side (superheated: the liquid it must speciate is gone), so
    //  an unanswerable trial is treated as ABOVE the answer -- it tightens
    //  the upper bracket exactly as f > 0 would.  Every such trial is
    //  ANNOUNCED.  A failure that is NOT of that kind (an unanswerable
    //  trial at the bottom of the bracket) walks the search to the lower
    //  bound and fails THERE, loudly -- misclassification degrades to a
    //  visible non-convergence, never to a wrong answer.
    bool trialUnanswerable = false;             // set by f, read by df
    //  A trial a record law's hard window refused (C398 review row CV-17):
    //  if the search ends without an answer, THAT refusal is what the run
    //  reports -- the answer lies outside the law's window -- never a bound.
    std::exception_ptr windowRefusal;
    auto f = [&](scalar T)
    {
        try
        {
            lastSol = flashAt(T);
        }
        catch (const std::exception& e)
        {
            if (const auto* pt = dynamic_cast<const PropertyDomainTrial*>(&e))
                if (pt->kind == PropertyDomainError::Kind::outsideHardDomain)
                    windowRefusal = std::current_exception();
            trialUnanswerable = true;
            if (verbosity >= 1)
                std::cout << "  [adiabaticFlash] trial T = " << std::fixed
                          << std::setprecision(2) << T << " K: the package"
                          << " could not answer (" << e.what() << ")\n"
                          << "  [adiabaticFlash] treated as ABOVE the answer"
                             " (H rises with T; the reactive path loses its"
                             " liquid on the high side) -- upper bracket"
                             " tightened\n";
            return 1.0e12;                      // f > 0: tightens the upper edge
        }
        if (!lastSol.converged)
        {
            trialUnanswerable = true;
            ++innerFailedTrials;
            if (verbosity >= 1)
                std::cout << "  [adiabaticFlash] trial T = " << std::fixed
                          << std::setprecision(2) << T << " K: the inner"
                          << " isothermal flash did NOT converge (residual "
                          << std::scientific << std::setprecision(2)
                          << lastSol.residual << ") -- trial refused,"
                             " treated as ABOVE the answer\n";
            return 1.0e12;
        }
        trialUnanswerable = false;
        scalar Hout = splitH(T, Pout, lastSol);
        return Hout - Hreq;
    };
    auto df = [&](scalar T)
    {
        //  Central difference; one-sided when a probe is unanswerable, and a
        //  positive unit slope when both are -- the monotone bracket logic
        //  then advances by bisection alone, which is the honest thing left.
        const scalar dT = 0.5;
        scalar fph = f(T + dT);
        const bool phBad = trialUnanswerable;
        scalar fmh = f(T - dT);
        const bool mhBad = trialUnanswerable;
        if (phBad && mhBad) return 1.0;
        if (phBad || mhBad)
        {
            scalar fT = f(T);
            if (trialUnanswerable) return 1.0;
            return phBad ? (fT - fmh) / dT : (fph - fT) / dT;
        }
        return (fph - fmh) / (2.0 * dT);
    };

    solver::NROptions nro;
    nro.tolerance          = 0.01;         // J/mol; keeps published H-flow closure negligible
    nro.maxIter            = static_cast<int>(
        operDict->lookupScalarOrDefault("maxOuterIter", 30.0));
    nro.lower              = 200.0;
    nro.upper              = 700.0;
    nro.bracket            = true;
    nro.monotoneIncreasing = true;         // d(H_out)/dT > 0 generally
    nro.maxStep            = 15.0;

    if (verbosity >= 3)
    {
        std::cout << "Outer Newton in T (energy balance):\n"
                  << "   it       T [K]       H_out-Hreq    dH/dT          ΔT\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
    }
    nro.onIter = [this, verbosity](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        }
    };

    //  SEED FROM THE FEED, THEN PROVE THE SEED ANSWERS.  The inlet T is the
    //  natural start -- except when it is a mixer's fictitious dominant-phase
    //  readout, in which case the first trial may sit above everything the
    //  package can answer.  Bisect toward the lower bound until a trial
    //  answers (each unanswerable trial tightens the upper bracket under the
    //  high-side rule above); a bracket with no answerable point anywhere
    //  refuses naming both ends, because there is nothing honest to return.
    //  THE T SEARCH WALKS, AND SAYS SO.
    //
    //  Every trial temperature below is a full flash at a state this unit
    //  invented, and all but the last are discarded -- the bisection probes,
    //  the bracketing, and the two extra flashes the central-difference dH/dT
    //  costs per iteration.  On an electrolyte feed each of those raises its
    //  own out-of-band advisory, so an unframed search buries the handful
    //  that describe the CONVERGED outlet.  (Measured on column13: 96 of the
    //  run's 103 advisories were raised here, and none of them is about the
    //  answer.)  The frame closes below, before the final flash at the
    //  converged T -- that one IS the answer and speaks in full.
    AdvisoryFrame walk("adiabaticFlash outlet-T search");

    scalar Tstart = std::clamp(Tfeed, nro.lower, nro.upper);
    {
        int probe = 0;
        for (; probe < 24; ++probe)
        {
            f(Tstart);
            if (!trialUnanswerable) break;
            nro.upper = Tstart;
            Tstart    = 0.5 * (nro.lower + Tstart);
        }
        if (trialUnanswerable && windowRefusal) std::rethrow_exception(windowRefusal);
        if (trialUnanswerable)
            throw std::runtime_error("adiabaticFlash: no trial temperature in ["
                + std::to_string(nro.lower) + ", "
                + std::to_string(std::clamp(Tfeed, nro.lower, nro.upper))
                + "] K was answerable by the package -- the energy balance"
                  " has nothing to search on.  Check the feed state and the"
                  " package's validity range.");
        if (probe > 0 && verbosity >= 1)
            std::cout << "  [adiabaticFlash] the inlet's stated T ("
                      << std::fixed << std::setprecision(2) << Tfeed
                      << " K) was not answerable by the package (a mixer"
                         " carrying a two-phase enthalpy reports a fictitious"
                         " dominant-phase T); search re-seeded at "
                      << Tstart << " K after " << probe
                      << " bisection probe(s)\n";
    }

    auto r = solver::newton1D(f, df, Tstart, nro);
    if (!r.converged && windowRefusal) std::rethrow_exception(windowRefusal);   // CV-17

    walk.close();                       // the search is over; what follows is the answer

    // Final flash at converged T
    scDiscarded.clear();    // say it only if the ANSWER is a discarded root
    lastSol = flashAt(r.x);
    flashState::reportSupercriticalDiscard(scDiscarded, "adiabaticFlash",
                                           "adiabaticFlash outlet", verbosity);
    const bool innerFinalOk = lastSol.converged;
    scalar Hout = splitH(r.x, Pout, lastSol);
    const bool allOk = r.converged && innerFinalOk;

    // Outlet streams (liquid + vapor) at the converged T_out and the outlet P.
    // The products ARE the point of a flash -- emit them so the flowsheet
    // summary shows them (was the empty `outputs ( )` / "v0.7" gap).
    produced_.clear();
    {
        ProcessStream liq;
        liq.name = "liquid"; liq.F = F * (1.0 - lastSol.V_over_F);
        liq.T = r.x; liq.P = Pout; liq.z = lastSol.x; liq.vf = 0.0;
        produced_.push_back(liq);
        ProcessStream vap;
        vap.name = "vapor"; vap.F = F * lastSol.V_over_F;
        vap.T = r.x; vap.P = Pout; vap.z = lastSol.y; vap.vf = 1.0;
        produced_.push_back(vap);
    }

    // KPIs -- the watchable objectives (feeds sensitivity/optim/sizing AND the
    // GUI What-if instrument).  T_out is THE result of an adiabatic flash: the
    // outlet T falls out of the energy balance, so it is the natural thing to
    // watch as the student turns the outlet pressure P.
    kpis_.clear();
    kpis_["T_out"]     = r.x;                                 // K -- the result
    kpis_["T_feed"]    = Tfeed;                               // K
    kpis_["T_drop"]    = Tfeed - r.x;                         // K (flash cooling)
    kpis_["P"]         = Pout;                                // Pa
    kpis_["F_in"]      = F;
    kpis_["V_over_F"]  = lastSol.V_over_F;
    kpis_["F_liquid"]  = F * (1.0 - lastSol.V_over_F);
    kpis_["F_vapor"]   = F * lastSol.V_over_F;
    kpis_["H_residual"] = Hout - Hin;                         // J/mol (~0, adiabatic)

    std::cout << "\n========================  Adiabatic Flash Result  ===================\n"
              << "  Converged:     " << (allOk ? "yes" : "NO") << "\n"
              << "  Outer T search converged:  " << (r.converged ? "yes" : "NO") << "\n"
              << "  Inner flash converged:     " << (innerFinalOk ? "yes" : "NO")
              << "  (" << innerFailedTrials << " trial(s) refused)\n"
              << "  Outer iter.:   " << r.iterations << "\n"
              << "  T_out:         " << std::fixed << std::setprecision(4)
              << r.x << "  K  ( " << (r.x - 273.15) << " °C )\n"
              << "  ΔT (drop):     " << std::fixed << std::setprecision(2)
              << (Tfeed - r.x) << "  K\n"
              << "  H_in:          " << std::scientific << std::setprecision(5)
              << Hin << "  J/mol\n"
              << "  H_out:         " << Hout << "  J/mol\n"
              << "  Energy-balance residual: " << (Hout - Hin)
              << "  J/mol  (~0; adiabatic, Q = 0 by definition)\n"
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
