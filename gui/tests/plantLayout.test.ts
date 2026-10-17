/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*  The plant layout's scene (DEV.md 4c C75): the engine's `layout {}` block
    mapped onto a 3D scene description, with nothing computed but coordinate
    bookkeeping.  The fixture transcribes items of the witness
    `tutorials/plant/ammonia02_full_plant` (its converter, separator and
    let-down drum, a compressor, the control room) plus a sector area and a
    zone finding the witness does not carry. */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { layoutScene, toThree } from "../src/case/plantLayout.js";

const LAYOUT: PlantLayout = {
  items: [
    { id: "makeupComp", nonProcess: false, kind: "compressor", sector: "", shape: "box",
      orientation: "alongX", footprintFrom: "declared", x: 6, y: -8, z: 0, dx: 8, dy: 4, dz: 4,
      release: { source: "author-set", reason: "seals",
                 zones: [{ zone: 2, radius: 7.5, height: 6 }] } },
    { id: "converter", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 40, y: -6, z: 0,
      dx: 2.12843880117, dy: 2.12843880117, dz: 12.770632807 },
    { id: "separator", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 56, y: -6, z: 0,
      dx: 2.6447498572, dy: 2.6447498572, dz: 7.93424957161,
      release: { source: "author-set", reason: "drains",
                 zones: [{ zone: 0, radius: 1, height: 2 }, { zone: 1, radius: 3, height: 4 }] } },
    { id: "letdown", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 59.5, y: -6, z: 0,
      dx: 0.583390171821, dy: 0.583390171821, dz: 1.75017051546 },
    { id: "pumpHouse", nonProcess: true, kind: "building", sector: "", shape: "box",
      orientation: "alongY", footprintFrom: "declared", x: 58, y: -9, z: 0, dx: 2, dy: 3, dz: 3,
      ignition: "motors" },
  ],
  areas: [{ sector: "LOOP", xMin: 30, xMax: 70, yMin: -12, yMax: 10 }],
  separation: [{ source: "author-set", reason: "r", measure: "edgeToEdge",
                 rules: [{ a: "vessel", b: "vessel", distance: 4 }] }],
  wind: { from: 225, planNorth: 0, halfAngle: 30, reach: 60, source: "s", reason: "r" },
  findings: [
    { id: "separation:separator:letdown", kind: "separation", a: "separator", b: "letdown",
      value: 1.88592998549, limit: 4, message: "too close" },
    { id: "ignitionInZone:pumpHouse:separator#zone1", kind: "ignitionInZone",
      a: "pumpHouse", b: "separator#zone1", value: 1.2, limit: 3, message: "inside" },
    { id: "deadRule:pipeRack:pipeRack|vessel", kind: "deadRule", a: "pipeRack",
      b: "pipeRack|vessel", value: 0, limit: 5, message: "checks nothing" },
  ],
  unplaced: [], internal: [],
};

describe("layoutScene: the engine's layout, drawn and never recomputed", () => {
  it("absent or empty draws nothing at all -- no empty frame", () => {
    expect(layoutScene(undefined)).toBeNull();
    expect(layoutScene({ ...LAYOUT, items: [] })).toBeNull();
  });

  it("maps the plan (x, y, z-up) onto three.js with plan north into the screen", () => {
    expect(toThree(40, -6, 1)).toEqual([40, 1, 6]);
    const s = layoutScene(LAYOUT)!;
    const conv = s.solids.find((x) => x.id === "converter")!;
    //  centre at mid-height of the engine's own extent; nothing else.
    expect(conv.center[0]).toBe(40);
    expect(conv.center[1]).toBeCloseTo(12.770632807 / 2, 12);
    expect(conv.center[2]).toBe(6);
    expect(conv.size).toEqual([2.12843880117, 12.770632807, 2.12843880117]);
    expect(conv.shape).toBe("cylinder");
    expect(conv.axis).toBe("y");
  });

  it("a declared box keeps the engine's extents and its plan axis", () => {
    const s = layoutScene(LAYOUT)!;
    const comp = s.solids.find((x) => x.id === "makeupComp")!;
    expect(comp.shape).toBe("box");
    expect(comp.axis).toBe("x");
    expect(comp.size).toEqual([8, 4, 4]);
    expect(comp.label).toContain("declared box");
    const house = s.solids.find((x) => x.id === "pumpHouse")!;
    expect(house.axis).toBe("z");
    expect(house.nonProcess).toBe(true);
    expect(house.label).toContain("non-process");
  });

  it("flags exactly the items the engine named in a finding, in two channels", () => {
    const s = layoutScene(LAYOUT)!;
    const flagged = s.solids.filter((x) => x.flagged).map((x) => x.id).sort();
    //  separation names both vessels; the zone finding names the ignition
    //  source and the RELEASE item (its `b` carries `#zone1`); a dead rule
    //  names no placed item and flags nothing.
    expect(flagged).toEqual(["letdown", "pumpHouse", "separator"]);
    for (const x of s.solids.filter((y) => y.flagged)) expect(x.label).toContain("FINDING");
    expect(s.solids.find((x) => x.id === "converter")!.label).not.toContain("FINDING");
  });

  it("a separation shortfall is a link labelled with BOTH of the engine's distances", () => {
    const s = layoutScene(LAYOUT)!;
    expect(s.links).toHaveLength(1);
    expect(s.links[0]!.label).toBe("1.89 m < 4.00 m");
  });

  it("the three zones differ by opacity, edge style and the word -- not colour alone", () => {
    const s = layoutScene(LAYOUT)!;
    const byZone = new Map(s.zones.map((z) => [z.zone, z]));
    const z0 = byZone.get(0)!, z1 = byZone.get(1)!, z2 = byZone.get(2)!;
    expect(new Set([z0.edge, z1.edge, z2.edge]).size).toBe(3);
    expect(z0.opacity).toBeGreaterThan(z1.opacity);
    expect(z1.opacity).toBeGreaterThan(z2.opacity);
    expect(z1.label).toBe("zone 1 · separator");
    //  The envelope stands on the item's base: centre at half its height.
    expect(z1.center).toEqual([56, 2, 6]);
    expect(z1.radius).toBe(3);
  });

  it("an area keeps the engine's rectangle, plan y mirrored onto three.js z", () => {
    const s = layoutScene(LAYOUT)!;
    expect(s.areas[0]).toMatchObject({ x0: 30, x1: 70, z0: -10, z1: 12, label: "sector LOOP" });
  });

  it("the wind arrow points where the CASE's wind blows (from 225 deg -> toward the north-east)", () => {
    const s = layoutScene(LAYOUT)!;
    const w = s.wind!;
    const dx = w.head[0] - w.tail[0];
    const dz = w.head[2] - w.tail[2];
    expect(dx).toBeGreaterThan(0);        // east
    expect(dz).toBeLessThan(0);           // north is -z
    expect(Math.abs(Math.abs(dx) - Math.abs(dz))).toBeLessThan(1e-9);   // 45 degrees
    //  A declared plan north rotates it: with the plan's +y at true 45 deg,
    //  a wind from 225 (true) blows straight along the plan's +y.
    const r = layoutScene({ ...LAYOUT, wind: { ...LAYOUT.wind!, planNorth: 45 } })!.wind!;
    expect(Math.abs(r.head[0] - r.tail[0])).toBeLessThan(1e-9);
    expect(r.head[2] - r.tail[2]).toBeLessThan(0);
  });
});
