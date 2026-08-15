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

import { describe, expect, it, vi } from "vitest";

// The tool's module graph reaches the Plotly bundle (browser-only: it needs
// `self`) through the plotting kit.  The logic under test never draws; mock
// the kit at its one seam so the pure functions load under node.
vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: {
    background: "#1f1f1f", grid: "#3b3b3b", axis: "#828282", text: "#c9c9c9",
    accent: "#26c6da", accent2: "#80deea", warm: "#ffb74d", warm2: "#ff8a65",
    series: ["#26c6da", "#ffb74d"],
  },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {} },
}));

import {
  decideNormalisation,
  detectBreakthrough,
  extractFrontMarkers,
  idealSquareWave,
  type KpiMap,
} from "../src/ui/methods/BreakthroughTool.js";

// The two REAL trajectory header shapes (verbatim from the tutorials' CSVs).
// batch13 tracks the OUTLET (c_out_/y_out_ columns) — the breakthrough feed;
// batch09 tracks bed HOLDUP only (n_/q_/p_ columns) — no curve to draw.
const BATCH13_HEADER =
  "t,bed.n_CO2,bed.n_He,bed.T,bed.c_out_CO2,bed.y_out_CO2,bed.c_out_He,"
  + "bed.y_out_He,bed.qbar_CO2,bed.model_closure_CO2";
const BATCH22_HEADER =
  "t,bed.n_CO2,bed.n_He,bed.T,bed.c_out_CO2,bed.y_out_CO2,bed.qbar_CO2,"
  + "bed.T_out,bed.T_max,bed.model_closure_CO2";
const BATCH09_HEADER =
  "t,adsorber.n_CO2,adsorber.T,adsorber.q_CO2,adsorber.p_CO2_bar,"
  + "adsorber.P_total_bar,adsorber.uptake_CO2_mol,adsorber.closure_worst_rel";

const cols = (header: string) => header.split(",");

// A KPI block shaped like batch13's `bed` unit (values from its golden).
const BED_KPIS: KpiMap = {
  bed: {
    Pe: 250,
    t_end: 4200,
    t_breakthrough_5pct_CO2: 2890.66919752,
    t_50_CO2: 3036.44839047,
    t_breakthrough_95pct_CO2: 3204.16573568,
    t_stoichiometric_CO2: 3040.51250948,
    retention_factor_CO2: 304.051250948,
    qbar_CO2_final: 2.87234042488,
    c_out_over_cin_final_CO2: 0.999999989455,
  },
};

describe("detectBreakthrough — the activation predicate over real headers", () => {
  it("activates on batch13 (outlet columns + t_stoichiometric KPI)", () => {
    const a = detectBreakthrough(cols(BATCH13_HEADER), BED_KPIS);
    expect(a.active).toBe(true);
    expect(a.unit).toBe("bed");
    expect(a.components).toEqual(["CO2"]);
    // c_out_ preferred over the also-present y_out_ column.
    expect(a.outletColumns).toEqual(["bed.c_out_CO2"]);
    expect(a.concentrationBasis).toBe(true);
    // batch13 is isothermal: no T_out/T_max columns.
    expect(a.thermalColumns).toEqual([]);
  });

  it("does NOT activate on batch09 (holdup-only run, no c_out/y_out)", () => {
    // Even WITH a stoichiometric KPI present the predicate must refuse —
    // there is no outlet history to draw a breakthrough curve from.
    const kpis: KpiMap = { adsorber: { t_stoichiometric_CO2: 100 } };
    const a = detectBreakthrough(cols(BATCH09_HEADER), kpis);
    expect(a.active).toBe(false);
    expect(a.unit).toBeNull();
  });

  it("does NOT activate on outlet columns without a t_stoichiometric KPI", () => {
    const kpis: KpiMap = { bed: { qbar_CO2_final: 2.87 } };
    expect(detectBreakthrough(cols(BATCH13_HEADER), kpis).active).toBe(false);
    expect(detectBreakthrough(cols(BATCH13_HEADER), undefined).active).toBe(false);
  });

  it("finds the thermal columns on batch22 (wall-cooled run)", () => {
    const a = detectBreakthrough(cols(BATCH22_HEADER), BED_KPIS);
    expect(a.active).toBe(true);
    expect(a.thermalColumns).toEqual(["bed.T_out", "bed.T_max"]);
  });

  it("falls back to y_out_ when the unit emits no c_out_ column", () => {
    const header = ["t", "bed.n_CO2", "bed.T", "bed.y_out_CO2"];
    const a = detectBreakthrough(header, BED_KPIS);
    expect(a.active).toBe(true);
    expect(a.outletColumns).toEqual(["bed.y_out_CO2"]);
    expect(a.concentrationBasis).toBe(false);
  });
});

describe("extractFrontMarkers — the four KPI-emitted front times, verbatim", () => {
  it("reads t_5% / t_50% / t_95% / t_st off a synthetic KPI block", () => {
    const m = extractFrontMarkers(BED_KPIS["bed"], "CO2");
    expect(m.t5).toBeCloseTo(2890.66919752, 6);
    expect(m.t50).toBeCloseTo(3036.44839047, 6);
    expect(m.t95).toBeCloseTo(3204.16573568, 6);
    expect(m.tStoich).toBeCloseTo(3040.51250948, 6);
  });

  it("a missing key is null (drawn as nothing), never re-derived", () => {
    const m = extractFrontMarkers({ t_50_CO2: 10 }, "CO2");
    expect(m.t5).toBeNull();
    expect(m.t50).toBe(10);
    expect(m.t95).toBeNull();
    expect(m.tStoich).toBeNull();
    // No KPI block at all: all four honest nulls.
    const none = extractFrontMarkers(undefined, "CO2");
    expect([none.t5, none.t50, none.t95, none.tStoich]).toEqual(
      [null, null, null, null]);
  });
});

describe("decideNormalisation — c_in from the run itself or not at all", () => {
  it("anchors c_in on the late plateau via c_out_over_cin_final", () => {
    const plateau = 40.3598507; // last c_out_CO2 sample (mol basis, engine's)
    const d = decideNormalisation(BED_KPIS["bed"], ["CO2"], { CO2: plateau });
    expect(d.cIn).not.toBeNull();
    // c_in = plateau / ratio — arithmetic on two engine numbers, no physics.
    expect(d.cIn!["CO2"]).toBeCloseTo(plateau / 0.999999989455, 9);
    expect(d.caption).toContain("c_out_over_cin_final");
  });

  it("draws unnormalised when the anchor KPI is absent — c_in never invented", () => {
    const d = decideNormalisation(
      { t_stoichiometric_CO2: 3040 }, ["CO2"], { CO2: 40.36 });
    expect(d.cIn).toBeNull();
    expect(d.caption).toContain("Unnormalised");
    expect(d.caption).toContain("never invented");
  });

  it("refuses a plateau the anchor cannot divide through (zero outlet)", () => {
    const d = decideNormalisation(BED_KPIS["bed"], ["CO2"], { CO2: 0 });
    expect(d.cIn).toBeNull();
    expect(d.caption).toContain("CO2");
  });

  it("all-or-nothing over multiple components (no mixed-axis normalisation)", () => {
    const kpis = { ...BED_KPIS["bed"], c_out_over_cin_final_N2: 0.98 };
    const both = decideNormalisation(kpis, ["CO2", "N2"], { CO2: 40, N2: 12 });
    expect(both.cIn).not.toBeNull();
    // N2 loses its anchor => the WHOLE plot stays raw, N2 named in the caption.
    const oneShort = decideNormalisation(
      BED_KPIS["bed"], ["CO2", "N2"], { CO2: 40, N2: 12 });
    expect(oneShort.cIn).toBeNull();
    expect(oneShort.caption).toContain("N2");
  });
});

describe("idealSquareWave — pure geometry over the KPI t_st", () => {
  it("is a step from 0 to the plateau at t_stoichiometric", () => {
    const w = idealSquareWave(3040.5, 0, 4200, 1);
    expect(w.t).toEqual([0, 3040.5, 3040.5, 4200]);
    expect(w.y).toEqual([0, 0, 1, 1]);
  });
});
