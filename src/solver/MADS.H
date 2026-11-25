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
    MADS -- Mesh Adaptive Direct Search -- with the progressive barrier, for

        minimise   f(x)
        subject to c_j(x) <= 0,   j = 1..m      (relaxable constraints)
                   lo <= x <= hi                (box; integers allowed)

    A derivative-free method for the problems the line-search SQP cannot
    take: a non-smooth objective, a response that switches regime, an
    integer variable, a constraint that is only a table lookup.  Third
    method of the optimisation driver, beside Nelder-Mead (unconstrained)
    and SQP (smooth, constrained, shadow prices).  Chosen with
    `method mads;`, never silently.

    WHAT WAS READ (and what was not -- C494, 2026-11-24):
      READ  Audet, Le Digabel, Tribes et al., "The mesh adaptive direct
            search algorithm for blackbox optimization" (NOMAD 4 paper,
            arXiv:2104.11627), Algorithm 2.1: delta^k = min(Delta^k,
            (Delta^k)^2); success Delta <- Delta/tau, failure Delta <-
            tau Delta, tau rational in (0,1); stop when Delta < eps.
      READ  Audet et al., arXiv:2012.10173 (Algorithm 1 and the text above
            it, which restates Audet & Dennis 2009): the violation function
            h(x) = sum_j max(c_j(x),0)^2, h = +inf where x is not in X; the
            dominance relation; the feasible incumbent x_feas and the
            infeasible incumbent x_inf (the undominated infeasible point of
            best f with h <= h_max); the three iteration types and the
            threshold update h_max^{k+1} = h_I^k (dominating),
            max{h(v): h(v) < h_I^k, v in V^{k+1}} (improving),
            h_I^k (unsuccessful); Delta^{k+1} = Delta/tau, Delta, tau Delta
            respectively; h_max^0 = +inf.
      READ  Le Digabel, MTH8418 lecture notes "Constraints" (GERAD): the
            primary and secondary poll centres (primary = the feasible
            incumbent when f(feas) - rho <= f(infeas)), the "reduced poll"
            of the secondary centre with two directions.
      READ  Audet et al., G-2019-65 (GERAD): Definitions 1 and 2 (h and
            dominance), the sets F^k, U^k, I^k.
      READ  Audet et al., arXiv:2507.23054 (Sect. 4.2): OrthoMADS polls on
            the frame boundary with directions from a Householder
            transformation, D = [I_n -I_n] (2n directions).
      NOT READ  Audet & Dennis, SIAM J. Optim. 17(1):188-217 (2006) (MADS),
            Audet & Dennis, SIAM J. Optim. 20(1):445-472 (2009)
            (progressive barrier), Abramson, Audet, Dennis & Le Digabel,
            SIAM J. Optim. 20(2):948-966 (2009) (OrthoMADS): paywalled.  The
            rules above are as RESTATED by the papers listed under READ.
            Where this file differs from a rule of the originals it is
            said below.

    THE VARIANT, as implemented:
      * Poll: 2n directions, "OrthoMADS-style": at iteration t the vector
        u_j = 2 H_j(t) - 1, with H_j the Halton radical inverse in the j-th
        prime, gives the Householder matrix Q = |u|^2 I - 2 u u^T (columns
        mutually orthogonal); each column is scaled to infinity-norm Delta
        (in normalised coordinates), rounded onto the mesh, and the poll set
        is +/- the columns.  The Halton index is (seed + iteration): the
        seed (default 0) is printed, so a run is reproducible.  This is
        the construction as described in the READ papers; the exact Halton
        indexing of the original OrthoMADS (not read) is NOT claimed.  If
        the rounded columns are singular (coarse frames) the poll falls
        back to +/- the coordinate directions, which span positively.
      * Normalised coordinates: every variable is measured in its own range
        (hi - lo), so Delta and delta are fractions of a range.  Delta^0 =
        0.1 (own choice), tau = 1/2 (own choice), Delta <= 1 (own cap).
      * Poll size Delta and mesh size delta = min(Delta, Delta^2) as in
        Algorithm 2.1.
      * Search step: EMPTY (no search points; stated, not implied).
      * Opportunistic poll: the first dominating trial ends the poll.
      * Secondary centre polled with +/- the first direction only (the
        reduced poll); rho = 0 (own choice; the notes call it a trigger).
      * Bounds by PROJECTION onto the box (a trial point is clipped to
        [lo, hi]), not by the extreme barrier: a clipped point can leave
        the mesh at the bound.  The convergence theory of the originals is
        for the barrier; this is the practical choice, announced.
      * Integer variables: native.  Mesh and frame floors of 1 for that
        variable (granularity 1, as NOMAD's granular variables; Audet, Le
        Digabel & Tribes, "The mesh adaptive direct search algorithm for
        granular and discrete variables", SIAM J. Optim. 29(2) 1164-1189,
        2019 -- cited from the NOMAD 4 paper's reference list, not read),
        displacements whole numbers, the incumbent integer => every trial
        integer.
      * A failed evaluation (the simulator threw, did not converge, a
        non-finite number) is h = +inf: outside X, rejected, counted.
      * A cache of every evaluated point: a repeated point is NOT
        re-simulated and not counted.

    Termination: Delta < epsStop (poll size, a fraction of the range), the
    evaluation budget, the iteration cap, or -- when every variable is
    integer -- an unsuccessful iteration with the mesh at its floor.

    Self-check (verifyMADS): HS35 (smooth, constrained) and CB3 (non-smooth,
    max of three), both against their published optima, every run.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <string>
#include <vector>

namespace Choupo::solver {

//  One evaluation: objective and the constraint values c_j (<= 0 feasible).
struct MADSResponse
{
    scalar  f  = 0.0;
    sVector c;                  // size m (may be empty)
    bool    ok = true;          // false: the model failed here (h = +inf)
};
using MADSEvaluator = std::function<MADSResponse(const sVector&)>;

struct MADSTrace
{
    int         iteration = 0;
    scalar      pollSize  = 0;     // Delta (fraction of the range)
    scalar      meshSize  = 0;     // delta = min(Delta, Delta^2)
    int         nPoll     = 0;     // trial points EVALUATED this iteration
    int         nCached   = 0;     // trial points found in the cache
    std::string outcome;           // dominating | improving | unsuccessful
    scalar      fFeasible = 0;     // +inf when no feasible point yet
    scalar      fInfeas   = 0;     // f of the infeasible incumbent (+inf: none)
    scalar      hInfeas   = 0;     // its h
    scalar      hMax      = 0;     // the barrier threshold
    sVector     x;                 // best point (feasible if any)
    scalar      f         = 0;     // its f
    scalar      h         = 0;     // its h
    int         evaluations = 0;   // running total
};

struct MADSOptions
{
    scalar  pollSize0    = 0.1;     // Delta^0
    scalar  tau          = 0.5;     // rational in (0,1)
    scalar  epsStop      = 1.0e-4;  // stop when Delta < epsStop
    int     maxIter      = 500;
    int     maxEval      = 2000;
    int     seed         = 0;       // Halton index offset
    std::vector<bool> isInt;        // empty = all continuous
    std::function<void(const MADSTrace&)> onIter;
};

struct MADSResult
{
    sVector x;
    scalar  f           = 0;
    scalar  h           = 0;        // 0 when feasible
    sVector c;                      // constraint values at x
    bool    feasible    = false;
    bool    found       = false;    // some valid evaluation exists
    int     iterations  = 0;
    int     evaluations = 0;        // simulator calls (unique points)
    int     cacheHits   = 0;
    int     failures    = 0;        // evaluations with ok = false
    scalar  pollSize    = 0;        // final Delta
    bool    converged   = false;    // stopped on the poll-size tolerance
    std::string reason;
};

MADSResult mads(const MADSEvaluator& eval,
                const sVector& x0,
                const sVector& lo,
                const sVector& hi,
                const MADSOptions& opts);

//  Glass-box self-check, run before every MADS run: HS35 and CB3 against
//  their published optima.  Returns the worst |f - f*|; throws
//  std::runtime_error on a miss (a merge-blocking gate, as verifySQP).
scalar verifyMADS(int verbosity = 0);

} // namespace Choupo::solver
