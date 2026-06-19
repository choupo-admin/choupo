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
    Hand-rolled active-set solver for the strictly-convex equality-and-
    inequality-constrained quadratic program

        min_d   0.5 d^T B d + g^T d
        s.t.    A_eq   d + b_eq   =  0          (always active)
                A_ineq d + b_ineq <= 0          (active set chosen here)

    with B symmetric positive definite (the caller guarantees this via the
    damped-BFGS Hessian approximation -- see the SQP driver).  This is the
    inner QP every SQP iteration must solve.

    Primary reference (public-domain method, NOT a port of any code):
      Nocedal & Wright, Numerical Optimization, 2nd ed. (2006),
        Algorithm 16.3 (active-set method for convex QP), Sec. 16.5.
      The KKT system [B  A^T; A  0][d; lambda] = [-g; b] is the
        equality-constrained QP optimality condition (N&W eq. 16.4).

    Method (glass-box, every step inspectable):
      Maintain a WORKING SET W of constraints treated as equalities
      (all equality rows plus the currently-active inequality rows).
      Each iteration:
        1. Solve the equality-constrained KKT system over W via gaussSolve.
        2. If the resulting full step d keeps every INACTIVE inequality
           feasible, accept it and examine the Lagrange multipliers of the
           active INEQUALITY rows:
             - all lambda >= 0  ->  KKT satisfied -> OPTIMAL, return.
             - else  ->  DROP the inequality with the most-negative
                         multiplier from W (it wants to move off its bound).
        3. Else take the maximal feasible fraction alpha in [0,1) toward
           the nearest BLOCKING inactive inequality, step, and ADD that
           constraint to W.
      Strict convexity of B guarantees a strict descent each working-set
      change, hence finite termination (N&W, Sec. 16.5).

    Box bounds lo <= d <= hi (on the QP step itself) are folded in as
    ordinary inequality rows so the same machinery handles them.

    Honesty:
      * a max-iteration cap that ABORTS LOUDLY ("active-set did not
        settle") rather than spinning forever;
      * gaussSolve's singular-matrix throw is re-thrown as an honest
        "active constraints linearly dependent (LICQ failure)" diagnostic.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo::solver {

// Result of one convex-QP solve.
struct QPResult
{
    sVector d;                  // optimal step
    sVector lambdaEq;           // multipliers of the equality rows (size = #eq)
    sVector lambdaIneq;         // multipliers of the inequality rows
                                //   (size = #ineq; zero for inactive rows)
    std::vector<bool> active;   // active flag per inequality row at the optimum
    int     iterations = 0;     // working-set changes performed
    bool    converged  = false; // true if KKT met within the cap
    std::string reason;         // human-readable termination note
};

// Convex-QP data.  Rows of A are stored as dense vectors of length n.
//   minimise 0.5 d^T B d + g^T d
//   s.t.  Aeq[k] . d + beq[k] == 0
//         Aineq[k] . d + bineq[k] <= 0
// `B` must be symmetric positive definite.
struct QPProblem
{
    std::vector<sVector> B;        // n x n SPD
    sVector              g;        // n

    std::vector<sVector> Aeq;      // (#eq) x n   (may be empty)
    sVector              beq;      // #eq

    std::vector<sVector> Aineq;    // (#ineq) x n (may be empty)
    sVector              bineq;    // #ineq
};

// Solve the convex QP with an active-set method.
//   warmStart : optional initial guess of the inequality working set
//               (size #ineq, true == start active); empty -> all inactive.
//   maxIter   : working-set-change cap (default generous; loud abort if hit).
QPResult activeSetQP(const QPProblem&         qp,
                     const std::vector<bool>& warmStart = {},
                     int                      maxIter   = 200);

// Glass-box self-check: solve a hand-worked QP whose active set, primal
// solution and Lagrange multipliers are known by hand, and assert the
// solver reproduces them to 1e-9.  Returns the max abs error found.
// Throws std::runtime_error on any mismatch (merge-blocking gate).
scalar verifyActiveSetQP(int verbosity = 0);

} // namespace Choupo::solver
