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
  (the METHOD TOOLS rail) and the in-file tools (the McCabe / psychro setup
  bar).  The design is the Explorer's ratified fold-to-edge idiom
  (useRailWidth.ts + LeftRail/RailReopenTab in ExploreWorkspace.tsx), reused
  rather than reinvented so the two workspaces feel like ONE application:

  * collapse persists under a GLOBAL localStorage key (the workspace is a
    scratchpad over the same registry regardless of the open case — never
    case-keyed), best-effort, junk-tolerant, default EXPANDED;
  * the folded rail leaves a 28px re-open strip — a large Fitts edge target,
    keyboard-reachable (Enter / Space), with a rotated micro-label so the
    collapsed state still says what it is hiding;
  * width is ANIMATED (not translateX — a transform would slide the rail over
    the plot and the plot would jump at the end); reduced-motion → instant.
    The host fires a window `resize` on transitionend so Plotly refits.

  Pure helpers are exported for the node test runner
  (tests/methodsChrome.test.ts) — no DOM is needed to pin the persistence
  contract.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
import { Text, Tooltip } from "@mantine/core";
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

/** Read a persisted collapsed flag.  Default EXPANDED (false); anything other
 *  than "1" — absent, junk, or a blocked storage — reads as expanded. */
export function loadCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
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
 *  home, so remounts (tool switches) re-read the persisted posture. */
export function useCollapsedFlag(key: string): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed(key));
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
