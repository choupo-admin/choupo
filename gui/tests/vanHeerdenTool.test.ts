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

// vanHeerdenTool -- the servability detector, the steady-state marker
// classifier, the axis helpers, and the classroom knob->override map
// (verified against the REAL bundled witness raw text).  Pure layers only:
// no DOM, no WASM run, and the tool imports no plotly seam (inline SVG), so
// no mock is needed here.
import { describe, expect, it } from "vitest";

import type { ProfileMarker, UnitProfile } from "../src/adapters/SolverAdapter.js";
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  G_COLUMN,
  PHI_COLUMN,
  REPORTED_SUFFIX,
  R_COLUMN,
  T_COLUMN,
  VAN_HEERDEN_KNOBS,
  VAN_HEERDEN_WITNESS,
  axisDomain,
  classifySteadyStates,
  defaultKnobValues,
  findVanHeerdenFeeds,
  ignitionSpan,
  interpolateAt,
  knobOverrides,
  reportedState,
  type KpiMap,
} from "../src/ui/methods/VanHeerdenTool.js";

// ---- The witness: bundled, choupoSolve, and the case this tool names -------

describe("the classroom witness — bundled and self-describing", () => {
  it("is in the bundled corpus with raw dicts, under steady/reactors", () => {
    const entry = tutorialByName(VAN_HEERDEN_WITNESS);
    expect(entry, `witness '${VAN_HEERDEN_WITNESS}' missing from the bundled `
      + "corpus").toBeDefined();
    expect(entry!.category).toBe("steady");
    expect(entry!.subclass).toBe("reactors");
    expect(entry!.files.rawFiles).toBeDefined();
    expect(entry!.files.rawFiles!["system/controlDict"])
      .toContain("choupoSolve");
  });

  it("declares a cstr running the ADIABATIC, non-isothermal path", () => {
    // The Van Heerden profile exists only on the non-isothermal branch: an
    // isothermal CSTR publishes no scan and no G/R columns at all.  If this
    // ever flips, the tool's whole feed disappears and this test says so
    // before the diagram silently empties.
    const fd = tutorialByName(VAN_HEERDEN_WITNESS)!
      .files.rawFiles!["system/flowsheetDict"]!;
    expect(fd).toMatch(/type\s+cstr\s*;/);
    expect(fd).toMatch(/thermalMode\s+adiabatic\s*;/);
  });

  it("the case header states the construction the tool draws", () => {
    // The tool quotes this header; the quote must stay a quote.
    const fd = tutorialByName(VAN_HEERDEN_WITNESS)!
      .files.rawFiles!["system/flowsheetDict"]!;
    expect(fd).toContain("A straight line can cut a sigmoid THREE");
    expect(fd).toContain(
      "the extinguished state, an unstable middle state, and the ignited state");
    expect(fd).toContain("Change T_guess");
  });
});

// ---- The knob map, against the REAL bundled raw text -----------------------
// Every (file, key) must resolve UNIQUELY in the witness's actual raw text --
// applyScalarOverride throws on missing/ambiguous, because a knob that misses
// its dict would run the engine on the wrong question.

describe("the knob map — every target resolves against the real raw text", () => {
  it("every knob resolves uniquely, the dict's unit word surviving", () => {
    const raws = tutorialByName(VAN_HEERDEN_WITNESS)!.files.rawFiles!;
    for (const k of VAN_HEERDEN_KNOBS) {
      const raw = raws[k.file];
      expect(raw, `knob '${k.id}' names missing file '${k.file}'`)
        .toBeDefined();
      const out = applyScalarOverride(raw!,
        { file: k.file, key: k.key, value: 123.456 });
      expect(out).not.toBe(raw);
      const line = new RegExp(
        `^[ \\t]*${k.key}[ \\t]+123\\.456[ \\t]*`
        + k.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*;", "m");
      expect(out, `knob '${k.id}' (${k.file}:${k.key})`).toMatch(line);
    }
  });

  it("the defaults ARE the witness's authored values — byte-neutral", () => {
    const raws = tutorialByName(VAN_HEERDEN_WITNESS)!.files.rawFiles!;
    for (const k of VAN_HEERDEN_KNOBS) {
      const raw = raws[k.file]!;
      const out = applyScalarOverride(raw,
        { file: k.file, key: k.key, value: k.def });
      expect(out, `default for knob '${k.id}' moved the witness`).toBe(raw);
    }
  });

  it("T_guess is a knob — the pedagogically decisive one", () => {
    // The case header's whole point: the SAME equipment and feed report a
    // different branch as T_guess moves.  If this knob ever leaves the map,
    // the tool stops teaching what its witness teaches.
    const k = VAN_HEERDEN_KNOBS.find((x) => x.id === "T_guess");
    expect(k, "the T_guess knob is gone").toBeDefined();
    expect(k!.file).toBe("system/flowsheetDict");
    expect(k!.key).toBe("T_guess");
    expect(k!.def).toBe(380);
    // Its range must reach past the outer roots (300.42 K and 405.90 K on
    // the authored case) or the branch cannot be switched from the panel.
    expect(k!.min).toBeLessThan(300.42);
    expect(k!.max).toBeGreaterThan(405.91);
  });

  it("methodCase clones the witness with the full default knob set", () => {
    const files = methodCase(
      VAN_HEERDEN_WITNESS, knobOverrides(defaultKnobValues()));
    expect(files.controlDict["application"]).toBe("choupoSolve");
    expect(files.flowsheet).toBeDefined();
  });

  it("a bogus key or file throws rather than running the wrong question", () => {
    expect(() => methodCase(VAN_HEERDEN_WITNESS,
      [{ file: "system/flowsheetDict", key: "noSuchKnob", value: 1 }]))
      .toThrow(/noSuchKnob/);
    expect(() => methodCase(VAN_HEERDEN_WITNESS,
      [{ file: "system/noSuchDict", key: "T_guess", value: 1 }]))
      .toThrow(/noSuchDict/);
  });

  it("knobOverrides drops non-finite values — never writes NaN into a dict", () => {
    const defaults = defaultKnobValues();
    expect(knobOverrides(defaults)).toHaveLength(VAN_HEERDEN_KNOBS.length);
    const broken = { ...defaults, T_guess: NaN };
    expect(knobOverrides(broken).map((o) => o.key)).not.toContain("T_guess");
    expect(knobOverrides(broken)).toHaveLength(VAN_HEERDEN_KNOBS.length - 1);
  });
});

// ---- RECORDED ABSENCES ------------------------------------------------------
// Each absent knob is pinned by its KIND, so a stated reason cannot rot into
// an accident (and so the day a reason stops holding, a test says so).

describe("recorded knob absences — each pinned by its kind", () => {
  const raws = () => tutorialByName(VAN_HEERDEN_WITNESS)!.files.rawFiles!;
  const ids = () => VAN_HEERDEN_KNOBS.map((k) => k.id);

  it("thermalMode: a WORD, unreachable by the numeric override grammar", () => {
    const fd = raws()["system/flowsheetDict"]!;
    expect(fd).toContain("thermalMode");                 // declared...
    expect(() => applyScalarOverride(fd,
      { file: "system/flowsheetDict", key: "thermalMode", value: 1 }))
      .toThrow(/thermalMode/);                           // ...but not a scalar
    expect(ids()).not.toContain("thermalMode");
  });

  it("P: addressable, but a placebo on a liquid-phase rate law", () => {
    // The absence here is a CHOICE, not a grammar miss — so the override
    // must resolve.  The day the witness turns vapour-phase, the reason is
    // gone and the knob should appear.
    const feed = raws()["0/feed"]!;
    const out = applyScalarOverride(feed,
      { file: "0/feed", key: "P", value: 200000 });
    expect(out).not.toBe(feed);
    expect(out).toMatch(/^P[ \t]+200000[ \t]*Pa[ \t]*;/m);
    expect(ids()).not.toContain("P");
  });

  it("Arrhenius A / Ea: addressable, deliberately not operating knobs", () => {
    const rx = raws()["constant/reactions"]!;
    for (const key of ["A", "Ea"]) {
      const out = applyScalarOverride(rx,
        { file: "constant/reactions", key, value: 42 });
      expect(out, `'${key}' no longer resolves — the absence would now be a `
        + "grammar miss, not a choice").not.toBe(rx);
    }
    // The witness's own stated calibration, which a silent A knob would break.
    expect(rx).toContain("retuned so k(350 K) matches cstr04");
    expect(ids()).not.toContain("A");
    expect(ids()).not.toContain("Ea");
  });

  it("V_R IS a knob here — cstr05 declares it on its own line, not inline", () => {
    // The Levenspiel tool records V_R as UNREACHABLE because cstr01 writes
    // `operation   { V_R 0.005; }` on ONE line, out of the line-anchored
    // grammar's reach.  cstr05 writes a multi-line operation block, so the
    // same key IS addressable here.  The difference was never the key; it
    // was the line — pinned so neither tool's note is read as contradicting
    // the other.
    const fd = raws()["system/flowsheetDict"]!;
    expect(fd).toMatch(/^[ \t]*V_R[ \t]+0\.005[ \t]*;/m);
    expect(ids()).toContain("V_R");
  });
});

// ---- Detection --------------------------------------------------------------

const vhProfile = (over?: Partial<UnitProfile>): UnitProfile => ({
  unit: "reactor",
  xAxis: T_COLUMN,
  columns: {
    [T_COLUMN]: [275, 300, 350, 400],
    [G_COLUMN]: [0.0003, 0.02, 3.1, 8.6],
    [R_COLUMN]: [-0.82, 0.0, 1.7, 3.4],
    [PHI_COLUMN]: [-0.8203, -0.02, -1.4, -5.2],
  },
  ...over,
});

describe("findVanHeerdenFeeds — the G/R column pair is the contract", () => {
  it("activates on the non-isothermal CSTR profile shape", () => {
    const feeds = findVanHeerdenFeeds([vhProfile()], { reactor: { steadyStates: 3 } });
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.unit).toBe("reactor");
    expect(feeds[0]!.kpis).toEqual({ steadyStates: 3 });
  });

  it("activates without a KPI row (the diagram still draws)", () => {
    const feeds = findVanHeerdenFeeds([vhProfile()], undefined);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.kpis).toBeUndefined();
  });

  it("NEGATIVE: an ISOTHERMAL CSTR run has no G/R columns — not servable", () => {
    // The isothermal path solves the extents at a fixed T and publishes no
    // temperature scan at all: no profile, only KPIs.  That run must never
    // light the tool up.
    const isothermalKpis: KpiMap = {
      reactor: {
        V_R: 0.005, X_limiting: 0.5259, minus_r_ethanol: 14.6,
        T: 350, tau_s: 310, Q_kW: 1.2,
      },
    };
    expect(findVanHeerdenFeeds(undefined, isothermalKpis)).toHaveLength(0);
    expect(findVanHeerdenFeeds([], isothermalKpis)).toHaveLength(0);
  });

  it("NEGATIVE: a PFR profile (V / X / rate columns) is not servable", () => {
    const pfr: UnitProfile = {
      unit: "reactor", xAxis: "V",
      columns: { V: [0, 0.005], X: [0, 0.6], minus_r_ethanol: [27.8, 13.9] },
    };
    expect(findVanHeerdenFeeds([pfr], undefined)).toHaveLength(0);
  });

  it("NEGATIVE: a Merkel profile shares the T_K axis but not the columns", () => {
    const merkel: UnitProfile = {
      unit: "tower", xAxis: T_COLUMN,
      columns: {
        [T_COLUMN]: [310, 318], h_operating_kJ_kg: [80, 100],
        h_saturation_kJ_kg: [110, 140],
      },
    };
    expect(findVanHeerdenFeeds([merkel], undefined)).toHaveLength(0);
  });

  it("NEGATIVE: half a pair, a length mismatch, or a one-point scan", () => {
    const noR = vhProfile();
    delete noR.columns[R_COLUMN];
    expect(findVanHeerdenFeeds([noR], undefined)).toHaveLength(0);

    const noG = vhProfile();
    delete noG.columns[G_COLUMN];
    expect(findVanHeerdenFeeds([noG], undefined)).toHaveLength(0);

    const mismatched = vhProfile({ columns: {
      [T_COLUMN]: [275, 300], [G_COLUMN]: [0.1, 0.2], [R_COLUMN]: [0.1] } });
    expect(findVanHeerdenFeeds([mismatched], undefined)).toHaveLength(0);

    const single = vhProfile({ columns: {
      [T_COLUMN]: [300], [G_COLUMN]: [1], [R_COLUMN]: [1] } });
    expect(findVanHeerdenFeeds([single], undefined)).toHaveLength(0);
  });

  it("phi is OPTIONAL — a profile without it still serves the pair", () => {
    const noPhi = vhProfile();
    delete noPhi.columns[PHI_COLUMN];
    expect(findVanHeerdenFeeds([noPhi], undefined)).toHaveLength(1);
  });
});

// ---- The marker classifier --------------------------------------------------
// The engine's own markers, as cstr05 publishes them (log.choupoSolve /
// result JSON):
//   [{x: 300.424863866, label: "steady state 1"},
//    {x: 345.540787649, label: "steady state 2"},
//    {x: 405.903598573, label: "steady state 3 (reported)"}]

const WITNESS_MARKERS: ProfileMarker[] = [
  { x: 300.424863866, label: "steady state 1" },
  { x: 345.540787649, label: "steady state 2" },
  { x: 405.903598573, label: "steady state 3 (reported)" },
];

describe("classifySteadyStates — ordering over engine numbers", () => {
  it("three roots: the MIDDLE one is flagged unstable", () => {
    const s = classifySteadyStates(WITNESS_MARKERS);
    expect(s.map((x) => x.T)).toEqual(
      [300.424863866, 345.540787649, 405.903598573]);
    expect(s.map((x) => x.unstable)).toEqual([false, true, false]);
    expect(s.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("the '(reported)' suffix is PARSED off the label, never guessed", () => {
    const s = classifySteadyStates(WITNESS_MARKERS);
    expect(s.map((x) => x.reported)).toEqual([false, false, true]);
    expect(reportedState(s)!.T).toBe(405.903598573);
    // The label survives verbatim — the tool never rewrites the engine's own
    // annotation.
    expect(s[2]!.label).toBe("steady state 3 (reported)");
    expect(REPORTED_SUFFIX).toBe(" (reported)");
  });

  it("the reported root is NOT assumed to be the hottest one", () => {
    // T_guess 300 on the same case: the engine reports the EXTINGUISHED
    // branch, and it says so on marker 1.  A classifier that guessed
    // "reported = last" would be wrong here and right on the default —
    // which is exactly how such a bug survives.
    const cold: ProfileMarker[] = [
      { x: 300.424863866, label: "steady state 1 (reported)" },
      { x: 345.540787649, label: "steady state 2" },
      { x: 405.903598573, label: "steady state 3" },
    ];
    const s = classifySteadyStates(cold);
    expect(reportedState(s)!.T).toBe(300.424863866);
    expect(s[1]!.unstable).toBe(true);        // the middle one, regardless
  });

  it("orders by TEMPERATURE, not by the order the markers arrived", () => {
    const shuffled = [WITNESS_MARKERS[2]!, WITNESS_MARKERS[0]!,
      WITNESS_MARKERS[1]!];
    const s = classifySteadyStates(shuffled);
    expect(s.map((x) => x.T)).toEqual(
      [300.424863866, 345.540787649, 405.903598573]);
    expect(s[1]!.unstable).toBe(true);
    expect(reportedState(s)!.T).toBe(405.903598573);
  });

  it("ONE root: no unstable claim at all", () => {
    const s = classifySteadyStates(
      [{ x: 312.5, label: "steady state 1 (reported)" }]);
    expect(s).toHaveLength(1);
    expect(s[0]!.unstable).toBe(false);
    expect(s.some((x) => x.unstable)).toBe(false);
    expect(reportedState(s)!.T).toBe(312.5);
  });

  it("TWO or FIVE roots: the middle-of-three rule does not apply", () => {
    const two = classifySteadyStates([
      { x: 300, label: "steady state 1 (reported)" },
      { x: 400, label: "steady state 2" }]);
    expect(two.some((x) => x.unstable)).toBe(false);

    const five = classifySteadyStates([310, 320, 330, 340, 350].map(
      (x, i) => ({ x, label: `steady state ${i + 1}` })));
    expect(five.some((x) => x.unstable)).toBe(false);
  });

  it("no markers, or none reported: honest emptiness, never a fallback", () => {
    expect(classifySteadyStates(undefined)).toEqual([]);
    expect(classifySteadyStates([])).toEqual([]);
    expect(reportedState([])).toBeNull();
    const none = classifySteadyStates([
      { x: 300, label: "steady state 1" }, { x: 400, label: "steady state 2" }]);
    expect(reportedState(none)).toBeNull();
  });

  it("drops a non-finite marker rather than inventing a root position", () => {
    const s = classifySteadyStates([
      { x: 300, label: "steady state 1" },
      { x: NaN, label: "steady state 2 (reported)" },
      { x: 400, label: "steady state 3" }]);
    expect(s).toHaveLength(2);
    // Two roots left → the middle-of-three rule no longer applies.
    expect(s.some((x) => x.unstable)).toBe(false);
  });

  it("a label that merely CONTAINS 'reported' is not the reported one", () => {
    const s = classifySteadyStates([
      { x: 300, label: "steady state 1 (reported) — historical" },
      { x: 400, label: "steady state 2 (reported)" }]);
    expect(s[0]!.reported).toBe(false);
    expect(reportedState(s)!.T).toBe(400);
  });
});

describe("ignitionSpan — the practical meaning of multiplicity", () => {
  it("is ignited minus extinguished on the witness's own roots", () => {
    const s = classifySteadyStates(WITNESS_MARKERS);
    expect(ignitionSpan(s)).toBeCloseTo(405.903598573 - 300.424863866, 9);
    expect(ignitionSpan(s)).toBeCloseTo(105.478734707, 9);
  });

  it("is null with fewer than two roots — a span of zero would read as data", () => {
    expect(ignitionSpan([])).toBeNull();
    expect(ignitionSpan(classifySteadyStates(
      [{ x: 312.5, label: "steady state 1 (reported)" }]))).toBeNull();
  });
});

// ---- Axis helpers -----------------------------------------------------------

describe("axisDomain — display scaling over finite values only", () => {
  it("pads the range of every series it is given", () => {
    const d = axisDomain([[0, 10], [-2, 4]], 0.1)!;
    expect(d.lo).toBeCloseTo(-2 - 1.2, 12);
    expect(d.hi).toBeCloseTo(10 + 1.2, 12);
  });

  it("skips non-finite samples and answers null when nothing is finite", () => {
    const d = axisDomain([[NaN, 1, 3, Infinity]], 0)!;
    expect(d).toEqual({ lo: 1, hi: 3 });
    expect(axisDomain([[NaN, Infinity]])).toBeNull();
    expect(axisDomain([])).toBeNull();
  });

  it("gives a flat series a band so the polyline has somewhere to sit", () => {
    expect(axisDomain([[5, 5, 5]])).toEqual({ lo: 4.5, hi: 5.5 });
  });
});

describe("interpolateAt — reads a published column, never finds a root", () => {
  it("is exact at the samples and linear between them", () => {
    const xs = [300, 350, 400];
    const ys = [0, 10, 30];
    expect(interpolateAt(xs, ys, 300)).toBeCloseTo(0, 12);
    expect(interpolateAt(xs, ys, 350)).toBeCloseTo(10, 12);
    expect(interpolateAt(xs, ys, 325)).toBeCloseTo(5, 12);
    expect(interpolateAt(xs, ys, 375)).toBeCloseTo(20, 12);
    expect(interpolateAt(xs, ys, 400)).toBeCloseTo(30, 12);
  });

  it("places the witness's reported root on the G curve", () => {
    // The engine's grid straddles the root; the dot is read off the engine's
    // own two neighbouring samples, and the root T is the engine's marker.
    const T = [405.0, 406.0];
    const G = [8.50, 8.60];
    const s = classifySteadyStates(WITNESS_MARKERS);
    const y = interpolateAt(T, G, reportedState(s)!.T)!;
    expect(y).toBeGreaterThan(8.5);
    expect(y).toBeLessThan(8.6);
    expect(y).toBeCloseTo(8.5 + 0.1 * (405.903598573 - 405.0), 12);
  });

  it("is null outside the sampled range, or on a degenerate input", () => {
    const xs = [300, 400];
    const ys = [1, 2];
    expect(interpolateAt(xs, ys, 299.9)).toBeNull();
    expect(interpolateAt(xs, ys, 400.1)).toBeNull();
    expect(interpolateAt(xs, ys, NaN)).toBeNull();
    expect(interpolateAt([300], [1], 300)).toBeNull();
    expect(interpolateAt([300, 400], [1, NaN], 350)).toBeNull();
  });
});
