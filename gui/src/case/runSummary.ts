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
  runSummary -- WHAT A FLOWSHEET RUN CONCLUDED, READ OFF THE RESULT (DEV.md 4c
  C168, slice 1 "results first, nothing invented").

  The run used to end in a toast that pointed somewhere else ("see Streams")
  and vanished after four seconds; the answer itself was drawn at 6 px on the
  canvas.  The strip that replaces it (ui/RunSummaryStrip.tsx) shows what the
  ENGINE published about the run, and this module decides nothing beyond
  picking those fields out:

    convergence   `converged` (the engine's verdict) and the declared tears'
                  loops it published (`recycleLoops`)
    mass          `globalMassBoundary`: the PROCESS closure where the case
                  declares utility circuits (the engine's own scope), else the
                  total one
    energy        `globalEnergyBoundary`: the residual in kW and, where the
                  engine says a scale exists, its percentage
    advisories    the count the engine raised (and model boundaries, which the
                  toast counted beside them)
    products      every stream whose role is `product`, minus a declared
                  utility circuit's return (the engine stamps `utilityCircuit`)
                  and a stream under observation

  THE ENGINE DECIDES, THE GUI DRAWS (CLAUDE.md §6).  No balance is summed
  here, no closure is divided, no iteration is counted from a residual
  history.  A field the result lacks is `null` and the strip says it is not
  published -- an absence is never filled with a number this file made.
  Pure, so tests/runSummary.test.ts pins it without a DOM.
\*---------------------------------------------------------------------------*/

import type { RunResult, StreamResult } from "../adapters/SolverAdapter.js";

export interface RunSummary {
  /** The engine's `converged`; null when the result carries none. */
  converged: boolean | null;
  /** How many declared tears the engine published a loop for. */
  recycleLoops: number;
  /** The mass closure the engine published, or null. */
  mass: { pct: number | null; scope: "process" | "total"; utilityExcludedPct: number | null } | null;
  /** The plant-boundary first law the engine published, or null. */
  energy: { residualKW: number; pct: number | null } | null;
  advisories: number;
  modelBoundaries: { total: number; refused: number };
  products: StreamResult[];
}

const finiteOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function runSummary(r: RunResult): RunSummary {
  const gm = r.globalMassBoundary;
  const mass: RunSummary["mass"] = gm
    ? gm.declared
      ? { pct: finiteOrNull(gm.process_closure_pct), scope: "process",
          utilityExcludedPct: finiteOrNull(gm.utility_fraction_pct) }
      : { pct: finiteOrNull(gm.total_closure_pct), scope: "total", utilityExcludedPct: null }
    : null;
  const ge = r.globalEnergyBoundary;
  //  A percentage exists only where the engine says it has a scale
  //  (`residual_pct_available`, then a non-null `residual_pct`).
  const energy: RunSummary["energy"] = ge && finiteOrNull(ge.residual_kW) !== null
    ? { residualKW: ge.residual_kW,
        pct: ge.residual_pct_available === false ? null : finiteOrNull(ge.residual_pct) }
    : null;
  const mb = r.modelBoundaries ?? [];
  return {
    converged: typeof r.converged === "boolean" ? r.converged : null,
    recycleLoops: r.recycleLoops?.length ?? 0,
    mass,
    energy,
    advisories: r.advisories?.length ?? 0,
    modelBoundaries: { total: mb.length, refused: mb.filter((b) => b.refused).length },
    products: r.streams.filter((s) => s.role === "product" && !s.utilityCircuit
      && !s.category && !s.observed),
  };
}

/** The one sentence a screen reader hears when a run ends (role=status). */
export function runSummarySentence(s: RunSummary | null, phase: "idle" | "running" | "done" | "error"): string {
  if (phase === "running") return "Running…";
  if (phase === "error") return "Run failed — the Log has the engine's message.";
  if (!s) return "Not run yet.";
  const conv = s.converged === null ? "convergence not published"
    : s.converged ? "converged" : "NOT converged";
  return `Run complete: ${conv}; ${s.advisories} advisor${s.advisories === 1 ? "y" : "ies"}.`;
}
