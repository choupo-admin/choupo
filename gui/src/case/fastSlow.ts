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
  fastSlow -- the case studies of the `fast-and-slow` EduTool ("When the
  fast obeys the slow").  Each case study is a PAIR of shipped tutorial
  cases: a FULL model, every variable integrated, and its REDUCED twin, the
  fast part replaced by its quasi-steady or partial-equilibrium relation.
  Both are engine runs; the page changes one declared number (the ratio of
  the two time scales) in the full case and draws both answers.

  WHAT THIS MODULE DOES, and nothing more:
    * which witnesses, which binary, which dict numbers a slider stop
      rewrites (the knob -> override map, the methodRun posture);
    * reading the curve the page compares out of the engine's trajectory --
      a mole fraction or a fraction of the charge, i.e. the engine's mole
      numbers divided by their total (a unit conversion);
    * the DIFFERENCE of the two engine curves, the one comparison the page
      makes;
    * the integrator's accepted steps, COUNTED from the step history the
      engine prints (verbosity 3) -- a count of lines, never an estimate;
    * the closed forms the page overlays as CHECKS, labelled as such: the
      linear two-time-scale gap eps^(1/(1-eps)) and the explicit RK4
      stability bound.  No balance and no rate is integrated here.
\*---------------------------------------------------------------------------*/

import type { TrajectoryData } from "../adapters/SolverAdapter.js";
import type { DictOverride, MethodBinary } from "./methodRun.js";

export type CaseStudyId = "tanks" | "equilibrium" | "intermediate";

/** One sampled curve: the engine's grid and the compared quantity on it. */
export interface Curve { t: number[]; y: number[] }

export interface CaseStudy {
  id: CaseStudyId;
  /** Bundled witness names (tutorialByName keys: the path under tutorials/). */
  full: string;
  reduced: string;
  binary: MethodBinary;
  /** The slider stops, the ratio of time scales the student walks. */
  stops: readonly number[];
  defaultStop: number;
  /** What the slider value IS, in words, and its symbol (LaTeX). */
  ratioLabel: string;
  ratioTex: string;
  /** eps for a slider value: the small number the reduction's error follows. */
  epsOf: (v: number) => number;
  /** The dict numbers the full case declares at a slider value. */
  fullOverrides: (v: number) => DictOverride[];
  /** The compared quantity, read from a full or a reduced trajectory. */
  curveOf: (traj: TrajectoryData, which: "full" | "reduced") => Curve | null;
  quantity: string;
  /** Counting what each model carries: the amounts it follows in time
   *  (the tracer held in each tank; the species of each reactor, the pool
   *  counted once) and the constants its equations read (time constants;
   *  rate and equilibrium constants). */
  count: { fullStates: number; reducedStates: number; fullParams: number; reducedParams: number };
}

const ROOT_A = "unsteady/unsteady07_fast_tank_full";
const ROOT_A_RED = "unsteady/unsteady08_fast_tank_reduced";

/** The big tank's holdup and the feed flow the tank case declares. */
export const TANKS = { nSlow: 1.0, feed: 1.0e-3, vPerKmol: 0.08 } as const;
/** The slow rate constant and the equilibrium constant the reactor cases
 *  declare (batch30/31: k, K; batch32/33: k1). */
export const KINETICS = { k: 1.0e-3, K: 4.0, k1: 1.0e-3 } as const;

/** Column -> series, or null when the trajectory does not carry it. */
function col(traj: TrajectoryData, name: string): number[] | null {
  const v = traj.vars[name];
  return v && v.length === traj.t.length ? v : null;
}

/** A fraction: the engine's mole number over the total of the listed ones
 *  at the same instant.  Arithmetic on the engine's own state, stated. */
function fraction(traj: TrajectoryData, num: string, all: readonly string[]): Curve | null {
  const n = col(traj, num);
  const cols = all.map((c) => col(traj, c));
  if (!n || cols.some((c) => c === null)) return null;
  const y = n.map((v, i) => {
    const tot = cols.reduce((s, c) => s + c![i]!, 0);
    return tot > 0 ? v / tot : NaN;
  });
  return { t: [...traj.t], y };
}

/** The fraction of the INITIAL charge: the engine's mole number over the
 *  total the vessel held at t = 0. */
function ofCharge(traj: TrajectoryData, num: string, all: readonly string[]): Curve | null {
  const n = col(traj, num);
  const cols = all.map((c) => col(traj, c));
  if (!n || cols.some((c) => c === null) || n.length === 0) return null;
  const n0 = cols.reduce((s, c) => s + c![0]!, 0);
  if (!(n0 > 0)) return null;
  return { t: [...traj.t], y: n.map((v) => v / n0) };
}

const REACTOR = ["reactor.n_compA", "reactor.n_compB", "reactor.n_compC"] as const;

export const CASE_STUDIES: Readonly<Record<CaseStudyId, CaseStudy>> = {
  tanks: {
    id: "tanks",
    full: ROOT_A,
    reduced: ROOT_A_RED,
    binary: "choupoSemiContinuous",
    stops: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2],
    defaultStop: 0.05,
    ratioLabel: "the small tank's time constant over the big one's",
    ratioTex: String.raw`\varepsilon = \tau_f/\tau_s`,
    epsOf: (v) => v,
    //  tau_f = n_f / F, so the holdup carries the ratio; the volume follows
    //  the holdup at the liquid molar volume the case declares beside it.
    fullOverrides: (v) => [
      { file: "0/internalStates/FAST", key: "compA", value: v * TANKS.nSlow },
      { file: "0/internalStates/FAST", key: "V", value: Number((v * TANKS.vPerKmol).toPrecision(12)) },
    ],
    curveOf: (traj, which) => (which === "full"
      ? fraction(traj, "FAST.n_compB", ["FAST.n_compA", "FAST.n_compB"])
      : fraction(traj, "SLOW.n_compB", ["SLOW.n_compA", "SLOW.n_compB"])),
    quantity: "tracer fraction leaving the plant",
    count: { fullStates: 2, reducedStates: 1, fullParams: 2, reducedParams: 1 },
  },
  equilibrium: {
    id: "equilibrium",
    full: "batch/reactor/batch30_fast_equilibrium_full",
    reduced: "batch/reactor/batch31_fast_equilibrium_reduced",
    binary: "choupoBatch",
    stops: [1, 2, 5, 10, 30, 100, 300, 1000, 3000, 10000],
    defaultStop: 100,
    ratioLabel: "the fast forward rate constant over the slow one",
    ratioTex: String.raw`k_f/k`,
    epsOf: (v) => 1 / v,
    //  kf = ratio k, kr = kf/K: the equilibrium constant is held, only the
    //  speed of the fast pair moves.
    fullOverrides: (v) => [
      { file: "constant/reactions", key: "A", occurrence: 1, unit: "",
        value: Number((v * KINETICS.k).toPrecision(12)) },
      { file: "constant/reactions", key: "A", occurrence: 2, unit: "",
        value: Number(((v * KINETICS.k) / KINETICS.K).toPrecision(12)) },
    ],
    curveOf: (traj) => ofCharge(traj, "reactor.n_compC", REACTOR),
    quantity: "fraction of the charge turned into C",
    count: { fullStates: 3, reducedStates: 2, fullParams: 3, reducedParams: 2 },
  },
  intermediate: {
    id: "intermediate",
    full: "batch/reactor/batch32_fast_intermediate_full",
    reduced: "batch/reactor/batch33_fast_intermediate_reduced",
    binary: "choupoBatch",
    stops: [1, 2, 5, 10, 30, 100, 300, 1000, 3000, 10000],
    defaultStop: 100,
    ratioLabel: "the rate constant that uses the intermediate up over the one that makes it",
    ratioTex: String.raw`k_2/k_1`,
    epsOf: (v) => 1 / v,
    fullOverrides: (v) => [
      { file: "constant/reactions", key: "A", occurrence: 2, unit: "",
        value: Number((v * KINETICS.k1).toPrecision(12)) },
    ],
    curveOf: (traj) => ofCharge(traj, "reactor.n_compC", REACTOR),
    quantity: "fraction of the charge turned into P",
    count: { fullStates: 3, reducedStates: 2, fullParams: 2, reducedParams: 1 },
  },
};

export const CASE_ORDER: readonly CaseStudyId[] = ["tanks", "equilibrium", "intermediate"];

/** The gap between the full and the reduced answer: the difference of two
 *  engine curves on their common grid.  Null (never a guess) when the two
 *  grids differ, which would mean the two runs did not write the same
 *  instants. */
export interface Gap { t: number[]; d: number[]; max: number; tAtMax: number }
export function gapOf(full: Curve, reduced: Curve): Gap | null {
  if (full.t.length !== reduced.t.length || full.t.length === 0) return null;
  for (let i = 0; i < full.t.length; i++)
    if (Math.abs(full.t[i]! - reduced.t[i]!) > 1e-6 * Math.max(1, Math.abs(full.t[i]!))) return null;
  const d = full.y.map((y, i) => y - reduced.y[i]!);
  let max = 0, tAtMax = 0;
  d.forEach((v, i) => { if (Math.abs(v) > max) { max = Math.abs(v); tAtMax = full.t[i]!; } });
  return { t: [...full.t], d, max, tAtMax };
}

/** The adaptive integrator's ACCEPTED steps, counted from the history the
 *  engine prints at verbosity 3: one line per step, two numbers (the time
 *  reached and the step taken) after the `[adaptive ... step history]`
 *  header.  Null when the log carries no such history (a fixed-step run
 *  prints none, and then nothing is counted). */
export function acceptedSteps(log: string): number | null {
  const lines = log.split("\n");
  const head = lines.findIndex((l) => /\[adaptive (plant )?step history\]/.test(l));
  if (head < 0) return null;
  const row = /^\s+[-+0-9.]+e[-+]\d+\s+[-+0-9.]+e[-+]\d+\s*$/;
  let n = 0;
  for (let i = head + 1; i < lines.length; i++) if (row.test(lines[i]!)) n++;
  return n;
}

/** A declared scalar of a dict, read from its text (`key value;`). */
export function declared(text: string, key: string): number | null {
  const m = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)[ \\t]*;`, "m").exec(text);
  return m ? Number(m[1]) : null;
}

// ---- closed forms, drawn and quoted as CHECKS --------------------------------

/** The largest gap between a first-order fast system and its quasi-steady
 *  reduction, both driven by the same first-order slow one: the maximum
 *  over t of eps (e^(-t) - e^(-t/eps)) / (1 - eps), which is
 *  eps^(1/(1-eps)) (and 1/e at eps = 1).  It is the closed form for the
 *  two tanks and for the reactive intermediate alike. */
export function linearGapMax(eps: number): number {
  if (!(eps > 0)) return NaN;
  if (Math.abs(eps - 1) < 1e-9) return Math.exp(-1);
  return Math.pow(eps, 1 / (1 - eps));
}

/** The fixed explicit RK4 step is stable on a decaying mode of rate lambda
 *  only while lambda dt stays below about 2.785 (the real-axis end of its
 *  stability region): the fewest steps such a step needs over [0, tEnd]. */
export const RK4_REAL_AXIS = 2.785;
export function explicitStepsAtLeast(lambdaFast: number, tEnd: number): number {
  return Math.ceil((lambdaFast * tEnd) / RK4_REAL_AXIS);
}

/** The fastest decay rate of each full model (1/s), from its declared
 *  constants: the small tank's 1/tau_f; the larger eigenvalue of the
 *  A <-> B, B -> C system; k2 for the intermediate. */
export function fastestRate(id: CaseStudyId, v: number): number {
  if (id === "tanks") return TANKS.feed / (v * TANKS.nSlow);
  if (id === "intermediate") return v * KINETICS.k1;
  const kf = v * KINETICS.k, kr = kf / KINETICS.K, k = KINETICS.k;
  const s = kf + kr + k;
  return (s + Math.sqrt(s * s - 4 * kf * k)) / 2;
}

/** The validity window at a tolerance: the slider stops whose measured gap
 *  stays at or under it.  `gaps[i]` belongs to `stops[i]`; a stop not yet
 *  measured is null and is never counted as inside. */
export function windowAt(stops: readonly number[], gaps: readonly (number | null)[],
  tol: number, epsOf: (v: number) => number): { inside: number[]; edge: number | null } {
  const inside = stops.filter((_, i) => gaps[i] !== null && gaps[i]! <= tol);
  //  The edge is the stop inside the window with the LARGEST eps: the
  //  slowest the fast part may be made while the reduction still holds.
  let edge: number | null = null;
  for (const v of inside) if (edge === null || epsOf(v) > epsOf(edge)) edge = v;
  return { inside, edge };
}
