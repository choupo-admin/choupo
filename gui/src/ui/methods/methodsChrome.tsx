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

  Pure helpers are exported for the node test runner
  (tests/methodsChrome.test.ts) — no DOM is needed to pin the persistence
  contract.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
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

/** True in the NARROW posture: viewport below Mantine `sm`, OR a coarse
 *  pointer at any width — a phone held sideways is still a phone. */
export function useNarrowViewport(): boolean {
  const coarse = useCoarsePointer();
  const below =
    useMediaQuery(belowQuery(NARROW_BREAKPOINT_EM), false, { getInitialValueInEffect: false }) ?? false;
  return below || coarse;
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
