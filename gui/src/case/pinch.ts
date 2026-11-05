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
    kpis.pinch                           Q_H_min_kW, Q_C_min_kW, T_pinch_K,
                                         Q_heat_current_kW, Q_cool_current_kW

  A run with no `pinchPass` yields NO pinch (`pinchFromEngine` returns null)
  and the tab says what to declare; nothing is computed in its place.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";

export const POPULATION_CSV_PATH = "reports/pinch/population.csv";
export const MATCHES_CSV_PATH = "reports/pinch/candidateMatches.csv";

/** The exact postDict excerpt that makes the engine write the pinch. */
export const PINCH_PASS_EXCERPT = "pinchPass { dTmin 20 K; }";

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
  const hasPinch = Tp != null && Number.isFinite(Tp) && Tp < Ttop - 1.0e-6;
  return {
    streams,
    dTmin: k["dTmin_K"] ?? 10,
    QhMin: k["Q_H_min_kW"]!, QcMin: k["Q_C_min_kW"] ?? 0,
    QhNow: k["Q_heat_current_kW"] ?? 0, QcNow: k["Q_cool_current_kW"] ?? 0,
    pinchShift: hasPinch ? Tp! : null,
    pinchHot: hasPinch ? (k["T_pinch_hot_K"] ?? null) : null,
    pinchCold: hasPinch ? (k["T_pinch_cold_K"] ?? null) : null,
    matches: mcsv ? parseMatches(mcsv) : [],
  };
}
