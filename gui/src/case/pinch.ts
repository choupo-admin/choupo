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
  The GRID DIAGRAM's input, READ from the engine's pinch pass -- computed
  nowhere in the browser.  (Until 2026-11-05 this file rebuilt the stream
  population from each unit's `Q_kW` and ran its own Problem Table: a second
  home of `PinchPass`, which drew one cold "stream" for a feed-effluent
  exchanger and counted a water cooler's duty magnitude as a cold stream
  (DEV.md 4c C230).  The engine decides, the GUI draws.)

  What it reads, all written by `pinchPass` (postProcessing/PinchPass.cpp):

    reports/pinch/population.csv         the streams the targets were taken
                                         from (role segment | recovered) and
                                         the service sides left out (utility)
    reports/pinch/candidateMatches.csv   the admissible candidate matches
    reports/pinch/problemTable.csv       the worked Linnhoff-Flower cascade
    reports/pinch/summary.csv            the CLASS word (interiorPinch |
                                         severalPinches | threshold...), the
                                         pinches and the pinch's heat flow
    kpis.pinch                           Q_H_min_kW, Q_C_min_kW, T_pinch_K,
                                         Q_heat_current_kW, Q_cool_current_kW

  A run with no `pinchPass` yields NO pinch (`pinchFromEngine` returns null)
  and the tab says what to declare; nothing is computed in its place.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";

export const POPULATION_CSV_PATH = "reports/pinch/population.csv";
export const MATCHES_CSV_PATH = "reports/pinch/candidateMatches.csv";
export const PROBLEM_TABLE_CSV_PATH = "reports/pinch/problemTable.csv";
export const SUMMARY_CSV_PATH = "reports/pinch/summary.csv";

/** The exact postDict excerpt that makes the engine write the pinch. */
export const PINCH_PASS_EXCERPT = "pinchPass { dTmin 20 K; }";

/** The classes the engine's cascade publishes (PinchPass.cpp, one place). */
export const PINCH_CLASS_TEXT: { [word: string]: string } = {
  interiorPinch: "interior pinch: the cascade touches zero at one interior temperature, so heat cannot cross it",
  severalPinches: "several pinches: the cascade touches zero at more than one interior temperature, so the problem splits into independent sub-problems",
  thresholdNoHotUtility: "threshold problem, no hot utility needed: the cascade touches zero only at the top of the range, so there is no interior pinch",
  thresholdNoColdUtility: "threshold problem, no cold utility needed: the cascade touches zero only at the bottom of the range, so there is no interior pinch",
  thresholdNoUtility: "threshold problem, no utility needed: the streams exchange all their heat with each other, so there is no interior pinch",
};

/** One row of reports/pinch/problemTable.csv, exactly as the engine wrote it. */
export interface ProblemRow {
  interval: number; Thi: number; Tlo: number;      // shifted T*, K
  cpHot: number; cpCold: number;                   // kW/K
  dH: number; casIn: number; casOut: number;       // kW
  corIn: number; corOut: number;                   // kW, with Q_H,min fed in
  tag: string; hotStreams: string; coldStreams: string;
}

export function parseProblemTable(csv: string): ProblemRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2 || !lines[0]!.startsWith("interval,T_star_hi_K,T_star_lo_K")) return [];
  const out: ProblemRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < 13) continue;
    const n = f.slice(0, 10).map(Number);
    if (!n.every(Number.isFinite)) continue;
    out.push({ interval: n[0]!, Thi: n[1]!, Tlo: n[2]!, cpHot: n[3]!, cpCold: n[4]!,
      dH: n[5]!, casIn: n[6]!, casOut: n[7]!, corIn: n[8]!, corOut: n[9]!,
      tag: f[10]!, hotStreams: f[11]!, coldStreams: f[12]! });
  }
  return out;
}

/** The grand composite curve = the corrected cascade against T*, READ from
 *  the problem table (the engine's numbers; no arithmetic on them). */
export function grandCompositeFromTable(rows: ProblemRow[]): { T: number; H: number }[] {
  if (rows.length === 0) return [];
  return [{ T: rows[0]!.Thi, H: rows[0]!.corIn },
          ...rows.map((r) => ({ T: r.Tlo, H: r.corOut }))];
}

export interface PinchSummary {
  class: string; nPinches: number; pinchStar: number[];
  Hpinch: number | null; coldOffset: number | null;
}

export function parseSummary(csv: string): PinchSummary | null {
  const m: { [k: string]: string } = {};
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(",");
    if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!m["class"]) return null;
  const num = (v: string | undefined) =>
    (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return { class: m["class"]!, nPinches: Number(m["n_pinches"] ?? 0),
    pinchStar: (m["pinch_T_star_K"] ?? "").split(";").filter((x) => x).map(Number),
    Hpinch: num(m["H_pinch_kW"]), coldOffset: num(m["cold_curve_offset_kW"]) };
}

/** Every population row, utility sides included, for the stream table. */
export interface StreamRow {
  unit: string; role: string; side: string;
  Tin: number; Tout: number; Q_kW: number; CP: number; reason: string;
}
export function parseStreamTable(csv: string): StreamRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2 || !lines[0]!.startsWith("unit,kpi,role,side,T_in_K,T_out_K,Q_kW")) return [];
  const out: StreamRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < 8 || f[2] === "excluded") continue;
    const Tin = Number(f[4]), Tout = Number(f[5]), Q = Number(f[6]), CP = Number(f[7]);
    if (![Tin, Tout, Q].every(Number.isFinite)) continue;
    out.push({ unit: f[0]!, role: f[2]!, side: f[3]!, Tin, Tout, Q_kW: Q,
      CP: Number.isFinite(CP) ? CP : NaN, reason: f.slice(8).join(",") });
  }
  return out;
}

export interface ThermalStream { unit: string; kind: "hot" | "cold"; Ts: number; Tt: number; Q_kW: number; }
// A candidate process-process match the ENGINE admits (candidateMatches.csv).
export interface HeatMatch { hot: string; cold: string; capKW: number; side: "above" | "below"; }
export interface PinchResult {
  streams: ThermalStream[];
  dTmin: number;
  QhMin: number;            // minimum hot utility (kW), engine
  QcMin: number;            // minimum cold utility (kW), engine
  QhNow: number;            // current hot utility (kW), engine
  QcNow: number;            // current cold utility (kW), engine
  pinchShift: number | null; // shifted pinch temperature; null = no pinch
  pinchHot: number | null;   // T* + dTmin/2 (engine T_pinch_hot_K)
  pinchCold: number | null;  // T* - dTmin/2 (engine T_pinch_cold_K)
  matches: HeatMatch[];     // the engine's admissible candidates
  problemClass: string | null;  // the engine's word, summary.csv
}

/** Why the Pinch tab is greyed: only the absence of a run.  Whether the run
 *  carries a pinch is the engine's business and the tab says so itself. */
export function pinchDisabledReason(runResult: RunResult | null): string | null {
  return runResult ? null : "Run the flowsheet first — pinch needs the converged run";
}

export function canComputePinch(runResult: RunResult | null): boolean {
  return pinchDisabledReason(runResult) === null;
}

/** population.csv rows -> the grid's streams.  Utility rows are NOT streams. */
export function parsePopulation(csv: string): ThermalStream[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2 || !lines[0]!.startsWith("unit,kpi,role,side,T_in_K,T_out_K,Q_kW")) return [];
  const out: ThermalStream[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < 8) continue;
    const role = f[2]!;
    if (role !== "segment" && role !== "recovered") continue;
    const Ts = Number(f[4]), Tt = Number(f[5]), Q = Number(f[6]);
    if (![Ts, Tt, Q].every(Number.isFinite)) continue;
    out.push({ unit: f[0]!, kind: Q < 0 ? "hot" : "cold", Ts, Tt, Q_kW: Math.abs(Q) });
  }
  return out;
}

/** candidateMatches.csv -> the grid's connections (temperature-feasible only). */
export function parseMatches(csv: string): HeatMatch[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const out: HeatMatch[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length !== 8 || f[3] !== "yes") continue;
    const cap = Number(f[5]);
    if (!Number.isFinite(cap)) continue;
    out.push({ hot: f[1]!, cold: f[2]!, capKW: cap,
               side: f[0]!.startsWith("above") ? "above" : "below" });
  }
  return out;
}

/** The engine's pinch for a run, or null when it declared no `pinchPass`. */
export function pinchFromEngine(runResult: RunResult | null): PinchResult | null {
  const k = runResult?.kpis?.["pinch"];
  const pop = runResult?.csvFiles?.[POPULATION_CSV_PATH];
  if (!k || pop === undefined || k["Q_H_min_kW"] == null) return null;
  const streams = parsePopulation(pop);
  if (streams.length === 0) return null;
  const mcsv = runResult?.csvFiles?.[MATCHES_CSV_PATH];
  // The engine leaves T_pinch at the top of the range when the cascade never
  // closes (a threshold problem): that is "no pinch", and says so here.
  const dT = k["dTmin_K"] ?? 0;
  const Ttop = Math.max(...streams.map((s) =>
    Math.max(s.Ts, s.Tt) + (s.kind === "hot" ? -0.5 : 0.5) * dT));
  const Tp = k["T_pinch_K"];
  //  The engine's classification decides (pinch_exists, from the whole
  //  corrected cascade); the top-of-range geometry is only for a run that
  //  predates that KPI.
  const hasPinch = k["pinch_exists"] != null
    ? k["pinch_exists"] === 1
    : Tp != null && Number.isFinite(Tp) && Tp < Ttop - 1.0e-6;
  const sum = runResult?.csvFiles?.[SUMMARY_CSV_PATH];
  return {
    streams,
    dTmin: k["dTmin_K"] ?? 10,
    QhMin: k["Q_H_min_kW"]!, QcMin: k["Q_C_min_kW"] ?? 0,
    QhNow: k["Q_heat_current_kW"] ?? 0, QcNow: k["Q_cool_current_kW"] ?? 0,
    pinchShift: hasPinch ? Tp! : null,
    pinchHot: hasPinch ? (k["T_pinch_hot_K"] ?? null) : null,
    pinchCold: hasPinch ? (k["T_pinch_cold_K"] ?? null) : null,
    matches: mcsv ? parseMatches(mcsv) : [],
    problemClass: sum ? (parseSummary(sum)?.class ?? null) : null,
  };
}
