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
  PINCH_CLASS_TEXT, grandCompositeFromTable, parseProblemTable, parseStreamTable,
  parseSummary, pinchFromEngine,
} from "../src/case/pinch.js";
import {
  CANDIDATE_MATCHES_CSV_PATH,
  COMPOSITE_CURVES_CSV_PATH,
  PINCH_KNOBS,
  PINCH_WITNESS,
  candidateFlag,
  parseCandidateMatches,
  parseCompositeCurves,
  pinchOverrides,
  populationScope,
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

// ---- The engine's worked cascade, summary and stream table (C234) -----------
// Verbatim from the witness run (reports/pinch/problemTable.csv, summary.csv,
// population.csv at dTmin 20 K).  The page draws these files; it computes none.

const WITNESS_TABLE_CSV = `interval,T_star_hi_K,T_star_lo_K,sumCP_hot_kW_K,sumCP_cold_kW_K,dH_kW,cascade_in_kW,cascade_out_kW,corrected_in_kW,corrected_out_kW,boundary_out,hot_streams,cold_streams
1,413.15,408.15,2,0,10,0,10,107.5,117.5,,coolerH1,
2,408.15,383.15,2,2.5,-12.5,10,-2.5,117.5,105,,coolerH1,heaterC1
3,383.15,353.15,2,5.5,-105,-2.5,-107.5,105,0,pinch,coolerH1,heaterC1;heaterC2
4,353.15,323.15,10,5.5,135,-107.5,27.5,0,135,,coolerH1;coolerH2,heaterC1;heaterC2
5,323.15,308.15,0,5.5,-82.5,27.5,-55,135,52.5,,,heaterC1;heaterC2
6,308.15,303.15,0,2.5,-12.5,-55,-67.5,52.5,40,bottom,,heaterC1
`;
const WITNESS_SUMMARY_CSV = `key,value
class,interiorPinch
n_pinches,1
pinch_T_star_K,353.15
H_pinch_kW,300
cold_curve_offset_kW,40
`;
const WITNESS_POP_CSV = `unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason
coolerH1,Q,segment,hot,423.15,333.15,-180,2,
coolerH2,Q,segment,hot,363.15,333.15,-240,8,
heaterC1,Q,segment,cold,293.15,398.15,262.5,2.5,
heaterC2,Q,segment,cold,298.15,373.15,225,3,
`;

describe("the engine's problem table is read, not recomputed", () => {
  const rows = parseProblemTable(WITNESS_TABLE_CSV);
  it("reads all six intervals with the engine's own columns", () => {
    expect(rows).toHaveLength(6);
    expect(rows[2]!.tag).toBe("pinch");
    expect(rows[2]!.corOut).toBe(0);
    expect(rows[5]!.corOut).toBe(40);       // Q_C,min, the golden's 40
    expect(rows[0]!.corIn).toBe(107.5);     // Q_H,min, the golden's 107.5
    expect(rows[2]!.coldStreams).toBe("heaterC1;heaterC2");
  });
  it("the grand composite IS the corrected cascade against T*, zero at the pinch", () => {
    const g = grandCompositeFromTable(rows);
    expect(g).toHaveLength(7);
    expect(g[0]).toEqual({ T: 413.15, H: 107.5 });
    expect(g.find((q) => Math.abs(q.T - 353.15) < 1e-9)!.H).toBe(0);
    for (const q of g) expect(q.H).toBeGreaterThanOrEqual(0);
  });
  it("refuses a foreign header", () => {
    expect(parseProblemTable("a,b\n1,2")).toEqual([]);
  });
});

describe("the engine's classification reaches the page as a word", () => {
  it("parses summary.csv", () => {
    const s = parseSummary(WITNESS_SUMMARY_CSV)!;
    expect(s.class).toBe("interiorPinch");
    expect(s.nPinches).toBe(1);
    expect(s.pinchStar).toEqual([353.15]);
    expect(s.Hpinch).toBe(300);
    expect(s.coldOffset).toBe(40);
  });
  it("a threshold summary carries no pinch heat flow", () => {
    const s = parseSummary("key,value\nclass,thresholdNoHotUtility\nn_pinches,0\npinch_T_star_K,\nH_pinch_kW,\ncold_curve_offset_kW,95454.3\n")!;
    expect(s.nPinches).toBe(0);
    expect(s.pinchStar).toEqual([]);
    expect(s.Hpinch).toBeNull();
  });
  it("every class the engine can publish has a sentence", () => {
    for (const w of ["interiorPinch", "severalPinches", "thresholdNoHotUtility",
                     "thresholdNoColdUtility", "thresholdNoUtility"]) {
      expect(PINCH_CLASS_TEXT[w], w).toBeTruthy();
    }
    expect(PINCH_CLASS_TEXT["thresholdNoColdUtility"]).toContain("no interior pinch");
  });
  it("the engine's pinch_exists decides; the top-of-range geometry does not", () => {
    const run = (k: object) => ({ status: "done", log: "", streams: [],
      kpis: { pinch: { Q_H_min_kW: 67.5, Q_C_min_kW: 0, T_pinch_K: 300, dTmin_K: 1,
        Q_heat_current_kW: 487.5, Q_cool_current_kW: 420, ...k } },
      csvFiles: { "reports/pinch/population.csv": WITNESS_POP_CSV,
        "reports/pinch/summary.csv": "key,value\nclass,thresholdNoColdUtility\nn_pinches,0\n" } }) as never;
    expect(pinchFromEngine(run({ pinch_exists: 0 }))!.pinchShift).toBeNull();
    expect(pinchFromEngine(run({ pinch_exists: 0 }))!.problemClass).toBe("thresholdNoColdUtility");
    expect(pinchFromEngine(run({ pinch_exists: 1 }))!.pinchShift).toBe(300);
  });
  it("the stream table keeps every role, with the engine's CP", () => {
    const r = parseStreamTable(WITNESS_POP_CSV);
    expect(r).toHaveLength(4);
    expect(r[1]!.CP).toBe(8);
    expect(r[0]!.Q_kW).toBe(-180);
  });
  it("the page source recomputes no cascade", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
      "../src/ui/methods/PinchCompositeTool.tsx"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/computePinchFromCurves|crossCheckAgainstKpis|interpolateH/);
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

//  C150 R16 (2026-10-25): the targets chip says what the targets are the
//  targets OF, from the engine's own population KPIs -- and says nothing
//  when a run predates them.
describe("populationScope words the engine's population, never computes it", () => {
  it("a complete population reads as such", () => {
    const s = populationScope({ segments: 4, duties_excluded: 0, Q_excluded_kW: 0 })!;
    expect(s.partial).toBe(false);
    expect(s.label).toContain("targets of the 4 extracted segments");
    expect(s.label).toContain("every boundary heat duty is in the population");
  });
  it("a partial population says NOT the plant's, with the excluded kW", () => {
    const s = populationScope({ segments: 2, duties_excluded: 1, Q_excluded_kW: 1.8795 })!;
    expect(s.partial).toBe(true);
    expect(s.label).toContain("not of the plant");
    expect(s.label).toContain("1 heat duty (1.88 kW)");
    expect(s.label).toContain("reports/pinch/population.csv");
  });
  it("claims nothing for a run without the KPIs", () => {
    expect(populationScope({ Q_H_min_kW: 1 })).toBeNull();
    expect(populationScope(undefined)).toBeNull();
  });
  it("the engine publishes the three KPIs the chip reads", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
      "../../src/postProcessing/PinchPass.cpp"), "utf-8");
    for (const k of ["segments", "duties_excluded", "Q_excluded_kW"])
      expect(src).toContain(`k["${k}"]`);
  });
});
