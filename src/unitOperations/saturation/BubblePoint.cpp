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
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>

namespace Choupo {

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

    // Initial T guess: mole-fraction-weighted normal boiling point.
    scalar T0 = T_init;
    if (T0 <= 0.0)
    {
        T0 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            T0 += x[i] * (thermo.comp(i).Tb() > 0 ? thermo.comp(i).Tb() : 350.0);
    }

    auto K_at = [&](scalar T) { return thermo.Kvec(T, P, x, x); };
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

    const scalar Tbub = r.x;
    auto K = K_at(Tbub);
    Result out;
    out.T          = Tbub;
    out.y.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) out.y[i] = K[i] * x[i];
    out.iterations = r.iterations;
    out.converged  = r.converged;
    out.residual   = r.residual;
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
        std::cout << "Initial T guess: weighted Tb\n\n";

    // The compute() helper is silent; for verbosity ≥ 3 we re-run the
    // Newton manually here so the iteration trace is visible.  At lower
    // verbosity we call compute() once and skip the print loop.
    BubblePoint::Result r;
    if (verbosity >= 3)
    {
        // Re-implement the Newton with trace echoing.  Same options as
        // compute() --- keep them in sync if compute() changes.
        scalar T0 = (Tinit > 0.0) ? Tinit : 0.0;
        if (T0 <= 0.0)
            for (std::size_t i = 0; i < n; ++i)
                T0 += x[i] * (thermo.comp(i).Tb() > 0 ? thermo.comp(i).Tb() : 350.0);

        auto K_at = [&](scalar T) { return thermo.Kvec(T, P, x, x); };
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
        const scalar Tbub = raw.x;
        auto K = K_at(Tbub);
        r.T = Tbub;
        r.y.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) r.y[i] = K[i] * x[i];
        r.iterations = raw.iterations;
        r.converged  = raw.converged;
        r.residual   = raw.residual;
    }
    else
    {
        r = BubblePoint::compute(thermo, x, P, Tinit);
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

    auto K_final = thermo.Kvec(r.T, P, x, x);
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
