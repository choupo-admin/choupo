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
  SortableTable -- ONE small way to sort a results table by clicking a column
  header (C304, Vitor 2026-11-11: "every table on the Pinch page must be
  sortable").  Built to be adopted by the other workspaces; used on the Pinch
  page only in this slice.

    const s = useSortable(rows, { unit: (r) => r.unit, Q: (r) => Math.abs(r.Q_kW) });
    <Table.Th> -> <SortTh s={s} k="Q">|Q| (kW)</SortTh>
    rows.map  -> s.rows.map

  Rules:
    - the first click sorts ascending, the next descending, and so on;
    - a column whose accessor returns numbers sorts NUMERICALLY (never "10" <
      "9"); strings compare with localeCompare, numeric-aware;
    - an empty / non-finite value sorts LAST in both directions;
    - the sort is stable, and with no column clicked the rows keep the order
      the engine wrote them in (a table that "ranks nothing" stays unranked
      until the reader asks);
    - the sorted column shows an arrow (▲ ascending, ▼ descending) and carries
      aria-sort; every sortable header carries data-sortable.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import { useMemo, useState, type ReactNode } from "react";
import { Table, UnstyledButton } from "@mantine/core";

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }
export type SortValue = string | number | null | undefined;
export type SortAccessors<T> = { [key: string]: (row: T) => SortValue };

const missing = (v: SortValue) =>
  v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));

/** Pure: the rows sorted by one accessor (stable; missing values last). */
export function sortRows<T>(rows: readonly T[], get: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const ma = missing(a.v), mb = missing(b.v);
      if (ma || mb) return ma === mb ? a.i - b.i : ma ? 1 : -1;
      let c: number;
      if (typeof a.v === "number" && typeof b.v === "number") c = a.v - b.v;
      else c = String(a.v).localeCompare(String(b.v), undefined, { numeric: true });
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.row);
}

/** Pure: the state after a click on column `key`. */
export function nextSort(cur: SortState | null, key: string): SortState {
  if (!cur || cur.key !== key) return { key, dir: "asc" };
  return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
}

export interface Sortable<T> {
  rows: T[];
  sort: SortState | null;
  toggle: (key: string) => void;
}

export function useSortable<T>(
  rows: readonly T[], accessors: SortAccessors<T>, initial: SortState | null = null,
): Sortable<T> {
  const [sort, setSort] = useState<SortState | null>(initial);
  const sorted = useMemo(() => {
    const get = sort ? accessors[sort.key] : undefined;
    return get ? sortRows(rows, get, sort!.dir) : [...rows];
    // the accessor map is rebuilt each render by its callers; the column key
    // and the rows are the change signals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort?.key, sort?.dir]);
  return { rows: sorted, sort, toggle: (key) => setSort((s) => nextSort(s, key)) };
}

/** A clickable header cell for column `k` of the sortable `s`. */
export function SortTh<T>({ s, k, children }: {
  s: Sortable<T>; k: string; children: ReactNode;
}): JSX.Element {
  const on = s.sort?.key === k;
  const arrow = on ? (s.sort!.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <Table.Th data-sortable={k}
      aria-sort={on ? (s.sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <UnstyledButton onClick={() => s.toggle(k)} fz="inherit" fw="inherit"
        title="sort by this column (click again to reverse)"
        style={{ whiteSpace: "normal", textAlign: "left" }}>
        {children}
        <span aria-hidden="true" style={{ opacity: on ? 1 : 0.35 }}>{on ? arrow : " ↕"}</span>
      </UnstyledButton>
    </Table.Th>
  );
}
