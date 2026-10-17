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
  THE PLANT LAYOUT -- the scene, with no drawing in it (DEV.md 4c C75).

  The engine reads `system/layoutDict`, checks it against the sized items and
  publishes `layout {}` on the result: every item's plan centre, base
  elevation and EXTENTS (its sizer's own diameter and length, or the box the
  case declared), the sector areas, the wind, the hazardous-area zones and the
  findings.  This module maps that block onto a 3D scene description, so the
  three.js component (ui/plotting/PlantLayout3D.tsx) draws and decides
  nothing, and the mapping can be tested without a WebGL context.

  ZERO LAYOUT HERE (gui-credo; "THE ENGINE DECIDES, THE GUI DRAWS").  No
  footprint, no position, no distance and no finding is computed: a solid is
  the engine's extents at the engine's position, and an item is flagged
  because the engine published a finding that names it.  What IS done here is
  coordinate bookkeeping: the plan's (x, y, z-up) becomes three.js's (X, Y-up,
  Z = -y), so plan north (+y) points into the screen; and the wind arrow's
  direction is the trigonometry of the angle the CASE declared.

  A KIND WITH NO DRAWING IS A LABELLED BOX (CLAUDE.md "the datasheet follows
  the equipment kind"): the engine already says which items are cylinders --
  the ones whose sizer published a diameter and a length -- and every other
  item is the box the case declared.  Nothing here guesses a nicer shape.

  GREYSCALE SURVIVES.  The three zones differ by OPACITY, by EDGE STYLE (solid
  / wire / dashed) and by a LABEL carrying the word, never by colour alone.

  THE PIPES (DEV.md 4c C80).  The engine ROUTES every pipe and measures it;
  this module only carries the published polyline into three.js coordinates
  and decides how it LOOKS: its phase read off the published vapour fraction
  (`phaseOf`, three words, each with its own particle SHAPE beside its colour),
  and a stylised particle speed that grows monotonically with the published
  mass flow (`particleSpeed`, said in the legend).  No route, length or
  junction position is computed here.

  LEGIBILITY (Vítor, on the live site, 2026-10-17).  A label carries the item
  id ONLY; everything else an item or a pipe has to say is its hover TOOLTIP.
  Labels that collide on screen are DECLUTTERED by priority -- findings over
  items over the rest over zone labels (`declutter`, pure) -- and the camera
  opens FITTED on the plant (`cameraFit`, pure), with Plan and Elevation
  presets fitted the same way.
\*---------------------------------------------------------------------------*/

import type { PlantLayout, LayoutItem, LayoutPipe } from "../adapters/SolverAdapter.js";

export type Vec3 = [number, number, number];

/** One solid: a cylinder (along `axis`) or a box, in three.js coordinates. */
export interface SceneSolid {
  id: string;
  kind: string;
  sector: string;
  shape: "cylinder" | "box";
  /** three.js axis of a cylinder: "y" stands, "x"/"z" lie on the ground. */
  axis: "x" | "y" | "z";
  center: Vec3;
  /** Extents along three.js X, Y (up), Z. */
  size: Vec3;
  nonProcess: boolean;
  footprintFrom: "published" | "declared";
  ignition: boolean;
  release: boolean;
  /** The engine published a finding naming this item. */
  flagged: boolean;
  /** The text drawn beside it: the item id, and nothing else. */
  label: string;
  /** What the hover tooltip says: kind, size and where it came from, the
   *  hazards the case declared, and every finding naming the item. */
  tooltip: string[];
}

/** One hazardous-area envelope: a vertical cylinder. */
export interface SceneZone {
  itemId: string;
  zone: number;
  /** Centre of the cylinder (three.js), its radius and height. */
  center: Vec3;
  radius: number;
  height: number;
  /** Fill opacity, and the edge style -- the two non-colour channels. */
  opacity: number;
  edge: "solid" | "wire" | "dashed";
  label: string;
}

export interface SceneArea {
  sector: string;
  /** Ground rectangle in three.js X/Z. */
  x0: number; x1: number; z0: number; z1: number;
  label: string;
}

/** A line between two items the engine named in one finding. */
export interface SceneLink {
  findingId: string;
  kind: string;
  from: Vec3;
  to: Vec3;
  label: string;
}

export interface SceneWind {
  /** Arrow tail and head (three.js), the head pointing where the wind GOES. */
  tail: Vec3;
  head: Vec3;
  label: string;
}

/** The phase a pipe is drawn in, read off the published vapour fraction. */
export type Phase = "liquid" | "vapour" | "twoPhase" | "unknown";

/** One routed pipe, in three.js coordinates, IN THE DIRECTION OF FLOW. */
export interface ScenePipe {
  id: string;
  stream: string;
  phase: Phase;
  /** The engine's polyline, mapped; the first point is the source end. */
  points: Vec3[];
  /** The engine's length (m), carried, never re-measured. */
  length: number;
  /** Published mass flow (kg/s), when the run carries molar masses. */
  massFlow: number | null;
  /** Drawing radius (m) and particle speed (m/s): stylised, monotone in flow. */
  radius: number;
  speed: number;
  tooltip: string[];
}

export interface SceneJunction {
  unit: string;
  at: Vec3;
  label: string;
}

/** The rack: portals along plan x, one beam per tier the pipes use. */
export interface SceneRack {
  x0: number; x1: number;
  /** three.js Z of the rack's centre line, and its half width. */
  zc: number; halfWidth: number;
  /** Heights of the tiers the published lanes occupy. */
  tiers: number[];
  /** Plan x of each portal (a drawing convention: every RACK_PORTAL_SPACING). */
  portals: number[];
  label: string;
}

export interface LayoutScene {
  solids: SceneSolid[];
  zones: SceneZone[];
  areas: SceneArea[];
  links: SceneLink[];
  wind: SceneWind | null;
  pipes: ScenePipe[];
  junctions: SceneJunction[];
  rack: SceneRack | null;
  /** Bounding box of everything drawn, for the ground grid. */
  min: Vec3;
  max: Vec3;
  /** Bounding box the camera FITS: the placed process items, the pipes and
   *  the junctions (a building or a tank farm far off still lies inside it
   *  only when the case placed it as process equipment). */
  fitMin: Vec3;
  fitMax: Vec3;
}

//  ---- the pipe's look, from what the engine published --------------------

/** vf within this of 0 or 1 is single-phase: a flash's converged split
 *  prints vf = 0.999999999 for a vapour. */
export const PHASE_TOLERANCE = 1e-6;

export function phaseOf(vf: number | undefined): Phase {
  if (vf === undefined || !Number.isFinite(vf)) return "unknown";
  if (vf <= PHASE_TOLERANCE) return "liquid";
  if (vf >= 1 - PHASE_TOLERANCE) return "vapour";
  return "twoPhase";
}

/** The legend's words for each phase -- the channel that survives greyscale
 *  together with the particle shape. */
export const PHASE_WORDS: Record<Phase, string> = {
  liquid: "liquid (vf = 0)",
  vapour: "vapour (vf = 1)",
  twoPhase: "two-phase (0 < vf < 1)",
  unknown: "phase not published",
};

/** Pipe colour per phase: one channel of three (the particle SHAPE and the
 *  legend WORD are the others), shared by the 3D view and the tables. */
export const PHASE_COLOURS: Record<Phase, number> = {
  liquid:   0x1971c2,
  vapour:   0xc2255c,
  twoPhase: 0x2b8a3e,
  unknown:  0x868e96,
};

export const phaseCss = (p: Phase): string =>
  `#${PHASE_COLOURS[p].toString(16).padStart(6, "0")}`;

/** The particle each phase carries: a sphere is a drop, an octahedron a
 *  gas parcel, the two alternate in a two-phase pipe. */
export const PHASE_PARTICLE: Record<Phase, "sphere" | "octahedron" | "alternating" | "cube"> = {
  liquid: "sphere",
  vapour: "octahedron",
  twoPhase: "alternating",
  unknown: "cube",
};

/** Particle speed on screen (m/s in the scene) for a published mass flow
 *  (kg/s): 1.2 + 2.4 log10(1 + m).  Monotone in the flow and STYLISED --
 *  it is not the fluid's velocity, which needs a pipe diameter nobody has
 *  sized yet.  An unpublished flow moves at the slowest speed. */
export function particleSpeed(massFlow: number | null | undefined): number {
  const m = massFlow !== null && massFlow !== undefined && Number.isFinite(massFlow)
    ? Math.max(0, massFlow) : 0;
  return 1.2 + 2.4 * Math.log10(1 + m);
}

/** The words the legend prints for the speed rule (one home). */
export const SPEED_RULE =
  "particle speed = 1.2 + 2.4·log10(1 + ṁ / (kg/s)) m/s, and tube thickness grows with ṁ"
  + " the same way -- stylised, monotone in the mass flow, not the fluid's velocity";

/** Drawing radius (m) of a pipe's tube, monotone in the mass flow. */
export function tubeRadius(massFlow: number | null | undefined): number {
  const m = massFlow !== null && massFlow !== undefined && Number.isFinite(massFlow)
    ? Math.max(0, massFlow) : 0;
  return 0.1 + 0.05 * Math.log10(1 + m);
}

/** How a pipe end reads in a table or a tooltip. */
export function endName(kind: string, at: string): string {
  if (kind === "batteryLimit") return `battery limit (${at})`;
  if (kind === "junction") return `${at} (junction)`;
  return at;
}

/** Portal spacing of the drawn rack (m): a drawing convention, not data. */
export const RACK_PORTAL_SPACING = 6;

function pipeOf(p: LayoutPipe): ScenePipe {
  const phase = phaseOf(p.vf);
  const massFlow = p.F_mass !== undefined && Number.isFinite(p.F_mass) ? p.F_mass : null;
  const lines = [
    p.label ? `${p.stream} (${p.label})` : p.stream,
    `${endName(p.fromKind, p.from)} → ${endName(p.toKind, p.to)}`,
    PHASE_WORDS[phase],
  ];
  const tp: string[] = [];
  if (p.T !== undefined) tp.push(`T ${p.T.toFixed(1)} K`);
  if (p.P !== undefined) tp.push(`P ${(p.P / 1e5).toFixed(2)} bar`);
  if (tp.length) lines.push(tp.join(" · "));
  if (massFlow !== null) lines.push(`ṁ ${massFlow.toPrecision(4)} kg/s`);
  lines.push(`length ${p.length.toFixed(1)} m (${p.routedBy === "waypoints"
    ? "declared waypoints" : "routed on the rack"})`);
  return {
    id: `pipe:${p.stream}`, stream: p.stream, phase,
    points: p.route.map(([x, y, z]) => toThree(x, y, z)),
    length: p.length, massFlow,
    radius: tubeRadius(massFlow), speed: particleSpeed(massFlow),
    tooltip: lines,
  };
}

//  ---- legibility: declutter and fit (pure) --------------------------------

/** Label priorities: a finding outranks an item, an item the rest, and a
 *  zone label yields to everything. */
export const LABEL_PRIORITY = { finding: 3, item: 2, other: 1, zone: 0 } as const;

/** A label's screen box: centre (x, y) and size, in pixels. */
export interface LabelBox { key: string; priority: number; x: number; y: number; w: number; h: number }

/** Which labels to show: by priority (highest first; ties in input order),
 *  each kept only if its box, padded by `pad` px, overlaps no label already
 *  kept.  Pure, so the rule is tested without a screen. */
export function declutter(boxes: LabelBox[], pad = 2): Set<string> {
  const order = boxes.map((b, i) => ({ b, i }))
    .sort((p, q) => q.b.priority - p.b.priority || p.i - q.i);
  const kept: LabelBox[] = [];
  const out = new Set<string>();
  for (const { b } of order) {
    if (!(b.w > 0 && b.h > 0) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const hit = kept.some((k) =>
      Math.abs(k.x - b.x) * 2 < k.w + b.w + 2 * pad
      && Math.abs(k.y - b.y) * 2 < k.h + b.h + 2 * pad);
    if (hit) continue;
    kept.push(b);
    out.add(b.key);
  }
  return out;
}

export type ViewPreset = "3d" | "plan" | "elevation";

/** Where the camera stands to FIT the box [min, max] (three.js coordinates)
 *  with a relative `margin`, for a perspective camera of vertical field of
 *  view `fovDeg` and aspect `aspect`.  "3d" looks from the south-west and
 *  above, fitting the box's bounding sphere; "plan" looks straight down with
 *  plan north up the screen; "elevation" looks north from the south, plan x
 *  across the screen.  Plan and elevation fit the box's PROJECTED rectangle,
 *  so the plant fills the frame rather than its sphere. */
export function cameraFit(min: Vec3, max: Vec3, view: ViewPreset, fovDeg: number,
                          aspect: number, margin = 0.15): { position: Vec3; target: Vec3 } {
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const ext: Vec3 = [Math.max(max[0] - min[0], 1), Math.max(max[1] - min[1], 1),
                     Math.max(max[2] - min[2], 1)];
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-3));
  const k = 1 + margin;
  if (view === "plan") {
    const d = k * Math.max(ext[0] / 2 / Math.tan(hHalf), ext[2] / 2 / Math.tan(vHalf));
    //  A hair toward +Z, so the orbit has an "up" and plan north (-Z) is up.
    return { position: [c[0], max[1] + d, c[2] + 1e-3 * d], target: [c[0], c[1], c[2]] };
  }
  if (view === "elevation") {
    const d = k * Math.max(ext[0] / 2 / Math.tan(hHalf), ext[1] / 2 / Math.tan(vHalf));
    return { position: [c[0], c[1], max[2] + d], target: c };
  }
  const r = (k * Math.hypot(ext[0], ext[1], ext[2])) / 2;
  const d = r / Math.sin(Math.min(vHalf, hHalf));
  const dir = [-0.6, 0.7, 0.9];
  const n = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
  return { position: [c[0] + (d * dir[0]!) / n, c[1] + (d * dir[1]!) / n,
                      c[2] + (d * dir[2]!) / n], target: c };
}

/** Plan (x, y, z-up) to three.js (X, Y-up, Z). */
export function toThree(x: number, y: number, z: number): Vec3 {
  return [x, z, -y];
}

const FINDING_KINDS_THAT_FLAG = new Set(
  ["separation", "outsideArea", "ignitionInZone", "ignitionDownwind"]);

/** The item ids a finding names.  `b` of a zone finding is
 *  `<release item>#zone<n>`; of an area finding a SECTOR (not an item). */
function namedItems(kind: string, a: string, b: string): string[] {
  if (kind === "outsideArea") return [a];
  if (kind === "ignitionInZone") return [a, b.split("#zone")[0] ?? b];
  return [a, b];
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "?";
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

function solidOf(it: LayoutItem, flagged: boolean, findings: string[]): SceneSolid {
  //  three.js extents: X = plan dx, Y = dz (up), Z = plan dy.
  const size: Vec3 = [it.dx, it.dz, it.dy];
  const center = toThree(it.x, it.y, it.z + 0.5 * it.dz);
  const axis: "x" | "y" | "z" =
    it.orientation === "alongX" ? "x" : it.orientation === "alongY" ? "z" : "y";
  const what = it.nonProcess ? `${it.kind} (non-process)` : it.kind;
  const sizeWord = it.footprintFrom === "declared" ? "declared box" : "own sizing";
  const dims = it.shape === "cylinder"
    ? (it.orientation === "vertical" ? `D ${fmt(it.dx)} m × H ${fmt(it.dz)} m`
      : `D ${fmt(it.orientation === "alongX" ? it.dy : it.dx)} m × L ${fmt(it.orientation === "alongX" ? it.dx : it.dy)} m`)
    : `${fmt(it.dx)} × ${fmt(it.dy)} × ${fmt(it.dz)} m`;
  const tooltip = [
    it.id + (it.sector ? ` (sector ${it.sector})` : ""),
    `${what} · ${dims} · ${sizeWord}`,
    `at (${fmt(it.x)}, ${fmt(it.y)}) m, base z ${fmt(it.z)} m`,
  ];
  if (it.release)
    tooltip.push(`release source (zones ${it.release.zones.map((z) => z.zone).join(", ") || "none"})`);
  if (it.ignition) tooltip.push(`ignition source: ${it.ignition}`);
  for (const f of findings) tooltip.push(`FINDING: ${f}`);
  return {
    id: it.id, kind: it.kind, sector: it.sector,
    shape: it.shape, axis, center, size,
    nonProcess: it.nonProcess, footprintFrom: it.footprintFrom,
    ignition: !!it.ignition, release: !!it.release, flagged,
    //  A flagged item's label carries a warning GLYPH beside its id: the
    //  word channel that survives greyscale; the finding itself is in the
    //  tooltip and on the link's own tag.
    label: flagged ? `⚠ ${it.id}` : it.id,
    tooltip,
  };
}

const ZONE_STYLE: Record<number, { opacity: number; edge: SceneZone["edge"] }> = {
  0: { opacity: 0.45, edge: "solid" },
  1: { opacity: 0.25, edge: "wire" },
  2: { opacity: 0.12, edge: "dashed" },
};

/** The scene for one published layout block.  Returns null when there is
 *  nothing to draw -- an absent layout draws no frame at all. */
export function layoutScene(layout: PlantLayout | undefined): LayoutScene | null {
  if (!layout || layout.items.length === 0) return null;

  const flaggedIds = new Set<string>();
  const messagesOf = new Map<string, string[]>();
  for (const f of layout.findings)
    if (FINDING_KINDS_THAT_FLAG.has(f.kind))
      for (const id of namedItems(f.kind, f.a, f.b)) {
        flaggedIds.add(id);
        messagesOf.set(id, [...(messagesOf.get(id) ?? []), f.message]);
      }

  const solids = layout.items.map((it) =>
    solidOf(it, flaggedIds.has(it.id), messagesOf.get(it.id) ?? []));
  const byId = new Map(layout.items.map((it) => [it.id, it]));

  const zones: SceneZone[] = [];
  for (const it of layout.items)
    for (const z of it.release?.zones ?? []) {
      const st = ZONE_STYLE[z.zone] ?? ZONE_STYLE[2]!;
      zones.push({
        itemId: it.id, zone: z.zone,
        center: toThree(it.x, it.y, it.z + 0.5 * z.height),
        radius: z.radius, height: z.height,
        opacity: st.opacity, edge: st.edge,
        label: `zone ${z.zone} · ${it.id}`,
      });
    }

  const areas: SceneArea[] = layout.areas.map((a) => ({
    sector: a.sector,
    x0: a.xMin, x1: a.xMax, z0: -a.yMax, z1: -a.yMin,
    label: `sector ${a.sector}`,
  }));

  const links: SceneLink[] = [];
  for (const f of layout.findings) {
    if (f.kind !== "separation" && f.kind !== "ignitionDownwind") continue;
    const a = byId.get(f.a), b = byId.get(f.b);
    if (!a || !b) continue;
    const ha = a.z + 0.5 * a.dz, hb = b.z + 0.5 * b.dz;
    links.push({
      findingId: f.id, kind: f.kind,
      from: toThree(a.x, a.y, ha), to: toThree(b.x, b.y, hb),
      label: f.kind === "separation"
        ? `${fmt(f.value)} m < ${fmt(f.limit)} m declared`
        : `downwind, ${fmt(f.value)} m`,
    });
  }

  //  Bounds over solids, zones and areas.
  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (p: Vec3) => {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!);
      max[k] = Math.max(max[k]!, p[k]!);
    }
  };
  for (const s of solids) {
    grow([s.center[0] - s.size[0] / 2, s.center[1] - s.size[1] / 2, s.center[2] - s.size[2] / 2]);
    grow([s.center[0] + s.size[0] / 2, s.center[1] + s.size[1] / 2, s.center[2] + s.size[2] / 2]);
  }
  for (const z of zones) {
    grow([z.center[0] - z.radius, z.center[1] - z.height / 2, z.center[2] - z.radius]);
    grow([z.center[0] + z.radius, z.center[1] + z.height / 2, z.center[2] + z.radius]);
  }
  for (const a of areas) { grow([a.x0, 0, a.z0]); grow([a.x1, 0, a.z1]); }

  //  The pipes, the junctions and the rack, as the engine routed them.
  const pipes = (layout.pipes ?? []).map(pipeOf);
  const junctions: SceneJunction[] = (layout.junctions ?? []).map((j) => ({
    unit: j.unit, at: toThree(j.x, j.y, j.z), label: `${j.unit} (${j.type})`,
  }));
  let rack: SceneRack | null = null;
  const k = layout.pipeRack;
  if (k && pipes.length > 0) {
    const lanes = (layout.pipes ?? []).map((p) => p.lane).filter((l) => l >= 0);
    const nTiers = lanes.length ? Math.floor(Math.max(...lanes) / k.lanesPerTier) + 1 : 1;
    const portals: number[] = [];
    for (let x = k.xStart; x <= k.xEnd + 1e-9; x += RACK_PORTAL_SPACING) portals.push(x);
    if (portals[portals.length - 1]! < k.xEnd - 1e-9) portals.push(k.xEnd);
    rack = {
      x0: k.xStart, x1: k.xEnd, zc: -k.y,
      halfWidth: 0.5 * k.lanesPerTier * k.laneSpacing,
      tiers: Array.from({ length: nTiers }, (_, t) => k.elevation + t * k.tierSpacing),
      portals,
      label: k.declared ? "pipe rack" : "pipe rack (engine default)",
    };
    grow([rack.x0, rack.tiers[rack.tiers.length - 1]!, rack.zc - rack.halfWidth]);
    grow([rack.x1, 0, rack.zc + rack.halfWidth]);
  }
  for (const p of pipes) for (const q of p.points) grow(q);

  //  What the camera fits: the plant, not the ground around it.
  const fitMin: Vec3 = [Infinity, Infinity, Infinity];
  const fitMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  const fit = (q: Vec3) => {
    for (let i = 0; i < 3; i++) {
      fitMin[i] = Math.min(fitMin[i]!, q[i]!);
      fitMax[i] = Math.max(fitMax[i]!, q[i]!);
    }
  };
  const process = solids.filter((x) => !x.nonProcess);
  for (const x of process.length ? process : solids) {
    fit([x.center[0] - x.size[0] / 2, x.center[1] - x.size[1] / 2, x.center[2] - x.size[2] / 2]);
    fit([x.center[0] + x.size[0] / 2, x.center[1] + x.size[1] / 2, x.center[2] + x.size[2] / 2]);
  }
  for (const p of pipes) for (const q of p.points) fit(q);
  for (const j of junctions) fit(j.at);
  fitMin[1] = Math.min(fitMin[1]!, 0);

  //  The wind arrow: the CASE's angles, drawn upwind of the plant pointing
  //  across it.  `from` is a true bearing, `planNorth` the true bearing of
  //  the plan's +y; the plan bearing the wind blows TOWARD is
  //  from + 180 - planNorth, clockwise from +y.
  let wind: SceneWind | null = null;
  if (layout.wind) {
    const w = layout.wind;
    const toward = ((w.from + 180 - w.planNorth) * Math.PI) / 180;
    const ux = Math.sin(toward), uy = Math.cos(toward);   // plan unit vector
    const cx = (min[0] + max[0]) / 2, cy = -(min[2] + max[2]) / 2;
    const span = Math.max(max[0] - min[0], max[2] - min[2], 1);
    const tailR = 0.75 * span, headR = 0.45 * span;
    const top = Math.max(max[1], 1) + 2;
    wind = {
      tail: toThree(cx - ux * tailR, cy - uy * tailR, top),
      head: toThree(cx - ux * headR, cy - uy * headR, top),
      label: `wind from ${fmt(w.from)}° (true)`,
    };
    grow(wind.tail); grow(wind.head);
  }

  return { solids, zones, areas, links, wind, pipes, junctions, rack, min, max,
           fitMin, fitMax };
}

/** The point at arc length `s` along a polyline, wrapping round its total
 *  length (a particle that leaves the target end re-enters at the source):
 *  the drawing's own bookkeeping for the flow animation, never a length the
 *  engine is asked for. */
export function pointAlong(points: Vec3[], s: number): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  if (points.length === 1) return [...points[0]!];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    seg.push(d);
    total += d;
  }
  if (!(total > 0)) return [...points[0]!];
  let r = ((s % total) + total) % total;
  for (let i = 0; i < seg.length; i++) {
    const d = seg[i]!;
    if (r <= d || i === seg.length - 1) {
      const t = d > 0 ? Math.min(1, r / d) : 0;
      const a = points[i]!, b = points[i + 1]!;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    }
    r -= d;
  }
  return [...points[points.length - 1]!];
}

/** Whether the reader asked the system for reduced motion: the flow starts
 *  OFF then (the toggle still turns it on). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
