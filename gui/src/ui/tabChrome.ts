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
  tabChrome — THE CHROME BELONGS TO WHAT THE TAB IS.

  ONE TAB, ONE THING (docs/design/one-tab-one-thing.md) made a tab one thing:
  the hub, a case, Explore, or one EduTool.  This module is the step the record
  implies and did not state — that the SHELL around that thing must be the
  shell of THAT thing.  Vítor, opening an EduTools tab on 2026-08-18: "Porque
  raio há File no menu se isto é uma tool?  Não podes gravar: é só para usar e
  aprender.  Depois volta a aparecer o help genérico, quando só devia aparecer
  um help ou F1 a remeter para a teoria deste tool!"

  It is the same shape as the mode/view split, one level up: a mode is a TAB
  and a view is a MENU ITEM (workspaces.ts) — and now a tab's KIND decides its
  chrome, in one place, read by every surface that draws a piece of it.

  WHY `File` HAD TO GO, MEASURED RATHER THAN ARGUED.  Every item in that menu
  is a CASE operation — New Case, Open Tutorial, Open Case, Reopen last,
  Duplicate Case, Reload case from disk, Download case (.zip), and the footer
  sentence "Your cases stay here in Choupo".  A tool tab HAS no case, so each
  of those items is dead or lying: the menu says a thing can be saved that has
  nothing to save.  The same holds for File's keyboard shortcuts (Ctrl+O,
  Ctrl+R, Ctrl+Shift+N) and for the "No case open" label in the top bar, which
  reports the absence of something that is not that tab's business.  So they
  ride ONE flag, `caseChrome`, and not three: the three are one decision seen
  from three surfaces, and three booleans that are always equal would be
  machinery pretending to make a decision it does not make (the argument
  workspaces.ts already made when it deleted its `kind` field).

  WHY THE HELP IS PART OF THE SAME TABLE.  `resolveHelp` maps the active
  workspace to a guide section, and `docs/help-index.json` has no `methods`
  entry — so every one of the twelve tools fell through to DEFAULT_HELP, the
  User Guide at `sec:gui`.  That is the "help genérico" in the complaint, and
  it was not a missing index entry: a tool's help target is not the WORKSPACE's
  ("EduTools"), it is the TOOL's, and the tool already declares it
  (`METHOD_TOOLS[].theory`, a real `\label{...}` in theoryGuide.tex, gated by
  tests/methodTheoryAnchors.test.ts).  `tabHelp` reads that declaration; the
  URL itself is still built by `help/guideLinks.ts` through the registry's
  `theoryUrl` — this module builds no URL of its own, which is the whole point
  of guideLinks having been consolidated from six homes to one.

  WHAT THIS DELIBERATELY DOES NOT DECIDE.  `explore` keeps the case chrome it
  has today.  Explore is also a mode with no case, so the same question applies
  to it — but it is Vítor's to answer, and answering it here by editing a table
  entry would be a decision taken by a helper on the way past.  The entry is
  marked, and the measurement is in the report that came with this change.

  Pure: no React, no store, no DOM.  The node test runner exercises the whole
  derivation, and the call sites hand it the state they already subscribe to.
\*---------------------------------------------------------------------------*/

import { helpUrl, resolveHelp } from "../help/helpMap.js";
import {
  METHOD_TOOLS, theoryUrl, type MethodToolId,
} from "./methods/registry.js";

/** What a tab IS.  Four kinds, exactly the four of one-tab-one-thing.md §1. */
export type TabKind = "hub" | "case" | "explore" | "tool";

/** The state a tab's kind is derived FROM.  Both fields are things the shell
 *  already subscribes to; nothing here reads a URL, so a test can pose any
 *  combination without a window. */
export interface TabState {
  /** `store.hasCaseOpen(tutorialName)`. */
  hasCase: boolean;
  /** `store.activeWorkspace` (null = the flowsheet canvas). */
  activeWorkspace: string | null;
}

/** What this tab IS — the ONE derivation.
 *
 *  A CASE OPEN WINS, and the tie it settles is real rather than hypothetical:
 *  `?case=<c>&workspace=methods` is a live address (bin/checkGui's own
 *  `shell+case` page uses it to walk the full control set).  That tab has a
 *  case loaded and its views in the row, so stripping its File menu would have
 *  the chrome announce "there is no case" over a case — the opposite of the
 *  rule this module exists to keep.  It is a case tab showing a tool in its
 *  body, and the chrome follows the tab.
 *
 *  The order below mirrors AppShell's own centre-region branch exactly: no
 *  case -> explore -> methods -> the hub's welcome. */
export function tabKindFor(state: TabState): TabKind {
  if (state.hasCase) return "case";
  if (state.activeWorkspace === "explore") return "explore";
  if (state.activeWorkspace === "methods") return "tool";
  return "hub";
}

/** What chrome a kind of tab carries. */
export interface TabChrome {
  /** Does this tab's chrome speak about a CASE?  ONE flag for three surfaces:
   *  MenuBar's `File` menu, the File shortcuts it binds (Ctrl+O / Ctrl+R /
   *  Ctrl+Shift+N) and the shortcut footer that advertises them, and TopBar's
   *  case-identity slot (the case name, or "No case open").
   *
   *  TRUE ON THE HUB, and that is not an oversight: the hub is where a case is
   *  OPENED from, so every File item is live there and "No case open" is the
   *  honest counterpart of "File -> Open Case…". */
  caseChrome: boolean;
  /** Which help this tab's `Help` menu and F1 answer with.
   *    "context" — the selected unit / active view, via docs/help-index.json;
   *    "tool"    — the open EduTool's own Theory-Guide section.
   *  Two values because there are two code paths.  A third value for "the hub
   *  has no context" would name no different behaviour: `resolveHelp` with
   *  nothing selected already resolves to the guide's GUI section, which is
   *  the right answer there and is reached by the same call. */
  help: "context" | "tool";
}

/** The table.  ONE home; every surface reads it, none of them re-decides.  */
export const TAB_CHROME: Record<TabKind, TabChrome> = {
  hub:     { caseChrome: true,  help: "context" },
  case:    { caseChrome: true,  help: "context" },
  // UNCHANGED DELIBERATELY — Explore is a mode with no case and the same
  // question applies to it, but it is the owner's to answer.  See the header.
  explore: { caseChrome: true,  help: "context" },
  tool:    { caseChrome: false, help: "tool"    },
};

/** The chrome for a tab in this state — the call every surface makes. */
export function tabChromeFor(state: TabState): TabChrome {
  return TAB_CHROME[tabKindFor(state)];
}

/** Where this tab's Help / F1 goes, and what the menu item that opens it says.
 *
 *  ONE function returns BOTH, because the label and the destination are one
 *  decision: an item reading "Theory: Absorption (Kremser)" that opened the
 *  User Guide's GUI chapter would be the defect this change exists to remove,
 *  and two functions branching the same way is how that drift happens. */
export interface TabHelp {
  /** The URL to open (built by help/guideLinks.ts, never here). */
  url: string;
  /** The wording of the menu item that opens it. */
  item: string;
}

export function tabHelp(args: {
  kind: TabKind;
  /** The open EduTool, when the kind is `tool` (registry.getActiveMethodTool). */
  toolId?: MethodToolId | null;
  selectedUnitType?: string | null;
  activeWorkspace?: string | null;
}): TabHelp {
  if (TAB_CHROME[args.kind].help === "tool") {
    const tool = METHOD_TOOLS.find((m) => m.id === args.toolId);
    // A tool that declares no anchor gets the GENERIC item, worded generically.
    // Claiming "this tool's theory" while opening the guide's front page is
    // exactly the lie being removed; every live tool declares one, and
    // tests/methodTheoryAnchors.test.ts is what keeps that true.
    if (tool?.theory) {
      return { url: theoryUrl(tool.theory), item: `Theory: ${tool.label}` };
    }
  }
  return {
    url: helpUrl(resolveHelp({
      selectedUnitType: args.selectedUnitType,
      activeWorkspace: args.activeWorkspace,
    })),
    item: "Help on current view",
  };
}

/** The selected unit's TYPE, which is what the context help is resolved from.
 *
 *  It lives here because both callers of `tabHelp` need it and both used to
 *  carry their own copy of these eight lines (MenuBar's Help item and
 *  AppShell's F1 handler).  Two copies of one extraction is how the two
 *  answers drift; the arguments are plain data, so this file stays pure. */
export function selectedUnitTypeIn(
  selectedNodeId: string | null,
  flowsheet: Record<string, unknown> | undefined,
): string | null {
  if (!selectedNodeId || !selectedNodeId.startsWith("unit:") || !flowsheet) return null;
  const name = selectedNodeId.slice("unit:".length);
  const units = (flowsheet["units"] ?? []) as Array<Record<string, unknown>>;
  return (units.find((u) => u["name"] === name)?.["type"] as string | undefined) ?? null;
}
