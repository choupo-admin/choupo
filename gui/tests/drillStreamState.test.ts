/*---------------------------------------------------------------------------*\
  Drilling into a fractal member must show its stream VALUES (2026-07-08).

  The plant stores stream state sector-OWNED under `0/<SECTOR>/<stream>`.  A
  drilled sector (sectors/BRINE) or nested unit is re-rooted, so a plain
  grab-by-prefix never brings that state and the drilled tab drew blank streams.
  projectRootStreamState pulls the streams the sub-case NAMES from the root 0/.
\*---------------------------------------------------------------------------*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectRootStreamState } from "../src/cases/tutorials.js";
import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

const LP = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..",
  "tutorials", "plant", "lithiumBrinePlant");

// The plant's committed root 0/ keyed as the tutorial registry stores it.
function rootFiles(): { [rel: string]: string } {
  const f: { [rel: string]: string } = {};
  for (const sec of ["BRINE", "EXTRACTION", "CARBONATION", "HOTAIR", "FINISHING"])
    for (const s of ["salarBrine", "halite", "liquor", "organic", "emulsion",
      "raffinate", "loadedOrganic", "carbLiquor", "slurry", "fuelAir", "hotAir",
      "product", "cleanAir", "fines", "humidExhaust"]) {
      try { f[`0/${sec}/${s}`] = readFileSync(join(LP, "0", sec, s), "utf8"); } catch { /**/ }
    }
  return f;
}
const read = (rel: string) => readFileSync(join(LP, rel), "utf8");

describe("projectRootStreamState: drilled member gets its stream state", () => {
  it("BRINE sector: its connection streams carry the root 0/ values", () => {
    const zero = projectRootStreamState(read("sectors/BRINE/system/flowsheetDict"), rootFiles());
    for (const s of ["salarBrine", "halite", "liquor"]) {
      expect(zero[`0/${s}`]).toBeDefined();
      expect(zero[`0/${s}`]).toMatch(/componentMolarFlows/);
    }
  });
  it("crystNaCl unit: its inputs/outputs carry the root 0/ values", () => {
    const zero = projectRootStreamState(
      read("sectors/BRINE/unitOperations/crystNaCl/system/flowsheetDict"), rootFiles());
    expect(zero["0/salarBrine"]).toMatch(/componentMolarFlows/);   // input
    expect(zero["0/liquor"]).toBeDefined();                         // output
  });
  it("EXTRACTION sector: pulls an inlet owned by ANOTHER sector (liquor from BRINE)", () => {
    const zero = projectRootStreamState(read("sectors/EXTRACTION/system/flowsheetDict"), rootFiles());
    for (const s of ["liquor", "organic", "emulsion", "raffinate", "loadedOrganic"])
      expect(zero[`0/${s}`]).toBeDefined();
  });
  it("EXTRACTION sector graph: readComposite shows F/T on EVERY stream, not just feeds", () => {
    const fsText = read("sectors/EXTRACTION/system/flowsheetDict");
    const raw = projectRootStreamState(fsText, rootFiles());
    const g = flowsheetToGraph(toJson(parse(fsText, { sourceName: "e" })) as JsonDict, raw);
    // An outlet + an internal stream must carry real values (F > 0), not blanks.
    for (const s of ["loadedOrganic", "raffinate", "emulsion"]) {
      const spec = g.view.streams[s];
      expect(spec, s).toBeDefined();
      expect(spec!.F, s).toBeGreaterThan(0);
      expect(spec!.T, s).toBeGreaterThan(0);
    }
  });
});

// A boundary inlet RENAMED across the sector boundary (the parent wires stream
// <parentName> to <sector>/<localInlet>): the root 0/ stores the feed under
// <parentName>, so a basename match misses it and the drilled sector re-solves
// UNFED (every stream to zero).  ChemicalPlantTutorial renames its inlets
// (ToConcentration -> DilutedJuice, PlantSteam -> Steam); lithiumBrinePlant does
// not (liquor stays liquor), which is why only this case exposed the bug.
const CP = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..",
  "tutorials", "plant", "ChemicalPlantTutorial");
function walkZero(root: string): { [rel: string]: string } {
  const f: { [rel: string]: string } = {};
  const walk = (dir: string, prefix: string) => {
    for (const nm of readdirSync(dir)) {
      const p = join(dir, nm);
      const rel = prefix ? `${prefix}/${nm}` : nm;
      if (statSync(p).isDirectory()) walk(p, rel);
      else f[`0/${rel}`] = readFileSync(p, "utf8");
    }
  };
  walk(join(root, "0"), "");
  return f;
}

// The case files the projection needs: the root 0/ + the ancestor flowsheetDicts
// (root + sector) so the rename chain can be walked.
function cpFiles(): { [rel: string]: string } {
  const f = walkZero(CP);
  f["system/flowsheetDict"] = readFileSync(join(CP, "system", "flowsheetDict"), "utf8");
  f["CONCENTRATION/system/flowsheetDict"] =
    readFileSync(join(CP, "CONCENTRATION", "system", "flowsheetDict"), "utf8");
  return f;
}
const concFs = readFileSync(join(CP, "CONCENTRATION", "system", "flowsheetDict"), "utf8");
const evap1Fs = readFileSync(join(CP, "CONCENTRATION", "Evap1", "system", "flowsheetDict"), "utf8");

describe("projectRootStreamState: RENAMED boundary inlets (ChemicalPlantTutorial)", () => {
  it("WITHOUT memberDir (basename only), the renamed inlets get NO 0/ (the bug)", () => {
    const zero = projectRootStreamState(concFs, cpFiles());
    expect(zero["0/DilutedJuice"]).toBeUndefined();   // <- ToConcentration, unresolved
    expect(zero["0/Steam"]).toBeUndefined();           // <- PlantSteam, unresolved
    expect(zero["0/Juice1"]).toBeDefined();            // internal matches by basename
  });

  it("SECTOR: with memberDir the renamed inlets resolve one level up", () => {
    const zero = projectRootStreamState(concFs, cpFiles(), "CONCENTRATION");
    expect(zero["0/DilutedJuice"]).toMatch(/componentMolarFlows/);   // <- ToConcentration
    expect(zero["0/Steam"]).toMatch(/componentMolarFlows/);           // <- PlantSteam
    for (const s of ["Juice1", "Vap1", "Syrup", "Magma", "Vap2", "Cond1", "Cond2"])
      expect(zero[`0/${s}`], s).toBeDefined();
    // NO orphans: boundary.outlets labels (Vapour/Condensate1/Condensate2) differ
    // from the edge keys (Vap2/Cond1/Cond2) and would collide with another
    // sector's 0/ by basename -- they must NOT be projected.
    for (const s of ["Vapour", "Condensate1", "Condensate2"])
      expect(zero[`0/${s}`], s).toBeUndefined();
  });

  it("NESTED LEAF: Evap1's inlets resolve TWO levels (Feed <- DilutedJuice <- ToConcentration)", () => {
    const zero = projectRootStreamState(evap1Fs, cpFiles(), "CONCENTRATION/Evap1");
    expect(zero["0/Feed"]).toMatch(/componentMolarFlows/);    // Feed <- DilutedJuice <- ToConcentration
    expect(zero["0/Steam"]).toMatch(/componentMolarFlows/);   // Steam <- Steam <- PlantSteam
    for (const s of ["Juice1", "Vap1", "Cond1"])              // outlets by basename
      expect(zero[`0/${s}`], s).toBeDefined();
  });
});
