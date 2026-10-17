/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*  THE PLOT AREA AND THE LAND (DEV.md 4c C82).  The engine publishes the plot
    (`layout.plot`, `layout.plotSectors`) and, where the case declares a land
    price, `economics.land` and a `land` cell on every cash-flow row.  These
    tests hold the GUI to DRAWING them: the adapter passes them through (and
    keeps their absence as absence), the words and rows come from
    case/layoutTables.ts with the engine's numbers and the engine's rule
    sentence, and the 3D scene outlines the published rectangle -- nothing is
    computed.  The numbers transcribe the witness
    tutorials/plant/ammonia02_full_plant (margin 10 m, land at 50 EUR/m2). */

import { describe, expect, it } from "vitest";

import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { plotSummary } from "../src/case/layoutTables.js";
import { layoutScene } from "../src/case/plantLayout.js";
import { LAYOUT } from "./plantLayoutFixture.js";

const RULE = "the plot is the axis-aligned envelope of every declared sector area, every"
  + " placed footprint (process and non-process) and every routed pipe's polyline, grown"
  + " on every side by the declared plot margin";

const PLOT = {
  id: "plot", margin: 10, marginDeclared: true, xMin: -47.5, xMax: 77, yMin: -55, yMax: 17,
  plotArea: 8964, footprintArea: 260.318982967, footprintShare: 0.0290405826603,
  stackedPairs: 0, declaredAreasUnion: 0, declaredAreasOverlap: 0,
  marginReason: "a 10 m strip for the road", rule: RULE,
};

function run(payload: object) {
  const log = `${BEGIN_MARK}\n${JSON.stringify({ streams: {}, ...payload })}\n${END_MARK}\n`;
  return extractStructured(log, { thermoPackage: {}, controlDict: {} });
}

describe("the plot the engine published (C82)", () => {
  it("the adapter passes the plot and its sectors through, and keeps absence", () => {
    const out = run({ layout: { ...LAYOUT, plot: PLOT,
      plotSectors: [{ id: "plotSector:LOOP", sector: "LOOP", from: "declaredArea",
                      plotArea: 880, footprintArea: 9.37 }] } });
    expect(out.layout!.plot!.plotArea).toBe(8964);
    expect(out.layout!.plot!.footprintShare).toBe(0.0290405826603);
    expect(out.layout!.plot!.rule).toBe(RULE);
    expect(out.layout!.plot!.sectors).toEqual([
      { sector: "LOOP", from: "declaredArea", plotArea: 880, footprintArea: 9.37 }]);
    expect(run({ layout: LAYOUT }).layout!.plot).toBeUndefined();
    //  A plot with a non-finite area is absent, never drawn at zero.
    expect(run({ layout: { ...LAYOUT, plot: { ...PLOT, plotArea: null } } }).layout!.plot)
      .toBeUndefined();
  });

  it("the words: the engine's area, share, margin and rule; one row per sector", () => {
    const layout: PlantLayout = {
      ...LAYOUT,
      plot: { ...PLOT, sectors: [{ sector: "LOOP", from: "declaredArea", plotArea: 880,
                                   footprintArea: 9.37 }] },
    };
    const v = plotSummary(layout)!;
    expect(v.headline).toContain("8964 m²");
    expect(v.headline).toContain("260 m²");
    expect(v.headline).toContain("2.9 %");
    expect(v.margin).toBe("Margin 10.0 m, declared by the case: a 10 m strip for the road");
    expect(v.rule).toBe(`Rule (the engine's): ${RULE}.`);
    expect(v.sectors).toEqual([{ sector: "LOOP", from: "declared area", plotArea: "880",
                                 footprintArea: "9" }]);
    const bare = plotSummary({ ...layout, plot: { ...layout.plot!, marginDeclared: false,
                                                  margin: 0 } })!;
    expect(bare.margin).toMatch(/No margin declared.*lower bound/);
    expect(plotSummary(LAYOUT)).toBeNull();
  });

  it("the scene outlines the published rectangle, and nothing without one", () => {
    const s = layoutScene({ ...LAYOUT, plot: { ...PLOT, sectors: [] } })!;
    expect(s.plot).toEqual({ sector: "", x0: -47.5, x1: 77, z0: -17, z1: 55,
                             label: "plot 8964 m²" });
    expect(layoutScene(LAYOUT)!.plot).toBeNull();
  });
});

describe("the land the engine priced (C82)", () => {
  const ECON = {
    currency: "EUR", FCI: 55272204.6518, WC: 8290830.69777, TCI: 63563035.3496,
    COM_d: 212919178.107, revenue: 239167294.557, depreciation: 6141356.07,
    NPV: 99817446.0565, IRR: 0.29073474884, irrAmbiguous: false,
    discountedPayback: 3.84067868709, simplePayback: 2.51,
    discountRate: 0.1, taxRate: 0.21, projectLife: 15, estimateClass: 4, accLo: -30, accHi: 50,
    land: { price: 50, area: 8964, areaFrom: "layoutPlot", cost: 448200, investedAtYear: -2,
            recoveredAtYear: 15, source: "placeholder", reason: "round" },
    cashFlow: [
      { year: -2, investment: 0, land: -448200, revenue: 0, opex: 0, depreciation: 0,
        taxableIncome: 0, tax: 0, afterTaxProfit: 0, cashFlow: -448200,
        discountFactor: 1.21, discountedCF: -542322, cumulativeDCF: -542322 },
      { year: 15, investment: 0, land: 448200, revenue: 1, opex: 1, depreciation: 0,
        taxableIncome: 0, tax: 0, afterTaxProfit: 0, cashFlow: 448200,
        discountFactor: 0.2394, discountedCF: 107295, cumulativeDCF: 0 },
    ],
  };

  it("the adapter carries the land and its cells, and keeps absence as absence", () => {
    const e = run({ economics: ECON }).economics!;
    expect(e.land).toEqual(ECON.land);
    expect(e.cashFlow.map((r) => r.land)).toEqual([-448200, 448200]);
    const { land: _l, ...noLand } = ECON;
    const bare = run({ economics: { ...noLand,
      cashFlow: noLand.cashFlow.map(({ land: _x, ...r }) => r) } }).economics!;
    expect(bare.land).toBeUndefined();
    expect(bare.cashFlow.every((r) => !("land" in r))).toBe(true);
  });
});
