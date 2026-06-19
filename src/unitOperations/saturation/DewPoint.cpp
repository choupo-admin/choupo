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

namespace Choupo {

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

    const bool isIdeal = (thermo.activity().modelName() == "ideal");
    const scalar compTol  = 1.0e-6;
    const int    maxOuter = isIdeal ? 1 : 30;

    scalar Tdew = T0;
    int    outerIt = 0;
    scalar compDelta = 0.0;
    bool   converged = false;
    int    totalNewtonIter = 0;

    if (verbosity >= 3 && !isIdeal)
        std::cout << "Outer loop on liquid composition (γ depends on x):\n"
                  << "   it       Tdew         |Δx|2\n"
                  << "  ----  -----------  -----------\n";

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
        nro.monotoneIncreasing = false;   // Σ y_i / K_i decreases with T
        nro.maxStep            = 25.0;

        if (verbosity >= 4 || (verbosity >= 3 && isIdeal))
        {
            std::cout << "Dew-T Newton-Raphson:\n"
                      << "   it       T [K]        f(T)         df/dT          ΔT\n"
                      << "  ----  -----------  -------------  -------------  -------------\n";
            nro.onIter = [&](const solver::NRTrace& tr)
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

        auto r = solver::newton1D(f, df, Tdew, nro);
        Tdew = r.x;
        totalNewtonIter += r.iterations;
        converged = r.converged;

        // Update x from y / K  at the new T
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
        compDelta = std::sqrt(dsum);
        recordResidual(compDelta);

        if (verbosity >= 3 && !isIdeal)
            std::cout << "  " << std::setw(4) << outerIt
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << Tdew
                      << "  " << std::scientific << std::setprecision(3)
                      << std::setw(11) << compDelta << "\n";

        x = xNew;
        if (compDelta < compTol) break;
    }

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
