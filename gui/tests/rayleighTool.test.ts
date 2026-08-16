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

import { describe, expect, it, vi } from "vitest";

// The tool's module graph reaches the Plotly bundle (browser-only: it needs
// `self`) through the plotting kit.  The logic under test never draws; mock
// the kit at its one seam so the pure functions load under node.
vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: {
    background: "#1f1f1f", grid: "#3b3b3b", axis: "#828282", text: "#c9c9c9",
    accent: "#26c6da", accent2: "#80deea", warm: "#ffb74d", warm2: "#ff8a65",
    series: ["#26c6da", "#ffb74d"],
  },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {} },
}));

import {
  RAYLEIGH_KNOBS,
  RAYLEIGH_WITNESS,
  WITNESS_LIGHT,
  buildConstruction,
  defaultKnobValues,
  detectRayleighStill,
  knobOverrides,
  potHistory,
  trapezoidAreaInView,
  type AreaPoint,
} from "../src/ui/methods/RayleighTool.js";
// The classroom feed's mechanics (textual override + witness clone) — pure
// functions; nothing here touches the WASM adapter (that would need a browser).
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";

// ---- Trajectory shapes ------------------------------------------------------
// The REAL still01 header shape (verbatim from the tutorial's trajectory.csv:
// "t,still.n_benzene,still.n_toluene,still.T" — one n_<comp> column per
// (unit, component) plus <unit>.T, written by choupoBatch's main.cpp).
const STILL01_COLUMNS = ["t", "still.n_benzene", "still.n_toluene", "still.T"];

// Three samples in the still01 shape: 1 mmol equimolar charge stripped to
// 0.1 mmol, the pot concentrating in toluene (benzene depletes).
const STILL01_VARS: { [c: string]: number[] } = {
  "still.n_benzene": [5.0e-4, 2.0e-4, 8.0e-6],
  "still.n_toluene": [5.0e-4, 4.0e-4, 9.2e-5],
  "still.T": [365.0, 367.6, 380.0],
};

describe("detectRayleighStill — the servability predicate", () => {
  it("activates on the still01 shape (binary pot, falling holdup)", () => {
    const a = detectRayleighStill(STILL01_COLUMNS, STILL01_VARS);
    expect(a.active).toBe(true);
    expect(a.unit).toBe("still");
    expect(a.components).toEqual(["benzene", "toluene"]);
    expect(a.moleColumns).toEqual(["still.n_benzene", "still.n_toluene"]);
    expect(a.tempColumn).toBe("still.T");
    expect(a.reason).toBeNull();
  });

  it("does NOT activate on a ternary pot — the classical construction is binary", () => {
    const cols = ["t", "pot.n_a", "pot.n_b", "pot.n_c", "pot.T"];
    const vars = {
      "pot.n_a": [1, 0.5], "pot.n_b": [1, 0.8], "pot.n_c": [1, 0.9],
    };
    const a = detectRayleighStill(cols, vars);
    expect(a.active).toBe(false);
    expect(a.reason).toContain("BINARY");
  });

  it("does NOT activate without series data — a falling holdup cannot be attested", () => {
    const a = detectRayleighStill(STILL01_COLUMNS, undefined);
    expect(a.active).toBe(false);
    expect(a.unit).toBeNull();
  });

  it("does NOT activate on a constant-holdup vessel (nothing is being distilled)", () => {
    const vars = {
      "still.n_benzene": [5.0e-4, 5.0e-4, 5.0e-4],
      "still.n_toluene": [5.0e-4, 5.0e-4, 5.0e-4],
    };
    const a = detectRayleighStill(STILL01_COLUMNS, vars);
    expect(a.active).toBe(false);
    expect(a.reason).toContain("does not fall");
  });

  it("does NOT activate on a receiver that GAINS holdup", () => {
    const cols = ["t", "receiver.n_benzene", "receiver.n_toluene"];
    const vars = {
      "receiver.n_benzene": [0.0e-4, 2.0e-4, 4.5e-4],
      "receiver.n_toluene": [1.0e-9, 0.5e-4, 4.0e-4],
    };
    expect(detectRayleighStill(cols, vars).active).toBe(false);
  });

  it("does NOT activate on a run with no pot columns at all", () => {
    const a = detectRayleighStill(["t", "unit.T", "unit.q_CO2"], {});
    expect(a.active).toBe(false);
    expect(a.reason).toContain("n_<comp>");
  });
});

describe("potHistory — display arithmetic on the engine's own mole columns", () => {
  it("sums W, forms x_light, and reads the light component off the depletion", () => {
    const a = detectRayleighStill(STILL01_COLUMNS, STILL01_VARS);
    const p = potHistory(STILL01_VARS, a)!;
    expect(p).not.toBeNull();
    // Benzene's pot fraction falls (0.5 → 0.08) — it is the light one.
    expect(p.light).toBe("benzene");
    expect(p.heavy).toBe("toluene");
    expect(p.W0).toBeCloseTo(1.0e-3, 12);
    expect(p.Wend).toBeCloseTo(1.0e-4, 12);
    expect(p.x0).toBeCloseTo(0.5, 12);
    expect(p.xEnd).toBeCloseTo(8.0e-6 / 1.0e-4, 12);
    // ln(W0/W) = ln(10): a logarithm of a ratio of two engine holdups.
    expect(p.lnW0overW).toBeCloseTo(Math.log(10), 12);
  });

  it("returns null on an inactive detection", () => {
    const a = detectRayleighStill(STILL01_COLUMNS, undefined);
    expect(potHistory(STILL01_VARS, a)).toBeNull();
  });
});

describe("trapezoidAreaInView — pure trapezoid arithmetic, pinned", () => {
  const PTS: AreaPoint[] = [
    { x: 0, f: 1 }, { x: 1, f: 3 }, { x: 2, f: 5 },
  ];

  it("full window over the 3-point fixture: (1+3)/2 + (3+5)/2 = 6", () => {
    expect(trapezoidAreaInView(PTS, 0, 2)).toBeCloseTo(6, 12);
  });

  it("sub-window with interpolated ends: [0.5, 1.5] → 3 exactly", () => {
    // f(0.5) = 2, f(1.5) = 4: 0.5·(2+3)/2 + 0.5·(3+4)/2 = 1.25 + 1.75.
    expect(trapezoidAreaInView(PTS, 0.5, 1.5)).toBeCloseTo(3, 12);
  });

  it("sorts internally — a shuffled fixture gives the same area", () => {
    const shuffled: AreaPoint[] = [PTS[2]!, PTS[0]!, PTS[1]!];
    expect(trapezoidAreaInView(shuffled, 0, 2)).toBeCloseTo(6, 12);
  });

  it("refuses a window the points do not cover (never a partial area)", () => {
    expect(trapezoidAreaInView(PTS, -1, 2)).toBeNull();
    expect(trapezoidAreaInView(PTS, 0, 2.5)).toBeNull();
  });

  it("refuses a degenerate or inverted window and non-finite bounds", () => {
    expect(trapezoidAreaInView(PTS, 1, 1)).toBeNull();
    expect(trapezoidAreaInView(PTS, 2, 0)).toBeNull();
    expect(trapezoidAreaInView(PTS, NaN, 1)).toBeNull();
  });

  it("drops non-finite points before integrating", () => {
    const withNaN: AreaPoint[] = [...PTS, { x: 1.5, f: NaN }];
    expect(trapezoidAreaInView(withNaN, 0, 2)).toBeCloseTo(6, 12);
  });
});

describe("buildConstruction — the authorized method geometry", () => {
  it("forms 1/(y−x) off the curve points and drops vanishing driving forces", () => {
    // A synthetic curve shaped like a binary VLE: y = x at both endpoints
    // (dropped — the integrand diverges), y > x inside.
    const curve = {
      pts: [
        { x: 0, y: 0 }, { x: 0.25, y: 0.45 }, { x: 0.5, y: 0.7 },
        { x: 0.75, y: 0.875 }, { x: 1, y: 1 },
      ],
    };
    const a = detectRayleighStill(STILL01_COLUMNS, STILL01_VARS);
    const pot = potHistory(STILL01_VARS, a)!;
    const con = buildConstruction(curve, pot);
    // Only the three interior points survive (endpoints have y − x = 0).
    expect(con.pts.map((p) => p.x)).toEqual([0.25, 0.5, 0.75]);
    expect(con.pts[0]!.f).toBeCloseTo(1 / 0.2, 12);
    expect(con.a).toBeCloseTo(pot.xEnd, 12);
    expect(con.b).toBeCloseTo(pot.x0, 12);
    // The window [0.08, 0.5] reaches below x = 0.25 — the surviving points do
    // not cover it, so the area is an honest null, never a partial number.
    expect(con.area).toBeNull();
    // A window the points DO cover integrates: [0.25, 0.5] on the same pts.
    const covered = trapezoidAreaInView(con.pts, 0.25, 0.5);
    expect(covered).toBeCloseTo(0.5 * (5 + 5) * 0.25, 12);
  });
});

// ---- The classroom witness + knob map, against the REAL bundled corpus ------
// The standalone (self-feeding) mode clones still01 and writes the knobs into
// its dicts.  These tests pin the whole knob→dict contract WITHOUT running the
// engine: every (file, key) must resolve uniquely in the witness's actual raw
// text (applyScalarOverride throws on missing/ambiguous — a knob that misses
// its dict would run the engine on the wrong question).

describe("the classroom witness — still01 bundled and knob-addressable", () => {
  it("is in the bundled corpus, a choupoBatch batchStill case with raw dicts", () => {
    const entry = tutorialByName(RAYLEIGH_WITNESS);
    expect(entry).toBeDefined();
    expect(entry!.category).toBe("batch");
    const raws = entry!.files.rawFiles;
    expect(raws).toBeDefined();
    expect(raws!["system/flowsheetDict"]).toContain("batchStill");
    expect(raws!["system/controlDict"]).toContain("choupoBatch");
    // The charge lives in 0/internalState (the batch holdup home) — the two
    // charge knobs write there.
    expect(raws!["0/internalState"]).toContain("totalMoles");
    // The witness's own declared chemistry, which the y*(x) sweep replicates
    // and the deviation chip's honesty rests on: ideal Raoult, declared.
    expect(raws!["constant/thermoPhysPropDict"]).toContain("activityModel ideal");
    // The light component the curve is read for is a witness component.
    expect(raws!["constant/thermoPhysPropDict"]).toContain(WITNESS_LIGHT);
  });

  it("every knob's ScalarOverride resolves against the real witness raw text", () => {
    const raws = tutorialByName(RAYLEIGH_WITNESS)!.files.rawFiles!;
    for (const k of RAYLEIGH_KNOBS) {
      const raw = raws[k.file];
      expect(raw, `knob '${k.id}' names missing file '${k.file}'`).toBeDefined();
      // Resolves (unique match) — throws on missing or ambiguous keys.
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

  it("the defaults ARE the witness's authored values, numerically pinned", () => {
    // Not byte-pinned: the dicts spell 365.0 / 1.0e-3 where JS would write
    // 365 / 0.001 — the CONTRACT is numeric identity of the authored value,
    // read back out of each knob's own dict line.
    const raws = tutorialByName(RAYLEIGH_WITNESS)!.files.rawFiles!;
    for (const k of RAYLEIGH_KNOBS) {
      const re = new RegExp(
        `^[ \\t]*${k.key}[ \\t]+([-+0-9.eE]+)[ \\t]*[A-Za-z/%0-9.^-]*[ \\t]*;`,
        "m");
      const m = re.exec(raws[k.file]!);
      expect(m, `knob '${k.id}' (${k.file}:${k.key}) not found`).not.toBeNull();
      expect(Number(m![1]), `default for knob '${k.id}' drifted from the dict`)
        .toBe(k.def);
    }
  });

  it("methodCase clones the witness with the full default knob set applied", () => {
    const files = methodCase(RAYLEIGH_WITNESS, knobOverrides(defaultKnobValues()));
    expect(files.controlDict["application"]).toBe("choupoBatch");
    // The clone still carries the raw dicts the adapter writes into MEMFS.
    expect(files.rawFiles?.["system/flowsheetDict"]).toContain("batchStill");
    expect(files.rawFiles?.["0/internalState"]).toContain("totalMoles");
  });

  it("a bogus key throws rather than silently running the wrong question", () => {
    expect(() => methodCase(RAYLEIGH_WITNESS,
      [{ file: "system/flowsheetDict", key: "noSuchKnob", value: 1 }]))
      .toThrow(/noSuchKnob/);
    // A bogus FILE is refused too — the other half of the same contract.
    expect(() => methodCase(RAYLEIGH_WITNESS,
      [{ file: "system/noSuchDict", key: "P", value: 1 }]))
      .toThrow(/noSuchDict/);
  });

  it("the composition block stays deliberately un-knobbed — the grammar cannot reach it", () => {
    // The recorded absence: x_0 is declared as a one-line inline block, which
    // the line-anchored `key value [unit];` grammar cannot address.  Pin that
    // the grammar indeed refuses it, so the day the dict layout changes this
    // recorded reason is re-examined rather than silently stale.
    const raws = tutorialByName(RAYLEIGH_WITNESS)!.files.rawFiles!;
    expect(raws["0/internalState"]).toContain("molarComposition");
    expect(() => applyScalarOverride(raws["0/internalState"]!,
      { file: "0/internalState", key: "benzene", value: 0.4 }))
      .toThrow(/benzene/);
  });

  it("knobOverrides drops non-finite values — never writes NaN into a dict", () => {
    const values = defaultKnobValues();
    values["P"] = NaN;
    const overrides = knobOverrides(values);
    expect(overrides.map((o) => o.key)).not.toContain("P");
    expect(overrides).toHaveLength(RAYLEIGH_KNOBS.length - 1);
    // The full default set covers every knob, P included.
    expect(knobOverrides(defaultKnobValues())).toHaveLength(RAYLEIGH_KNOBS.length);
  });
});
