/*---------------------------------------------------------------------------*\
  Drilling into a fractal member must show its stream VALUES (2026-07-08).

  The plant stores stream state sector-OWNED under `0/<SECTOR>/<stream>`.  A
  drilled sector (sectors/BRINE) or nested unit is re-rooted, so a plain
  grab-by-prefix never brings that state and the drilled tab drew blank streams.
  projectRootStreamState pulls the streams the sub-case NAMES from the root 0/.
\*---------------------------------------------------------------------------*/
import { readFileSync } from "node:fs";
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
