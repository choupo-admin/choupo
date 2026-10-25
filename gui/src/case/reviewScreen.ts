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
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";
import type { OperationResult, ValidationBlock } from "../adapters/SolverAdapter.js";
import { operationDescription } from "./operationSchemas.js";

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
  /** false when the op is declared but the run published nothing for it */
  ran: boolean;
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

/** One row per DECLARED operation, in the propsDict's order. */
export function verdictRows(ops: JsonDict[], results: OperationResult[],
                            validation?: ValidationBlock[]): VerdictRow[] {
  const out: VerdictRow[] = [];
  for (const op of ops) {
    if (!op || typeof op !== "object" || Array.isArray(op)) continue;
    const name = typeof op["name"] === "string" ? op["name"] : "";
    const type = typeof op["type"] === "string" ? op["type"] : "";
    if (!name) continue;
    const r = results.find((x) => x.name === name);
    const d = r?.diagnostics ?? {};
    const key = POINT_KEYS.find((k) => typeof d[k] === "number" && Number.isFinite(d[k]));
    const held = d["aad_heldout_pct"];
    out.push({
      name, type,
      did: firstSentence(operationDescription(type)),
      verdict: r?.curation?.["verdict"] ?? "",
      points: key ? { value: d[key]!, key } : null,
      aadPct: aadFor(name, validation),
      heldOutAadPct: typeof held === "number" && Number.isFinite(held) ? held : null,
      ran: r !== undefined,
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
