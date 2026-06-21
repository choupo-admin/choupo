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

#include "NewtonND.H"
#include "LU.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
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
std::vector<sVector> fdJacobian(const std::function<sVector(const sVector&)>& F,
    const sVector&                                x,
    scalar                                        h0)
{
    const std::size_t n = x.size();
    std::vector<sVector> J(n, sVector(n, 0.0));
    sVector xp = x, xm = x;
    for (std::size_t j = 0; j < n; ++j)
    {
        const scalar h = h0 * std::max(std::abs(x[j]), 1.0);
        xp[j] = x[j] + h;
        xm[j] = x[j] - h;
        auto Fp = F(xp);
        auto Fm = F(xm);
        for (std::size_t i = 0; i < n; ++i)
            J[i][j] = (Fp[i] - Fm[i]) / (2.0 * h);
        xp[j] = x[j];
        xm[j] = x[j];
    }
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
        auto J = fdJacobian(F, x, opts.fdStep);
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
                FxNew    = F(xNew);
                normFNew = normL2(FxNew);
                if (normFNew < normF) break;
                alpha *= 0.5;
            }
        }
        else
        {
            for (std::size_t i = 0; i < x.size(); ++i)
                xNew[i] = x[i] + dx[i];
            FxNew    = F(xNew);
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
