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
  propsMapState -- WHAT EACH BLOCK OF THE CALCULATION MAP DID IN THE LAST RUN
  (DEV.md 4c C154, Vitor's addition: "a state on every map block").

  Four words, each in ink AND colour on the block (ui/PropsMap.tsx) and named
  in the map's legend:

    run      the last run used it (data, a model) or produced it (an
             operation that returned 0, a view the run published)
    failed   an operation returned non-zero, or the run failed before the
             operation published anything (and so every block it feeds)
    not run  there is no run yet, or the run published nothing for it
    stale    a part of the case it READS changed since the run

  THE STATE IS READ, NEVER INFERRED.  "run" / "failed" come from the run's
  own result: its status and each operation's result and return code (the
  engine publishes `rc` when it is not zero).  "stale" comes from the
  staleness home (case/staleness.ts), and only where it can be ATTRIBUTED:
  each block's OWN parts are known -- an operation's propsDict block, a
  view's, a reference's, the files a data block names, the thermo package
  for the package block -- and a change reaches every block downstream of
  the block that reads it, along the map's own wires.  A changed part that
  no block of the map reads (a component record, the controlDict, a README)
  cannot be placed on a block, and then the map says ONCE that the case
  changed since the run and claims no per-block staleness: the fingerprint
  is not a dependency analysis, and a per-block guess would be one.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import { viewDomId, type BlockKind, type MapNode, type PropsMap } from "./propsMap.js";

export type BlockState = "run" | "failed" | "notRun" | "stale";

/** The word a block shows, and the legend's sentence for it. */
export const BLOCK_STATE: Record<BlockState, { word: string; color: string; legend: string }> = {
  run:    { word: "run",     color: "teal",   legend: "the last run used or produced it" },
  failed: { word: "failed",  color: "red",    legend: "an operation returned non-zero, or the run failed before it published" },
  notRun: { word: "not run", color: "gray",   legend: "no run yet, or the run published nothing for it" },
  stale:  { word: "stale",   color: "orange", legend: "a part of the case it reads changed since the run" },
};

export interface MapStaleness {
  /** the whole case differs from what the run was given */
  stale: boolean;
  /** the parts that differ (case/staleness.ts `changedParts`); null = the
   *  run's stamp carries no parts, so nothing can be attributed */
  changed: string[] | null;
}

export interface MapStates {
  /** each map member's state */
  member: Map<string, BlockState>;
  /** each drawn block's state: stale if any member is, failed if any member
   *  is, run only if every member ran, else not run */
  block: Map<string, { state: BlockState; why: string }>;
  /** true when the case changed in a way no block can be named for: the map
   *  then says so once ("case changed since the run") and no block says
   *  stale */
  caseWide: boolean;
  /** the changed parts no block reads (shown with the map-wide message) */
  unattributed: string[];
}

/** The parts of the case a member reads ITSELF (not through a wire). */
export function ownParts(n: MapNode, propsDictViews: ReadonlySet<string>): string[] {
  const id = n.id;
  const file = n.member.target.kind === "case" ? [`file:${n.member.target.path}`] : [];
  if (id.startsWith("op:")) return [`propsDict.operations.${n.member.label}`];
  if (id.startsWith("view:")) {
    const name = n.member.label;
    return propsDictViews.has(name) ? [`propsDict.views.${name}`] : [];
  }
  if (id.startsWith("ref:")) return [`propsDict.references.${n.member.label}`, ...file];
  if (id.startsWith("inline:")) return [`propsDict.operations.${id.split(":")[1]}`];
  if (id === "package") return ["thermoPackage", "file:constant/thermoPhysPropDict"];
  if (n.kind === "data") return file;
  return [];
}

const KIND_ORDER: Record<BlockKind, number> = { data: 0, model: 1, operation: 2, view: 3, unit: 4 };

export function mapStates(map: PropsMap, result: RunResult | undefined | null,
                          staleness: MapStaleness | null): MapStates {
  const member = new Map<string, BlockState>();
  const ranAt = result && (result.status === "done" || result.status === "error");
  const failedRun = !!result && result.status === "error";
  const opRes = new Map((result?.operationResults ?? []).map((r) => [r.name, r]));
  const published = new Set((result?.postProcessing?.items ?? []).map((it) => viewDomId(it.origin, it.op, it.name)));

  //  members in wire order (data -> models -> ops -> views -> units), so a
  //  consumer's state is known before what it feeds
  const nodes = [...map.nodes].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const l of map.links) {
    (up.get(l.to) ?? up.set(l.to, []).get(l.to)!).push(l.from);
    (down.get(l.from) ?? down.set(l.from, []).get(l.from)!).push(l.to);
  }
  for (const n of nodes) {
    let st: BlockState;
    if (!ranAt) st = "notRun";
    else if (n.kind === "operation") {
      const r = opRes.get(n.member.label);
      st = r ? (typeof r.rc === "number" && r.rc !== 0 ? "failed" : "run") : failedRun ? "failed" : "notRun";
    } else if (n.kind === "view") {
      const dom = n.id.replace(/^view:/, "");
      if (n.id.startsWith("view:") && published.has(dom)) st = "run";
      else st = (up.get(n.id) ?? []).some((u) => member.get(u) === "failed") || failedRun ? "failed" : "notRun";
    } else st = "notRun";
    member.set(n.id, st);
  }
  //  data and models take the state of the operations that read them
  for (const n of nodes) {
    if (n.kind !== "data" && n.kind !== "model") continue;
    const users = (down.get(n.id) ?? []).filter((d) => d.startsWith("op:") || d.startsWith("view:"));
    if (!ranAt || users.length === 0) continue;
    const ss = users.map((u) => member.get(u) ?? "notRun");
    member.set(n.id, ss.some((s) => s === "failed") ? "failed" : ss.every((s) => s === "run") ? "run" : "notRun");
  }
  //  units and written records: the state of what writes them
  for (const n of nodes) {
    if (n.kind !== "unit" && !(n.kind === "view" && !n.id.startsWith("view:"))) continue;
    const ss = (up.get(n.id) ?? []).map((u) => member.get(u) ?? "notRun");
    if (ss.length) member.set(n.id, ss.some((s) => s === "failed") ? "failed" : ss.every((s) => s === "run") ? "run" : "notRun");
  }

  //  STALE: attributed to blocks, or said once for the whole map
  let caseWide = false;
  let unattributed: string[] = [];
  if (result && staleness?.stale) {
    const declaredViews = new Set(map.nodes.filter((n) => n.id.startsWith("view:view-declared-")).map((n) => n.member.label));
    const own = new Map(map.nodes.map((n) => [n.id, ownParts(n, declaredViews)]));
    const readable = new Set([...own.values()].flat());
    const changed = staleness.changed;
    unattributed = changed === null ? [] : changed.filter((p) => !readable.has(p));
    if (changed === null || unattributed.length > 0 || changed.length === 0) caseWide = true;
    else {
      const hit = new Set(changed);
      const stale = new Set<string>();
      for (const n of nodes) if ((own.get(n.id) ?? []).some((p) => hit.has(p))) stale.add(n.id);
      //  downstream along the wires
      const queue = [...stale];
      while (queue.length) {
        const x = queue.shift()!;
        for (const d of down.get(x) ?? []) if (!stale.has(d)) { stale.add(d); queue.push(d); }
      }
      for (const id of stale) member.set(id, "stale");
    }
  }

  const block = new Map<string, { state: BlockState; why: string }>();
  for (const b of map.blocks) {
    const ss = b.members.map((m) => member.get(m.id) ?? "notRun");
    const nRun = ss.filter((s) => s === "run").length;
    const state: BlockState = ss.includes("stale") ? "stale" : ss.includes("failed") ? "failed"
      : nRun === ss.length && ss.length > 0 ? "run" : "notRun";
    const why = ss.length > 1
      ? `${nRun} of ${ss.length} run${ss.includes("failed") ? `, ${ss.filter((s) => s === "failed").length} failed` : ""}${ss.includes("stale") ? `, ${ss.filter((s) => s === "stale").length} stale` : ""}`
      : BLOCK_STATE[state].legend;
    block.set(b.id, { state, why });
  }
  return { member, block, caseWide, unattributed };
}
