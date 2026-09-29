import { describe, expect, it } from "vitest";

import { CATALOGUE, canonicalName, type ComponentMeta, formulaIfDistinct, metaByName, rawRecordFor, searchCatalogue } from "../src/case/catalogue.js";

const mk = (name: string, formula: string): ComponentMeta =>
  ({ name, formula, kind: "volatile", vleAble: true, isElectrolyte: false, isPermanentGas: false, isSynthetic: false, aliases: [], hasThermochem: false, isPureSolid: false, hasUnifac: false, unifacGroups: [], deltaAble: false, isRadical: false, isSaltOrMineral: false, isCombustion: false, isRoomTemperatureGas: false });

describe("standard component catalogue (Property Explorer browser)", () => {
  it("harvests the standard components from data/standards/components/*.dat", () => {
    expect(CATALOGUE.length).toBeGreaterThan(40);
    expect(CATALOGUE.every((m) => m.name.length > 0)).toBe(true);
    // sorted by name
    const names = CATALOGUE.map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("classifies VLE-able vs not from the data, not a hardcoded list", () => {
    const benzene = metaByName("benzene");
    expect(benzene).toBeDefined();
    expect(benzene!.vleAble).toBe(true);
    expect(benzene!.formula).toBe("C6H6");
    expect(benzene!.kind).toBe("volatile");
    // a nonvolatile solute (if present) is not VLE-able
    const nacl = metaByName("NaCl");
    if (nacl) {
      expect(nacl.vleAble).toBe(false);
      expect(nacl.kind).toBe("nonvolatile");
    }
  });

  it("finds a component by the alias its own record declares, as the engine does", () => {
    // O2.dat declares `aliases ( oxygen );` -- the same line the engine's
    // ALIASES index is generated from.  Vitor searched for "oxygen" on the
    // live site (2026-09-27) and found nothing: the search read name + formula.
    const o2 = metaByName("O2");
    expect(o2).toBeDefined();
    expect(o2!.aliases).toContain("oxygen");
    expect(searchCatalogue("oxygen").map((m) => m.name)).toContain("O2");
    expect(canonicalName("oxygen")).toBe("O2");
    expect(rawRecordFor("oxygen")).toBe(rawRecordFor("O2"));
    // exact name wins, and an unknown token comes back unchanged
    expect(canonicalName("O2")).toBe("O2");
    expect(canonicalName("noSuchThing")).toBe("noSuchThing");
    expect(rawRecordFor("noSuchThing")).toBeNull();
  });

  it("formulaIfDistinct hides a formula that merely repeats the name", () => {
    // distinct formula -> shown
    expect(formulaIfDistinct(mk("benzene", "C6H6"))).toBe("C6H6");
    expect(formulaIfDistinct(mk("water", "H2O"))).toBe("H2O");
    expect(formulaIfDistinct(mk("nHexane", "C6H14"))).toBe("C6H14");
    // name IS the formula (elements / simple species) -> collapse to one label
    expect(formulaIfDistinct(mk("He", "He"))).toBeNull();
    expect(formulaIfDistinct(mk("N2", "N2"))).toBeNull();
    // comparison is case- and whitespace-insensitive
    expect(formulaIfDistinct(mk("co2", "CO2"))).toBeNull();
    expect(formulaIfDistinct(mk("Ar", " Ar "))).toBeNull();
    // no formula at all -> nothing to show
    expect(formulaIfDistinct(mk("mystery", ""))).toBeNull();
  });

  it("search filters by name and formula", () => {
    expect(searchCatalogue("benz").some((m) => m.name === "benzene")).toBe(true);
    expect(searchCatalogue("C6H6").some((m) => m.name === "benzene")).toBe(true);
    expect(searchCatalogue("zzzznope")).toHaveLength(0);
    expect(searchCatalogue("")).toHaveLength(CATALOGUE.length);
  });
});
