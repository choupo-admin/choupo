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

#include "core/InfeasibleTrial.H"
#include "NewtonND.H"
#include "LU.H"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <utility>

namespace Choupo::solver {

namespace {

scalar normL2(const sVector& v)
{
    scalar s = 0.0;
    for (auto x : v) s += x * x;
    return std::sqrt(s);
}

// Build Jacobian J[i][j] = ∂F_i/∂x_j via central finite differences.
//  `F0` is the residual at the base point x (used to fall back to a one-sided
//  difference when a perturbation lands on an INFEASIBLE trial point -- a unit
//  throwing InfeasibleTrial, not a real error).  The recovery ladder per column:
//  central -> one-sided (whichever side is feasible) -> shrink h and retry ->
//  a clear probe failure if no feasible perturbation exists.  This is exact
//  finite differencing on feasible points, never a silent clamp or penalty.
std::vector<sVector> fdJacobian(const std::function<sVector(const sVector&)>& F,
    const sVector&                                x,
    const sVector&                                F0,
    scalar                                        h0,
    bool                                          parallel)
{
    const std::size_t n = x.size();
    std::vector<sVector> J(n, sVector(n, 0.0));

    auto column = [&](std::size_t j)
    {
        scalar h = h0 * std::max(std::abs(x[j]), 1.0);
        for (int attempt = 0; attempt < 6; ++attempt)
        {
            sVector xp = x, xm = x;
            xp[j] = x[j] + h;
            xm[j] = x[j] - h;
            bool okP = true, okM = true;
            sVector Fp, Fm;
            try { Fp = F(xp); } catch (const InfeasibleTrial&) { okP = false; }
            try { Fm = F(xm); } catch (const InfeasibleTrial&) { okM = false; }
            if (okP && okM)          // central difference (both feasible)
            {
                for (std::size_t i = 0; i < n; ++i)
                    J[i][j] = (Fp[i] - Fm[i]) / (2.0 * h);
                return;
            }
            if (okP)                 // forward one-sided (x+h feasible, x-h not)
            {
                for (std::size_t i = 0; i < n; ++i)
                    J[i][j] = (Fp[i] - F0[i]) / h;
                return;
            }
            if (okM)                 // backward one-sided (x-h feasible, x+h not)
            {
                for (std::size_t i = 0; i < n; ++i)
                    J[i][j] = (F0[i] - Fm[i]) / h;
                return;
            }
            h *= 0.25;               // both infeasible: shrink toward x and retry
        }
        throw InfeasibleTrial("fdJacobian: no feasible perturbation for variable "
                              + std::to_string(j) + " (probe cornered by unit feasibility)");
    };

#ifndef __EMSCRIPTEN__
    // Parallel ONLY when the caller asserts F is thread-safe (a pure function with
    // no shared mutable state).  The recycle / flowsheet Newton mutates unit state
    // per evaluation and must stay serial -- so this is opt-in (opts.parallel).
    const unsigned hw = std::thread::hardware_concurrency();
    std::size_t nThreads = (hw > 3u) ? static_cast<std::size_t>(hw) - 2u : 1u;  // cores − 2
    nThreads = std::min(nThreads, n);
    if (parallel && nThreads > 1 && n >= 8)
    {
        std::atomic<std::size_t> next{0};  // dynamic load balancing (columns vary in cost)
        std::exception_ptr eptr;           // a residual may throw on a perturbed point;
        std::mutex eMutex;                 // surface it (a thread exception would terminate)
        auto worker = [&]()
        {
            try
            { for (std::size_t j = next.fetch_add(1); j < n; j = next.fetch_add(1)) column(j); }
            catch (...)
            { std::lock_guard<std::mutex> lk(eMutex); if (!eptr) eptr = std::current_exception(); }
        };
        std::vector<std::thread> pool;
        pool.reserve(nThreads);
        for (std::size_t t = 0; t < nThreads; ++t) pool.emplace_back(worker);
        for (auto& th : pool) th.join();
        if (eptr) std::rethrow_exception(eptr);
        return J;
    }
#endif
    for (std::size_t j = 0; j < n; ++j) column(j);   // serial (recycle / small / WASM)
    return J;
}

} // anonymous namespace

// ---------------------------------------------------------------------------
//  Gauss elimination with partial pivoting.
//
//  Now a thin wrapper over the reusable luFactor / luSolve (src/solver/LU) so
//  a single factorisation can be shared -- the stiff Rosenbrock integrator
//  factors W = I - gamma*h*J once and back-solves it three times.  Same
//  partial-pivot rule, same singular threshold, same U entries and
//  substitution order, so Newton's results are unchanged.
// ---------------------------------------------------------------------------
sVector gaussSolve(std::vector<sVector> A, sVector b)
{
    const std::size_t n = b.size();
    if (A.size() != n)
        throw std::runtime_error("gaussSolve: A.size != b.size");

    std::vector<std::size_t> piv;
    luFactor(A, piv);
    return luSolve(A, piv, std::move(b));
}

// ---------------------------------------------------------------------------
//  Newton n-D with backtracking
// ---------------------------------------------------------------------------
NDResult newtonND(const std::function<sVector(const sVector&)>& F,
    sVector                                       x0,
    const NDOptions&                              opts)
{
    sVector x = std::move(x0);
    sVector Fx = F(x);
    scalar  normF = normL2(Fx);

    int it = 0;
    for (; it < opts.maxIter; ++it)
    {
        if (normF < opts.tolerance)
            return {x, Fx, normF, it, true};

        // Build J(x) and solve J · dx = -F
        auto J = fdJacobian(F, x, Fx, opts.fdStep, opts.parallel);
        sVector minusFx(Fx.size());
        for (std::size_t i = 0; i < Fx.size(); ++i) minusFx[i] = -Fx[i];

        sVector dx;
        try { dx = gaussSolve(J, minusFx); }
        catch (const std::exception& e)
        {
            // Singular Jacobian — bail with last iterate.
            if (opts.onIter) opts.onIter({it, x, Fx, normF, 0.0});
            return {x, Fx, normF, it, false};
        }

        // Backtracking line search
        scalar alpha = 1.0;
        sVector xNew(x.size());
        sVector FxNew;
        scalar  normFNew;
        if (opts.backtracking)
        {
            while (alpha >= opts.minAlpha)
            {
                for (std::size_t i = 0; i < x.size(); ++i)
                    xNew[i] = x[i] + alpha * dx[i];
                try { FxNew = F(xNew); }
                catch (const InfeasibleTrial&) { alpha *= 0.5; continue; }  // trial infeasible: shorten
                normFNew = normL2(FxNew);
                if (normFNew < normF) break;
                alpha *= 0.5;
            }
        }
        else
        {
            scalar a = 1.0;
            for (;;)
            {
                for (std::size_t i = 0; i < x.size(); ++i)
                    xNew[i] = x[i] + a * dx[i];
                try { FxNew = F(xNew); break; }
                catch (const InfeasibleTrial&) { a *= 0.5; if (a < opts.minAlpha) throw; }
            }
            normFNew = normL2(FxNew);
        }

        if (opts.onIter) opts.onIter({it, x, Fx, normF, alpha});

        x = std::move(xNew);
        Fx = std::move(FxNew);
        normF = normFNew;
    }

    return {x, Fx, normF, it, normF < opts.tolerance};
}

} // namespace Choupo::solver
