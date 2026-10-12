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
  of the reactor contents at a failure instant, from a choupoProps run of
  bubble01 on the reactor case's own thermodynamics, and so is the
  compressibility factor of each ammonia loop's converter feed.  What this
  file computes is the methodology's own arithmetic ON those numbers -- a
  ratio (the accumulation), Stoessel's estimate of the temperature after a
  cooling failure, T_p + X_ac dT_ad M_f/M(t), put beside the engine's so the
  two can be compared (the masses are the run's own amounts times the
  records' molar masses), the five-way comparison that is the criticality
  class, the loop's per-pass conversion from the converter's own feed and
  effluent, and the ratio of two volumetric flows F Z R T / P.

  THE REACTION IS FICTITIOUS (second review, 2026-10-11): A + B -> P in an
  inert solvent S, four case-local records made coherent by construction
  (tutorials/batch/reactor/batch26_cooling_failure/constant/).  The species
  names below are those records' names.

  ONE number is not the engine's, and it is labelled as such where it is
  drawn: T_D24 -- the temperature at which the adiabatic time to maximum
  rate of the secondary decomposition is 24 h -- which no record here can
  supply (it needs decomposition kinetics, measured by calorimetry), so it
  is an assumption the reader sets.  The MTT PROXY the page offers beside
  the bubble point, the lowest normal boiling point among the components,
  is the records' own Tb, not the boiling point of the reaction mass.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";
import type { RunResult, StreamResult, TrajectoryData } from "../../adapters/SolverAdapter.js";

// ---- The witnesses ----------------------------------------------------------

export const SAFETY_WITNESS_BATCH = "batch/reactor/batch26_cooling_failure";
export const SAFETY_WITNESS_SEMI = "batch/reactor/batch27_semibatch_dosing";
/** batch27 with a day tank that holds a quarter of B, refilled batch-wise. */
export const SAFETY_WITNESS_TANK = "batch/reactor/batch28_dosing_vessel_limit";
export const SAFETY_WITNESS_NH3_150 = "plant/greenAmmonia02_feasibility150bar";
export const SAFETY_WITNESS_NH3_50 = "plant/greenAmmonia02_feasibility50bar";
/** The props witness that computes the bubble point of a reaction mass of
 *  these four components on the reactor case's own thermodynamics (its
 *  constant/ is a copy of batch26's sealed constant/). */
export const SAFETY_WITNESS_BUBBLE = "props/thermo/bubble01_reaction_mass_boiling_point";
/** The overpressure page's loop-gas witness: two propertyPoint operations
 *  carrying each loop's converter-feed composition.  This page runs it at
 *  the feed's OWN temperature and pressure (read from the loop runs) to have
 *  the engine's Z there; the overpressure page runs it at the relieving
 *  pressure.  Held to overpressure.ts's constant by the test. */
export const SAFETY_WITNESS_Z = "props/safety/relief01_ammonia_loop_gas";

const FLOWSHEET = "system/flowsheetDict";

/** The reactor unit the batch witnesses name, and the species whose
 *  unconverted amount is the accumulation (the reaction is first order in
 *  it and it is the reactant the semi-batch witnesses dose). */
export const REACTOR = "reactor";
export const DOSED = "reactantB";
/** The four species of the reaction mass, as the records name them. */
export const SPECIES = ["reactantA", "reactantB", "productP", "solventS"] as const;
/** The pressure every bubble point on the page is computed at [bar]: the
 *  reactor's (bubble01 system/propsDict, batch26 0/internalStates/reactor). */
export const BUBBLE_P_BAR = 1.013;

/** The semi-batch witnesses' dosing schedule, as their flowsheetDicts
 *  declare it.  A COPY of the dicts' numbers, held to them by the test. */
export const PORTIONS = 16;
export const PORTION_SPACING_S = 900;
/** A failure is placed this long after (or before) a portion's instant.
 *  Exactly AT the instant would leave the order of the two events to the
 *  driver's sort (std::sort, not stable), so the page never asks for that.
 *  One second of reaction at T_p converts under 0.1 % of what is there. */
export const FAIL_OFFSET_S = 1;
/** batch28's day-tank refills [s], as its flowsheetDict declares them. */
export const REFILL_TIMES = [3150, 6750, 10350] as const;
/** The portion the semi-batch knob starts after: where Stoessel's
 *  mass-corrected estimate, evaluated right after each portion on the
 *  witness's own normal-operation trajectory, is largest -- held to that
 *  trajectory by the test. */
export const DEFAULT_PORTION = 6;

/** The batch witness's failure-time knob range [s]: past an hour the
 *  remaining accumulation is a few per cent and the run's horizon (6000 s)
 *  would no longer see the adiabatic leg finish. */
export const BATCH_TF_MAX_S = 3600;
/** The batch instants the MTT(t) table is evaluated at [s]. */
export const BATCH_TABLE_T = [0, 600, 1200, 1800, 2400, 3000, 3600] as const;

export type Side = "after" | "before";

/** The failure instant just after (or just before) portion n [s].  "Before
 *  portion 1" does not exist: portion 1 lands at t = 0. */
export function failTime(n: number, side: Side): number {
  return (n - 1) * PORTION_SPACING_S + (side === "after" ? FAIL_OFFSET_S : -FAIL_OFFSET_S);
}

/** What happens to the feed when the cooling fails, as the semi-batch
 *  witnesses' feed event reads it. */
export type FeedFailure = "held" | "pumpOn" | "wholeTank";

/** The words and fraction of the feed event for each reading. */
function feedEvent(feed: FeedFailure, hold: string): { to: string; fraction: number } {
  if (feed === "held") return { to: hold, fraction: 1 };
  if (feed === "pumpOn") return { to: hold, fraction: 0 };
  return { to: REACTOR, fraction: 1 };
}

// ---- The overrides: the recipe lines the page moves -------------------------
//
//  batch26 declares ONE recipe event: `time` and `value` are unique there.
//  batch27 declares the failure FIRST and the feed event SECOND, then sixteen
//  portions: `time` occurrences 1 and 2 are the two safety events, `to` and
//  `fraction` occurrence 1 are the feed event, and `value` is unique.
//  batch28 adds a THIRD safety event (storage set aside: `fraction`
//  occurrence 2) before its refills and portions.  The test applies each
//  override set to the real witness and reads the result back.

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

/** batch27.  `tFail` null runs normal operation (no failure, the feed
 *  event moves nothing).  Otherwise the cooling fails at tFail and the feed
 *  does what `feed` says. */
export function semiOverrides(tFail: number | null, feed: FeedFailure = "held"): DictOverride[] {
  if (tFail === null)
    return [
      { file: FLOWSHEET, key: "value", value: 0, unit: "" },
      { file: FLOWSHEET, key: "fraction", value: 0, unit: "", occurrence: 1 },
    ];
  const e = feedEvent(feed, "heldFeed");
  return [
    { file: FLOWSHEET, key: "time", value: tFail, unit: "", occurrence: 1 },
    { file: FLOWSHEET, key: "time", value: tFail, unit: "", occurrence: 2 },
    { file: FLOWSHEET, key: "value", value: 1, unit: "" },
    { file: FLOWSHEET, key: "to", word: e.to, occurrence: 1 },
    { file: FLOWSHEET, key: "fraction", value: e.fraction, unit: "", occurrence: 1 },
  ];
}

/** batch28.  As batch27, plus the third safety event: at a failure what is
 *  left in storage is set aside (the day tank is not refilled). */
export function tankOverrides(tFail: number | null, feed: FeedFailure = "wholeTank"): DictOverride[] {
  if (tFail === null)
    return [
      { file: FLOWSHEET, key: "value", value: 0, unit: "" },
      { file: FLOWSHEET, key: "fraction", value: 0, unit: "", occurrence: 1 },
      { file: FLOWSHEET, key: "fraction", value: 0, unit: "", occurrence: 2 },
    ];
  const e = feedEvent(feed, "heldFeed");
  return [
    { file: FLOWSHEET, key: "time", value: tFail, unit: "", occurrence: 1 },
    { file: FLOWSHEET, key: "time", value: tFail, unit: "", occurrence: 2 },
    { file: FLOWSHEET, key: "time", value: tFail, unit: "", occurrence: 3 },
    { file: FLOWSHEET, key: "value", value: 1, unit: "" },
    { file: FLOWSHEET, key: "to", word: e.to, occurrence: 1 },
    { file: FLOWSHEET, key: "fraction", value: e.fraction, unit: "", occurrence: 1 },
    { file: FLOWSHEET, key: "fraction", value: 1, unit: "", occurrence: 2 },
  ];
}

/** The instants at which a feed failure can deliver the most into the
 *  reactor in batch28: right after the first portion and right after each
 *  refill, when the day tank is fullest [s]. */
export const TANK_WORST_T = [FAIL_OFFSET_S, ...REFILL_TIMES.map((t) => t + FAIL_OFFSET_S)];

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

/** All of the dosed reactant the batch will ever receive [kmol]: the sum
 *  over EVERY vessel of the run's first row, before anything has reacted. */
function dosedTotal(traj: TrajectoryData): number {
  let total = 0;
  for (const [k, v] of Object.entries(traj.vars))
    if (k.endsWith(`.n_${DOSED}`) && v.length > 0) total += v[0]!;
  return total;
}

/** The ACCUMULATION X_ac(t) at every row: the dosed reactant still
 *  unconverted IN THE REACTOR, as a fraction of all of it the batch will
 *  ever receive.  Read from the run, never typed.  A row at a portion's
 *  instant is written AFTER the transfer, so it is the state right after
 *  the portion. */
export function accumulation(traj: TrajectoryData | undefined): Series | null {
  if (!traj || traj.t.length === 0) return null;
  const inReactor = column(traj, `${REACTOR}.n_${DOSED}`);
  if (!inReactor) return null;
  const total = dosedTotal(traj);
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

/** The species amounts in the REACTOR at a failure instant [kmol].
 *
 *  `t` just AFTER a portion interpolates between the row at the portion's
 *  instant (written after the transfer) and the next.  `t` just BEFORE a
 *  portion cannot be interpolated -- the row at the portion's instant is
 *  already past the jump -- so it is that row minus what the transfer at
 *  that instant moved, read from the other vessels' change between the row
 *  before it and the row at it (in normal operation nothing else moves
 *  them).  The second of reaction between t and the portion is neglected:
 *  under 0.1 % of what is there at T_p. */
export function reactorMoles(
  traj: TrajectoryData | undefined, t: number,
): { [comp: string]: number } | null {
  if (!traj) return null;
  const k = traj.t.findIndex((r) => r > t);
  const jump = k > 0 && traj.t[k]! - t <= FAIL_OFFSET_S + 1e-9 ? k : -1;
  const out: { [comp: string]: number } = {};
  for (const sp of SPECIES) {
    const c = column(traj, `${REACTOR}.n_${sp}`);
    if (!c) return null;
    if (jump < 0) { out[sp] = Math.max(0, at({ t: traj.t, y: c }, t)); continue; }
    let moved = 0;
    for (const [name, v] of Object.entries(traj.vars)) {
      if (!name.endsWith(`.n_${sp}`) || name.startsWith(`${REACTOR}.`)) continue;
      moved += v[jump - 1]! - v[jump]!;
    }
    out[sp] = Math.max(0, c[jump]! - moved);
  }
  return out;
}

/** The species amounts in another vessel at t [kmol], interpolated between
 *  rows (the dosing vessels change only at their own transfers, and the
 *  rows the page asks about lie after them). */
export function vesselMoles(
  traj: TrajectoryData | undefined, vessel: string, t: number,
): { [comp: string]: number } | null {
  if (!traj) return null;
  const out: { [comp: string]: number } = {};
  for (const sp of SPECIES) {
    const c = column(traj, `${vessel}.n_${sp}`);
    if (!c) return null;
    out[sp] = Math.max(0, at({ t: traj.t, y: c }, t));
  }
  return out;
}

/** Mole fractions of a set of amounts, or null when there is nothing. */
export function fractions(
  n: { [comp: string]: number } | null,
): { [comp: string]: number } | null {
  if (!n) return null;
  const sum = SPECIES.reduce((a, sp) => a + (n[sp] ?? 0), 0);
  if (!(sum > 0)) return null;
  const x: { [comp: string]: number } = {};
  for (const sp of SPECIES) x[sp] = (n[sp] ?? 0) / sum;
  return x;
}

/** The reactor's mole fractions at a failure instant: the composition whose
 *  bubble point is the MTT at that instant. */
export function reactorComposition(
  traj: TrajectoryData | undefined, t: number,
): { [comp: string]: number } | null {
  return fractions(reactorMoles(traj, t));
}

/** The reactor's mole fractions right after the WHOLE content of `vessel`
 *  has entered it at t: the composition whose bubble point is the MTT of
 *  a whole-tank feed failure. */
export function dumpComposition(
  traj: TrajectoryData | undefined, vessel: string, t: number,
): { [comp: string]: number } | null {
  const r = reactorMoles(traj, t);
  const v = vesselMoles(traj, vessel, t);
  if (!r || !v) return null;
  const n: { [comp: string]: number } = {};
  for (const sp of SPECIES) n[sp] = r[sp]! + v[sp]!;
  return fractions(n);
}

export interface FailureReading {
  /** The highest reactor temperature the run reached [K]: T_cf, the
   *  temperature after a cooling failure at that run's instant, when the
   *  adiabatic leg has finished.  One run is one instant. */
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

/** The mass of everything the batch will ever be given [kg]: every vessel,
 *  the run's first row.  Null when a species has no molar mass. */
function finalMass(traj: TrajectoryData, mw: { [comp: string]: number }): number | null {
  let Mf = 0;
  for (const [k, v] of Object.entries(traj.vars)) {
    const m = /\.n_([A-Za-z0-9_]+)$/.exec(k);
    if (!m || v.length === 0) continue;
    const w = mw[m[1]!];
    if (w === undefined) return null;
    Mf += v[0]! * w;
  }
  return Mf;
}

/** The mass ratio M_f / M(t) of Stoessel's semi-batch form at every row:
 *  the mass of everything the batch will ever be given over the mass in the
 *  REACTOR at t.  1 for a batch, whose mass does not change.  Null when a
 *  species has no molar mass or a column is missing -- never a ratio of 1
 *  put in its place. */
export function massRatio(
  traj: TrajectoryData | undefined, mw: { [comp: string]: number },
): Series | null {
  if (!traj || traj.t.length === 0) return null;
  const Mf = finalMass(traj, mw);
  if (Mf === null) return null;
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

export interface PointEstimate { X: number; ratio: number; Tcf: number }

/** The same estimate at ONE failure instant, with the reactor's contents
 *  read by `reactorMoles` (so "just before a portion" is the state before
 *  the transfer, not an interpolation across it). */
export function estimateAt(
  traj: TrajectoryData | undefined, mw: { [comp: string]: number },
  Tp: number, dTad: number, t: number,
): PointEstimate | null {
  if (!traj) return null;
  const n = reactorMoles(traj, t);
  const Mf = finalMass(traj, mw);
  const total = dosedTotal(traj);
  if (!n || Mf === null || !(total > 0)) return null;
  let M = 0;
  for (const sp of SPECIES) {
    const w = mw[sp];
    if (w === undefined) return null;
    M += n[sp]! * w;
  }
  const X = n[DOSED]! / total;
  const ratio = Mf / M;
  return { X, ratio, Tcf: Tp + X * dTad * ratio };
}

/** The estimate for the WORST FEED FAILURE at every row: the whole content
 *  of the dosing vessel `vessel` enters the reactor as the cooling fails,
 *  so the reactant that can react adiabatically is the accumulation plus
 *  the vessel's, heating the reactor's mass plus the vessel's:
 *  T_p + (n_B,reactor + n_B,vessel)/n_B,total dT_ad M_f/(M_reactor +
 *  M_vessel).  The vessel is at T_p, so its sensible heat is the same as
 *  the reactor's and the form needs no other term. */
export function dumpEstimate(
  traj: TrajectoryData | undefined, vessel: string,
  mw: { [comp: string]: number }, Tp: number, dTad: number,
): Series | null {
  if (!traj || traj.t.length === 0) return null;
  const Mf = finalMass(traj, mw);
  const total = dosedTotal(traj);
  if (Mf === null || !(total > 0)) return null;
  const cols: [number[], number[], number][] = [];
  for (const sp of SPECIES) {
    const r = column(traj, `${REACTOR}.n_${sp}`);
    const v = column(traj, `${vessel}.n_${sp}`);
    const w = mw[sp];
    if (!r || !v || w === undefined) return null;
    cols.push([r, v, w]);
  }
  const iB = SPECIES.indexOf(DOSED);
  const y = traj.t.map((_, i) => {
    let M = 0;
    for (const [r, v, w] of cols) M += (r[i]! + v[i]!) * w;
    const nB = cols[iB]![0][i]! + cols[iB]![1][i]!;
    return M > 0 ? Tp + (nB / total) * dTad * (Mf / M) : NaN;
  });
  return { t: traj.t, y };
}

/** The largest value of a series and where it is: the maximum of an
 *  estimate curve over the rows it was evaluated at. */
export function maxOf(s: Series): { t: number; y: number } | null {
  let best: { t: number; y: number } | null = null;
  s.y.forEach((y, i) => {
    if (Number.isFinite(y) && (best === null || y > best.y)) best = { t: s.t[i]!, y };
  });
  return best;
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
//
//  The function orders the four numbers it is given.  Handed one failure
//  instant's T_cf it classes that SCENARIO; handed the maximum over the
//  instants searched, the process.  The page says which it is doing.

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
 *  files the page runs.  The LOWEST is the MTT PROXY the page offers beside
 *  the engine's bubble point: the boiling point of the most volatile
 *  component, never the boiling point of the reaction mass -- an ideal
 *  mixture boils between its components' boiling points, so the proxy is
 *  below the bubble point whenever a heavier component is present. */
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
  /** The converter feed's own temperature [K] and pressure [Pa]. */
  feedT_K: number;
  feedP_Pa: number;
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
    feedT_K: feed.T,
    feedP_Pa: feed.P,
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

/** The Z witness's two operations, one per loop, and the overrides that put
 *  each at its converter feed's own temperature and pressure (the witness
 *  ships them at the RELIEVING pressure, for the overpressure page).  T and
 *  P occur once per operation, loop150 first. */
export const Z_OPS = { p150: "loop150", p50: "loop50" } as const;

export function zOverrides(a: LoopReading, b: LoopReading): DictOverride[] {
  const f = "system/propsDict";
  return [
    { file: f, key: "T", value: a.feedT_K, unit: "K", occurrence: 1 },
    { file: f, key: "P", value: a.feedP_Pa, unit: "Pa", occurrence: 1 },
    { file: f, key: "T", value: b.feedT_K, unit: "K", occurrence: 2 },
    { file: f, key: "P", value: b.feedP_Pa, unit: "Pa", occurrence: 2 },
  ];
}

export interface GasPoint { T: number; P: number; Z: number }

/** One propertyPoint operation's T, P and Z, or null. */
export function readGasPoint(r: RunResult | null | undefined, op: string): GasPoint | null {
  const d = r?.operationResults?.find((o) => o.name === op)?.diagnostics;
  const num = (k: string): number | null =>
    typeof d?.[k] === "number" && Number.isFinite(d[k]) ? d[k]! : null;
  const T = num("T"), P = num("P"), Z = num("Z");
  return T === null || P === null || Z === null ? null : { T, P, Z };
}

export interface VolumetricRatio {
  /** The four factors of Q50/Q150 = (F50/F150)(Z50/Z150)(T50/T150)(P150/P50). */
  flow: number; z: number; temperature: number; pressure: number;
  /** Their product with Z, and without it (the ideal-gas estimate). */
  real: number; ideal: number;
}

/** The ratio of the two converter feeds' VOLUMETRIC flows, Q = F Z R T / P,
 *  from the loops' molar flows and the engine's Z at each feed's own
 *  state. */
export function volumetricRatio(
  a: LoopReading, b: LoopReading, za: GasPoint, zb: GasPoint,
): VolumetricRatio {
  const flowR = b.feed_kmol_h / a.feed_kmol_h;
  const z = zb.Z / za.Z;
  const temperature = zb.T / za.T;
  const pressure = za.P / zb.P;
  const ideal = flowR * temperature * pressure;
  return { flow: flowR, z, temperature, pressure, ideal, real: ideal * z };
}
