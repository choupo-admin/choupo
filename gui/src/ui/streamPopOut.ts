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
  Single-stream pop-out: open ONE stream's details (T / P / F /
  composition) in a separate browser tab.  Mirrors the table pop-out
  but for a specific stream selected on the flowsheet canvas.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";
import {
  flowBasis,
  formatFlow,
  formatPressure,
  formatTemperature,
  temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";
import { openHtmlInNewTab, popoutColors } from "./filePopOut.js";

/** Open ONE stream in a new browser tab.  `stream` may come from the
 *  flowsheetDict (declared feeds) or from the runResult (any stream
 *  the solver touched).  The shape is the same minimal {F,T,P,
 *  composition} — both are accepted. */
export function popOutSingleStream(args: {
  name: string;
  role?: string;
  F?: number;
  T?: number;
  P?: number;
  composition?: { [c: string]: number };
  prefs: DisplayPrefs;
  runStream?: StreamResult;
}): void {
  const massBasis = flowBasis(args.prefs.flow) === "mass";

  // Prefer the runResult values when present (they are exact post-solve);
  // fall back to the declared values from the flowsheetDict.
  const F  = args.runStream?.F ?? args.F;
  const T  = args.runStream?.T ?? args.T;
  const P  = args.runStream?.P ?? args.P;
  const composition = args.runStream?.composition ?? args.composition ?? {};
  const role = args.role ?? args.runStream?.role ?? "stream";

  const compRows = Object.entries(composition).sort((a, b) => b[1] - a[1]);

  const C = popoutColors();
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — ${esc(args.name)}</title>
<style>
  body { margin: 0; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 22px; font-weight: 500;
       font-family: 'JetBrains Mono', monospace; color: ${C.accent}; }
  .role { display: inline-block; padding: 2px 10px; border-radius: 3px;
          font-size: 11px; font-weight: 500; text-transform: uppercase;
          letter-spacing: 0.05em; margin-bottom: 16px; }
  .role-feed         { background: ${C.liquidTint}; color: ${C.blue}; }
  .role-intermediate { background: ${C.border}; color: ${C.text}; }
  .role-product      { background: ${C.vapourTint}; color: ${C.orange}; }
  .role-stream       { background: ${C.border}; color: ${C.text}; }
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
  .bar { display: inline-block; height: 6px; background: ${C.accent}; border-radius: 3px;
         vertical-align: middle; margin-right: 8px; }
</style>
</head><body>
<h1>${esc(args.name)}</h1>
<div class="role role-${esc(role)}">${esc(role)}</div>

<section>
  <h3>Conditions</h3>
  <table>
    <tr><td class="label">F</td><td class="right">${esc(formatFlow(F as number, args.prefs.flow, 6))} ${args.prefs.flow}</td></tr>
    <tr><td class="label">T</td><td class="right">${esc(formatTemperature(T as number, args.prefs.temperature, 3))} ${temperatureLabel(args.prefs.temperature)}</td></tr>
    <tr><td class="label">P</td><td class="right">${esc(formatPressure(P as number, args.prefs.pressure, 3))} ${args.prefs.pressure}</td></tr>
  </table>
</section>

<section>
  <h3>Composition (${massBasis ? "mass" : "mole"} fraction)</h3>
  ${compRows.length === 0 ? `<p style="color:${C.dim};font-style:italic;">(empty)</p>` : `<table>
    <tr><th>component</th><th style="text-align:right;">x</th><th></th></tr>
    ${compRows.map(([c, x]) => `<tr>
      <td>${esc(c)}</td>
      <td class="right">${x.toFixed(4)}</td>
      <td><span class="bar" style="width:${Math.max(2, x * 180).toFixed(0)}px;"></span></td>
    </tr>`).join("")}
  </table>`}
</section>
</body></html>`;
  openHtmlInNewTab(html);
}

/** Convenience: look the stream up in flowsheet (declared streams) +
 *  runResult (computed streams) and open it.  Used by the FlowCanvas
 *  click handlers so the user can click a stream and immediately see
 *  it in a new tab.
 *
 *  Naming caveat: connections in fractal flowsheetDicts use SLASHES
 *  (`concentration/cryst/magma`), while the C++ solver emits stream
 *  names with DOTS (`concentration.cryst.magma`) in the JSON result.
 *  We try both forms when searching. */
export function popOutStreamByName(name: string): void {
  // Lazy access to the store so callers don't have to plumb everything.
  // Importing here to avoid circular dependencies at module load.
  void import("../state/store.js").then(({ useStore }) => {
    const state = useStore.getState();
    const flowsheet = state.caseFiles.flowsheet as
      | { streams?: { [k: string]: { F?: number; T?: number; P?: number; composition?: { [c: string]: number }; role?: string } } }
      | undefined;
    const declared = flowsheet?.streams?.[name];
    const runStream = findRunStream(state.runResult?.streams, name);
    popOutSingleStream({
      name,
      role: declared?.role ?? runStream?.role,
      F: declared?.F,
      T: declared?.T,
      P: declared?.P,
      composition: declared?.composition,
      prefs: state.displayPrefs,
      runStream,
    });
  });
}

/** Find a stream in runResult, tolerating the various naming
 *  discrepancies between the flowsheetDict (slashes, aliases) and the
 *  solver JSON output (dots, fully-qualified leaves).
 *
 *  Search strategy, in order of priority:
 *    1. Exact match
 *    2. Slash ↔ dot equivalence ("a/b/c" ⇔ "a.b.c")
 *    3. Leaf match: the part AFTER the last "/" or "." matches
 *       case-insensitively against the result name's leaf
 *
 *  Strategy 3 catches plant-style aliases where a connection writes
 *  `from concentration/condensate1; to evapCondensate1` --- the
 *  canvas edge label is "concentration/condensate1" but the solver
 *  reports "evapCondensate1" (the boundary-mapped name).  Returns the
 *  first compatible match. */
export function findRunStream(
  streams: StreamResult[] | undefined,
  name: string,
): StreamResult | undefined {
  if (!streams) return undefined;
  // 1 + 2: exact + normalised
  const candidates = new Set<string>([
    name,
    name.replace(/\//g, "."),
    name.replace(/\./g, "/"),
  ]);
  const exact = streams.find((r) => candidates.has(r.name));
  if (exact) return exact;
  // 3: leaf match.  The leaf is the part after the last "/" or "."; we
  // match case-insensitively against the leaf of each result name.
  const leaf = name.split(/[/.]/).pop()!.toLowerCase();
  if (leaf.length === 0) return undefined;
  return streams.find((r) => {
    const rleaf = r.name.split(/[/.]/).pop()!.toLowerCase();
    return rleaf === leaf
        || rleaf.endsWith(leaf)
        || leaf.endsWith(rleaf);
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[c]!);
}
