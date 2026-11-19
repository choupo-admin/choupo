/*---------------------------------------------------------------------------*\
  pipeRegisterRows -- the DOCKED pipe register's rows (DEV.md 4c C91, Vitor:
  "a pipe register dockable beside the 3D view").

  One row per routed pipe, numbers kept AS NUMBERS so the register sorts
  them (SortableTable), joined by stream to the engine's line sheet (C207,
  `layout.lines`, present only when the case declares `lineDesign {}`).  Size,
  velocity and pressure drop are the sheet's and nothing else: a pipe with no
  sheet, or an unsized one, shows them empty -- the layout sizes no pipe and
  the GUI computes none.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { endName, pipeId } from "./plantLayout.js";

export interface DockedPipeRow {
  /** The engine's pipe id (`pipe:<stream>` ...): what the 3D view selects by. */
  id: string;
  tag: string;
  ends: string;
  /** Nominal pipe size, inches; null when no sized line sheet. */
  nps: number | null;
  length: number;
  velocity: number | null;
  /** Total pressure drop of the line, kPa (the sheet's, signed); null when none. */
  dropKPa: number | null;
  sized: boolean;
}

export function dockedPipeRows(layout: PlantLayout): DockedPipeRow[] {
  const sheets = new Map((layout.lines ?? []).map((l) => [l.stream, l]));
  return (layout.pipes ?? []).map((p): DockedPipeRow => {
    const sh = p.branch ? undefined : sheets.get(p.stream);
    const sized = !!sh && sh.sizeState === "sized";
    const num = (v: number | undefined) =>
      sized && v !== undefined && Number.isFinite(v) ? v : null;
    const drop = num(sh?.lineDrop);
    return {
      id: pipeId(p),
      tag: p.branch ? `${p.stream} > ${p.branch}` : p.stream,
      ends: `${endName(p.fromKind, p.from)} → ${endName(p.toKind, p.to)}`,
      nps: num(sh?.lineNps),
      length: p.length,
      velocity: num(sh?.lineVelocity),
      dropKPa: drop === null ? null : drop / 1e3,
      sized,
    };
  });
}
