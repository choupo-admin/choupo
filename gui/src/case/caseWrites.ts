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
  are READ OFF THE ENGINE'S FILE-TRAFFIC TABLE (the write slots of kind
  `record`, at the keys they name -- case/fileTraffic.ts, generated from
  `choupoProps --file-traffic`; DEV.md 4c C172 slice 3), never a list of op
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
import { declaredOps } from "./propsMap.js";
import { recordWriteSlots, valuesAt } from "./fileTraffic.js";

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
    for (const s of recordWriteSlots(op.type)) {
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

/** WHICH CHANGES ARE THE READER'S, AND WHICH ARE THE RUN'S (DEV.md 4c C172
 *  item 6).  A file an operation declares it writes into the case (above)
 *  changes when the RUN writes it, never by an edit in this app -- so the top
 *  bar must not call it "edited": that word asks the reader to save or
 *  discard work they did not do.  Those paths are set aside here; what
 *  differs from the case as loaded among the rest is the reader's own edit,
 *  and the declared paths that differ are "updated by run". */
export function editsBesideRunWrites(files: CaseFiles, pristine: CaseFiles): {
  userEdited: boolean; runUpdated: string[];
} {
  const paths = declaredCaseWrites(files.propsDict).map((w) => w.path);
  const strip = (f: CaseFiles): CaseFiles => {
    if (paths.length === 0) return f;
    const raw = { ...(f.rawFiles ?? {}) };
    const extra = { ...(f.extraFiles ?? {}) };
    for (const p of paths) { delete raw[p]; delete extra[p]; }
    return { ...f, rawFiles: raw, extraFiles: extra };
  };
  const now = (f: CaseFiles, p: string) => f.extraFiles?.[p] ?? f.rawFiles?.[p];
  const runUpdated = paths.filter((p) => now(files, p) !== now(pristine, p));
  return {
    userEdited: JSON.stringify(strip(files)) !== JSON.stringify(strip(pristine)),
    runUpdated,
  };
}

/** Every file a propsDict's ops declare as a PROPOSAL (the engine's table,
 *  case/fileTraffic.ts,
 *  kind `proposal`) at a path inside the case: a promotable record a fit
 *  writes for a HUMAN to promote (DEV.md 4c C172 item 6).  It is not a case
 *  write -- it is never carried into the run copy -- but the worker reads it
 *  back like one, so the screen can show it and the downloaded case carries
 *  it. */
export function declaredProposals(propsDict: JsonDict | null | undefined): CaseWrite[] {
  const out: CaseWrite[] = [];
  const seen = new Set<string>();
  for (const op of declaredOps(propsDict)) {
    for (const s of recordWriteSlots(op.type)) {
      if (s.kind === "record") continue;
      for (const v of valuesAt(op.dict, s.key)) {
        if (!isCasePath(v) || seen.has(v) || !/\.dat$/.test(v)) continue;
        seen.add(v);
        out.push({ op: op.name, key: s.key, path: v });
      }
    }
  }
  return out;
}

/** The run's read-back files split by what they are: a PROPOSAL a fit
 *  declares at a case path rides the case-writes channel (the worker reads
 *  back every path it is handed) but is NOT a case write -- it joins the
 *  run's proposals, shown on screen and carried by the downloaded case, and
 *  is never handed to the next run (DEV.md 4c C172 item 6). */
export function splitRunProposals(
  proposals: { [p: string]: string } | null, caseWrites: { [p: string]: string } | null,
  propsDict: JsonDict | null | undefined,
): { proposals: { [p: string]: string } | null; caseWrites: { [p: string]: string } | null } {
  if (!caseWrites) return { proposals, caseWrites };
  const paths = new Set(declaredProposals(propsDict).map((w) => w.path));
  const writes = { ...caseWrites };
  let props = proposals;
  for (const p of Object.keys(writes)) {
    if (!paths.has(p)) continue;
    props = { ...(props ?? {}), [p]: writes[p]! };
    delete writes[p];
  }
  return { proposals: props, caseWrites: writes };
}
