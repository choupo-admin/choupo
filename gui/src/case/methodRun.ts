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

/** Replace the number of `key <number> [unit];` keeping unit + trailing
 *  comment.  Throws on zero matches, and on multiple matches unless
 *  `occurrence` picks one -- a knob that silently misses its dict runs the
 *  engine on the wrong question. */
export function applyScalarOverride(text: string, o: ScalarOverride): string {
  const re = new RegExp(
    "(^[ \\t]*" + o.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    + "[ \\t]+)([-+0-9.eE]+)([ \\t]*[A-Za-z/%0-9.^-]*[ \\t]*;)", "gm");
  const matches = [...text.matchAll(re)];
  if (matches.length === 0)
    throw new Error(`override: key '${o.key}' not found in ${o.file}`);
  if (matches.length > 1 && o.occurrence === undefined)
    throw new Error(`override: key '${o.key}' matches ${matches.length} times`
      + ` in ${o.file} -- pass 'occurrence' to pick one`);
  const idx = (o.occurrence ?? 1) - 1;
  const m = matches[idx];
  if (!m || m.index === undefined)
    throw new Error(`override: occurrence ${o.occurrence} of '${o.key}'`
      + ` not found in ${o.file} (${matches.length} present)`);
  return text.slice(0, m.index) + m[1] + String(o.value) + m[3]
       + text.slice(m.index + m[0].length);
}

/** Clone a bundled tutorial's raw files with overrides applied, and rebuild
 *  the parsed CaseFiles the adapter runs.  Throws if the witness is not in
 *  the bundled corpus (a build problem, not a user state). */
export function methodCase(
  witness: string, overrides: ScalarOverride[],
): CaseFiles {
  const entry = tutorialByName(witness);
  if (!entry?.files.rawFiles)
    throw new Error(`method witness '${witness}' is not in the bundled corpus`);
  const raw: { [rel: string]: string } = { ...entry.files.rawFiles };
  for (const o of overrides) {
    const body = raw[o.file];
    if (body === undefined)
      throw new Error(`override: file '${o.file}' not in witness '${witness}'`);
    raw[o.file] = applyScalarOverride(body, o);
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
  overrides: ScalarOverride[],
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
