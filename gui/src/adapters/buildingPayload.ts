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
  THE GMP INTERIOR as the engine published it (DEV.md 4c C97 phase B): the
  result JSON's top-level `"building"` block (src/result/BuildingJson.cpp),
  its TYPES and the one function that polices them.  Its own file so the two
  adapters that carry a run's result touch it through one import each.

  Only the types are policed: a room whose box or pressure is not a finite
  number is DROPPED rather than drawn at the origin, and a flow, connection
  or finding naming a room that is not published is dropped with it.  Nothing
  is computed here -- no area, no pressure, no verdict.
\*---------------------------------------------------------------------------*/

export type Grade = "A" | "B" | "C" | "D" | "CNC";
export type RoomRole = "room" | "personnelAirlock" | "materialAirlock" | "gowning";
export type FlowKind = "personnel" | "material" | "waste";

export interface BuildingFloor { name: string; elevation: number; height: number }

export interface BuildingRoom {
  name: string;
  floor: string;
  role: RoomRole;
  grade: Grade;
  /** cascade | bubble | sink on an airlock; "" otherwise. */
  regime: string;
  containment: boolean;
  xMin: number; xMax: number; yMin: number; yMax: number;
  /** The floor's elevation [m] and the room's height [m]. */
  z: number; height: number;
  area: number;
  /** Declared [Pa], against `relativeTo` (a room or "outside"). */
  pressure: number;
  relativeTo: string;
  /** Resolved along the chain [Pa]: the number every rule compares. */
  pressureToOutside: number;
  occupancy?: number;
  atexZone?: number;
  ignition?: string;
  equipment: string[];
}

export interface BuildingConnection {
  id: string; a: string; b: string; type: "door" | "stair" | "lift"; dP: number;
}

export interface BuildingFlow {
  name: string; kind: FlowKind; path: string[]; connected: boolean; reason: string;
}

export interface BuildingFinding {
  id: string; kind: string; a: string; b: string;
  value: number; limit: number; message: string;
}

export interface GmpBuilding {
  name: string;
  source: string;
  reason: string;
  minimumStep: number;
  stepSource: string;
  atexDistance?: number;
  /** The non-process item of the plot plan that is this building's shell
   *  (`envelope <id>;`): the 3D view draws it as glass round the rooms. */
  envelope?: string;
  floorArea: number;
  occupancy: number;
  floors: BuildingFloor[];
  rooms: BuildingRoom[];
  connections: BuildingConnection[];
  flows: BuildingFlow[];
  shared: { room: string; flows: string[]; reason: string }[];
  findings: BuildingFinding[];
}

const GRADES = new Set(["A", "B", "C", "D", "CNC"]);
const ROLES = new Set(["room", "personnelAirlock", "materialAirlock", "gowning"]);
const KINDS = new Set(["personnel", "material", "waste"]);

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v.map(rec) : []);
const words = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The published block, typed; undefined when it carries no room. */
export function shapeBuilding(raw: unknown): GmpBuilding | undefined {
  const b = rec(raw);
  //  The engine's block keeps these in `summary`; a block shaped here and
  //  embedded in an exported page keeps them at the top level -- read either,
  //  or the page loses the name, the step and the envelope (DEV.md 4c C97).
  const s = rec(b.summary ?? b);
  const rooms: BuildingRoom[] = arr(b.rooms)
    .filter((r) => typeof r.name === "string"
      && [r.xMin, r.xMax, r.yMin, r.yMax, r.z, r.height, r.area,
          r.pressure, r.pressureToOutside].every(fin)
      && GRADES.has(str(r.grade)))
    .map((r) => ({
      name: str(r.name), floor: str(r.floor),
      role: (ROLES.has(str(r.role)) ? str(r.role) : "room") as RoomRole,
      grade: str(r.grade) as Grade, regime: str(r.regime),
      containment: r.containment === true,
      xMin: r.xMin as number, xMax: r.xMax as number,
      yMin: r.yMin as number, yMax: r.yMax as number,
      z: r.z as number, height: r.height as number, area: r.area as number,
      pressure: r.pressure as number, relativeTo: str(r.relativeTo),
      pressureToOutside: r.pressureToOutside as number,
      ...(fin(r.occupancy) ? { occupancy: r.occupancy } : {}),
      ...(fin(r.atexZone) ? { atexZone: r.atexZone } : {}),
      ...(typeof r.ignition === "string" && r.ignition ? { ignition: r.ignition } : {}),
      equipment: words(r.equipment),
    }));
  if (rooms.length === 0) return undefined;
  const known = new Set([...rooms.map((r) => r.name), "outside"]);
  return {
    name: str(s.name), source: str(s.source), reason: str(s.reason),
    minimumStep: fin(s.minimumStep) ? s.minimumStep : NaN,
    stepSource: str(s.stepSource),
    ...(fin(s.atexDistance) ? { atexDistance: s.atexDistance } : {}),
    ...(typeof s.envelope === "string" && s.envelope ? { envelope: s.envelope } : {}),
    floorArea: fin(s.floorArea) ? s.floorArea : NaN,
    occupancy: fin(s.occupancy) ? s.occupancy : 0,
    floors: arr(b.floors).filter((f) => fin(f.elevation) && fin(f.height))
      .map((f) => ({ name: str(f.name), elevation: f.elevation as number,
                     height: f.height as number })),
    rooms,
    connections: arr(b.connections)
      .filter((c) => known.has(str(c.a)) && known.has(str(c.b)) && fin(c.dP))
      .map((c) => ({
        id: str(c.id), a: str(c.a), b: str(c.b),
        type: (c.type === "stair" || c.type === "lift" ? c.type : "door") as
          BuildingConnection["type"],
        dP: c.dP as number,
      })),
    flows: arr(b.flows)
      .filter((f) => KINDS.has(str(f.kind)) && words(f.path).every((n) => known.has(n)))
      .map((f) => ({ name: str(f.name), kind: str(f.kind) as FlowKind,
                     path: words(f.path), connected: f.connected !== false,
                     reason: str(f.reason) })),
    shared: arr(b.shared).map((x) => ({ room: str(x.room), flows: words(x.flows),
                                         reason: str(x.reason) })),
    findings: arr(b.findings).map((f) => ({
      id: str(f.id), kind: str(f.kind), a: str(f.a), b: str(f.b),
      value: fin(f.value) ? f.value : NaN, limit: fin(f.limit) ? f.limit : NaN,
      message: str(f.message),
    })),
  };
}
