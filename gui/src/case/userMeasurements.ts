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
  userMeasurements -- the points a USER brings to a fitted record (DEV.md 4c
  C289).  Pure: no React, no physics, no network.  The file never leaves the
  browser: this module sees its text and its bytes, nothing else.

  THE ACCEPTED FORMAT (one, stated in the UI from `ACCEPTED_FORMAT`).  Plain
  CSV, comma separated, the first non-comment line is the header, `#` lines
  and blank lines are skipped.  A header cell is `name/unit`:

    T-x-y of a pair (bubble temperature at a fixed pressure):
        x[<component>]/-, T_bubble/K|C, P/Pa|kPa|bar|MPa  [, y[<component>]/-]
    P-x-y of a pair (bubble pressure at a fixed temperature):
        x[<component>]/-, P_bubble/Pa|kPa|bar|MPa, T/K|C  [, y[<component>]/-]
    a pure vapour pressure:
        T/K|C, Psat/Pa|kPa|bar|MPa

  Every other header, a missing column, a row of the wrong width, a cell that
  is not a finite number, a mole fraction outside [0, 1] or a non-positive
  absolute temperature or pressure REFUSES the whole file, naming the line --
  never a silent drop.

  THE HASH.  `provenance { sha256 }` of a curated dataset is the sha256 of the
  SOURCE FILE its points were extracted from (bin/choupo-thermoml:
  `hashlib.sha256(src.read_bytes())`).  So a match proves the loaded file is
  byte-identical to that source; a CSV of your own cannot match, and the page
  says so.  The check is made only when the user CLAIMS the file is a named
  record dataset.

  THE OUTLIER RULE.  A curated record declares a held-out AAD (and the band
  fixed before the fit), NOT a fit RMS.  The rule is therefore stated in what
  the record provides: a point is marked when |engine - measured| / measured
  exceeds 3 x the record's held-out AAD; with no held-out AAD, 3 x the
  acceptance band; with neither, nothing is marked and the page says why.
\*---------------------------------------------------------------------------*/

export type MeasKind = "txy" | "pxy" | "psat";

export interface MeasPoint {
  /** liquid mole fraction of `xComponent` (pairs), else null */
  x: number | null;
  /** vapour mole fraction of `xComponent` when the file carries it */
  y: number | null;
  /** K.  txy: the MEASURED bubble T; pxy and psat: the held T */
  T: number;
  /** Pa.  txy: the held P; pxy: the MEASURED bubble P; psat: the MEASURED Psat */
  P: number;
}

export interface UserMeasurements {
  kind: MeasKind;
  xComponent: string | null;
  points: MeasPoint[];
}

export type Subject =
  | { kind: "pair"; components: [string, string] }
  | { kind: "component"; component: string };

export type ParseResult =
  | { ok: true; data: UserMeasurements }
  | { ok: false; refusal: string };

export const ACCEPTED_FORMAT: string[] = [
  "Comma-separated text. The first line (after any # comments) is the header; each header cell is name/unit.",
  "A pair at fixed P (T-x-y):  x[<component>]/-,  T_bubble/K|C,  P/Pa|kPa|bar|MPa   (optional y[<component>]/-)",
  "A pair at fixed T (P-x-y):  x[<component>]/-,  P_bubble/Pa|kPa|bar|MPa,  T/K|C   (optional y[<component>]/-)",
  "A pure vapour pressure:     T/K|C,  Psat/Pa|kPa|bar|MPa",
  "Mole fractions in [0, 1]. A malformed file is refused whole, naming the line.",
];

const T_UNITS: Record<string, (v: number) => number> = {
  K: (v) => v, C: (v) => v + 273.15,
};
const P_UNITS: Record<string, number> = { Pa: 1, kPa: 1e3, bar: 1e5, MPa: 1e6 };

interface Col { name: string; unit: string }

function splitHeader(cell: string): Col | null {
  const i = cell.lastIndexOf("/");
  if (i <= 0 || i === cell.length - 1) return null;
  return { name: cell.slice(0, i).trim(), unit: cell.slice(i + 1).trim() };
}

function refuse(refusal: string): { ok: false; refusal: string } { return { ok: false, refusal }; }

export function parseMeasurementsCsv(text: string, subject: Subject): ParseResult {
  const lines = text.split(/\r?\n/).map((l, i) => ({ n: i + 1, s: l.trim() }))
    .filter((l) => l.s !== "" && !l.s.startsWith("#"));
  if (lines.length === 0) return refuse("the file is empty (no header and no rows).");
  const head = lines[0]!;
  if (/[;\t]/.test(head.s) && !head.s.includes(","))
    return refuse(`line ${head.n}: the header is not comma separated (found ; or a tab). Accepted: commas.`);
  const cols: Col[] = [];
  for (const c of head.s.split(",").map((s) => s.trim())) {
    const h = splitHeader(c);
    if (!h) return refuse(`line ${head.n}: header cell "${c}" is not of the form name/unit.`);
    cols.push(h);
  }
  const seen = new Set<string>();
  for (const c of cols) {
    if (seen.has(c.name)) return refuse(`line ${head.n}: column "${c.name}" appears twice.`);
    seen.add(c.name);
  }
  const idx = (name: string) => cols.findIndex((c) => c.name === name);
  const xCols = cols.filter((c) => /^x\[.+\]$/.test(c.name));
  const yCols = cols.filter((c) => /^y\[.+\]$/.test(c.name));

  let kind: MeasKind;
  let allowed: string[];
  if (idx("Psat") >= 0) {
    kind = "psat"; allowed = ["T", "Psat"];
  } else if (idx("T_bubble") >= 0) {
    kind = "txy"; allowed = ["T_bubble", "P", ...xCols.map((c) => c.name), ...yCols.map((c) => c.name)];
  } else if (idx("P_bubble") >= 0) {
    kind = "pxy"; allowed = ["P_bubble", "T", ...xCols.map((c) => c.name), ...yCols.map((c) => c.name)];
  } else {
    return refuse("no measured column: the header must carry T_bubble (T-x-y), P_bubble (P-x-y) or Psat (pure vapour pressure).");
  }
  for (const c of cols)
    if (!allowed.includes(c.name))
      return refuse(`line ${head.n}: column "${c.name}" is not accepted for a ${kind} file (accepted: ${allowed.join(", ")}).`);

  if (kind === "psat") {
    if (subject.kind !== "component")
      return refuse("a Psat file belongs to a single component's record, not to a pair.");
    if (idx("T") < 0) return refuse(`line ${head.n}: a Psat file needs a T/K|C column.`);
  } else {
    if (subject.kind !== "pair") return refuse(`a ${kind} file belongs to a pair's record, not to a single component.`);
    if (xCols.length !== 1) return refuse(`line ${head.n}: exactly one x[<component>]/- column is required (found ${xCols.length}).`);
    if (kind === "txy" && idx("P") < 0) return refuse(`line ${head.n}: a T-x-y file needs a P/Pa|kPa|bar|MPa column (the held pressure).`);
    if (kind === "pxy" && idx("T") < 0) return refuse(`line ${head.n}: a P-x-y file needs a T/K|C column (the held temperature).`);
  }
  const xName = xCols[0] ? /^x\[(.+)\]$/.exec(xCols[0].name)![1]! : null;
  if (xName !== null && subject.kind === "pair" && !subject.components.includes(xName))
    return refuse(`line ${head.n}: x[${xName}] is not a component of this pair (${subject.components.join(" + ")}).`);
  if (yCols.length > 1) return refuse(`line ${head.n}: at most one y[<component>] column.`);
  if (yCols[0] && yCols[0].name !== `y[${xName}]`)
    return refuse(`line ${head.n}: ${yCols[0].name} must be the vapour fraction of the same component as ${xCols[0]?.name}.`);

  const tName = kind === "txy" ? "T_bubble" : "T";
  const pName = kind === "pxy" ? "P_bubble" : kind === "psat" ? "Psat" : "P";
  const tCol = cols[idx(tName)]!, pCol = cols[idx(pName)]!;
  const tc = T_UNITS[tCol.unit];
  if (!tc) return refuse(`line ${head.n}: unit "${tCol.unit}" of ${tCol.name} is not accepted (K or C).`);
  const pf = P_UNITS[pCol.unit];
  if (pf === undefined) return refuse(`line ${head.n}: unit "${pCol.unit}" of ${pCol.name} is not accepted (Pa, kPa, bar or MPa).`);
  for (const c of [...xCols, ...yCols])
    if (c.unit !== "-") return refuse(`line ${head.n}: unit of ${c.name} must be "-" (a mole fraction), found "${c.unit}".`);

  const body = lines.slice(1);
  if (body.length === 0) return refuse("the file has a header and no data rows.");
  const points: MeasPoint[] = [];
  for (const row of body) {
    const v = row.s.split(",").map((c) => c.trim());
    if (v.length !== cols.length)
      return refuse(`line ${row.n}: ${v.length} cell(s), the header has ${cols.length}.`);
    const nums: number[] = [];
    for (let k = 0; k < v.length; ++k) {
      const n = v[k] === "" ? NaN : Number(v[k]);
      if (!Number.isFinite(n)) return refuse(`line ${row.n}: "${v[k]}" (column ${cols[k]!.name}) is not a finite number.`);
      nums.push(n);
    }
    const T = tc(nums[idx(tName)]!);
    const P = nums[idx(pName)]! * pf;
    if (!(T > 0)) return refuse(`line ${row.n}: the absolute temperature is not positive.`);
    if (!(P > 0)) return refuse(`line ${row.n}: the pressure is not positive.`);
    let x: number | null = null, y: number | null = null;
    if (xCols[0]) {
      x = nums[idx(xCols[0].name)]!;
      if (x < 0 || x > 1) return refuse(`line ${row.n}: ${xCols[0].name} = ${x} is outside [0, 1].`);
    }
    if (yCols[0]) {
      y = nums[idx(yCols[0].name)]!;
      if (y < 0 || y > 1) return refuse(`line ${row.n}: ${yCols[0].name} = ${y} is outside [0, 1].`);
    }
    points.push({ x, y, T, P });
  }
  return { ok: true, data: { kind, xComponent: xName, points } };
}

// ---- the hash --------------------------------------------------------------

/** sha256 of the file's bytes, lower-case hex.  The platform's WebCrypto; no
 *  network, no library. */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!globalThis.crypto?.subtle)
    throw new Error("this browser offers no WebCrypto (a secure context is required), so the file's sha256 cannot be computed");
  const copy = new Uint8Array(view);
  const d = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type HashState = "match" | "mismatch" | "notClaimed" | "noDeclaredHash";
export interface HashVerdict { state: HashState; text: string }

/** `claimed`: the user said this file is the record's own dataset.  `declared`
 *  is that dataset's `provenance.sha256` ("" when it declares none). */
export function hashVerdict(fileSha: string, declared: string, claimed: boolean): HashVerdict {
  if (!claimed)
    return { state: "notClaimed", text: "Treated as your own data: no hash is compared (it is not claimed to be the record's dataset)." };
  if (!declared)
    return { state: "noDeclaredHash", text: "The record's dataset declares no sha256, so the claim cannot be checked." };
  return fileSha.toLowerCase() === declared.toLowerCase()
    ? { state: "match", text: `MATCH: the file's sha256 equals the record's declared ${declared.slice(0, 12)}... -- it is byte-identical to the source the dataset was extracted from.` }
    : { state: "mismatch", text: `MISMATCH: the file's sha256 ${fileSha.slice(0, 12)}... is not the record's declared ${declared.slice(0, 12)}... -- this is not the source file the record's dataset was extracted from (a CSV of your own never matches).` };
}

// ---- the outlier rule ------------------------------------------------------

export interface FitNote {
  /** held-out AAD of the record's dossier, per cent, or null */
  aadHeldOutPct: number | null;
  /** the band declared before the fit, per cent, or null */
  acceptanceMaxAADPct: number | null;
}

export interface OutlierRule { thresholdRelPct: number | null; text: string }

export function outlierRule(note: FitNote | null): OutlierRule {
  if (note && note.aadHeldOutPct !== null && note.aadHeldOutPct > 0)
    return { thresholdRelPct: 3 * note.aadHeldOutPct,
      text: `marked when |engine - measured| / measured exceeds 3 x the record's held-out AAD (${note.aadHeldOutPct.toPrecision(3)} %) = ${(3 * note.aadHeldOutPct).toPrecision(3)} %. The record declares no fit RMS.` };
  if (note && note.acceptanceMaxAADPct !== null && note.acceptanceMaxAADPct > 0)
    return { thresholdRelPct: 3 * note.acceptanceMaxAADPct,
      text: `the record has no held-out AAD; marked when the relative residual exceeds 3 x its acceptance band (${note.acceptanceMaxAADPct} %) = ${3 * note.acceptanceMaxAADPct} %.` };
  return { thresholdRelPct: null,
    text: "the record provides neither a held-out AAD nor an acceptance band, so no point is marked as an outlier." };
}

export function isOutlier(relResidualPct: number | null, rule: OutlierRule): boolean {
  return rule.thresholdRelPct !== null && relResidualPct !== null
    && Math.abs(relResidualPct) > rule.thresholdRelPct;
}

/** The Explorer Guide section (a real \label in docs/explorerGuide.tex). */
export const EXPLORER_GUIDE_USER_POINTS = "sec:explorer-own-points";
