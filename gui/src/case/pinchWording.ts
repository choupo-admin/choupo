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
  Choupo GUI -- what the Pinch page SAYS about the engine's numbers (C304)

  An external reader of the green-ammonia reference plant's Pinch tab found
  four sentences that were wrong for the problem in front of him, although
  every number under them was the engine's and right:

    A  a partial population (a duty left out) was said in a chip among the
       others, not at the top of the page;
    B  the maximum recovery stood alone, so a reader could not tell the
       recovery the plant ALREADY has (an exchanger in the population) from
       what is still to win;
    C  "no pinch" read as "there is nothing to learn here"; what the cascade
       says is "no INTERIOR pinch: a threshold problem, at this dTmin, for
       this population";
    D  the excess over target was split into "heating below the pinch" in a
       threshold problem, where PinchPass measures "below" from the TOP of
       the range (PinchPass.cpp: Tpinch is left at T.front() when Q_H,min = 0)
       -- the number is the hot utility bought above a target of zero, and
       the wording now says that.

  Pure functions over the engine's KPI row, summary.csv's class word and
  population.csv's rows: nothing is computed here that the engine did not
  publish, except two sums and a difference a reader can redo on paper.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import type { PinchUnits } from "./pinchUnits.js";

type Kpis = { [key: string]: number } | undefined;

/** One heat duty the engine left OUT of the population (role `excluded`). */
export interface ExcludedDuty { unit: string; kpi: string; Q_kW: number; reason: string; }

/** population.csv's `excluded` rows, verbatim (parseStreamTable drops them). */
export function parseExcludedDuties(csv: string | undefined): ExcludedDuty[] {
  if (!csv) return [];
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2 || !lines[0]!.startsWith("unit,kpi,role,side,T_in_K,T_out_K,Q_kW")) return [];
  const out: ExcludedDuty[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < 8 || f[2] !== "excluded") continue;
    const Q = Number(f[6]);
    if (!Number.isFinite(Q)) continue;
    out.push({ unit: f[0]!, kpi: f[1]!, Q_kW: Q, reason: f.slice(8).join(",") });
  }
  return out;
}

/** The class word: summary.csv's when present, else the KPI code twin
 *  (PinchPass.cpp: 1 interiorPinch, 2 severalPinches, 3 thresholdNoHotUtility,
 *  4 thresholdNoColdUtility, 5 thresholdNoUtility). */
export function pinchClassOf(kpis: Kpis, summaryClass?: string | null): string | null {
  if (summaryClass) return summaryClass;
  const c = kpis?.["problem_class"];
  return ({ 1: "interiorPinch", 2: "severalPinches", 3: "thresholdNoHotUtility",
            4: "thresholdNoColdUtility", 5: "thresholdNoUtility" } as
          { [k: number]: string })[c ?? 0] ?? null;
}

export function isThresholdClass(cls: string | null): boolean {
  return cls != null && cls.startsWith("threshold");
}

/** C: the words for "no pinch", with the two things the answer depends on. */
export function noInteriorPinchText(dTminK: number | undefined, u: PinchUnits): string {
  const at = dTminK != null && Number.isFinite(dTminK)
    ? ` at ΔTmin = ${u.dTraw(dTminK)} ${u.tLabel}` : "";
  return `no interior pinch — threshold problem${at} for this stream population`;
}

/** A: the FIRST line of the page when the population is partial, or null.
 *  Names the kW left out and the units they belong to. */
export function partialAnalysisHeadline(
  kpis: Kpis, excluded: ExcludedDuty[], u: PinchUnits,
): string | null {
  const ex = kpis?.["duties_excluded"];
  const q = kpis?.["Q_excluded_kW"];
  if (typeof ex !== "number" || ex <= 0) return null;
  const units = [...new Set(excluded.map((d) => d.unit))];
  const qkW = typeof q === "number" ? q
    : excluded.reduce((s, d) => s + Math.abs(d.Q_kW), 0);
  return `Partial analysis: ${u.Q(qkW, 1)} ${u.qLabel} of duty not in the population`
    + (units.length ? ` (${units.join(", ")})` : ` (${ex} heat dut${ex === 1 ? "y" : "ies"})`)
    + " — the targets below are those of the extracted segments, not of the plant.";
}

/** B: recovery already installed = the duty of every process-to-process
 *  exchanger in the population (each appears as two `recovered` rows, one per
 *  side; the hot side is counted once). */
export function installedRecoveryKW(
  rows: { role: string; side: string; Q_kW: number }[],
): number {
  return rows.filter((r) => r.role === "recovered" && r.side === "hot")
    .reduce((s, r) => s + Math.abs(r.Q_kW), 0);
}

/** B: (i) installed, (ii) maximum (target), (iii) = (ii) - (i), one line. */
export function recoveryLine(
  kpis: Kpis, rows: { role: string; side: string; Q_kW: number }[], u: PinchUnits,
): string | null {
  const max = kpis?.["Q_recovery_max_kW"];
  if (typeof max !== "number") return null;
  const inst = installedRecoveryKW(rows);
  const add = max - inst;
  //  one identity on one line: one absolute precision (pinchUnits.group)
  const g = u.group([inst, max, add]);
  const tail = add >= -1e-6
    ? `additional possible ${g(add)} ${u.qLabel}`
    : `installed exceeds this ΔTmin's maximum by ${g(-add)} ${u.qLabel}`
      + " (an existing exchanger runs closer than ΔTmin)";
  return `heat recovery · installed ${g(inst)} ${u.qLabel}`
    + ` (process-to-process exchangers in the population)`
    + ` · maximum ${g(max)} ${u.qLabel} (target)`
    + ` · ${tail}`;
}

/** D: the excess of today's utilities over the targets, worded for the class.
 *  The engine's two "violation" KPIs are measured from the pinch; in a
 *  threshold problem that temperature is an END of the range (PinchPass.cpp),
 *  so they are the utility bought above a target of zero, never "below/above
 *  the pinch". */
export function excessLine(kpis: Kpis, cls: string | null, u: PinchUnits): string | null {
  const k = kpis;
  if (!k) return null;
  const Qh = k["Q_heat_current_kW"], Qc = k["Q_cool_current_kW"];
  const QH = k["Q_H_min_kW"], QC = k["Q_C_min_kW"];
  const hb = k["violation_heat_below_pinch_kW"], ca = k["violation_cool_above_pinch_kW"];
  if (Qh == null || QH == null || hb == null || ca == null) return null;
  //  Every number of the line belongs to one identity, so they share ONE
  //  absolute precision (pinchUnits.group): 81.6 − 0.0 = 81.6, and
  //  488 − 108 = 380 = 260 + 120.
  const all = [Qh, QH, Qh - QH, hb, ca];
  const showsCool = cls === "thresholdNoColdUtility" || cls === "thresholdNoUtility";
  if (showsCool && Qc != null && QC != null) all.push(Qc, QC, Qc - QC);   // only what the line shows
  const g = u.group(all);
  const q = (x: number) => `${g(x)} ${u.qLabel}`;
  const heatEx = `${g(Qh)} − ${g(QH)} = ${q(Qh - QH)}`;
  const coolEx = Qc != null && QC != null
    ? `${g(Qc)} − ${g(QC)} = ${q(Qc - QC)}` : null;
  switch (cls) {
    case "thresholdNoHotUtility":
      return `hot utility bought above the target · ${heatEx}`
        + " (target 0 in a threshold problem: no interior pinch, so none of it is"
        + " \"below the pinch\")";
    case "thresholdNoColdUtility":
      return `cold utility bought above the target · ${coolEx ?? q(ca)}`
        + ` · hot utility above its target · ${heatEx}`
        + " (cold-utility target 0 in a threshold problem: no interior pinch,"
        + " so none of it is \"above the pinch\")";
    case "thresholdNoUtility":
      return `utility bought above the targets · heating ${heatEx}`
        + (coolEx ? ` · cooling ${coolEx}` : "")
        + " (both targets 0 in a threshold problem: no interior pinch)";
    default:
      //  interior pinch(es), or a run that predates the class word
      return `excess over target · ${heatEx}`
        + `  =  ${q(hb)} heating below the pinch + ${q(ca)} cooling above the pinch`
        + " (+ any process heat transferred across it)";
  }
}
