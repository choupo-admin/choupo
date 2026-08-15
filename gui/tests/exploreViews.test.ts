import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import { classifySelection, viewsFor } from "../src/case/exploreViews.js";

// no case-local UNIFAC overrides -> coverage comes from the standard catalogue
const NO_LOCAL = buildLocalUnifac({});
const views = (sel: string[]) => viewsFor(sel, CATALOGUE, NO_LOCAL);

// McCabe-Thiele and the psychrometric chart LEFT the Explorer 2026-08-15: both
// are METHOD CONSTRUCTIONS and now live in the Methods workspace (their PlotKind
// entries are gone, so "never offered here" is enforced by the type system, not
// by assertions).  classifySelection is untouched — humid-gas still gates the
// VLE views OFF for a carrier-gas pair.

describe("Explore view relevance — only physically-meaningful views are offered", () => {
  it("water+benzene (aqueous-organic): VLE + binary LLE, NEVER scaling", () => {
    expect(classifySelection(["water", "benzene"], CATALOGUE)).toBe("aqueous-organic");
    const v = views(["water", "benzene"]);
    expect(v.has("txy")).toBe(true);
    expect(v.has("gamma")).toBe(true);
    expect(v.has("binaryLle")).toBe(true);
    // the bug Vítor caught: scaling must NOT appear for an aqueous-organic pair
    expect(v.has("scaling")).toBe(false);
  });

  it("benzene+toluene (organic-mixture): the binary VLE family is offered", () => {
    const v = views(["benzene", "toluene"]);
    expect(v.has("txy")).toBe(true);
    expect(v.has("flash")).toBe(true);   // same front door as the T-x-y
    expect(v.has("gamma")).toBe(true);
  });

  it("water+NaCl (aqueous-electrolyte): scaling, NEVER a VLE T-x-y", () => {
    expect(classifySelection(["water", "NaCl"], CATALOGUE)).toBe("aqueous-electrolyte");
    const v = views(["water", "NaCl"]);
    expect(v.has("scaling")).toBe(true);
    expect(v.has("txy")).toBe(false);
  });

  it("N2+water (humid-gas): NEVER scaling or a VLE T-x-y (its chart lives in Methods)", () => {
    expect(classifySelection(["N2", "water"], CATALOGUE)).toBe("humid-gas");
    const v = views(["N2", "water"]);
    expect(v.has("scaling")).toBe(false);
    expect(v.has("txy")).toBe(false);
  });

  it("water+ethanol+benzene: ternary views, NEVER scaling", () => {
    const v = views(["water", "ethanol", "benzene"]);
    expect(v.has("ternary")).toBe(true);
    expect(v.has("ternaryLle")).toBe(true);
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
