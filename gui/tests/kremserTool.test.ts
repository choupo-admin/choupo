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

import { describe, expect, it } from "vitest";

import {
  findKremserUnits, kremserCurve, kremserRecovery, stageProfileForDisplay,
} from "../src/ui/methods/KremserTool.js";

// Independent arithmetic for the closed form: A^{N+1} by REPEATED
// MULTIPLICATION (never Math.pow, never the function under test), then the
// textbook expression written out literally.
function handKremser(A: number, N: number): number {
  let Ap = 1;
  for (let i = 0; i < N + 1; ++i) Ap *= A;
  return (Ap - A) / (Ap - 1);
}

describe("kremserRecovery — the closed form against hand values", () => {
  it("A=2, N=1: one equilibrium stage absorbs 2/3 of the solute", () => {
    // (2^2 - 2)/(2^2 - 1) = 2/3, checked by literal fractions.
    expect(kremserRecovery(2, 1)).toBeCloseTo(2 / 3, 12);
    expect(kremserRecovery(2, 1)).toBeCloseTo(handKremser(2, 1), 12);
  });

  it("A=0.5, N=3: recovery plateaus below A — (0.0625-0.5)/(0.0625-1) = 7/15", () => {
    // 0.5^4 = 0.0625; (0.0625 - 0.5)/(0.0625 - 1) = (-0.4375)/(-0.9375) = 7/15.
    expect(kremserRecovery(0.5, 3)).toBeCloseTo(7 / 15, 12);
    expect(kremserRecovery(0.5, 3)).toBeCloseTo(handKremser(0.5, 3), 12);
  });

  it("A=1.53522727273, N=6 (absorber01's own A_NH3): 0.97198 by hand", () => {
    const A = 1.53522727273;
    const hand = handKremser(A, 6); // = 0.971978490731535
    expect(hand).toBeCloseTo(0.9719784907, 9);
    expect(kremserRecovery(A, 6)).toBeCloseTo(hand, 12);
  });

  it("A=1 takes the removable-singularity limit N/(N+1), continuously", () => {
    expect(kremserRecovery(1, 6)).toBeCloseTo(6 / 7, 12);
    expect(kremserRecovery(1, 9)).toBeCloseTo(0.9, 12);
    // Continuity: just off the singularity the general branch agrees.
    expect(kremserRecovery(1 + 1e-7, 9)).toBeCloseTo(0.9, 6);
  });

  it("refuses a placeholder: A <= 0 or N < 1 is NaN, never a number", () => {
    expect(kremserRecovery(0, 6)).toBeNaN();
    expect(kremserRecovery(-1, 6)).toBeNaN();
    expect(kremserRecovery(2, 0)).toBeNaN();
  });

  it("kremserCurve walks N = 1..Nmax and rises monotonically for A > 1", () => {
    const c = kremserCurve(2, 20);
    expect(c.N.length).toBe(20);
    expect(c.N[0]).toBe(1);
    expect(c.N[19]).toBe(20);
    for (let i = 1; i < c.recovery.length; ++i) {
      expect(c.recovery[i]!).toBeGreaterThan(c.recovery[i - 1]!);
    }
  });
});

describe("findKremserUnits — activation on the absorber's published KPIs", () => {
  // absorber01_NH3_water's published values, verbatim from its `expected`
  // golden (unit "scrubber"); the bystander units must NOT activate.
  const kpis = {
    scrubber: {
      stages: 6,
      V_in: 0.045,
      L_in: 0.0675,
      L_over_V: 1.5,
      T_top: 293.4,
      T_bottom: 297.6,
      dT_rise: 4.2,
      nonIsothermal: 1,
      A_NH3: 1.53522727273,
      K_NH3: 0.977054034049,
      recovery_NH3: 0.675312940561,
    },
    heater: { Q: 12.5, T_out: 350 },        // no A_* key
    pump: { A_frac: 0.5, head_m: 12 },       // an A_* key but NO stages
  };

  it("activates exactly the unit carrying stages + A_*", () => {
    const units = findKremserUnits(kpis);
    expect(units.length).toBe(1);
    expect(units[0]!.unit).toBe("scrubber");
    expect(units[0]!.stages).toBe(6);
    expect(units[0]!.nonIsothermal).toBe(true);
    expect(units[0]!.dTrise).toBeCloseTo(4.2, 12);
  });

  it("reads the component triple (A, K, recovery) off the KPI names", () => {
    const comp = findKremserUnits(kpis)[0]!.components;
    expect(comp.length).toBe(1);
    expect(comp[0]!.name).toBe("NH3");
    expect(comp[0]!.A).toBeCloseTo(1.53522727273, 12);
    expect(comp[0]!.K).toBeCloseTo(0.977054034049, 12);
    expect(comp[0]!.recovery).toBeCloseTo(0.675312940561, 12);
  });

  it("the DEVIATION chip sees the real engine's nonzero gap", () => {
    // The closed form at the case's own (A, N) predicts ~0.9720; the engine's
    // stagewise run recovers 0.6753 -- K varies along the (non-isothermal)
    // column, which is exactly the lesson the chip states.
    const dev = findKremserUnits(kpis)[0]!.components[0]!.deviation!;
    const hand = Math.abs(0.675312940561 - handKremser(1.53522727273, 6));
    expect(dev).toBeGreaterThan(0.05);            // decidedly nonzero
    expect(dev).toBeCloseTo(hand, 12);            // = 0.296665550170535
    expect(dev).toBeCloseTo(0.2966655502, 9);
  });

  it("skips an A = 0 placeholder component (no K published, not a datum)", () => {
    const units = findKremserUnits({
      col: { stages: 4, A_helium: 0, A_NH3: 1.2, recovery_NH3: 0.7 },
    });
    expect(units.length).toBe(1);
    expect(units[0]!.components.map((c) => c.name)).toEqual(["NH3"]);
  });

  it("empty / absent kpis mean no activation (the honest empty state)", () => {
    expect(findKremserUnits(undefined)).toEqual([]);
    expect(findKremserUnits({})).toEqual([]);
    expect(findKremserUnits({ heater: { Q: 1 } })).toEqual([]);
  });
});

describe("stageProfileForDisplay — ProfilePlot conventions", () => {
  it("renames T_K to T (right axis) and passes the fraction columns through", () => {
    const shown = stageProfileForDisplay({
      unit: "scrubber",
      xAxis: "stage",
      columns: {
        stage: [1, 2, 3],
        T_K: [293.4, 295.1, 297.6],
        y_NH3: [0.01, 0.02, 0.05],
        x_NH3: [0.002, 0.004, 0.009],
      },
    });
    expect(shown.xAxis).toBe("stage");
    expect(Object.keys(shown.columns).sort()).toEqual(["T", "stage", "x_NH3", "y_NH3"]);
    expect(shown.columns["T"]).toEqual([293.4, 295.1, 297.6]);
    expect(shown.columns["y_NH3"]).toEqual([0.01, 0.02, 0.05]);
  });
});
