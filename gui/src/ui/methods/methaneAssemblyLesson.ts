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
  methaneAssemblyLesson -- the lesson text of the `methane-assembly` EduTool,
  "Assemble methane combustion".

  THE QUESTION (C458, scope approved 2026-11-22): a methane flame needs
  hundreds of reactions in a published mechanism.  What is the smallest set
  you can assemble by hand from a reaction library, reaction by reaction, that
  makes methane ignite when a shock tube says it should, and what does each
  step you add buy?  The page assembles it in six rungs, runs each as a shipped
  case, reads the ignition delay the engine prints, shows by the sensitivity
  which few reactions govern, and then puts the assembled set against the
  measured delays and against the whole appendix it was taken from.

  Every `file:line` below is held to its text by gui/tests/methaneAssembly.test.ts.
  No number is typed here: each number on the page is an engine run (the
  seven shipped cases) or a row of the review table the test holds to its
  source, and the gate check_lesson_typed_numbers holds that line.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const METHANE_TASK = "Methane does not ignite from a handful of reactions.  Start from the hydrogen "
  + "and oxygen core in the reaction library, add the carbon chain one rung at a time, and say, after "
  + "each rung, what the engine now predicts for the ignition delay a shock tube measured, and which "
  + "reactions decide it.";

export const METHANE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The measurement: one shock-tube delay, and the vessel that stands for it",
    body: "In a shock tube a reflected shock heats a methane, oxygen and nitrogen mixture almost at once "
      + "to a known temperature and pressure and holds it there.  After an induction time the mixture "
      + "ignites: the pressure and the temperature jump.  That induction time is the ignition delay, and "
      + "Petersen, Davidson and Hanson measured it for methane at pressures from tens to hundreds of "
      + "atmospheres.  The page takes one of their points (their Table 2, page 86: mixture 2, three "
      + "parts methane, two oxygen, ten nitrogen) as the target.  The engine's batch reactor stands for "
      + "the gas behind the reflected shock: a closed vessel at constant volume, adiabatic, started at "
      + "the measured temperature and pressure.  The delay the engine prints is the time of the largest "
      + "temperature rise per unit time on the write grid (src/applications/choupoBatch/main.cpp:2507), "
      + "a definition close to, not the same as, the experimenters' extrapolation of the steepest "
      + "pressure rise.  Every rung below is the SAME vessel with the SAME start; only the reactions "
      + "the case lists change.",
    formula: String.raw`\tau = t\Big|_{\max\,\mathrm{d}T/\mathrm{d}t}`,
    where: [
      { sym: "\\tau", means: "the ignition delay: the time at which the temperature rises fastest", unit: "s" },
      { sym: "t", means: "time since the vessel was started", unit: "s" },
      { sym: "T", means: "the temperature of the gas in the vessel", unit: "K" },
    ],
    note: "The six rungs are tutorials/batch/combustion/methane01_h2o2_core to methane06_assembled; "
      + "methane07_sensitivity is a seventh case, the sensitivity of the assembled set.  The "
      + "start is the same in all: the numbers are in the case's 0/internalStates/vessel, with the "
      + "page of the paper they are read from.",
  },
  {
    n: 2,
    title: "Rung 1: the hydrogen and oxygen core cannot start methane",
    body: "The reaction library holds the hydrogen and oxygen mechanism of O Conaire and co-workers, "
      + "one record per reaction, named by its equation, with the journal page it was read from.  A "
      + "case asks for it by set name.  It contains no reaction of a carbon species.  Run this rung: "
      + "the mixture holds methane and oxygen, no hydrogen and no radicals, so there is nothing for "
      + "the core to chew on.  The methane is a spectator, the temperature does not move, and the "
      + "engine prints no ignition delay because the temperature never rose by the amount it needs "
      + "to call an ignition.  A mechanism is not a mixture: the species a case holds do nothing "
      + "until a reaction names them.",
    note: "How a case asks for sets: reactionSets in constant/reactions, read by "
      + "src/thermo/reaction/KineticsLibrary.cpp:388-389.  The library records are in data/standards/kinetics/.",
  },
  {
    n: 3,
    title: "Rung 2: the attack on methane makes CH3, and CH3 has nowhere to go",
    body: "Methane is attacked by oxygen, by hydrogen atoms, by hydroxyl, by oxygen atoms and by "
      + "hydroperoxyl, and each attack takes one hydrogen off it and leaves a methyl radical, CH3.  "
      + "Five records from Appendix A of Miller and Bowman, with their page.  Only the first of them "
      + "needs no radical to start from, and it is the slow one: its activation energy is large.  "
      + "Add these five and run: a trace of CH3 appears and the temperature barely moves.  The "
      + "chain is open at the other end.  CH3 is made and nothing consumes it, so the products "
      + "do not exist and the heat release is negligible.  Chemical kinetics is a chain of links: "
      + "a mechanism that ends in a species nobody consumes predicts that nothing happens.",
    formula: String.raw`k = A\,T^{b}\,\exp\!\Big(\!-\frac{E_a}{R\,T}\Big)`,
    where: [
      { sym: "k", means: "the rate constant of an elementary reaction (the forward rate is k times the concentrations of the reactants)", unit: "cm3, mol, s" },
      { sym: "A", means: "the pre-exponential factor of the record, as printed", unit: "cm3, mol, s" },
      { sym: "b", means: "the temperature exponent of the record, as printed" },
      { sym: "E_a", means: "the activation energy of the record, as printed", unit: "cal/mol" },
      { sym: "R", means: "the gas constant", unit: "cal/(mol K)" },
      { sym: "T", means: "the temperature of the gas (already glossed in step 1)", unit: "K" },
    ],
    note: "Each record's three numbers are the printed ones (A, b, Ea), held to the table the review "
      + "read from the page images by bin/curate/check_kinetics_library.py.  These are one "
      + "mechanism's values, not evaluated constants.",
  },
  {
    n: 4,
    title: "Rung 3: the methyl step opens the branching, and the mixture ignites, far too early",
    body: "CH3 can react with oxygen to make CH3O and an oxygen atom: one radical in, two out, the "
      + "chain branching that makes a hydrocarbon explode.  CH3 also meets oxygen atoms and "
      + "hydroperoxyl, and recombines with hydrogen; CH3O gives up a hydrogen and becomes "
      + "formaldehyde, CH2O.  Add these twelve records and run.  The mixture now ignites, and the "
      + "ignition delay the engine prints is a small fraction of what the shock tube measured.  The "
      + "carbon stops at formaldehyde, which here is not consumed, but the branching reaction alone "
      + "is enough to drive the temperature up.  A mechanism can ignite for the wrong reasons.",
    note: "The page does not tell you which reaction did it: step 7 does, by the sensitivity.",
  },
  {
    n: 5,
    title: "Rungs 4 and 5: formaldehyde to HCO to CO, and CO to CO2, where the heat is",
    body: "Formaldehyde is attacked by hydroxyl, hydrogen and oxygen and gives HCO; HCO falls apart "
      + "or reacts with oxygen and gives carbon monoxide; the CH2 that the methyl step makes is "
      + "oxidised too.  That is the fourth rung.  The fifth adds four reactions that turn CO "
      + "into CO2, the step that releases the largest part of the heat.  Run both.  The "
      + "temperature reached rises from one rung to the next, because the carbon is oxidised "
      + "further, and the ignition delay hardly moves: it was decided earlier, by the "
      + "branching, and the later links only decide how much heat the vessel finally holds.  "
      + "The delay is set by the beginning of the chain, the final temperature by its end.",
    note: "Read the table of the rungs on the page: ignition delay, final temperature, and the "
      + "amount of CO and CO2 left.",
  },
  {
    n: 6,
    title: "Rung 6: the ethane route, one reaction that is not in the C1 chain, is worth a factor of ten",
    body: "At the high pressures of the shock tube two methyl radicals meet often.  They can "
      + "recombine into ethane, a reaction that needs a third body to carry away the energy and "
      + "whose rate therefore depends on pressure (a fall-off reaction: the same Troe form as the "
      + "H + O2 record).  Ethane is then attacked and sends its carbon back to CH3 or on to "
      + "ethylene.  Seven records.  The effect is out of proportion to their number: the "
      + "recombination removes methyl radicals from the branching, so the ignition delay "
      + "grows by about an order of magnitude and lands on the measurement.  The chain that "
      + "ended at CO2 had left out a side road that dominates at this pressure.  The assembled "
      + "set is the hydrogen core and the carbon chain of this page.",
    note: "Appendix A of Miller and Bowman prints the whole mechanism; the library holds the rungs "
      + "this page uses, and only those whose equation the library did not already have.",
  },
  {
    n: 7,
    title: "Which reactions govern: the sensitivity of the delay to each rate constant",
    body: "Run the assembled case with the sensitivity block.  The engine integrates the vessel "
      + "once for the base case and once per reaction with that one reaction's rate multiplied by a "
      + "factor, forward and reverse together, so the equilibrium state is the same in every run.  "
      + "The sensitivity coefficient is the change in the logarithm of the delay per unit change "
      + "in the logarithm of the rate constant (src/unitOperations/batch/BatchReactor.cpp:927).  "
      + "A negative coefficient means that a faster reaction brings the ignition forward, a positive "
      + "one that it delays it.  The page lists the largest.  Two reactions of the methyl radical "
      + "head the list and pull in opposite directions: the branching of CH3 with oxygen brings "
      + "the ignition forward, the recombination of two CH3 delays it, and the delay is, to a first "
      + "approximation, the outcome of that competition.  The rest of the reactions follow at a "
      + "distance.  A few reactions carry most of the delay, and that is why a small, hand-assembled "
      + "set can stand in for a large mechanism: the other reactions are there to be right about the "
      + "products, not about the delay.",
    formula: String.raw`S_j = \frac{\mathrm{d}\ln\tau}{\mathrm{d}\ln k_j} \approx \frac{\ln\tau_j - \ln\tau_0}{\ln f}`,
    where: [
      { sym: "S_j", means: "the sensitivity coefficient of the ignition delay to reaction j" },
      { sym: "k_j", means: "the rate constant of reaction j", unit: "cm3, mol, s" },
      { sym: "\\tau_0", means: "the ignition delay of the base case", unit: "s" },
      { sym: "\\tau_j", means: "the ignition delay with the rate of reaction j multiplied by f", unit: "s" },
      { sym: "f", means: "the factor the engine multiplies the rate by, one reaction at a time (the case declares it)" },
    ],
    note: "The engine computes and pins the coefficients (sens_S_ rows of the case's golden); the page "
      + "only sorts and draws them.  A larger factor smooths the estimate but leaves the linear range.",
  },
  {
    n: 8,
    title: "Against the measurement, and against the whole appendix it was taken from",
    body: "The table runs the assembled set, the C1 chain without the ethane route, the whole "
      + "Appendix A of Miller and Bowman (the case nox03 with the same start replaced), and the "
      + "AramcoMech 1.3 mechanism run in the same engine, at every point of the two nitrogen "
      + "mixtures of the shock-tube paper, beside the measured delay.  Read the three ratios.  The "
      + "C1 chain alone is about a factor of ten too fast at every point.  With the ethane route "
      + "the set follows the whole appendix at every point, to within a few tens of percent, "
      + "and it departs from the measurement where the appendix departs: at the lowest "
      + "temperatures and the highest pressures, where it is too slow.  The large modern "
      + "mechanism follows the measurement at every point.  The assembled set is as good as the "
      + "mechanism it was taken from, and no better.",
    formula: String.raw`\bar{\rho} = \exp\Big(\frac{1}{N}\sum_{i=1}^{N}\ln\frac{\tau_{\mathrm{model},i}}{\tau_{\mathrm{ref},i}}\Big)`,
    where: [
      { sym: "\\bar{\\rho}", means: "the geometric mean of the ratio of the model's delay to the reference delay over the points" },
      { sym: "N", means: "the number of shock-tube points compared" },
      { sym: "\\tau_{\\mathrm{model},i}", means: "the ignition delay the model gives at point i", unit: "s" },
      { sym: "\\tau_{\\mathrm{ref},i}", means: "the reference delay at point i: the measured one, or the whole appendix's", unit: "s" },
    ],
    note: "The points, and how each column was made, are in docs/reviews/2026-11-22-methane-lesson/ "
      + "(points.tsv and its scripts).  The measured delays are Table 2 of the paper.",
  },
];

export const METHANE_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-mechanism",
    title: "These are one mechanism's values, not evaluated constants",
    body: "Every carbon record on this page is a row of one published mechanism, Appendix A of "
      + "Miller and Bowman, read from the page images.  Evaluated data (Baulch and co-workers, "
      + "Tsang and Hampson) would be the better source of each constant, and is the next step: "
      + "it is not transcribed in this tree yet.  The assembled set is therefore only as good as "
      + "that mechanism, which was made for nitrogen oxides in flames at about one atmosphere.",
  },
  {
    id: "no-peroxy",
    title: "No peroxide chemistry",
    body: "At low temperature and high pressure the real chemistry of methane goes through "
      + "CH3O2 and hydrogen peroxide, and the assembled set has neither.  Where the points "
      + "lie there, the set and the whole appendix are both too slow.  The page does not "
      + "say that is the reason: it is the usual one and it was not tested here.",
  },
  {
    id: "two-nitrogen-mixtures",
    title: "Only the nitrogen mixtures are compared",
    body: "The paper also measured mixtures diluted in argon and in helium.  The vessel of these "
      + "cases carries neither, so those points are not run.  The delay compared is the engine's "
      + "time of the steepest temperature rise, not the experimenters' extrapolated pressure rise, "
      + "so a few percent of the difference is the definition, not the chemistry.",
  },
  {
    id: "no-pressure-wave",
    title: "A vessel is not a shock tube",
    body: "The vessel is closed, adiabatic and at constant volume from the first instant.  A real "
      + "shock tube has a finite test time, a pressure rise before ignition and boundary layers.  "
      + "The model's start is the experiment's reported temperature and pressure and nothing more.",
  },
];

// ---- the quiz ---------------------------------------------------------------

/** Seven questions, each answerable from the page.  The page's run numbers
 *  appear only after the buttons are pressed, so a question quotes none of
 *  them; the one size it states ("about an order of magnitude") is the
 *  page's own step 6 and is marked "engine".  C158. */
export const METHANE_QUIZ: readonly QuizQuestion[] = [
  {
    id: "delay-definition", steps: [1],
    q: "What does the page call the ignition delay, and how does it differ from the shock-tube experimenters' reading?",
    options: [
      "The time of the largest temperature rise per unit time on the write grid; the experimenters extrapolate the steepest pressure rise, so the two are close but not the same",
      "The time at which the last reactant is consumed; the experimenters use the same definition",
      "The time the shock takes to cross the tube",
      "The time at which the temperature first exceeds 1000 K",
    ],
    correct: 0,
    feedback: "The engine prints the time at which dT/dt is largest.  Petersen, Davidson and Hanson read an extrapolated pressure rise, so a few percent of any difference is the definition, not the chemistry (step 1 and the limits at the end of the page).",
  },
  {
    id: "core-spectator", steps: [2],
    q: "Rung 1 runs the hydrogen and oxygen core on a methane and oxygen mixture and the engine prints no ignition delay.  Why?",
    options: [
      "The core is too slow to matter at this temperature",
      "The solver fails on the first step",
      "The core holds no reaction of a carbon species, so methane is a spectator and the temperature never rises enough to call an ignition",
      "Methane is not flammable in nitrogen",
    ],
    correct: 2,
    feedback: "A mechanism is not a mixture: the species a case holds do nothing until a reaction names them.  The mixture contains neither hydrogen nor radicals, so the core has nothing to work on (step 2).",
  },
  {
    id: "open-chain", steps: [3],
    q: "Rung 2 adds the attacks on methane, and a trace of CH3 appears but the temperature barely moves.  What does the chain still need?",
    options: [
      "A faster rate constant for the first attack",
      "A reaction that consumes CH3: the chain is open at the other end, so nothing is made from it and the heat release is negligible",
      "More nitrogen to carry the heat",
      "A higher starting pressure",
    ],
    correct: 1,
    feedback: "Each attack removes one hydrogen and leaves a methyl radical, but with nothing to consume CH3 the products never form.  A mechanism that ends in a species nobody consumes predicts that nothing happens (step 3).",
  },
  {
    id: "wrong-reasons", steps: [4],
    q: "Rung 3 adds the methyl step and the mixture ignites, far earlier than the shock tube measured.  What does the page conclude?",
    options: [
      "The model is now validated, because it ignites",
      "The measurement must be wrong",
      "A mechanism can ignite for the wrong reasons: the branching CH3 + O2 gives one radical in and two out, which drives the temperature up although the carbon stops at formaldehyde",
      "Rung 3 should be removed from the set",
    ],
    correct: 2,
    feedback: "Igniting is not agreeing.  The branching reaction alone is enough to start the thermal runaway, and the delay it gives is a small fraction of the measured one.  Step 7 then shows by the sensitivity which reaction is responsible (step 4).",
  },
  {
    id: "start-and-end", steps: [5],
    q: "Rungs 4 and 5 oxidise the carbon on to CO and CO2.  What do they change in the table of the rungs, and what do they leave nearly alone?",
    options: [
      "They raise the final temperature (the heat comes from the end of the chain) and hardly move the delay (set by the beginning of the chain)",
      "They shorten the delay and leave the final temperature alone",
      "They change both by the same factor",
      "They change neither, because CO2 is inert",
    ],
    correct: 0,
    feedback: "The delay was decided earlier, by the branching; the later links decide how much heat the vessel finally holds, and the step from CO to CO2 releases the largest part of it (step 5).",
  },
  {
    id: "ethane-route", steps: [6, 7],
    q: "Rung 6 adds the recombination of two CH3 into ethane, and the delay grows by about an order of magnitude.  In the sensitivity, what sign does that reaction's coefficient have, and why?",
    options: [
      "Negative: a faster recombination brings the ignition forward",
      "Zero: it is not in the C1 chain",
      "Positive: a faster recombination removes methyl radicals from the branching and delays the ignition, opposing the branching CH3 + O2, which is negative",
      "Positive, because ethane is a better fuel than methane",
    ],
    correct: 2,
    feedback: "The coefficient is d ln τ / d ln k, so a positive one means that a faster reaction delays the ignition.  The two reactions of the methyl radical head the list and pull in opposite directions; the delay is, to a first approximation, the outcome of that competition (steps 6 and 7).",
    origins: ["engine"],
  },
  {
    id: "as-good-as", steps: [8],
    q: "The assembled set follows the whole Appendix A mechanism at every point and departs from the measurement where the appendix does.  What does the page conclude?",
    options: [
      "The assembled set is better than the appendix",
      "The assembled set is as good as the mechanism it was taken from, and no better",
      "Both sets are wrong everywhere",
      "The measurement should be repeated",
    ],
    correct: 1,
    feedback: "A hand-assembled set can stand in for a large mechanism for the delay because a few reactions carry most of it, but it inherits the mechanism's errors: both are too slow at the lowest temperatures and the highest pressures.  The page names peroxide chemistry, which the set leaves out, as the usual reason but says it was not tested here (step 8 and the limits).",
  },
];
