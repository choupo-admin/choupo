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
  sentenceToDecisionLesson -- "From a sentence to a decision" (DEV.md 4c
  C127; Vitor, 2026-10-21: "devias fazer um EduTool sobre isso das
  propriedades! O aluno via logo como tinha de fazer!").

  ONE WORKED EXAMPLE, six pages, each showing the artefact the tree ships:
  the request, the data and their sources, the fit with its declared band, the
  held-out test, the verdict in context, and the decision the student writes.
  The artefacts are the case tutorials/props/curation/curate04_nrtl_methanol_
  water, its golden and the catalogue record its fit became; no number on the
  page is typed here.  The numbers the PROSE quotes are few and are held to
  those files by tests/sentenceToDecision.test.ts.

  EVERY FACT ABOUT CHOUPO HAS A LINE: CITATIONS lists each file:line the page
  names with a fragment that line must contain, and the test reads them back.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const SD_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A sentence is not yet a question the engine can answer",
    body: "The request has three parts hidden in one sentence. \"Fit NRTL for "
      + "methanol-water at 1 atm\" names a model, a pair and a property that was "
      + "measured: the temperature at which a liquid of known composition boils "
      + "at a held pressure. \"Tell me if I can use it\" is not a fit at all; it is "
      + "a test, and a test needs data the fit never saw and a criterion written "
      + "before it. \"For a column at 0.5-1 atm\" is a range, and the answer will "
      + "be about that range or it will be about something else. The case the "
      + "page walks was written to answer exactly this, in a dictionary: the "
      + "pair to fit is a path, the property is a residual kind, the criterion is "
      + "an acceptance block, and the held-out data carry a role "
      + "(system/propsDict:81-114).",
    note: "The words on the left become the keys on the right on the page below; "
      + "nothing is added that the case does not already declare.",
  },
  {
    n: 2,
    title: "Data, and where each point came from",
    body: "A fit is only as good as its evidence, so the evidence is files, each "
      + "naming its article, its DOI, the archive file and block it was "
      + "transcribed from, the compounds by CAS number and InChIKey, and a stated "
      + "expanded uncertainty for every single point. The page reads both files "
      + "straight from the case. Both carry reviewStatus "
      + "transcribedNotCheckedAgainstArticle: nobody has yet read the numbers "
      + "back against the paper, and the run announces it. The role of a file, "
      + "fit or held out, is deliberately NOT in the file: it is declared by the "
      + "operation that uses it, before any fitting, and frozen in a fingerprint "
      + "of the declaration (src/propertyOps/EvidencePartition.cpp:428).",
    note: "The uncertainty is the point's own, at the stated confidence level, "
      + "and it is also the fit's weight: a point measured to a tenth of a "
      + "kelvin is not outvoted by one measured to a kelvin.",
  },
  {
    n: 3,
    title: "The fit, with its partition and its band declared first",
    body: "NRTL is fitted with the constant parts fixed at zero and alpha fixed, "
      + "so two parameters are free, the two temperature parts b, in kelvin. The "
      + "band the model must meet on data it did not see is written in the same "
      + "operation, with the rule that produced it (the acceptance block), and "
      + "it is part of the fingerprint: a band chosen after seeing the result "
      + "would have changed the fingerprint. What the fit then reports is "
      + "in-sample: the model reproducing the points it was fitted to.",
    formula: String.raw`\tau_{ij}=\frac{b_{ij}}{T},\qquad \chi^{2}=\sum_{k}\left(\frac{T_{\mathrm{calc},k}-T_{\mathrm{meas},k}}{U_k}\right)^{2}`,
    where: [
      { sym: "\\tau_{ij}", means: "the NRTL interaction parameter of i with j, with its constant part fixed at zero" },
      { sym: "b_{ij}", means: "the fitted temperature part of the parameter", unit: "K" },
      { sym: "T", means: "the temperature", unit: "K" },
      { sym: "\\chi^{2}", means: "the weighted sum of squared residuals the fit minimises" },
      { sym: "k", means: "the index of a fitted point" },
      { sym: "T_{\\mathrm{calc},k}", means: "the bubble temperature the model computes at point k", unit: "K" },
      { sym: "T_{\\mathrm{meas},k}", means: "the measured bubble temperature of point k", unit: "K" },
      { sym: "U_k", means: "the point's own stated expanded uncertainty", unit: "K" },
    ],
    note: "The equation the engine evaluates: src/thermo/activityCoefficient/"
      + "NRTL.cpp:114. The weighting by each point's own uncertainty is the "
      + "case's `weighting uncertainty;` (system/propsDict:114).",
  },
  {
    n: 4,
    title: "The held-out test: other points, and how independent they are",
    body: "The model is now asked about points it was never fitted to, and the "
      + "residual is drawn point by point against the condition, in kelvin: one "
      + "average can hide a badly represented region. The page says how "
      + "independent the held-out evidence is, and the engine does too, but only "
      + "as far as a machine can: it stops a run that puts the same evidence in both "
      + "roles, training and testing (src/propertyOps/EvidencePartition.cpp:386), and it "
      + "ANNOUNCES the identity facts it can see, without judging whether two "
      + "studies are scientifically independent "
      + "(src/propertyOps/EvidencePartition.cpp:590). Two articles are two "
      + "laboratories' systematic errors; a split of one article's points is one "
      + "laboratory's, and its held-out error would look smaller than it is. "
      + "The held-out error is reported in kelvin and as a percentage of the "
      + "measured temperature, the quantity the band is written in "
      + "(src/propertyOps/FitParameters.cpp:1545).",
    formula: String.raw`\mathrm{AAD}_{\mathrm{K}}=\frac{1}{N}\sum_{k=1}^{N}\left|T_{\mathrm{calc},k}-T_{\mathrm{meas},k}\right|,\qquad \mathrm{AAD}_{\%}=\frac{100}{N}\sum_{k=1}^{N}\frac{\left|T_{\mathrm{calc},k}-T_{\mathrm{meas},k}\right|}{T_{\mathrm{meas},k}}`,
    where: [
      { sym: "\\mathrm{AAD}_{\\mathrm{K}}", means: "the mean absolute deviation over the held-out points, in kelvin", unit: "K" },
      { sym: "\\mathrm{AAD}_{\\%}", means: "the same deviation as a percentage of the measured temperature", unit: "%" },
      { sym: "N", means: "the number of held-out points" },
    ],
    note: "A residual is engine minus measurement, so its sign says which way "
      + "the model errs.",
  },
  {
    n: 5,
    title: "The verdict, in context",
    body: "validated means one thing: the held-out error is at or below the band "
      + "declared before the fit (src/propertyOps/CurationDossier.cpp:74). It "
      + "does not say the pair is right, nor that it beats every alternative. "
      + "The record that carries the pair restates the verdict with what it was "
      + "tested on: the number of points, the composition span, and the validity "
      + "block that says where the fit evidence was. Read them against the "
      + "request: the verdict meets the criterion for THIS test set, over THIS "
      + "composition range and at THIS pressure, for THIS property. A "
      + "different property, such as the vapour composition, was only compared "
      + "with the data, and a comparison is not a validation "
      + "(src/propertyOps/EvidencePartition.cpp:466). A range the held-out "
      + "points do not reach is supported by the fit points alone, which are "
      + "in-sample.",
    note: "validity is the span of the FIT evidence (data/standards/"
      + "parameters/NRTL/methanol-water.dat:100-104); outside it the record "
      + "says the pair is an extrapolation.",
  },
  {
    n: 6,
    title: "The decision is yours, and it names what it rests on",
    body: "A decision is a sentence a colleague can audit: accept, accept for a "
      + "stated range, or reject, and the evidence it rests on. Write it below, "
      + "then compare it with what the files let anyone say. Two decisions "
      + "can both be defensible: the files do not choose between a cautious "
      + "acceptance for the range the held-out points touch and an acceptance "
      + "of the whole range on the strength of the fit evidence; they only fix "
      + "which of the two claims has a test behind it.",
    note: "Local acceptance and public promotion are two separate acts: the "
      + "record's reviewStatus stays interim until a person reviews it "
      + "(data/standards/parameters/NRTL/methanol-water.dat:62).",
  },
];

export const SD_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-system",
    title: "One worked example is one system",
    body: "Everything on the page is about methanol and water at the pressures "
      + "of these two articles, in the frame of the case (ideal-gas vapour, the "
      + "catalogue's vapour pressures). Another pair, another pressure or another "
      + "vapour model changes what the same parameters mean.",
  },
  {
    id: "transcribed",
    title: "The measurements are transcribed, not yet read back",
    body: "Both series say transcribedNotCheckedAgainstArticle. The page shows "
      + "what the files hold; whether the files match the printed articles is a "
      + "check nobody has made yet, and a verdict is only as good as that check. "
      + "One thing in particular is unread: the held-out article's title is about "
      + "the effect of a salt on this system, and the file records the block it "
      + "took as methanol and water alone; that this block is the salt-free "
      + "series is part of what nobody has read back.",
  },
  {
    id: "not-a-fit",
    title: "The page fits nothing in TypeScript",
    body: "The fit and every number it produced are the engine's, read from its "
      + "golden or from a run in your browser. The page adds only arithmetic on "
      + "the engine's table, marked page: a residual's ratio to the point's own "
      + "uncertainty and the root-mean-square of a group of residuals.",
  },
  {
    id: "no-evidence-view-fd",
    title: "This page is not the Explorer's Evidence view",
    body: "The Explorer draws measured points against every candidate model for "
      + "a pair. It does not yet draw which points were fitted and which were "
      + "held out; this page does, for one case.",
  },
];

export const SD_QUIZ: readonly QuizQuestion[] = [
  {
    id: "what-validated-says",
    q: "The record says validated, with a held-out error inside the band. What has been shown?",
    options: [
      "That the pair describes methanol and water correctly at any pressure",
      "That on the held-out points, at their composition span and pressure, the error was inside a band written before the fit",
      "That no other model can do better on the same points",
      "That a person has checked the data against the articles",
    ],
    correct: 1,
    feedback: "validated is a statement about THIS test set: the held-out points, "
      + "the property compared and the band declared before the fit. It says "
      + "nothing about other pressures, it does not rank the pair against other "
      + "models, and the record's review status still says no person has read "
      + "the series back against the articles.",
    steps: [5],
    origins: ["engine"],
  },
  {
    id: "independence",
    q: "Why does the page say whether the held-out points come from another study or from a split of one?",
    options: [
      "Because the engine can prove two studies are scientifically independent",
      "Because a split of one study shares that laboratory's systematic errors, so its held-out error looks smaller than a new laboratory would give",
      "Because a split is not allowed by the engine",
      "Because another study always has more points",
    ],
    correct: 1,
    feedback: "The engine settles one independence question, the identity of the "
      + "evidence, and stops a run that puts the same evidence in both roles; it announces "
      + "the rest and judges nothing. A split of one study removes random "
      + "scatter from the comparison but not that laboratory's own bias, so "
      + "another study is the stronger test.",
    steps: [4],
  },
  {
    id: "range-covered",
    q: "The column runs from half an atmosphere to one atmosphere. Which part of that range does the held-out set test?",
    options: [
      "The whole range, because the pair was fitted over it",
      "Only the one-atmosphere end, where the held-out isobar lies; the rest is covered by fit points, which are in-sample",
      "None of it, because the held-out set is at a different pressure from the fit",
      "Only half an atmosphere",
    ],
    correct: 1,
    feedback: "The held-out series is at a single pressure, one atmosphere. "
      + "The fit points between half an atmosphere and the top of the fit span "
      + "are the points the model was adjusted to, so their small residuals "
      + "are in-sample and test nothing independent. The verdict supports the "
      + "one-atmosphere end; the lower part rests on the fit evidence.",
    steps: [4, 5],
    origins: ["engine", "page"],
  },
  {
    id: "better-alternative",
    q: "Another model, drawn on the same held-out points, errs less than the fitted pair. Does that overturn validated?",
    options: [
      "Yes, validated means no model does better",
      "Yes, the held-out test is then void",
      "No: validated means inside the band declared before the fit; another model may still be closer",
      "No, because the other model was fitted to the held-out points",
    ],
    correct: 2,
    feedback: "The verdict compares the pair with a band written beforehand, "
      + "not with other models. The overlay on the case shows the predictive "
      + "UNIFAC model closer than the fitted pair on the same held-out points: "
      + "both facts are true, and a decision should know both.",
    steps: [4, 5],
    origins: ["engine"],
  },
];

export const SD_CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "tutorials/props/curation/curate04_nrtl_methanol_water/system/propsDict", line: 81, contains: "name        fit_nrtl;" },
  { file: "tutorials/props/curation/curate04_nrtl_methanol_water/system/propsDict", line: 114, contains: "weighting   uncertainty;" },
  { file: "src/propertyOps/EvidencePartition.cpp", line: 428, contains: "Canonical, order-independent fingerprint" },
  { file: "src/thermo/activityCoefficient/NRTL.cpp", line: 114, contains: "tau_ij = a_ij + b_ij / T" },
  { file: "src/propertyOps/EvidencePartition.cpp", line: 386, contains: "the ONE independence" },
  { file: "src/propertyOps/EvidencePartition.cpp", line: 590, contains: "ANNOUNCED, never adjudicated" },
  { file: "src/propertyOps/FitParameters.cpp", line: 1545, contains: "std::fabs(rV[k]) / tVal[k]" },
  { file: "src/propertyOps/CurationDossier.cpp", line: 74, contains: "aadPct <= part.acceptanceMaxAADPct()" },
  { file: "src/propertyOps/EvidencePartition.cpp", line: 466, contains: "agreement with measured data" },
  { file: "data/standards/parameters/NRTL/methanol-water.dat", line: 100, contains: "validity" },
  { file: "data/standards/parameters/NRTL/methanol-water.dat", line: 62, contains: "reviewStatus  interim;" },
];
