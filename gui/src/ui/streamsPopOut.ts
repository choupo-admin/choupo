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
  Streams pop-out: open the streams result table in a SEPARATE browser
  window so the student can read the table side-by-side with the
  flowsheet.  Replaces the full-screen Modal pattern (which is
  interruptive).  Pure HTML/CSS in the new window — no React, no
  Mantine — so it loads instantly and prints cleanly.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import { computePerStream } from "../case/streamComposition.js";
import {
  flowBasis,
  formatFlow,
  formatPressure,
  formatSig,
  formatTemperature,
  temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";
import { openHtmlInNewTab, popoutColors } from "./filePopOut.js";

export function popOutStreamsHtml(result: RunResult, prefs: DisplayPrefs): void {
  if (!result.streams || result.streams.length === 0) {
    alert("No streams to display.  Press Run first.");
    return;
  }
  const C = popoutColors();
  let body: string;
  try {
    body = buildHtml(result, prefs);
  } catch (e) {
    // Surface the failure in the new tab instead of silently producing
    // a blank page --- earlier sessions had a blank-tab incident that
    // was impossible to diagnose without an inline error.
    body = `<pre style="margin:24px;color:${C.red};font:13px/1.5 monospace;white-space:pre-wrap;">
ERROR while building streams pop-out:
${escSafe((e as Error).stack ?? (e as Error).message ?? String(e))}

This is a bug.  result.streams was:
${escSafe(safeStringify(result.streams))}
</pre>`;
  }
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — Streams (${result.streams.length})</title>
</head><body style="margin:0;background:${C.bg};color:${C.text};font-family:system-ui,sans-serif;">${body}</body></html>`;
  openHtmlInNewTab(html);
}

function escSafe(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}
function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2); }
  catch (e) { return "(could not stringify: " + (e as Error).message + ")"; }
}

function buildHtml(result: RunResult, prefs: DisplayPrefs): string {
  const C = popoutColors();
  const massBasis = flowBasis(prefs.flow) === "mass";
  const fracPrefix = massBasis ? "w" : "x";

  // Component set (union of all stream compositions, sorted).
  const compSet = new Set<string>();
  for (const s of result.streams) for (const c of Object.keys(s.composition ?? {})) compSet.add(c);
  for (const s of result.streams) if (s.solids) for (const c of Object.keys(s.solids)) compSet.add(c);
  const components = Array.from(compSet).sort();

  const hasSolids = result.streams.some((s) => (s.F_solid_mass ?? 0) > 1e-12);

  // Mass-basis flow needs MWs to convert from kmol/s.  Shared with
  // StreamsTable.tsx via case/streamComposition.ts -- same numbers in
  // the in-app tab and this pop-out, always.
  const mws = result.componentMolarMass;

  const perStream = computePerStream(result.streams, mws);

  const headerCells: string[] = [
    "Stream", "Role",
    `F (${prefs.flow})`,
    `T (${temperatureLabel(prefs.temperature)})`,
    `P (${prefs.pressure})`,
    "vf",
  ];
  if (hasSolids) headerCells.push("solids (kg/h)");
  for (const c of components) headerCells.push(`${fracPrefix}_${c}`);

  const rows = result.streams.map((s) => {
    const ps = perStream[s.name] ?? { molFrac: {}, massFrac: {}, totMol: s.F, totMass: 0 };
    const F_si = massBasis ? ps.totMass : ps.totMol;
    const cells: string[] = [
      esc(s.name),
      `<span class="role role-${s.role}">${s.role}</span>`,
      cellRight(massBasis && mws === undefined ? "—" : formatFlow(F_si, prefs.flow, 4)),
      cellRight(formatTemperature(s.T, prefs.temperature, 2)),
      cellRight(formatPressure(s.P, prefs.pressure, 3)),
      // formatSig, same as the in-app Streams tab --- the two tables must
      // never quote the same vf two different ways.
      cellRight(s.vf === undefined ? "—" : formatSig(s.vf)),
    ];
    if (hasSolids) {
      cells.push(cellRight(
        (s.F_solid_mass ?? 0) > 1e-12 ? ((s.F_solid_mass ?? 0) * 3600).toFixed(2) : "—"
      ));
    }
    for (const c of components) {
      const v = massBasis ? ps.massFrac[c] : ps.molFrac[c];
      cells.push(cellRight(v !== undefined ? v.toFixed(4) : "—"));
    }
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  });

  return `
    <style>
      body { margin: 0; background: ${C.bg}; color: ${C.text}; font-family: system-ui, sans-serif; }
      h2 { margin: 16px 24px; font-size: 18px; font-weight: 500; color: ${C.text}; }
      table {
        border-collapse: collapse;
        margin: 12px 24px 24px;
        font: 13px/1.4 'JetBrains Mono', Consolas, monospace;
        background: ${C.panel};
      }
      th { padding: 8px 14px; text-align: left; font-weight: 500;
           border-bottom: 1px solid ${C.border}; color: ${C.dim}; }
      th.right, td.right { text-align: right; }
      td { padding: 6px 14px; border-bottom: 1px solid ${C.cell}; }
      tr:hover td { background: ${C.cell}; }
      .role { display: inline-block; padding: 1px 8px; border-radius: 3px;
              font-size: 11px; font-weight: 500; text-transform: uppercase;
              letter-spacing: 0.05em; }
      .role-feed         { background: ${C.liquidTint}; color: ${C.blue}; }
      .role-intermediate { background: ${C.border}; color: ${C.text}; }
      .role-product      { background: ${C.vapourTint}; color: ${C.orange}; }
    </style>
    <h2>Streams (${result.streams.length})</h2>
    <table>
      <thead><tr>${headerCells.map((h, i) => `<th${i >= 2 ? ' class="right"' : ''}>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function cellRight(text: string): string {
  return `<span class="right">${esc(text)}</span>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
