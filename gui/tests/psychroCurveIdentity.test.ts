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
  Choupo -- Copyright (C) 2026 Vítor Geraldes -- GPL-3.0-or-later

  DEFECT NAMED (third external review, 2026-11-25): `wetBulb (20.1 20.9)` gave
  two curves both named `adiabatic:20` (static_cast<int> in the CSV key) and
  the chart joined them into one line.  The engine now writes the value as
  given; the chart must keep two keys apart and round only in its legend.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { groupPsychroCurves, curveLabelNumber } from "../src/ui/plotting/psychroCurves";

describe("psychrometric chart curve identity", () => {
  const rows = [
    "T_C,Y,curve",
    "20.1,0.0150,adiabatic:20.1", "30,0.0100,adiabatic:20.1",
    "20.9,0.0160,adiabatic:20.9", "30,0.0110,adiabatic:20.9",
    "25,0.0100,adiabatic:20", "30,0.0090,adiabatic:20",
  ];
  it("keeps two decimal anchors (and an integer one) as three curves", () => {
    const g = groupPsychroCurves(rows);
    expect([...g.keys()].sort()).toEqual(["adiabatic:20", "adiabatic:20.1", "adiabatic:20.9"]);
    expect(g.get("adiabatic:20.1")!.y).toEqual([0.015, 0.01]);
    expect(g.get("adiabatic:20.9")!.y).toEqual([0.016, 0.011]);
  });
  it("rounds only the legend text", () => {
    expect(curveLabelNumber("20.123456")).toBe("20.12");
    expect(curveLabelNumber("20")).toBe("20");
    expect(curveLabelNumber("20.1")).toBe("20.1");
  });
});
