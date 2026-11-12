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
  residueCurves -- the page's arithmetic, held to fields whose answer is
  known.

  The page never computes an equilibrium: in the app the field comes from
  the engine.  These tests build the field THEMSELVES, from a small
  consistent model written here (vapour pressures ln P_i = A_i - B_i/T,
  two-suffix Margules on one pair, an ideal-gas vapour, the bubble point by
  Newton), so that the azeotrope, its temperature and the topology are known
  independently of the code under test.  That model is test scaffolding and
  stands in for nothing the engine does; what is tested is what the page does
  with ANY field: locate, classify, integrate, separate, lever.

  The page itself is rendered once (no engine in node, so it draws its
  lesson and its controls and waits), and the case it writes is parsed by
  the same reader the app uses.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  applyRefinement, curvesCross, gridCompositions, gridOpName, largestTDrop, limitingSplits,
  rcmGridCaseFiles, rcmRefineCaseFiles, readRcmField, readRefinement, refinementPlan,
  rcmTag, regionOf, regionsOf, residueCurve, seedGrid, separatrices, singularPoints,
  type OpLike, type RcmField, type Vec3,
} from "../src/case/residueCurves.js";
import { filesToCaseFiles } from "../src/cases/tutorials.js";
import { ResidueCurvesTool, RCM_PRESETS } from "../src/ui/methods/ResidueCurvesTool.js";
import { PUBLISHED_AZEOTROPES, RCM_STEPS } from "../src/ui/methods/residueCurvesLesson.js";

// ---- the test's own small model ---------------------------------------------------

interface Model { A: Vec3; B: Vec3; m01: number }

function bubble(md: Model, x: Vec3): { T: number; y: Vec3 } {
  const g0 = Math.exp(md.m01 * x[1] * x[1]), g1 = Math.exp(md.m01 * x[0] * x[0]);
  const gam = [g0, g1, 1];
  let T = 350;
  for (let it = 0; it < 100; it++) {
    let s = 0, ds = 0;
    for (let i = 0; i < 3; i++) {
      const p = Math.exp(md.A[i]! - md.B[i]! / T);
      s += x[i]! * gam[i]! * p;
      ds += x[i]! * gam[i]! * p * md.B[i]! / (T * T);
    }
    const dT = (s - 1) / ds;
    T -= dT;
    if (Math.abs(dT) < 1e-12) break;
  }
  const y = [0, 1, 2].map((i) => x[i]! * gam[i]! * Math.exp(md.A[i]! - md.B[i]! / T)) as Vec3;
  return { T, y };
}

/** The engine's answer, as the page would read it: one op per grid node. */
function opsOf(md: Model, n: number): OpLike[] {
  const names = ["a", "b", "c"];
  return gridCompositions(n).map((g) => {
    const b = bubble(md, g.x);
    const d: { [k: string]: number } = { T_bubble: b.T };
    names.forEach((c, k) => { d[`y_eq_${c}`] = b.y[k]!; });
    return { name: gridOpName(g.i, g.j), diagnostics: d };
  });
}

const fieldOf = (md: Model, n: number): RcmField =>
  readRcmField(opsOf(md, n), ["a", "b", "c"], n, 1e5);

//  Boiling points at P = 1 (ln P = 0): Tb_i = B_i / A_i.
const ZEOTROPIC: Model = { A: [10, 10, 10], B: [3300, 3600, 3900], m01: 0 };
//  a and b close, c heavy, a strong positive deviation on a-b: a minimum-
//  boiling a-b azeotrope that is the lightest point -> one region.
const HEAVY_THIRD: Model = { A: [10, 10, 10], B: [3500, 3540, 4200], m01: 1.6 };
//  The same pair with a LIGHT third component: the azeotrope is a saddle, a
//  boundary runs from it to c, and a and b end two regions.
const LIGHT_THIRD: Model = { A: [10, 10, 10], B: [3500, 3540, 3000], m01: 1.6 };

/** The exact a-b azeotrope of a model, by bisection on y_a - x_a. */
function exactAzeotrope(md: Model): { xa: number; T: number } {
  let lo = 0.01, hi = 0.99;
  const g = (s: number) => { const b = bubble(md, [s, 1 - s, 0]); return b.y[0] - s; };
  const glo = g(lo);
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (g(mid) * glo > 0) lo = mid; else hi = mid;
  }
  const xa = (lo + hi) / 2;
  return { xa, T: bubble(md, [xa, 1 - xa, 0]).T };
}

// ---- tests ---------------------------------------------------------------------------

describe("the singular points", () => {
  it("a zeotropic mixture: three pure components, lightest unstable, heaviest stable, middle a saddle", () => {
    const f = fieldOf(ZEOTROPIC, 20);
    const sps = singularPoints(f);
    expect(sps.map((s) => s.kind)).toEqual(["pure", "pure", "pure"]);
    expect(sps.map((s) => s.type)).toEqual(["unstable node", "saddle", "stable node"]);
    expect(sps.map((s) => s.jacobianType)).toEqual(["unstable node", "saddle", "stable node"]);
  });

  it("finds a binary azeotrope to within one grid cell, and to within a refined cell after refinement", () => {
    const n = 20, f = fieldOf(HEAVY_THIRD, n);
    const ex = exactAzeotrope(HEAVY_THIRD);
    const coarse = singularPoints(f);
    const az = coarse.filter((s) => s.kind === "binary azeotrope");
    expect(az).toHaveLength(1);
    expect(Math.abs(az[0]!.x[0] - ex.xa)).toBeLessThan(1 / n);
    expect(az[0]!.type).toBe("unstable node");
    expect(az[0]!.edge).toEqual([0, 1]);
    //  The refinement run, answered by the same model.
    const plan = refinementPlan(f, coarse);
    const refinedOps: OpLike[] = plan.points.map((x, k) => {
      const b = bubble(HEAVY_THIRD, x);
      return { name: `r_${k}`, diagnostics: { T_bubble: b.T, y_eq_a: b.y[0], y_eq_b: b.y[1], y_eq_c: b.y[2] } };
    });
    const sps = applyRefinement(f, coarse, plan, readRefinement(refinedOps, ["a", "b", "c"], plan.points));
    const r = sps.find((s) => s.kind === "binary azeotrope")!;
    expect(r.refined).toBe(true);
    expect(Math.abs(r.x[0] - ex.xa)).toBeLessThan(r.resolution);
    expect(Math.abs(r.T - ex.T)).toBeLessThan(0.05);
  });

  it("an azeotrope that is a saddle when the third component is lighter", () => {
    const sps = singularPoints(fieldOf(LIGHT_THIRD, 20));
    const az = sps.find((s) => s.kind === "binary azeotrope")!;
    expect(az.type).toBe("saddle");
    expect(az.jacobianType).toBe("saddle");
    expect(sps.find((s) => s.x[2] === 1)!.type).toBe("unstable node");
    expect(sps.filter((s) => s.type === "stable node")).toHaveLength(2);
  });
});

describe("curves, boundaries and regions", () => {
  it("no boundary and one region when the azeotrope is the lightest point", () => {
    const f = fieldOf(HEAVY_THIRD, 20);
    const sps = singularPoints(f);
    expect(separatrices(f, sps)).toHaveLength(0);
    const regs = regionsOf(f, sps, 8);
    expect(regs).toHaveLength(1);
    expect(sps[regs[0]!.un!]!.kind).toBe("binary azeotrope");
    expect(sps[regs[0]!.sn!]!.x[2]).toBe(1);
  });

  it("one boundary from the light component to the saddle, and two regions", () => {
    const f = fieldOf(LIGHT_THIRD, 20);
    const sps = singularPoints(f);
    const b = separatrices(f, sps);
    expect(b).toHaveLength(1);
    const ends = [b[0]!.curve.start, b[0]!.curve.end].map((k) => sps[k!]!);
    expect(ends.map((s) => s.kind).sort()).toEqual(["binary azeotrope", "pure"]);
    expect(regionsOf(f, sps, 10).filter((r) => r.un !== null && r.sn !== null)).toHaveLength(2);
  });

  it("temperature only rises along a curve, curves do not cross, and every curve ends at nodes", () => {
    for (const md of [ZEOTROPIC, HEAVY_THIRD, LIGHT_THIRD]) {
      const f = fieldOf(md, 20);
      const sps = singularPoints(f);
      const curves = seedGrid(6).map((s) => residueCurve(f, s, sps));
      for (const c of curves) {
        expect(largestTDrop(c)).toBeLessThan(0.05);
        expect(c.start).not.toBeNull();
        expect(c.end).not.toBeNull();
        expect(sps[c.start!]!.type).toBe("unstable node");
        expect(sps[c.end!]!.type).toBe("stable node");
        expect(c.T[c.T.length - 1]!).toBeGreaterThan(c.T[0]!);
      }
      for (let a = 0; a < curves.length; a++)
        for (let k = a + 1; k < curves.length; k++)
          expect(curvesCross(curves[a]!, curves[k]!, sps, 0.1)).toBe(false);
    }
  });

  it("the lever rule: D/F reproduces the feed from D and B", () => {
    const f = fieldOf(LIGHT_THIRD, 20);
    const sps = singularPoints(f);
    const bounds = separatrices(f, sps);
    const F: Vec3 = [0.5, 0.2, 0.3];
    const reg = regionOf(f, F, sps);
    const splits = limitingSplits(F, reg, sps, bounds);
    expect(splits.map((s) => s.name)).toEqual(["direct", "indirect"]);
    for (const s of splits) {
      const r = s.DoverF;
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
      for (let c = 0; c < 3; c++)
        expect(r * s.D[c]! + (1 - r) * s.B[c]!).toBeCloseTo(F[c]!, 9);
    }
    //  The direct split's distillate is the region's unstable node: here c.
    expect(splits[0]!.D[2]).toBeCloseTo(1, 9);
  });
});

describe("the case the page asks the engine to run", () => {
  it("one propertyPoint per grid composition, asking for T_bubble and every y_eq", () => {
    const files = rcmGridCaseFiles(["ethanol", "water", "ethyleneGlycol"], 1.01325, 6);
    const ops = files["system/propsDict"]!.match(/type propertyPoint;/g) ?? [];
    expect(ops).toHaveLength((7 * 8) / 2);
    expect(files["system/propsDict"]).toContain("properties ( T_bubble y_eq_ethanol y_eq_water y_eq_ethyleneGlycol );");
    const tag = rcmTag(["ethanol", "water", "ethyleneGlycol"], 1.01325, 6);
    expect(files["system/propsDict"]).toContain(`name ${gridOpName(6, 0, tag)};`);
    expect(files["constant/thermoPhysPropDict"]).toContain("activityModel NRTL;");
    const cf = filesToCaseFiles("residueCurveMap", files);
    expect(cf).toBeTruthy();
  });

  it("the refinement run carries the liquid-liquid check in its own two-liquid package", () => {
    const files = rcmRefineCaseFiles(["a", "b", "c"], 1, [[0.5, 0.5, 0]], 330);
    expect(files["system/propsDict"]).toContain("mode lle;");
    expect(files["system/propsDict"]).toContain("formulation gammaGamma;");
    expect(files["system/propsDict"]).toContain("T 330 K;");
    expect(filesToCaseFiles("residueCurveMap", files)).toBeTruthy();
  });

  it("an answer to another question is not read: the tag names the components, pressure and grid", () => {
    const tagA = rcmTag(["a", "b", "c"], 1, 4), tagB = rcmTag(["a", "b", "c"], 5, 4);
    expect(tagA).not.toBe(tagB);
    const ops = opsOf(ZEOTROPIC, 4).map((o) => ({ ...o, name: o.name.replace(/^g_/, `g_${tagA}_`) }));
    expect(readRcmField(ops, ["a", "b", "c"], 4, 1e5, tagA).missing).toBe(0);
    expect(readRcmField(ops, ["a", "b", "c"], 4, 5e5, tagB).missing).toBe(15);
  });

  it("a node the engine did not answer is missing, never filled", () => {
    const ops = opsOf(ZEOTROPIC, 4).filter((o) => o.name !== gridOpName(1, 1));
    const f = readRcmField(ops, ["a", "b", "c"], 4, 1e5);
    expect(f.missing).toBe(1);
    expect(f.nodes[1]![1]).toBeNull();
  });
});

describe("the page", () => {
  it("renders its lesson and controls before any run", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(ResidueCurvesTool)));
    expect(html).toContain("Residue curve maps");
    for (const s of RCM_STEPS) expect(html).toContain(s.title.slice(0, 30));
    expect(html).toContain("published azeotropes beside the engine");
  });

  it("every preset's components are catalogue names the published table can match", () => {
    const names = new Set(RCM_PRESETS.flatMap((p) => p.comps));
    for (const pa of PUBLISHED_AZEOTROPES)
      for (const c of pa.pair) expect(names.has(c), c).toBe(true);
  });
});
