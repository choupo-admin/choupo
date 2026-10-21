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
  THE PHASE-SPLIT SCANS as the engine published them (DEV.md 4c C118): the
  result JSON's top-level `"phaseSplitScans"` block, written by choupoProps
  for every `phaseSplitScan` op (src/propertyOps/PhaseSplitScan.cpp, through
  `PropertyOperation::resultBlock()`), its TYPES and the one function that
  polices them.  Its own file, beside buildingPayload.ts, so the adapter
  reaches it without pulling the component catalogue the lens's own module
  (case/phaseSplitScan.ts) reads.

  Only the types are policed: a point without finite T and P is dropped (it
  cannot be placed on an axis), a phase without a finite amount is dropped
  from its point.  Nothing is computed -- no amount, no boundary, no pH.
\*---------------------------------------------------------------------------*/

export interface PhaseSplitAnnouncement { category: string; locus: string; message: string }

export interface PhaseSplitPointResult {
  /** The swept variable's value at this point (K or Pa). */
  at: number;
  T: number;
  P: number;
  solved: boolean;
  /** The refusal, verbatim (refused points only). */
  reason?: string;
  phaseSet?: string;
  regime?: string;
  phases: { [name: string]: { amount: number; x: { [component: string]: number } } };
  observables: { [key: string]: number };
  species?: { [name: string]: number };
  /** The record-level announcements this point was the first to raise. */
  firstRaised: PhaseSplitAnnouncement[];
}

export interface PhaseSplitEvent {
  /** appears | disappears | phaseSet -- the engine's word, carried as is. */
  kind: string;
  phase: string;
  /** The two grid values the change lies between (K or Pa). */
  from: number;
  to: number;
  index: number;
  acrossRefused: boolean;
}

export interface PhaseSplitScanBlock {
  op: string;
  variable: "T" | "P";
  held: { name: "T" | "P"; value: number };
  feed: { [component: string]: number };
  /** In plot order: V, L1, L2, then the solids as met. */
  phaseNames: string[];
  /** The package's own names for V / L1 / L2 (`liquor`, `aqueous`, ...). */
  phaseLabels: { [name: string]: string };
  csv: string;
  points: PhaseSplitPointResult[];
  events: PhaseSplitEvent[];
  notModelled: string[];
}

const isObj = (v: unknown): v is { [k: string]: unknown } =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numMap = (v: unknown): { [k: string]: number } => {
  const out: { [k: string]: number } = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (fin(x)) out[k] = x;
  return out;
};

/** Police the TYPES of the `phaseSplitScans` block, one entry per op.  A
 *  point without finite T and P is dropped (it cannot be placed on an axis);
 *  a phase without a finite amount is dropped from its point; nothing is
 *  computed. */
export function shapePhaseSplitScans(raw: unknown): PhaseSplitScanBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PhaseSplitScanBlock[] = [];
  for (const b of raw) {
    if (!isObj(b)) continue;
    const variable = b.variable === "P" ? "P" : b.variable === "T" ? "T" : null;
    if (!variable) continue;
    const heldName = variable === "T" ? "P" : "T";
    const heldObj = isObj(b.held) ? b.held : {};
    const heldValue = fin(heldObj[heldName]) ? heldObj[heldName] as number : NaN;
    const points: PhaseSplitPointResult[] = [];
    for (const p of Array.isArray(b.points) ? b.points : []) {
      if (!isObj(p) || !fin(p.T) || !fin(p.P)) continue;
      const phases: PhaseSplitPointResult["phases"] = {};
      if (isObj(p.phases))
        for (const [name, ph] of Object.entries(p.phases)) {
          if (!isObj(ph) || !fin(ph.amount)) continue;
          phases[name] = { amount: ph.amount, x: numMap(ph.x) };
        }
      const firstRaised: PhaseSplitAnnouncement[] = [];
      for (const a of Array.isArray(p.firstRaised) ? p.firstRaised : [])
        if (isObj(a) && typeof a.message === "string")
          firstRaised.push({ category: str(a.category), locus: str(a.locus), message: a.message });
      const solved = p.solved === true;
      points.push({
        at: variable === "T" ? p.T as number : p.P as number,
        T: p.T as number, P: p.P as number, solved,
        ...(typeof p.reason === "string" ? { reason: p.reason } : {}),
        ...(typeof p.phaseSet === "string" ? { phaseSet: p.phaseSet } : {}),
        ...(typeof p.regime === "string" ? { regime: p.regime } : {}),
        phases: solved ? phases : {},
        observables: solved ? numMap(p.observables) : {},
        ...(isObj(p.species) ? { species: numMap(p.species) } : {}),
        firstRaised,
      });
    }
    const events: PhaseSplitEvent[] = [];
    for (const e of Array.isArray(b.events) ? b.events : []) {
      if (!isObj(e) || !fin(e.from) || !fin(e.to)) continue;
      events.push({ kind: str(e.kind), phase: str(e.phase), from: e.from, to: e.to,
                    index: fin(e.index) ? e.index : -1, acrossRefused: e.acrossRefused === true });
    }
    const labels: { [k: string]: string } = {};
    if (isObj(b.phaseLabels))
      for (const [k, v] of Object.entries(b.phaseLabels)) if (typeof v === "string") labels[k] = v;
    out.push({
      op: str(b.op), variable,
      held: { name: heldName, value: heldValue },
      feed: numMap(b.feed),
      phaseNames: Array.isArray(b.phaseNames) ? b.phaseNames.filter((s): s is string => typeof s === "string") : [],
      phaseLabels: labels,
      csv: str(b.csv),
      points, events,
      notModelled: Array.isArray(b.notModelled) ? b.notModelled.filter((s): s is string => typeof s === "string") : [],
    });
  }
  return out;
}

