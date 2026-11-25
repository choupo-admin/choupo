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
  gp.ts -- the pure mathematics of the Bayesian-optimisation card.  No React,
  no DOM, no engine: numbers in, numbers out, so a test can hold every formula
  against a value computed by hand.

  WRITTEN FROM THE PUBLISHED SOURCES ONLY:
    * Gaussian-process regression: Rasmussen & Williams (2006), GPML, Algorithm
      2.1 (p. 19) and eqs. (2.25), (2.26) (p. 17); the squared-exponential
      covariance of eq. (2.31).  Cholesky factorisation as in the Algorithm.
    * Expected improvement: Jones, Schonlau & Welch (1998), J. Global
      Optimization 13, 455-492, eqs. (14) and (15).
    * The gradient method is a SKETCH, ours: central finite differences, a
      one-variable secant (BFGS) update and Armijo backtracking.  It is not
      the engine's `sqp` and says so on the card.

  EVERYTHING IS ONE-DIMENSIONAL on x in [0, 1], because the point is to SEE the
  posterior; the card says what that hides.

  THE PRIOR MEAN is zero in GPML.  The card subtracts the mean of the
  observations (`offset`) before conditioning and adds it back, a declared
  choice that keeps the band from collapsing toward 0 far from the data.
\*---------------------------------------------------------------------------*/

/** Squared-exponential covariance, GPML eq. (2.31) without the noise term:
 *  k(x, x') = sf2 * exp(-(x - x')^2 / (2 ell^2)). */
export function rbf(a: number, b: number, ell: number, sf2: number): number {
  const d = a - b;
  return sf2 * Math.exp(-(d * d) / (2 * ell * ell));
}

export interface GpOptions {
  /** Length scale \ell. */
  ell: number;
  /** Signal variance \sigma_f^2. */
  sf2: number;
  /** Noise variance \sigma_n^2 added to the diagonal of K. */
  noise2: number;
  /** Subtracted from y before conditioning, added back to the mean. */
  offset?: number;
}

export interface GpFit extends Required<GpOptions> {
  X: readonly number[];
  /** Lower Cholesky factor of K + sigma_n^2 I (Algorithm 2.1, line 2). */
  L: number[][];
  /** alpha = L^T \ (L \ (y - offset))  (line 3). */
  alpha: number[];
}

/** Lower Cholesky factor of a symmetric positive-definite matrix. */
export function cholesky(A: readonly (readonly number[])[]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (!(s > 0)) throw new Error("matrix not positive definite: raise the noise or the length scale");
        L[i]![j] = Math.sqrt(s);
      } else {
        L[i]![j] = s / L[j]![j]!;
      }
    }
  }
  return L;
}

/** Solve L z = b, L lower triangular (the `L \ b` of the Algorithm). */
export function solveLower(L: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const z = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i]![k]! * z[k]!;
    z[i] = s / L[i]![i]!;
  }
  return z;
}

/** Solve L^T z = b. */
export function solveUpper(L: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const z = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k]![i]! * z[k]!;
    z[i] = s / L[i]![i]!;
  }
  return z;
}

/** Algorithm 2.1, lines 2-3: factorise K + sigma_n^2 I and form alpha. */
export function fitGp(X: readonly number[], y: readonly number[], o: GpOptions): GpFit {
  if (X.length !== y.length || X.length === 0) {
    throw new Error("fitGp: X and y must be the same non-zero length");
  }
  const offset = o.offset ?? 0;
  const K = X.map((a, i) => X.map((b, j) => rbf(a, b, o.ell, o.sf2) + (i === j ? o.noise2 : 0)));
  const L = cholesky(K);
  const alpha = solveUpper(L, solveLower(L, y.map((v) => v - offset)));
  return { X, L, alpha, ell: o.ell, sf2: o.sf2, noise2: o.noise2, offset };
}

/** Algorithm 2.1, lines 4-6: predictive mean (eq. 2.25) and variance
 *  (eq. 2.26) of the LATENT function at x*.  The variance is that of f, not of
 *  a new noisy observation (that would add sigma_n^2). */
export function predict(fit: GpFit, xs: number): { mean: number; variance: number } {
  const kStar = fit.X.map((a) => rbf(a, xs, fit.ell, fit.sf2));
  let mean = 0;
  for (let i = 0; i < kStar.length; i++) mean += kStar[i]! * fit.alpha[i]!;
  const v = solveLower(fit.L, kStar);
  let vv = 0;
  for (const t of v) vv += t * t;
  return { mean: fit.offset + mean, variance: Math.max(0, rbf(xs, xs, fit.ell, fit.sf2) - vv) };
}

// ---- the normal distribution -------------------------------------------------

/** Standard normal density. */
export function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** erf by the all-positive-terms series erf(x) = 2/sqrt(pi) e^{-x^2}
 *  sum_n 2^n x^{2n+1} / (1 3 5 ... (2n+1)): no cancellation; |x| <= 6.5. */
function erf(x: number): number {
  const ax = Math.abs(x);
  if (ax > 6.5) return Math.sign(x);
  let term = ax, sum = ax;
  for (let n = 1; n < 400; n++) {
    term *= (2 * ax * ax) / (2 * n + 1);
    sum += term;
    if (term < 1e-17 * sum) break;
  }
  return Math.sign(x) * (2 / Math.sqrt(Math.PI)) * Math.exp(-ax * ax) * sum;
}

/** Standard normal cumulative distribution. */
export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Jones, Schonlau & Welch (1998) eq. (15), for MINIMISATION:
 *  E[I] = (fmin - mu) Phi(u) + s phi(u),  u = (fmin - mu)/s.
 *  s is the standard deviation, not the variance.  s = 0 gives 0 (the
 *  paper notes EI is zero at sampled points). */
export function expectedImprovement(mu: number, s: number, fmin: number): number {
  if (!(s > 0)) return 0;
  const u = (fmin - mu) / s;
  return (fmin - mu) * normCdf(u) + s * normPdf(u);
}

// ---- the two test functions on x in [0, 1] -----------------------------------

export type SettingId = "smooth" | "narrowDip";

/** A smooth function with several valleys. */
export function fSmooth(x: number): number {
  return Math.sin(7 * x) + 0.5 * Math.sin(17 * x) + 0.8 * (x - 0.55) * (x - 0.55);
}

/** Position, depth and width of the narrow dip of `fNarrowDip`. */
export const DIP = { at: 0.35, depth: 2.2, sigma: 0.015 } as const;

/** A gentle slow wave with one narrow dip, deeper than anything else. */
export function fNarrowDip(x: number): number {
  const z = (x - DIP.at) / DIP.sigma;
  return 0.35 * Math.sin(6 * x) + 0.2 * x - DIP.depth * Math.exp(-0.5 * z * z);
}

export interface Setting {
  id: SettingId;
  label: string;
  f: (x: number) => number;
  /** The starting design: evaluations made before the loop begins. */
  initial: readonly number[];
  /** Length scale the card starts at. */
  ell: number;
  /** Where the gradient method starts (one of the initial points). */
  gradientStart: number;
}

export const SETTINGS: readonly Setting[] = [
  { id: "smooth", label: "Smooth, several valleys", f: fSmooth,
    initial: [0.1, 0.5, 0.9], ell: 0.15, gradientStart: 0.5 },
  { id: "narrowDip", label: "Narrow dip (the honest failure)", f: fNarrowDip,
    initial: [0.05, 0.2, 0.5, 0.7, 0.95], ell: 0.25, gradientStart: 0.5 },
];

/** The minimum of f over a fine grid: where the TRUE answer is, shown to the
 *  student and never read by the optimiser. */
export function gridMinimum(f: (x: number) => number, n = 4001): { x: number; f: number } {
  let bx = 0, bf = Infinity;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const v = f(x);
    if (v < bf) { bf = v; bx = x; }
  }
  return { x: bx, f: bf };
}

// ---- one Bayesian-optimisation step ------------------------------------------

export interface BoState { X: number[]; y: number[]; }

export function boFit(s: BoState, ell: number, noise2: number, sf2 = 1): GpFit {
  const offset = s.y.reduce((a, b) => a + b, 0) / s.y.length;
  return fitGp(s.X, s.y, { ell, sf2, noise2, offset });
}

export const GRID = 801;

/** The grid point with the largest expected improvement that is not within
 *  1e-3 of an evaluated point.  When EI is zero everywhere the most uncertain
 *  grid point is taken instead (a pure exploration step, announced by the
 *  card). */
export function nextPoint(s: BoState, ell: number, noise2: number):
  { x: number; ei: number; exploration: boolean } {
  const fit = boFit(s, ell, noise2);
  const fmin = Math.min(...s.y);
  let bx = 0, be = -1, vx = 0, bv = -1;
  for (let i = 0; i < GRID; i++) {
    const x = i / (GRID - 1);
    if (s.X.some((a) => Math.abs(a - x) < 1e-3)) continue;
    const p = predict(fit, x);
    const ei = expectedImprovement(p.mean, Math.sqrt(p.variance), fmin);
    if (ei > be) { be = ei; bx = x; }
    if (p.variance > bv) { bv = p.variance; vx = x; }
  }
  return be > 1e-12 ? { x: bx, ei: be, exploration: false }
    : { x: vx, ei: 0, exploration: true };
}

// ---- the gradient method: a SKETCH -------------------------------------------

export interface EvalRecord { x: number; f: number; }

/** A one-variable quasi-Newton run, SKETCHED: central differences with
 *  h = 1e-4 (two evaluations per gradient per variable), the one-variable BFGS
 *  (secant) curvature update, and Armijo backtracking, started at x0 and kept
 *  inside [0, 1].  Every call of f is logged, because the count is the lesson.
 *  Stops at `budget` evaluations or when |g| < 1e-3. */
export function gradientRun(f: (x: number) => number, x0: number, budget = 120): EvalRecord[] {
  const log: EvalRecord[] = [];
  class Done extends Error {}
  const ev = (x: number): number => {
    if (log.length >= budget) throw new Done();
    const v = f(x);
    log.push({ x, f: v });
    return v;
  };
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const h = 1e-4;
  const grad = (x: number): number => {
    const a = clamp(x - h), b = clamp(x + h);
    return (ev(b) - ev(a)) / (b - a);
  };
  try {
    let x = x0;
    let fx = ev(x);
    let g = grad(x);
    let H = Math.min(1, 0.1 / Math.max(Math.abs(g), 1e-12));
    for (let it = 0; it < 100 && Math.abs(g) > 1e-3; it++) {
      let t = 1, xn = x, fn = fx;
      let ok = false;
      for (let k = 0; k < 8; k++) {
        xn = clamp(x - t * H * g);
        fn = ev(xn);
        if (fn <= fx + 1e-4 * g * (xn - x)) { ok = true; break; }
        t *= 0.5;
      }
      if (!ok) break;
      const gn = grad(xn);
      const s = xn - x, yv = gn - g;
      if (s * yv > 1e-10) H = s / yv;
      x = xn; fx = fn; g = gn;
    }
  } catch (e) {
    if (!(e instanceof Done)) throw e;
  }
  return log;
}

/** Best f among the first n records of a log (Infinity for n = 0). */
export function bestAfter(log: readonly EvalRecord[], n: number): number {
  let b = Infinity;
  for (let i = 0; i < Math.min(n, log.length); i++) b = Math.min(b, log[i]!.f);
  return b;
}
