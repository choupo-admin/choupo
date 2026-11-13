/*---------------------------------------------------------------------------*\
  Economics block: adapter mapping.

  The solver emits an "economics" object (headline scalars + the year-by-year DCF
  table) between the <<<Choupo:result-begin/end>>> markers, ONLY for a case with
  an economics postDict.  This test pins extractStructured's mapping of that block
  into RunResult.economics (and that a result without it leaves economics absent).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { extractStructured } from "../src/adapters/WasmAdapter.js";
import { breakEvenPriceLine } from "../src/case/breakEvenLine.js";
import type { CaseFiles } from "../src/case/types.js";

const CASE: CaseFiles = {
  thermoPackage: {}, controlDict: {},
};

function wrap(resultJson: object): string {
  return [
    "some log line",
    "<<<Choupo:result-begin>>>",
    JSON.stringify(resultJson),
    "<<<Choupo:result-end>>>",
    "trailing line",
  ].join("\n");
}

const BASE = { version: 1, converged: true, components: [], streams: {}, kpis: {}, convergence: {} };

describe("economics adapter mapping", () => {
  it("maps the economics block (scalars + DCF table) into RunResult", () => {
    const log = wrap({
      ...BASE,
      economics: {
        currency: "EUR", FCI: 407855, WC: 61178, TCI: 469033, COM_d: 223108013,
        revenue: 230080940, depreciation: 45317, NPV: 33457396,
        IRR: null, irrAmbiguous: false,
        discountedPayback: 1.1, simplePayback: 1.0,
        discountRate: 0.10, taxRate: 0.21, projectLife: 10,
        estimateClass: 4, accLo: -30, accHi: 50,
        cashFlow: [
          { year: 0, investment: -469033, revenue: 0, opex: 0, depreciation: 0,
            taxableIncome: 0, tax: 0, afterTaxProfit: 0, cashFlow: -469033,
            discountFactor: 1, discountedCF: -469033, cumulativeDCF: -469033 },
          { year: 1, investment: 0, revenue: 230080940, opex: 223108013,
            depreciation: 45317, taxableIncome: 6927609, tax: 1454797,
            afterTaxProfit: 5472811, cashFlow: 5518128, discountFactor: 0.9091,
            discountedCF: 5016480, cumulativeDCF: 4547447 },
        ],
      },
    });

    const r = extractStructured(log, CASE);
    expect(r.economics).toBeDefined();
    const e = r.economics!;
    expect(e.currency).toBe("EUR");
    expect(e.FCI).toBe(407855);
    expect(e.NPV).toBe(33457396);
    expect(e.IRR).toBeNull();              // null IRR survives as null
    expect(e.estimateClass).toBe(4);
    expect(e.accLo).toBe(-30);
    expect(e.cashFlow).toHaveLength(2);
    expect(e.cashFlow[0]!.year).toBe(0);
    expect(e.cashFlow[0]!.investment).toBe(-469033);
    expect(e.cashFlow[1]!.cumulativeDCF).toBe(4547447);
  });

  it("leaves economics absent for a result with no economics block", () => {
    const r = extractStructured(wrap(BASE), CASE);
    expect(r.economics).toBeUndefined();
  });
});

describe("price break-even mapping", () => {
  const econ = (extra: object) => ({
    currency: "EUR", FCI: 1, WC: 1, TCI: 2, COM_d: 1, revenue: 1, depreciation: 1,
    NPV: -1, IRR: null, irrAmbiguous: false, discountedPayback: null,
    simplePayback: null, discountRate: 0.1, taxRate: 0.21, projectLife: 10,
    estimateClass: 4, accLo: -30, accHi: 50, cashFlow: [], ...extra,
  });

  it("keeps the engine's break-even prices, in order, and words them", () => {
    const r = extractStructured(wrap({ ...BASE, economics: econ({
      breakEvenPrices: [
        { stream: "ProductNH3", role: "product", declared: 1.0, breakEven: 1.42 },
        { stream: "H2Feed", role: "rawMaterial", declared: 4.5, breakEven: 3.1 },
      ] }) }), CASE);
    const b = r.economics!.breakEvenPrices!;
    const [b0, b1] = [b[0]!, b[1]!];
    expect(b.map((x) => x.stream)).toEqual(["ProductNH3", "H2Feed"]);
    expect(b0.breakEven).toBe(1.42);
    expect(breakEvenPriceLine("EUR", b0)).toBe(
      "NPV = 0 at 1.420 EUR/kg of ProductNH3 (declared 1.000) -- the minimum selling price, every other price held.");
    expect(breakEvenPriceLine("EUR", b1)).toContain("the highest purchase price the plant can bear");
  });

  it("leaves the key absent when the engine wrote none, and drops a non-finite row", () => {
    expect(extractStructured(wrap({ ...BASE, economics: econ({}) }), CASE)
      .economics!.breakEvenPrices).toBeUndefined();
    const r = extractStructured(wrap({ ...BASE, economics: econ({
      breakEvenPrices: [{ stream: "X", role: "product", declared: 1, breakEven: null }] }) }), CASE);
    expect(r.economics!.breakEvenPrices).toBeUndefined();
  });
});
