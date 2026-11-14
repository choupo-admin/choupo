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
  Physics held by recomputation (epsilon-NTU step 1): for C_r = 0 -- a pure
  fluid condensing or boiling at constant temperature against a single-phase
  stream -- the effectiveness-NTU duty and U*A*LMTD are the SAME number, for
  every NTU and for counter- and co-current alike.  The page used to say the
  log-mean "is not the driving force at all" across a phase change.  What
  is true of the UNIT (a sensible duty, announced) is pinned to its source
  lines.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ENTU_STEPS } from "../src/ui/methods/epsilonNtuLesson.js";
import { epsilonNtu } from "../src/ui/methods/EpsilonNtuTool.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

describe("epsilon-NTU and LMTD agree at C_r = 0", () => {
  const Th = 400;            // K, the condensing (isothermal) side
  const TcIn = 300;          // K
  const Cmin = 2500;         // W/K, the single-phase side
  for (const config of ["counter", "co"] as const) {
    for (const NTU of [0.1, 0.5, 1, 2, 5]) {
      it(`${config}, NTU = ${NTU}: U·A·ΔT_lm = ε·C_min·ΔT_max = C_min·ΔT_cold`, () => {
        const eps = epsilonNtu(config, NTU, 0);
        expect(eps).toBeCloseTo(1 - Math.exp(-NTU), 12);
        const Q = eps * Cmin * (Th - TcIn);
        const TcOut = TcIn + Q / Cmin;
        const dT1 = Th - TcIn, dT2 = Th - TcOut;
        const lmtd = (dT1 - dT2) / Math.log(dT1 / dT2);
        const UA = NTU * Cmin;
        expect(UA * lmtd / Q).toBeCloseTo(1, 10);
      });
    }
  }
});

describe("the page separates what the method allows from what the unit models", () => {
  const note = prose(ENTU_STEPS.find((s) => s.n === 1)!.note!);
  it("no longer says the log-mean fails across a phase change", () => {
    expect(note).not.toContain("is not the driving force at all");
    expect(note).not.toContain("with both streams single-phase; there");
    expect(note).toContain("What the method allows");
    expect(note).toContain("What this unit models");
    expect(note).toContain("1 − exp(−NTU)");
  });
  it("cites the unit's phase-change handling at the lines that hold it", () => {
    const lines = readFileSync(new URL(
      "../../src/unitOperations/heatTransfer/HeatExchanger.cpp", import.meta.url),
      "utf-8").split("\n");
    expect(lines[1073 - 1]).toContain("bool phaseChanged = false");
    expect(lines.slice(1098 - 1, 1098 + 6).join(" ")).toContain("a side changed phase: ");
    expect(lines.slice(1267 - 1, 1270).join(" ")).toContain("U.A.LMTD is NOT a check here");
    expect(note).toContain("HeatExchanger.cpp:1073-1098, 1267-1270");
  });
});
