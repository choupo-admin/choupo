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
    Hand-rolled line-search Sequential Quadratic Programming for the
    nonlinear program

        min_x   f(x)
        s.t.    h_j(x) =  0      (equalities)
                g_k(x) <= 0      (inequalities)
                lo <= x <= hi    (box bounds)

    Primary reference (public-domain method, NOT a port of any code):
      Nocedal & Wright, Numerical Optimization, 2nd ed. (2006), Ch. 18
        (line-search SQP, damped-BFGS Hessian, L1 merit function;
         eq. 18.29 for the merit directional derivative).
      Powell (1978), "A fast algorithm for nonlinearly constrained
        optimization calculations", Lecture Notes in Mathematics 630
        (the damped-BFGS modification rule).

    Each iteration:
      1. Linearise f and the constraints at x (FD gradients).
      2. Solve the convex QP (activeSetQP) for the step d and the QP
         multipliers lambda.
      3. damped-BFGS update of the LAGRANGIAN Hessian B (kept SPD).
      4. L1 merit + Armijo backtracking line search for the step length.
      5. KKT termination test (stationarity, feasibility, complementarity).

    Glass-box: every iteration announces the BFGS theta, the merit mu, the
    active set, the Lagrange multipliers (shadow prices), and the Armijo
    alpha.  At the optimum it prints the 5-line KKT certificate.

    Everything is finite-difference (no analytic sensitivities) -- the
    objective and the FULL constraint Jacobian come from ONE perturbation
    of each variable, so a forward-difference iteration costs n+1
    evaluations of the response callback (central: 2n).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <string>
#include <vector>

namespace Choupo::solver {

// A single evaluation of all responses at a point x.
//   f      : objective value
//   h      : equality residuals  (h_j(x), to be driven to 0)
//   g      : inequality values   (g_k(x), feasible when <= 0)
struct SQPResponse
{
    scalar  f = 0.0;
    sVector h;
    sVector g;
    bool    ok = true;     // false if the underlying model failed at x
};

using SQPEvaluator = std::function<SQPResponse(const sVector& x)>;

// Per-iteration trace handed to the optional callback.
struct SQPTrace
{
    int     iteration   = 0;
    sVector x;
    scalar  f           = 0.0;
    sVector h;                 // equality residuals
    sVector g;                 // inequality values
    std::vector<bool> gActive; // which inequalities are active at the QP soln
    sVector lambdaEq;          // equality multipliers (shadow prices)
    sVector lambdaIneq;        // inequality multipliers (shadow prices)
    scalar  kktStat     = 0.0; // ||grad L||inf
    scalar  kktFeasEq   = 0.0; // max|h|
    scalar  kktFeasIneq = 0.0; // max g+
    scalar  kktCompl    = 0.0; // max|lambda_k g_k|
    scalar  theta       = 1.0; // damped-BFGS damping factor this step
    bool    bfgsSkipped = false;
    scalar  mu          = 0.0; // L1 merit penalty
    scalar  alpha       = 1.0; // Armijo step length accepted
    bool    watchdog    = false; // full step forced this iteration
    std::string note;
};

struct SQPResult
{
    sVector x;
    scalar  f = 0.0;
    sVector lambdaEq;
    sVector lambdaIneq;
    int     iterations  = 0;
    int     evaluations = 0;     // response-callback calls
    bool    converged   = false;
    bool    feasible    = false; // start (and finish) feasible enough to trust
    std::string reason;

    // The 5 KKT residuals at the returned point (the certificate).
    scalar  kktStat     = 0.0;
    scalar  kktFeasEq   = 0.0;
    scalar  kktFeasIneq = 0.0;
    scalar  kktCompl    = 0.0;
    scalar  kktDualFeas = 0.0;   // max(0, -min lambda) over active ineqs
};

struct SQPOptions
{
    int     maxIter      = 100;

    // KKT tolerances (N&W-style).
    scalar  tolStat      = 1.0e-5;   // ||grad L||inf
    scalar  tolFeasEq    = 1.0e-6;   // max|h|
    scalar  tolFeasIneq  = 1.0e-6;   // max g+
    scalar  tolCompl     = 1.0e-6;   // max|lambda g|

    // Finite-difference gradients.
    scalar  fdStep       = 1.0e-5;   // relative step
    bool    central      = false;    // forward (n+1) default; central (2n) opt-in
    sVector typX;                    // typical magnitudes (for the FD step);
                                     //   empty -> uses max(|xj|, 1).

    // Merit / line search.
    scalar  armijoC1     = 1.0e-4;   // sufficient-decrease constant
    scalar  alphaMin     = 1.0e-8;   // smallest backtracking step
    scalar  muSafety     = 1.10;     // mu >= muSafety * ||lambda||inf

    // The ONLY Maratos mitigation in v1: accept the full step every K iters.
    int     watchdogEvery = 5;

    // Per-iteration callback (logging / CSV).
    std::function<void(const SQPTrace&)> onIter;
};

// Solve the NLP.  x0 is the (bound-clipped) start; lo/hi are the box bounds
// (use +/-inf where unbounded).  nEq / nIneq tell the solver how many
// equality / inequality responses the evaluator returns.
SQPResult sqp(const SQPEvaluator& eval,
              const sVector&      x0,
              const sVector&      lo,
              const sVector&      hi,
              std::size_t         nEq,
              std::size_t         nIneq,
              const SQPOptions&   opts);

// Glass-box self-checks: solve the Hock-Schittkowski problems HS35, HS21,
// HS71 (analytic objectives/constraints, gradients via FD-of-analytic) and
// assert convergence to the published optima within 1e-4.  Returns the
// worst optimum error seen; throws std::runtime_error on any failure
// (merge-blocking gate).  These isolate the SQP algorithm from simulator
// noise.
scalar verifySQP(int verbosity = 0);

} // namespace Choupo::solver
