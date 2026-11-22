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
  knowK -- the measurement of a rate constant, done on the engine.  The
  module behind the EduTool `how-do-we-know-k`.

  THE EXPERIMENT.  One tutorial case, kinetics01_oh_decay, is the CELL of a
  flash-photolysis experiment: an isothermal closed vessel holding an H2/N2
  bath at T and P and a trace of OH (or of H2O2) made at t = 0, with the whole
  O Conaire 2004 mechanism switched on.  The engine integrates it and writes
  the amount of every species against time -- the signal an experimenter
  follows.  The page runs it under several declared conditions.

  WHAT THIS MODULE DOES, and nothing more:
    * the knob -> dict-number map (T, P, the charge, the mole fractions, the
      observation window) -- every number is a DECLARED scalar of the case;
    * the ideal-gas bookkeeping that turns a mole fraction into a
      concentration (c = x P / R T) and a pressure into the charge the vessel
      holds (n = P V / R T): unit conversions, stated;
    * the fit of ln n(t) to a straight line over the first three lifetimes
      (the pseudo-first-order constant k'), and the straight-line fits of k'
      against the excess concentration and of ln k against 1/T;
    * the rate constant of the RECORD: the A, b, Ea the engine announced when
      it loaded the reaction (read from the run's own log, in the engine's
      SI units) put in k = A T^b exp(-Ea/RT) -- the law the engine evaluates
      -- and, for a fall-off, the Lindemann blend and Troe broadening it
      evaluates (Reaction.cpp), written again here as a CHECK, not a result;
    * the optional measurement noise, SEEDED and labelled synthetic.
  No rate is integrated here and no k is invented: the data are the engine's.
\*---------------------------------------------------------------------------*/

import type { TrajectoryData } from "../adapters/SolverAdapter.js";
import type { DictOverride } from "./methodRun.js";

/** The bundled witness (the path under tutorials/). */
export const KNOW_K_WITNESS = "batch/combustion/kinetics01_oh_decay";
export const KNOW_K_BINARY = "choupoBatch" as const;

/** The universal gas constant the engine uses, J/(mol K): src/core/Constants.H. */
export const R_GAS = 8.314462618;
/** The cell's volume, m3, as the case declares it (0/internalStates/bomb). */
export const CELL_VOLUME = 1.0e-3;

/** The cell's pressure for the OH experiments, Pa (1 bar). */
export const CELL_PRESSURE = 1.0e5;
/** H2 mole fractions the single decay offers; the series, the Arrhenius
 *  panel's fixed excess, the OH seed of the clean experiments. */
export const ONE_XH2_STOPS: readonly number[] = [0.005, 0.01, 0.02, 0.04];
export const SERIES_XH2: readonly number[] = [0.005, 0.01, 0.02, 0.04, 0.08];
export const ARR_XH2 = 0.02;
export const SEED_XOH = 1.0e-6;
/** The temperatures of the Arrhenius panel, K (the cell slider's stops too). */
export const T_STOPS: readonly number[] = [800, 900, 1000, 1100, 1200, 1300, 1400];
/** The fall-off experiment: the temperatures, the pressures (bar) and the
 *  H2O2 seed (mole fraction, small enough that OH attacking H2O2 is not
 *  contaminating the decay). */
export const FALLOFF_T: readonly number[] = [1000, 1100, 1200];
export const FALLOFF_P_BAR: readonly number[] = [0.1, 0.3, 1, 3, 10, 30, 100, 300];
export const FALLOFF_XH2O2 = 1.0e-8;
/** The breaking experiment: a fixed H2 fraction and a growing OH seed. */
export const BREAK_XH2 = 0.01;
export const BREAK_XOH: readonly number[] = [1e-6, 1e-5, 1e-4, 1e-3, 3e-3, 1e-2];
/** The instant of the case's rateOfProduction block, s (system/flowsheetDict). */
export const ROP_TIME = 5.0e-6;
/** Seeds of the declared noise, one block per panel (run i adds i). */
export const NOISE_SEEDS = { one: 11, series: 100, arrhenius: 200, falloff: 300, breaks: 400 } as const;

/** The reactions the page measures, as the case names them, in the order the
 *  case's `reactions ( ... )` list loads them. */
export const RXN_OH_H2 = "R3_OH_H2_H_H2O";
export const RXN_FALLOFF = "R15_H2O2_M_2OH";

/** The number of instants written across the window. */
export const N_WRITE = 200;

/** Concentration of a species of mole fraction x at T (K) and P (Pa):
 *  c = x P / (R T), returned in mol/cm3 (the unit CHEMKIN-style k is in). */
export function concMolCm3(x: number, T: number, P: number): number {
  return (x * P) / (R_GAS * T) * 1.0e-6;
}

/** The charge the cell holds at T and P: n = P V / (R T), in kmol (the unit
 *  of the case's `totalMoles`). */
export function chargeKmol(T: number, P: number): number {
  return (P * CELL_VOLUME) / (R_GAS * T) * 1.0e-3;
}

const r = (v: number): number => Number(v.toPrecision(10));

export interface Experiment {
  /** Cell temperature, K. */
  T: number;
  /** Cell pressure, Pa. */
  P: number;
  /** Mole fraction of H2 in the bath. */
  xH2: number;
  /** Mole fraction of OH made by the flash. */
  xOH: number;
  /** Mole fraction of H2O2 in the bath (the fall-off experiment). */
  xH2O2: number;
  /** Observation window, s. */
  endTime: number;
}

/** The dict numbers one experiment rewrites.  The bath N2 is what is left:
 *  1 - x_H2 - x_OH - x_H2O2.  The write grid is N_WRITE instants. */
export function experimentOverrides(e: Experiment): DictOverride[] {
  const f = "0/internalStates/bomb";
  const bath = 1 - e.xH2 - e.xOH - e.xH2O2;
  const dt = r(e.endTime / N_WRITE);
  return [
    { file: f, key: "T", value: r(e.T), unit: "K" },
    { file: f, key: "P", value: r(e.P / 1.0e5), unit: "bar" },
    { file: f, key: "totalMoles", value: r(chargeKmol(e.T, e.P)), unit: "" },
    { file: f, key: "H2", value: r(e.xH2), unit: "" },
    { file: f, key: "OH", value: r(e.xOH), unit: "" },
    { file: f, key: "H2O2", value: r(e.xH2O2), unit: "" },
    { file: f, key: "N2", value: r(bath), unit: "" },
    { file: "system/controlDict", key: "endTime", value: r(e.endTime), unit: "" },
    { file: "system/controlDict", key: "deltaT", value: dt, unit: "" },
    { file: "system/controlDict", key: "writeInterval", value: dt, unit: "" },
  ];
}

// ---- the pilot run: finding the observation window ---------------------------------

/** Where the fall to exp(-FIT_LIFETIMES) of the first reading should sit in
 *  a good window, as a fraction of the instants written, and the band within
 *  which it is accepted. */
export const PILOT_TARGET = 0.2;
export const PILOT_BAND: readonly [number, number] = [0.06, 0.6];
/** At most this many pilot runs per condition. */
export const PILOT_MAX = 8;

/** One step of the experimenter's pilot: given the window just tried and the
 *  signal it gave, accept it or propose the next.  A good window shows the
 *  signal falling by three e-folds somewhere between a twentieth and a
 *  half of its length: shorter and the fit has too few points, longer and
 *  the tail is lost in the noise.  The engine's own numbers are read, never
 *  an estimate of k. */
export function adaptWindow(
  window: number, t: readonly number[], n: readonly number[],
): { ok: boolean; next: number } {
  const N = t.length - 1;
  if (N < 5 || !(n[0]! > 0)) return { ok: true, next: window };
  const drop = (i: number): number => (n[i]! > 0 ? Math.log(n[0]! / n[i]!) : Infinity);
  let i3 = -1;
  for (let i = 1; i <= N; i++) if (drop(i) >= FIT_LIFETIMES) { i3 = i; break; }
  if (i3 < 0) {
    const d = Math.max(drop(N), 0.05);
    return { ok: false, next: window * Math.min(1000, (4 * FIT_LIFETIMES) / d) };
  }
  const frac = i3 / N;
  if (frac >= PILOT_BAND[0] && frac <= PILOT_BAND[1]) return { ok: true, next: window };
  return { ok: false, next: window * (i3 / (PILOT_TARGET * N)) };
}

// ---- the signal and its fit -----------------------------------------------------

/** One column of the engine's trajectory (the amount of a species, kmol). */
export function signalOf(traj: TrajectoryData, species: string): { t: number[]; n: number[] } | null {
  const v = traj.vars[`bomb.n_${species}`];
  if (!v || v.length !== traj.t.length || v.length < 3) return null;
  return { t: [...traj.t], n: [...v] };
}

/** A small seeded generator (mulberry32) and a Gaussian from it (Box-Muller):
 *  the page's declared noise, reproducible, never the engine's. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(u: () => number): number {
  const a = Math.max(u(), 1e-300), b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/** The signal as an instrument would report it: each reading multiplied by
 *  exp(sigma z), z a seeded standard normal (a relative noise of about
 *  `sigma`).  sigma = 0 returns the engine's numbers untouched. */
export function withNoise(n: readonly number[], sigma: number, seed: number): number[] {
  if (!(sigma > 0)) return [...n];
  const u = seeded(seed);
  return n.map((v) => v * Math.exp(sigma * gaussian(u)));
}

export interface LineFit {
  slope: number; intercept: number; seSlope: number; seIntercept: number;
  n: number; r2: number;
}

/** Ordinary least squares y = a + b x with the standard errors of both. */
export function linearFit(x: readonly number[], y: readonly number[]): LineFit | null {
  const n = x.length;
  if (n < 2 || y.length !== n) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i]! - mx) ** 2; sxy += (x[i]! - mx) * (y[i]! - my); syy += (y[i]! - my) ** 2;
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx, intercept = my - slope * mx;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (y[i]! - intercept - slope * x[i]!) ** 2;
  const s2 = n > 2 ? rss / (n - 2) : 0;
  return {
    slope, intercept, n,
    seSlope: Math.sqrt(s2 / sxx),
    seIntercept: Math.sqrt(s2 * (1 / n + (mx * mx) / sxx)),
    r2: syy > 0 ? 1 - rss / syy : 1,
  };
}

/** How many lifetimes the fit window covers. */
export const FIT_LIFETIMES = 3;

export interface Decay {
  /** Pseudo-first-order constant k' = -slope of ln n against t, 1/s. */
  kPrime: number; seKPrime: number;
  /** The fit window: indices 0..last of the reported signal. */
  last: number; points: number;
  /** ln n at every reported instant (the page plots it). */
  ln: number[];
}

/** k' from a decay signal.  The window runs from t = 0 to the first reading
 *  below exp(-FIT_LIFETIMES) of the first one (the signal has then fallen by
 *  95 %), and to the end of the run when it never does; at least 5 points.
 *  Null when the signal does not decay or is not positive. */
export function fitDecay(t: readonly number[], n: readonly number[]): Decay | null {
  if (t.length !== n.length || t.length < 5 || !(n[0]! > 0)) return null;
  const ln = n.map((v) => (v > 0 ? Math.log(v) : NaN));
  let last = n.length - 1;
  const cut = ln[0]! - FIT_LIFETIMES;
  for (let i = 1; i < n.length; i++) if (!(ln[i]! > cut)) { last = i; break; }
  last = Math.max(last, 4);
  const tt: number[] = [], yy: number[] = [];
  for (let i = 0; i <= last; i++) if (Number.isFinite(ln[i]!)) { tt.push(t[i]!); yy.push(ln[i]!); }
  const f = linearFit(tt, yy);
  if (!f || !(f.slope < 0)) return null;
  return { kPrime: -f.slope, seKPrime: f.seSlope, last, points: tt.length, ln };
}

// ---- the rate constant of the record --------------------------------------------

/** What the engine announced for one reaction when it loaded it: the A and Ea
 *  of its law in the engine's SI units (kmol, m3, s; J/mol), read from the
 *  `[kinetics]` lines of the run's log -- the second line of each pair names
 *  the unit conversion.  For a fall-off the LOW-pressure law is the second
 *  A/Ea pair the engine printed for that reaction. */
export interface AnnouncedLaw {
  A: number; Ea: number;
  /** The low-pressure law of a fall-off, when the reaction has one. */
  low?: { A: number; Ea: number };
}

/** Read the announced laws of every reaction from a batch log: the
 *  `[kinetics] A:` and `[kinetics] Ea:` lines precede the `[reaction heat]`
 *  line that names the reaction they belong to. */
export function announcedLaws(log: string): Map<string, AnnouncedLaw> {
  const out = new Map<string, AnnouncedLaw>();
  let As: number[] = [], Es: number[] = [];
  for (const line of log.split("\n")) {
    const a = /\[kinetics\] A: \S+ \S+\s+->\s+(\S+) \(SI/.exec(line);
    if (a) { As.push(Number(a[1])); continue; }
    const e = /\[kinetics\] Ea: \S+ \S+\s+->\s+(\S+) J\/mol/.exec(line);
    if (e) { Es.push(Number(e[1])); continue; }
    const h = /\[reaction heat\] BatchReactor '[^']*' reaction '([^']+)'/.exec(line);
    if (h) {
      if (As.length >= 1 && Es.length >= 1) {
        const law: AnnouncedLaw = { A: As[0]!, Ea: Es[0]! };
        if (As.length >= 2 && Es.length >= 2) law.low = { A: As[1]!, Ea: Es[1]! };
        out.set(h[1]!, law);
      }
      As = []; Es = [];
    }
  }
  return out;
}

/** The temperature exponents b of a reaction in the case's own record text
 *  (constant/reactions): the engine does not convert b, so it is read from
 *  the record as written.  `low` is the b of the `low { }` line. */
export function recordExponents(reactions: string, name: string): { b: number; bLow?: number } | null {
  const start = reactions.indexOf(`\n${name}\n`);
  if (start < 0) return null;
  const end = reactions.indexOf("\n}\n", start);
  const block = reactions.slice(start, end < 0 ? undefined : end);
  const kin = /kinetics\s*\{([\s\S]*)$/.exec(block);
  if (!kin) return null;
  const main = /\bb\s+([-+0-9.eE]+)\s*;/.exec(kin[1]!.replace(/low\s*\{[^}]*\}/, ""));
  if (!main) return null;
  const low = /low\s*\{[^}]*\bb\s+([-+0-9.eE]+)\s*;/.exec(kin[1]!);
  return { b: Number(main[1]), ...(low ? { bLow: Number(low[1]) } : {}) };
}

/** k = A T^b exp(-Ea/(R T)) -- Reaction::modifiedArrheniusRate
 *  (src/thermo/reaction/Reaction.cpp), SI in, SI out (m3/kmol/s for a
 *  bimolecular reaction). */
export function modifiedArrhenius(A: number, b: number, Ea: number, T: number): number {
  return A * Math.pow(T, b) * Math.exp(-Ea / (R_GAS * T));
}

/** m3 kmol-1 s-1 -> cm3 mol-1 s-1: the unit the literature quotes (x 1e3). */
export const SI_TO_CM3 = 1.0e3;

/** The Troe broadening, Reaction::falloffRate: F from Fcent and the reduced
 *  pressure Pr, as Gilbert, Luther & Troe 1983 Eqs. (6.3)-(6.7) write it.
 *  `troe` = (alpha, T***, T*, [T**]).  Returns {F, Fcent}. */
export function troeBroadening(Pr: number, T: number, troe: readonly number[]): { F: number; Fcent: number } {
  const [alpha, T3, T1] = [troe[0]!, troe[1]!, troe[2]!];
  let Fcent = (1 - alpha) * Math.exp(-T / T3) + alpha * Math.exp(-T / T1);
  if (troe.length >= 4) Fcent += Math.exp(-troe[3]! / T);
  if (!(Fcent > 0)) return { F: 1, Fcent: 0 };
  const lf = Math.log10(Fcent);
  const c = -0.4 - 0.67 * lf, nT = 0.75 - 1.27 * lf, d = 0.14;
  const lp = Math.log10(Math.max(Pr, 1e-300));
  const x = (lp + c) / (nT - d * (lp + c));
  return { F: Math.pow(10, lf / (1 + x * x)), Fcent };
}

/** The falloff law of a record (SI): k_inf, k_0, the third-body
 *  concentration M (kmol/m3) -> {k, kLindemann, Pr, F}. */
export function falloffK(
  inf: { A: number; b: number; Ea: number }, low: { A: number; b: number; Ea: number },
  troe: readonly number[], T: number, M: number,
): { k: number; kInf: number; kLow: number; Pr: number; F: number; kLindemann: number } {
  const kInf = modifiedArrhenius(inf.A, inf.b, inf.Ea, T);
  const kLow = modifiedArrhenius(low.A, low.b, low.Ea, T);
  const Pr = (kLow * M) / kInf;
  const kLindemann = (kInf * Pr) / (1 + Pr);
  const { F } = troeBroadening(Pr, T, troe);
  return { k: kLindemann * F, kInf, kLow, Pr, F, kLindemann };
}

/** The Troe numbers of a record, as written in constant/reactions:
 *  `troe ( a T3 T1 [T2] );`. */
export function recordTroe(reactions: string, name: string): number[] | null {
  const start = reactions.indexOf(`\n${name}\n`);
  if (start < 0) return null;
  const end = reactions.indexOf("\n}\n", start);
  const m = /troe\s*\(([^)]*)\)/.exec(reactions.slice(start, end < 0 ? undefined : end));
  if (!m) return null;
  return m[1]!.trim().split(/\s+/).map(Number);
}

/** The third-body efficiencies of a fall-off record (default 1 for a species
 *  the record does not list), as the case writes them. */
export function recordEfficiencies(reactions: string, name: string): Record<string, number> | null {
  const start = reactions.indexOf(`\n${name}\n`);
  if (start < 0) return null;
  const end = reactions.indexOf("\n}\n", start);
  const m = /thirdBody\s*\{([^}]*)\}/.exec(reactions.slice(start, end < 0 ? undefined : end));
  if (!m) return null;
  const eff: Record<string, number> = {};
  for (const p of m[1]!.matchAll(/(\S+)\s+([-+0-9.eE]+)\s*;/g)) eff[p[1]!] = Number(p[2]);
  return eff;
}

// ---- the straight-line readings --------------------------------------------------

/** The local activation energy of a modified-Arrhenius k, -R d ln k / d(1/T)
 *  = Ea + b R T (J/mol): the number a straight Arrhenius plot reads at T. */
export function effectiveEa(Ea: number, b: number, T: number): number {
  return Ea + b * R_GAS * T;
}

/** The Arrhenius plot's reading: ln k against 1/T, straight-line fit.
 *  Returns the apparent activation energy Ea_app = -R slope (J/mol) and the
 *  pre-exponential A_app = exp(intercept), with the standard errors. */
export function arrheniusFit(T: readonly number[], k: readonly number[]):
  { EaApp: number; seEa: number; lnA: number; seLnA: number; fit: LineFit } | null {
  const x = T.map((v) => 1 / v), y = k.map((v) => Math.log(v));
  const f = linearFit(x, y);
  if (!f) return null;
  return { EaApp: -f.slope * R_GAS, seEa: f.seSlope * R_GAS, lnA: f.intercept, seLnA: f.seIntercept, fit: f };
}

// ---- the secondary chemistry: the engine's own rate-of-production table ----------

export interface RopRow {
  reaction: string;
  /** Stoichiometric number of the species in the reaction. */
  nu: number;
  /** The reaction's net rate r_j, kmol/(m3 s). */
  rate: number;
  /** What it adds to the species: nu r_j V, kmol/s (negative = destroys). */
  contribution: number;
}

/** One species' rate of production by reaction at one instant, read from the
 *  engine's rateOfProduction.csv (long format: t_s, species, reaction, nu,
 *  rate_kmol_m3_s, contribution_kmol_s).  Rows sorted by |contribution|,
 *  largest first; the engine's own NET and DNDT_ODE summary rows are returned
 *  apart.  `t` picks the instant (the nearest one the csv holds). */
export function ropOf(csv: string, species: string, t: number):
  { rows: RopRow[]; net: number | null; at: number } | null {
  const lines = csv.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const recs = lines.slice(1).map((l) => l.split(","));
  const times = [...new Set(recs.map((c) => Number(c[0])))].filter(Number.isFinite);
  if (times.length === 0) return null;
  const at = times.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  const rows: RopRow[] = [];
  let net: number | null = null;
  for (const c of recs) {
    if (Number(c[0]) !== at || c[1] !== species) continue;
    if (c[2] === "NET") { net = Number(c[5]); continue; }
    if (c[2] === "DNDT_ODE") continue;
    rows.push({ reaction: c[2]!, nu: Number(c[3]), rate: Number(c[4]), contribution: Number(c[5]) });
  }
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { rows, net, at };
}

// ---- the engine's law for one reaction, from its own announcement -------------------

/** k(T) of a bimolecular reaction as the engine evaluates it, in cm3/(mol s):
 *  the A and Ea the run's log announced (SI) with the b of the case's record.
 *  Null when the log does not announce the reaction. */
export function engineBimolecularK(
  log: string, reactions: string, name: string, T: number,
): number | null {
  const law = announcedLaws(log).get(name);
  const ex = recordExponents(reactions, name);
  if (!law || !ex) return null;
  return modifiedArrhenius(law.A, ex.b, law.Ea, T) * SI_TO_CM3;
}

/** The fall-off law of a reaction as the engine evaluates it: k_inf and k_0
 *  from the announced laws and the record's exponents, Troe numbers from the
 *  record.  `M` in kmol/m3 (SI).  k in 1/s for a unimolecular reaction.
 *  Null when anything is missing. */
export function engineFalloff(
  log: string, reactions: string, name: string, T: number, M: number,
): ReturnType<typeof falloffK> | null {
  const law = announcedLaws(log).get(name);
  const ex = recordExponents(reactions, name);
  const troe = recordTroe(reactions, name);
  if (!law || !law.low || !ex || ex.bLow === undefined || !troe) return null;
  return falloffK(
    { A: law.A, b: ex.b, Ea: law.Ea }, { A: law.low.A, b: ex.bLow, Ea: law.low.Ea }, troe, T, M);
}
