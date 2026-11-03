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
  Choupo GUI -- the PROCESS FLOW DIAGRAM as a printable sheet (plant document
  set, slice S2; docs/design/the-plant-document-set.md section 5)

  One sheet = the figure (case/flowsheetSvg.ts) + the STREAM TABLE along the
  bottom (one column per physical stream, headed by the PFD number the canvas
  badges show) + the equipment tags and the utilities legend + a TITLE BLOCK.
  Everything is drawn in MILLIMETRES on a page of a real ISO 216 size, so the
  SVG of a sheet and the printed page are the same drawing.

  THE GUI DRAWS WHAT THE ENGINE PUBLISHED.  Every number in the table is a
  field of the run result (T, P, F, F_mass, vf, solids, composition) turned
  into a unit and a string; a stream the engine did not publish shows a dash.
  Nothing is solved, balanced or estimated here.

  THE PAGE SIZE FOLLOWS THE CONTENT (the architect, 2026-11-03): an
  industrial PFD is A1 or A0 with the table along the bottom.  The rule, one
  function (`choosePageSize`), pure in counts:

    * the table text is never smaller than MIN_TEXT_MM = 2.5 mm printed, and
      a column is never narrower than what that text needs (COL_MM);
    * a sheet FITS when all its stream columns fit across the page and the
      table takes no more than TABLE_BAND_FRACTION of the free height (the
      figure keeps the rest);
    * try A3 landscape, then A2, then A1 (ISO 216: 420x297, 594x420,
      841x594 mm); the first that fits wins;
    * beyond A1 the table CONTINUES on following sheets of the same size and
      title block ("stream table, continued") -- the text is never shrunk to
      squeeze more columns in;
    * the student may force a size: the rule then only decides the
      continuation, never the legibility.

  Pure: values in, strings out, no DOM.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";
import { computePerStream } from "./streamComposition.js";
import { buildFlowsheetSvg, xmlEscape, type SvgEdge, type SvgNode } from "./flowsheetSvg.js";

/* ---- page sizes and the legibility rule --------------------------------- */

export type PageSizeName = "A3" | "A2" | "A1";
export const PAGE_SIZES: readonly PageSizeName[] = ["A3", "A2", "A1"];
/** ISO 216 landscape, millimetres. */
export const PAGE_MM: Record<PageSizeName, { w: number; h: number }> = {
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
};
/** THE LEGIBILITY FLOOR: no text of the stream table is drawn smaller than
 *  this many millimetres, on any page size.  Every `font-size` the table
 *  writes is in millimetres (the SVG's user unit), so the floor is checked
 *  by reading the drawing (tests/pfdSheet.test.ts). */
export const MIN_TEXT_MM = 2.5;
export const MARGIN_MM = 10;
export const TITLE_BLOCK_MM = 24;
/** A table row: the text height plus air. */
export const ROW_MM = 1.45 * MIN_TEXT_MM;
/** The first column (row labels) and one stream column.  A cell holds up to
 *  8 characters ("1.234e-5") at 0.6 em per monospace character. */
export const LABEL_COL_MM = 30;
export const COL_MM = 15;
/** The table may take at most this share of the page height left after the
 *  margins and the title block; the figure keeps the rest. */
export const TABLE_BAND_FRACTION = 0.42;
/** Stream names run vertically above their column, at most this long. */
export const NAME_ROW_MAX_MM = 36;
const CHAR_MM = 0.6 * MIN_TEXT_MM;

export interface PageChoiceInput {
  nStreams: number;
  /** Rows of the table below the fixed ones: one per component (+ pH etc.). */
  nComponents: number;
  /** An extra fixed row (solids) is present. */
  hasSolids?: boolean;
  /** Longest stream name, in characters (the vertical name row's height). */
  nameChars?: number;
  forced?: PageSizeName;
}

export interface PageChoice {
  size: PageSizeName;
  forced: boolean;
  /** Stream columns that fit across one page of this size. */
  capacity: number;
  tableHeightMm: number;
  /** Everything on one sheet: columns fit and the band is not exceeded. */
  fitsOnOneSheet: boolean;
  /** Does the first block of columns sit on the figure sheet?  False when
   *  even one block would take more than the band (very many components). */
  firstBlockOnFigure: boolean;
  /** Stream columns per block, in order; the first block goes on the figure
   *  sheet when `firstBlockOnFigure`, the rest on continuation sheets. */
  blocks: number[];
}

/** Fixed rows: T, P, phase, F molar, F mass. */
export const FIXED_ROWS = 5;

export function tableHeightMm(nComponents: number, hasSolids: boolean, nameChars: number): number {
  const nameRow = Math.min(NAME_ROW_MAX_MM, nameChars * CHAR_MM + 3);
  //  + 1: the "#" row under the names.
  const rows = 1 + FIXED_ROWS + (hasSolids ? 1 : 0) + nComponents;
  return nameRow + rows * ROW_MM;
}

export function pageCapacity(size: PageSizeName): number {
  //  the table sits 2 mm inside the frame on each side
  return Math.floor((PAGE_MM[size].w - 2 * MARGIN_MM - 4 - LABEL_COL_MM) / COL_MM);
}

export function bandMm(size: PageSizeName): number {
  return TABLE_BAND_FRACTION * (PAGE_MM[size].h - 2 * MARGIN_MM - TITLE_BLOCK_MM);
}

function chunk(n: number, cap: number): number[] {
  const out: number[] = [];
  for (let left = n; left > 0; left -= cap) out.push(Math.min(cap, left));
  return out.length ? out : [0];
}

/** THE RULE.  Counts in, a page size and a split out. */
export function choosePageSize(inp: PageChoiceInput): PageChoice {
  const h = tableHeightMm(inp.nComponents, !!inp.hasSolids, inp.nameChars ?? 20);
  const mk = (size: PageSizeName, forced: boolean): PageChoice => {
    const capacity = pageCapacity(size);
    const bandOk = h <= bandMm(size);
    const fits = inp.nStreams <= capacity && bandOk;
    return {
      size, forced, capacity, tableHeightMm: h,
      fitsOnOneSheet: fits,
      firstBlockOnFigure: bandOk,
      blocks: fits ? [inp.nStreams] : chunk(inp.nStreams, capacity),
    };
  };
  if (inp.forced) return mk(inp.forced, true);
  for (const s of PAGE_SIZES) {
    const c = mk(s, false);
    if (c.fitsOnOneSheet) return c;
  }
  return mk("A1", false);
}

/* ---- the stream table ---------------------------------------------------- */

const DASH = "—";

export interface StreamTableColumn {
  /** The PFD number, as the canvas badge shows it; undefined = unnumbered. */
  number: number | undefined;
  name: string;
  /** One string per row label, aligned with `StreamTable.rowLabels`. */
  cells: string[];
}
export interface StreamTable {
  rowLabels: string[];
  components: string[];
  columns: StreamTableColumn[];
}

function sig(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return DASH;
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    return v.toExponential(Math.max(0, digits - 2)).replace(/e([+-])(\d)$/, "e$1$2")
      .replace("e+", "e");
  }
  return String(Number(v.toPrecision(digits)));
}

/** The phase word the published vapour fraction means.  vf is the engine's;
 *  the word is only its reading (0 liquid, 1 vapour, between both). */
export function phaseWord(s: Pick<StreamResult, "vf" | "F_solid_mass">): string {
  const solid = (s.F_solid_mass ?? 0) > 1e-12;
  if (s.vf === undefined) return solid ? "S" : DASH;
  const eps = 1e-9;
  const f = s.vf <= eps ? "L" : s.vf >= 1 - eps ? "V" : "L+V";
  return solid ? `${f}+S` : f;
}

export function buildStreamTable(
  streams: readonly StreamResult[],
  numberOf: (streamName: string) => number | undefined,
  componentMolarMass?: { [c: string]: number },
): StreamTable {
  const comps: string[] = [];
  const seen = new Set<string>();
  for (const s of streams) {
    for (const c of [...Object.keys(s.composition), ...Object.keys(s.solids ?? {})])
      if (!seen.has(c)) { seen.add(c); comps.push(c); }
  }
  const per = computePerStream([...streams], componentMolarMass);
  const hasSolids = streams.some((s) => (s.F_solid_mass ?? 0) > 1e-12);
  const rowLabels = [
    "T (°C)", "P (bar)", "phase", "F (kmol/h)", "F (kg/h)",
    ...(hasSolids ? ["solids (kg/h)"] : []),
    ...comps.map((c) => `x_${c}`),
  ];
  const columns: StreamTableColumn[] = streams.map((s) => {
    const ps = per[s.name];
    const cells: string[] = [
      sig(s.T - 273.15, 4),
      sig(s.P / 1e5, 4),
      phaseWord(s),
      ps ? sig(ps.totMol * 3600) : sig(s.F * 3600),
      componentMolarMass !== undefined && ps ? sig(ps.totMass * 3600) : DASH,
    ];
    if (hasSolids)
      cells.push((s.F_solid_mass ?? 0) > 1e-12 ? sig((s.F_solid_mass ?? 0) * 3600) : DASH);
    for (const c of comps) {
      const v = ps?.molFrac[c];
      cells.push(v === undefined ? DASH : sig(v));
    }
    return { number: numberOf(s.name), name: s.name, cells };
  });
  //  PFD order: the canvas numbers, unnumbered streams last by name.
  columns.sort((a, b) => {
    const na = a.number ?? Number.POSITIVE_INFINITY, nb = b.number ?? Number.POSITIVE_INFINITY;
    return na !== nb ? na - nb : a.name.localeCompare(b.name);
  });
  return { rowLabels, components: comps, columns };
}

/* ---- the sheets ----------------------------------------------------------- */

export interface PfdFigure { nodes: SvgNode[]; edges: SvgEdge[] }
export interface PfdLegendItem { kind: "utility" | "tag"; text: string }

/** One view of the plant: the overview, one sector, or the whole flat case. */
export interface PfdView {
  /** "" for the overview / a flat case, else the sector path. */
  sector: string;
  caption: string;
  figure: PfdFigure;
  streams: StreamResult[];
  legend: PfdLegendItem[];
}

export interface PfdMeta {
  caseName: string;
  /** ISO date, supplied by the caller (this module reads no clock). */
  date: string;
  engine?: { version: string; commit?: string };
}

export interface PfdSheet {
  kind: "figure" | "tableContinued";
  sector: string;
  caption: string;
  size: PageSizeName;
  figure?: PfdFigure;
  legend: PfdLegendItem[];
  table: StreamTable;
  /** The columns of `table` this sheet draws: [from, to). */
  from: number;
  to: number;
  /** 1-based sheet number and the total, filled once all sheets exist. */
  n: number;
  N: number;
}

export interface PfdBuildInput {
  views: PfdView[];
  numberOf: (streamName: string) => number | undefined;
  componentMolarMass?: { [c: string]: number };
  forced?: PageSizeName;
}

/** All the sheets of a plant: per view one figure sheet plus, when the table
 *  does not fit, the continuation sheets.  Numbered n of N over the whole
 *  set, in view order. */
export function buildPfdSheets(inp: PfdBuildInput): PfdSheet[] {
  const out: PfdSheet[] = [];
  for (const v of inp.views) {
    const table = buildStreamTable(v.streams, inp.numberOf, inp.componentMolarMass);
    const nameChars = Math.min(40, Math.max(0, ...table.columns.map((c) => c.name.length)));
    const ch = choosePageSize({
      nStreams: table.columns.length, nComponents: table.components.length,
      hasSolids: table.rowLabels.includes("solids (kg/h)"), nameChars, forced: inp.forced,
    });
    let at = 0;
    const blocks = [...ch.blocks];
    let first: number | undefined;
    if (ch.firstBlockOnFigure) first = blocks.shift();
    else if (blocks.length === 1 && blocks[0] === 0) blocks.shift();
    const take = (k: number): [number, number] => { const r: [number, number] = [at, at + k]; at += k; return r; };
    const [f0, f1] = first !== undefined ? take(first) : [0, 0];
    out.push({ kind: "figure", sector: v.sector, caption: v.caption, size: ch.size,
               figure: v.figure, legend: v.legend, table, from: f0, to: f1, n: 0, N: 0 });
    for (const k of blocks) {
      const [a, b] = take(k);
      out.push({ kind: "tableContinued", sector: v.sector, caption: v.caption, size: ch.size,
                 legend: [], table, from: a, to: b, n: 0, N: 0 });
    }
  }
  out.forEach((s, i) => { s.n = i + 1; s.N = out.length; });
  return out;
}

/* ---- drawing one sheet (millimetres) -------------------------------------- */

const FONT = "Helvetica, Arial, sans-serif";
const MONO = "Menlo, Consolas, 'DejaVu Sans Mono', monospace";
const r1 = (v: number) => String(Math.round(v * 100) / 100);

function figureSvgIn(fig: PfdFigure, x: number, y: number, w: number, h: number): string {
  const svg = buildFlowsheetSvg({ title: "", nodes: fig.nodes, edges: fig.edges, legends: [], bare: true });
  const m = /<svg ([^>]*)>/.exec(svg);
  const fw = Number(/ width="([\d.]+)"/.exec(m?.[1] ?? "")?.[1] ?? 0);
  const fh = Number(/ height="([\d.]+)"/.exec(m?.[1] ?? "")?.[1] ?? 0);
  const vb = /viewBox="([^"]+)"/.exec(m?.[1] ?? "")?.[1] ?? `0 0 ${fw} ${fh}`;
  const inner = svg.replace(/^<svg [^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function tableSvg(t: StreamTable, from: number, to: number, x: number, y: number): { svg: string; h: number } {
  const cols = t.columns.slice(from, to);
  const nameChars = Math.min(40, Math.max(0, ...t.columns.map((c) => c.name.length)));
  const nameH = Math.min(NAME_ROW_MAX_MM, nameChars * CHAR_MM + 3);
  const o: string[] = [];
  const w = LABEL_COL_MM + cols.length * COL_MM;
  const fs = MIN_TEXT_MM;
  //  names, vertical, read bottom-to-top, ending at the "#" row
  o.push(`<text x="${r1(x + 1)}" y="${r1(y + nameH - 1)}" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="#111">stream</text>`);
  cols.forEach((c, i) => {
    const cx = x + LABEL_COL_MM + i * COL_MM + COL_MM / 2 + fs * 0.35;
    const maxChars = Math.floor((nameH - 2) / CHAR_MM);
    const nm = c.name.length > maxChars ? "…" + c.name.slice(c.name.length - maxChars + 1) : c.name;
    o.push(`<text transform="translate(${r1(cx)},${r1(y + nameH - 1)}) rotate(-90)" font-family="${MONO}" font-size="${fs}" fill="#111">${xmlEscape(nm)}</text>`);
  });
  let ry = y + nameH;
  const row = (label: string, cells: string[], bold = false) => {
    o.push(`<line x1="${r1(x)}" y1="${r1(ry)}" x2="${r1(x + w)}" y2="${r1(ry)}" stroke="#9ca3af" stroke-width="0.12"/>`);
    const ty = ry + ROW_MM - (ROW_MM - fs) / 2 - 0.35;
    o.push(`<text x="${r1(x + 1)}" y="${r1(ty)}" font-family="${FONT}" font-size="${fs}" font-weight="${bold ? 700 : 400}" fill="#111">${xmlEscape(label)}</text>`);
    cells.forEach((cell, i) => {
      const cx = x + LABEL_COL_MM + (i + 1) * COL_MM - 1;
      o.push(`<text x="${r1(cx)}" y="${r1(ty)}" text-anchor="end" font-family="${MONO}" font-size="${fs}" font-weight="${bold ? 700 : 400}" fill="#111">${xmlEscape(cell)}</text>`);
    });
    ry += ROW_MM;
  };
  row("#", cols.map((c) => (c.number === undefined ? DASH : String(c.number))), true);
  t.rowLabels.forEach((lab, k) => row(lab, cols.map((c) => c.cells[k] ?? DASH)));
  o.push(`<line x1="${r1(x)}" y1="${r1(ry)}" x2="${r1(x + w)}" y2="${r1(ry)}" stroke="#374151" stroke-width="0.25"/>`);
  o.push(`<line x1="${r1(x + LABEL_COL_MM)}" y1="${r1(y)}" x2="${r1(x + LABEL_COL_MM)}" y2="${r1(ry)}" stroke="#9ca3af" stroke-width="0.12"/>`);
  o.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(ry - y)}" fill="none" stroke="#374151" stroke-width="0.25"/>`);
  return { svg: o.join(""), h: ry - y };
}

function legendSvg(items: PfdLegendItem[], x: number, y: number, w: number): { svg: string; h: number } {
  if (!items.length) return { svg: "", h: 0 };
  const fs = MIN_TEXT_MM, lh = 1.35 * fs;
  const colW = 70, perRow = Math.max(1, Math.floor(w / colW));
  const o: string[] = [];
  const group = (kind: PfdLegendItem["kind"], title: string, y0: number): number => {
    const its = items.filter((i) => i.kind === kind);
    if (!its.length) return y0;
    o.push(`<text x="${r1(x)}" y="${r1(y0 + fs)}" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="#111">${xmlEscape(title)}</text>`);
    let yy = y0 + lh;
    its.forEach((it, i) => {
      const cx = x + (i % perRow) * colW, cy = yy + Math.floor(i / perRow) * lh;
      o.push(`<text x="${r1(cx)}" y="${r1(cy + fs)}" font-family="${MONO}" font-size="${fs}" fill="#111">${xmlEscape(it.text)}</text>`);
    });
    return yy + Math.ceil(its.length / perRow) * lh + 0.8;
  };
  let yy = group("utility", "Utilities", y);
  yy = group("tag", "Equipment", yy);
  return { svg: o.join(""), h: yy - y };
}

function titleBlockSvg(s: PfdSheet, meta: PfdMeta, x: number, y: number, w: number): string {
  const h = TITLE_BLOCK_MM;
  const cells: { label: string; value: string; w: number }[] = [
    { label: "CASE", value: meta.caseName, w: 0.30 },
    { label: "SHEET", value: s.kind === "figure"
        ? `Process flow diagram — ${s.caption}`
        : `${s.caption} — stream table, continued`, w: 0.30 },
    { label: "DATE", value: meta.date, w: 0.10 },
    { label: "ENGINE", value: meta.engine
        ? `${meta.engine.version}${meta.engine.commit ? " · " + meta.engine.commit : ""}`
        : "version not published", w: 0.18 },
    { label: "SHEET", value: `sheet ${s.n} of ${s.N}`, w: 0.12 },
  ];
  const o: string[] = [`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${h}" fill="#fff" stroke="#111" stroke-width="0.35"/>`];
  let cx = x;
  for (const c of cells) {
    const cw = c.w * w;
    if (cx > x) o.push(`<line x1="${r1(cx)}" y1="${r1(y)}" x2="${r1(cx)}" y2="${r1(y + h)}" stroke="#111" stroke-width="0.2"/>`);
    o.push(`<text x="${r1(cx + 1.5)}" y="${r1(y + 4)}" font-family="${FONT}" font-size="${MIN_TEXT_MM}" fill="#555">${c.label}</text>`);
    const maxChars = Math.floor((cw - 3) / (0.6 * 4));
    const lines = wrap(c.value, maxChars).slice(0, 3);
    lines.forEach((ln, i) => o.push(`<text x="${r1(cx + 1.5)}" y="${r1(y + 10 + i * 5)}" font-family="${FONT}" font-size="4" font-weight="700" fill="#111">${xmlEscape(ln)}</text>`));
    cx += cw;
  }
  return o.join("");
}

function wrap(s: string, max: number): string[] {
  if (s.length <= max || max < 4) return [s];
  const words = s.split(/(?<=[\s·—/_.-])/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length > max && cur) { lines.push(cur.trimEnd()); cur = w; }
    else cur += w;
  }
  if (cur) lines.push(cur.trimEnd());
  return lines;
}

/** One sheet as a complete SVG document body (units: millimetres). */
export function sheetSvg(s: PfdSheet, meta: PfdMeta): string {
  const { w: W, h: H } = PAGE_MM[s.size];
  const m = MARGIN_MM;
  const innerW = W - 2 * m;
  const o: string[] = [];
  o.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
  o.push(`<rect x="${m}" y="${m}" width="${innerW}" height="${H - 2 * m}" fill="none" stroke="#111" stroke-width="0.5"/>`);
  const tbY = H - m - TITLE_BLOCK_MM;
  o.push(titleBlockSvg(s, meta, m, tbY, innerW));
  const hasCols = s.to > s.from;
  const tbl = hasCols ? tableSvg(s.table, s.from, s.to, m + 2, 0, ) : null;
  if (s.kind === "figure") {
    const pad = 2;
    const tableH = tbl ? tbl.h : 0;
    const tableY = tbl ? tbValue(tbY, tableH) : tbY - 2;
    const lg = legendSvg(s.legend, m + 2, 0, innerW - 4);
    const legendY = tableY - (lg.h ? lg.h + 1 : 0);
    if (tbl) o.push(`<g transform="translate(0,${r1(tableY)})">${tbl.svg}</g>`);
    if (lg.svg) o.push(`<g transform="translate(0,${r1(legendY)})">${lg.svg}</g>`);
    if (s.figure)
      o.push(figureSvgIn(s.figure, m + pad, m + pad, innerW - 2 * pad, legendY - m - 2 * pad));
  } else {
    o.push(`<text x="${m + 2}" y="${m + 7}" font-family="${FONT}" font-size="5" font-weight="700" fill="#111">${xmlEscape(`${s.caption} — stream table, continued (streams ${s.from + 1}–${s.to} of ${s.table.columns.length})`)}</text>`);
    if (tbl) o.push(`<g transform="translate(0,${m + 12})">${tbl.svg}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" data-sheet="${s.n}" data-size="${s.size}">${o.join("")}</svg>`;
}

function tbValue(tbY: number, tableH: number): number { return tbY - 2 - tableH; }

/* ---- the printable page ----------------------------------------------------- */

/** The whole set as one HTML page: each sheet its own printed page of its own
 *  ISO size (CSS named pages; Chromium honours them, a browser that does not
 *  prints every sheet on the first sheet's size -- the SVG per sheet is the
 *  fallback), a "Print / Save as PDF" button outside the print. */
export function pfdHtml(sheets: PfdSheet[], meta: PfdMeta): string {
  const sizes = [...new Set(sheets.map((s) => s.size))];
  const pageRules = sizes.map((z) =>
    `@page ${z.toLowerCase()} { size: ${PAGE_MM[z].w}mm ${PAGE_MM[z].h}mm; margin: 0 }\n`
    + `.sheet.${z.toLowerCase()} { page: ${z.toLowerCase()}; }`).join("\n");
  const printSizes = sizes.map((z) =>
    `.sheet.${z.toLowerCase()} svg { width: ${PAGE_MM[z].w}mm; height: ${PAGE_MM[z].h}mm; }`).join("\n");
  const body = sheets.map((s) =>
    `<section class="sheet ${s.size.toLowerCase()}" id="sheet-${s.n}">${sheetSvg(s, meta)}</section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${xmlEscape(meta.caseName)} — process flow diagram</title>
<style>
${pageRules}
body { margin: 0; background: #e5e7eb; font-family: ${FONT}; }
.bar { padding: 10px 16px; background: #111827; color: #fff; display: flex; gap: 16px; align-items: center; }
.bar button { font: inherit; padding: 4px 12px; cursor: pointer; }
.sheet { margin: 14px auto; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.35); width: min(1400px, 96%); }
.sheet svg { width: 100%; height: auto; display: block; }
@media print {
  body { background: #fff; }
  .bar { display: none; }
  .sheet { margin: 0; box-shadow: none; width: auto; break-after: page; }
  ${printSizes}
}
</style></head><body>
<div class="bar noprint"><strong>${xmlEscape(meta.caseName)}</strong>
<span>${sheets.length} sheet${sheets.length === 1 ? "" : "s"} (${sizes.join(", ")}, landscape)</span>
<button onclick="window.print()">Print / Save as PDF</button>
<span>In the print dialog choose "Save as PDF", margins None, background graphics on.</span></div>
${body}
</body></html>`;
}
