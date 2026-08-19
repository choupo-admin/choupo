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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
  methodRun -- the STANDALONE feed of the Methods workspace: a method tool
  must never depend on the user having a flowsheet open (these are classroom
  constructions), so each tool runs the ENGINE itself, in the browser, on a
  PARAMETERIZED WITNESS -- the tool's own sealed tutorial case, cloned from
  the bundled corpus with the tool's knobs written into its dicts, then
  solved by the WASM binary.  Zero physics in TypeScript survives intact:
  the tool edits declared dict scalars and the engine computes everything.

  ONE home for the mechanics (arity): the witness lookup, the scalar
  override, and the run hook live HERE; each tool declares only its witness
  name and its knob->dict-path map.

  The override is textual and deliberately so: the witness dicts are part of
  the pedagogy (comments included), and a parse->serialize round trip would
  strip them.  `applyScalarOverrides` replaces the NUMBER of a declared
  `key value [unit];` scalar, keeping the unit word and the comment tail.
  It THROWS when a key is absent or matches more than once in the file --
  a silent no-op override would run the engine on the wrong question.

  THREE OVERRIDE KINDS, ONE RULE (the word and the rename arrived 2026-08-19
  with the Thiele pellet tool).  A knob that changes a pellet's SHAPE cannot be
  a number: the catalyst record declares `geometry sphere;`, and the engine
  REFUSES a record whose characteristic dimension is named by the wrong key --
  `radius` for a sphere or a cylinder, `halfThickness` for a slab, and
  declaring the other one refuses rather than being reinterpreted.  So the
  shape knob is a WORD override plus a KEY RENAME, and both obey the same rule
  the scalar always has: exactly one match, or throw.  Nothing here invents a
  value -- the rename carries the record's own authored number and its unit
  across, and the word is one of the three the engine accepts.

  What is deliberately NOT here: a way to add, delete or re-nest a dict block.
  A knob that needs one is a knob the witness case should declare, not one this
  module should synthesize -- dict-on-disk is the authoring channel (credo
  Q2), and a GUI that assembles blocks has become an editor.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";

import { resolveAdapter } from "../adapters/index.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import type { CaseFiles } from "./types.js";
import { filesToCaseFiles, tutorialByName } from "../cases/tutorials.js";

/** One knob: replace the numeric value of `key ...;` in `file`.
 *  `key` is the dict key as written (e.g. "merkelNumber", "T", "water");
 *  `occurrence` (1-based) selects among several matches when the SAME key
 *  legitimately appears more than once in the file -- omitted means the key
 *  must be unique there. */
export interface ScalarOverride {
  file: string;
  key: string;
  value: number;
  occurrence?: number;
}

/** One knob: replace the WORD of `key <word>;` in `file`.  Used where the
 *  quantity a knob turns is not a number at all -- a pellet's `geometry`, a
 *  model name.  Same uniqueness rule as the scalar. */
export interface WordOverride {
  file: string;
  key: string;
  word: string;
  occurrence?: number;
}

/** Rename a declared key IN PLACE, keeping its value, its unit and its comment
 *  tail untouched: `radius 1.5 mm;  // 3 mm pellet` -> `halfThickness 1.5 mm;
 *  // 3 mm pellet`.  It moves no number and invents none; it exists because
 *  some engine records name one quantity differently depending on a word
 *  declared beside it, and refuse the other spelling rather than reinterpret
 *  it. */
export interface KeyRename {
  file: string;
  from: string;
  to: string;
  occurrence?: number;
}

export type DictOverride = ScalarOverride | WordOverride | KeyRename;

const isScalar = (o: DictOverride): o is ScalarOverride => "value" in o;
const isWord = (o: DictOverride): o is WordOverride => "word" in o;

/** ONE home for "find the declared occurrences of this pattern, or refuse".
 *  Every override kind goes through it, so they cannot disagree about what
 *  "the key is not there" or "the key is there twice" means. */
function locate(
  text: string, re: RegExp, what: string, file: string, occurrence?: number,
): RegExpMatchArray {
  const matches = [...text.matchAll(re)];
  if (matches.length === 0)
    throw new Error(`override: ${what} not found in ${file}`);
  if (matches.length > 1 && occurrence === undefined)
    throw new Error(`override: ${what} matches ${matches.length} times`
      + ` in ${file} -- pass 'occurrence' to pick one`);
  const m = matches[(occurrence ?? 1) - 1];
  if (!m || m.index === undefined)
    throw new Error(`override: occurrence ${occurrence} of ${what}`
      + ` not found in ${file} (${matches.length} present)`);
  return m;
}

const escapeKey = (k: string): string => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace the number of `key <number> [unit];` keeping unit + trailing
 *  comment.  Throws on zero matches, and on multiple matches unless
 *  `occurrence` picks one -- a knob that silently misses its dict runs the
 *  engine on the wrong question. */
export function applyScalarOverride(text: string, o: ScalarOverride): string {
  const re = new RegExp(
    "(^[ \\t]*" + escapeKey(o.key)
    + "[ \\t]+)([-+0-9.eE]+)([ \\t]*[A-Za-z/%0-9.^-]*[ \\t]*;)", "gm");
  const m = locate(text, re, `key '${o.key}'`, o.file, o.occurrence);
  return text.slice(0, m.index) + m[1] + String(o.value) + m[3]
       + text.slice(m.index! + m[0].length);
}

/** Replace the WORD of `key <word>;`, keeping the indentation and the comment
 *  tail.  Same refusals as the scalar. */
export function applyWordOverride(text: string, o: WordOverride): string {
  const re = new RegExp(
    "(^[ \\t]*" + escapeKey(o.key)
    + "[ \\t]+)([A-Za-z][A-Za-z0-9_.-]*)([ \\t]*;)", "gm");
  const m = locate(text, re, `word key '${o.key}'`, o.file, o.occurrence);
  return text.slice(0, m.index) + m[1] + o.word + m[3]
       + text.slice(m.index! + m[0].length);
}

/** Rename a declared key, leaving everything to the right of it alone. */
export function applyKeyRename(text: string, o: KeyRename): string {
  const re = new RegExp("(^[ \\t]*)" + escapeKey(o.from) + "(?=[ \\t])", "gm");
  const m = locate(text, re, `key '${o.from}' (to rename)`, o.file, o.occurrence);
  return text.slice(0, m.index) + m[1] + o.to
       + text.slice(m.index! + m[0].length);
}

/** The ONE entry every caller uses: dispatch on which kind of override this
 *  is.  A kind is identified by the field only it carries, so an object that
 *  is none of the three refuses rather than being silently treated as one. */
export function applyDictOverride(text: string, o: DictOverride): string {
  if (isScalar(o)) return applyScalarOverride(text, o);
  if (isWord(o)) return applyWordOverride(text, o);
  return applyKeyRename(text, o);
}

/** Clone a bundled tutorial's raw files with overrides applied, and rebuild
 *  the parsed CaseFiles the adapter runs.  Throws if the witness is not in
 *  the bundled corpus (a build problem, not a user state). */
export function methodCase(
  witness: string, overrides: readonly DictOverride[],
): CaseFiles {
  const entry = tutorialByName(witness);
  if (!entry?.files.rawFiles)
    throw new Error(`method witness '${witness}' is not in the bundled corpus`);
  const raw: { [rel: string]: string } = { ...entry.files.rawFiles };
  // IN ORDER, deliberately: a rename and a scalar can address the same line
  // (the Thiele slab renames `radius` to `halfThickness` and then writes the
  // half-thickness), and the caller is the one that knows which comes first.
  for (const o of overrides) {
    const body = raw[o.file];
    if (body === undefined)
      throw new Error(`override: file '${o.file}' not in witness '${witness}'`);
    raw[o.file] = applyDictOverride(body, o);
  }
  return filesToCaseFiles(witness, raw);
}

/** Debounced in-browser engine run of a parameterized witness.  Mirrors the
 *  Explorer's useEngineCsv but returns the FULL RunResult (KPIs, profiles,
 *  csvFiles, trajectory) -- the method tools read those, not one CSV.
 *  `overridesKey` must change when the overrides change (JSON string of the
 *  knob values is fine); a newer spec aborts the in-flight run. */
export function useMethodRun(
  witness: string | null,
  overrides: readonly DictOverride[],
  overridesKey: string,
  binary: "choupoSolve" | "choupoBatch" | "choupoCtrl" | "choupoProps",
): { result: RunResult | null; err: string | null; busy: boolean } {
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!witness) {
      abortRef.current?.abort();
      setResult(null); setErr(null); setBusy(false);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const seq = ++runSeq.current;
      setBusy(true); setErr(null);
      void (async () => {
        try {
          const files = methodCase(witness, overrides);
          const resolved = await resolveAdapter("wasm");
          if (seq !== runSeq.current) return;
          if (resolved.kind === "unavailable") {
            setErr(resolved.fallbackReason
              ?? "The real solver could not be loaded (build the WASM).");
            setBusy(false);
            return;
          }
          const r = await resolved.adapter.run(files, () => {}, ctrl.signal, binary);
          if (seq !== runSeq.current) return;
          if (r.status === "done") { setResult(r); setErr(null); }
          else {
            const detail = r.log.split("\n").map((l) => l.trim()).reverse()
              .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
            setErr(`${binary} did not finish${detail ? `: ${detail}` : "."}`);
          }
        } catch (e) {
          if (seq === runSeq.current && !ctrl.signal.aborted)
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
          if (seq === runSeq.current) setBusy(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
    // overridesKey is the change signal for the overrides array (stable JSON
    // of the knob values); the array identity itself is NOT a dependency so
    // callers may build it inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [witness, overridesKey, binary]);
  return { result, err, busy };
}
