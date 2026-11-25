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
//
//  The plant's three statements (DEV.md 4c C524), drawn from the rows the
//  engine published: years across, accounts down, every account with its
//  plain-language definition on hover.  Nothing is computed here but the
//  browser's own re-check that the balance sheet balances.

import { ScrollArea, Table, Text } from "@mantine/core";
import type { BooksRow, EconomicsBooks } from "../adapters/SolverAdapter.js";
import {
  booksSentence, fmtBooksMoney, workingCapitalSummary,
} from "../case/plantBooks.js";

function Statement({ id, title, lead, years, rows, currency }: {
  id: string; title: string; lead: string; years: number[];
  rows: BooksRow[]; currency: string;
}) {
  // A row that is zero in every year (royalty, loan, dividends ...) is left
  // out of the picture; the CSV and the .ods keep every account.
  const shown = rows.filter((r) => r.subtotal || r.values.some((v) => v !== 0));
  return (
    <div data-testid={`books-${id}`} style={{ marginBottom: 12 }}>
      <Text size="xs" fw={600} mb={2}>{title}</Text>
      <Text size="xs" c="dimmed" mb={4}>{lead}</Text>
      <ScrollArea type="auto">
        <Table withTableBorder fz="xs" ff="monospace" miw={560}>
          <Table.Thead><Table.Tr>
            <Table.Th>Account ({currency})</Table.Th>
            {years.map((y) => <Table.Th key={y} ta="right">{y}</Table.Th>)}
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {shown.map((r) => (
              <Table.Tr key={r.key} data-testid={`books-${id}-${r.key}`}>
                <Table.Td title={r.help} fw={r.subtotal ? 700 : undefined}>{r.label}</Table.Td>
                {r.values.map((v, i) => (
                  <Table.Td key={years[i]} ta="right" fw={r.subtotal ? 700 : undefined}
                    c={v < 0 ? "red.5" : undefined}>{fmtBooksMoney(v)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </div>
  );
}

export function PlantBooksTables({ books, currency }: {
  books: EconomicsBooks; currency: string;
}) {
  const wc = workingCapitalSummary(books);
  return (
    <div data-testid="plantBooks" style={{ marginTop: 12 }}>
      <Text size="sm" fw={700} mb={2}>The plant's books</Text>
      <Text size="xs" c="dimmed" mb={6}>
        The same appraisal as three yearly statements.  Year 0 is the end of construction; hover
        an account for its one-line definition.  Money in {currency} (k / M suffix).
      </Text>
      <Statement id="income" title="Income statement"
        lead="What the plant earned each year: revenue, less the costs, down to the profit after tax."
        years={books.years} rows={books.incomeStatement} currency={currency} />
      <Statement id="balance" title="Balance sheet (end of each year)"
        lead="What the plant owns (assets) against what it owes and what the owners put in (liabilities + equity): the two sides are equal every year."
        years={books.years} rows={books.balanceSheet} currency={currency} />
      <Statement id="cash" title="Cash-flow statement"
        lead="Where the cash came from and went: operations, investing, financing; closing cash is the balance sheet's cash."
        years={books.years} rows={books.cashFlowStatement} currency={currency} />
      <Text size="xs" mb={6} data-testid="books-sentence">{booksSentence(books)}</Text>
      {wc && (
        <div data-testid="books-workingCapital">
          <Text size="xs" fw={600} mb={2}>Working capital (held from year {wc.year} to the end of life)</Text>
          <Text size="xs" c="dimmed">
            {wc.lines.map((l) => `${l.sign < 0 ? "− " : "+ "}${l.label} ${fmtBooksMoney(l.value)}`).join("  ")}
            {"  =  "}<b>{fmtBooksMoney(wc.net)} {currency}</b> net, the amount the NPV invests at year 0 and gets back at the end.
          </Text>
        </div>
      )}
    </div>
  );
}
