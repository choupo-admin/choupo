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
  C304: four points an external reader raised on the green-ammonia reference
  plant's Pinch tab, held on two witnesses whose engine output is copied
  VERBATIM below (native choupoSolve, 2026-11-11):

    pinch01_four_stream_classic   interior pinch, complete population
    greenAmmoniaPEQ_baseCase      threshold (no hot utility), one duty
                                  excluded (Converter Q_kW), the FEHE as
                                  recovered heat

    A  a partial population is the FIRST line of the tab, with kW and unit;
    B  installed recovery / maximum / additional, in one line;
    C  "no pinch" reads "no interior pinch -- threshold problem at dTmin";
    D  the excess over target is never "below the pinch" without a pinch;
    E  every printed number follows the Units menu's significant figures;
    F  every table sorts by a click on its header (SortableTable.tsx).

  Hand check (PEQ): heating bought = Separator 72.6909 + LetdownHP 8.8593 =
  81.5502 kW against a target of 0; installed = FEHE 61412.416 kW; maximum
  = cold total 61493.966 kW (Q_H,min = 0); additional = 81.550 kW, the same
  81.55 by the first law.  pinch01: 487.5 - 107.5 = 380 = 260 + 120.
\*---------------------------------------------------------------------------*/

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider, Table } from "@mantine/core";

import {
  excessLine, installedRecoveryKW, noInteriorPinchText, parseExcludedDuties,
  partialAnalysisHeadline, pinchClassOf, recoveryLine,
} from "../src/case/pinchWording.js";
import { pinchUnits, pinchStatusLine } from "../src/case/pinchUnits.js";
import { parseStreamTable, parseSummary, pinchFromEngine, PINCH_CLASS_TEXT } from "../src/case/pinch.js";
import { DEFAULT_PREFS, setDisplaySigFigs } from "../src/state/displayUnits.js";
import { PinchView } from "../src/ui/PinchView.js";
import { nextSort, sortRows, SortTh, useSortable } from "../src/ui/SortableTable.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("../src/state/store.js", () => {
  const useStore = Object.assign(
    (sel: (s: unknown) => unknown) => sel(mock.state),
    { getState: () => mock.state, setState: () => undefined, subscribe: () => () => undefined });
  return { useStore };
});

// ---- verbatim engine output ------------------------------------------------
const PEQ_POPULATION = "unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason\nN2Cooler,Q,segment,hot,473.7691617,313.15,-1975.493321,12.29923815,\nIntercooler,Q,segment,hot,420.2121316,313.15,-5180.088054,48.38394282,\nAftercooler,Q,segment,hot,424.5701434,313.15,-5482.936649,49.20956376,\nFEHE [hot side],Q,recovered,hot,733.15,337.0271809,-61412.41602,155.033775,\nFEHE [cold side],Q,recovered,cold,276.128418,650.4993776,61412.41602,164.0416129,\nConverter,Q_kW,excluded,,,,-30314.7967,,a boundary heat duty published as `Q_kW`; this pass reads only the generic `Q` of a unit with a process inlet and outlet\nWaterCooler,Q,segment,hot,337.0271809,313.15,-7066.967922,295.9716203,\nChiller,Q,segment,hot,313.15,253.15,-20637.21928,343.9536547,\nSeparator,Q,segment,cold,253.15,253.15,72.690928,72.690928,near-isothermal: a latent slice of latentWidth\nLetdownHP,Q,segment,cold,253.15,253.15,8.859299069,8.859299069,near-isothermal: a latent slice of latentWidth\nStorageFlash,Q,segment,hot,253.15,238.15,-789.603664,52.64024427,\n";
const PEQ_SUMMARY = "key,value\nclass,thresholdNoHotUtility\nn_pinches,0\npinch_T_star_K,\nH_pinch_kW,\ncold_curve_offset_kW,41050.75866\n";
const PEQ_PROBLEMTABLE = "interval,T_star_hi_K,T_star_lo_K,sumCP_hot_kW_K,sumCP_cold_kW_K,dH_kW,cascade_in_kW,cascade_out_kW,corrected_in_kW,corrected_out_kW,boundary_out,hot_streams,cold_streams\n1,728.15,655.4993776,155.033775,0,11263.30025,0,11263.30025,0,11263.30025,,FEHE [hot side],\n2,655.4993776,468.7691617,155.033775,164.0416129,-1682.035503,11263.30025,9581.264745,11263.30025,9581.264745,,FEHE [hot side],FEHE [cold side]\n3,468.7691617,419.5701434,167.3330132,164.0416129,161.9336647,9581.264745,9743.19841,9581.264745,9743.19841,,N2Cooler;FEHE [hot side],FEHE [cold side]\n4,419.5701434,415.2121316,216.5425769,164.0416129,228.7998204,9743.19841,9971.99823,9743.19841,9971.99823,,N2Cooler;Aftercooler;FEHE [hot side],FEHE [cold side]\n5,415.2121316,332.0271809,264.9265198,164.0416129,8392.106005,9971.99823,18364.10424,9971.99823,18364.10424,,N2Cooler;Intercooler;Aftercooler;FEHE [hot side],FEHE [cold side]\n6,332.0271809,308.15,405.8643651,164.0416129,5774.045602,18364.10424,24138.14984,18364.10424,24138.14984,,N2Cooler;Intercooler;Aftercooler;WaterCooler,FEHE [cold side]\n7,308.15,281.128418,343.9536547,164.0416129,4861.507988,24138.14984,28999.65783,24138.14984,28999.65783,,Chiller,FEHE [cold side]\n8,281.128418,258.65,343.9536547,0,7731.534027,28999.65783,36731.19185,28999.65783,36731.19185,,Chiller,\n9,258.65,257.65,343.9536547,81.55022706,262.4034276,36731.19185,36993.59528,36731.19185,36993.59528,,Chiller,Separator;LetdownHP\n10,257.65,248.15,343.9536547,0,3267.55972,36993.59528,40261.155,36993.59528,40261.155,,Chiller,\n11,248.15,233.15,52.64024427,0,789.603664,40261.155,41050.75866,40261.155,41050.75866,bottom,StorageFlash,\n";
const PEQ_COMPOSITECURVES = "curve,T_K,H_kW\nhot,238.15,0\nhot,253.15,789.603664\nhot,313.15,21426.82295\nhot,337.0271809,31117.71981\nhot,420.2121316,53155.6193\nhot,424.5701434,54099.3144\nhot,473.7691617,62331.93438\nhot,733.15,102544.7249\ncold,252.65,0\ncold,253.65,81.55022706\ncold,276.128418,81.55022706\ncold,650.4993776,61493.96625\nhotShifted,233.15,0\nhotShifted,248.15,789.603664\nhotShifted,308.15,21426.82295\nhotShifted,332.0271809,31117.71981\nhotShifted,415.2121316,53155.6193\nhotShifted,419.5701434,54099.3144\nhotShifted,468.7691617,62331.93438\nhotShifted,728.15,102544.7249\ncoldShifted,257.65,0\ncoldShifted,258.65,81.55022706\ncoldShifted,281.128418,81.55022706\ncoldShifted,655.4993776,61493.96625\n";
const PEQ_KPIS: { [k: string]: number } = { "Q_C_min_kW": 41050.7586645, "Q_H_min_kW": 0, "Q_cold_total_kW": 61493.9662503, "Q_cool_current_kW": 41132.3088916, "Q_excluded_kW": 30314.7966959, "Q_heat_current_kW": 81.5502270649, "Q_hot_total_kW": 102544.724915, "Q_recovery_max_kW": 61493.9662503, "T_pinch_K": 728.15, "T_pinch_cold_K": 723.15, "T_pinch_hot_K": 733.15, "candidates_admissible": 18, "candidates_total": 21, "dTmin_K": 10, "duties_excluded": 1, "n_pinches": 0, "pinch_exists": 0, "problem_class": 3, "segments": 10, "utility_sides": 0, "violation_cool_above_pinch_kW": 0, "violation_heat_below_pinch_kW": 81.5502270649 };
const P01_POPULATION = "unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason\ncoolerH1,Q,segment,hot,423.15,333.15,-180,2,\ncoolerH2,Q,segment,hot,363.15,333.15,-240,8,\nheaterC1,Q,segment,cold,293.15,398.15,262.5,2.5,\nheaterC2,Q,segment,cold,298.15,373.15,225,3,\n";
const P01_SUMMARY = "key,value\nclass,interiorPinch\nn_pinches,1\npinch_T_star_K,353.15\nH_pinch_kW,300\ncold_curve_offset_kW,40\n";
const P01_PROBLEMTABLE = "interval,T_star_hi_K,T_star_lo_K,sumCP_hot_kW_K,sumCP_cold_kW_K,dH_kW,cascade_in_kW,cascade_out_kW,corrected_in_kW,corrected_out_kW,boundary_out,hot_streams,cold_streams\n1,413.15,408.15,2,0,10,0,10,107.5,117.5,,coolerH1,\n2,408.15,383.15,2,2.5,-12.5,10,-2.5,117.5,105,,coolerH1,heaterC1\n3,383.15,353.15,2,5.5,-105,-2.5,-107.5,105,0,pinch,coolerH1,heaterC1;heaterC2\n4,353.15,323.15,10,5.5,135,-107.5,27.5,0,135,,coolerH1;coolerH2,heaterC1;heaterC2\n5,323.15,308.15,0,5.5,-82.5,27.5,-55,135,52.5,,,heaterC1;heaterC2\n6,308.15,303.15,0,2.5,-12.5,-55,-67.5,52.5,40,bottom,,heaterC1\n";
const P01_COMPOSITECURVES = "curve,T_K,H_kW\nhot,333.15,0\nhot,363.15,300\nhot,423.15,420\ncold,293.15,0\ncold,298.15,12.5\ncold,373.15,425\ncold,398.15,487.5\nhotShifted,323.15,0\nhotShifted,353.15,300\nhotShifted,413.15,420\ncoldShifted,303.15,0\ncoldShifted,308.15,12.5\ncoldShifted,383.15,425\ncoldShifted,408.15,487.5\n";
const P01_KPIS: { [k: string]: number } = { "Q_C_min_kW": 40, "Q_H_min_kW": 107.5, "Q_cold_total_kW": 487.5, "Q_cool_current_kW": 420, "Q_excluded_kW": 0, "Q_heat_current_kW": 487.5, "Q_hot_total_kW": 420, "Q_recovery_max_kW": 380, "T_pinch_K": 353.15, "T_pinch_cold_K": 343.15, "T_pinch_hot_K": 363.15, "candidates_admissible": 6, "candidates_total": 6, "dTmin_K": 20, "duties_excluded": 0, "n_pinches": 1, "pinch_exists": 1, "problem_class": 1, "segments": 4, "utility_sides": 0, "violation_cool_above_pinch_kW": 120, "violation_heat_below_pinch_kW": 260 };

const u = pinchUnits(DEFAULT_PREFS);
const runOf = (kpis: object, d: { pop: string; sum: string; table: string; curves: string }) => ({
  status: "done", log: "", streams: [], kpis: { pinch: kpis },
  csvFiles: {
    "reports/pinch/population.csv": d.pop,
    "reports/pinch/summary.csv": d.sum,
    "reports/pinch/problemTable.csv": d.table,
    "reports/pinch/compositeCurves.csv": d.curves,
  },
}) as never;
const PEQ = runOf(PEQ_KPIS, { pop: PEQ_POPULATION, sum: PEQ_SUMMARY,
  table: PEQ_PROBLEMTABLE, curves: PEQ_COMPOSITECURVES });
const P01 = runOf(P01_KPIS, { pop: P01_POPULATION, sum: P01_SUMMARY,
  table: P01_PROBLEMTABLE, curves: P01_COMPOSITECURVES });
const page = (run: unknown) => {
  mock.state = { runResult: run, displayPrefs: { ...DEFAULT_PREFS }, setDisplayPrefs: () => undefined };
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(PinchView)));
};
const text = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"")
  .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("C304 A -- a partial population is said first", () => {
  it("PEQ: the excluded Converter duty is parsed from population.csv", () => {
    const ex = parseExcludedDuties(PEQ_POPULATION);
    expect(ex).toHaveLength(1);
    expect(ex[0]!.unit).toBe("Converter");
    expect(ex[0]!.kpi).toBe("Q_kW");
    expect(ex[0]!.Q_kW).toBeCloseTo(-30314.7967, 4);
  });
  it("PEQ: the headline names the kW and the unit", () => {
    expect(partialAnalysisHeadline(PEQ_KPIS, parseExcludedDuties(PEQ_POPULATION), u))
      .toBe("Partial analysis: 30300 kW of duty not in the population (Converter)"
        + " — the targets below are those of the extracted segments, not of the plant.");
  });
  it("pinch01: a complete population has no headline", () => {
    expect(partialAnalysisHeadline(P01_KPIS, parseExcludedDuties(P01_POPULATION), u)).toBeNull();
  });
  it("PEQ: the Pinch tab's first text is the headline", () => {
    const t = text(page(PEQ)).trim();
    expect(t.startsWith("Partial analysis: 30300 kW of duty not in the population (Converter)")).toBe(true);
  });
  it("pinch01: the tab carries no partial-analysis banner", () => {
    expect(page(P01)).not.toContain("Partial analysis");
  });
});

describe("C304 B -- installed, maximum and additional recovery in one line", () => {
  it("PEQ: installed = the FEHE, counted once", () => {
    expect(installedRecoveryKW(parseStreamTable(PEQ_POPULATION))).toBeCloseTo(61412.416, 3);
  });
  it("PEQ: 61412.4 installed, 61494.0 maximum, 81.6 additional (one precision, set by 81.6)", () => {
    expect(recoveryLine(PEQ_KPIS, parseStreamTable(PEQ_POPULATION), u)).toBe(
      "heat recovery · installed 61412.4 kW (process-to-process exchangers in the population)"
      + " · maximum 61494.0 kW (target) · additional possible 81.6 kW");
    // first law: the additional recovery is the hot utility above its target
    expect(PEQ_KPIS["Q_recovery_max_kW"]! - 61412.41602)
      .toBeCloseTo(PEQ_KPIS["Q_heat_current_kW"]! - PEQ_KPIS["Q_H_min_kW"]!, 3);
  });
  it("pinch01: nothing installed, all 380 kW still to win", () => {
    expect(recoveryLine(P01_KPIS, parseStreamTable(P01_POPULATION), u)).toContain(
      "installed 0 kW (process-to-process exchangers in the population) · maximum 380 kW (target) · additional possible 380 kW");
  });
  it("an installed recovery past the target says why, never a negative saving", () => {
    const l = recoveryLine({ Q_recovery_max_kW: 100 },
      [{ role: "recovered", side: "hot", Q_kW: -120 }, { role: "recovered", side: "cold", Q_kW: 120 }], u)!;
    expect(l).toContain("installed exceeds this ΔTmin's maximum by 20.0 kW");
    expect(l).not.toContain("additional possible -");
  });
  it("both pages show the line", () => {
    expect(text(page(PEQ))).toContain("additional possible 81.6 kW");
    expect(text(page(P01))).toContain("additional possible 380 kW");
  });
});

describe("C304 C -- no interior pinch, at this dTmin, for this population", () => {
  it("the words", () => {
    expect(noInteriorPinchText(10, u))
      .toBe("no interior pinch — threshold problem at ΔTmin = 10 K for this stream population");
  });
  it("PEQ: the targets chip and the status line say it; no bare 'no pinch' anywhere", () => {
    const t = text(page(PEQ));
    //  the targets are tiles now: Q_C,min and the pinch temperature are two of them
    expect(t).toContain("Cold utility, Q_C,min 41100 kW");
    expect(t).toContain("Pinch temperature, T* no interior pinch");
    expect(pinchStatusLine(pinchFromEngine(PEQ)!, u))
      .toContain("no interior pinch — threshold problem at ΔTmin = 10 K for this stream population.");
    expect(t).not.toMatch(/\bno pinch\b(?! analysis| targets| KPI)/i);
  });
  it("every threshold class sentence says 'no interior pinch'", () => {
    for (const w of ["thresholdNoHotUtility", "thresholdNoColdUtility", "thresholdNoUtility"])
      expect(PINCH_CLASS_TEXT[w], w).toContain("no interior pinch");
  });
  it("pinch01: the interior pinch is still named with its T*", () => {
    const t = text(page(P01));
    expect(t).toContain("pinch T* 353 K");
    expect(t).not.toContain("no interior pinch");
  });
});

describe("rehearsal 2026-11-13 -- the Pinch tab opens on the targets and the curves", () => {
  it("the four targets are the first content, before the curves and the prose", () => {
    const h = page(P01);
    const iTiles = h.indexOf("data-pinch-targets");
    const iCurves = h.indexOf("hot composite (sources)");
    const iProse = h.indexOf("Watch the curves the engine published");
    expect(iTiles).toBeGreaterThan(-1);
    expect(iCurves).toBeGreaterThan(iTiles);
    //  the prose is in the DOM only inside a CLOSED disclosure (aria-hidden)
    expect(iProse).toBeGreaterThan(-1);
    expect(h.slice(Math.max(0, iProse - 400), iProse)).toContain("aria-hidden=\"true\"");
    const t = text(h);
    expect(t).toContain("Hot utility, Q_H,min 108 kW");
    expect(t).toContain("Cold utility, Q_C,min 40 kW");
    expect(t).toContain("Pinch temperature, T* 353 K");
    expect(t).toContain("Minimum approach, ΔTmin 20 K");
  });
  it("the explanation is behind a 'How to read this' disclosure, closed", () => {
    const h = page(P01);
    expect(h).toContain("data-how-to-read");
    expect(text(h)).toContain("How to read this");
  });
  it("no internal class name reaches the screen; the engine's words do", () => {
    for (const run of [P01, PEQ]) {
      const t = text(page(run));
      for (const w of ["interiorPinch", "severalPinches", "thresholdNoHotUtility",
                       "thresholdNoColdUtility", "thresholdNoUtility"])
        expect(t).not.toContain(w);
    }
    expect(text(page(P01))).toContain("Interior pinch: the cascade touches zero at one interior temperature");
    expect(text(page(PEQ))).toContain("Threshold problem, no hot utility needed");
  });
  it("a chip never truncates: every chip wraps instead of cutting with an ellipsis", () => {
    const h = page(P01);
    expect(h).not.toContain("text-overflow:ellipsis");
  });
});

describe("C304 D -- the excess over target, worded for the class", () => {
  it("the class word comes from summary.csv, else from the KPI code", () => {
    expect(pinchClassOf(PEQ_KPIS, parseSummary(PEQ_SUMMARY)!.class)).toBe("thresholdNoHotUtility");
    expect(pinchClassOf(PEQ_KPIS, null)).toBe("thresholdNoHotUtility");
    expect(pinchClassOf(P01_KPIS, null)).toBe("interiorPinch");
  });
  it("PEQ: 81.6 kW of hot utility above a target of 0, never 'below the pinch'", () => {
    const l = excessLine(PEQ_KPIS, "thresholdNoHotUtility", u)!;
    expect(l).toBe("hot utility bought above the target · 81.6 − 0.0 = 81.6 kW"
      + " (target 0 in a threshold problem: no interior pinch, so none of it is \"below the pinch\")");
    const t = text(page(PEQ));
    expect(t).toContain("hot utility bought above the target · 81.6 − 0.0 = 81.6 kW");
    expect(t).not.toContain("kW heating below");
  });
  it("pinch01: 380 = 260 heating below the pinch + 120 cooling above it", () => {
    const l = excessLine(P01_KPIS, "interiorPinch", u)!;
    expect(l).toContain("488 − 108 = 380 kW");
    expect(l).toContain("260 kW heating below the pinch + 120 kW cooling above the pinch");
    expect(text(page(P01))).toContain("260 kW heating below the pinch");
  });
  it("no cold utility: the excess is cold utility above a target of 0", () => {
    const l = excessLine({ Q_heat_current_kW: 150, Q_cool_current_kW: 50, Q_H_min_kW: 100,
      Q_C_min_kW: 0, violation_heat_below_pinch_kW: 0, violation_cool_above_pinch_kW: 50 },
      "thresholdNoColdUtility", u)!;
    expect(l).toContain("cold utility bought above the target · 50.0 − 0.0 = 50.0 kW");
    expect(l).toContain("hot utility above its target · 150.0 − 100.0 = 50.0 kW");
    expect(l).not.toMatch(/heating below|cooling above the pinch:/);
  });
  it("no utility: both excesses against targets of 0", () => {
    const l = excessLine({ Q_heat_current_kW: 30, Q_cool_current_kW: 30, Q_H_min_kW: 0,
      Q_C_min_kW: 0, violation_heat_below_pinch_kW: 30, violation_cool_above_pinch_kW: 0 },
      "thresholdNoUtility", u)!;
    expect(l).toContain("heating 30.0 − 0.0 = 30.0 kW · cooling 30.0 − 0.0 = 30.0 kW");
    expect(l).toContain("both targets 0 in a threshold problem: no interior pinch");
  });
  it("several pinches keep the pinch wording", () => {
    expect(excessLine(P01_KPIS, "severalPinches", u)).toContain("heating below the pinch");
  });
});

// ---- Vitor's two additions (2026-11-11) --------------------------------------

describe("C304 E -- every number on the Pinch page follows the sig-figs preference", () => {
  it("default 3: 41051 -> 41100, 61412.4 -> 61400, 107.5 -> 108, 353.15 K -> 353", () => {
    expect(u.Q(41050.75866)).toBe("41100");
    expect(u.Q(61412.41602, 1)).toBe("61400");     // the `d` argument is ignored
    expect(u.Qt(107.5)).toBe("108");
    expect(u.T(353.15, 2)).toBe("353");
    expect(u.CP(155.033775, 3)).toBe("155");
    expect(u.dT(10, 0)).toBe("10");
  });
  it("a user who sets 5 sees 5 (prefs), and the live global is read when prefs carry none", () => {
    const u5 = pinchUnits({ ...DEFAULT_PREFS, sigFigs: 5 });
    expect(u5.Q(41050.75866)).toBe("41051");
    expect(u5.T(353.15)).toBe("353.15");
    const live = pinchUnits({ temperature: "K", duty: "kW" });
    setDisplaySigFigs(5);
    try {
      expect(live.Q(61412.41602)).toBe("61412");
    } finally { setDisplaySigFigs(3); }
    expect(live.Q(61412.41602)).toBe("61400");
  });
  it("the PEQ page at 5 s.f. prints 5 everywhere it printed 3", () => {
    mock.state = { runResult: PEQ, displayPrefs: { ...DEFAULT_PREFS, sigFigs: 5 },
      setDisplayPrefs: () => undefined };
    const t = text(renderToStaticMarkup(createElement(MantineProvider, null, createElement(PinchView))));
    expect(t).toContain("Partial analysis: 30315 kW of duty not in the population (Converter)");
    expect(t).toContain("installed 61412.416 kW");   // 5 s.f. on the smallest, 81.550
    expect(t).toContain("targets 0 kW hot / 41051 kW cold");
  });
  it("PEQ at the default: a lone number carries 3 significant figures", () => {
    const t = text(page(PEQ));
    expect(t).toContain("targets 0 kW hot / 41100 kW cold");
    // the long engine values never reach the page
    for (const raw of ["41050.8", "102544.7", "30314.8", "728.15"])
      expect(t, raw).not.toContain(raw);
  });
  it("the CSV the page reads stays at full precision (nothing rewrites it)", () => {
    expect(PEQ_POPULATION).toContain("-61412.41602");
  });
  it("no raw toFixed is left on the Pinch page's printed numbers", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
      "../src/ui/methods/PinchCompositeTool.tsx"), "utf-8");
    // the only toFixed left are SVG coordinates (polyline points)
    const uses = src.split("\n").filter((l) => l.includes("toFixed("));
    expect(uses.every((l) => /frame\.to[XY]/.test(l)), uses.join("\n")).toBe(true);
    const grid = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
      "../src/ui/plotting/PinchGridPlot.tsx"), "utf-8");
    expect(grid).not.toMatch(/\.toFixed\(/);
  });
});

describe("C304 F -- SortableTable: one reusable sort, used by every Pinch table", () => {
  const rows = [
    { n: "b", v: 10 }, { n: "a", v: 9 }, { n: "c", v: NaN }, { n: "a2", v: 100 },
  ];
  it("numeric columns sort numerically, both ways, missing values last", () => {
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.n)).toEqual(["a", "b", "a2", "c"]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.n)).toEqual(["a2", "b", "a", "c"]);
  });
  it("string columns sort with numeric-aware collation; the sort is stable", () => {
    expect(sortRows(["x10", "x9", "x1"], (r) => r, "asc")).toEqual(["x1", "x9", "x10"]);
    const tie = [{ k: 1, id: "first" }, { k: 1, id: "second" }];
    expect(sortRows(tie, (r) => r.k, "desc").map((r) => r.id)).toEqual(["first", "second"]);
  });
  it("a click sorts ascending, the next one descending, another column restarts ascending", () => {
    const a = nextSort(null, "Q");
    expect(a).toEqual({ key: "Q", dir: "asc" });
    expect(nextSort(a, "Q")).toEqual({ key: "Q", dir: "desc" });
    expect(nextSort(nextSort(a, "Q"), "Q")).toEqual({ key: "Q", dir: "asc" });
    expect(nextSort(a, "T")).toEqual({ key: "T", dir: "asc" });
  });
  it("the sorted header shows its arrow and aria-sort; the rows come out sorted", () => {
    function Probe({ dir }: { dir: "asc" | "desc" }) {
      const s = useSortable(rows, { v: (r) => r.v, n: (r) => r.n }, { key: "v", dir });
      return createElement(Table, null,
        createElement(Table.Thead, null, createElement(Table.Tr, null,
          createElement(SortTh, { s, k: "n", children: "name" }),
          createElement(SortTh, { s, k: "v", children: "value" }))),
        createElement(Table.Tbody, null, s.rows.map((r) =>
          createElement("tr", { key: r.n }, createElement("td", null, r.n)))));
    }
    const h = renderToStaticMarkup(createElement(MantineProvider, null, createElement(Probe, { dir: "desc" })));
    expect(h).toMatch(/data-sortable="v"[^>]*aria-sort="descending"|aria-sort="descending"[^>]*data-sortable="v"/);
    expect(h).toContain("▼");
    expect(h).toMatch(/data-sortable="n"[^>]*aria-sort="none"|aria-sort="none"[^>]*data-sortable="n"/);
    expect(text(h).match(/\b(a2|b|a|c)\b/g)).toEqual(["a2", "b", "a", "c"]);
    const up = renderToStaticMarkup(createElement(MantineProvider, null, createElement(Probe, { dir: "asc" })));
    expect(up).toContain("▲");
  });
  it("PEQ page: the stream table (7 columns) and the cascade (8) are sortable", () => {
    const h = page(PEQ);
    expect((h.match(/data-sortable="/g) ?? []).length).toBe(15);
  });
  it("the candidate-matches table uses the same component", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
      "../src/ui/methods/PinchCompositeTool.tsx"), "utf-8");
    const m = src.slice(src.indexOf("function MatchesTable"));
    expect((m.slice(0, m.indexOf("</Table.Thead>")).match(/<SortTh /g) ?? []).length).toBe(7);
    expect(m).toContain("s.rows.map");
  });
});

describe("C304 G -- numbers in one identity share ONE absolute precision (u.group)", () => {
  it("PEQ: 61412.4 / 61494.0 / 81.6 -- the smallest carries the 3 s.f.", () => {
    const g = u.group([61412.41602, 61493.96625, 81.55022706]);
    expect([g(61412.41602), g(61493.96625), g(81.55022706)]).toEqual(["61412.4", "61494.0", "81.6"]);
    // what the reader subtracts is what is printed
    expect(Number(g(61493.96625)) - Number(g(61412.41602))).toBeCloseTo(Number(g(81.55022706)), 6);
  });
  it("pinch01: 488 − 108 = 380 = 260 + 120, all integers", () => {
    const v = [487.5, 107.5, 380, 260, 120];
    const g = u.group(v);
    expect(v.map(g)).toEqual(["488", "108", "380", "260", "120"]);
  });
  it("follows the preference: 5 s.f. puts three decimals on 81.550", () => {
    const g = pinchUnits({ ...DEFAULT_PREFS, sigFigs: 5 }).group([61412.41602, 81.55022706]);
    expect(g(61412.41602)).toBe("61412.416");
    expect(g(81.55022706)).toBe("81.550");
  });
  it("zeros do not set the precision, and never print as -0", () => {
    const g = u.group([0, 0]);
    expect(g(0)).toBe("0");
    expect(u.group([-0.01, 50])(-0.00001)).toBe("0.0000");   // rounds to zero: no sign
  });
  it("PEQ page: the targets identity chip and the recovery line are coherent", () => {
    const t = text(page(PEQ));
    expect(t).toContain("Q_recovery,max 61494 kW · Q_H,min − Q_C,min = -41051 kW"
      + " = cold total − hot total (61494 − 102545)");
    expect(t).toContain("installed 61412.4 kW (process-to-process exchangers in the population)"
      + " · maximum 61494.0 kW (target) · additional possible 81.6 kW");
    expect(t).toContain("hot utility bought above the target · 81.6 − 0.0 = 81.6 kW");
  });
  it("pinch01 page: the excess identity in integers, the totals identity to 67.5", () => {
    const t = text(page(P01));
    expect(t).toContain("excess over target · 488 − 108 = 380 kW = 260 kW heating below the pinch"
      + " + 120 kW cooling above the pinch");
    expect(t).toContain("Q_recovery,max 380.0 kW · Q_H,min − Q_C,min = 67.5 kW"
      + " = cold total − hot total (487.5 − 420.0)");
  });
});
