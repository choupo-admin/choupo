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
Namespace
    Choupo::solver

Description
    Multivariate Newton-Raphson root-finder:

        F(x) = 0,           F, x  ∈  R^n

    Components:
        - finite-difference Jacobian (central differences)
        - Gauss elimination with partial pivoting (dense linear solve)
        - backtracking line search (Armijo) for damping

    Pedagogical implementation — every step is visible, no external
    linear-algebra dependency.  Scales fine up to a few hundred
    unknowns; for sparse systems (full flowsheet EO), v1.0 will add a
    sparse solver.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <limits>
#include <string>

namespace Choupo::solver {

struct NDTrace
{
    int       iteration;
    sVector   x;
    sVector   F;
    scalar    normF;
    scalar    alpha;       // backtracking factor used at this step
};

struct NDResult
{
    sVector   x;
    sVector   F;
    scalar    residual;    // ||F||_2 at convergence
    int       iterations;
    bool      converged;

    //- Block-tridiagonal verification (NaN unless opts.blockTri declared):
    //  the max |J[i][j]| OUTSIDE the three block bands, measured on the
    //  FIRST iteration's dense Jacobian.  The caller announces it -- the
    //  declared structure is a claim, and a claim is measured, not trusted.
    scalar    offBandMax = std::numeric_limits<scalar>::quiet_NaN();
    //- Residual evaluations spent building Jacobians (the number the
    //  coloring exists to shrink; dense: n per Jacobian).
    long      jacobianEvals = 0;
};

//- A DECLARED block-tridiagonal structure: unknowns grouped in nBlocks
//  consecutive blocks of blockSize, with block i coupling only to i-1, i
//  and i+1 (the MESH column: one block per stage).  Declaring it turns on
//  (a) the Curtis-Powell-Reid COLORED finite-difference Jacobian -- three
//  colors, so ~3*blockSize residual evaluations per Jacobian INDEPENDENT
//  of nBlocks, against nBlocks*blockSize dense -- and (b) a block-Thomas
//  linear solve, O(nBlocks*blockSize^3) against O((nBlocks*blockSize)^3).
//
//  THE DECLARATION IS VERIFIED, not trusted: the first iteration builds
//  the dense Jacobian too, measures the largest off-band entry, and
//  REFUSES by name when the structure is materially false -- a wrong
//  declaration must never become a silently wrong answer.  The measured
//  off-band maximum rides out in NDResult for the caller to announce.
struct BlockTri
{
    std::size_t nBlocks   = 0;
    std::size_t blockSize = 0;
    bool declared() const { return nBlocks > 1 && blockSize > 0; }
};

struct NDOptions
{
    scalar    tolerance        = 1.0e-8;
    int       maxIter          = 50;
    scalar    fdStep           = 1.0e-7;
    bool      backtracking     = true;
    scalar    minAlpha         = 1.0e-4;
    // Parallelise the finite-difference Jacobian across cores.  Opt-in: set ONLY
    // when the residual F is thread-safe (a pure function, no shared mutable
    // state).  The recycle / flowsheet Newton mutates unit state -> leave false.
    bool      parallel         = false;
    BlockTri  blockTri;        // declared structure; see above
    std::function<void(const NDTrace&)> onIter;
};

NDResult newtonND(const std::function<sVector(const sVector&)>& F,
    sVector                                       x0,
    const NDOptions&                              opts);

// Stand-alone Gauss elimination with partial pivoting for dense A · x = b.
// A is passed by value (overwritten internally).
sVector gaussSolve(std::vector<sVector> A, sVector b);

} // namespace Choupo::solver
