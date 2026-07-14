/*---------------------------------------------------------------------------*\
  Drill-in of a dignified leaf unit (F3): opening unitOperations/<u> as a
  sub-case must draw the unit WITH its streams AND their values.  A dignified
  leaf NAMES its streams via `inputs`/`outputs` (sequential-modular); their
  STATE lives in 0/<stream> (the plant run materialised it).  Regression guard:
  after the leaves gained inputs/outputs, readLeaf read only boundary and never
  0/ -> the drilled unit showed no streams and no input values.
\*---------------------------------------------------------------------------*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const UNIT = join(HERE, "..", "..", "tutorials", "steady", "crystallisation",
  "Crystallizer09chatGPT", "unitOperations");

function leaf(u: string): JsonDict {
  return toJson(parse(readFileSync(join(UNIT, u, "system", "flowsheetDict"), "utf8"),
    { sourceName: u })) as JsonDict;
}
const streamData = (g: ReturnType<typeof flowsheetToGraph>, name: string) =>
  (g.nodes.find((n) => n.id === "stream:" + name)?.data as
    { stream?: { F: number; T: number } } | undefined)?.stream;

describe("drill-in draws a dignified leaf's streams (inputs/outputs)", () => {
  it("cryst2: consumes freshEthanol/liquor1/recoveredEthanol, produces KCl_cake/finalLiquor", () => {
    const g = flowsheetToGraph(leaf("cryst2"));
    const u = g.view.units[0]!;
    expect(u.type).toBe("crystalliser");
    for (const s of ["freshEthanol", "liquor1", "recoveredEthanol"]) expect(u.in).toContain(s);
    for (const s of ["KCl_cake", "finalLiquor"]) expect(u.outputs).toContain(s);
    expect(g.nodes.length).toBeGreaterThan(1);   // unit + stream terminals
  });
  it("recovery: consumes finalLiquor, produces recoveredEthanol/stillage", () => {
    const u = flowsheetToGraph(leaf("recovery")).view.units[0]!;
    expect(u.type).toBe("distillationColumn");
    expect(u.in).toContain("finalLiquor");
    for (const s of ["recoveredEthanol", "stillage"]) expect(u.outputs).toContain(s);
  });
  it("reads a feed's state from 0/<stream> (values appear on the drilled unit)", () => {
    // A dignified leaf + its 0/ snapshot: the feed terminal must carry the 0/
    // state (F > 0, T from the file), never a blank 0 K.
    const raw = {
      "0/freshEthanol":
        "componentMolarFlows { ethanol 15 kmol/h; }\nT 298.15 K;\nP 100000 Pa;\n",
    };
    const g = flowsheetToGraph(leaf("cryst2"), raw);
    const fresh = streamData(g, "freshEthanol");
    expect(fresh).toBeDefined();
    expect(fresh!.F).toBeGreaterThan(0);          // read from 0/, not blank
    expect(fresh!.T).toBeCloseTo(298.15, 1);
  });
});
