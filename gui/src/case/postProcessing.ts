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
  postProcessing -- A PROPS RUN'S VIEWS, AS THE GUI READS THEM
  (DEV.md 4c C147, C149).

  Every props operation publishes its DEFAULT views (a fit its parity,
  residuals and parameters; a bench its curves) and a case's propsDict adds
  its own in `views ( ... )`; the ENGINE resolves every name, checks every
  unit, computes every difference and writes `postProcessing/<op>/<view>.csv`
  (`postProcessing/case/` for a view across operations) beside a description
  that rides the result JSON's `postProcessing` block.  This module is the
  GUI's half, and it COMPUTES NOTHING:

    * `shapePostProcessing` polices the TYPES of the block (an item with no
      name, kind or file is dropped, never guessed);
    * `plotSeries` splits a plot CSV (`series,x,y,yError`) into the series
      the description declares, in its order;
    * `tableRows` reads a table CSV into the cells the engine wrote.

  A number the engine did not write is not drawn: an empty cell stays
  empty, and a series the CSV does not carry is shown with no points
  rather than borrowed from a neighbour.
\*---------------------------------------------------------------------------*/

export interface PostAxis { label: string; unit: string; scale: "linear" | "log" }

/** Where a view comes from and what it is: the op it belongs to ("" = the
 *  case), whether the op published it by default or the propsDict declared it,
 *  and its declared type. */
export interface PostOrigin {
  op: string;
  origin: "default" | "declared";
  /** series | profile | parity | residuals | table */
  type: string;
}

export interface PostSeries {
  name: string;
  label: string;
  /** computed (from an operation) | reference | experiment | difference */
  role: string;
  /** lines | markers | linesMarkers, or "" for the role's default */
  style: string;
  /** series sharing a group share a colour (one ion across sources); "" none */
  group: string;
  source: string;
  xUnit: string;
  yUnit: string;
  yError: boolean;
  points: number;
}

export interface PostColumn {
  name: string; label: string; unit: string; role?: string; source?: string;
  /** a series-table column that is a RELATIVE difference (drawn as a percentage) */
  relative?: boolean;
}

export interface PostRow {
  name: string; label: string; role: string; source: string; relative: boolean;
  /** a row's own unit (a parameter table: each parameter its own); "" none */
  unit: string;
}

export interface PostPlot extends PostOrigin {
  kind: "plot";
  name: string;
  title: string;
  file: string;
  xAxis: PostAxis;
  yAxis: PostAxis;
  series: PostSeries[];
}

export interface PostSeriesTable extends PostOrigin {
  kind: "table";
  shape: "series";
  name: string;
  title: string;
  file: string;
  x: { label: string; unit: string };
  columns: PostColumn[];
}

export interface PostRowsTable extends PostOrigin {
  kind: "table";
  shape: "rows";
  name: string;
  title: string;
  file: string;
  columns: PostColumn[];
  rows: PostRow[];
}

export type PostItem = PostPlot | PostSeriesTable | PostRowsTable;

export interface PostReference { name: string; file: string; role: string; citation: string }

export interface PostProcessingBlock {
  source: string;
  directory: string;
  references: PostReference[];
  /** each op's default declarations, as the engine wrote them (its grammar) */
  defaults: { op: string; declaration: string }[];
  items: PostItem[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

function axis(a: any): PostAxis {
  return { label: str(a?.label), unit: str(a?.unit),
           scale: a?.scale === "log" ? "log" : "linear" };
}

/** The result JSON's `postProcessing` block, types policed, nothing added. */
export function shapePostProcessing(raw: unknown): PostProcessingBlock | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as any;
  const items: PostItem[] = [];
  for (const it of arr(r.items)) {
    const name = str(it?.name), file = str(it?.file), title = str(it?.title);
    if (!name || !file) continue;
    const from: PostOrigin = {
      op: str(it.op), origin: it.origin === "default" ? "default" : "declared",
      type: str(it.type) || (it.kind === "plot" ? "series" : "table"),
    };
    if (it.kind === "plot") {
      items.push({
        ...from,
        kind: "plot", name, title, file, xAxis: axis(it.xAxis), yAxis: axis(it.yAxis),
        series: arr(it.series).filter((s) => typeof s?.name === "string").map((s) => ({
          name: s.name, label: str(s.label) || s.name, role: str(s.role), style: str(s.style),
          group: str(s.group), source: str(s.source), xUnit: str(s.x?.unit), yUnit: str(s.y?.unit),
          yError: s.yError === true, points: typeof s.points === "number" ? s.points : 0,
        })),
      });
    } else if (it.kind === "table" && it.shape === "series") {
      items.push({
        ...from,
        kind: "table", shape: "series", name, title, file,
        x: { label: str(it.x?.label), unit: str(it.x?.unit) },
        columns: arr(it.columns).filter((c) => typeof c?.name === "string").map((c) => ({
          name: c.name, label: str(c.label) || c.name, unit: str(c.unit),
          role: str(c.role), source: str(c.source), relative: c.relative === true,
        })),
      });
    } else if (it.kind === "table" && it.shape === "rows") {
      items.push({
        ...from,
        kind: "table", shape: "rows", name, title, file,
        columns: arr(it.columns).filter((c) => typeof c?.name === "string").map((c) => ({
          name: c.name, label: str(c.label) || c.name, unit: str(c.unit),
        })),
        rows: arr(it.rows).filter((w) => typeof w?.name === "string").map((w) => ({
          name: w.name, label: str(w.label) || w.name, role: str(w.role),
          source: str(w.source), relative: w.relative === true, unit: str(w.unit),
        })),
      });
    }
  }
  if (items.length === 0) return undefined;
  return {
    source: str(r.source), directory: str(r.directory),
    references: arr(r.references).filter((x) => typeof x?.name === "string").map((x) => ({
      name: x.name, file: str(x.file), role: str(x.role), citation: str(x.citation),
    })),
    defaults: arr(r.defaults).filter((d) => typeof d?.op === "string").map((d) => ({
      op: d.op, declaration: str(d.declaration),
    })),
    items,
  };
}

/** A cell as the engine wrote it: a number, or null for an empty cell. */
function num(c: string | undefined): number | null {
  if (c === undefined || c.trim() === "") return null;
  const v = Number(c);
  return Number.isFinite(v) ? v : null;
}

function lines(csv: string): string[][] {
  return csv.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split(","));
}

export interface SeriesPoints { x: number[]; y: number[]; yError: (number | null)[] }

/** A plot CSV (`series,x,y,yError`) split by series, in the description's
 *  order; a declared series the file does not carry gets no points. */
export function plotSeries(item: PostPlot, csv: string): Map<string, SeriesPoints> {
  const out = new Map<string, SeriesPoints>();
  for (const s of item.series) out.set(s.name, { x: [], y: [], yError: [] });
  const rows = lines(csv);
  for (const row of rows.slice(1)) {
    const s = out.get(row[0] ?? "");
    const x = num(row[1]), y = num(row[2]);
    if (!s || x === null || y === null) continue;
    s.x.push(x); s.y.push(y); s.yError.push(num(row[3]));
  }
  return out;
}

export interface TableCells {
  /** the first column: an x value (series table) or a row name (rows table) */
  keys: string[];
  /** cells[r][c] for the description's columns, null where the engine wrote none */
  cells: (number | null)[][];
}

export function tableRows(item: PostSeriesTable | PostRowsTable, csv: string): TableCells {
  const rows = lines(csv);
  const header = rows[0] ?? [];
  const idx = item.columns.map((c) => header.indexOf(c.name));
  return {
    keys: rows.slice(1).map((r) => r[0] ?? ""),
    cells: rows.slice(1).map((r) => idx.map((i) => (i < 0 ? null : num(r[i])))),
  };
}

/** A number for a table cell: 6 significant figures, the engine's value
 *  behind it (the CSV export carries all twelve). */
export function formatCell(v: number | null, relative = false): string {
  if (v === null) return "";
  if (relative) return (v * 100).toPrecision(3) + " %";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(5);
  return Number(v.toPrecision(6)).toString();
}

/** The views in the order a reviewer reads them: what the propsDict DECLARED
 *  first (the figures the case's author chose, a paper's), in declaration
 *  order; then each operation's defaults, op by op in the order the run
 *  published them.  Each group carries its op ("" = across operations). */
export interface ViewGroup { op: string; origin: "declared" | "default"; items: PostItem[] }

export function viewGroups(block: PostProcessingBlock): ViewGroup[] {
  const out: ViewGroup[] = [];
  const declared = block.items.filter((i) => i.origin === "declared");
  if (declared.length > 0) out.push({ op: "", origin: "declared", items: declared });
  for (const it of block.items) {
    if (it.origin !== "default") continue;
    const g = out.find((x) => x.origin === "default" && x.op === it.op);
    if (g) g.items.push(it);
    else out.push({ op: it.op, origin: "default", items: [it] });
  }
  return out;
}
