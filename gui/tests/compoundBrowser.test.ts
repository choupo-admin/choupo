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
  The compound browser reads in the student's order, not the classifier's.

  Until 2026-09-03 one list served both first-match classification and the
  display order, so the 44 combustion radicals opened the Explore browser.
  This pins the reading order (first-path substances first; the mechanism
  library, the radicals and the synthetic stand-ins last) and that the
  first-path group is derived from the `tier tutorial;` cases in the bundle.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { DISPLAY_ORDER, FIRST_PATH_COMPONENTS } from "../src/ui/explore/CompoundBrowser.js";

describe("compound browser reading order", () => {
  it("opens on the first-path substances and ends on the mechanism library", () => {
    expect(DISPLAY_ORDER[0]).toBe("firstPath");
    const at = (g: string) => DISPLAY_ORDER.indexOf(g as (typeof DISPLAY_ORDER)[number]);
    expect(at("volatiles")).toBeLessThan(at("combustion"));
    expect(at("volatiles")).toBeLessThan(at("radicals"));
    expect(at("gases25")).toBeLessThan(at("radicals"));
    expect(at("salts")).toBeLessThan(at("radicals"));
    expect(at("synthetic")).toBe(DISPLAY_ORDER.length - 1);
  });

  it("the first-path group is read off the tutorials", () => {
    expect(FIRST_PATH_COMPONENTS.size).toBeGreaterThan(0);
    // A case-local component (heatExchanger01's `hxFluid`, under its own
    // constant/components/) is declared by a first-path case and is NOT in the
    // standard catalogue: it shows in the browser's CASE list, never in this
    // group.  The first draft of this test asserted every member was
    // standard, and the corpus said otherwise on its first run.
    const names = new Set(CATALOGUE.map((m) => m.name));
    const standard = [...FIRST_PATH_COMPONENTS].filter((c) => names.has(c));
    expect(standard.length).toBeGreaterThan(0);
    for (const must of ["benzene", "toluene", "water"]) expect(FIRST_PATH_COMPONENTS.has(must)).toBe(true);
  });
});
