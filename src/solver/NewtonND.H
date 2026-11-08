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
        - backtracking line search for damping: by default a SIMPLE-
          DECREASE test (||F|| must fall) with halving; with
          `globalisation = Globalisation::armijo` a true Armijo test on
          0.5||F||^2 with quadratic/cubic backtracking and a Levenberg-
          Marquardt step when the search exhausts (NDOptions below)

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

struct BlockBands;   // BlockTridiagonal.H

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
    //- WHY the solve stopped when it stopped early (empty on convergence and
    //  on an ordinary maxIter exhaustion).  Before 2026-09-27 a failed linear
    //  solve and an exhausted line search both returned `converged = false`
    //  with the cause discarded -- the exception's own message included -- so
    //  a caller could report THAT the Newton failed and never WHY.  Every such
    //  stop is also raised on the AdvisoryLog by newtonND itself (DEV.md §5
    //  A3), because no caller printed it.
    std::string stopReason;
    //- With an ANALYTIC block Jacobian declared (BlockTri::jacobian) and the
    //  audit on: the largest departure of the analytic in-band entries from
    //  the first iteration's dense finite-difference Jacobian, each entry
    //  relative to the largest |J| of its row (NaN otherwise).  A central
    //  difference carries its own truncation and round-off error, so this
    //  is a number to ANNOUNCE (~1e-6 is agreement), not a refusal test.
    scalar    analyticMismatch = std::numeric_limits<scalar>::quiet_NaN();
    //- Steps taken although no backtracking trial reduced ||F|| (see
    //  NDOptions::maxStalledSteps).  0 on a monotone solve.  Always 0 under
    //  Globalisation::armijo, which never takes such a step.
    int       stalledSteps = 0;
    //- Globalisation::armijo only: Levenberg-Marquardt steps taken because
    //  the Armijo search exhausted, and trial points whose evaluation threw
    //  (any std::exception) or returned a non-finite residual and were
    //  therefore shortened, never taken.
    int       lmSteps        = 0;
    int       trialRefusals  = 0;
    //- Declared bounds only: iterations whose Newton step was shortened by
    //  the fraction-to-boundary rule or by NDOptions::maxStep.
    int       boundedSteps   = 0;
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
//
//  `audit = false` skips that first-iteration measurement.  It is for a
//  caller that solves the SAME residual function thousands of times (the
//  DSPM-DE pore, once per station and water-flux pass): the structure is a
//  property of the code, not of the numbers, so that caller audits its
//  FIRST solve, announces the measurement, and declares the rest.  The
//  default audits, and every caller that predates the field is unchanged.
//
//  `jacobian`, when set, is an ANALYTIC Jacobian the caller assembles
//  straight into the three bands (C142, the DSPM-DE pore: the
//  Scharfetter-Gummel fluxes have closed-form derivatives).  It replaces the
//  colored finite differences, which then serve only as the audit's oracle:
//  with `audit` on, the first iteration still builds the dense FD Jacobian,
//  measures the off-band maximum (the structure claim) AND the departure of
//  the analytic bands from it (NDResult::analyticMismatch, the derivative
//  claim) -- both announced by the caller.  Unset, nothing changes.
struct BlockTri
{
    std::size_t nBlocks   = 0;
    std::size_t blockSize = 0;
    bool        audit     = true;
    std::function<void(const sVector&, BlockBands&)> jacobian = nullptr;
    bool declared() const { return nBlocks > 1 && blockSize > 0; }
};

//- THE GLOBALISATION CONTRACT (DEV.md 4c C245 slice 1, from the 2026-11-08
//  kernel numerical audit, Rank 1).
//
//  `legacy` is the line search this solver has always run: a trial is
//  accepted when ||F|| merely falls, alpha is halved down to minAlpha, and
//  an exhausted search still TAKES its last finite trial (counted, up to
//  maxStalledSteps) -- an uphill step.  It stays the default so that no
//  caller moves until it opts in.
//
//  `armijo` is the textbook contract (Dennis & Schnabel 1983, Alg. A6.3.1;
//  Nocedal & Wright 2006, Sec. 3.5): with f = 0.5||F||^2 and the Newton
//  direction d (J d = -F, so f'(0) = -||F||^2), a step a is accepted only
//  when f(x + a d) <= f(x) + c1 a f'(0), c1 = 1e-4.  A rejected a is
//  replaced by the minimiser of a quadratic (first backtrack) or cubic
//  (later ones) model of f along d, safeguarded to [0.1 a, 0.5 a].  A trial
//  that throws ANY std::exception, or returns a non-finite residual, is a
//  refused trial: shortened by half, counted, never taken.  When a falls
//  below minAlpha the search has failed, and the step is a Levenberg-
//  Marquardt step on the SAME Jacobian, (J^T J + mu I) d = -J^T F, mu raised
//  tenfold until f decreases (at most 12 tries); if none does the solve
//  stops NOT converged and returns the best iterate.  No uphill step is
//  ever taken, so maxStalledSteps is not consulted.
enum class Globalisation { legacy, armijo };

struct NDOptions
{
    scalar    tolerance        = 1.0e-8;
    int       maxIter          = 50;
    scalar    fdStep           = 1.0e-7;
    bool      backtracking     = true;
    scalar    minAlpha         = 1.0e-4;
    //- STALLED STEPS (DEV.md 4c C184 defect B).  When the backtracking line
    //  search exhausts holding a FINITE trial that does not reduce ||F||, the
    //  step used to be taken in silence -- the iterate moved uphill while the
    //  stop messages promised "the last good iterate".  It is now COUNTED,
    //  ANNOUNCED, and limited to this allowance in total over one solve (0 =
    //  strict: the first such step stops the solve); past it the solve stops
    //  NOT converged and returns the BEST iterate seen, never the last.
    //  25 is not a theorem: the corpus's columns converge through up to a
    //  dozen of these floor-damped steps (stripper02: 12 of 43 iterations,
    //  acetone06: 2 of 15), so a strict default would turn working cases
    //  into failures; the count travels in NDResult::stalledSteps.
    int       maxStalledSteps  = 25;
    // Parallelise the finite-difference Jacobian across cores.  Opt-in: set ONLY
    // when the residual F is thread-safe (a pure function, no shared mutable
    // state).  The recycle / flowsheet Newton mutates unit state -> leave false.
    bool      parallel         = false;
    BlockTri  blockTri;        // declared structure; see above
    std::function<void(const NDTrace&)> onIter;

    //  ---- The globalisation contract (C245).  Every field below is EMPTY
    //  or `legacy` by default, and then the solve is bit-for-bit what it
    //  was before the contract existed.  Each vector, when given, has one
    //  entry per unknown (a size mismatch refuses by name).
    Globalisation globalisation = Globalisation::legacy;
    //- typX: the typical magnitude of each unknown.  Given, the finite-
    //  difference step is h_j = sqrt(eps) * max(|x_j|, typX_j) (Dennis &
    //  Schnabel Sec. 5.4) instead of fdStep * max(|x_j|, 1), which is an
    //  absolute floor wrong for a mole fraction of 1e-6 or a pressure of 1e5.
    sVector   typX;
    //- lower / upper: a box the iterates must stay inside (use -inf / +inf
    //  for a free unknown).  Declared, (a) an initial point outside is
    //  moved onto the box and announced, (b) the WHOLE Newton step is
    //  scaled by the fraction-to-boundary rule, tau = 0.99 of the distance
    //  to the nearest bound it would cross -- except an unknown that alone
    //  would cut the step below 0.1 of itself, which is PINNED (it moves
    //  its own 0.99 of the way and leaves tau to the others), and an unknown
    //  already ON its bound and pushed outward, which is held (NewtonND.cpp,
    //  shapeStep, says why) -- and (c) a finite-difference probe that would
    //  leave the box is taken one-sided, pointing into it.
    sVector   lower;
    sVector   upper;
    //- maxStep: the largest |change| of each unknown in one step (the whole
    //  step is scaled so that none exceeds it).
    sVector   maxStep;
};

NDResult newtonND(const std::function<sVector(const sVector&)>& F,
    sVector                                       x0,
    const NDOptions&                              opts);

// Stand-alone Gauss elimination with partial pivoting for dense A · x = b.
// A is passed by value (overwritten internally).
sVector gaussSolve(std::vector<sVector> A, sVector b);

} // namespace Choupo::solver
