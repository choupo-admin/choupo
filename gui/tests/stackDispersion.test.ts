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
  stack-dispersion (DEV.md 4c C247): the page's arithmetic held to hand
  calculations written IN this file, the image-source derivation checked
  numerically, the inversion checked to 1 %, Turner's key spot-checked, and the
  engine half's emission held to the NO flow the engine published.

  THE WORKED EXAMPLE (recomputed by hand below).  Class D, open country, a
  source of Q = 100 g/s at effective height H = 50 m in a 5 m/s wind, at
  x = 1000 m:
      sigma_y = 0.08 x (1 + 1e-4 x)^(-1/2) = 80 / sqrt(1.1)   = 76.277 m
      sigma_z = 0.06 x (1 + 1.5e-3 x)^(-1/2) = 60 / sqrt(2.5) = 37.947 m
      C(x,0,0) = Q / (pi u sigma_y sigma_z) exp(-H^2 / 2 sigma_z^2)
               = 9.2324e-4 g/m3 = 923.24 ug/m3
  The coefficients are Briggs' open-country class D values, checked against
  Hanna, Briggs & Hosker (1982) Table 4.5, p. 30 (2026-11-09); the urban set
  was checked there and in ISC3 Vol. II Tables 1-3, 1-4, and the second
  example uses it.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import {
  CLASSES, F_SPLIT, SIGMA_SETS, TURNER_TABLE, buoyancyFlux, effectiveHeight,
  emissionFromStream, exitVelocity, finalRise, gepHeight, glcAt,
  groundCentreline, groundMax, leastStackHeight, pickClasses, plumeConcentration,
  sigmaY, sigmaZ, windBand, worstClass, type Release, type StabilityClass,
} from "../src/ui/methods/stackDispersionMath.js";
import {
  STACK_LIMITS, STACK_QUIZ, STACK_SOURCES, STACK_STEPS,
} from "../src/ui/methods/stackDispersionLesson.js";
import { StackDispersionTool } from "../src/ui/methods/StackDispersionTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { STACK_WITNESS } from "../src/ui/methods/stackDispersionToy.js";
import { witnessOutput } from "./witnessRead.js";

//  Plotly needs a browser; the figures' DATA is held by the pure functions
//  above, and the page test only needs the surrounding markup.
vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: { series: ["#26c6da", "#ffb74d"] },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {}, margin: {} },
}));

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel: number, what = "") => {
  const err = Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  expect(err, `${what}: ${a} vs ${b}`).toBeLessThan(rel);
};

describe("the Gaussian plume and its image source", () => {
  const Q = 100, u = 5, sy = 76.277, sz = 37.947, H = 50;
  const single = (y: number, z: number) =>
    (Q / (2 * Math.PI * u * sy * sz)) * Math.exp(-(y * y) / (2 * sy * sy))
    * Math.exp(-((z - H) ** 2) / (2 * sz * sz));

  it("the image makes the slope in z zero at the ground; the single bell does not", () => {
    const h = 1e-4;
    const slope = (g: (z: number) => number) => (g(h) - g(-h)) / (2 * h);
    const withImage = slope((z) => plumeConcentration(Q, u, sy, sz, H, 0, z));
    const alone = slope((z) => single(0, z));
    near(alone, H * single(0, 0) / (sz * sz), 1e-6, "slope of the single bell is C H / sigma_z^2");
    expect(Math.abs(withImage)).toBeLessThan(1e-12 * Math.abs(alone) + 1e-15);
    expect(alone).toBeGreaterThan(0);
  });

  it("at the ground the pair is exactly twice the free-air value", () => {
    near(plumeConcentration(Q, u, sy, sz, H, 0, 0), 2 * single(0, 0), 1e-12);
    near(plumeConcentration(Q, u, sy, sz, H, 30, 0), 2 * single(30, 0), 1e-12);
  });

  it("the plume carries Q through a plane across the wind (normalisation)", () => {
    //  numerical double integral of u C over y in [-6 sy, 6 sy], z in [0, 8 sz + H]
    //  : the image makes the half-space integral equal Q
    const ny = 400, nz = 600, ymax = 6 * sy, zmax = H + 8 * sz;
    let sum = 0;
    for (let i = 0; i < ny; i++) {
      const y = -ymax + ((i + 0.5) * 2 * ymax) / ny;
      for (let j = 0; j < nz; j++) {
        const z = ((j + 0.5) * zmax) / nz;
        sum += u * plumeConcentration(Q, u, sy, sz, H, y, z);
      }
    }
    sum *= ((2 * ymax) / ny) * (zmax / nz);
    near(sum, Q, 2e-3, "integral of u C over the plane");
  });
});

describe("the worked example, by hand", () => {
  it("class D, open country, x = 1 km: sigma_y, sigma_z and the ground value", () => {
    const x = 1000;
    const syHand = (0.08 * x) / Math.sqrt(1 + 0.0001 * x);
    const szHand = (0.06 * x) / Math.sqrt(1 + 0.0015 * x);
    near(sigmaY(x, "D", "rural"), syHand, 1e-12);
    near(sigmaZ(x, "D", "rural"), szHand, 1e-12);
    near(syHand, 76.277, 1e-5, "hand sigma_y");
    near(szHand, 37.947, 1e-5, "hand sigma_z");
    const C = (100 / (Math.PI * 5 * syHand * szHand)) * Math.exp(-(50 * 50) / (2 * szHand * szHand));
    near(C, 9.2324e-4, 1e-4, "hand ground value, g/m3");
    near(groundCentreline(100, 5, syHand, szHand, 50), C, 1e-12);
  });

  it("urban class C, x = 500 m: the printed set 0.22 x (1 + 4e-4 x)^-1/2 and 0.20 x", () => {
    near(sigmaY(500, "C", "urban"), (0.22 * 500) / Math.sqrt(1.2), 1e-12);
    near(sigmaZ(500, "C", "urban"), 0.2 * 500, 1e-12);
    near(sigmaZ(500, "A", "urban"), 0.24 * 500 * Math.sqrt(1.5), 1e-12);
    expect(SIGMA_SETS.urban.verified).toBe("read");
    expect(SIGMA_SETS.rural.verified).toBe("read");
    // urban E-F sigma_z: ISC3 Table 1-4 prints 0.0015 (the handbook's 0.00015 is a probable misprint)
    near(sigmaZ(10000, "E", "urban"), (0.08 * 10000) / Math.sqrt(1 + 0.0015 * 10000), 1e-12);
    near(sigmaZ(10000, "E", "urban"), 200, 1e-12);
  });

  it("rural set, as printed in Hanna et al. Table 4.5: D at 1000 m, F at 5000 m, A at 2000 m", () => {
    near(sigmaY(1000, "D", "rural"), (0.08 * 1000) / Math.sqrt(1.1), 1e-12);
    near(sigmaZ(1000, "D", "rural"), (0.06 * 1000) / Math.sqrt(1 + 0.0015 * 1000), 1e-12);
    near(sigmaZ(1000, "D", "rural"), 37.947, 1e-3);
    near(sigmaZ(5000, "F", "rural"), (0.016 * 5000) / (1 + 0.0003 * 5000), 1e-12);
    near(sigmaZ(5000, "F", "rural"), 32, 1e-12);
    near(sigmaZ(2000, "A", "rural"), 400, 1e-12);
    near(sigmaY(2000, "A", "rural"), (0.22 * 2000) / Math.sqrt(1.2), 1e-12);  });

  it("the buoyancy flux and the rise: F = 20.804 m4/s3, 52.18 m at 4 m/s", () => {
    const F = (9.80665 * 12 * 1.5 * 1.5 * (420 - 288)) / (4 * 420);
    near(buoyancyFlux(12, 1.5, 420, 288), F, 1e-12);
    near(F, 20.8041, 1e-6);
    near(finalRise(F, 4, "D", 288), (21.425 * Math.pow(F, 0.75)) / 4, 1e-12);
    near(finalRise(F, 4, "D", 288), 52.176, 1e-4);
    //  the two regimes meet at 55 m4/s3 to within 1 %: a check on the two constants
    near(21.425 * Math.pow(F_SPLIT, 0.75), 38.71 * Math.pow(F_SPLIT, 0.6), 0.01, "continuity at 55");
    expect(finalRise(100, 4, "C", 288)).toBeCloseTo((38.71 * Math.pow(100, 0.6)) / 4, 9);
    //  stable air: 2.6 (F / (u s))^(1/3), s = g/Ta * 0.035 for F
    const s = (9.80665 / 288) * 0.035;
    near(finalRise(F, 4, "F", 288), 2.6 * Math.cbrt(F / (4 * s)), 1e-12);
    expect(finalRise(0, 4, "D", 288)).toBe(0);
    expect(finalRise(-3, 4, "D", 288)).toBe(0);
  });
});

describe("the ground maximum", () => {
  it("constant width ratio: the maximum sits at sigma_z = H / sqrt 2 and equals 2Q/(pi e u H^2) sigma_z/sigma_y", () => {
    const Q = 80, u = 3, H = 70, kappa = 1.4;
    const f = (sz: number) => groundCentreline(Q, u, kappa * sz, sz, H);
    let best = 0, at = 0;
    for (let sz = 1; sz < 300; sz += 0.01) { const v = f(sz); if (v > best) { best = v; at = sz; } }
    near(at, H / Math.SQRT2, 2e-3, "where");
    near(best, (2 * Q) / (Math.PI * Math.E * u * H * H * kappa), 1e-5, "how much");
    //  and the 1/H^2 law the lesson draws from it
    const peak = (h: number) => (2 * Q) / (Math.PI * Math.E * u * h * h * kappa);
    near(peak(2 * H), peak(H) / 4, 1e-12);
  });

  it("the search finds the maximum the brute force finds", () => {
    const r: Release = { Q: 5, u: 4, hs: 40, d: 1.5, vs: 12, Ts: 420, Ta: 288 };
    for (const cls of CLASSES) {
      const m = groundMax(r, cls, "rural");
      let best = 0;
      for (let x = 100; x <= 10000; x *= 1.002) best = Math.max(best, glcAt(r, cls, "rural", x));
      near(m.C, best, 2e-3, `class ${cls}`);
      expect(m.C).toBeGreaterThanOrEqual(best * 0.999);
    }
  });

  it("a taller stack lowers the maximum, in every class", () => {
    const r: Release = { Q: 5, u: 4, hs: 20, d: 1.5, vs: 12, Ts: 420, Ta: 288 };
    for (const cls of CLASSES) {
      const a = groundMax(r, cls, "urban").C, b = groundMax({ ...r, hs: 60 }, cls, "urban").C;
      expect(b, cls).toBeLessThan(a);
    }
  });

  it("the two night-and-day claims: unstable is worst close in, stable far out", () => {
    const r: Release = { Q: 5, u: 2.5, hs: 40, d: 1.5, vs: 12, Ts: 420, Ta: 288 };
    expect(glcAt(r, "A", "rural", 300)).toBeGreaterThan(1e3 * glcAt(r, "F", "rural", 300));
    expect(glcAt(r, "F", "rural", 10000)).toBeGreaterThan(5 * glcAt(r, "A", "rural", 10000));
    expect(groundMax(r, "A", "rural").x).toBeLessThan(groundMax(r, "F", "rural").x);
  });

  it("a tall stack in stable air has its maximum at the window's edge, flagged", () => {
    const r: Release = { Q: 5, u: 4, hs: 80, d: 1.5, vs: 12, Ts: 420, Ta: 288 };
    expect(groundMax(r, "F", "rural").atEdge).toBe(true);
    expect(groundMax(r, "D", "rural").atEdge).toBe(false);
  });
});

describe("the inversion: the height the page reports puts the maximum at the limit", () => {
  const base: Release = { Q: 5, u: 4, hs: 0, d: 1.5, vs: 12, Ts: 420, Ta: 288 };
  const cases: { classes: StabilityClass[]; t: "rural" | "urban"; limit: number; r?: Partial<Release> }[] = [
    { classes: ["B", "C"], t: "rural", limit: 20e-6 },
    { classes: [...CLASSES], t: "rural", limit: 5e-6 },
    { classes: ["E"], t: "urban", limit: 10e-6 },
    { classes: ["A", "B"], t: "urban", limit: 8e-6, r: { Ts: 288 } },       // a cold stack: no rise
    { classes: ["D"], t: "rural", limit: 50e-6, r: { Q: 30, u: 2 } },
  ];
  it.each(cases)("%j", ({ classes, t, limit, r }) => {
    const rel = { ...base, ...r };
    const hs = leastStackHeight(rel, classes, t, limit);
    expect(hs).not.toBeNull();
    expect(hs!).toBeGreaterThan(0);
    const w = worstClass({ ...rel, hs: hs! }, classes, t);
    near(w.max.C, limit, 0.01, "worst maximum at the reported height");
    //  just below it the limit is exceeded
    expect(worstClass({ ...rel, hs: hs! - 0.5 }, classes, t).max.C).toBeGreaterThan(limit);
  });

  it("0 when the limit is met without a stack, null when 1000 m is not enough", () => {
    expect(leastStackHeight({ ...base, Q: 0.001 }, ["D"], "rural", 1)).toBe(0);
    expect(leastStackHeight({ ...base, Q: 1e9, Ts: 288 }, ["D"], "rural", 1e-9)).toBeNull();
  });
});

describe("Turner's key", () => {
  const w = (day: boolean, ins: "strong" | "moderate" | "slight", cloud: "overcast" | "clear", u: number) =>
    pickClasses({ day, insolation: ins, cloud, wind10: u });
  it("spot checks of the table as the page prints it", () => {
    expect(w(true, "moderate", "clear", 3.5)).toEqual(["B", "C"]);
    expect(w(true, "strong", "clear", 1)).toEqual(["A"]);
    expect(w(true, "strong", "clear", 7)).toEqual(["C"]);
    expect(w(false, "slight", "clear", 2.5)).toEqual(["F"]);
    expect(w(false, "slight", "overcast", 2.5)).toEqual(["E"]);
    expect(w(false, "slight", "clear", 1)).toEqual([]);
    expect(w(false, "slight", "clear", 8)).toEqual(["D"]);
  });
  it("bands: a lower bound belongs to the band above", () => {
    expect([1.9, 2, 2.99, 3, 4.99, 5, 6, 6.01].map(windBand))
      .toEqual(["<2", "2-3", "2-3", "3-5", "3-5", "5-6", "5-6", ">6"]);
  });
  it("every cell holds only classes A-F, at most two, adjacent", () => {
    for (const band of Object.values(TURNER_TABLE))
      for (const cell of Object.values(band)) {
        expect(cell.length).toBeLessThanOrEqual(2);
        if (cell.length === 2) expect(CLASSES.indexOf(cell[1]!) - CLASSES.indexOf(cell[0]!)).toBe(1);
      }
  });
});

describe("building downwash", () => {
  it("H_GEP = H_b + 1.5 L, L the lesser of height and width (40 CFR 51.100(ii))", () => {
    expect(gepHeight(20, 30)).toBeCloseTo(50, 12);   // L = 20
    expect(gepHeight(40, 25)).toBeCloseTo(77.5, 12); // L = 25
  });
});

describe("the engine half reads the stream and recomputes nothing", () => {
  //  The run output is the engine's own converged flueGas (gitignored,
  //  generated by the witness setup from THIS tree's binary).
  const text = witnessOutput(`tutorials/steady/gibbs/${STACK_WITNESS}`, "converged/flueGas");
  const flows: { [c: string]: number } = {};
  const block = /componentMolarFlows\s*\{([^}]*)\}/.exec(text)![1]!;
  for (const m of block.matchAll(/^\s*(\S+)\s+([-+0-9.eE]+)\s*kmol\/h\s*;/gm)) flows[m[1]!] = Number(m[2]);
  const T = Number(/^T\s+([-+0-9.eE]+)\s*K\s*;/m.exec(text)![1]);
  const P = Number(/^P\s+([-+0-9.eE]+)\s*Pa\s*;/m.exec(text)![1]);
  const total = Object.values(flows).reduce((a, b) => a + b, 0);
  const stream = {
    F: total / 3600, T, P,
    composition: Object.fromEntries(Object.entries(flows).map(([c, v]) => [c, v / total])),
  };

  it("the stream carries NO at a few hundred ppm and the burner's temperature", () => {
    expect(flows["NO"]).toBeGreaterThan(0);
    expect(stream.T).toBeCloseTo(1800, 6);
    expect(stream.composition["NO"]! * 1e6).toBeGreaterThan(50);
    expect(stream.composition["NO"]! * 1e6).toBeLessThan(1000);
  });

  it("Q = trains x NO flow x molar mass, by hand from the NO flow itself", () => {
    const MNO = 30.006; // the catalogue record's MW, g/mol (data/standards/components/NO.dat)
    const trains = 100;
    const hand = trains * (flows["NO"]! * 1000 / 3600) * MNO; // kmol/h -> mol/s, x g/mol
    const e = emissionFromStream(stream, "NO", MNO, trains, 450);
    near(e.Q, hand, 1e-12, "Q, g/s");
    //  volume flow of the ideal gas at the stack temperature, by hand
    const n = trains * (total * 1000 / 3600);
    near(e.Vdot, (n * 8.314462618 * 450) / P, 1e-12, "V, m3/s");
    near(exitVelocity(e.Vdot, 1.5), (4 * e.Vdot) / (Math.PI * 2.25), 1e-12);
  });

  it("and the emission feeds the same inversion as the toy", () => {
    const e = emissionFromStream(stream, "NO", 30.006, 100, 450);
    const r: Release = { Q: e.Q, u: 4, hs: 0, d: 1.5, vs: exitVelocity(e.Vdot, 1.5), Ts: 450, Ta: 288 };
    const hs = leastStackHeight(r, ["B", "C"], "rural", 5e-6);
    expect(hs).not.toBeNull();
    near(worstClass({ ...r, hs: hs! }, ["B", "C"], "rural").max.C, 5e-6, 0.01);
    expect(effectiveHeight({ ...r, hs: 10 }, "D")).toBeGreaterThan(10);
  });
});

describe("the lesson, the registry and the page", () => {
  it("steps are numbered 1..n once, and the quiz names real steps", () => {
    expect(STACK_STEPS.map((s) => s.n)).toEqual(STACK_STEPS.map((_, i) => i + 1));
    const ns = new Set(STACK_STEPS.map((s) => s.n));
    for (const q of STACK_QUIZ) for (const n of q.steps) expect(ns.has(n), q.id).toBe(true);
    expect(STACK_LIMITS.length).toBeGreaterThanOrEqual(6);
  });

  it("every source says whether it was read; the originals not seen are stated", () => {
    for (const s of STACK_SOURCES) expect(["read", "partly", "not read"]).toContain(s.read);
    const turner = STACK_SOURCES.find((s) => s.id === "turner-1970")!;
    expect(turner.read).toBe("read");
    expect(turner.used).toContain("Table 3-1");
    expect(turner.used).toContain("edition itself was not seen");
    expect(STACK_STEPS.map((s) => s.body).join(" ")).toContain("checked against Turner's Table 3-1");
  });

  it("compiles in no limit value: the limit starts as an invitation to type one", () => {
    expect(read("gui/src/ui/methods/stackDispersionToy.ts")).toContain("type the source of your limit");
    expect(read("gui/src/ui/methods/stackDispersionLesson.ts")).toContain("compiles in no limit");
  });

  it("is a live registry entry on the Process safety shelf with its theory label", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "stack-dispersion")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe("Process safety");
    expect(t.theory).toBe("ch:stack-dispersion");
    expect(t.blurb.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(read("docs/theoryGuide.tex")).toContain("\\label{ch:stack-dispersion}");
  });

  const html = renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(StackDispersionTool)));
  it("draws the four figures, both halves, the table with one lit cell and the design block", () => {
    for (const fig of ["i", "ii", "iii", "iv"]) expect(html, fig).toContain(`data-figure="${fig}"`);
    expect(html).toContain('data-half="toy"');
    expect(html).toContain('data-half="engine"');
    expect((html.match(/data-lit="yes"/g) ?? []).length).toBe(1);
    expect(html).toContain("data-design");
    expect(html).toContain("Least stack height");
    expect(html).toContain("READ");
    expect(html).toContain("data-lesson-quiz");
    for (const q of STACK_QUIZ) expect(html, q.id).toContain(`data-quiz-question="${q.id}"`);
  });
});
