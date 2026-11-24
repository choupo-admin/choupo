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
  transferUnitLesson -- the lesson of the `transfer-unit` EduTool (DEV.md 4c
  C222), "Why the transfer unit was invented", as DATA so that
  tests/transferUnit.test.ts can recompute every number it quotes.

  THE SPINE.  A packed height is the product of two numbers that answer two
  different questions.  N_OG, the number of transfer units, says how hard the
  SEPARATION is and is fixed by the two lines on the equilibrium diagram
  alone.  H_OG, the height of a transfer unit, says how good the EQUIPMENT is
  and is fixed by the packing and the flows.  Chilton and Colburn (1935)
  split the height that way so that the second number could be carried from
  one design to another.

  SOURCES, each read in the filed text before it was written here:
    * Chilton, T. H. and Colburn, A. P. (1935), Ind. Eng. Chem. 27(3),
      255-260, doi 10.1021/ie50303a004 (record read on Crossref; the paper
      itself is not in the literature folder, so no equation of it is quoted).
    * Treybal, Mass-Transfer Operations, 3rd ed. (1980), read in
      ~/Choupo-Literature/Books/treybal-mass-transfer-operations-3ed.pdf:
      Eq. (8.24) the height of a gas transfer unit and the sentence after
      Eq. (8.25) ("the ratio G/F_G a = H_tG is very much more constant than
      either G or F_G a"), Eq. (8.37) H_tOG = G/(F_OG a), Eq. (8.50)
      the number of transfer units for a dilute absorber with Henry's law.
  The HETP relation is DERIVED on the page from Eq. (8.50) and the Kremser
  stage count, not quoted from a book.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const TRANSFER_UNIT_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The height is a difficulty times a quality",
    body: "Write the tower's rate balance on a slice of packing and "
      + "integrate it from top to bottom.  Everything that depends on the "
      + "separation lands in one integral, and everything that depends on "
      + "the packing and the flows lands in one length.  The integral is "
      + "the number of transfer units, N_OG: how many times the average "
      + "driving force fits into the change in gas composition.  It needs "
      + "only the equilibrium line and the operating line.  The length is "
      + "the height of a transfer unit, H_OG = G/(K_y a): the packed height "
      + "that does one unit of the work.  The tower's height is their "
      + "product.  A hard separation (a high recovery, a lean liquid) means "
      + "a big N_OG whatever you pack the tower with; a poor packing means "
      + "a big H_OG whatever you separate.",
    derivation: [
      { step: "A slice dz of packing moves solute from the gas to the "
          + "liquid at the overall rate K_y a (y - y*) per unit volume.  "
          + "The gas loses solute at the rate it carries it.",
        eq: String.raw`-G\,\mathrm{d}y = K_y a\,(y - y^*)\,\mathrm{d}z` },
      { step: "Define the height of an overall transfer unit by the "
          + "group that multiplies the driving force (Treybal Eq. 8.37).",
        eq: String.raw`H_{OG} = \frac{G}{K_y a}` },
      { step: "Separate the variables and integrate over the tower.  The "
          + "left integral contains only the two lines; call it N_OG.",
        eq: String.raw`Z = H_{OG}\int_{y_\mathrm{out}}^{y_\mathrm{in}} \frac{\mathrm{d}y}{y - y^*} = H_{OG}\,N_{OG}` },
    ],
    formula: String.raw`Z = H_{OG}\, N_{OG},\qquad
H_{OG} = \frac{G}{K_y a},\qquad
N_{OG} = \int_{y_\mathrm{out}}^{y_\mathrm{in}} \frac{\mathrm{d}y}{y - y^*}`,
    where: [
      { sym: "Z", means: "packed height of the tower", unit: "m" },
      { sym: "H_{OG}", means: "height of an overall gas-phase transfer unit: "
        + "the quality of the equipment (packing, flows, fluids)", unit: "m" },
      { sym: "N_{OG}", means: "number of overall gas-phase transfer units: "
        + "the difficulty of the separation (the two lines only)",
        unit: "dimensionless" },
      { sym: "z", means: "height measured up the packing", unit: "m" },
      { sym: "G", means: "molar flux of the gas, per tower cross-section",
        unit: "kmol/(m^2 s)" },
      { sym: "K_y a", means: "overall gas-phase mass-transfer coefficient "
        + "times the interfacial area per tower volume",
        unit: "kmol/(m^3 s)" },
      { sym: "y, y^*", means: "solute mole fraction in the gas, and in the "
        + "gas that would be in equilibrium with the liquid at the same "
        + "height", unit: "mol/mol" },
    ],
    note: "Treybal Eq. (8.37) defines H_tOG; the integral form of N_tOG is "
      + "the one his Eq. (8.36) writes in mole ratios.",
  },
  {
    n: 2,
    title: "Colburn's equation: N_OG from the absorption factor alone",
    body: "For a dilute absorber with a straight equilibrium line y* = mx "
      + "and solute-free liquid coming in, the integral has a closed "
      + "form.  Move the sliders on the page: N_OG depends on the recovery "
      + "and on the absorption factor A = L/(mG), and on nothing else.  "
      + "Two things stand out.  First, A = 1 is not special for the "
      + "answer: there N_OG = R/(1 - R), which is already 99 at 99 % "
      + "recovery.  Second, the number does not blow up at A = 1 but at "
      + "A = R: the liquid rate at which the leaving liquid would be in "
      + "equilibrium with the entering gas.  Below it no height does the "
      + "job.  Between R and 1 every extra bit of recovery is bought with "
      + "a lot of packing.",
    formula: String.raw`N_{OG} = \frac{\ln\!\left[\left(1-\tfrac{1}{A}\right)\dfrac{y_\mathrm{in}}{y_\mathrm{out}} + \tfrac{1}{A}\right]}{1-\tfrac{1}{A}},\qquad
A = \frac{L}{mG},\qquad R = 1 - \frac{y_\mathrm{out}}{y_\mathrm{in}}`,
    where: [
      { sym: "N_{OG}", means: "number of overall gas-phase transfer units",
        unit: "dimensionless" },
      { sym: "A", means: "absorption factor, the slope of the operating "
        + "line over the slope of the equilibrium line", unit: "dimensionless" },
      { sym: "L", means: "molar flux of the liquid", unit: "kmol/(m^2 s)" },
      { sym: "m", means: "slope of the equilibrium line, y^* = m x",
        unit: "dimensionless" },
      { sym: "G", means: "molar flux of the gas", unit: "kmol/(m^2 s)" },
      { sym: "y_\\mathrm{in}, y_\\mathrm{out}", means: "solute mole fraction "
        + "in the gas entering and leaving", unit: "mol/mol" },
      { sym: "R", means: "fraction of the entering solute that is absorbed",
        unit: "dimensionless" },
    ],
    note: "Treybal Eq. (8.50), written for x_2 = 0.  At A = 1 the limit is "
      + "N_OG = y_in/y_out - 1.  The page checks the closed form against a "
      + "numerical integral of dy/(y - y*).",
  },
  {
    n: 3,
    title: "Why the transfer unit was invented",
    body: "Chilton and Colburn (1935) wanted a packed-tower design that "
      + "could be carried from one test to the next.  A coefficient such "
      + "as K_y a changes with the gas rate because the area and the film "
      + "coefficients both do.  The height H_OG = G/(K_y a) does not "
      + "change nearly as much, because G sits in the numerator and in "
      + "the group that K_y a grows with.  Treybal says it in one line "
      + "after his Eq. (8.25): the ratio G/(F_G a) is 'very much more "
      + "constant than either G or F_G a', and in many cases may be taken "
      + "constant within the accuracy of the data.  That is the point of "
      + "the split: measure H_OG once on a packing and a system, then "
      + "design the next tower by working out N_OG from the two lines, "
      + "which costs nothing.  The page does not draw a H_OG against flow "
      + "curve, because no engine case sweeps the flow of one packing; "
      + "what it shows is the half of the split that is exact.",
    note: "Chilton, T. H. and Colburn, A. P. (1935), Ind. Eng. Chem. 27, "
      + "255-260.  The paper is cited here as its record reads on Crossref; "
      + "the statement about constancy is Treybal's, after his Eq. (8.25).",
  },
  {
    n: 4,
    title: "The stage you can count from it: HETP",
    body: "An older way to size a packed tower asks how tall a piece of "
      + "packing is equivalent to one ideal stage, the HETP.  The two "
      + "heights are the same tower height divided by two different "
      + "counts, so they are tied together by the ratio of the counts, "
      + "and for two straight lines that ratio is exact.  With lambda = "
      + "mG/L (the inverse of A) the HETP is H_OG times a number that "
      + "depends on lambda alone.  When lambda = 1 the two heights are "
      + "equal; for lambda above 1 (a steep equilibrium line) the HETP is "
      + "smaller than H_OG, for lambda below 1 it is larger.  The packed-column model of Choupo writes "
      + "exactly this relation.",
    derivation: [
      { step: "Kremser's stage count for the same two straight lines "
          + "carries the same logarithm as N_OG, divided by ln A instead "
          + "of 1 - 1/A.",
        eq: String.raw`N_t = \frac{\ln[\,\cdot\,]}{\ln A},\qquad N_{OG} = \frac{\ln[\,\cdot\,]}{1-1/A}` },
      { step: "Divide: the ratio of the two counts depends on A only.",
        eq: String.raw`\frac{N_{OG}}{N_t} = \frac{\ln A}{1-1/A}` },
      { step: "The same height Z is N_OG H_OG and N_t HETP.  With "
          + "lambda = 1/A:",
        eq: String.raw`\mathrm{HETP} = \frac{Z}{N_t} = H_{OG}\,\frac{\ln A}{1-1/A} = H_{OG}\,\frac{\ln\lambda}{\lambda-1}` },
    ],
    formula: String.raw`\mathrm{HETP} = H_{OG}\,\frac{\ln\lambda}{\lambda-1},\qquad \lambda = \frac{mG}{L} = \frac{1}{A}`,
    where: [
      { sym: "\\mathrm{HETP}", means: "height of packing equivalent to one "
        + "ideal stage", unit: "m" },
      { sym: "H_{OG}", means: "height of an overall gas-phase transfer unit",
        unit: "m" },
      { sym: "N_{t}", means: "number of equilibrium stages for the same "
        + "duty and the same two straight lines (Kremser)",
        unit: "dimensionless" },
      { sym: "\\lambda", means: "stripping factor m G / L: the slope of the "
        + "equilibrium line over that of the operating line",
        unit: "dimensionless" },
    ],
    note: "The engine prints this relation in the packing models "
      + "(PackingRBF.cpp:138-139, PackingDelft.cpp:131-132) and the Theory "
      + "Guide writes it as Eq. (packed-bed).",
  },
  {
    n: 5,
    title: "Where Choupo computes them",
    body: "Choupo's rate-based packed bed integrates dy/dz = (y* - y)/H_OG "
      + "up a bed in segments, and each segment takes its own H_OG from the "
      + "packing correlation (the film coefficients, the effective area, "
      + "and lambda = m V/L at that height).  The run publishes, per "
      + "segment, H_OG, the slope m and the flows V and L.  The panel "
      + "below runs one shipped case in your browser and does two sums on "
      + "those published numbers: N_OG = the sum of dz/H_OG over the "
      + "segments, and the HETP that H_OG and lambda give segment by "
      + "segment.  Nothing is typed in.  The case is a distillation bed "
      + "at total reflux, so its two lines are not straight and the "
      + "Colburn closed form does not apply to it; the definition of N_OG "
      + "as the sum does.",
    note: "RateBasedSegment.cpp:909 (the HOG column), :456 (lambda = m v/l), "
      + "PackingRBF.cpp:136-139 (H_OG and HETP of one point); the case is "
      + "tutorials/steady/distillation/ratebased01_schulz_0p10bar.",
  },
];

export const TRANSFER_UNIT_LIMITS: readonly LessonLimit[] = [
  { id: "straight", title: "Straight lines, dilute, constant flows",
    body: "Colburn's closed form needs a straight equilibrium line, a "
      + "straight operating line, a solute-free liquid and constant G and L.  "
      + "A concentrated absorber, or a distillation, has curved lines; there "
      + "N_OG is still the integral of dy/(y - y*) but it is evaluated "
      + "numerically, "
      + "and the (1 - y)_M factors of Treybal's Eq. (8.37) matter." },
  { id: "hog-constant", title: "H_OG is steadier than K_y a, not constant",
    body: "The page states the claim in Treybal's words and does not plot it.  "
      + "H_OG still changes with the flows, with the packing, and with the "
      + "system, and the liquid-side film adds a term that grows with "
      + "lambda (the engine's H_OG = H_G + lambda H_L)." },
  { id: "bed", title: "One bed, a distillation at total reflux",
    body: "The engine panel runs one case.  It does not show an absorber "
      + "at the A of the sliders, because the packed absorber is not a "
      + "Choupo unit; the sliders are the page's own arithmetic, held by a "
      + "test to a numerical integral of the definition." },
  { id: "axial", title: "No axial mixing, no maldistribution",
    body: "Both numbers assume plug flow of each phase.  A real bed with "
      + "axial mixing or liquid maldistribution needs more packing than "
      + "Z = H_OG N_OG." },
];

export const TRANSFER_UNIT_QUIZ: readonly QuizQuestion[] = [
  {
    id: "which-number", steps: [1],
    q: "You change from one packing to a better one for the same absorption "
      + "duty. Which of the two numbers in Z = H_OG N_OG changes?",
    options: [
      "N_OG: a better packing makes the separation easier",
      "H_OG: the packing sets the height of a unit; the duty fixes N_OG",
      "Both, by the same factor",
      "Neither: the height depends only on the recovery",
    ],
    correct: 1,
    feedback: "N_OG comes from the equilibrium and operating lines only, "
      + "so for the same duty (same recovery, same A) it is the same "
      + "whatever the packing.  H_OG = G/(K_y a) carries the packing and "
      + "the flows.  A better packing lowers H_OG, and with it Z (step 1).",
  },
  {
    id: "pole", steps: [2],
    q: "At 99 % recovery, what happens to N_OG as the liquid rate is "
      + "lowered?",
    options: [
      "It is finite at A = 1 and grows without bound as A falls to the "
        + "recovery, 0.99",
      "It grows without bound as A falls to 1, and is undefined below",
      "It falls, because there is less liquid to equilibrate with",
      "It stays equal to y_in/y_out at every A",
    ],
    correct: 0,
    feedback: "At A = 1 the number is R/(1 - R) = 99, large but finite.  "
      + "The logarithm's argument reaches zero at A = R = 0.99, the minimum "
      + "liquid rate, and N_OG goes to infinity there (step 2).  Move the "
      + "A slider on the page between 1 and 0.99 and watch it.",
  },
  {
    id: "hetp-lambda", steps: [4],
    q: "For lambda = mG/L well above 1, how does the HETP compare with "
      + "H_OG?",
    options: [
      "HETP is larger than H_OG",
      "HETP equals H_OG at every lambda",
      "HETP is smaller than H_OG: HETP = H_OG ln(lambda)/(lambda - 1)",
      "HETP is unrelated to H_OG",
    ],
    correct: 2,
    feedback: "ln(lambda)/(lambda - 1) is exactly 1 at lambda = 1 and "
      + "falls steadily as lambda grows, so it is below 1 for lambda above 1 "
      + "(and above 1 for lambda below 1) (step 4).  It is a fact about two "
      + "straight lines: for lambda above 1 the stage count N_t is larger "
      + "than N_OG, so each stage is a shorter piece of packing than a "
      + "transfer unit.",
  },
  {
    id: "why-split", steps: [3],
    q: "Why does one measured H_OG carry from one design to another better "
      + "than one measured K_y a?",
    options: [
      "Because H_OG does not depend on the flows at all",
      "Because G sits in the numerator of H_OG = G/(K_y a), so it moves "
        + "with K_y a and the ratio varies much less than either",
      "Because K_y a is always measured badly",
      "Because N_OG is constant for every packing",
    ],
    correct: 1,
    feedback: "Both G and K_y a grow with the gas rate, and the ratio "
      + "G/(K_y a) is 'very much more constant than either' (Treybal, after "
      + "his Eq. 8.25).  It is steadier, not constant: H_OG still changes "
      + "with the packing, the fluids and the liquid rate (step 3 and the "
      + "limits).",
  },
];
