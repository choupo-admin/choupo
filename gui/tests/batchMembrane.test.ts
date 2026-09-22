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
  LMH_PER_MS, concentrationIdeal, detectDiafilter, diafiltrationTime,
  gapDirection, productLoss, readSamples, readSolute, readVessel,
  retainedIdeal, scanWashOptimum, solutesFromKpis, soluteVerdict, trapezoid,
  washoutIdeal,
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
  it("has seven steps, numbered without a gap, and every formula is glossed", () => {
    expect(BATCH_MEMBRANE_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
    expect(s3.formula).toContain("VCF = V_0 / V");
    expect(s3.formula).toContain("N   = ∫ Q_d dt / V_0");
  });

  it("derives the closed forms rather than stating them", () => {
    const s4 = BATCH_MEMBRANE_STEPS[3]!;
    expect(s4.derivation?.length ?? 0).toBeGreaterThan(4);
    expect(s4.formula).toContain("n/n_0 = exp(−(1 − R) N)");
    expect(s4.formula).toContain("VCF^−(1 − R)");
    expect(s4.formula).toContain("c/c_0 = VCF^R");
    //  The assumption every line spends is stated as the last move, not
    //  discovered later.
    expect(s4.derivation!.some((d) => /PULLED R OUT OF THE INTEGRAL/.test(d.step)))
      .toBe(true);
  });

  it("says the engine's idealisation is built from the run, not declared", () => {
    const s5 = BATCH_MEMBRANE_STEPS[4]!;
    expect(s5.note).toMatch(/CANNOT HAVE BEEN ARRANGED/);
    expect(s5.note).toMatch(/NO IDEAL AT ALL/);
    expect(s5.formula).toContain("R_0 = R_obs at t = 0");
  });

  it("treats a blocking law as a claim about a mechanism", () => {
    const s6 = BATCH_MEMBRANE_STEPS[5]!;
    expect(s6.formula).toContain("1 / A_eff = 1 / A_w + r_f(v)");
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
