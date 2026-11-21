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
  faultDiagnosisMath -- every computation of the `fault-diagnosis` EduTool
  ("How a plant tells you something is wrong"; DEV.md 4c C464) that is not a
  signal generator: the humidity arithmetic of the opening story, the room
  toy, the humidistat toy, the chi-square machinery, the weighted-least-
  squares reconciliation with its two tests, the alarm toy, the tank, heat
  exchanger and pump residuals.  Pure TypeScript, no React and no engine run:
  the page's origin is `page`, and tests/faultDiagnosis.test.ts pins every
  number the page prints.

  WHAT IS HELD TO WHAT.
    * Saturation pressure of water is the Wagner form of IAPWS SR1-86 with the
      six coefficients of data/standards/components/water.dat, so the story's
      absolute humidities are the ones Choupo's own water record gives; the
      test reads that record and compares the numbers it carries.
    * The chi-square and normal probabilities are checked against exact
      identities (two degrees of freedom is an exponential; one is the error
      function) and against the three normal probabilities Seborg prints
      (Eq. 21-6, 0.6827 / 0.9545 / 0.9973).
    * The Shewhart run lengths are Montgomery's ARL = 1 / p (Eq. 5.2, p. 191),
      ARL0 = 370 for three-sigma limits.
    * Every toy parameter is an ASSUMPTION chosen to tell the story, and the
      page says so: the room, the humidistat, the tank, the exchanger and the
      pump are illustrations, not measurements.
\*---------------------------------------------------------------------------*/

// ---- seeded noise ----------------------------------------------------------

/** A small seeded uniform generator (mulberry32): the same seed, the same
 *  numbers, on every machine, so a challenge can be pinned by a test. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard normal number (Box-Muller) from a uniform generator. */
export function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const mean = (y: readonly number[]): number =>
  y.reduce((s, v) => s + v, 0) / y.length;

export const stdev = (y: readonly number[]): number => {
  const m = mean(y);
  return Math.sqrt(y.reduce((s, v) => s + (v - m) * (v - m), 0) / (y.length - 1));
};

/** Least-squares line y = a + b x, with the standard error of b. */
export function linearFit(x: readonly number[], y: readonly number[]):
  { a: number; b: number; seB: number; r2: number } {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i]! - mx) ** 2;
    sxy += (x[i]! - mx) * (y[i]! - my);
    syy += (y[i]! - my) ** 2;
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i]! - a - b * x[i]!) ** 2;
  const seB = Math.sqrt(sse / (n - 2) / sxx);
  return { a, b, seB, r2: syy > 0 ? 1 - sse / syy : 0 };
}

// ---- humidity: the opening story ------------------------------------------

/** The Wagner constants of IAPWS SR1-86, as in data/standards/components/
 *  water.dat (vaporPressure): reducing T and P, exponents, coefficients. */
export const WAGNER = {
  Tc: 647.096,
  Pc: 22.064e6,
  exponents: [1, 1.5, 3, 3.5, 4, 7.5],
  coefficients: [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502],
} as const;

/** Molar mass of water, kg/mol, and the gas constant, J/(mol K). */
export const M_WATER = 0.01801528;
export const R_GAS = 8.314462618;

/** Saturation pressure of water, Pa, at T in degrees C. */
export function psatWater(Tc: number): number {
  const T = Tc + 273.15;
  const u = 1 - T / WAGNER.Tc;
  let s = 0;
  for (let i = 0; i < 6; i++) s += WAGNER.coefficients[i]! * Math.pow(u, WAGNER.exponents[i]!);
  return WAGNER.Pc * Math.exp((WAGNER.Tc / T) * s);
}

/** Absolute humidity, g of water per m3 of air: the vapour's own density,
 *  e / (R_v T), with e the partial pressure phi * psat.  rh is a fraction. */
export function absoluteHumidity(Tc: number, rh: number): number {
  const Rv = R_GAS / M_WATER;
  return (1000 * rh * psatWater(Tc)) / (Rv * (Tc + 273.15));
}

/** Relative humidity (fraction) of air that holds `ah` g/m3 at T in degrees C. */
export function relativeHumidity(Tc: number, ah: number): number {
  return ah / absoluteHumidity(Tc, 1);
}

/** The two independent sensors of the story: read as told, in two places. */
export const STORY_SENSORS = [
  { place: "sensor A", T: 18.4, rhPct: 68 },
  { place: "sensor B", T: 22.3, rhPct: 52 },
] as const;

/** How much a sensor that sits in air warmed by `dT` kelvin reads LOWER than
 *  the room it is in, in percentage points of relative humidity: the same
 *  vapour density against a larger saturation density. */
export function selfHeatingShift(Troom: number, dT: number, rhRoomPct: number): number {
  return rhRoomPct * (1 - psatWater(Troom) / psatWater(Troom + dT));
}

/** The story's tank arithmetic.  A tank of `tankL` litres fills at the rate
 *  the unit removes water (the room's moisture load, litres per day) and is
 *  emptied by a slow pump at `pumpLPerH`: the time between stops and the
 *  length of a stop are two divisions.  The numbers are the told story's
 *  (a stop every ~4.5 h, ~20 min long); the tank and the pump rate are the
 *  ones that make the divisions come out so, and are ASSUMPTIONS. */
export const STORY_TANK = { tankL: 3, loadLPerDay: 16, pumpLPerH: 9 } as const;

export function tankStops(tankL: number, loadLPerDay: number, pumpLPerH: number):
  { periodH: number; stopMin: number } {
  return { periodH: tankL / (loadLPerDay / 24), stopMin: (60 * tankL) / pumpLPerH };
}

/** What each hypothesis predicts for the same two observations. */
export interface HypothesisPrediction {
  id: "defrost" | "tankFull";
  label: string;
  periodH: number;
  stopMin: number;
}

/** The defrost hypothesis as a TIMER set to the observed period (so the
 *  period alone cannot tell the two apart) with its own defrost length; the
 *  tank hypothesis from the divisions above. */
export function predictions(loadLPerDay: number, pumpLPerH: number, defrostPeriodH: number,
  defrostMin: number, tankL: number = STORY_TANK.tankL): HypothesisPrediction[] {
  const t = tankStops(tankL, loadLPerDay, pumpLPerH);
  return [
    { id: "defrost", label: "auto-defrost (a timer)", periodH: defrostPeriodH, stopMin: defrostMin },
    { id: "tankFull", label: "tank full, slow pump", periodH: t.periodH, stopMin: t.stopMin },
  ];
}

// ---- the room toy: why the temperature dips ----------------------------------

/** Two heat capacities, the air with the light furnishings and the house
 *  mass, coupled to each other and to outdoors.  ASSUMPTIONS, chosen so that
 *  a 20-minute stop gives the dip the story saw (about 0.5-0.7 K). */
export const ROOM_TOY = {
  powerW: 420,       // what the running unit releases into the room air
  Ca: 6.0e5,         // J/K, room air and light furnishings
  Cm: 1.5e8,         // J/K, the house structure
  Gam: 250,          // W/K, air to structure
  Gao: 40,           // W/K, air to outdoors
  Gmo: 80,           // W/K, structure to outdoors
  Tout: 10,          // degrees C
} as const;

export interface RoomOptions {
  stopMin: number;      // length of each stop of the unit
  periodH: number;      // time between the starts of two stops
  startH: number;       // when the first stop begins
  hours: number;
  stepS?: number;
}

export interface RoomTrace { t: number[]; T: number[]; on: number[]; baseline: number }

/** Integrate the two-node room.  Explicit Euler at 10 s: the fastest time
 *  constant here is Ca/(Gam+Gao) ~ 34 min, so the step is stable by a wide
 *  margin.  Starts at the steady state of the unit running. */
export function roomTrace(o: RoomOptions): RoomTrace {
  const p = ROOM_TOY;
  const dt = o.stepS ?? 10;
  // steady state, unit on: two linear equations
  const a11 = -(p.Gam + p.Gao);
  const a12 = p.Gam;
  const a21 = p.Gam;
  const a22 = -(p.Gam + p.Gmo);
  const b1 = -p.powerW - p.Gao * p.Tout;
  const b2 = -p.Gmo * p.Tout;
  const det = a11 * a22 - a12 * a21;
  let Ta = (b1 * a22 - a12 * b2) / det;
  let Tm = (a11 * b2 - a21 * b1) / det;
  const baseline = Ta;
  const n = Math.floor((o.hours * 3600) / dt);
  const every = Math.max(1, Math.round(60 / dt)); // keep one point per minute
  const t: number[] = [];
  const T: number[] = [];
  const on: number[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i * dt) / 3600;
    const ph = (th - o.startH) % o.periodH;
    const unitOn = th >= o.startH && ph < o.stopMin / 60 ? 0 : 1;
    if (i % every === 0) { t.push(th); T.push(Ta); on.push(unitOn); }
    Ta += ((p.powerW * unitOn - p.Gam * (Ta - Tm) - p.Gao * (Ta - p.Tout)) / p.Ca) * dt;
    Tm += ((p.Gam * (Ta - Tm) - p.Gmo * (Tm - p.Tout)) / p.Cm) * dt;
  }
  return { t, T, on, baseline };
}

/** Depth of the first dip, and the hours after the unit restarts until the
 *  room has recovered 90 % of it. */
export function dipStats(tr: RoomTrace, o: RoomOptions): { dip: number; recoverH: number } {
  const lo = Math.min(...tr.T);
  const dip = tr.baseline - lo;
  const restart = o.startH + o.stopMin / 60;
  let recoverH = NaN;
  for (let i = 0; i < tr.t.length; i++) {
    if (tr.t[i]! >= restart && tr.T[i]! >= tr.baseline - 0.1 * dip) {
      recoverH = tr.t[i]! - restart;
      break;
    }
  }
  return { dip, recoverH };
}

// ---- the humidistat toy: a controller that watches itself --------------------

export interface HumidistatOptions {
  loPct: number;        // switch ON above hi, OFF below lo (relative humidity, displayed)
  hiPct: number;
  selfHeatK: number;    // warming of the air at the sensor while the unit runs
  hours: number;
  roomT?: number;
  biasPts?: number;     // a sensor that reads this many points high
}

export interface HumidistatTrace {
  t: number[]; seen: number[]; room: number[]; on: number[]; switches: number;
}

/** The room's vapour (g/m3) rises with the moisture load and falls while the
 *  unit runs; the sensor sits in air warmed by `selfHeatK` while the unit runs
 *  (lagged by three minutes), so it reads the room's vapour against a warmer
 *  saturation density.  Euler at 6 s.  All rates are ASSUMPTIONS. */
export const HUMIDISTAT_TOY = { loadGm3PerH: 0.5, removeGm3PerH: 2.6, sensorLagS: 180, startPct: 60 } as const;

export function humidistatTrace(o: HumidistatOptions): HumidistatTrace {
  const Tr = o.roomT ?? 20;
  const dt = 6;
  const p = HUMIDISTAT_TOY;
  let ah = absoluteHumidity(Tr, p.startPct / 100);
  let s = 0;           // the sensor's warming, 0..1
  let on = 0;
  let switches = 0;
  const t: number[] = [];
  const seen: number[] = [];
  const room: number[] = [];
  const onSeries: number[] = [];
  const n = Math.floor((o.hours * 3600) / dt);
  const every = 10; // one point a minute
  for (let i = 0; i < n; i++) {
    const Tloc = Tr + o.selfHeatK * s;
    const rhSeen = 100 * relativeHumidity(Tloc, ah) + (o.biasPts ?? 0);
    const next = on === 0 && rhSeen > o.hiPct ? 1 : on === 1 && rhSeen < o.loPct ? 0 : on;
    if (next !== on) switches += 1;
    on = next;
    if (i % every === 0) {
      t.push((i * dt) / 3600); seen.push(rhSeen); room.push(100 * relativeHumidity(Tr, ah)); onSeries.push(on);
    }
    ah += ((p.loadGm3PerH - p.removeGm3PerH * on) * dt) / 3600;
    s += ((on - s) * dt) / p.sensorLagS;
  }
  return { t, seen, room, on: onSeries, switches };
}

// ---- probability: the normal and chi-square distributions -------------------

/** ln Gamma(x), x > 0: the recurrence up to 15, then Stirling's series with
 *  four terms (the error is below 1e-13 from 15 on). */
export function lgamma(x: number): number {
  let shift = 0;
  let z = x;
  while (z < 15) { shift += Math.log(z); z += 1; }
  const z2 = z * z;
  const series = 1 / (12 * z) - 1 / (360 * z * z2) + 1 / (1260 * z2 * z2 * z) - 1 / (1680 * z2 * z2 * z2 * z);
  return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + series - shift;
}

/** Regularised lower incomplete gamma P(a, x): series below a + 1, continued
 *  fraction above (the standard split). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/** P(chi-square with k degrees of freedom <= x). */
export const chi2Cdf = (x: number, k: number): number => gammaP(k / 2, x / 2);

/** The p-quantile of chi-square with k degrees of freedom, by bisection. */
export function chi2Quantile(p: number, k: number): number {
  let lo = 0;
  let hi = Math.max(10, 4 * k);
  while (chi2Cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (chi2Cdf(mid, k) < p) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** P(|Z| <= z) for a standard normal Z: chi-square with one degree of freedom
 *  at z^2. */
export const normalWithin = (z: number): number => chi2Cdf(z * z, 1);

/** The two-sided critical value z with P(|Z| <= z) = p. */
export const normalTwoSided = (p: number): number => Math.sqrt(chi2Quantile(p, 1));

/** Shewhart chart: the probability that one point falls outside k-sigma
 *  limits when the mean has moved by `shift` standard deviations. */
export function shewhartExceed(shift: number, k = 3): number {
  const phi = (z: number): number => 0.5 * (1 + Math.sign(z) * normalWithin(Math.abs(z)));
  return phi(-k - shift) + (1 - phi(k - shift));
}

/** Average run length, ARL = 1 / p (Montgomery Eq. 5.2, p. 191). */
export const arl = (shift: number, k = 3): number => 1 / shewhartExceed(shift, k);

// ---- reconciliation: weighted least squares on balances ---------------------

type Mat = number[][];

const matT = (a: Mat): Mat => a[0]!.map((_, j) => a.map((r) => r[j]!));
const matMul = (a: Mat, b: Mat): Mat =>
  a.map((r) => b[0]!.map((_, j) => r.reduce((s, v, k) => s + v * b[k]![j]!, 0)));

/** Solve M x = b for a small symmetric positive-definite M (Gaussian
 *  elimination with partial pivoting). */
export function solveSmall(M: Mat, b: readonly number[]): number[] {
  const n = M.length;
  const a = M.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = a[r]![c]! / a[c]![c]!;
      for (let k = c; k <= n; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= a[r]![k]! * x[k]!;
    x[r] = s / a[r]![r]!;
  }
  return x;
}

export interface Reconciliation {
  /** the balance residuals r = A y, one per balance */
  r: number[];
  /** the reconciled values x = y - V A' (A V A')^-1 A y */
  x: number[];
  /** the adjustments y - x */
  adjust: number[];
  /** the global statistic r' (A V A')^-1 r, chi-square with `dof` degrees */
  chi2: number;
  dof: number;
  /** P(chi-square(dof) >= chi2): small means the balances do not close */
  pValue: number;
  /** the measurement test: each adjustment over its own standard deviation */
  z: number[];
}

/** Reconcile measurements y (standard deviations sigma) so that A x = 0:
 *  minimise sum ((y - x)/sigma)^2 subject to the balances.  The page derives
 *  this on a three-stream splitter; this is the general form. */
export function reconcile(A: Mat, y: readonly number[], sigma: readonly number[]): Reconciliation {
  const m = A.length;
  const n = y.length;
  const V: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? sigma[i]! ** 2 : 0)));
  const AV = matMul(A, V);                  // m x n
  const S = matMul(AV, matT(A));            // m x m  = A V A'
  const r = A.map((row) => row.reduce((s, v, j) => s + v * y[j]!, 0));
  const w = solveSmall(S, r);               // S^-1 r
  const adjust = Array.from({ length: n }, (_, j) => A.reduce((s, _row, i) => s + AV[i]![j]! * w[i]!, 0));
  const x = y.map((v, j) => v - adjust[j]!);
  const chi2 = r.reduce((s, v, i) => s + v * w[i]!, 0);
  // covariance of the adjustments: V A' S^-1 A V ; its diagonal
  const z = adjust.map((a, j) => {
    const col = A.map((_, i) => AV[i]![j]!);
    const sol = solveSmall(S, col);
    const varJ = col.reduce((s, v, i) => s + v * sol[i]!, 0);
    return varJ > 0 ? Math.abs(a) / Math.sqrt(varJ) : 0;
  });
  return { r, x, adjust, chi2, dof: m, pValue: 1 - chi2Cdf(chi2, m), z };
}

/** The splitter of the derivation: F1 = F2 + F3. */
export const SPLITTER_A: Mat = [[1, -1, -1]];

/** The splitter followed by a mixer that adds a fourth and fifth stream:
 *  F1 = F2 + F3 and F4 = F3 + F5. */
export const SPLITTER_MIXER_A: Mat = [[1, -1, -1, 0, 0], [0, 0, 1, -1, 1]];

// ---- the alarm toy ------------------------------------------------------------

export interface AlarmOptions {
  limit: number;       // the alarm limit, in signal units
  normal: number;      // the signal's normal level
  noise: number;       // standard deviation of the measurement noise
  faultAt: number;     // sample at which a ramp begins
  ramp: number;        // growth per sample after faultAt
  n: number;
  seed: number;
}

export interface AlarmRun {
  y: number[];
  /** upward crossings of the limit before the fault: false alarms */
  falseAlarms: number;
  /** samples from the start of the ramp to the first crossing, NaN if none */
  delay: number;
}

export function alarmRun(o: AlarmOptions): AlarmRun {
  const rng = mulberry32(o.seed);
  const y: number[] = [];
  for (let k = 0; k < o.n; k++) {
    const trend = k > o.faultAt ? o.ramp * (k - o.faultAt) : 0;
    y.push(o.normal + trend + o.noise * gaussian(rng));
  }
  let falseAlarms = 0;
  let delay = NaN;
  for (let k = 1; k < o.n; k++) {
    const up = y[k]! > o.limit && y[k - 1]! <= o.limit;
    if (!up) continue;
    if (k <= o.faultAt) falseAlarms += 1;
    else if (Number.isNaN(delay)) delay = k - o.faultAt;
  }
  return { y, falseAlarms, delay };
}

// ---- the tank: a balance accuses a meter ------------------------------------

export interface TankOptions {
  hours: number;
  n: number;
  flow: number;        // m3/h, the true flow in AND out (the level does not move)
  area: number;        // m2
  biasIn: number;      // m3/h, added to the inlet meter
  biasOut: number;     // m3/h, added to the outlet meter
  /** a meter error that grows linearly: its value at the end of the record */
  driftIn?: number;
  driftOut?: number;
  noiseF: number;
  noiseL: number;      // m
  seed: number;
}

export interface TankTrace {
  t: number[]; Fin: number[]; Fout: number[]; level: number[];
  /** the balance residual per block: Fin - Fout - A dL/dt (m3/h) */
  blockT: number[]; blockR: number[];
}

/** The tank holds a constant level, so the true in and out flows are equal.
 *  The balance, per block of `block` samples, is the meter difference minus
 *  the volume rate the level change accounts for. */
export function tankTrace(o: TankOptions, block = 10): TankTrace {
  const rng = mulberry32(o.seed);
  const dt = o.hours / o.n;
  const t: number[] = [];
  const Fin: number[] = [];
  const Fout: number[] = [];
  const level: number[] = [];
  for (let k = 0; k < o.n; k++) {
    const time = k * dt;
    const F = o.flow * (1 + 0.15 * Math.sin((2 * Math.PI * time) / 9));
    t.push(time);
    const ramp = k / (o.n - 1);
    Fin.push(F + o.biasIn + (o.driftIn ?? 0) * ramp + o.noiseF * gaussian(rng));
    Fout.push(F + o.biasOut + (o.driftOut ?? 0) * ramp + o.noiseF * gaussian(rng));
    level.push(2 + o.noiseL * gaussian(rng));
  }
  const blockT: number[] = [];
  const blockR: number[] = [];
  for (let s = 0; s + block <= o.n; s += block) {
    const idx = Array.from({ length: block }, (_, i) => s + i);
    const slope = linearFit(idx.map((i) => t[i]!), idx.map((i) => level[i]!)).b;
    const dF = mean(idx.map((i) => Fin[i]! - Fout[i]!));
    blockT.push(mean(idx.map((i) => t[i]!)));
    blockR.push(dF - o.area * slope);
  }
  return { t, Fin, Fout, level, blockT, blockR };
}

// ---- the heat exchanger: fouling is a drift, a sensor is a step ----------------

export const HX_TOY = { Ch: 4, Cc: 3, UA0: 5, ThIn: 90, TcIn: 20 } as const; // kW/K, kW/K, kW/K, C, C

/** Outlet temperatures of a counter-current exchanger, epsilon-NTU. */
export function hxOutlets(UA: number): { ThOut: number; TcOut: number; Q: number } {
  const { Ch, Cc, ThIn, TcIn } = HX_TOY;
  const Cmin = Math.min(Ch, Cc);
  const Cr = Cmin / Math.max(Ch, Cc);
  const ntu = UA / Cmin;
  const e = Math.abs(1 - Cr) < 1e-9 ? ntu / (1 + ntu)
    : (1 - Math.exp(-ntu * (1 - Cr))) / (1 - Cr * Math.exp(-ntu * (1 - Cr)));
  const Q = e * Cmin * (ThIn - TcIn);
  return { Q, ThOut: ThIn - Q / Ch, TcOut: TcIn + Q / Cc };
}

/** The log-mean temperature difference of a counter-current exchanger. */
export function lmtd(ThIn: number, ThOut: number, TcIn: number, TcOut: number): number {
  const d1 = ThIn - TcOut;
  const d2 = ThOut - TcIn;
  return Math.abs(d1 - d2) < 1e-9 ? d1 : (d1 - d2) / Math.log(d1 / d2);
}

export interface HxOptions {
  days: number;
  n: number;
  /** fouling: UA falls as UA0 / (1 + rInf (1 - exp(-t/tau))) */
  rInf: number;
  tauDays: number;
  /** a thermometer step on the cold outlet: size in K and the day it happens */
  stepK: number;
  stepDay: number;
  noiseT: number;
  seed: number;
}

export interface HxTrace {
  t: number[]; ThOut: number[]; TcOut: number[];
  UAtrue: number[]; UAest: number[]; Qh: number[]; Qc: number[]; balance: number[];
}

export function hxTrace(o: HxOptions): HxTrace {
  const rng = mulberry32(o.seed);
  const { Ch, Cc, ThIn, TcIn, UA0 } = HX_TOY;
  const r: HxTrace = { t: [], ThOut: [], TcOut: [], UAtrue: [], UAest: [], Qh: [], Qc: [], balance: [] };
  for (let k = 0; k < o.n; k++) {
    const time = (k * o.days) / o.n;
    const UA = UA0 / (1 + o.rInf * (1 - Math.exp(-time / o.tauDays)));
    const out = hxOutlets(UA);
    const ThM = out.ThOut + o.noiseT * gaussian(rng);
    const TcM = out.TcOut + (time >= o.stepDay ? o.stepK : 0) + o.noiseT * gaussian(rng);
    const Qh = Ch * (ThIn - ThM);
    const Qc = Cc * (TcM - TcIn);
    r.t.push(time); r.ThOut.push(ThM); r.TcOut.push(TcM); r.UAtrue.push(UA);
    r.Qh.push(Qh); r.Qc.push(Qc); r.balance.push(Qh - Qc);
    r.UAest.push(Qc / lmtd(ThIn, ThM, TcIn, TcM));
  }
  return r;
}

// ---- the pump: an operating point off its curve ---------------------------------

/** A catalogue curve H = H0 - kp Q^2 and a system curve H = Hst + ks v Q^2
 *  (Q in m3/h, H in m); `v` is the valve's extra friction, `wear` the
 *  fraction of the shut-off head lost.  ASSUMPTIONS, illustrations only. */
export const PUMP_TOY = { H0: 40, kp: 0.0015, Hst: 10, ks: 0.0006 } as const;

export function pumpPoint(wear: number, v: number): { Q: number; H: number } {
  const { H0, kp, Hst, ks } = PUMP_TOY;
  const Q = Math.sqrt((H0 * (1 - wear) - Hst) / (kp + ks * v));
  return { Q, H: Hst + ks * v * Q * Q };
}

/** The head the catalogue curve gives at flow Q. */
export const catalogueHead = (Q: number): number => PUMP_TOY.H0 - PUMP_TOY.kp * Q * Q;

/** The residual a model-based check sees: measured head minus the catalogue
 *  head at the measured flow.  Zero for a healthy pump on any system curve. */
export function pumpResidual(wear: number, v: number): number {
  const p = pumpPoint(wear, v);
  return p.H - catalogueHead(p.Q);
}

/** The valve friction factor that gives a HEALTHY pump the same flow as a
 *  worn one: the flow alone cannot tell them apart. */
export function valveForSameFlow(wear: number): number {
  const { H0, kp, Hst, ks } = PUMP_TOY;
  const Q = pumpPoint(wear, 1).Q;
  return ((H0 - Hst) / (Q * Q) - kp) / ks;
}

// ---- two sensors, and a vote of three -------------------------------------------

/** The difference of two readings of one quantity in units of its own noise. */
export const sensorZ = (ya: number, yb: number, sa: number, sb: number): number =>
  Math.abs(ya - yb) / Math.sqrt(sa * sa + sb * sb);

/** With three sensors on one quantity the odd one out is the one furthest
 *  from the median; with two there is no majority and no suspect (-1). */
export function oddOneOut(readings: readonly number[]): number {
  if (readings.length < 3) return -1;
  const s = [...readings].sort((a, b) => a - b);
  const med = s[Math.floor(s.length / 2)]!;
  let worst = 0;
  for (let i = 1; i < readings.length; i++) {
    if (Math.abs(readings[i]! - med) > Math.abs(readings[worst]! - med)) worst = i;
  }
  return worst;
}
