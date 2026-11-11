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
  The `sle-pair` EduTool (DEV.md 4c C316), held four ways:

    1. the pure functions: the ideal solubility against a hand value, the
       gamma extraction, the fit recovering a known pair from synthetic
       data, the predicted solubility inverting the extraction, the held-out
       split;
    2. the transcribed NRTL against the ENGINE: the gamma the native
       choupoProps printed for the catalogue ethanol-water pair (props case
       nrtl01_ethanol_water_package, run by witnessSetup) to 1e-10;
    3. every number the lesson prose prints, recomputed;
    4. the page rendered (react-dom/server): the three moments, the three
       prediction prompts with their answers hidden until a guess, the fit
       table, the C300 sentence, the engine lines and the references.

  Hand check of the ideal solubility at 298.15 K with Wang et al.'s data
  (396.08 K, 18 050 J/mol): 1/298.15 - 1/396.08 = 8.29296e-4 K^-1;
  x 18050/8.314462618 = 1.80035; exp(-1.80035) = 0.16525.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { DEFAULT_PREFS, formatSig } from "../src/state/displayUnits.js";
import {
  aard, checkPoints, dCpTerm, deltaCpAt, fitPair, gammaFromSolubility, lnGammaBinary,
  lnIdealSolubility, measuredSaturationTemperature, nrtlLnGamma, predictSolubility,
  saturationTemperature, splitHeldOut,
} from "../src/ui/methods/slePairMath.js";
import {
  CP_CRYSTAL, CP_LIQUID, FUSION_WANG, FUSION_YANG, SOLVENTS,
} from "../src/ui/methods/slePairData.js";
import {
  SLE_ENGINE_SOURCES, SLE_PREDICTIONS, SLE_STEPS,
} from "../src/ui/methods/slePairLesson.js";
import { REPO } from "./witnessOutputs.js";
import { witnessOutput } from "./witnessRead.js";

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("../src/state/store.js", () => {
  const useStore = Object.assign(
    (sel: (s: unknown) => unknown) => sel(mock.state),
    { getState: () => mock.state, setState: () => undefined, subscribe: () => () => undefined });
  return { useStore };
});

// imported AFTER the mock is declared (vi.mock is hoisted anyway)
import { computeSle, predictionAnswers, SlePairTool } from "../src/ui/methods/SlePairTool.js";

const W = { Tfus: FUSION_WANG.Tfus, dHfus: FUSION_WANG.dHfus };
const ACETONE = SOLVENTS.find((s) => s.id === "acetone")!;
const CYCLO = SOLVENTS.find((s) => s.id === "cyclohexane")!;
const prose = (s: string) => s.replace(/\s+/g, " ");
const stepBody = (n: number) => prose(SLE_STEPS.find((s) => s.n === n)!.body);

describe("pure functions", () => {
  it("the ideal solubility at 298.15 K matches the hand value in the header", () => {
    expect(Math.exp(lnIdealSolubility(298.15, W))).toBeCloseTo(0.16525, 5);
    expect(lnIdealSolubility(W.Tfus, W)).toBeCloseTo(0, 12);
  });

  it("the dCp term is zero at the melting point, positive below it, and absent without dCp", () => {
    const s = { ...W, dCp: 44.7 };
    expect(dCpTerm(W.Tfus, s)).toBeCloseTo(0, 12);
    expect(dCpTerm(300, s)).toBeGreaterThan(0);
    expect(dCpTerm(300, W)).toBe(0);
    expect(lnIdealSolubility(300, s, true) - lnIdealSolubility(300, s)).toBeCloseTo(dCpTerm(300, s), 14);
  });

  it("gamma1 = x_id / x1 at each point", () => {
    const g = gammaFromSolubility([{ T: 300, x1: 0.05 }], W)[0]!;
    expect(g.gamma1).toBeCloseTo(Math.exp(lnIdealSolubility(300, W)) / 0.05, 12);
    expect(g.lnGamma1).toBeCloseTo(Math.log(g.gamma1), 12);
  });

  it("the binary helper is the n-component loop with a = 0, and Gibbs-Duhem holds", () => {
    const p = { b12: 500, b21: -200, alpha: 0.3 };
    const [l1, l2] = lnGammaBinary(0.3, 320, p);
    // the textbook binary NRTL, written independently
    const t12 = 500 / 320, t21 = -200 / 320, G12 = Math.exp(-0.3 * t12), G21 = Math.exp(-0.3 * t21);
    const x1 = 0.3, x2 = 0.7;
    const b1 = x2 ** 2 * (t21 * (G21 / (x1 + x2 * G21)) ** 2 + t12 * G12 / (x2 + x1 * G12) ** 2);
    const b2 = x1 ** 2 * (t12 * (G12 / (x2 + x1 * G12)) ** 2 + t21 * G21 / (x1 + x2 * G21) ** 2);
    expect(l1).toBeCloseTo(b1, 13);
    expect(l2).toBeCloseTo(b2, 13);
    // x1 dlnG1 + x2 dlnG2 = 0 at constant T
    const h = 1e-6;
    const [a1, a2] = lnGammaBinary(0.3 + h, 320, p), [c1, c2] = lnGammaBinary(0.3 - h, 320, p);
    expect(x1 * (a1 - c1) + x2 * (a2 - c2)).toBeCloseTo(0, 10);
  });

  it("the fit recovers a known pair from data generated with it", () => {
    const truth = { b12: 650, b21: -300, alpha: 0.3 };
    const pts = [280, 290, 300, 310, 320, 330].map((T) => ({ T, x1: predictSolubility(T, truth, W).x1 }));
    const f = fitPair(gammaFromSolubility(pts, W), 0.3);
    expect(f.pair.b12).toBeCloseTo(truth.b12, 3);
    expect(f.pair.b21).toBeCloseTo(truth.b21, 3);
    expect(f.rmsLnGamma).toBeLessThan(1e-8);
  });

  it("predictSolubility inverts the saturation condition", () => {
    const p = { b12: 756, b21: -444, alpha: 0.3 };
    const { x1, roots } = predictSolubility(310, p, W);
    expect(roots).toBe(1);
    expect(Math.log(x1) + lnGammaBinary(x1, 310, p)[0]).toBeCloseTo(lnIdealSolubility(310, W), 10);
    expect(saturationTemperature(x1, p, W)).toBeCloseTo(310, 6);
  });

  it("every fourth point is held out", () => {
    const { train, held } = splitHeldOut([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(held).toEqual([3, 7]);
    expect(train).toEqual([0, 1, 2, 4, 5, 6, 8, 9, 10]);
  });

  it("the measured saturation temperature interpolates ln x against 1/T", () => {
    const T = measuredSaturationTemperature([{ T: 300, x1: 0.05 }, { T: 320, x1: 0.2 }], 0.1);
    const f = (Math.log(0.1) - Math.log(0.05)) / (Math.log(0.2) - Math.log(0.05));
    expect(T).toBeCloseTo(1 / (1 / 300 + f * (1 / 320 - 1 / 300)), 10);
    expect(measuredSaturationTemperature([{ T: 300, x1: 0.05 }], 0.1)).toBeNaN();
  });
});

describe("the transcribed NRTL against the engine", () => {
  it("reproduces choupoProps' gamma for the catalogue ethanol-water pair to 1e-10", () => {
    const CASE = "tutorials/props/molecular/nrtl01_ethanol_water_package";
    const log = witnessOutput(CASE, "log.choupoProps");
    const block = log.split("<<<Choupo:result-begin>>>")[1]!.split("<<<Choupo:result-end>>>")[0]!;
    const res = JSON.parse(block) as { operationResults: { name: string; diagnostics: Record<string, number> }[] };
    const d = res.operationResults.find((o) => o.name === "g_nrtl")!.diagnostics;
    // the pair the case declares, read from the case's own sealed copy
    const rec = readFileSync(`${REPO}/${CASE}/constant/parameters/NRTL/ethanol-water.dat`, "utf-8");
    const num = (k: string) => Number(new RegExp(`\\b${k}\\s+(-?[0-9.eE+-]+);`).exec(rec)![1]);
    const g = nrtlLnGamma(298.15, [0.5, 0.5], {
      n: 2, a: [0, num("a_ij"), num("a_ji"), 0], b: [0, num("b_ij"), num("b_ji"), 0],
      alpha: [0, num("alpha"), num("alpha"), 0] });
    expect(Math.abs(Math.exp(g[0]!) - d["gamma_ethanol"]!)).toBeLessThan(1e-10);
    expect(Math.abs(Math.exp(g[1]!) - d["gamma_water"]!)).toBeLessThan(1e-10);
  });

  it("every engine line the page cites says what it is cited for", () => {
    for (const e of SLE_ENGINE_SOURCES) {
      const line = readFileSync(`${REPO}/${e.file}`, "utf-8").split("\n")[e.line - 1] ?? "";
      expect(line, `${e.file}:${e.line}`).toContain(e.contains);
    }
  });
});

describe("every number the lesson prints", () => {
  const sig3 = (v: number) => formatSig(v, 3);
  it("step 3: the two ideal solubilities and the two spreads", () => {
    const xw = Math.exp(lnIdealSolubility(298.15, W));
    const xy = Math.exp(lnIdealSolubility(298.15, FUSION_YANG));
    const b = stepBody(3);
    expect(b).toContain(`it is ${sig3(xw)} at 298.15 K`);
    expect(b).toContain(`gives ${sig3(xy)}`);
    expect(b).toContain(`differ by ${Math.round(100 * (FUSION_WANG.dHfus / FUSION_YANG.dHfus - 1))} %`);
    expect(b).toContain(`the ideal solubility by ${Math.round(100 * (xy / xw - 1))} %`);
  });

  it("step 4: dCp, the term at 298.15 K and at the warmest point, and the factor", () => {
    const d = deltaCpAt(FUSION_WANG.Tfus, CP_CRYSTAL, CP_LIQUID).dCp;
    const s = { ...W, dCp: d };
    const b = stepBody(4);
    expect(b).toContain(`= ${sig3(d)} J/(mol·K)`);
    expect(b).toContain(`is ${sig3(dCpTerm(298.15, s))} at 298.15 K`);
    expect(b).toContain(`a factor ${sig3(Math.exp(dCpTerm(298.15, s)))}`);
    const Tw = Math.max(...CYCLO.points.map((p) => p.T));
    expect(b).toContain(`${sig3(dCpTerm(Tw, s))} at ${Tw} K`);
  });

  it("step 5: the gamma range in acetone and the first gamma in cyclohexane", () => {
    const ga = gammaFromSolubility(ACETONE.points, W).map((p) => p.gamma1);
    const gc = gammaFromSolubility(CYCLO.points, W)[0]!.gamma1;
    const b = stepBody(5);
    expect(b).toContain(`from ${sig3(Math.min(...ga))} to ${sig3(Math.max(...ga))} over the eleven points`);
    expect(ACETONE.points).toHaveLength(11);
    expect(b).toContain(`gives ${sig3(gc)} at 283 K`);
  });

  it("step 7: the acetone window and the cold-half gamma2-infinity ratio", () => {
    const xs = ACETONE.points.map((p) => p.x1), Ts = ACETONE.points.map((p) => p.T);
    const b = stepBody(7);
    expect(b).toContain(`between \\(x_1\\) = ${sig3(Math.min(...xs))} and ${sig3(Math.max(...xs))}, over ${Math.round(Math.max(...Ts) - Math.min(...Ts))} K`);
    const r = computeSle({ solvent: ACETONE, fusion: FUSION_WANG, alpha: 0.3 });
    const full = r.otherEnd.find((o) => o.label === "α = 0.3")!;
    const cold = r.otherEnd.find((o) => o.label.startsWith("cold half"))!;
    const ratio = Math.exp(cold.lnG2inf - full.lnG2inf);
    expect(formatSig(ratio, 2)).toBe("190000");
    expect(b).toContain("about 190 000 times");
    // ... while the cold-half pair still reproduces its own half
    expect(cold.rms).toBeLessThan(0.01);
  });

  it("prediction (a): the ideal saturation temperature of x1 = 0.1 printed in the prompt", () => {
    const p = SLE_PREDICTIONS.find((q) => q.id === "positive")!;
    expect(prose(p.prompt)).toContain(`saturated at ${formatSig(saturationTemperature(0.1, null, W), 4)} K`);
  });
});

describe("the witness: benzoic acid in acetone (Long et al. 2010)", () => {
  const r = computeSle({ solvent: ACETONE, fusion: FUSION_WANG, alpha: 0.3 });
  it("fits 9 points and holds out 2, with small in-sample and held-out residuals", () => {
    expect(r.train).toHaveLength(9);
    expect(r.held.map((p) => p.T)).toEqual([287.19, 307.75]);
    expect(r.fit.rmsLnGamma).toBeLessThan(0.0095);
    expect(aard(r.inSample)).toBeLessThan(0.008);
    expect(aard(r.heldOut)).toBeLessThan(0.004);
    // the numbers the report quotes
    expect(formatSig(r.fit.pair.b12, 3)).toBe("756");
    expect(formatSig(r.fit.pair.b21, 3)).toBe("-444");
  });

  it("the equally good fits agree inside the data and part at the other end", () => {
    const fam = r.otherEnd.filter((o) => o.label.startsWith("α"));
    const xm = fam.map((o) => o.xMid);
    expect((Math.max(...xm) - Math.min(...xm)) / Math.min(...xm)).toBeLessThan(0.005);
    const g2 = fam.map((o) => Math.exp(o.lnG2inf));
    expect(Math.max(...g2) / Math.min(...g2)).toBeGreaterThan(1.4);
  });

  it("cyclohexane: the two-parameter b/T form cannot follow the data (a run of one sign)", () => {
    const c = computeSle({ solvent: CYCLO, fusion: FUSION_WANG, alpha: 0.3 });
    expect(c.fit.rmsLnGamma).toBeGreaterThan(0.15);
    const signs = c.fit.residuals.map((v) => Math.sign(v));
    let runs = 1;
    for (let k = 1; k < signs.length; ++k) if (signs[k] !== signs[k - 1]) runs++;
    expect(runs).toBeLessThanOrEqual(3);
  });

  it("the prediction answers", () => {
    const ans = predictionAnswers(FUSION_WANG, r.fit.pair);
    expect(ans.a.xMeas).toBeLessThan(ans.a.xIdeal);
    expect(ans.a.TsatMeasured - ans.a.TsatIdeal).toBeGreaterThan(55);
    expect(ans.b.xAfter).toBeLessThan(ans.b.xBefore);
    expect(ans.b.idealAfter).toBeLessThan(ans.b.idealBefore);
    expect(ans.c.map((q) => q.id)).toEqual(["acetone", "acetic-acid", "cyclohexane"]);
    expect(ans.c[0]!.x1).toBeGreaterThan(ans.c[1]!.x1);
    expect(ans.c[1]!.x1).toBeGreaterThan(ans.c[2]!.x1);
  });

  it("checkPoints is the predicted solubility against the measured one", () => {
    const c = checkPoints(ACETONE.points.slice(0, 1), r.fit.pair, W)[0]!;
    expect(c.relDev).toBeCloseTo((c.predicted - c.x1) / c.x1, 14);
  });
});

describe("the page, rendered", () => {
  mock.state = { displayPrefs: { ...DEFAULT_PREFS } };
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(SlePairTool)));
  const text = prose(html.replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">"));

  it("draws the three moments in order", () => {
    const i = ["understand", "experiment", "verify"].map((m) => html.indexOf(`data-moment="${m}"`));
    expect(i.every((v) => v > 0)).toBe(true);
    expect(i[0]! < i[1]! && i[1]! < i[2]!).toBe(true);
    expect(html).toContain("data-moments-nav");
  });

  it("asks the three predictions, and shows no answer before a guess", () => {
    for (const p of SLE_PREDICTIONS) {
      expect(html).toContain(`data-prediction="${p.id}"`);
      expect(text).toContain(prose(p.prompt));
    }
    expect(html).not.toContain("data-side-by-side");
    expect(html).not.toContain("data-rank-table");
    expect((text.match(/the answer waits for your guess/g) ?? []).length).toBe(3);
  });

  it("prints the fit with its in-sample and held-out residuals, and the other end", () => {
    expect(html).toContain("data-fit-result");
    expect(text).toContain("in-sample rms of ln γ₁ (9 points)");
    expect(text).toContain("held-out mean |Δx₁|/x₁ (2 points)");
    expect(html).toContain("data-residual-table");
    expect(html).toContain('data-sortable="dev"');
    expect(html).toContain("data-other-end");
    expect(html).toContain("data-c300-sentence");
    expect(text).toContain("IN-SAMPLE");
    expect(text).toContain("HELD-OUT");
  });

  it("verifies: the sources with DOIs, the dCp table, the engine lines, the references", () => {
    for (const doi of ["10.1016/j.fluid.2010.06.021", "10.1021/je100749m", "10.1016/j.jct.2011.12.015"]) {
      expect(text).toContain(doi);
    }
    expect(html).toContain("data-dcp-table");
    for (const e of SLE_ENGINE_SOURCES) expect(text).toContain(`${e.file}:${e.line}`);
    expect(html).toContain("data-lesson-references");
  });
});
