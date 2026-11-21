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
    SparseLU.H

Description
    A SPARSE LU factorisation on a FIXED pattern, written for the stiff
    integrator's matrix W = I - h d J of a reaction mechanism.  In-house and
    short on purpose (zero external dependencies: no KLU, no SuiteSparse), so
    a student can read every line.  Theory Guide, sec:sparse-lu.

    WHY.  A mechanism of N species has a Jacobian with N^2 entries, of which
    a few per row are not zero: species i is coupled to species k only when
    a reaction that changes i reads k.  A dense LU costs N^3/3 operations
    whatever the pattern -- 3e8 for N = 1000, every step.  On the pattern the
    cost is the operations on the entries that are, or become, non-zero.

    THREE STAGES, the first two done ONCE per pattern:

      1. ORDERING.  Eliminating a row whose column touches d others creates
         up to d^2 new entries ("fill").  MINIMUM DEGREE chooses, at each
         step, the row of fewest neighbours in the elimination graph of the
         symmetrised pattern (A + A^T), and so keeps the fill small.  This is
         the classical minimum-degree rule (Tinney & Walker 1967; George &
         Liu 1989, ch. 5) on the EXPLICIT elimination graph, not the
         quotient graph of the approximate-minimum-degree code (Amestoy,
         Davis & Duff 1996): exact degrees, simpler, and fast enough for the
         sizes here because it runs once.  As AMD does, a DENSE node (degree
         above max(16, 10 sqrt n): the temperature, a bath gas every
         third-body reaction reads) is taken out of the graph first and
         ordered LAST, where it costs one dense trailing block instead of
         making every elimination step dense.  Ties: the lower index.
      2. SYMBOLIC factorisation.  The pattern of L + U for that ordering,
         assuming the diagonal pivots (no row exchanges): the elimination
         graph again, recording each column's fill.  Stored by columns.
      3. NUMERIC factorisation, every step, on that fixed pattern: the
         rows EQUILIBRATED first (each divided by its largest entry, as
         KLU does: a temperature row in K/s next to mole-number rows would
         otherwise dwarf every pivot of its column), then
         LEFT-LOOKING (Doolittle) column by column into a dense work vector,
         no index search.  The pivots stay on the diagonal (the fixed
         pattern allows no row exchange); factor() returns false only on a
         BREAKDOWN, a pivot below tau = 1e-12 of the largest entry under it
         (or zero, or not finite).  Whether the factor is GOOD is then
         measured, not guessed: the integrator solves W_s x = 1 with it and
         accepts it when the backward error |1 - W_s x| / (|W_s| |x| + 1) is
         at most 1e-12 (Rosenbrock23.cpp); otherwise that one matrix is
         factored densely, with partial pivoting, and counted.  (A KLU-style
         threshold test, tau = 1e-3, refused 9549 of the 12749 factors of a
         synthetic 50-species mechanism; on the backward-error test all
         12749 diagonal-pivot factors were accepted, the worst solving its
         matrix to 1.4e-19 -- measured 2026-11-21.)
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "solver/ODE/ODEIntegrator.H"

#include <cstddef>
#include <memory>
#include <vector>

namespace Choupo::solver
{

class SparseLU
{
public:
    //- Stages 1 and 2 for the pattern `p` (n x n, CSR, every diagonal present).
    void analyse(const SparsePattern& p);
    //- The same, keeping the pattern alive: analysedFor() then names an object
    //  that cannot be freed and replaced at the same address behind the caller.
    void analyse(std::shared_ptr<const SparsePattern> p);
    //- The pattern analysed last (nullptr: none) -- a caller re-analyses only
    //  when its pattern object changes.
    const SparsePattern* analysedFor() const { return analysedFor_; }

    //- Stage 3: factor the matrix whose entries are `values` in the pattern's
    //  order.  false: a pivot failed the threshold test (nothing usable).
    bool factor(const sVector& values, scalar pivotTol = 1.0e-12);
    //- x = A^{-1} b, after a successful factor().
    sVector solve(const sVector& b) const;

    //- The size of the factor, for the glass box: nnz(L) + nnz(U) + n, and the
    //  pattern's own nnz -- the ratio is the fill.
    std::size_t nnzFactor() const;
    std::size_t nnzPattern() const;
    //- Multiply-adds of one numeric factorisation (sum over columns of the
    //  updates), the dense LU's being n^3/3.
    double flopsFactor() const;
    std::size_t denseNodes() const;

private:
    struct Symbolic
    {
        std::size_t n = 0;
        std::vector<std::size_t> perm;    // perm[k]  = original index at position k
        std::vector<std::size_t> iperm;   // iperm[i] = position of original index i
        //  strict lower L, column k: rows Li[Lp[k] .. Lp[k+1]) (> k, ascending)
        std::vector<std::size_t> Lp, Li;
        //  strict upper U, column k: rows Ui[Up[k] .. Up[k+1]) (< k, ascending)
        std::vector<std::size_t> Up, Ui;
        //  the permuted matrix by columns: column k holds row Ai[t] whose value
        //  is values[Amap[t]] of the caller's CSR order
        std::vector<std::size_t> Ap, Ai, Amap;
        std::size_t nnzPattern = 0, dense = 0;
        double flops = 0.0;
    };
    std::shared_ptr<const Symbolic> sym_;
    const SparsePattern* analysedFor_ = nullptr;
    std::shared_ptr<const SparsePattern> held_;
    sVector Lx_, Ux_, D_;
    sVector rowScale_;                  // 1 / max |a_ij| of each (permuted) row
    mutable sVector work_;
};

} // namespace Choupo::solver
