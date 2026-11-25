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

/*---------------------------------------------------------------------------*\
  calculatedToBought -- "From the calculated to the bought" (C503), held to
  what it claims about itself:

    * the knobs reach the witness: the margin and the stock lengths are
      written into hxBought01_margin_and_stock's own dict, and the stock
      lengths the page lists are the ones the dict declares;
    * the exchanger feed: the page's reader, applied to the design sheet this
      tree's native build wrote, gives the three areas in their order, and
      required = (1 + margin) x calculated;
    * the cover test and the driver and pipe arithmetic, by hand;
    * the compressor feed: the page's rating at the engine's own margin equals
      the rating the engine printed;
    * the line feed: the minimum bore is the engine's own velocity and bore
      combined, and a small number of its lines are read;
    * the lesson: it cites no source, every equation parses, the registry entry
      is live and the page renders on a fixture with no NaN and no "undefined".

  WHAT THIS CANNOT PROVE: that the browser's WASM run gives the sheet this
  tree's native binary wrote (same C++), nor any teaching judgement.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import type { RunResult } from "../src/adapters/SolverAdapter.js";
import { methodCase } from "../src/case/methodRun.js";
import {
  CB_ITEM, CB_LINE_WITNESS, CB_MARGINS, CB_STOCK_LENGTHS, CB_WITNESS, coveringMargin,
  driverAt, exchangerOverrides, lineOverrides, readDriver, readExchanger, readLines,
  type MarginPoint,
} from "../src/ui/methods/calculatedToBoughtMath.js";
import { CB_LIMITS, CB_QUIZ, CB_STEPS } from "../src/ui/methods/calculatedToBoughtLesson.js";
import { CalculatedToBoughtTool } from "../src/ui/methods/CalculatedToBoughtTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { witnessOutput, witnessOutputFiles } from "./witnessRead.js";

const HX_CASE = "tutorials/steady/heat/hxBought01_margin_and_stock";
const COMP_CASE = "tutorials/steady/rotating/compressor03_staged_design";
const LINE_CASE = "tutorials/plant/line01_pumped_drum";

/** `key  value [unit];` lines of an engine design sheet, first occurrence of each key. */
function sheetValues(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /^[ \t]+(\w+)[ \t]+(?:\[[^\]]*\][ \t]+)?([-+]?[0-9.]+(?:[eE][-+]?[0-9]+)?)[ \t]*[A-Za-z/%0-9.^-]*;/gm;
  for (const m of text.matchAll(re)) if (!(m[1]! in out)) out[m[1]!] = Number(m[2]);
  return out;
}

function condenserResult(): RunResult {
  const v = sheetValues(witnessOutput(HX_CASE, "design/column17/condenser"));
  return {
    equipment: [{ unit: "column17", item: CB_ITEM, type: "shellTubeHX", material: "carbonSteel",
      values: v, cost: { purchased: v["purchased"] ?? 0, bareModule: 0, totalModule: 0, currency: "EUR" } }],
  } as unknown as RunResult;
}

function compressorResult(): RunResult {
  const [, text] = witnessOutputFiles(COMP_CASE, "design/compressor1")[0]!;
  return {
    equipment: [{ unit: "compressor1", item: "compressor1", type: "compressor", material: "SS316",
      values: sheetValues(text) }],
  } as unknown as RunResult;
}

describe("calculated-to-bought: the knobs reach the witness", () => {
  it("writes the margin and every stock length into the witness's dict", () => {
    const c = methodCase(CB_WITNESS, exchangerOverrides(0.2, 4.877));
    const raw = c.rawFiles?.["system/postDict"] ?? "";
    expect(raw).toMatch(/^\s*area\s+0\.2;/m);
    expect((raw.match(/^\s*length\s+4\.877 m;/gm) ?? []).length).toBe(4);
  });

  it("keeps the dict's own list when no length is chosen", () => {
    const c = methodCase(CB_WITNESS, exchangerOverrides(0.1, null));
    const raw = c.rawFiles?.["system/postDict"] ?? "";
    const declared = [...raw.matchAll(/^\s*length\s+([0-9.]+) m;/gm)].map((m) => Number(m[1]));
    expect(declared).toEqual([...CB_STOCK_LENGTHS]);
  });

  it("the line ceiling lands on the liquid discharge window only", () => {
    const c = methodCase(CB_LINE_WITNESS, lineOverrides(2.5));
    const raw = c.rawFiles?.["system/layoutDict"] ?? "";
    const maxes = [...raw.matchAll(/^\s*max\s+([0-9.]+) m\/s;/gm)].map((m) => Number(m[1]));
    expect(maxes[0]).toBe(2.5);
    expect(maxes.slice(1)).toEqual([30, 60]);
  });

  it("the swept margins start at none and stay inside the engine's refusal bound", () => {
    expect(CB_MARGINS[0]).toBe(0);
    expect(Math.max(...CB_MARGINS)).toBeLessThanOrEqual(0.3);
  });
});

describe("calculated-to-bought: the exchanger feed is the engine's sheet", () => {
  it("reads the three areas in order, with required = (1 + margin) x calculated", () => {
    const hx = readExchanger(condenserResult());
    expect(hx).not.toBeNull();
    expect(hx!.margin).toBeCloseTo(0.1, 12);
    expect(hx!.margined).toBeCloseTo((1 + hx!.margin) * hx!.calculated, 3);
    expect(hx!.bought).toBeGreaterThanOrEqual(hx!.margined * (1 - 1e-9));
    expect(hx!.bought).toBeGreaterThan(hx!.calculated);
    expect(hx!.surplus).toBeCloseTo(hx!.bought / hx!.calculated - 1, 12);
    expect(CB_STOCK_LENGTHS.some((L) => Math.abs(L - hx!.tubeLength) < 1e-9)).toBe(true);
    expect(hx!.shellBought).not.toBeNull();
    expect(hx!.shellBought!).toBeGreaterThanOrEqual(hx!.shellCalculated - 1e-9);
    expect(hx!.cost).toBeGreaterThan(0);
  });

  it("returns null for a result with no such item rather than inventing numbers", () => {
    expect(readExchanger(null)).toBeNull();
    expect(readExchanger({ equipment: [] } as unknown as RunResult)).toBeNull();
  });
});

describe("calculated-to-bought: the cover test, by hand", () => {
  const mk = (margin: number, bought: number): MarginPoint => ({
    margin,
    reading: { calculated: 100, margined: 100 * (1 + margin), bought, margin, nTubes: 0, tubeLength: 1,
      shellCalculated: 0, shellBought: null, cost: bought * 10, currency: "EUR", surplus: bought / 100 - 1 },
  });
  const pts = [mk(0, 101), mk(0.1, 111), mk(0.2, 121), mk(0.3, 131)];

  it("picks the smallest margin whose bought area reaches A_calc / (1 - u)", () => {
    expect(coveringMargin(pts, 0.1)?.margin).toBe(0.2);       // 100 / 0.9 = 111.1: 111 falls just short
    expect(coveringMargin(pts, 0.1)?.reading.bought).toBe(121);
  });
  it("covers a zero or a larger uncertainty at the right point", () => {
    expect(coveringMargin(pts, 0.0)?.margin).toBe(0);
    expect(coveringMargin(pts, 0.2)?.margin).toBe(0.3);       // 125 -> 131
  });
  it("returns null when nothing swept covers it, and for a non-physical u", () => {
    expect(coveringMargin(pts, 0.25)).toBeNull();             // 133.3
    expect(coveringMargin(pts, 1)).toBeNull();
    expect(coveringMargin(pts, -0.1)).toBeNull();
  });
});

describe("calculated-to-bought: the driver", () => {
  it("rounds the rating up to a rung of the ladder (the lesson's own numbers)", () => {
    const d = driverAt(450, 1.1, 100);
    expect(d.rating).toBeCloseTo(495, 9);
    expect(d.bought).toBe(500);
    expect(d.surplus).toBeCloseTo(500 / 450 - 1, 12);
  });
  it("does not round an exact rung upward on floating-point noise", () => {
    expect(driverAt(1000, 1.0, 100).bought).toBe(1000);
  });
  it("at the engine's own margin the page's rating is the engine's printed rating", () => {
    const drv = readDriver(compressorResult());
    expect(drv).not.toBeNull();
    expect(driverAt(drv!.powerShaft, drv!.margin, 10).rating).toBeCloseTo(drv!.rating, 3);
    expect(drv!.margin).toBeCloseTo(1.1, 9);
  });
});

describe("calculated-to-bought: the line feed", () => {
  const lineResult = (): RunResult => ({ csvFiles: {
    "reports/lines/lineList.csv": witnessOutput(LINE_CASE, "reports/lines/lineList.csv") } } as unknown as RunResult);
  it("the minimum bore is the engine's bore and velocity combined", () => {
    const rows = readLines(lineResult());
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.filter((r) => r.cost !== null).length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.cost === null)).toBe(true);
    for (const r of rows) {
      expect(r.boreMin).toBeLessThanOrEqual(r.bore * (1 + 1e-12));
      // velocity at the minimum bore, flow held, is the ceiling
      expect(r.velocity * (r.bore / r.boreMin) ** 2).toBeCloseTo(r.velocityMax, 9);
      expect(r.areaMargin).toBeCloseTo((r.bore / r.boreMin) ** 2 - 1, 9);
    }
  });
  it("the hand case of the lesson: 2 m/s under a 3 m/s ceiling is 50 percent more area", () => {
    const csv = "line,from,to,service,state,nominalSize_in,schedule,insideDiameter_m,velocity_m_s,velocityMax_m_s\n"
      + "x,a,b,liquidDischarge,sized,4,40,0.1,2,3";
    const rows = readLines({ csvFiles: { "reports/lines/lineList.csv": csv } } as unknown as RunResult);
    expect(rows[0]!.areaMargin).toBeCloseTo(0.5, 12);
  });
  it("reads nothing, and says so, from a run with no line list", () => {
    expect(readLines({ csvFiles: {} } as unknown as RunResult)).toEqual([]);
  });
});

describe("calculated-to-bought: the lesson and the page", () => {
  it("cites no source, and every equation parses", () => {
    for (const s of CB_STEPS) {
      if (s.formula) expect(texParses(s.formula)).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq)).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym)).toBe(true);
    }
    expect(JSON.stringify([CB_STEPS, CB_LIMITS, CB_QUIZ])).not.toMatch(/Brown|Moran|Perry|Sinnott|Turton/);
  });
  it("every quiz question points at a step that exists", () => {
    const ns = new Set(CB_STEPS.map((s) => s.n));
    for (const q of CB_QUIZ) for (const n of q.steps) expect(ns.has(n)).toBe(true);
  });
  it("is registered and live, and its witnesses are in the bundled corpus", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "calculated-to-bought");
    expect(t?.status).toBe("live");
    expect(t?.theory).toBe("sec:hx-bought");
    for (const w of [CB_WITNESS, CB_LINE_WITNESS, "compressor03_staged_design"])
      expect(tutorialByName(w)?.files.rawFiles).toBeTruthy();
  });
  it("renders on a fixture with no NaN and no 'undefined'", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(CalculatedToBoughtTool)));
    expect(html).toContain("From the calculated to the bought");
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
