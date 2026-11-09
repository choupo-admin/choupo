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
/*---------------------------------------------------------------------------*\
  THE GUIDED TOUR, GENERATED FROM THE RESULT (DEV.md 4c C229).

  A student group wrote a twelve-step tour of THEIR plant by hand.  This one is
  derived for ANY case from what the engine published, and nothing is written
  per installation:

    * the STEPS are the plant's own order -- one per sector, in the order the
      sectors first appear among the placed items; a flat case (no sectors) is
      cut into consecutive runs of items, in the engine's item order, so the
      tour has at most MAX_STEPS stops;
    * every SENTENCE comes from a field of the result and carries its
      `source` (the key it was read from), so a test can hold the claim that
      no sentence is invented; what the result does not carry is not said;
    * the camera of a step looks at the box its items occupy.

  An overview opens the tour (the engine's own counts) and, when the layout
  published findings or the result a headline, a closing step reads them.

  Pure; the view only flies the camera and draws the lines.
\*---------------------------------------------------------------------------*/

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { headlineSizing, money, sig, sizingPhrase, type LayoutFacts } from "./layoutFacts.js";
import {
  PHASE_WORDS, phaseOf, type LayoutScene, type SceneSolid, type Vec3,
} from "./plantLayout.js";

export interface TourLine { text: string; source: string }
export interface TourStep {
  id: string;
  title: string;
  lines: TourLine[];
  /** The box the camera frames (three.js coordinates). */
  focus: { min: Vec3; max: Vec3 };
  itemIds: string[];
  pipeIds: string[];
}

/** The most stops a flat case's tour makes (an overview and a close are extra). */
export const MAX_STEPS = 8;

/** At most this many items / streams are NAMED in one sentence. */
const NAME_LIMIT = 6;

function boxOf(solids: SceneSolid[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of solids)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, s.center[k]! - s.size[k]! / 2);
      max[k] = Math.max(max[k]!, s.center[k]! + s.size[k]! / 2);
    }
  min[1] = Math.min(min[1], 0);
  return { min, max };
}

const list = (xs: string[]) =>
  xs.length <= NAME_LIMIT ? xs.join(", ") : `${xs.slice(0, NAME_LIMIT).join(", ")} and ${xs.length - NAME_LIMIT} more`;

/** Groups of consecutive items: one per sector when the plant has sectors,
 *  else at most MAX_STEPS runs of the engine's own order. */
export function tourGroups(solids: SceneSolid[]): { name: string; sector: string | null; items: SceneSolid[] }[] {
  const process = solids.filter((s) => !s.nonProcess && !s.shell);
  if (process.length === 0) return [];
  const sectors: string[] = [];
  for (const s of process) if (!sectors.includes(s.sector)) sectors.push(s.sector);
  const named = sectors.filter((x) => x !== "");
  if (named.length >= 2)
    return sectors.map((sec) => ({
      name: sec === "" ? "Plant level" : `Sector ${sec}`,
      sector: sec,
      items: process.filter((s) => s.sector === sec),
    }));
  const size = Math.max(1, Math.ceil(process.length / MAX_STEPS));
  const out: { name: string; sector: string | null; items: SceneSolid[] }[] = [];
  for (let i = 0; i < process.length; i += size) {
    const part = process.slice(i, i + size);
    out.push({ name: part.length === 1 ? part[0]!.id
      : `${part[0]!.id} to ${part[part.length - 1]!.id}`, sector: null, items: part });
  }
  return out;
}

/** Build the tour.  `layout` supplies the engine's counts and findings,
 *  `facts` the sheets and the stream table; either may be absent. */
export function tourOf(scene: LayoutScene, layout?: PlantLayout, facts?: LayoutFacts | null): TourStep[] {
  const steps: TourStep[] = [];
  const groups = tourGroups(scene.solids);
  if (groups.length === 0) return steps;
  const fitBox = { min: scene.fitMin, max: scene.fitMax };

  //  ---- the overview ----------------------------------------------------
  const ov: TourLine[] = [];
  const sm = layout?.summary;
  if (sm) {
    ov.push({ text: `The engine placed ${sm.placed} item${sm.placed === 1 ? "" : "s"}`
      + (sm.pipes > 0 ? ` and routed ${sm.pipes} pipe${sm.pipes === 1 ? "" : "s"}, ${sig(sm.pipeLength, 4)} m of pipe in all.`
        : "."), source: "layout.summary" });
  } else {
    const n = scene.solids.length;
    ov.push({ text: `The layout places ${n} item${n === 1 ? "" : "s"}.`, source: "layout.items" });
  }
  if (layout?.plot && Number.isFinite(layout.plot.plotArea))
    ov.push({ text: `The plot is ${sig(layout.plot.plotArea, 4)} m², of which ${sig(layout.plot.footprintShare * 100, 3)} % is covered by equipment.`,
              source: "layout.plot" });
  const secs = groups.filter((g) => g.sector).map((g) => g.sector!);
  if (secs.length >= 2)
    ov.push({ text: `The plant has ${secs.length} sectors, toured in this order: ${secs.join(", ")}.`,
              source: "layout.items[].sector" });
  else ov.push({ text: `The tour follows the engine's item order in ${groups.length} stops.`,
                 source: "layout.items" });
  steps.push({ id: "overview", title: "The plant", lines: ov, focus: fitBox,
               itemIds: [], pipeIds: [] });

  //  ---- one step per group ------------------------------------------------
  groups.forEach((g, gi) => {
    const ids = new Set(g.items.map((s) => s.id));
    const lines: TourLine[] = [];
    lines.push({ text: `${g.items.length} item${g.items.length === 1 ? "" : "s"}: `
      + list(g.items.map((s) => `${s.id} (${s.kind})`)) + ".", source: "layout.items" });
    //  The sized ones: their sheet's headline numbers and capital cost.
    const sized = g.items.filter((s) => facts?.items[s.id]);
    for (const s of sized.slice(0, 3)) {
      const f = facts!.items[s.id]!;
      const head = headlineSizing(f.sizing, 3).map(sizingPhrase);
      const tag = f.tagNo ? ` (${f.tagNo})` : "";
      const cost = f.cost && Number.isFinite(f.cost.totalModule)
        ? `; installed cost ${money(f.cost.totalModule, f.cost.currency)}` : "";
      if (head.length > 0 || cost)
        lines.push({ text: `${s.id}${tag}: ${head.join(", ")}${cost}.`, source: "design sheet" });
    }
    if (sized.length > 3)
      lines.push({ text: `${sized.length - 3} more sized item${sized.length - 3 === 1 ? "" : "s"} here: click one for its sheet.`,
                   source: "design sheet" });
    //  What the engine did not size.
    if (facts?.sized) {
      const un = g.items.filter((s) => !facts.items[s.id]).map((s) => s.id);
      if (un.length > 0)
        lines.push({ text: `Declared by the case but not sized by the engine: ${list(un)}.`,
                     source: "equipment (absent)" });
    }
    //  The streams crossing the group's boundary.
    const pipes = scene.pipes.filter((p) => p.ends.toKind === "item" || p.ends.fromKind === "item");
    //  DEV.md 4c C268: the branches of a header carry ONE stream into (or out
    //  of) several items -- listed once, with the state of its main, which
    //  carries the flow a branch does not.
    const once = (ps: typeof pipes) => {
      const seen = new Set<string>();
      return ps.filter((p) => !seen.has(p.stream) && seen.add(p.stream) !== undefined)
        .map((p) => (p.branch ? scene.pipes.find((q) => q.stream === p.stream && !q.branch) ?? p : p));
    };
    const into = once(pipes.filter((p) => ids.has(p.ends.to) && !(p.ends.fromKind === "item" && ids.has(p.ends.from))));
    const outof = once(pipes.filter((p) => ids.has(p.ends.from) && !(p.ends.toKind === "item" && ids.has(p.ends.to))));
    const state = (p: (typeof pipes)[number]) => {
      const bits: string[] = [];
      if (p.T !== undefined) bits.push(`${sig(p.T - 273.15, 4)} °C`);
      if (p.P !== undefined) bits.push(`${sig(p.P / 1e5, 4)} bar`);
      if (p.massFlow !== null) bits.push(`${sig(p.massFlow, 4)} kg/s`);
      if (p.vf !== undefined) bits.push(PHASE_WORDS[phaseOf(p.vf)].split(" (")[0]!);
      return `${p.stream}${bits.length ? ` (${bits.join(", ")})` : ""}`;
    };
    if (into.length > 0)
      lines.push({ text: `Streams in: ${list(into.map(state))}.`, source: "layout.pipes" });
    if (outof.length > 0)
      lines.push({ text: `Streams out: ${list(outof.map(state))}.`, source: "layout.pipes" });
    //  Findings the engine raised on these items.
    const fnd = (layout?.findings ?? []).filter((f) => ids.has(f.a) || ids.has(f.b.split("#zone")[0]!));
    for (const f of fnd.slice(0, 2)) lines.push({ text: f.message, source: "layout.findings" });
    const box = boxOf(g.items);
    steps.push({ id: `step${gi + 1}`, title: g.name, lines, focus: box,
                 itemIds: g.items.map((s) => s.id),
                 pipeIds: [...into, ...outof].map((p) => p.id) });
  });

  //  ---- the close: the result's headline and the checks ------------------
  const closing: TourLine[] = [];
  const nf = layout?.findings.length ?? 0;
  if (layout) {
    if (nf > 0)
      closing.push({ text: `The engine's layout checks raised ${nf} finding${nf === 1 ? "" : "s"}; the items they name are outlined in orange.`,
                     source: "layout.findings" });
    else closing.push({ text: "The engine's layout checks raised no finding.", source: "layout.findings" });
  }
  for (const k of (facts?.kpis ?? []).filter((x) => /^economics|^globalEnergy/.test(x.source)))
    closing.push({ text: `${k.label}: ${k.value}.`, source: k.source });
  if (closing.length > 0)
    steps.push({ id: "close", title: "Checks and headline", lines: closing, focus: fitBox,
                 itemIds: [], pipeIds: [] });
  return steps;
}
