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
  interiorPointLesson -- "How does an interior-point method find the minimum?".

  The task it serves, in one sentence: a student who meets `model interiorPoint;`
  in a Gibbs reactor, or reads an `ipLog.csv`, wants to see WHAT the method does
  each iteration -- stay inside the rules, push away from the walls with a
  cushion that slowly deflates, keep a list of points it must not be worse than,
  stiffen the step when the ground curves the wrong way -- without algebra.

  THE AUDIENCE IS A STUDENT WITH WEAK ALGEBRA (the owner's direction, 2026-11-25),
  so every card is a PICTURE and one plain sentence first, then at most one short
  formula glossed symbol by symbol, then where Choupo does it (file:line), then
  ONE question answerable from the picture.  Everyday words come first (cushion,
  list of not-worse-than, first get back inside the rules, bowl and saddle) and
  the technical word (barrier, filter, restoration, inertia correction) is given
  once.  No matrix algebra is on this page: the KKT system, the inertia and the
  LDL^T are named and explained by what they DO, and the algebra lives in
  `linear-algebra-without-pain` (linearAlgebraLesson.ts).

  WHERE EVERY NUMBER CAME FROM.  Every number is a RECORDED engine run, written
  by bin/curate/interior_point_edutool_table.py to
  gui/src/case/interiorPointRecorded.json: the live trace of the Hock-Schittkowski
  test binary (test/interior_point_hs.cpp, `--iterates` for the path in x) and
  the Gibbs reactor of tutorials/steady/gibbs/gibbs14_interior_point with its
  ipLog.csv; the polish table of review R1 is the gate
  check_gibbs_interior_point's own `--table`.  The page does plain arithmetic on
  them only where it says so (a distance to a wall, a quotient, a maximum).

  WHAT THE TRACE DOES NOT HOLD: the line search's REJECTED trials.  A row
  records the accepted trial and `ls`, how many trials it took.  The page draws
  the accepted sequence and says so.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
import recorded from "../../case/interiorPointRecorded.json";

// ---- the recorded runs, typed ------------------------------------------------

export interface IPEvent { kind: string; text?: string; dw?: number; dc?: number; got?: number[]; wanted?: number[] }
export interface IPRow {
  it: number; mu: number; phi: number; theta: number; infDu: number; compl: number; dx: number;
  dw: number; dc: number; inertia: number[]; aPr: number; aDu: number; ls: number; type: string;
  filter: number; events: IPEvent[];
}
export interface IPRun {
  rows: IPRow[]; start: number[] | null; path: number[][]; x: number[] | null;
  iterations?: number; inertiaCorrections?: number; restorations?: number; factorisations?: number;
  activeBound?: { variable: string; at: number; z: number };
  f?: number; fStar?: number;
}
export interface R1Row {
  case: string; variant: string; amount: number; species: string; pi: number; bridge: number;
  dT: number; it: number; polish: number;
}

const hs = recorded.hs as unknown as Record<string, IPRun>;
export const HS21: IPRun = hs["HS21"] as IPRun;
export const WB2000: IPRun = hs["WB2000"] as IPRun;
export const HS6: IPRun = hs["HS6"] as IPRun;
export const HS7: IPRun = hs["HS7"] as IPRun;
export const HS38: IPRun = hs["HS38"] as IPRun;
export const HS116 = recorded.hs116;
export const GIBBS = recorded.gibbs14 as unknown as {
  iterations: Record<string, number>[]; bridge: Record<string, number>;
  amounts: Record<string, number>; polish: Record<string, number>; kpis: Record<string, number>;
};
export const R1_ROWS = (recorded.r1 as unknown as { rows: R1Row[] }).rows;
export const PROVENANCE = recorded.provenance;

// ---- the page's plain arithmetic on the recorded numbers ---------------------

/** The points of the path: iterate 0 (the start the run pushed inside its walls) then one per row. */
export function iterates(run: IPRun): number[][] {
  return [run.start ?? [], ...run.path];
}

/** HS21's wall is x1 >= 2; the distance of every iterate from it (page arithmetic: x1 - 2). */
export function wallDistances(run: IPRun): number[] {
  const wall = run.activeBound?.at ?? 0;
  return iterates(run).map((p) => (p[0] ?? 0) - wall);
}

/** The cushion's push at the last row: mu divided by the distance (page arithmetic). */
export function lastPush(run: IPRun): number {
  const d = wallDistances(run);
  const last = run.rows[run.rows.length - 1];
  return (last?.mu ?? 0) / (d[d.length - 1] ?? 1);
}

/** Rows where the run changed mu: the distinct mu values, in order. */
export function muLadder(run: IPRun): number[] {
  const out: number[] = [];
  for (const r of run.rows) if (out.length === 0 || out[out.length - 1] !== r.mu) out.push(r.mu);
  return out;
}

/** Page arithmetic: a filter corner is the iterate, a hair down and left (gammas of IPParameters.H:68-69). */
export const GAMMA = 1.0e-5;
export function corner(theta: number, phi: number): [number, number] {
  return [(1 - GAMMA) * theta, phi - GAMMA * theta];
}

/** The Algorithm IC attempts of a run: per iteration, the stiffness tried and the count it got. */
export function attemptRows(run: IPRun): { it: number; attempts: IPEvent[]; settled: number }[] {
  return run.rows
    .filter((r) => r.events.some((e) => e.kind === "attempt"))
    .map((r) => ({ it: r.it, attempts: r.events.filter((e) => e.kind === "attempt"), settled: r.dw }));
}

/** The largest stiffness any iteration of the run settled on. */
export function largestDw(run: IPRun): number {
  return Math.max(...run.rows.map((r) => r.dw));
}

/** The finishing correction of one barrier variant (page arithmetic over the recorded rows):
 *  how many rows, how many are within the gate's 1e-6, the largest, and the rows above it. */
export function r1Summary(variant: string): { n: number; within: number; max: number; above: string[] } {
  const rows = R1_ROWS.filter((r) => r.variant === variant);
  return {
    n: rows.length,
    within: rows.filter((r) => r.polish <= 1e-6).length,
    max: Math.max(...rows.map((r) => r.polish)),
    above: rows.filter((r) => r.polish > 1e-6).map((r) => r.case),
  };
}

/** The case name without the variant tag. */
export const r1Case = (r: R1Row): string => r.case.replace(" [everyAmount]", "");

export const sci = (x: number): string => (x === 0 ? "0" : x.toExponential(1));

// ---- the lesson -------------------------------------------------------------

export const IPM_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A cushion along every wall",
    body: "Picture a ball rolling downhill inside a room, and the lowest point of the floor is right at a wall. "
      + "The method never lets the ball touch the wall: it puts a soft cushion along every wall that pushes the ball back toward the middle, "
      + "and the closer the ball gets, the harder the cushion pushes. Then, round by round, the cushion deflates, so the ball creeps "
      + "closer to the wall and finally rests against it. The technical word for the cushion is the barrier. "
      + "Below, the engine's own run on a two-variable problem whose answer is on a wall.",
    formula: String.raw`\varphi_{\mu}(x) = f(x) - \mu \sum_{i} \ln s_i`,
    where: [
      { sym: "\\varphi_{\\mu}", means: "the cushioned height: what the method actually tries to lower at each stage" },
      { sym: "x", means: "the unknowns of the problem: the position of the ball" },
      { sym: "f", means: "the height of the real floor, the thing you want to make small" },
      { sym: "\\mu", means: "the cushion's strength; it starts at 0.1 in Choupo and is made smaller each round" },
      { sym: "\\sum", means: "add the same term for every wall" },
      { sym: "\\ln", means: "the natural logarithm: it grows without limit as its argument goes to zero, so the cushion pushes infinitely hard at the wall" },
      { sym: "s_i", means: "how far the ball is from wall i (the slack)", unit: "same unit as x" },
    ],
    note: "In the engine the cushioned height is the column phi_mu of the trace (IPTrace.H:40, in src/solver/ip/), and the cushion is made smaller by the rule of BarrierUpdate.cpp:47 -- first by a fifth, then faster.",
  },
  {
    n: 2,
    title: "A list of points you must not be worse than",
    body: "A step can go wrong in two ways: it can break the rules more, or it can leave the floor higher. The method keeps a short "
      + "list of old points and turns down a new point that is worse than one on the list in BOTH ways at once; the technical word for the list is the filter. "
      + "Each dot below is an iterate, placed by how much it breaks the rules (left is better) and how high it is (down is better). "
      + "If no step at all is acceptable, the method does not give up: it first gets back inside the rules, "
      + "ignoring the height, and then resumes (the technical word is restoration).",
    formula: String.raw`\big(\theta_{c},\ \varphi_{c}\big) = \big((1-\gamma_{\theta})\,\theta_{k},\ \ \varphi_{k} - \gamma_{\varphi}\,\theta_{k}\big)`,
    where: [
      { sym: "\\theta_{c}", means: "how much rule-breaking the new corner allows" },
      { sym: "\\varphi_{c}", means: "how high the new corner allows the cushioned height to be" },
      { sym: "\\gamma_{\\theta}", means: "a tiny margin, 1e-5, so a point must beat the corner by a hair" },
      { sym: "\\theta_{k}", means: "how much the current point breaks the rules (the sum of the sizes of the broken equalities)" },
      { sym: "\\gamma_{\\varphi}", means: "the same tiny margin, 1e-5, on the height" },
      { sym: "\\varphi_{k}", means: "the cushioned height of the current point" },
    ],
    note: "The corner is added in Globalization.cpp:63. Reading it: the corner is the current point itself, moved a hair toward better in both directions. The trace keeps only the accepted trial of each iteration and the number of trials it took (the ls column); the rejected trials are not recorded.",
  },
  {
    n: 3,
    title: "Is the ground curved the right way?",
    body: "To choose a step, the method goes to the bottom of the bowl that the ground around it makes. "
      + "If the ground is a saddle, going up in some directions and down in others, the bottom is a trap and the step would slide uphill. So it counts how many directions go up and how many go down "
      + "(the technical word for the count is the inertia; the algebra behind it is in Linear algebra without pain, and is not needed here). If the count is wrong, it adds stiffness "
      + "to the ground, a little at a time, until the ground is a bowl again. A stiffness of zero means the ground was fine.",
    formula: String.raw`H_{\mathrm{used}} = H + \delta_{w}\, I`,
    where: [
      { sym: "H_{\\mathrm{used}}", means: "the curvature the step is actually computed from" },
      { sym: "H", means: "how the ground curves around the current point (the second derivatives), as the problem gives it" },
      { sym: "\\delta_{w}", means: "the stiffness added: zero if the ground is already a bowl, and larger by a fixed factor each failed try" },
      { sym: "I", means: "the identity matrix: it just adds the same stiffness in every direction" },
    ],
    note: "The count is made by the factorisation in DenseLDLT.cpp:73 and the stiffness ladder is Algorithm IC, InertiaCorrection.cpp:129-142; the line that prints each failed try (\"inertia ... wanted ...\") is InertiaCorrection.cpp:88.",
  },
  {
    n: 4,
    title: "The price tags: what the reactor gets for free",
    body: "In the Gibbs reactor the unknowns are the amounts of each species, the rule is that the atoms of each element are conserved, and the floor is the Gibbs energy. "
      + "Holding an element's atom count fixed has a price: how much the Gibbs energy would fall if one more atom were allowed. The interior-point method hands over that price for every element as a by-product; "
      + "it is the element potential that the older element-potential method solves for, up to a sign. Below, the engine's recorded run of gibbs14: the cushion "
      + "deflating, and the two price lists side by side.",
    formula: String.raw`\pi_{e} = -\lambda_{e}`,
    where: [
      { sym: "\\pi_{e}", means: "the element potential of element e: the price of one more atom of e, in the optimizer's scaled units" },
      { sym: "\\lambda_{e}", means: "the multiplier the interior-point method finds for the atom balance of element e (its sign is the optimizer's convention)" },
      { sym: "e", means: "an element of the reactor: C, H or O in gibbs14" },
    ],
    note: "The sign flip is InteriorPointGibbs.cpp:303, and the case's `interiorPoint { log ipLog.csv; }` writes the table below.",
  },
  {
    n: 5,
    title: "Why a mixture needs no cushion",
    body: "A cushion is only needed where nothing else stops the ball at the wall. In a mixture something else does: the entropy of mixing. "
      + "Near zero amount, adding a little of any species lowers the Gibbs energy ever more steeply, so the minimum is never exactly at zero: the mixture pushes itself off the wall. "
      + "The method therefore puts the cushion only on the phase that CAN vanish (the liquid water in gibbs14). A cushion on every amount is an option, and it leaves a trace species wrong by about the cushion's strength over the push it feels, "
      + "so a finishing correction is needed. The table shows how big that correction was in each case.",
    formula: String.raw`\frac{d}{dn_{i}}\Big[n_{i}\ln\frac{n_{i}}{N}\Big] = \ln\frac{n_{i}}{N} + 1 \ \longrightarrow\ -\infty \quad (n_{i}\to 0)`,
    where: [
      { sym: "d", means: "a tiny change of what follows: the formula is the slope of the entropy term when the amount of species i is nudged" },
      { sym: "n_{i}", means: "the amount of species i in the phase", unit: "mol/s" },
      { sym: "N", means: "the total amount of the phase", unit: "mol/s" },
      { sym: "\\ln", means: "the natural logarithm: very negative for a very small number" },
    ],
    note: "The choice is the word `barrier` of the case's interiorPoint block, read at InteriorPointGibbs.cpp:512, and the gas species are declared guard-only at InteriorPointGibbs.cpp:99.",
  },
  {
    n: 6,
    title: "When a published answer is not the answer",
    body: "A published test collection lists, for problem HS116, an optimum of 97.5884089805. Choupo's run, checked line by line against the problem as written, ends lower, at 97.5875096, and the "
      + "collection's own point sits strictly inside every rule by about two parts in ten million: it is a timid point, not the minimum. The lesson for a student: a tabulated answer is a "
      + "claim, not a fact, and a method is held to the rules and the tolerance of the problem as stated, not to a number in a book. The evidence is in the Theory Guide.",
    note: "The test binary compares with 97.5875096 (test/interior_point_hs.cpp, rule stated in its HS116 comment) and the Theory Guide section sec:ip-hs-own-rules records how the transcription was checked.",
  },
];


/** The ONE question each card ends with, answerable from its picture (the quiz reuses their subjects). */
export const IP_ASKS: Readonly<Record<number, string>> = {
  1: "When the cushion is very weak, how close to the wall can the ball be?",
  2: "At iteration 8 the line search needed 21 trials; what did the run do next?",
  3: "In HS6 the first try, with no stiffness, counted one direction up and two down while the run wanted two up and one down; did the engine take that step?",
  4: "The multipliers the optimizer returns and the element potentials the finishing Newton found are the same numbers with opposite signs; why does the run print both?",
  5: "Find the largest change in the table: in which column is it, and what does it say about a cushion on the trace species?",
  6: "The lower value is the better minimum only if the point is still allowed; what did the check of the collection's point against the rules show?",
};

export const IP_LIMITS: readonly LessonLimit[] = [
  { id: "recorded", title: "Every number is a recorded run",
    body: "The page runs no optimiser in your browser. The traces are recorded from native runs by bin/curate/interior_point_edutool_table.py; the level curves, the distances to the wall and the maxima are this page's arithmetic on those numbers, and say so." },
  { id: "rejected-trials", title: "Rejected trials are not recorded",
    body: "The engine's trace holds the accepted trial of each iteration and how many trials the line search needed (ls). The trials that were thrown away are not in the record, so the filter picture shows the accepted sequence and the corners it left, never a rejected point." },
  { id: "small-problems", title: "Small test problems, one reactor",
    body: "The path and the filter are drawn on two test problems of a standard collection (two and three unknowns) and the Gibbs reactor is one case with four species. A real flowsheet problem has the same steps with many more unknowns, which no picture can show." },
  { id: "no-algebra", title: "The algebra is not here",
    body: "The page says what the factorisation counts, not how it counts. For the linear algebra, open Linear algebra without pain." },
  { id: "dense", title: "This is the dense version",
    body: "The engine's interior point uses dense matrices and the monotone rule for the cushion, and has neither the second-order correction nor an adaptive cushion; a reference implementation of Wächter and Biegler's method has more options." },
];

// ---- the claims about Choupo, read back by the test -------------------------

/** Every file:line the page names, with a fragment that line must contain. */
export const CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "src/solver/ip/IPTrace.H", line: 40, contains: "phi_mu   barrier objective" },
  { file: "src/solver/ip/BarrierUpdate.cpp", line: 47, contains: "std::pow(mu, p_.thetaMu)" },
  { file: "src/solver/ip/Globalization.cpp", line: 63, contains: "corners_.emplace_back((1.0 - p_.gammaTheta) * theta" },
  { file: "src/solver/ip/IPParameters.H", line: 68, contains: "scalar gammaTheta" },
  { file: "src/solver/ip/IPParameters.H", line: 69, contains: "scalar gammaPhi" },
  { file: "src/solver/ip/InteriorPoint.cpp", line: 524, contains: 'trace_.event("restoration entered: "' },
  { file: "src/solver/ip/DenseLDLT.cpp", line: 73, contains: "Inertia DenseLDLT::factor" },
  { file: "src/solver/ip/InertiaCorrection.cpp", line: 88, contains: "if (r.inertia != wanted)" },
  { file: "src/solver/ip/InertiaCorrection.cpp", line: 129, contains: "const bool noneBefore = dwLast_ == 0.0;" },
  { file: "src/solver/ip/InertiaCorrection.cpp", line: 142, contains: "dw *= noneBefore ? p_.kappaWPlusBar : p_.kappaWPlus;" },
  { file: "src/unitOperations/reactor/gibbsMethod/InteriorPointGibbs.cpp", line: 99, contains: "bool isGuardOnly(std::size_t i) const override" },
  { file: "src/unitOperations/reactor/gibbsMethod/InteriorPointGibbs.cpp", line: 303, contains: "piIP[j] = -lambda[j];" },
  { file: "src/unitOperations/reactor/gibbsMethod/InteriorPointGibbs.cpp", line: 512, contains: 'lookupWordOrDefault("barrier", "condensedPhases")' },
  { file: "test/interior_point_hs.cpp", line: 100, contains: "bool g_printIterates = false;" },
];

/** Case directories the page names; each must exist and carry a controlDict. */
export const IP_CASES: readonly string[] = ["tutorials/steady/gibbs/gibbs14_interior_point"];

/** Theory Guide labels the page names; each must exist in docs/theoryGuide.tex. */
export const IP_LABELS: readonly string[] = [
  "sec:ip-barrier", "sec:ldlt-inertia", "sec:ip-inertia", "sec:ip-filter", "sec:ip-restoration",
  "sec:ip-barrier-update", "sec:gibbs-interior-point", "sec:ip-hs-own-rules",
];

// ---- the quiz ---------------------------------------------------------------

export const IPM_QUIZ: readonly QuizQuestion[] = [
  {
    id: "cushion-push", steps: [1],
    q: "At the end of the HS21 run, the cushion's strength divided by the distance to the wall is about 0.04. What does the engine print for the push the wall needs?",
    options: [
      "About 0.04: the multiplier of the wall, which the cushion's strength divided by the distance predicts",
      "About 1e-8, the tolerance",
      "About 2, the position of the wall",
      "It cannot be read: the cushion leaves no number behind",
    ],
    correct: 0,
    feedback: "The run prints the wall's multiplier z = 0.04. The cushion's strength times one over the distance equals it at the end, which is how a weak cushion still holds the ball: a very small strength over a very small distance.",
    origins: ["engine", "page"],
  },
  {
    id: "filter-corner", steps: [2],
    q: "An iterate improves how high it is but breaks the rules slightly more than the old point. What does the filter do with it?",
    options: [
      "Turns it down: only points that improve both are ever accepted",
      "Accepts it and ignores it afterwards",
      "Accepts it when it beats a corner in at least one way by the margin, and adds a corner, so the method can never return to the old point",
      "Accepts it and restarts the run",
    ],
    correct: 2,
    feedback: "An iterate that improves either measure by the margin is accepted, and the old point becomes a corner of the list; the list turns down a point worse than a corner in both ways. That prevents going round in circles.",
    origins: ["page"],
  },
  {
    id: "restoration", steps: [2],
    q: "In the recorded WB2000 run, iteration 8 needed 21 trials of the line search and then entered the restoration phase. What is that phase for?",
    options: [
      "To get back inside the rules first, ignoring the height, and then resume the normal steps",
      "To make the cushion stronger",
      "To restart from the original start",
      "To add stiffness to the ground",
    ],
    correct: 0,
    feedback: "Restoration is the 'first get back inside the rules' phase: when no step is acceptable, the method looks only at how much it breaks the rules. The next row of the trace shows the rule-breaking down from 0.99 to 0.38 and then 8e-5.",
    origins: ["engine"],
  },
  {
    id: "bowl-saddle", steps: [3],
    q: "In HS6 the first try with no stiffness counted one direction up and two down, and the run wanted two up and one down. What does the engine do?",
    options: [
      "Takes the step anyway and hopes",
      "Stops with an error",
      "Adds stiffness in growing amounts until the count is the wanted one, then takes the step",
      "Makes the cushion weaker",
    ],
    correct: 2,
    feedback: "A wrong count means the ground is a saddle at the point, so a step to its 'bottom' would go uphill. The engine adds stiffness (0.0001, then 0.01, then 1 in this run) until the count is right: the recorded events show each failed try.",
    origins: ["engine"],
  },
  {
    id: "prices", steps: [4],
    q: "In the gibbs14 run, what do the multipliers of the atom balances turn out to be?",
    options: [
      "The amounts of the species",
      "The element potentials with the opposite sign: the price of one more atom of each element",
      "The cushion's strengths",
      "The step lengths",
    ],
    correct: 1,
    feedback: "The element potential and the multiplier are the same quantity in two sign conventions: the page prints both side by side, and the finishing Newton reproduces the potentials from the minus of the multipliers.",
    origins: ["engine"],
  },
  {
    id: "no-cushion-mixture", steps: [5],
    q: "Why does the default Gibbs interior point put no cushion on the gas species?",
    options: [
      "Gases never reach zero amount in a reactor",
      "Because a cushion is not allowed on gases",
      "To save computing time",
      "The entropy of mixing already pushes a species away from zero, and an extra cushion would leave trace species wrong by about the cushion's strength over its push",
    ],
    correct: 3,
    feedback: "The slope of n ln(n/N) goes to minus infinity as n goes to zero, so the mixture has its own wall-pusher. A cushion on top costs accuracy on the trace species; the recorded table shows the finishing correction growing by many orders when the cushion is put on every amount.",
    origins: ["engine", "page"],
  },
  {
    id: "book-answer", steps: [6],
    q: "Choupo's run on HS116 ends lower than the collection's published optimum. Why does the page trust the run?",
    options: [
      "Because the run is Choupo's",
      "Because the published point lies strictly inside every rule, by about 2e-7, so it is not the minimum of the problem as stated",
      "Because lower is always better",
      "Because the collection is always wrong",
    ],
    correct: 1,
    feedback: "The published point leaves a small margin inside every active rule; the run, which is allowed to use that margin, ends lower while meeting the rules to 1e-11. A lower value is only better if it is still allowed, and the check showed that it is.",
    origins: ["engine"],
  },
];
