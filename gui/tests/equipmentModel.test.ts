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

/*  THE PLANT LAYOUT DRAWN BY KIND (DEV.md 4c C88).  case/equipmentModel.ts
    says what an item looks like; held here, without WebGL:
      * the dispatch is keyed on words the engine's sizers actually stamp
        (read from src/postProcessing/sizing, so a renamed sizer word fails
        here rather than silently falling back to the plain drawing);
      * the BODY of every drawing fills the engine's envelope EXACTLY (a
        published cylinder) or stands inside the declared box -- decoration
        never stands in for the envelope;
      * a kind with no entry, and a non-process item, keep the plain drawing;
      * ladders and platforms appear by HEIGHT, never by name;
      * no part carries a non-finite or non-positive dimension. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCESS_FROM, boundsOf, EQUIPMENT_MODELS, equipmentDrawing, type Part,
} from "../src/case/equipmentModel.js";
import {
  defaultQuality, layoutScene, type SceneSolid, type Vec3,
} from "../src/case/plantLayout.js";
import { LAYOUT } from "./plantLayoutFixture.js";
import { REPO } from "./witnessOutputs.js";

type Solid = Pick<SceneSolid, "kind" | "shape" | "axis" | "size" | "center" | "nonProcess">;

/** A standing cylinder of diameter D and height H on the grade. */
const standing = (kind: string, D: number, H: number): Solid =>
  ({ kind, shape: "cylinder", axis: "y", size: [D, H, D], center: [0, H / 2, 0], nonProcess: false });
/** A lying cylinder along three.js X. */
const lying = (kind: string, D: number, L: number): Solid =>
  ({ kind, shape: "cylinder", axis: "x", size: [L, D, D], center: [0, D / 2, 0], nonProcess: false });
/** A declared box. */
const declared = (kind: string, dx: number, dh: number, dz: number, nonProcess = false): Solid =>
  ({ kind, shape: "box", axis: "x", size: [dx, dh, dz], center: [0, dh / 2, 0], nonProcess });

const envelope = (s: Solid): [Vec3, Vec3] =>
  [[-s.size[0] / 2, -s.size[1] / 2, -s.size[2] / 2], [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]];
const body = (parts: Part[]) => parts.filter((p) => !p.decoration);
const close = (a: Vec3, b: Vec3) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k]!, 9));
const within = ([lo, hi]: [Vec3, Vec3], [elo, ehi]: [Vec3, Vec3]) => {
  for (let k = 0; k < 3; k++) {
    expect(lo[k]!).toBeGreaterThanOrEqual(elo[k]! - 1e-9);
    expect(hi[k]!).toBeLessThanOrEqual(ehi[k]! + 1e-9);
  }
};

/** Every word a sizer under src/postProcessing/sizing stamps as its
 *  `equipmentType` (a literal, or the storage tank's `type_`). */
function sizerWords(): Set<string> {
  const dir = join(REPO, "src", "postProcessing", "sizing");
  const words = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!/\.(cpp|H)$/.test(f)) continue;
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(/equipmentType\s*=\s*"(\w+)"/g)) words.add(m[1]!);
    for (const m of text.matchAll(/\btype_\s*=\s*"(\w+)"/g)) words.add(m[1]!);
  }
  return words;
}

describe("the dispatch is the engine's own equipment word", () => {
  it("every entry is a word a sizer stamps", () => {
    const words = sizerWords();
    expect(words.size).toBeGreaterThan(5);
    for (const k of Object.keys(EQUIPMENT_MODELS)) expect(words).toContain(k);
  });

  it("a kind with no entry, and a non-process item, keep the plain drawing", () => {
    for (const s of [standing("crystalliser", 3, 5), declared("cyclone", 2, 4, 2),
                     declared("building", 15, 4, 10, true), declared("vessel", 4, 3, 4, true)]) {
      const d = equipmentDrawing(s);
      expect(d.model).toBe("plain");
      expect(d.parts).toHaveLength(1);
      close(boundsOf(d.parts)[0], envelope(s)[0]);
      close(boundsOf(d.parts)[1], envelope(s)[1]);
    }
  });

  it("the shared fixture's items each get a drawing, the building the plain box", () => {
    const scene = layoutScene(LAYOUT)!;
    const models = Object.fromEntries(scene.solids.map((s) => [s.id, equipmentDrawing(s).model]));
    expect(models).toEqual({ makeupComp: "compressor", converter: "vessel", separator: "vessel",
                             letdown: "vessel", pumpHouse: "plain" });
  });
});

describe("the body is the engine's envelope; decoration never stands in for it", () => {
  const published: [string, Solid][] = [
    ["tall vessel", standing("vessel", 2.5, 30)],
    ["stubby vessel", standing("vessel", 2, 3)],
    ["exchanger", lying("shellTubeHX", 1.2, 6)],
    ["exchanger along z", { ...lying("shellTubeHX", 0.8, 6), axis: "z", size: [0.8, 0.8, 6] }],
    ["lying vessel", lying("vessel", 2, 8)],
    ["storage tank", standing("storageTank", 20, 12)],
    ["stirred tank", standing("stirredTank", 2.5, 4)],
    ["spray dryer", standing("sprayDryer", 6, 15)],
  ];
  for (const [what, s] of published)
    it(`${what}: the body's bounds ARE the published cylinder`, () => {
      const d = equipmentDrawing(s);
      expect(d.model).not.toBe("plain");
      const [lo, hi] = boundsOf(body(d.parts));
      close(lo, envelope(s)[0]);
      close(hi, envelope(s)[1]);
    });

  const boxes: [string, Solid][] = [
    ["compressor", declared("compressor", 8, 3.5, 4)],
    ["exchanger in a box", declared("shellTubeHX", 12, 2.5, 2)],
    ["tank in a box", declared("storageTank", 34, 20, 34)],
    ["vessel in a box", declared("vessel", 3, 6, 3)],
    ["drum in a box", declared("vessel", 9, 2.5, 2.5)],
  ];
  for (const [what, s] of boxes)
    it(`${what}: the body stands inside the declared box, on its floor`, () => {
      const d = equipmentDrawing(s);
      expect(d.model).not.toBe("plain");
      expect(d.describes).toMatch(/inside the declared box/);
      const b = boundsOf(body(d.parts));
      within(b, envelope(s));
      expect(b[0][1]).toBeCloseTo(-s.size[1] / 2, 9);
    });

  it("a compressor's plinth spans the declared footprint", () => {
    const s = declared("compressor", 8, 3.5, 4);
    const [lo, hi] = boundsOf(body(equipmentDrawing(s).parts));
    expect(hi[0] - lo[0]).toBeCloseTo(8, 9);
    expect(hi[2] - lo[2]).toBeCloseTo(4, 9);
  });

  it("every part has finite, positive dimensions", () => {
    for (const [, s] of [...published, ...boxes])
      for (const p of equipmentDrawing(s).parts) {
        const dims = p.prim === "box" ? [...p.size] : p.prim === "cylinder"
          ? [p.length, Math.max(p.rStart, p.rEnd)] : p.prim === "head" ? [p.r, p.depth] : [p.R, p.r];
        for (const v of dims) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThan(0);
        }
        for (const v of p.at) expect(Number.isFinite(v)).toBe(true);
      }
  });
});

describe("access is drawn by height, not by name", () => {
  const hasLadder = (s: Solid) =>
    equipmentDrawing(s).parts.some((p) => p.prim === "ring" && p.role === "safety"
      && p.R < 1);   // a cage hoop
  it("a vessel whose top stands above ACCESS_FROM gets a caged ladder; a short one none", () => {
    expect(hasLadder(standing("vessel", 2, 30))).toBe(true);
    expect(hasLadder(standing("vessel", 2, ACCESS_FROM - 1))).toBe(false);
  });
  it("the same short vessel on a raised base gets one: it is the top above grade that counts", () => {
    const raised: Solid = { ...standing("vessel", 2, ACCESS_FROM - 1), center: [0, 6, 0] };
    expect(hasLadder(raised)).toBe(true);
  });
  it("its description says so, so the hover tooltip tells drawing from data", () => {
    expect(equipmentDrawing(standing("vessel", 2.5, 30)).describes).toMatch(/ladder and platforms/);
    expect(equipmentDrawing(standing("vessel", 2, 3)).describes).not.toMatch(/ladder/);
  });
});

describe("the quality a view opens in (no WebGL needed)", () => {
  it("fast on a touch device or a small one, high otherwise", () => {
    expect(defaultQuality({ coarsePointer: false })).toBe("high");
    expect(defaultQuality({ coarsePointer: false, deviceMemory: 8, cores: 8 })).toBe("high");
    expect(defaultQuality({ coarsePointer: true })).toBe("fast");
    expect(defaultQuality({ coarsePointer: false, deviceMemory: 4 })).toBe("fast");
    expect(defaultQuality({ coarsePointer: false, cores: 2 })).toBe("fast");
  });
});
