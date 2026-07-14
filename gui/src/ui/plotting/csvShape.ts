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
  csvShape -- pure CSV-shape helpers shared by CsvAutoPlot

  Kept free of React / Plotly imports so the detection logic is unit-testable
  in the node-environment vitest suite (plotly.js references `self` at module
  load and cannot be imported there).
\*---------------------------------------------------------------------------*/

/** A CSV whose first column is CATEGORICAL (e.g. the speciate ops' species
 *  tables: `species,molality,activity,gamma`).  Every numeric-x renderer
 *  drew EMPTY axes for these -- they get a bar-chart fallback instead. */
export interface CategoricalCsv {
  /** First-column header (e.g. "species"). */
  xName: string;
  /** First-column strings, one per data row (the category tick labels). */
  labels: string[];
  /** Remaining columns that carry at least one finite number. */
  valueCols: { name: string; values: number[] }[];
}

/** Detect a categorical-x CSV: >= 2 columns, EVERY first-column cell a
 *  non-empty NON-number (a single numeric cell means a numeric scan with a
 *  malformed row -- that keeps the line-plot path), and at least one other
 *  column with a finite value to plot.  Returns the parsed table or null. */
export function detectCategoricalCsv(csv: string): CategoricalCsv | null {
  const lines = csv.trim().split(/\r?\n/)
    .filter((l) => l.length > 0 && !l.trimStart().startsWith("#"));
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  if (header.length < 2) return null;

  const labels: string[] = [];
  const cols: number[][] = header.slice(1).map(() => []);
  for (let i = 1; i < lines.length; ++i) {
    const cells = lines[i]!.split(",").map((s) => s.trim());
    if (cells.length !== header.length) continue;
    const first = cells[0]!;
    if (first.length === 0 || Number.isFinite(parseFloat(first))) return null;
    labels.push(first);
    for (let j = 1; j < header.length; ++j) {
      const v = parseFloat(cells[j]!);
      cols[j - 1]!.push(Number.isFinite(v) ? v : NaN);
    }
  }
  if (labels.length === 0) return null;

  const valueCols = header.slice(1)
    .map((name, j) => ({ name, values: cols[j]! }))
    .filter((c) => c.values.some(Number.isFinite));
  if (valueCols.length === 0) return null;

  return { xName: header[0]!, labels, valueCols };
}

/** True when any PLOTTED column (the header minus the x column) is a
 *  saturation index `SI_<mineral>` (optionally `__<model>`-suffixed by
 *  methodCompare).  Triggers the SI = 0 saturation reference line on
 *  case-path scan plots -- the Explorer's scaling kind passes the same
 *  line explicitly. */
export function hasSiColumns(header: string[]): boolean {
  return header.slice(1).some((h) => /^SI_/.test(h.split("__")[0]!));
}
