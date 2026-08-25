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
#include "solver/NewtonRaphson.H"

#include <cmath>
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
    const scalar vfFeed = feedDict->lookupScalarOrDefault("vf", 0.0);
    const scalar Hin  = useFormation
        ? thermo.H_stream_formation(Tfeed, Pfeed, vfFeed, z)   // the stream's own surface
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
    iopts.tolerance  = 1.0e-9;
    iopts.maxIter    = 60;
    iopts.verbosity  = (verbosity >= 4) ? 3 : 0;
    iopts.accelerator = OuterAccelerator::Wegstein;

    FlashSolution lastSol;

    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in;
        in.F = F; in.T = T; in.P = Pout; in.z = z;
        return IsothermalFlash::solveCore(in, thermo, iopts);
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
    auto f = [&](scalar T)
    {
        try
        {
            lastSol = flashAt(T);
        }
        catch (const std::exception& e)
        {
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
    nro.maxIter            = 30;
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

    walk.close();                       // the search is over; what follows is the answer

    // Final flash at converged T
    lastSol = flashAt(r.x);
    scalar Hout = splitH(r.x, Pout, lastSol);

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
              << "  Converged:     " << (r.converged ? "yes" : "NO") << "\n"
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

    return r.converged ? 0 : 1;
}

} // namespace Choupo
