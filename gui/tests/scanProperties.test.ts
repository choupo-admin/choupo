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
  scanProperties — the run asks for the curves that EXIST, and names the rest.

  THE FAILURE THIS GATE WAS WRITTEN AGAINST (audit of 2026-09-20, measured
  through the native choupoProps on the case the Explorer synthesizes).  Open
  `?workspace=properties&components=water,NaCl` and do nothing:

    choupoProps did not finish: REFUSED CALCULATIONS (1)
    No vapour pressure (curve not shown): NaCl

  Two defects in four lines.  The run asked for `Psat_NaCl` of a nonvolatile,
  which the engine refuses ("property 'Psat_NaCl' produced NO value at any of
  the 60 points") and a props run whose whole question is refused fails as a
  whole — so not even WATER's vapour pressure was drawn.  And the note said
  the curve was merely "not shown", which described the pre-REFUSED-
  CALCULATIONS engine and was, by then, simply untrue.

  The two came apart because they were two homes for one fact: the spec built
  `<prop>_<c>` for EVERY selected compound while a separate list computed
  exactly the compounds that could not answer.  They are one return value now,
  and these arms pin that they stay one.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE, metaByName } from "../src/case/catalogue.js";
import { PURE_PROPS, isPureProp, scanPropertyKeys } from "../src/case/scanProperties.js";

const keys = (prop: string, sel: string[]) => scanPropertyKeys(prop, sel, CATALOGUE);

describe("scanPropertyKeys — ask only what can be answered", () => {
  it("water + NaCl asks for water's Psat alone, and names NaCl", () => {
    const r = keys("Psat", ["water", "NaCl"]);
    expect(r.keys).toEqual(["Psat_water"]);
    expect(r.skipped).toEqual(["NaCl"]);
  });

  it("the two halves PARTITION the selection — nothing is asked and named, or neither", () => {
    for (const sel of [["water", "NaCl"], ["benzene", "toluene"], ["water", "CaSO4", "ethanol"],
                       ["NaCl"], []]) {
      const r = keys("Psat", sel);
      expect(r.keys.length + r.skipped.length).toBe(sel.length);
      for (const c of r.skipped) expect(r.keys).not.toContain(`Psat_${c}`);
      for (const c of sel)
        expect(r.keys.includes(`Psat_${c}`) || r.skipped.includes(c)).toBe(true);
    }
  });

  it("the filter is the record's own declared fact, not a name list", () => {
    //  `vleAble` = a vaporPressure block AND a Tc, role not nonvolatile — the
    //  same pair of declared facts the engine reads.
    expect(metaByName("NaCl", CATALOGUE)!.vleAble).toBe(false);
    expect(metaByName("water", CATALOGUE)!.vleAble).toBe(true);
    const cat = [{ ...metaByName("water", CATALOGUE)!, vleAble: false }];
    expect(scanPropertyKeys("Psat", ["water"], cat)).toEqual({ keys: [], skipped: ["water"] });
  });

  it("an all-VLE selection is untouched — no case that works today moves", () => {
    expect(keys("Psat", ["benzene", "toluene"]))
      .toEqual({ keys: ["Psat_benzene", "Psat_toluene"], skipped: [] });
  });

  it("a MIXTURE scalar is one curve over the whole set, with nothing to skip", () => {
    expect(isPureProp("Z")).toBe(false);
    expect(keys("Z", ["water", "NaCl"])).toEqual({ keys: ["Z"], skipped: [] });
  });

  it("a pure property the CATALOGUE cannot pre-check goes through unfiltered", () => {
    //  Cp_liquid is per-component, but nothing on the record says which
    //  compounds carry a liquid-Cp correlation — so the engine is the
    //  authority and the GUI does not guess.  Stated as an arm because the
    //  asymmetry is deliberate, not an oversight.
    expect(PURE_PROPS).toContain("Cp_liquid");
    const r = keys("Cp_liquid", ["water", "NaCl"]);
    expect(r.keys).toEqual(["Cp_liquid_water", "Cp_liquid_NaCl"]);
    expect(r.skipped).toEqual([]);
  });
});
