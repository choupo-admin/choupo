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
  selectionLink -- the compound SET as an ADDRESS, one home for both sides.

  WHY IT EXISTS.  The Compounds tab picks components; the Explore tab plots
  them.  Two tabs, and `one tab, one thing` (docs/design/one-tab-one-thing.md,
  Vítor 2026-08-17) is explicit that a tab must not depend on state its own
  address does not name -- that is the rule that decoupled the EduTools from
  the flowsheet, for the reason that a teaching surface whose answer depends on
  what happens to be open elsewhere is not stable.  So the SET travels in the
  URL, not in a shared store and not in localStorage:

      ?workspace=properties&components=water,ethanol

  Three things fall out, and the third is the one that matters to a class:
  the Explore tab is still reachable with NO components (the catalogue is a
  door, not a gate -- the setup-wizard the credo §5 forbids); a reload keeps
  the exploration; and a professor can paste the link.

  ONE HOME, TWO CALLERS: the writer (the Compounds tab's button) and the
  reader (ExploreWorkspace's seed) share this file rather than each spelling
  the parameter out.  A second spelling of a wire format is the arity sin with
  a deadline -- the day one side adds a name-encoding rule the other does not.

  Names are passed through VERBATIM: the catalogue resolves `components/<name>.dat`
  by exact name, so this file must not lowercase, trim inner spaces, or
  "correct" anything.  It splits on commas, drops empties and duplicates, and
  stops there.  Whether a name RESOLVES is the reader's question, and the
  reader must say so rather than dropping it silently.
\*---------------------------------------------------------------------------*/

/** Empties and duplicates out, first-seen order kept, names otherwise
 *  untouched.  A PURE list operation on names that are already names.
 *
 *  It is deliberately NOT `componentsInSearch` applied to a joined string, and
 *  that mistake lasted exactly one test: the writer below fed it
 *  `"components=ethyl acetate,a&b"`, `URLSearchParams` read the `&` as the next
 *  parameter, and the link came out naming `a` -- a component quietly renamed
 *  on its way into a URL.  Decoding belongs to the reader; cleaning belongs to
 *  both; they are not the same step and must not share a code path. */
function cleanNames(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const piece of names) {
    const name = piece.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The component names an Explore URL carries, in the order given, without
 *  duplicates.  `[]` for a URL that names none -- which is a legitimate
 *  address, not an error. */
export function componentsInSearch(search: string): string[] {
  const raw = new URLSearchParams(search).get("components");
  return raw ? cleanNames(raw.split(",")) : [];
}

/** The address of the property surfaces for this SET.  With no names it is
 *  the bare surfaces tab, which is exactly right: the door, opened empty.
 *
 *  `?workspace=properties`, not `?workspace=explore`: since 2026-09-03 the
 *  latter is the explorer's LANDING (where compounds are chosen), on the
 *  owner's clarification.  `?workspace=explore&components=…` still reaches the
 *  surfaces -- see bootWorkspace -- so the links this file emitted before the
 *  change keep working. */
export function propertiesLink(names: readonly string[]): string {
  const clean = cleanNames(names);
  return clean.length
    ? `?workspace=properties&components=${clean.map(encodeURIComponent).join(",")}`
    : "?workspace=properties";
}
