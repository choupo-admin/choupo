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

//  THE GMP INTERIOR's mapping (DEV.md 4c C97 phase B): the published block
//  shaped, drawn as a cutaway scene and as per-floor plans, computing no
//  verdict.  The fixture is a transcription of four rooms of the
//  check_gmp_layout clean probe, as the engine wrote them, plus one finding.

import { describe, expect, it } from "vitest";

import { shapeBuilding } from "../src/adapters/buildingPayload.js";
import {
  buildingScene, floorPlans, FLOW_LOOK, GRADE_LOOK, OUTSIDE_STUB, roomLabel, stepPoint,
  withBuilding,
} from "../src/case/gmpBuilding.js";
import { layoutScene } from "../src/case/plantLayout.js";
import { PIPED } from "./plantLayoutFixture.js";

const room = (name: string, o: Record<string, unknown>) => ({
  id: `room:${name}`, name, floor: "ground", role: "room", grade: "D", regime: "",
  containment: false, z: 0, height: 6, relativeTo: "outside", equipment: [], ...o,
});

const RAW = {
  summary: { id: "buildingSummary", name: "probe OSD block", floors: 2, rooms: 4,
             connections: 4, flows: 2, findings: 1, floorArea: 266, occupancy: 2,
             minimumStep: 10, source: "probe", reason: "probe", stepSource: "Annex 1",
             stepReason: "x" },
  floors: [{ id: "floor:ground", name: "ground", elevation: 0, height: 6 },
           { id: "floor:upper", name: "upper", elevation: 7, height: 4 }],
  rooms: [
    room("lobby", { grade: "CNC", xMin: 10, xMax: 16, yMin: 0, yMax: 6, area: 36,
                    pressure: 5, pressureToOutside: 5 }),
    room("gowning", { role: "gowning", regime: "cascade", xMin: 16, xMax: 20, yMin: 0,
                      yMax: 6, area: 24, pressure: 10, relativeTo: "lobby",
                      pressureToOutside: 15 }),
    room("corridor", { xMin: 8, xMax: 64, yMin: 6, yMax: 10, area: 224, pressure: 25,
                       pressureToOutside: 25 }),
    room("electrical", { floor: "upper", grade: "CNC", z: 7, height: 4, xMin: 10, xMax: 16,
                         yMin: 0, yMax: 6, area: 36, pressure: 0, pressureToOutside: 0,
                         ignition: "switchgear" }),
    { id: "room:broken", name: "broken", grade: "D", xMin: 0 },   // not finite: dropped
  ],
  connections: [
    { id: "door:lobby:outside", a: "lobby", b: "outside", type: "door", dP: 5 },
    { id: "door:lobby:gowning", a: "lobby", b: "gowning", type: "door", dP: -10 },
    { id: "door:gowning:corridor", a: "gowning", b: "corridor", type: "door", dP: -10 },
    { id: "stair:lobby:electrical", a: "lobby", b: "electrical", type: "stair", dP: 5 },
  ],
  flows: [
    { id: "flow:operators", name: "operators", kind: "personnel", steps: 3, connected: true,
      path: ["outside", "lobby", "gowning", "corridor"], reason: "in" },
    { id: "flow:upstairs", name: "upstairs", kind: "waste", steps: 1, connected: true,
      path: ["lobby", "electrical"], reason: "" },
  ],
  shared: [],
  findings: [{ id: "cascade:gowning:lobby", kind: "cascade", a: "gowning", b: "lobby",
               value: 5, limit: 10, message: "the step is short" }],
};

describe("the GMP interior (C97 phase B)", () => {
  const b = shapeBuilding(RAW)!;

  it("shapes the published block, dropping a room that is not finite", () => {
    expect(b.rooms.map((r) => r.name)).toEqual(["lobby", "gowning", "corridor", "electrical"]);
    expect(b.minimumStep).toBe(10);
    expect(b.connections).toHaveLength(4);
    expect(b.rooms[3]!.ignition).toBe("switchgear");
    expect(shapeBuilding({ rooms: [] })).toBeUndefined();
  });

  it("draws each room at its box, tinted by grade, labelled with its pressure", () => {
    const s = buildingScene(b);
    const g = s.rooms.find((r) => r.name === "gowning")!;
    //  Plan (16..20, 0..6, z 0..6) -> three.js centre (18, 3, -3), size (4, 6, 6).
    expect(g.center).toEqual([18, 3, -3]);
    expect(g.size).toEqual([4, 6, 6]);
    expect(g.colour).toBe(GRADE_LOOK.D.colour);
    expect(g.airlock).toBe(true);
    //  Flagged because the engine's finding names it -- not computed here.
    expect(g.flagged).toBe(true);
    expect(g.label).toBe("⚠ gowning · D · gowning room (cascade) · +15 Pa");
    expect(g.tooltip).toContain("⚠ the step is short");
    expect(s.rooms.find((r) => r.name === "corridor")!.flagged).toBe(false);
    expect(roomLabel(b.rooms[0]!, false)).toBe("lobby · CNC · +5 Pa");
  });

  it("runs a flow through the middle of the shared wall, lifted by kind", () => {
    const s = buildingScene(b);
    const f = s.flows.find((x) => x.name === "operators")!;
    const lift = FLOW_LOOK.personnel.lift;
    //  outside -> stub beyond the lobby's nearest envelope side (south, y 0).
    expect(f.points[0]).toEqual([13, lift, OUTSIDE_STUB]);
    //  lobby centre, then the lobby|gowning wall (x 16, y 0..6) at its middle.
    expect(f.points[1]).toEqual([13, lift, -3]);
    expect(f.points[2]).toEqual([16, lift, -3]);
    expect(stepPoint(b.rooms[1]!, b.rooms[2]!)).toEqual([18, 6]);
    //  A stair rises in the plan overlap of the two rooms.
    const w = s.flows.find((x) => x.name === "upstairs")!;
    expect(w.dashed).toBe(true);
    expect(w.points.map((p) => p[1])).toEqual(
      [0, 0, 7, 7].map((z) => z + FLOW_LOOK.waste.lift));
  });

  it("grows the plant scene's fit box to hold the building, nothing else", () => {
    const plant = layoutScene(PIPED)!;
    const s = withBuilding(plant, buildingScene(b));
    expect(s.fitMin[0]).toBeLessThanOrEqual(8);
    expect(s.fitMax[0]).toBeGreaterThanOrEqual(64);
    expect(s.fitMax[1]).toBeGreaterThanOrEqual(11);
    expect(s.solids).toBe(plant.solids);
  });

  it("draws the item the case names as the building's envelope as glass, and only it", () => {
    //  C97 wiring: `envelope <id>;` names the plot plan's non-process item
    //  that IS the building -- opaque, it would hide every room.
    const shell = { id: "osdBlock", nonProcess: true, kind: "productionBuilding", sector: "",
      shape: "box" as const, orientation: "alongX" as const, footprintFrom: "declared" as const,
      x: 36, y: 5, z: 0, dx: 60, dy: 12, dz: 11 };
    const plant = layoutScene({ ...PIPED, items: [...PIPED.items, shell] })!;
    const shaped = shapeBuilding({ ...RAW, summary: { ...RAW.summary, envelope: "osdBlock" } })!;
    expect(shaped.envelope).toBe("osdBlock");
    //  The exported page embeds the SHAPED block and shapes it again: the
    //  summary fields must survive that round trip.
    const again = shapeBuilding(JSON.parse(JSON.stringify(shaped)))!;
    expect([again.envelope, again.name, again.minimumStep])
      .toEqual(["osdBlock", "probe OSD block", 10]);
    const s = withBuilding(plant, buildingScene(shaped));
    const glass = s.solids.filter((x) => x.shell);
    expect(glass.map((x) => x.id)).toEqual(["osdBlock"]);
    expect(glass[0]!.tooltip.join(" ")).toContain("drawn as glass");
    //  No envelope declared: nothing is turned to glass.
    expect(withBuilding(plant, buildingScene(b)).solids.some((x) => x.shell)).toBe(false);
    //  A PROCESS item of that name is never the shell.
    const proc = layoutScene({ ...PIPED, items: [...PIPED.items, { ...shell, nonProcess: false }] })!;
    expect(withBuilding(proc, buildingScene(shaped)).solids.some((x) => x.shell)).toBe(false);
  });

  it("draws one plan per floor, each with only its own rooms and flow runs", () => {
    const plans = floorPlans(b);
    expect(plans.map((p) => p.floor)).toEqual(["ground", "upper"]);
    expect(plans[0]!.rooms.map((r) => r.name)).toEqual(["lobby", "gowning", "corridor"]);
    expect(plans[1]!.rooms.map((r) => r.name)).toEqual(["electrical"]);
    //  North up: the corridor (y 6..10) is drawn ABOVE the lobby (y 0..6).
    const lobby = plans[0]!.rooms[0]!, corr = plans[0]!.rooms[2]!;
    expect(corr.y).toBeLessThan(lobby.y);
    expect(plans[0]!.flows.some((f) => f.name === "operators")).toBe(true);
    //  The stair splits the waste run: its ground part is drawn on the ground plan.
    expect(plans[0]!.flows.some((f) => f.name === "upstairs")).toBe(true);
    expect(lobby.lines[1]).toBe("CNC +5 Pa");
  });
});
