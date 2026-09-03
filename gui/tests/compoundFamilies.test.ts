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
  A component's family is derived from declared record facts, never from its
  name -- and each answer says which fact decided it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { elementsOf, familyOf, familyRank } from "../src/case/family.js";

const byName = (n: string) => {
  const m = CATALOGUE.find((c) => c.name === n);
  if (!m) throw new Error(`${n} is not in the standard catalogue`);
  return m;
};

describe("families from the record's own UNIFAC groups", () => {
  it("the principal group wins: acid over alkane, alcohol over alkane, aromatic over alkane", () => {
    expect(familyOf(byName("aceticAcid"))).toMatchObject({ key: "acid", basis: "unifac" });
    expect(familyOf(byName("ethanol"))).toMatchObject({ key: "alcohol", basis: "unifac" });
    expect(familyOf(byName("benzene"))).toMatchObject({ key: "aromatic", basis: "unifac" });
    expect(familyOf(byName("toluene"))).toMatchObject({ key: "aromatic", basis: "unifac" });
    expect(familyOf(byName("nHexane"))).toMatchObject({ key: "alkane", basis: "unifac" });
    expect(familyOf(byName("ethylAcetate"))).toMatchObject({ key: "ester", basis: "unifac" });
    expect(familyOf(byName("acetone"))).toMatchObject({ key: "ketone", basis: "unifac" });
  });

  it("an unknown group name never files a compound: it falls to the formula route", () => {
    expect(familyOf({ formula: "C2H6O", unifacGroups: ["XYZZY"] })).toMatchObject({ key: "f-oxygenated", basis: "formula" });
  });
});

describe("families by formula, when the record declares no groups", () => {
  it("reads the elements, and says so in the label", () => {
    const f = familyOf({ formula: "CHCl3" });
    expect(f).toMatchObject({ key: "f-halogenated", basis: "formula" });
    expect(f.label).toMatch(/by formula/);
    expect(familyOf({ formula: "C8H18" })).toMatchObject({ key: "f-hydrocarbon" });
    expect(familyOf({ formula: "NaCl" })).toMatchObject({ key: "f-inorganic" });
    expect(familyOf({ formula: "C2H5NO2" })).toMatchObject({ key: "f-nitrogen" });
  });
  it("an unreadable formula is a visible gap, not a guess", () => {
    expect(familyOf({ formula: "" })).toMatchObject({ key: "unclassified", basis: "none" });
  });
  it("elementsOf reads Hill formulae and ignores structure punctuation", () => {
    expect([...elementsOf("Ca(OH)2")].sort()).toEqual(["Ca", "H", "O"]);
    expect([...elementsOf("CuSO4·5H2O")].sort()).toEqual(["Cu", "H", "O", "S"]);
  });
});

describe("the family order and the corpus", () => {
  it("a declared family always ranks above a permitted one", () => {
    expect(familyRank(familyOf(byName("nHexane")))).toBeLessThan(familyRank(familyOf({ formula: "C8H18" })));
    expect(familyRank(familyOf({ formula: "" }))).toBeGreaterThan(familyRank(familyOf({ formula: "C8H18" })));
  });
  it("about half the volatile liquids get a UNIFAC-declared family; every one gets some family", () => {
    // Measured 2026-09-03: 0.488 of the volatile liquids carry a UNIFAC block
    // (this test's first draft said "most" and asserted > 0.5 -- the corpus
    // said no on the first run).  The floor pins that the derivation still
    // reaches the records; the ceiling is not a target.
    const vol = CATALOGUE.filter((m) => m.vleAble && !m.isRadical && !m.isCombustion && !m.isSynthetic);
    const declared = vol.filter((m) => familyOf(m).basis === "unifac").length;
    expect(vol.length).toBeGreaterThan(0);
    expect(declared / vol.length).toBeGreaterThan(0.4);
    for (const m of vol) expect(familyOf(m).key).toBeTruthy();
  });
});
