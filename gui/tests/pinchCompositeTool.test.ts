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

// pinchCompositeTool -- the CSV readers, the derived-in-view cascade, the
// cross-check against the engine's KPI row, and the candidate-row flagging.
// The fixtures below are VERBATIM copies of the witness case's engine output
// (tutorials/steady/heat/pinch01_four_stream_classic, reports/pinch/*.csv),
// and every pinned target is the value the case's golden `expected` file pins
// for the engine itself (Q_H_min_kW 107.5, Q_C_min_kW 40, T_pinch_K 353.15) --
// so the cascade here is checked against the engine, never against itself.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyScalarOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  CANDIDATE_MATCHES_CSV_PATH,
  COMPOSITE_CURVES_CSV_PATH,
  CROSS_CHECK_TOL,
  PINCH_KNOBS,
  PINCH_WITNESS,
  candidateFlag,
  computePinchFromCurves,
  crossCheckAgainstKpis,
  interpolateH,
  parseCandidateMatches,
  parseCompositeCurves,
  pinchOverrides,
  type CandidateMatch,
} from "../src/ui/methods/PinchCompositeTool.js";

// ---- Fixtures: the witness case's engine output, verbatim -------------------

const WITNESS_CURVES_CSV = `curve,T_K,H_kW
hot,333.15,0
hot,363.15,300
hot,423.15,420
cold,293.15,0
cold,298.15,12.5
cold,373.15,425
cold,398.15,487.5
hotShifted,323.15,0
hotShifted,353.15,300
hotShifted,413.15,420
coldShifted,303.15,0
coldShifted,308.15,12.5
coldShifted,383.15,425
coldShifted,408.15,487.5
`;

const WITNESS_MATCHES_CSV = `region,hotStream,coldStream,temperatureFeasible,pinchRule,maximumCandidateDuty_kW,limitingReason,recommendation
abovePinch,coolerH1,heaterC1,yes,pinch match: CP_hot <= CP_cold holds,120,approach dTmin binds at an exchanger end,thermodynamically admissible candidate
abovePinch,coolerH1,heaterC2,yes,pinch match: CP_hot <= CP_cold holds,90,cold stream duty exhausted,thermodynamically admissible candidate
belowPinch,coolerH1,heaterC1,yes,pinch match: CP_hot >= CP_cold VIOLATED,60,hot stream duty exhausted,thermodynamically admissible candidate (away from the pinch only)
belowPinch,coolerH1,heaterC2,yes,pinch match: CP_hot >= CP_cold VIOLATED,60,hot stream duty exhausted,thermodynamically admissible candidate (away from the pinch only)
belowPinch,coolerH2,heaterC1,yes,pinch match: CP_hot >= CP_cold holds,125,approach dTmin binds at an exchanger end,thermodynamically admissible candidate
belowPinch,coolerH2,heaterC2,yes,pinch match: CP_hot >= CP_cold holds,135,approach dTmin binds at an exchanger end,thermodynamically admissible candidate
`;

// The engine's "pinch" KPI row for the witness, values from the case's golden
// `expected` file (reltol 1e-4 there; exact here, straight from the run).
const WITNESS_PINCH_KPIS = {
  Q_H_min_kW: 107.5,
  Q_C_min_kW: 40,
  T_pinch_K: 353.15,
  T_pinch_hot_K: 363.15,
  T_pinch_cold_K: 343.15,
  dTmin_K: 20,
};

// ---- parseCompositeCurves ---------------------------------------------------

describe("parseCompositeCurves -- the engine's curve,T_K,H_kW contract", () => {
  it("reads all four engine curve labels with their point counts", () => {
    const c = parseCompositeCurves(WITNESS_CURVES_CSV);
    expect(c).not.toBeNull();
    expect(Object.keys(c!).sort()).toEqual(
      ["cold", "coldShifted", "hot", "hotShifted"]);
    expect(c!["hot"]).toHaveLength(3);
    expect(c!["cold"]).toHaveLength(4);
    expect(c!["hotShifted"]).toHaveLength(3);
    expect(c!["coldShifted"]).toHaveLength(4);
    // Spot values, verbatim from the CSV.
    expect(c!["hot"]![0]).toEqual({ T_K: 333.15, H_kW: 0 });
    expect(c!["hot"]![2]).toEqual({ T_K: 423.15, H_kW: 420 });
    expect(c!["coldShifted"]![3]).toEqual({ T_K: 408.15, H_kW: 487.5 });
  });

  it("returns null on a header that is not the engine's", () => {
    expect(parseCompositeCurves("a,b,c\nhot,1,2\n")).toBeNull();
    expect(parseCompositeCurves("")).toBeNull();
    expect(parseCompositeCurves("curve,T_K,H_kW\n")).toBeNull();
  });

  it("skips a malformed row rather than misreading it", () => {
    const c = parseCompositeCurves(
      "curve,T_K,H_kW\nhot,300,0\nhot,nonsense,10\nhot,350,50\n");
    expect(c!["hot"]).toHaveLength(2);
  });
});

// ---- interpolateH -----------------------------------------------------------

describe("interpolateH -- clamped piecewise-linear read of a composite", () => {
  const curve = [
    { T_K: 323.15, H_kW: 0 },
    { T_K: 353.15, H_kW: 300 },
    { T_K: 413.15, H_kW: 420 },
  ];
  it("clamps below the cold end (nothing integrated) and above the hot end", () => {
    expect(interpolateH(curve, 200)).toBe(0);
    expect(interpolateH(curve, 500)).toBe(420);
  });
  it("interpolates linearly inside a segment", () => {
    // Midpoint of the first segment: 150 kW at 338.15 K.
    expect(interpolateH(curve, 338.15)).toBeCloseTo(150, 9);
    // 383.15 K sits halfway up the second segment: 300 + 120/2 = 360.
    expect(interpolateH(curve, 383.15)).toBeCloseTo(360, 9);
  });
});

// ---- computePinchFromCurves: the cross-check cascade ------------------------

describe("computePinchFromCurves -- the cascade over the engine's shifted curves", () => {
  const curves = parseCompositeCurves(WITNESS_CURVES_CSV)!;
  const derived = computePinchFromCurves(
    curves["hotShifted"], curves["coldShifted"])!;

  it("reproduces the witness golden's engine targets", () => {
    // The exact numbers the case's `expected` file pins for the ENGINE:
    //   kpi pinch Q_H_min_kW 107.5 / Q_C_min_kW 40 / T_pinch_K 353.15
    expect(derived).not.toBeNull();
    expect(derived.Q_H_min_kW).toBeCloseTo(107.5, 9);
    expect(derived.Q_C_min_kW).toBeCloseTo(40, 9);
    expect(derived.T_pinch_K).toBeCloseTo(353.15, 9);
  });

  it("derives a well-formed grand composite: T* descending, H >= 0, zero at the pinch", () => {
    const gcc = derived.gcc;
    expect(gcc.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i + 1 < gcc.length; ++i) {
      expect(gcc[i]!.T_K).toBeGreaterThan(gcc[i + 1]!.T_K);
    }
    for (const p of gcc) expect(p.H_kW).toBeGreaterThanOrEqual(-1e-9);
    const atPinch = gcc.find((p) => Math.abs(p.T_K - derived.T_pinch_K) < 1e-9);
    expect(atPinch).toBeDefined();
    expect(atPinch!.H_kW).toBeCloseTo(0, 9);
    // The two ends read the utility targets directly off the curve.
    expect(gcc[0]!.H_kW).toBeCloseTo(derived.Q_H_min_kW, 9);
    expect(gcc[gcc.length - 1]!.H_kW).toBeCloseTo(derived.Q_C_min_kW, 9);
  });

  it("pins the pocket levels by hand-worked cascade arithmetic", () => {
    // Hand cascade over the shifted curves (released - absorbed above each
    // level, plus Q_H_min = 107.5):
    //   T* 408.15: hot released 10, cold absorbed 0        -> H = 117.5
    //   T* 383.15: released 60, absorbed 62.5              -> H = 105
    //   T* 323.15: released 420, absorbed 392.5            -> H = 135
    //   T* 308.15: released 420, absorbed 475              -> H = 52.5
    const at = (T: number) =>
      derived.gcc.find((p) => Math.abs(p.T_K - T) < 1e-9)!.H_kW;
    expect(at(408.15)).toBeCloseTo(117.5, 9);
    expect(at(383.15)).toBeCloseTo(105, 9);
    expect(at(323.15)).toBeCloseTo(135, 9);
    expect(at(308.15)).toBeCloseTo(52.5, 9);
  });

  it("returns null when either shifted curve is missing or degenerate", () => {
    expect(computePinchFromCurves(undefined, curves["coldShifted"])).toBeNull();
    expect(computePinchFromCurves(curves["hotShifted"], undefined)).toBeNull();
    expect(computePinchFromCurves(
      [{ T_K: 300, H_kW: 0 }], curves["coldShifted"])).toBeNull();
  });
});

// ---- crossCheckAgainstKpis --------------------------------------------------

describe("crossCheckAgainstKpis -- the engine's KPI row is the judge", () => {
  const curves = parseCompositeCurves(WITNESS_CURVES_CSV)!;
  const derived = computePinchFromCurves(
    curves["hotShifted"], curves["coldShifted"])!;

  it("agrees on the witness (all three targets inside the band)", () => {
    const rows = crossCheckAgainstKpis(derived, WITNESS_PINCH_KPIS);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.key)).toEqual(
      ["Q_H_min_kW", "Q_C_min_kW", "T_pinch_K"]);
    for (const r of rows) {
      expect(r.agrees).toBe(true);
      expect(Math.abs(r.deviation))
        .toBeLessThanOrEqual(CROSS_CHECK_TOL * Math.max(1, Math.abs(r.engine)));
    }
  });

  it("flags a real disagreement and leaves the engine's number in place", () => {
    const rows = crossCheckAgainstKpis(derived,
      { ...WITNESS_PINCH_KPIS, Q_H_min_kW: 108 });
    const qh = rows.find((r) => r.key === "Q_H_min_kW")!;
    expect(qh.agrees).toBe(false);
    expect(qh.engine).toBe(108);              // the engine's value, untouched
    expect(qh.derived).toBeCloseTo(107.5, 9); // the view's cascade, untouched
    // The other two still agree -- the comparison is per target.
    expect(rows.find((r) => r.key === "Q_C_min_kW")!.agrees).toBe(true);
    expect(rows.find((r) => r.key === "T_pinch_K")!.agrees).toBe(true);
  });

  it("compares only keys the engine published; no KPI row means no rows", () => {
    expect(crossCheckAgainstKpis(derived, undefined)).toEqual([]);
    const partial = crossCheckAgainstKpis(derived, { Q_H_min_kW: 107.5 });
    expect(partial).toHaveLength(1);
    expect(partial[0]!.key).toBe("Q_H_min_kW");
  });
});

// ---- parseCandidateMatches + candidateFlag ----------------------------------

describe("parseCandidateMatches -- the engine's 8-column table, verbatim", () => {
  it("reads all six witness rows with their fields intact", () => {
    const rows = parseCandidateMatches(WITNESS_MATCHES_CSV);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      region: "abovePinch", hotStream: "coolerH1", coldStream: "heaterC1",
      temperatureFeasible: true,
      pinchRule: "pinch match: CP_hot <= CP_cold holds",
      maximumCandidateDuty_kW: 120,
      limitingReason: "approach dTmin binds at an exchanger end",
      recommendation: "thermodynamically admissible candidate",
    });
    expect(rows[5]!.maximumCandidateDuty_kW).toBe(135);
    expect(rows[2]!.recommendation)
      .toBe("thermodynamically admissible candidate (away from the pinch only)");
  });

  it("refuses a foreign header and skips a malformed row", () => {
    expect(parseCandidateMatches("a,b\nx,y\n")).toEqual([]);
    const withBadRow = WITNESS_MATCHES_CSV + "short,row\n";
    expect(parseCandidateMatches(withBadRow)).toHaveLength(6);
  });
});

describe("candidateFlag -- which rows the table visibly marks", () => {
  const rows = parseCandidateMatches(WITNESS_MATCHES_CSV);

  it("flags exactly the two VIOLATED pinch matches in the witness", () => {
    const flags = rows.map(candidateFlag);
    expect(flags).toEqual([
      null, null, "cpRuleViolated", "cpRuleViolated", null, null,
    ]);
  });

  it("flags a temperature-infeasible row, and infeasibility wins over the CP rule", () => {
    // Synthetic rows (the witness has no infeasible pair): the engine writes
    // temperatureFeasible "no" + "not admissible" for a pair with no feasible
    // approach at dTmin.
    const infeasible: CandidateMatch = {
      region: "abovePinch", hotStream: "hx1", coldStream: "hx2",
      temperatureFeasible: false,
      pinchRule: "not a pinch match (CP rule does not bind)",
      maximumCandidateDuty_kW: 0,
      limitingReason: "no feasible approach at dTmin",
      recommendation: "not admissible",
    };
    expect(candidateFlag(infeasible)).toBe("infeasible");
    expect(candidateFlag({
      ...infeasible,
      pinchRule: "pinch match: CP_hot <= CP_cold VIOLATED",
    })).toBe("infeasible");
  });
});

// ---- The standalone classroom witness: knobs vs the REAL bundled corpus -----
// No WASM here: what is verified is the KNOB MAP — every ScalarOverride the
// tool declares must resolve, uniquely, against the witness's own raw dict
// text exactly as the bundled corpus ships it.  applyScalarOverride throws on
// a missing or ambiguous key, so a plain successful call IS the uniqueness
// proof (no knob passes `occurrence`).

describe("the classroom knob map resolves against the bundled witness", () => {
  const entry = tutorialByName(PINCH_WITNESS);

  it("finds the witness in the bundled corpus, with raw text and knob files", () => {
    expect(entry).toBeDefined();
    expect(entry!.files.rawFiles).toBeDefined();
    for (const k of PINCH_KNOBS) {
      expect(entry!.files.rawFiles![k.file],
        `knob '${k.id}' names file '${k.file}'`).toBeDefined();
    }
  });

  it("every knob's override resolves uniquely in the real witness text", () => {
    const raw = entry!.files.rawFiles!;
    for (const k of PINCH_KNOBS) {
      // A distinctive probe value: the edit must land (text changes and the
      // probe appears), and the call not throwing proves the key is unique.
      const probe = 123.456;
      const edited = applyScalarOverride(raw[k.file]!,
        { file: k.file, key: k.key, value: probe });
      expect(edited).not.toBe(raw[k.file]);
      expect(edited).toContain(`${probe}`);
    }
  });

  it("each knob's declared default IS the witness's own number (byte-identical re-write)", () => {
    // Writing the default back must leave the file untouched: the override
    // keeps key, spacing, unit and comment tail, so only the number could
    // differ — and it must not.
    const raw = entry!.files.rawFiles!;
    for (const k of PINCH_KNOBS) {
      const rewritten = applyScalarOverride(raw[k.file]!,
        { file: k.file, key: k.key, value: k.value });
      expect(rewritten, `knob '${k.id}' default ${k.value} in ${k.file}`)
        .toBe(raw[k.file]);
    }
  });

  it("a bogus key throws instead of silently missing its dict", () => {
    const raw = entry!.files.rawFiles!;
    expect(() => applyScalarOverride(raw["system/postDict"]!,
      { file: "system/postDict", key: "noSuchKnob", value: 1 }))
      .toThrow(/not found/);
  });

  it("pinchOverrides maps values by id and falls back to the witness's own", () => {
    const overrides = pinchOverrides({ dTmin: 10 });
    expect(overrides).toHaveLength(PINCH_KNOBS.length);
    const dt = overrides.find((o) => o.file === "system/postDict")!;
    expect(dt).toEqual({ file: "system/postDict", key: "dTmin", value: 10 });
    // Untouched knobs carry the witness's own value.
    const h1T = overrides.find((o) => o.file === "0/h1In" && o.key === "T")!;
    expect(h1T.value).toBe(423.15);
    // No knob relies on `occurrence` — uniqueness per file is the contract.
    for (const o of overrides) expect(o).not.toHaveProperty("occurrence");
  });
});

// ---- The module-source word ban ---------------------------------------------

describe("the module source honours the pinch pass's wording doctrine", () => {
  it("never uses the banned superlative, in any casing", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)),
        "../src/ui/methods/PinchCompositeTool.tsx"),
      "utf8");
    // The banned word is assembled at runtime so it appears in NEITHER file:
    // every feasible match is a "thermodynamically admissible candidate".
    const banned = new RegExp("opt" + "imal", "i");
    expect(banned.test(src)).toBe(false);
    // And the CSV-path constants the tool reads are the worker's key shape.
    expect(src).toContain(COMPOSITE_CURVES_CSV_PATH);
    expect(src).toContain(CANDIDATE_MATCHES_CSV_PATH);
  });
});
