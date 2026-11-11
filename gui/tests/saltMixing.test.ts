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
  The salt-mixtures EduTool (DEV.md 4c C316): its arithmetic, its data and
  the page.

  WHAT IS HELD:
    * the catalogue records are read with the values the engine reads;
    * the page's Pitzer gamma against the ENGINE, two ways: live, through the
      single-salt kernel outputs of two shipped witnesses (NaCl and KCl at
      25 C, NaCl at 100 C), to the nine digits the engine writes; and against
      a recorded pitzerHMW run on NaCl + KCl mixtures, to within the ionic
      strength the engine's H+ and OH- add (saltMixingEngineRecord.ts says
      why that is the right bound);
    * the transcription of Farelo et al. (1993): row counts, and Table 1
      against the paper's own Table 2 correlation within three of its
      standard deviations -- a mistyped row would leave that band;
    * the solubility-product routes, the branch solver, the eutonic, the
      linear fit (its linearity is checked exactly, not assumed), the
      in-sample / held-out split, the six systems and the design;
    * the page: three moments, three predictions with nothing revealed
      before a guess, the design question, the figures and the Verify
      tables.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { witnessOutput } from "./witnessRead.js";
import {
  fitDesignRow, lnGammaPair, lnGammaPMSingle, MOLAR_MASS, saturationLog, saturationMolality,
  type PairSystem,
} from "../src/ui/methods/saltMixingMath.js";
import {
  FARELO_2005_SYSTEMS, FARELO_TABLE1, FARELO_TABLE2, FARELO_TERNARY,
} from "../src/ui/methods/saltMixingData.js";
import { ENGINE_MIXTURES, ENGINE_SINGLE_SALT } from "../src/ui/methods/saltMixingEngineRecord.js";
import {
  binaryFromKsp, commonIonTable, coolingDesign, eutonicAt, fitAt, KCL, KSP_KCL, KSP_NACL,
  lnKspCatalogue, lnKspMeasured, lnKspOfRow, measuredBinaryMolality, NACL, PSI_CAT, ROWS,
  scoreModels, sixSystems, THETA_CAT,
} from "../src/ui/methods/saltMixingModel.js";
import { SALT_PREDICTIONS } from "../src/ui/methods/saltMixingLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: { series: ["#26c6da", "#ffb74d"] },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {}, margin: {} },
}));

const csvRows = (text: string): { m: number; gpm: number }[] =>
  text.trim().split("\n").slice(1).map((l) => {
    const c = l.split(",");
    return { m: Number(c[0]), gpm: Number(c[1]) };
  });

describe("the catalogue records, as the engine reads them", () => {
  it("NaCl carries the Silvester-Pitzer form, KCl linear slopes, K-Na theta and psi", () => {
    expect(NACL.tForm).toBe("silvesterPitzer1977");
    expect(NACL.spB0).toHaveLength(5);
    expect(KCL.tForm).toBe("linearSlopes");
    expect(THETA_CAT.value).toBe(-0.012);
    expect(PSI_CAT.value).toBe(-0.0015);
    expect(KSP_NACL.logK25).toBe(1.57);
    expect(KSP_KCL.logK25).toBe(0.9);
  });
});

describe("the page's Pitzer gamma against the engine", () => {
  it("matches the single-salt kernel of the shipped witnesses (live engine run)", () => {
    const cases: [string, string, number, typeof NACL][] = [
      ["tutorials/props/electrolyte/pitzer_gamma_hamer_wu", "pitzer_nacl.csv", 298.15, NACL],
      ["tutorials/props/electrolyte/pitzer_gamma_hamer_wu", "pitzer_kcl.csv", 298.15, KCL],
      ["tutorials/props/electrolyte/pitzer_hmw_hot_agreement", "kernel_nacl_100C.csv", 373.15, NACL],
    ];
    let n = 0;
    for (const [dir, file, T, rec] of cases) {
      for (const r of csvRows(witnessOutput(dir, file))) {
        const d = Math.abs(lnGammaPMSingle(r.m, T, rec) - Math.log(r.gpm));
        expect(d, `${file} m=${r.m}`).toBeLessThan(1e-8);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it("matches the recorded single-salt kernel at 323 and 343 K", () => {
    for (const e of ENGINE_SINGLE_SALT) {
      const d = lnGammaPMSingle(e.m, e.T, e.salt === "NaCl" ? NACL : KCL) - Math.log(e.gammaPM);
      expect(Math.abs(d), `${e.salt} ${e.T} ${e.m}`).toBeLessThan(1e-8);
    }
  });

  it("matches the recorded pitzerHMW mixtures to within the ionic strength H+ and OH- add", () => {
    for (const e of ENGINE_MIXTURES) {
      const p = lnGammaPair(e.mNa, e.mK, e.T, NACL, KCL, THETA_CAT.value, PSI_CAT.value);
      const extraI = e.I - (e.mNa + e.mK);
      expect(extraI).toBeGreaterThan(0);
      expect(extraI).toBeLessThan(1e-6);
      for (const [mine, eng] of [[p.lnM, e.gammaNa], [p.lnN, e.gammaK], [p.lnX, e.gammaCl]] as const) {
        expect(Math.abs(mine - Math.log(eng)), e.name).toBeLessThan(extraI);
      }
    }
  });

  it("the engine's own halite saturation index agrees with the page's catalogue K_sp", () => {
    //  SI_halite = log10(IAP / K_sp) with the catalogue's logK25 at 25 C.
    for (const e of ENGINE_MIXTURES.filter((x) => x.T === 298.15)) {
      const p = lnGammaPair(e.mNa, e.mK, e.T, NACL, KCL, THETA_CAT.value, PSI_CAT.value);
      const si = (Math.log(e.mNa * (e.mNa + e.mK)) + p.lnM + p.lnX - lnKspCatalogue("NaCl", e.T)) / Math.LN10;
      expect(Math.abs(si - e.SIhalite)).toBeLessThan(1e-6);
    }
  });
});

describe("Farelo et al. (1993), as transcribed", () => {
  it("has every row of Tables 1, 3 and 4", () => {
    expect(FARELO_TABLE1.NaCl).toHaveLength(19);
    expect(FARELO_TABLE1.KCl).toHaveLength(15);
    expect(FARELO_TERNARY.filter((r) => r.table === 3)).toHaveLength(33);
    expect(FARELO_TERNARY.filter((r) => r.table === 4)).toHaveLength(35);
  });

  it("Table 1 sits on the paper's own Table 2 correlation within 3 sigma", () => {
    for (const s of ["NaCl", "KCl"] as const) {
      const mw = MOLAR_MASS[s]!;
      for (const [T, S] of FARELO_TABLE1[s]) {
        const corr = measuredBinaryMolality(s, T) * mw;          // g/kg
        expect(Math.abs(corr - S), `${s} ${T}`).toBeLessThan(3 * FARELO_TABLE2[s].sigma * 1000);
      }
    }
  });

  it("the 2005 rows: four 1:1 systems and two AlCl3 systems", () => {
    expect(FARELO_2005_SYSTEMS).toHaveLength(6);
    expect(FARELO_2005_SYSTEMS.filter((s) => s.z2 === 3)).toHaveLength(2);
  });
});

describe("solubility products", () => {
  it("the measured-binary route reproduces the binary exactly", () => {
    for (const T of [293.15, 323.15, 353.15]) {
      for (const s of ["NaCl", "KCl"] as const) {
        const m = binaryFromKsp(s, T, lnKspMeasured(s, T));
        expect(Math.abs(m / measuredBinaryMolality(s, T) - 1)).toBeLessThan(1e-10);
      }
    }
  });

  it("the catalogue's sylvite constant misses the measured KCl solubility by >15 % at 343 K", () => {
    const T = 343.15;
    const dev = binaryFromKsp("KCl", T, lnKspCatalogue("KCl", T)) / measuredBinaryMolality("KCl", T) - 1;
    expect(dev).toBeLessThan(-0.15);
    //  and agrees within 0.1 % at 298 K, where logK25 was set
    const d25 = binaryFromKsp("KCl", 298.15, lnKspCatalogue("KCl", 298.15)) / measuredBinaryMolality("KCl", 298.15) - 1;
    expect(Math.abs(d25)).toBeLessThan(1e-3);
  });
});

describe("the fit", () => {
  const rep = fitAt(298.15, true);

  it("the residual is exactly linear in theta and psi", () => {
    const sys0: PairSystem = { M: NACL, N: KCL, theta: 0, psi: 0 };
    const sysF: PairSystem = { ...sys0, theta: -0.02, psi: 0.003 };
    for (const r of ROWS.slice(0, 10)) {
      const d = fitDesignRow(r, sys0, lnKspOfRow(r));
      const mM = r.sat === "M" ? r.mSat : r.mOther, mN = r.sat === "M" ? r.mOther : r.mSat;
      const left = -saturationLog(r.sat, mM, mN, r.T, sysF, lnKspOfRow(r));
      expect(Math.abs(left - (d.r - d.aTheta * -0.02 - d.aPsi * 0.003))).toBeLessThan(1e-12);
    }
  });

  it("fits 8 rows at 298 K, near the literature, with strongly correlated estimates", () => {
    expect(rep.fit.n).toBe(8);
    expect(rep.inRows.length + rep.outRows.length).toBe(68);
    expect(rep.fit.theta).toBeCloseTo(-0.0104, 4);
    expect(rep.fit.psi).toBeCloseTo(-0.00198, 5);
    expect(rep.fit.corr!).toBeLessThan(-0.95);
  });

  it("reports in-sample and held-out errors apart, and the held-out one is larger", () => {
    const s = scoreModels(rep);
    const fit = s.find((x) => x.id === "fit")!;
    const zero = s.find((x) => x.id === "zero")!;
    const holmes = s.find((x) => x.id === "holmes")!;
    expect(fit.window.rms).toBeLessThan(0.5);
    expect(fit.outside.rms).toBeGreaterThan(2 * fit.window.rms);
    //  the binaries alone under-predict both salts by ~7 g/kg
    expect(zero.all.bias).toBeLessThan(-5);
    //  a temperature-dependent theta does better outside the window
    expect(holmes.outside.rms).toBeLessThan(fit.outside.rms);
  });

  it("the theta-only fit is a different number", () => {
    const one = fitAt(298.15, false).fit;
    expect(one.psi).toBe(0);
    expect(one.theta).toBeCloseTo(-0.0204, 3);
  });
});

describe("branches, eutonic, predictions and design", () => {
  const fit = fitAt(298.15, true).fit;

  it("the eutonic satisfies both saturations", () => {
    const eu = eutonicAt(298.15, "fit", fit)!;
    const sys: PairSystem = { M: NACL, N: KCL, theta: fit.theta, psi: fit.psi };
    expect(Math.abs(saturationLog("M", eu.mM, eu.mN, 298.15, sys, lnKspMeasured("NaCl", 298.15)))).toBeLessThan(1e-9);
    expect(Math.abs(saturationLog("N", eu.mM, eu.mN, 298.15, sys, lnKspMeasured("KCl", 298.15)))).toBeLessThan(1e-9);
    //  binaries alone put it at a lower total molality
    const z = eutonicAt(298.15, "zero", fit)!;
    expect(z.mM + z.mN).toBeLessThan(eu.mM + eu.mN);
  });

  it("KCl lowers the NaCl solubility, and at saturation the ionic strength adds to the fall", () => {
    //  Measured, not assumed: an earlier version of this test expected the
    //  ionic strength to work AGAINST the common ion, and it does not here --
    //  near 6 mol/kg the NaCl gamma_+- already rises with I.
    const t = commonIonTable("fit", fit);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.model).toBeLessThan(t[i - 1]!.model);
      expect(t[i]!.frozen).toBeLessThan(t[i - 1]!.frozen);
      expect(t[i]!.model).toBeLessThan(t[i]!.frozen);
      expect(t[i]!.zero).toBeLessThan(t[i]!.frozen);
    }
  });

  it("the branch solver returns NaN rather than a wrong root when there is none", () => {
    const sys: PairSystem = { M: NACL, N: KCL, theta: 0, psi: 0 };
    expect(saturationMolality("M", 0, 298.15, sys, 50)).toBeNaN();
  });

  it("four 1:1 systems are computed and the two AlCl3 systems are not", () => {
    const six = sixSystems();
    expect(six.filter((s) => s.computed)).toHaveLength(4);
    for (const s of six.filter((x) => !x.computed)) expect(s.why).toMatch(/Al-Cl/);
    for (const s of six.filter((x) => x.computed)) expect(Number.isFinite(s.meanDevZeroPct!)).toBe(true);
  });

  it("cooling a brine saturated in both from 353 K to 298 K crystallises KCl alone", () => {
    const d = coolingDesign(353.15, 298.15, "fit", fit)!;
    expect(d.kclCrystallisedGkg).toBeGreaterThan(50);
    expect(d.naclSaturationRatioCold).toBeLessThan(1);
  });
});

describe("the page", () => {
  it("is registered live, with its origins", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "salt-mixing")!;
    expect(t.status).toBe("live");
    expect([...t.origins].sort()).toEqual(["assumption", "engine", "page", "reference"]);
  });

  it("draws three moments, three predictions with nothing revealed, the design and Verify", async () => {
    const { SaltMixingTool } = await import("../src/ui/methods/SaltMixingTool.js");
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(SaltMixingTool)));
    for (const m of ["understand", "experiment", "verify"]) expect(html).toContain(`data-moment="${m}"`);
    for (const p of SALT_PREDICTIONS) {
      expect(html).toContain(`data-prediction="${p.id}"`);
      expect(html).not.toContain(`data-revealed="${p.id}"`);
    }
    expect(html).toContain("Adding KCl to a solution saturated with NaCl");
    expect(html).toContain("higher or a lower total molality");
    expect(html).toContain("largest mixing effect");
    expect(html).toContain("data-design=");
    expect(html).toContain("to which temperature would you cool it");
    for (const f of ["binary", "branches", "residuals", "isotherm"]) expect(html).toContain(`data-figure="${f}"`);
    for (const t of ["models", "engine", "ksp", "records", "rows"]) expect(html).toContain(`data-table="${t}"`);
    expect(html).toContain("in-sample");
    expect(html).toContain("data-lesson-references");
    expect(html).toContain("Sources of the measured data");
  });
});
