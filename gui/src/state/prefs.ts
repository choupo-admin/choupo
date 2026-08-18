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
  prefs — THE READER'S PREFERENCES, and the one home for every storage key
  the GUI's chrome persists.

  ---------------------------------------------------------------------------
  THE LINE THIS FILE DRAWS (ruled 2026-08-18)

  A LAYOUT PREFERENCE IS A PROPERTY OF THE READER, NOT OF A TAB AND NOT OF A
  CASE.  A student who wants a 320 px rail wants it in every tab: the width of
  a rail, whether a rail is folded away, how tall the bottom window is — these
  describe the person reading, so their home is `localStorage`, which every tab
  of the app shares, and they are restored in EVERY tab, including the
  `?case=` / `?focus=` / `?internals=` tabs the store calls isolated.

  WHAT A TAB OWNS is what identifies THAT tab and would be wrong to copy into
  another one: which case is open, which view is showing, what is selected,
  where the scroll is, the run in flight.  That is the session
  (`choupo.session.v1`, store.ts), and it stays suppressed in an isolated tab —
  a `?case=` tab must not clobber the hub's "what was I doing".

  WHY THE LINE HAD TO BE DRAWN.  ONE TAB, ONE THING
  (docs/design/one-tab-one-thing.md) made every opened case a `?case=` tab, and
  `isolatedTab()` suppressed the WHOLE session blob — which carried the
  selection-card fold and the console fold beside the case reference.  So from
  the day that record shipped, the folds were dead in every case tab.
  MEASURED before this file existed (Chromium, dev server, 2026-08-18): in
  `?case=steady/flash/flash01_benzene_toluene`, selecting a unit and clicking
  "tuck details card away" slid the card to `translateX(332px)` and wrote
  NOTHING to localStorage; reloading the same URL brought the card back at
  `translateX(0px)`.  A preference the reader set, gone on F5.

  THE COROLLARY, and it is why "one home" is not pedantry here: a preference
  must have exactly ONE writer.  While the fold lived in the session blob it
  had two potential homes (the blob and, later, a key), and a reader would see
  whichever wrote last.  Every key below is named ONCE, here.

  ---------------------------------------------------------------------------
  ROBUSTNESS — junk in, DEFAULT out (never a throw, never a 3 px rail)

  The junk-tolerant reading in `ui/methods/methodsChrome.tsx` is the pattern
  this generalises, and it belongs in the state layer rather than in a view:
  a view that reads storage itself is a second home for the decision.  Storage
  can be blocked (private mode), absent (SSR / the node test runner), full
  (quota), or carry a value written by an older shape of the app.  So:

    * a flag is stored as "1" / "0" and NOTHING else counts — "true", "", a
      JSON blob and a missing key all read as the DEFAULT;
    * a size is parsed as a number: junk or non-finite reads as the DEFAULT,
      while a finite number OUT OF RANGE is CLAMPED into it.  The two are
      deliberately different.  A stored `3` is a real answer from a real drag
      against an older, smaller minimum — clamping keeps the intent (a narrow
      rail) where falling back would silently widen it; a stored `"narrow"` is
      not an answer at all;
    * every read and every write is wrapped: storage NEVER throws into a
      render path.  A blocked storage degrades to session-only state, which is
      the same behaviour the reader had before any of this existed.

  A VIEWPORT BOUND IS NOT A PREFERENCE BOUND.  The clamp above is the
  preference's own range.  Fitting a panel into the window it is being drawn in
  is the RENDERER's job (`fitToViewport`), and it must not be written back:
  opening the app in a small window would otherwise destroy a height the reader
  chose on a big one.
\*---------------------------------------------------------------------------*/

// ---- storage primitives ----------------------------------------------------

/** The store, or null when there is none (SSR, node, blocked storage). */
function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;                      // access itself can throw in private mode
  }
}

/** Raw read.  Absent key, no storage, or a throwing storage all give null. */
export function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Raw write.  Best-effort: a blocked or full storage keeps the value
 *  session-only rather than throwing into the caller. */
export function writeRaw(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* blocked / quota — the preference stays session-only */
  }
}

/** Raw delete.  Best-effort, same posture as `writeRaw`. */
export function removeRaw(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* blocked — nothing to do */
  }
}

/** Read a persisted flag.  ONLY "1" / "0" count; everything else (absent,
 *  junk, an older shape, no storage) reads as `fallback`. */
export function readFlag(key: string, fallback = false): boolean {
  const v = readRaw(key);
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

/** Does storage carry an EXPLICIT answer for this flag?  Junk and absence
 *  both read as "no", so a posture default keeps authority until the reader
 *  actually toggles something. */
export function hasFlag(key: string): boolean {
  const v = readRaw(key);
  return v === "1" || v === "0";
}

/** Persist a flag in the one canonical spelling. */
export function writeFlag(key: string, value: boolean): void {
  writeRaw(key, value ? "1" : "0");
}

/** The bounds of a draggable size, in px.  `min`/`max` are the PREFERENCE's
 *  range (what a drag may reach), never the viewport's. */
export interface SizeSpec { min: number; max: number; default: number }

/** Clamp a candidate size into its spec.  Junk / non-finite → the default;
 *  a finite out-of-range number → the nearest bound.  Rounded, because a
 *  fractional pixel is not a preference anybody set. */
export function clampSize(px: number, spec: SizeSpec): number {
  if (!Number.isFinite(px)) return spec.default;
  return Math.min(spec.max, Math.max(spec.min, Math.round(px)));
}

/** Read a persisted size, clamped to its spec.  Absent / junk → the default. */
export function readSize(key: string, spec: SizeSpec): number {
  const raw = readRaw(key);
  if (raw === null) return spec.default;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? clampSize(n, spec) : spec.default;
}

/** Persist a size, clamped to its spec so a bad number can never be stored. */
export function writeSize(key: string, spec: SizeSpec, px: number): void {
  writeRaw(key, String(clampSize(px, spec)));
}

/** Fit a stored size into the window it is about to be drawn in.  RENDER-ONLY:
 *  never write the result back — see the header ("a viewport bound is not a
 *  preference bound").  `available` is what the surrounding layout can give
 *  the panel; a non-positive or non-finite one (jsdom has no layout) leaves
 *  the preference untouched. */
export function fitToViewport(px: number, available: number, spec: SizeSpec): number {
  if (!Number.isFinite(available) || available <= 0) return px;
  return Math.max(spec.min, Math.min(px, Math.floor(available)));
}

// ---- THE KEY REGISTRY ------------------------------------------------------
//
// Every chrome preference key the GUI writes is named HERE, once.  A key
// spelled at its call site is a second home waiting to happen: the app already
// paid for that — `CONTROLS_COLLAPSED_KEY` was exported from three modules with
// three different values, so what an importer got depended on which module the
// import line named.  The names below are DISTINCT because the things are.

/** The EduTools setup-panel fold, shared by every tool that offers one, so
 *  switching tools mid-lecture keeps the presentation posture.
 *
 *  Declared ABOVE `PANELS` because the knob rail's entry references it: the
 *  spelling already existed and already meant "is the EduTools setup chrome
 *  folded away?", and minting a second one for the same question when that
 *  chrome became a docked panel would be the arity sin. */
export const METHODS_SETUP_COLLAPSED_KEY = "choupo.methods.controlsCollapsed";

/** A shell / workspace panel whose size and fold the reader controls. */
export interface PanelSpec {
  /** Stable id — the panel's name in this registry and in the store. */
  id: string;
  /** Key of the dragged size, or null for a panel with no adjustable size. */
  sizeKey: string | null;
  /** Bounds of that size.  Meaningless (and ignored) when sizeKey is null. */
  size: SizeSpec;
  /** Key of the fold flag, or null for a panel that cannot be folded. */
  collapsedKey: string | null;
  /** What the fold answers before the reader has ever toggled it. */
  defaultCollapsed: boolean;
}

const panel = (
  id: string,
  opts: {
    sizeKey?: string; size?: SizeSpec;
    collapsedKey?: string; defaultCollapsed?: boolean;
  },
): PanelSpec => ({
  id,
  sizeKey: opts.sizeKey ?? null,
  size: opts.size ?? { min: 0, max: 0, default: 0 },
  collapsedKey: opts.collapsedKey ?? null,
  defaultCollapsed: opts.defaultCollapsed ?? false,
});

/** THE PANELS.  Add a rail or a dock here and it is persisted, junk-tolerant
 *  and shared across tabs for free; spell its key anywhere else and it is
 *  none of those things. */
export const PANELS = {
  /** The flowsheet's floating selection card (FlowCanvas).  Fold only — its
   *  width is the fixed CARD_BODY_W in ui/panelFold.ts.  Its flag USED to ride
   *  the session blob as `panels.property` (open, not collapsed); the store
   *  migrates that once, see `migrateLegacySessionPrefs`. */
  selectionCard: panel("selectionCard", {
    collapsedKey: "choupo.panel.selectionCard.collapsed",
  }),

  /** The bottom window — today the docked assistant console.  Height is the
   *  reader's; the shell fits it to the viewport at render time.  `min` is the
   *  console's own floor (a terminal below ~140 px shows nothing usable); `max`
   *  is generous on purpose so a preference set on a tall screen survives a
   *  session on a short one. */
  bottomDock: panel("bottomDock", {
    sizeKey: "choupo.panel.bottomDock.height",
    size: { min: 140, max: 1600, default: 360 },
    collapsedKey: "choupo.panel.bottomDock.collapsed",
  }),

  /** The Property Explorer's left SET rail.  KEYS ARE THE LEGACY ONES on
   *  purpose: they are already in students' browsers, and renaming a key to
   *  tidy a registry silently resets everyone's rail.  What moved here is the
   *  NAMING and the bounds, not the storage. */
  exploreRail: panel("exploreRail", {
    sizeKey: "choupo.explore.railWidth",
    size: { min: 200, max: 460, default: 240 },
    collapsedKey: "choupo.explore.railCollapsed",
  }),

  /** The Control Room's left tuning rail.  Its FOLD key is the legacy one (it
   *  existed before this registry); its SIZE is new — the rail could not be
   *  resized at all until the panel contract of 2026-08-18. */
  controlRail: panel("controlRail", {
    sizeKey: "choupo.panel.controlRail.size",
    size: { min: 220, max: 460, default: 260 },
    collapsedKey: "choupo.control.railCollapsed",
  }),

  // ---- the navigator rails ------------------------------------------------
  //
  // Four rails that could be neither resized nor hidden before 2026-08-18, and
  // therefore had nothing to persist.  They share ONE range because they are
  // the same kind of thing — a list of names beside a primary surface — and the
  // range is the Explorer's ratified one, adopted rather than re-derived: 200
  // px is where a two-line entry stops fitting, 460 px is where the primary
  // surface starves for no gain.  The BEHAVIOUR (drag, strip, shortcut) is
  // `ui/panelContract.tsx`; what lives here is only where the numbers sleep.

  /** The Log workspace's jump list. */
  logRail: panel("logRail", {
    sizeKey: "choupo.panel.logRail.size",
    size: { min: 200, max: 460, default: 260 },
    collapsedKey: "choupo.panel.logRail.collapsed",
  }),

  /** The Plots workspace's navigator. */
  plotsRail: panel("plotsRail", {
    sizeKey: "choupo.panel.plotsRail.size",
    size: { min: 200, max: 460, default: 240 },
    collapsedKey: "choupo.panel.plotsRail.collapsed",
  }),

  /** The Streams workspace's navigator. */
  streamsRail: panel("streamsRail", {
    sizeKey: "choupo.panel.streamsRail.size",
    size: { min: 200, max: 460, default: 240 },
    collapsedKey: "choupo.panel.streamsRail.collapsed",
  }),

  /** The Case workspace's file list. */
  caseFilesRail: panel("caseFilesRail", {
    sizeKey: "choupo.panel.caseFilesRail.size",
    size: { min: 200, max: 460, default: 240 },
    collapsedKey: "choupo.panel.caseFilesRail.collapsed",
  }),

  /** THE EDUTOOLS SETUP PANEL — every method tool's knobs, on the left of its
   *  construction (ui/methods/knobPanel.tsx).  It was a horizontal strip above
   *  the diagram until 2026-08-18, so it had no width at all; what it had was
   *  twelve fold keys, one per tool.  Now it has ONE of each.
   *
   *  The range is WIDER than the navigator rails' because the content is: a
   *  navigator lists names, this one carries labelled number inputs whose
   *  labels are sentences ("T_guess (K) — which branch is reported"), and 240
   *  is where such a label stops needing three lines.  520 is where the widest
   *  of them stops gaining anything.
   *
   *  The FOLD key is the one the registry already owned for this question —
   *  see METHODS_SETUP_COLLAPSED_KEY above.  The twelve per-tool spellings it
   *  replaces are dead; a reader who folded the McCabe setup bar keeps their
   *  answer, on every tool. */
  methodKnobsRail: panel("methodKnobsRail", {
    sizeKey: "choupo.panel.methodKnobsRail.size",
    size: { min: 240, max: 520, default: 300 },
    collapsedKey: METHODS_SETUP_COLLAPSED_KEY,
  }),
} as const;

export type PanelId = keyof typeof PANELS;

/** Other reader-preference homes that are not panels.  Named here so the
 *  registry answers "what does this app store about the reader?" in one read. */
export const PREF_KEYS = {
  /** Display units + significant figures (state/displayUnits.ts). */
  display: "choupo.displayPrefs.v1",
  /** Docked vs floating for the bottom dock — a MODE, not a fold. */
  bottomDockDocked: "choupo.panel.bottomDock.docked",
} as const;

// ---- reading and writing a panel's preferences -----------------------------

/** Is this panel folded away?  Absent / junk / no storage → its declared
 *  default.  A panel with no fold answers false. */
export function loadPanelCollapsed(p: PanelSpec): boolean {
  return p.collapsedKey ? readFlag(p.collapsedKey, p.defaultCollapsed) : false;
}

/** Has the reader ever answered this panel's fold?  Used where a posture
 *  default (a media query, a narrow viewport) should hold until they do. */
export function hasPanelCollapsed(p: PanelSpec): boolean {
  return p.collapsedKey ? hasFlag(p.collapsedKey) : false;
}

/** Persist a panel's fold.  A panel with no fold key is a no-op, not a throw. */
export function savePanelCollapsed(p: PanelSpec, collapsed: boolean): void {
  if (p.collapsedKey) writeFlag(p.collapsedKey, collapsed);
}

/** The panel's dragged size, clamped to its spec.  A panel with no size
 *  answers 0 — callers of a sizeless panel are asking the wrong question, and
 *  0 is the answer that shows up as a defect rather than as a plausible width. */
export function loadPanelSize(p: PanelSpec): number {
  return p.sizeKey ? readSize(p.sizeKey, p.size) : 0;
}

/** Persist a panel's dragged size (clamped). */
export function savePanelSize(p: PanelSpec, px: number): void {
  if (p.sizeKey) writeSize(p.sizeKey, p.size, px);
}

/** Forget a panel's preferences — the "reset this panel" affordance.  Removing
 *  the keys is deliberate: an ABSENT key means "the reader never said", which
 *  is exactly what a reset restores, while writing the default back would
 *  record a choice nobody made. */
export function resetPanel(p: PanelSpec): void {
  if (p.sizeKey) removeRaw(p.sizeKey);
  if (p.collapsedKey) removeRaw(p.collapsedKey);
}
