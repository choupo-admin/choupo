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
        if (best < 1.0e-30)
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

} // namespace Choupo::solver
