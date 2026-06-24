/*---------------------------------------------------------------------------*\
  Economics block: adapter mapping.

  The solver emits an "economics" object (headline scalars + the year-by-year DCF
  table) between the <<<Choupo:result-begin/end>>> markers, ONLY for a case with
  an economics postDict.  This test pins extractStructured's mapping of that block
  into RunResult.economics (and that a result without it leaves economics absent).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { extractStructured } from "../src/adapters/WasmAdapter.js";
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
