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
  workspaces — the top row's ONE home: what the workspaces ARE, and which
  kind each one is.

  THE DEFECT THIS FIXES (docs/design/modes-and-views-in-the-top-row.md,
  DECIDED 2026-08-17).  The top row rendered two different kinds of thing as
  peers.  Ten of them are VIEWS OF A CASE — Flowsheet, Streams, Pinch — and
  two are MODES that need no case at all: Explore and EduTools each synthesize
  their own transient case, which is why they are the only two things a blank
  boot offers.  Collapsing the whole strip into one dropdown at 390 px was the
  right move for the WIDTH and the wrong one for the MEANING: it filed a mode
  inside a menu labelled with a view's name.

  THE ONE HOME, and the direction of derivation.  `kind` is DECLARED once per
  entry here, and everything else is derived FROM it — including the label
  sets each case type allows.  The blank-boot set used to be the hand-written
  `new Set(["Explore", EduTools])` inside MenuBar, and every other set
  hand-repeated the same two names; those were four copies of one fact, and
  the fact is now stated once and read four times.  There is no second array
  and no per-posture list: the wide row and the narrow dropdown are two
  RENDERINGS of this one lineup, filtered by a property (the design record's
  own words: "a rendering of WORKSPACES by a property, not a second array").

  WHAT WOULD FALSIFY THE SPLIT (record §6): a workspace marked `mode` whose
  availability turns out to depend on the loaded case.  The test is the one
  the code already applies and `tests/workspaceKinds.test.ts` now pins — does
  it survive a blank boot?  `allowedWorkspaceLabels` answers exactly the modes
  there, so the day a mode needs a case, that test fails rather than the split
  quietly becoming a lie.

  Pure and free of React/DOM/store imports (the `WorkspaceKey` import is
  type-only, hence erased), so the node test runner can exercise the whole
  derivation without a browser.
\*---------------------------------------------------------------------------*/

import type { WorkspaceKey } from "../state/store.js";
import { EDUTOOLS_LABEL } from "./methods/registry.js";

/** MODE: needs no case — it synthesizes its own, so it is available on a
 *  blank boot and stays visible at every viewport width.
 *  VIEW: a view OF the loaded case — it exists only while a case does, and it
 *  is what collapses into a chooser when the row cannot hold everything. */
export type WorkspaceKind = "mode" | "view";

export interface WorkspaceEntry {
  label: string;
  /** The `?workspace=` deep-link key.  `null` = the flowsheet canvas itself
   *  (activeWorkspace === null), handled by label in openWorkspace. */
  key: WorkspaceKey | null;
  kind: WorkspaceKind;
}

// Workspaces in the top menu.  Each is a top-level toggle:
//   - implemented entries (`key` truthy) flip the global activeWorkspace
//   - placeholders ({ key: null }) still show a "coming soon" notification
//     so the menu reads as the contract for what is on the way
// "Flowsheet" is the canvas itself (activeWorkspace === null); it is handled
// specially in openWorkspace (by label) so you can switch BACK from Props to
// the flowsheet symmetrically, the mirror of "Simulate process ->".
export const WORKSPACES: WorkspaceEntry[] = [
  { label: "Flowsheet", key: null,      kind: "view" },
  { label: "Props",     key: "props",   kind: "view" },   // right next to Flowsheet -- the two phases
  { label: "Explore",   key: "explore", kind: "mode" },   // interactive property scratchpad (see, then decide)
  // EduTools renders as a DROPDOWN, not a toggle button (see EduToolsMenu).
  // The label is the student-facing word; the URL key stays `methods` --
  // ?workspace=methods&tool=<id> is a deep-link contract, and a caption is not
  // a reason to break a bookmark.
  { label: EDUTOOLS_LABEL, key: "methods", kind: "mode" },
  { label: "Streams",   key: "streams",   kind: "view" },
  { label: "Variables", key: "variables", kind: "view" },
  { label: "Control",   key: "control",   kind: "view" },  // PID tuning bench (choupoCtrl + a PID)
  { label: "Plots",     key: "plots",     kind: "view" },
  { label: "Log",       key: "log",       kind: "view" },
  { label: "Case",      key: "case",      kind: "view" },
  { label: "Pinch",     key: "pinch",     kind: "view" },  // greyed until a run yields heat duties
  { label: "Reports",   key: "reports",   kind: "view" },  // utilities + global balances (post-run)
];

/** The lineup split by kind, ORDER PRESERVED within each half.  The two
 *  postures consume this same call, so a mode cannot be a mode in one and a
 *  view in the other. */
export function splitWorkspaces(workspaces: readonly WorkspaceEntry[]): {
  modes: WorkspaceEntry[];
  views: WorkspaceEntry[];
} {
  return {
    modes: workspaces.filter((w) => w.kind === "mode"),
    views: workspaces.filter((w) => w.kind === "view"),
  };
}

/** The mode labels, derived — never hand-listed.  This is what a blank boot
 *  offers and what every case type's set starts from. */
export const MODE_LABELS: ReadonlySet<string> =
  new Set(splitWorkspaces(WORKSPACES).modes.map((w) => w.label));

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
 *  shows.  Every branch starts from MODE_LABELS and adds the VIEWS that case
 *  type has — the modes are in every set BECAUSE they are modes, which is a
 *  derivation rather than four hand-repeated pairs of names.
 *    blank boot   -> the modes, and only the modes
 *    intro        -> nothing (the intro screen owns the window)
 *    choupoProps  -> Props · Plots · Log · Case       (no canvas/streams/duties)
 *    choupoSolve  -> the full steady set              (streams, variables, pinch)
 *    choupoBatch/Ctrl -> Flowsheet · Props · Plots · Log · Case
 *                        (no steady-only Streams/Variables/Pinch/Reports) */
export function allowedWorkspaceLabels(ctx: WorkspaceContext): Set<string> {
  if (!ctx.hasCase) return new Set(MODE_LABELS);
  if (ctx.showIntro) return new Set();
  const withModes = (views: string[]) => new Set([...MODE_LABELS, ...views]);
  if (ctx.isPropsCase || ctx.application === "choupoProps") {
    return withModes(["Props", "Plots", "Log", "Case"]);
  }
  if (ctx.application === "choupoBatch" || ctx.application === "choupoCtrl") {
    return withModes([
      "Flowsheet", "Props", "Plots", "Log", "Case",
      ...(ctx.hasPid ? ["Control"] : []),
    ]);
  }
  return withModes([
    "Flowsheet", "Props", "Streams", "Variables", "Plots", "Log", "Case",
    "Pinch", "Reports",
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
