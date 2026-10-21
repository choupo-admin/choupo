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

  WHY IT EXISTS.  The Explore tab picks components (its Catalogue view) and
  plots them (its Surfaces view).  `one tab, one thing` (docs/design/
  one-tab-one-thing.md, Vítor 2026-08-17) is explicit that a tab must not
  depend on state its own address does not name -- that is the rule that
  decoupled the EduTools from the flowsheet, for the reason that a teaching
  surface whose answer depends on what happens to be open elsewhere is not
  stable.  So the SET and the VIEW travel in the URL, not in a shared store
  and not in localStorage:

      ?workspace=explore&view=surfaces&components=water,ethanol

  Three things fall out, and the third is the one that matters to a class:
  the surfaces are reachable with NO components (the catalogue is a door, not
  a gate -- the setup-wizard the credo §5 forbids); a reload keeps the
  exploration; and a professor can paste the link.

  ONE TAB SINCE 2026-10-21 (DEV.md 4c C116).  Until then the catalogue and the
  surfaces were two tabs and this file carried the hand-over between them;
  they are two VIEWS of one tab now, switched in place, and the address is
  rewritten in place as the set or the view changes.

  ONE HOME, TWO CALLERS: the writer (`exploreLink`, and the screen's own
  in-place rewrite) and the reader (ExploreWorkspace's seed) share this file
  rather than each spelling the parameter out.  A second spelling of a wire format is the arity sin with
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

/** The Explore tab's two views, the view an address names, and the address
 *  of a view with a set (2026-10-21, C116).  `?workspace=properties`, the
 *  surfaces' own word from 2026-09-03 until then, is a redirect in
 *  state/workspaceUrl.ts, so every link this file emitted before keeps
 *  working and the bar is rewritten to the one word. */
/** The two views of the Explore tab. */
export type ExploreView = "catalogue" | "surfaces";

/** The Explorer Guide section F1 opens on the CATALOGUE view (a real
 *  `\label` in docs/explorerGuide.tex; tests/exploreView.test.ts holds the
 *  two together).  The SURFACES answer with the active lens's Theory Guide
 *  section instead (case/exploreTheory.ts). */
export const EXPLORER_GUIDE_CATALOGUE = "sec:explorer-catalogue";

/** The view an Explore address asks for.  ABSENT, it is decided by the set:
 *  an address carrying `components=` opens the SURFACES (that is what every
 *  set-carrying Explore link opened before the views were one tab, and a
 *  bookmark must keep meaning what it meant), an address without one opens
 *  the CATALOGUE (where a student who does not yet know what to plot starts).
 *  An unknown word reads as absent rather than as an error: the router has
 *  already chosen the screen, and a typo in a view must not cost the set. */
export function exploreViewInSearch(search: string): ExploreView {
  const q = new URLSearchParams(search);
  const raw = q.get("view");
  if (raw === "catalogue" || raw === "surfaces") return raw;
  return q.has("components") && componentsInSearch(search).length > 0 ? "surfaces" : "catalogue";
}

/** The address of the Explore tab on `view` with this set.  An empty set is
 *  a legitimate address on either view (the door, not the gate). */
export function exploreLink(names: readonly string[], view: ExploreView = "surfaces"): string {
  const clean = cleanNames(names);
  const set = clean.length ? `&components=${clean.map(encodeURIComponent).join(",")}` : "";
  return `?workspace=explore&view=${view}${set}`;
}

// ---- the LENS and the Evidence view's selection, in the same address -------
//
//  `?workspace=explore&view=surfaces&components=methanol,water&lens=evidence
//   &datasets=<id>,<id>&models=<candidateId>,...`  (DEV.md 4c C117, C116)
//
//  A professor pastes it; a student lands on the SAME picture.  `lens` names
//  a PlotKind and is honoured only where the view applies to the set (the
//  reader decides that, as it decides whether a component resolves); the two
//  lists are the Evidence view's checkboxes, ids verbatim (a dataset's
//  filename stem; a candidate's `model@tier` id).  Absent lists mean "all"
//  -- the view's own default -- so the short form of the link is the
//  common one.  Every address written BEFORE these keys existed still reads
//  exactly as it did: an absent `lens` boots the class default.

/** The lens an Explore URL asks for, or null. */
export function lensInSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("lens");
  return raw && raw.trim() ? raw.trim() : null;
}

/** The Evidence view's selected datasets and candidate models, as the URL
 *  spells them: `null` for a key that is absent ("all"), `[]` for one that is
 *  present and empty ("none") -- the two are different requests. */
export function evidenceSelectionInSearch(search: string): {
  datasets: string[] | null; models: string[] | null;
} {
  const q = new URLSearchParams(search);
  const read = (key: string): string[] | null => {
    const raw = q.get(key);
    return raw === null ? null : cleanNames(raw.split(","));
  };
  return { datasets: read("datasets"), models: read("models") };
}

/** The Evidence view's address for this set and selection.  Lists are
 *  written as given (an empty list writes an empty key, meaning "none"). */
export function evidenceLink(names: readonly string[],
                             datasets: readonly string[],
                             models: readonly string[]): string {
  const q = new URLSearchParams();
  q.set("workspace", "explore");
  q.set("view", "surfaces");
  q.set("components", cleanNames(names).join(","));
  q.set("lens", "evidence");
  q.set("datasets", cleanNames(datasets).join(","));
  q.set("models", cleanNames(models).join(","));
  //  URLSearchParams spells a comma as %2C and the candidate ids' `@` as %40;
  //  both are legal raw in a query string, the names carry neither, and a
  //  readable link is the point of writing one.
  return `?${q.toString().replace(/%2C/g, ",").replace(/%40/g, "@")}`;
}
