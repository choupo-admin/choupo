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
  Choupo GUI -- $variable model for the Variables workspace (L0, read-only)

  A case's `variables {... }` block (in flowsheetDict) holds entries that play
  THREE physically distinct roles, and the GUI must show which is which:

    constant    a scalar reused via $refs, owned by the user
                   e.g.  A 25 m2;           (evaporator03, shared area)
    manipulated a scalar that an outer driver (DesignSpec/Sweep/Optim) OWNS
                and overwrites every pass; the dict value is only the INITIAL
                GUESS, the bounds live in outerDict.manipulate
                   e.g.  W_turb -16 kW;     (brayton01, DesignSpec unknown)
    computed    a post-processing expression evaluated AFTER the solve
                   e.g.  W_net { compute "turbine.W_generated - ..."; unit kW; }

  This module is PURE + read-only: it reads the parsed dicts (structure) and
  the raw text (to recover the authored unit of a scalar, which toJson drops),
  and overlays the solved value from RunResult.computed.  It never mutates.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict, JsonValue } from "../dict/index.js";
import type { RunResult } from "../adapters/SolverAdapter.js";

export type VarRole = "constant" | "manipulated" | "computed";

export interface UseSite {
  /** Unit (or sector.unit) name. */
  unit: string;
  /** operation key path where the $ref appears, e.g. "W_shaft" or "area". */
  key: string;
}

/** A DesignSpec target the driver drives toward: a unit KPI path forced to a
 *  value within a tolerance.  `achieved`/`met` come from the last run. */
export interface SpecTarget {
  path: string;        // "PreheatMeoh.T_out"
  unit: string;        // "PreheatMeoh"
  key: string;         // "T_out"
  value: number;       // target, SI
  tol?: number;        // tolerance, SI
  achieved?: number;   // last-run value at path, SI
  met?: boolean;       // |achieved - value| <= tol
}

export interface VarRow {
  name: string;
  role: VarRole;
  /** Authored declared value as text ("-16 kW") when recoverable, else the
   *  SI number as a string; undefined for a pure compute entry. */
  declared?: string;
  /** For computed entries: the expression + its declared unit. */
  expr?: string;
  unit?: string;
  /** For manipulated entries: the driver-owned search seed + bounds. */
  bounds?: { initial?: number; min?: number; max?: number };
  /** Which driver owns a manipulated variable (e.g. "designSpec"). */
  owner?: string;
  /** Where $name is referenced across the flowsheet. */
  usedIn: UseSite[];
  /** Solved value from the run; SI number.  For a computed entry it is the
   *  evaluated expression; for a manipulated knob it is the converged value
   *  recovered from its use-site KPI (e.g. PreheatMeoh.Q). */
  solved?: number;
  /** For a manipulated knob: the DesignSpec target(s) on the unit(s) it
   *  drives -- the OTHER half of the spec ("turn until THIS hits THAT"). */
  targets?: SpecTarget[];
}

// ---- raw-text helpers ------------------------------------------------------

function flowsheetRaw(files: CaseFiles): string | undefined {
  const rf = files.rawFiles;
  if (!rf) return undefined;
  const key = Object.keys(rf).find((k) => k.endsWith("flowsheetDict"));
  return key ? rf[key] : undefined;
}

/** Best-effort: pull "name  <value> <unit>;" scalar tokens from the
 *  `variables {... }` block of the raw flowsheetDict text, so we can show the
 *  authored unit that toJson dropped.  Comments + compute sub-dicts are
 *  skipped; failure just means we fall back to the SI number. */
function authoredScalars(raw: string | undefined): { [name: string]: string } {
  const out: { [name: string]: string } = {};
  if (!raw) return out;
  const m = raw.match(/\bvariables\b\s*\{/);
  if (!m || m.index === undefined) return out;
  // Walk braces from the opening { to its match.
  let i = raw.indexOf("{", m.index);
  let depth = 0;
  let end = raw.length;
  for (let j = i; j < raw.length; j++) {
    if (raw[j] === "{") depth++;
    else if (raw[j] === "}") {
      depth--;
      if (depth === 0) { end = j; break; }
    }
  }
  const body = raw.slice(i + 1, end);
  // Strip // and /* */ comments.
  const clean = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  // Scalar entries end in ';' and contain no '{' (those are compute sub-dicts).
  for (const stmt of clean.split(";")) {
    const s = stmt.trim();
    if (!s || s.includes("{")) continue;
    const sm = s.match(/^([A-Za-z_]\w*)\s+(.+)$/s);
    if (sm) out[sm[1]!] = sm[2]!.replace(/\s+/g, " ").trim();
  }
  return out;
}

// ---- $ref use-site scan ----------------------------------------------------

function refName(v: JsonValue): string | null {
  return typeof v === "string" && v.startsWith("$") ? v.slice(1) : null;
}

/** Walk a unit's operation block (one level + nested dicts) collecting any
 *  $ref values, keyed by their variable name. */
function collectRefs(
  obj: JsonValue, unitName: string, prefix: string,
  sink: { [name: string]: UseSite[] },
): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, idx) => collectRefs(v, unitName, `${prefix}[${idx}]`, sink));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const rn = refName(v);
    if (rn) (sink[rn] ??= []).push({ unit: unitName, key: path });
    else if (v && typeof v === "object") collectRefs(v, unitName, path, sink);
  }
}

// ---- main ------------------------------------------------------------------

/** Parse the DesignSpec `targets ( {path; value; tol;} ... )` from outerDict,
 *  overlaying each target's achieved value (and met flag) from the run KPIs. */
export function buildSpecTargets(files: CaseFiles, run: RunResult | null): SpecTarget[] {
  const od = files.outerDict;
  const list = od?.targets;
  if (!Array.isArray(list)) return [];
  const kpis = run?.kpis ?? {};
  const out: SpecTarget[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const ed = e as JsonDict;
    const path = typeof ed.path === "string" ? ed.path : undefined;
    const value = typeof ed.value === "number" ? ed.value : undefined;
    if (!path || value === undefined) continue;
    const dot = path.indexOf(".");
    const unit = dot >= 0 ? path.slice(0, dot) : path;
    const key = dot >= 0 ? path.slice(dot + 1) : "";
    const tol = typeof ed.tol === "number" ? ed.tol : undefined;
    const achieved = kpis[unit]?.[key];
    const met = achieved !== undefined && tol !== undefined
      ? Math.abs(achieved - value) <= tol : undefined;
    out.push({ path, unit, key, value, tol, achieved, met });
  }
  return out;
}

/** Build the read-only $variable rows for a case (+ optional run). */
export function buildVariableRows(files: CaseFiles, run: RunResult | null): VarRow[] {
  const fs = files.flowsheet;
  if (!fs || typeof fs.variables !== "object" || Array.isArray(fs.variables)) return [];
  const vars = fs.variables as JsonDict;

  // Manipulated set + bounds from outerDict.
  const manip: { [name: string]: { initial?: number; min?: number; max?: number } } = {};
  let owner: string | undefined;
  const od = files.outerDict;
  if (od) {
    owner = typeof od.type === "string" ? od.type : undefined;
    const list = od.manipulate;
    if (Array.isArray(list)) {
      for (const e of list) {
        if (e && typeof e === "object" && !Array.isArray(e)) {
          const ed = e as JsonDict;
          const vn = typeof ed.variable === "string" ? ed.variable : undefined;
          if (vn) {
            manip[vn] = {
              initial: typeof ed.initial === "number" ? ed.initial : undefined,
              min: typeof ed.min === "number" ? ed.min : undefined,
              max: typeof ed.max === "number" ? ed.max : undefined,
            };
          }
        }
      }
    }
  }

  // Use-sites: scan every unit's operation block for $refs.
  const refSink: { [name: string]: UseSite[] } = {};
  const units = fs.units;
  if (Array.isArray(units)) {
    for (const u of units) {
      if (u && typeof u === "object" && !Array.isArray(u)) {
        const ud = u as JsonDict;
        const uname = typeof ud.name === "string" ? ud.name : "?";
        if (ud.operation) collectRefs(ud.operation, uname, "", refSink);
      }
    }
  }

  const authored = authoredScalars(flowsheetRaw(files));
  const computedVals = run?.computed ?? {};
  const allTargets = buildSpecTargets(files, run);
  const kpis = run?.kpis ?? {};

  const rows: VarRow[] = [];
  for (const [name, v] of Object.entries(vars)) {
    const usedIn = refSink[name] ?? [];
    // compute entry: a sub-dict carrying a `compute` string.
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as JsonDict).compute === "string") {
      const cd = v as JsonDict;
      rows.push({
        name, role: "computed",
        expr: cd.compute as string,
        unit: typeof cd.unit === "string" ? cd.unit : undefined,
        usedIn,
        solved: typeof computedVals[name] === "number" ? computedVals[name] : undefined,
      });
      continue;
    }
    // scalar entry: constant or manipulated.
    const isManip = name in manip;
    // For a knob: recover its converged value from a use-site KPI (e.g.
    // $Q_meoh used in PreheatMeoh.Q -> kpis.PreheatMeoh.Q), and pair it with
    // the DesignSpec target(s) on any unit it drives (the spec's other half).
    let solved: number | undefined;
    let targets: SpecTarget[] | undefined;
    if (isManip) {
      for (const site of usedIn) {
        const kv = kpis[site.unit]?.[site.key];
        if (kv !== undefined) { solved = kv; break; }
      }
      const driveUnits = new Set(usedIn.map((s) => s.unit));
      const matched = allTargets.filter((t) => driveUnits.has(t.unit));
      if (matched.length > 0) targets = matched;
    }
    rows.push({
      name,
      role: isManip ? "manipulated" : "constant",
      declared: authored[name] ?? (typeof v === "number" ? String(v) : undefined),
      bounds: isManip ? manip[name] : undefined,
      owner: isManip ? owner : undefined,
      usedIn,
      solved,
      targets,
    });
  }
  // Stable order: computed last (they depend on the rest); else as authored.
  return rows;
}
