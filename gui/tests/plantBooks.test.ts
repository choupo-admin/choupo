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

// The plant's books in the Economic appraisal report (DEV.md 4c C524): the
// adapter keeps what the engine wrote and drops what is malformed, the
// browser re-checks that the balance sheet balances from the published rows,
// the working-capital summary names the lines the NPV used, and the report
// draws the three statements and labels the tornado.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shapeBooks } from "../src/adapters/WasmAdapter.js";
import {
  balanceIdentity, booksSentence, cashIdentity, workingCapitalSummary,
} from "../src/case/plantBooks.js";

const row = (key: string, values: number[], subtotal = false) =>
  ({ key, label: key, help: `the ${key}`, subtotal, values });

//  Years -1, 0, 1: capital 100 in year -1 (paid in by the owners), working
//  capital at year 0 (stock 20, payables 5: net 15), profit 10 in year 1.
const payload = () => ({
  basis: "project",
  years: [-1, 0, 1],
  incomeStatement: [row("profitAfterTax", [0, 0, 10], true)],
  balanceSheet: [
    row("netFixedAssets", [100, 100, 90], true),
    row("rawMaterialStock", [0, 20, 20]),
    row("receivables", [0, 0, 0]),
    row("payables", [0, 5, 5]),
    row("cash", [0, 0, 20]),
    row("totalAssets", [100, 120, 130], true),
    row("totalLiabilities", [0, 5, 5], true),
    row("totalEquity", [100, 115, 125], true),
  ],
  cashFlowStatement: [row("closingCash", [0, 0, 20], true)],
  checks: {
    balanceError: 0, cashTieError: 0, incomeTieError: 0, retainedEarningsError: 0,
    ownersError: 0, worstError: 0, worstIdentity: "", worstYear: 0, closingCash: 20,
    shareCapitalPaidIn: 115, cashOverdrawn: false,
  },
});

describe("plant books in the report", () => {
  it("keeps the rows the engine wrote, years across", () => {
    const b = shapeBooks(payload())?.books;
    expect(b).toBeTruthy();
    expect(b!.years).toEqual([-1, 0, 1]);
    expect(b!.balanceSheet.map((r) => r.key)).toContain("totalAssets");
    expect(b!.balanceSheet[0]?.help).toBe("the netFixedAssets");
  });

  it("drops a row that is not one finite number per year, never draws it at zero", () => {
    const p = payload();
    p.balanceSheet.push(row("bad", [1, 2]));
    p.balanceSheet.push(row("nan", [1, NaN, 3]));
    const keys = shapeBooks(p)!.books!.balanceSheet.map((r) => r.key);
    expect(keys).not.toContain("bad");
    expect(keys).not.toContain("nan");
  });

  it("returns nothing for an older payload with no books", () => {
    expect(shapeBooks(undefined)).toEqual({});
    expect(shapeBooks({ years: [] })).toEqual({});
  });

  it("re-checks in the browser that assets = liabilities + equity, every year", () => {
    const b = shapeBooks(payload())!.books!;
    expect(balanceIdentity(b)!.worst).toBeLessThan(1e-12);
    expect(cashIdentity(b)).toBe(0);
    expect(booksSentence(b)).toMatch(/Assets equal liabilities plus equity in every year/);
  });

  it("says plainly when the balance sheet does not balance, naming the year", () => {
    const p = payload();
    p.balanceSheet.find((r) => r.key === "totalAssets")!.values[2] = 131;
    const b = shapeBooks(p)!.books!;
    const id = balanceIdentity(b)!;
    expect(id.worst).toBeGreaterThan(1e-3);
    expect(id.year).toBe(1);
    expect(booksSentence(b)).toMatch(/does NOT balance.*year 1.*an account is missing/);
  });

  it("summarises the working capital from the lines and nets it", () => {
    const wc = workingCapitalSummary(shapeBooks(payload())!.books!)!;
    expect(wc.year).toBe(0);
    expect(wc.net).toBe(15);
    expect(wc.lines.map((l) => l.sign)).toEqual([1, -1]);
  });

  it("flags negative cash in the sentence", () => {
    const p = payload();
    p.checks.cashOverdrawn = true;
    expect(booksSentence(shapeBooks(p)!.books!)).toMatch(/Cash is negative/);
  });

  it("the Economic appraisal report draws the three statements and labels the tornado", () => {
    const rw = readFileSync(new URL("../src/ui/ReportsWorkspace.tsx", import.meta.url), "utf8");
    expect(rw).toContain("<PlantBooksTables books={econ.books}");
    expect(rw).toContain("Tornado chart of the NPV");
    const tb = readFileSync(new URL("../src/ui/PlantBooksTables.tsx", import.meta.url), "utf8");
    for (const id of ["income", "balance", "cash"]) expect(tb).toContain(`id="${id}"`);
    expect(tb).toContain("books-workingCapital");
  });
});
