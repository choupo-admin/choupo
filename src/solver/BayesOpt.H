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
    Bayesian optimisation for EXPENSIVE simulations (C499), opt-in: a
    Gaussian-process surrogate of the objective and one of each inequality
    constraint, a next point chosen by expected improvement times the
    probability of feasibility, the budget counted in SIMULATIONS.

        min_x   f(x)
        s.t.    g_k(x) <= 0      (inequalities, each a black box)
                lo <= x <= hi    (box bounds; a variable may be integer)

    It has NO equality constraints (the caller must refuse them) and NO
    multipliers, so it prints no shadow prices and no KKT certificate: it
    says so, and recommends finishing with `method sqp` from its best point.

    Written from the published method descriptions only (nothing is a
    port of any code).  The formulas are those of:
      Jones, Schonlau & Welch (1998), "Efficient global optimization of
        expensive black-box functions", J. Global Optim. 13:455-492
        (expected improvement; its size as the stopping rule).
      Rasmussen & Williams (2006), "Gaussian Processes for Machine
        Learning", MIT Press, ch. 2 and 5: Algorithm 2.1 (predictive mean
        and variance through a Cholesky factor; eqs. 2.25-2.26), the
        squared-exponential kernel with one length scale per variable
        (eq. 5.1) and the log marginal likelihood (eq. 5.8).
      Constraints: the acquisition is the expected improvement multiplied
        by the probability that every constraint GP is feasible (Schonlau,
        Welch & Jones 1998, "Global versus local search in constrained
        optimization of computer models", in New Developments and
        Applications in Experimental Design, IMS Lecture Notes-Monograph
        Series 34:11-25; Gardner, Kusner, Xu, Weinberger & Cunningham 2014,
        "Bayesian optimization with inequality constraints", ICML, PMLR
        32(2):937-945).  While NO feasible point is known the acquisition
        is the probability of feasibility alone (Choupo's choice).
    READ (the publishers' PDFs, 2026-11-24/25): Jones et al. 1998, eq. 14
    (E[I] = E max(fmin - Y, 0)) and eq. 15 (the closed form used here,
    with Y ~ Normal(yhat, s^2)) and their stopping rule (expected
    improvement below 1 % of the best value; here the fraction is of the
    observed range, because a duty or a recovery may sit near zero);
    Rasmussen & Williams chapters 2 and 5: Algorithm 2.1, eqs. 2.25, 2.26,
    2.30 (the equation numbers above are those of the text), eq. 5.1 with
    distance measure M2 of eq. 5.2, and the log marginal likelihood eq. 5.8;
    Gardner et al. 2014 sections 3.1-3.2 (the expected improvement over the
    best FEASIBLE point times the probability of feasibility, a product of
    univariate Gaussian distribution functions for independent
    constraints).  NOT READ: Schonlau et al. 1998 (cited from Gardner et
    al.).  The rule "probability of feasibility alone while no feasible
    point is known" is Choupo's choice, not the paper's.  What is not read
    is held by the self-check (published optima), not by a citation.

    Choices that the papers leave open, all printed by the run:
      * inputs scaled to [0,1]^n by the box; outputs standardised;
      * kernel  k = sf2 exp(-1/2 sum_i ((x_i-x'_i)/l_i)^2), plus a nugget
        sn2 on the diagonal (bounded below by 1e-8: simulations carry
        solver noise); a JITTER is added to the diagonal only when the
        Cholesky factor fails, escalating by 100 from 1e-10, and is printed;
      * hyperparameters by maximum marginal likelihood (R&W eq. 5.8) over
        log-bounds, by a coordinate pattern search from the previous optimum
        and from low-discrepancy starts; starts, evaluations and the
        optimum are printed at every fit;
      * the start design: the declared start point (when given) plus a
        Halton sequence (bases 2,3,5,...) rotated by a seeded random shift
        (Cranley-Patterson); nInit points in all;
      * the acquisition is maximised over a seeded random candidate cloud
        refined by pattern search; an integer variable is rounded BEFORE the
        acquisition is read, and announced;
      * a FAILED evaluation (the simulation throws, does not converge, or
        its closure check fails) is recorded as FAILED and enters NO GP as a
        number.  It is treated as infeasible by a separate, printed factor:
        the acquisition is multiplied by 1 - exp(-1/2 d^2/L^2), d the scaled
        distance to the nearest failed point, L = 0.10;
      * stops: the budget, or the acquisition below eiTol times the range of
        the observed objective, or no new point left to try.

    The run reports, point by point, the prediction (mean and 95 % band)
    made BEFORE the simulation and the outcome after it; the coverage of the
    band is the check that the surrogate was honest.

    verifyBayesOpt() is the self-check to run before every use (as
    verifySQP is): Branin and a constrained 2-D problem with published
    optima, within a stated tolerance and budget; it throws when it fails.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <iosfwd>
#include <string>
#include <vector>

namespace Choupo::solver {

struct BayesResponse
{
    scalar  f = 0.0;       // objective (minimised; negate to maximise)
    sVector g;             // inequality values, feasible when <= 0
    bool    ok = true;     // false: the simulation failed at x (see above)
    std::string failCause; // printed when !ok
};

using BayesEvaluator = std::function<BayesResponse(const sVector& x)>;

struct BayesOptions
{
    int      budget      = 40;      // simulations, start design included
    int      nInit       = 0;       // 0 -> 2n+2
    unsigned seed        = 499;
    scalar   eiTol       = 1.0e-4;  // stop below eiTol * observed range; 0 = off
    scalar   feasTol     = 1.0e-8;  // g <= feasTol counts as feasible
    sVector  x0;                    // optional first design point (physical)
    std::vector<bool> isInt;        // per variable (empty: all continuous)
    int      verbosity   = 1;       // 0 silent
    std::ostream* out    = nullptr; // default std::cout
};

struct BayesPoint
{
    int     index = 0;           // 1-based simulation number
    sVector x;                   // physical, integers already rounded
    scalar  f = 0.0;
    sVector g;
    bool    ok = true;
    bool    feasible = false;
    bool    design = false;      // part of the start design (no prediction)
    scalar  predMean = 0.0;      // objective prediction made before the run
    scalar  predSd = 0.0;
    scalar  ei = 0.0;
    scalar  pFeas = 1.0;
    scalar  bestAfter = 0.0;     // best feasible f after this point (NaN: none)
    bool    covered = false;     // |f - predMean| <= 1.96 predSd
};

struct BayesResult
{
    sVector x;                   // best feasible point (or least violating)
    scalar  f = 0.0;
    bool    feasible = false;    // a feasible point was found
    int     evaluations = 0;     // simulations run (failed ones included)
    int     failed = 0;
    int     predicted = 0;       // points with a prediction
    int     covered = 0;         // of those, inside the 95 % band
    scalar  maxJitter = 0.0;
    std::string reason;
    std::vector<BayesPoint> history;
};

BayesResult bayesOpt(const BayesEvaluator& eval, const sVector& lo,
                     const sVector& hi, std::size_t nIneq,
                     const BayesOptions& opts);

//  Self-check; returns the worst |f - f*| of the problems; throws on failure.
scalar verifyBayesOpt(int verbosity = 0);

} // namespace Choupo::solver
