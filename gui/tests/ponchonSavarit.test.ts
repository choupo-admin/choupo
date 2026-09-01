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
  THE NEGATIVE THAT DID NOT EXIST.
  `case/ponchonSavarit.ts` shipped with no test at all, and the defect it
  carried was invisible for the reason such defects usually are: the witness
  is ethanol/water, whose vapour enthalpy curve is nearly FLAT between
  x_D = 0.66 and the vapour in equilibrium with it (y = 0.7291), so reading
  the wrong one moved Delta_D by 0.72 kJ/mol out of a 54 kJ/mol lever arm.
  Plausible, small, and wrong.
  So the fixture below is deliberately NOT ethanol/water: its vapour curve is
  steep, which makes the two lookups disagree by an amount no rounding hides.
  A fixture chosen to resemble the shipped case would have passed on both the
  right code and the wrong.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  readHxy, hAt, vapourEnthalpyAt, deltaD, leverLV,
} from "../src/case/ponchonSavarit.js";

//  x1, y1, T, h_liquid, H_vapour.  H rises steeply with y so that H(y = x_D)
//  and H(y = y_eq(x_D)) are far apart.
const CSV = [
  "x1,y1,T_K,h_liquid_J_per_mol,H_vapour_J_per_mol,role,status",
  "0.0,0.0,380,-100000,-40000,bubble,ok",
  "0.2,0.4,370,-98000,-36000,bubble,ok",
  "0.4,0.6,360,-96000,-34000,bubble,ok",
  "0.6,0.8,350,-94000,-32000,bubble,ok",
  "0.8,0.9,345,-92000,-31000,bubble,ok",
  "1.0,1.0,340,-90000,-30000,bubble,ok",
  "0.5,0.7,355,-95000,-33000,dew,refused",
].join("\n");

describe("ponchon-savarit geometry", () => {
  const rows = readHxy(CSV);

  it("drops a refused row rather than bridging the gap", () => {
    expect(rows).toHaveLength(6);
    expect(rows.some((r) => r.x1 === 0.5)).toBe(false);
  });

  it("reads the VAPOUR curve at a vapour composition, not at a liquid one",
    () => {
      //  At y = 0.6 the vapour curve gives -34000 exactly (a tabulated node).
      expect(vapourEnthalpyAt(rows, 0.6)).toBeCloseTo(-34000, 6);
      //  The vapour in EQUILIBRIUM with the liquid at x = 0.6 sits at
      //  y = 0.8, where H = -32000.  If the two were ever confused again,
      //  this is the 2000 J/mol that would move.
      expect(vapourEnthalpyAt(rows, 0.8)).toBeCloseTo(-32000, 6);
      expect(vapourEnthalpyAt(rows, 0.6)).not.toBeCloseTo(
        vapourEnthalpyAt(rows, 0.8)!, 1);
    });

  it("indexes the vapour curve by y even though readHxy sorts by x", () => {
    //  readHxy's contract is x1 order; the vapour curve is a y1 curve, and a
    //  lookup that walked the array as delivered would interpolate over the
    //  wrong axis wherever y1 is not monotone in x1.
    expect(rows.map((r) => r.x1)).toEqual([...rows.map((r) => r.x1)].sort(
      (a, b) => a - b));
    expect(vapourEnthalpyAt(rows, 0.9)).toBeCloseTo(-31000, 6);
  });

  it("places the difference point for a TOTAL condenser (y_1 = x_D)", () => {
    const xD = 0.6, R = 1.0;
    const hD = hAt(rows, xD)!;             // -94000
    const H1 = vapourEnthalpyAt(rows, xD)!; // -34000, the vapour AT x_D
    const d = deltaD(rows, xD, R)!;
    expect(hD).toBeCloseTo(-94000, 6);
    expect(H1).toBeCloseTo(-34000, 6);
    expect(d.x).toBeCloseTo(xD, 12);
    expect(d.y).toBeCloseTo(hD + (R + 1) * (H1 - hD), 6);   // --> +26000
    //  THE PARTIAL-CONDENSER ANSWER IS 4000 J/mol AWAY, and this is the
    //  assertion that would have caught the shipped defect.
    const wrong = hAt(rows, xD)! + (R + 1) * (-32000 - hD);
    expect(Math.abs(d.y - wrong)).toBeGreaterThan(3000);
  });

  it("keeps Delta_D above the vapour curve, and further with more reflux",
    () => {
      const a = deltaD(rows, 0.6, 0.5)!.y;
      const b = deltaD(rows, 0.6, 2.0)!.y;
      expect(a).toBeGreaterThan(vapourEnthalpyAt(rows, 0.6)!);
      expect(b).toBeGreaterThan(a);
    });

  it("the lever readback is an IDENTITY, and the test says so out loud",
    () => {
      //  Pinning the identity is the point: it documents that this number
      //  cannot detect a wrong H_1, which is precisely what the page used to
      //  claim it could.  Both H's below give R/(R+1).
      const xD = 0.6, R = 0.25;
      const d = deltaD(rows, xD, R)!;
      const h = hAt(rows, xD)!;
      const right = leverLV(d, vapourEnthalpyAt(rows, xD)!, h)!;
      expect(right).toBeCloseTo(R / (R + 1), 12);
      //  ... and with the WRONG enthalpy the difference point was built
      //  from, the same identity still returns R/(R+1).  A readback that
      //  survives its own defect is not a check.
      const dWrong = { x: xD, y: h + (R + 1) * (-32000 - h) };
      expect(leverLV(dWrong, -32000, h)!).toBeCloseTo(R / (R + 1), 12);
    });
});
