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
  propsSplit -- THE MAP / DETAILS SPLIT OF A PROPS CASE'S RESULTS (DEV.md 4c
  C153; record docs/design/a-props-case-drawn-as-its-calculation.md §6c).

  Vitor, on NanoFiltran after C151: "o painel que fica por baixo nao e
  ajustavel".  The calculation map is now a TOP panel of the panel contract
  (PROPS_MAP_PANEL, ui/panelContract.tsx): the reader drags the seam between
  the map and the details of the selection, the size is a reader preference
  (state/prefs.ts, PANELS.propsMap), and folding the map is "figures full
  height".  This file holds the numbers the screen needs that the contract
  does not:

    * the map's height BEFORE the reader has dragged it -- the height C151
      computed from the map, so nothing moves for a reader who never touches
      the seam (`autoMapPx`);
    * what the details pane always keeps: its header row, so a pane dragged
      down to nothing still says what it would show (`DETAILS_FLOOR_PX`);
    * the one affordance: a selection made while the details pane is too
      short to show the first lines of its summary OPENS the pane to a usable
      height -- by capping the map's DRAWN height, render-only, never by
      writing the reader's preference, and never when the pane is already at
      least that tall (`openDetailsCap`).  A pane the reader made large is
      never shrunk.

  Pure (no React): tests/propsSplit.test.ts pins it without a DOM.
\*---------------------------------------------------------------------------*/

import type { SizeSpec } from "../state/prefs.js";

/** The legend row under the map canvas (one line on a desk; it wraps on a
 *  phone and then takes from the canvas, never from the details). */
export const MAP_LEGEND_PX = 30;

/** The details pane's header row: kept visible however far the map is
 *  dragged, so the pane can always be seen to exist. */
export const DETAILS_FLOOR_PX = 40;

/** How tall the details pane is opened to when a selection needs it: the
 *  selection's header, its doors and the first rows of what it did. */
export const DETAILS_USABLE_PX = 260;

/** The map panel's height before the reader drags it: C151's computed map
 *  height (`min(560, max(300, 90 + 0.62 x the laid-out map height))`, 340 on
 *  a narrow screen) plus the legend under it. */
export function autoMapPx(mapHeight: number, narrow: boolean): number {
  const canvas = narrow ? 340 : Math.min(560, Math.max(300, 90 + mapHeight * 0.62));
  return Math.round(canvas + MAP_LEGEND_PX);
}

/** The usable details height in a split `hostPx` tall: DETAILS_USABLE_PX, or
 *  half the split on a short screen, so the map is never pushed out. */
export function detailsUsablePx(hostPx: number): number {
  return Math.min(DETAILS_USABLE_PX, Math.round(hostPx / 2));
}

/** The cap on the map's DRAWN height that opens the details pane to a usable
 *  height, or null when no cap is due: an unmeasured split, a details pane
 *  already at least that tall (the reader's choice stands), or a map already
 *  at its minimum.  Never below the map's own minimum. */
export function openDetailsCap(hostPx: number, shownMapPx: number, spec: SizeSpec): number | null {
  if (!Number.isFinite(hostPx) || hostPx <= 0) return null;
  const usable = detailsUsablePx(hostPx);
  if (hostPx - shownMapPx >= usable) return null;
  const cap = Math.max(spec.min, Math.floor(hostPx - usable));
  return cap < shownMapPx ? cap : null;
}
