import { describe, it, expect } from "vitest";
import { synthesizeGridSweepOuterDict, parseGridCsv } from "../src/case/sweepSynth.js";

describe("synthesizeGridSweepOuterDict", () => {
  it("emits a gridSweep with two SI-range parameters", () => {
    const d = synthesizeGridSweepOuterDict({
      a: { targetPath: "units[0].operation.T", from: 355, to: 385, nPoints: 7 },
      b: { targetPath: "units[0].operation.P", from: 50000, to: 200000, nPoints: 7 },
      responses: ["flashDrum.V_over_F"],
      file: "gridsweep_T_P.csv",
    });
    expect(d.type).toBe("gridSweep");
    const params = d.parameters as Array<Record<string, unknown>>;
    expect(params).toHaveLength(2);
    expect(params[0]!.target).toBe("units[0].operation.T");
    expect(params[0]!.range).toEqual([355, 385]);   // raw SI numbers, not unit strings
    expect(params[1]!.range).toEqual([50000, 200000]);
    expect(d.responses).toEqual(["flashDrum.V_over_F"]);
  });
});

describe("parseGridCsv", () => {
  const csv = [
    "point,units[0].operation.T,units[0].operation.P,flashDrum.V_over_F",
    "0,355,50000,1",
    "1,355,100000,0",
    "2,385,50000,1",
    "3,385,100000,nan",
  ].join("\n");

  it("builds a z[bIdx][aIdx] grid and renders 'nan' as an honest NaN hole", () => {
    const g = parseGridCsv(csv, "flashDrum.V_over_F")!;
    expect(g.aVals).toEqual([355, 385]);
    expect(g.bVals).toEqual([50000, 100000]);
    expect(g.z[0]).toEqual([1, 1]);             // b=50000 row
    expect(g.z[1]![0]).toBe(0);                 // (T=355, P=100000)
    expect(Number.isNaN(g.z[1]![1])).toBe(true); // (T=385, P=100000) -> non-converged hole
  });
});
