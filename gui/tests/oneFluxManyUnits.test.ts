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
  oneFluxManyUnits — the `one-flux-many-units` EduTool (DEV.md 4c C401).

  WHAT IT HOLDS:
    * every conversion of a film coefficient, in both directions, against the
      definitions (Seader Eqs. 3-200, 3-201; Treybal Table 3.1) and the exact
      unit factors;
    * the drift factor: Taylor and Kooijman's logarithm (Eq. 3.82) equals the
      log-mean form (Seader Eq. 3-203);
    * every Henry variant in both directions, and the conversion factors
      Sander prints in his Tables 1, 2 and 3 to the digits printed;
    * the overall coefficients (Treybal 5.7, 5.9, 5.10, 5.11; Seader 3-187,
      3-191) and Seader's Example 3.18 (a), (b) to his printed digits;
    * the curved-line demonstration: the exact interface closes both films,
      the chord m'' reproduces it, the straight Henry line does not;
    * Missen's Example 9-6 table to its printed digits, and the limits of E;
    * every exercise answer, to the digits it prints, against numbers
      computed independently of the page's module;
    * every equation parses; every engine line the lesson cites says what
      the lesson claims; the references are listed; the page renders with the
      solutions hidden.

  WHAT IT DOES NOT HOLD: that the books are right.  The tests hold the page
  to the numbers the books print, where they print them.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  ATM, FORM_PHASE, FORM_UNITS, HENRY_FORMS, MISSEN_9_6, R_GAS, SANDER_EXAMPLES, SANDER_WATER, SO2, T_STD,
  convertFilm, curvedDemo, driftLogMean, eCurves, ePseudoFirst, eVanKrevelen, exercises, fromHcp,
  gasMolarDensity, hatta, henrySlope, logMean, overallConcentration, overallMoleFraction, parseSig,
  reactive, regimeOf, sig, so2slope, so2x, so2y, stagnantFilmRatio, toHcp, toMoleFractionForm,
  type FilmState, type FormId,
} from "../src/case/oneFluxManyUnits.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import {
  NOTATION_ROWS, OFMU_ENGINE_SCOPE, OFMU_LIMITS, OFMU_STEPS, OFMU_TASK,
} from "../src/ui/methods/oneFluxManyUnitsLesson.js";
import { EQ_RB_STEPS } from "../src/ui/methods/equilibriumOrRateBasedLesson.js";
import { OneFluxManyUnitsTool, THEORY_ANCHOR } from "../src/ui/methods/OneFluxManyUnitsTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

/** Equal to a relative tolerance. */
const near = (a: number, b: number, rel = 1e-12): void => {
  expect(Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b)), `${a} vs ${b}`).toBe(true);
};
/** Equal to the d significant figures a source prints. */
const printed = (a: number, b: number, d: number): void => {
  expect(Number(a.toPrecision(d)), `${a} vs ${b} at ${d} digits`).toBe(Number(b.toPrecision(d)));
};

describe("one-flux-many-units: registry", () => {
  it("is a live notes page on the separations shelf, anchored at the rate-based segment", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "one-flux-many-units")!;
    expect(t.status).toBe("live");
    expect(t.kind).toBe("notes");
    expect(t.discipline).toBe("Separations & phase equilibria");
    expect(t.theory).toBe("sec:rateBasedSegment");
    expect(THEORY_ANCHOR).toBe(t.theory);
    expect(t.origins).toEqual(["page", "reference", "assumption"]);
    expect(t.blurb.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(tree("docs/theoryGuide.tex")).toContain("\\label{sec:rateBasedSegment}");
    expect(tree("docs/eduToolsGuide.tex")).toContain("\\label{sec:edu-one-flux-many-units}");
  });
});

describe("one-flux-many-units: film coefficients", () => {
  const s: FilmState = { T: 323.15, P: 2 * ATM, cL: 55000, a: 100, yBLM: 0.95, xBLM: 0.99 };
  const forms: FormId[] = ["ky", "kc", "kp", "kx", "kL"];

  it("the exact unit factors", () => {
    const f = (form: FormId, id: string): number => FORM_UNITS[form].find((u) => u.id === id)!.toSI;
    near(f("kc", "ft/h"), 0.3048 / 3600);
    near(f("ky", "kmol/(m2 h)"), 1000 / 3600);
    //  1 lbmol/(ft2 h) = 453.59237 mol / (0.09290304 m2 x 3600 s)
    near(f("ky", "lbmol/(ft2 h)"), 1.356229899, 1e-9);
    near(f("kp", "kmol/(m2 s kPa)"), 1);
    near(f("kp", "kmol/(m2 h atm)"), 1000 / (3600 * 101325));
  });

  it("k_y = k_c P/(R T) = k_p P and k_x = k_L c (Seader 3-200, 3-201), both directions", () => {
    const cG = gasMolarDensity(s.T, s.P);
    near(cG, 2 * 101325 / (8.314462618 * 323.15));
    near(toMoleFractionForm("kc", 0.03, s), 0.03 * cG);
    near(toMoleFractionForm("kp", 1e-5, s), 1e-5 * s.P);
    near(toMoleFractionForm("kL", 1e-4, s), 1e-4 * 55000);
    //  every form, through the table, back to itself
    for (const f of forms) {
      const v0 = 0.37;
      const rows = convertFilm(f, v0, s);
      for (const g of forms.filter((x) => FORM_PHASE[x] === FORM_PHASE[f])) {
        const vg = rows.find((r) => r.key === g)!.value;
        const back = convertFilm(g, vg, s).find((r) => r.key === f)!.value;
        near(back, v0, 1e-13);
      }
    }
  });

  it("per volume multiplies by a; the stagnant film divides by the log mean", () => {
    const g = convertFilm("ky", 2.0, s);
    near(g.find((r) => r.key === "kya")!.value, 200);
    near(g.find((r) => r.key === "kys")!.value, 2.0 / 0.95);
    near(g.find((r) => r.key === "kca")!.value, (2.0 / gasMolarDensity(s.T, s.P)) * 100);
    const l = convertFilm("kL", 1e-4, s);
    near(l.find((r) => r.key === "kx")!.value, 5.5);
    near(l.find((r) => r.key === "kxs")!.value, 5.5 / 0.99);
    near(l.find((r) => r.key === "kLa")!.value, 1e-2);
  });

  it("Taylor and Kooijman's logarithm (Eq. 3.82) is 1/(y_B)_LM (Seader 3-203)", () => {
    for (const [yb, yi] of [[0.085, 0.084], [0.8, 0.732], [0.3, 0.05], [0.01, 0.0]] as const) {
      near(stagnantFilmRatio(yb, yi), 1 / driftLogMean(yb, yi), 1e-12);
    }
    near(logMean(2, 2), 2);
    expect(logMean(-1, 2)).toBeNaN();
    //  dilute: the drift factor goes to 1
    expect(Math.abs(driftLogMean(1e-4, 0) - 1)).toBeLessThan(1e-4);
  });
});

describe("one-flux-many-units: Henry's law", () => {
  it("reproduces Sander's Table 1 row H^cp = 1 mol/(m3 Pa) to its printed digits", () => {
    const h = fromHcp(1, T_STD);
    printed(h.Hcc, 2478.96, 6);
    printed(h.Hxp * ATM, 1.83089, 6);         // 1/atm
    printed(h.Hbp, 1.00301e-3, 6);            // mol/(kg Pa)
    printed(h.Hbp * ATM, 101.630, 6);         // mol/(kg atm)
    printed(1 * 1000 * ATM / 1e6, 101.325, 6); // the M/atm column, a unit change only
  });

  it("reproduces Sander's Table 2 row K_H^px = 1 atm and the Table 3 product", () => {
    const Hcp = toHcp("KHpx", ATM, T_STD);
    const h = fromHcp(Hcp, T_STD);
    printed(h.KHpc, 1.83089, 6);              // m3 Pa/mol
    printed(h.KHpc / ATM, 1.80695e-5, 6);     // m3 atm/mol
    //  Sander's sixth digit of THIS factor (7.38573e-4) follows R = 8.314472 J/(mol K); the page's
    //  R = 8.314462618 moves it by one unit in the sixth digit, so it is held at five, and the
    //  sixth is shown to be a matter of R alone.
    printed(h.KHcc, 7.38573e-4, 5);
    printed(1 / (Hcp * 8.314472 * T_STD), 7.38573e-4, 6);
    printed(Hcp, 0.546182, 6);                // Table 3: K_H^px[atm] x H^cp[mol/(m3 Pa)]
  });

  it("every variant goes to H^cp and back, both directions", () => {
    for (const T of [273.15, T_STD, 330]) {
      for (const f of HENRY_FORMS) {
        const all = fromHcp(3.4e-4, T);
        near(toHcp(f, all[f], T), 3.4e-4, 1e-13);
        near(fromHcp(toHcp(f, 2.5, T), T)[f], 2.5, 1e-13);
      }
    }
    const h = fromHcp(1.3e-5, T_STD);
    near(h.Hcc * h.KHcc, 1);
    near(h.Hxp * h.KHpx, 1);
    near(h.Hcc, 1.3e-5 * R_GAS * T_STD);
    near(h.Hxp, 1.3e-5 * SANDER_WATER.M / SANDER_WATER.rho);
  });

  it("the slope of y = m x is K_H^px/P, and oxygen's is about 4.2e4 at 1 atm", () => {
    const o2 = fromHcp(SANDER_EXAMPLES[0].Hcp, T_STD);
    near(henrySlope(o2.KHpx, ATM), o2.KHpx / ATM);
    printed(henrySlope(o2.KHpx, ATM), 42014, 5);
    //  Choupo's O2 record (4.40e9 Pa) lies between Sander's 1.3e-5 and 1.2e-5 rows
    expect(fromHcp(1.3e-5, T_STD).KHpx).toBeLessThan(4.40e9);
    expect(fromHcp(1.2e-5, T_STD).KHpx).toBeGreaterThan(4.40e9);
    expect(tree("data/standards/parameters/Henry/O2-water.dat")).toMatch(/H_ref\s+4\.40e9 Pa;/);
  });
});

describe("one-flux-many-units: overall coefficients", () => {
  it("resistances add, K_x = m K_y, and the shares sum to one (Treybal 5.7-5.11)", () => {
    for (const [ky, kx, m] of [[8.1, 9.9, 49.7], [1, 1, 0.01], [2, 0.3, 5]] as const) {
      const o = overallMoleFraction(ky, kx, m);
      near(1 / o.Ky, 1 / ky + m / kx);
      near(1 / o.Kx, 1 / (m * ky) + 1 / kx);
      near(o.Kx, m * o.Ky);
      near(o.gasShare + o.liquidShare, 1);
    }
    expect(overallMoleFraction(8.1, 9.9, 49.7).controlling).toBe("liquid");
    expect(overallMoleFraction(1, 1, 0.01).controlling).toBe("gas");
    expect(overallMoleFraction(1, 1, 1).controlling).toBe("both");
  });

  it("Seader Example 3.18 (a): K_x = 9.66 and N = 0.00942 kmol/(h m2), as printed", () => {
    const o = overallMoleFraction(8.1, 9.9, 49.7);
    printed(o.Kx, 9.66, 3);
    printed(o.Kx * (0.001975 - 0.001), 0.00942, 3);
  });

  it("the concentration forms (Seader 3-187, 3-191), with K_L = K_G/H, both ways", () => {
    const c = overallConcentration(1e-5, 1e-4, 0.59);
    near(c.KL, c.KG / 0.59);
    near(1 / c.KG, 1 / 1e-5 + 1 / (0.59 * 1e-4));
    near(1 / c.KL, 0.59 / 1e-5 + 1 / 1e-4);
    //  the volatility form of Missen 9.2-13: 1/K_G = 1/k_Ag + H_A/k_Al with H_A = 1/H^cp
    near(1 / c.KG, 1 / 1e-5 + (1 / 0.59) / 1e-4);
  });
});

describe("one-flux-many-units: the curved line (Seader Example 3.18)", () => {
  it("the fit, its slope and its inverse", () => {
    near(so2y(0.001), 0.036473);
    near(so2slope(0.001975), 29.74 + 13466 * 0.001975);
    near(so2y(so2x(0.085)), 0.085, 1e-12);
    printed(so2x(0.085), 0.001975, 4);        // Seader's x*
    printed(so2slope(so2x(0.085)), 56.3, 3);  // Seader's m_y in (b)
  });

  it("the exact interface closes both films; the chord m'' reproduces it", () => {
    for (const scale of [1, 0.1, 0.01, 10]) {
      const d = curvedDemo(scale);
      near(d.ky * (SO2.yb - d.yi), d.kx * (d.xi - SO2.xb), 1e-9);
      near(d.yi, so2y(d.xi));
      near(d.NfromChord, d.N, 1e-9);
      expect(d.xi).toBeGreaterThan(SO2.xb);
      expect(d.xi).toBeLessThan(d.xStar);
    }
  });

  it("Seader's (b) to his digits; the slope choices drift apart as the gas film weakens; the straight line is far off", () => {
    const d = curvedDemo(1);
    printed(d.NAtXstar, 0.00945, 3);
    printed(d.NAverage, 0.00942, 3);
    printed(d.N, 0.00945, 3);
    expect(d.NDilute / d.N - 1).toBeGreaterThan(0.8);
    const err = (k: number): number => Math.abs(curvedDemo(k).NAverage / curvedDemo(k).N - 1);
    expect(err(0.03)).toBeGreaterThan(5 * err(1));
  });
});

describe("one-flux-many-units: reaction in the film (Missen Example 9-6)", () => {
  it("case (a) and case (b) to the digits of Missen's table, p. 253", () => {
    const a = reactive({ ...MISSEN_9_6, cB: 100 });
    printed(a.Ha, 3.4, 2); printed(a.Ei, 4.1, 2); printed(a.Evkh, 2.5, 2); printed(a.Epfo, 3.4, 2);
    expect(a.regime).toBe("film");
    const b = reactive({ ...MISSEN_9_6, cB: 6000 });
    printed(b.Ha, 26, 2); printed(b.Ei, 187, 3); printed(b.Evkh, 24.3, 3); printed(b.Epfo, 26, 2);
    //  Missen's ratios, from his rounded numbers: 74 % and 94 %
    expect(Math.round(100 * 2.5 / 3.4)).toBe(74);
    expect(Math.abs(a.ratio - 0.74)).toBeLessThan(0.01);
    expect(Math.abs(b.ratio - 0.94)).toBeLessThan(0.01);
  });

  it("Ha = (k1 D_A)^(1/2)/k_L, and the limits of E", () => {
    near(hatta(1000, 1.8e-9, 4e-4), Math.sqrt(1000 * 1.8e-9) / 4e-4);
    expect(Math.abs(ePseudoFirst(1e-8) - 1)).toBeLessThan(1e-12);
    near(ePseudoFirst(1e-3), 1e-3 / Math.tanh(1e-3), 1e-12);
    near(ePseudoFirst(30), 30, 1e-12);                         // tanh 30 = 1 in double precision
    for (const Ha of [0.2, 1, 3, 10, 100]) for (const Ei of [1.5, 5, 50, 1e4]) {
      const E = eVanKrevelen(Ha, Ei);
      expect(E).toBeGreaterThanOrEqual(1);
      expect(E).toBeLessThanOrEqual(Math.min(Ei, ePseudoFirst(Ha)) + 1e-9);
      const psi = Ha * Math.sqrt((Ei - E) / (Ei - 1));
      near(E, ePseudoFirst(psi), 1e-9);                         // it solves 9.2-51, 9.2-52
    }
    expect(Math.abs(eVanKrevelen(1e4, 20) - 20) / 20).toBeLessThan(2e-3);   // Ha -> inf: E -> E_i
    expect(Math.abs(eVanKrevelen(5, 1e9) / ePseudoFirst(5) - 1)).toBeLessThan(1e-6); // E_i -> inf
    expect(regimeOf(0.05)).toBe("bulk");
    expect(regimeOf(1)).toBe("both");
    expect(regimeOf(5)).toBe("film");
  });

  it("the plot's curves lie under E = Ha/tanh Ha and level off at their E_i", () => {
    const c = eCurves([2, 50]);
    for (const v of c.vkh) {
      v.E.forEach((E, k) => expect(E).toBeLessThanOrEqual(c.pfo[k]! + 1e-9));
      expect(Math.abs(v.E[v.E.length - 1]! / v.Ei - 1)).toBeLessThan(0.05);
    }
  });
});

describe("one-flux-many-units: the exercises", () => {
  const list = exercises();
  //  INDEPENDENT numbers: each computed here from the exercise's data, not by
  //  the page's functions, then compared at the digits the answer prints.
  const o2Hxp = 1.3e-5 * 0.0180153 / 997;
  const o2Kpx = 1 / o2Hxp;
  //  water's vapour pressure at 298.15 K from the record's Antoine line, read here from the record itself
  const ant = /coefficients\s+\(([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\)/.exec(
    tree("data/standards/components/water.dat").split("vaporPressure")[1]!)!;
  const pwIndep = 1e5 * Math.pow(10, Number(ant[1]) - Number(ant[2]) / (298.15 + Number(ant[3])));
  const ammKG = 1 / (1e5 + 1 / (0.59 * 1e-4));
  const ammN = ammKG * 1013.25;
  const ha = (cB: number): number => Math.sqrt(10 * 1.8e-9 * cB) / 4e-4;
  const ei = (cB: number): number => 1 + (3.1e-9 * cB) / (1.8e-9 * 2 * (1e5 / 3600));
  const EXPECT: Record<string, readonly [string, number, number][]> = {
    "convert-film": [["kx", 0.18 * 55, 3], ["ky", 0.040 * 202.65, 4], ["kcGas", 0.040 * 8.314462618 * 323.15 / 3600, 4],
      ["kys", 0.040 * 202.65 / 0.915, 4]],
    //  MT-01: two significant figures, as many as the datum 1.3e-5 carries.
    "convert-henry": [["KHpx", o2Kpx, 2], ["KHpxAtm", o2Kpx / 101325, 2], ["Hcc", 1.3e-5 * 8.314462618 * 298.15, 2],
      ["m", o2Kpx / 101325, 2], ["x", 0.21 / (o2Kpx / 101325), 2], ["mg", 1.3e-5 * 0.21 * 101325 * 31.998, 2],
      ["mgHumid", 1.3e-5 * 0.21 * (101325 - pwIndep) * 31.998, 2]],
    "overall": [["Kx", 1 / (1 / 9.9 + 1 / (49.7 * 8.1)), 3], ["N", (0.001975 - 0.001) / (1 / 9.9 + 1 / (49.7 * 8.1)), 3]],
    "absorption-flux": [["KG", ammKG, 3], ["KL", ammKG / 0.59, 3], ["N", ammN, 3], ["pi", 1013.25 - ammN / 1e-5, 3],
      ["ci", 0.59 * (1013.25 - ammN / 1e-5), 3]],
    "regime": [["Ha", ha(100), 2], ["Ei", ei(100), 2], ["Epfo", ha(100) / Math.tanh(ha(100)), 2], ["Evkh", 2.47, 2]],
    "reactive-flux": [["Ha", ha(6000), 3], ["Ei", ei(6000), 3], ["Epfo", ha(6000) / Math.tanh(ha(6000)), 3],
      ["Evkh", 24.3, 3], ["Npfo", ha(6000) / Math.tanh(ha(6000)) * 4e-4 * (1e5 / 3600), 3],
      ["Nphys", 4e-4 * (1e5 / 3600), 3]],
  };

  it("six exercises, each with a statement, data, a source, a solution and an answer", () => {
    expect(list.map((e) => e.id)).toEqual(Object.keys(EXPECT));
    for (const e of list) {
      expect(e.statement.length).toBeGreaterThan(60);
      expect(e.data.length).toBeGreaterThan(0);
      expect(e.source).toMatch(/Seader|Sander|Missen|Treybal/);
      expect(e.solution.length).toBeGreaterThanOrEqual(3);
      //  every illustrative datum says so
      for (const d of e.data) if (/illustrative/.test(d)) expect(d).toMatch(/illustrative values? of this exercise/);
    }
  });

  it("every answer prints the independently computed number at its digits", () => {
    for (const e of list) {
      for (const [key, want, d] of EXPECT[e.id]!) {
        const got = e.values[key]!;
        printed(got, want, d);
        expect(e.answer, `${e.id}.${key}`).toContain(sig(got, d));
        near(parseSig(sig(got, d)), Number(want.toPrecision(d)), 1e-12);
      }
    }
  });

  it("exercise 2 states its precision: the spread of Sander's rows and the water vapour", () => {
    const e = list.find((x) => x.id === "convert-henry")!;
    const all = e.solution.join(" ");
    expect(all).toContain("1.2×10⁻⁵ to 1.3×10⁻⁵");
    printed(e.values.mgLow!, 1.2e-5 * 0.21 * 101325 * 31.998, 2);
    expect(all).toContain(`from ${sig(e.values.mgLow!, 2)} to ${sig(e.values.mg!, 2)} mg/L`);
    printed(e.values.pw!, 3167, 3);                       // Pa, the record's Antoine at 298.15 K
    near(e.values.pw!, pwIndep, 1e-12);
    expect(all).toContain(`${sig(100 * e.values.pw! / 101325, 2)} % less`);
    expect(sig(100 * e.values.pw! / 101325, 2)).toBe("3.1");
    expect(e.answer).toContain(`${sig(e.values.mgHumid!, 2)} mg/L over saturated air`);
  });

  it("the shares and conclusions the answers state", () => {
    const ov = list.find((e) => e.id === "overall")!;
    printed(100 * ov.values.liquidShare!, 97.6, 3);
    expect(ov.answer).toContain("97.6 %");
    const ab = list.find((e) => e.id === "absorption-flux")!;
    printed(100 * ab.values.gasShare!, 85.5, 3);
    expect(list.find((e) => e.id === "regime")!.answer).toContain("not safe");
    expect(list.find((e) => e.id === "reactive-flux")!.solution.join(" ")).toContain("fair approximation");
  });
});

describe("one-flux-many-units: the lesson", () => {
  it("every equation parses", () => {
    for (const s of OFMU_STEPS) {
      if (s.formula) expect(texParses(s.formula), s.title).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), d.step).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), w.sym).toBe(true);
    }
  });

  it("cites the engine at lines that say what the lesson claims", () => {
    const all = [OFMU_ENGINE_SCOPE, ...OFMU_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...NOTATION_ROWS.map((r) => r.choupo)].join("\n");
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)/g)].map((m) => m[0]));
    const FILE: Record<string, string> = {
      "PackingRBF.cpp": "src/unitOperations/distillation/PackingRBF.cpp",
      "RateBasedSegment.cpp": "src/unitOperations/distillation/RateBasedSegment.cpp",
      "HenrysLaw.cpp": "src/thermo/henrysLaw/HenrysLaw.cpp",
      "ThermoPackage.cpp": "src/thermo/ThermoPackage.cpp",
    };
    const CLAIMS: Record<string, string> = {
      "PackingRBF.cpp:127": "r.kG = 0.054 * (s.DG / S)",
      "PackingRBF.cpp:129": "r.kL = 2.0 * std::sqrt(s.DL",
      "PackingRBF.cpp:133": "r.ae = beta * g.ap;",
      "RateBasedSegment.cpp:467": "const scalar cG = rhoG / MV, cL = rhoL / ML;",
      "RateBasedSegment.cpp:468": "c.betaV = cG * r.kG * r.ae * A_T * dz / Vref;",
      "RateBasedSegment.cpp:469": "c.betaL = cL * r.kL * r.ae * A_T * dz / Vref;",
      "RateBasedSegment.cpp:586": "R[r++] = yI[i] - K[i] * xI[i];",
      "RateBasedSegment.cpp:604": "R[r++] = w[lk] - (c.betaV * (yI[lk] - s.ym[lk]) + 0.5 * (yI[lk] + s.ym[lk]) * wt);",
      "RateBasedSegment.cpp:605": "R[r++] = w[lk] - (c.betaL * (s.xm[lk] - xI[lk]) + 0.5 * (xI[lk] + s.xm[lk]) * wt);",
      "RateBasedSegment.cpp:598": "R[r++] = (i == lk) ? yI[lk] - (ys + m * (xI[lk] - s.xm[lk])) : sKx - 1.0;",
      "RateBasedSegment.cpp:680": "const scalar rr = 1.0 / (1.0 / c0.betaV + c0.m / c0.betaL);",
      "HenrysLaw.cpp:50": "H_ref_   = d->lookupScalar(\"H_ref\",   Dims::pressure);",
      "HenrysLaw.cpp:163": "return H_ref_ * std::exp(dHdiss_ / constant::R * (1.0/T - 1.0/T_ref_));",
      "ThermoPackage.cpp:1293": "K[i] = hl.H(T) / P;",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, line] = c.split(":");
      const src = tree(FILE[file!]!).split("\n");
      expect(src[Number(line) - 1], c).toContain(want);
    }
  });

  it("lists its five sources, and the references block is the one the gate holds", () => {
    const refs = JSON.parse(tree("gui/src/ui/methods/lessonReferences.json")) as {
      lessons: Record<string, { references: { text: string; verified: { method: string } }[] }>;
    };
    const list = refs.lessons["one-flux-many-units"]!.references;
    expect(list.map((r) => r.text.split(",")[0])).toEqual(["Treybal", "Seader", "Sander", "Taylor", "Missen"]);
    for (const r of list) expect(r.verified.method).toBe("pdf");
  });

  it("the pointer lands on a step the rate-based page has", () => {
    const lt = OFMU_STEPS.find((s) => s.leadsTo)!.leadsTo!;
    expect(lt.tool).toBe("equilibrium-or-rate-based");
    expect(EQ_RB_STEPS.some((s) => s.title.startsWith(lt.stepTitle))).toBe(true);
  });

  //  No product is named on the page: that is check_doctrine's to hold, over
  //  every tracked file, and this file does not carry a second copy of its list.
  it("says what it does not carry", () => {
    const prose = [OFMU_TASK, OFMU_ENGINE_SCOPE, ...OFMU_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...OFMU_LIMITS.map((l) => l.body)].join("\n");
    expect(prose).toContain("computes none of the numbers on this page");
    expect(OFMU_LIMITS.map((l) => l.id)).toContain("not-engine");
    expect(OFMU_STEPS.find((s) => s.n === 6)!.note).toContain("do not print");
  });
});

describe("one-flux-many-units: the numbers the prose states (MT-03, MT-04, MT-06)", () => {
  const body = (n: number): string => OFMU_STEPS.find((s) => s.n === n)!.body + " " + (OFMU_STEPS.find((s) => s.n === n)!.note ?? "");

  it("step 5: Seader's two slope choices land within a percent; the straight line is off by more than 80 %", () => {
    expect(body(5)).toContain("within a percent of the exact flux");
    expect(body(5)).toContain("wrong by more than 80 %");
    const d = curvedDemo(1);
    expect(Math.abs(d.NAverage / d.N - 1)).toBeLessThan(0.01);
    expect(Math.abs(d.NAtXstar / d.N - 1)).toBeLessThan(0.01);
    expect(d.NDilute / d.N - 1).toBeGreaterThan(0.8);
  });

  it("step 5's note: the bulk-flow correction moves K_x from 9.69 to 9.71 (Seader 3.18 (b) and (c))", () => {
    expect(body(5)).toContain("from 9.69 to 9.71");
    printed(1 / (1 / 9.9 + 1 / (56.3 * 8.1)), 9.69, 3);                       // (b)
    //  (c), with the corrected coefficients as the book prints them: k'_x = 9.9/0.9986 = 9.9 and
    //  k'_y = 8.1/0.915 = 8.85
    printed(9.9 / 0.9986, 9.9, 2);
    printed(8.1 / 0.915, 8.85, 3);
    printed(1 / (1 / 9.9 + 1 / (56.3 * 8.85)), 9.71, 3);
  });

  it("step 2: the stagnant-film factor at 8.5 % SO2 is 1/0.915 = 1.09", () => {
    expect(body(2)).toContain("1/0.915 = 1.09");
    printed(1 / 0.915, 1.09, 3);
    printed(1 / driftLogMean(0.085, 0.085), 1.09, 3);
  });

  it("step 3: oxygen's slope at 1 atm is about 4x10^4; the guide's 4.7 orders of magnitude to ammonia", () => {
    expect(body(3)).toContain("about 4×10⁴");
    const mO2 = henrySlope(fromHcp(SANDER_EXAMPLES[0].Hcp, T_STD).KHpx, ATM);
    const mNH3 = henrySlope(fromHcp(SANDER_EXAMPLES[1].Hcp, T_STD).KHpx, ATM);
    expect(Number(mO2.toPrecision(1))).toBe(4e4);
    expect((Math.log10(mO2 / mNH3)).toFixed(1)).toBe("4.7");
    printed(mNH3, 0.93, 2);
    const guide = tree("docs/eduToolsGuide.tex");
    expect(guide).toContain("about 4.7 orders of magnitude (from 0.93 to $4.2\\times10^4$ at 1\\,atm)");
    expect(guide).not.toContain("five orders of magnitude");
  });

  it("the engine's beta is k a times the segment's volume over V_ref, and the limit mode is linearised (MT-04)", () => {
    expect(OFMU_ENGINE_SCOPE).toContain("made dimensionless by V_ref");
    expect(body(4)).toContain("linearised about the bulk liquid");
    expect(body(7)).toContain("RateBasedSegment.cpp:598");
    const src = tree("src/unitOperations/distillation/RateBasedSegment.cpp").split("\n");
    //  line 586 sits inside the `if (!limitMode)` branch; 598 is the other branch
    expect(src.slice(582, 586).join("\n")).toContain("if (!limitMode)");
    expect(src.slice(586, 598).join("\n")).toContain("else");
  });

  it("flags the pseudo-first-order value above the instantaneous limit (Missen's data, c_B = 0.01 mol/L)", () => {
    const r = reactive({ ...MISSEN_9_6, cB: 10 });
    printed(r.Ha, 1.06, 3);
    printed(r.Ei, 1.31, 3);
    printed(r.Epfo, 1.35, 3);
    expect(r.Epfo).toBeGreaterThan(r.Ei);
    expect(r.pfoAboveInstantaneous).toBe(true);
    expect(r.Evkh).toBeLessThanOrEqual(r.Ei);
    for (const cB of [100, 6000]) expect(reactive({ ...MISSEN_9_6, cB }).pfoAboveInstantaneous).toBe(false);
    const page = tree("gui/src/ui/methods/OneFluxManyUnitsTool.tsx");
    expect(page).toContain("above the instantaneous limit, not valid here");
    expect(page).toContain("res.pfoAboveInstantaneous &&");
  });
});

describe("one-flux-many-units: the page", () => {
  it("renders every step, the converters and the exercises, with the solutions hidden", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(OneFluxManyUnitsTool)));
    expect(html).toContain("One flux, many units");
    for (const s of OFMU_STEPS) expect(html).toContain(s.title.slice(0, 20).replace(/'/g, "&#x27;"));
    for (const t of ["convert a film coefficient", "who calls what", "convert a Henry", "the overall coefficient",
      "a curved equilibrium line", "the Hatta number", "exercises"]) expect(html.toLowerCase()).toContain(t.toLowerCase());
    expect(html).toContain("Show the solution");
    expect(html).not.toContain("Answer:");
    expect((html.match(/data-exercise=/g) ?? []).length).toBe(6);
    expect(html).toContain("data-lesson-references");
  });
});
