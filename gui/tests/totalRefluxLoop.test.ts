/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */
/*---------------------------------------------------------------------------*\
  The internal loop of a column at TOTAL REFLUX (DEV.md 4c C404).

  Held here:
    * every shipped case that declares a `totalReflux` block is recognised, and
      a column without one, and any other unit type, is not;
    * the loop is a drawing in the node, never a graph member: the flowsheet
      graph of ratebased04 still holds ONE unit and no material stream;
    * the label, the three arrows and the declared composition are in the
      rendered markup, and the detail chip hides the numbers but not the label;
    * AFTER a run the numbers the loop shows are the engine's own published
      KPIs -- the three witnesses are this tree's engine's run logs (generated
      by witnessSetup.ts, never committed), and each row's `value` is compared
      to the KPI of the result block with `toBe`, never recomputed.
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { extractStructured } from "../src/adapters/WasmAdapter.js";
import { parse, toJson, type JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import {
  PUBLISHED, TOTAL_REFLUX_LABEL, isTotalRefluxColumn, loopRows, totalRefluxLoop,
  type LoopArrow,
} from "../src/case/totalRefluxLoop.js";
import type { CaseFiles, UnitSpec } from "../src/case/types.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";
import { TotalRefluxLoop } from "../src/ui/TotalRefluxLoop.js";
import { REPO } from "./witnessOutputs.js";
import { witnessOutput } from "./witnessRead.js";

const DISTILLATION = join(REPO, "tutorials", "steady", "distillation");
const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };

function loadUnit(caseName: string): UnitSpec {
  const text = readFileSync(join(DISTILLATION, caseName, "system", "flowsheetDict"), "utf8");
  const dict = toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
  const g = flowsheetToGraph(dict);
  return g.view.units[0]!;
}

function render(loop: NonNullable<ReturnType<typeof totalRefluxLoop>>, showDetails = true): string {
  return renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(TotalRefluxLoop, { loop, prefs: DEFAULT_PREFS, showDetails })));
}

describe("which columns draw the loop", () => {
  //  by the BLOCK, as the drawing does -- not by the family's name
  const cases = readdirSync(DISTILLATION).filter((n) => {
    try {
      return /^\s*totalReflux\s*$/m.test(
        readFileSync(join(DISTILLATION, n, "system", "flowsheetDict"), "utf8"));
    } catch { return false; }
  });

  it("finds the shipped total-reflux families", () => {
    expect(cases.length).toBeGreaterThanOrEqual(17);
  });

  it("every one of them declares totalReflux and draws the loop, before any run", () => {
    for (const c of cases) {
      const unit = loadUnit(c);
      const loop = totalRefluxLoop(unit);
      expect(loop, c).not.toBeNull();
      expect(loop!.label).toBe("total reflux: no feed, no product");
      expect(loop!.after, c).toBeNull();
      expect(loop!.declared, c).not.toBeNull();
      expect(loop!.declared!.end).toBe("reboiler");
      const total = loop!.declared!.composition.reduce((s, r) => s + r.x, 0);
      expect(total).toBeGreaterThan(0.99);
      expect(total).toBeLessThan(1.01);
    }
  });

  it("an ordinary column, and a non-column carrying the word, draw nothing", () => {
    const ordinary: UnitSpec = {
      name: "col", type: "distillationColumn", in: ["feed"], outputs: ["distillate", "bottoms"],
      operation: { nStages: 10, refluxRatio: 2 },
    } as UnitSpec;
    expect(isTotalRefluxColumn(ordinary)).toBe(false);
    expect(totalRefluxLoop(ordinary)).toBeNull();
    const other = { ...ordinary, type: "heater", operation: { totalReflux: { composition: { a: 1 } } } } as UnitSpec;
    expect(totalRefluxLoop(other)).toBeNull();
    //  a column's model word is not the test: `rateBased` carries the block too
    expect(readFileSync(join(DISTILLATION, "ratebased04_schulz_delft_0p02bar", "system", "flowsheetDict"),
      "utf8")).toMatch(/model\s+rateBased;/);
    expect(isTotalRefluxColumn(loadUnit("ratebased04_schulz_delft_0p02bar"))).toBe(true);
  });

  it("the loop adds nothing to the flowsheet graph", () => {
    const text = readFileSync(join(DISTILLATION, "ratebased04_schulz_delft_0p02bar",
      "system", "flowsheetDict"), "utf8");
    const g = flowsheetToGraph(toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict);
    expect(g.view.units.length).toBe(1);
    expect(g.view.units[0]!.in).toEqual([]);
    expect(g.view.units[0]!.outputs).toEqual([]);
  });
});

describe("what is drawn", () => {
  it("before a run: the label, the three arrows and the declared composition", () => {
    const html = render(totalRefluxLoop(loadUnit("ratebased04_schulz_delft_0p02bar"))!);
    expect(html).toContain(TOTAL_REFLUX_LABEL);
    for (const a of ["vapour", "reflux", "boilup"]) expect(html).toContain(`total-reflux-${a}`);
    expect(html).toContain("vapour to condenser");
    expect(html).toContain("specified at reboiler: pXylene 0.17, oXylene 0.83");
    expect(html).not.toContain("data-key=");
  });

  it("the detail chip keeps the label and the arrows and hides the numbers", () => {
    const html = render(totalRefluxLoop(loadUnit("ratebased04_schulz_delft_0p02bar"))!, false);
    expect(html).toContain(TOTAL_REFLUX_LABEL);
    expect(html).toContain("total-reflux-boilup");
    expect(html).not.toContain("specified at");
  });
});

const WITNESSES = [
  "totalReflux01_c6c7_yanagiRun628",
  "packing05_schulz_record_0p10bar",
  "ratebased04_schulz_delft_0p02bar",
] as const;

describe("after a run: the engine's own published numbers", () => {
  for (const name of WITNESSES) {
    it(`${name}: every row is a published KPI, unconverted`, () => {
      const dir = `tutorials/steady/distillation/${name}`;
      const result = extractStructured(witnessOutput(dir, "log.choupoSolve"), emptyCase);
      const unit = loadUnit(name);
      const kpis = result.kpis?.[unit.name];
      expect(kpis, "the run published no KPIs for the column").toBeTruthy();
      const loop = totalRefluxLoop(unit, kpis)!;
      expect(loop.after, "the run published none of the loop's keys").not.toBeNull();

      let shown = 0;
      for (const arrow of Object.keys(PUBLISHED) as LoopArrow[]) {
        for (const row of loopRows(loop, arrow, DEFAULT_PREFS)) {
          expect(row.value).toBe(kpis![row.key]);
          expect((PUBLISHED[arrow] as readonly string[]).includes(row.key)).toBe(true);
          shown++;
        }
        //  and nothing published under a listed key is left out
        const published = (PUBLISHED[arrow] as readonly string[]).filter((k) => typeof kpis![k] === "number");
        expect(loopRows(loop, arrow, DEFAULT_PREFS).map((r) => r.key)).toEqual(published);
      }
      expect(shown).toBeGreaterThanOrEqual(5);

      //  every column publishes the two end compositions and the boilup
      const rows = Object.fromEntries(
        (["vapour", "reflux", "boilup"] as LoopArrow[]).flatMap((a) =>
          loopRows(loop, a, DEFAULT_PREFS).map((r) => [r.key, r])));
      expect(rows["x_reflux_LK"]!.value).toBe(kpis!["x_reflux_LK"]);
      expect(rows["x_reboiler_LK"]!.value).toBe(kpis!["x_reboiler_LK"]);
      expect(rows["V_boilup"]!.value).toBe(kpis!["V_boilup"]);

      //  the drawn text carries the same numbers
      const html = render(loop);
      expect(html).toContain("data-key=\"V_boilup\"");
      expect(html).toContain(rows["x_reflux_LK"]!.text);
      expect(html).toContain(rows["T_bottom"]!.text);
    });
  }
});
