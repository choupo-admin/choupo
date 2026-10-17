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
  The pool-fire EduTool (C83), held to the tree, to hand arithmetic, to the
  engine and to the measurements it cites.

  What it holds, block by block:
    * the shelf, the kind, and the link from the plant-layout page;
    * the catalogue reading: each fuel is in the plant the page names, and
      its facts are the record's;
    * WORKED NUMBERS a reader can redo on paper (the arithmetic is in each
      test): methanol's heat of combustion from four formation enthalpies,
      a point-source flux, Mudan and Croce at 10 m, the three thresholds'
      unit conversions;
    * the page's Watson against the ENGINE: the 24 520.52 J/mol acetone
      latent heat the relief02 witness pins in its golden;
    * the closed-form view factor against a NUMERICAL INTEGRATION of its
      definition -- two routes that share nothing;
    * the curve calibrated at 30 cm against the 1 m measurement it never
      saw, and Heskestad against NIST's measured flame heights;
    * monotonicity of both models, their far-field ratio 4/pi chi_E/chi_r,
      and every threshold distance landing on its flux;
    * the layout case's separation table, read from its file;
    * the lesson text: no quotation marks, every equation parses, every
      cited line is the one it names, every unread source says so.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { rawRecordFor } from "../src/case/catalogue.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  BTU_H_FT2_W_M2, CAL_S_CM2_W_M2, FUEL_PLANT, LAYOUT_CASE, MEASURED,
  POOL_FUELS, THRESHOLDS, USBM_TABLE21, airDensity, burgessMinf, burningFlux,
  chOAtoms, cylinderViewFactor, distanceTo, flameViewFactor, formationEnthalpy,
  fuelFromRecord, gasificationHeat, heatRelease, heskestadGroup, heskestadHeight,
  HESKESTAD_RANGE,
  kBetaFromMeasurement, lhvLiquid, lhvVapour, liquidDensity, mudanSEP,
  oxygenDemand, perKg, poolFire, pointSourceFlux, readSeparation,
  regressionToFlux, thomasHeight, watsonHvap, type Products,
} from "../src/ui/methods/poolFire.js";
import { POOL_LIMITS, POOL_SOURCES, POOL_STEPS } from "../src/ui/methods/poolFireLesson.js";
import { PLANT_LAYOUT_STEPS } from "../src/ui/methods/plantLayoutLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const record = (n: string): string => {
  const b = rawRecordFor(n);
  if (!b) throw new Error(`no catalogue record ${n}`);
  return b;
};
const products: Products = {
  dHf_CO2: formationEnthalpy(record("CO2")),
  dHf_H2O: formationEnthalpy(record("water")),
  dHf_O2: formationEnthalpy(record("O2")),
};
const methanol = fuelFromRecord(record("methanol"));
const acetone = fuelFromRecord(record("acetone"));
const M_AIR = Number(/^\s*MW\s+([0-9.]+)/m.exec(record("air"))![1]);

describe("pool fire: the registry and the links", () => {
  it("sits on the Process safety shelf as a construction", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "pool-fire")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe("Process safety");
    expect(t.kind).toBe("construction");
  });
  it("is reached from the plant-layout page's separation part, at a step it has", () => {
    const from = PLANT_LAYOUT_STEPS.filter((s) => s.leadsTo?.tool === "pool-fire");
    expect(from.map((s) => s.n)).toEqual([5]);
    expect(POOL_STEPS.map((s) => s.title)).toContain(from[0]!.leadsTo!.stepTitle);
    const t = METHOD_TOOLS.find((m) => m.id === "pool-fire")!;
    expect(t.label).toBe(from[0]!.leadsTo!.toolLabel);
  });
});

describe("pool fire: the catalogue reading", () => {
  it("each fuel is a component of the plant the page names", () => {
    for (const f of POOL_FUELS) {
      const text = tree(`tutorials/${FUEL_PLANT[f]}/constant/thermoPhysPropDict`);
      const comps = /^components\s*\(([^)]*)\)/m.exec(text)![1]!.trim().split(/\s+/);
      expect(comps, f).toContain(f);
    }
  });
  it("reads the records' own numbers", () => {
    const body = tree("data/standards/components/methanol.dat");
    expect(methanol.dHf).toBe(Number(/dHf_298\s+([-0-9.]+)/.exec(body)![1]));
    expect(methanol.HvapTb).toBe(Number(/^HvapTb\s+([0-9.]+)/m.exec(body)![1]));
    expect([methanol.C, methanol.H, methanol.O]).toEqual([1, 4, 1]);
    expect([acetone.C, acetone.H, acetone.O]).toEqual([3, 6, 1]);
    expect(products.dHf_O2).toBe(0);
  });
  it("refuses a formula outside C, H and O", () => {
    expect(() => chOAtoms("CH3Cl")).toThrow(/Cl is not C, H or O/);
  });
});

describe("pool fire: worked numbers a reader can redo", () => {
  it("methanol: 676.232 kJ/mol for the vapour, by Hess", () => {
    //  CH4O + 1.5 O2 -> CO2 + 2 H2O(g):
    //  -200.940 + 1.5(0) - (-393.520) - 2(-241.826) = 676.232 kJ/mol,
    //  and over 0.032042 kg/mol, 21.1046 MJ/kg.
    expect(oxygenDemand(methanol)).toBe(1.5);
    expect(lhvVapour(methanol, products)).toBeCloseTo(676232, 6);
    expect(perKg(lhvVapour(methanol, products), methanol.MW) / 1e6).toBeCloseTo(21.1046, 4);
  });
  it("methanol's liquid: 638.17 kJ/mol, 19.917 MJ/kg", () => {
    //  Watson at 298.15 K: 35.210 ((512.64-298.15)/(512.64-337.85))^0.38
    //  = 35.210 x 1.22712^0.38 = 38.058 kJ/mol;  676.232 - 38.058 = 638.174.
    expect(watsonHvap(methanol, 298.15) / 1000).toBeCloseTo(38.058, 3);
    expect(lhvLiquid(methanol, products) / 1000).toBeCloseTo(638.174, 3);
    expect(perKg(lhvLiquid(methanol, products), methanol.MW) / 1e6).toBeCloseTo(19.917, 3);
  });
  it("agrees with the Bureau of Mines bulletin's methanol to 2 %", () => {
    //  Bulletin 680, Appendix A: 159 kcal/mol (net, 25 C, gaseous combustion).
    expect(rel(lhvVapour(methanol, products), 159 * 4184)).toBeLessThan(0.02);
  });
  it("a point source of 1 MW at 10 m, chi 0.2, level with the point: 159.15 W/m2", () => {
    //  0.2 x 1e6 / (4 pi 100) = 159.155 W/m2.
    expect(pointSourceFlux(1, 0.2, 1e6, 10, 1, 2)).toBeCloseTo(159.155, 3);
  });
  it("Mudan and Croce at D = 10 m: 56.14 kW/m2", () => {
    //  140 e^-1.2 + 20 (1 - e^-1.2) = 42.168 + 13.976 = 56.143.
    expect(mudanSEP(10) / 1000).toBeCloseTo(56.143, 3);
    expect(mudanSEP(0) / 1000).toBeCloseTo(140, 9);
    expect(mudanSEP(1e3) / 1000).toBeCloseTo(20, 9);
  });
  it("the thresholds are their sources' units, converted", () => {
    //  1 Btu/(h ft2) = 1055.05585262 J / 3600 s / 0.09290304 m2 = 3.15459 W/m2.
    expect(BTU_H_FT2_W_M2).toBeCloseTo(3.154591, 6);
    const q = (id: string) => THRESHOLDS.find((t) => t.id === id)!.q;
    expect(q("hud-people") / 1000).toBeCloseTo(1.41957, 4);
    expect(q("hud-buildings") / 1000).toBeCloseTo(31.5459, 3);
    expect(q("usbm-pain")).toBeCloseTo(0.1 * CAL_S_CM2_W_M2, 9);
    expect(q("usbm-pain")).toBeCloseTo(4184, 9);
    expect(q("epa-rmp")).toBe(5000);
    //  Lowest first, as the page draws them.
    const qs = THRESHOLDS.map((t) => t.q);
    expect([...qs].sort((a, b) => a - b)).toEqual(qs);
  });
});

describe("pool fire: the page's Watson IS the engine's", () => {
  it("reproduces acetone's latent heat as relief02's golden pins it", () => {
    const g = /^diag\s+relieving\s+Hvap_acetone\s+([-0-9.eE+]+)/m
      .exec(tree("tutorials/props/safety/relief02_acetone_fire_case/expected"))!;
    const T = Number(/^diag\s+relieving\s+T\s+([-0-9.eE+]+)/m
      .exec(tree("tutorials/props/safety/relief02_acetone_fire_case/expected"))![1]);
    expect(rel(watsonHvap(acetone, T), Number(g[1]))).toBeLessThan(1e-9);
  });
});

/** The view factor by integrating its definition over the cylinder's side:
 *  a vertical receiver at the origin facing +x, the cylinder's axis at
 *  (x0, 0), its side from height 0 to H. */
function viewFactorByQuadrature(x0: number, R: number, H: number): number {
  const nPhi = 720, nZ = 400;
  let F = 0;
  const dPhi = 2 * Math.PI / nPhi, dZ = H / nZ;
  for (let i = 0; i < nPhi; i++) {
    const phi = (i + 0.5) * dPhi;
    const px = x0 + R * Math.cos(phi), py = R * Math.sin(phi);
    const nx = Math.cos(phi), ny = Math.sin(phi);
    for (let k = 0; k < nZ; k++) {
      const pz = (k + 0.5) * dZ;
      const r2 = px * px + py * py + pz * pz;
      const r = Math.sqrt(r2);
      const c1 = px / r;
      const c2 = -(px * nx + py * ny) / r;
      if (c1 > 0 && c2 > 0) F += c1 * c2 / (Math.PI * r2) * R * dPhi * dZ;
    }
  }
  return F;
}

describe("pool fire: the view factor, two routes", () => {
  for (const [S, h] of [[3, 4], [1.5, 2], [10, 6]] as const) {
    it(`closed form = numerical integration at S = ${S}, h = ${h}`, () => {
      const R = 1;
      expect(rel(cylinderViewFactor(S, h), viewFactorByQuadrature(S * R, R, h * R)))
        .toBeLessThan(2e-3);
    });
  }
  it("adds the parts above and below a receiver half way up", () => {
    //  A receiver at mid height sees two equal halves.
    const F = flameViewFactor(6, 4, 10, 5);
    expect(F).toBeCloseTo(2 * cylinderViewFactor(3, 2.5), 12);
    //  Above the flame: the cylinder to the receiver's level, less the part
    //  between the flame's top and the receiver.
    expect(flameViewFactor(6, 4, 10, 14))
      .toBeCloseTo(cylinderViewFactor(3, 7) - cylinderViewFactor(3, 2), 12);
  });
});

describe("pool fire: the calibration and its check", () => {
  const cal = (f = methanol) => {
    const dHc = perKg(lhvLiquid(f, products), f.MW);
    const mInf = burgessMinf(dHc, gasificationHeat(f));
    return { dHc, mInf };
  };
  it("the curve passes through the 30 cm measurement it is calibrated on", () => {
    for (const [f, rec] of [["methanol", methanol], ["acetone", acetone]] as const) {
      const { mInf } = cal(rec);
      const m0 = MEASURED[f][0]!;
      const kb = kBetaFromMeasurement(mInf, m0.m_kg_m2s, m0.D_m);
      expect(rel(burningFlux(mInf, kb, m0.D_m), m0.m_kg_m2s), f).toBeLessThan(1e-12);
    }
  });
  it("predicts NIST's 1 m methanol fire, which it never saw, within 3 %", () => {
    const { dHc, mInf } = cal();
    const [m30, m100] = MEASURED.methanol;
    const kb = kBetaFromMeasurement(mInf, m30!.m_kg_m2s, m30!.D_m);
    const m = burningFlux(mInf, kb, 1.0);
    expect(rel(m, m100!.m_kg_m2s)).toBeLessThan(0.03);
    //  and its heat release within 3 % of the 256 kW calorimetry measured
    expect(rel(heatRelease(m, 1.0, dHc), 256e3)).toBeLessThan(0.03);
  });
  it("Heskestad meets NIST's measured flame heights within their spread; Thomas over-predicts methanol", () => {
    const rhoA = airDensity(M_AIR);
    for (const [f, rec] of [["methanol", methanol], ["acetone", acetone]] as const) {
      const { dHc, mInf } = cal(rec);
      const m0 = MEASURED[f][0]!;
      const kb = kBetaFromMeasurement(mInf, m0.m_kg_m2s, m0.D_m);
      for (const meas of MEASURED[f]) {
        const m = burningFlux(mInf, kb, meas.D_m);
        const L = heskestadHeight(heatRelease(m, meas.D_m, dHc), meas.D_m);
        expect(Math.abs(L - meas.L_m!), `${f} at ${meas.D_m} m`).toBeLessThan(meas.L_sd_m!);
      }
    }
    //  The 1 m methanol fire: Heskestad within 2 %, Thomas 30 % or more high.
    const { dHc, mInf } = cal();
    const m1 = burningFlux(mInf, kBetaFromMeasurement(mInf, MEASURED.methanol[0]!.m_kg_m2s,
      MEASURED.methanol[0]!.D_m), 1.0);
    expect(rel(heskestadHeight(heatRelease(m1, 1.0, dHc), 1.0), 1.10)).toBeLessThan(0.02);
    expect(thomasHeight(m1, 1.0, rhoA)).toBeGreaterThan(1.3 * MEASURED.methanol[1]!.L_m!);
  });
  it("Heskestad's height reaches zero on a 40 m methanol pool, far outside its tested range", () => {
    const { dHc, mInf } = cal();
    const kb = kBetaFromMeasurement(mInf, MEASURED.methanol[0]!.m_kg_m2s, MEASURED.methanol[0]!.D_m);
    const Q = heatRelease(burningFlux(mInf, kb, 40), 40, dHc);
    expect(heskestadHeight(Q, 40)).toBeLessThan(0.05);
    expect(heskestadGroup(Q, 40)).toBeLessThan(HESKESTAD_RANGE[0]);
  });
  it("the Bureau of Mines asymptote for methanol is 22.3 g/(m2 s)", () => {
    //  0.17 cm/min = 0.0017/60 m/s, times 787.27 kg/m3 (32.042e-3 / 4.070e-5).
    const v = regressionToFlux(USBM_TABLE21.methanol!.v_cm_min, liquidDensity(methanol));
    expect(v * 1000).toBeCloseTo(22.306, 2);
  });
});

describe("pool fire: the two models", () => {
  const fire = (sep: "energy" | "mudan", z = 1.5, D = 5, fuel = methanol) => poolFire({
    fuel, products, M_air: M_AIR, D, kBeta: 5, chiR: 0.22,
    flame: "thomas", sep, z, tau: 1,
  });
  it("both fall with distance outside the pool", () => {
    for (const sep of ["energy", "mudan"] as const) {
      const f = fire(sep);
      let qp = Infinity, qs = Infinity;
      for (let x = 2.5001; x < 500; x *= 1.1) {
        expect(f.qPoint(x)).toBeLessThan(qp);
        expect(f.qSolid(x)).toBeLessThan(qs);
        qp = f.qPoint(x); qs = f.qSolid(x);
      }
    }
  });
  it("far away, the ratio is 4/pi times the ratio of the radiative fractions", () => {
    for (const sep of ["energy", "mudan"] as const) {
      for (const z of [0, 1.5, 7]) {
        const f = fire(sep, z);
        const x = 1000 * 5;
        const want = (4 / Math.PI) * f.chiImplied / 0.22;
        expect(rel(f.qSolid(x) / f.qPoint(x), want), `${sep} z=${z}`).toBeLessThan(1e-3);
      }
    }
    //  with the energy route both carry one fraction: exactly 4/pi
    expect(fire("energy").chiImplied).toBeCloseTo(0.22, 12);
  });
  it("at the flame's surface, half way up, point / solid = L / D", () => {
    //  The energy route; a tall flame (acetone, 1 m: L > D) and a squat one
    //  (methanol, 20 m: L < D).
    for (const [fuel, D] of [[acetone, 1], [methanol, 20]] as const) {
      const L = fire("energy", 0, D, fuel).L;
      const f = fire("energy", L / 2, D, fuel);
      const x = (D / 2) * (1 + 1e-7);
      expect(rel(f.qPoint(x) / f.qSolid(x), L / D)).toBeLessThan(1e-3);
    }
    expect(fire("energy", 0, 1, acetone).L).toBeGreaterThan(1);
    expect(fire("energy", 0, 20, methanol).L).toBeLessThan(20);
  });
  it("each threshold distance lands on its flux; the point source's by its closed form", () => {
    const f = fire("mudan", 1.5, 10, acetone);
    for (const t of THRESHOLDS) {
      for (const q of [f.qPoint, f.qSolid]) {
        const x = distanceTo(q, t.q, 5);
        if (x === null) {
          expect(q(5 * (1 + 1e-9))).toBeLessThanOrEqual(t.q);
          continue;
        }
        expect(rel(q(x), t.q)).toBeLessThan(1e-6);
      }
      const x = distanceTo(f.qPoint, t.q, 5);
      const closed = Math.sqrt(0.22 * f.Q / (4 * Math.PI * t.q) - (f.L / 2 - 1.5) ** 2);
      if (x !== null) expect(rel(x, closed)).toBeLessThan(1e-6);
    }
  });
  it("a threshold above the flame's own surface flux is never reached", () => {
    //  The methanol flame by the energy route is dim: the building limit is
    //  beyond what its surface radiates.
    const f = fire("energy");
    const qb = THRESHOLDS.find((t) => t.id === "hud-buildings")!.q;
    expect(f.E).toBeLessThan(qb);
    expect(distanceTo(f.qSolid, qb, 2.5)).toBeNull();
  });
});

describe("pool fire: the layout case", () => {
  it("reads the separation table from the case's own file", () => {
    const raw = tutorialByName(LAYOUT_CASE)!.files.rawFiles!["system/layoutDict"]!;
    expect(raw).toBe(tree(`tutorials/${LAYOUT_CASE}/system/layoutDict`));
    const t = readSeparation(raw);
    expect(t.measure).toBe("edgeToEdge");
    expect(t.source).toContain("author-set assumption");
    const d = (a: string, b: string) => t.rules.find((r) => r.a === a && r.b === b)?.distance_m;
    expect(d("vessel", "vessel")).toBe(4);
    expect(d("building", "vessel")).toBe(30);
  });
});

describe("pool fire: the lesson text", () => {
  const all = prose(POOL_STEPS.map((s) => `${s.title} ${s.body} ${s.note ?? ""}`).join(" "));
  it("quotes nothing: no quotation mark in a step, a limit or a source", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of POOL_LIMITS) expect(l.body).not.toMatch(/["“”]/);
    for (const s of POOL_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(/["“”]/);
  });
  it("follows the commission's six parts, thirteen steps", () => {
    expect(POOL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
  it("every equation parses", () => {
    for (const s of POOL_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? [])
        if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
    }
  });
  it("says, for each source it did not read, that it was not read, and how it was reached", () => {
    for (const id of ["burgess-1961", "mudan-croce", "thomas-1963", "heskestad-1983"]) {
      const u = POOL_SOURCES.find((s) => s.id === id)!.used;
      expect(u, id).toContain("NOT READ");
      expect(u, id).toMatch(/through/);
    }
    for (const s of POOL_SOURCES.filter((q) => q.used.startsWith("READ")))
      expect(s.used, s.id).toMatch(/public domain|copyrighted/);
    //  every threshold names a source the page lists
    for (const t of THRESHOLDS)
      expect(POOL_SOURCES.map((s) => s.id)).toContain(t.source);
    for (const f of POOL_FUELS)
      for (const m of MEASURED[f])
        expect(POOL_SOURCES.map((s) => s.id)).toContain(m.source);
  });
  it("every poolFire.ts line it cites is the function it names", () => {
    const src = tree("gui/src/ui/methods/poolFire.ts").split("\n");
    const cites = [...all.matchAll(/poolFire\.ts:(\d+) \((\w+)/g)];
    expect(cites.length).toBeGreaterThan(15);
    for (const c of cites)
      expect(src[Number(c[1]) - 1], `line ${c[1]}`).toContain(c[2]!);
  });
  it("the engine lines it cites are the ones it names", () => {
    const comp = tree("src/thermo/Component.cpp").split("\n");
    const [w0, w1] = /Component\.cpp:(\d+)-(\d+) \(Component::Hvap_latent\)/.exec(all)!
      .slice(1).map(Number);
    expect(comp[w0! - 1]).toContain("Component::Hvap_latent");
    expect(comp.slice(w0! - 1, w1).join("\n")).toContain("0.38");
    const [c0, c1] = /crossing at Component\.cpp:(\d+)-(\d+)/.exec(all)!.slice(1).map(Number);
    const block = comp.slice(c0! - 1, c1).join("\n");
    expect(block).toContain('naturalPhase_ == "gas" && targetPhase == "liquid"');
    expect(block).toContain("Hf298_ - hvap298()");
  });
});
