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
  userMeasurementsSynth -- the run plan that asks the ENGINE for a record's
  model AT the points a user loaded, and the reading of its answer (DEV.md 4c
  C289).  Pure: no React, no physics.  It is the Evidence view's own grammar
  (case/evidenceSynth.ts: `propertyScan1D` with `vary { points ( ... ) }`, the
  candidate's parameters inline) extended to the three shapes a user file may
  have:

    txy   T_bubble at the measured x, one op per held pressure
    pxy   P_bubble at the measured x, one op per held temperature
    psat  Psat_<c> at the measured T (the component's own record)

  plus one smooth curve per condition so the model is drawn OVER the points.
  Residual = engine - measured, relative = residual / measured: the only
  arithmetic, as in the Evidence view.  Nothing is evaluated in TypeScript.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";
import type { UserMeasurements } from "./userMeasurements.js";
import { isOutlier, type OutlierRule } from "./userMeasurements.js";

export interface UserOp {
  name: string;
  kind: "points" | "curve";
  /** the held condition: P (txy), T (pxy), or unused (psat; 0) -- SI */
  cond: number;
  /** points: the indices into `data.points`, in op order */
  rows: number[];
  file: string;
}

export interface UserPlan {
  kind: UserMeasurements["kind"];
  /** the measured column the engine is asked for */
  property: string;
  xComponent: string | null;
  ops: UserOp[];
  files: CaseFiles;
}

const key = (v: number) => v.toPrecision(8);

export function userRunPlan(args: {
  data: UserMeasurements;
  /** the pair (txy, pxy) or [component] (psat) */
  components: string[];
  /** the candidate's `activityModel {}` block (pairs); ignored for psat */
  activityModel?: JsonDict;
  componentFiles?: { [relPath: string]: string };
  curveN?: number;
}): UserPlan {
  const { data } = args;
  const curveN = Math.max(2, Math.round(args.curveN ?? 51));
  const ops: UserOp[] = [];
  const operations: JsonDict[] = [];
  let property: string;
  let xc: string | null = null, partner: string | null = null;

  if (data.kind === "psat") {
    const c = args.components[0]!;
    property = `Psat_${c}`;
    const state: JsonDict = { P: 101325, composition: { [c]: 1 } };
    const rows = data.points.map((_p, i) => i);
    ops.push({ name: "pts_0", kind: "points", cond: 0, rows, file: "pts_0.csv" });
    operations.push({
      name: "pts_0", type: "propertyScan1D",
      vary: { variable: "T", points: rows.map((i) => data.points[i]!.T) },
      state, properties: [property], output: { file: "pts_0.csv" },
    });
    const Ts = data.points.map((p) => p.T);
    const lo = Math.min(...Ts), hi = Math.max(...Ts);
    ops.push({ name: "curve_0", kind: "curve", cond: 0, rows: [], file: "curve_0.csv" });
    operations.push({
      name: "curve_0", type: "propertyScan1D",
      vary: { variable: "T", from: lo, to: hi > lo ? hi : lo + 1, n: curveN },
      state, properties: [property], output: { file: "curve_0.csv" },
    });
  } else {
    xc = data.xComponent!;
    partner = args.components.find((c) => c !== xc) ?? args.components[0]!;
    property = data.kind === "txy" ? "T_bubble" : "P_bubble";
    const held = (p: { T: number; P: number }) => (data.kind === "txy" ? p.P : p.T);
    const groups = new Map<string, { cond: number; rows: number[] }>();
    data.points.forEach((p, i) => {
      const g = groups.get(key(held(p))) ?? { cond: held(p), rows: [] };
      g.rows.push(i);
      groups.set(key(held(p)), g);
    });
    const state = (cond: number): JsonDict => ({
      ...(data.kind === "txy" ? { P: cond } : { T: cond, P: 101325 }),
      composition: { [xc!]: 0.5, [partner!]: 0.5 },
    });
    let gi = 0;
    for (const g of groups.values()) {
      const name = `pts_${gi}`;
      ops.push({ name, kind: "points", cond: g.cond, rows: g.rows, file: `${name}.csv` });
      operations.push({
        name, type: "propertyScan1D",
        vary: { variable: `x[${xc}]`, points: g.rows.map((i) => data.points[i]!.x!) },
        state: state(g.cond), properties: [property], output: { file: `${name}.csv` },
      });
      ++gi;
    }
    let ci = 0;
    for (const cond of [...groups.values()].map((g) => g.cond).sort((a, b) => a - b)) {
      const name = `curve_${ci}`;
      ops.push({ name, kind: "curve", cond, rows: [], file: `${name}.csv` });
      operations.push({
        name, type: "propertyScan1D",
        vary: { variable: `x[${xc}]`, from: 0, to: 1, n: curveN },
        state: state(cond), properties: [property], output: { file: `${name}.csv` },
      });
      ++ci;
    }
  }

  const comps = data.kind === "psat" ? [args.components[0]!] : [xc!, partner!];
  const files: CaseFiles = {
    propsDict: { operations },
    thermoPackage: {
      recordType: "thermophysicalPropertySystem",
      schemaVersion: 1,
      components: comps,
      equilibrium: {
        formulation: "gammaPhi",
        liquid: { activityModel: { ...(args.activityModel ?? { model: "ideal" }) }, standardState: "pureLiquid" },
        vapour: { fugacityModel: "idealGas" },
      },
    },
    controlDict: {
      application: "choupoProps",
      description: `Property Explorer -- the user's own ${data.kind} points against a record (ephemeral)`,
      verbosity: 2,
    },
  };
  if (args.componentFiles && Object.keys(args.componentFiles).length > 0)
    files.extraFiles = { ...args.componentFiles };
  return { kind: data.kind, property, xComponent: xc, ops, files };
}

// ---- reading the engine's answer -------------------------------------------

export interface UserCurve { cond: number; x: number[]; v: (number | null)[] }

export interface UserResidual {
  index: number;
  x: number | null;
  /** the held condition of this point, SI */
  cond: number;
  measured: number;
  engine: number | null;
  residual: number | null;
  relPct: number | null;
  outlier: boolean;
}

export interface UserResult {
  curves: UserCurve[];
  points: UserResidual[];
  /** ops whose CSV the run did not return */
  missing: string[];
  /** mean |relative residual| over the answered points, per cent */
  aadRelPct: number | null;
  nUsed: number;
  nOutliers: number;
}

function parseCsv(csv: string): { header: string[]; rows: (number | null)[][] } | null {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => {
    const v = Number(c.trim());
    return Number.isFinite(v) ? v : null;
  }));
  return { header, rows };
}

export function userResults(plan: UserPlan, data: UserMeasurements, rule: OutlierRule,
                            csvFiles: { [relPath: string]: string } | undefined): UserResult {
  const curves: UserCurve[] = [];
  const points: UserResidual[] = [];
  const missing: string[] = [];
  for (const op of plan.ops) {
    const text = csvFiles?.[op.file];
    const parsed = text ? parseCsv(text) : null;
    if (!parsed) { missing.push(op.name); continue; }
    const vI = parsed.header.indexOf(plan.property);
    if (op.kind === "curve") {
      curves.push({
        cond: op.cond,
        x: parsed.rows.map((r) => r[0] ?? NaN),
        v: parsed.rows.map((r) => (vI >= 0 ? r[vI] ?? null : null)),
      });
      continue;
    }
    op.rows.forEach((i, k) => {
      const p = data.points[i]!;
      const measured = data.kind === "txy" ? p.T : p.P;
      const row = parsed.rows[k];
      const engine = row && vI >= 0 ? row[vI] ?? null : null;
      const residual = engine === null ? null : engine - measured;
      const relPct = residual === null ? null : (residual / measured) * 100;
      points.push({
        index: i, x: p.x, cond: op.cond, measured, engine, residual, relPct,
        outlier: isOutlier(relPct, rule),
      });
    });
  }
  points.sort((a, b) => a.index - b.index);
  curves.sort((a, b) => a.cond - b.cond);
  const used = points.filter((p) => p.relPct !== null);
  return {
    curves, points, missing,
    aadRelPct: used.length ? used.reduce((s, p) => s + Math.abs(p.relPct!), 0) / used.length : null,
    nUsed: used.length,
    nOutliers: points.filter((p) => p.outlier).length,
  };
}
