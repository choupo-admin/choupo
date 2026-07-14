import { describe, expect, it } from "vitest";

import { energyBalance, unitEnergy } from "../src/case/balances.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

// flash01_benzene_toluene at 370 K, 1 bar (the run we verified by hand).
const mk = (role: "feed" | "product", F: number, H: number): StreamResult =>
  ({ role, F, T: 370, P: 1e5, vf: 0, H, F_mass: 1, composition: {} } as unknown as StreamResult);

const streams = [
  mk("feed", 0.0277777777778, 37806.9886153),
  mk("product", 0.019333789635, 35463.0124033),
  mk("product", 0.00844398814279, 75810.366455),
];

describe("energyBalance — first-law closure with unit duties", () => {
  it("streams ALONE do not close (Δ = −Q, the isothermal-flash duty)", () => {
    const eb = energyBalance(streams);
    expect(eb.inKw).toBeCloseTo(1050.2, 0);
    expect(eb.outKw).toBeCloseTo(1325.8, 0);
    expect(eb.delta).toBeCloseTo(-275.6, 0);   // exactly the duty, missing
    expect(eb.closureErr).toBeGreaterThan(0.1); // ~21% — looks "broken"
  });

  it("CLOSES once the heat duty is counted (H_in + Q = H_out)", () => {
    const eb = energyBalance(streams, { heatKw: 275.582128873, workKw: 0 });
    expect(Math.abs(eb.delta)).toBeLessThan(0.5);   // ≈ 0 kW
    expect(eb.closureErr).toBeLessThan(0.01);       // < 1 %
    expect(eb.heatKw).toBeCloseTo(275.6, 0);
  });
});

describe("energyBalance — adiabatic flash uses the published enthalpy surface", () => {
  it("closes directly from feed and product H_kW", () => {
    const adiabatic = [
      { ...mk("feed", 0.0277777777778, 39290.5886153), H_kW: 1091.40523931 },
      { ...mk("product", 0.0263366357393, 37200.5118908), H_kW: 979.736330984 },
      { ...mk("product", 0.00144114203845, 77486.3584064), H_kW: 111.668848506 },
    ];
    const eb = energyBalance(adiabatic);
    expect(Math.abs(eb.delta)).toBeLessThan(0.001);
    expect(eb.closureErr).toBeLessThan(1e-6);
  });
});

describe("unitEnergy — heat from utilityAllocation, work from kpis", () => {
  it("nets heating − cooling and signs shaft work", () => {
    const e = unitEnergy(
      [{ tier: "heating", duty_kW: 275.582 }, { tier: "cooling", duty_kW: 40 }],
      { comp1: { W_shaft_kW: 12.5 }, turb1: { W_shaft_kW: -5 } },
    );
    expect(e.heatAddedKw).toBeCloseTo(275.582, 3);   // heating, on the INPUTS side
    expect(e.heatRemovedKw).toBeCloseTo(40, 3);       // cooling (the cold), OUTPUTS side
    expect(e.workKw).toBeCloseTo(7.5, 6);      // +12.5 (compressor) − 5 (turbine)
  });

  it("empty inputs → zero", () => {
    expect(unitEnergy(undefined, undefined)).toEqual({ heatAddedKw: 0, heatRemovedKw: 0, workKw: 0 });
  });
});
