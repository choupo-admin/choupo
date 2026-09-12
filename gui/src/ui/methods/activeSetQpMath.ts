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
  activeSetQpMath — the active-set method for a convex QP, transcribed so that
  its WORKING SET can be watched changing, and pinned against the engine's own
  self-check problem.

  WHAT THE ENGINE HAS.  `src/solver/ActiveSetQP.{H,cpp}` is a hand-rolled
  active-set solver for

      min  0.5 d' B d + g' d      s.t.  Aeq d + beq = 0,  Aineq d + bineq <= 0

  with B symmetric positive definite — Nocedal & Wright, Numerical
  Optimization 2nd ed. (2006), Algorithm 16.3, §16.5, a public-domain method
  and explicitly NOT a port of any code.  It has three real callers: the inner
  QP of every SQP iteration (src/solver/SQP.cpp:247), the constrained
  optimisation driver (src/outerDriver/OptimizationDriver.cpp:484), and the
  laboratory-analysis reconciliation (src/streams/AnalysisReconciler.cpp:165).

  WHY THE TRANSCRIPTION EXISTS, and it is the same argument as the Wegstein
  page's.  The thing worth teaching is not the answer — it is the WORKING SET:
  which constraints are being treated as equalities right now, which one was
  just added because a step ran into it, and which one was just dropped
  because its multiplier went negative.  The engine returns the answer and the
  final active set; it does not publish the sequence.  So the sequence is
  recomputed here, from `activeSetQP`'s own loop
  (src/solver/ActiveSetQP.cpp:171-293, headed by the algorithm's own name at
  src/solver/ActiveSetQP.cpp:151), and every entry of the returned trace is
  one working-set change.

  WHAT KEEPS IT HONEST.  The engine ships a HAND-WORKED problem with a known
  primal solution, a known active set and known multipliers, and asserts its
  own solver reproduces them to 1e-9 before every SQP run
  (`verifyActiveSetQP`, src/solver/ActiveSetQP.cpp:320-360).  That problem is
  `HAND_WORKED` below, unchanged, and it is the page's anchor: the engine is
  the judge, on exactly this problem, every time somebody runs a constrained
  optimisation.

  THE TRANSCRIPTION IS OF THE ENGINE'S VARIANT, NOT OF THE TEXTBOOK'S.  Two
  differences matter and both are in the engine's own comments: it keeps a
  RUNNING POINT starting at zero and solves each KKT system for a SUB-STEP
  (:150-161), and it carries a LICQ recovery that drops the most recently
  added inequality when the KKT system goes singular and forbids it
  re-entering (:163-168, :211-229).  Reproducing the textbook instead would
  produce a different sequence of working sets from the one the engine
  actually walks, which is the only thing this module is for.

  NOT HERE: the SQP outer loop (the damped-BFGS Hessian, the Armijo line
  search, the merit function), and any claim that the two-variable pictures
  generalise.  A QP in twelve variables has no picture, and the page says so.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";

// ---- Dense linear algebra, the little that is needed ----------------------

/** Gauss elimination with partial pivoting.  The engine reaches its own
 *  `gaussSolve` here; this is the same algorithm at the size these pictures
 *  need.  Returns null where the engine throws, because a singular KKT system
 *  is a RESULT on this page — it is what an LICQ failure looks like — rather
 *  than an error to propagate. */
export function gaussSolve(
  A: readonly (readonly number[])[], b: readonly number[],
): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] ?? 0]);
  for (let c = 0; c < n; ++c) {
    let piv = c;
    for (let r = c + 1; r < n; ++r)
      if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-13) return null;
    if (piv !== c) { const t = M[piv]!; M[piv] = M[c]!; M[c] = t; }
    for (let r = c + 1; r < n; ++r) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; ++k) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; --r) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; ++k) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

const dot = (a: readonly number[], b: readonly number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; ++i) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
};

// ---- The problem -----------------------------------------------------------

/** A convex QP, in exactly the engine's own field names so the two can be
 *  read side by side (src/solver/ActiveSetQP.H:104-114). */
export interface QPProblem {
  /** n x n, symmetric positive definite. */
  B: number[][];
  g: number[];
  Aeq: number[][];
  beq: number[];
  Aineq: number[][];
  bineq: number[];
  /** Row captions, for the picture.  Not part of the engine's structure. */
  ineqLabels?: string[];
  eqLabels?: string[];
}

/** THE ENGINE'S OWN SELF-CHECK PROBLEM, copied unchanged from
 *  `verifyActiveSetQP` (src/solver/ActiveSetQP.cpp:322-332).
 *
 *      min  0.5 (d1^2 + d2^2) - d1 - 2 d2
 *      s.t. d1 + d2 <= 1,   d1 >= 0,   d2 >= 0
 *
 *  The unconstrained minimiser is (1, 2), which violates the first row by 2.
 *  Working it by hand: with row 0 active, the Lagrangian stationarity gives
 *  d = (1 - lam, 2 - lam) and the row itself gives lam = 1, so d* = (0, 1)
 *  with multipliers (1, 0, 0) — and d1 = 0 sits exactly ON its own bound
 *  while that bound's multiplier is zero, which is a degenerate vertex and a
 *  good thing to have in an anchor.
 *
 *  The engine asserts exactly this to 1e-9 before every SQP run and throws if
 *  it cannot, with the words "ActiveSetQP is BROKEN -- nothing downstream is
 *  trustworthy".  That makes it the one QP on this page whose answer is
 *  judged by the engine rather than drawn by the browser. */
export const HAND_WORKED: QPProblem = {
  B: [[1, 0], [0, 1]],
  g: [-1, -2],
  Aeq: [], beq: [],
  Aineq: [[1, 1], [-1, 0], [0, -1]],
  bineq: [-1, 0, 0],
  ineqLabels: ["d1 + d2 <= 1", "d1 >= 0", "d2 >= 0"],
};

/** The answer the engine asserts for it, stated here so the page can PRINT
 *  the comparison rather than assert it. */
export const HAND_WORKED_ANSWER = {
  d: [0, 1] as const,
  lambdaIneq: [1, 0, 0] as const,
  activeRows: [0] as const,
};

export const objective = (qp: QPProblem, x: readonly number[]): number => {
  let s = dot(qp.g, x);
  for (let i = 0; i < x.length; ++i)
    for (let j = 0; j < x.length; ++j)
      s += 0.5 * (qp.B[i]?.[j] ?? 0) * (x[i] ?? 0) * (x[j] ?? 0);
  return s;
};

/** A row's value at x.  Feasible means `<= 0` for an inequality and `= 0` for
 *  an equality — the engine writes both in that normalised form, so a reader
 *  never has to remember which side a constraint was written on. */
export const rowValue = (
  a: readonly number[], b: number, x: readonly number[],
): number => dot(a, x) + b;

// ---- The loop, transcribed -------------------------------------------------

/** The engine's own two tolerances, with its names and values
 *  (src/solver/ActiveSetQP.cpp:143-144). */
export const FEAS_TOL = 1.0e-10;
export const LAM_TOL = 1.0e-12;

export type QpAction =
  | "start"
  /** The KKT sub-step over the current working set was zero and every active
   *  inequality's multiplier was non-negative: this point is the answer. */
  | "optimal"
  /** The sub-step was zero but one multiplier was negative: that constraint
   *  wants to move off its bound, so it leaves the working set. */
  | "drop"
  /** The sub-step ran into a constraint that was not in the working set: take
   *  the largest feasible fraction of it and add that constraint. */
  | "add"
  /** A full step was taken and nothing blocked it. */
  | "step"
  /** The KKT matrix went singular over the active rows: the engine's
   *  documented LICQ recovery drops the most recently added inequality and
   *  forbids it re-entering this solve. */
  | "licq"
  /** The working-set change cap was reached.  The engine THROWS here, loudly
   *  rather than spinning; the page reports it instead of throwing, since a
   *  reader who dragged a constraint into a degenerate position wants to be
   *  told what happened. */
  | "cap";

export interface QpStep {
  /** Iteration index, as the engine counts working-set changes. */
  it: number;
  /** The running point BEFORE this iteration. */
  x: number[];
  /** The KKT sub-step (zero at an optimality test). */
  p: number[];
  /** The fraction of the sub-step actually taken. */
  alpha: number;
  /** The point after the step. */
  xNext: number[];
  /** The inequality rows in the working set BEFORE this iteration. */
  working: number[];
  /** Multipliers of the working-set inequality rows, in `working` order.
   *  Empty when the sub-step was non-zero (the test was not reached). */
  lambda: number[];
  action: QpAction;
  /** The inequality row added or dropped, where one was. */
  row: number | null;
  /** The objective at `xNext`. */
  f: number;
}

export interface QpTrace {
  steps: QpStep[];
  /** The answer, or the last point reached. */
  d: number[];
  /** One multiplier per inequality row; zero on an inactive one, exactly as
   *  the engine returns it. */
  lambdaIneq: number[];
  lambdaEq: number[];
  active: boolean[];
  converged: boolean;
  /** The engine's own termination note. */
  reason: string;
}

/** ACTIVE-SET QP, transcribed from `activeSetQP`
 *  (src/solver/ActiveSetQP.cpp:119-299), recording the working set at every
 *  change.  Same order of operations, same tolerances, same LICQ recovery,
 *  and the same running-point formulation starting at x = 0. */
export function activeSetQP(
  qp: QPProblem, warmStart?: readonly boolean[], maxIter = 50,
): QpTrace {
  const n = qp.g.length;
  const me = qp.Aeq.length;
  const mi = qp.Aineq.length;
  const active = warmStart ? [...warmStart] : new Array<boolean>(mi).fill(false);
  const forbidden = new Array<boolean>(mi).fill(false);
  const steps: QpStep[] = [];
  let x = new Array<number>(n).fill(0);
  let reason = "";
  const lambdaIneq = new Array<number>(mi).fill(0);
  let lambdaEq = new Array<number>(me).fill(0);

  for (let it = 0; it < maxIter; ++it) {
    //  Working set: the equalities (always) plus the active inequalities.
    const Arows: number[][] = [];
    const brows: number[] = [];
    const ineqRowOf: number[] = [];
    for (let k = 0; k < me; ++k) {
      Arows.push(qp.Aeq[k] as number[]);
      brows.push(rowValue(qp.Aeq[k]!, qp.beq[k] ?? 0, x));
    }
    for (let k = 0; k < mi; ++k)
      if (active[k]) {
        Arows.push(qp.Aineq[k] as number[]);
        brows.push(rowValue(qp.Aineq[k]!, qp.bineq[k] ?? 0, x));
        ineqRowOf.push(k);
      }

    //  Gradient of the objective at the running point: B x + g.
    const grad = new Array<number>(n).fill(0);
    for (let i = 0; i < n; ++i) {
      let s = qp.g[i] ?? 0;
      for (let j = 0; j < n; ++j) s += (qp.B[i]?.[j] ?? 0) * (x[j] ?? 0);
      grad[i] = s;
    }

    //  The KKT system  [B  A'; A  0] [p; lambda] = [-grad; -b_W].
    const N = n + Arows.length;
    const K: number[][] = Array.from({ length: N },
      () => new Array<number>(N).fill(0));
    const rhs = new Array<number>(N).fill(0);
    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < n; ++j) K[i]![j] = qp.B[i]?.[j] ?? 0;
      rhs[i] = -(grad[i] ?? 0);
    }
    for (let k = 0; k < Arows.length; ++k) {
      for (let j = 0; j < n; ++j) {
        K[j]![n + k] = Arows[k]![j] ?? 0;
        K[n + k]![j] = Arows[k]![j] ?? 0;
      }
      rhs[n + k] = -(brows[k] ?? 0);
    }
    const sol = gaussSolve(K, rhs);
    if (!sol) {
      //  LICQ recovery, exactly as the engine does it: drop the most recently
      //  added active inequality and forbid it re-entering.  With no
      //  inequality to drop the deficiency is in the equality rows and is
      //  genuine, which the engine lets propagate.
      const drop = ineqRowOf[ineqRowOf.length - 1];
      if (drop === undefined) {
        reason = "KKT singular over the EQUALITY rows -- a genuine LICQ"
          + " failure: two declared equalities are linearly dependent.";
        steps.push({ it, x: [...x], p: [], alpha: 0, xNext: [...x],
          working: [...ineqRowOf], lambda: [], action: "licq", row: null,
          f: objective(qp, x) });
        break;
      }
      active[drop] = false;
      forbidden[drop] = true;
      if (!reason)
        reason = "LICQ recovery: dropped a linearly-dependent active"
          + " inequality (correlated constraints)";
      steps.push({ it, x: [...x], p: [], alpha: 0, xNext: [...x],
        working: [...ineqRowOf], lambda: [], action: "licq", row: drop,
        f: objective(qp, x) });
      continue;
    }
    const p = sol.slice(0, n);
    const lambdaW = sol.slice(n);
    const pnorm = Math.sqrt(dot(p, p));

    if (pnorm < 1e-12) {
      //  The running point minimises over the current working set.  Look at
      //  the multipliers of the ACTIVE INEQUALITIES: a negative one means
      //  that constraint is pushing the wrong way and should be released.
      let mostNeg = -LAM_TOL;
      let dropPos = -1;
      for (let r = 0; r < ineqRowOf.length; ++r) {
        const lam = lambdaW[me + r] ?? 0;
        if (lam < mostNeg) { mostNeg = lam; dropPos = r; }
      }
      const lamsHere = ineqRowOf.map((_, r) => lambdaW[me + r] ?? 0);
      if (dropPos < 0) {
        for (let r = 0; r < ineqRowOf.length; ++r)
          lambdaIneq[ineqRowOf[r] as number] = lambdaW[me + r] ?? 0;
        lambdaEq = lambdaW.slice(0, me);
        steps.push({ it, x: [...x], p, alpha: 0, xNext: [...x],
          working: [...ineqRowOf], lambda: lamsHere, action: "optimal",
          row: null, f: objective(qp, x) });
        return { steps, d: [...x], lambdaIneq, lambdaEq, active: [...active],
          converged: true, reason: "KKT satisfied" };
      }
      const drop = ineqRowOf[dropPos] as number;
      active[drop] = false;
      steps.push({ it, x: [...x], p, alpha: 0, xNext: [...x],
        working: [...ineqRowOf], lambda: lamsHere, action: "drop", row: drop,
        f: objective(qp, x) });
      continue;
    }

    //  A non-zero sub-step: how far can it go before it meets a constraint
    //  that is not in the working set?  (N&W eq. 16.41.)
    let alpha = 1;
    let blockK = -1;
    for (let k = 0; k < mi; ++k) {
      if (active[k] || forbidden[k]) continue;
      const slope = dot(qp.Aineq[k]!, p);
      if (slope > FEAS_TOL) {
        const ck = rowValue(qp.Aineq[k]!, qp.bineq[k] ?? 0, x);
        const a = -ck / slope;
        if (a < alpha) { alpha = Math.max(a, 0); blockK = k; }
      }
    }
    const xNext = x.map((v, i) => v + alpha * (p[i] ?? 0));
    steps.push({ it, x: [...x], p, alpha, xNext: [...xNext],
      working: [...ineqRowOf], lambda: [],
      action: blockK >= 0 ? "add" : "step", row: blockK >= 0 ? blockK : null,
      f: objective(qp, xNext) });
    x = xNext;
    if (blockK >= 0) active[blockK] = true;
  }

  steps.push({ it: steps.length, x: [...x], p: [], alpha: 0, xNext: [...x],
    working: [], lambda: [], action: "cap", row: null, f: objective(qp, x) });
  return {
    steps, d: [...x], lambdaIneq, lambdaEq, active: [...active],
    converged: false,
    reason: reason || "active-set did not settle within the cap (possible"
      + " cycling or an ill-conditioned QP) -- the engine THROWS here",
  };
}

// ---- Plane A: the engine's own constrained least squares ------------------

/** THE WITNESS, and why this one.
 *
 *  `analysis02_weighted_least_squares` reconciles a laboratory water analysis
 *  that does not balance on charge: four measured quantities, each with its
 *  own declared uncertainty, corrected by the smallest weighted amount that
 *  satisfies electroneutrality and an elemental-conservation redundancy, with
 *  every corrected value kept non-negative.  That IS a convex QP, and the
 *  engine hands it to the same `activeSetQP` the SQP driver uses
 *  (src/streams/AnalysisReconciler.cpp:165).
 *
 *  It is the right witness because the QP is not an abstraction in it.  The
 *  objective is a chi-squared over analytical measurements; the constraints
 *  are laws; and the LAGRANGE MULTIPLIER of each law is published as the
 *  number of standard deviations that law is responsible for moving each
 *  measurement — an exact decomposition of the KKT stationarity condition
 *  rather than an attributed share
 *  (src/streams/AnalysisReconciler.H:92-105; the problem it solves is
 *  stated at src/streams/AnalysisReconciler.H:35-37). */
export const QP_WITNESS = "steady/flash/analysis02_weighted_least_squares";
export const QP_STREAM_FILE = "converged/feed";
export const QP_FEED_FILE = "0/feed";

/** THE ONE KNOB ON THIS PLANE: the declared uncertainty of the alkalinity
 *  titration, in per cent of the reported value.
 *
 *  It is the right knob because it turns the QP's WEIGHTS without touching
 *  its constraints, and the weights are the whole of why the answer falls
 *  where it does: the objective is a sum of squared corrections measured in
 *  each row's own sigma, so a row declared precise is expensive to move and a
 *  row declared loose is cheap.  Widen the alkalinity's uncertainty and watch
 *  the charge correction migrate onto it; narrow it and watch calcium and
 *  chloride take the correction instead.
 *
 *  It writes the FIRST line-anchored `uncertainty` in the sheet, which is the
 *  alkalinity row's (the two per-row uncertainties written inline, on Ca and
 *  Cl, are not line-anchored and the substitution cannot reach them).  The
 *  declared unit is checked: the dict says `percent`, and writing a bare
 *  fraction into that slot would be a plausible number and wrong by two
 *  orders of magnitude. */
export const ALKALINITY_SIGMA_DEFAULT_PCT = 4;

export function alkalinitySigmaOverride(pct: number): DictOverride[] {
  return [{ file: QP_FEED_FILE, key: "uncertainty", value: pct,
    unit: "percent", occurrence: 1 }];
}

export interface ReconciledRow {
  label: string;
  reported: number;
  adjusted: number;
  correctionSigma: number;
  sigmaPct: number;
  responsible: string;
  /** The exact per-law parts, which SUM to correctionSigma. */
  causedBy: { law: string; deltaSigma: number }[];
  atBound: boolean;
}

export interface ReconciledLaw {
  name: string;
  meaning: string;
  multiplier: number;
  binding: boolean;
}

export interface Reconciliation {
  method: string;
  objective: number;
  workingSetChanges: number;
  maxCorrectionSigma: number | null;
  imbalanceBeforePct: number;
  imbalanceAfterPct: number;
  laws: ReconciledLaw[];
  rows: ReconciledRow[];
}

const asNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = /^\s*(-?[0-9.eE+-]+)/.exec(v);
    if (m) return Number(m[1]);
  }
  return Number.NaN;
};

/** Read the reconciliation the engine WROTE, out of the solved stream file.
 *
 *  It is read from `converged/<stream>` rather than recomputed, and rather
 *  than scraped from the console: that file is the engine's own record of
 *  what it decided, and the `analysisReconciliation {}` block in it is
 *  documented in the file's own header as measurements and the distance each
 *  was moved — never a chemistry result.  Returns null when the block is
 *  absent, because "the case did not reconcile" and "it reconciled and moved
 *  nothing" are different facts. */
export function readReconciliation(
  files: { [rel: string]: string } | undefined,
  parseDict: (text: string) => { [k: string]: unknown },
): Reconciliation | null {
  const text = files?.[QP_STREAM_FILE];
  if (!text) return null;
  let root: { [k: string]: unknown };
  try { root = parseDict(text); } catch { return null; }
  const calc = root["calculated"] as { [k: string]: unknown } | undefined;
  const blk = calc?.["analysisReconciliation"] as
    { [k: string]: unknown } | undefined;
  if (!blk) return null;

  const lawsBlk = (blk["constraints"] ?? {}) as { [k: string]: unknown };
  const laws: ReconciledLaw[] = Object.entries(lawsBlk).map(([name, v]) => {
    const o = v as { [k: string]: unknown };
    return {
      name,
      meaning: String(o["meaning"] ?? ""),
      multiplier: asNumber(o["multiplier"]),
      binding: String(o["binding"] ?? "") === "true",
    };
  });

  const rowsBlk = (blk["adjustments"] ?? {}) as { [k: string]: unknown };
  const rows: ReconciledRow[] = Object.entries(rowsBlk).map(([label, v]) => {
    const o = v as { [k: string]: unknown };
    const caused = (o["causedBy"] ?? {}) as { [k: string]: unknown };
    return {
      label,
      reported: asNumber(o["reportedValue"]),
      adjusted: asNumber(o["adjustedValue"]),
      correctionSigma: asNumber(o["correctionSigma"]),
      sigmaPct: asNumber(o["uncertaintyPct"]),
      responsible: String(o["constraintResponsible"] ?? ""),
      causedBy: Object.entries(caused)
        .map(([law, d]) => ({ law, deltaSigma: asNumber(d) })),
      atBound: String(o["atNonNegativityBound"] ?? "") === "true",
    };
  });

  const maxSig = blk["maximumCorrectionSigma"];
  return {
    method: String(blk["method"] ?? ""),
    objective: asNumber(blk["objective"]),
    workingSetChanges: asNumber(blk["workingSetChanges"]),
    maxCorrectionSigma: maxSig === undefined ? null : asNumber(maxSig),
    imbalanceBeforePct: asNumber(blk["chargeImbalanceBefore"]),
    imbalanceAfterPct: asNumber(blk["chargeImbalanceAfter"]),
    laws, rows,
  };
}

/** The engine's own per-row sentence, lifted verbatim from the run log.
 *  Verbatim because it is the sentence a reader will meet on the console and
 *  in the dossier, and a paraphrase here would be a second wording of it. */
export function analysisLines(log: string | null | undefined): string[] {
  if (!log) return [];
  return log.split("\n").map((l) => l.trimEnd())
    .filter((l) => l.trimStart().startsWith("[analysis]"));
}
