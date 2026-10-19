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

import { shapeBuilding, type GmpBuilding } from "./buildingPayload.js";
import { readEdges } from "../case/toGraph.js";
import { fromJson, serialize } from "../dict/index.js";
import { parseDynamicInstants } from "../case/dynamicInstants.js";
import type { CaseFiles } from "../case/types.js";
import type { JsonDict } from "../dict/index.js";
import type { PairOrigin, ValidityDomain, PromotionOverride,
  EquipmentItem,
  GlobalEnergyBoundary,
  GlobalMassBoundary,
} from "./SolverAdapter.js";
import type {
  AadRecord,
  Advisory,
  Divergence,
  ComponentCoverage,
  ConvergenceCurve,
  Economics,
  EnergyRecord,
  PlantLayout,
  ExperimentalDataset,
  ValidationBlock,
  ModelBoundary,
  RecycleLoop,
  OperationResult,
  PairResolution,
  RunResult,
  SolverAdapter,
  StreamResult,
  TimelineEvent,
  TransferRecord,
  TxyData,
  UnitProfile,
  UtilityAllocationRow,
} from "./SolverAdapter.js";
import { WASM_WORKER_URL } from "./wasmModule.js";
import { countRunCase } from "../analytics.js";

// The markers the WASM solver wraps its structured-result JSON in.  Exported
// for tests; the C++ side prints these around the ResultEmitter JSON block.
export const BEGIN_MARK = "<<<Choupo:result-begin>>>";
export const END_MARK = "<<<Choupo:result-end>>>";

/** The WASM binaries the GUI can dispatch to (one EXPORT_NAME each). */
export type WasmBinary =
  | "choupoSolve"
  | "choupoBatch"
  | "choupoCtrl"
  | "choupoSemiContinuous"
  | "choupoProps";

/**
 * Pick the WASM binary for a case's `controlDict.application` value.
 *
 * choupoBatch -> batch + recipes (transient)
 * choupoCtrl  -> dynamic + control (transient)
 * choupoSemiContinuous -> transient flowsheet, no control loop (2026-09-20)
 * choupoProps -> property scans / fits
 * anything else (incl. undefined / "choupoSolve") -> choupoSolve, so a case
 * that omits `application` still runs the steady solver -- backwards compat.
 *
 * Exported pure so the dispatch is unit-testable without spawning a worker.
 */
export function selectBinary(app: unknown): WasmBinary {
  if (app === "choupoBatch" || app === "choupoCtrl"
      || app === "choupoSemiContinuous" || app === "choupoProps") {
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
  | { type: "convergedFiles"; files: { [relPath: string]: string } }
  | { type: "designFiles"; files: { [relPath: string]: string } }
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
      let convergedFiles: { [relPath: string]: string } | null = null;
      let designFiles: { [relPath: string]: string } | null = null;
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
        const { displayLog, streams, streamAliases, convergence, profiles, txy, componentMolarMass, unitSectors, equipment, kpis,
          utilityAllocation, globalEnergyBoundary, globalMassBoundary, computed, timeline, transfers, energyLedger, advisories, divergences, modelBoundaries, recycleLoops, operationResults, thermoResolution,
          componentCoverage, experimentalDatasets, validation, economics, layout, building } =
          extractStructured(log, caseFiles);
        const result: RunResult = { status, log: displayLog, streams, convergence };
        if (streamAliases) result.streamAliases = streamAliases;
        if (Object.keys(kpis).length > 0) result.kpis = kpis;
        if (profiles && profiles.length > 0) result.profiles = profiles;
        if (txy) result.txy = txy;
        if (componentMolarMass) result.componentMolarMass = componentMolarMass;
        if (unitSectors && Object.keys(unitSectors).length > 0) result.unitSectors = unitSectors;
        if (equipment && equipment.length > 0) result.equipment = equipment;
        if (utilityAllocation && utilityAllocation.length > 0) result.utilityAllocation = utilityAllocation;
        if (globalEnergyBoundary) result.globalEnergyBoundary = globalEnergyBoundary;
        if (globalMassBoundary) result.globalMassBoundary = globalMassBoundary;
        if (computed && Object.keys(computed).length > 0) result.computed = computed;
        if (timeline && timeline.length > 0) result.timeline = timeline;
        //  The two BATCH CAMPAIGN LEDGERS.  Carried SEPARATELY from the
        //  timeline they are projected into: the projection collapses the
        //  per-component `dn` to a total and drops the transported H_kJ
        //  entirely, so a reader that wants what MOVED and what it CARRIED
        //  has to read the ledger.  Absent stays absent -- never [].
        if (transfers && transfers.length > 0) result.transfers = transfers;
        if (energyLedger && energyLedger.length > 0)
          result.energyLedger = energyLedger;
        if (advisories && advisories.length > 0) result.advisories = advisories;
        if (divergences && divergences.length > 0) result.divergences = divergences;
        if (modelBoundaries && modelBoundaries.length > 0) result.modelBoundaries = modelBoundaries;
        if (recycleLoops && recycleLoops.length > 0) result.recycleLoops = recycleLoops;
        if (operationResults && operationResults.length > 0) result.operationResults = operationResults;
        if (thermoResolution && thermoResolution.length > 0) result.thermoResolution = thermoResolution;
        if (componentCoverage && componentCoverage.length > 0) result.componentCoverage = componentCoverage;
        if (experimentalDatasets && experimentalDatasets.length > 0) result.experimentalDatasets = experimentalDatasets;
        if (validation && validation.length > 0) result.validation = validation;
        if (economics) result.economics = economics;
        if (layout) result.layout = layout;
        if (building) result.building = building;
        if (trajectoryCsv) {
          const parsed = parseTrajectoryCsv(trajectoryCsv);
          if (parsed) result.trajectory = parsed;
        }
        if (csvFiles && Object.keys(csvFiles).length > 0) {
          result.csvFiles = csvFiles;
        }
        if (convergedFiles && Object.keys(convergedFiles).length > 0) {
          result.convergedFiles = convergedFiles;
        }
        //  Its own field, never folded into convergedFiles: that one's
        //  non-empty guard is read as "the run converged", and a case with
        //  no sizing pass must not look like a case that failed to solve.
        if (designFiles && Object.keys(designFiles).length > 0) {
          result.designFiles = designFiles;
        }
        //  Same rule, third tree: a case whose units publish no profile must
        //  not read as a case that failed to solve.
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
        } else if (msg.type === "convergedFiles") {
          convergedFiles = msg.files;
        } else if (msg.type === "designFiles") {
          designFiles = msg.files;
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

      countRunCase();
      worker.postMessage({
        type: "run",
        binary,
        files: serialiseCase(caseFiles),
      });
    });
  }
}

// Exported for the regression gate: the EXACT file map the worker receives
// (the incident class this guards: a synthesizer emitting a retired path).
export function serialiseCase(caseFiles: CaseFiles): { [path: string]: string } {
  const files: { [path: string]: string } = {
    "system/controlDict": dictToText(caseFiles.controlDict, "controlDict"),
  };
  // Real cases travel their authored dict text verbatim in extraFiles
  // (round-trip invariant); the STRUCTURED field is only populated by the
  // synthesizers (Explore / focus-tab), and it is a v2
  // thermophysicalPropertySystem -- the GUI never emits the retired
  // constant/propertyDict name.
  if (Object.keys(caseFiles.thermoPackage).length > 0)
    files["constant/thermoPhysPropDict"] =
      dictToText(caseFiles.thermoPackage, "thermoPhysPropDict");
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
  /** alias -> identity, for the names `streams` no longer carries a row for. */
  streamAliases?: { [alias: string]: string };
  convergence: ConvergenceCurve[];
  profiles: UnitProfile[];
  txy?: TxyData;
  componentMolarMass?: { [comp: string]: number };
  unitSectors?: { [unitName: string]: string };
  equipment?: EquipmentItem[];
  /** Per-unit KPIs (yield, supersaturation, Q_removed,...) -- empty {} when
   *  no JSON block or no kpis object in it. */
  kpis: { [unitName: string]: { [k: string]: number } };
  /** Per-duty utility allocation rows (which utility, kg/s, MW, EUR/h). */
  utilityAllocation?: UtilityAllocationRow[];
  globalEnergyBoundary?: GlobalEnergyBoundary;
  globalMassBoundary?: GlobalMassBoundary;
  /** Post-processing computed expressions (variables{} `compute` entries:
   *  W_net, eta_thermal,...), evaluated by the solver after the run. */
  computed?: { [name: string]: number };
  /** Batch campaign timeline (fired recipe actions + unit status events). */
  timeline?: TimelineEvent[];
  /** The batch MATERIAL ledger the timeline is a projection of. */
  transfers?: TransferRecord[];
  /** The batch ENERGY ledger (one record per segment of constant physics). */
  energyLedger?: EnergyRecord[];
  /** Solver advisories (bound active at the solution, rating, auto-init). */
  advisories?: Advisory[];
  divergences?: Divergence[];
  /** Model-boundary audit findings (adjacent units on different thermo models). */
  modelBoundaries?: ModelBoundary[];
  /** The loop each declared tear cuts (engine `recycleLoops`, C42). */
  recycleLoops?: RecycleLoop[];
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
  /** The plot plan the case declared (system/layoutDict), as checked. */
  layout?: PlantLayout;
  /** The GMP interior (`building {}`, DEV.md 4c C97), as checked. */
  building?: GmpBuilding;
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
  const streamAliases = shapeStreamAliases(parsed);
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
      //  THE CURATION AXIS (maturity, as words) and the op's own HEADLINE.
      //
      //  THIS REBUILD IS A CROSSING, AND A CROSSING DROPS WHAT IT WAS NOT
      //  TAUGHT -- silently, because an absent optional field is
      //  indistinguishable from one the engine did not send.  Both of these
      //  were being lost here:
      //
      //    `curation`  -- added 2026-09-04 so a fit's VERDICT could reach a
      //                   program.  The engine published it, the type declared
      //                   it, FitStatsPanel drew it, and this loop threw it
      //                   away, so in the BROWSER the badge never appeared.
      //                   Found the same day, by reading the crossing rather
      //                   than trusting that publishing was enough.
      //    `headline`  -- PRE-EXISTING, and older.  It is the op's own ranking
      //                   of its answer -- which diagnostics ARE the answer --
      //                   and `PropsView` reads `op.headline` to emphasise
      //                   them.  choupoProps REFUSES at runtime when an op
      //                   declares a headline it did not publish, so the
      //                   engine treats it as a contract; the browser had
      //                   simply never received it.
      //
      //  `check_operation_result_crossing` now holds this loop to the fields
      //  the TYPE declares, so the next one added cannot go missing quietly.
      const cur: { [k: string]: string } = {};
      for (const [k, v] of Object.entries(orr.curation ?? {})) {
        if (typeof v === "string") cur[k] = v;
      }
      const head = Array.isArray(orr.headline)
        ? orr.headline.filter((h: unknown): h is string => typeof h === "string")
        : [];
      rows.push({
        name: orr.name, type: orr.type ?? "", diagnostics: clean,
        ...(head.length > 0 ? { headline: head } : {}),
        ...(Object.keys(prov).length > 0 ? { provenance: prov } : {}),
        ...(Object.keys(cur).length > 0 ? { curation: cur } : {}),
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
    ...(streamAliases ? { streamAliases } : {}),
    convergence,
    profiles,
    kpis,
...(txy ? { txy } : {}),
...(parsed.unitSectors
      ? { unitSectors: { ...parsed.unitSectors } }
      : {}),
...(parsed.equipment && parsed.equipment.length > 0
      ? { equipment: parsed.equipment }
      : {}),
    ...(parsed.componentMolarMass
      ? { componentMolarMass: {...parsed.componentMolarMass } }
    : {}),
...(parsed.utilityAllocation
      ? { utilityAllocation: parsed.utilityAllocation }
    : {}),
...(parsed.globalEnergyBoundary
      ? { globalEnergyBoundary: parsed.globalEnergyBoundary }
    : {}),
...(parsed.globalMassBoundary
      ? { globalMassBoundary: parsed.globalMassBoundary }
    : {}),
...(computed ? { computed } : {}),
...(parsed.timeline && parsed.timeline.length > 0
      ? { timeline: parsed.timeline }
    : {}),
...(parsed.transfers && parsed.transfers.length > 0
      ? { transfers: parsed.transfers }
    : {}),
...(parsed.energyLedger && parsed.energyLedger.length > 0
      ? { energyLedger: parsed.energyLedger }
    : {}),
...(parsed.advisories && parsed.advisories.length > 0
      ? { advisories: parsed.advisories }
    : {}),
...(parsed.problemDivergence && parsed.problemDivergence.length > 0
      ? { divergences: parsed.problemDivergence }
    : {}),
...(parsed.modelBoundaries && parsed.modelBoundaries.length > 0
      ? { modelBoundaries: parsed.modelBoundaries }
    : {}),
...(parsed.recycleLoops && parsed.recycleLoops.length > 0
      ? { recycleLoops: parsed.recycleLoops }
    : {}),
...(operationResults ? { operationResults } : {}),
...(thermoResolution ? { thermoResolution } : {}),
...(componentCoverage ? { componentCoverage } : {}),
...(experimentalDatasets ? { experimentalDatasets } : {}),
...(validation ? { validation } : {}),
...(parsed.economics && parsed.economics.present !== false
      ? { economics: shapeEconomics(parsed.economics) }
    : {}),
...(parsed.layout ? { layout: shapeLayout(parsed.layout) } : {}),
...(parsed.building && shapeBuilding(parsed.building)
      ? { building: shapeBuilding(parsed.building) } : {}),
  };
}

//  THE PLANT LAYOUT (DEV.md 4c C75), passed through as the engine wrote it.
//  Only the TYPES are policed here: an item whose position or extents are not
//  finite numbers is DROPPED rather than drawn at the origin, because a box at
//  (0, 0, 0) would read as a placement the case never made.  Nothing is
//  computed -- no footprint, no distance, no finding.
function shapeLayout(l: NonNullable<ResultPayload["layout"]>): PlantLayout {
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const items = arr(l.items)
    .filter((i) => typeof i.id === "string"
      && [i.x, i.y, i.z, i.dx, i.dy, i.dz].every(fin))
    .map((i) => ({
      id: str(i.id), nonProcess: !!i.nonProcess, kind: str(i.kind),
      sector: str(i.sector),
      shape: (i.shape === "box" ? "box" : "cylinder") as "box" | "cylinder",
      orientation: (i.orientation === "alongX" || i.orientation === "alongY"
        ? i.orientation : "vertical") as "vertical" | "alongX" | "alongY",
      footprintFrom: (i.footprintFrom === "declared" ? "declared" : "published") as
        "declared" | "published",
      x: i.x as number, y: i.y as number, z: i.z as number,
      dx: i.dx as number, dy: i.dy as number, dz: i.dz as number,
      ...(typeof i.ignition === "string" && i.ignition ? { ignition: i.ignition } : {}),
      ...(typeof i.source === "string" && i.source
        ? { source: i.source, reason: str(i.reason) } : {}),
      ...(i.release ? { release: {
        source: str(i.release.source), reason: str(i.release.reason),
        zones: arr(i.release.zones).filter((z) => fin(z.radius) && fin(z.height))
          .map((z) => ({ zone: fin(z.zone) ? z.zone : 2,
                         radius: z.radius as number, height: z.height as number })),
      } } : {}),
    }));
  const w = l.wind;
  return {
    items,
    areas: arr(l.areas).filter((a) => [a.xMin, a.xMax, a.yMin, a.yMax].every(fin))
      .map((a) => ({ sector: str(a.sector), xMin: a.xMin as number, xMax: a.xMax as number,
                     yMin: a.yMin as number, yMax: a.yMax as number })),
    separation: arr(l.separation).map((t) => ({
      source: str(t.source), reason: str(t.reason), measure: str(t.measure),
      rules: arr(t.rules).filter((r) => fin(r.distance))
        .map((r) => ({ a: str(r.a), b: str(r.b), distance: r.distance as number })),
    })),
    ...(w && [w.from, w.planNorth, w.halfAngle, w.reach].every(fin)
      ? { wind: { from: w.from as number, planNorth: w.planNorth as number,
                  halfAngle: w.halfAngle as number, reach: w.reach as number,
                  source: str(w.source), reason: str(w.reason) } }
      : {}),
    findings: arr(l.findings).map((f) => ({
      id: str(f.id), kind: str(f.kind), a: str(f.a), b: str(f.b),
      value: fin(f.value) ? f.value : NaN, limit: fin(f.limit) ? f.limit : NaN,
      message: str(f.message),
    })),
    unplaced: arr(l.unplaced).filter((u): u is string => typeof u === "string"),
    internal: arr(l.internal).filter((u): u is string => typeof u === "string"),
    ...shapePipes(l),
    ...shapeSummary(l),
    ...shapePlot(l),
    ...shapeRoads(l),
    ...shapeFence(l),
    ...shapeSiteLogistics(l),
  };
}

//  THE TRUCKS AND THE CAR PARKS (DEV.md 4c C96), passed through as the engine
//  walked and laid them out.  A route whose length or any path point is not
//  finite, a corner or a bay whose position is not, is DROPPED rather than
//  drawn at the origin.  Nothing is walked or measured here.
function shapeSiteLogistics(l: NonNullable<ResultPayload["layout"]>): Partial<PlantLayout> {
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const words = (v: unknown): string[] =>
    (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const out: Partial<PlantLayout> = {};
  const dv = l.designVehicle;
  if (dv && fin(dv.turningDiameter))
    out.designVehicle = { turningDiameter: dv.turningDiameter, source: str(dv.source),
                          reason: str(dv.reason), rule: str(dv.rule) };
  if (Array.isArray(l.turningAreas))
    out.turningAreas = l.turningAreas.filter((t) => [t.x, t.y, t.diameter].every(fin))
      .map((t) => ({ area: str(t.area), x: t.x as number, y: t.y as number,
                     diameter: t.diameter as number, reason: str(t.reason) }));
  if (Array.isArray(l.truckRoutes))
    out.truckRoutes = l.truckRoutes
      .filter((t) => fin(t.length) && Array.isArray(t.path) && t.path.length >= 2
        && t.path.every((q) => Array.isArray(q) && q.length === 2 && q.every(fin)))
      .map((t) => ({
        route: str(t.route), from: str(t.from), to: str(t.to),
        verdict: (t.verdict === "clear" ? "clear" : "announced") as "clear" | "announced",
        length: t.length as number, turns: fin(t.turns) ? t.turns : 0,
        reversals: fin(t.reversals) ? t.reversals : 0, weighbridge: str(t.weighbridge),
        reason: str(t.reason), roads: words(t.roads), serves: words(t.serves),
        path: (t.path as number[][]).map((q) => [q[0], q[1]] as [number, number]),
      }));
  if (Array.isArray(l.routeCorners))
    out.routeCorners = l.routeCorners
      .filter((c) => [c.x, c.y, c.radius, c.outerRadius, c.required].every(fin))
      .map((c) => ({
        route: str(c.route),
        turn: (c.turn === "left" || c.turn === "reverse" ? c.turn : "right") as
          "left" | "right" | "reverse",
        inRoad: str(c.inRoad), outRoad: str(c.outRoad), x: c.x as number, y: c.y as number,
        radius: c.radius as number, outerRadius: c.outerRadius as number,
        required: c.required as number, turningArea: str(c.turningArea), ok: c.ok !== false,
      }));
  if (Array.isArray(l.carParks))
    out.carParks = l.carParks
      .filter((c) => [c.bays, c.capacity, c.bayWidth, c.bayLength, c.area].every(fin))
      .map((c) => ({
        item: str(c.item), bays: c.bays as number, capacity: c.capacity as number,
        rows: fin(c.rows) ? c.rows : 0, perRow: fin(c.perRow) ? c.perRow : 0,
        bayWidth: c.bayWidth as number, bayLength: c.bayLength as number,
        aisle: fin(c.aisle) ? c.aisle : 0, angle: fin(c.angle) ? c.angle : 90,
        arrangement: (c.arrangement === "driveThrough" ? "driveThrough" : "doubleLoaded") as
          "doubleLoaded" | "driveThrough",
        entry: (c.entry === "forward" ? "forward" : "reverse") as "reverse" | "forward",
        exitsForward: !!c.exitsForward, depth: fin(c.depth) ? c.depth : 0,
        pitch: fin(c.pitch) ? c.pitch : 0,
        usableLength: fin(c.usableLength) ? c.usableLength : 0, area: c.area as number,
        source: str(c.source), reason: str(c.reason),
        stalls: arr(c.stalls).filter((q) => Array.isArray(q) && q.length === 4 && q.every(fin))
          .map((q) => [q[0], q[1], q[2], q[3]] as [number, number, number, number]),
      }));
  return out;
}

//  THE FENCE (DEV.md 4c C93), passed through as the engine drew it.  A fence
//  whose rectangle or length is not finite leaves the whole block absent; an
//  opening or a crossing whose position is not finite is DROPPED rather than
//  drawn at the origin.  No position is computed here.
function shapeFence(l: NonNullable<ResultPayload["layout"]>): Partial<PlantLayout> {
  const f = l.fence;
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  if (!f || ![f.inset, f.xMin, f.xMax, f.yMin, f.yMax, f.length].every(fin)) return {};
  type Side = "north" | "south" | "east" | "west";
  const side = (s: unknown): Side =>
    (s === "north" || s === "east" || s === "west" ? s : "south") as Side;
  return {
    fence: {
      inset: f.inset as number, insetDeclared: !!f.insetDeclared,
      xMin: f.xMin as number, xMax: f.xMax as number, yMin: f.yMin as number,
      yMax: f.yMax as number, length: f.length as number,
      source: str(f.source), reason: str(f.reason), rule: str(f.rule),
    },
    fenceOpenings: arr(l.fenceOpenings).filter((o) => [o.x, o.y, o.width].every(fin))
      .map((o) => ({ gate: str(o.gate), side: side(o.side), x: o.x as number,
                     y: o.y as number, width: o.width as number, road: str(o.road),
                     gateDistance: fin(o.gateDistance) ? o.gateDistance : NaN,
                     //  C96: the approach, absent on a result written before it.
                     ...(fin(o.approach) && fin(o.approachX) && fin(o.approachY)
                       ? { approach: o.approach, approachX: o.approachX,
                           approachY: o.approachY } : {}) })),
    fenceCrossings: arr(l.fenceCrossings).filter((c) => [c.x, c.y, c.z].every(fin))
      .map((c) => ({
        stream: str(c.stream), direction: (c.direction === "out" ? "out" : "in") as "in" | "out",
        side: side(c.side), x: c.x as number, y: c.y as number, z: c.z as number,
        positionFrom: (c.positionFrom === "declared" || c.positionFrom === "waypoints"
          ? c.positionFrom : "statedDefault") as "declared" | "statedDefault" | "waypoints",
        labelDeclared: !!c.labelDeclared, label: str(c.label),
      })),
  };
}

//  THE ROADS (DEV.md 4c C90), passed through as the engine checked them.  A
//  road whose width, length or any centre-line point is not a finite number
//  is DROPPED rather than drawn through the origin; the network line, absent
//  or not finite, leaves the whole block absent.  Nothing is measured here.
function shapeRoads(l: NonNullable<ResultPayload["layout"]>): Partial<PlantLayout> {
  const n = l.roadNetwork;
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  if (!n || ![n.headroom, n.accessDistance, n.length, n.pavedArea].every(fin)) return {};
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    roadNetwork: {
      headroom: n.headroom as number, accessDistance: n.accessDistance as number,
      noTraffic: arr(n.noTraffic).filter(fin),
      entrances: arr(n.entrances).filter((e): e is string => typeof e === "string"),
      roads: fin(n.roads) ? n.roads : 0, components: fin(n.components) ? n.components : 0,
      length: n.length as number, pavedArea: n.pavedArea as number,
      source: str(n.source), reason: str(n.reason),
      accessSource: str(n.accessSource), accessReason: str(n.accessReason),
    },
    roads: arr(l.roads)
      .filter((r) => typeof r.road === "string" && fin(r.width) && fin(r.length)
        && Array.isArray(r.centreline) && r.centreline.length >= 2
        && r.centreline.every((q) => Array.isArray(q) && q.length === 2 && q.every(fin)))
      .map((r) => ({
        road: str(r.road), width: r.width as number, length: r.length as number,
        component: fin(r.component) ? r.component : 0, fromEntrance: r.fromEntrance !== false,
        reason: str(r.reason),
        //  C96: absent on a result written before it.
        ...(fin(r.cornerRadius) ? { cornerRadius: r.cornerRadius,
                                    cornerRadiusDeclared: !!r.cornerRadiusDeclared } : {}),
        ...(typeof r.oneWay === "boolean" ? { oneWay: r.oneWay } : {}),
        centreline: (r.centreline as number[][]).map((q) => [q[0], q[1]] as [number, number]),
      })),
    rackCrossings: arr(l.rackCrossings)
      .filter((c) => [c.xMin, c.xMax, c.yMin, c.yMax, c.clearance].every(fin))
      .map((c) => ({ road: str(c.road), xMin: c.xMin as number, xMax: c.xMax as number,
                     yMin: c.yMin as number, yMax: c.yMax as number,
                     clearance: c.clearance as number })),
    access: arr(l.access).filter((a) => typeof a.item === "string").map((a) => ({
      item: str(a.item), road: str(a.road),
      ...(fin(a.distance) ? { distance: a.distance } : {}),
      ...(fin(a.roadX) && fin(a.roadY) ? { roadX: a.roadX, roadY: a.roadY } : {}),
      ...(a.onDeck ? { onDeck: true } : {}),
    })),
  };
}

//  THE PLOT (DEV.md 4c C82), passed through as the engine published it.  A
//  plot whose rectangle or areas are not finite numbers is absent rather than
//  drawn at zero; a sector row likewise.  No area is computed here.
function shapePlot(l: NonNullable<ResultPayload["layout"]>): Partial<PlantLayout> {
  const p = l.plot;
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  if (!p || ![p.margin, p.xMin, p.xMax, p.yMin, p.yMax, p.plotArea, p.footprintArea,
               p.footprintShare].every(fin)) return {};
  return { plot: {
    margin: p.margin as number, marginDeclared: !!p.marginDeclared,
    marginReason: str(p.marginReason),
    xMin: p.xMin as number, xMax: p.xMax as number, yMin: p.yMin as number,
    yMax: p.yMax as number, plotArea: p.plotArea as number,
    footprintArea: p.footprintArea as number,
    footprintShare: p.footprintShare as number,
    stackedPairs: fin(p.stackedPairs) ? p.stackedPairs : 0,
    declaredAreasUnion: fin(p.declaredAreasUnion) ? p.declaredAreasUnion : 0,
    declaredAreasOverlap: fin(p.declaredAreasOverlap) ? p.declaredAreasOverlap : 0,
    rule: str(p.rule),
    sectors: (Array.isArray(l.plotSectors) ? l.plotSectors : [])
      .filter((s) => typeof s.sector === "string" && fin(s.plotArea) && fin(s.footprintArea))
      .map((s) => ({ sector: str(s.sector), from: str(s.from),
                     plotArea: s.plotArea as number, footprintArea: s.footprintArea as number })),
  } };
}

//  THE PIPES (DEV.md 4c C80), passed through as routed by the engine.  A pipe
//  whose length or any route point is not a finite number is DROPPED rather
//  than drawn through the origin; nothing is routed or measured here.
function shapePipes(l: NonNullable<ResultPayload["layout"]>): Partial<PlantLayout> {
  if (!Array.isArray(l.pipes)) return {};
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const k = l.pipeRack;
  const rack = k && [k.y, k.elevation, k.laneSpacing, k.lanesPerTier, k.tierSpacing,
                     k.xStart, k.xEnd].every(fin)
    ? { pipeRack: { declared: !!k.declared, y: k.y as number, elevation: k.elevation as number,
        laneSpacing: k.laneSpacing as number, lanesPerTier: k.lanesPerTier as number,
        tierSpacing: k.tierSpacing as number, xStart: k.xStart as number,
        xEnd: k.xEnd as number, reason: str(k.reason) } }
    : {};
  const pipes = l.pipes
    .filter((p) => typeof p.stream === "string" && fin(p.length) && Array.isArray(p.route)
      && p.route.length >= 2
      && p.route.every((q) => Array.isArray(q) && q.length === 3 && q.every(fin)))
    .map((p) => ({
      stream: str(p.stream),
      ...(typeof p.label === "string" && p.label ? { label: p.label } : {}),
      fromKind: str(p.fromKind), from: str(p.from), fromUnit: str(p.fromUnit),
      toKind: str(p.toKind), to: str(p.to), toUnit: str(p.toUnit),
      routedBy: str(p.routedBy), lane: fin(p.lane) ? p.lane : -1,
      length: p.length as number,
      ...(fin(p.F_mass) ? { F_mass: p.F_mass } : {}),
      ...(fin(p.T) ? { T: p.T } : {}),
      ...(fin(p.P) ? { P: p.P } : {}),
      ...(fin(p.vf) ? { vf: p.vf } : {}),
      route: (p.route as number[][]).map((q) => [q[0], q[1], q[2]] as [number, number, number]),
    }));
  return {
    ...rack,
    junctions: (Array.isArray(l.junctions) ? l.junctions : [])
      .filter((j) => [j.x, j.y, j.z].every(fin))
      .map((j) => ({ unit: str(j.unit), type: str(j.type),
                     x: j.x as number, y: j.y as number, z: j.z as number })),
    pipes,
    notRouted: (Array.isArray(l.notRouted) ? l.notRouted : [])
      .map((n) => {
        const a = Array.isArray(n.anchor) && n.anchor.length === 3 && n.anchor.every(fin)
          ? (n.anchor as [number, number, number]) : undefined;
        return { stream: str(n.stream), reason: str(n.reason),
                 //  Absent on a result written before C93: left absent.
                 ...(typeof n.fromUnit === "string" ? { fromUnit: n.fromUnit } : {}),
                 ...(typeof n.toUnit === "string" ? { toUnit: n.toUnit } : {}),
                 ...(n.solids === true ? { solids: true } : {}),
                 ...(a ? { anchor: a } : {}) };
      }),
  };
}

//  THE SUMMARY the engine counts (placed, unplaced, internal, findings,
//  pipes, notRouted, pipeLength): carried so a surface that SHOWS a count --
//  the exported page's footer (DEV.md 4c C81) -- reads the engine's, never
//  one it re-counted.  Absent, or with any count not a finite number: absent.
function shapeSummary(l: NonNullable<ResultPayload["layout"]>): Partial<PlantLayout> {
  const s = l.summary;
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!s || ![s.placed, s.unplaced, s.internal, s.findings, s.pipes, s.notRouted,
               s.pipeLength].every(fin)) return {};
  return { summary: { placed: s.placed as number, unplaced: s.unplaced as number,
    internal: s.internal as number, findings: s.findings as number, pipes: s.pipes as number,
    notRouted: s.notRouted as number, pipeLength: s.pipeLength as number } };
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
          //  The start-up years (C63): the engine writes these two keys
          //  only when the case declared a timeline, so their ABSENCE is
          //  kept as absence rather than read as a zero.
          ...(typeof r.productionFraction === "number"
            ? { productionFraction: r.productionFraction } : {}),
          ...(typeof r.startupCost === "number"
            ? { startupCost: r.startupCost } : {}),
          //  The land (C82): written only when the case declared a price.
          ...(typeof r.land === "number" ? { land: r.land } : {}),
          taxableIncome: n(r.taxableIncome), tax: n(r.tax),
          afterTaxProfit: n(r.afterTaxProfit), cashFlow: n(r.cashFlow),
          discountFactor: n(r.discountFactor), discountedCF: n(r.discountedCF),
          cumulativeDCF: n(r.cumulativeDCF),
        }))
      : [],
    //  The land (C82): the engine writes the key only when the case declared
    //  a land price, so its ABSENCE stays absence -- no zero-cost land line.
    ...(e.land && typeof e.land.cost === "number" && Number.isFinite(e.land.cost)
      ? { land: {
          price: n(e.land.price), area: n(e.land.area),
          areaFrom: typeof e.land.areaFrom === "string" ? e.land.areaFrom : "",
          cost: e.land.cost, investedAtYear: n(e.land.investedAtYear),
          recoveredAtYear: n(e.land.recoveredAtYear),
          source: typeof e.land.source === "string" ? e.land.source : "",
          reason: typeof e.land.reason === "string" ? e.land.reason : "",
        } } : {}),
    //  The sensitivity (C68): the engine writes the key only when the case
    //  declared the block, so its ABSENCE stays absence -- no empty tornado.
    ...(e.sensitivity ? { sensitivity: shapeSensitivity(e.sensitivity) } : {}),
  };
}

//  The sensitivity rows in the order the engine published them (tornado
//  order -- the engine's sort, never redone here).  A row whose NPV is not a
//  finite number is DROPPED rather than drawn at zero: a bar at the base NPV
//  would read as "this input does not matter".
function shapeSensitivity(
  s: NonNullable<NonNullable<ResultPayload["economics"]>["sensitivity"]>,
): NonNullable<Economics["sensitivity"]> {
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    caveat: str(s.caveat),
    inputs: (Array.isArray(s.inputs) ? s.inputs : [])
      .filter((r) => fin(r.NPV_low) && fin(r.NPV_high) && typeof r.input === "string")
      .map((r) => ({
        input: str(r.input), kpiKey: str(r.kpiKey), mode: str(r.mode),
        fromBand: !!r.fromBand,
        declaredLow: fin(r.declaredLow) ? r.declaredLow : NaN,
        declaredHigh: fin(r.declaredHigh) ? r.declaredHigh : NaN,
        unit: str(r.unit),
        baseValue: fin(r.baseValue) ? r.baseValue : NaN,
        valueLow: fin(r.valueLow) ? r.valueLow : NaN,
        valueHigh: fin(r.valueHigh) ? r.valueHigh : NaN,
        NPV_low: r.NPV_low as number, NPV_high: r.NPV_high as number,
        NPVswing: fin(r.NPVswing) ? r.NPVswing : NaN,
        NPVsignFlip: str(r.NPVsignFlip),
      })),
  };
}

interface ResultPayload {
  /** The GMP interior (DEV.md 4c C97), shaped by adapters/buildingPayload. */
  building?: unknown;
  version: number;
  converged: boolean;
  components: string[];
  componentMolarMass?: { [comp: string]: number };
  unitSectors?: { [unitName: string]: string };
  equipment?: EquipmentItem[];
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
      /** Set when this entry is one of the OTHER names a stream answers to:
       *  the identity it copies.  The engine decides which names are labels
       *  (`SimulationResult::boundaryAliases`); a reader drawing a table skips
       *  these so one pipe gets one row. */
      aliasOf?: string;
      /** The DOMAIN'S OWN outlet name for this stream, when the plant gave it
       *  one (`DRYING.DryPowder` -> `Powder`).  Present on the identity, never
       *  on a label entry. */
      boundaryLabel?: string;
      /** The DECLARED utility circuit this stream belongs to, when the case
       *  declares one.  The engine decides; the GUI groups by it. */
      utilityCircuit?: string;
      composition: { [comp: string]: number };
      solids?: { [comp: string]: number };
      psd?: { diameter: number[]; massFrac: number[] };
      H_missing?: string[];
      speciation?: {
        network: string;
        basis: string;
        pH?: number;
        flows: { [species: string]: number };
      };
      organicLiquid?: { [component: string]: number };
    };
  };
  kpis: { [unitName: string]: { [k: string]: number } };
  computed?: { [name: string]: number };
  timeline?: TimelineEvent[];
  transfers?: TransferRecord[];
  energyLedger?: EnergyRecord[];
  advisories?: Advisory[];
  /** the engine's `problemDivergence` array -- a separate channel from the
   *  advisories, carried under its JSON name here and renamed at the seam. */
  problemDivergence?: Divergence[];
  modelBoundaries?: ModelBoundary[];
  recycleLoops?: RecycleLoop[];
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
  globalEnergyBoundary?: GlobalEnergyBoundary;
  globalMassBoundary?: GlobalMassBoundary;
  //  DERIVED FROM THE CONTRACT, never re-spelled.  This used to list the row's
  //  fields a SECOND time -- so the shape lived in three places (the
  //  `OperationResult` interface, this parsed shape, and the rebuild below)
  //  and a field added to the first reached neither of the others.  `Partial`
  //  is the honest modifier: this describes what a worker MIGHT have sent, and
  //  every field is validated by type before it is carried across.
  operationResults?: Partial<OperationResult>[];
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
  layout?: {
    items?: { id?: string; nonProcess?: boolean; kind?: string; sector?: string;
      shape?: string; orientation?: string; footprintFrom?: string;
      x?: number; y?: number; z?: number; dx?: number; dy?: number; dz?: number;
      ignition?: string; source?: string; reason?: string;
      release?: { source?: string; reason?: string;
        zones?: { zone?: number; radius?: number; height?: number }[] } }[];
    areas?: { sector?: string; xMin?: number; xMax?: number; yMin?: number; yMax?: number }[];
    separation?: { source?: string; reason?: string; measure?: string;
      rules?: { a?: string; b?: string; distance?: number }[] }[];
    wind?: { from?: number; planNorth?: number; halfAngle?: number; reach?: number;
      source?: string; reason?: string };
    findings?: { id?: string; kind?: string; a?: string; b?: string;
      value?: number; limit?: number; message?: string }[];
    unplaced?: string[];
    internal?: string[];
    pipeRack?: { declared?: boolean; y?: number; elevation?: number; laneSpacing?: number;
      lanesPerTier?: number; tierSpacing?: number; xStart?: number; xEnd?: number;
      reason?: string };
    junctions?: { unit?: string; type?: string; x?: number; y?: number; z?: number }[];
    pipes?: { stream?: string; label?: string; fromKind?: string; from?: string;
      fromUnit?: string; toKind?: string; to?: string; toUnit?: string;
      routedBy?: string; lane?: number; length?: number;
      F_mass?: number; T?: number; P?: number; vf?: number;
      route?: number[][] }[];
    notRouted?: { stream?: string; reason?: string; fromUnit?: string; toUnit?: string;
                  solids?: boolean;
      anchor?: unknown[] }[];
    summary?: { placed?: number; unplaced?: number; internal?: number; findings?: number;
      pipes?: number; notRouted?: number; pipeLength?: number };
    plot?: { margin?: number; marginDeclared?: boolean; marginReason?: string;
      xMin?: number; xMax?: number; yMin?: number; yMax?: number;
      plotArea?: number; footprintArea?: number; footprintShare?: number;
      stackedPairs?: number;
      declaredAreasUnion?: number; declaredAreasOverlap?: number; rule?: string };
    plotSectors?: { sector?: string; from?: string; plotArea?: number;
      footprintArea?: number }[];
    roadNetwork?: { headroom?: number; accessDistance?: number; noTraffic?: number[];
      entrances?: string[]; roads?: number; components?: number; length?: number;
      pavedArea?: number; source?: string; reason?: string; accessSource?: string;
      accessReason?: string };
    roads?: { road?: string; width?: number; length?: number; component?: number;
      fromEntrance?: boolean; reason?: string; centreline?: number[][];
      cornerRadius?: number; cornerRadiusDeclared?: boolean; oneWay?: boolean }[];
    rackCrossings?: { road?: string; xMin?: number; xMax?: number; yMin?: number;
      yMax?: number; clearance?: number }[];
    access?: { item?: string; road?: string; distance?: number; roadX?: number;
      roadY?: number; onDeck?: boolean }[];
    fence?: { inset?: number; insetDeclared?: boolean; xMin?: number; xMax?: number;
      yMin?: number; yMax?: number; length?: number; source?: string; reason?: string;
      rule?: string };
    fenceOpenings?: { gate?: string; side?: string; x?: number; y?: number;
      width?: number; road?: string; gateDistance?: number;
      approachX?: number; approachY?: number; approach?: number }[];
    fenceCrossings?: { stream?: string; direction?: string; side?: string; x?: number;
      y?: number; z?: number; positionFrom?: string; labelDeclared?: boolean;
      label?: string }[];
    designVehicle?: { turningDiameter?: number; source?: string; reason?: string;
      rule?: string };
    turningAreas?: { area?: string; x?: number; y?: number; diameter?: number;
      reason?: string }[];
    truckRoutes?: { route?: string; from?: string; to?: string; verdict?: string;
      length?: number; turns?: number; reversals?: number; weighbridge?: string;
      reason?: string; roads?: unknown; serves?: unknown; path?: number[][] }[];
    routeCorners?: { route?: string; turn?: string; inRoad?: string; outRoad?: string;
      x?: number; y?: number; radius?: number; outerRadius?: number; required?: number;
      turningArea?: string; ok?: boolean }[];
    carParks?: { item?: string; bays?: number; capacity?: number; rows?: number;
      perRow?: number; bayWidth?: number; bayLength?: number; aisle?: number;
      angle?: number; arrangement?: string; entry?: string; exitsForward?: boolean;
      depth?: number; pitch?: number; usableLength?: number; area?: number;
      source?: string; reason?: string; stalls?: number[][] }[];
  };
  economics?: {
    present?: boolean;
    currency?: string;
    FCI?: number; WC?: number; TCI?: number; COM_d?: number;
    revenue?: number; depreciation?: number; NPV?: number;
    IRR?: number | null; irrAmbiguous?: boolean;
    discountedPayback?: number | null; simplePayback?: number | null;
    discountRate?: number; taxRate?: number;
    projectLife?: number; estimateClass?: number; accLo?: number; accHi?: number;
    land?: { price?: number; area?: number; areaFrom?: string; cost?: number;
      investedAtYear?: number; recoveredAtYear?: number; source?: string; reason?: string };
    cashFlow?: { year: number; investment: number; revenue: number; opex: number;
      productionFraction?: number; startupCost?: number; land?: number;
      depreciation: number; taxableIncome: number; tax: number; afterTaxProfit: number;
      cashFlow: number; discountFactor: number; discountedCF: number;
      cumulativeDCF: number }[];
    sensitivity?: {
      caveat?: string;
      inputs?: { input?: string; kpiKey?: string; mode?: string; fromBand?: boolean;
        declaredLow?: number; declaredHigh?: number; unit?: string;
        baseValue?: number; valueLow?: number; valueHigh?: number;
        NPV_low?: number | null; NPV_high?: number | null; NPVswing?: number | null;
        NPVsignFlip?: string }[];
    };
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
  //   2. COMPOSITE case (sectored, `children` + `connections` + `boundary`):
  //      the `boundary.inlets` are feeds and `boundary.outlets` are
  //      products by definition.  The unit walk below would miss them
  //      because composite roots have no `units` block.
  // The Mass-balance plot depends on this classification: a stream marked
  // "intermediate" is excluded from the plant-boundary totals.
  const fs = caseFiles.flowsheet;
  const units = (fs["units"] ?? []) as Array<{
    in?: string | string[];
    inputs?: string[];
    outputs?: string[];
  }>;
  const consumed = new Set<string>();
  const produced = new Set<string>();
  const consumedByObserver = new Set<string>();
  const consumedByTransformer = new Set<string>();
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
    // Observer classification (mirrors src/reporting/Topology.H): a unit
    // with inputs and NO material outputs -- `outputs ( )`, a saturation
    // calculation -- interrogates a state and transforms no matter.
    const allIns = [...ins, ...(u.inputs ?? [])];
    const isObserver = allIns.length > 0 && (u.outputs ?? []).length === 0;
    for (const n of allIns)
      (isObserver ? consumedByObserver : consumedByTransformer).add(n);
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
  // Tear streams (declared in `tearStreams (...)`) are NOT feeds and NOT
  // products: they are INTERNAL recycle slots that get rewritten every
  // outer-loop iteration.  Misclassifying them as feeds doubled the INPUTS
  // bar of the Mass-balance plot for any sub-case containing a recycle.
  const tearStreams = new Set<string>(
    ((fs["tearStreams"] ?? []) as string[]),
  );
  // The qualified form a child composite produces ("FERMENTATION.Recycle")
  // appears in the JSON streams; map the bare tear name (just "Recycle")
  // to its qualified counterpart by leaf match.
  const tearLeafs = new Set([...tearStreams].map((t) => t.split(".").pop()!));

  const out: StreamResult[] = [];
  for (const [name, s] of Object.entries(payload.streams)) {
    //  ONE ROW PER PHYSICAL STREAM.  The payload is keyed by every NAME a
    //  stream answers to -- its identity, the bare sector label, the plant's
    //  own boundary label -- so the flagship arrives as 52 entries for 25
    //  pipes.  The extra names become `streamAliases`, a lookup for the
    //  canvas and the pop-outs, and the list every surface tabulates or sums
    //  keeps one entry per pipe.  Which names are labels is the ENGINE's
    //  answer (`aliasOf`), never a similarity match made here.
    if (s.aliasOf !== undefined) continue;
    const leaf = name.split(".").pop()!;
    const isTear = tearStreams.has(name) || tearLeafs.has(leaf);
    const isFeed = !isTear && (
      boundaryInlets.has(name)
      // Topology: a stream a unit CONSUMES but no unit PRODUCES is a plant
      // inlet -- symmetric to a product.
      || (consumed.has(name) && !produced.has(name))
    );
    //  A stream the PLANT declared as an outlet is a product, and the engine
    //  says so by giving it a boundary label.  Without this the flagship's
    //  nine products all read `intermediate` the moment the label rows stop
    //  being drawn: the case file names them `Powder`, `Stack`, ... while the
    //  row is the identity `DRYING.DryPowder`, and nothing in the root dict
    //  mentions that name.  Reading the engine's answer, not re-deriving one.
    const isProduct = !isTear && (
      s.boundaryLabel !== undefined
      || boundaryOutlets.has(name)
      || (produced.has(name) && !consumed.has(name))
    );
    const role: StreamResult["role"] = isFeed
      ? "feed"
    : isProduct
        ? "product"
      : "intermediate";
    // A feed every consumer of which is an observer is a state under
    // observation: it keeps its feed role (it IS the domain inlet) but the
    // balance surfaces must not count it as boundary intake.
    const observed = isFeed
      && consumedByObserver.has(name) && !consumedByTransformer.has(name);
    out.push({
      name,
      role,
      ...(observed ? { observed: true } : {}),
      F: s.F,
      T: s.T,
      P: s.P,
      vf: s.vf,
      H: s.H,
      H_kW: s.H_kW,
      F_mass: s.F_mass,
      F_solid_mass: s.F_solid_mass,
      category: s.category,
      ...(s.aliasOf !== undefined ? { aliasOf: s.aliasOf } : {}),
      ...(s.boundaryLabel !== undefined ? { boundaryLabel: s.boundaryLabel } : {}),
      ...(s.utilityCircuit !== undefined ? { utilityCircuit: s.utilityCircuit } : {}),
      composition: {...s.composition },
      solids: s.solids ? {...s.solids } : undefined,
      psd: s.psd
        ? { diameter: [...s.psd.diameter], massFrac: [...s.psd.massFrac] }
        : undefined,
      H_missing: s.H_missing ? [...s.H_missing] : undefined,
      speciation: s.speciation
        ? { ...s.speciation, flows: { ...s.speciation.flows } }
        : undefined,
      organicLiquid: s.organicLiquid ? { ...s.organicLiquid } : undefined,
    });
  }
  // Stable order: feed -> intermediate -> product, then alphabetical.
  const roleRank = { feed: 0, intermediate: 1, product: 2 } as const;
  out.sort((a, b) => roleRank[a.role] - roleRank[b.role] || a.name.localeCompare(b.name));
  return out;
}

/** The names `shapeStreams` dropped: alias -> the identity it copies.  A
 *  canvas edge, a case file and a pop-out link all speak the author's
 *  vocabulary, so a lookup BY NAME has to be able to get from `Stack` to
 *  `DRYING.ExhaustClean`.  Undefined when the run has no labels at all -- an
 *  empty object would claim a structure the case does not have. */
export function shapeStreamAliases(
  payload: ResultPayload,
): { [alias: string]: string } | undefined {
  if (!payload.streams) return undefined;
  const map: { [alias: string]: string } = {};
  for (const [name, s] of Object.entries(payload.streams))
    if (s.aliasOf !== undefined) map[name] = s.aliasOf;
  return Object.keys(map).length > 0 ? map : undefined;
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
