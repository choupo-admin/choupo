import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import { classifySelection, viewsFor } from "../src/case/exploreViews.js";

// no case-local UNIFAC overrides -> coverage comes from the standard catalogue
const NO_LOCAL = buildLocalUnifac({});
const views = (sel: string[]) => viewsFor(sel, CATALOGUE, NO_LOCAL);

describe("Explore view relevance — only physically-meaningful views are offered", () => {
  it("water+benzene (aqueous-organic): VLE + binary LLE, NEVER psychro/scaling", () => {
    expect(classifySelection(["water", "benzene"], CATALOGUE)).toBe("aqueous-organic");
    const v = views(["water", "benzene"]);
    expect(v.has("txy")).toBe(true);
    expect(v.has("gamma")).toBe(true);
    expect(v.has("binaryLle")).toBe(true);
    // the bug Vítor caught: these must NOT appear for an aqueous-organic pair
    expect(v.has("psychro")).toBe(false);
    expect(v.has("scaling")).toBe(false);
  });

  it("benzene+toluene (organic-mixture): McCabe-Thiele offered (a binary VLE pair)", () => {
    const v = views(["benzene", "toluene"]);
    expect(v.has("txy")).toBe(true);
    expect(v.has("mccabe")).toBe(true);   // shares the T-x-y front door
  });

  it("mccabe is GATED to a binary — never for 1 or 3 components", () => {
    expect(views(["benzene"]).has("mccabe")).toBe(false);              // pure
    expect(views(["benzene", "toluene", "water"]).has("mccabe")).toBe(false); // ternary
  });

  it("water+NaCl (aqueous-electrolyte): scaling, NEVER a VLE T-x-y", () => {
    expect(classifySelection(["water", "NaCl"], CATALOGUE)).toBe("aqueous-electrolyte");
    const v = views(["water", "NaCl"]);
    expect(v.has("scaling")).toBe(true);
    expect(v.has("txy")).toBe(false);
    expect(v.has("psychro")).toBe(false);
  });

  it("N2+water (humid-gas): psychrometrics, NEVER scaling or a VLE T-x-y", () => {
    expect(classifySelection(["N2", "water"], CATALOGUE)).toBe("humid-gas");
    const v = views(["N2", "water"]);
    expect(v.has("psychro")).toBe(true);
    expect(v.has("scaling")).toBe(false);
    expect(v.has("txy")).toBe(false);
  });

  it("water+ethanol+benzene: ternary views, NEVER psychro/scaling", () => {
    const v = views(["water", "ethanol", "benzene"]);
    expect(v.has("ternary")).toBe(true);
    expect(v.has("ternaryLle")).toBe(true);
    expect(v.has("psychro")).toBe(false);
    expect(v.has("scaling")).toBe(false);
  });

  it("pure water: phase + steam, never a binary/mixture view", () => {
    const v = views(["water"]);
    expect(v.has("phase")).toBe(true);
    expect(v.has("steam")).toBe(true);
    expect(v.has("txy")).toBe(false);
    expect(v.has("scaling")).toBe(false);
  });

  it("scan is always offered", () => {
    expect(views(["water"]).has("scan")).toBe(true);
    expect(views(["water", "benzene"]).has("scan")).toBe(true);
  });
});
