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
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
    for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  THE LAYOUT VIEW'S PANELS -- what folds, what fills, what goes full screen,
  with no React and no DOM in it (DEV.md 4c C91).

  Vítor, on the `?layout=` tab: "the window is fixed; good practice is an
  option to show it or not and adjust it".  The 3D view was a strip between
  a long legend and the tables.  Now, in the tab AND in the exported page:
    * the 3D view FILLS the window by default, and its lower edge is a
      drag handle (the tab's through the ONE panel contract,
      ui/panelContract.tsx; the page's through `clampViewHeight` below);
    * a Full screen button uses the Fullscreen API where the browser grants
      it and a fixed full-window overlay where it does not
      (`fullscreenMode`);
    * the legend and each table are COLLAPSIBLE sections, folded or open as
      the reader last left them in this browser (the keys are
      state/prefs.ts LAYOUT_SECTION_KEYS; every access goes through that
      registry's try/catch, so a blocked store only forgets).
  The legend starts folded (it is a page of prose a returning reader has
  read); the tables start open inside their panel, and the panel starts
  folded in the tab so the drawing gets the window.
\*---------------------------------------------------------------------------*/

import { LAYOUT_SECTION_KEYS } from "../state/prefs.js";

export type LayoutSectionId = keyof typeof LAYOUT_SECTION_KEYS;

export interface LayoutSection {
  id: LayoutSectionId;
  /** The heading the reader clicks. */
  title: string;
  /** Folded before the reader has ever toggled it. */
  defaultCollapsed: boolean;
  /** Its fold's storage key (state/prefs.ts, the one home). */
  key: string;
}

/** The sections, in the order both surfaces draw them. */
export const LAYOUT_SECTIONS: readonly LayoutSection[] = [
  { id: "legend", title: "How to read this view", defaultCollapsed: true },
  { id: "plot", title: "Plot", defaultCollapsed: false },
  { id: "roads", title: "Roads", defaultCollapsed: false },
  { id: "findings", title: "Findings", defaultCollapsed: false },
  { id: "pipes", title: "Pipe register", defaultCollapsed: false },
  { id: "items", title: "Placed items", defaultCollapsed: false },
].map((s) => ({ ...s, id: s.id as LayoutSectionId, key: LAYOUT_SECTION_KEYS[s.id as LayoutSectionId] }));

export function layoutSection(id: LayoutSectionId): LayoutSection {
  return LAYOUT_SECTIONS.find((s) => s.id === id)!;
}

/** What the folded tables panel says it holds (its scent). */
export const LAYOUT_TABLES_SCENT = "Plot · roads · findings · pipe register · placed items";

/** How the Full screen button works in this browser: the Fullscreen API
 *  where it is offered and enabled, else a fixed overlay covering the
 *  window (an iframe without `allowfullscreen`, an old WebKit, a test). */
export type FullscreenMode = "api" | "overlay";

export function fullscreenMode(doc: { fullscreenEnabled?: boolean } | null | undefined,
                               el: { requestFullscreen?: unknown } | null | undefined)
  : FullscreenMode {
  try {
    return doc?.fullscreenEnabled === true && typeof el?.requestFullscreen === "function"
      ? "api" : "overlay";
  } catch {
    return "overlay";
  }
}

/** The least a dragged 3D view may be, and what it keeps clear of the
 *  window's bottom edge so the handle stays reachable (px). */
export const VIEW_MIN_PX = 240;
export const VIEW_BOTTOM_CLEAR_PX = 24;

/** The exported page's 3D-view height, clamped: at least VIEW_MIN_PX, at
 *  most the window less VIEW_BOTTOM_CLEAR_PX; junk reads as `fallback`. */
export function clampViewHeight(px: number, windowPx: number, fallback: number): number {
  const top = Math.max(VIEW_MIN_PX, (Number.isFinite(windowPx) ? windowPx : 0) - VIEW_BOTTOM_CLEAR_PX);
  const v = Number.isFinite(px) && px > 0 ? px : fallback;
  return Math.round(Math.min(top, Math.max(VIEW_MIN_PX, v)));
}

/** The height that FILLS the window below a view whose top edge stands
 *  `topPx` down the page: the default before the reader drags. */
export function fillHeight(topPx: number, windowPx: number): number {
  return clampViewHeight(windowPx - Math.max(0, topPx) - VIEW_BOTTOM_CLEAR_PX, windowPx,
                         VIEW_MIN_PX);
}
