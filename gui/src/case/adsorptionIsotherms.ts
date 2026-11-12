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
  adsorptionIsotherms — the arithmetic of the `adsorption-isotherms` EduTool:
  three single-solute isotherms fitted to (c, q) points a student measured.

  WHY THIS IS THE PAGE'S OWN ARITHMETIC AND NOT THE ENGINE'S (measured
  2026-11-12, docs/design/adsorption-isotherms-from-laboratory-data.md):
    * the engine registers two isotherm models, `henry` and `langmuir`
      (src/thermo/adsorbent/IsothermModel.cpp, registerBuiltins), both in
      the PARTIAL PRESSURE of a gas;
    * its isotherm regression (`fitParameters`, `residual.kind isotherm`,
      src/propertyOps/FitParameters.cpp, runIsothermFit) reads a dataset
      whose columns are T, p and q and converts p as a PRESSURE;
    * there is no Freundlich model anywhere in src/.
  A liquid-phase point (c in mg/L, q in mg/g) has no honest route through
  either: handing a concentration to a column declared as pressure would be
  a units lie.  So this file fits what the page draws, every formula is a
  closed form printed on the page, and every panel that shows a result is
  marked `page`.

  What is here:
    * the three isotherms and their derivatives with respect to their
      parameters (the Jacobian the fit uses and the standard errors read);
    * the classical LINEARISED fits -- 1/q against 1/c for Langmuir, log q
      against log c for Freundlich -- by ordinary least squares on the
      transformed variables;
    * a DIRECT nonlinear least-squares fit on q itself, by a hand-written
      Levenberg-Marquardt, unweighted (absolute residuals) or weighted by
      1/q (relative residuals), with standard errors from
      s^2 (J^T W J)^-1;
    * a parser for pasted points that refuses malformed input by line;
    * the synthetic example datasets, GENERATED here from stated parameters
      and stated noise by a seeded generator, so the numbers on the page are
      reproducible and their truth is known;
    * the single-stage batch balance V c0 + M q0 = V c + M q.
\*---------------------------------------------------------------------------*/

export type ModelId = "linear" | "langmuir" | "freundlich";
export const MODELS: readonly ModelId[] = ["linear", "langmuir", "freundlich"];

export interface Pt { c: number; q: number }

/** The parameter vector of each model, in the order the page prints it:
 *  linear [K]; Langmuir [q_max, K_L]; Freundlich [K_F, 1/n]. */
export const PARAM_NAMES: Readonly<Record<ModelId, readonly string[]>> = {
  linear: ["K"],
  langmuir: ["q_max", "K_L"],
  freundlich: ["K_F", "1/n"],
};

export const MODEL_LABEL: Readonly<Record<ModelId, string>> = {
  linear: "Linear",
  langmuir: "Langmuir",
  freundlich: "Freundlich",
};

/** q at c, for the model and its parameters. */
export function isothermQ(model: ModelId, p: readonly number[], c: number): number {
  if (model === "linear") return p[0]! * c;
  if (model === "langmuir") return (p[0]! * c) / (p[1]! + c);
  return p[0]! * Math.pow(c, p[1]!);
}

/** dq/d(parameter) at c, in the natural parameters of PARAM_NAMES. */
export function isothermGrad(model: ModelId, p: readonly number[], c: number): number[] {
  if (model === "linear") return [c];
  if (model === "langmuir") {
    const d = p[1]! + c;
    return [c / d, (-p[0]! * c) / (d * d)];
  }
  const cm = Math.pow(c, p[1]!);
  return [cm, p[0]! * cm * Math.log(c)];
}

// ---- small linear algebra ---------------------------------------------------------

/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i]![k]!) > Math.abs(M[piv]![k]!)) piv = i;
    if (!(Math.abs(M[piv]![k]!) > 0)) return null;
    [M[k], M[piv]] = [M[piv]!, M[k]!];
    for (let i = k + 1; i < n; i++) {
      const f = M[i]![k]! / M[k]![k]!;
      for (let j = k; j <= n; j++) M[i]![j]! -= f * M[k]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= M[i]![j]! * x[j]!;
    x[i] = s / M[i]![i]!;
  }
  return x;
}

/** The inverse of a small symmetric matrix, column by column; null when singular. */
function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0); e[j] = 1;
    const x = solveLinear(A, e);
    if (!x) return null;
    cols.push(x);
  }
  return A.map((_, i) => cols.map((col) => col[i]!));
}

// ---- ordinary least squares on a straight line -------------------------------------

export interface LineFit { slope: number; intercept: number; r2: number }

/** y = intercept + slope x, by ordinary least squares. */
export function lineFit(x: readonly number[], y: readonly number[]): LineFit {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i]! - mx) ** 2; sxy += (x[i]! - mx) * (y[i]! - my); syy += (y[i]! - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
}

// ---- a fit and how good it is ------------------------------------------------------

export type Weighting = "absolute" | "relative";

export interface Fit {
  model: ModelId;
  /** "direct" = least squares on q itself; "linearised" = least squares on the
   *  transformed variables of the classical straight-line plot. */
  route: "direct" | "linearised";
  params: number[];
  /** Standard error of each parameter (direct fits only); Infinity when the
   *  data cannot fix it (singular J^T W J); null when there are no degrees of
   *  freedom left or the route does not compute it. */
  se: number[] | null;
  /** Residuals q_model - q, in the units of q. */
  resid: number[];
  /** Relative residuals (q_model - q)/q. */
  relResid: number[];
  /** Root-mean-square of the residuals on q, sqrt(SSR/N), in the units of q. */
  rms: number;
  /** Largest |q_model - q|/q over the points. */
  maxRel: number;
  /** The linearised route's own coefficient of determination, on the
   *  TRANSFORMED variables -- printed so a student sees how good a straight
   *  line can look in transformed space. */
  r2Transformed?: number;
  iterations?: number;
  converged: boolean;
  /** Why the route gave no parameters (a refusal, shown as one). */
  refused?: string;
}

function scoreFit(model: ModelId, params: number[], pts: readonly Pt[]): {
  resid: number[]; relResid: number[]; rms: number; maxRel: number;
} {
  const resid = pts.map((pt) => isothermQ(model, params, pt.c) - pt.q);
  const relResid = resid.map((r, i) => r / pts[i]!.q);
  const rms = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / pts.length);
  const maxRel = relResid.reduce((a, r) => Math.max(a, Math.abs(r)), 0);
  return { resid, relResid, rms, maxRel };
}

function refusedFit(model: ModelId, route: Fit["route"], why: string): Fit {
  return {
    model, route, params: [], se: null, resid: [], relResid: [], rms: NaN, maxRel: NaN,
    converged: false, refused: why,
  };
}

/** The classical straight-line fits.  Linear has no transformation: its
 *  "linearised" fit is the direct one, K = sum(c q)/sum(c^2). */
export function linearisedFit(model: ModelId, pts: readonly Pt[]): Fit {
  if (model === "linear") {
    const K = pts.reduce((a, p) => a + p.c * p.q, 0) / pts.reduce((a, p) => a + p.c * p.c, 0);
    return { model, route: "linearised", params: [K], se: null, ...scoreFit(model, [K], pts), converged: true };
  }
  if (model === "langmuir") {
    //  1/q = 1/q_max + (K_L/q_max) (1/c): intercept 1/q_max, slope K_L/q_max.
    const lf = lineFit(pts.map((p) => 1 / p.c), pts.map((p) => 1 / p.q));
    if (!(lf.intercept > 0))
      return refusedFit(model, "linearised",
        `the straight line through 1/q against 1/c meets the axis at ${lf.intercept.toPrecision(3)}, `
        + "which is not positive, so q_max = 1/intercept does not exist");
    const qmax = 1 / lf.intercept, KL = lf.slope / lf.intercept;
    if (!(KL > 0))
      return refusedFit(model, "linearised",
        "the straight line through 1/q against 1/c has a slope that is not positive, so K_L would be "
        + "negative");
    return {
      model, route: "linearised", params: [qmax, KL], se: null,
      ...scoreFit(model, [qmax, KL], pts), r2Transformed: lf.r2, converged: true,
    };
  }
  //  log10 q = log10 K_F + (1/n) log10 c.
  const lf = lineFit(pts.map((p) => Math.log10(p.c)), pts.map((p) => Math.log10(p.q)));
  const params = [Math.pow(10, lf.intercept), lf.slope];
  return {
    model, route: "linearised", params, se: null, ...scoreFit(model, params, pts),
    r2Transformed: lf.r2, converged: true,
  };
}

/** Parameters the LM works in: positive parameters by their logarithm (so
 *  they stay positive without a clamp), the Freundlich exponent as it is. */
function toTheta(model: ModelId, p: readonly number[]): number[] {
  if (model === "freundlich") return [Math.log(p[0]!), p[1]!];
  return p.map((v) => Math.log(v));
}
function fromTheta(model: ModelId, t: readonly number[]): number[] {
  if (model === "freundlich") return [Math.exp(t[0]!), t[1]!];
  return t.map((v) => Math.exp(v));
}
/** d(natural)/d(theta), the diagonal of the chain rule. */
function dNaturalDTheta(model: ModelId, p: readonly number[]): number[] {
  if (model === "freundlich") return [p[0]!, 1];
  return [...p];
}

function weightsOf(pts: readonly Pt[], w: Weighting): number[] {
  return pts.map((p) => (w === "relative" ? 1 / p.q : 1));
}

function wssr(model: ModelId, p: readonly number[], pts: readonly Pt[], wt: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const r = (isothermQ(model, p, pts[i]!.c) - pts[i]!.q) * wt[i]!;
    s += r * r;
  }
  return s;
}

/** A starting point for the LM: the linearised fit where it exists, else a
 *  rough reading of the data (the plateau a fifth above the largest q, K_L
 *  at the middle concentration). */
export function startOf(model: ModelId, pts: readonly Pt[]): number[] {
  const lin = linearisedFit(model, pts);
  if (!lin.refused) return lin.params;
  const qs = pts.map((p) => p.q), cs = [...pts.map((p) => p.c)].sort((a, b) => a - b);
  return [1.2 * Math.max(...qs), cs[Math.floor(cs.length / 2)]!];
}

/** The direct nonlinear least-squares fit on q, Levenberg-Marquardt with
 *  Marquardt's diagonal scaling: (J'WJ + lambda diag(J'WJ)) d = -J'W r. */
export function directFit(model: ModelId, pts: readonly Pt[], weighting: Weighting = "absolute",
  start?: readonly number[]): Fit {
  const wt = weightsOf(pts, weighting);
  const nP = PARAM_NAMES[model].length;
  let p = start ? [...start] : startOf(model, pts);
  if (model === "linear") {
    //  Linear in K: the normal equation is exact, no iteration.
    let num = 0, den = 0;
    for (let i = 0; i < pts.length; i++) {
      const w2 = wt[i]! * wt[i]!;
      num += w2 * pts[i]!.c * pts[i]!.q; den += w2 * pts[i]!.c * pts[i]!.c;
    }
    p = [num / den];
  } else {
    let th = toTheta(model, p);
    let f = wssr(model, p, pts, wt);
    let lambda = 1e-3;
    let it = 0, converged = false;
    for (; it < 500; it++) {
      const pNat = fromTheta(model, th);
      const chain = dNaturalDTheta(model, pNat);
      const JtJ = Array.from({ length: nP }, () => new Array<number>(nP).fill(0));
      const Jtr = new Array<number>(nP).fill(0);
      for (let i = 0; i < pts.length; i++) {
        const g = isothermGrad(model, pNat, pts[i]!.c).map((v, k) => v * chain[k]! * wt[i]!);
        const r = (isothermQ(model, pNat, pts[i]!.c) - pts[i]!.q) * wt[i]!;
        for (let a = 0; a < nP; a++) {
          Jtr[a]! += g[a]! * r;
          for (let b = 0; b < nP; b++) JtJ[a]![b]! += g[a]! * g[b]!;
        }
      }
      let accepted = false;
      for (let tries = 0; tries < 40 && !accepted; tries++) {
        const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) : v)));
        const d = solveLinear(A, Jtr.map((v) => -v));
        if (!d) { lambda *= 10; continue; }
        const thNew = th.map((v, k) => v + d[k]!);
        const fNew = wssr(model, fromTheta(model, thNew), pts, wt);
        if (Number.isFinite(fNew) && fNew <= f) {
          const stepSmall = d.every((v, k) => Math.abs(v) <= 1e-12 * (1 + Math.abs(th[k]!)));
          const relDrop = (f - fNew) / Math.max(f, 1e-300);
          th = thNew; f = fNew; lambda = Math.max(lambda / 10, 1e-15); accepted = true;
          if (stepSmall || relDrop < 1e-15) converged = true;
        } else lambda *= 10;
      }
      if (!accepted) { converged = true; break; }   // no step lowers the sum: at the minimum
      if (converged) break;
    }
    p = fromTheta(model, th);
    const out = finish(model, p, pts, wt, "direct");
    return { ...out, iterations: it + 1, converged };
  }
  return { ...finish(model, p, pts, wt, "direct"), iterations: 1, converged: true };
}

/** Standard errors: Cov = s^2 (J'WJ)^-1, s^2 = sum (w r)^2 / (N - p), J in the
 *  natural parameters at the answer. */
function finish(model: ModelId, p: number[], pts: readonly Pt[], wt: readonly number[],
  route: Fit["route"]): Fit {
  const nP = p.length, N = pts.length;
  const JtJ = Array.from({ length: nP }, () => new Array<number>(nP).fill(0));
  for (let i = 0; i < N; i++) {
    const g = isothermGrad(model, p, pts[i]!.c).map((v) => v * wt[i]!);
    for (let a = 0; a < nP; a++) for (let b = 0; b < nP; b++) JtJ[a]![b]! += g[a]! * g[b]!;
  }
  let se: number[] | null = null;
  if (N > nP) {
    const s2 = wssr(model, p, pts, wt) / (N - nP);
    const inv = invert(JtJ);
    se = inv ? inv.map((row, k) => Math.sqrt(Math.max(row[k]! * s2, 0))) : p.map(() => Infinity);
    if (se.some((v) => !Number.isFinite(v))) se = p.map(() => Infinity);
  }
  return { model, route, params: p, se, ...scoreFit(model, p, pts), converged: true };
}

// ---- can the data tell the models apart? -------------------------------------------

export interface Diagnostics {
  /** log10(c_max / c_min). */
  decades: number;
  /** Fraction of the fitted Langmuir plateau reached at the highest and the
   *  lowest measured c: theta = c/(K_L + c), from the direct Langmuir fit. */
  thetaMax: number;
  thetaMin: number;
  /** The Freundlich exponent's distance from 1 in standard errors. */
  curvatureInSE: number;
  /** One sentence per thing the data cannot settle. */
  warnings: string[];
}

export function diagnostics(pts: readonly Pt[], lang: Fit, freu: Fit): Diagnostics {
  const cs = pts.map((p) => p.c);
  const cmax = Math.max(...cs), cmin = Math.min(...cs);
  const decades = Math.log10(cmax / cmin);
  const KL = lang.params[1] ?? NaN;
  const thetaMax = cmax / (KL + cmax), thetaMin = cmin / (KL + cmin);
  const m = freu.params[1] ?? NaN, seM = freu.se?.[1] ?? NaN;
  const curvatureInSE = Math.abs(m - 1) / seM;
  const pct = (v: number) => `${(100 * v).toFixed(v < 0.1 ? 1 : 0)} %`;
  const warnings: string[] = [];
  if (thetaMax < 0.1)
    warnings.push(`Every point lies below ${pct(thetaMax)} of the fitted Langmuir plateau, where `
      + "the Langmuir curve is still almost straight.  The three models describe these data about "
      + "equally well and cannot be told apart from them; q_max and K_L are not fixed separately, "
      + "only their ratio q_max/K_L (the initial slope, which is the linear K).");
  else if (thetaMax < 0.5)
    warnings.push(`The highest point reaches only ${pct(thetaMax)} of the fitted Langmuir plateau: `
      + "q_max is read from the curvature of the data, not from points near it, and its standard "
      + "error says how loosely.");
  if (thetaMin > 0.5)
    warnings.push(`Even the lowest point is at ${pct(thetaMin)} of the fitted plateau: no point is in `
      + "the region where q rises in proportion to c, so the initial slope q_max/K_L is an "
      + "extrapolation.");
  if (decades < 1)
    warnings.push(`The concentrations span ${decades.toFixed(2)} decades (less than one): the `
      + "Freundlich exponent 1/n is fixed only loosely, because a power law and a gentle curve look "
      + "alike over a short range.");
  if (Number.isFinite(curvatureInSE) && curvatureInSE < 2)
    warnings.push(`The fitted Freundlich exponent 1/n = ${m.toFixed(3)} is within two of its own `
      + `standard errors (${seM.toPrecision(2)}) of 1: the data do not show, beyond their scatter, `
      + "that the isotherm curves at all.");
  return { decades, thetaMax, thetaMin, curvatureInSE, warnings };
}

// ---- the pasted points --------------------------------------------------------------

export interface Parsed {
  points: Pt[];
  /** A first line that was text, skipped as a header (shown, never silent). */
  header: string | null;
  /** Refusals, one per offending line or rule.  Any refusal refuses the whole set. */
  errors: string[];
}

export const MIN_POINTS = 4;

function num(tok: string): number {
  //  A decimal comma is read as a point only inside a token that has no other
  //  separator role (the line was split on whitespace, tab or semicolon).
  const t = tok.trim().replace(/^\+/, "");
  if (!/^-?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t.replace(",", "."));
}

/** Two columns, c then q, one point per line.  Separators: whitespace, tab,
 *  semicolon -- or a single comma when the line has no other separator.  A
 *  `#` starts a comment.  The first line may be a header and is skipped,
 *  aloud.  Anything else that is not two positive numbers refuses by line. */
export function parsePoints(text: string): Parsed {
  const errors: string[] = [];
  const points: Pt[] = [];
  let header: string | null = null;
  const lines = text.split(/\r?\n/);
  let seenData = false;
  lines.forEach((raw, k) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    let toks = line.split(/[\s;]+/).filter(Boolean);
    if (toks.length === 1 && (line.match(/,/g) ?? []).length === 1) toks = line.split(",");
    const vals = toks.map(num);
    if (!seenData && header === null && vals.some((v) => Number.isNaN(v))
      && toks.some((t) => /[A-Za-z]/.test(t))) {
      header = line; return;
    }
    seenData = true;
    if (toks.length !== 2) {
      errors.push(`line ${k + 1} ("${line}"): ${toks.length} values where two (c and q) are expected`);
      return;
    }
    if (vals.some((v) => Number.isNaN(v))) {
      errors.push(`line ${k + 1} ("${line}"): not two numbers`);
      return;
    }
    if (!(vals[0]! > 0) || !(vals[1]! > 0)) {
      errors.push(`line ${k + 1} ("${line}"): c and q must both be positive -- a zero or a `
        + "negative cannot enter 1/c, 1/q or a logarithm, and a blank (c = 0, q = 0) carries no "
        + "information about the isotherm's shape");
      return;
    }
    points.push({ c: vals[0]!, q: vals[1]! });
  });
  if (errors.length === 0) {
    if (points.length < MIN_POINTS)
      errors.push(`${points.length} point${points.length === 1 ? "" : "s"}: at least ${MIN_POINTS} are `
        + "needed, so that a two-parameter model leaves two degrees of freedom for its standard "
        + "errors");
    else if (new Set(points.map((p) => p.c)).size < 3)
      errors.push("fewer than three distinct concentrations: no curve can be told from a line");
  }
  return { points: errors.length ? [] : points.sort((a, b) => a.c - b.c), header, errors };
}

// ---- units ------------------------------------------------------------------------

/** A concentration unit: what `c * V[L]` is an amount of, and how many of that
 *  amount one unit per litre carries. */
export interface CUnit { id: string; label: string; amount: "mg" | "mmol"; perLitre: number }
export interface QUnit { id: string; label: string; amount: "mg" | "mmol"; perGram: number }

export const C_UNITS: readonly CUnit[] = [
  { id: "mg/L", label: "mg/L", amount: "mg", perLitre: 1 },
  { id: "g/L", label: "g/L (= kg/m³)", amount: "mg", perLitre: 1000 },
  { id: "mmol/L", label: "mmol/L (= mol/m³)", amount: "mmol", perLitre: 1 },
];
export const Q_UNITS: readonly QUnit[] = [
  { id: "mg/g", label: "mg/g", amount: "mg", perGram: 1 },
  { id: "kg/kg", label: "kg/kg", amount: "mg", perGram: 1000 },
  { id: "mmol/g", label: "mmol/g", amount: "mmol", perGram: 1 },
];

/** The unit each parameter is in, given the units the points are in. */
export function paramUnits(model: ModelId, cU: string, qU: string): string[] {
  if (model === "linear") return [`(${qU})/(${cU})`];
  if (model === "langmuir") return [qU, cU];
  return [`(${qU})·(${cU})^(−1/n)`, "–"];
}

// ---- the synthetic examples -------------------------------------------------------

/** mulberry32: a small seeded generator, so a synthetic dataset is the same
 *  numbers on every machine and in every test. */
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

export interface SyntheticSpec {
  id: string;
  label: string;
  /** What the set is shaped like, said as such -- it is not a measurement. */
  story: string;
  model: ModelId;
  params: readonly number[];
  cU: string;
  qU: string;
  /** Concentrations: n points evenly spaced in log c from cFrom to cTo. */
  cFrom: number; cTo: number; n: number;
  /** Multiplicative noise: q = q_true * exp(sigma * e), e standard normal. */
  sigma: number;
  seed: number;
}

export const SYNTHETIC: readonly SyntheticSpec[] = [
  {
    id: "carbon", label: "Organic solute from water on activated carbon (synthetic, Freundlich-like)",
    story: "Shaped like the coursework isotherm of an aromatic solute taken out of water by a "
      + "granular activated carbon: four decades of concentration and no visible plateau.",
    model: "freundlich", params: [12, 0.35], cU: "mg/L", qU: "mg/g",
    cFrom: 0.01, cTo: 100, n: 12, sigma: 0.05, seed: 20261112,
  },
  {
    id: "resin", label: "Metal ion on a chelating resin (synthetic, strongly favourable Langmuir)",
    story: "Shaped like the uptake of a metal ion by a selective resin: a steep rise at low "
      + "concentration and a clear plateau.",
    model: "langmuir", params: [1.8, 0.15], cU: "mmol/L", qU: "mmol/g",
    cFrom: 0.02, cTo: 20, n: 10, sigma: 0.03, seed: 7,
  },
  {
    id: "dilute", label: "Trace solute, linear region only (synthetic, Langmuir underneath)",
    story: "Generated from a Langmuir isotherm, but every point lies at a concentration far below "
      + "K_L, as happens when a trace contaminant is studied at the levels found in practice.",
    model: "langmuir", params: [80, 400], cU: "mg/L", qU: "mg/g",
    cFrom: 1, cTo: 30, n: 9, sigma: 0.04, seed: 42,
  },
];

/** Round to four significant figures, as a laboratory sheet would be written. */
const sig4 = (v: number): number => Number(v.toPrecision(4));

/** The points of a synthetic set, with their noise.  `sigma = 0` gives the
 *  noise-free curve at the same concentrations (still rounded to four
 *  significant figures unless `exact`). */
export function syntheticPoints(s: SyntheticSpec, opts: { sigma?: number; exact?: boolean } = {}): Pt[] {
  const sigma = opts.sigma ?? s.sigma;
  const rnd = seeded(s.seed);
  const out: Pt[] = [];
  for (let k = 0; k < s.n; k++) {
    const c = s.cFrom * Math.pow(s.cTo / s.cFrom, k / (s.n - 1));
    //  Box-Muller: one standard normal per point, from two uniforms.
    const u1 = Math.max(rnd(), 1e-12), u2 = rnd();
    const e = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const q = isothermQ(s.model, s.params, c) * Math.exp(sigma * e);
    out.push(opts.exact ? { c, q } : { c: sig4(c), q: sig4(q) });
  }
  return out;
}

/** The points as two columns of text, the form the paste box takes. */
export function pointsText(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.c}\t${p.q}`).join("\n");
}

// ---- the single-stage batch -------------------------------------------------------

export interface BatchInput {
  model: ModelId;
  params: readonly number[];
  cU: CUnit;
  qU: QUnit;
  /** Liquid volume, L. */
  V_L: number;
  /** Initial concentration, in cU. */
  c0: number;
  /** Fraction of the solute to remove, 0..1. */
  removal: number;
  /** Loading of the adsorbent as charged, in qU (0 for fresh adsorbent). */
  q0: number;
}

export interface BatchResult {
  /** Final concentration, in cU. */
  c: number;
  /** Equilibrium loading at c, in qU. */
  q: number;
  /** Adsorbent mass, g. */
  M_g: number;
  /** Slope of the operating line q = q0 + (V/M)(c0 - c), in qU per cU. */
  slope: number;
  refused?: string;
}

/** V c0 + M q0 = V c + M q, with q = q*(c) at equilibrium:
 *  M = V (c0 - c) / (q*(c) - q0), every amount converted to one basis. */
export function batchDose(b: BatchInput): BatchResult {
  const nan = { c: NaN, q: NaN, M_g: NaN, slope: NaN };
  if (b.cU.amount !== b.qU.amount)
    return { ...nan, refused: `the concentration is per ${b.cU.amount === "mg" ? "mass" : "mole"} and `
      + `the loading per ${b.qU.amount === "mg" ? "mass" : "mole"}: the balance needs one basis, and `
      + "the page does not know the solute's molar mass.  Choose both units in mass or both in moles." };
  if (!(b.V_L > 0) || !(b.c0 > 0)) return { ...nan, refused: "the volume and the initial concentration must be positive" };
  if (!(b.removal > 0 && b.removal < 1)) return { ...nan, refused: "the removal must lie strictly between 0 and 100 %" };
  if (!(b.q0 >= 0)) return { ...nan, refused: "the initial loading cannot be negative" };
  const c = b.c0 * (1 - b.removal);
  const q = isothermQ(b.model, b.params, c);
  if (!(q > b.q0))
    return { ...nan, c, q, refused: `at the target concentration the isotherm holds q* = ${q.toPrecision(3)}, `
      + `not more than the ${b.q0} the adsorbent already carries: this adsorbent cannot take the solute `
      + "down to that concentration at any dose" };
  const removed = b.V_L * (b.c0 - c) * b.cU.perLitre;    // amount, mg or mmol
  const M_g = removed / ((q - b.q0) * b.qU.perGram);
  //  slope in qU per cU: (V/M) * (cU per L -> amount) / (qU per g -> amount)
  const slope = (b.V_L / M_g) * (b.cU.perLitre / b.qU.perGram);
  return { c, q, M_g, slope };
}
