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
  equilibriumOrRateBased -- the witnesses, the override maps and the readers
  behind the EduTool `equilibrium-or-rate-based`, "Equilibrium stages or a
  rate-based model?".

  THE STUDENT'S TASK: "I have to design or rate a column: is an
  equilibrium-stage model with one efficiency enough, or do I need a
  rate-based model, and how wrong can the simple one be?"

  TWO DEMONSTRATIONS, BOTH RUN BY THE ENGINE, NOTHING STARTED ON OPENING.

  1. The efficiency you assume decides a trace specification.  The witness is
     `column11_murphree` (benzene/toluene on Wang-Henke with a DECLARED
     Murphree efficiency), run as shipped (a bulk specification, about 8 %
     toluene in the distillate) or with four declared numbers rewritten
     (30 stages, the feed on stage 20, reflux 3, distillate 45 kmol/h: a
     trace specification, ppm of toluene).  The slider's efficiency is the
     case's own `murphreeEfficiency`.  Every stop below was run natively when
     the page was built (docs/design/equilibrium-or-rate-based.md holds the
     table): all converge within the case's own `maxOuterIter 200`.

  2. When one number is a fair summary.  The three binary tray-efficiency
     witnesses at total reflux (AIChE, Chan & Fair, Syeda & Chuang on the
     same FRI 14 % sieve tray at 34 kPa) each run their own `outerDict` sweep
     over the F-factor; the page reads the sweep CSV the engine writes and
     draws it beside the measured points the tree already carries.

  The page subtracts nothing and solves nothing: it reads the toluene mole
  fraction of the distillate stream the engine publishes, divides two of
  them, and picks the smallest stage count on the grid that meets a
  specification the student sets.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { DictOverride } from "./methodRun.js";

// ---- Demonstration 1: the efficiency against a trace specification ---------

/** The witness: the bundled Murphree column. */
export const MURPHREE_WITNESS = "steady/distillation/column11_murphree";
const FD = "system/flowsheetDict";

/** The efficiencies the slider stops at (the case's `murphreeEfficiency`). */
export const EFFICIENCY_STOPS: readonly number[] = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
/** The efficiency the page treats as "the one you assumed" (the case's own). */
export const ASSUMED_EFFICIENCY = 0.7;

export type SpecId = "bulk" | "trace";
export interface ColumnSpec {
  id: SpecId;
  label: string;
  nStages: number;
  feedStage: number;
  refluxRatio: number;
  /** kmol/h, the unit the case declares. */
  distillateRate: number;
  what: string;
}
/** The two columns.  `bulk` writes back exactly what the case declares (the
 *  shipped column); `trace` rewrites four declared numbers. */
export const SPECS: Readonly<Record<SpecId, ColumnSpec>> = {
  bulk: {
    id: "bulk", label: "bulk: the case as shipped",
    nStages: 15, feedStage: 8, refluxRatio: 2, distillateRate: 50,
    what: "15 stages, feed on stage 8, reflux ratio 2, distillate 50 kmol/h: "
      + "a few per cent of toluene in the distillate.",
  },
  trace: {
    id: "trace", label: "trace: 30 stages, reflux 3",
    nStages: 30, feedStage: 20, refluxRatio: 3, distillateRate: 45,
    what: "30 stages, feed on stage 20, reflux ratio 3, distillate 45 of the "
      + "50 kmol/h of benzene fed: parts per million of toluene in the distillate.",
  },
};

/** The stripping section the trace column keeps whatever its height: the
 *  feed sits this many stages above the bottom (reboiler included). */
export const TRACE_STRIPPING_STAGES = 10;
/** The stage counts the "how many trays" sweep runs (the case's `nStages`,
 *  which counts the reboiler). */
export const TRAY_STOPS: readonly number[] = Array.from({ length: 33 }, (_, k) => 16 + 2 * k);

/** The declared numbers one run rewrites.  `nStages` overrides the spec's own
 *  height (the tray sweep); the trace column's feed then follows it. */
export function murphreeOverrides(spec: SpecId, efficiency: number, nStages?: number): DictOverride[] {
  const s = SPECS[spec];
  const n = nStages ?? s.nStages;
  const feed = nStages === undefined ? s.feedStage : n - TRACE_STRIPPING_STAGES;
  return [
    { file: FD, key: "nStages", value: n },
    { file: FD, key: "feedStage", value: feed },
    { file: FD, key: "refluxRatio", value: s.refluxRatio },
    { file: FD, key: "distillateRate", value: s.distillateRate, unit: "kmol/h" },
    { file: FD, key: "murphreeEfficiency", value: efficiency },
  ];
}

/** The toluene mole fraction of the distillate, as the engine publishes the
 *  stream; null when the run carries no such stream. */
export function distillateToluene(r: RunResult | null | undefined): number | null {
  const s = r?.streams.find((x) => x.name === "distillate");
  const v = s?.composition?.["toluene"];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The smallest stage count on the grid whose distillate meets `spec`, or
 *  null when none does (or none has run). */
export function smallestMeeting(
  stops: readonly number[], values: readonly (number | null)[], spec: number,
): number | null {
  for (let i = 0; i < stops.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && v <= spec) return stops[i]!;
  }
  return null;
}

// ---- Demonstration 2: one tray, three correlations, and the measurement ----

export interface EfficiencyWitness {
  witness: string;
  model: string;
  /** Whether the correlation's own data bank holds these very trays
   *  (docs/design/c329-ratebased-first-delivery.md sections 6 and 9). */
  inSample: boolean;
  color: string;
}
export const EFFICIENCY_WITNESSES: readonly EfficiencyWitness[] = [
  { witness: "steady/distillation/trayEfficiency01_yanagi14", model: "AIChE", inSample: false, color: "#2a78d6" },
  { witness: "steady/distillation/trayEfficiency05_chanFair_yanagi14", model: "Chan & Fair", inSample: true, color: "#d4572a" },
  { witness: "steady/distillation/trayEfficiency06_syedaChuang_yanagi14", model: "Syeda & Chuang", inSample: true, color: "#1baf7a" },
];
/** The file each witness's `outerDict` writes (its `report { file ...; }`). */
export const SWEEP_CSV = "sweep_fFactor.csv";

export interface EfficiencySweep {
  fs: number[];
  overall: number[];
  murphreeMean: number[];
  flood: number[];
}
/** Read the sweep CSV by its column NAMES (never by position); null when a
 *  column the page draws is absent. */
export function parseEfficiencySweep(csv: string | undefined): EfficiencySweep | null {
  if (!csv) return null;
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0]!.split(",").map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const iF = col("units[0].operation.totalReflux.fFactor");
  const iE = col("column.overallTrayEfficiency");
  const iM = col("column.E_MV_mean");
  const iL = col("column.floodApproach_max");
  if (iF < 0 || iE < 0 || iM < 0 || iL < 0) return null;
  const out: EfficiencySweep = { fs: [], overall: [], murphreeMean: [], flood: [] };
  for (const l of lines.slice(1)) {
    const c = l.split(",").map(Number);
    if (![iF, iE, iM, iL].every((i) => Number.isFinite(c[i]))) continue;
    out.fs.push(c[iF]!); out.overall.push(c[iE]!); out.murphreeMean.push(c[iM]!); out.flood.push(c[iL]!);
  }
  return out.fs.length ? out : null;
}

/** The value of a sweep at one F-factor of its grid (no interpolation). */
export function atFs(s: EfficiencySweep, fs: number): { overall: number; murphreeMean: number; flood: number } | null {
  const i = s.fs.findIndex((f) => Math.abs(f - fs) < 1e-9);
  return i < 0 ? null : { overall: s.overall[i]!, murphreeMean: s.murphreeMean[i]!, flood: s.flood[i]! };
}

/** The measured overall tray efficiency of the 14 % sieve tray at 34 kPa,
 *  cyclohexane / n-heptane, total reflux: Yanagi & Sakata, Ind. Eng. Chem.
 *  Process Des. Dev. 21 (1982) 712.  NOT re-read for this page: transcribed
 *  from docs/design/c329-ratebased-first-delivery.md section 5, whose author
 *  read the paper (two runs tabulated in its Table III, five points read off
 *  its Fig. 12). */
export interface MeasuredPoint { fs: number; overall: number; source: string }
export const YANAGI_14_34KPA: readonly MeasuredPoint[] = [
  { fs: 1.007, overall: 0.633, source: "Fig. 12, digitised" },
  { fs: 1.440, overall: 0.711, source: "Fig. 12, digitised" },
  { fs: 1.472, overall: 0.708, source: "Table III, run 628" },
  { fs: 1.825, overall: 0.743, source: "Fig. 12, digitised" },
  { fs: 2.030, overall: 0.675, source: "Fig. 12, digitised" },
  { fs: 2.305, overall: 0.413, source: "Fig. 12, digitised" },
  { fs: 2.356, overall: 0.411, source: "Table III, run 625 (flooding)" },
];
/** The F-factor of the page's comparison row: a point of every sweep's grid,
 *  next to the tabulated run 628 (1.472). */
export const COMPARE_FS = 1.5;
