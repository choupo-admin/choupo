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
  frontEndLoading — the DATA and the ARITHMETIC behind "Front-End Loading:
  how industry stages a design" (DEV.md 4c C58), kept React-free so every
  claim the page makes can be held to the tree by
  tests/frontEndLoading.test.ts.

  THE CONTENT SOURCE IS ONE RECORD.  docs/design/how-a-process-design-is-
  staged.md (research, sourced, every claim with a retrieved URL in its §9).
  The stage table below is that record's §2.3 table; the two numberings are
  its §2.1; the deliverable rows are its §2.2 (AACE 18R-97 Figure 4, 2005
  revision).  Nothing here adds a number the record does not carry.

  THE AACE TABLE IS A TRANSCRIPTION, AND IT IS HELD TO ITS ONE HOME.  The
  engine's single home for AACE 18R-97 Table 1 is
  src/postProcessing/EstimateClass.H (`estimateClass::table()`, lines
  96-116).  The browser cannot include a C++ header, so `AACE_CLASSES` copies
  it -- and the test parses the header and requires every field to agree,
  the same move bin/curate/check_estimate_class.py makes for the prose copy
  in docs/design-heuristics.md.  A third home held by a test is a mirror; a
  third home held by nothing is the arity sin this table already committed
  once (EstimateClass.H's own header tells that story).

  WHAT IS COMPUTED HERE, and why that is not physics.  A band around a point
  estimate is multiplication by the table's fractions; whether two bands
  overlap is a comparison.  No engine output is involved, and the page says
  so: an estimate band is not something a simulator computes.
\*---------------------------------------------------------------------------*/

/** One row of AACE 18R-97 Table 1 (rev. 2020-08-07), field for field as
 *  src/postProcessing/EstimateClass.H's `Row`.  Percentages, signed. */
export interface AaceClass {
  cls: 1 | 2 | 3 | 4 | 5;
  /** % of complete project definition. */
  maturityLo: number;
  maturityHi: number;
  /** L range: the OPTIMISTIC (narrow) end, e.g. -15. */
  accLoNarrow: number;
  /** L range: the PESSIMISTIC (wide) end, e.g. -30. */
  accLoWide: number;
  /** H range: the OPTIMISTIC (narrow) end, e.g. +20. */
  accHiNarrow: number;
  /** H range: the PESSIMISTIC (wide) end, e.g. +50. */
  accHiWide: number;
  endUsage: string;
  methodology: string;
}

/** AACE 18R-97 Table 1, least-defined first as the standard prints it.
 *  TRANSCRIBED from src/postProcessing/EstimateClass.H:98-114; the test
 *  holds every field to that file. */
export const AACE_CLASSES: readonly AaceClass[] = [
  { cls: 5, maturityLo: 0, maturityHi: 2,
    accLoNarrow: -20, accLoWide: -50, accHiNarrow: 30, accHiWide: 100,
    endUsage: "Concept screening",
    methodology: "Capacity factored, parametric models, judgment, or analogy" },
  { cls: 4, maturityLo: 1, maturityHi: 15,
    accLoNarrow: -15, accLoWide: -30, accHiNarrow: 20, accHiWide: 50,
    endUsage: "Study or feasibility",
    methodology: "Equipment factored or parametric models" },
  { cls: 3, maturityLo: 10, maturityHi: 40,
    accLoNarrow: -10, accLoWide: -20, accHiNarrow: 10, accHiWide: 30,
    endUsage: "Budget authorization or control",
    methodology: "Semi-detailed unit costs with assembly level line items" },
  { cls: 2, maturityLo: 30, maturityHi: 75,
    accLoNarrow: -5, accLoWide: -15, accHiNarrow: 5, accHiWide: 20,
    endUsage: "Control or bid/tender",
    methodology: "Detailed unit cost with forced detailed take-off" },
  { cls: 1, maturityLo: 65, maturityHi: 100,
    accLoNarrow: -3, accLoWide: -10, accHiNarrow: 3, accHiWide: 15,
    endUsage: "Check estimate or bid/tender",
    methodology: "Detailed unit cost with detailed take-off" },
];

/** Which end of the range of ranges a band is drawn at.  `pessimistic` is
 *  the engine's announced default (EstimateClass.H:45-52). */
export type Corner = "optimistic" | "pessimistic";

/** The high-range multiplier the 2020 revision allows for "weak project
 *  systems, and/or complex or otherwise risky projects": "the high ranges
 *  may be two to three times the high range indicated in Table 1" (record
 *  §1.3, point 3).  1 is the table as printed. */
export const HIGH_RANGE_MULTIPLIERS = [1, 2, 3] as const;
export type HighRangeMultiplier = typeof HIGH_RANGE_MULTIPLIERS[number];

export interface Band { lo: number; hi: number }

/** The band a class gives a point estimate: C(1 + L), C(1 + H). */
export function bandOf(point: number, row: AaceClass, corner: Corner,
  highMultiplier: HighRangeMultiplier = 1): Band {
  const L = (corner === "optimistic" ? row.accLoNarrow : row.accLoWide) / 100;
  const H = (corner === "optimistic" ? row.accHiNarrow : row.accHiWide) / 100;
  return { lo: point * (1 + L), hi: point * (1 + highMultiplier * H) };
}

/** The cost ratio two options must exceed before a class tells them apart:
 *  C_B/C_A > (1 + H)/(1 + L), B the dearer. */
export function separatingRatio(row: AaceClass, corner: Corner,
  highMultiplier: HighRangeMultiplier = 1): number {
  const b = bandOf(1, row, corner, highMultiplier);
  return b.hi / b.lo;
}

export interface Verdict {
  cls: number;
  a: Band;
  b: Band;
  /** True when the cheaper option's HIGH end lies below the dearer one's LOW
   *  end: the estimate, at this class, says which is cheaper. */
  separated: boolean;
}

/** Two point estimates through every class, least-defined first. */
export function decide(costA: number, costB: number, corner: Corner,
  highMultiplier: HighRangeMultiplier = 1): Verdict[] {
  return AACE_CLASSES.map((row) => {
    const a = bandOf(costA, row, corner, highMultiplier);
    const b = bandOf(costB, row, corner, highMultiplier);
    const [cheap, dear] = costA <= costB ? [a, b] : [b, a];
    return { cls: row.cls, a, b,
      separated: costA !== costB && cheap.hi < dear.lo };
  });
}

/** The least-defined class whose bands separate the two options, or null
 *  when none does.  Because the bands narrow monotonically from Class 5 to
 *  Class 1 (check_estimate_class arm (c)), once separated they stay so. */
export function firstSeparatingClass(costA: number, costB: number,
  corner: Corner, highMultiplier: HighRangeMultiplier = 1): number | null {
  const v = decide(costA, costB, corner, highMultiplier).find((x) => x.separated);
  return v ? v.cls : null;
}

/** THE OVERLAP, computed rather than asserted: the pairs (a, b) where class
 *  a's OPTIMISTIC band is exactly class b's PESSIMISTIC band.  The standard
 *  says the bands overlap across classes ("a Class 5 estimate for a
 *  particular project may be as accurate as a Class 3 estimate for a
 *  different project", record §1.3); in the table itself it is exact. */
export function bestEqualsWorst(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const a of AACE_CLASSES)
    for (const b of AACE_CLASSES)
      if (a.cls > b.cls && a.accLoNarrow === b.accLoWide
          && a.accHiNarrow === b.accHiWide)
        out.push([a.cls, b.cls]);
  return out;
}

// ---- The stages ------------------------------------------------------------

/** How two families of sources number the same front end (record §2.1).
 *  The page shows both and picks neither: what they agree on is that FEL 3
 *  is FEED / basic engineering. */
export interface Numbering {
  source: string;
  stages: ReadonlyArray<{ label: string; name: string }>;
}

export const FEL_NUMBERINGS: readonly Numbering[] = [
  { source: "Five phases, as the Wikipedia article on front-end loading "
      + "lays them out, citing CII's Best Practices Guide (2012) and the PDRI",
    stages: [
      { label: "FEL 0", name: "Conceptualization" },
      { label: "FEL 1", name: "Feasibility Evaluation" },
      { label: "FEL 2", name: "Preliminary Design" },
      { label: "FEL 3", name: "Basic Design (FEED, basic engineering)" },
      { label: "FEL 4", name: "Project Execution" },
    ] },
  { source: "Three front-end stages, as other owner practice names them "
      + "(sometimes with an FEL-0 before and an FEL-4 after)",
    stages: [
      { label: "FEL-1", name: "Concept screening, appraisal" },
      { label: "FEL-2", name: "Feasibility, pre-FEED" },
      { label: "FEL-3", name: "FEED, basic engineering" },
    ] },
];

/** A front-end stage: the record's §2.3 table, one row each, plus where
 *  Choupo stands at that fidelity.  `choupo` claims only what a case in the
 *  tree does, and every case named is checked to exist by the test.
 *
 *  THE C57 CASES ARE LISTED (2026-10-10).  Vitor's green-ammonia project
 *  split by stage (DEV.md 4c C57) put two plant cases in the tree, each a
 *  copy of the base case with one thing changed: greenAmmoniaFeasibility
 *  (and its 50 bar variant) on the feasibility stage, greenAmmoniaBasicDesign
 *  on FEED.  The screening stage has no green-ammonia case: route screening
 *  is the route-screening EduTool, on methanol.  None of them is run by the
 *  page; they are linked, as every case here is. */
export interface FelStage {
  id: "screening" | "feasibility" | "feed" | "execution";
  /** The names the stage goes by, in the record's words. */
  names: string;
  /** The AACE class an estimate at the end of this stage carries. */
  aace: string;
  decides: string;
  fidelity: string;
  deliverables: string;
  /** What Choupo runs at this fidelity. */
  choupo: string;
  /** Bundled tutorials (no leading `tutorials/`) that run at this fidelity. */
  choupoCases: readonly string[];
  /** EduTools that teach this stage's work. */
  choupoTools: readonly string[];
  /** What a team produces at this stage that Choupo does not. */
  notChoupo: string;
}

export const FEL_STAGES: readonly FelStage[] = [
  {
    id: "screening",
    names: "Concept screening, appraisal (FEL-1 in a three-stage numbering)",
    aace: "5",
    decides: "Is there a process at all?  Which route?  Is it worth a study?",
    fidelity: "Block-level balances; yield (stoichiometric) or equilibrium "
      + "reactors; shortcut separations.",
    deliverables: "Block flow diagrams, started or preliminary.  No item is "
      + "sized: the estimate scales a whole reference plant.",
    choupo: "Routes screened on paper (the stoichiometric gross margin, the "
      + "equilibrium limit, the heat of reaction), and a loop balanced on a "
      + "declared conversion or at the thermodynamic ceiling.  Choupo carries "
      + "no cost here: Class 5's method is capacity factored, a whole plant "
      + "scaled from a reference one, and Choupo's costing is per item, which "
      + "is Class 4's method.",
    choupoCases: [
      "steady/reactors/screen01_methanol_routes",
      "plant/ammoniaStaged01_yield",
      "plant/ammoniaStaged02_equilibrium",
    ],
    choupoTools: ["route-screening", "reactor-ladder"],
    notChoupo: "A capacity-factored whole-plant estimate.",
  },
  {
    id: "feasibility",
    names: "Feasibility, pre-FEED (FEL-2 in a three-stage numbering)",
    aace: "4",
    decides: "Which of the shortlisted options; is it technically and "
      + "economically feasible; is there a budget case",
    fidelity: "A PFD-level flowsheet with its recycles converged; equilibrium "
      + "or approach-to-equilibrium reactors; shortcut or partly rigorous "
      + "columns; an assumed U on the exchangers.",
    deliverables: "PFDs and utility flow diagrams (started or preliminary), "
      + "preliminary equipment lists, a first heat and material balance "
      + "(started).",
    choupo: "Choupo's natural home.  A converged heat and material balance, "
      + "a specification sheet per sized item, an equipment-factored capital "
      + "cost (Turton) and a discounted-cash-flow appraisal.  The approach "
      + "loop sizes its converter from a declared space velocity.  The "
      + "green-ammonia feasibility case carries no exchanger network: every "
      + "duty is bought from a utility, the pinch pass gives the targets, and "
      + "the economics pass publishes the gross margin before and after the "
      + "energy is priced -- at 150 bar and, as a speculation, at 50 bar.  "
      + "The green-ammonia base case declares Class 4 too, and it is a "
      + "hybrid: a feasibility-stage converter (a Gibbs reactor 5 K short of "
      + "equilibrium) beside exchangers designed to the next stage's "
      + "fidelity.",
    choupoCases: [
      "plant/ammoniaStaged03_approach",
      "plant/greenAmmoniaFeasibility",
      "plant/greenAmmoniaFeasibility50bar",
      "plant/greenAmmoniaIndustrialN2",
    ],
    choupoTools: ["approach-to-equilibrium", "pinch-composite"],
    notChoupo: "Plot plans, the electrical one-line drawings, and the "
      + "estimating team's own risk analysis of the band.",
  },
  {
    id: "feed",
    names: "FEED, basic engineering (FEL-3 in both numberings)",
    aace: "3",
    decides: "Sanction.  What exactly is being bought, and at what cost",
    fidelity: "A rigorous, converged heat and material balance; rigorous or "
      + "rate-based stage models; the reactor on real kinetics where they "
      + "exist; the exchangers rated against geometry.",
    deliverables: "Approved-for-design P&IDs, essentially complete equipment "
      + "lists, equipment datasheets, hydraulics and line sizing, relief "
      + "studies.",
    choupo: "The PROCESS side of it: the catalyst bed on a cited rate law "
      + "with its volume solved by the engine, and the six exchangers of the "
      + "green-ammonia base case designed in detail (Gnielinski in the tubes, "
      + "Kern on the shell, the tube count found by the run).  The "
      + "green-ammonia basic-design case puts both in one plant: three "
      + "adiabatic beds on the rate law, interbed coolers raising steam, and "
      + "every exchanger designed.  "
      + "The cost beside them stays equipment-factored, which is a Class 4 "
      + "method, so a Choupo 'basic design' is FEL-3 in its process fidelity "
      + "and a study-type estimate in its cost.",
    choupoCases: [
      "plant/ammoniaStaged04_kinetic",
      "plant/greenAmmoniaBasicDesign",
      "plant/greenAmmoniaIndustrialN2",
    ],
    choupoTools: ["reactor-ladder", "entu"],
    notChoupo: "P&IDs, mechanical datasheets, relief studies, line sizing "
      + "across the plant, vendor quotations, and the semi-detailed unit "
      + "costs Class 3 is estimated by.",
  },
  {
    id: "execution",
    names: "Detailed design, EPC execution (FEL 4, Project Execution, in the "
      + "five-phase numbering; it is no longer the front end)",
    aace: "2 → 1",
    decides: "Nothing about the process; how to build it",
    fidelity: "The simulation is now a reference, revalidated against the "
      + "equipment the vendors selected.",
    deliverables: "Mechanical, electrical and civil drawings, vendor "
      + "quotations, isometrics, construction packages.",
    choupo: "Nothing, and deliberately: no part of the engine reads a vendor "
      + "quotation.",
    choupoCases: [],
    choupoTools: [],
    notChoupo: "All of it.",
  },
];

/** AACE 18R-97 Figure 4 (2005 revision), the two rows that answer which
 *  model belongs to which stage (record §2.2).  "—" not begun; S started;
 *  P preliminary; C complete.  Classes 5..1. */
export const DELIVERABLE_ROWS: ReadonlyArray<{ name: string;
  byClass: readonly [string, string, string, string, string] }> = [
  { name: "Block flow diagrams", byClass: ["S/P", "P/C", "C", "C", "C"] },
  { name: "Process flow diagrams (PFDs)", byClass: ["—", "S/P", "P/C", "C", "C"] },
  { name: "Heat & material balances", byClass: ["—", "S", "P/C", "C", "C"] },
  { name: "Piping & instrument diagrams (P&IDs)",
    byClass: ["—", "S", "P/C", "C", "C"] },
  { name: "Specifications & datasheets", byClass: ["—", "S", "P/C", "C", "C"] },
  { name: "Mechanical discipline drawings",
    byClass: ["—", "—", "S", "P", "P/C"] },
];
