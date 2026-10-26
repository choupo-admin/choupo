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
  closureByConstruction -- the engine's `closuresByConstruction` records,
  grouped for the balance surfaces (DEV.md 4c C174).

  A closure by construction is a unit term computed AS THE REMAINDER of the
  unit's own balance -- the distillation column's reboiler duty is
  dH - Q_condenser -- so that balance closes over the unit whatever the other
  terms are, and its closure is NOT evidence that they are right.  The engine
  decides which terms those are and whether the unit's second route verifies
  them (src/result/ClosureVariable.H); this module only FILTERS and COUNTS
  its records for one balance and words them.  It computes no gap, applies no
  tolerance and infers nothing from a KPI: a result that carries no record
  draws nothing, which keeps the silence meaning "no unit computed a term
  from its own balance".
\*---------------------------------------------------------------------------*/

import type { ClosureByConstruction } from "../adapters/SolverAdapter.js";

export interface ClosureWords {
  /** Every record of this balance, in the engine's order. */
  records: ClosureByConstruction[];
  /** Those the unit's second route did NOT verify. */
  notVerified: ClosureByConstruction[];
  /** One line for the band, or "" when there is nothing to say. */
  summary: string;
}

/** The engine's records of one balance (`energy` | `material` | `element`). */
export function closureWords(
  all: readonly ClosureByConstruction[] | undefined,
  balance: string,
): ClosureWords {
  const records = (all ?? []).filter((c) => c.balance === balance);
  const notVerified = records.filter((c) => c.status !== "verified");
  if (records.length === 0) return { records, notVerified, summary: "" };
  const nV = records.length - notVerified.length;
  const summary =
    `${records.length} closure${records.length === 1 ? "" : "s"} by construction`
    + (notVerified.length > 0
      ? ` · ${notVerified.length} NOT verified`
      : "")
    + (nV > 0 ? ` · ${nV} verified by a second route` : "");
  return { records, notVerified, summary };
}

/** The word for one unit's term, as the engine published it, or undefined
 *  when the unit computed no term of this balance from the balance itself. */
export function closureWordOf(
  all: readonly ClosureByConstruction[] | undefined,
  unit: string,
  variable: string,
): "verified" | "notVerified" | undefined {
  const c = (all ?? []).find((r) => r.unit === unit && r.variable === variable);
  if (!c) return undefined;
  return c.status === "verified" ? "verified" : "notVerified";
}

/** The tooltip line for one record, the engine's own words. */
export function closureLine(c: ClosureByConstruction): string {
  return `${c.unit} · ${c.variable}: ${c.rule}.  It cannot see ${c.blindTo}.  `
    + (c.status === "verified"
      ? `Verified by a second route: ${c.check}.`
      : `NOT verified${c.note ? ` — ${c.note}` : ""}.`);
}
