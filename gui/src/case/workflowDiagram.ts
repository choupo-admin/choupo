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
  workflowDiagram -- A PROPERTIES CASE DRAWN AS ITS WORKFLOW: ONE BOX PER
  STEP, ARROWS OF INFORMATION (DEV.md 4c C172 slice 3b, Vitor's ruling of
  2026-10-26: "Nas propriedades aquilo devia de abrir com o 'workflow' tal
  como a simulacao abre com o 'flowsheet'! ... Em qualquer um dos casos o
  que circula e so informacao!").

  WHY ONE GRAMMAR FOR BOTH HOMES.  In a sequential-modular simulator an
  arrow is INFORMATION: what one unit computed is the input of the next, and
  it coincides with a pipe only because the method lets information follow
  the streams.  A properties workflow is the same structure -- a graph of
  information walked in an order the engine checks (propsPlan::validate, the
  analogue of validateSequentialPlan) -- so it is drawn with the flowsheet's
  own grammar: boxes, terminals, arrows, frames.

    STUDY     a FRAME around its steps (the case's `studies`, lettered by
              position; a case with none has one unframed group).
    STEP      a BOX (case/workflowSteps.ts: one per numbered step, a set of
              runs being one step), its contents written on it: the type and
              the number of runs, the model and its main options, what it
              reads (FIT / HELD OUT where it fits), what it writes, its state
              and verdict.
    FEED      a terminal on the left: data the workflow takes from outside --
              a measured dataset, a record read by name, a file of the case.
    PROCESS   the "Flowsheet run" terminal: a file a step DECLARES the
              process run writes (`writtenBy { <key> process; }`, ctrl17).
    PRODUCT   a terminal on the right: what leaves -- a record or proposal a
              step writes, a CSV no later step reads, a figure or table the
              case DECLARES (`views`) from the step's results.
    ARROW     from what writes to what reads, labelled with what it carries.
              Step to step only where a later step reads what an earlier one
              writes (the engine's file-traffic table, case/fileTraffic.ts).

  EVERYTHING IS DECLARED, NOTHING IS GUESSED.  The data a step reads are the
  calculation map's data members wired into its operations (case/propsMap.ts,
  read through each op type's schema); the files it reads and writes are the
  engine's table resolved on the op's own dict; the figures are the case's
  declared views.  The topology is therefore the same before and after a run
  (a run adds the state and the verdict to the boxes, never a box) -- as on
  the flowsheet, where the run colours the wires and moves no unit.

  LAYOUT.  Inside a frame: feeds | steps | products, one row per step in the
  order the run takes them, so order reads from position (top to bottom, and
  the studies in column order, left to right).  Frames are packed into the
  columns that give the largest fit zoom on a laptop pane, because a fit's
  zoom decides which labels stay legible (case/legibility.ts).

  PURE (no React).  ui/WorkflowDiagram.tsx draws it.
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";
import type { MapNode, MapTarget, PropsMap } from "./propsMap.js";
import { neighbours } from "./propsMap.js";
import { stepLabel, type WorkflowStep, type WorkflowStudy } from "./workflowSteps.js";
import { opFiles, type StepFile } from "./fileTraffic.js";
import { fitEvidence, ROLE_WORD, type EvidenceRole } from "./fitEvidence.js";
import { RUN_STATE_WORD, type RunState, type VerdictRow } from "./reviewScreen.js";
import { operationMapMeta } from "./operationSchemas.js";
import { recordNameOfPath } from "./caseModes.js";

/* ---- what an arrow carries ------------------------------------------------ */

/** What an arrow carries.  Each kind has a dash pattern of its OWN (no
 *  meaning in colour alone, C168 ruling (d)) and a colour as the second
 *  channel; `light` is the ink on the light canvas, `dark` on the dark one
 *  (both >= 3:1 on their canvas).  The colours and dashes of the five kinds
 *  the calculation map drew are kept (it is retired; this is their one home
 *  now), and `process` is new: information that comes from the Flowsheet. */
export type WireKind = "measured" | "record" | "file" | "process" | "written" | "result";

export interface WireSpec {
  word: string;
  meaning: string;
  dark: string;
  light: string;
  /** SVG stroke-dasharray, absent = solid */
  dash?: string;
  width: number;
}

export const WIRES: Record<WireKind, WireSpec> = {
  measured: { word: "measured data", meaning: "a dataset of measurements the step reads (FIT: it is fitted to; HELD OUT: it is judged on)",
    dark: "#ff6b6b", light: "#e03131", dash: "14 4", width: 2 },
  record:   { word: "record", meaning: "an equipment or substance record the step reads by name",
    dark: "#adb5bd", light: "#6c757d", dash: "1.5 3.5", width: 1.8 },
  file:     { word: "file", meaning: "a file of the case, or one an earlier step wrote",
    dark: "#4dabf7", light: "#1864ab", dash: "8 3 2 3", width: 2 },
  process:  { word: "from the Flowsheet run", meaning: "a file the process run writes and the step declares it reads (writtenBy ... process)",
    dark: "#ffa94d", light: "#b35c00", dash: "10 3 2 3 2 3", width: 2 },
  written:  { word: "written", meaning: "a record, proposal or file the step writes",
    dark: "#f06595", light: "#c2255c", dash: "5 5", width: 2 },
  result:   { word: "result", meaning: "the step's results, drawn by a figure or table the case declares",
    dark: "#20c997", light: "#087f5b", width: 2.4 },
};

/* ---- the drawing ---------------------------------------------------------- */

export interface Box { x: number; y: number; w: number; h: number }

/** One line written on a step's box. */
export interface StepLine {
  kind: "type" | "model" | "options" | "reads" | "writes" | "feeds" | "state";
  text: string;
  /** the whole line, when the box truncates it */
  title: string;
}

export interface DiagramStep extends Box {
  kind: "step";
  /** the React Flow node id */
  id: string;
  /** the step's id, `op:<first op>` -- the selection everywhere */
  stepId: string;
  studyId: string;
  number: string;
  label: string;
  type: string;
  runs: number;
  lines: StepLine[];
  state: RunState;
  verdicts: string[];
}

export type TerminalSide = "feed" | "process" | "product";

export interface DiagramTerminal extends Box {
  kind: "terminal";
  id: string;
  side: TerminalSide;
  /** what a click selects: the calculation map's member id where the map
   *  has one (`record:X`, `file:<path>`, `view:<dom>`, `out:<op>:<key>`),
   *  else a `wf:` id of its own */
  selectId: string;
  label: string;
  /** a second word: what it is (measured data · FIT, record, figure ...) */
  detail: string;
  /** what a double click opens (the map member's target), if anything */
  target?: MapTarget;
  /** a longer sentence for the tooltip (a view's declared title) */
  title?: string;
  studyId: string;
}

export interface DiagramFrame extends Box {
  kind: "frame";
  id: string;
  studyId: string;
  letter: string;
  title: string;
  /** a study the case declares (framed); false for the one implicit group */
  declared: boolean;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  wire: WireKind;
  /** what it carries, in a word or a file name */
  label: string;
}

export interface WorkflowDiagram {
  frames: DiagramFrame[];
  steps: DiagramStep[];
  terminals: DiagramTerminal[];
  edges: DiagramEdge[];
  width: number;
  height: number;
}

export interface DiagramInput {
  outline: readonly WorkflowStudy[];
  map: PropsMap;
  propsDict: JsonDict | null | undefined;
  rows: readonly VerdictRow[];
}

/* ---- sizes (drawing units = CSS px at zoom 1) ----------------------------- */

export const STEP_W = 270;
/** the number + name line (15 px bold) */
export const STEP_HEAD_H = 28;
/** one written line (13 px) */
export const STEP_LINE_H = 18;
export const STEP_PAD_Y = 10;
export const TERM_W = 190;
export const TERM_H = 48;
const TERM_GAP = 8;
const GAP_X = 64;
const ROW_GAP = 18;
export const FRAME_PAD = 14;
export const FRAME_HEAD = 34;
const COL_GAP = 48;
const FRAME_GAP = 28;
/** the pane the packing aims at: a 1366 x 768 laptop with the outline open,
 *  less the chrome and the fit's margins */
const PANE = { w: 980, h: 520 };

/** The height of a step box with `n` written lines. */
export function stepHeight(n: number): number {
  return STEP_PAD_Y * 2 + STEP_HEAD_H + n * STEP_LINE_H;
}

/* ---- reading a step ------------------------------------------------------- */

const isDict = (v: unknown): v is JsonDict => !!v && typeof v === "object" && !Array.isArray(v);
const base = (p: string) => p.split("/").pop() ?? p;

const opDictOf = (propsDict: JsonDict | null | undefined, name: string): JsonDict | null => {
  const ops = propsDict?.["operations"];
  if (!Array.isArray(ops)) return null;
  return (ops.find((o) => isDict(o) && o["name"] === name) as JsonDict | undefined) ?? null;
};

/** A step's files over its runs, one per (direction, key, value). */
export function stepFiles(step: WorkflowStep, propsDict: JsonDict | null | undefined): StepFile[] {
  const out: StepFile[] = [];
  const seen = new Set<string>();
  for (const name of step.ops) {
    const op = opDictOf(propsDict, name);
    if (!op) continue;
    for (const f of opFiles(op, step.type)) {
      const k = `${f.dir}|${f.key}|${f.value}`;
      if (!seen.has(k)) { seen.add(k); out.push(f); }
    }
  }
  return out;
}

/** The step's state over its runs: failed if any failed, no result if any
 *  published none, done when all ran. */
export function stepState(rows: readonly VerdictRow[], ops: readonly string[]): RunState {
  const mine = rows.filter((r) => ops.includes(r.name));
  if (mine.length === 0 || mine.every((r) => r.runState === "notRun")) return "notRun";
  if (mine.some((r) => r.runState === "failed")) return "failed";
  if (mine.some((r) => r.runState === "noResult")) return "noResult";
  return "done";
}

/** The state as a glyph AND a word (no meaning in colour alone). */
export const STATE_GLYPH: Record<RunState, string> = { done: "✓", failed: "✗", noResult: "!", notRun: "○" };

/** The model a step applies, as the map wires it: the law (the first slot
 *  the op declares a value for), the choices inside it, the op's own fixed
 *  method (a fit's regression), and the case's thermo package. */
export function stepModel(step: WorkflowStep, map: PropsMap): {
  law: MapNode | undefined; options: MapNode[]; methods: MapNode[]; pkg: MapNode | undefined;
} {
  const ids = step.ops.map((o) => `op:${o}`);
  const up = [...new Set(ids.flatMap((i) => neighbours(map, i).up))];
  const nodeOf = (id: string) => map.nodes.find((n) => n.id === id);
  const fixedRoles = new Set((operationMapMeta(step.type)?.models ?? []).filter((s) => s.fixed).map((s) => s.role));
  const models = up.map(nodeOf).filter((n): n is MapNode => !!n && n.kind === "model");
  const pkg = models.find((n) => n.id === "package");
  const own = models.filter((n) => n.id !== "package" && !fixedRoles.has(n.role));
  const methods = models.filter((n) => n.id !== "package" && fixedRoles.has(n.role));
  return { law: own[0], options: own.slice(1), methods, pkg };
}

/** How many of a list fit in `max` words, the rest said as "+n". */
function listed(words: string[], max: number): string {
  if (words.length <= max) return words.join(", ");
  return `${words.slice(0, max).join(", ")} +${words.length - max}`;
}

/** One read of a step, resolved: where it comes from and what it carries. */
interface StepRead {
  /** the map member it is (a data node), or a `wf:` id */
  selectId: string;
  label: string;
  detail: string;
  wire: WireKind;
  carries: string;
  target?: MapTarget;
  /** the step that writes it, when an earlier step does */
  fromStep?: string;
  /** a FIT / HELD OUT role, where the step fits */
  role?: EvidenceRole;
  /** the file the process run writes */
  byProcess?: boolean;
  /** the value the engine's table resolves (a path, a record name) */
  value?: string;
}

interface StepWrite {
  selectId: string;
  label: string;
  detail: string;
  wire: WireKind;
  carries: string;
  target?: MapTarget;
  value: string;
  /** a declared view: what it is ("figure", "table") */
  view?: "figure" | "table";
  /** the view's declared title */
  title?: string;
}

/** A declared view is a FIGURE or a TABLE (its declared `type`: `table`
 *  draws numbers, every other type -- series, profile, parity ... -- a
 *  figure). */
function viewKind(propsDict: JsonDict | null | undefined, name: string): "figure" | "table" {
  const views = propsDict?.["views"];
  const v = Array.isArray(views) ? views.find((x) => isDict(x) && x["name"] === name) as JsonDict | undefined : undefined;
  return v?.["type"] === "table" ? "table" : "figure";
}

/** Does `read` (a path or record name) name what `write` (a path) writes? */
function sameThing(read: StepFile, write: StepFile): boolean {
  if (read.kind === "membraneName" || write.kind === "record")
    return recordNameOfPath(read.value) === recordNameOfPath(write.value);
  return read.value.replace(/^\.\//, "") === write.value.replace(/^\.\//, "");
}

const ROLE_OF_DATA: Record<string, string> = {
  record: "record", experiment: "measured data", reference: "reference numbers", inline: "inline numbers",
};

/** The diagram of a workflow.  Pure: the same declaration draws the same
 *  diagram; the rows add only the state and the verdicts. */
export function workflowDiagram(input: DiagramInput): WorkflowDiagram {
  const { outline, map, propsDict, rows } = input;
  const nodeOf = (id: string) => map.nodes.find((n) => n.id === id);
  const allSteps = outline.flatMap((st) => st.steps.map((s) => ({ study: st, step: s })));
  const filesOf = new Map(allSteps.map(({ step }) => [step.id, stepFiles(step, propsDict)]));

  //  WHAT EACH STEP READS: the map's data members wired into its ops, each
  //  with its FIT / HELD OUT role where the op is a fit; then every file the
  //  engine's table resolves that the map draws no member for; a read an
  //  EARLIER step writes is an arrow from that step, never a terminal.
  const readsOf = new Map<string, StepRead[]>();
  const writesOf = new Map<string, StepWrite[]>();
  const consumed = new Map<string, Set<string>>();   // writer step -> values read later
  allSteps.forEach(({ step }, idx) => {
    const ids = step.ops.map((o) => `op:${o}`);
    const files = filesOf.get(step.id)!;
    const roles = new Map<string, EvidenceRole>();
    for (const name of step.ops)
      for (const e of fitEvidence(opDictOf(propsDict, name))) roles.set(e.dataset, e.role);
    const reads: StepRead[] = [];
    const seen = new Set<string>();
    const fileReads = files.filter((f) => f.dir === "read");
    const earlierWriter = (f: StepFile): string | undefined => {
      for (let j = idx - 1; j >= 0; j--) {
        const w = filesOf.get(allSteps[j]!.step.id)!.filter((x) => x.dir === "write");
        const hit = w.find((x) => sameThing(f, x));
        if (hit) {
          const set = consumed.get(allSteps[j]!.step.id) ?? new Set<string>();
          set.add(hit.value); consumed.set(allSteps[j]!.step.id, set);
          return allSteps[j]!.step.id;
        }
      }
      return undefined;
    };
    //  which table read a map data member is (by path, or by record name)
    const readFor = (n: MapNode): StepFile | undefined => fileReads.find((f) =>
      n.id === `file:${f.value}` || n.id === `record:${f.value}` || n.member.label === base(f.value)
      || (n.member.target.kind === "case" && n.member.target.path === f.value));
    const up = [...new Set(ids.flatMap((i) => neighbours(map, i).up))];
    for (const id of up) {
      const n = nodeOf(id);
      if (!n || n.kind !== "data" || n.role === "inline") continue;
      const f = readFor(n);
      const path = n.member.target.kind === "case" ? n.member.target.path : undefined;
      const role = roles.get(f?.value ?? "") ?? (path ? roles.get(path) : undefined);
      const from = f ? earlierWriter(f) : undefined;
      seen.add(id);
      if (f) seen.add(`${f.key}|${f.value}`);
      if (f?.byProcess) {
        reads.push({ selectId: id, label: n.member.label, detail: "written by the Flowsheet run", wire: "process",
          carries: base(f.value), target: n.member.target, byProcess: true, value: f.value });
        continue;
      }
      reads.push({ selectId: id, label: n.member.label,
        detail: role ? `${ROLE_OF_DATA[n.role] ?? n.role} · ${ROLE_WORD[role]}` : (ROLE_OF_DATA[n.role] ?? n.role),
        wire: n.role === "record" ? "record" : n.role === "experiment" ? "measured" : "file",
        carries: role ? ROLE_WORD[role] : n.role === "record" ? "record" : n.role === "experiment" ? "data" : "numbers",
        target: n.member.target, fromStep: from, role, value: f?.value });
    }
    for (const f of fileReads) {
      if (seen.has(`${f.key}|${f.value}`)) continue;
      seen.add(`${f.key}|${f.value}`);
      const from = earlierWriter(f);
      const role = roles.get(f.value);
      reads.push({ selectId: f.kind === "membraneName" ? `record:${f.value}` : `wf:file:${f.value}`,
        label: base(f.value), detail: f.byProcess ? "written by the Flowsheet run"
          : f.kind === "membraneName" ? "record" : role ? `file · ${ROLE_WORD[role]}` : "file",
        wire: f.byProcess ? "process" : f.kind === "membraneName" ? "record" : role ? "measured" : "file",
        carries: f.byProcess ? base(f.value) : role ? ROLE_WORD[role] : f.kind === "membraneName" ? "record" : base(f.value),
        fromStep: from, role, byProcess: f.byProcess, value: f.value });
    }
    readsOf.set(step.id, reads);
  });

  //  WHAT EACH STEP WRITES: the engine's table (records, proposals, files),
  //  each matched to the map's member where it draws one; then the figures
  //  and tables the case DECLARES from its results.
  allSteps.forEach(({ step }) => {
    const ids = step.ops.map((o) => `op:${o}`);
    const down = [...new Set(ids.flatMap((i) => neighbours(map, i).down))];
    const writes: StepWrite[] = [];
    const seen = new Set<string>();
    for (const f of filesOf.get(step.id)!.filter((x) => x.dir === "write")) {
      if (seen.has(f.value)) continue;
      seen.add(f.value);
      const n = f.kind === "record" ? nodeOf(`record:${recordNameOfPath(f.value)}`)
        : f.kind === "proposal" ? down.map(nodeOf).find((x) => !!x && x.role === "proposal"
            && (x.member.label === f.value || x.member.label === base(f.value) || f.value === "auto"))
        : undefined;
      const readers = n ? neighbours(map, n.id).down.filter((d) => d.startsWith("unit:")).map((d) => d.slice(5)) : [];
      writes.push({ selectId: n?.id ?? `wf:file:${f.value}`, label: base(f.value),
        detail: f.kind === "record" ? (readers.length ? `record · read by the Flowsheet's ${readers.join(", ")}` : "record, into the case")
          : f.kind === "proposal" ? "proposal (a draft to promote)" : "file the run writes",
        wire: "written", carries: f.kind === "record" ? "record" : f.kind === "proposal" ? "proposal" : "CSV",
        target: n?.member.target, value: f.value });
    }
    for (const d of down) {
      const n = nodeOf(d);
      if (!n || n.kind !== "view" || n.role !== "views" || !d.startsWith("view:view-declared-")) continue;
      const kind = viewKind(propsDict, n.member.label);
      writes.push({ selectId: d, label: n.member.label, detail: kind, title: n.member.detail, wire: "result",
        carries: "result", target: n.member.target, value: d, view: kind });
    }
    writesOf.set(step.id, writes);
  });

  //  THE BOX'S LINES, every one a fact read above or published by the run
  const linesOf = (step: WorkflowStep): StepLine[] => {
    const out: StepLine[] = [];
    const push = (kind: StepLine["kind"], text: string, title = text) => out.push({ kind, text, title });
    push("type", `${step.type}${step.ops.length > 1 ? ` · ${step.ops.length} runs` : ""}`,
      `${step.type}${step.ops.length > 1 ? ` -- ${step.ops.length} runs: ${step.ops.join(", ")}` : ""}`);
    const m = stepModel(step, map);
    if (m.law) {
      const opts = m.options.map((o) => o.member.label);
      push("model", `model ${m.law.member.label}`, `${m.law.member.detail}: ${m.law.member.label}`);
      if (opts.length) push("options", `· ${listed(opts, 2)}`,
        m.options.map((o) => `${o.member.detail}: ${o.member.label}`).join("; "));
    } else if (m.pkg) {
      push("model", `model: the case's thermo package`, `constant/thermoPhysPropDict: ${m.pkg.member.detail}`);
    }
    if (m.methods.length)
      push("options", `by ${m.methods.map((x) => x.member.label).join(", ")}`,
        m.methods.map((x) => `${x.member.detail}: ${x.member.label}`).join("; "));
    const reads = readsOf.get(step.id) ?? [];
    const fit = reads.filter((r) => r.role === "fit").map((r) => r.label);
    const held = reads.filter((r) => r.role === "heldOut").map((r) => r.label);
    const other = reads.filter((r) => !r.role).map((r) => r.label);
    if (fit.length) push("reads", `FIT ${listed(fit, 1)}`, `FIT (fitted to): ${fit.join(", ")}`);
    if (held.length) push("reads", `HELD OUT ${listed(held, 1)}`, `HELD OUT (judged on, never fitted): ${held.join(", ")}`);
    if (other.length) push("reads", `reads ${listed(other, 1)}`, `reads: ${other.join(", ")}`);
    const writes = writesOf.get(step.id) ?? [];
    const files = writes.filter((w) => !w.view).map((w) => w.label);
    const figs = writes.filter((w) => w.view === "figure").length;
    const tabs = writes.filter((w) => w.view === "table").length;
    if (files.length) push("writes", `writes ${listed(files, 1)}`, `writes: ${files.join(", ")}`);
    if (figs || tabs) push("feeds", `feeds ${[figs ? `${figs} ${figs === 1 ? "figure" : "figures"}` : "",
      tabs ? `${tabs} ${tabs === 1 ? "table" : "tables"}` : ""].filter(Boolean).join(", ")}`,
      writes.filter((w) => w.view).map((w) => `${w.label}: ${w.title ?? ""}`).join("; "));
    const state = stepState(rows, step.ops);
    const verdicts = [...new Set(rows.filter((r) => step.ops.includes(r.name) && r.verdict).map((r) => r.verdict))];
    const done = rows.filter((r) => step.ops.includes(r.name) && r.runState === "done").length;
    push("state", `${STATE_GLYPH[state]} ${RUN_STATE_WORD[state]}`
      + (step.ops.length > 1 && state !== "notRun" ? ` (${done}/${step.ops.length})` : "")
      + (verdicts.length ? ` · ${verdicts.join(", ")}` : ""));
    return out;
  };

  /* ---- layout of each study frame, in its own coordinates ---------------- */
  const termX = FRAME_PAD;
  const stepX = termX + TERM_W + GAP_X;
  const prodX = stepX + STEP_W + GAP_X;
  const frameW = prodX + TERM_W + FRAME_PAD;
  interface Local { frame: DiagramFrame; steps: DiagramStep[]; terminals: DiagramTerminal[] }
  const locals: Local[] = [];
  const edges: DiagramEdge[] = [];
  const nodeIdOfStep = (stepId: string) => `step:${stepId}`;
  const productOf = new Map<string, string>();   // `${study}|${selectId}` -> node id

  for (const st of outline) {
    const steps: DiagramStep[] = [];
    const terminals: DiagramTerminal[] = [];
    const feedNode = new Map<string, DiagramTerminal>();
    let y = FRAME_HEAD;
    const framed = st.declared || outline.length > 1;
    for (const step of st.steps) {
      const lines = linesOf(step);
      const h = stepHeight(lines.length);
      const rowTop = y;
      const node: DiagramStep = { kind: "step", id: nodeIdOfStep(step.id), stepId: step.id, studyId: st.id,
        number: step.number, label: stepLabel(step), type: step.type, runs: step.ops.length, lines,
        state: stepState(rows, step.ops),
        verdicts: [...new Set(rows.filter((r) => step.ops.includes(r.name) && r.verdict).map((r) => r.verdict))],
        x: stepX, y: rowTop, w: STEP_W, h };
      steps.push(node);
      //  the feeds this step reads first, stacked to its left
      let fy = rowTop;
      for (const r of readsOf.get(step.id) ?? []) {
        if (r.fromStep) {
          edges.push({ id: `e:${r.fromStep}->${step.id}:${r.value ?? r.selectId}`, from: nodeIdOfStep(r.fromStep),
            to: node.id, wire: r.wire === "process" ? "process" : "file", label: base(r.value ?? r.label) });
          continue;
        }
        const key = r.byProcess ? "wf:process" : r.selectId;
        let t = feedNode.get(key);
        if (!t) {
          t = r.byProcess
            ? { kind: "terminal", id: `t:${st.id}:wf:process`, side: "process", selectId: "wf:process",
                label: "Flowsheet run", detail: "the process run writes it: run the Flowsheet first",
                studyId: st.id, x: termX, y: fy, w: TERM_W, h: TERM_H }
            : { kind: "terminal", id: `t:${st.id}:${r.selectId}`, side: "feed", selectId: r.selectId,
                label: r.label, detail: r.detail, target: r.target, studyId: st.id,
                x: termX, y: fy, w: TERM_W, h: TERM_H };
          feedNode.set(key, t);
          terminals.push(t);
          fy += TERM_H + TERM_GAP;
        }
        edges.push({ id: `e:${t.id}->${step.id}:${r.value ?? r.selectId}`, from: t.id, to: node.id, wire: r.wire,
          label: r.carries });
      }
      //  what leaves: written and not read later, and the declared views
      let py = rowTop;
      const later = consumed.get(step.id) ?? new Set<string>();
      for (const w of writesOf.get(step.id) ?? []) {
        if (!w.view && later.has(w.value)) continue;
        const key = `${st.id}|${w.selectId}`;
        let tid = productOf.get(key);
        if (!tid) {
          tid = `t:${st.id}:out:${w.selectId}`;
          productOf.set(key, tid);
          terminals.push({ kind: "terminal", id: tid, side: "product", selectId: w.selectId, label: w.label,
            detail: w.detail, title: w.title, target: w.target, studyId: st.id, x: prodX, y: py, w: TERM_W, h: TERM_H });
          py += TERM_H + TERM_GAP;
        }
        edges.push({ id: `e:${step.id}->${tid}`, from: node.id, to: tid, wire: w.wire, label: w.carries });
      }
      y = Math.max(rowTop + h, fy - TERM_GAP, py - TERM_GAP) + ROW_GAP;
    }
    const frame: DiagramFrame = { kind: "frame", id: `frame:${st.id}`, studyId: st.id, letter: st.letter,
      title: st.title, declared: framed, x: 0, y: 0, w: frameW, h: y - ROW_GAP + FRAME_PAD };
    locals.push({ frame, steps, terminals });
  }

  /* ---- frames into columns: the packing with the largest fit zoom ------- */
  const n = locals.length;
  let best: number[][] = [locals.map((_, i) => i)];
  let bestZoom = -1;
  for (let k = 1; k <= Math.max(1, n); k++) {
    const cols = balancedColumns(locals.map((l) => l.frame.h), k);
    const w = cols.length * frameW + (cols.length - 1) * COL_GAP;
    const h = Math.max(...cols.map((c) => c.reduce((a, i) => a + locals[i]!.frame.h, 0) + (c.length - 1) * FRAME_GAP));
    const zoom = Math.min(PANE.w / w, PANE.h / h);
    if (zoom > bestZoom + 1e-9) { bestZoom = zoom; best = cols; }
  }
  const frames: DiagramFrame[] = [];
  const steps: DiagramStep[] = [];
  const terminals: DiagramTerminal[] = [];
  let width = 0, height = 0;
  best.forEach((col, ci) => {
    let oy = 0;
    const ox = ci * (frameW + COL_GAP);
    for (const i of col) {
      const l = locals[i]!;
      const shift = <T extends Box>(b: T): T => ({ ...b, x: b.x + ox, y: b.y + oy });
      frames.push(shift(l.frame));
      steps.push(...l.steps.map(shift));
      terminals.push(...l.terminals.map(shift));
      oy += l.frame.h + FRAME_GAP;
      height = Math.max(height, oy - FRAME_GAP);
    }
    width = Math.max(width, ox + frameW);
  });
  return { frames, steps, terminals, edges, width, height };
}

/** Consecutive groups of `heights` in `k` columns, the tallest column as
 *  short as it can be (reading order kept: column after column). */
export function balancedColumns(heights: readonly number[], k: number): number[][] {
  const n = heights.length;
  if (n === 0) return [];
  const kk = Math.min(k, n);
  //  dp over (frames used, columns used): the smallest tallest column
  const pre = [0];
  for (const h of heights) pre.push(pre[pre.length - 1]! + h + FRAME_GAP);
  const colH = (a: number, b: number) => pre[b]! - pre[a]! - FRAME_GAP;
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: kk + 1 }, () => Array(n + 1).fill(INF));
  const cut: number[][] = Array.from({ length: kk + 1 }, () => Array(n + 1).fill(0));
  dp[0]![0] = 0;
  for (let c = 1; c <= kk; c++)
    for (let b = 1; b <= n; b++)
      for (let a = c - 1; a < b; a++) {
        const v = Math.max(dp[c - 1]![a]!, colH(a, b));
        if (v < dp[c]![b]!) { dp[c]![b] = v; cut[c]![b] = a; }
      }
  const out: number[][] = [];
  let b = n;
  for (let c = kk; c >= 1; c--) {
    const a = cut[c]![b]!;
    out.unshift(Array.from({ length: b - a }, (_, i) => a + i));
    b = a;
  }
  return out.filter((c) => c.length > 0);
}
