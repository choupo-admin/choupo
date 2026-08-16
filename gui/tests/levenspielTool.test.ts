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
// `self`) through RayleighTool's plotting imports.  The logic under test
// never draws; mock the kit at its one seam so the pure functions load under
// node.
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

import type { UnitProfile } from "../src/adapters/SolverAdapter.js";
import {
  CSTR_WITNESS,
  LEVENSPIEL_KNOBS,
  PFR_WITNESS,
  WITNESS_LIMITING,
  cstrRectangle,
  defaultKnobValues,
  feedLimitingFlow,
  findCstrFeeds,
  findPfrFeeds,
  invRateCurve,
  knobOverridesFor,
  pfrInletLimitingFlow,
  trapezoidAreaInView,
  type KpiMap,
} from "../src/ui/methods/LevenspielTool.js";
// The classroom feed's mechanics (textual override + witness clone) — pure
// functions; nothing here touches the WASM adapter (that would need a browser).
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";

// ---- The witnesses: bundled, choupoSolve, and TWINS -------------------------
// The whole comparability claim (one chart, the same-X punchline) rests on
// pfr01 and cstr01 sharing feed, kinetics and thermo.  Pin it against the
// real bundled raw text, byte for byte — the tool's provenance line and the
// punchline tooltip both cite this test.

describe("the classroom witnesses — bundled, choupoSolve, twins", () => {
  it("both witnesses are in the bundled corpus with raw dicts", () => {
    for (const w of [PFR_WITNESS, CSTR_WITNESS]) {
      const entry = tutorialByName(w);
      expect(entry, `witness '${w}' missing from the bundled corpus`)
        .toBeDefined();
      expect(entry!.category).toBe("steady");
      expect(entry!.subclass).toBe("reactors");
      expect(entry!.files.rawFiles).toBeDefined();
      expect(entry!.files.rawFiles!["system/controlDict"])
        .toContain("choupoSolve");
    }
    expect(tutorialByName(PFR_WITNESS)!.files.rawFiles!["system/flowsheetDict"])
      .toContain("pfr");
    expect(tutorialByName(CSTR_WITNESS)!.files.rawFiles!["system/flowsheetDict"])
      .toContain("cstr");
  });

  it("they are TWINS: byte-identical 0/feed, reactions and thermo", () => {
    const pfr = tutorialByName(PFR_WITNESS)!.files.rawFiles!;
    const cstr = tutorialByName(CSTR_WITNESS)!.files.rawFiles!;
    for (const f of ["0/feed", "constant/reactions",
      "constant/thermoPhysPropDict"]) {
      expect(pfr[f], `'${f}' missing from pfr01`).toBeDefined();
      expect(cstr[f], `'${f}' missing from cstr01`).toBeDefined();
      expect(pfr[f], `'${f}' differs between the twins — the one-chart `
        + "comparability claim no longer holds").toBe(cstr[f]);
    }
  });

  it(`their shared reaction declares limitingReactant ${WITNESS_LIMITING}`, () => {
    const reactions = tutorialByName(PFR_WITNESS)!
      .files.rawFiles!["constant/reactions"]!;
    expect(reactions).toMatch(
      new RegExp(`limitingReactant\\s+${WITNESS_LIMITING}\\s*;`));
  });
});

// ---- The knob→dict map, against the REAL bundled raw text -------------------
// Every (witness, file, key) must resolve UNIQUELY in the witness's actual
// raw text — applyScalarOverride throws on missing/ambiguous, because a knob
// that misses its dict would run the engine on the wrong question.

describe("the knob map — every target resolves against the real raw text", () => {
  it("every knob's override resolves uniquely, the dict unit surviving", () => {
    for (const k of LEVENSPIEL_KNOBS) {
      expect(k.targets.length, `knob '${k.id}' has no targets`)
        .toBeGreaterThan(0);
      for (const t of k.targets) {
        const raws = tutorialByName(t.witness)!.files.rawFiles!;
        const raw = raws[t.file];
        expect(raw, `knob '${k.id}' names missing file '${t.file}' in `
          + `'${t.witness}'`).toBeDefined();
        // Resolves (unique match) — throws on missing or ambiguous keys.
        const out = applyScalarOverride(raw!,
          { file: t.file, key: k.key, value: 123.456 });
        expect(out).not.toBe(raw);
        // The number landed on the knob's own line, with the dict's declared
        // unit word surviving the override untouched.
        const line = new RegExp(
          `^[ \\t]*${k.key}[ \\t]+123\\.456[ \\t]*`
          + k.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*;", "m");
        expect(out, `knob '${k.id}' (${t.witness} ${t.file}:${k.key})`)
          .toMatch(line);
      }
    }
  });

  it("the defaults ARE the witnesses' authored values — byte-neutral", () => {
    for (const k of LEVENSPIEL_KNOBS) {
      for (const t of k.targets) {
        const raw = tutorialByName(t.witness)!.files.rawFiles![t.file]!;
        const out = applyScalarOverride(raw,
          { file: t.file, key: k.key, value: k.def });
        expect(out, `default for knob '${k.id}' moved '${t.witness}'`)
          .toBe(raw);
      }
    }
  });

  it("methodCase clones BOTH witnesses with the full default knob set", () => {
    for (const w of [PFR_WITNESS, CSTR_WITNESS]) {
      const files = methodCase(w, knobOverridesFor(defaultKnobValues(), w));
      expect(files.controlDict["application"]).toBe("choupoSolve");
      expect(files.flowsheet).toBeDefined();
    }
  });

  it("a bogus key throws rather than silently running the wrong question", () => {
    expect(() => methodCase(PFR_WITNESS,
      [{ file: "system/flowsheetDict", key: "noSuchKnob", value: 1 }]))
      .toThrow(/noSuchKnob/);
    expect(() => methodCase(CSTR_WITNESS,
      [{ file: "system/noSuchDict", key: "T", value: 1 }]))
      .toThrow(/noSuchDict/);
  });

  it("RECORDED ABSENCE: the CSTR's V_R is out of the grammar's reach", () => {
    // cstr01 declares `operation   { V_R 0.005; }` INLINE on one line — the
    // line-anchored override grammar cannot address a key inside an inline
    // sub-dict.  This is WHY the V_R knob targets the PFR only; the day this
    // starts resolving (a dict reformat or a grammar extension), the absence
    // is no longer justified and this test says so.
    const raw = tutorialByName(CSTR_WITNESS)!
      .files.rawFiles!["system/flowsheetDict"]!;
    expect(raw).toContain("V_R");           // declared — just not addressable
    expect(() => applyScalarOverride(raw,
      { file: "system/flowsheetDict", key: "V_R", value: 0.01 }))
      .toThrow(/V_R/);
    const vrKnob = LEVENSPIEL_KNOBS.find((k) => k.id === "V_R")!;
    expect(vrKnob.targets.map((t) => t.witness)).toEqual([PFR_WITNESS]);
  });

  it("knobOverridesFor splits per witness and drops non-finite values", () => {
    const defaults = defaultKnobValues();
    // The PFR receives every knob; the CSTR all but V_R.
    expect(knobOverridesFor(defaults, PFR_WITNESS))
      .toHaveLength(LEVENSPIEL_KNOBS.length);
    expect(knobOverridesFor(defaults, CSTR_WITNESS))
      .toHaveLength(LEVENSPIEL_KNOBS.length - 1);
    expect(knobOverridesFor(defaults, CSTR_WITNESS).map((o) => o.key))
      .not.toContain("V_R");
    // A NaN knob is dropped — never written into a dict.
    const broken = { ...defaults, T: NaN };
    expect(knobOverridesFor(broken, PFR_WITNESS).map((o) => o.key))
      .not.toContain("T");
    expect(knobOverridesFor(broken, PFR_WITNESS))
      .toHaveLength(LEVENSPIEL_KNOBS.length - 1);
  });
});

// ---- Detection --------------------------------------------------------------

const pfrProfile = (over?: Partial<UnitProfile>): UnitProfile => ({
  unit: "reactor",
  xAxis: "V",
  columns: {
    V: [0, 0.001, 0.002],
    X: [0, 0.3, 0.5],
    F_ethanol: [0.1389, 0.0972, 0.0694],
    minus_r_ethanol: [27.8, 19.4, 13.9],
  },
  ...over,
});

describe("findPfrFeeds — a profile carrying X + minus_r_<comp>", () => {
  it("activates on the PFR profile shape and reads the limiting reactant", () => {
    const feeds = findPfrFeeds([pfrProfile()], { reactor: { V_R: 0.005 } });
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.unit).toBe("reactor");
    expect(feeds[0]!.limiting).toBe("ethanol");
    expect(feeds[0]!.kpis).toEqual({ V_R: 0.005 });
  });

  it("does NOT activate without the minus_r_ column", () => {
    const p = pfrProfile();
    delete p.columns["minus_r_ethanol"];
    expect(findPfrFeeds([p], undefined)).toHaveLength(0);
  });

  it("does NOT activate without the X column, or on length mismatch", () => {
    const noX = pfrProfile();
    delete noX.columns["X"];
    expect(findPfrFeeds([noX], undefined)).toHaveLength(0);
    const mismatched = pfrProfile({ columns: {
      V: [0, 1], X: [0, 0.1], minus_r_ethanol: [1] } });
    expect(findPfrFeeds([mismatched], undefined)).toHaveLength(0);
  });

  it("does NOT activate on a Merkel-shaped profile (different columns)", () => {
    const merkel: UnitProfile = {
      unit: "tower", xAxis: "T_K",
      columns: {
        T_K: [310, 318], h_operating_kJ_kg: [80, 100],
        h_saturation_kJ_kg: [110, 140],
      },
    };
    expect(findPfrFeeds([merkel], undefined)).toHaveLength(0);
  });
});

describe("findCstrFeeds — the KPI design triple", () => {
  const CSTR_KPIS: KpiMap = {
    reactor: {
      V_R: 0.005, X_limiting: 0.52590711876,
      minus_r_ethanol: 14.6, F_in_kmol_h: 1.0, tau_s: 300,
    },
  };

  it("activates on the CSTR KPI shape", () => {
    const feeds = findCstrFeeds(CSTR_KPIS);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.unit).toBe("reactor");
    expect(feeds[0]!.limiting).toBe("ethanol");
  });

  it("does NOT activate on a PFR-shaped KPI block (no minus_r_ KPI)", () => {
    // The single-reaction PFR publishes V_R + X_limiting KPIs but keeps its
    // rate in the PROFILE — the detectors must not claim each other's units.
    const kpis: KpiMap = {
      reactor: { V_R: 0.005, X_limiting: 0.667, Da_kTau: 1.1, tau_s: 307 },
    };
    expect(findCstrFeeds(kpis)).toHaveLength(0);
  });

  it("does NOT activate with X_limiting or V_R missing / non-finite", () => {
    expect(findCstrFeeds({ r: { minus_r_A: 10, V_R: 0.01 } }))
      .toHaveLength(0);
    expect(findCstrFeeds({ r: { minus_r_A: 10, X_limiting: 0.5 } }))
      .toHaveLength(0);
    expect(findCstrFeeds({ r: {
      minus_r_A: 10, X_limiting: NaN, V_R: 0.01 } })).toHaveLength(0);
    expect(findCstrFeeds(undefined)).toHaveLength(0);
  });
});

// ---- The 1/(−r) ordinate transform + the honest clipping --------------------

describe("invRateCurve — 1/y over engine points, exclusions REPORTED", () => {
  it("transforms positive rates and excludes nothing", () => {
    const c = invRateCurve([0, 0.2, 0.4], [10, 5, 2]);
    expect(c.pts).toEqual([
      { x: 0, f: 0.1 }, { x: 0.2, f: 0.2 }, { x: 0.4, f: 0.5 }]);
    expect(c.excludedCount).toBe(0);
    expect(c.xClip).toBeNull();
  });

  it("excludes points past equilibrium (−r ≤ 0) WITH the exclusion reported", () => {
    // A reversible law: rate falls through zero at the equilibrium
    // conversion and is negative past it.  The excluded points are COUNTED
    // and the asymptote's X is named — never silently dropped.
    const c = invRateCurve([0, 0.2, 0.4, 0.6, 0.8], [10, 5, 2, 0, -3]);
    expect(c.pts.map((p) => p.x)).toEqual([0, 0.2, 0.4]);
    expect(c.excludedCount).toBe(2);
    expect(c.xClip).toBe(0.6);
  });

  it("counts non-finite samples as excluded too", () => {
    const c = invRateCurve([0, 0.2, 0.4], [10, NaN, 2]);
    expect(c.pts.map((p) => p.x)).toEqual([0, 0.4]);
    expect(c.excludedCount).toBe(1);
    expect(c.xClip).toBe(0.2);
  });
});

// ---- The trapezoid + rectangle geometry, pinned on hand fixtures ------------

describe("trapezoidAreaInView — the integrator this tool depends on", () => {
  it("is exact for constant and linear integrands (pure arithmetic)", () => {
    expect(trapezoidAreaInView([{ x: 0, f: 2 }, { x: 1, f: 2 }], 0, 1))
      .toBeCloseTo(2, 12);
    expect(trapezoidAreaInView([{ x: 0, f: 0 }, { x: 1, f: 1 }], 0, 1))
      .toBeCloseTo(0.5, 12);
    // Sub-window with interpolated end ordinates: ∫ x dx over [0.25, 0.75].
    expect(trapezoidAreaInView(
      [{ x: 0, f: 0 }, { x: 1, f: 1 }], 0.25, 0.75)).toBeCloseTo(0.25, 12);
  });

  it("refuses a window the points do not cover (null, never a partial area)", () => {
    expect(trapezoidAreaInView([{ x: 0, f: 1 }, { x: 0.5, f: 1 }], 0, 0.8))
      .toBeNull();
    expect(trapezoidAreaInView([{ x: 0, f: 1 }], 0, 1)).toBeNull();
  });
});

describe("cstrRectangle — X_out·1/(−r_out) from published KPIs", () => {
  it("pins the rectangle arithmetic on a hand fixture", () => {
    const r = cstrRectangle(
      { X_limiting: 0.5, minus_r_A: 10, V_R: 0.01 }, "A");
    expect(r).not.toBeNull();
    expect(r!.invR).toBeCloseTo(0.1, 12);
    expect(r!.specificVolume).toBeCloseTo(0.05, 12);   // X/(−r) [m³·s/mol]
    expect(r!.V_R).toBe(0.01);
  });

  it("is null on missing keys or a non-positive rate — never a guess", () => {
    expect(cstrRectangle({ X_limiting: 0.5, V_R: 0.01 }, "A")).toBeNull();
    expect(cstrRectangle({ minus_r_A: 10, V_R: 0.01 }, "A")).toBeNull();
    expect(cstrRectangle(
      { X_limiting: 0.5, minus_r_A: 0, V_R: 0.01 }, "A")).toBeNull();
    expect(cstrRectangle(
      { X_limiting: 0.5, minus_r_A: -3, V_R: 0.01 }, "A")).toBeNull();
    expect(cstrRectangle(undefined, "A")).toBeNull();
  });

  it("closes the engine's design identity on a consistent fixture", () => {
    // Fixture built to satisfy V = F_lim,in·X/(−r) exactly: F_lim,in =
    // 0.2 mol/s, X = 0.5, −r = 10 mol/(m³·s) → V = 0.01 m³.  The chip's
    // check is this product of published numbers, nothing more.
    const rect = cstrRectangle(
      { X_limiting: 0.5, minus_r_A: 10, V_R: 0.01 }, "A")!;
    const F = feedLimitingFlow(
      [{ role: "feed", F: 4.0e-4, composition: { A: 0.5, B: 0.5 } }], "A");
    expect(F).toBeCloseTo(0.2, 12);                    // kmol/s·z·1000
    expect(F! * rect.specificVolume).toBeCloseTo(rect.V_R, 12);
  });
});

// ---- F_lim,in — from published numbers only ---------------------------------

describe("feedLimitingFlow — the unique feed stream or nothing", () => {
  it("is null with two candidate feed streams (ambiguity is not resolved)", () => {
    const two = [
      { role: "feed" as const, F: 1e-4, composition: { A: 0.5 } },
      { role: "feed" as const, F: 2e-4, composition: { A: 0.3 } },
    ];
    expect(feedLimitingFlow(two, "A")).toBeNull();
  });

  it("is null when no feed stream carries the limiting component", () => {
    expect(feedLimitingFlow(
      [{ role: "product", F: 1e-4, composition: { A: 0.5 } }], "A"))
      .toBeNull();
    expect(feedLimitingFlow(
      [{ role: "feed", F: 1e-4, composition: { B: 1 } }], "A")).toBeNull();
    expect(feedLimitingFlow(undefined, "A")).toBeNull();
  });
});

describe("pfrInletLimitingFlow — the profile's own inlet sample", () => {
  it("reads the first F_<limiting> sample off the profile", () => {
    expect(pfrInletLimitingFlow(pfrProfile(), "ethanol"))
      .toBeCloseTo(0.1389, 12);
  });

  it("is null when the profile has no F_<limiting> column", () => {
    const p = pfrProfile();
    delete p.columns["F_ethanol"];
    expect(pfrInletLimitingFlow(p, "ethanol")).toBeNull();
  });
});

// ---- The punchline arithmetic, composed from the pinned helpers -------------

describe("the same-X punchline — rectangle vs area for a rising 1/(−r)", () => {
  it("rectangle > area when 1/(−r) rises with X (positive-order kinetics)", () => {
    // f(x) = 1 + x on [0, 1] (a rising reciprocal rate).  Area to X = 0.5 is
    // 0.625; the rectangle at that X is 0.5·f(0.5) = 0.75 → ratio 1.2.
    const pts = [{ x: 0, f: 1 }, { x: 1, f: 2 }];
    const area = trapezoidAreaInView(pts, 0, 0.5);
    expect(area).toBeCloseTo(0.625, 12);
    const rect = cstrRectangle(
      { X_limiting: 0.5, minus_r_A: 1 / 1.5, V_R: 1 }, "A")!;
    expect(rect.specificVolume).toBeCloseTo(0.75, 12);
    expect(rect.specificVolume / area!).toBeCloseTo(1.2, 12);
    expect(rect.specificVolume / area!).toBeGreaterThan(1);
  });
});
