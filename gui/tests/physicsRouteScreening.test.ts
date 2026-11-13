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
  Physics held by recomputation (route-screening page): the conversion the
  page states for the Gibbs reactor is recomputed from the witness's own
  golden rows.  A quarter of the methane burns; one half is the outlet MOLE
  FRACTION of methane.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SCREEN_SECTIONS } from "../src/ui/methods/routeScreeningLesson.js";
import { SCREEN_WITNESS } from "../src/ui/methods/RouteScreeningTool.js";

const read = (rel: string): string =>
  readFileSync(new URL(`../../tutorials/${SCREEN_WITNESS}/${rel}`, import.meta.url), "utf-8");
const EXPECTED = read("expected");
function golden(unit: string, key: string): number {
  const m = EXPECTED.match(new RegExp(`^kpi\\s+${unit}\\s+${key}\\s+(\\S+)`, "m"));
  if (!m) throw new Error(`no golden row kpi ${unit} ${key}`);
  return Number(m[1]);
}
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

describe("route screening: Gibbs conversion of methane", () => {
  it("a QUARTER burns (oxygen limits); one half is the outlet mole fraction", () => {
    const feed = read("0/feedStoichC");
    expect(feed).toMatch(/CH4\s+0\.6666666667 kmol\/h/);
    expect(feed).toMatch(/O2\s+0\.3333333333 kmol\/h/);
    const feedCH4 = 2 / 3;
    const feedO2 = 1 / 3;
    const outCH4 = golden("gibbsC", "F_out_kmol_h") * golden("gibbsC", "y_CH4");
    const conversion = 1 - outCH4 / feedCH4;
    expect(conversion).toBeCloseTo(0.2507, 3);
    // CH4 + 2 O2 -> CO2 + 2 H2O: the oxygen burns half its moles of methane.
    expect(conversion).toBeCloseTo((feedO2 / 2) / feedCH4, 2);
    expect(golden("gibbsC", "y_CH4")).toBeCloseTo(0.5, 2);
    const text = prose(SCREEN_SECTIONS.map((s) => s.body).join(" "));
    expect(text).toContain("A quarter of the methane burns");
    expect(text).not.toContain("Half the methane");
  });
});
