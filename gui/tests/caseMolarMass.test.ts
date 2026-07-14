import { describe, expect, it } from "vitest";
import { caseMolarMass, meanMolarMass } from "../src/case/caseMolarMass.js";

describe("caseMolarMass", () => {
  it("parses MW from component .dat files in rawFiles", () => {
    const raw = {
      "constant/components/water.dat": "role solvent;\nMW          18.015;\nTc 647;",
      "constant/components/sucrose.dat": "MW  342.30 ;",
      "constant/propertyData/components/N2.dat": "MW 28.0134;",
      "system/flowsheetDict": "sectors ( A );",   // ignored (not a component file)
    };
    const mw = caseMolarMass(raw);
    expect(mw.water).toBeCloseTo(18.015, 3);
    expect(mw.sucrose).toBeCloseTo(342.30, 2);
    expect(mw.N2).toBeCloseTo(28.0134, 4);
    expect(Object.keys(mw)).toHaveLength(3);
  });

  it("meanMolarMass weights by mole fraction, 0 when coverage is incomplete", () => {
    const mw = { water: 18.015, sucrose: 342.30 };
    // full coverage -> weighted mean
    expect(meanMolarMass({ water: 0.7, sucrose: 0.3 }, mw))
      .toBeCloseTo(0.7 * 18.015 + 0.3 * 342.30, 3);
    // a component whose MW is unknown leaves coverage < 1 -> 0 (honest fallback)
    expect(meanMolarMass({ water: 0.7, mystery: 0.3 }, mw)).toBe(0);
    // pure known component
    expect(meanMolarMass({ water: 1 }, mw)).toBeCloseTo(18.015, 3);
  });

  it("empty when there are no component files", () => {
    expect(caseMolarMass({ "system/controlDict": "application choupoSolve;" })).toEqual({});
    expect(caseMolarMass(undefined)).toEqual({});
  });
});
