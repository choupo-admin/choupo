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
    bookkeeping.  The fixtures (tests/plantLayoutFixture.ts, shared with the
    export's test since C81) transcribe items and pipes of the witness
    `tutorials/plant/ammonia02_full_plant`. */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import { LAYOUT, PIPED, RACK } from "./plantLayoutFixture.js";
import {
  cameraFit, declutter, endName, layoutScene, particleSpeed, phaseOf, pointAlong,
  toThree, tubeRadius, type Vec3,
} from "../src/case/plantLayout.js";

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
    //  The LABEL is the id alone (legibility, 2026-10-17); what the item is
    //  and where its size came from is the hover tooltip.
    expect(comp.label).toBe("makeupComp");
    expect(comp.tooltip.join(" ")).toContain("declared box");
    const house = s.solids.find((x) => x.id === "pumpHouse")!;
    expect(house.axis).toBe("z");
    expect(house.nonProcess).toBe(true);
    expect(house.tooltip.join(" ")).toContain("non-process");
    expect(house.tooltip.join(" ")).toContain("ignition source: motors");
  });

  it("flags exactly the items the engine named in a finding, in two channels", () => {
    const s = layoutScene(LAYOUT)!;
    const flagged = s.solids.filter((x) => x.flagged).map((x) => x.id).sort();
    //  separation names both vessels; the zone finding names the ignition
    //  source and the RELEASE item (its `b` carries `#zone1`); a dead rule
    //  names no placed item and flags nothing.
    expect(flagged).toEqual(["letdown", "pumpHouse", "separator"]);
    //  The glyph is the word channel on the label; the engine's own message
    //  is in the tooltip.
    for (const x of s.solids.filter((y) => y.flagged)) {
      expect(x.label).toBe(`⚠ ${x.id}`);
      expect(x.tooltip.some((t) => t.startsWith("FINDING: "))).toBe(true);
    }
    const sep = s.solids.find((x) => x.id === "separator")!;
    expect(sep.tooltip).toContain("FINDING: too close");
    expect(sep.tooltip).toContain("FINDING: inside");
    const conv = s.solids.find((x) => x.id === "converter")!;
    expect(conv.label).toBe("converter");
    expect(conv.tooltip.join(" ")).not.toContain("FINDING");
  });

  it("a separation shortfall is a link tagged short, with BOTH of the engine's distances", () => {
    const s = layoutScene(LAYOUT)!;
    expect(s.links).toHaveLength(1);
    expect(s.links[0]!.label).toBe("1.89 m < 4.00 m declared");
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


describe("the pipes: drawn as the engine routed them, never re-routed", () => {
  it("phaseOf reads the published vapour fraction, three words and a fourth for none", () => {
    expect(phaseOf(0)).toBe("liquid");
    expect(phaseOf(1e-9)).toBe("liquid");
    expect(phaseOf(1)).toBe("vapour");
    expect(phaseOf(0.999999999)).toBe("vapour");
    expect(phaseOf(0.5)).toBe("twoPhase");
    expect(phaseOf(0.01)).toBe("twoPhase");
    expect(phaseOf(undefined)).toBe("unknown");
    expect(phaseOf(NaN)).toBe("unknown");
  });

  it("particle speed and tube radius are monotone in the published mass flow", () => {
    const flows = [0, 0.01, 0.1, 1, 10, 100, 2500];
    for (let i = 1; i < flows.length; i++) {
      expect(particleSpeed(flows[i]!)).toBeGreaterThan(particleSpeed(flows[i - 1]!));
      expect(tubeRadius(flows[i]!)).toBeGreaterThan(tubeRadius(flows[i - 1]!));
    }
    //  The stated rule, at a stated point: 1.2 + 2.4 log10(1 + 9) = 3.6.
    expect(particleSpeed(9)).toBeCloseTo(3.6, 12);
    //  No flow published (or a nonsense one): the slowest speed, never NaN.
    expect(particleSpeed(null)).toBe(1.2);
    expect(particleSpeed(-5)).toBe(1.2);
  });

  it("maps each published route to three.js, in the direction of flow, length carried", () => {
    const s = layoutScene(PIPED)!;
    expect(s.pipes.map((p) => p.stream))
      .toEqual(["rawLiquid", "letdownGas", "unreactedGas", "flashing"]);
    const raw = s.pipes[0]!;
    expect(raw.points[0]).toEqual(toThree(56, -6, 7.93424957161));     // the source end first
    expect(raw.points[raw.points.length - 1]).toEqual(toThree(59.5, -6, 1.75017051546));
    expect(raw.length).toBe(17.1983647704);                            // the engine's, carried
    expect(raw.phase).toBe("liquid");
    expect(s.pipes[1]!.phase).toBe("vapour");
    expect(s.pipes[3]!.phase).toBe("twoPhase");
    expect(s.pipes[3]!.massFlow).toBeNull();
    expect(raw.speed).toBe(particleSpeed(16.9841172009));
    //  The tooltip carries the ends, the phase, the state and the length.
    expect(raw.tooltip).toContain("separator → letdown");
    expect(s.pipes[1]!.tooltip).toContain("letdown → battery limit (outlet)");
    expect(s.pipes[2]!.tooltip).toContain("separator → purgeSplit (junction)");
    expect(raw.tooltip.join(" ")).toContain("length 17.2 m (routed on the rack)");
    expect(s.pipes[3]!.tooltip.join(" ")).toContain("declared waypoints");
  });

  it("draws the rack and the junctions from the published block, nothing invented", () => {
    const s = layoutScene(PIPED)!;
    expect(s.junctions).toEqual([{ unit: "purgeSplit", at: toThree(37, -3.14285714286, 6),
                                   label: "purgeSplit (splitter)" }]);
    const r = s.rack!;
    expect(r.x0).toBe(-3);
    expect(r.x1).toBe(67);
    expect(r.zc).toBeCloseTo(3.14285714286, 12);
    expect(r.halfWidth).toBeCloseTo(1.8, 12);
    //  Lanes 10..12 at 6 per tier occupy tiers 0, 1 and 2.
    expect(r.tiers).toEqual([6, 7.5, 9]);
    expect(r.portals[0]).toBe(-3);
    expect(r.portals[r.portals.length - 1]).toBe(67);
    expect(r.label).toContain("engine default");
    expect(layoutScene({ ...PIPED, pipeRack: { ...RACK, declared: true } })!.rack!.label)
      .toBe("pipe rack");
  });

  it("a layout published before C80 draws no pipe, no rack, no junction", () => {
    const s = layoutScene(LAYOUT)!;
    expect(s.pipes).toEqual([]);
    expect(s.rack).toBeNull();
    expect(s.junctions).toEqual([]);
  });

  it("endName says which kind of end it is", () => {
    expect(endName("item", "FEHE")).toBe("FEHE");
    expect(endName("junction", "mixer")).toBe("mixer (junction)");
    expect(endName("batteryLimit", "inlet")).toBe("battery limit (inlet)");
  });

  it("pointAlong walks the polyline and wraps at its end", () => {
    const pts: Vec3[] = [[0, 0, 0], [0, 2, 0], [3, 2, 0]];
    expect(pointAlong(pts, 0)).toEqual([0, 0, 0]);
    expect(pointAlong(pts, 1)).toEqual([0, 1, 0]);
    expect(pointAlong(pts, 3.5)).toEqual([1.5, 2, 0]);
    expect(pointAlong(pts, 5)).toEqual([0, 0, 0]);         // the whole length wraps to the source
    expect(pointAlong(pts, 6)).toEqual([0, 1, 0]);         // 6 mod 5 = 1
    expect(pointAlong(pts, -1)).toEqual([2, 2, 0]);        // -1 wraps to 4
  });

  it("the adapter keeps a well-formed pipe and drops one with a non-finite point", () => {
    const layout = {
      ...PIPED,
      pipes: [PIPED.pipes![0], { ...PIPED.pipes![1], route: [[59.5, -6, null], [67, 0, 7.5]] }],
    };
    const log = `${BEGIN_MARK}\n${JSON.stringify({ streams: {}, layout })}\n${END_MARK}\n`;
    const out = extractStructured(log, { thermoPackage: {}, controlDict: {} });
    expect(out.layout!.pipes!.map((p) => p.stream)).toEqual(["rawLiquid"]);
    expect(out.layout!.pipeRack!.xEnd).toBe(67);
    expect(out.layout!.junctions![0]!.unit).toBe("purgeSplit");
    expect(out.layout!.notRouted).toEqual(PIPED.notRouted);
  });
});

describe("legibility: labels decluttered, the camera fitted (pure)", () => {
  it("declutter keeps the higher priority where two labels collide, input order on a tie", () => {
    const keep = declutter([
      { key: "item", priority: 2, x: 100, y: 100, w: 60, h: 16 },
      { key: "finding", priority: 3, x: 110, y: 104, w: 80, h: 16 },
      { key: "zone", priority: 0, x: 300, y: 100, w: 60, h: 16 },
      { key: "other", priority: 1, x: 320, y: 100, w: 60, h: 16 },
      { key: "far", priority: 2, x: 600, y: 400, w: 60, h: 16 },
      { key: "tieA", priority: 2, x: 800, y: 50, w: 40, h: 16 },
      { key: "tieB", priority: 2, x: 810, y: 52, w: 40, h: 16 },
    ]);
    expect([...keep].sort()).toEqual(["far", "finding", "other", "tieA"]);
  });

  it("declutter pads the boxes, and skips a label with no size or no position", () => {
    //  1 px apart, padded by 2 on each side: a collision.
    expect(declutter([
      { key: "a", priority: 1, x: 0, y: 0, w: 10, h: 10 },
      { key: "b", priority: 1, x: 11, y: 0, w: 10, h: 10 },
    ]).size).toBe(1);
    expect(declutter([
      { key: "a", priority: 1, x: 0, y: 0, w: 10, h: 10 },
      { key: "b", priority: 1, x: 11, y: 0, w: 10, h: 10 },
    ], 0).size).toBe(2);
    expect(declutter([{ key: "z", priority: 1, x: NaN, y: 0, w: 10, h: 10 },
                      { key: "w", priority: 1, x: 0, y: 0, w: 0, h: 10 }]).size).toBe(0);
  });

  it("the scene's fit box is the plant -- process items and pipes -- not a far building", () => {
    const far: PlantLayout = { ...PIPED, items: [...PIPED.items,
      { id: "controlRoom", nonProcess: true, kind: "building", sector: "", shape: "box",
        orientation: "alongX", footprintFrom: "declared", x: -300, y: -400, z: 0,
        dx: 15, dy: 10, dz: 4 }] };
    const s = layoutScene(far)!;
    expect(s.fitMin[0]).toBeGreaterThan(0);             // the room at x = -300 is not in it
    expect(s.min[0]).toBeLessThan(-300);                // ... but the grid still reaches it
    expect(s.fitMax[0]).toBe(67);                        // the letdownGas pipe's battery limit
  });

  it("cameraFit frames the box: every corner inside the view, the margin respected", () => {
    const min: Vec3 = [0, 0, -20], max: Vec3 = [60, 12, 10];
    const fov = 45, aspect = 1.6;
    for (const view of ["3d", "plan", "elevation"] as const) {
      const { position, target } = cameraFit(min, max, view, fov, aspect);
      expect(target).toEqual([30, 6, -5]);
      //  Project each corner onto the camera's frame (looking at target).
      const f = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
      const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
      const fw = f.map((v) => v / fl);
      const upW = [0, 1, 0];
      let right = [fw[1]! * upW[2]! - fw[2]! * upW[1]!, fw[2]! * upW[0]! - fw[0]! * upW[2]!,
                   fw[0]! * upW[1]! - fw[1]! * upW[0]!];
      const rl = Math.hypot(right[0]!, right[1]!, right[2]!);
      right = right.map((v) => v / rl);
      const up = [right[1]! * fw[2]! - right[2]! * fw[1]!, right[2]! * fw[0]! - right[0]! * fw[2]!,
                  right[0]! * fw[1]! - right[1]! * fw[0]!];
      const tv = Math.tan((fov * Math.PI) / 360), th = tv * aspect;
      let worst = 0;
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
        const d = [x - position[0], y - position[1], z - position[2]];
        const depth = d[0]! * fw[0]! + d[1]! * fw[1]! + d[2]! * fw[2]!;
        expect(depth).toBeGreaterThan(0);
        const sx = Math.abs(d[0]! * right[0]! + d[1]! * right[1]! + d[2]! * right[2]!) / (depth * th);
        const sy = Math.abs(d[0]! * up[0]! + d[1]! * up[1]! + d[2]! * up[2]!) / (depth * tv);
        worst = Math.max(worst, sx, sy);
      }
      expect(worst, view).toBeLessThanOrEqual(1);       // nothing cut off
      expect(worst, view).toBeGreaterThan(0.3);         // and not lost in empty ground
    }
  });

  it("plan looks straight down with plan north up; elevation looks north from the south", () => {
    const min: Vec3 = [0, 0, -20], max: Vec3 = [60, 12, 10];
    const p = cameraFit(min, max, "plan", 45, 1.6);
    expect(p.position[0]).toBe(30);
    expect(p.position[1]).toBeGreaterThan(12);
    expect(p.position[2] - p.target[2]).toBeGreaterThan(0);              // a hair south ...
    expect((p.position[2] - p.target[2]) / (p.position[1] - p.target[1])).toBeLessThan(0.01);
    const e = cameraFit(min, max, "elevation", 45, 1.6);
    expect(e.position[0]).toBe(30);
    expect(e.position[1]).toBe(6);
    expect(e.position[2]).toBeGreaterThan(10);                            // south of the plant
  });
});
