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
  chromatography -- the PAGE's arithmetic behind the chromatography EduTool,
  and the case it hands the ENGINE.

  THE SPLIT, stated once because the page states it too:

    * the ENGINE (choupoBatch, `fixedBedAdsorber`) runs the LINEAR pulse: a
      gas-phase bed fed a short injection of two solutes on a linear (Henry)
      teaching sorbent, the feed switched back to pure carrier by a recipe.
      The page writes that case (chromCaseFiles) and reads the outlet
      histories back (readEnginePeaks).  Nothing here re-derives a number the
      engine prints.
    * the PAGE (this file) carries the closed forms a student can redo by
      hand -- the retention time, the moments of a linear pulse, the plate
      model, the van Deemter curve, the resolution and the cut arithmetic --
      and its OWN integration of the same column equations for what the
      engine cannot be asked (a Langmuir pulse at high load, swept): an
      explicit finite-volume solver with a MUSCL face reconstruction
      (solveColumn).  Its tests hold it to the closed forms in the linear
      limit, to its own mass ledger, and to itself on a finer grid.

  The column equations are the engine's own (FixedBedAdsorber.H, superficial
  basis, c in mol per m3 of fluid, q in mol per kg of adsorbent):

      eps dc/dt + rho_b dq/dt = -u dc/dz + Dax d2c/dz2
      dq/dt = k (q*(c) - q)

  so the interstitial dispersion coefficient is Dax/eps and the interstitial
  velocity v = u/eps.  The design record is
  docs/design/chromatography-peaks-and-resolution.md.
\*---------------------------------------------------------------------------*/

export const R_GAS = 8.314462618;   // J/(mol K)

// ---- the column, the retention ---------------------------------------------

export interface Column {
  /** bed length [m] */ L: number;
  /** interparticle void fraction [-] */ eps: number;
  /** superficial velocity [m/s] */ u: number;
  /** bulk density of the packing [kg per m3 of bed] */ rhoB: number;
  /** cross-section [m2] */ area: number;
  /** temperature [K] */ T: number;
  /** pressure [bar] */ P_bar: number;
}

/** The linear-isotherm slope on the concentration basis, K_c = dq/dc at
 *  c -> 0 [m3 of fluid per kg of adsorbent], from a Henry constant H written
 *  per bar of partial pressure (q = H p, the engine's `henry` record):
 *  p[bar] = c R T / 1e5. */
export function henryKc(H_molPerKgBar: number, T: number): number {
  return H_molPerKgBar * R_GAS * T / 1e5;
}

export interface Retention {
  /** interstitial velocity u/eps [m/s] */ v: number;
  /** time an unretained molecule takes, L/v [s] */ t0: number;
  /** retention (capacity) factor rho_b K_c / eps [-] */ kprime: number;
  /** retention time t0 (1 + k') [s] */ tR: number;
}

export function retention(col: Column, Kc: number): Retention {
  const v = col.u / col.eps;
  const t0 = col.L / v;
  const kprime = col.rhoB * Kc / col.eps;
  return { v, t0, kprime, tR: t0 * (1 + kprime) };
}

// ---- dispersion and the van Deemter curve -----------------------------------

export interface DispersionInputs {
  /** particle diameter [m] */ dp: number;
  /** molecular diffusivity of the solute in the mobile phase [m2/s] */ Dm: number;
  /** tortuosity factor of the axial-diffusion term [-] */ gamma: number;
  /** eddy-dispersion factor, D_L = gamma Dm + lambda dp v [-] */ lambda: number;
}

/** The declared axial dispersion coefficient on the engine's (superficial)
 *  basis: Dax = eps D_L, with D_L = gamma Dm + lambda dp v the interstitial
 *  one at interstitial velocity v. */
export function daxFrom(eps: number, d: DispersionInputs, v: number): number {
  return eps * (d.gamma * d.Dm + d.lambda * d.dp * v);
}

export interface VanDeemter {
  /** eddy term [m] */ A: number;
  /** axial-diffusion coefficient [m2/s] */ B: number;
  /** mass-transfer coefficient [s] */ C: number;
  /** velocity of the smallest plate height, sqrt(B/C) [m/s] */ vOpt: number;
  /** smallest plate height, A + 2 sqrt(BC) [m] */ Hmin: number;
}

/** H(v) = A + B/v + C v on the INTERSTITIAL velocity v, with the three terms
 *  written from the bed parameters (derivation in the design record, s 3):
 *  A = 2 lambda dp, B = 2 gamma Dm, C = 2 k' / (k (1 + k')^2). */
export function vanDeemter(d: DispersionInputs, kLDF: number, kprime: number): VanDeemter {
  const A = 2 * d.lambda * d.dp;
  const B = 2 * d.gamma * d.Dm;
  const C = 2 * kprime / (kLDF * (1 + kprime) ** 2);
  return { A, B, C, vOpt: Math.sqrt(B / C), Hmin: A + 2 * Math.sqrt(B * C) };
}

export const plateHeight = (vd: VanDeemter, v: number): number => vd.A + vd.B / v + vd.C * v;

// ---- the moments of a linear pulse ------------------------------------------

export interface PulseMoments {
  /** first moment of the outlet peak [s] */ mu1: number;
  /** contributions to its variance [s2] */
  varDispersion: number;
  varGrid: number;
  varLdf: number;
  varInjection: number;
  /** their sum [s2] */ variance: number;
  /** Peclet number on the interstitial basis, v L / (D + D_grid) [-] */ Pe: number;
}

/** Moments of the outlet peak of a rectangular injection of length tInj into a
 *  linear column, for the equations above with closed (Danckwerts)
 *  boundaries.  `dzUpwind`, when given, adds the numerical dispersion of a
 *  first-order upwind grid, v dz / 2 -- the engine's scheme -- to the
 *  physical one.  Derivation in the design record, s 2:
 *
 *    mu1      = L (1 + k') / v + tInj/2
 *    variance = (2/Pe - 2 (1 - e^-Pe)/Pe^2) (L (1+k')/v)^2   dispersion
 *             + 2 k' L / (v k)                                LDF
 *             + tInj^2 / 12                                    injection
 */
export function linearPulseMoments(col: Column, Kc: number, kLDF: number, Dax: number,
  tInj: number, dzUpwind?: number): PulseMoments {
  const r = retention(col, Kc);
  const D = Dax / col.eps;
  const Dgrid = dzUpwind ? r.v * dzUpwind / 2 : 0;
  const Dtot = D + Dgrid;
  const tau = col.L * (1 + r.kprime) / r.v;
  const Pe = Dtot > 0 ? r.v * col.L / Dtot : Infinity;
  const closed = Number.isFinite(Pe) ? 2 / Pe - 2 * (1 - Math.exp(-Pe)) / (Pe * Pe) : 0;
  const varDispTot = closed * tau * tau;
  //  Split the dispersion part in proportion to the two coefficients (exact to
  //  first order in 1/Pe; the closed-boundary correction is shared).
  const varDispersion = Dtot > 0 ? varDispTot * D / Dtot : 0;
  const varGrid = Dtot > 0 ? varDispTot * Dgrid / Dtot : 0;
  const varLdf = kLDF > 0 ? 2 * r.kprime * col.L / (r.v * kLDF) : 0;
  const varInjection = tInj * tInj / 12;
  return {
    mu1: tau + tInj / 2,
    varDispersion, varGrid, varLdf, varInjection,
    variance: varDispersion + varGrid + varLdf + varInjection,
    Pe,
  };
}

/** Zeroth, first and central second moment of a sampled curve, by the
 *  trapezoidal rule. */
export function sampledMoments(t: readonly number[], c: readonly number[]):
  { m0: number; mu1: number; variance: number } {
  let m0 = 0, m1 = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i]! - t[i - 1]!;
    m0 += dt * (c[i]! + c[i - 1]!) / 2;
    m1 += dt * (t[i]! * c[i]! + t[i - 1]! * c[i - 1]!) / 2;
  }
  const mu1 = m1 / m0;
  let m2 = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i]! - t[i - 1]!;
    const a = (t[i]! - mu1) ** 2 * c[i]!, b = (t[i - 1]! - mu1) ** 2 * c[i - 1]!;
    m2 += dt * (a + b) / 2;
  }
  return { m0, mu1, variance: m2 / m0 };
}

// ---- the plate model and the Gaussian ---------------------------------------

/** ln Gamma(x), x > 0 (Lanczos, g = 7, nine coefficients). */
export function lnGamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The outlet of N equal stirred plates in series after a unit pulse, with
 *  mean tR: the gamma (Erlang, for whole N) density
 *  (N/tR)^N t^(N-1) e^(-N t/tR) / Gamma(N), normalised to unit area. */
export function platePeak(t: number, tR: number, N: number): number {
  if (t <= 0) return 0;
  const lnf = N * Math.log(N / tR) + (N - 1) * Math.log(t) - N * t / tR - lnGamma(N);
  return Math.exp(lnf);
}

/** A Gaussian of unit area. */
export function gaussian(t: number, tR: number, sigma: number): number {
  return Math.exp(-0.5 * ((t - tR) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

/** erf(x), Abramowitz & Stegun 7.1.26 replaced by a series/continued
 *  fraction pair accurate to ~1e-14 (used for the Gaussian cut fractions). */
export function erf(x: number): number {
  const s = Math.sign(x), a = Math.abs(x);
  if (a < 2.5) {
    // Maclaurin series
    let sum = a, term = a;
    for (let n = 1; n < 80; n++) {
      term *= -a * a / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return s * 2 / Math.sqrt(Math.PI) * sum;
  }
  // erfc continued fraction (Lentz)
  let f = a, C = a, D = 0;
  for (let n = 1; n < 200; n++) {
    const an = n / 2;
    D = a + an * D; D = 1 / D;
    C = a + an / C;
    const del = C * D;
    f *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  const erfc = Math.exp(-a * a) / Math.sqrt(Math.PI) / f;
  return s * (1 - erfc);
}

/** Fraction of a Gaussian (tR, sigma) eluted before t. */
export const gaussCdf = (t: number, tR: number, sigma: number): number =>
  0.5 * (1 + erf((t - tR) / (sigma * Math.SQRT2)));

// ---- two peaks: resolution, purity, recovery --------------------------------

/** R_s = (t2 - t1) / (2 (sigma1 + sigma2)): the base widths taken as 4 sigma. */
export function resolution(t1: number, s1: number, t2: number, s2: number): number {
  return (t2 - t1) / (2 * (s1 + s2));
}

/** The fundamental resolution equation, (sqrt(N)/4) ((alpha-1)/alpha)
 *  (k2/(1+k2)), with N the plate count of the later peak. */
export function resolutionFundamental(N: number, alpha: number, k2: number): number {
  return Math.sqrt(N) / 4 * ((alpha - 1) / alpha) * (k2 / (1 + k2));
}

export interface CutResult {
  /** first fraction, t < tCut: purity in solute 1, and the share of 1 recovered */
  first: { purity: number; recovery: number };
  /** second fraction, t > tCut: purity in solute 2, and the share of 2 recovered */
  second: { purity: number; recovery: number };
}

/** One cut at tCut between two Gaussian peaks of areas a1, a2. */
export function gaussianCut(tCut: number, p1: { tR: number; sigma: number; area: number },
  p2: { tR: number; sigma: number; area: number }): CutResult {
  const f1 = gaussCdf(tCut, p1.tR, p1.sigma), f2 = gaussCdf(tCut, p2.tR, p2.sigma);
  const m11 = p1.area * f1, m21 = p2.area * f2;
  const m12 = p1.area * (1 - f1), m22 = p2.area * (1 - f2);
  return {
    first: { purity: m11 / (m11 + m21), recovery: f1 },
    second: { purity: m22 / (m12 + m22), recovery: 1 - f2 },
  };
}

/** Cumulative trapezoidal integral of c over t. */
export function cumulative(t: readonly number[], c: readonly number[]): number[] {
  const out = [0];
  for (let i = 1; i < t.length; i++)
    out.push(out[i - 1]! + (t[i]! - t[i - 1]!) * (c[i]! + c[i - 1]!) / 2);
  return out;
}

function interp(t: readonly number[], y: readonly number[], x: number): number {
  if (x <= t[0]!) return y[0]!;
  if (x >= t[t.length - 1]!) return y[y.length - 1]!;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m]! <= x) lo = m; else hi = m; }
  const w = (x - t[lo]!) / (t[hi]! - t[lo]!);
  return y[lo]! + w * (y[hi]! - y[lo]!);
}

/** One cut at tCut on two SAMPLED outlet histories (any shape). */
export function sampledCut(t: readonly number[], c1: readonly number[], c2: readonly number[],
  tCut: number): CutResult {
  const C1 = cumulative(t, c1), C2 = cumulative(t, c2);
  const a1 = C1[C1.length - 1]!, a2 = C2[C2.length - 1]!;
  const m11 = interp(t, C1, tCut), m21 = interp(t, C2, tCut);
  const m12 = a1 - m11, m22 = a2 - m21;
  return {
    first: { purity: m11 / (m11 + m21 || 1), recovery: m11 / a1 },
    second: { purity: m22 / (m12 + m22 || 1), recovery: m22 / a2 },
  };
}

export interface TargetCuts {
  /** latest cut that keeps the first fraction at the target purity, or null */
  t1: number | null;
  recovery1: number;
  /** earliest cut that keeps the second fraction at the target purity, or null */
  t2: number | null;
  recovery2: number;
}

/** The two cuts a purity target allows: the first product is collected from
 *  the start to t1, the second from t2 to the end, and anything between is
 *  neither (recycled or discarded).  Found by scanning the sampled history. */
export function cutsForPurity(t: readonly number[], c1: readonly number[], c2: readonly number[],
  target: number): TargetCuts {
  const C1 = cumulative(t, c1), C2 = cumulative(t, c2);
  const a1 = C1[C1.length - 1]!, a2 = C2[C2.length - 1]!;
  let t1: number | null = null, rec1 = 0;
  for (let i = 1; i < t.length; i++) {
    const m1 = C1[i]!, m2 = C2[i]!;
    if (m1 <= 0) continue;
    if (m1 / (m1 + m2) >= target && m1 / a1 > rec1) { t1 = t[i]!; rec1 = m1 / a1; }
  }
  let t2: number | null = null, rec2 = 0;
  for (let i = t.length - 2; i >= 0; i--) {
    const m2 = a2 - C2[i]!, m1 = a1 - C1[i]!;
    if (m2 <= 0) continue;
    if (m2 / (m1 + m2) >= target && m2 / a2 > rec2) { t2 = t[i]!; rec2 = m2 / a2; }
  }
  return { t1, recovery1: rec1, t2, recovery2: rec2 };
}

// ---- the page's own column solver -------------------------------------------

export type IsothermForm =
  | { kind: "linear" }
  /** q*_i = K_c,i c_i / (1 + sum_j b_j c_j), b_j = K_c,j / q_s (competitive)
   *  or / (1 + b_i c_i) (each solute alone) */
  | { kind: "langmuir"; qs: number; competitive: boolean };

export interface SolveOptions {
  col: Column;
  /** K_c per solute [m3/kg] */ Kc: readonly number[];
  /** LDF coefficient per solute [1/s] */ k: readonly number[];
  /** axial dispersion, superficial basis [m2/s] */ Dax: number;
  isotherm: IsothermForm;
  /** injected concentration per solute [mol/m3] */ cInj: readonly number[];
  /** injection length [s] */ tInj: number;
  /** end of the run [s] */ tEnd: number;
  /** cells */ N: number;
  /** face reconstruction: second-order MUSCL (van Leer limiter) or the
   *  engine's first-order upwind */
  scheme?: "muscl" | "upwind";
  /** outlet samples kept (approximately) */ nOut?: number;
}

export interface SolveResult {
  t: number[];
  /** outlet concentration per solute, c at the last cell [mol/m3] */ c: number[][];
  /** mol fed, mol out, mol left in the bed per solute, over the area */
  fed: number[]; out: number[]; held: number[];
  /** (fed - out - held) / fed per solute */ closure: number[];
  dt: number; steps: number;
}

/** Integrate the column equations for a rectangular injection.  Explicit
 *  second-order SSP Runge-Kutta (Heun) on a finite-volume grid of N equal
 *  cells: the inlet face carries exactly u c_in (Danckwerts), interior faces
 *  carry u c_face - Dax dc/dz, the outlet face carries u c_N.  The mass
 *  ledger (fed, out) is integrated with the same stages, so the closure is
 *  telescopic: it is round-off, not a tolerance.  The inlet is held at its
 *  value at the start of each step, and tInj falls on a step boundary, so
 *  exactly u A c_inj tInj is fed.  The step is 1 / (2v/dz + 4D/dz^2 +
 *  max k(1+k')), the Gershgorin bound the engine prints for its own explicit
 *  route, which also keeps the MUSCL Courant number below one half. */
export function solveColumn(o: SolveOptions): SolveResult {
  const run = startColumn(o);
  while (!run.advance(Infinity));
  return run.result();
}

/** The same integration, resumable: `advance(n)` takes up to n steps and
 *  says whether the run is finished, so a page can spread the work over
 *  several frames instead of holding the browser. */
export interface ColumnRun {
  advance(maxSteps: number): boolean;
  result(): SolveResult;
  /** steps taken so far, and in all */
  readonly progress: { done: number; total: number };
}

export function startColumn(o: SolveOptions): ColumnRun {
  const { col, Kc, k, Dax, isotherm, cInj, tInj, tEnd, N } = o;
  const nc = Kc.length;
  const muscl = (o.scheme ?? "muscl") === "muscl";
  const dz = col.L / N, u = col.u, eps = col.eps, rhoB = col.rhoB;
  const v = u / eps, D = Dax / eps;
  let kmax = 0;
  for (let a = 0; a < nc; a++) kmax = Math.max(kmax, k[a]! * (1 + rhoB * Kc[a]! / eps));
  const lam = 2 * v / dz + 4 * D / (dz * dz) + kmax;
  let dt = 1 / lam;
  const nInj = Math.max(1, Math.ceil(tInj / dt));
  dt = tInj / nInj;
  const steps = Math.ceil(tEnd / dt);
  const stride = Math.max(1, Math.floor(steps / (o.nOut ?? 1500)));
  const linear = isotherm.kind === "linear";
  const competitive = isotherm.kind === "langmuir" && isotherm.competitive;
  const bArr = new Float64Array(nc);
  for (let a = 0; a < nc; a++) bArr[a] = isotherm.kind === "langmuir" ? Kc[a]! / isotherm.qs : 0;
  const KcA = Float64Array.from(Kc), kA = Float64Array.from(k);

  const size = nc * N;
  const c = new Float64Array(size), q = new Float64Array(size);
  const c1 = new Float64Array(size), q1 = new Float64Array(size);
  const dc0 = new Float64Array(size), dq0 = new Float64Array(size);
  const dc1 = new Float64Array(size), dq1 = new Float64Array(size);
  const flux = new Float64Array(N + 1);
  const den = new Float64Array(N);
  const fed = new Float64Array(nc), out = new Float64Array(nc);
  const cinNow = new Float64Array(nc);
  const ddz = 1 / dz, Ddz = Dax / dz;

  const rhs = (cc: Float64Array, qq: Float64Array, dc: Float64Array, dq: Float64Array): void => {
    if (competitive) {
      for (let j = 0; j < N; j++) den[j] = 1;
      for (let a = 0; a < nc; a++) {
        const b = bArr[a]!, base = a * N;
        for (let j = 0; j < N; j++) { const x = cc[base + j]!; if (x > 0) den[j] = den[j]! + b * x; }
      }
    }
    for (let a = 0; a < nc; a++) {
      const base = a * N, K = KcA[a]!, ka = kA[a]!, b = bArr[a]!;
      for (let j = 0; j < N; j++) {
        const x = cc[base + j]!;
        let qs: number;
        if (linear) qs = K * x;
        else if (competitive) qs = K * x / den[j]!;
        else qs = K * x / (1 + (x > 0 ? b * x : 0));
        dq[base + j] = ka * (qs - qq[base + j]!);
      }
      flux[0] = u * cinNow[a]!;
      for (let f = 1; f < N; f++) {
        const iL = base + f - 1;
        let cf = cc[iL]!;
        if (muscl && f >= 2) {
          const d1 = cc[iL]! - cc[iL - 1]!, d2 = cc[iL + 1]! - cc[iL]!;
          if (d1 * d2 > 0) cf += d1 * d2 / (d1 + d2);
        }
        flux[f] = u * cf - Ddz * (cc[iL + 1]! - cc[iL]!);
      }
      flux[N] = u * cc[base + N - 1]!;
      for (let j = 0; j < N; j++)
        dc[base + j] = ((flux[j]! - flux[j + 1]!) * ddz - rhoB * dq[base + j]!) / eps;
    }
  };

  const tOut: number[] = [0];
  const cOut: number[][] = Array.from({ length: nc }, () => [0]);
  let s = 0;
  const progress = { done: 0, total: steps };
  const advance = (maxSteps: number): boolean => {
  const stop = Math.min(steps, s + maxSteps);
  for (; s < stop; s++) {
    for (let a = 0; a < nc; a++) cinNow[a] = s < nInj ? cInj[a]! : 0;
    rhs(c, q, dc0, dq0);
    for (let i = 0; i < size; i++) { c1[i] = c[i]! + dt * dc0[i]!; q1[i] = q[i]! + dt * dq0[i]!; }
    rhs(c1, q1, dc1, dq1);
    for (let a = 0; a < nc; a++) {
      fed[a] = fed[a]! + dt * u * cinNow[a]! * col.area;
      out[a] = out[a]! + dt * u * 0.5 * (c[a * N + N - 1]! + c1[a * N + N - 1]!) * col.area;
    }
    const h = 0.5 * dt;
    for (let i = 0; i < size; i++) {
      c[i] = c[i]! + h * (dc0[i]! + dc1[i]!);
      q[i] = q[i]! + h * (dq0[i]! + dq1[i]!);
    }
    if ((s + 1) % stride === 0 || s === steps - 1) {
      tOut.push((s + 1) * dt);
      for (let a = 0; a < nc; a++) cOut[a]!.push(c[a * N + N - 1]!);
    }
  }
  progress.done = s;
  return s >= steps;
  };
  const result = (): SolveResult => {
  const held = new Array<number>(nc).fill(0);
  for (let a = 0; a < nc; a++) {
    let hsum = 0;
    for (let j = 0; j < N; j++) hsum += eps * c[a * N + j]! + rhoB * q[a * N + j]!;
    held[a] = hsum * dz * col.area;
  }
  const closure = Array.from(fed, (f, a) => (f - out[a]! - held[a]!) / f);
  return { t: tOut.slice(), c: cOut.map((x) => x.slice()), fed: Array.from(fed), out: Array.from(out),
    held, closure, dt, steps };
  };
  return { advance, result, progress };
}

// ---- the engine's case ------------------------------------------------------

export const CHROM_CASE_NAME = "chromatographyPulse";
/** The two solutes and the carrier of the engine's witness, in elution order. */
export const CHROM_SOLUTES = ["CH4", "CO2"] as const;
export const CHROM_CARRIER = "He";
/** Mole fraction of each solute in the injection: dilute, so the constant
 *  velocity the bed declares is a good closure and the record is linear. */
export const CHROM_Y_INJ = 0.005;
export const CHROM_CELLS = 200;
export const CHROM_SAMPLE_S = 0.5;
export const CHROM_SORBENT = "linearTeachingSorbent";

export interface EngineSpec {
  col: Column;
  /** Henry constants per solute, mol/(kg bar), elution order */ H: readonly [number, number];
  kLDF: number;
  Dax: number;
  tInj: number;
  tEnd: number;
}

const num = (x: number): string => {
  const s = x.toPrecision(10);
  return String(Number(s));
};

/** The end of the engine run for a spec: the later peak plus six of its
 *  standard deviations and the injection, rounded to the sampling grid. */
export function engineEndTime(col: Column, H: readonly [number, number], kLDF: number,
  Dax: number, tInj: number): number {
  const Kc = henryKc(H[1], col.T);
  const m = linearPulseMoments(col, Kc, kLDF, Dax, tInj, col.L / CHROM_CELLS);
  const raw = m.mu1 + 6 * Math.sqrt(m.variance) + tInj;
  return Math.ceil(raw / CHROM_SAMPLE_S) * CHROM_SAMPLE_S;
}

function isothermRecord(solute: string, H: number, T: number): string {
  return [
    "recordType      adsorptionIsotherm;",
    "schemaVersion   1;",
    `adsorbent       ${CHROM_SORBENT};`,
    `adsorbate       ${solute};`,
    "model           henry;",
    `parameters { H_298 ${num(H)}; dH_ads -20000; }   // mol/(kg bar); the run sits at tRef, so dH_ads never enters`,
    `tRef            ${num(T)};`,
    "loadingBasis    molPerKgAdsorbent;",
    "pressureBasis   partialPressureBar;",
    "provenance { origin assumed; method \"set on the chromatography EduTool page\"; "
      + "curation \"case-local teaching record, not catalogue data\"; }",
    "",
  ].join("\n");
}

/** The case the page hands choupoBatch: one fixedBedAdsorber, the feed a
 *  short injection of the two solutes in the carrier, switched back to pure
 *  carrier at tInj by the recipe (the engine's A5 feed switch). */
export function chromCaseFiles(s: EngineSpec): Record<string, string> {
  const { col } = s;
  const [a, b] = CHROM_SOLUTES;
  const yC = 1 - 2 * CHROM_Y_INJ;
  return {
    [`${CHROM_CASE_NAME}.cho`]: "",
    "system/controlDict": [
      "application   choupoBatch;",
      "description   \"chromatography EduTool: a linear pulse of two solutes\";",
      "verbosity     2;",
      `startTime 0; endTime ${num(s.tEnd)}; deltaT 0.05; writeInterval ${CHROM_SAMPLE_S};`,
      "timeStepping adaptive;",
      "solutionControl { write false; }",
      "",
    ].join("\n"),
    "constant/thermoPhysPropDict": [
      "recordType    thermophysicalPropertySystem;",
      "schemaVersion 2;",
      `components    ( ${a} ${b} ${CHROM_CARRIER} );`,
      "equilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; } "
        + "vapour { fugacityModel idealGas; } }",
      "",
    ].join("\n"),
    [`constant/adsorbents/${CHROM_SORBENT}.dat`]: [
      "adsorbent",
      "{",
      `    name        ${CHROM_SORBENT};`,
      "    type        \"synthetic linear-isotherm teaching sorbent\";",
      `    rho_bulk    ${num(col.rhoB)};`,
      "}",
      "provenance { identity { origin assumed; method \"set on the chromatography EduTool page\"; } }",
      "",
    ].join("\n"),
    [`constant/parameters/adsorption/equilibria/${CHROM_SORBENT}/${a}.dat`]: isothermRecord(a, s.H[0], col.T),
    [`constant/parameters/adsorption/equilibria/${CHROM_SORBENT}/${b}.dat`]: isothermRecord(b, s.H[1], col.T),
    "system/flowsheetDict": [
      "units",
      "(",
      "    {",
      "        name        bed;",
      "        type        fixedBedAdsorber;",
      "        operation",
      "        {",
      `            adsorbent   ${CHROM_SORBENT};`,
      `            L           ${num(col.L)} m;`,
      `            area        ${num(col.area)} m2;`,
      `            eps         ${num(col.eps)};`,
      `            u           ${num(col.u)} m/s;`,
      `            T           ${num(col.T)} K;`,
      `            P           ${num(col.P_bar)} bar;`,
      `            Dax  [0 2 -1 0 0]  ${num(s.Dax)};`,
      `            nCells      ${CHROM_CELLS};`,
      `            feed    { molarComposition { ${a} ${CHROM_Y_INJ}; ${b} ${CHROM_Y_INJ}; ${CHROM_CARRIER} ${num(yC)}; } }`,
      `            initial { molarComposition { ${CHROM_CARRIER} 1.0; } }`,
      "            kLDF",
      "            {",
      "                basis    solidFilm;",
      "                scope    \"chromatography EduTool, set on the page\";",
      "                source   \"the student's choice on the page\";",
      `                k { ${a} [0 0 -1 0 0] ${num(s.kLDF)}; ${b} [0 0 -1 0 0] ${num(s.kLDF)}; }`,
      "            }",
      "        }",
      `        solver { samplingInterval ${CHROM_SAMPLE_S}; }`,
      "    }",
      ");",
      "recipe",
      "(",
      `    { time ${num(s.tInj)}; action setParameter; unit bed; key feed.${a}; value 0.0; }`,
      `    { time ${num(s.tInj)}; action setParameter; unit bed; key feed.${b}; value 0.0; }`,
      ");",
      "",
    ].join("\n"),
  };
}

export interface EnginePeaks {
  t: number[];
  /** outlet concentration per solute, elution order [mol/m3] */ c: [number[], number[]];
  /** the run's own KPIs this page reads */
  tStoich: [number | null, number | null];
  massClosure: [number | null, number | null];
  Pe: number | null;
  tEnd: number | null;
}

/** Read the outlet histories and the KPIs the page uses off an engine run.
 *  Returns null when the trajectory lacks either outlet column. */
export function readEnginePeaks(traj: { t: number[]; vars: { [k: string]: number[] } } | undefined,
  kpis: { [unit: string]: { [k: string]: number } } | undefined): EnginePeaks | null {
  if (!traj) return null;
  const [a, b] = CHROM_SOLUTES;
  const ca = traj.vars[`bed.c_out_${a}`], cb = traj.vars[`bed.c_out_${b}`];
  if (!ca || !cb) return null;
  const k = kpis?.["bed"] ?? {};
  const rd = (key: string): number | null => (typeof k[key] === "number" && Number.isFinite(k[key]) ? k[key]! : null);
  return {
    t: traj.t.slice(), c: [ca.slice(), cb.slice()],
    tStoich: [rd(`t_stoichiometric_${a}`), rd(`t_stoichiometric_${b}`)],
    massClosure: [rd(`mass_closure_${a}`), rd(`mass_closure_${b}`)],
    Pe: rd("Pe"), tEnd: rd("t_end"),
  };
}

/** True when an engine answer belongs to this spec: the run's own t_st, Pe
 *  and end time match what the page asked for.  A run that finished after a
 *  knob moved answers another question and is not drawn as this one. */
export function engineMatches(p: EnginePeaks, s: EngineSpec): boolean {
  const close = (x: number | null, y: number): boolean =>
    x !== null && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
  const tst = (H: number): number => {
    const Kc = henryKc(H, s.col.T);
    return s.col.L / s.col.u * (s.col.eps + s.col.rhoB * Kc);
  };
  return close(p.tStoich[0], tst(s.H[0])) && close(p.tStoich[1], tst(s.H[1]))
    && close(p.Pe, s.col.u * s.col.L / s.Dax) && close(p.tEnd, s.tEnd);
}
