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
  THE 3D LAYOUT POP-OUT -- the stash, the route and the expiry, with no React
  in them (DEV.md 4c C78).

  WHAT IT IS.  The plot plan the engine published (`layout {}` on the run
  result) drawn full-window in a tab of its own, `?layout=<key>`, on the
  `?internals=` precedent (ui/unitFocus.ts): the parent writes a STASH under
  a STABLE key, opens the tab, and the tab re-reads that stash -- never
  consumed, so F5 reproduces the tab (gui-credo §4 "Tab citizenship").  When
  the stash is gone (cleared storage, another browser) the tab refuses
  honestly with "expired -- reopen from the parent", and never degrades into
  another surface while its URL claims to be this one.

  ONE KEY PER SOURCE, LATEST WINS.  A source is the case open in a tab (the
  Reports section) or the EduTools bench (its witness).  Opening the pop-out
  again overwrites the same key; nothing accumulates per click.

  THE TAB FOLLOWS ITS PARENT.  While the parent is open and a stash for its
  source exists, the parent REWRITES the stash whenever its result or its
  declared case moves (state/useLayoutPopOut.ts for a case; the bench does
  the same for its own runs), and the tab listens to the browser's `storage`
  event for its own key.  So a second monitor shows the parent's CURRENT
  plot plan, titled with the fingerprint of the run that produced it, and an
  F5 shows the same thing.

  A STALE RUN DIMS EXACTLY AS IN THE PARENT.  The stash carries the stamp of
  the run (`ran`) AND the parent's declared case now (`declared`), both as
  `RunInputs`, and the tab asks the ONE decision (`stalenessOf`,
  case/staleness.ts) the parent asks.  The bench carries no `declared`: the
  bench re-runs on every knob and nothing on it dims, and absence means no
  claim -- the rule staleness.ts states for a result nobody stamped.

  THE ENGINE DECIDES, THE GUI DRAWS.  The stash carries the engine's block
  verbatim; the tab maps it with the same `layoutScene` (case/plantLayout.ts)
  and draws it with the same `PlantLayout3D`.  Nothing here measures, places
  or judges anything.
\*---------------------------------------------------------------------------*/

import type { GmpBuilding } from "../adapters/buildingPayload.js";
import type { PlantLayout, RunResult } from "../adapters/SolverAdapter.js";
import { layoutScene } from "./plantLayout.js";
import type { ScratchEdits } from "./scratch.js";
import {
  declaredInputsOf, stalenessOf, type RunInputs, type Staleness,
} from "./staleness.js";
import type { CaseFiles } from "./types.js";

/** Where a layout pop-out was opened from. */
export type LayoutPopOutSource = "case" | "bench";

/** Everything the `?layout=` tab draws.  `v` versions the shape: a stash of
 *  another shape is read as expired rather than half-drawn. */
export interface LayoutPopOutStash {
  v: 1;
  source: LayoutPopOutSource;
  /** The case name as the parent knows it (a tutorial id, a local case, or
   *  the bench's witness). */
  caseName: string;
  /** The engine's `layout {}` block, verbatim. */
  layout: PlantLayout;
  /** The GMP interior beside it (DEV.md 4c C97), when the case declares one:
   *  carried so "Export as page" draws it too. */
  building?: GmpBuilding;
  /** The stamp of the run that produced `layout`; null when the run carries
   *  none (a drilled-in tab inherits its parent's result unstamped). */
  ran: RunInputs | null;
  /** What the parent declares NOW; null = no claim (the bench, or a parent
   *  that has not said). */
  declared: RunInputs | null;
}

/** Minimal storage surface (window.localStorage, or a test double). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The STABLE, never-consumed key of a source.  `choupo.layoutTab.` is its
 *  own prefix, so no other stash family (focus, internals, explore) can
 *  collide with it. */
export function layoutTabKey(source: LayoutPopOutSource, caseName: string): string {
  return `choupo.layoutTab.${source}.${caseName}`;
}

/** WHICH VIEW of the stash the tab draws (DEV.md 4c C100).  `plot` is the
 *  plot plan (the default, the address carries nothing extra); `building`
 *  is the GMP interior -- its 3D cutaway, the plan per floor, the room
 *  schedule and the findings -- drawn by the SAME section Reports draws.
 *  ONE stash and ONE key serve both: the building travels in the stash
 *  already, so the two tabs of a case follow the same parent writes. */
export type LayoutTabView = "plot" | "building";

/** The address of the tab for a stash key, in the view asked for. */
export function layoutTabUrl(pathname: string, key: string, view: LayoutTabView = "plot"): string {
  const base = `${pathname}?layout=${encodeURIComponent(key)}`;
  return view === "building" ? `${base}&view=building` : base;
}

/** The view a `?layout=` address names.  Anything but `building` is the plot
 *  plan, so every address written before C100 reads exactly as it did. */
export function layoutViewOf(search: string): LayoutTabView {
  return new URLSearchParams(search).get("view") === "building" ? "building" : "plot";
}

/** Can this stash draw the view asked for?  The plot plan always (a stash
 *  is read only when it has one); the building only when the case declares
 *  one -- otherwise the tab refuses as expired, never draws the plot plan
 *  under an address that names the building. */
export function stashDrawsView(stash: LayoutPopOutStash, view: LayoutTabView): boolean {
  return view === "plot" || !!stash.building;
}

/** The stash key a `?layout=` address names; null when the address is not a
 *  layout tab.  The route (AppShell), the isolated-tab test (store) and the
 *  tab's own read all go through it. */
export function layoutKeyOf(search: string): string | null {
  const k = new URLSearchParams(search).get("layout");
  return k ? k : null;
}

/** The pop-out exists only where there is something to draw: the same test
 *  the Reports section and the bench already use to decide whether a scene
 *  exists at all (`layoutScene` is null for no block or no items). */
export function canPopOutLayout(layout: PlantLayout | null | undefined): layout is PlantLayout {
  return layoutScene(layout ?? undefined) !== null;
}

function isRunInputs(v: unknown): v is RunInputs {
  return !!v && typeof v === "object"
    && typeof (v as RunInputs).fingerprint === "string"
    && !!(v as RunInputs).edits && typeof (v as RunInputs).edits === "object";
}

/** Read a stash.  Null -- the tab then refuses as expired -- when the key is
 *  absent, the JSON is corrupt, the shape is another version, or the block
 *  would draw nothing.  Never throws. */
export function readLayoutStash(store: KeyValueStore, key: string): LayoutPopOutStash | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LayoutPopOutStash> | null;
    if (!v || typeof v !== "object" || v.v !== 1) return null;
    if (v.source !== "case" && v.source !== "bench") return null;
    if (typeof v.caseName !== "string") return null;
    if (!canPopOutLayout(v.layout)) return null;
    if (v.ran !== null && !isRunInputs(v.ran)) return null;
    if (v.declared !== null && !isRunInputs(v.declared)) return null;
    return v as LayoutPopOutStash;
  } catch {
    return null;
  }
}

/** Write a stash under its source's key and return the key.  Throws only
 *  what the storage throws (a full or blocked store); a caller that opens a
 *  tab catches it and opens nothing. */
export function writeLayoutStash(store: KeyValueStore, stash: LayoutPopOutStash): string {
  const key = layoutTabKey(stash.source, stash.caseName);
  store.setItem(key, JSON.stringify(stash));
  return key;
}

/** Keep an EXISTING stash current: rewrite it only when a pop-out was ever
 *  opened for this source in this browser (the key exists), and only when
 *  the content moved.  A parent with no stash writes nothing -- following is
 *  a service to an open tab, not a log of every run.  Returns whether it
 *  wrote.  Never throws. */
export function refreshLayoutStash(store: KeyValueStore, stash: LayoutPopOutStash): boolean {
  try {
    const key = layoutTabKey(stash.source, stash.caseName);
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

/** The slice of a parent tab's state a case stash is built from (the store's
 *  own field names, so the store binding passes its state straight in). */
export interface CaseLayoutView {
  tutorialName: string;
  runResult: RunResult | null;
  runInputs: RunInputs | null;
  caseFiles: CaseFiles;
  scratchEdits: ScratchEdits;
}

/** The stash an open case would hand its layout tab now.  Null -- and then
 *  there is no button -- when no case is open (the blank sentinel ""), the
 *  run is not a finished one, or it published no drawable layout: the same
 *  condition under which Reports draws no "Plant layout (3D)" section. */
export function caseLayoutStash(view: CaseLayoutView): LayoutPopOutStash | null {
  if (view.tutorialName === "") return null;
  const r = view.runResult;
  const layout = r && r.status === "done" ? r.layout : undefined;
  if (!canPopOutLayout(layout)) return null;
  return { v: 1, source: "case", caseName: view.tutorialName, layout,
           ...(r?.building ? { building: r.building } : {}),
           ran: view.runInputs ?? null,
           declared: declaredInputsOf(view.caseFiles, view.scratchEdits) };
}

/** What the parent writes to keep an EXISTING case stash current, or null
 *  for "write nothing".  With a drawable result the stash is rebuilt whole
 *  (the tab redraws the latest run); without one -- a failed run, a reset, a
 *  reloaded case -- the drawn plan is KEPT and only what is declared moves,
 *  so the tab dims exactly when the parent's case no longer matches the run
 *  it draws.  `prev` is the stash as it stands in storage. */
export function followedCaseStash(view: CaseLayoutView,
                                  prev: LayoutPopOutStash | null): LayoutPopOutStash | null {
  if (view.tutorialName === "" || !prev || prev.source !== "case"
      || prev.caseName !== view.tutorialName) return null;
  return caseLayoutStash(view)
    ?? { ...prev, declared: declaredInputsOf(view.caseFiles, view.scratchEdits) };
}

/** Is the drawn plan still the answer to what the parent declares?  The ONE
 *  decision the parent asks (`stalenessOf`); with no `declared` it makes no
 *  claim. */
export function layoutTabStaleness(stash: LayoutPopOutStash): Staleness {
  if (!stash.declared) return { stale: false, pendingEdits: 0 };
  return stalenessOf(stash.declared, stash.ran, true);
}

/** The last segment of a case name, the way the main tab titles itself
 *  (AppShell): "plant/ammonia02_full_plant" reads "ammonia02_full_plant". */
function leafOf(caseName: string): string {
  const i = caseName.lastIndexOf("/");
  return i < 0 ? caseName : caseName.slice(i + 1);
}

/** The browser-tab title: which case, which view (its 3D layout or its GMP
 *  building), and WHICH RUN is drawn -- the run's fingerprint, or the words saying it has none. */
export function layoutTabTitle(stash: LayoutPopOutStash, view: LayoutTabView = "plot"): string {
  const who = stash.source === "bench"
    ? `${leafOf(stash.caseName)} (EduTools bench)` : leafOf(stash.caseName);
  const run = stash.ran ? `run ${stash.ran.fingerprint}` : "run not stamped";
  const what = view === "building" && stash.building
    ? `GMP building ${stash.building.name}` : "layout 3D";
  return `${who} · ${what} · ${run}`;
}
