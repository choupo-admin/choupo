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
  THE GMP INTERIOR -- the scene and the plan, with no drawing in them (DEV.md
  4c C97 phase B).

  The engine reads `building {}` in `system/layoutDict`, checks it and
  publishes the `building` block: every room's box, grade, role, regime and
  pressure resolved to outside, the connections, the flows and the findings.
  This module maps that block onto (1) a 3D CUTAWAY description the three.js
  extension (ui/plotting/gmpBuildingRenderer.ts) draws inside the SAME scene
  as the plot plan, and (2) a 2D PLAN per floor the React section draws as
  SVG.  Pure, so both can be tested without a browser.

  ZERO VERDICT HERE ("THE ENGINE DECIDES, THE GUI DRAWS").  No pressure, no
  cascade, no crossing is computed: a room is flagged because a published
  finding names it.  What IS done here is drawing: the plan's (x, y, z-up)
  becomes three.js's (X, Y-up, Z = -y); a flow arrow runs from room centre
  to room centre through the MIDDLE OF THE WALL the two rooms share (the
  door's place is the case's business; the arrow only needs to look like it
  goes through one), lifted a little above the floor by kind so the three
  kinds never lie on one another.

  GREYSCALE SURVIVES.  A grade is a colour AND the letter in the room's
  label; an airlock is a dashed outline AND the word in its label; the three
  flow kinds differ by colour, by HEIGHT above the floor and by STROKE (solid
  personnel, double-weight material, dashed waste).
\*---------------------------------------------------------------------------*/

import type {
  BuildingFlow, BuildingRoom, FlowKind, GmpBuilding, Grade,
} from "../adapters/buildingPayload.js";
import type { LayoutScene, Vec3 } from "./plantLayout.js";

/** Cleaner is cooler and deeper; CNC is neutral grey.  The letter is always
 *  in the label, so the colour is never the only channel. */
export const GRADE_LOOK: Record<Grade, { colour: number; css: string; word: string }> = {
  A:   { colour: 0x6741d9, css: "#6741d9", word: "Grade A -- critical zone" },
  B:   { colour: 0x1971c2, css: "#1971c2", word: "Grade B -- background to A" },
  C:   { colour: 0x0c8599, css: "#0c8599", word: "Grade C" },
  D:   { colour: 0x37b24d, css: "#37b24d", word: "Grade D" },
  CNC: { colour: 0x868e96, css: "#868e96", word: "CNC -- controlled, not classified" },
};
export const GRADE_ORDER: Grade[] = ["A", "B", "C", "D", "CNC"];

export const FLOW_LOOK: Record<FlowKind, {
  colour: number; css: string; word: string; lift: number; dashed: boolean; weight: number;
}> = {
  personnel: { colour: 0x1864ab, css: "#1864ab", word: "personnel", lift: 0.6,
               dashed: false, weight: 1 },
  material:  { colour: 0xe67700, css: "#e67700", word: "material (raw -> product)",
               lift: 1.1, dashed: false, weight: 2 },
  waste:     { colour: 0x862e9c, css: "#862e9c", word: "waste", lift: 1.6,
               dashed: true, weight: 1 },
};
export const FLOW_KINDS: FlowKind[] = ["personnel", "material", "waste"];

/** The one sentence that says how the interior is drawn (app and export). */
export const GMP_LEGEND =
  "The GMP interior (building {}): each room a translucent box tinted by its grade (A violet,"
  + " B blue, C teal, D green, CNC grey) and labelled with its grade and pressure to outside;"
  + " an airlock dashed and named with its regime; a room named in a finding outlined in"
  + " orange with a warning sign; flows as arrows -- personnel blue and lowest, material"
  + " orange and heavier, waste purple and dashed, highest.";

/** Metres an `outside` end of a flow is drawn beyond the room it leaves or
 *  enters -- drawing, not geometry the engine published. */
export const OUTSIDE_STUB = 4;

export const ROLE_WORD: Record<string, string> = {
  room: "room",
  personnelAirlock: "personnel airlock",
  materialAirlock: "material airlock",
  gowning: "gowning room",
};

const isAirlock = (r: BuildingRoom) => r.role !== "room";
const fmtP = (p: number) => `${p > 0 ? "+" : ""}${Number(p.toFixed(2))} Pa`;

/** The text a room carries: its name, grade, and pressure to outside. */
export function roomLabel(r: BuildingRoom, flagged: boolean): string {
  const role = isAirlock(r) ? ` · ${ROLE_WORD[r.role]} (${r.regime})` : "";
  return `${flagged ? "⚠ " : ""}${r.name} · ${r.grade}${role} · ${fmtP(r.pressureToOutside)}`;
}

export interface SceneRoom {
  name: string;
  grade: Grade;
  colour: number;
  airlock: boolean;
  containment: boolean;
  /** three.js centre and size (X, Y-up, Z). */
  center: Vec3;
  size: Vec3;
  label: string;
  labelAt: Vec3;
  tooltip: string[];
  flagged: boolean;
}

export interface SceneFlow {
  name: string;
  kind: FlowKind;
  colour: number;
  dashed: boolean;
  weight: number;
  /** The polyline in three.js coordinates, in the direction of the flow. */
  points: Vec3[];
  /** The engine found a step with no door, stair or lift. */
  broken: boolean;
}

export interface BuildingScene {
  name: string;
  rooms: SceneRoom[];
  flows: SceneFlow[];
  /** Bounding box of the rooms (three.js), for the camera's fit. */
  min: Vec3;
  max: Vec3;
}

/** Plan (x, y, z-up) to three.js (X, Y-up, Z). */
const T = (x: number, y: number, z: number): Vec3 => [x, z, -y];

function flaggedRooms(b: GmpBuilding): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const names = new Set(b.rooms.map((r) => r.name));
  for (const f of b.findings)
    for (const n of [f.a, f.b])
      if (names.has(n)) out.set(n, [...(out.get(n) ?? []), f.message]);
  return out;
}

/** Where a flow step crosses from room a to room b, in PLAN (x, y): the
 *  middle of the wall they share, else (a stair, a lift) the middle of
 *  their plan overlap, else the midpoint of their centres. */
export function stepPoint(a: BuildingRoom, b: BuildingRoom): [number, number] {
  const ox0 = Math.max(a.xMin, b.xMin), ox1 = Math.min(a.xMax, b.xMax);
  const oy0 = Math.max(a.yMin, b.yMin), oy1 = Math.min(a.yMax, b.yMax);
  if (ox1 >= ox0 && oy1 >= oy0) return [(ox0 + ox1) / 2, (oy0 + oy1) / 2];
  return [((a.xMin + a.xMax) / 2 + (b.xMin + b.xMax) / 2) / 2,
          ((a.yMin + a.yMax) / 2 + (b.yMin + b.yMax) / 2) / 2];
}

/** The plan point an `outside` end is drawn at: OUTSIDE_STUB beyond the
 *  side of the room nearest the edge of the building's plan envelope. */
export function outsidePoint(r: BuildingRoom, env: { x0: number; x1: number; y0: number; y1: number }):
  [number, number] {
  const cx = (r.xMin + r.xMax) / 2, cy = (r.yMin + r.yMax) / 2;
  const sides: [number, [number, number]][] = [
    [r.xMin - env.x0, [r.xMin - OUTSIDE_STUB, cy]],
    [env.x1 - r.xMax, [r.xMax + OUTSIDE_STUB, cy]],
    [r.yMin - env.y0, [cx, r.yMin - OUTSIDE_STUB]],
    [env.y1 - r.yMax, [cx, r.yMax + OUTSIDE_STUB]],
  ];
  sides.sort((p, q) => p[0] - q[0]);
  return sides[0]![1];
}

/** The plan polyline of one flow: (x, y, floor elevation) per point. */
export function flowPlanPoints(f: BuildingFlow, b: GmpBuilding): [number, number, number][] {
  const byName = new Map(b.rooms.map((r) => [r.name, r]));
  const env = envelope(b);
  const centre = (r: BuildingRoom): [number, number, number] =>
    [(r.xMin + r.xMax) / 2, (r.yMin + r.yMax) / 2, r.z];
  const pts: [number, number, number][] = [];
  for (let k = 0; k < f.path.length; ++k) {
    const n = f.path[k]!;
    const r = byName.get(n);
    if (!r) {
      //  `outside`: drawn beside its neighbour on the path.
      const nb = byName.get(f.path[k === 0 ? 1 : k - 1] ?? "");
      if (nb) { const [x, y] = outsidePoint(nb, env); pts.push([x, y, nb.z]); }
      continue;
    }
    if (k > 0) {
      const prev = byName.get(f.path[k - 1]!);
      if (prev) {
        const [x, y] = stepPoint(prev, r);
        pts.push([x, y, prev.z]);
        if (prev.z !== r.z) pts.push([x, y, r.z]);
      }
    }
    pts.push(centre(r));
  }
  return pts;
}

export function envelope(b: GmpBuilding) {
  return {
    x0: Math.min(...b.rooms.map((r) => r.xMin)), x1: Math.max(...b.rooms.map((r) => r.xMax)),
    y0: Math.min(...b.rooms.map((r) => r.yMin)), y1: Math.max(...b.rooms.map((r) => r.yMax)),
  };
}

export function buildingScene(b: GmpBuilding): BuildingScene {
  const flagged = flaggedRooms(b);
  const rooms: SceneRoom[] = b.rooms.map((r) => {
    const msgs = flagged.get(r.name) ?? [];
    const tip = [
      r.name,
      `${GRADE_LOOK[r.grade].word} · ${ROLE_WORD[r.role]}${r.regime ? ` (${r.regime})` : ""}`,
      `pressure ${fmtP(r.pressureToOutside)} to outside`
        + (r.relativeTo !== "outside" ? ` (declared ${fmtP(r.pressure)} vs ${r.relativeTo})` : ""),
      `floor ${r.floor}, ${Number(r.area.toFixed(2))} m², ${r.height} m high`,
      ...(r.containment ? ["containment: negative to its neighbours"] : []),
      ...(r.atexZone !== undefined ? [`hazardous area: zone ${r.atexZone}`] : []),
      ...(r.ignition ? [`ignition source: ${r.ignition}`] : []),
      ...(r.occupancy !== undefined ? [`occupancy ${r.occupancy}`] : []),
      ...(r.equipment.length ? [`equipment: ${r.equipment.join(", ")}`] : []),
      ...msgs.map((m) => `⚠ ${m}`),
    ];
    return {
      name: r.name, grade: r.grade, colour: GRADE_LOOK[r.grade].colour,
      airlock: isAirlock(r), containment: r.containment,
      center: T((r.xMin + r.xMax) / 2, (r.yMin + r.yMax) / 2, r.z + r.height / 2),
      size: [r.xMax - r.xMin, r.height, r.yMax - r.yMin],
      label: roomLabel(r, msgs.length > 0),
      labelAt: T((r.xMin + r.xMax) / 2, (r.yMin + r.yMax) / 2, r.z + 0.15),
      tooltip: tip,
      flagged: msgs.length > 0,
    };
  });
  const flows: SceneFlow[] = b.flows.map((f) => {
    const look = FLOW_LOOK[f.kind];
    return {
      name: f.name, kind: f.kind, colour: look.colour, dashed: look.dashed,
      weight: look.weight, broken: !f.connected,
      points: flowPlanPoints(f, b).map(([x, y, z]) => T(x, y, z + look.lift)),
    };
  });
  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, 0, -Infinity];
  for (const r of rooms) {
    min[0] = Math.min(min[0], r.center[0] - r.size[0] / 2);
    max[0] = Math.max(max[0], r.center[0] + r.size[0] / 2);
    max[1] = Math.max(max[1], r.center[1] + r.size[1] / 2);
    min[2] = Math.min(min[2], r.center[2] - r.size[2] / 2);
    max[2] = Math.max(max[2], r.center[2] + r.size[2] / 2);
  }
  return { name: b.name, rooms, flows, min, max };
}

/** The plant scene with its boxes grown to hold the building, so the
 *  camera's fit and the ground frame it.  Nothing else changes. */
export function withBuilding(scene: LayoutScene, bs: BuildingScene): LayoutScene {
  const grow = (a: Vec3, b: Vec3, f: (x: number, y: number) => number): Vec3 =>
    [f(a[0], b[0]), f(a[1], b[1]), f(a[2], b[2])];
  return {
    ...scene,
    min: grow(scene.min, bs.min, Math.min),
    max: grow(scene.max, bs.max, Math.max),
    fitMin: grow(scene.fitMin, bs.min, Math.min),
    fitMax: grow(scene.fitMax, bs.max, Math.max),
  };
}

//  ---- the 2D plan, per floor (SVG units = metres, y down) -----------------

export interface PlanRoom {
  name: string; x: number; y: number; w: number; h: number;
  fill: string; airlock: boolean; containment: boolean; flagged: boolean;
  lines: string[];
}
export interface PlanFlow { name: string; kind: FlowKind; css: string; dashed: boolean;
                            weight: number; points: [number, number][] }
export interface FloorPlan {
  floor: string; elevation: number;
  viewBox: [number, number, number, number];
  rooms: PlanRoom[];
  flows: PlanFlow[];
}

/** One plan per declared floor: its rooms, and the parts of each flow that
 *  run on it.  SVG y grows DOWN, so plan +y (north) is drawn up the page. */
export function floorPlans(b: GmpBuilding): FloorPlan[] {
  const flagged = flaggedRooms(b);
  const env = envelope(b);
  const pad = OUTSIDE_STUB + 2;
  const vb: [number, number, number, number] =
    [env.x0 - pad, -env.y1 - pad, env.x1 - env.x0 + 2 * pad, env.y1 - env.y0 + 2 * pad];
  return b.floors.map((fl) => {
    const rooms = b.rooms.filter((r) => r.floor === fl.name).map((r) => ({
      name: r.name, x: r.xMin, y: -r.yMax, w: r.xMax - r.xMin, h: r.yMax - r.yMin,
      fill: GRADE_LOOK[r.grade].css, airlock: isAirlock(r), containment: r.containment,
      flagged: flagged.has(r.name),
      lines: [`${flagged.has(r.name) ? "⚠ " : ""}${r.name}`,
              `${r.grade}${isAirlock(r) ? ` ${r.regime}` : ""} ${fmtP(r.pressureToOutside)}`],
    }));
    const flows: PlanFlow[] = [];
    for (const f of b.flows) {
      const pts = flowPlanPoints(f, b);
      //  The runs of consecutive points on this floor.
      let run: [number, number][] = [];
      const flush = () => {
        if (run.length > 1) {
          const look = FLOW_LOOK[f.kind];
          flows.push({ name: f.name, kind: f.kind, css: look.css, dashed: look.dashed,
                       weight: look.weight, points: run });
        }
        run = [];
      };
      for (const [x, y, z] of pts) {
        if (Math.abs(z - fl.elevation) < 1e-9) run.push([x, -y]);
        else flush();
      }
      flush();
    }
    return { floor: fl.name, elevation: fl.elevation, viewBox: vb, rooms, flows };
  });
}
