/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  caseWrites -- A FILE A RUN WRITES INTO THE CASE IS CARRIED BACK INTO IT
  (DEV.md 4c C152, C157).

  On a native run the case folder IS the disk: a props op that declares
  `output { record "constant/assets/<name>.dat"; }` writes the record there,
  and the next `runCase <case> process` reads it.  In the browser the case
  lives in memory and is copied into the WASM MEMFS for each run, so a file
  the engine writes into the case's own tree stayed in MEMFS and died with
  the worker -- Process mode then refused the old record as stale, and the
  next download still carried it.

  The rule, the same for every op: the paths a run will write into the case
  are READ OFF THE OP SCHEMAS (`x-choupo.writes`, the slots of kind `record`,
  at the keys they name -- case/operationSchemas.ts), never a list of op
  types; the worker reads exactly those paths back after the run; and they
  are written into the open case's files (the run copy, `extraFiles`, and
  the viewer/download copy, `rawFiles`), each one ANNOUNCED in the Log.  A
  proposal (`kind proposal`) is not a case write: it is a draft for
  data/local/ that the GUI offers as a download, and stays so.

  Only a path INSIDE the case is carried: relative, no `.`/`..` segment, no
  leading `/`.  WHERE inside is the engine's decision (a fitted membrane
  record outside constant/assets/ is refused there,
  src/propertyOps/FitParametersMembrane.cpp).
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";
import type { CaseFiles } from "./types.js";
import { declaredOps, valuesAt } from "./propsMap.js";

export interface CaseWrite { op: string; key: string; path: string }

/** A case-relative path the GUI may carry: inside the case, no escape. */
export function isCasePath(p: string): boolean {
  if (!p || p.startsWith("/") || p.includes("\\")) return false;
  return p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** Every file a propsDict's ops declare they write INTO THE CASE. */
export function declaredCaseWrites(propsDict: JsonDict | null | undefined): CaseWrite[] {
  const out: CaseWrite[] = [];
  const seen = new Set<string>();
  for (const op of declaredOps(propsDict)) {
    for (const s of op.meta?.writes ?? []) {
      if (s.kind !== "record") continue;
      for (const v of valuesAt(op.dict, s.key)) {
        if (!isCasePath(v) || seen.has(v)) continue;
        seen.add(v);
        out.push({ op: op.name, key: s.key, path: v });
      }
    }
  }
  return out;
}

export type CaseWriteChange = "new" | "updated" | "unchanged";
export interface CaseWriteNote extends CaseWrite { change: CaseWriteChange }

/** The case with the run's written files carried into it, and one note per
 *  declared write the run produced.  A declared path the run did not write
 *  (the op refused, or never reached its record) yields no note and leaves
 *  the case's copy as it was. */
export function carryCaseWrites(files: CaseFiles, declared: readonly CaseWrite[],
  written: { [path: string]: string } | undefined,
): { files: CaseFiles; notes: CaseWriteNote[] } {
  const notes: CaseWriteNote[] = [];
  if (!written) return { files, notes };
  const extra = { ...(files.extraFiles ?? {}) };
  const raw = { ...(files.rawFiles ?? {}) };
  let changed = false;
  for (const w of declared) {
    const body = written[w.path];
    if (body === undefined) continue;
    const before = extra[w.path] ?? raw[w.path];
    const change: CaseWriteChange =
      before === undefined ? "new" : before === body ? "unchanged" : "updated";
    notes.push({ ...w, change });
    if (change === "unchanged") continue;
    extra[w.path] = body;
    raw[w.path] = body;
    changed = true;
  }
  return { files: changed ? { ...files, extraFiles: extra, rawFiles: raw } : files, notes };
}

/** The Log's sentence for each carried file. */
export function caseWriteLogLines(notes: readonly CaseWriteNote[]): string[] {
  return notes.map((n) => n.change === "unchanged"
    ? `[case] ${n.path}: written by operation '${n.op}' (${n.key}), identical to the case's copy -- nothing changed`
    : `[case] ${n.path}: written by operation '${n.op}' (${n.key}) -- ${n.change === "new" ? "ADDED to" : "UPDATED in"}`
      + " the open case (the next run and the next download carry it)");
}
