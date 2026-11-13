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
  Parallel ternary scan — fan the embarrassingly-parallel simplex over several
  WASM workers and merge the shard CSVs.

  Each WasmAdapter.run() spawns its OWN web worker + WASM instance, so N
  concurrent run() calls give true N-way parallelism (no WASM threads / no
  cross-origin-isolation headers needed).  The engine op takes `shard { k; n }`
  (node i runs iff i % n === k); here we just decide N, build the shard specs,
  and stitch the partial CSVs back together.

  NO physics here — pure orchestration + a text merge of engine output.
\*---------------------------------------------------------------------------*/

/** How many parallel workers to use: cores − 2 (leave headroom for the system /
 *  UI), clamped to [1, cap] and never more than the grid has rows. */
export function workerCount(grid: number, cap = 12): number {
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(cores - 2, cap, Math.max(1, grid)));
}

/** Merge shard CSVs from propertyScanTernary into one.  Works for both the
 *  scalar surface (x1,x2,x3,T_bubble) and the phase map (…,kind,tieline_id,…):
 *  the header is taken once and all data rows concatenated; tie-line ids are
 *  offset per shard so pairs stay together and never collide across shards. */
export function mergeTernaryCsvs(csvs: string[]): string {
  const nonEmpty = csvs.filter((c) => c && c.trim().length > 0);
  if (nonEmpty.length === 0) return "";
  const header = nonEmpty[0]!.trim().split(/\r?\n/)[0]!;
  const cols = header.split(",");
  const tieIdx = cols.indexOf("tieline_id");
  const kindIdx = cols.indexOf("kind");

  const out: string[] = [header];
  nonEmpty.forEach((csv, shard) => {
    const lines = csv.trim().split(/\r?\n/);
    for (let r = 1; r < lines.length; ++r) {
      let line = lines[r]!;
      if (tieIdx >= 0 && kindIdx >= 0) {
        const c = line.split(",");
        if (c[kindIdx] === "tie") {
          const id = Number(c[tieIdx]);
          if (Number.isFinite(id) && id >= 0) {
            c[tieIdx] = String(shard * 1_000_000 + id);
            line = c.join(",");
          }
        }
      }
      out.push(line);
    }
  });
  return out.join("\n") + "\n";
}
