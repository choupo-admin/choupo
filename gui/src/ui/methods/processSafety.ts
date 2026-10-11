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
  processSafety -- the WITNESSES, the OVERRIDES and the ARITHMETIC behind
  "Process safety: remove the hazard before you add a layer" (DEV.md 4c C60),
  kept React-free so tests/processSafety.test.ts can hold every claim the
  page makes to the tree.

  ZERO PHYSICS IN TYPESCRIPT, and what that leaves here.  Every temperature,
  every accumulation and every flow is the ENGINE's, read off a run the page
  makes in the browser -- and so is the technical limit MTT, the bubble point
  of the reactor contents at the failure instant, from a choupoProps run of
  bubble01 on the reactor case's own thermodynamics.  What this file
  computes is the methodology's own arithmetic ON those numbers -- a ratio
  (the accumulation), Stoessel's estimate of the temperature after a cooling
  failure, T_p + X_ac dT_ad M_f/M(t), put beside the engine's so the two can
  be compared (the masses are the run's own amounts times the records'
  molar masses), the five-way comparison that is the criticality class, and
  the loop's per-pass conversion from the converter's own feed and effluent.
  Two numbers are NOT the engine's, and both are labelled as such where they
  are drawn: T_D24 -- the temperature at which the adiabatic time to maximum
  rate of the secondary decomposition is 24 h -- which no record here can
  supply (it needs decomposition kinetics, measured by calorimetry), so it
  is an assumption the reader sets; and the MTT PROXY the page shows beside
  the bubble point, the lowest normal boiling point among the witness's own
  component records, which is a number of the right size and not the
  boiling point of the reaction mass.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";
import type { RunResult, StreamResult, TrajectoryData } from "../../adapters/SolverAdapter.js";

// ---- The witnesses ----------------------------------------------------------

export const SAFETY_WITNESS_BATCH = "batch/reactor/batch26_cooling_failure";
export const SAFETY_WITNESS_SEMI = "batch/reactor/batch27_semibatch_dosing";
export const SAFETY_WITNESS_NH3_150 = "plant/greenAmmoniaFeasibility";
export const SAFETY_WITNESS_NH3_50 = "plant/greenAmmoniaFeasibility50bar";
/** The props witness that computes the bubble point of a reaction mass of
 *  these four components on the reactor case's own thermodynamics (its
 *  constant/ is a copy of batch26's sealed constant/). */
export const SAFETY_WITNESS_BUBBLE = "props/thermo/bubble01_reaction_mass_boiling_point";

const FLOWSHEET = "system/flowsheetDict";

/** The reactor unit both batch witnesses name, and the species whose
 *  unconverted amount is the accumulation (the reaction is first order in
 *  it and it is the reactant the semi-batch witness doses). */
export const REACTOR = "reactor";
export const DOSED = "ethanol";
/** The four species of the reaction mass, as the records name them. */
export const SPECIES = ["aceticAcid", "ethanol", "ethylAcetate", "water"] as const;

/** The semi-batch witness's dosing schedule, as its flowsheetDict declares
 *  it.  A COPY of the dict's numbers, held to them by the test -- the page
 *  needs them to place a failure between two portions, never on one. */
export const PORTIONS = 16;
export const PORTION_SPACING_S = 900;
/** The failure lands this long AFTER a portion.  A failure exactly at a
 *  portion's instant would leave the order of the two events to the
 *  driver's sort, so the page never asks for one. */
export const FAIL_AFTER_PORTION_S = 50;
/** The portion the semi-batch knob starts after: where Stoessel's
 *  mass-corrected estimate, read on the witness's own normal-operation
 *  trajectory, has its maximum -- the semi-batch's MTSR instant -- held to
 *  that trajectory by the test.  Early-middle of the dosing, NOT the last
 *  portion: the accumulation is largest late, the mass it heats smallest
 *  early. */
export const DEFAULT_PORTION = 4;

/** The batch witness's failure-time knob range [s]: past an hour the
 *  remaining accumulation is a few per cent and the run's horizon (6000 s)
 *  would no longer see the adiabatic leg finish. */
export const BATCH_TF_MAX_S = 3600;

export function failTimeAfterPortion(n: number): number {
  return (n - 1) * PORTION_SPACING_S + FAIL_AFTER_PORTION_S;
}

// ---- The overrides: the recipe lines the page moves -------------------------
//
//  batch26 declares ONE recipe event: `time` and `value` are unique there.
//  batch27 declares the failure FIRST and the interlock SECOND, then sixteen
//  portions: `time` occurrences 1 and 2 are the two safety events, `fraction`
//  occurrence 1 is the interlock, and `value` is unique.  The test applies
//  each override set to the real witness and reads the result back.

/** `tFail` null runs normal operation: the same recipe with `value 0`, the
 *  jacket keeps working. */
export function batchOverrides(tFail: number | null): DictOverride[] {
  if (tFail === null)
    return [{ file: FLOWSHEET, key: "value", value: 0, unit: "" }];
  return [
    { file: FLOWSHEET, key: "time", value: tFail, unit: "" },
    { file: FLOWSHEET, key: "value", value: 1, unit: "" },
  ];
}

/** `afterPortion` null runs normal operation (no failure, interlock moves
 *  nothing).  Otherwise the cooling fails 50 s after that portion and the
 *  interlock either holds the rest of the feed back (`fraction 1`) or fails
 *  (`fraction 0`). */
export function semiOverrides(
  afterPortion: number | null, interlock: boolean,
): DictOverride[] {
  if (afterPortion === null)
    return [
      { file: FLOWSHEET, key: "value", value: 0, unit: "" },
      { file: FLOWSHEET, key: "fraction", value: 0, unit: "", occurrence: 1 },
    ];
  const t = failTimeAfterPortion(afterPortion);
  return [
    { file: FLOWSHEET, key: "time", value: t, unit: "", occurrence: 1 },
    { file: FLOWSHEET, key: "time", value: t, unit: "", occurrence: 2 },
    { file: FLOWSHEET, key: "value", value: 1, unit: "" },
    { file: FLOWSHEET, key: "fraction", value: interlock ? 1 : 0, unit: "",
      occurrence: 1 },
  ];
}

// ---- Reading a batch run ----------------------------------------------------

export interface Series { t: number[]; y: number[] }

function column(traj: TrajectoryData | undefined, name: string): number[] | null {
  const c = traj?.vars[name];
  return c && traj && c.length === traj.t.length ? c : null;
}

/** The reactor temperature over the run. */
export function reactorT(traj: TrajectoryData | undefined): Series | null {
  const T = column(traj, `${REACTOR}.T`);
  return T && traj ? { t: traj.t, y: T } : null;
}

/** The ACCUMULATION X_ac(t): the dosed reactant still unconverted IN THE
 *  REACTOR, as a fraction of all of it the batch will ever receive.  The
 *  denominator is the sum over EVERY vessel of the run's first row, before
 *  anything has reacted -- the batch witness has it all in the reactor, the
 *  semi-batch witness mostly in the dosing tank.  Read from the run, never
 *  typed. */
export function accumulation(traj: TrajectoryData | undefined): Series | null {
  if (!traj || traj.t.length === 0) return null;
  const inReactor = column(traj, `${REACTOR}.n_${DOSED}`);
  if (!inReactor) return null;
  let total = 0;
  for (const [k, v] of Object.entries(traj.vars))
    if (k.endsWith(`.n_${DOSED}`) && v.length > 0) total += v[0]!;
  if (!(total > 0)) return null;
  return { t: traj.t, y: inReactor.map((n) => n / total) };
}

/** The value of a series at time t (linear between rows; the end rows
 *  outside the range).  The trajectory is written every 50 s. */
export function at(s: Series, t: number): number {
  const { t: ts, y } = s;
  if (ts.length === 0) return NaN;
  if (t <= ts[0]!) return y[0]!;
  for (let i = 1; i < ts.length; i++) {
    if (t <= ts[i]!) {
      const f = (t - ts[i - 1]!) / (ts[i]! - ts[i - 1]!);
      return y[i - 1]! + f * (y[i]! - y[i - 1]!);
    }
  }
  return y[y.length - 1]!;
}

export interface FailureReading {
  /** The highest reactor temperature the run reached [K]: T_cf, the
   *  temperature after a cooling failure at that run's instant, when the
   *  adiabatic leg has finished.  (The MTSR is the largest T_cf over every
   *  instant the failure could happen; one run is one instant.) */
  Tmax: number;
  /** The temperature at the start of the run [K] (T_p). */
  T0: number;
  /** True when the temperature was still climbing at the end of the run, so
   *  Tmax is a lower bound on T_cf rather than T_cf. */
  stillRising: boolean;
}

export function readFailure(traj: TrajectoryData | undefined): FailureReading | null {
  const s = reactorT(traj);
  if (!s || s.y.length < 2) return null;
  const n = s.y.length;
  return {
    Tmax: Math.max(...s.y),
    T0: s.y[0]!,
    stillRising: s.y[n - 1]! - s.y[n - 2]! > 1e-3,
  };
}

/** The molar masses the witness's component records declare [kg/kmol],
 *  read from the raw files the page runs. */
export function recordMolarMasses(
  raw: { [rel: string]: string } | undefined,
): { [comp: string]: number } {
  const out: { [comp: string]: number } = {};
  if (!raw) return out;
  for (const [rel, body] of Object.entries(raw)) {
    const m = /^constant\/components\/([A-Za-z0-9_]+)\.dat$/.exec(rel);
    if (!m) continue;
    const mw = /^MW\s+([0-9.eE+-]+)\s*;/m.exec(body);
    if (mw) out[m[1]!] = Number(mw[1]);
  }
  return out;
}

/** The mass ratio M_f / M(t) of Stoessel's semi-batch form: the mass of
 *  everything the batch will ever be given (every vessel, the run's first
 *  row) over the mass in the REACTOR at t.  1 for a batch, whose mass does
 *  not change.  Null when a species has no molar mass or a column is
 *  missing -- never a ratio of 1 put in its place. */
export function massRatio(
  traj: TrajectoryData | undefined, mw: { [comp: string]: number },
): Series | null {
  if (!traj || traj.t.length === 0) return null;
  let Mf = 0;
  for (const [k, v] of Object.entries(traj.vars)) {
    const m = /\.n_([A-Za-z0-9_]+)$/.exec(k);
    if (!m || v.length === 0) continue;
    const w = mw[m[1]!];
    if (w === undefined) return null;
    Mf += v[0]! * w;
  }
  const cols: [number[], number][] = [];
  for (const sp of SPECIES) {
    const c = column(traj, `${REACTOR}.n_${sp}`);
    const w = mw[sp];
    if (!c || w === undefined) return null;
    cols.push([c, w]);
  }
  const y = traj.t.map((_, i) => {
    let M = 0;
    for (const [c, w] of cols) M += c[i]! * w;
    return M > 0 ? Mf / M : NaN;
  });
  return { t: traj.t, y };
}

/** Stoessel's estimate of the temperature reached if the cooling fails at
 *  t, T_cf(t) = T_p + X_ac(t) dT_ad M_f/M(t), at every row.  `ratio` null
 *  drops the mass correction (the constant-mass form, exact for a batch). */
export function tcfEstimate(
  X: Series, Tp: number, dTad: number, ratio: Series | null,
): Series {
  return { t: X.t, y: X.y.map((x, i) =>
    Tp + x * dTad * (ratio ? ratio.y[i]! : 1)) };
}

/** The largest value of a series and where it is: the MTSR of an estimate
 *  curve is its maximum over the failure instants. */
export function maxOf(s: Series): { t: number; y: number } | null {
  let best: { t: number; y: number } | null = null;
  s.y.forEach((y, i) => {
    if (Number.isFinite(y) && (best === null || y > best.y)) best = { t: s.t[i]!, y };
  });
  return best;
}

/** The reactor's mole fractions at t, from a run's trajectory: the
 *  composition whose bubble point is the MTT at that failure instant. */
export function reactorComposition(
  traj: TrajectoryData | undefined, t: number,
): { [comp: string]: number } | null {
  if (!traj) return null;
  const n: { [comp: string]: number } = {};
  let sum = 0;
  for (const sp of SPECIES) {
    const c = column(traj, `${REACTOR}.n_${sp}`);
    if (!c) return null;
    const v = Math.max(0, at({ t: traj.t, y: c }, t));
    n[sp] = v;
    sum += v;
  }
  if (!(sum > 0)) return null;
  for (const sp of SPECIES) n[sp] = n[sp]! / sum;
  return n;
}

/** The four composition lines of the bubble-point witness, rewritten.
 *  Mole fractions rounded to 1e-9 so a run key does not change on the
 *  last digit of an interpolation. */
export function bubbleOverrides(x: { [comp: string]: number }): DictOverride[] {
  return SPECIES.map((sp) => ({
    file: "system/propsDict", key: sp,
    value: Math.round((x[sp] ?? 0) * 1e9) / 1e9, unit: "" }));
}

/** The bubble point the props run computed [K], or null. */
export function readBubble(r: RunResult | null | undefined): number | null {
  const op = r?.operationResults?.find((o) => o.name === "reactionMassBubblePoint");
  const v = op?.diagnostics?.["T_bubble"];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A run-wide KPI, or null when the run did not publish it. */
export function kpi(r: RunResult | null | undefined, unit: string, key: string): number | null {
  const v = r?.kpis?.[unit]?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---- The criticality classes ------------------------------------------------
//
//  Stoessel's five classes, as tabulated by Y. Sheng et al., Molecules 30
//  (2025) 2939, Table 11, citing F. Stoessel, Thermal Safety of Chemical
//  Processes (Wiley-VCH 2008; 2nd ed. 2020).  The book itself was not read
//  for this page; the table is the secondary source's, and the page says
//  so.  The same paper (section 3.3) defines T_D24 as the temperature at
//  which the time to maximum rate under adiabatic conditions is 24 h, read
//  off TMR_ad(T) curves from adiabatic calorimetry -- not an onset.
//
//    1  T_p <= MTSR < MTT  < T_D24
//    2  T_p <= MTSR < T_D24 < MTT
//    3  T_p <= MTT <= MTSR < T_D24
//    4  T_p <= MTT < T_D24 < MTSR
//    5  T_p <  T_D24 < MTSR < MTT  or  T_p < T_D24 < MTT < MTSR

export type CriticalityClass = 1 | 2 | 3 | 4 | 5;

export interface ClassVerdict {
  cls: CriticalityClass | null;
  /** Why no class could be assigned, when none could. */
  why?: string;
}

export function criticalityClass(
  Tp: number, mtsr: number, mtt: number, td24: number,
): ClassVerdict {
  if (![Tp, mtsr, mtt, td24].every(Number.isFinite))
    return { cls: null, why: "a temperature is missing" };
  if (!(Tp < mtt) || !(Tp < td24))
    return { cls: null, why: "the scheme assumes the process runs below "
      + "both MTT and T_D24; here it does not" };
  if (mtsr >= td24) return { cls: mtt < td24 ? 4 : 5 };
  if (mtsr < mtt) return { cls: mtt < td24 ? 1 : 2 };
  return { cls: 3 };
}

/** What each ordering implies, in our words (not a quotation).  None of
 *  these is a verdict on a real process: a class is a screen that orders
 *  four temperatures, and the measures are the designer's. */
export const CLASS_MEANING: Readonly<Record<CriticalityClass, string>> = {
  1: "the synthesis runaway reaches neither the technical limit (MTT) nor "
    + "T_D24: a cooling failure alone takes the mass neither to boiling nor "
    + "into the range where the decomposition becomes fast",
  2: "the synthesis runaway stays below both limits, but T_D24 lies below "
    + "the MTT, so boiling would not come first to cap a later rise: the "
    + "situation stays acceptable provided the mass is not left at elevated "
    + "temperature for long after the failure",
  3: "the synthesis runaway reaches the MTT but not T_D24: boiling "
    + "(evaporative cooling, reflux or venting) can act as a barrier, "
    + "provided the condenser or vent it relies on is designed for that duty",
  4: "the synthesis runaway passes the MTT and would pass T_D24: boiling "
    + "can stop it only if the evaporative cooling or relief is designed for "
    + "that duty; if it does not act, the decomposition can be triggered",
  5: "T_D24 lies below the MTT and the synthesis runaway passes it: the "
    + "runaway can enter the region where secondary decomposition becomes "
    + "fast before boiling can act.  Ordinary cooling or relief alone is "
    + "not an adequate basis of safety; process modification should be "
    + "considered",
};

// ---- The technical limit from the witness's own records ---------------------

export interface RecordTb { component: string; Tb: number }

/** Every `Tb` the witness's component records declare, read from the raw
 *  files the page runs.  The LOWEST is the MTT PROXY the page shows beside
 *  the engine's bubble point: a number of the right size, never the boiling
 *  point of the reaction mass (an ideal mixture boils between its
 *  components' boiling points, and real esters, ethanol and water form
 *  azeotropes that boil lower still). */
export function recordBoilingPoints(
  raw: { [rel: string]: string } | undefined,
): RecordTb[] {
  if (!raw) return [];
  const out: RecordTb[] = [];
  for (const [rel, body] of Object.entries(raw)) {
    const m = /^constant\/components\/([A-Za-z0-9_]+)\.dat$/.exec(rel);
    if (!m) continue;
    const tb = /^Tb\s+([0-9.eE+-]+)\s*;/m.exec(body);
    if (tb) out.push({ component: m[1]!, Tb: Number(tb[1]) });
  }
  return out.sort((a, b) => a.Tb - b.Tb);
}

// ---- The ammonia loop -------------------------------------------------------

/** The streams of the C57 feasibility loop this page reads, by the names
 *  the cases give them (held to both cases by the test). */
export const LOOP = {
  converterFeed: "PreheatedFeed",
  converterOut: "HotEffluent",
  recycle: "Recycle",
  purge: "Purge",
  product: "ProductNH3",
} as const;

export interface LoopReading {
  /** Converter pressure [bar] and temperature [K], from its KPIs. */
  P_bar: number;
  T_K: number;
  /** Converter feed and recycle, total and per species [kmol/h]. */
  feed_kmol_h: number;
  feedH2_kmol_h: number;
  recycle_kmol_h: number;
  recycleH2_kmol_h: number;
  recycleNH3_kmol_h: number;
  /** NH3 made in the converter [kmol/h] and the product leaving [kmol/h]. */
  made_kmol_h: number;
  product_kmol_h: number;
  /** H2 converted per pass: 3/2 of the NH3 made over the H2 fed. */
  h2PerPass: number;
  /** Gross margin after raw materials and utilities [EUR/yr], the
   *  economics pass's own KPI. */
  grossMargin_RM_UT: number | null;
}

const PER_H = 3600;

function exact(r: RunResult, name: string): StreamResult | undefined {
  return r.streams.find((s) => s.name === name);
}

function flow(s: StreamResult, comp?: string): number {
  return (comp === undefined ? s.F : s.F * (s.composition[comp] ?? 0)) * PER_H;
}

/** Read the loop from a run, or say which stream was not there.  Names are
 *  matched EXACTLY: a leaf match would pick some other `*Feed`. */
export function readLoop(r: RunResult | null | undefined): LoopReading | string | null {
  if (!r) return null;
  const need = Object.values(LOOP);
  for (const n of need)
    if (!exact(r, n)) return `the run published no stream '${n}'`;
  const feed = exact(r, LOOP.converterFeed)!;
  const out = exact(r, LOOP.converterOut)!;
  const rec = exact(r, LOOP.recycle)!;
  const prod = exact(r, LOOP.product)!;
  const made = flow(out, "NH3") - flow(feed, "NH3");
  const feedH2 = flow(feed, "H2");
  const P = kpi(r, "Converter", "P");
  const T = kpi(r, "Converter", "T");
  return {
    P_bar: P === null ? NaN : P / 1e5,
    T_K: T ?? NaN,
    feed_kmol_h: flow(feed),
    feedH2_kmol_h: feedH2,
    recycle_kmol_h: flow(rec),
    recycleH2_kmol_h: flow(rec, "H2"),
    recycleNH3_kmol_h: flow(rec, "NH3"),
    made_kmol_h: made,
    product_kmol_h: flow(prod, "NH3"),
    h2PerPass: feedH2 > 0 ? (1.5 * made) / feedH2 : NaN,
    grossMargin_RM_UT: kpi(r, "economics", "grossMargin_RM_UT"),
  };
}
