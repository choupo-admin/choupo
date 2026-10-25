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
  propsMap -- A PROPS CASE DRAWN AS A FLOWSHEET OF ITS CALCULATION
  (DEV.md 4c C151; record docs/design/a-props-case-drawn-as-its-calculation.md).

  Four kinds of block, left to right:

      DATA        the measurements, other sources' numbers, the equipment and
                  substance records and the inline numbers the case gives
      MODELS      the law each operation applies and every declared choice
                  inside it (DSPM-DE, its activity, hindrance, pore solver ...),
                  and the case's thermo package where an operation reads it
      OPERATIONS  what the bench is asked to do, one block per op TYPE within
                  a study, its activity as a word
      VIEWS       the figures and tables the operations feed, and the records
                  they propose

  EVERYTHING IS DERIVED, nothing is drawn by hand: the blocks and wires come
  from the propsDict (each op's keys, each view's `op` / `ops` / `reference`,
  the `references` list) read through each op type's map declaration in its
  schema (`x-choupo`, case/operationSchemas.ts -- the one home of which keys
  name a model, which name data, which a record written).  A run adds what
  only a run knows: each op's default views and its verdict.

  STUDIES.  Ops, views, references and data files that refer to each other
  form a connected component; a component holding a declared view is a STUDY
  and is drawn in its own labelled frame (NanoFiltran's three parts fall out
  as three).  Records, models and the package are SHARED resources and do not
  join studies -- one membrane record used by two parts would otherwise weld
  them -- so each sits in the frame of its first consumer and its wires cross
  frames.  Everything with no declared view shares one unframed band.

  SMALL BY DEFAULT.  Within a study the ops of one type are ONE block ("22
  poreTransport" is one block listing them), the data of one kind is one
  block, the views are one block, the models of one law are one block; each
  lists its members as rows that can be clicked, and an `expanded` group is
  drawn member by member.  The empirical ceiling for reading a node-link
  diagram is about fifty nodes (Yoghourdjian et al., arXiv 2008.07944); the
  NanoFiltran case, 22 ops and 12 views, draws in thirteen.

  This module COMPUTES NO NUMBER: badges are counts of what is declared and
  the verdict words the engine published.
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import type { OperationResult } from "../adapters/SolverAdapter.js";
import type { PostProcessingBlock } from "./postProcessing.js";
import {
  operationDescription, operationMapMeta,
  type OpDataSlot, type OpMapMeta, type PropsActivity, type PropsDiscipline,
} from "./operationSchemas.js";
import { propsModelTheoryLink, propsOpHelpLink } from "./modelDocs.js";
import { locatePropsBlocks, type BlockLines } from "./propsDictLocate.js";
import { firstSentence } from "./reviewScreen.js";
import { recordNameOfPath, unitsReadingRecord } from "./caseModes.js";
import { declaredStudies, purposeWords } from "./propsStudies.js";

export const PROPS_DICT_PATH = "system/propsDict";
export const THERMO_DICT_PATH = "constant/thermoPhysPropDict";

export type BlockKind = "data" | "model" | "operation" | "view" | "unit";
/** What a wire carries -- each its own colour AND dash, so colour is never
 *  the only cue (ui/PropsMap.tsx draws the legend). */
export type FlowKind = "measured" | "reference" | "record" | "model" | "result" | "proposal";

/** What F1, a double click or the block's "?" does. */
export type MapTarget =
  | { kind: "guide"; url: string; label: string }
  | { kind: "view"; domId: string; label: string }
  | { kind: "case"; path: string; line?: number; endLine?: number; label: string }
  /** a unit of the case's flowsheet: switch to Process mode and select it */
  | { kind: "process"; unit: string; label: string }
  | { kind: "none"; label: string };

export interface MapMember {
  /** fine-node id: op:<name>, view:<dom id>, ref:<name>, file:<path>,
   *  record:<name>, inline:<op>:<key>, model:<role>:<token>, package,
   *  out:<op>:<key> */
  id: string;
  label: string;
  /** a second word: the op type, the model's role, the data's role */
  detail: string;
  /** the member's F1 */
  target: MapTarget;
  /** its block in a dict file (ops, views, references; the package) */
  source?: MapTarget;
}

export interface MapBlock {
  id: string;
  kind: BlockKind;
  /** the GROUP this block draws (expand / collapse is keyed on it) */
  group: string;
  /** e.g. "measured data", "transport law", "poreTransport", "views" */
  role: string;
  title: string;
  /** what the block does, in plain words */
  subtitle: string;
  members: MapMember[];
  band: number;
  /** more than one member and drawn as one: it can be expanded */
  expandable: boolean;
  expanded: boolean;
  /** short words: counts, the op's activity, verdicts */
  badges: string[];
  /** the op type's discipline / activity (operation blocks) */
  discipline?: PropsDiscipline;
  activity?: PropsActivity;
  /** layout, filled by layoutMap */
  x: number; y: number; w: number; h: number;
}

export interface MapEdge { id: string; from: string; to: string; flow: FlowKind; count: number }

export interface MapBand {
  index: number;
  /** "" for the one band of a case with no study */
  label: string;
  /** a longer sentence for the frame's tooltip */
  title: string;
  /** the declared study this band draws (case/propsStudies.ts), "" none --
   *  a band is labelled with the case's own question where it declares one,
   *  "Study n" only where it does not */
  study: string;
  framed: boolean;
  x: number; y: number; w: number; h: number;
}

/** One member of the map, beside the block that draws it: what the tree and
 *  the details panel read (the same ids the canvas selects). */
export interface MapNode { id: string; kind: BlockKind; role: string; member: MapMember }

export interface PropsMap {
  /** every member, in the propsDict's order */
  nodes: MapNode[];
  /** member-level wires (from -> to), the ones the blocks aggregate */
  links: { from: string; to: string; flow: FlowKind }[];
  blocks: MapBlock[];
  edges: MapEdge[];
  bands: MapBand[];
  /** fine-member id -> the block that draws it */
  blockOf: Map<string, string>;
  width: number;
  height: number;
}

export interface MapInput {
  propsDict: JsonDict | null | undefined;
  /** a two-mode case's flowsheet: the units that read a record an op writes */
  flowsheet?: JsonDict | null;
  thermo?: JsonDict | null;
  rawFiles?: Record<string, string>;
  post?: PostProcessingBlock | null;
  results?: OperationResult[];
  expanded?: ReadonlySet<string>;
}

/* ---- reading the dicts --------------------------------------------------- */

const isDict = (v: unknown): v is JsonDict =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** The values at a key path: dotted, `[]` walks a list of dicts.  Only
 *  scalars come back, as strings ("" = the op itself, by construction). */
export function valuesAt(d: JsonDict, path: string): string[] {
  if (path === "") return [""];
  let cur: JsonValue[] = [d];
  for (const seg of path.split(".")) {
    const list = seg.endsWith("[]");
    const k = list ? seg.slice(0, -2) : seg;
    const next: JsonValue[] = [];
    for (const c of cur) {
      if (!isDict(c) || !(k in c)) continue;
      const v = c[k]!;
      if (list) { if (Array.isArray(v)) next.push(...v); }
      else next.push(v);
    }
    cur = next;
  }
  const out: string[] = [];
  for (const v of cur) {
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (v !== null && (Array.isArray(v) || isDict(v))) out.push("(inline)");
  }
  return out;
}

/** An op's discipline, after its schema's `disciplineBy` (a fit's residual
 *  kind decides whether it is a thermodynamic or an adsorption fit). */
export function disciplineOf(meta: OpMapMeta, op: JsonDict): PropsDiscipline {
  const by = meta.disciplineBy;
  if (by) {
    const v = valuesAt(op, by.key)[0];
    if (v !== undefined && by.map[v]) return by.map[v]!;
  }
  return meta.discipline;
}

export function activityOf(meta: OpMapMeta, op: JsonDict): PropsActivity {
  const by = meta.activityBy;
  if (by) {
    const v = valuesAt(op, by.key)[0];
    if (v !== undefined) {
      if (by.map?.[v]) return by.map[v]!;
      if (by.present) return by.present;
    }
  }
  return meta.activity;
}

export function readsPackage(meta: OpMapMeta, op: JsonDict): boolean {
  if (!meta.package) return false;
  const u = meta.packageUnless;
  if (u) {
    const v = valuesAt(op, u.key)[0];
    if (v !== undefined && u.in.includes(v)) return false;
  }
  return true;
}

export interface DeclaredOp { name: string; type: string; dict: JsonDict; meta: OpMapMeta | null }

export function declaredOps(propsDict: JsonDict | null | undefined): DeclaredOp[] {
  const ops = propsDict?.["operations"];
  if (!Array.isArray(ops)) return [];
  const out: DeclaredOp[] = [];
  for (const o of ops) {
    if (!isDict(o)) continue;
    const name = typeof o["name"] === "string" ? o["name"] : "";
    const type = typeof o["type"] === "string" ? o["type"] : "";
    if (!name) continue;
    out.push({ name, type, dict: o, meta: operationMapMeta(type) });
  }
  return out;
}

/** Every `op`, `ops` and `reference` a view names, at any depth. */
function viewRefs(v: JsonValue, ops: Set<string>, refs: Set<string>): void {
  if (Array.isArray(v)) { for (const x of v) viewRefs(x, ops, refs); return; }
  if (!isDict(v)) return;
  for (const [k, x] of Object.entries(v)) {
    if (k === "op" && typeof x === "string") ops.add(x);
    else if (k === "ops" && Array.isArray(x)) for (const s of x) { if (typeof s === "string") ops.add(s); }
    else if (k === "reference" && typeof x === "string") refs.add(x);
    else viewRefs(x, ops, refs);
  }
}

/** The DOM id a figure of the review screen carries, so a view block can
 *  scroll to it: one rule, read by both (ui/ReviewScreen.tsx). */
export function viewDomId(origin: "declared" | "default", op: string, name: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  return origin === "declared" ? `view-declared-${safe(name)}` : `view-default-${safe(op)}-${safe(name)}`;
}

/** A path as the case holds it: exact, else with `.dat` (a dataset may be
 *  named without its extension), else null. */
function caseFile(raw: Record<string, string> | undefined, path: string): string | null {
  if (!raw || !path) return null;
  const p = path.replace(/^\.\//, "");
  if (raw[p] !== undefined) return p;
  if (raw[`${p}.dat`] !== undefined) return `${p}.dat`;
  return null;
}

function caseTarget(path: string, lines: BlockLines | undefined, label: string): MapTarget {
  return { kind: "case", path, line: lines?.line, endLine: lines?.endLine, label };
}

/* ---- the fine graph ------------------------------------------------------ */

interface Fine {
  id: string;
  kind: BlockKind;
  /** grouping word: the data role, the model law, the op type, "views" */
  role: string;
  member: MapMember;
  /** the op order of its first consumer / producer, for band assignment */
  order: number;
  /** model law group key, for model nodes */
  law?: string;
  opType?: string;
  /** declared view (joins studies) */
  declaredView?: boolean;
}

interface FineEdge { from: string; to: string; flow: FlowKind }

class UnionFind {
  private p = new Map<string, string>();
  find(a: string): string {
    if (!this.p.has(a)) this.p.set(a, a);
    let r = a;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    this.p.set(a, r);
    return r;
  }
  join(a: string, b: string): void { this.p.set(this.find(a), this.find(b)); }
}

const DATA_ROLE_WORD: Record<string, string> = {
  experiment: "measured data",
  reference: "reference data",
  record: "records",
  inline: "inline data",
  proposal: "records written",
};

function dataFlow(kind: string): FlowKind {
  return kind === "experiment" || kind === "inline" ? "measured"
    : kind === "reference" ? "reference" : kind === "proposal" ? "proposal" : "record";
}

/** The model slots of an op's thermo package: every string under a key that
 *  names a model or the formulation, with its path as the role. */
function packageModels(thermo: JsonDict | null | undefined): { role: string; token: string }[] {
  const out: { role: string; token: string }[] = [];
  const walk = (d: JsonValue, path: string) => {
    if (!isDict(d)) return;
    for (const [k, v] of Object.entries(d)) {
      const p = path ? `${path}.${k}` : k;
      if (typeof v === "string" && (/model$/i.test(k) || k === "formulation"))
        out.push({ role: p.replace(/^equilibrium\./, ""), token: v });
      else walk(v, p);
    }
  };
  walk(thermo ?? null, "");
  return out;
}

function modelTarget(token: string, fallbackOpType: string, role: string, slotKey?: string): MapTarget {
  const url = propsModelTheoryLink(token, { opType: fallbackOpType, key: slotKey });
  if (url) return { kind: "guide", url, label: `theory of ${token}` };
  return {
    kind: "guide", url: propsOpHelpLink(fallbackOpType),
    label: `${role} ${token}: no section of its own -- the ${fallbackOpType} operation's`,
  };
}

export function buildFine(input: MapInput): { nodes: Map<string, Fine>; edges: FineEdge[]; ops: DeclaredOp[] } {
  const nodes = new Map<string, Fine>();
  const edges: FineEdge[] = [];
  const raw = input.rawFiles;
  const where = locatePropsBlocks(raw?.[PROPS_DICT_PATH]);
  const ops = declaredOps(input.propsDict);
  const add = (f: Fine) => { if (!nodes.has(f.id)) nodes.set(f.id, f); return nodes.get(f.id)!; };

  //  references first: a data file an op reads that a reference also names is
  //  one block, the reference's.
  const refByFile = new Map<string, string>();
  const refs = input.propsDict?.["references"];
  if (Array.isArray(refs)) {
    for (const r of refs) {
      if (!isDict(r) || typeof r["name"] !== "string") continue;
      const name = r["name"];
      const file = typeof r["file"] === "string" ? r["file"] : "";
      const role = r["role"] === "experiment" ? "experiment" : "reference";
      const path = caseFile(raw, file);
      const citation = typeof r["citation"] === "string" ? r["citation"] : "";
      const id = `ref:${name}`;
      add({
        id, kind: "data", role, order: Number.MAX_SAFE_INTEGER,
        member: {
          id, label: name, detail: role === "experiment" ? "measured" : "reference",
          target: path ? caseTarget(path, undefined, `open ${path}`)
            : { kind: "none", label: `${file || name}: not in this case's files` },
          source: caseTarget(PROPS_DICT_PATH, where.references.get(name), `${name} in system/propsDict`),
        },
      });
      if (citation) nodes.get(id)!.member.detail += ` -- ${citation.slice(0, 90)}`;
      if (path) refByFile.set(path, id);
    }
  }

  ops.forEach((op, order) => {
    const id = `op:${op.name}`;
    const meta = op.meta;
    const opLines = where.operations.get(op.name);
    add({
      id, kind: "operation", role: op.type, order, opType: op.type,
      member: {
        id, label: op.name, detail: op.type,
        target: { kind: "guide", url: propsOpHelpLink(op.type), label: `the ${op.type} operation` },
        source: caseTarget(PROPS_DICT_PATH, opLines, `${op.name} in system/propsDict`),
      },
    });
    if (!meta) return;

    const dataSlot = (s: OpDataSlot, writes: boolean) => {
      let values = valuesAt(op.dict, s.key);
      if (values.length === 0 && s.default) values = [s.default];
      for (const v of values) {
        if (writes && s.kind === "record") {
          //  A RECORD written into the case (DEV.md 4c C152): one node per
          //  record, and every flowsheet unit that reads it after it.
          const name = recordNameOfPath(v);
          const rid = `record:${name}`;
          const path = caseFile(raw, v);
          add({ id: rid, kind: "view", role: "record", order, member: {
            id: rid, label: name, detail: `${s.label}: ${v}`,
            target: path ? caseTarget(path, undefined, `open ${path}`)
              : { kind: "none", label: `${v}: written by ${op.name} in Properties mode; not in the case yet` } } });
          edges.push({ from: id, to: rid, flow: "proposal" });
          for (const u of unitsReadingRecord(input.flowsheet, name)) {
            const uid = `unit:${u}`;
            const unit = (Array.isArray(input.flowsheet?.["units"]) ? input.flowsheet!["units"] as JsonValue[] : [])
              .find((x) => isDict(x) && x["name"] === u) as JsonDict | undefined;
            add({ id: uid, kind: "unit", role: "process unit", order, member: {
              id: uid, label: u, detail: `${String(unit?.["type"] ?? "unit")} -- reads membrane ${name}`,
              target: { kind: "process", unit: u, label: `${u} in Process mode` } } });
            edges.push({ from: rid, to: uid, flow: "record" });
          }
          continue;
        }
        if (writes) {
          const oid = `out:${op.name}:${s.key}`;
          add({ id: oid, kind: "view", role: "proposal", order, member: {
            id: oid, label: v === "auto" ? `${op.name}: proposal` : `${v}`, detail: s.label,
            target: { kind: "guide", url: propsOpHelpLink(op.type),
              label: `${s.label}: written by ${op.name} on a native run` },
            source: caseTarget(PROPS_DICT_PATH, opLines, `${op.name} in system/propsDict`) } });
          edges.push({ from: id, to: oid, flow: "proposal" });
          continue;
        }
        if (s.kind === "inline" || v === "(inline)") {
          const iid = `inline:${op.name}:${s.key}`;
          add({ id: iid, kind: "data", role: "inline", order, member: {
            id: iid, label: `${op.name}: ${s.label}`, detail: "inline, in system/propsDict",
            target: caseTarget(PROPS_DICT_PATH, opLines, `${op.name} in system/propsDict`) } });
          edges.push({ from: iid, to: id, flow: s.flow ?? "measured" });
          continue;
        }
        if (s.kind === "record") {
          const file = s.file ? s.file.replace("{}", v) : "";
          const path = caseFile(raw, file);
          const rid = v ? `record:${v}` : `record:${file}`;
          add({ id: rid, kind: "data", role: "record", order, member: {
            id: rid, label: v || file, detail: s.label,
            target: path ? caseTarget(path, undefined, `open ${path}`)
              : { kind: "none", label: `${v || file}: a catalogue record, not a file of this case` } } });
          edges.push({ from: rid, to: id, flow: "record" });
          continue;
        }
        //  a file of measurements (or another source's numbers)
        const path = caseFile(raw, v) ?? v;
        const known = refByFile.get(path);
        const fid = known ?? `file:${path}`;
        const f = add({ id: fid, kind: "data", role: s.kind, order, member: {
          id: fid, label: path.split("/").pop() ?? path, detail: s.label,
          target: caseFile(raw, v) ? caseTarget(path, undefined, `open ${path}`)
            : { kind: "none", label: `${v}: not in this case's files` } } });
        f.order = Math.min(f.order, order);
        edges.push({ from: fid, to: id, flow: dataFlow(f.role) });
      }
    };
    for (const s of meta.data ?? []) dataSlot(s, false);
    for (const s of meta.writes ?? []) dataSlot(s, true);

    //  models: the FIRST slot the op declares a value for is its law, the
    //  others the choices inside it -- one block per (op type, law).
    let law = "";
    for (const slot of meta.models ?? []) {
      const tok = slot.fixed ?? valuesAt(op.dict, slot.key ?? "")[0] ?? slot.default;
      if (!tok || tok === "(inline)") continue;
      if (!law) law = tok;
      const mid = `model:${slot.role}:${tok}`;
      const f = add({ id: mid, kind: "model", role: slot.role, order, law: `${op.type}:${law}`,
        member: { id: mid, label: tok, detail: slot.role, target: modelTarget(tok, op.type, slot.role, slot.key) } });
      f.order = Math.min(f.order, order);
      edges.push({ from: mid, to: id, flow: "model" });
    }
    if (readsPackage(meta, op.dict)) {
      const pid = "package";
      const pm = packageModels(input.thermo);
      const f = add({ id: pid, kind: "model", role: "thermo package", order, law: "package",
        member: { id: pid, label: "thermo package",
          detail: pm.map((m) => m.token).join(" · ") || "constant/thermoPhysPropDict",
          target: pm[0] ? modelTarget(pm[0].token, op.type, pm[0].role)
            : { kind: "none", label: "the case declares no thermo package" },
          source: caseTarget(THERMO_DICT_PATH, undefined, "constant/thermoPhysPropDict") } });
      f.order = Math.min(f.order, order);
      edges.push({ from: pid, to: id, flow: "model" });
    }
  });

  //  views: declared (the propsDict's), then each op's defaults (the run's)
  const opNames = new Set(ops.map((o) => o.name));
  const views = input.propsDict?.["views"];
  if (Array.isArray(views)) {
    for (const v of views) {
      if (!isDict(v) || typeof v["name"] !== "string") continue;
      const name = v["name"];
      const dom = viewDomId("declared", "", name);
      const id = `view:${dom}`;
      const title = typeof v["title"] === "string" ? v["title"] : "";
      const vo = new Set<string>(); const vr = new Set<string>();
      viewRefs(v, vo, vr);
      const firstOp = ops.findIndex((o) => vo.has(o.name));
      add({ id, kind: "view", role: "views", order: firstOp < 0 ? Number.MAX_SAFE_INTEGER : firstOp,
        declaredView: true, member: {
          id, label: name, detail: title || String(v["type"] ?? "view"),
          target: { kind: "view", domId: dom, label: `the figure ${name} in Results` },
          source: caseTarget(PROPS_DICT_PATH, where.views.get(name), `${name} in system/propsDict`) } });
      for (const o of vo) if (opNames.has(o)) edges.push({ from: `op:${o}`, to: id, flow: "result" });
      for (const r of vr) {
        const rid = `ref:${r}`;
        const rn = nodes.get(rid);
        if (rn) edges.push({ from: rid, to: id, flow: rn.role === "experiment" ? "measured" : "reference" });
      }
    }
  }
  for (const it of input.post?.items ?? []) {
    if (it.origin !== "default" || !opNames.has(it.op)) continue;
    const dom = viewDomId("default", it.op, it.name);
    const id = `view:${dom}`;
    add({ id, kind: "view", role: "views", order: ops.findIndex((o) => o.name === it.op),
      member: { id, label: `${it.op} · ${it.name}`, detail: `default ${it.kind}: ${it.title}`,
        target: { kind: "view", domId: dom, label: `the figure ${it.name} of ${it.op} in Results` } } });
    edges.push({ from: `op:${it.op}`, to: id, flow: "result" });
  }

  //  reference order: its first consuming view's order
  for (const e of edges) {
    const a = nodes.get(e.from); const b = nodes.get(e.to);
    if (a && b && a.kind === "data") a.order = Math.min(a.order, b.order);
  }
  return { nodes, edges, ops };
}

/* ---- studies, groups, layout -------------------------------------------- */

const COL_W = 236;
const COL_GAP = 64;
const ROW_GAP = 14;
const BAND_GAP = 26;
const BAND_PAD = 14;
const BAND_LABEL = 22;
export const MAX_ROWS = 5;
/** A model block lists its law and EVERY choice inside it: a law with its
 *  choices half-hidden reads as a different law. */
export const maxRows = (kind: BlockKind) => (kind === "model" ? 10 : MAX_ROWS);

const COLUMN: Record<BlockKind, number> = { data: 0, model: 1, operation: 2, view: 3, unit: 4 };

export function blockHeight(b: Pick<MapBlock, "members" | "badges" | "expanded" | "kind">): number {
  const max = maxRows(b.kind);
  const rows = b.members.length > 1 ? Math.min(b.members.length, max) + (b.members.length > max ? 1 : 0) : 0;
  return 58 + rows * 19 + (b.badges.length ? 20 : 0);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function derivePropsMap(input: MapInput): PropsMap {
  const { nodes, edges, ops } = buildFine(input);
  const expanded = input.expanded ?? new Set<string>();

  //  STUDIES: components of op / view / reference / data-file / inline links
  const uf = new UnionFind();
  //  records (read or written), models and process units are SHARED: they
  //  sit with their first consumer and never weld two studies together
  const joins = (n: Fine | undefined) => !!n && n.kind !== "model" && n.kind !== "unit"
    && n.role !== "record";
  for (const e of edges) {
    const a = nodes.get(e.from); const b = nodes.get(e.to);
    if (joins(a) && joins(b)) uf.join(e.from, e.to);
  }
  const studyRoots: string[] = [];
  for (const n of nodes.values())
    if (n.declaredView && !studyRoots.includes(uf.find(n.id))) studyRoots.push(uf.find(n.id));
  //  order the studies by their first op
  const rootOrder = new Map<string, number>();
  for (const n of nodes.values()) {
    if (n.kind !== "operation") continue;
    const r = uf.find(n.id);
    if (studyRoots.includes(r)) rootOrder.set(r, Math.min(rootOrder.get(r) ?? Infinity, n.order));
  }
  studyRoots.sort((a, b) => (rootOrder.get(a) ?? Infinity) - (rootOrder.get(b) ?? Infinity));
  const hasLoose = [...nodes.values()].some((n) => joins(n) && !studyRoots.includes(uf.find(n.id)));
  const nBands = studyRoots.length + (hasLoose || studyRoots.length === 0 ? 1 : 0);
  const bandOfRoot = (r: string) => {
    const i = studyRoots.indexOf(r);
    return i >= 0 ? i : studyRoots.length;
  };
  const opBand = new Map<number, number>();
  for (const n of nodes.values())
    if (n.kind === "operation") opBand.set(n.order, bandOfRoot(uf.find(n.id)));
  const bandOf = (n: Fine): number => joins(n) ? bandOfRoot(uf.find(n.id))
    : opBand.get(n.order) ?? 0;

  //  GROUPS: within a band, one per (kind, role); a model group per law
  interface G { key: string; kind: BlockKind; role: string; band: number; fine: Fine[] }
  const groups = new Map<string, G>();
  for (const n of nodes.values()) {
    const band = bandOf(n);
    const key = n.kind === "model" ? `model:${n.law ?? n.id}`
      : n.kind === "operation" ? `op:${band}:${n.role}`
      : n.kind === "view" ? `view:${band}:${n.role === "proposal" || n.role === "record" ? n.role : "views"}`
      : n.kind === "unit" ? `unit:${band}`
      : `data:${band}:${n.role}`;
    const g = groups.get(key) ?? { key, kind: n.kind, role: n.role, band, fine: [] };
    g.fine.push(n);
    groups.set(key, g);
  }

  const blocks: MapBlock[] = [];
  const blockOf = new Map<string, string>();
  const verdicts = new Map((input.results ?? []).map((r) => [r.name, r.curation?.["verdict"] ?? ""]));
  const metaOf = new Map(ops.map((o) => [o.name, o]));

  for (const g of groups.values()) {
    g.fine.sort((a, b) => a.order - b.order);
    const isExpanded = expanded.has(g.key) && g.fine.length > 1;
    const parts = isExpanded ? g.fine.map((f) => [f]) : [g.fine];
    parts.forEach((fs, pi) => {
      const id = isExpanded ? `${g.key}#${pi}` : g.key;
      const members = fs.map((f) => f.member);
      const first = fs[0]!;
      let title = members.length === 1 ? first.member.label : "";
      let subtitle = "";
      let role = g.role;
      const badges: string[] = [];
      let discipline: PropsDiscipline | undefined;
      let activity: PropsActivity | undefined;
      if (g.kind === "operation") {
        const op = metaOf.get(first.member.label);
        if (members.length > 1) title = `${members.length} × ${g.role}`;
        subtitle = firstSentence(operationDescription(g.role)).slice(0, 110);
        if (op?.meta) {
          discipline = disciplineOf(op.meta, op.dict);
          activity = activityOf(op.meta, op.dict);
          badges.push(activity);
        }
        const tally = new Map<string, number>();
        for (const m of members) {
          const v = verdicts.get(m.label);
          if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
        }
        for (const [v, n] of tally) badges.push(n > 1 ? `${v} ×${n}` : v);
        if (input.results && input.results.length > 0) {
          const ran = members.filter((m) => (input.results ?? []).some((r) => r.name === m.label)).length;
          if (ran < members.length) badges.push(`${members.length - ran} without a result`);
        }
      } else if (g.kind === "model") {
        if (first.law === "package") { title = "thermo package"; role = "thermo package";
          subtitle = first.member.detail; }
        else {
          title = members.length === 1 ? first.member.label : first.member.label;
          role = members.length === 1 ? first.member.detail : `${first.member.detail} and its choices`;
          subtitle = members.length > 1
            ? members.slice(1).map((m) => `${m.detail}: ${m.label}`).join(" · ").slice(0, 120)
            : first.member.detail;
        }
      } else if (g.kind === "view") {
        if (g.role === "record") {
          role = "records written";
          if (members.length > 1) title = plural(members.length, "record");
          subtitle = "written into the case -- the flowsheet reads it";
        } else if (g.role === "proposal") {
          role = "records written";
          if (members.length > 1) title = plural(members.length, "record");
          subtitle = "a proposal for a human to promote, never the catalogue";
        } else {
          role = members.length === 1 ? (first.member.detail.startsWith("default") ? "default view" : "view") : "views";
          if (members.length > 1) {
            const nd = fs.filter((f) => f.declaredView).length;
            title = plural(members.length, "view");
            badges.push(nd === members.length ? "declared" : nd === 0 ? "defaults"
              : `${nd} declared · ${members.length - nd} default`);
          }
          subtitle = first.member.detail.slice(0, 110);
        }
      } else if (g.kind === "unit") {
        role = "process unit";
        if (members.length > 1) title = plural(members.length, "unit");
        subtitle = first.member.detail;
      } else {
        role = DATA_ROLE_WORD[g.role] ?? g.role;
        if (members.length > 1) title = plural(members.length, g.role === "inline" ? "inline set" : g.role === "record" ? "record" : "dataset");
        subtitle = members.length === 1 ? first.member.detail.slice(0, 110)
          : members.map((m) => m.label).join(", ").slice(0, 110);
      }
      const b: MapBlock = {
        id, kind: g.kind, group: g.key, role, title, subtitle, members, band: g.band,
        expandable: g.fine.length > 1, expanded: isExpanded, badges,
        discipline, activity, x: 0, y: 0, w: COL_W, h: 0,
      };
      b.h = blockHeight(b);
      blocks.push(b);
      for (const m of members) blockOf.set(m.id, id);
    });
  }

  //  EDGES between blocks, each (from, to, flow) once with its count
  const agg = new Map<string, MapEdge>();
  for (const e of edges) {
    const a = blockOf.get(e.from); const b = blockOf.get(e.to);
    if (!a || !b || a === b) continue;
    const key = `${a}->${b}:${e.flow}`;
    const x = agg.get(key) ?? { id: key, from: a, to: b, flow: e.flow, count: 0 };
    x.count += 1;
    agg.set(key, x);
  }

  //  LAYOUT: four columns, one band per study, top to bottom
  const studies = declaredStudies(input.propsDict);
  const ordOf = (b: MapBlock) => Math.min(...b.members.map((m) => nodes.get(m.id)?.order ?? Infinity));
  const bands: MapBand[] = [];
  let y = 0;
  const framed = studyRoots.length > 1 || (studyRoots.length === 1 && hasLoose);
  const nCols = blocks.some((b) => b.kind === "unit") ? 5 : 4;
  for (let bi = 0; bi < nBands; ++bi) {
    const inBand = blocks.filter((b) => b.band === bi);
    if (inBand.length === 0) continue;
    const top = y + (framed ? BAND_PAD + BAND_LABEL : 0);
    let bottom = top;
    for (const kind of ["data", "model", "operation", "view", "unit"] as BlockKind[]) {
      const col = inBand.filter((b) => b.kind === kind).sort((a, b) => ordOf(a) - ordOf(b));
      let cy = top;
      for (const b of col) {
        b.x = (framed ? BAND_PAD : 0) + COLUMN[kind] * (COL_W + COL_GAP);
        b.y = cy;
        cy += b.h + ROW_GAP;
      }
      bottom = Math.max(bottom, cy - ROW_GAP);
    }
    const isStudy = bi < studyRoots.length;
    const opsIn = inBand.filter((b) => b.kind === "operation").flatMap((b) => b.members);
    const viewsIn = inBand.filter((b) => b.kind === "view" && b.role !== "records written").flatMap((b) => b.members);
    const types = [...new Set(opsIn.map((m) => m.detail))];
    const counts = `${plural(opsIn.length, types.length === 1 ? `${types[0]} op` : "op")} → ${plural(viewsIn.length, "view")}`;
    //  the DECLARED study whose operations are exactly this band's: its
    //  title is the frame's label (the case's own words for the question)
    const opNamesIn = new Set(opsIn.map((m) => m.label));
    const declared = studies.find((st) => st.ops.length === opNamesIn.size
      && st.ops.every((o) => opNamesIn.has(o)));
    const label = !framed ? ""
      : declared ? `${declared.title} · ${counts}`
      : isStudy ? `Study ${bi + 1} · ${counts}`
      : `Operations no declared view reads · ${plural(opsIn.length, "op")}`;
    const title = declared
      ? `${purposeWords(declared.purpose).label}${declared.summary ? ` -- ${declared.summary}` : ""}`
      : isStudy
      ? `Ops, views and data that refer to each other in system/propsDict: ${viewsIn.map((m) => m.label).slice(0, 8).join(", ")}${viewsIn.length > 8 ? ", ..." : ""}`
      : "Operations that no view of the propsDict draws from";
    const w = (framed ? 2 * BAND_PAD : 0) + nCols * COL_W + (nCols - 1) * COL_GAP;
    const h = bottom - y + (framed ? BAND_PAD : 0);
    bands.push({ index: bi, label, title, study: declared?.name ?? "", framed, x: 0, y, w, h });
    y += h + BAND_GAP;
  }
  const width = (framed ? 2 * BAND_PAD : 0) + nCols * COL_W + (nCols - 1) * COL_GAP;
  const order = [...nodes.values()].sort((p, q) => p.order - q.order);
  return {
    nodes: order.map((n) => ({ id: n.id, kind: n.kind, role: n.role, member: n.member })),
    links: edges.map((e) => ({ ...e })),
    blocks, edges: [...agg.values()], bands, blockOf, width, height: Math.max(0, y - BAND_GAP),
  };
}

/* ---- the tree by discipline ---------------------------------------------- */

export interface TreeOp { name: string; type: string; activity: PropsActivity | ""; id: string }
export interface TreeType { type: string; activity: PropsActivity | ""; ops: TreeOp[] }
export interface TreeDiscipline { discipline: PropsDiscipline | "Undeclared"; types: TreeType[] }

/** The case's ops under the shelf each op type declares, in the shelves'
 *  declared order; an op whose type declares none is under "Undeclared",
 *  visibly rather than dropped. */
export function propsTree(propsDict: JsonDict | null | undefined,
                          order: readonly string[]): TreeDiscipline[] {
  const by = new Map<string, Map<string, TreeType>>();
  for (const op of declaredOps(propsDict)) {
    const disc = op.meta ? disciplineOf(op.meta, op.dict) : "Undeclared";
    const act = op.meta ? activityOf(op.meta, op.dict) : "";
    const types = by.get(disc) ?? new Map<string, TreeType>();
    const t = types.get(op.type) ?? { type: op.type, activity: act, ops: [] };
    if (t.activity !== act) t.activity = "";
    t.ops.push({ name: op.name, type: op.type, activity: act, id: `op:${op.name}` });
    types.set(op.type, t);
    by.set(disc, types);
  }
  const out: TreeDiscipline[] = [];
  for (const d of [...order, "Undeclared"]) {
    const types = by.get(d);
    if (types) out.push({ discipline: d as TreeDiscipline["discipline"], types: [...types.values()] });
  }
  return out;
}

/* ---- neighbourhoods (the details panel and the tree) --------------------- */

/** The members wired to `id`, upstream and downstream. */
export function neighbours(map: PropsMap, id: string): { up: string[]; down: string[] } {
  const up: string[] = []; const down: string[] = [];
  for (const l of map.links) {
    if (l.to === id && !up.includes(l.from)) up.push(l.from);
    if (l.from === id && !down.includes(l.to)) down.push(l.to);
  }
  return { up, down };
}

/** The VIEWS a selection leads to: a view itself; an op's views; for data or
 *  a model, the views of the ops it feeds and the views it feeds directly. */
export function viewsOf(map: PropsMap, ids: readonly string[]): string[] {
  const out: string[] = [];
  const push = (v: string) => { if (v.startsWith("view:") && !out.includes(v)) out.push(v); };
  for (const id of ids) {
    if (id.startsWith("view:")) { push(id); continue; }
    for (const d of neighbours(map, id).down) {
      push(d);
      if (d.startsWith("op:")) for (const v of neighbours(map, d).down) push(v);
    }
  }
  return out;
}

/** The view's DOM id, from its member id. */
export const domIdOfView = (id: string) => id.replace(/^view:/, "");

/* ---- the case tree: the pipeline browser (DEV.md 4c C151) ----------------

   ONE tree of the case, ParaView's pipeline browser read for a props case:
   Data, Models, Operations by discipline (each op with its views as
   children), the records the run proposes, and the reader's own plots.  Its
   ids are the map's member ids, so selecting in either selects in both. */

export interface CaseTreeNode {
  id: string;
  label: string;
  /** a dimmed second word */
  detail?: string;
  /** the op's activity, a verdict ... */
  tag?: string;
  children: CaseTreeNode[];
  /** a section or a folder only groups: selecting it shows the overview */
  folder?: boolean;
}

export interface MyPlot { id: string; file: string; title: string }

export function caseTree(map: PropsMap, propsDict: JsonDict | null | undefined,
                         disciplines: readonly string[], myPlots: readonly MyPlot[] = [],
                         verdicts?: ReadonlyMap<string, string>): CaseTreeNode[] {
  const leaf = (n: MapNode, tag?: string): CaseTreeNode =>
    ({ id: n.id, label: n.member.label, detail: n.member.detail, tag, children: [] });
  const byKind = (k: BlockKind) => map.nodes.filter((n) => n.kind === k);
  const out: CaseTreeNode[] = [];

  const data = byKind("data");
  if (data.length) {
    const roles: [string, string][] = [["experiment", "measured"], ["reference", "reference"],
      ["record", "records"], ["inline", "inline"]];
    const kids: CaseTreeNode[] = [];
    for (const [r, word] of roles) {
      const ns = data.filter((n) => n.role === r);
      if (ns.length === 0) continue;
      kids.push({ id: `folder:data:${r}`, label: word, folder: true, children: ns.map((n) => leaf(n)) });
    }
    out.push({ id: "folder:data", label: "Data", folder: true, children: kids });
  }

  const models = byKind("model");
  if (models.length) out.push({ id: "folder:models", label: "Models", folder: true,
    children: models.map((n) => leaf(n)) });

  //  Operations by discipline; each op's views as its children
  const ops = declaredOps(propsDict);
  const viewKids = (opId: string): CaseTreeNode[] => neighbours(map, opId).down
    .map((v) => map.nodes.find((n) => n.id === v))
    .filter((n): n is MapNode => !!n && n.kind === "view" && n.role !== "proposal" && n.role !== "record")
    .map((n) => leaf(n));
  const shelves: CaseTreeNode[] = [];
  for (const d of [...disciplines, "Undeclared"]) {
    const inShelf = ops.filter((o) => (o.meta ? disciplineOf(o.meta, o.dict) : "Undeclared") === d);
    if (inShelf.length === 0) continue;
    const types: CaseTreeNode[] = [];
    for (const t of [...new Set(inShelf.map((o) => o.type))]) {
      const ofType = inShelf.filter((o) => o.type === t);
      const opNodes = ofType.map((o) => ({
        id: `op:${o.name}`, label: o.name,
        detail: o.type,
        tag: [o.meta ? activityOf(o.meta, o.dict) : "", verdicts?.get(o.name) ?? ""].filter(Boolean).join(" · "),
        children: viewKids(`op:${o.name}`),
      }));
      if (ofType.length === 1) types.push(opNodes[0]!);
      else {
        const acts = [...new Set(ofType.map((o) => (o.meta ? activityOf(o.meta, o.dict) : "")))];
        types.push({ id: `folder:type:${d}:${t}`, label: `${t} × ${ofType.length}`, folder: true,
          tag: acts.length === 1 ? acts[0] : undefined, children: opNodes });
      }
    }
    shelves.push({ id: `folder:discipline:${d}`, label: d, folder: true, children: types });
  }
  if (shelves.length) out.push({ id: "folder:ops", label: "Operations", folder: true, children: shelves });

  //  views no operation feeds (drawn from references alone)
  const orphan = byKind("view").filter((n) => n.role !== "proposal" && n.role !== "record"
    && !map.links.some((l) => l.to === n.id && l.from.startsWith("op:")));
  if (orphan.length) out.push({ id: "folder:views", label: "Views across the case", folder: true,
    children: orphan.map((n) => leaf(n)) });

  const written = byKind("view").filter((n) => n.role === "proposal" || n.role === "record");
  if (written.length) out.push({ id: "folder:records", label: "Records produced", folder: true,
    children: written.map((n) => leaf(n)) });

  const units = byKind("unit");
  if (units.length) out.push({ id: "folder:units", label: "Process units", folder: true,
    children: units.map((n) => leaf(n)) });

  out.push({ id: "folder:myplots", label: "My plots", folder: true,
    children: myPlots.map((p) => ({ id: `myplot:${p.id}`, label: p.title, detail: p.file, children: [] })) });
  return out;
}
