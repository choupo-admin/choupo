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
  fugShortcutTool -- the Fenske-Underwood-Gilliland EduTool's contract.

  FOUR THINGS ARE PINNED HERE, and the first is the one that matters most:

  1. THE VIEW EVALUATES NO CORRELATION.  `case/fugShortcut.ts` is read as
     SOURCE and must contain no `Math.log`, `Math.exp` or `Math.pow` -- the
     three calls a re-implementation of Fenske, Underwood or Gilliland cannot
     avoid.  A whitelist would be nicer than a blacklist, but these three are
     exactly what the settled "zero physics in TypeScript" rule forbids in this
     file, and a text check on the module that owns the numbers is cheap and
     unambiguous.  (The rounding this module DOES do -- a stage count to an
     integer, a knob to six decimals -- uses ceil/round/toFixed and is not
     arithmetic on a physical law.)

  2. EVERY OVERRIDE RESOLVES against the REAL bundled witness text.  Each knob
     writes the number of a declared dict scalar; `applyScalarOverride` throws
     on a missing or ambiguous key, so a tutorial edit that renames or
     duplicates one of these keys fails here rather than in a student's
     browser.

  3. THE DEFAULTS LEAVE THE WITNESS ALONE.  Opening the tool must reproduce the
     tutorial byte for byte, so the first thing a reader sees is the case as it
     is on disk -- and so the tutorial's own golden is the tool's opening
     answer.

  4. THE READERS AND THE LADDER LOOKUP behave on the ENGINE'S OWN published
     numbers, taken verbatim from native runs of the two witnesses (recorded in
     each fixture's comment, so a changed engine answer is visible as a changed
     fixture rather than a silently adjusted expectation).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { applyScalarOverride, type ScalarOverride } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import type { RunResult } from "../src/adapters/SolverAdapter.js";
import {
  FUG_KNOB_DEFAULTS, FUG_RIGOROUS_WITNESS, FUG_SHORTCUT_WITNESS,
  REFLUX_FACTOR_LADDER, feedStageFor, kirkbrideFraction, ladderCrossing,
  ladderRungs, readRigorousAnswer, readShortcutAnswer, rigorousOverrides,
  rigorousSeries, shortcutDivergences, shortcutOverrides, shortcutSeries,
  stageWindow,
} from "../src/case/fugShortcut.js";

const here = dirname(fileURLToPath(import.meta.url));

const rawOf = (witness: string): { [rel: string]: string } => {
  const entry = tutorialByName(witness);
  if (!entry?.files.rawFiles)
    throw new Error(`witness '${witness}' is not in the bundled corpus`);
  return entry.files.rawFiles;
};

// ---- 1. No correlation is evaluated in TypeScript ---------------------------

describe("zero physics in TypeScript", () => {
  it("case/fugShortcut.ts calls no log, exp or pow", () => {
    const src = readFileSync(
      resolve(here, "../src/case/fugShortcut.ts"), "utf8");
    // Strip the block comments first: the header EXPLAINS that these three are
    // banned, and a check that fires on its own explanation is a check nobody
    // can keep green honestly.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const banned of ["Math.log", "Math.exp", "Math.pow", "**"]) {
      expect(
        code.includes(banned),
        `fugShortcut.ts contains '${banned}' — Fenske, Underwood and Gilliland`
        + " belong to ShortcutColumn.cpp, and a second evaluation here would"
        + " stop being the engine's answer the day the engine's changes",
      ).toBe(false);
    }
  });
});

// ---- 2. Every override resolves against the real witness --------------------

describe("the knob -> dict-scalar maps resolve on the bundled witnesses", () => {
  it("both witnesses are in the bundled corpus", () => {
    expect(Object.keys(rawOf(FUG_SHORTCUT_WITNESS)).length).toBeGreaterThan(2);
    expect(Object.keys(rawOf(FUG_RIGOROUS_WITNESS)).length).toBeGreaterThan(2);
  });

  it("every shortcut override addresses a unique declared scalar", () => {
    const raw = rawOf(FUG_SHORTCUT_WITNESS);
    for (const o of shortcutOverrides(FUG_KNOB_DEFAULTS, 2.5)) {
      const body = raw[o.file];
      expect(body, `${o.file} missing from ${FUG_SHORTCUT_WITNESS}`).toBeDefined();
      // Throws on absent or ambiguous — that IS the assertion.
      expect(() => applyScalarOverride(body!, o as ScalarOverride)).not.toThrow();
    }
  });

  it("every rigorous override addresses a unique declared scalar", () => {
    const raw = rawOf(FUG_RIGOROUS_WITNESS);
    for (const o of rigorousOverrides(22, 11, 1.68248609289)) {
      const body = raw[o.file];
      expect(body, `${o.file} missing from ${FUG_RIGOROUS_WITNESS}`).toBeDefined();
      expect(() => applyScalarOverride(body!, o as ScalarOverride)).not.toThrow();
    }
  });

  it("the rigorous witness really is the simultaneous MESH column", () => {
    // The comparison is only worth drawing if the other side is rigorous; a
    // witness swapped for another shortcut would make the whole page a
    // tautology.
    const body = rawOf(FUG_RIGOROUS_WITNESS)["system/flowsheetDict"]!;
    expect(body).toMatch(/type\s+distillationColumn;/);
    expect(body).toMatch(/model\s+simultaneous;/);
    expect(body).not.toMatch(/shortcutColumn/);
  });

  it("the shortcut witness really is the FUG column", () => {
    const body = rawOf(FUG_SHORTCUT_WITNESS)["system/flowsheetDict"]!;
    expect(body).toMatch(/type\s+shortcutColumn;/);
  });

  it("the two witnesses declare the SAME feed and the SAME thermo", () => {
    // This is the comparability protocol's foundation, and it is the half that
    // is NOT enforced by any override: if the tutorials drift apart, the page
    // starts comparing two different separations while still looking right.
    const s = rawOf(FUG_SHORTCUT_WITNESS);
    const r = rawOf(FUG_RIGOROUS_WITNESS);
    const feed = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .match(/componentMolarFlows\s*\{([^}]*)\}/)?.[1]
      ?.trim().replace(/\s+/g, " ");
    expect(feed(s["0/feed"]!)).toBe("benzene 50 kmol/h; toluene 50 kmol/h;");
    expect(feed(r["0/feed"]!)).toBe(feed(s["0/feed"]!));
    const thermo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "")
      .trim().replace(/\s+/g, " ");
    expect(thermo(r["constant/thermoPhysPropDict"]!))
      .toBe(thermo(s["constant/thermoPhysPropDict"]!));
  });
});

// ---- 3. The defaults leave the tutorial byte-identical -----------------------

describe("the tool opens ON the tutorial", () => {
  it("the default knobs rewrite the shortcut witness to itself", () => {
    const body = rawOf(FUG_SHORTCUT_WITNESS)["system/flowsheetDict"]!;
    let out = body;
    for (const o of shortcutOverrides(
      FUG_KNOB_DEFAULTS, FUG_KNOB_DEFAULTS.refluxFactor))
      out = applyScalarOverride(out, o as ScalarOverride);
    expect(out).toBe(body);
  });

  it("the recovery tie writes 0.01 and not 0.010000000000000009", () => {
    // The float that would otherwise land in a tutorial dict.
    const [, hk] = shortcutOverrides({ ...FUG_KNOB_DEFAULTS, recoveryLK: 0.99 }, 1.3);
    expect((hk as ScalarOverride).value).toBe(0.01);
    const [, hk2] = shortcutOverrides({ ...FUG_KNOB_DEFAULTS, recoveryLK: 0.945 }, 1.3);
    expect((hk2 as ScalarOverride).value).toBe(0.055);
  });

  it("the shortcut series always contains the operating reflux, once", () => {
    const onLadder = shortcutSeries({ ...FUG_KNOB_DEFAULTS, refluxFactor: 1.3 });
    expect(onLadder.length).toBe(REFLUX_FACTOR_LADDER.length);
    const offLadder = shortcutSeries({ ...FUG_KNOB_DEFAULTS, refluxFactor: 1.37 });
    expect(offLadder.length).toBe(REFLUX_FACTOR_LADDER.length + 1);
    const factors = offLadder.map((p) =>
      (p.overrides[2] as ScalarOverride).value);
    expect(factors).toContain(1.37);
    // Sorted, so the plotted curve never doubles back on itself.
    expect([...factors].sort((a, b) => a - b)).toEqual(factors);
  });
});

// ---- 4. The readers, on the engine's own published numbers ------------------

/** shortcut01_benzene_toluene at its authored knobs, verbatim from a native
 *  `./choupoSolve -case tutorials/steady/distillation/shortcut01_benzene_toluene`
 *  (unit "column"), and identical to the case's own `expected` golden. */
const SHORTCUT_KPIS = {
  column: {
    B: 0.0138888888889, D: 0.0138888888889,
    N_min: 10.067785029, N_theoretical: 21.5880731317,
    R: 1.68248609289, R_min: 1.29422007145,
    alpha_LK_HK: 2.49137883567, feed_stage: 10.7940365659,
    theta: 1.42716041594, x_B_HK: 0.99, x_D_LK: 0.99,
  },
};

/** column02_simultaneous overridden to nStages 20 / feedStage 10 /
 *  refluxRatio 1.68248609289, verbatim from a native run (unit "column01"). */
const RIGOROUS_KPIS = {
  column01: {
    B: 0.0138888888889, D: 0.0138888888889,
    Q_condenser_kW: -1145.00154653, Q_reboiler_kW: 1163.69911916,
    R: 1.68248609289, T_bottom: 383.30445195, T_top: 353.764924534,
    feedStage: 10, iterations: 5, nFeeds: 1, nSideDraws: 0, nStages: 20,
    x_B_HK: 0.99005646737, x_D_LK: 0.990056467361,
  },
};

const run = (kpis: unknown): RunResult =>
  ({ status: "done", log: "", streams: [], convergence: [], kpis } as RunResult);

describe("readShortcutAnswer / readRigorousAnswer", () => {
  it("reads the shortcut column by its published KPIs, not by its name", () => {
    const a = readShortcutAnswer(run(SHORTCUT_KPIS));
    expect(a).toBeTruthy();
    expect(a!.unit).toBe("column");
    expect(a!.Nmin).toBeCloseTo(10.067785029, 9);
    expect(a!.Rmin).toBeCloseTo(1.29422007145, 9);
    expect(a!.N).toBeCloseTo(21.5880731317, 9);
    expect(a!.R).toBeCloseTo(1.68248609289, 9);
    expect(a!.theta).toBeCloseTo(1.42716041594, 9);
    expect(a!.alpha).toBeCloseTo(2.49137883567, 9);
  });

  it("a rigorous run is NOT read as a shortcut, and vice versa", () => {
    expect(readShortcutAnswer(run(RIGOROUS_KPIS))).toBeNull();
    expect(readRigorousAnswer(run(SHORTCUT_KPIS))).toBeNull();
  });

  it("reads the rigorous column's stage count and product purities", () => {
    const a = readRigorousAnswer(run(RIGOROUS_KPIS));
    expect(a).toBeTruthy();
    expect(a!.unit).toBe("column01");
    expect(a!.nStages).toBe(20);
    expect(a!.feedStage).toBe(10);
    expect(a!.xD_LK).toBeCloseTo(0.990056467361, 9);
    expect(a!.Qreboiler).toBeCloseTo(1163.69911916, 6);
  });

  it("a run with no columns, or no KPIs at all, reads as null", () => {
    expect(readShortcutAnswer(null)).toBeNull();
    expect(readRigorousAnswer(run({ heater: { Q: 12.5 } }))).toBeNull();
    expect(readShortcutAnswer(run(undefined))).toBeNull();
  });

  it("surfaces the engine's declaredApproximation record and nothing else", () => {
    const r = {
      ...run(SHORTCUT_KPIS),
      divergences: [
        { kind: "declaredApproximation", locus: "unit column",
          requested: "distillation separation",
          solved: "Fenske-Underwood-Gilliland shortcut", reason: "declared" },
        { kind: "substitution", locus: "unit x", requested: "a", solved: "b",
          reason: "c" },
      ],
    } as RunResult;
    const d = shortcutDivergences(r);
    expect(d.length).toBe(1);
    expect(d[0]!.kind).toBe("declaredApproximation");
  });
});

// ---- The Kirkbride carry, the ladder window and the crossing ----------------

describe("the rigorous ladder", () => {
  it("carries the feed by the shortcut's own Kirkbride fraction", () => {
    const a = readShortcutAnswer(run(SHORTCUT_KPIS))!;
    // 10.7940365659 / 21.5880731317 -- exactly the middle for this symmetric
    // split, which is a property of THIS case and not a general rule.
    expect(kirkbrideFraction(a)).toBeCloseTo(0.5, 9);
    expect(feedStageFor(20, kirkbrideFraction(a))).toBe(10);
    expect(feedStageFor(21, kirkbrideFraction(a))).toBe(11);
  });

  it("clamps the feed stage into the range the MESH solver accepts", () => {
    expect(feedStageFor(3, 0.5)).toBe(2);
    expect(feedStageFor(4, 0.99)).toBe(3);
    expect(feedStageFor(4, 0.01)).toBe(2);
    // A nonsense fraction falls back to the middle rather than to an edge.
    expect(feedStageFor(20, Number.NaN)).toBe(10);
  });

  it("brackets the shortcut's answer with whole stage counts", () => {
    const w = stageWindow(21.5880731317, 6, 4);
    expect(w[0]).toBe(16);                       // ceil(21.59) = 22, minus 6
    expect(w[w.length - 1]).toBe(26);
    expect(w.length).toBe(11);
    // Never below 3: the MESH solver needs a feed strictly inside the column.
    expect(stageWindow(4, 10, 2)).toEqual([3, 4, 5, 6]);
    expect(stageWindow(0, 6, 4)).toEqual([]);
  });

  it("poses one MESH solve per rung, each at the shortcut's own reflux", () => {
    const pts = rigorousSeries([19, 20, 21], 0.5, 1.68248609289);
    expect(pts.length).toBe(3);
    expect(pts[1]!.label).toBe("N = 20");
    const ov = pts[1]!.overrides as ScalarOverride[];
    expect(ov.map((o) => [o.key, o.value])).toEqual([
      ["nStages", 20], ["feedStage", 10], ["refluxRatio", 1.68248609289],
    ]);
  });

  /* The measured ladder: column02_simultaneous at refluxRatio 1.68248609289
     with feedStage = round(N/2), from native runs.  These are the numbers the
     browser reproduces, and the crossing they contain (N = 20 against the
     shortcut's 22) is the juxtaposition the tool was built for. */
  const MEASURED: { n: number; fs: number; xD: number }[] = [
    { n: 17, fs: 9, xD: 0.98122015354 },
    { n: 18, fs: 9, xD: 0.984867102479 },
    { n: 19, fs: 10, xD: 0.987472298403 },
    { n: 20, fs: 10, xD: 0.990056467361 },
    { n: 21, fs: 11, xD: 0.991807601166 },
    { n: 22, fs: 11, xD: 0.99359732027 },
  ];
  const measuredRuns = MEASURED.map((m) => run({
    column01: {
      nStages: m.n, feedStage: m.fs, R: 1.68248609289,
      x_D_LK: m.xD, x_B_HK: m.xD,
    },
  }));

  it("orders the rungs by stage count whatever order they finished in", () => {
    const shuffled = [measuredRuns[3]!, null, measuredRuns[0]!, measuredRuns[5]!];
    expect(ladderRungs(shuffled).map((r) => r.nStages)).toEqual([17, 20, 22]);
  });

  it("crosses 99 % at 20 stages where the shortcut asked for 22", () => {
    const rungs = ladderRungs(measuredRuns);
    const c = ladderCrossing(rungs, 0.99);
    expect(c.nStages).toBe(20);
    expect(c.aboveWindow).toBe(false);
    expect(c.belowWindow).toBe(false);
    // The shortcut's own answer, for the record this test exists to keep.
    expect(Math.ceil(21.5880731317)).toBe(22);
  });

  it("says the window MISSED rather than extrapolating past it", () => {
    const rungs = ladderRungs(measuredRuns);
    const high = ladderCrossing(rungs, 0.999);
    expect(high.nStages).toBeNull();
    expect(high.aboveWindow).toBe(true);
    const low = ladderCrossing(rungs, 0.95);
    expect(low.nStages).toBe(17);
    expect(low.belowWindow).toBe(true);
    const none = ladderCrossing([], 0.99);
    expect(none.nStages).toBeNull();
    expect(none.aboveWindow).toBe(false);
  });
});

// ---- The registry entry, and an anchor that is APT and not merely alive ----

describe("the registry entry and its Theory Guide anchor", () => {
  const entry = METHOD_TOOLS.find((m) => m.id === "fug");
  const tex = readFileSync(
    resolve(here, "../../docs/theoryGuide.tex"), "utf8");

  it("is a live construction", () => {
    expect(entry, "the fug tool must be in the registry").toBeTruthy();
    expect(entry!.kind).toBe("construction");
    expect(entry!.status).toBe("live");
    expect(entry!.theory).toBe("ch:fug");
  });

  /*  THE MENU ROW HAS A WIDTH BUDGET, and this entry spent it once.  A tool
      tab's MenuBar row leads with `Tool: <label>` and it is a wrapping Group,
      so a label wider than the row pushes `Help` onto a second line under the
      workspace, where it reads as COVERED rather than as clipped -- the exact
      failure MenuBar.tsx records from 2026-08-17, reproduced by checkGui at
      390x844 on this page with the first label ("Distillation shortcut
      (Fenske-Underwood-Gilliland)").

      This arm is a PROXY and is stated as one: the real budget is in pixels of
      13px Inter and only the browser harness can measure it.  What a character
      count can do is notice that this label has become the longest in the
      registry again, which is the condition that spent the budget; the honest
      check remains bin/checkGui.  */
  it("stays within the labels the menu row was measured for", () => {
    const others = METHOD_TOOLS
      .filter((m) => m.id !== "fug")
      .map((m) => m.label.length);
    expect(
      entry!.label.length,
      "the fug label is now the longest in the registry — the MenuBar row's"
      + " width budget was measured for the labels that existed, so re-run"
      + " bin/checkGui at 390x844 before accepting this",
    ).toBeLessThanOrEqual(Math.max(...others));
  });

  /*  APTNESS, not existence.  methodTheoryAnchors.test.ts checks that the
      label resolves; four tools already point at sections that exist and do
      not cover what they draw, and a fifth would make the anchor field
      decorative.  So this arm reads the SECTION the anchor opens and requires
      it to carry, in its own text, the three things the construction puts on
      screen -- the two derived limits, the fitted interpolation between them,
      and the limits of the whole method.  It is a text check and it cannot
      judge whether the prose is any good; what it can do is fail the day the
      anchor is pointed somewhere else, or the day the section it points at
      stops deriving what the drawing claims it derives.  */
  it("opens a section that derives what the tool draws", () => {
    const from = tex.indexOf("\\label{ch:fug}");
    expect(from, "theoryGuide.tex defines no \\label{ch:fug}")
      .toBeGreaterThan(-1);
    const to = tex.indexOf("\\label{ch:mesh}", from);
    expect(to, "ch:fug is not followed by ch:mesh — has the guide moved?")
      .toBeGreaterThan(from);
    const section = tex.slice(from, to);

    // The three steps, by name.
    for (const name of ["Fenske", "Underwood", "Gilliland", "Kirkbride"])
      expect(section, `ch:fug never names ${name}`).toContain(name);

    // The N(R) reading the tool's first pane IS: two asymptotes with the
    // interpolation between them, and the Molokanov form the engine evaluates.
    for (const claim of [
      "asymptote", "Molokanov", "R_{\\min}", "N_{\\min}",
      "\\label{eq:molokanov}", "\\label{eq:gilliland-coords}",
    ])
      expect(section, `ch:fug does not carry '${claim}'`).toContain(claim);

    // The limits the tool states on screen must be stated here too, or the
    // drawing and the derivation disagree about what the method claims.
    for (const limit of [
      "constant molar overflow", "not a design", "fit", "azeotrope",
      "declared approximation",
    ])
      expect(section.toLowerCase(), `ch:fug does not state the limit '${limit}'`)
        .toContain(limit.toLowerCase());

    // The comparison the tool exists to draw, with numbers.
    expect(section).toContain("\\label{sec:fug-vs-mesh}");
    expect(section).toContain("column02\\_simultaneous");
  });
});
