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
  correlationSimplicityMath -- the mathematics of "Why engineering
  correlations are simple" (DEV.md 4c C119).

  WHAT LIVES HERE, AND WHAT DOES NOT.  Only mathematics that is NOT a
  correlation: exact rational arithmetic and the null space of a dimensional
  matrix (page 1), an invented wiggle laid over an engine curve (page 2), a
  local logarithmic slope by finite differences (page 3), Haken's two-variable
  model and its adiabatic elimination (page 4), a least-squares power law and
  the Churchill-Usagi blend (page 5).  Every friction factor and Nusselt
  number the page draws is READ from the engine's sweep CSVs
  (tutorials/props/hydraulics/moody02_correlation_sweeps): no correlation is
  re-typed here, because a second home for Colebrook or Gnielinski would be a
  copy that could drift from the one the pipe and the exchanger use.

  The module imports nothing from React, so the node test runner can hold
  every function to a hand calculation.
\*---------------------------------------------------------------------------*/

// ==== 1. Exact rational arithmetic ===========================================
//
//  The dimensional matrices of this page hold small integers, and their null
//  spaces are rational.  A floating-point elimination would print a group with
//  an exponent of 0.9999999999999998, which is exactly the kind of number this
//  page must never show -- so the arithmetic is exact, and REFUSES (throws)
//  the moment an integer would leave the range a double holds exactly.

export interface Q { readonly n: number; readonly d: number }

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b !== 0) { const t = a % b; a = b; b = t; }
  return a;
}

function safe(x: number): number {
  if (!Number.isSafeInteger(x))
    throw new Error(`rational arithmetic left the exact-integer range (${x})`);
  return x;
}

export function q(n: number, d = 1): Q {
  if (d === 0) throw new Error("rational with a zero denominator");
  safe(n); safe(d);
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  const s = d < 0 ? -1 : 1;
  return { n: safe((s * n) / g), d: safe((s * d) / g) };
}
export const qAdd = (a: Q, b: Q): Q => q(safe(a.n * b.d + b.n * a.d), safe(a.d * b.d));
export const qSub = (a: Q, b: Q): Q => q(safe(a.n * b.d - b.n * a.d), safe(a.d * b.d));
export const qMul = (a: Q, b: Q): Q => q(safe(a.n * b.n), safe(a.d * b.d));
export const qDiv = (a: Q, b: Q): Q => {
  if (b.n === 0) throw new Error("rational division by zero");
  return q(safe(a.n * b.d), safe(a.d * b.n));
};
export const qIsZero = (a: Q): boolean => a.n === 0;

/** Reduced row-echelon form, exactly.  Returns the reduced matrix and the
 *  pivot column of each nonzero row; the rank is the number of pivots. */
export function rref(m: readonly (readonly Q[])[]): { R: Q[][]; pivots: number[] } {
  const R = m.map((row) => row.slice());
  const rows = R.length, cols = rows ? R[0]!.length : 0;
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = -1;
    for (let i = r; i < rows; i++) if (!qIsZero(R[i]![c]!)) { p = i; break; }
    if (p < 0) continue;
    [R[r], R[p]] = [R[p]!, R[r]!];
    const piv = R[r]![c]!;
    R[r] = R[r]!.map((x) => qDiv(x, piv));
    for (let i = 0; i < rows; i++) {
      if (i === r || qIsZero(R[i]![c]!)) continue;
      const f = R[i]![c]!;
      R[i] = R[i]!.map((x, k) => qSub(x, qMul(f, R[r]![k]!)));
    }
    pivots.push(c);
    r++;
  }
  return { R, pivots };
}

// ==== 2. Dimensional analysis =================================================

/** The base dimensions this page uses: mass, length, time, temperature. */
export const BASE_DIMS = ["M", "L", "T", "\\Theta"] as const;

export interface DimVariable {
  id: string;
  /** TeX symbol. */
  sym: string;
  /** What it is, in words. */
  means: string;
  /** Its SI unit, as a reader writes it. */
  unit: string;
  /** Exponents of M, L, T, Theta. */
  dims: readonly [number, number, number, number];
}

export interface DimProblem {
  id: "friction" | "convection";
  title: string;
  /** The quantity the correlation is FOR (the group it appears in is the
   *  dependent group). */
  target: string;
  /** The variables a student may pick from, the physically relevant ones
   *  first; `relevant` names the ones the classical analysis keeps. */
  candidates: readonly DimVariable[];
  relevant: readonly string[];
  /** The default repeating set (the "core"), in the classical choice. */
  defaultCore: readonly string[];
  /** Cores a reader can switch to.  What each gives is COMPUTED on the page,
   *  never written beside it (a caption could drift from the arithmetic). */
  alternativeCores: readonly (readonly string[])[];
}

const V = (id: string, sym: string, means: string, unit: string,
  dims: [number, number, number, number]): DimVariable => ({ id, sym, means, unit, dims });

export const PROBLEMS: Record<DimProblem["id"], DimProblem> = {
  friction: {
    id: "friction",
    title: "Pressure drop in a straight pipe",
    target: "dpdL",
    candidates: [
      V("dpdL", "\\Delta p/L", "pressure drop per unit length of pipe", "Pa/m", [1, -2, -2, 0]),
      V("rho", "\\rho", "fluid density", "kg/m³", [1, -3, 0, 0]),
      V("mu", "\\mu", "dynamic viscosity", "Pa·s", [1, -1, -1, 0]),
      V("u", "u", "mean velocity", "m/s", [0, 1, -1, 0]),
      V("D", "D", "pipe diameter", "m", [0, 1, 0, 0]),
      V("eps", "\\varepsilon", "wall roughness height", "m", [0, 1, 0, 0]),
      V("g", "g", "gravitational acceleration (not relevant in a full horizontal pipe)", "m/s²", [0, 1, -2, 0]),
      V("T", "T", "temperature (relevant only through the properties)", "K", [0, 0, 0, 1]),
    ],
    relevant: ["dpdL", "rho", "mu", "u", "D", "eps"],
    defaultCore: ["rho", "u", "D"],
    alternativeCores: [["rho", "u", "D"], ["mu", "u", "D"], ["rho", "mu", "D"]],
  },
  convection: {
    id: "convection",
    title: "Forced-convection heat transfer in a pipe",
    target: "h",
    candidates: [
      V("h", "h", "film heat-transfer coefficient", "W/(m²·K)", [1, 0, -3, -1]),
      V("k", "k", "fluid thermal conductivity", "W/(m·K)", [1, 1, -3, -1]),
      V("rho", "\\rho", "fluid density", "kg/m³", [1, -3, 0, 0]),
      V("mu", "\\mu", "dynamic viscosity", "Pa·s", [1, -1, -1, 0]),
      V("cp", "c_p", "specific heat capacity", "J/(kg·K)", [0, 2, -2, -1]),
      V("u", "u", "mean velocity", "m/s", [0, 1, -1, 0]),
      V("D", "D", "pipe diameter", "m", [0, 1, 0, 0]),
      V("Ltube", "L", "tube length (relevant in a short, developing tube)", "m", [0, 1, 0, 0]),
    ],
    relevant: ["h", "k", "rho", "mu", "cp", "u", "D"],
    defaultCore: ["k", "rho", "mu", "D"],
    //  The LAST choice is NOT a basis: c_p mu / k is itself dimensionless,
    //  so those four columns are dependent and the page shows the refusal.
    alternativeCores: [["k", "rho", "mu", "D"], ["k", "rho", "u", "D"], ["rho", "cp", "u", "k"],
      ["k", "mu", "cp", "D"]],
  },
};

export interface PiGroup {
  /** The non-core variable this group is built on. */
  head: string;
  /** Integer exponent of every selected variable, in selection order. */
  exps: number[];
}

export interface PiResult {
  ok: true;
  vars: DimVariable[];
  /** The dimensional matrix, rows M L T Theta, columns the selected variables. */
  matrix: number[][];
  rank: number;
  core: string[];
  groups: PiGroup[];
}
export interface PiRefusal { ok: false; vars: DimVariable[]; matrix: number[][]; rank: number; reason: string }

/** Integer vector from a rational one: clear denominators, then divide by the
 *  common factor, so a group is never written with fractional exponents. */
function integerise(v: readonly Q[]): number[] {
  let L = 1;
  for (const x of v) L = safe((L / gcd(L, x.d)) * x.d);
  const ints = v.map((x) => safe((x.n * L) / x.d));
  const g = ints.reduce((a, b) => gcd(a, b), 0) || 1;
  return ints.map((x) => x / g);
}

/** The Pi groups of a selection of variables on a chosen core (the matrix
 *  method: the core columns are reduced to the identity, and each remaining
 *  variable divided by the core raised to its column of the reduced matrix
 *  is one dimensionless group).  Refuses, by name, a core of the wrong size
 *  or a core whose own columns are not independent. */
export function piGroups(vars: readonly DimVariable[], core: readonly string[]): PiResult | PiRefusal {
  const matrix = BASE_DIMS.map((_, r) => vars.map((v) => v.dims[r]!));
  const rank = rref(matrix.map((row) => row.map((x) => q(x)))).pivots.length;
  const base = { vars: vars.slice(), matrix, rank };
  const coreVars = core.map((id) => vars.find((v) => v.id === id));
  if (coreVars.some((v) => v === undefined))
    return { ok: false, ...base, reason: "a core variable is not among the selected variables" };
  if (core.length !== rank)
    return { ok: false, ...base,
      reason: `the core must hold exactly rank = ${rank} variables; it holds ${core.length}` };
  const rest = vars.filter((v) => !core.includes(v.id));
  const ordered = [...(coreVars as DimVariable[]), ...rest];
  const M = BASE_DIMS.map((_, r) => ordered.map((v) => q(v.dims[r]!)));
  const { R, pivots } = rref(M);
  if (pivots.length !== rank || pivots.some((p, i) => p !== i))
    return { ok: false, ...base,
      reason: "the core's own columns are not independent: one core variable's dimensions "
        + "can be made from the others', so they cannot serve as the basis" };
  const groups: PiGroup[] = rest.map((v, j) => {
    const col = core.length + j;
    //  Pi = x_j * prod_i core_i^(-R[i][col]): the head variable's exponent is
    //  1 and the core exponents are minus its column of the reduced matrix.
    const raw = new Map<string, Q>([[v.id, q(1)]]);
    core.forEach((id, i) => raw.set(id, q(-R[i]![col]!.n, R[i]![col]!.d)));
    const ints = integerise(vars.map((x) => raw.get(x.id) ?? q(0)));
    const hi = vars.findIndex((x) => x.id === v.id);
    const sgn = ints[hi]! < 0 ? -1 : 1;
    return { head: v.id, exps: ints.map((x) => (x === 0 ? 0 : sgn * x)) };
  });
  return { ok: true, vars: vars.slice(), matrix, rank, core: core.slice(), groups };
}

/** The dimensions of a product of powers -- a group is dimensionless when
 *  every entry is zero, and the page shows that it is. */
export function dimsOf(vars: readonly DimVariable[], exps: readonly number[]): number[] {
  return BASE_DIMS.map((_, r) => vars.reduce((s, v, i) => s + v.dims[r]! * (exps[i] ?? 0), 0));
}

/** A group as TeX: numerator over denominator, integer powers. */
export function groupTex(vars: readonly DimVariable[], exps: readonly number[]): string {
  const part = (sgn: 1 | -1): string => vars.flatMap((v, i) => {
    const e = sgn * (exps[i] ?? 0);
    if (e <= 0) return [];
    const s = v.sym.includes("/") ? `(${v.sym})` : v.sym;
    return [e === 1 ? s : `${s}^{${e}}`];
  }).join("\\,");
  const num = part(1) || "1", den = part(-1);
  return den ? `\\frac{${num}}{${den}}` : num;
}

// ==== 3. Reading the engine's sweep CSVs ======================================

export interface SweepTable { cols: string[]; rows: string[][] }

export function parseSweepCsv(text: string): SweepTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { cols: [], rows: [] };
  return { cols: lines[0]!.split(","), rows: lines.slice(1).map((l) => l.split(",")) };
}

/** One curve of the sweep: the rows whose `keyCol` equals `key` (eps/D, or
 *  Pr), the Re column and the requested value column, in grid order. */
export interface Curve { Re: number[]; y: number[]; inWindow: boolean[]; regime: string[] }

export function curveOf(t: SweepTable, keyCol: string, key: number, yCol: string,
  inCol?: string): Curve {
  const ik = t.cols.indexOf(keyCol), ir = t.cols.indexOf("Re"), iy = t.cols.indexOf(yCol);
  const iw = inCol ? t.cols.indexOf(inCol) : -1, ig = t.cols.indexOf("regime");
  if (ik < 0 || ir < 0 || iy < 0) throw new Error(`sweep CSV has no column ${keyCol}/Re/${yCol}`);
  const c: Curve = { Re: [], y: [], inWindow: [], regime: [] };
  for (const r of t.rows) {
    const k = Number(r[ik]);
    if (Math.abs(k - key) > 1e-12 * Math.max(1, Math.abs(key))) continue;
    c.Re.push(Number(r[ir])); c.y.push(Number(r[iy]));
    c.inWindow.push(iw < 0 ? true : r[iw] === "1");
    c.regime.push(ig < 0 ? "" : r[ig]!);
  }
  return c;
}

/** The distinct values of a key column, ascending. */
export function keysOf(t: SweepTable, keyCol: string): number[] {
  const i = t.cols.indexOf(keyCol);
  return [...new Set(t.rows.map((r) => Number(r[i])))].sort((a, b) => a - b);
}

// ==== 4. Page 2: an invented wiggle ===========================================

/** Phi_wiggly(Re) = f(Re) * (1 + a sin(2 pi k log10 Re)).  Invented, and
 *  labelled so on the page: it is dimensionally exactly as admissible as the
 *  engine's curve it is laid over, which is the point. */
export function wiggle(Re: number, f: number, amplitude: number, perDecade: number): number {
  return f * (1 + amplitude * Math.sin(2 * Math.PI * perDecade * Math.log10(Re)));
}

// ==== 5. Page 3: the local logarithmic slope ==================================

/** d ln y / d ln Re by finite differences on the grid, central inside a
 *  segment and one-sided at its ends.  Segments are cut where `split` says
 *  two neighbours do not belong together (a regime change, where the
 *  correlation switches law and a difference across the jump would be a
 *  number about the switch, not about either law).  NaN where a segment has
 *  a single point. */
export function localSlope(Re: readonly number[], y: readonly number[],
  split: (i: number) => boolean = () => false): number[] {
  const n = Re.length, s = new Array<number>(n).fill(NaN);
  let a = 0;
  while (a < n) {
    let b = a;
    while (b + 1 < n && !split(b + 1)) b++;
    for (let i = a; i <= b; i++) {
      const lo = Math.max(a, i - 1), hi = Math.min(b, i + 1);
      if (hi > lo) s[i] = (Math.log(y[hi]!) - Math.log(y[lo]!)) / (Math.log(Re[hi]!) - Math.log(Re[lo]!));
    }
    a = b + 1;
  }
  return s;
}

// ==== 6. Page 4: Haken's two-variable model ===================================
//
//   dx/dt = eps x - x y,     dy/dt = -gamma y + x^2.
//
//  When gamma >> eps the variable y relaxes on the fast time 1/gamma and
//  follows x: setting dy/dt = 0 gives y = x^2/gamma (adiabatic elimination),
//  and the master equation is dx/dt = eps x - x^3/gamma.  Both systems share
//  the fixed point x* = sqrt(eps gamma), y* = eps; they differ in how they
//  get there.  The reduced equation has a closed-form solution (it is a
//  Bernoulli equation in x^2):
//
//   x(t)^2 = eps gamma x0^2 e^(2 eps t) / (eps gamma + x0^2 (e^(2 eps t) - 1)).

export interface HakenRun {
  t: number[]; x: number[]; y: number[]; xReduced: number[]; ySlaved: number[];
  xStar: number;
  /** max |x - x_reduced| / x*, over the run. */
  maxRelErr: number;
}

export function hakenReducedX(t: number, x0: number, eps: number, gamma: number): number {
  const e = Math.exp(2 * eps * t);
  return Math.sqrt((eps * gamma * x0 * x0 * e) / (eps * gamma + x0 * x0 * (e - 1)));
}

/** The full system by classical RK4, beside the reduced closed form.
 *  The step resolves the faster of the two time scales. */
export function hakenRun(eps: number, gamma: number, tEnd: number, x0: number, y0 = 0,
  samples = 400): HakenRun {
  const dt = Math.min(0.005 / eps, 0.05 / gamma);
  const nSteps = Math.ceil(tEnd / dt), h = tEnd / nSteps;
  const every = Math.max(1, Math.floor(nSteps / samples));
  const fx = (x: number, y: number) => eps * x - x * y;
  const fy = (x: number, y: number) => -gamma * y + x * x;
  let x = x0, y = y0;
  const out: HakenRun = { t: [], x: [], y: [], xReduced: [], ySlaved: [], xStar: Math.sqrt(eps * gamma),
    maxRelErr: 0 };
  const push = (t: number) => {
    const xr = hakenReducedX(t, x0, eps, gamma);
    out.t.push(t); out.x.push(x); out.y.push(y); out.xReduced.push(xr); out.ySlaved.push(x * x / gamma);
  };
  push(0);
  for (let k = 1; k <= nSteps; k++) {
    const k1x = fx(x, y), k1y = fy(x, y);
    const k2x = fx(x + 0.5 * h * k1x, y + 0.5 * h * k1y), k2y = fy(x + 0.5 * h * k1x, y + 0.5 * h * k1y);
    const k3x = fx(x + 0.5 * h * k2x, y + 0.5 * h * k2y), k3y = fy(x + 0.5 * h * k2x, y + 0.5 * h * k2y);
    const k4x = fx(x + h * k3x, y + h * k3y), k4y = fy(x + h * k3x, y + h * k3y);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    const xr = hakenReducedX(k * h, x0, eps, gamma);
    out.maxRelErr = Math.max(out.maxRelErr, Math.abs(x - xr) / out.xStar);
    if (k % every === 0 || k === nSteps) push(k * h);
  }
  return out;
}

/** The linearised full system at its fixed point: lambda^2 + gamma lambda +
 *  2 eps gamma = 0.  Complex roots (an oscillating approach the reduced
 *  equation cannot make) when gamma < 8 eps. */
export function hakenEigenvalues(eps: number, gamma: number): { re: number[]; im: number[] } {
  const disc = gamma * gamma - 8 * eps * gamma;
  if (disc >= 0) {
    const r = Math.sqrt(disc);
    return { re: [(-gamma + r) / 2, (-gamma - r) / 2], im: [0, 0] };
  }
  const w = Math.sqrt(-disc) / 2;
  return { re: [-gamma / 2, -gamma / 2], im: [w, -w] };
}

// ==== 7. Page 5: a power law over one decade, and the blend of asymptotes =====

export interface PowerFit {
  C: number; m: number;
  /** Points the fit used (Re in [a, 10a]). */
  n: number;
  /** max |y_fit/y - 1| over the decade fitted. */
  maxRelErr: number;
}

/** Least squares of ln y = ln C + m ln Re over the grid points in
 *  [a, 10 a] (a relative 1e-9 slack takes in the decade's two ends). */
export function fitDecade(Re: readonly number[], y: readonly number[], a: number): PowerFit {
  const idx = Re.map((_, i) => i).filter((i) => Re[i]! >= a * (1 - 1e-9) && Re[i]! <= 10 * a * (1 + 1e-9)
    && y[i]! > 0 && Number.isFinite(y[i]!));
  const n = idx.length;
  if (n < 2) return { C: NaN, m: NaN, n, maxRelErr: NaN };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const i of idx) {
    const X = Math.log(Re[i]!), Y = Math.log(y[i]!);
    sx += X; sy += Y; sxx += X * X; sxy += X * Y;
  }
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const lnC = (sy - m * sx) / n;
  const C = Math.exp(lnC);
  let maxRelErr = 0;
  for (const i of idx) maxRelErr = Math.max(maxRelErr, Math.abs((C * Re[i]! ** m) / y[i]! - 1));
  return { C, m, n, maxRelErr };
}

/** How far a fitted power law stays within a relative tolerance of the
 *  curve, walking out from the fitted decade in both directions on the
 *  grid.  Returns the Re interval, and its width in decades. */
export function reachWithin(Re: readonly number[], y: readonly number[], fit: PowerFit, a: number,
  tol: number): { lo: number; hi: number; decades: number } {
  const ok = (i: number) => y[i]! > 0 && Math.abs((fit.C * Re[i]! ** fit.m) / y[i]! - 1) <= tol;
  let start = Re.findIndex((r) => r >= a * (1 - 1e-9));
  if (start < 0) start = 0;
  let lo = start, hi = start;
  while (lo - 1 >= 0 && ok(lo - 1)) lo--;
  while (hi + 1 < Re.length && ok(hi + 1)) hi++;
  return { lo: Re[lo]!, hi: Re[hi]!, decades: Math.log10(Re[hi]! / Re[lo]!) };
}

/** The Churchill-Usagi blend y = (y1^n + y2^n)^(1/n), written so that a
 *  large n does not overflow: y = max * (1 + (min/max)^n)^(1/n). */
export function blend(y1: number, y2: number, n: number): number {
  const hi = Math.max(y1, y2), lo = Math.min(y1, y2);
  return hi * (1 + (lo / hi) ** n) ** (1 / n);
}
