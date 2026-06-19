// Tests for the run-result "speak-up" surfaces of the WASM parse path:
// solver advisories ([bound]/[rating]/[init]/[thermo]/[electrolyte]) and the
// model-boundary audit (incl. REFUSED boundaries, which carry a reason and no
// dH numbers).  These feed the StreamsSummary band and the run-complete toast
// ("no silent crutch": a refused boundary must never vanish into a teal
// "Run complete"), so the passthrough is pinned here.
//
// Same fixture style as adapters.test.ts: a JSON payload between the solver's
// markers, parsed with extractStructured.

import { describe, expect, it } from "vitest";

import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import type { CaseFiles } from "../src/case/types.js";

const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };

const basePayload = {
  version: 1,
  converged: true,
  components: [],
  streams: {},
  kpis: {},
};

function wrap(payload: object): string {
  return `intro\n${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n`;
}

describe("run-result surfaces: advisories", () => {
  it("passes advisories through verbatim (category / severity / locus / message)", () => {
    const advisories = [
      { category: "bound", severity: "warning", locus: "tear 'recycle'", message: "upper bound active at the solution" },
      { category: "thermo", severity: "warning", locus: "NRTL", message: "pair used outside its fitted T range" },
      { category: "electrolyte", severity: "warning", locus: "evaporator 'evap'", message: "heat of dilution omitted" },
    ];
    const out = extractStructured(wrap({ ...basePayload, advisories }), emptyCase);
    expect(out.advisories).toEqual(advisories);
  });

  it("omits advisories when the payload carries an empty array", () => {
    const out = extractStructured(
      wrap({ ...basePayload, advisories: [] }), emptyCase);
    expect(out.advisories).toBeUndefined();
  });
});

describe("run-result surfaces: model-boundary audit", () => {
  it("passes a numeric boundary AND a refused one through", () => {
    const modelBoundaries = [
      // Numeric finding: dH at fixed (T,P,z) + the implied ΔT readout.
      { stream: "brine", producer: "evap", consumer: "cryst",
        refused: false, dH_kJ_per_mol: -1.234, dH_kW: -5.6, implied_dT_K: 8.9 },
      // Refusal: a speciation flip -- reason only, NO dH fields.
      { stream: "purge", producer: "cryst", consumer: "mixer",
        refused: true, reason: "speciation change (electrolyte → molecular)" },
    ];
    const out = extractStructured(
      wrap({ ...basePayload, modelBoundaries }), emptyCase);
    expect(out.modelBoundaries).toEqual(modelBoundaries);

    const refused = out.modelBoundaries![1]!;
    expect(refused.refused).toBe(true);
    expect(refused.reason).toContain("speciation");
    expect(refused.dH_kJ_per_mol).toBeUndefined();
    expect(refused.dH_kW).toBeUndefined();
    expect(refused.implied_dT_K).toBeUndefined();
  });

  it("omits modelBoundaries when the payload carries an empty array", () => {
    const out = extractStructured(
      wrap({ ...basePayload, modelBoundaries: [] }), emptyCase);
    expect(out.modelBoundaries).toBeUndefined();
  });
});

describe("run-result surfaces: absence", () => {
  it("omits both fields when the payload has neither key", () => {
    const out = extractStructured(wrap(basePayload), emptyCase);
    expect(out.advisories).toBeUndefined();
    expect(out.modelBoundaries).toBeUndefined();
    // The rest of the parse is unaffected.
    expect(out.kpis).toEqual({});
    expect(out.streams).toEqual([]);
  });
});
