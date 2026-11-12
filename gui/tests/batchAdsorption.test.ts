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
  batchAdsorption — the arithmetic of the `batch-adsorption` EduTool
  (gui/src/case/batchAdsorption.ts), held to answers known in advance:

    * the bracketed root of one stage agrees with the linear and Langmuir
      closed forms, fresh and pre-loaded adsorbent;
    * the dose inverts the stage, and an unreachable target is refused;
    * every staging arrangement closes its mass balance to 1e-10, stage by
      stage and overall; countercurrent beats crossflow at equal mass;
    * the best two-stage split is exactly one half for a linear isotherm and
      is NOT one half for Langmuir or Freundlich -- the claims the page
      prints, measured here;
    * the film-resistance closed form agrees with an RK4 integration of the
      same ODE, and the time to a target scales as d^2;
    * the page renders with no engine.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  EXAMPLES, bestTwoStageSplit, biot, cStar, closedFormC, countercurrent, crossflow, doseFor,
  equalSplit, filmCoefficients, filmRate, filmTrajectory, integrateRK4, linearFilmC, qStar,
  stageEquilibrium, timeToTarget, type FilmInput, type Isotherm,
} from "../src/case/batchAdsorption.js";
import { isothermQ } from "../src/case/adsorptionIsotherms.js";
import { BatchAdsorptionTool } from "../src/ui/methods/BatchAdsorptionTool.js";
import { BATCH_STEPS } from "../src/ui/methods/batchAdsorptionLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const LIN: Isotherm = { model: "linear", params: [5] };
const LANG: Isotherm = { model: "langmuir", params: [200, 4] };
const FREU: Isotherm = { model: "freundlich", params: [30, 0.3] };
const ALL = [LIN, LANG, FREU];

describe("one stage at equilibrium", () => {
  it("uses the isotherm page's q*(c), not a copy", () => {
    for (const iso of ALL) for (const c of [0.1, 3, 40])
      expect(qStar(iso, c)).toBe(isothermQ(iso.model, iso.params, c));
  });

  it("the inverse isotherm returns the concentration", () => {
    for (const iso of ALL) for (const c of [0.1, 3, 40])
      expect(rel(cStar(iso, qStar(iso, c)), c)).toBeLessThan(1e-12);
    expect(cStar(LANG, 200)).toBe(Infinity);
  });

  it("linear: the root equals c0 V/(V + M K), and a hand value", () => {
    //  100 L at 50 mg/L, 20 g, K = 5 L/g: c = 5000/(100 + 100) = 25 mg/L.
    const s = stageEquilibrium(LIN, 100, 20, 50);
    expect(rel(s.c, 25)).toBeLessThan(1e-13);
    expect(rel(s.q, 125)).toBeLessThan(1e-13);
    expect(closedFormC(LIN, 100, 20, 50)).toBe(25);
  });

  it("Langmuir: the root equals the positive root of the quadratic", () => {
    for (const M of [1, 5, 20, 50, 200, 2000]) for (const q0 of [0, 30]) {
      const s = stageEquilibrium(LANG, 100, M, 50, q0);
      expect(rel(s.c, closedFormC(LANG, 100, M, 50, q0)!)).toBeLessThan(1e-12);
      //  and the point is on the isotherm
      expect(rel(s.q, qStar(LANG, s.c))).toBeLessThan(1e-9);
    }
  });

  it("linear with pre-loaded adsorbent: c = (V c0 + M q0)/(V + M K)", () => {
    const s = stageEquilibrium(LIN, 10, 4, 2, 50);   // loaded solid releases solute
    expect(rel(s.c, (10 * 2 + 4 * 50) / (10 + 4 * 5))).toBeLessThan(1e-12);
    expect(s.c).toBeGreaterThan(2);
  });

  it("Freundlich: no closed form; the root sits on the isotherm and the line", () => {
    expect(closedFormC(FREU, 100, 20, 50)).toBeNull();
    const s = stageEquilibrium(FREU, 100, 20, 50);
    expect(rel(s.q, qStar(FREU, s.c))).toBeLessThan(1e-9);
    expect(Math.abs(100 * 50 - (100 * s.c + 20 * s.q))).toBeLessThan(1e-10 * 5000);
  });
});

describe("the dose for a target", () => {
  it("inverts the stage, for all three isotherms", () => {
    for (const iso of ALL) for (const r of [0.3, 0.9, 0.99]) {
      const d = doseFor(iso, 100, 50, r);
      expect(d.refused).toBeUndefined();
      expect(rel(stageEquilibrium(iso, 100, d.M_g, 50).c, 50 * (1 - r))).toBeLessThan(1e-9);
    }
  });

  it("linear: M = V (c0 - c)/(K c), a hand value", () => {
    //  90 %: c = 5, M = 100 * 45/(5 * 5) = 180 g.
    expect(rel(doseFor(LIN, 100, 50, 0.9).M_g, 180)).toBeLessThan(1e-12);
  });

  it("climbs steeply toward 100 %: each extra nine costs more than the last", () => {
    for (const iso of ALL) {
      const m = [0.9, 0.99, 0.999].map((r) => doseFor(iso, 100, 50, r).M_g);
      expect(m[1]! - m[0]!).toBeGreaterThan(0);
      expect(m[2]! - m[1]!).toBeGreaterThan(m[1]! - m[0]!);
    }
  });

  it("refuses a target below the floor set by a pre-loaded adsorbent, by name", () => {
    //  q0 = 100 mg/g on the Langmuir: floor c*(100) = 4*100/(200-100) = 4 mg/L.
    const d = doseFor(LANG, 100, 50, 0.95);   // target 2.5 mg/L
    expect(d.refused).toBeUndefined();
    const r = doseFor(LANG, 100, 50, 0.95, 100);
    expect(Number.isNaN(r.M_g)).toBe(true);
    expect(r.refused).toMatch(/equilibrium floor/);
    expect(r.refused).toMatch(/4\.000 mg\/L/);
  });

  it("refuses 100 % removal rather than returning an infinite dose", () => {
    expect(doseFor(LIN, 100, 50, 1).refused).toMatch(/strictly between/);
  });
});

describe("staging: the balances close", () => {
  for (const iso of ALL) {
    it(`${iso.model}: crossflow and countercurrent, N = 1..4, to 1e-10`, () => {
      for (let N = 1; N <= 4; N++) {
        const cf = crossflow(iso, 100, 20, 50, equalSplit(N));
        const cc = countercurrent(iso, 100, 20, 50, N);
        for (const r of [cf, cc]) {
          expect(r.refused).toBeUndefined();
          expect(r.balanceError).toBeLessThan(1e-10);
          expect(r.stageBalanceError).toBeLessThan(1e-10);
          expect(r.stages).toHaveLength(N);
        }
        //  countercurrent stages sit on the isotherm
        for (const s of cc.stages) expect(Math.abs(s.q - qStar(iso, s.c))).toBeLessThan(1e-12 * (1 + s.q));
      }
    });
  }

  it("one stage is the same answer by all three routes", () => {
    for (const iso of ALL) {
      const s = stageEquilibrium(iso, 100, 20, 50).c;
      expect(rel(crossflow(iso, 100, 20, 50, [1]).cOut, s)).toBeLessThan(1e-14);
      expect(rel(countercurrent(iso, 100, 20, 50, 1).cOut, s)).toBeLessThan(1e-12);
    }
  });

  it("the same mass removes more in more stages, and more countercurrent than crossflow", () => {
    for (const iso of ALL) {
      let prevCf = Infinity, prevCc = Infinity;
      for (let N = 1; N <= 4; N++) {
        const cf = crossflow(iso, 100, 20, 50, equalSplit(N)).cOut;
        const cc = countercurrent(iso, 100, 20, 50, N).cOut;
        expect(cf).toBeLessThan(prevCf + 1e-12);
        expect(cc).toBeLessThan(prevCc + 1e-12);
        if (N > 1) expect(cc).toBeLessThan(cf);
        prevCf = cf; prevCc = cc;
      }
    }
  });

  it("linear, two crossflow stages: c/c0 = 1/(1 + a/2)^2, a = M K/V", () => {
    //  a = 20*5/100 = 1: c = 50/2.25.
    expect(rel(crossflow(LIN, 100, 20, 50, [0.5, 0.5]).cOut, 50 / 2.25)).toBeLessThan(1e-12);
    //  two countercurrent stages: c2/c0 = 1/(1 + a + a^2) = 1/3.
    expect(rel(countercurrent(LIN, 100, 20, 50, 2).cOut, 50 / 3)).toBeLessThan(1e-12);
  });
});

describe("the best split of a fixed total between two crossflow stages", () => {
  const grid = Array.from({ length: 999 }, (_, k) => (k + 1) / 1000);

  it("is unimodal on a fine grid, so golden section finds it", () => {
    for (const iso of [...ALL, { model: "freundlich" as const, params: [30, 1.5] }]) for (const M of [5, 20, 50, 100]) {
      const c = grid.map((f) => crossflow(iso, 100, M, 50, [f, 1 - f]).cOut);
      let k = c.indexOf(Math.min(...c));
      //  falls to the minimum, rises after it (to round-off)
      for (let i = 1; i <= k; i++) expect(c[i]!).toBeLessThanOrEqual(c[i - 1]! + 1e-12);
      for (let i = k + 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]! - 1e-12);
      const best = bestTwoStageSplit(iso, 100, M, 50);
      expect(best.cOut).toBeLessThanOrEqual(c[k]! + 1e-9);
      k = 0;
    }
  });

  it("linear: exactly one half, at every dose", () => {
    for (const M of [5, 20, 50, 100]) {
      const b = bestTwoStageSplit(LIN, 100, M, 50);
      expect(Math.abs(b.fraction - 0.5)).toBeLessThan(1e-6);
      expect(rel(b.cOut, b.cEqual)).toBeLessThan(1e-12);
    }
  });

  it("favourable Langmuir and Freundlich: more than half in the FIRST stage", () => {
    //  The numbers the page prints for the dye example at M = 50 g in 100 L:
    //  f* = 0.687, c_out 0.922 against 1.146 mg/L for the equal split.
    const b = bestTwoStageSplit(LANG, 100, 50, 50);
    expect(b.fraction).toBeGreaterThan(0.68);
    expect(b.fraction).toBeLessThan(0.69);
    expect(b.cOut).toBeCloseTo(0.9217, 3);
    expect(b.cEqual).toBeCloseTo(1.1462, 3);
    for (const iso of [LANG, FREU]) for (const M of [20, 50, 100]) {
      const x = bestTwoStageSplit(iso, 100, M, 50);
      expect(x.fraction).toBeGreaterThan(0.5 + 1e-3);
      expect(x.cOut).toBeLessThan(x.cEqual);
    }
  });

  it("an UNFAVOURABLE Freundlich (1/n > 1) puts less than half in the first stage", () => {
    const b = bestTwoStageSplit({ model: "freundlich", params: [30, 1.5] }, 100, 20, 50);
    expect(b.fraction).toBeLessThan(0.5 - 1e-3);
  });
});

describe("how long it takes: the film model", () => {
  const base: FilmInput = {
    iso: LIN, V_L: 100, M_g: 20, c0: 50, d_m: 0.5e-3, rhoP: 800, DAB: 1e-9, Sh: 2,
  };

  it("k_L = Sh D/d and a = 6 M/(rho_p d V), hand values", () => {
    const f = filmCoefficients(base);
    expect(rel(f.kL, 4e-6)).toBeLessThan(1e-12);          // 2e-9/5e-4
    expect(rel(f.a, 6 * 0.02 / (800 * 5e-4 * 0.1))).toBeLessThan(1e-12);   // 3 1/m
    expect(rel(f.kLa, 1.2e-5)).toBeLessThan(1e-12);
  });

  it("the linear closed form satisfies the ODE and agrees with RK4", () => {
    const { kLa } = filmCoefficients(base);
    //  derivative of the closed form against the right-hand side, centrally
    for (const t of [1e3, 2e4, 1e5]) {
      const h = 1e-3 * t;
      const dcdt = (linearFilmC(base, kLa, t + h) - linearFilmC(base, kLa, t - h)) / (2 * h);
      expect(rel(dcdt, filmRate(base, kLa, linearFilmC(base, kLa, t)))).toBeLessThan(1e-6);
    }
    const tEnd = 3e5;
    const num = integrateRK4((c) => filmRate(base, kLa, c), 50, tEnd, 1e-10, tEnd / 100);
    num.t.forEach((t, i) => expect(Math.abs(num.c[i]! - linearFilmC(base, kLa, t))).toBeLessThan(1e-8));
    //  and it ends on the equilibrium of step 1
    expect(rel(linearFilmC(base, kLa, 1e8), stageEquilibrium(LIN, 100, 20, 50).c)).toBeLessThan(1e-12);
  });

  it("time to a target: closed form against RK4 on the same ODE", () => {
    const tLin = timeToTarget(base, 30).t;
    //  by hand: alpha = 100/(20*5) = 1, beta = 2, t = -ln(2*30/50 - 1)/(1.2e-5*2)
    expect(rel(tLin, -Math.log(0.2) / 2.4e-5)).toBeLessThan(1e-12);
    //  the RK4 route, forced by writing the linear isotherm as Freundlich 1/n = 1
    const asFreu = timeToTarget({ ...base, iso: { model: "freundlich", params: [5, 1] } }, 30);
    expect(asFreu.method).toBe("RK4");
    expect(rel(asFreu.t, tLin)).toBeLessThan(1e-7);
  });

  it("Langmuir and Freundlich trajectories end on their own equilibrium", () => {
    for (const iso of [LANG, FREU]) {
      const f = { ...base, iso };
      const tr = filmTrajectory(f, 2e6);
      expect(tr.method).toBe("RK4");
      expect(rel(tr.c[tr.c.length - 1]!, tr.cInf)).toBeLessThan(1e-6);
      //  monotone fall, to the integrator's own tolerance (1e-9 c0 per step):
      //  at the equilibrium the curve is flat and a step may wobble by that much
      for (let i = 1; i < tr.c.length; i++) expect(tr.c[i]!).toBeLessThanOrEqual(tr.c[i - 1]! + 1e-9 * 50);
    }
  });

  it("time scales as d^2, for every isotherm", () => {
    for (const iso of ALL) {
      const f1 = { ...base, iso }, f2 = { ...f1, d_m: 2 * base.d_m };
      const cInf = stageEquilibrium(iso, 100, 20, 50).c;
      const target = cInf + 0.5 * (50 - cInf);
      expect(rel(timeToTarget(f2, target).t / timeToTarget(f1, target).t, 4)).toBeLessThan(1e-6);
    }
  });

  it("refuses a target at or below the equilibrium, and one at or above c0", () => {
    const cInf = stageEquilibrium(LIN, 100, 20, 50).c;   // 25
    expect(timeToTarget(base, cInf).refused).toMatch(/never reaches/);
    expect(timeToTarget(base, 10).refused).toMatch(/equilibrium/);
    expect(timeToTarget({ ...base, iso: LANG }, 1e-3).refused).toMatch(/never reaches/);
    expect(timeToTarget(base, 50).refused).toMatch(/not below c0/);
  });
});

describe("what the film model leaves out", () => {
  it("Bi = k_L R/D_e; at Sh = 2 it is D_AB/D_e whatever the diameter", () => {
    for (const d of [1e-5, 1e-4, 1e-3]) {
      const kL = (2 * 1e-9) / d;
      const b = biot(kL, d, 1e-10);
      expect(rel(b.Bi, 10)).toBeLessThan(1e-12);
      expect(b.internalOverFilm).toBeCloseTo(2, 12);
      expect(b.unreliable).toBe(true);
    }
    expect(biot(2e-9 / 1e-4, 1e-4, 5e-9).unreliable).toBe(false);   // Bi = 0.2
  });
});

describe("the page", () => {
  it("is registered, live, shelved beside the isotherm page, and leads to the bed", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "batch-adsorption")!;
    const i = METHOD_TOOLS.findIndex((m) => m.id === "adsorption-isotherms");
    expect(t.status).toBe("live");
    expect(METHOD_TOOLS[i + 1]!.id).toBe("batch-adsorption");
    expect(BATCH_STEPS.some((s) => s.leadsTo?.tool === "breakthrough")).toBe(true);
    expect(BATCH_STEPS.some((s) => s.leadsTo?.tool === "adsorption-isotherms")).toBe(true);
  });

  it("the example systems are usable and stated as this page's numbers", () => {
    for (const e of EXAMPLES) expect(e.label).toMatch(/this page's numbers/);
  });

  it("renders its lesson and its results with no engine", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(BatchAdsorptionTool)));
    expect(html).toContain("Batch adsorption in a stirred tank");
    expect(html).toContain("operating line");
    expect(html).toContain("countercurrent");
    expect(html).toContain("Biot");
    expect(html).not.toMatch(/NaN/);
  });
});
