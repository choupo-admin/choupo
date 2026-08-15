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

// merkelTool -- the detector, the Chebyshev-4 deviation helper, and the
// display-axis scaling.  Pure functions only; nothing here touches the DOM
// and the module imports no plotly seam (inline SVG).
import { describe, expect, it } from "vitest";

import type { UnitProfile } from "../src/adapters/SolverAdapter.js";
import {
  chebyshevDeviation,
  findMerkelUnits,
  kelvinToC,
  NEARLY_EXACT_TOL,
  OPERATING_COLUMN,
  SATURATION_COLUMN,
  type KpiMap,
} from "../src/ui/methods/MerkelTool.js";

// ---- Fixtures ---------------------------------------------------------------

// SHAPE fixture, NOT engine numbers: a 5-point subset standing in for the
// witness's 41-point profile (tutorials/steady/heat/coolingTower01_merkel).
// The shape is faithful -- T spans [T_water_out, T_water_in], both enthalpy
// columns rise monotonically, saturation sits above operating -- but the
// values are round plausible stand-ins.  The REAL engine numbers live in
// TOWER_KPIS below, which IS verbatim.
const TOWER_PROFILE: UnitProfile = {
  unit: "tower01",
  xAxis: "T_K",
  columns: {
    T_K: [300.78, 305.12, 309.46, 313.81, 318.15],
    [OPERATING_COLUMN]: [59.3, 77.3, 95.3, 113.3, 131.3],
    [SATURATION_COLUMN]: [91.9, 115.5, 144.3, 179.8, 223.6],
  },
  markers: [
    { x: 300.78, label: "water out (approach 7.756 K)" },
    { x: 318.15, label: "water in" },
  ],
};

// The witness case's KPI row, VERBATIM from the engine's result JSON
// (tutorials/steady/heat/coolingTower01_merkel, unit "tower01").
const TOWER_KPIS: KpiMap = {
  tower01: {
    T_water_out: 300.778649138,
    T_air_out: 307.613817692,
    T_wb_in: 293.021697982,
    range_K: 17.3713508623,
    approach_K: 7.75695115581,
    merkelNumber: 1.5,
    merkelNumber_chebyshev4: 1.50006493043,
    L_over_G: 0.98937581178,
    Y_in: 0.0128618855531,
    Y_out: 0.0366432593178,
    evaporation_kg_s: 0.0120283876424,
    makeup_kg_s: 0.0120283876424,
    evaporation_pct_of_L: 2.40367446642,
    Q_kW: 36.4315830585,
  },
};

// A NON-tower profile (the exchanger's area sweep shape): must never activate.
const EXCHANGER_PROFILE: UnitProfile = {
  unit: "hx1",
  xAxis: "position",
  columns: {
    position: [0, 0.25, 0.5, 0.75, 1],
    T_hot: [360, 355, 350, 345, 340],
    T_cold: [300, 305, 310, 315, 320],
  },
};

// A profile carrying only ONE of the two enthalpy columns: not a tower.
const HALF_PROFILE: UnitProfile = {
  unit: "half",
  xAxis: "T_K",
  columns: {
    T_K: [300, 310, 320],
    [OPERATING_COLUMN]: [60, 90, 120],
  },
};

// ---- The detector -----------------------------------------------------------

describe("findMerkelUnits -- activation by the column pair, never by name", () => {
  it("finds the tower and attaches its KPI row", () => {
    const units = findMerkelUnits(
      [EXCHANGER_PROFILE, TOWER_PROFILE, HALF_PROFILE], TOWER_KPIS);
    expect(units).toHaveLength(1);
    expect(units[0]!.unit).toBe("tower01");
    expect(units[0]!.profile).toBe(TOWER_PROFILE);
    expect(units[0]!.kpis).toBe(TOWER_KPIS["tower01"]);
  });

  it("ignores units without BOTH enthalpy columns", () => {
    expect(findMerkelUnits([EXCHANGER_PROFILE, HALF_PROFILE], TOWER_KPIS))
      .toEqual([]);
  });

  it("still detects a tower whose run carries no KPI row (chips go honest-dash)", () => {
    const units = findMerkelUnits([TOWER_PROFILE], undefined);
    expect(units).toHaveLength(1);
    expect(units[0]!.unit).toBe("tower01");
    expect(units[0]!.kpis).toBeUndefined();
  });

  it("refuses a profile whose columns disagree in length", () => {
    const ragged: UnitProfile = {
      unit: "ragged",
      xAxis: "T_K",
      columns: {
        T_K: [300, 310, 320],
        [OPERATING_COLUMN]: [60, 90],           // one short
        [SATURATION_COLUMN]: [90, 120, 150],
      },
    };
    expect(findMerkelUnits([ragged], undefined)).toEqual([]);
  });

  it("empty / absent inputs give an empty array, no crash", () => {
    expect(findMerkelUnits(undefined, undefined)).toEqual([]);
    expect(findMerkelUnits([], TOWER_KPIS)).toEqual([]);
    expect(findMerkelUnits(undefined, TOWER_KPIS)).toEqual([]);
  });

  it("sorts multiple towers by unit name (deterministic Select order)", () => {
    const towerB: UnitProfile = { ...TOWER_PROFILE, unit: "bTower" };
    const units = findMerkelUnits([TOWER_PROFILE, towerB], undefined);
    expect(units.map((u) => u.unit)).toEqual(["bTower", "tower01"]);
  });
});

// ---- The Chebyshev-4 deviation ----------------------------------------------

describe("chebyshevDeviation -- one ratio of two engine-published KPIs", () => {
  it("pins the witness deviation exactly: |1.50006493043 - 1.5| / 1.5", () => {
    // BOTH operands are engine-published KPIs (merkelNumber, the converged
    // integral, and merkelNumber_chebyshev4, the CTI hand evaluation); the
    // tool computes nothing but their relative deviation.
    const check = chebyshevDeviation(TOWER_KPIS["tower01"]);
    expect(check).not.toBeNull();
    expect(check!.merkel).toBe(1.5);
    expect(check!.chebyshev4).toBe(1.50006493043);
    const expected = Math.abs(1.50006493043 - 1.5) / 1.5;
    expect(check!.relDeviation).toBe(expected);
    expect(check!.relDeviation).toBeCloseTo(4.328695e-5, 10);
    // ~4.3e-5 on the witness: the hand method is nearly exact for smooth
    // curves, and the chip must SAY so (below the 1e-3 band).
    expect(check!.relDeviation).toBeLessThan(NEARLY_EXACT_TOL);
    expect(check!.nearlyExact).toBe(true);
  });

  it("is null when either KPI is absent -- never re-derived", () => {
    expect(chebyshevDeviation(undefined)).toBeNull();
    expect(chebyshevDeviation({})).toBeNull();
    expect(chebyshevDeviation({ merkelNumber: 1.5 })).toBeNull();
    expect(chebyshevDeviation({ merkelNumber_chebyshev4: 1.5 })).toBeNull();
  });

  it("is null on a zero or non-finite converged integral", () => {
    expect(chebyshevDeviation(
      { merkelNumber: 0, merkelNumber_chebyshev4: 0.1 })).toBeNull();
    expect(chebyshevDeviation(
      { merkelNumber: NaN, merkelNumber_chebyshev4: 1.5 })).toBeNull();
  });

  it("flags a NOT-nearly-exact pair without drama (>= 1e-3 band)", () => {
    const check = chebyshevDeviation(
      { merkelNumber: 1.0, merkelNumber_chebyshev4: 1.01 });
    expect(check!.relDeviation).toBeCloseTo(0.01, 12);
    expect(check!.nearlyExact).toBe(false);
  });
});

// ---- Display-axis scaling ---------------------------------------------------

describe("kelvinToC -- unit scaling only, no physics", () => {
  it("is the K - 273.15 offset, exactly", () => {
    expect(kelvinToC(273.15)).toBe(0);
    expect(kelvinToC(318.15)).toBe(45);
    // The witness T_wb_in in display units.
    expect(kelvinToC(293.021697982)).toBeCloseTo(19.871697982, 9);
  });
});
