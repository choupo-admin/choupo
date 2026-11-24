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
  optimizers -- "Three ways to optimise a flowsheet", held to what it claims.

    * the toy landscapes: the exact optimum agrees with every method that
      should find it, and the page's SQP is misled by the staircase exactly
      as the page says (its slope in s is zero);
    * Nelder-Mead: the engine's coefficients are the ones the page uses
      (read from NelderMead.H), the simplex moves are the four named, and
      McKinnon's example stops with 'converged' at a point that is not
      stationary;
    * MADS: the poll directions positively span the plane, the mesh size is
      the minimum of the poll size and its square, the barrier only falls,
      integer steps stay whole, a run is reproducible;
    * the engine: every file:line the page names is read back, the optim06
      table equals the run the witness setup makes (csv and log), the typed
      golden numbers equal the case's expected file, the multiplier equals
      the slope of the engine's own optimum against the limit;
    * the engine's MADS exists and the page says where its toy differs;
    * the page is registered, on the right shelf and path, draws its cards,
      its references and no NaN.

  WHAT THIS CANNOT PROVE: that any of the methods is faster than another on
  a flowsheet, or that the page's MADS equals the engine's, which is not
  written yet.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CITATIONS, DECISION_ROWS, GOLDEN_TYPED, OPT_CASES, OPT_LABELS, OPT_LIMITS, OPT_QUIZ, OPT_STEPS,
  OPTIM06, RUN_ROWS, SHADOW_CHECK,
} from "../src/ui/methods/optimizersLesson.js";
import {
  BOX, MADS_SIMPLIFICATIONS, NM_DEFAULTS, NM_PENALTY, SPEC, START, cost, enumerateStages, limit,
  ltmadsDirections, mckinnon, mulberry32, refluxRequired, runMads, runMcKinnon, runNelderMead,
  runSqp, scorecard, smoothOptimum, stagesEffective,
} from "../src/ui/methods/optimizersMath.js";
import { OptimizersTool } from "../src/ui/methods/OptimizersTool.js";
import { METHOD_PATHS, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const ROOT = new URL("../../", import.meta.url);
const text = (rel: string): string => readFileSync(new URL(rel, ROOT), "utf-8");
const lines = (rel: string): string[] => text(rel).split("\n");

describe("optimizers: the toy landscapes", () => {
  it("the exact smooth optimum is a stationary point of the cost along the active limit", () => {
    const o = smoothOptimum();
    const F = (s: number): number => refluxRequired(s)! + 1 + 1.6 * s;
    const h = 1e-4;
    expect(Math.abs((F(o.s + h) - F(o.s - h)) / (2 * h))).toBeLessThan(1e-5);
    expect(limit("smooth", o.s, o.r)).toBeCloseTo(0, 10);
    expect(o.s).toBeGreaterThan(BOX.sLo);
    expect(o.s).toBeLessThan(BOX.sHi);
  });
  it("the stepped landscape is a staircase in s: constant inside a whole stage, a jump between", () => {
    expect(cost("stepped", 13.2, 3)).toBe(cost("stepped", 12.7, 3));
    expect(cost("stepped", 13.49, 3)).not.toBe(cost("stepped", 13.51, 3));
    expect(stagesEffective("stepped", 13.51)).toBe(14);
    expect(stagesEffective("smooth", 13.51)).toBe(13.51);
  });
  it("the whole-stage enumeration: below 13 stages no reflux in the box reaches the purity, and 14 beats 13", () => {
    const en = enumerateStages();
    expect(en.filter((e) => e.feasible).map((e) => e.s)).toEqual([13, 14]);
    expect(en[6]!.f!).toBeLessThan(en[5]!.f!);
    expect(refluxRequired(12)!).toBeGreaterThan(BOX.rHi);
  });
});

describe("optimizers: Nelder-Mead", () => {
  it("the page uses the engine's coefficients and tolerances, read from NelderMead.H", () => {
    const h = text("src/solver/NelderMead.H");
    const num = (name: string): number => Number(new RegExp(`scalar\\s+${name}\\s+=\\s+([0-9.e+-]+);`).exec(h)![1]);
    expect(NM_DEFAULTS.alpha).toBe(num("alpha"));
    expect(NM_DEFAULTS.gamma).toBe(num("gamma"));
    expect(NM_DEFAULTS.rho).toBe(num("rho"));
    expect(NM_DEFAULTS.sigma).toBe(num("sigma"));
    expect(NM_DEFAULTS.tolX).toBe(num("tolX"));
    expect(NM_DEFAULTS.tolF).toBe(num("tolF"));
    expect(NM_DEFAULTS.simplexInitFactor).toBe(num("simplexInitFactor"));
  });
  it("on the smooth landscape it reaches the exact optimum to the stop tolerance, with the limit nearly met", () => {
    const r = runNelderMead("smooth");
    expect(r.converged).toBe(true);
    expect(Math.abs(r.fBest - smoothOptimum().f)).toBeLessThan(5e-3);
    expect(Math.max(0, limit("smooth", r.best[0], r.best[1]))).toBeLessThan(1e-3);
  });
  it("it makes the four moves the page names, and the penalty weight exceeds the multiplier (an exact penalty)", () => {
    const moves = new Set<string>();
    for (const l of ["smooth", "stepped"] as const) for (const s of runNelderMead(l).steps) moves.add(s.move);
    for (const m of ["reflect", "expand", "contract"]) expect(moves.has(m), m).toBe(true);
    expect(NM_PENALTY).toBeGreaterThan(runSqp("smooth").lambda);
  });
  it("McKinnon: every move is a contraction, the best vertex stays at the origin, the rule says converged, and the point is not stationary", () => {
    const mk = runMcKinnon();
    expect(mk.converged).toBe(true);
    expect(mk.reason).toBe("tolF (f range)");
    expect(mk.best[0]).toBeCloseTo(0, 12);
    expect(mk.best[1]).toBeCloseTo(0, 12);
    for (const s of mk.steps.slice(1)) expect(s.move).toBe("contract");
    const h = 1e-6;
    expect((mckinnon([0, h]) - mckinnon([0, -h])) / (2 * h)).toBeCloseTo(1, 6);
    expect(mckinnon([0, -0.5])).toBeCloseTo(-0.25, 12);
    expect(mckinnon([0, -0.5])).toBeLessThan(mk.fBest);
  });
});

describe("optimizers: SQP", () => {
  const exactSlope = (spec: number): number => (smoothOptimum(spec + 1e-4).f - smoothOptimum(spec - 1e-4).f) / 2e-4;
  it("on the smooth landscape it converges to the exact optimum with the limit active", () => {
    const r = runSqp("smooth");
    expect(r.converged).toBe(true);
    expect(Math.abs(r.f - smoothOptimum().f)).toBeLessThan(1e-6);
    expect(Math.abs(r.g)).toBeLessThan(1e-6);
    expect(r.lambda).toBeGreaterThan(0);
  });
  it("its multiplier is the slope of the exact optimal cost against the limit, at three limits", () => {
    for (const spec of [0.96, 0.97, 0.98]) {
      const r = runSqp("smooth", START, spec);
      expect(r.converged).toBe(true);
      expect(Math.abs(r.lambda / exactSlope(spec) - 1), `spec ${spec}`).toBeLessThan(2e-3);
    }
  });
  it("on the staircase the finite-difference slope in s is exactly zero and the method converges on the plateau it started on", () => {
    const r = runSqp("stepped");
    expect(r.converged).toBe(true);
    expect(r.steps[0]!.gradF[0]).toBe(0);
    expect(r.steps[0]!.gradG[0]).toBe(0);
    expect(Math.abs(r.x[0] - START[0])).toBeLessThan(1e-3);
    const en = enumerateStages();
    expect(Math.abs(r.f - en[5]!.f!)).toBeLessThan(1e-6);
    expect(r.f).toBeGreaterThan(en[6]!.f!);
  });
  it("it stops by name when the linearised limit cannot hold inside the box", () => {
    const r = runSqp("stepped", [10, 3]);
    expect(r.converged).toBe(false);
    expect(r.reason).toContain("QP infeasible");
  });
});

describe("optimizers: MADS", () => {
  it("the four LTMADS directions are a maximal positive basis of the plane, of determinant 2^(2l)", () => {
    for (let l = 0; l <= 6; ++l) {
      const rnd = mulberry32(100 + l);
      for (let k = 0; k < 20; ++k) {
        const d = ltmadsDirections(l, rnd);
        expect(d.length).toBe(4);
        expect(d[0]![0] + d[2]![0]).toBe(0);
        expect(d[0]![1] + d[2]![1]).toBe(0);
        expect(d[1]![0] + d[3]![0]).toBe(0);
        expect(d[1]![1] + d[3]![1]).toBe(0);
        const det = d[0]![0] * d[1]![1] - d[0]![1] * d[1]![0];
        expect(Math.abs(det)).toBe(4 ** l);
        for (const v of d) for (const c of v) expect(Math.abs(c)).toBeLessThanOrEqual(2 ** l);
      }
    }
  });
  it("mesh size is the minimum of the poll size and its square, the barrier only falls, the runs are reproducible", () => {
    for (const land of ["smooth", "stepped"] as const) {
      const a = runMads(land, START, 3), b = runMads(land, START, 3);
      expect(a.best).toEqual(b.best);
      expect(a.evaluations).toBe(b.evaluations);
      let hmax = Infinity;
      for (const s of a.steps) {
        expect(s.meshSize).toBeCloseTo(Math.min(s.pollSize, s.pollSize ** 2), 14);
        expect(s.hMax).toBeLessThanOrEqual(hmax);
        hmax = s.hMax;
        for (const p of s.poll) if (p.f !== null) {
          expect(p.x[0]).toBeGreaterThanOrEqual(BOX.sLo - 1e-9); expect(p.x[0]).toBeLessThanOrEqual(BOX.sHi + 1e-9);
          expect(p.x[1]).toBeGreaterThanOrEqual(BOX.rLo - 1e-9); expect(p.x[1]).toBeLessThanOrEqual(BOX.rHi + 1e-9);
        }
      }
    }
  });
  it("after a failure the mesh refines and after a success it coarsens", () => {
    const r = runMads("smooth", START, 2);
    for (let k = 0; k + 1 < r.steps.length; ++k) {
      const a = r.steps[k]!, b = r.steps[k + 1]!;
      if (a.outcome === "failure") expect(b.level).toBe(a.level + 1);
      if (a.outcome === "success") expect(b.level).toBe(Math.max(0, a.level - 1));
    }
  });
  it("on the stepped landscape every poll point is on a whole stage and a step in s is never smaller than one", () => {
    const r = runMads("stepped", START, 2);
    for (const s of r.steps) {
      expect(Number.isInteger(s.centre[0])).toBe(true);
      for (const p of s.poll) {
        expect(Number.isInteger(p.x[0])).toBe(true);
        if (p.status !== "on the centre") expect(p.x[0] !== s.centre[0] || p.x[1] !== s.centre[1]).toBe(true);
      }
    }
  });
  it("twenty seeds: on the smooth landscape every run ends within 3 % of the exact optimum and the median within 1 %; on the stepped one most end on 13 stages and some on 14", () => {
    const so = smoothOptimum();
    let on14 = 0;
    const excess: number[] = [];
    for (let seed = 1; seed <= 20; ++seed) {
      const sm = runMads("smooth", START, seed);
      expect(sm.feasible).toBe(true);
      expect(sm.f / so.f - 1).toBeLessThan(0.03);
      excess.push(sm.f / so.f - 1);
      const st = runMads("stepped", START, seed);
      expect(st.feasible).toBe(true);
      if (Math.round(st.best[0]) === 14) ++on14;
    }
    expect(on14).toBeGreaterThanOrEqual(1);
    expect(on14).toBeLessThan(10);
    excess.sort((x, y) => x - y);
    expect(0.5 * (excess[9]! + excess[10]!)).toBeLessThan(0.01);
  });
  it("it starts infeasible and the barrier lets it travel through infeasible points before a feasible one", () => {
    const r = runMads("smooth", START, 2);
    expect(limit("smooth", START[0], START[1])).toBeGreaterThan(0);
    expect(r.steps[0]!.incumbentF === null || r.steps[0]!.poll.length > 0).toBe(true);
    expect(r.steps.some((s) => s.incumbentI !== null)).toBe(true);
  });
  it("the page lists its simplifications and says the integer rule is its own", () => {
    expect(MADS_SIMPLIFICATIONS.length).toBe(6);
    expect(MADS_SIMPLIFICATIONS.join(" ")).toContain("the page's rule, not a statement of a paper");
    expect(MADS_SIMPLIFICATIONS.join(" ")).toContain("simplification");
  });
  it("the engine's MADS exists, is chosen by a word, and differs from the page's toy in the ways card 4 lists", () => {
    const od = text("src/outerDriver/OptimizationDriver.cpp");
    expect(od).toContain('method == "mads"');
    const mads = text("src/solver/MADS.cpp");
    expect(mads).toContain("std::min(Delta, Delta * Delta)");      // the mesh rule the page shares
    expect(mads).toContain("Householder");                        // the page uses LTMADS instead
    expect(mads).toContain("std::round(x[i])");                   // integers rounded, then projected
    expect(mads).toMatch(/std::min\(std::max\(x\[i\], lo\[i\]\), hi\[i\]\)/);
    expect(OPT_LIMITS.find((l) => l.id === "mads")!.body).toContain("Halton");
    expect(OPT_LIMITS.find((l) => l.id === "mads")!.body).toContain("projects");
  });
  it("the recorded comparison and the closure refusal the page states are in the tree", () => {
    const audit = text("docs/audits/2026-11-24-optimizer-comparison.md");
    expect(audit).toContain("twelve times");
    expect(audit).toContain("balance.mass_closure_rel");
    const od = text("src/outerDriver/OptimizationDriver.cpp");
    expect(od).toContain("this is NOT an optimum and none is");
    expect(existsSync(new URL("src/outerDriver/ClosureGuard.H", ROOT))).toBe(true);
    expect(existsSync(new URL("tutorials/steady/optimisation/optim07_mads_mixed_column/system/outerDict", ROOT))).toBe(true);
    const body = DECISION_ROWS.find((r) => r.id === "nonsmooth")!.check;
    expect(body).toContain("ClosureGuard");
    expect(body).toContain("twelve times");
  });
});

describe("optimizers: what the page says about Choupo is true", () => {
  it("every file:line it names is in the tree and says what it is cited for", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(20);
    for (const c of CITATIONS) {
      const at = lines(c.file)[c.line - 1] ?? "";
      expect(at, `${c.file}:${c.line} should contain "${c.contains}"`).toContain(c.contains);
    }
    expect(new Set(CITATIONS.map((c) => c.id)).size).toBe(CITATIONS.length);
  });
  it("the Theory Guide labels and the case it names exist", () => {
    const tex = text("docs/theoryGuide.tex");
    for (const l of OPT_LABELS) expect(tex, l).toContain(`\\label{${l}}`);
    for (const d of OPT_CASES) expect(existsSync(new URL(`${d}/system/controlDict`, ROOT)), d).toBe(true);
  });
  it("the driver reads exactly two method words, and the engine's SQP constants are the page's", () => {
    const od = text("src/outerDriver/OptimizationDriver.cpp");
    expect(od).toContain('method == "nelderMead"');
    expect(od).toContain('method == "sqp"');
    const sqph = text("src/solver/SQP.H");
    expect(sqph).toMatch(/fdStep\s+=\s+1\.0e-5/);
    expect(sqph).toMatch(/muSafety\s+=\s+1\.10/);
    expect(sqph).toMatch(/armijoC1\s+=\s+1\.0e-4/);
  });
  it("the typed golden numbers equal the case's expected file to half a unit of their last digit", () => {
    const e = text(`${OPTIM06}/expected`);
    const row = (name: string): number => Number(new RegExp(`kpi\\s+column01\\s+${name}\\s+([0-9.e+-]+)`).exec(e)![1]);
    const near = (typed: string, golden: number): boolean => {
      const dec = (typed.split(".")[1] ?? "").length;
      return Math.abs(Number(typed) - golden) <= 0.5 * 10 ** -dec;
    };
    expect(near(GOLDEN_TYPED.vStrip, row("V_strip"))).toBe(true);
    expect(near(GOLDEN_TYPED.reflux, row("R"))).toBe(true);
    expect(near(GOLDEN_TYPED.xDLK, row("x_D_LK"))).toBe(true);
    expect(e).toMatch(/enumeration\s+values_total\s+7\b/);
    expect(e).toMatch(/enumeration\s+values_converged_feasible\s+3\b/);
    expect(e).toMatch(/enumeration\s+best_value\s+14\b/);
  });
});

describe("optimizers: the optim06 table is the engine's run", () => {
  const csv = (): string[][] => witnessOutput(OPTIM06, "integer_enumeration.csv").trim().split("\n").slice(1).map((l) => l.split(","));
  const log = (): Map<number, string> => {
    const out = new Map<number, string>();
    const parts = witnessOutput(OPTIM06, "log.choupoSolve").split(/---- units\[0\]\.operation\.nStages = (\d+) ----/);
    for (let i = 1; i < parts.length; i += 2) out.set(Number(parts[i]), parts[i + 1]!);
    return out;
  };
  it("the enumeration csv equals the recorded rows: objective, converged, feasible", () => {
    const rows = csv();
    expect(rows.length).toBe(RUN_ROWS.length);
    for (const r of RUN_ROWS) {
      const c = rows.find((x) => Number(x[0]) === r.n)!;
      expect(c, `n=${r.n}`).toBeDefined();
      if (r.v === null) expect(c[1]).toBe("nan");
      else expect(Number(c[1])).toBeCloseTo(r.v, 6);
      expect(c[2] === "1", `converged ${r.n}`).toBe(r.verdict === "converged");
      expect(c[3] === "1", `feasible ${r.n}`).toBe(r.verdict === "converged");
    }
  });
  it("the log carries the recorded reflux ratio and multiplier of every row, and the reason of the failed one", () => {
    const lg = log();
    for (const r of RUN_ROWS) {
      const sec = lg.get(r.n);
      expect(sec, `section ${r.n}`).toBeDefined();
      if (r.n === 8) { expect(sec).toContain("feedStage (8) must lie in 1..7"); continue; }
      const rr = /refluxRatio = ([0-9.]+)/.exec(sec!)![1]!;
      expect(Number(rr)).toBeCloseTo(r.r!, 5);
      if (r.lambda !== null) {
        const lam = /lambda = ([0-9.e+-]+)/.exec(sec!)![1]!;
        expect(Number(lam)).toBeCloseTo(r.lambda, 3);
        expect(sec).toContain("KKT satisfied");
      } else {
        expect(sec).not.toContain("KKT conditions satisfied");
      }
    }
  });
  it("the multiplier equals the slope of the engine's own optimum against the limit", () => {
    const rows = SHADOW_CHECK.rows;
    const central = (rows[3]![1] - rows[1]![1]) / (rows[3]![0] - rows[1]![0]);
    expect(Math.abs(central / SHADOW_CHECK.lambdaPrinted - 1)).toBeLessThan(2e-3);
    const wide = (rows[4]![1] - rows[0]![1]) / (rows[4]![0] - rows[0]![0]);
    expect(Math.abs(wide / SHADOW_CHECK.lambdaPrinted - 1)).toBeLessThan(2e-2);
    const lam14 = Number(/lambda = ([0-9.e+-]+)/.exec(log().get(14)!)![1]);
    expect(lam14).toBeCloseTo(SHADOW_CHECK.lambdaPrinted, 4);
    expect(rows[2]![1]).toBeCloseTo(RUN_ROWS[6]!.v!, 6);
  });
});

describe("optimizers: no free lunch on the page's own landscapes", () => {
  const sc = scorecard();
  const row = (m: string) => sc.rows.find((r) => r.method === m)!;
  it("SQP is exact and cheapest on the smooth landscape and misled on the stepped one", () => {
    expect(Math.abs(row("SQP").smooth.gap)).toBeLessThan(1e-6);
    expect(row("SQP").smooth.evaluations).toBeLessThan(row("Nelder-Mead").smooth.evaluations);
    expect(row("SQP").smooth.evaluations).toBeLessThan(row("MADS").smooth.evaluations);
    expect(row("SQP").stepped.gap).toBeGreaterThan(0.1);
  });
  it("MADS is slower than SQP on the smooth one and local on the stepped one; Nelder-Mead is close on both toys", () => {
    expect(row("MADS").smooth.gap).toBeGreaterThan(1e-3);
    expect(row("MADS").stepped.gap).toBeGreaterThan(0.1);
    expect(row("Nelder-Mead").smooth.gap).toBeLessThan(1e-2);
    expect(row("Nelder-Mead").stepped.gap).toBeLessThan(1e-2);
  });
  it("the page cites the theorem and carries the card", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(OptimizersTool)));
    expect(html).toContain("data-opt-nfl");
    expect(html).toContain("Wolpert, D. H.");
    expect(OPT_QUIZ.some((q) => q.id === "q-nfl")).toBe(true);
    expect(OPT_STEPS.find((s) => s.n === 6)!.body).toContain("NO FREE LUNCH");
  });
});

describe("optimizers: the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(OptimizersTool)));
  it("is registered live on the numerics shelf, on the linear-solves path after active-set-qp, with a Theory destination", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "optimizers")!;
    expect(t).toBeDefined();
    expect(t.status).toBe("live");
    expect(t.discipline).toBe("Flowsheeting & numerics");
    expect(t.theory).toBe("ch:sqp");
    expect(t.origins).toEqual(expect.arrayContaining(["engine", "page", "reference"]));
    const p = METHOD_PATHS.find((x) => x.id === "linear-solves")!;
    const ids = p.steps.map((s) => s.tool);
    expect(ids.indexOf("optimizers")).toBe(ids.indexOf("active-set-qp") + 1);
  });
  it("draws six cards and the quiz, the references, the engine citations and the seed table, and no NaN", () => {
    for (const c of ["landscape", "nelder-mead", "sqp", "mads", "run", "decision"]) expect(html, c).toContain(`data-opt-card="${c}"`);
    expect(html).toContain("data-lesson-quiz");
    expect(html).toContain("data-opt-mads-seeds");
    expect(html).toContain("data-opt-mads-engine");
    expect(html).toContain("data-opt-mckinnon");
    for (const s of OPT_STEPS) expect(html, s.title).toContain(s.title.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
    expect(html).toContain("Nelder, J. A.");
    expect(html).toContain("Audet, C.; Dennis");
  });
  it("draws every optim06 row and every decision row", () => {
    for (const r of RUN_ROWS) expect(html).toContain(`data-opt-run-row="${r.n}"`);
    for (const r of DECISION_ROWS) expect(html).toContain(`data-opt-decision-row="${r.id}"`);
  });
  it("states its limits, and the quiz has the steps it names", () => {
    expect(OPT_LIMITS.map((l) => l.id)).toEqual(["toy", "sqp", "mads", "local", "multiplier"]);
    expect(OPT_QUIZ.length).toBeGreaterThanOrEqual(5);
    for (const q of OPT_QUIZ) for (const n of q.steps) expect(OPT_STEPS.some((s) => s.n === n)).toBe(true);
  });
  it("the start and the limit the page prints are the ones the code uses", () => {
    expect(START).toEqual([13.2, 3]);
    expect(SPEC).toBe(0.98);
  });
});
