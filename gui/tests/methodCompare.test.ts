import { describe, expect, it } from "vitest";

import { familyForProperty, mergeMethodCsvs, methodSpread, specForModel } from "../src/case/methodCompare.js";
import type { ExploreSpec } from "../src/case/exploreSynth.js";

const base: ExploreSpec = {
  components: ["water"],
  properties: ["Psat_water"],
  axis: { variable: "T", from: 290, to: 300, n: 2 },
  state: { composition: { water: 1 } },
};

describe("methodCompare — families + per-model specs", () => {
  it("maps a property to its comparable family", () => {
    expect(familyForProperty("Psat")?.family).toBe("vaporPressure");
    expect(familyForProperty("Z")?.family).toBe("equationOfState");
    expect(familyForProperty("viscosity_liquid")?.family).toBe("transportLiquidVisc");
    expect(familyForProperty("thermal_conductivity_liquid")?.family).toBe("transportLiquidCond");
    expect(familyForProperty("Cp_ig")).toBeNull();
  });

  it("specForModel sets exactly one family slot (EOS / transport)", () => {
    expect(specForModel(base, "equationOfState", "PR", ["water"]).equationOfState).toEqual({ model: "PR" });
    expect(specForModel(base, "transportLiquidVisc", "Vogel", ["water"]).transport)
      .toEqual({ liquidViscosity: "Vogel" });
  });

  it("vaporPressure: Antoine keeps the standard; other models overlay per component", () => {
    expect(specForModel(base, "vaporPressure", "Antoine", ["water"])).toBe(base); // unchanged
    const aw = specForModel(base, "vaporPressure", "AmbroseWalton", ["water"]);
    expect(aw.componentFiles?.["constant/components/water.dat"]).toContain("model AmbroseWalton");
  });
});

describe("methodCompare — merge + spread", () => {
  it("merges per-model scan CSVs, keeping the PROPERTY in each header", () => {
    const merged = mergeMethodCsvs([
      { model: "Antoine", csv: "T,Psat\n290,1\n300,2\n" },
      { model: "AmbroseWalton", csv: "T,Psat\n290,1.1\n300,2.2\n" },
    ]);
    // "<prop>__<model>" — the axis keeps Psat (units + log scale), the legend
    // shows the model (split in ScanLinePlot).
    expect(merged.split("\n")[0]).toBe("T,Psat__Antoine,Psat__AmbroseWalton");
    expect(merged.split("\n")[1]).toBe("290,1,1.1");
    expect(merged.split("\n")[2]).toBe("300,2,2.2");
  });

  it("aligns rows by x VALUE — a model dropping a row never shifts curves", () => {
    const merged = mergeMethodCsvs([
      { model: "A", csv: "T,Psat\n290,1\n300,2\n310,3\n" },
      { model: "B", csv: "T,Psat\n300,2.2\n310,3.3\n" },   // 290 row dropped (NaN)
    ]);
    const lines = merged.split("\n");
    expect(lines[0]).toBe("T,Psat__A,Psat__B");
    expect(lines[1]).toBe("290,1,");        // B has no value at 290 — blank, not shifted
    expect(lines[2]).toBe("300,2,2.2");
    expect(lines[3]).toBe("310,3,3.3");
  });

  it("matches x values tolerantly (float formatting differences)", () => {
    const merged = mergeMethodCsvs([
      { model: "A", csv: "T,Psat\n290.0,1\n" },
      { model: "B", csv: "T,Psat\n290,1.1\n" },
    ]);
    const lines = merged.split("\n");
    expect(lines.length).toBe(2);           // one shared abscissa row, not two
    expect(lines[1]).toBe("290.0,1,1.1");
  });

  it("methodSpread reports the max gap (abs + rel%)", () => {
    const s = methodSpread("T,A,B\n290,1,1.1\n300,2,2.4");
    expect(s.absMax).toBeCloseTo(0.4, 6);          // |2.4-2.0| at 300
    expect(s.relMaxPct).toBeCloseTo((0.4 / 2.4) * 100, 4);
  });

  it("methodSpread ignores blank cells (a blank is NOT 0)", () => {
    const s = methodSpread("T,A,B\n290,1,\n300,2,2.4");
    expect(s.absMax).toBeCloseTo(0.4, 6);          // the 290 row has one value — skipped
  });
});
