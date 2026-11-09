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
/*---------------------------------------------------------------------------*\
  THE CLICK CARDS OF THE PLOT PLAN (DEV.md 4c C229).

  Click an item and the card shows the specification sheet the engine
  published for it (the sizing rows WITH the unit the sizer declared, the
  material, the installed cost); click a pipe and it shows the stream (T, P,
  flow, phase, length, composition).  NO VALUE, NO LINE: a row the result does
  not carry is not printed, and an item the engine did not size says so in a
  note rather than showing blanks.  Pure; the view draws the rows.
\*---------------------------------------------------------------------------*/

import { money, sig, sizingPhrase, type LayoutFacts } from "./layoutFacts.js";
import { PHASE_WORDS, phaseOf, type SceneSolid, type ScenePipe } from "./plantLayout.js";

export interface CardRow { label: string; value: string }
export interface Card {
  /** "item:<id>" or "pipe:<stream>". */
  key: string;
  title: string;
  subtitle: string;
  rows: CardRow[];
  notes: string[];
}

/** The most sizing rows a card prints (the sheet has the rest). */
export const CARD_SIZING_ROWS = 14;
/** The most components a pipe card lists, largest first. */
export const CARD_COMPONENTS = 5;

/** Is the item declared in the layout but not sized by the engine?  True only
 *  when the result carried a sizing pass (`facts.sized`) with no entry for it. */
export function notModelled(solid: Pick<SceneSolid, "id">, facts?: LayoutFacts | null): boolean {
  return !!facts?.sized && !facts.items[solid.id];
}

export function itemCard(solid: SceneSolid, facts?: LayoutFacts | null): Card {
  const f = facts?.items[solid.id];
  const rows: CardRow[] = [{ label: "Kind", value: solid.kind }];
  if (solid.sector) rows.push({ label: "Sector", value: solid.sector });
  if (f?.tagNo) rows.push({ label: "Tag", value: f.tagNo });
  if (f?.material) rows.push({ label: "Material", value: f.material });
  //  The envelope the layout drew (line 2 of the tooltip is "kind · dims · source").
  const dims = solid.tooltip[1];
  if (dims) rows.push({ label: "Drawn as", value: dims });
  const notes: string[] = [];
  if (f) {
    for (const s of f.sizing.filter((x) => Number.isFinite(x.value)).slice(0, CARD_SIZING_ROWS))
      rows.push({ label: s.key, value: sizingPhrase(s).slice(s.key.length + 3) });
    if (f.sizing.length > CARD_SIZING_ROWS)
      notes.push(`${f.sizing.length - CARD_SIZING_ROWS} more rows on the design sheet (Reports).`);
    if (f.sizing.length === 0)
      notes.push("The design sheet's numbers are not available in this view (open the run in the app).");
    if (f.cost) {
      const c = f.cost;
      if (Number.isFinite(c.purchased)) rows.push({ label: "Purchased cost", value: money(c.purchased, c.currency) });
      if (Number.isFinite(c.bareModule)) rows.push({ label: "Bare-module cost", value: money(c.bareModule, c.currency) });
      rows.push({ label: "Total-module cost", value: money(c.totalModule, c.currency) });
    }
    if (f.assumed.length > 0) notes.push(`Defaults the sizer assumed: ${f.assumed.join(", ")}.`);
    if (f.basis) notes.push(`Basis: ${f.basis.length > 220 ? `${f.basis.slice(0, 220)}...` : f.basis}`);
  } else if (notModelled(solid, facts)) {
    notes.push("Not modelled: the case declares this item and the layout places it, "
      + "but the engine did not size it (no design sheet).");
  } else if (!facts) {
    notes.push("The sheet and the cost are shown when the view is opened from a run in the app.");
  }
  for (const t of solid.tooltip.filter((x) => x.startsWith("FINDING: "))) notes.push(t);
  return { key: `item:${solid.id}`, title: solid.id, subtitle: f ? `${f.type} (sized)` : solid.kind,
           rows, notes };
}

export function pipeCard(pipe: ScenePipe, facts?: LayoutFacts | null): Card {
  const st = facts?.streams[pipe.stream];
  const end = (kind: string, at: string) =>
    kind === "batteryLimit" ? `battery limit (${at})` : kind === "junction" ? `junction ${at}`
      : kind === "header" ? `header ${at}` : at;
  const rows: CardRow[] = [
    { label: "From", value: end(pipe.ends.fromKind, pipe.ends.from) },
    { label: "To", value: end(pipe.ends.toKind, pipe.ends.to) },
  ];
  const T = pipe.T ?? st?.T, P = pipe.P ?? st?.P, vf = pipe.vf ?? st?.vf;
  //  A branch of a header (C268) carries the stream's state, not its flow:
  //  the engine publishes none for it, and the stream's is not read in its place.
  const m = pipe.branch ? null : pipe.massFlow ?? st?.F_mass ?? null;
  if (T !== undefined) rows.push({ label: "Temperature", value: `${sig(T, 5)} K (${sig(T - 273.15, 4)} °C)` });
  if (P !== undefined) rows.push({ label: "Pressure", value: `${sig(P / 1e5, 5)} bar` });
  if (m !== null) rows.push({ label: "Mass flow", value: `${sig(m, 4)} kg/s` });
  if (st?.F !== undefined) rows.push({ label: "Molar flow", value: `${sig(st.F, 4)} kmol/s` });
  if (vf !== undefined) rows.push({ label: "Phase", value: `${PHASE_WORDS[phaseOf(vf)]}` });
  rows.push({ label: "Pipe length", value: `${sig(pipe.length, 4)} m (${pipe.routedBy === "waypoints"
    ? "declared waypoints" : pipe.routedBy === "header" ? "a branch of the header" : "routed on the rack"})` });
  if (pipe.branch)
    rows.push({ label: "Branch", value: `to ${pipe.branch}; its flow is not the stream's (the item fills and empties by it) and is not published` });
  if (st?.composition) {
    const top = Object.entries(st.composition).filter(([, v]) => Number.isFinite(v) && v > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, CARD_COMPONENTS);
    if (top.length > 0)
      rows.push({ label: "Mole fractions", value: top.map(([c, v]) => `${c} ${sig(v, 3)}`).join(", ") });
  }
  return { key: pipe.id, title: pipe.branch ? `${pipe.stream} → ${pipe.branch}` : pipe.stream,
           subtitle: pipe.branch ? "branch of a header" : "stream", rows,
           notes: ["The line's flow speed is not published by the engine: the moving particles are stylised."] };
}
