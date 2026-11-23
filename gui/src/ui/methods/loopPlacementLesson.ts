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
  loopPlacementLesson -- the prose of "Where to put a control loop"
  (DEV.md 4c C204).

  THE TASK: a student who has drawn a reactor with two things to hold has to
  leave knowing (1) how many things a plant LETS them hold, (2) which to hold
  first, (3) how to choose which valve holds which variable, and (4) that the
  wrong choice is not "a little worse" but can be a loop that cannot work.

  WHERE THE NUMBERS COME FROM.  Every gain, every relative gain and every
  closed-loop outcome quoted by the page is a run of the shipped two-loop
  reactor (tutorials/ctrl/ctrl22), re-wired by loopPlacementCase.ts and run
  by choupoCtrl; tests/loopPlacement.test.ts re-runs them natively and holds
  the prose to them.  The prose says "about" where a number moves with the step
  size, and the limits say by how much.

  THE SOURCES, read at the page (DEV.md 4c C204; lessonReferences.json): Seborg,
  Edgar, Mellichamp and Doyle, Process Dynamics and Control, 4th ed. (2017):
  Section 13.1 (degrees of freedom), Section 13.2.1 Guideline 1 (a
  non-self-regulating variable must be controlled), Section 18.2 (Bristol's
  relative gain array, Eqs. 18-24 to 18-38 and the recommendation).  Bristol's
  original paper is cited by that book and is NOT in the library, so the page
  names it only as the book does.  The ordering "inventory, then throughput,
  then quality" is Choupo's own design judgement: the Design Guide's
  'Inventory first' paragraph carries the first move; the middle move is this
  page's reading and is labelled an assumption, because no source in the
  library states it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const LOOP_PLACEMENT_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Count the valves before you draw a loop",
    body: "A loop needs a valve to move. The number of things a plant lets you "
      + "hold is the number of independent valves, not the number you would "
      + "like to hold. Two valves in series on one pipe are one valve.",
    derivation: [
      { step: "A model with N_V variables and N_E independent equations leaves "
          + "this many to specify (Seborg et al., Sec. 13.1, p. 230).",
        eq: String.raw`N_F = N_V - N_E` },
      { step: "Some of them are disturbances you cannot move (the feed's "
          + "state). What is left can be controlled, and by the General Rule "
          + "it equals the number of independent manipulated inputs.",
        eq: String.raw`N_F = N_{FC} + N_D` },
      { step: "In the engine the vessel exposes four manipulated variables "
          + "(DynamicCSTR.cpp:1412): the jacket temperature, the inlet "
          + "temperature, the feed rate and the outflow. This page's reactor "
          + "uses three, because the feed arrives without a heater: the feed valve, the "
          + "product valve and the jacket's utility valve." },
    ],
    formula: String.raw`N_{FC} = N_F - N_D`,
    where: [
      { sym: "N_V", means: "the number of process variables of the model" },
      { sym: "N_E", means: "the number of independent equations of the model" },
      { sym: "N_F", means: "the model's degrees of freedom, N_V minus N_E" },
      { sym: "N_D", means: "the number of disturbance variables, inputs you "
          + "cannot manipulate" },
      { sym: "N_{FC}", means: "the control degrees of freedom: the number of "
          + "variables that can be held independently" },
    ],
    note: "A stream that splits, or two that merge, cannot have all three "
      + "flows set at once (Seborg et al., Fig. 13.1).",
  },
  {
    n: 2,
    title: "Hold the inventory first",
    body: "A level does not settle by itself: with a fixed outflow the vessel "
      + "fills until it overflows. Seborg's Guideline 1 says such "
      + "non-self-regulating variables must be controlled. Take the level "
      + "loop away and the engine stops the run.",
    derivation: [
      { step: "The engine states it when the run starts: the outflow is a "
          + "manipulated flow, so the level integrates the imbalance "
          + "(DynamicCSTR.cpp:549).",
        eq: String.raw`A_c\,\frac{\mathrm{d}h}{\mathrm{d}t} = v\,\bigl(F_\mathrm{in} - F_\mathrm{out}\bigr)` },
      { step: "Nothing in this equation pulls h back to a set value: only a "
          + "controller on F_out can. The engine then stops a run whose vessel "
          + "fills past its declared height, rather than clamping the level "
          + "(VariableVolumeHoldup.cpp:141)." },
    ],
    formula: String.raw`A_c\,\frac{\mathrm{d}h}{\mathrm{d}t} = v\,\bigl(F_\mathrm{in} - F_\mathrm{out}\bigr)`,
    where: [
      { sym: "A_c", means: "the vessel's cross-section", unit: "m2" },
      { sym: "h", means: "the liquid level", unit: "m" },
      { sym: "\\mathrm{d}h/\\mathrm{d}t", means: "the rate of change of the level", unit: "m/s" },
      { sym: "\\mathrm{d}h", means: "a small change of the level", unit: "m" },
      { sym: "\\mathrm{d}t", means: "a small interval of time", unit: "s" },
      { sym: "v", means: "the liquid's molar volume (a mean for the mixture)",
        unit: "m3/kmol" },
      { sym: "F_\\mathrm{in}", means: "the molar feed rate", unit: "kmol/s" },
      { sym: "F_\\mathrm{out}", means: "the molar outflow", unit: "kmol/s" },
    ],
    note: "The same holds for a gas pressure with a fixed vent, or a "
      + "temperature with no heat leaving it: look for the integrators first.",
  },
  {
    n: 3,
    title: "Measure the gains on the engine, never type them",
    body: "The array needs the steady-state effect of each valve on each "
      + "variable. Step one valve, hold the others, wait, and divide what "
      + "moved by what you moved (Seborg et al., Eq. 18-38). Here: three runs "
      + "of the reactor, level loop closed.",
    derivation: [
      { step: "Run 1 is the base: jacket at 345 K, feed at 1.0e-3 kmol/s. Run 2 "
          + "raises the jacket by 2 K. Run 3 raises the feed by 2.0e-5 kmol/s "
          + "(2 %). Each runs long enough to settle." },
      { step: "Rows are the controlled variables (the temperature and the "
          + "product's mole fraction), columns the manipulated ones. The "
          + "engine's cv x_2Butanol is that mole fraction "
          + "(DynamicCSTR.cpp:1400) and mv F_in scales the feed "
          + "(DynamicCSTR.cpp:1296).",
        eq: String.raw`K_{ij} = \frac{\Delta y_i}{\Delta u_j}` },
    ],
    formula: String.raw`\begin{bmatrix}\Delta T\\ \Delta x\end{bmatrix}
      = \begin{bmatrix}K_{11} & K_{12}\\ K_{21} & K_{22}\end{bmatrix}
        \begin{bmatrix}\Delta T_J\\ \Delta F\end{bmatrix}`,
    where: [
      { sym: "K_{ij}", means: "the steady-state gain from valve j to variable i" },
      { sym: "K_{11}", means: "the steady-state gain from the first valve to the first variable" },
      { sym: "K_{12}", means: "the gain from the second valve to the first variable" },
      { sym: "K_{21}", means: "the gain from the first valve to the second variable" },
      { sym: "K_{22}", means: "the gain from the second valve to the second variable" },
      { sym: "\\Delta y_i", means: "the change in controlled variable i between "
          + "a step run and the base run" },
      { sym: "\\Delta u_j", means: "the step made in manipulated variable j" },
      { sym: "\\Delta T", means: "the change in the reactor temperature", unit: "K" },
      { sym: "\\Delta x", means: "the change in the product's mole fraction",
        unit: "-" },
      { sym: "\\Delta T_J", means: "the step in the jacket temperature", unit: "K" },
      { sym: "\\Delta F", means: "the step in the molar feed rate", unit: "kmol/s" },
    ],
    note: "Gains change with operating point and step size: the limits give "
      + "the spread measured here.",
  },
  {
    n: 4,
    title: "The relative gain array chooses the pairing",
    body: "Bristol's array compares each gain with what it becomes once the "
      + "other loop is closed. It needs only the gains. Pair so that the "
      + "relative gains are positive and close to one. A negative one means "
      + "closing the other loop reverses this one's gain.",
    derivation: [
      { step: "The relative gain is a ratio of two gains: the open-loop one, "
          + "the other valve fixed, over the closed-loop one, the other "
          + "variable held at its set point (Seborg et al., Eq. 18-24).",
        eq: String.raw`\lambda_{11} = \frac{(\partial y_1/\partial u_1)_{u_2}}{(\partial y_1/\partial u_1)_{y_2}}` },
      { step: "For a 2x2, eliminate the second valve with the second "
          + "variable held (Eqs. 18-30 to 18-34).",
        eq: String.raw`\lambda_{11} = \frac{1}{1 - \dfrac{K_{12}K_{21}}{K_{11}K_{22}}}` },
      { step: "Each row and each column sums to one (Eq. 18-35), so one "
          + "number fills the array." },
    ],
    formula: String.raw`\Lambda = \begin{bmatrix}\lambda & 1-\lambda\\ 1-\lambda & \lambda\end{bmatrix}`,
    where: [
      { sym: "\\Lambda", means: "the relative gain array, one row per controlled "
          + "variable and one column per valve" },
      { sym: "y_1", means: "the first controlled variable (the temperature)" },
      { sym: "u_1", means: "the first manipulated variable (the jacket temperature)" },
      { sym: "\\lambda_{11}", means: "the relative gain between y_1 and u_1" },
      { sym: "\\lambda", means: "\\(\\lambda_{11}\\), which also equals \\(\\lambda_{22}\\)" },
    ],
    note: "At 1 the loops do not interact; between 0 and 1 the other loop "
      + "makes this one stiffer; above 1 weaker; below 0 it changes sign.",
  },
  {
    n: 5,
    title: "The wrong pairing, run on the engine",
    body: "The array gives the two pairings a relative gain each. The "
      + "temperature on the jacket and the composition on the feed rate "
      + "come out positive. Swap them and one is negative. Wire the case "
      + "both ways with the same recipe and watch.",
    derivation: [
      { step: "Both wirings keep the shipped level loop. Each other loop gets "
          + "the same recipe: half a unit of loop gain and an integral time "
          + "of 300 s, its sign following its measured gain. The engine's "
          + "PID acts on the error set point minus measurement "
          + "(PIDController.cpp:125)." },
      { step: "In the swapped wiring the feed-rate loop drives the feed to "
          + "its lower limit and stays there: while the output is clamped, "
          + "the integral stops (PIDController.cpp:131), the other loop "
          + "keeps pushing the jacket, and the temperature never reaches "
          + "its set point." },
    ],
    note: "A positive relative gain far from one is not free: the closed-loop "
      + "gain is the open-loop gain divided by it.",
  },
  {
    n: 6,
    title: "Inventory first, then throughput, then quality",
    body: "Spend the valves in that order. The level takes the outflow valve. "
      + "Then decide who sets throughput: if the feed rate is fixed, the "
      + "last valve holds one quality variable and the other floats. The "
      + "natural wiring made the composition loop set the feed.",
    derivation: [
      { step: "Inventory first is the design guide's first move and Seborg's "
          + "Guideline 1. A quality comes third (Guideline 3: a direct "
          + "measure of product quality). The middle step, who sets the "
          + "production rate, is this page's reading, not a cited rule." },
      { step: "Count on this flowsheet: three valves, four wishes (level, "
          + "temperature, composition and a fixed feed). One wish must go. "
          + "Fixing the feed leaves two valves for three variables, so the "
          + "temperature floats while the composition is held. The run "
          + "reports where it settles." },
    ],
    note: "In a real plant, throughput is a business decision before it is a "
      + "loop; the page counts valves and does not decide it for you.",
  },
];

export const LOOP_PLACEMENT_LIMITS: readonly LessonLimit[] = [
  {
    id: "steady-state-only",
    title: "The array is steady-state arithmetic.",
    body: "It uses only gains at settled values and says nothing of speed. A "
      + "pairing the array likes can still be slow, and one it dislikes can "
      + "still work when one loop is much faster than the other (Seborg "
      + "et al., remark 1, p. 334). The page's runs show what happens with "
      + "equal tuning effort on both loops, nothing more.",
  },
  {
    id: "one-point",
    title: "One operating point, and the gain moves with the step.",
    body: "The three runs measure the gains at one base point with small "
      + "steps. Taking steps five times larger moves the relative gain from "
      + "1.9 to about 2.0; steps in the other direction, to about 1.8. The "
      + "sign of the swapped pairing's gain does not change over that range.",
  },
  {
    id: "toy-reactor",
    title: "The reactor is a toy and the tuning is the page's.",
    body: "The reaction is a first-order isomerisation chosen to be simple, not "
      + "fitted to data. The PI recipe is an assumption, the same for every "
      + "pairing so that the pairing is the only difference. Other gains "
      + "did not rescue the swapped wiring in the tests the page ran, but "
      + "that is a few trials, not a proof.",
  },
  {
    id: "feed-as-valve",
    title: "Controlling a composition with the feed rate is unusual.",
    body: "It is here to make a square two-by-two out of this one vessel, and "
      + "the page says what it costs: the feed rate becomes whatever the "
      + "quality needs. Real plants usually fix the feed and hold quality "
      + "with a temperature or a ratio.",
  },
  {
    id: "two-by-two",
    title: "Two by two only, and the level is taken as closed.",
    body: "Seborg's treatment extends the array to larger systems, where it "
      + "is harder to read. The level loop is in every run and the gains "
      + "are measured with it closed, which is itself the 'inventory first' "
      + "choice; the page does not put the level in the array.",
  },
  {
    id: "middle-step-is-judgement",
    title: "'Then throughput' is not a cited rule.",
    body: "The first move has two sources and the last one has a textbook "
      + "guideline. The middle move is a reading of how the sources "
      + "combine, and the page labels it that way. The Theory Guide carries no "
      + "section on pairing or the array: the link goes to the dynamic "
      + "reactor chapter, whose control contract this page uses.",
  },
];

export const LOOP_PLACEMENT_QUIZ: readonly QuizQuestion[] = [
  {
    id: "valves-not-wishes", steps: [1],
    q: "A vessel has a feed valve, a product valve and a jacket valve. Someone "
      + "wants to hold the level, the temperature, the composition and a fixed "
      + "product flow. What is the right reading?",
    options: [
      "Four wishes against three valves: one cannot be held independently",
      "Four wishes are fine: a loop only needs a measurement",
      "Add a second valve on the feed line and there will be four",
    ],
    correct: 0,
    feedback: "The control degrees of freedom are the independent valves. A "
      + "second valve on the same pipe sets nothing new, and the measurement "
      + "does not move anything. One wish has to give way, and the choice of "
      + "which is the design.",
  },
  {
    id: "why-level-first", steps: [2],
    q: "The level loop is removed and the pairing of the other two is kept. "
      + "What does the engine do?",
    options: [
      "It runs on and the level drifts a little",
      "It stops the run with an overflow message, because nothing holds the level",
      "It clamps the level at the top and carries on",
    ],
    correct: 1,
    feedback: "The level integrates the flow imbalance, so with no loop on it "
      + "any imbalance grows until the vessel is full. The engine stops "
      + "instead of clamping, because spilled liquid would be in no stream. "
      + "The loop that holds the level goes first.",
    origins: ["engine"],
  },
  {
    id: "negative-lambda", steps: [4, 5],
    q: "A pairing has a negative relative gain. What is the right conclusion?",
    options: [
      "The loop is just a little slower than usual",
      "Closing the other loop reverses this loop's gain, so do not use that pairing",
      "The gains must have been measured with too large a step",
    ],
    correct: 1,
    feedback: "The closed-loop gain has the opposite sign to the open-loop "
      + "gain, so the two loops fight. In the engine run the swapped pairing "
      + "drives the feed to its lower limit and never reaches the "
      + "temperature set point. The sign survives the choice of step size.",
    origins: ["engine"],
  },
  {
    id: "closed-gain", steps: [4, 5],
    q: "In the natural wiring the relative gain is about 1.9. What does it say "
      + "about the temperature loop once the composition loop is closed?",
    options: [
      "Its effective gain is about half what it was",
      "Its effective gain is about twice what it was",
      "Nothing: only the sign matters",
    ],
    correct: 0,
    feedback: "The closed-loop gain is the open-loop gain divided by "
      + "lambda, so about 1/1.9: the loops interact and each is weaker with "
      + "the other closed. The pairing is right but not free, which is why "
      + "the array's recommendation says positive and close to one.",
    origins: ["engine"],
  },
];
