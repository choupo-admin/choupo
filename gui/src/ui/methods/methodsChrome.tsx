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
  methodsChrome — the Methods workspace's collapse chrome, shared by the shell
  (the CLASSICAL METHODS rail) and the in-file tools (the McCabe / psychro
  setup bar).  The design is the Explorer's ratified fold-to-edge idiom
  (useRailWidth.ts + LeftRail/RailReopenTab in ExploreWorkspace.tsx), reused
  rather than reinvented so the two workspaces feel like ONE application:

  * collapse persists under a GLOBAL localStorage key (the workspace is a
    scratchpad over the same registry regardless of the open case — never
    case-keyed), best-effort, junk-tolerant, default EXPANDED on wide
    viewports; between `sm` and `md` the DEFAULT flips to collapsed (the
    media query supplies the default, a persisted user toggle wins);
  * the folded rail leaves a 28px re-open strip — a large Fitts edge target,
    keyboard-reachable (Enter / Space), with a rotated micro-label so the
    collapsed state still says what it is hiding;
  * width is ANIMATED (not translateX — a transform would slide the rail over
    the plot and the plot would jump at the end); reduced-motion → instant.
    The host fires a window `resize` on transitionend so Plotly refits.

  Responsive posture (ratified by the 2026-08 design panel) also lives here:
  useNarrowViewport() / useCoarsePointer() are the ONE detection home — below
  Mantine `sm` OR a coarse pointer, a workspace drops its rail + reopen strip
  entirely and offers a bottom-sheet Drawer instead (the host renders it; this
  file only answers "which posture?").

  Pure helpers are exported for the node test runner
  (tests/methodsChrome.test.ts) — no DOM is needed to pin the persistence
  contract.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
import { Text, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronRight } from "@tabler/icons-react";

/** The METHOD TOOLS rail's collapsed flag — the key is part of the contract
 *  (classroom bookmarklets and the docs may name it). */
export const RAIL_COLLAPSED_KEY = "choupo.methods.railCollapsed";

/** The live tools' setup-bar fold (toolbar + teaches line + hand-off footer).
 *  ONE global key shared by every tool that offers the fold, so switching
 *  tools mid-lecture keeps the presentation posture instead of resetting it. */
export const CONTROLS_COLLAPSED_KEY = "choupo.methods.controlsCollapsed";

/** The folded rail's re-open strip width (px) — mirrors the Explorer's 28. */
export const REOPEN_STRIP_PX = 28;

// ---- Responsive posture (the ONE detection home) ---------------------------

/** The narrow-posture breakpoint, in em — Mantine's `sm` (48em / 768px).
 *  Below it (or under a coarse pointer) a workspace renders NO rail and NO
 *  reopen strip: the tool list moves to a bottom-sheet Drawer. */
export const NARROW_BREAKPOINT_EM = 48;

/** The rail-autofold breakpoint, in em — Mantine's `md` (62em).  Between `sm`
 *  and `md` the rail still exists but its DEFAULT posture is collapsed; a
 *  persisted user toggle (RAIL_COLLAPSED_KEY) wins when present. */
export const RAIL_AUTOFOLD_BREAKPOINT_EM = 62;

/** "Below breakpoint" media query — 0.01em under, so the boundary itself
 *  (exactly `sm` / `md`) counts as the wider posture, matching Mantine's own
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

/** True when the rail's DEFAULT should be collapsed (viewport below `md`).
 *  Only the DEFAULT — a persisted toggle under RAIL_COLLAPSED_KEY wins. */
export function useRailAutofoldDefault(): boolean {
  return (
    useMediaQuery(belowQuery(RAIL_AUTOFOLD_BREAKPOINT_EM), false, { getInitialValueInEffect: false })
    ?? false
  );
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
 *  `defaultCollapsed` (optional, default false) is the POSTURE default — e.g.
 *  the sm–md autofold media query.  It answers only while the user has never
 *  toggled: a live default change (a resize crossing the breakpoint) re-seeds
 *  the state, but the first real toggle writes the key and wins from then on.
 *  Reading never writes — a session that only reads leaves storage untouched. */
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

/** The 28px vertical re-open strip, flush to the workspace's left edge,
 *  rendered ONLY while the rail is collapsed.  The WHOLE strip is the click
 *  target (large Fitts edge strip — the Explorer's RailReopenTab idiom), with
 *  a `›` chevron + a rotated micro-label naming what it re-opens.  Keyboard:
 *  tabbable, Enter / Space expand. */
export function RailReopenStrip({ label, ariaLabel, tooltip, onExpand }: {
  /** The rotated micro-label (e.g. "TOOLS"). */
  label: string;
  ariaLabel: string;
  tooltip: string;
  onExpand: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip label={tooltip} withArrow position="right">
      <div
        onClick={onExpand}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        role="button" aria-label={ariaLabel} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExpand(); }
        }}
        style={{
          width: REOPEN_STRIP_PX, flexShrink: 0, height: "100%", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          paddingTop: 10,
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          background: hover
            ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))"
            : "transparent",
          transition: "background 120ms",
        }}>
        <IconChevronRight size={15} color="var(--mantine-color-dimmed)" />
        <Text size="xs" fw={700} c="dimmed"
          style={{ writingMode: "vertical-rl", letterSpacing: 0.5, userSelect: "none" }}>
          {label}
        </Text>
      </div>
    </Tooltip>
  );
}
