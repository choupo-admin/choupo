/*---------------------------------------------------------------------------*\
  Pinch analysis (acetic-acid case): the composite-curve targets, computed in
  the browser from the run.  Pins the numbers against the reference computation
  + the greyed-until-runnable gate.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { computePinch, canComputePinch } from "../src/case/pinch.js";

const runResult = {
  status: "done", log: "", streams: [
    { name: "ReactorOut", F: 1, T: 450, P: 2e5, composition: {} },
    { name: "CrudeAcid", F: 1, T: 330, P: 2e5, composition: {} },
    { name: "OffGas", F: 1, T: 330, P: 2e5, composition: {} },
  ],
  kpis: {
    PreheatCO: { Q_kW: 303.7, T_in: 298.15, T_out: 450 },
    PreheatMeoh: { Q_kW: 406.81, T_in: 306.43, T_out: 450 },
    Column: { Q_reboiler_kW: 889.56, Q_condenser_kW: -756.56, T_top: 337.97, T_bottom: 371.91 },
    Flash: { Q_kW: -466.72 },
  },
} as never;
const flowsheet = { units: [
  { name: "PreheatCO", type: "heater", in: "freshCO", outputs: ["HotCO"] },
  { name: "PreheatMeoh", type: "heater", in: "MeohMix", outputs: ["HotMethanol"] },
  { name: "Column", type: "distillationColumn", in: "CrudeAcid", outputs: ["MeohRecycle", "Product"] },
  { name: "Flash", type: "isothermalFlash", in: "ReactorOut", outputs: ["CrudeAcid", "OffGas"] },
] } as never;

describe("pinch", () => {
  it("computes the minimum utility targets (dTmin = 10 K)", () => {
    const p = computePinch(runResult, flowsheet, 10)!;
    expect(p.QhMin).toBeCloseTo(1043.7, 0);
    expect(p.QcMin).toBeCloseTo(666.9, 0);
    expect(p.QhNow).toBeCloseTo(1600.1, 0);
    expect(p.QcNow).toBeCloseTo(1223.3, 0);
    // Grand composite curve: present, and it touches H=0 at the pinch
    expect(p.gcc.length).toBeGreaterThan(2);
    expect(p.pinchShift).not.toBeNull();
    expect(Math.min(...p.gcc.map(([h]) => Math.abs(h)))).toBeCloseTo(0, 3);
  });

  it("derives a duty's T-range from its streams when kpis lack T_in/T_out", () => {
    const flash = computePinch(runResult, flowsheet, 10)!.streams.find((s) => s.unit === "Flash")!;
    expect(flash.kind).toBe("hot"); expect(flash.Ts).toBe(450); expect(flash.Tt).toBe(330);
  });

  it("suggests feasible matches and rejects the infeasible one", () => {
    const m = computePinch(runResult, flowsheet, 10)!.matches;
    // the hot Flash stream can heat a cold preheater
    expect(m.some((x) => x.hot === "Flash" && x.cold === "PreheatMeoh")).toBe(true);
    // the condenser (337 K) is COLDER than the reboiler (372 K) -> never a match
    expect(m.some((x) => x.hot === "Column.condenser" && x.cold === "Column.reboiler")).toBe(false);
  });

  it("is greyed (not computable) before a run / with no duties", () => {
    expect(canComputePinch(null, flowsheet)).toBe(false);
    expect(canComputePinch({ status: "done", log: "", streams: [], kpis: {} } as never, flowsheet)).toBe(false);
  });
});
