/*---------------------------------------------------------------------------*\
  The economic tornado: the engine's sensitivity rows -> bars.

  The engine (EconomicsPass.cpp, DEV.md 4c C68) publishes one row per declared
  input on `economics.sensitivity`, in tornado order.  These tests hold the
  pure transform (case/tornado.ts) to three promises: the bars come out in the
  ENGINE'S order and are never re-sorted here; every label is the engine's
  numbers formatted, never a number computed here; and an absent block draws
  NO chart.  Plus the adapter's mapping of the block off the result JSON.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { tornadoFigure, endValueText, fmtMoney } from "../src/case/tornado.js";
import { extractStructured } from "../src/adapters/WasmAdapter.js";
import type { Economics, EconomicSensitivityInput } from "../src/adapters/SolverAdapter.js";
import type { CaseFiles } from "../src/case/types.js";

const CAVEAT = "A SENSITIVITY, NOT AN UNCERTAINTY ANALYSIS: each input is moved ALONE ...";

function row(p: Partial<EconomicSensitivityInput>): EconomicSensitivityInput {
  return {
    input: "x", kpiKey: "x", mode: "relative", fromBand: false,
    declaredLow: -0.2, declaredHigh: 0.2, unit: "EUR/kg",
    baseValue: 1, valueLow: 0.8, valueHigh: 1.2,
    NPV_low: 0, NPV_high: 0, NPVswing: 0, NPVsignFlip: "",
    ...p,
  };
}

function econ(inputs: EconomicSensitivityInput[] | undefined, NPV = -500e6): Economics {
  return {
    currency: "EUR", FCI: 1, WC: 0, TCI: 1, COM_d: 0, revenue: 0, depreciation: 0,
    NPV, IRR: null, irrAmbiguous: false, discountedPayback: null, simplePayback: null,
    discountRate: 0.1, taxRate: 0.25, projectLife: 20, estimateClass: 4,
    accLo: -30, accHi: 50, cashFlow: [],
    ...(inputs ? { sensitivity: { caveat: CAVEAT, inputs } } : {}),
  };
}

//  The 150 bar witness's three widest rows (greenAmmonia02_feasibility150bar,
//  golden `sens_` rows), in the order the engine published them, plus one
//  narrow row the engine put LAST.
const H2 = row({ input: "price.H2Feed", kpiKey: "price_H2Feed", baseValue: 4.5,
  valueLow: 3.6, valueHigh: 5.4, NPV_low: -24603531.9342, NPV_high: -961599656.603,
  NPVswing: 936996124.669 });
const NH3 = row({ input: "price.ProductNH3", kpiKey: "price_ProductNH3", baseValue: 1,
  valueLow: 0.8, valueHigh: 1.2, NPV_low: -954215056.017, NPV_high: -31988132.5199,
  NPVswing: 922226923.497 });
const FCI = row({ input: "FCI", kpiKey: "FCI", unit: "EUR", fromBand: true,
  declaredLow: -0.3, declaredHigh: 0.5, baseValue: 108e6, valueLow: 75.6e6, valueHigh: 162e6,
  NPV_low: -468747602.764, NPV_high: -533691580.11, NPVswing: 64943977.346 });
const DR = row({ input: "discountRate", kpiKey: "discountRate", mode: "absolute", unit: "-",
  declaredLow: 0.08, declaredHigh: 0.12, baseValue: 0.1, valueLow: 0.08, valueHigh: 0.12,
  NPV_low: -540938286.639, NPV_high: -452879036.764, NPVswing: 88059249.875 });

describe("tornadoFigure: the engine's rows as bars", () => {
  it("draws the bars in the engine's published order and sorts nothing", () => {
    //  The engine's order here deliberately is NOT the swing order (DR has a
    //  wider swing than FCI but comes after it): a transform that re-sorted
    //  would be a second home for the ranking and would move DR up.
    const fig = tornadoFigure(econ([H2, NH3, FCI, DR]))!;
    expect(fig.bars.map((b) => b.input))
      .toEqual(["price.H2Feed", "price.ProductNH3", "FCI", "discountRate"]);
  });

  it("hangs every bar from the engine's base NPV and keeps the engine's NPVs", () => {
    const fig = tornadoFigure(econ([H2, NH3], -492e6))!;
    expect(fig.baseNPV).toBe(-492e6);
    const h2 = fig.bars[0]!;
    expect(h2.npvLow).toBe(H2.NPV_low);
    expect(h2.npvHigh).toBe(H2.NPV_high);
    expect(h2.swing).toBe(H2.NPVswing);          // published, not recomputed
    //  The bar LENGTHS are geometry about the base: base + d = the engine's NPV.
    expect(fig.baseNPV + h2.dLow).toBeCloseTo(H2.NPV_low, 3);
    expect(fig.baseNPV + h2.dHigh).toBeCloseTo(H2.NPV_high, 3);
  });

  it("labels each bar with the input and its value at that end", () => {
    const fig = tornadoFigure(econ([H2, FCI, DR]))!;
    const [h2, fci, dr] = fig.bars;
    expect(h2!.axisLabel).toBe("price.H2Feed");
    expect(h2!.lowValueText).toBe("3.6 EUR/kg (−20 %)");
    expect(h2!.highValueText).toBe("5.4 EUR/kg (+20 %)");
    //  FCI's ends come from the declared accuracy band, and say so.
    expect(fci!.lowValueText).toBe("75.60M EUR (−30 %, accuracy band)");
    expect(fci!.highValueText).toBe("162.00M EUR (+50 %, accuracy band)");
    //  An absolute end is the input's own value, with no percentage.
    expect(dr!.lowValueText).toBe("0.08");
    expect(dr!.highValueText).toBe("0.12");
  });

  it("formats a utility bill factor and marks an engine-declared sign flip", () => {
    const el = row({ input: "utility.electricity", unit: "x bill", baseValue: 1,
      valueLow: 0.8, valueHigh: 1.2, NPV_low: 1e6, NPV_high: -2e6, NPVsignFlip: "high" });
    const fig = tornadoFigure(econ([el], 0.5e6))!;
    expect(fig.bars[0]!.lowValueText).toBe("×0.800 bill (−20 %)");
    expect(fig.bars[0]!.axisLabel).toBe("utility.electricity (NPV sign flips)");
    expect(fig.bars[0]!.signFlip).toBe("high");
  });

  it("carries the engine's caveat sentence verbatim", () => {
    expect(tornadoFigure(econ([H2]))!.caveat).toBe(CAVEAT);
  });

  it("ABSENCE: no economics, no block, an empty block or no finite row => no chart", () => {
    expect(tornadoFigure(undefined)).toBeNull();
    expect(tornadoFigure(econ(undefined))).toBeNull();
    expect(tornadoFigure(econ([]))).toBeNull();
    expect(tornadoFigure(econ([row({ NPV_low: NaN })]))).toBeNull();
  });

  it("fmtMoney and endValueText never print NaN", () => {
    expect(fmtMoney(NaN)).toBe("—");
    expect(fmtMoney(-1234567)).toBe("−1.23M");
    expect(endValueText(row({ valueLow: NaN, mode: "absolute", unit: "-" }), "low")).toBe("—");
  });
});

describe("the adapter maps economics.sensitivity off the result JSON", () => {
  const CASE: CaseFiles = { thermoPackage: {}, controlDict: {} };
  const wrap = (o: object) => ["<<<Choupo:result-begin>>>", JSON.stringify(o),
    "<<<Choupo:result-end>>>"].join("\n");
  const BASE = { version: 1, converged: true, components: [], streams: {}, kpis: {},
    convergence: {} };
  const ECON = { currency: "EUR", FCI: 1, WC: 0, TCI: 1, COM_d: 0, revenue: 0,
    depreciation: 0, NPV: -5, IRR: null, irrAmbiguous: false, discountedPayback: null,
    simplePayback: null, discountRate: 0.1, taxRate: 0.25, projectLife: 20,
    estimateClass: 4, accLo: -30, accHi: 50, cashFlow: [] };

  it("keeps the rows in the published order, with every field", () => {
    const r = extractStructured(wrap({ ...BASE, economics: { ...ECON, sensitivity: {
      caveat: CAVEAT,
      inputs: [
        { input: "price.H2Feed", kpiKey: "price_H2Feed", mode: "relative", fromBand: false,
          declaredLow: -0.2, declaredHigh: 0.2, unit: "EUR/kg", baseValue: 4.5,
          valueLow: 3.6, valueHigh: 5.4, NPV_low: -2, NPV_high: -9, NPVswing: 7,
          NPVsignFlip: "" },
        { input: "FCI", kpiKey: "FCI", mode: "relative", fromBand: true,
          declaredLow: -0.3, declaredHigh: 0.5, unit: "EUR", baseValue: 10,
          valueLow: 7, valueHigh: 15, NPV_low: -4, NPV_high: -6, NPVswing: 2,
          NPVsignFlip: "" },
      ] } } }), CASE);
    const s = r.economics!.sensitivity!;
    expect(s.caveat).toBe(CAVEAT);
    expect(s.inputs.map((i) => i.input)).toEqual(["price.H2Feed", "FCI"]);
    expect(s.inputs[1]!.fromBand).toBe(true);
    expect(s.inputs[0]!.valueHigh).toBe(5.4);
  });

  it("leaves sensitivity absent when the engine published none", () => {
    const r = extractStructured(wrap({ ...BASE, economics: ECON }), CASE);
    expect(r.economics).toBeDefined();
    expect(r.economics!.sensitivity).toBeUndefined();
  });
});
