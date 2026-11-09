/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  MachineUtilisationTable -- the per-machine utilisation of a batch plant
  (DEV.md 4c C195/C210), the least capacity margin first.  Every number is a field of
  the engine's `ratedMachine` sheet (case/machineUtilisation.ts reads them);
  nothing here divides or compares a load with a rating.  The marks are the
  engine's: a machine is "announced" when the engine raised its utilisation
  advisory (its message is the tooltip); above 1 the engine REFUSES the run,
  so the table says that in its legend and can never show such a row.
\*---------------------------------------------------------------------------*/

import { Badge, Box, ScrollArea, Table, Text } from "@mantine/core";
import type { MachineRow } from "../case/machineUtilisation.js";

const pct = (v: number | null) => (v !== null && Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : "—");
const g = (v: number) => String(Number(v.toPrecision(5)));
const qty = (q: { value: number; unit: string } | null) => (q ? `${g(q.value)} ${q.unit}` : "—");

function Bar({ u, announced }: { u: number; announced: boolean }) {
  //  The bar spans 0 to 100 %: the right edge IS the data-sheet limit.
  const w = Math.max(0, Math.min(1, u)) * 100;
  return (
    <Box role="img" aria-label={`utilisation ${pct(u)}`}
      style={{ position: "relative", width: 110, height: 10, borderRadius: 2,
               border: "1px solid var(--mantine-color-default-border)" }}>
      <Box style={{ width: `${w}%`, height: "100%",
                    background: announced ? "var(--mantine-color-orange-6)"
                                          : "var(--mantine-color-teal-6)" }} />
    </Box>
  );
}

export function MachineUtilisationTable({ rows }: { rows: MachineRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Box data-machine-utilisation mt="md">
      <Text size="sm" fw={600} mb={4}>Machine utilisation — least capacity margin first</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={900}>
          <Table.Thead><Table.Tr>
            <Table.Th>machine</Table.Th><Table.Th>kind</Table.Th>
            <Table.Th ta="right">installed</Table.Th><Table.Th>declared rating (one machine)</Table.Th>
            <Table.Th ta="right">load</Table.Th><Table.Th ta="right">utilisation</Table.Th>
            <Table.Th />
            <Table.Th ta="right">plan stage</Table.Th>
            <Table.Th ta="right">lot / shift (h)</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r, i) => (
              <Table.Tr key={`${r.sector}/${r.unit}`} data-machine={r.unit}>
                <Table.Td fw={i === 0 ? 700 : undefined}>{r.unit}{i === 0 ? " ▲" : ""}</Table.Td>
                <Table.Td>{r.kind}</Table.Td>
                <Table.Td ta="right">{r.installed}</Table.Td>
                <Table.Td>{r.rating}</Table.Td>
                <Table.Td ta="right">{qty(r.load)}</Table.Td>
                <Table.Td ta="right">
                  {pct(r.utilisation)}{" "}
                  {r.announced !== null && (
                    <Badge size="xs" color="orange" variant="light" title={r.announced}
                      data-announced="">announced</Badge>
                  )}
                </Table.Td>
                <Table.Td><Bar u={r.utilisation} announced={r.announced !== null} /></Table.Td>
                <Table.Td ta="right">{pct(r.utilisationPlan)}</Table.Td>
                <Table.Td ta="right">
                  {r.lotHours !== null ? g(r.lotHours) : "—"} / {r.shiftHours !== null ? g(r.shiftHours) : "—"}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Text size="xs" c="dimmed" mt={2}>
        ▲ least capacity margin: the machine whose load is closest to what its installed
        machines can carry.  It is NOT the plan's limiting stage (◆ in the Gantt and the stage
        table), which is the stage whose cycle sets a train's lot interval T_L; the two can be
        different machines.  Utilisation is the engine's: the lot's load over what the installed
        machines of the declared rating can carry.  <em>announced</em> = the engine raised its
        advisory for that machine (hover for its message; the threshold is the engine's 0.85
        unless the case declares its own).  Above 100 % the engine refuses the run, so no
        machine here is scheduled above its data-sheet maximum.  The plan-stage column is the
        batch plan's own utilisation of the stage (cycle over T_L), a different question.
      </Text>
    </Box>
  );
}
