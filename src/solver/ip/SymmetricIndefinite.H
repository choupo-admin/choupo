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
    SymmetricIndefinite.H

Description
    The abstract of the linear algebra the interior-point optimizer solves
    its Newton steps with (docs/design/interior-point.md sec. 3.2; Theory
    Guide sec:ldlt-inertia): a factorisation of a SYMMETRIC, possibly
    INDEFINITE matrix K that reports the INERTIA of K, and solves K x = b
    with an error it measures and prints.

    THE INERTIA is the triple (n_pos, n_neg, n_zero) of positive, negative
    and zero eigenvalues of K.  The primal-dual step of the optimizer solves
        [ W + Sigma   A ] [ dx ]     [ r_d ]
        [   A^T       0 ] [ dl ] = - [ r_c ]
    and gives a DESCENT direction exactly when the inertia of this matrix is
    (n, m, 0): n unknowns, m constraints (Wachter & Biegler 2006, Algorithm
    IC).  Any other inertia means the Hessian is not positive definite on
    the null space of A^T, and the caller adds a multiple of the identity
    and factors again.  A count that is wrong takes ascent directions or
    skips that correction, so the count is the product.

    THE ERROR.  Every solve returns, beside x, its NORMWISE BACKWARD ERROR
        eta = |b - K x|_inf / ( |K|_inf |x|_inf + |b|_inf )
    on the matrix as given (never a scaled copy).  Algorithm IC treats a
    factorisation whose eta exceeds kBackwardErrorLimit as WRONG and does
    not use its step -- the acceptance rule SparseLU already uses for its
    factors (SparseLU.H:76-78 states it; Rosenbrock23.cpp:787-795 applies it
    with eta = |1 - W x| / (|W| |x| + 1) and the limit 1e-12).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo::solver
{

//- Sylvester's law of inertia: the numbers of positive, negative and zero
//  eigenvalues of a symmetric matrix.  n_pos + n_neg + n_zero = n.
struct Inertia
{
    std::size_t positive = 0;
    std::size_t negative = 0;
    std::size_t zero     = 0;

    bool operator==(const Inertia& o) const
    {
        return positive == o.positive && negative == o.negative && zero == o.zero;
    }
    bool operator!=(const Inertia& o) const { return !(*this == o); }
};

//- What one solve measured.
struct SolveReport
{
    scalar      backwardErrorBefore = 0.0;  //- eta of the first solution, before refinement
    scalar      backwardError       = 0.0;  //- eta returned: after the refinement steps taken
    std::size_t refinementSteps     = 0;    //- 0, 1 or 2 (at most kMaxRefinementSteps)
};

//- An eta above this marks a factorisation as WRONG (the SparseLU rule,
//  Rosenbrock23.cpp:787).  About 4500 machine epsilons.
constexpr scalar kBackwardErrorLimit = 1.0e-12;

//- At most this many steps of iterative refinement per solve (review R4).
constexpr std::size_t kMaxRefinementSteps = 2;

class SymmetricIndefinite
{
public:
    virtual ~SymmetricIndefinite() = default;

    //- Name for the run's header ("denseLDLT").
    virtual std::string name() const = 0;

    //- Factor the symmetric matrix K (n x n, full storage, only the lower
    //  triangle is read).  Returns the inertia.  After a call, ok() says
    //  whether the factorisation can be used to solve: it is false on a
    //  BREAKDOWN (a pivot below the zero threshold with non-zero entries
    //  still to eliminate under it, or a 2x2 block that is singular), and
    //  then the inertia is NOT to be trusted.
    virtual Inertia factor(const std::vector<sVector>& K) = 0;

    //- True when the last factor() completed without breakdown.
    virtual bool ok() const = 0;

    //- Solve K x = b with at most kMaxRefinementSteps steps of iterative
    //  refinement on the unscaled K; the report carries eta before and
    //  after.  Requires ok().
    virtual sVector solve(const sVector& b, SolveReport& report) const = 0;

    //- The threshold a pivot is counted ZERO below, as a fraction of the
    //  scale of its column; printed by whoever reports the inertia.
    virtual scalar zeroThreshold() const = 0;
};

//  No factory yet: nothing selects a SymmetricIndefinite by NAME in this
//  slice (its one caller, Algorithm IC, is slice A2, and the second
//  implementation, BlockLDLT, is D1).  registerType / New / registerBuiltins
//  arrive with the first selector (CLAUDE.md section 5), called explicitly,
//  never from a static initialiser.

} // namespace Choupo::solver
