/*---------------------------------------------------------------------------*\
  Shared 1-unit clone synthesis (src/ui/unitFocus.ts synthesizeUnitClone) --
  the SAME clone rides both unit pop-outs (focus mini-flowsheet + internals
  What-if tab), so its contract is pinned here:

    - 1-unit flowsheet: the unit + its inlets as feeds, nothing else;
    - inlet conditions FROZEN from the parent run (F/T/P + molarComposition),
      falling back to the authored stream block pre-run;
    - `$variable` operation values resolved to their converged values from
      the unit's KPIs;
    - constant/ overlays (extraFiles) + reactions ride along; the outerDict
      does NOT (its DesignSpec is already resolved into the operation);
    - the internals payload (kpis / profile / in+out streams) is captured.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import type { RunResult } from "../src/adapters/SolverAdapter.js";
import type { CaseFiles } from "../src/case/types.js";
import { synthesizeUnitClone } from "../src/ui/unitFocus.js";

const caseFiles = {
  controlDict: { application: "choupoSolve" },
  thermoPackage: { components: ["benzene", "toluene"] },
  flowsheet: {
    streams: {
      feed: { F: 1, T: 300, P: 1e5, molarComposition: { benzene: 0.5, toluene: 0.5 } },
    },
    units: [
      {
        name: "heater1", type: "heater", in: "feed", outputs: ["hot"],
        operation: { Q: "$Q_spec", P: 2e5 },
      },
      {
        name: "flash1", type: "flash", in: "hot", outputs: ["vap", "liq"],
        operation: { T: 350, P: 1e5 },
      },
    ],
  },
  reactions: { rxn1: { stoichiometry: [] } },
  outerDict: { type: "designSpec" },
  extraFiles: { "constant/components/benzene.dat": "// sample-specific" },
} as unknown as CaseFiles;

const runResult = {
  status: "done",
  log: "",
  convergence: [],
  streams: [
    { name: "hot", role: "intermediate", F: 1, T: 340, P: 2e5, composition: { benzene: 0.5, toluene: 0.5 } },
    { name: "vap", role: "product", F: 0.4, T: 350, P: 1e5, vf: 1, composition: { benzene: 0.8, toluene: 0.2 } },
    { name: "liq", role: "product", F: 0.6, T: 350, P: 1e5, vf: 0, composition: { benzene: 0.3, toluene: 0.7 } },
  ],
  kpis: {
    heater1: { Q: 1234.5 },
    flash1: { V_over_F: 0.4, Q_kW: 0 },
  },
  profiles: [],
} as unknown as RunResult;

describe("synthesizeUnitClone", () => {
  it("builds a self-contained 1-unit case with inlets FROZEN from the run", () => {
    const c = synthesizeUnitClone(caseFiles, runResult, "flash1")!;
    expect(c).not.toBeNull();
    const fs = c.files.flowsheet as { units: Array<{ name: string }>; streams: Record<string, unknown> };
    expect(fs.units).toHaveLength(1);
    expect(fs.units[0]!.name).toBe("flash1");
    // The inlet "hot" carries the parent run's converged conditions.
    expect(fs.streams["hot"]).toEqual({
      F: 1, T: 340, P: 2e5,
      molarComposition: { benzene: 0.5, toluene: 0.5 },
    });
    // Only the unit's inlets become feeds -- nothing else.
    expect(Object.keys(fs.streams)).toEqual(["hot"]);
  });

  it("resolves $variable operation values from the unit's KPIs", () => {
    const c = synthesizeUnitClone(caseFiles, runResult, "heater1")!;
    expect(c.operation["Q"]).toBe(1234.5);   // $Q_spec -> converged value
    expect(c.operation["P"]).toBe(2e5);      // plain scalars untouched
    // The clone's unit carries the RESOLVED operation.
    const fs = c.files.flowsheet as { units: Array<{ operation: Record<string, unknown> }> };
    expect(fs.units[0]!.operation["Q"]).toBe(1234.5);
  });

  it("falls back to the authored stream block when the run has no inlet", () => {
    const c = synthesizeUnitClone(caseFiles, null, "heater1")!;
    const fs = c.files.flowsheet as { streams: Record<string, unknown> };
    // Pre-run: "feed" is not in any run result -> the authored block rides.
    expect(fs.streams["feed"]).toEqual({
      F: 1, T: 300, P: 1e5, molarComposition: { benzene: 0.5, toluene: 0.5 },
    });
    // And the $var stays unresolved (no KPIs to resolve it from).
    expect(c.operation["Q"]).toBe("$Q_spec");
  });

  it("carries reactions + extraFiles, NEVER the outerDict", () => {
    const c = synthesizeUnitClone(caseFiles, runResult, "flash1")!;
    expect(c.files.reactions).toEqual(caseFiles.reactions);
    expect(c.files.extraFiles).toEqual(caseFiles.extraFiles);
    expect(c.files.outerDict).toBeUndefined();
  });

  it("captures the internals payload (kpis, in/out streams)", () => {
    const c = synthesizeUnitClone(caseFiles, runResult, "flash1")!;
    expect(c.kpis).toEqual({ V_over_F: 0.4, Q_kW: 0 });
    expect(c.inStreams.map((s) => s.name)).toEqual(["hot"]);
    expect(c.outStreams.map((s) => s.name)).toEqual(["vap", "liq"]);
    expect(c.type).toBe("flash");
  });

  it("returns null for an unknown unit", () => {
    expect(synthesizeUnitClone(caseFiles, runResult, "nope")).toBeNull();
  });
});
