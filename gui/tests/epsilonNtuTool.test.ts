// epsilonNtuTool -- the ε-NTU closed forms, the configuration matcher and the
// activation predicate.  Every expected value below is derived INLINE with
// Math.exp from the textbook forms (the engine's own equations, HeatExchanger
// .cpp) -- never by calling the module's helper -- so the module is compared
// against an independent transcription, not against itself.
//
// The classroom-witness block at the bottom pins the tool's SELF-FEEDING leg
// (src/case/methodRun.ts) against the REAL bundled corpus: every knob's
// ScalarOverride must resolve UNIQUELY in the witness's own raw dict text
// (applyScalarOverride throws on 0 or >1 matches), a bogus key must throw,
// and the witness's own golden `expected` triple must confirm the counter-
// current geometry.  No WASM runs here -- the override mechanics only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  ENTU_DEFAULT_KNOBS, ENTU_WITNESS, entuOverrides,
  epsilonNtu, hasEpsilonNtuKpis, matchConfiguration, MATCH_TOL,
} from "../src/ui/methods/EpsilonNtuTool.js";

describe("epsilonNtu -- counter-current: eps = (1-e)/(1-Cr*e), e = exp(-NTU(1-Cr))", () => {
  it("pins four hand values", () => {
    // NTU = 1, Cr = 0.5
    let e = Math.exp(-1 * (1 - 0.5));
    expect(epsilonNtu("counter", 1, 0.5)).toBeCloseTo((1 - e) / (1 - 0.5 * e), 15);
    // NTU = 2, Cr = 0.25
    e = Math.exp(-2 * (1 - 0.25));
    expect(epsilonNtu("counter", 2, 0.25)).toBeCloseTo((1 - e) / (1 - 0.25 * e), 15);
    // NTU = 3, Cr = 0 -- the phase-change limit, 1 - exp(-NTU)
    expect(epsilonNtu("counter", 3, 0)).toBeCloseTo(1 - Math.exp(-3), 15);
    // NTU = 2.4, Cr = 0.8
    e = Math.exp(-2.4 * (1 - 0.8));
    expect(epsilonNtu("counter", 2.4, 0.8)).toBeCloseTo((1 - e) / (1 - 0.8 * e), 15);
  });

  it("takes the Cr -> 1 limit NTU/(1+NTU), on the engine's own 1e-9 band", () => {
    // Exactly balanced streams: the limit form, exact.
    expect(epsilonNtu("counter", 2, 1)).toBe(2 / 3);
    expect(epsilonNtu("counter", 3, 1)).toBe(3 / 4);
    // Inside the engine's |1-Cr| < 1e-9 switch: still the limit form.
    expect(epsilonNtu("counter", 3, 1 - 1e-10)).toBe(3 / 4);
    // Just outside the band: the general form, continuous with the limit.
    // Derive from the same float Cr the call receives -- (1 - Cr) is NOT the
    // literal 1e-6 in IEEE doubles, and near Cr = 1 the cancellation magnifies
    // that representation gap far past the formula's own arithmetic.
    const Cr = 1 - 1e-6;
    const e = Math.exp(-3 * (1 - Cr));
    expect(epsilonNtu("counter", 3, Cr)).toBeCloseTo((1 - e) / (1 - Cr * e), 15);
    expect(epsilonNtu("counter", 3, 1 - 1e-6)).toBeCloseTo(3 / 4, 6);
  });
});

describe("epsilonNtu -- co-current: eps = (1-exp(-NTU(1+Cr)))/(1+Cr)", () => {
  it("pins four hand values", () => {
    expect(epsilonNtu("co", 1, 0.5)).toBeCloseTo((1 - Math.exp(-1.5)) / 1.5, 15);
    expect(epsilonNtu("co", 2, 1)).toBeCloseTo((1 - Math.exp(-4)) / 2, 15);
    expect(epsilonNtu("co", 0.5, 0.25)).toBeCloseTo((1 - Math.exp(-0.625)) / 1.25, 15);
    // Cr = 0: collapses to 1 - exp(-NTU)
    expect(epsilonNtu("co", 4, 0)).toBeCloseTo(1 - Math.exp(-4), 15);
  });
});

describe("epsilonNtu -- 1 shell / 2 tube passes:"
  + " eps = 2/{(1+Cr) + root(1+E)/(1-E)}, E = exp(-NTU*root), root = sqrt(1+Cr^2)", () => {
  it("pins four hand values", () => {
    const shell = (NTU: number, Cr: number) => {
      const root = Math.sqrt(1 + Cr * Cr);
      const E = Math.exp(-NTU * root);
      return 2 / ((1 + Cr) + (root * (1 + E)) / (1 - E));
    };
    expect(epsilonNtu("shell2pass", 1, 0.5)).toBeCloseTo(shell(1, 0.5), 15);
    expect(epsilonNtu("shell2pass", 2, 1)).toBeCloseTo(shell(2, 1), 15);
    expect(epsilonNtu("shell2pass", 3, 0.75)).toBeCloseTo(shell(3, 0.75), 15);
    // Cr = 0: root = 1 and the form telescopes to 1 - exp(-NTU) exactly.
    expect(epsilonNtu("shell2pass", 1.5, 0)).toBeCloseTo(1 - Math.exp(-1.5), 15);
  });

  it("collapses onto the other two at Cr = 0 (the phase-change limit)", () => {
    for (const NTU of [0.5, 2, 5]) {
      const limit = 1 - Math.exp(-NTU);
      expect(epsilonNtu("counter", NTU, 0)).toBeCloseTo(limit, 12);
      expect(epsilonNtu("co", NTU, 0)).toBeCloseTo(limit, 12);
      expect(epsilonNtu("shell2pass", NTU, 0)).toBeCloseTo(limit, 12);
    }
  });
});

describe("matchConfiguration -- the engine's point is the judge", () => {
  // A synthetic KPI set built FROM the counter-current closed form, derived
  // inline: the matcher must confirm counter and reject the other two.
  const NTU = 1.8, Cr = 0.6;
  const e = Math.exp(-NTU * (1 - Cr));
  const epsCounter = (1 - e) / (1 - Cr * e);
  const kpis = { NTU, C_r: Cr, effectiveness: epsCounter, LMTD: 12.3, Q_kW: 45.6 };

  it("confirms counter-current to float precision and rejects co / shell", () => {
    const m = matchConfiguration(kpis);
    expect(m).not.toBeNull();
    expect(m!.confirmed).toEqual(["counter"]);
    const byId = Object.fromEntries(m!.checks.map((c) => [c.id, c]));
    expect(Math.abs(byId["counter"]!.dEps)).toBeLessThan(MATCH_TOL);
    expect(byId["co"]!.matches).toBe(false);
    expect(byId["shell2pass"]!.matches).toBe(false);
    // The rejections are real distances, not tolerance noise.
    expect(Math.abs(byId["co"]!.dEps)).toBeGreaterThan(1e-3);
    expect(Math.abs(byId["shell2pass"]!.dEps)).toBeGreaterThan(1e-3);
    // Three checks, always: the deviations are reported for every
    // configuration whether or not one matched.
    expect(m!.checks).toHaveLength(3);
  });

  it("returns null on a KPI row that cannot feed the tool", () => {
    expect(matchConfiguration(undefined)).toBeNull();
    expect(matchConfiguration({ NTU, effectiveness: epsCounter })).toBeNull();
  });
});

describe("hasEpsilonNtuKpis -- the activation predicate", () => {
  it("activates only on the full finite (NTU, effectiveness, C_r) triple", () => {
    expect(hasEpsilonNtuKpis({ NTU: 2, effectiveness: 0.7, C_r: 0.5 })).toBe(true);
    // Extra KPI keys (the exchanger writes fifteen) never block activation.
    expect(hasEpsilonNtuKpis({
      NTU: 2, effectiveness: 0.7, C_r: 0.5, area: 12, U: 500, LMTD: 20,
    })).toBe(true);
  });

  it("stays honest on partial, absent or non-finite rows", () => {
    expect(hasEpsilonNtuKpis(undefined)).toBe(false);
    expect(hasEpsilonNtuKpis({})).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: 2, effectiveness: 0.7 })).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: 2, C_r: 0.5 })).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: NaN, effectiveness: 0.7, C_r: 0.5 })).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: 2, effectiveness: Infinity, C_r: 0.5 })).toBe(false);
  });
});

describe("the classroom witness -- every knob resolves against the REAL corpus", () => {
  const entry = tutorialByName(ENTU_WITNESS);

  it("the witness is bundled, raw text included, with every knob's file", () => {
    expect(entry, `witness '${ENTU_WITNESS}' must be in the bundled corpus`)
      .toBeDefined();
    const raw = entry!.files.rawFiles;
    expect(raw).toBeDefined();
    for (const f of ["system/flowsheetDict", "0/hot", "0/cold"]) {
      expect(raw![f], `witness raw file '${f}'`).toBeTypeOf("string");
    }
  });

  it("all six ScalarOverrides hit their key UNIQUELY in the witness raw text", () => {
    const raw = entry!.files.rawFiles!;
    const overrides = entuOverrides(ENTU_DEFAULT_KNOBS);
    expect(overrides).toHaveLength(6);
    // None declares an `occurrence`: every key must be unique in its file
    // (applyScalarOverride THROWS on 0 matches and on >1 without occurrence,
    // so a plain no-throw here proves both existence and uniqueness).
    for (const o of overrides) {
      expect(o.occurrence).toBeUndefined();
      const body = raw[o.file]!;
      const out = applyScalarOverride(body, { ...o, value: 123.456 });
      expect(out).not.toBe(body);
      expect(out).toContain("123.456");
    }
  });

  it("the textual override keeps each scalar's declared unit word", () => {
    const raw = entry!.files.rawFiles!;
    const fsheet = applyScalarOverride(raw["system/flowsheetDict"]!,
      { file: "system/flowsheetDict", key: "area", value: 25 });
    expect(fsheet).toMatch(/^\s*area\s+25\s*m2\s*;/m);
    const fsheetU = applyScalarOverride(raw["system/flowsheetDict"]!,
      { file: "system/flowsheetDict", key: "U", value: 750 });
    expect(fsheetU).toMatch(/^\s*U\s+750\s*W\/m2\/K\s*;/m);
    const hotT = applyScalarOverride(raw["0/hot"]!,
      { file: "0/hot", key: "T", value: 372 });
    expect(hotT).toMatch(/^\s*T\s+372\s*K\s*;/m);
    const hotF = applyScalarOverride(raw["0/hot"]!,
      { file: "0/hot", key: "water", value: 55 });
    expect(hotF).toMatch(/^\s*water\s+55\s*kmol\/h\s*;/m);
    const coldT = applyScalarOverride(raw["0/cold"]!,
      { file: "0/cold", key: "T", value: 288 });
    expect(coldT).toMatch(/^\s*T\s+288\s*K\s*;/m);
    const coldF = applyScalarOverride(raw["0/cold"]!,
      { file: "0/cold", key: "water", value: 140 });
    expect(coldF).toMatch(/^\s*water\s+140\s*kmol\/h\s*;/m);
  });

  it("methodCase builds the parameterised witness with all six knobs at once", () => {
    const cf = methodCase(ENTU_WITNESS, entuOverrides({
      area_m2: 18, U_W_m2K: 750, hotFlow_kmolh: 90, hotT_K: 355,
      coldFlow_kmolh: 140, coldT_K: 305,
    }));
    const raw = cf.rawFiles!;
    expect(raw["system/flowsheetDict"]).toMatch(/^\s*area\s+18\s*m2\s*;/m);
    expect(raw["system/flowsheetDict"]).toMatch(/^\s*U\s+750\s*W\/m2\/K\s*;/m);
    expect(raw["0/hot"]).toMatch(/^\s*water\s+90\s*kmol\/h\s*;/m);
    expect(raw["0/hot"]).toMatch(/^\s*T\s+355\s*K\s*;/m);
    expect(raw["0/cold"]).toMatch(/^\s*water\s+140\s*kmol\/h\s*;/m);
    expect(raw["0/cold"]).toMatch(/^\s*T\s+305\s*K\s*;/m);
  });

  it("a bogus key THROWS instead of silently no-opping", () => {
    const raw = entry!.files.rawFiles!;
    expect(() => applyScalarOverride(raw["system/flowsheetDict"]!,
      { file: "system/flowsheetDict", key: "refluxRatio", value: 2 }))
      .toThrow(/not found/);
    expect(() => methodCase(ENTU_WITNESS,
      [{ file: "0/hot", key: "notAKnob", value: 1 }]))
      .toThrow(/not found/);
    // ... and so does a knob aimed at a file the witness does not carry.
    expect(() => methodCase(ENTU_WITNESS,
      [{ file: "0/steam", key: "T", value: 400 }]))
      .toThrow(/not in witness/);
  });

  it("the witness's own golden (NTU, effectiveness, C_r) confirms counter-current", () => {
    // The golden `expected` is deliberately NOT bundled (excluded from the
    // corpus glob) -- read it from the repository tree instead.
    const p = fileURLToPath(new URL(
      "../../tutorials/steady/heat/heatExchanger01_water_water/expected",
      import.meta.url));
    const kpi: { [k: string]: number } = {};
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^kpi\s+hx\s+(\S+)\s+(\S+)/.exec(line);
      if (m) kpi[m[1]!] = Number(m[2]);
    }
    expect(hasEpsilonNtuKpis(kpi)).toBe(true);
    const match = matchConfiguration(kpi);
    expect(match).not.toBeNull();
    expect(match!.confirmed).toEqual(["counter"]);
  });
});
