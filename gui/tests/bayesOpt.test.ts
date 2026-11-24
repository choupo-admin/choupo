// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
/*---------------------------------------------------------------------------*\
  The Bayesian-optimisation card (gui/src/ui/methods/bayesOpt/): its math held
  against values computed by hand, its lesson held to its own structure, and
  the card rendered once to see that it stands up and says what the engine
  does not do.  No engine run, no registry.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  DIP, SETTINGS, bestAfter, boFit, expectedImprovement, fNarrowDip, fSmooth,
  fitGp, gradientRun, gridMinimum, nextPoint, normCdf, normPdf, predict, rbf,
} from "../src/ui/methods/bayesOpt/gp.js";
import {
  BAYES_LIMITS, BAYES_QUIZ, BAYES_REFERENCES, BAYES_STEPS, ENGINE_STATUS,
} from "../src/ui/methods/bayesOpt/bayesOptLesson.js";
import { BayesOptCard } from "../src/ui/methods/bayesOpt/BayesOptCard.js";

describe("normal distribution", () => {
  it("matches tabulated values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 12);
    expect(normCdf(1)).toBeCloseTo(0.8413447461, 9);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021049, 9);
    expect(normCdf(-1.96)).toBeCloseTo(0.0249978951, 9);
    expect(normCdf(8)).toBeCloseTo(1, 12);
    expect(normPdf(0)).toBeCloseTo(0.3989422804, 10);
    expect(normPdf(1)).toBeCloseTo(0.2419707245, 10);
  });
});

describe("Gaussian process, two points by hand (GPML eqs. 2.25, 2.26)", () => {
  //  X = {0, 1}, y = {1, 0}, ell = 1, sf2 = 1, noise2 = 0.1, x* = 0.5.
  //  a = 1.1, c = k(0,1) = e^{-1/2}; k* = e^{-1/8} (both entries).
  //  (K + s I)^{-1} y = [a, -c]/(a^2 - c^2), so
  //    mean = k* (a - c)/(a^2 - c^2) = k*/(a + c)
  //    var  = 1 - k*^2 * 2 (a - c)/(a^2 - c^2) = 1 - 2 k*^2/(a + c).
  const c = Math.exp(-0.5);
  const a = 1.1;
  const kStar = Math.exp(-0.125);
  const meanHand = kStar / (a + c);
  const varHand = 1 - (2 * kStar * kStar) / (a + c);
  const fit = fitGp([0, 1], [1, 0], { ell: 1, sf2: 1, noise2: 0.1 });

  it("kernel values", () => {
    expect(rbf(0, 1, 1, 1)).toBeCloseTo(c, 14);
    expect(rbf(0, 0, 1, 2.5)).toBe(2.5);
  });
  it("mean equals the hand value (and the decimal I computed: 0.51714)", () => {
    const p = predict(fit, 0.5);
    expect(p.mean).toBeCloseTo(meanHand, 12);
    expect(p.mean).toBeCloseTo(0.51714, 4);
  });
  it("variance equals the hand value (0.087274)", () => {
    const p = predict(fit, 0.5);
    expect(p.variance).toBeCloseTo(varHand, 12);
    expect(p.variance).toBeCloseTo(0.087274, 5);
  });
  it("the offset is subtracted and added back", () => {
    const shifted = fitGp([0, 1], [11, 10], { ell: 1, sf2: 1, noise2: 0.1, offset: 10 });
    const p = predict(shifted, 0.5);
    expect(p.mean).toBeCloseTo(10 + meanHand, 12);
    expect(p.variance).toBeCloseTo(varHand, 12);
  });
  it("far from the data it returns to the prior (mean = offset, variance = sf2)", () => {
    const f2 = fitGp([0, 1], [1, 0], { ell: 0.1, sf2: 1, noise2: 0.1, offset: 0.5 });
    const p = predict(f2, 50);
    expect(p.mean).toBeCloseTo(0.5, 12);
    expect(p.variance).toBeCloseTo(1, 12);
  });
  it("rejects a mismatch of lengths", () => {
    expect(() => fitGp([0, 1], [1], { ell: 1, sf2: 1, noise2: 0.1 })).toThrow();
  });
});

describe("the band shrinks at observed points", () => {
  it("variance at a datum is about the noise level, far below the gap between", () => {
    const X = [0.1, 0.5, 0.9];
    const fit = fitGp(X, X.map(fSmooth), { ell: 0.15, sf2: 1, noise2: 1e-6 });
    for (const x of X) expect(predict(fit, x).variance).toBeLessThan(1e-5);
    expect(predict(fit, 0.3).variance).toBeGreaterThan(0.1);
  });
  it("a larger noise allowance widens it at the data", () => {
    const X = [0.1, 0.5, 0.9];
    const lo = fitGp(X, X.map(fSmooth), { ell: 0.15, sf2: 1, noise2: 1e-6 });
    const hi = fitGp(X, X.map(fSmooth), { ell: 0.15, sf2: 1, noise2: 0.05 });
    expect(predict(hi, 0.5).variance).toBeGreaterThan(predict(lo, 0.5).variance);
  });
});

describe("expected improvement (Jones, Schonlau & Welch eq. 15)", () => {
  it("mu = fmin, s = 1: EI = phi(0) = 0.39894", () => {
    expect(expectedImprovement(0, 1, 0)).toBeCloseTo(0.3989422804, 10);
  });
  it("mu = 0, s = 1, fmin = 1: u = 1, EI = Phi(1) + phi(1) = 1.0833154", () => {
    expect(expectedImprovement(0, 1, 1)).toBeCloseTo(0.8413447461 + 0.2419707245, 9);
  });
  it("uses s, not s^2 (s = 2 doubles the u = 0 value)", () => {
    expect(expectedImprovement(3, 2, 3)).toBeCloseTo(2 * 0.3989422804, 10);
  });
  it("is zero when s = 0, and tends to zero for a mean far above the best", () => {
    expect(expectedImprovement(0, 0, 1)).toBe(0);
    expect(expectedImprovement(10, 1, 0)).toBeLessThan(1e-20);
  });
  it("is positive and increases with s at a fixed mean", () => {
    expect(expectedImprovement(0.5, 0.2, 0)).toBeLessThan(expectedImprovement(0.5, 0.4, 0));
  });
});

describe("the loop", () => {
  it("nextPoint is not an evaluated point and adding it grows the data", () => {
    const s = SETTINGS[0]!;
    const state = { X: [...s.initial], y: s.initial.map(s.f) };
    const nx = nextPoint(state, s.ell, 1e-4);
    expect(state.X.every((x) => Math.abs(x - nx.x) >= 1e-3)).toBe(true);
    expect(nx.ei).toBeGreaterThan(0);
  });
  it("ten EI steps on the smooth setting reach within 0.05 of the grid minimum", () => {
    const s = SETTINGS[0]!;
    const state = { X: [...s.initial], y: s.initial.map(s.f) };
    for (let i = 0; i < 10; i++) {
      const nx = nextPoint(state, s.ell, 1e-4);
      state.X.push(nx.x); state.y.push(s.f(nx.x));
    }
    expect(Math.min(...state.y) - gridMinimum(fSmooth).f).toBeLessThan(0.05);
  });
});

describe("the honest failure: the narrow dip", () => {
  const s = SETTINGS[1]!;
  it("the dip is the true minimum, near its declared position", () => {
    const m = gridMinimum(fNarrowDip);
    expect(Math.abs(m.x - DIP.at)).toBeLessThan(0.01);
    expect(m.f).toBeLessThan(-1.5);
  });
  it("with the long length scale the initial model puts nothing near the dip and EI is tiny there", () => {
    const state = { X: [...s.initial], y: s.initial.map(s.f) };
    const fit = boFit(state, s.ell, 1e-4);
    const p = predict(fit, DIP.at);
    expect(p.mean).toBeGreaterThan(-0.5);
    expect(Math.min(...state.y)).toBeGreaterThan(-0.5);
    const eiDip = expectedImprovement(p.mean, Math.sqrt(p.variance), Math.min(...state.y));
    expect(eiDip).toBeLessThan(0.1);
  });
  it("a gradient run from its start does not find the dip either", () => {
    const log = gradientRun(fNarrowDip, s.gradientStart);
    expect(bestAfter(log, log.length)).toBeGreaterThan(-0.5);
  });
});

describe("the gradient sketch", () => {
  it("logs every call, respects the budget and never leaves [0, 1]", () => {
    const log = gradientRun(fSmooth, 0.5, 40);
    expect(log.length).toBeGreaterThan(3);
    expect(log.length).toBeLessThanOrEqual(40);
    expect(log.every((r) => r.x >= 0 && r.x <= 1)).toBe(true);
  });
  it("a gradient costs two calls per variable: the first three calls are f(x0) and the pair", () => {
    const log = gradientRun(fSmooth, 0.5);
    expect(log[0]!.x).toBe(0.5);
    expect(log[1]!.x).toBeCloseTo(0.5 + 1e-4, 12);
    expect(log[2]!.x).toBeCloseTo(0.5 - 1e-4, 12);
  });
  it("on a parabola it reaches the minimum", () => {
    const log = gradientRun((x) => (x - 0.3) * (x - 0.3), 0.9);
    expect(Math.min(...log.map((r) => r.f))).toBeLessThan(1e-6);
  });
  it("bestAfter reads the first n records only", () => {
    const log = [{ x: 0, f: 3 }, { x: 0, f: 1 }, { x: 0, f: 2 }];
    expect(bestAfter(log, 1)).toBe(3);
    expect(bestAfter(log, 3)).toBe(1);
    expect(bestAfter(log, 0)).toBe(Infinity);
  });
});

describe("the lesson", () => {
  it("numbers its steps 1..n and glosses a symbol list wherever there is a formula", () => {
    expect(BAYES_STEPS.map((s) => s.n)).toEqual(BAYES_STEPS.map((_, i) => i + 1));
    for (const st of BAYES_STEPS) {
      if (st.formula) expect(st.where && st.where.length > 0).toBe(true);
    }
  });
  it("every quiz question names steps that exist, and its answer is an option", () => {
    const ids = new Set(BAYES_STEPS.map((s) => s.n));
    expect(BAYES_QUIZ.length).toBeGreaterThanOrEqual(3);
    expect(BAYES_QUIZ.length).toBeLessThanOrEqual(4);
    for (const q of BAYES_QUIZ) {
      expect(q.steps.length).toBeGreaterThan(0);
      for (const n of q.steps) expect(ids.has(n)).toBe(true);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
      expect(q.feedback.length).toBeGreaterThan(20);
    }
  });
  it("limits have unique ids and the engine statement is among them", () => {
    const ids = BAYES_LIMITS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("not-in-engine");
    expect(ENGINE_STATUS).toContain("does not yet offer this method");
    expect(ENGINE_STATUS).toContain("method bayesian;");
    expect(ENGINE_STATUS).toContain("sqp");
  });
  it("cites the two equations it is built on, by number", () => {
    const text = JSON.stringify(BAYES_STEPS);
    expect(text).toContain("2.25");
    expect(text).toContain("2.26");
    expect(text).toContain("Algorithm 2.1");
    expect(text).toContain("(15)");
    expect(BAYES_REFERENCES.length).toBeGreaterThanOrEqual(2);
  });
  it("says there are no multipliers", () => {
    expect(JSON.stringify(BAYES_STEPS)).toContain("no shadow");
  });
});

describe("the card renders", () => {
  it("draws the engine status, both counters and every step, with no failed equation", () => {
    const html = renderToStaticMarkup(
      createElement(MantineProvider, null, createElement(BayesOptCard)),
    );
    expect(html).toContain("does not yet offer this method");
    expect(html).toContain("Bayesian optimisation");
    expect(html).toContain("Gradient method (sketch)");
    expect(html).toContain("data-lesson-quiz");
    expect(html).not.toContain("did not render");
    for (const st of BAYES_STEPS) expect(html).toContain(st.title.replace(/&/g, "&amp;"));
  });
});
