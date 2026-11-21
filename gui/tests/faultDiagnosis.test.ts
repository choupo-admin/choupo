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
  faultDiagnosis.test.ts -- holds the `fault-diagnosis` EduTool (DEV.md 4c
  C464) to what it prints.  Every number the page shows is recomputed here
  from an independent statement (an exact identity, the water record, a hand
  calculation, the printed probabilities of a textbook), the challenge
  generator is pinned by seed and shown solvable from the data it prints, and
  the page's structure is held: every step has a diagram, every method has a
  figure, the challenges do not show the answer before it is asked for.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import {
  absoluteHumidity, alarmRun, arl, catalogueHead, chi2Cdf, chi2Quantile, dipStats, gammaP, hxOutlets,
  hxTrace, HX_TOY, humidistatTrace, lgamma, linearFit, lmtd, M_WATER, mean, normalTwoSided,
  normalWithin, oddOneOut, predictions, psatWater, pumpPoint, pumpResidual, PUMP_TOY, reconcile,
  roomTrace, selfHeatingShift, sensorZ, shewhartExceed, SPLITTER_A, SPLITTER_MIXER_A, STORY_SENSORS,
  STORY_TANK, tankStops, tankTrace, valveForSameFlow, WAGNER,
} from "../src/ui/methods/faultDiagnosisMath.js";
import { classifySignature, makeSignal, type Signature } from "../src/ui/methods/faultSignals.js";
import {
  diagnose, EVIDENCE, FAULT_KINDS, FAULT_LABEL, grade, kindOfSeed, KINDS_OF_PLANT, makeChallenge,
  type FaultKind,
} from "../src/ui/methods/faultChallenge.js";
import {
  FAULT_DIAGNOSIS_LIMITS, FAULT_DIAGNOSIS_QUIZ, FAULT_DIAGNOSIS_STEPS,
} from "../src/ui/methods/faultDiagnosisLesson.js";
import { DIAGRAM_STEPS } from "../src/ui/methods/FaultDiagrams.js";
import { CHALLENGE_SEEDS, FaultDiagnosisTool } from "../src/ui/methods/FaultDiagnosisTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf-8");
const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(FaultDiagnosisTool)));

describe("the humidity arithmetic is Choupo's own water record", () => {
  const dat = read("../../data/standards/components/water.dat");
  it("carries the Wagner coefficients, exponents and reducing constants of data/standards water.dat", () => {
    const nums = (key: string): number[] =>
      new RegExp(`${key}\\s*\\(([^)]*)\\)`).exec(dat)![1]!.trim().split(/\s+/).map(Number);
    expect([...WAGNER.coefficients]).toEqual(nums("coefficients"));
    expect([...WAGNER.exponents]).toEqual(nums("exponents"));
    expect(WAGNER.Tc).toBe(647.096);
    expect(dat).toContain("T 647.096 K");
    expect(WAGNER.Pc).toBe(22.064e6);
    expect(dat).toContain("P 22.064 MPa");
  });
  it("uses the molar mass the record carries, to its printed digits", () => {
    const mw = Number(/^MW\s+([\d.]+);/m.exec(dat)![1]);
    expect(Math.abs(1000 * M_WATER - mw)).toBeLessThan(0.002);
  });
  it("gives water's saturation pressure at 100 C and at 20 C", () => {
    expect(psatWater(100)).toBeCloseTo(101418, -1);          // one atmosphere is 101 325 Pa
    expect(Math.abs(psatWater(100) / 101325 - 1)).toBeLessThan(0.002);
    expect(psatWater(20)).toBeCloseTo(2339.19, 1);
  });
  it("reproduces the two absolute humidities of the story: about 10.7 and 10.2 g/m3", () => {
    const [a, b] = STORY_SENSORS;
    const ahA = absoluteHumidity(a.T, a.rhPct / 100);
    const ahB = absoluteHumidity(b.T, b.rhPct / 100);
    expect(ahA).toBeCloseTo(10.7, 1);
    expect(ahB).toBeCloseTo(10.27, 2);
    expect(Math.abs(ahA - ahB)).toBeLessThan(0.5);
    expect(a.rhPct - b.rhPct).toBe(16);                      // sixteen points apart in relative humidity
  });
});

describe("the story's two divisions and the room toy", () => {
  it("the tank and the pump give 4.5 h between stops and 20 min per stop", () => {
    const t = tankStops(STORY_TANK.tankL, STORY_TANK.loadLPerDay, STORY_TANK.pumpLPerH);
    expect(t.periodH).toBeCloseTo(4.5, 12);
    expect(t.stopMin).toBeCloseTo(20, 12);
  });
  it("two hypotheses agree on the period and differ on the stop and on the load", () => {
    const base = predictions(16, 9, 4.5, 8);
    expect(base[0]!.periodH).toBe(4.5);
    expect(base[1]!.periodH).toBeCloseTo(4.5, 12);
    expect(base[0]!.stopMin).not.toBeCloseTo(base[1]!.stopMin, 0);
    const doubled = predictions(32, 9, 4.5, 8);
    expect(doubled[0]!.periodH).toBe(4.5);                    // a timer does not follow the load
    expect(doubled[1]!.periodH).toBeCloseTo(2.25, 12);        // a full tank does
  });
  it("a 20-minute stop dips the room by the story's 0.5 to 0.7 K, and 0 minutes does not", () => {
    const o = { stopMin: 20, periodH: 4.5, startH: 1, hours: 14 };
    const st = dipStats(roomTrace(o), o);
    expect(st.dip).toBeCloseTo(0.644, 3);
    expect(st.dip).toBeGreaterThan(0.5);
    expect(st.dip).toBeLessThan(0.7);
    expect(st.recoverH).toBeCloseTo(1.35, 2);
    const none = { ...o, stopMin: 0 };
    expect(dipStats(roomTrace(none), none).dip).toBeLessThan(1e-9);
  });
  it("a longer stop dips deeper", () => {
    const dip = (m: number): number => { const o = { stopMin: m, periodH: 4.5, startH: 1, hours: 8 }; return dipStats(roomTrace(o), o).dip; };
    expect(dip(10)).toBeLessThan(dip(20));
    expect(dip(20)).toBeLessThan(dip(40));
  });
  it("the sensor in warmed air reads about five points low (1.5 K, 20 C, 55 %)", () => {
    expect(selfHeatingShift(20, 1.5, 55)).toBeCloseTo(4.854, 3);
    expect(selfHeatingShift(20, 0, 55)).toBe(0);
    expect(selfHeatingShift(20, 3, 55)).toBeGreaterThan(selfHeatingShift(20, 1.5, 55));
  });
  it("the humidistat switches more and more as its sensor sees more of the unit's own heating", () => {
    const sw = [0, 0.8, 1.5, 2.5].map((s) => humidistatTrace({ loPct: 50, hiPct: 55, selfHeatK: s, hours: 8 }).switches);
    expect(sw).toEqual([8, 14, 32, 73]);
  });
});

describe("the probability machinery is held to exact cases", () => {
  it("lgamma and the incomplete gamma match closed forms", () => {
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(lgamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 12);
    expect(gammaP(1, 2)).toBeCloseTo(1 - Math.exp(-2), 14);
  });
  it("two degrees of freedom is an exponential law", () => {
    for (const x of [0.3, 2, 7.5]) expect(chi2Cdf(x, 2)).toBeCloseTo(1 - Math.exp(-x / 2), 12);
    expect(chi2Quantile(0.95, 2)).toBeCloseTo(-2 * Math.log(0.05), 10);
  });
  it("one degree of freedom is the square of a normal: 1.95996 squared", () => {
    expect(normalTwoSided(0.95)).toBeCloseTo(1.959964, 5);
    expect(chi2Quantile(0.95, 1)).toBeCloseTo(1.959964 ** 2, 4);
  });
  it("gives the three normal probabilities Seborg prints (Eq. 21-6, p. 398)", () => {
    expect(normalWithin(1)).toBeCloseTo(0.6827, 4);
    expect(normalWithin(2)).toBeCloseTo(0.9545, 4);
    expect(normalWithin(3)).toBeCloseTo(0.9973, 4);
  });
  it("gives Montgomery's average run length of 370 for three-sigma limits (Eq. 5.2, p. 191)", () => {
    expect(shewhartExceed(0)).toBeCloseTo(0.0027, 4);
    expect(arl(0)).toBeCloseTo(370.4, 1);
    expect(Math.round(arl(0))).toBe(370);
  });
  it("shortens the run length as the shift grows", () => {
    expect(arl(1)).toBeCloseTo(43.89, 2);
    expect(arl(2)).toBeCloseTo(6.303, 3);
    expect(arl(2)).toBeLessThan(arl(1));
    expect(arl(1)).toBeLessThan(arl(0));
  });
});

describe("reconciliation: the splitter of the derivation", () => {
  it("matches the hand calculation: r = -3, sigma_r^2 = 12, each stream moves by a_i sigma_i^2 r / sigma_r^2", () => {
    const r = reconcile(SPLITTER_A, [100, 60, 43], [2, 2, 2]);
    expect(r.r).toEqual([-3]);
    expect(r.x[0]).toBeCloseTo(101, 12);
    expect(r.x[1]).toBeCloseTo(59, 12);
    expect(r.x[2]).toBeCloseTo(42, 12);
    expect(r.chi2).toBeCloseTo(9 / 12, 12);
    expect(r.dof).toBe(1);
    expect(r.pValue).toBeCloseTo(0.3865, 4);
  });
  it("closes the balance exactly and is the least-squares optimum", () => {
    const y = [100.7, 58.2, 43.9];
    const s = [1, 3, 2];
    const r = reconcile(SPLITTER_A, y, s);
    expect(r.x[0]! - r.x[1]! - r.x[2]!).toBeCloseTo(0, 12);
    const obj = (x: number[]): number => x.reduce((acc, v, i) => acc + ((y[i]! - v) / s[i]!) ** 2, 0);
    for (const d of [[1, 1, 0], [0, 1, -1], [1, 0, 1], [0.3, 0.1, 0.2]]) {
      const x = r.x.map((v, i) => v + 0.1 * d[i]!);
      const feasible = x[0]! - x[1]! - x[2]! ;
      // project the perturbation back onto the balance by changing x[0]
      x[0] = x[0]! - feasible;
      expect(obj(x)).toBeGreaterThan(obj(r.x));
    }
  });
  it("with ONE balance, the measurement test gives every meter the same score: it cannot choose", () => {
    const r = reconcile(SPLITTER_A, [100, 60, 43], [2, 1, 3]);
    expect(r.z[0]).toBeCloseTo(r.z[1]!, 12);
    expect(r.z[1]).toBeCloseTo(r.z[2]!, 12);
    expect(r.z[0]).toBeCloseTo(3 / Math.sqrt(4 + 1 + 9), 12);
  });
  it("with a mixer added, a meter in both balances stands out, and meters that always appear together tie", () => {
    const r = reconcile(SPLITTER_MIXER_A, [100, 60, 46, 55, 15], [2, 2, 2, 2, 2]);
    expect(r.r).toEqual([-6, 6]);
    expect(r.dof).toBe(2);
    expect(r.z[2]).toBeCloseTo(2.1213, 4);                    // F3
    for (const i of [0, 1, 3, 4]) expect(r.z[i]).toBeCloseTo(1.2247, 4);
    expect(r.z[2]!).toBeGreaterThan(r.z[0]!);
    // every balance closes
    expect(r.x[0]! - r.x[1]! - r.x[2]!).toBeCloseTo(0, 12);
    expect(r.x[2]! + r.x[4]! - r.x[3]!).toBeCloseTo(0, 12);
  });
  it("an error on F1 is shared with F2 (they only meet in the splitter) and F3 scores lower: the page's try-it", () => {
    const r = reconcile(SPLITTER_MIXER_A, [109, 60, 40, 55, 15], [2, 2, 2, 2, 2]);
    expect(r.z[0]).toBeCloseTo(r.z[1]!, 12);
    expect(r.z[0]!).toBeGreaterThan(r.z[2]!);
    expect(r.z[0]!).toBeGreaterThan(r.z[3]!);                  // the downstream meters score lowest
    expect(r.z[3]).toBeCloseTo(r.z[4]!, 12);
  });
  it("accepts honest data, rejects a gross error beyond the 95 % limit", () => {
    const honest = reconcile(SPLITTER_A, [100, 60, 40], [2, 2, 2]);
    expect(honest.chi2).toBe(0);
    const bad = reconcile(SPLITTER_A, [100, 60, 49], [2, 2, 2]);
    expect(bad.chi2).toBeGreaterThan(chi2Quantile(0.95, 1));
    expect(bad.pValue).toBeLessThan(0.05);
  });
});

describe("two sensors, three sensors", () => {
  it("measures a disagreement in noise units", () => {
    expect(sensorZ(10, 10.3, 0.1, 0.1)).toBeCloseTo(0.3 / Math.sqrt(0.02), 12);
  });
  it("a vote of three names the odd one out; two name none", () => {
    expect(oddOneOut([10, 10.1, 11.4])).toBe(2);
    expect(oddOneOut([10, 12, 10.1])).toBe(1);
    expect(oddOneOut([10, 12])).toBe(-1);
  });
});

describe("the alarm toy", () => {
  it("is deterministic and pinned: a tighter limit gives false alarms, a looser one a later alarm", () => {
    const run = (limit: number): { falseAlarms: number; delay: number } =>
      alarmRun({ limit, normal: 50, noise: 1, faultAt: 200, ramp: 0.05, n: 300, seed: 4 });
    expect([run(52).falseAlarms, run(52).delay]).toEqual([7, 20]);
    expect([run(53).falseAlarms, run(53).delay]).toEqual([0, 47]);
    expect([run(55).falseAlarms, run(55).delay]).toEqual([0, 65]);
    expect(run(52).delay).toBeLessThan(run(55).delay);
  });
});

describe("the tank balance accuses a pair of meters", () => {
  const base = { hours: 24, n: 240, flow: 10, area: 20, noiseF: 0.15, noiseL: 0.002, seed: 11 };
  it("is within noise with no bias and shows the meter difference with one", () => {
    expect(Math.abs(mean(tankTrace({ ...base, biasIn: 0, biasOut: 0 }).blockR))).toBeLessThan(0.1);
    expect(mean(tankTrace({ ...base, biasIn: 0, biasOut: -1 }).blockR)).toBeCloseTo(0.985, 2);
  });
  it("a bias on the inlet or the opposite bias on the outlet give the same residual: it names the pair", () => {
    const a = mean(tankTrace({ ...base, biasIn: 1, biasOut: 0 }).blockR);
    const b = mean(tankTrace({ ...base, biasIn: 0, biasOut: -1 }).blockR);
    expect(a).toBeCloseTo(b, 1);
  });
});

describe("the heat exchanger: fouling is a drift, a thermometer is a step", () => {
  it("the epsilon-NTU outlets obey the energy balance and the LMTD recovers UA", () => {
    const o = hxOutlets(5);
    expect(HX_TOY.Ch * (HX_TOY.ThIn - o.ThOut)).toBeCloseTo(o.Q, 10);
    expect(HX_TOY.Cc * (o.TcOut - HX_TOY.TcIn)).toBeCloseTo(o.Q, 10);
    expect(o.Q / lmtd(HX_TOY.ThIn, o.ThOut, HX_TOY.TcIn, o.TcOut)).toBeCloseTo(5, 10);
  });
  const quiet = { days: 60, n: 120, noiseT: 0, seed: 1, tauDays: 22, stepDay: 30 };
  it("without noise, the estimated UA IS the true UA", () => {
    const tr = hxTrace({ ...quiet, rInf: 0.6, stepK: 0 });
    for (let i = 0; i < tr.t.length; i += 17) expect(tr.UAest[i]).toBeCloseTo(tr.UAtrue[i]!, 8);
    expect(tr.UAtrue[0]).toBeCloseTo(HX_TOY.UA0, 12);
    expect(tr.UAtrue[tr.UAtrue.length - 1]!).toBeLessThan(0.7 * HX_TOY.UA0);
  });
  it("fouling keeps the two duties in agreement", () => {
    const tr = hxTrace({ ...quiet, rInf: 0.6, stepK: 0 });
    for (const b of tr.balance) expect(Math.abs(b)).toBeLessThan(1e-9);
  });
  it("a thermometer step breaks the balance by the cold capacity rate times the step, from its day", () => {
    const tr = hxTrace({ ...quiet, rInf: 0, stepK: 3 });
    expect(tr.balance[0]).toBeCloseTo(0, 9);
    expect(tr.balance[119]).toBeCloseTo(-HX_TOY.Cc * 3, 9);
  });
});

describe("the pump: a worn pump is below its curve, a closed valve is on it", () => {
  it("the healthy operating point is the intersection of the two curves", () => {
    const p = pumpPoint(0, 1);
    expect(p.Q).toBeCloseTo(Math.sqrt((PUMP_TOY.H0 - PUMP_TOY.Hst) / (PUMP_TOY.kp + PUMP_TOY.ks)), 12);
    expect(p.H).toBeCloseTo(catalogueHead(p.Q), 10);
  });
  it("the residual is zero for any valve and minus the lost shut-off head for wear", () => {
    expect(pumpResidual(0, 1)).toBeCloseTo(0, 10);
    expect(pumpResidual(0, 2.5)).toBeCloseTo(0, 10);
    expect(pumpResidual(0.1, 1)).toBeCloseTo(-PUMP_TOY.H0 * 0.1, 10);
    expect(pumpResidual(0.1, 2)).toBeCloseTo(-PUMP_TOY.H0 * 0.1, 10);
  });
  it("a healthy pump with a closed-down valve gives the worn pump's flow: flow alone cannot tell them apart", () => {
    const v = valveForSameFlow(0.1);
    expect(v).toBeGreaterThan(1);
    expect(pumpPoint(0, v).Q).toBeCloseTo(pumpPoint(0.1, 1).Q, 10);
    expect(pumpResidual(0, v)).toBeCloseTo(0, 10);
  });
});

describe("time signatures", () => {
  it("fits a line exactly", () => {
    const f = linearFit([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(f.a).toBeCloseTo(1, 12);
    expect(f.b).toBeCloseTo(2, 12);
  });
  it("names the shape of a seeded signal and pins its three numbers", () => {
    const d = classifySignature(makeSignal("drift", { n: 200, dt: 1, seed: 2, noise: 1, size: 6 }), 1);
    expect(d.kind).toBe("drift");
    expect(d.r2Line).toBeCloseTo(0.698, 3);
    expect(d.r2Step).toBeCloseTo(0.576, 3);
    const o = classifySignature(makeSignal("oscillation", { n: 200, dt: 1, seed: 2, noise: 1, amp: 3, period: 20 }), 1);
    expect(o.kind).toBe("oscillation");
    expect(o.period).toBe(20);
    expect(o.peak).toBeCloseTo(0.699, 3);
  });
  it("tells the four shapes apart on 400 seeded signals", () => {
    let right = 0;
    let total = 0;
    for (const kind of ["noise", "step", "drift", "oscillation"] as Signature[]) {
      for (let s = 1; s <= 100; s++) {
        total += 1;
        const y = makeSignal(kind, { n: 200, dt: 1, seed: s, noise: 1, size: kind === "drift" ? 6 : 5, amp: 2.5, period: 20 });
        if (classifySignature(y, 1).kind === kind) right += 1;
      }
    }
    expect(right).toBe(total);
  });
  it("loses a signal buried in noise: no classifier sees what is not there", () => {
    const y = makeSignal("step", { n: 200, dt: 1, seed: 3, noise: 1, size: 0.1 });
    expect(classifySignature(y, 1).kind).not.toBe("oscillation");
    expect(classifySignature(y, 1).r2Step).toBeLessThan(0.35);
  });
});

describe("the challenges", () => {
  it("are a pure function of their seed", () => {
    expect(JSON.stringify(makeChallenge(37))).toBe(JSON.stringify(makeChallenge(37)));
    expect(JSON.stringify(makeChallenge(37))).not.toBe(JSON.stringify(makeChallenge(38)));
  });
  it("hide the pinned fault of each seed", () => {
    const first16 = Array.from({ length: 16 }, (_, i) => kindOfSeed(i + 1));
    expect(first16).toEqual([
      "sensorStep", "fouling", "slowPump", "narrowBand", "fouling", "bias", "drift", "slowPump",
      "drift", "drift", "fouling", "slowPump", "fouling", "none", "stuckValve", "sensorStep",
    ]);
  });
  it("the numbered challenges cover every fault once, easy to hard, healthy last", () => {
    expect(CHALLENGE_SEEDS.map((s) => makeChallenge(s).kind)).toEqual(
      ["bias", "drift", "fouling", "sensorStep", "stuckValve", "slowPump", "narrowBand", "none"]);
    expect(FAULT_KINDS.length).toBe(8);
  });
  it("offer the truth among the options and four distinct statements of evidence that include its own", () => {
    for (let s = 1; s <= 120; s++) {
      const c = makeChallenge(s);
      expect(c.options, `seed ${s}`).toContain(c.kind);
      expect([...KINDS_OF_PLANT[c.plant]], `seed ${s}`).toEqual(c.options);
      expect(c.evidence.length).toBe(4);
      expect(new Set(c.evidence).size).toBe(4);
      expect(c.evidence).toContain(c.kind);
    }
  });
  it("are solvable from the data they print: the diagnoser names the truth on 3000 seeds", () => {
    const seen: Record<string, number> = {};
    for (let s = 1; s <= 3000; s++) {
      const c = makeChallenge(s);
      seen[c.kind] = (seen[c.kind] ?? 0) + 1;
      expect(diagnose(c).kind, `seed ${s} (${c.kind}): ${diagnose(c).why}`).toBe(c.kind);
    }
    for (const k of FAULT_KINDS) expect(seen[k] ?? 0, k).toBeGreaterThan(200);
  });
  it("one case in about eight is healthy", () => {
    let none = 0;
    for (let s = 1; s <= 3000; s++) if (kindOfSeed(s) === "none") none += 1;
    expect(none / 3000).toBeGreaterThan(0.1);
    expect(none / 3000).toBeLessThan(0.15);
  });
  it("pin the numbers a student reads: the slow pump's implied rate and the narrow band's switchings", () => {
    const pump = makeChallenge(3);
    expect(pump.kind).toBe("slowPump");
    expect(pump.metrics.map((m) => +m.value.toFixed(3))).toEqual([4.166, -1.155, 5.322, 9]);
    const band = makeChallenge(4);
    expect(band.kind).toBe("narrowBand");
    expect(band.metrics[0]!.value).toBe(87);
  });
  it("grade an answer on the fault and on the evidence separately", () => {
    const c = makeChallenge(CHALLENGE_SEEDS[0]!);
    expect(grade(c, c.kind, c.kind)).toEqual({ kindOk: true, evidenceOk: true, truth: c.kind });
    const other = c.options.find((k) => k !== c.kind)!;
    expect(grade(c, c.kind, other).evidenceOk).toBe(false);
    expect(grade(c, other, c.kind).kindOk).toBe(false);
    expect(grade(c, null, null).kindOk).toBe(false);
  });
  it("every fault has a label and a piece of evidence", () => {
    for (const k of FAULT_KINDS as readonly FaultKind[]) {
      expect(FAULT_LABEL[k].length).toBeGreaterThan(10);
      expect(EVIDENCE[k].length).toBeGreaterThan(40);
    }
  });
});

describe("the page", () => {
  it("has an original diagram for every step of the lesson, and no diagram without a step", () => {
    const steps = FAULT_DIAGNOSIS_STEPS.map((s) => s.n);
    expect([...DIAGRAM_STEPS].sort((a, b) => a - b)).toEqual(steps);
    for (const n of steps) expect(html, `step ${n}`).toContain(`data-step-diagram="${n}"`);
    expect((html.match(/data-step-diagram=/g) ?? []).length).toBe(steps.length);
  });
  it("draws every diagram from primitives alone: no image, no foreign object, no external href", () => {
    const src = read("../src/ui/methods/FaultDiagrams.tsx");
    expect(src).not.toMatch(/<image\b|<img\b|foreignObject|xlink:href|href=/);
  });
  it("puts a live figure on each method", () => {
    for (const f of ["room", "separate", "humidistat", "humidity", "alarm", "tank", "exchanger", "pump", "sensors", "reconcile", "signature", "chart"])
      expect(html, f).toContain(`data-figure="${f}"`);
  });
  it("prints the numbers the tests above pin, in its default state", () => {
    expect(html).toContain("0.64 K");                          // the first dip
    expect(html).toContain("1.35 h");                          // the recovery
    expect(html).toContain("10.70");                            // absolute humidity of sensor A
    expect(html).toContain("10.27");                            // and of sensor B
    expect(html).toMatch(/<b>8<\/b> times in 8 h/);              // the humidistat with no self-heating
  });
  it("ends in challenges that do not show the answer before it is asked for", () => {
    expect(html).toContain("data-challenges");
    expect(html).toContain('data-challenge="6"');
    expect(html).not.toContain("data-challenge-result");
    expect(html).not.toContain("data-challenge-derived");
    expect((html.match(/data-challenge-picker/g) ?? []).length).toBe(1);
  });
  it("says first that every plant is a toy and that no engine runs", () => {
    expect(html).toContain("Every plant here is a toy");
    expect(html).toContain("Nothing on this page runs the engine");
  });
  it("runs no engine: none of its modules imports a run hook, the adapter or the solver", () => {
    for (const f of ["faultDiagnosisMath", "faultSignals", "faultChallenge", "FaultFigures", "FaultDiagnosisTool", "FaultCharts", "FaultDiagrams"]) {
      const src = read(`../src/ui/methods/${f}.${f.startsWith("Fault") ? "tsx" : "ts"}`).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(src, f).not.toMatch(/methodRun|WasmAdapter|SolverAdapter|useCaseFilesRun/);
    }
  });
});

describe("the lesson", () => {
  it("numbers its steps 1..13, each with a title and a body", () => {
    expect(FAULT_DIAGNOSIS_STEPS.map((s) => s.n)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    for (const s of FAULT_DIAGNOSIS_STEPS) { expect(s.title.length).toBeGreaterThan(10); expect(s.body.length).toBeGreaterThan(200); }
  });
  it("glosses the symbols of every formula", () => {
    for (const s of FAULT_DIAGNOSIS_STEPS) if (s.formula) expect(s.where && s.where.length, `step ${s.n}`).toBeGreaterThan(0);
  });
  it("derives the reconciliation on the splitter, in five moves", () => {
    const s = FAULT_DIAGNOSIS_STEPS.find((x) => x.n === 11)!;
    expect(s.derivation!.length).toBe(5);
  });
  it("names its two textbooks at their pages, and the diagnosis literature by title only", () => {
    const text = FAULT_DIAGNOSIS_STEPS.map((s) => `${s.body} ${s.note ?? ""}`).join(" ");
    for (const page of ["p. 163", "pp. 397", "p. 398", "pp. 407 to 408", "p. 191", "pp. 400 to 401"]) expect(text, page).toContain(page);
    const reading = FAULT_DIAGNOSIS_LIMITS.find((l) => l.id === "reading")!.body;
    for (const title of ["Venkatasubramanian", "Chiang, Russell and Braatz", "Isermann", "Tennessee Eastman"]) expect(reading).toContain(title);
    expect(reading).toContain("not read for this page");
  });
  it("is registered, live, drawing exactly the origins it declares", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "fault-diagnosis")!;
    expect(t.status).toBe("live");
    expect([...t.origins]).toEqual(["page", "reference", "assumption"]);
    expect(FAULT_DIAGNOSIS_QUIZ.length).toBeGreaterThanOrEqual(4);
  });
});
