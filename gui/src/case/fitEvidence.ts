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
  fitEvidence -- WHAT A FIT WAS GIVEN, WHAT IT WAS HELD TO, AND WHAT IT
  FOUND, as a reader reads them (DEV.md 4c C172 item 6).

  Everything here is already DECLARED or PUBLISHED, and none of it reached
  the screen beside the fit: which datasets the fit saw and which it was held
  out of (the op's `evidence ( { dataset ...; role fit|validation; } )` list
  -- `validation` is the engine's word for HELD OUT), the band declared
  BEFORE the fit (the curation block's `acceptanceMaxAADPct` and its origin),
  and the fitted parameters -- drawn as SYMBOLS WITH UNITS (r_p = 0.675 nm),
  not as the raw keys fit.0.value a reader cannot decode.

  The symbol comes from the record grammar the parameter's path points into
  (gui/schemas/records/: a membrane record's `poreModel.poreRadius` is titled
  "Pore radius r_p"), else from the path's own last segment (an NRTL pair's
  `a_ij`, with its pair as the qualifier); the UNIT is the one the engine
  publishes for `fit.<i>.value` (OperationResult.units) and nothing else --
  a parameter the engine gave no unit says so.  Pure (no React).
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import type { OperationResult } from "../adapters/SolverAdapter.js";
import membraneSchema from "../../schemas/records/membrane.schema.json";

const isDict = (v: unknown): v is JsonDict => !!v && typeof v === "object" && !Array.isArray(v);

export type EvidenceRole = "fit" | "heldOut";
export interface EvidenceRow { dataset: string; role: EvidenceRole }

/** The datasets a fit op declares, each with its role.  A legacy single
 *  `dataset` (or `residual.dataset`) is FIT: every point was fitted. */
export function fitEvidence(op: JsonDict | null | undefined): EvidenceRow[] {
  if (!op) return [];
  const ev = op["evidence"];
  if (Array.isArray(ev)) {
    const out: EvidenceRow[] = [];
    for (const e of ev) {
      if (!isDict(e) || typeof e["dataset"] !== "string") continue;
      out.push({ dataset: e["dataset"], role: e["role"] === "validation" ? "heldOut" : "fit" });
    }
    return out;
  }
  const res = op["residual"];
  const legacy = typeof op["dataset"] === "string" ? op["dataset"]
    : isDict(res) && typeof res["dataset"] === "string" ? res["dataset"] : null;
  return legacy ? [{ dataset: legacy, role: "fit" }] : [];
}

export const ROLE_WORD: Record<EvidenceRole, string> = { fit: "FIT", heldOut: "HELD OUT" };

export interface FittedParameter {
  index: number;
  path: string;
  /** the reader's symbol (r_p, X_d, a_ij) */
  symbol: string;
  /** what the symbol is (the record grammar's title), "" when unknown */
  title: string;
  /** what the path scopes the symbol to (an NRTL pair), "" none */
  qualifier: string;
  value: number;
  ci95: number | null;
  /** the unit the ENGINE published for fit.<i>.value; "" none */
  unit: string;
}

type SchemaNode = { title?: string; unit?: string; properties?: Record<string, SchemaNode> };

/** The record-grammar node a parameter path names, where one is known: a
 *  membrane fit's free parameters point into the membrane record. */
function recordNode(path: string, op: JsonDict): SchemaNode | null {
  const res = op["residual"];
  const kind = isDict(res) ? res["kind"] : undefined;
  if (kind !== "membrane") return null;
  let node: SchemaNode | undefined = membraneSchema as unknown as SchemaNode;
  for (const seg of path.split(".")) {
    node = node?.properties?.[seg];
    if (!node) return null;
  }
  return node ?? null;
}

/** The symbol in a grammar title: its last word when that word reads as a
 *  symbol ("Pore radius r_p" -> r_p), else the whole title. */
export function symbolOfTitle(title: string): string {
  const last = title.trim().split(/\s+/).pop() ?? "";
  return /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9]+$/.test(last) ? last : title.trim();
}

export function fittedParameters(op: JsonDict | null | undefined, r: OperationResult | undefined): FittedParameter[] {
  if (!op || !r) return [];
  const params = op["parameters"];
  if (!Array.isArray(params)) return [];
  const out: FittedParameter[] = [];
  params.forEach((p: JsonValue, i) => {
    if (!isDict(p) || typeof p["path"] !== "string") return;
    const value = r.diagnostics?.[`fit.${i}.value`];
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const ci = r.diagnostics?.[`fit.${i}.ci95`];
    const path = p["path"];
    const node = recordNode(path, op);
    const segs = path.split(".");
    const last = segs[segs.length - 1] ?? path;
    const title = node?.title ?? "";
    out.push({
      index: i, path,
      symbol: title ? symbolOfTitle(title) : last,
      title: title && symbolOfTitle(title) !== title ? title.replace(/\s+\S+$/, "") : "",
      //  a pair-parameter path is scoped by the pair it names (…binaryParameters.<i-j>.a_ij)
      qualifier: !node && segs.length >= 2 && /-/.test(segs[segs.length - 2] ?? "") ? segs[segs.length - 2]! : "",
      value, ci95: typeof ci === "number" && Number.isFinite(ci) ? ci : null,
      unit: r.units?.[`fit.${i}.value`] ?? "",
    });
  });
  return out;
}

/** A value in a READABLE multiple of its unit: a length in m below a
 *  millimetre reads in µm or nm (6.7476e-10 m -> 0.675 nm).  Only a prefix
 *  of the published unit is chosen; the unit itself is never changed. */
export function readable(value: number, unit: string, ci95: number | null = null): { value: string; ci: string; unit: string } {
  const sig = (v: number) => String(Number(v.toPrecision(4)));
  if (unit === "m" && value !== 0 && Math.abs(value) < 1e-3) {
    const [f, u] = Math.abs(value) < 1e-6 ? [1e9, "nm"] : [1e6, "µm"];
    return { value: sig(value * f), ci: ci95 === null ? "" : sig(ci95 * f), unit: u };
  }
  return { value: sig(value), ci: ci95 === null ? "" : sig(ci95), unit };
}
