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
  THE GMP FLOOR PLANS A STUDENT CAN HAND IN (DEV.md 4c C103) -- the drawing
  geometry, with no React and no SVG in it, so every rule is testable.

  Practice (ISPE Baseline Guide Vol. 2, Oral Solid Dosage; EU GMP Part I,
  ch. 3) draws a SET of plans per floor rather than one overloaded drawing:
  a ZONING plan (rooms by grade, airlocks, containment, hazardous areas), a
  PRESSURE plan (each room's pressure to outside and the direction air moves
  through each door) and one FLOW plan per kind (personnel, material, waste),
  each routed door to door.  This module computes what those plans draw from
  the engine's `building` block:

    * DOORS.  The engine publishes WHICH rooms a door joins, never WHERE on
      the wall it is.  A door is drawn at the MIDPOINT of the wall the two
      rooms share; a door to outside at the midpoint of the room's outer
      wall nearest the building's edge (the side `outsidePoint` uses for the
      3D cutaway); a stair or lift in the plan overlap of its two rooms.
      The sheet says so in a footnote -- a drawn position is not a
      published one.
    * CASCADE ARROWS.  Across each door, from the higher to the lower
      pressure, read off the engine's published `dP` (= p(a) - p(b),
      BuildingLayout.cpp); nothing is recomputed.
    * FLOW ROUTES.  The engine publishes the SEQUENCE of rooms; the route
      inside a room is drawing: in through one door, a short step into the
      room, an L along the room to the next door, out.  An axis-aligned L
      between two points of a rectangle never leaves it, so a route never
      crosses a wall except through a door.  The three kinds keep their own
      lane (offset along the wall and depth into the room).  A step with no
      door, stair or lift is drawn dashed and carries the engine's own
      `flowBreak` message.
    * LABELS.  A room label must FIT its room or it is replaced by the
      room's NUMBER, which the room schedule resolves -- labels never
      overlap a wall.

  ZERO VERDICT HERE ("THE ENGINE DECIDES, THE GUI DRAWS").  Plan coordinates
  throughout: metres, x east, y NORTH (the plot plan's own convention); the
  React sheet flips y when it draws.
\*---------------------------------------------------------------------------*/

import type {
  BuildingConnection, BuildingRoom, FlowKind, GmpBuilding,
} from "../adapters/buildingPayload.js";
import { envelope, FLOW_KINDS, OUTSIDE_STUB, ROLE_WORD } from "./gmpBuilding.js";

export type Pt = [number, number];

/** The plans of one floor, in the order a reader goes through them. */
export type PlanSheetKind = "zoning" | "pressure" | FlowKind;

export const PLAN_SHEET_WORD: Record<PlanSheetKind, string> = {
  zoning: "Zoning plan",
  pressure: "Pressure plan",
  personnel: "Personnel flow plan",
  material: "Material flow plan",
  waste: "Waste flow plan",
};

/** The plans this building has: zoning and pressure always, a flow plan
 *  for each kind it declares a flow of. */
export function planSheetKinds(b: GmpBuilding): PlanSheetKind[] {
  const present = new Set(b.flows.map((f) => f.kind));
  return ["zoning", "pressure", ...FLOW_KINDS.filter((k) => present.has(k))];
}

const TOL = 1e-6;
/** The width a door is DRAWN (a symbol, not a published dimension). */
export const DOOR_WIDTH = 1.2;

const cx = (r: BuildingRoom) => (r.xMin + r.xMax) / 2;
const cy = (r: BuildingRoom) => (r.yMin + r.yMax) / 2;
const centre = (r: BuildingRoom): Pt => [cx(r), cy(r)];

/** A wall segment in plan: vertical (`v`, at x = at, y from..to) or
 *  horizontal (`h`, at y = at, x from..to). */
export interface Wall { orient: "v" | "h"; at: number; from: number; to: number }

/** The wall two rooms share in plan, or undefined when they only touch at a
 *  corner or do not touch at all. */
export function sharedWall(a: BuildingRoom, b: BuildingRoom): Wall | undefined {
  const oy0 = Math.max(a.yMin, b.yMin), oy1 = Math.min(a.yMax, b.yMax);
  if (oy1 - oy0 > TOL) {
    if (Math.abs(a.xMax - b.xMin) < TOL) return { orient: "v", at: a.xMax, from: oy0, to: oy1 };
    if (Math.abs(b.xMax - a.xMin) < TOL) return { orient: "v", at: a.xMin, from: oy0, to: oy1 };
  }
  const ox0 = Math.max(a.xMin, b.xMin), ox1 = Math.min(a.xMax, b.xMax);
  if (ox1 - ox0 > TOL) {
    if (Math.abs(a.yMax - b.yMin) < TOL) return { orient: "h", at: a.yMax, from: ox0, to: ox1 };
    if (Math.abs(b.yMax - a.yMin) < TOL) return { orient: "h", at: a.yMin, from: ox0, to: ox1 };
  }
  return undefined;
}

type Env = ReturnType<typeof envelope>;

/** The outer wall a room's door to outside is drawn on -- the side nearest
 *  the edge of the building's plan (ties: west, east, south, north, as the
 *  cutaway's `outsidePoint`) -- and the unit normal pointing OUT of it. */
export function outerWall(r: BuildingRoom, env: Env): { wall: Wall; out: Pt } {
  const sides: [number, Wall, Pt][] = [
    [r.xMin - env.x0, { orient: "v", at: r.xMin, from: r.yMin, to: r.yMax }, [-1, 0]],
    [env.x1 - r.xMax, { orient: "v", at: r.xMax, from: r.yMin, to: r.yMax }, [1, 0]],
    [r.yMin - env.y0, { orient: "h", at: r.yMin, from: r.xMin, to: r.xMax }, [0, -1]],
    [env.y1 - r.yMax, { orient: "h", at: r.yMax, from: r.xMin, to: r.xMax }, [0, 1]],
  ];
  const best = sides.reduce((p, q) => (q[0] < p[0] - TOL ? q : p));
  return { wall: best[1], out: best[2] };
}

const wallPoint = (w: Wall, along: number): Pt =>
  (w.orient === "v" ? [w.at, along] : [along, w.at]);
const wallMid = (w: Wall) => (w.from + w.to) / 2;

/** A connection as the plan draws it. */
export interface PlanDoor {
  id: string; a: string; b: string; type: BuildingConnection["type"];
  /** The floors whose plans draw it (two for a stair or a lift). */
  floors: string[];
  /** The drawn position: a door's wall midpoint, a stair's overlap centre. */
  at: Pt;
  /** The wall a door sits in (absent on a stair, a lift, or a door that
   *  could not be placed). */
  wall?: Wall;
  /** For a door to outside: the unit normal pointing out of the building. */
  out?: Pt;
  /** The drawn gap of a door [m], or the symbol's plan size of a stair/lift. */
  width: number;
  size?: Pt;
  /** p(a) - p(b) [Pa], as published (`outside` is 0). */
  dP: number;
  /** How the position was found: on the shared wall, on the room's outer
   *  wall, in the stair/lift overlap, or NOT placed (the two rooms share no
   *  wall in plan -- the plan then draws no symbol for it). */
  placed: "sharedWall" | "outerWall" | "overlap" | "none";
}

/** Every published connection, placed on the plan. */
export function planDoors(b: GmpBuilding): PlanDoor[] {
  const byName = new Map(b.rooms.map((r) => [r.name, r]));
  const env = envelope(b);
  return b.connections.map((c): PlanDoor => {
    const base = { id: c.id, a: c.a, b: c.b, type: c.type, dP: c.dP };
    const ra = byName.get(c.a), rb = byName.get(c.b);
    if (c.type !== "door") {
      if (!ra || !rb) return { ...base, floors: [], at: [0, 0], width: 0, placed: "none" };
      const ox0 = Math.max(ra.xMin, rb.xMin), ox1 = Math.min(ra.xMax, rb.xMax);
      const oy0 = Math.max(ra.yMin, rb.yMin), oy1 = Math.min(ra.yMax, rb.yMax);
      const floors = [...new Set([ra.floor, rb.floor])];
      if (ox1 - ox0 > TOL && oy1 - oy0 > TOL) {
        const size: Pt = [Math.min(2.4, 0.8 * (ox1 - ox0)), Math.min(3.6, 0.8 * (oy1 - oy0))];
        return { ...base, floors, at: [(ox0 + ox1) / 2, (oy0 + oy1) / 2], width: size[0], size,
                 placed: "overlap" };
      }
      return { ...base, floors, at: [(cx(ra) + cx(rb)) / 2, (cy(ra) + cy(rb)) / 2], width: 0,
               placed: "none" };
    }
    const inner = ra ?? rb;
    if (!inner) return { ...base, floors: [], at: [0, 0], width: 0, placed: "none" };
    if (!ra || !rb) {
      const { wall, out } = outerWall(inner, env);
      const len = wall.to - wall.from;
      return { ...base, floors: [inner.floor], at: wallPoint(wall, wallMid(wall)), wall, out,
               width: Math.min(DOOR_WIDTH, 0.6 * len), placed: "outerWall" };
    }
    const w = ra.floor === rb.floor ? sharedWall(ra, rb) : undefined;
    if (!w) {
      return { ...base, floors: [...new Set([ra.floor, rb.floor])],
               at: [(cx(ra) + cx(rb)) / 2, (cy(ra) + cy(rb)) / 2], width: 0, placed: "none" };
    }
    return { ...base, floors: [ra.floor], at: wallPoint(w, wallMid(w)), wall: w,
             width: Math.min(DOOR_WIDTH, 0.6 * (w.to - w.from)), placed: "sharedWall" };
  });
}

/** Which side of a wall a point is on: +1 the positive axis side, -1 the
 *  negative one. */
const sideOf = (w: Wall, p: Pt) => Math.sign((w.orient === "v" ? p[0] : p[1]) - w.at) || 1;
const normalOf = (w: Wall): Pt => (w.orient === "v" ? [1, 0] : [0, 1]);

/** The cascade arrow across a door: from the side of the higher pressure to
 *  the side of the lower, centred on the door, `length` long.  Undefined for
 *  a stair or a lift (no door in a wall), a door not placed, or no step. */
export function cascadeArrow(d: PlanDoor, b: GmpBuilding, length = 1.6):
  { from: Pt; to: Pt; dP: number; high: string; low: string } | undefined {
  if (d.type !== "door" || !d.wall || d.dP === 0) return undefined;
  const byName = new Map(b.rooms.map((r) => [r.name, r]));
  //  Side of room a (+1 / -1 along the wall's normal).
  let sideA: number;
  if (d.out) {
    //  A door to outside: the outside is on the `out` side.
    const outSide = d.wall.orient === "v" ? d.out[0] : d.out[1];
    sideA = byName.has(d.a) ? -outSide : outSide;
  } else {
    const ra = byName.get(d.a);
    if (!ra) return undefined;
    sideA = sideOf(d.wall, centre(ra));
  }
  const highSide = d.dP > 0 ? sideA : -sideA;
  const n = normalOf(d.wall);
  const dir: Pt = [-highSide * n[0], -highSide * n[1]];
  const h = length / 2;
  return {
    from: [d.at[0] - dir[0] * h, d.at[1] - dir[1] * h],
    to: [d.at[0] + dir[0] * h, d.at[1] + dir[1] * h],
    dP: Math.abs(d.dP),
    high: d.dP > 0 ? d.a : d.b,
    low: d.dP > 0 ? d.b : d.a,
  };
}

//  ---- flow routes --------------------------------------------------------

/** Each kind's own lane: offset ALONG a door's wall, and depth INTO a room,
 *  so the three kinds never lie on one another. */
export const FLOW_LANE: Record<FlowKind, { along: number; depth: number }> = {
  personnel: { along: -0.3, depth: 0.7 },
  material:  { along: 0,    depth: 1.2 },
  waste:     { along: 0.3,  depth: 1.7 },
};

export interface FlowLeg { floor: string; points: Pt[]; broken: boolean }

export interface FlowRoute {
  name: string;
  kind: FlowKind;
  /** The engine's verdict, as published. */
  connected: boolean;
  /** `P1`, `M2`, `W1`: the tag the plan and its key share. */
  tag: string;
  legs: FlowLeg[];
  /** An arrowhead at every door the route goes through, and at its end. */
  arrows: { floor: string; at: Pt; dir: Pt }[];
  /** Each step with no door, stair or lift, and what the engine said of it. */
  breaks: { floor: string; at: Pt; message: string }[];
  /** Where the route leaves this floor or arrives on it by a stair/lift. */
  floorChanges: { floor: string; at: Pt; text: string }[];
  /** The rooms the route visits, in order (the published path). */
  path: string[];
  reason: string;
  end?: { floor: string; at: Pt };
}

interface Vertex { p: Pt; floor: string; broken: boolean }

/** The axis-aligned corner (if any) between two points inside one room.
 *  The last leg meets the exit wall square-on; with no exit wall, the first
 *  leg leaves the entry wall square-on. */
export function lCorner(e: Pt, x: Pt, entry?: Wall, exit?: Wall): Pt[] {
  if (Math.abs(e[0] - x[0]) < TOL || Math.abs(e[1] - x[1]) < TOL) return [];
  const horizontalFirst: Pt = [x[0], e[1]];
  const verticalFirst: Pt = [e[0], x[1]];
  if (exit) return [exit.orient === "v" ? verticalFirst : horizontalFirst];
  if (entry) return [entry.orient === "v" ? horizontalFirst : verticalFirst];
  return [horizontalFirst];
}

/** A point inside room r, `depth` in from wall w (at most 45 % of the room's
 *  depth), at position `along` on the wall. */
function interior(r: BuildingRoom, w: Wall, along: number, depth: number): Pt {
  const extent = w.orient === "v" ? r.xMax - r.xMin : r.yMax - r.yMin;
  const d = Math.min(depth, 0.45 * extent);
  const s = sideOf(w, centre(r));
  return w.orient === "v" ? [w.at + s * d, along] : [along, w.at + s * d];
}

const KIND_LETTER: Record<FlowKind, string> = { personnel: "P", material: "M", waste: "W" };

/** Every flow of the building, routed door to door through room interiors. */
export function flowRoutes(b: GmpBuilding, doors = planDoors(b)): FlowRoute[] {
  const byName = new Map(b.rooms.map((r) => [r.name, r]));
  const env = envelope(b);
  const counter: Record<FlowKind, number> = { personnel: 0, material: 0, waste: 0 };
  const joining = (p: string, q: string) =>
    doors.find((d) => (d.a === p && d.b === q) || (d.a === q && d.b === p));
  const breakMessage = (flow: string, p: string, q: string) =>
    b.findings.find((f) => f.kind === "flowBreak" && f.a === flow && f.b === `${p}->${q}`)?.message
      ?? `no door, stair or lift is published between ${p} and ${q}`;

  return b.flows.map((f): FlowRoute => {
    const lane = FLOW_LANE[f.kind];
    const vs: Vertex[] = [];
    const arrows: FlowRoute["arrows"] = [];
    const breaks: FlowRoute["breaks"] = [];
    const floorChanges: FlowRoute["floorChanges"] = [];
    const push = (p: Pt, floor: string, broken = false) => vs.push({ p, floor, broken });
    //  Where the route stands, and the wall it came in through.
    let cur: { p: Pt; floor: string; wall?: Wall } | null = null;
    const walkTo = (x: Pt, exit?: Wall) => {
      if (!cur) return;
      for (const c of lCorner(cur.p, x, cur.wall, exit)) push(c, cur.floor);
      push(x, cur.floor);
    };
    const crossing = (d: PlanDoor): number => {
      const w = d.wall!;
      const half = Math.max(0, d.width / 2 - 0.1);
      return wallMid(w) + Math.max(-half, Math.min(half, lane.along));
    };

    const first = byName.get(f.path[0] ?? "");
    if (first) { cur = { p: centre(first), floor: first.floor }; push(cur.p, cur.floor); }

    for (let k = 0; k + 1 < f.path.length; ++k) {
      const pn = f.path[k]!, qn = f.path[k + 1]!;
      const P = byName.get(pn), Q = byName.get(qn);
      const d = joining(pn, qn);
      if (!P && !Q) continue;                                // outside -> outside
      if (P && !Q) {
        //  Out of the building.
        if (d && d.wall && d.out && cur) {
          const along = crossing(d);
          walkTo(interior(P, d.wall, along, lane.depth), d.wall);
          const c = wallPoint(d.wall, along);
          push(c, P.floor);
          push([c[0] + d.out[0] * OUTSIDE_STUB, c[1] + d.out[1] * OUTSIDE_STUB], P.floor);
          arrows.push({ floor: P.floor, at: c, dir: d.out });
          cur = null;
        } else {
          walkTo(centre(P));
          const o = outerWall(P, env);
          const mid = wallPoint(o.wall, wallMid(o.wall));
          const outP: Pt = [mid[0] + o.out[0] * OUTSIDE_STUB, mid[1] + o.out[1] * OUTSIDE_STUB];
          push(outP, P.floor, true);
          breaks.push({ floor: P.floor, at: mid, message: breakMessage(f.name, pn, qn) });
          cur = null;
        }
        continue;
      }
      if (!P && Q) {
        //  Into the building.
        if (d && d.wall && d.out) {
          const along = crossing(d);
          const c = wallPoint(d.wall, along);
          push([c[0] + d.out[0] * OUTSIDE_STUB, c[1] + d.out[1] * OUTSIDE_STUB], Q.floor);
          push(c, Q.floor);
          arrows.push({ floor: Q.floor, at: c, dir: [-d.out[0], -d.out[1]] });
          const e = interior(Q, d.wall, along, lane.depth);
          push(e, Q.floor);
          cur = { p: e, floor: Q.floor, wall: d.wall };
        } else {
          const o = outerWall(Q, env);
          const mid = wallPoint(o.wall, wallMid(o.wall));
          push([mid[0] + o.out[0] * OUTSIDE_STUB, mid[1] + o.out[1] * OUTSIDE_STUB], Q.floor);
          push(centre(Q), Q.floor, true);
          breaks.push({ floor: Q.floor, at: mid, message: breakMessage(f.name, pn, qn) });
          cur = { p: centre(Q), floor: Q.floor };
        }
        continue;
      }
      //  Room to room.
      const R = P!, N = Q!;
      if (d && d.placed === "sharedWall" && d.wall) {
        const along = crossing(d);
        walkTo(interior(R, d.wall, along, lane.depth), d.wall);
        const c = wallPoint(d.wall, along);
        push(c, R.floor);
        const n = normalOf(d.wall);
        const s = sideOf(d.wall, centre(N));
        arrows.push({ floor: R.floor, at: c, dir: [n[0] * s, n[1] * s] });
        const e = interior(N, d.wall, along, lane.depth);
        push(e, N.floor);
        cur = { p: e, floor: N.floor, wall: d.wall };
      } else if (d && d.type !== "door" && d.placed === "overlap") {
        walkTo(d.at);
        const up = N.z > R.z;
        floorChanges.push({ floor: R.floor, at: d.at,
          text: `${up ? "up" : "down"} the ${d.type} to ${N.floor}` });
        floorChanges.push({ floor: N.floor, at: d.at,
          text: `${up ? "up" : "down"} the ${d.type} from ${R.floor}` });
        push(d.at, N.floor);
        cur = { p: d.at, floor: N.floor };
      } else {
        //  No placeable connection: straight from room centre to room
        //  centre, dashed when the engine found no door at all.
        walkTo(centre(R));
        const broken = !d;
        push(centre(N), N.floor, broken);
        if (broken) {
          const m: Pt = [(cx(R) + cx(N)) / 2, (cy(R) + cy(N)) / 2];
          breaks.push({ floor: R.floor, at: m, message: breakMessage(f.name, pn, qn) });
        }
        cur = { p: centre(N), floor: N.floor };
      }
    }
    const last = byName.get(f.path[f.path.length - 1] ?? "");
    if (last && cur && f.path.length > 1) walkTo(centre(last));

    //  Legs: consecutive segments on one floor with one style.
    const legs: FlowLeg[] = [];
    for (let i = 1; i < vs.length; ++i) {
      const a = vs[i - 1]!, v = vs[i]!;
      if (a.floor !== v.floor) continue;                     // a stair: no segment
      if (Math.abs(a.p[0] - v.p[0]) < TOL && Math.abs(a.p[1] - v.p[1]) < TOL) continue;
      const broken = v.broken;
      const prev = legs[legs.length - 1];
      if (prev && prev.floor === v.floor && prev.broken === broken
          && samePt(prev.points[prev.points.length - 1]!, a.p)) prev.points.push(v.p);
      else legs.push({ floor: v.floor, points: [a.p, v.p], broken });
    }
    const end = vs.length > 1 ? vs[vs.length - 1]! : undefined;
    if (end && vs.length > 1) {
      const pre = vs[vs.length - 2]!;
      const dx = end.p[0] - pre.p[0], dy = end.p[1] - pre.p[1];
      const len = Math.hypot(dx, dy);
      if (len > TOL && pre.floor === end.floor)
        arrows.push({ floor: end.floor, at: end.p, dir: [dx / len, dy / len] });
    }
    counter[f.kind] += 1;
    return {
      name: f.name, kind: f.kind, connected: f.connected,
      tag: `${KIND_LETTER[f.kind]}${counter[f.kind]}`,
      legs, arrows, breaks, floorChanges, path: f.path, reason: f.reason,
      ...(end ? { end: { floor: end.floor, at: end.p } } : {}),
    };
  });
}

const samePt = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < TOL && Math.abs(a[1] - b[1]) < TOL;

//  ---- labels, numbers and the schedule ----------------------------------

/** Width of a character in em (a sans-serif estimate) and line height. */
export const CHAR_EM = 0.58;
export const LINE_EM = 1.2;

export interface RoomLabelFit {
  /** `full`: the first (longest) candidate fits; `short`: a shorter one
   *  does; `tag`: only the last -- the room's number, which the room
   *  schedule resolves. */
  mode: "full" | "short" | "tag";
  lines: string[];
  font: number;
}

/** Fit a room's label in its box (w x h): the first candidate set of lines
 *  that fits at `font` down to `minFont`; else the LAST candidate (the
 *  room's number) shrunk to fit.  No label is wider than its room unless
 *  even the number cannot fit at half the minimum font. */
export function fitRoomLabel(w: number, h: number, candidates: string[][],
                             font: number, minFont: number): RoomLabelFit {
  const fontFor = (lines: string[]) => {
    const longest = Math.max(1, ...lines.map((t) => t.length));
    return Math.min(font, (0.9 * w) / (CHAR_EM * longest),
                    (0.85 * h) / (LINE_EM * Math.max(1, lines.length)));
  };
  const last = candidates.length - 1;
  for (let i = 0; i < last; ++i) {
    const f = fontFor(candidates[i]!);
    if (f >= minFont) return { mode: i === 0 ? "full" : "short", lines: candidates[i]!, font: f };
  }
  const tag = candidates[last] ?? [];
  const f = fontFor(tag);
  return { mode: last === 0 && f >= minFont ? "full" : "tag", lines: tag,
           font: Math.max(f, 0.5 * minFont) };
}

/** Every room's number: `<floor index>.<nn>`, floors counted from the
 *  lowest elevation (0), rooms in the order the engine published them. */
export function roomNumbers(b: GmpBuilding): Map<string, string> {
  const floors = [...b.floors].sort((p, q) => p.elevation - q.elevation).map((f) => f.name);
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of b.rooms) {
    let fi = floors.indexOf(r.floor);
    if (fi < 0) fi = floors.length;
    const n = (count.get(r.floor) ?? 0) + 1;
    count.set(r.floor, n);
    out.set(r.name, `${fi}.${String(n).padStart(2, "0")}`);
  }
  return out;
}

export interface ScheduleRow {
  number: string; name: string; floor: string; role: string; grade: string;
  regime: string; pressureToOutside: number;
  /** The pressure as declared, against its reference: "10 vs lobby". */
  declared: string;
  area: number; height: number;
  occupancy: string; atexZone: string; equipment: string; notes: string;
}

/** The room schedule: one row per published room, in its order. */
export function roomSchedule(b: GmpBuilding): ScheduleRow[] {
  const num = roomNumbers(b);
  return b.rooms.map((r) => ({
    number: num.get(r.name) ?? "",
    name: r.name, floor: r.floor, role: ROLE_WORD[r.role] ?? r.role, grade: r.grade,
    regime: r.regime, pressureToOutside: r.pressureToOutside,
    declared: `${r.pressure} vs ${r.relativeTo}`, area: r.area, height: r.height,
    occupancy: r.occupancy !== undefined ? String(r.occupancy) : "",
    atexZone: r.atexZone !== undefined ? `zone ${r.atexZone}` : "",
    equipment: r.equipment.join(", "),
    notes: [r.containment ? "containment" : "",
            r.ignition ? `ignition source: ${r.ignition}` : ""].filter(Boolean).join("; "),
  }));
}

/** The schedule as CSV (RFC 4180 quoting where needed). */
export function scheduleCsv(rows: ScheduleRow[]): string {
  const head = ["number", "room", "floor", "role", "grade", "regime",
                "pressure to outside [Pa]", "declared [Pa]", "area [m2]", "height [m]", "occupancy",
                "ATEX zone", "equipment", "notes"];
  const q = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows.map((r) => [r.number, r.name, r.floor, r.role, r.grade, r.regime,
    r.pressureToOutside, r.declared, Number(r.area.toFixed(2)), r.height, r.occupancy, r.atexZone,
    r.equipment, r.notes])].map((row) => row.map(q).join(",")).join("\n") + "\n";
}

//  ---- the sheet: scale bar, wrapping ------------------------------------

/** The longest round length (1, 2 or 5 x 10^k metres) not above `max`. */
export function scaleBarLength(max: number): number {
  if (!(max > 0)) return 1;
  const k = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [5, 2, 1]) if (m * k <= max + TOL) return m * k;
  return k;
}

/** Words wrapped to lines of at most `width` characters (a word longer
 *  than the line stands alone). */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + w.length > width) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** The footnotes a plan of this kind carries: what is drawn, not published. */
export function planFootnotes(kind: PlanSheetKind): string[] {
  const notes = [
    "Every room, grade, pressure, door, flow and finding is the engine's (building {} in"
      + " system/layoutDict, as checked).",
    "Door positions are NOT published: each door is drawn at the midpoint of the wall its two"
      + ` rooms share (a door to outside at the midpoint of the room's outer wall nearest the`
      + ` building's edge), ${DOOR_WIDTH} m wide as a symbol; a stair or lift where its two rooms`
      + " overlap in plan.",
  ];
  if (kind === "pressure")
    notes.push("Each arrow crosses a door from the higher to the lower pressure (air moves that"
      + " way), labelled with the published step dP [Pa]; each room shows its pressure to outside.");
  if (kind === "personnel" || kind === "material" || kind === "waste")
    notes.push("The engine publishes the sequence of rooms; the route inside a room is drawn door"
      + " to door.  A step with no door, stair or lift is dashed and marked x.");
  return notes;
}
