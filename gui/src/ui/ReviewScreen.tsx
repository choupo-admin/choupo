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
  ReviewScreen -- A PROPS RUN, READ TOP TO BOTTOM (DEV.md 4c C149).

    1. WHAT THE RUN DID -- the verdict strip: one row per operation, what it
       did, its curation verdict where it claims one, how many points it ran
       on, its agreement with data and its held-out agreement.
    2. (thermo readiness -- here only where the case CREATES or ESTIMATES a
       component; everywhere else it is in the audit)
    3. FIGURES -- the views the propsDict declared, then each operation's
       defaults, drawn by ViewFigure.
    4. PARAMETERS AND TABLES -- the table views, in the same order.
    5. AUDIT, collapsed -- the raw diagnostics, the decision ledger, the thermo
       readiness and every operation's own panel: the surface this screen
       replaces as the landing, kept whole one click below it.

  Nothing here computes a number: every cell and every point is the engine's
  (reviewScreen.ts for the strip, postProcessing.ts for the views).
\*---------------------------------------------------------------------------*/

import { useState, type ReactNode } from "react";
import { Badge, Box, Button, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { viewGroups, type ViewGroup } from "../case/postProcessing.js";
import { verdictRows, type VerdictRow } from "../case/reviewScreen.js";
import { CURATION_COLOUR } from "./FitStatsPanel.js";
import { ViewFigure } from "./plotting/ViewFigure.js";

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

/** Rows shown before the strip folds: a case of twenty operations must not
 *  push its figures below the fold. */
const STRIP_ROWS = 8;

function VerdictStrip({ rows, ran }: { rows: VerdictRow[]; ran: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, STRIP_ROWS);
  return (
    <>
    <ScrollArea type="auto">
      <Table withTableBorder fz="xs" verticalSpacing={3} data-review="verdicts"
        style={{ minWidth: 640 }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>operation</Table.Th>
            <Table.Th>what it did</Table.Th>
            <Table.Th>verdict</Table.Th>
            <Table.Th ta="right">points</Table.Th>
            <Table.Th ta="right">AAD vs data</Table.Th>
            <Table.Th ta="right">held-out AAD</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((r, i) => (
            <Table.Tr key={r.name} style={!r.ran && ran ? { opacity: 0.6 } : undefined}>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                <Text span size="xs" ff="monospace" fw={600}>{r.name}</Text>
                <Text span size="xs" c="dimmed"> · {r.type}</Text>
              </Table.Td>
              <Table.Td>
                {/* the type's sentence once per run of one type, not twenty times */}
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {i > 0 && shown[i - 1]!.type === r.type ? "″" : r.did}
                </Text>
              </Table.Td>
              <Table.Td>
                {r.verdict ? (
                  <Badge size="sm" variant="light" color={CURATION_COLOUR[r.verdict] ?? "gray"}
                    style={{ textTransform: "none" }}>{r.verdict}</Badge>
                ) : (
                  <Text size="xs" c="dimmed">{!ran ? "not run" : r.ran ? "no claim" : "no result"}</Text>
                )}
              </Table.Td>
              <Table.Td ta="right" ff="monospace">
                {r.points && (
                  <Tooltip label={`the op's ${r.points.key}`} withArrow>
                    <span>{r.points.value}</span>
                  </Tooltip>
                )}
              </Table.Td>
              <Table.Td ta="right" ff="monospace">{pct(r.aadPct)}</Table.Td>
              <Table.Td ta="right" ff="monospace">{pct(r.heldOutAadPct)}</Table.Td>
            </Table.Tr>
          ))}
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

function ViewGrid({ groups, ops, csvFiles, kind }: {
  groups: ViewGroup[]; ops: JsonDict[]; csvFiles: { [f: string]: string };
  kind: "plot" | "table";
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
          <Box style={{ display: "grid", gap: 12,
            gridTemplateColumns: kind === "plot"
              ? "repeat(auto-fill, minmax(min(100%, 460px), 1fr))" : "minmax(0, 1fr)" }}>
            {items.map((it) => (
              <ViewFigure key={`${it.op}/${it.name}`} item={it} csv={csvFiles[it.file]} />
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function ReviewScreen({ ops, result, readiness, audit }: {
  ops: JsonDict[];
  result: RunResult | undefined;
  /** the thermo readiness, drawn here (a case that creates a component) */
  readiness?: ReactNode;
  /** the full surface the screen replaces as the landing, collapsed below it */
  audit: ReactNode;
}) {
  const ran = result?.status === "done";
  const rows = verdictRows(ops, result?.operationResults ?? [], result?.validation);
  const block = result?.postProcessing;
  const groups = block ? viewGroups(block) : [];
  const csvFiles = result?.csvFiles ?? {};
  return (
    <Box style={{ position: "absolute", inset: 0 }}>
      <ScrollArea h="100%" type="auto">
        <Stack gap="lg" px="md" py="sm" data-review="screen" style={{ maxWidth: 1600 }}>
          <Box>
            <SectionTitle hint={ran ? undefined : "Run properties: each operation reports here."}>
              What the run did
            </SectionTitle>
            <VerdictStrip rows={rows} ran={ran} />
          </Box>
          {readiness && (
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
              ? <ViewGrid groups={groups} ops={ops} csvFiles={csvFiles} kind="plot" />
              : <Text size="sm" c="dimmed">Not run yet.</Text>}
          </Box>
          <Box>
            <SectionTitle>Parameters and tables</SectionTitle>
            {ran
              ? <ViewGrid groups={groups} ops={ops} csvFiles={csvFiles} kind="table" />
              : <Text size="sm" c="dimmed">Not run yet.</Text>}
          </Box>
          <details data-review="audit">
            <summary style={{ cursor: "pointer" }}>
              <Text span size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
                Audit
              </Text>
              <Text span size="xs" c="dimmed"> — the raw diagnostics, the decision ledger, the thermo
                readiness and every operation&apos;s own panel</Text>
            </summary>
            <Box mt="xs" style={{ position: "relative", height: "78vh", minHeight: 480,
              display: "flex", flexDirection: "column",
              border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
              borderRadius: 6, overflow: "hidden" }}>
              {audit}
            </Box>
          </details>
        </Stack>
      </ScrollArea>
    </Box>
  );
}
