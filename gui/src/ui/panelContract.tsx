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
  panelContract — THE ONE ANSWER to the three questions every docked panel in
  this GUI was answering for itself: can I resize it, can I hide it, does it
  remember?

  WHY IT EXISTS.  The owner's report was "cada menu do lado esquerdo tem de ter
  uma possibilidade de ajustar a largura e de ter auto hide (algumas não têm).
  Uma window em baixo, a mesma coisa."  The audit behind it found no contract at
  all: six left rails and one bottom window, each with its own answer, and the
  answers disagreed.  Measured 2026-08-18, before this file existed:

    panel                     resize          collapse                remembers
    Explore SET rail          yes, 6 px       yes + keyboard strip + [  both
    Control tuning rail       NO              yes, strip NOT focusable  fold
    Log jump list             NO              NO                        no
    Plots navigator           NO              NO                        no
    Streams navigator         NO              NO                        no
    Case files pane           NO              NO                        no
    Assistant console         yes, 6 px       yes (header bar)          store

  Adding the missing behaviours panel by panel would have produced a seventh and
  an eighth divergent implementation.  This is the contract they all obey
  instead, DERIVED FROM THE BEST OF WHAT WAS ALREADY THERE rather than invented:

    * the DRAG comes from `explore/useRailWidth.ts` — pointer capture on the
      handle so the gesture survives leaving it, clientX/Y tracking,
      rAF-throttling so a burst of pointermove events costs ONE layout pass,
      clamp, double-click reset.  That was the one real resize implementation
      in the app; what was wrong with it was only that its three numbers were
      one rail's, hard-coded, so nothing else could use it;
    * the STORAGE POSTURE comes from `methods/methodsChrome.tsx` — junk-,
      absence- and blocked-storage-tolerant, with a posture DEFAULT that holds
      only until the reader actually toggles.  It is not re-implemented here:
      as of 2026-08-18 it lives one layer down in `state/prefs.ts`, and this
      file reads and writes through that registry;
    * the COLLAPSED STRIP comes from `MethodsWorkspace.SetupCollapsedStrip` and
      the Explorer's `RailReopenTab`, which had independently arrived at the
      same three properties — the WHOLE strip is the click target (Fitts), it
      carries a SCENT of what is folded away, and it is KEYBOARD-REACHABLE.
      That last one is the half most collapse implementations get wrong, and
      the Control Room's strip was one of them: a bare `onClick` div.  A panel
      you can hide and cannot get back is a panel you have lost.

  WHERE THE STATE LIVES, and why not here.  A panel's size and fold are READER
  PREFERENCES and their home is the key registry in `state/prefs.ts` (PANELS) —
  one home, junk-tolerant, shared across tabs.  This file owns BEHAVIOUR only:
  the drag, the hit target, the keyboard, the wording, the measured default.
  The assistant console is the same story one level up: its height and fold are
  already store state backed by that registry (`agentHeight` /
  `agentCollapsed`), so `usePanel` takes it as a CONTROLLED value and persists
  nothing itself.  Two writers for one preference is the defect this file
  exists to remove; it must not introduce one.

  TWO OF THAT REGISTRY'S RULES ARE OBEYED HERE AND NEVER RE-DECIDED.  A stored
  value that is JUNK falls back to the default, while one that is merely OUT OF
  RANGE is CLAMPED — a stored `3` is a real drag against an older, smaller
  minimum, so clamping keeps the reader's intent where a fallback would
  silently widen the rail, and neither path can ever yield a 3 px panel.  And
  fitting a panel into the window it is drawn in is RENDER-ONLY: a viewport
  bound is not a preference bound, so nothing here writes a size back because
  the window happened to be short.  Both live in `clampSize` / `readSize` /
  `fitToViewport`, and this file calls them rather than re-deriving them.

  THE THREE RULES THIS FILE ENFORCES BY CONSTRUCTION.

  1. A HANDLE THE USER CAN SEE MUST BE A HANDLE THE USER CAN GRAB.  Both
     pre-contract handles were 6 px boxes positioned to straddle a border
     (`right: -3` on the Explorer rail, `top: -3` on the console) INSIDE a box
     with `overflow: hidden` — so the outer half was clipped away and only 3 px
     of the 6 was hittable.  Measured in Chromium by scanning
     `document.elementFromPoint` across each handle at 1 px.  The user sees a
     seam, aims at it, misses, and blames himself.
     `PanelResizeHandle` therefore renders into a ZERO-SIZED flex/grid item and
     positions itself out of that item, so it is a SIBLING of the clipping box
     and no ancestor `overflow: hidden` can trim it.  The grab band straddles
     the border symmetrically: HANDLE_HIT_PX of pointer target around a
     HANDLE_SEAM_PX hairline.

  2. AN ADVERTISED SHORTCUT MUST BE A BOUND SHORTCUT.  The Control Room's rail
     advertised "( [ )" in two tooltips and nothing anywhere bound `[` for it —
     the key was implemented once, in ExploreWorkspace, for the Explorer's rail
     alone.  Here the shortcut is a FIELD of the chrome: `usePanelShortcut`
     binds it and `shortcutHint` writes the tooltip text, both from that one
     field, so a tooltip cannot advertise a key nothing binds.

  3. COLLAPSE IS DECIDED BY MEASUREMENT, NEVER BY A BREAKPOINT.  A rail whose
     minimum plus its neighbour's minimum does not fit the box they share starts
     collapsed — asked as `fitsRow(min + contentMin, availablePx)`, the
     project's ONE fit rule (methodsChrome.tsx), never a viewport query and
     never `pointer: coarse` (this project has a recorded history of both giving
     wrong answers on real devices).  It is a DEFAULT, not a policy: the first
     real toggle writes the key and wins from then on.

  Pure helpers are exported for the node test runner (tests/panelContract.test.ts)
  — the project ships no jsdom, so everything decidable without a layout engine
  is pinned without one.  What CANNOT be pinned there is the hit target itself:
  a pointer target is a fact about layout, so it is measured in Chromium and
  reported with the change.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, Tooltip } from "@mantine/core";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp } from "@tabler/icons-react";

import { fitsRow, useCollapsedFlag } from "./methods/methodsChrome.js";
import {
  PANELS, clampSize, loadPanelSize, savePanelSize,
  type PanelSpec as PanelPrefs,
} from "../state/prefs.js";

// ---- the chrome declaration -------------------------------------------------

/** Which edge of its host the panel is docked to.  `left` panels resize on the
 *  x axis and fold to a vertical strip; `bottom` panels resize on y and fold to
 *  a horizontal bar. */
export type PanelEdge = "left" | "bottom";

/** What a panel declares about its CHROME.  Its storage and its size range come
 *  from `prefs` (the `state/prefs.ts` registry entry); everything here is about
 *  how the panel behaves and what it is called. */
export interface PanelChrome {
  /** The registry entry that owns this panel's size + fold keys. */
  prefs: PanelPrefs;
  edge: PanelEdge;
  /** What the panel IS, in the words a tooltip and a screen reader will use
   *  ("component browser", "tuning rail", "assistant console"). */
  label: string;
  /** What must remain for the CONTENT beside the panel for the pair to fit.
   *  Feeds rule 3 (the measured auto-collapse default); 0 disables it. */
  contentMin: number;
  /** A single-character shortcut that toggles the fold.  Advertised ONLY
   *  through `shortcutHint` and bound ONLY through `usePanelShortcut` — both
   *  read this field, so the two cannot disagree (rule 2). */
  shortcut?: string;
}

/* ---------------------------------------------------------------------------
   THE PANELS' CHROME, one declaration each.

   The size, the range and the storage keys are NOT here — they are the reader-
   preference registry's (`state/prefs.ts`, PANELS), which is the one home for
   every key this app writes.  What each entry below adds is the BEHAVIOUR half:
   which edge, what to call it, what its neighbour needs, and which key folds it.

   (These five were declared locally for a few hours on 2026-08-18, while
   `state/**` was another general's, and were folded into the registry the
   moment it landed.  Two key spellings existing in two files is the arity sin
   sitting inside the file written to end it.) */

/** What must be left for the surface BESIDE a navigator rail before folding the
 *  rail becomes the better layout.  A declared judgement, stated as one: below
 *  ~360 px a plot, a table or a code viewer has stopped being readable, and the
 *  rail is the part that can be recovered with one click. */
const RAIL_CONTENT_MIN = 360;

export const EXPLORE_SET_PANEL: PanelChrome = {
  prefs: PANELS.exploreRail, edge: "left", label: "component browser",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

/** The Explorer landing's compound browser.  `contentMin: 0` DISABLES the
 *  measured auto-collapse and there is no `shortcut`, so nothing folds it:
 *  this panel is the tab's subject, and a catalogue you cannot pick from is
 *  not a narrower catalogue, it is a different screen.  Everything else the
 *  contract gives — drag with pointer capture, arrow keys, double-click reset,
 *  a remembered width — is exactly what was missing. */
export const CATALOGUE_BROWSER_PANEL: PanelChrome = {
  prefs: PANELS.catalogueBrowser, edge: "left", label: "compound browser",
  contentMin: 0,
};

export const CONTROL_RAIL_PANEL: PanelChrome = {
  prefs: PANELS.controlRail, edge: "left", label: "tuning rail",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

export const LOG_JUMP_PANEL: PanelChrome = {
  prefs: PANELS.logRail, edge: "left", label: "jump list",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

export const PLOTS_NAV_PANEL: PanelChrome = {
  prefs: PANELS.plotsRail, edge: "left", label: "plot navigator",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

export const STREAMS_NAV_PANEL: PanelChrome = {
  prefs: PANELS.streamsRail, edge: "left", label: "stream navigator",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

export const CASE_FILES_PANEL: PanelChrome = {
  prefs: PANELS.caseFilesRail, edge: "left", label: "file list",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

/** THE EDUTOOLS SETUP PANEL — every method tool's knobs, docked left of its
 *  construction (ui/methods/knobPanel.tsx).
 *
 *  It is here because the reason it was left OUT has expired.  This file's
 *  first version recorded, beside `SetupCollapsedStrip`, that the EduTools
 *  setup bar "deliberately STAYS here rather than becoming a
 *  `PanelReopenStrip`: a docked panel folds an area that also has a SIZE the
 *  reader drags, and this bar has none — it is a toolbar that gets out of the
 *  diagram's way."  That was true of a STRIP and is void for a PANEL: as a left
 *  panel it has a size, which is exactly this contract's shape.  It was the
 *  last docked surface outside the contract; there is now no other.
 *
 *  Its shortcut is `[` like every other left rail, and the "never two panels on
 *  one key" argument holds unchanged: EduTools is a workspace, workspaces are
 *  mutually exclusive, so no second left rail is mounted beside it. */
export const METHOD_KNOBS_PANEL: PanelChrome = {
  prefs: PANELS.methodKnobsRail, edge: "left", label: "setup panel",
  contentMin: RAIL_CONTENT_MIN, shortcut: "[",
};

/** The bottom window.  Its size and fold are STORE state (backed by the same
 *  registry entry), so `usePanel` is given them as a controlled value and this
 *  entry's keys are never written from here — see the header.
 *
 *  Its shortcut is `]`, not `[`: it is the one panel mounted ALONGSIDE a left
 *  rail, so sharing the key would fold two panels with one press.  `[` and `]`
 *  as the two docked edges is the same pairing the Explorer's `[` already
 *  taught. */
export const BOTTOM_DOCK_PANEL: PanelChrome = {
  prefs: PANELS.bottomDock, edge: "bottom", label: "assistant console",
  contentMin: 0, shortcut: "]",
};

// ---- geometry (rule 1) ------------------------------------------------------

/** The pointer target of a resize handle, in px, straddling the border.
 *
 *  11 is 5 px either side of a 1 px seam.  It is chosen against what a user
 *  actually does: a pointer aimed at a visible hairline lands within a couple
 *  of pixels of it, and the pre-contract 3 px of effective target was inside
 *  the miss distance.  It is deliberately NOT a 24 px touch target — a splitter
 *  that wide swallows the first column of whatever it sits beside; the touch
 *  path to the same outcome is the collapse button and the strip, both of which
 *  are full-size controls. */
export const HANDLE_HIT_PX = 11;

/** The visible hairline inside that band.  The band itself is transparent until
 *  hover or focus, so the chrome does not get heavier. */
export const HANDLE_SEAM_PX = 1;

/** How far one arrow-key press moves a panel edge.  Coarse enough to cross the
 *  clamp range in a few presses, fine enough to land where you meant. */
export const HANDLE_KEY_STEP_PX = 16;

/** The folded strip's thickness — the Explorer's ratified 28 px re-open tab,
 *  which is also what the Control Room's strip used. */
export const STRIP_PX = 28;

// ---- the measured default (rule 3) ------------------------------------------

/** Should this panel START collapsed in a host `availablePx` wide?
 *
 *  The whole question is `fitsRow(min + contentMin, available)` — the project's
 *  ONE fit rule, asked of two widths and nothing else.  An unmeasured host
 *  (0 px: before the first layout pass, and in the node tests, which have no
 *  layout engine) answers "fits", i.e. EXPANDED, for the same reason `fitsRow`
 *  does: an unmeasured width is not a failure to fit, and the real answer
 *  arrives with the measurement before anything is painted. */
export function autoCollapseDefault(chrome: PanelChrome, availablePx: number): boolean {
  if (chrome.contentMin <= 0) return false;
  return !fitsRow(chrome.prefs.size.min + chrome.contentMin, availablePx);
}

// ---- keyboard resize --------------------------------------------------------

/** The next size for a key press on the handle, or `null` when the key is not
 *  one the handle claims (so the caller leaves the event alone).
 *
 *  A splitter is a real control — `role="separator"` with a value — and a
 *  control only a pointer can move is a control half the users do not have.
 *  The keys are the edge's own axis, and a bottom panel grows UPWARDS, so
 *  ArrowUp is the one that makes it bigger. */
export function nudgeSize(chrome: PanelChrome, current: number, key: string): number | null {
  const spec = chrome.prefs.size;
  const grow = chrome.edge === "left" ? "ArrowRight" : "ArrowUp";
  const shrink = chrome.edge === "left" ? "ArrowLeft" : "ArrowDown";
  if (key === grow) return clampSize(current + HANDLE_KEY_STEP_PX, spec);
  if (key === shrink) return clampSize(current - HANDLE_KEY_STEP_PX, spec);
  if (key === "Home") return clampSize(spec.min, spec);
  if (key === "End") return clampSize(spec.max, spec);
  return null;
}

// ---- wording (rule 2) -------------------------------------------------------

/** The shortcut clause a tooltip appends, derived from the chrome — `""` when
 *  the panel declares none.  This is the whole of rule 2: the sentence a reader
 *  sees and the key `usePanelShortcut` binds come from one field. */
export function shortcutHint(chrome: PanelChrome): string {
  return chrome.shortcut ? ` (shortcut: ${chrome.shortcut} )` : "";
}

export function collapseTooltip(chrome: PanelChrome): string {
  return `Hide the ${chrome.label}${shortcutHint(chrome)}`;
}

export function expandTooltip(chrome: PanelChrome): string {
  return `Show the ${chrome.label}${shortcutHint(chrome)}`;
}

export function handleTooltip(chrome: PanelChrome): string {
  return `Drag to resize the ${chrome.label} · double-click to reset · arrow keys when focused`;
}

// ---- the hook ---------------------------------------------------------------

export interface PanelHandle {
  chrome: PanelChrome;
  /** Current size in px, clamped.  KEPT while collapsed, so re-opening restores
   *  the size the reader dragged (the Explorer's lossless fold). */
  size: number;
  collapsed: boolean;
  toggle: () => void;
  expand: () => void;
  /** Bind to the resize handle's onPointerDown. */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Bind to the resize handle's onKeyDown. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Snap back to the declared default (double-click / Enter on the handle). */
  reset: () => void;
}

/** The contract as component state.
 *
 *  `availablePx` is the MEASURED width (or height) of the box the panel shares
 *  with its content — pass `useMeasuredBoxWidth().width`.  Omit it and the
 *  panel simply never auto-collapses.
 *
 *  `controlled` hands the size to an owner that already has a home for it (the
 *  assistant console's `agentHeight`).  The contract then supplies the drag
 *  mechanics, the hit target, the keyboard and the wording, and writes no
 *  storage of its own — one home, still. */
export function usePanel(
  chrome: PanelChrome,
  opts?: {
    availablePx?: number;
    controlled?: { value: number; onValue: (px: number) => void };
    collapsedControl?: { collapsed: boolean; toggle: () => void };
  },
): PanelHandle {
  const spec = chrome.prefs.size;
  const controlled = opts?.controlled;
  const [uncontrolled, setUncontrolled] = useState<number>(() => loadPanelSize(chrome.prefs));
  const size = clampSize(controlled ? controlled.value : uncontrolled, spec);

  const setSize = useCallback((px: number) => {
    if (controlled) controlled.onValue(px);
    else setUncontrolled(clampSize(px, spec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled?.onValue, spec.min, spec.max, spec.default]);

  const commit = useCallback((px: number) => {
    setSize(px);
    if (!controlled) savePanelSize(chrome.prefs, px);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSize, controlled, chrome.prefs.sizeKey]);

  /* The fold.  Storage-backed by default through the shared, junk-tolerant
   * hook; handed over entirely when an owner already holds the flag (the
   * console's `agentCollapsed`).
   *
   * The hook is still CALLED in the handed-over case — hooks are called
   * unconditionally or not at all — and that is safe rather than merely
   * tolerated: `useCollapsedFlag` READS storage and writes only on its own
   * toggle, which nothing calls here.  A second reader is not a second home;
   * a second writer would be. */
  /* The fallback key is deliberately NOT the registry's spelling.  Every panel
   * declared in this file carries a fold key (asserted in
   * tests/panelContract.test.ts), and the branch exists only because the
   * registry's type permits null — writing `choupo.panel.<id>.collapsed` here
   * would mint a SECOND spelling of exactly the key `state/prefs.ts` owns,
   * which is the arity sin inside the file written to end it.  This spelling
   * belongs to no registry, matches no stored preference, and therefore always
   * reads as the posture default. */
  const stored = useCollapsedFlag(
    chrome.prefs.collapsedKey ?? `panelContract:unregistered:${chrome.prefs.id}`,
    autoCollapseDefault(chrome, opts?.availablePx ?? 0),
  );
  const collapsed = opts?.collapsedControl ? opts.collapsedControl.collapsed : stored.collapsed;
  const toggle = opts?.collapsedControl ? opts.collapsedControl.toggle : stored.toggle;
  const expand = useCallback(() => { if (collapsed) toggle(); }, [collapsed, toggle]);

  const rafRef = useRef<number | null>(null);
  const pending = useRef<number>(size);
  pending.current = size;

  const reset = useCallback(() => { commit(spec.default); }, [commit, spec.default]);

  /* The drag, inherited in shape from useRailWidth: capture the pointer on the
   * handle so the gesture survives leaving it, track the client coordinate of
   * the axis this edge lives on, rAF-throttle so a burst of pointermove events
   * costs ONE layout pass, and persist on release.  `userSelect: none` on the
   * body for the duration, or the sweep selects the text it crosses. */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const onX = chrome.edge === "left";
    const start = onX ? e.clientX : e.clientY;
    const startSize = pending.current;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      // A left panel grows as the pointer moves RIGHT; a bottom panel grows as
      // it moves UP, hence the sign.
      const delta = onX ? ev.clientX - start : start - ev.clientY;
      const next = clampSize(startSize + delta, spec);
      pending.current = next;
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          setSize(pending.current);
        });
      }
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      try { el.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.userSelect = prevUserSelect;
      commit(pending.current);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome.edge, spec.min, spec.max, spec.default, setSize, commit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reset(); return; }
    const next = nudgeSize(chrome, pending.current, e.key);
    if (next === null) return;
    e.preventDefault();
    commit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome.edge, spec.min, spec.max, commit, reset]);

  return { chrome, size, collapsed, toggle, expand, onPointerDown, onKeyDown, reset };
}

/** Would this element SWALLOW a printable shortcut key — i.e. is the keypress
 *  the user is making a character they are typing?
 *
 *  THE COARSE VERSION OF THIS WAS A REAL DEFECT, and it was found by
 *  measurement rather than by reading.  The rule inherited from
 *  ExploreWorkspace was `tagName === "INPUT" || "TEXTAREA" || contentEditable`,
 *  and `INPUT` covers far more than typing: Mantine's SegmentedControl is a
 *  group of `input[type=radio]`, so after clicking "Detail" in the Streams
 *  workspace the focused element was a radio — and `[` did nothing at all.
 *  Measured in Chromium 2026-08-18: the rail stayed at 240 px and no strip
 *  appeared, on the very run built to prove the shortcut worked there.
 *
 *  So the question is not "is it an input?" but "does it take characters?".
 *  A radio, a checkbox and a button do not; a text, search, number or password
 *  field does, as does a textarea (which is what an xterm focuses, so `]` in
 *  the assistant console stays a bracket).  An `input` with no `type` at all is
 *  a text field by HTML's own default, so the unknown case answers "yes" —
 *  swallowing a fold is a harmless surprise, eating a character the user typed
 *  is not.
 *
 *  Pure and exported so the rule is pinned without a DOM. */
export function swallowsShortcut(
  el: { tagName?: string; type?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = (el.type ?? "text").toLowerCase();
  return !["radio", "checkbox", "button", "submit", "reset", "range", "color", "file", "image"]
    .includes(type);
}

/** Bind the chrome's shortcut (rule 2).  Guarded against text entry — a `[`
 *  typed into the compound browser's search box, or a `]` typed into the
 *  assistant console's terminal, must be that character and never a fold; see
 *  `swallowsShortcut` for what counts and what that question cost.
 *
 *  Two panels are never mounted with the SAME shortcut at once: workspaces are
 *  mutually exclusive (gui-credo §2.5), so at most one left rail exists at a
 *  time, and the bottom window — which IS mounted alongside them — declares a
 *  different key. */
export function usePanelShortcut(panel: PanelHandle): void {
  const { chrome, toggle } = panel;
  const key = chrome.shortcut;
  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.ctrlKey || e.metaKey || e.altKey) return;
      if (swallowsShortcut(e.target as HTMLElement | null)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, toggle]);
}

// ---- the components ---------------------------------------------------------

/** The style for the panel's own box: the size on its edge's axis, 0 when
 *  folded (the size itself is kept, so re-opening is lossless), and the
 *  transition that animates between the two.
 *
 *  `overflow: hidden` is REQUIRED here — a box animating to width 0 must clip
 *  its content — and it is exactly why the resize handle refuses to live inside
 *  this box.  See rule 1 in the header.
 *
 *  A FOLDED PANEL IS `visibility: hidden`, AND THAT LINE IS THE FIX FOR A REAL
 *  DEFECT (measured 2026-08-18, on the EduTools setup panel at 390x844).
 *  Clipping is not hiding: a box at width 0 with `overflow: hidden` still lays
 *  its children out at their own widths, so every control inside a folded panel
 *  keeps a real box, keeps its place in the TAB ORDER, and keeps answering
 *  `elementFromPoint` — as something under whatever is painted over it.
 *  checkGui reported 94 COVERED controls and 196 clipped at the phone viewport
 *  against a baseline of 0 and 6, and every one of them was a knob in a folded
 *  panel: a control the reader cannot see, cannot reach, and can still tab into.
 *  `visibility: hidden` removes it from hit-testing and from the tab order
 *  while leaving the box measurable, which is exactly what a fold means.
 *
 *  It is declared HERE and not in one host because all seven panels fold the
 *  same way; the other six were never walked by the harness, so they carried
 *  the same defect unmeasured. */
export function panelBoxStyle(panel: PanelHandle, reduceMotion: boolean): React.CSSProperties {
  const axis = panel.chrome.edge === "left" ? "width" : "height";
  const cross = panel.chrome.edge === "left" ? "height" : "width";
  return {
    [axis]: panel.collapsed ? 0 : panel.size,
    [cross]: "100%",
    flexShrink: 0,
    overflow: "hidden",
    visibility: panel.collapsed ? "hidden" : "visible",
    minWidth: 0,
    minHeight: 0,
    transition: reduceMotion ? "none" : `${axis} 180ms ease`,
  } as React.CSSProperties;
}

/** What a host spreads onto its panel box: the style above plus the `data-panel`
 *  marker.  The marker is not decoration — it is how a browser probe finds the
 *  panel to measure it, and the claims in this file's header are measurements.
 *  One home for the marker too, so a panel cannot be adopted into the contract
 *  and stay invisible to the thing that checks it. */
export function panelBoxProps(
  panel: PanelHandle,
  reduceMotion: boolean,
): { "data-panel": string; style: React.CSSProperties } {
  return { "data-panel": panel.chrome.prefs.id, style: panelBoxStyle(panel, reduceMotion) };
}

/** THE RESIZE HANDLE (rule 1).
 *
 *  Rendered as a zero-sized flex/grid item whose only child is absolutely
 *  positioned and centred on the border: the item takes no space in the layout,
 *  and no ancestor's `overflow: hidden` can clip the child, because the panel
 *  box that needs the clipping is a SIBLING, not a parent.  The band is
 *  HANDLE_HIT_PX across; the seam inside it is HANDLE_SEAM_PX and tints on
 *  hover or focus.
 *
 *  It is a real control: `role="separator"` with the live value on it,
 *  tabbable, and `nudgeSize` moves it from the keyboard. */
export function PanelResizeHandle({ panel }: { panel: PanelHandle }) {
  const [active, setActive] = useState(false);
  const { chrome } = panel;
  const horizontal = chrome.edge === "left";
  const spec = chrome.prefs.size;
  const half = (HANDLE_HIT_PX - HANDLE_SEAM_PX) / 2;
  if (panel.collapsed) return null;   // nothing to resize; the strip is the affordance
  return (
    <Box
      style={horizontal
        ? { width: 0, flex: "0 0 0px", position: "relative", zIndex: 5 }
        : { height: 0, flex: "0 0 0px", position: "relative", zIndex: 302 }}
    >
      <Tooltip label={handleTooltip(chrome)} withArrow openDelay={600}
               position={horizontal ? "right" : "top"}>
        <Box
          role="separator"
          aria-orientation={horizontal ? "vertical" : "horizontal"}
          aria-label={`resize the ${chrome.label}`}
          aria-valuenow={panel.size}
          aria-valuemin={spec.min}
          aria-valuemax={spec.max}
          tabIndex={0}
          onPointerDown={panel.onPointerDown}
          onKeyDown={panel.onKeyDown}
          onDoubleClick={panel.reset}
          onPointerEnter={() => setActive(true)}
          onPointerLeave={() => setActive(false)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          style={{
            position: "absolute",
            ...(horizontal
              ? { top: 0, bottom: 0, left: -(half + HANDLE_SEAM_PX), width: HANDLE_HIT_PX,
                  cursor: "col-resize" }
              : { left: 0, right: 0, top: -(half + HANDLE_SEAM_PX), height: HANDLE_HIT_PX,
                  cursor: "row-resize" }),
            display: "flex",
            flexDirection: horizontal ? "row" : "column",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
          }}
        >
          {/* the hairline: the only part that is ever painted */}
          <Box
            style={{
              [horizontal ? "width" : "height"]: HANDLE_SEAM_PX + (active ? 2 : 0),
              [horizontal ? "height" : "width"]: "100%",
              background: active ? "var(--mantine-color-accent-5)" : "transparent",
              transition: "background 120ms",
            } as React.CSSProperties}
          />
        </Box>
      </Tooltip>
    </Box>
  );
}

/** The chevron that folds the panel, for the panel's own header. */
export function PanelCollapseButton({ panel }: { panel: PanelHandle }) {
  const { chrome } = panel;
  const Icon = chrome.edge === "left" ? IconChevronLeft : IconChevronDown;
  return (
    <Tooltip label={collapseTooltip(chrome)} withArrow>
      <Box
        component="button"
        type="button"
        aria-label={`hide the ${chrome.label}`}
        aria-expanded={!panel.collapsed}
        onClick={panel.toggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, flexShrink: 0, padding: 0,
          border: "none", background: "transparent", cursor: "pointer",
          color: "var(--mantine-color-dimmed)",
        }}
      >
        <Icon size={15} />
      </Box>
    </Tooltip>
  );
}

/** THE FOLDED STRIP — what a hidden panel leaves behind.
 *
 *  Absorbed from `RailReopenTab` and `SetupCollapsedStrip`: the WHOLE strip is
 *  the click target (a Fitts edge strip, not a 15 px chevron); it carries a
 *  SCENT of what is folded away (`SET · 3`), because a strip that says nothing
 *  is indistinguishable from a border; and it is KEYBOARD-REACHABLE — tabbable,
 *  Enter / Space. */
export function PanelReopenStrip({ panel, scent }: { panel: PanelHandle; scent?: string }) {
  const [hover, setHover] = useState(false);
  const { chrome } = panel;
  const horizontal = chrome.edge === "left";
  const Icon = horizontal ? IconChevronRight : IconChevronUp;
  return (
    <Tooltip label={expandTooltip(chrome)} withArrow position={horizontal ? "right" : "top"}>
      <Box
        onClick={panel.toggle}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        role="button"
        tabIndex={0}
        aria-label={`show the ${chrome.label}`}
        aria-expanded={false}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); panel.toggle(); }
        }}
        data-panel-strip={chrome.prefs.id}
        style={{
          ...(horizontal
            ? { width: STRIP_PX, flex: `0 0 ${STRIP_PX}px`, height: "100%", paddingTop: 10,
                flexDirection: "column", alignItems: "center",
                borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }
            : { height: STRIP_PX, flex: `0 0 ${STRIP_PX}px`, width: "100%", paddingLeft: 12,
                flexDirection: "row", alignItems: "center",
                borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }),
          display: "flex", gap: 8, cursor: "pointer",
          background: hover
            ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))"
            : "transparent",
          transition: "background 120ms",
        }}
      >
        <Icon size={15} color="var(--mantine-color-dimmed)" />
        {scent && (
          <Text size="xs" fw={700} c="dimmed"
            style={horizontal
              ? { writingMode: "vertical-rl", letterSpacing: 0.5, userSelect: "none" }
              : { letterSpacing: 0.5, userSelect: "none" }}>
            {scent}
          </Text>
        )}
      </Box>
    </Tooltip>
  );
}
