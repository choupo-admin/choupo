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
  fourWaysMixtureLesson -- the numbered steps and the quiz of the page
  "Four ways to price a mixture" (DEV.md 4c C158).

  The prose of the four sections that stood inline in FourWaysMixtureTool.tsx
  moved here UNCHANGED in substance, so the page and its quiz read one list
  of steps; the ladder of models (MODEL_LADDER) and the golden-pinned
  numbers stay in the tool file, where tests/fourWaysMixtureTool.test.ts
  holds them against their goldens.  Nothing here computes a number: every
  figure a question quotes is one the page prints (the ladder cards) or the
  engine's own live table draws.
\*---------------------------------------------------------------------------*/

import type { LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const FOUR_WAYS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One binary, one question",
    body: "The test system is ethanol/water at 1 atm — the most measured "
      + "binary in the discipline, non-ideal enough to have an azeotrope, "
      + "and the witness carries 12 measured T-x-y points to grade every "
      + "model against.  The data itself is cross-examined before any model "
      + "is: a Gibbs-Duhem consistency op runs the Herington area test on "
      + "the measured points.  A model graded against inconsistent data "
      + "would inherit the data’s own sins.",
  },
  {
    n: 2,
    title: "The ladder of information",
    body: "Every mixture model is a position on one ladder: how much did it "
      + "have to know?  Climbing down the ladder buys reach — answers about "
      + "pairs nobody measured — and, on a pair somebody did measure, "
      + "typically gives up some of the accuracy a fit to that pair has.  "
      + "It orders what each model needs, not how accurate each one is: "
      + "that depends on the chemistry, the data and the property asked "
      + "for.",
  },
  {
    n: 3,
    title: "The score, live",
    body: "Your browser has just asked the real engine to sweep all four "
      + "activity models across the full composition range and grade each "
      + "curve against the measured points.  PC-SAFT and COSMO-SAC are "
      + "deliberately not rows in the table: PC-SAFT is an equation of "
      + "state, priced against this system in its own twin-flash witness "
      + "(flash20 — the K-values on its card above), and the public "
      + "COSMO-SAC profiles are teaching surrogates that would make any AAD "
      + "here a number about the surrogate, not the method.  A row left "
      + "out is honest; a wrong row would not be.  The grade is the "
      + "engine’s average absolute deviation (src/applications/choupoProps/"
      + "AadCompare.cpp): the model curve is interpolated onto each "
      + "measured point, never the reverse, and points outside the scanned "
      + "range are excluded.",
    formula: String.raw`\mathrm{AAD} = \frac{1}{N}\sum_{k=1}^{N}
      \left| f^{\mathrm{model}}(x_k) - f^{\mathrm{meas}}_k \right|`,
    where: [
      { sym: "\\mathrm{AAD}", means: "the average absolute deviation of one "
        + "model curve against the measured points", unit: "K or -" },
      { sym: "N", means: "the number of measured points inside the model "
        + "curve’s scanned range" },
      { sym: "k", means: "the index of a measured point" },
      { sym: "x_k", means: "the measured liquid composition of point k" },
      { sym: "f^{\\mathrm{model}}", means: "the model curve (T_bubble or "
        + "y_ethanol), interpolated onto x_k", unit: "K or -" },
      { sym: "f^{\\mathrm{meas}}_k", means: "the measured value at point k",
        unit: "K or -" },
    ],
  },
  {
    n: 4,
    title: "Back to the number",
    body: "When a simulation hands you a separation, you own it when you "
      + "can ask the five questions below.",
  },
];

/** Questions that close the lesson (DEV.md 4c C158).  Each is answered by
 *  the page's own text: the ladder cards, the live table or the
 *  interrogation list. */
export const FOUR_WAYS_QUIZ: readonly QuizQuestion[] = [
  {
    id: "one-question", steps: [2],
    q: "What single question does the page attach to every mixture model?",
    options: [
      "How many parameters does it have?",
      "What did it know about this pair before it priced it?",
      "How fast does it run?",
      "Which year was it published?",
    ],
    correct: 1,
    feedback: "The ladder orders the models by what each had to know beforehand: nothing, this pair’s measured data, the molecules’ groups, the charge surface, or molecular theory with association.  The number of parameters, the speed and the date say nothing about that (step 2).",
  },
  {
    id: "ideal-floor", steps: [2],
    q: "What does the ideal solution (γ = 1) know, and what can it never produce on ethanol/water?",
    options: [
      "Only each pure component’s Psat; it cannot produce an azeotrope, because an azeotrope is non-ideality",
      "The pair’s measured data; it cannot produce a vapour phase",
      "The molecules’ groups; it cannot produce a liquid phase",
      "Nothing at all, not even Psat; it can produce any azeotrope",
    ],
    correct: 0,
    feedback: "The ideal rung is the honest floor: it knows each pure component’s vapour pressure and nothing else.  Since an azeotrope is a consequence of non-ideal mixing, a model with γ = 1 cannot make one, and its card quotes it off the bubble curve by 5.35 K on average (step 2).",
    origins: ["engine"],
  },
  {
    id: "fit-scope", steps: [2],
    q: "A fitted NRTL pair scores 0.0706 K where its evidence was taken, but a fit regressed on three vacuum isobars scores 0.3895 K on those same 1-atm points.  What does the ladder conclude?",
    options: [
      "NRTL is a worse model than UNIFAC",
      "The 1-atm points must be wrong",
      "A fitted constant is a record of an experiment, not a law: it is only as good as the conditions it was fitted on",
      "A fit should always be regressed on as few points as possible",
    ],
    correct: 2,
    feedback: "The same functional form loses a factor of 5.5 when asked outside the evidence it was regressed on.  The lesson is about the scope of the evidence, not a ranking of NRTL against other models (step 2).",
    origins: ["engine"],
  },
  {
    id: "graded-by", steps: [1, 3],
    q: "Against what does the live table grade the four activity models, and what is checked about that data first?",
    options: [
      "Against the other three models' average; nothing is checked first",
      "Against 12 measured 1-atm T-x-y points; the Herington area test checks the points are consistent before any model is graded",
      "Against PC-SAFT, which is the reference rung",
      "Against a synthetic COSMO-SAC surrogate",
    ],
    correct: 1,
    feedback: "The witness carries 12 measured T-x-y points at 1 atm.  The Herington area test (Gibbs-Duhem consistency) runs first, because a model graded against inconsistent data would inherit its errors (steps 1 and 3).",
    origins: ["engine", "reference"],
  },
  {
    id: "rows-left-out", steps: [3],
    q: "Why are PC-SAFT and COSMO-SAC not rows of the live AAD table?",
    options: [
      "They are too inaccurate to be shown",
      "The engine cannot run them in a browser",
      "They are the same model as NRTL",
      "PC-SAFT is an equation of state priced in its own twin-flash witness, and the shipped COSMO-SAC profiles are teaching surrogates, so any AAD would describe the surrogate, not the method",
    ],
    correct: 3,
    feedback: "A row left out is honest; a wrong row would not be.  PC-SAFT has its own flash20 witness, and an AAD computed from synthetic surrogate profiles would be a number about the surrogate (step 3).",
  },
  {
    id: "table-choices", steps: [3],
    q: "The page does no arithmetic of its own on the AAD table.  Does that mean the ranking of the models is free of choices?",
    options: [
      "Yes: a table the page does not compute cannot favour a model",
      "Yes: the engine’s numbers are always the same whatever is measured",
      "No: the dataset, the property and the metric are choices that could order the models differently, and the page names them",
      "No: the page secretly reorders the rows",
    ],
    correct: 2,
    feedback: "No page arithmetic rules out one source of bias, not all of them.  The choice of one dataset (12 T-x-y points at 1 atm), two properties (T_bubble and y_ethanol) and one metric (the average absolute deviation) is stated under the table, and another choice could change the order (step 3).",
  },
  {
    id: "pcsaft-vs-nrtl", steps: [2],
    q: "At 358.15 K and 1 atm the twin flash gives K_ethanol = 3.82 with fitted NRTL and 11.47 with predictive PC-SAFT.  What does the page do with that difference?",
    options: [
      "Hides it, because PC-SAFT is the more modern model",
      "Shows both side by side and does not call either one right: PC-SAFT’s generality (one surface for vapour, liquid and density) has a cost on a polar azeotropic pair",
      "Declares NRTL wrong because its K is lower",
      "Averages the two K-values",
    ],
    correct: 1,
    feedback: "The twin flash is shown side by side, never hidden, with V/F = 0.491 against 0.649.  Where PC-SAFT earns its keep is high pressure, density and mixtures nobody has measured, not this well-measured binary (step 2).",
    origins: ["engine"],
  },
];
