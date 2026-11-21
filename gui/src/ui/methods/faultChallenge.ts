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
  faultChallenge -- the generated CHALLENGES of the `fault-diagnosis`
  EduTool (DEV.md 4c C464): a small plant with a hidden, randomised fault
  (or none), the measurements a student would be given, a few tools that
  compute residuals and signatures from them, and the grading of an answer.

  SEEDED.  `makeChallenge(seed)` is a pure function of its seed, so a test can
  pin a challenge and a student can quote one ("seed 17").  The fault is drawn
  from the seed, never from the plant: any plant may be healthy, so the page
  also teaches not to cry wolf.

  SOLVABLE FROM WHAT IS SHOWN.  `diagnose(challenge)` is a rule-based
  diagnoser that reads only the measurements and the metrics the page shows
  the student; tests/faultDiagnosis.test.ts holds it to the truth on two
  hundred seeds per fault, so a challenge cannot be one the data does not
  decide.  Every plant here is a TOY (assumed numbers, generated noise): the
  page says so.
\*---------------------------------------------------------------------------*/

import {
  gaussian, hxTrace, linearFit, mean, mulberry32, stdev, tankTrace,
} from "./faultDiagnosisMath.js";

export type FaultKind =
  | "none" | "bias" | "drift" | "fouling" | "sensorStep" | "stuckValve" | "slowPump" | "narrowBand";
export type PlantId = "tank" | "exchanger" | "loop" | "drain" | "thermostat";

export const FAULT_KINDS: readonly FaultKind[] = [
  "none", "bias", "drift", "fouling", "sensorStep", "stuckValve", "slowPump", "narrowBand",
];

export const FAULT_LABEL: Readonly<Record<FaultKind, string>> = {
  none: "no fault (normal variability)",
  bias: "a flowmeter reads a constant amount too high or too low (bias)",
  drift: "a flowmeter's error grows with time (drift)",
  fouling: "the exchanger is fouling",
  sensorStep: "a thermometer has shifted (a step)",
  stuckValve: "the control valve is stuck",
  slowPump: "the pump is slower than its nameplate",
  narrowBand: "the controller's on/off band is too narrow",
};

/** The faults each plant can carry (and "none"): the options the student sees. */
export const KINDS_OF_PLANT: Readonly<Record<PlantId, readonly FaultKind[]>> = {
  tank: ["none", "bias", "drift"],
  exchanger: ["none", "fouling", "sensorStep"],
  loop: ["none", "stuckValve"],
  drain: ["none", "slowPump"],
  thermostat: ["none", "narrowBand"],
};

const PLANT_OF_FAULT: Readonly<Record<Exclude<FaultKind, "none">, PlantId>> = {
  bias: "tank", drift: "tank", fouling: "exchanger", sensorStep: "exchanger",
  stuckValve: "loop", slowPump: "drain", narrowBand: "thermostat",
};

/** The observation that PROVES each fault: what the student must name. */
export const EVIDENCE: Readonly<Record<FaultKind, string>> = {
  none: "Every check stays inside its noise: the residual averages to zero and shows no trend, no step and no period.",
  bias: "The balance residual sits at a constant offset from the first block and does not grow: a fixed error in one meter.",
  drift: "The balance residual grows steadily with time: a meter whose error accumulates.",
  fouling: "The estimated U falls slowly while the hot-side and cold-side duties still agree: the exchanger changed, not a thermometer.",
  sensorStep: "At one moment the two duties stop agreeing and the estimated U jumps: one thermometer shifted.",
  stuckValve: "The valve position stays flat while the controller output keeps moving: the valve is not obeying.",
  slowPump: "The pump empties the tank at less than its nameplate rate while the filling rate is unchanged.",
  narrowBand: "The controller's own sensor makes the heater switch many times an hour while an independent sensor barely moves: the band is narrower than what the sensor sees of the heater itself.",
};

export interface ChallengeSeries {
  id: string; label: string; unit: string; t: number[]; y: number[];
}
export interface ChallengeMetric { id: string; label: string; value: number; unit: string }

export interface Challenge {
  seed: number;
  plant: PlantId;
  /** the hidden truth: the page never draws it until the answer is checked */
  kind: FaultKind;
  title: string;
  story: string;
  tUnit: string;
  series: ChallengeSeries[];
  /** what the page's tools compute from the series, shown on request */
  derived: ChallengeSeries[];
  metrics: ChallengeMetric[];
  /** the kinds the student may choose between */
  options: FaultKind[];
  /** the four statements the student chooses the evidence from, shuffled */
  evidence: FaultKind[];
}

const sgn = (rng: () => number): number => (rng() < 0.5 ? -1 : 1);
const pick = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();

/** The kind a seed draws: one in eight is healthy. */
export function kindOfSeed(seed: number): FaultKind {
  const rng = mulberry32(Math.imul(seed + 1, 2654435761) >>> 0);
  const u = rng();
  if (u < 0.125) return "none";
  const faults = FAULT_KINDS.slice(1);
  return faults[Math.min(faults.length - 1, Math.floor(rng() * faults.length))]!;
}

function plantOfSeed(seed: number, kind: FaultKind): PlantId {
  if (kind !== "none") return PLANT_OF_FAULT[kind];
  const plants = Object.keys(KINDS_OF_PLANT) as PlantId[];
  const rng = mulberry32(Math.imul(seed + 7, 40503) >>> 0);
  return plants[Math.floor(rng() * plants.length)]!;
}

function evidenceFor(plant: PlantId, kind: FaultKind, rng: () => number): FaultKind[] {
  const same = KINDS_OF_PLANT[plant].filter((k) => k !== kind);
  const rest = FAULT_KINDS.filter((k) => k !== kind && !same.includes(k));
  const order = (a: FaultKind[]): FaultKind[] =>
    a.map((k) => [rng(), k] as const).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
  const four = [kind, ...order(same), ...order(rest)].slice(0, 4);
  return order(four);
}

// ---- the five plants ---------------------------------------------------------

function tankChallenge(seed: number, kind: FaultKind, rng: () => number): Omit<Challenge, "evidence" | "options" | "seed" | "plant" | "kind"> {
  const flow = pick(rng, 8, 14);
  const area = 20;
  const side = rng() < 0.5 ? "in" : "out";
  const size = sgn(rng) * pick(rng, 0.5, 1.1);
  const final = sgn(rng) * pick(rng, 1.0, 1.8);
  const tr = tankTrace({
    hours: 24, n: 240, flow, area, noiseF: 0.15, noiseL: 0.002, seed: seed * 31 + 5,
    biasIn: kind === "bias" && side === "in" ? size : 0,
    biasOut: kind === "bias" && side === "out" ? size : 0,
    driftIn: kind === "drift" && side === "in" ? final : 0,
    driftOut: kind === "drift" && side === "out" ? final : 0,
  });
  const s = (id: string, label: string, unit: string, y: number[]): ChallengeSeries => ({ id, label, unit, t: tr.t, y });
  return {
    title: "A tank held at constant level",
    story: "A buffer tank of 20 m2 cross-section is kept at a steady level by its level controller. "
      + "Two flowmeters measure what goes in and what comes out, and a level transmitter measures the level. "
      + "The meters are 24 h of data; the level looks flat.",
    tUnit: "h",
    series: [
      s("Fin", "inlet flowmeter", "m3/h", tr.Fin),
      s("Fout", "outlet flowmeter", "m3/h", tr.Fout),
      s("level", "level transmitter", "m", tr.level),
    ],
    derived: [{ id: "balance", label: "balance residual per 2.4 h block: Fin - Fout - A dL/dt", unit: "m3/h", t: tr.blockT, y: tr.blockR }],
    metrics: [],
  };
}

function exchangerChallenge(seed: number, kind: FaultKind, rng: () => number): Omit<Challenge, "evidence" | "options" | "seed" | "plant" | "kind"> {
  const tr = hxTrace({
    days: 60, n: 120, noiseT: 0.15, seed: seed * 17 + 3,
    rInf: kind === "fouling" ? pick(rng, 0.5, 0.9) : 0,
    tauDays: pick(rng, 15, 30),
    stepK: kind === "sensorStep" ? sgn(rng) * pick(rng, 2.5, 4) : 0,
    stepDay: pick(rng, 20, 40),
  });
  const s = (id: string, label: string, unit: string, y: number[]): ChallengeSeries => ({ id, label, unit, t: tr.t, y });
  return {
    title: "A counter-current heat exchanger over two months",
    story: "A hot stream is cooled by a cold one in a counter-current exchanger. Inlet temperatures and both flows are steady; "
      + "the two outlet thermometers are logged for 60 days, and the page can estimate the overall coefficient U from them "
      + "and compare the heat taken from the hot stream with the heat given to the cold one.",
    tUnit: "day",
    series: [
      s("ThOut", "hot outlet temperature", "C", tr.ThOut),
      s("TcOut", "cold outlet temperature", "C", tr.TcOut),
    ],
    derived: [
      s("UA", "estimated UA from the cold-side duty and the log-mean difference", "kW/K", tr.UAest),
      s("balance", "Q hot minus Q cold (should be zero)", "kW", tr.balance),
    ],
    metrics: [],
  };
}

function loopChallenge(seed: number, kind: FaultKind, rng: () => number): Omit<Challenge, "evidence" | "options" | "seed" | "plant" | "kind"> {
  const r = mulberry32(seed * 13 + 9);
  const n = 240;
  const dt = 0.05;
  const p1 = pick(rng, 0, 6);
  const p2 = pick(rng, 0, 6);
  const d = (t: number): number => 3 * Math.sin((2 * Math.PI * t) / 3.1 + p1) + 2 * Math.sin((2 * Math.PI * t) / 1.3 + p2);
  const ks = Math.floor(0.4 * n);
  const sp = 50;
  const t: number[] = [];
  const op: number[] = [];
  const zt: number[] = [];
  const pv: number[] = [];
  let ztHold = 0;
  let wind = 0;
  let ztLag = 60;
  for (let k = 0; k < n; k++) {
    const time = k * dt;
    t.push(time);
    const stuck = kind === "stuckValve" && k >= ks;
    const err = stuck ? d(time) - d(ks * dt) : 0;
    if (stuck) wind += 0.8 * err * dt * 2;
    const opHealthy = 60 + 1.2 * d(time);
    const o = Math.min(100, Math.max(0, opHealthy + wind));
    op.push(o + 0.2 * gaussian(r));
    ztLag += 0.6 * (o - ztLag);
    if (k === ks) ztHold = ztLag;
    zt.push((stuck ? ztHold : ztLag) + 0.2 * gaussian(r));
    pv.push(sp + 0.9 * err + 0.25 * gaussian(r));
  }
  const s = (id: string, label: string, unit: string, y: number[]): ChallengeSeries => ({ id, label, unit, t, y });
  return {
    title: "A flow control loop",
    story: "A flow controller holds a flow near 50 m3/h against a disturbance that comes and goes. The controller output goes to "
      + "a control valve fitted with a position transmitter. Twelve hours of the process variable, the controller output and the "
      + "measured valve position are logged.",
    tUnit: "h",
    series: [
      s("PV", "flow (process variable)", "m3/h", pv),
      s("OP", "controller output", "%", op),
      s("ZT", "measured valve position", "%", zt),
    ],
    derived: [s("gap", "valve position minus controller output", "%", zt.map((v, i) => v - op[i]!))],
    metrics: [],
  };
}

function drainChallenge(seed: number, kind: FaultKind, rng: () => number): Omit<Challenge, "evidence" | "options" | "seed" | "plant" | "kind"> {
  const r = mulberry32(seed * 11 + 1);
  const area = 3;
  const qin = pick(rng, 3.5, 4.5);
  const nameplate = 9;
  const qp = kind === "slowPump" ? nameplate * pick(rng, 0.55, 0.75) : nameplate * pick(rng, 0.96, 1.04);
  const n = 240;
  const dt = 0.05;
  const sub = 20;
  let L = 0.4 + pick(rng, 0, 0.6);
  let on = 0;
  const t: number[] = [];
  const lev: number[] = [];
  const run: number[] = [];
  for (let k = 0; k < n; k++) {
    t.push(k * dt);
    lev.push(L + 0.01 * gaussian(r));
    run.push(on);
    for (let j = 0; j < sub; j++) {
      if (on === 0 && L >= 1.8) on = 1;
      if (on === 1 && L <= 0.4) on = 0;
      L += ((qin - on * qp) / area) * (dt / sub);
    }
  }
  const idxOn = t.map((_, i) => i).filter((i) => run[i] === 1 && run[i - 1] === 1 && run[i + 1] === 1);
  const idxOff = t.map((_, i) => i).filter((i) => run[i] === 0 && run[i - 1] === 0 && run[i + 1] === 0);
  //  The mean of the least-squares slopes of each unbroken stretch: fitting
  //  one line through stretches that are not joined would measure the saw's
  //  height, not its slope.
  const slope = (idx: number[]): number => {
    const runs: number[][] = [];
    for (const i of idx) {
      const last = runs[runs.length - 1];
      if (last && last[last.length - 1] === i - 1) last.push(i); else runs.push([i]);
    }
    const fits = runs.filter((r) => r.length >= 4)
      .map((r) => linearFit(r.map((i) => t[i]!), r.map((i) => lev[i]!)).b);
    return mean(fits);
  };
  const fillFlow = area * slope(idxOff);
  const netOn = area * slope(idxOn);
  return {
    title: "A tank that fills steadily and is emptied by a pump",
    story: "A tank of 3 m2 cross-section fills from a steady inflow. A pump, whose nameplate rate is 9 m3/h, starts at a high level "
      + "and stops at a low one. Twelve hours of level and of the pump's run signal are logged.",
    tUnit: "h",
    series: [
      { id: "level", label: "level", unit: "m", t, y: lev },
      { id: "run", label: "pump running", unit: "0/1", t, y: run },
    ],
    derived: [],
    metrics: [
      { id: "fill", label: "filling rate (cross-section x level slope while the pump is off)", value: fillFlow, unit: "m3/h" },
      { id: "net", label: "net rate while the pump runs (cross-section x level slope)", value: netOn, unit: "m3/h" },
      { id: "pump", label: "implied pump rate (filling rate minus net rate)", value: fillFlow - netOn, unit: "m3/h" },
      { id: "nameplate", label: "nameplate pump rate", value: nameplate, unit: "m3/h" },
    ],
  };
}

function thermostatChallenge(seed: number, kind: FaultKind, rng: () => number): Omit<Challenge, "evidence" | "options" | "seed" | "plant" | "kind"> {
  const r = mulberry32(seed * 19 + 7);
  const band = kind === "narrowBand" ? pick(rng, 0.08, 0.25) : pick(rng, 1.2, 2.0);
  const sp = 21;
  const tau = 40;
  const sub = 20;
  const dtMin = 1;
  const selfK = 0.8;
  let T = sp;
  let s = 0;
  let on = 0;
  let switches = 0;
  const t: number[] = [];
  const ctrl: number[] = [];
  const ref: number[] = [];
  const duty: number[] = [];
  for (let k = 0; k < 240; k++) {
    t.push(k / 60);
    let dutySum = 0;
    for (let j = 0; j < sub; j++) {
      const Ts = T + selfK * s;
      const next = on === 0 && Ts < sp - band / 2 ? 1 : on === 1 && Ts > sp + band / 2 ? 0 : on;
      if (next !== on) switches += 1;
      on = next;
      dutySum += on;
      const tss = on === 1 ? 27 : 15;
      T += ((tss - T) / tau) * (dtMin / sub);
      s += ((on - s) / 3) * (dtMin / sub);
    }
    ctrl.push(T + selfK * s + 0.03 * gaussian(r));
    ref.push(T + 0.03 * gaussian(r));
    duty.push(dutySum / sub);
  }
  const half = Math.floor(ref.length / 2);
  const p2p = (y: number[]): number => Math.max(...y.slice(half)) - Math.min(...y.slice(half));
  return {
    title: "A room thermostat",
    story: "A room is heated by an on/off heater under a thermostat set to 21 C. The thermostat's sensor sits close to the heater; "
      + "a second, independent sensor is in the middle of the room. Four hours are logged, with the heater's duty in each minute "
      + "and the controller's own count of switchings.",
    tUnit: "h",
    series: [
      { id: "ctrl", label: "thermostat's own sensor", unit: "C", t, y: ctrl },
      { id: "ref", label: "independent room sensor", unit: "C", t, y: ref },
      { id: "duty", label: "heater on, share of the minute", unit: "0..1", t, y: duty },
    ],
    derived: [],
    metrics: [
      { id: "switches", label: "heater switchings per hour (the controller's log)", value: switches / 4, unit: "1/h" },
      { id: "refP2P", label: "independent sensor, peak to peak over the second half", value: p2p(ref), unit: "C" },
      { id: "ctrlP2P", label: "thermostat's sensor, peak to peak over the second half", value: p2p(ctrl), unit: "C" },
    ],
  };
}

export function makeChallenge(seed: number, force?: FaultKind): Challenge {
  const kind = force ?? kindOfSeed(seed);
  const plant = plantOfSeed(seed, kind);
  const rng = mulberry32(Math.imul(seed + 3, 2246822519) >>> 0);
  const body = plant === "tank" ? tankChallenge(seed, kind, rng)
    : plant === "exchanger" ? exchangerChallenge(seed, kind, rng)
    : plant === "loop" ? loopChallenge(seed, kind, rng)
    : plant === "drain" ? drainChallenge(seed, kind, rng)
    : thermostatChallenge(seed, kind, rng);
  return {
    seed, plant, kind, ...body,
    options: [...KINDS_OF_PLANT[plant]],
    evidence: evidenceFor(plant, kind, rng),
  };
}

// ---- the diagnoser and the grading --------------------------------------------

const get = (c: Challenge, id: string): ChallengeSeries =>
  [...c.series, ...c.derived].find((s) => s.id === id)!;
const metric = (c: Challenge, id: string): number => c.metrics.find((m) => m.id === id)!.value;

/** The statistics the diagnoser used, so the page can print them. */
export interface Diagnosis { kind: FaultKind; why: string }

export function diagnose(c: Challenge): Diagnosis {
  if (c.plant === "tank") {
    const d = get(c, "balance");
    const fit = linearFit(d.t, d.y);
    const tSlope = fit.b / fit.seB;
    const se = stdev(d.y) / Math.sqrt(d.y.length);
    const tMean = mean(d.y) / se;
    if (Math.abs(tSlope) > 6) return { kind: "drift", why: `the balance residual has a trend (t = ${tSlope.toFixed(1)})` };
    if (Math.abs(tMean) > 6) return { kind: "bias", why: `the balance residual has a constant offset (t = ${tMean.toFixed(1)}), no trend` };
    return { kind: "none", why: "the balance residual has neither offset nor trend" };
  }
  if (c.plant === "exchanger") {
    const b = get(c, "balance").y;
    const u = get(c, "UA");
    const third = Math.floor(b.length / 3);
    const a = b.slice(0, third);
    const z = b.slice(b.length - third);
    const tStep = Math.abs(mean(z) - mean(a)) / Math.sqrt((stdev(a) ** 2 + stdev(z) ** 2) / third);
    if (tStep > 6) return { kind: "sensorStep", why: `the duties disagree after a moment (t = ${tStep.toFixed(1)})` };
    const fit = linearFit(u.t, u.y);
    if (fit.b / fit.seB < -6) return { kind: "fouling", why: "U falls while the duties still agree" };
    return { kind: "none", why: "U is flat and the duties agree" };
  }
  if (c.plant === "loop") {
    const op = get(c, "OP").y;
    const zt = get(c, "ZT").y;
    const from = Math.floor(0.6 * op.length);
    const ratio = stdev(zt.slice(from)) / stdev(op.slice(from));
    return ratio < 0.3
      ? { kind: "stuckValve", why: `the valve moves ${(100 * ratio).toFixed(0)} % as much as its command` }
      : { kind: "none", why: "the valve follows its command" };
  }
  if (c.plant === "drain") {
    const ratio = metric(c, "pump") / metric(c, "nameplate");
    return ratio < 0.85
      ? { kind: "slowPump", why: `the pump gives ${(100 * ratio).toFixed(0)} % of its nameplate` }
      : { kind: "none", why: "the pump gives its nameplate rate" };
  }
  const sw = metric(c, "switches");
  return sw > 30
    ? { kind: "narrowBand", why: `${sw.toFixed(0)} heater switchings an hour against a quiet independent sensor` }
    : { kind: "none", why: "the heater switches a few times an hour" };
}

export interface Grade { kindOk: boolean; evidenceOk: boolean; truth: FaultKind }

export function grade(c: Challenge, kind: FaultKind | null, evidence: FaultKind | null): Grade {
  return { kindOk: kind === c.kind, evidenceOk: evidence === c.kind, truth: c.kind };
}
