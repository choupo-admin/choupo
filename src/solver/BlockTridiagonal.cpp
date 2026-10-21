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

#include "BlockTridiagonal.H"
#include "LU.H"

namespace Choupo::solver
{

BlockBands::BlockBands(std::size_t N_, std::size_t nv_) : N(N_), nv(nv_)
{
    b.resize(N);
    for (auto& row : b)
        for (auto& blk : row)
            blk.assign(nv, sVector(nv, 0.0));
}

//  Forward elimination, marching down the blocks: for b > 0
//      L_b  = sub_b * inv(D'_{b-1})
//      D'_b = diag_b - L_b * sup_{b-1}
//  with inv() applied as luSolve on unit columns.  (Moved verbatim from
//  NewtonND.cpp's one-shot solve on 2026-10-21 when the integrator became
//  its second caller; the arithmetic order is unchanged, so the MESH's
//  Newton steps are bit-identical.)
BlockThomasLU blockThomasFactor(const BlockBands& A)
{
    const std::size_t N = A.N, nv = A.nv;
    BlockThomasLU F;
    F.N = N;
    F.nv = nv;
    F.L.assign(N, std::vector<sVector>(nv, sVector(nv, 0.0)));
    F.Dfac.resize(N);
    F.Dpiv.resize(N);
    F.sup.resize(N);
    for (std::size_t bidx = 0; bidx < N; ++bidx)
        F.sup[bidx] = A.b[bidx][2];

    for (std::size_t bidx = 0; bidx < N; ++bidx)
    {
        std::vector<sVector> D = A.b[bidx][1];
        if (bidx > 0)
        {
            const auto& sub = A.b[bidx][0];
            std::vector<sVector> Dinv(nv, sVector(nv, 0.0));
            for (std::size_t cix = 0; cix < nv; ++cix)
            {
                sVector e(nv, 0.0); e[cix] = 1.0;
                sVector col = luSolve(F.Dfac[bidx-1], F.Dpiv[bidx-1],
                                      std::move(e));
                for (std::size_t i = 0; i < nv; ++i) Dinv[i][cix] = col[i];
            }
            auto& L = F.L[bidx];
            for (std::size_t i = 0; i < nv; ++i)
                for (std::size_t jx = 0; jx < nv; ++jx)
                {
                    scalar acc = 0.0;
                    for (std::size_t kx = 0; kx < nv; ++kx)
                        acc += sub[i][kx] * Dinv[kx][jx];
                    L[i][jx] = acc;
                }
            const auto& supPrev = A.b[bidx-1][2];
            for (std::size_t i = 0; i < nv; ++i)
                for (std::size_t jx = 0; jx < nv; ++jx)
                {
                    scalar acc = 0.0;
                    for (std::size_t kx = 0; kx < nv; ++kx)
                        acc += L[i][kx] * supPrev[kx][jx];
                    D[i][jx] -= acc;
                }
        }
        F.Dfac[bidx] = std::move(D);
        luFactor(F.Dfac[bidx], F.Dpiv[bidx]);
    }
    return F;
}

//  y_b = rhs_b - L_b y_{b-1}  (forward), then
//  x_b = inv(D'_b) (y_b - sup_b x_{b+1})  (backward).
sVector blockThomasSolve(const BlockThomasLU& F, sVector rhs)
{
    const std::size_t N = F.N, nv = F.nv;
    std::vector<sVector> y(N, sVector(nv, 0.0));
    for (std::size_t bidx = 0; bidx < N; ++bidx)
        for (std::size_t i = 0; i < nv; ++i)
            y[bidx][i] = rhs[bidx * nv + i];
    for (std::size_t bidx = 1; bidx < N; ++bidx)
        for (std::size_t i = 0; i < nv; ++i)
        {
            scalar acc = 0.0;
            for (std::size_t kx = 0; kx < nv; ++kx)
                acc += F.L[bidx][i][kx] * y[bidx-1][kx];
            y[bidx][i] -= acc;
        }

    sVector xsol(N * nv, 0.0);
    for (long bidx = long(N) - 1; bidx >= 0; --bidx)
    {
        sVector r = y[std::size_t(bidx)];
        if (bidx + 1 < long(N))
        {
            const auto& sup = F.sup[std::size_t(bidx)];
            for (std::size_t i = 0; i < nv; ++i)
            {
                scalar acc = 0.0;
                for (std::size_t kx = 0; kx < nv; ++kx)
                    acc += sup[i][kx] * xsol[std::size_t(bidx+1) * nv + kx];
                r[i] -= acc;
            }
        }
        sVector xb = luSolve(F.Dfac[std::size_t(bidx)],
                             F.Dpiv[std::size_t(bidx)], std::move(r));
        for (std::size_t i = 0; i < nv; ++i)
            xsol[std::size_t(bidx) * nv + i] = xb[i];
    }
    return xsol;
}

sVector blockThomasSolve(const BlockBands& A, sVector rhs)
{
    return blockThomasSolve(blockThomasFactor(A), std::move(rhs));
}

} // namespace Choupo::solver
