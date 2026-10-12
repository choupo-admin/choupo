//  C68 (2026-10-12): the ammonia cases were renamed by purpose, and a link
//  somebody had already shared (`?case=plant/greenAmmoniaFeasibility`) must
//  keep opening the case.  tutorials/ALIASES is the ONE home of the mapping;
//  these tests hold the map to the tree and the resolver to the map, and
//  require that an alias is never a second case.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CASE_ALIASES, TUTORIALS, canonicalCaseName, parseCaseAliases, tutorialByName,
} from "../src/cases/tutorials.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUT = join(HERE, "..", "..", "tutorials");
const isCaseDir = (rel: string) => {
  const p = join(TUT, rel);
  return existsSync(p) && statSync(p).isDirectory() && existsSync(join(p, "system", "controlDict"));
};

describe("tutorials/ALIASES -- a renamed case keeps its shared links", () => {
  const fromDisk = parseCaseAliases(readFileSync(join(TUT, "ALIASES"), "utf8"));

  it("the GUI reads the same map the file declares (one home)", () => {
    expect(CASE_ALIASES).toEqual(fromDisk);
    expect(Object.keys(fromDisk).length).toBeGreaterThanOrEqual(8);
  });

  it("every alias names a case that EXISTS, and no former name is a directory again", () => {
    for (const [oldName, newName] of Object.entries(fromDisk)) {
      expect(isCaseDir(newName), `${oldName} -> ${newName}: the target is not a case`).toBe(true);
      expect(existsSync(join(TUT, oldName)), `${oldName} is a directory again: an alias must never be a second case`).toBe(false);
      expect(fromDisk[newName], `${newName} is itself aliased (a chain)`).toBeUndefined();
    }
  });

  it("an alias is never listed: the case index carries canonical names only", () => {
    const names = new Set(TUTORIALS.map((t) => t.name));
    for (const [oldName, newName] of Object.entries(fromDisk)) {
      expect(names.has(oldName)).toBe(false);
      expect(names.has(newName)).toBe(true);
    }
  });

  it("a former name opens the renamed case, under its canonical name", () => {
    const t = tutorialByName("plant/greenAmmoniaFeasibility");
    expect(t?.name).toBe("plant/greenAmmonia02_feasibility150bar");
    expect(tutorialByName("plant/ammoniaStaged04_kinetic")?.name)
      .toBe("plant/ammoniaReactor04_kineticSizing");
    // the 50 bar name is not swallowed by the 150 bar prefix
    expect(canonicalCaseName("plant/greenAmmoniaFeasibility50bar"))
      .toBe("plant/greenAmmonia02_feasibility50bar");
  });

  it("a drilled sub-node of an aliased case resolves through its root", () => {
    expect(canonicalCaseName("plant/greenAmmoniaIndustrialN2/Converter"))
      .toBe("plant/greenAmmoniaPEQ_baseCase/Converter");
    expect(tutorialByName("plant/greenAmmoniaIndustrialN2/Converter")).toBe(
      tutorialByName("plant/greenAmmoniaPEQ_baseCase/Converter"));
  });

  it("a name that is not aliased is left alone", () => {
    expect(canonicalCaseName("plant/ChemicalPlantTutorial")).toBe("plant/ChemicalPlantTutorial");
    expect(canonicalCaseName("plant/greenAmmoniaFeasibilityX")).toBe("plant/greenAmmoniaFeasibilityX");
  });

  it("a malformed line refuses rather than being skipped", () => {
    expect(() => parseCaseAliases("a b c\n")).toThrow(/malformed/);
  });
});
