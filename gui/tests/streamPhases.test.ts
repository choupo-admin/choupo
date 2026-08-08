// The phase decomposition of a stream, from what the engine publishes.
//
// THE CONTRACT (one stream, one semantics; ruled 2026-08-08): the payload's
// F and composition are the OVERALL material, solids included -- exactly
// what converged/<stream> stores.  The decomposition is pure subtraction
// (solid out of the overall, organic out of the fluid, aqueous = the rest),
// so Sigma(phases) == F*x component by component BY CONSTRUCTION.  flash19
// is the living witness: its liquid stream's CaCO3 is dissolved + crystal,
// and both the file and this decomposition say so.

import { describe, expect, it } from "vitest";

import { streamPhases } from "../src/case/streamPhases.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

const base: StreamResult = {
  name: "liquid", role: "product",
  F: 10, T: 313.15, P: 101325,
  composition: { water: 0.9, benzene: 0.08, ethanol: 0.02 },
};

//  A solid-bearing stream on the OVERALL contract: F = 10 kmol/s of which
//  0.02 kmol/s is crystal CaCO3 (2.0 kg/s at MW 100) and 0.18 kmol/s is
//  dissolved CaCO3 -- the composition carries BOTH, as the contract demands.
const withSolid: StreamResult = {
  name: "magma", role: "product",
  F: 10, T: 313.15, P: 101325,
  composition: { water: 0.88, benzene: 0.08, ethanol: 0.02, CaCO3: 0.02 },
  solids: { CaCO3: 2.0 },
};
const MW = { CaCO3: 100.0 };

describe("streamPhases", () => {
  it("says NOTHING when there is one fluid phase and no crystals", () => {
    //  A one-row "decomposition" of the composition already on screen is
    //  noise pretending to be information.
    expect(streamPhases(base)).toEqual([]);
  });

  it("derives the aqueous side by SUBTRACTION, and the two close on the overall", () => {
    const s: StreamResult = { ...base, organicLiquid: { benzene: 0.7, ethanol: 0.05 } };
    const ph = streamPhases(s);
    expect(ph.map((p) => p.name)).toEqual(["aqueous", "organic"]);
    const aq = ph[0]!.flows, org = ph[1]!.flows;
    expect(aq.benzene).toBeCloseTo(10 * 0.08 - 0.7, 12);
    expect(aq.ethanol).toBeCloseTo(10 * 0.02 - 0.05, 12);
    expect(aq.water).toBeCloseTo(9, 12);
    //  Closure, component by component, against the overall it came from.
    for (const c of ["water", "benzene", "ethanol"]) {
      expect((aq[c] ?? 0) + (org[c] ?? 0))
        .toBeCloseTo(10 * (s.composition[c] ?? 0), 12);
    }
  });

  it("takes the solid OUT of the overall, so dissolved and crystal split correctly", () => {
    const ph = streamPhases(withSolid, MW);
    expect(ph.map((p) => p.name)).toEqual(["aqueous", "solid"]);
    const aq = ph[0]!.flows, solid = ph[1]!.flows;
    expect(solid.CaCO3).toBeCloseTo(2.0 / 100.0, 12);          // the crystal
    expect(aq.CaCO3).toBeCloseTo(10 * 0.02 - 0.02, 12);         // the dissolved
    //  THE INVARIANT the 2026-08-08 ruling demands: overall == Sigma phases,
    //  component by component, not merely in the total.
    for (const c of Object.keys(withSolid.composition)) {
      expect((aq[c] ?? 0) + (solid[c] ?? 0))
        .toBeCloseTo(withSolid.F * (withSolid.composition[c] ?? 0), 12);
    }
  });

  it("KEEPS a solid whose molar mass is missing -- visible in kg/s with the reason, never dropped, never the wrong unit", () => {
    //  The rule (Vítor, 2026-08-08): a kg/s must never appear in a kmol/s
    //  column, and the phase must never silently disappear either.  With
    //  no molar mass the subtraction cannot run -- and the reason SAYS the
    //  fluid rows still contain the material.
    const ph = streamPhases(withSolid, {});
    expect(ph.map((p) => p.name)).toEqual(["aqueous", "solid"]);
    const solid = ph[1]!;
    expect(solid.flows).toEqual({});                  // no fake molar value
    expect(solid.total).toBe(0);
    expect(solid.massFlowsKg).toEqual({ CaCO3: 2.0 }); // the material, kg/s
    expect(solid.unavailable).toContain("CaCO3");      // the reason, by name
    expect(solid.unavailable).toContain("kg/s");
    expect(solid.unavailable).toContain("still contain this material");
    //  Unsubtracted: the aqueous CaCO3 row is the OVERALL amount, as the
    //  reason states.
    expect(ph[0]!.flows.CaCO3).toBeCloseTo(0.2, 12);
  });

  it("names all three when a stream carries all three, and the closure holds", () => {
    const s: StreamResult = {
      ...withSolid,
      organicLiquid: { benzene: 0.7 },
    };
    const ph = streamPhases(s, MW);
    expect(ph.map((p) => p.name)).toEqual(["aqueous", "organic", "solid"]);
    const [aq, org, solid] = ph.map((p) => p.flows);
    for (const c of Object.keys(s.composition)) {
      expect((aq![c] ?? 0) + (org![c] ?? 0) + (solid![c] ?? 0))
        .toBeCloseTo(s.F * (s.composition[c] ?? 0), 12);
    }
  });
});
