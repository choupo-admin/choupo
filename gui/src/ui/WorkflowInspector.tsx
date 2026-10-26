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
  WorkflowInspector -- THE RIGHT PANE OF THE WORKFLOW: THE SELECTED STEP
  (DEV.md 4c C172 slice 3; docs/design/one-app-two-homes.md item 3).

  For a STEP, four sections in this order, each read where the case or the
  engine already says it -- nothing here computes a number:

    1. WHAT IT READS   a fit's datasets, each FIT or HELD OUT, and the band
                       declared before the fit (case/fitEvidence.ts, the
                       parts slice 1 built as a fit's details, re-homed);
                       every file the engine's table says the op reads,
                       resolved on its own dict (case/fileTraffic.ts) --
                       with the process run named where the step DECLARES
                       the Flowsheet writes it (`writtenBy`); the other data
                       the calculation map wires into it (inline points,
                       references, records read by name)
    2. THE MODEL       the law the op applies and, INSIDE it, every declared
                       choice (activity, hindrance, solver ...), the map's own
                       model members in the order the op's schema lists its
                       slots; or the case's thermo package with its models
    3. WHAT IT WRITES  every file and record the engine's table says it
                       writes, and the fingerprint of the evidence partition
                       its record carries
    4. THE VERDICT     the run's word, the curation verdict WITH the
                       identifiability beside it, the AAD against data and
                       the held-out statistic in its own unit

  For a STUDY: its purpose, its summary and its steps; for a dataset, a model
  or a record selected in the outline or the map: which steps read, apply or
  write it.  Text is never below 11 px here (C168's legibility ruling); a
  state is a word and a glyph, never a colour alone.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { Badge, Box, Button, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";

import type { OperationResult, RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { neighbours, type MapNode, type MapTarget, type PropsMap } from "../case/propsMap.js";
import { purposeWords } from "../case/propsStudies.js";
import { RUN_STATE_WORD, type VerdictRow } from "../case/reviewScreen.js";
import { fitEvidence } from "../case/fitEvidence.js";
import { opFiles, writtenFingerprints, type StepFile } from "../case/fileTraffic.js";
import { stepLabel, stepOfOp, type WorkflowStep, type WorkflowStudy } from "../case/workflowSteps.js";
import { BandBlock, CaseLink, EvidenceTable, FitVerdict } from "./PropsDetails.js";
import { stepState } from "./WorkflowOutline.js";
import { operationMapMeta } from "../case/operationSchemas.js";

const isDict = (v: unknown): v is JsonDict => !!v && typeof v === "object" && !Array.isArray(v);

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <Box data-inspector-section={n} pt={8} mt={8}
      style={{ borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4} style={{ letterSpacing: 0.5 }}>{title}</Text>
      {children}
    </Box>
  );
}

function NodeButton({ node, onSelect, children }: { node: MapNode; onSelect: (id: string) => void; children?: ReactNode }) {
  return (
    <UnstyledButton onClick={() => onSelect(node.id)} title={node.member.detail} data-inspector-node={node.id}
      style={{ display: "block", width: "100%", padding: "1px 4px", borderRadius: 3 }}>
      {children ?? (
        <>
          <Text span size="xs" ff="monospace" fw={600} style={{ textDecoration: "underline dotted" }}>{node.member.label}</Text>
          <Text span size="xs" c="dimmed"> · {node.member.detail}</Text>
        </>
      )}
    </UnstyledButton>
  );
}

const opDictOf = (propsDict: JsonDict | null | undefined, name: string): JsonDict | null => {
  const ops = propsDict?.["operations"];
  if (!Array.isArray(ops)) return null;
  return (ops.find((o) => isDict(o) && o["name"] === name) as JsonDict | undefined) ?? null;
};

/** A step's files over its runs, one line per (direction, key, value). */
function stepFiles(step: WorkflowStep, propsDict: JsonDict | null | undefined): StepFile[] {
  const out: StepFile[] = [];
  const seen = new Set<string>();
  for (const name of step.ops) {
    const op = opDictOf(propsDict, name);
    if (!op) continue;
    for (const f of opFiles(op, step.type)) {
      const k = `${f.dir}|${f.key}|${f.value}`;
      if (!seen.has(k)) { seen.add(k); out.push(f); }
    }
  }
  return out;
}

const KIND_WORD: Record<string, string> = {
  file: "file", record: "record, into the case", proposal: "proposal, a draft for data/local/",
  membraneName: "membrane record, by name",
};

function FileLine({ f, node, onSelect, extra }: { f: StepFile; node?: MapNode; onSelect: (id: string) => void; extra?: ReactNode }) {
  const name = f.value;
  return (
    <Box data-step-file={`${f.dir}:${f.key}`} mb={4}>
      <Group gap={6} wrap="wrap" align="baseline">
        {node
          ? <UnstyledButton onClick={() => onSelect(node.id)} title={node.member.detail}>
              <Text span size="xs" ff="monospace" fw={600} style={{ textDecoration: "underline dotted", wordBreak: "break-all" }}>{name}</Text>
            </UnstyledButton>
          : <Text span size="xs" ff="monospace" fw={600} style={{ wordBreak: "break-all" }}>{name}</Text>}
        {f.byProcess && (
          <Badge size="md" variant="outline" color="orange" style={{ textTransform: "none" }} data-by-process=""
            title="The step declares it (writtenBy { <key> process; }): the Flowsheet run writes it, so run the Flowsheet first">
            written by the Flowsheet run
          </Badge>
        )}
      </Group>
      <Text size="11px" c="dimmed">
        {KIND_WORD[f.kind] ?? f.kind} · {f.key === "" ? "read by construction" : `key ${f.key}`}
        {f.defaulted && f.key !== "" ? " (absent: the engine's default)" : ""}
      </Text>
      {extra}
    </Box>
  );
}

/** The map node a resolved path names, if the map drew one. */
function nodeForPath(map: PropsMap, value: string, around: string[]): MapNode | undefined {
  const byId = (id: string) => map.nodes.find((n) => n.id === id);
  for (const id of around) {
    const n = byId(id);
    if (!n) continue;
    if (n.id === `file:${value}` || n.id === `file:${value}.dat` || n.id === `record:${value}`) return n;
    if (n.member.label === value || n.member.label === value.split("/").pop()) return n;
    if (n.member.target.kind === "case" && (n.member.target.path === value || n.member.target.path === `${value}.dat`)) return n;
    if (n.member.detail.endsWith(`: ${value}`)) return n;
  }
  return undefined;
}

function StepInspector({ study, step, map, rows, result, propsDict, onSelect, onActivate, opLink }: {
  study: WorkflowStudy; step: WorkflowStep; map: PropsMap; rows: VerdictRow[];
  result: RunResult | undefined; propsDict: JsonDict | null | undefined;
  onSelect: (id: string) => void; onActivate: (t: MapTarget) => void;
  opLink: (op: string) => MapTarget | undefined;
}) {
  const first = step.ops[0]!;
  const firstNode = map.nodes.find((n) => n.id === `op:${first}`);
  const opDict = opDictOf(propsDict, first);
  const ids = step.ops.map((o) => `op:${o}`);
  const up = [...new Set(ids.flatMap((i) => neighbours(map, i).up))];
  const down = [...new Set(ids.flatMap((i) => neighbours(map, i).down))];
  const nodeOf = (id: string) => map.nodes.find((n) => n.id === id);
  const files = stepFiles(step, propsDict);
  const reads = files.filter((f) => f.dir === "read");
  const writes = files.filter((f) => f.dir === "write");
  const evidence = fitEvidence(opDict);
  const evidenceSets = new Set(evidence.map((e) => e.dataset));
  const results: OperationResult[] = (result?.operationResults ?? []).filter((r) => step.ops.includes(r.name));
  const r0 = results.find((r) => r.name === first);
  const myRows = rows.filter((r) => step.ops.includes(r.name));
  const state = stepState(rows, step.ops);

  //  the data the map wires in that the table does not name as a file read
  const shownData = new Set<string>();
  for (const f of reads) { const n = nodeForPath(map, f.value, up); if (n) shownData.add(n.id); }
  for (const d of evidenceSets) { const n = nodeForPath(map, d, up); if (n) shownData.add(n.id); }
  const otherData = up.map(nodeOf).filter((n): n is MapNode => !!n && n.kind === "data" && !shownData.has(n.id));

  //  the model: the law first, then every choice inside it, in the op's
  //  declared slot order (the map's wires keep it); the thermo package apart.
  //  A slot the op's schema FIXES (`fixed`: the regression a fit always
  //  runs) is the op's own method, not a model it was given, so it is said
  //  under the model rather than standing in for it (curate02 fits the
  //  package's NRTL pair BY Levenberg-Marquardt).
  const fixedRoles = new Set((operationMapMeta(step.type)?.models ?? []).filter((s) => s.fixed).map((s) => s.role));
  const models = up.map(nodeOf).filter((n): n is MapNode => !!n && n.kind === "model");
  const pkg = models.find((n) => n.id === "package");
  const own = models.filter((n) => n.id !== "package" && !fixedRoles.has(n.role));
  const methods = models.filter((n) => n.id !== "package" && fixedRoles.has(n.role));
  const law = own[0];
  const options = own.slice(1);

  const fp = results.map((r) => r.curation?.["partitionFingerprint"]).find((x) => !!x);
  const writtenText = (path: string) => result?.caseWrites?.[path] ?? result?.proposals?.[path];

  const link = opLink(first);
  return (
    <Stack gap={0} data-inspector="step" data-inspector-step={step.id}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
        Step {step.number}{study.letter && study.declared ? ` of study ${study.letter}` : ""}
      </Text>
      <Text size="sm" fw={700} ff="monospace" style={{ wordBreak: "break-all" }}>{stepLabel(step)}</Text>
      <Text size="xs" c="dimmed">
        {step.type}{step.ops.length > 1 ? ` · ${step.ops.length} runs of one set, drawn together by a declared view` : ""}
      </Text>
      {step.ops.length > 1 && (
        <Text size="11px" c="dimmed" ff="monospace" mt={2} style={{ wordBreak: "break-word" }}>{step.ops.join(", ")}</Text>
      )}
      <Group gap="xs" mt={6}>
        {firstNode && firstNode.member.target.kind === "guide" && (
          <Button size="compact-sm" variant="light" leftSection={<IconHelp size={14} />}
            onClick={() => onActivate(firstNode.member.target)} title={firstNode.member.target.label}>
            Theory (F1)
          </Button>
        )}
        {link && <CaseLink t={link} onOpen={onActivate} />}
      </Group>

      <Section n="reads" title="1 · What it reads">
        {evidence.length > 0 && (
          <Box mb={6}>
            <EvidenceTable compact op={opDict} onDataset={(d) => { const n = nodeForPath(map, d, up); if (n) onSelect(n.id); }} />
            <Box mt={4}><BandBlock op={opDict} r={r0} /></Box>
          </Box>
        )}
        {reads.filter((f) => !evidenceSets.has(f.value)).map((f) =>
          <FileLine key={`${f.key}|${f.value}`} f={f} node={nodeForPath(map, f.value, up)} onSelect={onSelect} />)}
        {otherData.map((n) => <NodeButton key={n.id} node={n} onSelect={onSelect} />)}
        {evidence.length === 0 && reads.length === 0 && otherData.length === 0 && (
          <Text size="xs" c="dimmed">No file and no dataset: everything it needs is written in its own block of system/propsDict.</Text>
        )}
      </Section>

      <Section n="model" title="2 · The model, with its options inside it">
        {law ? (
          <Box data-inspector-model={law.member.label}>
            <NodeButton node={law} onSelect={onSelect}>
              <Text span size="sm" ff="monospace" fw={700} style={{ textDecoration: "underline dotted" }}>{law.member.label}</Text>
              <Text span size="xs" c="dimmed"> · {law.member.detail}</Text>
            </NodeButton>
            {options.length > 0 && (
              <Box ml={12} pl={8} style={{ borderLeft: "2px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}
                data-inspector-options="">
                {options.map((o) => (
                  <NodeButton key={o.id} node={o} onSelect={onSelect}>
                    <Text span size="xs" c="dimmed">{o.member.detail}: </Text>
                    <Text span size="xs" ff="monospace" style={{ textDecoration: "underline dotted" }}>{o.member.label}</Text>
                  </NodeButton>
                ))}
              </Box>
            )}
          </Box>
        ) : !pkg && <Text size="xs" c="dimmed">Its type names no model slot: the operation IS its method (F1).</Text>}
        {pkg && (
          <Box mt={law ? 6 : 0} data-inspector-model="package">
            <NodeButton node={pkg} onSelect={onSelect}>
              <Text span size="sm" fw={700} style={{ textDecoration: "underline dotted" }}>the case's thermo package</Text>
              <Text span size="xs" c="dimmed"> · constant/thermoPhysPropDict</Text>
            </NodeButton>
            <Box ml={12} pl={8} style={{ borderLeft: "2px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}
              data-inspector-options="">
              {pkg.member.detail.split(" · ").filter(Boolean).map((m) => (
                <Text key={m} size="xs" ff="monospace">{m}</Text>
              ))}
            </Box>
          </Box>
        )}
        {methods.map((m) => (
          <Box key={m.id} mt={6}>
            <NodeButton node={m} onSelect={onSelect}>
              <Text span size="xs" c="dimmed">{m.member.detail}, the operation's own method: </Text>
              <Text span size="xs" ff="monospace" style={{ textDecoration: "underline dotted" }}>{m.member.label}</Text>
            </NodeButton>
          </Box>
        ))}
      </Section>

      <Section n="writes" title="3 · What it writes">
        {writes.map((f) => {
          const node = f.kind === "record" ? nodeOf(`record:${f.value.split("/").pop()?.replace(/\.dat$/, "")}`)
            : f.kind === "proposal" ? down.map(nodeOf).find((n) => !!n && n.role === "proposal" && n.member.label === f.value) : undefined;
          const text = writtenText(f.value);
          const own = writtenFingerprints(text);
          const recordish = f.kind === "record" || f.kind === "proposal";
          return (
            <FileLine key={`${f.key}|${f.value}`} f={f} node={node} onSelect={onSelect}
              extra={recordish && (fp || own.length > 0) ? (
                <Box data-fingerprint={fp ?? own[0]?.value ?? ""}>
                  {own.map((x) => (
                    <Text key={x.key} size="11px" title={x.value}>
                      {x.key}: <Text span ff="monospace" size="11px">{x.value.length > 20 ? `${x.value.slice(0, 16)}…` : x.value}</Text>
                      {x.value === fp ? " (the evidence partition the run published)" : ""}
                    </Text>
                  ))}
                  {fp && !own.some((x) => x.value === fp) && (
                    <Text size="11px">evidence partition (published by the run): <Text span ff="monospace" size="11px">{fp}</Text>
                      {text ? " -- the record does not state it" : ""}</Text>
                  )}
                </Box>
              ) : null} />
          );
        })}
        {writes.length === 0 && (
          <Text size="xs" c="dimmed">
            No file and no record (the engine's table): its answer is the numbers and figures it publishes.
          </Text>
        )}
      </Section>

      <Section n="verdict" title="4 · The verdict">
        {state === "notRun" ? (
          <Text size="xs" c="dimmed">Not run yet: the toolbar's Run runs the whole workflow, in this order.</Text>
        ) : (
          <Stack gap={4}>
            <Text size="xs" data-step-state={state}>
              run: <b>{state === "done" ? "✓" : state === "failed" ? "✗" : "!"} {RUN_STATE_WORD[state]}</b>
              {step.ops.length > 1 ? ` (${myRows.filter((r) => r.runState === "done").length} of ${step.ops.length} runs done)` : ""}
            </Text>
            {r0?.curation?.["verdict"] || typeof r0?.diagnostics?.["identifiable"] === "number"
              ? <FitVerdict r={r0} />
              : <Text size="xs" c="dimmed">evidence: no acceptance test in this step -- converging is not a verdict.</Text>}
            {myRows.filter((r) => r.aadPct !== null).map((r) => (
              <Text key={r.name} size="xs">AAD against data{step.ops.length > 1 ? ` (${r.name})` : ""}: {Number(r.aadPct!.toPrecision(3))} %</Text>
            ))}
            {myRows.filter((r) => r.heldOut).map((r) => (
              <Text key={r.name} size="xs" data-held-out={r.heldOut!.key}>
                held out{step.ops.length > 1 ? ` (${r.name})` : ""}: {Number(r.heldOut!.value.toPrecision(3))}
                {r.heldOut!.unit === "%" ? " %" : r.heldOut!.published ? ` ${r.heldOut!.unit}` : ""}
                <Text span c="dimmed"> ({r.heldOut!.key})</Text>
              </Text>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

function StudyInspector({ study, rows, onSelect }: {
  study: WorkflowStudy; rows: VerdictRow[]; onSelect: (id: string) => void;
}) {
  const pw = purposeWords(study.purpose);
  return (
    <Stack gap={6} data-inspector="study">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
        {study.declared ? `Study ${study.letter}` : study.letter ? `Group ${study.letter}` : "The workflow"}
      </Text>
      <Text size="sm" fw={700}>{study.title}</Text>
      {study.purpose && (
        <Box>
          <Text size="xs" fw={600}>{pw.label}</Text>
          {pw.sentence && <Text size="xs" c="dimmed">{pw.sentence}</Text>}
        </Box>
      )}
      {study.summary && <Text size="xs">{study.summary}</Text>}
      <Section n="steps" title={`Its steps (${study.steps.length}), in the order the run takes them`}>
        {study.steps.map((s) => {
          const st = stepState(rows, s.ops);
          return (
            <UnstyledButton key={s.id} onClick={() => onSelect(s.id)} style={{ display: "block", padding: "1px 0" }}>
              <Text size="xs"><b>{s.number}</b> <Text span ff="monospace">{stepLabel(s)}</Text>
                <Text span c="dimmed"> · {s.type}{s.ops.length > 1 ? ` · ${s.ops.length} runs` : ""}
                  {st !== "notRun" ? ` · ${RUN_STATE_WORD[st]}` : ""}</Text></Text>
            </UnstyledButton>
          );
        })}
      </Section>
    </Stack>
  );
}

function NodeInspector({ node, map, outline, onSelect, onActivate }: {
  node: MapNode; map: PropsMap; outline: WorkflowStudy[];
  onSelect: (id: string) => void; onActivate: (t: MapTarget) => void;
}) {
  const { up, down } = neighbours(map, node.id);
  const stepsOf = (ids: string[]) => {
    const out: { number: string; id: string; label: string }[] = [];
    for (const id of ids) {
      if (!id.startsWith("op:")) continue;
      const s = stepOfOp(outline, id.slice(3));
      if (s && !out.some((o) => o.id === s.step.id)) out.push({ number: s.step.number, id: s.step.id, label: stepLabel(s.step) });
    }
    return out;
  };
  const readBy = stepsOf(down);
  const writtenBy = stepsOf(up);
  const word = node.kind === "data" ? "read by" : node.kind === "model" ? "applied by" : "drawn from";
  return (
    <Stack gap={6} data-inspector="node" data-inspector-node-id={node.id}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>{node.kind === "view" && (node.role === "record" || node.role === "proposal") ? "written" : node.kind}</Text>
      <Text size="sm" fw={700} ff="monospace" style={{ wordBreak: "break-all" }}>{node.member.label}</Text>
      <Text size="xs" c="dimmed">{node.member.detail}</Text>
      {node.member.target.kind !== "none" && (
        <Group gap="xs">
          <Button size="compact-sm" variant="light" leftSection={<IconHelp size={14} />}
            onClick={() => onActivate(node.member.target)} title={node.member.target.label}>
            {node.member.target.kind === "case" ? "Open the file (F1)" : node.member.target.kind === "view" ? "Show the figure" : "Theory (F1)"}
          </Button>
          {node.member.source && <CaseLink t={node.member.source} onOpen={onActivate} />}
        </Group>
      )}
      {(readBy.length > 0 || writtenBy.length > 0) && (
        <Section n="steps" title={writtenBy.length > 0 ? "written by" : word}>
          {(writtenBy.length > 0 ? writtenBy : readBy).map((s) => (
            <UnstyledButton key={s.id} onClick={() => onSelect(s.id)} style={{ display: "block" }}>
              <Text size="xs">step <b>{s.number}</b> <Text span ff="monospace">{s.label}</Text></Text>
            </UnstyledButton>
          ))}
        </Section>
      )}
      <Text size="11px" c="dimmed">Its details, and every figure it reaches, are in the centre.</Text>
    </Stack>
  );
}

export function WorkflowInspector({ selected, outline, map, rows, result, propsDict, onSelect, onActivate, opLink }: {
  selected: string;
  outline: WorkflowStudy[];
  map: PropsMap;
  rows: VerdictRow[];
  result: RunResult | undefined;
  propsDict: JsonDict | null | undefined;
  onSelect: (id: string) => void;
  onActivate: (t: MapTarget) => void;
  opLink: (op: string) => MapTarget | undefined;
}) {
  let body: ReactNode;
  const step = selected.startsWith("op:") ? stepOfOp(outline, selected.slice(3)) : null;
  const study = outline.find((s) => s.id === selected);
  const node = map.nodes.find((n) => n.id === selected);
  if (step) {
    body = <StepInspector study={step.study} step={step.step} map={map} rows={rows} result={result}
      propsDict={propsDict} onSelect={onSelect} onActivate={onActivate} opLink={opLink} />;
  } else if (study) {
    body = <StudyInspector study={study} rows={rows} onSelect={onSelect} />;
  } else if (node) {
    body = <NodeInspector node={node} map={map} outline={outline} onSelect={onSelect} onActivate={onActivate} />;
  } else {
    const nSteps = outline.reduce((a, s) => a + s.steps.length, 0);
    const declared = outline.filter((s) => s.declared).length;
    body = (
      <Stack gap={6} data-inspector="workflow">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>The workflow</Text>
        <Text size="xs">
          {declared > 0 ? `${declared} declared ${declared === 1 ? "study" : "studies"}, ` : ""}
          {nSteps} {nSteps === 1 ? "step" : "steps"}, run in the order the outline numbers them -- the engine
          refuses a step that reads what a later one writes.
        </Text>
        <Text size="xs" c="dimmed">
          Select a step: this pane shows what it reads, the model it applies with its options, what it writes
          and its verdict.  The whole graph of the calculation is behind View › Calculation map.
        </Text>
      </Stack>
    );
  }
  return (
    <ScrollArea h="100%" type="auto">
      <Box p="sm" component="aside" aria-label="Inspector">{body}</Box>
    </ScrollArea>
  );
}
