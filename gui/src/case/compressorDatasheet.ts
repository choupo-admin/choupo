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

/*  THE COMPRESSOR DATASHEET (DEV.md 4c C440 gap 4).
 *
 *  The page is built from the engine's own sheet (`design/<unit>/compressor`)
 *  and from nothing else: the machine, its selection, the stages, the
 *  intercoolers and the driver are read, never recomputed here (the GUI draws
 *  the engine's numbers and computes none).  Every value keeps the unit the
 *  SIZER declared.  A sheet without a `compressor {}` block (the power-only
 *  route) yields null: no datasheet is drawn in its place.
 */
import type { DesignSheet, DesignValue } from "./designSheet.js";

export interface CompressorStageRow {
  n: number;
  ratio?: DesignValue;
  Pin?: DesignValue;
  Pout?: DesignValue;
  Tin?: DesignValue;
  Tout?: DesignValue;
  head?: DesignValue;
  power?: DesignValue;
  elements?: DesignValue;
}
export interface CompressorIntercoolerRow {
  n: number;
  duty?: DesignValue;
  Tin?: DesignValue;
  Tout?: DesignValue;
  dP?: DesignValue;
}
export interface CompressorView {
  tag: string;
  machine: string;
  machineBy: string;
  selection: string;
  limiting: string;
  driver: string;
  stages: CompressorStageRow[];
  intercoolers: CompressorIntercoolerRow[];
  totals: { label: string; value: DesignValue }[];
  sources: { key: string; source: string }[];
  declared: string[];
  notes: string[];
}

const TOTALS: [string, string][] = [
  ["Inlet flow", "Q_inlet"],
  ["Overall pressure ratio", "rOverall"],
  ["Ratio per stage", "rStage"],
  ["Hottest discharge", "T_dischargeMax"],
  ["Discharge limit", "T_dischargeLimit"],
  ["Gas power (staged)", "powerGas"],
  ["Shaft power (staged)", "powerShaft"],
  ["Unit's single-pass power (costing size)", "powerUnitSinglePass"],
  ["Intercoolers, total duty", "Q_intercoolers"],
  ["Driver rating", "driverRating"],
  ["Driver margin", "driverMargin"],
  ["Electrical input", "powerElectric"],
  ["Impellers / blade rows", "nElements"],
  ["Casings", "nCasings"],
];

/** The sheet's compressor design as rows, or null when the sheet has none. */
export function compressorView(sheet: DesignSheet | null): CompressorView | null {
  const c = sheet?.compressor;
  if (!sheet || !c || c.machine === "") return null;
  const v = new Map<string, DesignValue>();
  for (const s of sheet.sizing) v.set(s.key, s);
  const stages: CompressorStageRow[] = [];
  for (let i = 1; i <= c.stages; i++) {
    const p = `stage${i}_`;
    stages.push({
      n: i, ratio: v.get(`${p}ratio`), Pin: v.get(`${p}Pin`), Pout: v.get(`${p}Pout`),
      Tin: v.get(`${p}Tin`), Tout: v.get(`${p}Tout`), head: v.get(`${p}head`),
      power: v.get(`${p}power`), elements: v.get(`${p}elements`),
    });
  }
  const inter: CompressorIntercoolerRow[] = [];
  for (let i = 1; i <= c.intercoolers; i++) {
    const p = `intercooler${i}_`;
    inter.push({ n: i, duty: v.get(`${p}duty`), Tin: v.get(`${p}Tin`),
      Tout: v.get(`${p}Tout`), dP: v.get(`${p}dP`) });
  }
  const totals: { label: string; value: DesignValue }[] = [];
  for (const [label, key] of TOTALS) {
    const x = v.get(key);
    if (x) totals.push({ label, value: x });
  }
  return {
    tag: sheet.unit, machine: c.machine, machineBy: c.machineBy,
    selection: c.selection, limiting: c.limiting, driver: c.driver,
    stages, intercoolers: inter, totals, sources: c.sources,
    declared: c.declared, notes: c.notes,
  };
}

/** A value as the sheet wrote it: six significant digits, then its own unit. */
export function cell(x: DesignValue | undefined): string {
  if (!x) return "—";
  const n = Number(x.value.toPrecision(6)).toString();
  return x.unit === "-" || x.unit === "" ? n : `${n} ${x.unit}`;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The printable page (self-contained HTML). */
export function compressorDatasheetHtml(view: CompressorView): string {
  const stageRows = view.stages.map((s) =>
    `<tr><td>${s.n}</td><td>${cell(s.ratio)}</td><td>${cell(s.Pin)}</td><td>${cell(s.Pout)}</td>`
    + `<td>${cell(s.Tin)}</td><td>${cell(s.Tout)}</td><td>${cell(s.head)}</td>`
    + `<td>${cell(s.power)}</td><td>${s.elements ? cell(s.elements) : "—"}</td></tr>`).join("");
  const interRows = view.intercoolers.map((i) =>
    `<tr><td>${i.n}</td><td>${cell(i.duty)}</td><td>${cell(i.Tin)}</td><td>${cell(i.Tout)}</td>`
    + `<td>${cell(i.dP)}</td></tr>`).join("");
  const totals = view.totals.map((t) =>
    `<tr><td>${esc(t.label)}</td><td>${cell(t.value)}</td></tr>`).join("");
  const sources = view.sources.map((s) =>
    `<li><b>${esc(s.key)}</b> — ${esc(s.source)}</li>`).join("");
  const notes = view.notes.map((n) => `<li>${esc(n)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(view.tag)} compressor</title>`
    + `<style>body{font-family:system-ui,sans-serif;margin:24px;max-width:960px}`
    + `table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #bbb;padding:3px 8px;text-align:right}`
    + `th{background:#eee}td:first-child{text-align:left}</style></head><body>`
    + `<h2>Compressor ${esc(view.tag)} — ${esc(view.machine)} (${esc(view.machineBy)})</h2>`
    + `<p>${esc(view.selection)}</p><p>Sections: ${esc(view.limiting)}. Driver: ${esc(view.driver)}.</p>`
    + `<h3>Stages</h3><table><tr><th>stage</th><th>ratio</th><th>P in</th><th>P out</th><th>T in</th>`
    + `<th>T out</th><th>polytropic head</th><th>shaft power</th><th>impellers / rows</th></tr>${stageRows}</table>`
    + (interRows ? `<h3>Intercoolers (listed, not plant items)</h3><table><tr><th>cooler</th><th>duty</th>`
      + `<th>T in</th><th>T out</th><th>pressure drop</th></tr>${interRows}</table>` : "")
    + `<h3>Totals and driver</h3><table>${totals}</table>`
    + (sources ? `<h3>Inputs the case did not declare, and the page each was read at</h3><ul>${sources}</ul>` : "")
    + (notes ? `<h3>Limits of the method</h3><ul>${notes}</ul>` : "")
    + `</body></html>`;
}

/** The numbers as spreadsheet rows. */
export function compressorOdsRows(view: CompressorView): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const add = (q: string, x: DesignValue | undefined) => {
    if (x) rows.push([q, x.value, x.unit === "-" ? "" : x.unit, "sized by Choupo (design/)"]);
  };
  for (const s of view.stages) {
    add(`stage ${s.n} ratio`, s.ratio); add(`stage ${s.n} T out`, s.Tout);
    add(`stage ${s.n} head`, s.head); add(`stage ${s.n} power`, s.power);
  }
  for (const i of view.intercoolers) add(`intercooler ${i.n} duty`, i.duty);
  for (const t of view.totals) add(t.label, t.value);
  return rows;
}
