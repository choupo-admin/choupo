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

#include "DewPoint.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include "thermo/activityCoefficient/ActivityModel.H"

namespace Choupo {

//  ---- THE SOLVER, EXTRACTED --------------------------------------------
//
//  Lifted verbatim out of `solve()` so a caller that is not a unit -- the
//  phase-envelope op -- can ask for a dew temperature without carrying a
//  second copy of the residual sum(y_i/K_i) = 1.  Two homes for one equation
//  is the arity sin, and this one would drift invisibly: both copies would
//  converge, to slightly different curves, and nothing would say which.
//
//  The unit keeps its console tracing and calls this for the arithmetic; the
//  numbers must not move, which is what the dew goldens check.
DewPoint::Result DewPoint::compute(const ThermoPackage& thermo,
                                   const sVector&       y,
                                   scalar               P,
                                   scalar               T_init,
                                   const OuterTrace&    onOuter,
                                   const solver::NROptions* nroOverride)
{
    Result out;
    const std::size_t n = thermo.n();
    sVector x = y;                       // initial liquid-composition guess

    scalar T0 = T_init;
    if (T0 <= 0.0)
    {
        T0 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            T0 += y[i] * (thermo.comp(i).Tb() > 0 ? thermo.comp(i).Tb() : 350.0);
    }

    const bool isIdeal = (thermo.activity().modelName() == "ideal");
    const scalar compTol  = 1.0e-6;
    const int    maxOuter = isIdeal ? 1 : 30;

    scalar Tdew = T0;
    int    outerIt = 0;

    for (outerIt = 0; outerIt < maxOuter; ++outerIt)
    {
        auto f = [&](scalar T)
        {
            auto K = thermo.Kvec(T, P, x, y);
            scalar s = 0.0;
            for (std::size_t i = 0; i < n; ++i) s += y[i] / K[i];
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
        nro.monotoneIncreasing = false;   // sum y_i / K_i decreases with T
        nro.maxStep            = 25.0;
        if (nroOverride) nro = *nroOverride;

        auto r = solver::newton1D(f, df, Tdew, nro);
        Tdew = r.x;
        out.newtonIterations += r.iterations;
        out.converged = r.converged;

        auto K = thermo.Kvec(Tdew, P, x, y);
        sVector xNew(n);
        scalar xsum = 0.0;
        for (std::size_t i = 0; i < n; ++i) { xNew[i] = y[i] / K[i]; xsum += xNew[i]; }
        for (auto& v : xNew) v /= xsum;

        scalar dsum = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar d = xNew[i] - x[i];
            dsum += d*d;
        }
        out.compDelta = std::sqrt(dsum);
        if (onOuter) onOuter(outerIt, Tdew, out.compDelta);
        x = xNew;
        if (out.compDelta < compTol) break;
    }
    out.T = Tdew;
    out.x = x;
    out.outerIterations = outerIt + 1;
    return out;
}

int DewPoint::solve(const DictPtr& dict,
                    const ThermoPackage& thermo,
                    int verbosity)
{
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar P     = operDict->lookupScalar("P", Dims::pressure);
    const scalar Tinit = operDict->lookupScalarOrDefault("Tinit", 0.0,
                                                          Dims::temperature);

    const std::size_t n = thermo.n();
    sVector y(n, 0.0);
    scalar ysum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        y[i] = compDict->lookupScalar(key);
        ysum += y[i];
    }
    if (std::abs(ysum - 1.0) > 1.0e-6)
    {
        std::cerr << "Warning: vapour composition sums to " << ysum
                  << "; normalising.\n";
        for (auto& v : y) v /= ysum;
    }

    sVector x = y;     // initial liquid-composition guess

    scalar T0 = Tinit;
    if (T0 <= 0.0)
    {
        T0 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            T0 += y[i] * (thermo.comp(i).Tb() > 0 ? thermo.comp(i).Tb() : 350.0);
    }

    std::cout << "Vapour composition (y):\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << thermo.comp(i).name() << "  = " << y[i] << "\n";
    std::cout << "Pressure: " << (P * 1.0e-5) << " bar\n"
              << "Initial T guess: " << T0 << " K\n\n";

    //  `isIdeal` still decides the console trace; the tolerance and the outer
    //  cap now live with the loop, in `compute`, where they are used.  Keeping
    //  dead copies here would be two homes for a convergence control -- the
    //  kind that goes stale without a symptom, because the live one still
    //  works.
    const bool isIdeal = (thermo.activity().modelName() == "ideal");

    scalar Tdew = T0;
    int    outerIt = 0;
    scalar compDelta = 0.0;
    bool   converged = false;
    int    totalNewtonIter = 0;
    (void)compDelta;    // reported below out of `res`, kept for the printout

    if (verbosity >= 3 && !isIdeal)
        std::cout << "Outer loop on liquid composition (γ depends on x):\n"
                  << "   it       Tdew         |Δx|2\n"
                  << "  ----  -----------  -----------\n";

    //  ONE HOME FOR THE ARITHMETIC.  The loop lives in `compute`; this unit
    //  supplies the console trace and the residual history through the hook,
    //  so the equation exists once.  Before this the phase-envelope op would
    //  have needed its own copy of sum(y_i/K_i) = 1 -- two homes that both
    //  converge, to slightly different curves, with nothing to say which.
    solver::NROptions nroTraced;
    nroTraced.tolerance          = 1.0e-8;
    nroTraced.maxIter            = 60;
    nroTraced.lower              = 200.0;
    nroTraced.upper              = 700.0;
    nroTraced.bracket            = true;
    nroTraced.monotoneIncreasing = false;
    nroTraced.maxStep            = 25.0;
    if (verbosity >= 4 || (verbosity >= 3 && isIdeal))
    {
        std::cout << "Dew-T Newton-Raphson:\n"
                  << "   it       T [K]        f(T)         df/dT          \u0394T\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
        nroTraced.onIter = [&](const solver::NRTrace& tr)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        };
    }

    auto res = compute(thermo, y, P, T0,
        [&](int it, scalar T, scalar d)
        {
            recordResidual(d);
            if (verbosity >= 3 && !isIdeal)
                std::cout << "  " << std::setw(4) << it
                          << "  " << std::fixed << std::setprecision(4)
                          << std::setw(11) << T
                          << "  " << std::scientific << std::setprecision(3)
                          << std::setw(11) << d << "\n";
        },
        &nroTraced);

    Tdew            = res.T;
    x               = res.x;
    converged       = res.converged;
    compDelta       = res.compDelta;
    outerIt         = res.outerIterations - 1;
    totalNewtonIter = res.newtonIterations;

    auto K = thermo.Kvec(Tdew, P, x, y);
    std::cout << "\n=========================  Dew-T Result  ===========================\n"
              << "  T_dew:         " << std::fixed << std::setprecision(4) << Tdew
              << "  K  ( " << (Tdew - 273.15) << " °C )\n"
              << "  Converged:     " << (converged ? "yes" : "NO") << "\n"
              << "  Outer iter.:   " << (outerIt + 1) << "\n"
              << "  Total Newton:  " << totalNewtonIter << "\n\n";

    std::cout << "  Component         y          x          K\n"
              << "  -------------------------------------------------\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << std::left << std::setw(14) << thermo.comp(i).name()
                  << std::right << std::fixed << std::setprecision(6)
                  << "  " << y[i]
                  << "  " << x[i]
                  << std::setprecision(4) << "  " << K[i] << "\n";
    std::cout << "===================================================================\n\n";

    return converged ? 0 : 1;
}

} // namespace Choupo
