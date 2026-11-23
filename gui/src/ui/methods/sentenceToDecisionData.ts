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
  sentenceToDecisionData -- the real artefacts of the methanol-water worked
  example, READ, never retyped (DEV.md 4c C127).

  Every file below is the one the tree ships, imported as text by the bundler:
  the two measured series, the propsDict of the case that fits them, its
  golden, and the catalogue record the fit produced.  This module only PARSES
  them -- it fits nothing, and it holds no number of its own.  What the page
  shows is therefore what the files say today; tests/sentenceToDecision.test.ts
  holds the parsers to the engine's own run output.
\*---------------------------------------------------------------------------*/

import FIT_DAT from "../../../../tutorials/props/curation/curate04_nrtl_methanol_water/constant/experiments/methanol-water-bubble-j.jct.2009.11.020.dat?raw";
import HELD_DAT from "../../../../tutorials/props/curation/curate04_nrtl_methanol_water/constant/experiments/methanol-water-bubble-je200341c.dat?raw";
import PROPS_DICT from "../../../../tutorials/props/curation/curate04_nrtl_methanol_water/system/propsDict?raw";
import GOLDEN from "../../../../tutorials/props/curation/curate04_nrtl_methanol_water/expected?raw";
import RECORD from "../../../../data/standards/parameters/NRTL/methanol-water.dat?raw";

export { FIT_DAT, HELD_DAT, PROPS_DICT, GOLDEN, RECORD };

/** The shipped case, and the files the page reads, by repository path. */
export const CASE_DIR = "tutorials/props/curation/curate04_nrtl_methanol_water";
export const CASE_NAME = "curate04_nrtl_methanol_water";
export const FIT_FILE = `${CASE_DIR}/constant/experiments/methanol-water-bubble-j.jct.2009.11.020.dat`;
export const HELD_FILE = `${CASE_DIR}/constant/experiments/methanol-water-bubble-je200341c.dat`;
export const PROPS_FILE = `${CASE_DIR}/system/propsDict`;
export const GOLDEN_FILE = `${CASE_DIR}/expected`;
export const RECORD_FILE = "data/standards/parameters/NRTL/methanol-water.dat";

/** Standard atmosphere, the one conversion the request needs. */
export const ATM_KPA = 101.325;

// ---- a measured series -------------------------------------------------------

export interface Series {
  citation: string;
  doi: string;
  sha256: string;
  archiveFile: string;
  block: number;
  reviewStatus: string;
  /** `pressure <v> kPa;` held across the file, or null when a column carries it */
  heldPressureKPa: number | null;
  x: number[];
  /** kPa, one per point */
  P: number[];
  /** K */
  T: number[];
  /** the point's own stated expanded uncertainty, K */
  U: number[];
  /** the vapour mole fraction when the file has one */
  y: number[] | null;
  uncertaintyKind: string;
  uncertaintyLevel: number;
  cas: { methanol: string; water: string };
}

function strField(t: string, key: string): string {
  const m = new RegExp(`\\b${key}\\s+"([^"]*)"\\s*;`).exec(t);
  return m ? m[1]! : "";
}

/** Parse one `constant/experiments/*.dat` the way the engine's reader does:
 *  `columns ( { name ...; unit ...; } )`, `data ( rows )`, per-point
 *  `uncertainty { T_bubble { values ( ... ); } }`. */
export function parseSeries(text: string): Series {
  // strip block and line comments before reading any field
  const t = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const colBlock = /columns\s*\(([\s\S]*?)\)\s*;/.exec(t)?.[1] ?? "";
  const names = [...colBlock.matchAll(/name\s+([^;]+?)\s*;/g)].map((m) => m[1]!);
  const unitsOf = [...colBlock.matchAll(/unit\s+([^;]+?)\s*;/g)].map((m) => m[1]!);
  const dataBlock = /\bdata\s*\(([\s\S]*?)\)\s*;/.exec(t)?.[1] ?? "";
  const nums = dataBlock.trim().split(/\s+/).filter(Boolean).map(Number);
  const nc = names.length;
  const rows: number[][] = [];
  for (let i = 0; i + nc <= nums.length; i += nc) rows.push(nums.slice(i, i + nc));
  const col = (n: string): number[] | null => {
    const k = names.indexOf(n);
    return k < 0 ? null : rows.map((r) => r[k]!);
  };
  const x = col("x[methanol]") ?? [];
  const Tcol = col("T_bubble") ?? [];
  const Pcol = col("Pressure");
  const pUnit = unitsOf[names.indexOf("Pressure")] ?? "kPa";
  const heldP = /^\s*pressure\s+([0-9.eE+-]+)\s*kPa\s*;/m.exec(t);
  const heldPressureKPa = heldP ? Number(heldP[1]) : null;
  const P = Pcol ? Pcol.map((v) => (pUnit === "Pa" ? v / 1000 : v)) : x.map(() => heldPressureKPa ?? NaN);
  const uVals = /T_bubble\s*\{[^}]*?values\s*\(([^)]*)\)/.exec(t)?.[1] ?? "";
  const U = uVals.trim().split(/\s+/).filter(Boolean).map(Number);
  return {
    citation: strField(t, "citation"),
    doi: strField(t, "doi"),
    sha256: strField(t, "sha256"),
    archiveFile: strField(t, "archiveFile"),
    block: Number(/\bblock\s+(\d+)\s*;/.exec(t)?.[1] ?? NaN),
    reviewStatus: /reviewStatus\s+(\w+)\s*;/.exec(t)?.[1] ?? "",
    heldPressureKPa,
    x, P, T: Tcol, U,
    y: col("y_eq_methanol"),
    uncertaintyKind: /\bkind\s+(\w+)\s*;/.exec(t)?.[1] ?? "",
    uncertaintyLevel: Number(/\blevel\s+(\d+)\s*;/.exec(t)?.[1] ?? NaN),
    cas: {
      methanol: /methanol\s*\{\s*cas\s+"([^"]+)"/.exec(t)?.[1] ?? "",
      water: /water\s*\{\s*cas\s+"([^"]+)"/.exec(t)?.[1] ?? "",
    },
  };
}

export const FIT_SERIES = parseSeries(FIT_DAT);
export const HELD_SERIES = parseSeries(HELD_DAT);

// ---- the catalogue record ----------------------------------------------------

export interface PairRecord {
  b_ij: number; b_ji: number; a_ij: number; a_ji: number; alpha: number;
  reviewStatus: string;
  rms_K: number; nDataPoints: number; identifiable: boolean; maxAbsCorr: number;
  fingerprint: string;
  validity: { Tmin: number; Tmax: number; PminPa: number; PmaxPa: number };
  verdict: string;
  heldOut: { points: number; aad_pct: number; aad_K: number; x1: [number, number] };
  maxAAD_pct: number;
  origin: string;
  evidence: { role: string; doi: string; sha256: string; pressure: string | null }[];
}

const numOf = (t: string, key: string): number =>
  Number(new RegExp(`\\b${key}\\s+([-0-9.eE+]+)\\s*;`).exec(t)?.[1] ?? NaN);

/** Parse the sealed catalogue record the case's fit became. */
export function parseRecord(text: string): PairRecord {
  // the header comment is prose, so cut it before reading fields
  const t = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const val = t.slice(t.indexOf("validation"));
  const tr = /temperature\s*\{\s*min\s+([-0-9.eE+]+)\s*K;\s*max\s+([-0-9.eE+]+)\s*K;/.exec(t);
  const pr = /pressure\s*\{\s*min\s+([-0-9.eE+]+)\s*Pa;\s*max\s+([-0-9.eE+]+)\s*Pa;/.exec(t);
  const dom = /domain_x1\s*\(\s*([-0-9.eE+]+)\s+([-0-9.eE+]+)\s*\)/.exec(val);
  const evid = [...t.matchAll(/role\s+(\w+);\s*dataset\s+"[^"]*";\s*doi\s+"([^"]*)";\s*sha256\s+"([^"]*)";[\s\S]*?(?=\}\s*(?:\{|\)))/g)]
    .map((m) => ({
      role: m[1]!, doi: m[2]!, sha256: m[3]!,
      pressure: /pressure\s+"([^"]*)"/.exec(m[0])?.[1] ?? null,
    }));
  return {
    b_ij: numOf(t, "b_ij"), b_ji: numOf(t, "b_ji"), a_ij: numOf(t, "a_ij"), a_ji: numOf(t, "a_ji"),
    alpha: numOf(t, "alpha"),
    reviewStatus: /reviewStatus\s+(\w+);/.exec(t)?.[1] ?? "",
    rms_K: numOf(t, "rms_K"), nDataPoints: numOf(t, "nDataPoints"),
    identifiable: /identifiable\s+true/.test(t), maxAbsCorr: numOf(t, "maxAbsCorr"),
    fingerprint: /fingerprint\s+"([^"]+)"/.exec(t)?.[1] ?? "",
    validity: {
      Tmin: Number(tr?.[1]), Tmax: Number(tr?.[2]),
      PminPa: Number(pr?.[1]), PmaxPa: Number(pr?.[2]),
    },
    verdict: /verdict\s+(\w+);/.exec(val)?.[1] ?? "",
    heldOut: {
      points: numOf(val, "points"), aad_pct: numOf(val, "aad_pct"), aad_K: numOf(val, "aad_K"),
      x1: [Number(dom?.[1]), Number(dom?.[2])],
    },
    maxAAD_pct: numOf(val, "maxAAD"),
    origin: /origin\s+"([^"]*)";\s*\}\s*\}\s*$/.exec(val.trim())?.[1]
      ?? /acceptance\s*\{[\s\S]*?origin\s+"([^"]*)"/.exec(val)?.[1] ?? "",
    evidence: evid,
  };
}

export const RECORD_PARSED = parseRecord(RECORD);

// ---- the golden --------------------------------------------------------------

/** One row of an `expected` file, by kind, name and key. */
export function goldenValue(text: string, kind: string, name: string, key: string): number {
  for (const line of text.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f[0] === kind && f[1] === name && f[2] === key) return Number(f[3]);
  }
  return NaN;
}

export const golden = (name: string, key: string): number => goldenValue(GOLDEN, "diag", name, key);
export const goldenAad = (name: string, key: string): number => goldenValue(GOLDEN, "aad", name, key);

// ---- the engine's parity table -----------------------------------------------

export interface ParityRow {
  x: number;
  /** kPa, when the table carries a pressure */
  P: number | null;
  /** measured, K */
  measured: number;
  /** the engine's value, K */
  calc: number;
  /** calc - measured, K */
  residual: number;
  /** the dataset's own stated expanded uncertainty, K, when the table has it */
  U: number | null;
  role: string;
}

/** Read a `parity.csv` the engine wrote.  The columns are found by NAME in the
 *  header; the function refuses a table it cannot read instead of guessing. */
export function parseParity(csv: string): { header: string[]; rows: Record<string, string>[] } {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]!.split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((l) => {
    const f = l.split(",").map((s) => s.trim());
    return Object.fromEntries(header.map((h, i) => [h, f[i] ?? ""]));
  });
  return { header, rows };
}

// ---- the evidence declaration of the case ------------------------------------

/** The `evidence ( { dataset ...; role ...; } )` list of the FIRST operation of
 *  the case's propsDict (fit_nrtl), read as text. */
export function parseEvidenceDecl(propsDict: string): { dataset: string; role: string }[] {
  const op = propsDict.slice(propsDict.indexOf("name        fit_nrtl;"));
  const block = /evidence\s*\(([\s\S]*?)\n\s*\);/.exec(op)?.[1] ?? "";
  return [...block.matchAll(/dataset\s+"([^"]+)";\s*role\s+(\w+);/g)]
    .map((m) => ({ dataset: m[1]!, role: m[2]! }));
}

/** The acceptance band of that operation: `maxAAD 0.33 percent;`. */
export function parseBand(propsDict: string): { value: number; unit: string; origin: string } {
  const op = propsDict.slice(propsDict.indexOf("name        fit_nrtl;"));
  const a = /acceptance\s*\{([\s\S]*?)\n\s*\}/.exec(op)?.[1] ?? "";
  const m = /maxAAD\s+([-0-9.eE+]+)\s+(\w+)\s*;/.exec(a);
  return { value: Number(m?.[1]), unit: m?.[2] ?? "", origin: /origin\s+"([^"]*)"/.exec(a)?.[1] ?? "" };
}

/** How independent the held-out evidence is, as far as the DECLARATION shows:
 *  the same words the engine's own check uses (a shared file, a shared DOI),
 *  and no more.  Whether two studies are scientifically independent is a human
 *  judgement and is not made here. */
export function independenceOf(fit: Series, held: Series, decl: { dataset: string; role: string }[]):
  { level: "anotherStudy" | "splitOfOneStudy" | "unknown"; words: string } {
  const f = decl.find((d) => d.role === "fit");
  const v = decl.find((d) => d.role === "validation");
  if (!f || !v) return { level: "unknown", words: "the case declares no fit and validation pair" };
  if (f.dataset === v.dataset)
    return { level: "splitOfOneStudy", words: "one file, its rows divided between the two roles: a split of one study" };
  if (fit.doi && held.doi && fit.doi !== held.doi)
    return { level: "anotherStudy",
      words: `two files from two different articles (doi ${fit.doi} and doi ${held.doi}): another study` };
  return { level: "unknown", words: "the two files do not name different articles, so the engine cannot tell" };
}

// ---- the points, fit and held out, from the engine's own tables ---------------

export interface Pt {
  role: "fit" | "heldOut";
  x: number;
  /** kPa */
  P: number;
  /** measured, K */
  T: number;
  /** the engine's value, K */
  calc: number;
  /** calc - measured, K */
  res: number;
  /** the point's own stated expanded uncertainty, K */
  U: number;
}

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** The fitted points: the engine's root `parity.csv` (x_1, P_Pa, T_exp, T_model,
 *  residual) joined, row by row, to the measured file's own uncertainties.  A row
 *  that does not match the file is a refusal, never a guess. */
export function fitPoints(parityCsv: string, s: Series): Pt[] {
  const { rows } = parseParity(parityCsv);
  if (rows.length !== s.x.length)
    throw new Error(`parity.csv has ${rows.length} rows, the measured file ${s.x.length}`);
  return rows.map((r, i) => {
    const x = Number(r["x_1"]), P = Number(r["P_Pa"]) / 1000, T = Number(r["T_exp"]);
    if (!near(x, s.x[i]!, 1e-9) || !near(P, s.P[i]!, 1e-6) || !near(T, s.T[i]!, 1e-6))
      throw new Error(`parity.csv row ${i + 1} is not the measured file's row ${i + 1}`);
    return { role: "fit", x, P, T, calc: Number(r["T_model"]), res: Number(r["residual"]), U: s.U[i]! };
  });
}

/** The held-out points: the series `heldOutResidual` of the engine's residuals
 *  table (x, residual), joined to the held-out file by order and checked by x. */
export function heldPoints(residualsCsv: string, s: Series): Pt[] {
  const { rows } = parseParity(residualsCsv);
  const h = rows.filter((r) => r["series"] === "heldOutResidual");
  if (h.length !== s.x.length)
    throw new Error(`the engine published ${h.length} held-out residuals, the held-out file has ${s.x.length} points`);
  return h.map((r, i) => {
    const x = Number(r["x"]);
    if (!near(x, s.x[i]!, 1e-9)) throw new Error(`held-out residual ${i + 1} is at x = ${x}, the file has ${s.x[i]}`);
    const res = Number(r["y"]);
    return { role: "heldOut", x, P: s.P[i]!, T: s.T[i]!, calc: s.T[i]! + res, res, U: s.U[i]! };
  });
}

/** Mean absolute residual in kelvin, and as a per cent of the measured T. */
export function aadOf(p: readonly Pt[]): { K: number; pct: number } {
  const n = p.length;
  return {
    K: p.reduce((a, q) => a + Math.abs(q.res), 0) / n,
    pct: (100 / n) * p.reduce((a, q) => a + Math.abs(q.res) / q.T, 0),
  };
}

/** Root-mean-square residual of a group of points, K (page arithmetic). */
export function rmsOf(p: readonly Pt[]): number {
  return Math.sqrt(p.reduce((a, q) => a + q.res * q.res, 0) / p.length);
}

/** The fitted points grouped by isobar, ascending pressure. */
export function byIsobar(p: readonly Pt[]): { P: number; pts: Pt[] }[] {
  const m = new Map<string, Pt[]>();
  for (const q of p) { const k = q.P.toFixed(3); m.set(k, [...(m.get(k) ?? []), q]); }
  return [...m.entries()].map(([k, pts]) => ({ P: Number(k), pts })).sort((a, b) => a.P - b.P);
}

/** The pressure span of the request, "a column at 0.5-1 atm", in kPa. */
export const REQUEST_P_KPA: [number, number] = [0.5 * ATM_KPA, 1 * ATM_KPA];
