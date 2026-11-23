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
  methaneAssemblyRun -- the run mechanics of the `methane-assembly` EduTool:
  SEVERAL shipped cases, one after another, on the same adapter.

  WHY NOT useMethodRunSweep.  That hook runs ONE witness under several override
  sets.  Here every rung of the ladder is its own shipped case (its own
  reactions list), and nothing is overridden: the page asks the engine what
  each case says.  A run that fails stays a failed entry with its message; no
  number is put in its place.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";

import { resolveAdapter } from "../adapters/index.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import { usePublishCaveats } from "./engineCaveats.js";
import { METHANE_BINARY } from "./methaneAssembly.js";
import { methodCase } from "./methodRun.js";

export interface WitnessSweepState {
  results: (RunResult | null)[];
  errs: (string | null)[];
  done: number;
  busy: boolean;
}

/** Run the witnesses in order; a null list stops and clears.  `sweepKey` must change when the list does. */
export function useWitnessSweep(
  witnesses: readonly string[] | null, sweepKey: string,
): WitnessSweepState {
  const [state, setState] = useState<WitnessSweepState>({ results: [], errs: [], done: 0, busy: false });
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    runSeq.current++;
    abortRef.current?.abort();
  }, []);
  useEffect(() => {
    abortRef.current?.abort();
    const seq = ++runSeq.current;
    if (!witnesses) {
      setState({ results: [], errs: [], done: 0, busy: false });
      return;
    }
    const list = [...witnesses];
    const n = list.length;
    setState({ results: Array(n).fill(null), errs: Array(n).fill(null), done: 0, busy: n > 0 });
    if (n === 0) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(() => {
      void (async () => {
        const resolved = await resolveAdapter("wasm");
        if (seq !== runSeq.current) return;
        if (resolved.kind === "unavailable") {
          const why = resolved.fallbackReason
            ?? "The real solver could not be loaded (build the WASM).";
          setState({ results: Array(n).fill(null), errs: Array(n).fill(why), done: n, busy: false });
          return;
        }
        for (let i = 0; i < n; i++) {
          let res: RunResult | null = null;
          let err: string | null = null;
          try {
            const r = await resolved.adapter.run(
              methodCase(list[i]!, []), () => {}, ctrl.signal, METHANE_BINARY);
            if (seq !== runSeq.current || ctrl.signal.aborted) return;
            if (r.status === "done") res = r;
            else {
              const detail = r.log.split("\n").map((l) => l.trim()).reverse()
                .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
              err = `${METHANE_BINARY} did not finish${detail ? `: ${detail}` : "."}`;
            }
          } catch (e) {
            err = e instanceof Error ? e.message : String(e);
          }
          if (seq !== runSeq.current || ctrl.signal.aborted) return;
          setState((s) => {
            const results = [...s.results];
            const errs = [...s.errs];
            results[i] = res;
            errs[i] = err;
            return { results, errs, done: i + 1, busy: i + 1 < n };
          });
        }
      })();
    }, 300);
    return () => clearTimeout(t);
    // sweepKey is the change signal for the list (see useMethodRunSweep).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepKey]);
  usePublishCaveats(state.results);
  return state;
}
