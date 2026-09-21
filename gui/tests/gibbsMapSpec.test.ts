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
  gibbsMapSpec — is an equilibrium map a question this selection can be ASKED?

  WHAT THIS GATE CLAIMS, and what it does not.  It pins the GATE, not the
  physics: that the Explorer offers the `gibbsmap` lens exactly where the
  engine op will accept the question, and nowhere else.  It says nothing about
  whether the resulting map is RIGHT — that is the op's own business.

  THE FAILURE IT WAS WRITTEN AGAINST (2026-09-20 audit, measured natively with
  choupoProps on the case the Explorer synthesizes):

    benzene + toluene   REFUSED   "gibbsMap: need more species than elements"
    ethanol + water     REFUSED   idem
    water + NaCl        REFUSED   idem
    N2 + H2 + NH3       ran, 626 rows

  and `viewsFor` offered the lens for ALL FOUR, because its gate was
  `if (n >= 2)` before any class test.  So every binary in the catalogue
  carried a lens whose only possible outcome was a red error, with a toolbar
  that overflowed the window behind it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE, metaByName } from "../src/case/catalogue.js";
import { gibbsMapApplies, gibbsMapAtoms, parseFormulaAtoms } from "../src/case/gibbsMapSpec.js";

const applies = (sel: string[]) => gibbsMapApplies(sel, CATALOGUE);

describe("gibbsMapApplies — the engine's own criterion, in the strip's gate", () => {
  it("REFUSES every selection the engine refused, and accepts the one it ran", () => {
    expect(applies(["benzene", "toluene"])).toBe(false);
    expect(applies(["ethanol", "water"])).toBe(false);
    expect(applies(["water", "NaCl"])).toBe(false);
    expect(applies(["N2", "H2", "NH3"])).toBe(true);
  });

  it("the count it compares is the ENGINE's: species vs ELEMENTS", () => {
    //  N2 + H2 + NH3 spans {H, N}: 3 species, 2 elements -> a reaction exists.
    const a = gibbsMapAtoms(["N2", "H2", "NH3"], CATALOGUE);
    expect(a.elements).toEqual(["H", "N"]);
    expect(a.species.map((s) => s.name)).toEqual(["N2", "H2", "NH3"]);
    //  the matrix is the one a student would write into a gibbsReactor dict
    expect(a.species.find((s) => s.name === "NH3")!.atoms).toEqual([3, 1]);
    expect(a.species.find((s) => s.name === "N2")!.atoms).toEqual([0, 2]);
    //  benzene + toluene spans {C, H}: 2 species, 2 elements -> no freedom.
    expect(gibbsMapAtoms(["benzene", "toluene"], CATALOGUE).elements).toEqual(["C", "H"]);
  });

  it("a single component is never a map, whatever its formula", () => {
    expect(applies(["NH3"])).toBe(false);
    expect(applies([])).toBe(false);
  });

  it("a species with NO formation datum is refused, read off the record", () => {
    //  NaCl is the catalogue's own example and says so in its own header: the
    //  salt's solid enthalpy is ion-derived at build time, so the record
    //  deliberately carries no standardThermochemistry.  The Gibbs minimiser
    //  prices on that datum, so there is nothing to price it with.
    expect(metaByName("NaCl", CATALOGUE)!.hasThermochem).toBe(false);
    expect(metaByName("NH3", CATALOGUE)!.hasThermochem).toBe(true);
    //  A selection that WOULD pass the element count but carries a species
    //  with no datum must still be refused.  Built here rather than hunted in
    //  the catalogue, so the arm cannot go blind when a record gains a block.
    const cat = [
      metaByName("N2", CATALOGUE)!,
      metaByName("H2", CATALOGUE)!,
      { ...metaByName("NH3", CATALOGUE)!, hasThermochem: false },
    ];
    expect(gibbsMapAtoms(["N2", "H2", "NH3"], cat).elements).toEqual(["H", "N"]);
    expect(gibbsMapApplies(["N2", "H2", "NH3"], cat)).toBe(false);
  });

  it("an unparseable formula is refused rather than silently contributing no atoms", () => {
    const cat = [
      metaByName("N2", CATALOGUE)!,
      metaByName("H2", CATALOGUE)!,
      { ...metaByName("NH3", CATALOGUE)!, formula: "" },
    ];
    //  Without the check, the empty formula adds no elements, the count still
    //  reads 3 > 2, and the lens is offered for a species the op cannot place
    //  in the atom matrix at all.
    expect(gibbsMapAtoms(["N2", "H2", "NH3"], cat).elements).toEqual(["H", "N"]);
    expect(gibbsMapApplies(["N2", "H2", "NH3"], cat)).toBe(false);
  });

  it("a name that is not in the catalogue at all is refused", () => {
    expect(applies(["N2", "H2", "notAComponent"])).toBe(false);
  });
});

describe("parseFormulaAtoms — arithmetic on a declared string", () => {
  it("reads element counts, one level of parentheses included", () => {
    expect(parseFormulaAtoms("NH3")).toEqual({ N: 1, H: 3 });
    expect(parseFormulaAtoms("C2H5OH")).toEqual({ C: 2, H: 6, O: 1 });
    expect(parseFormulaAtoms("Ca(OH)2")).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormulaAtoms("NaCl")).toEqual({ Na: 1, Cl: 1 });
  });

  it("returns {} rather than a guess when it cannot read the string", () => {
    expect(parseFormulaAtoms("")).toEqual({});
    expect(parseFormulaAtoms("C6H6 (benzene)")).toEqual({});
    expect(parseFormulaAtoms("2H2O")).toEqual({});     // leading digit: a gap
  });
});
