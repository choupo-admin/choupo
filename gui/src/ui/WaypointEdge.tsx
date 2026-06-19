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
  WaypointEdge -- a smoothstep stream edge whose BEND is draggable.

  The connections (source/target) are fixed --- this never edits topology.
  It only lets the student slide the orthogonal bend sideways/vertically so
  two streams that the auto-router stacked on top of each other can be
  pulled apart.  Implemented with React Flow's native getSmoothStepPath
  `centerX`/`centerY`, so the look stays identical to a normal smoothstep
  until you nudge it.

  - drag the small handle at the bend  -> moves the centre (stored per
    case in localStorage by FlowCanvas)
  - double-click the handle            -> back to the auto-routed centre
  - handle is invisible until hovered (or until the edge has been moved),
    so a clean flowsheet stays clean.
\*---------------------------------------------------------------------------*/

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useRef, useState } from "react";

import type { XY } from "../state/layout.js";
import { ModelBoundaryBadge, type BoundaryBadgeData } from "./ModelBoundaryBadge.js";

interface WaypointData {
  center?: XY;
  onCenterChange?: (id: string, xy: XY) => void;
  onCommit?: () => void;
  onReset?: (id: string) => void;
  /** Set by FlowCanvas when this stream is a model-boundary audit entry. */
  boundary?: BoundaryBadgeData;
  [k: string]: unknown;
}

export function WaypointEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition, style, markerEnd,
  } = props;
  const data = (props.data ?? {}) as WaypointData;
  const { screenToFlowPosition } = useReactFlow();
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
    centerX: data.center?.x,
    centerY: data.center?.y,
  });

  const moved = data.center !== undefined;
  const color =
    (style as { stroke?: string } | undefined)?.stroke ??
    "var(--mantine-color-accent-5)";

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();   // don't start a canvas pan
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    data.onCenterChange?.(id, { x: p.x, y: p.y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
    data.onCommit?.();        // persist once, on release (not every move)
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onReset?.(id);
    data.onCommit?.();
  };
  // Grabbing the move-point must NOT select the stream (no selection card /
  // banner) --- swallow the click so it never reaches the edge-click path.
  const onClick = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {/* Model-boundary audit chip, docked just below the bend handle so the
          two never overlap.  Signals via a badge only -- the stroke keeps
          its semantic phase colour. */}
      {data.boundary && (
        <ModelBoundaryBadge x={labelX} y={labelY + 16} refused={data.boundary.refused} />
      )}
      <EdgeLabelRenderer>
        {/* Transparent hit area (catches hover even when the dot is
            hidden) with a small visible handle in the middle. */}
        <div
          // `nodrag nopan`: React Flow's pane listens for pointer-drag to
          // PAN the canvas; without these classes grabbing the handle pans
          // the whole sheet instead of moving the bend.  This is the
          // canonical opt-out (stopPropagation alone does NOT stop RF's own
          // native listeners).
          className="nodrag nopan"
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          title="Drag to move this stream's bend; double-click to reset"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
          }}
        >
          {/* A move-point at the centre of EVERY stream: always visible (so
              there's an obvious thing to grab), brighter on hover / once
              moved.  Filled when moved, hollow otherwise. */}
          <div
            style={{
              width: hover ? 12 : 9,
              height: hover ? 12 : 9,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              background: moved ? color : "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
              opacity: moved || hover ? 1 : 0.55,
              transition: "opacity 120ms ease, width 120ms ease, height 120ms ease",
            }}
          />
        </div>
        {/* PFD stream number, just above the bend point (display-only, toggled
            by the SHOW "№ streams" chip). */}
        {data.showNumbers === true && typeof data.num === "number" && (
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 15}px)`,
              pointerEvents: "none",
              fontSize: 10, fontWeight: 700, fontFamily: "monospace", lineHeight: 1,
              padding: "1px 5px", borderRadius: 8,
              color: "light-dark(#fff, #111)",
              background: "light-dark(var(--mantine-color-gray-7), var(--mantine-color-gray-4))",
              border: "1px solid light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.45))",
            }}
          >
            {data.num as number}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
