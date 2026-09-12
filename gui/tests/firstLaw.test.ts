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

/*---------------------------------------------------------------------------*\
  THE FIRST-LAW FIGURE'S GEOMETRY (2026-09-12).

  The numbers in these fixtures are REAL: each was read off `choupoSolve`'s
  own `globalEnergyBoundary` block for the named case, so a test that passes
  here is a test about a picture the corpus can actually produce.

  What is pinned is the CONSTRUCTION, never a rendering: that the two columns'
  levels are the two sides of dH = Q - W, that their difference is the
  engine's own published residual (drawn, never recomputed), that the
  translucent stack ends exactly at the level -- which is what makes a white
  line there the answer rather than a decoration -- and that the y window is
  scaled to the process terms, because on the elements datum the enthalpy
  bars are 1000x the level on a case like the pump.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { GlobalEnergyBoundary } from "../src/adapters/SolverAdapter.js";
import { firstLawFigure, stackedBars, FIRST_LAW_COLORS } from "../src/case/firstLaw.js";

const base = {
  residual_pct: 0, residual_pct_available: true, residual_denom_kW: 1,
  residual_basis: "energy exchanged", n_feeds: 1, n_products: 1, n_gap: 0,
  noBoundary: false, datum: "elements",
};

/** pump01_water: 2 kW of shaft work in, 0.700 kW of enthalpy rise out,
 *  1.3 kW unaccounted -- and Σ H is -2864 kW, 4000x the level. */
const PUMP: GlobalEnergyBoundary = {
  ...base,
  H_feeds_kW: -2864.01591733, Q_boundary_kW: 2, Q_heat_kW: 0, W_shaft_kW: 2,
  H_products_kW: -2863.31591733, residual_kW: 1.3,
};

/** rankine02_water: the case the single net number hides -- +8.84 kW of heat
 *  and -8.84 kW of shaft work netting 2e-10 kW. */
const RANKINE: GlobalEnergyBoundary = {
  ...base,
  H_feeds_kW: 0, Q_boundary_kW: 2.09752215596e-10,
  Q_heat_kW: 8.83869341081, W_shaft_kW: -8.8386934106,
  H_products_kW: 0, residual_kW: 2.09752215596e-10,
  n_feeds: 0, n_products: 0, noBoundary: true,
};

/** column01_benzene_toluene: heat only, and a 631.96 kW first-law violation
 *  the engine itself reports. */
const COLUMN: GlobalEnergyBoundary = {
  ...base,
  H_feeds_kW: 1779.54082551, Q_boundary_kW: -1.73867997775,
  Q_heat_kW: -1.73867997775, W_shaft_kW: 0,
  H_products_kW: 1145.84599758, residual_kW: 631.956147952,
  n_products: 2,
};

describe("the two columns ARE the two sides of dH = Q - W", () => {
  it("the left level is ΔH and the right level is Q − W", () => {
    const f = firstLawFigure(PUMP)!;
    const [enth, bnd] = f.columns;
    expect(enth.level).toBeCloseTo(PUMP.H_products_kW - PUMP.H_feeds_kW, 9);
    expect(bnd.level).toBeCloseTo(PUMP.Q_boundary_kW, 12);
  });

  it("the gap between the levels IS the engine's published residual", () => {
    for (const gb of [PUMP, COLUMN, RANKINE]) {
      const f = firstLawFigure(gb)!;
      //  levelGap = ΔH − (Q − W) = −residual, by the ledger's own definition
      //  (residual = Σ H_feeds + Q − Σ H_products).  Drawn, not recomputed:
      //  the figure reports `residualKw` straight off the block.
      expect(f.levelGapKw).toBeCloseTo(-gb.residual_kW, 6);
      expect(f.residualKw).toBe(gb.residual_kW);
    }
  });

  it("the mixed plant keeps both terms that its net total hides", () => {
    const f = firstLawFigure(RANKINE)!;
    const bnd = f.columns[1];
    expect(bnd.terms.map((t) => t.kw)).toEqual(
      [RANKINE.Q_heat_kW, RANKINE.W_shaft_kW]);
    //  the whole point: the net is 2e-10 kW while the terms are ~8.84 kW
    expect(Math.abs(bnd.level)).toBeLessThan(1e-6);
    for (const t of bnd.terms) expect(Math.abs(t.kw)).toBeGreaterThan(8);
  });
});

describe("the stack: positives up from zero, negatives back down over them", () => {
  it("the translucent stack ends EXACTLY at the level", () => {
    for (const gb of [PUMP, COLUMN, RANKINE]) {
      for (const col of firstLawFigure(gb)!.columns) {
        const bars = stackedBars(col);
        const subtracting = bars.filter((b) => b.term.subtracts);
        if (subtracting.length === 0) continue;
        const lowest = Math.min(...subtracting.map((b) => b.base));
        expect(lowest).toBeCloseTo(col.level, 9);
      }
    }
  });

  it("a positive term starts at zero and a subtracting one hangs off the top", () => {
    const col = firstLawFigure(COLUMN)!.columns[0];
    const bars = stackedBars(col);
    const up = bars.filter((b) => !b.term.subtracts);
    const down = bars.filter((b) => b.term.subtracts);
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
    expect(up[0]!.base).toBe(0);
    expect(down[0]!.base + down[0]!.height).toBeCloseTo(col.positiveTop, 9);
  });

  it("every term's height is its own magnitude -- no term is resized", () => {
    for (const col of firstLawFigure(PUMP)!.columns) {
      for (const b of stackedBars(col)) {
        expect(b.height).toBeCloseTo(Math.abs(b.term.kw), 12);
      }
    }
  });
});

describe("colour: by SIGN on the left, by QUANTITY on the right", () => {
  it("the enthalpy column is green for the positive term and red for the negative", () => {
    const [enth] = firstLawFigure(COLUMN)!.columns;
    for (const t of enth.terms) {
      expect(t.color).toBe(t.kw >= 0 ? FIRST_LAW_COLORS.positive
                                     : FIRST_LAW_COLORS.negative);
    }
  });

  it("Q and W keep their own colour whichever way they point", () => {
    for (const gb of [PUMP, RANKINE]) {
      const bnd = firstLawFigure(gb)!.columns[1];
      expect(bnd.terms[0]!.color).toBe(FIRST_LAW_COLORS.heat);
      expect(bnd.terms[1]!.color).toBe(FIRST_LAW_COLORS.work);
    }
  });
});

describe("the y window is scaled to the process terms, not to Σ H", () => {
  it("both levels are inside it even when Σ H is a thousand times larger", () => {
    const f = firstLawFigure(PUMP)!;
    const [lo, hi] = f.window;
    for (const col of f.columns) {
      expect(col.level).toBeGreaterThan(lo);
      expect(col.level).toBeLessThan(hi);
    }
    //  ...and the window is nowhere near the datum-scale bars
    expect(hi - lo).toBeLessThan(50);
    expect(f.clipped).toBe(true);
  });

  it("a case whose terms are process-scale is NOT clipped", () => {
    const f = firstLawFigure(RANKINE)!;
    expect(f.clipped).toBe(false);
  });
});

describe("what the engine does not publish, the figure does not invent", () => {
  it("no ledger -> no figure (the caller says the report did not run)", () => {
    expect(firstLawFigure(undefined)).toBeNull();
  });

  it("an older result with no split draws ONE right-hand term and says so", () => {
    const old = { ...PUMP } as Record<string, unknown>;
    delete old.Q_heat_kW; delete old.W_shaft_kW;
    const f = firstLawFigure(old as unknown as GlobalEnergyBoundary)!;
    expect(f.splitPublished).toBe(false);
    expect(f.columns[1].terms).toHaveLength(1);
    expect(f.columns[1].level).toBeCloseTo(PUMP.Q_boundary_kW, 12);
    expect(f.columns[1].terms[0]!.label).toBe("Q − W");
  });

  it("the plot draws the ledger and computes no balance of its own", () => {
    const src = readFileSync(new URL("../src/ui/plotting/FirstLawPlot.tsx", import.meta.url), "utf-8");
    //  the 2026-09-05 rule, one level down: no GUI-side sum of duties, and no
    //  reach into the streams or the KPIs to make one.
    expect(src).not.toMatch(/utilityAllocation|result\.kpis|\.streams\b/);
    expect(src).toMatch(/globalEnergyBoundary/);
  });

  it("the Reports panel draws the split when it exists and adds no arithmetic", () => {
    const src = readFileSync(new URL("../src/ui/ReportsWorkspace.tsx", import.meta.url), "utf-8");
    //  PUBLISHED IMPLIES DRAWN, on the one panel that tabulates this ledger.
    expect(src).toMatch(/gb\.Q_heat_kW/);
    expect(src).toMatch(/gb\.W_shaft_kW/);
    //  ...and only when the ENGINE published both: an older result carries
    //  neither, and the panel must not fill the gap with a sum of its own.
    expect(src).toMatch(/gb\.Q_heat_kW !== undefined\s*&& gb\.W_shaft_kW !== undefined/);
  });

  it("the geometry module reads the engine's block and nothing else", () => {
    const src = readFileSync(new URL("../src/case/firstLaw.ts", import.meta.url), "utf-8");
    expect(src).not.toMatch(/utilityAllocation|StreamResult|kpis/);
  });
});

describe("readable without colour", () => {
  it("every term carries its own algebraic label and a detail sentence", () => {
    for (const col of firstLawFigure(RANKINE)!.columns) {
      for (const t of col.terms) {
        expect(t.label.length).toBeGreaterThan(0);
        expect(t.detail.length).toBeGreaterThan(10);
      }
    }
  });

  it("the plot prints both levels and the residual as numbers, not as hue", () => {
    const src = readFileSync(new URL("../src/ui/plotting/FirstLawPlot.tsx", import.meta.url), "utf-8");
    expect(src).toMatch(/col\.levelLabel.*fmtKw\(col\.level\)/);
    expect(src).toMatch(/residual \$\{fmtKw\(fig\.residualKw\)\} kW/);
    //  the white level line is drawn over a dark halo so it survives the
    //  light chrome and a greyscale print
    expect(src).toMatch(/#000000/);
    expect(src).toMatch(/#ffffff/);
  });
});
