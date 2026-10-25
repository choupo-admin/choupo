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

import { memo, useMemo, useState, type CSSProperties } from "react";
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

/** One look per block kind: the colour, the corner, the icon, the word. */
const KIND: Record<BlockKind, { word: string; color: string; radius: number; Icon: typeof IconDatabase }> = {
  data:      { word: "DATA",      color: "blue",   radius: 0,  Icon: IconDatabase },
  model:     { word: "MODEL",     color: "violet", radius: 16, Icon: IconMathFunction },
  operation: { word: "OPERATION", color: "cyan",   radius: 4,  Icon: IconSettings2 },
  view:      { word: "VIEW",      color: "teal",   radius: 4,  Icon: IconChartDots },
  unit:      { word: "PROCESS",   color: "orange", radius: 4,  Icon: IconBuildingFactory2 },
};

/** One look per wire: what flows, its colour and its dash. */
export const FLOW: Record<FlowKind, { word: string; stroke: string; dash?: string; width: number }> = {
  measured:  { word: "measured data",      stroke: "#e03131", width: 2 },
  reference: { word: "reference numbers",  stroke: "#f08c00", dash: "7 4", width: 2 },
  record:    { word: "record (equipment, substance)", stroke: "#868e96", dash: "2 4", width: 1.8 },
  model:     { word: "model",              stroke: "#7048e8", dash: "10 4 2 4", width: 2 },
  result:    { word: "results",            stroke: "#0ca678", width: 2.6 },
  proposal:  { word: "record written",    stroke: "#d6336c", dash: "4 3", width: 2 },
};

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
        style={{ textTransform: "none", flex: "0 0 auto", paddingInline: 4 }}>{s.word}</Badge>
    </Tooltip>
  );
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
      <Text span size="10px" c="dimmed" truncate style={{ minWidth: 0 }}>{m.detail}</Text>
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
          <Text size="9px" fw={700} c={`${k.color}.7`} style={{ letterSpacing: 0.4, whiteSpace: "nowrap" }}>
            {k.word}
          </Text>
          <Text size="9px" c="dimmed" truncate>· {b.role}</Text>
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
      <Text size="12px" fw={700} ff="monospace" truncate mt={1}>{b.title}</Text>
      <Text size="10px" c="dimmed" lineClamp={1} title={b.subtitle} style={{ lineHeight: 1.35 }}>{b.subtitle}</Text>
      {shown.length > 0 && (
        <Box mt={3}>
          {shown.map((m) => <Row key={m.id} m={m} active={sel === m.id} h={h} blockId={b.id} />)}
          {more > 0 && (
            <Text size="10px" c="accent.5" style={{ cursor: "pointer", padding: "1px 6px", height: 19 }}
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
              style={{ textTransform: "none" }}>{x}</Badge>
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
      <Text size="11px" fw={700} c="dimmed" px={10} py={4} truncate>{data.label}</Text>
    </Box>
  );
});

const NODE_TYPES = { block: BlockNode, frame: FrameNode };

function Legend({ withStates }: { withStates: boolean }) {
  return (
    <Box style={{ padding: "3px 2px" }} data-map-legend="">
      {withStates && (
        <Group gap={10} wrap="wrap" mb={2} data-map-legend-states="">
          <Text size="10px" c="dimmed">block state:</Text>
          {(Object.keys(BLOCK_STATE) as BlockState[]).map((k) => (
            <Group key={k} gap={4} wrap="nowrap">
              <Badge size="xs" radius="sm" variant={k === "run" ? "light" : k === "notRun" ? "outline" : "filled"}
                color={BLOCK_STATE[k].color} style={{ textTransform: "none", paddingInline: 4 }}>{BLOCK_STATE[k].word}</Badge>
              <Text size="10px">{BLOCK_STATE[k].legend}</Text>
            </Group>
          ))}
        </Group>
      )}
      <Group gap={12} wrap="wrap">
        <Text size="10px" c="dimmed">wires:</Text>
        {(Object.keys(FLOW) as FlowKind[]).map((f) => (
          <Group key={f} gap={4} wrap="nowrap">
            <svg width={26} height={8} aria-hidden><line x1={1} y1={4} x2={25} y2={4}
              stroke={FLOW[f].stroke} strokeWidth={FLOW[f].width} strokeDasharray={FLOW[f].dash} /></svg>
            <Text size="10px">{FLOW[f].word}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

function Canvas({ map, h, wide }: { map: PropsMap; h: PropsMapHandlers; wide: boolean }) {
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
      style: { stroke: f.stroke, strokeWidth: lit ? f.width + 1.2 : f.width, strokeDasharray: f.dash,
               opacity: h.selected && !lit ? 0.35 : 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color: f.stroke, width: 14, height: 14 },
    };
  }), [map, h.selected]);
  const [mini, setMini] = useState(false);
  const scheme = useComputedColorScheme("light");
  return (
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
