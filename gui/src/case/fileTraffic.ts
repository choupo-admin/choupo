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
  fileTraffic -- WHAT A PROPERTIES OPERATION READS AND WRITES, AS THE ENGINE
  SAYS (DEV.md 4c C172 slice 3).

  The ONE home is the engine's file-traffic table (src/propertyOps/
  PropsPlan.cpp), which choupoProps publishes (`--file-traffic`) and which
  orders the workflow: an operation may not read what a LATER one writes.
  The GUI reads it from gui/schemas/propsFileTraffic.json, GENERATED from the
  engine (bin/curate/gen_props_file_traffic.py; a stale file fails
  bin/curate/check_props_order.py arm (c)).  The hand-written copy each op
  schema used to carry (`x-choupo.writes`) is gone.

  Three readers: the Workflow's inspector (what a step reads and writes,
  resolved on the step's own dict, before any run), the calculation map (the
  records an op writes), and the worker's read-back of the records a run
  writes INTO the case (case/caseWrites.ts).  Pure (no React).
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import { parse } from "../dict/parser.js";
import { toJson } from "../dict/json.js";
import table from "../../schemas/propsFileTraffic.json";

/** What a key's value IS (the engine's `propsPlan::Traffic`). */
export type TrafficKind = "file" | "record" | "proposal" | "membraneName";

export interface TrafficSlot {
  key: string;
  kind: TrafficKind;
  /** the value the engine takes when the key is absent, "" none */
  default: string;
}

interface TrafficRow { reads: TrafficSlot[]; writes: TrafficSlot[] }

const TYPES = (table as { types: Record<string, TrafficRow> }).types;

/** The engine's row for an op type, or null when the table carries none (a
 *  case's own code/ op: the engine announces it as unchecked). */
export function trafficOf(opType: string): TrafficRow | null {
  return TYPES[opType] ?? null;
}

/** Every op type the engine's table carries. */
export function trafficTypes(): string[] {
  return Object.keys(TYPES).sort();
}

const isDict = (v: unknown): v is JsonDict =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** The values at a key path: dotted, `[]` walks a list of dicts (the
 *  engine's key-path grammar, PropsPlan.H).  Only scalars come back, as
 *  strings ("" = the op itself, by construction; "(inline)" = a block). */
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

/** The words a write slot is labelled with: the engine names the KIND, and
 *  the label says what that kind is for a reader. */
export const WRITE_KIND_LABEL: Record<TrafficKind, string> = {
  record: "record written into the case",
  proposal: "proposal, a draft for data/local/",
  file: "file written",
  membraneName: "membrane record",
};

/** The slots through which an op writes a RECORD into the case or a
 *  PROPOSAL (the map's write nodes; the worker's read-back reads the
 *  records).  A plain output file is not here: it is the op's table. */
export function recordWriteSlots(opType: string): TrafficSlot[] {
  return (trafficOf(opType)?.writes ?? []).filter((s) => s.kind === "record" || s.kind === "proposal");
}

/** One resolved line of a step's traffic. */
export interface StepFile {
  dir: "read" | "write";
  key: string;
  kind: TrafficKind;
  /** the path (or a membrane record's name) as the op's dict resolves it */
  value: string;
  /** the key was absent and the engine's default was taken */
  defaulted: boolean;
  /** a read the step DECLARES the process run writes (`writtenBy { <key>
   *  process; }`): "run the Flowsheet first" */
  byProcess: boolean;
}

/** What one op reads and writes, resolved on its own dict through the
 *  engine's row: one line per value (a `[]` key yields several), the
 *  engine's default where the key is absent, nothing where the key is
 *  absent and the engine takes no default.  Inline blocks are not files. */
export function opFiles(op: JsonDict, opType: string): StepFile[] {
  const row = trafficOf(opType);
  if (!row) return [];
  const wb = isDict(op["writtenBy"]) ? op["writtenBy"] as JsonDict : {};
  const out: StepFile[] = [];
  for (const [dir, list] of [["read", row.reads], ["write", row.writes]] as const) {
    for (const s of list) {
      let values = s.key === "" ? [] : valuesAt(op, s.key).filter((v) => v !== "(inline)" && v !== "");
      let defaulted = false;
      if (values.length === 0 && s.default) { values = [s.default]; defaulted = true; }
      for (const value of values)
        out.push({ dir, key: s.key, kind: s.kind, value, defaulted,
          byProcess: dir === "read" && wb[s.key] === "process" });
    }
  }
  return out;
}

/** THE FINGERPRINTS A WRITTEN RECORD STATES ABOUT ITSELF, read off its text
 *  with the dict parser: every scalar under a key named `fingerprint` or
 *  ending in `Sha256`, with its path (a fitted membrane record's
 *  `fit.recordSha256`, a promotable pair's `provenance.evidence.fingerprint`).
 *  Nothing is computed: a record that states none yields none, and a text the
 *  parser refuses yields none. */
export function writtenFingerprints(text: string | undefined): { key: string; value: string }[] {
  if (!text) return [];
  let root: JsonDict;
  try { root = toJson(parse(text)); } catch { return []; }
  const out: { key: string; value: string }[] = [];
  const walk = (v: JsonValue, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (!isDict(v)) return;
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if ((k === "fingerprint" || /Sha256$/.test(k)) && (typeof x === "string" || typeof x === "number"))
        out.push({ key: p, value: String(x) });
      else walk(x, p);
    }
  };
  walk(root, "");
  return out;
}
