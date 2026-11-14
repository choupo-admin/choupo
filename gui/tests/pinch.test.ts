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
  The Pinch tab READS the engine's pinch pass (DEV.md 4c C230) and computes
  nothing.  Fixture: the artefacts `pinchPass { dTmin 20 K; }` writes on
  tutorials/plant/ammonia02_full_plant -- the FEHE as recovered heat (both
  sides), the water cooler's PROCESS side as a segment, the cooling water as a
  `utility` row that is NOT a stream, and a threshold answer (no pinch).
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { pinchFromEngine, canComputePinch, parsePopulation, PINCH_PASS_EXCERPT } from "../src/case/pinch.js";

const POP = [
  "unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason",
  "FEHE [hot side],Q,recovered,hot,839.64,485.64,-117169.6,331,",
  "FEHE [cold side],Q,recovered,cold,339.12,683.01,117169.6,340,",
  "waterCooler [hot side],Q,segment,hot,485.64,311.66,-57821.15,332,",
  "waterCooler [cold side],Q,utility,cold,298.15,303.66,57821.15,10486,served by a declared utility",
  "separator,Q,segment,hot,311.66,250,-37649.58,610,",
  "letdown,Q,segment,cold,249.5,250.5,16.48,16.48,near-isothermal: a latent slice of latentWidth",
].join("\n");

const run = (extra: object = {}) => ({
  status: "done", log: "", streams: [],
  kpis: { pinch: {
    Q_H_min_kW: 0, Q_C_min_kW: 95454.3, T_pinch_K: 829.64, dTmin_K: 20,
    Q_heat_current_kW: 16.48, Q_cool_current_kW: 95470.7, ...extra } },
  csvFiles: { "reports/pinch/population.csv": POP },
}) as never;

describe("pinch tab reads the engine", () => {
  it("a utility side is never a stream; the process side of the same exchanger is", () => {
    const s = parsePopulation(POP);
    expect(s.map((x) => x.unit)).toEqual(
      ["FEHE [hot side]", "FEHE [cold side]", "waterCooler [hot side]", "separator", "letdown"]);
    expect(s.find((x) => x.unit === "waterCooler [hot side]")!.kind).toBe("hot");
  });
  it("draws the engine's targets and a threshold problem as no pinch", () => {
    const p = pinchFromEngine(run())!;
    expect(p.QhMin).toBe(0);
    expect(p.QcMin).toBeCloseTo(95454.3, 1);
    expect(p.pinchShift).toBeNull();
  });
  it("a pinch strictly inside the range is reported", () => {
    const p = pinchFromEngine(run({ T_pinch_K: 308.15, T_pinch_hot_K: 318.15, T_pinch_cold_K: 298.15 }))!;
    expect(p.pinchShift).toBeCloseTo(308.15, 6);
  });
  it("no pinchPass in the run: null, and the excerpt to declare is the exact one", () => {
    expect(pinchFromEngine({ status: "done", log: "", streams: [], kpis: {} } as never)).toBeNull();
    expect(PINCH_PASS_EXCERPT).toBe("pinchPass { dTmin 20 K; }");
  });
  it("the tab is greyed only before a run", () => {
    expect(canComputePinch(null)).toBe(false);
    expect(canComputePinch(run())).toBe(true);
  });
});
