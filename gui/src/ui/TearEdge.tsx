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
  TearEdge -- custom React Flow edge for recycle / tear streams.

  Default smoothstep between two same-row nodes (Splitter on the right,
  Mixer on the left) routes through the GAP BETWEEN nodes -- which on a
  fractal flowsheet means the back-edge passes visually THROUGH every
  intermediate unit and looks like just another forward edge.

  This component draws an explicit U-turn BELOW (or above) the node row:

       Splitter (R)                           Mixer (L)
         o----.                          .----o
              |                          |
              |  ......................  |       <-- horizontal "underbus"
              |                          |
              `--------------------------'

  Stays out of the way of the forward streams + reads instantly as
  "this goes BACK" because no forward edge ever traces such a path.
\*---------------------------------------------------------------------------*/

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

import { ModelBoundaryBadge, type BoundaryBadgeData } from "./ModelBoundaryBadge.js";

export function TearEdge({
  sourceX, sourceY,
  targetX, targetY,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data,
}: EdgeProps) {
  const boundary = (data as { boundary?: BoundaryBadgeData } | undefined)?.boundary;
  // U-turn DOWNWARD (below the row).  The drop and outset are tuned for
  // typical unit-node heights (~80 px) + node-to-node horizontal gap
  // (~120-220 px); the offsets keep the bus clear of the row regardless.
  const drop = 70;          // how far below the source / target the bus sits
  const outset = 18;        // small horizontal jut before the vertical drop
  const radius = 12;        // corner radius

  // Source-side: from (sourceX, sourceY), step OUT (right), DOWN to bus.
  // Target-side: from (targetX, targetY), step OUT (left), DOWN to bus.
  // The sign of `outset` flips so each side juts AWAY from its node.
  const sX = sourceX + outset;
  const tX = targetX - outset;
  const busY = Math.max(sourceY, targetY) + drop;

  // Build the SVG path with rounded corners at each turn.  Standard
  // SVG `Q` (quadratic Bezier) for the corners; the radius is small so
  // it reads as a 90-deg turn with a hint of bevel.
  const d = [
    `M ${sourceX} ${sourceY}`,
    `L ${sX - radius} ${sourceY}`,
    `Q ${sX} ${sourceY} ${sX} ${sourceY + radius}`,
    `L ${sX} ${busY - radius}`,
    `Q ${sX} ${busY} ${sX - radius} ${busY}`,
    `L ${tX + radius} ${busY}`,
    `Q ${tX} ${busY} ${tX} ${busY - radius}`,
    `L ${tX} ${targetY + radius}`,
    `Q ${tX} ${targetY} ${tX - radius} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");

  const labelX = (sX + tX) / 2;
  const labelY = busY;

  return (
    <>
      <BaseEdge path={d} markerEnd={markerEnd} style={style} />
      {/* Model-boundary audit chip, docked below the label on the underbus
          (badge only -- the stroke keeps its semantic phase colour). */}
      {boundary && (
        <ModelBoundaryBadge x={labelX} y={labelY + 16} refused={boundary.refused} />
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              padding: labelBgPadding
                ? `${labelBgPadding[1]}px ${labelBgPadding[0]}px`
                : "2px 4px",
              borderRadius: labelBgBorderRadius ?? 4,
              background: (labelBgStyle as { fill?: string } | undefined)?.fill
                ?? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))",
              color: (labelStyle as { fill?: string } | undefined)?.fill
                ?? "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            {(data as { showNumbers?: boolean; num?: number })?.showNumbers === true
              && typeof (data as { num?: number })?.num === "number" && (
              <span style={{ fontWeight: 700, marginRight: 5, opacity: 0.85 }}>
                {(data as { num: number }).num}
              </span>
            )}
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
