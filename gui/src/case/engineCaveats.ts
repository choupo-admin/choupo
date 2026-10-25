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
  engineCaveats -- WHAT THE ENGINE SAID ABOUT THE RUNS BEHIND AN EDUTOOL
  PAGE, gathered from every run the page made (DEV.md 4c C112, point 17).

  The audit point: a slider pushed to its extreme should say "the model is no
  longer valid here, and why" rather than draw a fictitious curve.  For a page
  that runs the engine, the engine ALREADY says it: a correlation used
  outside its declared range, a vapour pressure asked above the critical
  temperature, a bound that binds -- each is an advisory in the run's result
  (`RunResult.advisories`, the end-of-run caveat block of the console).  The
  EduTools pages dropped them: measured on the absorption page, a gas fed at
  the knob's 360 K top makes the engine announce that NH3's heat capacity is
  integrated outside its declared 200-350 K, and the page drew the curve
  without a word.

  So every run hook of the EduTools (useCaseFilesRun and its useMethodRun
  wrapper, useMethodRunSweep, useEngineSeries) PUBLISHES its finished runs'
  warnings here, keyed by the hook instance, and withdraws them when the
  hook re-runs or unmounts; the tool frame draws the union once, above every
  tool (ui/methods/EngineCaveats.tsx).  ONE home for the collection, ONE
  surface for the drawing, and no page has to remember to do it.  The page
  computes nothing: the words are the engine's, verbatim, with their locus.

  Only `severity: "warning"` advisories are published -- the ones that
  qualify an answer.  Divergences (a different question was solved) are a
  separate engine channel and are not merged here.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useSyncExternalStore } from "react";

import type { Advisory, RunResult } from "../adapters/SolverAdapter.js";

/** One caveat as the frame draws it: the engine's own words. */
export interface EngineCaveat {
  category: string;
  locus: string;
  message: string;
}

const live = new Map<number, readonly EngineCaveat[]>();
const listeners = new Set<() => void>();
let snapshot: readonly EngineCaveat[] = [];
let nextId = 1;

function rebuild(): void {
  const seen = new Set<string>();
  const out: EngineCaveat[] = [];
  for (const list of live.values()) {
    for (const c of list) {
      const k = `${c.category}\u0000${c.locus}\u0000${c.message}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  snapshot = out;
  for (const l of listeners) l();
}

/** The warnings of a set of finished runs, deduplicated. */
export function caveatsOf(results: readonly (RunResult | null | undefined)[]):
  EngineCaveat[] {
  const out: EngineCaveat[] = [];
  for (const r of results) {
    for (const a of (r?.advisories ?? []) as Advisory[]) {
      if (a.severity !== "warning") continue;
      out.push({ category: a.category, locus: a.locus, message: a.message });
    }
  }
  return out;
}

/** Publish the caveats of this hook instance's current runs; withdrawn on
 *  unmount.  Called by every EduTools run hook with its finished results. */
export function usePublishCaveats(
  results: readonly (RunResult | null | undefined)[],
): void {
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;
  //  The CONTENT is the change signal: a sweep hands a fresh array on every
  //  render, and two runs with the same number of caveats may say different
  //  things.
  const list = caveatsOf(results);
  const key = JSON.stringify(list);
  useEffect(() => {
    const now: EngineCaveat[] = JSON.parse(key);
    if (now.length > 0) live.set(id.current, now);
    else live.delete(id.current);
    rebuild();
  }, [key]);
  useEffect(() => () => {
    live.delete(id.current);
    rebuild();
  }, []);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Every warning the engine raised on the runs live on this page. */
export function useEngineCaveats(): readonly EngineCaveat[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
