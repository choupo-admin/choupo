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
import { caseMolarMass, meanMolarMass } from "../src/case/caseMolarMass.js";

describe("caseMolarMass", () => {
  it("parses MW from component .dat files in rawFiles", () => {
    const raw = {
      "constant/components/water.dat": "role solvent;\nMW          18.015;\nTc 647;",
      "constant/components/sucrose.dat": "MW  342.30 ;",
      "constant/propertyData/components/N2.dat": "MW 28.0134;",
      "system/flowsheetDict": "sectors ( A );",   // ignored (not a component file)
    };
    const mw = caseMolarMass(raw);
    expect(mw.water).toBeCloseTo(18.015, 3);
    expect(mw.sucrose).toBeCloseTo(342.30, 2);
    expect(mw.N2).toBeCloseTo(28.0134, 4);
    expect(Object.keys(mw)).toHaveLength(3);
  });

  it("meanMolarMass weights by mole fraction, 0 when coverage is incomplete", () => {
    const mw = { water: 18.015, sucrose: 342.30 };
    // full coverage -> weighted mean
    expect(meanMolarMass({ water: 0.7, sucrose: 0.3 }, mw))
      .toBeCloseTo(0.7 * 18.015 + 0.3 * 342.30, 3);
    // a component whose MW is unknown leaves coverage < 1 -> 0 (honest fallback)
    expect(meanMolarMass({ water: 0.7, mystery: 0.3 }, mw)).toBe(0);
    // pure known component
    expect(meanMolarMass({ water: 1 }, mw)).toBeCloseTo(18.015, 3);
  });

  it("empty when there are no component files", () => {
    expect(caseMolarMass({ "system/controlDict": "application choupoSolve;" })).toEqual({});
    expect(caseMolarMass(undefined)).toEqual({});
  });
});
