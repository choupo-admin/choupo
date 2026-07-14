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
  WasmAdapter -- runs the real C++ solver compiled to WebAssembly,
  inside a Web Worker so the main thread (and therefore the UI) stays
  responsive during long-running solves.

  Architecture
  ------------
      main thread                                 worker thread
      -----------                                 -------------
      WasmAdapter.run(case, onChunk)
        ├─ serialise case dicts to text
        ├─ spawn /workers/solverWorker.js
        └─ postMessage { type: 'run', files }
                                                  loadFactory()
                                                  instantiate Module
                                                  write dicts to MEMFS
                                                  Module.callMain(['/case'])
                                                  per stdout line:
        log += line     ◄────────  { type: 'log', line }
                                                  on completion:
        resolve(RunResult)  ◄────  { type: 'done', rc }

  Phase 1.5b: the C++ binary now emits a structured JSON block
  delimited by `<<<Choupo:result-begin>>>` / `<<<Choupo:result-end>>>`
  marker lines.  We strip that block from the user-visible log,
  parse it, and populate RunResult.streams + RunResult.convergence so
  the Streams and Plots tabs show real values.
\*---------------------------------------------------------------------------*/

import { readEdges } from "../case/toGraph.js";
import { fromJson, serialize } from "../dict/index.js";
import { parseDynamicInstants } from "../case/dynamicInstants.js";
import type { CaseFiles } from "../case/types.js";
import type { JsonDict } from "../dict/index.js";
import type { PairOrigin, ValidityDomain, PromotionOverride } from "./SolverAdapter.js";
import type {
  AadRecord,
  Advisory,
  ComponentCoverage,
  ConvergenceCurve,
  Economics,
  ExperimentalDataset,
  ValidationBlock,
  ModelBoundary,
  OperationResult,
  PairResolution,
  RunResult,
  SolverAdapter,
  StreamResult,
  TimelineEvent,
  TxyData,
  UnitProfile,
  UtilityAllocationRow,
} from "./SolverAdapter.js";
import { WASM_WORKER_URL } from "./wasmModule.js";

// The markers the WASM solver wraps its structured-result JSON in.  Exported
// for tests; the C++ side prints these around the ResultEmitter JSON block.
export const BEGIN_MARK = "<<<Choupo:result-begin>>>";
export const END_MARK = "<<<Choupo:result-end>>>";

/** The WASM binaries the GUI can dispatch to (one EXPORT_NAME each). */
export type WasmBinary =
  | "choupoSolve"
  | "choupoBatch"
  | "choupoCtrl"
  | "choupoProps";

/**
 * Pick the WASM binary for a case's `controlDict.application` value.
 *
 * choupoBatch -> batch + recipes (transient)
 * choupoCtrl  -> dynamic + control (transient)
 * choupoProps -> property scans / fits
 * anything else (incl. undefined / "choupoSolve") -> choupoSolve, so a case
 * that omits `application` still runs the steady solver -- backwards compat.
 *
 * Exported pure so the dispatch is unit-testable without spawning a worker.
 */
export function selectBinary(app: unknown): WasmBinary {
  if (app === "choupoBatch" || app === "choupoCtrl" || app === "choupoProps") {
    return app;
  }
  return "choupoSolve";
}

type WorkerMessage =
  | { type: "log"; line: string }
  | { type: "done"; rc: number }
  | { type: "error"; message: string }
  | { type: "trajectory"; csv: string }
  | { type: "csvFiles"; files: { [relPath: string]: string } }
  | { type: "instants"; files: { [relPath: string]: string } }
  | { type: "proposals"; files: { [relPath: string]: string } };

export class WasmAdapter implements SolverAdapter {
  run(caseFiles: CaseFiles,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    binaryOverride?: string,
  ): Promise<RunResult> {
    return new Promise((resolve) => {
      let log = "";
      let trajectoryCsv: string | null = null;
      let csvFiles: { [relPath: string]: string } | null = null;
      let instantFiles: { [relPath: string]: string } | null = null;
      let proposals: { [relPath: string]: string } | null = null;
      const emit = (line: string) => {
        const chunk = line + "\n";
        log += chunk;
        onChunk(chunk);
      };

      // Add a timestamp query so Firefox never serves a stale worker.
      const workerUrl = `${WASM_WORKER_URL}?t=${Date.now()}`;
      emit("[adapter] spawning worker at " + workerUrl);
      const worker = new Worker(workerUrl, { type: "module" });
      emit("[adapter] worker constructed; posting run message");
      let settled = false;

      const settle = (status: "done" | "error") => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        worker.terminate();
        const { displayLog, streams, convergence, profiles, txy, componentMolarMass, kpis,
          utilityAllocation, computed, timeline, advisories, modelBoundaries, operationResults, thermoResolution,
          componentCoverage, experimentalDatasets, validation, economics } =
          extractStructured(log, caseFiles);
        const result: RunResult = { status, log: displayLog, streams, convergence };
        if (Object.keys(kpis).length > 0) result.kpis = kpis;
        if (profiles && profiles.length > 0) result.profiles = profiles;
        if (txy) result.txy = txy;
        if (componentMolarMass) result.componentMolarMass = componentMolarMass;
        if (utilityAllocation && utilityAllocation.length > 0) result.utilityAllocation = utilityAllocation;
        if (computed && Object.keys(computed).length > 0) result.computed = computed;
        if (timeline && timeline.length > 0) result.timeline = timeline;
        if (advisories && advisories.length > 0) result.advisories = advisories;
        if (modelBoundaries && modelBoundaries.length > 0) result.modelBoundaries = modelBoundaries;
        if (operationResults && operationResults.length > 0) result.operationResults = operationResults;
        if (thermoResolution && thermoResolution.length > 0) result.thermoResolution = thermoResolution;
        if (componentCoverage && componentCoverage.length > 0) result.componentCoverage = componentCoverage;
        if (experimentalDatasets && experimentalDatasets.length > 0) result.experimentalDatasets = experimentalDatasets;
        if (validation && validation.length > 0) result.validation = validation;
        if (economics) result.economics = economics;
        if (trajectoryCsv) {
          const parsed = parseTrajectoryCsv(trajectoryCsv);
          if (parsed) result.trajectory = parsed;
        }
        if (csvFiles && Object.keys(csvFiles).length > 0) {
          result.csvFiles = csvFiles;
        }
        if (instantFiles && Object.keys(instantFiles).length > 0) {
          const parsed = parseDynamicInstants(instantFiles);
          if (parsed) result.instants = parsed;
        }
        if (proposals && Object.keys(proposals).length > 0) {
          result.proposals = proposals;
        }
        resolve(result);
      };

      const onAbort = () => {
        emit("\n[user] cancelled — terminating solver");
        settle("error");
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        if (msg.type === "log") {
          emit(msg.line);
        } else if (msg.type === "trajectory") {
          trajectoryCsv = msg.csv;
        } else if (msg.type === "csvFiles") {
          csvFiles = msg.files;
        } else if (msg.type === "instants") {
          instantFiles = msg.files;
        } else if (msg.type === "proposals") {
          proposals = msg.files;
        } else if (msg.type === "done") {
          if (msg.rc !== 0) emit(`\n[wasm] exited with code ${msg.rc}`);
          settle(msg.rc === 0 ? "done" : "error");
        } else if (msg.type === "error") {
          emit(`\n[wasm-worker] ${msg.message}`);
          settle("error");
        }
      };

      worker.onerror = (e) => {
        emit(`\n[wasm-worker] worker error: ${e.message}`);
        settle("error");
      };

      // Choose the right WASM binary based on the case's
      // controlDict.application field (binaryOverride wins for the Props view).
      const app = binaryOverride ?? caseFiles.controlDict["application"];
      const binary = selectBinary(app);
      emit(`[adapter] dispatching to ${binary} WASM`);

      worker.postMessage({
        type: "run",
        binary,
        files: serialiseCase(caseFiles),
      });
    });
  }
}

function serialiseCase(caseFiles: CaseFiles): { [path: string]: string } {
  const files: { [path: string]: string } = {
    "system/controlDict": dictToText(caseFiles.controlDict, "controlDict"),
  };
  // propertyPackage cases carry an EMPTY thermoPackage ({}); the real thermo
  // source travels in extraFiles as constant/propertyDict.  Never write an
  // empty thermoPackage file over it.
  if (Object.keys(caseFiles.thermoPackage).length > 0)
    files["constant/propertyDict"] = dictToText(caseFiles.thermoPackage, "thermoPackage");
  // Either flowsheetDict (solve/batch/ctrl) or propsDict (props).
  if (caseFiles.flowsheet) {
    files["system/flowsheetDict"] =
      dictToText(caseFiles.flowsheet, "flowsheetDict");
  }
  if (caseFiles.propsDict) {
    files["system/propsDict"] = dictToText(caseFiles.propsDict, "propsDict");
  }
  if (caseFiles.reactions) {
    files["constant/reactions"] = dictToText(caseFiles.reactions, "reactions");
  }
  if (caseFiles.solverDict) {
    files["system/solverDict"] = dictToText(caseFiles.solverDict, "solverDict");
  }
  if (caseFiles.outerDict) {
    files["system/outerDict"] = dictToText(caseFiles.outerDict, "outerDict");
  }
  if (caseFiles.postDict) {
    files["system/postDict"] = dictToText(caseFiles.postDict, "postDict");
  }
  // Raw passthrough files (case-local components, binary-pair tables,...).
  // Already in serialised text form; the worker writes them to MEMFS
  // verbatim, mkdir-p'ing the parent dirs as needed.
  if (caseFiles.extraFiles) {
    for (const [rel, body] of Object.entries(caseFiles.extraFiles)) {
      files[rel] = body;
    }
  }
  return files;
}

// Exported so the "Save case" download (gui/src/case/saveCase.ts) and
// the worker-bound serialiseCase share ONE round-trip path.
export function dictToText(json: JsonDict, name: string): string {
  return serialize(fromJson(json, name));
}

/**
 * Find the structured result block in the stdout, slice it out of the
 * displayed log, parse it, and shape it into the RunResult interface.
 *
 * If parsing fails (older C++ binary, partial block due to early
 * abort, etc.) we silently return empty arrays — the user still sees
 * the full log.
 */
// Exported for tests (the JSON-extraction is the most failure-prone bit of
// the WASM bridge --- it has to survive truncated logs, multiple marker
// pairs, invalid JSON, and trim its own markers from the displayed log).
export function extractStructured(log: string,
  caseFiles: CaseFiles,
): {
  displayLog: string;
  streams: StreamResult[];
  convergence: ConvergenceCurve[];
  profiles: UnitProfile[];
  txy?: TxyData;
  componentMolarMass?: { [comp: string]: number };
  /** Per-unit KPIs (yield, supersaturation, Q_removed,...) -- empty {} when
   *  no JSON block or no kpis object in it. */
  kpis: { [unitName: string]: { [k: string]: number } };
  /** Per-duty utility allocation rows (which utility, kg/s, MW, EUR/h). */
  utilityAllocation?: UtilityAllocationRow[];
  /** Post-processing computed expressions (variables{} `compute` entries:
   *  W_net, eta_thermal,...), evaluated by the solver after the run. */
  computed?: { [name: string]: number };
  /** Batch campaign timeline (fired recipe actions + unit status events). */
  timeline?: TimelineEvent[];
  /** Solver advisories (bound active at the solution, rating, auto-init). */
  advisories?: Advisory[];
  /** Model-boundary audit findings (adjacent units on different thermo models). */
  modelBoundaries?: ModelBoundary[];
  /** Per-operation diagnostics from a choupoProps run (fit stats). */
  operationResults?: OperationResult[];
  /** Binary-pair resolution provenance. */
  thermoResolution?: PairResolution[];
  /** Per-component thermo coverage. */
  componentCoverage?: ComponentCoverage[];
  /** Experimental-dataset provenance. */
  experimentalDatasets?: ExperimentalDataset[];
  /** Engine-computed model-vs-measured AAD (the validation weapon). */
  validation?: ValidationBlock[];
  /** Discounted-cash-flow appraisal (economics postDict): headline scalars +
   *  the year-by-year DCF table. */
  economics?: Economics;
} {
  const beginIdx = log.lastIndexOf(BEGIN_MARK);
  const endIdx = log.lastIndexOf(END_MARK);
  if (beginIdx < 0 || endIdx < 0 || endIdx <= beginIdx) {
    return { displayLog: log, streams: [], convergence: [], profiles: [], kpis: {} };
  }

  const jsonText = log.slice(beginIdx + BEGIN_MARK.length, endIdx).trim();

  // Trim the block (including a leading newline) from the displayed log.
  // We extend the slice to absorb a trailing newline after END_MARK and
  // any leading newline before BEGIN_MARK so we don't leave a blank line.
  let cutStart = beginIdx;
  while (cutStart > 0 && log[cutStart - 1] === "\n") cutStart--;
  let cutEnd = endIdx + END_MARK.length;
  while (cutEnd < log.length && log[cutEnd] === "\n") cutEnd++;
  const displayLog = log.slice(0, cutStart) + log.slice(cutEnd);

  let parsed: ResultPayload | null = null;
  try {
    parsed = JSON.parse(jsonText) as ResultPayload;
  } catch {
    return { displayLog, streams: [], convergence: [], profiles: [], kpis: {} };
  }

  const streams = shapeStreams(parsed, caseFiles);
  const convergence = shapeConvergence(parsed);
  const profiles = shapeProfiles(parsed);
  const txy = shapeTxy(parsed);
  // Per-unit KPIs are passed through verbatim (filtered to numeric values for
  // safety); the panel reads them by unit name.
  const kpis: { [u: string]: { [k: string]: number } } = {};
  if (parsed.kpis) {
    for (const [u, kv] of Object.entries(parsed.kpis)) {
      const clean: { [k: string]: number } = {};
      for (const [k, v] of Object.entries(kv)) {
        if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
      }
      if (Object.keys(clean).length > 0) kpis[u] = clean;
    }
  }
  // Computed expressions: numeric-filtered, same hygiene as kpis.
  let computed: { [k: string]: number } | undefined;
  if (parsed.computed) {
    const clean: { [k: string]: number } = {};
    for (const [k, v] of Object.entries(parsed.computed)) {
      if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
    }
    if (Object.keys(clean).length > 0) computed = clean;
  }

  // Per-operation diagnostics (fit stats): numeric-filter each diagnostics map.
  let operationResults: OperationResult[] | undefined;
  if (Array.isArray(parsed.operationResults)) {
    const rows: OperationResult[] = [];
    for (const orr of parsed.operationResults) {
      if (!orr || typeof orr.name !== "string") continue;
      const clean: { [k: string]: number } = {};
      for (const [k, v] of Object.entries(orr.diagnostics ?? {})) {
        if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
      }
      const prov: { [k: string]: string } = {};
      for (const [k, v] of Object.entries(orr.provenance ?? {})) {
        if (typeof v === "string") prov[k] = v;
      }
      rows.push({
        name: orr.name, type: orr.type ?? "", diagnostics: clean,
        ...(Object.keys(prov).length > 0 ? { provenance: prov } : {}),
      });
    }
    if (rows.length > 0) operationResults = rows;
  }

  // Experimental-dataset provenance (string records, light validation).
  let experimentalDatasets: ExperimentalDataset[] | undefined;
  if (Array.isArray(parsed.experimentalDatasets)) {
    const rows: ExperimentalDataset[] = [];
    for (const d of parsed.experimentalDatasets) {
      if (!d || typeof d.name !== "string") continue;
      rows.push({
        name: d.name, kind: d.kind ?? "", component: d.component ?? "",
        source: d.source ?? "", citation: d.citation ?? "",
        nPoints: typeof d.nPoints === "number" ? d.nPoints : 0,
      });
    }
    if (rows.length > 0) experimentalDatasets = rows;
  }

  // Validation weapon: engine-computed model-vs-measured AAD (defensive parse;
  // numbers may be null when status != ok).
  let validation: ValidationBlock[] | undefined;
  if (Array.isArray(parsed.validation)) {
    const blocks: ValidationBlock[] = [];
    for (const v of parsed.validation) {
      if (!v || typeof v.dataset !== "string" || !Array.isArray(v.aad)) continue;
      const aad: AadRecord[] = [];
      for (const a of v.aad) {
        if (!a || typeof a.model !== "string") continue;
        const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);
        aad.push({
          model: a.model,
          property: typeof a.property === "string" ? a.property : null,
          kind: typeof a.kind === "string" ? a.kind : null,
          aadAbs: num(a.aadAbs),
          aadAbsUnit: typeof a.aadAbsUnit === "string" ? a.aadAbsUnit : null,
          aadRelPct: num(a.aadRelPct),
          nMeas: typeof a.nMeas === "number" ? a.nMeas : 0,
          nUsed: typeof a.nUsed === "number" ? a.nUsed : 0,
          nOutOfRange: typeof a.nOutOfRange === "number" ? a.nOutOfRange : 0,
          nNearZeroSkipped: typeof a.nNearZeroSkipped === "number" ? a.nNearZeroSkipped : 0,
          nNonFinite: typeof a.nNonFinite === "number" ? a.nNonFinite : 0,
          status: typeof a.status === "string" ? a.status : "",
        });
      }
      blocks.push({ dataset: v.dataset, abscissa: typeof v.abscissa === "string" ? v.abscissa : "", aad });
    }
    if (blocks.length > 0) validation = blocks;
  }

  // Binary-pair resolution provenance (string records, light validation).
  let thermoResolution: PairResolution[] | undefined;
  if (Array.isArray(parsed.thermoResolution)) {
    const rows: PairResolution[] = [];
    for (const p of parsed.thermoResolution) {
      if (!p || typeof p.i !== "string" || typeof p.j !== "string") continue;
      rows.push({
        model: p.model ?? "", i: p.i, j: p.j,
        status: p.status ?? "", source: p.source ?? "", provSource: p.provSource ?? "",
        origin: p.origin, method: p.method, methodVersion: p.methodVersion,
        validity: p.validity, promotedDespite: p.promotedDespite,
      });
    }
    if (rows.length > 0) thermoResolution = rows;
  }

  let componentCoverage: ComponentCoverage[] | undefined;
  if (Array.isArray(parsed.componentCoverage)) {
    const rows: ComponentCoverage[] = [];
    for (const c of parsed.componentCoverage) {
      if (!c || typeof c.name !== "string") continue;
      rows.push({
        name: c.name,
        criticals: !!c.criticals, psat: !!c.psat, vliq: !!c.vliq,
        cpIdealGas: !!c.cpIdealGas, gibbs: !!c.gibbs, nonvolatile: !!c.nonvolatile,
      });
    }
    if (rows.length > 0) componentCoverage = rows;
  }

  return {
    displayLog,
    streams,
    convergence,
    profiles,
    kpis,
...(txy ? { txy } : {}),
...(parsed.componentMolarMass
      ? { componentMolarMass: {...parsed.componentMolarMass } }
    : {}),
...(parsed.utilityAllocation
      ? { utilityAllocation: parsed.utilityAllocation }
    : {}),
...(computed ? { computed } : {}),
...(parsed.timeline && parsed.timeline.length > 0
      ? { timeline: parsed.timeline }
    : {}),
...(parsed.advisories && parsed.advisories.length > 0
      ? { advisories: parsed.advisories }
    : {}),
...(parsed.modelBoundaries && parsed.modelBoundaries.length > 0
      ? { modelBoundaries: parsed.modelBoundaries }
    : {}),
...(operationResults ? { operationResults } : {}),
...(thermoResolution ? { thermoResolution } : {}),
...(componentCoverage ? { componentCoverage } : {}),
...(experimentalDatasets ? { experimentalDatasets } : {}),
...(validation ? { validation } : {}),
...(parsed.economics && parsed.economics.present !== false
      ? { economics: shapeEconomics(parsed.economics) }
    : {}),
  };
}

// Pass the emitted economics block through verbatim (the C++ already shapes it
// exactly: finite numbers, or null for IRR / payback when none exists).  We only
// re-assert the known fields so an unexpected payload can't leak untyped keys.
function shapeEconomics(e: NonNullable<ResultPayload["economics"]>): Economics {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const nn = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    currency: typeof e.currency === "string" ? e.currency : "EUR",
    FCI: n(e.FCI), WC: n(e.WC), TCI: n(e.TCI), COM_d: n(e.COM_d),
    revenue: n(e.revenue), depreciation: n(e.depreciation),
    NPV: n(e.NPV), IRR: nn(e.IRR), irrAmbiguous: !!e.irrAmbiguous,
    discountedPayback: nn(e.discountedPayback), simplePayback: nn(e.simplePayback),
    discountRate: n(e.discountRate), taxRate: n(e.taxRate),
    projectLife: n(e.projectLife), estimateClass: n(e.estimateClass),
    accLo: n(e.accLo), accHi: n(e.accHi),
    cashFlow: Array.isArray(e.cashFlow)
      ? e.cashFlow.map((r) => ({
          year: n(r.year), investment: n(r.investment), revenue: n(r.revenue),
          opex: n(r.opex), depreciation: n(r.depreciation),
          taxableIncome: n(r.taxableIncome), tax: n(r.tax),
          afterTaxProfit: n(r.afterTaxProfit), cashFlow: n(r.cashFlow),
          discountFactor: n(r.discountFactor), discountedCF: n(r.discountedCF),
          cumulativeDCF: n(r.cumulativeDCF),
        }))
      : [],
  };
}

interface ResultPayload {
  version: number;
  converged: boolean;
  components: string[];
  componentMolarMass?: { [comp: string]: number };
  streams: {
    [name: string]: {
      F: number;
      T: number;
      P: number;
      vf?: number;
      H?: number;
      H_kW?: number;
      F_mass?: number;
      F_solid_mass?: number;
      category?: string;
      composition: { [comp: string]: number };
      solids?: { [comp: string]: number };
      psd?: { diameter: number[]; massFrac: number[] };
      H_missing?: string[];
    };
  };
  kpis: { [unitName: string]: { [k: string]: number } };
  computed?: { [name: string]: number };
  timeline?: TimelineEvent[];
  advisories?: Advisory[];
  modelBoundaries?: ModelBoundary[];
  convergence?: { [unitName: string]: number[] };
  profiles?: {
    [unitName: string]: {
      xAxis: string;
      columns: { [name: string]: number[] };
      markers?: { x: number; label: string }[];
    };
  };
  txy?: {
    P: number;
    components: [string, string];
    xBubble: number[];
    Tbubble: number[];
    yDew: number[];
    Tdew: number[];
  };
  utilityAllocation?: UtilityAllocationRow[];
  operationResults?: { name: string; type: string; diagnostics: { [k: string]: number }; provenance?: { [k: string]: string } }[];
  thermoResolution?: { model: string; i: string; j: string; status: string;
    source: string; provSource: string; origin?: PairOrigin; method?: string;
    methodVersion?: string; validity?: ValidityDomain;
    promotedDespite?: PromotionOverride }[];
  componentCoverage?: { name: string; criticals: boolean; psat: boolean; vliq: boolean; cpIdealGas: boolean; gibbs: boolean; nonvolatile: boolean }[];
  experimentalDatasets?: { name: string; kind: string; component: string; source: string; citation: string; nPoints: number }[];
  validation?: {
    dataset: string; abscissa?: string;
    aad: { model: string; property?: string | null; kind?: string | null;
      aadAbs?: number | null; aadAbsUnit?: string | null; aadRelPct?: number | null;
      nMeas?: number; nUsed?: number; nOutOfRange?: number; nNearZeroSkipped?: number;
      nNonFinite?: number; status?: string }[];
  }[];
  economics?: {
    present?: boolean;
    currency?: string;
    FCI?: number; WC?: number; TCI?: number; COM_d?: number;
    revenue?: number; depreciation?: number; NPV?: number;
    IRR?: number | null; irrAmbiguous?: boolean;
    discountedPayback?: number | null; simplePayback?: number | null;
    discountRate?: number; taxRate?: number;
    projectLife?: number; estimateClass?: number; accLo?: number; accHi?: number;
    cashFlow?: { year: number; investment: number; revenue: number; opex: number;
      depreciation: number; taxableIncome: number; tax: number; afterTaxProfit: number;
      cashFlow: number; discountFactor: number; discountedCF: number;
      cumulativeDCF: number }[];
  };
}

export function shapeStreams(payload: ResultPayload,
  caseFiles: CaseFiles,
): StreamResult[] {
  // No streams from a choupoProps run --- the payload doesn't carry
  // them and there's no flowsheet to classify against.
  if (!payload.streams || !caseFiles.flowsheet) return [];

  // Role classification: two shapes to consider.
  //   1. FLAT case (no composite children): the case's `streams { ... }`
  //      block lists feeds explicitly; walk `units` to find which names
  //      are produced vs consumed.  Whatever is produced and never
  //      consumed is a product.
  //   2. COMPOSITE case (fractal, `children` + `connections` + `boundary`):
  //      the `boundary.inlets` are feeds and `boundary.outlets` are
  //      products by definition.  The unit walk below would miss them
  //      because composite roots have no `units` block.
  // The Mass-balance plot depends on this classification: a stream marked
  // "intermediate" is excluded from the plant-boundary totals.
  const fs = caseFiles.flowsheet;
  const feedStreams = (fs["streams"] ?? {}) as { [k: string]: unknown };
  const units = (fs["units"] ?? []) as Array<{
    in?: string | string[];
    inputs?: string[];
    outputs?: string[];
  }>;
  const consumed = new Set<string>();
  const produced = new Set<string>();
  for (const u of units) {
    // A unit's inlets come as `in` (single-input ops) OR `inputs` (multi-input
    // ops: mixer, multi-feed evaporator, ...).  Reading only `in` MISSED the
    // mixer feeds, so a stream consumed only via `inputs` (e.g. a pumped recycle
    // MeohRecycleHP, or a preheated feed HotCO/HotMethanol) looked
    // produced-but-not-consumed -> a false PRODUCT, inflating the mass-balance
    // plot's OUTPUTS bar.  Count both.
    const ins = Array.isArray(u.in) ? u.in : u.in ? [u.in] : [];
    for (const n of ins) consumed.add(n);
    for (const n of u.inputs ?? []) consumed.add(n);
    for (const n of u.outputs ?? []) produced.add(n);
  }
  // Composite-case boundary names (legacy boundary{} block, still honoured).
  const boundary = (fs["boundary"] ?? {}) as {
    inlets?: string[]; outlets?: string[];
  };
  const boundaryInlets = new Set<string>(boundary.inlets ?? []);
  const boundaryOutlets = new Set<string>(boundary.outlets ?? []);
  // Named-edge topology (the migrated model: no streams{}, no boundary{}).  A
  // to-only edge is a domain INLET (feed), a from-only edge a domain OUTLET
  // (product) -- role inferred from the graph, per the stream-state constitution.
  for (const e of readEdges(fs)) {
    if (!e.from && e.to) boundaryInlets.add(e.name);
    if (e.from && !e.to) boundaryOutlets.add(e.name);
  }
  // Tear streams: declared in `tearStreams (...)` AND in `streams {}`
  // (as initial guesses).  They are NOT feeds and NOT products even
  // though they show up in the streams block, because they are
  // INTERNAL recycle slots that get rewritten every outer-loop
  // iteration.  Misclassifying them as feeds doubled the INPUTS bar
  // of the Mass-balance plot for any sub-case containing a recycle.
  const tearStreams = new Set<string>(
    ((fs["tearStreams"] ?? []) as string[]),
  );
  // The qualified form a child composite produces ("FERMENTATION.Recycle")
  // appears in the JSON streams; map the bare tear name (just "Recycle")
  // to its qualified counterpart by leaf match.
  const tearLeafs = new Set([...tearStreams].map((t) => t.split(".").pop()!));

  const out: StreamResult[] = [];
  for (const [name, s] of Object.entries(payload.streams)) {
    const leaf = name.split(".").pop()!;
    const isTear = tearStreams.has(name) || tearLeafs.has(leaf);
    const isFeed = !isTear && (
      Object.prototype.hasOwnProperty.call(feedStreams, name)
      || boundaryInlets.has(name)
      // Topology (a migrated flat case has no streams{} block): a stream a unit
      // CONSUMES but no unit PRODUCES is a plant inlet -- symmetric to a product.
      || (consumed.has(name) && !produced.has(name))
    );
    const isProduct = !isTear && (
      boundaryOutlets.has(name)
      || (produced.has(name) && !consumed.has(name))
    );
    const role: StreamResult["role"] = isFeed
      ? "feed"
    : isProduct
        ? "product"
      : "intermediate";
    out.push({
      name,
      role,
      F: s.F,
      T: s.T,
      P: s.P,
      vf: s.vf,
      H: s.H,
      H_kW: s.H_kW,
      F_mass: s.F_mass,
      F_solid_mass: s.F_solid_mass,
      category: s.category,
      composition: {...s.composition },
      solids: s.solids ? {...s.solids } : undefined,
      psd: s.psd
        ? { diameter: [...s.psd.diameter], massFrac: [...s.psd.massFrac] }
        : undefined,
      H_missing: s.H_missing ? [...s.H_missing] : undefined,
    });
  }
  // Stable order: feed -> intermediate -> product, then alphabetical.
  const roleRank = { feed: 0, intermediate: 1, product: 2 } as const;
  out.sort((a, b) => roleRank[a.role] - roleRank[b.role] || a.name.localeCompare(b.name));
  return out;
}

function shapeConvergence(payload: ResultPayload): ConvergenceCurve[] {
  const conv = payload.convergence;
  if (!conv) return [];
  const out: ConvergenceCurve[] = [];
  for (const [unitName, residuals] of Object.entries(conv)) {
    if (residuals.length === 0) continue;
    out.push({ label: unitName, residuals: [...residuals] });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

function shapeProfiles(payload: ResultPayload): UnitProfile[] {
  const profs = payload.profiles;
  if (!profs) return [];
  const out: UnitProfile[] = [];
  for (const [unit, p] of Object.entries(profs)) {
    if (!p.xAxis || !p.columns) continue;
    const entry: UnitProfile = {
      unit,
      xAxis: p.xAxis,
      columns: {...p.columns },
    };
    if (p.markers && p.markers.length > 0) {
      entry.markers = p.markers.map((m) => ({ x: m.x, label: m.label }));
    }
    out.push(entry);
  }
  out.sort((a, b) => a.unit.localeCompare(b.unit));
  return out;
}

function shapeTxy(payload: ResultPayload): TxyData | undefined {
  const t = payload.txy;
  if (!t || t.xBubble.length === 0) return undefined;
  return {
    P: t.P,
    components: t.components,
    xBubble: [...t.xBubble],
    Tbubble: [...t.Tbubble],
    yDew: [...t.yDew],
    Tdew: [...t.Tdew],
  };
}


/**
 * Parse a trajectory.csv emitted by choupoBatch / choupoCtrl.
 *
 * Expected format:
 *     t,reactor.n_compA,reactor.n_compB,reactor.T,TC1.SP,TC1.PV,TC1.MV
 *     0.00000000e+00,1.20000000e-02,0.00000000e+00,3.20000000e+02,...
 *     2.50000000e+01,...
 *
 * The first column is always `t` (seconds); every other column is a
 * variable trace.  Returns null on malformed input.
 */
function parseTrajectoryCsv(csv: string): { t: number[]; vars: { [name: string]: number[] } } | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  if (header.length < 2 || header[0] !== "t") return null;

  const t: number[] = [];
  const vars: { [name: string]: number[] } = {};
  for (let i = 1; i < header.length; ++i) vars[header[i]!] = [];

  for (let r = 1; r < lines.length; ++r) {
    const cells = lines[r]!.split(",");
    if (cells.length !== header.length) continue;
    const tv = parseFloat(cells[0]!);
    if (!Number.isFinite(tv)) continue;
    t.push(tv);
    for (let c = 1; c < header.length; ++c) {
      const v = parseFloat(cells[c]!);
      vars[header[c]!]!.push(Number.isFinite(v) ? v : NaN);
    }
  }
  if (t.length === 0) return null;
  return { t, vars };
}
