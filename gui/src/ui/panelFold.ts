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
  panelFold — the one-click slide-away geometry for the two surfaces that
  take viewport from the flowsheet canvas: the floating SELECTION CARD
  (right, FlowCanvas.tsx) and the DOCKED assistant console row (bottom,
  AppShell.tsx + AgentConsole.tsx).

  Both fold the Explore-rail way (useRailWidth.ts is the precedent): a slim
  always-visible handle, a ~200 ms transition, reduced-motion → instant, and
  the folded flag persisted so a reload keeps the tucked layout.  Where the
  flag LIVES differs by ownership — the card fold is the store's
  `panels.property` slot (the historical right-panel visibility key, session
  `choupo.session.v1`); the console fold is `agentCollapsed` in the agent
  cluster (same session blob).

  The card is an OVERLAY (position:absolute over the canvas), so it slides
  with `transform: translateX` — the canvas div never changes size and React
  Flow needs no resize nudge.  The console is a real GRID ROW, so folding it
  animates `grid-template-rows` and the shell dispatches a window `resize`
  on transitionend (Plotly's useResizeHandler + xterm's fit listen for it;
  React Flow observes its own container).

  Pure helpers only (no React) so the geometry is unit-tested without a DOM
  (tests/panelFold.test.ts), mirroring exploreRail.test.ts.
\*---------------------------------------------------------------------------*/

// ---- selection card (FlowCanvas) -------------------------------------------
/** Card body width (px) — the 320 the card has always used. */
export const CARD_BODY_W = 320;
/** The card's gap to the viewport's right edge (matches `right: 12`). */
export const CARD_MARGIN = 12;
/** The slim fold handle on the card's inner (left) edge. */
export const CARD_HANDLE_W = 18;

/**
 * X-offset (px) for the card container.  The container is
 * [handle | body] anchored at `right: CARD_MARGIN`; sliding it right by
 * body + margin parks the body fully off-screen while the handle lands
 * flush at the viewport edge — one constant, nothing to measure.
 */
export function cardFoldOffset(folded: boolean): number {
  return folded ? CARD_BODY_W + CARD_MARGIN : 0;
}

/** The folded handle's vertical micro-label: the selected element's leaf
 *  name ("unit:plant.sector.flash1" → "flash1"), so the tucked card still
 *  says WHAT it is hiding (the RailReopenTab "SET · N" scent idiom). */
export function selectionLeafLabel(selectedNodeId: string | null): string {
  if (!selectedNodeId) return "";
  const bare = selectedNodeId.replace(/^(unit|stream):/, "");
  const cut = Math.max(bare.lastIndexOf("."), bare.lastIndexOf("/"));
  return cut < 0 ? bare : bare.slice(cut + 1);
}

// ---- docked assistant console (AppShell + AgentConsole) --------------------
/** Folded console row: 2px accent border + the 30px header (22px sm
 *  ActionIcons + 4px padding each side) = 32px — the header bar itself
 *  stays visible as the restore handle, nothing else. */
export const AGENT_BAR_PX = 32;

/** Height (px) of the console's grid row for the current fold state. */
export function agentRowPx(collapsed: boolean, height: number): number {
  return collapsed ? AGENT_BAR_PX : height;
}
