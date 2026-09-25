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
  leastSquaresRun -- the witness, the knobs, and READERS for the two CSVs the
  engine's own `fitParameters` operation writes.

  IT IS CALLED `Run` AND NOT `Math`, AND THAT NAMING IS THE POINT.  The three
  numerics lessons beside it carry a `*Math.ts` module because each recomputes
  its algorithm in TypeScript: the QP page walks the working set itself, the
  Wegstein page runs its own secants.  Each does so because the engine
  publishes the ANSWER and not the PATH, and each says so in its own limits
  block.

  This page recomputes NOTHING.  Levenberg-Marquardt over a thermodynamic
  package is not a transcription anybody could check; a second implementation
  in TypeScript would be a second home for the method, and its output would be
  presented beside the engine's under the same heading while being a different
  program.  Everything this page draws comes out of one run of one case:

    * `fit_history.csv`  -- the engine's own iteration log: chi2, lambda and
      every parameter, one row per LM iteration.  Declared by the case in
      `output { fit_log ...; }` and harvested by the browser worker like any
      other CSV the run leaves behind.
    * `parity.csv`       -- the engine's own parity table over the FITTED
      points: x1, P, the measured bubble temperature, the model's, and the
      residual between them.
    * the operation's `diagnostics` and `curation` objects in the result JSON
      -- chi2, the held-out AAD, the identifiability statistics, and the
      VERDICT as a word.

  So the only code here is: the witness's name, three dict overrides, and two
  header-checked CSV readers.  No arithmetic on any of it.

  THE READERS REFUSE RATHER THAN GUESS (the thielePellet precedent).  A header
  that has drifted is named and rejected, because a reader that took columns
  positionally would draw one quantity under another one's caption.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";

/** The witness: eight measured ethanol/water bubble temperatures fitted, three
 *  withheld, an acceptance band declared before the fit with its origin
 *  stated, and a verdict.  It is a `choupoProps` case and runs in the browser.
 */
export const LS_WITNESS = "props/curation/curate02_vle_heldout_ethanol_water";

/** The operation inside it whose diagnostics and verdict this page draws. */
export const LS_OP = "nrtl_etoh_water_heldout";

/** The file the three knobs write into. */
export const LS_PROPS_FILE = "system/propsDict";

/** The two CSVs the case's `output {}` block names, harvested from the run. */
export const LS_FIT_LOG = "fit_history.csv";
export const LS_PARITY = "parity.csv";

/*  The values the CASE declares, so the page opens on the shipped run and a
 *  reader who touches nothing sees exactly what a terminal would print.  Each
 *  is pinned against the witness's own dict in tests/leastSquaresRun.test.ts:
 *  a default here that drifted from the dict would mean the first render
 *  silently answered a different question from the case.  */
export const LS_BAND_DEFAULT_PCT = 0.1;
export const LS_LAMBDA0_DEFAULT_EXP = -3;
export const LS_MAXITER_DEFAULT = 60;

/** The damping knob turns an EXPONENT, not the number itself.
 *
 *  `lambda0` is useful over ten decades and a linear control cannot serve
 *  that; the knob therefore carries log10(lambda0) and this function is the
 *  one place the power is taken.  The panel prints the resulting lambda0 so
 *  that what reaches the dict is on screen, never only in the code. */
export const lambda0Of = (exponent: number): number =>
  Math.pow(10, exponent);

/** The three knobs, as dict overrides.
 *
 *  Each writes the NUMBER of a declared scalar and keeps its unit word; the
 *  acceptance band declares `percent` in the dict and the override says so, so
 *  writing a fraction into that slot refuses instead of being off by a factor
 *  of a hundred.  `maxIter` and `lambda0` are bare SI (dimensionless counts),
 *  and declaring `unit: ""` holds them to that.
 *
 *  The band is ROUNDED before it is written: a slider stepping by 0.01 reaches
 *  0.060000000000000005, and a dict carrying that reads as a number somebody
 *  measured. */
export function lsOverrides(
  bandPct: number, lambda0Exp: number, maxIter: number,
): DictOverride[] {
  return [
    { file: LS_PROPS_FILE, key: "maxAAD",
      value: Number(bandPct.toFixed(4)), unit: "percent" },
    { file: LS_PROPS_FILE, key: "lambda0",
      value: lambda0Of(lambda0Exp), unit: "" },
    { file: LS_PROPS_FILE, key: "maxIter",
      value: Math.round(maxIter), unit: "" },
  ];
}

export type Read<T> = { ok: true; read: T } | { ok: false; why: string };

// ---- fit_history.csv --------------------------------------------------------

/** One LM iteration, exactly as the engine logged it. */
export interface FitIteration {
  iter: number;
  chi2: number;
  lambda: number;
  /** One entry per fitted parameter, in the header's order. */
  params: number[];
}

export interface FitHistory {
  /** The dict PATHS of the fitted parameters, from the CSV header. */
  paramPaths: string[];
  rows: FitIteration[];
}

const HISTORY_LEAD = ["iter", "chi2", "lambda"];

/** Read the engine's LM iteration log.
 *
 *  The first three columns are fixed and the rest are whatever parameters the
 *  case declared, named by their dict paths -- so the reader checks the three
 *  and takes the rest as given, rather than pinning a column count that would
 *  refuse a four-parameter fit for being a three-parameter one.
 *
 *  A row whose parameter count does not match the header is SKIPPED and
 *  counted, never padded: a short row is a truncated write, and inventing a
 *  zero for the missing column would put a parameter trajectory on screen that
 *  the engine never produced. */
export function readFitHistory(csv: string): Read<FitHistory> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2)
    return { ok: false, why: "the fit history CSV carries no rows" };
  const header = lines[0]!.split(",").map((s) => s.trim());
  for (let i = 0; i < HISTORY_LEAD.length; ++i) {
    if (header[i] !== HISTORY_LEAD[i])
      return { ok: false, why: `this CSV is not a fitParameters fit history `
        + `(its header is '${header.join(",")}'; the first three columns must `
        + `be '${HISTORY_LEAD.join(",")}', which the operation writes)` };
  }
  const paramPaths = header.slice(3);
  if (paramPaths.length === 0)
    return { ok: false, why: "the fit history names no fitted parameter" };

  const rows: FitIteration[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== header.length) continue;
    const iter = Number(c[0]), chi2 = Number(c[1]), lambda = Number(c[2]);
    const params = paramPaths.map((_, j) => Number(c[3 + j]));
    if (![iter, chi2, lambda, ...params].every(Number.isFinite)) continue;
    rows.push({ iter, chi2, lambda, params });
  }
  if (rows.length === 0)
    return { ok: false, why: "the fit history has a header and no usable row" };
  return { ok: true, read: { paramPaths, rows } };
}

// ---- parity.csv -------------------------------------------------------------

/** One FITTED point, with the engine's own model temperature beside it. */
export interface ParityRow {
  x1: number;
  P_Pa: number;
  T_exp: number;
  T_model: number;
  residual: number;
}

const PARITY_HEADER = "x_1,P_Pa,T_exp,T_model,residual";

/** Read the engine's parity table.
 *
 *  It covers the FITTED subset only -- the held-out points are not in it,
 *  because the operation publishes their aggregate deviation and not a
 *  per-point prediction.  That absence is drawn on the page rather than
 *  filled in: the three compositions missing from this table ARE the three the
 *  fitter never saw.
 *
 *  A row whose model temperature did not converge comes through as a NaN in
 *  the engine's own output; such a row is kept, with `T_model` NaN, so the
 *  page can say the bubble point failed there instead of silently shortening
 *  the table. */
export function readParity(csv: string): Read<ParityRow[]> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2)
    return { ok: false, why: "the parity CSV carries no rows" };
  const header = lines[0]!.split(",").map((s) => s.trim()).join(",");
  if (header !== PARITY_HEADER)
    return { ok: false, why: `this CSV is not a fitParameters parity table `
      + `(its header is '${header}'; the tool needs '${PARITY_HEADER}', which `
      + `the operation writes)` };

  const rows: ParityRow[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== 5) continue;
    const x1 = Number(c[0]), P_Pa = Number(c[1]), T_exp = Number(c[2]);
    if (![x1, P_Pa, T_exp].every(Number.isFinite)) continue;
    rows.push({
      x1, P_Pa, T_exp,
      T_model: Number(c[3]),
      residual: Number(c[4]),
    });
  }
  if (rows.length === 0)
    return { ok: false, why: "the parity table has a header and no usable row" };
  return { ok: true, read: rows };
}

// ---- what the run said ------------------------------------------------------

/** The `[evidence]` lines the partition announces, straight out of the run log.
 *
 *  They are the engine SAYING which dataset was frozen in which role, before
 *  it fitted anything -- the page shows them verbatim rather than describing
 *  them, on the same principle as the QP tool's console block. */
export function evidenceLines(log: string | null): string[] {
  if (!log) return [];
  return log.split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => /\[evidence\]|^\s{6}(FIT|HELD-OUT)\s|\[independence\]/
      .test(l));
}

// ---- what the engine DID on an iteration -----------------------------------

/** WHAT THE ENGINE DID ON THIS ITERATION, READ OFF ITS OWN DAMPING RATIO.
 *
 *  The engine takes the accept/reject decision and does not publish it as a
 *  word, so the only honest way to name it here is to read the one number it
 *  DOES publish and that the decision moves by a fixed factor: 0.7 on an
 *  accepted step, 2.5 on a rejected one, 10 when the damped normal matrix
 *  came back singular (FitParameters.cpp:924, :931, :901).
 *
 *  A FIRST VERSION RE-TOOK THE DECISION instead, from whether chi2 had fallen
 *  — which is a second home for a decision the engine already made, and it
 *  was WRONG on the shipped run's own last row: the CSV carries six
 *  significant figures, the last accepted step moved the objective below
 *  that, and the column called an accepted step "no change".  A ratio cannot
 *  make that mistake, because the factor is exact and large.
 *
 *  Anything else is reported as the ratio itself rather than guessed at. */
export function dampingMove(prev: number, now: number): string {
  if (!(prev > 0) || !(now > 0)) return "the damping is not a positive number";
  const ratio = now / prev;
  const near = (target: number): boolean =>
    Math.abs(ratio / target - 1) < 0.02;
  if (near(0.7))
    return "step ACCEPTED — the objective fell, so the damping eased (x0.7)";
  if (near(2.5))
    return "step REJECTED — the step was thrown away, only the damping moved "
      + "(x2.5); the parameters beside it are unchanged";
  if (near(10))
    return "the damped normal matrix came back SINGULAR — damping raised a "
      + "whole decade (x10) and the step retried";
  return `the damping moved by x${ratio.toPrecision(3)}, which is none of the `
    + "three factors this engine uses";
}
