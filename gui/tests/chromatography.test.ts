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
  chromatography -- the page's arithmetic held to answers known without it.

  * the closed forms against hand arithmetic (retention, resolution, the
    Gaussian cut at R_s = 1.5, the van Deemter optimum);
  * the plate model against its own moments, and against the Gaussian as N
    grows;
  * the page's column integration: its mass ledger to round-off, its
    linear pulse against the moment formulas (and, with the engine's own
    first-order scheme, against the formulas that count that scheme's
    dispersion), its Langmuir pulse against the linear one at low load, and
    the overloaded peak against itself on finer grids;
  * the case the page hands the engine, parsed by the app's own reader.

  No engine runs in node; what the engine printed for this case natively is
  recorded in docs/design/chromatography-peaks-and-resolution.md, section 4.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CHROM_CASE_NAME, R_GAS, chromCaseFiles, cumulative, cutsForPurity, daxFrom, engineEndTime,
  engineMatches, erf, gaussian, gaussianCut, henryKc, linearPulseMoments, plateHeight,
  platePeak, readEnginePeaks, resolution, resolutionFundamental, retention, sampledCut,
  sampledMoments, solveColumn, vanDeemter, type Column, type SolveOptions,
} from "../src/case/chromatography.js";
import { filesToCaseFiles } from "../src/cases/tutorials.js";
import { ChromatographyTool } from "../src/ui/methods/ChromatographyTool.js";
import { CHROM_STEPS } from "../src/ui/methods/chromatographyLesson.js";

const col: Column = { L: 0.5, eps: 0.4, u: 0.05, rhoB: 500, area: 0.01, T: 298.15, P_bar: 1 };
const Kc = [henryKc(0.4, col.T), henryKc(0.6, col.T)];
const cIn = 0.005 * 1e5 / (R_GAS * col.T);

describe("the closed forms", () => {
  it("retention: K_c from H per bar, k' = rho_b K_c / eps, t_R = t0 (1 + k')", () => {
    // by hand: 0.4 * 8.314462618 * 298.15 / 1e5 = 0.00991582812 m3/kg
    expect(Kc[0]).toBeCloseTo(0.00991582812, 10);
    const r = retention(col, Kc[0]!);
    expect(r.v).toBeCloseTo(0.125, 12);
    expect(r.t0).toBeCloseTo(4, 12);
    expect(r.kprime).toBeCloseTo(12.3947852, 6);   // 500 * 0.00991582812 / 0.4
    expect(r.tR).toBeCloseTo(53.579141, 5);         // 4 * (1 + 12.3947852), the engine's printed t_st
    // the engine's printed stoichiometric time for this bed, (L/u)(eps + rho_b K_c):
    expect(col.L / col.u * (col.eps + col.rhoB * Kc[0]!)).toBeCloseTo(r.tR, 9);
  });

  it("the resolution and the cut at R_s = 1.5 between equal Gaussians", () => {
    expect(resolution(10, 1, 16, 1)).toBeCloseTo(1.5, 12);
    // a midway cut leaves Phi(-3) = 0.0013499 of each peak on the wrong side
    const c = gaussianCut(13, { tR: 10, sigma: 1, area: 1 }, { tR: 16, sigma: 1, area: 1 });
    expect(c.first.recovery).toBeCloseTo(1 - 0.0013499, 6);
    expect(c.first.purity).toBeCloseTo((1 - 0.0013499) / 1, 6);
    expect(c.second.purity).toBeCloseTo(c.first.purity, 12);
    // the fundamental form at N = 1600, alpha = 1.1, k2 = 4: 10 * (0.1/1.1) * 0.8
    expect(resolutionFundamental(1600, 1.1, 4)).toBeCloseTo(10 * (0.1 / 1.1) * 0.8, 12);
  });

  it("erf matches tabulated values", () => {
    expect(erf(0.5)).toBeCloseTo(0.5204998778, 9);
    expect(erf(1)).toBeCloseTo(0.8427007929, 9);
    expect(erf(2)).toBeCloseTo(0.9953222650, 9);
    expect(erf(3)).toBeCloseTo(0.9999779095, 9);
    expect(erf(-1.3)).toBeCloseTo(-0.9340079449, 9);
  });

  it("van Deemter: the optimum is the minimum, and the terms are the bed's", () => {
    const d = { dp: 0.002, Dm: 6e-5, gamma: 0.7, lambda: 0.5 };
    const vd = vanDeemter(d, 5, 18.6);
    expect(vd.A).toBeCloseTo(0.002, 12);
    expect(vd.B).toBeCloseTo(8.4e-5, 12);
    expect(vd.C).toBeCloseTo(2 * 18.6 / (5 * 19.6 * 19.6), 12);
    for (const f of [0.9, 1.1]) expect(plateHeight(vd, f * vd.vOpt)).toBeGreaterThan(vd.Hmin);
    expect(plateHeight(vd, vd.vOpt)).toBeCloseTo(vd.Hmin, 12);
    // 2 D_L / v = A + B / v with D_ax = eps D_L
    const v = 0.125;
    expect(2 * daxFrom(0.4, d, v) / 0.4 / v).toBeCloseTo(vd.A + vd.B / v, 12);
  });
});

describe("the plate model", () => {
  function moments(N: number, tR: number): { area: number; mean: number; variance: number } {
    const t: number[] = [], c: number[] = [];
    const tMax = tR * (1 + 12 / Math.sqrt(N));
    for (let i = 0; i <= 20000; i++) { t.push(tMax * i / 20000); c.push(platePeak(t[i]!, tR, N)); }
    const m = sampledMoments(t, c);
    return { area: m.m0, mean: m.mu1, variance: m.variance };
  }
  it("has unit area, mean t_R and variance t_R^2 / N", () => {
    for (const N of [3, 10, 100, 1000]) {
      const m = moments(N, 50);
      expect(m.area).toBeCloseTo(1, 4);
      expect(m.mean).toBeCloseTo(50, 3);
      expect(m.variance / (2500 / N)).toBeCloseTo(1, 3);
    }
  });
  it("tends to the Gaussian of the same mean and variance as N grows", () => {
    const gap = (N: number): number => {
      const tR = 50, s = tR / Math.sqrt(N);
      let g = 0, peak = 0;
      for (let i = 0; i <= 4000; i++) {
        const t = tR + s * (-6 + 12 * i / 4000);
        g = Math.max(g, Math.abs(platePeak(t, tR, N) - gaussian(t, tR, s)));
        peak = Math.max(peak, gaussian(t, tR, s));
      }
      return g / peak;
    };
    const g = [3, 10, 100, 1000].map(gap);
    for (let i = 1; i < g.length; i++) expect(g[i]!).toBeLessThan(g[i - 1]!);
    expect(g[0]!).toBeGreaterThan(0.1);     // three plates: visibly not Gaussian
    expect(g[3]!).toBeLessThan(0.02);       // a thousand: within 2 % of its height
  });
});

describe("the page's column integration", () => {
  const base: Omit<SolveOptions, "N" | "scheme"> = {
    col, Kc, k: [5, 5], Dax: 1e-4, isotherm: { kind: "linear" }, cInj: [cIn, cIn], tInj: 2, tEnd: 200,
  };

  it("closes its mass ledger to round-off", () => {
    const r = solveColumn({ ...base, N: 100 });
    for (const c of r.closure) expect(Math.abs(c)).toBeLessThan(1e-12);
    // what was fed is exactly u A c_inj t_inj
    expect(r.fed[0]).toBeCloseTo(col.u * col.area * cIn * 2, 14);
  });

  it("with the engine's first-order scheme reproduces the moments that count its grid", () => {
    const r = solveColumn({ ...base, N: 200, scheme: "upwind" });
    for (const i of [0, 1]) {
      const m = sampledMoments(r.t, r.c[i]!);
      const th = linearPulseMoments(col, Kc[i]!, 5, 1e-4, 2, col.L / 200);
      expect(Math.abs(m.mu1 / th.mu1 - 1)).toBeLessThan(1e-5);
      expect(Math.abs(m.variance / th.variance - 1)).toBeLessThan(2e-3);
    }
  });

  it("with its own second-order scheme converges to the physical moments", () => {
    const err = [100, 200].map((N) => {
      const r = solveColumn({ ...base, N });
      const m = sampledMoments(r.t, r.c[1]!);
      const th = linearPulseMoments(col, Kc[1]!, 5, 1e-4, 2);
      return { mu: Math.abs(m.mu1 / th.mu1 - 1), v: Math.abs(m.variance / th.variance - 1) };
    });
    expect(err[0]!.mu).toBeLessThan(1e-4);
    expect(err[0]!.v).toBeLessThan(0.03);       // the 100-cell grid the page uses: ~2 %
    expect(err[1]!.v).toBeLessThan(err[0]!.v / 3); // second order: halving dz cuts it ~4x
  });

  it("a Langmuir pulse at very low load is the linear pulse", () => {
    const qs = 2, load = 1e-4, b2 = Kc[1]! / qs, cInj = load / b2;
    const lang = solveColumn({ ...base, isotherm: { kind: "langmuir", qs, competitive: true }, cInj: [cInj, cInj], N: 100 });
    const lin = solveColumn({ ...base, cInj: [cInj, cInj], N: 100 });
    for (const i of [0, 1]) {
      const a = sampledMoments(lang.t, lang.c[i]!), b = sampledMoments(lin.t, lin.c[i]!);
      expect(Math.abs(a.mu1 / b.mu1 - 1)).toBeLessThan(2e-4);
      expect(Math.abs(a.variance / b.variance - 1)).toBeLessThan(2e-3);
    }
  });

  it("overloaded: earlier, front-sharpened, the ledger still closed, competition pushes the first solute ahead", () => {
    const qs = 2, load = 0.8, cInj = load / (Kc[1]! / qs);
    const o = { ...base, tInj: 10, tEnd: 160, cInj: [cInj, cInj], N: 100 };
    const comp = solveColumn({ ...o, isotherm: { kind: "langmuir", qs, competitive: true } });
    const own = solveColumn({ ...o, isotherm: { kind: "langmuir", qs, competitive: false } });
    const lin = solveColumn(o);
    for (const c of comp.closure) expect(Math.abs(c)).toBeLessThan(1e-12);
    for (const i of [0, 1]) {
      const mc = sampledMoments(comp.t, comp.c[i]!), ml = sampledMoments(lin.t, lin.c[i]!);
      expect(mc.mu1).toBeLessThan(ml.mu1);
      // the maximum sits before the first moment: a sharp front and a tail
      let k = 0;
      for (let j = 1; j < comp.c[i]!.length; j++) if (comp.c[i]![j]! > comp.c[i]![k]!) k = j;
      expect(comp.t[k]!).toBeLessThan(mc.mu1);
    }
    expect(sampledMoments(comp.t, comp.c[0]!).mu1).toBeLessThan(sampledMoments(own.t, own.c[0]!).mu1);
  });

  it("the overloaded peak converges with the grid (and the page states the 100-cell error)", () => {
    const qs = 2, load = 0.8, cInj = load / (Kc[1]! / qs);
    const o = { ...base, tInj: 10, tEnd: 160, cInj: [cInj, cInj], isotherm: { kind: "langmuir" as const, qs, competitive: true } };
    const runs = [100, 200, 400].map((N) => solveColumn({ ...o, N }));
    const peak = runs.map((r) => Math.max(...r.c[1]!));
    const rec = runs.map((r) => cutsForPurity(r.t, r.c[0]!, r.c[1]!, 0.99).recovery1);
    const e100 = Math.abs(peak[0]! / peak[2]! - 1), e200 = Math.abs(peak[1]! / peak[2]! - 1);
    expect(e200).toBeLessThan(e100);
    expect(e100).toBeLessThan(0.05);
    expect(Math.abs(rec[0]! - rec[2]!)).toBeLessThan(0.03);
  });
});

describe("cuts on sampled histories", () => {
  it("agree with the error-function cut on sampled Gaussians", () => {
    const t: number[] = [], a: number[] = [], b: number[] = [];
    for (let i = 0; i <= 4000; i++) { const x = 100 * i / 4000; t.push(x); a.push(gaussian(x, 40, 3)); b.push(gaussian(x, 50, 4)); }
    const s = sampledCut(t, a, b, 45), g = gaussianCut(45, { tR: 40, sigma: 3, area: 1 }, { tR: 50, sigma: 4, area: 1 });
    expect(s.first.purity).toBeCloseTo(g.first.purity, 5);
    expect(s.second.recovery).toBeCloseTo(g.second.recovery, 5);
    const cc = cutsForPurity(t, a, b, 0.99);
    expect(cc.t1).not.toBeNull();
    // at the cut found, the first fraction meets the target
    expect(sampledCut(t, a, b, cc.t1!).first.purity).toBeGreaterThanOrEqual(0.99 - 1e-9);
    expect(cumulative(t, a).at(-1)!).toBeCloseTo(1, 5);
  });
});

describe("the engine's case", () => {
  const spec = { col, H: [0.4, 0.6] as [number, number], kLDF: 5, Dax: 1.17e-4, tInj: 2, tEnd: engineEndTime(col, [0.4, 0.6], 5, 1.17e-4, 2) };
  it("is a choupoBatch case the app's reader accepts", () => {
    const cf = filesToCaseFiles(CHROM_CASE_NAME, chromCaseFiles(spec));
    expect(cf.controlDict["application"]).toBe("choupoBatch");
    const files = chromCaseFiles(spec);
    expect(files["system/flowsheetDict"]).toContain("type        fixedBedAdsorber;");
    expect(files["system/flowsheetDict"]).toContain("key feed.CH4; value 0.0;");
    expect(files["constant/parameters/adsorption/equilibria/linearTeachingSorbent/CO2.dat"]).toContain("H_298 0.6;");
    expect(spec.tEnd % 0.5).toBe(0);
  });
  it("draws an answer only when it belongs to the knobs", () => {
    const tst = (H: number): number => col.L / col.u * (col.eps + col.rhoB * henryKc(H, col.T));
    const traj = { t: [0, 1], vars: { "bed.c_out_CH4": [0, 0], "bed.c_out_CO2": [0, 0] } };
    const kpis = { bed: { t_stoichiometric_CH4: tst(0.4), t_stoichiometric_CO2: tst(0.6), Pe: col.u * col.L / 1.17e-4, t_end: spec.tEnd } };
    const p = readEnginePeaks(traj, kpis)!;
    expect(engineMatches(p, spec)).toBe(true);
    expect(engineMatches(p, { ...spec, tInj: 3, tEnd: spec.tEnd + 1 })).toBe(false);
    expect(engineMatches(p, { ...spec, H: [0.4, 0.7] })).toBe(false);
  });
});

describe("the page", () => {
  it("renders its lesson and controls before any run", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(ChromatographyTool)));
    expect(html).toContain("Chromatography: peaks, plates and resolution");
    for (const s of CHROM_STEPS) expect(html).toContain(s.title.slice(0, 24));
    expect(html).toContain("Liquid chromatography has no engine route.");
  });
});
