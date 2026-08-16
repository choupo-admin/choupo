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

// DryingCurveTool -- the servability detector, the unit-prefix-aware column
// resolver, the period classifier (with the boundary sample pinned to the side
// the ENGINE puts it on), the absent-t_critical branch, and the classroom
// knob->override map verified against the REAL bundled witness raw text.
//
// Pure layers only: no DOM, no WASM run.  The tool draws with inline SVG (the
// VanHeerden precedent) and imports no plotly seam, so no mock is needed here.

import { describe, expect, it } from "vitest";

import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  DRYING_ABSENCES,
  DRYING_KNOBS,
  DRYING_WITNESS,
  EVAPORATED_COLUMN_SUFFIX,
  R_COLUMN_SUFFIX,
  REQUIRED_DRYING_KPIS,
  X_COLUMN_SUFFIX,
  classifyPeriods,
  criticalTimeState,
  defaultKnobValues,
  detectDryingCurve,
  dryingUnitsIn,
  extractDryingKpis,
  extractFallingRateNotice,
  knobOverrides,
  periodSegments,
  resolveDryingColumns,
  type DryingKpis,
  type KpiMap,
} from "../src/ui/methods/DryingCurveTool.js";

// ---- Fixtures, verbatim from the witness's own run --------------------------
// trajectory.csv and log.* are RUN OUTPUTS and are deliberately excluded from
// the GUI bundle (tutorials.ts glob negatives), so the header and the
// announcement are quoted here character for character instead of read back.

/** tutorials/batch/drying/dryer01_sucrose_tray/trajectory.csv, line 1. */
const DRYER01_HEADER =
  "t,dryer.n_water,dryer.n_sucrose,dryer.n_N2,dryer.T,"
  + "dryer.X_kg_kg,dryer.R_kg_m2_s,dryer.evaporated_kg";

/** tutorials/batch/adsorber/batch13_breakthrough_co2 -- a fixed-bed OUTLET
 *  history.  A breakthrough trajectory is not a drying one. */
const BATCH13_HEADER =
  "t,bed.n_CO2,bed.n_He,bed.T,bed.c_out_CO2,bed.y_out_CO2,bed.c_out_He,"
  + "bed.y_out_He,bed.qbar_CO2,bed.model_closure_CO2";

const cols = (header: string) => header.split(",");

/** The `dryer` KPI block, values verbatim from the witness's `expected`
 *  golden (bin/runTests --record). */
const DRYER01_KPIS: KpiMap = {
  dryer: {
    R_constant: 0.000700569891048,
    T_wb: 300.534289861,
    X_critical: 0.12,
    X_equilibrium: 0.0157978541807,
    X_final: 0.0195840385972,
    X_initial: 0.299999999647,
    latentDuty_kW: 0.864476040155,
    latentEnergy_kJ: 1384.0896336,
    t_critical: 1027.73485145,
    t_end: 3000,
  },
};

/** log.choupoBatch line 32, verbatim -- the sentence the honesty chip quotes. */
const MODELLING_CHOICE_LINE =
  "  [batchDryer 'dryer'] MODELLING CHOICE, not physics: below X_c = 0.1200"
  + " kg/kg the flux falls LINEARLY in the free moisture, R = R_c (X - X_eq)/"
  + "(X_c - X_eq) -- the simplest defensible falling-rate law, and it is a"
  + " CHOICE this case makes";

const DRYER01_LOG = [
  "  [batchDryer 'dryer'] wet bulb T_wb = 300.53 K (adiabatic saturation,"
    + " Lewis = 1, bisection to 1e-7 K); the surface is HELD there while"
    + " X > X_c",
  MODELLING_CHOICE_LINE,
  "  [batchDryer 'dryer'] named gap: the solid's temperature is NOT"
    + " integrated",
].join("\n");

// ---- The column resolver ----------------------------------------------------

describe("resolveDryingColumns — unit-prefix aware, on the real header", () => {
  it("resolves all three extras off dryer01's own trajectory header", () => {
    const c = resolveDryingColumns(cols(DRYER01_HEADER), "dryer");
    expect(c.X).toBe("dryer.X_kg_kg");
    expect(c.R).toBe("dryer.R_kg_m2_s");
    expect(c.evaporated).toBe("dryer.evaporated_kg");
    // The suffixes the tool exports ARE the ones the engine emits.
    expect(c.X).toBe(`dryer.${X_COLUMN_SUFFIX}`);
    expect(c.R).toBe(`dryer.${R_COLUMN_SUFFIX}`);
    expect(c.evaporated).toBe(`dryer.${EVAPORATED_COLUMN_SUFFIX}`);
  });

  it("does not borrow another unit's columns (the prefix must be its own)", () => {
    // A two-dryer flowsheet: each unit answers with ITS OWN columns only.
    const header = cols(
      "t,trayA.X_kg_kg,trayA.R_kg_m2_s,trayB.X_kg_kg,trayB.R_kg_m2_s");
    expect(resolveDryingColumns(header, "trayA").X).toBe("trayA.X_kg_kg");
    expect(resolveDryingColumns(header, "trayB").R).toBe("trayB.R_kg_m2_s");
    // A unit that publishes nothing gets nulls, never a neighbour's column.
    const none = resolveDryingColumns(header, "trayC");
    expect([none.X, none.R, none.evaporated]).toEqual([null, null, null]);
    // dryer01's own header has no evaporated column for a foreign unit.
    expect(resolveDryingColumns(header, "trayA").evaporated).toBeNull();
  });

  it("lists the drying units in the order the header declares them", () => {
    expect(dryingUnitsIn(cols(DRYER01_HEADER))).toEqual(["dryer"]);
    expect(dryingUnitsIn(cols(
      "t,trayB.X_kg_kg,trayA.X_kg_kg,trayA.R_kg_m2_s")))
      .toEqual(["trayB", "trayA"]);
    // The breakthrough header carries no X column at all.
    expect(dryingUnitsIn(cols(BATCH13_HEADER))).toEqual([]);
  });
});

// ---- The activation predicate ----------------------------------------------

describe("detectDryingCurve — columns AND KPIs, on the same unit", () => {
  it("activates on dryer01 (X/R columns + the three drying KPIs)", () => {
    const a = detectDryingCurve(cols(DRYER01_HEADER), DRYER01_KPIS);
    expect(a.active).toBe(true);
    expect(a.unit).toBe("dryer");
    expect(a.columns.X).toBe("dryer.X_kg_kg");
    expect(a.columns.R).toBe("dryer.R_kg_m2_s");
  });

  it("does NOT activate on a breakthrough run (a different plot entirely)", () => {
    const bedKpis: KpiMap = {
      bed: {
        t_stoichiometric_CO2: 3040.51250948,
        retention_factor_CO2: 304.051250948,
        qbar_CO2_final: 2.87234042488,
      },
    };
    const a = detectDryingCurve(cols(BATCH13_HEADER), bedKpis);
    expect(a.active).toBe(false);
    expect(a.unit).toBeNull();
    // And the negative holds even if a breakthrough unit somehow carried the
    // drying KPI names: without the X column there is no curve to draw.
    const spoofed: KpiMap = {
      bed: { X_critical: 0.12, X_equilibrium: 0.016, R_constant: 7e-4 },
    };
    expect(detectDryingCurve(cols(BATCH13_HEADER), spoofed).active).toBe(false);
  });

  it("does NOT activate on drying columns without the drying KPIs", () => {
    expect(detectDryingCurve(cols(DRYER01_HEADER), undefined).active)
      .toBe(false);
    expect(detectDryingCurve(cols(DRYER01_HEADER), { dryer: {} }).active)
      .toBe(false);
    // Each required KPI is genuinely required — drop one at a time.
    for (const missing of REQUIRED_DRYING_KPIS) {
      const block = { ...DRYER01_KPIS["dryer"] } as { [k: string]: number };
      delete block[missing];
      expect(detectDryingCurve(cols(DRYER01_HEADER), { dryer: block }).active,
        `dropping ${missing} must deactivate`).toBe(false);
    }
  });

  it("does NOT activate on the KPIs alone (no trajectory columns)", () => {
    expect(detectDryingCurve([], DRYER01_KPIS).active).toBe(false);
    expect(detectDryingCurve(["t"], DRYER01_KPIS).active).toBe(false);
  });

  it("requires the KPIs on the SAME unit that owns the columns", () => {
    const kpis: KpiMap = { someoneElse: DRYER01_KPIS["dryer"]! };
    expect(detectDryingCurve(cols(DRYER01_HEADER), kpis).active).toBe(false);
  });
});

// ---- The period classifier --------------------------------------------------

describe("classifyPeriods — ordering over the engine's own numbers", () => {
  it("splits a descending X series at the engine's X_c", () => {
    const X = [0.30, 0.20, 0.15, 0.11, 0.05, 0.02];
    expect(classifyPeriods(X, 0.12)).toEqual([
      "constant", "constant", "constant", "falling", "falling", "falling",
    ]);
  });

  // THE BOUNDARY, PINNED.  BatchDryer::flux_ reads
  //     if (X > X_c_) return R_c_;
  //     return R_c_ * (X - X_eq_) / (X_c_ - X_eq_);
  // so the constant-rate branch is X STRICTLY ABOVE X_c and a sample sitting
  // EXACTLY on X_c is already on the FALLING side.  The tool copies that
  // inequality; this test is the pin that keeps the two from drifting apart.
  it("a sample EXACTLY at X_c lands on the FALLING side (the engine's own >)", () => {
    expect(classifyPeriods([0.12], 0.12)).toEqual(["falling"]);
    expect(classifyPeriods([0.1200001], 0.12)).toEqual(["constant"]);
    expect(classifyPeriods([0.1199999], 0.12)).toEqual(["falling"]);
    // And in series: the boundary point opens the falling run, it does not
    // close the constant one.
    const p = classifyPeriods([0.2, 0.12, 0.05], 0.12);
    expect(p).toEqual(["constant", "falling", "falling"]);
    expect(periodSegments(p)).toEqual([
      { period: "constant", start: 0, end: 1 },
      { period: "falling", start: 1, end: 3 },
    ]);
  });

  it("labels nothing it cannot compare (non-finite X, or a non-finite X_c)", () => {
    expect(classifyPeriods([0.3, NaN, 0.05], 0.12))
      .toEqual(["constant", null, "falling"]);
    expect(classifyPeriods([0.3, 0.05], NaN)).toEqual([null, null]);
    expect(classifyPeriods([], 0.12)).toEqual([]);
  });
});

describe("periodSegments — contiguous runs, unlabelled points breaking them", () => {
  it("groups a two-period run into exactly two segments", () => {
    const p = classifyPeriods([0.30, 0.20, 0.11, 0.05], 0.12);
    expect(periodSegments(p)).toEqual([
      { period: "constant", start: 0, end: 2 },
      { period: "falling", start: 2, end: 4 },
    ]);
  });

  it("a null breaks the run rather than being absorbed into it", () => {
    expect(periodSegments(["constant", null, "constant"])).toEqual([
      { period: "constant", start: 0, end: 1 },
      { period: "constant", start: 2, end: 3 },
    ]);
    expect(periodSegments([])).toEqual([]);
    expect(periodSegments([null, null])).toEqual([]);
  });
});

// ---- The KPI reader + the ABSENT t_critical branch --------------------------

describe("extractDryingKpis — verbatim, and null for what was not published", () => {
  it("reads dryer01's block off the golden values", () => {
    const k = extractDryingKpis(DRYER01_KPIS["dryer"]);
    expect(k.X_initial).toBeCloseTo(0.299999999647, 9);
    expect(k.X_final).toBeCloseTo(0.0195840385972, 9);
    expect(k.X_critical).toBe(0.12);
    expect(k.X_equilibrium).toBeCloseTo(0.0157978541807, 9);
    expect(k.T_wb).toBeCloseTo(300.534289861, 6);
    expect(k.R_constant).toBeCloseTo(0.000700569891048, 12);
    expect(k.latentDuty_kW).toBeCloseTo(0.864476040155, 9);
    expect(k.latentEnergy_kJ).toBeCloseTo(1384.0896336, 6);
    expect(k.t_critical).toBeCloseTo(1027.73485145, 6);
  });

  it("an absent key is null — never 0, never re-derived", () => {
    const k = extractDryingKpis({ X_critical: 0.12 });
    expect(k.X_critical).toBe(0.12);
    expect(k.t_critical).toBeNull();
    expect(k.T_wb).toBeNull();
    expect(k.latentDuty_kW).toBeNull();
    const none = extractDryingKpis(undefined);
    expect(none.X_critical).toBeNull();
    expect(none.t_critical).toBeNull();
  });
});

describe("criticalTimeState — the OMITTED t_critical is information", () => {
  const base: DryingKpis = {
    X_initial: 0.3, X_final: 0.0196, X_critical: 0.12,
    X_equilibrium: 0.0158, T_wb: 300.53, R_constant: 7.0057e-4,
    latentDuty_kW: 0.8645, latentEnergy_kJ: 1384.09, t_critical: null,
  };

  it("reports the observed crossing when the engine published one", () => {
    const s = criticalTimeState({ ...base, t_critical: 1027.73485145 });
    expect(s.present).toBe(true);
    expect(s.t).toBeCloseTo(1027.73485145, 6);
    expect(s.note).toContain("OBSERVED");
  });

  it("ABSENT + X_final still above X_c => the run ended inside the constant-rate period", () => {
    // The endTime knob at its floor: the horizon stops before the break time.
    const s = criticalTimeState({ ...base, X_final: 0.16, t_critical: null });
    expect(s.present).toBe(false);
    // The whole point: never a zero, never a blank.
    expect(s.t).toBeNull();
    expect(s.t).not.toBe(0);
    if (s.present) throw new Error("unreachable: the state must be absent");
    expect(s.absence).toBe("endedInConstantRate");
    expect(s.note).toContain("ENDED INSIDE the constant-rate period");
    expect(s.note).toContain("endTime");
    // It names both engine numbers it ordered to reach that conclusion.
    expect(s.note).toContain("0.16");
    expect(s.note).toContain("0.12");
  });

  it("ABSENT + X_0 at or below X_c => there was no constant-rate period to end", () => {
    const s = criticalTimeState({ ...base, X_initial: 0.08, t_critical: null });
    expect(s.present).toBe(false);
    expect(s.t).toBeNull();
    if (s.present) throw new Error("unreachable: the state must be absent");
    expect(s.absence).toBe("startedAtOrBelowXc");
    expect(s.note).toContain("no break time");
    // The boundary case belongs to this branch too (X_0 == X_c: the tray is
    // already on the falling side, exactly as classifyPeriods says).
    const edge = criticalTimeState({ ...base, X_initial: 0.12, t_critical: null });
    expect(edge.present).toBe(false);
    if (edge.present) throw new Error("unreachable");
    expect(edge.absence).toBe("startedAtOrBelowXc");
  });

  it("ABSENT and unexplainable => said so, not guessed", () => {
    const s = criticalTimeState({
      ...base, X_initial: null, X_final: null, t_critical: null,
    });
    expect(s.present).toBe(false);
    expect(s.t).toBeNull();
    if (s.present) throw new Error("unreachable: the state must be absent");
    expect(s.absence).toBe("unstated");
    expect(s.note).toContain("rather than guessed");
  });
});

// ---- The engine's own falling-rate sentence ---------------------------------

describe("extractFallingRateNotice — quoted, never paraphrased", () => {
  it("lifts the engine's sentence out of the log with its tag stripped", () => {
    const n = extractFallingRateNotice(DRYER01_LOG, "dryer");
    expect(n).not.toBeNull();
    expect(n).toBe(MODELLING_CHOICE_LINE.slice(
      MODELLING_CHOICE_LINE.indexOf("] ") + 2));
    // The wording is the ENGINE's, character for character.
    expect(n).toContain("MODELLING CHOICE, not physics");
    expect(n).toContain("R = R_c (X - X_eq)/(X_c - X_eq)");
    expect(n).toContain("it is a CHOICE this case makes");
    expect(n).not.toContain("[batchDryer");
  });

  it("never attributes ANOTHER unit's sentence to this one", () => {
    expect(extractFallingRateNotice(DRYER01_LOG, "someOtherTray")).toBeNull();
    // Untagged: with a single candidate line it is still this run's.
    expect(extractFallingRateNotice(
      "MODELLING CHOICE, not physics: the tail is linear", "dryer"))
      .toBe("MODELLING CHOICE, not physics: the tail is linear");
  });

  it("returns null when there is nothing to quote", () => {
    expect(extractFallingRateNotice(undefined, "dryer")).toBeNull();
    expect(extractFallingRateNotice("", "dryer")).toBeNull();
    expect(extractFallingRateNotice("nothing announced here", "dryer"))
      .toBeNull();
  });
});

// ---- The classroom witness + knob map, against the REAL bundled corpus ------
// The standalone (self-feeding) mode clones dryer01 and writes the knobs into
// its dicts.  These tests pin the whole knob->dict contract WITHOUT running
// the engine: every (file, key) must resolve uniquely in the witness's actual
// raw text (applyScalarOverride throws on missing/ambiguous — a knob that
// misses its dict would run the engine on the wrong question).

describe("the classroom witness — dryer01 bundled and knob-addressable", () => {
  it("is in the bundled corpus, a choupoBatch batchDryer case with raw dicts", () => {
    const entry = tutorialByName(DRYING_WITNESS);
    expect(entry).toBeDefined();
    expect(entry!.category).toBe("batch");
    expect(entry!.shortName).toBe("dryer01_sucrose_tray");
    const raws = entry!.files.rawFiles;
    expect(raws).toBeDefined();
    expect(raws!["system/flowsheetDict"]).toContain("batchDryer");
    expect(raws!["system/controlDict"]).toContain("choupoBatch");
    // The vessel's charge is authored in 0/internalState (the single source
    // of truth the knob map's absence list refers to).
    expect(raws!["0/internalState"]).toContain("molarComposition");
  });

  it("every knob's ScalarOverride resolves against the real witness raw text", () => {
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    for (const k of DRYING_KNOBS) {
      const raw = raws[k.file];
      expect(raw, `knob '${k.id}' names missing file '${k.file}'`).toBeDefined();
      // Resolves (UNIQUE match) — throws on missing or ambiguous keys.
      const out = applyScalarOverride(raw!,
        { file: k.file, key: k.key, value: 123.456 });
      expect(out).not.toBe(raw);
      // The number landed on the knob's own line, with the dict's declared
      // unit word surviving the override untouched.
      const line = new RegExp(
        `^[ \\t]*${k.key}[ \\t]+123\\.456[ \\t]*`
        + k.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*;", "m");
      expect(out, `knob '${k.id}' (${k.file}:${k.key})`).toMatch(line);
    }
  });

  it("the defaults ARE the witness's authored numbers", () => {
    // Numeric, not byte, equality: the witness writes the air humidity as
    // `Y 0.010;` and JavaScript re-serialises the same number as `0.01`.  The
    // contract is that the classroom baseline IS what the case declares, and a
    // spelling of a number is not a different value — so the test reads the
    // number off the knob's own line and compares it, rather than comparing
    // file bytes and mistaking `0.010` for a changed default.
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    for (const k of DRYING_KNOBS) {
      const declared = new RegExp(
        `^[ \\t]*${k.key}[ \\t]+([-+0-9.eE]+)`, "m").exec(raws[k.file]!);
      expect(declared, `knob '${k.id}' has no declared line`).not.toBeNull();
      expect(Number(declared![1]), `default for knob '${k.id}'`).toBe(k.def);
      // And writing the default back leaves the declared NUMBER where it was.
      const out = applyScalarOverride(raws[k.file]!,
        { file: k.file, key: k.key, value: k.def });
      const after = new RegExp(
        `^[ \\t]*${k.key}[ \\t]+([-+0-9.eE]+)`, "m").exec(out);
      expect(Number(after![1])).toBe(k.def);
    }
  });

  it("the witness's authored default sits inside every knob's range", () => {
    for (const k of DRYING_KNOBS) {
      expect(k.def, `knob '${k.id}' min`).toBeGreaterThanOrEqual(k.min);
      expect(k.def, `knob '${k.id}' max`).toBeLessThanOrEqual(k.max);
    }
  });

  it("methodCase clones the witness with the full default knob set applied", () => {
    const files = methodCase(DRYING_WITNESS, knobOverrides(defaultKnobValues()));
    expect(files.flowsheet).toBeDefined();
    expect(files.controlDict["application"]).toBe("choupoBatch");
    // The clone still carries the raw dicts the adapter writes into MEMFS.
    expect(files.rawFiles?.["system/flowsheetDict"]).toContain("batchDryer");
  });

  it("a bogus key throws rather than silently running the wrong question", () => {
    expect(() => methodCase(DRYING_WITNESS,
      [{ file: "system/flowsheetDict", key: "noSuchKnob", value: 1 }]))
      .toThrow(/noSuchKnob/);
    // A bogus FILE is refused too — the other half of the same contract.
    expect(() => methodCase(DRYING_WITNESS,
      [{ file: "system/noSuchDict", key: "area", value: 1 }]))
      .toThrow(/noSuchDict/);
  });

  it("knobOverrides drops non-finite values — never writes NaN into a dict", () => {
    const values = defaultKnobValues();
    values["area"] = NaN;
    const overrides = knobOverrides(values);
    expect(overrides.map((o) => o.key)).not.toContain("area");
    expect(overrides).toHaveLength(DRYING_KNOBS.length - 1);
    expect(knobOverrides(defaultKnobValues()))
      .toHaveLength(DRYING_KNOBS.length);
  });
});

// ---- The recorded absences, pinned BY KIND ----------------------------------
// A reason must not be allowed to rot into an accident: an entry claiming the
// grammar cannot reach a key must actually fail against the real raw text, and
// an entry claiming a key is reachable-but-declined must actually resolve.

describe("the deliberately absent knobs — each pinned in the right direction", () => {
  it("every absence names a file the witness really ships", () => {
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    for (const a of DRYING_ABSENCES)
      expect(raws[a.file], `absence '${a.id}' names '${a.file}'`).toBeDefined();
  });

  it("an UNREACHABLE key must throw; a DECLINED one must resolve", () => {
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    for (const a of DRYING_ABSENCES) {
      const attempt = () => applyScalarOverride(raws[a.file]!,
        { file: a.file, key: a.key, value: 1.5 });
      if (a.resolves) {
        // "addressable, and deliberately not exposed" — the override works,
        // which is exactly why the reason has to be a stated choice.
        expect(a.kind, `absence '${a.id}'`).toBe("addressableButDeclined");
        expect(attempt, `absence '${a.id}' claims it resolves`).not.toThrow();
      } else {
        expect(a.kind, `absence '${a.id}'`).not.toBe("addressableButDeclined");
        expect(attempt, `absence '${a.id}' claims it does NOT resolve`)
          .toThrow(new RegExp(a.key));
      }
    }
  });

  it("k_Y is unreachable because the value is not the first token (bracket dimensions)", () => {
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    // The witness really does declare it that way — the reason, not just the
    // symptom, is pinned.
    expect(raws["system/flowsheetDict"]).toMatch(/k_Y\s+\[1 -2 -1 0 0\]\s+0\.05;/);
  });

  it("the initial moisture is unreachable because it lives in an inline one-line block", () => {
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    expect(raws["0/internalState"])
      .toMatch(/molarComposition\s+\{\s*sucrose\s+[0-9.]+;\s+water\s+[0-9.]+;\s*\}/);
    // Both fractions are equally out of reach — it is the LINE, not the key.
    for (const key of ["water", "sucrose"])
      expect(() => applyScalarOverride(raws["0/internalState"]!,
        { file: "0/internalState", key, value: 0.5 })).toThrow(new RegExp(key));
  });

  it("the carrier is unreachable because it is a WORD, not a scalar", () => {
    const raws = tutorialByName(DRYING_WITNESS)!.files.rawFiles!;
    expect(raws["system/flowsheetDict"]).toMatch(/carrier\s+N2;/);
    expect(() => applyScalarOverride(raws["system/flowsheetDict"]!,
      { file: "system/flowsheetDict", key: "carrier", value: 1 }))
      .toThrow(/carrier/);
  });

  it("no absence duplicates a live knob (the two lists are disjoint)", () => {
    const live = new Set(DRYING_KNOBS.map((k) => `${k.file}::${k.key}`));
    for (const a of DRYING_ABSENCES)
      expect(live.has(`${a.file}::${a.key}`),
        `'${a.id}' is both a knob and an absence`).toBe(false);
  });
});
