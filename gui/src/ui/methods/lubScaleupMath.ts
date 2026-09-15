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
  lubScaleupMath -- the LENGTH-OF-UNUSED-BED design method, as arithmetic.

  THIS IS METHOD GEOMETRY, AND IT IS LABELLED AS SUCH (EduTools Guide, "Why
  the picture can be trusted", rule 2).  The standing rule of the Methods
  plane is zero physics in TypeScript; the one exception is the METHOD BEING
  TAUGHT -- a staircase, a trapezoid area, a textbook closed form -- because
  the method IS the lesson and a page that could not perform it would be
  teaching by description.  Everything in this file is what a student does
  by hand with a breakthrough curve, a ruler and a planimeter:

      t_b       the time the outlet first reaches a chosen fraction f_b of
                the feed (linear interpolation between two samples);
      t_st      the trapezoid integral of (1 - c_out/c_in) over the samples;
      LUB       L_lab (1 - t_b/t_st);
      L_es      L_lab t_req/t_st, the equilibrium length the service time buys;
      L_full    L_es + LUB;  D = sqrt(4 Q/(pi u));  m = rho_b (pi D^2/4) L_full.

  THE ENGINE IS THE JUDGE, NOT THE SOURCE.  The fixed-bed unit publishes its
  OWN stoichiometric time (`t_stoichiometric_<i>`, analytic, announced
  BEFORE the run -- src/unitOperations/batch/FixedBedAdsorber.cpp:703-704)
  and its OWN retention factor (`retention_factor_<i>`, the isotherm's
  q*(c_in) folded in -- FixedBedAdsorber.cpp:2411-2414).  The tool draws the
  hand method's numbers BESIDE those two, and a disagreement is a finding
  about the curve (a cut tail, a bed not at equilibrium, a coarse mesh),
  never a moved answer.  Nothing here reaches an isotherm, a rate law or a
  balance the engine did not already solve.

  NOTHING IS INVENTED.  Every lab-column parameter is read from a surface the
  case or the run publishes, and a parameter that is on none of them is
  reported MISSING with the surface it would come from (`LabColumn.missing`).
  There is no default L, u, eps, rho_b or c_in anywhere in this file.

  The measured-curve reader accepts the same shape as the SDEM digitised CSV
  under membrane12's constant/experimental/: `#` comment lines, one header
  line, two numeric columns.  It refuses by name rather than guessing a
  column, because a breakthrough curve read with its columns swapped is a
  plausible curve that sizes a bed wrongly at exit 0.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "../../case/types.js";
import type { JsonValue } from "../../dict/index.js";
import { scalarToSI } from "../../dict/scalarSI.js";

/** A normalised breakthrough curve: f_k = c_out/c_in at sample t_k. */
export interface Curve {
  t: number[];
  f: number[];
}

/** Where a case ships a MEASURED curve, relative to the case root.  A case
 *  that ships none gets no measured column; the tool says so and invents
 *  nothing (no tutorial ships one today). */
export const MEASURED_CURVE_PATH = "constant/experimental/breakthrough.csv";

/** The header the measured CSV must carry, verbatim after whitespace. */
export const MEASURED_CURVE_HEADER = "t_s,c_over_c0";

// ---- The measured-curve reader ---------------------------------------------

/**
 * Parse `constant/experimental/breakthrough.csv`: `#` comments and blank
 * lines skipped, ONE header line `t_s,c_over_c0`, then numeric rows
 * `<t in s>,<c_out/c_in>`.  Throws with the reason on any shape it does not
 * recognise -- a missing header, a third column, a non-numeric cell, a time
 * that does not increase -- because every one of those is a curve that would
 * otherwise be sized from silently.
 */
export function readBreakthroughCsv(text: string): Curve {
  const lines = text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0)
    throw new Error(`${MEASURED_CURVE_PATH}: no header line (only comments`
      + ` or nothing at all); expected '${MEASURED_CURVE_HEADER}'`);
  const header = lines[0]!.split(",").map((c) => c.trim()).join(",");
  if (header !== MEASURED_CURVE_HEADER)
    throw new Error(`${MEASURED_CURVE_PATH}: header is '${lines[0]}', `
      + `expected '${MEASURED_CURVE_HEADER}' (time in seconds, then `
      + `c_out/c_in) -- the columns are not guessed`);
  const t: number[] = [];
  const f: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((c) => c.trim());
    if (cells.length !== 2)
      throw new Error(`${MEASURED_CURVE_PATH}: row ${i + 1} has `
        + `${cells.length} column(s), expected 2`);
    const tv = Number(cells[0]);
    const fv = Number(cells[1]);
    if (!Number.isFinite(tv) || !Number.isFinite(fv))
      throw new Error(`${MEASURED_CURVE_PATH}: row ${i + 1} is not numeric`
        + ` ('${lines[i]}')`);
    if (t.length > 0 && tv <= t[t.length - 1]!)
      throw new Error(`${MEASURED_CURVE_PATH}: row ${i + 1} does not `
        + `advance in time (${tv} s after ${t[t.length - 1]} s)`);
    t.push(tv);
    f.push(fv);
  }
  if (t.length < 2)
    throw new Error(`${MEASURED_CURVE_PATH}: fewer than two data rows`);
  return { t, f };
}

// ---- Reading the two times off a curve --------------------------------------

/**
 * The first time the curve reaches `level` (c_out/c_in = f_b): linear
 * interpolation between the last sample below and the first at or above.
 * `null` when the curve never gets there -- a breakthrough that was not
 * observed is reported, never extrapolated.  A curve already at or above the
 * level at its first sample returns that first time.
 */
export function crossingTime(curve: Curve, level: number): number | null {
  const { t, f } = curve;
  if (t.length === 0) return null;
  if (f[0]! >= level) return t[0]!;
  for (let k = 1; k < t.length; k++) {
    const f0 = f[k - 1]!;
    const f1 = f[k]!;
    if (f1 >= level && f0 < level) {
      const w = (level - f0) / (f1 - f0);
      return t[k - 1]! + w * (t[k]! - t[k - 1]!);
    }
  }
  return null;
}

export interface StoichiometricResult {
  /** Trapezoid of (1 - f) from the first sample to the last. */
  tSt: number;
  /** Where the integration started and stopped, and what it saw there. */
  t0: number;
  tEnd: number;
  fEnd: number;
  /** true when the last sample sits at or above `completeAt` -- the tail
   *  that was dropped is then small; false means the data are INCOMPLETE and
   *  tSt is a LOWER BOUND on the stoichiometric time. */
  complete: boolean;
}

/**
 * t_st = INTEGRAL(1 - c_out/c_in) dt, as the trapezoid rule over the samples
 * -- what a student does on the data, and exactly the quadrature the engine's
 * `integral_anchor_<i>` KPI runs on its own outlet
 * (FixedBedAdsorber.H:163-164).  Integrated from the FIRST sample to the
 * LAST; the tail after the last sample is dropped and the result says so.
 */
export function stoichiometricTime(
  curve: Curve, completeAt = 0.95,
): StoichiometricResult {
  const { t, f } = curve;
  let area = 0;
  for (let k = 1; k < t.length; k++)
    area += 0.5 * (t[k]! - t[k - 1]!) * ((1 - f[k - 1]!) + (1 - f[k]!));
  const fEnd = f[f.length - 1]!;
  return {
    tSt: area, t0: t[0]!, tEnd: t[t.length - 1]!, fEnd,
    complete: fEnd >= completeAt,
  };
}

// ---- The unused bed, and the scale-up -------------------------------------

export interface LubResult {
  /** t_b / t_st -- the fraction of the lab bed's capacity used at switch. */
  fUsed: number;
  /** LUB = L_lab (1 - t_b/t_st). */
  lub: number;
  /** 2 LUB -- the mass-transfer-zone length under a SYMMETRIC front.  Stated
   *  for the reader; the sizing below uses LUB, which needs no symmetry. */
  lMtz: number;
}

export function lubFromTimes(tB: number, tSt: number, lLab: number): LubResult {
  const fUsed = tB / tSt;
  const lub = lLab * (1 - fUsed);
  return { fUsed, lub, lMtz: 2 * lub };
}

export interface ScaleUpInput {
  lLab: number;
  tSt: number;
  lub: number;
  /** Superficial velocity, HELD at the lab value -- LUB is a property of u. */
  u: number;
  tReq: number;
  /** Design feed volumetric flow at the same u. */
  Q: number;
  /** Bulk density; null when the case does not publish it -> no mass. */
  rhoB: number | null;
}

export interface ScaleUpResult {
  /** Equilibrium length: L_lab t_req/t_st. */
  lEs: number;
  /** L_es + LUB. */
  lFull: number;
  /** L_es / L_full -- what fraction of the full bed does work at switch. */
  utilisation: number;
  /** sqrt(4 Q / (pi u)). */
  D: number;
  /** rho_b (pi D^2/4) L_full, or null when rho_b is not published. */
  mAds: number | null;
}

export function scaleUp(inp: ScaleUpInput): ScaleUpResult {
  const lEs = inp.lLab * inp.tReq / inp.tSt;
  const lFull = lEs + inp.lub;
  const D = Math.sqrt(4 * inp.Q / (Math.PI * inp.u));
  const area = Math.PI * D * D / 4;
  return {
    lEs, lFull, utilisation: lEs / lFull, D,
    mAds: inp.rhoB === null ? null : inp.rhoB * area * lFull,
  };
}

// ---- The capacity check: the curve against the isotherm --------------------

/** q* from the mass balance over the curve:
 *      rho_b q* L = u c_in t_st - eps c_in L
 *  (solute fed to t_st, less what sits in the voids at the feed value). */
export function loadingFromCurve(
  cIn: number, u: number, tSt: number, eps: number, lLab: number, rhoB: number,
): number {
  return cIn * (u * tSt - eps * lLab) / (rhoB * lLab);
}

/** q*(c_in) from the ENGINE's own retention factor, its definition
 *  R_f = eps + rho_b q*(c_in)/c_in (FixedBedAdsorber.cpp:814) solved for q*. */
export function loadingFromRetention(
  rF: number, eps: number, cIn: number, rhoB: number,
): number {
  return (rF - eps) * cIn / rhoB;
}

// ---- The lab column, read from the case ------------------------------------

export interface LabColumn {
  /** The `units[]` entry whose name matched the KPI unit, if any. */
  unitFound: boolean;
  /** Bed length, superficial velocity, void fraction: operation.{L,u,eps}
   *  (FixedBedAdsorber.cpp:146-149), converted to SI. */
  L: number | null;
  u: number | null;
  eps: number | null;
  /** The adsorbent record's `rho_bulk` (Adsorbent.cpp:42), read from the
   *  case's own vendored copy; null when the case vendors none. */
  rhoB: number | null;
  adsorbent: string | null;
  /** Which case file rho_b was read from. */
  rhoBSource: string | null;
  /** Every quantity that could not be read, each with the surface it would
   *  come from -- the honest half of this record. */
  missing: string[];
}

const isDict = (v: JsonValue | undefined): v is { [k: string]: JsonValue } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The number of a `key <number> [unit];` line in a raw record body. */
function scalarInRecord(body: string, key: string): number | null {
  const m = new RegExp("^[ \\t]*" + key + "[ \\t]+([-+0-9.eE]+)", "m").exec(body);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Read the lab column's declared geometry and its adsorbent's bulk density
 * from the case that produced the run.  `unit` is the KPI unit name
 * (`detectBreakthrough().unit`); a flattened fractal name (`SECTOR.bed`) is
 * matched on its last segment.  Every absence is NAMED in `missing`.
 */
export function readLabColumn(files: CaseFiles | null, unit: string): LabColumn {
  const out: LabColumn = {
    unitFound: false, L: null, u: null, eps: null, rhoB: null,
    adsorbent: null, rhoBSource: null, missing: [],
  };
  const leaf = unit.split(".").pop() ?? unit;
  const units = files?.flowsheet?.["units"];
  let op: { [k: string]: JsonValue } | null = null;
  if (Array.isArray(units)) {
    for (const u of units) {
      if (!isDict(u)) continue;
      const name = u["name"];
      if (name === unit || name === leaf) {
        const o = u["operation"];
        if (isDict(o)) op = o;
        out.unitFound = true;
        break;
      }
    }
  }
  if (op === null) {
    out.missing.push(`L, u, eps: no units[] entry named '${unit}' with an `
      + "operation {} block in system/flowsheetDict");
    out.missing.push("rho_b: the adsorbent record is named by that same "
      + "operation.adsorbent key");
    return out;
  }
  const read = (key: string, what: string): number | null => {
    const raw = op![key];
    if (raw === undefined) {
      out.missing.push(`${what}: operation.${key} is not declared in `
        + "system/flowsheetDict");
      return null;
    }
    const v = scalarToSI(raw);
    if (!Number.isFinite(v)) {
      out.missing.push(`${what}: operation.${key} = '${String(raw)}' is not `
        + "a scalar this reader can convert to SI");
      return null;
    }
    return v;
  };
  out.L = read("L", "L");
  out.u = read("u", "u");
  out.eps = read("eps", "eps");

  const ads = op["adsorbent"];
  if (typeof ads !== "string" || ads.length === 0) {
    out.missing.push("rho_b: operation.adsorbent names no record in "
      + "system/flowsheetDict");
    return out;
  }
  out.adsorbent = ads;
  // The engine's own order: the case-local `constant/adsorbents/<name>.dat`
  // overlay is read over the flat `constant/assets/` scan
  // (AdsorbentRegistry.cpp:138-151).
  const raw = files?.rawFiles ?? files?.extraFiles ?? {};
  for (const rel of [`constant/adsorbents/${ads}.dat`, `constant/assets/${ads}.dat`]) {
    const body = raw[rel];
    if (body === undefined) continue;
    const v = scalarInRecord(body, "rho_bulk");
    if (v !== null) { out.rhoB = v; out.rhoBSource = rel; break; }
    out.missing.push(`rho_b: ${rel} carries no rho_bulk line`);
    break;
  }
  if (out.rhoB === null && out.rhoBSource === null
      && !out.missing.some((m) => m.startsWith("rho_b:")))
    out.missing.push(`rho_b: the adsorbent record '${ads}' is not vendored `
      + `under this case's constant/adsorbents/ or constant/assets/ (the `
      + "engine reads its rho_bulk from data/standards/assets/ then, which "
      + "the run does not publish as a KPI)");
  return out;
}

// ---- Curve helpers the plot uses -------------------------------------------

/** The value of the curve at `x`, linearly interpolated (clamped outside). */
export function curveAt(curve: Curve, x: number): number {
  const { t, f } = curve;
  if (x <= t[0]!) return f[0]!;
  const n = t.length;
  if (x >= t[n - 1]!) return f[n - 1]!;
  for (let k = 1; k < n; k++) {
    if (t[k]! >= x) {
      const w = (x - t[k - 1]!) / (t[k]! - t[k - 1]!);
      return f[k - 1]! + w * (f[k]! - f[k - 1]!);
    }
  }
  return f[n - 1]!;
}

/** The samples of the curve inside [a, b], with both ends interpolated in,
 *  so a shaded region starts and stops exactly on its marker. */
export function curveSegment(curve: Curve, a: number, b: number): Curve {
  const t: number[] = [a];
  const f: number[] = [curveAt(curve, a)];
  for (let k = 0; k < curve.t.length; k++) {
    const x = curve.t[k]!;
    if (x > a && x < b) { t.push(x); f.push(curve.f[k]!); }
  }
  t.push(b);
  f.push(curveAt(curve, b));
  return { t, f };
}
