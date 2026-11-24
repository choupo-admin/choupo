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
  The relaxation lesson, as DATA, so the arithmetic it claims can be
  recomputed against the tool's own `relaxationMath` in
  tests/relaxationLesson.test.ts -- a page must not teach against its own code.

  WHERE THIS PAGE SITS.  It is the FIRST rung of the numerics path "Recycle
  numerics": why a recycle must be iterated, and the three ways to do it
  (relax it by a fixed factor, let Wegstein choose the factor, use Newton's
  whole slope).  The Wegstein page is the second rung and this page ends by
  handing the student to it.  It exists because a student who knows OpenFOAM's
  `relaxationFactors` found nothing of the kind in Choupo (DEV.md 4c C246),
  and because the Wegstein page opens with an accelerator before saying what
  it accelerates.

  THE SPINE.  A recycle is a fixed-point problem x = G(x).  Direct
  substitution converges when the loop gain |a| < 1 and crawls or diverges
  otherwise.  Relaxation x+ = (1 - w) x + w G(x) changes the slope to
  1 - w + w a: a w < 1 tames an a < -1 (the oscillating loop) and no
  w <= 1 rescues an a >= 1 (the runaway loop).  The optimal factor for a
  linear loop is w = 1/(1 - a).  Wegstein is the same formula with w = 1 - q
  chosen per variable from the last two iterates.  Newton uses the whole slope,
  and its line search -- not a fixed factor -- is its adaptive damping.  The
  segregated CFD solvers need a fixed factor; a unit's Newton does not.

  THE HONESTY SPINE.  Steps 1-7 describe a ONE-variable linear toy this page
  declares in full; it is not a Choupo model.  Step 9 and the fourth figure
  are the real engine on a real recycle (process03_recycle) under
  `recycleSolver directSubstitution; recycleRelaxation w;`, and the page says
  at the top of each half which one it is in.  Every claim about the engine
  carries the file and line that makes it true.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const RELAXATION_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A recycle is a fixed-point problem, and a fixed point is iterated",
    body: "A recycle has no first unit, so a sequential simulator cuts one "
      + "stream, guesses it, runs the plant once and looks at what comes "
      + "back. The plant is a function: you hand it the guess and it hands "
      + "you a stream. The answer is the stream that comes back unchanged. "
      + "Handing the returned stream straight back in as the next guess is "
      + "direct substitution, the simplest iteration there is. Whether it "
      + "works depends on one number: how much of a mistake in the guess "
      + "survives a trip round the loop. If less than all of it does, the "
      + "mistake shrinks every pass; if more, it grows.",
    derivation: [
      { step: "Call the guess x and one trip through the plant G. The answer "
          + "x* is the guess that returns itself.",
        eq: String.raw`x^{*} = G\!\left(x^{*}\right)`},
      { step: "Write the guess as the answer plus a mistake u, and keep only "
          + "the first-order term of G (exact when the loop is linear). The "
          + "slope of G is the loop gain a.",
        eq: String.raw`G(x^{*} + u) \approx x^{*} + a\,u`},
      { step: "Direct substitution hands G(x) back as the next guess, so the "
          + "mistake after one pass is the gain times the mistake before. "
          + "Each pass multiplies the mistake by a.",
        eq: String.raw`u_{k+1} = a\,u_{k} \quad\Rightarrow\quad u_{k} = a^{k}\,u_{0}`},
    ],
    formula: String.raw`u_{k+1} = a\,u_{k} \qquad \text{converges} \iff |a| < 1`,
    where: [
      { sym: "x", means: "the guess for the cut stream (here a single number)" },
      { sym: "G", means: "one trip through the plant: the function that turns "
        + "the guess into the stream that comes back" },
      { sym: "x^{*}", means: "the answer: the guess that comes back unchanged" },
      { sym: "u", means: "the mistake, x minus x*; the iteration is finished "
        + "when it is zero" },
      { sym: "u_{k} \\,/\\, u_{k+1}", means: "the mistake after pass k, and after the "
        + "next pass" },
      { sym: "a", means: "the loop gain, the slope of G at the answer: the "
        + "fraction of a mistake that survives one trip round the loop" },
      { sym: "k", means: "the pass number: the count of full trips round the "
        + "recycle so far" },
    ],
    note: "A positive gain makes the mistake approach zero from one side; a "
      + "negative gain makes it overshoot and alternate in sign. The first "
      + "figure draws both as a staircase between the curve y = G(x) and the "
      + "diagonal y = x.",
  },
  {
    n: 2,
    title: "Relaxation: take only part of the step",
    body: "If the loop overshoots, do not go all the way to what the plant "
      + "returned. Go a fraction w of the way from the old guess toward the "
      + "returned one. That is under-relaxation, and w is the relaxation "
      + "factor: w = 1 is direct substitution, w = 0.5 is the average of old "
      + "guess and new, w close to 0 hardly moves. It is the same iteration "
      + "as before on a different map, H(x) = (1 - w) x + w G(x), and that "
      + "map has its own slope. Everything about relaxation follows from "
      + "that slope.",
    derivation: [
      { step: "Move a fraction w of the way from the old guess to the "
          + "returned stream.",
        eq: String.raw`x_{k+1} = (1 - w)\,x_{k} + w\,G(x_{k})`},
      { step: "In terms of the mistake u this is the same mix of the old "
          + "mistake and its image a u.",
        eq: String.raw`u_{k+1} = (1 - w)\,u_{k} + w\,a\,u_{k}`},
      { step: "Collect the terms: the relaxed iteration multiplies the "
          + "mistake by an effective slope, which is the loop gain "
          + "pulled toward 1.",
        eq: String.raw`u_{k+1} = a_{\mathrm{eff}}\,u_{k}, \qquad a_{\mathrm{eff}} = 1 - w + w\,a`},
    ],
    formula: String.raw`a_{\mathrm{eff}} = 1 - w + w\,a \qquad \text{converges} \iff \left|a_{\mathrm{eff}}\right| < 1`,
    where: [
      { sym: "x_{k} \\,/\\, x_{k+1}", means: "the guess on pass k, and the guess "
        + "handed in on the next pass" },
      { sym: "w", means: "the relaxation factor: the fraction of the way to "
        + "the returned stream that is actually taken (dimensionless)" },
      { sym: "a_{\\mathrm{eff}}", means: "the effective slope of the relaxed "
        + "iteration: the factor by which each pass multiplies the mistake" },
    ],
    note: "Move the slider w in the first figure and watch the second line "
      + "(the effective slope) swing away from the first (the gain): the "
      + "staircase follows the second.",
  },
  {
    n: 3,
    title: "What a factor can do, and what no factor can",
    body: "Put the convergence condition |1 - w + w a| < 1 to work. For a "
      + "loop that overshoots wildly (a below -1) direct substitution "
      + "diverges, but a small enough w pulls the effective slope back "
      + "inside (-1, 1): relaxation rescues it. For a loop whose gain is "
      + "above 1 the mistake grows every pass without changing sign, and "
      + "no w between 0 and 1 helps: the effective slope 1 + w (a - 1) is "
      + "never below 1. A runaway loop is not a numerical problem a damping "
      + "factor can fix; it says the plant, as specified, has no stable "
      + "fixed point to walk to by substitution, and a different method (or "
      + "a different specification) is needed.",
    derivation: [
      { step: "For a gain below 1, rewrite the effective slope so the "
          + "factor appears alone. It stays above -1 exactly when w is "
          + "smaller than 2 over 1 - a.",
        eq: String.raw`a_{\mathrm{eff}} = 1 - w\,(1 - a) \;>\; -1 \iff w < \frac{2}{1 - a}`},
      { step: "For a gain of 1 or more and any positive w the product "
          + "w (1 - a) is zero or negative, so the effective slope is at "
          + "least 1: there is no positive w that contracts.",
        eq: String.raw`a \ge 1,\ w > 0 \;\Rightarrow\; a_{\mathrm{eff}} = 1 + w\,(a - 1) \;\ge\; 1`},
      { step: "A negative factor is a different matter: for a > 1 it reverses "
          + "the step, and w = 1/(1 - a) < 0 makes the effective slope zero "
          + "(a = 2, w = -1: a_eff = 0). That reversed step is what "
          + "Wegstein's q = 1 - w > 1 does, and what the recycle clamp "
          + "refuses (next page, step 6). Only a = 1 has no factor at all.",
        eq: String.raw`a > 1:\ \ w = \frac{1}{1 - a} < 0 \;\Rightarrow\; a_{\mathrm{eff}} = 0`},
    ],
    formula: String.raw`a < 1:\ \ 0 < w < \frac{2}{1 - a} \qquad\qquad a \ge 1:\ \ \text{no } w > 0 \text{ converges}`,
    where: [],
    note: "The third figure draws exactly this: the (a, w) plane, the band "
      + "where the iteration contracts, and the region a > 1 shaded because "
      + "no positive w converges there (the figure draws only w > 0).",
  },
  {
    n: 4,
    title: "The best factor, for a linear loop",
    body: "The smaller the effective slope in magnitude, the faster the "
      + "mistake dies. The best possible slope is zero, which kills the "
      + "mistake in a single pass. Set the effective slope to zero and solve "
      + "for w. For a gain between 0 and 1 the answer is a factor above 1 -- "
      + "an over-relaxation, stepping further than the plant asked -- which "
      + "is the opposite of damping. That is what Wegstein finds by itself, "
      + "and why the engine's fixed factor stops at 1.",
    derivation: [
      { step: "Ask for an effective slope of zero.",
        eq: String.raw`1 - w + w\,a = 0`},
      { step: "Solve for the factor. It is at most 1 only when the gain is "
          + "zero or negative.",
        eq: String.raw`w_{\mathrm{opt}} = \frac{1}{1 - a}`},
    ],
    formula: String.raw`w_{\mathrm{opt}} = \frac{1}{1 - a} \qquad\qquad w_{\mathrm{opt}} \le 1 \iff a \le 0 \ (\text{for } a < 1)`,
    where: [
      { sym: "w_{\\mathrm{opt}}", means: "the optimal relaxation factor for a "
        + "linear loop: the one that makes the effective slope zero, so the "
        + "answer is reached in one pass" },
    ],
    note: "On a real plant the loop is not linear and its gain is unknown "
      + "until the iteration has run, so the optimal factor can only be "
      + "estimated -- which is the next step.",
  },
  {
    n: 5,
    title: "Wegstein is relaxation with a factor it works out for itself",
    body: "Wegstein's update is q x + (1 - q) G(x). Compare it with step 2: "
      + "it is the same formula with q = 1 - w. Wegstein measures the loop "
      + "gain from the last two guesses (a secant slope) and picks q so "
      + "that the effective slope is zero, per variable. On the linear toy "
      + "the measured slope is a exactly, so the unclamped q is a/(a - 1) "
      + "and the factor it implies is 1/(1 - a): the optimal w of step 4, "
      + "found without being told a. The engine then clamps q to a range "
      + "(by default -1 to 0, i.e. w between 1 and 2), so Wegstein "
      + "never under-relaxes unless the case widens the clamp. Wegstein, "
      + "J. H. (1958), Comm. ACM 1(6), 9-13, is where it comes from, and "
      + "it is a classic recycle accelerator of sequential-modular "
      + "simulators (Choupo's own default is Newton).",
    derivation: [
      { step: "Wegstein's update, in the engine's own symbols "
          + "(src/solver/Wegstein.cpp:51-96).",
        eq: String.raw`x_{k+1} = q\,x_{k} + (1 - q)\,G(x_{k})`},
      { step: "Match it to step 2: the weight on G is w, so the weight on "
          + "the old guess, q, is 1 - w.",
        eq: String.raw`w = 1 - q`},
      { step: "The secant slope s from the last two guesses is the gain a "
          + "on a linear loop, and the choice that zeroes the effective "
          + "slope gives q = s/(s - 1).",
        eq: String.raw`q = \frac{s}{s - 1} \;\Rightarrow\; w = \frac{1}{1 - s}`},
    ],
    formula: String.raw`w = 1 - q \qquad q = \frac{s}{s - 1} \qquad w = \frac{1}{1 - s}`,
    where: [
      { sym: "q", means: "Wegstein's coefficient: the weight kept on the old "
        + "guess; q = 0 is direct substitution, q = -1 a step twice as long "
        + "(clamped to the recycle's [qmin, qmax])" },
      { sym: "s", means: "the secant slope: the change in what the plant "
        + "returned divided by the change in what was guessed, over the "
        + "last two passes; it estimates the loop gain a" },
    ],
    note: "The Wegstein page, next on this path, shows the same coefficient "
      + "per variable on a recycle that holds a flow and a temperature at "
      + "once.",
    leadsTo: {
      tool: "wegstein",
      toolLabel: "Wegstein acceleration (closing a recycle)",
      stepTitle: "Wegstein: two points make a line",
      body: "Wegstein's q as a place on a drawing: the secant through the "
        + "last two guesses meets the diagonal at the next iterate.",
    },
  },
  {
    n: 6,
    title: "Newton, and why a fixed factor is the wrong default for it",
    body: "Newton's method uses the whole slope: for the residual "
      + "r(x) = G(x) - x it steps by minus r over its slope. On the linear "
      + "toy that lands on the answer in one pass for any gain except 1. "
      + "In a real problem the slope is only a local model, and the full "
      + "step can overshoot. The cure is not a fixed factor: that would "
      + "slow every step, including the many that are fine. A line search "
      + "tries the full step and shortens it only if the residual does not "
      + "fall enough (Armijo's rule), so the damping adapts to each "
      + "iterate. Choupo's Newton uses it "
      + "(src/solver/NewtonND.cpp:619, enabled for the tear loop at "
      + "src/unitOperations/flowsheet/Flowsheet.cpp:4039). What a user "
      + "may legitimately tune is a step cap: no unknown moves more than a "
      + "stated amount in one step, which limits damage without slowing "
      + "the good steps -- `recycleMaxStep` for the tear "
      + "(src/unitOperations/flowsheet/Flowsheet.cpp:4041-4059).",
    derivation: [
      { step: "Newton's step for the tear residual r(x) = G(x) - x, whose "
          + "slope is a - 1 on the toy.",
        eq: String.raw`u_{k+1} = u_{k} - \frac{r(u_{k})}{a - 1} = 0`},
      { step: "A line search shortens the step by a factor alpha between 0 "
          + "and 1, chosen each iteration; a fixed factor w would instead "
          + "apply the same alpha always.",
        eq: String.raw`x_{k+1} = x_{k} + \alpha_{k}\,\Delta x_{k}, \qquad 0 < \alpha_{k} \le 1`},
    ],
    formula: String.raw`x_{k+1} = x_{k} + \alpha_{k}\,\Delta x_{k}`,
    where: [
      { sym: "r", means: "the tear residual G(x) - x: how far what comes back "
        + "is from what was guessed" },
      { sym: "\\alpha_{k}", means: "the line-search factor of pass k: "
        + "1 when the full Newton step is accepted, smaller when it had to "
        + "be shortened; chosen by the search, not by the user" },
      { sym: "\\Delta x_{k}", means: "the full Newton step at pass k, before "
        + "any shortening" },
    ],
    note: "The engine run in step 9 can show the cap: `recycleMaxStep` is "
      + "declared in system/solverDict and announced in the run log.",
  },
  {
    n: 7,
    title: "Why CFD codes need a fixed factor and a flowsheet's unit does not",
    body: "If you have used OpenFOAM or another CFD code, you set "
      + "`relaxationFactors` for pressure and velocity. Those solvers are "
      + "segregated: they solve one equation at a time, holding the others "
      + "frozen, and sweep until the frozen values stop changing (the SIMPLE "
      + "algorithm and its relatives). That outer sweep is a fixed-point iteration, "
      + "exactly like a recycle, and its gain is often above the safe "
      + "range -- so a fixed under-relaxation factor, typically 0.3 for "
      + "pressure and 0.7 for velocity, is the standard cure. A "
      + "sequential-modular flowsheet's tear loop is the same kind of "
      + "problem, and that is why Choupo now offers `recycleRelaxation` "
      + "there. A unit's own equations are, in the main, solved coupled by "
      + "Newton with a line search (a few units use another solver, such "
      + "as Rachford-Rice or the Wang-Henke bubble-point column), so a fixed "
      + "factor on them would only slow it.",
    note: "So the three rungs on the tear loop read: relaxation (a factor "
      + "you set), Wegstein (a factor it works out), Newton (the whole "
      + "slope, with a line search).",
  },
  {
    n: 8,
    title: "How hard should the inside be solved? Inexact inner solves (relTol and Final)",
    body: "Whenever one solve sits inside another, the inner one only needs "
      + "the precision the outer one can use at that moment. Early in the "
      + "outer iteration the outer guess is still far from its answer, so "
      + "solving the inside to full precision is work the next outer step "
      + "throws away. The remedy is to tie the inner tolerance to the outer "
      + "residual and to solve to full tolerance only on the last pass. For "
      + "Newton's method this is the inexact-Newton idea: the linear "
      + "system of each step is solved only until its own residual is a "
      + "chosen fraction eta of the outer residual (the forcing term), and "
      + "the convergence rate follows how eta is chosen (Dembo, Eisenstat "
      + "and Steihaug 1982; Eisenstat and Walker 1996, who give rules for "
      + "choosing it). OpenFOAM users know the same trade as `relTol` on "
      + "the intermediate correctors of a time step and `pFinal` with "
      + "`relTol 0` on the last. "
      + "A measured case in Choupo is the rate-based packed segment. Its "
      + "outer fixed point freezes the film coefficients, solves the "
      + "segment rows by Newton, and re-evaluates the coefficients. The "
      + "inner Newton now stops at the larger of the full tolerance and "
      + "1e-3 times the last coefficient change "
      + "(RateBasedSegment.cpp:653), never looser than 1e-6 "
      + "(RateBasedSegment.cpp:654); the tolerance is set at "
      + "RateBasedSegment.cpp:728, the flag that says this pass is at the "
      + "full tolerance at RateBasedSegment.cpp:729, and the outer loop "
      + "ends only on such a pass (RateBasedSegment.cpp:780). "
      + "The measurement is dated, not live: on commit ad528a8c48 the four "
      + "cases ratebased01 to ratebased04 went from 1632 to 1216 inner "
      + "Newton iterations (321 to 239, 407 to 309, 378 to 278, 526 to "
      + "390), the printed sweep tables were identical to six digits, and "
      + "the largest relative change in any printed number was 1.0e-10 "
      + "(recorded in that commit's message; the page recomputes none of "
      + "it). "
      + "The trap is the Jacobian. A finite-difference Jacobian divides a "
      + "difference of two residuals by a small step h, so noise of size "
      + "epsilon in the residual becomes an error of epsilon over h in the "
      + "slope. Choupo's tear Newton builds its Jacobian that way, with "
      + "h of order the square root of machine precision times the "
      + "unknown's scale (NewtonND.cpp:163, called at NewtonND.cpp:769, "
      + "for the tear at Flowsheet.cpp:4129). An inner solve left loose "
      + "is therefore safe on a step that only advances but spoils a step "
      + "that measures the Jacobian: the inner tolerance must be well "
      + "below h there. Wegstein and direct substitution form no "
      + "Jacobian and are far less sensitive to it. "
      + "The same scheme one level up, in the recycle loops of whole "
      + "plants, is not built in Choupo: those loops evaluate every unit "
      + "at its own fixed tolerance. It was measured instead, on six "
      + "plants (docs/audits/2026-11-24-recycle-inner-solves.md; dated, "
      + "not live): a tolerance 100 times looser in every unit would "
      + "remove 0.9 % of the wall time on the two green-ammonia plants "
      + "and at most 24 % on the others, and on the acetic plant it "
      + "removed one column Newton iteration of six. The reason is the "
      + "lesson: a column restarts from a cold seed at every recycle "
      + "iteration, and its iterations are spent travelling from the seed "
      + "to the answer, which no tolerance shortens; the ammonia plants "
      + "spend 92-93 % of their time in a reactor integrated with a fixed "
      + "number of steps, whose cost is set by that count, not by a "
      + "tolerance. The same idea "
      + "applied to that step count (a quarter of the steps on every pass "
      + "but the last) took the reference plant from 20.4 s to 5.2 s with "
      + "a 1e-8 change in the result, but the tears then converge to the "
      + "coarse model's fixed point, it was tried on one plant whose beds "
      + "sit near equilibrium; Choupo still runs every pass on the full "
      + "step count. An inexact inner solve "
      + "pays where the inner work is converging, not where it is "
      + "travelling.",
    derivation: [
      { step: "Inexact Newton (Dembo, Eisenstat and Steihaug 1982): the "
          + "step s_k need only make the linearised residual a fraction "
          + "eta_k of the nonlinear one, the forcing term.",
        eq: String.raw`\lVert F(x_{k}) + J_{k}\,s_{k} \rVert \le \eta_{k}\,\lVert F(x_{k}) \rVert`},
      { step: "The engine's rule for a nested fixed point, with the "
          + "previous outer change c as the size of the outer residual.",
        eq: String.raw`\tau_{k} = \min\!\bigl(\tau_{\mathrm{cap}},\ \max(\tau_{\mathrm{full}},\ \eta\,c_{k-1})\bigr)`},
      { step: "The trap: a central difference with step h turns residual "
          + "noise epsilon into a Jacobian error of order epsilon over h.",
        eq: String.raw`\delta J \approx \frac{\varepsilon}{h}, \qquad h = \sqrt{\epsilon_{\mathrm{mach}}}\,\max\!\left(\lvert x_{j} \rvert,\ s_{j}\right)`},
    ],
    formula: String.raw`\tau_{k} = \min\!\bigl(\tau_{\mathrm{cap}},\ \max(\tau_{\mathrm{full}},\ \eta\,c_{k-1})\bigr)`,
    where: [
      { sym: "F", means: "the outer residual vector whose root is sought" },
      { sym: "x_{k}", means: "the outer unknowns at pass k" },
      { sym: "J_{k}", means: "the Jacobian of F at \\(x_k\\)" },
      { sym: "s_{k}", means: "the (inexact) Newton step taken at pass k" },
      { sym: "\\eta_{k}", means: "the forcing term: the fraction of the outer "
        + "residual the inner solve is asked to remove (dimensionless)" },
      { sym: "\\tau_{k}", means: "the tolerance the inner solve of pass k "
        + "is stopped at" },
      { sym: "\\tau_{\\mathrm{cap}}", means: "the loosest tolerance ever "
        + "used (1e-6 in the rate-based segment)" },
      { sym: "\\tau_{\\mathrm{full}}", means: "the full tolerance, used on "
        + "the pass that may end the outer loop (1e-11 in the "
        + "rate-based segment)" },
      { sym: "\\eta", means: "the factor tying the inner tolerance to the "
        + "outer change (1e-3 in the rate-based segment)" },
      { sym: "c_{k-1}", means: "the relative change of the outer "
        + "unknowns on the previous pass" },
      { sym: "\\delta J", means: "the error of a finite-difference "
        + "Jacobian entry" },
      { sym: "\\varepsilon", means: "the noise in the residual, here the "
        + "inner solve's leftover error" },
      { sym: "h", means: "the finite-difference step" },
      { sym: "\\epsilon_{\\mathrm{mach}}", means: "machine precision, about "
        + "2.2e-16 in double precision" },
      { sym: "x_{j}", means: "the unknown being perturbed" },
      { sym: "s_{j}", means: "that unknown's declared scale" },
    ],
    note: "The slider below the card runs the same idea on the toy loop of "
      + "the first figure: the inner solve gains one decade of accuracy "
      + "per inner iteration, an assumption of the toy and not a Choupo "
      + "number.",
  },
  {
    n: 9,
    title: "In Choupo: the knobs, and a real recycle",
    body: "In a case's system/solverDict, `recycleSolver "
      + "directSubstitution;` selects plain substitution and "
      + "`recycleRelaxation w;` (0 < w <= 1, default 1) relaxes it; "
      + "`recycleSolver Wegstein;` with `recycleWegsteinQmin/Qmax` clamps "
      + "the factor Wegstein chooses; the default `recycleSolver Newton;` "
      + "takes an optional `recycleMaxStep`. A declared value is "
      + "announced in the run log (a non-default Wegstein clamp too); a value outside its range, a "
      + "clamp with `recycleWegsteinQmin` above `recycleWegsteinQmax` "
      + "(src/unitOperations/flowsheet/Flowsheet.cpp:3655-3666), or a "
      + "relaxation factor beside a solver that has none, is refused by "
      + "name (src/unitOperations/flowsheet/Flowsheet.cpp:3497-3515). The "
      + "fourth figure runs the real process03_recycle case under "
      + "directSubstitution for three values of w and plots the engine's "
      + "own tear mass imbalance per pass: the same fixed point, three "
      + "different paths to it.",
    note: "The relaxed update the engine applies is "
      + "src/unitOperations/flowsheet/Flowsheet.cpp:3819-3824.",
  },
];

export const RELAXATION_LIMITS: readonly LessonLimit[] = [
  {
    id: "toy",
    title: "The first three figures are a one-variable linear toy",
    body: "A real recycle has many tear variables, a nonlinear G and a "
      + "gain that changes as the iteration moves. The toy shows the "
      + "mechanism exactly; it does not predict a real plant's iteration "
      + "count. The fourth figure is the real engine.",
  },
  {
    id: "gain-unknown",
    title: "On a real plant you do not know the gain",
    body: "The optimal w of step 4 needs a. A real loop only reveals it "
      + "through the iteration (which is what Wegstein exploits), and with "
      + "several coupled variables there is no single a: the iteration "
      + "matrix has several eigenvalues and the slowest one governs.",
  },
  {
    id: "engine-w",
    title: "The engine's factor stops at 1",
    body: "recycleRelaxation is refused outside (0, 1]. Over-relaxation "
      + "(w above 1, the strip marked in the third figure) is what an "
      + "unclamped Wegstein does by itself; the key does not offer it.",
  },
];

export const RELAXATION_QUIZ: readonly QuizQuestion[] = [
  {
    id: "mistake-shrinks", steps: [1],
    q: "Direct substitution is run on a recycle.  What decides whether the "
      + "mistake in the guess shrinks from pass to pass?",
    options: [
      "How good the first guess was",
      "The loop gain: the fraction of a mistake that survives one trip round the loop",
      "How many units are inside the recycle loop",
      "Whether the recycle is solved before or after the flash units",
    ],
    correct: 1,
    feedback: "Each pass multiplies the mistake by the loop gain a, so it "
      + "shrinks when |a| < 1 and grows otherwise, whatever the starting "
      + "guess (step 1).  A better guess only shortens the path.",
  },
  {
    id: "runaway", steps: [2, 3],
    q: "A loop has a gain above 1, so its mistake grows every pass.  Does "
      + "choosing a relaxation factor between 0 and 1 rescue it?",
    options: [
      "Yes, a small enough factor always damps any loop",
      "Yes, but only if the factor is taken very close to 1",
      "No: the effective slope 1 + w (a - 1) is never below 1 for a positive w",
      "No, because relaxation only works on a loop that is already converging",
    ],
    correct: 2,
    feedback: "Relaxation pulls the effective slope toward 1, so it can "
      + "rescue a gain below -1 (an overshooting loop) but never a gain "
      + "above 1: substitution cannot settle that loop at all "
      + "(steps 2 and 3).",
  },
  {
    id: "wegstein", steps: [4, 5],
    q: "What does Wegstein do that a fixed relaxation factor does not?",
    options: [
      "It always under-relaxes more strongly than a user would",
      "It replaces the plant by a linear model solved exactly",
      "It uses the whole slope of the residual with a line search",
      "It estimates the loop gain from the last two guesses and picks the factor itself",
    ],
    correct: 3,
    feedback: "Wegstein is relaxation with w = 1 - q, where q comes from "
      + "the secant slope of the last two iterates, so it finds the optimal "
      + "factor 1/(1 - a) without being told a (steps 4 and 5).  Newton "
      + "with a line search is a different rung (step 6).",
  },
  {
    id: "newton-damping", steps: [6, 7],
    q: "Why is a fixed damping factor a poor default for a unit solved by "
      + "Newton, while a CFD pressure-velocity sweep needs one?",
    options: [
      "Newton uses the whole slope and a line search shortens only the steps that need it; a segregated sweep keeps the single factor it was given",
      "Newton never overshoots, so damping would never be needed",
      "A CFD code is nonlinear and a flowsheet unit is linear",
      "A fixed factor makes Newton diverge on every problem",
    ],
    correct: 0,
    feedback: "A fixed factor slows every step, including the many that "
      + "are fine; Newton's line search shortens a step only when the "
      + "residual does not fall enough.  Segregated solvers sweep with "
      + "frozen values and rely on a fixed factor for stability (steps 6 "
      + "and 7).",
  },
];
