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
  engineSeries -- run a LIST of parameterized witness cases, in order, and
  publish the answers as they arrive.

  WHY IT IS NOT `useMethodRun` WITH A LOOP.  Every method tool so far draws a
  construction from ONE engine answer, or from a fixed handful (the Thiele tool
  runs three geometries, the column-control tool a base and a perturbation), and
  `case/methodRun.ts` serves that shape exactly: one witness, one override set,
  one RunResult.  A tool that needs a CURVE whose abscissa is a dict scalar
  needs something else -- the FUG shortcut's N(R) is one shortcut solve per
  reflux, and the rigorous stage ladder is one column solve per stage count.
  React forbids calling a hook in a loop, so "call useMethodRun N times" is not
  available at all; the sequencing has to live somewhere.

  WHY IT IS NOT INSIDE `methodRun.ts`.  It arguably belongs there -- that file
  is the declared ONE HOME for the run mechanics, and this module deliberately
  keeps the mechanics THERE: it imports `methodCase` for the witness lookup and
  the override application, and `resolveAdapter` for the binary, and owns
  nothing but the ORDER.  It lives in its own file only because it was written
  while another change was in flight in `methodRun.ts`, and two writers on one
  file is how a half-saved module reaches a live page.  Folding it in is a
  one-function move whenever that file is quiet; nothing here would change.

  WHAT IT GUARANTEES.

  * SEQUENTIAL, never parallel.  Each run writes the whole case into the WASM
    filesystem and solves it; a dozen at once is a dozen copies of the corpus in
    memory for no gain, and the browser has one core for this work anyway.
  * PARTIAL RESULTS ARE PUBLISHED.  `results[i]` fills in as run `i` finishes,
    so a curve draws itself rather than appearing after the last point.  A
    reader watching a plot fill knows the engine is working; a blank pane for
    four seconds reads as a broken page.
  * A SUPERSEDED SERIES IS ABANDONED.  Turning a knob mid-series aborts the
    in-flight run and drops every answer from the old one -- a curve must never
    mix points from two different questions.
  * A FAILED POINT IS A HOLE, NOT A LIE.  If one case refuses, its slot stays
    null and its message is collected; the series carries on.  A curve with a
    gap in it is honest; a curve silently closed over a missing point is not.

  ZERO PHYSICS: this module evaluates nothing.  It writes numbers the caller
  supplies into declared dict scalars and reads back whatever the engine
  published.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";

import { resolveAdapter } from "../adapters/index.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import { methodCase, type DictOverride } from "./methodRun.js";

/** One point of a series: the overrides that pose it, plus a label the caller
 *  can use to say which point failed. */
export interface SeriesPoint {
  /** Human-readable identification of this point ("R/Rmin = 1.30", "N = 18"). */
  label: string;
  overrides: DictOverride[];
}

export interface SeriesState {
  /** One slot per requested point, in the requested ORDER.  `null` = not run
   *  yet, or run and refused (see `failures`). */
  results: (RunResult | null)[];
  /** Points that refused, with the engine's own message.  Never swallowed. */
  failures: { label: string; message: string }[];
  /** How many points have been attempted (finished or refused). */
  done: number;
  /** True while a series is running. */
  busy: boolean;
}

const IDLE: SeriesState = { results: [], failures: [], done: 0, busy: false };

/** Debounced, sequential, in-browser engine runs of one witness over a list of
 *  override sets.
 *
 *  `seriesKey` must change exactly when the points change (a JSON string of the
 *  knob values plus the point count is the usual choice); the `points` array
 *  identity is deliberately NOT a dependency, so callers may build it inline.
 *  Passing a null witness idles the hook and clears its state. */
export function useEngineSeries(
  witness: string | null,
  points: readonly SeriesPoint[],
  seriesKey: string,
  binary: "choupoSolve" | "choupoBatch" | "choupoCtrl" | "choupoProps",
): SeriesState {
  const [state, setState] = useState<SeriesState>(IDLE);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!witness || points.length === 0) {
      abortRef.current?.abort();
      setState(IDLE);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const mine = ++seq.current;

      // The series starts EMPTY, not stale: a curve must never show one point
      // from the previous question beside the new ones.
      const results: (RunResult | null)[] = points.map(() => null);
      const failures: { label: string; message: string }[] = [];
      setState({ results: [...results], failures: [], done: 0, busy: true });

      void (async () => {
        const resolved = await resolveAdapter("wasm");
        if (mine !== seq.current) return;
        if (resolved.kind === "unavailable") {
          setState({
            results, failures: [{
              label: "engine",
              message: resolved.fallbackReason
                ?? "The real solver could not be loaded (build the WASM).",
            }], done: 0, busy: false,
          });
          return;
        }
        for (let i = 0; i < points.length; ++i) {
          if (mine !== seq.current || ctrl.signal.aborted) return;
          const p = points[i]!;
          try {
            const files = methodCase(witness, p.overrides);
            const r = await resolved.adapter.run(
              files, () => {}, ctrl.signal, binary);
            if (mine !== seq.current) return;
            if (r.status === "done") {
              results[i] = r;
            } else {
              const detail = r.log.split("\n").map((l) => l.trim()).reverse()
                .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
              failures.push({
                label: p.label,
                message: detail ?? `${binary} did not finish.`,
              });
            }
          } catch (e) {
            if (mine !== seq.current || ctrl.signal.aborted) return;
            failures.push({
              label: p.label,
              message: e instanceof Error ? e.message : String(e),
            });
          }
          if (mine !== seq.current) return;
          setState({
            results: [...results], failures: [...failures],
            done: i + 1, busy: i + 1 < points.length,
          });
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
    // seriesKey is the change signal for `points`; see the docstring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [witness, seriesKey, binary]);

  return state;
}
