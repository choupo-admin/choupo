/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The "Three ways to optimise a flowsheet" lesson, as DATA.

  THE TASK, in one sentence: I have a flowsheet and a target; which optimiser
  can I trust, and how do I read what it tells me?  (C494, 2026-11-24.)

  THE SPINE.  Three methods, one problem drawn whole.  Nelder-Mead only
  compares values, takes no constraint and can stop where nothing is optimal.
  SQP builds a quadratic model from finite-difference slopes, honours
  constraints and, at its answer, prints a Lagrange multiplier that is a PRICE:
  what relaxing the limit by one unit would gain.  MADS (Audet and Dennis)
  polls a mesh, needs no slope, keeps integers whole and has a convergence
  theory for functions that are not smooth.  The first two are in the engine
  (`method nelderMead;`, `method sqp;`, `method mads;`); the page's MADS is written from the
  papers and differs from the engine's in ways the card lists (poll directions, projection, barrier).

  WHERE THE NUMBERS COME FROM.  The two landscapes are toy functions declared
  as toys (optimizersMath.ts), the methods are the page's arithmetic (origin:
  page) and the optim06 table is the engine's own run (origin: engine), read
  back by tests/optimizers.test.ts from the run outputs the witness setup
  generates.  The Choupo side is cited to the line: CITATIONS lists each
  file, line and the text that line must contain, and the test reads every
  one back.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

/** The Choupo side of every claim: file, line, and the fragment the line must
 *  contain.  `says` is what the page draws beside the citation. */
export interface Citation { id: string; file: string; line: number; contains: string; says: string }

export const CITATIONS: readonly Citation[] = [
  { id: "parse", file: "src/outerDriver/OptimizationDriver.cpp", line: 222, contains: 'lookupWordOrDefault("method", "nelderMead")',
    says: "the method is a word in outerDict, and the default is nelderMead" },
  { id: "parseMads", file: "src/outerDriver/OptimizationDriver.cpp", line: 225, contains: 'else if (method == "mads")',
    says: "mads is the third method word; it is chosen explicitly, never by a silent switch" },
  { id: "parseSqp", file: "src/outerDriver/OptimizationDriver.cpp", line: 224, contains: 'else if (method == "sqp")',
    says: "sqp is the second method word (mads and the opt-in bayesian follow it): no silent switch between methods" },
  { id: "unconstrained", file: "src/outerDriver/OptimizationDriver.cpp", line: 323, contains: "method_ == Method::NelderMead",
    says: "constraints with nelderMead throw" },
  { id: "unconstrainedMsg", file: "src/outerDriver/OptimizationDriver.cpp", line: 325, contains: "Nelder-Mead is unconstrained",
    says: "the message names the way out: add a penalty term, or switch to sqp or mads" },
  { id: "integer", file: "src/outerDriver/OptimizationDriver.cpp", line: 245, contains: "An integer variable is ENUMERATED",
    says: "an integer variable is enumerated, never handed to a gradient" },
  { id: "enumeration", file: "src/outerDriver/OptimizationDriver.cpp", line: 1691, contains: "Integer enumeration (Front 4c",
    says: "the integer enumeration: one full run per value, every value shown" },
  { id: "nmReflect", file: "src/solver/NelderMead.cpp", line: 181, contains: "sVector xr = vadd(xc, vsub(xc, X[iWorst]), opts.alpha)",
    says: "the reflection x_r = x_c + alpha (x_c - x_worst)" },
  { id: "nmExpand", file: "src/solver/NelderMead.cpp", line: 189, contains: "sVector xe = vadd(xc, vsub(xr, xc), opts.gamma)",
    says: "the expansion x_e = x_c + gamma (x_r - x_c), tried only when the reflection beat the best" },
  { id: "nmContract", file: "src/solver/NelderMead.cpp", line: 201, contains: "// --- contraction",
    says: "the contraction, outside or inside the simplex" },
  { id: "nmShrink", file: "src/solver/NelderMead.cpp", line: 213, contains: "// --- shrink toward best",
    says: "the shrink toward the best vertex, when the contraction also fails" },
  { id: "nmClip", file: "src/solver/NelderMead.cpp", line: 44, contains: "void clipInPlace(sVector& x",
    says: "bounds are met by clipping a trial point into the box" },
  { id: "nmTolX", file: "src/solver/NelderMead.cpp", line: 248, contains: "if (relDiameter < opts.tolX)",
    says: "stop when the simplex is small in every coordinate" },
  { id: "nmTolF", file: "src/solver/NelderMead.cpp", line: 253, contains: "if (fRange / fScale < opts.tolF)",
    says: "or when the values over the simplex agree: a flat function stops it too" },
  { id: "nmDefaults", file: "src/solver/NelderMead.H", line: 100, contains: "scalar  alpha           = 1.0",
    says: "the coefficients alpha 1, gamma 2, rho 0.5, sigma 0.5 (lines 100 to 103)" },
  { id: "madsRun", file: "src/outerDriver/OptimizationDriver.cpp", line: 694, contains: "int OptimizationDriver::runMads()",
    says: "the MADS back-end of the driver" },
  { id: "madsCheck", file: "src/outerDriver/OptimizationDriver.cpp", line: 699, contains: "solver::verifyMADS(0)",
    says: "before every MADS run the engine checks it against the published optima of a smooth constrained and a non-smooth problem" },
  { id: "madsDelta", file: "src/solver/MADS.cpp", line: 208, contains: "const scalar delta = std::min(Delta, Delta * Delta);",
    says: "the mesh size is min(poll size, poll size squared), as on the page" },
  { id: "madsDirections", file: "src/solver/MADS.cpp", line: 227, contains: "Directions: Householder of the Halton vector",
    says: "the poll directions: a Householder matrix of a Halton vector, +-2n of them, not the page's random ones" },
  { id: "madsProject", file: "src/solver/MADS.cpp", line: 133, contains: "auto project = [&](sVector x) {",
    says: "a trial point is rounded (integers) and projected onto the box; the page's toy discards points outside it" },
  { id: "madsBarrier", file: "src/solver/MADS.cpp", line: 167, contains: "scalar hMax = kInf;",
    says: "the barrier threshold starts at infinity and falls by the three-way update of the papers, which the page simplifies" },
  { id: "optim07", file: "tutorials/steady/optimisation/optim07_mads_mixed_column/system/outerDict", line: 60, contains: "method  mads;",
    says: "optim07 solves the integer-stages problem of optim06 in one MADS run, the stage count integer" },
  { id: "audit", file: "docs/audits/2026-11-24-optimizer-comparison.md", line: 66, contains: "* ctrl16: MADS without a constraint found J = 6497",
    says: "the recorded comparison of the three methods on the shipped cases, and the ctrl16 finding" },
  { id: "closure", file: "src/outerDriver/OptimizationDriver.cpp", line: 200, contains: "void OptimizationDriver::checkReplayClosure",
    says: "after the run the best point is replayed and the driver throws, reporting no optimum, when it breaks conservation (ClosureGuard)" },
  { id: "closureMsg", file: "src/outerDriver/OptimizationDriver.cpp", line: 211, contains: "creates or loses matter; add the closure as a constraint",
    says: "the message tells the author to add the closure as a constraint or restrict the variable ranges" },
  { id: "sqpRun", file: "src/outerDriver/OptimizationDriver.cpp", line: 974, contains: "int OptimizationDriver::runSqp()",
    says: "the SQP back-end of the driver" },
  { id: "selfCheck", file: "src/outerDriver/OptimizationDriver.cpp", line: 986, contains: "solver::verifySQP(0)",
    says: "before every SQP run the engine proves the QP solver and the SQP loop on Hock-Schittkowski problems (lines 623 and 624)" },
  { id: "multipliers", file: "src/outerDriver/OptimizationDriver.cpp", line: 1367, contains: "Lagrange multipliers (shadow prices)",
    says: "the multipliers are printed, an active inequality marked ACTIVE" },
  { id: "fdStep", file: "src/solver/SQP.cpp", line: 587, contains: "opts.fdStep * std::max(std::abs(x[j]), typX[j])",
    says: "forward finite differences, a relative step of 1e-5, n + 1 evaluations per iteration" },
  { id: "bfgsInit", file: "src/solver/SQP.cpp", line: 797, contains: "B[i][i] = 1.0;",
    says: "the Hessian of the Lagrangian starts as the identity" },
  { id: "qp", file: "src/solver/SQP.cpp", line: 896, contains: "QP = activeSetQP(qp);",
    says: "each step is the solution of a QP by the active-set routine of the active-set-qp page" },
  { id: "box", file: "src/solver/SQP.cpp", line: 868, contains: "Box bounds on the step folded in as inequality rows",
    says: "the box of the variables enters the QP as inequality rows" },
  { id: "merit", file: "src/solver/SQP.cpp", line: 779, contains: "auto merit = ",
    says: "the L1 merit function f + mu (violation) judges the step" },
  { id: "armijo", file: "src/solver/SQP.cpp", line: 1449, contains: "if (phiT <= phi0 + opts.armijoC1 * alpha * Dphi",
    says: "backtracking: the step is halved until the merit falls enough" },
  { id: "damped", file: "src/solver/SQP.cpp", line: 1554, contains: "theta = (sy >= 0.2 * sBs)",
    says: "Powell's damped BFGS keeps the Hessian positive definite" },
];

/** The optim06 case this page reads, and the golden rows its typed numbers equal. */
export const OPTIM06 = "tutorials/steady/optimisation/optim06_integer_stages";

export interface RunRow {
  n: number;
  verdict: "failed" | "not converged" | "converged";
  /** V_strip, kmol/s, as the enumeration table prints it. */
  v: number | null;
  /** The optimal reflux ratio, or the box edge the run stopped on. */
  r: number | null;
  /** The multiplier of x_D_LK >= 0.98, reported by the run; null where the run did not converge. */
  lambda: number | null;
  why: string;
}

/** What the shipped optim06 prints, one row per stage count, recorded from a
 *  native run of this tree on 2026-11-24 (the test reads it back from the run
 *  the witness setup makes). */
export const RUN_ROWS: readonly RunRow[] = [
  { n: 8, verdict: "failed", v: null, r: null, lambda: null,
    why: "feedStage 8 must lie in 1..7: the column cannot be built with 8 stages and a feed stage of 8" },
  { n: 9, verdict: "not converged", v: 0.0778544, r: 6, lambda: null,
    why: "even R = 6, the top of its box, does not reach x_D_LK 0.98" },
  { n: 10, verdict: "not converged", v: 0.0778544, r: 6, lambda: null,
    why: "even R = 6, the top of its box, does not reach x_D_LK 0.98" },
  { n: 11, verdict: "not converged", v: 0.0778544, r: 6, lambda: null,
    why: "even R = 6, the top of its box, does not reach x_D_LK 0.98" },
  { n: 12, verdict: "converged", v: 0.0555833, r: 4.39648, lambda: 2.2797, why: "KKT satisfied" },
  { n: 13, verdict: "converged", v: 0.0417648, r: 3.401553, lambda: 1.2806, why: "KKT satisfied" },
  { n: 14, verdict: "converged", v: 0.03479, r: 2.899363, lambda: 0.83715, why: "KKT satisfied" },
];

/** The golden numbers the page types (tests/optimizers.test.ts holds each to
 *  the case's `expected`; bin/curate/check_lesson_typed_numbers.py holds the
 *  literals in this file). */
export const GOLDEN_TYPED = {
  vStrip: "0.03479", reflux: "2.8994", xDLK: "0.979999",
} as const;

/** The multiplier checked against the engine itself, recorded by hand on
 *  2026-11-24: optim06's variables block cut to 13 and 14 stages and the limit
 *  x_D_LK >= p moved in a scratch copy of the case; V_strip at 14 stages. */
export const SHADOW_CHECK = {
  /** [limit p, V_strip at 14 stages, kmol/s] */
  rows: [[0.979, 0.0339898], [0.9795, 0.0343811], [0.98, 0.03479], [0.9805, 0.0352188], [0.981, 0.0356679]] as const,
  lambdaPrinted: 0.83715,
};

/** The recorded answer of the decision card, one row per kind of problem. */
export const DECISION_ROWS: readonly { id: string; problem: string; method: string; gives: string; check: string }[] = [
  { id: "smooth", problem: "Smooth and differentiable, with constraints (a design with a purity limit and a duty budget)",
    method: "SQP (method sqp; in the engine)",
    gives: "The answer, the active constraints and a Lagrange multiplier on each: a shadow price. A KKT certificate with four numbers.",
    check: "The self-check line, the KKT block, and that the objective does not depend on a table or an integer the gradient cannot see." },
  { id: "integer", problem: "An integer decision (stages, a number of units) beside continuous ones",
    method: "Enumerate the integer, optimise the rest inside (integer true; in the engine)",
    gives: "One row per value, every failure shown, the best marked: the whole trade on one table.",
    check: "A row that failed or did not converge is a finding, not a gap: read its reason." },
  { id: "nonsmooth", problem: "Non-smooth, noisy or a black box: tables, piecewise correlations, regime switches, phase changes",
    method: "MADS (method mads; in the engine)",
    gives: "A point no poll direction improves on a mesh as fine as asked, with no slope computed and no multiplier.",
    check: "Repeat with other seeds: it is a local method. Constraints are met through a barrier, so expect many evaluations. "
      + "The engine's recorded comparison on the shipped cases (the audit named under the card) found that on the five smooth ones SQP "
      + "and Nelder-Mead reached the same optimum with fewer simulations, and holds no non-smooth flowsheet. On ctrl16, with no "
      + "constraint, MADS alone returned an objective twelve times the published one, at a point where the plant's mass balance "
      + "is broken. An optimiser refuses such a run: the driver replays the best point and throws, reporting no optimum, when "
      + "the model creates or loses matter (ClosureGuard); put the closure in as a constraint." },
  { id: "first", problem: "A first look at an unconstrained problem of a few variables",
    method: "Nelder-Mead (the default word; in the engine)",
    gives: "A fast answer from values alone, and nothing about the constraints, which it does not take.",
    check: "Stopping is not proof: restart from the answer, and remember McKinnon's example." },
];

export const OPT_LABELS: readonly string[] = ["ch:nelder-mead", "ch:sqp", "sec:sqp-shadow", "ch:active-set-qp"];
export const OPT_CASES: readonly string[] = [OPTIM06];

export const OPT_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The landscape: an objective, a limit and two variables you can see",
    body: "Every optimiser below is handed the same problem, drawn whole so you can watch what it does. "
      + "Choose a number of stages s and a reflux ratio r to minimise a cost f, with a purity that must reach a "
      + "limit. The two functions are TOYS made for this page, with the shape of the shipped case optim06 "
      + "(more stages, less reflux; a purity to reach) and nothing else: they are not a column model. "
      + "In the SMOOTH landscape the stage count is a real number, which no column can have and a gradient method "
      + "needs. In the STEPPED one it is rounded to a whole number, so cost and purity are a staircase in s with a "
      + "jump at every half stage, which is the shape a table lookup, a piecewise correlation or a regime switch "
      + "gives a real flowsheet. The band shading is the cost, darker is dearer; the hatched side violates the "
      + "limit; the dashed line is the limit itself. Click the plot to read the numbers at a point.",
    derivation: [
      { step: "Boil-up grows with the reflux ratio at a fixed distillate, and every stage is built and paid for, so "
          + "the cost is a reflux term plus a capital term per stage.",
        eq: String.raw`f(s,r) = (r+1) + c\,s_e` },
      { step: "More effective stages and more reflux separate better, with diminishing returns. This purity is a toy "
          + "chosen to have that shape, not a derived law.",
        eq: String.raw`P(s,r) = 1-\exp\!\Big(-k\,(s_e-s_0)\,\frac{r}{r+1}\Big)` },
      { step: "The specification is written so that satisfied means the left-hand side is at most zero, as the "
          + "engine writes every inequality.",
        eq: String.raw`g(s,r) = p_\mathrm{spec} - P(s,r) \le 0` },
    ],
    formula: String.raw`\begin{aligned}
\min_{s,\,r}\ & f(s,r) = (r+1) + c\,s_e\\
\text{subject to}\ & g(s,r) = p_\mathrm{spec} - P(s,r) \le 0,\qquad s_e = s\ \text{or}\ \text{round}(s)
\end{aligned}`,
    where: [
      { sym: "s", means: "the number of stages: real in the smooth landscape, rounded to a whole number in the stepped one, between 8 and 14" },
      { sym: "s_e", means: "the stage count the functions actually use: s itself (smooth) or s rounded to the nearest whole stage (stepped)" },
      { sym: "r", means: "the reflux ratio, between 1.5 and 6" },
      { sym: "f", means: "the cost to minimise, in the page's own units: the boil-up r + 1 plus the capital c per stage" },
      { sym: "c", means: "the capital cost of one stage in the same units, 1.6" },
      { sym: "P", means: "the purity reached, between 0 and 1; k = 0.6 and s_0 = 5 set how fast stages and reflux buy it" },
      { sym: "k", means: "the separation power of one stage at infinite reflux, 0.6; a toy constant" },
      { sym: "s_0", means: "the stage count below which the toy separates nothing, 5" },
      { sym: "g", means: "the limit written as g <= 0: the purity shortfall, positive where the specification is violated" },
      { sym: "p_\\mathrm{spec}", means: "the purity the design must reach, 0.98 (optim06 asks 0.98 of x_D_LK)" },
    ],
    note: "Choupo does not give an integer to a gradient method: an integer variable is enumerated, one full run "
      + "per value (the engine's own answer to the staircase in s). The stepped landscape stands for what stays "
      + "non-smooth after that.",
  },
  {
    n: 2,
    title: "Nelder-Mead: a simplex that only compares values",
    body: "Nelder-Mead keeps three points (a simplex) in two variables and never computes a slope. Each step it "
      + "reflects the worst point through the centre of the other two; if that beats the best it tries to go "
      + "twice as far (expand), if it only beats the second it keeps it, otherwise it pulls the worst point "
      + "toward the centre (contract), and if even that fails it shrinks every point toward the best (shrink). "
      + "Step through it on either landscape. Two things to read. It takes NO constraint: the engine throws on "
      + "one and tells you to add a penalty, so here the objective is f plus a penalty on the violation, with a "
      + "weight that is the user's guess. And it stops on the values, not on optimality: when the simplex is small "
      + "or the values over it agree it declares convergence, which on the stepped landscape means a flat step "
      + "can end the search.",
    derivation: [
      { step: "Order the three points best, middle, worst and take the centroid of the best two.",
        eq: String.raw`x_c = \tfrac12\,(x_b + x_m)` },
      { step: "Reflect the worst point through the centroid; expand if the reflection beat the best.",
        eq: String.raw`x_r = x_c + \alpha\,(x_c - x_w),\qquad x_e = x_c + \gamma\,(x_r - x_c)` },
      { step: "Otherwise contract toward the centroid; if that fails shrink every point toward the best.",
        eq: String.raw`x_o = x_c + \rho\,(x_w - x_c),\qquad x_k \leftarrow x_b + \sigma\,(x_k - x_b)` },
    ],
    formula: String.raw`\phi(s,r) = f(s,r) + \mu\,\max\big(0,\,g(s,r)\big)`,
    where: [
      { sym: "\\phi", means: "the penalised objective Nelder-Mead minimises here: cost plus the weighted violation" },
      { sym: "\\mu", means: "the penalty weight, 1000 here: a guess. Too small and the answer violates the limit; too large and the surface becomes a cliff" },
      { sym: "x_b", means: "the best point of the simplex" },
      { sym: "x_m", means: "the middle point" },
      { sym: "x_w", means: "the worst point" },
      { sym: "x_c", means: "the centroid of all points but the worst" },
      { sym: "x_r", means: "the reflected point" },
      { sym: "x_e", means: "the expanded point" },
      { sym: "x_o", means: "the contracted point" },
      { sym: "x_k", means: "any vertex, moved toward the best in a shrink" },
      { sym: "\\alpha", means: "the reflection coefficient, 1 (the engine's default)" },
      { sym: "\\gamma", means: "the expansion coefficient, 2" },
      { sym: "\\rho", means: "the contraction coefficient, 0.5" },
      { sym: "\\sigma", means: "the shrink coefficient, 0.5" },
    ],
    note: "The page runs the engine's rules and defaults, written out again in TypeScript; the engine clips a trial "
      + "point into the box, and so does the page.",
  },
  {
    n: 3,
    title: "SQP: a quadratic model, an active constraint and a price",
    body: "SQP uses slopes. At each point it measures the gradient of the cost and of the limit by forward finite "
      + "differences, builds a quadratic model of the cost (the Hessian of the Lagrangian, learnt by damped BFGS) "
      + "and a straight-line model of the limit, and solves that quadratic program for a step: this is the "
      + "inner problem of the active-set-qp page. A merit function and a backtracking line search decide how far "
      + "to go. At the answer the limit is ACTIVE and carries a Lagrange multiplier. Read it as a price: the "
      + "multiplier is how much the optimal cost rises per unit the limit is tightened, so relaxing the limit by "
      + "one unit gains that much. Move the limit below and watch the optimal cost follow the multiplier. Then "
      + "switch to the stepped landscape: a finite-difference slope across a plateau is zero, the quadratic "
      + "program sees no reason to move the stage count, and the method reports a converged answer at the "
      + "plateau it started on.",
    derivation: [
      { step: "At the current point replace the cost by a quadratic model and the limit by its tangent line, in the step d.",
        eq: String.raw`\min_d\ \tfrac12\,d^{\mathsf T} B\, d + \nabla f^{\mathsf T} d\quad\text{subject to}\quad g + \nabla g^{\mathsf T} d \le 0` },
      { step: "At the optimum the gradient of the cost is balanced by the gradient of the active limit; the balance "
          + "factor is the multiplier.",
        eq: String.raw`\nabla f + \lambda\,\nabla g = 0,\qquad \lambda \ge 0` },
      { step: "Moving the limit moves the optimal cost at the rate the multiplier says (the sensitivity of a "
          + "constrained optimum, Nocedal and Wright).",
        eq: String.raw`\lambda = \frac{\mathrm{d}f^{*}}{\mathrm{d}\,p_\mathrm{spec}}` },
    ],
    formula: String.raw`\lambda = \frac{\mathrm{d}f^{*}}{\mathrm{d}\,p_\mathrm{spec}}\qquad\quad\text{so}\quad \Delta f^{*} \approx \lambda\,\Delta p_\mathrm{spec}`,
    where: [
      { sym: "d", means: "the step the quadratic program proposes, from the current point" },
      { sym: "B", means: "the quadratic model's Hessian: an approximation of the Hessian of the Lagrangian, starting as the identity" },
      { sym: "\\nabla f", means: "the gradient of the cost, by forward finite differences" },
      { sym: "\\nabla g", means: "the gradient of the limit, by forward finite differences" },
      { sym: "\\lambda", means: "the Lagrange multiplier of the limit: zero when the limit is slack, positive when it is active", unit: "cost units per unit of purity" },
      { sym: "f^{*}", means: "the optimal cost, as a function of the purity limit" },
      { sym: "\\Delta f^{*}", means: "the change of the optimal cost when the limit moves" },
      { sym: "\\Delta p_\\mathrm{spec}", means: "the change of the purity limit" },
    ],
    note: "The page's SQP follows the engine's structure, without the engine's Powell relaxation of an infeasible QP "
      + "and without its watchdog; on a landscape this small neither is needed, and it stops by name if the "
      + "linearised limit cannot hold inside the box. The multiplier is local: it prices the limit at THIS optimum.",
  },
  {
    n: 4,
    title: "MADS: a mesh, a poll and a barrier that closes",
    body: "MADS (mesh adaptive direct search) needs no slope. Around the current point it lays a mesh and polls a "
      + "few directions on it; if a poll point is better it moves there and the mesh coarsens, if none is it stays "
      + "and the mesh refines. The poll directions are random but complete (they positively span the plane) and, as "
      + "the mesh refines, they become dense in every direction: this is what gives MADS a convergence theory on "
      + "functions that are not smooth. An integer variable lives on a mesh no finer than one stage. A constraint "
      + "is met through the progressive barrier: an infeasible point is accepted while its violation stays under "
      + "a threshold, and the threshold closes as the search goes on. Step through it. Every poll point is drawn "
      + "with a mark AND named in the table; the seed changes the random directions, and the table of twenty seeds "
      + "shows that MADS is a local method.",
    derivation: [
      { step: "The mesh size is tied to the poll size so that the mesh gets finer faster than the frame: this is "
          + "what lets the directions fill the space.",
        eq: String.raw`\delta_k = \min\big(\Delta_k,\ \Delta_k^{2}\big)` },
      { step: "Poll the points of a frame around the current point; a success enlarges the poll size, a failure "
          + "shrinks it by the factor tau.",
        eq: String.raw`P_k = \{\,x_k + \delta_k\,d\ :\ d \in D_k\,\},\qquad \Delta_{k+1} = \Delta_k/\tau\ \text{or}\ \tau\,\Delta_k` },
      { step: "The progressive barrier measures how much the limits are broken and throws away any point above a "
          + "threshold that only falls.",
        eq: String.raw`h(x) = \max\big(0,\,g(x)\big)^2,\qquad h(x) \le h_\mathrm{max}` },
    ],
    formula: String.raw`\delta_k = \min\big(\Delta_k,\ \Delta_k^{2}\big),\qquad h(x) = \max\big(0,\,g(x)\big)^2 \le h_\mathrm{max}`,
    where: [
      { sym: "\\delta_k", means: "the mesh size at iteration k: the grid spacing on which every trial point must lie" },
      { sym: "\\Delta_k", means: "the poll size (frame size): how far from the current point the poll reaches, never below the mesh size" },
      { sym: "P_k", means: "the poll set: the trial points of iteration k" },
      { sym: "x_k", means: "the current point (the poll centre) at iteration k" },
      { sym: "d", means: "a poll direction, an integer vector" },
      { sym: "D_k", means: "the set of poll directions of iteration k, four of them here: they positively span the plane" },
      { sym: "\\tau", means: "the mesh-size adjustment factor, 0.5: the poll size halves after a failure" },
      { sym: "h", means: "the aggregate violation of the limits, zero for a feasible point" },
      { sym: "g", means: "the limit, positive where violated" },
      { sym: "x", means: "a trial point" },
      { sym: "h_\\mathrm{max}", means: "the barrier threshold: an infeasible point above it is thrown away; it only falls" },
    ],
    note: "Written from the papers, and differing from the engine's own `method mads;` (listed under the plot and in the limits): the poll directions of the Audet-Custodio-Dennis erratum, the "
      + "skeleton of Algorithm 2.1 of the NOMAD 4 paper, and a SIMPLIFIED progressive barrier read from the survey "
      + "of Larson, Menickelly and Wild. The simplifications are listed under the plot.",
  },
  {
    n: 5,
    title: "Reading a real run: optim06, one SQP per stage count",
    body: "The shipped case optim06_integer_stages declares the number of stages integer: the driver runs the whole "
      + "SQP once for each value from 8 to 14, a new column each time, and prints every row, the failures too. "
      + "The inner problem is minimise the stripping boil-up V_strip over the reflux ratio R in [1.5, 6], "
      + "subject to x_D_LK >= 0.98. Read the table row by row. 8 stages cannot even be built with the case's "
      + "feed stage. 9, 10 and 11 stop at the top of the reflux box without reaching the purity: not converged, "
      + "no multiplier worth reading. 12, 13 and 14 converge, and the cost falls as stages are added. The "
      + "multiplier of the purity limit at 14 stages is the shadow price: tightening the purity by 0.001 costs "
      + "about 0.001 times the multiplier of boil-up. The page checked that against the engine by moving the limit, "
      + "below.",
    note: "The best row, 14 stages, is the case's golden: V_strip 0.03479 kmol/s at R 2.8994, x_D_LK 0.979999. 14 is "
      + "also the largest stage count in the case's box, so the enumeration says 'more stages are cheaper' and "
      + "stops where the box does; widening the box is a decision for the case's author.",
  },
  {
    n: 6,
    title: "Which one, and when",
    body: "Use the problem's shape, not habit. A smooth problem with constraints is SQP's: you get the answer and "
      + "the shadow prices, and its own certificate says whether to believe them. An integer is enumerated, with "
      + "the rest optimised inside each value. A function with tables, kinks, regime switches or noise is MADS's "
      + "ground, at the price of many evaluations and a local answer. Nelder-Mead is the first thing to try on a "
      + "small unconstrained problem, with a known failure: it can converge to a point that is not a minimum. "
      + "McKinnon's counter-example is a smooth, convex function of two variables on which Nelder-Mead, with "
      + "the standard coefficients and a specific starting simplex, contracts forever toward (0, 0), where "
      + "the slope in y is not zero: the engine's own rules stop it there and report convergence. "
      + "Behind all of this stands the NO FREE LUNCH theorem of Wolpert and Macready (1997): averaged over ALL "
      + "possible objective functions on a finite search space, every function equally likely, every search "
      + "algorithm performs the same, random search included; what an algorithm gains on one class of functions "
      + "it gives back on the rest. Read alone it invites the opposite myth, that the choice of optimiser does not "
      + "matter. It says something narrower: an algorithm is good FOR A CLASS, the one whose structure it exploits, "
      + "and a real engineering problem is not 'all possible functions' but smooth or not, constrained, partly "
      + "integer, noisy. The engineer's job is to know the class of the problem. The same holds in the engine's own recorded comparison (cited "
      + "under the card): where the problem is smooth SQP and Nelder-Mead do as well as MADS or better for fewer "
      + "simulations, so MADS earns its cost only where slopes cannot be trusted. The table below runs the page's "
      + "own two landscapes, and it does not crown a universal winner either way: SQP is exact and cheapest on the smooth one "
      + "and misled on the stepped one; MADS is not blind to the steps but is slower and local; Nelder-Mead does well on "
      + "both toys, which are two variables with a penalty weight that happens to be adequate, and pays elsewhere (the "
      + "weight a user must guess, McKinnon's stop, growth with the number of variables).",
    formula: String.raw`f(x,y) = \begin{cases} \theta\varphi\,|x|^{\tau} + y + y^{2} & x \le 0\\ \theta\,x^{\tau} + y + y^{2} & x \ge 0 \end{cases}`,
    where: [
      { sym: "f", means: "McKinnon's function, here with tau = 2, theta = 6 and phi = 60" },
      { sym: "x", means: "the first variable, the one the function is not smooth in" },
      { sym: "y", means: "the second variable: at x = 0 the function is y + y squared, which is lowest, minus one quarter, at y = minus one half" },
      { sym: "\\theta", means: "the coefficient of the right branch, 6" },
      { sym: "\\varphi", means: "the ratio of the two branches' coefficients, 60" },
      { sym: "\\tau", means: "the exponent of |x|, 2" },
    ],
    note: "McKinnon (1998) gives the function and the simplex; the page does not reprint the proof. It runs the "
      + "engine's rules on the function and the table below is what that run does.",
  },
];

export const OPT_LIMITS: readonly LessonLimit[] = [
  { id: "toy", title: "The landscapes are toys",
    body: "Two functions of two variables built for the picture. They show how each method behaves on a smooth "
      + "surface and on a staircase; they say nothing about how many evaluations any of them needs on a real "
      + "flowsheet, where one evaluation is a recycle converging." },
  { id: "sqp", title: "The page's SQP is the engine's structure, not the engine",
    body: "Same pieces (finite-difference gradients, damped BFGS of the Lagrangian, the active-set QP, an L1 merit "
      + "and backtracking), written again in TypeScript, without Powell's relaxation of an infeasible QP and "
      + "without the watchdog. The optim06 table is the engine's own run; the toy paths are not." },
  { id: "mads", title: "The page's MADS is from the papers, and simplified",
    body: "The page's MADS follows the papers named in the references and is not the engine's `method mads;`. It "
      + "differs in the poll directions (random LTMADS here, a Householder matrix of a Halton vector in the engine), in "
      + "polling every point (the engine ends the poll at the first dominating trial), in discarding a point outside the "
      + "box (the engine projects it onto the box and rounds integers) and in the barrier (simplified here, the "
      + "papers' three-way threshold update in the engine). The seed table therefore describes these directions only. "
      + "The mesh rule, the success and failure update and the integer mesh floor of one agree." },
  { id: "local", title: "All three are local methods",
    body: "None finds the global optimum of a non-convex problem. On the stepped landscape SQP always ends on the "
      + "plateau it started on, and MADS ends on 13 stages, where 14 is cheaper, for most seeds (the table under "
      + "the MADS plot counts them); where a method ends depends on the start." },
  { id: "multiplier", title: "A multiplier prices one optimum, locally",
    body: "The shadow price is the slope of the optimal cost against the limit at the optimum found, for a small "
      + "move: when the limit moves a lot, the active set or the curvature changes and the price with it. It "
      + "means nothing at an answer that did not converge." },
];

export const OPT_QUIZ: readonly QuizQuestion[] = [
  {
    id: "q-nfl",
    q: "What should a flowsheet engineer conclude from the no free lunch theorem?",
    options: [
      "No optimiser is best on every problem: match the method to the structure of the problem (smooth, constrained, integer, noisy)",
      "All optimisers give the same result on a flowsheet, so use the cheapest",
      "Random search is as good as SQP on a smooth constrained design",
      "The newest optimiser dominates the older ones",
    ],
    correct: 0,
    feedback: "The theorem averages over every possible function, equally weighted; a flowsheet is not one of "
      + "'all possible functions' but belongs to a class with structure, and a method that exploits that "
      + "structure (SQP on a smooth problem, MADS on a non-smooth one) beats one that does not. What is lost "
      + "is the hope of a universal winner, not the value of choosing.",
    steps: [6],
    origins: ["reference"],
  },
  {
    id: "q-stepped-sqp",
    q: "On the stepped landscape the page's SQP, started at 13.2 stages, reports KKT satisfied at 13 stages although 14 stages is cheaper. Why?",
    options: [
      "The finite-difference slope of cost and limit along s is zero on a plateau, so nothing in the quadratic program pulls s away from where it is",
      "The active-set QP solver is wrong on discontinuous functions",
      "The penalty weight is too small",
      "SQP cannot handle an inequality constraint",
    ],
    correct: 0,
    feedback: "A forward difference with a step of 1e-5 stays inside the plateau, so the measured slope in s is "
      + "exactly zero: the optimality conditions are satisfied in s, and the certificate is true of what the "
      + "method measured, not of the function. This is why the engine enumerates an integer instead of handing "
      + "it to a gradient.",
    steps: [3],
    origins: ["page"],
  },
  {
    id: "q-shadow",
    q: "optim06 prints a Lagrange multiplier of 0.83715 on x_D_LK >= 0.98 at 14 stages. What does it say?",
    options: [
      "Lowering the purity limit by 0.001 would save about 0.00084 kmol/s of stripping boil-up",
      "The purity reached is 83.7 %",
      "Each extra stage costs 0.837 units",
      "The limit is violated by 0.837",
    ],
    correct: 0,
    feedback: "The multiplier is the slope of the optimal boil-up against the purity limit, in kmol/s per unit of "
      + "x_D_LK. Moving the limit by 0.001 and re-running the engine saved 0.00080 kmol/s: a price, valid for a "
      + "small move.",
    steps: [3, 5],
    origins: ["engine"],
  },
  {
    id: "q-nm-constraint",
    q: "You add a purity limit to a case that says method nelderMead. What happens?",
    options: [
      "The driver stops with a message: constraints need method sqp, or a penalty term in the objective",
      "Nelder-Mead treats the limit as a bound and clips to it",
      "The run silently switches to SQP",
      "The limit is ignored with a warning",
    ],
    correct: 0,
    feedback: "The driver reads only two method words and throws when constraints meet any but sqp; nothing "
      + "switches silently and nothing is dropped silently. The penalty is the user's decision, with a weight to choose.",
    steps: [2],
    origins: ["engine"],
  },
  {
    id: "q-mads-mesh",
    q: "A MADS poll finds no better point. What does the method do with the mesh?",
    options: [
      "Refines it: the poll size halves and the mesh size falls with it",
      "Enlarges it to reach further",
      "Keeps it and polls the same points again",
      "Switches to a gradient step",
    ],
    correct: 0,
    feedback: "A failed poll is the signal that the current point is a minimum at this resolution, so the frame "
      + "shrinks and the next poll looks closer, in new random directions. A success enlarges it.",
    steps: [4],
    origins: ["page"],
  },
  {
    id: "q-which",
    q: "A flowsheet's boil-up comes from a table lookup with a kink near the optimum, and the purity has a limit. Which method fits?",
    options: [
      "MADS: no slope is needed and constraints are met through the barrier",
      "SQP: its finite-difference slopes will bridge the kink",
      "Nelder-Mead: constraints are not a problem for it",
      "None: a table cannot be optimised",
    ],
    correct: 0,
    feedback: "SQP trusts slopes measured across a kink, Nelder-Mead takes no constraint, and a table is just a "
      + "function. MADS is built for exactly this shape, at the price of many evaluations.",
    steps: [4, 6],
    origins: ["page"],
  },
  {
    id: "q-mckinnon",
    q: "Nelder-Mead stops with a tiny simplex and 'converged'. Is the point a minimum?",
    options: [
      "Not necessarily: on McKinnon's function it stops where the slope in y is not zero",
      "Yes: a small simplex means the gradient is zero",
      "Yes, if the penalty weight is large enough",
      "Only if it expanded at least once",
    ],
    correct: 0,
    feedback: "A shrinking simplex proves the simplex shrank. McKinnon's smooth function makes the standard rules "
      + "contract toward (0, 0) forever while f is lower just below that point, so the stop test says converged at a "
      + "point that is not stationary. Restart from the answer to check.",
    steps: [2, 6],
    origins: ["page"],
  },
];
