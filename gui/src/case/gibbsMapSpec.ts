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
  gibbsMapSpec — the ATOM MATRIX behind the Gibbs equilibrium map, and the ONE
  decision of whether that map is a question this selection can be ASKED.

  WHY IT EXISTS (2026-09-21).  `exploreViews.viewsFor` offered `gibbsmap` to
  EVERY selection of two or more compounds, before any class gate.  The engine
  op refuses a selection with no stoichiometric freedom by name
  (src/propertyOps/GibbsMapOp.cpp: `if (N <= M) throw "gibbsMap: need more
  species than elements"`), so on every BINARY in the catalogue the student met
  a lens whose only possible outcome was a red error — measured natively on
  benzene+toluene, ethanol+water and water+NaCl, all three REFUSED.  The
  Explorer's own rule is that an irrelevant control is REMOVED, never greyed
  and never offered to refuse.

  THE CRITERION IS THE ENGINE'S OWN, and deliberately not the more general one.
  A stoichiometric degree of freedom exists iff the atom matrix A (elements x
  species) has rank < N.  `N > #elements` is STRICTER than that — it implies it
  and is not implied by it — and the engine tests the strict form.  Gating on
  rank would therefore offer a lens the engine still refuses: NO2 / N2O4 is a
  real dissociation (rank 1 < N = 2) that `N <= M` turns away, so gating on
  rank would put the red error straight back for exactly that family.  The GUI
  asks what the ENGINE will accept, so the gate is `N > #elements`.  If the
  engine one day tests rank, this module is the one place that follows it.

  THE SECOND CONDITION IS THE DATUM.  The Gibbs minimiser prices every species
  on the ideal-gas formation rung, so a species carrying no
  `standardThermochemistry {}` block cannot be priced — NaCl is the catalogue's
  own example, and its record says so in its header (the salt's solid enthalpy
  is ion-derived at build time).  Read STRUCTURALLY off the record, never from
  a name list.

  WHAT THIS GATE CANNOT SEE, stated rather than implied: a species whose datum
  sits on a NON-gas reference rung still parses, still carries the block, and
  the run may still refuse it at the rung check.  The gate narrows the lens to
  the questions the op can be asked; it does not promise every one of them is
  answered.
\*---------------------------------------------------------------------------*/

import { metaByName, type ComponentMeta } from "./catalogue.js";

/** Parse a chemical formula ("C2H5OH", "NH3") into element counts.  Best
 *  effort: element = capital + optional lowercase, count = trailing digits;
 *  parentheses are expanded one level ("Ca(OH)2").  Unparseable -> {}.
 *
 *  Lived in ExploreWorkspace.tsx until 2026-09-21; it is arithmetic on a
 *  declared string, so it belongs beside the decision it feeds. */
export function parseFormulaAtoms(formula: string): { [el: string]: number } {
  if (!formula || /[^A-Za-z0-9()]/.test(formula)) return {};
  let f = formula;
  // expand one level of (...)n
  f = f.replace(/\(([A-Za-z0-9]+)\)(\d+)/g, (_m, grp: string, n: string) =>
    grp.repeat(parseInt(n, 10)));
  const out: { [el: string]: number } = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(f)) !== null) {
    if (m.index !== consumed) return {};        // gap -> unparseable
    consumed = m.index + m[0].length;
    const el = m[1]!;
    const n = m[2] ? parseInt(m[2], 10) : 1;
    out[el] = (out[el] ?? 0) + n;
  }
  return consumed === f.length ? out : {};
}

/** The elements x species atom matrix the `gibbsMap` op is declared with —
 *  the same numbers a student would write into a `gibbsReactor` dict.  ONE
 *  home: the gate below and the spec builder in the workspace read it, so the
 *  lens cannot be offered on one parse and run on another. */
export function gibbsMapAtoms(sel: string[], cat: ComponentMeta[]): {
  elements: string[];
  species: { name: string; atoms: number[] }[];
} {
  const parsed = sel.map((c) => ({
    name: c, atoms: parseFormulaAtoms(metaByName(c, cat)?.formula ?? ""),
  }));
  const elements = [...new Set(parsed.flatMap((p) => Object.keys(p.atoms)))].sort();
  return {
    elements,
    species: parsed.map((p) => ({
      name: p.name, atoms: elements.map((e) => p.atoms[e] ?? 0),
    })),
  };
}

/** Is an equilibrium map a question this selection can be ASKED?  True iff
 *  every formula parses, every species carries the ideal-gas formation datum
 *  the minimiser prices it with, and the species outnumber the elements (the
 *  engine's own test — see the header). */
export function gibbsMapApplies(sel: string[], cat: ComponentMeta[]): boolean {
  if (sel.length < 2) return false;
  const metas = sel.map((c) => metaByName(c, cat));
  if (metas.some((m) => !m)) return false;
  if (metas.some((m) => !(m!.hasThermochem ?? false))) return false;
  //  A formula nobody can parse contributes no atoms, and a species with no
  //  atoms makes the map a question about nothing.
  if (sel.some((c) => Object.keys(
    parseFormulaAtoms(metaByName(c, cat)?.formula ?? "")).length === 0)) return false;
  return sel.length > gibbsMapAtoms(sel, cat).elements.length;
}
