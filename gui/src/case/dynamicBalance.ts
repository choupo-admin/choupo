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
-------------------------------------------------------------------------------
  dynamicBalance -- the PURE parser of the engine's dynamic balance ledger
  artefacts (balanceTrajectory.csv, wide format, + the .meta sidecar).  NO
  physics: the residuals and availabilities are the engine's own; a
  withheld claim stays withheld in the model, never a fabricated zero.
\*---------------------------------------------------------------------------*/

export interface DynamicBalanceView {
  present: boolean;
  materialAvailable: boolean;
  materialReason?: string;
  /** Set when the trajectory itself is unusable (a malformed numeric row):
   *  the material claim is withdrawn with this reason -- never a silent
   *  skip that keeps an AVAILABLE badge over traced NaNs. */
  malformedReason?: string;
  elementsAvailable: boolean;
  elementsReason?: string;
  energyAvailable: boolean;
  energyReason?: string;
  /** Time series, engine-owned.  Columns beyond mass are per-element. */
  t: number[];
  massInventoryKg: number[];
  massResidualKg: number[];
  /** element symbol -> residual series [kmol-atom] */
  elementResiduals: { [symbol: string]: number[] };
}

export function dynamicBalanceView(
  trajectoryCsv: string | undefined,
  metaCsv: string | undefined,
): DynamicBalanceView {
  const view: DynamicBalanceView = {
    present: false,
    materialAvailable: false,
    elementsAvailable: false,
    energyAvailable: false,
    t: [], massInventoryKg: [], massResidualKg: [],
    elementResiduals: {},
  };

  if (metaCsv) {
    for (const line of metaCsv.split("\n")) {
      const comma = line.indexOf(",");
      if (comma < 0) continue;
      const key = line.slice(0, comma).trim();
      const val = line.slice(comma + 1).trim().replace(/^"|"$/g, "");
      if (key === "material_available") view.materialAvailable = val === "1";
      else if (key === "material_reason") view.materialReason = val;
      else if (key === "elements_available") view.elementsAvailable = val === "1";
      else if (key === "elements_reason") view.elementsReason = val;
      else if (key === "energy_available") view.energyAvailable = val === "1";
      else if (key === "energy_reason") view.energyReason = val;
    }
  }

  if (!trajectoryCsv) return view;
  const lines = trajectoryCsv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 1) return view;
  const header = lines[0]!.split(",");
  const col = (name: string) => header.indexOf(name);
  const it = col("t");
  const iInv = col("mass_inventory_kg");
  const iRes = col("mass_residual_kg");
  if (it < 0 || iInv < 0 || iRes < 0) {
    // A trajectory without the three mandatory columns is MALFORMED, with a
    // reason -- never a silent not-present that keeps availability claims.
    view.materialAvailable = false;
    view.malformedReason = "malformed trajectory (missing mandatory columns)";
    return view;
  }

  // The metadata is SOVEREIGN: when the engine withheld the elemental
  // claim, elem_* columns in a contradictory CSV are never drawn.
  const elemCols: { symbol: string; idx: number }[] = [];
  if (view.elementsAvailable) {
    header.forEach((h, i) => {
      const m = /^elem_([A-Za-z]+)_residual_kmolatom$/.exec(h);
      if (m) elemCols.push({ symbol: m[1]!, idx: i });
    });
    for (const { symbol } of elemCols) view.elementResiduals[symbol] = [];
  }

  for (let li = 1; li < lines.length; ++li) {
    const cells = lines[li]!.split(",");
    const tv = Number(cells[it]);
    const inv = Number(cells[iInv]);
    const res = Number(cells[iRes]);
    if (!Number.isFinite(tv) || !Number.isFinite(inv)
        || !Number.isFinite(res)) {
      // A malformed numeric row WITHDRAWS the claim -- never a silent skip.
      view.materialAvailable = false;
      view.malformedReason = `malformed trajectory (row ${li + 1})`;
      view.t = []; view.massInventoryKg = []; view.massResidualKg = [];
      view.elementResiduals = {};
      view.present = false;
      return view;
    }
    view.t.push(tv);
    view.massInventoryKg.push(inv);
    view.massResidualKg.push(res);
    for (const { symbol, idx } of elemCols) {
      const v = Number(cells[idx]);
      if (!Number.isFinite(v)) {
        // Three-level isolation (the same contract as the engine): a
        // malformed ELEMENT cell withdraws ONLY the elemental claim --
        // the valid mass series stays drawn.  No partial element claim:
        // every element series is cleared.
        view.elementsAvailable = false;
        view.elementsReason = `malformed trajectory (row ${li + 1},`
          + ` element ${symbol})`;
        view.elementResiduals = {};
        elemCols.length = 0;
        break;
      }
      view.elementResiduals[symbol]!.push(v);
    }
  }
  view.present = view.t.length > 0;
  return view;
}
