/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Result slicing for fractal drill-in.  A parent run already computed EVERY
  internal stream of a composite child (the flattener namespaces them:
  "SECTOR.stream" streams, "SECTOR.unit" kpis).  When the student drills into
  that child, the new tab should open WITH those results -- not force a
  pointless re-run of numbers the parent pass just converged.

  `sliceRunResult` is PURE: parent RunResult + the drill scope (the child's
  name, the namespace prefix) -> a synthesized RunResult in the sub-case's
  LOCAL names:

    - streams "<prefix>.x" / "<prefix>/x"  ->  "x"   (prefix stripped)
    - parent streams whose name appears UNPREFIXED in the sub-case's own dicts
      pass through unchanged (the boundary / frozen-inlet streams)
    - kpis / convergence / profiles / utilityAllocation renamed the same way
    - advisories kept only when they MENTION the scope (mention stripped)
    - modelBoundaries kept only when stream/producer/consumer is in scope
    - everything parent-scoped or meaningless locally is dropped

  The synthesized result is honest, never silent: status "done" but its log is
  a one-line note saying the numbers are INHERITED from the parent run --
  re-running the sub-case overrides them normally.
\*---------------------------------------------------------------------------*/

import type { RunResult, StreamResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import type { CaseFiles } from "./types.js";
import { readEdges, zeroStateText } from "./toGraph.js";

export interface SliceOptions {
  /** Stream names the sub-case's own dicts reference (feeds, boundary,
   *  unit ports, tears, connection endpoints).  A parent stream carrying
   *  one of these names UNPREFIXED passes through as a boundary stream.
   *  Collect them with `localStreamNames(subFlowsheet)`. */
  localStreamNames?: string[];
  /** The sub-case's local unit name when it is a LEAF (a one-unit case):
   *  a parent kpi/convergence/profile entry keyed EXACTLY by the scope
   *  prefix is renamed to this, so the leaf tab finds it. */
  leafUnitName?: string;
  /** Boundary inlets fed by an INTERNAL parent stream, resolved through the
   *  PARENT's connections (e.g. EXTRACTION's `liquor` <- the parent's
   *  `BRINE.liquor`).  Maps the local inlet name -> the flattened parent stream
   *  name.  Such a feed does NOT appear unprefixed in the parent result, so it
   *  is pulled in explicitly under the inlet name, keeping its last converged
   *  values -- otherwise the drilled sub-case sees the inlet as unfed. */
  boundaryFeeds?: Record<string, string>;
  /** The sub-case's boundary OUTLET names.  Re-roled to "product" (and the
   *  inlets, the boundaryFeeds keys, to "feed") in the slice, so the drilled
   *  sub-case's plant-boundary mass/energy balance counts them -- a sector's
   *  outlet is an intermediate stream in the PARENT (role "intermediate") and
   *  would otherwise be missed on the OUTPUTS side. */
  boundaryOutlets?: string[];
}

/** Strip the scope prefix off a flattened name.  Accepts both the engine's
 *  "." and the dict's "/" separators (in the name AND in the prefix).
 *  Returns the local remainder, "" when the name IS the scope itself, or
 *  null when the name is outside the scope. */
export function stripScope(name: string, prefix: string): string | null {
  if (!prefix) return null;
  const n = name.replace(/\//g, ".");
  const p = prefix.replace(/\//g, ".");
  if (n === p) return "";
  if (n.startsWith(p + ".")) return name.slice(p.length + 1);
  return null;
}

/** Every stream name the sub-case's flowsheet dict references: boundary
 *  inlets/outlets, tearStreams, flat units' in/inputs/outputs, and bare
 *  connection endpoints.  These are the names a parent stream may
 *  legitimately pass through under (the frozen inlets / boundary streams of
 *  the drilled scope). */
export function localStreamNames(flowsheet: JsonDict | undefined): string[] {
  if (!flowsheet) return [];
  const names = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === "string" && v.length > 0) names.add(v);
    else if (Array.isArray(v)) for (const x of v) add(x);
  };
  const boundary = (flowsheet["boundary"] ?? {}) as JsonDict;
  add(boundary["inlets"]);
  add(boundary["outlets"]);
  add(flowsheet["tearStreams"]);
  for (const u of (flowsheet["units"] ?? []) as JsonDict[]) {
    add(u["in"]);
    add(u["inputs"]);
    add(u["outputs"]);
  }
  for (const e of readEdges(flowsheet)) {
    add(e.name);   // named edge: the KEY is the stream ID
    add(e.from);
    add(e.to);
  }
  return [...names];
}

/** The one-line honesty note carried as the synthesized result's log. */
export function inheritedNote(prefix: string): string {
  return `[inherit] '${prefix}': results inherited from the parent run — re-run to recompute.\n`;
}

/** Render a frozen stream state as a per-stream `0/<name>` state file --
 *  canonical componentMolarFlows grammar in SI, exactly what the engine
 *  reads.  Values are canonical SI already (F kmol/s, T K, P Pa). */
export function frozenStreamStateText(s: {
  F: number; T: number; P: number;
  composition?: { [component: string]: number };
}): string {
  const comp = s.composition ?? {};
  const flows = Object.entries(comp)
    .map(([c, x]) => `    ${c}    ${(s.F ?? 0) * x};`)
    .join("\n");
  return "// transient GUI projection -- never written to the case\n"
    + `componentMolarFlows\n{\n${flows}\n}\nT    ${s.T} K;\nP    ${s.P} Pa;\n`;
}

/** Freeze a drilled sub-case's boundary INLETS as per-stream `0/<name>` state
 *  files in the run payload (extraFiles), so pressing Run re-solves the
 *  sector with the parent's inputs instead of hitting unfed boundary inlets
 *  (which produce nothing).  Stream state NEVER enters the flowsheet dict --
 *  the engine refuses a `streams{}` block; the projection is 0/ files only.
 *  Applied at RUN time (not just boot) so it works regardless of how the tab
 *  was opened.  A 0/ state the sub-case already carries for that name WINS.
 *  No-op without a finished run or a boundary. */
export function withFrozenBoundaryState(files: CaseFiles, run: RunResult | null): CaseFiles {
  if (!run || run.status !== "done" || !files.flowsheet) return files;
  const inlets = (files.flowsheet["boundary"] as JsonDict | undefined)?.["inlets"];
  const names = Array.isArray(inlets)
    ? inlets.filter((x): x is string => typeof x === "string") : [];
  if (!names.length) return files;
  const present = { ...(files.rawFiles ?? {}), ...(files.extraFiles ?? {}) };
  const byName = new Map(run.streams.map((s) => [s.name, s] as const));
  const add: { [relPath: string]: string } = {};
  for (const nm of names) {
    if (zeroStateText(present, nm) !== undefined) continue;   // own state wins
    const s = byName.get(nm);
    if (s) add[`0/${nm}`] = frozenStreamStateText(s);
  }
  if (!Object.keys(add).length) return files;
  return { ...files, extraFiles: { ...(files.extraFiles ?? {}), ...add } };
}

/** Slice a parent RunResult down to the drill-in scope `prefix`, renaming
 *  everything to the sub-case's local names.  Pure; never mutates `parent`. */
export function sliceRunResult(
  parent: RunResult,
  prefix: string,
  opts: SliceOptions = {},
): RunResult {
  const localSet = new Set(opts.localStreamNames ?? []);

  // Streams: prefix-stripped entries win over a passthrough that collides on
  // the same local name (the scope's OWN stream is the truth for that name).
  const byName = new Map<string, StreamResult>();
  const order: string[] = [];
  for (const s of parent.streams) {
    const local = stripScope(s.name, prefix);
    if (local) {
      if (!byName.has(local)) order.push(local);
      byName.set(local, { ...s, name: local });
    } else if (local === null && localSet.has(s.name) && !byName.has(s.name)) {
      byName.set(s.name, { ...s });
      order.push(s.name);
    }
  }
  // Boundary inlets fed by an internal parent stream (via the parent's
  // connections): the feed name is flattened+prefixed in the parent result
  // ("BRINE.liquor"), so it was neither prefix-stripped into scope nor matched
  // unprefixed.  Pull it in under the local inlet name, keeping its converged
  // values.  A scope-own stream already placed under that name wins.
  for (const [local, parentName] of Object.entries(opts.boundaryFeeds ?? {})) {
    if (byName.has(local)) continue;
    const src = parent.streams.find((s) => s.name === parentName);
    if (src) { byName.set(local, { ...src, name: local }); order.push(local); }
  }
  // Re-role the sub-case's boundary streams: its INLETS are its feeds, its
  // OUTLETS its products.  In the parent these are internal (role
  // "intermediate"), so without this the drilled tab's plant-boundary balance
  // shows inputs but no outputs (or vice-versa).
  const feedSet = new Set(Object.keys(opts.boundaryFeeds ?? {}));
  const prodSet = new Set(opts.boundaryOutlets ?? []);
  for (const [name, s] of byName) {
    if (prodSet.has(name)) s.role = "product";
    else if (feedSet.has(name)) s.role = "feed";
  }
  // De-duplicate a boundary OUTLET against the internal unit stream that feeds
  // it: `settler01.loadedOrganic` and the sector outlet `loadedOrganic` are the
  // SAME physical stream (an internal connection maps one to the other), so the
  // slice must not list both.  Drop the internal `<unit>.<outlet>` when the
  // boundary `<outlet>` is present -- the boundary name is the sector's own.
  const present = new Set(order);
  const streams = order
    .filter((n) => {
      const dot = n.lastIndexOf(".");
      if (dot > 0) {
        const tail = n.slice(dot + 1);
        if (prodSet.has(tail) && present.has(tail)) return false;
      }
      return true;
    })
    .map((n) => byName.get(n)!);

  // A name keyed EXACTLY by the scope (a leaf unit's kpi/profile slot) maps
  // to the leaf's local unit name when the caller knows it.
  const localKey = (local: string, original: string): string =>
    local === "" ? (opts.leafUnitName ?? original) : local;

  const kpis: NonNullable<RunResult["kpis"]> = {};
  for (const [unit, vals] of Object.entries(parent.kpis ?? {})) {
    const local = stripScope(unit, prefix);
    if (local === null) continue;
    kpis[localKey(local, unit)] = vals;
  }

  const convergence = parent.convergence.flatMap((c) => {
    const local = stripScope(c.label, prefix);
    return local === null ? [] : [{ ...c, label: localKey(local, c.label) }];
  });

  const profiles = (parent.profiles ?? []).flatMap((p) => {
    const local = stripScope(p.unit, prefix);
    return local === null ? [] : [{ ...p, unit: localKey(local, p.unit) }];
  });

  const utilityAllocation = (parent.utilityAllocation ?? []).flatMap((row) => {
    const local = stripScope(row.unit, prefix);
    return local === null ? [] : [{ ...row, unit: localKey(local, row.unit) }];
  });

  // Advisories: keep only those that MENTION the scope ("tear
  // 'SECTOR.Recycle'", "vessel 'SECTOR.reactor'"), with the mention stripped
  // so it reads in local names.  Scope-free advisories (a global thermo note)
  // belong to the parent pass, not this slice -- dropped.
  const mentions = (t: string): boolean =>
    t.includes(prefix + ".") || t.includes(prefix + "/");
  const stripMentions = (t: string): string =>
    t.split(prefix + ".").join("").split(prefix + "/").join("");
  const advisories = (parent.advisories ?? []).flatMap((a) =>
    mentions(a.locus) || mentions(a.message)
      ? [{ ...a, locus: stripMentions(a.locus), message: stripMentions(a.message) }]
      : []);

  // Model-boundary audit rows: in scope when the stream OR either side of the
  // boundary lives inside it; each in-scope field is renamed, the rest kept
  // verbatim (a boundary ON the scope's inlet keeps its outside producer).
  const modelBoundaries = (parent.modelBoundaries ?? []).flatMap((b) => {
    const ls = stripScope(b.stream, prefix);
    const lp = stripScope(b.producer, prefix);
    const lc = stripScope(b.consumer, prefix);
    if (ls === null && lp === null && lc === null) return [];
    return [{
      ...b,
      stream: ls ? ls : b.stream,
      producer: lp ? lp : b.producer,
      consumer: lc ? lc : b.consumer,
    }];
  });

  const out: RunResult = {
    status: "done",
    log: inheritedNote(prefix),
    streams,
    convergence,
  };
  if (Object.keys(kpis).length > 0) out.kpis = kpis;
  if (profiles.length > 0) out.profiles = profiles;
  if (utilityAllocation.length > 0) out.utilityAllocation = utilityAllocation;
  if (advisories.length > 0) out.advisories = advisories;
  if (modelBoundaries.length > 0) out.modelBoundaries = modelBoundaries;
  // Global thermo facts (same components, same catalogue) travel as-is.
  if (parent.componentMolarMass) out.componentMolarMass = parent.componentMolarMass;
  if (parent.thermoResolution) out.thermoResolution = parent.thermoResolution;
  if (parent.componentCoverage) out.componentCoverage = parent.componentCoverage;
  // Deliberately dropped: log (replaced by the note), computed (parent-scope
  // variables{} expressions), csvFiles / operationResults / validation /
  // experimentalDatasets / proposals / txy / trajectory (parent-run artefacts
  // with parent-relative paths -- a re-run regenerates them locally).
  return out;
}

/** True when the slice actually carries something worth seeding -- an empty
 *  slice (curation-phase parent, or a scope the run never touched) must NOT
 *  masquerade as a finished run. */
export function sliceHasContent(r: RunResult): boolean {
  return r.streams.length > 0 || Object.keys(r.kpis ?? {}).length > 0;
}
