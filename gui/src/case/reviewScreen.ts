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
  reviewScreen -- WHAT A PROPS RUN DID, ONE LINE PER OPERATION (DEV.md 4c C149).

  The props review screen reads top to bottom: a VERDICT STRIP (one row per
  operation: what it did, its verdict where it claims one, how many points it
  ran on, its agreement with data and its held-out agreement), the FIGURES,
  the PARAMETERS and tables, and an AUDIT collapsed below them.  This module
  is the strip's arithmetic -- and there is none: every cell is a word or a
  number the engine published (the op's `curation` verdict, its diagnostics,
  the run's `validation` AAD), and a cell the run did not publish is EMPTY,
  never guessed.  What an operation DID is its schema's own description
  (`operationDescription`), never a second sentence kept here.

  TWO QUESTIONS, TWO COLUMNS (DEV.md 4c C154).  An external reviewer read
  `no claim` beside two empty AAD cells after a clean run and took them for
  missing results: the RUN status (did the op run to its end?) and the
  status of the EVIDENCE (what does its answer claim?) had been one column.
  They are apart now.  `runState` is the run's word (done / failed / no
  result / not run, the op's own rc where it returned one); the evidence is
  the op's curation verdict where it publishes one, else "no acceptance test
  in this run" -- never `validated` because it converged.  An AAD column an op
  CANNOT fill (it fits nothing, it is compared with no dataset) is "not
  applicable", decided by the op type's declared activity (its schema), so
  an empty cell keeps meaning "applicable and not published".  The purpose
  is the declared study's (case/propsStudies.ts).
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";
import type { OperationResult, ValidationBlock } from "../adapters/SolverAdapter.js";
import { operationDescription, operationMapMeta } from "./operationSchemas.js";
import { activityOf, viewsOf, type PropsMap } from "./propsMap.js";
import { declaredStudies, studyOfOp } from "./propsStudies.js";

/** The run's own word for one operation. */
export type RunState = "done" | "failed" | "noResult" | "notRun";

export const RUN_STATE_WORD: Record<RunState, string> = {
  done: "done", failed: "failed", noResult: "no result", notRun: "not run",
};

/** The activities whose answer is compared with a dataset (an AAD can be
 *  published) and those that hold evidence out of a fit (a held-out AAD can
 *  be published).  Every other activity makes neither number applicable. */
const AAD_ACTIVITIES = new Set(["fit", "estimate", "compare"]);
const HELD_OUT_ACTIVITIES = new Set(["fit", "estimate"]);

export interface VerdictRow {
  name: string;
  type: string;
  /** the first sentence of the op type's schema description; "" none */
  did: string;
  /** the op's curation verdict word (validated, notValidated, ...); "" none */
  verdict: string;
  /** how many points it ran on, and what the engine calls them; null none */
  points: { value: number; key: string } | null;
  /** the run's own comparison with data for this op (% AAD); null none */
  aadPct: number | null;
  /** the op's held-out AAD (%), from evidence the fit never saw; null none */
  heldOutAadPct: number | null;
  /** the op's held-out statistic IN ITS OWN UNIT (heldOutStatistic below):
   *  a relative % for a bubble-point fit, rejection points for a membrane
   *  fit; null none */
  heldOut: HeldOutStatistic | null;
  /** the fit's IDENTIFIABILITY (its `identifiable` diagnostic): are its
   *  parameters separately determined by the data?  A different question
   *  from the curation verdict, drawn BESIDE it; null = the op publishes no
   *  such diagnostic */
  identifiable: boolean | null;
  /** false when the op is declared but the run published nothing for it */
  ran: boolean;
  /** the RUN status, apart from the evidence (DEV.md 4c C154) */
  runState: RunState;
  /** the op's own non-zero return code, where it published one */
  rc: number | null;
  /** the declared study's purpose word ("" = in no declared study) */
  purpose: string;
  /** the declared study's name ("" = none) */
  study: string;
  /** can this op type publish the AAD / the held-out AAD at all? */
  aadApplicable: boolean;
  heldOutApplicable: boolean;
}

/** The point count keys, in the order an op is asked for one: the first it
 *  publishes is its count. */
export const POINT_KEYS = ["n_data", "n_points", "n_rows", "n_y", "n_solved"] as const;

/** The first sentence of a description: up to the first full stop OUTSIDE
 *  parentheses that ends a word of three or more characters before a
 *  capital, or such a colon after the first forty characters, whichever
 *  comes first -- so a citation's "(J. Membr. Sci. 300 (2007) 20)" never ends
 *  it; at most 180 characters, cut at a word. */
export function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  let end = t.length;
  let depth = 0;
  for (let i = 0; i < t.length; ++i) {
    const c = t[i];
    if (c === "(") ++depth;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === "." && t[i + 1] === " " && /[A-Z`(]/.test(t[i + 2] ?? "")
             && /[A-Za-z0-9)\]]{3}$/.test(t.slice(Math.max(0, i - 3), i))) { end = i; break; }
    else if (depth === 0 && c === ":" && t[i + 1] === " " && i >= 40) { end = i; break; }
  }
  let s = t.slice(0, end).replace(/[.:]$/, "");
  if (s.length > 180) s = s.slice(0, s.lastIndexOf(" ", 177)) + "...";
  return s;
}

function aadFor(op: string, validation: ValidationBlock[] | undefined): number | null {
  for (const b of validation ?? [])
    for (const a of b.aad)
      if (a.model === op && typeof a.aadRelPct === "number" && Number.isFinite(a.aadRelPct))
        return a.aadRelPct;
  return null;
}

/** One row per DECLARED operation, in the propsDict's order.  `runStatus` is
 *  the whole run's ("done" / "error"; undefined = not run), `propsDict` the
 *  case's (its declared studies give each row its purpose). */
export function verdictRows(ops: JsonDict[], results: OperationResult[],
                            validation?: ValidationBlock[],
                            runStatus?: string, propsDict?: JsonDict | null): VerdictRow[] {
  const out: VerdictRow[] = [];
  const studyOf = studyOfOp(declaredStudies(propsDict));
  for (const op of ops) {
    if (!op || typeof op !== "object" || Array.isArray(op)) continue;
    const name = typeof op["name"] === "string" ? op["name"] : "";
    const type = typeof op["type"] === "string" ? op["type"] : "";
    if (!name) continue;
    const r = results.find((x) => x.name === name);
    const d = r?.diagnostics ?? {};
    const key = POINT_KEYS.find((k) => typeof d[k] === "number" && Number.isFinite(d[k]));
    const held = d["aad_heldout_pct"];
    const ident = d["identifiable"];
    const rc = typeof r?.rc === "number" && r.rc !== 0 ? r.rc : null;
    const runState: RunState = runStatus === undefined ? "notRun"
      : r === undefined ? (runStatus === "done" ? "noResult" : "failed")
      : rc !== null ? "failed" : "done";
    const meta = operationMapMeta(type);
    const activity = meta ? activityOf(meta, op) : "";
    const st = studyOf.get(name);
    out.push({
      name, type,
      did: firstSentence(operationDescription(type)),
      verdict: r?.curation?.["verdict"] ?? "",
      points: key ? { value: d[key]!, key } : null,
      aadPct: aadFor(name, validation),
      heldOutAadPct: typeof held === "number" && Number.isFinite(held) ? held : null,
      heldOut: r ? heldOutStatistic(r) : null,
      identifiable: typeof ident === "number" && Number.isFinite(ident) ? ident > 0.5 : null,
      ran: r !== undefined,
      runState, rc,
      purpose: st?.purpose ?? "",
      study: st?.name ?? "",
      //  an op type with no declared activity keeps the cells (an absence
      //  of a declaration is not evidence that a number cannot exist)
      aadApplicable: !meta || AAD_ACTIVITIES.has(activity),
      heldOutApplicable: !meta || HELD_OUT_ACTIVITIES.has(activity),
    });
  }
  return out;
}

/** The op types that CREATE or ESTIMATE a component record: a case built on
 *  one is about the component, so its thermo readiness is shown on the review
 *  screen itself rather than in the audit. */
export const COMPONENT_CREATING = ["estimateComponent", "vaporPressureFit", "heatCapacityFit"] as const;

export function readinessProminent(ops: JsonDict[]): boolean {
  return ops.some((o) => o && typeof o === "object" && !Array.isArray(o)
    && (COMPONENT_CREATING as readonly string[]).includes(String(o["type"])));
}

/** RESULTS FIRST (DEV.md 4c C168): the operations whose answer is ONLY their
 *  numbers -- they feed no figure and their type declares no point table --
 *  so without this their answer sat one click away, behind "No table
 *  published" (pcsaft01: the whole case).  Nothing is chosen here: an op is
 *  in the list by what the engine published for it and what the map draws. */
export function numbersOnlyOps(map: PropsMap, results: readonly OperationResult[]): OperationResult[] {
  return results.filter((r) => Object.keys(r.diagnostics ?? {}).length > 0
    && !operationMapMeta(r.type)?.pointTable
    && viewsOf(map, [`op:${r.name}`]).length === 0);
}

/** A diagnostic's unit as the engine publishes it (`units`, the op's
 *  diagnosticUnit): "-" is a pure number and reads "[-]"; NO published unit
 *  is said as such, never left blank to read like a dimensionless value
 *  (DEV.md 4c C168).  Nothing here infers a unit from a key. */
export function unitCell(r: OperationResult, key: string): { text: string; published: boolean } {
  const u = r.units?.[key];
  if (u === undefined || u === "") return { text: "unit not published", published: false };
  return { text: u === "-" ? "[-]" : u, published: true };
}

/** THE HELD-OUT STATISTIC, read in ONE place (DEV.md 4c C172 item 6).
 *
 *  The fits publish it under two keys, and they are NOT two spellings of one
 *  number: a bubble-point, vapour-pressure or heat-capacity fit publishes
 *  `aad_heldout_pct`, a RELATIVE deviation in per cent; the membrane fit
 *  publishes `heldOut_AAD_pct`, the mean |R_model - R_measured| x 100 over
 *  the rejection points -- an ABSOLUTE deviation in rejection POINTS (its
 *  own `units` says so, and its curation block's `heldOutStatistic` spells
 *  it out).  Renaming one to the other in the engine would make a membrane
 *  run claim a relative per cent it did not compute, and would move the
 *  pinned rows of membrane24's golden; so the engine keeps both and this is
 *  the one reader, each value drawn with the unit the engine publishes for
 *  it.  Absent a published unit the cell says so rather than guessing. */
export interface HeldOutStatistic { key: string; value: number; unit: string; published: boolean }

export const HELD_OUT_KEYS = ["aad_heldout_pct", "heldOut_AAD_pct"] as const;

export function heldOutStatistic(r: OperationResult): HeldOutStatistic | null {
  for (const key of HELD_OUT_KEYS) {
    const v = r.diagnostics?.[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const u = unitCell(r, key);
    return { key, value: v, unit: u.text, published: u.published };
  }
  return null;
}

/** The in-sample statistic beside it, by the same rule (the membrane fit
 *  publishes `inSample_AAD_pct`; the bubble-point fit its `rms`). */
export function inSampleStatistic(r: OperationResult): HeldOutStatistic | null {
  const key = "inSample_AAD_pct";
  const v = r.diagnostics?.[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const u = unitCell(r, key);
  return { key, value: v, unit: u.text, published: u.published };
}
