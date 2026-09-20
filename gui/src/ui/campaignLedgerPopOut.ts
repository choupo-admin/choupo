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
-------------------------------------------------------------------------------

/*---------------------------------------------------------------------------*\
  campaignLedgerPopOut -- the two BATCH CAMPAIGN LEDGERS as full tables in a
  separate browser tab (credo §2.4: long content pops out, never a modal).

  WHY A POP-OUT AND NOT A TOOLTIP.  A hover is one mark's worth of text; these
  are the whole campaign's two ledgers with every field of every record, and
  the `basis` sentence alone runs to a full line ("reboiler: first law over
  the pot, Q = dH_pot + Sum n_pkg*h_vap(T_pkg, y_pkg), package-by-package,
  elements datum").  `still06_ledger_mixed_validity` publishes 8 energy
  records and 5 transfers; the flagship recipe cases carry four-component
  `dn` maps.  None of that fits a `<title>`.

  WHICH MACHINERY THIS REUSES, and why it is not the two the brief named.
  `plotPopOut.ts` and `csvArtifactPopOut.tsx` both rasterise a *Plotly figure*
  to a PNG (`Plotly.toImage`), which a table is not and this plot is not -- the
  Gantt is pure SVG and carries no `.js-plotly-plot` element at all.  The
  machinery that fits is the one the STREAMS TABLE uses and it is shared
  already: `openHtmlInNewTab` + `popoutColors` from `filePopOut.ts`, with the
  document shaped like `streamsPopOut.ts`.  No third mechanism is introduced.

  A REFUSAL IS PRINTED AS A REFUSAL.  Every cell that would hold `H_kJ` or
  `E_kJ` on a priced record holds the engine's own reason on a refused one,
  in the refusal style -- there is no path here from an absent number to a
  printed zero.
\*---------------------------------------------------------------------------*/

import type { EnergyRow, TransferRow } from "../case/campaignLedger.js";
import {
  campaignLedgerView, energyScaleSentence, fmtNum, fmtTime,
} from "../case/campaignLedger.js";
import type {
  EnergyRecord, TransferRecord,
} from "../adapters/SolverAdapter.js";
import { openHtmlInNewTab, popoutColors } from "./filePopOut.js";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

/** The pop-out's whole document, as a string.  SPLIT from the opener so it
 *  can be tested with no DOM and no Blob -- what is at stake is whether a
 *  refused record prints as a refusal, and that is a property of this text.
 *  `colors` is injected for the same reason. */
export function campaignLedgerHtml(
  transfers: TransferRecord[] | undefined,
  energyLedger: EnergyRecord[] | undefined,
  C: { bg: string; text: string; textStrong: string; dim: string;
       panel: string; border: string; cell: string; red: string;
       accent: string },
): string {
  const view = campaignLedgerView(transfers, energyLedger);
  //  ONE HOME for the scale sentence -- the plot's legend prints the same
  //  claim, and two copies of "what full height meant" would drift.
  const scaleLine = esc(energyScaleSentence(view.scale, false));

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — Campaign ledgers (${view.transfers.length} material, ${view.energy.length} energy)</title>
<style>
  body { margin: 0; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif; }
  h2 { margin: 18px 24px 2px; font-size: 17px; font-weight: 500; }
  p.note { margin: 0 24px 10px; font-size: 12px; color: ${C.dim};
           max-width: 70em; line-height: 1.5; }
  table { border-collapse: collapse; margin: 6px 24px 26px;
          font: 12.5px/1.45 'JetBrains Mono', Consolas, monospace;
          background: ${C.panel}; }
  th { padding: 7px 12px; text-align: left; font-weight: 500;
       border-bottom: 1px solid ${C.border}; color: ${C.dim};
       white-space: nowrap; }
  td { padding: 5px 12px; border-bottom: 1px solid ${C.cell};
       vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  td.basis { font-size: 11.5px; color: ${C.dim}; max-width: 46em; }
  .refused { color: ${C.red}; font-style: italic; }
  .kind { display: inline-block; padding: 1px 7px; border-radius: 3px;
          background: ${C.border}; color: ${C.textStrong}; font-size: 11px; }
  .empty { margin: 0 24px 24px; font-size: 13px; color: ${C.dim}; }
</style>
</head><body>

<h2>Material ledger — transfers (${view.transfers.length})</h2>
<p class="note">One record per material edge of the campaign.  <code>dn</code>
is the engine's per-component amount; <code>H</code> is the enthalpy that
travelled with it, integrated at each package's own instant and temperature.
An UNPRICEABLE record shows the engine's own reason — it is not zero.</p>
${view.transfers.length === 0
  ? `<p class="empty">This run published no material ledger.</p>`
  : transfersTable(view.transfers)}

<h2>Energy ledger — segments (${view.energy.length})</h2>
<p class="note">One record per segment of constant physics on one vessel.
<code>E</code> is an exact integral over the interval its <code>basis</code>
covers; the sign is direction — positive is heat ADDED to the vessel.
${scaleLine}.</p>
${view.energy.length === 0
  ? `<p class="empty">This run published no energy ledger.  That is not the same as "no heat": it means no unit ledgered a segment.</p>`
  : energyTable(view.energy)}

</body></html>`;
}

function refusedCell(missing: string[], what: string): string {
  return `<td class="refused">${esc(missing.length > 0
    ? `${what} unpriceable — ${missing.join("; ")}`
    : `${what} unpriceable — the engine named no reason`)}</td>`;
}

function transfersTable(rows: TransferRow[]): string {
  const body = rows.map((r) => `<tr>
    <td class="num">${esc(fmtTime(r.tStart))}</td>
    <td class="num">${esc(fmtTime(r.tEnd))}</td>
    <td>${esc(r.from)}</td>
    <td>${esc(r.to)}</td>
    <td><span class="kind">${esc(r.kind)}</span></td>
    <td>${r.dn.length === 0 ? "—" : r.dn.map((d) =>
      `${esc(d.component)} ${esc(fmtNum(d.kmol))}`).join("<br>")}</td>
    ${r.validity === "priced"
      ? `<td class="num">${esc(fmtNum(r.H_kJ!))}</td>`
      : refusedCell(r.missing, "H")}
  </tr>`).join("");
  return `<table><thead><tr>
    <th>tStart [s]</th><th>tEnd [s]</th><th>from</th><th>to</th><th>kind</th>
    <th>dn [kmol]</th><th>H [kJ]</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

function energyTable(rows: EnergyRow[]): string {
  const body = rows.map((r) => `<tr>
    <td class="num">${esc(fmtTime(r.tStart))}</td>
    <td class="num">${esc(fmtTime(r.tEnd))}${r.instantaneous
      ? `<br><span class="kind">instant</span>` : ""}</td>
    <td>${esc(r.unit)}</td>
    <td><span class="kind">${esc(r.kind)}</span></td>
    ${r.validity === "priced"
      ? `<td class="num">${esc(fmtNum(r.E_kJ!))}</td>`
      : refusedCell(r.missing, "E")}
    <td class="num">${r.T_service_K === undefined
      ? "—" : esc(fmtNum(r.T_service_K))}</td>
    <td class="basis">${esc(r.basis)}</td>
  </tr>`).join("");
  return `<table><thead><tr>
    <th>tStart [s]</th><th>tEnd [s]</th><th>unit</th><th>kind</th>
    <th>E [kJ]</th><th>T_service [K]</th><th>basis</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

/** Open the two ledgers as tables in a new browser tab. */
export function popOutCampaignLedger(
  transfers: TransferRecord[] | undefined,
  energyLedger: EnergyRecord[] | undefined,
): void {
  openHtmlInNewTab(campaignLedgerHtml(transfers, energyLedger, popoutColors()));
}
