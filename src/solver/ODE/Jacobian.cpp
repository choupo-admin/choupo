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

#include "Jacobian.H"

#include <algorithm>
#include <cmath>

namespace Choupo::solver
{

namespace
{
// sqrt of double machine epsilon -- the classic forward-difference step scale.
const scalar kSqrtEps = std::sqrt(2.220446049250313e-16);
}

std::vector<sVector> fdJacobianODE(const DerivFn& f,
                                   scalar         t,
                                   const sVector& y,
                                   const sVector& f0,
                                   const sVector& typ)
{
    const std::size_t n = y.size();
    std::vector<sVector> J(n, sVector(n, 0.0));
    sVector yp = y;
    for (std::size_t j = 0; j < n; ++j)
    {
        const scalar scale = std::max(std::abs(y[j]),
                                      (j < typ.size() ? std::abs(typ[j]) : 1.0));
        scalar eps = kSqrtEps * std::max(scale, 1.0e-30);
        // Keep the perturbation off an exact zero.
        if (eps == 0.0) eps = kSqrtEps;
        yp[j] = y[j] + eps;
        const sVector fp = f(t, yp);
        yp[j] = y[j];
        const scalar inv = 1.0 / eps;
        for (std::size_t i = 0; i < n; ++i)
            J[i][j] = (fp[i] - f0[i]) * inv;
    }
    return J;
}

//  THE COLORING, for a reader meeting it for the first time.
//
//  A forward difference perturbs ONE unknown y_j and reads how every row of
//  f changes: one evaluation, one column of J.  n unknowns, n evaluations.
//  But in a block-tridiagonal model the unknown of cell b changes only the
//  rows of cells b-1, b and b+1.  Perturb slot k of cells 0, 3, 6, 9, ...
//  AT THE SAME TIME: cell 0 touches rows {0, 1}, cell 3 rows {2, 3, 4},
//  cell 6 rows {5, 6, 7} -- the sets never overlap, so every row that moved
//  moved because of exactly ONE of the perturbed unknowns, and one
//  evaluation yields that column for every third cell at once.  Three such
//  "colors" (cells b % 3 == 0, 1, 2) times nv slots: 3 nv evaluations for
//  the whole Jacobian, whether the bed has 25 cells or 2500.  (Curtis,
//  Powell & Reid, J. Inst. Math. Appl. 13 (1974) 117.)
//
//  Each column keeps ITS OWN step eps_j -- the same rule fdJacobianODE
//  uses -- and a row of a cell reads only its own neighbors, so on a
//  structure that is truly block-tridiagonal every band entry is the SAME
//  floating-point number the dense builder produces.  The integrator's
//  audit checks exactly that on its first Jacobian.
ColoredODEJacobian fdJacobianODEColored(
    const DerivFn&                                    f,
    scalar                                            t,
    const sVector&                                    y,
    const sVector&                                    f0,
    const sVector&                                    typ,
    const ODEBlockStructure&                          s,
    const std::vector<ODEBlockStructure::BorderRead>& narrow)
{
    const std::size_t N  = s.nBlocks;
    const std::size_t nv = s.blockSize;
    ColoredODEJacobian out{BlockBands(N, nv), {}, 0};
    out.narrowR.resize(narrow.size());
    for (std::size_t i = 0; i < narrow.size(); ++i)
        if (narrow[i].last >= narrow[i].first)
            out.narrowR[i].assign(
                std::size_t(narrow[i].last - narrow[i].first + 1) * nv, 0.0);

    for (std::size_t k = 0; k < nv; ++k)
        for (std::size_t color = 0; color < 3 && color < N; ++color)
        {
            //  one colored pass: slot k of every block b with b % 3 == color
            sVector yp = y;
            for (std::size_t b = color; b < N; b += 3)
            {
                const std::size_t col = s.blockRows[b * nv + k];
                const scalar scale = std::max(std::abs(y[col]),
                    (col < typ.size() ? std::abs(typ[col]) : 1.0));
                scalar eps = kSqrtEps * std::max(scale, 1.0e-30);
                if (eps == 0.0) eps = kSqrtEps;
                yp[col] = y[col] + eps;
            }
            const sVector fp = f(t, yp);
            ++out.evals;

            for (std::size_t b = color; b < N; b += 3)
            {
                const std::size_t col = s.blockRows[b * nv + k];
                //  recompute this column's own step (yp[col] - y[col] is
                //  NOT used: the dense builder divides by eps, so do we)
                const scalar scale = std::max(std::abs(y[col]),
                    (col < typ.size() ? std::abs(typ[col]) : 1.0));
                scalar eps = kSqrtEps * std::max(scale, 1.0e-30);
                if (eps == 0.0) eps = kSqrtEps;
                const scalar inv = 1.0 / eps;
                //  rows of blocks b-1, b, b+1 belong to THIS column
                for (long brow = long(b) - 1; brow <= long(b) + 1; ++brow)
                {
                    if (brow < 0 || brow >= long(N)) continue;
                    auto& blk = out.bands.b[std::size_t(brow)]
                                           [std::size_t(long(b) - brow + 1)];
                    for (std::size_t i = 0; i < nv; ++i)
                    {
                        const std::size_t r =
                            s.blockRows[std::size_t(brow) * nv + i];
                        blk[i][k] = (fp[r] - f0[r]) * inv;
                    }
                }
                //  a narrow border row reading block b: this pass perturbs
                //  no other column it reads (its span is <= 3 blocks)
                for (std::size_t i = 0; i < narrow.size(); ++i)
                    if (long(b) >= narrow[i].first && long(b) <= narrow[i].last)
                        out.narrowR[i][std::size_t(long(b) - narrow[i].first) * nv + k]
                            = (fp[narrow[i].row] - f0[narrow[i].row]) * inv;
            }
        }
    return out;
}

sVector fdDfDt(const DerivFn& f, scalar t, const sVector& y,
               const sVector& f0, scalar tScale)
{
    const std::size_t n = y.size();
    const scalar dt = kSqrtEps * std::max(std::abs(t), std::max(tScale, 1.0e-30));
    if (dt == 0.0) return sVector(n, 0.0);
    const sVector fp = f(t + dt, y);
    sVector d(n);
    const scalar inv = 1.0 / dt;
    for (std::size_t i = 0; i < n; ++i) d[i] = (fp[i] - f0[i]) * inv;
    return d;
}

} // namespace Choupo::solver
