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

import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps } from "@xyflow/react";
import { useRef, useState } from "react";

import type { XY } from "../state/layout.js";
import { ModelBoundaryBadge, type BoundaryBadgeData } from "./ModelBoundaryBadge.js";

interface TearData {
  center?: XY;
  onCenterChange?: (id: string, xy: XY) => void;
  onCommit?: () => void;
  onReset?: (id: string) => void;
  boundary?: BoundaryBadgeData;
  showNumbers?: boolean;
  num?: number;
  [k: string]: unknown;
}

export function TearEdge({
  id,
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
  const td = (data ?? {}) as TearData;
  const boundary = td.boundary;
  const { screenToFlowPosition } = useReactFlow();
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);
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
  // The underbus depth is draggable: a stored center.y overrides the default
  // drop (persisted per case, same mechanism as a forward edge's bend).  Clamp
  // so the bus can never rise ABOVE the row (it must stay a U-turn).
  const defaultBusY = Math.max(sourceY, targetY) + drop;
  // A dragged center.y positions the underbus directly (no clamp -- the earlier
  // clamp pinned it near the row and read as "the center will not move").
  const busY = td.center?.y ?? defaultBusY;
  const moved = td.center !== undefined;

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
  // Lift the name chip ABOVE the underbus so the thick dashed recycle stroke can
  // never run through the text (the model-boundary badge stays just below the bus,
  // so name and badge sit on opposite sides of the line, both legible).
  const labelTextY = busY - 15;

  const strokeColor =
    (style as { stroke?: string } | undefined)?.stroke ?? "var(--mantine-color-red-5)";

  // Drag the handle on the underbus to raise / lower the whole recycle U-turn
  // (only the depth moves; the connections stay fixed).  Persisted per case via
  // the same center store a forward edge's bend uses.
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    td.onCenterChange?.(id, { x: labelX, y: p.y });   // only the bus depth (y) matters
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
    td.onCommit?.();
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    td.onReset?.(id);
    td.onCommit?.();
  };


  // A DIV in EdgeLabelRenderer (a portal OUTSIDE React Flow's edge SVG -- the same
  // trick the forward-edge handle uses, which is why THAT drags and an in-SVG path
  // does not) spanning the FULL horizontal underbus, so the recycle line can be
  // grabbed anywhere along it -- not only at the midpoint, which sits off-screen
  // when a node is far to the side.
  const busSpan = Math.max(48, Math.abs(tX - sX));

  return (
    <>
      <BaseEdge path={d} markerEnd={markerEnd} style={style} />
      {/* Wide grab strip along the underbus + a visible move-point dot. */}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={onDoubleClick}
          title="Drag to raise / lower this recycle line; double-click to reset"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${busY}px)`,
            pointerEvents: "all",
            width: busSpan, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "ns-resize",
          }}
        >
          <div
            style={{
              width: hover ? 12 : 9,
              height: hover ? 12 : 9,
              borderRadius: "50%",
              border: `2px solid ${strokeColor}`,
              background: moved ? strokeColor : "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
              opacity: moved || hover ? 1 : 0.55,
              transition: "opacity 120ms ease, width 120ms ease, height 120ms ease",
            }}
          />
        </div>
      </EdgeLabelRenderer>
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
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelTextY}px)`,
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
