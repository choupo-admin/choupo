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
  dataReconciliationLesson -- the text of "Data reconciliation, and how Bayes
  helps" (DEV.md 4c C121).

  THE SCOPE IS VITOR'S, approved on 2026-10-20: four pages -- why the
  measurements do not close a balance; reconciliation as weighted least
  squares under the balances AND as the Bayesian posterior mode with
  Gaussian noise and a flat prior (the bridge is the point); gross errors,
  the global and the measurement test; a prior that is not flat, and the
  posterior covariance.  No Kalman filter.  SYNTHETIC data: a small invented
  plant, said so on screen.

  BAYES MADE VISIBLE AND CENTRAL (DEV.md 4c C137, Vitor, 2026-10-21: Bayes
  could hardly be seen in the first part of the tool).  A PLACEMENT and
  EMPHASIS change, no new engine physics: the prior / likelihood / posterior
  framing opens page 1 (step 1) and is named again where each ingredient is
  met (steps 2, 3, 6); page 2 says the answer is a DISTRIBUTION and draws it
  narrowing (step 7); page 3 says the tests are FREQUENTIST and names the
  Bayesian fault probability it does not build (steps 11, 12, 14); page 4
  says exactly what the witness's 2 % prior width is and writes the
  process-evolution widening the engine does not represent (steps 17, 18);
  a fifth page sets the three answers side by side -- classical, Bayes with
  a flat prior, Bayes with yesterday's prior (step 20).  The idea the page
  is built on is Vitor's sentence, rendered in English as CENTRAL_IDEA.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, and
  tests/dataReconciliationLesson.test.ts holds each citation to the source
  text it names.  Every number the page shows is read from the witness's
  CSVs or its result JSON (tutorials/props/reconciliation/
  reconcile01_recycle_loop); the page computes no reconciliation.  The
  primary sources are named by TITLE only.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

/** The idea the whole page is built on: Vitor's sentence (DEV.md 4c C137),
 *  rendered in English.  Drawn at the top of the tool and restated, in the
 *  lesson's own words, by steps 1 and 20. */
export const CENTRAL_IDEA = "Bayes is not merely a different way of calculating the same "
  + "result.  It is a way of representing, and updating, what we know about "
  + "the state of a process.";

/** The three ingredients, one line each, drawn under CENTRAL_IDEA. */
export const THREE_INGREDIENTS: readonly { word: string; means: string }[] = [
  { word: "prior", means: "what was known before the meters were read; at the least, that the balances hold exactly" },
  { word: "likelihood", means: "what the meters say: how probable today's readings are for each possible true state" },
  { word: "posterior", means: "what is believed now: the prior times the likelihood, a distribution with a centre and a width" },
];

export const DR_STEPS: readonly LessonStep[] = [
  // ---- Page 1: why the measurements do not close a balance ------------------
  {
    n: 1,
    title: "What was known, what the meters say, what is believed now",
    body: "One idea runs through every page of this tool, and it is worth "
      + "stating before any plant is drawn: Bayes is not merely a different "
      + "way of calculating the same result -- it is a way of representing, "
      + "and updating, what we know about the state of a process.  Three "
      + "ingredients carry it.  The PRIOR is what was known about the true "
      + "flows before the meters were read: at the very least that the mass "
      + "balances hold exactly, and sometimes more, such as yesterday's "
      + "estimate (page 4).  The LIKELIHOOD is what the meters say: how "
      + "probable today's readings would be if the true flows were x, set by "
      + "each meter's own uncertainty (step 2).  The POSTERIOR is what is "
      + "believed now: the prior times the likelihood, by Bayes' rule.  So "
      + "the answer is not a set of flows but a DISTRIBUTION over the flows, "
      + "with a most probable point and a width -- and a narrower posterior "
      + "is more knowledge.  The balances never become uncertain on the way: "
      + "whatever else the prior says, it gives zero probability to every "
      + "flow vector that does not close them.",
    formula: String.raw`p(x \,|\, m) \;\propto\; p(m \,|\, x)\; p(x), \qquad p(x) = 0 \ \text{wherever}\ A\,x \ne 0`,
    where: [
      { sym: "p", means: "a probability density: p(x) the prior, p(m | x) the likelihood, p(x | m) the posterior", unit: "-" },
      { sym: "x", means: "the vector of true flows, the state the page is uncertain about", unit: "t/h" },
      { sym: "m", means: "the vector of the meters' readings", unit: "t/h" },
      { sym: "A", means: "the balances, written as a matrix (step 3): A x = 0 says every node closes", unit: "-" },
    ],
    note: "The rest of page 1 builds the likelihood and the balances; page 2 "
      + "reads the posterior; page 3 asks whether a meter has failed; page 4 "
      + "makes the prior say more; page 5 sets the three answers side by "
      + "side.",
  },
  {
    n: 2,
    title: "A plant read at one instant",
    body: "The plant on this page is invented, and so are its numbers: a fresh "
      + "feed is mixed with a recycle, passes a reactor and a separator, and "
      + "the separator's overhead is split into a purge and the recycle.  "
      + "Seven streams, seven flow meters.  Each meter reports the true flow "
      + "plus an error, and the error of a meter in good order is random: "
      + "sometimes high, sometimes low, rarely by much more than its standard "
      + "uncertainty.  In this invented plant that uncertainty is declared "
      + "per INSTRUMENT -- a big meter on the reactor line reads to 3 t/h "
      + "either way, a small one on the purge to 0.4 t/h -- and the case "
      + "declares it beside the stream it measures, not beside a day's "
      + "reading.  In a real plant the instrument is only part of it: the "
      + "installation, the calibration, the sampling and the process itself "
      + "add their own, and two meters calibrated against one standard can "
      + "share an error, which a diagonal list of sigmas cannot say.  Because the plant is "
      + "invented, its TRUE flows are known too, and the page shows them; no "
      + "real plant can.  In the words of step 1, this model of the meters IS "
      + "the likelihood: it says how probable each reading is for every "
      + "possible true flow.",
    formula: String.raw`m_j = x_j + \varepsilon_j, \qquad \varepsilon_j \sim \mathrm{N}(0,\ \sigma_j^2)`,
    where: [
      { sym: "m_j", means: "the reading of meter j", unit: "t/h" },
      { sym: "x_j", means: "the true flow of stream j", unit: "t/h" },
      { sym: "\\varepsilon_j", means: "the meter's random error", unit: "t/h" },
      { sym: "\\mathrm{N}", means: "the normal (Gaussian) distribution, written with its mean and variance", unit: "-" },
      { sym: "\\sigma_j", means: "the meter's standard uncertainty, declared for the instrument", unit: "t/h" },
    ],
    note: "Independence is part of the statement: one meter's error tells "
      + "nothing about another's.  A common cause -- two meters calibrated "
      + "against the same faulty reference -- breaks it, and nothing on this "
      + "page would detect that.",
  },
  {
    n: 3,
    title: "The balances the true flows obey",
    body: "At steady state each node neither gains nor loses mass, so what "
      + "flows in equals what flows out.  Write one row per node and one "
      + "column per stream, +1 where the stream enters and -1 where it "
      + "leaves: that table is the incidence matrix, and the four balances "
      + "are one matrix equation.  The mixer's row reads F1 + F7 - F2 = 0, "
      + "the reactor's F2 - F3 = 0, the separator's F3 - F4 - F5 = 0, the "
      + "splitter's F5 - F6 - F7 = 0.  The plant's overall balance, F1 = F4 + "
      + "F6, is their sum, so it is not a fifth piece of knowledge, and the "
      + "engine refuses a balance declared beside the ones it repeats: the "
      + "number of INDEPENDENT balances is the number every test below "
      + "counts with.  The balances are exact.  Unlike the meters, they are "
      + "not an opinion about the plant -- in the words of step 1 they belong "
      + "to the PRIOR, as the part of it that is certain.",
    formula: String.raw`A\,x = 0, \qquad A_{kj} = \begin{cases} +1 & \text{if stream } j \text{ enters node } k \\ -1 & \text{if stream } j \text{ leaves node } k \\ 0 & \text{otherwise} \end{cases}`,
    where: [
      { sym: "A", means: "the incidence matrix, one row per node balance and one column per stream", unit: "-" },
      { sym: "x", means: "the vector of true flows", unit: "t/h" },
      { sym: "A_{kj}", means: "the entry of node k and stream j", unit: "-" },
      { sym: "j", means: "the index of a stream (and of its meter)", unit: "-" },
      { sym: "k", means: "the index of a node balance", unit: "-" },
    ],
  },
  {
    n: 4,
    title: "The readings do not close them, and by how much noise alone would",
    body: "Put the readings into the balances and none of them closes.  That "
      + "is not a fault: it is what noisy meters do.  The residual of a "
      + "balance is a sum of meter errors, so it is random too, and its "
      + "standard deviation follows from the meters' -- variances add.  The "
      + "table below is the engine's own: each balance's residual at the "
      + "readings, its standard deviation, and their ratio.  A ratio of 1 "
      + "or 2 is noise doing what noise does; the mixer's +1.6 here is "
      + "unremarkable.  The question the next page answers is what to "
      + "BELIEVE about the flows when every balance disagrees a little; the "
      + "question page 3 answers is how large a disagreement has to be "
      + "before noise stops being a credible excuse.",
    derivation: [
      { step: "The residual of the readings: substitute m = x + epsilon, and use A x = 0.",
        eq: String.raw`r = A\,m = A\,x + A\,\varepsilon = A\,\varepsilon` },
      { step: "Its covariance, with the meters independent so that the covariance of their errors is the diagonal matrix of their variances:",
        eq: String.raw`\mathrm{Cov}(r) = A\,C\,A^{T}, \qquad C = \mathrm{diag}(\sigma_j^2)` },
    ],
    formula: String.raw`\frac{r_k}{\sqrt{(A\,C\,A^{T})_{kk}}} \sim \mathrm{N}(0,\ 1)`,
    where: [
      { sym: "r", means: "the vector of balance residuals at the readings", unit: "t/h" },
      { sym: "r_k", means: "the residual of balance k", unit: "t/h" },
      { sym: "m", means: "the vector of readings", unit: "t/h" },
      { sym: "\\varepsilon", means: "the vector of meter errors", unit: "t/h" },
      { sym: "C", means: "the covariance of the meter errors: diagonal, the variances sigma_j squared", unit: "(t/h)²" },
      { sym: "\\mathrm{Cov}", means: "the covariance of the random vector it is applied to", unit: "(t/h)²" },
      { sym: "\\mathrm{diag}", means: "the diagonal matrix with the entries shown, one per meter", unit: "-" },
      { sym: "n", means: "the number of meters", unit: "-" },
      { sym: "(A\\,C\\,A^{T})_{kk}", means: "the variance of the residual of balance k", unit: "(t/h)²" },
    ],
    note: "The engine writes these three columns to the balance table "
      + "(residual, residualSigma, residualTest); nothing in the table is "
      + "computed on this page.",
  },

  // ---- Page 2: reconciliation, read twice --------------------------------
  {
    n: 5,
    title: "Reconciliation: move the readings as little as their meters allow",
    body: "Look for the flows that close every balance and lie as close to "
      + "the readings as possible, where CLOSE is measured in each meter's "
      + "own standard deviations: moving a 3 t/h meter by 3 t/h costs as "
      + "much as moving a 0.4 t/h meter by 0.4 t/h.  That is weighted least "
      + "squares under the balances.  A meter you trust less absorbs more of "
      + "the correction, a meter you trust more absorbs less, and a balance "
      + "never absorbs any, because it is exact.  The engine does not solve "
      + "this on its own for this page: the operation assembles one row per "
      + "meter and one law per balance and hands them to the engine's single "
      + "weighted least squares, the one that reconciles a laboratory water "
      + "analysis (DataReconciliation.cpp:673) -- one home for the method, "
      + "whatever the measurements are.",
    formula: String.raw`\hat{x} = \operatorname*{arg\,min}_{x} \sum_{j=1}^{n} \left(\frac{x_j - m_j}{\sigma_j}\right)^{2} \quad \text{subject to} \quad A\,x = 0`,
    where: [
      { sym: "\\hat{x}", means: "the reconciled flows", unit: "t/h" },
    ],
    note: "That solver also keeps every flow non-negative.  On this plant no "
      + "flow is anywhere near zero, so that bound never binds, and the "
      + "engine refuses to publish the statistics below on a run where it "
      + "does -- they assume it does not.",
  },
  {
    n: 6,
    title: "The same answer, read as Bayes: the most probable true state",
    body: "Ask a different question: given these readings, which true flows "
      + "are most PROBABLE?  Bayes' rule answers it with the ingredients of "
      + "step 1, now written out.  "
      + "The likelihood says how probable the readings are if the flows were "
      + "x -- with Gaussian meters it is a product of seven bell curves, "
      + "each as wide as its meter's sigma.  The prior says what was known "
      + "about x before the meters were read: here, only that the balances "
      + "hold, and nothing else -- a FLAT prior on every flow vector that "
      + "closes the balances, and zero probability on every one that does "
      + "not.  Multiply them and the posterior is the likelihood on the "
      + "balance subspace.  Its peak, the posterior MODE, is where the sum of "
      + "squares in step 5 is smallest, because the exponential of minus "
      + "half of it is largest there.  So the two readings are one answer: "
      + "the sigmas are the likelihood, the balances are certain knowledge, "
      + "and the reconciled flows are the most probable true state.",
    derivation: [
      { step: "Bayes' rule for the flows given the readings:",
        eq: String.raw`p(x \,|\, m) \propto p(m \,|\, x)\; p(x)` },
      { step: "The likelihood of independent Gaussian meters:",
        eq: String.raw`p(m \,|\, x) \propto \exp\!\left(-\frac{1}{2}\sum_{j} \frac{(m_j - x_j)^2}{\sigma_j^2}\right)` },
      { step: "The flat prior on the balance subspace: a constant where A x = 0, zero elsewhere.  The posterior is then the likelihood restricted to that subspace, and minus twice its logarithm is the sum of squares plus a constant -- so the mode is the minimiser of step 5.",
        eq: String.raw`-2 \ln p(x \,|\, m) = \sum_{j} \left(\frac{x_j - m_j}{\sigma_j}\right)^{2} + \text{const}, \qquad A\,x = 0` },
    ],
    formula: String.raw`\hat{x} = \operatorname*{arg\,max}_{A x = 0}\; p(x \,|\, m)`,
    where: [
      { sym: "p", means: "a probability density: p(m | x) the likelihood, p(x) the prior, p(x | m) the posterior", unit: "-" },
    ],
    note: "Why a mode and not a mean?  For a Gaussian on a flat subspace "
      + "they are the same point.  They part only when a bound binds or the "
      + "model is not linear -- neither happens on this page.",
  },
  {
    n: 7,
    title: "The answer is a distribution, not a set of flows",
    body: "The most probable point is only half of what Bayes returns.  With "
      + "Gaussian meters and linear balances the posterior is itself a "
      + "Gaussian, so every reconciled flow comes with a standard deviation: "
      + "a statement of how well the true flow is now KNOWN, not only where "
      + "it most probably is.  And that width is narrower than the meter's.  "
      + "A meter alone says one thing about its own stream; through the "
      + "balances, every other meter says something about it too, because "
      + "the flows they read are tied to it.  The drawing below puts the two "
      + "beside each other for one stream at a time: the likelihood of the "
      + "meter alone, centred on its reading and as wide as its sigma, and "
      + "the posterior after the balances, centred on the reconciled flow "
      + "and as wide as the engine's posterior standard deviation.  Then all "
      + "seven at once.  Where those widths come from is page 4.",
    formula: String.raw`x_j \,|\, m \;\sim\; \mathrm{N}\!\left(\hat{x}_j,\ \Sigma_{jj}\right), \qquad \sqrt{\Sigma_{jj}} \;<\; \sigma_j`,
    where: [
      { sym: "x_j", means: "the true flow of stream j, uncertain", unit: "t/h" },
      { sym: "\\hat{x}_j", means: "the reconciled flow of stream j: the centre of its posterior", unit: "t/h" },
      { sym: "\\Sigma_{jj}", means: "the posterior variance of stream j, the engine's sigmaReconciled squared (derived on page 4)", unit: "(t/h)²" },
      { sym: "\\sigma_j", means: "the standard uncertainty of meter j", unit: "t/h" },
      { sym: "\\mathrm{N}", means: "the normal (Gaussian) distribution, written with its mean and variance", unit: "-" },
    ],
    note: "The inequality is strict for a meter that appears in a balance "
      + "with other meters; a meter in no balance would keep its own width.",
  },
  {
    n: 8,
    title: "The answer in closed form, and what each balance did",
    body: "With the bound inactive the problem has a closed form.  Attach one "
      + "Lagrange multiplier to each balance, set the derivative of the "
      + "Lagrangian to zero, and the reconciled flows are the readings minus "
      + "a correction that each balance contributes through its multiplier.  "
      + "The multiplier is fixed by the balance's own residual: a balance "
      + "that closed at the readings would get zero.  Divide the correction "
      + "by each meter's sigma and it splits EXACTLY into one part per "
      + "balance; the table's by-balance columns are those parts, and they "
      + "add up to each meter's adjustment.  The engine publishes the "
      + "multiplier of each balance as written (AnalysisReconciler.cpp:248) "
      + "-- its solver works on rows rescaled to sigma units and turns its "
      + "own multiplier back into this one.",
    derivation: [
      { step: "The Lagrangian of step 5, with one multiplier per balance:",
        eq: String.raw`L = \frac{1}{2}(x - m)^{T} C^{-1} (x - m) + \lambda^{T} A\,x` },
      { step: "Stationary in x:",
        eq: String.raw`C^{-1}(\hat{x} - m) + A^{T}\lambda = 0 \;\Rightarrow\; \hat{x} = m - C\,A^{T}\lambda` },
      { step: "The balances must close at the answer, which fixes the multipliers by the residual r = A m:",
        eq: String.raw`A\,m - A\,C\,A^{T}\lambda = 0 \;\Rightarrow\; \lambda = (A\,C\,A^{T})^{-1} r` },
    ],
    formula: String.raw`\frac{\hat{x}_j - m_j}{\sigma_j} = \sum_{k} \left(-\,\sigma_j\, A_{kj}\, \lambda_k\right)`,
    where: [
      { sym: "L", means: "the Lagrangian", unit: "-" },
      { sym: "\\lambda", means: "the vector of Lagrange multipliers, one per balance", unit: "h/t" },
      { sym: "\\lambda_k", means: "the multiplier of balance k", unit: "h/t" },
      { sym: "\\hat{x}_j", means: "the reconciled flow of stream j", unit: "t/h" },
      { sym: "-\\,\\sigma_j\\, A_{kj}\\, \\lambda_k", means: "the part of meter j's adjustment, in sigma, that balance k caused", unit: "-" },
    ],
    leadsTo: {
      tool: "active-set-qp",
      toolLabel: "Quadratic programming with constraints (active set)",
      stepTitle: "The multiplier is a price, and here it is a number of standard deviations",
      body: "The solver behind this answer is the active-set method, and the "
        + "same reconciliation of a laboratory water analysis is walked there "
        + "step by step -- where the non-negativity bound DOES bind.",
    },
  },
  {
    n: 9,
    title: "Against the truth: closer on average, not meter by meter",
    body: "Because the plant is invented, the true flows are on the page.  "
      + "Measure the errors in meter sigmas, before and after, and take "
      + "their root mean square: on the honest snapshot the readings sit "
      + "about 0.8 sigma from the truth and the reconciled flows about 0.44.  "
      + "That is what the redundancy buys -- four balances' worth of extra "
      + "information spread over seven meters.  But read the table row by "
      + "row: a meter whose error happened to be large in the direction the "
      + "balances pull improves a great deal, and one whose error the others "
      + "could not see barely moves.  Reconciliation is better on AVERAGE, "
      + "which is the only promise a least-squares estimate makes.",
    formula: String.raw`e_\mathrm{rms} = \sqrt{\frac{1}{n} \sum_{j} \left(\frac{\hat{x}_j - x_j}{\sigma_j}\right)^{2}}`,
    where: [
      { sym: "e_\\mathrm{rms}", means: "the root-mean-square error, in meter sigmas (the readings' version puts m_j in place of the reconciled flow)", unit: "-" },
    ],
  },

  // ---- Page 3: gross errors -------------------------------------------------
  {
    n: 10,
    title: "A meter that lies",
    body: "A meter can do worse than be noisy: it can be WRONG -- drifted out "
      + "of calibration, fouled, wired to the wrong transmitter.  Such a "
      + "gross error is not random from one reading to the next, so it is "
      + "not described by the meter's sigma, and reconciliation, which "
      + "trusts the sigmas, cannot recognise it as different from noise.  "
      + "The exercise plants one: the reactor-effluent meter F3 reads 15 t/h "
      + "high -- five of its own sigmas -- and nothing else changes.  The "
      + "two balances F3 appears in jump at once, the reactor's to about -4.7 "
      + "and the separator's to about +4.1 of their own standard deviations, "
      + "while the other two do not move.  Choose another meter and another "
      + "size below, and the engine runs again in your browser.",
  },
  {
    n: 11,
    title: "The global test: is the whole snapshot consistent with noise?",
    body: "The objective at the answer -- the sum of squared adjustments, "
      + "each in its own meter's sigmas -- is a single number that says how "
      + "hard the readings had to be pushed to close the balances.  If the "
      + "meters carry only their declared noise, that number has a known "
      + "distribution: chi-square, with as many degrees of freedom as there "
      + "are independent balances.  Choose the probability of a false alarm "
      + "you accept (alpha, declared by the case, never defaulted) and read "
      + "the critical value; above it, the snapshot is not credible as noise "
      + "alone (DataReconciliation.cpp:740).  The honest snapshot scores "
      + "about 3.2 against a critical 9.49; the drifted one about 26.7.  The "
      + "test says SOMETHING is wrong.  It does not say what.  And it is a "
      + "FREQUENTIST test, not a Bayesian one, even on a page about Bayes: it "
      + "assumes every meter healthy and asks how often noise alone would "
      + "push the objective this high.  Its p-value is a probability of the "
      + "DATA under that assumption, never the probability that the "
      + "assumption is false (step 14).",
    derivation: [
      { step: "The adjustments of the closed form, with the readings' residual r = A epsilon from step 4:",
        eq: String.raw`a = \hat{x} - m = -\,C\,A^{T}(A\,C\,A^{T})^{-1} r` },
      { step: "So the objective is a quadratic form in the residual, weighted by the inverse of its own covariance -- a sum of squares of independent standard normals:",
        eq: String.raw`\gamma = a^{T} C^{-1} a = r^{T} (A\,C\,A^{T})^{-1} r \sim \chi^2_{\nu}` },
    ],
    formula: String.raw`\gamma > \chi^2_{\nu,\,1-\alpha} \;\Rightarrow\; \text{a gross error is suspected}, \qquad \nu = \mathrm{rank}(A)`,
    where: [
      { sym: "a", means: "the vector of adjustments, reconciled minus read", unit: "t/h" },
      { sym: "\\gamma", means: "the objective at the answer: the global test statistic", unit: "-" },
      { sym: "\\chi^2_{\\nu}", means: "the chi-square distribution with nu degrees of freedom", unit: "-" },
      { sym: "\\chi^2_{\\nu,\\,1-\\alpha}", means: "its critical value: exceeded with probability alpha by noise alone", unit: "-" },
      { sym: "\\nu", means: "the degrees of freedom: the number of independent balances", unit: "-" },
      { sym: "\\alpha", means: "the probability of a false alarm the test accepts", unit: "-" },
      { sym: "\\mathrm{rank}", means: "the rank of a matrix: its number of independent rows", unit: "-" },
    ],
  },
  {
    n: 12,
    title: "The measurement test: which meter?",
    body: "Each adjustment is random too, and its standard deviation is "
      + "known: it is the square root of a diagonal entry of the covariance "
      + "of the adjustments.  Divide each adjustment by it and every meter "
      + "gets a standard-normal score (DataReconciliation.cpp:754).  Seven "
      + "meters are seven tests, so a 5 % false alarm on each would cry wolf "
      + "on about one snapshot in three; the critical value is therefore "
      + "taken at the level that keeps the chance of ANY false alarm at "
      + "alpha (the Sidak correction, DataReconciliation.cpp:758), which for "
      + "seven meters is about 2.68 instead of 1.96.  On the drifted "
      + "snapshot F3 scores about -4.86 and is flagged; F2, its neighbour "
      + "across the reactor, scores about +2.57 -- pushed up by F3's error, "
      + "and only just under the line.  Frequentist too, like the global "
      + "test: alpha is a promise about the long run of healthy snapshots, "
      + "not a statement about this one.",
    derivation: [
      { step: "The adjustments are a linear map of the meter errors, so their covariance is:",
        eq: String.raw`V = \mathrm{Cov}(a) = C\,A^{T}(A\,C\,A^{T})^{-1} A\,C` },
    ],
    formula: String.raw`z_j = \frac{a_j}{\sqrt{V_{jj}}}, \qquad |z_j| > z_{1-\beta/2}, \qquad \beta = 1 - (1 - \alpha)^{1/N}`,
    where: [
      { sym: "V", means: "the covariance of the adjustments", unit: "(t/h)²" },
      { sym: "V_{jj}", means: "the variance of meter j's adjustment", unit: "(t/h)²" },
      { sym: "z_j", means: "the measurement test of meter j", unit: "-" },
      { sym: "a_j", means: "meter j's adjustment", unit: "t/h" },
      { sym: "z_{1-\\beta/2}", means: "the two-sided standard-normal critical value at level beta", unit: "-" },
      { sym: "\\beta", means: "the per-meter level that keeps the overall false-alarm probability at alpha", unit: "-" },
      { sym: "N", means: "the number of redundant meters tested", unit: "-" },
    ],
    note: "A meter that appears in no balance cannot be tested -- its "
      + "adjustment is always zero and so is its variance.  The engine "
      + "marks such a meter not redundant rather than dividing by zero.",
  },
  {
    n: 13,
    title: "Detected, not reconciled away",
    body: "Left in, the bad reading is not ignored: it is SPREAD.  The "
      + "reconciliation obeys the balances, so F3's 15 t/h has to go "
      + "somewhere, and it goes to the meters that share a balance with it "
      + "-- the reconciled F2 and F3 both land near 153 t/h against a true "
      + "150, and F4 and F7 move by more than half a sigma for an error that "
      + "is not theirs.  The cure is to take the meter out of service.  Its "
      + "flow becomes UNMEASURED, and a balance that contains an unmeasured "
      + "flow says nothing about the measured ones until the unmeasured flow "
      + "is eliminated: the engine combines the balances so that it cancels "
      + "-- here the reactor and the separator merge into one envelope, F2 "
      + "- F4 - F5 = 0 -- and reconciles the six remaining meters against "
      + "three balances.  The global test passes again; F3 is read back "
      + "from the balances with its own uncertainty; and the excluded "
      + "reading's distance from that estimate, in standard deviations, is "
      + "exactly the measurement test F3 scored while it was still in "
      + "service.  That identity is the point of the measurement test: it "
      + "asks whether a meter agrees with what the rest of the plant says.",
    derivation: [
      { step: "Split the balances into the measured flows and the unmeasured ones, and find combinations of balances in which the unmeasured columns cancel:",
        eq: String.raw`A\,x = A_m x_m + A_u x_u = 0, \qquad P\,A_u = 0 \;\Rightarrow\; P\,A_m\, x_m = 0` },
      { step: "Reconcile the measured flows against P A_m, then read the unmeasured ones back from the balances (DataReconciliation.cpp:722):",
        eq: String.raw`\hat{x}_u = -(A_u^{T} A_u)^{-1} A_u^{T} A_m\, \hat{x}_m` },
    ],
    formula: String.raw`t_j = \frac{m_j - \hat{x}_j}{\sqrt{\sigma_j^2 + \Sigma_{jj}}}`,
    where: [
      { sym: "A_m", means: "the columns of A that belong to the meters still in service", unit: "-" },
      { sym: "A_u", means: "the columns of A that belong to the unmeasured flows", unit: "-" },
      { sym: "x_m", means: "the measured flows", unit: "t/h" },
      { sym: "x_u", means: "the unmeasured flows", unit: "t/h" },
      { sym: "P", means: "a matrix whose rows combine node balances so that every unmeasured flow cancels", unit: "-" },
      { sym: "\\hat{x}_m", means: "the reconciled measured flows", unit: "t/h" },
      { sym: "\\hat{x}_u", means: "the unmeasured flows read back from the balances", unit: "t/h" },
      { sym: "t_j", means: "the excluded meter's test: its reading against what the rest of the plant says", unit: "-" },
      { sym: "\\Sigma_{jj}", means: "the posterior variance of the estimate of stream j (page 4)", unit: "(t/h)²" },
    ],
    note: "Removing a meter costs a balance: three degrees of freedom are "
      + "left instead of four.  Remove the wrong set -- all four streams of "
      + "the recycle loop, round which a flow could circulate without any "
      + "balance noticing -- and the unmeasured flows are no longer "
      + "determined; the engine refuses that by name.",
  },
  {
    n: 14,
    title: "Two different questions: the frequentist test and a Bayesian one",
    body: "The global test and the measurement test are FREQUENTIST, not "
      + "Bayesian, and the difference is the question each asks.  A "
      + "frequentist test fixes a hypothesis -- every meter healthy -- and "
      + "asks how often noise alone would produce a statistic at least this "
      + "large; alpha is a promise about the long run, that of all the "
      + "healthy snapshots a plant will ever take, a fraction alpha will be "
      + "flagged by mistake.  What it never returns is the probability that "
      + "THIS meter is faulty, given THESE readings -- which is the question "
      + "an operator actually asks.  A Bayesian answer to that question "
      + "exists and is NOT built here.  It needs two things the tests do "
      + "not: a prior probability that each meter has failed (from its "
      + "maintenance history, say), and an error model for a FAULTY meter as "
      + "well as for a healthy one (a bias of unknown size, or a much wider "
      + "noise).  Bayes' rule over the hypotheses -- no meter faulty, meter 1 "
      + "faulty, meter 2 faulty, and so on -- then returns the posterior "
      + "probability of each.  Its answer moves with the failure prior and "
      + "with the faulty-meter model, which is why it is not a drop-in "
      + "replacement for the tests: it answers a different question, and "
      + "needs more knowledge to do so.",
    formula: String.raw`\mathrm{Pr}(H_j \,|\, m) = \frac{p(m \,|\, H_j)\; \mathrm{Pr}(H_j)}{\sum_{k=0}^{n} p(m \,|\, H_k)\; \mathrm{Pr}(H_k)}`,
    where: [
      { sym: "\\mathrm{Pr}", means: "the probability of a hypothesis: Pr(H_j) before the readings (the failure prior), Pr(H_j | m) after them", unit: "-" },
      { sym: "H_j", means: "the hypothesis that meter j, and only meter j, is faulty", unit: "-" },
      { sym: "H_k", means: "any one of the hypotheses: H_0 every meter healthy, H_1 to H_n one meter faulty", unit: "-" },
      { sym: "p", means: "the probability density of the readings under a hypothesis, which needs an error model for the faulty meter", unit: "-" },
      { sym: "k", means: "the index running over the hypotheses", unit: "-" },
    ],
    note: "Named and not computed: the engine publishes the frequentist tests "
      + "only, and the page draws no fault probability.",
  },

  // ---- Page 4: priors and the posterior covariance --------------------------
  {
    n: 15,
    title: "What reconciliation buys: the posterior covariance",
    body: "The reconciled flows are random -- different noise, different "
      + "answer -- and their covariance is known in closed form: the meters' "
      + "covariance minus the covariance of the adjustments "
      + "(DataReconciliation.cpp:701).  Its diagonal gives each reconciled "
      + "flow's standard deviation, and every one is SMALLER than its meter's: "
      + "the big reactor-line meters go from 3 t/h to about 1.3, because the "
      + "balances let every other meter vouch for them.  The purge meter "
      + "barely improves, 0.40 to about 0.39 -- it is already far more "
      + "precise than any combination of the meters around it.  The "
      + "off-diagonal entries are not zero either: two reconciled flows "
      + "joined by a balance share information and are correlated (F2 and F3, "
      + "tied by the reactor, come out perfectly so).  One matrix, two "
      + "readings, again.  The derivation below is frequentist: it is the "
      + "scatter of the reconciled flows over many snapshots of the same "
      + "plant.  With a flat prior, the SAME matrix is the width of the "
      + "posterior of step 7: how uncertain the true flows of THIS snapshot "
      + "still are, given its readings.  On a linear Gaussian problem the two "
      + "numbers coincide; the two questions do not.",
    derivation: [
      { step: "The reconciled flows are a linear map of the readings:",
        eq: String.raw`\hat{x} = \left(I - C\,A^{T}(A\,C\,A^{T})^{-1}A\right) m` },
      { step: "Propagate the readings' covariance C through it; the cross terms collapse because the map is a projection:",
        eq: String.raw`\Sigma = \mathrm{Cov}(\hat{x}) = C - V` },
    ],
    formula: String.raw`\sigma_{\hat{x},j} = \sqrt{\Sigma_{jj}} = \sqrt{\sigma_j^2 - V_{jj}} \;\le\; \sigma_j`,
    where: [
      { sym: "I", means: "the identity matrix", unit: "-" },
      { sym: "\\Sigma", means: "the posterior covariance of the reconciled flows", unit: "(t/h)²" },
      { sym: "\\sigma_{\\hat{x},j}", means: "the standard deviation of the reconciled flow j", unit: "t/h" },
    ],
  },
  {
    n: 16,
    title: "A prior that is not flat: combining two Gaussians",
    body: "A flat prior says nothing was known before the meters were read.  "
      + "Often something was: yesterday's reconciled flows, which cannot "
      + "have moved far overnight, or a soft sensor -- a flow inferred from "
      + "a valve position and a pump curve.  Write that knowledge as a "
      + "Gaussian per flow, with its own centre and its own width.  The "
      + "product of two Gaussians in the same variable is a Gaussian, so a "
      + "reading and a prior on one flow combine into ONE pseudo-measurement "
      + "whose PRECISION -- one over the variance -- is the sum of the two "
      + "precisions, and whose value is the precision-weighted average.  The "
      + "engine forms it this way before the reconciliation "
      + "(DataReconciliation.cpp:524), and the step is exact, not an "
      + "approximation: the leftover term does not depend on the flow, so "
      + "neither the mode nor the covariance can see it.",
    derivation: [
      { step: "Complete the square in x for one flow carrying a reading and a prior:",
        eq: String.raw`\frac{(x - m)^2}{\sigma^2} + \frac{(x - x_0)^2}{s^2} = \frac{(x - m^{*})^2}{\sigma^{*2}} + \frac{(m - x_0)^2}{\sigma^2 + s^2}` },
      { step: "The second term is free of x: it moves neither the mode nor the posterior covariance, and the engine publishes it apart, summed over the flows, as the prior-data conflict.",
        eq: String.raw`\gamma_\mathrm{prior} = \sum_{j} \frac{(m_j - x_{0,j})^2}{\sigma_j^2 + s_j^2} \sim \chi^2_{n_p}` },
    ],
    formula: String.raw`\frac{1}{\sigma^{*2}} = \frac{1}{\sigma^2} + \frac{1}{s^2}, \qquad m^{*} = \sigma^{*2}\left(\frac{m}{\sigma^2} + \frac{x_0}{s^2}\right)`,
    where: [
      { sym: "x_0", means: "the centre of the prior on one flow", unit: "t/h" },
      { sym: "s", means: "the width (standard deviation) of that prior", unit: "t/h" },
      { sym: "x_{0,j}", means: "the prior's centre for flow j", unit: "t/h" },
      { sym: "s_j", means: "the prior's width for flow j", unit: "t/h" },
      { sym: "\\sigma", means: "the meter's standard uncertainty for that flow", unit: "t/h" },
      { sym: "m^{*}", means: "the pseudo-measurement the reconciliation then uses", unit: "t/h" },
      { sym: "\\sigma^{*}", means: "its standard deviation", unit: "t/h" },
      { sym: "\\gamma_\\mathrm{prior}", means: "the prior-data conflict statistic", unit: "-" },
      { sym: "\\chi^2_{n_p}", means: "the chi-square distribution with n_p degrees of freedom, n_p being the number of flows that carry both a reading and a prior", unit: "-" },
    ],
  },
  {
    n: 17,
    title: "Yesterday as today's prior",
    body: "The fourth operation of the witness uses yesterday's reconciled "
      + "flows as the prior, each with a width of 2 % of its value -- an "
      + "author's judgement of how far a flow may drift in a day, said so "
      + "in the case file, because no meter supplies it.  Be exact about "
      + "what that 2 % is: it is ONE number per flow, and the engine reads it "
      + "as the whole standard deviation of the prior "
      + "(DataReconciliation.cpp:494).  It stands for two things at once -- "
      + "how well yesterday's flows were known, and how far the plant may "
      + "have moved since -- and nothing on this page separates them; step "
      + "18 writes them apart.  Each reading and "
      + "its prior combine as in step 16 -- flow by flow, which is a "
      + "diagonal prior, so this is NOT a filter that carries yesterday's "
      + "posterior forward (step 19 says what it drops) -- then the same "
      + "reconciliation, the "
      + "same tests, the same covariance.  The reconciled sigmas shrink "
      + "again -- the reactor-line flows from about 1.3 to about 0.9 t/h -- "
      + "and the prior-data conflict, about 4.0 against a chi-square with "
      + "seven degrees of freedom whose critical value is 14.07, says today's "
      + "readings and yesterday's estimate are not at odds -- a check of the "
      + "same frequentist kind as page 3's, asked of the prior.  A conflict "
      + "above its critical value would mean the plant moved, or a meter "
      + "did -- and that a prior which held yesterday's answer down is now "
      + "holding today's down with it.",
  },
  {
    n: 18,
    title: "A prior that knows the plant may have moved overnight",
    body: "Yesterday's reconciliation ended with a posterior of its own, "
      + "centred on yesterday's flows and as narrow as step 15 made it.  "
      + "Using that posterior unchanged as today's prior would claim the "
      + "plant stood still overnight.  If it may have moved -- a feed rate "
      + "changed, a valve was trimmed -- by an amount judged to have a "
      + "standard deviation q for each flow, then today's prior is WIDER than "
      + "yesterday's posterior: the two variances add, as the errors of two "
      + "independent steps do.  A plant that may have moved a lot has a large "
      + "q and a weak prior, and today's meters decide almost alone; as q "
      + "grows without limit the prior becomes flat on every flow and the "
      + "answer returns to page 2's.  This widening is the prediction step of "
      + "a Kalman filter, the step that filter repeats at every snapshot; "
      + "this page does not go on to build the filter.  What the engine does "
      + "TODAY is narrower, and it is said plainly: the prior file declares "
      + "one width per flow, and the engine has no term for q of its own.  "
      + "The witness's 2 % is that whole width, an author's single judgement "
      + "-- not an evolution term added to a yesterday's posterior the case "
      + "does not carry.  A case that wants the widening computes the sum "
      + "below by hand and declares the result as the width.",
    formula: String.raw`s_j^2 = \Sigma^{\mathrm{y}}_{jj} + q_j^2, \qquad q_j \to \infty \;\Rightarrow\; \text{the flat prior of page 2}`,
    where: [
      { sym: "s_j", means: "the width of today's prior on flow j: the sigma the prior file declares", unit: "t/h" },
      { sym: "\\Sigma^{\\mathrm{y}}_{jj}", means: "the variance of yesterday's posterior for flow j (step 15, written for yesterday's snapshot)", unit: "(t/h)²" },
      { sym: "q_j", means: "the process-evolution uncertainty: the standard deviation of how far flow j may have moved overnight", unit: "t/h" },
    ],
    note: "Yesterday's posterior was also CORRELATED across flows (step 15), "
      + "and the prior the engine accepts is diagonal (step 19); a filter "
      + "would carry the whole matrix forward.",
  },
  {
    n: 19,
    title: "What a prior can do, and what it cannot",
    body: "A prior on a flow with no meter at all -- a soft sensor -- is "
      + "simply a pseudo-measurement on its own, and it enters the same "
      + "reconciliation the same way.  What a prior CANNOT do is be wrong "
      + "quietly: a confident prior centred in the wrong place pulls every "
      + "flow it touches, and the balances spread the pull.  The prior-data "
      + "conflict is the check, and it deserves the same respect as the "
      + "global test.  And the engine accepts the prior per flow, "
      + "independently -- a diagonal covariance.  Yesterday's reconciled "
      + "flows were in fact correlated, because they closed the balances "
      + "together; that information is not carried, and the run says so.  "
      + "The textbook treatments of everything on these pages are Narasimhan "
      + "and Jordache's Data Reconciliation and Gross Error Detection and "
      + "Romagnoli and Sanchez's Data Processing and Reconciliation for "
      + "Chemical Process Operations.",
  },

  // ---- Page 5: three answers, side by side -----------------------------------
  {
    n: 20,
    title: "Three answers to one snapshot",
    body: "The same readings, the same balances, three answers.  CLASSICAL "
      + "reconciliation returns a set of flows: the ones that close every "
      + "balance and minimise the weighted squares of step 5.  It can attach "
      + "a covariance to them, as step 15 did, but read classically that "
      + "covariance is the scatter of the method's answer over repeated "
      + "snapshots -- a statement about the estimator, not about what is "
      + "known of this plant.  BAYES WITH A FLAT PRIOR returns the SAME flows, "
      + "because they are the posterior mode (step 6), and with them a "
      + "distribution: each true flow is now believed to lie within its "
      + "posterior width, and the panel draws that belief.  BAYES WITH "
      + "YESTERDAY'S PRIOR adds what was known before today's meters were "
      + "read: the flows move, and every width narrows, because two sources "
      + "of knowledge are combined under the same exact balances.  The first "
      + "two panels agree on the flows and differ on what is claimed about "
      + "them; the third differs on both.  That is the sense in which Bayes "
      + "is not merely a different way of calculating the same result: it "
      + "represents what is known about the state of the process, and "
      + "updates it as knowledge arrives.",
    note: "Every number in the three panels is the engine's: the first two "
      + "are the honest operation of the witness, read twice; the third is "
      + "its yesterday operation.  The frequentist tests of page 3 are drawn "
      + "beneath, for both runs.",
  },
];

export const DR_LIMITS: readonly LessonLimit[] = [
  {
    id: "synthetic",
    title: "The plant and its data are invented",
    body: "The flows, the meter uncertainties, the noise, the planted gross "
      + "error and yesterday's prior are all made up for the exercise, and the "
      + "case file says so line by line.  The method is real; no number on "
      + "this page describes a real plant.",
  },
  {
    id: "linear",
    title: "Linear mass balances only",
    body: "Every constraint here is a total mass balance on flows, which is "
      + "linear.  A component balance multiplies a flow by a composition and "
      + "an energy balance a flow by an enthalpy -- both bilinear, both "
      + "needing an iterative reconciliation that the engine does not build.",
  },
  {
    id: "steady",
    title: "One snapshot, at steady state",
    body: "The balances assume nothing accumulates.  A plant in transient, "
      + "or a recursive estimate that carries each snapshot's posterior into "
      + "the next (the Kalman filter), is outside this page.",
  },
  {
    id: "one-prior-width",
    title: "One width per prior, and no evolution term",
    body: "The engine reads one standard deviation per prior flow and takes "
      + "it as the prior's whole width.  It does not hold yesterday's "
      + "posterior and a separate process-evolution uncertainty and add "
      + "them; a case that wants that widening adds the two variances "
      + "itself and declares the result.",
  },
  {
    id: "frequentist-tests",
    title: "The fault tests are frequentist only",
    body: "The global and the measurement tests say how surprising the "
      + "readings would be if every meter were healthy.  The posterior "
      + "probability that a given meter is faulty -- which needs a failure "
      + "prior and an error model for a faulty meter -- is named on page 3 "
      + "and not computed.",
  },
  {
    id: "one-error",
    title: "One gross error at a time",
    body: "The measurement test is sharp for a single bad meter.  Two biased "
      + "meters can mask each other, or point at an innocent neighbour; "
      + "serial elimination and the generalised likelihood ratio tests in the "
      + "references deal with that, and are not built here.",
  },
  {
    id: "gaussian",
    title: "Gaussian, independent, and non-negative only by refusal",
    body: "Every test assumes independent Gaussian meter errors and an "
      + "answer that does not press a flow against zero.  When a flow is "
      + "pressed against zero the answer is still the most probable state "
      + "the engine can find, but the tests no longer hold, and the engine "
      + "refuses to publish them rather than publish them wrong.",
  },
];

/** The questions at the foot of the tool, under every page (DEV.md 4c
 *  C158): drafts for Vitor's review, each testing a step and naming it. */
export const DR_QUIZ: readonly QuizQuestion[] = [
  {
    id: "overall-balance", steps: [3, 11],
    q: "The plant's overall balance, F1 = F4 + F6, is true.  Should it be "
      + "declared as a fifth balance beside the four node balances?",
    options: [
      "Yes — every true balance adds information and narrows the answer",
      "No — it is the sum of the four, adds no knowledge, and the engine refuses it",
      "Yes — the global test needs it to count its degrees of freedom",
    ],
    correct: 1,
    feedback: "Adding the mixer, reactor, separator and splitter rows gives "
      + "the overall balance, so it says nothing the four did not.  What "
      + "every test counts with is the number of INDEPENDENT balances — the "
      + "rank of A, which is the degrees of freedom of the global test "
      + "(steps 3 and 11).",
  },
  {
    id: "posterior-width", steps: [7, 15],
    q: "After reconciliation, how does the standard deviation of a "
      + "reconciled flow compare with its own meter's?",
    options: [
      "The same: reconciliation moves the values, not the uncertainties",
      "Larger: the correction adds its own uncertainty",
      "Zero: the balances are exact, so the reconciled flows are too",
      "Smaller, for a meter that shares a balance with other meters",
    ],
    correct: 3,
    feedback: "Through the balances every other meter says something about "
      + "each flow, so the posterior is narrower than the meter alone: on "
      + "this plant the engine takes the reactor-line flows from the 3 t/h "
      + "declared for their meters to about 1.3 (step 15).  A meter in no "
      + "balance keeps its own width (step 7).  The balances are exact; the "
      + "flows that satisfy them are still uncertain.",
    origins: ["engine", "assumption"],
  },
  {
    id: "same-answer", steps: [6, 20],
    q: "Weighted least squares under the balances, and Bayes with a prior "
      + "that is flat on every flow vector closing them: how do their "
      + "reconciled flows compare?",
    options: [
      "They are the same flows: the least-squares answer is the posterior's most probable point",
      "They differ, because Bayes brings in a prior and least squares does not",
      "Least squares gives the posterior mean and Bayes the mode, and the two differ",
    ],
    correct: 0,
    feedback: "With Gaussian meters, minus twice the log of the posterior is "
      + "the weighted sum of squares plus a constant on the balance subspace, "
      + "so its peak is the least-squares answer (step 6).  What Bayes adds is "
      + "the width around it.  The flows MOVE only when the prior says more "
      + "than the balances — yesterday's estimate, on page 5's third panel "
      + "(step 20).",
  },
  {
    id: "global-test", steps: [11, 12, 14],
    q: "The global test's statistic is far above its critical value.  What "
      + "does that tell you?",
    options: [
      "The probability that some meter is faulty",
      "Which meter is faulty",
      "That readings this inconsistent would be rare if every meter were "
        + "healthy — something is wrong, and the test does not say what",
      "That the balances themselves are wrong",
    ],
    correct: 2,
    feedback: "The test is frequentist: it assumes every meter healthy and "
      + "asks how often noise alone would push the objective this high "
      + "(step 11).  WHICH meter is the measurement test's question "
      + "(step 12).  The probability that a meter has failed is a different, "
      + "Bayesian question that needs a failure prior and a model of a faulty "
      + "meter, and it is named on page 3, not computed (step 14).",
  },
  {
    id: "gross-error-spread", steps: [13],
    q: "A meter with a large gross error is left in the reconciliation.  "
      + "What happens to its error?",
    options: [
      "It stays in that meter; the other meters are untouched",
      "It is removed: reconciliation corrects the worst reading most",
      "The reconciliation refuses to run",
      "It is spread to the meters that share a balance with it",
    ],
    correct: 3,
    feedback: "The reconciled flows must close the balances, so the bad "
      + "reading's error has to go somewhere: in the exercise the engine puts "
      + "both F2 and F3 near 153 t/h against an invented true 150, and moves "
      + "F4 and F7 for an error that is not theirs.  The cure is to take the "
      + "meter out of service and let its flow be read back from the "
      + "balances (step 13).",
    origins: ["engine", "assumption"],
  },
  {
    id: "prior-width", steps: [17, 18],
    q: "The fourth operation uses yesterday's flows as the prior, each with "
      + "a width of 2 % of its value.  What is that 2 %?",
    options: [
      "Yesterday's posterior width, which the engine computed and carried over",
      "One author's judgement, read by the engine as the prior's whole "
        + "width, standing both for how well yesterday was known and how far "
        + "the plant may have moved",
      "A Kalman-filter prediction step the engine adds to yesterday's answer",
    ],
    correct: 1,
    feedback: "The engine reads one standard deviation per prior flow and "
      + "takes it as the whole width (step 17).  A prior that knows the "
      + "plant may have moved overnight is yesterday's posterior WIDENED by a "
      + "process-evolution term — the prediction step of a Kalman filter — "
      + "and the engine has no term for it; a case that wants it adds the two "
      + "variances itself (step 18).",
    origins: ["assumption"],
  },
];
