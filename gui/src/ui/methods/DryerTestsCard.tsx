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
  DryerTestsCard -- "What you cannot calculate: the bill of tests" (C508, C10),
  the first card of the dryer-selection page.

  THE TASK, in one sentence: before choosing a dryer, which of the numbers a
  dryer calculation needs can a student only get from a test of the product,
  and which does the plant decide?  Two lists, each row with the number the
  engine takes from the bundled tray and spray-dryer cases -- READ from the
  cases' own text (dryingBalance.declaredNumber), so the page types none of
  them.  The right-hand column names the same thing in the books' list of
  what to know before selecting a dryer (dryerTables.MUJ_MINIMUM_INFO,
  re-used, not re-typed).

  It is the list of what the ENGINE needs, not a protocol for a test.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Table, Text, Title } from "@mantine/core";

import { W_SPRAY_BASE, W_TRAY, declaredNumber } from "./dryingBalance.js";
import { MUJ_MINIMUM_INFO } from "./dryerTables.js";
import { OriginMark } from "./origin.js";

const FLOW = "system/flowsheetDict";
const SUCROSE = "constant/components/sucrose.dat";
const g = (v: number | null): string => (v === null ? "not declared" : String(v));

/** The list entry of the books' minimum information that names `word`. */
const bookItem = (word: string): string =>
  MUJ_MINIMUM_INFO.find((t) => t.toLowerCase().includes(word)) ?? "not in the list";

export interface TestRow { what: string; value: string; book: string; why: string }

/** Rows the engine takes from a MEASUREMENT of the sample (a test), each with
 *  the number the bundled case declares. */
export function measuredRows(): TestRow[] {
  return [
    { what: "Critical moisture X_c, kg/kg",
      value: `${g(declaredNumber(W_TRAY, FLOW, "criticalMoisture"))} (tray), `
        + `${g(declaredNumber(W_SPRAY_BASE, "constant/dryingKinetics", "Xc", "sugarDrying"))} (spray)`,
      book: bookItem("drying kinetics"),
      why: "where the surface stops keeping itself wet; the engine echoes it, it does not predict it" },
    { what: "The falling-rate curve, exponent n",
      value: g(declaredNumber(W_TRAY, FLOW, "exponent", "dryingCurve")),
      book: bookItem("drying kinetics"),
      why: "the shape of the tail; a declared curve, not a mechanism" },
    { what: "Gas-film coefficient k_Y, kg/(m² s) per unit humidity",
      value: g(declaredNumber(W_TRAY, FLOW, "k_Y")),
      book: bookItem("drying kinetics"),
      why: "air velocity and tray geometry in one number; the engine requires it declared" },
    { what: "Sorption isotherm of the sample, GAB constants X_m, C, K",
      value: `${g(declaredNumber(W_TRAY, SUCROSE, "Xm", "sorption"))}, `
        + `${g(declaredNumber(W_TRAY, SUCROSE, "C", "sorption"))}, `
        + `${g(declaredNumber(W_TRAY, SUCROSE, "K", "sorption"))}`,
      book: bookItem("sorption"),
      why: "the floor the air allows; a fit, trusted inside the water activities it was fitted over" },
  ];
}

/** Rows the PLANT decides, each with the number the bundled case declares. */
export function decidedRows(): TestRow[] {
  return [
    { what: "Air temperature T, K",
      value: g(declaredNumber(W_TRAY, FLOW, "T", "air")),
      book: bookItem("quality"), why: "chosen against what the product tolerates" },
    { what: "Air humidity Y, kg/kg dry gas",
      value: g(declaredNumber(W_TRAY, FLOW, "Y", "air")),
      book: "not named in that list", why: "the day's weather and the plant's air supply, not a property of the product" },
    { what: "Exposed area A, m² (the loading follows)",
      value: g(declaredNumber(W_TRAY, FLOW, "area")),
      book: bookItem("throughput"), why: "hardware and batch size" },
    { what: "Chamber height H, m (spray)",
      value: g(declaredNumber(W_SPRAY_BASE, FLOW, "chamberHeight", "operation")),
      book: bookItem("throughput"), why: "hardware" },
    { what: "Wheel speed, rpm (spray)",
      value: g(declaredNumber(W_SPRAY_BASE, FLOW, "wheelSpeed", "operation")),
      book: bookItem("physical"), why: "sets the droplet size, and so the clock" },
  ];
}

function RowsTable({ rows, label }: { rows: TestRow[]; label: string }): JSX.Element {
  return (
    <Box style={{ overflowX: "auto", maxWidth: "100%" }}>
      <Table withTableBorder withColumnBorders fz="xs" data-tests-table={label}>
        <Table.Thead><Table.Tr>
          <Table.Th>The engine takes</Table.Th><Table.Th>the bundled case&apos;s number</Table.Th>
          <Table.Th>why it is this kind of number</Table.Th>
          <Table.Th>the books&apos; list of what to know before choosing, same thing</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.what}>
              <Table.Td>{r.what}</Table.Td><Table.Td>{r.value}</Table.Td>
              <Table.Td>{r.why}</Table.Td><Table.Td>{r.book}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

export function DryerTestsCard(): JSX.Element {
  return (
    <Box px="sm" py={8} data-card="bill-of-tests"
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Title order={5}>What you cannot calculate: the bill of tests</Title>
      <OriginMark of={["engine", "reference"]}
        note="the numbers are read from the bundled tray and spray-dryer cases; the right-hand column is the checklist of Mujumdar's Handbook (pp. 27-28), re-used from the tables below" />
      <Text size="sm" mt={4}>
        A dryer calculation needs a few numbers that no theory supplies, and the engine takes each from
        the case as a declared input.  They come from a test of the product: the sample, not the
        dryer, is what is measured.  The rest the plant decides.
      </Text>
      <Text size="sm" fw={600} mt={8}>Measured on the sample</Text>
      <RowsTable rows={measuredRows()} label="measured" />
      <Text size="sm" fw={600} mt={8}>Decided by the plant</Text>
      <RowsTable rows={decidedRows()} label="decided" />
      <Alert color="gray" variant="light" mt={8} p="xs" data-tests-limit="">
        <Text size="xs">
          A simulator does not replace a drying test: it turns the four numbers of a test into curves,
          times and bills, and the numbers in the table are the bundled cases&apos; hypothetical teaching
          values.  The list is what the engine needs; it is not a protocol for a test.
        </Text>
      </Alert>
    </Box>
  );
}
