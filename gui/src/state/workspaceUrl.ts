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
  workspaceUrl — ONE URL WORD PER SCREEN, and the legacy spellings translated
  at the door.

  THE DEFECT.  `?workspace=explore` opened TWO different screens depending on
  whether a query parameter that was never meant to select a screen happened
  to be present:

      ?workspace=explore                       -> the CATALOGUE
      ?workspace=explore&components=water,...  -> the PLOTS

  `components=` selects DATA (which set to plot); it was also, silently,
  selecting the SCREEN.  That is the first build's spelling of the plots
  address, kept working after the 2026-09-03 split so that no bookmark broke
  -- which was right -- but kept working SILENTLY, which was not: the address
  bar went on saying `explore` while the screen was the plots, so a student
  who copied the address copied a word that means the other screen.  Vitor
  sensed it twice as "the two tabs seem to be the same thing".  They are not;
  the split is his own ratified decision (workspaces.ts, TWO DOORS NOT A
  SEQUENCE, gui-credo 5) and is untouched here.  What was the same thing was
  the WORD.

  THE RULE.  Every address a user can see or copy carries exactly one word per
  screen:

      ?workspace=explore      the catalogue   (the explorer's LANDING)
      ?workspace=properties   the plots       (the property surfaces)
      ?workspace=methods      EduTools

  A legacy spelling is still HONOURED -- a caption is not a reason to break a
  bookmark (the precedent is `?explore=mccabe`, which still opens Methods) --
  but it is TRANSLATED ONCE, at boot, and the address bar is rewritten to the
  canonical word (`history.replaceState`, no history spam, the same mechanism
  `setActiveMethodTool` already uses).  So the inbound link works, and the
  link the student copies out is the right one.

  PURE ON PURPOSE.  `bootWorkspace` used to read `window.location` and decide
  in one breath, which made the decision untestable without a browser -- and a
  routing decision nobody can test is how a query parameter got to choose a
  screen unnoticed.  This function takes the search string and returns the
  key and, when the address was legacy, what to rewrite it to.  The store
  applies the rewrite; nothing else reads `?workspace=`.
\*---------------------------------------------------------------------------*/

import type { WorkspaceKey } from "./store.js";

export interface WorkspaceBoot {
  key: WorkspaceKey | null;
  /** When the inbound address was a LEGACY spelling: the canonical search
   *  string to rewrite the address bar to.  Null when the address already
   *  carries the right word (or names no workspace at all). */
  canonical: string | null;
}

/** Rewrite `?workspace=` to `word`, keeping every other parameter exactly as
 *  it came -- `components=`, `component=`, `case=`, whatever else the link
 *  carried is DATA and travels untouched. */
function withWorkspace(params: URLSearchParams, word: string): string {
  const out = new URLSearchParams(params);
  out.set("workspace", word);
  //  `URLSearchParams.toString()` spells a comma as `%2C`; `propertiesLink`
  //  -- the home that already knows how to spell the plots address -- joins
  //  a set with a LITERAL comma.  Both parse identically, but the rewritten
  //  bar is the link a student copies out, and two spellings of one address
  //  is how a reader concludes they are two addresses.  Match the published
  //  one.  (Seen on the page: the first rewrite produced `water%2Cethanol`.)
  return "?" + out.toString().replace(/%2C/g, ",");
}

export function resolveWorkspaceSearch(search: string): WorkspaceBoot {
  const params = new URLSearchParams(search);
  const w = params.get("workspace");

  //  THE PLOTS.  Their canonical word since 2026-09-03.
  if (w === "properties") return { key: "explore", canonical: null };

  //  THE CATALOGUE -- and the one legacy bend.  `explore` WITH a set is the
  //  first build's address for the plots; it still opens them, and the bar is
  //  rewritten so the word matches the screen.  Note `components` (plural,
  //  the set) and not `component` (singular, a record tab): the latter is a
  //  different thing carried by the same landing and must not be mistaken
  //  for a set.
  if (w === "explore") {
    return params.has("components")
      ? { key: "explore", canonical: withWorkspace(params, "properties") }
      : { key: "compounds", canonical: null };
  }

  //  `compounds` is the INTERNAL key of the catalogue, never a published
  //  address; a link carrying it is honoured and rewritten to the landing's
  //  own word, so the internal name stops leaking into bookmarks.
  if (w === "compounds") return { key: "compounds", canonical: withWorkspace(params, "explore") };

  //  The Methods workspace (2026-08-15) deep-links as
  //  ?workspace=methods&tool=<id>; the tool id is read by MethodsWorkspace.
  if (w === "methods") return { key: "methods", canonical: null };

  //  LEGACY: ?explore=mccabe WITHOUT a &key= stash was the Explorer's McCabe
  //  lens; the tool moved to Methods, so the old URL now opens Methods/mccabe.
  //  WITH &key= it is the McCabe analyzer pop-out tab, which AppShell routes
  //  before boot state matters.  No canonical here: `setActiveMethodTool`
  //  rewrites the bar the moment the tool is selected, and two writers of
  //  one address would be a second home.
  if (params.get("explore") === "mccabe" && !params.has("key"))
    return { key: "methods", canonical: null };

  //  The landing hero deep-links the Control Room on a ctrl case
  //  (?case=ctrl02_disturbance_rejection&view=control).
  const v = params.get("view");
  if (v === "control" || w === "control") return { key: "control", canonical: null };

  return { key: null, canonical: null };
}
