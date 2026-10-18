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
  equipmentModel -- what a placed item LOOKS like in the 3D plant layout, by
  its equipment KIND, with no three.js in it (DEV.md 4c C88).

  THE DATASHEET RULE, APPLIED TO THE PLOT PLAN (CLAUDE.md "the datasheet
  follows the equipment kind, not the unit type").  An item is drawn by its
  `kind` -- the SAME registered word its sizer stamps (`equipmentType`) and
  `equipmentSchematic.ts` dispatches on -- one entry per kind in
  `EQUIPMENT_MODELS`.  A kind with no entry, and every non-process item (a
  building, a substation: its kind is the case's own word), keeps the PLAIN
  drawing the view always had: the engine's cylinder or the case's box.
  There is no generic outline that is nearly right for every kind, and a
  labelled box beats a wrong picture.  Where the CASE declared a box for a
  kind that has a drawing (an exchanger rated without a designed shell, a
  storage tank), the kind is drawn INSIDE that box -- the cylinder inscribed
  in it -- and the hover tooltip says "drawn inside the declared box".

  THE ENGINE'S DIMENSIONS STAY THE TRUTH.  Every part is either BODY or
  DECORATION, and the flag is on the part:
    * BODY parts (the shell, its heads, a cone roof, a chamber) fill EXACTLY
      the envelope the engine published -- diameter and height or length --
      and nothing else; the 2:1 elliptical heads are drawn INSIDE the
      published height, so the straight shell is shorter by D/2 rather than
      the vessel taller (the sizers' H is the height that gives the volume,
      and this view does not invent a tangent-to-tangent reading of it).
      For a declared BOX the body stands inside the box the case declared
      (a compressor's skid spans its whole plan footprint).
    * DECORATION (a skirt, legs, saddles, nozzles, flanges, a caged ladder,
      platforms, an agitator drive, a foundation ring) is a DRAFTING
      CONVENTION of this view, never a number the engine computed.  It may
      stand a little outside the envelope (a platform round a column, a
      nozzle on a head), but it never moves or resizes the body, and the
      label, the hover tooltip, the camera fit and every finding keep reading
      the published envelope.  `tests/equipmentModel.test.ts` holds both
      halves.
  The conventions themselves are named constants below (`ACCESS_FROM`,
  `PLATFORM_SPACING`, ...) so a reader can find, and question, each one.

  ACCESS IS DRAWN BY HEIGHT, NOT BY KIND.  A column shell is sized and priced
  as a `vessel` (ColumnSize.cpp stamps it so), and so is a reflux drum, a
  flash drum and a converter shell: the kind word cannot tell a tower from a
  drum, and this module does not guess from a name.  What it can read is the
  published height, and any vertical item whose top stands more than
  `ACCESS_FROM` above grade gets what such an item has on a real plant -- a
  caged ladder and a platform every `PLATFORM_SPACING`.  A tall column
  therefore looks like one, and so would any other tall vessel, which is
  true of plants.

  SITE BUILDINGS (DEV.md 4c C90).  A non-process item's kind is the CASE's
  word, and a few words name a building a plant site has: `controlRoom`,
  `warehouse` (a portal shed with a pitched roof), `canteen` (windows all
  round and a kitchen vent), `gate` (a guardhouse; its barrier arm across
  the road is the renderer's, at the point the engine published), and
  `weighbridge` (a truck scale: a deck with its ramps).  `SITE_MODELS` holds
  one entry per word, the same posture as the equipment: the BODY (walls,
  roof, deck) fills the box the case declared and nothing else; windows,
  doors, a roof overhang, ramps and vents are decoration.  Any other word --
  `building`, `substation`, a flare -- keeps the plain box.

  COORDINATES.  Parts are in three.js axes (Y up), relative to the CENTRE of
  the item's envelope -- the same `center`/`size` the scene carries
  (case/plantLayout.ts) -- so the renderer only translates them.
\*---------------------------------------------------------------------------*/

import type { SceneSolid, Vec3 } from "./plantLayout.js";

export type Axis = "x" | "y" | "z";

/** What a part is made of in the drawing.  `body` takes the item's own
 *  material (process / non-process); the rest are shared.  An item the
 *  engine named in a finding has every NON-decoration part painted the
 *  finding colour, whatever its role. */
export type PartRole =
  | "body" | "steel" | "grating" | "safety" | "machine" | "motor" | "concrete"
  //  C90, the site buildings: glazing, and a pitched roof (`prism` parts only).
  | "glass" | "roof";

interface PartBase {
  role: PartRole;
  /** True for every part that is a drafting convention of this view and
   *  not the engine's envelope (see the header). */
  decoration: boolean;
  /** Centre of the part, relative to the envelope centre (three.js axes). */
  at: Vec3;
}

/** A (possibly tapered) cylinder.  `axis` is a three.js axis or a unit
 *  direction; `rStart` is the radius at the -axis end, `rEnd` at the +axis
 *  end.  `arc` (axis "y" only): [start, length] in radians, the angle phi
 *  measured in the X-Z plane, point = (cos phi, 0, sin phi). */
export interface CylinderPart extends PartBase {
  prim: "cylinder";
  axis: Axis | Vec3;
  length: number;
  rStart: number;
  rEnd: number;
  arc?: [number, number];
}

/** A 2:1-style elliptical head: half an ellipsoid of radius `r` and depth
 *  `depth`, its flat face (the tangent circle) at `at`, bulging toward
 *  `sign` x `axis`. */
export interface HeadPart extends PartBase {
  prim: "head";
  axis: Axis;
  sign: 1 | -1;
  r: number;
  depth: number;
}

/** A box, optionally turned by `yaw` radians about Y. */
export interface BoxPart extends PartBase {
  prim: "box";
  size: Vec3;
  yaw?: number;
}

/** A horizontal ring (a handrail, a cage hoop): major radius `R`, tube
 *  radius `r`, `arc` = [start, length] in the phi convention above. */
export interface RingPart extends PartBase {
  prim: "ring";
  R: number;
  r: number;
  arc: [number, number];
}

/** A triangular prism lying along a plan axis -- a pitched roof: its flat
 *  base `width` across and `length` long, centred at `at` (the base's
 *  centre), its ridge `rise` above the base (C90). */
export interface PrismPart extends PartBase {
  prim: "prism";
  axis: "x" | "z";
  length: number;
  width: number;
  rise: number;
}

export type Part = CylinderPart | HeadPart | BoxPart | RingPart | PrismPart;

/** One item's drawing: its parts, and which entry drew it (said in the
 *  hover tooltip, so a reader can tell a kind drawing from the fallback). */
export interface EquipmentDrawing {
  parts: Part[];
  /** The `EQUIPMENT_MODELS` entry that drew it, or "plain" (the fallback). */
  model: string;
  /** A short phrase for the tooltip ("vertical vessel, 2:1 heads, skirt"). */
  describes: string;
}

//  ---- the drafting conventions (all decoration), named ---------------------

/** A vertical item whose TOP stands higher than this above grade (m) gets a
 *  caged ladder and platforms. */
export const ACCESS_FROM = 5;
/** Platform spacing up a tall item (m), from grade. */
export const PLATFORM_SPACING = 6;
/** Width of a platform (m) and height of its handrail (m). */
export const PLATFORM_WIDTH = 1.0;
export const HANDRAIL_HEIGHT = 1.0;
/** A ladder cage starts this high above the ladder's foot (m). */
export const CAGE_FROM = 2.2;
/** The side the ladders face: phi in the X-Z plane (rad).  Toward the 3D
 *  view's default camera (south-west), so the access is seen first. */
export const ACCESS_SIDE = 2.0;
/** Depth of a 2:1 elliptical head as a fraction of the diameter. */
export const HEAD_DEPTH_OVER_D = 0.25;

//  ---- helpers --------------------------------------------------------------

const TAU = 2 * Math.PI;

/** A point given along an axis `a` (s), up (y) and across (w). */
function along(a: Axis, s: number, y: number, w: number): Vec3 {
  if (a === "x") return [s, y, w];
  if (a === "z") return [w, y, s];
  return [w, s, y];   // a vertical axis: s is the height, y the other
}

/** The unit vector of phi in the X-Z plane. */
const dirOf = (phi: number): [number, number] => [Math.cos(phi), Math.sin(phi)];

function cyl(role: PartRole, decoration: boolean, at: Vec3, axis: Axis | Vec3,
             length: number, r: number, rEnd = r, arc?: [number, number]): CylinderPart {
  return { prim: "cylinder", role, decoration, at, axis, length, rStart: r, rEnd,
           ...(arc ? { arc } : {}) };
}

function box(role: PartRole, decoration: boolean, at: Vec3, size: Vec3, yaw?: number): BoxPart {
  return { prim: "box", role, decoration, at, size, ...(yaw !== undefined ? { yaw } : {}) };
}

function ring(role: PartRole, at: Vec3, R: number, r: number, arc: [number, number]): RingPart {
  return { prim: "ring", role, decoration: true, at, R, r, arc };
}

/** A vertical item's envelope: radius, height and the grade under it. */
interface Vertical { R: number; H: number; base: number }

/** The body of a vertical vessel with two 2:1 heads, filling [-H/2, H/2]. */
function verticalShellWithHeads({ R, H }: Vertical): { parts: Part[]; hd: number } {
  const hd = Math.min(HEAD_DEPTH_OVER_D * 2 * R, 0.25 * H);
  return {
    hd,
    parts: [
      cyl("body", false, [0, 0, 0], "y", H - 2 * hd, R),
      { prim: "head", role: "body", decoration: false, at: [0, H / 2 - hd, 0], axis: "y",
        sign: 1, r: R, depth: hd },
      { prim: "head", role: "body", decoration: false, at: [0, -H / 2 + hd, 0], axis: "y",
        sign: -1, r: R, depth: hd },
    ],
  };
}

/** A nozzle with its flange, rising from `y0` (local) at plan (x, z). */
function verticalNozzle(x: number, z: number, y0: number, r: number, rise: number): Part[] {
  return [
    cyl("steel", true, [x, y0 + rise / 2, z], "y", rise, r),
    cyl("steel", true, [x, y0 + rise - 0.03, z], "y", 0.06, 1.7 * r),
  ];
}

/** A skirt (tall vessels) or four legs (stubby ones), from grade to just
 *  above the bottom tangent line: decoration over the body's lower part. */
function support({ R, H }: Vertical, hd: number): { parts: Part[]; word: string } {
  if (H >= 3 * R) {
    const h = Math.min(Math.max(0.12 * H, hd + 0.3), hd + 2.5, 0.45 * H);
    return {
      word: "skirt",
      parts: [
        cyl("concrete", true, [0, -H / 2 + h / 2, 0], "y", h, 1.012 * R),
        cyl("steel", true, [0, -H / 2 + 0.05, 0], "y", 0.1, 1.1 * R),
      ],
    };
  }
  const t = Math.max(0.08, 0.1 * R);
  const h = hd + Math.min(0.5, 0.2 * H);
  const parts: Part[] = [];
  for (let k = 0; k < 4; k++) {
    const [c, s] = dirOf(Math.PI / 4 + (k * Math.PI) / 2);
    const rr = R - t / 2;
    parts.push(box("steel", true, [rr * c, -H / 2 + h / 2, rr * s], [t, h, t]));
  }
  return { word: "legs", parts };
}

/** The caged ladder and the platforms of a tall vertical item.  `topY` is
 *  the local height the ladder climbs to (the top platform). */
function access({ R, H, base }: Vertical, topY: number, platforms: boolean): Part[] {
  if (base + H / 2 + topY <= ACCESS_FROM) return [];
  const parts: Part[] = [];
  const phi = ACCESS_SIDE;
  const [c, s] = dirOf(phi);
  const t: [number, number] = [-s, c];                 // tangential
  const foot = -H / 2;
  const top = topY + HANDRAIL_HEIGHT;                  // rails stand past the top platform
  const lr = R + 0.3;                                  // ladder centre line
  const lx = lr * c, lz = lr * s;
  //  Two side rails and the rungs.
  for (const sg of [-1, 1]) {
    parts.push(cyl("steel", true, [lx + sg * 0.22 * t[0], (foot + top) / 2, lz + sg * 0.22 * t[1]],
      "y", top - foot, 0.03));
  }
  for (let y = foot + 0.3; y < topY; y += 0.3)
    parts.push(cyl("steel", true, [lx, y, lz], [t[0], 0, t[1]], 0.44, 0.016));
  //  The cage: hoops and five bars, from CAGE_FROM above the foot.
  const cageR = 0.38;
  const cx = (lr + 0.12) * c, cz = (lr + 0.12) * s;
  const cage0 = foot + CAGE_FROM;
  if (top > cage0 + 0.5) {
    for (let y = cage0; y <= top + 1e-9; y += 0.9)
      parts.push(ring("safety", [cx, y, cz], cageR, 0.018, [phi - (2 * Math.PI) / 3, (4 * Math.PI) / 3]));
    for (const d of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) {
      const [bc, bs] = dirOf(phi + d);
      parts.push(cyl("safety", true, [cx + cageR * bc, (cage0 + top) / 2, cz + cageR * bs], "y",
        top - cage0, 0.016));
    }
  }
  if (!platforms) return parts;
  //  Platforms: every PLATFORM_SPACING above grade, and one at the top; a
  //  level within 2 m of the top one is dropped.
  const levels: number[] = [];
  for (let k = 1; ; k++) {
    const y = foot + k * PLATFORM_SPACING;
    if (y > topY - 2) break;
    levels.push(y);
  }
  levels.push(topY);
  const arc: [number, number] = [phi - Math.PI / 2, Math.PI];
  const Ro = R + PLATFORM_WIDTH;
  for (const y of levels) {
    //  The deck: an annular half-disc whose inner half is hidden in the shell.
    parts.push(cyl("grating", true, [0, y - 0.04, 0], "y", 0.08, Ro, Ro, arc));
    parts.push(ring("safety", [0, y + HANDRAIL_HEIGHT, 0], Ro - 0.05, 0.025, arc));
    parts.push(ring("safety", [0, y + 0.5 * HANDRAIL_HEIGHT, 0], Ro - 0.05, 0.018, arc));
    for (let k = 0; k <= 6; k++) {
      const [pc, ps] = dirOf(arc[0] + (k * arc[1]) / 6);
      parts.push(cyl("safety", true, [(Ro - 0.05) * pc, y + HANDRAIL_HEIGHT / 2, (Ro - 0.05) * ps],
        "y", HANDRAIL_HEIGHT, 0.022));
    }
  }
  return parts;
}

//  ---- the kinds ------------------------------------------------------------

/** What a recipe is handed: the scene's own solid, plus the grade under it. */
export interface ModelInput {
  kind: string;
  shape: SceneSolid["shape"];
  axis: SceneSolid["axis"];
  /** Envelope extents along three.js X, Y (up), Z. */
  size: Vec3;
  /** three.js Y of the envelope's base (the item's published base z). */
  base: number;
}

type Recipe = (m: ModelInput) => EquipmentDrawing | null;

/** A standing item: the engine's vertical cylinder, or -- for a kind whose
 *  footprint the CASE declared as a box -- the vertical cylinder inscribed
 *  in that box (diameter the smaller plan side, height the box's), said in
 *  the drawing's description. */
interface VerticalFrame extends Vertical { inscribed: boolean }
function verticalOf(m: ModelInput): VerticalFrame | null {
  if (m.shape === "cylinder")
    return m.axis === "y" ? { R: m.size[0] / 2, H: m.size[1], base: m.base, inscribed: false }
      : null;
  return { R: Math.min(m.size[0], m.size[2]) / 2, H: m.size[1], base: m.base, inscribed: true };
}

/** A lying item along `a`: the engine's horizontal cylinder, or the one
 *  inscribed in a declared box along its longer plan side, resting on the
 *  box's floor.  `yc` is the shell axis's height relative to the envelope
 *  centre. */
interface HorizontalFrame { a: Axis; L: number; R: number; yc: number; inscribed: boolean }
function horizontalOf(m: ModelInput): HorizontalFrame | null {
  if (m.shape === "cylinder") {
    if (m.axis === "y") return null;
    const a: Axis = m.axis;
    return { a, L: a === "x" ? m.size[0] : m.size[2], R: m.size[1] / 2, yc: 0, inscribed: false };
  }
  const a: Axis = m.size[0] >= m.size[2] ? "x" : "z";
  const wide = Math.min(m.size[0], m.size[2]);
  const R = Math.min(wide, m.size[1]) / 2;
  return { a, L: Math.max(m.size[0], m.size[2]), R, yc: -m.size[1] / 2 + R, inscribed: true };
}

const inBox = (f: { inscribed: boolean }): string =>
  (f.inscribed ? ", drawn inside the declared box" : "");

/** A vertical pressure vessel: 2:1 heads, a skirt or legs, a top nozzle, and
 *  ladder and platforms when it is tall. */
function verticalVessel(v: VerticalFrame, name: string): EquipmentDrawing {
  const { parts, hd } = verticalShellWithHeads(v);
  const sup = support(v, hd);
  parts.push(...sup.parts);
  parts.push(...verticalNozzle(0, 0, v.H / 2 - 0.05, Math.max(0.05, 0.1 * v.R), 0.35));
  const acc = access(v, v.H / 2 - hd, true);
  parts.push(...acc);
  return { parts, model: name,
           describes: `vertical vessel, 2:1 heads, ${sup.word}`
             + `${acc.length ? ", ladder and platforms" : ""}${inBox(v)}` };
}

/** Two saddles cradling a horizontal shell from its bottom: inside the
 *  envelope. */
function saddles(a: Axis, R: number, yc: number, at: number[]): Part[] {
  const parts: Part[] = [];
  for (const s of at) {
    const plate: Vec3 = a === "x" ? [0.22, 0.9 * R, 1.6 * R] : [1.6 * R, 0.9 * R, 0.22];
    parts.push(box("steel", true, along(a, s, yc - R + 0.45 * R, 0), plate));
    const foot: Vec3 = a === "x" ? [0.5, 0.06, 1.8 * R] : [1.8 * R, 0.06, 0.5];
    parts.push(box("steel", true, along(a, s, yc - R + 0.03, 0), foot));
  }
  return parts;
}

/** A horizontal drum lying along `a`: heads and two saddles. */
function horizontalDrum(f: HorizontalFrame, name: string): EquipmentDrawing {
  const { a, L, R, yc } = f;
  const hd = Math.min(HEAD_DEPTH_OVER_D * 2 * R, 0.25 * L);
  const parts: Part[] = [
    cyl("body", false, along(a, 0, yc, 0), a, L - 2 * hd, R),
    { prim: "head", role: "body", decoration: false, at: along(a, L / 2 - hd, yc, 0), axis: a,
      sign: 1, r: R, depth: hd },
    { prim: "head", role: "body", decoration: false, at: along(a, -L / 2 + hd, yc, 0), axis: a,
      sign: -1, r: R, depth: hd },
  ];
  parts.push(...saddles(a, R, yc, [-0.3 * L, 0.3 * L]));
  for (const sx of [-0.25 * L, 0.25 * L]) {
    const p = along(a, sx, 0, 0);
    parts.push(...verticalNozzle(p[0], p[2], yc + 0.8 * R, Math.max(0.05, 0.15 * R),
      0.2 * R + 0.25));
  }
  return { parts, model: name, describes: `horizontal drum, 2:1 heads, saddles${inBox(f)}` };
}

/** A shell-and-tube exchanger on its side: channel with a flat cover at
 *  one end, a dished rear head, flanges, nozzles and two saddles. */
const shellTubeHX: Recipe = (m) => {
  const f = horizontalOf(m);
  if (!f) return null;
  const { a, L, R, yc } = f;
  const cover = Math.min(0.06, 0.02 * L);
  const ch = Math.min(0.2 * L, 1.4 * R);               // channel length
  const hd = Math.min(0.5 * R, 0.15 * L);              // rear head
  const s0 = -L / 2, sCh = s0 + ch, sHead = L / 2 - hd;
  const parts: Part[] = [
    cyl("body", false, along(a, s0 + cover / 2, yc, 0), a, cover, R),         // channel cover
    cyl("body", false, along(a, (s0 + cover + sCh) / 2, yc, 0), a, ch - cover, R),
    cyl("body", false, along(a, (sCh + sHead) / 2, yc, 0), a, sHead - sCh, R),
    { prim: "head", role: "body", decoration: false, at: along(a, sHead, yc, 0), axis: a,
      sign: 1, r: R, depth: hd },
    //  Flanges: the bolted cover and the channel-to-shell joint.
    cyl("steel", true, along(a, s0 + cover, yc, 0), a, 0.08, 1.1 * R),
    cyl("steel", true, along(a, sCh, yc, 0), a, 0.1, 1.1 * R),
  ];
  const span = sHead - sCh;
  const rn = Math.max(0.05, 0.2 * R);
  //  Shell-side nozzles on top, tube-side nozzle on the channel.
  for (const s of [sCh + 0.15 * span, sHead - 0.15 * span]) {
    const p = along(a, s, 0, 0);
    parts.push(...verticalNozzle(p[0], p[2], yc + 0.7 * R, rn, 0.3 * R + 0.25));
  }
  const pc = along(a, (s0 + sCh) / 2, 0, 0);
  parts.push(...verticalNozzle(pc[0], pc[2], yc + 0.7 * R, rn, 0.3 * R + 0.25));
  parts.push(...saddles(a, R, yc, [sCh + 0.2 * span, sHead - 0.15 * span]));
  return { parts, model: "shellTubeHX",
           describes: `shell-and-tube exchanger, channel head, saddles${inBox(f)}` };
};

/** An atmospheric storage tank: flat bottom, cone roof, plating courses,
 *  a foundation ring, a roof handrail and a caged ladder when tall.  No
 *  bund wall: the layout declares none, and this view invents none. */
const storageTank: Recipe = (m) => {
  const v = verticalOf(m);
  if (!v) return null;
  const { R, H } = v;
  const rise = Math.min(R / 6, 0.2 * H);
  const shellH = H - rise;
  const parts: Part[] = [
    cyl("body", false, [0, -H / 2 + shellH / 2, 0], "y", shellH, R),
    cyl("body", false, [0, H / 2 - rise / 2, 0], "y", rise, R, 0.04 * R),   // cone roof
    cyl("concrete", true, [0, -H / 2 + 0.1, 0], "y", 0.2, 1.05 * R),
    cyl("steel", true, [0, H / 2 + 0.15, 0], "y", 0.3, Math.max(0.05, 0.05 * R)), // roof vent
  ];
  for (let y = -H / 2 + 2.4; y < -H / 2 + shellH - 0.3; y += 2.4)               // plating courses
    parts.push(cyl("steel", true, [0, y, 0], "y", 0.04, 1.004 * R));
  const edge = -H / 2 + shellH;
  parts.push(ring("safety", [0, edge + HANDRAIL_HEIGHT, 0], 0.97 * R, 0.025, [0, TAU]));
  const posts = Math.max(8, Math.min(48, Math.round((TAU * R) / 2.5)));
  for (let k = 0; k < posts; k++) {
    const [c, s] = dirOf((k * TAU) / posts);
    parts.push(cyl("safety", true, [0.97 * R * c, edge + HANDRAIL_HEIGHT / 2, 0.97 * R * s], "y",
      HANDRAIL_HEIGHT, 0.022));
  }
  const acc = access(v, edge, false);
  parts.push(...acc);
  return { parts, model: "storageTank",
           describes: `storage tank, cone roof${acc.length ? ", caged ladder" : ""}${inBox(v)}` };
};

/** A stirred tank reactor: a vertical vessel on legs or a skirt with its
 *  agitator drive (gearbox and motor) on the top head. */
const stirredTank: Recipe = (m) => {
  const v = verticalOf(m);
  if (!v) return null;
  const { R, H } = v;
  const { parts, hd } = verticalShellWithHeads(v);
  const sup = support(v, hd);
  parts.push(...sup.parts);
  const gb = Math.max(0.3, 0.45 * R);
  parts.push(box("machine", true, [0, H / 2 - 0.05 + gb * 0.35, 0], [gb, gb * 0.7, gb]));
  const mr = Math.max(0.12, 0.17 * R);
  parts.push(cyl("motor", true, [0, H / 2 - 0.05 + gb * 0.7 + mr * 1.6, 0], "y", mr * 3.2, mr));
  for (const ph of [0.6, 2.7, 4.4]) {
    const [c, s] = dirOf(ph);
    parts.push(...verticalNozzle(0.6 * R * c, 0.6 * R * s, H / 2 - hd * 0.6,
      Math.max(0.04, 0.08 * R), hd * 0.6 + 0.25));
  }
  const acc = access(v, H / 2 - hd, true);
  parts.push(...acc);
  return { parts, model: "stirredTank",
           describes: `stirred tank, agitator drive, ${sup.word}`
             + `${acc.length ? ", ladder and platforms" : ""}${inBox(v)}` };
};

/** A compressor on its skid, inside the box the case declared: a concrete
 *  plinth over the declared footprint, the steel base frame, the casing,
 *  coupling guard and driver along the longer plan side. */
const compressor: Recipe = (m) => {
  if (m.shape !== "box") return null;
  const [dx, dh, dz] = m.size;
  const a: Axis = dx >= dz ? "x" : "z";
  const long = Math.max(dx, dz), wide = Math.min(dx, dz);
  const plinth = Math.min(0.3, 0.1 * dh);
  const frame = Math.min(0.25, 0.08 * dh);
  const skid = plinth + frame;
  const rc = Math.max(0.05, Math.min(0.32 * wide, 0.42 * (dh - skid)));
  const yc = -dh / 2 + skid + rc;
  const guard: Vec3 = a === "x" ? [0.1 * long, 0.9 * rc, 0.9 * rc] : [0.9 * rc, 0.9 * rc, 0.1 * long];
  const frameSize: Vec3 = a === "x" ? [0.92 * dx, frame, 0.8 * dz] : [0.8 * dx, frame, 0.92 * dz];
  const parts: Part[] = [
    box("concrete", false, [0, -dh / 2 + plinth / 2, 0], [dx, plinth, dz]),
    box("steel", true, [0, -dh / 2 + plinth + frame / 2, 0], frameSize),
    cyl("machine", false, along(a, -0.2 * long, yc, 0), a, 0.42 * long, rc),
    cyl("motor", true, along(a, 0.27 * long, yc - 0.15 * rc, 0), a, 0.3 * long, 0.8 * rc),
    box("safety", true, along(a, 0.06 * long, yc, 0), guard),
  ];
  for (const s of [-0.32 * long, -0.08 * long]) {
    const p = along(a, s, 0, 0);
    const rise = Math.max(0.05, Math.min(0.5 * rc, dh / 2 - (yc + 0.6 * rc)));
    parts.push(...verticalNozzle(p[0], p[2], yc + 0.6 * rc, Math.max(0.04, 0.28 * rc), rise));
  }
  return { parts, model: "compressor",
           describes: "compressor and driver on a skid, drawn inside the declared box" };
};

/** A spray dryer: a cylindrical chamber over a cone, on legs, with the
 *  atomiser drive on its roof. */
const sprayDryer: Recipe = (m) => {
  const v = verticalOf(m);
  if (!v) return null;
  const { R, H } = v;
  const coneH = 0.4 * H;
  const parts: Part[] = [
    cyl("body", false, [0, -H / 2 + coneH / 2, 0], "y", coneH, 0.08 * R, R),
    cyl("body", false, [0, -H / 2 + coneH + (H - coneH) / 2, 0], "y", H - coneH, R),
    cyl("motor", true, [0, H / 2 + 0.3, 0], "y", 0.6, Math.max(0.1, 0.12 * R)),
  ];
  const t = Math.max(0.12, 0.06 * R);
  for (let k = 0; k < 4; k++) {
    const [c, s] = dirOf(Math.PI / 4 + (k * Math.PI) / 2);
    const rr = R - t / 2;
    parts.push(box("steel", true, [rr * c, -H / 2 + coneH / 2 + 0.05, rr * s], [t, coneH + 0.1, t]));
  }
  const acc = access(v, H / 2, true);
  parts.push(...acc);
  return { parts, model: "sprayDryer",
           describes: `spray dryer, chamber over a cone, on legs`
             + `${acc.length ? ", ladder and platforms" : ""}${inBox(v)}` };
};

/** A `vessel` stands or lies as the engine placed it; a declared box much
 *  longer than it is wide and tall is a horizontal drum, any other box a
 *  standing vessel inscribed in it. */
const vessel: Recipe = (m) => {
  if (m.shape === "cylinder") {
    const v = verticalOf(m);
    if (v) return verticalVessel(v, "vessel");
    const h = horizontalOf(m);
    return h ? horizontalDrum(h, "vessel") : null;
  }
  const long = Math.max(m.size[0], m.size[2]), wide = Math.min(m.size[0], m.size[2]);
  if (long >= 1.5 * wide && long >= 1.5 * m.size[1])
    return horizontalDrum(horizontalOf(m)!, "vessel");
  return verticalVessel(verticalOf(m)!, "vessel");
};

//  ---- the site buildings (C90) --------------------------------------------

/** Window band and door proportions of a site building (drawing). */
export const WINDOW_SILL = 1.0;     // m above the floor
export const WINDOW_HEIGHT = 1.2;   // m
export const DOOR_HEIGHT = 2.2;     // m

interface Plan { dx: number; dh: number; dz: number; a: Axis; long: number; wide: number }
const planOf = (m: ModelInput): Plan | null => {
  if (m.shape !== "box") return null;
  const [dx, dh, dz] = m.size;
  const a: Axis = dx >= dz ? "x" : "z";
  return { dx, dh, dz, a, long: Math.max(dx, dz), wide: Math.min(dx, dz) };
};

/** Panes on the four faces of a box of plan (dx, dz), from y0 to y0 + h:
 *  `n` per metre of face, each 60 % of its share wide, standing 2 cm proud
 *  (decoration). */
function windowBand(dx: number, dz: number, y0: number, h: number): Part[] {
  const parts: Part[] = [];
  const proud = 0.02, t = 0.04;
  for (const [len, across, alongX] of [[dx, dz, true], [dz, dx, false]] as const) {
    const n = Math.max(1, Math.floor(len / 2.5));
    const share = len / n;
    for (let k = 0; k < n; k++) {
      const s = -len / 2 + share * (k + 0.5);
      for (const side of [-1, 1]) {
        const w = across / 2 + proud;
        parts.push(box("glass", true, alongX ? [s, y0 + h / 2, side * w] : [side * w, y0 + h / 2, s],
          alongX ? [0.6 * share, h, t] : [t, h, 0.6 * share]));
      }
    }
  }
  return parts;
}

/** A flat-roofed building: walls to the declared height (body), a roof slab
 *  overhanging 0.3 m (decoration), a window band and a door. */
function flatBuilding(p: Plan, overhang: number, windows: boolean): Part[] {
  const { dx, dh, dz } = p;
  const slab = Math.min(0.25, 0.08 * dh);
  const parts: Part[] = [
    box("body", false, [0, 0, 0], [dx, dh, dz]),
    box("concrete", true, [0, dh / 2 - slab / 2 + 0.05, 0], [dx + 2 * overhang, slab, dz + 2 * overhang]),
  ];
  const sill = Math.min(WINDOW_SILL, 0.3 * dh), wh = Math.min(WINDOW_HEIGHT, 0.4 * dh);
  if (windows) parts.push(...windowBand(dx, dz, -dh / 2 + sill, wh));
  //  A door on the south face (three.js +Z is plan south), off centre.
  const door = Math.min(DOOR_HEIGHT, 0.7 * dh);
  parts.push(box("steel", true, [0.3 * dx * 0.5, -dh / 2 + door / 2, dz / 2 + 0.03], [1.0, door, 0.04]));
  return parts;
}

const controlRoom: Recipe = (m) => {
  const p = planOf(m);
  if (!p) return null;
  return { parts: flatBuilding(p, 0.3, true), model: "controlRoom",
           describes: "control room: walls, roof slab, window band, drawn inside the declared box" };
};

const canteen: Recipe = (m) => {
  const p = planOf(m);
  if (!p) return null;
  const parts = flatBuilding(p, 0.6, true);
  //  The kitchen's extract vent on the roof (decoration).
  parts.push(cyl("steel", true, [0.3 * p.dx, p.dh / 2 + 0.6, -0.25 * p.dz], "y", 1.2, 0.25));
  return { parts, model: "canteen",
           describes: "canteen: windows all round, roof overhang, kitchen vent, drawn inside the declared box" };
};

/** A guardhouse: a small glazed hut with a wide roof.  Its barrier arm is
 *  drawn by the renderer across the road (SceneBarrier). */
const gate: Recipe = (m) => {
  const p = planOf(m);
  if (!p) return null;
  return { parts: flatBuilding(p, 0.5, true), model: "gate",
           describes: "guardhouse (its barrier arm across the road is drawing), inside the declared box" };
};

/** A portal-frame shed: walls to the eaves and a pitched roof whose ridge
 *  runs along the longer plan side, the two together filling the declared
 *  box (body); roller doors on the long faces (decoration). */
const warehouse: Recipe = (m) => {
  const p = planOf(m);
  if (!p) return null;
  const { dx, dh, dz, a, long, wide } = p;
  const rise = Math.min(0.3 * dh, 0.25 * wide);
  const eave = dh - rise;
  const parts: Part[] = [
    box("body", false, [0, -dh / 2 + eave / 2, 0], [dx, eave, dz]),
    { prim: "prism", role: "roof", decoration: false, at: [0, -dh / 2 + eave, 0],
      axis: a === "x" ? "x" : "z", length: long, width: wide, rise },
  ];
  const doorW = Math.min(4, 0.25 * long), doorH = Math.min(4.5, 0.8 * eave);
  for (const s of [-0.25 * long, 0.25 * long])
    for (const side of [-1, 1])
      parts.push(box("steel", true,
        a === "x" ? [s, -dh / 2 + doorH / 2, side * (dz / 2 + 0.03)] : [side * (dx / 2 + 0.03), -dh / 2 + doorH / 2, s],
        a === "x" ? [doorW, doorH, 0.05] : [0.05, doorH, doorW]));
  return { parts, model: "warehouse",
           describes: "warehouse: portal shed, pitched roof, roller doors, drawn inside the declared box" };
};

/** A truck scale: a concrete pit with a steel deck (body, the declared box)
 *  and a ramp at each end of the deck's long side (decoration, beyond the
 *  box -- a ramp is where the road meets the deck). */
const weighbridge: Recipe = (m) => {
  const p = planOf(m);
  if (!p) return null;
  const { dx, dh, dz, a, long, wide } = p;
  const plate = Math.min(0.05, 0.3 * dh);
  const parts: Part[] = [
    box("body", false, [0, -plate / 2, 0], [dx, dh - plate, dz]),
    box("steel", false, [0, dh / 2 - plate / 2, 0], [dx, plate, dz]),
  ];
  const rampL = Math.max(1.5, 6 * dh);
  for (const side of [-1, 1]) {
    //  A ramp: a slab tilted by its rise over its run (a box turned about
    //  the deck's cross axis is not a primitive here, so it is stepped).
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      const h = dh * (k + 1) / steps, run = rampL / steps;
      const s = side * (long / 2 + rampL - run * (k + 0.5));
      parts.push(box("concrete", true, along(a, s, -dh / 2 + h / 2, 0),
        a === "x" ? [run, h, wide] : [wide, h, run]));
    }
  }
  return { parts, model: "weighbridge",
           describes: "weighbridge: steel deck on its pit (the declared box), ramps at both ends (drawing)" };
};

/** ONE entry per SITE BUILDING word a case may give a non-process item.
 *  Any other word keeps the plain box. */
export const SITE_MODELS: Readonly<Record<string, Recipe>> = {
  controlRoom,
  warehouse,
  canteen,
  gate,
  weighbridge,
};

/** ONE entry per equipment kind, keyed on the registered word the sizers
 *  stamp (src/postProcessing/sizing, `equipmentType`).  A `vessel` is drawn
 *  standing or lying as the engine placed it. */
export const EQUIPMENT_MODELS: Readonly<Record<string, Recipe>> = {
  vessel,
  shellTubeHX,
  storageTank,
  stirredTank,
  compressor,
  sprayDryer,
};

/** The plain drawing: the engine's cylinder or the case's box, exactly the
 *  envelope -- what every kind without an entry keeps. */
export function plainDrawing(m: ModelInput): EquipmentDrawing {
  if (m.shape === "cylinder") {
    const along = m.axis === "x" ? m.size[0] : m.axis === "z" ? m.size[2] : m.size[1];
    const across = m.axis === "x" ? m.size[1] : m.size[0];
    return { parts: [cyl("body", false, [0, 0, 0], m.axis, along, across / 2)], model: "plain",
             describes: "cylinder (no drawing for this kind)" };
  }
  return { parts: [box("body", false, [0, 0, 0], [...m.size] as Vec3)], model: "plain",
           describes: "box (no drawing for this kind)" };
}

/** How the item is drawn: its kind's entry, else the plain drawing.  A
 *  non-process item (a building, a control room) is the box its case
 *  declared. */
export function equipmentDrawing(s: Pick<SceneSolid, "kind" | "shape" | "axis" | "size"
  | "center" | "nonProcess">): EquipmentDrawing {
  const m: ModelInput = { kind: s.kind, shape: s.shape, axis: s.axis, size: s.size,
                          base: s.center[1] - s.size[1] / 2 };
  const recipe = s.nonProcess ? SITE_MODELS[s.kind] : EQUIPMENT_MODELS[s.kind];
  return recipe?.(m) ?? plainDrawing(m);
}

//  ---- bounds (for the test, and for anyone asking where a part reaches) ----

/** An axis-aligned box that contains the part: [min, max]. */
export function partBounds(p: Part): [Vec3, Vec3] {
  const [x, y, z] = p.at;
  const ext = (h: Vec3): [Vec3, Vec3] =>
    [[x - h[0], y - h[1], z - h[2]], [x + h[0], y + h[1], z + h[2]]];
  switch (p.prim) {
    case "box": {
      const [sx, sy, sz] = p.size;
      if (!p.yaw) return ext([sx / 2, sy / 2, sz / 2]);
      const c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw));
      return ext([(c * sx + s * sz) / 2, sy / 2, (s * sx + c * sz) / 2]);
    }
    case "ring":
      return ext([p.R + p.r, p.r, p.R + p.r]);
    case "prism": {
      const lo: Vec3 = [x, y, z], hi: Vec3 = [x, y + p.rise, z];
      const k = p.axis === "x" ? 0 : 2, c = p.axis === "x" ? 2 : 0;
      lo[k] -= p.length / 2; hi[k] += p.length / 2;
      lo[c] -= p.width / 2; hi[c] += p.width / 2;
      return [lo, hi];
    }
    case "head": {
      const lo: Vec3 = [x - p.r, y - p.r, z - p.r];
      const hi: Vec3 = [x + p.r, y + p.r, z + p.r];
      const k = p.axis === "x" ? 0 : p.axis === "y" ? 1 : 2;
      const c = p.at[k]!;
      lo[k] = p.sign > 0 ? c : c - p.depth;
      hi[k] = p.sign > 0 ? c + p.depth : c;
      return [lo, hi];
    }
    case "cylinder": {
      const r = Math.max(p.rStart, p.rEnd);
      if (typeof p.axis === "string") {
        const h: Vec3 = [r, r, r];
        h[p.axis === "x" ? 0 : p.axis === "y" ? 1 : 2] = p.length / 2;
        return ext(h);
      }
      const d = p.axis;
      const h = [0, 1, 2].map((k) => Math.abs(d[k]!) * p.length / 2
        + r * Math.sqrt(Math.max(0, 1 - d[k]! * d[k]!))) as Vec3;
      return ext(h);
    }
  }
}

/** The bounds of a set of parts. */
export function boundsOf(parts: Part[]): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const [a, b] = partBounds(p);
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, a[k]!);
      hi[k] = Math.max(hi[k]!, b[k]!);
    }
  }
  return [lo, hi];
}
