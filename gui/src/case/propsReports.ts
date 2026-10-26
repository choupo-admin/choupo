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
  propsReports -- WHAT A PROPERTIES RUN PRODUCED, AS DOCUMENTS (DEV.md 4c
  C172 slice 3b; Vitor: "E o 'view' nao esta la a fazer nada!!! Devia ficar
  em 'reports'!!!").  The flowsheet's Reports holds the derived documents of
  a process run (utilities, balances, the design sheets); a properties case's
  Reports holds the derived documents of its workflow, each to read, check
  and take away:

    1. THE CURATION VERDICTS   every step that tests its answer against a
       band declared before the run: the verdict with the identifiability
       beside it (two questions, never merged), the band in its own unit,
       the held-out and in-sample statistics each in the unit the engine
       publishes, the evidence partition's fingerprint.
    2. THE RECORDS AND PROPOSALS THE RUN WROTE   each with the step that wrote
       it and the fingerprints the record states about itself -- a record
       written into the case (a fitted membrane) or a proposal (a draft for a
       human to promote).
    3. THE FILES THE RUN WROTE   every CSV: the parity and residual tables,
       a fit's history, the views' tables, each with the step that wrote it
       where the engine's file-traffic table says so.
    4. ONE DOWNLOAD   all of the above in a .zip, with the verdicts as a CSV.

  The comparisons with measured data (AAD), the decisions the run took and
  the thermo readiness are drawn by their own panels (ui/PropsReports.tsx).
  PURE: nothing here computes a number the engine did not publish.
\*---------------------------------------------------------------------------*/

import { strToU8, zipSync } from "fflate";

import type { OperationResult, RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { heldOutStatistic, inSampleStatistic, type VerdictRow } from "./reviewScreen.js";
import { stepOfOp, type WorkflowStudy } from "./workflowSteps.js";
import { stepFiles } from "./workflowDiagram.js";
import { writtenFingerprints } from "./fileTraffic.js";

const base = (p: string) => p.split("/").pop() ?? p;

/** One step's curation, as the engine published it. */
export interface CurationRow {
  step: string;
  op: string;
  type: string;
  verdict: string;
  identifiable: boolean | null;
  /** the band declared before the fit, "" none: "10 points (declared)" */
  band: string;
  heldOut: string;
  inSample: string;
  fingerprint: string;
}

const fmt = (v: number) => String(Number(v.toPrecision(4)));

/** The steps whose answer is judged: a curation verdict, a held-out
 *  statistic or an identifiability published. */
export function curationRows(rows: readonly VerdictRow[], results: readonly OperationResult[],
  outline: readonly WorkflowStudy[]): CurationRow[] {
  const out: CurationRow[] = [];
  for (const row of rows) {
    const r = results.find((x) => x.name === row.name);
    if (!r) continue;
    const cur = r.curation ?? {};
    const ho = heldOutStatistic(r);
    const ins = inSampleStatistic(r);
    const ident = r.diagnostics?.["identifiable"];
    if (!cur["verdict"] && !ho && typeof ident !== "number") continue;
    const unitOf = (h: { unit: string; published: boolean }) => (h.unit === "%" ? " %" : h.published ? ` ${h.unit}` : "");
    const bandV = cur["acceptanceMaxAADPct"];
    out.push({
      step: stepOfOp(outline, row.name)?.step.number ?? "",
      op: row.name, type: row.type,
      verdict: cur["verdict"] ?? "",
      identifiable: typeof ident === "number" ? ident > 0.5 : null,
      band: bandV ? `${bandV} ${cur["acceptanceUnit"] ?? ""}`.trim()
        + (cur["acceptanceOrigin"] ? ` (${cur["acceptanceOrigin"]})` : "") : "",
      heldOut: ho ? `${fmt(ho.value)}${unitOf(ho)}` : "",
      inSample: ins ? `${fmt(ins.value)}${unitOf(ins)}` : "",
      fingerprint: cur["partitionFingerprint"] ?? "",
    });
  }
  return out;
}

/** A record or a proposal the run wrote, with the step that wrote it. */
export interface WrittenRecordRow {
  path: string;
  kind: "record" | "proposal";
  step: string;
  op: string;
  text: string;
  fingerprints: { key: string; value: string }[];
}

/** Which step and op write `path`, by the engine's file-traffic table. */
function writerOf(path: string, outline: readonly WorkflowStudy[], propsDict: JsonDict | null | undefined):
  { step: string; op: string } {
  for (const st of outline)
    for (const s of st.steps)
      for (const f of stepFiles(s, propsDict))
        if (f.dir === "write" && (f.value === path || base(f.value) === base(path)))
          return { step: s.number, op: s.ops.length > 1 ? `${s.ops[0]} …` : s.ops[0]! };
  return { step: "", op: "" };
}

export function writtenRecordRows(result: RunResult | undefined, outline: readonly WorkflowStudy[],
  propsDict: JsonDict | null | undefined): WrittenRecordRow[] {
  const out: WrittenRecordRow[] = [];
  for (const [kind, files] of [["record", result?.caseWrites], ["proposal", result?.proposals]] as const)
    for (const [path, text] of Object.entries(files ?? {}))
      out.push({ path, kind, ...writerOf(path, outline, propsDict), text, fingerprints: writtenFingerprints(text) });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A file the run wrote (a CSV), with its size and its writer. */
export interface ResultFileRow {
  path: string;
  step: string;
  op: string;
  /** "the view <name>" for a post-processing table, "" otherwise */
  view: string;
  rows: number;
  columns: number;
}

/** Every CSV the run wrote -- never the case's own input data (constant/,
 *  the exp_ copies of its measurements). */
export function resultFileRows(result: RunResult | undefined, outline: readonly WorkflowStudy[],
  propsDict: JsonDict | null | undefined): ResultFileRow[] {
  const out: ResultFileRow[] = [];
  for (const [path, text] of Object.entries(result?.csvFiles ?? {})) {
    if (path.startsWith("constant/") || /(^|\/)exp_/.test(path)) continue;
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const columns = lines[0] ? lines[0].split(",").length : 0;
    const view = path.startsWith("postProcessing/") ? base(path).replace(/\.csv$/, "") : "";
    out.push({ path, ...(view ? { step: "", op: "" } : writerOf(path, outline, propsDict)), view,
      rows: Math.max(0, lines.length - 1), columns });
  }
  return out.sort((a, b) => (a.view ? 1 : 0) - (b.view ? 1 : 0) || a.path.localeCompare(b.path));
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The curation verdicts as a CSV (RFC 4180 quoting where needed). */
export function curationCsv(rows: readonly CurationRow[]): string {
  const head = ["step", "operation", "type", "verdict", "identifiable", "band", "heldOut", "inSample", "partitionFingerprint"];
  const body = rows.map((r) => [r.step, r.op, r.type, r.verdict,
    r.identifiable === null ? "" : r.identifiable ? "yes" : "no", r.band, r.heldOut, r.inSample, r.fingerprint]
    .map(csvCell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

/** Everything the run produced, as one .zip under `<case>-results/`: the
 *  CSVs, the records and proposals, and the verdicts.  null when the run
 *  produced nothing. */
export function resultsZip(caseName: string, result: RunResult | undefined, curation: readonly CurationRow[]):
  { fileName: string; bytes: Uint8Array } | null {
  const stem = `${(caseName.split("/").pop() || "case").replace(/[^A-Za-z0-9._-]/g, "_")}-results`;
  const files: Record<string, Uint8Array> = {};
  for (const [p, t] of Object.entries(result?.csvFiles ?? {}))
    if (!p.startsWith("constant/") && !/(^|\/)exp_/.test(p)) files[`${stem}/${p}`] = strToU8(t);
  for (const [p, t] of Object.entries(result?.caseWrites ?? {})) files[`${stem}/${p}`] = strToU8(t);
  for (const [p, t] of Object.entries(result?.proposals ?? {})) files[`${stem}/${p}`] = strToU8(t);
  if (curation.length > 0) files[`${stem}/curationVerdicts.csv`] = strToU8(curationCsv(curation));
  if (Object.keys(files).length === 0) return null;
  return { fileName: `${stem}.zip`, bytes: zipSync(files, { level: 6 }) };
}
