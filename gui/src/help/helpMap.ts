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

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Context-sensitive help map.  F1 resolves the current Choupo context (the
  selected unit's type, else the active workspace) to a guide + a PDF named
  destination, and opens the guide AT that section.

  THE SINGLE SOURCE OF TRUTH IS THE TRACKED FILE `docs/help-index.json`.
  This module is a thin, typed reader over it: it builds the lookup tables and
  the deep-link URL, nothing more.  To add or move a help target, edit the
  JSON -- not this file.

  The anchors in that JSON are REAL `\label{...}` destinations in the LaTeX
  guides (the preamble sets `destlabel=true`, so each `\label{ch:x}` becomes a
  PDF named destination reachable via `theoryGuide.pdf#nameddest=ch:x`).  Only
  labels that actually exist in a .tex are used -- where a context has no
  dedicated section it maps to the CLOSEST real chapter.  Do NOT add an anchor
  the .tex does not define (a CI check parses the JSON against the guides).
\*---------------------------------------------------------------------------*/

// The tracked index.  Imported as a JSON module (resolveJsonModule is on); the
// bundler inlines it, so the GUI ships the map with no runtime fetch.
import helpIndex from "../../../docs/help-index.json";

export type GuideKey = "theory" | "user" | "props" | "developer";

export interface HelpTarget {
  guide: GuideKey;
  /** A PDF named destination (`\label` name).  Omitted => open at the top. */
  anchor?: string;
  /** Human-readable section title (for the Help-topics panel). */
  title?: string;
}

/** One entry in the flat, panel-facing topics list. */
export interface HelpTopic extends HelpTarget {
  /** Lookup key (unit-op type, workspace name, or algorithm id). */
  id: string;
  /** Which bucket it came from -- groups the panel. */
  group: "Unit operations" | "Workspaces" | "Algorithms & solvers";
}

interface RawTarget { guide: string; anchor?: string; title?: string }
interface RawIndex {
  guides: Record<GuideKey, string>;
  default: RawTarget;
  units: Record<string, RawTarget>;
  workspaces: Record<string, RawTarget>;
  algorithms: Record<string, RawTarget>;
}
const IDX = helpIndex as unknown as RawIndex;

const toTarget = (r: RawTarget): HelpTarget => ({
  guide: r.guide as GuideKey,
  anchor: r.anchor,
  title: r.title,
});

/** Unit-op `type` (the schema name) -> the guide section that derives it. */
export const UNIT_HELP: Record<string, HelpTarget> = Object.fromEntries(
  Object.entries(IDX.units).map(([k, v]) => [k, toTarget(v)]),
);

/** Active workspace -> the guide section that explains it. */
export const WORKSPACE_HELP: Record<string, HelpTarget> = Object.fromEntries(
  Object.entries(IDX.workspaces).map(([k, v]) => [k, toTarget(v)]),
);

/** Algorithm / solver id -> the chapter that derives it (panel-only). */
export const ALGORITHM_HELP: Record<string, HelpTarget> = Object.fromEntries(
  Object.entries(IDX.algorithms).map(([k, v]) => [k, toTarget(v)]),
);

/** When nothing more specific applies. */
export const DEFAULT_HELP: HelpTarget = toTarget(IDX.default);

/** The whole index flattened for the Help-topics panel (viewer, not editor). */
export const HELP_TOPICS: HelpTopic[] = [
  ...Object.entries(IDX.units).map(
    ([id, v]) => ({ id, group: "Unit operations" as const, ...toTarget(v) }),
  ),
  ...Object.entries(IDX.workspaces).map(
    ([id, v]) => ({ id, group: "Workspaces" as const, ...toTarget(v) }),
  ),
  ...Object.entries(IDX.algorithms).map(
    ([id, v]) => ({ id, group: "Algorithms & solvers" as const, ...toTarget(v) }),
  ),
];

const GUIDE_FILE: Record<GuideKey, string> = IDX.guides;

/** The browser URL that opens a guide at its section (PDF named destination). */
export function helpUrl(target: HelpTarget, baseUrl: string): string {
  const file = GUIDE_FILE[target.guide];
  const dest = target.anchor ? `#nameddest=${target.anchor}` : "";
  return `${baseUrl}docs/${file}${dest}`;
}

/** Resolve the current context to a help target.
 *  Priority: a selected unit's type, then the active workspace, then default. */
export function resolveHelp(args: {
  selectedUnitType?: string | null;
  activeWorkspace?: string | null;
}): HelpTarget {
  if (args.selectedUnitType && UNIT_HELP[args.selectedUnitType]) {
    return UNIT_HELP[args.selectedUnitType]!;
  }
  if (args.activeWorkspace && WORKSPACE_HELP[args.activeWorkspace]) {
    return WORKSPACE_HELP[args.activeWorkspace]!;
  }
  return DEFAULT_HELP;
}
