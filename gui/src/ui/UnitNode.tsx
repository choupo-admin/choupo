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
  Custom React Flow node for a unit operation.
  Visual: rounded panel with a type icon, the unit's instance name, the
  unit-op type, and a compact key-value summary of the operation block.
\*---------------------------------------------------------------------------*/

import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { Badge, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useRef } from "react";

import type { HandlePos, HandleSide } from "../state/layout.js";
import type { UnitSpec } from "../case/types.js";
import type { JsonValue } from "../dict/index.js";
import { scalarToSI } from "../dict/scalarSI.js";
import { UNIT_LABEL, unitIconFor } from "./unitIcons.js";
import { operationSchemaFor, type OperationSchema } from "../case/operationSchemas.js";
import { COLUMN_TYPES, HEAT_DUTY_TYPES, COOLING_DUTY_TYPES, PHASE_SPLIT_TYPES } from "../case/dutyTypes.js";
import { useStore } from "../state/store.js";
import {
  type DisplayPrefs,
  authoredScalarToPrefs,
} from "../state/displayUnits.js";

interface UnitNodeData {
  unit: UnitSpec;
  /** True when this node has its OWN case folder (a sector with a.cho),
   *  so double-clicking it opens that sub-case in a new window.  Computed
   *  in FlowCanvas; rendered here as a small external-link mark. */
  drillable?: boolean;
  /** Per-handle border-position overrides (keyed by handle id), so the
   *  user can slide a connection point along the rectangle.  Plus the
   *  callbacks to update / persist / reset them (wired by FlowCanvas). */
  handleOverrides?: { [handleId: string]: HandlePos };
  onHandleMove?: (unitId: string, handleId: string, pos: HandlePos) => void;
  onHandleCommit?: () => void;
  onHandleReset?: (unitId: string, handleId: string) => void;
  /** Column ports that are heat-linked (feed an energy wire); their handle
   *  becomes a SOURCE instead of a utility-stub target. */
  heatLinkedPorts?: string[];
  /** This unit gets a ⚡ power stub (grid-drawing pump/compressor or a
   *  generator) -> render its bottom-centre docking handle. */
  powerStub?: boolean;
  [key: string]: unknown;
}

const POSITION_OF: Record<HandleSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export function UnitNode({ id, data, selected }: NodeProps) {
  const { unit, drillable, handleOverrides, onHandleMove, onHandleCommit, onHandleReset } =
    data as UnitNodeData;
  const prefs = useStore((s) => s.displayPrefs);
  // Resolved per-unit values from the last run.  A `$ref` in the operation
  // block (e.g. an iteratively-resolved duty `Q $Q_meoh`) shows its CONVERGED
  // value here once a run has produced it -- not the raw `$ref` placeholder.
  const kpis = useStore((s) => s.runResult?.kpis?.[unit.name]);
  const nodeRef = useRef<HTMLDivElement>(null);

  // React Flow caches handle bounds; when a connection point moves to a new
  // border position we must tell it to recompute, or the edge endpoint
  // stays at the old spot.  Fires whenever this node's overrides change.
  const updateNodeInternals = useUpdateNodeInternals();
  const overrideKey = JSON.stringify((data as UnitNodeData).handleOverrides ?? {});
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, overrideKey, updateNodeInternals]);
  const icon = unitIconFor(unit.type, 18);
  const label = UNIT_LABEL[unit.type] ?? unit.type;
  const opSummary = summarise(unit.operation, operationSchemaFor(unit.type) ?? undefined, prefs, kpis);

  // One handle per stream (in / outputs), spread vertically.  React Flow
  // resolves edges to specific handles via `id`; toGraph.ts sets
  // edge.targetHandle / edge.sourceHandle to the stream name, so each
  // input stream lands on its OWN dot and each output leaves from its
  // OWN dot.  Avoids the "all wires converge to a single point" mess
  // when a unit has multiple inputs or outputs (e.g. the // evaporator: 2 inputs, 3 outputs).
  const inputs = Array.isArray(unit.in) ? unit.in : [unit.in];
  const outputs = unit.outputs;

  // Every connection point can be slid along the rectangle's border: its
  // default placement (inputs left, outputs right, energy bottom) is just a
  // starting point, overridden per-handle by the persisted layout.  Drag a
  // dot to its new border position; double-click resets it.
  const hProps = (handleId: string, defaultSide: HandleSide, defaultFrac: number) => ({
    handleId,
    defaultSide,
    defaultFrac,
    override: handleOverrides?.[handleId],
    nodeRef,
    unitId: id,
    onMove: onHandleMove,
    onCommit: onHandleCommit,
    onReset: onHandleReset,
  });

  return (
    <div
      ref={nodeRef}
      style={{
        background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
        border: `1.5px solid ${selected ? "var(--mantine-color-accent-5)" : "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))"}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 190,
        boxShadow: selected
          ? "0 0 0 3px rgba(38, 198, 218, 0.15)"
        : "0 1px 3px rgba(0,0,0,0.4)",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {inputs.map((name, i) => (
        <DraggableHandle
          key={`in-${name}`}
          type="target"
          {...hProps(name, "left", defaultFrac(i, inputs.length))}
        />
      ))}
      {/* Energy-wire handles (default bottom): a unit that CONSUMES shaft
          work / heat (energyInputs) exposes an `energy-in` target; one that
          PRODUCES it (energyOutputs) exposes an `energy-out` source.  These
          are what the dashed W/Q edges attach to.  Amber to read as energy. */}
      {unit.energyInputs && unit.energyInputs.length > 0 && (
        <DraggableHandle
          type="target"
          color="#fab005"
          {...hProps("energy-in", "bottom", 0.35)}
        />
      )}
      {/* Recipe-edge handles (batch campaigns): a vessel that SOURCES a
          dashed recipe/discharge edge exposes `recipe-out`; a destination
          exposes `recipe-in`.  Teal, matching the dashed recipe edges --
          without a named handle React Flow drops the edge silently. */}
      {Boolean((data as { recipeIn?: boolean }).recipeIn) && (
        <DraggableHandle
          type="target"
          color="#20c997"
          {...hProps("recipe-in", "top", 0.5)}
        />
      )}
      {Boolean((data as { recipeOut?: boolean }).recipeOut) && (
        <DraggableHandle
          type="source"
          color="#20c997"
          {...hProps("recipe-out", "bottom", 0.5)}
        />
      )}
      {unit.energyOutputs && unit.energyOutputs.length > 0 && (
        <DraggableHandle
          type="source"
          color="#fab005"
          {...hProps("energy-out", "bottom", 0.65)}
        />
      )}
      {/* A distillation column's intrinsic heat ports: reboiler docks at the
          BASE (heating), condenser at the TOP (cooling).  Fixed anchors for
          the dashed duty stubs (toGraph synthesises the utility terminals);
          not draggable --- the base/top placement IS the pedagogy. */}
      {COLUMN_TYPES.has(unit.type) && (() => {
        const linked = (data as UnitNodeData).heatLinkedPorts ?? [];
        // A heat-linked port feeds an energy wire OUT (source); an unlinked
        // port receives its utility stub (target).
        return (
          <>
            <Handle id="reboiler" type={linked.includes("reboiler") ? "source" : "target"}
              position={Position.Bottom} isConnectable={false}
              style={{ left: "50%", background: "#e8590c", width: 8, height: 8, pointerEvents: "none" }} />
            <Handle id="condenser" type={linked.includes("condenser") ? "source" : "target"}
              position={Position.Top} isConnectable={false}
              style={{ left: "50%", background: "#22b8cf", width: 8, height: 8, pointerEvents: "none" }} />
          </>
        );
      })()}
      {/* A heater / cooler's single intrinsic heat duty: one anchor for the
          dashed duty stub, so its edge docks HERE (bottom if heating, top if
          cooling) instead of bunching onto the material-stream handle. */}
      {HEAT_DUTY_TYPES.has(unit.type) && (() => {
        const q = (unit.operation as { Q?: unknown }).Q;
        const heating = typeof q === "number" ? q >= 0 : !COOLING_DUTY_TYPES.has(unit.type);
        return (
          <Handle id="Q" type="target" isConnectable={false}
            position={heating ? Position.Bottom : Position.Top}
            style={{ left: "50%", background: heating ? "#e8590c" : "#22b8cf",
                     width: 8, height: 8, pointerEvents: "none" }} />
        );
      })()}
      {/* The ⚡ power stub's anchor: a pump/compressor MOTOR (or a generator)
          docks its electricity stub HERE (bottom-centre), so the dashed edge
          lands on a dedicated point instead of grabbing the outlet stream. */}
      {(data as UnitNodeData).powerStub && (
        <Handle id="power" type="target" isConnectable={false}
          position={Position.Bottom}
          style={{ left: "50%", background: "#9775fa",
                   width: 8, height: 8, pointerEvents: "none" }} />
      )}
      <Stack gap={4}>
        <Group gap={8} wrap="nowrap" justify="space-between">
          <Group gap={8} wrap="nowrap">
            <span
              style={{
                color: "var(--mantine-color-accent-4)",
                display: "inline-flex",
              }}
            >
              {icon}
            </span>
            <Text fw={700} size="md" c="var(--mantine-color-text)">
              {unit.name}
            </Text>
          </Group>
          {drillable && (
            <Tooltip label="Double-click to open this node as a case in a new window" withArrow>
              <span style={{ color: "var(--mantine-color-accent-4)", display: "inline-flex", opacity: 0.75 }}>
                <IconExternalLink size={13} />
              </span>
            </Tooltip>
          )}
        </Group>
        <Group gap={4} style={{ alignSelf: "flex-start" }}>
          {/* tt="none": ALL-CAPS is reserved for SECTOR names (the
              UPPER_CASE naming convention, docs/ai/case-layout.md).  A unit
              TYPE must read in its natural case ("Heat Exchanger", not
              "HEAT EXCHANGER") so it is never mistaken for a sector. */}
          <Badge color="accent" variant="light" size="xs" radius="sm" tt="none">
            {label}
          </Badge>
          {typeof unit.model === "string" && unit.model && (
            <Badge color="gray" variant="light" size="xs" radius="sm" tt="none">
              {unit.model}
            </Badge>
          )}
        </Group>
        {opSummary.length > 0 && (
          <Stack gap={2} mt={4}>
            {opSummary.map(({ k, v }) => (
              <Text key={k} size="xs" c="dimmed" ff="monospace">
                {k} = {v}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
      {outputs.map((name, i) => {
        // Vapour/liquid separators leave vapour at the TOP, liquid at the
        // BOTTOM (PFD flash-drum convention) -- so their output slots are
        // placed in REVERSE order, matching the reversed product terminals
        // in toGraph.ts (shared PHASE_SPLIT_TYPES) so wires never cross.
        const rank = PHASE_SPLIT_TYPES.has(unit.type) ? outputs.length - 1 - i : i;
        return (
          <DraggableHandle
            key={`out-${name}`}
            type="source"
            {...hProps(name, "right", defaultFrac(rank, outputs.length))}
          />
        );
      })}
    </div>
  );
}

// Default fraction along a side for handle i of n.  One handle -> 0.5
// (centred); 2+ spread between 0.25 and 0.75 (inset off the rounded
// corners).  Overridden once the user drags the handle.
function defaultFrac(i: number, n: number): number {
  if (n <= 1) return 0.5;
  return 0.25 + 0.5 * (i / (n - 1));
}

// A connection point that can be dragged along the node's border.  It is a
// normal React Flow Handle (edges attach by id), but `isConnectable={false}`
// (this GUI never creates connections) frees the drag gesture to REPOSITION
// it instead.  `nodrag nopan` stops the drag from moving the node / panning
// the canvas.  The side it snaps to sets the Handle's `position`, so the
// edge re-routes from the correct direction automatically.
function DraggableHandle({
  handleId, type, defaultSide, defaultFrac: dFrac, override, nodeRef, unitId,
  onMove, onCommit, onReset, color,
}: {
  handleId: string;
  type: "source" | "target";
  defaultSide: HandleSide;
  defaultFrac: number;
  override?: HandlePos;
  nodeRef: React.RefObject<HTMLDivElement | null>;
  unitId: string;
  onMove?: (unitId: string, handleId: string, pos: HandlePos) => void;
  onCommit?: () => void;
  onReset?: (unitId: string, handleId: string) => void;
  color?: string;
}) {
  const dragging = useRef(false);
  const side = override?.side ?? defaultSide;
  const frac = override?.frac ?? dFrac;
  const moved = override !== undefined;

  // Place along the chosen side: left/right vary `top`, top/bottom vary `left`.
  const along = `${(frac * 100).toFixed(1)}%`;
  const posStyle: React.CSSProperties =
    side === "left" || side === "right" ? { top: along } : { left: along };

  const nearestBorder = (clientX: number, clientY: number): HandlePos | null => {
    const r = nodeRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    const x = clientX - r.left;
    const y = clientY - r.top;
    const fx = Math.max(0.04, Math.min(0.96, x / r.width));
    const fy = Math.max(0.04, Math.min(0.96, y / r.height));
    const cands: Array<{ side: HandleSide; d: number; frac: number }> = [
      { side: "left",   d: Math.abs(x),           frac: fy },
      { side: "right",  d: Math.abs(r.width - x),  frac: fy },
      { side: "top",    d: Math.abs(y),           frac: fx },
      { side: "bottom", d: Math.abs(r.height - y), frac: fx },
    ];
    return cands.reduce((a, b) => (b.d < a.d ? b : a));
  };

  return (
    <Handle
      id={handleId}
      type={type}
      position={POSITION_OF[side]}
      isConnectable={false}
      className="nodrag nopan"
      title="Drag to move this connection point along the border; double-click to reset"
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        dragging.current = true;
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const pos = nearestBorder(e.clientX, e.clientY);
        if (pos) onMove?.(unitId, handleId, pos);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        (e.target as Element).releasePointerCapture(e.pointerId);
        onCommit?.();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset?.(unitId, handleId);
        onCommit?.();
      }}
      style={{
...posStyle,
        // React Flow's CSS sets `pointer-events: none` on a non-connectable
        // handle (only `.connectionindicator` gets events).  We disabled
        // connections, so force events back on or the drag never fires.
        pointerEvents: "all",
        width: 11,
        height: 11,
        cursor: "grab",
        ...(color ? { background: color } : {}),
        ...(moved ? { boxShadow: "0 0 0 2px rgba(255,255,255,0.25)" } : {}),
      }}
    />
  );
}

// Build the compact node summary, converting numeric values to the
// student's chosen display units.  The operation block stores canonical
// SI (the dict parser converts on load); the schema tells us each field's
// dimension (K / Pa / kmol/s), so we mirror the Property panel's
// renderFieldValue here instead of dumping raw SI.
function summarise(op: { [k: string]: JsonValue },
  schema: OperationSchema | undefined,
  prefs: DisplayPrefs,
  kpis?: { [key: string]: number },
): { k: string; v: string }[] {
  const unitOf = (key: string): string | undefined =>
    schema?.fields.find((f) => f.key === key)?.unit;
  const out: { k: string; v: string }[] = [];
  for (const [k, v] of Object.entries(op)) {
    if (typeof v === "number") out.push({ k, v: fmtScalar(v, unitOf(k), prefs) });
    else if (typeof v === "string") {
      // A `$ref` (e.g. an iteratively-resolved duty) shows its converged value
      // once a run produced it -- the engine reports it under the same key in
      // this unit's kpis.  Before any run it stays the `$ref` placeholder.
      const resolved = v.startsWith("$") && kpis && typeof kpis[k] === "number"
        ? kpis[k] : undefined;
      if (resolved !== undefined) {
        out.push({ k, v: fmtScalar(resolved, unitOf(k), prefs) });
      } else {
        // A unit-carrying authored scalar ("1.01325 bar", "380 K", "100 kmol/h")
        // is stored as a STRING (dict/scalarSI.ts).  Turn it back into canonical
        // SI with the blessed helper, then format it through the SAME path as
        // numeric params so node params FOLLOW the units menu + sig figs, instead
        // of being dumped raw at full authored precision.
        const si = scalarToSI(v);
        out.push({ k, v: Number.isFinite(si) ? fmtScalar(si, unitOf(k), prefs) : v });
      }
    }
    if (out.length >= 3) break;
  }
  return out;
}

// One numeric operation value, converted + unit-suffixed when the schema
// declares a dimension the GUI knows; otherwise the schema's unit as-is.
function fmtScalar(v: number, unit: string | undefined, prefs: DisplayPrefs): string {
  // Convert an AUTHORED param (bar / degC / kmol/h, as well as canonical
  // Pa / K / kmol/s) into the user's display prefs, so node params FOLLOW the
  // units menu exactly like the Streams table -- no more "P = 1 bar" on a node
  // whose streams read "100000 Pa".  (formatX inside uses DEFAULT_SIG sig figs,
  // matching the table.)
  const conv = authoredScalarToPrefs(v, unit, prefs);
  if (conv !== null) return conv;
  // Energy rates (duties Q, shaft work W) are stored in W (SI); show them in kW
  // like the column duty stubs, so every duty on the canvas reads the same way.
  if (unit === "W") return `${(v / 1000).toFixed(1)} kW`;
  return unit ? `${fmtNumber(v)} ${unit}` : fmtNumber(v);
}

function fmtNumber(n: number): string {
  if (Math.abs(n) >= 10000 || (n !== 0 && Math.abs(n) < 0.01)) {
    return n.toExponential(2);
  }
  return String(n);
}

// (duty is shown as an energy STREAM on the flowsheet — a docked utility stub +
//  dashed wire synthesised in toGraph.ts — not as a line on the node.)
