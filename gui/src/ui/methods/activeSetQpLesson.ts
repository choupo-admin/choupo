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
  The active-set QP lesson, as DATA, so the arithmetic it claims can be
  recomputed against the tool's own `activeSetQpMath` in
  tests/activeSetQpLesson.test.ts — a page must not teach against its own
  code.

  THE SPINE.  A quadratic objective under linear constraints is the one
  non-trivial optimisation problem that can be solved EXACTLY in a finite
  number of steps, and the reason is a single observation: if you knew which
  constraints were tight at the answer, the rest would be a linear system.
  The active-set method is the search for that list.  Everything on the page
  — the working set, the blocking step, the negative multiplier, the finite
  termination — follows from it.

  THE SECOND SPINE, which is what makes it a chemical-engineering page rather
  than a numerical-methods one: the LAGRANGE MULTIPLIER IS A PRICE.  Choupo's
  laboratory-analysis reconciliation publishes each law's multiplier as the
  number of standard deviations that law is responsible for moving each
  measurement, and the parts sum to the whole with no residue, because the
  decomposition is the KKT stationarity condition itself.  A student who
  leaves this page believing the multiplier is bookkeeping has missed it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const QP_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The problem, and why this shape is worth a method of its own",
    body: "A quadratic objective and linear constraints. It is worth a method "
      + "of its own for two reasons. First, it is solvable exactly: unlike a "
      + "general non-linear programme, a convex QP is finished in a finite "
      + "number of steps with no tolerance to argue about. Second, it is the "
      + "inner problem of the general case — an SQP method builds a quadratic "
      + "model of a hard non-linear problem at the current point and solves "
      + "exactly this to decide where to go next, over and over.",
    derivation: [
      { step: "The objective. B is symmetric and positive definite, which is "
          + "what makes the problem CONVEX: there is one minimum, and a "
          + "local answer is the global one.",
        eq: String.raw`\min\ \tfrac{1}{2} d' B d + g' d`},
      { step: "The constraints, both written so that satisfied means the "
          + "left-hand side is at most zero. Writing them all one way saves "
          + "a reader remembering which side each was stated on.",
        eq: String.raw`A_\mathrm{eq}\, d + b_\mathrm{eq} = 0 \qquad A_\mathrm{in}\, d + b_\mathrm{in} \le 0`},
      { step: "Without any constraints the answer is one linear solve: set "
          + "the gradient to zero.",
        eq: String.raw`B d + g = 0`},
    ],
    formula: String.raw`\begin{aligned}
\min\ & \tfrac{1}{2} d' B d + g' d\\
\text{s.t.}\ & A_\mathrm{eq}\, d + b_\mathrm{eq} = 0, \qquad A_\mathrm{in}\, d + b_\mathrm{in} \le 0
\end{aligned}`,
    where: [
      { sym: "d", means: "the unknown — the vector being chosen. Called d "
        + "because in an SQP method it is a STEP away from the current point" },
      { sym: "B", means: "the HESSIAN of the objective: symmetric and "
        + "positive definite, so the contours are nested ellipsoids and there "
        + "is exactly one minimum" },
      { sym: "g", means: "the linear part of the objective — the gradient at "
        + "the origin. The unconstrained minimum sits where B d = -g" },
      { sym: "A_\\mathrm{eq}", means: "the coefficient rows of the equality "
        + "constraints, one row per law that must hold exactly" },
      { sym: "b_\\mathrm{eq}",
        means: "the constant of each equality row: how far from "
        + "satisfied it is at the origin" },
      { sym: "A_\\mathrm{in}", means: "the coefficient rows of the inequality "
        + "constraints — the ones that may or may not be tight at the answer" },
      { sym: "b_\\mathrm{in}", means: "the constant of each inequality row" },
    ],
    note: "Choupo's solver is Nocedal & Wright, Numerical Optimization 2nd "
      + "ed. (2006), Algorithm 16.3 — a published, public-domain method, "
      + "written out from the book rather than ported from anyone's code, in "
      + "src/solver/ActiveSetQP.cpp.",
  },
  {
    n: 2,
    title: "The one idea: if you knew which constraints were tight, you would be done",
    body: "Equality constraints are easy — they are always tight, so they can "
      + "be folded straight into the stationarity conditions and the answer "
      + "comes out of one linear system. Inequalities are hard for exactly "
      + "one reason: you do not know in advance which of them the answer will "
      + "be pressed against. But suppose someone told you. Then every tight "
      + "one is an equality, every slack one can be ignored, and the whole "
      + "problem collapses to the easy case. The active-set method is a "
      + "search for that list, and the list is called the WORKING SET.",
    derivation: [
      { step: "Guess a working set W — the equality rows, which are always "
          + "in it, plus a guess at which inequalities are tight." },
      { step: "Solve the equality-constrained problem over W. Stationarity "
          + "plus the rows themselves is one symmetric linear system, the "
          + "KKT system (N&W eq. 16.4).",
        eq: String.raw`\begin{bmatrix} B & A_W' \\ A_W & 0 \end{bmatrix}
\begin{bmatrix} p \\ \lambda \end{bmatrix}
= \begin{bmatrix} -\mathrm{grad} \\ -c_W \end{bmatrix}`},
      { step: "Then ask the two questions that can tell you the guess was "
          + "wrong: did the step run into a constraint that was NOT in W, "
          + "and does any constraint in W want to be released?" },
    ],
    formula: String.raw`\begin{bmatrix} B & A_W' \\ A_W & 0 \end{bmatrix}
\begin{bmatrix} p \\ \lambda \end{bmatrix}
= \begin{bmatrix} -\mathrm{grad} \\ -c_W \end{bmatrix}`,
    where: [
      { sym: "W", means: "the WORKING SET: the constraints currently being "
        + "treated as equalities — every equality row, plus the inequality "
        + "rows guessed to be tight" },
      { sym: "A_W", means: "the coefficient rows of the working set, stacked" },
      { sym: "p", means: "the step this system proposes, from the current "
        + "point, staying on every working-set constraint" },
      { sym: "\\lambda", means: "the LAGRANGE MULTIPLIER of each working-set "
        + "row: how hard that constraint is pushing back" },
      { sym: "\\mathrm{grad}",
        means: "the gradient of the objective at the current "
        + "point, B x + g" },
      { sym: "c_W", means: "how far each working-set row is from satisfied at "
        + "the current point — zero once the point is on it" },
    ],
  },
  {
    n: 3,
    title: "Adding a constraint: walk until something stops you",
    body: "If the proposed step is not zero, take it — but only as far as you "
      + "may. Every inequality outside the working set is a wall; the step "
      + "may run into one. So compute, for each of them, the fraction of the "
      + "step at which it would be reached, take the smallest such fraction "
      + "(capped at the whole step), move that far, and add the constraint "
      + "you just landed on to the working set. Next iteration it is an "
      + "equality like any other.",
    derivation: [
      { step: "A constraint outside W only matters if the step is moving "
          + "TOWARDS it: the row's value must be increasing along p.",
        eq: String.raw`\mathrm{slope}_k = a_k \cdot p > 0`},
      { step: "Then the fraction at which its value reaches zero is its "
          + "current value divided by that slope, negated. N&W eq. 16.41.",
        eq: String.raw`\alpha_k = -\frac{a_k \cdot x + b_k}{\mathrm{slope}_k}`},
      { step: "Take the smallest, capped at a whole step, move, and if "
          + "something blocked, add it.",
        eq: String.raw`\alpha = \min\left( 1,\ \text{smallest } \alpha_k \text{ over the blocking rows} \right)`},
    ],
    formula: String.raw`\begin{aligned}
\mathrm{slope}_k &= a_k \cdot p &\qquad \alpha_k &= -\frac{a_k \cdot x + b_k}{\mathrm{slope}_k}\\[4pt]
\alpha &= \min\left( 1,\ \min_{\text{blocking } k} \alpha_k \right)
\end{aligned}`,
    where: [
      { sym: "a_k", means: "the coefficient row of inequality k" },
      { sym: "\\mathrm{slope}_k",
        means: "how fast row k's value rises along the "
        + "proposed step. Positive means the step is moving towards that "
        + "wall; zero or negative means it cannot block" },
      { sym: "\\alpha_k",
        means: "the fraction of the step at which row k would "
        + "be reached exactly. The smallest of these over all rows is what "
        + "the step is cut down to" },
      { sym: "b_k", means: "the constant of inequality k" },
      { sym: "x", means: "the current point — the running total of the steps "
        + "taken so far, which starts at the origin" },
      { sym: "\\alpha", means: "the fraction of the proposed step actually "
        + "taken: 1 when nothing is in the way, less when something is" },
    ],
    note: "Choupo keeps a running point starting at zero and solves each KKT "
      + "system for a SUB-STEP from wherever it is, rather than re-solving "
      + "the whole problem each time — so the picture below is a path, and "
      + "each segment is one of these steps.",
  },
  {
    n: 4,
    title: "Dropping a constraint: a negative multiplier is a constraint asking to leave",
    body: "The other way to be wrong is to hold a constraint that the answer "
      + "does not want. It shows up when the proposed step is ZERO: the "
      + "current point already minimises the objective over the current "
      + "working set, so if this is not the answer, the working set must be "
      + "wrong. The multipliers say which one. A multiplier is the price of "
      + "the constraint — how much the objective would improve if it were "
      + "relaxed — and for an inequality written as at most zero, a NEGATIVE "
      + "multiplier means the objective would improve by moving OFF the "
      + "bound, into the feasible interior. That constraint is not holding "
      + "the answer in; it is in the way. Drop the most negative one and "
      + "continue.",
    derivation: [
      { step: "The step over W came out zero, so this point is optimal FOR W. "
          + "The only remaining question is whether W is right.",
        eq: String.raw`p = 0`},
      { step: "Read the multipliers of the working-set INEQUALITIES. The "
          + "equalities' multipliers are unconstrained in sign — an equality "
          + "may push either way and is never dropped." },
      { step: "If every one is non-negative, the KKT conditions hold and this "
          + "is the answer.",
        eq: String.raw`\text{all } \lambda_k \ge 0 \quad \Rightarrow \quad \text{optimal}`},
      { step: "Otherwise drop the most negative and solve again with a "
          + "smaller working set. The objective strictly improves, which is "
          + "why this cannot go round for ever." },
    ],
    formula: String.raw`\begin{aligned}
p = 0 \ \text{ and all } \lambda_k \ge 0 \quad &\Rightarrow \quad \text{OPTIMAL}\\
p = 0 \ \text{ and some } \lambda_k < 0 \quad &\Rightarrow \quad \text{DROP the most negative}
\end{aligned}`,
    where: [
      { sym: "\\lambda_k",
        means: "the multiplier of working-set inequality k — "
        + "its price. Zero means the constraint is tight but costs nothing; "
        + "negative means it is in the way" },
    ],
  },
  {
    n: 5,
    title: "Why it terminates, and what would make it fail",
    body: "Each change of working set strictly reduces the objective, because "
      + "B is positive definite and the sub-problem over each working set has "
      + "a unique minimum. There are finitely many working sets. So the "
      + "method finishes — in exact arithmetic, in a finite number of steps, "
      + "with no tolerance to argue about. That is the payoff of strict "
      + "convexity, and it is why Choupo's SQP driver can afford to solve one "
      + "of these inside every outer iteration.",
    note: "Two things do go wrong and the engine names both. If two active "
      + "constraints have linearly dependent gradients the KKT matrix is "
      + "singular — an LICQ failure — and Choupo recovers by dropping the "
      + "most recently added inequality and forbidding it re-entering that "
      + "solve, which is what breaks the add-drop cycle two nearly parallel "
      + "constraints would otherwise form. And if the working-set changes "
      + "exceed their cap it ABORTS LOUDLY rather than spinning, because a "
      + "solver that quietly returns its last iterate has reported an answer "
      + "to a problem it did not solve.",
  },
  {
    n: 6,
    title: "Where a chemical engineer meets this, and why the multiplier is the point",
    body: "A laboratory sends you a water analysis. The calcium, the "
      + "chloride, the alkalinity and the total hardness each came off a "
      + "different instrument with its own uncertainty, and they do not "
      + "balance on charge — the sheet says the water carries about 0.78 % "
      + "more positive than negative, which no solution does. You cannot feed "
      + "that to an equilibrium calculation. So you must move the numbers, "
      + "and the question is which ones and by how much.",
    derivation: [
      { step: "Move each measurement as little as its own uncertainty says "
          + "is cheap: a chi-squared in standard deviations, so a precise "
          + "analyte is expensive to move and a loose one is cheap.",
        eq: String.raw`\min\ \sum_r \left( \frac{x_r - m_r}{\sigma_r} \right)^{\!2}`},
      { step: "Subject to the laws the case DECLARES it wants enforced: "
          + "charge balance, elemental conservation.",
        eq: String.raw`C x = t`},
      { step: "And subject to the one constraint nobody declares because it "
          + "is not optional: no negative concentrations.",
        eq: String.raw`x \ge 0`},
      { step: "That is a convex QP with B the identity in sigma units, and "
          + "Choupo hands it to the same active-set solver the SQP driver "
          + "uses." },
    ],
    formula: String.raw`\begin{aligned}
\min\ & \sum_r \left( \frac{x_r - m_r}{\sigma_r} \right)^{\!2}\\
\text{s.t.}\ & C x = t, \qquad x \ge 0
\end{aligned}`,
    where: [
      { sym: "\\sum_r", means: "a sum over every measured quantity on the "
        + "laboratory sheet" },
      { sym: "x_r", means: "the RECONCILED value of measured quantity r — "
        + "what the equilibrium is actually fed" },
      { sym: "m_r", means: "what the laboratory REPORTED for quantity r" },
      { sym: "\\sigma_r", means: "the declared standard uncertainty of that "
        + "measurement, in its own units. It is the weight, and it is why "
        + "the correction lands where it does" },
      { sym: "C", means: "the coefficient rows of the enforced conservation "
        + "laws — charge per mole for electroneutrality, atoms per mole for "
        + "elemental conservation" },
      { sym: "t", means: "what each law requires the corresponding total to "
        + "be — zero net charge, and the measured element total" },
    ],
    note: "The non-negativity rows are ordinary inequality rows in exactly "
      + "the machinery above, so a measurement pinned at zero is a working-set "
      + "member with a multiplier like any other.",
  },
  {
    n: 7,
    title: "The multiplier is a price, and here it is a number of standard deviations",
    body: "This is the part worth carrying away. Write the stationarity "
      + "condition of the reconciliation in sigma units and it says that each "
      + "row's total correction is a SUM of per-law parts, one per enforced "
      + "law, each of which is that law's multiplier times that law's "
      + "coefficient in that row. The parts add up to the whole with no "
      + "residue, because it is an identity and not an attribution scheme. So "
      + "when a student asks why their measured chloride moved, the answer is "
      + "arithmetic: electroneutrality moved it by this many standard "
      + "deviations, and here is the number.",
    derivation: [
      { step: "Work in sigma units, so the objective's Hessian is the "
          + "identity and the problem is perfectly scaled whatever the "
          + "analytes weigh.",
        eq: String.raw`u_r = \frac{x_r - m_r}{\sigma_r}`},
      { step: "Stationarity of the Lagrangian at the answer: the gradient of "
          + "the objective plus the constraint gradients times their "
          + "multipliers is zero.",
        eq: String.raw`u + C' \lambda + A_\mathrm{in}' \mu = 0`},
      { step: "Read off one row of it. Every term on the right is a genuine "
          + "part of an identity, and Choupo ASSERTS that they reconstruct "
          + "the correction before it publishes them.",
        eq: String.raw`u_r = -\sum_k \lambda_k\, C_{kr} + \mu_r`},
    ],
    formula: String.raw`u_r = -\sum_k \lambda_k\, C_{kr} + \mu_r`,
    where: [
      { sym: "u",
        means: "the vector of SCALED residuals, one per measurement: the gradient of "
        + "the objective in the scaled variables" },
      { sym: "u_r", means: "the correction to row r, in units of its own "
        + "standard uncertainty — the number the report publishes" },
      { sym: "\\sum_k", means: "a sum over every enforced conservation law" },
      { sym: "C_{kr}",
        means: "the coefficient of measured quantity r in law k" },
      { sym: "\\mu \\,/\\, \\mu_r",
        means: "the multiplier of a non-negativity bound — "
        + "mu_r is row r's. Zero unless that measurement was pinned at zero" },
    ],
    note: "It is an identity, not an attribution scheme, and that is the "
      + "difference worth carrying: a share is a story about a number and "
      + "this is arithmetic. Choupo asserts the decomposition reconstructs "
      + "the correction before returning it, in its own words, because a "
      + "published attribution that does not add up is worse than none.",
  },
];

export const QP_LIMITS: readonly LessonLimit[] = [
  {
    id: "picture-is-two-d",
    title: "Two variables have a picture; a real QP does not",
    body: "The drawing works because there are two unknowns, so the objective "
      + "is a set of circles and a constraint is a line. The reconciliation "
      + "below has four unknowns and three constraint families, and the SQP "
      + "driver's inner QP has one unknown per design variable. The METHOD is "
      + "identical — the same working set, the same blocking step, the same "
      + "negative multiplier — and only the picture stops working.",
  },
  {
    id: "transcription",
    title: "The path is recomputed here; the answer is the engine's",
    body: "Choupo returns the solution and the final active set. It does not "
      + "publish the SEQUENCE of working sets, which is the thing worth "
      + "watching, so the sequence above is recomputed by a transcription of "
      + "the engine's own loop, including its running-point formulation, its "
      + "two tolerances and its LICQ recovery. The anchor is that the engine "
      + "asserts the answer to the drawn problem to 1e-9 before every "
      + "constrained optimisation it runs, and the page prints the "
      + "comparison.",
  },
  {
    id: "no-sqp",
    title: "The outer SQP loop is not on this page",
    body: "Solving a hard non-linear problem means building the quadratic "
      + "model in the first place: a Hessian approximation updated by damped "
      + "BFGS, a merit function, a backtracking line search that decides how "
      + "much of the QP's step to accept. All of that surrounds the QP and "
      + "none of it is here. What is here is the inner problem every one of "
      + "those iterations has to solve exactly.",
  },
  {
    id: "reconciliation-is-not-chemistry",
    title: "Nothing in the reconciliation panel is a chemistry result",
    body: "Every number in it is a MEASUREMENT, or the distance a measurement "
      + "had to be moved to obtain a physically admissible inlet. The "
      + "chemistry that composition resolves to — the ions, the solved pH, "
      + "the phase split — is a separate layer computed afterwards, and the "
      + "engine keeps the two apart structurally: a corrected row always "
      + "carries the value the laboratory reported, corrections are quoted in "
      + "sigma, and the two use different key spaces. The arrow runs one way "
      + "only, analysis to reconciliation to equilibrium, and the "
      + "reconciler's own translation unit cannot even NAME the equilibrium "
      + "surface.",
  },
  {
    id: "convex-only",
    title: "Convex only — and that is a real restriction",
    body: "Everything above rests on B being positive definite: one minimum, "
      + "finite termination, a local answer that is the global one. A "
      + "quadratic with an indefinite Hessian has none of those properties "
      + "and needs a different method entirely. Choupo's caller guarantees "
      + "convexity rather than checking it, by building the Hessian with a "
      + "damped BFGS update that cannot lose it.",
  },
];
