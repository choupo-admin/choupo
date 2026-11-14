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

#include "BubblePoint.H"
#include "unitOperations/flash/IncipientPhase.H"
#include "solver/NewtonRaphson.H"
#include "core/Advisory.H"
#include "thermo/SaturationCurves.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>

namespace Choupo {

namespace {
//  The K-values a bubble point of liquid x reads at T.  On a vapour whose
//  fugacity does not depend on its own composition this is K(T, P, x, x),
//  unchanged.  On an ASSOCIATED ideal-gas vapour (DEV.md 4c C201 item 1) the
//  dimer split depends on y, so the K is the package's at the liquid's own
//  incipient vapour (`incipientPhase::vapour`, the one home of that
//  iteration).  An EoS vapour keeps the y = x form it always had here -- the
//  column and the relief sizer iterate it themselves; changing this kernel
//  for them is outside this slice and is not done silently.
sVector bubbleK(const ThermoPackage& thermo, scalar T, scalar P,
                const sVector& x)
{
    const sVector K0 = thermo.Kvec(T, P, x, x);
    if (!thermo.vapourAssociationPriced()) return K0;
    const auto r = incipientPhase::vapour(thermo, T, P, x, K0);
    return r.K.empty() ? K0 : r.K;
}
//  THE T SEED IS THE WEIGHTED BOILING POINT AT THE PRESSURE (C235).  The
//  mole-weighted NORMAL boiling point is a subcooled state at any pressure
//  above 1 atm.  An ideal vapour prices it smoothly; on a cubic EoS this
//  kernel reads K(T, P, x, x), the y = x vapour is a liquid at that state,
//  the cubic returns its liquid root, f(T) turns non-monotone and the
//  Newton walked down to its 200 K bracket (column14's feed at 8.93 bar).
//  A vapour whose fugacity depends on composition therefore uses each
//  component's own saturation temperature at P
//  (`pureSaturationTemperature`); an ideal vapour keeps the plain weighted
//  Tb, byte-identical.  ONE helper, both Newtons call it.
scalar weightedBoilingGuess(const ThermoPackage& thermo, const sVector& x,
                            scalar P)
{
    const std::size_t n = thermo.n();
    const bool real = thermo.hasEos() && thermo.vapourFugacityDependsOnComposition();
    scalar T0 = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar t = (thermo.comp(i).Tb() > 0 ? thermo.comp(i).Tb() : 350.0);
        if (real && x[i] > 0.0)
        {
            const scalar ts = pureSaturationTemperature(thermo, i, P);
            if (ts > 0.0) t = ts;
        }
        T0 += x[i] * t;
    }
    return T0;
}
} // namespace

// -----------------------------------------------------------------------
//  Static helper: programmatic bubble-T evaluation, no I/O.
//
//  Solves   f(T) = Σ K_i(T, x) x_i  -  1  =  0
//  for the bubble-point temperature at composition x and pressure P.
//  The residual is monotone increasing in T (vapour pressures rise with
//  T faster than activities change for any non-pathological γ-model),
//  so a 1-D Newton with bracket [200, 700] K is robust.
// -----------------------------------------------------------------------
BubblePoint::Result BubblePoint::compute(const ThermoPackage& thermo,
                                         const sVector&       x,
                                         scalar               P,
                                         scalar               T_init)
{
    const std::size_t n = thermo.n();

    //  THE T SEARCH WALKS, AND SAYS SO (PO-02, 2026-11-12).  The starting guess
    //  (the mole-weighted normal boiling point) and every Newton step are
    //  temperatures this solve INVENTED; a pair-span or vapour-pressure-window
    //  excursion raised at one of them describes the path, not the published
    //  bubble temperature (the ethanol + ethylene glycol + water reproducer
    //  announced "used at T = 387.9 K" for an answer at 365.3 K, inside every
    //  span).  The frame closes before the evaluation at the converged T,
    //  which IS the answer and speaks in full: the contract of
    //  core/Advisory.H, "which state is this advisory about".
    AdvisoryFrame walk("bubble-point temperature search");

    // Initial T guess: mole-fraction-weighted normal boiling point.
    scalar T0 = T_init;
    if (T0 <= 0.0)
    {
        T0 = weightedBoilingGuess(thermo, x, P);
    }

    auto K_at = [&](scalar T) { return bubbleK(thermo, T, P, x); };
    auto f = [&](scalar T)
    {
        auto K = K_at(T);
        scalar s = 0.0;
        for (std::size_t i = 0; i < n; ++i) s += K[i] * x[i];
        return s - 1.0;
    };
    auto df = [&](scalar T)
    {
        const scalar dT = 1.0e-3;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };

    solver::NROptions nro;
    nro.tolerance          = 1.0e-8;
    nro.maxIter            = 60;
    nro.lower              = 200.0;
    nro.upper              = 700.0;
    nro.bracket            = true;
    nro.monotoneIncreasing = true;
    nro.maxStep            = 25.0;

    auto r = solver::newton1D(f, df, T0, nro);
    walk.close();                       // the search is over; what follows is the answer

    const scalar Tbub = r.x;
    auto K = K_at(Tbub);
    Result out;
    out.T          = Tbub;
    out.y.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) out.y[i] = K[i] * x[i];
    out.iterations = r.iterations;
    //  A trivial root (every present K = 1) is not a bubble point
    //  (thermo/SaturationCurves.H, trivialSaturationRoot).
    out.converged  = r.converged && !trivialSaturationRoot(thermo, Tbub, P, x, K);
    out.residual   = r.residual;
    return out;
}

// -----------------------------------------------------------------------
//  Static helper: programmatic bubble-P evaluation, no I/O (DEV.md 4c C92).
//
//  S(P) = Σ K_i(T, P, x, y) x_i with y the incipient vapour iterated to its
//  own composition; S > 1 below the bubble pressure, S < 1 above it.  The
//  vapour starts from the ideal K (Psat/P, or H/P for a Henry solute) and
//  never from y = x, which for a liquid-rich composition lets the EoS take a
//  liquid-like root for the "vapour" (see the relief-valve sizer).
// -----------------------------------------------------------------------
BubblePoint::PressureResult BubblePoint::pressure(const ThermoPackage& thermo,
                                                  const sVector&       x,
                                                  scalar               T,
                                                  scalar               P_start)
{
    const std::size_t n = thermo.n();
    PressureResult out;
    sVector y(n, 0.0);

    //  The incipient vapour at each trial P has ONE home,
    //  `incipientPhase::vapour` -- the same iteration the isothermal flash's
    //  phase test runs (DEV.md 4c C110, G7), so this bubble pressure and the
    //  flash cannot disagree about one liquid again.
    //  `trivial` is set when every present K came back 1 to 1e-9: the cubic
    //  had ONE root at that (T, P), so the "liquid" and the "vapour" are the
    //  same phase and S = sum x = 1 says nothing about boiling.
    bool trivial = false;
    auto sumKx = [&](scalar P) -> scalar
    {
        const auto r = incipientPhase::vapour(thermo, T, P, x,
                                              thermo.Kvec_Raoult(T, P));
        y = r.trial;
        trivial = !r.K.empty();
        for (std::size_t i = 0; i < n && trivial; ++i)
            if (x[i] != 0.0 && std::abs(r.K[i] - 1.0) > 1.0e-9) trivial = false;
        return r.S;
    };

    constexpr scalar Pfloor = 1.0e3, Pceil = 1.0e9;      // 0.01 bar, 10 kbar
    scalar Phi = (P_start > Pfloor) ? P_start : Pfloor;
    while (sumKx(Phi) > 1.0)
    {
        if (Phi >= Pceil) { out.P = Phi; return out; }   // not converged
        Phi *= 2.0;
    }
    scalar Plo = Pfloor;
    if (Phi <= Pfloor || sumKx(Plo) <= 1.0)
    {
        //  THE FLOOR ANSWERED WITH ONE ROOT (2026-10-21, DEV.md 4c C123).
        //  A cubic at 0.01 bar and a temperature near or above a solvent's
        //  critical point (methanol at 473 K: 0.92 Tc) has no liquid root;
        //  K = 1 for every component and S = 1, which the test above used to
        //  read as "this liquid does not boil even at 0.01 bar" -- a bubble
        //  pressure of 1 kPa, `converged`, returned for a CO2-in-methanol
        //  liquid whose measured bubble pressure is 7.5 MPa (Brunner 1987),
        //  and a store sizer's "the liquid would boil in the vessel" disarmed
        //  for every such liquid.  So: when the floor's answer is TRIVIAL,
        //  look for a pressure that boils by halving down from Phi; a
        //  non-trivial S <= 1 keeps halving, a trivial one ends the search,
        //  and finding none is `converged false` -- no bubble pressure found
        //  -- never `belowFloor`.  A floor answer that is not trivial takes
        //  the path it always took, bit for bit.
        if (Phi > Pfloor && trivial)
        {
            bool found = false;
            Plo = Phi;
            while (Plo > Pfloor)
            {
                Plo = std::max(0.5 * Plo, Pfloor);
                const scalar S = sumKx(Plo);
                if (trivial) break;
                if (S > 1.0) { found = true; break; }
            }
            if (!found)
            {
                out.P = Plo;  out.converged = false;
                return out;
            }
        }
        else
        {
            out.P = Pfloor;  out.belowFloor = true;  out.converged = true;
            sumKx(Pfloor);   out.y = y;
            return out;
        }
    }
    for (int it = 0; it < 200 && Phi / Plo > 1.0 + 1.0e-10; ++it)
    {
        const scalar Pm = std::sqrt(Plo * Phi);
        if (sumKx(Pm) > 1.0) Plo = Pm; else Phi = Pm;
    }
    out.P = std::sqrt(Plo * Phi);
    sumKx(out.P);
    out.y = y;
    out.converged = true;
    return out;
}

int BubblePoint::solve(const DictPtr& dict,
                       const ThermoPackage& thermo,
                       int verbosity)
{
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar P     = operDict->lookupScalar("P", Dims::pressure);
    const scalar Tinit = operDict->lookupScalarOrDefault("Tinit", 0.0,
                                                          Dims::temperature);

    const std::size_t n = thermo.n();
    sVector x(n, 0.0);
    scalar xsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        x[i] = compDict->lookupScalar(key);
        xsum += x[i];
    }
    if (std::abs(xsum - 1.0) > 1.0e-6)
    {
        std::cerr << "Warning: liquid composition sums to " << xsum
                  << "; normalising.\n";
        for (auto& v : x) v /= xsum;
    }

    std::cout << "Liquid composition (x):\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << thermo.comp(i).name() << "  = " << x[i] << "\n";
    std::cout << "Pressure: " << (P * 1.0e-5) << " bar\n";
    if (Tinit > 0.0)
        std::cout << "Initial T guess: " << Tinit << " K\n\n";
    else
        std::cout << "Initial T guess: weighted Tb"
                  << (thermo.hasEos() && thermo.vapourFugacityDependsOnComposition()
                          ? " at the pressure (Trouton, real vapour)" : "")
                  << "\n\n";

    // The compute() helper is silent; for verbosity ≥ 3 we re-run the
    // Newton manually here so the iteration trace is visible.  At lower
    // verbosity we call compute() once and skip the print loop.
    BubblePoint::Result r;
    if (verbosity >= 3)
    {
        // Re-implement the Newton with trace echoing.  Same options as
        // compute() --- keep them in sync if compute() changes.
        AdvisoryFrame walk("bubble-point temperature search");   // PO-02: see compute()
        scalar T0 = (Tinit > 0.0) ? Tinit : 0.0;
        if (T0 <= 0.0) T0 = weightedBoilingGuess(thermo, x, P);

        auto K_at = [&](scalar T) { return bubbleK(thermo, T, P, x); };
        auto f = [&](scalar T)
        {
            auto K = K_at(T);
            scalar s = 0.0;
            for (std::size_t i = 0; i < n; ++i) s += K[i] * x[i];
            return s - 1.0;
        };
        auto df = [&](scalar T)
        {
            const scalar dT = 1.0e-3;
            return (f(T + dT) - f(T - dT)) / (2.0 * dT);
        };

        solver::NROptions nro;
        nro.tolerance          = 1.0e-8;
        nro.maxIter            = 60;
        nro.lower              = 200.0;
        nro.upper              = 700.0;
        nro.bracket            = true;
        nro.monotoneIncreasing = true;
        nro.maxStep            = 25.0;

        std::cout << "Bubble-T Newton-Raphson:\n"
                  << "   it       T [K]        f(T)         df/dT          ΔT\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
        nro.onIter = [this](const solver::NRTrace& tr)
        {
            recordResidual(std::abs(tr.f));
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        };
        auto raw = solver::newton1D(f, df, T0, nro);
        walk.close();
        const scalar Tbub = raw.x;
        auto K = K_at(Tbub);
        r.T = Tbub;
        r.y.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) r.y[i] = K[i] * x[i];
        r.iterations = raw.iterations;
        r.converged  = raw.converged && !trivialSaturationRoot(thermo, Tbub, P, x, K);
        r.residual   = raw.residual;
    }
    else
    {
        r = BubblePoint::compute(thermo, x, P, Tinit);
    }

    if (!r.converged)
    {
        const auto Kt = bubbleK(thermo, r.T, P, x);
        if (trivialSaturationRoot(thermo, r.T, P, x, Kt))
            std::cout << "  [bubbleT] the root found is TRIVIAL: every present"
                         " K = 1 at T = " << std::fixed << std::setprecision(4)
                      << r.T << " K, so the vapour was priced as the liquid itself"
                         " (one root of the cubic for both phases).  It is not a"
                         " bubble point and is reported as NOT converged.\n";
    }

    kpis_.clear();
    kpis_["T_bubble"]   = r.T;
    kpis_["P"]          = P;
    kpis_["converged"]  = r.converged ? 1.0 : 0.0;
    kpis_["iterations"] = static_cast<scalar>(r.iterations);
    for (std::size_t i = 0; i < n; ++i)
        kpis_["y_" + thermo.comp(i).name()] = r.y[i];

    std::cout << "\n=========================  Bubble-T Result  ========================\n"
              << "  T_bubble:      " << std::fixed << std::setprecision(4) << r.T
              << "  K  ( " << (r.T - 273.15) << " °C )\n"
              << "  Converged:     " << (r.converged ? "yes" : "NO") << "\n"
              << "  Iterations:    " << r.iterations << "\n"
              << "  Final |f|:     " << std::scientific << std::setprecision(3)
              << r.residual << "\n\n";

    auto K_final = bubbleK(thermo, r.T, P, x);
    std::cout << "  Component         x          y          K\n"
              << "  -------------------------------------------------\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << std::left << std::setw(14) << thermo.comp(i).name()
                  << std::right << std::fixed << std::setprecision(6)
                  << "  " << x[i]
                  << "  " << r.y[i]
                  << std::setprecision(4) << "  " << K_final[i] << "\n";
    std::cout << "===================================================================\n\n";

    return r.converged ? 0 : 1;
}

} // namespace Choupo
