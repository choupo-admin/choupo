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

//  THE GMP FLOOR PLANS A STUDENT CAN HAND IN (DEV.md 4c C103): the drawing
//  geometry of case/gmpPlanSheet.ts -- doors on shared walls, the cascade
//  arrow's direction from the published dP, flow routes that never cross a
//  wall except through a door, label fit with a number fallback, and a
//  schedule with exactly one row per published room.  The fixture is a
//  small building in the shape of the check_gmp_layout clean probe.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { shapeBuilding, type BuildingRoom } from "../src/adapters/buildingPayload.js";
import {
  cascadeArrow, fitRoomLabel, flowRoutes, lCorner, outerWall, planDoors, planSheetKinds,
  roomNumbers, roomSchedule, scaleBarLength, scheduleCsv, sharedWall, wrapText, type Pt,
} from "../src/case/gmpPlanSheet.js";
import { envelope } from "../src/case/gmpBuilding.js";
import { PlanSheetSvg } from "../src/ui/GmpPlanSheet.js";

const room = (name: string, o: Record<string, unknown>) => ({
  id: `room:${name}`, name, floor: "ground", role: "room", grade: "D", regime: "",
  containment: false, z: 0, height: 5, relativeTo: "outside", equipment: [], ...o,
});

//  ground: lobby (CNC +5) | gowning (D +15, an airlock) east of it, the
//  corridor (D +25) along the north of both, a store (D +25) NOT adjacent to
//  the lobby; upper: plant (CNC 0) over the lobby, reached by a stair.
const RAW = {
  summary: { name: "probe block", minimumStep: 10, stepSource: "x", floorArea: 1,
             occupancy: 0, source: "probe", reason: "probe" },
  floors: [{ name: "ground", elevation: 0, height: 5 }, { name: "upper", elevation: 6, height: 4 }],
  rooms: [
    room("lobby", { grade: "CNC", xMin: 0, xMax: 6, yMin: 0, yMax: 6, area: 36,
                    pressure: 5, pressureToOutside: 5 }),
    room("gowning", { role: "gowning", regime: "cascade", xMin: 6, xMax: 9, yMin: 0, yMax: 6,
                      area: 18, pressure: 10, relativeTo: "lobby", pressureToOutside: 15 }),
    room("corridor", { xMin: 0, xMax: 30, yMin: 6, yMax: 9, area: 90, pressure: 25,
                       pressureToOutside: 25 }),
    room("store", { xMin: 20, xMax: 30, yMin: 0, yMax: 6, area: 60, pressure: 25,
                    pressureToOutside: 25, equipment: ["bin"] }),
    room("plant", { floor: "upper", grade: "CNC", z: 6, height: 4, xMin: 3, xMax: 9, yMin: 0,
                    yMax: 6, area: 36, pressure: 0, pressureToOutside: 0 }),
  ],
  connections: [
    { id: "d1", a: "lobby", b: "outside", type: "door", dP: 5 },
    { id: "d2", a: "lobby", b: "gowning", type: "door", dP: -10 },
    { id: "d3", a: "gowning", b: "corridor", type: "door", dP: -10 },
    { id: "d4", a: "corridor", b: "store", type: "door", dP: 0 },
    { id: "s1", a: "lobby", b: "plant", type: "stair", dP: 5 },
  ],
  flows: [
    { name: "operators", kind: "personnel", connected: true, reason: "in",
      path: ["outside", "lobby", "gowning", "corridor", "store"] },
    { name: "upstairs", kind: "personnel", connected: true, reason: "",
      path: ["lobby", "plant"] },
    { name: "shortcut", kind: "material", connected: false, reason: "a kit",
      path: ["lobby", "store"] },
  ],
  shared: [],
  findings: [{ id: "flowBreak:shortcut", kind: "flowBreak", a: "shortcut", b: "lobby->store",
               value: 0, limit: 0, message: "material flow `shortcut` goes through a wall" }],
};

const b = shapeBuilding(RAW)!;
const R = (n: string) => b.rooms.find((r) => r.name === n)!;
const inside = (r: BuildingRoom, p: Pt) =>
  p[0] >= r.xMin - 1e-9 && p[0] <= r.xMax + 1e-9 && p[1] >= r.yMin - 1e-9 && p[1] <= r.yMax + 1e-9;

describe("doors on the plan (C103)", () => {
  it("finds the wall two rooms share, and none where they do not touch", () => {
    expect(sharedWall(R("lobby"), R("gowning"))).toEqual({ orient: "v", at: 6, from: 0, to: 6 });
    expect(sharedWall(R("gowning"), R("corridor"))).toEqual({ orient: "h", at: 6, from: 6, to: 9 });
    expect(sharedWall(R("lobby"), R("store"))).toBeUndefined();
  });

  it("draws each door at the midpoint of the shared wall, an outside door on the outer wall", () => {
    const doors = planDoors(b);
    const d2 = doors.find((d) => d.id === "d2")!;
    expect(d2.placed).toBe("sharedWall");
    expect(d2.at).toEqual([6, 3]);
    expect(d2.floors).toEqual(["ground"]);
    expect(doors.find((d) => d.id === "d3")!.at).toEqual([7.5, 6]);
    //  The lobby touches the west (x 0) and south (y 0) edges; the tie goes
    //  west, as the cutaway's outsidePoint does.
    const d1 = doors.find((d) => d.id === "d1")!;
    expect(d1.placed).toBe("outerWall");
    expect(d1.at).toEqual([0, 3]);
    expect(d1.out).toEqual([-1, 0]);
    expect(outerWall(R("store"), envelope(b)).out).toEqual([1, 0]);
    //  The drawn width is a symbol, and never wider than 60 % of its wall.
    expect(d2.width).toBeCloseTo(1.2);
    expect(doors.find((d) => d.id === "d3")!.width).toBeCloseTo(1.2);
  });

  it("puts a stair where its two rooms overlap in plan, on both floors", () => {
    const s = planDoors(b).find((d) => d.id === "s1")!;
    expect(s.placed).toBe("overlap");
    expect(s.at).toEqual([4.5, 3]);
    expect(s.floors).toEqual(["ground", "upper"]);
  });
});

describe("the pressure cascade (C103)", () => {
  const doors = planDoors(b);
  it("points from the higher to the lower pressure, read off the published dP", () => {
    //  dP(lobby, gowning) = -10: the gowning room (east) is higher, so the
    //  air -- and the arrow -- goes west, into the lobby.
    const a = cascadeArrow(doors.find((d) => d.id === "d2")!, b, 2)!;
    expect(a.high).toBe("gowning");
    expect(a.low).toBe("lobby");
    expect(a.dP).toBe(10);
    expect(a.from).toEqual([7, 3]);
    expect(a.to).toEqual([5, 3]);
    //  The lobby (+5) to outside: out through the west wall.
    const o = cascadeArrow(doors.find((d) => d.id === "d1")!, b, 2)!;
    expect(o.high).toBe("lobby");
    expect(o.to[0]).toBeLessThan(o.from[0]);
    //  Corridor to gowning, north to south.
    const c = cascadeArrow(doors.find((d) => d.id === "d3")!, b, 2)!;
    expect(c.high).toBe("corridor");
    expect(c.to[1]).toBeLessThan(c.from[1]);
  });
  it("draws no arrow with no step, nor on a stair", () => {
    expect(cascadeArrow(doors.find((d) => d.id === "d4")!, b)).toBeUndefined();
    expect(cascadeArrow(doors.find((d) => d.id === "s1")!, b)).toBeUndefined();
  });
});

describe("flow routes, door to door (C103)", () => {
  const routes = flowRoutes(b);
  const op = routes.find((r) => r.name === "operators")!;

  it("never leaves a room except through a door", () => {
    const ground = op.legs.filter((l) => l.floor === "ground");
    const pts = ground.flatMap((l) => l.points);
    const doors = planDoors(b);
    //  Every segment is axis-aligned, and its midpoint lies in a room or
    //  at a door (outside the building only on the stub at the outside door).
    for (const l of ground)
      for (let i = 1; i < l.points.length; ++i) {
        const [p, q] = [l.points[i - 1]!, l.points[i]!];
        expect(Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9).toBe(true);
        const m: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const inRoom = b.rooms.some((r) => r.floor === "ground" && inside(r, m));
        const onStub = m[0] < 0;                               // west of the lobby's door
        expect(inRoom || onStub).toBe(true);
      }
    //  It crosses each wall at its door: points on x = 6 lie within d2's gap.
    const d2 = doors.find((d) => d.id === "d2")!;
    for (const p of pts.filter((p) => Math.abs(p[0] - 6) < 1e-9 && p[1] < 6))
      expect(Math.abs(p[1] - d2.at[1])).toBeLessThanOrEqual(d2.width / 2);
    expect(op.tag).toBe("P1");
    expect(op.end).toEqual({ floor: "ground", at: [25, 3] });
    //  An arrowhead at each of the four doors, and one at the end.
    expect(op.arrows).toHaveLength(5);
    expect(op.breaks).toHaveLength(0);
  });

  it("goes up a stair: its run ends at the stair on one floor and starts there on the next", () => {
    const up = routes.find((r) => r.name === "upstairs")!;
    expect(up.legs.some((l) => l.floor === "ground")).toBe(true);
    expect(up.legs.some((l) => l.floor === "upper")).toBe(true);
    expect(up.floorChanges.map((f) => f.text)).toEqual(
      ["up the stair to upper", "up the stair from ground"]);
  });

  it("draws a step with no door dashed, carrying the engine's own message", () => {
    const s = routes.find((r) => r.name === "shortcut")!;
    expect(s.connected).toBe(false);
    expect(s.tag).toBe("M1");
    expect(s.legs.some((l) => l.broken)).toBe(true);
    expect(s.breaks.map((x) => x.message)).toEqual(["material flow `shortcut` goes through a wall"]);
  });

  it("an L between two points of a rectangle meets the exit wall square-on", () => {
    expect(lCorner([1, 1], [1, 4])).toEqual([]);
    expect(lCorner([1, 1], [4, 3], undefined, { orient: "v", at: 5, from: 0, to: 6 }))
      .toEqual([[1, 3]]);
    expect(lCorner([1, 1], [4, 3], undefined, { orient: "h", at: 5, from: 0, to: 6 }))
      .toEqual([[4, 1]]);
  });
});

describe("labels, numbers and the schedule (C103)", () => {
  it("fits a label in its room, else a shorter one, else the number", () => {
    expect(fitRoomLabel(20, 10, [["0.01 corridor", "D"], ["0.01"]], 1, 0.5).mode).toBe("full");
    const s = fitRoomLabel(3, 3, [["0.07 dispOutMAL", "+10 Pa"], ["0.07", "+10 Pa"], ["0.07"]], 1, 0.55);
    expect(s.mode).toBe("short");
    expect(s.lines).toEqual(["0.07", "+10 Pa"]);
    const t = fitRoomLabel(1.2, 0.8, [["0.07 dispOutMAL", "+10 Pa"], ["0.07"]], 1, 0.55);
    expect(t.mode).toBe("tag");
    expect(t.lines).toEqual(["0.07"]);
    //  A label never runs wider than its room while it fits at all.
    expect(s.font * 0.58 * 6).toBeLessThanOrEqual(0.9 * 3 + 1e-9);
  });

  it("numbers rooms by floor (lowest first), in published order", () => {
    const n = roomNumbers(b);
    expect(["lobby", "gowning", "corridor", "store", "plant"].map((x) => n.get(x)))
      .toEqual(["0.01", "0.02", "0.03", "0.04", "1.01"]);
  });

  it("the schedule has exactly one row per published room", () => {
    const rows = roomSchedule(b);
    expect(rows.map((r) => r.name)).toEqual(b.rooms.map((r) => r.name));
    const g = rows.find((r) => r.name === "gowning")!;
    expect([g.number, g.role, g.regime, g.pressureToOutside, g.height])
      .toEqual(["0.02", "gowning room", "cascade", 15, 5]);
    expect(rows.find((r) => r.name === "store")!.equipment).toBe("bin");
    const csv = scheduleCsv(rows).trim().split("\n");
    expect(csv).toHaveLength(b.rooms.length + 1);
  });

  it("the plan set: zoning, pressure, and a flow plan per kind declared", () => {
    expect(planSheetKinds(b)).toEqual(["zoning", "pressure", "personnel", "material"]);
  });

  it("a round scale bar, and wrapped notes", () => {
    expect(scaleBarLength(21)).toBe(20);
    expect(scaleBarLength(9.9)).toBe(5);
    expect(scaleBarLength(0.3)).toBeCloseTo(0.2);
    expect(wrapText("a bb ccc dddd", 6)).toEqual(["a bb", "ccc", "dddd"]);
  });
});

describe("the sheet (C103)", () => {
  const sheet = (kind: "zoning" | "pressure" | "personnel" | "material", floor = "ground") =>
    renderToStaticMarkup(createElement(MantineProvider, null,
      createElement(PlanSheetSvg, { building: b, floor, kind, items: [], caseName: "plant/probe" })));

  it("carries a scale bar, a north arrow, a title block and the door footnote", () => {
    const z = sheet("zoning");
    expect(z).toContain("data-scale-bar");
    expect(z).toContain("data-north-arrow");
    expect(z).toContain("plant/probe");
    expect(z).toContain("Zoning plan");
    expect(z).toContain("Door positions are NOT published");
    //  One label group per room of the floor, and none of the other floor's.
    expect(z.match(/data-room-label="/g)).toHaveLength(4);
    expect(z).not.toContain('data-room-label="plant"');
  });

  it("the pressure plan draws the published steps, the flow plan its key", () => {
    const p = sheet("pressure");
    expect(p).toContain("gowning -&gt; lobby: 10 Pa");
    const f = sheet("material");
    expect(f).toContain("NOT CONNECTED");
    expect(f).toContain('data-flow="shortcut"');
    expect(f).not.toContain('data-flow="operators"');
  });
});
