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
  linearAlgebraMath -- the arithmetic of the `linear-algebra-without-pain`
  EduTool (DEV.md 4c C463).  Small dense matrices (2x2, 3x3, and a block-
  tridiagonal one) written the way a student would do them by hand, so every
  number the page prints is recomputed by tests/linearAlgebraMath.test.ts
  against an independent route (a residual, a reconstruction L U = P A, a
  dense solve of the same system).

  WHAT THIS IS NOT.  It is a transcription of the IDEA of src/solver/LU.cpp
  (partial pivoting, the multipliers kept below the diagonal), not of its
  code: the engine also equilibrates the matrix and refuses a pivot that is
  zero to working precision, and neither is needed to teach the idea.  The
  page says so in its limits.
\*---------------------------------------------------------------------------*/

export type Vec = number[];
export type Mat = number[][];

export const matVec = (A: Mat, x: Vec): Vec =>
  A.map((row) => row.reduce((s, a, j) => s + a * (x[j] ?? 0), 0));
export const dot = (a: Vec, b: Vec): number => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
export const norm = (a: Vec): number => Math.sqrt(dot(a, a));
export const sub = (a: Vec, b: Vec): Vec => a.map((v, i) => v - (b[i] ?? 0));
export const add = (a: Vec, b: Vec): Vec => a.map((v, i) => v + (b[i] ?? 0));
export const scale = (a: Vec, s: number): Vec => a.map((v) => v * s);
export const copyMat = (A: Mat): Mat => A.map((r) => r.slice());
export const identity = (n: number): Mat =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const matMul = (A: Mat, B: Mat): Mat =>
  A.map((row) => B[0]!.map((_, j) => row.reduce((s, a, k) => s + a * B[k]![j]!, 0)));

// ---------------------------------------------------------------------------
//  Step 1.  A Newton step is a linear solve.
// ---------------------------------------------------------------------------

/** The toy nonlinear pair of step 1: a circle and a hyperbola.
 *  F1 = x^2 + y^2 - 4,  F2 = x y - 1. */
export const NEWTON_F = (p: Vec): Vec => [p[0]! * p[0]! + p[1]! * p[1]! - 4, p[0]! * p[1]! - 1];
/** Its Jacobian, written out (the engine differences it numerically). */
export const NEWTON_J = (p: Vec): Mat => [[2 * p[0]!, 2 * p[1]!], [p[1]!, p[0]!]];

export interface NewtonStep { p: Vec; F: Vec; J: Mat; dx: Vec; next: Vec; }

/** One Newton step: solve J dx = -F, move to p + dx. */
export function newtonStep(p: Vec): NewtonStep {
  const Fp = NEWTON_F(p);
  const Jp = NEWTON_J(p);
  const dx = solve(Jp, Fp.map((v) => -v));
  return { p, F: Fp, J: Jp, dx, next: add(p, dx) };
}

/** The Newton iterates from p0, stopping when ||F|| < tol or after maxIt. */
export function newtonPath(p0: Vec, maxIt = 12, tol = 1e-12): Vec[] {
  const path = [p0];
  let p = p0;
  for (let k = 0; k < maxIt; k++) {
    if (norm(NEWTON_F(p)) < tol) break;
    try { p = newtonStep(p).next; } catch { break; }
    path.push(p);
  }
  return path;
}

/** The line a linearised equation draws: the set of points q where
 *  F_i(p) + grad F_i(p) . (q - p) = 0, as a point and a direction. */
export function linearisedLine(p: Vec, i: 0 | 1): { through: Vec; dir: Vec } {
  const g = NEWTON_J(p)[i]!;
  const f = NEWTON_F(p)[i]!;
  const n2 = g[0]! * g[0]! + g[1]! * g[1]!;
  return {
    through: [p[0]! - (f * g[0]!) / n2, p[1]! - (f * g[1]!) / n2],
    dir: [-g[1]!, g[0]!],
  };
}

// ---------------------------------------------------------------------------
//  Step 2.  Elimination, and LU as its receipt.
// ---------------------------------------------------------------------------

/** The page's running 3x3 (a textbook example: its factors are whole numbers). */
export const EX_A: Mat = [[2, 1, 1], [4, 3, 3], [8, 7, 9]];
export const EX_B: Vec = [4, 10, 24];

export interface LU { L: Mat; U: Mat; piv: number[]; swaps: number; }

/** LU with partial pivoting, the way src/solver/LU.cpp does it in spirit:
 *  pick the largest |entry| in the column at or below the diagonal, swap,
 *  keep the multiplier where the zero would be.  `pivot = false` skips the
 *  swap (to show why it is there) and throws on an exact zero pivot. */
export function luFactor(A0: Mat, pivot = true): LU {
  const n = A0.length;
  const A = copyMat(A0);
  const piv = Array.from({ length: n }, (_, i) => i);
  let swaps = 0;
  for (let k = 0; k < n; k++) {
    let p = k;
    if (pivot) {
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i]![k]!) > Math.abs(A[p]![k]!)) p = i;
    }
    if (A[p]![k]! === 0) throw new Error(`zero pivot at column ${k}`);
    if (p !== k) {
      [A[k], A[p]] = [A[p]!, A[k]!];
      [piv[k], piv[p]] = [piv[p]!, piv[k]!];
      swaps++;
    }
    for (let i = k + 1; i < n; i++) {
      const m = A[i]![k]! / A[k]![k]!;
      A[i]![k] = m;
      for (let j = k + 1; j < n; j++) A[i]![j]! -= m * A[k]![j]!;
    }
  }
  const L = identity(n);
  const U = A.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (j < i) L[i]![j] = A[i]![j]!; else U[i]![j] = A[i]![j]!;
    }
  return { L, U, piv, swaps };
}

/** Solve with a kept factorisation: permute b, forward-substitute L y = P b,
 *  back-substitute U x = y.  Only n^2 work, whatever b is. */
export function luSolve(f: LU, b: Vec): Vec {
  const n = f.L.length;
  const pb = f.piv.map((i) => b[i]!);
  const y: Vec = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = pb[i]!;
    for (let j = 0; j < i; j++) s -= f.L[i]![j]! * y[j]!;
    y[i] = s;
  }
  const x: Vec = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let j = i + 1; j < n; j++) s -= f.U[i]![j]! * x[j]!;
    x[i] = s / f.U[i]![i]!;
  }
  return x;
}

export const solve = (A: Mat, b: Vec): Vec => luSolve(luFactor(A), b);

/** The elimination as a student writes it: one entry per row operation. */
export interface ElimStep { row: number; from: number; mult: number; after: Mat; }
export function eliminationSteps(A0: Mat): { steps: ElimStep[]; final: Mat } {
  const n = A0.length;
  const A = copyMat(A0);
  const steps: ElimStep[] = [];
  for (let k = 0; k < n; k++)
    for (let i = k + 1; i < n; i++) {
      const m = A[i]![k]! / A[k]![k]!;
      for (let j = k; j < n; j++) A[i]![j]! -= m * A[k]![j]!;
      steps.push({ row: i, from: k, mult: m, after: copyMat(A) });
    }
  return { steps, final: A };
}

/** Operation counts, measured by instrumenting the loops (not a formula):
 *  one division or one multiply-add = one operation. */
export function workCounts(n: number): { factor: number; solve: number } {
  let factor = 0;
  for (let k = 0; k < n; k++)
    for (let i = k + 1; i < n; i++) { factor += 1; for (let j = k + 1; j < n; j++) factor += 1; }
  let sol = 0;
  for (let i = 0; i < n; i++) { for (let j = 0; j < i; j++) sol += 1; }
  for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) sol += 1; sol += 1; }
  return { factor, solve: sol };
}

// ---------------------------------------------------------------------------
//  Step 3.  Pivoting: a calculator with `digits` significant digits.
// ---------------------------------------------------------------------------

/** Round to d significant digits: the calculator every operation passes through. */
export function roundSig(x: number, d: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const e = Math.floor(Math.log10(Math.abs(x)));
  const f = Math.pow(10, d - 1 - e);
  return Math.round(x * f) / f;
}

export interface Pivot2 { swapped: boolean; mult: number; u22: number; c2: number; x2: number; x1: number; }

/** Solve [[eps, 1], [1, 1]] x = [1, 2] on a `digits`-digit calculator, with
 *  or without the row swap.  True answer: x1 = 1/(1-eps), x2 = (1-2 eps)/(1-eps). */
export function pivotDemo(eps: number, digits: number, swap: boolean): Pivot2 {
  const r = (x: number): number => roundSig(x, digits);
  let [a11, a12, b1] = [eps, 1, 1];
  let [a21, a22, b2] = [1, 1, 2];
  const doSwap = swap && Math.abs(a21) > Math.abs(a11);
  if (doSwap) [a11, a12, b1, a21, a22, b2] = [a21, a22, b2, a11, a12, b1];
  const mult = r(a21 / a11);
  const u22 = r(a22 - r(mult * a12));
  const c2 = r(b2 - r(mult * b1));
  const x2 = r(c2 / u22);
  const x1 = r(r(b1 - r(a12 * x2)) / a11);
  return { swapped: doSwap, mult, u22, c2, x2, x1 };
}
export const pivotTruth = (eps: number): Vec => [1 / (1 - eps), (1 - 2 * eps) / (1 - eps)];

// ---------------------------------------------------------------------------
//  Step 4.  Conditioning: two nearly parallel lines.
// ---------------------------------------------------------------------------

/** The wobbly table: rows (1, 1) and (1, 1 + t).  Small t = nearly parallel. */
export const wobbleMatrix = (t: number): Mat => [[1, 1], [1, 1 + t]];

/** 2-norm condition number of a 2x2: sqrt(lmax / lmin) of A'A. */
export function cond2(A: Mat): number {
  const [[a, b], [c, d]] = A as [[number, number], [number, number]];
  const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d;
  const tr = p + r, det = p * r - q * q;
  const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
  const lmax = tr / 2 + disc, lmin = tr / 2 - disc;
  return lmin <= 0 ? Infinity : Math.sqrt(lmax / lmin);
}

/** Solve the wobble system for b = A (1,1) + (0, e): the true answer is
 *  (1,1) and e is the wobble in the second right-hand side.  Returns the
 *  answer, the relative change of b and of x, and their ratio. */
export function wobble(t: number, e: number): { x: Vec; relB: number; relX: number; amp: number } {
  const A = wobbleMatrix(t);
  const b0 = matVec(A, [1, 1]);
  const b = [b0[0]!, b0[1]! + e];
  const x = solve(A, b);
  const relB = norm([0, e]) / norm(b0);
  const relX = norm(sub(x, [1, 1])) / norm([1, 1]);
  return { x, relB, relX, amp: relB === 0 ? 0 : relX / relB };
}

// ---------------------------------------------------------------------------
//  Step 5.  Structure: tridiagonal and block-tridiagonal.
// ---------------------------------------------------------------------------

/** A reproducible, diagonally dominant block-tridiagonal matrix (so it needs no
 *  cross-block pivoting) of N blocks of nv x nv. */
export interface Bands { N: number; nv: number; sub: Mat[]; diag: Mat[]; sup: Mat[]; }
export function sampleBands(N: number, nv: number): Bands {
  const val = (b: number, i: number, j: number, w: number): number =>
    Math.sin(1 + 7 * b + 3 * i + 5 * j + 11 * w);
  const mk = (b: number, w: number): Mat =>
    Array.from({ length: nv }, (_, i) => Array.from({ length: nv }, (_, j) => val(b, i, j, w)));
  const out: Bands = { N, nv, sub: [], diag: [], sup: [] };
  for (let b = 0; b < N; b++) {
    const D = mk(b, 0);
    for (let i = 0; i < nv; i++) D[i]![i]! += 6 * nv;
    out.diag.push(D);
    out.sub.push(b === 0 ? D.map((r) => r.map(() => 0)) : mk(b, 1));
    out.sup.push(b === N - 1 ? D.map((r) => r.map(() => 0)) : mk(b, 2));
  }
  return out;
}
export function bandsToDense(B: Bands): Mat {
  const n = B.N * B.nv;
  const A: Mat = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let b = 0; b < B.N; b++)
    for (let i = 0; i < B.nv; i++)
      for (let j = 0; j < B.nv; j++) {
        A[b * B.nv + i]![b * B.nv + j] = B.diag[b]![i]![j]!;
        if (b > 0) A[b * B.nv + i]![(b - 1) * B.nv + j] = B.sub[b]![i]![j]!;
        if (b < B.N - 1) A[b * B.nv + i]![(b + 1) * B.nv + j] = B.sup[b]![i]![j]!;
      }
  return A;
}

/** Block-Thomas: the Thomas algorithm with small matrices in place of numbers.
 *  Returns the solution and the number of operations it spent (counted in the
 *  loops).  Each pivot block is factored by `luFactor` above, as the engine's
 *  BlockTridiagonal.cpp does with its dense luFactor. */
export function blockThomas(B: Bands, rhs: Vec): { x: Vec; work: number } {
  const { N, nv } = B;
  let work = 0;
  const fac: LU[] = [];
  const Lm: Mat[] = [];
  for (let b = 0; b < N; b++) {
    let D = copyMat(B.diag[b]!);
    if (b > 0) {
      // L_b = sub_b inv(D'_{b-1}): inv(D') is built column by column from the
      // kept factors, then multiplied in.
      const inv: Mat = Array.from({ length: nv }, () => new Array(nv).fill(0));
      for (let c = 0; c < nv; c++) {
        const e = new Array(nv).fill(0) as number[];
        e[c] = 1;
        const col = luSolve(fac[b - 1]!, e);
        work += nv * nv;
        for (let r = 0; r < nv; r++) inv[r]![c] = col[r]!;
      }
      Lm[b] = matMul(B.sub[b]!, inv);
      work += nv * nv * nv;
      const prod = matMul(Lm[b]!, B.sup[b - 1]!);
      work += nv * nv * nv;
      D = D.map((r, i) => r.map((v, j) => v - prod[i]![j]!));
    }
    work += workCounts(nv).factor;
    fac.push(luFactor(D));
  }
  const y: Vec[] = [];
  for (let b = 0; b < N; b++) {
    let r = rhs.slice(b * nv, (b + 1) * nv);
    if (b > 0) {
      r = sub(r, matVec(Lm[b]!, y[b - 1]!));
      work += nv * nv;
    }
    y.push(r);
  }
  const x: Vec[] = new Array(N);
  for (let b = N - 1; b >= 0; b--) {
    let r = y[b]!;
    if (b < N - 1) {
      r = sub(r, matVec(B.sup[b]!, x[b + 1]!));
      work += nv * nv;
    }
    x[b] = luSolve(fac[b]!, r);
    work += nv * nv;
  }
  return { x: x.flat(), work };
}

/** Dense work for the same system: one factorisation plus one solve, measured. */
export function denseWork(n: number): number {
  const w = workCounts(n);
  return w.factor + w.solve;
}

/** Scalar Thomas (nv = 1): operations counted in the loops. */
export function thomas(subd: Vec, diag: Vec, sup: Vec, rhs: Vec): { x: Vec; work: number } {
  const n = diag.length;
  const c = new Array(n).fill(0) as number[];
  const d = new Array(n).fill(0) as number[];
  let work = 0;
  c[0] = sup[0]! / diag[0]!; d[0] = rhs[0]! / diag[0]!; work += 2;
  for (let i = 1; i < n; i++) {
    const den = diag[i]! - subd[i]! * c[i - 1]!; work += 1;
    c[i] = sup[i]! / den; d[i] = (rhs[i]! - subd[i]! * d[i - 1]!) / den; work += 3;
  }
  const x = new Array(n).fill(0) as number[];
  x[n - 1] = d[n - 1]!;
  for (let i = n - 2; i >= 0; i--) { x[i] = d[i]! - c[i]! * x[i + 1]!; work += 1; }
  return { x, work };
}

// ---------------------------------------------------------------------------
//  Step 6.  The bowl.
// ---------------------------------------------------------------------------

export type Shape = "bowl" | "dome" | "saddle" | "ridge";

/** Eigenvalues of the symmetric [[a, b], [b, c]], smaller first. */
export function eig2(a: number, b: number, c: number): [number, number] {
  const m = (a + c) / 2, r = Math.hypot((a - c) / 2, b);
  return [m - r, m + r];
}

/** The three tests of "positive definite", side by side, for a 2x2. */
export interface BowlTests {
  eigen: [number, number]; pivots: [number, number]; cholesky: boolean;
  shape: Shape; pdByEigen: boolean; pdByPivots: boolean;
}
export function bowlTests(a: number, b: number, c: number, tol = 1e-12): BowlTests {
  const eigen = eig2(a, b, c);
  const p2 = a === 0 ? NaN : c - (b * b) / a;
  const pdByEigen = eigen[0] > tol;
  const pdByPivots = a > tol && p2 > tol;
  const cholesky = choleskyExists([[a, b], [b, c]], tol);
  const shape: Shape = pdByEigen ? "bowl"
    : eigen[1] < -tol ? "dome"
    : eigen[0] < -tol && eigen[1] > tol ? "saddle" : "ridge";
  return { eigen, pivots: [a, p2], cholesky, shape, pdByEigen, pdByPivots };
}

/** Does A = R'R exist with a real R (a Cholesky factor)?  It does exactly when
 *  every pivot of the square-root elimination is positive. */
export function choleskyExists(A: Mat, tol = 1e-12): boolean {
  const n = A.length;
  const R: Mat = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    let s = A[j]![j]!;
    for (let k = 0; k < j; k++) s -= R[k]![j]! * R[k]![j]!;
    if (!(s > tol)) return false;
    R[j]![j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) {
      let t = A[j]![i]!;
      for (let k = 0; k < j; k++) t -= R[k]![j]! * R[k]![i]!;
      R[j]![i] = t / R[j]![j]!;
    }
  }
  return true;
}

/** The quadratic f(x) = 1/2 x'Ax - g'x. */
export const quad = (A: Mat, g: Vec, x: Vec): number => 0.5 * dot(x, matVec(A, x)) - dot(g, x);
/** Its stationary point x* with A x* = g (null when A is singular). */
export function stationary(a: number, b: number, c: number, g: Vec): Vec | null {
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) return null;
  return [(c * g[0]! - b * g[1]!) / det, (a * g[1]! - b * g[0]!) / det];
}

// ---------------------------------------------------------------------------
//  Step 7.  Steepest descent and conjugate gradients.
// ---------------------------------------------------------------------------

/** The 2x2 bowl of step 7: eigenvalues 1 and kappa, axes turned by `theta`. */
export function bowlOf(kappa: number, theta: number): Mat {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [[c * c + kappa * s * s, (1 - kappa) * c * s], [(1 - kappa) * c * s, s * s + kappa * c * c]];
}

/** Steepest descent with the exact line search on f = 1/2 x'Ax - g'x. */
export function steepestDescent(A: Mat, g: Vec, x0: Vec, maxIt: number, tol = 1e-12): Vec[] {
  const path = [x0];
  let x = x0;
  for (let k = 0; k < maxIt; k++) {
    const r = sub(g, matVec(A, x));
    if (norm(r) < tol) break;
    const alpha = dot(r, r) / dot(r, matVec(A, r));
    x = add(x, scale(r, alpha));
    path.push(x);
  }
  return path;
}

/** Conjugate gradients.  Each new direction is the new residual with the part
 *  that would undo the previous direction removed. */
export function conjugateGradient(A: Mat, g: Vec, x0: Vec, maxIt: number, tol = 1e-12):
  { path: Vec[]; dirs: Vec[]; resid: number[] } {
  let x = x0;
  let r = sub(g, matVec(A, x));
  let d = r;
  const path = [x], dirs: Vec[] = [], resid = [norm(r)];
  for (let k = 0; k < maxIt; k++) {
    if (norm(r) < tol) break;
    const Ad = matVec(A, d);
    const alpha = dot(r, r) / dot(d, Ad);
    x = add(x, scale(d, alpha));
    const rNew = sub(r, scale(Ad, alpha));
    dirs.push(d);
    const beta = dot(rNew, rNew) / dot(r, r);
    d = add(rNew, scale(d, beta));
    r = rNew;
    path.push(x);
    resid.push(norm(r));
  }
  return { path, dirs, resid };
}

/** The A-norm of the error, ||e||_A = sqrt(e'Ae): the bowl's own height. */
export const energyNorm = (A: Mat, e: Vec): number => Math.sqrt(dot(e, matVec(A, e)));
/** The per-step bound on steepest descent's error in the A-norm. */
export const sdBound = (kappa: number): number => (kappa - 1) / (kappa + 1);

/** The 3x3 bowl of the n-steps claim. */
export const BOWL3: Mat = [[4, 1, 0.5], [1, 3, 0.25], [0.5, 0.25, 2]];
export const BOWL3_G: Vec = [1, 2, 3];

// ---------------------------------------------------------------------------
//  Step 7 of the page.  Many variables: n axes, n parabolas.
// ---------------------------------------------------------------------------

/** Eigenvalues (curvatures along the principal axes) and eigenvectors of a
 *  symmetric matrix, by Jacobi rotations: each rotation turns the axes to kill
 *  one off-diagonal entry, and the sweeps stop when none is left.  Values are
 *  returned in increasing order, vectors as the columns of `vectors`. */
export function eigSym(A0: Mat): { values: Vec; vectors: Mat } {
  const n = A0.length;
  const A = copyMat(A0);
  const V = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i]![j]! ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p]![q]!) < 1e-300) continue;
        const th = (A[q]![q]! - A[p]![p]!) / (2 * A[p]![q]!);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k]![p]!, akq = A[k]![q]!;
          A[k]![p] = c * akp - s * akq; A[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p]![k]!, aqk = A[q]![k]!;
          A[p]![k] = c * apk - s * aqk; A[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k]![p]!, vkq = V[k]![q]!;
          V[k]![p] = c * vkp - s * vkq; V[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[a]![a]! - A[b]![b]!);
  return {
    values: order.map((i) => A[i]![i]!),
    vectors: V.map((row) => order.map((j) => row[j]!)),
  };
}

/** The pivots of the elimination of step 2 run WITHOUT row swaps on a
 *  symmetric matrix (the diagonal of U, i.e. of D in A = L D L').  A zero
 *  pivot stops the run: the remaining pivots are NaN.  Positive definite
 *  exactly when every pivot is positive. */
export function symPivots(A0: Mat): Vec {
  const n = A0.length;
  const A = copyMat(A0);
  const piv: Vec = [];
  for (let k = 0; k < n; k++) {
    const d = A[k]![k]!;
    piv.push(d);
    if (d === 0) { while (piv.length < n) piv.push(NaN); break; }
    for (let i = k + 1; i < n; i++) {
      const m = A[i]![k]! / d;
      for (let j = k; j < n; j++) A[i]![j]! -= m * A[k]![j]!;
    }
  }
  return piv;
}

export type CurveKind = "up" | "down" | "flat";
export const curveKind = (lambda: number, tol = 1e-9): CurveKind =>
  lambda > tol ? "up" : lambda < -tol ? "down" : "flat";

/** The page's perturbable symmetric tables, n = 2, 3, 6: a fixed positive
 *  diagonal 2, 3, 4, ... plus a coupling c between neighbours (and, for n = 6,
 *  between every other pair at half strength).  c = 0 is a bowl; growing c
 *  bends one axis down. */
export function fanMatrix(n: number, c: number): Mat {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    i === j ? 2 + i : Math.abs(i - j) === 1 ? c : n === 6 ? c / 2 : 0));
}

/** The quadratic form v'Av along the unit direction at angle th (2x2). */
export const formSign = (A: Mat, th: number): number => {
  const v = [Math.cos(th), Math.sin(th)];
  return dot(v, matVec(A, v));
};

/** "Positive" is about the NUMBER x'Ax, not about the entries of A.  The two
 *  tables of the page's first picture of step 6: every entry positive but not
 *  positive definite, and negative entries but positive definite. */
export const A_ALL_POSITIVE: Mat = [[1, 2], [2, 1]];
export const A_NEGATIVE_ENTRIES: Mat = [[2, -1], [-1, 2]];
/** The rise x'Ax of the function for a small step x (f(x0 + x) ~ f(x0) + 1/2 x'Ax). */
export const rise = (A: Mat, x: Vec): number => dot(x, matVec(A, x));
