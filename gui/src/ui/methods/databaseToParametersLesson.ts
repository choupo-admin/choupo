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
  databaseToParametersLesson -- "From a database to binary parameters"
  (DEV.md 4c C332 item 3, C334; approved by Vitor 2026-11-12).

  THE LESSON IS THE PIPELINE THIS PROJECT BUILT (DEV.md 4c C282-C286, C290,
  C291, C294, C300; docs/design/binary-pairs-from-open-measurements.md
  sections 8-13), told in the order a curator meets it: identify the pair,
  choose the blocks, every laboratory together, outliers by name, least
  squares then the largest error, the graded acceptance, one liquid, and
  what the record does NOT prove.

  EVERY FACT ABOUT CHOUPO HAS A LINE.  `CITATIONS` lists each file:line the
  page names with a fragment that line must contain, and
  gui/tests/databaseToParametersLesson.test.ts reads every one back.  The
  catalogue COUNTS are measured at one commit (CATALOGUE_COMMIT) and the test
  recounts them there with git, so they stay checkable after the catalogue
  grows; the page says the date.

  It does NOT repeat the solubility routes (sle-pair, salt-mixing teach
  them) and links forward only to pages that exist.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

// ---- the record the page reads line by line ---------------------------------

export const EXAMPLE_RECORD = "data/standards/parameters/NRTL/acetone-methanol.dat";
export const EXAMPLE_CASE = "data/curation/pairs/acetone-methanol/system/propsDict";
export const CAPPED_RECORD = "data/standards/parameters/NRTL/124Trimethylbenzene-2Pentanol.dat";

export interface RecordLine { file: string; line: number; text: string; means: string }

export const RECORD_LINES: readonly RecordLine[] = [
  { file: EXAMPLE_RECORD, line: 49, text: "b_ij        103.58615288;",
    means: "The fitted parameter, in kelvin: tau_ij = b_ij / T." },
  { file: EXAMPLE_RECORD, line: 51, text: "b_ji        112.54970592;",
    means: "The other one.  a_ij, a_ji are 0 and alpha is 0.30, fixed." },
  { file: EXAMPLE_RECORD, line: 61, text: "reviewStatus  autoPromoted;",
    means: "A rule promoted it, declared before the fit." },
  { file: EXAMPLE_RECORD, line: 62, text: "humanReviewed false;",
    means: "No person has read the series back against the articles." },
  { file: EXAMPLE_RECORD, line: 63, text: "fitGrade      clean;   // DEV.md 4c C285 (C286): max |T_model - T| over the kept points, graded 1 / 2 / 4 K",
    means: "The largest miss is under 1 K." },
  { file: EXAMPLE_RECORD, line: 64, text: "fitGradeBasis inSample;   // DEV.md 4c C300 rule 1: the residual of the points it was fitted to",
    means: "Measured on the points it was fitted to: not a prediction." },
  { file: EXAMPLE_RECORD, line: 65, text: "fitGradeMaxTemperatureError_K 0.6221;",
    means: "The number the grade was taken on." },
  { file: EXAMPLE_RECORD, line: 154, text: "maxAbsCorr    0.99722744;",
    means: "b_ij and b_ji move together: many pairs fit almost as well." },
  { file: EXAMPLE_RECORD, line: 168, text: "heldOut     none;   // every declared dataset carried `role fit`",
    means: "Nothing was kept back to test it." },
  { file: EXAMPLE_RECORD, line: 177, text: "evidence        allLaboratories;   // every study fitted, none held out",
    means: "Seven articles, fitted together." },
  { file: EXAMPLE_RECORD, line: 181, text: "pointsKept      156;",
    means: "No point was beyond 3 K after the least-squares stage." },
  { file: EXAMPLE_RECORD, line: 188, text: "oneLiquid       true;   // arm (f) over the validity span; a pair that splits ONE liquid is never promoted, whatever its grade",
    means: "The equation predicts one liquid where the data say one." },
];

// ---- the catalogue, counted -------------------------------------------------

/** The commit the counts were measured at, and the day. */
export const CATALOGUE_COMMIT = "42c1dcbde";
export const CATALOGUE_DATE = "2026-11-12";

/** The counts the page quotes, over data/standards/parameters/NRTL/*.dat at
 *  CATALOGUE_COMMIT.  The test recounts them there with the rules written
 *  beside each (comments stripped, then the field read). */
export const COUNTS = {
  nrtl: 558,
  /** evidence cites exactly one distinct DOI */
  oneArticle: 490,
  /** `heldOut none;` in the validation block */
  heldOutNone: 546,
  /** `fitGrade severe;` */
  severe: 17,
  /** `fitGradeCap ( ... );` present */
  capped: 395,
  /** `humanReviewed true;` or `review { by human; ... }` */
  reviewedByPerson: 0,
  uniquac: 220,
  wilson: 524,
} as const;

// ---- the map: which measurement constrains which parameter ------------------

export interface MapRow { id: string; measurement: string; constrains: string; where: string; tool?: string; toolName?: string; live: boolean }

export const MAP: readonly MapRow[] = [
  { id: "tx", measurement: "Bubble temperatures at fixed pressure (T-x)",
    constrains: "Both b's through the activity coefficients along x; the vapour pressures enter too, so their error lands in the pair.",
    where: "fitParameters, kind T_bubble", live: true },
  { id: "px", measurement: "Bubble pressures at fixed temperature (P-x)",
    constrains: "The activity coefficients at ONE temperature.  How b/T moves with T is not tested by one isotherm.",
    where: "fitParameters, kind P_bubble", live: true },
  { id: "lle", measurement: "Liquid-liquid tie lines",
    constrains: "The two liquids' compositions fix both tau strongly; bubble points alone cannot see a second liquid.",
    where: "fitParameters, kind T_bubble+LLE; the record nButanol-water.dat",
    tool: "hunter-nash", toolName: "Extraction (Hunter-Nash)", live: true },
  { id: "sle", measurement: "Solubility of a solid",
    constrains: "The solute's activity in the saturated liquid, one point per temperature.",
    where: "taught on the page \"sle-pair\"", toolName: "sle-pair", live: false },
  { id: "henry", measurement: "Henry's constant, activity coefficient at infinite dilution",
    constrains: "Only the dilute end: one limit of the curve, not its middle.",
    where: "data/standards/parameters/Henry/", live: false },
  { id: "salt", measurement: "Mixed-salt solutions",
    constrains: "Ion-pair and mixing parameters, a different model family.",
    where: "taught on the page \"salt-mixing\"", toolName: "salt-mixing", live: false },
];

// ---- the steps ----------------------------------------------------------------

export const DP_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "What a binary pair is",
    body: "NRTL describes a liquid mixture with two energy parameters per pair. "
      + "Choupo's curated pairs fix a and alpha and fit only the two b's, in "
      + "kelvin, to measurements.  A database of measurements becomes a "
      + "parameter only through such a fit.",
    formula: String.raw`\tau_{ij} = a_{ij} + \frac{b_{ij}}{T}, \qquad G_{ij} = \exp(-\alpha\,\tau_{ij})`,
    where: [
      { sym: "\\tau_{ij}", means: "the NRTL interaction parameter of i with j" },
      { sym: "a_{ij}", means: "its constant part, fixed at 0 in the curated pairs" },
      { sym: "b_{ij}", means: "its temperature part, the fitted parameter", unit: "K" },
      { sym: "T", means: "the temperature", unit: "K" },
      { sym: "G_{ij}", means: "the NRTL weighting factor" },
      { sym: "\\alpha", means: "the non-randomness parameter, fixed at 0.30" },
    ],
    note: "The equation the engine evaluates: src/thermo/activityCoefficient/NRTL.cpp:113.",
  },
  {
    n: 2,
    title: "Name the pair by identifier, not by name",
    body: "The archive names a compound by InChIKey and carries no CAS number; "
      + "names repeat, and two substances can share a formula.  The pipeline "
      + "joins each compound to a catalogue component through an InChIKey "
      + "bridge, and refuses a pair it cannot join.",
    note: "bin/choupo-thermoml:1044 (no CAS in the archive); bin/curate/pairs_c283.py:434 "
      + "(the refusal).  On this page you make the join yourself.",
  },
  {
    n: 3,
    title: "Choose the blocks",
    body: "A usable block is a binary bubble temperature at a stated pressure, "
      + "at most 110 kPa, or a bubble pressure at a stated temperature, with an "
      + "uncertainty on every point and at least five interior points.  The "
      + "pure endpoints are set aside.  A vapour composition with no liquid "
      + "one, a varying temperature or a repeated row is refused.",
    note: "The refusals: bin/choupo-thermoml:1801, :1868, :640.  The rules: "
      + "bin/curate/pairs_c283.py:467.",
  },
  {
    n: 4,
    title: "Every laboratory together",
    body: "Fitting one laboratory and testing on another measured how much "
      + "laboratories disagree, not the model: they disagree by more than "
      + "their stated uncertainty.  So every usable study is fitted together, "
      + "and none is held out.",
    note: "docs/design/binary-pairs-from-open-measurements.md:733.",
  },
  {
    n: 5,
    title: "Least squares first, then the largest error",
    body: "Least squares finds the basin.  Points beyond 3 K (20 % for a "
      + "pressure) are then discarded by row, named in the case, and the fit "
      + "repeats.  The second stage minimises the largest error, because the "
      + "worst point is what spoils a prediction.",
    formula: String.raw`\min_{b_{12},\,b_{21}} \sum_{k} \left(\frac{r_k}{U_k}\right)^{2} \quad\text{then}\quad \min_{b_{12},\,b_{21}} \max_{k} \lvert r_k \rvert, \qquad r_k = T_{\mathrm{calc},k} - T_{\mathrm{meas},k}`,
    where: [
      { sym: "b_{12}", means: "the fitted parameter of component 1 with 2", unit: "K" },
      { sym: "b_{21}", means: "the fitted parameter of component 2 with 1", unit: "K" },
      { sym: "k", means: "the index of a kept point" },
      { sym: "r_k", means: "the residual at point k", unit: "K" },
      { sym: "U_k", means: "the stated expanded uncertainty of point k", unit: "K" },
      { sym: "T_{\\mathrm{calc},k}", means: "the bubble temperature the model computes", unit: "K" },
      { sym: "T_{\\mathrm{meas},k}", means: "the measured bubble temperature", unit: "K" },
    ],
    note: "src/propertyOps/FitObjective.H:50.  For a pressure the residual "
      + "is relative, (P_calc - P_meas)/P_meas.",
  },
  {
    n: 6,
    title: "The graded acceptance",
    body: "The largest error over the kept points decides: up to 1 K clean, "
      + "2 K warning, 4 K severe, above that refused (5, 10, 20 % for a "
      + "pressure).  The grade is in-sample.  A clean on one temperature or "
      + "one laboratory is capped at warning, and severe fits are no longer "
      + "promoted.",
    note: "bin/curate/pairs_c283.py:92, :151, :166.  The 17 severe records "
      + "promoted before that rule are still in the catalogue: "
      + "docs/design/binary-pairs-from-open-measurements.md:1335.",
  },
  {
    n: 7,
    title: "One liquid",
    body: "A bubble-point fit solves for one liquid by construction, so it "
      + "cannot see a pair that predicts two.  A separate check computes the "
      + "fitted equation's Gibbs energy of mixing across the validity span; "
      + "a pair that splits one liquid is not promoted, whatever its grade.",
    note: "bin/curate/check_regressed_pairs.py:38.  This page does not run "
      + "that check.",
  },
  {
    n: 8,
    title: "What the record proves, and what it does not",
    body: "A curated record says what it rests on: the articles, the points "
      + "kept, the grade, whether anything was held out, who reviewed it.  It "
      + "does not prove the pair predicts another laboratory, another "
      + "pressure or a third component.  A review, by a person or a model, is "
      + "not a validation.",
    note: "docs/design/from-a-database-to-binary-parameters.md:189 (review is not validation).  The counts below were "
      + "measured on the catalogue at one commit.",
  },
];

export const DP_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-file",
    title: "One file is one laboratory",
    body: "The live fit uses the block you load and nothing else.  The "
      + "pipeline fits every laboratory of the pair together; a fit here is "
      + "always capped at warning for that reason.",
  },
  {
    id: "no-second-start",
    title: "What the live fit leaves out",
    body: "The pipeline runs a second start and the one-liquid check, and "
      + "fits UNIQUAC and Wilson on the same points.  This page does not.",
  },
  {
    id: "frame",
    title: "The frame",
    body: "Ideal-gas vapour, no Poynting term, the catalogue's own vapour "
      + "pressures: a different frame gives different b's for the same data.",
  },
];

// ---- citations, read back by the test -----------------------------------------

export const CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "src/thermo/activityCoefficient/NRTL.cpp", line: 113, contains: "tau_ij = a_ij + b_ij / T" },
  { file: "bin/choupo-thermoml", line: 1046, contains: "NO CAS number" },
  { file: "bin/curate/pairs_c283.py", line: 434, contains: "does not join the archive by InChIKey" },
  { file: "bin/choupo-thermoml", line: 1803, contains: "REPORTS y BUT NO x" },
  { file: "bin/choupo-thermoml", line: 1870, contains: "THE TEMPERATURE VARIES ACROSS" },
  { file: "bin/choupo-thermoml", line: 642, contains: "A REPEATED OBSERVATION IS REFUSED" },
  { file: "bin/curate/pairs_c283.py", line: 467, contains: "uncertaintyDeclared" },
  { file: "docs/design/binary-pairs-from-open-measurements.md", line: 733, contains: "than they claim" },
  { file: "src/propertyOps/FitObjective.H", line: 50, contains: "`twoStage`" },
  { file: "bin/curate/pairs_c283.py", line: 92, contains: "GRADE_K" },
  { file: "bin/curate/pairs_c283.py", line: 153, contains: "def cap_grade" },
  { file: "bin/curate/pairs_c283.py", line: 168, contains: "NOT_PROMOTED_GRADES" },
  { file: "docs/design/binary-pairs-from-open-measurements.md", line: 1335, contains: "Rule 3 (severe records out" },
  { file: "bin/curate/check_regressed_pairs.py", line: 38, contains: "ONE LIQUID WHERE THE EVIDENCE SAYS ONE" },
  { file: "docs/design/from-a-database-to-binary-parameters.md", line: 189, contains: "Review is not validation" },
  { file: "src/propertyOps/FitParameters.cpp", line: 406, contains: "\"P_bubble\"" },
  { file: "src/propertyOps/LleResidual.H", line: 101, contains: "T_bubble+LLE" },
  { file: "data/standards/parameters/NRTL/nButanol-water.dat", line: 26, contains: "tie lines" },
  { file: "src/propertyOps/FitParameters.cpp", line: 3219, contains: "residual_rel" },
];
