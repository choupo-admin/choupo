/*---------------------------------------------------------------------------*\
  Named-edge grammar rendering test (stream-state architecture, 2026-07-06).

  The lithiumBrinePlant migrated to NAMED graph edges
  (`connections { liquor { from BRINE/liquor; to EXTRACTION/liquor; } }`) with
  NO `boundary {}` -- role inferred from edge shape.  The GUI's readComposite
  must draw it (it crashed before: readComposite read `connections` as a list
  and required `boundary`).  This pins the fix: the umbrella renders its five
  sectors wired by the edge-named streams, no throw.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import { globalStreamNumbering } from "../src/case/streamNumbering.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");

function loadFlowsheet(rel: string): JsonDict {
  const text = readFileSync(
    join(TUTORIALS, rel, "system", "flowsheetDict"),
    "utf8",
  );
  return toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
}

// The sub-sector flowsheetDicts, keyed as globalStreamNumbering expects.
function sectorRawFiles(rel: string, sectors: string[]): { [k: string]: string } {
  const raw: { [k: string]: string } = {};
  for (const s of sectors)
    raw[`sectors/${s}/system/flowsheetDict`] = readFileSync(
      join(TUTORIALS, rel, "sectors", s, "system", "flowsheetDict"), "utf8");
  return raw;
}

describe("named-edge composite rendering (lithiumBrinePlant)", () => {
  it("draws the umbrella's five sectors + edge-named streams without throwing", () => {
    const g = flowsheetToGraph(loadFlowsheet("plant/lithiumBrinePlant"));
    const names = new Set(g.view.units.map((u) => u.name));
    for (const sec of ["BRINE", "EXTRACTION", "CARBONATION", "HOTAIR", "FINISHING"])
      expect(names.has(sec)).toBe(true);

    // The stream identity is the EDGE name: BRINE produces `liquor` + `halite`,
    // EXTRACTION consumes `liquor`.  A port (drySolid) is never a stream node.
    const brine = g.view.units.find((u) => u.name === "BRINE")!;
    expect(brine.outputs).toContain("liquor");
    expect(brine.outputs).toContain("halite");
    const extraction = g.view.units.find((u) => u.name === "EXTRACTION")!;
    expect(extraction.in).toContain("liquor");
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("assigns absolute stream numbers over the named-edge tree (no throw)", () => {
    // This was the second render crash: globalStreamNumbering walked
    // `connections` as a list.  It must union the named edges across levels
    // (the root `liquor` edge == EXTRACTION's own `liquor` edge -> one number).
    const root = loadFlowsheet("plant/lithiumBrinePlant");
    const raw = sectorRawFiles("plant/lithiumBrinePlant",
      ["BRINE", "EXTRACTION", "CARBONATION", "HOTAIR", "FINISHING"]);
    const numberOf = globalStreamNumbering(root, raw);
    const liquor = numberOf("", "liquor");
    expect(typeof liquor).toBe("number");
    // The SAME physical stream inside EXTRACTION shares the number (cross-level).
    expect(numberOf("EXTRACTION", "liquor")).toBe(liquor);
  });
});
