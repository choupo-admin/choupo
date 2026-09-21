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

/** Drop one named column from a CSV (header + every row).  Pure column
 *  surgery on the engine's CSV -- zero physics.  Used by the Explorer (the
 *  scaling scan's ionic-strength column reads out as text, not on the SI
 *  axis) and by the Methods workspace (the T-x-y `liquid_stable` probe column
 *  is not part of the McCabe-Thiele construction).  Moved here from
 *  ExploreWorkspace 2026-08-15 so both hosts share the ONE copy. */
export function dropCsvColumn(csv: string, name: string): string {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return csv;
  const i = lines[0]!.split(",").map((s) => s.trim()).indexOf(name);
  if (i < 0) return csv;
  return lines.map((l) => {
    const cells = l.split(",");
    cells.splice(i, 1);
    return cells.join(",");
  }).join("\n");
}

/** True when any PLOTTED column (the header minus the x column) is a
 *  saturation index `SI_<mineral>` (optionally `__<model>`-suffixed by
 *  methodCompare).  Triggers the SI = 0 saturation reference line on
 *  case-path scan plots -- the Explorer's scaling kind passes the same
 *  line explicitly. */
export function hasSiColumns(header: string[]): boolean {
  return header.slice(1).some((h) => /^SI_/.test(h.split("__")[0]!));
}

/*---------------------------------------------------------------------------*\
  WHICH PART OF A COLUMN NAME MAY DECLARE ITS DIMENSION.

  The axis labeller walked EVERY "_"-separated token of a column name and took
  the first with a known unit.  A column name is `<quantity>_<subject>`, so the
  deep tokens are subjects -- a component, a mineral, a phase -- or the unit the
  author already spelled into the name; and the single-letter quantity keys
  (`h`, `s`, `v`, `d`, `k`, `p`, `g`) collide with all three.  Measured over the
  872 distinct column names the corpus's own CSVs carry, 67 were given a unit
  that is WRONG: `n_Ca_kmol_per_h` read as J/mol, `rig.U_V` (volts) as m3/mol,
  `SI_labile_S` -- a dimensionless saturation index -- as J/(mol K), which also
  tore it out of the SI panel onto an entropy axis of its own.

  THE RULE, one sentence: the dimension is read from the HEAD of the name --
  the first token always, the second only when it is a full word.  Anything
  deeper names the subject, and a one-letter token that does not lead the name
  is not a quantity.

  Measured consequence of the rule over those same 872 names: 68 change, 67 of
  them from a wrong unit to NO unit -- which is the labeller's own stated
  preference ("better to show no unit than the wrong one").  The one that loses
  a CORRECT unit is `process_T_K`, whose name already ends in the unit it lost.

  WHAT THE RULE DOES NOT CATCH, measured rather than predicted -- and it is not
  what the first draft of this paragraph said.  After the head rule NO corpus
  column resolves a wrong unit at index 1 at all; every wrong unit that
  survives sits at index ZERO, where a one-letter quantity key collides with a
  DIFFERENT quantity spelled with the same letter: `D_rectifying` (a column
  DIAMETER, in m) reads as m2/s, `H_kW` (an enthalpy FLOW) as J/mol, `V_R` (a
  reactor VOLUME) as m3/mol, `X_moisture` (kg/kg dry) as a mole fraction.  No
  rule about POSITION can see those.  What can is a column that DECLARES its
  own dimension -- the engine's own rule (2026-09-04, `EquipmentSizing::set`),
  one plane down and not this slice's to build.  A name is not a dimension
  declaration; reading one off a name is a heuristic and stays labelled one.
\*---------------------------------------------------------------------------*/

/** Heuristic unit per column-name token.  The keys are LOWERCASE tokens. */
export const COL_UNITS: Record<string, string> = {
  t:            "K",
  temperature:  "K",
  p:            "Pa",
  pressure:     "Pa",
  psat:         "Pa",
  z:            "—",
  mu:           "Pa·s",
  visc:         "Pa·s",
  viscosity:    "Pa·s",
  cond:         "W/(m·K)",
  conductivity: "W/(m·K)",
  k:            "W/(m·K)",
  diff:         "m²/s",
  diffusivity:  "m²/s",
  d:            "m²/s",
  cp:           "J/(mol·K)",
  cv:           "J/(mol·K)",
  h:            "J/mol",
  enthalpy:     "J/mol",
  s:            "J/(mol·K)",
  entropy:      "J/(mol·K)",
  g:            "J/mol",
  gibbs:        "J/mol",
  gamma:        "—",
  molality:     "mol/kg",
  rho:          "kg/m³",
  density:      "kg/m³",
  v:            "m³/mol",
  volume:       "m³/mol",
  x:            "mol frac",
  y:            "mol frac",
  // Steam tables (IF97) are MASS-basis SI: the Explorer renames the op's
  // h_f/h/... columns to these collision-free tokens (h alone would label the
  // MOLAR J/mol above) so the axis states the true basis.
  hf:           "J/kg",
  hg:           "J/kg",
  hfg:          "J/kg",
  sf:           "J/(kg·K)",
  sg:           "J/(kg·K)",
  vf:           "m³/kg",
  vg:           "m³/kg",
  hmass:        "J/kg",
  smass:        "J/(kg·K)",
  vmass:        "m³/kg",
  cpmass:       "J/(kg·K)",
};

/** The unit a column name DECLARES, read off the head of an already-split
 *  token list (the callers split on different separators -- see the note in
 *  CsvAutoPlot.axisDisplay -- so the SPLIT stays at the call site and only the
 *  RULE lives here).  "" when the name declares none. */
export function unitFromTokens(tokens: string[]): string {
  const t = tokens.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  if (t.length === 0) return "";
  const head = COL_UNITS[t[0]!];
  if (head) return head;
  //  The second token may name the quantity (`thermal_conductivity_liquid`),
  //  but only as a WHOLE WORD: a lone letter there is a subject or a unit
  //  suffix (`rig.U_V`, `n_H`, `Tf_K`), never the quantity.
  if (t.length > 1 && t[1]!.length > 1) {
    const second = COL_UNITS[t[1]!];
    if (second) return second;
  }
  return "";
}
