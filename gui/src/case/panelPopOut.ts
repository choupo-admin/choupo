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
  THE PANEL POP-OUT -- the stash, the route and the expiry, with no React in
  them (DEV.md 4c C371, slice S2), on the `?layout=` precedent
  (case/layoutPopOut.ts): the parent writes a STASH under a STABLE key, opens
  `?panel=<key>`, and the tab re-reads it -- never consumed, so F5 reproduces
  the tab (gui-credo section 4 "Tab citizenship").  When the stash is gone the
  tab refuses honestly as expired.  It follows its parent through the browser's
  `storage` event and dims exactly as the parent does when the case has moved
  since the run it draws (`stalenessOf`, case/staleness.ts).

  WHY IT EXISTS: a panel is something a person keeps beside the flowsheet or
  the Control Room, on a second screen.

  WHAT THE STASH CARRIES: the engine's `panel` block verbatim and ONLY the
  trajectory columns the panel reads (its elements' columns and their
  references) plus `t` -- never the whole run, which a localStorage quota
  would refuse.  Nothing here measures or judges anything.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { PanelReport } from "../adapters/panelPayload.js";
import type { KeyValueStore } from "./layoutPopOut.js";
import type { PanelTrajectory } from "./panelView.js";
import type { ScratchEdits } from "./scratch.js";
import { declaredInputsOf, stalenessOf, type RunInputs, type Staleness } from "./staleness.js";
import type { CaseFiles } from "./types.js";

export type { KeyValueStore };

export interface PanelPopOutStash {
  v: 1;
  caseName: string;
  panel: PanelReport;
  trajectory: PanelTrajectory;
  ran: RunInputs | null;
  declared: RunInputs | null;
}

/** The STABLE, never-consumed key of a case's panel tab. */
export function panelTabKey(caseName: string): string {
  return `choupo.panelTab.${caseName}`;
}

export function panelTabUrl(pathname: string, key: string): string {
  return `${pathname}?panel=${encodeURIComponent(key)}`;
}

/** The stash key a `?panel=` address names; null when it is not a panel tab. */
export function panelKeyOf(search: string): string | null {
  const k = new URLSearchParams(search).get("panel");
  return k ? k : null;
}

function isRunInputs(v: unknown): v is RunInputs {
  return !!v && typeof v === "object"
    && typeof (v as RunInputs).fingerprint === "string"
    && !!(v as RunInputs).edits && typeof (v as RunInputs).edits === "object";
}

/** The columns a panel reads: each element's column and reference. */
export function panelColumns(panel: PanelReport): string[] {
  const out = new Set<string>();
  for (const e of panel.elements) {
    if (e.column) out.add(e.column);
    if (e.referenceColumn) out.add(e.referenceColumn);
  }
  return [...out];
}

/** The slice of a trajectory a panel draws. */
export function panelTrajectory(panel: PanelReport, traj: PanelTrajectory): PanelTrajectory {
  const vars: { [k: string]: number[] } = {};
  for (const c of panelColumns(panel)) if (traj.vars[c]) vars[c] = traj.vars[c]!;
  return { t: traj.t, vars };
}

/** Read a stash.  Null -- the tab then refuses as expired -- for an absent key,
 *  corrupt JSON, another version or a block that draws nothing.  Never throws. */
export function readPanelStash(store: KeyValueStore, key: string): PanelPopOutStash | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PanelPopOutStash> | null;
    if (!v || typeof v !== "object" || v.v !== 1) return null;
    if (typeof v.caseName !== "string") return null;
    if (!v.panel || !Array.isArray(v.panel.elements) || v.panel.elements.length === 0) return null;
    if (!v.trajectory || !Array.isArray(v.trajectory.t) || v.trajectory.t.length === 0
        || typeof v.trajectory.vars !== "object" || v.trajectory.vars === null) return null;
    if (v.ran !== null && !isRunInputs(v.ran)) return null;
    if (v.declared !== null && !isRunInputs(v.declared)) return null;
    return v as PanelPopOutStash;
  } catch {
    return null;
  }
}

export function writePanelStash(store: KeyValueStore, stash: PanelPopOutStash): string {
  const key = panelTabKey(stash.caseName);
  store.setItem(key, JSON.stringify(stash));
  return key;
}

/** Keep an EXISTING stash current: rewrite only when a tab was ever opened for
 *  this case (the key exists) and the content moved.  Never throws. */
export function refreshPanelStash(store: KeyValueStore, stash: PanelPopOutStash): boolean {
  try {
    const key = panelTabKey(stash.caseName);
    const prev = store.getItem(key);
    if (prev === null) return false;
    const next = JSON.stringify(stash);
    if (prev === next) return false;
    store.setItem(key, next);
    return true;
  } catch {
    return false;
  }
}

export interface CasePanelView {
  tutorialName: string;
  runResult: RunResult | null;
  runInputs: RunInputs | null;
  caseFiles: CaseFiles;
  scratchEdits: ScratchEdits;
}

/** The stash an open case would hand its panel tab now; null (no button, no
 *  tab) when no case is open, the run is not a finished one, or it published
 *  no panel or no trajectory. */
export function casePanelStash(view: CasePanelView): PanelPopOutStash | null {
  if (view.tutorialName === "") return null;
  const r = view.runResult;
  if (!r || r.status !== "done" || !r.panel || r.panel.elements.length === 0
      || !r.trajectory || r.trajectory.t.length === 0) return null;
  return { v: 1, caseName: view.tutorialName, panel: r.panel,
           trajectory: panelTrajectory(r.panel, r.trajectory),
           ran: view.runInputs ?? null,
           declared: declaredInputsOf(view.caseFiles, view.scratchEdits) };
}

/** What the parent writes to keep an EXISTING stash current, or null for
 *  "write nothing".  With a drawable result it is rebuilt whole; without one
 *  the drawn panel is KEPT and only what is declared moves, so the tab dims
 *  when the parent's case no longer matches the run it draws. */
export function followedPanelStash(view: CasePanelView, prev: PanelPopOutStash | null): PanelPopOutStash | null {
  if (view.tutorialName === "" || !prev || prev.caseName !== view.tutorialName) return null;
  return casePanelStash(view)
    ?? { ...prev, declared: declaredInputsOf(view.caseFiles, view.scratchEdits) };
}

export function panelTabStaleness(stash: PanelPopOutStash): Staleness {
  if (!stash.declared) return { stale: false, pendingEdits: 0 };
  return stalenessOf(stash.declared, stash.ran, true);
}

export function panelTabTitle(stash: PanelPopOutStash): string {
  const i = stash.caseName.lastIndexOf("/");
  const leaf = i < 0 ? stash.caseName : stash.caseName.slice(i + 1);
  return `${leaf} · panel · ${stash.ran ? `run ${stash.ran.fingerprint}` : "run not stamped"}`;
}
