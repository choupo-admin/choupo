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
  opPointTable -- AN OPERATION'S NUMBERS AS A SCIENTIST TABULATES THEM
  (DEV.md 4c C154).

  A `poreTransport` op publishes ~100 diagnostics with keys like
  `Robs_Cl_p1` and `c_wall_Mg_p3`; an external reviewer met them as a flat
  list of 97 keys before any figure and asked for the table a membrane
  scientist writes: one row per J_v point and ion -- J_v, c_bulk, c_wall,
  c_perm, R_obs, R_real, with units -- and the raw keys after it.

  THE SHAPE IS DECLARED BY THE OP TYPE, in its schema's `x-choupo.pointTable`
  (one home: the schema already says what the op publishes), never guessed
  from key names here: `perPoint` keys carry `{p}`, `perIon` keys `{ion}` and
  `{p}`.  The ions and points are READ from the keys the op published (the
  first `perIon` pattern names them), every number is a diagnostic as the
  engine wrote it, and every unit is the op's own (`units`, the
  diagnosticUnit the engine publishes beside each number).  A cell the op did
  not publish stays empty.  Nothing is computed.
\*---------------------------------------------------------------------------*/

import type { OperationResult } from "../adapters/SolverAdapter.js";

export interface PointTableDecl {
  title: string;
  definitions?: string;
  perPoint?: { key: string; label: string }[];
  perIon: { key: string; label: string }[];
}

export interface PointTable {
  title: string;
  definitions: string;
  /** how many of `columns` are per point (before the ion column) */
  nPerPoint: number;
  /** column heads, each with its unit ("" = none published) */
  columns: { label: string; unit: string }[];
  /** one row per (point, ion): the point number, the ion, then the cells */
  rows: { point: number; ion: string; cells: (number | null)[] }[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The table, or null when the op type declares none or published nothing
 *  that matches it. */
export function pointTable(decl: PointTableDecl | undefined, r: OperationResult | undefined): PointTable | null {
  if (!decl || !r || !Array.isArray(decl.perIon) || decl.perIon.length === 0) return null;
  const d = r.diagnostics;
  const first = decl.perIon[0]!.key;
  const re = new RegExp("^" + esc(first).replace("\\{ion\\}", "([A-Za-z0-9]+)").replace("\\{p\\}", "(\\d+)") + "$");
  const ionFirst = first.indexOf("{ion}") < first.indexOf("{p}");
  const ions: string[] = [];
  const points = new Set<number>();
  for (const k of Object.keys(d)) {
    const m = re.exec(k);
    if (!m) continue;
    const ion = ionFirst ? m[1]! : m[2]!;
    const p = Number(ionFirst ? m[2] : m[1]);
    if (!ions.includes(ion)) ions.push(ion);
    points.add(p);
  }
  if (ions.length === 0) return null;
  const key = (pat: string, p: number, ion = "") => pat.replace("{p}", String(p)).replace("{ion}", ion);
  const unitOf = (pat: string) => {
    for (const p of points) for (const ion of ions.length ? ions : [""]) {
      const u = r.units?.[key(pat, p, ion)];
      if (u !== undefined) return u;
    }
    return "";
  };
  const perPoint = decl.perPoint ?? [];
  const columns = [...perPoint, ...decl.perIon].map((c) => ({ label: c.label, unit: unitOf(c.key) }));
  const rows: PointTable["rows"] = [];
  for (const p of [...points].sort((a, b) => a - b))
    for (const ion of ions) {
      const cells = [
        ...perPoint.map((c) => d[key(c.key, p)] ?? null),
        ...decl.perIon.map((c) => d[key(c.key, p, ion)] ?? null),
      ].map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
      rows.push({ point: p, ion, cells });
    }
  return { title: decl.title, definitions: decl.definitions ?? "", nPerPoint: perPoint.length, columns, rows };
}
