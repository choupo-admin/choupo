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
  The Bayesian-optimisation lesson, as DATA (the house style of fugLesson.ts):
  steps with titles and glossed symbols, a LIMITS list, a quiz, and the
  references the card draws until it is plugged into the `optimizers` tool.

  THE ARGUMENT.  Bayesian optimisation is chosen for one reason -- an
  evaluation is expensive -- and the page is built to show both halves of that
  sentence: the picture where it wins (few evaluations, a global answer) and
  the pictures where it does not (cheap evaluations, a narrow feature, many
  variables).  The narrow-dip setting is the honest failure and is on screen,
  not in a footnote.

  NO CLAIM ABOUT THE ENGINE IS MADE EXCEPT THE ONE IN ENGINE_STATUS below.
  Every formula is from a source read for it (see README.md in this folder).
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "../lessonStep.js";
import type { QuizQuestion } from "../lessonQuiz.js";
export type { LessonStep, LessonLimit };

/** The sentence the card must show, whatever else changes. */
export const ENGINE_STATUS =
  "An opt-in Bayesian method was built in the engine and measured against "
  + "`sqp` under a rule written before the runs "
  + "(docs/audits/2026-11-24-c499-protocol.md): on the cheap problem it "
  + "reached 1 % of the best value in a median of 15 simulations against 25 "
  + "for `sqp`; on the expensive one (the reactive MTBE column) 23 against "
  + "22, so by the rule it is NOT offered and stays on its branch.  What you "
  + "see here is a one-variable teaching sketch run in your browser, not the "
  + "engine.";

export const BAYES_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "When one evaluation is the expensive thing",
    body: "An optimiser calls the simulator again and again.  When one call is "
      + "a full flowsheet solution that takes minutes or hours, the number of "
      + "calls, not the arithmetic inside the optimiser, is the cost.  A "
      + "gradient method spends calls on slopes: a finite-difference gradient "
      + "of \\(n\\) variables costs \\(2n\\) calls before it takes one step.  "
      + "Bayesian optimisation spends its own arithmetic to make every call "
      + "count: it keeps every result, fits a statistical model of the "
      + "function to them, and asks the model where the next call is most "
      + "likely to pay.  It needs no derivative, and it looks across the whole "
      + "interval, not only downhill from where it started.",
    formula: String.raw`\min_{x \in [0,1]} f(x)`,
    where: [
      { sym: "x", means: "The single decision variable of this card, scaled "
        + "to the interval 0 to 1.", unit: "dimensionless" },
      { sym: "f", means: "The expensive function to minimise: a black box, "
        + "known only by the values it returns when called.  On this page its "
        + "curve is drawn for you; the optimiser never sees it.",
        unit: "same as the objective" },
    ],
    note: "Both curves on the page are cheap to compute, so the card can draw "
      + "the truth beside the method.  In use the truth is exactly what you "
      + "do not have.",
  },
  {
    n: 2,
    title: "A Gaussian process says what the function might be",
    body: "Before any call, say nothing about \\(f\\) except how smooth it is.  "
      + "A Gaussian process does that with a covariance function: two inputs "
      + "close together are expected to have close outputs.  The squared-"
      + "exponential, or RBF, covariance has two numbers.  The length scale "
      + "\\(\\ell\\) is the distance over which the function forgets where it "
      + "was; the signal variance \\(\\sigma_f^2\\) sets how far it wanders "
      + "from its mean (held at 1 on this card).  Drag the length-scale "
      + "slider: a short \\(\\ell\\) allows a function that wiggles fast and "
      + "makes the model uncertain everywhere between points; a long one "
      + "insists on a smooth curve and is confident far from the data, which "
      + "is the danger on the narrow-dip setting.",
    formula: String.raw`k(x, x') = \sigma_f^2 \exp\!\left( -\frac{(x - x')^2}{2\,\ell^2} \right)`,
    where: [
      { sym: "k(x, x')", means: "The covariance of the function's values at "
        + "x and x': how strongly knowing one tells you the other.  It is "
        + "\\(\\sigma_f^2\\) when the two points coincide and falls toward "
        + "zero as they move apart.", unit: "same as f squared" },
      { sym: "x'", means: "A second input, the one the first is compared "
        + "with.", unit: "dimensionless" },
      { sym: "\\sigma_f^2", means: "The signal variance: the prior variance "
        + "of the function at any one point.", unit: "same as f squared" },
      { sym: "\\ell", means: "The length scale of the kernel.  It is a "
        + "modelling choice, set by a slider here; a real implementation "
        + "estimates it from the data, which this card does not.",
        unit: "dimensionless (x is scaled to 0..1)" },
    ],
    note: "Rasmussen & Williams give this covariance as eq. (2.31) with an "
      + "added noise term, and write the same kernel with a unit length scale "
      + "as eq. (2.16).  Choosing a kernel is choosing what kind of function "
      + "you are willing to believe in: the squared exponential believes in "
      + "infinitely smooth ones.",
  },
  {
    n: 3,
    title: "Conditioning on the calls already made",
    body: "Give the process the \\(n\\) values already returned and it answers, "
      + "at any new point, with a mean and a variance.  The mean is a weighted "
      + "sum of the observations (a linear predictor).  The variance starts "
      + "from the prior variance and subtracts what the observations have "
      + "taught: at a point that was evaluated it falls to the noise level, "
      + "and far from every point it returns to the prior.  The band drawn on "
      + "the card is the mean plus and minus 1.96 standard deviations, the "
      + "interval holding 95 % of a normal distribution.  The noise slider "
      + "is the variance \\(\\sigma_n^2\\) the model assumes the calls carry: "
      + "the function here is evaluated without noise, so it acts as the "
      + "model's allowance for being wrong, and it keeps the band from "
      + "closing to a point at the data.",
    formula: String.raw`\begin{aligned}
\bar f_* &= \mathbf{k}_*^{\top} \left( K + \sigma_n^2 I \right)^{-1} \mathbf{y}\\[4pt]
\mathbb{V}[f_*] &= k(x_*, x_*) - \mathbf{k}_*^{\top} \left( K + \sigma_n^2 I \right)^{-1} \mathbf{k}_*
\end{aligned}`,
    where: [
      { sym: "\\bar f_*", means: "The predictive mean at the new point: the "
        + "model's best guess of the function there.",
        unit: "same as f" },
      { sym: "x_*", means: "The new input at which the model is asked.",
        unit: "dimensionless" },
      { sym: "\\mathbf{k}_*", means: "The vector of covariances between the "
        + "new point and each of the \\(n\\) evaluated points.",
        unit: "same as f squared" },
      { sym: "K", means: "The n by n matrix of covariances between every pair "
        + "of evaluated points.", unit: "same as f squared" },
      { sym: "\\sigma_n^2", means: "The noise variance added to the diagonal "
        + "of K.", unit: "same as f squared" },
      { sym: "I", means: "The identity matrix.", unit: "—" },
      { sym: "\\mathbf{y}", means: "The n values the function returned, with "
        + "their mean subtracted on this card (and added back to the "
        + "prediction).", unit: "same as f" },
      { sym: "\\mathbb{V}[f_*]", means: "The predictive variance of the "
        + "function itself at the new point, not of a new noisy call.",
        unit: "same as f squared" },
    ],
    derivation: [
      { step: "Write the kernel matrix with the noise allowance on its "
        + "diagonal and take its Cholesky factor (Algorithm 2.1, line 2).",
        eq: String.raw`L L^{\top} = K + \sigma_n^2 I` },
      { step: "Solve two triangular systems for the weights (line 3); the mean "
        + "is then one dot product (line 4, eq. 2.25).",
        eq: String.raw`\boldsymbol{\alpha} = L^{\top} \backslash \left( L \backslash \mathbf{y} \right), \qquad \bar f_* = \mathbf{k}_*^{\top} \boldsymbol{\alpha}` },
      { step: "One more triangular solve gives the variance (lines 5-6, "
        + "eq. 2.26).",
        eq: String.raw`\mathbf{v} = L \backslash \mathbf{k}_*, \qquad \mathbb{V}[f_*] = k(x_*, x_*) - \mathbf{v}^{\top} \mathbf{v}` },
    ],
    note: "Eqs. (2.25) and (2.26) and Algorithm 2.1 are Rasmussen & Williams "
      + "(2006), pp. 17-19.  The cost of the Cholesky factor grows as \\(n^3\\), "
      + "which is nothing for the tens of points here and is why the method "
      + "is meant for few, costly evaluations.",
  },
  {
    n: 4,
    title: "Expected improvement: where the next call should go",
    body: "The model gives, at every \\(x\\), a normal distribution for \\(f\\).  "
      + "Let \\(f_{\\min}\\) be the best value found so far.  The improvement "
      + "of a call at \\(x\\) is how far below \\(f_{\\min}\\) it lands, or "
      + "zero if it does not.  Its expected value has a closed form, and two "
      + "terms: the first rewards a mean below the best value (exploit), the "
      + "second rewards a wide band (explore).  Expected improvement is zero "
      + "where a point was already evaluated, large where the model is "
      + "unsure, and many-peaked, so this card scans a grid of 801 points "
      + "and picks the highest.  The curve under the plot is that function.",
    formula: String.raw`\begin{aligned}
I(x) &= \max\left( f_{\min} - Y,\ 0 \right), \qquad \mathbb{E}[I(x)] = \left( f_{\min} - \hat y \right) \Phi(u) + s\, \phi(u)\\[4pt]
u &= \frac{f_{\min} - \hat y}{s}
\end{aligned}`,
    where: [
      { sym: "I(x)", means: "The improvement at x: the drop below the best "
        + "value so far that a call there would give, or zero.",
        unit: "same as f" },
      { sym: "f_{\\min}", means: "The lowest value returned by any call so "
        + "far.", unit: "same as f" },
      { sym: "Y", means: "The not-yet-known value of f at x, treated as a "
        + "normal random variable.", unit: "same as f" },
      { sym: "\\mathbb{E}[I(x)]", means: "The expected improvement: the "
        + "average of I(x) over what the model thinks Y may be.  The curve "
        + "under the plot.", unit: "same as f" },
      { sym: "\\hat y", means: "The model's predictive mean at x (the "
        + "\\(\\bar f_*\\) of step 3).", unit: "same as f" },
      { sym: "s", means: "The model's predictive standard deviation at x: the "
        + "square root of the variance of step 3.  It is s, not its square, "
        + "that appears in the formula.", unit: "same as f" },
      { sym: "\\Phi", means: "The standard normal cumulative distribution "
        + "function.", unit: "dimensionless" },
      { sym: "\\phi", means: "The standard normal density.",
        unit: "dimensionless" },
      { sym: "u", means: "The gap between the best value and the mean, "
        + "measured in standard deviations.", unit: "dimensionless" },
    ],
    note: "Jones, Schonlau & Welch (1998) define the expected improvement as "
      + "eq. (14) and give its closed form as eq. (15), in their section 4.1.  "
      + "They note that it is zero at sampled points and highly multimodal; "
      + "they maximise it with branch and bound, where this card only scans a "
      + "grid.  Expected improvement is one choice of acquisition function "
      + "among several.",
  },
  {
    n: 5,
    title: "The loop, and a fair count",
    body: "Press the next-point button: the card evaluates f at the highest "
      + "expected improvement, adds the pair to the data, and re-fits.  Two "
      + "counters sit beside the plot and both count every call of f.  "
      + "The gradient method on the card is a sketch of a one-variable "
      + "quasi-Newton method (central differences, a secant curvature update "
      + "and a backtracking line search), started at the same point, and "
      + "its counter shows the first as many calls as Bayesian optimisation "
      + "has used, so the two best values are compared at an equal budget.  "
      + "Watch what each does with it: the gradient method goes straight "
      + "downhill and settles in the valley it started in; Bayesian "
      + "optimisation spends calls on regions it has not seen.  Then set the "
      + "cost of one call to a millisecond and notice that the comparison "
      + "stops mattering, because both finish before you blink and the "
      + "cheaper method per call is the one to use.",
    note: "The gradient method is OURS and a SKETCH, written for this page. "
      + "It is not the engine's `sqp`, it has one variable, and its "
      + "tolerances are not tuned.  What it shows is the shape of the cost, "
      + "not a benchmark.",
  },
  {
    n: 6,
    title: "When Bayesian optimisation is the wrong tool",
    body: "Three situations, each on this page or one slider away.  First, "
      + "cheap calls: if one call is a millisecond, thousands of calls cost "
      + "less than fitting the model once, and a gradient method or a plain "
      + "scan wins.  Second, many variables: the points needed to cover a "
      + "space grow exponentially with the number of variables, and a "
      + "kernel with a single length scale has a harder time as the "
      + "dimension rises, so it is used for a handful of variables, not "
      + "hundreds, while the cost of a finite-difference gradient grows only "
      + "linearly with \\(n\\).  Third, a narrow feature: choose the narrow-dip "
      + "setting and keep the long length scale.  The model is confident "
      + "between the points it has, the dip sits between two of them, and "
      + "expected improvement sees nothing there.  This is the honest "
      + "failure: the method finds only what its model allows it to "
      + "imagine, and a length scale chosen too long forbids the dip.  A "
      + "short length scale, or enough points, finds it.  And Bayesian "
      + "optimisation returns a point, not multipliers, so it gives no "
      + "shadow prices, so a constraint's value at the optimum is not part of "
      + "what it tells you.",
    note: "The comparison with the engine's own methods is the one in the "
      + "status sentence at the top of this card: it was measured, and the "
      + "sketch above makes no further claim about it.",
  },
];

export const BAYES_LIMITS: readonly LessonLimit[] = [
  { id: "not-in-engine", title: "What the engine's measurement found.",
    body: ENGINE_STATUS },
  { id: "one-variable", title: "One variable only.",
    body: "Everything is drawn on one axis so the posterior can be seen.  "
      + "That hides the difficulty that matters in practice: with several "
      + "variables the picture is gone, the model needs far more points, "
      + "and the maximisation of expected improvement becomes an "
      + "optimisation problem of its own." },
  { id: "hyperparameters", title: "The length scale and noise are yours.",
    body: "A real implementation estimates them from the data, for example by "
      + "maximising the marginal likelihood (Rasmussen & Williams, eq. 2.30 "
      + "and Algorithm 2.1, line 7).  Here two sliders replace that, to make "
      + "the consequence of a wrong choice visible; the signal variance is "
      + "fixed at 1." },
  { id: "noise-free", title: "The function is evaluated without noise.",
    body: "The noise slider is the model's allowance, not noise added to the "
      + "calls.  A noisy simulator, such as a Monte Carlo one, needs a "
      + "different expected improvement than the noise-free formula "
      + "of step 4." },
  { id: "grid-and-sketch", title: "A grid and a sketch.",
    body: "Expected improvement is maximised on a grid of 801 points, not "
      + "exactly, and the gradient method is a sketch of ours with one "
      + "variable and untuned tolerances.  Neither is the code the engine "
      + "would run." },
  { id: "no-constraints", title: "No constraints, and no multipliers.",
    body: "The card minimises an unconstrained function on an interval.  "
      + "Bayesian optimisation returns neither Lagrange multipliers nor shadow prices; "
      + "a gradient-based method with an active-set or sequential-quadratic "
      + "structure does, and those numbers are often what an engineer wants "
      + "from an optimum." },
  { id: "cubic-cost", title: "Its own cost grows as n cubed.",
    body: "The Cholesky factor costs a number of operations growing as the "
      + "cube of the number of points kept.  It is invisible at tens of "
      + "points and a reason to stop at thousands." },
];

export const BAYES_QUIZ: readonly QuizQuestion[] = [
  {
    id: "why-bo", steps: [1, 5],
    q: "When is Bayesian optimisation the right choice over a finite-difference gradient method?",
    options: [
      "When each evaluation is expensive and the number of variables is small",
      "When evaluations take a millisecond and there are hundreds of variables",
      "Always, because it needs no derivative",
      "Only when the function has a single minimum",
    ],
    correct: 0,
    feedback: "Its cost is the number of evaluations, and it pays arithmetic "
      + "to save them.  With a millisecond call the arithmetic is the "
      + "larger cost, and with hundreds of variables the model and the "
      + "points needed both grow (steps 1, 5 and 6).",
  },
  {
    id: "band", steps: [3],
    q: "The 95 % band is wide between two evaluated points and narrow at the points themselves.  Why?",
    options: [
      "The model has seen the value at the points and has seen nothing between them",
      "The function is noisy between the points",
      "The kernel is zero at the points",
      "The plot is drawn with a different scale there",
    ],
    correct: 0,
    feedback: "Conditioning subtracts what the observations teach from the "
      + "prior variance (eq. 2.26): the variance falls to the noise allowance "
      + "at an evaluated point and returns toward the prior far from every "
      + "point (step 3).",
  },
  {
    id: "ei", steps: [4],
    q: "Expected improvement is zero at a point already evaluated and large where the band is wide and the mean is near the best value.  What does that make it?",
    options: [
      "A balance of exploiting a low mean and exploring an uncertain region",
      "A measure of how smooth the function is",
      "The probability that the function is below zero",
      "An estimate of the noise level",
    ],
    correct: 0,
    feedback: "The two terms of eq. (15) reward a mean below the best value "
      + "and a large standard deviation; where the model is certain and "
      + "the mean is not better, both vanish (step 4).",
  },
  {
    id: "dip", steps: [2, 6],
    q: "On the narrow-dip setting with a long length scale the method never samples the dip, although the dip is the true minimum.  What is the lesson?",
    options: [
      "The method can only find what its model allows; a long length scale makes a narrow feature between the points look impossible",
      "Expected improvement has a bug",
      "More noise always fixes it",
      "A gradient method would have found it from any start",
    ],
    correct: 0,
    feedback: "The kernel is the belief about the function.  A length scale "
      + "much longer than the dip's width makes the model confident between "
      + "its points, so expected improvement is small there.  A shorter "
      + "length scale, or a wider search, can reveal it (steps 2 and 6).  "
      + "A gradient method started away from the dip also misses it.",
  },
];

/** Drawn at the foot of the card until the `optimizers` tool draws these
 *  through lessonReferences.json (README.md names the entries). */
export interface BayesReference { text: string; doi?: string; url?: string; note: string; }

export const BAYES_REFERENCES: readonly BayesReference[] = [
  {
    text: "Rasmussen, C. E.; Williams, C. K. I. (2006). Gaussian Processes for "
      + "Machine Learning. MIT Press. ISBN 026218253X.",
    url: "https://gaussianprocess.org/gpml/",
    note: "Algorithm 2.1 (p. 19), eqs. (2.25), (2.26) (p. 17), eq. (2.31): "
      + "the Gaussian-process predictor and the squared-exponential kernel.",
  },
  {
    text: "Jones, D. R.; Schonlau, M.; Welch, W. J. (1998). Efficient Global "
      + "Optimization of Expensive Black-Box Functions. Journal of Global "
      + "Optimization 13(4), 455–492.",
    doi: "10.1023/A:1008306431147",
    note: "Eqs. (14) and (15): the definition and the closed form of the "
      + "expected improvement.",
  },
  {
    text: "Shahriari, B.; Swersky, K.; Wang, Z.; Adams, R. P.; de Freitas, N. "
      + "(2016). Taking the Human Out of the Loop: A Review of Bayesian "
      + "Optimization. Proceedings of the IEEE 104(1), 148–175.",
    doi: "10.1109/JPROC.2015.2494218",
    note: "Further reading: the method, its acquisition functions and its "
      + "difficulties in many variables.",
  },
  {
    text: "Nocedal, J.; Wright, S. J. (2006). Numerical Optimization, 2nd ed. "
      + "Springer. ISBN 978-0-387-30303-1.",
    doi: "10.1007/978-0-387-40065-5",
    note: "The quasi-Newton, finite-difference and backtracking ideas the "
      + "gradient sketch borrows.",
  },
];

/** Where the card sits inside the `optimizers` tool: its steps follow that
 *  tool's six, so the numbers are shifted and stay unique in one lesson. */
export const BAYES_STEP_OFFSET = 6;

export const BAYES_STEPS_IN_TOOL: readonly LessonStep[] =
  BAYES_STEPS.map((st) => ({ ...st, n: st.n + BAYES_STEP_OFFSET }));

export const BAYES_QUIZ_IN_TOOL: readonly QuizQuestion[] =
  BAYES_QUIZ.map((q) => ({
    ...q, id: `bayes-${q.id}`, steps: q.steps.map((n) => n + BAYES_STEP_OFFSET),
  }));
