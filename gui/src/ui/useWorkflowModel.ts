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
  useWorkflowModel -- WHAT EVERY SURFACE OF A PROPERTIES CASE READS, derived
  ONCE per render from the open case and its run (DEV.md 4c C172 slice 3b).

  The Workflow diagram, the selection card (PropertyPanel), the outline, the
  Studies view, the Reports and a step's own tab all ask the same questions
  -- which steps, which studies, what the map wires, what the run said of
  each operation, where each block sits in system/propsDict -- and they get
  the same answers from here.  Nothing is computed that a pure module does
  not already compute (case/workflowSteps.ts, case/propsMap.ts,
  case/reviewScreen.ts, case/workflowDiagram.ts).

  ONE SELECTION.  A step's id is its first operation's map id (`op:<name>`);
  a study is `study:<name>`; a dataset, a record, a model or a figure is the
  map's member id.  The selection lives in the store per case
  (`propsViewFor`), so the diagram, the outline and the card agree, and a
  trip to another tab finds it where the reader left it (DEV.md 4c C154).
\*---------------------------------------------------------------------------*/

import { useCallback, useMemo } from "react";
import { notifications } from "@mantine/notifications";

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { useStore } from "../state/store.js";
import { useCaseMode } from "../state/useCaseMode.js";
import { verdictRows, type VerdictRow } from "../case/reviewScreen.js";
import {
  caseTree, derivePropsMap, PROPS_DICT_PATH, type CaseTreeNode, type MapTarget, type PropsMap,
} from "../case/propsMap.js";
import { locatePropsBlocks } from "../case/propsDictLocate.js";
import { PROPS_DISCIPLINES } from "../case/operationSchemas.js";
import { workflowOutline, type WorkflowStudy } from "../case/workflowSteps.js";
import { workflowDiagram, type WorkflowDiagram } from "../case/workflowDiagram.js";
import { mapStates } from "../case/propsMapState.js";
import { useStaleParts } from "../state/useStaleResult.js";
import { openGuide } from "../help/guideLinks.js";

export interface WorkflowModel {
  /** the case's name: the selection and My plots are kept per case */
  caseKey: string;
  propsDict: JsonDict | null;
  thermo: JsonDict | null;
  rawFiles: Record<string, string> | undefined;
  flowsheet: JsonDict | null;
  /** the properties run (a two-mode case keeps it apart from the process run) */
  result: RunResult | undefined;
  ran: boolean;
  outline: WorkflowStudy[];
  map: PropsMap;
  rows: VerdictRow[];
  diagram: WorkflowDiagram;
  /** the outline's lower half: the data, models and records the steps read
   *  and write (the map's tree, without its operations: the steps ARE them) */
  tree: CaseTreeNode[];
  selected: string;
  select: (id: string) => void;
  /** the operation's block in system/propsDict */
  opLink: (op: string) => MapTarget | undefined;
  /** what F1, a double click or a "?" on a member does */
  activate: (t: MapTarget) => void;
  /** a study's block in system/propsDict, or a member's own target */
  targetOf: (id: string) => MapTarget | undefined;
  /** the operations a change since the run reaches (case/propsMapState.ts:
   *  attributed along the map's wires, never guessed) */
  staleOps: ReadonlySet<string>;
  /** the case changed in a way no step can be named for: said once */
  caseWideStale: boolean;
}

/** The properties run of the open case: its own slot on a two-mode case. */
export function usePropsResult(): RunResult | undefined {
  const twoMode = useCaseMode().modes !== null;
  const runResult = useStore((s) => s.runResult);
  const propsRunResult = useStore((s) => s.propsRunResult);
  return (twoMode ? propsRunResult : runResult) ?? undefined;
}

/** Scroll the Studies view to a figure, once it is drawn. */
export function showFigureInStudies(domId: string): void {
  useStore.getState().setActiveWorkspace("studies");
  let tries = 0;
  const go = () => {
    const el = typeof document !== "undefined" ? document.getElementById(domId) : null;
    if (el) { el.scrollIntoView({ block: "start" }); return; }
    if (++tries < 30) window.setTimeout(go, 100);
  };
  window.setTimeout(go, 50);
}

export function useWorkflowModel(resultOverride?: RunResult): WorkflowModel {
  const caseKey = useStore((s) => s.tutorialName) || "case";
  const propsDict = useStore((s) => s.caseFiles.propsDict) ?? null;
  const thermo = useStore((s) => s.caseFiles.thermoPackage) ?? null;
  const rawFiles = useStore((s) => s.caseFiles.rawFiles);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet) ?? null;
  const own = usePropsResult();
  const result = resultOverride ?? own;
  const view = useStore((s) => s.propsViewFor[caseKey]);
  const setPropsView = useStore((s) => s.setPropsView);
  const openCaseAt = useStore((s) => s.openCaseAt);
  const setCaseMode = useStore((s) => s.setCaseMode);
  const selectNode = useStore((s) => s.selectNode);

  const selected = view?.selected ?? "";
  const select = useCallback((id: string) => setPropsView(caseKey, { selected: id }), [caseKey, setPropsView]);
  const ops = useMemo(() => (Array.isArray(propsDict?.["operations"]) ? propsDict!["operations"] as JsonDict[] : []),
    [propsDict]);
  const rows = useMemo(() => verdictRows(ops, result?.operationResults ?? [], result?.validation, result?.status, propsDict),
    [ops, result, propsDict]);
  const outline = useMemo(() => workflowOutline(propsDict), [propsDict]);
  const map = useMemo(() => derivePropsMap({
    propsDict, thermo, rawFiles, post: result?.postProcessing ?? null, results: result?.operationResults, flowsheet,
  }), [propsDict, thermo, rawFiles, result, flowsheet]);
  const diagram = useMemo(() => workflowDiagram({ outline, map, propsDict, rows }), [outline, map, propsDict, rows]);
  const verdicts = useMemo(() => new Map(rows.filter((r) => r.verdict).map((r) => [r.name, r.verdict])), [rows]);
  const tree = useMemo(() => caseTree(map, propsDict, PROPS_DISCIPLINES, [], verdicts)
    .filter((n) => n.id !== "folder:ops" && n.id !== "folder:myplots"), [map, propsDict, verdicts]);
  const where = useMemo(() => locatePropsBlocks(rawFiles?.[PROPS_DICT_PATH]), [rawFiles]);
  const stale = useStaleParts();
  const states = useMemo(() => mapStates(map, result, { stale: stale.stale, changed: stale.changed }),
    [map, result, stale]);
  const staleOps = useMemo(() => new Set([...states.member].filter(([id, st]) => st === "stale" && id.startsWith("op:"))
    .map(([id]) => id.slice(3))), [states]);

  const opLink = useCallback((op: string): MapTarget | undefined => {
    const l = where.operations.get(op);
    return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine, label: `${op} in system/propsDict` } : undefined;
  }, [where]);

  const activate = useCallback((t: MapTarget) => {
    if (t.kind === "guide") openGuide(t.url);
    else if (t.kind === "case") openCaseAt(t.path, t.line, t.endLine);
    else if (t.kind === "view") showFigureInStudies(t.domId);
    else if (t.kind === "process") { setCaseMode("process"); selectNode(`unit:${t.unit}`); }
    else notifications.show({ message: t.label, color: "gray", autoClose: 4000 });
  }, [openCaseAt, setCaseMode, selectNode]);

  const targetOf = useCallback((id: string): MapTarget | undefined => {
    if (!id) return undefined;
    if (id.startsWith("study:")) {
      const l = where.studies.get(id.slice(6));
      return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine,
        label: `study ${id.slice(6)} in system/propsDict` } : undefined;
    }
    const n = map.nodes.find((x) => x.id === id);
    return n?.member.target;
  }, [map, where]);

  return {
    caseKey, propsDict, thermo, rawFiles, flowsheet, result, ran: result?.status === "done",
    outline, map, rows, diagram, tree, selected, select, opLink, activate, targetOf,
    staleOps, caseWideStale: states.caseWide && !!result,
  };
}
