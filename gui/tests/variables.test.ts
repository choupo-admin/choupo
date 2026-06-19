// Tests for case/variables.ts -- the $variable model behind the Variables
// workspace (L0).  Pins the three-role classification (constant / manipulated
// / computed), the $ref use-site scan, and the solved-value overlay.

import { describe, expect, it } from "vitest";

import { buildVariableRows } from "../src/case/variables.js";
import type { CaseFiles } from "../src/case/types.js";
import type { RunResult } from "../src/adapters/SolverAdapter.js";

// A brayton-like case: $W_turb is a DesignSpec unknown, $A a shared constant,
// $W_net a computed expression.
const caseFiles: CaseFiles = {
  thermoPackage: {},
  controlDict: {},
  flowsheet: {
    variables: {
      W_turb: -16000, // SI (-16 kW)
      A: 25, // m^2
      W_net: { compute: "turbine.W_generated - compressor.W_shaft", unit: "kW" },
    },
    units: [
      { name: "turbine", type: "turbine", operation: { W_shaft: "$W_turb", eta: 0.85 } },
      { name: "hx", type: "heatExchanger", operation: { area: "$A" } },
    ],
  },
  outerDict: {
    type: "designSpec",
    manipulate: [{ variable: "W_turb", initial: -16000, min: -50000, max: -1000 }],
  },
  rawFiles: {
    "system/flowsheetDict": "variables\n{\n  W_turb -16.0 kW;\n  A 25 m^2;\n  W_net { compute \"...\"; unit kW; }\n}\n",
  },
};

const run = { computed: { W_net: 580 } } as unknown as RunResult;

describe("buildVariableRows", () => {
  it("classifies the three roles", () => {
    const rows = buildVariableRows(caseFiles, null);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.W_turb!.role).toBe("manipulated");
    expect(byName.A!.role).toBe("constant");
    expect(byName.W_net!.role).toBe("computed");
  });

  it("attaches bounds + owner to the manipulated unknown", () => {
    const rows = buildVariableRows(caseFiles, null);
    const w = rows.find((r) => r.name === "W_turb")!;
    expect(w.owner).toBe("designSpec");
    expect(w.bounds).toEqual({ initial: -16000, min: -50000, max: -1000 });
  });

  it("recovers the authored unit text for scalars from rawFiles", () => {
    const rows = buildVariableRows(caseFiles, null);
    expect(rows.find((r) => r.name === "A")!.declared).toBe("25 m^2");
    expect(rows.find((r) => r.name === "W_turb")!.declared).toBe("-16.0 kW");
  });

  it("captures the compute expression + unit", () => {
    const wn = buildVariableRows(caseFiles, null).find((r) => r.name === "W_net")!;
    expect(wn.expr).toContain("turbine.W_generated");
    expect(wn.unit).toBe("kW");
  });

  it("finds $ref use-sites across units", () => {
    const rows = buildVariableRows(caseFiles, null);
    expect(rows.find((r) => r.name === "W_turb")!.usedIn).toEqual([
      { unit: "turbine", key: "W_shaft" },
    ]);
    expect(rows.find((r) => r.name === "A")!.usedIn).toEqual([
      { unit: "hx", key: "area" },
    ]);
  });

  it("overlays the solved value for computed entries from the run only", () => {
    expect(buildVariableRows(caseFiles, null).find((r) => r.name === "W_net")!.solved)
      .toBeUndefined();
    expect(buildVariableRows(caseFiles, run).find((r) => r.name === "W_net")!.solved)
      .toBe(580);
  });

  it("returns [] for a case with no variables block", () => {
    expect(buildVariableRows({ thermoPackage: {}, controlDict: {} }, null)).toEqual([]);
  });
});
