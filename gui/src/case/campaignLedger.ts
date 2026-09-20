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
  campaignLedger -- the PURE projection of the two engine-owned BATCH CAMPAIGN
  LEDGERS (`transfers`, the material one; `energyLedger`, the energy one) into
  the display model the Gantt's energy band, its hovers and the ledger pop-out
  render.

  NO physics here, and no arithmetic the engine did not already do: no
  re-integration, no sums over records, no enthalpy, no balance.  The numbers
  are the engine's ledger verbatim.

  THE ABSENCE CONTRACT -- the reason this module exists rather than the plot
  reading the arrays itself.  `src/result/ResultEmitter.cpp` writes `H_kJ`
  ONLY when the engine's `H_valid` is true and `E_kJ` ONLY when `E_valid` is,
  and it emits neither boolean; an unpriceable record instead carries
  `H_missing` / `E_missing` naming why.  So on this side THE NUMBER'S PRESENCE
  IS ITS VALIDITY, and an engine refusal stays a REFUSAL in the model, never a
  fabricated zero.

  WHY THAT DISTINCTION IS LOAD-BEARING AND NOT PEDANTRY.  The corpus holds
  BOTH states at once (measured 2026-09-20 over every `tutorials/batch` case):
  five energy records are UNPRICEABLE, and four others carry `E_kJ` EXACTLY 0
  -- `batch14_transport_only`, `batch16_ergun_profile`,
  `batch24_blowdown_inert` and `recipe01_react_then_distill`.  A reader
  writing `r.E_kJ ?? 0` draws those nine identically, which is precisely the
  claim the engine refused to make.  Hence `energyState`, and hence the
  drawing rule the band obeys: a refusal is HATCHED at full height with no
  direction, while a priced zero is a zero-height tick on the baseline.
\*---------------------------------------------------------------------------*/

import type {
  EnergyRecord, TransferRecord,
} from "../adapters/SolverAdapter.js";

/** "priced" -- the engine published the number (INCLUDING an exact 0, which
 *  is a measurement).  "refused" -- the engine withheld it; `missing` names
 *  why, and is empty only if the engine named no reason. */
export type LedgerValidity = "priced" | "refused";

export interface EnergyRow {
  tStart: number;
  tEnd: number;
  unit: string;
  kind: string;
  validity: LedgerValidity;
  /** Present iff validity === "priced".  Sign is DIRECTION: > 0 = heat ADDED
   *  to the vessel. */
  E_kJ?: number;
  missing: string[];
  basis: string;
  T_service_K?: number;
  /** tEnd === tStart: an IMPULSE has energy and no modelled duration.  The
   *  engine says so itself (`SimulationResult.H`: the utility peak pass
   *  excludes impulses because they have no duration), so a tile drawn wide
   *  enough to see must not also claim an interval. */
  instantaneous: boolean;
}

export interface TransferRow {
  tStart: number;
  tEnd: number;
  from: string;
  to: string;
  kind: string;
  validity: LedgerValidity;
  /** Present iff validity === "priced". */
  H_kJ?: number;
  missing: string[];
  /** The per-component amounts, sorted by descending |dn| so the hover's
   *  first line is the component that actually moved.  The ENGINE's numbers;
   *  no total is computed here -- the timeline already collapses to a total
   *  and that collapse is the defect this module exists to undo. */
  dn: { component: string; kmol: number }[];
}

/** The run's own magnitude reference for the energy band.
 *
 *  A DECLARED SCALE IS HONEST AND AN UNDECLARED ONE IS NOT (the 2026-09-08
 *  rule, "the numerical FLOOR is not a scale"): the band normalises every
 *  bar to `maxAbsKJ` and the legend PRINTS that number, so a reader knows
 *  what full height means on THIS run and never compares two runs' heights
 *  by eye.
 *
 *  `maxAbsKJ` is null in two measured states, and they are different facts:
 *  every record refused (`batch03_consecutive`), or every priced record is
 *  exactly 0 (`batch14_transport_only`, `batch16_ergun_profile`,
 *  `batch24_blowdown_inert`).  Either way there is NO scale, dividing by it
 *  would be 0/0, and `reason` is what the legend says instead. */
export interface EnergyScale {
  maxAbsKJ: number | null;
  reason?: "all refused" | "every priced record is exactly zero" | "no records";
}

export function energyScale(rows: EnergyRow[]): EnergyScale {
  if (rows.length === 0) return { maxAbsKJ: null, reason: "no records" };
  const priced = rows.filter((r) => r.validity === "priced");
  if (priced.length === 0) return { maxAbsKJ: null, reason: "all refused" };
  let max = 0;
  for (const r of priced) max = Math.max(max, Math.abs(r.E_kJ!));
  if (!(max > 0))
    return { maxAbsKJ: null,
             reason: "every priced record is exactly zero" };
  return { maxAbsKJ: max };
}

/** The normalised magnitude of one row against the run's own scale, in [0, 1].
 *
 *  `null` means "no fraction can be stated" -- a refusal, or a run with no
 *  scale -- and the caller draws the REFUSAL form rather than a height.  An
 *  exactly-zero priced record returns 0, which is the honest height for a
 *  measured zero: giving it the minimum-visible height the band gives a tiny
 *  NON-zero record would make the two the same picture, one register down
 *  from the `?? 0` this module exists to forbid. */
export function energyFraction(row: EnergyRow, scale: EnergyScale): number | null {
  if (row.validity !== "priced") return null;
  if (scale.maxAbsKJ === null) return null;
  const f = Math.abs(row.E_kJ!) / scale.maxAbsKJ;
  return Number.isFinite(f) ? Math.min(1, f) : null;
}

/** +1 heat ADDED to the vessel, -1 removed, 0 for a measured zero.  `null`
 *  for a refusal: an unpriceable segment has NO direction, and picking one
 *  would be the fabrication in its most readable form. */
export function energyDirection(row: EnergyRow): 1 | -1 | 0 | null {
  if (row.validity !== "priced") return null;
  const e = row.E_kJ!;
  return e > 0 ? 1 : e < 0 ? -1 : 0;
}

export function energyRow(r: EnergyRecord): EnergyRow {
  const priced = typeof r.E_kJ === "number" && Number.isFinite(r.E_kJ);
  return {
    tStart: r.tStart,
    tEnd: r.tEnd,
    unit: r.unit,
    kind: r.kind,
    validity: priced ? "priced" : "refused",
    ...(priced ? { E_kJ: r.E_kJ! } : {}),
    missing: r.E_missing ?? [],
    basis: r.basis ?? "",
    ...(typeof r.T_service_K === "number" ? { T_service_K: r.T_service_K } : {}),
    instantaneous: r.tEnd === r.tStart,
  };
}

export function transferRow(r: TransferRecord): TransferRow {
  const priced = typeof r.H_kJ === "number" && Number.isFinite(r.H_kJ);
  const dn = Object.entries(r.dn ?? {})
    .map(([component, kmol]) => ({ component, kmol }))
    .sort((a, b) => Math.abs(b.kmol) - Math.abs(a.kmol)
                    || a.component.localeCompare(b.component));
  return {
    tStart: r.tStart,
    tEnd: r.tEnd,
    from: r.from,
    to: r.to,
    kind: r.kind,
    validity: priced ? "priced" : "refused",
    ...(priced ? { H_kJ: r.H_kJ! } : {}),
    missing: r.H_missing ?? [],
    dn,
  };
}

export interface CampaignLedgerView {
  energy: EnergyRow[];
  transfers: TransferRow[];
  /** The energy rows grouped by their vessel, in the order the caller's lane
   *  list gives; a lane with no energy record simply has no entry, which is
   *  what lets the band be absent rather than empty. */
  energyByUnit: Map<string, EnergyRow[]>;
  scale: EnergyScale;
  /** Every `kind` word present in THIS run's energy ledger, sorted.  The
   *  legend is built from this and never from a hard-coded canon: the one in
   *  `SimulationResult.H`'s comment names five words the engine never writes
   *  and misses four it does (measured 2026-09-20), and nothing reads it. */
  energyKinds: string[];
}

export function campaignLedgerView(
  transfers: TransferRecord[] | undefined,
  energyLedger: EnergyRecord[] | undefined,
): CampaignLedgerView {
  const energy = (energyLedger ?? []).map(energyRow);
  const byUnit = new Map<string, EnergyRow[]>();
  for (const r of energy) {
    const list = byUnit.get(r.unit);
    if (list) list.push(r); else byUnit.set(r.unit, [r]);
  }
  const kinds = [...new Set(energy.map((r) => r.kind))].sort();
  return {
    energy,
    transfers: (transfers ?? []).map(transferRow),
    energyByUnit: byUnit,
    scale: energyScale(energy),
    energyKinds: kinds,
  };
}

/*  ---- formatting -------------------------------------------------------
 *
 *  Kept HERE rather than in the plot so the hover a student reads and the
 *  cell the pop-out table prints are the same sentence, built once.  Every
 *  formatter renders a refusal AS a refusal: there is no code path from an
 *  absent number to a printed "0". */

/** A number for reading, not for re-deriving: 6 significant figures, with the
 *  exponent form only where the fixed form would be unreadable. */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(4);
  return String(Number(v.toPrecision(6)));
}

export function fmtTime(t: number): string {
  if (!Number.isFinite(t)) return "—";
  return t >= 100 ? String(Math.round(t))
                  : String(Math.round(t * 1000) / 1000);
}

/** `[a, b] s`, or `t = a s (instantaneous)` for a zero-span record. */
export function fmtInterval(tStart: number, tEnd: number): string {
  return tEnd === tStart
    ? `t = ${fmtTime(tStart)} s (instantaneous)`
    : `[${fmtTime(tStart)}, ${fmtTime(tEnd)}] s`;
}

/** The refusal sentence, with the engine's own reasons quoted.  Used wherever
 *  a priced number would otherwise stand, so the two can never be confused. */
export function fmtRefusal(missing: string[], what: string): string {
  return missing.length > 0
    ? `${what} UNPRICEABLE — ${missing.join("; ")}`
    : `${what} UNPRICEABLE — the engine named no reason`;
}

/** Does this run have a campaign sequence to draw at all?
 *
 *  EITHER LEDGER IS ENOUGH, and that is the widening this module exists
 *  beside.  The plot's availability used to be `timeline.length > 0`;
 *  MEASURED over every `tutorials/batch` case on 2026-09-20, TEN of the 28
 *  that publish an `energyLedger` fire no recipe event at all -- every plain
 *  `batch01..08` reactor, both Pitzer crystallisers, the Zeldovich
 *  post-flame -- so their whole energy history was unreachable.  `transfers`
 *  is included although no corpus case publishes one without a timeline:
 *  "no case does this today" is not a contract.
 *
 *  PURE, AND HERE, because it is the one decision that made those ten cases
 *  reachable, and a `useMemo` inside a React component is asserted by
 *  nothing in this repo -- there is no render-test harness.  Found by
 *  sabotage: narrowing it back to the timeline alone left all 4053 tests
 *  green. */
export function hasCampaignSequence(result: {
  timeline?: unknown[];
  transfers?: unknown[];
  energyLedger?: unknown[];
} | null | undefined): boolean {
  return (result?.timeline?.length ?? 0) > 0
      || (result?.transfers?.length ?? 0) > 0
      || (result?.energyLedger?.length ?? 0) > 0;
}

/** THE SCALE SENTENCE, and it has ONE home because it is one claim.
 *
 *  The Gantt's legend and the ledger pop-out both state what "full height"
 *  meant on this run; written twice they would drift, and a legend whose
 *  reference disagrees with the table's is worse than neither.  It also puts
 *  the sentence under test: nothing here renders React, so a string built
 *  inside the component would be asserted by nothing.
 *
 *  `inPlot` picks the phrasing for the two surfaces -- the legend is beside
 *  the bars it measures, the table is not. */
export function energyScaleSentence(scale: EnergyScale,
                                    inPlot: boolean): string {
  if (scale.maxAbsKJ !== null)
    return inPlot
      ? `full height = ${fmtNum(scale.maxAbsKJ)} kJ`
      : `largest |E| in this run: ${fmtNum(scale.maxAbsKJ)} kJ`;
  const why = scale.reason ?? "no records";
  return inPlot ? `no scale — ${why}` : `no energy scale — ${why}`;
}

export function energyHover(row: EnergyRow): string {
  const lines = [
    `${row.unit} — ${row.kind}`,
    fmtInterval(row.tStart, row.tEnd),
    row.validity === "priced"
      ? `E = ${fmtNum(row.E_kJ!)} kJ  (${row.E_kJ! > 0 ? "added to"
          : row.E_kJ! < 0 ? "removed from" : "exchanged with"} the vessel)`
      : fmtRefusal(row.missing, "E"),
  ];
  if (row.T_service_K !== undefined)
    lines.push(`T_service = ${fmtNum(row.T_service_K)} K`);
  if (row.basis) lines.push(`basis: ${row.basis}`);
  return lines.join("\n");
}

/** The MATERIAL hover: the interval, what moved PER COMPONENT, and what it
 *  carried.  This is the line the timeline's `detail` string cannot be --
 *  that one reads "TRANSFER 0.0005 kmol hot -> cold", having summed the `dn`
 *  map and dropped the 136.6 kJ the same record publishes. */
export function transferHover(row: TransferRow): string {
  const lines = [
    `${row.from} → ${row.to}  (${row.kind})`,
    fmtInterval(row.tStart, row.tEnd),
  ];
  if (row.dn.length === 0) lines.push("dn: (no component moved)");
  else for (const d of row.dn)
    lines.push(`  ${d.component}  ${fmtNum(d.kmol)} kmol`);
  lines.push(row.validity === "priced"
    ? `H transported = ${fmtNum(row.H_kJ!)} kJ`
    : fmtRefusal(row.missing, "H"));
  return lines.join("\n");
}

/** The ledger record(s) a timeline mark came from.
 *
 *  `choupoBatch` builds the timeline BY ITERATING `transfers` (main.cpp, the
 *  "the MATERIAL rows are DERIVED from the ledger" block) and then throws the
 *  correspondence away -- neither side carries an id.  So the mark is matched
 *  back on the fields both sides DO carry: the edge and the instant.  The
 *  timeline stamps a discrete record at its `tEnd` and a continuous one at
 *  its `tStart` with `tEnd` alongside, which is what the two branches below
 *  are; the times are compared exactly because both come from the same
 *  `scalar`, through one serialiser, in one run.
 *
 *  IT RETURNS A LIST, AND THE CALLER SHOWS ALL OF THEM.  An edge CAN carry
 *  two records at one instant -- `check_campaign_ledger_pinned` measured
 *  three corpus cases logging two `feedAmendment` records on one edge at one
 *  time, which is exactly why a record's own `tStart` is not a key there
 *  either.  Picking one would be a guess; showing both is the ledger. */
export function matchTransferRows(
  rows: TransferRow[],
  mark: { lane: string; toLane?: string; t: number; tEnd?: number },
): TransferRow[] {
  if (mark.toLane === undefined) return [];
  return rows.filter((r) =>
    r.from === mark.lane && r.to === mark.toLane
    && (mark.tEnd !== undefined
          ? r.tStart === mark.t && r.tEnd === mark.tEnd
          : r.tEnd === mark.t));
}
