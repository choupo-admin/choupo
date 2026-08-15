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

// pumpSystemTool -- the sweep detector, the derived-in-view operating point,
// and the honesty classifier.  The fixture below is a VERBATIM copy of the
// witness case's engine output
// (tutorials/steady/hydraulics/pumpSystem01_operating_point,
// sweep_pumpSystem.csv), so every number the detector reads back is checked
// against what the engine actually wrote.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FLAT_REL_TOL,
  classifyPumpCharacteristic,
  findOperatingPoint,
  findPumpSystemSweep,
} from "../src/ui/methods/PumpSystemTool.js";

// ---- Fixture: the witness case's sweep CSV, verbatim ------------------------

const WITNESS_CSV = `point,streams.feed.F,pump01.dP,pump01.head_m,pump01.P_out,P1.deltaP,P1.dP_friction,P1.dP_elevation,P1.head_loss_m,P1.velocity,P1.reynolds
0,0.4,179856,18.3962,479856,27702.4,4838.34,17200.8,1.22105,1.04618,103159
1,0.5,143885,14.717,443885,33402.9,7353.31,17200.9,1.88386,1.30772,128935
2,0.6,119904,12.2641,419904,40316.2,10373.1,17201,2.68767,1.56926,154711
3,0.7,102775,10.5121,402775,48439.6,13895.2,17201,3.63218,1.83079,180488
4,0.8,89928.1,9.19811,389928,57771.1,17917.6,17201,4.71717,2.09233,206264
5,0.9,79936.1,8.17609,379936,68309.6,22439,17201,5.94249,2.35387,232040
6,1,71942.4,7.35849,371942,80054,27458.4,17201.1,7.30802,2.61541,257816
7,1.1,65402.2,6.68953,365402,93003.4,32975,17201.1,8.81367,2.87695,283592
8,1.2,59952,6.13207,359952,107157,38988.2,17201.1,10.4594,3.13849,309369
9,1.3,55340.3,5.66037,355340,122515,45497.5,17201.1,12.245,3.40003,335145
10,1.4,51387.5,5.25606,351387,139077,52502.4,17201.1,14.1707,3.66157,360921
11,1.5,47961.6,4.90566,347962,156841,60002.7,17201.1,16.2362,3.9231,386697
12,1.6,44964,4.59905,344964,175809,67997.9,17201.1,18.4416,4.18464,412473
`;

/** The fixture truncated to sweep points 0..4 (pump above system everywhere
 *  in the window -- no sign change, so no crossing to interpolate). */
const WITNESS_CSV_ROWS_0_TO_4 =
  WITNESS_CSV.split("\n").slice(0, 6).join("\n") + "\n";

// ---- findPumpSystemSweep ----------------------------------------------------

describe("findPumpSystemSweep -- the generic sweep-CSV detector", () => {
  it("detects the witness sweep with its units, target, and 13 points", () => {
    const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": WITNESS_CSV });
    expect(sweep).not.toBeNull();
    expect(sweep!.file).toBe("sweep_pumpSystem.csv");
    expect(sweep!.target).toBe("streams.feed.F");
    expect(sweep!.pumpUnit).toBe("pump01");
    expect(sweep!.systemUnit).toBe("P1");
    expect(sweep!.F).toHaveLength(13);
    expect(sweep!.pumpDP).toHaveLength(13);
    expect(sweep!.systemDP).toHaveLength(13);
    // Spot values, verbatim from the CSV.
    expect(sweep!.F[0]).toBe(0.4);
    expect(sweep!.F[12]).toBe(1.6);
    expect(sweep!.pumpDP[0]).toBe(179856);
    expect(sweep!.pumpDP[12]).toBe(44964);
    expect(sweep!.systemDP[0]).toBe(27702.4);
    expect(sweep!.systemDP[12]).toBe(175809);
    // Every engine column travels verbatim in the columns bag.
    expect(sweep!.columns["P1.reynolds"]![0]).toBe(103159);
    expect(sweep!.columns["pump01.head_m"]![5]).toBe(8.17609);
    expect(sweep!.columns["P1.dP_elevation"]![6]).toBe(17201.1);
  });

  it("returns null when nothing satisfies the contract", () => {
    expect(findPumpSystemSweep(undefined)).toBeNull();
    expect(findPumpSystemSweep({})).toBeNull();
    // A CSV that is not a streams sweep at all.
    expect(findPumpSystemSweep({
      "trajectory.csv": "t,T\n0,300\n1,310\n",
    })).toBeNull();
  });

  it("requires the pump's dP + head_m PAIR, not dP alone", () => {
    // Same sweep, head_m column renamed away: no unit publishes the pair.
    const noPair = WITNESS_CSV.replace("pump01.head_m", "pump01.other");
    expect(findPumpSystemSweep({ "sweep.csv": noPair })).toBeNull();
  });

  it("requires the system deltaP on a DIFFERENT unit than the pump", () => {
    // The demand column moved onto the pump's own prefix: no system unit.
    const samePrefix = WITNESS_CSV.replace("P1.deltaP", "pump01.deltaP");
    expect(findPumpSystemSweep({ "sweep.csv": samePrefix })).toBeNull();
  });

  it("still detects the 5-point truncated window", () => {
    const sweep = findPumpSystemSweep({ "sweep.csv": WITNESS_CSV_ROWS_0_TO_4 });
    expect(sweep).not.toBeNull();
    expect(sweep!.F).toHaveLength(5);
    expect(sweep!.F[4]).toBe(0.8);
  });
});

// ---- findOperatingPoint -----------------------------------------------------

describe("findOperatingPoint -- the derived-in-view crossing", () => {
  const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": WITNESS_CSV })!;

  it("brackets the witness crossing between F = 0.9 and F = 1.0", () => {
    const op = findOperatingPoint(sweep.F, sweep.pumpDP, sweep.systemDP);
    expect(op).not.toBeNull();
    expect(op!.lowerIndex).toBe(5);
    expect(op!.upperIndex).toBe(6);
    expect(sweep.F[op!.lowerIndex]).toBe(0.9);
    expect(sweep.F[op!.upperIndex]).toBe(1);
  });

  it("pins the interpolated crossing (a view-geometry pin)", () => {
    // These two numbers are VIEW GEOMETRY, not an engine golden: they are the
    // straight-line crossing between the two bracketing engine points
    // (F 0.9: pump 79936.1 / system 68309.6; F 1.0: pump 71942.4 /
    // system 80054), computed once with this module and pinned as observed.
    // The engine computed the four bracketing numbers; the line between them
    // is the view's.  A moved pin means the view's interpolation changed,
    // never that the engine's sweep did.
    const op = findOperatingPoint(sweep.F, sweep.pumpDP, sweep.systemDP)!;
    expect(op.F).toBeCloseTo(0.9589038458615571, 9);
    expect(op.dP).toBeCloseTo(75227.50327336471, 9);
    // The crossing is the same point on BOTH lines: interpolating the system
    // column at the same parameter lands on the same pressure.
    const t = (op.F - 0.9) / (1.0 - 0.9);
    const systemAtT = 68309.6 + t * (80054 - 68309.6);
    expect(systemAtT).toBeCloseTo(op.dP, 6);
  });

  it("returns the exact grid point when the crossing sits on one", () => {
    const op = findOperatingPoint([1, 2, 3], [5, 4, 3], [3, 4, 5]);
    expect(op).not.toBeNull();
    expect(op!.lowerIndex).toBe(1);
    expect(op!.upperIndex).toBe(1);
    expect(op!.F).toBe(2);
    expect(op!.dP).toBe(4);
  });

  it("finds NO crossing in the truncated 0..4 window -- and never extrapolates", () => {
    const sub = findPumpSystemSweep({ "sweep.csv": WITNESS_CSV_ROWS_0_TO_4 })!;
    // Pump sits above the system demand at every point in this window; the
    // real crossing (near F = 0.959) is OUTSIDE it, and the answer is null,
    // never an extrapolated guess.
    expect(findOperatingPoint(sub.F, sub.pumpDP, sub.systemDP)).toBeNull();
  });
});

// ---- classifyPumpCharacteristic ---------------------------------------------

describe("classifyPumpCharacteristic -- the honesty classifier", () => {
  it("calls a synthetic flat column flat-by-spec", () => {
    expect(classifyPumpCharacteristic([250000, 250000, 250000, 250000]))
      .toBe("flat-by-spec");
  });

  it("stays flat-by-spec under float jitter below the relative band", () => {
    const base = 250000;
    const jitter = base * FLAT_REL_TOL * 0.1;
    expect(classifyPumpCharacteristic([base, base + jitter, base - jitter]))
      .toBe("flat-by-spec");
  });

  it("calls the witness's falling column constant-power", () => {
    const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": WITNESS_CSV })!;
    expect(classifyPumpCharacteristic(sweep.pumpDP)).toBe("constant-power");
  });
});

// ---- The module-source honesty scan -----------------------------------------

describe("the module source carries the honesty annotations", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)),
      "../src/ui/methods/PumpSystemTool.tsx"),
    "utf8");

  it("never presents either curve as a manufacturer's -- the caveat is present", () => {
    expect(src).toContain("not a manufacturer");
  });

  it("labels the interpolated crossing as derived in view", () => {
    expect(src).toContain("derived in view");
  });

  it("says plainly when there is no crossing in the window", () => {
    expect(src).toContain("no crossing inside the swept window");
  });
});
