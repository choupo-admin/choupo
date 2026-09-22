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
  lubScaleup -- the LUB design method, asserted on NUMBERS.

  The arithmetic in lubScaleupMath.ts is the method being taught, so the
  test does not settle for "it runs": a synthetic front with a KNOWN
  breakthrough time, stoichiometric time and unused length is put through
  it and the answers are compared with the closed forms.

  THE SYNTHETIC CURVE is an erf front, f(t) = ½[1 + erf((t − t_st)/(σ√2))],
  symmetric about t_st -- so ∫(1 − f) dt = t_st exactly (the truncation at
  t = 0 and at the horizon is below 1e-12 for the parameters chosen), and
  t_b at level f_b is t_st + σ·z(f_b) with z the standard-normal quantile
  (z(0.05) = −1.6448536).  Nothing about it is a model of a bed; it is a
  curve whose integrals are known, which is what a test of a planimeter
  needs.

  The lab-column reader is tested on the REAL bundled witness through the
  same clone the engine runs (methodCase), so the (file, key) resolution
  cannot drift from the case; and the capacity check reproduces the witness
  header's own q*(c_in) = 2.872340426 mol/kg from the golden's t_st and R_f.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The tool's module graph reaches the Plotly bundle through the plotting
// kit; mock it at its one seam so the pure functions load under node.
vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: {
    background: "#1f1f1f", grid: "#3b3b3b", axis: "#828282", text: "#c9c9c9",
    accent: "#26c6da", accent2: "#80deea", warm: "#ffb74d", warm2: "#ff8a65",
    series: ["#26c6da", "#ffb74d"],
  },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {} },
}));

import {
  MEASURED_CURVE_HEADER, MEASURED_CURVE_PATH, crossingTime, curveSegment,
  loadingFromCurve, loadingFromRetention, lubFromTimes, readBreakthroughCsv,
  readLabColumn, scaleUp, stoichiometricTime, type Curve,
} from "../src/ui/methods/lubScaleupMath.js";
import {
  DESIGN_KNOB_DEFAULTS, analyseCurve,
} from "../src/ui/methods/LubScaleupTool.js";
import {
  LUB_SCALEUP_LIMITS, LUB_SCALEUP_STEPS,
} from "../src/ui/methods/lubScaleupLesson.js";
import {
  BREAKTHROUGH_WITNESS, knobOverrides,
} from "../src/ui/methods/BreakthroughTool.js";
import { methodCase } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

// ---- The synthetic front ----------------------------------------------------

/** erf, Abramowitz & Stegun 7.1.26 (|error| <= 1.5e-7). */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

const T_ST = 3000;      // s
const SIGMA = 60;       // s
const L_LAB = 0.5;      // m
const Z_05 = -1.6448536269514722;   // standard-normal quantile at 0.05

function erfFront(dt: number, tEnd: number): Curve {
  const t: number[] = [];
  const f: number[] = [];
  for (let x = 0; x <= tEnd + 1e-9; x += dt) {
    t.push(x);
    f.push(0.5 * (1 + erf((x - T_ST) / (SIGMA * Math.SQRT2))));
  }
  return { t, f };
}

describe("the two times read off a synthetic erf front", () => {
  const curve = erfFront(1, 4200);

  it("t_b at 5 % is t_st + σ·z(0.05), by interpolation", () => {
    const tB = crossingTime(curve, 0.05);
    expect(tB).not.toBeNull();
    //  2901.3088 s; the A&S erf error and the 1 s mesh both sit far below
    //  the tolerance.
    expect(tB!).toBeCloseTo(T_ST + SIGMA * Z_05, 2);
  });

  it("the trapezoid area above the curve is t_st, and the data are complete", () => {
    const s = stoichiometricTime(curve);
    expect(s.tSt).toBeCloseTo(T_ST, 2);
    expect(s.complete).toBe(true);
    expect(s.fEnd).toBeGreaterThan(0.999);
    expect(s.t0).toBe(0);
    expect(s.tEnd).toBe(4200);
  });

  it("a curve that never reaches the criterion reports no t_b", () => {
    const short = erfFront(1, 2800);
    expect(crossingTime(short, 0.05)).toBeNull();
  });

  it("a curve stopped early is INCOMPLETE and its t_st is a lower bound", () => {
    const cut = erfFront(1, 2950);
    const s = stoichiometricTime(cut);
    expect(s.complete).toBe(false);
    expect(s.tSt).toBeLessThan(T_ST);
    //  The dropped tail is exactly what the full curve carries past 2950 s.
    const full = stoichiometricTime(curve).tSt;
    expect(full - s.tSt).toBeGreaterThan(50);
  });

  it("a coarse mesh moves t_st by the trapezoid's own error, not more", () => {
    const coarse = erfFront(100, 4200);
    //  Trapezoid error on a smooth symmetric front is second order and
    //  cancels across the symmetry; the 100 s mesh stays within 0.5 s.
    expect(stoichiometricTime(coarse).tSt).toBeCloseTo(T_ST, 0);
  });
});

describe("the unused bed and the scale-up, against the closed forms", () => {
  const curve = erfFront(1, 4200);
  const tB = crossingTime(curve, 0.05)!;
  const tSt = stoichiometricTime(curve).tSt;

  it("LUB = L_lab (1 − t_b/t_st)", () => {
    const r = lubFromTimes(tB, tSt, L_LAB);
    const expectedLub = L_LAB * (1 - (T_ST + SIGMA * Z_05) / T_ST);   // 0.0164485 m
    expect(r.lub).toBeCloseTo(expectedLub, 5);
    expect(r.fUsed).toBeCloseTo((T_ST + SIGMA * Z_05) / T_ST, 5);
    expect(r.lMtz).toBeCloseTo(2 * expectedLub, 5);
  });

  it("L_es scales the lab column by t_req/t_st; D and the mass follow", () => {
    const lub = lubFromTimes(tB, tSt, L_LAB);
    const s = scaleUp({ lLab: L_LAB, tSt, lub: lub.lub, u: 0.05,
      tReq: 6000, Q: 0.01, rhoB: 640 });
    expect(s.lEs).toBeCloseTo(1.0, 5);
    expect(s.lFull).toBeCloseTo(1.0 + lub.lub, 6);
    expect(s.utilisation).toBeCloseTo(1.0 / (1.0 + lub.lub), 6);
    //  D = sqrt(4·0.01/(π·0.05)) = 0.504627 m; πD²/4 = Q/u = 0.2 m².
    expect(s.D).toBeCloseTo(Math.sqrt(4 * 0.01 / (Math.PI * 0.05)), 8);
    expect(s.mAds).toBeCloseTo(640 * 0.2 * (1.0 + lub.lub), 4);
  });

  it("a longer bed wastes a SMALLER fraction -- the lesson's point, as a number", () => {
    const lub = lubFromTimes(tB, tSt, L_LAB);
    const short = scaleUp({ lLab: L_LAB, tSt, lub: lub.lub, u: 0.05,
      tReq: 3000, Q: 0.01, rhoB: null });
    const long = scaleUp({ lLab: L_LAB, tSt, lub: lub.lub, u: 0.05,
      tReq: 18000, Q: 0.01, rhoB: null });
    expect(long.utilisation).toBeGreaterThan(short.utilisation);
    //  No rho_b -> no mass, never a default.
    expect(short.mAds).toBeNull();
  });

  it("curveSegment lands exactly on its two ends", () => {
    const seg = curveSegment(curve, 2500.5, tB);
    expect(seg.t[0]).toBe(2500.5);
    expect(seg.t[seg.t.length - 1]).toBe(tB);
    expect(seg.f[seg.f.length - 1]).toBeCloseTo(0.05, 6);
  });
});

// ---- The measured-curve reader ---------------------------------------------

describe("readBreakthroughCsv -- the measured-curve format", () => {
  it("reads the documented shape: # comments, the header, two numeric columns", () => {
    const text = "# a measured curve\n\n" + MEASURED_CURVE_HEADER + "\n"
      + "0,0\n100, 0.001\n200,0.5\n300,0.99\n";
    const c = readBreakthroughCsv(text);
    expect(c.t).toEqual([0, 100, 200, 300]);
    expect(c.f).toEqual([0, 0.001, 0.5, 0.99]);
    expect(MEASURED_CURVE_PATH).toBe("constant/experimental/breakthrough.csv");
  });

  it("refuses a wrong header rather than guessing the columns", () => {
    expect(() => readBreakthroughCsv("time,c\n0,0\n1,1\n"))
      .toThrow(/expected 't_s,c_over_c0'/);
  });

  it("refuses a third column, a non-numeric cell and a time that does not advance", () => {
    expect(() => readBreakthroughCsv(`${MEASURED_CURVE_HEADER}\n0,0,1\n1,1\n`))
      .toThrow(/3 column/);
    expect(() => readBreakthroughCsv(`${MEASURED_CURVE_HEADER}\n0,0\nx,1\n`))
      .toThrow(/not numeric/);
    expect(() => readBreakthroughCsv(`${MEASURED_CURVE_HEADER}\n0,0\n5,0.1\n5,0.2\n`))
      .toThrow(/does not advance/);
  });

  it("refuses an empty file and a header with no rows", () => {
    expect(() => readBreakthroughCsv("# nothing\n")).toThrow(/no header/);
    expect(() => readBreakthroughCsv(`${MEASURED_CURVE_HEADER}\n0,0\n`))
      .toThrow(/fewer than two/);
  });

  it("puts a measured curve through the SAME arithmetic, labelled measured", () => {
    const curve = erfFront(10, 4200);
    const text = MEASURED_CURVE_HEADER + "\n"
      + curve.t.map((t, i) => `${t},${curve.f[i]}`).join("\n") + "\n";
    const lab = readLabColumn(methodCase(BREAKTHROUGH_WITNESS, []), "bed");
    const a = analyseCurve("measured", readBreakthroughCsv(text),
      DESIGN_KNOB_DEFAULTS, lab, 6.0);
    expect(a.label).toBe("measured");
    //  On a 10 s sampling the linear interpolation of the crossing sits
    //  0.15 s from the analytic t_b (measured when this was written): the
    //  chord of a curved front over one 10 s interval, well inside the mesh
    //  width and the honest size of the reading's error on such data.
    expect(Math.abs(a.tB! - (T_ST + SIGMA * Z_05))).toBeLessThan(0.5);
    expect(a.stoich.tSt).toBeCloseTo(T_ST, 1);
    expect(a.lub!.lub).toBeCloseTo(L_LAB * (1 - (T_ST + SIGMA * Z_05) / T_ST), 4);
  });
});

// ---- The lab column, read from the real witness ----------------------------

describe("readLabColumn -- the witness's own declared column", () => {
  it("reads L, u, eps from operation {} and rho_b from the vendored record", () => {
    const lab = readLabColumn(methodCase(BREAKTHROUGH_WITNESS, []), "bed");
    expect(lab.unitFound).toBe(true);
    expect(lab.L).toBeCloseTo(0.5, 12);
    expect(lab.u).toBeCloseTo(0.05, 12);
    expect(lab.eps).toBeCloseTo(0.4, 12);
    expect(lab.adsorbent).toBe("zeolite13X");
    expect(lab.rhoB).toBe(640);
    expect(lab.rhoBSource).toBe("constant/adsorbents/zeolite13X.dat");
    expect(lab.missing).toEqual([]);
  });

  it("reads the CLONE the engine ran: a bed-length knob moves L", () => {
    const files = methodCase(BREAKTHROUGH_WITNESS,
      knobOverrides({ u: 0.05, L: 1.25, T: 298, P: 1, endTime: 4200 }));
    expect(readLabColumn(files, "bed").L).toBeCloseTo(1.25, 12);
  });

  it("matches a flattened fractal name on its last segment", () => {
    const files = methodCase(BREAKTHROUGH_WITNESS, []);
    expect(readLabColumn(files, "PURIFICATION.bed").unitFound).toBe(true);
  });

  it("NAMES what it cannot find, and defaults nothing", () => {
    const lab = readLabColumn(methodCase(BREAKTHROUGH_WITNESS, []), "nosuchunit");
    expect(lab.unitFound).toBe(false);
    expect(lab.L).toBeNull();
    expect(lab.rhoB).toBeNull();
    expect(lab.missing.join(" ")).toMatch(/system\/flowsheetDict/);
    expect(lab.missing.join(" ")).toMatch(/rho_b/);
    expect(readLabColumn(null, "bed").missing.length).toBeGreaterThan(0);
  });
});

// ---- The capacity check against the witness's golden ------------------------

describe("q* from the curve and from the engine's R_f agree on the witness", () => {
  const GOLDEN = readFileSync(new URL(
    "../../tutorials/batch/adsorber/batch13_breakthrough_co2/expected",
    import.meta.url), "utf-8");
  const kpi = (key: string): number => {
    const m = new RegExp(`^kpi\\s+bed\\s+${key}\\s+(\\S+)`, "m").exec(GOLDEN);
    if (m === null) throw new Error(`golden has no KPI ${key}`);
    return Number(m[1]);
  };
  //  c_in = y_CO2 · P/(RT), the witness header's own statement of its feed
  //  (c_tot = P/(RT) at 1 bar, 298 K; 15 % CO2).
  const C_IN = 0.15 * 1e5 / (8.314462618 * 298);

  it("both readings reproduce the header's q*(c_in) = 2.872340426 mol/kg", () => {
    const lab = readLabColumn(methodCase(BREAKTHROUGH_WITNESS, []), "bed");
    const fromCurve = loadingFromCurve(C_IN, lab.u!, kpi("t_stoichiometric_CO2"),
      lab.eps!, lab.L!, lab.rhoB!);
    const fromRf = loadingFromRetention(kpi("retention_factor_CO2"), lab.eps!,
      C_IN, lab.rhoB!);
    expect(fromCurve).toBeCloseTo(2.872340426, 6);
    expect(fromRf).toBeCloseTo(2.872340426, 6);
    //  And the run's own saturated bed-average loading is the same number.
    expect(kpi("qbar_CO2_final")).toBeCloseTo(2.872340426, 6);
  });
});

// ---- The lesson and the registry --------------------------------------------

describe("the LUB scale-up lesson", () => {
  it("has six steps, numbered without a gap, and every formula step is glossed", () => {
    expect(LUB_SCALEUP_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const s of LUB_SCALEUP_STEPS)
      if (s.formula) expect(s.where?.length ?? 0, `step ${s.n}`).toBeGreaterThan(0);
  });

  it("states the constant-pattern premise up front, and when it fails", () => {
    const s1 = LUB_SCALEUP_STEPS[0]!;
    expect(s1.body).toContain("WITHOUT CHANGING SHAPE");
    expect(s1.note).toMatch(/UNFAVOURABLE or LINEAR/);
    expect(s1.note).toMatch(/SHORTER than/);
  });

  it("reads t_b and t_st off the curve and names the engine's own t_st beside it", () => {
    const s2 = LUB_SCALEUP_STEPS[1]!;
    expect(s2.formula).toContain(String.raw`\int_0^\infty \left( 1 - \frac{c_\mathrm{out}}{c_\mathrm{in}} \right) \mathrm{d}t`);
    expect(s2.note).toContain("t_stoichiometric_<i>");
    expect(s2.note).toContain("LOWER BOUND");
  });

  it("checks the curve's capacity against the isotherm through R_f", () => {
    const s3 = LUB_SCALEUP_STEPS[2]!;
    expect(s3.formula).toContain(String.raw`q^*_\mathrm{curve} &= \frac{c_\mathrm{in} \left( u\, t_\mathrm{st} - \varepsilon\, L_\mathrm{lab} \right)}{\rho_b\, L_\mathrm{lab}}`);
    expect(s3.formula).toContain(String.raw`q^*_\mathrm{isotherm} &= \frac{(R_f - \varepsilon)\, c_\mathrm{in}}{\rho_b}`);
  });

  it("carries LUB to full scale at the SAME velocity and says which knobs re-run", () => {
    const s4 = LUB_SCALEUP_STEPS[3]!;
    const s5 = LUB_SCALEUP_STEPS[4]!;
    expect(s4.formula).toContain(String.raw`\mathrm{LUB} &= L_\mathrm{lab} \left( 1 - \frac{t_b}{t_\mathrm{st}} \right)`);
    expect(s5.formula).toContain(String.raw`L_\mathrm{full} &= L_\mathrm{es} + \mathrm{LUB}`);
    expect(s5.formula).toContain(String.raw`D &= \sqrt{\frac{4Q}{\pi u}}`);
    expect(s5.note).toMatch(/RE-RUN/);
    expect(s5.note).toMatch(/POST-PROCESSING/);
  });

  it("names the regeneration cases rather than teaching them, and lists its limits", () => {
    const s6 = LUB_SCALEUP_STEPS[5]!;
    expect(s6.body).toContain("batch21_tsa_hot_purge");
    expect(s6.body).toContain("batch23_tsa_cycles");
    const ids = LUB_SCALEUP_LIMITS.map((l) => l.id);
    expect(ids).toContain("constant-pattern");
    expect(ids).toContain("tail-cut");
    expect(ids).toContain("model-not-measurement");
    expect(LUB_SCALEUP_LIMITS.find((l) => l.id === "model-not-measurement")!.body)
      .toContain(MEASURED_CURVE_PATH);
  });
});

describe("the registry entry and the one-home rule", () => {
  it("is live, on the separations shelf, anchored where the breakthrough tool is", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "lub-scaleup");
    const b = METHOD_TOOLS.find((m) => m.id === "breakthrough");
    expect(t).toBeTruthy();
    expect(t!.status).toBe("live");
    expect(t!.kind).toBe("construction");
    expect(t!.discipline).toBe("Separations & phase equilibria");
    expect(t!.theory).toBe(b!.theory);
  });

  it("IMPORTS the activation, markers and normalisation from BreakthroughTool -- never a copy", () => {
    const src = readFileSync(
      new URL("../src/ui/methods/LubScaleupTool.tsx", import.meta.url), "utf-8");
    const importBlock = /import \{[^}]*\} from "\.\/BreakthroughTool\.js"/.exec(src)?.[0] ?? "";
    for (const name of ["detectBreakthrough", "extractFrontMarkers",
      "decideNormalisation", "BREAKTHROUGH_KNOBS", "knobOverrides"])
      expect(importBlock, `${name} must be imported from BreakthroughTool`).toContain(name);
    for (const name of ["detectBreakthrough", "extractFrontMarkers", "decideNormalisation"])
      expect(src).not.toMatch(new RegExp(`function ${name}\\b`));
  });
});
