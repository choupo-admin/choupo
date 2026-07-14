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
  PropsView -- the ONE props surface (forum decision, 2026-06-02).
  =============================================================================

  The single property/foundation view, whether the case is props-only
  (a `propsDict`, no flowsheet) OR a flowsheet case building its thermo
  foundation first.  It REPLACES the old split between this view (pills) and
  the rail-based PropsNavigatorView -- one surface, pills, readiness FIRST.

  Layout:

      ┌──────────────────────────────────────────────────────────────┐
      │  consolidation bar  (flowsheet cases only): status · Simulate │
      ├──────────────────────────────────────────────────────────────┤
      │  header: description · Run properties · Lab-data toggle       │
      ├──────────────────────────────────────────────────────────────┤
      │  pills (grouped):  Foundation · Ledger · Comparison · ...     │
      ├──────────────────────────────────────────────────────────────┤
      │                    selected item's detail                     │
      └──────────────────────────────────────────────────────────────┘

  The FIRST, default pill is the thermo READINESS (component coverage + binary
  pair matrix) -- "is my thermo ready for a process, and what's a gap".  Every
  comparison overlays model curves with the raw lab data (red points), so the
  engineer chooses a model from the EVIDENCE -- never a "recommended" badge.

  Two run paths, chosen by what the case is:
    - props-only  -> the TopBar runs choupoProps (store.runResult); the Run
                     button here just dispatches the shared run event.
    - flowsheet   -> THIS view runs choupoProps itself (binaryOverride), per
                     prop-bearing target (a composite plant fans out to one
                     run per sector), keeping its own results -- the store's
                     runResult stays the flowsheet's choupoSolve result.
\*---------------------------------------------------------------------------*/

import { compositeMembers } from "../case/toGraph.js";
import { readEdges } from "../case/toGraph.js";
import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconDownload,
  IconExternalLink,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExperimentalOverlay } from "./plotting/CsvAutoPlot.js";
import type { OperationResult, PairResolution, RunResult, ValidationBlock } from "../adapters/SolverAdapter.js";
import type { CaseFiles } from "../case/types.js";
import { resolveAdapter } from "../adapters/index.js";
import { downloadComponentProposal } from "../case/saveCase.js";
import { caseHasUserCode, USER_CODE_MSG } from "../case/userCode.js";
import { tutorialByName } from "../cases/tutorials.js";
import { useStore } from "../state/store.js";
import type { JsonDict } from "../dict/index.js";
import { DecisionLedger, buildLedger } from "./DecisionLedger.js";
import { FitStatsPanel } from "./FitStatsPanel.js";
import {
  CsvAutoPlot,
  csvsAreOverlayCompatible,
  csvToOverlay,
  MultiCsvOverlay,
  MultiTxyOverlay,
} from "./plotting/CsvAutoPlot.js";
import { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } from "./plotting/plotly.js";
import { GibbsMapPanel } from "./GibbsMapPanel.js";
import { propsOpHelpLink, propsTheoryLink } from "../case/modelDocs.js";
import { ThermoView } from "./ThermoView.js";
import {
  parsePropertyPointReferences,
  type PointResult,
  type PointReference,
} from "./parsePropertyPointLog.js";

/** Property-point rows from the STRUCTURED channel (each propertyPoint op's
 *  engine diagnostics) -- the machine block is the source, never the log
 *  (strategy P4b: the log-scrape is retired).  Composition comes from the
 *  op's own dict (the state block), the dict being the source of truth. */
function pointsFromOps(ops: JsonDict[], opResults: OperationResult[]): PointResult[] {
  const out: PointResult[] = [];
  for (const op of ops) {
    if (!op || typeof op !== "object" || Array.isArray(op)) continue;
    if (op["type"] !== "propertyPoint") continue;
    const name = typeof op["name"] === "string" ? op["name"] : "";
    const r = opResults.find((x) => x.name === name && x.type === "propertyPoint");
    if (!r) continue;
    const d = r.diagnostics;
    const T = d["T"], P = d["P"];
    if (T === undefined || P === undefined) continue;
    let composition = "";
    const state = op["state"];
    if (state && typeof state === "object" && !Array.isArray(state)) {
      const mc = (state as JsonDict)["molarComposition"];
      if (mc && typeof mc === "object" && !Array.isArray(mc)) {
        const entries = Object.entries(mc as JsonDict);
        composition = entries
          .map(([sp, x]) => (entries.length === 1 ? sp : `${sp}:${String(x)}`))
          .join(" ");
      }
    }
    out.push({ name, T_K: T, P_bar: P / 1e5, composition,
      H_ig: d["H_ig"], S_ig: d["S_ig"], Cp_ig: d["Cp_ig"],
      gamma: d["gamma"], Z: d["Z"], S_real: d["S_real"] });
  }
  return out;
}

/** The author's own case story: the leading /*---…---*\ comment block at the
 *  top of a dict, stripped of its decorative frame.  THE glass-box answer to
 *  "what does this case do?" -- the case documents itself; F1 shows it. */
function dictHeaderComment(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/\/\*([\s\S]*?)\*\//);
  if (!m) return null;
  const body = m[1]!
    .split("\n")
    .filter((l) => !/^[\s\-\\*|]*$/.test(l))   // drop pure frame lines
    .join("\n")
    .trimEnd();
  return body.trim().length > 40 ? body : null;
}

/** Pretty trace name from a CSV filename: drops the trailing .csv. */
function stripCsvExt(name: string): string {
  return name.endsWith(".csv") ? name.slice(0, -4) : name;
}

/** A prop-bearing case this view runs + visualises.  `sector === null` is the
 *  case ITSELF (a leaf with its own propsDict); a non-null sector is a child of
 *  a composite (a plant fans out to one target per sector). */
interface PropsTarget {
  sector: string | null;
  caseName: string;
  files: CaseFiles;
  propsDict: JsonDict;
}

/** One navigable entry in the unified props mode -- a single thing the case
 *  studies (a comparison, an estimate, a consistency test, a fit, a scan, the
 *  property-point table), each with ONE clean detail view. */
interface PropsItem {
  key: string;
  group: string;
  label: string;
  node: React.ReactNode;
  /** Contextual help target (F1 / the Theory link): what does this panel's
   *  operation DO?  Set per-op from its type; groups fall back to the group
   *  map, then to the Properties Guide front. */
  theory?: string;
}

const GROUP_ORDER = ["Foundation", "Ledger", "Results", "Comparison", "Operations"];
const GROUP_LABEL: { [k: string]: string } = {
  Foundation: "Thermo (ready / gaps)",
  Ledger: "Decisions",
  Results: "Results (the run's answers)",
  Comparison: "Comparison (data vs models)",
  Operations: "Operations (the propsDict, in order)",
};

/** op name -> its output CSV basename, for one target's propsDict. */
function opOutputMap(propsDict: JsonDict | null): Map<string, string> {
  const m = new Map<string, string>();
  const o = propsDict?.["operations"];
  if (Array.isArray(o)) {
    for (const op of o) {
      if (!op || typeof op !== "object" || Array.isArray(op)) continue;
      const od = op as JsonDict;
      const nm = od["name"];
      const out = od["output"] && typeof od["output"] === "object" && !Array.isArray(od["output"])
        ? (od["output"] as JsonDict)["file"] : undefined;
      if (typeof nm === "string" && typeof out === "string") m.set(nm, out);
    }
  }
  return m;
}

/** The validation weapon, on screen: engine-computed AAD of each model vs the
 *  MEASURED data, per property -- the NUMBER under the data-vs-models overlay.
 *  Numbers only when the engine marked the row ok; otherwise the status word (a
 *  wrong AAD is worse than none).  Smaller AAD = closer to data (highlighted as
 *  evidence, not a recommended-by badge).  Defensive: "—" instead of throwing. */
function ValidationTable({ blocks }: { blocks: ValidationBlock[] }) {
  const num = (x: number | null, digits = 4) =>
    typeof x === "number" && isFinite(x) ? String(Number(x.toPrecision(digits))) : "—";
  return (
    <Box style={{ position: "absolute", inset: 0, padding: 16, overflow: "auto" }}>
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          Engine-computed average absolute deviation (AAD) of each model curve
          vs the measured points, interpolated onto the measured abscissa.
          Smaller is closer to the data.
        </Text>
        {blocks.map((b) => {
          // closest model per property (smallest ok aadAbs) -- evidence, not a badge
          const best = new Map<string, number>();
          for (const a of b.aad)
            if (a.property && a.status === "ok" && typeof a.aadAbs === "number" && isFinite(a.aadAbs)) {
              const cur = best.get(a.property);
              if (cur === undefined || a.aadAbs < cur) best.set(a.property, a.aadAbs);
            }
          return (
            <Box key={b.dataset}>
              <Text size="sm" c="accent" fw={500} mb={4}>
                {b.dataset} <Text component="span" size="xs" c="dimmed">(abscissa {b.abscissa || "—"})</Text>
              </Text>
              <Table withTableBorder withColumnBorders striped highlightOnHover
                style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Model</Table.Th>
                    <Table.Th>Property</Table.Th>
                    <Table.Th>AAD</Table.Th>
                    <Table.Th>rel %</Table.Th>
                    <Table.Th>pts</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {b.aad.map((a, i) => {
                    if (!a.property)
                      return (
                        <Table.Tr key={i}>
                          <Table.Td>{a.model}</Table.Td>
                          <Table.Td colSpan={4}>
                            <Text component="span" size="xs" c="orange.4">{a.status || "no AAD"}</Text>
                          </Table.Td>
                        </Table.Tr>
                      );
                    const isBest = a.status === "ok" && typeof a.aadAbs === "number"
                      && best.get(a.property) === a.aadAbs;
                    const flagged = a.status && a.status !== "ok";
                    const unit = a.aadAbsUnit && a.aadAbsUnit !== "-" ? " " + a.aadAbsUnit : "";
                    return (
                      <Table.Tr key={i}>
                        <Table.Td>{a.model}</Table.Td>
                        <Table.Td>{a.property}</Table.Td>
                        <Table.Td>
                          <Text component="span" size="xs" fw={isBest ? 700 : 400}
                            c={isBest ? "teal.4" : undefined}>
                            {num(a.aadAbs)}{unit}
                          </Text>
                        </Table.Td>
                        <Table.Td>{a.aadRelPct === null ? "—" : `${num(a.aadRelPct, 3)} %`}</Table.Td>
                        <Table.Td>
                          {a.nUsed}/{a.nMeas}
                          {flagged ? <Text component="span" size="xs" c="orange.4"> [{a.status}]</Text> : null}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

/** Build the navigable items for ONE prop-bearing target from its run result.
 *  Pure of the component -- so a leaf case and every sector of a composite
 *  plant feed the same builder.  Does NOT emit the global Foundation/Ledger
 *  pills (those aggregate across targets and are added once).  `prefix`
 *  namespaces keys + labels per sector so a plant's REACTION and SEPARATION
 *  comparisons are distinct pills. */
function buildTargetItems(opts: {
  result: RunResult | undefined;
  propsDict: JsonDict | null;
  thermoComponents: unknown;
  showLab: boolean;
  labelPrefix: string;   // "" for a leaf; "REACTION · " for a composite sector
  keyPrefix: string;     // "" for a leaf; "REACTION:" for a composite sector
}): PropsItem[] {
  const { result, propsDict, thermoComponents, showLab, labelPrefix, keyPrefix } = opts;
  const out: PropsItem[] = [];
  const csvFiles = result?.csvFiles ?? {};
  const csvNames = Object.keys(csvFiles).sort();
  const opToCsv = opOutputMap(propsDict);

  // constant/ CSVs are the case's curated INPUT datasets (cited experimental
  // tables), not run results -- they feed overlays, never standalone panels.
  const modelCsvNames = csvNames.filter((n) => !n.startsWith("exp_") && !n.startsWith("constant/"));
  const expCsvNames = csvNames.filter((n) => n.startsWith("exp_"));
  const consumed = new Set<string>();

  const labOverlays: ExperimentalOverlay[] = expCsvNames
    .map((n) => csvToOverlay(stripCsvExt(n).replace(/^exp_/, ""), csvFiles[n]!))
    .filter((o): o is ExperimentalOverlay => o !== null);

  // 1. Model comparison: an experimental{models} overlay, else the implicit
  //    overlay of all 2-column model scans (compare_eos / compare_activity).
  const overlayInputs = modelCsvNames.map((n) => ({ name: stripCsvExt(n), text: csvFiles[n]! }));
  const txyComparison = (() => {
    const exps = propsDict?.["experimental"];
    if (!Array.isArray(exps)) return null;
    const compList = Array.isArray(thermoComponents) ? (thermoComponents as unknown[]).map(String) : [];
    for (const e of exps) {
      if (!e || typeof e !== "object" || Array.isArray(e)) continue;
      const ed = e as JsonDict;
      const models = Array.isArray(ed["models"]) ? (ed["models"] as unknown[]).map(String) : [];
      if (models.length === 0) continue;
      const inputs = models
        .map((op) => { const f = opToCsv.get(op); const text = f ? csvFiles[f] : undefined; return text ? { name: op, text } : null; })
        .filter((x): x is { name: string; text: string } => x !== null);
      if (inputs.length > 0) {
        const component = typeof ed["component"] === "string" ? ed["component"] : "";
        const partner = compList.find((c) => c !== component);
        return { kind: typeof ed["kind"] === "string" ? ed["kind"] : "txy", inputs, partner };
      }
    }
    return null;
  })();

  if (txyComparison) {
    out.push({ key: `${keyPrefix}cmp`, group: "Comparison", label: `${labelPrefix}Model comparison`,
      node: txyComparison.kind === "txy"
        ? <MultiTxyOverlay csvs={txyComparison.inputs} overlays={showLab ? labOverlays : []} partner={txyComparison.partner} />
        : <MultiCsvOverlay csvs={txyComparison.inputs} overlays={showLab ? labOverlays : []} /> });
    for (const i of txyComparison.inputs) { const f = opToCsv.get(i.name); if (f) consumed.add(f); }
  } else if (csvsAreOverlayCompatible(overlayInputs)) {
    out.push({ key: `${keyPrefix}cmp`, group: "Comparison", label: `${labelPrefix}Model comparison`,
      node: <MultiCsvOverlay csvs={overlayInputs} overlays={showLab ? labOverlays : []} /> });
    for (const n of modelCsvNames) consumed.add(n);
  }

  // Validation (AAD vs data): the engine's quantified model-vs-measured
  // deviation, its own pill so the table fills the pane (no clash with the
  // overlay plot above).
  if (result?.validation && result.validation.length > 0) {
    out.push({ key: `${keyPrefix}cmp-aad`, group: "Comparison",
      label: `${labelPrefix}Validation (AAD vs data)`,
      node: <ValidationTable blocks={result.validation} /> });
  }

  const opResults = result?.operationResults ?? [];

  // 2. THE OP CONTRACT (docs/gui-props-strategy.md P4): one pill per declared
  //    operation, in the AUTHOR'S dict order, under the author's names.  Typed
  //    renderers where a richer panel exists; the generic panel (diagnostics +
  //    this op's CSV) for every other type -- no operation can be born
  //    invisible.  propertyPoint ops aggregate into ONE table pill (six steam
  //    pins want one table, not six identical pills).
  const ops = (propsDict?.["operations"] ?? []) as JsonDict[];
  let pointsPillDone = false;
  for (const op of ops) {
    if (!op || typeof op !== "object" || Array.isArray(op)) continue;
    const opName = typeof op["name"] === "string" ? op["name"] : "";
    const opType = typeof op["type"] === "string" ? op["type"] : "";
    if (!opName) continue;
    const r = opResults.find((x) => x.name === opName);
    const f = opToCsv.get(opName);
    const csvText = f ? csvFiles[f] : undefined;

    const opHelp = propsOpHelpLink(opType);
    if (opType === "propertyPoint") {
      if (pointsPillDone) continue;
      pointsPillDone = true;
      const points = result?.status === "done" ? pointsFromOps(ops, opResults) : [];
      if (points.length > 0) {
        const references = parsePropertyPointReferences(propsDict);
        out.push({ key: `${keyPrefix}points`, group: "Operations",
          label: `${labelPrefix}Property points`, theory: opHelp,
          node: <PropertyPointPanel points={points} references={references} /> });
      } else {
        out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations",
          label: `${labelPrefix}Property points`, theory: opHelp,
          node: <OpGenericPanel opName={opName} opType={opType} result={r} /> });
      }
      continue;
    }
    if (opType === "vleConsistency" && r) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp,
        node: <ConsistencyPanel result={r} propsDict={propsDict} csv={csvText} /> });
      if (f) consumed.add(f);
      continue;
    }
    if (opType === "estimateComponent" && r) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp,
        node: <EstimatePanel results={[r]} propsDict={propsDict}
          proposals={result?.proposals} components={thermoComponents} /> });
      continue;
    }
    if (opType === "gibbsMap" && csvText) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp,
        node: <GibbsMapPanel op={op} csv={csvText} /> });
      if (f) consumed.add(f);
      continue;
    }
    if (opType === "fitParameters" && r) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp,
        node: (
          <Box style={{ position: "absolute", inset: 0, overflow: "auto" }}>
            <ScrollArea h="100%" type="auto" px="md" py="sm">
              <FitStatsPanel results={[r]} propsDict={propsDict ?? undefined} />
            </ScrollArea>
          </Box>
        ) });
      if (f) consumed.add(f);
      continue;
    }
    // Generic: this op's diagnostics band + its CSV plot (or an honest note).
    if (csvText && consumed.has(f!)) continue;   // fed the comparison overlay above
    out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
      theory: opHelp,
      node: <OpGenericPanel opName={opName} opType={opType} result={r}
        csv={csvText} filename={f} /> });
    if (f) consumed.add(f);
  }

  // 3. Defensive tail: any output CSV no operation claimed (never invisible).
  for (const n of modelCsvNames) {
    if (consumed.has(n)) continue;
    const text = csvFiles[n];
    if (!text) continue;
    if ([...opToCsv.values()].includes(n)) continue;   // claimed above
    out.push({ key: `${keyPrefix}scan:${n}`, group: "Operations", label: `${labelPrefix}${stripCsvExt(n)}`,
      node: <CsvAutoPlot csv={text} filename={n} /> });
  }
  return out;
}

export function PropsView() {
  const caseFiles = useStore((s) => s.caseFiles);
  const tutorialName = useStore((s) => s.tutorialName);
  const controlDict = useStore((s) => s.caseFiles.controlDict);
  const thermoComponents = useStore((s) => s.caseFiles.thermoPackage?.["components"]);
  const storeRunResult = useStore((s) => s.runResult);
  const runStatus = useStore((s) => s.runStatus);
  const runLog = useStore((s) => s.runLog);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const markPropsRun = useStore((s) => s.markPropsRun);
  const propsRunAt = useStore((s) => s.propsRunAt);
  const flowsheetRunAt = useStore((s) => s.flowsheetRunAt);

  const hasFlowsheet = Boolean(caseFiles.flowsheet);
  // A composite plant whose sectors are not yet WIRED (children present, no
  // connections) is in the CURATION phase -- its flowsheet can never run, so
  // the "Simulate process" affordance would be a dead end.  Mirror TopBar's
  // inCuration test (which also reads `connections`, not just `children`).
  const inCuration = (() => {
    const fs = caseFiles.flowsheet;
    return Boolean(fs)
      && compositeMembers(fs!).length > 0
      && (readEdges(fs!).length === 0);
  })();

  // `controlDict.description` -- a free-text one-liner carrying the case's
  // intent, shown as a subtitle.
  const description: string | undefined = useMemo(() => {
    const d = controlDict?.["description"];
    return typeof d === "string" && d.trim().length > 0 ? d.trim() : undefined;
  }, [controlDict]);

  // The prop-bearing TARGETS this view runs + visualises.  A case with its own
  // propsDict is one target: itself.  A COMPOSITE case (a plant with `children`
  // and no own propsDict) fans out to one target per child sector that carries
  // a propsDict -- so the PLANT shows every sector's analyses here.
  const targets = useMemo<PropsTarget[]>(() => {
    if (caseFiles.propsDict)
      return [{ sector: null, caseName: tutorialName, files: caseFiles, propsDict: caseFiles.propsDict }];
    const fs = caseFiles.flowsheet;
    const children = fs ? compositeMembers(fs) : [];
    const out: PropsTarget[] = [];
    for (const child of children) {
      const sub = tutorialByName(`${tutorialName}/${child}`);
      if (sub?.files.propsDict)
        out.push({ sector: child, caseName: sub.name, files: sub.files, propsDict: sub.files.propsDict });
    }
    return out;
  }, [caseFiles, tutorialName]);
  const isComposite = targets.some((t) => t.sector !== null);
  const hasProps = targets.length > 0;

  // Local choupoProps results, one per target, keyed by caseName -- used for a
  // FLOWSHEET case (the store's runResult is its choupoSolve result).  A
  // props-only case instead reads the store's runResult (the TopBar runs
  // choupoProps for it).
  const [localRuns, setLocalRuns] = useState<Map<string, RunResult>>(new Map());
  const [localRunning, setLocalRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  const runPropsLocal = useCallback(async () => {
    // A case shipping its own C++ (code/, e.g. a custom estimator) needs local
    // compilation (buildCode); the browser can't compile C++.  Pre-empt clearly.
    if (caseHasUserCode(caseFiles)) {
      setRunErr(USER_CODE_MSG);
      return;
    }
    setLocalRunning(true);
    setRunErr(null);
    try {
      const resolved = await resolveAdapter("wasm");
      // Hosted build, WASM missing: refuse -- never fabricate numbers with mock.
      if (resolved.kind === "unavailable") {
        setRunErr(resolved.fallbackReason ?? "The real solver could not be loaded.");
        return;
      }
      const adapter = resolved.adapter;
      const next = new Map<string, RunResult>();
      const errs: string[] = [];
      for (const t of targets) {
        const result = await adapter.run(t.files, () => {}, undefined, "choupoProps");
        next.set(t.caseName, result);
        if (result.status !== "done")
          errs.push(t.sector ? `${t.sector} did not finish` : "did not finish cleanly");
      }
      setLocalRuns(next);
      if (errs.length === 0 && next.size > 0) markPropsRun();
      else if (errs.length) setRunErr(`choupoProps — ${errs.join("; ")} (see the Log).`);
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalRunning(false);
    }
  }, [targets, markPropsRun]);

  // The effective result map this view reads from.  props-only -> the store's
  // single runResult under this case's name; flowsheet -> the local per-sector
  // runs.  Either way: caseName -> RunResult.
  const runs = useMemo<Map<string, RunResult>>(() => {
    if (hasFlowsheet) return localRuns;
    if (storeRunResult) return new Map([[tutorialName, storeRunResult]]);
    return new Map();
  }, [hasFlowsheet, localRuns, storeRunResult, tutorialName]);

  const running = hasFlowsheet ? localRunning : runStatus === "running";
  // After a run the user must SEE what it produced ("see, then decide") -- a
  // completed run that leaves the view sitting on `thermo readiness` reads as
  // silence.  Arm a one-shot jump on Run; when the results land, focus the
  // first RESULT panel (the readiness/ledger panels are pre-run machinery).
  const [jumpToResults, setJumpToResults] = useState(false);
  const onRun = useCallback(() => {
    setJumpToResults(true);
    if (hasFlowsheet) void runPropsLocal();
    else window.dispatchEvent(new CustomEvent("choupo:run"));
  }, [hasFlowsheet, runPropsLocal]);

  // Raw lab-data overlays toggle (default on when present).
  const [showLab, setShowLab] = useState(true);
  const anyLabData = useMemo(
    () => [...runs.values()].some((r) => Object.keys(r.csvFiles ?? {}).some((n) => n.startsWith("exp_"))),
    [runs],
  );

  // The per-target items, flattened.  A props-only case = one target (self); a
  // composite = one per sector (labels prefixed so pills stay distinct).
  const targetItems = useMemo<PropsItem[]>(() => {
    return targets.flatMap((t) => {
      const res = runs.get(t.caseName);
      return buildTargetItems({
        result: res,
        propsDict: t.propsDict,
        thermoComponents,
        showLab,
        labelPrefix: t.sector ? `${t.sector} · ` : "",
        keyPrefix: t.sector ? `${t.sector}:` : "",
      });
    });
  }, [targets, runs, hasFlowsheet, runLog, thermoComponents, showLab]);

  // CONSOLIDATION ledger -- aggregate ops/pairs/datasets across every target.
  const aggOps = useMemo(() => [...runs.values()].flatMap((r) => r.operationResults ?? []), [runs]);
  const aggPairs = useMemo(() => {
    const seen = new Set<string>();
    const out: PairResolution[] = [];
    for (const r of runs.values())
      for (const p of r.thermoResolution ?? []) {
        const k = `${p.i}|${p.j}|${p.model}`;
        if (!seen.has(k)) { seen.add(k); out.push(p); }
      }
    return out;
  }, [runs]);
  const aggData = useMemo(() => [...runs.values()].flatMap((r) => r.experimentalDatasets ?? []), [runs]);
  const ranAny = [...runs.values()].some((r) => r.status === "done");
  const ledgerRows = ranAny ? buildLedger(aggOps, aggPairs, aggData) : [];
  const nUnjustified = ledgerRows.filter((r) => r.flag === "bad").length;
  const allRan = hasProps && targets.every((t) => runs.get(t.caseName)?.status === "done");
  const nFailed = targets.filter((t) => runs.has(t.caseName) && runs.get(t.caseName)?.status !== "done").length;
  const consolidated = allRan && nUnjustified === 0;

  // ITERATION audit: is the last simulation coherent with the current props?
  const simStale = flowsheetRunAt > 0 && propsRunAt > flowsheetRunAt;
  const simCurrent = flowsheetRunAt > 0 && propsRunAt > 0 && flowsheetRunAt >= propsRunAt;

  // Assemble the full item list: Foundation (always first + default) + Ledger
  // (when the case declares props) + every target's items.
  const items = useMemo<PropsItem[]>(() => {
    const out: PropsItem[] = [];
    out.push({ key: "foundation", group: "Foundation", label: "thermo readiness",
      node: <Box style={{ position: "absolute", inset: 0 }}><ThermoView /></Box> });
    if (hasProps)
      out.push({ key: "ledger", group: "Ledger", label: "decision ledger",
        node: (
          <Box style={{ position: "absolute", inset: 0, overflow: "auto" }}>
            <DecisionLedger ops={aggOps} pairs={aggPairs} datasets={aggData} />
          </Box>
        ) });
    // The run's ANSWERS, first-class (strategy P1): the post-run landing.
    if (ranAny)
      out.push({ key: "results", group: "Results", label: "results",
        node: <ResultsEpilogue runs={runs} /> });
    out.push(...targetItems);
    return out;
  }, [hasProps, aggOps, aggPairs, aggData, targetItems, ranAny, runs]);

  // Selected item; keep the selection across re-renders, fall back to first.
  const [selectedKey, setSelectedKey] = useState<string>("foundation");
  useEffect(() => {
    if (!items.some((i) => i.key === selectedKey)) setSelectedKey(items[0]!.key);
  }, [items, selectedKey]);
  // The armed post-run landing: results arrived -> land on the Results
  // epilogue (the run's answers); evidence panels are one click behind it.
  useEffect(() => {
    if (!jumpToResults || running || runs.size === 0) return;
    const target = items.find((i) => i.key === "results")
      ?? items.find((i) => i.key !== "foundation" && i.key !== "ledger");
    if (target) setSelectedKey(target.key);
    setJumpToResults(false);
  }, [jumpToResults, running, runs, items]);
  const selectedItem = items.find((i) => i.key === selectedKey) ?? items[0] ?? null;
  const showNav = items.length >= 2;
  const theoryHref = selectedItem
    ? (selectedItem.theory ?? propsTheoryLink(selectedItem.group)
       ?? `${import.meta.env.BASE_URL}docs/propsGuide.pdf`)
    : null;
  // F1 = THE THEORY: open the guide at the section deriving the thermophysics
  // + the numerical method of the SELECTED operation (ch:speciation for a
  // speciate op, ch:electrolytes for Pitzer, ch:lm for fits...).  One press,
  // the derivation.  The case's own story (its propsDict header) lives behind
  // the visible "About this case" button instead -- two questions, two doors.
  const [helpOpen, setHelpOpen] = useState(false);
  const rawFiles = useStore((s) => s.caseFiles.rawFiles);
  const caseStory = useMemo(
    () => dictHeaderComment(rawFiles?.["system/propsDict"]), [rawFiles]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F1") return;
      e.preventDefault();
      window.open(theoryHref ?? `${import.meta.env.BASE_URL}docs/theoryGuide.pdf`,
        "_blank", "noopener");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theoryHref]);

  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" }}>
      <Drawer opened={helpOpen} onClose={() => setHelpOpen(false)} position="right"
        size="lg" title={`What this case does — ${tutorialName}`}>
        {typeof controlDict?.["description"] === "string" && (
          <Text size="sm" mb="md">{controlDict["description"] as string}</Text>
        )}
        {caseStory ? (
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{caseStory}</Text>
        ) : (
          <Text size="sm" c="dimmed">
            This case's propsDict carries no header comment — the description
            above is its story. (Case authors: the leading comment block of
            system/propsDict is what F1 shows here.)
          </Text>
        )}
        {selectedItem && theoryHref && (
          <Text size="sm" mt="md">
            theory behind <Text span fw={600}>{selectedItem.label}</Text>:{" "}
            <Anchor href={theoryHref} target="_blank" rel="noopener">open the guide section</Anchor>
          </Text>
        )}
        <Text size="xs" c="dimmed" mt="md">F1 opens the THEORY section for the selected operation.</Text>
      </Drawer>

      {/* Consolidation bar (flowsheet cases): props + the flowsheet are ONE
          case -- the validated foundation IS what the simulation runs.
          "Consolidated" = the ledger has no unjustified decision. */}
      {hasFlowsheet && (
        <Group justify="space-between" px="md" py={6}
          style={{ borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))", background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
          <Group gap={6} align="center">
            {!ranAny ? (
              <Text size="xs" c="dimmed">
                {isComposite
                  ? "Run the properties — every sector's analyses run + consolidate here."
                  : "Run the properties to consolidate them."}
              </Text>
            ) : nFailed > 0 ? (
              <>
                <IconAlertTriangle size={15} color="var(--mantine-color-red-5)" />
                <Text size="xs" c="red.4">{nFailed} sector run(s) failed — see the Log; not consolidated.</Text>
              </>
            ) : consolidated ? (
              <>
                <IconCircleCheck size={15} color="var(--mantine-color-teal-4)" />
                <Text size="xs" c="teal.4">Properties consolidated — {ledgerRows.length} decisions, all sourced.</Text>
              </>
            ) : (
              <>
                <IconAlertTriangle size={15} color="var(--mantine-color-yellow-4)" />
                <Text size="xs" c="yellow.4">{nUnjustified} unjustified decision(s) — resolve before simulating (see the ledger).</Text>
              </>
            )}
            {!inCuration && simStale && (
              <Text size="xs" c="orange.4" fw={600}>· flowsheet is STALE — re-simulate (props changed since the last run)</Text>
            )}
            {!inCuration && simCurrent && !simStale && (
              <Text size="xs" c="dimmed">· flowsheet reflects these props ✓</Text>
            )}
          </Group>
          {inCuration ? (
            // The plant is unwired -- its flowsheet can never run, so offer no
            // dead "Simulate process" affordance; tell the student what's missing.
            <Text size="xs" c="dimmed" style={{ flex: "0 0 auto" }}>
              Plant unwired — add <code>connections</code> in <code>flowsheetDict</code> to assemble + simulate.
            </Text>
          ) : (
            <Button size="xs" variant={consolidated ? "filled" : "light"} color={consolidated ? "teal" : "gray"}
              rightSection={<IconArrowRight size={14} />} onClick={() => setActiveWorkspace(null)}
              title="Go to the flowsheet -- it runs on the foundation you just validated">
              Simulate process
            </Button>
          )}
        </Group>
      )}

      {/* Header strip: description + run + lab-data toggle */}
      <Box style={{ flex: "0 0 auto", padding: "8px 16px",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))", background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
        {description && (
          <Text size="sm" c="var(--mantine-color-text)" fw={500} mb={6} style={{ lineHeight: 1.3 }}>{description}</Text>
        )}
        <Group justify="flex-start" gap="md" wrap="nowrap">
          <Button size="xs" color="cyan" leftSection={<IconPlayerPlay size={14} />}
            loading={running} disabled={!hasProps && hasFlowsheet} onClick={onRun}>
            {running ? "Running…"
              : isComposite ? `Run properties (${targets.length} sectors)`
              : "Run properties"}
          </Button>
          <Button size="xs" variant="subtle" c="dimmed"
            onClick={() => setHelpOpen(true)}>
            About this case
          </Button>
          {anyLabData && (
            <Checkbox size="xs" checked={showLab} onChange={(e) => setShowLab(e.currentTarget.checked)}
              label={
                <Group gap={4} align="center">
                  <Box style={{ width: 9, height: 9, borderRadius: 9, background: "#ff5252" }} />
                  <Text size="xs">Lab data</Text>
                </Group>
              }
              title="Overlay the raw experimental points on the model curves" />
          )}
          {runErr && <Text size="xs" c="red.4">{runErr}</Text>}
          {!hasProps && (
            <Text size="xs" c="dimmed">
              No property analyses declared — the thermo foundation is shown. Add an{" "}
              <code>experimental</code> + model ops to this case's <code>propsDict</code> to compare data vs models.
            </Text>
          )}
        </Group>
      </Box>

      {/* Body: pills (grouped) over the selected item's full-width detail. */}
      <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Group justify="space-between" gap="md" px="md" py={6} wrap="nowrap"
          style={{ flex: "0 0 auto", borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
                   background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
          <Group gap="lg" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            {showNav ? GROUP_ORDER.map((g) => {
              const gi = items.filter((i) => i.group === g);
              if (gi.length === 0) return null;
              return (
                <Group key={g} gap={4} wrap="nowrap" align="center">
                  <Text size="10px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>
                    {GROUP_LABEL[g] ?? g}
                  </Text>
                  {gi.map((i) => (
                    <Button key={i.key} size="compact-xs" radius="xl"
                      variant={i.key === selectedKey ? "filled" : "default"}
                      color={i.key === selectedKey ? "cyan" : "gray"}
                      onClick={() => setSelectedKey(i.key)}>
                      <Text size="xs" ff="monospace">{i.label}</Text>
                    </Button>
                  ))}
                </Group>
              );
            }) : selectedItem && (
              <Text size="10px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>
                {GROUP_LABEL[selectedItem.group] ?? selectedItem.group}
              </Text>
            )}
          </Group>
          {theoryHref && (
            <Anchor href={theoryHref} target="_blank" rel="noopener" c="accent.4"
              style={{ flex: "0 0 auto" }} title="Open the Properties Guide at this section">
              <Group gap={4} wrap="nowrap" align="center">
                <IconExternalLink size={13} /><Text size="xs">Theory</Text>
              </Group>
            </Anchor>
          )}
        </Group>
        <Box style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
          {selectedItem?.node}
        </Box>
      </Box>
    </Box>
  );
}

/** Visual table for `propertyPoint` cases — one row per operation.
 *  Cells with a `reference {}` value from the propsDict are annotated
 *  inline with "ref X ±tol%" coloured green (within tol) or red (out). */
function PropertyPointPanel({
  points,
  references,
}: {
  points: PointResult[];
  references: Map<string, PointReference>;
}) {
  const refSources = new Set<string>();
  for (const ref of references.values()) {
    if (ref.source) refSources.add(ref.source);
  }
  return (
    <Box style={{ position: "absolute", inset: 0, padding: 16, overflow: "auto" }}>
      <Stack gap="sm">
        <Group justify="space-between" align="baseline">
          <Text c="accent" fw={500}>
            Run complete — {points.length} audit point{points.length === 1 ? "" : "s"}.
          </Text>
          <Text size="xs" c="dimmed">
            <code>propertyPoint</code> emits no CSV; values below are parsed
            from the run log.
          </Text>
        </Group>
        {refSources.size > 0 && (
          <Text size="xs" c="dimmed">
            Reference {refSources.size === 1 ? "source" : "sources"}:{" "}
            {Array.from(refSources).join("; ")}.  Each value cell with a
            reference shows the calculated number on top and{" "}
            <Text component="span" size="xs" c="green.6" fw={500}>green</Text>
            {" / "}
            <Text component="span" size="xs" c="red.6" fw={500}>red</Text>{" "}
            annotation under it indicating Δ% vs tolerance.
          </Text>
        )}
        <ScrollArea>
          <Table withTableBorder withColumnBorders striped highlightOnHover
            style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Operation</Table.Th>
                <Table.Th>Composition</Table.Th>
                <ColHeader label="T (K)" help="Absolute temperature." />
                <ColHeader label="P (bar)" help="Absolute pressure." />
                <ColHeader label="H_ig (J/mol)"
                  help="Ideal-gas mixture enthalpy. JANAF reference state: chemical elements at 298.15 K, 1 bar. H = 0 for pure elements at the reference state; H < 0 for compounds with negative heat of formation (CH4, H2O, CO2)." />
                <ColHeader label="S_ig (J/mol·K)"
                  help="Ideal-gas mixture entropy at (T, P). Includes the R ln(P/P°) pressure term, so doubling P decreases S by R ln 2 ≈ 5.76 J/(mol·K)." />
                <ColHeader label="Cp_ig (J/mol·K)"
                  help="Ideal-gas heat capacity at constant pressure (polynomial in T, JANAF coefficients)." />
                <ColHeader label="γ = Cp/Cv"
                  help="Heat-capacity ratio. ~1.40 for diatomic (N2, O2, air), ~1.30 for poliatomic (CH4, CO2). Determines the adiabatic exponent in isentropic compressions / expansions." />
                <ColHeader label="Z = Pv/RT"
                  help="Compressibility factor (from the real EoS, vapour root). Z = 1 for an ideal gas. Z < 1 when attractive forces dominate (sub-critical, moderate P); Z > 1 when repulsive forces dominate (very high P, or T ≫ Tc)." />
                <ColHeader label="S_real (J/mol·K)"
                  help="Real-fluid entropy = S_ig + S_residual (the EoS departure). Differs from S_ig only when Z ≠ 1." />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {points.map((p) => {
                const ref = references.get(p.name);
                const cell = (key: string, value: number | undefined) => (
                  <Table.Td style={{ textAlign: "right" }}>
                    <ValueCell value={value} refValue={ref?.values[key]} tol={ref?.tol ?? 0.02} />
                  </Table.Td>
                );
                return (
                  <Table.Tr key={p.name}>
                    <Table.Td><Text size="xs" fw={500}>{p.name}</Text></Table.Td>
                    <Table.Td>{p.composition}</Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>{fmtNum(p.T_K)}</Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>{fmtNum(p.P_bar)}</Table.Td>
                    {cell("H_ig",   p.H_ig)}
                    {cell("S_ig",   p.S_ig)}
                    {cell("Cp_ig",  p.Cp_ig)}
                    {cell("gamma",  p.gamma)}
                    {cell("Z",      p.Z)}
                    {cell("S_real", p.S_real)}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Box>
  );
}

/** The File System Access API (showSaveFilePicker) -- a real "Save As" folder
 *  picker -- is Chromium-only.  Firefox/Safari lack it, so a download there
 *  lands in the browser's configured download folder (no JS can force a folder
 *  dialog; it obeys the browser's own "ask where to save" setting). */
const SUPPORTS_SAVE_PICKER =
  typeof window !== "undefined" &&
  typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";

/** Which flowsheet capabilities a proposal .dat ACTUALLY carries, read from its
 *  ACTIVE (uncommented) keys -- so the readiness chips show the file's TRUE
 *  state (a future Joback variant that fills a gap, or a student who uncomments
 *  one, flips the chip automatically), never a hardcoded guess.  A line that
 *  starts with `//` is a commented GAP TODO and does not count. */
function proposalCapabilities(text: string) {
  const has = (key: string) => new RegExp(`^[ \\t]*${key}\\b`, "m").test(text);
  return {
    eos: has("Tc") && has("Pc"),
    gibbs: has("gibbsFormation"),
    energy: has("idealGasHeatCapacity"),
    vle: has("vaporPressure"),
    pump: has("Vliq"),
  };
}

/** Find an operation dict by name in the propsDict (for groups + reference). */
function findOp(propsDict: JsonDict | null, name: string): JsonDict | null {
  const ops = propsDict?.["operations"];
  if (!Array.isArray(ops)) return null;
  for (const o of ops) {
    if (o && typeof o === "object" && !Array.isArray(o) && (o as JsonDict).name === name) {
      return o as JsonDict;
    }
  }
  return null;
}

/** The Joback group-contribution estimate card: the estimated pure-component
 *  constants beside their reference (when the op declared one), with dev% --
 *  the "see, then trust" view of a CREATED component.  The per-group build-up
 *  stays in the run log. */
function EstimatePanel({
  results, propsDict, proposals, components,
}: {
  results: OperationResult[];
  propsDict: JsonDict | null;
  proposals?: { [relPath: string]: string };
  components?: unknown;
}) {
  const componentNames = Array.isArray(components) ? (components as unknown[]).map(String) : [];
  return (
    <Box style={{ position: "absolute", inset: 0, overflow: "auto" }}>
      {results.map((r) => {
        const op = findOp(propsDict, r.name);
        const d = r.diagnostics;
        const comp = (typeof op?.["component"] === "string" ? op["component"] : r.name) as string;
        const groups = Array.isArray(op?.["groups"]) ? (op!["groups"] as JsonDict[]) : [];
        const ref = (op?.["reference"] && typeof op["reference"] === "object" && !Array.isArray(op["reference"])
          ? (op["reference"] as JsonDict) : null);
        // The promote proposal .dat this estimate produced (if `output {
        // proposal auto; }` was declared), matched by component name.
        const proposalEntry = Object.entries(proposals ?? {}).find(
          ([path]) => new RegExp(`(^|/)${comp}\\.estimate-.*\\.dat$`).test(path));
        const proposalName = proposalEntry ? proposalEntry[0].split("/").pop()! : null;
        const proposalText = proposalEntry ? proposalEntry[1] : null;
        // SHADOW guard: a same-named component is already loaded in this case
        // (a standard or a curated case-local) -- promoting would shadow it.
        const shadows = componentNames.includes(comp);
        // GATE (see-then-decide): no reference{} -> you can't see the error ->
        // the download is DISABLED.  A reference makes the dev% visible and
        // unlocks it.  The CTA never floats free of its evidence.
        const canDownload = Boolean(proposalText) && Boolean(ref);
        // Readiness derived from the proposal's REAL active keys when we have
        // the file; else from the run diagnostics (the honest fallback).
        const cap = proposalText ? proposalCapabilities(proposalText) : {
          eos: d.Tc_K !== undefined && d.Pc_bar !== undefined,
          gibbs: false,
          energy: d.Cp298 !== undefined,
          vle: false,
          pump: false,
        };
        const refNum = (k: string): number | undefined => {
          const v = ref?.[k]; return typeof v === "number" ? v : undefined;
        };
        const pcRef = refNum("Pc");
        const rows: { label: string; est: number | undefined; unit: string; ref?: number }[] = [
          { label: "MW", est: d.MW, unit: "g/mol" },
          { label: "Tb (normal boiling)", est: d.Tb_K, unit: "K", ref: refNum("Tb") },
          { label: "Tc (critical)", est: d.Tc_K, unit: "K", ref: refNum("Tc") },
          { label: "Pc (critical)", est: d.Pc_bar, unit: "bar", ref: pcRef !== undefined ? pcRef / 1e5 : undefined },
          { label: "Vc (critical)", est: d.Vc_cm3mol, unit: "cm³/mol" },
          { label: "ω (acentric, Lee-Kesler)", est: d.omega, unit: "—", ref: refNum("omega") },
          { label: "ΔHf° 298 (ideal gas)", est: d.dHf_kJmol, unit: "kJ/mol" },
          { label: "ΔGf° 298 (ideal gas)", est: d.dGf_kJmol, unit: "kJ/mol" },
          { label: "Hvap (at Tb)", est: d.Hvap_kJmol, unit: "kJ/mol" },
          { label: "Cp_ig(298 K)", est: d.Cp298, unit: "J/mol·K" },
        ];
        // GENERIC TAIL: every diagnostic the estimator emitted that the fixed
        // list above does not know (Yang2020's Tg_K, van Krevelen's
        // density_g_cm3, Riazi-Daubert's SG, ...) -- an estimator's key result
        // must never be invisible because the card was written for Joback.
        {
          const known = new Set(["MW", "Tb_K", "Tc_K", "Pc_bar", "Vc_cm3mol",
            "omega", "dHf_kJmol", "dGf_kJmol", "Hvap_kJmol", "Cp298"]);
          for (const [k, v] of Object.entries(d)) {
            if (known.has(k) || typeof v !== "number") continue;
            rows.push({ label: k, est: v, unit: "" });
          }
        }
        const estMethod = r.provenance?.["method"] ?? "Joback";
        return (
          <Box key={r.name}>
            {/* STICKY action band -- pinned top of the pane, so the proposal +
                Download is the first thing seen and never scrolls away.  The
                warning pill sits inline-left of the button (inseparable), the
                deviation evidence is one line below in the scroll body. */}
            <Box style={{ position: "sticky", top: 0, zIndex: 2,
              background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))",
              borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
              <Group justify="space-between" align="center" wrap="nowrap" px="md" py={8}>
                <Group gap={8} align="center" wrap="wrap" style={{ minWidth: 0 }}>
                  <Text fw={600} c="accent">{estMethod} estimate — {comp}</Text>
                  {groups.map((g, i) => (
                    <Badge key={i} variant="light" color="grape" size="sm" radius="sm"
                      styles={{ root: { textTransform: "none" } }}>
                      {String(g["count"] ?? 1)}× {String(g["group"] ?? "?")}
                    </Badge>
                  ))}
                </Group>
                {proposalText && proposalName && (
                  <Group gap={8} align="center" wrap="nowrap" style={{ flex: "0 0 auto" }}>
                    {!ref ? (
                      <Badge variant="filled" color="red" size="sm" radius="sm"
                        styles={{ root: { textTransform: "none" } }}
                        title="No reference{} declared — you cannot see the estimate's error.">
                        UNVALIDATED
                      </Badge>
                    ) : shadows ? (
                      <Badge variant="filled" color="red" size="sm" radius="sm"
                        styles={{ root: { textTransform: "none" } }}
                        title={`A component named ${comp} already exists — promoting would override it.`}>
                        SHADOWS {comp}
                      </Badge>
                    ) : null}
                    <Tooltip multiline w={290} withArrow position="bottom"
                      label={!canDownload
                        ? "Declare a reference{} so you can SEE the error before you trust this estimate."
                        : SUPPORTS_SAVE_PICKER
                          ? "Save the dated proposal .dat — a Save-As dialog lets you pick the folder."
                          : "Downloads the dated .dat to your browser's download folder. To CHOOSE the folder, enable Firefox → Settings → General → “Always ask you where to save files” (or use a Chromium browser)."}>
                      <Button size="compact-sm"
                        variant={shadows ? "outline" : "light"} color={shadows ? "red" : "teal"}
                        leftSection={<IconDownload size={14} />}
                        disabled={!canDownload}
                        onClick={() => void downloadComponentProposal(proposalName, proposalText)}>
                        Download estimate .dat
                      </Button>
                    </Tooltip>
                  </Group>
                )}
              </Group>
              {/* SHADOW explanatory strip -- pinned under the band (still
                  outside the scroll), so the override consequence is never
                  separated from the button by a scroll. */}
              {proposalText && shadows && (
                <Box px="md" pb={8}>
                  <Group gap={6} align="center" p="xs" wrap="nowrap"
                    style={{ border: "1px solid var(--mantine-color-red-7)", borderRadius: 6,
                             background: "rgba(224,49,49,0.10)" }}>
                    <IconAlertTriangle size={16} color="var(--mantine-color-red-5)" />
                    <Text size="xs" c="red.4">
                      <b>Shadow warning:</b> a component named <code>{comp}</code> already exists in
                      this case. Promoting this file to <code>constant/components/{comp}.dat</code> would
                      OVERRIDE it (the engine logs <code>[overlay]</code> when it does). Rename or remove
                      the existing one if that is not what you want.
                    </Text>
                  </Group>
                </Box>
              )}
            </Box>

            {/* SCROLL BODY -- the SEE-the-error evidence, one line under the band */}
            <Box px="md" py="md">
              <Table withTableBorder striped fz="sm"
                style={{ fontFamily: "var(--mantine-font-family-monospace)", maxWidth: 640 }}>
                <Table.Thead><Table.Tr>
                  <Table.Th>property</Table.Th>
                  <Table.Th ta="right">estimated</Table.Th>
                  <Table.Th>unit</Table.Th>
                  <Table.Th ta="right">reference</Table.Th>
                  <Table.Th ta="right">dev</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => {
                    const dev = row.ref !== undefined && row.est !== undefined && row.ref !== 0
                      ? (row.est - row.ref) / Math.abs(row.ref) * 100 : undefined;
                    const devColor = dev === undefined ? "dimmed"
                      : Math.abs(dev) <= 5 ? "green.5" : Math.abs(dev) <= 10 ? "yellow.5" : "orange.5";
                    return (
                      <Table.Tr key={row.label}>
                        <Table.Td>{row.label}</Table.Td>
                        <Table.Td ta="right">{fmtNum(row.est)}</Table.Td>
                        <Table.Td c="dimmed">{row.unit}</Table.Td>
                        <Table.Td ta="right">{row.ref !== undefined ? fmtNum(row.ref) : "—"}</Table.Td>
                        <Table.Td ta="right" c={devColor}>
                          {dev === undefined ? "—" : `${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%`}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
              {/* Flowsheet readiness: what this estimate is enough for, and the
                  gaps it must fill before a process uses it (the payoff view). */}
              <Group gap="xs" mt="sm" wrap="wrap" align="center">
                <Text size="10px" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: 0.4 }}>
                  flowsheet-ready for
                </Text>
                <ReadyChip ok={cap.eos} label="EoS" gap="needs Tc, Pc" />
                <ReadyChip ok={cap.gibbs} label="Gibbs reactor" gap="needs s_298 (Joback gives dGf, not S)" />
                <ReadyChip ok={cap.energy} label="energy balance" gap="needs Cp_ig" />
                <ReadyChip ok={cap.vle} label="VLE / flash" gap="needs Antoine" />
                <ReadyChip ok={cap.pump} label="pump / density" gap="needs Vliq" />
              </Group>
              <Text size="xs" c="dimmed" mt={6} maw={640}>
                Joback group contribution + Lee-Kesler ω. Estimation has error — Joback is
                weak on Tb of strongly H-bonding species and gives no Antoine/Psat or Vliq;
                fill those (a vapour-pressure fit + Rackett) before a flowsheet flashes or
                pumps this component. The per-group build-up is in the <b>Log</b> tab below.
              </Text>

              {/* The exact .dat bytes -- collapsed by default so they never push
                  the Download button (now in the sticky band) below the fold.
                  The GUI never writes the final <name>.dat; the header's `mv` is
                  the deliberate off-GUI promote. */}
              {proposalText && proposalName && (
                <Accordion variant="separated" radius="sm" mt="md" maw={760}>
                  <Accordion.Item value="preview">
                    <Accordion.Control>
                      <Text size="sm">Preview the exact .dat bytes — <code>{proposalName}</code></Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Text size="11px" c="dimmed" mb={4}>
                        Read-only — the exact bytes downloaded. Active keys are usable now (EoS + energy);
                        the commented GAP TODOs (Vliq, Psat, s_298) and the <code>mv</code> promote command
                        are in the file. The download keeps the DATED name; promote with the <code>mv</code>.
                      </Text>
                      <ScrollArea h={260} type="auto"
                        style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))", borderRadius: 6,
                                 background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
                        <Text component="pre" ff="monospace" size="11px" c="dimmed"
                          style={{ margin: 0, padding: 12, whiteSpace: "pre", lineHeight: 1.45 }}>
                          {proposalText}
                        </Text>
                      </ScrollArea>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** A flowsheet-readiness chip: green ✓ for a capability the estimate provides,
 *  red ✗ for a GAP (with what's missing) -- so the student sees, at creation,
 *  what the component still needs before a process can use it. */
function ReadyChip({ ok, label, gap }: { ok: boolean; label: string; gap?: string }) {
  return (
    <Badge variant="light" color={ok ? "green" : "red"} size="sm" radius="sm"
      styles={{ root: { textTransform: "none" } }}
      title={ok ? "available from this estimate" : `gap — ${gap ?? "missing"}`}>
      {ok ? "✓ " : "✗ "}{label}{!ok && gap ? ` · ${gap}` : ""}
    </Badge>
  );
}

/** Parse the consistency CSV (x1, lnGamma1, lnGamma2, lnRatio, gdResidual)
 *  emitted by vleConsistency, for the area-test plot. */
function parseConsistencyCsv(text?: string) {
  if (!text) return null;
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const h = lines[0]!.split(",").map((s) => s.trim());
  const ix = h.indexOf("x1"), i1 = h.indexOf("lnGamma1"),
        i2 = h.indexOf("lnGamma2"), ir = h.indexOf("lnRatio");
  if (ix < 0 || ir < 0 || i1 < 0 || i2 < 0) return null;
  const x: number[] = [], lnG1: number[] = [], lnG2: number[] = [], lnR: number[] = [];
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k]!.split(",");
    const xv = Number(c[ix]), rv = Number(c[ir]);
    if (!Number.isFinite(xv) || !Number.isFinite(rv)) continue;
    x.push(xv); lnR.push(rv); lnG1.push(Number(c[i1])); lnG2.push(Number(c[i2]));
  }
  return x.length > 0 ? { x, lnG1, lnG2, lnR } : null;
}

/** The VLE consistency view: the verdict (Herington area + Gibbs-Duhem + gamma_inf)
 *  ABOVE the AREA-TEST plot -- ln gamma_i and ln(gamma1/gamma2) vs x, with the
 *  net area shaded.  You SEE the +/- areas (which cancel for a consistent set),
 *  not just the number. */
function ConsistencyPanel({
  result, propsDict, csv,
}: { result: OperationResult; propsDict: JsonDict | null; csv?: string }) {
  const r = result;
  const op = findOp(propsDict, r.name);
  const d = r.diagnostics;
  const comp = (typeof op?.["component"] === "string" ? op["component"] : "1") as string;
  const partner = (typeof op?.["partner"] === "string" ? op["partner"] : "2") as string;
  const verdict = d.herington_pass === undefined ? undefined : d.herington_pass === 1;
  const dj = d.herington_D !== undefined && d.herington_J !== undefined
    ? Math.abs(d.herington_D - d.herington_J) : undefined;
  const g = parseConsistencyCsv(csv);

  const plotData: object[] = g ? [
    { type: "scatter", mode: "lines", name: `ln γ ${comp}`, x: g.x, y: g.lnG1,
      line: { color: "#22b8cf", width: 2 } },
    { type: "scatter", mode: "lines", name: `ln γ ${partner}`, x: g.x, y: g.lnG2,
      line: { color: "#e8590c", width: 2 } },
    { type: "scatter", mode: "lines+markers", name: "ln(γ₁/γ₂) — area test", x: g.x, y: g.lnR,
      line: { color: "#adb5bd", width: 1.5 }, marker: { size: 5, color: "#adb5bd" },
      fill: "tozeroy", fillcolor: "rgba(173,181,189,0.16)" },
    { type: "scatter", mode: "lines", x: [0, 1], y: [0, 0], hoverinfo: "skip", showlegend: false,
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" } },
  ] : [];
  const plotLayout: object = {
    ...darkLayout, autosize: true,
    title: { text: "Herington area test (isobaric):  D = 100·|∫| / ∫|·| ,  J = 150·ΔT/Tmin  →  consistent if |D−J| < 10  (the raw ∫ need NOT be 0)",
      font: { ...darkLayout.font, size: 12 } },
    legend: { ...darkLayout.legend, orientation: "h", y: -0.2, x: 0.5, xanchor: "center" },
    margin: { ...darkLayout.margin, t: 40, b: 64 },
    xaxis: { ...darkLayout.xaxis, title: { text: `liquid mole fraction  x_${comp}` }, range: [0, 1] },
    yaxis: { ...darkLayout.yaxis, title: { text: "ln γ" } },
  };

  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <Box px="md" py="sm" style={{ flex: "0 0 auto", borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
        <Group gap={8} align="baseline" wrap="wrap">
          <Text fw={600} c="accent">VLE consistency — {comp}/{partner}</Text>
          {verdict !== undefined && (
            <Badge color={verdict ? "green" : "red"} variant="light" size="sm"
              styles={{ root: { textTransform: "none" } }}>
              {verdict ? "Herington: consistent ✓" : "Herington: inconsistent ✗"}
            </Badge>
          )}
          {d.n_points !== undefined && <Text size="xs" c="dimmed">{d.n_points} pts</Text>}
        </Group>
        <Group gap="xl" mt={4}>
          <Text size="xs" c="dimmed" ff="monospace">
            Herington |D−J| = <Text span c={verdict === false ? "red.5" : verdict ? "green.5" : "dimmed"}>{fmtNum(dj)}</Text> (≤10 pass)
          </Text>
          <Text size="xs" c="dimmed" ff="monospace">
            Gibbs-Duhem resid: max {fmtNum(d.gd_max_resid)} · mean {fmtNum(d.gd_mean_resid)}
          </Text>
          <Tooltip multiline w={300} withArrow
            label="γ at the most-dilute MEASURED point — a proxy, not extrapolated to x→0. The water side here is only ~10 mol% dilute, so it understates the true γ∞.">
            <Text size="xs" c="dimmed" ff="monospace" style={{ cursor: "help" }}>
              γ (dilute-end proxy): {comp} {fmtNum(d.gamma1_inf)} · {partner} {fmtNum(d.gamma2_inf)}
            </Text>
          </Tooltip>
        </Group>
        <Text size="xs" c="dimmed" mt={2}>
          γ straight from the data (modified Raoult, Antoine Psat). Test the data before
          trusting any model fitted to it.
        </Text>
      </Box>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {g
          ? <Plot data={plotData} layout={plotLayout} config={PLOT_CONFIG}
              style={{ width: "100%", height: "100%" }} useResizeHandler />
          : <Box p="md"><Text c="dimmed" size="sm">No per-point γ data to plot.</Text></Box>}
      </Box>
    </Box>
  );
}

/** Right-aligned table header with a Mantine tooltip that opens on
 *  hover.  Helps students who don't yet know what `γ` or `Z` are. */
function ColHeader({ label, help }: { label: string; help: string }) {
  return (
    <Table.Th style={{ textAlign: "right" }}>
      <Tooltip label={help} multiline w={320} withArrow position="bottom" openDelay={150}>
        <Text component="span" size="xs" style={{ cursor: "help" }}>{label}</Text>
      </Tooltip>
    </Table.Th>
  );
}

/** One numerical cell, optionally annotated with a reference value.
 *  When `refValue` is present, shows "ref X (Δ%)" coloured by pass/fail.
 *  Prop name is `refValue` (not `ref`) because React reserves `ref` for
 *  forwardRef and silently swallows the value otherwise. */
function ValueCell({
  value,
  refValue,
  tol,
}: {
  value: number | undefined;
  refValue: number | undefined;
  tol: number;
}) {
  if (value === undefined) return <>—</>;
  if (refValue === undefined) return <>{fmtNum(value)}</>;
  const denom = Math.abs(refValue) > 1e-30 ? Math.abs(refValue) : 1;
  const relErr = (value - refValue) / denom;
  const pass = Math.abs(relErr) <= tol;
  const sign = relErr >= 0 ? "+" : "";
  return (
    <Stack gap={0} align="end">
      <Text size="xs" component="span">{fmtNum(value)}</Text>
      <Text size="xs" component="span" c={pass ? "green.6" : "red.6"} fw={500}
        title={`ref ${refValue} (tol ±${(tol * 100).toFixed(1)}%)`}>
        ref {fmtNum(refValue)} ({sign}{(relErr * 100).toFixed(2)}%) {pass ? "✓" : "✗"}
      </Text>
    </Stack>
  );
}

/** Compact number formatting: 4 sig-figs for "ordinary" magnitudes,
 *  scientific (2 decimals) for very small or very large numbers. */
/** Compact key/value table of one op's engine diagnostics (shared by the
 *  Results epilogue and the generic op panel -- same numbers, same source). */
function DiagnosticsTable({ diag, headline }: {
  diag: { [k: string]: number }; headline?: string[];
}) {
  const all = Object.keys(diag);
  if (all.length === 0)
    return <Text size="xs" c="dimmed">no diagnostics reported — see the Log</Text>;
  // The op's own ranking: headline keys (that the run produced) first,
  // emphasised; the rest follow in emission order.
  const head = (headline ?? []).filter((k) => diag[k] !== undefined);
  const rest = all.filter((k) => !head.includes(k));
  const keys = [...head, ...rest];
  return (
    <Table verticalSpacing={2} style={{ maxWidth: 560 }}>
      <Table.Tbody>
        {keys.map((k) => {
          const isHead = head.includes(k);
          return (
            <Table.Tr key={k}>
              <Table.Td><Text size="xs" ff="monospace"
                c={isHead ? "accent" : "dimmed"} fw={isHead ? 600 : undefined}>{k}</Text></Table.Td>
              <Table.Td><Text size="xs" ff="monospace"
                fw={isHead ? 600 : undefined}>{fmtNum(diag[k])}</Text></Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/** The GENERIC op panel (strategy P4): the fallback that guarantees no
 *  operation is ever invisible -- this op's diagnostics band on top, its
 *  output CSV plotted below (when it has one), an honest note when it
 *  doesn't, and an honest note when it produced no result at all. */
function OpGenericPanel({ opName, opType, result, csv, filename }: {
  opName: string; opType: string;
  result?: OperationResult; csv?: string; filename?: string;
}) {
  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex",
      flexDirection: "column", overflow: "hidden" }}>
      <Box px="md" py={8} style={{ flex: "0 0 auto" }}>
        <Group gap={8} mb={4}>
          <Text size="sm" fw={600} ff="monospace">{opName}</Text>
          <Badge size="xs" variant="light">{opType}</Badge>
        </Group>
        {result
          ? <DiagnosticsTable diag={result.diagnostics} headline={result.headline} />
          : <Text size="xs" c="dimmed">this operation reported no result — run the case, or see the Log for why it did not finish.</Text>}
      </Box>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {csv
          ? <CsvAutoPlot csv={csv} filename={filename} />
          : <Center style={{ height: "100%" }}>
              <Text size="xs" c="dimmed">no plottable output declared — the numbers above are this op's result.</Text>
            </Center>}
      </Box>
    </Box>
  );
}

/** The run's ANSWERS, first-class (docs/gui-props-strategy.md P1): one row per
 *  operation -- the op's own name, its type, its full engine diagnostics --
 *  plus a failure card IN PLACE for a target that did not finish.  The GUI
 *  twin of the runCase terminal epilogue: same numbers, same source (the
 *  machine block).  Silence is never a valid render: an op with no
 *  diagnostics SAYS so. */
function ResultsEpilogue({ runs }: { runs: Map<string, RunResult> }) {
  const entries = [...runs.entries()];
  return (
    <Box style={{ position: "absolute", inset: 0, overflow: "auto", padding: 16 }}>
      <Stack gap="lg">
        {entries.map(([caseName, r]) => (
          <Box key={caseName}>
            {entries.length > 1 && <Text size="sm" fw={600} mb={4}>{caseName}</Text>}
            {r.status !== "done" && (
              <Box mb="sm" p="sm"
                style={{ border: "1px solid var(--mantine-color-red-8)", borderRadius: 6 }}>
                <Group gap={6} mb={4}>
                  <IconAlertTriangle size={14} color="var(--mantine-color-red-5)" />
                  <Text size="sm" c="red.4" fw={600}>run did not finish</Text>
                </Group>
                <Text size="xs" c="dimmed"
                  style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                  {r.log.trimEnd().split("\n").slice(-8).join("\n")}
                </Text>
              </Box>
            )}
            {(r.operationResults ?? []).map((op) => (
              <Box key={op.name} mb="sm">
                <Group gap={8} mb={2}>
                  <Text size="sm" fw={600} ff="monospace">{op.name}</Text>
                  <Badge size="xs" variant="light">{op.type}</Badge>
                </Group>
                <DiagnosticsTable diag={op.diagnostics} headline={op.headline} />
              </Box>
            ))}
            {r.status === "done" && (r.operationResults ?? []).length === 0 && (
              <Text size="xs" c="dimmed">
                the run finished but reported no per-operation results — see the Log.
              </Text>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function fmtNum(v: number | undefined): string {
  if (v === undefined) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e-3 && abs < 1e6) return Number(v.toPrecision(5)).toString();
  return v.toExponential(2);
}
