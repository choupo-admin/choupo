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
  relaxation.test -- the `relaxation` EduTool (DEV.md 4c C246).

  A lesson must not teach against its own code, so every number the lesson
  states is RECOMPUTED here from the tool's own math (relaxationMath), and
  the identity that links it to the Wegstein page (w = 1 - q) is held against
  the Wegstein page's own transcription (`wegsteinStep`).  Also held: the
  tool is registered and on the path, the engine half's dict overrides edit
  exactly what they claim, and every figure's module is drawn by the tool.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import refs from "../src/ui/methods/lessonReferences.json";
import { describe, expect, it } from "vitest";

import { applyDictOverride } from "../src/case/methodRun.js";
import { RELAXATION_LIMITS, RELAXATION_STEPS } from "../src/ui/methods/relaxationLesson.js";
import {
  ENGINE_QMAX, ENGINE_QMIN, GAIN_MAX, GAIN_MIN, INEXACT_TIGHT, OPEN_QMAX, OPEN_QMIN, W_MAX,
  converges, drive, effectiveSlope, inexactDrive, optimalW, passesToReduce, region,
  relaxationOverrides,
} from "../src/ui/methods/relaxationMath.js";
import { wegsteinStep } from "../src/ui/methods/wegsteinMath.js";
import { METHOD_PATHS, METHOD_TOOLS } from "../src/ui/methods/registry.js";

const GUI = join(__dirname, "..");
const REPO = join(GUI, "..");

describe("the toy: the relaxed slope is 1 - w + w a", () => {
  it("the relaxed iteration follows the closed form u_k = a_eff^k", () => {
    for (const [a, w] of [[0.7, 0.4], [-0.8, 0.9], [-1.5, 0.5], [0.2, 1]] as const) {
      const ae = effectiveSlope(a, w);
      const run = drive("relaxed", a, w, { maxIter: 12, tol: 0 });
      run.u.forEach((u, k) => {
        expect(u).toBeCloseTo(Math.pow(ae, k), 10);
      });
    }
  });

  it("w = 1 is direct substitution", () => {
    const d = drive("direct", -0.6, 1, { maxIter: 8 });
    const r = drive("relaxed", -0.6, 1, { maxIter: 8 });
    expect(r.u).toEqual(d.u);
  });

  it("a small w rescues a < -1; direct diverges on the same loop", () => {
    expect(drive("direct", -1.5, 1, { maxIter: 80 }).stop).toBe("diverged");
    expect(drive("relaxed", -1.5, 0.5).stop).toBe("converged");
    //  the bound of step 3: w < 2/(1 - a)
    expect(converges(-1.5, 2 / 2.5 - 1e-6)).toBe(true);
    expect(converges(-1.5, 2 / 2.5 + 1e-6)).toBe(false);
  });

  it("NO w in (0, 1] rescues a >= 1 (scanned)", () => {
    for (const a of [1, 1.2, 1.7, GAIN_MAX]) {
      for (let w = 0.01; w <= 1; w += 0.01) {
        expect(converges(a, w), `a=${a} w=${w}`).toBe(false);
        expect(effectiveSlope(a, w)).toBeGreaterThanOrEqual(1 - 1e-12);
      }
      expect(drive("relaxed", a, 0.3).stop).not.toBe("converged");
    }
  });

  it("w_opt = 1/(1 - a) makes the effective slope zero: one pass", () => {
    for (const a of [-2, -1, -0.3, 0, 0.5, 0.9]) {
      const wo = optimalW(a) as number;
      expect(wo).toBeCloseTo(1 / (1 - a), 12);
      expect(effectiveSlope(a, wo)).toBeCloseTo(0, 12);
      const run = drive("relaxed", a, wo, { maxIter: 3, tol: 1e-9 });
      expect(Math.abs(run.u[1] as number)).toBeLessThan(1e-12);
    }
    expect(optimalW(1)).toBeNull();
    expect(optimalW(1.5)).toBeNull();
    //  w_opt <= 1 exactly for a <= 0 (step 4's claim)
    expect(optimalW(0)).toBe(1);
    expect(optimalW(-1)).toBe(0.5);
    expect(optimalW(0.5) as number).toBeGreaterThan(1);
    expect(optimalW(0.5)).toBeLessThanOrEqual(W_MAX);
  });

  it("passesToReduce agrees with running the iteration", () => {
    const a = 0.8, w = 0.5;
    const n = passesToReduce(a, w) as number;
    const run = drive("relaxed", a, w, { maxIter: 200, tol: 0 });
    expect(Math.abs(run.u[n] as number)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(run.u[n - 1] as number)).toBeGreaterThan(1e-6);
    expect(passesToReduce(1.2, 0.5)).toBeNull();
    expect(passesToReduce(0.5, 2)).toBe(1);
  });

  it("the four regions partition the map", () => {
    expect(region(-1.5, 0.5)).toBe("converges");
    expect(region(-1.5, 1)).toBe("oscillates-out");
    expect(region(1.5, 0.5)).toBe("runaway");
    expect(region(GAIN_MIN, 1)).toBe("oscillates-out");
  });
});

describe("Wegstein is relaxation with w = 1 - q (step 5)", () => {
  it("the engine's update equals the relaxed update with w = 1 - q", () => {
    const x = 0.6, g = 0.25, q = -0.7;
    const w = 1 - q;
    const st = wegsteinStep([x], [g], { x: [1], gx: [0.2] }, q, q)[0] as { next: number };
    expect(st.next).toBeCloseTo((1 - w) * x + w * g, 14);
  });

  it("unclamped, the secant gives the optimal factor on a linear loop", () => {
    for (const a of [-1.5, -0.5, 0.3, 0.6]) {
      const run = drive("wegstein", a, 1, { qMin: -1e9, qMax: 1e9, maxIter: 6, tol: 1e-12 });
      //  pass 0 is direct (no history); pass 1 uses s = a, q = a/(a-1)
      expect(Math.abs(run.u[2] as number), `a=${a}`).toBeLessThan(1e-12);
      const q = a / (a - 1);
      expect(1 - q).toBeCloseTo(1 / (1 - a), 12);
    }
  });

  it("the engine clamp [-1, 0] keeps w in [1, 2]: no under-relaxation", () => {
    expect(ENGINE_QMIN).toBe(-1);
    expect(ENGINE_QMAX).toBe(0);
    //  on an oscillating loop (q = a/(a-1) > 0) the clamp forces q = 0:
    //  Wegstein IS direct substitution there
    const w1 = drive("wegstein", -1.5, 1, { qMin: ENGINE_QMIN, qMax: ENGINE_QMAX, maxIter: 6 });
    const d = drive("direct", -1.5, 1, { maxIter: 6 });
    expect(w1.u).toEqual(d.u);
    //  the open clamp lets it relax
    const open = drive("wegstein", -1.5, 1, { qMin: OPEN_QMIN, qMax: OPEN_QMAX, maxIter: 6, tol: 1e-12 });
    expect(open.stop).toBe("converged");
    //  q = -1 is a step twice the direct one: w = 2
    const x = 1, g = 0.4;
    const st = wegsteinStep([x], [g], { x: [2], gx: [0.7] }, -1, -1)[0] as { next: number };
    expect(st.next - x).toBeCloseTo(2 * (g - x), 14);
  });

  it("Newton lands in one pass on a linear loop, except a = 1", () => {
    for (const a of [-1.5, -0.2, 0.9, 1.7]) {
      const run = drive("newton", a, 1, { maxIter: 3, tol: 1e-12 });
      expect(Math.abs(run.u[1] as number)).toBeLessThan(1e-12);
    }
    const run = drive("newton", 1, 1, { maxIter: 4, tol: 1e-12 });
    expect(run.stop).not.toBe("converged");
  });
});

describe("the lesson", () => {
  it("has nine numbered steps and three limits, every formula derived", () => {
    expect(RELAXATION_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(RELAXATION_LIMITS.length).toBe(3);
    for (const s of RELAXATION_STEPS)
      if (s.formula) expect(s.derivation?.length ?? 0, `step ${s.n}`).toBeGreaterThan(0);
  });

  it("every symbol of a formula is glossed in that step or an earlier one", () => {
    //  the gate (check_lesson_symbols) is the authority; this holds the
    //  letters this page itself leans on
    const glossed = new Set<string>();
    for (const s of RELAXATION_STEPS) {
      for (const w of s.where ?? []) glossed.add(w.sym);
      if (s.n === 2) for (const sym of ["w", "a_{\\mathrm{eff}}", "a", "u", "G", "x"]) expect(glossed.has(sym), sym).toBe(true);
      if (s.n === 4) expect(glossed.has("w_{\\mathrm{opt}}")).toBe(true);
      if (s.n === 5) for (const sym of ["q", "s"]) expect(glossed.has(sym), sym).toBe(true);
    }
  });

  it("cites the original paper once and the engine's lines by file:line", () => {
    const all = JSON.stringify(RELAXATION_STEPS);
    expect(all).toContain("Wegstein");
    expect(all).toContain("Comm. ACM 1(6), 9-13");
    expect(all).toMatch(/Flowsheet\.cpp:\d+/);
    expect(all).toMatch(/Wegstein\.cpp:51-96/);
  });

  it("the steps name the same defaults the math module holds", () => {
    const step5 = JSON.stringify(RELAXATION_STEPS.find((s) => s.n === 5));
    expect(step5).toContain("-1 to 0");
    expect(ENGINE_QMIN).toBe(-1);
    expect(ENGINE_QMAX).toBe(0);
  });
});

describe("registry and path", () => {
  it("is a live construction beside wegstein on the numerics shelf", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "relaxation");
    expect(t).toBeTruthy();
    expect(t!.status).toBe("live");
    expect(t!.discipline).toBe("Flowsheeting & numerics");
    expect(t!.blurb.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(t!.theory).toBe("ch:relaxation");
    const tex = readFileSync(join(REPO, "docs", "theoryGuide.tex"), "utf8");
    expect(tex).toContain("\\label{ch:relaxation}");
  });

  it('"Recycle numerics" opens with relaxation, then wegstein', () => {
    const p = METHOD_PATHS.find((x) => x.id === "recycle-numerics");
    expect(p).toBeTruthy();
    expect(p!.steps[0]!.tool).toBe("relaxation");
    expect(p!.steps[1]!.tool).toBe("wegstein");
    const ids = p!.steps.map((s) => s.tool);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(METHOD_TOOLS.find((t) => t.id === id)?.status, id).toBe("live");
    }
  });
});

describe("the engine half's dict overrides", () => {
  const shipped = readFileSync(join(REPO, "tutorials", "steady", "flowsheets",
    "process03_recycle", "system", "solverDict"), "utf8");

  it("turn the shipped solver word and append the one new key, nothing else", () => {
    let text = shipped;
    for (const o of relaxationOverrides(0.3)) text = applyDictOverride(text, o);
    expect(text).toMatch(/^recycleSolver\s+directSubstitution;/m);
    expect(text).toMatch(/^recycleRelaxation 0\.3;$/m);
    expect(text).toContain("tearStreams");
    //  only those two lines differ
    const a = shipped.split("\n"), b = text.split("\n");
    const changed = b.filter((l) => !a.includes(l));
    expect(changed.length).toBe(2);
  });

  it("an append that would duplicate a live key refuses", () => {
    const once = applyDictOverride(shipped,
      { file: "system/solverDict", append: "recycleRelaxation 0.5;" });
    expect(() => applyDictOverride(once,
      { file: "system/solverDict", append: "recycleRelaxation 0.6;" }))
      .toThrow(/already declared/);
  });
});

describe("the figures are drawn by the tool", () => {
  const src = readFileSync(join(GUI, "src", "ui", "methods", "RelaxationTool.tsx"), "utf8");
  it("all four figures are present", () => {
    expect(src).toContain("<SlopeCobweb");
    expect(src).toContain("<ErrorPlot");
    expect(src).toContain("<GainMap");
    expect(src).toContain("useMethodRun");
    expect(src).toContain("ENGINE_W_VALUES");
  });
  it("the Wegstein page gains the same draggable slope", () => {
    const w = readFileSync(join(GUI, "src", "ui", "methods", "WegsteinTool.tsx"), "utf8");
    expect(w).toContain("<SlopeHandle");
  });
});

describe("step 8: inexact inner solves", () => {
  const card = RELAXATION_STEPS.find((s) => s.n === 8)!;
  const text = [card.body, card.note ?? "", ...(card.where ?? []).map((w) => w.means)].join("\n");
  const lines = (f: string) => readFileSync(join(REPO, f), "utf8").split("\n");

  it("cites the engine at lines that say what the card claims", () => {
    const CLAIMS: Record<string, string> = {
      "RateBasedSegment.cpp:701": "const scalar kInexactFactor = 1.0e-3;",
      "RateBasedSegment.cpp:702": "const scalar kInexactCap    = 1.0e-6;",
      "RateBasedSegment.cpp:776": "o.tolerance = std::min(kInexactCap, std::max(newtonTol, kInexactFactor * lastChange));",
      "RateBasedSegment.cpp:777": "const bool fullTol = (o.tolerance <= newtonTol);",
      "RateBasedSegment.cpp:828": "if (ch < 1.0e-10 && fullTol) break;",
      "NewtonND.cpp:163": "return std::sqrt(std::numeric_limits<scalar>::epsilon())",
      "NewtonND.cpp:769": "auto J = fdJacobian(F, x, Fx, rule, opts.parallel);",
      "Flowsheet.cpp:4129": "res = solver::newtonND(residual, x0, ndo);",
    };
    const HOME: Record<string, string> = {
      "RateBasedSegment.cpp": "src/unitOperations/distillation/RateBasedSegment.cpp",
      "NewtonND.cpp": "src/solver/NewtonND.cpp",
      "Flowsheet.cpp": "src/unitOperations/flowsheet/Flowsheet.cpp",
    };
    const cited = new Set([...text.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)/g)].map((m) => m[0]));
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, ln] = c.split(":") as [string, string];
      expect(lines(HOME[file]!)[Number(ln) - 1], c).toContain(want);
    }
  });

  it("the constants it quotes are the engine's", () => {
    const src = readFileSync(join(REPO, "src/unitOperations/distillation/RateBasedSegment.cpp"), "utf8");
    expect(src).toMatch(/kInexactFactor = 1\.0e-3/);
    expect(src).toMatch(/kInexactCap\s+= 1\.0e-6/);
    expect(src).toMatch(/newtonTol = 1\.0e-11/);
    expect(text).toContain("1e-3");
    expect(text).toContain("1e-6");
    expect(text).toContain("1e-11");
  });

  it("the dated measurement adds up and names where it is recorded", () => {
    const body = card.body;
    expect(321 + 407 + 378 + 526).toBe(1632);
    expect(239 + 309 + 278 + 390).toBe(1216);
    for (const n of ["1632", "1216", "ad528a8c48", "dated, not live"]) expect(body).toContain(n);
    for (const w of ["ratebased01_schulz_0p10bar", "ratebased04_schulz_delft_0p02bar"])
      expect(readFileSync(join(REPO, "tutorials/steady/distillation", w, "system/controlDict"), "utf8")).toContain("application");
  });

  it("states the absence in the tree's own terms: no inexact word in the recycle loop", () => {
    for (const f of ["src/unitOperations/flowsheet/Flowsheet.cpp", "src/solver/NewtonND.cpp"])
      expect(readFileSync(join(REPO, f), "utf8"), f).not.toMatch(/[Ii]nexact/);
  });

  it("lists both papers, each verified on Crossref", () => {
    const list = (refs as any).lessons.relaxation.references as any[];
    for (const doi of ["10.1137/0719025", "10.1137/0917003"]) {
      const r = list.find((x) => x.doi === doi);
      expect(r, doi).toBeTruthy();
      expect(r.verified.method).toBe("crossref");
    }
    expect(list.some((x) => String(x.url).endsWith("/fvsolution"))).toBe(true);
  });

  it("the toy: loosening the inside trades inner work for outer passes", () => {
    const exact = inexactDrive(0.5, 1, 0);
    const loose = inexactDrive(0.5, 1, 1e-3);
    expect(exact.stop).toBe("converged");
    expect(loose.stop).toBe("converged");
    expect(loose.inner).toBeLessThan(exact.inner);
    expect(loose.outer).toBeGreaterThanOrEqual(exact.outer);
    //  the run ends on a pass at the full tolerance
    expect(loose.tau[loose.tau.length - 1]).toBeLessThanOrEqual(INEXACT_TIGHT);
    //  tolerances start loose and never exceed the cap
    expect(Math.max(...loose.tau)).toBeLessThanOrEqual(1e-3);
    //  a divergent loop stays divergent
    expect(inexactDrive(1.5, 1, 1e-3).stop).not.toBe("converged");
  });
});
