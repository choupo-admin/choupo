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
  ReviewScreen -- THE WORKFLOW: A PROPERTIES CASE'S HOME (DEV.md 4c C149,
  C151, C172 slice 3; docs/design/one-app-two-homes.md item 3).

  Three panes:

    LEFT    the OUTLINE (ui/WorkflowOutline.tsx) -- the case's declared
            studies, each with its NUMBERED STEPS in the order the run takes
            them (case/workflowSteps.ts: a set of runs a declared view draws
            together is one step), then, folded, the data, models and records
            the steps read and write.  A list, never a canvas.
    CENTRE  the RESULTS of what is selected: with nothing selected, the
            OVERVIEW (each study's figures, tables and numbers, then what
            ran); a study, ITS results, figures first; a step, ITS results
            (its figures, what it found, its numbers and its own panel); a
            dataset, a model or a record, its details (PropsDetails).
            "Results" names only what a run produced.
    RIGHT   the INSPECTOR (ui/WorkflowInspector.tsx) -- the selected step:
            what it reads (datasets FIT or HELD OUT, the band declared before
            the fit), the model with its options inside it, what it writes
            (the engine's own file-traffic table, case/fileTraffic.ts) with
            its fingerprint, and its verdict with its identifiability.

  THE CALCULATION MAP is behind View > Calculation map (the store's
  `propsMapOpen`), CLOSED BY DEFAULT: when open it is drawn above the centre
  at C151's computed height (ui/propsSplit.ts), and the panel contract owns
  it (no seam to drag, C172 item 5).

  One selection: a step in the outline, a block of the map, a row of the
  verdict strip, a dataset in the inspector select the same object
  everywhere (a step's id is its first operation's map id).  F1 opens what it
  is about: a step's operation section, a model's theory, a figure, a file.

  DEV.md 4c C154 (an external reviewer's walk through NanoFiltran): the
  strip keeps the RUN status apart from the status of the EVIDENCE and says
  "not applicable" where an op type cannot publish an AAD; the selection and
  the expanded blocks survive a trip to another tab (the store keeps them per
  case); every block of the map shows its STATE (case/propsMapState.ts).

  Nothing here computes a number (reviewScreen.ts for the strip,
  postProcessing.ts for the views, propsMap.ts for the map).
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionIcon, Badge, Box, Button, Group, ScrollArea, Select, Stack, Table, Text, Tooltip } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconFileCode, IconX } from "@tabler/icons-react";

import type { OperationResult, RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { viewGroups, type PostItem, type PostReference, type ViewGroup } from "../case/postProcessing.js";
import { numbersOnlyOps, RUN_STATE_WORD, verdictRows, type HeldOutStatistic, type RunState, type VerdictRow } from "../case/reviewScreen.js";
import { declaredStudies, purposeWords, type Study } from "../case/propsStudies.js";
import { mapStates } from "../case/propsMapState.js";
import { useStaleParts } from "../state/useStaleResult.js";
import { PROPS_DISCIPLINES } from "../case/operationSchemas.js";
import {
  caseTree, derivePropsMap, neighbours, PROPS_DICT_PATH, viewDomId, viewsOf,
  type CaseTreeNode, type MapTarget, type MyPlot, type PropsMap,
} from "../case/propsMap.js";
import { locatePropsBlocks } from "../case/propsDictLocate.js";
import { useStore } from "../state/store.js";
import { openGuide } from "../help/guideLinks.js";
import { CURATION_COLOUR } from "./FitStatsPanel.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { PropsMapCanvas } from "./PropsMap.js";
import {
  CaseLink, Diagnostics, FigureGrid, FittedParametersBlock, PointTableViews, SelectionDetails,
} from "./PropsDetails.js";
import { useMeasuredBoxHeight, useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import { WorkflowOutline } from "./WorkflowOutline.js";
import { WorkflowInspector } from "./WorkflowInspector.js";
import { stepLabel, stepOfOp, workflowOutline, type WorkflowStep, type WorkflowStudy } from "../case/workflowSteps.js";
import { operationMapMeta } from "../case/operationSchemas.js";
import {
  PROPS_MAP_PANEL, PanelCollapseButton, PanelReopenStrip, PanelResizeHandle, WORKFLOW_OUTLINE_PANEL,
  panelBoxProps, shownTopPanelPx, usePanel, usePanelShortcut,
} from "./panelContract.js";
import { clampSize } from "../state/prefs.js";
import { autoMapPx, DETAILS_FLOOR_PX, openDetailsCap } from "./propsSplit.js";

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <Box mb={6}>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>{children}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Box>
  );
}

function pct(v: number | null): string {
  return v === null ? "" : `${v.toPrecision(3)} %`;
}

/** A held-out statistic with the unit the engine published for it (a
 *  relative % for a bubble-point fit, rejection points for a membrane fit --
 *  case/reviewScreen.ts heldOutStatistic). */
function HeldOutCell({ h }: { h: HeldOutStatistic }) {
  const unit = h.unit === "%" ? " %" : h.published ? ` ${h.unit}` : "";
  return (
    <Tooltip withArrow multiline maw={300}
      label={`${h.key} -- the fit's deviation on evidence it never saw${h.published ? "" : " (the engine published no unit for it)"}`}>
      <span>{Number(h.value.toPrecision(3))}{unit}</span>
    </Tooltip>
  );
}

/** Rows shown before the strip folds: a case of twenty operations must not
 *  push its figures below the fold. */
const STRIP_ROWS = 8;

const RUN_COLOUR: Record<RunState, string> = { done: "teal", failed: "red", noResult: "orange", notRun: "gray" };

/** What the two status columns mean, said once (DEV.md 4c C154). */
const RUN_EVIDENCE_SENTENCE = "run: whether the operation ran to its end.  evidence: what its answer claims -- a"
  + " verdict only where the operation tests it against a band declared before the run.  Converging is not"
  + " a verdict, and no operation is called validated for having run.";

/** A cell an op type cannot fill, said as such (never an empty cell that
 *  reads as a missing result). */
function NotApplicable({ why }: { why: string }) {
  return (
    <Tooltip label={why} withArrow multiline maw={300}>
      <Text span size="xs" c="dimmed" fs="italic" data-na="" style={{ whiteSpace: "nowrap" }}>not applicable</Text>
    </Tooltip>
  );
}

function VerdictStrip({ rows, ran, selected, onSelect, linkOf }: {
  rows: VerdictRow[]; ran: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  linkOf?: (op: string) => MapTarget | undefined;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, STRIP_ROWS);
  //  the purpose column only where it tells rows apart (inside one study
  //  every row has the study's purpose, which its header already says)
  const anyPurpose = new Set(rows.map((r) => r.purpose)).size > 1;
  return (
    <>
    <ScrollArea type="auto">
      <Table withTableBorder fz="xs" verticalSpacing={3} data-review="verdicts"
        style={{ minWidth: 760 }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>operation</Table.Th>
            <Table.Th>what it did</Table.Th>
            {anyPurpose && <Table.Th>purpose</Table.Th>}
            <Table.Th title={RUN_EVIDENCE_SENTENCE}>run</Table.Th>
            <Table.Th title={RUN_EVIDENCE_SENTENCE}>evidence</Table.Th>
            <Table.Th ta="right">points</Table.Th>
            <Table.Th ta="right">AAD vs data</Table.Th>
            <Table.Th ta="right">held-out AAD</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((r, i) => {
            const link = linkOf?.(r.name);
            const isSel = selected === `op:${r.name}`;
            return (
            <Table.Tr key={r.name} data-verdict-row={r.name}
              style={{ ...(!r.ran && ran ? { opacity: 0.6 } : {}),
                ...(isSel ? { background: "light-dark(var(--mantine-color-yellow-1), rgba(250,204,21,0.18))" } : {}) }}>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                <Group gap={4} wrap="nowrap">
                  {link && link.kind === "case" && (
                    <Tooltip label={`its block in ${link.path} (lines ${link.line}-${link.endLine})`} withArrow>
                      <ActionIcon size={16} variant="subtle" aria-label="open in Case"
                        onClick={() => window.dispatchEvent(new CustomEvent("choupo:openCase", { detail: link }))}>
                        <IconFileCode size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Text span size="xs" ff="monospace" fw={600}
                    style={onSelect ? { cursor: "pointer", textDecoration: "underline dotted" } : undefined}
                    onClick={() => onSelect?.(`op:${r.name}`)}>{r.name}</Text>
                  <Text span size="xs" c="dimmed"> · {r.type}</Text>
                </Group>
              </Table.Td>
              <Table.Td>
                {/* the type's sentence once per run of one type, not twenty times */}
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {i > 0 && shown[i - 1]!.type === r.type ? "″" : r.did}
                </Text>
              </Table.Td>
              {anyPurpose && (
                <Table.Td data-purpose={r.purpose}>
                  {r.purpose ? (
                    <Tooltip label={purposeWords(r.purpose).sentence} withArrow multiline maw={320}>
                      <Text size="xs" lineClamp={2}>
                        {i > 0 && shown[i - 1]!.purpose === r.purpose ? "″" : purposeWords(r.purpose).label}
                      </Text>
                    </Tooltip>
                  ) : <Text size="xs" c="dimmed">in no declared study</Text>}
                </Table.Td>
              )}
              <Table.Td data-run-state={r.runState} style={{ whiteSpace: "nowrap", minWidth: 74 }}>
                <Badge size="md" variant={r.runState === "done" ? "light" : "outline"} color={RUN_COLOUR[r.runState]}
                  style={{ textTransform: "none", overflow: "visible" }}>
                  {RUN_STATE_WORD[r.runState]}{r.rc !== null ? ` (rc ${r.rc})` : ""}
                </Badge>
              </Table.Td>
              <Table.Td data-evidence="" style={{ minWidth: 200 }}>
                <Group gap={4} wrap="nowrap">
                  {r.verdict ? (
                    <Badge size="md" variant="light" color={CURATION_COLOUR[r.verdict] ?? "gray"}
                      style={{ textTransform: "none", overflow: "visible", flexShrink: 0 }}>{r.verdict}</Badge>
                  ) : (
                    <Text size="xs" c="dimmed">
                      {r.runState === "done" ? "no acceptance test in this run" : "--"}
                    </Text>
                  )}
                  {/* IDENTIFIABILITY BESIDE THE VERDICT (DEV.md 4c C172 item
                      6): a different question -- are the parameters
                      separately determined? -- never merged into it. */}
                  {r.identifiable !== null && (
                    <Tooltip withArrow multiline maw={320}
                      label={r.identifiable
                        ? "Identifiable: the data determine each fitted parameter separately (the fit's own `identifiable` diagnostic)."
                        : "NOT identifiable: the data do not determine each fitted parameter separately -- some trade off against each other (the fit's own `identifiable` diagnostic).  A different question from the verdict beside it."}>
                      <Badge size="md" variant="outline" data-identifiable={r.identifiable ? "1" : "0"}
                        color={r.identifiable ? "gray" : "red"} style={{ textTransform: "none", overflow: "visible", flexShrink: 0 }}>
                        {r.identifiable ? "identifiable" : "not identifiable"}
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
              </Table.Td>
              <Table.Td ta="right" ff="monospace">
                {r.points && (
                  <Tooltip label={`the op's ${r.points.key}`} withArrow>
                    <span>{r.points.value}</span>
                  </Tooltip>
                )}
              </Table.Td>
              <Table.Td ta="right" ff="monospace">
                {r.aadApplicable ? pct(r.aadPct)
                  : <NotApplicable why="This operation type compares its answer with no dataset, so it publishes no AAD." />}
              </Table.Td>
              <Table.Td ta="right" ff="monospace" data-held-out={r.heldOut?.key ?? ""}>
                {r.heldOutApplicable ? (r.heldOut ? <HeldOutCell h={r.heldOut} /> : "")
                  : <NotApplicable why="This operation type fits nothing, so no evidence is held out of a fit." />}
              </Table.Td>
            </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
    {rows.length > STRIP_ROWS && (
      <Button size="compact-xs" variant="subtle" mt={4} onClick={() => setAll(!all)}>
        {all ? "show the first " + STRIP_ROWS : "show all " + rows.length + " operations"}
      </Button>
    )}
    </>
  );
}

function groupTitle(g: ViewGroup, ops: JsonDict[]): string {
  if (g.origin === "declared") return "Declared in the propsDict (`views`)";
  const op = ops.find((o) => o && typeof o === "object" && !Array.isArray(o) && o["name"] === g.op);
  const type = op && typeof op["type"] === "string" ? op["type"] : "";
  return `${g.op}${type ? ` · ${type}` : ""} — default views`;
}

function ViewGrid({ groups, ops, csvFiles, kind, linkOf }: {
  groups: ViewGroup[]; ops: JsonDict[]; csvFiles: { [f: string]: string };
  kind: "plot" | "table";
  linkOf: (it: PostItem) => MapTarget | undefined;
}) {
  const shown = groups
    .map((g) => ({ g, items: g.items.filter((i) => i.kind === kind) }))
    .filter((x) => x.items.length > 0);
  if (shown.length === 0)
    return <Text size="sm" c="dimmed">No {kind === "plot" ? "figure" : "table"} published.</Text>;
  return (
    <Stack gap="md">
      {shown.map(({ g, items }) => (
        <Box key={`${g.origin}:${g.op}`}>
          <Text size="xs" fw={600} mb={4} ff={g.origin === "default" ? "monospace" : undefined}>
            {groupTitle(g, ops)}
          </Text>
          <FigureGrid items={items} csvFiles={csvFiles} linkOf={linkOf} />
        </Box>
      ))}
    </Stack>
  );
}

/** The CSVs a run wrote that no view draws: the free auto-plots the Plots tab
 *  used to hold for a props case, one home now. */
export function otherCsvFiles(csvFiles: { [f: string]: string } | undefined): string[] {
  return Object.keys(csvFiles ?? {})
    .filter((f) => !f.startsWith("postProcessing/") && !/(^|\/)exp_/.test(f))
    .sort();
}

/* ---- My plots: per-viewer, per-case (localStorage, a convenience) -------- */

const plotsKey = (caseKey: string) => `choupo.myPlots.${caseKey}`;
function loadPlots(caseKey: string): MyPlot[] {
  try {
    const v = JSON.parse(localStorage.getItem(plotsKey(caseKey)) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.file === "string") : [];
  } catch { return []; }
}
function savePlots(caseKey: string, plots: MyPlot[]) {
  try { localStorage.setItem(plotsKey(caseKey), JSON.stringify(plots)); } catch { /* private window */ }
}

function OtherPlots({ files, csvFiles }: { files: string[]; csvFiles: { [f: string]: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <details data-review="other-plots" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: "pointer" }}>
        <Text span size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
          Other plots
        </Text>
        <Text span size="xs" c="dimmed"> — {files.length} CSV file(s) the run wrote that no view draws,
          plotted as they are (+ under My plots keeps one)</Text>
      </summary>
      {open && (
        <Stack gap="md" mt="xs">
          {files.map((f) => (
            <Box key={f} style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
              borderRadius: 6, padding: 8 }}>
              <Text size="xs" ff="monospace" mb={4}>{f}</Text>
              <CsvAutoPlot csv={dropPointColumn(csvFiles[f] ?? "")} filename={f} />
            </Box>
          ))}
        </Stack>
      )}
    </details>
  );
}

/** The views of one study: the default views of its operations and every
 *  declared view one of its operations feeds (the map's own wires), in the
 *  run's order. */
export function studyViews(st: Study, map: PropsMap, items: PostItem[]): PostItem[] {
  const ops = new Set(st.ops);
  return items.filter((it) => {
    if (it.origin === "default") return ops.has(it.op);
    const id = `view:${viewDomId("declared", "", it.name)}`;
    return neighbours(map, id).up.some((u) => u.startsWith("op:") && ops.has(u.slice(3)));
  });
}

/** Those operations' numbers, drawn inline with the units the engine
 *  publishes (PropsDetails' table, the one home). */
function InlineNumbers({ results, linkOf, onSelect }: {
  results: OperationResult[];
  linkOf: (op: string) => MapTarget | undefined;
  onSelect: (id: string) => void;
}) {
  if (results.length === 0) return null;
  return (
    <Stack gap="md" data-review="inline-numbers">
      {results.map((r) => {
        const link = linkOf(r.name);
        return (
          <Box key={r.name} data-inline-op={r.name}>
            <Group gap={6} mb={4} wrap="wrap" align="baseline">
              <Text size="sm" fw={700} ff="monospace" style={{ cursor: "pointer", textDecoration: "underline dotted" }}
                onClick={() => onSelect(`op:${r.name}`)}>{r.name}</Text>
              <Text span size="xs" c="dimmed">· {r.type}</Text>
              {link && <CaseLink t={link} small />}
            </Group>
            <Diagnostics r={r} />
          </Box>
        );
      })}
    </Stack>
  );
}

/** WHAT WILL RUN (DEV.md 4c C172 slice 3): a study's numbered steps, each
 *  with what its type does, before a run -- the verdict strip's columns are
 *  all "not run" then, and say nothing a reader came for.  A row selects its
 *  step. */
function StepPlan({ steps, rows, onSelect }: {
  steps: WorkflowStep[]; rows: VerdictRow[]; onSelect: (id: string) => void;
}) {
  if (steps.length === 0) return null;
  return (
    <Table withTableBorder fz="sm" verticalSpacing={3} data-review="step-plan">
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: 52 }}>step</Table.Th>
          <Table.Th>operation</Table.Th>
          <Table.Th>what it does</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {steps.map((s, i) => {
          const did = rows.find((r) => r.name === s.ops[0])?.did ?? "";
          const same = i > 0 && steps[i - 1]!.type === s.type;
          return (
            <Table.Tr key={s.id} data-plan-step={s.number} style={{ cursor: "pointer" }} onClick={() => onSelect(s.id)}>
              <Table.Td ff="monospace" fw={700}>{s.number}</Table.Td>
              <Table.Td>
                <Text span size="sm" ff="monospace" style={{ textDecoration: "underline dotted" }}>{stepLabel(s)}</Text>
                <Text size="xs" c="dimmed">{s.type}{s.ops.length > 1 ? ` · ${s.ops.length} runs, drawn together` : ""}</Text>
              </Table.Td>
              <Table.Td><Text size="xs" c="dimmed" lineClamp={2}>{same ? "as above" : did}</Text></Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/** One declared study: its question, what kind of check it is, its
 *  operations (the strip), then its figures and tables. */
function StudySection({ st, rows, map, strip, groups, csvFiles, linkOf, ran, references, onOpen, link,
  results, opLinkOf, onSelect, steps }: {
  st: Study; rows: VerdictRow[]; map: PropsMap;
  /** the run's operation results, for the ones answered by numbers only */
  results: readonly OperationResult[];
  opLinkOf: (op: string) => MapTarget | undefined;
  onSelect: (id: string) => void;
  strip: (rows: VerdictRow[]) => ReactNode;
  groups: ViewGroup[]; csvFiles: { [f: string]: string };
  linkOf: (it: PostItem) => MapTarget | undefined;
  ran: boolean; references?: PostReference[];
  onOpen: (t: MapTarget) => void;
  link?: MapTarget;
  /** the study's numbered steps (case/workflowSteps.ts) */
  steps: WorkflowStep[];
}) {
  const pw = purposeWords(st.purpose);
  const items = studyViews(st, map, groups.flatMap((g) => g.items));
  const plots = items.filter((i) => i.kind === "plot");
  const tables = items.filter((i) => i.kind === "table");
  const numbers = numbersOnlyOps(map, results.filter((r) => st.ops.includes(r.name)));
  return (
    <Box data-study={st.name} style={{ borderLeft: "3px solid var(--mantine-color-cyan-6)", paddingLeft: 12 }}>
      <Text size="md" fw={700}>{st.title}</Text>
      {/* THE STUDY'S WORDS ARE ONE LINE HERE (DEV.md 4c C172 slice 3): its
          purpose sentence and its summary are in the inspector, so the
          figures start on the first screen (NanoFiltran's Fig. 3). */}
      <Group gap={8} wrap="nowrap" mt={2} align="baseline">
        {link && <Box style={{ flex: "0 0 auto" }}><CaseLink t={link} onOpen={onOpen} /></Box>}
        <Tooltip label={[pw.sentence, st.summary].filter(Boolean).join("  ")} withArrow multiline maw={420}
          disabled={!pw.sentence && !st.summary}>
          <Text size="xs" c="dimmed" lineClamp={1} data-study-purpose={st.purpose} style={{ minWidth: 0 }}>
            {pw.label}{st.summary ? ` -- ${st.summary}` : ""}
          </Text>
        </Tooltip>
      </Group>
      {/* RESULTS FIRST (DEV.md 4c C168): once the run has answered, the
          study's figures come before the table of what ran; before a run
          the operations are the study's content and lead. */}
      {!ran && <Box mt="sm"><SectionTitle>What will run</SectionTitle>
        <StepPlan steps={steps} rows={rows} onSelect={onSelect} /></Box>}
      <Box mt="md">
        <SectionTitle>Figures</SectionTitle>
        {!ran ? <Text size="sm" c="dimmed">Not run yet.</Text>
          : plots.length ? <FigureGrid items={plots} csvFiles={csvFiles} linkOf={linkOf} references={references} />
          : <Text size="sm" c="dimmed">No figure published.</Text>}
      </Box>
      {ran && tables.length > 0 && (
        <Box mt="md">
          <SectionTitle>Tables</SectionTitle>
          <FigureGrid items={tables} csvFiles={csvFiles} linkOf={linkOf} references={references} />
        </Box>
      )}
      {ran && numbers.length > 0 && (
        <Box mt="md">
          <SectionTitle hint="Operations of this study that publish no table and feed no figure: their numbers, with the units the engine publishes.">
            Numbers
          </SectionTitle>
          <InlineNumbers results={numbers} linkOf={opLinkOf} onSelect={onSelect} />
        </Box>
      )}
      {ran && <Box mt="md">
        <SectionTitle>What ran</SectionTitle>
        {strip(rows.filter((r) => st.ops.includes(r.name)))}
      </Box>}
    </Box>
  );
}

/** ONE STEP'S RESULTS, in the centre (DEV.md 4c C172 slice 3): the figures
 *  it feeds first, then what a fit found, then each run's numbers -- its
 *  point table, its diagnostics with their units, its own panel -- and the
 *  verdict row of each run last.  What it reads, the model, what it writes
 *  and the verdict are the inspector's; the figures of its STUDY are one
 *  click back.  Nothing is computed here: these are the parts an operation's
 *  details carried since slice 1 (PropsDetails), re-homed. */
function StepResults({ study, step, map, result, propsDict, rows, strip, linkOf, opLinkOf, onSelect, onActivate,
  opPanel }: {
  study: WorkflowStudy; step: WorkflowStep; map: PropsMap;
  result: RunResult | undefined; propsDict: JsonDict | null | undefined;
  rows: VerdictRow[]; strip: (rows: VerdictRow[]) => ReactNode;
  linkOf: (it: PostItem) => MapTarget | undefined;
  opLinkOf: (op: string) => MapTarget | undefined;
  onSelect: (id: string) => void; onActivate: (t: MapTarget) => void;
  opPanel?: (op: string) => ReactNode | undefined;
}) {
  const [run, setRun] = useState(step.ops[0]!);
  useEffect(() => { setRun(step.ops[0]!); }, [step]);
  const ran = result?.status === "done";
  const ids = step.ops.map((o) => `op:${o}`);
  const items = new Map((result?.postProcessing?.items ?? []).map((it) => [viewDomId(it.origin, it.op, it.name), it]));
  const figures = viewsOf(map, ids).map((v) => items.get(v.replace(/^view:/, ""))).filter((x): x is PostItem => !!x);
  const r = (result?.operationResults ?? []).find((x) => x.name === run);
  const opDict = (Array.isArray(propsDict?.["operations"]) ? propsDict!["operations"] as JsonDict[] : [])
    .find((o) => o && typeof o === "object" && !Array.isArray(o) && o["name"] === run) ?? null;
  const panel = opPanel?.(run);
  const link = opLinkOf(run);
  return (
    <Stack gap="md" data-review="step-results" data-step-results={step.id}>
      <Box>
        <Group gap={8} wrap="wrap" align="baseline">
          <Text size="md" fw={700}>
            Step {step.number} <Text span ff="monospace" fw={700}>{stepLabel(step)}</Text>
          </Text>
          <Text size="xs" c="dimmed">{step.type}{step.ops.length > 1 ? ` · ${step.ops.length} runs` : ""}</Text>
          {study.declared && (
            <Button size="compact-sm" variant="subtle" onClick={() => onSelect(study.id)}
              title={study.title}>← study {study.letter}: all its figures</Button>
          )}
        </Group>
      </Box>
      {!ran ? (
        <Text size="sm" c="dimmed">Not run yet: the toolbar's Run runs the whole workflow, and this step's
          figures and numbers appear here.  What it reads, the model and what it writes are in the inspector.</Text>
      ) : (
        <>
          <Box>
            <SectionTitle>{figures.length === 1 ? "The figure it feeds" : `The figures it feeds (${figures.length})`}</SectionTitle>
            {figures.length > 0
              ? <FigureGrid items={figures} csvFiles={result?.csvFiles ?? {}} linkOf={linkOf}
                  references={result?.postProcessing?.references} />
              : <Text size="sm" c="dimmed">No figure draws from it: its answer is its numbers, below.</Text>}
          </Box>
          <FittedParametersBlock op={opDict} r={r} />
          <Box data-review="step-run-numbers">
            <Group gap={8} mb={4} wrap="wrap" align="center">
              <SectionTitle>{step.ops.length > 1 ? "The numbers of one run" : "Its numbers"}</SectionTitle>
              {step.ops.length > 1 && (
                <Select size="xs" data={step.ops} value={run} onChange={(v) => v && setRun(v)} allowDeselect={false}
                  aria-label="which run of the step" comboboxProps={{ withinPortal: true }} w={200} />
              )}
              {link && <CaseLink t={link} onOpen={onActivate} small />}
            </Group>
            {r ? (
              <Stack gap="sm">
                <PointTableViews r={r} />
                <Diagnostics r={r} folded={!!operationMapMeta(r.type)?.pointTable} />
              </Stack>
            ) : <Text size="sm" c="dimmed">The run published nothing for {run}.</Text>}
          </Box>
          {panel && (
            <Box data-review="op-panel">
              <SectionTitle>Its own panel</SectionTitle>
              <Box style={{ position: "relative", height: "70vh", minHeight: 420,
                border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))", borderRadius: 6,
                overflow: "hidden" }}>{panel}</Box>
            </Box>
          )}
        </>
      )}
      <Box>
        <SectionTitle>{step.ops.length > 1 ? "What ran, run by run" : "What ran"}</SectionTitle>
        {strip(rows.filter((x) => step.ops.includes(x.name)))}
      </Box>
    </Stack>
  );
}

export function ReviewScreen({ ops, result, readiness, readinessProminent, ledger, opPanel, comparisons,
  propsDict, thermo, rawFiles, caseKey, flowsheet }: {
  ops: JsonDict[];
  result: RunResult | undefined;
  /** the thermo readiness: in the thermo package's details always, and on
   *  the overview where the case creates a component (`readinessProminent`) */
  readiness?: ReactNode;
  readinessProminent?: boolean;
  /** the decisions the run took (pairs, datasets, sources): in the thermo
   *  package's details */
  ledger?: ReactNode;
  /** an operation's own typed panel, shown in its details (DEV.md 4c C172) */
  opPanel?: (op: string) => ReactNode | undefined;
  /** the comparisons of models with measured data, on the overview */
  comparisons?: ReactNode;
  propsDict?: JsonDict | null;
  thermo?: JsonDict | null;
  rawFiles?: Record<string, string>;
  /** the case's name: My plots are remembered per case */
  caseKey?: string;
  /** a two-mode case's flowsheet (the units that read a fitted record) */
  flowsheet?: JsonDict | null;
}) {
  const ran = result?.status === "done";
  const rows = verdictRows(ops, result?.operationResults ?? [], result?.validation, result?.status, propsDict);
  const studies = useMemo(() => declaredStudies(propsDict), [propsDict]);
  const block = result?.postProcessing;
  const groups = block ? viewGroups(block) : [];
  const csvFiles = result?.csvFiles ?? {};
  const openCaseAt = useStore((s) => s.openCaseAt);
  const runStatus = useStore((s) => s.runStatus);
  const setCaseMode = useStore((s) => s.setCaseMode);
  const selectNode = useStore((s) => s.selectNode);
  const narrow = useMediaQuery("(max-width: 900px)") ?? false;

  //  THE SELECTION AND THE EXPANDED BLOCKS live in the store, per case, so
  //  a trip to the Case tab and back finds the screen as the reader left it
  //  (DEV.md 4c C154).
  const key = caseKey ?? "case";
  const view = useStore((s) => s.propsViewFor[key]);
  const setPropsView = useStore((s) => s.setPropsView);
  const selected = view?.selected ?? "";
  const setSelected = useCallback((id: string) => setPropsView(key, { selected: id }), [key, setPropsView]);
  const expanded = useMemo(() => new Set(view?.expanded ?? []), [view?.expanded]);
  const setExpanded = useCallback((f: (s: Set<string>) => Set<string>) =>
    setPropsView(key, { expanded: [...f(new Set(useStore.getState().propsViewFor[key]?.expanded ?? []))] }),
  [key, setPropsView]);
  //  a selection asked for from outside (a unit's link to its fit, C152)
  const propsFocus = useStore((s) => s.propsFocus);
  useEffect(() => { if (propsFocus) setSelected(propsFocus.id); }, [propsFocus, setSelected]);
  const [treeOpen, setTreeOpen] = useState(false);
  const outline = useMemo(() => workflowOutline(propsDict), [propsDict]);
  const stepSel = selected.startsWith("op:") ? stepOfOp(outline, selected.slice(3)) : null;
  const [myPlots, setMyPlots] = useState<MyPlot[]>(() => loadPlots(key));
  useEffect(() => { setMyPlots(loadPlots(key)); }, [key]);

  const map = useMemo(() => derivePropsMap({
    propsDict, thermo, rawFiles, post: block ?? null, results: result?.operationResults, expanded, flowsheet,
  }), [propsDict, thermo, rawFiles, block, result, expanded, flowsheet]);
  const verdicts = useMemo(() => new Map(rows.filter((r) => r.verdict).map((r) => [r.name, r.verdict])), [rows]);
  //  the outline's lower half: the data, models and records the steps read
  //  and write -- the map's tree WITHOUT its operations, which ARE the steps
  //  above it (DEV.md 4c C172 slice 3)
  const tree = useMemo(() => caseTree(map, propsDict, PROPS_DISCIPLINES, myPlots, verdicts)
    .filter((n) => n.id !== "folder:ops"), [map, propsDict, myPlots, verdicts]);
  const stale = useStaleParts();
  const states = useMemo(() => mapStates(map, result,
    { stale: stale.stale, changed: stale.changed }), [map, result, stale]);
  const where = useMemo(() => locatePropsBlocks(rawFiles?.[PROPS_DICT_PATH]), [rawFiles]);

  const folderOps = useCallback((id: string): string[] => {
    const find = (ns: CaseTreeNode[]): CaseTreeNode | undefined => {
      for (const n of ns) { if (n.id === id) return n; const c = find(n.children); if (c) return c; }
      return undefined;
    };
    return (find(tree)?.children ?? []).map((c) => c.id);
  }, [tree]);

  //  the selection, as the map draws it: a member, or the block of a folder's first op
  const mapSelected = selected.startsWith("folder:type:")
    ? (map.blockOf.get(folderOps(selected)[0] ?? "") ?? null)
    : selected || null;

  const activate = useCallback((t: MapTarget) => {
    if (t.kind === "guide") openGuide(t.url);
    else if (t.kind === "case") openCaseAt(t.path, t.line, t.endLine);
    else if (t.kind === "view") setSelected(`view:${t.domId}`);
    else if (t.kind === "process") { setCaseMode("process"); selectNode(`unit:${t.unit}`); }
    else notifications.show({ message: t.label, color: "gray", autoClose: 4000 });
  }, [openCaseAt, setCaseMode, selectNode]);

  //  the DOORS a figure or a verdict row opens on its declaring block
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<MapTarget>).detail;
      if (t && t.kind === "case") openCaseAt(t.path, t.line, t.endLine);
    };
    window.addEventListener("choupo:openCase", on);
    return () => window.removeEventListener("choupo:openCase", on);
  }, [openCaseAt]);

  const targetOf = useCallback((id: string): MapTarget | undefined => {
    if (!id) return undefined;
    if (id.startsWith("study:")) {
      const l = where.studies.get(id.slice(6));
      return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine,
        label: `study ${id.slice(6)} in system/propsDict` } : undefined;
    }
    const ids = id.startsWith("folder:type:") ? folderOps(id) : [id];
    const n = map.nodes.find((x) => x.id === ids[0]);
    if (n) return n.member.target;
    const b = map.blocks.find((x) => x.id === id);
    return b?.members[0]?.target;
  }, [map, folderOps, where]);

  //  F1 with something selected opens what it is about -- ahead of the
  //  workspace's own F1 (capture phase, stopped), which keeps its answer for
  //  the screen with nothing selected.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "F1" || !selected) return;
      const t = targetOf(selected);
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      activate(t);
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [selected, targetOf, activate]);

  const opLink = useCallback((op: string): MapTarget | undefined => {
    const l = where.operations.get(op);
    return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine, label: `${op} in system/propsDict` } : undefined;
  }, [where]);
  const figureLink = useCallback((it: PostItem): MapTarget | undefined => {
    const l = it.origin === "declared" ? where.views.get(it.name) : where.operations.get(it.op);
    return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine,
      label: `${it.name} in system/propsDict` } : undefined;
  }, [where]);

  const addPlot = (file: string) => {
    const p: MyPlot = { id: `${Date.now().toString(36)}`, file, title: file.split("/").pop() ?? file };
    const next = [...myPlots, p];
    setMyPlots(next); savePlots(key, next); setSelected(`myplot:${p.id}`);
  };
  const removePlot = (id: string) => {
    const next = myPlots.filter((p) => `myplot:${p.id}` !== id);
    setMyPlots(next); savePlots(key, next);
    if (selected === id) setSelected("");
  };

  const strip = (rs: VerdictRow[]) =>
    <VerdictStrip rows={rs} ran={ran} selected={selected} onSelect={setSelected} linkOf={opLink} />;

  const otherFiles = otherCsvFiles(csvFiles);
  const opResults = useMemo(() => result?.operationResults ?? [], [result]);
  const numbersOnly = useMemo(() => (ran ? numbersOnlyOps(map, opResults) : []), [ran, map, opResults]);
  const isFolderOverview = selected.startsWith("folder:") && !selected.startsWith("folder:type:");
  const comparisonsBlock = ran && comparisons ? (
    <Box data-overview="comparisons">
      <SectionTitle hint="Each model's curve against the measured points, and the engine's AAD of each: a COMPARISON, not a validation -- it does not say the data were independent of a fit.">
        Models compared with the data
      </SectionTitle>
      <Stack gap="md">{comparisons}</Stack>
    </Box>
  ) : null;

  let details: ReactNode;
  if (selected === "myplot:new") {
    details = (
      <Stack gap="xs" data-review="new-plot">
        <SectionTitle hint="Any CSV the run wrote, drawn as it is -- kept under My plots in this browser.">
          New plot
        </SectionTitle>
        {Object.keys(csvFiles).length === 0
          ? <Text size="sm" c="dimmed">Run the workflow first: a plot draws a file the run wrote.</Text>
          : <Select data={Object.keys(csvFiles).sort()} placeholder="choose a CSV file" searchable
              maw={520} onChange={(v) => v && addPlot(v)} comboboxProps={{ withinPortal: true }} />}
      </Stack>
    );
  } else if (selected.startsWith("myplot:")) {
    const p = myPlots.find((x) => `myplot:${x.id}` === selected);
    const csv = p ? csvFiles[p.file] : undefined;
    details = (
      <Stack gap="xs" data-review="my-plot">
        <SectionTitle hint={p?.file}>{p?.title ?? "plot"}</SectionTitle>
        {csv ? <CsvAutoPlot csv={dropPointColumn(csv)} filename={p!.file} />
          : <Text size="sm" c="dimmed">{ran ? `The run wrote no ${p?.file}.` : "Run the workflow to draw it."}</Text>}
      </Stack>
    );
  } else if (stepSel) {
    details = <StepResults study={stepSel.study} step={stepSel.step} map={map} result={result}
      propsDict={propsDict} rows={rows} strip={strip} linkOf={figureLink} opLinkOf={opLink}
      onSelect={setSelected} onActivate={activate} opPanel={opPanel} />;
  } else if (selected === "study:-") {
    const loose = outline.find((s) => s.id === "study:-");
    const looseRows = rows.filter((r) => loose?.steps.some((s) => s.ops.includes(r.name)));
    details = (
      <Stack gap="md" data-review="loose-steps">
        <SectionTitle hint="Operations no declared study claims, in the order the run takes them.">
          Steps in no declared study
        </SectionTitle>
        {ran && <InlineNumbers results={numbersOnlyOps(map, opResults.filter((r) => looseRows.some((l) => l.name === r.name)))}
          linkOf={opLink} onSelect={setSelected} />}
        {strip(looseRows)}
      </Stack>
    );
  } else if (selected.startsWith("study:") && selected !== "study:") {
    const st = studies.find((x) => `study:${x.name}` === selected);
    details = st
      ? <StudySection st={st} rows={rows} map={map} strip={strip} groups={groups} csvFiles={csvFiles}
          steps={outline.find((o) => o.id === selected)?.steps ?? []}
          linkOf={figureLink} ran={ran} references={block?.references} onOpen={activate}
          link={targetOf(selected)} results={opResults} opLinkOf={opLink} onSelect={setSelected} />
      : <Text size="sm" c="dimmed">This case declares no study {selected.slice(6)}.</Text>;
  } else if (selected && selected !== "study:" && !isFolderOverview) {
    details = (
      <SelectionDetails id={selected} map={map} result={result} rows={rows} strip={strip}
        onSelect={setSelected} onActivate={activate} folderOps={folderOps}
        opPanel={opPanel} propsDict={propsDict} caseFiles={rawFiles}
        packageDetails={(readiness || ledger) ? (
          <>
            {readiness && (
              <Box data-review="thermo-readiness">
                <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4}>
                  Is the thermo ready? -- every component's data, and each phase's model
                </Text>
                <Box style={{ position: "relative", height: "60vh", minHeight: 380 }}>{readiness}</Box>
              </Box>
            )}
            {ledger && (
              <Box data-review="decision-ledger">
                <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4}>
                  The decisions this run took -- each pair, dataset and source
                </Text>
                {ledger}
              </Box>
            )}
          </>
        ) : undefined} />
    );
  } else if (studies.length > 0) {
    //  THE OVERVIEW BY STUDY: the case's own questions, in its order -- each
    //  with what kind of check it is, its operations, then its figures and
    //  tables; what no study claims after them.
    const inStudy = new Set(studies.flatMap((st) => st.ops));
    const loose = rows.filter((r) => !inStudy.has(r.name));
    const allItems = groups.flatMap((g) => g.items);
    const inSomeStudy = new Set(studies.flatMap((st) => studyViews(st, map, allItems)));
    const looseViews = allItems.filter((it) => !inSomeStudy.has(it));
    details = (
      <Stack gap="xl" data-review="overview" data-overview="studies">
        <Text size="xs" c="dimmed">
          {result?.status === "done" ? "The run completed.  " : result?.status === "error" ? "The run failed (see the Log).  " : "Not run yet.  "}
          This case asks {studies.length} question{studies.length === 1 ? "" : "s"}, in the order below
          (its <code>studies</code> in system/propsDict).  Click an operation for its numbers.
          <br />{RUN_EVIDENCE_SENTENCE}
        </Text>
        {studies.map((st) => (
          <StudySection key={st.name} st={st} rows={rows} map={map} strip={strip} groups={groups}
            steps={outline.find((o) => o.id === `study:${st.name}`)?.steps ?? []}
            csvFiles={csvFiles} linkOf={figureLink} ran={ran} references={block?.references}
            onOpen={activate} link={targetOf(`study:${st.name}`)}
            results={opResults} opLinkOf={opLink} onSelect={setSelected} />
        ))}
        {loose.length > 0 && (
          <Box>
            <SectionTitle>Operations in no declared study</SectionTitle>
            {ran && <Box mb="sm"><InlineNumbers results={numbersOnlyOps(map,
              opResults.filter((r) => loose.some((l) => l.name === r.name)))}
              linkOf={opLink} onSelect={setSelected} /></Box>}
            {strip(loose)}
          </Box>
        )}
        {ran && looseViews.length > 0 && (
          <Box data-overview="views-in-no-study">
            <SectionTitle hint="Views no operation of a declared study feeds (drawn from references alone, or from operations in no study).">
              Views in no declared study
            </SectionTitle>
            <FigureGrid items={looseViews} csvFiles={csvFiles} linkOf={figureLink} references={block?.references} />
          </Box>
        )}
        {readiness && readinessProminent && (
          <Box>
            <SectionTitle hint="This case creates or estimates a component: is the thermo ready for it?">
              Thermo readiness
            </SectionTitle>
            <Box style={{ position: "relative", height: "70vh", minHeight: 420 }}>{readiness}</Box>
          </Box>
        )}
        {comparisonsBlock}
        {ran && otherFiles.length > 0 && <OtherPlots files={otherFiles} csvFiles={csvFiles} />}
      </Stack>
    );
  } else {
    details = (
      <Stack gap="lg" data-review="overview">
        {ran && numbersOnly.length > 0 && (
          <Box>
            <SectionTitle hint="The operations that publish no table and feed no figure: their numbers, as the engine keys them, with the units it publishes.  The case's declared properties come first.">
              Results
            </SectionTitle>
            <InlineNumbers results={numbersOnly} linkOf={opLink} onSelect={setSelected} />
          </Box>
        )}
        <Box>
          <SectionTitle hint={ran ? "Click an operation for its numbers and figures; the icon opens its block in system/propsDict."
            : "Run the workflow (the Run in the toolbar): the steps run in this order, and each reports here."}>
            {ran ? "What the run did" : "What will run"}
          </SectionTitle>
          {ran ? strip(rows) : <StepPlan steps={outline.flatMap((s) => s.steps)} rows={rows} onSelect={setSelected} />}
        </Box>
        {readiness && readinessProminent && (
          <Box>
            <SectionTitle hint="This case creates or estimates a component: is the thermo ready for it?">
              Thermo readiness
            </SectionTitle>
            <Box style={{ position: "relative", height: "70vh", minHeight: 420 }}>{readiness}</Box>
          </Box>
        )}
        <Box>
          <SectionTitle hint="Each operation's default views, and the ones the propsDict declares -- every point the engine's.">
            Figures
          </SectionTitle>
          {ran
            ? <ViewGrid groups={groups} ops={ops} csvFiles={csvFiles} kind="plot" linkOf={figureLink} />
            : <Text size="sm" c="dimmed">Not run yet.</Text>}
        </Box>
        <Box>
          <SectionTitle>Parameters and tables</SectionTitle>
          {ran
            ? <ViewGrid groups={groups} ops={ops} csvFiles={csvFiles} kind="table" linkOf={figureLink} />
            : <Text size="sm" c="dimmed">Not run yet.</Text>}
        </Box>
        {comparisonsBlock}
        {ran && otherFiles.length > 0 && <OtherPlots files={otherFiles} csvFiles={csvFiles} />}
      </Stack>
    );
  }

  const handlers = useMemo(() => ({
    selected: mapSelected,
    onSelect: (blockId: string, memberId?: string) => {
      const b = map.blocks.find((x) => x.id === blockId);
      setSelected(memberId ?? (b && b.members.length === 1 ? b.members[0]!.id : blockId));
    },
    onActivate: activate,
    onToggle: (g: string) => setExpanded((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g); else n.add(g);
      return n;
    }),
    states,
  }), [mapSelected, activate, map, setSelected, setExpanded, states]);

  const treePane = (
    <WorkflowOutline outline={outline} rows={rows} selected={selected} tree={tree}
      onSelect={(id) => { setSelected(id); setTreeOpen(false); }}
      onNewPlot={() => setSelected("myplot:new")} onRemovePlot={removePlot} />
  );
  /*  THE MAP'S HEIGHT IS COMPUTED, NOT DRAGGED (DEV.md 4c C172 item 5).
   *  C153 made it a reader preference behind a seam; the seam is gone, and
   *  the map is drawn at C151's computed height (`autoMapPx`) fitted into
   *  the split, then the affordance's render-only cap.  The contract still
   *  owns the FOLD ("figures full height"), so it runs controlled with a
   *  value nothing writes. */
  const reduceMotion = useReducedMotion();
  //  THE OUTLINE FOLDS (DEV.md 4c C168 slice 2, ruling (a)): a left pane is
  //  allowed because it is the case's ONE navigation AND collapses -- the
  //  panel contract's left rail (`[`, the 28 px strip, a width the reader
  //  drags), where C172 slice 3 had drawn a fixed 248 px column.
  const outlineHost = useMeasuredBoxWidth<HTMLDivElement>();
  const outlinePanel = usePanel(WORKFLOW_OUTLINE_PANEL, { availablePx: outlineHost.width });
  usePanelShortcut(outlinePanel);
  const outlineBox = panelBoxProps(outlinePanel, !!reduceMotion);
  //  The centre's figures size themselves on a WINDOW resize (Plotly's
  //  useResizeHandler); folding or dragging the outline changes their width
  //  without one, and the figures overlapped until something else resized
  //  the window.  So a fold or a drag says so, once the width has settled.
  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event("resize")), reduceMotion ? 0 : 260);
    return () => window.clearTimeout(id);
  }, [outlinePanel.collapsed, outlinePanel.size, reduceMotion]);
  const split = useMeasuredBoxHeight<HTMLDivElement>();
  const mapSpec = PROPS_MAP_PANEL.prefs.size;
  //  the affordance's cap on the map's DRAWN height: render-only
  //  (ui/propsSplit.ts)
  const [mapCap, setMapCap] = useState<number | null>(null);
  const autoPx = autoMapPx(map.height, narrow);
  const fittedMap = shownTopPanelPx(clampSize(autoPx, mapSpec), 0, split.height,
    DETAILS_FLOOR_PX, mapSpec);
  const shownMap = mapCap !== null ? Math.min(fittedMap, mapCap) : fittedMap;
  const controlled = useMemo(() => ({ value: shownMap, onValue: () => {} }), [shownMap]);
  //  THE MAP IS BEHIND View > Calculation map, CLOSED BY DEFAULT (DEV.md 4c
  //  C172 slice 3): the fold is the store's `propsMapOpen`, written by the
  //  View menu and by the close button above the map, and read here; the
  //  panel contract owns the drawing (C168's fold-after-a-run memory is
  //  gone with it -- a map that never opens unasked has nothing to fold).
  const mapOpen = useStore((s) => s.propsMapOpen);
  const setMapOpen = useStore((s) => s.setPropsMapOpen);
  const collapsedControl = useMemo(() => ({
    collapsed: !mapOpen,
    toggle: () => setMapOpen(!mapOpen),
  }), [mapOpen, setMapOpen]);
  const mapPanel = usePanel(PROPS_MAP_PANEL, { controlled, collapsedControl });
  const mapBox = panelBoxProps(mapPanel, !!reduceMotion, shownMap);

  //  a new selection is read from its top, never from where the last one
  //  left the details scrolled (DEV.md 4c C154)
  const detailsVp = useRef<HTMLDivElement>(null);
  useEffect(() => { detailsVp.current?.scrollTo({ top: 0 }); }, [selected]);
  //  A SELECTION THAT CANNOT BE SEEN IS NOT AN ANSWER: when something is
  //  selected and the details pane is too short for its summary, open it.
  const lastSelected = useRef(selected);
  useEffect(() => {
    if (selected === lastSelected.current) return;
    lastSelected.current = selected;
    if (!selected || mapPanel.collapsed) return;
    const cap = openDetailsCap(split.height, shownMap, mapSpec);
    if (cap !== null) setMapCap(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selLink = selected.startsWith("op:") ? opLink(selected.slice(3)) : undefined;

  const selTitle = stepSel ? `Step ${stepSel.step.number}`
    : selected.startsWith("study:") && selected !== "study:" ? (outline.find((s) => s.id === selected)?.letter
      ? `Study ${outline.find((s) => s.id === selected)!.letter}` : "Study")
    : selected && selected !== "study:" ? "Details" : "Overview";

  const inspector = (
    <WorkflowInspector selected={selected} outline={outline} map={map} rows={rows} result={result}
      propsDict={propsDict} onSelect={setSelected} onActivate={activate} opLink={opLink} />
  );

  const centre = (
    <Box data-workflow-centre="" style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%" }}>
      {narrow && (
        <Group px="md" pt={6} gap={4} wrap="nowrap" style={{ flex: "0 0 auto" }}>
          <Button size="compact-sm" variant="default" onClick={() => setTreeOpen(!treeOpen)}>
            {treeOpen ? "Hide the outline" : "Outline"}
          </Button>
          <Button size="compact-sm" variant="default" aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)}>
            {mapOpen ? "Close the calculation map" : "Calculation map"}
          </Button>
        </Group>
      )}
      {narrow && treeOpen && (
        <Box mx="md" mt={6} style={{ height: 320, flex: "0 0 auto", border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          borderRadius: 6 }}>{treePane}</Box>
      )}
      <Box ref={split.ref} data-review="split"
        style={{ flex: "1 1 0px", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {!mapPanel.collapsed && (
          <Box data-panel={mapBox["data-panel"]} data-review="calculation-map" style={{ ...mapBox.style, flex: "0 0 auto" }}>
            <Box px="md" pt={4} pb={4} style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
              <Group justify="space-between" mb={2} wrap="nowrap" style={{ flex: "0 0 auto" }}>
                <SectionTitle hint={narrow ? undefined : "Data, models, operations, views -- derived from system/propsDict.  Click to select, F1 or double-click to open."}>
                  Calculation map
                </SectionTitle>
                <Group gap={4} wrap="nowrap">
                  {states.caseWide && (
                    <Tooltip withArrow multiline maw={360} label={`What changed: ${(stale.changed ?? []).join(", ") || "the case (no per-part record)"}.  `
                      + "No block can be named for every change, so no block is marked: the whole map shows the last run."}>
                      <Badge color="orange" variant="outline" data-map-stale="case" style={{ textTransform: "none" }}>
                        stale: case changed since the run
                      </Badge>
                    </Tooltip>
                  )}
                  <Button size="compact-sm" variant="default" data-review="close-map" aria-expanded={!mapPanel.collapsed}
                    leftSection={<IconX size={13} />} onClick={mapPanel.toggle}
                    title="Close the calculation map (View › Calculation map opens it again)">
                    Close the map
                  </Button>
                </Group>
              </Group>
              <Box style={{ flex: 1, minHeight: 0 }}>
                <PropsMapCanvas map={map} handlers={handlers} wide={!narrow} />
              </Box>
            </Box>
          </Box>
        )}
        <Box data-review="details-pane"
          style={{ flex: "1 1 0px", minHeight: 0, display: "flex", flexDirection: "column",
            borderTop: mapPanel.collapsed ? undefined : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
          <Group px="md" gap={8} wrap="nowrap"
            style={{ flex: `0 0 ${DETAILS_FLOOR_PX - 1}px`, minHeight: 0, overflow: "hidden" }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5, whiteSpace: "nowrap" }}
              data-centre-title="">
              {selTitle}
            </Text>
            {/* A STATUS REGION (DEV.md 4c C168, WCAG 4.1.3): the run's end is
                announced once, without moving focus. */}
            <Text size="xs" c="dimmed" role="status" aria-live="polite" data-run-status=""
              style={{ whiteSpace: "nowrap" }}>
              {runStatus === "running" ? "Running…"
                : result?.status === "done" ? "Run complete."
                : result?.status === "error" ? "Run failed — the Log has the engine's message."
                : "Not run yet."}
            </Text>
            {selected && selected !== "study:" && (
              <>
                <Button size="compact-sm" variant="subtle" onClick={() => setSelected("")}>← overview</Button>
                {selLink && <CaseLink t={selLink} onOpen={activate} />}
              </>
            )}
          </Group>
          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" viewportRef={detailsVp}>
            {narrow && <Box px="md" pb="sm" data-inspector-inline="">{inspector}</Box>}
            <Box px="md" pb="sm" style={{ maxWidth: 1600 }}>{details}</Box>
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  );

  if (narrow) {
    return (
      <Box data-review="screen" style={{ position: "absolute", inset: 0, display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)" }}>
        {centre}
      </Box>
    );
  }
  return (
    <Box data-review="screen" ref={outlineHost.ref}
      style={{ position: "absolute", inset: 0, display: "flex", minWidth: 0 }}>
      {outlinePanel.collapsed && <PanelReopenStrip panel={outlinePanel} scent="OUTLINE" />}
      <Box data-workflow-outline-pane="" data-panel={outlineBox["data-panel"]}
        style={{ ...outlineBox.style, minHeight: 0, display: "flex", flexDirection: "column",
          borderRight: outlinePanel.collapsed ? "none"
            : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))" }}>
        <Group justify="space-between" wrap="nowrap" gap={4} px={6} pt={4} style={{ flex: "0 0 auto" }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>Workflow</Text>
          <PanelCollapseButton panel={outlinePanel} />
        </Group>
        <Box style={{ flex: 1, minHeight: 0 }}>{treePane}</Box>
      </Box>
      <PanelResizeHandle panel={outlinePanel} />
      <Box style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{centre}</Box>
      <Box data-inspector-pane=""
        style={{ flex: "0 0 330px", minHeight: 0, borderLeft: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
        {inspector}
      </Box>
    </Box>
  );
}
