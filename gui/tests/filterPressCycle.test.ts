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
  filterPressCycle -- "When do I open the press?" (C511), held to the engine.

  THE CLAIM HELD: the page's average-rate curve, built from the engine's own
  K_p and B and the wash law CakeFilter writes (lines 336-338, 371-373
  and 405 of CakeFilter.cpp), reproduces the engine's cycle time.  Two kinds of evidence:

    * the witness run of filter02_caco3_pressWashing in THIS tree
      (witnessOutputs.ts, log.choupoSolve): the page's cycle equals the
      engine's cycleTime_s, and w/f read from the run's own wash time is the
      0.1 / 0.25 the engine's source writes;
    * RECORDED runs, eighteen: the same case with `filtratePerCycle` and
      `cleaningTime` overwritten, run by hand with
          ./choupoSolve <scratch copy of the case>
      (volumes 1.5, 3.37, 5, 6, 8, 10 m3; dead times 5, 20 and 90 min), the
      kpi cycleTime_s of each.  The page's formula equals every one to 1e-9
      (measured 2e-12).  These stand for the six live dots on the page.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { REPO } from "./witnessOutputs.js";
import { witnessOutput } from "./witnessRead.js";
import { applyDictOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  averageRate, band, cycleTime, factsFromKpis, filtrationTime, optimum, pressesFor,
  quadratic, rateRatio, washTime, type PressFacts,
} from "../src/ui/methods/filterCycle.js";
import {
  AUTHORED_TCLEAN_MIN, AUTHORED_V_M3, DEAD_KNOB, FilterPressTool, PRESS_WITNESS, SWEEP_V,
  TABLE_X, sweepOverrides,
} from "../src/ui/methods/FilterPressTool.js";
import { PRESS_LIMITS, PRESS_QUIZ, PRESS_STEPS } from "../src/ui/methods/filterPressCycleLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const CASE = "tutorials/steady/solids/filter02_caco3_pressWashing";

/** The engine's `press` kpi block, from the witness run's result block. */
function witnessKpis(): { [k: string]: number } {
  const log = witnessOutput(CASE, "log.choupoSolve");
  const m = /"press": (\{[^}]*\})/.exec(log);
  if (!m) throw new Error("no press kpi block in the witness log");
  return JSON.parse(m[1]!) as { [k: string]: number };
}

/** Recorded engine runs: [dead time min, V m3, cycleTime_s].  Command in the header. */
const RUNS: readonly (readonly [number, number, number])[] = [
  [5, 1.5, 410.01185168], [5, 3.37, 761.116167519], [5, 5, 1260.84978446],
  [5, 6, 1656.72612268], [5, 8, 2652.18518043], [5, 10, 3919.25274661],
  [20, 1.5, 1310.01185168], [20, 3.37, 1661.11616752], [20, 5, 2160.84978446],
  [20, 6, 2556.72612268], [20, 8, 3552.18518043], [20, 10, 4819.25274661],
  [90, 1.5, 5510.01185168], [90, 3.37, 5861.11616752], [90, 5, 6360.84978446],
  [90, 6, 6756.72612268], [90, 8, 7752.18518043], [90, 10, 9019.25274661],
];

const CLAIMS: Record<string, [string, number, number | undefined, string | RegExp]> = {
  "CakeFilter.cpp:336": ["src/unitOperations/solids/CakeFilter.cpp", 336, undefined, "mu * alpha * cS / (A * A * dp)"],
  "CakeFilter.cpp:337": ["src/unitOperations/solids/CakeFilter.cpp", 337, undefined, "mu * Rm / (A * dp)"],
  "CakeFilter.cpp:336-337": ["src/unitOperations/solids/CakeFilter.cpp", 336, 337, /mu \* alpha \* cS[\s\S]*mu \* Rm/],
  "CakeFilter.cpp:338": ["src/unitOperations/solids/CakeFilter.cpp", 338, undefined, "0.5 * Kp * Vcyc * Vcyc + B * Vcyc"],
  "CakeFilter.cpp:361": ["src/unitOperations/solids/CakeFilter.cpp", 361, undefined, /throughWashing"\) washFactor = 0\.25/],
  "CakeFilter.cpp:361-373": ["src/unitOperations/solids/CakeFilter.cpp", 361, 373, /washFactor = 0\.25[\s\S]*rateW = washFactor[\s\S]*tWash = VwCyc \/ rateW/],
  "CakeFilter.cpp:371-373": ["src/unitOperations/solids/CakeFilter.cpp", 371, 373, /rateW = washFactor \/ \(Kp \* Vcyc \+ B\)[\s\S]*VwCyc = QwVol \* Vcyc \/ Qf[\s\S]*tWash = VwCyc \/ rateW/],
  "CakeFilter.cpp:372": ["src/unitOperations/solids/CakeFilter.cpp", 372, undefined, "VwCyc = QwVol * Vcyc / Qf"],
  "CakeFilter.cpp:405": ["src/unitOperations/solids/CakeFilter.cpp", 405, undefined, "tc      = tFilt + tWash + tClean"],
  "CakeFilter.cpp:406": ["src/unitOperations/solids/CakeFilter.cpp", 406, undefined, "presses = Qf * tc / Vcyc"],
};

describe("the arithmetic", () => {
  const P: PressFacts = { Kp: 37.72, B: 16.01, washOverFactor: 0.4 };
  const argmax = (p: PressFacts, td: number): number => {
    let best = 0, bv = 0;
    for (let V = 0.01; V < 40; V += 0.001) {
      const r = averageRate(p, V, td);
      if (r > best) { best = r; bv = V; }
    }
    return bv;
  };

  it("V* from a V*^2 = t_d is the argmax of V / t_c, with and without washing", () => {
    for (const w of [0, 0.4]) for (const td of [300, 1200, 5400]) {
      const p = { ...P, washOverFactor: w };
      const o = optimum(p, td);
      expect(o.V).toBeCloseTo(argmax(p, td), 2);
      expect(o.quadraticTime).toBeCloseTo(td, 9);
      expect(o.rate).toBeCloseTo(averageRate(p, o.V, td), 12);
      expect(quadratic(p).a * o.V * o.V).toBeCloseTo(td, 9);
    }
  });
  it("the classical rule: no wash, the filtration time at V* is the dead time plus B V*", () => {
    const p = { ...P, washOverFactor: 0 };
    const o = optimum(p, 1200);
    expect(o.tFilt).toBeCloseTo(1200 + p.B * o.V, 9);
    const b0 = optimum({ Kp: 40, B: 0, washOverFactor: 0 }, 900);
    expect(b0.tFilt).toBeCloseTo(900, 9);
  });
  it("the rate relative to its maximum is the closed form, and is symmetric in x and 1/x", () => {
    const td = 1200, o = optimum(P, td);
    for (const x of TABLE_X) {
      const V = x * o.V;
      expect(averageRate(P, V, td) / o.rate).toBeCloseTo(rateRatio(o.beta, x), 12);
      expect(rateRatio(o.beta, x)).toBeCloseTo(rateRatio(o.beta, 1 / x), 12);
    }
    expect(rateRatio(o.beta, 1)).toBeCloseTo(1, 12);
    expect(rateRatio(o.beta, 2)).toBeLessThan(1);
  });
  it("the 95 % band's ends sit at 95 % of the maximum", () => {
    const td = 1200, o = optimum(P, td), b = band(P, td, 0.95);
    expect(averageRate(P, b.lo, td) / o.rate).toBeCloseTo(0.95, 9);
    expect(averageRate(P, b.hi, td) / o.rate).toBeCloseTo(0.95, 9);
    expect(b.lo).toBeLessThan(o.V);
    expect(b.hi).toBeGreaterThan(o.V);
  });
  it("the best volume goes as the square root of the dead time", () => {
    expect(optimum(P, 4 * 1200).V / optimum(P, 1200).V).toBeCloseTo(2, 12);
  });
  it("cycle = filtration + washing + dead time", () => {
    expect(cycleTime(P, 5, 1200)).toBeCloseTo(filtrationTime(P, 5) + washTime(P, 5) + 1200, 12);
  });
});

describe("the page equals the engine's own run of filter02 (witness, this tree)", () => {
  it("K_p, B, V, t_d and the wash factor come from the run's kpis; w/f is the source's 0.1 / 0.25", () => {
    const e = factsFromKpis(witnessKpis())!;
    expect(e).not.toBeNull();
    expect(e.facts.Kp).toBeCloseTo(37.7234, 3);
    expect(e.facts.B).toBeCloseTo(16.0105, 3);
    expect(e.V).toBe(AUTHORED_V_M3);
    expect(e.tDead).toBe(60 * AUTHORED_TCLEAN_MIN);
    expect(e.facts.washOverFactor).toBeCloseTo(0.1 / 0.25, 9);
  });
  it("the page's cycle, filtration and wash times equal the engine's at the case's own point", () => {
    const k = witnessKpis();
    const e = factsFromKpis(k)!;
    expect(cycleTime(e.facts, e.V, e.tDead)).toBeCloseTo(k["cycleTime_s"]!, 8);
    expect(filtrationTime(e.facts, e.V)).toBeCloseTo(k["filtrationTime_s"]!, 8);
    expect(washTime(e.facts, e.V)).toBeCloseTo(k["washTime_s"]!, 8);
    expect(pressesFor(e.Qf, e.V, k["cycleTime_s"]!)).toBeCloseTo(k["pressesRequired"]!, 10);
  });
  it("the coordinator's hand check, recomputed from the engine's constants", () => {
    const k = witnessKpis();
    const e = factsFromKpis(k)!;
    const o = optimum(e.facts, e.tDead);
    // best volume about 6 m3 per cycle; best rate about 8.4 m3/h; the case's own 7.3 m3/h
    expect(o.V).toBeCloseTo(5.945, 2);
    expect(3600 * o.rate).toBeCloseTo(8.4486, 3);
    expect(3600 * averageRate(e.facts, e.V, e.tDead)).toBeCloseTo(7.3035, 3);
    expect(averageRate(e.facts, e.V, e.tDead) / o.rate).toBeCloseTo(0.8645, 3);
    // without washing: the classical rule's best volume
    const nw = optimum({ ...e.facts, washOverFactor: 0 }, e.tDead);
    expect(nw.V).toBeCloseTo(7.976, 2);
  });
  it("the pinned filter02 golden agrees with the witness on the book anchors (1 %)", () => {
    const k = witnessKpis();
    const golden = readFileSync(join(REPO, CASE, "expected"), "utf-8");
    const row = (key: string): number =>
      Number(new RegExp(`^kpi\\s+press\\s+${key}\\s+(\\S+)`, "m").exec(golden)![1]);
    expect(Math.abs(k["Kp_s_m6"]! / row("Kp_s_m6") - 1)).toBeLessThan(0.01);
    expect(Math.abs(k["cycleTime_s"]! / row("cycleTime_s") - 1)).toBeLessThan(0.01);
  });
});

describe("the page equals eighteen recorded engine runs (the live dots)", () => {
  const e = factsFromKpis(witnessKpis())!;
  it("every recorded cycleTime_s equals the page's formula", () => {
    expect(RUNS.length).toBe(18);
    for (const [td, V, tc] of RUNS)
      expect(cycleTime(e.facts, V, 60 * td) / tc, `${td} min, ${V} m3`).toBeCloseTo(1, 9);
  });
  it("the page's sweep volumes are exactly the recorded volumes", () => {
    for (const V of SWEEP_V) expect(RUNS.some((r) => r[1] === V), `V=${V}`).toBe(true);
  });
});

describe("the bundled case and the overrides", () => {
  const raws = tutorialByName(PRESS_WITNESS)!.files.rawFiles!;
  const fs = raws["system/flowsheetDict"]!;
  it("the authored cycle and dead time are the constants of the page", () => {
    expect(Number(/filtratePerCycle\s+([0-9.]+)\s*m3;/.exec(fs)![1])).toBe(AUTHORED_V_M3);
    expect(Number(/cleaningTime\s+([0-9.]+)\s*min;/.exec(fs)![1])).toBe(AUTHORED_TCLEAN_MIN);
    expect(DEAD_KNOB.def).toBe(AUTHORED_TCLEAN_MIN);
  });
  it("every sweep override resolves on the real flowsheetDict, in the declared units", () => {
    for (const set of sweepOverrides(35)) {
      let text = fs;
      for (const o of set) text = applyDictOverride(text, o);
      expect(text).toMatch(/cleaningTime\s+35\s*min;/);
      expect(text).toMatch(/filtratePerCycle\s+[0-9.]+\s*m3;/);
    }
    expect(sweepOverrides(35).length).toBe(SWEEP_V.length);
  });
  it("the page's dead-time box holds the recorded dead times", () => {
    for (const td of [5, 20, 90]) {
      expect(td).toBeGreaterThanOrEqual(DEAD_KNOB.min);
      expect(td).toBeLessThanOrEqual(DEAD_KNOB.max);
    }
  });
  it("every engine line the page cites says what the page claims for it", () => {
    const text = [
      "src/ui/methods/filterPressCycleLesson.ts", "src/ui/methods/FilterPressTool.tsx",
      "src/ui/methods/filterCycle.ts",
    ].map((f) => readFileSync(join(REPO, "gui", f), "utf-8")).join("\n");
    const cited = new Set([...text.matchAll(/CakeFilter\.cpp:\d+(?:-\d+)?/g)].map((m) => m[0]));
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const c of Object.keys(CLAIMS)) expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
    const src = readFileSync(join(REPO, "src/unitOperations/solids/CakeFilter.cpp"), "utf-8").split("\n");
    for (const [c, [rel, a, b, want]] of Object.entries(CLAIMS)) {
      expect(rel, c).toBe("src/unitOperations/solids/CakeFilter.cpp");
      const t = src.slice(a - 1, b ?? a).join("\n");
      if (typeof want === "string") expect(t, c).toContain(want);
      else expect(t, c).toMatch(want);
    }
  });
});

describe("the page", () => {
  const html = (c: () => JSX.Element): string =>
    renderToStaticMarkup(createElement(MantineProvider, null, createElement(c)));

  it("is registered on the Separations shelf, live, with its theory anchor", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "filter-press-cycle")!;
    expect(t.label).toBe("When do I open the press?");
    expect(t.discipline).toBe("Separations & phase equilibria");
    expect(t.status).toBe("live");
    expect(t.theory).toBe("sec:cakeFilter-batchPress");
  });
  it("renders its five steps, the card, the quiz and the limits", () => {
    const h = html(FilterPressTool);
    expect(h).toContain("When do I open the press?");
    expect(h).toContain("data-card=\"cycle\"");
    expect(h).toContain("What this does not show");
    for (const s of PRESS_STEPS) expect(h).toContain(s.title);
    expect(PRESS_STEPS.length).toBe(5);
    expect(PRESS_LIMITS.length).toBeGreaterThanOrEqual(5);
    expect(PRESS_QUIZ.length).toBeGreaterThanOrEqual(4);
  });
});
