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
  The lesson of "How many phases? Gibbs energy and the tangent plane".
  Prose here quotes no number of the run; the numbers on the page are the
  tables of the engine's run of
  tutorials/props/scan/binary04_tangent_plane_water_nbutanol (HowManyPhasesTool).

  EVERY CLAIM WAS READ in the engine:
    * the liquid-liquid flash minimises the Gibbs energy of mixing directly
      and says why a Newton on the equal-activity equations falls into the
      K = 1 saddle (src/unitOperations/flash/IsothermalFlash.cpp:584-605);
    * before that minimisation it calls Michelsen's test (IsothermalFlash.cpp:607-608);
    * the test's own distance is the modified form of StabilityTest.cpp:63-72;
    * propertyScanBinary's `stability` block writes the page's tables
      (PropertyScanBinary.cpp:259-260, the activity table and the tpd table).
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const PHASES_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Equilibrium is the lowest Gibbs energy, not the first solution",
    body: "At a fixed temperature and pressure a mixture settles where its total "
      + "Gibbs energy is lowest.  For a binary liquid the quantity to look at is "
      + "the molar Gibbs energy of mixing, g_mix, as a function of the "
      + "composition: an ideal part that always bends the curve down in the "
      + "middle, and an excess part, set by the activity model, that can push "
      + "it back up.  When the push wins in the middle the curve has two "
      + "humps and a valley between them, and that is the whole of liquid-liquid "
      + "immiscibility.  The page draws the engine's own g_mix for water and "
      + "n-butanol.",
    formula: String.raw`\frac{g_\mathrm{mix}}{RT} = x_1 \ln a_1 + x_2 \ln a_2 \qquad a_i = x_i\,\gamma_i`,
    where: [
      { sym: "g_\\mathrm{mix}", means: "The molar Gibbs energy of mixing: the Gibbs "
        + "energy of one mole of the mixture minus that of the pure components "
        + "at the same temperature and pressure.", unit: "J/mol" },
      { sym: "R", means: "The gas constant.", unit: "J/(mol K)" },
      { sym: "T", means: "The temperature, fixed along the whole page.", unit: "K" },
      { sym: "x_1", means: "The mole fraction of water in the liquid.", unit: "-" },
      { sym: "x_2", means: "The mole fraction of n-butanol, 1 - x_1.", unit: "-" },
      { sym: "a_1", means: "The activity of water: its mole fraction times its "
        + "activity coefficient.", unit: "-" },
      { sym: "a_2", means: "The activity of n-butanol.", unit: "-" },
      { sym: "a_i", means: "The activity of component i, x_i gamma_i; the engine's "
        + "`activity` table lists it along the composition.", unit: "-" },
      { sym: "x_i", means: "The mole fraction of component i.", unit: "-" },
      { sym: "\\gamma_i", means: "The activity coefficient of component i from the "
        + "case's activity model (UNIQUAC with the cited set of the case).", unit: "-" },
    ],
    note: "The engine reports g_mix in J/mol (the `gmix` table); the page divides by "
      + "RT so that every curve of the page is dimensionless and sits on one scale.",
  },
  {
    n: 2,
    title: "The common tangent and the lever rule",
    body: "A feed whose composition lies between the two valleys does not stay "
      + "as one liquid: it splits into the two liquids whose compositions are "
      + "the ends of the common tangent, the one straight line that touches the "
      + "curve at two points.  The mixture of the two liquids lies on that "
      + "line, below the curve, so splitting lowers the Gibbs energy by the "
      + "gap between the curve and the line at the feed.  How much of each "
      + "liquid forms follows from the lever rule.  A feed outside the two "
      + "valleys stays one liquid: the line does not reach it.  Move the feed "
      + "on the page and watch the mixture's Gibbs energy fall to the line.",
    formula: String.raw`\beta'' = \frac{z - x'}{x'' - x'} \qquad \beta' = 1 - \beta'' \qquad \Delta g = g(z) - g_\mathrm{line}(z)`,
    where: [
      { sym: "z", means: "The composition of the feed, the mole fraction of water "
        + "in it.  The slider of the page.", unit: "-" },
      { sym: "x'", means: "The water mole fraction of the butanol-rich liquid, the "
        + "left end of the common tangent (the engine's binodal, first row).", unit: "-" },
      { sym: "x''", means: "The water mole fraction of the water-rich liquid, the "
        + "right end of the common tangent (binodal, second row).", unit: "-" },
      { sym: "\\beta'", means: "The fraction of the feed that becomes the "
        + "butanol-rich liquid, the one at x'.", unit: "-" },
      { sym: "\\beta''", means: "The fraction of the feed that becomes the "
        + "water-rich liquid, the one at x''.  For z outside the two valleys one of the two "
        + "fractions is negative or above one: the split cannot be made.", unit: "-" },
      { sym: "g", means: "g_mix / RT, the dimensionless molar Gibbs energy of "
        + "mixing of step 1.", unit: "-" },
      { sym: "g_\\mathrm{line}", means: "The common tangent line, evaluated at the "
        + "feed: the Gibbs energy of the two liquids mixed in the lever-rule "
        + "proportion.", unit: "-" },
      { sym: "\\Delta g", means: "How far the mixture's Gibbs energy falls when the "
        + "feed splits: positive only inside the two valleys.", unit: "-" },
      { sym: "g_z", means: "The tangent line to g drawn at the feed z (the "
        + "derivation below): a straight line in x_1.", unit: "-" },
      { sym: "g_{x'}", means: "The tangent line to g drawn at the composition x'.", unit: "-" },
      { sym: "g_{x''}", means: "The tangent line to g drawn at the composition x''.", unit: "-" },
    ],
    derivation: [
      { step: "For a binary the Gibbs-Duhem relation x_1 d ln a_1 + x_2 d ln a_2 = 0 makes the slope of g the difference of the two log-activities.",
        eq: String.raw`\frac{\mathrm{d}g}{\mathrm{d}x_1} = \ln a_1 - \ln a_2` },
      { step: "The tangent to g at the feed z therefore cuts the axis x_1 = 0 at ln a_2(z) and the axis x_1 = 1 at ln a_1(z): the intercepts are the chemical potentials.",
        eq: String.raw`g_z(x_1) = \ln a_2(z) + \bigl[\ln a_1(z) - \ln a_2(z)\bigr]\,x_1` },
      { step: "Two compositions share one tangent when both intercepts agree; that is the common tangent, and it is the same statement as equal activities (step 3).",
        eq: String.raw`g_{x'}(x_1) = g_{x''}(x_1)` },
    ],
    note: "The engine finds the two compositions by minimising G directly in a "
      + "liquid-liquid flash (IsothermalFlash.cpp:584-605); the page does not "
      + "search for them, it reads the flash's answer from the `binodal` table.",
  },
  {
    n: 3,
    title: "Three solutions of equal activities, and only one is the answer",
    body: "Equilibrium means equal chemical potentials, and for a liquid pair "
      + "that is equal activities in the two phases.  The two equations are "
      + "satisfied by the true pair, and also by the trivial pair in which the "
      + "two 'phases' are the same composition: an activity equals itself at "
      + "any composition.  The activity curves of the page, one per component, "
      + "show it: a horizontal line at a given activity cuts a curve that has "
      + "a loop in three places.  Newton's method on the two equations cannot "
      + "prefer the true pair, and near the trivial one it converges "
      + "to it, with K = 1 and zero residual, without a complaint.  The "
      + "engine's flash minimises the Gibbs energy instead "
      + "(IsothermalFlash.cpp:584-605).  There is a third way to be wrong: "
      + "solve the equations for a feed outside the two valleys.  The pair "
      + "is a solution but its phase fractions are negative or above one, "
      + "so the answer has the wrong number of phases.",
    formula: String.raw`a_1(x') = a_1(x'') \qquad a_2(x') = a_2(x'') \qquad x' \neq x''`,
    where: [
      { sym: "a_1(x')", means: "The activity of water in the first liquid.", unit: "-" },
      { sym: "a_1(x'')", means: "The activity of water in the second liquid.", unit: "-" },
      { sym: "a_2(x')", means: "The activity of n-butanol in the first liquid.", unit: "-" },
      { sym: "a_2(x'')", means: "The activity of n-butanol in the second liquid.", unit: "-" },
    ],
    note: "For a binary with one hump the true pair is the only solution besides the "
      + "trivial one; with three or more components stationary points that are "
      + "not the global minimum appear as well (the Theory Guide section of this "
      + "page says so).  The page shows the two it can show for this binary and "
      + "leaves out a local split, which this system lacks.",
  },
  {
    n: 4,
    title: "Michelsen's tangent-plane distance",
    body: "A solver that has a candidate answer must ask whether a phase is "
      + "absent.  Draw the tangent to g at the feed, and measure, at every "
      + "trial composition, how far the curve lies above the tangent.  If the "
      + "curve is above the tangent everywhere the feed is stable: one liquid.  "
      + "If it dips below the tangent anywhere, a small amount of that "
      + "trial composition would lower the Gibbs energy, the feed is unstable, "
      + "and a phase is absent.  The distance is zero at the feed itself, "
      + "where the curve touches its own tangent.  The page plots it along the "
      + "trial composition for the feed you set; its stationary points are "
      + "where the trial phase is in equilibrium with the feed.",
    formula: String.raw`\mathrm{tm}(y) = \sum_i y_i\bigl[\ln a_i(y) - \ln a_i(z)\bigr] = g(y) - g_z(y)`,
    where: [
      { sym: "\\mathrm{tm}", means: "The tangent-plane distance at the trial composition: "
        + "the vertical gap between the g curve and the tangent at the feed.", unit: "-" },
      { sym: "y", means: "The trial composition: the mole fraction of water in the "
        + "small amount of a new phase being tried.", unit: "-" },
      { sym: "y_i", means: "The mole fraction of component i in the trial phase.", unit: "-" },
      { sym: "a_i(y)", means: "The activity of component i at the trial composition.", unit: "-" },
      { sym: "a_i(z)", means: "The activity of component i at the feed.", unit: "-" },
      { sym: "g_z", means: "The tangent line to g at the feed, step 2.", unit: "-" },
      { sym: "\\mu_i", means: "The chemical potential of component i in the "
        + "liquid at the composition shown in brackets.", unit: "J/mol" },
    ],
    derivation: [
      { step: "Pinch off a small amount of a trial phase of composition y from the feed; the change in Gibbs energy per mole of it is the difference of chemical potentials, weighted by y.",
        eq: String.raw`\mathrm{tm}(y) = \sum_i y_i\bigl[\mu_i(y) - \mu_i(z)\bigr]/RT` },
      { step: "For a liquid the chemical potential minus its standard value is RT ln a, and the standard values cancel.",
        eq: String.raw`\mathrm{tm}(y) = \sum_i y_i\bigl[\ln a_i(y) - \ln a_i(z)\bigr]` },
    ],
    note: "tm(y) = 0 at y = z is the trivial stationary point of step 3: it says nothing "
      + "about stability.  What decides is the lowest value over all y.",
  },
  {
    n: 5,
    title: "The engine doing it",
    body: "Before the liquid-liquid flash spends a multi-start minimisation, it asks "
      + "Michelsen's question of the feed (IsothermalFlash.cpp:607-608) and prints "
      + "the answer; the page quotes that line from the run.  The test is a "
      + "successive-substitution iteration on mole numbers Y, started from the "
      + "pure components, and it keeps the most negative value it meets.  Its "
      + "number is a modified form of the distance of step 4 "
      + "(StabilityTest.cpp:63-72): at a converged stationary point it equals "
      + "one minus the sum of the Y, and it has the sign of the distance "
      + "that the page plots.  A negative value is a proof that a phase is "
      + "absent; the flash then looks for the two liquids, and finds the ones "
      + "of step 2.",
    formula: String.raw`\mathrm{tm}_\mathrm{eng} = 1 + \sum_i Y_i\bigl(\ln Y_i + \ln\gamma_i - h_i - 1\bigr) \qquad h_i = \ln(z_i\gamma_i(z))`,
    where: [
      { sym: "\\mathrm{tm}_\\mathrm{eng}", means: "The distance as the engine's test computes it "
        + "(StabilityTest.cpp:63-72); negative proves the feed unstable.", unit: "-" },
      { sym: "Y_i", means: "The mole number of component i of the trial phase, not "
        + "normalised: y_i = Y_i / sum Y.", unit: "-" },
      { sym: "h_i", means: "The log-activity of component i at the feed, "
        + "ln(z_i gamma_i(z)): the tangent's intercept.", unit: "-" },
      { sym: "z_i", means: "The mole fraction of component i in the feed.", unit: "-" },
      { sym: "\\gamma_i(z)", means: "The activity coefficient of component i at the feed.", unit: "-" },
    ],
    note: "The engine's test is called, not re-implemented, by propertyScanBinary "
      + "(PropertyScanBinary.cpp:259-260 writes the table of step 4 beside it).",
  },
];

export const PHASES_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "one-system",
    title: "One binary at one temperature and pressure.",
    body: "The page is water and n-butanol at the case's temperature and 1 bar, on one "
      + "activity model with one liquid surface.  A ternary, a vapour phase or "
      + "a model with a different shape changes the picture; the page does not "
      + "say how.",
  },
  {
    id: "local-split",
    title: "No local split is shown, because this binary has none.",
    body: "The three solutions of equal activities that a general mixture can have, "
      + "the trivial one, a split that is only a local minimum of G, and the "
      + "true one, reduce here to two (g has one hump).  A local minimum needs "
      + "three components or a second hump; the page does not draw one.",
  },
  {
    id: "grid",
    title: "The curves are sampled on the engine's grid.",
    body: "Every curve is a table of interior nodes; the feed slider steps on those "
      + "nodes, so its activities are the engine's own.  A feed closer than one "
      + "node to a binodal composition is decided on the nodes and on the two "
      + "binodal points of the flash, not on a continuous curve.",
  },
  {
    id: "tm-forms",
    title: "The page's tm and the engine's tm are two forms of one distance.",
    body: "The page plots tm(y) = sum y_i [ln a_i(y) - ln a_i(z)]; the engine's test "
      + "returns a modified form on mole numbers (StabilityTest.cpp:63-72) that "
      + "has the same sign at a stationary point but not the same value; the "
      + "two are quoted separately and are not compared as equal.",
  },
  {
    id: "engine-feed",
    title: "The engine's verdict is for its one declared feed.",
    body: "The case declares one feed for the test.  For any other position of the "
      + "slider the verdict is the page's reading of the engine's activities "
      + "(the lowest tm over the nodes and the two binodal points), not a "
      + "second engine run.",
  },
  {
    id: "stability-not-split",
    title: "A negative distance says a phase is absent, not what the phases are.",
    body: "The test proves instability and gives a starting composition for the "
      + "absent phase.  The two liquids come from the flash that minimises G, "
      + "and the page reads them from its table.",
  },
  {
    id: "citation",
    title: "Michelsen's paper was not read for this page.",
    body: "The tangent-plane criterion is cited as the origin through the "
      + "engine's own bibliography entry; the equations on the page are re-derived "
      + "from the chemical potential and checked against the engine's tables, "
      + "not against the paper.",
  },
];

export const PHASES_QUIZ: readonly QuizQuestion[] = [
  {
    id: "equal-fugacities", steps: [3],
    q: "Equal activities of both components in two liquid phases are found. Does that prove the two liquids are the equilibrium answer?",
    options: [
      "No: the trivial pair, two identical compositions, satisfies the same equations",
      "Yes: equal chemical potentials are sufficient for equilibrium",
      "Yes, as long as the two compositions differ by a few per cent",
      "No: but only because the temperature is not fixed",
    ],
    correct: 0,
    feedback: "The two equations are satisfied by x' = x'' at every composition, so a "
      + "solver that converges to them has not shown that the split is real; "
      + "equal activities are necessary, not sufficient (step 3).",
  },
  {
    id: "lever-outside", steps: [2],
    q: "A feed lies just outside the two valleys, in the water-rich side. The equal-activity pair is substituted into the lever rule. What comes out?",
    options: [
      "A negative phase fraction: the split cannot be made and the feed is one liquid",
      "Two liquids in nearly equal amounts",
      "A phase fraction above one for the water-rich liquid",
      "The same fractions as for a feed inside",
    ],
    correct: 0,
    feedback: "For z below x' the lever rule gives a negative fraction for the "
      + "butanol-rich liquid: the pair is a solution of the equations and not a "
      + "phase split that exists (step 2).",
  },
  {
    id: "tangent-intercept", steps: [2],
    q: "Where does the tangent to g at the feed cut the vertical axis x_1 = 1?",
    options: [
      "At ln a_1 of the feed",
      "At g of the feed",
      "At zero",
      "At ln a_2 of the feed",
    ],
    correct: 0,
    feedback: "The intercepts of the tangent are the log-activities, ln a_2 at "
      + "x_1 = 0 and ln a_1 at x_1 = 1 (step 2, derivation).",
  },
  {
    id: "tm-sign", steps: [4],
    q: "The tangent-plane distance is negative at one trial composition. What does it prove?",
    options: [
      "The feed is unstable: a small amount of that composition would lower the Gibbs energy, so a phase is absent",
      "The feed is stable because the trial phase is more stable",
      "Nothing, since tm is always zero at the feed",
      "The two liquids have equal activities",
    ],
    correct: 0,
    feedback: "tm below zero anywhere means the curve dips below the tangent "
      + "at the feed: splitting off that composition lowers G (step 4).",
  },
  {
    id: "tm-zero-at-feed", steps: [4],
    q: "The distance tm(y) is exactly zero at y = z. What does that tell you about stability?",
    options: [
      "Nothing: it is the trivial stationary point; stability is decided by the lowest value over all y",
      "That the feed is stable",
      "That the feed is unstable",
      "That the temperature is the critical one",
    ],
    correct: 0,
    feedback: "At y = z the curve touches its own tangent, so tm is zero for every "
      + "feed, stable or not; only a value below zero somewhere else matters (step 4).",
  },
  {
    id: "why-minimise", steps: [3, 5],
    q: "Why does the engine's liquid-liquid flash minimise the Gibbs energy directly instead of solving the equal-activity equations by Newton?",
    options: [
      "Newton on those equations can fall into the trivial solution, K = 1, and report convergence",
      "Minimisation is always faster",
      "Newton cannot evaluate an activity coefficient",
      "The equal-activity equations lack a solution for water and butanol",
    ],
    correct: 0,
    feedback: "The trivial pair is a stable fixed point of the residual map "
      + "though it is a saddle of the Gibbs surface; a minimisation of G cannot "
      + "settle there (steps 3 and 5).",
  },
];
