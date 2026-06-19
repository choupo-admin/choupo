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
  Single-unit pop-out: open ONE unit op's "hardware" (its operation block,
  in the chosen display units, plus the latest-run KPIs) in a separate
  browser tab.  Mirrors popOutSingleStream but for a unit selected /
  double-clicked on the flowsheet canvas.  Per the GUI credo, a plain unit
  op (one that is NOT a fractal sub-case) opens its detail in a new tab on
  double-click --- "pop-out beats modal", and the flowsheet stays visible.
\*---------------------------------------------------------------------------*/

import { operationSchemaFor } from "../case/operationSchemas.js";
import {
  formatFlow,
  formatPressure,
  formatTemperature,
  temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";
import { openHtmlInNewTab, popoutColors } from "./filePopOut.js";

type JsonVal = unknown;

// One operation value, converted to the student's display units when the
// schema declares a dimension the GUI knows (K / Pa / kmol/s); otherwise
// the schema's unit label as-is, or a readable form for arrays / dicts.
function fmtValue(v: JsonVal, unit: string | undefined, prefs: DisplayPrefs): string {
  if (typeof v === "number") {
    if (unit === "K") return `${formatTemperature(v, prefs.temperature, 2)} ${temperatureLabel(prefs.temperature)}`;
    if (unit === "Pa") return `${formatPressure(v, prefs.pressure, 3)} ${prefs.pressure}`;
    if (unit === "kmol/s") return `${formatFlow(v, prefs.flow, 4)} ${prefs.flow}`;
    return unit ? `${fmtNum(v)} ${unit}` : fmtNum(v);
  }
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === "object" && "name" in (x as object)
        ? String((x as { name: unknown }).name)
        : typeof x === "number" ? fmtNum(x) : String(x)))
      .join(", ");
  }
  if (v && typeof v === "object") return "{…}";
  return String(v);
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1e4 || (n !== 0 && Math.abs(n) < 1e-2)) return n.toExponential(3);
  return String(n);
}

export function popOutUnitByName(name: string): void {
  void import("../state/store.js").then(({ useStore }) => {
    const state = useStore.getState();
    const flowsheet = state.caseFiles.flowsheet as
      | { units?: Array<{ [k: string]: JsonVal }> }
      | undefined;
    const u = flowsheet?.units?.find((x) => x["name"] === name);
    if (!u) return;
    const type = String(u["type"] ?? "?");
    const model = typeof u["model"] === "string" ? (u["model"] as string) : "";
    const operation = (u["operation"] ?? {}) as { [k: string]: JsonVal };
    const inputs = u["in"] ?? u["inputs"];
    const outputs = u["outputs"];
    const prefs = state.displayPrefs;
    const schema = operationSchemaFor(type);
    const unitOf = (k: string): string | undefined =>
      schema?.fields.find((f) => f.key === k)?.unit;

    const opRows = Object.entries(operation);
    const kpis = state.runResult?.kpis?.[name];
    const kpiRows = kpis ? Object.entries(kpis).sort(([a], [b]) => a.localeCompare(b)) : [];

    const names = (v: JsonVal): string[] =>
      Array.isArray(v) ? (v as string[]).map(String) : v === undefined ? [] : [String(v)];
    const inNames = names(inputs);
    const outNames = names(outputs);

    // Resolved stream conditions from the latest run (array keyed by name).
    const streams = state.runResult?.streams ?? [];
    const findStream = (nm: string) => streams.find((s) => s.name === nm);
    const streamRow = (nm: string, dir: string): string => {
      const s = findStream(nm);
      if (!s) return `<tr><td>${esc(nm)}</td><td class="label">${dir}</td>`
        + `<td colspan="4" class="empty">— run to see conditions</td></tr>`;
      const comp = Object.entries(s.composition ?? {})
        .filter(([, x]) => (x as number) > 1e-4)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 4)
        .map(([c, x]) => `${esc(c)} ${(x as number).toFixed(3)}`).join(" · ");
      return `<tr>
        <td>${esc(nm)}</td>
        <td class="label">${dir}</td>
        <td class="right">${esc(formatFlow(s.F, prefs.flow, 4))} ${esc(prefs.flow)}</td>
        <td class="right">${esc(formatTemperature(s.T, prefs.temperature, 2))} ${esc(temperatureLabel(prefs.temperature))}</td>
        <td class="right">${esc(formatPressure(s.P, prefs.pressure, 3))} ${esc(prefs.pressure)}</td>
        <td>${comp || "—"}</td>
      </tr>`;
    };

    // Heat duty (heaters / coolers / HX): the resolved Q (W -> kW) + the
    // utility the solver allocated it to (utilityAllocation, empty port).
    const Qw = typeof kpis?.["Q"] === "number" ? (kpis!["Q"] as number) : undefined;
    const alloc = state.runResult?.utilityAllocation?.find(
      (a) => a.unit === name && a.port === "");
    const dutySection = Qw === undefined ? "" : `<section>
  <h3>Heat duty</h3>
  <table>
    <tr><td class="label">Q</td><td class="right">${Qw > 0 ? "+" : ""}${(Qw / 1000).toFixed(1)} kW (${Qw > 0 ? "heating" : "cooling"})</td></tr>
    ${alloc ? `<tr><td class="label">utility</td><td class="right">${esc(alloc.utility)}${alloc.eur_h ? `  ·  ${alloc.eur_h.toFixed(1)} €/h` : ""}</td></tr>` : ""}
  </table>
</section>`;

    const C = popoutColors();
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — ${esc(name)}</title>
<style>
  body { margin: 0; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 22px; font-weight: 500;
       font-family: 'JetBrains Mono', monospace; color: ${C.accent}; }
  /* No text-transform: ALL-CAPS is reserved for SECTOR names (the
     UPPER_CASE naming convention).  A unit TYPE reads in its natural
     camelCase (gibbsReactor) so it is never mistaken for a sector.
     Neutral grey, not the feed/sector blue. */
  .type { display: inline-block; padding: 2px 10px; border-radius: 3px;
          background: ${C.unitTint}; color: ${C.accent}; font-size: 12px; font-weight: 500;
          letter-spacing: 0.02em; margin: 0 6px 16px 0;
          font-family: 'JetBrains Mono', monospace; }
  .model { display: inline-block; padding: 2px 10px; border-radius: 3px;
           background: ${C.border}; color: ${C.text}; font-size: 11px; font-weight: 500;
           margin-bottom: 16px; }
  table { border-collapse: collapse; background: ${C.panel}; min-width: 360px;
          font: 13px/1.6 'JetBrains Mono', monospace; margin-bottom: 16px; }
  th { padding: 6px 16px; text-align: left; color: ${C.dim}; font-weight: 500;
       border-bottom: 1px solid ${C.border}; }
  td { padding: 6px 16px; border-bottom: 1px solid ${C.cell}; }
  td.right { text-align: right; }
  td.label { color: ${C.dim}; }
  section { margin-bottom: 24px; }
  h3 { font-size: 12px; font-weight: 600; text-transform: uppercase;
       letter-spacing: 0.06em; color: ${C.dim}; margin: 0 0 8px; }
  .empty { color: ${C.dim}; font-style: italic; }
</style>
</head><body>
<h1>${esc(name)}</h1>
<div><span class="type">${esc(type)}</span>${model ? `<span class="model">${esc(model)}</span>` : ""}</div>

<section>
  <h3>Streams</h3>
  ${inNames.length + outNames.length === 0
    ? '<p class="empty">No connected streams.</p>'
    : `<table>
    <tr><th>stream</th><th>dir</th><th style="text-align:right;">F</th><th style="text-align:right;">T</th><th style="text-align:right;">P</th><th>composition</th></tr>
    ${inNames.map((n) => streamRow(n, "in")).join("")}
    ${outNames.map((n) => streamRow(n, "out")).join("")}
  </table>`}
</section>

${dutySection}

<section>
  <h3>Operation (hardware)</h3>
  ${opRows.length === 0
    ? '<p class="empty">No operation parameters — this unit has no knobs (defaults / inherited).</p>'
    : `<table>
    <tr><th>parameter</th><th style="text-align:right;">value</th></tr>
    ${opRows.map(([k, v]) => `<tr>
      <td>${esc(k)}</td>
      <td class="right">${esc(fmtValue(v, unitOf(k), prefs))}</td>
    </tr>`).join("")}
  </table>`}
</section>

${kpiRows.length === 0 ? "" : `<section>
  <h3>Latest results</h3>
  <table>
    <tr><th>kpi</th><th style="text-align:right;">value</th></tr>
    ${kpiRows.map(([k, v]) => `<tr>
      <td>${esc(k)}</td>
      <td class="right">${esc(fmtNum(v as number))}</td>
    </tr>`).join("")}
  </table>
</section>`}
</body></html>`;
    openHtmlInNewTab(html);
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[c]!);
}
