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
  The least-squares parameter-estimation lesson, as DATA, so the claims it
  makes about the engine can be held against the engine in
  tests/numericsLessons.test.ts — a page must not teach against its own code.

  THE SPINE.  A solver asks *what state satisfies this model*; a fit asks *what
  model reproduces these measurements*.  The second question has no residual
  you can drive to zero and no unique answer, and every honest thing this page
  says follows from that.

  THE SECOND SPINE, and it is why this lesson belongs in a process simulator
  rather than in a numerical-methods course: A FIT THAT REPRODUCES ITS OWN DATA
  PROVES NOTHING.  Choupo already carries the whole apparatus that makes a
  fitted parameter worth something — evidence partitioned into FITTED and
  HELD-OUT before the fit, an acceptance band declared before the fit with its
  origin stated, and a verdict published as a WORD rather than as a residual —
  and until this page existed a student met none of it.  The order is the
  lesson: band, partition, fit, verdict.  A band declared after the fit is not
  a band.

  THE THIRD THING: `validated` and `individually identifiable` are two
  different questions and a student has to be able to read both off one run.
  The witness (curate02) was rebuilt on 2026-11-18 (C439): its first version
  fitted four coefficients to one isobar and was validated yet NOT
  identifiable; the present one frees two and is both.  The page says which
  it is by quoting the run, not by remembering the old one.

  WHERE THE CONTRACT THIS PAGE TEACHES IS WRITTEN DOWN, for a reader who wants
  the engine side rather than the lesson: `check_fit_verdict_channel` is the
  gate that holds every sink to one verdict word (and states in its own claim
  line that it does NOT check whether the GUI renders it -- this page is that
  reader), and `docs/design/what-a-promoted-record-must-carry.md` is the
  record of why the promotable `.dat` carries the evidence, the partition
  fingerprint and the verdict rather than the four coefficients alone.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const LS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A different question from every other solver in this simulator",
    body: "Every solver you have met so far has the same shape: the model is "
      + "given, and the unknown is a state that satisfies it. A flash finds "
      + "the split that balances fugacities; a bubble point finds the "
      + "temperature at which the pressures sum to one bar. Parameter "
      + "estimation turns that round. Here the state is given — somebody "
      + "measured it — and the unknown is the model: which setting of the "
      + "adjustable coefficients makes the model reproduce what was measured. "
      + "Two things change with the question. There are more measurements "
      + "than coefficients, so no setting satisfies all of them and there is "
      + "no residual to drive to zero. And the answer is not a fact about "
      + "nature; it is a fact about one model, one dataset and one range.",
    derivation: [
      { step: "For each measured composition, run the forward model at the "
          + "current coefficients and compare it with what was measured. That "
          + "difference is the residual of that point.",
        eq: String.raw`r_i(p) = T_i^{\mathrm{model}}(p) - T_i^{\mathrm{exp}}` },
      { step: "Add up the squares. This single number is what the search "
          + "minimises, and Choupo reports it as `chi2`.",
        eq: String.raw`\chi^2(p) = \sum_{i=1}^{N} r_i(p)^2` },
    ],
    formula: String.raw`\chi^2(p) = \sum_{i=1}^{N} r_i(p)^2
\qquad r_i(p) = T_i^{\mathrm{model}}(p) - T_i^{\mathrm{exp}}`,
    where: [
      { sym: "p", means: "the parameter vector — the adjustable coefficients "
        + "of the model. On this page it is the two NRTL coefficients b_ij and "
        + "b_ji (in kelvin) of one binary pair" },
      { sym: "r_i", means: "the residual at measurement i: what the model "
        + "says minus what was measured", unit: "K here" },
      { sym: "T_i", means: "the bubble temperature at measurement i, either "
        + "as the model computes it or as the laboratory reported it",
        unit: "K" },
      { sym: "i", means: "the index over the measurements the fitter was "
        + "handed, running from 1 to N" },
      { sym: "N", means: "the number of measurements the fitter is handed. "
        + "Not the number available — see step 8" },
      { sym: "\\chi", means: "the sum of squared residuals, the single number "
        + "the search minimises", unit: "K² here" },
    ],
    note: "One notational warning, because you will meet both. Choupo's "
      + "`chi2` diagnostic is the plain sum of squares (src/propertyOps/"
      + "FitParameters.cpp:133), while the Theory Guide's chapter writes it "
      + "with a factor of one half in front. The minimiser is the same point "
      + "either way; only the number printed differs, by a factor of two.  "
      + "And despite the name, this `chi2` is not the dimensionless "
      + "chi-square of statistics: here (`weighting equal`) it is unweighted and carries K², so its "
      + "size depends on the unit the temperatures are written in.  Only the "
      + "weighted sum of step 2, each residual divided by its own σ_i, is "
      + "dimensionless — and only when those σ_i are right can it be read "
      + "against a chi-square distribution.",
  },
  {
    n: 2,
    title: "Why squares — and what choosing them quietly assumes",
    body: "Squaring is not the only way to punish a mismatch, and it is worth "
      + "knowing what the choice buys and what it assumes. It buys "
      + "differentiability, which is what makes the gradient methods below "
      + "possible at all, and it buys a closed-form linear step. What it "
      + "assumes is an error structure: minimising the sum of squares is the "
      + "maximum-likelihood estimate exactly when the measurement errors are "
      + "independent, normally distributed, have zero mean, and all have the "
      + "same variance. That is "
      + "a claim about the laboratory, not a law of mathematics. If some "
      + "points are more trustworthy than others you should weight them by "
      + "their own uncertainty; Choupo's bubble-temperature residual can be "
      + "(`residual { weighting uncertainty; }`, which reads each point's "
      + "declared 1/U), but this page's case chooses `equal`, so running it "
      + "asserts that every point in the file deserves the same say. It also means one bad point costs the fit the "
      + "square of its badness, which is why an outlier drags a least-squares "
      + "answer so hard.",
    derivation: [
      { step: "The weighted form, which is what you would write if each point "
          + "carried its own declared uncertainty. Choupo's `T_bubble` "
          + "residual is this, with the weights 1/U_k under `weighting "
          + "uncertainty` and every weight equal to one under `equal` (this "
          + "page's case).",
        eq: String.raw`\chi^2_w(p) = \sum_{i=1}^{N} \left(\frac{r_i(p)}{\sigma_i}\right)^2` },
    ],
    formula: String.raw`\chi^2_w(p) = \sum_{i=1}^{N} \left(\frac{r_i(p)}{\sigma_i}\right)^2
\qquad \text{this page's case: } \sigma_i = 1 \ \text{for every } i`,
    where: [
      { sym: "\\chi_{w}", means: "the weighted sum of squares, each residual "
        + "measured in its own point's standard uncertainty" },
      { sym: "\\sigma_i", means: "the declared standard uncertainty of "
        + "measurement i. Choupo's bubble-temperature fit can read one (`weighting "
        + "uncertainty`); this page's case chooses `equal`, which is the "
        + "same as declaring them all equal", unit: "K" },
    ],
    note: "Choupo does carry a weighted least-squares solver, and you can "
      + "read it in the active-set QP lesson: a laboratory water analysis is "
      + "reconciled by minimising exactly the weighted form above, subject to "
      + "conservation laws. That problem is constrained and linear in its "
      + "unknowns; this one is unconstrained except for simple bounds, and "
      + "non-linear in the parameters. Same objective, different machinery.",
  },
  {
    n: 3,
    title: "Gauss-Newton: pretend the model is linear, and it becomes one solve",
    body: "The residuals depend on the parameters through a bubble-point "
      + "calculation, so the objective is not quadratic and cannot be "
      + "minimised in one step. But near the current guess it very nearly is. "
      + "Linearise each residual about the current parameters, substitute the "
      + "linearisation into the sum of squares, and what is left is an "
      + "ordinary quadratic in the step — which has exactly one minimum, "
      + "provided the Jacobian has full column rank (no parameter's effect is "
      + "a combination of the others'), and is found by one linear solve. "
      + "That is Gauss-Newton, and the matrix in it "
      + "is the whole reason the method is cheap: it is built from first "
      + "derivatives only.",
    derivation: [
      { step: "Linearise: each residual moves, to first order, by the "
          + "Jacobian times the step.",
        eq: String.raw`r(p + \delta) \approx r(p) + J\,\delta
\qquad J_{ij} = \frac{\partial r_i}{\partial p_j}` },
      { step: "The exact gradient of one half the sum of squares is the "
          + "Jacobian transpose times the residuals. No approximation yet.",
        eq: String.raw`\nabla \left( \tfrac{1}{2}\chi^2 \right) = J' r` },
      { step: "The exact Hessian has two terms. The second carries the "
          + "residuals themselves, so it is small whenever the fit is good — "
          + "and dropping it is the one approximation Gauss-Newton makes.",
        eq: String.raw`\nabla^2 \left( \tfrac{1}{2}\chi^2 \right)
= J' J + \sum_{i=1}^{N} r_i \nabla^2 r_i \ \approx \ J' J` },
      { step: "Set the gradient of the linearised objective to zero: the "
          + "normal equations.",
        eq: String.raw`J' J \,\delta = -J' r` },
    ],
    formula: String.raw`J' J \,\delta = -J' r`,
    where: [
      { sym: "J", means: "the Jacobian: one row per measurement, one column "
        + "per parameter, holding how much that residual moves when that "
        + "parameter moves" },
      { sym: "J_{ij}", means: "the entry of J in row i, column j — the "
        + "sensitivity of residual i to parameter j" },
      { sym: "p_j", means: "the j-th entry of the parameter vector: one "
        + "adjustable coefficient" },
      { sym: "\\delta", means: "the step: the change to the parameters this "
        + "solve proposes" },
      { sym: "r", means: "the column of residuals at the current parameters" },
      { sym: "\\nabla", means: "the gradient with respect to the parameters; "
        + "written twice it is the matrix of second derivatives" },
    ],
    note: "Notice what the dropped term means. Gauss-Newton is a good "
      + "approximation when the residuals are small or the model is nearly "
      + "linear, and a bad one far from the answer or on a badly-fitting "
      + "model — which is exactly where the next step comes in.",
  },
  {
    n: 4,
    title: "Levenberg-Marquardt: one number that slides between two methods",
    body: "Gauss-Newton is fast near the answer and unstable far from it: the "
      + "linearisation is only local, so a full step can land somewhere worse "
      + "than where it started, and if two parameters trade off almost "
      + "perfectly the matrix is nearly singular and the step is enormous. "
      + "Levenberg's fix is to add a positive number to the diagonal. Send "
      + "that number to zero and you have Gauss-Newton back; send it large and "
      + "the matrix is dominated by its diagonal, so the step shrinks and "
      + "turns to point down the gradient. Marquardt's refinement is which "
      + "diagonal: not the identity, but the diagonal of the matrix itself, so "
      + "each parameter is damped in proportion to its own curvature.",
    derivation: [
      { step: "Levenberg's damped normal equations: add a multiple of the "
          + "identity and the system can never be singular.",
        eq: String.raw`\left( J' J + \lambda I \right) \delta = -J' r` },
      { step: "Marquardt's scaling: damp by the matrix's own diagonal "
          + "instead. This is what Choupo solves.",
        eq: String.raw`\left( J' J + \lambda\,\operatorname{diag}(J' J) \right) \delta = -J' r` },
      { step: "Which is the same as multiplying each diagonal entry by one "
          + "plus lambda — and that is literally the line of code.",
        eq: String.raw`\left( J' J \right)_{jj} \ \leftarrow \ \left( 1 + \lambda \right) \left( J' J \right)_{jj}` },
    ],
    formula: String.raw`\left( J' J + \lambda\,\operatorname{diag}(J' J) \right) \delta = -J' r`,
    where: [
      { sym: "\\lambda", means: "the damping. Zero is Gauss-Newton; large is "
        + "a short step down the gradient. It is declared in the operation's "
        + "dict as `lambda0` (read at FitParameters.cpp:677) and then moved "
        + "by the engine every iteration" },
      { sym: "I", means: "the identity matrix — Levenberg's unscaled damping, "
        + "shown for contrast and not what Choupo does" },
      { sym: "j", means: "an index over the parameters, so the last line is "
        + "one diagonal entry at a time" },
    ],
    note: "Why the scaling matters, and where this case would show it. Both "
      + "fitted coefficients here are in kelvin (bounds plus or minus 3000), "
      + "but free a_ij and a_ji as well, as the README suggests, and the "
      + "parameters are no longer commensurable: those two are "
      + "dimensionless, with bounds of plus or minus 15, more than two "
      + "orders of magnitude from the others. Damping by the identity would "
      + "treat a step of one in each as the same size, which it plainly is "
      + "not. "
      + "Damping by "
      + "diag(J'J) makes the penalty carry the units of each parameter's own "
      + "sensitivity, so the same lambda means the same thing for every parameter. "
      + "Choupo writes the equation out at src/propertyOps/"
      + "FitParameters.cpp:259 and applies the damping at "
      + "FitParameters.cpp:280.",
  },
  {
    n: 5,
    title: "Where lambda comes from: the engine reprices it, it does not line-search",
    body: "Nothing in the algebra says what lambda should be, and the honest "
      + "answer is that nobody knows in advance. So it is run as a trust "
      + "rule: take the step, evaluate the objective, and if it went down "
      + "accept the step and trust the linearisation a little more; if it did "
      + "not, throw the step away and trust it a good deal less. Choupo does "
      + "not backtrack along the step and does not evaluate a merit function "
      + "— it simply reprices lambda and tries again, and the asymmetry of the "
      + "two factors is deliberate: it relaxes gently and tightens hard.",
    derivation: [
      { step: "Accepted step — the objective fell. Loosen the damping by a "
          + "factor a little under one (FitParameters.cpp:1043).",
        eq: String.raw`\lambda \leftarrow 0.7\,\lambda` },
      { step: "Rejected step — the objective did not fall. The parameters do "
          + "not move at all; only the damping does, and it moves further "
          + "(FitParameters.cpp:1050).",
        eq: String.raw`\lambda \leftarrow 2.5\,\lambda` },
      { step: "Singular normal matrix — the solve itself failed. Damp by a "
          + "whole order of magnitude and retry (FitParameters.cpp:1020).",
        eq: String.raw`\lambda \leftarrow 10\,\lambda` },
      { step: "And a ceiling, because a lambda that keeps climbing is a "
          + "message. Past it the engine stops and says the initial guess is "
          + "bad or the parameters are not identifiable, rather than "
          + "returning a number." },
    ],
    formula: String.raw`\text{accept} \Rightarrow \lambda \leftarrow 0.7\,\lambda
\qquad \text{reject} \Rightarrow \lambda \leftarrow 2.5\,\lambda
\qquad \lambda > 10^{12} \Rightarrow \text{refuse}`,
    where: [
      { sym: "\\lambda", means: "the damping, carried from one iteration to "
        + "the next — the value in the dict is only where it starts" },
    ],
    note: "Two more things happen to a step before it is judged. It is "
      + "clamped to the bounds each parameter declares in the dict "
      + "(FitParameters.cpp:1025), and the run publishes `params_at_bound` so "
      + "that a parameter pressed against a limit you invented is visible "
      + "rather than silent. And convergence is declared on the relative fall "
      + "in the objective, against the `tolerance` the dict declares "
      + "(FitParameters.cpp:1045) — or, when a step is rejected and every "
      + "component of it is already below a thousandth of the "
      + "finite-difference step the Jacobian was built with, the search is "
      + "declared converged at that floor rather than inflating lambda to a "
      + "false 'diverged' (FitParameters.cpp:1049). Never on the size of the "
      + "residual itself.",
  },
  {
    n: 6,
    title: "The Jacobian is finite-differenced, and here that is the honest default",
    body: "Every column of J is built by moving one parameter a little and "
      + "re-running every residual. That is expensive: one iteration costs "
      + "one full sweep of the residuals per parameter to build the Jacobian, "
      + "plus one more to evaluate the trial step — three sweeps here, for two "
      + "parameters — and each sweep is a bubble-point calculation at every "
      + "measured composition over a thermodynamic package rebuilt for the "
      + "perturbed coefficients. "
      + "The alternative is an analytic Jacobian, and the reason Choupo does "
      + "not have one is not laziness: it would require every model in the "
      + "package — activity coefficient, vapour pressure, the bubble-point "
      + "iteration itself — to differentiate itself with respect to every "
      + "fitted parameter. That is a second implementation of the "
      + "thermodynamics, kept in step with the first by hand, and the day it "
      + "drifts the fit walks confidently in the wrong direction with nothing "
      + "on screen to say so.",
    derivation: [
      { step: "The forward difference Choupo takes, one parameter at a time "
          + "(FitParameters.cpp:1013).",
        eq: String.raw`J_{ij} \approx \frac{r_i(p + h\,e_j) - r_i(p)}{h}` },
      { step: "The step is relative where the parameter is large and absolute "
          + "where it is small, so one declared setting serves a coefficient "
          + "searched over plus or minus 15 (a dimensionless a_ij, if freed) "
          + "and one searched over plus or minus 3000 (the b_ij of this "
          + "page's case) alike (FitParameters.cpp:1007).",
        eq: String.raw`h = \mathrm{fdStep} \cdot \max\left( \lvert p_j \rvert, 1 \right)` },
      { step: "And the price of the shortcut: a forward difference carries a "
          + "truncation error that falls with h and a round-off error that "
          + "grows as the model's own solver tolerance divided by h. There is "
          + "a best h and it is not knowable in advance.",
        eq: String.raw`\text{error} \ \sim \ h \ (\text{truncation}) \ + \ \frac{\epsilon}{h} \ (\text{round-off})` },
    ],
    formula: String.raw`J_{ij} \approx \frac{r_i(p + h\,e_j) - r_i(p)}{h}
\qquad h = \mathrm{fdStep} \cdot \max\left( \lvert p_j \rvert, 1 \right)`,
    where: [
      { sym: "h", means: "the finite-difference step actually taken for "
        + "parameter j" },
      { sym: "\\mathrm{fdStep}", means: "the relative step the operation's "
        + "dict declares (1e-4 on this page's case)" },
      { sym: "p_j", means: "the j-th parameter, at its current value" },
      { sym: "e_j", means: "the unit vector that moves parameter j and leaves "
        + "the others alone" },
      { sym: "\\epsilon", means: "how repeatably the forward model returns "
        + "the same number — here it is the bubble-point solver's own "
        + "convergence tolerance, not machine precision" },
    ],
    note: "A forward difference, not a central one: the central difference is "
      + "second-order accurate and costs twice as many model evaluations per "
      + "iteration. That is a real trade and the engine has taken one side of "
      + "it; nothing here claims it is the only defensible side.",
  },
  {
    n: 7,
    title: "Converged is not correct, and in-sample is not evidence",
    body: "Suppose the search finishes and the residuals are small. What have "
      + "you learnt? That the model can reproduce the points it was handed — "
      + "which is a statement about the model's flexibility at least as much "
      + "as about its truth. Give any model enough adjustable coefficients "
      + "and it will pass through anything, including the measurement noise. "
      + "This is why Choupo labels the fit statistic IN-SAMPLE in the run's "
      + "own output, in those words, rather than letting a small number speak "
      + "for itself. The only number that says something about the model is "
      + "computed on measurements the fitter never saw.",
    derivation: [
      { step: "What the fit reports about itself. It is a measure of "
          + "agreement, and nothing is being validated by it.",
        eq: String.raw`\chi^2_{\mathrm{in}} = \sum_{i \in \mathrm{fitted}} r_i^2
\qquad \mathrm{rms} = \sqrt{\chi^2_{\mathrm{in}} / N}` },
      { step: "Degrees of freedom: subtract the number of coefficients you "
          + "spent. A fit with as many parameters as points has none left and "
          + "reproduces the data exactly while saying nothing at all.",
        eq: String.raw`\nu = N - m
\qquad \chi^2_{\mathrm{red}} = \chi^2_{\mathrm{in}} / \nu` },
    ],
    formula: String.raw`\chi^2_{\mathrm{red}} = \frac{\chi^2_{\mathrm{in}}}{N - m}
\qquad \text{(still in-sample: a smaller number is not a better model)}`,
    where: [
      { sym: "\\chi_{\\mathrm{in}}", means: "the in-sample sum of squares, "
        + "over the fitted points only", unit: "K² here" },
      { sym: "\\mathrm{rms}", means: "the root-mean-square residual over the "
        + "fitted points, which is the in-sample number in the units a reader "
        + "thinks in", unit: "K" },
      { sym: "\\nu", means: "the degrees of freedom left after the fit" },
      { sym: "m", means: "the number of fitted parameters — two on this page" },
      { sym: "\\chi_{\\mathrm{red}}", means: "the reduced sum of squares, the "
        + "in-sample number per degree of freedom" },
    ],
  },
  {
    n: 8,
    title: "The order is band, partition, fit, verdict — and it is enforced by data flow",
    body: "A held-out test is only worth something if the withholding was "
      + "decided before the fit, and the criterion was decided before the "
      + "residual was seen. Otherwise both are chosen to be met, and the "
      + "whole exercise is decorative. So the case declares an acceptance "
      + "band with a stated origin, and it declares which dataset is `role "
      + "fit` and which is `role validation`, and Choupo parses and freezes "
      + "that declaration before any fitting code runs. The fitter is not "
      + "forbidden to peek at the held-out points; it is never handed them. "
      + "It obtains its data from one container and the held-out data lives "
      + "in another, so the guarantee is a fact about the program rather than "
      + "a rule somebody could edit away.",
    derivation: [
      { step: "The declaration is read and frozen first "
          + "(FitParameters.cpp:540), and `role` has no default — a dataset "
          + "that does not declare one is refused by name." },
      { step: "The fitter reads `part.fit()`; the held-out evidence sits in "
          + "`part.validation()` and is never passed to it "
          + "(EvidencePartition.H:260-261)." },
      { step: "After the search, the same residual routine is run on the "
          + "held-out points, so a difference between the two cannot be an "
          + "artefact of two evaluators.",
        eq: String.raw`\mathrm{AAD} = \frac{100}{M} \sum_{k=1}^{M}
\frac{\lvert r_k \rvert}{T_k^{\mathrm{exp}}}` },
      { step: "And the declaration carries a fingerprint, so editing it "
          + "afterwards is detectable rather than invisible "
          + "(EvidencePartition.H:343)." },
    ],
    formula: String.raw`\mathrm{AAD} = \frac{100}{M} \sum_{k=1}^{M}
\frac{\lvert r_k \rvert}{T_k^{\mathrm{exp}}}
\qquad \left[ \% \right]`,
    where: [
      { sym: "\\mathrm{AAD}", means: "the average absolute deviation over the "
        + "held-out points, as a percentage of each measured temperature — "
        + "the quantity the acceptance band is declared in", unit: "%" },
      { sym: "M", means: "the number of held-out measurements — four on this "
        + "page" },
      { sym: "r_k", means: "the residual at held-out point k, computed with "
        + "the finished parameters", unit: "K" },
      { sym: "T_k", means: "the measured bubble temperature at held-out point "
        + "k", unit: "K" },
    ],
    note: "The band on this page's case is 0.061 % of the bubble temperature, "
      + "about 0.22 K, and the case states why in its own dict: the largest "
      + "stated uncertainty of the held-out points (0.18 K) plus the "
      + "catalogue's own boiling-point error at the two pure endpoints "
      + "(0.036 K, i.e. 0.216 K in all), as a percentage of the mean held-out temperature. A limit with no stated origin "
      + "cannot be told apart from one chosen after the residuals were seen, "
      + "which is why Choupo makes the origin mandatory whenever a band "
      + "exists.",
  },
  {
    n: 9,
    title: "The verdict is a word, and the engine will not invent the band",
    body: "The last step is the one that makes the rest worth doing. Choupo "
      + "does not publish the held-out residual and leave you to feel good "
      + "about it: it compares the residual with the declared band and "
      + "publishes a word. There are five, they come from one function, and "
      + "every sink — the console, the curation dossier, the promotable "
      + "record and the result the browser reads — takes that one word rather "
      + "than deciding for itself. Read the ladder and notice what it "
      + "refuses to do: with evidence held out but no band declared, the "
      + "engine reports that the test was performed and claims nothing. It "
      + "will not choose a threshold on your behalf, because deciding whether "
      + "a residual is small enough is a judgement and not a measurement.",
    derivation: [
      { step: "notClaimed — no partition was declared at all. The legacy "
          + "single-dataset form lands here and claims nothing, which is the "
          + "honest reading of it." },
      { step: "validationRefused — a partition was declared and nothing was "
          + "held out. The run must then label its statistic in-sample and "
          + "must not present it as an external validation." },
      { step: "heldOutPerformed — evidence was held out and no acceptance "
          + "band was declared. A completed experiment with no criterion to "
          + "judge it by." },
      { step: "notValidated / validated — a band was declared before the fit "
          + "and the held-out deviation missed it or met it. Both are "
          + "results; a negative one is an outcome, not a failure to test.",
        eq: String.raw`\mathrm{AAD} \le \mathrm{maxAAD} \ \Rightarrow \ \text{validated}` },
    ],
    formula: String.raw`\mathrm{AAD} \le \mathrm{maxAAD} \ \Rightarrow \ \text{validated}
\qquad \mathrm{AAD} > \mathrm{maxAAD} \ \Rightarrow \ \text{notValidated}`,
    where: [
      { sym: "\\mathrm{maxAAD}", means: "the acceptance band the case "
        + "declared before the fit, with its origin stated beside it",
        unit: "%" },
    ],
    note: "One home for the rule: src/propertyOps/CurationDossier.cpp:59-72, "
      + "one short function you can read end to end. The verdict is taken once in the "
      + "run (FitParameters.cpp:1582) and travels to every sink from there "
      + "through src/propertyOps/PropertyOperation.H:118, the channel that "
      + "carries the curation axis as words — "
      + "it used to be recomputed at three call sites, one of them inside a "
      + "verbosity test, and a verdict that depends on how loudly the run was "
      + "asked to speak is not a verdict.",
  },
  {
    n: 10,
    title: "Identifiability is a different question, and this fit passes it",
    body: "A model that predicts well and coefficients that are individually "
      + "determined are two separate claims, and a fit can make one and "
      + "not the other. After the search Choupo rebuilds the Jacobian at the "
      + "answer, inverts the normal matrix, and reports a standard error and "
      + "a 95 % interval per parameter, the correlation between every pair, "
      + "and a condition number. On this case the condition number comes out "
      + "near 32 and the correlation of b_ij with b_ji is 0.94, strong but "
      + "below the 0.999 line, so each coefficient is bigger than its own "
      + "95 % interval and the run says the parameters are individually "
      + "determined. It was not always so: the first version of this case "
      + "freed all four NRTL coefficients, a_ij and a_ji as well, on the same "
      + "kind of single-isobar data, and the condition number was around "
      + "4e11 with pairs correlated to within a ten-thousandth of perfectly. "
      + "The reason is physical, not numerical: the two halves of an NRTL "
      + "coefficient always appear together as one temperature-dependent "
      + "group, so points over a narrow temperature span cannot separate "
      + "them. Fixing a_ij = a_ji = 0 is what made this fit well posed; free "
      + "them again and watch the verdict stay while the identifiability "
      + "goes.",
    derivation: [
      { step: "The covariance of the parameters, scaled by the in-sample "
          + "variance per degree of freedom.",
        eq: String.raw`C = \chi^2_{\mathrm{red}} \left( J' J \right)^{-1}` },
      { step: "The 95 % interval uses Student's t at the degrees of freedom "
          + "you actually have. With eight of them t is 2.306, not 1.96, and "
          + "the interval is some 18 % wider than the normal one "
          + "(FitParameters.cpp:245).",
        eq: String.raw`p_j \pm t_{95}(\nu)\, \sqrt{C_{jj}}` },
      { step: "And the pairwise correlation, which is the one that catches "
          + "the trade-off an interval alone can miss.",
        eq: String.raw`\rho_{jk} = \frac{C_{jk}}{\sqrt{C_{jj}\,C_{kk}}}` },
    ],
    formula: String.raw`p_j \pm t_{95}(\nu)\,\sqrt{C_{jj}}
\qquad \rho_{jk} = \frac{C_{jk}}{\sqrt{C_{jj}\,C_{kk}}}`,
    where: [
      { sym: "C", means: "the parameter covariance matrix, from the inverse "
        + "of the normal matrix at the answer" },
      { sym: "C_{jj}", means: "the variance of parameter j; its square root "
        + "is the standard error the run prints" },
      { sym: "C_{kk}", means: "the variance of parameter k, the other half "
        + "of the pair the correlation below is taken over" },
      { sym: "C_{jk}", means: "the covariance of parameters j and k" },
      { sym: "t_{95}", means: "Student's two-sided 95 % critical value at nu "
        + "degrees of freedom — 2.306 here, and 1.96 only in the limit of "
        + "many points" },
      { sym: "\\rho_{jk}", means: "the correlation between parameters j and "
        + "k. Close to plus or minus one means the two trade off and the fit "
        + "determines only their combination" },
      { sym: "k", means: "a second index over the parameters, so the last "
        + "expression is one pair at a time" },
    ],
    note: "Choupo calls a fit identifiable only when the normal matrix "
      + "inverted, there are degrees of freedom left, the condition number is "
      + "below 1e8, and no pair is correlated past 0.999 "
      + "(FitParameters.cpp:1246). The naive test — did it invert? — passes "
      + "on exactly this case, which is why it is not the test.",
  },
  {
    n: 11,
    title: "What survives the run, and what a reader months later can check",
    body: "The console scrolls. What outlives it is the file, and a promoted "
      + "parameter record is going to be moved into a catalogue folder and "
      + "simulated with by somebody who never saw this page. So Choupo writes "
      + "the whole qualification into the record, not the two numbers alone: "
      + "the origin word and the method that produced it, both datasets with "
      + "the role each was frozen in, the fingerprint of that declaration, "
      + "the held-out deviation over the withheld points, the band with the "
      + "reason it was set where it was, the verdict — and, in the header "
      + "above everything, the identifiability finding, with the warning "
      + "whenever the coefficients are not individually determined. The record is written after the held-out "
      + "pass, deliberately, because before it the verdict does not exist.",
    note: "This is the point of the whole page. A fitted parameter is not a "
      + "number; it is a number together with the evidence it rests on, the "
      + "range it was established over and the test it survived. Strip those "
      + "away and what is left cannot be defended, only quoted.",
  },
];

export const LS_LIMITS: readonly LessonLimit[] = [
  {
    id: "error-structure",
    title: "Least squares assumes an error structure nobody checked",
    body: "Minimising the plain sum of squares is the maximum-likelihood "
      + "answer when the measurement errors are independent, normally "
      + "distributed, zero-mean and all of the same size. Nothing in this run "
      + "tests any of those. The "
      + "dataset does declare a per-point uncertainty (0.13-0.45 K) but this "
      + "case chooses `weighting equal`, so the fit treats a point "
      + "at the azeotrope and a point in the dilute corner as equally "
      + "trustworthy, which the underlying measurements almost certainly are "
      + "not. What follows is not that the answer is wrong — it is that the "
      + "confidence intervals in step 10 inherit the assumption, and are "
      + "honest only to the extent it holds.",
  },
  {
    id: "evidence-quality",
    title: "A fit is only as good as its evidence, and held out is not independent",
    body: "The fourteen points on this page come from one article, at one "
      + "pressure, read through the NIST/TRC ThermoML archive. Every third "
      + "point is held out, leaving ten and four, and that tests whether the "
      + "model interpolates the same experiment, which is a real and useful "
      + "question and a much weaker one than whether it agrees with somebody "
      + "else's laboratory. Choupo is explicit about how little it can "
      + "settle here: it checks the one mechanical question that is a fact "
      + "— whether the same DOI or hash appears in both roles, which here "
      + "it does, because both roles are rows of one file and the case "
      + "declares so by naming the rows each role sets aside — and "
      + "announces the rest for a human to judge. The methanol + water case "
      + "(curate04) holds out a set from another laboratory.",
  },
  {
    id: "extrapolation",
    title: "Outside the evidence window the engine announces, it does not prevent",
    body: "A fitted parameter is established over the range the evidence "
      + "covers, and nothing stops you using it outside that range. This very "
      + "run meets the problem on the way: it evaluates ethanol's vapour "
      + "pressure at 369.3 K, just outside the 273-369 K window that component's own "
      + "record declares, and says so at the site and again in the caveat "
      + "block at the end. It does not refuse, because extrapolating is a "
      + "legitimate choice a reader may need to make. The held-out points "
      + "cover mole fractions from 0.10 to 0.85, and say nothing whatever "
      + "about the dilute ends or about other pressures.",
  },
  {
    id: "scope-of-the-verdict",
    title: "The verdict is about one property of one pair at one pressure",
    body: "`validated` here means the NRTL pair reproduced bubble "
      + "temperatures it had not seen, at atmospheric pressure, to within a "
      + "band somebody declared in advance. It does not mean the pair is "
      + "right for a vapour composition, for an enthalpy of mixing, for a "
      + "liquid-liquid split, or at ten bar. The curation dossier this run "
      + "writes scopes the verdict to `binaryVLE.T_bubble` for exactly that "
      + "reason — and the same file records whether the parameters are "
      + "individually identifiable, so both facts reach the reader together.",
  },
  {
    id: "one-optimiser-one-start",
    title: "One algorithm, one starting guess, and no search for a second minimum",
    body: "Levenberg-Marquardt is a local method: it walks downhill from "
      + "wherever it is put. The starting values are declared in the case, "
      + "and a different starting point may well land on a different set of "
      + "coefficients — the more so here, where a freed a_ij and a_ji open a whole valley of parameter "
      + "combinations that fit about equally well. Choupo does not multi-start "
      + "this operation, does not search globally, and does not report a "
      + "basin of attraction. Change the damping on the panel below and watch "
      + "the iteration count move a great deal while the answer barely does; "
      + "that is this problem being well behaved from this start, not a "
      + "guarantee about the next one.",
  },
];

/** The questions at the foot of the page (DEV.md 4c C158): drafts for
 *  Vitor's review, each testing a step and naming it. */
export const LS_QUIZ: readonly QuizQuestion[] = [
  {
    id: "inverse-question", steps: [1],
    q: "How does parameter estimation differ from every solver of a flowsheet?",
    options: [
      "The model is given and the state is unknown",
      "The state is given, as measured, and the unknown is the model: the coefficients that reproduce it",
      "The pressure is unknown",
      "It needs no model",
    ],
    correct: 1,
    feedback: "A flash or a bubble point finds a state that satisfies a model; "
      + "estimation turns it round, with more measurements than unknowns "
      + "(step 1).",
  },
  {
    id: "why-squares", steps: [2],
    q: "Minimising the sum of squares is the maximum-likelihood estimate under which assumption?",
    options: [
      "Errors that are independent, normal, zero-mean and of equal variance",
      "Errors that are always positive",
      "Errors proportional to the measurement",
      "Errors that are all identical",
    ],
    correct: 0,
    feedback: "Squares buy differentiability, but they assume an error "
      + "structure: a claim about the laboratory, not a law of "
      + "mathematics (step 2).",
  },
  {
    id: "lm", steps: [4],
    q: "What does the Levenberg-Marquardt number added to the diagonal do?",
    options: [
      "At zero it gives Gauss-Newton back; at a large value the step shrinks and points down the gradient",
      "It fixes the number of iterations",
      "It sets the bounds on the parameters",
      "It doubles the Jacobian",
    ],
    correct: 0,
    feedback: "Gauss-Newton is fast near the answer and unstable far from it, "
      + "and the added number slides between that method and steepest "
      + "descent (step 4).",
  },
  {
    id: "in-sample", steps: [7],
    q: "A fit converges and the residuals are small.  What have you learnt?",
    options: [
      "That the model is true",
      "That the model can reproduce the points it was handed, which says as much about its flexibility as about its truth",
      "That the parameters are identifiable",
      "That the band was met",
    ],
    correct: 1,
    feedback: "With enough adjustable coefficients any model passes through "
      + "anything, noise included, which is why the statistic is labelled "
      + "in-sample (step 7).",
  },
  {
    id: "order", steps: [8, 9],
    q: "Why must the acceptance band and the held-out set be declared before the fit?",
    options: [
      "Otherwise both can be chosen to be met, and the test is decorative",
      "The solver needs them to start",
      "They set the initial guess",
      "They reduce the number of parameters",
    ],
    correct: 0,
    feedback: "The case freezes the declaration before any fitting code runs "
      + "(step 8), and the verdict is one word from one function, never "
      + "invented without a band (step 9).",
  },
  {
    id: "identifiable", steps: [10],
    q: "A model predicts well.  Does that show that each coefficient is separately determined?",
    options: [
      "Yes, always",
      "No: predicting well and being identifiable are separate claims, checked through the standard errors, correlations and condition number",
      "Yes, if the residuals are small",
      "Only if there are two parameters",
    ],
    correct: 1,
    feedback: "After the search the engine rebuilds the Jacobian at the "
      + "answer and reports standard errors, correlations and a condition "
      + "number; strong correlation can leave a pair undetermined "
      + "(step 10).",
  },
];
