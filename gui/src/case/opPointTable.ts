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

  TWO WIDENINGS (DEV.md 4c C165), both still reading only what was published:
  a `perIon` key may OMIT `{p}` -- a number the op publishes once per ion
  (the pore geometry's lambda, K_d, K_c, Phi_S), repeated on that ion's row
  at every point -- so the ions and points are read off every key that
  carries both slots; and a table with NO `perIon` is one row per point (the
  potentials and the numerics), its points read off its first `perPoint`
  key.  An op type may declare further tables after the first
  (`x-choupo.pointTables`).
\*---------------------------------------------------------------------------*/

import type { OperationResult } from "../adapters/SolverAdapter.js";

export interface PointTableDecl {
  title: string;
  definitions?: string;
  perPoint?: { key: string; label: string }[];
  /** absent or empty: one row per point (perPoint only) */
  perIon?: { key: string; label: string }[];
}

export interface PointTable {
  title: string;
  definitions: string;
  /** how many of `columns` are per point (before the ion column) */
  nPerPoint: number;
  /** false for a per-point table: no ion column */
  perIon: boolean;
  /** column heads, each with its unit ("" = none published) */
  columns: { label: string; unit: string }[];
  /** one row per (point, ion): the point number, the ion, then the cells */
  rows: { point: number; ion: string; cells: (number | null)[] }[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The table, or null when the op type declares none or published nothing
 *  that matches it. */
export function pointTable(decl: PointTableDecl | undefined, r: OperationResult | undefined): PointTable | null {
  if (!decl || !r) return null;
  const perIonDecl = Array.isArray(decl.perIon) ? decl.perIon : [];
  const perPointDecl = Array.isArray(decl.perPoint) ? decl.perPoint : [];
  const byIon = perIonDecl.length > 0;
  const d = r.diagnostics;
  //  The ions and points are read off EVERY declared key that carries the
  //  slots (in declaration order), so a column the op did not publish never
  //  hides the ones it did.
  const slotted = byIon
    ? perIonDecl.filter((c) => c.key.includes("{ion}") && c.key.includes("{p}")).map((c) => c.key)
    : perPointDecl.filter((c) => c.key.includes("{p}")).map((c) => c.key);
  if (slotted.length === 0) return null;
  const ions: string[] = [];
  const points = new Set<number>();
  for (const pk of slotted) {
    const ionFirst = pk.indexOf("{ion}") < pk.indexOf("{p}");
    const re = new RegExp("^" + esc(pk).replace("\\{ion\\}", "([A-Za-z0-9]+)").replace("\\{p\\}", "(\\d+)") + "$");
    for (const k of Object.keys(d)) {
      const m = re.exec(k);
      if (!m) continue;
      if (!byIon) { points.add(Number(m[1])); continue; }
      const ion = ionFirst ? m[1]! : m[2]!;
      const p = Number(ionFirst ? m[2] : m[1]);
      if (!ions.includes(ion)) ions.push(ion);
      points.add(p);
    }
  }
  if (points.size === 0 || (byIon && ions.length === 0)) return null;
  const key = (pat: string, p: number, ion = "") => pat.replace("{p}", String(p)).replace("{ion}", ion);
  const unitOf = (pat: string) => {
    for (const p of points) for (const ion of ions.length ? ions : [""]) {
      const u = r.units?.[key(pat, p, ion)];
      if (u !== undefined) return u;
    }
    return "";
  };
  const perPoint = perPointDecl;
  const columns = [...perPoint, ...perIonDecl].map((c) => ({ label: c.label, unit: unitOf(c.key) }));
  const rows: PointTable["rows"] = [];
  for (const p of [...points].sort((a, b) => a - b))
    for (const ion of byIon ? ions : [""]) {
      const cells = [
        ...perPoint.map((c) => d[key(c.key, p)] ?? null),
        ...perIonDecl.map((c) => d[key(c.key, p, ion)] ?? null),
      ].map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
      rows.push({ point: p, ion, cells });
    }
  return { title: decl.title, definitions: decl.definitions ?? "", nPerPoint: perPoint.length,
    perIon: byIon, columns, rows };
}
