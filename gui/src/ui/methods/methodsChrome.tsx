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
  methodsChrome — the EduTools workspace's collapse chrome, shared by every
  method tool (the McCabe / psychro setup bar and each run-fed tool's own
  panel fold).  The design is the Explorer's ratified fold-to-edge idiom
  (useRailWidth.ts + LeftRail/RailReopenTab in ExploreWorkspace.tsx), reused
  rather than reinvented so the two workspaces feel like ONE application:

  * collapse persists under a GLOBAL localStorage key (the workspace is a
    scratchpad over the same registry regardless of the open case — never
    case-keyed), best-effort, junk-tolerant, default EXPANDED;
  * the folded bar leaves a slim restore strip the host renders — a large
    Fitts target, keyboard-reachable (Enter / Space), and alerts fold to a
    counted pill rather than vanishing.

  THE TOOL RAIL IS GONE (2026-08-16, Vítor's order, overruling the rail
  design).  An absolutely-positioned tool panel had painted over the 252px
  band, leaving nothing to select with; the overlap was a bug and was fixed
  separately, but the ruling went further — the chooser is now the top bar's
  EduTools dropdown (MenuBar + methods/registry.ts), which costs no width at
  all.  With the rail went its whole fold apparatus — RAIL_COLLAPSED_KEY, the
  28px RailReopenStrip, and the sm–md autofold default — because a persisted
  flag for a rail that no longer exists is a stored answer to a question
  nobody asks.  The `[` shortcut went with it for the same reason.

  useNarrowViewport() / useCoarsePointer() STAY: they are the ONE posture
  detection home, and the tools still read them (the teaches caption wraps
  instead of eliding on a phone; touch targets take one Mantine size step up).
  They no longer select a bottom sheet — a dropdown is already the touch-native
  chooser, and a second list below `sm` would be a second home for the
  registry.

  ONE BOOLEAN WAS ANSWERING TWO QUESTIONS (fixed 2026-08-17).  Until today
  `useNarrowViewport()` returned `below || coarse`, and the `|| coarse` was not
  careless: a landscape phone is ~844 px wide, well above the 768 px
  breakpoint, and it is still a phone.  The reason was real; the JOIN was the
  defect.  Two different questions were being answered by one flag:

    * "does the row FIT?"     — about WIDTH.  It decides whether controls
                                collapse into a chooser.
    * "will a finger hit it?" — about the POINTER.  It decides target SIZE and
                                spacing, never how many controls exist.

  `||` let the second answer the first, so a tablet — coarse at ANY width — got
  the phone layout at 1800 px: measured 2026-08-17 at 1800x1000 with touch
  emulation, ten top-row controls and a `Views:` chooser where the same page at
  1400x900 with a mouse laid eighteen out to x=823 with 577 px to spare.

  They are separate now, and the landscape phone is served by the FIT question
  rather than by the pointer: at 844 px the expanded row (833 px measured) does
  not fit beside what the top bar must keep, so it collapses — for the reason
  that is actually true there.  `fitsRow()` below is the ONE rule; the width it
  is given is MEASURED (`useIntrinsicWidth` / `useMeasuredBoxWidth`) wherever a
  box can be measured, and declared from a recorded measurement (`useFitsOneRow`
  + a named constant) where the natural width belongs to fixed content.

  Pure helpers are exported for the node test runner
  (tests/methodsChrome.test.ts) — no DOM is needed to pin the persistence
  contract.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";

/** The live tools' setup-bar fold (toolbar + teaches line + hand-off footer).
 *  ONE global key shared by every tool that offers the fold, so switching
 *  tools mid-lecture keeps the presentation posture instead of resetting it. */
export const CONTROLS_COLLAPSED_KEY = "choupo.methods.controlsCollapsed";

// ---- Responsive posture (the ONE detection home) ---------------------------

/** The narrow-posture breakpoint, in em — Mantine's `sm` (48em / 768px).
 *  Below it (or under a coarse pointer) a tool lays its chrome out for a
 *  phone: the teaches caption wraps rather than eliding, touch targets grow. */
export const NARROW_BREAKPOINT_EM = 48;

/** "Below breakpoint" media query — 0.01em under, so the boundary itself
 *  (exactly `sm`) counts as the wider posture, matching Mantine's own
 *  hiddenFrom/visibleFrom convention. */
const belowQuery = (em: number) => `(max-width: ${em - 0.01}em)`;

/** True under a coarse pointer (touch).  SSR / node → false. */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)", false, { getInitialValueInEffect: false }) ?? false;
}

/** True when the VIEWPORT is narrower than Mantine `sm` — a width fact and
 *  nothing else.  It used to be `below || coarse`; see the header for why the
 *  pointer term left and where the pointer's own job went.
 *
 *  Read it only where the question really is "is this reading column
 *  phone-narrow?" — a caption that should wrap rather than elide.  A question
 *  about whether specific CONTENT fits belongs to `fitsRow()` below, which
 *  compares a measured natural width against a measured available one. */
export function useNarrowViewport(): boolean {
  return useMediaQuery(belowQuery(NARROW_BREAKPOINT_EM), false,
                       { getInitialValueInEffect: false }) ?? false;
}

// ---- THE FIT RULE (one home) ------------------------------------------------

/** Does a row whose content is `naturalWidthPx` wide fit `availableWidthPx`?
 *
 *  The whole rule, in one place, so no caller can invent its own variant of
 *  it.  Both arguments are WIDTHS IN PX — one is what the content needs, the
 *  other is what it has.  Neither is a breakpoint and neither is a pointer.
 *
 *  AN UNMEASURED WIDTH IS NOT A FAILURE TO FIT.  Before the first layout pass
 *  (and in jsdom, which has no layout engine) a measurement reads 0; answering
 *  "does not fit" there would collapse a desk row on its first frame because
 *  nothing had been measured yet.  So a non-positive natural or available
 *  width answers `true` — the uncollapsed shape — and the real answer arrives
 *  with the measurement, in a layout effect, before anything is painted.
 *
 *  Pure and exported: the tests pin the rule itself, which is the part that
 *  can be wrong without a browser to show it. */
export function fitsRow(naturalWidthPx: number, availableWidthPx: number): boolean {
  if (!Number.isFinite(naturalWidthPx) || naturalWidthPx <= 0) return true;
  if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) return true;
  return availableWidthPx >= naturalWidthPx;
}

/** The live INNER width of a box, measured (ResizeObserver + one layout-effect
 *  reading so the first paint already has it).  This is the "available" half
 *  of `fitsRow` wherever a real container can be asked. */
export function useMeasuredBoxWidth<T extends HTMLElement>(): {
  ref: React.MutableRefObject<T | null>;
  width: number;
} {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth((w) => {
      const next = Math.floor(el.getBoundingClientRect().width);
      return next === w ? w : next;
    });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** The INTRINSIC width of a shape the layout does not currently render.
 *
 *  A row that has already collapsed is narrow BECAUSE it collapsed, so asking
 *  the rendered row how wide it would like to be can only ever answer "this
 *  wide" — and the row could never un-collapse when the window grew back.  The
 *  measurement therefore rides a GHOST: the shape is rendered once, hidden
 *  (`visibility: hidden`, out of the a11y tree and the tab order) and
 *  absolutely positioned so it changes no layout, measured in a layout effect,
 *  and then unmounted.  What is measured is the real markup at the real font,
 *  never a sum of guessed control widths.
 *
 *  `signature` is what the shape depends on (the lineup of controls in it).
 *  Change it and the ghost comes back for one pre-paint frame; leave it and
 *  nothing is rendered at all.  A width of 0 means "not measured yet", which
 *  `fitsRow` reads as "do not collapse". */
export function useIntrinsicWidth(signature: string): {
  ref: React.MutableRefObject<HTMLDivElement | null>;
  width: number;
  measuring: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ sig: string; px: number } | null>(null);
  const measuring = measured === null || measured.sig !== signature;
  useLayoutEffect(() => {
    if (!measuring) return;
    const el = ref.current;
    if (!el) return;                        // no layout engine (jsdom / SSR)
    const px = Math.ceil(el.getBoundingClientRect().width);
    if (px > 0) setMeasured({ sig: signature, px });
  });
  return { ref, width: measuring ? 0 : (measured as { sig: string; px: number }).px, measuring };
}

// ---- The setup bar's two postures ------------------------------------------

/** How a tool's setup bar lays itself out, in ONE home so the tools that
 *  offer one cannot answer the question differently.
 *
 *  ONE ROW: sized to its content (`fit-content`), with a flexible spacer
 *  pushing the pop-out / collapse buttons to the right edge.  That row lives
 *  in a box with `overflow-x: auto`.
 *
 *  WRAPPED: the row reflows instead.  Measured 2026-08-17 at 390x844, McCabe's
 *  bar was 983 px wide and the psychrometric chart's 1495 px — 13 and 29
 *  controls respectively laid out past the right edge, behind an
 *  `overflow: hidden` ancestor.  The `overflow-x: auto` strip is not the
 *  answer even where it technically scrolls: the design record calls a student
 *  swiping sideways hunting for a field the worst teaching outcome of the
 *  available fixes, and it is right — a field you cannot see is a field you do
 *  not know to look for.  Wrapping keeps every field on screen, in reading
 *  order, at the cost of bar height.
 *
 *  The spacer is dropped when wrapping: a `flex: 1` spacer in a wrapping row
 *  consumes the whole remainder of its line and forces everything after it
 *  onto the next one, which is a gap, not a layout.
 *
 *  Pure and exported so tests can pin both postures without a DOM. */
export function setupBarLayout(wrapped: boolean): {
  wrap: "wrap" | "nowrap";
  minWidth: number | "fit-content";
  showSpacer: boolean;
} {
  return wrapped
    ? { wrap: "wrap", minWidth: 0, showSpacer: false }
    : { wrap: "nowrap", minWidth: "fit-content", showSpacer: true };
}

/** True when the viewport can give a setup bar of this natural width a single
 *  row.  `naturalWidthPx` is the bar's own measured extent — a tool declares
 *  what it needs and this answers whether it has it.
 *
 *  This exists because the phone is not the only viewport a bar can overrun.
 *  The psychrometric bar is 1495 px wide and the agreed desk viewport is
 *  1400x900, so it lost three controls off the right edge THERE too — the
 *  design record's "and the desk is not innocent".  A `sm` breakpoint would
 *  never have caught that: the tool is simply wider than the window, and the
 *  question is whether it fits, not whether the screen is small.
 *
 *  This is `fitsRow(naturalWidthPx, viewportWidth)` with the browser doing the
 *  comparison: a `(min-width: Npx)` query IS "available >= natural", evaluated
 *  without a resize listener and correct on the very first render.  The rule
 *  is not restated here — the specialisation is which WIDTH plays "available"
 *  (the viewport, because a setup bar spans it) and where the natural width
 *  comes from (a constant recorded from a measurement, because a setup bar's
 *  content is fixed; a row whose lineup changes with the case measures its own
 *  through `useIntrinsicWidth`). */
export function useFitsOneRow(naturalWidthPx: number): boolean {
  return useMediaQuery(`(min-width: ${naturalWidthPx}px)`, false,
                       { getInitialValueInEffect: false }) ?? false;
}

// ---- Persistence -----------------------------------------------------------

/** Read a persisted collapsed flag.  `defaultCollapsed` (default: EXPANDED,
 *  false) answers when storage has nothing explicit to say: absent key, junk
 *  value, blocked storage, or no window at all.  Only a stored "1"/"0" — a
 *  real user toggle — overrides it. */
export function loadCollapsed(key: string, defaultCollapsed = false): boolean {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return defaultCollapsed;
  } catch {
    return defaultCollapsed;
  }
}

/** Whether storage carries an EXPLICIT user toggle ("1" or "0") for the key.
 *  Junk, absence, or a blocked storage all read as "no" — the posture default
 *  keeps authority until the user actually toggles. */
export function hasStoredCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(key);
    return v === "1" || v === "0";
  } catch {
    return false;
  }
}

/** Persist a collapsed flag.  Best-effort: a blocked storage keeps the state
 *  session-only rather than throwing into the render path. */
export function saveCollapsed(key: string, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    /* storage blocked — collapse stays session-only */
  }
}

/** A persisted collapse flag as component state: seeded from storage, toggled
 *  + saved in one step.  State is mount-local; the storage key is the one
 *  home, so remounts (tool switches) re-read the persisted posture.
 *
 *  `defaultCollapsed` (optional, default false) is the POSTURE default a
 *  caller may supply.  It answers only while the user has never toggled: a
 *  live default change re-seeds the state, but the first real toggle writes
 *  the key and wins from then on.  Reading never writes — a session that only
 *  reads leaves storage untouched. */
export function useCollapsedFlag(
  key: string,
  defaultCollapsed = false,
): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed(key, defaultCollapsed));
  useEffect(() => {
    if (!hasStoredCollapsed(key)) setCollapsed(defaultCollapsed);
  }, [key, defaultCollapsed]);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      saveCollapsed(key, next);
      return next;
    });
  }, [key]);
  return { collapsed, toggle };
}

/** Ask Plotly to refit after an INSTANT (non-animated) chrome change: one rAF,
 *  then a window `resize` — the event Plotly's useResizeHandler listens for.
 *  Animated folds refit on transitionend instead (the host wires that). */
export function usePlotRefit(dep: unknown): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => window.cancelAnimationFrame(id);
  }, [dep]);
}
