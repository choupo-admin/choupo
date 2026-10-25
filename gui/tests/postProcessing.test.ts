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
  A props run's VIEWS, as the GUI reads them (DEV.md 4c C147, C149).

  WHAT IS HELD, against REAL runs of this checkout's engine (the witnesses of
  tests/witnessOutputs.ts): (1) the adapter's shaping of the result block --
  every view the engine listed reaches the GUI with its folder, its origin
  (default or declared) and its type, nothing dropped and nothing added;
  (2) the reading of the CSVs -- each series the description declares gets
  exactly the points the engine counted, from the file the same run wrote;
  (3) the review screen's order -- what the propsDict declared first, then
  each operation's defaults op by op; (4) the verdict strip -- one row per
  declared operation, every cell a number the run published or empty.
  The engine's own arithmetic is check_postprocessing's; this file holds the
  GUI to what the engine wrote and nothing else.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { extractStructured } from "../src/adapters/WasmAdapter.js";
import { parse, toJson, type JsonDict } from "../src/dict/index.js";
import {
  plotSeries, tableRows, viewGroups, type PostPlot, type PostRowsTable,
} from "../src/case/postProcessing.js";
import { firstSentence, readinessProminent, verdictRows } from "../src/case/reviewScreen.js";
import type { CaseFiles } from "../src/case/types.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { witnessOutput } from "./witnessRead.js";
import { REPO } from "./witnessOutputs.js";

const ISO = "tutorials/props/adsorption/isotherm02_fit_jaschik";
const POL = "tutorials/props/membrane/polarisation01_geraldes_afonso_table1";

function opsOf(caseDir: string): JsonDict[] {
  const props = toJson(parse(readFileSync(join(REPO, caseDir, "system/propsDict"), "utf-8")));
  return props.operations as JsonDict[];
}

function runOf(caseDir: string) {
  const log = witnessOutput(caseDir, "log.choupoProps");
  return extractStructured(log, {} as CaseFiles);
}

describe("isotherm02: every fit earns its default views", () => {
  const run = runOf(ISO);
  const block = run.postProcessing!;

  it("lists parity, residuals, the isotherm and the parameters for each of the four fits", () => {
    expect(block).toBeDefined();
    const ops = opsOf(ISO).map((o) => o.name as string);
    expect(ops).toHaveLength(4);
    for (const op of ops) {
      const names = block.items.filter((i) => i.op === op).map((i) => i.name).sort();
      expect(names).toEqual(["isotherm", "parameters", "parity", "residuals"]);
    }
    expect(block.items.every((i) => i.origin === "default")).toBe(true);
    expect(block.defaults.map((d) => d.op)).toEqual(ops);
  });

  it("groups the defaults op by op, in the run's order", () => {
    const groups = viewGroups(block);
    expect(groups.map((g) => g.op)).toEqual(opsOf(ISO).map((o) => o.name));
    expect(groups.every((g) => g.origin === "default")).toBe(true);
  });

  it("reads the parity points the engine counted, measured against fitted in one unit", () => {
    const parity = block.items.find((i) => i.op === "fit_jaschik" && i.name === "parity") as PostPlot;
    expect(parity.type).toBe("parity");
    expect(parity.xAxis.unit).toBe(parity.yAxis.unit);
    const pts = plotSeries(parity, witnessOutput(ISO, "postProcessing/fit_jaschik/parity.csv"));
    const s = parity.series[0]!;
    expect(pts.get(s.name)!.x).toHaveLength(s.points);
    expect(s.points).toBe(run.operationResults!.find((o) => o.name === "fit_jaschik")!
      .diagnostics["n_data"]);
  });

  it("reads the parameter table with each parameter's own unit", () => {
    const tab = block.items.find((i) => i.op === "fit_jaschik" && i.name === "parameters") as PostRowsTable;
    expect(tab.shape).toBe("rows");
    expect(tab.rows.map((r) => r.name).sort()).toEqual(["b_ref", "dH_ads", "q_max"]);
    expect(tab.rows.find((r) => r.name === "q_max")!.unit).toBe("mol/kg");
    const cells = tableRows(tab, witnessOutput(ISO, "postProcessing/fit_jaschik/parameters.csv"));
    const d = run.operationResults!.find((o) => o.name === "fit_jaschik")!.diagnostics;
    const q = cells.keys.indexOf("q_max");
    expect(cells.cells[q]![0]).toBeCloseTo(d["fit.q_max.value"]!, 9);
  });

  it("strips one row per fit, each counting its own points", () => {
    const rows = verdictRows(opsOf(ISO), run.operationResults ?? [], run.validation);
    expect(rows.map((r) => r.name)).toEqual(opsOf(ISO).map((o) => o.name));
    for (const r of rows) {
      expect(r.ran).toBe(true);
      expect(r.points?.key).toBe("n_data");
      expect(r.did).toMatch(/^Levenberg-Marquardt regression/);
    }
    expect(readinessProminent(opsOf(ISO))).toBe(false);
  });
});

describe("polarisation01: a bench's defaults and the views its propsDict declares", () => {
  const run = runOf(POL);
  const block = run.postProcessing!;

  it("puts the declared views first, then the op's defaults", () => {
    const groups = viewGroups(block);
    expect(groups.map((g) => `${g.origin}:${g.op}`)).toEqual(["declared:", "default:table1"]);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(
      ["gamma_dye4", "gamma_dye37", "rejection_dye4", "rejection_dye37"]);
    expect(groups[1]!.items.map((i) => i.name)).toEqual(["gamma", "rejection", "rows"]);
  });

  it("files a declared view of one op's numbers in that op's folder", () => {
    for (const it of block.items) {
      expect(it.op).toBe("table1");
      expect(it.file).toBe(`postProcessing/table1/${it.name}.csv`);
    }
  });

  it("reads every declared series with the points the engine counted", () => {
    const view = block.items.find((i) => i.name === "rejection_dye4") as PostPlot;
    const pts = plotSeries(view, witnessOutput(POL, "postProcessing/table1/rejection_dye4.csv"));
    for (const s of view.series) {
      expect(pts.get(s.name)!.x).toHaveLength(s.points);
      expect(s.points).toBe(5);
      expect(s.group).toMatch(/^(Na|Cl)$/);
    }
  });

  it("reads the dataset table row by row, Gamma as the op published it", () => {
    const tab = block.items.find((i) => i.name === "rows")!;
    expect(tab.kind).toBe("table");
    if (tab.kind !== "table" || tab.shape !== "series") throw new Error("rows is a series table");
    const cells = tableRows(tab, witnessOutput(POL, "postProcessing/table1/rows.csv"));
    const g = tab.columns.findIndex((c) => c.name === "Gamma_Na");
    const d = run.operationResults!.find((o) => o.name === "table1")!.diagnostics;
    cells.keys.forEach((k, r) => {
      expect(cells.cells[r]![g]).toBeCloseTo(d[`Gamma_Na_r${k}`]!, 9);
    });
  });
});

describe("the first sentence of what an operation did", () => {
  it("does not end at an abbreviation", () => {
    expect(firstSentence("The bench of Geraldes & Afonso (J. Membr. Sci. 300 (2007) 20): for every row"))
      .toBe("The bench of Geraldes & Afonso (J. Membr. Sci. 300 (2007) 20)");
  });
  it("ends at the first full stop of a word", () => {
    expect(firstSentence("Regression of parameters against data. Two modes follow.")).toBe(
      "Regression of parameters against data");
  });
  it("is empty for no description", () => {
    expect(firstSentence(undefined)).toBe("");
  });
});
