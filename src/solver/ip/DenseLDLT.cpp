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
-------------------------------------------------------------------------------
File
    DenseLDLT.cpp

Description
    Bunch-Kaufman P K P^T = L D L^T (Higham 1997, Algorithm 1) with inertia
    and a refined solve.  See DenseLDLT.H and Theory Guide sec:ldlt-inertia.
\*---------------------------------------------------------------------------*/

#include "solver/ip/DenseLDLT.H"

#include <algorithm>
#include <cmath>
#include <limits>

namespace Choupo::solver
{

namespace
{

//  Higham 1997, Algorithm 1: alpha = (1 + sqrt 17)/8 = 0.6404.  It is the
//  value that minimises the worst-case element growth per 1x1 / 2x2 step.
const scalar kAlpha = (1.0 + std::sqrt(17.0)) / 8.0;

scalar infNorm(const sVector& v)
{
    scalar m = 0.0;
    for (scalar x : v) m = std::max(m, std::abs(x));
    return m;
}

} // namespace

void DenseLDLT::swapSym_(std::size_t k, std::size_t a, std::size_t b)
{
    if (a == b) return;
    //  The L columns already computed (0..k-1): swap the two rows.
    for (std::size_t c = 0; c < k; ++c) std::swap(W_[a][c], W_[b][c]);
    //  The trailing matrix (indices k..n-1) is kept symmetric in BOTH
    //  triangles: P^T A P is a swap of rows a, b and then of columns a, b.
    for (std::size_t c = k; c < n_; ++c) std::swap(W_[a][c], W_[b][c]);
    for (std::size_t r = k; r < n_; ++r) std::swap(W_[r][a], W_[r][b]);
    std::swap(perm_[a], perm_[b]);
}

Inertia DenseLDLT::factor(const std::vector<sVector>& K)
{
    n_ = K.size();
    ok_ = false;
    nTwo_ = 0;
    Inertia in;

    //  Symmetrise from the LOWER triangle (the caller's upper triangle is
    //  never read) and keep a pristine copy for the residual of solve().
    K_.assign(n_, sVector(n_, 0.0));
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = 0; j <= i; ++j)
            K_[i][j] = K_[j][i] = K[i][j];
    W_ = K_;
    perm_.resize(n_);
    for (std::size_t i = 0; i < n_; ++i) perm_[i] = i;
    blk_.assign(n_, 1);
    d_.assign(n_, 0.0);
    e_.assign(n_, 0.0);
    colScale_.assign(n_, 0.0);
    normK_ = 0.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        scalar rowSum = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
        {
            colScale_[j] = std::max(colScale_[j], std::abs(K_[i][j]));
            rowSum += std::abs(K_[i][j]);
        }
        normK_ = std::max(normK_, rowSum);
    }

    std::size_t k = 0;
    while (k < n_)
    {
        //  If everything that is left is negligible (at most the zero
        //  threshold of the largest column scale still in play), the rest of
        //  K is numerically ZERO: those eigenvalues are counted zero and the
        //  factorisation is complete (a singular K, not a breakdown).
        {
            scalar rest = 0.0, scale = 0.0;
            for (std::size_t i = k; i < n_; ++i)
            {
                scale = std::max(scale, colScale_[perm_[i]]);
                for (std::size_t j = k; j < n_; ++j) rest = std::max(rest, std::abs(W_[i][j]));
            }
            if (rest <= kZeroFraction * scale)
            {
                in.zero += n_ - k;
                for (std::size_t i = k; i < n_; ++i) { blk_[i] = 1; d_[i] = 0.0; }
                for (std::size_t i = k; i < n_; ++i)
                    for (std::size_t j = k; j < n_; ++j) W_[i][j] = 0.0;
                ok_ = true;
                return in;
            }
        }

        //  ---- Algorithm 1, step 1: lambda = the largest off-diagonal of
        //  column k of the trailing matrix, at row r.
        scalar lambda = 0.0;
        std::size_t r = k;
        for (std::size_t i = k + 1; i < n_; ++i)
            if (std::abs(W_[i][k]) > lambda) { lambda = std::abs(W_[i][k]); r = i; }

        const scalar absakk = std::abs(W_[k][k]);
        std::size_t  size = 1;           //- 1x1 or 2x2 pivot
        if (absakk >= kAlpha * lambda)
        {
            //  Step 2: the diagonal is large enough (this includes lambda = 0):
            //  a 1x1 pivot at k, no interchange.
        }
        else
        {
            //  Step 3: sigma = the largest off-diagonal of column r.
            scalar sigma = 0.0;
            for (std::size_t i = k; i < n_; ++i)
                if (i != r) sigma = std::max(sigma, std::abs(W_[i][r]));
            if (absakk * sigma >= kAlpha * lambda * lambda)
            {
                //  Step 4: column k's diagonal is large enough relative to
                //  column r's off-diagonals: 1x1 pivot at k.
            }
            else if (std::abs(W_[r][r]) >= kAlpha * sigma)
            {
                //  Step 5: 1x1 pivot at r, after the interchange k <-> r.
                swapSym_(k, k, r);
            }
            else
            {
                //  Step 6: a 2x2 pivot on rows/columns k and r, after the
                //  interchange (k+1) <-> r.
                swapSym_(k, k + 1, r);
                size = 2;
            }
        }

        if (size == 1)
        {
            const scalar d   = W_[k][k];
            const scalar tau = kZeroFraction * colScale_[perm_[k]];
            scalar below = 0.0;
            for (std::size_t i = k + 1; i < n_; ++i) below = std::max(below, std::abs(W_[i][k]));
            if (!(std::abs(d) > tau))
            {
                //  A ZERO pivot.  Entries of the column that are not
                //  negligible make it a breakdown (K is singular in a way a
                //  1x1 step cannot go round); negligible ones are dropped.
                if (below > tau) return in;
                ++in.zero;
                for (std::size_t i = k + 1; i < n_; ++i) W_[i][k] = 0.0;
                d_[k] = 0.0;
                blk_[k] = 1;
                ++k;
                continue;
            }
            if (d > 0.0) ++in.positive; else ++in.negative;   //- Sylvester: the sign of a 1x1 block
            //  The multipliers l_i = a_ik / d, and the rank-one update
            //  A22 <- A22 - l d l^T (both triangles, to stay symmetric).
            sVector colk(n_, 0.0);
            for (std::size_t i = k + 1; i < n_; ++i) colk[i] = W_[i][k];
            for (std::size_t i = k + 1; i < n_; ++i)
                for (std::size_t j = k + 1; j < n_; ++j)
                    W_[i][j] -= colk[i] * colk[j] / d;
            for (std::size_t i = k + 1; i < n_; ++i) W_[i][k] = colk[i] / d;
            d_[k] = d;
            blk_[k] = 1;
            k += 1;
        }
        else
        {
            const scalar a = W_[k][k], b = W_[k + 1][k], c = W_[k + 1][k + 1];
            const scalar det = a * c - b * b;
            const scalar m   = std::max({std::abs(a), std::abs(b), std::abs(c)});
            const scalar tau = kZeroFraction * std::max(colScale_[perm_[k]], colScale_[perm_[k + 1]]);
            //  det = lambda_1 lambda_2 and the larger eigenvalue is at most
            //  about m, so the smaller one is at most about |det|/m: the block
            //  is singular when that is below the threshold.
            if (!(std::abs(det) > tau * m)) return in;
            //  Sylvester for a 2x2 block: det < 0 means eigenvalues of
            //  opposite sign (one positive, one negative); det > 0 means the
            //  same sign, which is the sign of the trace.
            if (det < 0.0) { ++in.positive; ++in.negative; }
            else if (a + c > 0.0) in.positive += 2;
            else in.negative += 2;
            ++nTwo_;
            //  The multipliers are the rows of C E^{-1}, C = A(k+2:, k:k+1),
            //  E^{-1} = 1/det [[c, -b], [-b, a]]; the update is
            //  A22 <- A22 - C E^{-1} C^T.
            sVector c1(n_, 0.0), c2(n_, 0.0), l1(n_, 0.0), l2(n_, 0.0);
            for (std::size_t i = k + 2; i < n_; ++i)
            {
                c1[i] = W_[i][k];
                c2[i] = W_[i][k + 1];
                l1[i] = (c1[i] * c - c2[i] * b) / det;
                l2[i] = (-c1[i] * b + c2[i] * a) / det;
            }
            for (std::size_t i = k + 2; i < n_; ++i)
                for (std::size_t j = k + 2; j < n_; ++j)
                    W_[i][j] -= l1[i] * c1[j] + l2[i] * c2[j];
            for (std::size_t i = k + 2; i < n_; ++i) { W_[i][k] = l1[i]; W_[i][k + 1] = l2[i]; }
            d_[k] = a;  e_[k] = b;  d_[k + 1] = c;
            blk_[k] = 2;  blk_[k + 1] = 0;
            k += 2;
        }
    }
    ok_ = true;
    return in;
}

sVector DenseLDLT::solveFactors_(const sVector& b) const
{
    sVector y(n_);
    for (std::size_t i = 0; i < n_; ++i) y[i] = b[perm_[i]];            // y = P b

    //  L z = y, block by block (a 2x2 block's own off-diagonal belongs to D).
    for (std::size_t k = 0; k < n_;)
    {
        const std::size_t s = blk_[k] == 2 ? 2 : 1;
        for (std::size_t i = k + s; i < n_; ++i)
        {
            y[i] -= W_[i][k] * y[k];
            if (s == 2) y[i] -= W_[i][k + 1] * y[k + 1];
        }
        k += s;
    }
    //  D w = z.
    for (std::size_t k = 0; k < n_;)
    {
        if (blk_[k] == 2)
        {
            const scalar a = d_[k], b2 = e_[k], c = d_[k + 1];
            const scalar det = a * c - b2 * b2;
            const scalar y0 = y[k], y1 = y[k + 1];
            y[k]     = (c * y0 - b2 * y1) / det;
            y[k + 1] = (-b2 * y0 + a * y1) / det;
            k += 2;
        }
        else
        {
            y[k] = d_[k] == 0.0 ? 0.0 : y[k] / d_[k];   //- a zero pivot: the null direction is not asked for
            k += 1;
        }
    }
    //  L^T u = w, blocks from the last.
    std::size_t k = n_;
    while (k > 0)
    {
        std::size_t s = 1;
        if (k >= 2 && blk_[k - 2] == 2) s = 2;
        const std::size_t first = k - s;
        for (std::size_t i = first + s; i < n_; ++i)
        {
            y[first] -= W_[i][first] * y[i];
            if (s == 2) y[first + 1] -= W_[i][first + 1] * y[i];
        }
        k = first;
    }
    sVector x(n_);
    for (std::size_t i = 0; i < n_; ++i) x[perm_[i]] = y[i];             // x = P^T u
    return x;
}

namespace
{

//  eta = |b - K x|_inf / ( |K|_inf |x|_inf + |b|_inf ), the residual r returned.
scalar backwardError(const std::vector<sVector>& K, scalar normK, const sVector& b,
                     const sVector& x, sVector& r)
{
    const std::size_t n = K.size();
    r.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar s = b[i];
        for (std::size_t j = 0; j < n; ++j) s -= K[i][j] * x[j];
        r[i] = s;
    }
    const scalar den = normK * infNorm(x) + infNorm(b);
    return den > 0.0 ? infNorm(r) / den : 0.0;
}

} // namespace

sVector DenseLDLT::solve(const sVector& b, SolveReport& report) const
{
    sVector x = solveFactors_(b);
    sVector r;
    scalar eta = backwardError(K_, normK_, b, x, r);
    report.backwardErrorBefore = eta;
    report.refinementSteps = 0;

    //  Iterative refinement on the UNSCALED system (review R4): at most two
    //  steps x <- x + K^{-1}(b - K x), the correction by the same factors.  A
    //  step is kept only if it lowers eta; the loop stops at round-off.
    const scalar eps = std::numeric_limits<scalar>::epsilon();
    while (report.refinementSteps < kMaxRefinementSteps && eta > eps)
    {
        const sVector dx = solveFactors_(r);
        sVector xn = x;
        for (std::size_t i = 0; i < n_; ++i) xn[i] += dx[i];
        sVector rn;
        const scalar etaN = backwardError(K_, normK_, b, xn, rn);
        ++report.refinementSteps;
        if (!(etaN < eta)) break;
        x = xn;  r = rn;  eta = etaN;
    }
    report.backwardError = eta;
    return x;
}

} // namespace Choupo::solver
