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
  item is the box the case declared.  Nothing here guesses a nicer shape;
  how each KIND is drawn on that envelope (heads, saddles, ladders -- DEV.md
  4c C88) is case/equipmentModel.ts, which reads the solid this module maps.

  GREYSCALE SURVIVES.  The three zones differ by OPACITY, by EDGE STYLE (solid
  / wire / dashed) and by a LABEL carrying the word, never by colour alone.

  THE PIPES (DEV.md 4c C80).  The engine ROUTES every pipe and measures it;
  this module only carries the published polyline into three.js coordinates
  and decides how it LOOKS: its phase read off the published vapour fraction
  (`phaseOf`, three words, each with its own particle SHAPE beside its colour),
  and a stylised particle speed that grows monotonically with the published
  mass flow (`particleSpeed`, said in the legend).  No route, length or
  junction position is computed here.

  THE ROADS (DEV.md 4c C90).  The engine checks the roads the case declared
  and publishes each centre line, its length, the paved area and, per item,
  the nearest road a gate reaches; this module carries the centre lines into
  three.js coordinates and works out only what is DRAWING: which end of a
  road is free (so its markings stop at a junction), where a gate's barrier
  arm crosses the road (at the point the engine published, across the road's
  width), and which rack portals give way to a road passing under the rack
  (portals are a drawing convention, RACK_PORTAL_SPACING).  No length, area
  or distance is computed here.

  THE FENCE (DEV.md 4c C93).  The engine derives the fence from the plot,
  opens it at each gate and publishes where every boundary pipe crosses it,
  with the case's label for where the stream comes from or goes to; this
  module cuts the published rectangle at the published openings, spaces the
  posts (FENCE_POST_SPACING, drawing) and carries each crossing onto a short
  pipeline stub and a sign outside the fence (PIPELINE_STUB, drawing).  A
  stream the engine could NOT route is marked at the end it reached (a
  dashed stub, UNROUTED_STUB, drawing) with the engine's reason: a missing
  pipe must never look like a finished drawing.

  LEGIBILITY (Vítor, on the live site, 2026-10-17).  A label carries the item
  id ONLY; everything else an item or a pipe has to say is its hover TOOLTIP.
  Labels that collide on screen are DECLUTTERED by priority -- findings over
  items over the rest over zone labels (`declutter`, pure) -- and the camera
  opens FITTED on the plant (`cameraFit`, pure), with Plan and Elevation
  presets fitted the same way.
\*---------------------------------------------------------------------------*/

import type {
  PlantLayout, LayoutAccess, LayoutItem, LayoutPipe, LayoutRoad,
} from "../adapters/SolverAdapter.js";

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

/** One declared road, in three.js coordinates at grade (DEV.md 4c C90). */
export interface SceneRoad {
  id: string;
  road: string;
  width: number;
  /** The engine's centre line, mapped (Y = 0). */
  points: Vec3[];
  /** Whether each END of the centre line is free -- not on another road --
   *  so the markings run to it (a drawing decision only). */
  freeStart: boolean;
  freeEnd: boolean;
  /** No gate reaches it (the engine said so in a finding). */
  disconnected: boolean;
  /** The engine's length, carried. */
  length: number;
  tooltip: string[];
}

/** A gate's barrier arm: from its post beside the road, across the road,
 *  at the point on the centre line the engine published for the gate.
 *  Drawing, said so: the engine places no barrier. */
export interface SceneBarrier {
  gate: string;
  post: Vec3;
  end: Vec3;
}

/** THE FENCE (DEV.md 4c C93), as the engine drew it: its runs at grade (the
 *  rectangle with a gap at each gate opening), the posts along them and the
 *  height they are drawn to.  The posts' spacing and the height are DRAWING
 *  (FENCE_POST_SPACING, FENCE_HEIGHT): the engine publishes the line, not a
 *  fence design. */
export interface SceneFence {
  runs: [Vec3, Vec3][];
  posts: Vec3[];
  /** Each gate's opening: its centre on the line and its width. */
  openings: { gate: string; at: Vec3; width: number }[];
  height: number;
  tooltip: string[];
}

/** A boundary pipe crossing the fence: where it meets the line (at the
 *  pipe's own height), the pipeline drawn on a short way OUTSIDE the fence
 *  (PIPELINE_STUB, drawing), the sign beside it at grade and the words on
 *  the sign -- the case's own label for where the stream comes from or goes
 *  to, or that none was declared. */
export interface SceneCrossing {
  stream: string;
  direction: "in" | "out";
  at: Vec3;
  outside: Vec3;
  sign: Vec3;
  text: string;
  labelled: boolean;
  tooltip: string[];
}

/** A stream the engine did NOT route (DEV.md 4c C93), marked where its one
 *  reachable end is: a dashed stub rising UNROUTED_STUB from that end and a
 *  warning label, the engine's reason in the tooltip.  `at` is null when the
 *  engine reached neither end; the view then still says so, in words.  A
 *  missing pipe must never look like a finished drawing. */
export interface SceneUnrouted {
  stream: string;
  at: Vec3 | null;
  top: Vec3 | null;
  text: string;
  tooltip: string[];
}

/** Height of the dashed stub that marks an unrouted stream (drawing). */
export const UNROUTED_STUB = 4;

/** Drawing constants of the fence and its crossings -- not data. */
export const FENCE_HEIGHT = 2.2;          // m, a chain-link fence's usual look
export const FENCE_POST_SPACING = 3.0;    // m
export const PIPELINE_STUB = 12;          // m drawn outside the fence

export interface LayoutScene {
  solids: SceneSolid[];
  /** THE FENCE (DEV.md 4c C93); null when the case declares none. */
  fence: SceneFence | null;
  crossings: SceneCrossing[];
  /** The streams the engine could not route, marked (C93); empty when every
   *  stream has its pipe. */
  unrouted: SceneUnrouted[];
  /** THE ROADS (DEV.md 4c C90); empty when the case declares none. */
  roads: SceneRoad[];
  barriers: SceneBarrier[];
  zones: SceneZone[];
  areas: SceneArea[];
  /** THE PLOT (DEV.md 4c C82): the rectangle the engine published, outlined
   *  on the ground; null when the result carries none.  Not computed here. */
  plot: SceneArea | null;
  links: SceneLink[];
  wind: SceneWind | null;
  pipes: ScenePipe[];
  junctions: SceneJunction[];
  rack: SceneRack | null;
  /** Bounding box of everything drawn, for the ground grid. */
  min: Vec3;
  max: Vec3;
  /** Bounding box the camera FITS: the placed process items, the pipes,
   *  the junctions and the declared roads (a building far off still lies
   *  inside it only when a road or the process reaches it). */
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
  ["separation", "outsideArea", "ignitionInZone", "ignitionDownwind",
   //  C90: an item the road network does not serve.
   "noRoadAccess", "buildingNotReached", "weighbridgeOffRoad", "gateOffRoad"]);

/** Findings that name a ROAD (its `a`), told in the road's tooltip. */
const ROAD_FINDINGS = new Set(["roadInZone", "roadDisconnected"]);

/** The item ids a finding names.  `b` of a zone finding is
 *  `<release item>#zone<n>`; of an area finding a SECTOR (not an item). */
function namedItems(kind: string, a: string, b: string): string[] {
  if (kind === "outsideArea" || kind === "noRoadAccess" || kind === "buildingNotReached"
      || kind === "weighbridgeOffRoad" || kind === "gateOffRoad") return [a];
  if (kind === "ignitionInZone") return [a, b.split("#zone")[0] ?? b];
  return [a, b];
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "?";
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

function solidOf(it: LayoutItem, flagged: boolean, findings: string[],
                 access?: LayoutAccess): SceneSolid {
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
  if (it.reason) tooltip.push(`why: ${it.reason}`);
  if (it.source) tooltip.push(`source: ${it.source}`);
  if (access)
    tooltip.push(access.road
      ? (access.onDeck ? `on road ${access.road} (it drives over the deck)`
        : `nearest road a gate reaches: ${access.road}, ${fmt(access.distance ?? NaN)} m`)
      : "no road a gate reaches");
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

  const accessOf = new Map((layout.access ?? []).map((a) => [a.item, a]));
  const solids = layout.items.map((it) =>
    solidOf(it, flaggedIds.has(it.id), messagesOf.get(it.id) ?? [], accessOf.get(it.id)));
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

  const p = layout.plot;
  const plot: SceneArea | null = p
    ? { sector: "", x0: p.xMin, x1: p.xMax, z0: -p.yMax, z1: -p.yMin,
        label: `plot ${p.plotArea.toFixed(0)} m²` }
    : null;

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
  if (plot) { grow([plot.x0, 0, plot.z0]); grow([plot.x1, 0, plot.z1]); }

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
    const portals = rackPortals(k.xStart, k.xEnd, layout.rackCrossings ?? []);
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

  //  The roads (C90), as the engine checked them.
  const roads = roadsOf(layout);
  for (const r of roads)
    for (const q of r.points) {
      grow([q[0] - r.width / 2, 0, q[2] - r.width / 2]);
      grow([q[0] + r.width / 2, 0, q[2] + r.width / 2]);
    }
  const barriers = barriersOf(layout);

  //  The fence (C93), as the engine drew it, and the pipes that cross it.
  const fence = fenceOf(layout);
  const crossings = crossingsOf(layout);
  if (fence) for (const [a, b] of fence.runs) { grow(a); grow(b); }
  for (const c of crossings) grow(c.outside);
  const unrouted = unroutedOf(layout);
  for (const u of unrouted) if (u.top) grow(u.top);

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
  //  The roads (C90) join the site to the plant: a site whose roads the case
  //  declared is framed with them, so the gate and the buildings they serve
  //  are in the first view.
  for (const r of roads)
    for (const q of r.points) {
      fit([q[0] - r.width / 2, 0, q[2] - r.width / 2]);
      fit([q[0] + r.width / 2, 0, q[2] + r.width / 2]);
    }
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

  return { solids, fence, crossings, unrouted, roads, barriers, zones, areas, plot, links, wind, pipes,
           junctions, rack, min, max, fitMin, fitMax };
}

//  ---- the fence: drawing bookkeeping only (DEV.md 4c C93) -----------------

/** The fence's runs (the engine's rectangle, cut at each gate opening the
 *  engine published), and its posts every FENCE_POST_SPACING along each run
 *  and at both ends.  Null when the case declares no fence. */
export function fenceOf(layout: PlantLayout): SceneFence | null {
  const f = layout.fence;
  if (!f) return null;
  const openings = layout.fenceOpenings ?? [];
  //  The four sides, each as a plan segment, counter-clockwise from the
  //  south-west corner; the coordinate that runs ALONG each side.
  const sides: { side: string; a: [number, number]; b: [number, number]; along: 0 | 1 }[] = [
    { side: "south", a: [f.xMin, f.yMin], b: [f.xMax, f.yMin], along: 0 },
    { side: "east",  a: [f.xMax, f.yMin], b: [f.xMax, f.yMax], along: 1 },
    { side: "north", a: [f.xMin, f.yMax], b: [f.xMax, f.yMax], along: 0 },
    { side: "west",  a: [f.xMin, f.yMin], b: [f.xMin, f.yMax], along: 1 },
  ];
  const runs: [Vec3, Vec3][] = [];
  const posts: Vec3[] = [];
  const at = (s: typeof sides[number], t: number): Vec3 => s.along === 0
    ? toThree(t, s.a[1], 0) : toThree(s.a[0], t, 0);
  for (const s of sides) {
    const lo = s.a[s.along]!, hi = s.b[s.along]!;
    const gaps = openings.filter((o) => o.side === s.side)
      .map((o) => { const c = s.along === 0 ? o.x : o.y; return [c - o.width / 2, c + o.width / 2]; })
      .sort((p, q) => p[0]! - q[0]!);
    let t = lo;
    const pieces: [number, number][] = [];
    for (const [g0, g1] of gaps) {
      if (g0! > t) pieces.push([t, Math.min(g0!, hi)]);
      t = Math.max(t, g1!);
    }
    if (t < hi) pieces.push([t, hi]);
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 1e-6) continue;
      runs.push([at(s, p0), at(s, p1)]);
      const n = Math.max(1, Math.round((p1 - p0) / FENCE_POST_SPACING));
      for (let k = 0; k <= n; k++) posts.push(at(s, p0 + ((p1 - p0) * k) / n));
    }
  }
  //  A corner is the end of two runs: one post there.
  const seen = new Set<string>();
  const uniq = posts.filter((p) => {
    const key = `${p[0].toFixed(3)},${p[2].toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    runs, posts: uniq, height: FENCE_HEIGHT,
    openings: openings.map((o) => ({ gate: o.gate, at: toThree(o.x, o.y, 0), width: o.width })),
    tooltip: [
      `fence · ${fmt(f.length)} m round (the engine's length)`,
      `the plot's boundary moved ${fmt(f.inset)} m inward`
        + (f.insetDeclared ? " (declared)" : " (none declared: on the boundary)"),
      ...openings.map((o) => `opens for gate ${o.gate}: ${fmt(o.width)} m on the ${o.side} side`
        + (o.road ? ` (road ${o.road})` : "")),
      `why: ${f.reason}`, `source: ${f.source}`,
      "drawn as: chain-link on posts, its height and post spacing drawing, not data",
    ],
  };
}

/** Each boundary pipe's crossing: the engine's point on the fence, the
 *  pipeline drawn on PIPELINE_STUB outward from it, and a sign beside it at
 *  grade with the case's label. */
export function crossingsOf(layout: PlantLayout): SceneCrossing[] {
  const out: Record<string, [number, number]> = {
    south: [0, -1], north: [0, 1], west: [-1, 0], east: [1, 0] };
  return (layout.fenceCrossings ?? []).map((c) => {
    const [nx, ny] = out[c.side] ?? [0, -1];
    //  The sign stands 2 m outside the fence and 1.5 m to one side of the
    //  pipe (drawing), where a reader walking the fence would see it.
    const tx = -ny, ty = nx;
    const word = c.direction === "in" ? "from" : "to";
    const text = c.labelDeclared ? `${c.stream} ${word}: ${c.label}`
      : `${c.stream}: ${c.direction === "in" ? "origin" : "destination"} NOT declared`;
    return {
      stream: c.stream, direction: c.direction,
      at: toThree(c.x, c.y, c.z),
      outside: toThree(c.x + nx * PIPELINE_STUB, c.y + ny * PIPELINE_STUB, c.z),
      sign: toThree(c.x + nx * 2 + tx * 1.5, c.y + ny * 2 + ty * 1.5, 0),
      text, labelled: c.labelDeclared,
      tooltip: [
        `${c.stream} crosses the fence (${c.direction === "in" ? "inlet" : "outlet"}),`
          + ` ${c.side} side, at (${fmt(c.x)}, ${fmt(c.y)}) m, ${fmt(c.z)} m up`,
        c.labelDeclared ? `${word}: ${c.label}` : `${word}: NOT declared (the engine announced it)`,
        c.positionFrom === "declared" ? "where the case placed the crossing"
          : c.positionFrom === "waypoints" ? "the end of the case's declared route"
          : "the engine's stated default: where the pipe's rack lane meets the fence",
        `drawn as: the pipeline carried ${fmt(PIPELINE_STUB)} m outside the fence and a sign;`
          + " the stub and the sign are drawing, not data",
      ],
    };
  });
}

/** Each stream the engine left unrouted, marked at the end it reached. */
export function unroutedOf(layout: PlantLayout): SceneUnrouted[] {
  return (layout.notRouted ?? []).map((n) => {
    const a = n.anchor;
    const ends = `${n.fromUnit ? n.fromUnit : "a battery limit"} -> `
      + `${n.toUnit ? n.toUnit : "a battery limit"}`;
    return {
      stream: n.stream,
      at: a ? toThree(a[0], a[1], a[2]) : null,
      top: a ? toThree(a[0], a[1], a[2] + UNROUTED_STUB) : null,
      text: `\u26a0 ${n.stream}: NOT routed`,
      tooltip: [
        `${n.stream} (${ends}) has NO pipe: the engine could not route it`,
        `why: ${n.reason}`,
        a ? "marked at the end the layout reaches; the dashed stub is drawing, not a pipe"
          : "the layout reaches neither end, so there is nowhere on the plan to mark it",
      ],
    };
  });
}

//  ---- the roads: drawing bookkeeping only (DEV.md 4c C90) -----------------

/** The plan x of each drawn rack portal: every RACK_PORTAL_SPACING from the
 *  rack's west end, and its east end -- except where a road the engine says
 *  passes under the rack would stand on a portal; there the portals move to
 *  either side of the road (a drawing convention, like the spacing). */
export function rackPortals(xStart: number, xEnd: number,
                            crossings: { xMin: number; xMax: number }[]): number[] {
  const clear = 0.6;    // portal post clear of the paved edge (m), drawing
  const blocked = (x: number) =>
    crossings.some((c) => x > c.xMin - clear + 1e-9 && x < c.xMax + clear - 1e-9);
  const out: number[] = [];
  for (let x = xStart; x <= xEnd + 1e-9; x += RACK_PORTAL_SPACING) if (!blocked(x)) out.push(x);
  if (out.length === 0 || out[out.length - 1]! < xEnd - 1e-9) if (!blocked(xEnd)) out.push(xEnd);
  for (const c of crossings)
    for (const x of [c.xMin - clear, c.xMax + clear])
      if (x >= xStart - 1e-9 && x <= xEnd + 1e-9 && !blocked(x)) out.push(x);
  return [...new Set(out.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
}

/** Whether plan point (x, y) lies on a road's centre line (any segment). */
function onCentreline(x: number, y: number, r: LayoutRoad): boolean {
  const c = r.centreline;
  for (let i = 0; i + 1 < c.length; i++) {
    const [ax, ay] = c[i]!, [bx, by] = c[i + 1]!;
    if (x >= Math.min(ax, bx) - 1e-6 && x <= Math.max(ax, bx) + 1e-6
        && y >= Math.min(ay, by) - 1e-6 && y <= Math.max(ay, by) + 1e-6) return true;
  }
  return false;
}

function roadsOf(layout: PlantLayout): SceneRoad[] {
  const roads = layout.roads ?? [];
  const told = new Map<string, string[]>();
  for (const f of layout.findings)
    if (ROAD_FINDINGS.has(f.kind)) told.set(f.a, [...(told.get(f.a) ?? []), f.message]);
  return roads.map((r) => {
    const free = (x: number, y: number) => !roads.some((o) => o !== r && onCentreline(x, y, o));
    const [sx, sy] = r.centreline[0]!;
    const [ex, ey] = r.centreline[r.centreline.length - 1]!;
    const msgs = told.get(r.road) ?? [];
    return {
      id: `road:${r.road}`, road: r.road, width: r.width,
      points: r.centreline.map(([x, y]) => toThree(x, y, 0)),
      freeStart: free(sx, sy), freeEnd: free(ex, ey),
      disconnected: !r.fromEntrance, length: r.length,
      tooltip: [`road ${r.road}`, `${fmt(r.width)} m wide · ${fmt(r.length)} m of centre line`
        + " (the engine's length)", ...(r.reason ? [`why: ${r.reason}`] : []),
        ...(r.fromEntrance ? [] : ["no gate reaches it"]),
        ...msgs.map((m) => `FINDING: ${m}`)],
    };
  });
}

/** Each gate's barrier arm: at the point of the road the engine published
 *  for the gate, across that road's width, its post on the guardhouse's
 *  side.  Absent when the engine published no road for the gate. */
function barriersOf(layout: PlantLayout): SceneBarrier[] {
  const out: SceneBarrier[] = [];
  const roads = new Map((layout.roads ?? []).map((r) => [r.road, r]));
  for (const it of layout.items) {
    if (!it.nonProcess || it.kind !== "gate") continue;
    const a = (layout.access ?? []).find((q) => q.item === it.id);
    const r = a?.road ? roads.get(a.road) : undefined;
    if (!a || !r || a.roadX === undefined || a.roadY === undefined) continue;
    //  The segment the published point lies on gives the road's direction.
    let dx = 0, dy = 0;
    for (let i = 0; i + 1 < r.centreline.length; i++) {
      const [ax, ay] = r.centreline[i]!, [bx, by] = r.centreline[i + 1]!;
      if (a.roadX >= Math.min(ax, bx) - 1e-6 && a.roadX <= Math.max(ax, bx) + 1e-6
          && a.roadY >= Math.min(ay, by) - 1e-6 && a.roadY <= Math.max(ay, by) + 1e-6) {
        const L = Math.hypot(bx - ax, by - ay) || 1;
        dx = (bx - ax) / L; dy = (by - ay) / L;
        break;
      }
    }
    if (dx === 0 && dy === 0) continue;
    let nx = -dy, ny = dx;                         // across the road
    if ((it.x - a.roadX) * nx + (it.y - a.roadY) * ny < 0) { nx = -nx; ny = -ny; }
    const h = r.width / 2;
    const ARM_HEIGHT = 1.0;                        // m, drawing
    out.push({
      gate: it.id,
      post: toThree(a.roadX + nx * (h + 0.4), a.roadY + ny * (h + 0.4), ARM_HEIGHT),
      end: toThree(a.roadX - nx * (h - 0.4), a.roadY - ny * (h - 0.4), ARM_HEIGHT),
    });
  }
  return out;
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

//  ---- how much the drawing costs (DEV.md 4c C88) ---------------------------

/** "high": shadows, ambient occlusion, an outline round a flagged item and
 *  the full pixel ratio; "fast": none of them, for a weak laptop.  The
 *  SAME scene either way -- quality moves no item, no pipe and no word. */
export type RenderQuality = "high" | "fast";

/** What the Quality control says it changes (the app and the exported
 *  page say the same sentence). */
export const QUALITY_TITLE = "High: soft shadows, ambient occlusion and an outline round an"
  + " item the engine named in a finding.  Fast: none of them, for a weak laptop.  The plant"
  + " drawn is the same.";

/** The per-viewer memory of the reader's choice (a convenience, never
 *  state anybody else reads). */
export const QUALITY_KEY = "choupo.layout3d.quality";

/** The quality a view opens in when the reader has not chosen: "fast" on a
 *  touch device or one that reports little memory or few cores, "high"
 *  otherwise. */
export function defaultQuality(sig: { coarsePointer: boolean; deviceMemory?: number;
                                      cores?: number }): RenderQuality {
  if (sig.coarsePointer) return "fast";
  if (sig.deviceMemory !== undefined && sig.deviceMemory <= 4) return "fast";
  if (sig.cores !== undefined && sig.cores <= 2) return "fast";
  return "high";
}

/** The reader's remembered choice, else `defaultQuality` of this device. */
export function initialQuality(): RenderQuality {
  try {
    const kept = window.localStorage.getItem(QUALITY_KEY);
    if (kept === "high" || kept === "fast") return kept;
  } catch { /* a private window or blocked storage: fall through */ }
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return defaultQuality({
      coarsePointer: typeof window.matchMedia === "function"
        && window.matchMedia("(pointer: coarse)").matches,
      deviceMemory: nav.deviceMemory,
      cores: nav.hardwareConcurrency,
    });
  } catch {
    return "high";
  }
}

/** Remember the reader's choice in this browser. */
export function rememberQuality(q: RenderQuality): void {
  try { window.localStorage.setItem(QUALITY_KEY, q); } catch { /* not kept: fine */ }
}
