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
  The overpressure EduTool (C61), held to the tree and to the published
  worked examples.

  What it holds, block by block:
    * the shelf, the kind, and the links both ways with process-safety;
    * the sizing arithmetic against API 520 Part I's own Examples 1, 2 and 5
      as the open `fluids` implementation reproduces them (the standard was
      not read; these numbers are the ones that implementation's doctests
      print), and the three constants against their own DERIVATION;
    * the fire coefficient's SI conversion against the Design Guide's 43.2;
    * the pressure ladder against the Design Guide's percentages and its
      design-pressure rule of thumb;
    * the loop witness's copied converter feeds and operating states against
      the plants' own converged/PreheatedFeed, and its shipped relieving
      pressures against this page's rule;
    * the fire witness's shipped temperature against its own T_bubble golden;
    * the overrides the page writes, applied to the real witnesses;
    * the "about four and a half times" of the registry line, recomputed from
      the loop witness's goldens;
    * the lesson text: no quotation marks, every equation parses, every
      engine citation lands on the line it names.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  ACCUMULATION, API520_C0, API520_LIQUID, API520_SUBCRITICAL,
  DESIGN_GUIDE_RELIEF, FIRE_C_USC, FIRE_COMPONENT, FIRE_DEFAULT_MAWP_BARG,
  FIRE_OP, FIRE_SHIPPED_T_K, LOOP_OPERATING,
  LOOP_OPS, LOOP_PLANT, PSI_PA, P_ATM_PA, RELIEF_WITNESS_FIRE,
  RELIEF_WITNESS_LOOP, WATER_REF_DENSITY, criticalCoefficient,
  criticalPressureRatio, derivedCriticalConstant, derivedLiquidConstant,
  derivedSubcriticalConstant, designPressureGauge, fireCoefficientSI,
  fireHeatInput, fireOverrides, gasArea, liquidArea, loopGas, loopOverrides,
  loopRelievingPressure, maxAccumulatedGauge, opComposition, readPoint,
  recordScalar, relievingPressureAbs, subcriticalCoefficient, ventMassFlow,
} from "../src/ui/methods/overpressure.js";
import {
  OVERPRESSURE_LIMITS, OVERPRESSURE_SOURCES, OVERPRESSURE_STEPS,
} from "../src/ui/methods/overpressureLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_DISCIPLINES, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const PROPS = "system/propsDict";

/** A `diag <op> <key> <value>` golden row of a witness. */
function golden(caseDir: string, op: string, key: string): number {
  const m = new RegExp(`^diag\\s+${op}\\s+${key}\\s+([-+0-9.eE]+)`, "m")
    .exec(tree(`${caseDir}/expected`));
  if (!m) throw new Error(`${caseDir}: no golden ${op}.${key}`);
  return Number(m[1]);
}

/** kmol/h of one species, and a scalar, in a converged stream file. */
function convergedFlow(text: string, comp: string): number {
  const m = new RegExp(`^\\s*${comp}\\s+([-+0-9.eE]+)\\s+kmol/h;`, "m").exec(text);
  if (!m) throw new Error(`no ${comp} in a converged stream`);
  return Number(m[1]);
}
function convergedScalar(text: string, key: string, unit: string): number {
  const m = new RegExp(`^${key}\\s+([-+0-9.eE]+)\\s+${unit};`, "m").exec(text);
  if (!m) throw new Error(`no ${key} in a converged stream`);
  return Number(m[1]);
}

/** The numbers of every `key <n> [unit];` line in a dict, in file order. */
function values(text: string, key: string): number[] {
  const re = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)`, "gm");
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}

describe("overpressure: the shelf, the kind and the links", () => {
  it("is a live construction on the Process safety shelf", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "overpressure");
    expect(METHOD_DISCIPLINES).toContain("Process safety");
    expect(t?.discipline).toBe("Process safety");
    expect(t?.kind).toBe("construction");
    expect(t?.status).toBe("live");
  });
  it("links to process-safety and process-safety links back", () => {
    expect(tree("gui/src/ui/methods/OverpressureTool.tsx"))
      .toContain('setActiveMethodTool("process-safety")');
    expect(tree("gui/src/ui/methods/ProcessSafetyTool.tsx"))
      .toContain('setActiveMethodTool("overpressure")');
    //  ... and the process-safety page no longer calls this page "planned".
    expect(tree("gui/src/ui/methods/processSafetyLesson.ts"))
      .not.toMatch(/overpressure page planned/);
  });
  it("deep-links a Design Guide chapter that exists", () => {
    expect(tree("docs/designGuide.tex"))
      .toContain(`\\label{${DESIGN_GUIDE_RELIEF}}`);
  });
  it("names witnesses the bundled corpus carries", () => {
    for (const w of [RELIEF_WITNESS_LOOP, RELIEF_WITNESS_FIRE])
      expect(tutorialByName(w), w).toBeDefined();
  });
});

describe("overpressure: the sizing arithmetic against the published examples", () => {
  //  The values the fluids doctests print for API 520 Part I's Examples 1
  //  and 2 (critical and subcritical gas) and 5 (liquid), in mm2.
  const ex = { W_kg_h: 24270, T_K: 348, Z: 0.90, M: 51, k: 1.11, P1_kPa: 670,
    Kd: 0.975, Kb: 1, Kc: 1 };
  it("Example 1, critical gas: 3699.046 mm2", () => {
    const s = gasArea({ ...ex, P2_kPa: 101.325 });
    expect(s.regime).toBe("critical");
    expect(rel(s.A_mm2, 0.0036990460646834414e6)).toBeLessThan(1e-9);
  });
  it("Example 2, the same gas against 532 kPa: subcritical, 4248.359 mm2", () => {
    const s = gasArea({ ...ex, P2_kPa: 532 });
    expect(s.regime).toBe("subcritical");
    expect(rel(s.A_mm2, 0.004248358775943481e6)).toBeLessThan(1e-9);
  });
  it("Example 5, liquid: 3066.136 mm2", () => {
    const A = liquidArea({ Q_L_min: 6814, G: 0.9 * 999 / WATER_REF_DENSITY,
      P1_kPag: 1.1 * 1724, P2_kPag: 0.2 * 1724, Kd: 0.65, Kw: 0.97, Kc: 1, Kv: 1 });
    expect(rel(A, 0.0030661356203e6)).toBeLessThan(1e-9);
  });
  it("C(1.35) and F2(1.8, 0.7) as fluids prints them", () => {
    expect(rel(criticalCoefficient(1.35), 0.02669419967057233)).toBeLessThan(1e-12);
    expect(rel(subcriticalCoefficient(1.8, 0.7), 0.8600724121105563)).toBeLessThan(1e-12);
    //  The k -> 1 limits are continuous.
    expect(rel(criticalCoefficient(1 + 1e-7), criticalCoefficient(1))).toBeLessThan(1e-6);
    expect(rel(criticalPressureRatio(1 + 1e-7), criticalPressureRatio(1))).toBeLessThan(1e-6);
  });
  it("the three constants are unit bookkeeping: derived, they round to the published ones", () => {
    expect(rel(derivedCriticalConstant(), API520_C0)).toBeLessThan(5e-5);
    expect(derivedSubcriticalConstant().toFixed(1)).toBe(API520_SUBCRITICAL.toFixed(1));
    expect(derivedLiquidConstant().toFixed(2)).toBe(API520_LIQUID.toFixed(2));
  });
});

describe("overpressure: the fire case", () => {
  it("the published coefficients, converted, are the Design Guide's 43.2 (kW)", () => {
    expect(FIRE_C_USC).toEqual({ adequate: 21000, inadequate: 34500 });
    expect((fireCoefficientSI(true) / 1000).toFixed(1)).toBe("43.2");
    expect(prose(tree("docs/designGuide.tex"))).toContain("43.2");
    //  The lesson prints the conversions to two decimals.
    const s3 = OVERPRESSURE_STEPS.find((s) => s.n === 3)!.body;
    expect(s3).toContain(`${(fireCoefficientSI(true) / 1000).toFixed(2)} kW`);
    expect(s3).toContain(`${(fireCoefficientSI(false) / 1000).toFixed(2)} kW`);
    expect(s3).toContain("21 000");
    expect(s3).toContain("34 500");
  });
  it("heat grows as A^0.82 and the two-phase vent as 1/x", () => {
    expect(rel(fireHeatInput(2, 1, true) / fireHeatInput(1, 1, true), 2 ** 0.82)).toBeLessThan(1e-12);
    expect(rel(ventMassFlow(1e6, 4e5, 0.1), 10 * ventMassFlow(1e6, 4e5, 1))).toBeLessThan(1e-12);
  });
});

describe("overpressure: the pressure ladder", () => {
  it("allowances, with the psi floor winning at low MAWP", () => {
    expect(rel(maxAccumulatedGauge(10e5, "single"), 11e5)).toBeLessThan(1e-12);
    expect(rel(maxAccumulatedGauge(10e5, "multiple"), 11.6e5)).toBeLessThan(1e-12);
    expect(rel(maxAccumulatedGauge(10e5, "fire"), 12.1e5)).toBeLessThan(1e-12);
    expect(rel(maxAccumulatedGauge(1e5, "single"), 1e5 + 3 * PSI_PA)).toBeLessThan(1e-12);
    expect(rel(PSI_PA, 6894.757293168361)).toBeLessThan(1e-12);
  });
  it("agrees with the Design Guide's percentages and its design-pressure rule", () => {
    const g = prose(tree("docs/designGuide.tex"));
    for (const c of ["single", "multiple", "fire"] as const)
      expect(g).toContain(`+${Math.round(ACCUMULATION[c].frac * 100)}\\%`);
    expect(g).toMatch(/design P = max\(1\.1 \\\(\\times\\\) operating P, operating P \+ 1\.7 bar\)/);
    //  The two branches cross where 10 % of the operating pressure is
    //  1.7 bar, i.e. at 17 barg.
    expect(rel(designPressureGauge(20e5), 22e5)).toBeLessThan(1e-12);
    expect(rel(designPressureGauge(10e5), 11.7e5)).toBeLessThan(1e-12);
    expect(rel(designPressureGauge(17e5), 18.7e5)).toBeLessThan(1e-12);
  });
});

describe("overpressure: the loop witness against the plants", () => {
  const raw = tutorialByName(RELIEF_WITNESS_LOOP)?.files.rawFiles;
  for (const op of LOOP_OPS) {
    it(`${op}: the copied converter feed is the plant's converged PreheatedFeed`, () => {
      const conv = witnessOutput(`tutorials/${LOOP_PLANT[op]}`, "converged/PreheatedFeed");
      const flows = opComposition(raw![PROPS]!, op);
      expect(Object.keys(flows).sort()).toEqual(["Ar", "H2", "N2", "NH3"]);
      for (const [c, f] of Object.entries(flows))
        expect(rel(f, convergedFlow(conv, c))).toBeLessThan(1e-9);
      expect(convergedScalar(conv, "T", "K")).toBe(LOOP_OPERATING[op].T_K);
      expect(rel(convergedScalar(conv, "P", "Pa"), LOOP_OPERATING[op].P_Pa)).toBeLessThan(1e-12);
    });
  }
  it("ships the relieving pressures and temperatures this page computes", () => {
    const d = raw![PROPS]!;
    const P = values(d, "P"), T = values(d, "T");
    expect(P).toHaveLength(2);
    expect(rel(P[0]!, loopRelievingPressure("loop150"))).toBeLessThan(1e-9);
    expect(rel(P[1]!, loopRelievingPressure("loop50"))).toBeLessThan(1e-9);
    expect(T).toEqual([LOOP_OPERATING.loop150.T_K, LOOP_OPERATING.loop50.T_K]);
  });
  it("the override moves each operation's pressure, in order", () => {
    const d = methodCase(RELIEF_WITNESS_LOOP, loopOverrides(2e7, 7e6)).rawFiles![PROPS]!;
    expect(values(d, "P")).toEqual([2e7, 7e6]);
  });
  it("prices the feed with the records' molar masses", () => {
    const g = loopGas(raw, "loop150")!;
    expect(rel(g.F_kmol_h, 19257.849765839997)).toBeLessThan(1e-9);
    expect(g.M).toBeGreaterThan(7.5);
    expect(g.M).toBeLessThan(8.5);
  });
  it("'about four and a half times': the 50 bar valve against the 150 bar one, from the goldens", () => {
    const caseDir = `tutorials/${RELIEF_WITNESS_LOOP}`;
    const area = (op: "loop150" | "loop50") => {
      const g = loopGas(raw, op)!;
      return gasArea({ W_kg_h: g.W_kg_h, T_K: golden(caseDir, op, "T"),
        Z: golden(caseDir, op, "Z"), M: g.M, k: golden(caseDir, op, "gamma"),
        P1_kPa: golden(caseDir, op, "P") / 1000, P2_kPa: P_ATM_PA / 1000,
        Kd: 0.975, Kb: 1, Kc: 1 });
    };
    const a = area("loop150"), b = area("loop50");
    expect(a.regime).toBe("critical");
    expect(b.regime).toBe("critical");
    const ratio = b.A_mm2 / a.A_mm2;
    expect(ratio).toBeGreaterThan(4.4);
    expect(ratio).toBeLessThan(4.9);
    expect(METHOD_TOOLS.find((m) => m.id === "overpressure")!.teaches)
      .toContain("about four and a half times larger");
  });
});

describe("overpressure: the fire witness", () => {
  const caseDir = `tutorials/${RELIEF_WITNESS_FIRE}`;
  const raw = tutorialByName(RELIEF_WITNESS_FIRE)?.files.rawFiles;
  it("ships the default relieving pressure, evaluated AT its own boiling temperature", () => {
    const d = raw![PROPS]!;
    expect(values(d, "P")).toEqual([relievingPressureAbs(FIRE_DEFAULT_MAWP_BARG * 1e5, "fire")]);
    expect(Math.abs(values(d, "T")[0]! - golden(caseDir, FIRE_OP, "T_bubble"))).toBeLessThan(1e-6);
    //  ... and the page's starting temperature is the same number.
    expect(FIRE_SHIPPED_T_K).toBe(values(d, "T")[0]);
  });
  it("the override writes P then T in the dict's own units", () => {
    const d = methodCase(RELIEF_WITNESS_FIRE, fireOverrides(9e5, 400)).rawFiles![PROPS]!;
    expect(values(d, "P")).toEqual([9e5]);
    expect(values(d, "T")).toEqual([400]);
  });
  it("the latent heat the page divides by is the engine's, and the vapour chokes", () => {
    const lambda = golden(caseDir, FIRE_OP, `Hvap_${FIRE_COMPONENT}`);
    const M = recordScalar(raw, FIRE_COMPONENT, "MW")!;
    expect(M).toBe(58.08);
    const W = fireHeatInput(40, 1, true) / (lambda / (M / 1000)) * 3600;
    const s = gasArea({ W_kg_h: W, T_K: golden(caseDir, FIRE_OP, "T"),
      Z: golden(caseDir, FIRE_OP, "Z"), M, k: golden(caseDir, FIRE_OP, "gamma"),
      P1_kPa: golden(caseDir, FIRE_OP, "P") / 1000, P2_kPa: P_ATM_PA / 1000,
      Kd: 0.975, Kb: 1, Kc: 1 });
    expect(s.regime).toBe("critical");
    expect(s.A_mm2).toBeGreaterThan(500);
    expect(s.A_mm2).toBeLessThan(5000);
  });
  it("reads a propertyPoint result", () => {
    const r = { operationResults: [{ name: FIRE_OP, type: "propertyPoint",
      diagnostics: { T: 400, P: 7e5, Z: 0.9, gamma: 1.1, T_bubble: 399,
        Hvap_acetone: 25000 } }] } as never;
    expect(readPoint(r, FIRE_OP, "Hvap_acetone"))
      .toEqual({ T: 400, P: 7e5, Z: 0.9, k: 1.1, T_bubble: 399, Hvap: 25000 });
    expect(readPoint(r, "nope")).toBeNull();
  });
});

describe("overpressure: the lesson text", () => {
  const all = prose(OVERPRESSURE_STEPS.map((s) => `${s.title} ${s.body} ${s.note ?? ""}`).join(" "));
  it("quotes nothing: no quotation mark in a step, a limit or a source", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of OVERPRESSURE_LIMITS) expect(l.body).not.toMatch(/["“”]/);
    for (const s of OVERPRESSURE_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of OVERPRESSURE_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? [])
        if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
    }
  });
  it("says, for each standard it cites, that the standard was not read", () => {
    for (const id of ["api520", "api521", "asme-viii", "diers-manual", "leung-1986"])
      expect(OVERPRESSURE_SOURCES.find((s) => s.id === id)!.used).toContain("NOT READ");
  });
  it("the cited engine lines are the ones they name", () => {
    const ev = tree("src/propertyOps/PropertyEvaluator.cpp").split("\n");
    const pe = Number(/PropertyEvaluator\.cpp:(\d+)/.exec(all)![1]);
    expect(ev[pe - 1]).toContain('matchPerComp("Hvap"');
    const comp = tree("src/thermo/Component.cpp").split("\n");
    const [c0, c1] = /Component\.cpp:(\d+)-(\d+)/.exec(all)!.slice(1).map(Number);
    expect(comp[c0! - 1]).toContain("Component::Hvap_latent");
    expect(comp.slice(c0! - 1, c1).join("\n")).toContain("0.38");
    const th = tree("src/thermo/ThermoPackage.H").split("\n");
    const t0 = Number(/ThermoPackage\.H:(\d+)/.exec(all)![1]);
    expect(th[t0 - 1]).toMatch(/H_liquid_formation.*hvap/i);
    const pp = tree("src/propertyOps/PropertyPoint.cpp").split("\n");
    const [p0, p1] = /PropertyPoint\.cpp:(\d+)-(\d+)/.exec(all)!.slice(1).map(Number);
    const block = pp.slice(p0! - 1, p1).join("\n");
    expect(block).toContain("Cp_ig / (Cp_ig - constant::R)");
    expect(block).toContain("eos().Z(");
  });
});
