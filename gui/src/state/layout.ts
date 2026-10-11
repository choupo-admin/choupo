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
    This file is part of CHOUPO.

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
  Choupo GUI -- per-case canvas layout persistence (view state, NOT case data)

  Node positions, the viewport (pan / zoom), and edge bend-points (the
  draggable centre of each smoothstep stream) are PRESENTATION, not
  physics.  Per the GUI credo the dicts on disk stay the source of truth
  for the SIMULATION and the GUI never silently writes to disk -- so this
  "last screen state" lives in localStorage, keyed by case name, exactly
  like the display-unit preferences.  Reopen a case and it comes back the
  way you arranged it.

  (An explicit, shareable "save layout" into the case's `.hyc` file --- the
  CLAUDE.md-designated home for GUI-only metadata --- is a separate future
  feature; this module is the automatic browser-local memory.)
\*---------------------------------------------------------------------------*/

import { isStubId, splitStubPositions } from "../case/stubDocking.js";

export interface XY { x: number; y: number }
export interface Viewport { x: number; y: number; zoom: number }

export type HandleSide = "left" | "right" | "top" | "bottom";
/** Where a connection point sits on a unit's border: which side, and how
 *  far along it (0..1).  Overrides the default fixed placement so the user
 *  can slide an attachment point along the rectangle to declutter. */
export interface HandlePos { side: HandleSide; frac: number }

export interface CaseLayout {
  /** Units and stream terminals, at absolute coordinates.  NEVER a docked
   *  stub: a stub is where its unit is (case/stubDocking.ts). */
  nodes: { [id: string]: XY };
  viewport?: Viewport;
  /** Per-edge bend centre (flow coords).  Overrides the smoothstep
   *  auto-routed centre so the user can slide an edge aside when two
   *  lines overlap.  Absent => auto-routed. */
  edges: { [id: string]: XY };
  /** Per-unit connection-point overrides, keyed by `<unitId>\0<handleId>`.
   *  Absent => the unit's default border placement. */
  handles: { [key: string]: HandlePos };
  /** A docked stub the READER dragged: its offset FROM ITS OWNER, so it
   *  still follows the unit.  A stub not named here sits at the automatic
   *  offset.  Absent => none moved. */
  stubs?: { [id: string]: XY };
}

/** THE WORKING-COPY STORE.  `v2` since the stub follow-up of C59
 *  (2026-10-11): `v1` snapshots froze docked stubs at absolute coordinates
 *  nobody had chosen (see `migrateV1`).  It is read once, migrated into
 *  `v2`, and never read again; it is left in place, untouched, so the
 *  reader's old arrangement is never destroyed by this code. */
const KEY = "choupo.layouts.v2";
const LEGACY_KEY = "choupo.layouts.v1";

/** A pre-v2 working copy, kept aside so the reader can bring it back. */
export interface LegacyLayout {
  nodes: { [id: string]: XY };
  viewport?: Viewport;
  edges: { [id: string]: XY };
  handles: { [key: string]: HandlePos };
  /** The one-time notice about it has been shown. */
  noticed?: boolean;
}

interface Store {
  cases: { [caseName: string]: CaseLayout };
  legacy: { [caseName: string]: LegacyLayout };
}

type V1Layouts = { [caseName: string]: Partial<CaseLayout> };

/** WHAT A v1 WORKING COPY IS WORTH, decided once (2026-10-11).
 *
 *  The v1 canvas wrote EVERY node at its drawn coordinates on every drag.  So
 *  a v1 copy mixes three kinds of position and cannot tell them apart: the
 *  nodes the reader really moved, the nodes the case's `.cho` had placed at
 *  the time, and the nodes the then-automatic layout had placed -- its stubs
 *  among them, at the automatic position of a unit the `.cho` had moved
 *  elsewhere.  The `.cho` the copy was taken over is not recoverable (the
 *  green-ammonia markers were emptied by C59), so "keep only the nodes that
 *  differ from what the machine would have drawn" cannot be computed for the
 *  very case that showed the defect: its machine-written serpentine would
 *  read as the reader's own work.
 *
 *  So a v1 copy is NOT applied.  It is set aside whole, minus its stubs (no
 *  human chose those), and the case opens on its `.cho` or the automatic
 *  layout.  The canvas says so once and offers it back (`restoreLegacyLayout`)
 *  -- a two-way door: nothing the reader did is lost. */
export function migrateV1(v1: V1Layouts): Store {
  const legacy: Store["legacy"] = {};
  for (const [name, l] of Object.entries(v1 ?? {})) {
    if (!l || typeof l !== "object") continue;
    const nodes: { [id: string]: XY } = {};
    for (const [id, p] of Object.entries(l.nodes ?? {}))
      if (!isStubId(id) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) nodes[id] = { x: p.x, y: p.y };
    const edges = l.edges ?? {};
    const handles = l.handles ?? {};
    if (Object.keys(nodes).length === 0 && Object.keys(edges).length === 0
        && Object.keys(handles).length === 0) continue;
    legacy[name] = { nodes, viewport: l.viewport, edges, handles };
  }
  return { cases: {}, legacy };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Store>;
      return { cases: s.cases ?? {}, legacy: s.legacy ?? {} };
    }
  } catch {
    return { cases: {}, legacy: {} };
  }
  // No v2 store yet: migrate the v1 one, once.
  let v1: V1Layouts = {};
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) v1 = JSON.parse(old) as V1Layouts;
  } catch { v1 = {}; }
  const store = migrateV1(v1);
  writeStore(store);
  return store;
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota / private-mode: layout memory is best-effort, never fatal.
  }
}

/** Drop any stub that reached `nodes` (a caller that forgot the rule). */
function freeNodesOnly(nodes: { [id: string]: XY } | undefined): { [id: string]: XY } {
  const out: { [id: string]: XY } = {};
  for (const [id, p] of Object.entries(nodes ?? {})) if (!isStubId(id)) out[id] = p;
  return out;
}

export function loadLayout(caseName: string): CaseLayout {
  const l = readStore().cases[caseName];
  return {
    nodes: freeNodesOnly(l?.nodes),
    viewport: l?.viewport,
    edges: l?.edges ?? {},
    handles: l?.handles ?? {},
    stubs: l?.stubs ?? {},
  };
}

/** Merge a partial layout into the stored one for this case. */
export function saveLayout(caseName: string, patch: Partial<CaseLayout>): void {
  if (!caseName) return;
  const s = readStore();
  const cur = s.cases[caseName] ?? { nodes: {}, edges: {}, handles: {}, stubs: {} };
  s.cases[caseName] = {
    nodes: freeNodesOnly(patch.nodes ?? cur.nodes),
    viewport: patch.viewport ?? cur.viewport,
    edges: patch.edges ?? cur.edges,
    handles: patch.handles ?? cur.handles ?? {},
    stubs: patch.stubs ?? cur.stubs ?? {},
  };
  writeStore(s);
}

/** The pre-v2 working copy set aside for this case, if any. */
export function loadLegacyLayout(caseName: string): LegacyLayout | undefined {
  return readStore().legacy[caseName];
}

/** The one-time notice about a set-aside copy has been shown. */
export function markLegacyNoticed(caseName: string): void {
  const s = readStore();
  const l = s.legacy[caseName];
  if (!l || l.noticed) return;
  l.noticed = true;
  writeStore(s);
}

/** Bring the set-aside arrangement back as this case's working copy (its
 *  units and terminals where the reader had them; every stub docked on its
 *  unit), and forget the set-aside copy. */
export function restoreLegacyLayout(caseName: string): boolean {
  const s = readStore();
  const l = s.legacy[caseName];
  if (!l) return false;
  s.cases[caseName] = { nodes: freeNodesOnly(l.nodes), viewport: l.viewport,
                        edges: l.edges ?? {}, handles: l.handles ?? {}, stubs: {} };
  delete s.legacy[caseName];
  writeStore(s);
  return true;
}

/** Forget the set-aside arrangement for good. */
export function forgetLegacyLayout(caseName: string): void {
  const s = readStore();
  if (!(caseName in s.legacy)) return;
  delete s.legacy[caseName];
  writeStore(s);
}

// ---- the case's `.cho` marker: the on-DISK, shareable layout -----------------
//
// The localStorage above is the automatic, per-browser working copy.  The
// case folder's `<caseName>.cho` marker is the EXPLICIT, portable snapshot:
// "Save layout to case" serialises the current arrangement into it (a Save-As
// the user drops back into the folder), so the layout travels WITH the case
// (commit it, send it, reopen -> it comes back arranged).  Per the GUI credo
// the GUI never writes to disk silently -- this file is only ever written by
// that explicit action, never on a drag.  (FlowCanvas used to write it on
// every drag when served on localhost, which made a reader's arrangement a
// local modification of a TRACKED file and a `git pull` refused it -- DEV.md
// 4c C55; removed with C59, the explicit action is the canvas's `layout`
// menu.)

// Schema 2 (2026-10-11) adds `stubs`, each docked stub the reader moved as an
// OFFSET from its unit.  A schema-1 marker carried stubs inside `nodes` at
// absolute coordinates; reading one turns them into offsets from the same
// marker's own unit positions (`splitStubPositions`) -- the 45 curated
// markers were measured, every stub within 400 px of its unit, so the
// relative placement their author saw is kept, and now follows the unit.

const CHO_SCHEMA = 2;

interface ChoMarker {
  choupoLayout: number;
  nodes?: { [id: string]: XY };
  viewport?: Viewport;
  edges?: { [id: string]: XY };
  handles?: { [key: string]: HandlePos };
  stubs?: { [id: string]: XY };
}

/** Serialise a layout to the JSON text stored in the case's `.cho` marker. */
export function layoutToChoText(l: CaseLayout): string {
  const body: ChoMarker = {
    choupoLayout: CHO_SCHEMA,
    nodes: freeNodesOnly(l.nodes),
    viewport: l.viewport,
    edges: l.edges,
    handles: l.handles,
    ...(l.stubs && Object.keys(l.stubs).length > 0 ? { stubs: l.stubs } : {}),
  };
  return JSON.stringify(body, null, 2) + "\n";
}

/** Parse a `.cho` marker body into a layout.  An empty / non-JSON / legacy
 *  empty marker yields an empty layout (so a never-saved case is unaffected). */
export function layoutFromChoText(text: string | undefined): CaseLayout {
  const empty: CaseLayout = { nodes: {}, edges: {}, handles: {}, stubs: {} };
  if (!text || !text.trim()) return empty;
  try {
    const b = JSON.parse(text) as Partial<ChoMarker>;
    if (!b || typeof b !== "object") return empty;
    const split = splitStubPositions(b.nodes ?? {});
    return {
      nodes: split.nodes,
      viewport: b.viewport,
      edges: b.edges ?? {},
      handles: b.handles ?? {},
      stubs: { ...split.stubs, ...(b.stubs ?? {}) },
    };
  } catch {
    return empty;
  }
}

/** Combine two layouts: the live localStorage WORKING COPY over the case's
 *  `.cho` snapshot ("the way I last left it" beats "the way it was shared"),
 *  a freshly received case with no working copy falling back to its `.cho`,
 *  and a case with neither drawn by the automatic layout (DEV.md 4c C59).
 *
 *  A working copy that carries NODES is a whole snapshot (see
 *  `snapshotLayout`), so it wins whole: its empty edge, handle or stub
 *  section means "none moved", not "ask the .cho".  Only a PARTIAL copy (one
 *  that saved edges or handles but no nodes) still falls back per section. */
export function mergeLayouts(primary: CaseLayout, fallback: CaseLayout): CaseLayout {
  const has = (o?: object) => !!o && Object.keys(o).length > 0;
  if (has(primary.nodes))
    return { nodes: primary.nodes, viewport: primary.viewport ?? fallback.viewport,
             edges: primary.edges ?? {}, handles: primary.handles ?? {},
             stubs: primary.stubs ?? {} };
  return {
    nodes: fallback.nodes,
    viewport: primary.viewport ?? fallback.viewport,
    edges: has(primary.edges) ? primary.edges : fallback.edges,
    handles: has(primary.handles) ? primary.handles : fallback.handles,
    stubs: has(primary.stubs) ? primary.stubs : (fallback.stubs ?? {}),
  };
}

/** THE WHOLE ARRANGEMENT AS DRAWN (Vítor, 2026-10-10: "the first time a case
 *  is opened the arrangement is done by the automatic layout; once the user
 *  has arranged it, you no longer move anything").  Taken the moment the
 *  reader moves ANY node, connection point or edge bend: every UNIT and
 *  TERMINAL position -- including the ones the automatic layout placed and
 *  nobody touched -- so a later improvement of the algorithm can never
 *  reshuffle the untouched nodes around the one that was moved.
 *
 *  A docked stub is NOT in it (case/stubDocking.ts): it is where its unit
 *  is.  Only the stubs the reader dragged himself travel, as `stubOffsets`
 *  (offsets from their units). */
export function snapshotLayout(
  nodes: { id: string; position: XY }[],
  edges: { [id: string]: XY },
  handles: { [key: string]: HandlePos },
  viewport?: Viewport,
  stubOffsets: { [id: string]: XY } = {},
): CaseLayout {
  const pos: { [id: string]: XY } = {};
  for (const n of nodes)
    if (!isStubId(n.id)) pos[n.id] = { x: n.position.x, y: n.position.y };
  return { nodes: pos, viewport, edges: { ...edges }, handles: { ...handles },
           stubs: { ...stubOffsets } };
}

/** Forget this browser's working copy of a case's arrangement: the case then
 *  opens on its `.cho` layout if it ships one, else on the automatic one. */
export function clearLayout(caseName: string): void {
  if (!caseName) return;
  const s = readStore();
  if (!(caseName in s.cases)) return;
  delete s.cases[caseName];
  writeStore(s);
}
