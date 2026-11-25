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
  The lesson of "When do I open the press?" (C511): the filter-press cycle.
  Prose here quotes no number of the run; the numbers on the page are engine
  runs of tutorials/steady/solids/filter02_caco3_pressWashing (FilterPressTool).

  EVERY CLAIM WAS READ in src/unitOperations/solids/CakeFilter.cpp:
    * K_p and B are lines 336-337, the filtration time line 338 (the Ruth
      constant-pressure law with a cake of constant specific resistance and a
      medium of constant resistance);
    * the wash volume of one cycle is the cycle-average wash flow over one
      cycle (line 372), so it grows in proportion to V; the wash is pushed at
      the final filtration rate times a path factor, 1/4 for through-washing
      in a plate-and-frame press (lines 361 and 371): t_w = (w/f) V (K_p V + B);
    * the cycle is t_f + t_w + t_d (line 405), t_d being the declared
      `cleaningTime`, a constant of the case, and the presses needed are the
      filtrate flow times t_c over V (line 406).
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const PRESS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A cake that grows against a cloth",
    body: "A plate-and-frame press filters at a constant pressure drop.  "
      + "The solids stay on the cloth and build a cake, and the filtrate "
      + "must cross two resistances in series: the cloth, which does not "
      + "change, and the cake, which thickens with every cubic metre "
      + "that has passed.  So the filtrate flows fastest at the start and "
      + "slows steadily.  Writing the pressure drop as flow times total "
      + "resistance and integrating gives Ruth's law: the time per unit "
      + "volume, t/V, is a straight line against V.  Its slope is half "
      + "the cake constant K_p and its intercept is the cloth's B.  The "
      + "engine reads K_p and B from the sample's cake resistance and the "
      + "cloth's, the pressure drop and the area, and prints both.",
    formula: String.raw`\frac{t}{V} = \frac{K_p}{2}\,V + B \qquad t_f = \frac{K_p}{2}\,V^2 + B\,V`,
    where: [
      { sym: "t", means: "The time since the filtrate began to flow, at "
        + "constant pressure drop.", unit: "s" },
      { sym: "V", means: "The filtrate collected in the cycle so far, for the "
        + "whole press (not per unit area).", unit: "m3" },
      { sym: "K_p", means: "The cake constant: the specific cake resistance "
        + "times the solids the filtrate carries, times the viscosity, over the "
        + "square of the area and the pressure drop (CakeFilter.cpp:336).",
        unit: "s/m6" },
      { sym: "B", means: "The cloth constant: the viscosity times the "
        + "cloth's resistance, over the area and the pressure drop "
        + "(CakeFilter.cpp:337).", unit: "s/m3" },
      { sym: "t_f", means: "The filtration time that delivers the volume V "
        + "(CakeFilter.cpp:338).", unit: "s" },
    ],
    note: "The \"per unit area\" of the textbook form is absorbed here: "
      + "K_p carries 1/A^2 and B carries 1/A, so V in these formulas is "
      + "the filtrate of the whole press and the slope and intercept are the "
      + "engine's own published numbers.",
  },
  {
    n: 2,
    title: "The cycle: filter, wash, and everything else",
    body: "A press does not filter all the time.  After the cake is "
      + "formed it is washed, and then the press is opened, the cake dropped, "
      + "the cloths cleaned and the frames shut.  The engine counts the wash "
      + "separately, because its length depends on the cycle: the wash "
      + "water of a cycle is a fixed fraction of that cycle's filtrate, and "
      + "in a plate-and-frame press it is pushed through twice the cake and "
      + "half the area, at a quarter of the final filtration rate.  What is "
      + "left, the discharge and the cleaning, is a time t_d that the case "
      + "declares and that does not care how big the cake was.  The "
      + "number that pays the bill is the average rate over the whole "
      + "cycle, not the rate while filtering.",
    formula: String.raw`t_c = t_f + t_w + t_d \qquad t_w = \frac{w}{f}\,V\,(K_p V + B) \qquad R = \frac{V}{t_c}`,
    where: [
      { sym: "t_c", means: "The whole cycle, from one closing of the press "
        + "to the next (CakeFilter.cpp:405).", unit: "s" },
      { sym: "t_w", means: "The washing time (CakeFilter.cpp:371-373).", unit: "s" },
      { sym: "w", means: "The wash volume of a cycle as a fraction of its "
        + "filtrate, set by the wash flow beside the feed's filtrate flow "
        + "(CakeFilter.cpp:372).", unit: "-" },
      { sym: "f", means: "The path factor of the wash: its rate as a fraction of "
        + "the final filtration rate, 1 for a leaf filter and 1/4 for "
        + "through-washing in a plate-and-frame press (CakeFilter.cpp:361).",
        unit: "-" },
      { sym: "t_d", means: "The dead time: discharge and cleaning, the case's "
        + "`cleaningTime`.  It is the slider of the page.", unit: "s" },
      { sym: "R", means: "The average filtrate rate over a whole cycle, the "
        + "quantity the press is run to maximise.", unit: "m3/s" },
    ],
    note: "Both t_f and t_w grow faster than V (a V-squared term and a "
      + "V term each); t_d does not grow at all.  Filtering a little longer "
      + "spreads t_d over more filtrate, but each extra cubic metre costs "
      + "more time than the one before.  Those two facts, set against each "
      + "other, make a maximum.",
  },
  {
    n: 3,
    title: "Where the average rate peaks",
    body: "Collect the terms in V: the cycle is a quadratic in V with a "
      + "constant, the dead time.  The average rate V/t_c is zero at V = 0, "
      + "rises while the dead time is being spread, and falls once the "
      + "growing cake dominates.  Setting its derivative to zero gives a "
      + "result that is simple to remember: at the best cycle, the time "
      + "that grows as the square of the volume equals the dead time.  With "
      + "no wash and a cloth that offers no resistance, that means the "
      + "filtration time equals the dead time; with a cloth, the filtration "
      + "time at the best cycle is the dead time plus the cloth's share, "
      + "B V.  The wash enters the same square term, so a press that washes "
      + "should open earlier.",
    formula: String.raw`t_c = a\,V^2 + b\,V + t_d \qquad a\,V_*^2 = t_d \qquad R_* = \frac{1}{2\,a\,V_* + b}`,
    where: [
      { sym: "a", means: "The coefficient of V squared in the cycle: "
        + "(1/2 + w/f) K_p, from the filtration and the wash together.",
        unit: "s/m6" },
      { sym: "b", means: "The coefficient of V in the cycle: (1 + w/f) B.",
        unit: "s/m3" },
      { sym: "V_*", means: "The filtrate per cycle at which the average rate "
        + "is largest.", unit: "m3" },
      { sym: "R_*", means: "The largest average rate.", unit: "m3/s" },
    ],
    derivation: [
      { step: "Write the cycle as a quadratic in V.", eq: String.raw`t_c = a\,V^2 + b\,V + t_d` },
      { step: "The rate is stationary where V/t_c has zero slope, that is where t_c equals V times its own slope.",
        eq: String.raw`\frac{\mathrm{d}R}{\mathrm{d}V}=0 \;\Rightarrow\; t_c = V\,\frac{\mathrm{d}t_c}{\mathrm{d}V} = 2\,a\,V^2 + b\,V` },
      { step: "Cancel the linear terms on both sides.", eq: String.raw`a\,V_*^2 = t_d` },
      { step: "Put V_* back into R = V/t_c.", eq: String.raw`R_* = \frac{V_*}{2\,t_d + b\,V_*} = \frac{1}{2\,a\,V_* + b}` },
    ],
    note: "For the dead time the page lets you move, the best volume goes "
      + "as its square root: twice the dead time asks for a cake about 1.4 "
      + "times as big, not twice.",
  },
  {
    n: 4,
    title: "How flat the peak is",
    body: "The practical question is not where the maximum is but how much "
      + "it costs to miss it.  Measure the volume as a multiple x of the "
      + "best one.  The rate relative to its maximum depends on x and on a "
      + "single number, beta, the cloth-and-wash term measured against the "
      + "square term at the best cycle.  The curve has a remarkable "
      + "symmetry: x and 1/x give the same value, so opening the press at "
      + "half the best volume and at twice the best volume lose exactly the "
      + "same share.  Near x = 1 the loss is second order, which is why "
      + "an operator who opens a little early or late sees nothing wrong.  "
      + "The loss is not small far from the best: the page tabulates it.",
    formula: String.raw`\frac{R}{R_*} = \frac{(2+\beta)\,x}{x^2 + 1 + \beta\,x} \qquad x = \frac{V}{V_*} \qquad \beta = \frac{b}{a\,V_*}`,
    where: [
      { sym: "x", means: "The cycle's volume as a multiple of the best one "
        + "(1 is the optimum).", unit: "-" },
      { sym: "\\beta", means: "How large the linear (cloth and wash) term of the "
        + "cycle is against the square term at the best volume; a larger "
        + "beta flattens the peak.", unit: "-" },
    ],
    derivation: [
      { step: "Use a V_*^2 = t_d to write the dead time and the rate in units of V_*.",
        eq: String.raw`R = \frac{x\,V_*}{a\,V_*^2\,(x^2+1) + b\,x\,V_*}` },
      { step: "Divide by R_* = 1 / (a V_* (2 + beta)).",
        eq: String.raw`\frac{R}{R_*} = \frac{(2+\beta)\,x}{x^2 + 1 + \beta\,x}` },
      { step: "Replace x by 1/x: the numerator and the denominator each divide by x, so the ratio is unchanged.",
        eq: String.raw`\frac{R(1/x)}{R_*} = \frac{R(x)}{R_*}` },
    ],
    note: "A cloth that offers more resistance (a larger B), or a wash, "
      + "raises beta and flattens the peak further; a dead time that is "
      + "very short or very long moves V_* but not the shape.",
  },
  {
    n: 5,
    title: "The press the engine runs",
    body: "The tutorial case filter02 is a plate-and-frame press on a "
      + "calcium carbonate slurry, with through-washing and a declared "
      + "cleaning time.  The page runs it in your browser, reads K_p, "
      + "B, the wash and the cycle from its results, and draws the average "
      + "rate against the volume per cycle with the algebra of steps 2 to "
      + "4.  Dots on the curve are further engine runs of the same case at "
      + "other volumes per cycle and at your dead time; where they sit on the "
      + "curve, the algebra is the engine's.  The press count in the table "
      + "is the engine's own: the filtrate flow the plant must pass, times "
      + "the cycle, over the volume of one cycle.",
    formula: String.raw`n_\mathrm{press} = \frac{Q_f\,t_c}{V}`,
    where: [
      { sym: "n_\\mathrm{press}", means: "The number of presses that pass the "
        + "plant's filtrate flow on this cycle (CakeFilter.cpp:406).", unit: "-" },
      { sym: "Q_f", means: "The filtrate flow the plant must pass, set by "
        + "the feed: a result of the slurry's inlet.", unit: "m3/s" },
    ],
    note: "Because Q_f is fixed by the feed, a shorter best cycle that "
      + "raises R also lowers the presses needed: n is Q_f / R.",
  },
];

export const PRESS_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "constant-resistances",
    title: "A cake of constant resistance, a cloth that does not clog.",
    body: "K_p uses one specific cake resistance and B one cloth resistance, "
      + "the values the sample record adopts at one pressure drop "
      + "(CakeFilter.cpp:336-337).  A compressible cake, whose resistance "
      + "rises with the pressure across it, or a cloth that blinds over "
      + "the cycles, would curve the t/V line and move the optimum.",
  },
  {
    id: "constant-pressure",
    title: "Constant pressure only.",
    body: "The page is the constant-pressure press (model batchPress).  A "
      + "press fed at constant rate, or one whose pump curve falls as the "
      + "cake builds, follows a different law.",
  },
  {
    id: "wash-model",
    title: "The wash is the engine's, and is a fraction of the cycle's filtrate.",
    body: "The wash volume grows in proportion to V and is pushed at a quarter "
      + "of the final rate (through-washing in a plate-and-frame press, "
      + "CakeFilter.cpp:361-373).  The toggle \"washing\" removes that term from "
      + "the page's curve for the classical textbook case; the engine's "
      + "dots always include it, so they are hidden when the wash is off.",
  },
  {
    id: "dead-time-constant",
    title: "The dead time is one declared number.",
    body: "Discharge, cleaning and re-closing are the case's `cleaningTime`, "
      + "the same for every cake.  A real press takes longer to discharge a thick "
      + "cake; the page does not make t_d depend on V.",
  },
  {
    id: "frame-capacity",
    title: "A frame has a finite thickness; the page prints the cake's, and does not stop at it.",
    body: "The cake thickness in the table is the engine's value at the "
      + "case's cycle, scaled in proportion to V.  Nothing in the engine "
      + "compares it with the depth of a frame, so a best cycle that needs a "
      + "cake thicker than the frames hold is not a cycle the press can run, "
      + "and the page cannot tell you.",
  },
  {
    id: "optimum-is-algebra",
    title: "The optimum is the page's algebra, checked at six volumes.",
    body: "The engine is run at the case's own cycle and at five other "
      + "volumes; the optimum itself is not an engine run.  The dots show "
      + "how close the algebra lies to the engine's own results there.",
  },
  {
    id: "one-press",
    title: "One press, cycle-averaged streams.",
    body: "The steady flowsheet represents the press by cycle averages; the "
      + "page maximises the average rate of one press and says nothing of "
      + "the filtrate buffer, the feed pump or the downstream units that a "
      + "stop-start cycle would load differently.",
  },
];

export const PRESS_QUIZ: readonly QuizQuestion[] = [
  {
    id: "ruth-line", steps: [1],
    q: "In Ruth's constant-pressure law, what does a plot of t/V against V give?",
    options: [
      "A line whose slope is half K_p and whose intercept is B",
      "A line through the origin, because the cloth adds no resistance",
      "A parabola, because the cake grows",
      "A horizontal line, because the pressure drop is constant",
    ],
    correct: 0,
    feedback: "Dividing t_f = K_p V^2 / 2 + B V by V leaves a straight line "
      + "in V: the slope is K_p / 2 and the intercept is B, the cloth's share (step 1).",
  },
  {
    id: "dead-time-meaning", steps: [2],
    q: "Why is the quantity to maximise the volume over the whole cycle, not the filtration rate while filtering?",
    options: [
      "The press produces nothing while it is opened, washed and cleaned, so that time must be paid by the filtrate",
      "The filtration rate never changes during a cycle",
      "The wash water has to be counted as filtrate",
      "The two are always equal",
    ],
    correct: 0,
    feedback: "The filtration rate is highest at the start of every cycle "
      + "and falls as the cake grows.  Only the average over t_f + t_w + t_d "
      + "tells how much filtrate a press gives in a day (step 2).",
  },
  {
    id: "no-wash-optimum", steps: [3],
    q: "With no wash and a cloth of no resistance (B = 0), when should the press be opened?",
    options: [
      "When the filtration time equals the dead time",
      "When the filtration rate has fallen to zero",
      "As soon as the cake covers the cloth",
      "When the cake fills the frame, whatever the time",
    ],
    correct: 0,
    feedback: "With B = 0 and no wash, the cycle is K_p V^2 / 2 + t_d, so a V*^2 "
      + "= t_d means K_p V*^2 / 2 = t_d: the filtration time is the dead time (step 3).",
  },
  {
    id: "more-dead-time", steps: [3],
    q: "The dead time of a press doubles. How does the best cake size V* change?",
    options: [
      "It grows by the square root of 2, about 1.4 times",
      "It doubles",
      "It stays the same",
      "It halves",
    ],
    correct: 0,
    feedback: "a V*^2 = t_d, so V* goes as the square root of the dead time (step 3).",
  },
  {
    id: "wash-opens-earlier", steps: [3],
    q: "A press that washes its cake is compared with one that does not, with the same dead time. Which opens at the smaller cake?",
    options: [
      "The one that washes, because the wash adds to the square term",
      "The one that does not wash",
      "Neither: the wash does not change the best volume",
      "They open at the same volume but the washing one is slower",
    ],
    correct: 0,
    feedback: "The wash time has a V^2 term of its own, so a = (1/2 + w/f) K_p is "
      + "larger and V* = sqrt(t_d / a) is smaller (step 3).",
  },
  {
    id: "symmetry", steps: [4],
    q: "Opening at half the best volume and opening at twice the best volume: which loses more of the average rate?",
    options: [
      "They lose exactly the same share",
      "Opening early loses more",
      "Opening late loses more",
      "It depends on the dead time",
    ],
    correct: 0,
    feedback: "R/R* = (2 + beta) x / (x^2 + 1 + beta x) is unchanged by "
      + "x -> 1/x, so x = 1/2 and x = 2 give the same value, for any dead time (step 4).",
  },
  {
    id: "presses", steps: [5],
    q: "The best cycle raises the average rate of one press. What does that do to the number of presses the plant needs, for the same feed?",
    options: [
      "It lowers it, because n = Q_f / R",
      "It raises it",
      "It leaves it unchanged",
      "It cannot be said without the cake thickness",
    ],
    correct: 0,
    feedback: "The presses are Q_f t_c / V = Q_f / R; the filtrate flow Q_f is "
      + "fixed by the feed, so a higher R needs fewer presses (step 5).",
  },
];
