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
  solventMixtureLesson -- the text of "Choosing a solvent, or a solvent
  mixture" (DEV.md 4c C128, slice 2).

  THE PEDAGOGY IS VITOR'S: the student declares (reads) the target and the
  solvents with every parameter's source and reference temperature, PREDICTS
  the best composition before the curve is shown, then sees the engine's
  curve of the Hansen distance against composition with the pure solvents at
  the ends, the minimum marked and the phase word drawn at every point, then
  the real case beside the measurements, and last what a small distance is
  and is not.  Sequence: synthetic -> real -> experiment.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, and
  tests/solventMixtureLesson.test.ts holds each citation to the statement it
  names.  Every number the pages show is read from the three witnesses' CSVs
  (tutorials/props/solvents/solvent01..03), written by the engine's
  hansenMixture operation in the reader's browser; the page draws and
  computes nothing.  The primary source of every real parameter is Hansen's
  1967 thesis, named by title; its tables are transcribed in the witnesses'
  case-local records, not here.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const SOLVENT_STEPS: readonly LessonStep[] = [
  // ---- Page 1: the question --------------------------------------------------
  {
    n: 1,
    title: "Which solvent, for what, at what temperature",
    body: "A formulator does not ask what a solvent's parameters are; she "
      + "asks which solvent, or which blend, will take up THIS substance -- a "
      + "polymer to be coated, a resin to be thinned, a dye to be carried -- "
      + "at the temperature the process runs at.  Hansen's answer (The Three "
      + "Dimensional Solubility Parameter and Solvent Diffusion Coefficient, "
      + "1967) is geometric.  Every liquid gets three numbers, the dispersion, "
      + "polar and hydrogen-bonding parts of its cohesive energy density, "
      + "which add in quadrature to the single Hildebrand parameter of the "
      + "solubility-parameter lesson.  A SOLUTE gets the same three numbers "
      + "plus a fourth: the centre of the cloud of solvents observed to "
      + "dissolve it, and the radius of that cloud.  Choupo reads the triple "
      + "from a hansen block on each record, and REQUIRES the temperature the "
      + "placement was made at beside it (Component.cpp:239): a triple with "
      + "no temperature is a number from an unstated state.  The radius is "
      + "optional, because a solvent has none (Component.cpp:255).",
    formula: String.raw`\delta^2 = \delta_d^2 + \delta_p^2 + \delta_h^2`,
    where: [
      { sym: "\\delta", means: "the Hildebrand solubility parameter, the square root of the cohesive energy density", unit: "MPa^1/2" },
      { sym: "\\delta_d", means: "its dispersion (London) part", unit: "MPa^1/2" },
      { sym: "\\delta_p", means: "its permanent-dipole (polar) part", unit: "MPa^1/2" },
      { sym: "\\delta_h", means: "its hydrogen-bonding part", unit: "MPa^1/2" },
    ],
    note: "The thesis prints its parameters in (cal/cm3)^1/2; the records "
      + "convert to the engine's Pa^1/2 by the square root of 4.184e6 and "
      + "keep the thesis's own digits in a comment beside each value.  The "
      + "temperature is NOT decorative: no correction exists in this engine, "
      + "so the parameters are held constant at their reference temperature "
      + "as an approximation and the run says so (HansenMixture.cpp:279); "
      + "the declared T decides one thing only, the phase check of page 3.",
  },
  {
    n: 2,
    title: "The distance, and the sphere",
    body: "Hansen found that the solvents dissolving a given solute cluster "
      + "into a closed volume, and that the volume is a sphere only when the "
      + "dispersion axis is drawn at twice the scale of the other two -- "
      + "which is where the factor 4 on the first term comes from (his "
      + "Eq. 8.2; HansenMixture.cpp:121).  The distance from the solute's "
      + "centre is Ra; divided by the solute's radius it is the relative "
      + "energy difference, below one inside the sphere and above one "
      + "outside.  Choupo publishes RED only where the target's record "
      + "declares a radius, and Ra alone otherwise: a cut-off the record did "
      + "not measure would be an invented one.",
    formula: String.raw`R_a^2 = 4\,(\delta_d - \delta_{d0})^2 + (\delta_p - \delta_{p0})^2 + (\delta_h - \delta_{h0})^2, \qquad \mathrm{RED} = \frac{R_a}{R_0}`,
    where: [
      { sym: "R_a", means: "the Hansen distance from the solvent (or blend) to the solute's centre", unit: "MPa^1/2" },
      { sym: "\\delta_{d0}", means: "the solute's dispersion parameter, the centre of its sphere", unit: "MPa^1/2" },
      { sym: "\\delta_{p0}", means: "the solute's polar parameter", unit: "MPa^1/2" },
      { sym: "\\delta_{h0}", means: "the solute's hydrogen-bonding parameter", unit: "MPa^1/2" },
      { sym: "\\mathrm{RED}", means: "the relative energy difference: inside the sphere below 1, outside above 1", unit: "-" },
      { sym: "R_0", means: "the solute's interaction radius, the radius of its sphere -- a measured fit, declared on its record or absent", unit: "MPa^1/2" },
    ],
  },
  // ---- Page 2: predict first -------------------------------------------------
  {
    n: 3,
    title: "Two solvents, one line between them",
    body: "A blend of two solvents is placed by the volume-fraction average of "
      + "each parameter (HansenMixture.cpp:393-395): as the fraction of the "
      + "second solvent runs from zero to one, the blend's point runs along "
      + "the straight line between the two pure points, and its distance to "
      + "the solute changes along the way.  This is a rule of thumb, not a "
      + "theorem.  It assumes that each solvent keeps its own split of "
      + "cohesive energy when mixed, and that the mixture's volume is the "
      + "sum of the parts.  It is also the rule Hansen checked his placements "
      + "against: two NON-solvents lying on opposite sides of a solute's "
      + "sphere give a blend that lies inside it, and he reports that this "
      + "was always found to be the case, with a very few boundary "
      + "exceptions (thesis, Section 2.5).  Before the engine shows you the "
      + "curve, PREDICT: at which volume fraction of the second solvent is "
      + "the blend closest to the target?  Set your guess below and commit "
      + "it; the curve stays hidden until you do.",
    formula: String.raw`\delta_{k,\mathrm{mix}} = \sum_i \phi_i\, \delta_{k,i}, \qquad k = d,\, p,\, h`,
    where: [
      { sym: "\\delta_{k,\\mathrm{mix}}", means: "the blend's parameter of kind k", unit: "MPa^1/2" },
      { sym: "k", means: "which of the three parts: dispersion, polar or hydrogen bonding", unit: "-" },
      { sym: "d", means: "the dispersion part, as an index", unit: "-" },
      { sym: "p", means: "the polar part, as an index", unit: "-" },
      { sym: "h", means: "the hydrogen-bonding part, as an index", unit: "-" },
      { sym: "\\phi_i", means: "the volume fraction of solvent i in the blend", unit: "-" },
      { sym: "\\delta_{k,i}", means: "solvent i's parameter of kind k", unit: "MPa^1/2" },
      { sym: "i", means: "a solvent of the blend", unit: "-" },
    ],
    note: "A composition declared by mass or by mole is converted to volume "
      + "fractions through each solvent's molar volume -- the record's Vliq "
      + "at 25 C, which carries that approximation too -- and the run prints "
      + "both fractions beside every point (HansenMixture.cpp:431).  The "
      + "synthetic example of this page is built so the arithmetic is "
      + "checkable by hand: the two solvents share their dispersion "
      + "parameter and differ by 8 in both the polar and the hydrogen-bonding "
      + "one, and the polymer sits exactly between them on those two axes, "
      + "one unit above on the first.",
  },
  // ---- Page 3: the curve -----------------------------------------------------
  {
    n: 4,
    title: "The curve, with the pure solvents at its ends",
    body: "The engine evaluates the blend at every grid composition and "
      + "publishes one row per point: the composition in the declared basis "
      + "and as volume fractions, the blended triple, Ra, RED where the "
      + "target has a radius, and a phase word.  The minimum of Ra over the "
      + "points that have one is marked (HansenMixture.cpp:501); your guess "
      + "is marked beside it.  On the synthetic example both pure solvents "
      + "sit at Ra = 6 and the midpoint at Ra = 2, so the blend is three "
      + "times closer than either of its parts -- the whole reason mixtures "
      + "are worth the trouble.  Beside the curve, the Teas triangle draws "
      + "the same path: the engine writes the three fractions of each point "
      + "and of the target, and the page draws them.",
    formula: String.raw`f_d = \frac{\delta_d}{\delta_d + \delta_p + \delta_h}, \qquad f_p = \frac{\delta_p}{\delta_d + \delta_p + \delta_h}, \qquad f_h = \frac{\delta_h}{\delta_d + \delta_p + \delta_h}`,
    where: [
      { sym: "f_d", means: "the Teas dispersion fraction", unit: "-" },
      { sym: "f_p", means: "the Teas polar fraction", unit: "-" },
      { sym: "f_h", means: "the Teas hydrogen-bonding fraction; the three sum to one", unit: "-" },
    ],
    note: "The triangle NORMALISES THE MAGNITUDE AWAY: two solvents with the "
      + "same balance of forces and very different cohesive strength plot at "
      + "the same point, so the triangle shows the character of the "
      + "interaction and never its strength.  Read it beside the Ra curve, "
      + "never instead of it.",
  },
  {
    n: 5,
    title: "Is the blend one liquid?  Three answers",
    body: "The mixture rule describes ONE liquid.  At every blend point the "
      + "engine asks the case's own activity model whether the solvent pair "
      + "is stable as one liquid, through Michelsen's tangent-plane test -- "
      + "the same test the flash's phaseSet auto runs "
      + "(HansenMixture.cpp:407-409; a negative minimum tangent-plane "
      + "distance means a second liquid, StabilityTest.cpp:221) -- and "
      + "publishes a word.  HOMOGENEOUS: one liquid, the rule applies with "
      + "its assumptions.  TWO-PHASE: a second liquid; the engine REFUSES to "
      + "represent the pair as one homogeneous solvent there -- no averaged "
      + "triple, no Ra, no RED for that point (HansenMixture.cpp:412).  A "
      + "two-phase pair is not useless, it may serve an extraction; it is "
      + "only not one solvent.  NOT VERIFIED: nothing in the case can "
      + "decide -- an ideal liquid has no excess Gibbs energy and can never "
      + "demix, so its answer would be homogeneous for every pair ever "
      + "asked (HansenMixture.cpp:346).  The synthetic example runs on an "
      + "ideal liquid on purpose, so every blend point on this page carries "
      + "that third word honestly.",
    formula: String.raw`\mathrm{tm}(y) = 1 + \sum_i Y_i \left(\ln Y_i - 1\right) - \sum_i Y_i\, h_i, \qquad \mathrm{tm}_{\min} < 0 \;\Rightarrow\; \text{two liquids}`,
    where: [
      { sym: "\\mathrm{tm}", means: "the tangent-plane distance of a trial composition from the plane drawn at the blend's composition", unit: "-" },
      { sym: "y", means: "a trial composition the test probes", unit: "-" },
      { sym: "Y_i", means: "the unnormalised mole numbers of the trial, component i", unit: "-" },
      { sym: "h_i", means: "the logarithm of component i's activity at the blend's own composition, the reference the plane is drawn from", unit: "-" },
      { sym: "\\mathrm{tm}_{\\min}", means: "the smallest tangent-plane distance found over the probes", unit: "-" },
    ],
  },
  // ---- Page 4: the real case -------------------------------------------------
  {
    n: 6,
    title: "Polystyrene, hexane and acetone: better than either",
    body: "The real case is Hansen's own: polystyrene as he placed it in "
      + "1967 (his solute G, centre and radius from the thesis's Table 4.1) "
      + "and solvents from his Table 2.1, each value transcribed into a "
      + "case-local record with its citation and marked interim.  Pure hexane "
      + "lies outside the sphere and pure acetone just at its edge; in the "
      + "thesis's own test both were rated 3, strongly swollen with slight "
      + "solubility.  Their blend by volume runs between them and dips well "
      + "inside the sphere near the middle.  UNIFAC, the case's activity "
      + "model, finds the pair one liquid at every point, so the word is "
      + "homogeneous all along -- which is what makes this blend a "
      + "candidate at all.",
    formula: String.raw`\mathrm{RED}(\phi) = \frac{R_a(\phi)}{R_0} < 1 \quad \text{inside the sphere}`,
    where: [
      { sym: "\\phi", means: "the volume fraction of the second solvent along the blend line", unit: "-" },
      { sym: "R_a(\\phi)", means: "the Hansen distance of the blend at that fraction", unit: "MPa^1/2" },
    ],
    note: "The parameters of this page were placed in 1967 and are decades "
      + "old; the records cite the thesis page and row for each one.  The "
      + "reference temperature is adopted as 25 C, which the thesis's tables "
      + "do not print beside the values and every later compilation of them "
      + "states; the run uses T = 25 C so nothing is moved away from it.",
  },
  {
    n: 7,
    title: "Hexane and nitromethane: the rule likes it, the liquid refuses",
    body: "Replace acetone with nitromethane.  Both ends are now far outside "
      + "the sphere and the mixture rule puts the middle of the line inside "
      + "it -- on paper, a better blend than the first.  But hexane and "
      + "nitromethane are an immiscible pair at room temperature, and the "
      + "case's UNIFAC says so: wherever the tangent-plane test finds a "
      + "second liquid the engine refuses the point.  No Ra is published "
      + "there, the point is drawn as two-phase, and the minimum is taken "
      + "over the points that survive.  Here the model refuses every blend "
      + "the rule would have put inside the sphere, and the few that survive "
      + "lie outside it: no blend of these two dissolves polystyrene.  The "
      + "averaged number would have been the best on the line, and it "
      + "describes a solvent that does not exist.  This composition is "
      + "declared by MOLE, so the page also shows the conversion to volume "
      + "fractions the engine printed.",
    formula: String.raw`x_i \;\to\; \phi_i = \frac{x_i\, V_i}{\sum_j x_j\, V_j}`,
    where: [
      { sym: "x_i", means: "the mole fraction of solvent i as declared", unit: "-" },
      { sym: "V_i", means: "solvent i's liquid molar volume, the record's Vliq", unit: "m3/mol" },
      { sym: "x_j", means: "the mole fraction of solvent j (the sum runs over both)", unit: "-" },
      { sym: "V_j", means: "solvent j's liquid molar volume", unit: "m3/mol" },
      { sym: "j", means: "a solvent of the blend, the index the sum runs over", unit: "-" },
    ],
  },
  {
    n: 8,
    title: "Thirteen pure solvents beside what Hansen observed",
    body: "The third witness screens thirteen of the thesis's solvents pure "
      + "against polystyrene -- one row each, no blend, the word pure -- and "
      + "beside each row the page draws the rating the same thesis recorded "
      + "for that solvent in its Table 2.3 (1 soluble ... 6 no visible "
      + "effect), kept in the case's constant/experimental with the citation "
      + "on every row.  Said plainly: Hansen's sphere for this polymer was "
      + "DRAWN THROUGH these very observations, so agreement shows that the "
      + "transcription and the distance arithmetic reproduce his placement; "
      + "it is a check of the method on its own training set, not an "
      + "independent prediction.  The thesis states its residual itself: "
      + "about one solvent in forty beyond the radius dissolves, and about "
      + "one in forty well inside it does not.  Nitroethane, outside at RED "
      + "1.39 and rated almost soluble, and cyclohexane, just outside at RED "
      + "1.06 and rated soluble, are that residual in this set.",
    formula: String.raw`\mathrm{RED} < 1 \;\text{or}\; \mathrm{RED} > 1 \quad \text{against a rating of } 1 \ldots 6`,
    where: [
      { sym: "\\mathrm{RED}", means: "the relative energy difference of the pure solvent, inside the sphere below 1", unit: "-" },
    ],
  },
  // ---- Page 5: what this is and is not --------------------------------------
  {
    n: 9,
    title: "What a small distance is, and is not",
    body: "Ra is a distance in a space that was fitted to dissolves / "
      + "does-not-dissolve observations.  A small Ra, or a RED below one, "
      + "says the solvent lies in the region where the substance was "
      + "OBSERVED to dissolve or swell -- a compatibility indicator in this "
      + "approach.  No saturation concentration in grams per litre follows "
      + "from it: the engine publishes none and says so on every run "
      + "(HansenMixture.cpp:546).  Nor does the distance know how fast "
      + "dissolution is, what the solution's viscosity will be, whether the "
      + "solvent evaporates at a useful rate, or what it costs -- the "
      + "thesis itself lists those as the reasons a formulator rejects most "
      + "of the blends the geometry allows.",
    formula: String.raw`R_a \;\text{small does not mean}\; c_{\mathrm{sat}} \;\text{large}`,
    where: [
      { sym: "R_a", means: "the Hansen distance of the solvent or blend from the solute", unit: "MPa^1/2" },
      { sym: "c_{\\mathrm{sat}}", means: "a saturation concentration, which this method does not give", unit: "g/L" },
    ],
  },
];

export const SOLVENT_LIMITS: readonly LessonLimit[] = [
  {
    id: "rule-of-thumb",
    title: "The mixture rule is a rule of thumb",
    body: "A volume-fraction average assumes each solvent keeps its own split "
      + "of cohesive energy when mixed and that the volumes add.  Hansen "
      + "checked it on mixtures of non-solvents and found it held with a few "
      + "boundary exceptions; nothing here derives it.",
  },
  {
    id: "no-temperature-correction",
    title: "No temperature correction exists",
    body: "Every parameter is held at the temperature its record declares.  "
      + "The declared T is used for the phase check only, and a T away from "
      + "any Tref is announced into the run's caveat block.",
  },
  {
    id: "phase-check-is-the-model",
    title: "The phase check is only as good as the activity model",
    body: "Homogeneous or two-phase is what the case's model says about the "
      + "pair, through the tangent-plane test.  UNIFAC predicts from groups "
      + "and nothing in these witnesses was fitted to any of these pairs; an "
      + "ideal liquid cannot decide at all, and the page says so with its "
      + "third word rather than with a quiet average.",
  },
  {
    id: "training-set",
    title: "The confrontation is on the method's own training set",
    body: "Hansen's sphere for polystyrene was drawn through the Table 2.3 "
      + "observations the third witness compares it with.  Agreement there "
      + "reproduces his placement; it does not test the method on a solvent "
      + "he never tried.",
  },
  {
    id: "transcription",
    title: "Transcribed from page images, marked interim",
    body: "The real parameters were read off the thesis's scanned tables, not "
      + "its OCR text, whose columns are scrambled; each record carries the "
      + "row and page.  A second reading is pending, and the records say so.",
  },
];
