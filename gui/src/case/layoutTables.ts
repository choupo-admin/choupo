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
  THE PLANT LAYOUT AS TABLES -- the words and the cells, with no React in
  them (DEV.md 4c C75, C80, C81).

  Two kinds of surface show the engine's `layout {}` block as tables: the
  app (Reports -> "Plant layout (3D)", the `?layout=` tab, through
  ui/PlantLayoutTables.tsx) and the self-contained page "Export as page"
  writes (case/layoutExport.ts).  Both read their rows, captions, notes and
  legend sentences HERE, so the pipe register a student shares is the one
  they saw, cell for cell.  Every number is the engine's, formatted; nothing
  is measured or judged here.  The register's TOTAL length is the sum of the
  engine's own lengths, as the app has always printed it.
\*---------------------------------------------------------------------------*/

import type { LayoutPipeRack, PlantLayout } from "../adapters/SolverAdapter.js";
import { endName, PHASE_WORDS, phaseOf, SPEED_RULE, type Phase } from "./plantLayout.js";

/** The particle each phase carries, as a word for the legend. */
export const PARTICLE_WORD: Record<Phase, string> = {
  liquid: "spheres", vapour: "octahedra", twoPhase: "spheres and octahedra", unknown: "cubes",
};

/** The legend, after "Declared in system/layoutDict." (which a surface sets
 *  with the file name as code). */
export const LEGEND_SHAPES =
  "Cylinders are items whose sizer published a diameter and a length; boxes are footprints"
  + " the case declared.  Translucent cylinders are the declared hazardous-area zones"
  + " (zone 0 densest and solid-edged, zone 1 wire, zone 2 faint and dashed).  A label is"
  + " the item id (⚠ marks an item the engine named in a finding); hover an item or a pipe"
  + " for the rest.";

/** How to move the view with a mouse. */
export const LEGEND_CONTROLS =
  "Drag to orbit, right-drag to pan, wheel to zoom; Fit frames the plant again.";

/** The phases a legend lists. */
export const LEGEND_PHASES: Phase[] = ["liquid", "vapour", "twoPhase"];

/** The sentence under the phase swatches. */
export const LEGEND_PIPES =
  "Pipes are routed and measured by the engine (up to the rack, along it, down), and the"
  + ` particles move in the direction of flow; ${SPEED_RULE}.  The Flow box stops them.`;

export const PIPE_REGISTER_CAPTION =
  "Pipe register: routed and measured by the engine; no pressure drop and no cost yet"
  + " (the next slice).";

/** Where the rack is, and who said so. */
export function rackSentence(k: LayoutPipeRack): string {
  return k.declared
    ? `Rack declared by the case at y = ${k.y.toFixed(1)} m, ${k.elevation.toFixed(1)} m up.`
    : `No rack declared: the engine's stated default at y = ${k.y.toFixed(1)} m,`
      + ` ${k.elevation.toFixed(1)} m up.`;
}

export interface PipeRow {
  stream: string;
  ends: string;
  phase: Phase;
  phaseWord: string;
  T: string;
  P: string;
  flow: string;
  length: string;
}

export interface PipeRegisterView {
  rows: PipeRow[];
  /** "N pipes, in all" and the sum of the engine's lengths; null with no pipe. */
  total: { label: string; length: string } | null;
  rack: string | null;
  notRouted: { stream: string; reason: string }[];
}

/** The pipe register: one row per pipe the engine routed, then what it did
 *  not route and why; null when the block carries neither. */
export function pipeRegister(layout: PlantLayout): PipeRegisterView | null {
  const pipes = layout.pipes ?? [];
  const notRouted = layout.notRouted ?? [];
  if (pipes.length === 0 && notRouted.length === 0) return null;
  const fx = (v: number | undefined, d: number) =>
    v === undefined || !Number.isFinite(v) ? "" : v.toFixed(d);
  const rows = pipes.map((p): PipeRow => {
    const ph = phaseOf(p.vf);
    return {
      stream: p.label ? `${p.stream} (${p.label})` : p.stream,
      ends: `${endName(p.fromKind, p.from)} → ${endName(p.toKind, p.to)}`,
      phase: ph,
      phaseWord: PHASE_WORDS[ph],
      T: fx(p.T, 1),
      P: p.P === undefined ? "" : fx(p.P / 1e5, 2),
      flow: p.F_mass === undefined ? "" : p.F_mass.toPrecision(4),
      length: `${p.length.toFixed(1)}${p.routedBy === "waypoints" ? " (declared route)" : ""}`,
    };
  });
  const total = pipes.reduce((a, p) => a + p.length, 0);
  return {
    rows,
    total: pipes.length > 0
      ? { label: `${pipes.length} pipes, in all`, length: total.toFixed(1) } : null,
    rack: layout.pipeRack ? rackSentence(layout.pipeRack) : null,
    notRouted: notRouted.map((n) => ({ stream: n.stream, reason: n.reason })),
  };
}

export const FINDINGS_CAPTION =
  "Findings -- announced by the engine, never refused: a layout that is too close is a"
  + " draft the student must see and defend.";

export interface FindingRow { kind: string; measured: string; declared: string; message: string }

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "?");

/** One row per finding the engine published, in its order. */
export function findingRows(layout: PlantLayout): FindingRow[] {
  return layout.findings.map((f) => ({
    kind: f.kind,
    measured: f.kind === "outsideArea" || f.kind === "deadRule" || f.kind === "sizingRefused"
      ? "" : f2(f.value),
    declared: f.kind === "outsideArea" || f.kind === "sizingRefused" ? "" : f2(f.limit),
    message: f.message,
  }));
}

export interface ItemRow {
  id: string; kind: string; sector: string; shape: string;
  position: string; extents: string; sizeFrom: string; hazard: string;
}

/** One row per placed item, in the engine's order. */
export function itemRows(layout: PlantLayout): ItemRow[] {
  return layout.items.map((i) => ({
    id: i.id,
    kind: i.nonProcess ? `${i.kind} (non-process)` : i.kind,
    sector: i.sector,
    shape: `${i.shape} ${i.orientation}`,
    position: `${f2(i.x)}, ${f2(i.y)}, ${f2(i.z)}`,
    extents: `${f2(i.dx)} x ${f2(i.dy)} x ${f2(i.dz)}`,
    sizeFrom: i.footprintFrom === "published" ? "its own sizing" : "declared",
    hazard: [i.release
      ? `release (zones ${i.release.zones.map((z) => z.zone).join(", ") || "none"})` : "",
             i.ignition ? "ignition" : ""].filter(Boolean).join("; "),
  }));
}

/** The notes under the item table: what was not placed, and whose the
 *  separation distances and the wind are.  Null where there is nothing to
 *  say. */
export function layoutNotes(layout: PlantLayout): {
  unplaced: string | null; internal: string | null; sources: string | null;
} {
  return {
    unplaced: layout.unplaced.length > 0
      ? `Sized but not placed: ${layout.unplaced.join(", ")}.` : null,
    internal: layout.internal.length > 0
      ? `Inside or on another item, never placed alone: ${layout.internal.join(", ")}.` : null,
    sources: layout.separation.length > 0
      ? `Separation distances are the case's own (${layout.separation.map((t) => t.source).join("; ")}).`
        + (layout.wind ? `  Wind: ${layout.wind.source}.` : "")
      : null,
  };
}
