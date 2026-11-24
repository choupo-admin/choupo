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
  optimizersMath -- "Three ways to optimise a flowsheet", the arithmetic.

  TWO TOY LANDSCAPES, DECLARED AS TOYS.  A flowsheet's objective is a
  simulation; these are two functions of two variables a reader can see whole,
  built to have the SHAPE of the shipped optim06 case and nothing more: a
  continuous reflux ratio r beside a number of stages s, a cost to minimise and
  a purity to reach.

      cost    f(s, r) = (r + 1) + 1.6 s_e                 (boil-up plus capital)
      purity  P(s, r) = 1 - exp(-0.6 (s_e - 5) r / (r + 1))
      limit   g(s, r) = 0.98 - P  <=  0                    (the specification)

  SMOOTH:  s_e = s, the stage count is a real number (a relaxation nobody can
  build, but a differentiable function).  STEPPED:  s_e = round(s), the stage
  count is an integer and the function is a staircase in s with a jump of f and
  of g at every half-integer.  Choupo does not feed an integer to a gradient
  method: it ENUMERATES it (OptimizationDriver.cpp, Integer enumeration).  The
  stepped landscape stands for what remains non-smooth after that: a table, a
  piecewise correlation, a regime switch, a phase change.

  THREE METHODS, each written out from its rules and each recording every move
  so the page can draw it:

    * Nelder-Mead -- the engine's own rules and defaults (src/solver/
      NelderMead.cpp), on the objective plus a penalty because the engine's
      Nelder-Mead takes no constraint.
    * SQP -- the engine's structure (src/solver/SQP.cpp): forward finite
      differences, a damped-BFGS Hessian of the Lagrangian, the QP solved by
      the active-set routine of the `active-set-qp` page, the L1 merit
      function and Armijo backtracking.  WITHOUT the engine's Powell
      relaxation and watchdog, which the page does not need on a landscape this
      small (and says so).
    * MADS -- from the papers; the engine's own MADS differs (Halton poll, projection,
      the exact barrier update) and is cited on the page, not copied here.  The poll
      directions are the LTMADS construction restated in the Audet-Custodio-
      Dennis erratum; the mesh and poll sizes, the success / failure update and
      the algorithm's skeleton are Algorithm 2.1 of the NOMAD 4 paper; the
      progressive barrier is a SIMPLIFICATION written from the survey of
      Larson, Menickelly and Wild (2019) because the original paper was not
      available to the author of the page.  Every simplification is listed in
      MADS_SIMPLIFICATIONS and drawn on the page.

  WHAT THIS PROVES: that each rule, written as stated, behaves as the page
  says on these two functions.  It does not prove that any of the three beats
  the others on a flowsheet.
\*---------------------------------------------------------------------------*/

import { activeSetQP, type QPProblem } from "./activeSetQpMath.js";

// ---- the landscapes ---------------------------------------------------------

export type LandscapeId = "smooth" | "stepped";

/** The box of the two variables: s stages, r reflux ratio. */
export const BOX = { sLo: 8, sHi: 14, rLo: 1.5, rHi: 6 } as const;
/** The purity the limit asks for (optim06 asks 0.98 of x_D_LK). */
export const SPEC = 0.98;
const K_SEP = 0.6;
const S0 = 5;
/** Capital per stage, in the units of the cost. */
export const C_STAGE = 1.6;
/** The start every method is given: slightly short of the purity. */
export const START: readonly [number, number] = [13.2, 3.0];

export type Pt = readonly [number, number];

export function stagesEffective(land: LandscapeId, s: number): number {
  return land === "smooth" ? s : Math.round(s);
}

export function purity(land: LandscapeId, s: number, r: number): number {
  const se = stagesEffective(land, s);
  return 1 - Math.exp(-K_SEP * (se - S0) * r / (r + 1));
}

export function cost(land: LandscapeId, s: number, r: number): number {
  return (r + 1) + C_STAGE * stagesEffective(land, s);
}

/** The limit, written so that satisfied means g <= 0. */
export function limit(land: LandscapeId, s: number, r: number, spec = SPEC): number {
  return spec - purity(land, s, r);
}

/** The reflux that just meets the purity at s_e stages, or null when no
 *  finite reflux does (the stage count is too small). */
export function refluxRequired(se: number, spec = SPEC): number | null {
  const a = -Math.log(1 - spec) / (K_SEP * (se - S0));
  if (!(a < 1)) return null;
  return a / (1 - a);
}

/** The exact constrained optimum of the SMOOTH landscape, by a 1-D golden
 *  section on the active curve r = refluxRequired(s) -- independent of every
 *  method on the page. */
export function smoothOptimum(spec = SPEC): { s: number; r: number; f: number } {
  const F = (s: number): number => {
    const r = refluxRequired(s, spec);
    return r === null ? Infinity : r + 1 + C_STAGE * s;
  };
  let a: number = BOX.sLo, b: number = BOX.sHi;
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 200; ++i) {
    const c = b - phi * (b - a), d = a + phi * (b - a);
    if (F(c) < F(d)) b = d; else a = c;
  }
  const s = 0.5 * (a + b);
  const r = refluxRequired(s, spec)!;
  return { s, r, f: r + 1 + C_STAGE * s };
}

/** The best integer stage count, each with its own best reflux: the
 *  enumeration optim06 does, on the toy. */
export function enumerateStages(spec = SPEC): {
  s: number; r: number | null; f: number | null; feasible: boolean;
}[] {
  const out = [];
  for (let s = BOX.sLo; s <= BOX.sHi; ++s) {
    const r = refluxRequired(s, spec);
    const ok = r !== null && r >= BOX.rLo && r <= BOX.rHi;
    out.push({ s, r: ok ? r : null, f: ok ? r! + 1 + C_STAGE * s : null, feasible: ok });
  }
  return out;
}

const clip = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---- Nelder-Mead, the engine's rules ----------------------------------------

/** The penalty weight of the Nelder-Mead objective: f + NM_PENALTY max(0, g).
 *  A user's guess, as it is in a real case (the engine says "add a penalty
 *  term"). */
export const NM_PENALTY = 1000;

export type NmMove = "init" | "reflect" | "expand" | "contract" | "shrink";

export interface NmStep {
  it: number;
  move: NmMove;
  /** The three vertices after the move, best first. */
  verts: [number, number][];
  f: number[];
  evaluations: number;
}

export interface NmResult {
  steps: NmStep[];
  best: [number, number];
  fBest: number;
  converged: boolean;
  reason: string;
}

export interface NmOptions {
  tolX: number; tolF: number; maxIter: number;
  alpha: number; gamma: number; rho: number; sigma: number;
  simplexInitFactor: number; absStep: number;
}

/** The engine's defaults (src/solver/NelderMead.H). */
export const NM_DEFAULTS: NmOptions = {
  tolX: 1e-6, tolF: 1e-6, maxIter: 200,
  alpha: 1, gamma: 2, rho: 0.5, sigma: 0.5,
  simplexInitFactor: 0.05, absStep: 0.01,
};

/** Nelder-Mead exactly as src/solver/NelderMead.cpp writes it: the initial
 *  simplex, reflection, expansion, outside or inside contraction, shrink toward
 *  the best, bounds by clipping, and the two stopping tests.  `init` may pass
 *  the initial vertices (McKinnon's example needs its own). */
export function nelderMead(
  f: (p: Pt) => number, x0: Pt, lo: Pt | null, hi: Pt | null,
  opts: NmOptions = NM_DEFAULTS, init?: readonly Pt[],
): NmResult {
  const n = 2;
  const clipv = (p: [number, number]): [number, number] => {
    if (lo) for (let i = 0; i < n; ++i) if (p[i]! < lo[i]!) p[i] = lo[i]!;
    if (hi) for (let i = 0; i < n; ++i) if (p[i]! > hi[i]!) p[i] = hi[i]!;
    return p;
  };
  let X: [number, number][];
  if (init) X = init.map((p) => clipv([p[0], p[1]]));
  else {
    X = [clipv([x0[0], x0[1]])];
    for (let k = 0; k < n; ++k) {
      const v: [number, number] = [X[0]![0], X[0]![1]];
      const step = Math.abs(v[k]!) > 1e-12 ? opts.simplexInitFactor * Math.abs(v[k]!) : opts.absStep;
      v[k] = v[k]! + step;
      clipv(v);
      if (v[k] === X[0]![k]) { v[k] = v[k]! - 2 * step; clipv(v); }
      X.push(v);
    }
  }
  let evals = 0;
  const ev = (p: [number, number]): number => { ++evals; return f(p); };
  let F = X.map(ev);
  const scale = [0, 1].map((i) =>
    lo && hi ? Math.max(1e-12, hi[i]! - lo[i]!) : Math.max(1e-12, Math.abs(x0[i]!)));
  const order = (): number[] => [0, 1, 2].sort((a, b) => F[a]! - F[b]!);
  const snap = (it: number, move: NmMove): NmStep => {
    const o = order();
    return {
      it, move, verts: o.map((k) => [X[k]![0], X[k]![1]] as [number, number]),
      f: o.map((k) => F[k]!), evaluations: evals,
    };
  };
  const steps: NmStep[] = [snap(0, "init")];
  let converged = false, reason = "maxIter reached";
  for (let it = 1; it <= opts.maxIter; ++it) {
    const idx = order();
    const iBest = idx[0]!, iWorst = idx[2]!, iSecond = idx[1]!;
    const xc: [number, number] = [0, 0];
    for (let k = 0; k <= n; ++k) if (k !== iWorst) { xc[0] += X[k]![0]; xc[1] += X[k]![1]; }
    xc[0] /= n; xc[1] /= n;
    const along = (a: readonly number[], b: readonly number[], w: number): [number, number] =>
      [a[0]! + w * (b[0]! - a[0]!) , a[1]! + w * (b[1]! - a[1]!)];
    // x_r = x_c + alpha (x_c - x_worst)
    const xr = clipv(along(xc, X[iWorst]!, -opts.alpha));
    const fr = ev(xr);
    let move: NmMove = "reflect";
    if (fr < F[iBest]!) {
      const xe = clipv(along(xc, xr, opts.gamma));
      const fe = ev(xe);
      if (fe < fr) { X[iWorst] = xe; F[iWorst] = fe; move = "expand"; }
      else { X[iWorst] = xr; F[iWorst] = fr; }
    } else if (fr < F[iSecond]!) {
      X[iWorst] = xr; F[iWorst] = fr;
    } else {
      const xo = clipv(fr < F[iWorst]! ? along(xc, xr, opts.rho) : along(xc, X[iWorst]!, opts.rho));
      const fo = ev(xo);
      if (fo < F[iWorst]!) { X[iWorst] = xo; F[iWorst] = fo; move = "contract"; }
      else {
        for (let k = 0; k <= n; ++k) if (k !== iBest) {
          X[k] = clipv(along(X[iBest]!, X[k]!, opts.sigma));
          F[k] = ev(X[k]!);
        }
        move = "shrink";
      }
    }
    steps.push(snap(it, move));
    const o = order();
    let relDiameter = 0;
    for (let i = 0; i < n; ++i) {
      let span = 0;
      for (let k = 0; k <= n; ++k) span = Math.max(span, Math.abs(X[k]![i]! - X[o[0]!]![i]!));
      relDiameter = Math.max(relDiameter, span / scale[i]!);
    }
    const fRange = F[o[2]!]! - F[o[0]!]!;
    const fScale = Math.max(1, Math.abs(F[o[0]!]!));
    if (relDiameter < opts.tolX) { converged = true; reason = "tolX (simplex diameter)"; break; }
    if (fRange / fScale < opts.tolF) { converged = true; reason = "tolF (f range)"; break; }
  }
  const o = order();
  return { steps, best: [X[o[0]!]![0], X[o[0]!]![1]], fBest: F[o[0]!]!, converged, reason };
}

/** Nelder-Mead on a landscape: cost plus the penalty, inside the box. */
export function runNelderMead(land: LandscapeId, x0: Pt = START): NmResult {
  const fp = (p: Pt): number =>
    cost(land, p[0], p[1]) + NM_PENALTY * Math.max(0, limit(land, p[0], p[1]));
  return nelderMead(fp, x0, [BOX.sLo, BOX.rLo], [BOX.sHi, BOX.rHi]);
}

// ---- McKinnon's counter-example ---------------------------------------------

/** McKinnon (1998): f = theta phi |x|^tau + y + y^2 for x <= 0 and
 *  theta x^tau + y + y^2 for x >= 0, with tau = 2, theta = 6, phi = 60. */
export const MCKINNON = { tau: 2, theta: 6, phi: 60 } as const;
export function mckinnon(p: Pt): number {
  const { tau, theta, phi } = MCKINNON;
  const [x, y] = p;
  return (x <= 0 ? theta * phi * Math.abs(x) ** tau : theta * x ** tau) + y + y * y;
}
/** The starting simplex of McKinnon's example: (0,0), (1,1) and
 *  ((1+sqrt 33)/8, (1-sqrt 33)/8). */
export const MCKINNON_SIMPLEX: readonly Pt[] = [
  [0, 0], [1, 1], [(1 + Math.sqrt(33)) / 8, (1 - Math.sqrt(33)) / 8],
];
export function runMcKinnon(maxIter = 200): NmResult {
  return nelderMead(mckinnon, MCKINNON_SIMPLEX[0]!, null, null,
    { ...NM_DEFAULTS, maxIter }, MCKINNON_SIMPLEX);
}

// ---- SQP, the engine's structure --------------------------------------------

export interface SqpStep {
  it: number;
  x: [number, number];
  f: number;
  g: number;
  /** Forward-difference gradients, in the user's variables. */
  gradF: [number, number];
  gradG: [number, number];
  /** The QP step in the user's variables. */
  d: [number, number];
  /** The multiplier of the specification, and whether it is active. */
  lambda: number;
  active: boolean;
  alpha: number;
  mu: number;
  /** The KKT numbers at the point, the engine's own four. */
  kktStat: number; kktFeas: number; kktCompl: number;
  theta: number;
  note: string;
}

export interface SqpResult {
  steps: SqpStep[];
  x: [number, number];
  f: number;
  g: number;
  lambda: number;
  converged: boolean;
  reason: string;
  evaluations: number;
}

const FD_STEP = 1e-5;

/** SQP on a landscape, with the engine's structure.  Variables are scaled by
 *  their start (xs = x / x0), as the engine prints.  `spec` is a parameter so
 *  the shadow price can be checked by moving it. */
export function runSqp(land: LandscapeId, x0: Pt = START, spec = SPEC, maxIter = 100): SqpResult {
  const sc: [number, number] = [x0[0], x0[1]];
  const lo: [number, number] = [BOX.sLo / sc[0], BOX.rLo / sc[1]];
  const hi: [number, number] = [BOX.sHi / sc[0], BOX.rHi / sc[1]];
  let evals = 0;
  const E = (xs: [number, number]): { f: number; g: number } => {
    ++evals;
    const s = xs[0] * sc[0], r = xs[1] * sc[1];
    return { f: cost(land, s, r), g: limit(land, s, r, spec) };
  };
  const clipS = (xs: [number, number]): [number, number] =>
    [clip(xs[0], lo[0], hi[0]), clip(xs[1], lo[1], hi[1])];
  let xs: [number, number] = clipS([1, 1]);
  let base = E(xs);
  let B = [[1, 0], [0, 1]];
  let mu = 0;
  const steps: SqpStep[] = [];
  let lam = 0;
  let converged = false, reason = "maxIter reached without KKT satisfaction";
  const grads = (p: [number, number], b: { f: number; g: number }) => {
    const gf: [number, number] = [0, 0], gg: [number, number] = [0, 0];
    for (let j = 0; j < 2; ++j) {
      const h = FD_STEP * Math.max(Math.abs(p[j]!), 1);
      const q: [number, number] = [p[0], p[1]]; q[j] = q[j]! + h;
      const e = E(q);
      gf[j] = (e.f - b.f) / h; gg[j] = (e.g - b.g) / h;
    }
    return { gf, gg };
  };
  const merit = (e: { f: number; g: number }, m: number): number => e.f + m * Math.max(0, e.g);
  for (let it = 0; it < maxIter; ++it) {
    const { gf, gg } = grads(xs, base);
    // the QP: min 1/2 d'Bd + gf.d  s.t.  gg.d + g <= 0, box rows
    const qp: QPProblem = {
      B, g: [gf[0], gf[1]], Aeq: [], beq: [],
      Aineq: [[gg[0], gg[1]], [1, 0], [-1, 0], [0, 1], [0, -1]],
      bineq: [base.g, xs[0] - hi[0], lo[0] - xs[0], xs[1] - hi[1], lo[1] - xs[1]],
    };
    const QP = activeSetQP(qp);
    if (QP.infeasible || !QP.converged) {
      reason = "QP infeasible: the linearised limit cannot hold inside the box"
        + " (the engine relaxes it by Powell's rule; this page stops)";
      steps.push({
        it, x: [xs[0] * sc[0], xs[1] * sc[1]], f: base.f, g: base.g,
        gradF: [gf[0] / sc[0], gf[1] / sc[1]], gradG: [gg[0] / sc[0], gg[1] / sc[1]],
        d: [0, 0], lambda: 0, active: false, alpha: 0, mu, kktStat: NaN, kktFeas: Math.max(0, base.g),
        kktCompl: NaN, theta: 1, note: "QP infeasible",
      });
      break;
    }
    const d: [number, number] = [QP.d[0]!, QP.d[1]!];
    lam = QP.lambdaIneq[0]!;
    // KKT at the point, with the box multipliers in grad L
    const gL: number[] = [gf[0] + lam * gg[0], gf[1] + lam * gg[1]];
    const bsign = [1, -1, 1, -1];
    const bidx = [0, 0, 1, 1];
    for (let k = 0; k < 4; ++k) gL[bidx[k]!] = gL[bidx[k]!]! + QP.lambdaIneq[1 + k]! * bsign[k]!;
    const kktStat = Math.max(Math.abs(gL[0]!), Math.abs(gL[1]!));
    const kktFeas = Math.max(0, base.g);
    const kktCompl = Math.abs(lam * base.g);
    const active = lam > 1e-8;
    const note0 = { gf, gg };
    void note0;
    if (kktStat <= 1e-5 && kktFeas <= 1e-6 && kktCompl <= 1e-6) {
      steps.push({
        it, x: [xs[0] * sc[0], xs[1] * sc[1]], f: base.f, g: base.g,
        gradF: [gf[0] / sc[0], gf[1] / sc[1]], gradG: [gg[0] / sc[0], gg[1] / sc[1]],
        d: [d[0] * sc[0], d[1] * sc[1]], lambda: lam, active, alpha: 0, mu,
        kktStat, kktFeas, kktCompl, theta: 1, note: "KKT satisfied",
      });
      converged = true; reason = "KKT conditions satisfied";
      break;
    }
    mu = Math.max(mu, 1.1 * Math.abs(lam), 1e-8);
    const pen = Math.max(0, base.g);
    const dphi = gf[0] * d[0] + gf[1] * d[1] - mu * pen;
    const phi0 = merit(base, mu);
    let alpha = 1;
    let trial = { x: xs, e: base };
    let accepted = false;
    while (alpha >= 1e-8) {
      const xt = clipS([xs[0] + alpha * d[0], xs[1] + alpha * d[1]]);
      const et = E(xt);
      if (merit(et, mu) <= phi0 + 1e-4 * alpha * dphi) { trial = { x: xt, e: et }; accepted = true; break; }
      alpha *= 0.5;
    }
    if (!accepted) {
      reason = "line search failed: no merit decrease above alphaMin";
      steps.push({
        it, x: [xs[0] * sc[0], xs[1] * sc[1]], f: base.f, g: base.g,
        gradF: [gf[0] / sc[0], gf[1] / sc[1]], gradG: [gg[0] / sc[0], gg[1] / sc[1]],
        d: [d[0] * sc[0], d[1] * sc[1]], lambda: lam, active, alpha: 0, mu,
        kktStat, kktFeas, kktCompl, theta: 1, note: "line search failed",
      });
      break;
    }
    // damped BFGS of the Lagrangian (Powell 1978), same multiplier at both points
    const s: [number, number] = [trial.x[0] - xs[0], trial.x[1] - xs[1]];
    const g2 = grads(trial.x, trial.e);
    const gLn: [number, number] = [g2.gf[0] + lam * g2.gg[0], g2.gf[1] + lam * g2.gg[1]];
    const gLo: [number, number] = [gf[0] + lam * gg[0], gf[1] + lam * gg[1]];
    const y: [number, number] = [gLn[0] - gLo[0], gLn[1] - gLo[1]];
    const Bs: [number, number] = [B[0]![0]! * s[0] + B[0]![1]! * s[1], B[1]![0]! * s[0] + B[1]![1]! * s[1]];
    const sBs = s[0] * Bs[0] + s[1] * Bs[1];
    const sy = s[0] * y[0] + s[1] * y[1];
    let theta = 1;
    if (sBs > 1e-14) {
      theta = sy >= 0.2 * sBs ? 1 : (0.8 * sBs) / (sBs - sy);
      const rr: [number, number] = [theta * y[0] + (1 - theta) * Bs[0], theta * y[1] + (1 - theta) * Bs[1]];
      const sr = s[0] * rr[0] + s[1] * rr[1];
      if (sr > 1e-14) {
        B = B.map((row, i) => row.map((v, j) => v - (Bs[i]! * Bs[j]!) / sBs + (rr[i]! * rr[j]!) / sr));
      }
    }
    steps.push({
      it, x: [xs[0] * sc[0], xs[1] * sc[1]], f: base.f, g: base.g,
      gradF: [gf[0] / sc[0], gf[1] / sc[1]], gradG: [gg[0] / sc[0], gg[1] / sc[1]],
      d: [d[0] * sc[0], d[1] * sc[1]], lambda: lam, active, alpha, mu,
      kktStat, kktFeas, kktCompl, theta, note: "",
    });
    xs = trial.x; base = trial.e;
  }
  const x: [number, number] = [xs[0] * sc[0], xs[1] * sc[1]];
  return { steps, x, f: base.f, g: base.g, lambda: lam, converged, reason, evaluations: evals };
}

// ---- MADS, from the papers ---------------------------------------------------

export const MADS_SIMPLIFICATIONS: readonly string[] = [
  "Poll directions: the LTMADS construction restated in the erratum of Audet, Custodio and Dennis, for two variables, "
    + "in its maximal-basis form [B', -B'] (four directions: one random-sign axis direction, one random direction with "
    + "a +-2^l entry, and the two negatives), drawn afresh at every iteration from a seeded generator.",
  "Mesh and poll sizes: mesh size 4^-l and poll size 2^-l in coordinates scaled to the unit box, so the mesh size is "
    + "min(poll, poll^2) of Algorithm 2.1; a success coarsens by one level (not beyond 1), a failure refines by one.",
  "The poll directions are random, so the seed table of the page is a property of THESE directions; other published constructions "
    + "are deterministic and give different runs from the same start.",
  "The search step is empty: only the poll step runs, and the poll is COMPLETE (every poll point is evaluated).",
  "On the stepped landscape the stage count is an integer: a poll step in it is rounded to a whole number of stages and is never zero when "
    + "the direction is not, so the integer mesh is never finer than one stage.  This is the page's rule, not a "
    + "statement of a paper.",
  "The progressive barrier is a simplification written from the survey of Larson, Menickelly and Wild: the violation "
    + "is h = max(0, g)^2, a trial with h above the threshold h_max is thrown away, a feasible incumbent and an "
    + "infeasible one are kept, a trial that lowers both f and h of an incumbent is a success, one that lowers h only "
    + "is an improving move that closes the barrier to the old incumbent's h.  The poll centre is the feasible "
    + "incumbent when there is one.",
];

export interface MadsPoll {
  x: [number, number];
  f: number | null;
  g: number | null;
  h: number | null;
  /** Why this point did what it did, in words. */
  status: "dominates" | "improves" | "no gain" | "above the barrier" | "outside the box" | "on the centre";
}

export interface MadsStep {
  it: number;
  level: number;
  pollSize: number;
  meshSize: number;
  centre: [number, number];
  centreFeasible: boolean;
  poll: MadsPoll[];
  outcome: "success" | "improving" | "failure";
  incumbentF: { x: [number, number]; f: number } | null;
  incumbentI: { x: [number, number]; f: number; h: number } | null;
  hMax: number;
  evaluations: number;
}

export interface MadsResult {
  steps: MadsStep[];
  best: [number, number];
  f: number;
  g: number;
  feasible: boolean;
  evaluations: number;
  reason: string;
}

/** A small deterministic generator, so the page and its test see one run. */
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

/** The four LTMADS poll directions for two variables at level l (2^l = the
 *  integer scale of the construction), as integer vectors: the MAXIMAL
 *  positive basis [B', -B'] of the erratum, B' a random lower-triangular
 *  construction with +-2^l on its diagonal (one axis direction, one random
 *  direction carrying a +-2^l entry). */
export function ltmadsDirections(l: number, rnd: () => number): [number, number][] {
  const two = 2 ** l;
  const sign = (): number => (rnd() < 0.5 ? -1 : 1);
  const iota = rnd() < 0.5 ? 0 : 1;           // the index carrying +-2^l in b
  const other = 1 - iota;
  const b: [number, number] = [0, 0];
  b[iota] = sign() * two;
  b[other] = Math.floor(rnd() * (2 * two - 1)) - (two - 1);   // {-2^l+1 ... 2^l-1}
  const col: [number, number] = [0, 0];
  col[other] = sign() * two;                   // B_{p1,1} = L, B_{iota,1} = 0
  return [col, b, [-col[0], -col[1]], [-b[0], -b[1]]];
}

const L0 = 1;
const L_STOP = 10;

/** MADS with the progressive barrier on a landscape.  Variables are scaled to
 *  the unit box; the stage count is kept on a whole-stage mesh. */
export function runMads(land: LandscapeId, x0: Pt = START, seed = 7, maxIter = 120): MadsResult {
  const rnd = mulberry32(seed);
  const spanS = BOX.sHi - BOX.sLo, spanR = BOX.rHi - BOX.rLo;
  let evals = 0;
  const E = (p: [number, number]) => {
    ++evals;
    const f = cost(land, p[0], p[1]);
    const g = limit(land, p[0], p[1]);
    return { f, g, h: Math.max(0, g) ** 2 };
  };
  //  The stage count is an INTEGER on the stepped landscape only; on the
  //  smooth one it is the relaxation a gradient method needs, real-valued.
  const integerS = land === "stepped";
  const start: [number, number] = [
    integerS ? Math.round(clip(x0[0], BOX.sLo, BOX.sHi)) : clip(x0[0], BOX.sLo, BOX.sHi),
    clip(x0[1], BOX.rLo, BOX.rHi)];
  const e0 = E(start);
  let incF: { x: [number, number]; f: number } | null = e0.g <= 0 ? { x: start, f: e0.f } : null;
  let incI: { x: [number, number]; f: number; h: number } | null =
    e0.g > 0 ? { x: start, f: e0.f, h: e0.h } : null;
  let hMax = Infinity;
  let l = L0;
  const steps: MadsStep[] = [];
  let reason = "maxIter reached";
  for (let it = 1; it <= maxIter; ++it) {
    const pollSize = 2 ** -l, meshSize = 4 ** -l;
    const centrePt = incF ? incF.x : incI!.x;
    const dirs = ltmadsDirections(l, rnd);
    const poll: MadsPoll[] = [];
    let bestDomF: { x: [number, number]; f: number } | null = null;
    let bestDomI: { x: [number, number]; f: number; h: number } | null = null;
    let bestImp: { x: [number, number]; f: number; h: number } | null = null;
    for (const d of dirs) {
      // the step in user units, on the mesh; the stage count on whole stages
      let ds = spanS * meshSize * d[0];
      let dr = spanR * meshSize * d[1];
      if (integerS) ds = ds === 0 ? 0 : Math.sign(ds) * Math.max(1, Math.round(Math.abs(ds)));
      const t: [number, number] = [centrePt[0] + ds, centrePt[1] + dr];
      if (t[0] < BOX.sLo - 1e-9 || t[0] > BOX.sHi + 1e-9 || t[1] < BOX.rLo - 1e-9 || t[1] > BOX.rHi + 1e-9) {
        poll.push({ x: t, f: null, g: null, h: null, status: "outside the box" });
        continue;
      }
      if (ds === 0 && dr === 0) {
        poll.push({ x: t, f: null, g: null, h: null, status: "on the centre" });
        continue;
      }
      const e = E(t);
      if (e.g > 0 && e.h > hMax) {
        poll.push({ x: t, f: e.f, g: e.g, h: e.h, status: "above the barrier" });
        continue;
      }
      let status: MadsPoll["status"] = "no gain";
      if (e.g <= 0) {
        if (!incF || e.f < incF.f) {
          status = "dominates";
          if (!bestDomF || e.f < bestDomF.f) bestDomF = { x: t, f: e.f };
        }
      } else if (incI) {
        const dominatesI = e.f <= incI.f && e.h <= incI.h && (e.f < incI.f || e.h < incI.h);
        if (dominatesI) {
          status = "dominates";
          if (!bestDomI || e.f < bestDomI.f) bestDomI = { x: t, f: e.f, h: e.h };
        } else if (e.h < incI.h) {
          status = "improves";
          if (!bestImp || e.h < bestImp.h) bestImp = { x: t, f: e.f, h: e.h };
        }
      } else {
        // no infeasible incumbent yet: an infeasible point enters as one
        // only through the barrier, never over a feasible incumbent
        status = "no gain";
      }
      poll.push({ x: t, f: e.f, g: e.g, h: e.h, status });
    }
    let outcome: MadsStep["outcome"] = "failure";
    if (bestDomF || bestDomI) {
      outcome = "success";
      if (bestDomF) incF = bestDomF;
      if (bestDomI) incI = bestDomI;
    } else if (bestImp) {
      outcome = "improving";
      hMax = incI!.h;
      incI = bestImp;
    }
    const centreFeasible = centrePt === (incF?.x ?? null) || (incF !== null && centrePt[0] === incF.x[0] && centrePt[1] === incF.x[1]);
    steps.push({
      it, level: l, pollSize, meshSize, centre: [centrePt[0], centrePt[1]],
      centreFeasible: !!centreFeasible, poll, outcome,
      incumbentF: incF ? { x: [incF.x[0], incF.x[1]], f: incF.f } : null,
      incumbentI: incI ? { x: [incI.x[0], incI.x[1]], f: incI.f, h: incI.h } : null,
      hMax, evaluations: evals,
    });
    if (outcome === "success") l = Math.max(0, l - 1);
    else if (outcome === "failure") l += 1;
    if (l >= L_STOP) { reason = "poll size below 1e-3 (the mesh is as fine as the page goes)"; break; }
  }
  const bestX = incF ? incF.x : incI!.x;
  const eb = cost(land, bestX[0], bestX[1]);
  return {
    steps, best: [bestX[0], bestX[1]], f: eb, g: limit(land, bestX[0], bestX[1]),
    feasible: !!incF, evaluations: evals, reason,
  };
}

// ---- drawing helpers ---------------------------------------------------------

/** The grid of (cost, limit) the contour bands are drawn from. */
export function landscapeGrid(land: LandscapeId, nS: number, nR: number): {
  f: number[][]; g: number[][];
} {
  const f: number[][] = [], g: number[][] = [];
  for (let i = 0; i < nR; ++i) {
    const r = BOX.rLo + (BOX.rHi - BOX.rLo) * (i + 0.5) / nR;
    const fr: number[] = [], gr: number[] = [];
    for (let j = 0; j < nS; ++j) {
      const s = BOX.sLo + (BOX.sHi - BOX.sLo) * (j + 0.5) / nS;
      fr.push(cost(land, s, r)); gr.push(limit(land, s, r));
    }
    f.push(fr); g.push(gr);
  }
  return { f, g };
}

// ---- the scorecard of card 6 (no free lunch) -----------------------------------

export interface ScoreCell { gap: number; evaluations: number; note: string }
export interface Scorecard {
  best: { smooth: number; stepped: number };
  rows: { method: "Nelder-Mead" | "SQP" | "MADS"; smooth: ScoreCell; stepped: ScoreCell }[];
}

/** What each method reaches on each landscape from the page's start: the gap of
 *  its final cost above the exact optimum (the 1-D optimum when smooth, the
 *  best whole stage count when stepped) and its evaluations.  MADS is the
 *  median of twenty seeds. */
export function scorecard(): Scorecard {
  const best = { smooth: smoothOptimum().f, stepped: Math.min(...enumerateStages().filter((e) => e.feasible).map((e) => e.f!)) };
  const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return 0.5 * (s[9]! + s[10]!); };
  const cell = (land: LandscapeId, f: number, ev: number, viol: number, note: string): ScoreCell =>
    ({ gap: f - best[land], evaluations: ev, note: viol > 1e-3 ? `${note}; limit violated by ${viol.toExponential(1)}` : note });
  const nm = (land: LandscapeId): ScoreCell => {
    const r = runNelderMead(land);
    const f = cost(land, r.best[0], r.best[1]);
    return cell(land, f, r.steps[r.steps.length - 1]!.evaluations, Math.max(0, limit(land, r.best[0], r.best[1])), "penalty weight a guess");
  };
  const sq = (land: LandscapeId): ScoreCell => {
    const r = runSqp(land);
    return cell(land, r.f, r.evaluations, Math.max(0, r.g), r.converged ? "KKT satisfied" : r.reason);
  };
  const md = (land: LandscapeId): ScoreCell => {
    const runs = Array.from({ length: 20 }, (_, k) => runMads(land, START, k + 1));
    return cell(land, med(runs.map((r) => r.f)), med(runs.map((r) => r.evaluations)), 0, "median of twenty seeds");
  };
  return {
    best,
    rows: [
      { method: "Nelder-Mead", smooth: nm("smooth"), stepped: nm("stepped") },
      { method: "SQP", smooth: sq("smooth"), stepped: sq("stepped") },
      { method: "MADS", smooth: md("smooth"), stepped: md("stepped") },
    ],
  };
}
