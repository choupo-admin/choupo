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
  dataReconciliationRun -- the witness, the knobs, and READERS for the three
  CSVs the engine's `dataReconciliation` operation writes (DEV.md 4c C121).

  `Run`, NOT `Math`, ON PURPOSE (the leastSquaresRun precedent).  The page
  draws a reconciliation and computes NONE of it: the weighted least squares,
  the balance residuals and their standard deviations, the chi-square and
  measurement tests, the multipliers, the per-balance attribution, the
  posterior covariance and the precision-weighted prior are all published by
  the engine and read here.  A second implementation in TypeScript would be a
  second home for the method, drawn beside the engine's under the same
  heading while being a different program.

  What IS here: the witness's name, the overrides that plant a gross error
  on a chosen meter, header-checked CSV readers, and formatting.  The one
  piece of arithmetic is the drift's range, which is a statement about the
  KNOB and not about the reconciliation: bin/curate/check_data_reconciliation
  reads DRIFT_MIN and DRIFT_MAX from this file and runs the engine at both
  ends on every meter, so a range that drove a flow against zero (where the
  engine refuses the Gaussian statistics) fails a gate instead of a student.

  THE READERS REFUSE RATHER THAN GUESS.  A header that has drifted is named
  and rejected; a reader that took columns by position would draw one
  quantity under another one's caption.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";

/** The bundled tutorial this page runs in the browser (choupoProps). */
export const DR_WITNESS = "props/reconciliation/reconcile01_recycle_loop";

/** The file the knobs write into. */
export const DR_PROPS_FILE = "system/propsDict";

/** The four operations of the witness, and the CSV prefix each writes. */
export const DR_OPS = {
  honest: "honest",
  drifted: "drifted",
  driftedWithout: "without",
  yesterday: "prior",
} as const;
export type DrOp = keyof typeof DR_OPS;

export const streamsCsv = (op: DrOp): string => `${DR_OPS[op]}_streams.csv`;
export const balancesCsv = (op: DrOp): string => `${DR_OPS[op]}_balances.csv`;
export const covarianceCsv = (op: DrOp): string => `${DR_OPS[op]}_covariance.csv`;

/** The unit the witness's network declares; every number the op publishes
 *  is in it.  Pinned against the network file in the lesson test. */
export const DR_UNIT = "t/h";

/** The drift the CASE declares on F3, so the page opens on the shipped run. */
export const DRIFT_DEFAULT_METER = "F3";
export const DRIFT_DEFAULT_SIZE = 15;

/** The knob's range, t/h.  Held by bin/curate/check_data_reconciliation,
 *  which runs both ends on every meter (see the header). */
export const DRIFT_MIN = -8;
export const DRIFT_MAX = 24;

/** Plant a gross error of `size` t/h on `meter`, in BOTH drifted operations,
 *  and take the same meter out of service in the second -- so the page
 *  always compares "left in" with "removed" for the meter the reader chose.
 *
 *  `meter` and `size` each appear twice in the propsDict (one per drifted
 *  operation, in file order); `exclude` appears once.  The test holds these
 *  occurrence counts to the witness's own dict. */
export function driftOverrides(meter: string, size: number): DictOverride[] {
  const v = Number(size.toFixed(2));
  return [
    { file: DR_PROPS_FILE, key: "meter", word: meter, occurrence: 1 },
    { file: DR_PROPS_FILE, key: "meter", word: meter, occurrence: 2 },
    { file: DR_PROPS_FILE, key: "size", value: v, unit: "t/h", occurrence: 1 },
    { file: DR_PROPS_FILE, key: "size", value: v, unit: "t/h", occurrence: 2 },
    { file: DR_PROPS_FILE, key: "exclude", word: meter },
  ];
}

export type Read<T> = { ok: true; read: T } | { ok: false; why: string };

// ---- <op>_streams.csv --------------------------------------------------------

export type StreamRole = "measured" | "measuredWithPrior" | "priorOnly" | "unmeasured";

/** One stream, exactly as the engine wrote it.  An empty cell (a quantity
 *  that does not apply: no prior, no adjustment for an unmeasured flow) is
 *  `null`, never zero. */
export interface StreamRow {
  stream: string;
  role: StreamRole;
  excluded: boolean;
  reading: number | null;
  drift: number | null;
  sigma: number | null;
  prior: number | null;
  priorSigma: number | null;
  combined: number | null;
  combinedSigma: number | null;
  reconciled: number;
  sigmaReconciled: number;
  adjustment: number | null;
  adjustmentSigma: number | null;
  measurementTest: number | null;
  redundant: boolean | null;
  flagged: boolean | null;
  offset: number | null;
  offsetTest: number | null;
  truth: number | null;
  /** balance name -> the part of this stream's adjustment it caused, in sigma */
  byBalance: { [balance: string]: number | null };
}

const STREAM_HEAD = ["stream", "role", "excluded", "reading", "drift", "sigma",
  "prior", "priorSigma", "combined", "combinedSigma", "reconciled",
  "sigmaReconciled", "adjustment", "adjustmentSigma", "measurementTest",
  "redundant", "flagged", "offset", "offsetTest", "truth"];

const cellNum = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};
const cellBool = (s: string | undefined): boolean | null =>
  s === "1" ? true : s === "0" ? false : null;

export interface StreamTable {
  balances: string[];
  rows: StreamRow[];
}

export function readStreams(csv: string): Read<StreamTable> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, why: "the stream table carries no rows" };
  const head = lines[0]!.split(",").map((s) => s.trim());
  for (let i = 0; i < STREAM_HEAD.length; ++i)
    if (head[i] !== STREAM_HEAD[i])
      return { ok: false, why: `this CSV is not a dataReconciliation stream table `
        + `(column ${i + 1} is '${head[i] ?? "(none)"}', the op writes `
        + `'${STREAM_HEAD[i]}')` };
  const rest = head.slice(STREAM_HEAD.length);
  if (!rest.every((h) => h.startsWith("by_")))
    return { ok: false, why: `unexpected columns after 'truth': ${rest.join(", ")}` };
  const balances = rest.map((h) => h.slice(3));
  const rows: StreamRow[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== head.length) continue;
    const reconciled = Number(c[10]), sigmaReconciled = Number(c[11]);
    if (!Number.isFinite(reconciled) || !Number.isFinite(sigmaReconciled)) continue;
    const by: { [b: string]: number | null } = {};
    balances.forEach((b, i) => { by[b] = cellNum(c[STREAM_HEAD.length + i]); });
    rows.push({
      stream: c[0]!, role: c[1] as StreamRole, excluded: c[2] === "1",
      reading: cellNum(c[3]), drift: cellNum(c[4]), sigma: cellNum(c[5]),
      prior: cellNum(c[6]), priorSigma: cellNum(c[7]),
      combined: cellNum(c[8]), combinedSigma: cellNum(c[9]),
      reconciled, sigmaReconciled,
      adjustment: cellNum(c[12]), adjustmentSigma: cellNum(c[13]),
      measurementTest: cellNum(c[14]), redundant: cellBool(c[15]),
      flagged: cellBool(c[16]), offset: cellNum(c[17]),
      offsetTest: cellNum(c[18]), truth: cellNum(c[19]), byBalance: by,
    });
  }
  if (rows.length === 0) return { ok: false, why: "the stream table has a header and no usable row" };
  return { ok: true, read: { balances, rows } };
}

// ---- <op>_balances.csv -------------------------------------------------------

export interface BalanceRow {
  balance: string;
  equation: string;
  residual: number;
  residualSigma: number;
  residualTest: number;
  residualAfter: number;
  /** the multiplier of the balance as written: x = m - C A^T lambda */
  multiplier: number;
  /** the reconciler's own multiplier, of the row scaled to sigma space */
  multiplierSigma: number;
  binding: boolean;
}

const BALANCE_HEAD = "balance,equation,residual,residualSigma,residualTest,"
  + "residualAfter,multiplier,multiplierSigma,binding";

export function readBalances(csv: string): Read<BalanceRow[]> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, why: "the balance table carries no rows" };
  const head = lines[0]!.split(",").map((s) => s.trim()).join(",");
  if (head !== BALANCE_HEAD)
    return { ok: false, why: `this CSV is not a dataReconciliation balance table `
      + `(its header is '${head}'; the op writes '${BALANCE_HEAD}')` };
  const rows: BalanceRow[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== 9) continue;
    const v = c.slice(2, 8).map(Number);
    if (!v.every(Number.isFinite)) continue;
    rows.push({
      balance: c[0]!, equation: c[1]!, residual: v[0]!, residualSigma: v[1]!,
      residualTest: v[2]!, residualAfter: v[3]!, multiplier: v[4]!,
      multiplierSigma: v[5]!, binding: c[8] === "1",
    });
  }
  if (rows.length === 0) return { ok: false, why: "the balance table has a header and no usable row" };
  return { ok: true, read: rows };
}

// ---- <op>_covariance.csv -----------------------------------------------------

export interface Covariance {
  streams: string[];
  /** row-major, streams x streams */
  cell: number[][];
}

export function readCovariance(csv: string): Read<Covariance> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, why: "the covariance table carries no rows" };
  const head = lines[0]!.split(",").map((s) => s.trim());
  if (head[0] !== "stream")
    return { ok: false, why: `this CSV is not a dataReconciliation covariance (it starts '${head[0]}')` };
  const streams = head.slice(1);
  const cell: number[][] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c[0] !== streams[r - 1])
      return { ok: false, why: `covariance row ${r} is '${c[0]}', the header puts '${streams[r - 1]}' there` };
    const v = c.slice(1).map(Number);
    if (v.length !== streams.length || !v.every(Number.isFinite))
      return { ok: false, why: `covariance row '${c[0]}' is not ${streams.length} numbers` };
    cell.push(v);
  }
  if (cell.length !== streams.length)
    return { ok: false, why: `the covariance has ${cell.length} rows for ${streams.length} streams` };
  return { ok: true, read: { streams, cell } };
}

// ---- three answers, side by side (DEV.md 4c C137) ---------------------------

/** One stream's three answers, as page 5 draws them.  NOTHING is computed:
 *  every field is a cell the engine wrote.
 *
 *  `classical` and `flat` are the SAME cell of the honest operation, on
 *  purpose.  The engine runs one reconciliation and the page reads it twice
 *  -- as the minimiser of the weighted squares (classical) and as the mode
 *  of the flat-prior posterior (Bayes) -- because they are one number; a
 *  second run "for the Bayes panel" would be a second home for it.  What
 *  the flat panel adds is the WIDTH, `flatSigma`, which the classical panel
 *  does not claim.  The test holds the honest flows to the stationarity
 *  condition of the weighted least squares, so the identity is checked
 *  rather than assumed. */
export interface ThreeAnswers {
  stream: string;
  reading: number | null;
  sigma: number | null;
  truth: number | null;
  prior: number | null;
  priorSigma: number | null;
  classical: number;
  flat: number;
  flatSigma: number;
  informative: number;
  informativeSigma: number;
}

/** Join the honest and the yesterday operations stream by stream.  Refuses
 *  rather than drawing a panel with a hole in it. */
export function threeAnswers(honest: StreamTable, prior: StreamTable): Read<ThreeAnswers[]> {
  const out: ThreeAnswers[] = [];
  for (const h of honest.rows) {
    const p = prior.rows.find((r) => r.stream === h.stream);
    if (!p) return { ok: false, why: `the prior operation carries no stream '${h.stream}'` };
    out.push({
      stream: h.stream, reading: h.reading, sigma: h.sigma, truth: h.truth,
      prior: p.prior, priorSigma: p.priorSigma,
      classical: h.reconciled, flat: h.reconciled, flatSigma: h.sigmaReconciled,
      informative: p.reconciled, informativeSigma: p.sigmaReconciled,
    });
  }
  if (out.length !== prior.rows.length)
    return { ok: false, why: "the prior operation carries a stream the honest one does not" };
  return { ok: true, read: out };
}

// ---- the plant, as the page draws it ----------------------------------------

/** The witness's network, drawn.  The topology is the case's
 *  (constant/plant/network); tests/dataReconciliationLesson.test.ts holds
 *  every edge here to that file's node in/out lists, so the picture cannot
 *  show a plant the engine did not reconcile. */
export const DIAGRAM_NODES: { id: string; x: number; y: number }[] = [
  { id: "mixer", x: 140, y: 70 },
  { id: "reactor", x: 340, y: 70 },
  { id: "separator", x: 540, y: 70 },
  { id: "splitter", x: 440, y: 175 },
];
/** stream -> [from, to]; "in"/"out" are the plant boundary. */
export const DIAGRAM_EDGES: { [s: string]: [string, string] } = {
  F1: ["in", "mixer"], F2: ["mixer", "reactor"], F3: ["reactor", "separator"],
  F4: ["separator", "out"], F5: ["separator", "splitter"],
  F6: ["splitter", "out"], F7: ["splitter", "mixer"],
};


// ---- formatting --------------------------------------------------------------

/** A number with `d` decimals, or a dash for a quantity that does not apply. */
export const fmt = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);

/** A signed number, so a correction always shows its direction. */
export const fmtSigned = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—"
    : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
