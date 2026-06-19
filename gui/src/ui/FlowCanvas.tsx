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
  React Flow canvas.  Reads the current case from the store, computes
  the initial graph, then keeps node positions in local state so drags
  are persistent.  Edges + node data are always re-derived from the
  case (so editing the flowsheet later updates the canvas) -- only
  positions are user-controlled.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ActionIcon, Box, Button, Chip, Group, Stack, Text, Tooltip, useComputedColorScheme } from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { IconX } from "@tabler/icons-react";

import { flowsheetToGraph } from "../case/toGraph.js";
import { streamNumberResolver } from "../case/streamNumbering.js";
import { boundaryForStream } from "../case/modelBoundary.js";
import { localStreamNames, sliceHasContent, sliceRunResult } from "../case/resultSlice.js";
import { tutorialByName } from "../cases/tutorials.js";
import type { JsonDict } from "../dict/index.js";
import { useStore, hasCaseOpen } from "../state/store.js";
import { findRunStream, popOutStreamByName } from "./streamPopOut.js";
import { popOutUnitInternals } from "./unitFocus.js";
import {
  type PhaseKind,
  PHASE_LABEL,
  PHASE_GLYPH,
  PHASE_ORDER,
  phaseColor as phaseColorFor,
  classifyPhase,
  totalFlowOf,
  colorForValue,
  gradientCss,
} from "./plotting/palette.js";
import {
  formatTemperature,
  formatPressure,
  temperatureLabel,
  pressureLabel,
} from "../state/displayUnits.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { PropertyPanel } from "./PropertyPanel.js";
import { StreamTerminal } from "./StreamTerminal.js";
import { TearEdge } from "./TearEdge.js";
import { WaypointEdge } from "./WaypointEdge.js";
import { UnitNode } from "./UnitNode.js";
import { loadLayout, saveLayout, layoutFromChoText, layoutToChoText, mergeLayouts,
  type XY, type HandlePos, type CaseLayout } from "../state/layout.js";
import { writeCaseFile } from "../cases/workspace.js";
import { notifications } from "@mantine/notifications";

// Storage-key separator for per-handle overrides: a null char never appears
// in a unit id or stream name, so the split is unambiguous.
const HKEY = "\u0000";
import type { StreamResult } from "../adapters/SolverAdapter.js";

// Phase classification derived from AUTHORITATIVE solver outputs ---
// vf (vapour fraction) and F_solid_mass --- never from heuristics over
// T or composition.  The C++ engine writes both into the JSON; the
// canvas reflects them directly so the diagram and the dict's reality
// stay in sync.  Empty streams (zero flow) show dimmed + dashed so the
// student can SEE that a stream resolved to zero (e.g. a cyclone with
// no solids entering).
interface PhaseStyle {
  color: string;
  phase: PhaseKind;
  /** Total mass flow (fluid + solid) in kg/s --- drives line thickness. */
  totalFlow: number;
}

const NODE_TYPES = {
  unitNode: UnitNode,
  streamTerminal: StreamTerminal,
};

// Custom edge types.  `tear` routes recycle back-edges below the node
// row so they don't disappear behind same-row units.  `waypoint` is a
// normal smoothstep whose bend can be dragged aside (topology fixed) to
// separate overlapping streams --- the default for every forward edge.
const EDGE_TYPES = {
  tear: TearEdge,
  waypoint: WaypointEdge,
};

export function FlowCanvas() {
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const controlDict = useStore((s) => s.caseFiles.controlDict);
  const blank = useStore((s) => !hasCaseOpen(s.tutorialName));
  // Onboarding: surface controlDict.description right above the canvas
  // so an opened case answers "what is this?" in one line.  Mirrors the
  // PropsView subtitle.
  const description: string | undefined = useMemo(() => {
    const d = controlDict?.["description"];
    return typeof d === "string" && d.trim().length > 0 ? d.trim() : undefined;
  }, [controlDict]);

  // Empty-state: a malformed case OR a non-flowsheet case slipped through.
  // Show a clear message instead of a silent dotted void.
  if (!flowsheet) {
    return (
      <Box
        style={{
          width: "100%",
          height: "100%",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Stack gap={4} align="center" style={{ maxWidth: 460 }}>
          {blank ? (
            <>
              <Text c="dimmed" fw={600}>Welcome to Choupo.</Text>
              <Text c="dimmed" size="sm" ta="center">
                No case is open. Start one from <b>File → New Case</b>, browse the
                bundled <b>File → Open Tutorial</b>, or <b>Open Case</b> (.zip /
                folder). Your last case is under <b>File → Reopen last</b>.
              </Text>
            </>
          ) : (
            <>
              <Text c="dimmed" fw={500}>No flowsheet in this case.</Text>
              <Text c="dimmed" size="sm" ta="center">
                Open a tutorial from <b>File → Open Tutorial</b>, or check that
                <code> system/flowsheetDict</code> exists in the case directory.
              </Text>
            </>
          )}
        </Stack>
      </Box>
    );
  }
  return (
    <Box style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column",
      background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))",
    }}>
      {description && (
        <Box style={{
          flex: "0 0 auto",
          padding: "8px 16px",
          borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        }}>
          <Text size="sm" c="var(--mantine-color-text)" fw={500} style={{ lineHeight: 1.3 }}>
            {description}
          </Text>
        </Box>
      )}
      <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ReactFlowProvider>
          <CanvasInner flowsheet={flowsheet} />
        </ReactFlowProvider>
      </Box>
    </Box>
  );
}

function CanvasInner({ flowsheet }: { flowsheet: import("../dict/index.js").JsonDict }) {
  const rawFiles = useStore((s) => s.caseFiles.rawFiles);
  const selectNode = useStore((s) => s.selectNode);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const tutorialName = useStore((s) => s.tutorialName);
  const runResult = useStore((s) => s.runResult);
  const runStatus = useStore((s) => s.runStatus);
  const colorScheme = useStore((s) => s.displayPrefs.colorScheme);
  const colorMode = useStore((s) => s.displayPrefs.colorMode);
  const colorMap = useStore((s) => s.displayPrefs.colorMap);
  const tempUnit = useStore((s) => s.displayPrefs.temperature);
  const pressUnit = useStore((s) => s.displayPrefs.pressure);
  // The UI light/dark scheme (distinct from the stream `colorMode` display pref
  // above) -- drives the React Flow canvas chrome + dot grid.
  const uiScheme = useComputedColorScheme("light");
  const reactFlow = useReactFlow();

  // Visualisation filters (view-only, not case data): show/hide stream
  // classes so a busy plant declutters.  Process material is always on;
  // energy wires (W/Q), recycle tears and utility streams toggle.
  const [show, setShow] = useState({ energy: true, recycle: true, utility: true, numbers: true });

  // Fractal drill-down (step 4c): double-click a node that is itself a case
  // (a sector or unit folder with a.cho) to OPEN it in a NEW WINDOW, loaded
  // as a case in its own right via "?case=<sub-node>".
  const drillableSub = useCallback(
    (nodeId: string): string | null => {
      if (!nodeId.startsWith("unit:")) return null;
      const sub = `${tutorialName}/${nodeId.slice("unit:".length)}`;
      return tutorialByName(sub) ? sub : null;
    },
    [tutorialName],
  );
  const openInNewWindow = useCallback(
    (nodeId: string) => {
      const sub = drillableSub(nodeId);
      if (!sub) return;
      let url = `${window.location.pathname}?case=${encodeURIComponent(sub)}`;
      // Result inheritance: the parent run already converged every internal
      // stream of this child (namespaced "<child>.x").  Slice the finished
      // RunResult to the child's scope, stash it (one-shot, consumed at the
      // new tab's boot) and ride an `&inherit=<key>` so the drilled tab opens
      // WITH the results -- no pointless re-run.  Re-running there overrides
      // the inherited numbers normally.
      if (runResult && runResult.status === "done") {
        const prefix = nodeId.slice("unit:".length);
        const subFs = tutorialByName(sub)?.files.flowsheet as JsonDict | undefined;
        const sliced = sliceRunResult(runResult, prefix, {
          localStreamNames: localStreamNames(subFs),
          // A LEAF sub-case draws its one unit as `name ?? "unit"` (toGraph
          // readLeaf); rename the exact-scope kpi/profile keys to match.
          leafUnitName: subFs && subFs["type"] !== undefined
            ? String(subFs["name"] ?? "unit")
            : undefined,
        });
        if (sliceHasContent(sliced)) {
          try {
            const key = `choupo.inherit.${prefix}.${Date.now()}`;
            localStorage.setItem(key, JSON.stringify(sliced));
            url += `&inherit=${encodeURIComponent(key)}`;
          } catch { /* localStorage full / blocked -- open unrun */ }
        }
      }
      window.open(url, "_blank");
    },
    [drillableSub, runResult],
  );

  // Recompute graph whenever the case changes.
  const graph = useMemo(() => flowsheetToGraph(flowsheet, rawFiles), [flowsheet, rawFiles]);

  // Which SHOW classes the case actually CONTAINS, so a chip that would toggle
  // nothing reads as disabled (a live control that does nothing is confusing).
  //   energy   -> unit-to-unit work/heat wires (kind "energy")
  //   recycle  -> tear edges (kind "tear")
  //   utility  -> docked duty / power stubs (dutyPort) or a utility terminal
  // ABSOLUTE stream numbering: resolve each local stream name to its whole-plant
  // number, so a stream keeps the SAME number in the parent AND when drilled
  // into a sector (never resets per view).  Falls back to per-view local
  // numbering for flat / non-registry cases.
  const numberOf = useMemo(
    () => streamNumberResolver(tutorialName, flowsheet, rawFiles),
    [tutorialName, flowsheet, rawFiles],
  );

  const present = useMemo(() => {
    const ek = (e: { data?: unknown }) => (e.data as { kind?: string } | undefined)?.kind;
    return {
      energy: graph.edges.some((e) => ek(e) === "energy"),
      recycle: graph.edges.some((e) => ek(e) === "tear"),
      utility: graph.nodes.some((n) => (n.data as { dutyPort?: unknown }).dutyPort !== undefined),
      numbers: graph.streamNumbers.size > 0,
    };
  }, [graph]);

  // The case's `.cho` marker carries the SHAREABLE, on-disk layout snapshot
  // (the root marker = the key ending `.cho` with no `/`).  The localStorage
  // copy is the live per-browser working copy; it WINS per-section, falling
  // back to the `.cho` so a freshly-received case opens the way it was shared.
  // (`rawFiles` is read once at the top of CanvasInner.)
  const markerPath = useMemo(
    () => Object.keys(rawFiles ?? {}).find((k) => k.endsWith(".cho") && !k.includes("/")),
    [rawFiles],
  );
  const choText = markerPath ? rawFiles?.[markerPath] : undefined;

  // Persisted "last screen state" for THIS case: node positions, viewport,
  // and per-edge bend centres.  Reloaded when the case (or its `.cho`)
  // changes.  Applying a stored position over the auto-layout is what makes
  // the user's arrangement stick across reloads.
  const layout = useMemo(
    () => mergeLayouts(loadLayout(tutorialName), layoutFromChoText(choText)),
    [tutorialName, choText],
  );
  const [edgeCenters, setEdgeCenters] = useState<{ [id: string]: XY }>(layout.edges);
  const edgeCentersRef = useRef(edgeCenters);
  useEffect(() => { edgeCentersRef.current = edgeCenters; }, [edgeCenters]);
  useEffect(() => { setEdgeCenters(layout.edges); }, [layout]);

  // Connection-point overrides, keyed `<unitId>\0<handleId>`.  Live while
  // dragging a handle along a unit's border, persisted on release.
  const [handlePos, setHandlePos] = useState<{ [key: string]: HandlePos }>(layout.handles);
  const handlePosRef = useRef(handlePos);
  useEffect(() => { handlePosRef.current = handlePos; }, [handlePos]);
  useEffect(() => { setHandlePos(layout.handles); }, [layout]);

  const applyStored = useCallback(
    (n: Node): Node => {
      const pos = layout.nodes[n.id];
      return pos ? {...n, position: pos } : n;
    },
    [layout],
  );

  // User-mutable node state (drives drag).  Seeded from `graph`; reseeded
  // if the set of node ids changes (e.g. user opens a different case).
  const [nodes, setNodes] = useState<Node[]>(graph.nodes.map(applyStored));
  const seededIds = useRef("");
  useEffect(() => {
    const ids = graph.nodes.map((n) => n.id).sort().join(",");
    if (ids !== seededIds.current) {
      seededIds.current = ids;
      setNodes(graph.nodes.map(applyStored));
    } else {
      // Same nodes, but their `data` (e.g. operation params) may have
      // changed -- preserve positions, update everything else.
      setNodes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        return graph.nodes.map((n) => {
          const existing = byId.get(n.id);
          return existing ? {...n, position: existing.position } : n;
        });
      });
    }
  }, [graph, applyStored]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  // --- where the `.cho` marker lives on disk + how to write it ---------------
  // The marker filename (`<case>.cho`) and the case's on-disk home: a LOCAL
  // case at an absolute dir, a bundled tutorial under tutorials/<name> (still a
  // real folder -- the owner edits it), or none (a zip/external/focus tab ->
  // download only).
  const markerName = useMemo(() => {
    const base = tutorialName.split(/[/:]/).filter(Boolean).pop() ?? "case";
    return (markerPath ?? `${base}.cho`).split("/").pop() ?? `${base}.cho`;
  }, [tutorialName, markerPath]);
  const markerRel = markerPath ?? markerName;
  const localBridgeHost = typeof location !== "undefined"
    && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  const markerLoc = useMemo<{ dir?: string } | { tutorial?: string } | null>(
    () => {
      if (!localBridgeHost) return null;
      return tutorialName.startsWith("local:")
        ? { dir: tutorialName.slice("local:".length) }
        : !tutorialName.includes(":")
          ? { tutorial: tutorialName }
          : null;
    },
    [tutorialName, localBridgeHost],
  );

  // Snapshot the live arrangement (positions, viewport, edge bends, handles).
  const buildLayout = useCallback((): CaseLayout => {
    const pos: { [id: string]: XY } = {};
    for (const n of reactFlow.getNodes()) pos[n.id] = { x: n.position.x, y: n.position.y };
    return {
      nodes: pos,
      viewport: reactFlow.getViewport(),
      edges: edgeCentersRef.current,
      handles: handlePosRef.current,
    };
  }, [reactFlow]);

  // AUTO-SAVE to the case's `.cho` on disk (Vitor's preference: no button
  // needed -- the arrangement just lives in the folder).  Debounced so a
  // continuous drag writes once on settle, and BEST-EFFORT: if the bridge is
  // down (pure-WASM / offline) we silently keep only the localStorage copy --
  // no toast spam on every drag.  The marker carries GUI-only view state, not
  // physics, so this does not touch the dicts the solver reads.
  const autoSaveTimer = useRef<number | undefined>(undefined);
  const autoSaveFailed = useRef(false);   // notify at most once per session
  const autoSaveMarker = useCallback(() => {
    if (!markerLoc) {
      console.warn("[choupo] layout auto-save skipped: case has no disk home", { tutorialName });
      return;  // no disk home -> localStorage only
    }
    if (autoSaveTimer.current !== undefined) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      const text = layoutToChoText(buildLayout());
      console.debug("[choupo] layout auto-save ->", markerLoc, markerRel, `${text.length} chars`);
      void writeCaseFile(markerLoc, markerRel, text)
        .then((path) => console.debug("[choupo] layout auto-save OK ->", path))
        .catch((e) => {
          console.error("[choupo] layout auto-save FAILED", e);
          if (!autoSaveFailed.current) {
            autoSaveFailed.current = true;
            notifications.show({
              title: "Layout not saved to folder",
              message: `${(e as Error).message}. Restart the bridge (bin/runGui)? Your arrangement is still kept in the browser.`,
              color: "red", autoClose: false,
            });
          }
        });
    }, 600);
  }, [markerLoc, markerRel, buildLayout, tutorialName]);

  // Persist on every layout commit: localStorage (synchronous, always) +
  // the on-disk `.cho` (debounced, best-effort).
  const persistNodePositions = useCallback(() => {
    saveLayout(tutorialName, { nodes: buildLayout().nodes });
    autoSaveMarker();
  }, [tutorialName, buildLayout, autoSaveMarker]);


  // Edge bend-centre handlers: live state while dragging, persisted once on
  // release (commit) so localStorage isn't hit on every pointer move.
  const onEdgeCenterChange = useCallback(
    (id: string, xy: XY) => setEdgeCenters((m) => ({...m, [id]: xy })),
    [],
  );
  const onEdgeCenterReset = useCallback(
    (id: string) => setEdgeCenters((m) => {
      const next = {...m };
      delete next[id];
      return next;
    }),
    [],
  );
  const commitEdgeCenters = useCallback(
    () => { saveLayout(tutorialName, { edges: edgeCentersRef.current }); autoSaveMarker(); },
    [tutorialName, autoSaveMarker],
  );

  // Connection-point handlers (same live-then-commit pattern as edges).
  const onHandleMove = useCallback(
    (unitId: string, handleId: string, pos: HandlePos) =>
      setHandlePos((m) => ({...m, [`${unitId}${HKEY}${handleId}`]: pos })),
    [],
  );
  const onHandleReset = useCallback(
    (unitId: string, handleId: string) => setHandlePos((m) => {
      const next = {...m };
      delete next[`${unitId}${HKEY}${handleId}`];
      return next;
    }),
    [],
  );
  const commitHandles = useCallback(
    () => { saveLayout(tutorialName, { handles: handlePosRef.current }); autoSaveMarker(); },
    [tutorialName, autoSaveMarker],
  );

  // Fit the whole flowsheet into view ONCE per case load (after the nodes
  // exist).  We deliberately do NOT restore a persisted pan/zoom: a viewport
  // saved at another window size / after panning away could leave the content
  // off-screen ("centred but invisible").  fitView is the safe default; the
  // user can still pan/zoom freely and hit `F` to re-fit.  (Node positions,
  // edge bends and handle slots ARE still persisted -- only the camera isn't.)
  const fittedFor = useRef("");
  useEffect(() => {
    if (fittedFor.current === tutorialName) return;
    if (nodes.length === 0) return; // wait until the graph is built
    fittedFor.current = tutorialName;
    reactFlow.fitView({ padding: 0.25, maxZoom: 1.1, duration: 200 });
  }, [tutorialName, reactFlow, nodes]);

  // Stream selection by clicking an edge: the edge label IS the stream name
  // (see toGraph.ts).  Drives the PropertyPanel to show that stream's
  // details -- the only way to inspect an INTERNAL (unit->unit) stream,
  // e.g. a recycle.  Highlighted edges get a thicker stroke.
  const selectedStreamName =
    selectedNodeId && selectedNodeId.startsWith("stream:")
      ? selectedNodeId.slice("stream:".length)
    : null;

  // After a run, each edge is coloured by the solver's authoritative
  // vf + F_solid_mass for that stream, and its stroke width scales with
  // total mass flow (sqrt-mapped so low-flow streams stay visible).
  // Without a run, fall back to the project accent.  The phase set
  // present in this run drives the small legend in the top-right corner.
  // styledNodes and styledEdges both consume `phaseOf`, so it must be
  // declared before either of them.
  const { phaseOf, utilityOf, resultStreamOf, maxFlow, phasesPresent, propRange } = useMemo(() => {
    type Range = { min: number; max: number } | null;
    if (!runResult)
      return { phaseOf: null as ((label: string) => PhaseStyle | null) | null,
               utilityOf: null as ((label: string) => string | null) | null,
               resultStreamOf: null as ((label: string) => { F: number; F_mass?: number; F_solid_mass?: number; F_solid?: number; T: number; P: number } | null) | null,
               maxFlow: 0,
               phasesPresent: new Set<PhaseKind>(),
               propRange: null as Range };
    const present = new Set<PhaseKind>();
    let mx = 0;
    // Property range (T or P) is taken over the streams that actually carry
    // flow, so an empty/zero-flow leg doesn't widen the gradient scale.
    let lo = Infinity, hi = -Infinity;
    const propVal = (s: StreamResult): number | undefined =>
      colorMode === "temperature" ? s.T
        : colorMode === "pressure" ? s.P
        : undefined;
    for (const s of runResult.streams) {
      const phase = classifyPhase(s);
      present.add(phase);
      const tf = totalFlowOf(s);
      if (tf > mx) mx = tf;
      if (colorMode !== "phase" && tf > 1e-15) {
        const v = propVal(s);
        if (v !== undefined && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    const range: Range = (colorMode !== "phase" && lo <= hi) ? { min: lo, max: hi } : null;
    // The colour a stream gets, honouring scheme (phase mode) or the
    // viridis gradient over [min,max] (temperature / pressure modes).
    const styleFor = (s: StreamResult): PhaseStyle => {
      const phase = classifyPhase(s);
      const totalFlow = totalFlowOf(s);
      let color: string;
      if (range) {
        const v = propVal(s);
        color = (v !== undefined && totalFlow > 1e-15)
          ? colorForValue(v, range.min, range.max, colorMap)
          : phaseColorFor(phase, colorScheme);
      } else {
        color = phaseColorFor(phase, colorScheme);
      }
      return { color, phase, totalFlow };
    };
    const lookupPhase = (label: string): PhaseStyle | null => {
      const s = findRunStream(runResult.streams, label);
      return s ? styleFor(s) : null;
    };
    const lookupUtility = (label: string): string | null => {
      const s = findRunStream(runResult.streams, label);
      return s && s.category ? s.category : null;
    };
    // Resolved stream conditions (F, F_mass, T, P) from the converged run.
    // The terminal prefers these over the dict spec so it shows what the
    // solver actually computed --- e.g. a utility stream whose T comes from
    // the catalogue (the dict has no T) reads its real temperature, not 0.
    const lookupResult = (label: string) => {
      const s = findRunStream(runResult.streams, label);
      if (!s) return null;
      // Solid molar flow = Σ over the per-component solid map (kmol/s); paired
      // with F_solid_mass so the terminal can show the TOTAL (fluid + solid) --
      // a pure-solid `crystals` product has fluid F = 0.
      const F_solid = s.solids ? Object.values(s.solids).reduce((a, b) => a + (b ?? 0), 0) : 0;
      return { F: s.F, F_mass: s.F_mass, F_solid_mass: s.F_solid_mass, F_solid, T: s.T, P: s.P, vf: s.vf };
    };
    return { phaseOf: lookupPhase, utilityOf: lookupUtility,
             resultStreamOf: lookupResult,
             maxFlow: mx, phasesPresent: present, propRange: range };
  }, [runResult, colorMode, colorScheme, colorMap]);

  // Annotate each unit node with `drillable` so UnitNode can show a
  // visual hint (a small external-link mark + a "double-click to open" hint).
  // The lookup is the same one openInNewWindow uses, so the hint never lies.
  //
  // Stream terminal nodes also get the post-run phase colour, so the
  // eye traces a stream end-to-end (terminal border + edge stroke
  // match).
  const styledNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => {
        const drillable = drillableSub(n.id) !== null;
        // An energy-only unit (no material streams, e.g. electricLoad) is
        // hidden together with the energy wires when that class is off ---
        // otherwise it would float disconnected.
        const _ud = (n.data as { unit?: { in?: unknown; outputs?: unknown[] } }).unit;
        const _ins = _ud ? (Array.isArray(_ud.in) ? _ud.in : [_ud.in]).filter(Boolean) : [];
        const energyOnly =
          n.type === "unitNode" && _ins.length === 0 && ((_ud?.outputs?.length ?? 0) === 0);
        let phaseColor: string | undefined;
        let phaseLabel: string | undefined;
        let phaseGlyph: string | undefined;
        let utilityCategory: string | undefined;
        let resolved: { F: number; F_mass?: number; F_solid_mass?: number; F_solid?: number; T: number; P: number; vf?: number } | undefined;
        if (n.type === "streamTerminal" && n.id.startsWith("stream:") && phaseOf) {
          const label = n.id.slice("stream:".length);
          const ps = phaseOf(label);
          if (ps) {
            phaseColor = ps.color;
            phaseLabel = PHASE_LABEL[ps.phase];
            phaseGlyph = PHASE_GLYPH[ps.phase];
          }
          if (utilityOf) {
            const cat = utilityOf(label);
            if (cat) utilityCategory = cat;
          }
          if (resultStreamOf) {
            const rs = resultStreamOf(label);
            if (rs) resolved = rs;
          }
        }
        // A utility terminal (FEED/PRODUCT box whose stream is a plant
        // utility) hides WITH its edges when the `utility` class is off ---
        // otherwise the box floats orphaned, with no arrow attached (same
        // reasoning as the energy-only unit above).
        const isUtilityTerminal =
          n.type === "streamTerminal" && utilityCategory !== undefined;
        // Per-unit connection-point overrides (strip the "<unitId>\0" prefix
        // so UnitNode looks them up by bare handle id).
        let handleOverrides: { [h: string]: HandlePos } | undefined;
        if (n.type === "unitNode") {
          for (const [k, v] of Object.entries(handlePos)) {
            const sep = k.indexOf(HKEY);
            if (sep < 0 || k.slice(0, sep) !== n.id) continue;
            (handleOverrides ??= {})[k.slice(sep + 1)] = v;
          }
        }
        // Distillation duty stub: pull the column's reboiler / condenser
        // duty (kW) from the run KPIs, and the allocated utility + cost from
        // the solver's utilityAllocation, so the stub shows "which utility,
        // how much €" --- not just the bare Q.
        let dutyKW: number | undefined;
        let dutyUtility: string | undefined;
        let dutyEurH: number | undefined;
        const dport = (n.data as { dutyPort?: string }).dutyPort;
        if (dport === "power") {
          // ⚡ Power stub: value + €/h come straight from the power-tier
          // utilityAllocation row (electrical draw / generation), keyed by unit.
          const owner = (n.data as { ownerUnit?: string }).ownerUnit;
          const alloc = runResult?.utilityAllocation?.find(
            (a) => a.unit === owner && a.tier === "power");
          if (alloc) {
            dutyUtility = alloc.utility; dutyEurH = alloc.eur_h;
            if (typeof alloc.duty_kW === "number") dutyKW = alloc.duty_kW;
          }
        } else if (dport) {
          const owner = (n.data as { ownerUnit?: string }).ownerUnit;
          const k = owner ? runResult?.kpis?.[owner] : undefined;
          // reboiler/condenser carry their own kW kpis; a plain heater/cooler
          // duty is kpi "Q_kW" and allocates under an EMPTY port.
          const kpiKey = dport === "reboiler" ? "Q_reboiler_kW"
                       : dport === "condenser" ? "Q_condenser_kW" : "Q_kW";
          const allocPort = dport === "Q" ? "" : dport;
          const v = k?.[kpiKey];
          if (typeof v === "number") dutyKW = v;
          const alloc = runResult?.utilityAllocation?.find(
            (a) => a.unit === owner && a.port === allocPort);
          if (alloc) {
            dutyUtility = alloc.utility; dutyEurH = alloc.eur_h;
            if (dutyKW === undefined && typeof alloc.duty_kW === "number") dutyKW = alloc.duty_kW;
          }
        }
        return {
...n,
          selected: n.id === selectedNodeId,
          hidden: (energyOnly && !show.energy)
               || (isUtilityTerminal && !show.utility)
               || (dport !== undefined && !show.utility),
          data: {...(n.data as object), drillable, phaseColor, phaseLabel, phaseGlyph,
                  utilityCategory, resolved, dutyKW, dutyUtility, dutyEurH,
                  showNumbers: show.numbers,
                  // ABSOLUTE number (overrides toGraph's per-view local one).
                  streamNumber: numberOf((n.data as { name?: string }).name ?? ""),
                  handleOverrides, onHandleMove, onHandleCommit: commitHandles,
                  onHandleReset },
        };
      }),
    [nodes, selectedNodeId, drillableSub, phaseOf, utilityOf, resultStreamOf, show,
     handlePos, onHandleMove, onHandleReset, commitHandles, runResult, numberOf],
  );

  const styledEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const isSelected = typeof e.label === "string" && e.label === selectedStreamName;
        const label = typeof e.label === "string" ? e.label : "";
        const ps = phaseOf && label ? phaseOf(label) : null;
        const utilityCat = utilityOf && label ? utilityOf(label) : null;
        const isUtility = utilityCat !== null && utilityCat !== "";
        const isEnergy = (e.data as { kind?: string } | undefined)?.kind === "energy";
        const isTear   = (e.data as { kind?: string } | undefined)?.kind === "tear";
        const isDuty   = (e.data as { kind?: string } | undefined)?.kind === "duty";
        // Model-boundary audit entry for THIS stream ("information follows
        // the streams"): the edge component docks a small ΔH / REFUSED chip
        // next to its label point.  Badge only -- the STROKE below stays the
        // solver's semantic phase colour, never repainted.
        const boundary = (!isEnergy && !isDuty && label)
          ? boundaryForStream(runResult?.modelBoundaries, label)
          : undefined;
        // Energy wires keep their existing dashed orange/amber styling
        // (set in toGraph.ts); don't recolour them by phase.
        // Phase colour is SEMANTIC -- clicking a stream must never change
        // it.  Selection is signalled through extra thickness + a halo
        // (SVG drop-shadow) only; the underlying stroke colour stays the
        // phase colour the simulator assigned.
        const color = (isEnergy || isDuty)
          ? (e.style as { stroke?: string } | undefined)?.stroke
              ?? "var(--mantine-color-accent-5)"
          : ps?.color ?? "var(--mantine-color-accent-5)";
        const baseWidth = ps && maxFlow > 0
          ? 1.0 + 5.0 * Math.sqrt(ps.totalFlow / maxFlow)
          : 1.5;
        const strokeWidth = isSelected
          ? Math.max(3, baseWidth + 1.0)
          : isTear ? Math.max(2, baseWidth) : baseWidth;
        return {
...e,
          // Forward edges use the draggable-bend `waypoint` edge (topology
          // stays fixed; only the orthogonal bend slides).  Tears keep
          // their dedicated under-row router.
          type: isTear ? "tear" : "waypoint",
          data: {
...(e.data as object),
            center: edgeCenters[e.id],
            onCenterChange: onEdgeCenterChange,
            onCommit: commitEdgeCenters,
            onReset: onEdgeCenterReset,
            showNumbers: show.numbers,
            num: numberOf(label),   // ABSOLUTE number (overrides toGraph local)
            ...(boundary ? { boundary: { refused: boundary.refused } } : {}),
          },
          // Visualisation filter: hide this edge when its class is toggled
          // off (energy wire / recycle tear / utility stream).  Process
          // material is never hidden.
          hidden: (isEnergy && !show.energy)
               || (isTear   && !show.recycle)
               || (isUtility && !show.utility)
               || (isDuty   && !show.utility),
          // Arrow at the destination end --- shows flow direction
          // (critical for students reading a flowsheet).  Default
          // markerUnits ("strokeWidth"): the head scales WITH the line
          // thickness, so it stays proportional to the flow (thickness
          // ∝ √F).  Slimmer than before --- narrower base, a touch longer
          // --- so it reads as a slender pointer, not a fat triangle.
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 10,
            height: 12,
          },
          style: {
            ...(e.style ?? {}),
            stroke: color,
            strokeWidth,
            // Empty streams (zero flow): dashed so the eye sees that this
            // pipe carries nothing in the current run.
            ...(ps?.phase === "empty" && !isEnergy
              ? { strokeDasharray: "4 4", opacity: 0.55 }
              : {}),
            // Recycle (tear) edges: dashed long-pattern so the back-edge
            // reads instantly as a recycle line, not just another stream.
            // Phase colour preserved -- a vapour recycle stays orange.
            ...(isTear
              ? { strokeDasharray: "10 5" }
              : {}),
            // Utility streams: dashed short-pattern so they read instantly
            // as plant utilities (steam header, cooling water, oil loop)
            // rather than process material.  Phase colour preserved so a
            // saturated-steam edge still reads "vapour" at a glance.
            ...(isUtility && !isTear && !isEnergy
              ? { strokeDasharray: "6 3", opacity: 0.85 }
              : {}),
            // Selection halo: SVG drop-shadow in the project accent.
            // Visible regardless of phase colour, doesn't repaint stroke.
            ...(isSelected
              ? { filter: "drop-shadow(0 0 4px var(--mantine-color-accent-3))" }
              : {}),
          },
          labelStyle: {
            fill: "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            fontWeight: isSelected ? 600 : 400,
          },
          labelBgStyle: {
            fill: "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))",
          },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    [graph.edges, selectedStreamName, phaseOf, utilityOf, maxFlow, show,
     edgeCenters, onEdgeCenterChange, commitEdgeCenters, onEdgeCenterReset,
     runResult, numberOf],
  );

  // Keyboard shortcuts.  Esc -> deselect; F -> fit view.  Mounted on window
  // because React Flow's own keyboard scope is sometimes elsewhere.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Ignore when typing in an input/textarea so the user can hit Esc/F
      // inside a form without nuking their selection.
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (ev.key === "Escape") {
        selectNode(null);
      } else if (ev.key === "f" || ev.key === "F") {
        reactFlow.fitView({ padding: 0.25, maxZoom: 1.1, duration: 200 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reactFlow, selectNode]);

  return (
    <div style={{ width: "100%", height: "100%", background: "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-8))" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        // Persist the arrangement (view state -> localStorage): node
        // positions on drag-end, viewport on pan/zoom-end.
        onNodeDragStop={persistNodePositions}
        // UX convention (file-manager style):
        //   single click  → select (selection card)
        //   double click  → "open" (new tab): streams pop out their
        //     conditions; a fractal sub-case (sector / leaf with its own
        //     folder) drills in; a plain unit op opens its INTERNALS page
        //     (tables + plots + the What-if tab -- gui-credo §4).
        onNodeClick={(_, n) => selectNode(n.id)}
        onNodeDoubleClick={(_, n) => {
          if (n.type === "streamTerminal" && n.id.startsWith("stream:")) {
            popOutStreamByName(n.id.slice("stream:".length));
          } else if (drillableSub(n.id)) {
            // Fractal sector / leaf sub-case: open it as its own case URL.
            openInNewWindow(n.id);
          } else if (n.id.startsWith("unit:")) {
            const uname = n.id.slice("unit:".length);
            // Two unit surfaces (gui-credo §4): single click = the read-only
            // selection card, double click = the unit's INTERNALS page
            // (tables + plots + the What-if tab).  Inside a focus tab the
            // unit IS the tab's subject -- opening another internals of
            // itself would only duplicate the parent's pop-out, so: no-op.
            if (!tutorialName.startsWith("focus:")) popOutUnitInternals(uname);
          }
        }}
        onEdgeClick={(_, e) => {
          // Edge label is the stream name (toGraph sets it).  Single
          // click selects so the right panel shows the stream details.
          if (typeof e.label === "string" && e.label) {
            selectNode(`stream:${e.label}`);
          }
        }}
        onEdgeDoubleClick={(_, e) => {
          // Double click an internal stream → open in a new tab.
          if (typeof e.label === "string" && e.label) {
            popOutStreamByName(e.label);
          }
        }}
        onPaneClick={() => selectNode(null)}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
        colorMode={uiScheme}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={uiScheme === "dark" ? "var(--mantine-color-dark-5)" : "var(--mantine-color-gray-2)"}
        />
        <Controls showInteractive={false} />
        {/* The flowsheet's OWN Run (choupoSolve) -- each view owns its run.
            Dispatches the choupo:run/stop events the TopBar orchestrator
            listens for (no global toolbar Run anymore). */}
        <Panel position="top-right">
          {runStatus === "running" ? (
            <Button size="xs" color="red" variant="filled"
              leftSection={<IconPlayerStop size={14} />}
              onClick={() => window.dispatchEvent(new CustomEvent("choupo:stop"))}>
              Stop
            </Button>
          ) : (
            <Button size="xs" color="accent" variant="filled"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={() => window.dispatchEvent(new CustomEvent("choupo:run"))}
              title="Run the flowsheet simulation (choupoSolve)">
              Run flowsheet
            </Button>
          )}
        </Panel>
        {/* Keyboard-shortcut legend in the bottom-right corner. */}
        <Box
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 5,
            padding: "4px 8px",
            borderRadius: 4,
            background: "light-dark(rgba(255,255,255,0.9), rgba(0,0,0,0.45))",
            pointerEvents: "none",
          }}
        >
          <Text size="10px" c="dimmed" ff="monospace">
            F: fit view  ·  Esc: deselect  ·  double-click: drill in
          </Text>
        </Box>
        {/* Visualisation filters (top-left): show/hide stream classes so a
            busy plant declutters.  Process material is always shown. */}
        <Box
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            zIndex: 6,
            padding: "5px 9px",
            borderRadius: 4,
            background: "light-dark(rgba(255,255,255,0.9), rgba(0,0,0,0.55))",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Text size="10px" c="dimmed" ff="monospace" tt="uppercase" style={{ letterSpacing: 0.4 }}>
            show
          </Text>
          <Group gap={6}>
            <ShowChip color="yellow" label="energy" present={present.energy}
              checked={show.energy} onChange={(v) => setShow((s) => ({...s, energy: v }))}
              emptyHint="This case has no energy wires (no unit-to-unit work/heat links)." />
            <ShowChip color="cyan" label="recycle" present={present.recycle}
              checked={show.recycle} onChange={(v) => setShow((s) => ({...s, recycle: v }))}
              emptyHint="This case has no recycle (tear) streams." />
            <ShowChip color="orange" label="utility" present={present.utility}
              checked={show.utility} onChange={(v) => setShow((s) => ({...s, utility: v }))}
              emptyHint="This case has no utility stubs (no heat duties or electrical draw)." />
            <ShowChip color="grape" label="№ streams" present={present.numbers}
              checked={show.numbers} onChange={(v) => setShow((s) => ({...s, numbers: v }))}
              emptyHint="No streams to number yet." />
          </Group>
        </Box>
        {/* Legend, top-left (below the filters).  Only shown when a run
            has produced streams to colour.  In the default `phase` mode it
            lists the phases present (colour + glyph); in temperature /
            pressure mode it becomes a continuous viridis scale bar annotated
            with the run's min/max in the chosen unit --- so the eye decodes a
            gradient cyan as "cold", never as "liquid". */}
        {phasesPresent.size > 0 && (
          <Box
            style={{
              position: "absolute",
              left: 12,
              top: 52,
              zIndex: 5,
              padding: "6px 10px",
              borderRadius: 4,
              background: "light-dark(rgba(255,255,255,0.9), rgba(0,0,0,0.55))",
              pointerEvents: "none",
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              maxWidth: 520,
            }}
          >
            {colorMode === "phase" || !propRange ? (
              <>
                <Text size="10px" c="dimmed" ff="monospace" tt="uppercase" style={{ letterSpacing: 0.4 }}>
                  phase
                </Text>
                {PHASE_ORDER.filter((p) => phasesPresent.has(p)).map((p) => (
                  <Box key={p} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <Box
                      style={{
                        width: 18,
                        height: 3,
                        borderRadius: 2,
                        background: phaseColorFor(p, colorScheme),
                        ...(p === "empty" ? { opacity: 0.55 } : {}),
                      }}
                    />
                    <Text size="10px" c="dimmed" ff="monospace">
                      {PHASE_GLYPH[p]} {PHASE_LABEL[p]}
                    </Text>
                  </Box>
                ))}
              </>
            ) : (
              <>
                <Text size="10px" c="dimmed" ff="monospace" tt="uppercase" style={{ letterSpacing: 0.4 }}>
                  {colorMode}
                </Text>
                {Math.abs(propRange.max - propRange.min)
                   < 1e-6 * Math.max(Math.abs(propRange.max), 1) ? (
                  // Degenerate range (e.g. an isothermal case): a gradient over a
                  // single value reads as a rendering glitch ("370 · 370 · 370").
                  // Collapse it to one chip with the single value.
                  <Text size="10px" c="dimmed" ff="monospace">
                    all streams{" "}
                    {colorMode === "temperature"
                      ? `${formatTemperature(propRange.min, tempUnit)} ${temperatureLabel(tempUnit)}`
                      : `${formatPressure(propRange.min, pressUnit)} ${pressureLabel(pressUnit)}`}
                  </Text>
                ) : (
                  <>
                    {/* ParaView-style continuous colour bar: min · mid · max,
                        labelled in the user's unit, on the chosen colormap. */}
                    <Box style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Box
                        style={{
                          width: 160,
                          height: 9,
                          borderRadius: 2,
                          background: gradientCss(colorMap),
                        }}
                      />
                      <Box style={{ display: "flex", justifyContent: "space-between", width: 160 }}>
                        {[propRange.min, (propRange.min + propRange.max) / 2, propRange.max].map((val, i) => (
                          <Text key={i} size="9px" c="dimmed" ff="monospace">
                            {colorMode === "temperature"
                              ? formatTemperature(val, tempUnit)
                              : formatPressure(val, pressUnit)}
                          </Text>
                        ))}
                      </Box>
                    </Box>
                    <Text size="10px" c="dimmed" ff="monospace">
                      {colorMode === "temperature" ? temperatureLabel(tempUnit) : pressureLabel(pressUnit)}
                    </Text>
                  </>
                )}
              </>
            )}
            {/* Honest caption: the styling rule is 1 + 5·√(F/Fmax), so the
                width tracks the SQUARE ROOT of the mass flow, not the flow
                itself (√ compresses the range so small streams stay legible). */}
            <Text size="10px" c="dimmed" ff="monospace" style={{ marginLeft: 4 }}>
              · wire thickness ∝ √(mass flow)
            </Text>
          </Box>
        )}
        {/* Selection card (top-right): the unit's "hardware" --- its
            operation block (schema-driven, in the chosen display units) plus
            the latest-run KPIs.  Appears ONLY when something is selected, so
            it respects the Fase-A "no permanent panels" layout; it floats
            over the canvas (the flowsheet stays visible) instead of a modal,
            per the credo's "pop-out beats modal" / "modals interrupt".  Esc
            or a click on empty canvas clears the selection and dismisses it.
            Starts at top: 52 --- BELOW the Run/Stop panel (top-right, ~45 px
            tall incl. margin) --- so Run stays visible and clickable while a
            node is selected (the card must never cover the view's own Run). */}
        {selectedNodeId && (
          <Box
            style={{
              position: "absolute",
              right: 12,
              top: 52,
              zIndex: 7,
              width: 320,
              maxHeight: "calc(100vh - 160px)",
              // Clip to the rounded border so the inner ScrollArea is what
              // scrolls -- without this, content taller than maxHeight paints
              // PAST the card edge instead of scrolling (playground section).
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              borderRadius: 8,
              border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
              background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
              boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            }}
          >
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => selectNode(null)}
              aria-label="Close"
              style={{ position: "absolute", right: 6, top: 6, zIndex: 1 }}
            >
              <IconX size={15} />
            </ActionIcon>
            <Box style={{ flex: 1, minHeight: 0 }}>
              {/* Contained boundary: a render error in the selected node's
                  details degrades to a small message INSIDE the card, never
                  blanking the canvas + app (credo principle 5). */}
              <ErrorBoundary scope="selection card">
                <PropertyPanel />
              </ErrorBoundary>
            </Box>
          </Box>
        )}
      </ReactFlow>
    </div>
  );
}

// A SHOW filter chip that DISABLES itself when the case contains nothing of
// its class -- a live toggle that does nothing is confusing, so an empty class
// reads as greyed, with a tooltip saying why.
function ShowChip({ color, label, present, checked, onChange, emptyHint }: {
  color: string; label: string; present: boolean;
  checked: boolean; onChange: (v: boolean) => void; emptyHint: string;
}) {
  const chip = (
    <Chip size="xs" radius="sm" color={color} disabled={!present}
      checked={present && checked} onChange={onChange}>
      {label}
    </Chip>
  );
  return present ? chip : (
    <Tooltip label={emptyHint} withArrow position="bottom" w={240} multiline>
      <Box style={{ opacity: 0.6, cursor: "help" }}>{chip}</Box>
    </Tooltip>
  );
}
