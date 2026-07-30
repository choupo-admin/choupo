// The phase decomposition of a stream, from what the engine publishes.
//
// flash19 carries four phases at once -- vapour, speciated aqueous,
// benzene-rich organic, solid calcite -- and the payload named only the
// solid, so the GUI could not show what the case is ABOUT.  The engine now
// publishes the organic side; the aqueous is the fluid MINUS it, by
// subtraction, exactly as the stream file stores it.

import { describe, expect, it } from "vitest";

import { streamPhases } from "../src/case/streamPhases.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

const base: StreamResult = {
  name: "liquid", role: "product",
  F: 10, T: 313.15, P: 101325,
  composition: { water: 0.9, benzene: 0.08, ethanol: 0.02 },
};

describe("streamPhases", () => {
  it("says NOTHING when there is one fluid phase and no crystals", () => {
    //  A one-row "decomposition" of the composition already on screen is
    //  noise pretending to be information.
    expect(streamPhases(base)).toEqual([]);
  });

  it("derives the aqueous side by SUBTRACTION, and the two close on the fluid", () => {
    const s: StreamResult = { ...base, organicLiquid: { benzene: 0.7, ethanol: 0.05 } };
    const ph = streamPhases(s);
    expect(ph.map((p) => p.name)).toEqual(["aqueous", "organic"]);
    const aq = ph[0]!.flows, org = ph[1]!.flows;
    expect(aq.benzene).toBeCloseTo(10 * 0.08 - 0.7, 12);
    expect(aq.ethanol).toBeCloseTo(10 * 0.02 - 0.05, 12);
    expect(aq.water).toBeCloseTo(9, 12);
    //  Closure, component by component, against the fluid it came from.
    for (const c of ["water", "benzene", "ethanol"]) {
      expect((aq[c] ?? 0) + (org[c] ?? 0))
        .toBeCloseTo(10 * (s.composition[c] ?? 0), 12);
    }
  });

  it("converts the solid from kg/s with the payload's molar masses", () => {
    const s: StreamResult = { ...base, solids: { CaCO3: 2.0 } };
    const ph = streamPhases(s, { CaCO3: 100.0869 });
    expect(ph.map((p) => p.name)).toEqual(["aqueous", "solid"]);
    expect(ph[1]!.flows.CaCO3).toBeCloseTo(2.0 / 100.0869, 12);
  });

  it("DROPS the solid rather than show a kg/s in a kmol/s column", () => {
    const s: StreamResult = { ...base, solids: { CaCO3: 2.0 } };
    expect(streamPhases(s, {}).map((p) => p.name)).toEqual(["aqueous"]);
  });

  it("names all three when a stream carries all three", () => {
    const s: StreamResult = {
      ...base,
      organicLiquid: { benzene: 0.7 },
      solids: { CaCO3: 1.0 },
    };
    expect(streamPhases(s, { CaCO3: 100.0869 }).map((p) => p.name))
      .toEqual(["aqueous", "organic", "solid"]);
  });
});
