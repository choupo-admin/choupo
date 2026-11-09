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
  relaxationMath -- the arithmetic of the `relaxation` EduTool (DEV.md 4c
  C246), the ENTRY page of the numerics path.  TWO PLANES, as in wegsteinMath.

  PLANE B (the transparent one) is a ONE-variable linear fixed point
  `x = G(x)` written in the error u = x - x*, so that one dimensionless number
  governs everything:

        u+ = a u            direct substitution
        u+ = (1 - w) u + w a u = (1 - w + w a) u        relaxation, factor w

  `a` is the loop gain (the slope of G).  The relaxed iteration is the same
  iteration on the map H(x) = (1 - w) x + w G(x), whose slope is the EFFECTIVE
  slope 1 - w + w a.  That is the whole lesson in three lines: the iteration
  converges iff |1 - w + w a| < 1, a w < 1 tames a < -1 (the oscillating
  loop), and no w <= 1 rescues a >= 1 (the runaway loop), because then
  1 - w + w a = 1 + w (a - 1) >= 1.

  THE OPTIMAL FACTOR.  Setting the effective slope to zero gives
  w* = 1 / (1 - a): the relaxed iteration then lands on the fixed point in one
  pass (for a linear G).  w* <= 1 only for a <= 0, so for 0 < a < 1 the optimal
  factor is an OVER-relaxation (w* > 1), which `recycleRelaxation` refuses
  (0 < w <= 1, src/unitOperations/flowsheet/Flowsheet.cpp) and which Wegstein
  reaches by itself.

  WEGSTEIN IS THIS SAME FORMULA with w = 1 - q chosen from the last two
  iterates: the engine's update x+ = q x + (1 - q) G(x)
  (src/solver/Wegstein.cpp:49-92) is (1 - w) x + w G(x) with w = 1 - q.  On a
  linear G the secant slope is a exactly, so the unclamped coefficient is
  q = a/(a - 1) and w = 1 - q = 1/(1 - a) = w*.  So an unclamped Wegstein IS
  the optimal relaxation, found by itself -- and the clamp [qMin, qMax] is a
  clamp on w.  Wegstein's step is driven here by the page's own transcription
  `wegsteinStep` (wegsteinMath.ts), not by a second copy.

  NEWTON is the limit where the whole slope is used: u+ = u - r(u)/r'(u) with
  r = G(x) - x, r' = a - 1, so u+ = 0 in ONE step for any a != 1 (and no step
  at a = 1, where r' = 0).  Its globalisation is not a fixed factor: the
  engine's line search shortens only the steps that need it
  (src/solver/NewtonND.cpp, Armijo), which is why a fixed factor is the wrong
  default for Newton and a step CAP is the honest knob.

  PLANE A is the engine: `recycleSolver directSubstitution; recycleRelaxation
  w;` on process03_recycle, the tear residual per pass read from three runs.
  This module contributes only the dict overrides that ask for them.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";
import { wegsteinStep } from "./wegsteinMath.js";

// ---- The map ----------------------------------------------------------------

/** The loop gain's range on the page's controls.  |a| = 2 is far outside what
 *  a plant has, and that is the point: it lets the student SEE both failures. */
export const GAIN_MIN = -2;
export const GAIN_MAX = 2;
/** The relaxation factor's range on the (a, w) map.  The engine's key is
 *  0 < w <= 1; the map continues to 2 so the over-relaxed region -- where
 *  Wegstein lives -- is visible and labelled as the part the key refuses. */
export const W_MIN = 0.05;
export const W_MAX = 2;
/** The engine's own bound on `recycleRelaxation`. */
export const ENGINE_W_MAX = 1;

/** Default clamp of the engine's recycle Wegstein
 *  (src/unitOperations/flowsheet/Flowsheet.cpp, recycleWegsteinQmin/Qmax). */
export const ENGINE_QMIN = -1;
export const ENGINE_QMAX = 0;
/** The "open" clamp the page can switch to, to show unclamped Wegstein. */
export const OPEN_QMIN = -5;
export const OPEN_QMAX = 0.99;

/** The slope of the relaxed iteration, 1 - w + w a. */
export const effectiveSlope = (a: number, w: number): number => 1 - w + w * a;

/** w* = 1/(1 - a): the factor that makes the effective slope zero.  Null at
 *  a >= 1, where no finite POSITIVE factor does: at a > 1 the zero-slope
 *  factor 1/(1 - a) exists but is negative (a reversed step, Wegstein's
 *  q = 1 - w > 1), off this page's w > 0 plane; at a = 1 none exists. */
export const optimalW = (a: number): number | null =>
  a < 1 ? 1 / (1 - a) : null;

/** True iff the relaxed iteration contracts: |1 - w + w a| < 1. */
export const converges = (a: number, w: number): boolean =>
  Math.abs(effectiveSlope(a, w)) < 1;

/** Passes to shrink the error by `factor` (default 1e-6), or null when the
 *  iteration does not contract.  slope 0 means one pass. */
export function passesToReduce(a: number, w: number, factor = 1e-6): number | null {
  const s = Math.abs(effectiveSlope(a, w));
  if (!(s < 1)) return null;
  if (s === 0) return 1;
  return Math.ceil(Math.log(factor) / Math.log(s));
}

/** The four regions of the (a, w) map, for the legend and the tests. */
export type Region = "converges" | "oscillates-out" | "runaway" | "neutral";
export function region(a: number, w: number): Region {
  const s = effectiveSlope(a, w);
  if (Math.abs(s) < 1) return "converges";
  if (a >= 1) return "runaway";
  return s <= -1 ? "oscillates-out" : "neutral";
}

// ---- Driving the four methods on the toy -----------------------------------

export type Method = "direct" | "relaxed" | "wegstein" | "newton";

export interface Run {
  /** |x_k - x*| per pass, starting at the seed error (1). */
  err: number[];
  /** The iterates u_k = x_k - x* (signed), for the cobweb. */
  u: number[];
  /** What the iteration did at the end. */
  stop: "converged" | "cap" | "diverged";
}

export interface DriveOpts {
  maxIter?: number;
  /** Stop when |u| < tol. */
  tol?: number;
  qMin?: number;
  qMax?: number;
}

const DIVERGED = 1e6;

/** One method on the linear toy.  The seed error is 1 (x0 = x* + 1).  G is
 *  G(x) = x* + a (x - x*), so with x* = 0 the iterate IS the error. */
export function drive(
  method: Method, a: number, w: number, o: DriveOpts = {},
): Run {
  const maxIter = o.maxIter ?? 30;
  const tol = o.tol ?? 1e-12;
  const qMin = o.qMin ?? ENGINE_QMIN, qMax = o.qMax ?? ENGINE_QMAX;
  const u: number[] = [1];
  let prev: { x: number[]; gx: number[] } | null = null;
  let stop: Run["stop"] = "cap";
  for (let k = 0; k < maxIter; ++k) {
    const x = u[k] as number;
    if (Math.abs(x) < tol) { stop = "converged"; break; }
    if (!Number.isFinite(x) || Math.abs(x) > DIVERGED) { stop = "diverged"; break; }
    const gx = a * x;
    let next: number;
    switch (method) {
      case "direct": next = gx; break;
      case "relaxed": next = (1 - w) * x + w * gx; break;
      case "wegstein": {
        const st = wegsteinStep([x], [gx], prev, qMin, qMax)[0];
        next = st ? st.next : gx;
        prev = { x: [x], gx: [gx] };
        break;
      }
      case "newton":
        //  r = G(x) - x, r' = a - 1 : exact for a linear G.
        next = Math.abs(a - 1) < 1e-12 ? x : x - (gx - x) / (a - 1);
        break;
    }
    u.push(next);
  }
  return { err: u.map(Math.abs), u, stop };
}

// ---- Plane A: the engine half ----------------------------------------------

/** The recycle witness the engine half runs; the same case the Wegstein page
 *  uses, so the two pages agree on what a real recycle looks like. */
export const RELAXATION_WITNESS = "steady/flowsheets/process03_recycle";
/** The three factors the engine half compares. */
export const ENGINE_W_VALUES = [0.3, 0.6, 1.0] as const;

const SOLVER_DICT = "system/solverDict";

/** The overrides that put the witness on direct substitution with factor w:
 *  the shipped `recycleSolver Newton;` becomes `directSubstitution`, and the
 *  one new key is appended (a knob can replace a declared value, not add a
 *  key, so the append is its own override kind).  Nothing else changes. */
export function relaxationOverrides(w: number): DictOverride[] {
  return [
    { file: SOLVER_DICT, key: "recycleSolver", word: "directSubstitution" },
    { file: SOLVER_DICT, append: `recycleRelaxation ${w};` },
  ];
}
