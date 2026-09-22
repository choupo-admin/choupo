/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * drillSeed -- what a drilled sub-case is handed from the run it came out of.
 *
 * WHY THIS EXISTS.  Vítor ran the flagship plant, drilled into `LOOP/Converter`
 * to do a sensitivity study on the converter alone, and the run failed:
 *
 *     ERROR: Flowsheet: input stream 'Feed' not in registry
 *
 * A DIGNIFIED UNIT FOLDER IS NOT A STANDALONE CASE.  Of the flagship's 24
 * `.cho` markers exactly one -- the root -- sits beside a `controlDict` and a
 * `0/` tree; the four sectors and the nineteen unit folders carry topology and
 * nothing else, because a unit's own folder is a PART of its parent case
 * (the 2026-06-08 ruling that any unit is entitled to its own `system/` and
 * `constant/`).  Drilled, such a folder has no initial state at all.
 *
 * THE RECEIVING HALF WAS ALREADY BUILT AND UNREACHABLE.  `store.bootCase`
 * reads two stashes -- `?feeds=` (stable: frozen `0/` state per stream) and
 * `?inherit=` (one-shot: the parent's run, sliced to this scope) -- and its
 * own comment names `FlowCanvas.openInNewWindow` as the writer.  That writer
 * had been removed, on a premise written into its comment:
 *
 *     "Its stream STATE lives in its 0/ (the plant run materialised it)"
 *
 * The plant run materialises no such thing.  `SolutionWriter` writes
 * `converged/` at the case root, with the sector geography inside it; it does
 * not write a `0/` into a unit's own folder, and it never did.  So a reader
 * waited for a writer that had been retired in favour of a mechanism that
 * does not exist, and a drilled tab could only fail.
 *
 * *A reader with no writer is not half a feature; it is a feature that is
 * absent while looking present.*
 *
 * WHAT IS SEEDED, AND WHY EXACTLY THAT.  Not the parent's whole state: the 0/
 * completeness contract counts streams, so a foreign file ORPHANS and the
 * case refuses.  The seed is the sub-case's OWN declared streams
 * (`localStreamNames`), and nothing else, resolved against the parent's run
 * through the parent's OWN CONNECTIONS -- because a drilled leaf names its
 * ports locally.  The converter's dict says `boundary { inlets ( Feed ); }`
 * while the sector that wires it says `PreheatedFeed { to Converter/Feed; }`,
 * so `Feed` must be found in the parent under the name `PreheatedFeed`.
 * Matching by leaf or by similarity would freeze the WRONG stream's numbers
 * into the child's state, which is worse than failing.
 *
 * THE SEED IS A SEED.  It is the state the child STARTS from, exactly as an
 * authored `0/` would be -- the child re-solves from it on Run.  A `0/` the
 * sub-case already carries always wins, so a unit folder that grows its own
 * authored state is untouched by any of this.
 */
import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import { readEdges } from "./toGraph.js";
import { localStreamNames, sliceRunResult } from "./resultSlice.js";

/** One stream's state, in the shape `bootCase.withFeeds` freezes into `0/`. */
export interface SeedStream {
  F: number;
  T: number;
  P: number;
  molarComposition: Record<string, number>;
}

export interface DrillSeed {
  /** local stream name -> the state the child starts from */
  feeds: Record<string, SeedStream>;
  /** the parent's run, sliced to this scope (what the child opens showing) */
  inherited: RunResult;
}

/**
 * How the PARENT wires one member: which of its streams reach the member's
 * local port names.
 *
 * Returns `{ boundaryFeeds, boundaryOutlets }` in `SliceOptions`' own
 * vocabulary -- inlets as a local-name -> parent-name MAP (the child cannot
 * find them otherwise), outlets as a NAME LIST (they are re-roled so the
 * child's own boundary balance counts them).
 */
export function memberPorts(
  parentFlowsheet: JsonDict | undefined,
  member: string,
): { boundaryFeeds: Record<string, string>;
     boundaryOutlets: string[];
     ports: Record<string, string> } {
  const boundaryFeeds: Record<string, string> = {};
  const outletMap: Record<string, string> = {};
  if (!parentFlowsheet)
    return { boundaryFeeds, boundaryOutlets: [], ports: {} };
  //  A connection endpoint is `<member>/<port>`; the SLASH is the dict's
  //  separator and the only thing read here.  Deliberately NOT a dot: the
  //  dotted form is the engine's FLATTENED name, and reading a port out of
  //  one would be the name-identity crossing this project bans.
  const head = member + "/";
  for (const e of readEdges(parentFlowsheet)) {
    if (!e.name) continue;
    if (typeof e.to === "string" && e.to.startsWith(head))
      boundaryFeeds[e.to.slice(head.length)] = e.name;
    if (typeof e.from === "string" && e.from.startsWith(head))
      outletMap[e.from.slice(head.length)] = e.name;
  }
  //  `SliceOptions.boundaryOutlets` is a NAME LIST (it only re-roles); the
  //  MAP is this module's own, because the 0/ completeness contract wants a
  //  file per graph stream and an outlet answers to a different name in the
  //  parent -- the converter's `Out` is the sector's `HotEffluent`.  Without
  //  it the child is one file short and refuses.
  return {
    boundaryFeeds,
    boundaryOutlets: Object.keys(outletMap),
    ports: { ...boundaryFeeds, ...outletMap },
  };
}

/**
 * Build what a drilled sub-case is handed, or null when there is nothing to
 * hand it.
 *
 * NULL IS AN ANSWER, not a failure: with no finished parent run there is no
 * state to seed from, and the child opens exactly as it does today.  Inventing
 * one would be the silent crutch this project rules out -- a seed the student
 * did not author and the engine did not compute.
 */
export function buildDrillSeed(
  parentFlowsheet: JsonDict | undefined,
  subFiles: CaseFiles,
  member: string,
  run: RunResult | null,
): DrillSeed | null {
  //  A FAST PATH, not a guard: with no streams the work below yields an
  //  empty seed and the final emptiness check returns null anyway.  Said
  //  plainly because a sabotage removing this line SURVIVES, and a reader
  //  who mistook it for the load-bearing check would be wrong about where
  //  the decision is taken.
  if (!run || !Array.isArray(run.streams) || run.streams.length === 0)
    return null;

  const local = localStreamNames(subFiles.flowsheet as JsonDict | undefined);
  if (local.length === 0) return null;

  const { boundaryFeeds, boundaryOutlets, ports } =
    memberPorts(parentFlowsheet, member);
  const leaf = ((subFiles.flowsheet as { units?: Array<{ name?: unknown }> }
                 | undefined)?.units ?? [])[0]?.name;

  const inherited = sliceRunResult(run, member, {
    localStreamNames: local,
    boundaryFeeds,
    boundaryOutlets,
    ...(typeof leaf === "string" && leaf ? { leafUnitName: leaf } : {}),
  });

  //  ONLY the child's own streams.  The slice already speaks the child's
  //  vocabulary, so a name here is a name the child declares -- and a name
  //  the slice could not resolve is simply absent, which the child reports
  //  as an unfed inlet rather than being handed a guess.
  const wanted = new Set(local);
  const feeds: Record<string, SeedStream> = {};
  const take = (localName: string, s: { F: number; T: number; P: number;
                                        composition?: Record<string, number> }) => {
    feeds[localName] = { F: s.F, T: s.T, P: s.P,
                         molarComposition: s.composition ?? {} };
  };
  //  (1) the SLICE, which already speaks the child's vocabulary.  The
  //  `wanted` filter is NOT redundant here: the slice yields every
  //  prefix-stripped entry, so a parent stream `Converter.Hidden` arrives as
  //  local `Hidden` whether or not the child's graph declares it -- and a 0/
  //  file for a stream the child does not declare ORPHANS and refuses the
  //  whole case. it covers a
  //  sector's internal streams (parent `LOOP.x` -> local `x`) and anything
  //  passing through unprefixed.
  for (const s of inherited.streams)
    if (wanted.has(s.name)) take(s.name, s);
  //  (2) the PORTS the parent's connections name, which the slice cannot
  //  rename: a drilled LEAF calls its ports `Feed` and `Out` while the parent
  //  calls the same pipes `PreheatedFeed` and `HotEffluent`.  Resolved by the
  //  declared wiring, never by matching leaves or by similarity -- a near
  //  miss would freeze the WRONG stream's numbers into the child's state,
  //  and a run that converges on a lie is worse than one that refuses.
  for (const [localName, parentName] of Object.entries(ports)) {
    if (!wanted.has(localName) || feeds[localName] !== undefined) continue;
    const s = run.streams.find((x) => x.name === parentName);
    if (s) take(localName, s);
  }
  if (Object.keys(feeds).length === 0) return null;
  return { feeds, inherited };
}

/** The STABLE stash key for a sub-case's seed (latest drill wins, survives F5). */
export function feedsKeyFor(sub: string): string {
  return `choupo.feeds.${sub}`;
}

/** The ONE-SHOT stash key for the inherited slice (consumed by bootCase). */
export function inheritKeyFor(sub: string): string {
  return `choupo.inherit.${sub}`;
}
