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

/*  THE SITE LOGISTICS IN THE 3D VIEW (DEV.md 4c C96): the trucks, the car
    park, the approaches and the new site kinds, as the scene carries them.
    The block below is TRANSCRIBED from the engine's run of
    `tutorials/plant/ammonia02_full_plant` (its roads, its truck route and
    corners, its car park, its fence openings); the scene must carry the
    engine's numbers unmeasured and work out only what is drawing:
      * the route's path, its corners rounded to the PUBLISHED radius and
        tangent to both legs; the fillet inside a corner, whose area is the
        square of the kerb radius less its quarter disc; arrows along it;
      * a one-way road says so; the approach runs from the road's end to the
        opening the engine published;
      * every bay the engine published is drawn, with the direction a car
        leaves it by; a windsock's sock points where the declared wind goes;
      * the new site words each have a drawing whose body fills the declared
        box exactly, decoration apart;
      * the road table quotes the route and the car park in the engine's
        words. */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { boundsOf, equipmentDrawing, SITE_MODELS, type Part } from "../src/case/equipmentModel.js";
import { roadSummary } from "../src/case/layoutTables.js";
import { filletPolygon, layoutScene, roundedPath } from "../src/case/plantLayout.js";

const road = (name: string, width: number, cl: [number, number][], r: number, oneWay: boolean) => ({
  road: name, width, length: cl.slice(1).reduce((s, q, i) =>
    s + Math.abs(q[0] - cl[i]![0]) + Math.abs(q[1] - cl[i]![1]), 0),
  component: 0, fromEntrance: true, reason: "transcribed", centreline: cl,
  cornerRadius: r, cornerRadiusDeclared: true, oneWay,
});

const SITE: PlantLayout = {
  items: [
    { id: "gate", nonProcess: true, kind: "gate", sector: "", shape: "box", orientation: "alongX",
      footprintFrom: "declared", x: -19, y: -78, z: 0, dx: 4, dy: 3, dz: 3 },
    { id: "carPark", nonProcess: true, kind: "carPark", sector: "", shape: "box",
      orientation: "alongX", footprintFrom: "declared", x: 11.5, y: -70.5, z: 0, dx: 40, dy: 16,
      dz: 0.2 },
    { id: "windsock", nonProcess: true, kind: "windsock", sector: "", shape: "box",
      orientation: "alongX", footprintFrom: "declared", x: -20, y: -25, z: 0, dx: 1, dy: 1, dz: 10 },
  ],
  areas: [], separation: [], findings: [], unplaced: [], internal: [],
  wind: { from: 225, planNorth: 0, halfAngle: 30, reach: 60, source: "author-set", reason: "x" },
  roadNetwork: { headroom: 5, accessDistance: 20, noTraffic: [1], entrances: ["gate"], roads: 4,
    components: 1, length: 242, pavedArea: 0, source: "s", reason: "r", accessSource: "s",
    accessReason: "r" },
  roads: [
    road("entrance", 7, [[-12, -76], [-12, -31]], 10, false),
    road("main", 6, [[-36, -31], [68, -31]], 10, false),
    road("yard", 7, [[60, -52], [-12, -52]], 10, true),
    road("yardLink", 7, [[60, -31], [60, -52]], 10, true),
  ],
  fenceOpenings: [
    { gate: "gate", side: "south", x: -12, y: -87, width: 7, road: "entrance", gateDistance: 7.5,
      approachX: -12, approachY: -76, approach: 11 },
  ],
  designVehicle: { turningDiameter: 25, source: "Council Directive 96/53/EC, Annex I point 1.5",
                   reason: "r" },
  truckRoutes: [
    { route: "deliveries", from: "gate", to: "gate", verdict: "clear", length: 256, turns: 4,
      reversals: 0, weighbridge: "weighbridge", reason: "r",
      roads: ["entrance", "main", "yardLink", "yard", "entrance"], serves: ["warehouse", "laydown"],
      path: [[-12, -87], [-12, -76], [-12, -31], [60, -31], [60, -52], [-12, -52], [-12, -76],
             [-12, -87]] },
  ],
  routeCorners: [
    { route: "deliveries", turn: "right", inRoad: "entrance", outRoad: "main", x: -12, y: -31,
      radius: 10, outerRadius: 13, required: 12.5, turningArea: "", ok: true },
    { route: "deliveries", turn: "right", inRoad: "main", outRoad: "yardLink", x: 60, y: -31,
      radius: 10, outerRadius: 13, required: 12.5, turningArea: "", ok: true },
    { route: "deliveries", turn: "right", inRoad: "yardLink", outRoad: "yard", x: 60, y: -52,
      radius: 10, outerRadius: 13.5, required: 12.5, turningArea: "", ok: true },
    { route: "deliveries", turn: "left", inRoad: "yard", outRoad: "entrance", x: -12, y: -52,
      radius: 10, outerRadius: 13.5, required: 12.5, turningArea: "", ok: true },
  ],
  carParks: [
    { item: "carPark", bays: 22, capacity: 22, rows: 2, perRow: 11, bayWidth: 2.5, bayLength: 5,
      aisle: 6, angle: 90, arrangement: "doubleLoaded", entry: "reverse", exitsForward: true,
      depth: 5, pitch: 2.5, usableLength: 28, area: 640, source: "s", reason: "r",
      stalls: [
        ...Array.from({ length: 11 }, (_, k) => [-1.25 + 2.5 * k, -76, 0, 1] as [number, number, number, number]),
        ...Array.from({ length: 11 }, (_, k) => [-1.25 + 2.5 * k, -65, 0, -1] as [number, number, number, number]),
      ] },
  ],
};

describe("the truck route is the engine's, its corners rounded only in the drawing", () => {
  const scene = layoutScene(SITE)!;
  const t = scene.truckRoutes[0]!;
  it("carries the engine's length and verdict, unmeasured", () => {
    expect(t.length).toBe(256);
    expect(t.verdict).toBe("clear");
    expect(t.tooltip.join(" ")).toMatch(/256 m \(the engine's length\)/);
    expect(t.tooltip.join(" ")).toMatch(/outer edge 13.00 m against 12.50 m/);
  });
  it("rounds each corner to its published radius, tangent to both legs", () => {
    const plan = roundedPath(SITE.truckRoutes![0]!.path, (x, y) =>
      SITE.routeCorners!.find((c) => c.x === x && c.y === y)?.radius ?? 0);
    //  The corner (-12, -31): the arc starts 10 m before it on the incoming
    //  leg and ends 10 m after it on the outgoing one.
    const near = (p: [number, number], q: [number, number]) =>
      Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
    expect(plan.some((p) => near(p, [-12, -41]))).toBe(true);
    expect(plan.some((p) => near(p, [-2, -31]))).toBe(true);
    //  ... and every arc point lies 10 m from its centre (-2, -41).
    const arc = plan.filter((p) => p[0] > -12 + 1e-9 && p[0] < -2 - 1e-9 && p[1] > -41 && p[1] < -31);
    expect(arc.length).toBeGreaterThan(0);
    for (const p of arc) expect(Math.hypot(p[0] + 2, p[1] + 41)).toBeCloseTo(10, 9);
    //  The vertex itself is gone: the drawn path cuts the corner.
    expect(plan.some((p) => near(p, [-12, -31]))).toBe(false);
  });
  it("paves a fillet inside each corner: the kerb square less its quarter disc", () => {
    expect(t.fillets).toHaveLength(4);
    const poly = filletPolygon(-12, -31, [0, 1], [1, 0], 7, 6, 10, 400);
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
      a += p[0] * q[1] - q[0] * p[1];
    }
    const s = 10 - 6 / 2;
    expect(Math.abs(a) / 2).toBeCloseTo(s * s - (Math.PI * s * s) / 4, 3);
    //  It lies on the INSIDE of the turn: a right turn from north to east,
    //  so south-east of the corner, beyond both roads' inner edges.
    for (const [x, y] of poly) {
      expect(x).toBeGreaterThanOrEqual(-12 + 3.5 - 1e-9);
      expect(y).toBeLessThanOrEqual(-31 - 3 + 1e-9);
    }
    expect(filletPolygon(0, 0, [0, 1], [1, 0], 7, 7, 3)).toEqual([]);
  });
  it("puts direction arrows along it", () => {
    expect(t.arrows.length).toBeGreaterThan(10);
    for (const a of t.arrows) expect(Math.hypot(...a.dir)).toBeCloseTo(1, 9);
  });
});

describe("the roads, the approach, the car park and the windsock", () => {
  const scene = layoutScene(SITE)!;
  it("a one-way road says so; a two-way one does not", () => {
    const by = new Map(scene.roads.map((r) => [r.road, r]));
    expect(by.get("yard")!.oneWay).toBe(true);
    expect(by.get("entrance")!.oneWay).toBe(false);
    expect(by.get("yard")!.tooltip.join(" ")).toMatch(/ONE-WAY/);
  });
  it("the approach runs from the road's end to the opening the engine published", () => {
    expect(scene.approaches).toHaveLength(1);
    expect(scene.approaches[0]!.from).toEqual([-12, 0, 76]);
    expect(scene.approaches[0]!.to).toEqual([-12, 0, 87]);
    expect(scene.approaches[0]!.width).toBe(7);
  });
  it("every bay the engine published is drawn, leaving toward its aisle", () => {
    const c = scene.carParks[0]!;
    expect(c.bays).toHaveLength(22);
    expect(c.exitsForward).toBe(true);
    //  plan +y is three.js -Z: a bay leaving north points along -Z.
    expect(c.bays[0]!.dir).toEqual([0, -1]);
    expect(c.bays[11]!.dir).toEqual([0, 1]);
    expect(c.tooltip.join(" ")).toMatch(/22 bays declared, 22 fit/);
  });
  it("a windsock's sock points where the declared wind goes (from 225: toward the north-east)", () => {
    const w = scene.windsocks[0]!;
    expect(w.top).toEqual([-20, 10, 25]);
    expect(w.dir[0]).toBeCloseTo(Math.SQRT1_2, 9);    // east
    expect(w.dir[1]).toBeCloseTo(-Math.SQRT1_2, 9);   // north is -Z
  });
  it("the road table quotes the route, the vehicle and the car park in the engine's numbers", () => {
    const v = roadSummary(SITE)!;
    const notes = v.notes.join(" ");
    expect(notes).toMatch(/Design vehicle: a 25\.0 m turning circle/);
    expect(notes).toMatch(/Truck route deliveries: gate -> gate by entrance, main, yardLink, yard,/);
    expect(notes).toMatch(/256\.0 m, 4 turns \(outer edge 13\.0, 13\.0, 13\.5, 13\.5 m against 12\.5 m\)/);
    expect(notes).toMatch(/-- clear\./);
    expect(notes).toMatch(/Car park carPark: 22 bays declared, 22 fit .* cars leave nose first/);
    expect(v.rows.find((r) => r.road === "yard")!.reached).toBe("yes; one-way");
  });
});

describe("the site words of C96 are drawn by kind, the body filling the declared box", () => {
  const solid = (kind: string, dx: number, dh: number, dz: number) => ({
    kind, shape: "box" as const, axis: "y" as const, size: [dx, dh, dz] as [number, number, number],
    center: [0, dh / 2, 0] as [number, number, number], nonProcess: true });
  const body = (ps: Part[]) => ps.filter((p) => !p.decoration);
  const cases: [string, number, number, number][] = [
    ["office", 20, 8, 10], ["carPark", 40, 0.2, 16], ["laydown", 40, 0.3, 11],
    ["musterPoint", 6, 0.1, 4], ["fireWaterTank", 12, 10, 12], ["firePumpHouse", 8, 4, 6],
    ["windsock", 1, 10, 1],
  ];
  for (const [kind, dx, dh, dz] of cases)
    it(`${kind}: its own drawing, its body the declared box`, () => {
      expect(SITE_MODELS[kind]).toBeDefined();
      const d = equipmentDrawing(solid(kind, dx, dh, dz));
      expect(d.model).toBe(kind);
      const [lo, hi] = boundsOf(body(d.parts));
      expect(lo[0]).toBeCloseTo(-dx / 2, 9); expect(hi[0]).toBeCloseTo(dx / 2, 9);
      expect(lo[1]).toBeCloseTo(-dh / 2, 9); expect(hi[1]).toBeCloseTo(dh / 2, 9);
      expect(lo[2]).toBeCloseTo(-dz / 2, 9); expect(hi[2]).toBeCloseTo(dz / 2, 9);
    });
  it("an office of 8 m carries a window band per 3.5 m storey (two)", () => {
    expect(equipmentDrawing(solid("office", 20, 8, 10)).describes).toMatch(/2 storey/);
  });
});
