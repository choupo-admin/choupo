/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The PFD sheet (plant document set, slice S2): the page-size rule, the stream
  table held to the ENGINE'S OWN streamTable.csv, the stream numbers held to
  the canvas's, the title block, one sheet per sector.

  What this does NOT check, said plainly: that the figure looks right on
  paper.  That is a look (gui/tools/checkGui) and no test here renders a pixel.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import type { RunResult, StreamResult } from "../src/adapters/SolverAdapter.js";
import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import {
  COL_MM, MIN_TEXT_MM, PAGE_MM, bandMm, buildPfdSheets, buildStreamTable, choosePageSize,
  pageCapacity, pfdHtml, sheetSvg, tableHeightMm,
} from "../src/case/pfdSheet.js";
import { buildPfd, pfdNumbering, tagOfUnit } from "../src/case/pfdViews.js";
import { witnessOutput } from "./witnessRead.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");

/* ---- the page-size rule: counts in, a size out -------------------------- */

describe("choosePageSize: the page follows the content, the text never shrinks", () => {
  it("a small table is A3 landscape, the default", () => {
    const c = choosePageSize({ nStreams: 12, nComponents: 6 });
    expect(c.size).toBe("A3");
    expect(c.fitsOnOneSheet).toBe(true);
    expect(c.blocks).toEqual([12]);
  });

  it("more stream columns than an A3 holds steps up to A2, then A1", () => {
    const a3 = pageCapacity("A3"), a2 = pageCapacity("A2"), a1 = pageCapacity("A1");
    expect(a3).toBeLessThan(a2);
    expect(a2).toBeLessThan(a1);
    expect(choosePageSize({ nStreams: a3, nComponents: 5 }).size).toBe("A3");
    expect(choosePageSize({ nStreams: a3 + 1, nComponents: 5 }).size).toBe("A2");
    expect(choosePageSize({ nStreams: a2 + 1, nComponents: 5 }).size).toBe("A1");
    expect(choosePageSize({ nStreams: a1, nComponents: 5 }).size).toBe("A1");
  });

  it("many component rows exceed the band and also step up", () => {
    //  the band is a fraction of the free height; find the row count that
    //  just breaks A3's and check A2 takes it
    let n = 1;
    while (tableHeightMm(n, false, 20) <= bandMm("A3")) n++;
    expect(choosePageSize({ nStreams: 8, nComponents: n - 1 }).size).toBe("A3");
    expect(choosePageSize({ nStreams: 8, nComponents: n }).size).toBe("A2");
  });

  it("beyond A1 the table CONTINUES: same size, blocks of the page capacity", () => {
    const cap = pageCapacity("A1");
    const c = choosePageSize({ nStreams: 2 * cap + 3, nComponents: 5 });
    expect(c.size).toBe("A1");
    expect(c.fitsOnOneSheet).toBe(false);
    expect(c.blocks).toEqual([cap, cap, 3]);
    expect(c.firstBlockOnFigure).toBe(true);
  });

  it("a forced size is honoured and only decides the continuation", () => {
    const c = choosePageSize({ nStreams: 20, nComponents: 5, forced: "A3" });
    expect(c.size).toBe("A3");
    expect(c.forced).toBe(true);
    expect(c.blocks.reduce((a, b) => a + b, 0)).toBe(20);
    expect(Math.max(...c.blocks)).toBeLessThanOrEqual(pageCapacity("A3"));
  });

  it("the page sizes are ISO 216 landscape", () => {
    expect(PAGE_MM.A3).toEqual({ w: 420, h: 297 });
    expect(PAGE_MM.A2).toEqual({ w: 594, h: 420 });
    expect(PAGE_MM.A1).toEqual({ w: 841, h: 594 });
  });

  it("the legibility floor is 2.5 mm and a column holds its widest cell", () => {
    expect(MIN_TEXT_MM).toBe(2.5);
    expect(COL_MM).toBeGreaterThanOrEqual(8 * 0.6 * MIN_TEXT_MM);
  });
});

/* ---- the table against the engine's streamTable.csv ---------------------- */

function csvRows(text: string): { head: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).map((l) => l.split(","));
  return { head: lines[0]!, rows: lines.slice(1) };
}

/** The engine's stream table turned back into result streams (SI). */
function streamsFromCsv(text: string): StreamResult[] {
  const { head, rows } = csvRows(text);
  const ix = (k: string) => head.indexOf(k);
  return rows.map((r) => {
    const composition: { [c: string]: number } = {};
    head.forEach((h, i) => { if (h.startsWith("x_")) composition[h.slice(2)] = Number(r[i]); });
    const solids = Number(r[ix("solids_kg_per_h")]);
    return {
      name: r[0]!, role: r[ix("role")] as StreamResult["role"],
      F: Number(r[ix("F_kmol_per_h")]) / 3600,
      F_mass: Number(r[ix("F_mass_kg_per_h")]) / 3600,
      T: Number(r[ix("T_K")]), P: Number(r[ix("P_bar")]) * 1e5,
      vf: Number(r[ix("vapourFraction")]),
      F_solid_mass: solids / 3600,
      composition,
    } as StreamResult;
  });
}

describe("the stream table holds one column per physical stream of the engine's table", () => {
  //  read in beforeAll: a missing build REFUSES these tests by name and
  //  leaves the rest of the file running
  let head: string[] = [];
  let rows: string[][] = [];
  let streams: StreamResult[] = [];
  beforeAll(() => {
    const csv = witnessOutput("tutorials/batch/plant/donepezil01_tablets", "reports/streams/streamTable.csv");
    ({ head, rows } = csvRows(csv));
    streams = streamsFromCsv(csv);
  });
  const num = (n: string) => streams.findIndex((s) => s.name === n) + 1;

  it("one column per row of streamTable.csv, none added, none dropped", () => {
    const t = buildStreamTable(streams, num);
    expect(t.columns).toHaveLength(rows.length);
    expect(t.columns.map((c) => c.name).sort()).toEqual(rows.map((r) => r[0]!).sort());
  });

  it("T and P are the engine's numbers in the sheet's units, nothing recomputed", () => {
    const t = buildStreamTable(streams, num);
    const iT = t.rowLabels.indexOf("T (°C)"), iP = t.rowLabels.indexOf("P (bar)");
    for (const r of rows) {
      const col = t.columns.find((c) => c.name === r[0])!;
      expect(Number(col.cells[iT])).toBeCloseTo(Number(r[head.indexOf("T_K")]) - 273.15, 1);
      expect(Number(col.cells[iP])).toBeCloseTo(Number(r[head.indexOf("P_bar")]), 2);
    }
  });

  it("mole fractions and the molar flow come straight from the published fields", () => {
    const t = buildStreamTable(streams, num);
    const iF = t.rowLabels.indexOf("F (kmol/h)");
    const comp = head.find((h) => h.startsWith("x_") && rows.some((r) => Number(r[head.indexOf(h)]) > 0.1))!;
    const iX = t.rowLabels.indexOf(comp);
    expect(iX).toBeGreaterThan(-1);
    for (const r of rows) {
      const col = t.columns.find((c) => c.name === r[0])!;
      const x = Number(r[head.indexOf(comp)]);
      if (x > 0) expect(Number(col.cells[iX])).toBeCloseTo(x, 3);
      const f = Number(r[head.indexOf("F_kmol_per_h")]);
      if (col.cells[iF] !== "—" && f > 0) expect(Number(col.cells[iF])).toBeCloseTo(f, 1);
    }
  });

  it("a stream the engine did not publish a value for shows a dash, not a zero", () => {
    const bare: StreamResult = { name: "ghost", role: "feed", F: 0, T: 300, P: 1e5, composition: {} } as StreamResult;
    const t = buildStreamTable([bare], () => undefined);
    expect(t.columns[0]!.cells[t.rowLabels.indexOf("phase")]).toBe("—");
    expect(t.columns[0]!.cells[t.rowLabels.indexOf("F (kg/h)")]).toBe("—");
    expect(t.columns[0]!.number).toBeUndefined();
  });

  it("the sheet draws every column of the table at text no smaller than 2.5 mm", () => {
    const sheets = buildPfdSheets({
      views: [{ sector: "", caption: "Flowsheet", figure: { nodes: [], edges: [] }, streams, legend: [] }],
      numberOf: num,
    });
    const svg = sheets.map((s) => sheetSvg(s, { caseName: "x", date: "2026-11-03" })).join("");
    const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(rows.length);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_TEXT_MM);
    //  every stream number appears as a column head on the sheets
    const drawn = sheets.reduce((a, s) => a + (s.to - s.from), 0);
    expect(drawn).toBe(rows.length);
  });
});

/* ---- title block, sheets, numbering on a sectored plant -------------------- */

function walkFiles(dir: string, base: string, out: Record<string, string>): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkFiles(p, base, out);
    else out[relative(base, p)] = readFileSync(p, "utf8");
  }
}

const IDENTITIES = [
  "BdAir", "CONCENTRATION.Cond1", "CONCENTRATION.Cond2", "CONCENTRATION.Juice1",
  "CONCENTRATION.Magma", "CONCENTRATION.Syrup", "CONCENTRATION.Vap1", "CONCENTRATION.Vap2",
  "DRYING.DryPowder", "DRYING.Dust", "DRYING.Exhaust", "DRYING.ExhaustClean", "DRYING.Vapour",
  "DRYING.WetPowder", "DryingAir", "FERMENTATION.Liquid", "FERMENTATION.Mixed",
  "FERMENTATION.Out", "FERMENTATION.Purge", "FERMENTATION.Recycle", "FERMENTATION.Vapour",
  "MAIN.ToConcentration", "MAIN.ToFermentation", "PlantSteam", "RawJuice",
];

describe("a sectored plant: one sheet per sector, the canvas's numbers, an engine-stamped title block", () => {
  const PLANT = join(REPO, "tutorials", "plant", "ChemicalPlantTutorial");
  const raw: Record<string, string> = {};
  walkFiles(PLANT, PLANT, raw);
  const root = toJson(parse(raw["system/flowsheetDict"]!, { sourceName: "root" })) as JsonDict;
  const result = {
    status: "done", log: "", convergence: [],
    streams: IDENTITIES.map((name) => ({
      name, role: "intermediate", F: 0.01, T: 350, P: 2e5, vf: 0, composition: { water: 1 },
    })),
    componentMolarMass: { water: 18.015 },
  } as unknown as RunResult;
  const sheets = buildPfd(root, raw, result);
  const meta = { caseName: "ChemicalPlantTutorial", date: "2026-11-03",
                 engine: { version: "Choupo-dev", commit: "abc1234" } };

  it("the plant overview plus one sheet per sector (MAIN, the plant's own level, included)", () => {
    const figs = sheets.filter((s) => s.kind === "figure");
    expect(figs.map((s) => s.caption)).toEqual([
      "Plant overview", "Sector MAIN", "Sector CONCENTRATION", "Sector DRYING", "Sector FERMENTATION",
    ]);
  });

  it("every column's number is the whole-plant number the canvas shows for that stream", () => {
    const g = pfdNumbering(root, raw);
    let checked = 0;
    for (const s of sheets) for (const c of s.table.columns) {
      expect(c.number, c.name).toBeDefined();
      expect(c.number).toBe(g("", c.name));
      checked++;
    }
    expect(checked).toBeGreaterThan(IDENTITIES.length / 2);
    //  a sector's stream wears the SAME number on the overview and in its sector
    const sector = sheets.find((s) => s.sector === "DRYING")!;
    for (const c of sector.table.columns) expect(c.number).toBe(g("", c.name));
  });

  it("sheets are numbered n of N in order and the title block names the engine commit", () => {
    expect(sheets.map((s) => s.n)).toEqual(sheets.map((_, i) => i + 1));
    expect(new Set(sheets.map((s) => s.N))).toEqual(new Set([sheets.length]));
    for (const s of sheets) {
      const svg = sheetSvg(s, meta);
      expect(svg).toContain("abc1234");
      expect(svg).toContain("Choupo-dev");
      expect(svg).toContain(`sheet ${s.n} of ${s.N}`);
      expect(svg).toContain("ChemicalPlantTutorial");
    }
  });

  it("a result with no engine stamp says so instead of inventing a version", () => {
    const svg = sheetSvg(sheets[0]!, { caseName: "c", date: "2026-11-03" });
    expect(svg).toContain("version not published");
  });

  it("the printable page names each sheet's ISO size and offers the print action", () => {
    const html = pfdHtml(sheets, meta);
    expect(html).toContain("window.print()");
    expect(html).toContain("@page a3 { size: 420mm 297mm");
    expect((html.match(/<section class="sheet /g) ?? []).length).toBe(sheets.length);
  });

  it("a forced size changes the page, not the legibility", () => {
    const forced = buildPfd(root, raw, result, "A1");
    expect(new Set(forced.map((s) => s.size))).toEqual(new Set(["A1"]));
  });
});

describe("equipment tags: drawn where the result carries one, else the unit name", () => {
  const eq = (unit: string, tagNo?: string, tag?: string) =>
    ({ unit, item: unit, type: "pump", material: "x", values: {}, ...(tagNo ? { tagNo } : {}), ...(tag ? { tag } : {}) }) as never;
  it("reads the engine's tagNo as written and ignores the sub-item word `tag`", () => {
    expect(tagOfUnit([eq("HPpump", "P-101A")], "HPpump")).toBe("P-101A");
    expect(tagOfUnit([eq("HPpump", "P-101A-D")], "HPpump")).toBe("P-101A-D");
    expect(tagOfUnit([eq("RO", "MB-101A..F")], "RO")).toBe("MB-101A..F");
    expect(tagOfUnit([eq("col", undefined, "train1")], "col")).toBeUndefined();
    expect(tagOfUnit([eq("HPpump")], "HPpump")).toBeUndefined();
    expect(tagOfUnit(undefined, "HPpump")).toBeUndefined();
  });
});
