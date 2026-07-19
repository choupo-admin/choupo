/*---------------------------------------------------------------------------*\
  dynamicBalance tests -- the pure parser of the engine's ctrl balance
  artefacts.  The states are the engine's: a withheld claim stays withheld
  (never a fabricated zero), and the wide element columns ride with their
  symbols.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { dynamicBalanceView } from "../src/case/dynamicBalance.js";

const TRAJ = `t,mass_inventory_kg,mass_in_cum_kg,mass_out_cum_kg,mass_residual_kg,elem_C_inventory_kmolatom,elem_C_residual_kmolatom,elem_H_inventory_kmolatom,elem_H_residual_kmolatom
0.000000000e+00,3.600000000e-01,0,0,0,1.200000000e-02,0,2.400000000e-02,0
1.000000000e+00,3.600100000e-01,1.5e-03,1.49e-03,1.0e-08,1.200100000e-02,2.0e-10,2.400200000e-02,4.0e-10
`;

const META = `key,value
material_available,1
elements_available,1
energy_available,0
energy_reason,"the dynamicCSTR energy equation is a Cp/convective model"
`;

const META_WITHHELD = `key,value
material_available,1
elements_available,0
elements_reason,"compA (formula 'A': 'A' is not an element)"
energy_available,0
energy_reason,"model"
`;

describe("dynamicBalanceView", () => {
  it("parses the wide trajectory: mass + per-element residual series", () => {
    const v = dynamicBalanceView(TRAJ, META);
    expect(v.present).toBe(true);
    expect(v.materialAvailable).toBe(true);
    expect(v.t).toEqual([0, 1]);
    expect(v.massResidualKg[1]).toBeCloseTo(1e-8, 12);
    expect(Object.keys(v.elementResiduals).sort()).toEqual(["C", "H"]);
    expect(v.elementResiduals["H"]![1]).toBeCloseTo(4e-10, 14);
    // the initial row starts the plot at t = start, all-zero residuals
    expect(v.massResidualKg[0]).toBe(0);
  });

  it("energy stays a named refusal, never a series of zeros", () => {
    const v = dynamicBalanceView(TRAJ, META);
    expect(v.energyAvailable).toBe(false);
    expect(v.energyReason).toContain("Cp/convective");
  });

  it("withheld elements stay withheld with the species named", () => {
    const v = dynamicBalanceView(TRAJ.split("\n").map(
      (l) => l.split(",").slice(0, 5).join(",")).join("\n"), META_WITHHELD);
    expect(v.elementsAvailable).toBe(false);
    expect(v.elementsReason).toContain("compA");
    expect(Object.keys(v.elementResiduals)).toEqual([]);
  });

  it("no artefacts -> not present, nothing fabricated", () => {
    const v = dynamicBalanceView(undefined, undefined);
    expect(v.present).toBe(false);
    expect(v.t).toEqual([]);
  });
});
