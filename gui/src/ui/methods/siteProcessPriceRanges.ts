/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  THE CITED RANGE BESIDE EACH FACTOR of "Where to build it, what to make, and
  what it sells for" (DEV.md 4c C212).

  A factor carries the range a SOURCE states, with that source, or `null`, and
  then the page says "range not cited".  No range is recalled from memory.
  The three works the page cites (Sheldon 2007, Jimenez-Gonzalez 2011, Trost
  1991) are green-chemistry metrics; none is in the literature library
  (~/Choupo-Literature, read 2026-11-19), and none states a range for a site
  weight, a margin, a tax rate or a cycle time.  So every entry is `null`
  today; the day a source is read, the entry gains its range and its source
  and the page shows it with no other change.
\*---------------------------------------------------------------------------*/

export interface FactorRange { low: number; high: number; unit: string; source: string }

export type FactorId =
  | "siteWeight" | "siteScore" | "productKg" | "limitingMol" | "productMw"
  | "reactionH" | "workupH" | "cleaningH" | "targetKg" | "stageValue" | "shelfPrice" | "exNeed";

export const FACTOR_RANGES: Readonly<Record<FactorId, FactorRange | null>> = {
  siteWeight: null, siteScore: null, productKg: null, limitingMol: null, productMw: null,
  reactionH: null, workupH: null, cleaningH: null, targetKg: null,
  stageValue: null, shelfPrice: null, exNeed: null,
};

/** The text drawn beside a factor. */
export function rangeLabel(id: FactorId): string {
  const r = FACTOR_RANGES[id];
  return r === null ? "range not cited" : `${r.low} to ${r.high} ${r.unit} (${r.source})`;
}
