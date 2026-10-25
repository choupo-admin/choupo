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
  caseModes -- ONE CASE, TWO MODES, AS THE GUI READS THEM (DEV.md 4c C151,
  C152).

  A case that carries BOTH system/flowsheetDict and system/propsDict runs in
  either: Process (the flowsheet, choupoSolve or the time-integrated binary)
  or Properties & data (the props bench, choupoProps).  The rule is the one
  bin/curate/case_manifest.py writes into generated/caseManifest.json
  (`modes`, `defaultMode`): both dicts present -> both modes, the default
  being Properties & data only where `controlDict.application` is
  choupoProps.  The GUI reads it off the case files it has already loaded,
  the same fact by the same rule, rather than a second copy of the manifest.

  The bridge between the two: a `fitParameters` op that writes a RECORD
  (`output { record "constant/assets/<name>.dat"; }`) and a flowsheet unit
  whose `operation.membrane` names that record.  The record itself says which
  operation wrote it (its `fit { operation ...; }` block), so the unit can
  point back at its fit before any run.
\*---------------------------------------------------------------------------*/

import { parse, toJson, type JsonDict, type JsonValue } from "../dict/index.js";

export type CaseMode = "process" | "props";

export const MODE_LABEL: Record<CaseMode, string> = {
  process: "Process",
  props: "Properties & data",
};

export interface CaseModes { modes: CaseMode[]; defaultMode: CaseMode }

/** The modes a case offers, or null when it offers one (no switch). */
export function caseModesOf(files: {
  propsDict?: JsonDict | null; flowsheet?: JsonDict | null; controlDict?: JsonDict | null;
}): CaseModes | null {
  if (!files.propsDict || !files.flowsheet) return null;
  const app = files.controlDict?.["application"];
  return { modes: ["process", "props"], defaultMode: app === "choupoProps" ? "props" : "process" };
}

const isDict = (v: unknown): v is JsonDict => !!v && typeof v === "object" && !Array.isArray(v);

/** A record's name from the path an op writes it to. */
export function recordNameOfPath(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.dat$/, "");
}

export interface WrittenRecord { op: string; path: string; name: string }

/** Every record a props op declares it writes (`output.record`). */
export function writtenRecords(propsDict: JsonDict | null | undefined): WrittenRecord[] {
  const ops = propsDict?.["operations"];
  if (!Array.isArray(ops)) return [];
  const out: WrittenRecord[] = [];
  for (const o of ops) {
    if (!isDict(o) || typeof o["name"] !== "string") continue;
    const outp = o["output"];
    const path = isDict(outp) && typeof outp["record"] === "string" ? outp["record"] : "";
    if (path) out.push({ op: o["name"], path, name: recordNameOfPath(path) });
  }
  return out;
}

/** The flowsheet units whose `operation.membrane` names `record`. */
export function unitsReadingRecord(flowsheet: JsonDict | null | undefined, record: string): string[] {
  const units = flowsheet?.["units"];
  if (!Array.isArray(units)) return [];
  const out: string[] = [];
  for (const u of units as JsonValue[]) {
    if (!isDict(u) || typeof u["name"] !== "string") continue;
    const op = u["operation"];
    if (isDict(op) && op["membrane"] === record) out.push(u["name"]);
  }
  return out;
}

export interface RecordFit { record: string; path: string; operation: string; fittedInCase: string; verdict: string }

/** The `fit {}` block of a record the case carries, or null: who wrote it. */
export function recordFit(rawFiles: Record<string, string> | undefined, record: string): RecordFit | null {
  const path = `constant/assets/${record}.dat`;
  const text = rawFiles?.[path];
  if (!text) return null;
  let d: JsonDict;
  try { d = toJson(parse(text)); } catch { return null; }
  const fit = d["fit"];
  if (!isDict(fit) || typeof fit["operation"] !== "string") return null;
  const s = (k: string) => (typeof fit[k] === "string" ? fit[k] as string : "");
  return { record, path, operation: fit["operation"], fittedInCase: s("fittedInCase"), verdict: s("verdict") };
}

/** A Process-mode run refused a fitted record that no longer matches what
 *  fitted it (src/thermo/membrane/FittedRecord.cpp): its remedy is the other
 *  mode.  Read off the run's log, where the refusal is written. */
export function staleFitRefusal(log: string | undefined): string | null {
  if (!log) return null;
  const m = /([^\n]*(?:is a STALE FIT|is NOT THE FIT ITS fit \{\} BLOCK DESCRIBES|was fitted by operation)[^\n]*)/.exec(log);
  return m ? m[1]!.trim() : null;
}
