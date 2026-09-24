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
  batchMembrane -- the classical batch UF/NF results, asserted on NUMBERS.

  The arithmetic in batchMembraneMath.ts is the method being taught, so these
  tests do not settle for "it runs".  Three kinds of assertion, and the second
  is the load-bearing one:

  1. THE CLOSED FORMS AGAINST THEIR OWN LIMITS.  R = 1 keeps everything and
     concentrates exactly with the volume; R = 0 lets the solute follow the
     solvent.  A sign error in an exponent shows up at once.

  2. THE HAND LAW AGAINST THE ENGINE'S OWN PUBLISHED IDEAL.  Both shipped
     witnesses carry `washoutIdeal_<s>` in their goldens, and the engine builds
     it from the run's own `R_initial_<s>` and `diavolumes`
     (src/unitOperations/batch/BatchDiafilter.cpp:597-607).  `washoutIdeal`
     here must REPRODUCE that number from those two -- which is the check that
     the page and the engine are quoting one law rather than two.

  3. THE SIGN OF THE GAP, ON THE TWO WITNESSES AT ONCE.  diafilter01's
     observed rejection RISES over the run and its actual retention lands
     ABOVE the constant-R ideal; diafilter02's FALLS and its actual lands
     BELOW.  The same defect with two signs, read off two goldens, is the
     cleanest evidence that the constant-R assumption is not conservative in
     either direction -- and it pins `gapDirection` to the data rather than to
     a sentence.

  The vessel reader is exercised on the REAL bundled witnesses through the
  same clone the engine runs (methodCase), so the (file, key) resolution
  cannot drift from the cases; and the MODE override is tested by reading the
  word back out of that clone, because a fork knob that silently misses its
  dict would run the engine on the wrong question at exit 0.
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
  type KpiMap, type Sample,
  LMH_PER_MS, TB032_EXAMPLE, concentrationAxis, concentrationIdeal,
  conservativeOptimum,
  detectDiafilter, diafiltrationTime, gapDirection, groupForLoss, lossCurve,
  lossFromGroup, lossGroup, productLoss, readSamples, readSolute, readVessel,
  retainedIdeal, scanWashOptimum, solutesFromKpis, soluteVerdict, tb032Rows,
  trapezoid, washoutIdeal,
} from "../src/ui/methods/batchMembraneMath.js";
import {
  BATCH_MEMBRANE_KNOBS, BATCH_MEMBRANE_WITNESS_CLEAN,
  BATCH_MEMBRANE_WITNESS_FOULING, DESIGN_WASH_DIAVOLUMES, buildView,
  defaultKnobValues, knobOverrides,
} from "../src/ui/methods/BatchMembraneTool.js";
import {
  BATCH_MEMBRANE_LIMITS, BATCH_MEMBRANE_STEPS,
} from "../src/ui/methods/batchMembraneLesson.js";
import { methodCase } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

// ---- The two shipped goldens ------------------------------------------------

function golden(caseDir: string): (unit: string, key: string) => number {
  const text = readFileSync(new URL(
    `../../tutorials/batch/membrane/${caseDir}/expected`, import.meta.url),
    "utf-8");
  return (unit: string, key: string): number => {
    const m = new RegExp(`^kpi\\s+${unit}\\s+${key}\\s+(\\S+)`, "m").exec(text);
    if (m === null) throw new Error(`${caseDir}: golden has no KPI ${key}`);
    return Number(m[1]);
  };
}

const clean = golden("diafilter01_nf_desalting");
const fouled = golden("diafilter02_fouling_decline");

// ---- 1. The closed forms, and their own limits ------------------------------

describe("the classical batch results, against their limiting cases", () => {
  it("a perfect rejection removes nothing and concentrates with the volume", () => {
    expect(washoutIdeal(1, 12)).toBeCloseTo(1, 12);
    expect(retainedIdeal(1, 20)).toBeCloseTo(1, 12);
    //  c/c_0 = VCF when nothing leaves: the same moles in 1/VCF the volume.
    expect(concentrationIdeal(1, 20)).toBeCloseTo(20, 10);
    expect(productLoss(1, 20, 12)).toBeCloseTo(0, 12);
  });

  it("a zero rejection follows the solvent: n/n_0 = V/V_0 and c/c_0 = 1", () => {
    expect(retainedIdeal(0, 4)).toBeCloseTo(0.25, 12);
    expect(concentrationIdeal(0, 4)).toBeCloseTo(1, 12);
    //  The wash then removes at the fastest rate the geometry allows.
    expect(washoutIdeal(0, 1)).toBeCloseTo(Math.exp(-1), 12);
  });

  it("the concentration follows the moles and the volume they sit in", () => {
    for (const R of [0.1, 0.5, 0.871, 0.9985])
      for (const vcf of [1.5, 4, 18.46])
        expect(concentrationIdeal(R, vcf))
          .toBeCloseTo(retainedIdeal(R, vcf) * vcf, 10);
  });

  it("a concentration then a wash is the two retained fractions multiplied", () => {
    const R = 0.8714, vcf = 3.2, N = 5;
    expect(1 - productLoss(R, vcf, N))
      .toBeCloseTo(retainedIdeal(R, vcf) * washoutIdeal(R, N), 12);
    //  And the exponents ADD: concentrating by VCF costs what washing
    //  ln(VCF) diavolumes costs.
    expect(productLoss(R, Math.E, 0)).toBeCloseTo(productLoss(R, 1, 1), 12);
  });

  it("the wash time is N vessel volumes of permeate through the area", () => {
    //  1 diavolume of 10 L through 5 m2 at 1e-4 m/s = 20 s.
    expect(diafiltrationTime(1, 0.010, 5, 1e-4)).toBeCloseTo(20, 10);
    expect(diafiltrationTime(5, 0.010, 5, 1e-4)).toBeCloseTo(100, 10);
    //  The engine's own LMH conversion, so the page and the run agree on
    //  what the unit means (BatchDiafilter.cpp:553).
    expect(LMH_PER_MS).toBe(3.6e6);
  });
});

// ---- 2. The hand law against the ENGINE's own published ideal ---------------

describe("the hand washout reproduces the engine's own washoutIdeal", () => {
  it("on diafilter01, from that run's R_initial and diavolumes", () => {
    const N = clean("retentate", "diavolumes");
    for (const s of ["NaCl", "MgSO4"]) {
      const R0 = clean("retentate", `R_initial_${s}`);
      expect(washoutIdeal(R0, N))
        .toBeCloseTo(clean("retentate", `washoutIdeal_${s}`), 10);
    }
  });

  it("on diafilter02, whose fouling moved N and both rejections", () => {
    const N = fouled("retentate", "diavolumes");
    for (const s of ["NaCl", "MgSO4"]) {
      const R0 = fouled("retentate", `R_initial_${s}`);
      expect(washoutIdeal(R0, N))
        .toBeCloseTo(fouled("retentate", `washoutIdeal_${s}`), 10);
    }
    //  The two witnesses really are different runs -- otherwise the arm
    //  above would be checking one number twice.
    expect(N).not.toBeCloseTo(clean("retentate", "diavolumes"), 3);
  });

  it("the engine's washoutActual IS the retained fraction it reports", () => {
    for (const s of ["NaCl", "MgSO4"]) {
      expect(clean("retentate", `washoutActual_${s}`))
        .toBeCloseTo(clean("retentate", `recovery_${s}`), 12);
      expect(fouled("retentate", `washoutActual_${s}`))
        .toBeCloseTo(fouled("retentate", `recovery_${s}`), 12);
    }
  });
});

// ---- 3. The sign of the gap, on two witnesses at once ------------------------

describe("which way the constant-R law was wrong, from the run's own R", () => {
  const verdict = (g: (u: string, k: string) => number, s: string) =>
    soluteVerdict({
      [`R_initial_${s}`]: g("retentate", `R_initial_${s}`),
      [`R_final_${s}`]: g("retentate", `R_final_${s}`),
      [`recovery_${s}`]: g("retentate", `recovery_${s}`),
      [`washoutActual_${s}`]: g("retentate", `washoutActual_${s}`),
      [`washoutIdeal_${s}`]: g("retentate", `washoutIdeal_${s}`),
    }, s, g("retentate", "diavolumes"),
      g("retentate", "concentrationFactor"));

  it("diafilter01: the rejection ROSE, and more was retained than ideal", () => {
    const v = verdict(clean, "NaCl");
    expect(v.R1! - v.R0!).toBeGreaterThan(0);
    expect(v.washoutActual!).toBeGreaterThan(v.washoutIdeal!);
    expect(gapDirection(v)).toMatch(/ROSE/);
    expect(gapDirection(v)).toMatch(/MORE was retained/);
  });

  it("diafilter02: the rejection FELL, and less was retained than ideal", () => {
    const v = verdict(fouled, "NaCl");
    expect(v.R1! - v.R0!).toBeLessThan(0);
    expect(v.washoutActual!).toBeLessThan(v.washoutIdeal!);
    expect(gapDirection(v)).toMatch(/FELL/);
    expect(gapDirection(v)).toMatch(/LESS was retained/);
  });

  it("the hand law lands on the engine's ideal, and the actual is elsewhere", () => {
    const v = verdict(clean, "NaCl");
    expect(v.handIdeal!).toBeCloseTo(v.washoutIdeal!, 10);
    expect(Math.abs(v.washoutActual! - v.handIdeal!)).toBeGreaterThan(1e-4);
  });

  it("a rejection that did not move has nothing to be wrong about", () => {
    const v = soluteVerdict(
      { "R_initial_x": 0.5, "R_final_x": 0.5 }, "x", 1, 1);
    expect(gapDirection(v)).toMatch(/did not move/);
  });

  it("no rejections at all -> no claim about the direction", () => {
    expect(gapDirection(soluteVerdict({}, "x", 1, 1))).toBeNull();
  });
});

// ---- Detection --------------------------------------------------------------

describe("detectDiafilter -- which unit in a run is a batch membrane vessel", () => {
  const block = {
    V_permeated_m3: 0.05, diavolumes: 5.4, concentrationFactor: 1,
    V_initial_m3: 0.01, R_initial_NaCl: 0.87, R_initial_MgSO4: 0.99,
  };

  it("finds the vessel, its solutes and its mode from the run alone", () => {
    const d = detectDiafilter(["retentate.V_m3"], { retentate: block });
    expect(d.active).toBe(true);
    expect(d.unit).toBe("retentate");
    expect(d.solutes).toEqual(["MgSO4", "NaCl"]);
    //  Constant volume is read from the engine's own counter, never from a
    //  dict word (BatchDiafilter.H:262-263).
    expect(d.constantVolume).toBe(true);
    expect(detectDiafilter(["retentate.V_m3"],
      { retentate: { ...block, diavolumes: 0 } }).constantVolume).toBe(false);
  });

  it("does NOT open on an electrodialysis stack's concentrationFactor", () => {
    //  batchElectrodialysis publishes a key of that name for a different
    //  quantity (BatchElectrodialysis.cpp:882); matching it would draw this
    //  page over a stack.
    const ed: KpiMap = { ED: { concentrationFactor: 3.1, R_initial_NaCl: 0.9 } };
    expect(detectDiafilter(["ED.V_m3"], ed).active).toBe(false);
  });

  it("refuses a block with no solutes and a run with no volume column", () => {
    expect(detectDiafilter(["retentate.V_m3"], {
      retentate: { V_permeated_m3: 1, diavolumes: 1 },
    }).active).toBe(false);
    expect(detectDiafilter([], { retentate: block }).active).toBe(false);
    expect(detectDiafilter(["retentate.V_m3"], undefined).active).toBe(false);
  });

  it("solutesFromKpis reads the names off the run, not a list", () => {
    expect(solutesFromKpis(block)).toEqual(["MgSO4", "NaCl"]);
    expect(solutesFromKpis(undefined)).toEqual([]);
  });
});

// ---- The trajectory readers -------------------------------------------------

describe("readSamples and readSolute -- the run's own columns", () => {
  const traj = {
    t: [0, 10, 20],
    vars: {
      "retentate.V_m3": [0.01, 0.008, 0.006],
      "retentate.J_w_LMH": [233, 200, 150],
      "retentate.Q_p_m3s": [3.2e-4, 2.8e-4, 2.1e-4],
      "retentate.diavolumes": [0, 0, 0],
      "retentate.V_perm_m3": [0, 3.0e-3, 5.4e-3],
      "retentate.c_b_NaCl": [0.02, 0.023, 0.027],
      "retentate.c_p_NaCl": [0.0026, 0.004, 0.007],
      "retentate.R_obs_NaCl": [0.87, 0.826, 0.741],
    },
  };

  it("builds the VCF from the run's own V_0 and V", () => {
    const s = readSamples(traj, "retentate", 0.01);
    expect(s).not.toBeNull();
    expect(s!.length).toBe(3);
    expect(s![0]!.vcf).toBeCloseTo(1, 12);
    expect(s![2]!.vcf).toBeCloseTo(0.01 / 0.006, 12);
    //  No fouling column in this run -> null, never a 1 standing in for it.
    expect(s![0]!.permeanceRatio).toBeNull();
  });

  it("returns null when a column the construction walks is missing", () => {
    const { "retentate.Q_p_m3s": _dropped, ...rest } = traj.vars;
    expect(readSamples({ t: traj.t, vars: rest }, "retentate", 0.01)).toBeNull();
    expect(readSamples(undefined, "retentate", 0.01)).toBeNull();
  });

  it("reads the engine's R_obs rather than recomputing it from c_p/c_b", () => {
    const ser = readSolute(traj, "retentate", "NaCl");
    expect(ser!.R).toEqual([0.87, 0.826, 0.741]);
    expect(readSolute(traj, "retentate", "nosuch")).toBeNull();
  });
});

describe("trapezoid -- the re-quadrature the engine's header warns about", () => {
  it("integrates a straight line exactly and a curve to second order", () => {
    expect(trapezoid([0, 1, 2], [0, 1, 2])).toBeCloseTo(2, 12);
    //  INTEGRAL x^2 over [0,2] = 8/3; the trapezoid on a 0.5 mesh overshoots.
    const x = [0, 0.5, 1, 1.5, 2];
    const area = trapezoid(x, x.map((v) => v * v));
    expect(area).toBeGreaterThan(8 / 3);
    expect(area - 8 / 3).toBeLessThan(0.1);
  });

  it("is empty on a single point, never NaN", () => {
    expect(trapezoid([1], [1])).toBe(0);
  });
});

// ---- The diafiltration optimum ---------------------------------------------

describe("scanWashOptimum -- the maximum of J_w c, located on the run", () => {
  //  A synthetic sweep whose product has a KNOWN interior maximum:
  //  J = 10 - c on c = 1..9, so J c = c(10 - c) peaks at c = 5.
  const sweep = (cs: number[]) => {
    const samples: Sample[] = cs.map((c, k) => ({
      t: k, V: 1 / c, vcf: c, J_LMH: 10 - c, Qp: 0, N: 0, Vperm: 0,
      permeanceRatio: null,
    }));
    return scanWashOptimum(samples, cs);
  };

  it("finds an INTERIOR maximum and says it is interior", () => {
    const scan = sweep([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(scan).not.toBeNull();
    expect(scan!.interior).toBe(true);
    expect(scan!.points[scan!.iMax]!.c).toBeCloseTo(5, 12);
    expect(scan!.points[scan!.iMax]!.Jc).toBeCloseTo(25, 12);
  });

  it("an ENDPOINT largest value is reported as not an optimum", () => {
    //  A window that stops before the turn: the biggest point is the last.
    const scan = sweep([1, 2, 3]);
    expect(scan!.interior).toBe(false);
    expect(scan!.iMax).toBe(2);
  });

  it("skips non-finite points and refuses a window too short to have one", () => {
    const scan = sweep([1, 2, 3, 4, 5]);
    expect(scan!.points.length).toBe(5);
    expect(sweep([1, 2])).toBeNull();
  });
});

// ---- The g/L axis, and the absence it must keep meaning ---------------------

describe("concentrationAxis -- g/L only from the RUN's own molar mass", () => {
  it("converts with the molar mass and NO other factor", () => {
    //  kmol/m3 * kg/kmol = kg/m3, and 1 kg/m3 IS 1 g/L: the scale is the
    //  molar mass itself.  0.1 kmol/m3 of NaCl (58.44 kg/kmol) is 5.844 g/L.
    const a = concentrationAxis("NaCl", { NaCl: 58.44, water: 18.015 });
    expect(a.converted).toBe(true);
    expect(a.scale).toBe(58.44);
    expect(a.unit).toBe("g/L");
    expect(a.productUnit).toBe("g/(m²·h)");
    expect(0.1 * a.scale).toBeCloseTo(5.844, 12);
  });

  it("the product axis agrees with the molar route, as the units demand", () => {
    //  C [kmol/m3] is C [mol/L], so C J_f is mol/(m2 h); multiplying by the
    //  molar mass in g/mol -- numerically kg/kmol -- gives g/(m2 h).  The
    //  page scales C and C J_f by the SAME number, which is that statement.
    const a = concentrationAxis("MgSO4", { MgSO4: 120.37 });
    const c = 0.05;          // kmol/m3
    const J = 200;           // L/(m2 h)
    const Jc_molar = c * J;              // mol/(m2 h)
    expect(Jc_molar * a.scale).toBeCloseTo(c * a.scale * J, 10);  // g/(m2 h)
  });

  it("cannot move the optimum: a positive constant preserves the argmax", () => {
    const samples: Sample[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c, k) => ({
      t: k, V: 1 / c, vcf: c, J_LMH: 10 - c, Qp: 0, N: 0, Vperm: 0,
      permeanceRatio: null,
    }));
    const scan = scanWashOptimum(samples, [1, 2, 3, 4, 5, 6, 7, 8, 9])!;
    const a = concentrationAxis("NaCl", { NaCl: 58.44 });
    let iMax = 0;
    for (let k = 1; k < scan.points.length; k++)
      if (scan.points[k]!.Jc * a.scale > scan.points[iMax]!.Jc * a.scale)
        iMax = k;
    expect(iMax).toBe(scan.iMax);
  });

  it("STAYS in the run's unit when the run published no molar mass", () => {
    for (const a of [
      concentrationAxis("NaCl", undefined),           // an older result
      concentrationAxis(null, { NaCl: 58.44 }),       // no retained species
      concentrationAxis("Protein", { NaCl: 58.44 }),  // none for THIS species
    ]) {
      expect(a.converted).toBe(false);
      expect(a.molarMass).toBeNull();
      expect(a.scale).toBe(1);
      expect(a.unit).toBe("kmol/m³");
      expect(a.productUnit).toBe("mol/(m²·h)");
    }
  });

  it("a non-positive or non-finite molar mass is treated as ABSENT", () => {
    //  NOTHING INVENTED: a zero is not a molar mass, and it must not become
    //  an axis scaled by nothing.
    for (const mw of [0, -1, NaN, Infinity]) {
      const a = concentrationAxis("X", { X: mw });
      expect(a.converted).toBe(false);
      expect(a.scale).toBe(1);
    }
  });
});

// ---- The vessel, read from the real witnesses -------------------------------

describe("readVessel -- the witnesses' own declared operation", () => {
  it("reads the clean twin's declaration, and NOTHING is defaulted", () => {
    const v = readVessel(
      methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, []), "retentate");
    expect(v.unitFound).toBe(true);
    expect(v.mode).toBe("constantVolume");
    expect(v.membrane).toBe("NF270");
    expect(v.transport).toBe("solutionDiffusion");
    expect(v.area).toBeCloseTo(5, 12);
    expect(v.Pfeed).toBeCloseTo(1.0e6, 6);
    expect(v.Pperm).toBeCloseTo(0, 12);
    expect(v.tmp).toBeCloseTo(1.0e6, 6);
    expect(v.kFilm).toBeCloseTo(1.0e-4, 12);
    expect(v.rho).toBeCloseTo(1000, 12);
    expect(v.fouling).toBeNull();
    expect(v.missing).toEqual([]);
  });

  it("reads the fouled twin's Hermia block, INCLUDING its required reason", () => {
    const v = readVessel(
      methodCase(BATCH_MEMBRANE_WITNESS_FOULING, []), "retentate");
    expect(v.fouling).not.toBeNull();
    expect(v.fouling!.law).toBe("cake");
    expect(v.fouling!.k).toBeCloseTo(4.0e11, 0);
    //  The engine refuses the block without one (BatchDiafilter.cpp:191-199),
    //  and the page quotes it verbatim -- so it must actually arrive.
    expect(v.fouling!.reason).toMatch(/HYPOTHETICAL/);
    //  Everything ELSE is the clean twin's: the two differ by the fouling
    //  block alone, which is what makes their difference readable.
    const c = readVessel(
      methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, []), "retentate");
    expect(v.area).toBe(c.area);
    expect(v.Pfeed).toBe(c.Pfeed);
    expect(v.kFilm).toBe(c.kFilm);
    expect(v.mode).toBe(c.mode);
  });

  it("matches a flattened fractal name on its last segment", () => {
    const v = readVessel(
      methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, []), "FILTRATION.retentate");
    expect(v.unitFound).toBe(true);
    expect(v.area).toBeCloseTo(5, 12);
  });

  it("NAMES what it cannot find, and defaults nothing", () => {
    const v = readVessel(
      methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, []), "nosuchunit");
    expect(v.unitFound).toBe(false);
    expect(v.area).toBeNull();
    expect(v.kFilm).toBeNull();
    expect(v.missing.join(" ")).toMatch(/system\/flowsheetDict/);
    expect(readVessel(null, "retentate").missing.length).toBeGreaterThan(0);
  });
});

// ---- The knobs, and the MODE fork -------------------------------------------

describe("the knobs write the witness's own declared slots", () => {
  it("the mode override really flips the word in the clone the engine runs", () => {
    //  A fork knob that silently missed its dict would run the engine on the
    //  wrong question at exit 0, so the word is read back out.
    const wash = methodCase(BATCH_MEMBRANE_WITNESS_CLEAN,
      knobOverrides(defaultKnobValues(), "constantVolume"));
    const conc = methodCase(BATCH_MEMBRANE_WITNESS_CLEAN,
      knobOverrides(defaultKnobValues(), "concentration"));
    expect(readVessel(wash, "retentate").mode).toBe("constantVolume");
    expect(readVessel(conc, "retentate").mode).toBe("concentration");
    //  and it flips on the fouled twin too, which is a different file.
    expect(readVessel(methodCase(BATCH_MEMBRANE_WITNESS_FOULING,
      knobOverrides(defaultKnobValues(), "concentration")),
    "retentate").mode).toBe("concentration");
  });

  it("every numeric knob moves the value the engine reads", () => {
    const files = methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, knobOverrides(
      { P_feed: 25, area: 12, k_film: 2.5e-5, endTime: 400 },
      "constantVolume"));
    const v = readVessel(files, "retentate");
    expect(v.Pfeed).toBeCloseTo(2.5e6, 6);
    expect(v.area).toBeCloseTo(12, 12);
    expect(v.kFilm).toBeCloseTo(2.5e-5, 15);
    expect(files.rawFiles!["system/controlDict"]).toMatch(/endTime\s+400;/);
  });

  it("the defaults ARE the witness's authored values, not a second set", () => {
    const authored = readVessel(
      methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, []), "retentate");
    const d = defaultKnobValues();
    expect(d["P_feed"]! * 1e5).toBeCloseTo(authored.Pfeed!, 6);
    expect(d["area"]).toBeCloseTo(authored.area!, 12);
    expect(d["k_film"]).toBeCloseTo(authored.kFilm!, 15);
    //  Every knob declares the unit the dict spells, so a value written under
    //  the wrong one refuses instead of running (methodRun's own rule).
    for (const k of BATCH_MEMBRANE_KNOBS)
      expect(typeof k.unit).toBe("string");
  });

  it("a non-finite knob keeps the witness's number rather than writing NaN", () => {
    const ov = knobOverrides({ P_feed: NaN, area: 7 }, "concentration");
    expect(ov.some((o) => "value" in o && Number.isNaN(o.value))).toBe(false);
    expect(ov.filter((o) => "value" in o).length).toBe(1);
  });
});

// ---- The assembled view -----------------------------------------------------

describe("buildView -- what the page draws, assembled once", () => {
  const traj = {
    t: [0, 10, 20],
    vars: {
      "retentate.V_m3": [0.01, 0.01, 0.01],
      "retentate.J_w_LMH": [233, 245, 256],
      "retentate.Q_p_m3s": [3.2e-4, 3.4e-4, 3.6e-4],
      "retentate.diavolumes": [0, 0.34, 0.7],
      "retentate.V_perm_m3": [0, 3.4e-3, 7.0e-3],
      "retentate.c_b_NaCl": [0.02, 0.016, 0.013],
      "retentate.c_p_NaCl": [0.0026, 0.002, 0.0016],
      "retentate.R_obs_NaCl": [0.871, 0.873, 0.875],
      "retentate.c_b_MgSO4": [0.02, 0.0199, 0.0198],
      "retentate.c_p_MgSO4": [3e-5, 3e-5, 3e-5],
      "retentate.R_obs_MgSO4": [0.9985, 0.9985, 0.9986],
    },
  };
  const kpis: KpiMap = {
    retentate: {
      V_initial_m3: 0.01, V_permeated_m3: 7.0e-3, diavolumes: 0.7,
      concentrationFactor: 1, J_w_final_LMH: 256,
      R_initial_NaCl: 0.871, R_final_NaCl: 0.875, recovery_NaCl: 0.55,
      washoutActual_NaCl: 0.55, washoutIdeal_NaCl: washoutIdeal(0.871, 0.7),
      R_initial_MgSO4: 0.9985, R_final_MgSO4: 0.9986, recovery_MgSO4: 0.999,
      washoutActual_MgSO4: 0.999,
      washoutIdeal_MgSO4: washoutIdeal(0.9985, 0.7),
    },
  };

  it("carries the run's clock, its solutes and the case's declaration", () => {
    const v = buildView(traj, kpis,
      methodCase(BATCH_MEMBRANE_WITNESS_CLEAN, []));
    expect(v).not.toBeNull();
    expect(v!.unit).toBe("retentate");
    expect(v!.constantVolume).toBe(true);
    expect(v!.solutes).toEqual(["MgSO4", "NaCl"]);
    expect(v!.N).toBeCloseTo(0.7, 12);
    expect(v!.vessel.area).toBeCloseTo(5, 12);
    //  The hand law reproduces the engine's ideal on every solute.
    for (const verdict of v!.verdicts)
      expect(verdict.handIdeal!).toBeCloseTo(verdict.washoutIdeal!, 12);
  });

  it("picks the RETAINED species from the run, as the highest initial R", () => {
    const v = buildView(traj, kpis, null);
    expect(v!.retained).toBe("MgSO4");
  });

  it("offers NO flux-concentration scan on a constant-volume run", () => {
    //  A wash holds the volume, so the retained species barely moves and
    //  there is nothing to sweep: the page says so instead of drawing one.
    expect(buildView(traj, kpis, null)!.scan).toBeNull();
  });

  it("scans it on a concentration run, where the volume IS the sweep", () => {
    const conc = {
      t: traj.t,
      vars: { ...traj.vars,
        "retentate.V_m3": [0.01, 0.005, 0.0025],
        "retentate.diavolumes": [0, 0, 0],
        "retentate.c_b_MgSO4": [0.02, 0.039, 0.075],
        "retentate.J_w_LMH": [233, 120, 20] },
    };
    const k: KpiMap = { retentate: { ...kpis["retentate"]!,
      diavolumes: 0, concentrationFactor: 4 } };
    const v = buildView(conc, k, null)!;
    expect(v.constantVolume).toBe(false);
    expect(v.scan).not.toBeNull();
    expect(v.scan!.points.length).toBe(3);
    //  4.66 / 4.68 / 1.50 -- the turn is between the second and the third.
    expect(v.scan!.iMax).toBe(1);
    expect(v.scan!.interior).toBe(true);
  });

  it("re-quadratures the permeate beside the integrator's accepted state", () => {
    const v = buildView(traj, kpis, null)!;
    expect(v.VpermState).toBeCloseTo(7.0e-3, 12);
    //  The trapezoid over the WRITTEN samples is a DIFFERENT number, and
    //  that difference is the whole point of the row
    //  (BatchDiafilter.H:255-263).
    expect(v.VpermTrapezoid).toBeCloseTo(
      trapezoid(traj.t, traj.vars["retentate.Q_p_m3s"]), 15);
    expect(v.VpermTrapezoid).not.toBeCloseTo(v.VpermState!, 6);
  });

  it("is null when the run is not a batch membrane run at all", () => {
    expect(buildView(undefined, undefined, null)).toBeNull();
    expect(buildView(traj, { flash: { V_over_F: 0.3 } }, null)).toBeNull();
  });
});

// ---- The lesson and the registry --------------------------------------------

describe("the batch membrane lesson", () => {
  it("has nine steps, numbered without a gap, and every formula is glossed", () => {
    expect(BATCH_MEMBRANE_STEPS.map((s) => s.n))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const s of BATCH_MEMBRANE_STEPS)
      if (s.formula)
        expect(s.where?.length ?? 0, `step ${s.n}`).toBeGreaterThan(0);
  });

  it("names the ONE line that differs between the two modes", () => {
    const s2 = BATCH_MEMBRANE_STEPS[1]!;
    expect(s2.formula).toContain("Q_d = 0");
    expect(s2.formula).toContain("Q_d = Q_p");
  });

  it("puts each mode's own clock on the page, and neither of them is time", () => {
    const s3 = BATCH_MEMBRANE_STEPS[2]!;
    expect(s3.formula).toContain(String.raw`\mathrm{VCF} &= \frac{V_0}{V}`);
    expect(s3.formula).toContain(String.raw`N &= \frac{\int Q_d\, \mathrm{d}t}{V_0}`);
  });

  it("derives the closed forms rather than stating them", () => {
    const s4 = BATCH_MEMBRANE_STEPS[3]!;
    expect(s4.derivation?.length ?? 0).toBeGreaterThan(4);
    expect(s4.formula).toContain(String.raw`n/n_0 = \exp(-(1 - R) N)`);
    expect(s4.formula).toContain(String.raw`\mathrm{VCF}^{-(1 - R)}`);
    expect(s4.formula).toContain(String.raw`c/c_0 = \mathrm{VCF}^{R}`);
    //  The assumption every line spends is stated as the last move, not
    //  discovered later.
    expect(s4.derivation!.some((d) => /PULLED R OUT OF THE INTEGRAL/.test(d.step)))
      .toBe(true);
  });

  it("says the engine's idealisation is built from the run, not declared", () => {
    const s5 = BATCH_MEMBRANE_STEPS[4]!;
    expect(s5.note).toMatch(/CANNOT HAVE BEEN ARRANGED/);
    expect(s5.note).toMatch(/NO IDEAL AT ALL/);
    expect(s5.formula).toContain(String.raw`R_0 = R_\mathrm{obs} \text{ at } t = 0`);
  });

  it("treats a blocking law as a claim about a mechanism", () => {
    const s6 = BATCH_MEMBRANE_STEPS[5]!;
    expect(s6.formula).toContain(String.raw`\dfrac{1}{A_\mathrm{eff}} = \dfrac{1}{A_w} + r_f(v)`);
    expect(s6.note).toMatch(/REFUSED BY NAME/);
    expect(s6.note).toMatch(/written `reason`/);
  });

  it("cites the diafiltration optimum in exactly ONE place", () => {
    const whole = BATCH_MEMBRANE_STEPS.map(
      (s) => [s.title, s.body, s.formula ?? "", s.note ?? ""].join(" ")).join("");
    const hits = whole.match(/Separation Science 11\(5\) \(1976\) 499-502/g);
    expect(hits?.length).toBe(1);
    //  and it does NOT claim the gel-model closed form, which this engine
    //  cannot produce.
    expect(BATCH_MEMBRANE_STEPS[6]!.note).toMatch(/does not carry that law/);
  });

  it("NAMES the absence a reader will look for: no feed-and-bleed loop", () => {
    const fb = BATCH_MEMBRANE_LIMITS.find((l) => l.id === "no-feed-and-bleed");
    expect(fb).toBeDefined();
    expect(fb!.body).toMatch(/no feed-and-bleed membrane loop/);
    expect(fb!.body).toMatch(/quasi-steady seam/);
    //  and step 2 points at it, so a reader enumerating the modes is not
    //  left to discover the gap for themselves.
    expect(BATCH_MEMBRANE_STEPS[1]!.note).toMatch(/feed-and-bleed/);
  });

  it("names the limits that make the run honest", () => {
    const ids = BATCH_MEMBRANE_LIMITS.map((l) => l.id);
    expect(ids).toContain("no-measured-fouling");
    expect(ids).toContain("k-film-is-declared");
    expect(ids).toContain("no-energy");
    for (const l of BATCH_MEMBRANE_LIMITS)
      expect(l.body.length).toBeGreaterThan(80);
  });
});

describe("the registry entry", () => {
  const entry = METHOD_TOOLS.find((t) => t.id === "batch-membrane");

  it("is live, a construction, and shelved with the separations", () => {
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("live");
    expect(entry!.kind).toBe("construction");
    expect(entry!.discipline).toBe("Separations & phase equilibria");
    expect(entry!.theory).toBe("ch:membrane");
  });

  it("says in one line what it teaches", () => {
    expect(entry!.teaches.length).toBeGreaterThan(120);
    expect(entry!.teaches).toMatch(/Q_d/);
  });
});

// ---- The design brief -------------------------------------------------------

describe("the wash-length design brief", () => {
  it("is a stated classroom question, and it prices the composite loss", () => {
    //  It exists so the loss row carries no literal with no source.  Its
    //  value is a design QUESTION, so the only thing to assert about it is
    //  that it is a real length and that the closed form uses it.
    expect(DESIGN_WASH_DIAVOLUMES).toBeGreaterThan(0);
    const R = 0.9985;
    expect(productLoss(R, 3, DESIGN_WASH_DIAVOLUMES))
      .toBeGreaterThan(productLoss(R, 3, 0));
    //  Longer wash, more product lost -- monotone, which is the trade the
    //  row exists to show.
    expect(productLoss(R, 3, 10)).toBeGreaterThan(productLoss(R, 3, 5));
  });
});

// ---- The governing group, ln VCF + N ----------------------------------------

describe("the governing group: VCF and N enter the loss ONLY through it", () => {
  it("productLoss IS the group form, so the two cannot drift apart", () => {
    for (const R of [0.5, 0.8714, 0.99, 0.9985])
      for (const vcf of [1, 3.2, 20])
        for (const N of [0, 4.3, 7])
          expect(productLoss(R, vcf, N))
            .toBeCloseTo(lossFromGroup(R, lossGroup(vcf, N)), 14);
  });

  it("the concentration and the wash are INTERCHANGEABLE in the yield", () => {
    //  Concentrating by VCF costs exactly what washing ln(VCF) diavolumes
    //  costs -- the whole claim of step 9, as an identity.
    const R = 0.99;
    expect(lossGroup(Math.E ** 3, 7)).toBeCloseTo(lossGroup(1, 10), 12);
    expect(productLoss(R, 20, 7))
      .toBeCloseTo(productLoss(R, 1, Math.log(20) + 7), 14);
    expect(productLoss(R, 20, 7))
      .toBeCloseTo(productLoss(R, 20 * Math.E, 6), 14);
  });

  it("groupForLoss inverts the loss, and R = 1 spends any group at all", () => {
    for (const R of [0.8, 0.99, 0.999])
      for (const loss of [0.01, 0.07, 0.3])
        expect(lossFromGroup(R, groupForLoss(R, loss))).toBeCloseTo(loss, 12);
    expect(Number.isFinite(groupForLoss(1, 0.07))).toBe(false);
  });

  it("lossCurve is the closed form at every point, and rises with G", () => {
    const G = [0, 4, 8, 12, 16];
    const y = lossCurve(0.99, G);
    expect(y.length).toBe(G.length);
    y.forEach((v, k) => expect(v).toBeCloseTo(lossFromGroup(0.99, G[k]!), 14));
    for (let k = 1; k < y.length; k++) expect(y[k]!).toBeGreaterThan(y[k - 1]!);
    //  A perfect membrane loses nothing at any group.
    expect(lossCurve(1, G).every((v) => Math.abs(v) < 1e-15)).toBe(true);
  });
});

// ---- The source's worked example, RECOMPUTED --------------------------------

describe("TB032 p. 6, recomputed from the closed form", () => {
  const rows = tb032Rows();

  it("carries the source's INPUTS and computes everything else", () => {
    expect(TB032_EXAMPLE.vcf).toBe(20);
    expect(TB032_EXAMPLE.N).toBe(7);
    expect(TB032_EXAMPLE.goal).toBe(0.07);
    expect(rows.length).toBe(4);
    //  Every row's G and loss follow from its own VCF, N and R -- nothing is
    //  transcribed, which is what makes quoting a copyrighted brief safe.
    for (const r of rows) {
      expect(r.G).toBeCloseTo(lossGroup(TB032_EXAMPLE.vcf, r.N), 14);
      expect(r.loss).toBeCloseTo(lossFromGroup(r.R, r.G), 14);
    }
  });

  it("reproduces the three figures the source states, to its own rounding", () => {
    //  The source rounds ln 20 to 3; this module does not, so agreement is
    //  asserted at the precision the source prints (one decimal in %).
    expect(rows[0]!.G).toBeCloseTo(Math.log(20) + 7, 12);   // 9.9957, not 10
    expect(100 * rows[0]!.loss).toBeCloseTo(9.5, 1);        // the goal missed
    expect(100 * rows[1]!.loss).toBeCloseTo(7.0, 1);        // wash cut to 4.3
    expect(100 * rows[3]!.loss).toBeCloseTo(1.0, 1);        // R -> 0.999
    //  The FIRST row misses the goal, which is the decision the example
    //  exists to make; changing the membrane (row 4) meets it comfortably.
    expect(rows[0]!.loss).toBeGreaterThan(TB032_EXAMPLE.goal);
    expect(rows[3]!.loss).toBeLessThan(TB032_EXAMPLE.goal);
    //  A FINDING, recorded rather than rounded away: the source's own
    //  shortened wash of 4.3 diavolumes lands at 7.04 %, which is
    //  MARGINALLY OVER a goal of "less than 7 %".  It meets the goal only
    //  at the one decimal the source's figure is read to; the wash that
    //  exactly meets it is row 3, at 4.2613 diavolumes.  The lesson says
    //  so, because a graph read to one decimal is exactly what this page
    //  exists to replace with arithmetic.
    expect(rows[1]!.loss).toBeGreaterThan(TB032_EXAMPLE.goal);
    expect(rows[1]!.loss - TB032_EXAMPLE.goal).toBeLessThan(5e-4);
    expect(rows[2]!.loss).toBeCloseTo(TB032_EXAMPLE.goal, 12);
    expect(rows[2]!.N).toBeLessThan(TB032_EXAMPLE.Ncut);
  });

  it("the exact wash that meets the goal is the source's 4.3, unrounded", () => {
    //  Row 2 is the source's chosen value; row 3 is this page's own answer
    //  to the same question, and they must be the same number rounded.
    expect(rows[2]!.N).toBeCloseTo(4.2613, 3);
    expect(Math.abs(rows[2]!.N - TB032_EXAMPLE.Ncut)).toBeLessThan(0.05);
    expect(100 * rows[2]!.loss).toBeCloseTo(7.0, 6);
  });

  it("cutting the wash is paid for in buffer exchange, not in yield", () => {
    //  Step 4's washout at R = 0: exp(-N) of the old buffer is left behind.
    //  Stopping at 4.3 diavolumes instead of 7 leaves ~15x as much.
    const ratio = Math.exp(-rows[1]!.N) / Math.exp(-rows[0]!.N);
    expect(ratio).toBeCloseTo(Math.exp(7 - TB032_EXAMPLE.Ncut), 10);
    expect(ratio).toBeCloseTo(14.9, 1);
    //  Changing the membrane instead leaves the wash exactly where it was.
    expect(rows[3]!.N).toBe(TB032_EXAMPLE.N);
    expect(rows[3]!.G).toBeCloseTo(rows[0]!.G, 14);
  });
});

// ---- The conservative two-buffer rule ---------------------------------------

describe("conservativeOptimum -- the lower of the two buffer curves", () => {
  it("takes the LOWER optimum and names the curve it came from", () => {
    const o = conservativeOptimum([
      { buffer: "starting", c: 55 }, { buffer: "diafiltration", c: 30 }]);
    expect(o!.c).toBe(30);
    expect(o!.buffer).toBe("diafiltration");
    expect(o!.bracketed).toBe(true);
    //  Order must not decide it.
    expect(conservativeOptimum([
      { buffer: "diafiltration", c: 30 }, { buffer: "starting", c: 55 }])!.c)
      .toBe(30);
  });

  it("ONE curve is an answer that is NOT bracketed, and says so", () => {
    const o = conservativeOptimum([{ buffer: "the only one", c: 42 }]);
    expect(o!.c).toBe(42);
    expect(o!.bracketed).toBe(false);
    expect(o!.candidates.length).toBe(1);
  });

  it("drops a non-finite candidate and refuses an empty construction", () => {
    expect(conservativeOptimum([{ buffer: "x", c: NaN }])).toBeNull();
    expect(conservativeOptimum([])).toBeNull();
    const o = conservativeOptimum([
      { buffer: "x", c: NaN }, { buffer: "y", c: 12 }]);
    expect(o!.c).toBe(12);
    expect(o!.bracketed).toBe(false);
  });
});

// ---- Steps 8 and 9 -----------------------------------------------------------

describe("the construction, and the group", () => {
  const s8 = BATCH_MEMBRANE_STEPS[7]!;
  const s9 = BATCH_MEMBRANE_STEPS[8]!;

  it("step 8 teaches the construction, not just that an optimum exists", () => {
    //  The four moves of the bench method, in order.
    expect(s8.derivation?.length ?? 0).toBeGreaterThanOrEqual(4);
    const eqs = (s8.derivation ?? []).map((d) => d.eq ?? "").join(" ");
    expect(eqs).toContain(String.raw`J_f(\log C)`);
    expect(eqs).toContain(String.raw`\mathrm{DFOP}(C) = C\, J_f(C)`);
    expect(s8.formula).toContain(String.raw`\min\left( C_\mathrm{opt,start}`);
    //  and it names the two buffers as the reason there are two curves.
    expect(s8.body).toMatch(/TWICE/);
    expect(s8.body).toMatch(/starts in/);
  });

  it("step 8 calls the c_g/e rule the approximation, as its source does", () => {
    const eqs = (s8.derivation ?? []).map((d) => d.eq ?? "").join(" ");
    expect(eqs).toContain(String.raw`\frac{c_g}{e}`);
    expect(s8.formula).toMatch(/approximation of the above/);
    //  Step 7 refuses the closed form because this engine has no gel law;
    //  step 8 says industrial practice reaches the same conclusion.
    expect(BATCH_MEMBRANE_STEPS[6]!.note).toMatch(/does not carry that law/);
  });

  it("step 8 names the practical limits on ACTING on the optimum", () => {
    expect(s8.note).toMatch(/minimum recirculation volume/);
    expect(s8.note).toMatch(/STABLE/);
    expect(s8.note).toMatch(/buffer/);
    expect(s8.note).toMatch(/area/);
  });

  it("step 8 names the missing second curve rather than implying it has it", () => {
    expect(s8.note).toMatch(/ONE solution/);
    expect(s8.note).toMatch(/not bracketed/);
    const gap = BATCH_MEMBRANE_LIMITS.find((l) => l.id === "one-buffer-only");
    expect(gap).toBeDefined();
    expect(gap!.body).toMatch(/second curve/);
    expect(gap!.body).toMatch(/lower of them/);
  });

  it("step 9 makes ln VCF + N one group, and gives the yield ceiling", () => {
    expect(s9.formula).toContain(String.raw`G = \ln \mathrm{VCF} + N`);
    expect(s9.formula).toContain(String.raw`G_\mathrm{max}`);
    expect(s9.body).toMatch(/INTERCHANGEABLE/);
    //  The three-way trade, as the last move of the derivation.
    const last = (s9.derivation ?? []).slice(-1)[0];
    expect(last!.eq).toContain(String.raw`\mathrm{VCF} \downarrow`);
    expect(last!.eq).toContain(String.raw`R \uparrow`);
  });

  it("every Millipore citation on the page carries the document's number", () => {
    //  A citation that drifts into "a Millipore brief" is one a reader
    //  cannot check.  Lit. No. TB032, Rev. C, 06/03, 03-117 (2003) is what
    //  the document's own back cover states.
    const whole = BATCH_MEMBRANE_STEPS.map(
      (s) => [s.title, s.body, s.formula ?? "", s.note ?? "",
        ...(s.derivation ?? []).map((d) => `${d.step} ${d.eq ?? ""}`)]
        .join(" ")).join(" ");
    const named = whole.match(/Millipore Technical Brief/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    expect(whole.match(/TB032 \(Rev\. C, 06\/03, 03-117\)/g)?.length)
      .toBe(named.length);
  });
});

describe("the page's own answer to the construction", () => {
  const traj = {
    t: [0, 10, 20],
    vars: {
      "retentate.V_m3": [0.01, 0.005, 0.0025],
      "retentate.J_w_LMH": [233, 120, 20],
      "retentate.Q_p_m3s": [3.2e-4, 2.0e-4, 5e-5],
      "retentate.diavolumes": [0, 0, 0],
      "retentate.V_perm_m3": [0, 5.0e-3, 7.5e-3],
      "retentate.c_b_MgSO4": [0.02, 0.039, 0.075],
      "retentate.c_p_MgSO4": [3e-5, 3e-5, 3e-5],
      "retentate.R_obs_MgSO4": [0.9985, 0.9985, 0.9986],
    },
  };
  const kpis: KpiMap = { retentate: {
    V_initial_m3: 0.01, V_permeated_m3: 7.5e-3, diavolumes: 0,
    concentrationFactor: 4, R_initial_MgSO4: 0.9985, R_final_MgSO4: 0.9986,
    recovery_MgSO4: 0.999 } };

  it("is ONE buffer's, and the view carries that rather than hiding it", () => {
    const v = buildView(traj, kpis, null)!;
    expect(v.scan!.interior).toBe(true);
    expect(v.dfOptimum).not.toBeNull();
    expect(v.dfOptimum!.bracketed).toBe(false);
    expect(v.dfOptimum!.candidates.length).toBe(1);
    //  and it IS the marked maximum, not a second computation of it.
    expect(v.dfOptimum!.c).toBeCloseTo(v.scan!.points[v.scan!.iMax]!.c, 14);
  });

  it("offers no optimum at all where the run did not bracket one", () => {
    //  A monotone sweep: the largest point is an endpoint, so there is no
    //  optimum to be conservative about.
    const rising = { t: traj.t, vars: { ...traj.vars,
      "retentate.J_w_LMH": [233, 230, 228] } };
    const v = buildView(rising, kpis, null)!;
    expect(v.scan!.interior).toBe(false);
    expect(v.dfOptimum).toBeNull();
  });
});
