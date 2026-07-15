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
  Unit pop-outs (gui-credo §4 "Tab citizenship + two surfaces").

  There are exactly TWO unit surfaces: the read-only selection card (single
  click) and the unit's INTERNALS page (double click, `?internals=` -- tables,
  plots and the What-if tab).  Both pop-outs ride the SAME synthesised 1-unit
  clone of the open case: the unit + its inlet streams FROZEN from the parent
  run, `$variable` operation values resolved to their converged numbers.

  `synthesizeUnitClone` is the shared synthesis (pure -- takes the case files
  + run result, returns the clone + the internals payload).  `popOutUnit
  Internals` stashes it (STABLE keys, latest-wins, never consumed -- the tab
  survives F5) and opens the page; `popOutUnitFocus` opens the same clone as
  the graphical MINI-FLOWSHEET viewer (`?focus=`, reachable from the internals
  page header).
\*---------------------------------------------------------------------------*/

import type { RunResult, StreamResult, UnitProfile } from "../adapters/SolverAdapter.js";
import type { CaseFiles } from "../case/types.js";

/** Everything a unit pop-out tab needs, synthesised from the parent case. */
export interface UnitClone {
  name: string;
  type: string;
  model: string;
  /** The raw unit dict (Dict tab). */
  unit: Record<string, unknown>;
  /** Operation block with `$variable` values resolved from the run KPIs. */
  operation: Record<string, unknown>;
  /** This unit's KPIs from the parent run (empty pre-run). */
  kpis: Record<string, number>;
  profile: UnitProfile | null;
  inStreams: StreamResult[];
  outStreams: StreamResult[];
  reactions: CaseFiles["reactions"] | null;
  /** The self-contained 1-unit case: the unit ($vars resolved) + its inlets
   *  as feeds frozen from the parent run.  Runnable as-is by the WASM
   *  adapter (What-if tab, focus mini-flowsheet). */
  files: CaseFiles;
}

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).map(String) : v === undefined || v === null ? [] : [String(v)];

/**
 * Synthesise the 1-unit clone of `name` from a case + its latest run.
 *
 * - Inlet streams become feeds with the parent run's converged F/T/P +
 *   composition (frozen inlets); pre-run, the authored stream block (if any)
 *   is carried through unchanged.
 * - `$variable` operation values are resolved to their converged values from
 *   the run (the engine reports them under the same key in the unit's KPIs);
 *   without this the clone has no DesignSpec to define the `$var`.
 * - The case's `constant/` overlays (extraFiles) + the reactions library ride
 *   along so the unit runs standalone exactly as it did in the full case.
 *   NOT the outerDict (its DesignSpec is resolved into the operation) nor the
 *   recycle `variables` (no loop here).
 */
export function synthesizeUnitClone(
  caseFiles: CaseFiles,
  runResult: RunResult | null,
  name: string,
): UnitClone | null {
  const fs = caseFiles.flowsheet as {
    units?: Array<Record<string, unknown>>;
    streams?: Record<string, unknown>;
    variables?: Record<string, unknown>;
  } | undefined;
  const u = fs?.units?.find((x) => x["name"] === name);
  if (!u) return null;

  // The case's declared `variables {}` ride along so the clone can resolve a
  // `$ref` standalone -- and so the What-if can surface them as named knobs.
  const caseVars = fs?.variables;

  const inNames = asList(u["in"] ?? u["inputs"]);
  const outNames = asList(u["outputs"]);

  // Feed conditions FROZEN from the last run, written as per-stream 0/ files
  // (the legacy `streams {}` block is RETIRED -- the engine reads 0/ only).
  // Each inlet's 0/ file OVERRIDES the parent's authored one with the run value
  // (canonical SI: F in kmol/s, T in K, P in Pa); when there is no run stream
  // (pre-run pop-out) we keep the parent's authored 0/<nm> untouched.
  const runStreams = (runResult?.streams ?? []) as StreamResult[];
  const findS = (nm: string) => runStreams.find((s) => s.name === nm);
  const zeroFiles: Record<string, string> = {};
  for (const nm of inNames) {
    const s = findS(nm);
    if (!s) continue;
    const comp = (s.composition ?? {}) as Record<string, number>;
    const flows = Object.entries(comp)
      .map(([c, x]) => `    ${c}    ${(s.F ?? 0) * x};`)
      .join("\n");
    zeroFiles[`0/${nm}`] =
      `componentMolarFlows\n{\n${flows}\n}\nT    ${s.T} K;\nP    ${s.P} Pa;\n`;
  }

  // Resolve `$variable` operation values to their CONVERGED values from the
  // run (e.g. a heater's `Q $Q_meoh`, set by the full case's DesignSpec) --
  // EXCEPT a `$ref` to a DECLARED variable, which we keep as a reference so the
  // carried `variables {}` resolves it live (that is the What-if knob).
  const kpis = runResult?.kpis?.[name];
  const rawOp = (u["operation"] ?? {}) as Record<string, unknown>;
  const operation: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawOp)) {
    const ref = typeof v === "string" && v.startsWith("$") ? v.slice(1) : null;
    const declared = ref !== null && caseVars
      && Object.prototype.hasOwnProperty.call(caseVars, ref);
    operation[k] = ref !== null && !declared && kpis && typeof kpis[k] === "number"
      ? kpis[k] : v;
  }
  const unit = { ...u, operation };

  const files: CaseFiles = {
    controlDict: caseFiles.controlDict,
    thermoPackage: caseFiles.thermoPackage,
    flowsheet: {
      ...(caseVars ? { variables: caseVars } : {}),
      units: [unit],
    } as unknown as CaseFiles["flowsheet"],
  };
  if (caseFiles.reactions) files.reactions = caseFiles.reactions;
  // Parent 0/ tree rides along; the frozen inlets override their own 0/ files.
  files.extraFiles = { ...(caseFiles.extraFiles ?? {}), ...zeroFiles };

  const profile = (runResult?.profiles ?? []).find((p) => p.unit === name) ?? null;
  const inStreams = inNames.map(findS).filter(Boolean) as StreamResult[];
  const outStreams = outNames.map(findS).filter(Boolean) as StreamResult[];

  return {
    name,
    type: String(u["type"] ?? ""),
    model: typeof u["model"] === "string" ? u["model"] : "",
    unit: u,
    operation,
    kpis: kpis ?? {},
    profile,
    inStreams,
    outStreams,
    reactions: caseFiles.reactions ?? null,
    files,
  };
}

// STABLE stash keys -- one per unit, latest pop-out wins, NEVER consumed at
// boot: an isolated tab is a real tab, F5 must reproduce it (gui-credo §4
// "Tab citizenship").  Older builds used one-shot timestamped focus keys
// (`choupo.focus.<unit>.<ms>`); bootCase GCs those.
export function focusKey(name: string): string {
  return `choupo.focus.${name}`;
}
export function internalsKey(name: string): string {
  return `choupo.internals.${name}`;
}

/** Write BOTH stashes (focus mini-flowsheet + internals page) for a clone, so
 *  either tab can open / F5 from the same pop-out act. */
function writeStashes(clone: UnitClone): void {
  window.localStorage.setItem(
    focusKey(clone.name),
    JSON.stringify({ displayName: `focus:${clone.name}`, files: clone.files }),
  );
  window.localStorage.setItem(internalsKey(clone.name), JSON.stringify(clone));
}

/** Double-click on a unit (main flowsheet): open its INTERNALS page -- the
 *  unit surface (tables + plots + the What-if tab). */
export function popOutUnitInternals(name: string): void {
  void import("../state/store.js").then(({ useStore }) => {
    const st = useStore.getState();
    const clone = synthesizeUnitClone(st.caseFiles, st.runResult, name);
    // No clone -> nothing to stash -> the tab would boot straight into the
    // "expired" panel.  Bail instead of opening a dead tab (this happens for a
    // node that is neither a stashable leaf unit nor a drillable sub-case, e.g.
    // a fractal sector whose `.cho` marker is missing).  Mirrors popOutUnitFocus.
    if (!clone) return;
    try {
      writeStashes(clone);
      window.open(`${window.location.pathname}?internals=${encodeURIComponent(internalsKey(name))}`,
        "_blank", "noopener");
    } catch { /* localStorage / popup blocked -- nothing to do */ }
  });
}

/** Open the unit's graphical MINI-FLOWSHEET viewer (the 1-unit clone as a
 *  canvas: unit + named streams, runnable standalone).  Reached from the
 *  internals page header. */
export function popOutUnitFocus(name: string): void {
  void import("../state/store.js").then(({ useStore }) => {
    const st = useStore.getState();
    const clone = synthesizeUnitClone(st.caseFiles, st.runResult, name);
    if (!clone) return;
    try {
      writeStashes(clone);
      window.open(`${window.location.pathname}?focus=${encodeURIComponent(focusKey(name))}`,
        "_blank", "noopener");
    } catch { /* localStorage / popup blocked -- nothing to do */ }
  });
}
