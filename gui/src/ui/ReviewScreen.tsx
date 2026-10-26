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
  ReviewScreen -- A PROPERTIES CASE'S STUDIES (DEV.md 4c C149, C151, C172
  slices 3 and 3b; docs/design/one-app-two-homes.md).

  Since slice 3b a properties case OPENS on its Workflow DIAGRAM
  (ui/WorkflowDiagram.tsx), as a process case opens on its flowsheet, and
  what this screen was on opening -- the overview of the case's studies,
  their figures and tables, the numbers and what ran -- is its own menu
  entry, STUDIES, as Streams and Reports sit beside the Flowsheet (Vitor:
  "o que se ve logo agora iria aparecer noutro menu equivalente ao que
  aparece no flowsheet").  A row at the top narrows it to one study.

  A STEP'S OWN RESULTS (StepResults, below) are drawn by the step's TAB
  (ui/StepTab.tsx), opened by a double click on its box; an operation named
  here selects its step on the Workflow, where the selection card shows it.
  The calculation map is RETIRED: the diagram replaces it (Vitor's ruling).

  DEV.md 4c C154 (an external reviewer's walk through NanoFiltran): the
  strip keeps the RUN status apart from the status of the EVIDENCE and says
  "not applicable" where an op type cannot publish an AAD.

  Nothing here computes a number (reviewScreen.ts for the strip,
  postProcessing.ts for the views, propsMap.ts for the map).
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionIcon, Badge, Box, Button, Group, ScrollArea, Select, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconFileCode } from "@tabler/icons-react";

import type { OperationResult, RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { viewGroups, type PostItem, type PostReference, type ViewGroup } from "../case/postProcessing.js";
import { numbersOnlyOps, RUN_STATE_WORD, type HeldOutStatistic, type RunState, type VerdictRow } from "../case/reviewScreen.js";
import { declaredStudies, purposeWords, type Study } from "../case/propsStudies.js";
import {
  neighbours, PROPS_DICT_PATH, viewDomId, viewsOf, type MapTarget, type PropsMap,
} from "../case/propsMap.js";
import { locatePropsBlocks } from "../case/propsDictLocate.js";
import { useStore } from "../state/store.js";
import { CURATION_COLOUR } from "./FitStatsPanel.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import {
  CaseLink, Diagnostics, FigureGrid, FittedParametersBlock, PointTableViews,
} from "./PropsDetails.js";
import { stepLabel, type WorkflowStep, type WorkflowStudy } from "../case/workflowSteps.js";
import { operationMapMeta } from "../case/operationSchemas.js";
import type { WorkflowModel } from "./useWorkflowModel.js";

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
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

export function VerdictStrip({ rows, ran, selected, onSelect, linkOf }: {
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

function OtherPlots({ files, csvFiles }: { files: string[]; csvFiles: { [f: string]: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <details data-review="other-plots" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: "pointer" }}>
        <Text span size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
          Other plots
        </Text>
        <Text span size="xs" c="dimmed"> — {files.length} CSV file(s) the run wrote that no view draws,
          plotted as they are (Reports lists them to download)</Text>
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
export function StepResults({ study, step, map, result, propsDict, rows, strip, linkOf, opLinkOf, onSelect, onActivate,
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

/** THE STUDIES VIEW (DEV.md 4c C172 slice 3b): what a properties case
 *  showed on opening until the Workflow diagram became its home -- each
 *  declared study's figures, tables and numbers, then what ran -- on its
 *  own menu entry, as Streams and Reports sit beside the Flowsheet.  A row
 *  of the studies at the top narrows it to one; an operation named anywhere
 *  here selects its step on the Workflow (the card opens there). */
export function ReviewScreen({ model, readiness, readinessProminent, opPanel, comparisons }: {
  model: WorkflowModel;
  /** the thermo readiness, on the overview where the case creates a
   *  component (`readinessProminent`) */
  readiness?: ReactNode;
  readinessProminent?: boolean;
  /** an operation's own typed panel (kept for a caller that shows one) */
  opPanel?: (op: string) => ReactNode | undefined;
  /** the comparisons of models with measured data, on the overview */
  comparisons?: ReactNode;
}) {
  void opPanel;
  const { result, rows, map, outline, propsDict, rawFiles } = model;
  const ran = result?.status === "done";
  const studies = useMemo(() => declaredStudies(propsDict), [propsDict]);
  const block = result?.postProcessing;
  const groups = block ? viewGroups(block) : [];
  const csvFiles = result?.csvFiles ?? {};
  const runStatus = useStore((s) => s.runStatus);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const ops = (Array.isArray(propsDict?.["operations"]) ? propsDict!["operations"] : []) as JsonDict[];
  const [focus, setFocus] = useState("");
  useEffect(() => { setFocus(""); }, [model.caseKey]);
  const where = useMemo(() => locatePropsBlocks(rawFiles?.[PROPS_DICT_PATH]), [rawFiles]);

  //  an operation, a step or a member named here is selected on the
  //  WORKFLOW, where the card shows it (one selection, one card)
  const onSelect = useCallback((id: string) => {
    if (id.startsWith("study:")) { setFocus(id); return; }
    model.select(id);
    setActiveWorkspace(null);
  }, [model, setActiveWorkspace]);

  const figureLink = useCallback((it: PostItem): MapTarget | undefined => {
    const l = it.origin === "declared" ? where.views.get(it.name) : where.operations.get(it.op);
    return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine,
      label: `${it.name} in system/propsDict` } : undefined;
  }, [where]);
  const strip = (rs: VerdictRow[]) =>
    <VerdictStrip rows={rs} ran={ran} selected={model.selected} onSelect={onSelect} linkOf={model.opLink} />;

  const otherFiles = otherCsvFiles(csvFiles);
  const opResults = useMemo(() => result?.operationResults ?? [], [result]);
  const numbersOnly = useMemo(() => (ran ? numbersOnlyOps(map, opResults) : []), [ran, map, opResults]);
  const comparisonsBlock = ran && comparisons ? (
    <Box data-overview="comparisons">
      <SectionTitle hint="Each model's curve against the measured points, and the engine's AAD of each: a COMPARISON, not a validation -- it does not say the data were independent of a fit.">
        Models compared with the data
      </SectionTitle>
      <Stack gap="md">{comparisons}</Stack>
    </Box>
  ) : null;
  const readinessBlock = readiness && readinessProminent ? (
    <Box>
      <SectionTitle hint="This case creates or estimates a component: is the thermo ready for it?">
        Thermo readiness
      </SectionTitle>
      <Box style={{ position: "relative", height: "70vh", minHeight: 420 }}>{readiness}</Box>
    </Box>
  ) : null;
  const section = (st: Study) => (
    <StudySection key={st.name} st={st} rows={rows} map={map} strip={strip} groups={groups}
      steps={outline.find((o) => o.id === `study:${st.name}`)?.steps ?? []}
      csvFiles={csvFiles} linkOf={figureLink} ran={ran} references={block?.references}
      onOpen={model.activate} link={model.targetOf(`study:${st.name}`)}
      results={opResults} opLinkOf={model.opLink} onSelect={onSelect} />
  );

  let details: ReactNode;
  const focused = studies.find((x) => `study:${x.name}` === focus);
  if (focused) {
    details = <Stack gap="xl" data-review="overview" data-overview="study">{section(focused)}</Stack>;
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
          This case asks {studies.length} question{studies.length === 1 ? "" : "s"}, in the order below
          (its <code>studies</code> in system/propsDict).  An operation named here opens its step on the Workflow.
          <br />{RUN_EVIDENCE_SENTENCE}
        </Text>
        {studies.map(section)}
        {loose.length > 0 && (
          <Box>
            <SectionTitle>Operations in no declared study</SectionTitle>
            {ran && <Box mb="sm"><InlineNumbers results={numbersOnlyOps(map,
              opResults.filter((r) => loose.some((l) => l.name === r.name)))}
              linkOf={model.opLink} onSelect={onSelect} /></Box>}
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
        {readinessBlock}
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
            <InlineNumbers results={numbersOnly} linkOf={model.opLink} onSelect={onSelect} />
          </Box>
        )}
        <Box>
          <SectionTitle hint={ran ? "An operation named here opens its step on the Workflow; the icon opens its block in system/propsDict."
            : "Run the workflow (the Run in the toolbar): the steps run in this order, and each reports here."}>
            {ran ? "What the run did" : "What will run"}
          </SectionTitle>
          {ran ? strip(rows) : <StepPlan steps={outline.flatMap((s) => s.steps)} rows={rows} onSelect={onSelect} />}
        </Box>
        {readinessBlock}
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

  //  a new focus is read from its top
  const detailsVp = useRef<HTMLDivElement>(null);
  useEffect(() => { detailsVp.current?.scrollTo({ top: 0 }); }, [focus]);

  return (
    <Box data-review="screen" data-studies-view=""
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Group px="md" py={6} gap={6} wrap="wrap" align="center" data-studies-chooser=""
        style={{ flex: "0 0 auto", borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }} data-centre-title="">Studies</Text>
        {studies.length > 0 && (
          <>
            <Button size="compact-sm" variant={focus === "" ? "filled" : "default"} aria-pressed={focus === ""}
              onClick={() => setFocus("")}>All</Button>
            {studies.map((st) => {
              const o = outline.find((x) => x.id === `study:${st.name}`);
              const id = `study:${st.name}`;
              return (
                <Button key={st.name} size="compact-sm" variant={focus === id ? "filled" : "default"}
                  aria-pressed={focus === id} data-studies-choice={st.name} title={st.title}
                  onClick={() => setFocus(id)} style={{ maxWidth: 360 }}>
                  <Text span size="sm" truncate>{o?.letter ? `${o.letter} -- ` : ""}{st.title.replace(/^[A-Z]\s+--\s+/, "")}</Text>
                </Button>
              );
            })}
          </>
        )}
        <Text size="xs" c="dimmed" role="status" aria-live="polite" data-run-status="" style={{ whiteSpace: "nowrap" }}>
          {runStatus === "running" ? "Running…"
            : result?.status === "done" ? "Run complete."
            : result?.status === "error" ? "Run failed — the Log has the engine's message."
            : "Not run yet."}
        </Text>
      </Group>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" viewportRef={detailsVp}>
        <Box px="md" py="sm" style={{ maxWidth: 1600 }} data-review="details-pane">{details}</Box>
      </ScrollArea>
    </Box>
  );
}
