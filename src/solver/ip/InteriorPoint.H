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
    InteriorPoint.H

Description
    Choupo-IP, slice A2: the primal-dual interior-point filter line-search
    algorithm of Wachter & Biegler, "On the implementation of an interior-point
    filter line-search algorithm for large-scale nonlinear programming",
    Math. Prog. 106 (2006) 25-57 -- Algorithm A, read as the preprint (design
    record docs/design/interior-point.md sec. 1, 2 and 2.14; Theory Guide
    sec:ip-barrier ... sec:ip-termination).

        min f(x)   s.t.   cL <= c(x) <= cU,   xL <= x <= xU

    Each ingredient has its own file, named as in the pseudocode of sec. 2.14:

      NLPProblem.H        the problem, and the equality / fixed-variable /
                          scaling reformulations
      InertiaCorrection   Algorithm IC (the step must come from a KKT matrix
                          with inertia (n, m, 0))
      BarrierUpdate       the monotone rule for mu
      Globalization       the filter
      LineSearch          backtracking over the filter's tests
      Restoration         the minimum-violation problem, and the verdict
                          "locally infeasible"
      IPTrace.H           the per-iteration record

    WHAT THIS SLICE DOES NOT HAVE (slice A3 and later): the second-order
    correction, the KKT-error-reduction restoration, the adaptive barrier
    rule, the merit-function globalization, and any selection by name.  There
    is no factory: nothing selects an optimizer by name before stage B (a
    case's `model interiorPoint`), and CLAUDE.md section 5 asks for
    registerType / New / registerBuiltins only with the first selector.

    Every stop is named: converged, locally infeasible, iteration limit,
    restoration failed, step too small, evaluation failed.  A run that cannot
    find a feasible point is NEVER reported as converged or as an iteration
    limit (review R3).
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/IPParameters.H"
#include "solver/ip/IPTrace.H"
#include "solver/ip/NLPProblem.H"

#include <cstddef>
#include <functional>
#include <ostream>
#include <string>
#include <vector>

namespace Choupo::solver
{

enum class IPStatus
{
    Converged,           //- E_0 <= tol (scaled) and the unscaled infeasibility <= tol
    LocallyInfeasible,   //- the restoration problem converged with infeasibility above tol
    IterationLimit,
    RestorationFailed,   //- no acceptable step and the restoration phase could not help
    StepTooSmall,        //- steps below 10 eps_mach twice at the smallest mu (L1 sec. 3.9)
    EvaluationFailed,    //- the starting point could not be evaluated
    EarlyExit            //- the caller's exit test fired (used by the restoration phase)
};

const char* statusName(IPStatus s);

struct IPOptions
{
    IPParameters par;

    bool scaling          = true;    //- scale f and c down at the start (L1 sec. 3.8)
    bool relaxBounds      = true;    //- relax the bounds by par.boundRelax (L1 (35))
    bool allowRestoration = true;    //- false inside the restoration problem itself
    bool pushStartInside  = true;    //- push x0 inside its bounds by kappa1, kappa2 (L1 (35)); false for the restoration start

    scalar muStart = -1.0;           //- < 0: par.mu0

    std::ostream* log = nullptr;     //- the live trace (header, one line per iteration, events)

    //  Internal, set by InteriorPoint::solve and by the restoration phase:
    std::function<bool(const sVector&)> earlyExit;   //- tested after each accepted iteration
    const sVector* rowScale = nullptr;               //- c_unscaled_j = c_j / rowScale[j]
};

struct IPResult
{
    IPStatus    status = IPStatus::IterationLimit;
    std::string message;

    //  In the variables and rows of the problem the caller gave.
    sVector x;                       //- clipped to the original bounds
    sVector lambda;                  //- row multipliers (sign: f + lambda^T c)
    sVector zLower, zUpper;          //- bound multipliers (>= 0)
    scalar  objective = 0.0;
    scalar  constraintViolation = 0.0;   //- max over rows of the distance outside [cL, cU], at x
    scalar  kktError = 0.0;              //- E_0 of the last iterate, scaled problem

    std::size_t iterations = 0;
    std::size_t inertiaCorrections = 0;  //- iterations that needed dw > 0 or dc > 0
    std::size_t restorations = 0;
    std::size_t factorisations = 0;
    std::size_t evaluations = 0;         //- objective + constraint evaluations

    std::vector<std::string> infeasibleRows;   //- LocallyInfeasible: "name: residual", worst first
    IPTrace trace;

    bool converged() const { return status == IPStatus::Converged; }
};

class InteriorPoint
{
public:
    //- The whole pipeline: equality form with slacks, fixed variables removed,
    //  scaling, Algorithm A, and the answer mapped back to the caller's x.
    static IPResult solve(const NLPProblem& problem, const IPOptions& options = IPOptions());

    //- Algorithm A itself on a problem whose rows are all c(x) = 0 (what
    //  solve() calls after the reformulations, and what the restoration phase
    //  calls on its own problem).  Variables and multipliers are those of
    //  `problem`.
    static IPResult algorithmA(const NLPProblem& problem, const IPOptions& options);
};

} // namespace Choupo::solver
