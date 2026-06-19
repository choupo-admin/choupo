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
  Sweep synthesizer -- the what-if playground's "sensitivity sweep" affordance
  (focus tabs only; see docs/ai/gui-credo.md §"The what-if playground lives in
  the DRILL-IN").

  Given ONE operation scalar of the focused unit and a range, synthesise the
  exact `outerDict { type sweep; ... }` a student would author by hand
  (reference grammar: tutorials/steady/flash/flash06_sweep_T/system/outerDict).
  The dict is injected into the run's CaseFiles for THAT run only (one-shot):
  it never lands in the store's caseFiles, so the toolbar Run stays a plain
  single-point solve.

  The engine contract (src/outerDriver/SweepDriver.cpp -- read-only):
    - `parameter { target <path>; range (a b); nPoints n>=2; }` are mandatory;
    - `responses ( ... )` is MANDATORY (an empty `( );` IS accepted);
    - each response is `<unitName>.<kpi>` (result.kpis) or
      `<streamName>.{F|T|P|vf}` -- split at the FIRST dot, so names that
      themselves contain dots cannot be addressed;
    - the CSV always leads with `point,<targetPath>` then one column per
      response, written to report.file (default sweep_results.csv).
\*---------------------------------------------------------------------------*/

import { fromJson, serialize } from "../dict/index.js";
import type { JsonDict, JsonValue } from "../dict/index.js";

export interface SweepSpec {
  /** Operation-block scalar key on units[0] of the (1-unit) focus case. */
  key: string;
  /** Range in canonical SI (the dict carries raw SI, like unitFocus emits). */
  from: number;
  to: number;
  nPoints: number;
  /** Response keys in SweepDriver grammar (`unit.kpi` / `stream.field`). */
  responses: string[];
}

/** Numeric scalar keys of an operation block -- the sweepable knobs. */
export function numericOperationKeys(operation: JsonDict | undefined): string[] {
  if (!operation) return [];
  return Object.entries(operation)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([k]) => k);
}

/**
 * Synthesise the responses list.
 *
 * Preferred: the unit's numeric KPIs known to the GUI (carried into the
 * focus stash from the parent run, or from this tab's own last run),
 * prefixed `<unitName>.<kpi>`.  The raw-watts `Q` is dropped when its
 * friendlier `Q_kW` twin is present (same number, same convention as the
 * selection card).
 *
 * Fallback (no KPIs known): the outlet streams' `F` and `T` -- always
 * resolvable stream fields per SweepDriver.  Names containing dots are
 * skipped (SweepDriver splits responses at the FIRST dot, so it cannot
 * address them); an empty list is still legal (`responses ( );`) -- the
 * CSV then carries just point + the swept parameter.
 */
export function sweepResponses(
  unitName: string,
  kpis: { [k: string]: number } | null | undefined,
  outputs: string[],
): string[] {
  if (kpis && !unitName.includes(".")) {
    const keys = Object.entries(kpis)
      .filter(([k, v]) =>
        typeof v === "number" && Number.isFinite(v)
        && !(k === "Q" && typeof kpis["Q_kW"] === "number")
        && !k.includes("."))
      .map(([k]) => `${unitName}.${k}`)
      .sort();
    if (keys.length > 0) return keys;
  }
  const out: string[] = [];
  for (const s of outputs) {
    if (s.includes(".")) continue;
    out.push(`${s}.F`, `${s}.T`);
  }
  return out;
}

/** CSV file name the sweep writes (and the Plots "Sweep / scan" view reads). */
export function sweepCsvName(key: string): string {
  return `sweep_${key}.csv`;
}

/** The synthesised outerDict as plain JSON (the shape CaseFiles carries). */
export function synthesizeSweepOuterDict(spec: SweepSpec): JsonDict {
  return {
    type: "sweep",
    parameter: {
      target: `units[0].operation.${spec.key}`,
      range: [spec.from, spec.to],
      nPoints: spec.nPoints,
    },
    responses: spec.responses,
    report: {
      format: "csv",
      file: sweepCsvName(spec.key),
    },
  };
}

/** The exact dict TEXT (the "copy outerDict" payload) -- via the same
 *  serializer the WASM adapter uses, so what the student copies is
 *  byte-identical to what the engine ran. */
export function sweepOuterDictText(spec: SweepSpec): string {
  return serialize(fromJson(synthesizeSweepOuterDict(spec), "outerDict"));
}

// ---------------------------------------------------------------------------
//  Operation overrides (the editable-scalars half of the playground)
// ---------------------------------------------------------------------------

export interface OperationOverride {
  key: string;
  /** Pristine (focus-synthesis) value. */
  from: JsonValue;
  /** Current edited value. */
  to: JsonValue;
}

/** Diff a unit's current operation block against its pristine one --
 *  scalar (number / string) keys only, matching the edit surface. */
export function operationOverrides(
  current: JsonDict | undefined,
  pristine: JsonDict | undefined,
): OperationOverride[] {
  const cur = current ?? {};
  const pri = pristine ?? {};
  const out: OperationOverride[] = [];
  for (const [k, v] of Object.entries(cur)) {
    const p = pri[k];
    const scalar = (x: unknown) => typeof x === "number" || typeof x === "string";
    if (!scalar(v) || (p !== undefined && !scalar(p))) continue;
    if (p !== v) out.push({ key: k, from: p ?? null, to: v });
  }
  return out;
}

/** The "copy override" payload: the edited scalars as the `operation {}`
 *  lines a student would write in flowsheetDict.  Same serializer. */
export function overrideDictText(overrides: OperationOverride[]): string {
  const op: JsonDict = {};
  for (const o of overrides) {
    if (typeof o.to === "number" || typeof o.to === "string") op[o.key] = o.to;
  }
  return serialize(fromJson({ operation: op }, "override"));
}
