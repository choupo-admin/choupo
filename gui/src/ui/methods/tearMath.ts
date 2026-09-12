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
  tearMath — the GRAPH construction behind choosing a tear, and a careful
  statement of what it is not.

  WHAT THE ENGINE DOES AND DOES NOT DO, because the whole page is about that
  division of labour.  Choupo executes the flattened units IN DECLARED ORDER
  and never topologically sorts them, and
  `Flowsheet::validateSequentialPlan`
  (src/unitOperations/flowsheet/Flowsheet.cpp:4330) validates that order
  against the declared tears before any state work.  It DETECTS every material
  cycle, names the chain it found, and refuses SEVEN ways by name — MISSING
  TEAR, INVALID ORDER, FORWARD TEAR, OFF-CYCLE TEAR, INLET TEAR, UNKNOWN TEAR,
  UNCONSUMED TEAR (src/unitOperations/flowsheet/Flowsheet.cpp:4420-4493) — and
  where the problem is the order it prints a valid one to paste
  (src/unitOperations/flowsheet/Flowsheet.cpp:4496-4527).  SEVEN and not six:
  CLAUDE.md 6's own summary of this contract lists six and omits UNCONSUMED
  TEAR, and the engine's own source is the authority.  What it will NOT do is CHOOSE the cut:
  `tearSelection auto` is named and deliberately deferred.  Cycle detection is
  the engine's job; tear choice is the author's.

  THE CONSEQUENCE THE TEXTBOOKS DO NOT DRAW, and it is what this module
  computes.  Because the solver walks the DECLARED order, an edge needs a cut
  exactly when it points BACKWARDS in that order — and the engine enforces
  both halves of that: a backward edge left undeclared refuses (MISSING TEAR
  when it closes a cycle, INVALID ORDER when it does not), and a FORWARD edge
  declared as a tear refuses too, in those words, because a forward stream
  needs no cut (:4466-4473).  So for a given order the admissible tear set is
  not a choice at all: IT IS EXACTLY THE SET OF BACKWARD EDGES.  Choosing the
  tear in Choupo means choosing the ORDER, and a graph's minimum tear set is
  reachable only if some order makes exactly those edges the backward ones.
  `judgePlan` and `bestOrder` below are that statement made computable.

  WHY THIS MODULE IS NOT A SECOND HOME FOR THE CONTRACT, which is the question
  to ask of any TypeScript that reasons about a Choupo case.  It never reads a
  Choupo case.  It operates on TEACHING GRAPHS declared below — named boxes
  and named arrows, no thermodynamics, no dicts — and answers the classical
  questions of the tear problem over them.  The ENGINE'S OWN contract is
  exercised on the page beside it, by running a real case with and without its
  tear declared and showing Choupo's own words verbatim.  If the two ever
  disagree, the engine is right and this file is wrong, and the page is
  arranged so a reader can see both at once.

  WHAT IS DELIBERATELY ABSENT.  No heuristic that RANKS candidate tears.  The
  fewest tears is cheap to compute and is NOT the same thing as the best
  choice — the criteria that matter (a stream whose composition barely moves
  round the loop, a stream the loop does not amplify, a stream whose state an
  author can actually guess) are facts about the plant, not about the graph,
  and nothing here can see them.  Inventing a ranking would put a number on
  the judgement the engine deliberately declines to make.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";

// ---- The teaching graph ----------------------------------------------------

export interface TeachUnit {
  /** As a flowsheetDict would name it. */
  name: string;
  /** The unit-operation type, for the box's caption. */
  kind: string;
}

export interface TeachEdge {
  /** The stream name. */
  name: string;
  /** Producing unit index, or null for a domain inlet. */
  from: number | null;
  /** Consuming unit index, or null for a domain outlet. */
  to: number | null;
}

export interface TeachGraph {
  id: string;
  label: string;
  /** One paragraph: what this flowsheet is and what it is here to show. */
  blurb: string;
  units: TeachUnit[];
  edges: TeachEdge[];
  /** How many components the stream table carries — it sets the COST of a
   *  cut, and nothing else about the graph. */
  nComponents: number;
  /** The unit order the case as written declares, as indices into `units`.
   *  The panel opens on it, and the tear set follows from it. */
  declaredOrder: number[];
}

/** An INTERNAL edge — one with a producer and a consumer — is the only kind
 *  that can be torn.  A domain inlet has no producer to disagree with and a
 *  domain outlet has no consumer waiting on it; the engine refuses both by
 *  name (INLET TEAR at :4446-4452, UNCONSUMED TEAR at :4457-4459). */
export const isInternal = (e: TeachEdge): boolean =>
  e.from !== null && e.to !== null;

export const TEACH_GRAPHS: readonly TeachGraph[] = [
  {
    id: "rsr",
    label: "Reactor - separator - recycle",
    blurb: "The architecture almost every plant has somewhere: react, "
      + "separate, and send the unconverted material back. One loop, one "
      + "edge to cut, and only one sensible place to cut it. This is the "
      + "shape of the real case running further down the page.",
    nComponents: 4,
    units: [
      { name: "mixer01", kind: "mixer" },
      { name: "reactor", kind: "cstr" },
      { name: "separator", kind: "isothermalFlash" },
      { name: "split01", kind: "splitter" },
    ],
    edges: [
      { name: "freshFeed", from: null, to: 0 },
      { name: "mixed", from: 0, to: 1 },
      { name: "reactorOut", from: 1, to: 2 },
      { name: "vapProd", from: 2, to: null },
      { name: "liqOut", from: 2, to: 3 },
      { name: "recycle", from: 3, to: 0 },
      { name: "liqProd", from: 3, to: null },
    ],
    declaredOrder: [0, 1, 2, 3],
  },
  {
    id: "shared",
    label: "Two loops sharing one edge",
    blurb: "A recycle round the whole train AND a shorter loop back from the "
      + "flash to the mixer. Two cycles, so as written it takes two tears — "
      + "and that is not the best this flowsheet can do. Both cycles run "
      + "through the mixer's outlet, so ONE cut would open both; the reason "
      + "the declared order cannot use it is that the edge points FORWARD, "
      + "and Choupo refuses a forward tear by name. Move the reactor above "
      + "the mixer and watch the tear count fall to one.",
    nComponents: 3,
    units: [
      { name: "mixer01", kind: "mixer" },
      { name: "reactor", kind: "pfr" },
      { name: "flash01", kind: "isothermalFlash" },
      { name: "column01", kind: "distillationColumn" },
      { name: "split01", kind: "splitter" },
    ],
    edges: [
      { name: "feed", from: null, to: 0 },
      { name: "toReactor", from: 0, to: 1 },
      { name: "toFlash", from: 1, to: 2 },
      { name: "vent", from: 2, to: null },
      { name: "toColumn", from: 2, to: 3 },
      { name: "product", from: 3, to: null },
      { name: "bottoms", from: 3, to: 4 },
      { name: "purge", from: 4, to: null },
      { name: "longRecycle", from: 4, to: 0 },
      { name: "shortRecycle", from: 2, to: 0 },
    ],
    declaredOrder: [0, 1, 2, 3, 4],
  },
  {
    id: "independent",
    label: "Two loops that share nothing",
    blurb: "Two recycles in series with no edge in common. Here no reordering "
      + "helps: opening both cycles takes two tears whatever order you "
      + "declare, and the panel will tell you so. The contrast with the "
      + "graph above is the point — whether one cut can do the work of two "
      + "is a property of the topology, and reordering is how you find out.",
    nComponents: 5,
    units: [
      { name: "mix1", kind: "mixer" },
      { name: "react1", kind: "cstr" },
      { name: "sep1", kind: "isothermalFlash" },
      { name: "mix2", kind: "mixer" },
      { name: "react2", kind: "cstr" },
      { name: "sep2", kind: "isothermalFlash" },
    ],
    edges: [
      { name: "feed", from: null, to: 0 },
      { name: "s1", from: 0, to: 1 },
      { name: "s2", from: 1, to: 2 },
      { name: "recycleA", from: 2, to: 0 },
      { name: "inter", from: 2, to: 3 },
      { name: "s3", from: 3, to: 4 },
      { name: "s4", from: 4, to: 5 },
      { name: "recycleB", from: 5, to: 3 },
      { name: "product", from: 5, to: null },
    ],
    declaredOrder: [0, 1, 2, 3, 4, 5],
  },
];

// ---- Cycles ----------------------------------------------------------------

/** One elementary cycle, as the sequence of EDGE names that closes it.  Edge
 *  names rather than unit names because a tear cuts an edge, and two units
 *  may be joined by more than one stream. */
export interface Cycle {
  /** The edges traversed, in order. */
  edges: string[];
  /** The units visited, in order — for naming the cycle the way the engine
   *  does ("mixer01 -> reactor -> separator -> split01 --recycle--> mixer01"). */
  units: string[];
}

/** Every elementary cycle of the unit graph, found by depth-first search from
 *  each unit in turn and keeping only the cycles whose lowest-numbered unit is
 *  the one it started from — the standard way of enumerating each cycle once.
 *  These graphs have a handful of units, so nothing cleverer is warranted. */
export function cyclesOf(g: TeachGraph): Cycle[] {
  const out: Cycle[] = [];
  const n = g.units.length;
  const outEdges: TeachEdge[][] = Array.from({ length: n }, () => []);
  for (const e of g.edges)
    if (isInternal(e)) outEdges[e.from as number]!.push(e);

  const walk = (start: number, at: number, path: TeachEdge[],
    seen: Set<number>): void => {
    for (const e of outEdges[at] ?? []) {
      const nxt = e.to as number;
      if (nxt === start) {
        out.push({
          edges: [...path, e].map((x) => x.name),
          units: [...path.map((x) => g.units[x.from as number]!.name),
            g.units[at]!.name],
        });
        continue;
      }
      if (nxt < start || seen.has(nxt)) continue;
      seen.add(nxt);
      walk(start, nxt, [...path, e], seen);
      seen.delete(nxt);
    }
  };
  for (let s = 0; s < n; ++s) walk(s, s, [], new Set([s]));
  return out;
}

// ---- Judging a PLAN: an order, and the tears it forces ---------------------

/** One backward edge of a declared order, with the only question that decides
 *  what it is: does it close a real cycle?
 *
 *  A backward edge ON a cycle is a genuine recycle and MUST be declared a
 *  tear.  A backward edge on NO cycle is a declaration-order mistake — the
 *  producer simply runs too late — and declaring it a tear would compensate a
 *  mistake with an artificial iteration, which the engine refuses in those
 *  words (OFF-CYCLE TEAR, :4480-4485). */
export interface BackwardEdge {
  name: string;
  producer: string;
  consumer: string;
  onCycle: boolean;
  /** The cycle it closes, for naming it the way a refusal does. */
  cycle: Cycle | null;
}

export interface PlanVerdict {
  /** Every backward edge of this order, in the order the edges are declared. */
  backward: BackwardEdge[];
  /** The tears this order FORCES: the backward edges that close a cycle.  Not
   *  a choice — declare fewer and the engine refuses MISSING TEAR, declare a
   *  forward stream as well and it refuses FORWARD TEAR. */
  tears: string[];
  /** Backward edges that close no cycle: order mistakes, not recycles. */
  orderMistakes: BackwardEdge[];
  /** True when the order can be walked: every backward edge is a real
   *  recycle, so the tears above are a complete and admissible plan. */
  valid: boolean;
  /** Tear VARIABLES this plan costs, per solver.  Wegstein packs
   *  (F, z_1..z_Nc, T) per torn stream and Newton packs (F_1..F_Nc, T). */
  variablesWegstein: number;
  variablesNewton: number;
  /** Sweeps ONE Newton step costs to build its central-difference Jacobian:
   *  two full flowsheet passes per tear variable.  A Wegstein step costs one
   *  sweep whatever the size of the vector — the trade the page is about. */
  sweepsPerNewtonStep: number;
}

/** Position of each unit in a declared order. */
const positions = (order: readonly number[]): Map<number, number> => {
  const p = new Map<number, number>();
  order.forEach((u, i) => p.set(u, i));
  return p;
};

export function judgePlan(
  g: TeachGraph, order: readonly number[],
): PlanVerdict {
  const pos = positions(order);
  const cycles = cyclesOf(g);
  const backward: BackwardEdge[] = [];
  for (const e of g.edges) {
    if (!isInternal(e)) continue;
    const p = pos.get(e.from as number) ?? 0;
    const c = pos.get(e.to as number) ?? 0;
    //  `c <= p` and not `c < p`: a unit consuming its own output is a genuine
    //  one-unit cycle, and the engine counts it as backward for that reason
    //  (src/unitOperations/flowsheet/Flowsheet.cpp:4468-4471).
    if (c > p) continue;
    const cyc = cycles.find((y) => y.edges.includes(e.name)) ?? null;
    backward.push({
      name: e.name,
      producer: g.units[e.from as number]!.name,
      consumer: g.units[e.to as number]!.name,
      onCycle: cyc !== null,
      cycle: cyc,
    });
  }
  const tears = backward.filter((b) => b.onCycle).map((b) => b.name);
  const orderMistakes = backward.filter((b) => !b.onCycle);
  const varsNewton = tears.length * (g.nComponents + 1);
  return {
    backward, tears, orderMistakes,
    valid: orderMistakes.length === 0,
    variablesWegstein: tears.length * (g.nComponents + 2),
    variablesNewton: varsNewton,
    sweepsPerNewtonStep: 2 * varsNewton,
  };
}

export interface BestOrder {
  /** The fewest tears any VALID declaration order of this flowsheet needs. */
  fewest: number;
  /** One order achieving it.  There may be several and this is only one; the
   *  page says so rather than calling it "the" answer. */
  order: number[];
  /** The tears that order forces. */
  tears: string[];
  /** How many of the orders searched were valid at all — an order mistake is
   *  far commoner than a reader expects, which is the point of printing it. */
  validOrders: number;
  ordersSearched: number;
}

/** THE FEWEST TEARS ANY ORDER CAN ACHIEVE, by exhaustive search.
 *
 *  These graphs have at most six units, so 720 permutations is the whole
 *  search and no algorithm is warranted.  It is exhaustive on purpose: a
 *  heuristic answer here would be a number a reader could not check, on a
 *  page whose subject is a decision the engine refuses to take for them. */
export function bestOrder(g: TeachGraph): BestOrder {
  const n = g.units.length;
  let fewest = Number.POSITIVE_INFINITY;
  let order: number[] = [...g.declaredOrder];
  let tears: string[] = [];
  let validOrders = 0, ordersSearched = 0;

  const perm = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) {
      ++ordersSearched;
      const v = judgePlan(g, acc);
      if (!v.valid) return;
      ++validOrders;
      if (v.tears.length < fewest) {
        fewest = v.tears.length;
        order = [...acc];
        tears = [...v.tears];
      }
      return;
    }
    for (let i = 0; i < rest.length; ++i)
      perm([...rest.slice(0, i), ...rest.slice(i + 1)],
        [...acc, rest[i] as number]);
  };
  perm(Array.from({ length: n }, (_, i) => i), []);
  if (!Number.isFinite(fewest)) fewest = judgePlan(g, g.declaredOrder).tears.length;
  return { fewest, order, tears, validOrders, ordersSearched };
}

/** The engine's own way of naming a cycle in a refusal, reproduced so the
 *  construction and the run beside it read in one vocabulary
 *  (src/unitOperations/flowsheet/Flowsheet.cpp:4393-4402). */
export function cycleString(c: Cycle, tearStream: string): string {
  return `${c.units.join(" -> ")} --${tearStream}--> ${c.units[0] ?? ""}`;
}

// ---- Plane A: the engine's own contract, run -------------------------------

/** The same flowsheet as the `rsr` graph above, as a real case. */
export const TEAR_WITNESS = "steady/flowsheets/process03_recycle";
export const TEAR_SOLVER_DICT = "system/solverDict";
export const TEAR_DECLARED = "recycle";

/** WITHDRAW THE TEAR DECLARATION, and let the engine say what it says.
 *
 *  A knob on this page may not add, delete or re-nest a dict block — that is
 *  the standing rule of `methodRun`, and a GUI that assembles blocks has
 *  become an editor.  What it MAY do is rename a declared key in place, which
 *  is exactly the edit a reader would make with a text editor to try the case
 *  without its tear: the list is still there, the engine no longer reads it,
 *  and the plan is the one the author would have written if they had
 *  forgotten to declare the cut.  The engine then refuses with MISSING TEAR,
 *  names the cycle it found and names the declaration that would close it. */
export function withdrawTearOverrides(): DictOverride[] {
  return [{ file: TEAR_SOLVER_DICT, from: "tearStreams", to: "tearStreamsOff" }];
}

/** The engine's own findings, lifted out of a run's log verbatim.
 *
 *  Verbatim is the point: these sentences are the contract, they carry the
 *  cycle the engine found and the remedy it recommends, and paraphrasing them
 *  here would be a second home for a refusal message.  The prefixes are the
 *  engine's own words (src/unitOperations/flowsheet/Flowsheet.cpp:4420-4493)
 *  and the leading sentence is at :2744-2749. */
const FINDING_WORDS = [
  "MISSING TEAR", "INVALID ORDER", "FORWARD TEAR", "OFF-CYCLE TEAR",
  "INLET TEAR", "UNKNOWN TEAR", "UNCONSUMED TEAR", "DUPLICATE unit name",
  "A valid declaration order",
];

export function planFindings(log: string | null | undefined): string[] {
  if (!log) return [];
  return log.split("\n").map((l) => l.trim())
    .filter((l) => FINDING_WORDS.some((w) => l.startsWith(w)));
}

/** The engine ANNOUNCING a valid plan: `[plan] material recycle: tear 'x'
 *  cuts A -> B --x--> A`, printed at verbosity 2 and above
 *  (src/unitOperations/flowsheet/Flowsheet.cpp:4543-4544).  A valid recycle
 *  shows its cut; it is never implicit. */
export function planAnnouncements(log: string | null | undefined): string[] {
  if (!log) return [];
  return log.split("\n").map((l) => l.trim())
    .filter((l) => l.startsWith("[plan] material recycle"));
}
