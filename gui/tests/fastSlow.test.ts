/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  fastSlow.test -- the `fast-and-slow` EduTool ("When the fast obeys the
  slow").

  WHAT IT HOLDS:
    * the registry entry, its shelf and the guided sequence it sits in;
    * every slider stop's override lands on a declared number of the bundled
      witness (a knob that missed its dict would run the wrong question);
    * on the ENGINE'S OWN trajectories (the six witnesses, run natively by
      the global setup), the page's curves and gaps at the default stops,
      the closed form drawn as a check beside them, and that the
      intermediate's gap IS the intermediate in transit;
    * the step count read from the reactor logs;
    * every `file:line` the lesson cites, held to the text it claims;
    * the page opens without starting a run.

  WHAT IT DOES NOT HOLD: the slider stops other than the default, which no
  test can run without the engine in the loop; they were run natively when
  the page was built and the design record (docs/design/fast-and-slow.md)
  holds that table.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import { methodCase } from "../src/case/methodRun.js";
import {
  CASE_ORDER, CASE_STUDIES, acceptedSteps, explicitStepsAtLeast, fastestRate, gapOf,
  linearGapMax, windowAt,
} from "../src/case/fastSlow.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import {
  FAST_SLOW_LIMITS, FAST_SLOW_PUZZLE, FAST_SLOW_STEPS, SIMPLE_LAWS, WINDOW_SENTENCE,
} from "../src/ui/methods/fastSlowLesson.js";
import { FAST_SLOW_TASK, FastSlowTool } from "../src/ui/methods/FastSlowTool.js";
import { METHOD_PATHS, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

function parseTrajectory(csv: string): TrajectoryData {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  head.slice(1).forEach((h, j) => { vars[h] = rows.map((r) => r[j + 1]!); });
  return { t: rows.map((r) => r[0]!), vars };
}
const traj = (w: string): TrajectoryData =>
  parseTrajectory(witnessOutput(`tutorials/${w}`, "trajectory.csv"));

describe("fast-and-slow: registry and sequence", () => {
  it("is live on the Modelling & scale-up shelf, anchored in the stiff-ODE chapter", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "fast-and-slow");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("Modelling & scale-up");
    expect(t?.theory).toBe("ch:stiff-ode");
    expect(t?.origins).toEqual(["engine", "page", "assumption"]);
  });
  it("sits between the question and one more instance in its guided sequence", () => {
    const p = METHOD_PATHS.find((x) => x.id === "fast-and-slow");
    expect(p?.steps.map((s) => s.tool)).toEqual(["correlation-simplicity", "fast-and-slow", "thiele"]);
  });
});

describe("fast-and-slow: the knobs land on declared numbers", () => {
  for (const id of CASE_ORDER) {
    const c = CASE_STUDIES[id];
    it(`${id}: every stop rewrites the full case and only it`, () => {
      expect(c.stops).toContain(c.defaultStop);
      for (const v of c.stops) {
        const cf = methodCase(c.full, c.fullOverrides(v));
        for (const o of c.fullOverrides(v)) {
          if (!("value" in o)) continue;
          expect(cf.rawFiles?.[o.file]).toContain(String(o.value));
        }
      }
      //  The default stop reproduces the shipped case: its overrides write
      //  back the numbers the case already declares.
      const base = methodCase(c.full, []);
      const atDefault = methodCase(c.full, c.fullOverrides(c.defaultStop));
      for (const o of c.fullOverrides(c.defaultStop)) {
        if (!("value" in o)) continue;
        const re = new RegExp(`^[ \\t]*${o.key}[ \\t]+([-+0-9.eE]+)`, "gm");
        const before = [...base.rawFiles![o.file]!.matchAll(re)].map((m) => Number(m[1]));
        const after = [...atDefault.rawFiles![o.file]!.matchAll(re)].map((m) => Number(m[1]));
        expect(after).toEqual(before);
      }
    });
  }
});

describe("fast-and-slow: on the engine's own trajectories", () => {
  const gapAt = (id: "tanks" | "equilibrium" | "intermediate") => {
    const c = CASE_STUDIES[id];
    const f = c.curveOf(traj(c.full), "full")!;
    const r = c.curveOf(traj(c.reduced), "reduced")!;
    return gapOf(f, r)!;
  };
  it("tanks: the gap is the lag, and the closed form agrees within the hand-off step", () => {
    const g = gapAt("tanks");
    expect(g.max).toBeCloseTo(0.04281, 4);
    expect(Math.abs(g.max - linearGapMax(0.05)) / linearGapMax(0.05)).toBeLessThan(0.01);
  });
  it("equilibrium: the gap is the first moment, 0.62 % of the charge", () => {
    expect(gapAt("equilibrium").max).toBeCloseTo(0.006226, 5);
  });
  it("intermediate: the gap is the closed form, and it IS the intermediate in transit", () => {
    const g = gapAt("intermediate");
    expect(g.max).toBeCloseTo(0.00952, 5);
    expect(Math.abs(g.max - linearGapMax(0.01)) / linearGapMax(0.01)).toBeLessThan(0.01);
    const t = traj("batch/reactor/batch32_fast_intermediate_full");
    const n0 = t.vars["reactor.n_compA"]![0]!;
    const iMax = Math.max(...t.vars["reactor.n_compB"]!) / n0;
    expect(Math.abs(iMax - g.max)).toBeLessThan(1e-6);
  });
  it("tanks and intermediate: the same equation gives the same gap at the same eps", () => {
    expect(linearGapMax(1)).toBeCloseTo(Math.exp(-1), 12);
    expect(linearGapMax(0.05)).toBeCloseTo(Math.pow(0.05, 1 / 0.95), 12);
  });
  it("two grids that differ are refused, never aligned by guess", () => {
    expect(gapOf({ t: [0, 1], y: [0, 1] }, { t: [0, 2], y: [0, 1] })).toBeNull();
  });
});

describe("fast-and-slow: the cost, counted", () => {
  const log = (w: string) => witnessOutput(`tutorials/batch/reactor/${w}`, "log.choupoBatch");
  it("counts the accepted steps the engine prints, at least one per written instant", () => {
    const full = acceptedSteps(log("batch30_fast_equilibrium_full"))!;
    const red = acceptedSteps(log("batch31_fast_equilibrium_reduced"))!;
    expect(red).toBeGreaterThanOrEqual(6000 / 20);
    expect(full).toBeGreaterThan(red);
  });
  it("counts nothing on a log with no step history", () => {
    expect(acceptedSteps("timeStepping: fixed\nTrajectory written\n")).toBeNull();
  });
  it("the explicit bound grows with the fast rate", () => {
    expect(explicitStepsAtLeast(fastestRate("intermediate", 10000), 5000))
      .toBeGreaterThan(100 * explicitStepsAtLeast(fastestRate("intermediate", 100), 5000) - 100);
    expect(fastestRate("tanks", 0.05)).toBeCloseTo(1 / 50, 12);
  });
  it("the window is the stops under the tolerance, its edge the largest eps inside", () => {
    const c = CASE_STUDIES.intermediate;
    const gaps = c.stops.map((v) => linearGapMax(c.epsOf(v)));
    const w = windowAt(c.stops, gaps, 0.02, c.epsOf);
    expect(w.edge).toBe(100);
    expect(windowAt(c.stops, c.stops.map(() => null), 0.02, c.epsOf).edge).toBeNull();
  });
});

describe("fast-and-slow: the lesson", () => {
  it("every equation parses", () => {
    for (const s of FAST_SLOW_STEPS) {
      if (s.formula) expect(texParses(s.formula), s.title).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), d.step).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), w.sym).toBe(true);
    }
  });
  it("cites the engine at lines that say what the lesson claims", () => {
    const FILES: Record<string, string> = {
      "DynamicDriver.cpp": "src/dynamicDriver/DynamicDriver.cpp",
      "FrictionFactorCorrelation.H": "src/unitOperations/hydraulics/friction/FrictionFactorCorrelation.H",
    };
    const all = [...SIMPLE_LAWS.flatMap((l) => [l.where, l.price]), WINDOW_SENTENCE,
      ...FAST_SLOW_STEPS.flatMap((s) => [s.body, s.note ?? ""])].join("\n");
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "DynamicDriver.cpp:778": "? \"SAME INSTANT: the receiving unit holds no\"",
      "DynamicDriver.cpp:820-823":
        /form a loop in which NO unit holds an inventory"\s*" \(all quasiSteady\) -- such a loop has no time constant and"\s*" is a steady recycle\.  Put a vessel \(e\.g\. dynamicCSTR\) on"\s*" the loop, or solve it with choupoSolve's tear machinery\."/,
      "FrictionFactorCorrelation.H:128": "virtual const std::string& validityWindow() const = 0;",
      "FrictionFactorCorrelation.H:133": "virtual const std::string& citation() const = 0;",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = tree(FILES[file]!).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const text = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
  it("quotes the 'window its OWN authors stated' comment the citation points beside", () => {
    expect(tree("src/unitOperations/hydraulics/friction/FrictionFactorCorrelation.H").split("\n")[126])
      .toContain("The window its OWN authors stated");
  });
  it("names the six cases it runs, and each exists in the tree", () => {
    for (const id of CASE_ORDER) {
      const c = CASE_STUDIES[id];
      for (const w of [c.full, c.reduced])
        expect(tree(`tutorials/${w}/system/controlDict`)).toContain("application");
    }
  });
  it("uses no dash made of hyphens in its own prose", () => {
    const prose = [FAST_SLOW_PUZZLE, FAST_SLOW_TASK, WINDOW_SENTENCE,
      ...FAST_SLOW_STEPS.flatMap((s) => [s.body, s.note ?? "", ...(s.derivation ?? []).map((d) => d.step)]),
      ...FAST_SLOW_LIMITS.map((l) => l.body),
      ...SIMPLE_LAWS.flatMap((l) => [l.law, l.slaved, l.price])];
    for (const p of prose) expect(p, p).not.toMatch(/ -- | - /);
  });
});

describe("fast-and-slow: the page", () => {
  it("opens on the puzzle and the task, with no run started", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(FastSlowTool)));
    expect(html).toContain("Why");
    expect(html).toContain("When the fast obeys the slow");
    expect(html).toContain("which variables can I stop");
    expect(html).toContain("So this is why correlations are simple");
    expect(html).not.toContain("the engine is running");
    for (const s of FAST_SLOW_STEPS) expect(html).toContain(s.title.slice(0, 18));
  });
});
