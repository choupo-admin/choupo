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
  PropsReports -- A PROPERTIES CASE'S REPORTS (DEV.md 4c C172 slice 3b;
  Vitor: "E o 'view' nao esta la a fazer nada!!! Devia ficar em
  'reports'!!!").  The View menu (it held only the calculation map, which
  the Workflow diagram replaces) is gone; what a run produced, to read,
  check and take away, is here, as the flowsheet's Reports holds the derived
  documents of a process run.  The sections and why each is a report are in
  case/propsReports.ts; this draws them:

    1. Curation verdicts            (the table, and its CSV)
    2. Records and proposals written (each previewed, each downloadable)
    3. Comparison with measured data (the engine's AAD table)
    4. The decisions the run took    (the decision ledger)
    5. Files the run wrote           (every CSV: download, or draw it)
    6. Thermo readiness              (folded)
  and, at the top, ONE download of everything the run produced.

  Before a run every section says what it will hold; nothing is computed
  here.
\*---------------------------------------------------------------------------*/

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Badge, Box, Button, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";

import {
  curationCsv, curationRows, resultFileRows, resultsZip, writtenRecordRows,
} from "../case/propsReports.js";
import { downloadTextFile } from "../case/saveCase.js";
import { CURATION_COLOUR } from "./FitStatsPanel.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { WrittenFile } from "./PropsDetails.js";
import { SectionTitle } from "./ReviewScreen.js";
import type { WorkflowModel } from "./useWorkflowModel.js";

function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([bytes.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <Box data-props-report={id} mb="xl">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {children}
    </Box>
  );
}

function StepCell({ model, step, op }: { model: WorkflowModel; step: string; op: string }) {
  if (!step) return <Text span size="xs" c="dimmed">--</Text>;
  return (
    <Text span size="xs" ff="monospace" style={{ cursor: "pointer", textDecoration: "underline dotted" }}
      title="Select it on the Workflow"
      onClick={() => { model.select(`op:${op.replace(/ …$/, "")}`); }}>
      {step} {op}
    </Text>
  );
}

export function PropsReports({ model, ledger, readiness, validation }: {
  model: WorkflowModel;
  /** the decision ledger (ui/DecisionLedger.tsx), null before a run */
  ledger: ReactNode;
  /** the thermo readiness (ui/ThermoView.tsx) */
  readiness: ReactNode;
  /** the comparison with measured data (the AAD table), null when none */
  validation: ReactNode;
}) {
  const { result, rows, outline, propsDict, caseKey } = model;
  const ran = result?.status === "done";
  const curation = useMemo(() => curationRows(rows, result?.operationResults ?? [], outline),
    [rows, result, outline]);
  const records = useMemo(() => writtenRecordRows(result, outline, propsDict), [result, outline, propsDict]);
  const files = useMemo(() => resultFileRows(result, outline, propsDict), [result, outline, propsDict]);
  const [drawn, setDrawn] = useState<string | null>(null);
  const zip = () => { const z = resultsZip(caseKey, result, curation); if (z) downloadBytes(z.bytes, z.fileName, "application/zip"); };
  const notRun = <Text size="sm" c="dimmed">Run the workflow (the toolbar's Run): this section is filled by the run.</Text>;

  return (
    <ScrollArea h="100%" type="auto" data-props-reports="">
      <Box px="md" py="sm" style={{ maxWidth: 1400 }}>
        <Group justify="space-between" mb="md" wrap="wrap">
          <Box>
            <Text size="md" fw={700}>Reports</Text>
            <Text size="xs" c="dimmed">What the run produced, to read, check and take away.  The figures and
              tables of each study are under Studies; a step's own page opens from the Workflow.</Text>
          </Box>
          <Button size="sm" leftSection={<IconDownload size={15} />} disabled={!ran} onClick={zip}
            data-download-results="" title="Every file the run wrote, the records and proposals, and the curation verdicts as a CSV">
            Download the results (.zip)
          </Button>
        </Group>

        <Section id="curation" title="1 · Curation verdicts"
          hint="Each step that judges its answer on evidence against a band declared before the run.  The verdict and the identifiability answer two different questions and are never merged.">
          {!ran ? notRun : curation.length === 0 ? (
            <Text size="sm" c="dimmed">No step of this case judges its answer against a declared band.</Text>
          ) : (
            <>
              <ScrollArea type="auto">
                <Table withTableBorder fz="xs" verticalSpacing={3} data-curation-table="" style={{ minWidth: 820 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>step</Table.Th><Table.Th>verdict</Table.Th><Table.Th>identifiability</Table.Th>
                      <Table.Th>band (declared before the fit)</Table.Th><Table.Th>held out</Table.Th>
                      <Table.Th>in sample</Table.Th><Table.Th>evidence partition</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {curation.map((c) => (
                      <Table.Tr key={c.op} data-curation-row={c.op}>
                        <Table.Td><StepCell model={model} step={c.step} op={c.op} /></Table.Td>
                        <Table.Td>{c.verdict
                          ? <Badge size="sm" variant="filled" color={CURATION_COLOUR[c.verdict] ?? "gray"} style={{ textTransform: "none" }}>{c.verdict}</Badge>
                          : <Text span size="xs" c="dimmed">none published</Text>}</Table.Td>
                        <Table.Td>{c.identifiable === null ? <Text span size="xs" c="dimmed">not published</Text>
                          : c.identifiable ? "identifiable" : <Text span size="xs" c="red.7" fw={700}>not identifiable</Text>}</Table.Td>
                        <Table.Td ff="monospace">{c.band || "--"}</Table.Td>
                        <Table.Td ff="monospace">{c.heldOut || "--"}</Table.Td>
                        <Table.Td ff="monospace">{c.inSample || "--"}</Table.Td>
                        <Table.Td ff="monospace" title={c.fingerprint}>{c.fingerprint ? `${c.fingerprint.slice(0, 16)}…` : "--"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Button size="compact-sm" variant="subtle" mt={4} leftSection={<IconDownload size={13} />}
                onClick={() => downloadTextFile(curationCsv(curation), "curationVerdicts.csv", "text/csv")}>
                curationVerdicts.csv
              </Button>
            </>
          )}
        </Section>

        <Section id="records" title="2 · Records and proposals the run wrote"
          hint="A record written INTO the case (the flowsheet reads it) or a proposal -- a draft for a human to review and promote.  Each states its own fingerprints; File > Download case (.zip) carries them with the case.">
          {!ran ? notRun : records.length === 0 ? (
            <Text size="sm" c="dimmed">This run wrote no record and no proposal.</Text>
          ) : (
            <Stack gap="md">
              {records.map((r) => (
                <Box key={r.path} data-report-record={r.path}>
                  <Group gap={8} mb={4} wrap="wrap">
                    <Badge size="sm" variant="light" color={r.kind === "record" ? "grape" : "pink"} style={{ textTransform: "none" }}>
                      {r.kind === "record" ? "record, into the case" : "proposal"}
                    </Badge>
                    {r.step && <Text size="xs">written by step <StepCell model={model} step={r.step} op={r.op} /></Text>}
                    {r.fingerprints.map((f) => (
                      <Text key={f.key} size="xs" c="dimmed" title={f.value}>{f.key}: <Text span ff="monospace" size="xs">{f.value.slice(0, 16)}…</Text></Text>
                    ))}
                    <Button size="compact-sm" variant="subtle" leftSection={<IconDownload size={13} />}
                      onClick={() => downloadTextFile(r.text, r.path.split("/").pop() ?? r.path, "text/plain")}>
                      Download
                    </Button>
                  </Group>
                  <WrittenFile path={r.path} text={r.text}
                    why={r.kind === "record" ? "the record as written" : "the proposal as written"} />
                </Box>
              ))}
            </Stack>
          )}
        </Section>

        <Section id="comparison" title="3 · Comparison with measured data"
          hint="The engine's AAD of each model curve against the measured points -- a COMPARISON, not a validation.">
          {!ran ? notRun : validation ?? <Text size="sm" c="dimmed">The run published no AAD against a measured dataset. A figure that draws measured points beside a model (under Studies) is not scored here.</Text>}
        </Section>

        <Section id="decisions" title="4 · The decisions the run took"
          hint="Each pair, dataset and source the run used, and where each came from.">
          {!ran ? notRun : ledger ?? <Text size="sm" c="dimmed">No decision recorded.</Text>}
        </Section>

        <Section id="files" title="5 · Files the run wrote"
          hint="Every table the run wrote -- a fit's parity and residual tables, its history, the views' numbers -- with the step that wrote it (the engine's file-traffic table).  The case's own input data are not listed.">
          {!ran ? notRun : files.length === 0 ? (
            <Text size="sm" c="dimmed">This run wrote no file.</Text>
          ) : (
            <ScrollArea type="auto">
              <Table withTableBorder fz="xs" verticalSpacing={3} data-files-table="" style={{ minWidth: 760 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>file</Table.Th><Table.Th>written by</Table.Th><Table.Th>rows × columns</Table.Th><Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {files.map((f) => (
                    <Fragment key={f.path}>
                      <Table.Tr data-report-file={f.path}>
                        <Table.Td ff="monospace" style={{ wordBreak: "break-all" }}>{f.path}</Table.Td>
                        <Table.Td>{f.view ? <Text span size="xs">the view <Text span ff="monospace" size="xs">{f.view}</Text></Text>
                          : <StepCell model={model} step={f.step} op={f.op} />}</Table.Td>
                        <Table.Td ff="monospace">{f.rows} × {f.columns}</Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Button size="compact-xs" variant="subtle" leftSection={<IconDownload size={12} />}
                              onClick={() => downloadTextFile(result?.csvFiles?.[f.path] ?? "", f.path.split("/").pop() ?? f.path, "text/csv")}>
                              CSV
                            </Button>
                            <Button size="compact-xs" variant={drawn === f.path ? "light" : "subtle"} aria-pressed={drawn === f.path}
                              onClick={() => setDrawn(drawn === f.path ? null : f.path)}>
                              {drawn === f.path ? "Hide" : "Draw it"}
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                      {drawn === f.path && (
                        <Table.Tr>
                          <Table.Td colSpan={4}>
                            <CsvAutoPlot csv={dropPointColumn(result?.csvFiles?.[f.path] ?? "")} filename={f.path} />
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Section>

        <Section id="readiness" title="6 · Thermo readiness"
          hint="Every component's data and each phase's model, as the case declares them -- what a flowsheet built on these properties would run on.">
          <details data-report-readiness="">
            <summary style={{ cursor: "pointer" }}><Text span size="sm">Show the readiness table</Text></summary>
            <Box style={{ position: "relative", height: "60vh", minHeight: 380, marginTop: 8 }}>{readiness}</Box>
          </details>
        </Section>
      </Box>
    </ScrollArea>
  );
}
