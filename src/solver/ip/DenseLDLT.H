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
    DenseLDLT.H

Description
    Dense Bunch-Kaufman factorisation of a symmetric indefinite matrix,
        P K P^T = L D L^T,
    L unit lower triangular, D block diagonal with 1x1 and 2x2 blocks, and the
    inertia of K read from D.  Slice A1 of the interior-point optimizer
    (docs/design/interior-point.md sec. 2.10); Theory Guide sec:ldlt-inertia.

    Written from Higham, "Stability of the diagonal pivoting method with
    partial pivoting", SIAM J. Matrix Anal. Appl. 18 (1997), Algorithm 1
    (the Bunch-Kaufman partial pivoting strategy, alpha = (1 + sqrt 17)/8).
    No BLAS, O(n^3/3) operations, n x n full storage: a student reads every
    line.  The sparse and block-tridiagonal versions are later slices.

    WHY 2x2 PIVOTS.  K = [[0, 1], [1, 0]] has a zero diagonal and no 1x1
    pivot: any symmetric permutation leaves the zeros.  A 2x2 block takes the
    pair at once.  The KKT matrix [[H, A], [A^T, 0]] of a constrained
    problem has exactly this shape in its constraint rows.

    THE ZERO THRESHOLD.  A pivot (1x1) whose magnitude is at most
    kZeroFraction = 1e-12 of the largest entry of its ORIGINAL column is
    counted ZERO; if entries of the same size remain under it, it is a
    BREAKDOWN (ok() is false); if they are negligible too, the column is
    dropped and the eigenvalue counted zero.  A 2x2 block is singular when
    |det E| <= tau max|E_ij| with tau the same threshold on the larger of its
    two column scales.  zeroThreshold() returns kZeroFraction so that whoever
    reports an inertia prints it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/SymmetricIndefinite.H"

#include <cstddef>
#include <vector>

namespace Choupo::solver
{

class DenseLDLT : public SymmetricIndefinite
{
public:
    //- Pivots at most this fraction of their column's scale are zero.
    static constexpr scalar kZeroFraction = 1.0e-12;

    std::string name() const override { return "denseLDLT"; }
    Inertia     factor(const std::vector<sVector>& K) override;
    bool        ok() const override { return ok_; }
    sVector     solve(const sVector& b, SolveReport& report) const override;
    scalar      zeroThreshold() const override { return kZeroFraction; }

    //- Number of 2x2 pivots the last factorisation took (a diagnostic the
    //  test prints: a matrix with a zero diagonal must take at least one).
    std::size_t twoByTwoPivots() const { return nTwo_; }

protected:
    //- x = (P^T L D L^T P)^{-1} b by the factors alone, no refinement.
    //  Virtual so that the test can stand in an INEXACT factorisation (a
    //  dropped tolerance, a stale factor) and show what refinement does.
    virtual sVector solveFactors_(const sVector& b) const;
    std::size_t order() const { return n_; }

private:
    //- Symmetric swap of indices a and b (both >= k) in the trailing
    //  matrix, and of the rows of the L columns already computed.
    void swapSym_(std::size_t k, std::size_t a, std::size_t b);

    std::size_t           n_ = 0;
    bool                  ok_ = false;
    std::size_t           nTwo_ = 0;
    std::vector<sVector>  K_;       //- the matrix as given, symmetrised (for the residual)
    std::vector<sVector>  W_;       //- working copy: the trailing matrix and L below it
    std::vector<std::size_t> perm_; //- perm_[i] = original index now at position i
    std::vector<std::size_t> blk_;  //- 1: 1x1 pivot at i, 2: 2x2 pivot starts at i, 0: second of a 2x2
    sVector               d_;       //- D's diagonal
    sVector               e_;       //- D's sub-diagonal, at the first row of a 2x2 block
    sVector               colScale_;//- largest |K_ij| of each ORIGINAL column
    scalar                normK_ = 0.0;  //- |K|_inf
};

} // namespace Choupo::solver
