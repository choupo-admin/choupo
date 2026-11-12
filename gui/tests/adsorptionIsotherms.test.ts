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
  adsorptionIsotherms — the arithmetic of the `adsorption-isotherms` EduTool
  (gui/src/case/adsorptionIsotherms.ts), held to answers known in advance:

    * the direct fits recover the generating parameters of noise-free
      synthetic points to tight tolerance, under both weightings;
    * the straight-line fits match a hand calculation, sum by sum;
    * the standard errors match an independent route (a central-difference
      Jacobian and a 2-by-2 inverse written out here), and the fitted point
      is a minimum (the gradient of S vanishes);
    * the paste parser refuses malformed input by line and reads what a
      spreadsheet copy looks like;
    * the batch balance matches a hand value, and refuses what it must;
    * the shipped synthetic sets are reproducible, and the noisy fits land
      within a few standard errors of their own truth;
    * the page renders its lesson and its first results with no engine.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  C_UNITS, MODELS, Q_UNITS, SYNTHETIC,
  batchDose, diagnostics, directFit, isothermQ, linearisedFit, parsePoints, syntheticPoints,
  type ModelId, type Pt,
} from "../src/case/adsorptionIsotherms.js";
import { AdsorptionIsothermsTool } from "../src/ui/methods/AdsorptionIsothermsTool.js";
import { ISO_STEPS } from "../src/ui/methods/adsorptionIsothermsLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

function exact(model: ModelId, params: number[], cs: number[]): Pt[] {
  return cs.map((c) => ({ c, q: isothermQ(model, params, c) }));
}
const LOGC = Array.from({ length: 10 }, (_, k) => 0.05 * Math.pow(2, k));   // 0.05 .. 25.6

describe("direct fits recover known parameters from noise-free points", () => {
  const truths: [ModelId, number[]][] = [
    ["linear", [0.37]],
    ["langmuir", [42, 1.7]],
    ["freundlich", [5.5, 0.42]],
  ];
  for (const [model, p] of truths) {
    for (const w of ["absolute", "relative"] as const) {
      it(`${model}, ${w} residuals`, () => {
        const f = directFit(model, exact(model, p, LOGC), w);
        expect(f.converged).toBe(true);
        p.forEach((v, k) => expect(rel(f.params[k]!, v)).toBeLessThan(1e-8));
        expect(f.rms).toBeLessThan(1e-8 * Math.max(...LOGC.map((c) => isothermQ(model, p, c))));
      });
    }
  }

  it("Langmuir recovers from a poor start, far from the answer", () => {
    const f = directFit("langmuir", exact("langmuir", [42, 1.7], LOGC), "absolute", [1, 100]);
    expect(rel(f.params[0]!, 42)).toBeLessThan(1e-8);
    expect(rel(f.params[1]!, 1.7)).toBeLessThan(1e-8);
  });

  it("the straight-line fits are exact too on noise-free points", () => {
    const lang = linearisedFit("langmuir", exact("langmuir", [42, 1.7], LOGC));
    expect(rel(lang.params[0]!, 42)).toBeLessThan(1e-10);
    expect(rel(lang.params[1]!, 1.7)).toBeLessThan(1e-10);
    const fr = linearisedFit("freundlich", exact("freundlich", [5.5, 0.42], LOGC));
    expect(rel(fr.params[0]!, 5.5)).toBeLessThan(1e-10);
    expect(rel(fr.params[1]!, 0.42)).toBeLessThan(1e-10);
  });
});

describe("the straight-line fits, against a hand calculation", () => {
  //  Four points worked by hand: c = 1, 2, 4, 8; q = 3, 5, 7, 8.
  const pts: Pt[] = [{ c: 1, q: 3 }, { c: 2, q: 5 }, { c: 4, q: 7 }, { c: 8, q: 8 }];

  it("linear: K = sum(c q)/sum(c^2) = 105/85", () => {
    expect(linearisedFit("linear", pts).params[0]).toBeCloseTo(105 / 85, 12);
    expect(directFit("linear", pts).params[0]).toBeCloseTo(105 / 85, 12);
  });

  it("Langmuir: 1/q against 1/c", () => {
    //  x = 1/c = 1, 0.5, 0.25, 0.125;  y = 1/q = 1/3, 1/5, 1/7, 1/8.
    const x = [1, 0.5, 0.25, 0.125], y = [1 / 3, 1 / 5, 1 / 7, 1 / 8];
    const n = 4, Sx = 1.875, Sy = y.reduce((a, b) => a + b, 0);
    const Sxx = 1 + 0.25 + 0.0625 + 0.015625, Sxy = x.reduce((a, v, i) => a + v * y[i]!, 0);
    const slope = (n * Sxy - Sx * Sy) / (n * Sxx - Sx * Sx);
    const intercept = (Sy - slope * Sx) / n;
    const f = linearisedFit("langmuir", pts);
    expect(slope).toBeCloseTo(0.24289855072463765, 12);
    expect(intercept).toBeCloseTo(0.08643892339544516, 12);
    expect(f.params[0]).toBeCloseTo(1 / intercept, 10);          // q_max = 11.5689
    expect(f.params[1]).toBeCloseTo(slope / intercept, 10);      // K_L = 2.8101
    expect(f.params[0]).toBeCloseTo(11.568862275449098, 9);
    expect(f.params[1]).toBeCloseTo(2.81005988023952, 9);
  });

  it("Freundlich: log q against log c", () => {
    const f = linearisedFit("freundlich", pts);
    expect(f.params[1]).toBeCloseTo(0.47305393250067723, 12);
    expect(f.params[0]).toBeCloseTo(3.2920368403067592, 10);
  });

  it("the straight-line and direct Langmuir fits differ on the same points", () => {
    const lin = linearisedFit("langmuir", pts), dir = directFit("langmuir", pts);
    expect(rel(dir.params[0]!, lin.params[0]!)).toBeGreaterThan(0.01);
    //  The direct fit is the smaller sum of squares on q, by construction.
    expect(dir.rms).toBeLessThan(lin.rms);
  });

  it("a line that crosses below zero refuses, and says why", () => {
    //  1/q falling with 1/c: a negative slope makes K_L negative.
    const f = linearisedFit("langmuir", [{ c: 1, q: 9 }, { c: 2, q: 6 }, { c: 4, q: 5 }, { c: 8, q: 4.5 }]);
    expect(f.refused).toMatch(/not positive|negative/);
  });
});

describe("standard errors and the minimum, by an independent route", () => {
  const pts: Pt[] = [
    { c: 0.5, q: 9.1 }, { c: 1, q: 15.2 }, { c: 2, q: 21.9 }, { c: 4, q: 29.8 },
    { c: 8, q: 33.4 }, { c: 16, q: 37.9 }, { c: 32, q: 39.0 },
  ];
  for (const model of ["langmuir", "freundlich"] as ModelId[]) {
    it(`${model}: s^2 (J'J)^-1 from a central-difference Jacobian`, () => {
      const f = directFit(model, pts);
      const p = f.params;
      const h = p.map((v) => 1e-6 * Math.abs(v));
      const J = pts.map((pt) => p.map((_, k) => {
        const up = [...p], dn = [...p];
        up[k]! += h[k]!; dn[k]! -= h[k]!;
        return (isothermQ(model, up, pt.c) - isothermQ(model, dn, pt.c)) / (2 * h[k]!);
      }));
      const a = J.reduce((s, r) => s + r[0]! * r[0]!, 0);
      const b = J.reduce((s, r) => s + r[0]! * r[1]!, 0);
      const d = J.reduce((s, r) => s + r[1]! * r[1]!, 0);
      const det = a * d - b * b;
      const S = pts.reduce((s, pt) => s + (isothermQ(model, p, pt.c) - pt.q) ** 2, 0);
      const s2 = S / (pts.length - 2);
      expect(rel(f.se![0]!, Math.sqrt((s2 * d) / det))).toBeLessThan(1e-5);
      expect(rel(f.se![1]!, Math.sqrt((s2 * a) / det))).toBeLessThan(1e-5);
      //  the gradient of S vanishes at the answer: J' r = 0
      const r = pts.map((pt) => isothermQ(model, p, pt.c) - pt.q);
      for (let k = 0; k < 2; k++) {
        const g = J.reduce((s, row, i) => s + row[k]! * r[i]!, 0);
        const scale = Math.sqrt(J.reduce((s, row) => s + row[k]! ** 2, 0) * S);
        expect(Math.abs(g) / scale).toBeLessThan(1e-7);
      }
    });
  }

  it("linear: se(K) = sqrt(s^2 / sum c^2)", () => {
    const f = directFit("linear", pts);
    const S = pts.reduce((s, pt) => s + (f.params[0]! * pt.c - pt.q) ** 2, 0);
    const want = Math.sqrt(S / (pts.length - 1) / pts.reduce((s, pt) => s + pt.c * pt.c, 0));
    expect(rel(f.se![0]!, want)).toBeLessThan(1e-12);
  });
});

describe("the paste parser", () => {
  it("reads whitespace, tab, semicolon, a single comma and a decimal comma", () => {
    const p = parsePoints("c q\n1 2\n2\t3\n3;4\n4,5\n5,5 6,25\n# a comment\n6 7  # trailing");
    expect(p.errors).toEqual([]);
    expect(p.header).toBe("c q");
    expect(p.points).toEqual([
      { c: 1, q: 2 }, { c: 2, q: 3 }, { c: 3, q: 4 }, { c: 4, q: 5 }, { c: 5.5, q: 6.25 }, { c: 6, q: 7 },
    ]);
  });

  it("refuses three values on a line, naming the line", () => {
    const p = parsePoints("1 2\n2 3 4\n3 4\n4 5\n5 6");
    expect(p.points).toEqual([]);
    expect(p.errors.join()).toMatch(/line 2 .*3 values/);
  });

  it("refuses a value that is not a number", () => {
    const p = parsePoints("1 2\n2 abc\n3 4\n4 5");
    expect(p.errors.join()).toMatch(/line 2 .*not two numbers/);
  });

  it("refuses zero and negative values, and says why", () => {
    const z = parsePoints("0 0\n1 2\n2 3\n3 4\n4 5");
    expect(z.errors.join()).toMatch(/line 1 .*positive/);
    const n = parsePoints("1 2\n2 -3\n3 4\n4 5");
    expect(n.errors.join()).toMatch(/line 2 .*positive/);
  });

  it("refuses fewer than four points and fewer than three distinct concentrations", () => {
    expect(parsePoints("1 2\n2 3\n3 4").errors.join()).toMatch(/at least 4/);
    expect(parsePoints("1 2\n1 2.1\n2 3\n2 3.1").errors.join()).toMatch(/three distinct/);
  });

  it("does not take a text line after the data for a header", () => {
    const p = parsePoints("1 2\n2 3\nthree 4\n4 5\n5 6");
    expect(p.header).toBeNull();
    expect(p.errors.join()).toMatch(/line 3/);
  });
});

describe("the single-stage batch balance", () => {
  const mgL = C_UNITS.find((u) => u.id === "mg/L")!, mgg = Q_UNITS.find((u) => u.id === "mg/g")!;
  it("matches a hand value: Langmuir 10 mg/g, K_L 2 mg/L, 1 L from 10 to 1 mg/L", () => {
    //  q*(1) = 10*1/(2+1) = 3.3333 mg/g; M = 1 L * (10 - 1) mg/L / 3.3333 mg/g = 2.7 g.
    const b = batchDose({ model: "langmuir", params: [10, 2], cU: mgL, qU: mgg, V_L: 1, c0: 10, removal: 0.9, q0: 0 });
    expect(b.refused).toBeUndefined();
    expect(b.c).toBeCloseTo(1, 12);
    expect(b.q).toBeCloseTo(10 / 3, 12);
    expect(b.M_g).toBeCloseTo(2.7, 12);
    expect(b.slope).toBeCloseTo(1 / 2.7, 12);    // V/M in (mg/g)/(mg/L)
  });

  it("converts g/L and kg/kg to one basis", () => {
    //  The same tank in g/L and kg/kg: c0 = 0.01 g/L, q in kg/kg = mg/g / 1000.
    const gL = C_UNITS.find((u) => u.id === "g/L")!, kgkg = Q_UNITS.find((u) => u.id === "kg/kg")!;
    const b = batchDose({ model: "langmuir", params: [0.01, 0.002], cU: gL, qU: kgkg, V_L: 1, c0: 0.01, removal: 0.9, q0: 0 });
    expect(b.M_g).toBeCloseTo(2.7, 10);
  });

  it("a non-zero starting loading needs more adsorbent", () => {
    const b = batchDose({ model: "langmuir", params: [10, 2], cU: mgL, qU: mgg, V_L: 1, c0: 10, removal: 0.9, q0: 1 });
    expect(b.M_g).toBeCloseTo(9 / (10 / 3 - 1), 12);
  });

  it("refuses a mass concentration with a molar loading", () => {
    const mmolg = Q_UNITS.find((u) => u.id === "mmol/g")!;
    expect(batchDose({ model: "linear", params: [1], cU: mgL, qU: mmolg, V_L: 1, c0: 10, removal: 0.5, q0: 0 }).refused)
      .toMatch(/one basis/);
  });

  it("refuses when the adsorbent already holds more than the isotherm allows at the target", () => {
    expect(batchDose({ model: "langmuir", params: [10, 2], cU: mgL, qU: mgg, V_L: 1, c0: 10, removal: 0.9, q0: 5 }).refused)
      .toMatch(/cannot take the solute/);
  });
});

describe("the shipped synthetic sets", () => {
  it("are reproducible: the same numbers on every run", () => {
    const a = syntheticPoints(SYNTHETIC[0]!), b = syntheticPoints(SYNTHETIC[0]!);
    expect(a).toEqual(b);
    expect(a[0]).toEqual({ c: 0.01, q: 2.368 });
    expect(a[a.length - 1]).toEqual({ c: 100, q: 58.18 });
  });

  for (const s of SYNTHETIC) {
    it(`${s.id}: noise-free, the generating model recovers its parameters`, () => {
      const f = directFit(s.model, syntheticPoints(s, { sigma: 0, exact: true }));
      s.params.forEach((v, k) => expect(rel(f.params[k]!, v)).toBeLessThan(1e-7));
    });
    it(`${s.id}: with its noise, the generating model lands within three standard errors`, () => {
      const f = directFit(s.model, syntheticPoints(s), "relative");
      s.params.forEach((v, k) => expect(Math.abs(f.params[k]! - v) / f.se![k]!).toBeLessThan(3));
    });
  }

  it("each set teaches what its label says", () => {
    const fitsOf = (id: string) => {
      const pts = syntheticPoints(SYNTHETIC.find((s) => s.id === id)!);
      const f = MODELS.map((m) => directFit(m, pts));
      return { pts, f, d: diagnostics(pts, f[1]!, f[2]!) };
    };
    //  carbon: four decades, Freundlich the smallest RMS by a wide margin
    const carbon = fitsOf("carbon");
    expect(carbon.d.decades).toBeCloseTo(4, 6);
    expect(carbon.f[2]!.rms).toBeLessThan(0.5 * carbon.f[1]!.rms);
    //  resin: the plateau is reached, Langmuir the smallest RMS, no range warning about it
    const resin = fitsOf("resin");
    expect(resin.d.thetaMax).toBeGreaterThan(0.9);
    expect(resin.f[1]!.rms).toBeLessThan(resin.f[2]!.rms);
    expect(resin.d.warnings.some((w) => /plateau/.test(w))).toBe(false);
    //  dilute: every point in the linear region, and the page says the models cannot be told apart
    const dilute = fitsOf("dilute");
    expect(dilute.d.thetaMax).toBeLessThan(0.1);
    expect(dilute.d.warnings.some((w) => /cannot be told apart/.test(w))).toBe(true);
    expect(dilute.f[1]!.se![0]! / dilute.f[1]!.params[0]!).toBeGreaterThan(0.3);
  });
});

describe("the page", () => {
  it("is registered, live, and shelved beside the breakthrough page", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "adsorption-isotherms")!;
    const b = METHOD_TOOLS.find((m) => m.id === "breakthrough")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe(b.discipline);
    expect(ISO_STEPS[0]!.leadsTo?.tool).toBe("breakthrough");
  });

  it("renders its lesson, a synthetic set and its fits with no engine", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(AdsorptionIsothermsTool)));
    expect(html).toContain("Adsorption isotherms from laboratory data");
    expect(html).toContain("Synthetic: generated, not measured");
    expect(html).toContain("parameters, standard errors and residuals");
    expect(html).toContain("data-outside-span");
    expect(html).not.toMatch(/NaN/);
  });
});
