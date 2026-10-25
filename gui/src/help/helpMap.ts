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
  selected unit -- by the membrane transport LAW it runs, where it runs one,
  else by its type -- else the active workspace) to a guide + a PDF named
  destination, and opens the guide AT that section.

  THE SINGLE SOURCE OF TRUTH IS THE TRACKED FILE `docs/help-index.json`.
  This module is a thin, typed reader over it: it builds the lookup tables and
  the deep-link URL, nothing more.  To add or move a help target, edit the
  JSON -- not this file.  That includes WHERE a unit declares its transport
  law and which law it runs by default: the index says so per unit
  (`transport: { path, default }`), this file only follows the path.

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
import { guideUrl } from "./guideLinks.js";

export type GuideKey = "theory" | "user" | "props" | "developer" | "explorer";

export interface HelpTarget {
  guide: GuideKey;
  /** A PDF named destination (`\label` name).  Omitted => open at the top. */
  anchor?: string;
  /** Human-readable section title (for the Help-topics panel). */
  title?: string;
  /** Further sections offered BESIDE this one (the Help menu and the
   *  Help-topics panel): a model's section points at its numerical method
   *  this way, so a reader who lands on the model is one click from how it is
   *  solved.  F1 itself opens `anchor`; a see-also never replaces it. */
  seeAlso?: HelpTarget[];
}

/** One entry in the flat, panel-facing topics list. */
export interface HelpTopic extends HelpTarget {
  /** Lookup key (unit-op type, transport law, workspace name, algorithm id). */
  id: string;
  /** Which bucket it came from -- groups the panel. */
  group: "Unit operations" | "Transport models" | "Workspaces" | "Algorithms & solvers";
}

interface RawTarget { guide: string; anchor?: string; title?: string; seeAlso?: RawTarget[] }
/** Where a unit (or a props op) declares the membrane transport law it runs
 *  -- a dotted path inside its own dictionary -- and the law it runs when it
 *  declares none (the engine's `lookupWordOrDefault`). */
interface RawTransport { path: string; default: string }
interface RawUnit extends RawTarget { transport?: RawTransport }
interface RawIndex {
  guides: Record<GuideKey, string>;
  default: RawTarget;
  units: Record<string, RawUnit>;
  workspaces: Record<string, RawTarget>;
  algorithms: Record<string, RawTarget>;
  transportModels?: Record<string, RawTarget>;
}
const IDX = helpIndex as unknown as RawIndex;

const toTarget = (r: RawTarget): HelpTarget => ({
  guide: r.guide as GuideKey,
  anchor: r.anchor,
  title: r.title,
  ...(r.seeAlso && r.seeAlso.length > 0 ? { seeAlso: r.seeAlso.map(toTarget) } : {}),
});

/** Unit-op `type` (the schema name) -> the guide section that derives it. */
export const UNIT_HELP: Record<string, HelpTarget> = Object.fromEntries(
  Object.entries(IDX.units).map(([k, v]) => [k, toTarget(v)]),
);

/** Unit-op `type` -> where it declares its transport law, and its default.
 *  Only the units (and props ops) that run a membrane transport law carry
 *  one. */
export const UNIT_TRANSPORT: Record<string, { path: string; default: string }> =
  Object.fromEntries(
    Object.entries(IDX.units).flatMap(([k, v]) =>
      v.transport ? [[k, { path: v.transport.path, default: v.transport.default }]] : []),
  );

/** Membrane transport law (the word after `transport`) -> its section. */
export const TRANSPORT_HELP: Record<string, HelpTarget> = Object.fromEntries(
  Object.entries(IDX.transportModels ?? {}).map(([k, v]) => [k, toTarget(v)]),
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
  ...Object.entries(IDX.transportModels ?? {}).map(
    ([id, v]) => ({ id, group: "Transport models" as const, ...toTarget(v) }),
  ),
  ...Object.entries(IDX.workspaces).map(
    ([id, v]) => ({ id, group: "Workspaces" as const, ...toTarget(v) }),
  ),
  ...Object.entries(IDX.algorithms).map(
    ([id, v]) => ({ id, group: "Algorithms & solvers" as const, ...toTarget(v) }),
  ),
];

const GUIDE_FILE: Record<GuideKey, string> = IDX.guides;

/** The browser URL that opens a guide at its section.  The base and the
 *  viewer route both live in `guideLinks`; this only resolves guide + anchor. */
export function helpUrl(target: HelpTarget): string {
  return guideUrl(GUIDE_FILE[target.guide], target.anchor);
}

/** What F1 needs to know about a unit: its TYPE and, for a unit that runs a
 *  membrane transport law, the LAW -- read from the unit's own dictionary (as
 *  the GUI parses it: nested objects) at the path the index names.
 *
 *  A `quasiSteady` wrapper (choupoSemiContinuous) is unwrapped: the help a
 *  reader wants is the wrapped unit's, and its `unit {}` block is where the
 *  type and the operation live.  An undeclared law is the unit's default,
 *  as the engine reads it. */
export function unitHelpContext(
  unit: Record<string, unknown> | null | undefined,
): { type: string | null; transport: string | null } {
  if (!unit) return { type: null, transport: null };
  let u = unit;
  const inner = u["unit"];
  if (u["type"] === "quasiSteady" && inner && typeof inner === "object")
    u = inner as Record<string, unknown>;
  const type = typeof u["type"] === "string" ? (u["type"] as string) : null;
  if (!type) return { type: null, transport: null };
  const where = UNIT_TRANSPORT[type];
  if (!where) return { type, transport: null };
  let v: unknown = u;
  for (const key of where.path.split(".")) {
    v = v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
  }
  return { type, transport: typeof v === "string" ? v : where.default };
}

/** Resolve the current context to a help target.
 *  Priority: a selected unit -- by the transport LAW it runs, when that law
 *  is not the unit's own default and the index has a section for it; else by
 *  its type -- then the active workspace, then default.
 *
 *  WHY THE LAW BEFORE THE TYPE.  A `spiralWoundModule` with `transport
 *  DSPM-DE;` is a charged pore solved node by node; its type's section is
 *  solution-diffusion.  Resolving by the type alone sent the reader to the
 *  wrong model -- wrong help, not incomplete help (DEV.md 4c C166).  A unit
 *  running its own default law keeps its own section, which is the one
 *  written for it (the batch diafilter's, not the spiral module's). */
export function resolveHelp(args: {
  selectedUnitType?: string | null;
  /** The transport law the selected unit runs (`unitHelpContext`). */
  selectedTransport?: string | null;
  activeWorkspace?: string | null;
}): HelpTarget {
  const type = args.selectedUnitType;
  if (type && args.selectedTransport) {
    const law = TRANSPORT_HELP[args.selectedTransport];
    if (law && args.selectedTransport !== UNIT_TRANSPORT[type]?.default) return law;
  }
  if (type && UNIT_HELP[type]) {
    return UNIT_HELP[type]!;
  }
  if (args.activeWorkspace && WORKSPACE_HELP[args.activeWorkspace]) {
    return WORKSPACE_HELP[args.activeWorkspace]!;
  }
  return DEFAULT_HELP;
}
