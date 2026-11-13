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
  C305 point 5: the excess identity Q_H - Q_H,min = cross-pinch + heating
  below + cooling above, held NUMERICALLY on pinch01 (the engine's verbatim
  population and KPIs, native choupoSolve 2026-11-11) for the utility-only
  network the case declares and for the witness with one crossing exchanger.

  Hand check of the witness (coolerH1 x heaterC1, 100 kW, both from supply):
    H1 423.15 -> 373.15 K, all above the hot pinch 363.15: 100 kW released above
    C1 293.15 -> 333.15 K, all below the cold pinch 343.15: 0 taken above
    cross = 100.  Heaters: C1 333.15 -> 398.15 = 162.5 (25 below), C2 225
    (135 below): Q_H = 387.5, heating below 160.  Coolers: H1 373.15 -> 333.15
    = 80 (20 above), H2 240 (0 above): Q_C = 320, cooling above 20.
    387.5 - 107.5 = 280 = 100 + 160 + 20;  320 - 40 = 280.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  accountNetwork, crossingWitness, floorOneFigure, processStreams, type PinchFrame,
} from "../src/case/pinchViolations.js";
import { parseStreamTable } from "../src/case/pinch.js";

const P01_POPULATION = "unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason\ncoolerH1,Q,segment,hot,423.15,333.15,-180,2,\ncoolerH2,Q,segment,hot,363.15,333.15,-240,8,\nheaterC1,Q,segment,cold,293.15,398.15,262.5,2.5,\nheaterC2,Q,segment,cold,298.15,373.15,225,3,\n";
const P01_KPIS = { Q_C_min_kW: 40, Q_H_min_kW: 107.5, Q_heat_current_kW: 487.5,
  Q_cool_current_kW: 420, T_pinch_cold_K: 343.15, T_pinch_hot_K: 363.15, dTmin_K: 20,
  violation_cool_above_pinch_kW: 120, violation_heat_below_pinch_kW: 260 };

const streams = processStreams(parseStreamTable(P01_POPULATION));
const frame: PinchFrame = { ThotPinch: P01_KPIS.T_pinch_hot_K, TcoldPinch: P01_KPIS.T_pinch_cold_K,
  QHmin: P01_KPIS.Q_H_min_kW, QCmin: P01_KPIS.Q_C_min_kW, dTmin: P01_KPIS.dTmin_K };

describe("the utility-only network (what pinch01 declares)", () => {
  const a = accountNetwork(streams, frame, []);
  it("reads the four process segments", () => {
    expect(streams.map((s) => `${s.name}:${s.kind}:${s.CP}`))
      .toEqual(["coolerH1:hot:2", "coolerH2:hot:8", "heaterC1:cold:2.5", "heaterC2:cold:3"]);
  });
  it("reproduces the engine's current duties and its two violation KPIs", () => {
    expect(a.QH).toBeCloseTo(P01_KPIS.Q_heat_current_kW, 9);
    expect(a.QC).toBeCloseTo(P01_KPIS.Q_cool_current_kW, 9);
    expect(a.heatingBelow).toBeCloseTo(P01_KPIS.violation_heat_below_pinch_kW, 9);
    expect(a.coolingAbove).toBeCloseTo(P01_KPIS.violation_cool_above_pinch_kW, 9);
    expect(a.cross).toBe(0);
  });
  it("the identity holds: 380 = 0 + 260 + 120, on both utilities", () => {
    expect(a.excessH).toBeCloseTo(380, 9);
    expect(a.excessC).toBeCloseTo(380, 9);
    expect(a.residualH).toBeCloseTo(0, 9);
    expect(a.residualC).toBeCloseTo(0, 9);
  });
});

describe("the witness: one exchanger that crosses the pinch", () => {
  const w = crossingWitness(streams, frame);
  it("is coolerH1 x heaterC1 at 100 kW (0.9 x 120, one figure)", () => {
    expect(w).toEqual({ hot: "coolerH1", cold: "heaterC1", Q: 100 });
  });
  const a = accountNetwork(streams, frame, [w!]);
  it("respects dTmin at both ends (it breaks the rule, not the approach)", () => {
    const e = a.exchangers[0]!;
    expect(e.hotIn).toBeCloseTo(423.15, 9);
    expect(e.hotOut).toBeCloseTo(373.15, 9);
    expect(e.coldIn).toBeCloseTo(293.15, 9);
    expect(e.coldOut).toBeCloseTo(333.15, 9);
    expect(e.feasible).toBe(true);
    expect(Math.min(e.dThotEnd, e.dTcoldEnd)).toBeCloseTo(80, 9);
  });
  it("all three terms are nonzero: 100 cross + 160 below + 20 above", () => {
    expect(a.cross).toBeCloseTo(100, 9);
    expect(a.heatingBelow).toBeCloseTo(160, 9);
    expect(a.coolingAbove).toBeCloseTo(20, 9);
  });
  it("the identity holds numerically: 387.5 - 107.5 = 280 = 320 - 40", () => {
    expect(a.QH).toBeCloseTo(387.5, 9);
    expect(a.QC).toBeCloseTo(320, 9);
    expect(a.excessH).toBeCloseTo(a.cross + a.heatingBelow + a.coolingAbove, 9);
    expect(a.excessC).toBeCloseTo(a.excessH, 9);
    expect(a.residualH).toBeCloseTo(0, 9);
  });
  it("the identity holds for every crossing duty, not just the chosen one", () => {
    for (const Q of [5, 37.5, 100, 119])
      for (const cold of ["heaterC1", "heaterC2"]) {
        const b = accountNetwork(streams, frame, [{ hot: "coolerH1", cold, Q }]);
        expect(b.residualH, `${cold} ${Q}`).toBeCloseTo(0, 9);
        expect(b.residualC, `${cold} ${Q}`).toBeCloseTo(0, 9);
      }
  });
  it("a two-exchanger network closes the identity too", () => {
    const b = accountNetwork(streams, frame,
      [{ hot: "coolerH2", cold: "heaterC1", Q: 100 }, { hot: "coolerH1", cold: "heaterC1", Q: 50 }]);
    expect(b.residualH).toBeCloseTo(0, 9);
    expect(b.residualC).toBeCloseTo(0, 9);
  });
});

describe("guards", () => {
  it("refuses a duty a stream does not have", () => {
    expect(() => accountNetwork(streams, frame, [{ hot: "coolerH1", cold: "heaterC1", Q: 500 }]))
      .toThrow(/more than a stream has left/);
  });
  it("refuses two streams of one kind", () => {
    expect(() => accountNetwork(streams, frame, [{ hot: "coolerH1", cold: "coolerH2", Q: 10 }]))
      .toThrow(/one hot and one cold/);
  });
  it("rounds down to one figure", () => {
    expect(floorOneFigure(108)).toBe(100);
    expect(floorOneFigure(99.9)).toBe(90);
    expect(floorOneFigure(0.47)).toBeCloseTo(0.4, 12);
    expect(floorOneFigure(0)).toBe(0);
  });
  it("no pinch above any hot stream -> no witness", () => {
    expect(crossingWitness(streams, { ...frame, ThotPinch: 500, TcoldPinch: 480 })).toBeNull();
  });
});
