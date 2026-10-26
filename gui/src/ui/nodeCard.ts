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
  nodeCard -- THE LOOK OF A BOX AND OF A TERMINAL, ONE HOME FOR BOTH HOMES
  (DEV.md 4c C172 slice 3b).  A unit operation on the flowsheet and a step
  on the workflow diagram are the same kind of thing -- a calculation that
  takes information in and gives it out -- so they wear the same card: the
  surface, the border, the radius, the padding, the shadow and the selection
  ring.  Likewise a stream's terminal and a workflow's feed or product.  The
  unit node keeps what is its own (the silhouette, the KPI tint, the ports);
  the step node keeps what is its own (the number, the written lines).
\*---------------------------------------------------------------------------*/

import type { CSSProperties } from "react";

/** The card surface of a box (a unit, a step). */
export const NODE_BG = "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))";
/** Its resting border, and the border when selected. */
export const nodeBorder = (selected: boolean) =>
  `1.5px solid ${selected ? "var(--mantine-color-accent-5)" : "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))"}`;
/** Its shadow: the selection ring when selected. */
export const nodeShadow = (selected: boolean) =>
  selected ? "0 0 0 3px rgba(38, 198, 218, 0.15)" : "0 1px 3px rgba(0,0,0,0.4)";
export const NODE_RADIUS = 10;
export const NODE_PADDING = "10px 14px";
export const NODE_FONT = "Inter, sans-serif";

/** A box's card, as the unit node draws it with no KPI tint. */
export function nodeCardStyle(selected: boolean): CSSProperties {
  return {
    background: NODE_BG,
    border: nodeBorder(selected),
    borderRadius: NODE_RADIUS,
    padding: NODE_PADDING,
    boxShadow: nodeShadow(selected),
    transition: "border-color 150ms ease, box-shadow 150ms ease",
    fontFamily: NODE_FONT,
  };
}

/** A terminal's pill (a stream's feed or product; a workflow's feed,
 *  process input or product): dashed until it carries a state, the
 *  selection a halo that never repaints its border. */
export function terminalCardStyle(selected: boolean, borderColor: string, solid: boolean): CSSProperties {
  return {
    background: "light-dark(var(--mantine-color-white), transparent)",
    border: `1.5px ${solid ? "solid" : "dashed"} ${borderColor}`,
    borderRadius: 18,
    padding: "8px 12px",
    minWidth: 110,
    fontFamily: NODE_FONT,
    transition: "border-color 150ms ease, border-style 150ms ease, box-shadow 150ms ease",
    boxShadow: selected
      ? "0 0 0 2px var(--mantine-color-accent-3), 0 0 8px rgba(38, 198, 218, 0.4)"
      : "var(--mantine-shadow-sm)",
  };
}

/** A terminal's resting border before a run. */
export const TERMINAL_BORDER = "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))";
