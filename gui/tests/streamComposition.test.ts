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

describe("computePerStream -- the engine's OVERALL contract (no double count)", () => {
  //  As the engine writes it today (ResultEmitter.cpp): F and composition
  //  are OVERALL, the crystals included; `solids` names a PART of them.
  it("a slurry's solid is counted once", () => {
    const nSil = 2 / 60.084;
    const F = 1 + nSil;
    const slurry: StreamResult = {
      name: "slurry", role: "intermediate", F, T: 300, P: 1e5,
      composition: { water: 1 / F, silica: nSil / F }, solids: { silica: 2 },
    };
    const ps = computePerStream([slurry], MWS)["slurry"]!;
    expect(ps.totMol).toBeCloseTo(F, 12);
    expect(ps.totMass).toBeCloseTo(18.015 + 2, 9);
    expect(ps.molFrac["silica"]).toBeCloseTo(nSil / F, 12);
    expect(ps.massFrac["silica"]).toBeCloseTo(2 / (18.015 + 2), 12);
  });
  it("a magma whose solute is BOTH dissolved and crystalline reads the engine's F and F_mass", () => {
    //  The shape crystalliser02_msmpr's `magma` has (measured 2026-10-24):
    //  sucrose in the liquor AND as crystals, `composition` overall, `solids`
    //  the crystalline part.  The old sum read 2.2478 kg/s against the
    //  engine's own F_mass 1.8516 -- the crystals' 0.3962 kg/s twice.
    const MW = { water: 18.015, sucrose: 342.3 };
    const nW = 0.02, nDis = 0.002, nCry = 0.001;          // kmol/s
    const F = nW + nDis + nCry;
    const magma: StreamResult = {
      name: "magma", role: "product", F, T: 300, P: 1e5,
      F_mass: nW * MW.water + (nDis + nCry) * MW.sucrose,
      composition: { water: nW / F, sucrose: (nDis + nCry) / F },
      solids: { sucrose: nCry * MW.sucrose },
    };
    const ps = computePerStream([magma], MW)["magma"]!;
    expect(ps.totMol).toBeCloseTo(F, 12);
    expect(ps.totMass).toBeCloseTo(magma.F_mass!, 12);
    expect(ps.massFrac["sucrose"]).toBeCloseTo((nDis + nCry) * MW.sucrose / magma.F_mass!, 12);
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
