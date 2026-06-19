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

export interface XY { x: number; y: number }
export interface Viewport { x: number; y: number; zoom: number }

export type HandleSide = "left" | "right" | "top" | "bottom";
/** Where a connection point sits on a unit's border: which side, and how
 *  far along it (0..1).  Overrides the default fixed placement so the user
 *  can slide an attachment point along the rectangle to declutter. */
export interface HandlePos { side: HandleSide; frac: number }

export interface CaseLayout {
  nodes: { [id: string]: XY };
  viewport?: Viewport;
  /** Per-edge bend centre (flow coords).  Overrides the smoothstep
   *  auto-routed centre so the user can slide an edge aside when two
   *  lines overlap.  Absent => auto-routed. */
  edges: { [id: string]: XY };
  /** Per-unit connection-point overrides, keyed by `<unitId>\0<handleId>`.
   *  Absent => the unit's default border placement. */
  handles: { [key: string]: HandlePos };
}

const KEY = "choupo.layouts.v1";

type AllLayouts = { [caseName: string]: CaseLayout };

function readAll(): AllLayouts {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AllLayouts;
  } catch {
    return {};
  }
}

function writeAll(all: AllLayouts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota / private-mode: layout memory is best-effort, never fatal.
  }
}

export function loadLayout(caseName: string): CaseLayout {
  const l = readAll()[caseName];
  return {
    nodes: l?.nodes ?? {},
    viewport: l?.viewport,
    edges: l?.edges ?? {},
    handles: l?.handles ?? {},
  };
}

/** Merge a partial layout into the stored one for this case. */
export function saveLayout(caseName: string, patch: Partial<CaseLayout>): void {
  if (!caseName) return;
  const all = readAll();
  const cur = all[caseName] ?? { nodes: {}, edges: {}, handles: {} };
  all[caseName] = {
    nodes: patch.nodes ?? cur.nodes,
    viewport: patch.viewport ?? cur.viewport,
    edges: patch.edges ?? cur.edges,
    handles: patch.handles ?? cur.handles ?? {},
  };
  writeAll(all);
}

// ---- the case's `.cho` marker: the on-DISK, shareable layout -----------------
//
// The localStorage above is the automatic, per-browser working copy.  The
// case folder's `<caseName>.cho` marker is the EXPLICIT, portable snapshot:
// "Save layout to case" serialises the current arrangement into it (a Save-As
// the user drops back into the folder), so the layout travels WITH the case
// (commit it, send it, reopen -> it comes back arranged).  Per the GUI credo
// the GUI never writes to disk silently -- this file is only ever written by
// that explicit action, never on a drag.

const CHO_SCHEMA = 1;

interface ChoMarker {
  choupoLayout: number;
  nodes?: { [id: string]: XY };
  viewport?: Viewport;
  edges?: { [id: string]: XY };
  handles?: { [key: string]: HandlePos };
}

/** Serialise a layout to the JSON text stored in the case's `.cho` marker. */
export function layoutToChoText(l: CaseLayout): string {
  const body: ChoMarker = {
    choupoLayout: CHO_SCHEMA,
    nodes: l.nodes,
    viewport: l.viewport,
    edges: l.edges,
    handles: l.handles,
  };
  return JSON.stringify(body, null, 2) + "\n";
}

/** Parse a `.cho` marker body into a layout.  An empty / non-JSON / legacy
 *  empty marker yields an empty layout (so a never-saved case is unaffected). */
export function layoutFromChoText(text: string | undefined): CaseLayout {
  const empty: CaseLayout = { nodes: {}, edges: {}, handles: {} };
  if (!text || !text.trim()) return empty;
  try {
    const b = JSON.parse(text) as Partial<ChoMarker>;
    if (!b || typeof b !== "object") return empty;
    return {
      nodes: b.nodes ?? {},
      viewport: b.viewport,
      edges: b.edges ?? {},
      handles: b.handles ?? {},
    };
  } catch {
    return empty;
  }
}

/** Combine two layouts, `primary` winning per-section when it has content.
 *  Used so the live localStorage working copy overrides the `.cho` snapshot
 *  ("the way I last left it" beats "the way it was shared"), while a freshly
 *  received case with no localStorage falls back to its shared `.cho`. */
export function mergeLayouts(primary: CaseLayout, fallback: CaseLayout): CaseLayout {
  const has = (o?: object) => !!o && Object.keys(o).length > 0;
  return {
    nodes: has(primary.nodes) ? primary.nodes : fallback.nodes,
    viewport: primary.viewport ?? fallback.viewport,
    edges: has(primary.edges) ? primary.edges : fallback.edges,
    handles: has(primary.handles) ? primary.handles : fallback.handles,
  };
}
