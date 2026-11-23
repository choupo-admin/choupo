/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/**
 * C481 -- the C266 walk's findings 8 and 9 on the GUI side.
 *
 *  8  a time-integrated run publishes no stream table, so the run header's
 *     products list read "none" although the flowsheet has a product: the
 *     strip now names the graph's own outlets (declaredProductNames).
 *  9  an electricLoad fed by an electrodialysis stack is a RECTIFIER of power
 *     the stack draws, not a generator: its pre-run power stub reads
 *     "electricity", a turbine's generator keeps "electricity (generated)";
 *     and the `current` / `E_electrodes` / `voltage` keys carry A / V.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import { declaredProductNames } from "../src/case/runSummary.js";
import { operationSchemaFor } from "../src/case/operationSchemas.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");

function loadFlowsheet(rel: string): JsonDict {
  const text = readFileSync(join(TUTORIALS, rel, "system", "flowsheetDict"), "utf8");
  return toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
}

describe("declaredProductNames (finding 8)", () => {
  it("ctrl02: the one stream the reactor produces and nothing consumes", () => {
    expect(declaredProductNames(loadFlowsheet("ctrl/ctrl02_disturbance_rejection")))
      .toEqual(["product"]);
  });
  it("a recycle is not a product; a mixer's inputs count as consumed", () => {
    const fs = { units: [
      { name: "A", type: "mixer", inputs: ["feed", "rec"], outputs: ["mid"] },
      { name: "B", type: "splitter", in: "mid", outputs: ["rec", "prod"] },
    ] };
    expect(declaredProductNames(fs)).toEqual(["prod"]);
  });
  it("no flowsheet, no names", () => {
    expect(declaredProductNames(undefined)).toEqual([]);
    expect(declaredProductNames({})).toEqual([]);
  });
});

describe("the rectifier's power stub (finding 9)", () => {
  const stubOf = (g: ReturnType<typeof flowsheetToGraph>, unit: string) =>
    g.nodes.find((n) => n.id === `stub:${unit}:power`
      || (n.data as { ownerUnit?: string; dutyPort?: string }).ownerUnit === unit
        && (n.data as { dutyPort?: string }).dutyPort === "power");

  it("ed01: the rectifier of a stack that DRAWS power is 'electricity'", () => {
    const g = flowsheetToGraph(loadFlowsheet("steady/electrodialysis/ed01_nacl_desalination"));
    const stub = stubOf(g, "rectifier");
    expect(stub).toBeDefined();
    expect((stub!.data as { utilityName?: string }).utilityName).toBe("electricity");
  });
  it("a generator fed by a turbine keeps '(generated)'", () => {
    const g = flowsheetToGraph(loadFlowsheet("steady/power/rankine01_water"));
    const gen = g.view.units.find((u) => u.type === "electricLoad");
    expect(gen).toBeDefined();
    const stub = stubOf(g, gen!.name);
    expect((stub!.data as { utilityName?: string }).utilityName).toBe("electricity (generated)");
  });
});

describe("electrodialysis schema units (finding 9)", () => {
  it.each(["electrodialysisStack", "batchElectrodialysis"])("%s: current in A, voltages in V", (op) => {
    const f = (k: string) => operationSchemaFor(op)?.fields.find((x) => x.key === k)?.unit;
    expect(f("current")).toBe("A");
    expect(f("E_electrodes")).toBe("V");
  });
  it("dynamicCSTR: the jacket's UA in W/K and T_jacket in K", () => {
    const f = (k: string) => operationSchemaFor("dynamicCSTR")?.fields.find((x) => x.key === k)?.unit;
    expect(f("UA")).toBe("W/K");
    expect(f("T_jacket")).toBe("K");
  });
});
