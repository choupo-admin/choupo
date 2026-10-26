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
  PropsView -- a properties case's home: the WORKFLOW (DEV.md 4c C172; the
  name is Vitor's ruling, docs/design/one-app-two-homes.md).

  It renders for a PROPERTIES case only -- a propsDict and no flowsheet, or a
  two-mode case shown in its Workflow.  A process case has no Workflow: its
  thermo readiness is shown where its thermo is declared (the Case tab, at
  constant/thermoPhysPropDict), and a sector that carries a propsDict opens
  as its own case (the per-sector route that fanned a plant out to one
  choupoProps run per sector here is gone, with its own Run).

      ┌──────────────────────────────────────────────────────────────┐
      │  (two-mode case) status of the properties · Open the Flowsheet│
      ├──────────────────────────────────────────────────────────────┤
      │  one row: the case's question · About this case               │
      ├───────────────┬──────────────────────────────────────────────┤
      │  OUTLINE      │  THE WORKFLOW DIAGRAM (the home): one box per │
      │  studies and  │  step, studies as frames, arrows of           │
      │  numbered     │  information; a click opens the selection     │
      │  steps        │  card, a double click the step's own tab      │
      └───────────────┴──────────────────────────────────────────────┘
      Studies (the figures and tables of each study) and Reports (what the
      run produced) are menu entries beside it -- DEV.md 4c C172 slice 3b.

  NO RUN BUTTON HERE: the case has ONE Run, in the top toolbar
  (ui/RunButton.tsx), plus Ctrl+Enter; the TopBar runs choupoProps for a
  properties case (store.runResult) and, for a two-mode case, into
  store.propsRunResult so the Process result is not replaced.

  NO AUDIT SECTION (DEV.md 4c C172 item 5).  The pills that used to sit
  folded under the overview -- thermo readiness, the decision ledger, the
  results epilogue, the comparisons and every operation's own panel -- were
  each moved to the place they qualify: an operation's typed panel (a fit's
  statistics, an estimate, a consistency test, a Gibbs map, the property
  points) into that operation's details; the thermo readiness and the
  decision ledger into the details of the THERMO PACKAGE node; the
  comparisons of models with data into the overview, under the figures.  The
  results epilogue repeated the operations' numbers, which their details
  carry, and left.  Every comparison overlays model curves with the raw lab
  data (red points), so the engineer chooses a model from the EVIDENCE --
  never a "recommended" badge.
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
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import type { ExperimentalOverlay } from "./plotting/CsvAutoPlot.js";
import type { OperationResult, PairResolution, RunResult, ValidationBlock } from "../adapters/SolverAdapter.js";
import { downloadComponentProposal } from "../case/saveCase.js";
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
import { ReviewScreen } from "./ReviewScreen.js";
import { WorkflowHome } from "./WorkflowHome.js";
import { PropsReports } from "./PropsReports.js";
import { useWorkflowModel } from "./useWorkflowModel.js";
import { readinessProminent } from "../case/reviewScreen.js";
import { propsOpHelpLink } from "../case/modelDocs.js";
import { ThermoView } from "./ThermoView.js";
import { guideUrl, openGuide } from "../help/guideLinks.js";
import { declaredStudies, dictStory, purposeWords } from "../case/propsStudies.js";
import { Lesson } from "./Lesson.js";
import { CitationPanel } from "./CitationPanel.js";
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

/** Pretty trace name from a CSV filename: drops the trailing .csv. */
function stripCsvExt(name: string): string {
  return name.endsWith(".csv") ? name.slice(0, -4) : name;
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
   *  operation DO?  Set per-op from its type. */
  theory?: string;
  /** the operations this panel belongs to (DEV.md 4c C172: it is shown in
   *  their details) */
  ops?: string[];
  /** the generic panel (numbers + its CSV): an operation's details already
   *  carry both, so it is not rehomed */
  generic?: boolean;
}

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

/** The COMPARISON table, on screen: engine-computed AAD of each model vs the
 *  MEASURED data, per property -- the NUMBER under the data-vs-models overlay.
 *  Numbers only when the engine marked the row ok; otherwise the status word (a
 *  wrong AAD is worse than none).  Smaller AAD = closer to data (highlighted as
 *  evidence, not a recommended-by badge).  Defensive: "—" instead of throwing.
 *
 *  IT IS A COMPARISON, NOT A VALIDATION, and this surface used to say
 *  otherwise (corrected 2026-08-12).  `EvidencePartition::comparisonCaveat()`
 *  is the ONE wording of the difference, and the console lines were moved onto
 *  it in August -- the engine prints "Comparison '<dataset>'".  This panel was
 *  missed and went on reading "Validation (AAD vs data)": one sentence, two
 *  homes, one updated, and the stale home is the one a STUDENT reads.
 *
 *  The difference is load-bearing here rather than pedantic.  Agreement with
 *  measured data is validation only when the data were INDEPENDENT of the fit
 *  -- and the corpus contains both kinds side by side: compare_vle_etoh_water
 *  holds four models against Carey & Lewis, none of which saw those points,
 *  while compare_kinetics_order FITS k to the very series it is then compared
 *  against.  One panel serves both, so it must make the weaker claim; the
 *  caption below says which is which and points at where the case declares it. */
export function ValidationTable({ blocks, inline }: { blocks: ValidationBlock[];
  /** drawn in the flow of a page (Studies, Reports), not filling a box */
  inline?: boolean }) {
  const num = (x: number | null, digits = 4) =>
    typeof x === "number" && isFinite(x) ? String(Number(x.toPrecision(digits))) : "—";
  return (
    <Box style={inline ? undefined : { position: "absolute", inset: 0, padding: 16, overflow: "auto" }}>
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          Engine-computed average absolute deviation (AAD) of each model curve
          vs the measured points, interpolated onto the measured abscissa.
          Smaller is closer to the data.
        </Text>
        <Text size="xs" c="dimmed">
          This is a <b>comparison</b>, not a validation. It says a model agrees
          with these data; it does <b>not</b> say the data were independent of
          the fit that produced the model&rsquo;s parameters. A model fitted to
          this same series will sit close to it by construction. Which case you
          are looking at is declared in the case itself — the propsDict header
          says whether the parameters saw these points.
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
  // postProcessing/ CSVs are the run's VIEWS, drawn by the review screen
  // from their own description -- never re-plotted here as anonymous scans.
  const modelCsvNames = csvNames.filter((n) => !n.startsWith("exp_") && !n.startsWith("constant/")
    && !n.startsWith("postProcessing/"));
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

  // Comparison with data (AAD): the engine's quantified model-vs-measured
  // deviation, its own pill so the table fills the pane (no clash with the
  // overlay plot above).  The label says COMPARISON, not validation -- see
  // ValidationTable's header for why the weaker word is the correct one on a
  // panel that serves both an independent dataset and a fit's own training
  // series.  (The JSON field and the component name stay `validation`: that is
  // the engine's wire format, and renaming it here would break the adapters
  // without changing what a reader is told.)
  if (result?.validation && result.validation.length > 0) {
    out.push({ key: `${keyPrefix}cmp-aad`, group: "Comparison",
      label: `${labelPrefix}Comparison with data (AAD)`,
      node: <ValidationTable blocks={result.validation} inline /> });
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
          ops: ops.filter((o) => o && typeof o === "object" && !Array.isArray(o)
            && o["type"] === "propertyPoint").map((o) => String(o["name"])),
          node: <PropertyPointPanel points={points} references={references} /> });
      } else {
        out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations",
          label: `${labelPrefix}Property points`, theory: opHelp, ops: [opName], generic: true,
          node: <OpGenericPanel opName={opName} opType={opType} result={r} /> });
      }
      continue;
    }
    if (opType === "vleConsistency" && r) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp, ops: [opName],
        node: <ConsistencyPanel result={r} propsDict={propsDict} csv={csvText} /> });
      if (f) consumed.add(f);
      continue;
    }
    if (opType === "estimateComponent" && r) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp, ops: [opName],
        node: <EstimatePanel results={[r]} propsDict={propsDict}
          proposals={result?.proposals} components={thermoComponents} /> });
      continue;
    }
    if (opType === "gibbsMap" && csvText) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp, ops: [opName],
        node: <GibbsMapPanel op={op} csv={csvText} /> });
      if (f) consumed.add(f);
      continue;
    }
    if (opType === "fitParameters" && r) {
      out.push({ key: `${keyPrefix}op:${opName}`, group: "Operations", label: `${labelPrefix}${opName}`,
        theory: opHelp, ops: [opName],
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
      theory: opHelp, ops: [opName], generic: true,
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
    //  (shown by the Workflow's "Other plots", which draws every CSV no view
    //  draws -- so it is marked generic and not rehomed a second time)
    out.push({ key: `${keyPrefix}scan:${n}`, group: "Operations", label: `${labelPrefix}${stripCsvExt(n)}`,
      generic: true, node: <CsvAutoPlot csv={text} filename={n} /> });
  }
  return out;
}

/** WHAT EVERY VIEW OF A PROPERTIES CASE DERIVES FROM ITS RUN, in one place:
 *  each operation's own typed panel (a fit's statistics, an estimate, a
 *  consistency test, a Gibbs map, the property points), the comparisons of
 *  models with measured data, and the decisions the run took.  The Studies
 *  view, a step's tab and the Reports read it. */
export function usePropsPanels(result: RunResult | undefined, showLab = true) {
  const propsDict = useStore((s) => s.caseFiles.propsDict) ?? null;
  const thermoComponents = useStore((s) => s.caseFiles.thermoPackage?.["components"]);
  const targetItems = useMemo<PropsItem[]>(() => buildTargetItems({
    result, propsDict, thermoComponents, showLab, labelPrefix: "", keyPrefix: "",
  }), [result, propsDict, thermoComponents, showLab]);
  const opPanels = useMemo(() => {
    const m = new Map<string, React.ReactNode>();
    for (const it of targetItems)
      if (it.group === "Operations" && !it.generic)
        for (const op of it.ops ?? []) m.set(op, it.node);
    return m;
  }, [targetItems]);
  const comparisons = targetItems.filter((it) => it.group === "Comparison");
  const ops = useMemo(() => result?.operationResults ?? [], [result]);
  const pairs = useMemo<PairResolution[]>(() => {
    const seen = new Set<string>();
    const out: PairResolution[] = [];
    for (const p of result?.thermoResolution ?? []) {
      const k = `${p.i}|${p.j}|${p.model}`;
      if (!seen.has(k)) { seen.add(k); out.push(p); }
    }
    return out;
  }, [result]);
  const datasets = useMemo(() => result?.experimentalDatasets ?? [], [result]);
  const ran = result?.status === "done";
  const ledgerRows = ran ? buildLedger(ops, pairs, datasets) : [];
  const ledger = propsDict && ran && ledgerRows.length > 0 ? <DecisionLedger ops={ops} pairs={pairs} datasets={datasets} /> : null;
  return { opPanel: (op: string) => opPanels.get(op), comparisons, ledger, ledgerRows };
}

/** The comparisons, drawn: each model curve with the measured points, then
 *  the engine's AAD of each. */
function comparisonNodes(comparisons: PropsItem[]): React.ReactNode {
  return comparisons.length > 0 ? comparisons.map((c) => (
    <Box key={c.key} data-comparison={c.key}>
      <Text size="xs" fw={600} mb={4}>{c.label}</Text>
      <Box style={{ position: "relative", height: c.key.endsWith("aad") ? "auto" : "60vh",
        minHeight: c.key.endsWith("aad") ? 0 : 380 }}>{c.node}</Box>
    </Box>
  )) : null;
}

/** A properties case's three views: its WORKFLOW (the home, the diagram), its
 *  STUDIES (the figures and tables of each study) and its REPORTS (what the
 *  run produced, to read and take away).  DEV.md 4c C172 slice 3b. */
export type PropsViewKind = "workflow" | "studies" | "reports";

export function PropsView({ view = "workflow" }: { view?: PropsViewKind }) {
  const caseFiles = useStore((s) => s.caseFiles);
  const tutorialName = useStore((s) => s.tutorialName);
  const controlDict = useStore((s) => s.caseFiles.controlDict);
  const propsRunAt = useStore((s) => s.propsRunAt);
  const flowsheetRunAt = useStore((s) => s.flowsheetRunAt);

  const hasFlowsheet = Boolean(caseFiles.flowsheet);
  const setCaseMode = useStore((s) => s.setCaseMode);
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

  //  THE ONE TARGET: this case's own propsDict.
  const propsDict = caseFiles.propsDict ?? null;
  const hasProps = propsDict !== null;
  const model = useWorkflowModel();
  const result = model.result;

  // Raw lab-data overlays toggle (default on when present).
  const [showLab, setShowLab] = useState(true);
  const anyLabData = useMemo(
    () => Object.keys(result?.csvFiles ?? {}).some((n) => n.startsWith("exp_")),
    [result],
  );
  const panels = usePropsPanels(result, showLab);
  const ran = result?.status === "done";
  const nUnjustified = panels.ledgerRows.filter((r) => r.flag === "bad").length;
  const failed = result !== undefined && !ran;
  const consolidated = ran && nUnjustified === 0;

  // ITERATION audit: is the last simulation coherent with the current props?
  const simStale = flowsheetRunAt > 0 && propsRunAt > flowsheetRunAt;
  const simCurrent = flowsheetRunAt > 0 && propsRunAt > 0 && flowsheetRunAt >= propsRunAt;

  //  F1 with NOTHING selected: the Props Workflow Guide (the workflow model
  //  answers first, in the capture phase, for whatever is selected).  The
  //  case's own story lives behind the visible "About this case" button --
  //  two questions, two doors.
  const [helpOpen, setHelpOpen] = useState(false);
  const rawFiles = useStore((s) => s.caseFiles.rawFiles);
  const caseReadme = rawFiles?.["README.md"];
  const caseStory = useMemo(
    () => (caseReadme ? null : dictStory(rawFiles?.["system/propsDict"])), [rawFiles, caseReadme]);
  const aboutStudies = useMemo(() => declaredStudies(propsDict), [propsDict]);
  const focusProps = useStore((s) => s.focusProps);
  const selected = model.selected;
  const targetOf = model.targetOf;
  const activate = model.activate;
  useEffect(() => {
    //  F1 with a selection opens what it is about (a step's operation
    //  section, a model's theory, a file); with none, the Props Workflow
    //  Guide.  Capture phase, so it answers before the shell's own F1.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F1") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const t = view === "workflow" && selected ? targetOf(selected) : undefined;
      if (t) activate(t);
      else openGuide(guideUrl("propsGuide"));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [view, selected, targetOf, activate]);

  //  a selection asked for from outside (a unit's link to its fit, C152)
  const propsFocus = useStore((s) => s.propsFocus);
  const select = model.select;
  useEffect(() => { if (propsFocus) select(propsFocus.id); }, [propsFocus, select]);

  const readiness = <Box style={{ position: "absolute", inset: 0 }}><ThermoView /></Box>;
  const reviewOps = (propsDict?.["operations"] ?? []) as JsonDict[];

  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" }}>
      <Drawer opened={helpOpen} onClose={() => setHelpOpen(false)} position="right"
        size="xl" title={`About this case — ${tutorialName}`}>
        <Box data-about="">
        {typeof controlDict?.["description"] === "string" && (
          <Text size="sm" mb="md">{controlDict["description"] as string}</Text>
        )}
        {aboutStudies.length > 0 && (
          <Box mb="md" data-about-studies="">
            <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4} style={{ letterSpacing: 0.5 }}>
              The questions it asks (its <code>studies</code>, in order)
            </Text>
            <Stack gap={6}>
              {aboutStudies.map((st) => (
                <Box key={st.name} style={{ borderLeft: "3px solid var(--mantine-color-cyan-6)", paddingLeft: 8 }}>
                  <Anchor component="button" type="button" size="sm" fw={700} data-about-study={st.name}
                    onClick={() => { setHelpOpen(false); focusProps(`study:${st.name}`); }}
                    title="Show this study on the Workflow">
                    {st.title}
                  </Anchor>
                  <Text size="xs" c="cyan.7">{purposeWords(st.purpose).label} -- {st.ops.length} operation(s)</Text>
                  {st.summary && <Text size="xs" c="dimmed">{st.summary}</Text>}
                </Box>
              ))}
            </Stack>
          </Box>
        )}
        {caseReadme ? (
          <Box data-about-readme="">
            <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4} style={{ letterSpacing: 0.5 }}>
              The case's introduction (README.md)
            </Text>
            <Lesson md={caseReadme} />
          </Box>
        ) : caseStory ? (
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{caseStory}</Text>
        ) : (
          <Text size="sm" c="dimmed">
            This case carries no introduction -- no README.md and no comment
            block in its propsDict beyond the banner -- so the description
            above is all it says about itself.
          </Text>
        )}
        {/* HOW TO CITE (DEV.md 4c C171 B): Choupo from CITATION.cff, the
            engine this page runs, and this case's declared primary sources. */}
        <Box mt="md" data-about-cite="">
          <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4} style={{ letterSpacing: 0.5 }}>
            How to cite
          </Text>
          <CitationPanel controlDict={controlDict ?? null} />
        </Box>
        </Box>
        <Text size="xs" c="dimmed" mt="md">F1 opens the THEORY of what is selected; with nothing
          selected, the Props Workflow Guide.</Text>
      </Drawer>

      {/* A TWO-MODE case: the properties and the flowsheet are ONE case --
          the validated foundation IS what the simulation runs.  This bar says
          how the properties stand and crosses to the Flowsheet; it does NOT
          run anything (the case's Run is the toolbar's). */}
      {hasFlowsheet && (
        <Group justify="space-between" px="md" py={6}
          style={{ borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))", background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
          <Group gap={6} align="center">
            {!result ? (
              <Text size="xs" c="dimmed">Run the workflow (the toolbar's Run) to consolidate the properties.</Text>
            ) : failed ? (
              <>
                <IconAlertTriangle size={15} color="var(--mantine-color-red-5)" />
                <Text size="xs" c="red.4">The workflow run failed — see the Log; not consolidated.</Text>
              </>
            ) : consolidated ? (
              <>
                <IconCircleCheck size={15} color="var(--mantine-color-teal-4)" />
                <Text size="xs" c="teal.4">Properties consolidated — {panels.ledgerRows.length} decision{panels.ledgerRows.length === 1 ? "" : "s"}, all sourced.</Text>
              </>
            ) : (
              <>
                <IconAlertTriangle size={15} color="var(--mantine-color-yellow-4)" />
                <Text size="xs" c="yellow.4">{nUnjustified} unjustified decision(s) — resolve before simulating (Reports lists them).</Text>
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
            <Text size="xs" c="dimmed" style={{ flex: "0 0 auto" }}>
              Plant unwired — add <code>connections</code> in <code>flowsheetDict</code> to assemble + simulate.
            </Text>
          ) : (
            <Button size="xs" variant={consolidated ? "filled" : "light"} color={consolidated ? "teal" : "gray"}
              rightSection={<IconArrowRight size={14} />}
              onClick={() => setCaseMode("process")}
              title="Show the Flowsheet -- it runs on the foundation validated here">
              Open the Flowsheet
            </Button>
          )}
        </Group>
      )}

      {/* Header strip: the case's question beside its introduction (and, on
          the Studies, the lab-data toggle) -- ONE row (DEV.md 4c C172 slice 3:
          every pixel above the drawing is a pixel it is smaller). */}
      <Box style={{ flex: "0 0 auto", padding: "6px 16px",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))", background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
        <Group justify="flex-start" gap="md" wrap="nowrap" align="center">
          {description && (
            <Text size="sm" c="var(--mantine-color-text)" fw={500} lineClamp={1} title={description}
              style={{ lineHeight: 1.3, flex: 1, minWidth: 0 }} data-case-question="">{description}</Text>
          )}
          <Button size="xs" variant="light" style={{ flex: "0 0 auto" }}
            onClick={() => setHelpOpen(true)}>
            About this case
          </Button>
          {view === "studies" && anyLabData && (
            <Checkbox size="xs" checked={showLab} onChange={(e) => setShowLab(e.currentTarget.checked)}
              label={
                <Group gap={4} align="center">
                  <Box style={{ width: 9, height: 9, borderRadius: 9, background: "#ff5252" }} />
                  <Text size="xs">Lab data</Text>
                </Group>
              }
              title="Overlay the raw experimental points on the model curves" />
          )}
          {!hasProps && (
            <Text size="xs" c="dimmed">
              This case declares no propsDict, so it has no Workflow.
            </Text>
          )}
        </Group>
      </Box>

      {hasProps && (
        <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {view === "workflow" ? (
            <WorkflowHome model={model} />
          ) : view === "studies" ? (
            <ReviewScreen model={model} readiness={readiness}
              readinessProminent={readinessProminent(reviewOps)}
              opPanel={panels.opPanel}
              comparisons={comparisonNodes(panels.comparisons)} />
          ) : (
            <PropsReports model={model} ledger={panels.ledger} readiness={readiness}
              validation={result?.validation && result.validation.length > 0
                ? <ValidationTable blocks={result.validation} inline /> : null} />
          )}
        </Box>
      )}
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
    gibbs: has("standardThermochemistry"),
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
        //
        // BOTH SPELLINGS, and the second one is the live engine's (fixed
        // 2026-09-24).  `EstimateComponent.cpp` writes `<comp>.estimated.dat`
        // -- "ONE stable proposal, replaced per run", in its own comment --
        // and this reader matched only the RETIRED dated form
        // `<comp>.estimate-<date>.dat`.  The worker harvests both
        // (solverWorker.js), so the file arrived and this lookup dropped it:
        // `proposalName` stayed null, the "Preview the exact .dat bytes"
        // accordion never rendered, and the download stayed disabled -- on a
        // welcome card whose whole lesson is that the estimate is a RECORD
        // YOU CAN READ.  The dated form is kept because a result carried over
        // from an older engine still resolves; the day nothing writes it, it
        // goes.
        const proposalEntry = Object.entries(proposals ?? {}).find(
          ([path]) => new RegExp(`(^|/)${comp}\\.(estimated|estimate-.*)\\.dat$`).test(path));
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
                        the commented GAP TODOs the method could not fill, and the <code>mv</code> promote
                        command, are in the file. The download keeps the file's own name; promote with the
                        <code>mv</code>.
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

function fmtNum(v: number | undefined): string {
  if (v === undefined) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e-3 && abs < 1e6) return Number(v.toPrecision(5)).toString();
  return v.toExponential(2);
}
