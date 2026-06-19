/*---------------------------------------------------------------------------*\
  Shared per-stream composition helper (case/streamComposition.ts) -- the ONE
  computation behind the in-app Streams tab AND the pop-out window.  Covers
  the mass-basis bug the pop-out once had: with MWs present a plain fluid
  stream must get a NONZERO total mass flow and w_ fractions that sum to 1
  (the broken version ignored MWs, so F read 0 and every w_ was "—").
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { computePerStream } from "../src/case/streamComposition.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

const MWS = { water: 18.015, ethanol: 46.069, silica: 60.084 }; // kg/kmol

const fluid: StreamResult = {
  name: "feed",
  role: "feed",
  F: 2, // kmol/s
  T: 350,
  P: 1e5,
  composition: { water: 0.25, ethanol: 0.75 },
};

describe("computePerStream -- molar basis", () => {
  it("fluid stream: totMol = F, mole fractions = composition", () => {
    const ps = computePerStream([fluid], MWS)["feed"]!;
    expect(ps.totMol).toBeCloseTo(2, 12);
    expect(ps.molFrac["water"]).toBeCloseTo(0.25, 12);
    expect(ps.molFrac["ethanol"]).toBeCloseTo(0.75, 12);
  });
  it("mole fractions sum to 1", () => {
    const ps = computePerStream([fluid], MWS)["feed"]!;
    const xSum = Object.values(ps.molFrac).reduce((a, b) => a + b, 0);
    expect(xSum).toBeCloseTo(1, 12);
  });
});

describe("computePerStream -- mass basis (the fixed pop-out bug)", () => {
  it("with MWs present: total mass flow is NONZERO and w_ sum to 1", () => {
    const ps = computePerStream([fluid], MWS)["feed"]!;
    // 2 kmol/s x (0.25*18.015 + 0.75*46.069) kg/kmol
    const expected = 2 * (0.25 * 18.015 + 0.75 * 46.069);
    expect(ps.totMass).toBeGreaterThan(0);
    expect(ps.totMass).toBeCloseTo(expected, 9);
    const wSum = Object.values(ps.massFrac).reduce((a, b) => a + b, 0);
    expect(wSum).toBeCloseTo(1, 12);
    // ethanol dominates by mass even more than by moles (heavier MW)
    expect(ps.massFrac["ethanol"]!).toBeGreaterThan(ps.molFrac["ethanol"]!);
  });
  it("without MWs: totMass stays 0, massFrac empty (honest fallback -> '—')", () => {
    const ps = computePerStream([fluid], undefined)["feed"]!;
    expect(ps.totMass).toBe(0);
    expect(Object.keys(ps.massFrac)).toHaveLength(0);
    // the molar side is unaffected
    expect(ps.totMol).toBeCloseTo(2, 12);
  });
});

describe("computePerStream -- solid phase folded in", () => {
  it("solids-only stream (cyclone capturedSolids) reads its real flow, w = 1", () => {
    const solidsOnly: StreamResult = {
      name: "capturedSolids", role: "product", F: 0, T: 300, P: 1e5,
      composition: {}, solids: { silica: 0.5 }, // kg/s
    };
    const ps = computePerStream([solidsOnly], MWS)["capturedSolids"]!;
    expect(ps.totMass).toBeCloseTo(0.5, 12);
    expect(ps.massFrac["silica"]).toBeCloseTo(1, 12);
    expect(ps.totMol).toBeCloseTo(0.5 / 60.084, 12);
    expect(ps.molFrac["silica"]).toBeCloseTo(1, 12);
  });
  it("slurry: fluid + solid both counted, fractions sum to 1 in both bases", () => {
    const slurry: StreamResult = {
      name: "slurry", role: "intermediate", F: 1, T: 300, P: 1e5,
      composition: { water: 1 }, solids: { silica: 2 },
    };
    const ps = computePerStream([slurry], MWS)["slurry"]!;
    expect(ps.totMass).toBeCloseTo(1 * 18.015 + 2, 9);
    expect(ps.totMol).toBeCloseTo(1 + 2 / 60.084, 9);
    const wSum = Object.values(ps.massFrac).reduce((a, b) => a + b, 0);
    const xSum = Object.values(ps.molFrac).reduce((a, b) => a + b, 0);
    expect(wSum).toBeCloseTo(1, 12);
    expect(xSum).toBeCloseTo(1, 12);
  });
});
