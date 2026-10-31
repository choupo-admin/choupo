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
  unitAcceptance -- WHAT A UNIT ACCEPTS, AS THE ENGINE DECLARES IT (DEV.md 4c
  C188 item 5, slice C; docs/design/what-a-unit-accepts.md).

  The ONE home is each unit's `acceptance()` declaration, published by
  `choupoSolve --describe-units` and `choupoBatch --describe-units`.  The GUI
  reads gui/schemas/unitAcceptance.json, GENERATED from those two outputs by
  bin/curate/gen_unit_acceptance_docs.py -- which also renders the four lists
  (models / may pass through / refuses / needs), so this module computes
  nothing: it hands the Internals "Model" tab the generator's own sentences.
  A unit that declared no contract has no entry, and the tab shows nothing
  for it (silence keeps meaning "nothing declared").  Pure (no React).
\*---------------------------------------------------------------------------*/

import table from "../../schemas/unitAcceptance.json";

export interface UnitAcceptanceLists {
  binary: string;
  /** what the contract is judged on, in the generator's words */
  judged: string;
  rule: string;
  models: string[];
  mayPass: string[];
  refuses: string[];
  needs: string[];
}

const UNITS = (table as { units: Record<string, UnitAcceptanceLists> }).units;

/** The declared contract of a unit type, or null when it declared none. */
export function acceptanceOf(type: string): UnitAcceptanceLists | null {
  return UNITS[type] ?? null;
}

/** Every type that declared a contract. */
export function acceptanceTypes(): string[] {
  return Object.keys(UNITS).sort();
}
