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
  workspaces — the ONE home of what a case tab's menu carries, and (separately)
  of the MODES that are tabs of their own.

  ONE TAB, ONE THING (docs/design/one-tab-one-thing.md, DECIDED 2026-08-17 by
  Vítor, in his own words: "Eu disse que queria o EduTools, Explore e flowsheet
  a abrirem num tab novo cada um deles!  E no flowsheet eu não quero no menu
  EduTools nem Explore!").

  WHAT CHANGED HERE, AND WHY IT IS A DELETION.  This file used to declare a
  `kind` per entry — `mode` for Explore and EduTools, `view` for the rest —
  and derive from it which entries stayed visible when the row collapsed.  The
  distinction was right and it SURVIVES; what changed is where it is drawn.
  Record §6: "with modes in their own tabs there are no modes in the row to
  keep visible."  A mode is now a TAB and a view is now a MENU ITEM, so the
  distinction is STRUCTURAL — the browser draws it, in the one control every
  user on earth already understands — and a `kind` field discriminating a set
  that is always empty from a set that is always everything would be machinery
  pretending to make a decision it no longer makes.

  So `WORKSPACES` below is the case tab's menu and NOTHING else: File, its own
  views, and Help.  The two modes moved to `MODE_TABS`, which is the one home
  of their labels and their addresses, read by the hub that opens them.  They
  did not vanish and they were not hand-copied into a call site — they moved
  list, and the list they moved to is in this same file so the two halves of
  "what top-level things exist" stay side by side.

  THE COUPLING THAT MADE THIS POSSIBLE, stated because the argument turned on
  it (record §3, AMENDED the same day).  The panel that kept EduTools in the
  case menu rested on ONE fact: ten of the tools read the loaded run, so the
  in-app entry was the only way to point a tool at the student's own result.
  Vítor removed that coupling by decision — "Eu quero que o EduTools seja
  independente do flowsheet!  Não têm de comunicar!" — so the argument expires
  with it and the entry is a plain duplicate of a tab.

  THE SAME DISTINCTION, ONE LEVEL UP, lives in `ui/tabChrome.ts` (2026-08-18):
  this file says what a case tab's menu CONTAINS, that one says which tabs get
  a case menu at all, where their Help goes, and whether the top bar carries a
  case identity.  Two files because they answer two questions; neither repeats
  the other's answer.

  Pure and free of React/DOM/store imports (the `WorkspaceKey` import is
  type-only, hence erased), so the node test runner can exercise the whole
  derivation without a browser.
\*---------------------------------------------------------------------------*/

import type { WorkspaceKey } from "../state/store.js";
import { EDUTOOLS_LABEL } from "./methods/registry.js";

export interface WorkspaceEntry {
  label: string;
  /** The `?workspace=` deep-link key.  `null` = the flowsheet canvas itself
   *  (activeWorkspace === null), handled by label in openWorkspace. */
  key: WorkspaceKey | null;
}

/** A MODE: a thing that needs no case — it synthesizes its own — and is
 *  therefore its OWN TAB rather than an entry in a case tab's menu.
 *
 *  `search` is the address that IS this mode (record §1).  It is declared here
 *  rather than at the button that opens it so the hub, a future landing card
 *  and any in-app link cannot spell it three ways. */
export interface ModeTab {
  label: string;
  search: string;
  /** One line for the hub: what this tab is for. */
  blurb: string;
}

/** The modes, in the order the hub offers them.  These are NOT in WORKSPACES
 *  and must never be put back there: that is the whole decision. */
export const MODE_TABS: ModeTab[] = [
  //  TWO DOORS, NOT A SEQUENCE (Vítor, 2026-09-03).  Compounds chooses and
  //  reads records; Explore plots.  They are listed side by side, and Explore
  //  opens perfectly well with no selection, because a pair where the second
  //  is reachable only through the first is the setup wizard gui-credo §5
  //  forbids.  Compounds comes first because it is where a student who does
  //  not yet know what to plot should start -- not because it is step one.
  {
    label: "Compounds",
    search: "?workspace=compounds",
    blurb: "The catalogue: every substance by role and family, what its record "
      + "declares, and what the curation dossier says about it.",
  },
  {
    label: "Explore",
    search: "?workspace=explore",
    blurb: "Property surfaces — T-x-y, γ(x), a Psat scan — over components you pick.",
  },
  {
    // The label is the student-facing word; the URL key stays `methods`
    // (?workspace=methods&tool=<id> is a deep-link contract, and a caption is
    // not a reason to break a bookmark).
    label: EDUTOOLS_LABEL,
    search: "?workspace=methods",
    blurb: "Classical graphical constructions — McCabe-Thiele, Kremser, pinch, "
      + "psychrometrics — each fed by its own witness case.",
  },
];

// Workspaces in the top menu.  Each is a top-level toggle:
//   - implemented entries (`key` truthy) flip the global activeWorkspace
//   - placeholders ({ key: null }) still show a "coming soon" notification
//     so the menu reads as the contract for what is on the way
// "Flowsheet" is the canvas itself (activeWorkspace === null); it is handled
// specially in openWorkspace (by label) so you can switch BACK from Props to
// the flowsheet symmetrically, the mirror of "Simulate process ->".
export const WORKSPACES: WorkspaceEntry[] = [
  { label: "Flowsheet", key: null    },
  { label: "Props",     key: "props" },   // right next to Flowsheet -- the two phases
  { label: "Streams",   key: "streams"   },
  { label: "Variables", key: "variables" },
  { label: "Control",   key: "control"   },  // PID tuning bench (choupoCtrl + a PID)
  { label: "Plots",     key: "plots"     },
  { label: "Log",       key: "log"       },
  { label: "Case",      key: "case"      },
  { label: "Pinch",     key: "pinch"     },  // greyed until a run yields heat duties
  { label: "Reports",   key: "reports"   },  // utilities + global balances (post-run)
  //  "Who measured this?" -- citations from the user's private ThermoML
  //  cache (bin/choupo-thermoml sync).  A reading list, never a value.
  { label: "Literature", key: "literature" },
];

/** The labels a case tab's menu may ever carry — every WORKSPACES entry and
 *  nothing else.  Exported so a test can state the invariant that gives this
 *  file its name: no mode is in the row. */
export const VIEW_LABELS: ReadonlySet<string> =
  new Set(WORKSPACES.map((w) => w.label));

/** What the app knows about the open case when it decides the lineup. */
export interface WorkspaceContext {
  /** A case is loaded (store.hasCaseOpen). */
  hasCase: boolean;
  /** The freshly-opened-tutorial intro screen is up. */
  showIntro: boolean;
  /** A props-only case: a propsDict and no flowsheet. */
  isPropsCase: boolean;
  /** controlDict.application, when it is a string. */
  application?: string;
  /** A choupoCtrl case that actually declares a PID (no PID -> no Control). */
  hasPid: boolean;
}

/** Which workspace labels this context allows.
 *
 *  The top tabs are CONTEXT-DEPENDENT: each case TYPE exposes only the
 *  workspaces that mean something for it, so a lit-but-dead button never
 *  shows.  Every branch is now VIEWS ONLY — the modes left the row for their
 *  own tabs (MODE_TABS above), so there is nothing to add to each set.
 *    blank boot   -> NOTHING.  A tab with no case is the HUB, and the hub's
 *                    on-ramp is the WelcomeScreen's own, not a menu of views
 *                    of a case that is not there.
 *    intro        -> nothing (the intro screen owns the window)
 *    choupoProps  -> Props · Plots · Log · Case       (no canvas/streams/duties)
 *    choupoSolve  -> the full steady set              (streams, variables, pinch)
 *    choupoBatch/Ctrl -> Flowsheet · Props · Plots · Log · Case
 *                        (no steady-only Streams/Variables/Pinch/Reports) */
export function allowedWorkspaceLabels(ctx: WorkspaceContext): Set<string> {
  if (!ctx.hasCase) return new Set();
  if (ctx.showIntro) return new Set();
  if (ctx.isPropsCase || ctx.application === "choupoProps") {
    return new Set(["Props", "Plots", "Log", "Case", "Literature"]);
  }
  if (ctx.application === "choupoBatch" || ctx.application === "choupoCtrl") {
    return new Set([
      "Flowsheet", "Props", "Plots", "Log", "Case", "Literature",
      ...(ctx.hasPid ? ["Control"] : []),
    ]);
  }
  return new Set([
    "Flowsheet", "Props", "Streams", "Variables", "Plots", "Log", "Case",
    "Pinch", "Reports", "Literature",
  ]);
}

/** The lineup this context shows, in declared order. */
export function visibleWorkspacesFor(
  ctx: WorkspaceContext,
  workspaces: readonly WorkspaceEntry[] = WORKSPACES,
): WorkspaceEntry[] {
  const allowed = allowedWorkspaceLabels(ctx);
  return workspaces.filter((w) => allowed.has(w.label));
}
