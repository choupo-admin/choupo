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
  The gibbsMap CSV reader and a PURE SOLID (2026-09-29).

  GibbsMapOp.cpp writes an `s_<solid>` column for each declared pure solid
  and for no other species.  The reader must keep that amount APART from
  the fluid mole fractions (the solid's own `x_` is zero by construction),
  and a map with no solid must parse exactly as it always did.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { parseGibbsMapCsv } from "../src/ui/plotting/gibbsMapCsv.js";

const WITH_SOLID = [
  "T_K,P_Pa,deltaT_K,converged,metric,x_CO,x_CO2,x_graphite,s_graphite",
  "700,101325,0,1,0.496,0.2,0.8,0,0.992",
  "1200,101325,0,0,nan,nan,nan,nan,nan",
].join("\n");

const NO_SOLID = [
  "T_K,P_Pa,deltaT_K,converged,metric,x_N2,x_H2,x_NH3",
  "300,100000,0,1,0.9,0.02,0.08,0.9",
].join("\n");

describe("parseGibbsMapCsv", () => {
  it("reads a solid's amount apart from the fluid mole fractions", () => {
    const d = parseGibbsMapCsv(WITH_SOLID)!;
    expect(d.solids).toEqual(["graphite"]);
    expect(d.species).toEqual(["CO", "CO2", "graphite"]);
    expect(d.cells[0]!.x["graphite"]).toBe(0);
    expect(d.cells[0]!.solid?.["graphite"]).toBeCloseTo(0.992, 12);
    expect(d.cells[1]!.converged).toBe(false);
    expect(Number.isNaN(d.cells[1]!.solid?.["graphite"] ?? 0)).toBe(true);
  });

  it("a map with no solid has no solids and no solid amounts", () => {
    const d = parseGibbsMapCsv(NO_SOLID)!;
    expect(d.solids).toEqual([]);
    expect(d.cells[0]!.solid).toEqual({});
    expect(d.cells[0]!.x["NH3"]).toBe(0.9);
  });
});
