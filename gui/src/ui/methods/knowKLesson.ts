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
  knowKLesson -- the lesson text of the `how-do-we-know-k` EduTool, "How do
  we know k?".

  THE QUESTION (Vitor, 2026-11-21): how did chemical engineers isolate each
  individual reaction and calibrate its rate constant?  The page answers it
  by DOING the measurement, inside the engine: a flash makes a trace of a
  radical, the radical is followed in time, a large excess of its partner
  turns the decay into a straight line on a log plot, the slope against the
  excess is k, the slopes at several temperatures are an Arrhenius plot, and
  a unimolecular reaction in a bath of growing pressure shows the fall-off.
  Then it shows where the method breaks.

  Every `file:line` below is held to its text by gui/tests/knowK.test.ts.
  No number is typed here: each number on the page is an engine run, or the
  record's own law evaluated, and the gate check_lesson_typed_numbers holds
  that line.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

/** The task sentence, the page's first answer. */
export const KNOW_K_TASK = "A rate constant in a mechanism is a number somebody measured.  "
  + "How do you isolate ONE reaction among the dozens that happen in a flame, and read "
  + "its k, its activation energy and its pressure dependence from a signal on an "
  + "oscilloscope?";

export const KNOW_K_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The experiment: make the radical at t = 0, then watch it go",
    body: "An experimenter cannot study a radical that has to be fed: it reacts too fast "
      + "to be stored.  So it is made inside the cell in an instant, and followed while it "
      + "disappears.  In flash photolysis a pulse of light splits a precursor molecule and "
      + "leaves a trace of the radical in the gas; in a shock tube a shock wave heats the "
      + "gas almost at once and the radical forms from a precursor behind it.  A "
      + "second beam, tuned to an absorption or a fluorescence of the radical, reports "
      + "how much of it is left: the signal is proportional to its concentration.  This "
      + "page needs no instrument model.  The engine's batch reactor is the cell: a closed "
      + "vessel held at a chosen temperature and pressure, holding a bath of H2 in N2 and, "
      + "at t = 0, a trace of OH.  The engine integrates ALL the reactions of the "
      + "mechanism at once, not only the one under study, and writes the amount of every "
      + "species against time.  The amount of OH is the signal.  Nothing in it is a "
      + "measurement of a real gas: it is the engine's own answer to a measurement, and "
      + "the point of the page is to check whether the method recovers the k the engine "
      + "was given.",
    note: "The mechanism is the one of the shipped ignition tutorials (O Conaire et al. "
      + "2004, Table I), loaded from the case's own constant/reactions.  The cell is "
      + "tutorials/batch/combustion/kinetics01_oh_decay.",
  },
  {
    n: 2,
    title: "Pseudo-first order: a large excess makes the decay a straight line",
    body: "The reaction under study is OH + H2 = H2O + H, and its forward rate is "
      + "\\(k\\,c_\\mathrm{OH}\\,c_{\\mathrm{H}_2}\\).  That rate depends on two concentrations that both "
      + "change, which makes the curve hard to read.  The experimenter makes it simple by "
      + "putting H2 in a large excess: the OH made is a trace, so the H2 it uses up is a "
      + "negligible fraction of the H2 there is, and \\(c_{\\mathrm{H}_2}\\) stays at its starting value.  Then "
      + "the rate law has ONE changing concentration, the decay is exponential, and the "
      + "logarithm of the signal is a straight line in time whose slope is minus "
      + "\\(k'\\), the pseudo-first-order constant.  The page fits that line over the first "
      + "three lifetimes of the decay, with a least-squares fit of the engine's "
      + "numbers.  How good the straight line is, is how good the excess is.",
    derivation: [
      { step: "The rate law of the reaction, with H2 and OH the only reactants:",
        eq: String.raw`-\frac{\mathrm{d}c_\mathrm{OH}}{\mathrm{d}t} = k\,c_\mathrm{OH}\,c_{\mathrm{H}_2}` },
      { step: "The OH made is a trace, so the H2 used up is at most the OH made, which is small against the H2 in the cell; "
          + "the H2 concentration is its starting value, a constant:",
        eq: String.raw`c_{\mathrm{H}_2} = c_{\mathrm{H}_2,0} - \left(c_{\mathrm{OH},0} - c_\mathrm{OH}\right) \approx c_{\mathrm{H}_2,0} \quad (c_{\mathrm{OH},0} \ll c_{\mathrm{H}_2,0})` },
      { step: "With the excess held constant the rate law is first order in OH; integrate it:",
        eq: String.raw`\ln c_\mathrm{OH} = \ln c_{\mathrm{OH},0} - k'\,t \qquad k' = k\,c_{\mathrm{H}_2,0}` },
    ],
    formula: String.raw`\ln c_\mathrm{OH} = \ln c_{\mathrm{OH},0} - k'\,t, \qquad k' = k\,c_{\mathrm{H}_2,0}`,
    where: [
      { sym: "c_\\mathrm{OH}", means: "concentration of the radical, the quantity the signal is proportional to", unit: "mol/cm3" },
      { sym: "c_{\\mathrm{OH},0}", means: "its concentration at t = 0, made by the flash", unit: "mol/cm3" },
      { sym: "c_{\\mathrm{H}_2}", means: "concentration of the partner, in excess", unit: "mol/cm3" },
      { sym: "c_{\\mathrm{H}_2,0}", means: "its concentration at t = 0", unit: "mol/cm3" },
      { sym: "k", means: "the rate constant of OH + H2 = H2O + H, the number the experiment is after", unit: "cm3/(mol s)" },
      { sym: "k'", means: "the pseudo-first-order constant, minus the slope of ln c_OH against time", unit: "1/s" },
      { sym: "t", means: "time after the flash", unit: "s" },
      { sym: "\\mathrm{d}c_\\mathrm{OH}", means: "a small change of the OH concentration", unit: "mol/cm3" },
      { sym: "\\mathrm{d}t", means: "a small interval of time", unit: "s" },
      { sym: "\\ln", means: "the natural logarithm" },
    ],
    note: "A concentration is c = x P / (R T) for a mole fraction x at pressure P and "
      + "temperature T (ideal gas); the page converts the mole fractions it writes into "
      + "the case to concentrations with it, in mol/cm3, the unit the literature quotes "
      + "k with.",
  },
  {
    n: 3,
    title: "k from the slope of k' against the excess",
    body: "One decay gives one k'.  To get k, repeat the experiment at several "
      + "concentrations of H2 and plot k' against \\(c_{\\mathrm{H}_2,0}\\): the points fall on a line "
      + "whose SLOPE is k.  The slope, not a single ratio, because the intercept is the "
      + "loss of the radical that has nothing to do with H2: in a laboratory it is "
      + "diffusion out of the observed volume and reaction with the precursor; here it is whatever "
      + "else in the mechanism takes OH away.  A line through the points with a free "
      + "intercept reads k and shows the contamination in the same plot.  The page "
      + "compares the slope with the k the engine used, which it computes from the law "
      + "the engine announced when it loaded the reaction (step 4 names the lines).",
    formula: String.raw`k' = k\,c_{\mathrm{H}_2,0} + k'_0`,
    where: [
      { sym: "k'", means: "the pseudo-first-order constant of one decay", unit: "1/s" },
      { sym: "k", means: "the slope of the line: the rate constant", unit: "cm3/(mol s)" },
      { sym: "c_{\\mathrm{H}_2,0}", means: "the starting concentration of the partner, the thing varied", unit: "mol/cm3" },
      { sym: "k'_0", means: "the intercept: the first-order loss of OH that does not depend on H2", unit: "1/s" },
    ],
  },
  {
    n: 4,
    title: "Arrhenius: the same experiment at several temperatures",
    body: "The engine's law for the rate constant is the modified Arrhenius form, "
      + "evaluated at "
      + "Reaction.cpp:55.  The record gives A, b and the activation energy, and the engine "
      + "announces how it converts them: A from cm3/(mol s) to its own kmol-m3-s unit "
      + "(BatchReactor.cpp:1264, a factor of 1e-3 to the power molecularity minus one) and "
      + "the energy from kcal/mol to J/mol (BatchReactor.cpp:1279, a factor 4184); the rate "
      + "of each reaction uses the converted law (BatchReactor.cpp:1476).  The experiment "
      + "repeated at several temperatures gives k at each, and ln k against 1/T is the "
      + "Arrhenius plot.  For b = 0 it is a straight line of slope minus Ea over R.  For "
      + "b not zero it is a curve, because the temperature enters twice, and the slope of "
      + "a straight line through it is the LOCAL activation energy, Ea plus bRT, at the "
      + "temperatures measured.  So an experimenter who fits a line reads an apparent "
      + "activation energy, and the page compares it with the one the record implies at "
      + "the middle of the range.",
    derivation: [
      { step: "The law the engine evaluates, written as a logarithm:",
        eq: String.raw`\ln k = \ln A + b \ln T - \frac{E_a}{R\,T}` },
      { step: "The slope of ln k against 1/T is what a straight line through the Arrhenius plot reads; differentiate:",
        eq: String.raw`-R\,\frac{\mathrm{d}\ln k}{\mathrm{d}(1/T)} = E_a + b\,R\,T` },
    ],
    formula: String.raw`k = A\,T^{b}\,\exp\!\left(-\frac{E_a}{R\,T}\right), \qquad E_\mathrm{app} = E_a + b\,R\,T`,
    where: [
      { sym: "k", means: "the rate constant at T", unit: "cm3/(mol s)" },
      { sym: "A", means: "the pre-exponential factor of the record", unit: "cm3/(mol s K^b)" },
      { sym: "T", means: "temperature of the cell", unit: "K" },
      { sym: "b", means: "the temperature exponent of the record (dimensionless)" },
      { sym: "E_a", means: "the activation energy of the record", unit: "J/mol" },
      { sym: "R", means: "the universal gas constant", unit: "J/(mol K)" },
      { sym: "E_\\mathrm{app}", means: "the apparent activation energy a straight-line Arrhenius plot reads at T", unit: "J/mol" },
      { sym: "\\exp", means: "the exponential function" },
      { sym: "\\ln", means: "the natural logarithm" },
      { sym: "\\mathrm{d}\\ln k", means: "a small change of ln k" },
      { sym: "\\mathrm{d}(1/T)", means: "a small change of the reciprocal temperature", unit: "1/K" },
    ],
  },
  {
    n: 5,
    title: "Fall-off: a unimolecular reaction between two limits",
    body: "H2O2 + M = 2 OH + M needs a third body M to energise the molecule, so its first-order "
      + "constant depends on the pressure.  Lindemann's picture: the molecule is energised "
      + "by a collision at a rate proportional to the concentration of M, and is then either "
      + "de-energised by another collision or reacts.  At low pressure every energised "
      + "molecule reacts and k grows in proportion to [M], \\(k_0[\\mathrm{M}]\\); at high pressure the "
      + "energising collisions are fast and the reaction of the energised molecule limits, "
      + "k is the constant \\(k_\\infty\\); between them k bends from one to the other, and the "
      + "engine writes the blend (Reaction.cpp:127) with the reduced pressure "
      + "(Reaction.cpp:126).  Lindemann's blend is too sharp for real data, so the engine "
      + "multiplies it by the broadening factor F of Troe, built from Fcent and the reduced "
      + "pressure (Reaction.cpp:140 and Reaction.cpp:154), as Gilbert, Luther and Troe 1983 "
      + "write in their Eqs. (6.3) to (6.7).  The experiment is the first-order decay of "
      + "H2O2 in a bath of N2 at several pressures: no excess is needed, the decay of the "
      + "parent is the signal, and k is read at each pressure.  The parent is seeded as a "
      + "trace on purpose: the OH it makes attacks H2O2 (OH + H2O2 = H2O + HO2), which "
      + "adds a chain loss to the decay and makes k read too fast, and the engine shows "
      + "it if the seed of the case is raised.",
    derivation: [
      { step: "The reduced pressure compares the low-pressure rate with the high-pressure limit; the Lindemann blend is its hyperbola:",
        eq: String.raw`P_r = \frac{k_0\,[\mathrm{M}]}{k_\infty}, \qquad k_\mathrm{L} = k_\infty\,\frac{P_r}{1 + P_r}` },
      { step: "Troe's broadening multiplies the blend, with the centre of the fall-off curve set by Fcent:",
        eq: String.raw`k = k_\mathrm{L}\,F, \qquad \log F = \frac{\log F_\mathrm{cent}}{1 + \left[\dfrac{\log P_r + c}{n - d\,(\log P_r + c)}\right]^2}` },
      { step: "with c, n and d fixed by Fcent as the engine codes them:",
        eq: String.raw`c = -0.4 - 0.67\,\log F_\mathrm{cent}, \quad n = 0.75 - 1.27\,\log F_\mathrm{cent}, \quad d = 0.14` },
    ],
    formula: String.raw`k = k_\infty\,\frac{P_r}{1 + P_r}\,F, \qquad P_r = \frac{k_0\,[\mathrm{M}]}{k_\infty}`,
    where: [
      { sym: "k", means: "the first-order rate constant of the decomposition at the pressure of the cell", unit: "1/s" },
      { sym: "k_\\infty", means: "the high-pressure limit of k, the rate constant of the energised molecule's reaction", unit: "1/s" },
      { sym: "k_0", means: "the low-pressure limit of k per unit of M", unit: "cm3/(mol s)" },
      { sym: "[\\mathrm{M}]", means: "concentration of the third body, the sum of every species weighted by its efficiency", unit: "mol/cm3" },
      { sym: "P_r", means: "the reduced pressure: the low-pressure rate over the high-pressure limit" },
      { sym: "k_\\mathrm{L}", means: "the Lindemann blend, the answer with no broadening" },
      { sym: "F", means: "Troe's broadening factor, below 1, the largest correction at P_r near 1" },
      { sym: "F_\\mathrm{cent}", means: "the value of F at the centre of the fall-off, set by the record's four Troe numbers and T" },
      { sym: "c", means: "the shift of the curve's centre along log P_r (dimensionless)" },
      { sym: "n", means: "the width of the curve (dimensionless)" },
      { sym: "d", means: "a constant, 0.14, that asymmetrises the curve (dimensionless)" },
      { sym: "\\log", means: "the base-10 logarithm" },
    ],
    note: "Eq. numbers are those of Gilbert, Luther and Troe, Ber. Bunsenges. Phys. Chem. "
      + "87 (1983) 169, read in the project's literature folder.  Fcent is their Eq. (6.7); "
      + "for the record's three-number form the last term is absent.  The page draws the "
      + "record's own law as a CHECK beside the measured points: the measurement is the "
      + "engine's run.",
  },
  {
    n: 6,
    title: "Where the method breaks",
    body: "Two things make the straight line stop being straight, and the page shows both "
      + "with the same engine.  First, a SMALL excess: the H2 the OH uses up is no longer "
      + "negligible, \\(c_{\\mathrm{H}_2}\\) falls during the decay, and the log plot bends; fitting a line to "
      + "it still gives a number, and the number is wrong by the amount the excess changes.  "
      + "The error of the first-order assumption is set by the ratio of the OH to the H2 "
      + "at t = 0, \\(\\delta\\).  Second, SECONDARY REACTIONS: the radical is not only removed "
      + "by the reaction under study.  The products of OH + H2 are an H atom and water; "
      + "and OH + OH makes an O atom, which turns an H2 into an OH and an H, so OH is also "
      + "MADE while it is being measured.  The engine prints this for every species at "
      + "chosen instants as the rates of production (the rateOfProduction block of the "
      + "case); the table on the page is that print, read from the run.  An experimenter "
      + "cannot print it: she lowers the radical concentration until the second-order "
      + "channels vanish, raises the excess, and checks that k' is proportional to the "
      + "partner's concentration.  The same checks are the page's last panel.",
    formula: String.raw`\delta = \frac{c_{\mathrm{OH},0}}{c_{\mathrm{H}_2,0}}`,
    where: [
      { sym: "\\delta", means: "how large the radical is against the partner at t = 0: the fraction of the H2 the whole OH could use up" },
      { sym: "c_{\\mathrm{OH},0}", means: "the OH concentration made by the flash", unit: "mol/cm3" },
      { sym: "c_{\\mathrm{H}_2,0}", means: "the starting H2 concentration", unit: "mol/cm3" },
    ],
  },
];

export const KNOW_K_LIMITS: readonly LessonLimit[] = [
  {
    id: "engine-not-laboratory",
    title: "The engine answers its own question.",
    body: "The 'measurement' is an integration of the mechanism, so agreement with the "
      + "record shows that the METHOD recovers a rate constant from a decay, not that the "
      + "record's number is right about a real gas.  A real constant is checked the other "
      + "way: a laboratory measurement is compared with a record, and a disagreement "
      + "is what a mechanism's evaluators work on.  No such comparison enters this page.",
  },
  {
    id: "no-instrument",
    title: "No instrument, no transport, no walls.",
    body: "The signal is the amount of the species in an ideal-gas, perfectly mixed vessel "
      + "held at one temperature.  No detector, no diffusion out of the beam, no wall "
      + "reaction, no heating by the flash and no photolysis chemistry is modelled.  The "
      + "noise, when you switch it on, is multiplicative and seeded: synthetic, labelled "
      + "so, and it is the page's, not the engine's.",
  },
  {
    id: "one-excess-per-temperature",
    title: "k at a temperature comes from one excess in the Arrhenius panel.",
    body: "To keep the number of runs small, each temperature of the Arrhenius panel is one "
      + "decay at one excess, and k is k' over the H2 concentration.  Panel two shows that "
      + "this is the slope of step 3 when the intercept is negligible.  A laboratory repeats "
      + "the whole concentration series at each temperature.",
  },
  {
    id: "single-reaction",
    title: "One bimolecular reaction and one fall-off.",
    body: "OH + H2 and the decomposition of H2O2 are shown; the others of the mechanism "
      + "are in the engine's run but not measured here.  Isolating a reaction whose "
      + "partner is another radical (H + O2, which branches) needs the conditions chosen "
      + "so that one reaction governs the observable, which is what a sensitivity "
      + "analysis is for and is not on this page.",
  },
  {
    id: "browser",
    title: "Runs in your browser.",
    body: "Every curve is the engine compiled to run in the browser, on one tutorial case "
      + "with declared numbers changed.  Nothing runs until you press a button.",
  },
];

/** The questions at the foot of the page (DEV.md 4c C158): drafts for
 *  Vitor's review, each testing a step and naming it. */
export const KNOW_K_QUIZ: readonly QuizQuestion[] = [
  {
    id: "make-in-cell", steps: [1],
    q: "Why is a radical made inside the cell at t = 0 and followed while it disappears?",
    options: [
      "A radical reacts too fast to be stored, so it cannot be fed",
      "Radicals are cheap",
      "The detector needs a rising signal",
      "It is easier to heat the cell",
    ],
    correct: 0,
    feedback: "A pulse of light, or a shock wave, creates the radical in an "
      + "instant and a second beam reports how much is left (step 1).",
  },
  {
    id: "pseudo-first", steps: [2],
    q: "Why is H2 put in large excess over the OH?",
    options: [
      "So that c(H2) stays at its starting value and the decay is exponential, with one changing concentration",
      "To make the reaction faster than the detector",
      "To dilute the radical",
      "To raise the temperature",
    ],
    correct: 0,
    feedback: "The OH made is a trace, so the H2 it consumes is negligible; "
      + "the rate law has one changing concentration and the logarithm of "
      + "the signal is a straight line (step 2).",
  },
  {
    id: "slope", steps: [3],
    q: "Why is k read from the slope of k' against the H2 concentration and not from one ratio?",
    options: [
      "The intercept is the loss of the radical that has nothing to do with H2, and the slope excludes it",
      "A single ratio is too accurate",
      "The slope is always zero",
      "k' does not depend on H2",
    ],
    correct: 0,
    feedback: "A line with a free intercept reads k and shows the "
      + "contamination: diffusion and other removal of OH that the slope "
      + "leaves out (step 3).",
  },
  {
    id: "arrhenius", steps: [4],
    q: "What does repeating the experiment at several temperatures give?",
    options: [
      "The temperature dependence of k, so the parameters of the modified Arrhenius law can be read back",
      "The pressure of the cell",
      "The mass of the radical",
      "Nothing new",
    ],
    correct: 0,
    feedback: "The engine's law is the modified Arrhenius form; the "
      + "experiment recovers it from the measured k(T) (step 4).",
  },
  {
    id: "where-breaks", steps: [6],
    q: "What makes the straight line of the pseudo-first-order decay bend?",
    options: [
      "A small excess, so that H2 is no longer constant, and secondary reactions that also remove the radical",
      "A larger pressure only",
      "A lower detector gain",
      "A longer cell",
    ],
    correct: 0,
    feedback: "With a small excess the fit still returns a number, but it is "
      + "wrong by the amount the excess changes; the error is set by the "
      + "OH to H2 ratio at t = 0 (step 6).",
  },
];
