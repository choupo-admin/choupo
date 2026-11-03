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
  THE PRINTABLE EQUIPMENT LIST (slice S1 of the plant document set, DEV.md 4c
  C210; architect's decision Q2: print-to-PDF from a generated HTML page, the
  route the heat-exchanger and column datasheets already use).

  A PURE BUILDER.  It takes the rows the ENGINE built (`result/EquipmentList`,
  the rows of `reports/equipment/equipmentList.csv`) and lays them out.  It
  computes nothing: no size, no pressure, no cost and no total.  A sum the
  page showed would be a second home for a number the engine already
  publishes, and the credo is that the GUI draws.  Every value is printed in
  the unit the sizer declared; a number the item does not have is a dash.

  The page is titled with the case and the engine version, carries its own
  Print / Save as PDF button, and sets `@page` to A3 landscape: the list has
  nineteen columns and a PDF at A4 portrait would shrink them past reading.
\*---------------------------------------------------------------------------*/

import type { EquipmentListRow } from "../adapters/SolverAdapter.js";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");

const num = (v: number | null, digits = 4): string =>
  v === null || v === undefined ? "—" : Number(v.toPrecision(digits)).toString();

const money = (v: number | null): string =>
  v === null || v === undefined ? "—"
    : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** The page.  `caseName` is the case the list belongs to; `version` the
 *  engine's label (`engineVersionLabel`), or null when the stamp is unread --
 *  then the page says so rather than guess. */
export function equipmentListHtml(
  rows: EquipmentListRow[], caseName: string, version: string | null,
): string {
  const anySector = rows.some((r) => !!r.sector);
  const head = [
    "tag", "item", ...(anySector ? ["sector"] : []), "equipment", "installed",
    "size", "dimensions", "design P", "material",
    "purchased", "bare module", "cost note",
  ];
  const body = rows.map((r) => {
    const size = r.sizeKey && r.sizeValue !== null
      ? `${esc(r.sizeKey)} ${num(r.sizeValue)}${r.sizeUnit && r.sizeUnit !== "-" ? " " + esc(r.sizeUnit) : ""}`
      : "—";
    const p = r.pressureDesign !== null
      ? `${num(r.pressureDesign)} ${esc(r.pressureUnit)}` : "—";
    const cur = r.currency ? ` ${esc(r.currency)}` : "";
    return `<tr>`
      + `<td class="tag${r.tagBy === "declared" ? " decl" : ""}">${esc(r.tag)}</td>`
      + `<td>${esc(r.itemId)}</td>`
      + (anySector ? `<td>${esc(r.sector)}</td>` : "")
      + `<td>${esc(r.equipment)}</td>`
      + `<td class="n">${r.installed}</td>`
      + `<td class="n">${size}</td>`
      + `<td>${esc(r.dimensions) || "—"}</td>`
      + `<td class="n">${p}</td>`
      + `<td>${esc(r.material) || "—"}</td>`
      + `<td class="n">${money(r.purchased)}${r.purchased !== null ? cur : ""}</td>`
      + `<td class="n">${money(r.bareModule)}${r.bareModule !== null ? cur : ""}</td>`
      + `<td>${esc(r.costNote)}</td>`
      + `</tr>`;
  }).join("\n");
  const title = `Equipment list — ${esc(caseName)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page{size:A3 landscape;margin:10mm}
  body{font:12px/1.35 system-ui,Segoe UI,Helvetica,Arial,sans-serif;margin:12mm auto;max-width:410mm;color:#111}
  h1{font-size:20px;margin:0 0 2px}
  .sub{color:#555;margin-bottom:10px}
  table.ds{border-collapse:collapse;width:100%;font-size:11px}
  table.ds th,table.ds td{border:1px solid #bbb;padding:3px 6px;vertical-align:top;text-align:left}
  table.ds th{background:#eee}
  table.ds td.n{text-align:right;font-variant-numeric:tabular-nums}
  td.tag{font-family:ui-monospace,Consolas,monospace;font-weight:700;white-space:nowrap}
  td.decl::after{content:" (declared)";font-weight:400;color:#555;font-size:10px}
  tr{break-inside:avoid}
  .foot{margin-top:10px;color:#555;font-size:11px}
  @media print{body{margin:0} .noprint{display:none} thead{display:table-header-group}}
</style></head><body>
<h1>${title}</h1>
<div class="sub">${rows.length} item(s) · ${version ? esc(version) : "engine version not read"} · tags follow the convention <code>XX-YZZ A/B</code> (kind letters, sector number, running number, parallel letter)</div>
<table class="ds"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>
${body}
</tbody></table>
<div class="foot">Nothing on this page is recomputed by the browser: it is the equipment list the run wrote
  (<code>reports/equipment/equipmentList.csv</code>), every value in the unit its sizer declared. A dash is a
  value the item does not have. The cost columns are the costing pass's own numbers; an item with no cost
  says why in the last column. Print → PDF with your browser.</div>
<p class="noprint" style="margin-top:12px"><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`;
}
