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
  VariablesWorkspace -- read-only readout of a case's $variables (L0).

  Three roles, made visible (constant / manipulated / computed), with the
  DECLARED value (or initial guess, or expression) kept VISUALLY DISTINCT from
  the SOLVED value of the last run -- so a student never mistakes the initial
  guess for the answer.  Pure viewer: nothing here mutates the case.

  Solved values come ONLY from the run JSON (RunResult.computed); when the
  solver did not emit one (e.g. a driver-owned unknown's converged value is
  not emitted yet) the cell shows "—".  We never infer.
\*---------------------------------------------------------------------------*/

import { Fragment } from "react";
import { Badge, Box, Code, Group, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";

import { useStore } from "../state/store.js";
import { buildVariableRows, buildSpecTargets, type SpecTarget, type VarRole, type VarRow } from "../case/variables.js";
import { formatSig } from "../state/displayUnits.js";

// One DesignSpec target: "↳ drives PreheatMeoh.T_out → 450 (±0.05)  ·  got 450.00 ✓"
function TargetLine({ t }: { t: SpecTarget }) {
  return (
    <Text size="11px" ff="monospace" c="dimmed">
      ↳ drives <Text span c="grape.3">{t.path}</Text> → {formatSig(t.value)}
      {t.tol !== undefined ? ` (±${formatSig(t.tol)})` : ""}
      {t.achieved !== undefined && (
        <>
          {"  ·  last run: "}
          <Text span c={t.met === false ? "red.4" : "teal.4"}>
            {formatSig(t.achieved)} {t.met === false ? "✗" : t.met ? "✓" : ""}
          </Text>
        </>
      )}
    </Text>
  );
}

const ROLE_META: Record<VarRole, { color: string; label: string; help: string }> = {
  constant: {
    color: "gray",
    label: "constant",
    help: "A shared named value you own. Edit it on disk in the variables{} block; every $ref to it updates at once.",
  },
  manipulated: {
    color: "grape",
    label: "design unknown",
    help: "Owned by an outer driver (DesignSpec/Sweep/Optim). The value in the dict is only the INITIAL GUESS — the driver overwrites it each pass to hit its target. Do not hand-set it as if it were the answer.",
  },
  computed: {
    color: "teal",
    label: "computed",
    help: "A post-processing expression evaluated AFTER the solve. Its value is a result, not an input.",
  },
};

function declaredCell(r: VarRow): string {
  if (r.role === "computed") return r.expr ? `= ${r.expr}` : "—";
  if (r.role === "manipulated") {
    const b = r.bounds;
    const seed = r.declared ?? (b?.initial !== undefined ? formatSig(b.initial) : "—");
    const lo = b?.min !== undefined ? formatSig(b.min) : "?";
    const hi = b?.max !== undefined ? formatSig(b.max) : "?";
    return `${seed}  (guess; in [${lo}, ${hi}] SI)`;
  }
  return r.declared ?? "—";
}

export function VariablesWorkspace() {
  const caseFiles = useStore((s) => s.caseFiles);
  const runResult = useStore((s) => s.runResult);
  const rows = buildVariableRows(caseFiles, runResult);

  if (rows.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%" gap={6}>
        <Text c="dimmed" size="sm">This case declares no $variables.</Text>
        <Text c="dimmed" size="xs">
          A case may declare a <Code>variables {"{...}"}</Code> block in its flowsheetDict —
          shared constants, design unknowns, or computed expressions.
        </Text>
      </Stack>
    );
  }

  const anyComputed = rows.some((r) => r.role === "computed");

  // Targets not paired to any knob's unit (coupled specs) -- shown separately
  // so nothing is hidden.
  const shownPaths = new Set(rows.flatMap((r) => (r.targets ?? []).map((t) => t.path)));
  const unmatchedTargets = buildSpecTargets(caseFiles, runResult).filter((t) => !shownPaths.has(t.path));

  return (
    <ScrollArea h="100%" type="always" scrollbarSize={10}
      styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}>
      <Box p="md">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.5 }}>
            $variables
          </Text>
          <Text size="xs" c="dimmed">
            declared on disk · read-only · {anyComputed && !runResult ? "run to fill solved values" : "solved values from last run"}
          </Text>
        </Group>

        <Table verticalSpacing={6} horizontalSpacing="md" fz="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th><Text size="xs" c="dimmed" tt="uppercase">name</Text></Table.Th>
              <Table.Th><Text size="xs" c="dimmed" tt="uppercase">role</Text></Table.Th>
              <Table.Th><Text size="xs" c="dimmed" tt="uppercase">declared / guess / expression</Text></Table.Th>
              <Table.Th><Text size="xs" c="dimmed" tt="uppercase">solved (last run)</Text></Table.Th>
              <Table.Th><Text size="xs" c="dimmed" tt="uppercase">used in</Text></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => {
              const meta = ROLE_META[r.role];
              return (
                <Fragment key={r.name}>
                <Table.Tr>
                  <Table.Td>
                    <Text ff="monospace" fw={600}>${r.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={meta.help} multiline w={280} withArrow position="right">
                      <Badge color={meta.color} variant="light" size="sm" style={{ cursor: "help" }}>
                        {meta.label}
                      </Badge>
                    </Tooltip>
                    {r.owner && r.role === "manipulated" && (
                      <Text size="10px" c="dimmed" ff="monospace">{r.owner}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text ff="monospace" size="xs" c="var(--mantine-color-text)">
                      {declaredCell(r)}
                      {r.unit ? ` ${r.unit}` : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {r.solved !== undefined ? (
                      <Text ff="monospace" fw={600} c="teal.4">
                        {formatSig(r.solved)}{r.unit ? ` ${r.unit}` : ""}
                      </Text>
                    ) : (
                      <Text ff="monospace" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {r.usedIn.length === 0 ? (
                      <Text size="xs" c="dimmed">{r.role === "computed" ? "(report only)" : "(unused)"}</Text>
                    ) : (
                      <Stack gap={0}>
                        {r.usedIn.map((u, i) => (
                          <Text key={i} size="11px" ff="monospace" c="dimmed">
                            {u.unit}.{u.key}
                          </Text>
                        ))}
                      </Stack>
                    )}
                  </Table.Td>
                </Table.Tr>
                {r.targets && r.targets.length > 0 && (
                  <Table.Tr>
                    <Table.Td />
                    <Table.Td colSpan={4} pt={0}>
                      <Stack gap={2}>
                        {r.targets.map((t) => <TargetLine key={t.path} t={t} />)}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>

        {unmatchedTargets.length > 0 && (
          <Box mt="sm">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={2}>
              Other DesignSpec targets (coupled — not tied to one knob)
            </Text>
            <Stack gap={2}>
              {unmatchedTargets.map((t) => <TargetLine key={t.path} t={t} />)}
            </Stack>
          </Box>
        )}

        <Text size="xs" c="dimmed" mt="md" maw={620}>
          The <Text span fw={600}>declared</Text> column is what the dict on disk says (a design
          unknown shows its initial guess + bounds — the driver overwrites it). The
          {" "}<Text span fw={600} c="teal.4">solved</Text> column is the converged value from the
          last run. A <Text span c="grape.3">↳ drives</Text> line is the OTHER half of a
          DesignSpec — the target the driver turns that knob to hit, with the last-run value and a
          ✓/✗ against its tolerance. To change a value, edit the
          {" "}<Code>variables {"{...}"}</Code> block (or the targets in <Code>outerDict</Code>) on disk.
        </Text>
      </Box>
    </ScrollArea>
  );
}
