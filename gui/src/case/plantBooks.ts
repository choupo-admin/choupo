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
//  THE PLANT'S BOOKS, as the Economic appraisal report reads them (DEV.md 4c
//  C524).  The engine writes the three statements (income statement, balance
//  sheet, cash-flow statement) from the appraisal's own yearly rows; this file
//  computes NO accounting.  It does two small things only: it re-checks, in the
//  browser and from the rows the engine published, that assets equal
//  liabilities plus equity in every year (so the reader sees the identity hold
//  without an engine call), and it reads the working-capital lines and the NPV
//  summary a student wants beside the statements.

import type { BooksRow, Economics, EconomicsBooks } from "../adapters/SolverAdapter.js";

const rowOf = (rows: BooksRow[], key: string): BooksRow | undefined =>
  rows.find((r) => r.key === key);

/** The identity every balance sheet must satisfy, recomputed from the rows:
 *  the worst |assets - liabilities - equity| over the years, relative to the
 *  largest total of the sheet.  null when the three totals are not there. */
export function balanceIdentity(b: EconomicsBooks): { worst: number; year: number } | null {
  const a = rowOf(b.balanceSheet, "totalAssets");
  const l = rowOf(b.balanceSheet, "totalLiabilities");
  const e = rowOf(b.balanceSheet, "totalEquity");
  if (!a || !l || !e) return null;
  let scale = 0;
  for (let i = 0; i < b.years.length; i++)
    scale = Math.max(scale, Math.abs(a.values[i] ?? 0), Math.abs((l.values[i] ?? 0) + (e.values[i] ?? 0)));
  if (!(scale > 0)) scale = 1;
  let worst = 0, year = b.years[0] ?? 0;
  for (let i = 0; i < b.years.length; i++) {
    const d = Math.abs((a.values[i] ?? 0) - (l.values[i] ?? 0) - (e.values[i] ?? 0)) / scale;
    if (d > worst) { worst = d; year = b.years[i] ?? 0; }
  }
  return { worst, year };
}

/** Closing cash of the cash-flow statement against the balance sheet's cash:
 *  the worst absolute difference over the years, relative to the sheet's scale. */
export function cashIdentity(b: EconomicsBooks): number | null {
  const c = rowOf(b.cashFlowStatement, "closingCash");
  const s = rowOf(b.balanceSheet, "cash");
  const a = rowOf(b.balanceSheet, "totalAssets");
  if (!c || !s || !a) return null;
  const scale = Math.max(1, ...a.values.map(Math.abs));
  let worst = 0;
  for (let i = 0; i < b.years.length; i++)
    worst = Math.max(worst, Math.abs((c.values[i] ?? 0) - (s.values[i] ?? 0)) / scale);
  return worst;
}

export interface WorkingCapitalSummary {
  /** The year the working capital is held (the end of construction, year 0). */
  year: number;
  lines: { label: string; value: number; sign: 1 | -1 }[];
  net: number;
}

/** What the plant holds and owes in working capital, from the balance sheet of
 *  the first year it holds any -- the same lines, signs and net the NPV used. */
export function workingCapitalSummary(b: EconomicsBooks): WorkingCapitalSummary | null {
  const keys: [string, 1 | -1][] = [
    ["rawMaterialStock", 1], ["processInventory", 1], ["productStock", 1],
    ["receivables", 1], ["operatingCashReserve", 1], ["undividedWorkingCapital", 1],
    ["payables", -1],
  ];
  const idx = b.years.findIndex((_, i) =>
    keys.some(([k]) => Math.abs(rowOf(b.balanceSheet, k)?.values[i] ?? 0) > 0));
  if (idx < 0) return null;
  const lines = keys
    .map(([k, sign]) => {
      const r = rowOf(b.balanceSheet, k);
      return r ? { label: r.label, value: r.values[idx], sign } : null;
    })
    .filter((x): x is { label: string; value: number; sign: 1 | -1 } =>
      x !== null && x.value !== 0);
  return {
    year: b.years[idx] ?? 0, lines,
    net: lines.reduce((s, l) => s + l.sign * l.value, 0),
  };
}

/** The one plain sentence under the statements: what is tied to what, and
 *  whether it held, in the engine's and the browser's own numbers. */
export function booksSentence(b: EconomicsBooks): string {
  const bal = balanceIdentity(b);
  const worst = bal ? bal.worst : b.checks.balanceError;
  const holds = worst <= 1e-9;
  const flow = b.basis === "equity" ? "equity cash flow (after the loan)" : "project cash flow";
  return (holds
    ? `Assets equal liabilities plus equity in every year (worst difference ${worst.toExponential(1)} of the sheet's size). `
    : `The balance sheet does NOT balance: worst difference ${worst.toExponential(1)} in year ${bal?.year ?? b.checks.worstYear} -- an account is missing. `)
    + `Operations + investing + loan flows equal the appraisal's ${flow} year by year, and `
    + `closing cash is the balance sheet's cash.`
    + (b.checks.cashOverdrawn ? " Cash is negative in some year: the project does not fund itself that year." : "");
}

/** Economics -> books, or null (an older payload). */
export const booksOf = (e: Economics | undefined): EconomicsBooks | null =>
  e?.books && e.books.years.length > 0 ? e.books : null;

/** Money as the report prints it (k / M suffix), signs kept. */
export function fmtBooksMoney(v: number): string {
  if (v === 0) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(0);
}
