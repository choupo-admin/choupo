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
  BatchBasesTable and DosageFormTable -- the two reconciliations of a batch
  plant (DEV.md 4c C264), drawn from what the ENGINE published in
  `batchPlan.bases` and `batchPlan.dosage`.

  A student walking donepezil02 met 300 kg, 305.9 kg, 720 000 tablets/h,
  168 h, 880 h, 2079 h and 3840 h on different screens with no line saying
  which is which.  The engine now publishes each with its definition and the
  field it echoes; this file lays them out.  Nothing here divides, sums or
  converts beyond kg -> mg for a unit's ingredients (the engine publishes
  kg per unit; a tablet is read in mg).
\*---------------------------------------------------------------------------*/

import { Box, ScrollArea, Table, Text } from "@mantine/core";

import type { BatchBasis, BatchDosage } from "../adapters/batchPlanPayload.js";

const g = (v: number, p = 6) => (Number.isFinite(v) ? String(Number(v.toPrecision(p))) : "—");
const big = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—");

/** Every number a student must reconcile, its definition and its home. */
export function BatchBasesTable({ bases }: { bases: BatchBasis[] }) {
  if (bases.length === 0) return null;
  return (
    <Box data-batch-bases mt="sm" mb="sm">
      <Text size="sm" fw={600} mb={4}>Bases — which number is which</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" miw={760}>
          <Table.Thead><Table.Tr>
            <Table.Th>quantity</Table.Th>
            <Table.Th ta="right">value</Table.Th>
            <Table.Th>unit</Table.Th>
            <Table.Th>definition</Table.Th>
            <Table.Th>published as</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {bases.map((b) => (
              <Table.Tr key={b.key} data-basis={b.key}>
                <Table.Td fw={600}>{b.label}</Table.Td>
                <Table.Td ta="right" ff="monospace">{g(b.amount, 7)}</Table.Td>
                <Table.Td ff="monospace">{b.unit}</Table.Td>
                <Table.Td>{b.definition}</Table.Td>
                <Table.Td ff="monospace" c="dimmed">{b.home}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Text size="xs" c="dimmed" mt={2}>
        Every line is the engine's (result JSON <code>batchPlan.bases</code>), an echo of the field
        in the last column; the batch-plan gate holds each value to that field.
      </Text>
    </Box>
  );
}

/** The product counted in the units it is sold in: one table per product. */
export function DosageFormTable({ dosage, lotSizeOf }: {
  dosage: BatchDosage[];
  /** The product's published lot [kg], by product name (the plan's own record). */
  lotSizeOf?: (product: string) => number | undefined;
}) {
  if (dosage.length === 0) return null;
  return (
    <Box data-dosage-form mt="sm" mb="sm">
      {dosage.map((d) => {
        const lot = lotSizeOf?.(d.product);
        return (
          <Box key={d.product} mb="sm" data-dosage={d.product}>
            <Text size="sm" fw={600} mb={2}>
              {d.product}: one {d.unitName} = {g(d.unitMass * 1e6, 6)} mg
            </Text>
            <Text size="xs" mb={4}>
              {big(d.unitsPerLot)} {d.unitName}s per lot
              {lot !== undefined && Number.isFinite(lot) ? ` (${g(lot, 6)} kg)` : ""} ·{" "}
              {big(d.unitsPerYear)} {d.unitName}s a year made ({big(d.demandUnitsPerYear)} asked) ·
              fluid phases (here the moisture) {g(100 * d.fluidMassFraction, 4)} % by mass
            </Text>
            <ScrollArea type="auto">
              <Table striped withTableBorder fz="xs" ff="monospace" miw={620}>
                <Table.Thead><Table.Tr>
                  <Table.Th>ingredient</Table.Th>
                  <Table.Th ta="right">mg per {d.unitName}</Table.Th>
                  <Table.Th ta="right">mass %</Table.Th>
                  <Table.Th ta="right">kg per lot</Table.Th>
                  <Table.Th ta="right">in the solid</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {d.ingredients.map((x) => (
                    <Table.Tr key={x.component} data-ingredient={x.component}>
                      <Table.Td>{x.component}</Table.Td>
                      <Table.Td ta="right">{g(x.perUnit * 1e6, 5)}</Table.Td>
                      <Table.Td ta="right">{g(100 * x.massFraction, 4)}</Table.Td>
                      <Table.Td ta="right">{g(x.perLot, 5)}</Table.Td>
                      <Table.Td ta="right">{g(100 * x.solidFraction, 4)} %</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Text size="xs" c="dimmed" mt={2}>
              The {d.unitName}'s mass is declared ({d.source}); each ingredient is the product
              stream's own mass fraction times it.
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
