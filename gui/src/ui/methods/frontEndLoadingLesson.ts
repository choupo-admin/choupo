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

  The two reactor volumes step 7 quotes are the ammonia ladder's goldens
  (ammoniaStaged03_approach and ammoniaStaged04_kinetic `expected`), held
  there by tests/frontEndLoading.test.ts; the band arithmetic of steps 3, 4
  and 6 is held to src/postProcessing/EstimateClass.H through the
  transcription in frontEndLoading.ts.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

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
      + "company and a concept screen in another.  What both agree on is "
      + "the anchor: FEL 3 is FEED, basic engineering.  The cost standard "
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
      + "A cheaper than B on their point estimates, are told apart by an "
      + "estimate only when their bands do not overlap: the HIGH end of the "
      + "cheaper one must lie below the LOW end of the dearer one.  "
      + "Rearranged, the cost ratio must exceed a number that belongs to the "
      + "class alone.  At Class 4's pessimistic corner that number is "
      + "1.5/0.7, so B must cost more than twice A before the estimate can "
      + "say which is cheaper; at Class 3's optimistic corner it is 1.1/0.9.  "
      + "A difference inside the band is not a decision the estimate can "
      + "make, and spending more definition (the next stage) is what "
      + "narrows the band.  The lesson cuts both ways.  A large difference "
      + "is decided early and cheaply: most routes die on paper.  A small "
      + "one needs a later class, or a different argument than cost.  Spend "
      + "design effort where it changes a decision.",
    formula: String.raw`C_A\,(1 + H) < C_B\,(1 + L)
\quad\iff\quad \frac{C_B}{C_A} > \frac{1 + H}{1 + L}`,
    where: [
      { sym: "C_A", means: "the point estimate of the cheaper option",
        unit: "M€" },
      { sym: "H", means: "the high-range fraction of the class", unit: "–" },
      { sym: "C_B", means: "the point estimate of the dearer option",
        unit: "M€" },
      { sym: "L", means: "the low-range fraction of the class (negative)",
        unit: "–" },
    ],
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
      + "method, so a Choupo 'basic design' is FEL-3 in its process fidelity "
      + "and a study-type estimate in its cost.  And a FEED package holds "
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
