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
  Front-End Loading, as DATA (commission C58, 2026-10-10).  Vitor: "Podes
  fazer um EduTool sobre O que a industria usa: Front-End Loading (FEL)?
  Isso e muito importante!"

  EVERY CLAIM HERE IS FROM ONE RECORD, docs/design/how-a-process-design-is-
  staged.md, which carries a retrieved source for each (its §9).  The
  quotations are the record's transcriptions of AACE International
  Recommended Practice 18R-97 (2005 revision in full, 2020 revision through
  §4) and of Steven King, "Demystifying Engineering Projects Part 3", The
  Chemical Engineer (IChemE), 27 March 2025.  No outcome statistic and no
  "cost of change" curve is quoted: the record holds none, and a number with
  no source would be a falsehood nobody could detect.

  ONE EXCEPTION, NAMED (C112 point 9, 2026-10-20): step 6's argument that
  separated bands are sufficient and not necessary -- a class range is not
  a distribution, correlated errors cancel in a difference, a decision may
  rest on expected cost and risk -- is statistics, not a claim about the
  standard or about practice, and its numbers (the 0.45 sigma of the note)
  are arithmetic recomputed by tests/frontEndLoading.test.ts.

  The two reactor volumes step 7 quotes are the ammonia ladder's goldens
  (ammoniaReactor03_equilibriumApproach and ammoniaReactor04_kineticSizing `expected`), held
  there by tests/frontEndLoading.test.ts; the band arithmetic of steps 3, 4
  and 6 is held to src/postProcessing/EstimateClass.H through the
  transcription in frontEndLoading.ts.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const FEL_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A design is bought in stages, and a gate stands between them",
    body: "A plant is not designed and then built in one go.  The owner "
      + "spends a little to learn whether to spend more: a stage of work, "
      + "then a gate at which the owner looks at what that stage produced "
      + "and decides whether the project goes on to the next one.  This "
      + "stage-gate governance of the early project is what industry calls "
      + "Front-End Loading (FEL).  Inside it sits an engineering activity "
      + "with its own name: FEED, front-end engineering design, also called "
      + "basic engineering.  The two are not rivals.  FEL is the owner's "
      + "governance frame, and FEED is the engineering work done inside its "
      + "last front-end stage; an IChemE practitioner states the identity "
      + "plainly, FEED is \"also called 'basic engineering' or 'FEL-3'\" "
      + "(King, The Chemical Engineer, 2025).  What moves from stage to "
      + "stage is always the same: the project's definition matures, the "
      + "cost estimate narrows, and the fidelity of the model follows the "
      + "definition rather than leading it.",
  },
  {
    n: 2,
    title: "The stages are numbered differently by different sources",
    body: "Do not memorise one numbering as the truth.  One family of "
      + "sources, the Wikipedia article on front-end loading citing CII's "
      + "Best Practices Guide (2012), counts five phases, FEL 0 to FEL 4: "
      + "conceptualization, feasibility evaluation, preliminary design, "
      + "basic design, and project execution.  Other owner practice counts "
      + "three front-end stages: FEL-1 concept screening, FEL-2 feasibility "
      + "or pre-FEED, FEL-3 FEED.  So 'FEL 1' is a feasibility study in one "
      + "company and a concept screen in another.  In many widely used "
      + "three-stage schemes FEL-3 corresponds to FEED/Define, basic "
      + "engineering; always check the owner's stage definitions.  The cost standard "
      + "says the same of itself: \"each enterprise may have its own project "
      + "and estimating processes and terminology, and may classify "
      + "estimates in particular ways\" (AACE 18R-97, 2005 revision).  When "
      + "you read 'FEL-2' in a document, ask which numbering it uses.",
  },
  {
    n: 3,
    title: "An estimate class is defined by what has been drawn",
    body: "The cost estimate at each gate is classified by AACE International "
      + "Recommended Practice 18R-97, written for the process industries.  "
      + "A class is defined by the MATURITY of the project's definition, "
      + "measured on its engineering deliverables (the flow diagrams, the "
      + "heat and material balances, the equipment lists, the datasheets), "
      + "and it carries an end usage, a typical estimating method and an "
      + "expected accuracy range.  Class 5 is concept screening, 0 to 2 % "
      + "of the definition complete, capacity factored (a whole plant "
      + "scaled from a reference one) or judged by analogy; Class 4 is a "
      + "study or feasibility estimate, factored from an equipment list; "
      + "Class 3 supports budget authorisation; Classes 2 and 1 support "
      + "control, bids and check estimates.  The accuracy range is stated as a "
      + "low side and a high side around the point estimate, \"at an 80 % "
      + "confidence interval\" in the 2020 revision, where the 2005 "
      + "revision described a 90 % confidence: the confidence basis is "
      + "itself a convention, and it has been revised.",
    formula: String.raw`C_\mathrm{low} = C\,(1 + L), \qquad C_\mathrm{high} = C\,(1 + H)`,
    where: [
      { sym: "C_\\mathrm{low}", means: "the low end of the "
        + "accuracy band", unit: "M€" },
      { sym: "C", means: "the point estimate of the cost", unit: "M€" },
      { sym: "L", means: "the low-range fraction of the class (negative; "
        + "Class 4 lies between -0.15 and -0.30)", unit: "–" },
      { sym: "C_\\mathrm{high}", means: "the high end of the "
        + "accuracy band", unit: "M€" },
      { sym: "H", means: "the high-range fraction of the class (Class 4 "
        + "lies between +0.20 and +0.50)", unit: "–" },
    ],
  },
  {
    n: 4,
    title: "It is a range of ranges, and the bands overlap",
    body: "A Class 4 estimate does NOT have 'the accuracy -30/+50'.  The "
      + "standard gives each class a RANGE of low ranges and a range of high "
      + "ranges, and the phrase \"range of ranges\" is its own: Class 4's "
      + "low side lies somewhere in -15 to -30 %, its high side somewhere "
      + "in +20 to +50 %.  Where a project lands in that box is a property "
      + "of the project, not of the class, driven by \"the technological "
      + "complexity of the project, appropriate reference information, and "
      + "the inclusion of an appropriate contingency determination\".  The "
      + "2020 revision adds that the range \"should always be determined "
      + "through risk analysis of the specific project and should never be "
      + "pre-determined\", and that for weak project systems or risky "
      + "projects \"the high ranges may be two to three times the high range "
      + "indicated\".  And the bands OVERLAP across classes: \"a Class 5 "
      + "estimate for a particular project may be as accurate as a Class 3 "
      + "estimate for a different project\".  Read the table and the overlap "
      + "is exact: Class 5 at its optimistic end is the same band as Class 3 "
      + "at its pessimistic end, and Class 4 at its best is Class 2 at its "
      + "worst.  A ranking of classes is not a ranking of projects.  "
      + "Choupo's economics pass, when a case declares no band, uses the "
      + "class's PESSIMISTIC corner and announces that it did "
      + "(src/postProcessing/EstimateClass.H:45-52), because understating an "
      + "interval of confidence is the one error that is not conservative.",
  },
  {
    n: 5,
    title: "The simulation matures with the drawings",
    body: "In the process industries the class is defined by which drawings "
      + "exist and how finished they are, and the standard's deliverable "
      + "matrix answers which model belongs to which stage.  Read two of its "
      + "rows together: the heat and material balances and the "
      + "specifications and datasheets.  At Class 5 neither exists.  At "
      + "Class 4 both are only started.  At Class 3 both are preliminary to "
      + "complete.  A heat and material balance is what a process "
      + "simulation IS, so the simulation and the equipment datasheets "
      + "mature together, one class at a time, and neither is finished "
      + "before the other.  The table on this page is that matrix, for six "
      + "of its rows.",
  },
  {
    n: 6,
    title: "When can an estimate choose between two options?",
    body: "This is the reason the front end is loaded at all.  Two options, "
      + "A cheaper than B on their point estimates.  If the HIGH end of the "
      + "cheaper one lies below the LOW end of the dearer one, the bands do "
      + "not overlap and the range ends alone decide: wherever inside its "
      + "band each option's true cost turns out to be, A is cheaper.  "
      + "Rearranged, the cost ratio must exceed a number that belongs to the "
      + "class alone.  At Class 4's pessimistic corner that number is "
      + "1.5/0.7, so B must cost more than twice A before the range ends "
      + "can say which is cheaper; at Class 3's optimistic corner it is "
      + "1.1/0.9.  Those ends are the class's GENERIC corners, not a "
      + "confidence interval calibrated for your project — step 4's standard "
      + "says that one comes from a risk analysis of the project itself.  "
      + "Read that test for what it is, a CONSERVATIVE separation of the "
      + "bands: non-overlapping ranges are "
      + "SUFFICIENT to decide, not NECESSARY.  Overlapping bands do not make "
      + "two options indistinguishable, for three reasons.  First, a class "
      + "range is not a probability distribution: it states roughly where a "
      + "confidence interval ends, and says nothing of the shape inside it, "
      + "so two overlapping intervals can still leave A very probably the "
      + "cheaper.  Second, the two errors are rarely independent: options "
      + "estimated by the same team, on the same basis, with the same prices "
      + "and the same method share much of their error, and what is shared "
      + "cancels in the DIFFERENCE, so the difference is known better than "
      + "either total — estimating it directly, item by item where the "
      + "options differ, is often far more informative than comparing two "
      + "totals.  Third, a decision guaranteed by the range ends is one that "
      + "holds for every value in both bands; most real decisions are taken "
      + "instead on expected cost and risk — how likely each outcome is and "
      + "what it would cost to be wrong — and that is a legitimate decision "
      + "while the bands still overlap.  What the class does fix is how wide "
      + "each band is, and that follows the maturity of the definition: "
      + "spending more definition (the next stage) is what narrows it.  The "
      + "lesson cuts both ways.  A large difference is decided early and "
      + "cheaply: most routes die on paper.  A small one needs a later "
      + "class, a direct estimate of the difference, or a different argument "
      + "than cost.  Spend design effort where it changes a decision.",
    formula: String.raw`\begin{aligned}
&C_A\,(1 + H) < C_B\,(1 + L)
\quad\iff\quad \frac{C_B}{C_A} > \frac{1 + H}{1 + L}
&&\text{(sufficient, not necessary)}\\[4pt]
&\sigma_D^2 = \sigma_A^2 + \sigma_B^2 - 2\,\rho\,\sigma_A\,\sigma_B
&&\text{(the difference, when the errors are correlated)}
\end{aligned}`,
    where: [
      { sym: "C_A", means: "the point estimate of the cheaper option",
        unit: "M€" },
      { sym: "H", means: "the high-range fraction of the class", unit: "–" },
      { sym: "C_B", means: "the point estimate of the dearer option",
        unit: "M€" },
      { sym: "L", means: "the low-range fraction of the class (negative)",
        unit: "–" },
      { sym: "\\sigma_D", means: "the standard uncertainty of the "
        + "DIFFERENCE C_B − C_A", unit: "M€" },
      { sym: "\\sigma_A", means: "the standard uncertainty of option "
        + "A's total", unit: "M€" },
      { sym: "\\sigma_B", means: "the standard uncertainty of option "
        + "B's total", unit: "M€" },
      { sym: "\\rho", means: "the correlation between the two estimates' "
        + "errors: 0 when they are independent, near 1 when they share a "
        + "basis, prices and method", unit: "–" },
    ],
    note: "A worked number for the second reason: two totals each uncertain "
      + "by the same σ, with their errors correlated at ρ = 0.9, have a "
      + "difference uncertain by σ·√(2·(1 − 0.9)) ≈ 0.45 σ — known about "
      + "twice as well as either total, while their bands, drawn "
      + "independently, may overlap.  At ρ = 0 it is 1.41 σ, worse than "
      + "either.  The chart and the table below draw the bands as if the "
      + "errors were independent; they show when the range ends decide, "
      + "never that nothing else can.",
  },
  {
    n: 7,
    title: "A size is decided more than once",
    body: "Sizing does not happen once, at the end.  At concept no item is "
      + "sized at all: the whole plant is scaled from a reference plant.  At "
      + "feasibility per-item sizing first appears, because an "
      + "equipment-factored estimate multiplies a purchased cost that a size "
      + "produced.  In FEED the sizes become specifications, and in detailed "
      + "design the size is the vendor's.  A reactor typically gets a volume "
      + "three times by three different methods: from a space velocity, then "
      + "from an integrated rate law, then from the licensor or catalyst "
      + "supplier.  Choupo's ammonia ladder shows the first two on one "
      + "synthesis loop: the approach-to-equilibrium stage sizes its "
      + "converter from a declared space velocity at 18.63 m³, and the "
      + "kinetic stage solves a bed of 6.99 m³ on the Dyson and Simon rate "
      + "law, the volume at which its outlet is 5 K short of equilibrium.  "
      + "The kinetic model did not FIRST size "
      + "the reactor; it checked and refined a size a space velocity had "
      + "already produced.",
  },
  {
    n: 8,
    title: "Where Choupo stands",
    body: "Choupo's natural home is feasibility: a converged heat and "
      + "material balance, a specification sheet per sized item, an "
      + "equipment-factored capital cost and a discounted-cash-flow "
      + "appraisal, which is what a Class 4 estimate is made of.  Above "
      + "and below that it serves part of each stage, and the table says "
      + "which part.  Be precise about the last row a student is likely to "
      + "reach.  A kinetic bed whose volume the engine solved, and exchangers "
      + "designed tube by tube, are FEED-level PROCESS work.  The cost beside "
      + "them is still factored from an equipment list, which is Class 4's "
      + "method.  So Choupo may solve individual process items at FEED-like "
      + "fidelity, but that does not make the project definition FEED: its "
      + "capital estimate remains a study / Class-4-type estimate, because "
      + "the class follows the maturity of the whole multidisciplinary "
      + "project definition and estimating basis.  And a FEED package holds "
      + "much that no simulator produces: approved P&IDs, mechanical "
      + "datasheets, relief studies, hydraulics and line sizing, and, later, "
      + "vendor quotations.",
  },
];

export const FEL_LIMITS: readonly LessonLimit[] = [
  {
    id: "independent",
    title: "The two options are drawn as if their errors were independent.",
    body: "Two options estimated by the same team, on the same basis and "
      + "with the same method, share much of their error, so their "
      + "DIFFERENCE can be known better than either total.  Comparing their "
      + "bands is the cautious reading; a real study estimates the "
      + "difference directly.",
  },
  {
    id: "not-a-risk-analysis",
    title: "A band from a table is not a risk analysis.",
    body: "The standard says the range must come from a risk analysis of "
      + "the specific project and never be pre-determined.  This page draws "
      + "the table's corners so the shape can be seen; it cannot say where "
      + "your project sits inside the box.",
  },
  {
    id: "points",
    title: "The point estimates are yours.",
    body: "The starting values are round numbers chosen to make the "
      + "arithmetic visible, not costs of any plant.  No price or cost of a "
      + "real project is curated in this repository.",
  },
  {
    id: "practice",
    title: "Practice is not uniform.",
    body: "Every large operator runs a stage-gate process under its own "
      + "names, with its own gates and its own deliverables.  What is "
      + "universal is the shape: the definition matures, the estimate "
      + "narrows, and the model fidelity follows the definition.",
  },
];

/** The questions at the foot of the page (DEV.md 4c C158): drafts for
 *  Vitor's review, each testing a step and naming it. */
export const FEL_QUIZ: readonly QuizQuestion[] = [
  {
    id: "fel-and-feed", steps: [1],
    q: "How are FEL and FEED related?",
    options: [
      "They are two names for the same thing, used by rival schools",
      "FEED comes first; FEL is the detailed design that follows it",
      "FEL is the owner's stage-gate governance of the early project; FEED "
        + "is the engineering work done inside its last front-end stage",
    ],
    correct: 2,
    feedback: "FEL is the frame — a stage of work, then a gate where the owner "
      + "decides whether to spend more — and FEED, front-end engineering "
      + "design or basic engineering, is the engineering inside its last "
      + "front-end stage.  The two are not rivals (step 1).",
  },
  {
    id: "which-numbering", steps: [2],
    q: "A document says a study is at FEL 1.  What can you conclude?",
    options: [
      "It is a concept screen",
      "Little, until you know which numbering the document uses",
      "It is a feasibility study",
      "It carries a Class 1 estimate",
    ],
    correct: 1,
    feedback: "One family of sources counts FEL 0 to FEL 4, other owners "
      + "count three front-end stages, so FEL 1 is a feasibility study in one "
      + "company and a concept screen in another.  In many widely used "
      + "three-stage schemes FEL-3 corresponds to FEED/Define; always check "
      + "the owner's stage definitions (step 2).  The estimate class is "
      + "AACE's scale, a different one again.",
    origins: ["reference"],
  },
  {
    id: "range-of-ranges", steps: [3, 4],
    q: "What is the accuracy of a Class 4 estimate?",
    options: [
      "Exactly −30 % / +50 %",
      "A range of ranges: a low side somewhere in −15 to −30 % and a high "
        + "side somewhere in +20 to +50 %, placed by the project's own risk "
        + "analysis",
      "Better than any Class 5 estimate's, on any project",
    ],
    correct: 1,
    feedback: "The standard gives each class a box, not a number, and where a "
      + "project lands in it is a property of the project (step 4).  The "
      + "boxes overlap: a Class 5 estimate for one project may be as accurate "
      + "as a Class 3 for another.  Where a case declares no band, Choupo uses "
      + "the class's pessimistic corner and says so.",
    origins: ["reference"],
  },
  {
    id: "overlapping-bands", steps: [6],
    q: "The cost bands of two options overlap.  Does that make the two "
      + "indistinguishable?",
    options: [
      "No: separated bands are sufficient to decide, not necessary",
      "Yes: no decision can be taken until the bands separate",
      "Yes, unless one option costs more than twice the other",
    ],
    correct: 0,
    feedback: "A class range is not a distribution; two options estimated on "
      + "the same basis share much of their error, which cancels in the "
      + "DIFFERENCE (at a correlation of 0.9 the difference is known to "
      + "0.45 σ, the page's arithmetic); and most real decisions rest on "
      + "expected cost and risk.  Separated bands guarantee the answer for "
      + "every value in both; they are not the only way to reach one (step 6).",
    origins: ["page"],
  },
  {
    id: "size-more-than-once", steps: [7],
    q: "When is a reactor's volume decided?",
    options: [
      "Once, by the kinetic model, at the start of the project",
      "Only in detailed design, by the vendor",
      "Once, by the space velocity, and never revisited",
      "More than once: from a space velocity, then from an integrated rate "
        + "law, then by the licensor or catalyst supplier",
    ],
    correct: 3,
    feedback: "At concept no item is sized at all; the first per-item size "
      + "comes with the equipment-factored estimate of feasibility.  Choupo's "
      + "ammonia ladder shows the first two: a converter sized from a "
      + "declared space velocity, then a bed the kinetic model solves.  The "
      + "kinetic model did not first size the reactor; it checked and refined "
      + "a size already produced (step 7).",
  },
  {
    id: "choupo-class", steps: [8],
    q: "A Choupo case solves a kinetic bed and designs its exchangers tube by "
      + "tube.  What class is the capital cost it prints?",
    options: [
      "Class 3, because the process work is FEED-level",
      "Class 1, because the engine computed it",
      "A study / Class-4-type estimate: the cost is still factored from an "
        + "equipment list",
    ],
    correct: 2,
    feedback: "Choupo may solve individual process items at FEED-like "
      + "fidelity, but that does not make the project definition FEED.  Its "
      + "capital estimate remains a study / Class-4-type estimate, because "
      + "the class follows the maturity of the whole multidisciplinary "
      + "project definition and the estimating basis, not the rigour of one "
      + "process model; and AACE's accuracy is a range of ranges, which does "
      + "not itself set the class.  A FEED package holds much no simulator "
      + "produces (step 8).",
    origins: ["reference"],
  },
];
