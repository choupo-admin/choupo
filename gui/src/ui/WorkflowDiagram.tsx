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
  WorkflowDiagram -- A PROPERTIES CASE'S HOME: ITS WORKFLOW, DRAWN WITH THE
  FLOWSHEET'S OWN GRAMMAR (DEV.md 4c C172 slice 3b; Vitor's ruling of
  2026-10-26, case/workflowDiagram.ts carries why the analogy is exact).

  The same canvas as the flowsheet (ui/FlowCanvas.tsx), not a look-alike:
  React Flow with the same dot grid, controls, fit (ui/flowsheetViewport.ts),
  minimum zoom, legibility floor (ui/legibilityFloor.ts), arrowheads, wire
  marks (ui/WaypointEdge.tsx), WIRES legend, key line and selection card
  (ui/canvasChrome.tsx); boxes and terminals in the same card styles
  (ui/nodeCard.ts).  What differs is only what is drawn:

    a STEP box      the step's number and name, its type (a badge, as a
                    unit's), and its contents written on it: the model and
                    its main options, what it reads (FIT / HELD OUT), what it
                    writes, the figures it feeds, its state and verdict;
    a TERMINAL      a feed (data from outside), the "Flowsheet run" (a file
                    the process run writes), a product (what leaves);
    a STUDY FRAME   around its steps, lettered by position.

  Single click selects (the card shows the step: PropertyPanel); double
  click, Enter or the card's "Open" opens the step in its own TAB, as a
  double click drills into a unit on the flowsheet.  The arrangement is
  DERIVED (nothing is dragged and nothing is kept): the diagram is the
  case's declaration drawn, so it is the same for every reader.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Controls, Handle, Panel, Position, ReactFlow, ReactFlowProvider,
  useNodesInitialized, useReactFlow, useStore as useFlowStore, useStoreApi,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge, Group, Text, useComputedColorScheme } from "@mantine/core";
import { IconBuildingFactory2 } from "@tabler/icons-react";

import {
  STEP_HEAD_H, STEP_LINE_H, STEP_PAD_Y, WIRES,
  type DiagramFrame, type DiagramStep, type DiagramTerminal, type WireKind,
} from "../case/workflowDiagram.js";
import { RUN_STATE_WORD } from "../case/reviewScreen.js";
import { useStore } from "../state/store.js";
import { useLegibilityFloor } from "./legibilityFloor.js";
import { FLOWSHEET_MIN_ZOOM, flowsheetFitFor } from "./flowsheetViewport.js";
import { arrowMarker, CanvasBackground, CanvasKeyHint, CANVAS_BG, SelectionCard, WireLegend } from "./canvasChrome.js";
import { nodeCardStyle, terminalCardStyle, TERMINAL_BORDER } from "./nodeCard.js";
import { PropertyPanel } from "./PropertyPanel.js";
import { WaypointEdge } from "./WaypointEdge.js";
import { openStepTab } from "./stepTab.js";
import type { WorkflowModel } from "./useWorkflowModel.js";

/** The top margin of the fit: one legend row floats above the drawing
 *  (the flowsheet's SHOW row and legend column need 150 px). */
const FIT_TOP_PX = 64;

/** A unit's type badge at the one minimum text size (as ui/UnitNode.tsx). */
const BADGE_11 = { root: { fontSize: 11, height: 18 } } as const;

type Scheme = "light" | "dark";
const inkOf = (w: WireKind, scheme: Scheme) => (scheme === "dark" ? WIRES[w].dark : WIRES[w].light);

/* ---- the nodes ------------------------------------------------------------ */

interface StepData { step: DiagramStep; stale: boolean; [k: string]: unknown }

const LINE_COLOUR: Partial<Record<string, string>> = {
  reads: "var(--mantine-color-text)", writes: "var(--mantine-color-text)",
};

function StepNode({ data, selected }: NodeProps) {
  const { step, stale } = data as StepData;
  const typeLine = step.lines.find((l) => l.kind === "type");
  const body = step.lines.filter((l) => l.kind !== "type" && l.kind !== "state");
  const stateLine = step.lines.find((l) => l.kind === "state");
  return (
    <div data-workflow-step={step.stepId} data-step-number={step.number} data-step-state={step.state}
      style={{ ...nodeCardStyle(!!selected), width: step.w, height: step.h, boxSizing: "border-box",
        padding: `${STEP_PAD_Y}px 14px`, overflow: "hidden" }}>
      <Handle type="target" position={Position.Left} />
      {/*  PRIMARY for the legibility floor: at fit the step's number and
           name are kept at the minimum size while its lines hide -- the
           overview still says what is what, as a unit's name does. */}
      <Group gap={8} wrap="nowrap" align="baseline" data-legible-primary="" style={{ height: STEP_HEAD_H }}>
        <Text fw={700} size="md" ff="monospace" c="var(--mantine-color-text)" style={{ flex: "0 0 auto" }}>
          {step.number}
        </Text>
        <Text fw={700} size="md" c="var(--mantine-color-text)" truncate title={step.label} style={{ minWidth: 0 }}>
          {step.label}
        </Text>
      </Group>
      {typeLine && (
        <Group gap={4} wrap="nowrap" style={{ height: STEP_LINE_H }} title={typeLine.title}>
          <Badge color="accent" variant="light" size="xs" radius="sm" tt="none" styles={BADGE_11}>{step.type}</Badge>
          {step.runs > 1 && (
            <Badge color="gray" variant="light" size="xs" radius="sm" tt="none" styles={BADGE_11}>{step.runs} runs</Badge>
          )}
        </Group>
      )}
      {body.map((l, i) => (
        <Text key={i} size="12px" ff="monospace" c={LINE_COLOUR[l.kind] ?? "dimmed"} truncate title={l.title}
          data-step-line={l.kind}
          style={{ lineHeight: `${STEP_LINE_H}px`, height: STEP_LINE_H, paddingLeft: l.kind === "options" ? 10 : 0 }}>
          {l.text}
        </Text>
      ))}
      {stateLine && (
        //  the state as a glyph AND a word; STALE (a part it reads changed
        //  since the run, case/propsMapState.ts) wins over what the run said
        <Text size="12px" ff="monospace" fw={600} truncate
          title={stale ? "stale: a part of the case this step reads changed since the run -- run it again" : stateLine.title}
          c={stale ? "orange.8" : step.state === "failed" ? "red.7" : step.state === "done" ? "teal.8" : "dimmed"}
          aria-label={`state: ${stale ? "stale" : RUN_STATE_WORD[step.state]}`} data-step-stale={stale ? "" : undefined}
          style={{ lineHeight: `${STEP_LINE_H}px`, height: STEP_LINE_H }}>
          {stale ? `⟳ stale (was: ${stateLine.text})` : stateLine.text}
        </Text>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

interface TerminalData { term: DiagramTerminal; ran: boolean; scheme: Scheme; [k: string]: unknown }

function InfoTerminal({ data, selected }: NodeProps) {
  const { term, ran, scheme } = data as TerminalData;
  const feed = term.side !== "product";
  //  a feed is DECLARED (solid, in the ink of what it carries); a product
  //  exists only once the run has written it -- dashed until then, as a
  //  flowsheet terminal is before its run
  const wire: WireKind = term.side === "process" ? "process"
    : term.side === "product" ? (term.detail === "figure" || term.detail === "table" ? "result" : "written")
    : term.detail.startsWith("record") ? "record" : term.detail.startsWith("measured") ? "measured" : "file";
  const border = feed || ran ? inkOf(wire, scheme) : TERMINAL_BORDER;
  return (
    <div data-workflow-terminal={term.side} data-select-id={term.selectId} title={term.title ?? term.detail}
      style={{ ...terminalCardStyle(!!selected, border, feed || ran), width: term.w, height: term.h,
        boxSizing: "border-box", padding: "5px 12px", minWidth: 0, overflow: "hidden" }}>
      {!feed && <Handle type="target" position={Position.Left} />}
      <Group gap={5} wrap="nowrap" data-legible-primary="">
        {term.side === "process" && <IconBuildingFactory2 size={14} style={{ flex: "0 0 auto" }} />}
        <Text size="14px" fw={700} c="var(--mantine-color-text)" truncate style={{ minWidth: 0, lineHeight: "20px" }}>
          {term.label}
        </Text>
      </Group>
      <Text size="11px" c="dimmed" truncate style={{ lineHeight: "15px" }}>{term.detail}</Text>
      {feed && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

interface FrameData { frame: DiagramFrame; [k: string]: unknown }

function StudyFrame({ data, selected }: NodeProps) {
  const { frame } = data as FrameData;
  return (
    <div data-workflow-frame={frame.studyId}
      style={{ width: frame.w, height: frame.h, boxSizing: "border-box", pointerEvents: "none",
        borderRadius: 12,
        border: frame.declared
          ? `1.5px dashed ${selected ? "var(--mantine-color-accent-5)" : "light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-3))"}`
          : "none",
        background: frame.declared ? "light-dark(rgba(255,255,255,0.45), rgba(255,255,255,0.03))" : "transparent" }}>
      {frame.declared && (
        <Group gap={8} wrap="nowrap" px={14} pt={8} data-legible-primary=""
          style={{ pointerEvents: "all", cursor: "pointer", maxWidth: frame.w }} title={frame.title}>
          <Text fw={700} size="md" ff="monospace" c="var(--mantine-color-text)">{frame.letter}</Text>
          <Text fw={700} size="sm" c="var(--mantine-color-text)" truncate style={{ minWidth: 0 }}>
            {frame.title.replace(/^[A-Z]\s+--\s+/, "")}
          </Text>
        </Group>
      )}
    </div>
  );
}

const NODE_TYPES = { workflowStep: StepNode, infoTerminal: InfoTerminal, studyFrame: StudyFrame };
const EDGE_TYPES = { waypoint: WaypointEdge };

/* ---- the canvas ----------------------------------------------------------- */

export function WorkflowDiagram({ model }: { model: WorkflowModel }) {
  return (
    <ReactFlowProvider>
      <DiagramInner model={model} />
    </ReactFlowProvider>
  );
}

/** The operations of a step (a set of runs is several). */
function step_ops(model: WorkflowModel, stepId: string): string[] {
  for (const st of model.outline) for (const s of st.steps) if (s.id === stepId) return s.ops;
  return [];
}

/** What a selection id selects on the diagram: the node ids it lights. */
function selectedNodes(model: WorkflowModel, id: string): Set<string> {
  const out = new Set<string>();
  if (!id) return out;
  for (const s of model.diagram.steps) if (s.stepId === id) out.add(s.id);
  for (const t of model.diagram.terminals) if (t.selectId === id) out.add(t.id);
  for (const f of model.diagram.frames) if (f.studyId === id) out.add(f.id);
  //  a run of a set of runs selects its step
  if (out.size === 0 && id.startsWith("op:"))
    for (const st of model.outline) for (const s of st.steps)
      if (s.ops.includes(id.slice(3))) out.add(`step:${s.id}`);
  return out;
}

/** The words the card's fold handle says are tucked. */
function selectionWord(model: WorkflowModel, id: string): string {
  const s = model.diagram.steps.find((x) => x.stepId === id);
  if (s) return `${s.number} ${s.label}`;
  const t = model.diagram.terminals.find((x) => x.selectId === id);
  if (t) return t.label;
  const f = model.diagram.frames.find((x) => x.studyId === id);
  if (f) return `study ${f.letter}`;
  return id.replace(/^[a-z]+:/, "");
}

function DiagramInner({ model }: { model: WorkflowModel }) {
  const { diagram, selected, select } = model;
  const scheme = useComputedColorScheme("light") as Scheme;
  const reactFlow = useReactFlow();
  const paneH = useFlowStore((s) => s.height);
  const fitOptions = useMemo(() => flowsheetFitFor(paneH, false, FIT_TOP_PX), [paneH]);
  const fitAnimated = useRef(flowsheetFitFor(paneH, true, FIT_TOP_PX));
  fitAnimated.current = flowsheetFitFor(paneH, true, FIT_TOP_PX);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const legibility = useLegibilityFloor(wrapperRef);
  const togglePanel = useStore((s) => s.togglePanel);
  const tutorialName = useStore((s) => s.tutorialName);
  const lit = useMemo(() => selectedNodes(model, selected), [model, selected]);
  const stepOrder = useMemo(() => model.outline.flatMap((st) => st.steps.map((s) => s.id)), [model.outline]);

  const nodes = useMemo<Node[]>(() => [
    ...diagram.frames.map((f) => ({ id: f.id, type: "studyFrame", position: { x: f.x, y: f.y },
      data: { frame: f }, selectable: false, draggable: false, zIndex: -1, selected: lit.has(f.id),
      style: { pointerEvents: "none" as const } })),
    ...diagram.steps.map((s) => ({ id: s.id, type: "workflowStep", position: { x: s.x, y: s.y },
      data: { step: s, stale: s.state !== "notRun" && step_ops(model, s.stepId).some((o) => model.staleOps.has(o)) },
      draggable: false, selected: lit.has(s.id) })),
    ...diagram.terminals.map((t) => ({ id: t.id, type: "infoTerminal", position: { x: t.x, y: t.y },
      data: { term: t, ran: model.ran, scheme }, draggable: false, selected: lit.has(t.id) })),
  ], [diagram, lit, model, scheme]);

  const edges = useMemo<Edge[]>(() => diagram.edges.map((e) => {
    const w = WIRES[e.wire];
    const color = inkOf(e.wire, scheme);
    const touches = lit.has(e.from) || lit.has(e.to);
    return {
      id: e.id, source: e.from, target: e.to, type: "waypoint",
      data: { carries: e.label, carriesMeaning: `${w.word} -- ${w.meaning}`,
        //  a fit's evidence keeps its word at fit: which data the step was
        //  FITTED to and which it is JUDGED on is the one fact of the arrow
        //  a reader needs before zooming
        carriesPrimary: e.label === "FIT" || e.label === "HELD OUT" },
      markerEnd: arrowMarker(color),
      style: { stroke: color, strokeWidth: touches ? w.width + 1.2 : w.width, strokeDasharray: w.dash },
    };
  }), [diagram, scheme, lit]);

  //  THE FIT WAITS FOR EVERY BOX TO BE MEASURED (the flowsheet's C102 rule)
  const fittedFor = useRef("");
  const nodesInitialized = useNodesInitialized();
  const rfStore = useStoreApi();
  const fitKey = `${tutorialName}|${diagram.width}x${diagram.height}`;
  useEffect(() => {
    if (fittedFor.current === fitKey) return;
    if (nodes.length === 0 || !nodesInitialized) return;
    const lookup = rfStore.getState().nodeLookup;
    if (!nodes.every((n) => { const m = lookup.get(n.id)?.measured; return !!m?.width && !!m?.height; })) return;
    fittedFor.current = fitKey;
    reactFlow.fitView(fitOptions);
  }, [fitKey, nodes, nodesInitialized, rfStore, reactFlow, fitOptions]);

  const selectOf = useCallback((n: Node): string => {
    if (n.type === "workflowStep") return (n.data as StepData).step.stepId;
    if (n.type === "infoTerminal") return (n.data as TerminalData).term.selectId;
    const f = (n.data as FrameData).frame;
    return f.declared ? f.studyId : "";
  }, []);

  const open = useCallback((n: Node) => {
    if (n.type === "workflowStep") openStepTab((n.data as StepData).step.stepId);
    else if (n.type === "infoTerminal") {
      const t = (n.data as TerminalData).term;
      if (t.target) model.activate(t.target);
    }
  }, [model]);

  //  Keys: Esc deselects, F fits, ] folds the card, Enter opens the
  //  selected step in its tab, the arrows walk the steps in the run's order.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "Escape") select("");
      else if (ev.key === "f" || ev.key === "F") reactFlow.fitView(fitAnimated.current);
      else if (ev.key === "]") { if (selected) togglePanel("property"); }
      else if (ev.key === "Enter") {
        if (selected && model.diagram.steps.some((s) => s.stepId === selected)) { ev.preventDefault(); openStepTab(selected); }
      } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        if (t && t.closest("[role=menu], [role=listbox], nav")) return;
        ev.preventDefault();
        const i = stepOrder.indexOf(selected);
        const j = i < 0 ? 0 : Math.max(0, Math.min(stepOrder.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)));
        if (stepOrder[j]) select(stepOrder[j]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reactFlow, select, selected, togglePanel, model.diagram.steps, stepOrder]);

  const wiresPresent = useMemo(() => [...new Set(diagram.edges.map((e) => e.wire))]
    .map((w) => ({ key: w, dash: WIRES[w].dash, colour: inkOf(w, scheme), width: WIRES[w].width,
      label: WIRES[w].word, meaning: WIRES[w].meaning })), [diagram.edges, scheme]);

  return (
    <div ref={wrapperRef} data-workflow-diagram="" data-legibility-root=""
      style={{ position: "relative", width: "100%", height: "100%", background: CANVAS_BG }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={(_, n) => select(selectOf(n))}
        onNodeDoubleClick={(_, n) => open(n)}
        onPaneClick={() => select("")}
        fitView
        fitViewOptions={fitOptions}
        minZoom={FLOWSHEET_MIN_ZOOM}
        proOptions={{ hideAttribution: true }}
        colorMode={scheme}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        aria-label="The workflow: its steps, the data they read and what they write"
      >
        <CanvasBackground scheme={scheme} />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          <Group gap={6} align="flex-start" wrap="nowrap">
            {wiresPresent.length > 0 && <WireLegend items={wiresPresent} title="arrows carry" />}
            {model.caseWideStale && (
              <Badge color="orange" variant="filled" style={{ textTransform: "none" }} data-diagram-stale="case"
                title="A part of the case no step can be named for changed since the run: the whole diagram shows the last run.">
                stale: the case changed since the run
              </Badge>
            )}
          </Group>
        </Panel>
        <CanvasKeyHint legibility={legibility}
          keys="F: fit view  ·  Esc: deselect  ·  ↑↓: steps  ·  ]: fold card  ·  Enter or double-click: open the step" />
        {selected && (
          <SelectionCard label={selectionWord(model, selected)} onClose={() => select("")} top={12}>
            <PropertyPanel workflow={model} />
          </SelectionCard>
        )}
      </ReactFlow>
    </div>
  );
}
