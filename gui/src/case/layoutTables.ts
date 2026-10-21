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
  THE PLANT LAYOUT AS TABLES -- the words and the cells, with no React in
  them (DEV.md 4c C75, C80, C81).

  Two kinds of surface show the engine's `layout {}` block as tables: the
  app (Reports -> "Plant layout (3D)", the `?layout=` tab, through
  ui/PlantLayoutTables.tsx) and the self-contained page "Export as page"
  writes (case/layoutExport.ts).  Both read their rows, captions, notes and
  legend sentences HERE, so the pipe register a student shares is the one
  they saw, cell for cell.  Every number is the engine's, formatted; nothing
  is measured or judged here.  The register's TOTAL length is the sum of the
  engine's own lengths, as the app has always printed it.
\*---------------------------------------------------------------------------*/

import type { LayoutPipeRack, PlantLayout } from "../adapters/SolverAdapter.js";
import { endName, PHASE_WORDS, phaseOf, SPEED_RULE, type Phase } from "./plantLayout.js";

/** The particle each phase carries, as a word for the legend. */
export const PARTICLE_WORD: Record<Phase, string> = {
  liquid: "spheres", vapour: "octahedra", twoPhase: "spheres and octahedra", unknown: "cubes",
};

/** The legend, after "Declared in system/layoutDict." (which a surface sets
 *  with the file name as code). */
export const LEGEND_SHAPES =
  "Each item is drawn by its equipment kind on its envelope -- the diameter and length its"
  + " sizer published, or the box the case declared -- with heads, skirts, saddles, ladders"
  + " and platforms that are drawing, not data; a kind with no drawing is the plain cylinder"
  + " or box.  Translucent cylinders are the declared hazardous-area zones"
  + " (zone 0 densest and solid-edged, zone 1 wire, zone 2 faint and dashed).  A label is"
  + " the item id (⚠ marks an item the engine named in a finding); hover an item or a pipe"
  + " for the rest.";

/** How to move the view with a mouse. */
export const LEGEND_CONTROLS =
  "Drag to orbit, right-drag to pan, wheel to zoom; Fit frames the plant again.";

/** The phases a legend lists. */
export const LEGEND_PHASES: Phase[] = ["liquid", "vapour", "twoPhase"];

/** The sentence under the phase swatches. */
export const LEGEND_PIPES =
  "Pipes are routed and measured by the engine (up to the rack, along it, down), and the"
  + ` particles move in the direction of flow; ${SPEED_RULE}.  The Flow box stops them.`;

export const PIPE_REGISTER_CAPTION =
  "Pipe register: routed and measured by the engine; no pressure drop and no cost yet"
  + " (the next slice).";

/** Where the rack is, and who said so. */
export function rackSentence(k: LayoutPipeRack): string {
  return k.declared
    ? `Rack declared by the case at y = ${k.y.toFixed(1)} m, ${k.elevation.toFixed(1)} m up.`
    : `No rack declared: the engine's stated default at y = ${k.y.toFixed(1)} m,`
      + ` ${k.elevation.toFixed(1)} m up.`;
}

export interface PipeRow {
  stream: string;
  ends: string;
  phase: Phase;
  phaseWord: string;
  T: string;
  P: string;
  flow: string;
  length: string;
}

export interface PipeRegisterView {
  rows: PipeRow[];
  /** "N pipes, in all" and the sum of the engine's lengths; null with no pipe. */
  total: { label: string; length: string } | null;
  rack: string | null;
  /** Missing pipes, each with the engine's reason; `marked` is false where
   *  the layout reaches neither end, so the 3D view marks it nowhere and
   *  this list is where it is said (DEV.md 4c C97). */
  notRouted: { stream: string; reason: string; marked: boolean }[];
  /** Streams that carry only solids: moved in containers or by conveyor,
   *  never piped -- not a missing pipe (DEV.md 4c C97). */
  solids: string[];
  /** Streams with an end inside the building and no end the 3D view can
   *  mark (DEV.md 4c C100): indoor piping, which the layout does not route --
   *  each with the engine's reason. */
  indoor: { stream: string; reason: string }[];
}

/** The pipe register: one row per pipe the engine routed, then what it did
 *  not route and why; null when the block carries neither. */
export function pipeRegister(layout: PlantLayout): PipeRegisterView | null {
  const pipes = layout.pipes ?? [];
  const notRouted = layout.notRouted ?? [];
  if (pipes.length === 0 && notRouted.length === 0) return null;
  const fx = (v: number | undefined, d: number) =>
    v === undefined || !Number.isFinite(v) ? "" : v.toFixed(d);
  const rows = pipes.map((p): PipeRow => {
    const ph = phaseOf(p.vf);
    return {
      stream: p.label ? `${p.stream} (${p.label})` : p.stream,
      ends: `${endName(p.fromKind, p.from)} → ${endName(p.toKind, p.to)}`,
      phase: ph,
      phaseWord: PHASE_WORDS[ph],
      T: fx(p.T, 1),
      P: p.P === undefined ? "" : fx(p.P / 1e5, 2),
      flow: p.F_mass === undefined ? "" : p.F_mass.toPrecision(4),
      length: `${p.length.toFixed(1)}${p.routedBy === "waypoints" ? " (declared route)" : ""}`,
    };
  });
  const total = pipes.reduce((a, p) => a + p.length, 0);
  return {
    rows,
    total: pipes.length > 0
      ? { label: `${pipes.length} pipes, in all`, length: total.toFixed(1) } : null,
    rack: layout.pipeRack ? rackSentence(layout.pipeRack) : null,
    notRouted: notRouted.filter((n) => !n.solids && !(n.indoor && !n.anchor))
      .map((n) => ({ stream: n.stream, reason: n.reason, marked: !!n.anchor })),
    solids: notRouted.filter((n) => n.solids).map((n) => n.stream),
    indoor: notRouted.filter((n) => n.indoor && !n.anchor)
      .map((n) => ({ stream: n.stream, reason: n.reason })),
  };
}

/** THE PLOT (DEV.md 4c C82) as words and cells: the engine's area, the
 *  area its footprints cover and their share, the margin and whose it is,
 *  the engine's own sentence for the rule, and one row per sector.  Every
 *  number is the engine's, formatted; null when the result carries no plot. */
export interface PlotView {
  /** "Plot area 8964 m2 (x .. to .. m, y .. to .. m); the footprints cover 260 m2, 2.9 % of it." */
  headline: string;
  /** Whose the margin is (declared, with the case's reason; or none, and
   *  what that makes the area). */
  margin: string;
  /** The engine's rule, quoted. */
  rule: string;
  /** Sector areas (where declared) and pairs of items standing one above
   *  another, said where the engine counted any. */
  notes: string[];
  sectors: { sector: string; from: string; plotArea: string; footprintArea: string }[];
}

export const PLOT_CAPTION =
  "Plot area, per sector: the declared area where the case declares one, else the envelope"
  + " of the sector's own footprints.";

const m2 = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "?");

/** The plot the engine published, as sentences and rows. */
export function plotSummary(layout: PlantLayout): PlotView | null {
  const p = layout.plot;
  if (!p) return null;
  const notes: string[] = [];
  if (p.declaredAreasUnion > 0)
    notes.push(`The declared sector areas cover ${m2(p.declaredAreasUnion)} m²`
      + (p.declaredAreasOverlap > 0
        ? `; ${m2(p.declaredAreasOverlap)} m² of it is claimed by two sectors at once.`
        : "."));
  if (p.stackedPairs > 0)
    notes.push(`${p.stackedPairs} pair${p.stackedPairs === 1 ? "" : "s"} of items stand one`
      + " above the other, and each item's footprint is counted.");
  return {
    headline: `Plot area ${m2(p.plotArea)} m² (x ${p.xMin.toFixed(1)} to ${p.xMax.toFixed(1)} m,`
      + ` y ${p.yMin.toFixed(1)} to ${p.yMax.toFixed(1)} m); the footprints cover`
      + ` ${m2(p.footprintArea)} m²,`
      + ` ${(100 * p.footprintShare).toFixed(1)} % of it.`,
    margin: p.marginDeclared
      ? `Margin ${p.margin.toFixed(1)} m, declared by the case: ${p.marginReason}`
      : "No margin declared: the plot is the bare envelope of the layout, a lower bound"
        + " (declare plot { margin; reason; } in system/layoutDict).",
    rule: `Rule (the engine's): ${p.rule}.`,
    notes,
    sectors: p.sectors.map((s) => ({
      sector: s.sector,
      from: s.from === "declaredArea" ? "declared area" : "envelope of its footprints",
      plotArea: m2(s.plotArea),
      footprintArea: m2(s.footprintArea),
    })),
  };
}

/** THE FENCE (DEV.md 4c C93) as words and cells: the engine's line and
 *  length, whose the inset is, each gate opening, and one row per pipe that
 *  crosses it with the case's label.  Every number is the engine's; null when
 *  the case declares no fence. */
export interface FenceView {
  headline: string;
  notes: string[];
  rows: { stream: string; direction: string; side: string; position: string;
          label: string; placedBy: string }[];
}

export const FENCE_CAPTION =
  "Fence crossings: every pipe that enters or leaves the plant crosses the fence at the"
  + " point the engine published, labelled with where it comes from or goes to (a crossing"
  + " with no label is announced).";

export function fenceSummary(layout: PlantLayout): FenceView | null {
  const f = layout.fence;
  if (!f) return null;
  const openings = layout.fenceOpenings ?? [];
  const crossings = layout.fenceCrossings ?? [];
  const notes = [
    `The plot's boundary moved ${f.inset.toFixed(1)} m inward`
      + (f.insetDeclared ? ", as the case declared." : " (no inset declared).")
      + `  Why (the case's): ${f.reason} (source: ${f.source}).`,
    openings.length > 0
      ? openings.map((o) => `Gate ${o.gate} opens it on the ${o.side} side, ${o.width.toFixed(1)} m`
          + ` wide${o.road ? ` for road ${o.road}` : ""}, the gate ${o.gateDistance.toFixed(1)} m`
          + " inside.").join("  ")
      : "No gate: the fence is closed.",
    `Rule (the engine's): ${f.rule}.`,
  ];
  return {
    headline: `Fence ${f.length.toFixed(0)} m round (x ${f.xMin.toFixed(1)} to`
      + ` ${f.xMax.toFixed(1)} m, y ${f.yMin.toFixed(1)} to ${f.yMax.toFixed(1)} m), drawn from`
      + ` the plot; ${crossings.length} pipe crossing${crossings.length === 1 ? "" : "s"}.`,
    notes,
    rows: crossings.map((c) => ({
      stream: c.stream,
      direction: c.direction === "in" ? "in" : "out",
      side: c.side,
      position: `${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}`,
      label: c.labelDeclared ? `${c.direction === "in" ? "from" : "to"} ${c.label}`
        : "NOT declared (announced)",
      placedBy: c.positionFrom === "declared" ? "the case"
        : c.positionFrom === "waypoints" ? "the case's route" : "the engine's default",
    })),
  };
}

/** SECONDARY CONTAINMENT (DEV.md 4c C134) as words and cells: the engine's
 *  rule, and one row per bund or impounding area -- what it holds, what its
 *  declared rule requires, the verdict.  Every number is the engine's; null
 *  when the case declares none. */
export interface BundView {
  headline: string;
  notes: string[];
  rows: { bund: string; kind: string; items: string; holds: string; requires: string;
          verdict: string; drain: string }[];
}

/** The Design Guide section the containment table links to (a real
 *  `\label` in docs/designGuide.tex; tests/layoutBunds.test.ts holds it). */
export const DESIGN_GUIDE_CONTAINMENT = "secondary-containment-bunds-and-impounding";

export const BUNDS_CAPTION =
  "Secondary containment: each bund or impounding area the case declared, the volume it"
  + " holds (a bund's area x its wall less what the enclosed footprints displace; an"
  + " impounding area's remote pit) against the volume its OWN declared rule requires.  A"
  + " shortfall is announced, never refused; an item in the open that holds liquid and that"
  + " no containment encloses is announced too.";

export function bundSummary(layout: PlantLayout): BundView | null {
  const bs = layout.bunds ?? [];
  if (bs.length === 0) return null;
  const short = bs.filter((b) => b.verdict === "inadequate").length;
  const notes = bs.map((b) => `${b.bund}: rule (the case's) -- ${b.terms.map((t) =>
      `${(100 * t.fraction).toFixed(0)} % of the ${t.of} (${t.volume.toFixed(1)} m³)`).join(" or ")}`
    + ` on ${b.basis}, the ${b.governing} governing`
    + b.allowances.map((a) => `, + ${a.name} ${a.volume.toFixed(1)} m³`
      + (a.from === "depth" ? ` (${(1000 * a.depth).toFixed(0)} mm over the catch area)` : ""))
      .join("")
    + `.  Why: ${b.ruleReason} (source: ${b.ruleSource}).`);
  if (layout.bundRule) notes.push(`Rule (the engine's): ${layout.bundRule}.`);
  return {
    headline: `${bs.length} containment${bs.length === 1 ? "" : "s"} declared`
      + (short ? `; ${short} SHORT of its rule (announced).` : ", each holding what its rule requires."),
    notes,
    rows: bs.map((b) => ({
      bund: b.bund,
      kind: b.containment === "bund" ? `bund, wall ${b.wallHeight.toFixed(2)} m`
        : `impounding, kerb ${b.wallHeight.toFixed(2)} m`,
      items: b.items.join(", "),
      holds: b.containment === "bund"
        ? `${b.netVolume.toFixed(1)} (${b.area.toFixed(0)} m² x ${b.wallHeight.toFixed(2)} m`
          + ` - ${b.displacedVolume.toFixed(1)})`
        : `${b.netVolume.toFixed(1)} (pit${b.pit ? ` ${b.pit.length.toFixed(1)} x`
          + ` ${b.pit.width.toFixed(1)} x ${b.pit.depth.toFixed(2)} m` : ""})`,
      requires: b.requiredVolume.toFixed(1),
      verdict: b.verdict === "inadequate" ? "SHORT (announced)" : b.verdict,
      drain: b.drain,
    })),
  };
}

/** THE ROADS (DEV.md 4c C90) as words and cells: the engine's totals, what
 *  the case declared (headroom, access distance, closed zones) and whose it
 *  is, and one row per road.  Every number is the engine's, formatted; null
 *  when the case declares no road. */
export interface RoadView {
  /** "6 roads, 346 m of centre line, 2090 m2 paved; 1 network, reached from gate." */
  headline: string;
  notes: string[];
  rows: { road: string; width: string; length: string; reached: string; reason: string }[];
}

export const ROADS_CAPTION =
  "Roads: declared by the case, checked by the engine (a road through a footprint, or under a"
  + " rack or a pipe lower than the headroom, is refused; a road no gate reaches, a building no"
  + " road serves and an item beyond the access distance are announced).  Truck routes are"
  + " walked against the declared design vehicle, and car parks laid out by the engine (C96).";

export function roadSummary(layout: PlantLayout): RoadView | null {
  const n = layout.roadNetwork;
  if (!n) return null;
  const roads = layout.roads ?? [];
  const crossings = layout.rackCrossings ?? [];
  const notes: string[] = [
    `Headroom ${n.headroom.toFixed(1)} m and access within ${n.accessDistance.toFixed(1)} m,`
      + ` declared by the case: ${n.accessReason} (source: ${n.accessSource}).`,
  ];
  if (n.noTraffic.length > 0)
    notes.push(`Closed to traffic: zone ${n.noTraffic.join(", zone ")} (a road entering one is`
      + " announced).");
  if (crossings.length > 0)
    notes.push(`${crossings.length} crossing${crossings.length === 1 ? "" : "s"} under the pipe`
      + ` rack (lowest tier ${crossings[0]!.clearance.toFixed(1)} m, at least the headroom): `
      + crossings.map((c) => `${c.road} at x ${c.xMin.toFixed(1)} to ${c.xMax.toFixed(1)} m`)
        .join("; ") + ".");
  //  C96: the trucks and the car parks, as the engine walked and laid them out.
  const dv = layout.designVehicle;
  if (dv)
    notes.push(`Design vehicle: a ${dv.turningDiameter.toFixed(1)} m turning circle (source:`
      + ` ${dv.source}).`);
  for (const t of layout.truckRoutes ?? []) {
    const cs = (layout.routeCorners ?? []).filter((c) => c.route === t.route);
    const turns = cs.filter((c) => c.turn !== "reverse");
    notes.push(`Truck route ${t.route}: ${t.from} -> ${t.to} by ${t.roads.join(", ")};`
      + ` ${t.length.toFixed(1)} m, ${t.turns} turn${t.turns === 1 ? "" : "s"}`
      + (turns.length ? ` (outer edge ${turns.map((c) => c.outerRadius.toFixed(1)).join(", ")} m`
        + ` against ${turns[0]!.required.toFixed(1)} m)` : "")
      + `, ${t.reversals} reversal${t.reversals === 1 ? "" : "s"},`
      + ` weighbridge ${t.weighbridge || "none"}`
      + (t.serves.length ? `, serves ${t.serves.join(", ")}` : "")
      + ` -- ${t.verdict === "clear" ? "clear" : "ANNOUNCED (see the findings)"}.`);
  }
  for (const c of layout.carParks ?? [])
    notes.push(`Car park ${c.item}: ${c.bays} bays declared, ${c.capacity} fit (${c.rows}`
      + ` row${c.rows === 1 ? "" : "s"} of ${c.perRow}; ${c.bayWidth.toFixed(1)} x`
      + ` ${c.bayLength.toFixed(1)} m at ${c.angle.toFixed(0)} deg, aisle ${c.aisle.toFixed(1)} m,`
      + ` ${c.arrangement}, entry ${c.entry}), ${c.area.toFixed(0)} m²; cars leave`
      + ` ${c.exitsForward ? "nose first" : "REVERSING"}.`);
  const gates = n.entrances.length > 0 ? `reached from ${n.entrances.join(", ")}`
    : "no gate placed, so no entrance is checked";
  return {
    headline: `${roads.length} road${roads.length === 1 ? "" : "s"}, ${n.length.toFixed(0)} m of`
      + ` centre line, ${n.pavedArea.toFixed(0)} m² paved (counted once where roads meet);`
      + ` ${n.components} connected network${n.components === 1 ? "" : "s"}, ${gates}.`,
    notes,
    rows: roads.map((r) => ({
      road: r.road, width: r.width.toFixed(1), length: r.length.toFixed(1),
      reached: (r.fromEntrance ? "yes" : "NO gate reaches it") + (r.oneWay ? "; one-way" : ""),
      reason: r.reason,
    })),
  };
}

export const FINDINGS_CAPTION =
  "Findings -- announced by the engine, never refused: a layout that is too close is a"
  + " draft the student must see and defend.";

export interface FindingRow { kind: string; measured: string; declared: string; message: string }

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "?");

/** One row per finding the engine published, in its order. */
export function findingRows(layout: PlantLayout): FindingRow[] {
  return layout.findings.map((f) => ({
    kind: f.kind,
    measured: f.kind === "outsideArea" || f.kind === "deadRule" || f.kind === "sizingRefused"
      ? "" : f2(f.value),
    declared: f.kind === "outsideArea" || f.kind === "sizingRefused" ? "" : f2(f.limit),
    message: f.message,
  }));
}

export interface ItemRow {
  id: string; kind: string; sector: string; shape: string;
  position: string; extents: string; sizeFrom: string; hazard: string;
}

/** One row per placed item, in the engine's order. */
export function itemRows(layout: PlantLayout): ItemRow[] {
  return layout.items.map((i) => ({
    id: i.id,
    //  DEV.md 4c C100: an item a room lists says where it stands.
    kind: (i.nonProcess ? `${i.kind} (non-process)` : i.kind)
      + (i.room ? ` · indoors, room ${i.room}` : ""),
    sector: i.sector,
    shape: `${i.shape} ${i.orientation}`,
    position: `${f2(i.x)}, ${f2(i.y)}, ${f2(i.z)}`,
    extents: `${f2(i.dx)} x ${f2(i.dy)} x ${f2(i.dz)}`,
    sizeFrom: i.footprintFrom === "published" ? "its own sizing" : "declared",
    hazard: [i.release
      ? `release (zones ${i.release.zones.map((z) => z.zone).join(", ") || "none"})` : "",
             i.ignition ? "ignition" : ""].filter(Boolean).join("; "),
  }));
}

/** The notes under the item table: what was not placed, and whose the
 *  separation distances and the wind are.  Null where there is nothing to
 *  say. */
export function layoutNotes(layout: PlantLayout): {
  unplaced: string | null; internal: string | null; sources: string | null;
} {
  return {
    unplaced: layout.unplaced.length > 0
      ? `Sized but not placed: ${layout.unplaced.join(", ")}.` : null,
    internal: layout.internal.length > 0
      ? `Inside or on another item, never placed alone: ${layout.internal.join(", ")}.` : null,
    sources: layout.separation.length > 0
      ? `Separation distances are the case's own (${layout.separation.map((t) => t.source).join("; ")}).`
        + (layout.wind ? `  Wind: ${layout.wind.source}.` : "")
      : null,
  };
}
