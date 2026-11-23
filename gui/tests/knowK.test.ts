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
  knowK.test -- the `how-do-we-know-k` EduTool ("How do we know k?").

  WHAT IT HOLDS:
    * the registry entry, its shelf and the path it sits in;
    * every knob lands on a declared number of the bundled witnesses, and the
      defaults reproduce the shipped cases;
    * on the ENGINE'S OWN output (the two witnesses run natively by the global
      setup): the decay constant the page fits from the OH signal gives the k
      the engine announced, to a part in a thousand, and with 3 % synthetic
      noise within a few percent; the engine's announced A and Ea are the
      record's own numbers converted as the engine says (computed here from
      the record text by an independent route); the fall-off cell's k agrees
      with the Lindemann blend and Troe broadening of the record; the
      rate-of-production table's rows sum to the engine's own net;
    * the fit machinery on synthetic data whose answer is known;
    * every `file:line` the lesson cites, held to the text it claims;
    * the page opens without starting a run.

  WHAT IT DOES NOT HOLD: the other temperatures, pressures and seeds of the
  page, which no test can run without the engine in the loop; they were run
  natively when the page was built and the report of that work holds the
  numbers.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { methodCase } from "../src/case/methodRun.js";
import {
  ARR_XH2, BREAK_XH2, BREAK_XOH, CELL_PRESSURE, CELL_VOLUME, FALLOFF_P_BAR, FALLOFF_T,
  FALLOFF_XH2O2, KNOW_K_FALLOFF_WITNESS, KNOW_K_WITNESS, NOISE_SEEDS, ONE_XH2_STOPS, R_GAS,
  ROP_TIME, RXN_FALLOFF, RXN_OH_H2, SEED_XOH, SERIES_XH2, T_STOPS, adaptWindow,
  announcedLaws, arrheniusFit, chargeKmol, concMolCm3, effectiveEa, engineBimolecularK,
  engineFalloff, experimentOverrides, falloffK, fitDecay, linearFit, recordEfficiencies,
  recordExponents, recordTroe, ropOf, signalOf, troeBroadening, withNoise,
} from "../src/case/knowK.js";
import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { KNOW_K_LIMITS, KNOW_K_STEPS, KNOW_K_TASK } from "../src/ui/methods/knowKLesson.js";
import { KnowKTool } from "../src/ui/methods/KnowKTool.js";
import { METHOD_PATHS, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

function parseTrajectory(csv: string): TrajectoryData {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  head.slice(1).forEach((h, j) => { vars[h] = rows.map((r) => r[j + 1]!); });
  return { t: rows.map((r) => r[0]!), vars };
}
const CASE1 = "tutorials/batch/combustion/kinetics01_oh_decay";
const CASE2 = "tutorials/batch/combustion/kinetics02_h2o2_falloff";
const traj1 = () => parseTrajectory(witnessOutput(CASE1, "trajectory.csv"));
const traj2 = () => parseTrajectory(witnessOutput(CASE2, "trajectory.csv"));
const reactions = (): string => tree(`${CASE1}/constant/reactions`);

describe("how-do-we-know-k: registry and path", () => {
  it("is live on the Reaction engineering shelf, anchored in the gas kinetics chapter", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "how-do-we-know-k");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("Reaction engineering");
    expect(t?.theory).toBe("ch:gas-kinetics");
    expect(t?.origins).toEqual(["engine", "page", "assumption"]);
    expect(tree("docs/theoryGuide.tex")).toContain("\\label{ch:gas-kinetics}");
  });
  it("sits after the reactor ladder in the reaction engineering path", () => {
    const p = METHOD_PATHS.find((x) => x.id === "reaction-engineering");
    const ids = p!.steps.map((s) => s.tool);
    expect(ids.indexOf("how-do-we-know-k")).toBe(ids.indexOf("reactor-ladder") + 1);
  });
});

describe("how-do-we-know-k: the knobs land on declared numbers", () => {
  const E = { T: 1000, P: CELL_PRESSURE, xH2: 0.01, xOH: 1e-6, xH2O2: 0, endTime: 1e-4 };
  it("the OH case: the default experiment writes back the numbers the case declares", () => {
    const base = methodCase(KNOW_K_WITNESS, []);
    const set = methodCase(KNOW_K_WITNESS, experimentOverrides(E));
    const num = (files: typeof base.rawFiles, f: string, key: string): number => {
      const m = new RegExp(`^[ \\t]*${key}[ \\t]+([-+]?[0-9][-+0-9.eE]*)`, "m").exec(files![f]!);
      return Number(m![1]);
    };
    for (const [f, key] of [["0/internalStates/bomb", "T"], ["0/internalStates/bomb", "H2"],
      ["0/internalStates/bomb", "OH"], ["0/internalStates/bomb", "H2O2"],
      ["system/controlDict", "endTime"], ["system/controlDict", "writeInterval"]] as const)
      expect(num(set.rawFiles, f, key), key).toBeCloseTo(num(base.rawFiles, f, key), 12);
    //  the bath is what is left; the charge is P V / R T for the case's own volume and pressure
    const bomb = base.rawFiles!["0/internalStates/bomb"]!;
    expect(num(base.rawFiles, "0/internalStates/bomb", "N2")).toBeCloseTo(1 - 0.01 - 1e-6, 9);
    expect(num(base.rawFiles, "0/internalStates/bomb", "totalMoles")).toBeCloseTo(chargeKmol(1000, CELL_PRESSURE), 8);
    expect(/V\s+([0-9.]+);/.exec(bomb)![1]).toBe(String(CELL_VOLUME));
    expect(/P\s+1\.0\s+bar;/.test(bomb)).toBe(true);
  });
  it("the H2O2 case: every key the page writes exists once in its files", () => {
    const f = experimentOverrides({ T: 1000, P: 30e5, xH2: 0, xOH: 0, xH2O2: FALLOFF_XH2O2, endTime: 5e-3 });
    const set = methodCase(KNOW_K_FALLOFF_WITNESS, f);
    const base = methodCase(KNOW_K_FALLOFF_WITNESS, []);
    const num = (files: typeof base.rawFiles, key: string): number => {
      const m = new RegExp(`^[ \\t]*${key}[ \\t]+([-+]?[0-9][-+0-9.eE]*)`, "m").exec(files!["0/internalStates/bomb"]!);
      return Number(m![1]);
    };
    for (const key of ["T", "H2", "OH", "H2O2", "N2", "totalMoles"])
      expect(num(set.rawFiles, key), key).toBeCloseTo(num(base.rawFiles, key), 8);
    expect(num(base.rawFiles, "totalMoles")).toBeCloseTo(chargeKmol(1000, 30e5), 8);
  });
  it("every experiment the page runs rewrites cleanly (no key missing, none twice)", () => {
    for (const T of T_STOPS)
      expect(() => methodCase(KNOW_K_WITNESS, experimentOverrides({ ...E, T }))).not.toThrow();
    for (const x of [...ONE_XH2_STOPS, ...SERIES_XH2, ARR_XH2, BREAK_XH2])
      expect(() => methodCase(KNOW_K_WITNESS, experimentOverrides({ ...E, xH2: x }))).not.toThrow();
    for (const x of BREAK_XOH)
      expect(() => methodCase(KNOW_K_WITNESS, experimentOverrides({ ...E, xOH: x }))).not.toThrow();
    for (const T of FALLOFF_T) for (const p of FALLOFF_P_BAR)
      expect(() => methodCase(KNOW_K_FALLOFF_WITNESS, experimentOverrides(
        { T, P: p * 1e5, xH2: 0, xOH: 0, xH2O2: FALLOFF_XH2O2, endTime: 1e-3 }))).not.toThrow();
    expect(SEED_XOH).toBe(1e-6);
    expect(Object.keys(NOISE_SEEDS)).toHaveLength(5);
  });
  it("the case's rate-of-production instant, window and gas constant are the page's", () => {
    expect(tree(`${CASE1}/system/flowsheetDict`)).toMatch(/times\s+\(\s*5\.0e-6\s*\)/);
    expect(ROP_TIME).toBe(5.0e-6);
    expect(tree("src/core/Constants.H").split("\n")[46]).toContain("8.314462618");
    expect(R_GAS).toBe(8.314462618);
    for (const c of [CASE1, CASE2]) {
      expect(tree(`${c}/system/controlDict`)).toContain("application   choupoBatch;");
      expect(tree(`${c}/system/flowsheetDict`)).toContain("mode      isothermal;");
    }
  });
});

describe("how-do-we-know-k: on the engine's own output", () => {
  const sig = () => signalOf(traj1(), "OH")!;
  const c = concMolCm3(0.01, 1000, CELL_PRESSURE);
  it("the engine announced the record's A and Ea in SI, as the record converts to by hand", () => {
    const log = witnessOutput(CASE1, "log.choupoBatch");
    const law = announcedLaws(log).get(RXN_OH_H2)!;
    expect(law.A).toBeCloseTo(2.16e8 * 1e-3, 6);                  // cm3/(mol s) -> m3/(kmol s): x 1e-3
    expect(law.Ea).toBeCloseTo(3.43 * 4184, 1);                  // kcal/mol -> J/mol: x 4184
    const ex = recordExponents(reactions(), RXN_OH_H2)!;
    expect(ex.b).toBe(1.51);
    //  the record by an independent route: A and Ea in the units the record writes
    const kHand = 2.16e8 * Math.pow(1000, 1.51) * Math.exp(-(3.43 * 4184) / (R_GAS * 1000));
    expect(engineBimolecularK(log, reactions(), RXN_OH_H2, 1000)! / kHand).toBeCloseTo(1, 5);
  });
  it("the decay constant fitted from the OH signal gives the engine's k to a part in a thousand", () => {
    const s = sig();
    const d = fitDecay(s.t, s.n)!;
    expect(d.points).toBeGreaterThan(20);
    const kEng = engineBimolecularK(witnessOutput(CASE1, "log.choupoBatch"), reactions(), RXN_OH_H2, 1000)!;
    expect(d.kPrime / c / kEng).toBeCloseTo(1, 3);
  });
  it("with 3 % synthetic noise the recovered k stays within a few percent, and the noise is reproducible", () => {
    const s = sig();
    const a = withNoise(s.n, 0.03, NOISE_SEEDS.one), b = withNoise(s.n, 0.03, NOISE_SEEDS.one);
    expect(a).toEqual(b);
    expect(withNoise(s.n, 0, 1)).toEqual(s.n);
    expect(a).not.toEqual(s.n);
    const d = fitDecay(s.t, a)!;
    const kEng = engineBimolecularK(witnessOutput(CASE1, "log.choupoBatch"), reactions(), RXN_OH_H2, 1000)!;
    expect(Math.abs(d.kPrime / c / kEng - 1)).toBeLessThan(0.03);
    expect(d.seKPrime / d.kPrime).toBeGreaterThan(1e-3);
  });
  it("the OH decay is the first-order law at these conditions: ln n is straight over the window", () => {
    const s = sig();
    const d = fitDecay(s.t, s.n)!;
    //  the points fall on the fitted line to 1 % in ln n across the window
    const f = linearFit(s.t.slice(0, d.last + 1), d.ln.slice(0, d.last + 1))!;
    expect(f.r2).toBeGreaterThan(0.9999);
  });
  it("the rate-of-production table of the instant has R3 as the OH sink, and its rows sum to the engine's net", () => {
    const t = ropOf(witnessOutput(CASE1, "rateOfProduction.csv"), "OH", ROP_TIME)!;
    expect(t.at).toBeCloseTo(ROP_TIME, 12);
    expect(t.rows[0]!.reaction).toBe(RXN_OH_H2);
    expect(t.rows[0]!.contribution).toBeLessThan(0);
    const sum = t.rows.reduce((s, r) => s + r.contribution, 0);
    expect(t.net).not.toBeNull();
    //  the engine lists the top reactions per side: the sum of what it lists equals its net
    expect(Math.abs(sum - t.net!) / Math.abs(t.net!)).toBeLessThan(0.02);
  });
  it("the fall-off cell: k from the H2O2 decay is the record's Lindemann blend with Troe broadening", () => {
    const s = signalOf(traj2(), "H2O2")!;
    const d = fitDecay(s.t, s.n)!;
    const log = witnessOutput(CASE2, "log.choupoBatch");
    const M = (30e5) / (R_GAS * 1000) * 1e-3;                       // kmol/m3, all-N2 bath
    const law = engineFalloff(log, reactions(), RXN_FALLOFF, 1000, M)!;
    expect(law.Pr).toBeGreaterThan(0.3);
    expect(law.Pr).toBeLessThan(2);
    expect(law.F).toBeLessThan(1);
    expect(Math.abs(d.kPrime / law.k - 1)).toBeLessThan(0.005);
    //  Troe broadening matters here: the Lindemann blend alone is off by more than the fit is
    expect(Math.abs(law.kLindemann / law.k - 1)).toBeGreaterThan(0.05);
  });
});

describe("how-do-we-know-k: the fits and the laws on data whose answer is known", () => {
  it("a straight line is recovered exactly, with zero standard error", () => {
    const x = [0, 1, 2, 3, 4], y = x.map((v) => 3 - 2 * v);
    const f = linearFit(x, y)!;
    expect(f.slope).toBeCloseTo(-2, 12);
    expect(f.intercept).toBeCloseTo(3, 12);
    expect(f.seSlope).toBeCloseTo(0, 9);
  });
  it("fitDecay reads k' of an exponential, and refuses a signal that does not fall", () => {
    const t = Array.from({ length: 60 }, (_, i) => i * 0.1);
    const n = t.map((v) => 7 * Math.exp(-0.9 * v));
    expect(fitDecay(t, n)!.kPrime).toBeCloseTo(0.9, 10);
    expect(fitDecay(t, t.map(() => 1))).toBeNull();
    expect(fitDecay(t.slice(0, 3), n.slice(0, 3))).toBeNull();
  });
  it("an Arrhenius plot of a law with b = 0 reads Ea exactly; with b it reads Ea + bRT near the middle", () => {
    const Ts = [800, 900, 1000, 1100, 1200, 1300, 1400];
    const Ea = 40000, A = 1e12;
    const f0 = arrheniusFit(Ts, Ts.map((T) => A * Math.exp(-Ea / (R_GAS * T))))!;
    expect(f0.EaApp).toBeCloseTo(Ea, 4);
    expect(f0.lnA).toBeCloseTo(Math.log(A), 8);
    const b = 1.51;
    const fb = arrheniusFit(Ts, Ts.map((T) => A * Math.pow(T, b) * Math.exp(-Ea / (R_GAS * T))))!;
    const Tmean = 1 / (Ts.reduce((s, T) => s + 1 / T, 0) / Ts.length);
    expect(Math.abs(fb.EaApp / effectiveEa(Ea, b, Tmean) - 1)).toBeLessThan(0.01);
    expect(fb.EaApp).toBeGreaterThan(Ea);
  });
  it("the Troe broadening falls to Fcent at the centre and recovers slowly on either side", () => {
    const troe = [0.5, 1e-30, 1e30];                              // Fcent = 0.5 at any T of this record
    const c = -0.4 - 0.67 * Math.log10(0.5);
    const mid = troeBroadening(Math.pow(10, -c), 1000, troe);     // log Pr = -c: the centre
    expect(mid.Fcent).toBeCloseTo(0.5, 12);
    expect(mid.F).toBeCloseTo(0.5, 9);
    //  Troe's F tends to 1 only slowly (as 1/(1 + x^2)): two decades from the centre it is still well below
    const near = troeBroadening(Math.pow(10, -c + 2), 1000, troe).F;
    const far = troeBroadening(Math.pow(10, -c + 8), 1000, troe).F;
    expect(near).toBeGreaterThan(mid.F);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(1);
  });
  it("the Lindemann blend tends to k0 [M] at low pressure and to k_inf at high; k is that times F", () => {
    const inf = { A: 3e14, b: 0, Ea: 2e5 }, low = { A: 1e14, b: 0, Ea: 1.9e5 };
    const lo = falloffK(inf, low, [0.5, 1e-30, 1e30], 1000, 1e-9);
    expect(lo.kLindemann / (lo.kLow * 1e-9)).toBeCloseTo(1, 3);
    const hi = falloffK(inf, low, [0.5, 1e-30, 1e30], 1000, 1e9);
    expect(hi.kLindemann / hi.kInf).toBeCloseTo(1, 3);
    expect(hi.k / (hi.kLindemann * hi.F)).toBeCloseTo(1, 12);
  });
  it("the record's Troe numbers and efficiencies are read from the text, as written", () => {
    expect(recordTroe(reactions(), RXN_FALLOFF)).toEqual([0.5, 1e-30, 1e30]);
    expect(recordTroe(reactions(), "R9_H_O2_M_HO2")).toEqual([0.5, 1e-30, 1e30, 1e100]);
    expect(recordEfficiencies(reactions(), RXN_FALLOFF)).toEqual({ water: 12, H2: 2.5 });
    expect(recordExponents(reactions(), RXN_FALLOFF)).toEqual({ b: 0, bLow: 0 });
    expect(concMolCm3(0.01, 1000, 1e5)).toBeCloseTo(0.01 * 1e5 / (R_GAS * 1000) * 1e-6, 15);
  });
  it("the pilot accepts a window with the fall inside it and rescales one without", () => {
    const N = 200;
    const sig = (tau: number, w: number) => {
      const t = Array.from({ length: N + 1 }, (_, i) => (i / N) * w);
      return { t, n: t.map((v) => Math.exp(-v / tau)) };
    };
    const good = sig(1, 20);                                       // 3 e-folds at t = 3: 15 % of the window
    expect(adaptWindow(20, good.t, good.n).ok).toBe(true);
    const short = sig(1, 1);                                       // falls by 1 e-fold only
    const a = adaptWindow(1, short.t, short.n);
    expect(a.ok).toBe(false);
    expect(a.next).toBeGreaterThan(1);
    const long = sig(1, 2000);                                     // falls inside the first instants
    const b = adaptWindow(2000, long.t, long.n);
    expect(b.ok).toBe(false);
    expect(b.next).toBeLessThan(2000);
    //  one more pilot run lands inside the band
    const again = sig(1, b.next);
    expect(adaptWindow(b.next, again.t, again.n).ok).toBe(true);
  });
});

describe("how-do-we-know-k: the lesson", () => {
  it("every equation parses", () => {
    for (const s of KNOW_K_STEPS) {
      if (s.formula) expect(texParses(s.formula), s.title).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), d.step).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), w.sym).toBe(true);
    }
  });
  it("cites the engine at lines that say what the lesson claims", () => {
    const FILES: Record<string, string> = {
      "Reaction.cpp": "src/thermo/reaction/Reaction.cpp",
      "BatchReactor.cpp": "src/unitOperations/batch/BatchReactor.cpp",
    };
    const all = [...KNOW_K_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...KNOW_K_LIMITS.map((l) => l.body)].join("\n")
      + "\n" + tree("gui/src/ui/methods/KnowKTool.tsx");
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "Reaction.cpp:55": "return A * std::pow(T, b) * std::exp(-Ea / (constant::R * T));",
      "Reaction.cpp:126": "const scalar Pr = kLow * M / kInf;",
      "Reaction.cpp:127": "const scalar lindemann = kInf * Pr / (1.0 + Pr);",
      "Reaction.cpp:140": "scalar Fcent = (1.0 - alpha) * std::exp(-T / T3) + alpha * std::exp(-T / T1);",
      "Reaction.cpp:154": "const scalar logF = logFcent / (1.0 + x * x);",
      "BatchReactor.cpp:1176": "const scalar f = std::pow(1.0e-3, molecularity - 1);",
      "BatchReactor.cpp:1191": "if      (u.find(\"kcal\") != std::string::npos) f = 4184.0;",
      "BatchReactor.cpp:1388": "k = Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = tree(FILES[file]!).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const text = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
  it("the Troe equations of the lesson are the ones in the paper that was read", () => {
    //  the engine's c, n and d as written in Reaction.cpp are the paper's (6.4)-(6.6)
    const src = tree("src/thermo/reaction/Reaction.cpp");
    expect(src).toContain("const scalar c   = -0.4 - 0.67 * logFcent;");
    expect(src).toContain("const scalar nT  =  0.75 - 1.27 * logFcent;");
    expect(src).toContain("const scalar dT  =  0.14;");
  });
  it("uses no dash made of hyphens in its own prose", () => {
    const prose = [KNOW_K_TASK, ...KNOW_K_STEPS.flatMap((s) => [s.body, s.note ?? "", ...(s.derivation ?? []).map((d) => d.step)]),
      ...KNOW_K_LIMITS.map((l) => l.body)];
    for (const p of prose) expect(p, p).not.toMatch(/ -- | - /);
  });
});

describe("how-do-we-know-k: the page", () => {
  it("opens on the question and the first steps, with no run started", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(KnowKTool)));
    expect(html).toContain("How do we know k?");
    expect(html).toContain("isolate ONE reaction");
    expect(html).not.toContain("the engine is running");
    expect(html).not.toContain("conditions done");
    for (const s of KNOW_K_STEPS) expect(html).toContain(s.title.slice(0, 18).replace("'", "&#x27;"));
  });
});
