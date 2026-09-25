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

  THE THIRD THING, which the witness makes unavoidable: the fit on this page is
  `validated` AND `NOT individually identifiable` at the same time.  Those are
  two different questions and a student has to be able to read both off one
  run.

  WHERE THE CONTRACT THIS PAGE TEACHES IS WRITTEN DOWN, for a reader who wants
  the engine side rather than the lesson: `check_fit_verdict_channel` is the
  gate that holds every sink to one verdict word (and states in its own claim
  line that it does NOT check whether the GUI renders it -- this page is that
  reader), and `docs/design/what-a-promoted-record-must-carry.md` is the
  record of why the promotable `.dat` carries the evidence, the partition
  fingerprint and the verdict rather than the four coefficients alone.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const LS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A different question from every other solver in this simulator",
    body: "Every solver you have met so far has the same shape: the model is "
      + "given, and the unknown is a STATE that satisfies it. A flash finds "
      + "the split that balances fugacities; a bubble point finds the "
      + "temperature at which the pressures sum to one bar. Parameter "
      + "estimation turns that round. Here the STATE is given — somebody "
      + "measured it — and the unknown is the MODEL: which setting of the "
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
        + "of the model. On this page it is the four NRTL coefficients of one "
        + "binary pair" },
      { sym: "r_i", means: "the residual at measurement i: what the model "
        + "says minus what was measured", unit: "K here" },
      { sym: "T_i", means: "the bubble temperature at measurement i, either "
        + "as the model computes it or as the laboratory reported it",
        unit: "K" },
      { sym: "i", means: "the index over the measurements the fitter was "
        + "handed, running from 1 to N" },
      { sym: "N", means: "the number of measurements the fitter is handed. "
        + "NOT the number available — see step 8" },
      { sym: "\\chi", means: "the sum of squared residuals, the single number "
        + "the search minimises", unit: "K^2 here" },
    ],
    note: "One notational warning, because you will meet both. Choupo's "
      + "`chi2` diagnostic is the plain sum of squares (src/propertyOps/"
      + "FitParameters.cpp:128), while the Theory Guide's chapter writes it "
      + "with a factor of one half in front. The minimiser is the same point "
      + "either way; only the number printed differs, by a factor of two.",
  },
  {
    n: 2,
    title: "Why squares — and what choosing them quietly assumes",
    body: "Squaring is not the only way to punish a mismatch, and it is worth "
      + "knowing what the choice buys and what it assumes. It buys "
      + "differentiability, which is what makes the gradient methods below "
      + "possible at all, and it buys a closed-form linear step. What it "
      + "ASSUMES is an error structure: minimising the sum of squares is the "
      + "maximum-likelihood estimate exactly when the measurement errors are "
      + "independent, have zero mean, and all have the SAME variance. That is "
      + "a claim about the laboratory, not a law of mathematics. If some "
      + "points are more trustworthy than others you should weight them by "
      + "their own uncertainty; Choupo's bubble-temperature residual is "
      + "UNWEIGHTED, so running it asserts that every point in the file "
      + "deserves the same say. It also means one bad point costs the fit the "
      + "square of its badness, which is why an outlier drags a least-squares "
      + "answer so hard.",
    derivation: [
      { step: "The weighted form, which is what you would write if each point "
          + "carried its own declared uncertainty. Choupo's `T_bubble` "
          + "residual is this with every weight equal to one.",
        eq: String.raw`\chi^2_w(p) = \sum_{i=1}^{N} \left(\frac{r_i(p)}{\sigma_i}\right)^2` },
    ],
    formula: String.raw`\chi^2_w(p) = \sum_{i=1}^{N} \left(\frac{r_i(p)}{\sigma_i}\right)^2
\qquad \text{Choupo: } \sigma_i = 1 \ \text{for every } i`,
    where: [
      { sym: "\\chi_{w}", means: "the WEIGHTED sum of squares, each residual "
        + "measured in its own point's standard uncertainty" },
      { sym: "\\sigma_i", means: "the declared standard uncertainty of "
        + "measurement i. Choupo's bubble-temperature fit does not read one, "
        + "which is the same as declaring them all equal", unit: "K" },
    ],
    note: "Choupo DOES carry a weighted least-squares solver, and you can "
      + "read it in the active-set QP lesson: a laboratory water analysis is "
      + "reconciled by minimising exactly the weighted form above, subject to "
      + "conservation laws. That problem is CONSTRAINED and linear in its "
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
      + "ordinary quadratic in the STEP — which has exactly one minimum and is "
      + "found by one linear solve. That is Gauss-Newton, and the matrix in it "
      + "is the whole reason the method is cheap: it is built from FIRST "
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
          + "and dropping it is the ONE approximation Gauss-Newton makes.",
        eq: String.raw`\nabla^2 \left( \tfrac{1}{2}\chi^2 \right)
= J' J + \sum_{i=1}^{N} r_i \nabla^2 r_i \ \approx \ J' J` },
      { step: "Set the gradient of the linearised objective to zero: the "
          + "NORMAL EQUATIONS.",
        eq: String.raw`J' J \,\delta = -J' r` },
    ],
    formula: String.raw`J' J \,\delta = -J' r`,
    where: [
      { sym: "J", means: "the JACOBIAN: one row per measurement, one column "
        + "per parameter, holding how much that residual moves when that "
        + "parameter moves" },
      { sym: "J_{ij}", means: "the entry of J in row i, column j — the "
        + "sensitivity of residual i to parameter j" },
      { sym: "p_j", means: "the j-th entry of the parameter vector: one "
        + "adjustable coefficient" },
      { sym: "\\delta", means: "the STEP: the change to the parameters this "
        + "solve proposes" },
      { sym: "r", means: "the column of residuals at the current parameters" },
      { sym: "\\nabla", means: "the gradient with respect to the parameters; "
        + "written twice it is the matrix of second derivatives" },
    ],
    note: "Notice what the dropped term means. Gauss-Newton is a good "
      + "approximation when the residuals are SMALL or the model is nearly "
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
      + "turns to point down the gradient. Marquardt's refinement is WHICH "
      + "diagonal: not the identity, but the diagonal of the matrix itself, so "
      + "each parameter is damped in proportion to its own curvature.",
    derivation: [
      { step: "Levenberg's damped normal equations: add a multiple of the "
          + "identity and the system can never be singular.",
        eq: String.raw`\left( J' J + \lambda I \right) \delta = -J' r` },
      { step: "Marquardt's scaling: damp by the matrix's OWN diagonal "
          + "instead. This is what Choupo solves.",
        eq: String.raw`\left( J' J + \lambda\,\operatorname{diag}(J' J) \right) \delta = -J' r` },
      { step: "Which is the same as multiplying each diagonal entry by one "
          + "plus lambda — and that is literally the line of code.",
        eq: String.raw`\left( J' J \right)_{jj} \ \leftarrow \ \left( 1 + \lambda \right) \left( J' J \right)_{jj}` },
    ],
    formula: String.raw`\left( J' J + \lambda\,\operatorname{diag}(J' J) \right) \delta = -J' r`,
    where: [
      { sym: "\\lambda", means: "the DAMPING. Zero is Gauss-Newton; large is "
        + "a short step down the gradient. It is declared in the operation's "
        + "dict as `lambda0` (read at FitParameters.cpp:565) and then moved "
        + "by the engine every iteration" },
      { sym: "I", means: "the identity matrix — Levenberg's unscaled damping, "
        + "shown for contrast and NOT what Choupo does" },
      { sym: "j", means: "an index over the parameters, so the last line is "
        + "one diagonal entry at a time" },
    ],
    note: "Why the scaling matters, in this very case. Two of the four fitted "
      + "coefficients are dimensionless and two are in kelvin, and the case "
      + "declares their search bounds accordingly: plus or minus 15 for the "
      + "first pair and plus or minus 5000 for the second, more than two "
      + "orders of magnitude apart. Damping by the identity would treat a "
      + "step of one in each as the same size, which it plainly is not. "
      + "Damping by "
      + "diag(J'J) makes the penalty carry the units of each parameter's own "
      + "sensitivity, so the same lambda means the same thing for all four. "
      + "Choupo writes the equation out at src/propertyOps/"
      + "FitParameters.cpp:232 and applies the damping at "
      + "FitParameters.cpp:253.",
  },
  {
    n: 5,
    title: "Where lambda comes from: the engine reprices it, it does not line-search",
    body: "Nothing in the algebra says what lambda should be, and the honest "
      + "answer is that nobody knows in advance. So it is run as a trust "
      + "rule: take the step, evaluate the objective, and if it went DOWN "
      + "accept the step and trust the linearisation a little more; if it did "
      + "not, throw the step away and trust it a good deal less. Choupo does "
      + "not backtrack along the step and does not evaluate a merit function "
      + "— it simply reprices lambda and tries again, and the asymmetry of the "
      + "two factors is deliberate: it relaxes gently and tightens hard.",
    derivation: [
      { step: "Accepted step — the objective fell. Loosen the damping by a "
          + "factor a little under one (FitParameters.cpp:924).",
        eq: String.raw`\lambda \leftarrow 0.7\,\lambda` },
      { step: "Rejected step — the objective did not fall. The parameters do "
          + "not move at all; only the damping does, and it moves further "
          + "(FitParameters.cpp:931).",
        eq: String.raw`\lambda \leftarrow 2.5\,\lambda` },
      { step: "Singular normal matrix — the solve itself failed. Damp by a "
          + "whole order of magnitude and retry (FitParameters.cpp:901).",
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
        + "the next — the value in the dict is only where it STARTS" },
    ],
    note: "Two more things happen to a step before it is judged. It is "
      + "CLAMPED to the bounds each parameter declares in the dict "
      + "(FitParameters.cpp:906), and the run publishes `params_at_bound` so "
      + "that a parameter pressed against a limit you invented is visible "
      + "rather than silent. And convergence is declared on the RELATIVE fall "
      + "in the objective, against the `tolerance` the dict declares — not on "
      + "the size of the step and not on the residual itself.",
  },
  {
    n: 6,
    title: "The Jacobian is finite-differenced, and here that is the honest default",
    body: "Every column of J is built by moving one parameter a little and "
      + "re-running every residual. That is expensive: one iteration costs "
      + "one full sweep of the residuals per parameter to build the Jacobian, "
      + "plus one more to evaluate the trial step — five sweeps here, for four "
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
          + "(FitParameters.cpp:894).",
        eq: String.raw`J_{ij} \approx \frac{r_i(p + h\,e_j) - r_i(p)}{h}` },
      { step: "The step is RELATIVE where the parameter is large and absolute "
          + "where it is small, so one declared setting serves a coefficient "
          + "searched over plus or minus 15 and one searched over plus or "
          + "minus 5000 alike (FitParameters.cpp:888).",
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
        + "dict declares (1e-3 on this page's case)" },
      { sym: "p_j", means: "the j-th parameter, at its current value" },
      { sym: "e_j", means: "the unit vector that moves parameter j and leaves "
        + "the others alone" },
      { sym: "\\epsilon", means: "how repeatably the forward model returns "
        + "the same number — here it is the bubble-point solver's own "
        + "convergence tolerance, not machine precision" },
    ],
    note: "A FORWARD difference, not a central one: the central difference is "
      + "second-order accurate and costs twice as many model evaluations per "
      + "iteration. That is a real trade and the engine has taken one side of "
      + "it; nothing here claims it is the only defensible side.",
  },
  {
    n: 7,
    title: "Converged is not correct, and in-sample is not evidence",
    body: "Suppose the search finishes and the residuals are small. What have "
      + "you learnt? That the model can reproduce the points it was handed — "
      + "which is a statement about the model's FLEXIBILITY at least as much "
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
      { sym: "\\chi_{\\mathrm{in}}", means: "the IN-SAMPLE sum of squares, "
        + "over the fitted points only", unit: "K^2 here" },
      { sym: "\\mathrm{rms}", means: "the root-mean-square residual over the "
        + "fitted points, which is the in-sample number in the units a reader "
        + "thinks in", unit: "K" },
      { sym: "\\nu", means: "the degrees of freedom left after the fit" },
      { sym: "m", means: "the number of fitted parameters — four on this page" },
      { sym: "\\chi_{\\mathrm{red}}", means: "the reduced sum of squares, the "
        + "in-sample number per degree of freedom" },
    ],
  },
  {
    n: 8,
    title: "The order is band, partition, fit, verdict — and it is enforced by data flow",
    body: "A held-out test is only worth something if the withholding was "
      + "decided BEFORE the fit, and the criterion was decided before the "
      + "residual was seen. Otherwise both are chosen to be met, and the "
      + "whole exercise is decorative. So the case declares an acceptance "
      + "band with a stated ORIGIN, and it declares which dataset is `role "
      + "fit` and which is `role validation`, and Choupo parses and FREEZES "
      + "that declaration before any fitting code runs. The fitter is not "
      + "forbidden to peek at the held-out points; it is never handed them. "
      + "It obtains its data from one container and the held-out data lives "
      + "in another, so the guarantee is a fact about the program rather than "
      + "a rule somebody could edit away.",
    derivation: [
      { step: "The declaration is read and frozen first "
          + "(FitParameters.cpp:444), and `role` has no default — a dataset "
          + "that does not declare one is refused by name." },
      { step: "The fitter reads `part.fit()`; the held-out evidence sits in "
          + "`part.validation()` and is never passed to it "
          + "(EvidencePartition.H:225-226)." },
      { step: "After the search, the SAME residual routine is run on the "
          + "held-out points, so a difference between the two cannot be an "
          + "artefact of two evaluators.",
        eq: String.raw`\mathrm{AAD} = \frac{100}{M} \sum_{k=1}^{M}
\frac{\lvert r_k \rvert}{T_k^{\mathrm{exp}}}` },
      { step: "And the declaration carries a fingerprint, so editing it "
          + "afterwards is detectable rather than invisible "
          + "(EvidencePartition.H:288)." },
    ],
    formula: String.raw`\mathrm{AAD} = \frac{100}{M} \sum_{k=1}^{M}
\frac{\lvert r_k \rvert}{T_k^{\mathrm{exp}}}
\qquad \left[ \% \right]`,
    where: [
      { sym: "\\mathrm{AAD}", means: "the average absolute deviation over the "
        + "HELD-OUT points, as a percentage of each measured temperature — "
        + "the quantity the acceptance band is declared in", unit: "%" },
      { sym: "M", means: "the number of held-out measurements — three on this "
        + "page" },
      { sym: "r_k", means: "the residual at held-out point k, computed with "
        + "the finished parameters", unit: "K" },
      { sym: "T_k", means: "the measured bubble temperature at held-out point "
        + "k", unit: "K" },
    ],
    note: "The band on this page's case is 0.1 % of the bubble temperature, "
      + "about 0.36 K, and the case states WHY in its own dict: it is the "
      + "scatter of atmospheric bubble-point measurements in the compilation "
      + "the numbers were transcribed from. A limit with no stated origin "
      + "cannot be told apart from one chosen after the residuals were seen, "
      + "which is why Choupo makes the origin mandatory whenever a band "
      + "exists.",
  },
  {
    n: 9,
    title: "The verdict is a WORD, and the engine will not invent the band",
    body: "The last step is the one that makes the rest worth doing. Choupo "
      + "does not publish the held-out residual and leave you to feel good "
      + "about it: it compares the residual with the declared band and "
      + "publishes a word. There are five, they come from one function, and "
      + "every sink — the console, the curation dossier, the promotable "
      + "record and the result the browser reads — takes that one word rather "
      + "than deciding for itself. Read the ladder and notice what it "
      + "refuses to do: with evidence held out but NO band declared, the "
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
      { step: "heldOutPerformed — evidence WAS held out and no acceptance "
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
    note: "One home for the rule: src/propertyOps/CurationDossier.cpp:59-63, "
      + "five lines you can read end to end. The verdict is taken ONCE in the "
      + "run (FitParameters.cpp:1372) and travels to every sink from there "
      + "through src/propertyOps/PropertyOperation.H:116, the channel that "
      + "carries the CURATION axis as words — "
      + "it used to be recomputed at three call sites, one of them inside a "
      + "verbosity test, and a verdict that depends on how loudly the run was "
      + "asked to speak is not a verdict.",
  },
  {
    n: 10,
    title: "Identifiability is a different question, and this fit fails it",
    body: "A model that predicts well and coefficients that are individually "
      + "determined are two separate claims, and the run below makes one and "
      + "not the other. After the search Choupo rebuilds the Jacobian at the "
      + "answer, inverts the normal matrix, and reports a standard error and "
      + "a 95 % interval per parameter, the correlation between every pair, "
      + "and a condition number. On this case two pairs of parameters are "
      + "correlated to within a ten-thousandth of perfectly and the condition "
      + "number comes out around 4e11; the panel below reports, per "
      + "parameter, whether the fitted value is bigger than its own 95 % "
      + "interval, and on the shipped run it is not. The reason is "
      + "physical, not numerical: the two halves of an NRTL coefficient "
      + "always appear together as one temperature-dependent group, so eight "
      + "points over a narrow temperature span cannot separate them. Data at "
      + "a second pressure could.",
    derivation: [
      { step: "The covariance of the parameters, scaled by the in-sample "
          + "variance per degree of freedom.",
        eq: String.raw`C = \chi^2_{\mathrm{red}} \left( J' J \right)^{-1}` },
      { step: "The 95 % interval uses Student's t at the degrees of freedom "
          + "you actually have. With four of them t is 2.776, not 1.96, and "
          + "the interval is some 40 % wider than the normal one "
          + "(FitParameters.cpp:218).",
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
        + "degrees of freedom — 2.776 here, and 1.96 only in the limit of "
        + "many points" },
      { sym: "\\rho_{jk}", means: "the correlation between parameters j and "
        + "k. Close to plus or minus one means the two trade off and the fit "
        + "determines only their combination" },
      { sym: "k", means: "a second index over the parameters, so the last "
        + "expression is one pair at a time" },
    ],
    note: "Choupo calls a fit identifiable only when the normal matrix "
      + "inverted, there are degrees of freedom left, the condition number is "
      + "below 1e8, AND no pair is correlated past 0.999 "
      + "(FitParameters.cpp:1075). The naive test — did it invert? — passes "
      + "on exactly this case, which is why it is not the test.",
  },
  {
    n: 11,
    title: "What survives the run, and what a reader months later can check",
    body: "The console scrolls. What outlives it is the file, and a promoted "
      + "parameter record is going to be moved into a catalogue folder and "
      + "simulated with by somebody who never saw this page. So Choupo writes "
      + "the whole qualification into the record, not the four numbers alone: "
      + "the origin word and the method that produced it, both datasets with "
      + "the role each was frozen in, the fingerprint of that declaration, "
      + "the held-out deviation over the withheld points, the band with the "
      + "reason it was set where it was, the verdict — and, in the header "
      + "above everything, the warning that these coefficients are not "
      + "individually identifiable. The record is written AFTER the held-out "
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
      + "answer when the measurement errors are independent, zero-mean and "
      + "all of the same size. Nothing in this run tests any of those. The "
      + "dataset declares no per-point uncertainty, so the fit treats a point "
      + "at the azeotrope and a point in the dilute corner as equally "
      + "trustworthy, which the underlying measurements almost certainly are "
      + "not. What follows is not that the answer is wrong — it is that the "
      + "confidence intervals in step 10 inherit the assumption, and are "
      + "honest only to the extent it holds.",
  },
  {
    id: "evidence-quality",
    title: "A fit is only as good as its evidence, and held out is not independent",
    body: "The eleven points on this page come from ONE compilation, at ONE "
      + "pressure, transcribed within this repository. Splitting them into "
      + "eight and three tests whether the model INTERPOLATES the same "
      + "experiment, which is a real and useful question and a much weaker "
      + "one than whether it agrees with somebody else's laboratory. Choupo "
      + "is explicit about how little it can settle here: it checks the one "
      + "mechanical question that is a fact — whether the same DOI or hash "
      + "appears in both roles — and announces the rest for a human to judge. "
      + "Both datasets on this page declare no DOI at all, and the run says "
      + "so.",
  },
  {
    id: "extrapolation",
    title: "Outside the evidence window the engine announces, it does not prevent",
    body: "A fitted parameter is established over the range the evidence "
      + "covers, and nothing stops you using it outside that range. This very "
      + "run meets the problem on the way: it evaluates ethanol's vapour "
      + "pressure at 372 K, outside the 273-369 K window that component's own "
      + "record declares, and says so at the site and again in the caveat "
      + "block at the end. It does not refuse, because extrapolating is a "
      + "legitimate choice a reader may need to make. The held-out band "
      + "covers compositions from 0.20 to 0.80 mole fraction, and says "
      + "nothing whatever about the dilute ends.",
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
      + "reason — and the same file records that the parameters are not "
      + "individually identifiable, so both facts reach the reader together.",
  },
  {
    id: "one-optimiser-one-start",
    title: "One algorithm, one starting guess, and no search for a second minimum",
    body: "Levenberg-Marquardt is a LOCAL method: it walks downhill from "
      + "wherever it is put. The starting values are declared in the case, "
      + "and a different starting point may well land on a different set of "
      + "coefficients — the more so here, where a whole valley of parameter "
      + "combinations fits about equally well. Choupo does not multi-start "
      + "this operation, does not search globally, and does not report a "
      + "basin of attraction. Change the damping on the panel below and watch "
      + "the iteration count move a great deal while the answer barely does; "
      + "that is this problem being well behaved from this start, not a "
      + "guarantee about the next one.",
  },
];
