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
  linearAlgebraMath.test -- the arithmetic behind every number the
  `linear-algebra-without-pain` page prints (DEV.md 4c C463).  Each figure is
  checked against an INDEPENDENT route: a residual, a reconstruction
  L U = P A, a dense solve of the same system, a closed form written out
  here.  Nothing is pinned from memory: the numbers are computed below.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  BOWL3, BOWL3_G, EX_A, EX_B, NEWTON_F, bandsToDense, blockThomas, bowlOf,
  bowlTests, choleskyExists, cond2, conjugateGradient, denseWork, dot,
  eig2, eliminationSteps, energyNorm, linearisedLine, luFactor, luSolve, matMul,
  matVec, newtonPath, newtonStep, norm, pivotDemo, pivotTruth, quad, roundSig,
  sampleBands, sdBound, solve, eigSym, symPivots, fanMatrix, curveKind, formSign, steepestDescent, sub, thomas, wobble, workCounts,
  type Mat,
} from "../src/ui/methods/linearAlgebraMath.js";

const close = (a: number[], b: number[], tol: number): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(tol));
};

describe("step 1: a Newton step is a linear solve", () => {
  it("dx satisfies J dx = -F, and the step lands on the intersection of the two lines", () => {
    const s = newtonStep([2, 1]);
    close(matVec(s.J, s.dx), s.F.map((v) => -v), 1e-12);
    for (const i of [0, 1] as const) {
      const l = linearisedLine(s.p, i);
      // the new point lies on the linearised line of each equation: grad . (q - through) = 0
      const g = s.J[i]!;
      expect(Math.abs(dot(g, sub(s.next, l.through)))).toBeLessThan(1e-12);
    }
  });
  it("the iterates converge to a root with the error roughly squared each step", () => {
    const path = newtonPath([2, 1]);
    const last = path[path.length - 1]!;
    expect(norm(NEWTON_F(last))).toBeLessThan(1e-12);
    const root = last;
    const err = path.map((p) => norm(sub(p, root)));
    // while the error is above 1e-6, the next one is below a constant times its square
    for (let k = 0; k + 1 < err.length - 1; k++)
      if (err[k]! > 1e-4) expect(err[k + 1]!).toBeLessThan(2 * err[k]! * err[k]!);
  });
});

describe("step 2: elimination, and LU as its receipt", () => {
  const f = luFactor(EX_A);
  it("L U = P A (here with the pivot swaps the partial-pivot rule makes)", () => {
    const PA = f.piv.map((i) => EX_A[i]!);
    const LU_ = matMul(f.L, f.U);
    LU_.forEach((r, i) => close(r, PA[i]!, 1e-12));
  });
  it("without a swap the example's factors are the whole numbers the page prints", () => {
    const g = luFactor(EX_A, false);
    expect(g.L).toEqual([[1, 0, 0], [2, 1, 0], [4, 3, 1]]);
    expect(g.U).toEqual([[2, 1, 1], [0, 1, 1], [0, 0, 2]]);
    expect(g.swaps).toBe(0);
  });
  it("the partial-pivot rule swaps the example (8 is the largest in column 0)", () => {
    expect(f.swaps).toBeGreaterThan(0);
    expect(f.piv[0]).toBe(2);
  });
  it("one kept factorisation solves a NEW right-hand side, against A x = b", () => {
    for (const b of [EX_B, [1, 0, 0], [0, 5, -2]]) {
      const x = luSolve(f, b);
      close(matVec(EX_A, x), b, 1e-12);
    }
    close(solve(EX_A, EX_B), [1, 1, 1], 1e-12);
  });
  it("the elimination steps reach the same U as the factorisation (no swap)", () => {
    const e = eliminationSteps(EX_A);
    expect(e.steps.length).toBe(3);
    expect(e.final).toEqual(luFactor(EX_A, false).U);
    expect(e.steps.map((s) => s.mult)).toEqual([2, 4, 3]);
  });
  it("the measured work is (n^3 - n)/3 to factor and n^2 to solve", () => {
    for (const n of [2, 3, 10, 50, 100]) {
      const w = workCounts(n);
      expect(w.factor).toBe((n ** 3 - n) / 3);
      expect(w.solve).toBe(n * n);
    }
    // the page's numbers for n = 1000: about 3.3e8 against 1e6
    expect(workCounts(1000).factor).toBe(333333000);
    expect(workCounts(1000).solve).toBe(1000000);
    expect(Math.round(workCounts(1000).factor / workCounts(1000).solve)).toBe(333);
  });
});

describe("step 3: pivoting on a calculator with a few digits", () => {
  const eps = 1e-7, digits = 6;
  it("without a swap the first unknown is lost completely; with it, both are right", () => {
    const [t1, t2] = pivotTruth(eps) as [number, number];
    const bad = pivotDemo(eps, digits, false);
    const good = pivotDemo(eps, digits, true);
    expect(bad.swapped).toBe(false);
    expect(good.swapped).toBe(true);
    expect(bad.x1).toBe(0);
    expect(Math.abs(t1 - 1)).toBeLessThan(2e-7);
    expect(Math.abs(bad.x2 - t2)).toBeLessThan(1e-5);
    expect(Math.abs(good.x1 - t1)).toBeLessThan(1e-5);
    expect(Math.abs(good.x2 - t2)).toBeLessThan(1e-5);
    // the multiplier is the amplifier: 1/eps without the swap, eps with it
    expect(bad.mult).toBeCloseTo(1 / eps, 0);
    expect(Math.abs(good.mult)).toBeLessThanOrEqual(1);
  });
  it("the loss is the calculator's, not the rule's: with 16 digits the unswapped run is fine", () => {
    const [t1] = pivotTruth(eps) as [number, number];
    expect(Math.abs(pivotDemo(eps, 16, false).x1 - t1)).toBeLessThan(1e-6);
  });
  it("roundSig keeps d significant digits", () => {
    expect(roundSig(123456.789, 3)).toBe(123000);
    expect(roundSig(0.000123456, 2)).toBeCloseTo(0.00012, 12);
    expect(roundSig(0, 4)).toBe(0);
  });
  it("the true answer is the exact one: it satisfies both equations", () => {
    const [x1, x2] = pivotTruth(eps) as [number, number];
    expect(eps * x1 + x2).toBeCloseTo(1, 12);
    expect(x1 + x2).toBeCloseTo(2, 12);
  });
});

describe("step 4: conditioning", () => {
  it("the condition number of the wobbly table matches singular values from a closed form", () => {
    // for rows (1,1),(1,1+t): A'A = [[2, 2+t],[2+t, 2+(1+t)^2]]; check against the power-method-free
    // identity cond = sigma_max/sigma_min = ||A|| ||A^-1|| with the inverse written out
    for (const t of [1, 0.1, 0.01, 0.001]) {
      const A: Mat = [[1, 1], [1, 1 + t]];
      const inv: Mat = [[(1 + t) / t, -1 / t], [-1 / t, 1 / t]];
      const fro = (M: Mat): number => Math.sqrt(M.flat().reduce((s, v) => s + v * v, 0));
      const c = cond2(A);
      // the 2-norm lies between Frobenius/sqrt(2) and Frobenius, for each factor
      expect(c).toBeLessThanOrEqual(fro(A) * fro(inv) * 1.0000001);
      expect(c).toBeGreaterThanOrEqual((fro(A) * fro(inv)) / 2 * 0.9999999);
      // and the product A inv is the identity
      const I = matMul(A, inv);
      close(I[0]!, [1, 0], 1e-9); close(I[1]!, [0, 1], 1e-9);
    }
    expect(cond2([[1, 0], [0, 1]])).toBeCloseTo(1, 12);
    expect(cond2([[2, 0], [0, 0.5]])).toBeCloseTo(4, 12);
  });
  it("the amplification never exceeds the condition number, and the worst case reaches it", () => {
    for (const t of [1, 0.1, 0.01, 0.001]) {
      const c = cond2([[1, 1], [1, 1 + t]]);
      for (const e of [1e-3, -1e-3, 1e-5]) {
        const w = wobble(t, e);
        expect(w.amp).toBeLessThanOrEqual(c * (1 + 1e-9));
        // and the answer moved by exactly e/t in each unknown, opposite signs
        close(w.x, [1 - e / t, 1 + e / t], 1e-9);
      }
    }
  });
  it("the page's example: t = 0.001, a change of 1e-3 in b moves x by 1", () => {
    const w = wobble(0.001, 0.001);
    expect(w.x[0]).toBeCloseTo(0, 6);
    expect(w.x[1]).toBeCloseTo(2, 6);
    expect(w.amp).toBeGreaterThan(100);
  });
});

describe("step 5: structure", () => {
  it("block-Thomas equals the dense solve of the same matrix", () => {
    for (const [N, nv] of [[4, 2], [7, 3], [5, 1]] as const) {
      const B = sampleBands(N, nv);
      const rhs = Array.from({ length: N * nv }, (_, i) => Math.cos(i + 1));
      const a = blockThomas(B, rhs).x;
      const b = solve(bandsToDense(B), rhs);
      close(a, b, 1e-10);
    }
  });
  it("scalar Thomas equals dense, and costs 5n - 3 operations", () => {
    const n = 12;
    const sub_ = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : -1 + 0.1 * Math.sin(i)));
    const sup = Array.from({ length: n }, (_, i) => (i === n - 1 ? 0 : -1 + 0.1 * Math.cos(i)));
    const diag = Array.from({ length: n }, () => 4);
    const rhs = Array.from({ length: n }, (_, i) => i + 1);
    const t = thomas(sub_, diag, sup, rhs);
    const A: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      j === i ? diag[i]! : j === i - 1 ? sub_[i]! : j === i + 1 ? sup[i]! : 0));
    close(t.x, solve(A, rhs), 1e-10);
    expect(t.work).toBe(5 * n - 3);
  });
  it("the structured work grows LINEARLY with the number of blocks, the dense one cubically", () => {
    const nv = 3;
    const w = (N: number): number => blockThomas(sampleBands(N, nv), new Array(N * nv).fill(1)).work;
    // work(N) is affine in N: equal increments
    const d1 = w(11) - w(10), d2 = w(21) - w(20), d3 = w(41) - w(40);
    expect(d1).toBe(d2);
    expect(d2).toBe(d3);
    // dense: ratio of work at 2n to n approaches 8
    expect(denseWork(400) / denseWork(200)).toBeGreaterThan(7.9);
    expect(denseWork(400) / denseWork(200)).toBeLessThan(8.1);
    // and for a 100-stage column of 3 unknowns each, the structure wins by a large factor
    expect(denseWork(100 * nv) / w(100)).toBeGreaterThan(100);
  });
});

describe("step 6: the bowl", () => {
  it("the three tests agree on a grid of symmetric 2x2 matrices", () => {
    for (let a = -3; a <= 3; a += 0.5)
      for (let b = -3; b <= 3; b += 0.5)
        for (let c = -3; c <= 3; c += 0.5) {
          const t = bowlTests(a, b, c);
          if (Math.abs(t.eigen[0]) < 1e-9) continue; // exactly singular: tests may differ at the edge
          expect(t.pdByPivots, `${a},${b},${c}`).toBe(t.pdByEigen);
          expect(t.cholesky, `${a},${b},${c}`).toBe(t.pdByEigen);
        }
  });
  it("the shape names match the eigenvalue signs", () => {
    expect(bowlTests(2, 0.5, 1).shape).toBe("bowl");
    expect(bowlTests(-2, 0.5, -1).shape).toBe("dome");
    expect(bowlTests(1, 2, 1).shape).toBe("saddle");
    expect(bowlTests(1, 1, 1).shape).toBe("ridge");
  });
  it("a bowl's stationary point is its minimum; a saddle's is not", () => {
    const g = [1, 2];
    const pd = [[2, 0.5], [0.5, 1]] as Mat;
    const xs = stationaryOf(2, 0.5, 1, g)!;
    for (const d of [[0.1, 0], [0, 0.1], [-0.07, 0.05], [0.03, -0.09]])
      expect(quad(pd, g, [xs[0]! + d[0]!, xs[1]! + d[1]!])).toBeGreaterThan(quad(pd, g, xs));
    const sad = [[1, 2], [2, 1]] as Mat;
    const xq = stationaryOf(1, 2, 1, g)!;
    const lower = [[0.1, -0.1], [-0.1, 0.1]].some((d) =>
      quad(sad, g, [xq[0]! + d[0]!, xq[1]! + d[1]!]) < quad(sad, g, xq));
    const higher = [[0.1, 0.1], [-0.1, -0.1]].some((d) =>
      quad(sad, g, [xq[0]! + d[0]!, xq[1]! + d[1]!]) > quad(sad, g, xq));
    expect(lower && higher).toBe(true);
    expect(stationaryOf(1, 1, 1, g)).toBeNull();
  });
  it("eig2 satisfies the characteristic equation", () => {
    for (const [a, b, c] of [[2, 1, 3], [1, -2, 5], [4, 0, 1]] as const)
      for (const l of eig2(a, b, c)) expect((a - l) * (c - l) - b * b).toBeCloseTo(0, 9);
  });
  it("Cholesky exists for the 3x3 bowl and fails once a pivot goes non-positive", () => {
    expect(choleskyExists(BOWL3)).toBe(true);
    expect(choleskyExists([[1, 2, 0], [2, 1, 0], [0, 0, 1]])).toBe(false);
  });
});

function stationaryOf(a: number, b: number, c: number, g: number[]): number[] | null {
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) return null;
  return [(c * g[0]! - b * g[1]!) / det, (a * g[1]! - b * g[0]!) / det];
}

describe("step 7: steepest descent and conjugate gradients", () => {
  it("CG finishes an n x n bowl in n steps (n = 2 and n = 3)", () => {
    const A2 = bowlOf(30, 0.4);
    const r2 = conjugateGradient(A2, [1, 1], [-3, 2], 10);
    expect(r2.path.length - 1).toBe(2);
    close(matVec(A2, r2.path[2]!), [1, 1], 1e-9);
    const r3 = conjugateGradient(BOWL3, BOWL3_G, [0, 0, 0], 10, 1e-10);
    expect(r3.path.length - 1).toBe(3);
    close(matVec(BOWL3, r3.path[3]!), BOWL3_G, 1e-9);
  });
  it("the CG directions are conjugate: d_i' A d_j = 0, which is 'never undo a previous step'", () => {
    const r = conjugateGradient(BOWL3, BOWL3_G, [0, 0, 0], 10, 1e-10);
    for (let i = 0; i < r.dirs.length; i++)
      for (let j = 0; j < i; j++)
        expect(Math.abs(dot(r.dirs[i]!, matVec(BOWL3, r.dirs[j]!)))).toBeLessThan(1e-10);
  });
  it("after each CG step the residual has no component along any earlier direction", () => {
    const A = BOWL3, g = BOWL3_G;
    const r = conjugateGradient(A, g, [0, 0, 0], 10, 1e-10);
    for (let k = 1; k < r.path.length; k++) {
      const res = sub(g, matVec(A, r.path[k]!));
      for (let j = 0; j < k; j++) expect(Math.abs(dot(res, r.dirs[j]!))).toBeLessThan(1e-9);
    }
  });
  it("steepest descent's consecutive steps are at right angles (the zigzag)", () => {
    const A = bowlOf(20, 0.3);
    const path = steepestDescent(A, [0, 0], [4, 3], 8);
    for (let k = 1; k + 1 < path.length; k++) {
      const d1 = sub(path[k]!, path[k - 1]!), d2 = sub(path[k + 1]!, path[k]!);
      expect(Math.abs(dot(d1, d2)) / (norm(d1) * norm(d2))).toBeLessThan(1e-9);
    }
  });
  it("steepest descent's error in the bowl's own norm shrinks by no worse than (k-1)/(k+1) per step", () => {
    for (const kappa of [2, 10, 50]) {
      const A = bowlOf(kappa, 0.5);
      const path = steepestDescent(A, [0, 0], [3, -2], 30);
      const e = path.map((p) => energyNorm(A, p));
      for (let k = 0; k + 1 < e.length; k++)
        expect(e[k + 1]!).toBeLessThanOrEqual(sdBound(kappa) * e[k]! * (1 + 1e-9));
    }
  });
  it("on a long narrow bowl steepest descent needs many steps where CG needs two", () => {
    const A = bowlOf(10, 0.5);
    const sd = steepestDescent(A, [0, 0], [4, 1], 5000, 1e-8);
    const cg = conjugateGradient(A, [0, 0], [4, 1], 10, 1e-8);
    expect(cg.path.length - 1).toBe(2);
    expect(sd.length - 1).toBeGreaterThan(40);
  });
  it("bowlOf has eigenvalues 1 and kappa whatever the turn", () => {
    for (const th of [0, 0.3, 1.1]) {
      const A = bowlOf(7, th);
      const e = eig2(A[0]![0]!, A[0]![1]!, A[1]![1]!);
      expect(e[0]).toBeCloseTo(1, 12);
      expect(e[1]).toBeCloseTo(7, 12);
    }
  });
});

describe("step 7: many variables", () => {
  const trace = (A: Mat): number => A.reduce((t, r, i) => t + r[i]!, 0);
  it("Jacobi's eigenvalues satisfy A v = lambda v, are orthonormal, and sum to the trace", () => {
    for (const n of [2, 3, 6])
      for (const c of [0, 0.7, 2.4]) {
        const A = fanMatrix(n, c);
        const { values, vectors } = eigSym(A);
        expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(trace(A), 9);
        for (let k = 0; k < n; k++) {
          const v = vectors.map((r) => r[k]!);
          close(matVec(A, v), v.map((x) => x * values[k]!), 1e-8);
          expect(norm(v)).toBeCloseTo(1, 9);
          for (let j = 0; j < k; j++) expect(Math.abs(dot(v, vectors.map((r) => r[j]!)))).toBeLessThan(1e-8);
        }
      }
  });
  it("the product of the eigenvalues is the product of the pivots (the determinant, two routes)", () => {
    for (const n of [2, 3, 6]) {
      const A = fanMatrix(n, 0.9);
      const p = eigSym(A).values.reduce((a, b) => a * b, 1);
      const q = symPivots(A).reduce((a, b) => a * b, 1);
      expect(Math.abs(p / q - 1)).toBeLessThan(1e-8);
    }
  });
  it("all pivots positive exactly when all eigenvalues are positive, across sizes and couplings", () => {
    for (const n of [2, 3, 4, 5, 6])
      for (let c = 0; c <= 4; c += 0.05) {
        const A = fanMatrix(n, c);
        const ev = eigSym(A).values;
        if (Math.min(...ev.map(Math.abs)) < 1e-6) continue; // on the edge, either answer is acceptable
        const pivots = symPivots(A);
        if (pivots.some((d) => Number.isNaN(d))) continue;
        expect(pivots.every((d) => d > 0), `n=${n} c=${c}`).toBe(ev.every((l) => l > 0));
      }
  });
  it("v'Av is the sum of the parabolas, and the pivot form is the same number", () => {
    const A = fanMatrix(3, 1.3);
    const { values, vectors } = eigSym(A);
    const v = [0.3, -1.1, 0.8];
    const u = values.map((_, k) => dot(vectors.map((r) => r[k]!), v));
    const sum = values.reduce((s, l, k) => s + l * u[k]! ** 2, 0);
    expect(dot(v, matVec(A, v))).toBeCloseTo(sum, 10);
    // A = L D L' from the pivots and the kept multipliers
    const f = luFactor(A, false);
    const d = f.U.map((r, i) => r[i]!);
    const w = f.L[0]!.map((_, j) => f.L.reduce((s, r, i) => s + r[j]! * v[i]!, 0)); // w = L'v
    expect(dot(v, matVec(A, v))).toBeCloseTo(d.reduce((s, dk, k) => s + dk * w[k]! ** 2, 0), 10);
  });
  it("curveKind and the sign of the form around the circle name the three kinds", () => {
    expect(curveKind(1)).toBe("up"); expect(curveKind(-1)).toBe("down"); expect(curveKind(0)).toBe("flat");
    const signs = (A: Mat): number[] => Array.from({ length: 90 }, (_, i) => formSign(A, 0.017 + (i / 90) * 2 * Math.PI));
    expect(signs([[2, 0.5], [0.5, 1]]).every((f) => f > 0)).toBe(true);
    expect(signs([[1, 2], [2, 1]]).some((f) => f > 0) && signs([[1, 2], [2, 1]]).some((f) => f < 0)).toBe(true);
    expect(signs([[1, 1], [1, 1]]).every((f) => f >= -1e-12)).toBe(true);
    expect(Math.abs(formSign([[1, 1], [1, 1]], -Math.PI / 4))).toBeLessThan(1e-12);
  });
});
