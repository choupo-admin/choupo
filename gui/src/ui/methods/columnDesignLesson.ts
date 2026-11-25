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
  The column-design lesson, as DATA (the reason the McCabe, Kremser and FUG
  lessons are data: prose is the part of a tool that rots with nothing
  failing, and an argument held as data can be asserted to still run).

  THE ARGUMENT, in four cards.  A student who designs a column for a REAL
  mixture meets four questions in a fixed order, and each is answered by a
  different object:

    1. FEASIBILITY.  Which products can a simple column make from this feed?
       A mass balance (the lever rule) on the map of what boiling does to the
       mixture.  Distillation boundaries and azeotropes cannot be crossed.
    2. THE DESIGN CURVE.  With the specification FIXED (both key purities),
       what reflux does each integer stage count need?  R(N) has two
       asymptotes, R_min at many stages and N_min at a large reflux, and every
       point on it is on specification.  The ENGINE's rigorous column answers.
    3. THE COST OPTIMUM.  Capital rises with the stages, energy rises with the
       reflux, so the sum has a minimum -- and the price of energy moves it.
    4. THE SHORTCUT AS CONTROL.  Fenske-Underwood-Gilliland on the SAME
       mixture: where the mixture is nearly ideal it agrees, and where an
       azeotrope pinches the column it parts, by an amount the page prints.

  The ideal mixture is the CONTROL throughout, not an afterthought: the claim
  "the shortcut fails near an azeotrope" is only a claim about the azeotrope
  if the same shortcut, run the same way, does not fail without one.

  NO NUMBER FROM THESE RUNS IS QUOTED HERE.  The badges, plots and tables carry
  the recorded engine run's own values (gui/src/case/columnDesignRecorded.json,
  held by tests/columnDesign.test.ts); a number copied into prose is a second
  home for a derived fact, and it drifts.

  ENGINE CLAIMS carry the file and line they were read at, and the test holds
  each to the text it claims (its CLAIMS table).
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const COLUMN_DESIGN_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Feasibility first: what can a simple column make from this feed?",
    body: "Before any stage is counted, ask which products are possible at all. "
      + "A simple column splits one feed into two products, and a mass balance "
      + "fixes how much of each: the feed, the distillate and the bottoms lie "
      + "on one straight line, and the amounts are the lever rule. What the "
      + "balance cannot say is whether the products are reachable, and that "
      + "is a property of the mixture. Boiling carves the composition space "
      + "into regions, and the lines that divide them are distillation "
      + "boundaries a column cannot cross at fixed pressure. For two "
      + "components the only boundary is an azeotrope: a distillate beyond it "
      + "is a limit of the mixture and out of reach for any design. A mixture "
      + "without an azeotrope is free of that limit, and every purity is reachable for a "
      + "price in stages and reflux. The page puts the engine's own boiling "
      + "and condensing temperatures of both mixtures side by side, so the "
      + "azeotrope can be seen as the place where the two curves touch.",
    formula: String.raw`\begin{aligned}
F &= D + B\\
F\,z &= D\,x_D + B\,x_B\\
\frac{D}{F} &= \frac{z - x_B}{x_D - x_B}
\end{aligned}`,
    where: [
      { sym: "F", means: "Molar flow of the feed.", unit: "kmol/h" },
      { sym: "D", means: "Molar flow of the distillate, the top product.", unit: "kmol/h" },
      { sym: "B", means: "Molar flow of the bottoms, the bottom product.", unit: "kmol/h" },
      { sym: "z", means: "Mole fraction of the light key (the first-listed, more volatile "
          + "component) in the feed.", unit: "dimensionless" },
      { sym: "x_D", means: "Mole fraction of the light key in the distillate.",
        unit: "dimensionless" },
      { sym: "x_B", means: "Mole fraction of the light key in the bottoms; a good "
          + "separation makes it small.", unit: "dimensionless" },
    ],
    note: "For more than two components the same balance is drawn on a triangle "
      + "and the regions are found by integrating residue curves; the residue "
      + "curve page does that for ternaries.",
    leadsTo: {
      tool: "residue-curves",
      toolLabel: "Residue curve maps",
      stepTitle: "What a simple column can make from a feed: the lever rule",
      body: "With three components the boundaries are curves across a triangle "
        + "and the products a simple column can reach are read off the "
        + "region the feed sits in. That page computes the map with the engine.",
    },
  },
  {
    n: 2,
    title: "Fix the specification, and let the engine find the reflux for every stage count",
    body: "A design is a point on a curve, not a number. Hold the specification "
      + "fixed, both key purities, and ask for each integer stage count N the "
      + "reflux ratio R at which the column meets it. Two things are unknown "
      + "(the reflux R and the distillate rate D) and two things are "
      + "specified (x_D and x_B), so the engine's designSpec solves two "
      + "equations in two unknowns with a Newton iteration on the whole "
      + "column, once per N (DesignSpec.cpp:375). The purities it matches are "
      + "the column's own published x_D_LK and x_B_HK "
      + "(DistillationColumn.cpp:4531-4532). Every point on the curve is "
      + "therefore on specification, which is what makes the curve a design "
      + "tool: moving along it trades stages against reflux and nothing else. "
      + "Its two asymptotes are the two limits of the column. With very many "
      + "stages the reflux falls to a floor, the minimum reflux R_min, where a "
      + "pinch forms and extra stages stop helping; with a very large reflux "
      + "the stage count falls to a floor, the minimum stages N_min, where the "
      + "column is at total reflux and makes no product. No column can lie "
      + "below either.",
    formula: String.raw`\begin{aligned}
g(R, D;\, N) &= \begin{pmatrix} x_D(R, D;\, N) - x_D^{*} \\ x_B(R, D;\, N) - x_B^{*} \end{pmatrix} = 0\\[8pt]
R(N) &\longrightarrow R_\mathrm{min} \quad (N \to \infty), \qquad R(N) \longrightarrow \infty \quad (N \to N_\mathrm{min})
\end{aligned}`,
    where: [
      { sym: "g", means: "The pair of specification residuals (a vector of two numbers); the "
          + "designSpec drives both to zero.", unit: "dimensionless" },
      { sym: "R", means: "Reflux ratio: liquid returned to the top divided by distillate "
          + "taken off, L/D.", unit: "dimensionless" },
      { sym: "N", means: "The number of equilibrium stages of the rigorous column "
          + "(the reboiler is the last stage, the total condenser is not a stage).",
        unit: "stages" },
      { sym: "x_D^{*}", means: "The specified light-key mole fraction of the distillate.",
        unit: "dimensionless" },
      { sym: "x_B^{*}", means: "The specified light-key mole fraction of the bottoms "
          + "(the page fixes it through the heavy key's purity there).",
        unit: "dimensionless" },
      { sym: "R_\\mathrm{min}", means: "Minimum reflux ratio, the floor of R(N) as N grows "
          + "without bound. The page prints the engine's R at the largest recorded N, "
          + "which is an upper bound of it.", unit: "dimensionless" },
      { sym: "N_\\mathrm{min}", means: "Minimum stages, reached as R grows without bound. "
          + "The page prints the smallest recorded N for which the designSpec found a "
          + "reflux.", unit: "stages" },
    ],
    note: "The feed stage is placed at a fixed fraction of the column, chosen "
      + "once on the recorded mixture; each point is the reflux for that "
      + "placement, which is a little above the best placement at every N.",
  },
  {
    n: 3,
    title: "The cost optimum: stages cost capital, reflux costs energy",
    body: "On the curve every point meets the specification, so the choice "
      + "between them is economic. Moving up the curve to more stages makes "
      + "a taller, dearer shell and more trays, but lowers the reflux, so "
      + "the reboiler and the condenser shrink and the energy bill falls. The "
      + "annual cost is the sum of those two, and a sum of a rising term and a "
      + "falling one has a minimum. The capital is the engine's own: the "
      + "column is sized by its tray hydraulics (the diameter that keeps "
      + "every tray at the flooding fraction it is given) and costed item by "
      + "item by the Turton bare-module method for the shell, the trays, the "
      + "condenser, the reboiler and the reflux drum. The reboiler's duty is "
      + "the column's published Q_reboiler_kW (DistillationColumn.cpp:4659). "
      + "The page adds two numbers it owns, a capital charge and the price of "
      + "the heat, and both are knobs: dearer energy moves the optimum to "
      + "more stages and less reflux, and a dearer capital charge moves it "
      + "back. The optimum is searched over the stage counts the engine was "
      + "run at, a grid and not a root.",
    formula: String.raw`C_A(N) = f_c\, C_\mathrm{inst}(N) \;+\; h\, p_E\, Q_\mathrm{reb}(N) \;+\; C_\mathrm{cool}(N)`,
    where: [
      { sym: "C_A", means: "Annualised cost of the column at N stages.", unit: "EUR/yr" },
      { sym: "f_c", means: "Capital charge: the fraction of the installed cost charged "
          + "each year (a capital-recovery factor for an interest rate and a life).",
        unit: "1/yr" },
      { sym: "C_\\mathrm{inst}", means: "Installed cost of the five items, the engine's Turton "
          + "total-module cost (bare module with contingency and fee).", unit: "EUR" },
      { sym: "h", means: "Operating hours per year, fixed on the page.", unit: "h/yr" },
      { sym: "p_E", means: "Price of the heat the reboiler takes, per kWh of duty; the "
          + "page's first knob, started at the engine's own low-pressure steam price.",
        unit: "EUR/kWh" },
      { sym: "Q_\\mathrm{reb}", means: "Reboiler duty the engine computed at that point.",
        unit: "kW" },
      { sym: "C_\\mathrm{cool}", means: "Yearly cost of the condenser's cooling water at the "
          + "engine's utility record.", unit: "EUR/yr" },
    ],
    note: "The cost model is the page's, and it is plain on purpose: the "
      + "optimum's position is the lesson, and its depth depends on prices the "
      + "page cannot know. Read the shape, not the euro figure.",
  },
  {
    n: 4,
    title: "The shortcut as a control: it agrees near ideal and parts near the azeotrope",
    body: "Fenske, Underwood and Gilliland give the two asymptotes and the "
      + "curve between them in closed form, from one relative volatility "
      + "frozen at the feed's bubble point (ShortcutColumn.cpp:136) and an "
      + "empirical interpolation (ShortcutColumn.cpp:306). Run on the ideal "
      + "benzene/toluene mixture, whose relative volatility barely changes "
      + "down the column, it lands on the rigorous curve's limits. Run on "
      + "ethanol/water with the same method, the same kind of specification and "
      + "the same engine, it takes the volatility the feed sees, which is "
      + "large, and the column it describes is far easier than the rigorous "
      + "one, whose volatility collapses to one at the azeotrope. The two "
      + "ratios below, rigorous over shortcut, are the size of that failure: "
      + "close to one for the control, far from one for the real mixture, and "
      + "growing as the distillate is asked closer to the azeotrope. A rigorous "
      + "minimum reflux for a non-ideal mixture comes from the pinch in the "
      + "rectifying section and, past an azeotrope, from a boundary value "
      + "construction; that calculation is the next step for the engine, and "
      + "until it exists the rigorous R_min on this page is bracketed by the "
      + "curve itself.",
    formula: String.raw`\rho_R = \frac{R^{\mathrm{rig}}(N_\mathrm{big})}{R_\mathrm{min}^{\mathrm{FUG}}}, \qquad
\rho_N = \frac{N_\mathrm{min}^{\mathrm{rig}}}{N_\mathrm{min}^{\mathrm{FUG}}}`,
    where: [
      { sym: "\\rho_R", means: "How many times the rigorous reflux at the largest recorded "
          + "stage count exceeds the shortcut's minimum reflux; a shortcut that agreed "
          + "would give a value just above one.", unit: "dimensionless" },
      { sym: "\\rho_N", means: "The rigorous minimum stage count divided by Fenske's; "
          + "one when the shortcut is right.", unit: "dimensionless" },
      { sym: "R^{\\mathrm{rig}}", means: "Reflux ratio of the rigorous column at the stage "
          + "count named in the bracket, from the recorded designSpec.",
        unit: "dimensionless" },
      { sym: "N_\\mathrm{big}", means: "The largest stage count recorded, where the rigorous "
          + "column is nearly at its minimum reflux.", unit: "stages" },
      { sym: "R_\\mathrm{min}^{\\mathrm{FUG}}", means: "Underwood's minimum reflux from the "
          + "shortcut column the engine ran on the same mixture and the same products.",
        unit: "dimensionless" },
      { sym: "N_\\mathrm{min}^{\\mathrm{rig}}", means: "The smallest stage count for which "
          + "the rigorous designSpec found a reflux.", unit: "stages" },
      { sym: "N_\\mathrm{min}^{\\mathrm{FUG}}", means: "Fenske's minimum stages from the "
          + "shortcut column on the same mixture and products.", unit: "stages" },
    ],
    note: "The control matters: a shortcut that disagreed with the rigorous column "
      + "on the ideal mixture too would be a statement about the shortcut's "
      + "arithmetic, not about the azeotrope.",
  },
];

export const COLUMN_DESIGN_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "recorded-run",
    title: "A recorded run, not a live one.",
    body: "Each point of the design curve is a designSpec of about twenty rigorous "
      + "solves, so the page reads a table the engine wrote once "
      + "(bin/curate/c501_column_design_table.py). Change the mixture's "
      + "specification and the table does not change; the case "
      + "column21_design_curve_ethanol_water reproduces any point.",
  },
  {
    id: "two-mixtures",
    title: "Two binary mixtures stand for the general case.",
    body: "Ethanol/water carries the azeotrope and the ideal benzene/toluene carries "
      + "the control. A ternary mixture, an entrainer or a column with side draws "
      + "changes the geometry and is not drawn; the residue curve page "
      + "is where ternary feasibility lives.",
  },
  {
    id: "constant-overflow",
    title: "Constant molar overflow, ideal vapour.",
    body: "The simultaneous column the recorded points come from solves the material "
      + "and equilibrium rows with constant molar overflow and an ideal-gas vapour, "
      + "and closes the first law on the reboiler (DistillationColumn.cpp:4659). "
      + "Its duties are those of that approximation.",
  },
  {
    id: "feed-placement",
    title: "The feed stage is a fixed fraction, not an optimum.",
    body: "Each point places the feed at the same fraction of the column. The best "
      + "feed stage moves with N, so every point is a little above the true "
      + "minimum reflux for its stage count.",
  },
  {
    id: "cost-model",
    title: "The cost model is the page's, over the engine's numbers.",
    body: "Capital is the engine's Turton total-module cost for the equipment the "
      + "hydraulics sized, with the exchanger areas from declared U and LMTD; the "
      + "capital charge, the heat price and the operating hours are assumptions "
      + "the page states. The depth of the optimum is not a prediction.",
  },
  {
    id: "pinch-minimum-reflux",
    title: "The pinch-point minimum reflux is the next step.",
    body: "A rigorous minimum reflux for a non-ideal column (the pinch in the "
      + "rectifying section, and the boundary value method past an azeotrope) is "
      + "the next step for the engine. The page brackets it with the recorded curve.",
  },
];

/** The questions at the foot of the page, each testing a step and naming it. */
export const COLUMN_DESIGN_QUIZ: readonly QuizQuestion[] = [
  {
    id: "beyond-azeotrope", steps: [1],
    q: "A binary mixture forms a minimum-boiling azeotrope at 1 atm. Can a single column make a distillate richer in the light key than the azeotrope?",
    options: [
      "Yes, with enough stages",
      "Yes, with a high enough reflux",
      "No: the azeotrope is a boundary at that pressure, and neither more stages nor more reflux crosses it",
      "Only if the feed is a saturated vapour",
    ],
    correct: 2,
    feedback: "At the azeotrope the vapour has the liquid's composition, so a stage "
      + "changes nothing; a single column at one pressure cannot pass it, and the "
      + "design problem does not arise (step 1).",
  },
  {
    id: "on-spec", steps: [2],
    q: "Why is every point of the R(N) curve a fair design to compare with the others?",
    options: [
      "Each uses the same number of trays",
      "Each is solved at the same reflux ratio",
      "Each meets the same fixed specification, so only the trade between stages and reflux differs",
      "Each has the same reboiler duty",
    ],
    correct: 2,
    feedback: "The designSpec holds both key purities and finds the reflux for each "
      + "stage count, so the points differ only in how stages are traded for "
      + "reflux (step 2).",
  },
  {
    id: "asymptotes", steps: [2],
    q: "What do the two asymptotes of the R(N) curve mean?",
    options: [
      "A floor on the reflux however many stages, and a floor on the stages however large the reflux",
      "The maximum reflux and the maximum stages the column can carry",
      "The flooding limit and the weeping limit",
      "The two products' purities",
    ],
    correct: 0,
    feedback: "Minimum reflux is the limit of infinitely many stages and minimum "
      + "stages is the limit of total reflux; no specified column lies below "
      + "either (step 2).",
  },
  {
    id: "cost-shape", steps: [3],
    q: "Why does the annual cost have a minimum along the design curve?",
    options: [
      "Capital falls and energy rises as stages are added",
      "Capital rises with the stages while energy falls with the reflux, and a rising and a falling term sum to a minimum",
      "The engine adds a penalty at large N",
      "Cooling water becomes dearer at large N",
    ],
    correct: 1,
    feedback: "Stages cost shell and trays; reflux costs reboiler duty. The first "
      + "rises along the curve and the second falls, so their sum has a minimum "
      + "(step 3).",
  },
  {
    id: "dear-energy", steps: [3],
    q: "Energy becomes dearer. Where does the cost optimum move?",
    options: [
      "To fewer stages and more reflux",
      "To more stages and less reflux",
      "It does not move",
      "To the minimum stage count",
    ],
    correct: 1,
    feedback: "A dearer joule is saved by spending capital: more stages let the "
      + "specification be met at a lower reflux, which is the move the slider "
      + "shows (step 3).",
  },
  {
    id: "control", steps: [4],
    q: "Why is the ideal benzene/toluene column kept beside ethanol/water in the shortcut comparison?",
    options: [
      "Because it is cheaper to run",
      "As a control: if the shortcut also failed there, the failure would be the shortcut's arithmetic and not the azeotrope's",
      "Because it has the same relative volatility as ethanol/water",
      "Because the engine cannot solve ethanol/water without it",
    ],
    correct: 1,
    feedback: "The same method on the same kind of specification agrees where the "
      + "volatility is nearly constant, so the disagreement near the azeotrope "
      + "is attributable to it (step 4).",
  },
];
