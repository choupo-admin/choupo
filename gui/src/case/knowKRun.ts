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
  knowKRun -- the run mechanics of the `how-do-we-know-k` EduTool: a sweep of
  the cell experiment, each condition preceded by the experimenter's PILOT
  runs that find a good observation window.

  WHY NOT useMethodRunSweep.  That hook runs each override set once.  An
  experiment needs a window long enough to see the radical fall by three
  e-folds and short enough to have points inside it, and the decay constant
  is not known in advance (it is what is being measured).  So each condition
  is run, the signal is looked at (case/knowK.ts adaptWindow), and the window
  is changed and the cell run again until it is good; the windows tried are
  kept and shown.  Nothing here fits or decides a k: it only repeats the
  engine until the observation is usable, as a person at the bench would.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";

import { resolveAdapter } from "../adapters/index.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import { usePublishCaveats } from "./engineCaveats.js";
import {
  KNOW_K_BINARY, KNOW_K_WITNESS, PILOT_MAX, adaptWindow, experimentOverrides, signalOf,
  type Experiment,
} from "./knowK.js";
import { methodCase } from "./methodRun.js";

/** One condition of the sweep: the experiment without its window, and the
 *  species whose decay is watched. */
export interface DecayPoint {
  key: string;
  experiment: Omit<Experiment, "endTime">;
  species: "OH" | "H2O2";
}

export interface DecayRun {
  /** The accepted window (s) and the windows tried, in order. */
  window: number;
  trials: number[];
  /** True when the last window met the pilot's rule. */
  good: boolean;
  run: RunResult;
}

export interface DecaySweepState {
  results: (DecayRun | null)[];
  errs: (string | null)[];
  done: number;
  busy: boolean;
}

/** The first window tried, s: any number will do, the pilot corrects it. */
export const FIRST_WINDOW = 1.0e-4;

/** Run the points one after another; null `points` stops and clears. */
export function useDecaySweep(
  points: readonly DecayPoint[] | null, sweepKey: string,
): DecaySweepState {
  const [state, setState] = useState<DecaySweepState>(
    { results: [], errs: [], done: 0, busy: false });
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    runSeq.current++;
    abortRef.current?.abort();
  }, []);
  useEffect(() => {
    abortRef.current?.abort();
    const seq = ++runSeq.current;
    if (!points) {
      setState({ results: [], errs: [], done: 0, busy: false });
      return;
    }
    const pts = [...points];
    const n = pts.length;
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
        let w = FIRST_WINDOW;
        for (let i = 0; i < n; i++) {
          let res: DecayRun | null = null;
          let err: string | null = null;
          const trials: number[] = [];
          try {
            for (let trial = 0; trial < PILOT_MAX; trial++) {
              trials.push(w);
              const overrides = experimentOverrides({ ...pts[i]!.experiment, endTime: w });
              const r = await resolved.adapter.run(
                methodCase(KNOW_K_WITNESS, overrides), () => {}, ctrl.signal, KNOW_K_BINARY);
              if (seq !== runSeq.current || ctrl.signal.aborted) return;
              if (r.status !== "done") {
                const detail = r.log.split("\n").map((l) => l.trim()).reverse()
                  .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
                err = `${KNOW_K_BINARY} did not finish${detail ? `: ${detail}` : "."}`;
                break;
              }
              const sig = r.trajectory ? signalOf(r.trajectory, pts[i]!.species) : null;
              if (!sig) { err = "the run's trajectory does not carry the watched species"; break; }
              const a = adaptWindow(w, sig.t, sig.n);
              res = { window: w, trials: [...trials], good: a.ok, run: r };
              if (a.ok) break;
              w = a.next;
            }
          } catch (e) {
            err = e instanceof Error ? e.message : String(e);
          }
          if (seq !== runSeq.current || ctrl.signal.aborted) return;
          if (err) res = null;
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
    // sweepKey is the change signal for the points (see useMethodRunSweep).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepKey]);
  usePublishCaveats(state.results.map((r) => r?.run ?? null));
  return state;
}
