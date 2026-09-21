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
  scanProperties — WHICH curves a property scan asks the engine for, and which
  compounds of the SET cannot answer.

  ONE RULE, ONE HOME.  The workspace had two: the spec asked for
  `<property>_<c>` for EVERY selected compound, while a separate `skipped` list
  computed exactly the compounds that could not yield it, and printed a note
  saying their curve was "not shown".  The two disagreed about what the run
  was, and the engine settled it the honest way: asking `Psat_NaCl` of a
  nonvolatile is a REFUSED CALCULATION, and a props run whose only refusal is
  its whole question fails as a whole.  So `?components=water,NaCl` opened on a
  red banner with NOTHING drawn — not even water's vapour pressure, which the
  engine would have answered — under a note claiming a single curve was merely
  absent (the note pre-dates the engine's REFUSED-CALCULATIONS posture and
  described behaviour it no longer has).

  The set of compounds that can answer is not a guess: `vleAble` is the same
  declared pair of facts the engine reads (a vaporPressure block and a Tc, role
  not nonvolatile).  So the run asks only for the curves that exist, the note
  names the rest, and the two cannot drift because they are the two halves of
  one return value.

  A MIXTURE scalar is a single curve over the whole selection and has no such
  split — there is nothing to filter and nothing to skip.
\*---------------------------------------------------------------------------*/

import { metaByName, type ComponentMeta } from "./catalogue.js";

/** The PER-COMPONENT intrinsic properties the engine resolves as
 *  `<prop>_<component>`: one curve per compound, composition irrelevant.
 *  Everything else the scan offers is a mixture scalar. */
export const PURE_PROPS = ["Psat", "Cp_liquid"];

export const isPureProp = (p: string) => PURE_PROPS.includes(p);

/** The property KEYS a scan asks for, and the selected compounds that cannot
 *  yield the chosen pure property (so no curve of theirs exists).
 *
 *  `Psat` is the only pure property the CATALOGUE can pre-check — `vleAble` is
 *  read straight off the record — so it is the only one filtered.  For any
 *  other property the engine is the authority and the keys go through
 *  unfiltered: a GUI that guessed which compounds carry a liquid-Cp
 *  correlation would be answering a question it has not read. */
export function scanPropertyKeys(
  property: string, selected: string[], catalogue: ComponentMeta[],
): { keys: string[]; skipped: string[] } {
  if (!isPureProp(property)) return { keys: [property], skipped: [] };
  if (property !== "Psat")
    return { keys: selected.map((c) => `${property}_${c}`), skipped: [] };
  const able = selected.filter((c) => metaByName(c, catalogue)?.vleAble ?? false);
  return {
    keys: able.map((c) => `${property}_${c}`),
    skipped: selected.filter((c) => !able.includes(c)),
  };
}
