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
  PropsMap -- THE CALCULATION MAP OF A PROPS CASE, DRAWN (DEV.md 4c C151).

  The map itself is case/propsMap.ts; this draws it on the canvas technology
  the flowsheet uses (React Flow), READ-ONLY: nothing is dragged, connected
  or edited -- the propsDict, written by an AI, is the source, and the map is
  its reading (gui-credo §2).

  The gestures are the flowsheet's: a single click SELECTS a block or one of
  its rows; F1, a double click or the block's "?" OPENS what the selection is
  about -- a model's theory section, an operation's section, a view's figure
  in Results, a dataset's file in the Case tab.

  Each kind of block has its own shape AND colour AND icon AND word, and each
  kind of wire its own colour AND dash, so no distinction rests on colour
  alone (a greyscale print, a colour-blind reader): the legend says which.

  Every block also carries its STATE (DEV.md 4c C154, case/propsMapState.ts):
  run, failed, not run or stale, as a WORD in the block's header in its own
  colour -- the word, never the colour alone -- and the legend names the four.
\*---------------------------------------------------------------------------*/

import { memo, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ActionIcon, Badge, Box, Group, Text, Tooltip, useComputedColorScheme } from "@mantine/core";
import {
  IconArrowsMaximize, IconArrowsMinimize, IconBuildingFactory2, IconChartDots, IconDatabase, IconHelp,
  IconMathFunction, IconSettings2,
} from "@tabler/icons-react";

import {
  maxRows, type BlockKind, type FlowKind, type MapBlock, type MapMember, type MapTarget, type PropsMap,
} from "../case/propsMap.js";
import { BLOCK_STATE, type BlockState, type MapStates } from "../case/propsMapState.js";
import { useLegibilityFloor } from "./legibilityFloor.js";
import { MIN_TEXT_PX } from "../case/legibility.js";

/** One look per block kind: the colour, the corner, the icon, the word. */
const KIND: Record<BlockKind, { word: string; color: string; radius: number; Icon: typeof IconDatabase }> = {
  data:      { word: "DATA",      color: "blue",   radius: 0,  Icon: IconDatabase },
  model:     { word: "MODEL",     color: "violet", radius: 16, Icon: IconMathFunction },
  operation: { word: "OPERATION", color: "cyan",   radius: 4,  Icon: IconSettings2 },
  view:      { word: "VIEW",      color: "teal",   radius: 4,  Icon: IconChartDots },
  unit:      { word: "PROCESS",   color: "orange", radius: 4,  Icon: IconBuildingFactory2 },
};

/** One look per wire: what flows, its colour and its dash.
 *
 *  EVERY KIND HAS A DASH OF ITS OWN (DEV.md 4c C168 slice 2, ruling (d)):
 *  the audit found "measured data" and "results" both SOLID (red against
 *  green) and "reference numbers" and "record written" both plain dashes
 *  (orange against crimson) -- two pairs told apart by colour alone.  The
 *  patterns now differ in SHAPE (solid, long dash, dash-dot, dots,
 *  dash-dot-dot, short even dash), and the colour is a second channel.
 *  `stroke` is the dark-canvas ink and `light` the light-canvas one, each
 *  >= 3:1 on its map background (white / dark-7). */
export const FLOW: Record<FlowKind, { word: string; stroke: string; light: string; dash?: string; width: number }> = {
  measured:  { word: "measured data",      stroke: "#ff6b6b", light: "#e03131", dash: "14 4", width: 2 },
  reference: { word: "reference numbers",  stroke: "#f08c00", light: "#b35c00", dash: "8 3 2 3", width: 2 },
  record:    { word: "record (equipment, substance)", stroke: "#adb5bd", light: "#6c757d", dash: "1.5 3.5", width: 1.8 },
  model:     { word: "model",              stroke: "#9775fa", light: "#7048e8", dash: "10 3 2 3 2 3", width: 2 },
  result:    { word: "results",            stroke: "#20c997", light: "#087f5b", width: 2.6 },
  proposal:  { word: "record written",    stroke: "#f06595", light: "#c2255c", dash: "5 5", width: 2 },
};

/** The wire ink for the UI scheme. */
const inkOf = (f: FlowKind, scheme: "light" | "dark") => (scheme === "dark" ? FLOW[f].stroke : FLOW[f].light);

export interface PropsMapHandlers {
  selected: string | null;
  onSelect: (blockId: string, memberId?: string) => void;
  onActivate: (t: MapTarget) => void;
  onToggle: (group: string) => void;
  /** each block's state in the last run (absent: drawn without one) */
  states?: MapStates;
}

/** The state word of a block: ink AND colour, and the reason on hover. */
function StateWord({ state, why }: { state: BlockState; why: string }) {
  const s = BLOCK_STATE[state];
  return (
    <Tooltip label={`${s.word}: ${why}`} withArrow multiline maw={300}>
      <Badge size="xs" radius="sm" variant={state === "run" ? "light" : state === "notRun" ? "outline" : "filled"}
        color={s.color} data-block-state={state}
        style={{ textTransform: "none", flex: "0 0 auto", paddingInline: 4, ...stateInk(state) }}>{s.word}</Badge>
    </Tooltip>
  );
}

/** The state badge at the one minimum size (11 px; Mantine's xs is 9), its
 *  word in an ink that holds 4.5:1 on its own tint -- the light variant's
 *  teal "run" measured 2.1:1 (C168 audit). */
function stateInk(state: BlockState): CSSProperties {
  const c = BLOCK_STATE[state].color;
  const base: CSSProperties = { fontSize: 11, height: 18 };
  if (state === "run" || state === "notRun")
    return { ...base, color: `light-dark(var(--mantine-color-${c}-9), var(--mantine-color-${c}-2))` };
  return base;
}

type BlockData = { block: MapBlock; h: PropsMapHandlers };

function Row({ m, active, h, blockId }: { m: MapMember; active: boolean; h: PropsMapHandlers; blockId: string }) {
  return (
    <Box
      data-map-member={m.id}
      onClick={(e) => { e.stopPropagation(); h.onSelect(blockId, m.id); }}
      onDoubleClick={(e) => { e.stopPropagation(); h.onActivate(m.target); }}
      title={`${m.detail}\n${m.target.label} -- double-click or F1`}
      style={{
        cursor: "pointer", padding: "1px 6px", borderRadius: 3, height: 19, overflow: "hidden",
        display: "flex", gap: 6, alignItems: "baseline",
        background: active ? "light-dark(var(--mantine-color-yellow-1), rgba(250,204,21,0.18))" : undefined,
      }}
    >
      <Text span size="11px" ff="monospace" fw={600} style={{ whiteSpace: "nowrap" }}>{m.label}</Text>
      <Text span size="11px" c="dimmed" truncate style={{ minWidth: 0 }}>{m.detail}</Text>
    </Box>
  );
}

const BlockNode = memo(function BlockNode({ data }: NodeProps<Node<BlockData>>) {
  const { block: b, h } = data;
  const k = KIND[b.kind];
  const sel = h.selected;
  const isSel = sel === b.id || b.members.some((m) => m.id === sel);
  const shown = b.members.length > 1 ? b.members.slice(0, maxRows(b.kind)) : [];
  const more = b.members.length - shown.length;
  const border = `var(--mantine-color-${k.color}-${isSel ? 7 : 5})`;
  const style: CSSProperties = {
    width: b.w, height: b.h, boxSizing: "border-box",
    borderRadius: k.radius,
    border: `${b.kind === "operation" ? 2 : 1.5}px solid ${border}`,
    borderLeft: b.kind === "data" ? `6px solid ${border}` : undefined,
    outline: b.kind === "view" ? `1.5px solid ${border}` : undefined,
    outlineOffset: b.kind === "view" ? 2 : undefined,
    background: `light-dark(var(--mantine-color-${k.color}-0), var(--mantine-color-dark-6))`,
    boxShadow: isSel ? `0 0 0 3px var(--mantine-color-yellow-5)` : "0 1px 2px rgba(0,0,0,0.12)",
    padding: "5px 6px 4px 8px", overflow: "hidden", cursor: "pointer",
  };
  const target = b.members.length === 1 ? b.members[0]!.target : b.members[0]?.target;
  return (
    <Box style={style} data-map-block={b.id} data-map-kind={b.kind}
      onDoubleClick={() => target && h.onActivate(target)}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, left: 0 }} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, right: 0 }} isConnectable={false} />
      <Group gap={4} wrap="nowrap" justify="space-between">
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          <k.Icon size={13} color={`var(--mantine-color-${k.color}-6)`} />
          <Text size="11px" fw={700} c={`${k.color}.9`} style={{ letterSpacing: 0.4, whiteSpace: "nowrap" }}>
            {k.word}
          </Text>
          <Text size="11px" c="dimmed" truncate>· {b.role}</Text>
        </Group>
        <Group gap={0} wrap="nowrap">
          {h.states?.block.get(b.id) && (
            <StateWord state={h.states.block.get(b.id)!.state} why={h.states.block.get(b.id)!.why} />
          )}
          {b.expandable && (
            <Tooltip label={b.expanded ? "draw these as one block" : "draw each one as its own block"} withArrow>
              <ActionIcon size={16} variant="subtle" color="gray" aria-label="expand"
                onClick={(e) => { e.stopPropagation(); h.onToggle(b.group); }}>
                {b.expanded ? <IconArrowsMinimize size={11} /> : <IconArrowsMaximize size={11} />}
              </ActionIcon>
            </Tooltip>
          )}
          {target && (
            <Tooltip label={`${target.label} (F1)`} withArrow multiline maw={280}>
              <ActionIcon size={16} variant="subtle" color={k.color} aria-label="help"
                onClick={(e) => { e.stopPropagation(); h.onActivate(target); }}>
                <IconHelp size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      {/* PRIMARY for the legibility floor: at fit the title is kept at
          the minimum while the rows and badges are hidden (case/legibility.ts) */}
      <Text size="13px" fw={700} ff="monospace" truncate mt={1} data-legible-primary="">{b.title}</Text>
      <Text size="11px" c="dimmed" lineClamp={1} title={b.subtitle} style={{ lineHeight: 1.35 }}>{b.subtitle}</Text>
      {shown.length > 0 && (
        <Box mt={3}>
          {shown.map((m) => <Row key={m.id} m={m} active={sel === m.id} h={h} blockId={b.id} />)}
          {more > 0 && (
            <Text size="11px" c="accent.9" style={{ cursor: "pointer", padding: "1px 6px", height: 19 }}
              onClick={(e) => { e.stopPropagation(); h.onToggle(b.group); }}>
              + {more} more -- draw each
            </Text>
          )}
        </Box>
      )}
      {b.badges.length > 0 && (
        <Group gap={3} mt={3} wrap="nowrap" style={{ overflow: "hidden" }}>
          {b.badges.slice(0, 3).map((x) => (
            <Badge key={x} size="xs" variant="light" color={x === "validated" || x.startsWith("validated ") ? "teal"
              : x.startsWith("not") || x.includes("without") ? "orange" : "gray"}
              style={{ textTransform: "none", fontSize: 11, height: 18 }}>{x}</Badge>
          ))}
        </Group>
      )}
    </Box>
  );
});

type FrameData = { label: string; title: string; w: number; h: number };
const FrameNode = memo(function FrameNode({ data }: NodeProps<Node<FrameData>>) {
  return (
    <Box title={data.title} style={{
      width: data.w, height: data.h, borderRadius: 8, pointerEvents: "none",
      border: "1.5px dashed light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-3))",
      background: "light-dark(rgba(0,0,0,0.018), rgba(255,255,255,0.025))",
    }}>
      {/* the study's name: PRIMARY for the legibility floor (C168 slice 2) */}
      <Text size="12px" fw={700} c="dimmed" px={10} py={4} truncate data-legible-primary="">{data.label}</Text>
    </Box>
  );
});

const NODE_TYPES = { block: BlockNode, frame: FrameNode };

function Legend({ withStates }: { withStates: boolean }) {
  const scheme = useComputedColorScheme("light");
  return (
    <Box style={{ padding: "3px 2px" }} data-map-legend="">
      {withStates && (
        <Group gap={10} wrap="wrap" mb={2} data-map-legend-states="">
          <Text size="11px" c="dimmed">block state:</Text>
          {(Object.keys(BLOCK_STATE) as BlockState[]).map((k) => (
            <Group key={k} gap={4} wrap="nowrap">
              <Badge size="xs" radius="sm" variant={k === "run" ? "light" : k === "notRun" ? "outline" : "filled"}
                color={BLOCK_STATE[k].color} style={{ textTransform: "none", paddingInline: 4, ...stateInk(k) }}>{BLOCK_STATE[k].word}</Badge>
              <Text size="11px">{BLOCK_STATE[k].legend}</Text>
            </Group>
          ))}
        </Group>
      )}
      <Group gap={12} wrap="wrap">
        <Text size="11px" c="dimmed">wires:</Text>
        {(Object.keys(FLOW) as FlowKind[]).map((f) => (
          <Group key={f} gap={4} wrap="nowrap">
            <svg width={40} height={8} aria-hidden data-wire-kind={f}><line x1={1} y1={4} x2={39} y2={4}
              stroke={inkOf(f, scheme)} strokeWidth={FLOW[f].width} strokeDasharray={FLOW[f].dash} /></svg>
            <Text size="11px">{FLOW[f].word}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

function Canvas({ map, h, wide }: { map: PropsMap; h: PropsMapHandlers; wide: boolean }) {
  const scheme = useComputedColorScheme("light");
  //  THE LEGIBILITY FLOOR (C168 slice 2, ruling (c)): the map at fit drew
  //  every label at 4.7 px (zoom 0.52); now a label is drawn at the minimum
  //  or not at all, block titles kept, and the full graph is one zoom away.
  const rootRef = useRef<HTMLDivElement>(null);
  const legibility = useLegibilityFloor(rootRef);
  const nodes = useMemo<Node[]>(() => [
    ...map.bands.filter((b) => b.framed).map((b) => ({
      id: `band:${b.index}`, type: "frame", position: { x: b.x, y: b.y }, zIndex: -1,
      selectable: false, draggable: false, focusable: false,
      data: { label: b.label, title: b.title, w: b.w, h: b.h },
    })),
    ...map.blocks.map((b) => ({
      id: b.id, type: "block", position: { x: b.x, y: b.y }, draggable: false, connectable: false,
      data: { block: b, h }, width: b.w, height: b.h,
    })),
  ], [map, h]);
  const edges = useMemo<Edge[]>(() => map.edges.map((e) => {
    const f = FLOW[e.flow];
    const lit = !!h.selected && (map.blockOf.get(h.selected) === e.from || map.blockOf.get(h.selected) === e.to
      || h.selected === e.from || h.selected === e.to);
    return {
      id: e.id, source: e.from, target: e.to, type: "default", focusable: false, selectable: false,
      style: { stroke: inkOf(e.flow, scheme), strokeWidth: lit ? f.width + 1.2 : f.width, strokeDasharray: f.dash,
               opacity: h.selected && !lit ? 0.35 : 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color: inkOf(e.flow, scheme), width: 14, height: 14 },
    };
  }), [map, h.selected, scheme]);
  const [mini, setMini] = useState(false);
  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%" }}>
    {legibility === "overview" && (
      <Text size="11px" fw={600} data-legibility-hint="" style={{ position: "absolute", left: 8, bottom: 6, zIndex: 5,
        padding: "2px 6px", borderRadius: 4, pointerEvents: "none",
        background: "light-dark(rgba(255,255,255,0.92), rgba(0,0,0,0.6))" }}>
        Overview: labels under {MIN_TEXT_PX} px are hidden -- zoom in (+, wheel) to read them
      </Text>
    )}
    <ReactFlow
      colorMode={scheme}
      nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
      fitView fitViewOptions={{ padding: 0.06 }} minZoom={0.2} maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      onInit={(inst) => {
        //  Fit once the box has its size, then offer a minimap only where
        //  the fitted map is drawn below a readable zoom AND the box is wide
        //  enough to spare the corner (on a phone it would cover the map).
        requestAnimationFrame(() => {
          inst.fitView({ padding: 0.06 });
          requestAnimationFrame(() => setMini(inst.getZoom() < 0.7 && wide && window.innerWidth > 900));
        });
      }}
      onNodeClick={(_, n) => { if (n.type === "block") h.onSelect(n.id); }}
      onPaneClick={() => h.onSelect("")}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} position="top-right" />
      {mini && <MiniMap pannable zoomable position="bottom-right"
        bgColor={scheme === "dark" ? "#1f1f1f" : undefined}
        nodeColor={(n) => n.type === "frame" ? "transparent"
          : `var(--mantine-color-${KIND[(n.data as BlockData).block.kind].color}-4)`} />}
    </ReactFlow>
    </div>
  );
}

export function PropsMapCanvas({ map, handlers, height, wide = true }: {
  map: PropsMap; handlers: PropsMapHandlers;
  /** a fixed height in px; omitted, the canvas FILLS its parent (the
   *  calculation-map panel the reader resizes, DEV.md 4c C153) */
  height?: number;
  /** room for a minimap in the corner */
  wide?: boolean;
}) {
  const fill = height === undefined;
  return (
    <Box style={fill ? { height: "100%", display: "flex", flexDirection: "column", minHeight: 0 } : undefined}>
    <Box data-review="map" style={{
      position: "relative",
      ...(fill ? { flex: "1 1 0px", minHeight: 0 } : { height, minHeight: 260 }),
      border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      borderRadius: 6, overflow: "hidden",
      background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
    }}>
      {/* keyed on the drawn blocks: an expand or a collapse re-fits the view */}
      <ReactFlowProvider key={map.blocks.map((b) => b.id).join("|")}>
        <Canvas map={map} h={handlers} wide={wide} />
      </ReactFlowProvider>
    </Box>
    <Legend withStates={!!handlers.states} />
    </Box>
  );
}
