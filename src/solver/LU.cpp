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

#include "LU.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <utility>

namespace Choupo::solver
{

// ---------------------------------------------------------------------------
//  In-place LU factorisation with partial (row) pivoting.
//
//  On return A holds, in its lower triangle (below the diagonal), the
//  multipliers of L (L has an implied unit diagonal), and on/above the
//  diagonal the entries of U.  `piv[k]` is the row swapped into position k.
//  This is exactly the forward-elimination half of gaussSolve, kept apart so
//  the factorisation can be reused across several right-hand sides.
// ---------------------------------------------------------------------------
void luFactor(std::vector<sVector>& A, std::vector<std::size_t>& piv)
{
    const std::size_t n = A.size();
    piv.assign(n, 0);
    for (std::size_t i = 0; i < n; ++i) piv[i] = i;

    //  The pivot test's scales, from a two-sided equilibration of the matrix
    //  AS GIVEN: r_i = max_j |a_ij| (indexed by the ORIGINAL row, which piv
    //  tracks through the swaps), then c_j = max_i |a_ij| / r_i.  The scaled
    //  matrix a_ij / (r_i c_j) has every row and column maximum <= 1, and it
    //  is the same matrix whatever positive diagonal scaling of rows (units
    //  of a residual) and columns (units of an unknown) was handed in.
    sVector rowScale(n, 0.0), colScale(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
        for (scalar a : A[i]) rowScale[i] = std::max(rowScale[i], std::abs(a));
    for (std::size_t i = 0; i < n; ++i)
        if (rowScale[i] > 0.0)
            for (std::size_t j = 0; j < n; ++j)
                colScale[j] = std::max(colScale[j], std::abs(A[i][j]) / rowScale[i]);

    for (std::size_t k = 0; k < n; ++k)
    {
        // Partial pivot: largest |entry| in column k at or below the diagonal.
        std::size_t pivot = k;
        scalar      best  = std::abs(A[k][k]);
        for (std::size_t i = k + 1; i < n; ++i)
        {
            if (std::abs(A[i][k]) > best)
            {
                best  = std::abs(A[i][k]);
                pivot = i;
            }
        }
        //  THE PIVOT TEST IS SCALE-INVARIANT, AND IT CATCHES NaN (C245, from
        //  the 2026-11-08 kernel audit).  It was `best < 1e-30`: absolute, so
        //  a well-conditioned matrix of entries ~1e-31 was "singular" while a
        //  pivot of 1e-16 against rows of order 1 -- a row dependent on the
        //  rows above it to working precision -- was factored; and a NaN
        //  pivot PASSED it (NaN < x is false), so a non-finite matrix was
        //  factored into a NaN step.  The pivot is now measured in the
        //  EQUILIBRATED matrix, !(best > 1e-14 * r_pivotRow * c_k): below that
        //  the row is dependent on the rows above to working precision.  Both
        //  scales are needed, and both were measured: relative to max|A| the
        //  test refused the stage speciation inside stripper02 (rows that
        //  differ by more than 1e14); relative to the row alone it refused
        //  column05 at every flow x1e-8 (check_degenerate_limits A8: the
        //  extent unknowns in kmol/s make one column of the MESH Jacobian
        //  ~1e13 against O(1) beside it).  Every comparison with NaN is
        //  false, so NaN refuses.
        if (!(best > 1.0e-14 * rowScale[piv[pivot]] * colScale[k]))
            throw std::runtime_error("luFactor: matrix is singular at row "
                                     + std::to_string(k));
        if (pivot != k)
        {
            std::swap(A[k], A[pivot]);
            std::swap(piv[k], piv[pivot]);
        }

        // Store multipliers in L (the sub-diagonal of A) and eliminate U.
        for (std::size_t i = k + 1; i < n; ++i)
        {
            const scalar factor = A[i][k] / A[k][k];
            A[i][k] = factor;                       // L multiplier
            for (std::size_t j = k + 1; j < n; ++j) A[i][j] -= factor * A[k][j];
        }
    }
}

// ---------------------------------------------------------------------------
//  Solve L·U·x = P·b for one right-hand side, given the factors from luFactor.
// ---------------------------------------------------------------------------
sVector luSolve(const std::vector<sVector>&     LU,
                const std::vector<std::size_t>& piv,
                sVector                         b)
{
    const std::size_t n = LU.size();
    if (b.size() != n)
        throw std::runtime_error("luSolve: dimension mismatch");

    // Apply the row permutation P to b.
    sVector pb(n);
    for (std::size_t i = 0; i < n; ++i) pb[i] = b[piv[i]];

    // Forward substitution: L·y = P·b  (L has unit diagonal).
    sVector y(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar s = pb[i];
        for (std::size_t j = 0; j < i; ++j) s -= LU[i][j] * y[j];
        y[i] = s;
    }

    // Back substitution: U·x = y.
    sVector x(n);
    for (std::size_t k = n; k-- > 0; )
    {
        scalar s = y[k];
        for (std::size_t j = k + 1; j < n; ++j) s -= LU[k][j] * x[j];
        x[k] = s / LU[k][k];
    }
    return x;
}

void luSolveInto(const std::vector<sVector>&     LU,
                 const std::vector<std::size_t>& piv,
                 const scalar*                   b,
                 sVector&                        x,
                 sVector&                        pb,
                 sVector&                        y)
{
    //  luSolve, operation for operation, into caller-owned storage.
    const std::size_t n = LU.size();
    pb.resize(n); y.resize(n); x.resize(n);
    for (std::size_t i = 0; i < n; ++i) pb[i] = b[piv[i]];
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar s = pb[i];
        for (std::size_t j = 0; j < i; ++j) s -= LU[i][j] * y[j];
        y[i] = s;
    }
    for (std::size_t k = n; k-- > 0; )
    {
        scalar s = y[k];
        for (std::size_t j = k + 1; j < n; ++j) s -= LU[k][j] * x[j];
        x[k] = s / LU[k][k];
    }
}

} // namespace Choupo::solver
