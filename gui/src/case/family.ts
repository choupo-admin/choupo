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
  family -- a component's chemical FAMILY, derived from declared record facts.

  Asked for by the owner on 2026-09-03, looking at 352 volatile liquids in one
  alphabetical wall: "isto continua sem estar bem organizado".  The browser
  needs a second level under each group, and the level must come from the
  record and never from the name (ThermoResolver doctrine, CLAUDE.md §5).

  TWO DERIVATIONS, RANKED, AND EACH ANSWER SAYS WHICH ONE PRODUCED IT.
    1. `groups { unifac ( { group OH; count 1; } ... ) }` -- the functional
       groups the record itself decomposes into, read as a set of group NAMES.
       The family is the highest-priority group present: an acid before an
       ester before an aldehyde before a ketone before an alcohol ... down to
       an alkane, the same precedence a nomenclature table uses for the
       principal characteristic group.  Measured 2026-09-03: 245 of the 603
       standard records carry the block.
    2. The elemental FORMULA, for a record with no group decomposition: the
       elements present say hydrocarbon / oxygenated / nitrogen-bearing /
       sulfur-bearing / halogenated / inorganic.  Coarser, and honestly so --
       the label carries "(by formula)" so a reader can tell a family the
       record declared from one its formula merely permits.
  A record with neither is "unclassified" -- a visible gap, never a guess.

  The group vocabulary below is the one the tree actually uses (measured with
  `grep -ho "group [A-Za-z0-9=]*;" data/standards/components/*.dat`); a group
  name outside it is ignored, so a new record can only fall to the formula
  route, never into a wrong family.  Widen the table when the vocabulary
  widens.
\*---------------------------------------------------------------------------*/

export interface Family {
  /** stable key for folding state and tests */
  key: string;
  /** what the student reads */
  label: string;
  /** which record fact decided it */
  basis: "unifac" | "formula" | "none";
}

/** Principal-group precedence, highest first.  Each entry: the family, and
 *  the UNIFAC group names (as the records spell them) that place a compound
 *  in it. */
const UNIFAC_FAMILIES: { key: string; label: string; groups: string[] }[] = [
  { key: "acid",        label: "Carboxylic acids",        groups: ["COOH", "acid", "HCOOH"] },
  { key: "ester",       label: "Esters",                  groups: ["CH3COO", "CH2COO", "COO", "ester", "HCOO"] },
  { key: "aldehyde",    label: "Aldehydes",               groups: ["CHO"] },
  { key: "ketone",      label: "Ketones",                 groups: ["CH3CO", "CH2CO", "ketone"] },
  { key: "alcohol",     label: "Alcohols & phenols",      groups: ["OH", "CH3OH", "ACOH"] },
  { key: "amine",       label: "Amines & N-compounds",    groups: ["CH3NH2", "CH2NH2", "CHNH2", "CH3NH", "CH2NH", "CHNH", "CH3N", "CH2N", "ACNH2", "pyridine", "C5H5N", "C5H4N", "C5H3N", "CCN", "CH3CN", "CH2CN", "CONH2", "CONHCH3", "CON(CH3)2", "NO2", "ACNO2", "CH3NO2"] },
  { key: "ether",       label: "Ethers",                  groups: ["CH3O", "CH2O", "CHO-", "ether", "etherRing", "THF", "FCH2O"] },
  { key: "halogenated", label: "Halogenated",             groups: ["F", "Cl", "Br", "I", "CF3", "CF2", "CF", "CH2Cl", "CHCl", "CCl", "CH2Cl2", "CHCl2", "CCl2", "CHCl3", "CCl3", "CCl4", "ACCl", "ACF"] },
  { key: "sulfur",      label: "Sulfur compounds",        groups: ["CS2", "CH3SH", "CH2SH", "DMSO", "CH3S", "CH2S", "CHS", "thiophene"] },
  { key: "aromatic",    label: "Aromatics",               groups: ["ACH", "AC", "ACCH3", "ACCH2", "ACCH", "arCH", "arC"] },
  { key: "alkene",      label: "Alkenes & alkynes",       groups: ["CH2=CH", "CH=CH", "CH2=C", "CH=C", "C=C", "yneCH", "yneC", "eCH", "eCH2", "eC"] },
  { key: "alkane",      label: "Alkanes & cycloalkanes",  groups: ["CH3", "CH2", "CH", "C", "rCH2", "rCH", "rC"] },
  { key: "water",       label: "Water",                   groups: ["H2O"] },
];

const GROUP_TO_FAMILY: Map<string, { key: string; label: string; rank: number }> = new Map();
UNIFAC_FAMILIES.forEach((f, rank) => {
  for (const g of f.groups) if (!GROUP_TO_FAMILY.has(g)) GROUP_TO_FAMILY.set(g, { key: f.key, label: f.label, rank });
});

/** The elements of a Hill-style formula ("C2H6O", "NaCl", "CaCO3"); a formula
 *  the regex cannot read yields an empty set, which routes to "unclassified". */
export function elementsOf(formula: string): Set<string> {
  const out = new Set<string>();
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  const clean = formula.replace(/[()\[\]·.\s-]/g, "");
  while ((m = re.exec(clean)) !== null) out.add(m[1]!);
  return out;
}

const HALOGENS = ["F", "Cl", "Br", "I"];

export function familyOf(meta: { formula: string; unifacGroups?: readonly string[] }): Family {
  const groups = meta.unifacGroups ?? [];
  let best: { key: string; label: string; rank: number } | null = null;
  for (const g of groups) {
    const f = GROUP_TO_FAMILY.get(g);
    if (f && (!best || f.rank < best.rank)) best = f;
  }
  if (best) return { key: best.key, label: best.label, basis: "unifac" };

  const el = elementsOf(meta.formula);
  //  MEASURED 2026-09-03, the day the tree first drew: 356 of the 603 standard
  //  records declare NO `formula` at all (the ChemSep import never wrote one),
  //  and 164 of those carry no UNIFAC block either -- 151 of them volatile
  //  liquids.  The label says exactly what is missing, because it is a
  //  curation gap and not a classification failure: a record with no formula
  //  is also one the element balance refuses by name.
  if (el.size === 0) return { key: "unclassified", label: "No formula declared in the record", basis: "none" };
  const has = (e: string) => el.has(e);
  const hasC = has("C"), hasH = has("H");
  const byFormula = (key: string, label: string): Family => ({ key: `f-${key}`, label: `${label} (by formula)`, basis: "formula" });
  if (!hasC) return byFormula("inorganic", "Inorganic");
  if (HALOGENS.some(has)) return byFormula("halogenated", "Halogenated");
  if (has("S")) return byFormula("sulfur", "Sulfur compounds");
  if (has("N")) return byFormula("nitrogen", "Nitrogen compounds");
  if (has("O")) return byFormula("oxygenated", "Oxygenated");
  if (hasH) return byFormula("hydrocarbon", "Hydrocarbons");
  return byFormula("carbon", "Carbon");
}

/** Display order of families: the UNIFAC table's order, then the formula
 *  families, then unclassified -- so a declared family always reads above a
 *  permitted one. */
export function familyRank(f: Family): number {
  const i = UNIFAC_FAMILIES.findIndex((u) => u.key === f.key);
  if (i >= 0) return i;
  if (f.basis === "formula") return 100 + ["f-hydrocarbon", "f-oxygenated", "f-nitrogen", "f-sulfur", "f-halogenated", "f-inorganic", "f-carbon"].indexOf(f.key);
  return 1000;
}
