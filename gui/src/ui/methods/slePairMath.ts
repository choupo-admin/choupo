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
  slePairMath -- the arithmetic of the `sle-pair` EduTool (DEV.md 4c C316):
  a binary NRTL pair obtained INDIRECTLY, from the solubility of a solid.

  WHY THE PAGE COMPUTES AND THE ENGINE DOES NOT (measured 2026-11-11).  The
  engine has a crystallising pure solid (src/thermo/phase/SolidPhase.H, the
  one expression f_solid = Psat exp(-dG_fus/RT) with the dCp term announced
  and dropped), an SLE branch of the isothermal flash
  (src/unitOperations/flash/IsothermalFlash.cpp, solveSLE) and two props
  operations that use them for ICE (phaseSplitScan, freezingPoint).  It has
  NO operation that turns measured solubilities into activity coefficients
  or fits a pair to them: `fitParameters` (src/propertyOps/FitParameters.cpp)
  reads vapour-liquid and liquid-liquid evidence only.  So the fit is done
  here, in pure functions, and tests/slePair.test.ts holds them.

  THE ACTIVITY MODEL IS THE ENGINE'S, TRANSCRIBED.  `nrtlLnGamma` is the
  loop of src/thermo/activityCoefficient/NRTL.cpp (gamma(): tau_ij = a_ij +
  b_ij/T, G_ij = exp(-alpha_ij tau_ij), the two sums S_j and T_j, lnGamma_i =
  termA + termB), written for n components exactly as there, and the test
  feeds it the catalogue pair the props case nrtl01_ethanol_water_package
  evaluates and holds it to the engine's printed gamma to 1e-10.

  What this module deliberately does not do: a solid solution (the crystal
  is pure), a second solid form (one polymorph), a solvate, the solvent's
  own crystal (the eutectic branch), and any statistics beyond the residual
  -- no confidence interval is printed for a parameter, because the valley
  this page draws is the honest picture of how little two parameters are
  pinned by one composition branch.
\*---------------------------------------------------------------------------*/

/** The gas constant, J/(mol K) (CODATA 2018 exact value). */
export const R_GAS = 8.314462618;

export interface Fusion { Tfus: number; dHfus: number; dCp?: number }

/** ln of the IDEAL solubility (gamma1 = 1):
 *    ln x_id = -(dH_fus/R)(1/T - 1/T_fus) + (dCp/R)(T_fus/T - 1 + ln(T/T_fus))
 *  The second term only when `withCp` and a dCp is given. */
export function lnIdealSolubility(T: number, s: Fusion, withCp = false): number {
  const main = -(s.dHfus / R_GAS) * (1 / T - 1 / s.Tfus);
  return main + (withCp ? dCpTerm(T, s) : 0);
}

/** The heat-capacity term of ln x_id that the page (and the engine's
 *  SolidPhase) neglects: (dCp/R)(T_fus/T - 1 + ln(T/T_fus)), >= 0 below T_fus. */
export function dCpTerm(T: number, s: Fusion): number {
  if (!s.dCp) return 0;
  return (s.dCp / R_GAS) * (s.Tfus / T - 1 + Math.log(T / s.Tfus));
}

/** Least-squares straight line through (x, y). */
export function lineFit(rows: readonly (readonly [number, number])[]): { slope: number; intercept: number } {
  const n = rows.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of rows) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope, intercept: (sy - slope * sx) / n };
}

/** dCp = Cp(liquid) - Cp(crystal) at T, each from a straight line through its
 *  measured points, extrapolated to T (neither phase is measured AT T_fus). */
export function deltaCpAt(T: number, crystal: readonly (readonly [number, number])[],
  liquid: readonly (readonly [number, number])[]): { cpS: number; cpL: number; dCp: number } {
  const s = lineFit(crystal), l = lineFit(liquid);
  const cpS = s.intercept + s.slope * T, cpL = l.intercept + l.slope * T;
  return { cpS, cpL, dCp: cpL - cpS };
}

// ---- NRTL, the engine's loop ---------------------------------------------------

/** n-component NRTL parameters, row-major n x n (diagonals ignored). */
export interface NrtlMatrices { n: number; a: number[]; b: number[]; alpha: number[] }

/** ln gamma_i, transcribed from NRTL::gamma (src/thermo/activityCoefficient/NRTL.cpp). */
export function nrtlLnGamma(T: number, x: readonly number[], p: NrtlMatrices): number[] {
  const n = p.n;
  const tau = new Array<number>(n * n).fill(0);
  const G = new Array<number>(n * n).fill(1);
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < n; ++j) {
      if (i === j) { tau[i * n + j] = 0; G[i * n + j] = 1; continue; }
      const t = p.a[i * n + j]! + p.b[i * n + j]! / T;
      tau[i * n + j] = t;
      G[i * n + j] = Math.exp(-p.alpha[i * n + j]! * t);
    }
  }
  const S = new Array<number>(n).fill(0);
  const Ts = new Array<number>(n).fill(0);
  for (let j = 0; j < n; ++j) {
    let s = 0, t = 0;
    for (let k = 0; k < n; ++k) { s += G[k * n + j]! * x[k]!; t += tau[k * n + j]! * G[k * n + j]! * x[k]!; }
    S[j] = s; Ts[j] = t;
  }
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ++i) {
    const termA = S[i]! > 0 ? Ts[i]! / S[i]! : 0;
    let termB = 0;
    for (let j = 0; j < n; ++j) {
      if (S[j]! <= 0) continue;
      termB += (x[j]! * G[i * n + j]! / S[j]!) * (tau[i * n + j]! - Ts[j]! / S[j]!);
    }
    out[i] = termA + termB;
  }
  return out;
}

/** The binary pair this page fits: tau_12 = b12/T, tau_21 = b21/T (a = 0),
 *  one non-randomness alpha.  Component 1 is the SOLID (the solute). */
export interface BinaryPair { b12: number; b21: number; alpha: number }

export function pairMatrices(p: BinaryPair): NrtlMatrices {
  return { n: 2, a: [0, 0, 0, 0], b: [0, p.b12, p.b21, 0], alpha: [0, p.alpha, p.alpha, 0] };
}

export function lnGammaBinary(x1: number, T: number, p: BinaryPair): [number, number] {
  const g = nrtlLnGamma(T, [x1, 1 - x1], pairMatrices(p));
  return [g[0]!, g[1]!];
}

// ---- From a solubility to an activity coefficient ------------------------------

export interface GammaPoint { T: number; x1: number; lnXid: number; gamma1: number; lnGamma1: number }

/** Each measured solubility gives gamma1 at that (T, x1):
 *    gamma1 = x_id(T) / x1,   because x1 gamma1 = x_id at saturation. */
export function gammaFromSolubility(points: readonly { T: number; x1: number }[], s: Fusion,
  withCp = false): GammaPoint[] {
  return points.map(({ T, x1 }) => {
    const lnXid = lnIdealSolubility(T, s, withCp);
    const lnGamma1 = lnXid - Math.log(x1);
    return { T, x1, lnXid, gamma1: Math.exp(lnGamma1), lnGamma1 };
  });
}

// ---- The fit ---------------------------------------------------------------------

export interface FitResult {
  pair: BinaryPair;
  /** root-mean-square residual of ln gamma1 over the fitted points */
  rmsLnGamma: number;
  /** ln gamma1 residual (model - measured) per fitted point */
  residuals: number[];
  iterations: number;
}

function residualVector(g: readonly GammaPoint[], b12: number, b21: number, alpha: number): number[] {
  return g.map((p) => lnGammaBinary(p.x1, p.T, { b12, b21, alpha })[0] - p.lnGamma1);
}
const ssq = (r: readonly number[]) => r.reduce((s, v) => s + v * v, 0);

/** Levenberg-Marquardt on (b12, b21) from one start, central-difference
 *  Jacobian.  Deterministic. */
function lm(g: readonly GammaPoint[], alpha: number, start: [number, number]): { p: [number, number]; cost: number; it: number } {
  let p: [number, number] = [start[0], start[1]];
  let r = residualVector(g, p[0], p[1], alpha);
  let cost = ssq(r);
  let lambda = 1e-3;
  let it = 0;
  for (; it < 200; ++it) {
    const h = [1e-4 * Math.max(1, Math.abs(p[0])), 1e-4 * Math.max(1, Math.abs(p[1]))];
    const J: number[][] = g.map(() => [0, 0]);
    for (let k = 0; k < 2; ++k) {
      const up: number[] = [p[0], p[1]], dn: number[] = [p[0], p[1]];
      up[k] = up[k]! + h[k]!; dn[k] = dn[k]! - h[k]!;
      const ru = residualVector(g, up[0]!, up[1]!, alpha), rd = residualVector(g, dn[0]!, dn[1]!, alpha);
      for (let i = 0; i < g.length; ++i) J[i]![k] = (ru[i]! - rd[i]!) / (2 * h[k]!);
    }
    let a00 = 0, a01 = 0, a11 = 0, g0 = 0, g1 = 0;
    for (let i = 0; i < g.length; ++i) {
      const Ji = J[i]!, ri = r[i]!;
      a00 += Ji[0]! * Ji[0]!; a01 += Ji[0]! * Ji[1]!; a11 += Ji[1]! * Ji[1]!;
      g0 += Ji[0]! * ri; g1 += Ji[1]! * ri;
    }
    let accepted = false;
    for (let tries = 0; tries < 30 && !accepted; ++tries) {
      const m00 = a00 * (1 + lambda), m11 = a11 * (1 + lambda);
      const det = m00 * m11 - a01 * a01;
      if (!(Math.abs(det) > 0)) { lambda *= 10; continue; }
      const d0 = -(m11 * g0 - a01 * g1) / det, d1 = -(-a01 * g0 + m00 * g1) / det;
      const q: [number, number] = [p[0] + d0, p[1] + d1];
      const rq = residualVector(g, q[0], q[1], alpha);
      const cq = ssq(rq);
      if (Number.isFinite(cq) && cq < cost) {
        const rel = (cost - cq) / Math.max(cost, 1e-300);
        p = q; r = rq; cost = cq; lambda = Math.max(lambda / 10, 1e-12); accepted = true;
        if (rel < 1e-14) return { p, cost, it };
      } else {
        lambda *= 10;
      }
    }
    if (!accepted) break;
  }
  return { p, cost, it };
}

/** Fit (b12, b21) at fixed alpha to the measured ln gamma1: a grid of starts
 *  (b from -600 to 1800 K) and Levenberg-Marquardt from each; the lowest
 *  sum of squares wins.  Deterministic, so the page and the test agree. */
export function fitPair(g: readonly GammaPoint[], alpha = 0.3): FitResult {
  let best: { p: [number, number]; cost: number; it: number } | null = null;
  for (let s12 = -600; s12 <= 1800; s12 += 400) {
    for (let s21 = -600; s21 <= 1800; s21 += 400) {
      const r = lm(g, alpha, [s12, s21]);
      if (!best || r.cost < best.cost - 1e-15) best = r;
    }
  }
  const b = best!;
  const residuals = residualVector(g, b.p[0], b.p[1], alpha);
  return {
    pair: { b12: b.p[0], b21: b.p[1], alpha },
    rmsLnGamma: Math.sqrt(ssq(residuals) / g.length),
    residuals,
    iterations: b.it,
  };
}

// ---- Prediction ------------------------------------------------------------------

export interface SolubilityPrediction {
  x1: number;
  /** how many roots the saturation condition has in (0, 1): more than one
   *  means the fitted pair predicts a liquid-liquid split at this T */
  roots: number;
}

/** Solve x1 gamma1(x1, T) = x_id(T) for x1: the FIRST root met from the
 *  dilute side (the branch the data measured), found on a log grid and
 *  refined by bisection; the number of roots is returned beside it. */
export function predictSolubility(T: number, pair: BinaryPair, s: Fusion, withCp = false): SolubilityPrediction {
  const lnXid = lnIdealSolubility(T, s, withCp);
  const f = (x: number) => Math.log(x) + lnGammaBinary(x, T, pair)[0] - lnXid;
  const grid: number[] = [];
  for (let k = 0; k <= 400; ++k) grid.push(Math.exp(Math.log(1e-8) * (1 - k / 400)));   // 1e-8 .. 1
  grid[grid.length - 1] = 1 - 1e-12;
  let first = NaN, roots = 0;
  let fa = f(grid[0]!);
  for (let k = 1; k < grid.length; ++k) {
    const fb = f(grid[k]!);
    if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb <= 0) {
      roots++;
      if (Number.isNaN(first)) first = bisect(f, grid[k - 1]!, grid[k]!);
    }
    fa = fb;
  }
  return { x1: first, roots };
}

/** The saturation temperature of a liquid of composition x1: solve
 *  ln x1 + ln gamma1(x1, T) = ln x_id(T) for T in (lo, T_fus). */
export function saturationTemperature(x1: number, pair: BinaryPair | null, s: Fusion,
  lo = 150): number {
  const f = (T: number) => Math.log(x1) + (pair ? lnGammaBinary(x1, T, pair)[0] : 0)
    - lnIdealSolubility(T, s);
  const hi = s.Tfus - 1e-9;
  if (f(lo) * f(hi) > 0) return NaN;
  return bisect(f, lo, hi);
}

/** The saturation temperature of composition x1 READ FROM THE MEASUREMENTS:
 *  linear interpolation of ln x against 1/T between the two measured points
 *  that bracket x1 (the coordinates in which the ideal law is a straight
 *  line).  NaN when no pair of neighbours brackets x1. */
export function measuredSaturationTemperature(points: readonly { T: number; x1: number }[],
  x1: number): number {
  const s = [...points].sort((p, q) => p.T - q.T);
  for (let k = 1; k < s.length; ++k) {
    const a = s[k - 1]!, b = s[k]!;
    if ((a.x1 - x1) * (b.x1 - x1) <= 0 && a.x1 !== b.x1) {
      const f = (Math.log(x1) - Math.log(a.x1)) / (Math.log(b.x1) - Math.log(a.x1));
      const invT = 1 / a.T + f * (1 / b.T - 1 / a.T);
      return 1 / invT;
    }
  }
  return NaN;
}

function bisect(f: (v: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let k = 0; k < 200; ++k) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if (fa * fm <= 0) { b = m; } else { a = m; fa = fm; }
    if (Math.abs(b - a) <= 1e-15 * Math.max(1, Math.abs(m))) break;
  }
  return 0.5 * (a + b);
}

// ---- Held out, and the valley -----------------------------------------------------

/** Every `every`-th point (the 4th, 8th, ...) is HELD OUT. */
export function splitHeldOut<T>(points: readonly T[], every = 4): { train: T[]; held: T[] } {
  const train: T[] = [], held: T[] = [];
  points.forEach((p, i) => ((i + 1) % every === 0 ? held : train).push(p));
  return { train, held };
}

export interface PointCheck { T: number; x1: number; predicted: number; relDev: number }

/** The fitted pair's predicted solubility at each measured T, against the
 *  measurement: relative deviation (predicted - measured)/measured. */
export function checkPoints(points: readonly { T: number; x1: number }[], pair: BinaryPair,
  s: Fusion, withCp = false): PointCheck[] {
  return points.map(({ T, x1 }) => {
    const predicted = predictSolubility(T, pair, s, withCp).x1;
    return { T, x1, predicted, relDev: (predicted - x1) / x1 };
  });
}

export const aard = (c: readonly PointCheck[]) =>
  c.reduce((s, p) => s + Math.abs(p.relDev), 0) / Math.max(1, c.length);
