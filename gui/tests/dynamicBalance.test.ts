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

  it("engine-declared PARTIAL elements surface as a state with reason", () => {
    const meta = 'key,value\nmaterial_available,1\nelements_available,1\n'
      + 'elements_partial,1\nelements_reason,"petCut (PARTIAL, unaccounted'
      + ' 0.02 kg/kg)"\nenergy_available,0\n';
    const v = dynamicBalanceView(TRAJ, meta);
    expect(v.elementsAvailable).toBe(true);
    expect(v.elementsPartial).toBe(true);
    expect(v.elementsReason).toContain("unaccounted");
    expect(Object.keys(v.elementResiduals).sort()).toEqual(["C", "H"]);
  });

  it("no artefacts -> not present, nothing fabricated", () => {
    const v = dynamicBalanceView(undefined, undefined);
    expect(v.present).toBe(false);
    expect(v.t).toEqual([]);
  });

  it("CAUSAL: meta-only init refusal carries the reason (empty/missing CSV)", () => {
    const meta = 'key,value\nmaterial_available,0\n'
      + 'material_reason,"reactor: the unit does not expose a balance'
      + ' snapshot"\nelements_available,0\nenergy_available,0\n';
    for (const traj of [undefined, ""]) {
      const v = dynamicBalanceView(traj, meta);
      expect(v.present).toBe(false);
      expect(v.materialAvailable).toBe(false);
      expect(v.materialReason).toContain("does not expose");
    }
  });

  it("CAUSAL: the metadata is sovereign -- withheld elements are never drawn"
     + " from a contradictory CSV", () => {
    const v = dynamicBalanceView(TRAJ, META_WITHHELD);   // FULL trajectory
    expect(v.elementsAvailable).toBe(false);
    expect(Object.keys(v.elementResiduals)).toEqual([]);  // columns ignored
    expect(v.present).toBe(true);                         // mass still drawn
  });

  it("CAUSAL: a malformed ELEMENT cell withdraws only the elemental claim"
     + " -- mass stays drawn", () => {
    const bad = TRAJ + "2.0,3.6002e-01,3e-03,2.99e-03,2e-08,"
      + "1.2002e-02,not-a-number,2.4004e-02,8e-10\n";
    const v = dynamicBalanceView(bad, META);
    expect(v.present).toBe(true);
    expect(v.materialAvailable).toBe(true);
    expect(v.t).toEqual([0, 1, 2]);           // the mass series is intact
    expect(v.massResidualKg[2]).toBeCloseTo(2e-8, 12);
    expect(v.elementsAvailable).toBe(false);
    expect(v.elementsReason).toContain("element C");
    expect(Object.keys(v.elementResiduals)).toEqual([]);  // no partial claim
  });

  it("CAUSAL: a header without the mandatory columns is malformed WITH a"
     + " reason", () => {
    const v = dynamicBalanceView("t,foo\n1,2\n", META);
    expect(v.present).toBe(false);
    expect(v.materialAvailable).toBe(false);
    expect(v.malformedReason).toContain("mandatory columns");
  });

  it("CAUSAL: a malformed numeric row withdraws the claim, never a silent"
     + " skip", () => {
    const badRow = TRAJ + "2.0,not-a-number,1e-3,1e-3,0,1e-2,0,2e-2,0\n";
    const v = dynamicBalanceView(badRow, META);
    expect(v.present).toBe(false);
    expect(v.materialAvailable).toBe(false);
    expect(v.malformedReason).toContain("malformed trajectory");
  });
});
