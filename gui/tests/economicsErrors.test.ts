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
  economicsErrors.test -- "Ways a pharmaceutical-plant economics goes wrong"
  (commission C210, E7).

  Every number is recomputed here by plain arithmetic written out in the
  test, and every GUARD sentence the page prints is held to the engine
  source it cites: the file must exist and contain the quoted text, and a
  named gate must be a file of bin/curate.  A guard the engine stopped
  having makes this test fail, rather than the page go on claiming it.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  GUARDS, UNITS, annuityFactor, annualCashFlow, buildingCost, eurPerKwhToEurPerGJ,
  irrOf, npvBreakEvenN, npvOf, plantDefaults, plantNpv, profitBreakEvenN,
  rateAndIrr, royalty, soldQuantity, spreadOf, taxBase, twoRevenues,
  utilityBill, wcDefaults, workingCapitals, type ClassId,
} from "../src/ui/methods/economicsErrorsMath.js";
import {
  ECON_ERRORS_LIMITS, ECON_ERRORS_STEPS,
} from "../src/ui/methods/economicsErrorsLesson.js";
import { EconomicsErrorsTool } from "../src/ui/methods/EconomicsErrorsTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

const CLASSES: ClassId[] = ["sold", "twoRevenues", "taxBase", "royalty",
  "workingCapital", "discountRate", "units", "unitCost"];

describe("the guards are held to the engine source they cite", () => {
  it("all eight classes carry at least one guard", () => {
    expect(Object.keys(GUARDS).sort()).toEqual([...CLASSES].sort());
    for (const c of CLASSES) expect(GUARDS[c].length, c).toBeGreaterThan(0);
  });
  it("every guard that names a file finds its text there, and every named gate exists", () => {
    let checked = 0;
    for (const c of CLASSES) for (const g of GUARDS[c]) {
      if (g.kind === "none") {
        expect(g.file, `${c}: a none-guard cites no file`).toBe("");
        expect(g.says, c).toMatch(/does not catch|has no royalty|Nothing refuses/);
        continue;
      }
      expect(g.file, `${c}: ${g.kind}`).not.toBe("");
      expect(existsSync(new URL(g.file, REPO)), g.file).toBe(true);
      expect(read(g.file), `${c}: "${g.needle}" in ${g.file}`).toContain(g.needle);
      checked++;
      if (g.gate) expect(existsSync(new URL(`bin/curate/${g.gate}.py`, REPO)), g.gate).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
  it("the classes Choupo does not catch say so (the royalty window against a patent; a hand break-even)", () => {
    // since 2026-11-04 the engine refuses a royalty with no declared window (a guard), and still
    // cannot check the window against a patent: the none-guard says so
    expect(GUARDS.royalty.some((g) => g.kind === "refuses")).toBe(true);
    expect(GUARDS.royalty.some((g) => g.kind === "none" && /royalty/.test(g.says))).toBe(true);
    expect(GUARDS.twoRevenues.some((g) => g.kind === "none" && /break-even/.test(g.says))).toBe(true);
    expect(/royaltyAt/.test(read("src/postProcessing/EconomicsPass.cpp"))).toBe(true);
  });
});

describe("class 1: the sold quantity", () => {
  const base = { productionM: 14, marketM: 8, share: 0.25, factor: 6, price: 3, scaleSlip: 1 };
  it("right = min(Q, D s); wrong = D s factor; the fill factor is Q / (D s)", () => {
    const r = soldQuantity(base);
    near(r.right, 2); near(r.wrong, 12); near(r.fillFactor, 7);
    near(r.wrongOverProduction, 12 / 14);
    near(r.revenueRightMEUR, 6); near(r.revenueWrongMEUR, 36);
  });
  it("a thousands/millions slip makes the wrong quantity impossible (above Q)", () => {
    const r = soldQuantity({ ...base, scaleSlip: 1000 });
    near(r.wrong, 12000); expect(r.wrongOverProduction).toBeGreaterThan(1);
  });
  it("a market bigger than the plant is capped at the plant", () => {
    near(soldQuantity({ ...base, marketM: 100, factor: 1 }).right, 14);
  });
});

describe("classes 2 and 3: one plant", () => {
  const e = plantDefaults();
  const a = (1 - Math.pow(1.1, -10)) / 0.1;
  it("the annuity factor and the defaults' cash flow and NPV by hand", () => {
    near(annuityFactor(0.1, 10), a);
    // d = 30/10 = 3; taxable = (3 - 1.1) 10 - 6 - 3 = 10; C = 10 (0.79) + 3
    near(annualCashFlow(e, 10, 3), 10.9);
    near(plantNpv(e, 10, 3), -30 + 10.9 * a);
  });
  it("the NPV break-even puts back to zero; the accounting one is (F + d) / (p - v)", () => {
    const nStar = npvBreakEvenN(e, 3);
    near(plantNpv(e, nStar, 3), 0, 1e-9);
    near(nStar, (((30 / a - 3) / 0.79) + 6 + 3) / 1.9);
    near(profitBreakEvenN(e, 3), 9 / 1.9);
  });
  it("a break-even from another price does not return zero at the NPV's price", () => {
    const t = twoRevenues(e, 2.0);
    near(t.npvAtConsistent, 0, 1e-9);
    expect(Math.abs(t.npvAtWrong)).toBeGreaterThan(1);
    near(t.revenueNpv, 30); near(t.revenueBreakEven, 20);
  });
  it("tax on sales vs on taxable income, by hand", () => {
    const t = taxBase(e);
    near(t.sales, 30); near(t.costOfManufacture, 17); near(t.depreciation, 3);
    near(t.taxableIncome, 10);
    near(t.taxWrong, 6.3); near(t.taxRight, 2.1);
    near(t.cashFlowWrong, 30 - 17 - 6.3); near(t.cashFlowRight, 30 - 17 - 2.1);
    // the right cash flow is the one annualCashFlow computes by the other route
    near(t.cashFlowRight, annualCashFlow(e, e.N, e.p));
    near(t.npvRight, plantNpv(e, e.N, e.p));
    expect(t.npvWrong).toBeLessThan(t.npvRight);
  });
});

describe("class 4: the royalty window", () => {
  it("an expired patent owes nothing; a window charges only its years", () => {
    const a = (1 - Math.pow(1.1, -10)) / 0.1;
    const r0 = royalty({ rate: 0.08, sales: 30, window: 0, L: 10, i: 0.1 });
    near(r0.pvRight, 0); near(r0.pvWrong, 2.4 * a);
    const r3 = royalty({ rate: 0.08, sales: 30, window: 3, L: 10, i: 0.1 });
    near(r3.pvRight, 2.4 * (1 - Math.pow(1.1, -3)) / 0.1);
    expect(r3.rightPerYear.filter((x) => x > 0).length).toBe(3);
    expect(r3.wrongPerYear.every((x) => Math.abs(x - 2.4) < 1e-12)).toBe(true);
  });
});

describe("class 5: three working capitals", () => {
  it("each method by hand, and the spread is largest over smallest", () => {
    const w = wcDefaults();
    const r = workingCapitals(w);
    near(r.a, 0.15 * 18); near(r.b, 0.25 * 80);
    const stock = 20 * 120 / 365, rec = 80 * 90 / 365, cash = 35 * 30 / 365, pay = 20 * 30 / 365;
    near(r.c, stock + rec + cash - pay);
    near(r.spread, Math.max(r.a, r.b, r.c) / Math.min(r.a, r.b, r.c));
    near(r.npvCost.a, 2.7 * (1 - Math.pow(1.1, -10)));
    // on the page's default plant the three methods differ by more than ten
    expect(r.spread).toBeGreaterThan(10);
  });
  it("it can differ by more than an order of magnitude (a high-revenue plant)", () => {
    const r = workingCapitals({ ...wcDefaults(), fci: 5, sales: 100, com: 40, rawMaterials: 30 });
    expect(r.spread).toBeGreaterThan(10);
  });
});

describe("class 6: the discount rate and the IRR", () => {
  it("the IRR zeroes the NPV and does not depend on the rate chosen", () => {
    const cf = [-30, ...Array(10).fill(6)];
    const irr = irrOf(cf)!;
    near(npvOf(cf, irr), 0, 1e-7);
    const a = rateAndIrr({ I: 30, cf: 6, L: 10, i: 0.1, scale: 1 });
    const b = rateAndIrr({ I: 30, cf: 6, L: 10, i: 0.8, scale: 1 });
    near(a.irr!, b.irr!); near(a.irr!, irr);
    expect(b.npvAtChosen).toBeLessThan(a.npvAtChosen);
  });
  it("a 40-80 % rate flips a sound long project to a negative NPV", () => {
    const r = rateAndIrr({ I: 30, cf: 6, L: 10, i: 0.6, scale: 1 });
    expect(r.npvAtChosen).toBeLessThan(0);
    expect(r.irr!).toBeGreaterThan(0.1); expect(r.irr!).toBeLessThan(0.3);
  });
  it("a scale error produces an IRR of more than 100 % whatever the rate", () => {
    const r = rateAndIrr({ I: 30, cf: 6, L: 10, i: 0.6, scale: 6 });
    expect(r.irrScaled!).toBeGreaterThan(1);
    // 36 per year against 30: the annuity at the IRR must be 30/36
    near(npvOf([-30, ...Array(10).fill(36)], r.irrScaled!), 0, 1e-6);
  });
  it("no root when every flow is negative", () => {
    expect(irrOf([-1, -1, -1])).toBeNull();
  });
});

describe("class 7: units", () => {
  it("10 800 GJ at 0.10 EUR/kWh: the number as written is 277.8 times too low", () => {
    const b = utilityBill(10800, "GJ", 0.10, "kWh");
    if (!b.ok) throw new Error("should convert");
    near(b.quantityInPriceUnit, 10800 * 1e9 / 3.6e6);   // 3 000 000 kWh
    near(b.right, 300000); near(b.wrong, 1080);
    near(b.ratio, 1 / (1e9 / 3.6e6));
  });
  it("litres priced per cubic metre are 1000 times off", () => {
    const b = utilityBill(5000, "L", 2, "m3");
    if (!b.ok) throw new Error("should convert");
    near(b.right, 5 * 2); near(b.ratio, 1000);
  });
  it("an energy cannot be priced per volume: refused", () => {
    const b = utilityBill(5, "kWh", 2, "m3");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toMatch(/energy.*volume/);
  });
  it("the engine's EUR/GJ slot: 0.10 EUR/kWh is 27.78 EUR/GJ (the shipped electricity record)", () => {
    near(eurPerKwhToEurPerGJ(0.10), 0.10 / 3.6e-3);
    expect(read("data/standards/utilities/electricity.dat")).toContain("cost        27.8;");
    expect(UNITS.length).toBe(5);
  });
});

describe("class 8: a declared unit cost", () => {
  it("is refused without a source or a reason, as the engine refuses a quote", () => {
    const r = buildingCost(1500, { perM2: 600, year: 2026, source: "", reason: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["source", "reason"]);
    const ok = buildingCost(1500, { perM2: 600, year: 2026, source: "s", reason: "r" });
    if (!ok.ok) throw new Error("should pass");
    near(ok.totalMEUR, 0.9);
  });
  it("the spread between 200 and 1000 EUR/m2 is five", () => {
    near(spreadOf([200, 1000]), 5);
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(EconomicsErrorsTool)));
  it("draws all eight classes, each with a guard box and a wrong and a right side", () => {
    for (const c of CLASSES) {
      expect(html, c).toContain(`data-class="${c}"`);
      expect(html, c).toContain(`data-guard="${c}"`);
    }
    expect((html.match(/data-side="wrong"/g) ?? []).length).toBe(8);
    expect((html.match(/data-side="right"/g) ?? []).length).toBe(8);
  });
  it("says plainly where Choupo does not catch the mistake", () => {
    expect(html).toContain("does NOT catch this");
    expect(html).toContain("Choupo does not catch a royalty");
  });
  it("prints the default numbers computed here", () => {
    expect(html).toContain("data-sold-wrong");
    expect(html).toContain("data-wc-spread");
    expect(html).toContain("data-illustrations");
  });
  it("names no product, group or report", () => {
    const text = [html, JSON.stringify(ECON_ERRORS_STEPS), JSON.stringify(ECON_ERRORS_LIMITS)].join(" ");
    expect(text).not.toMatch(/apalutamide|donepezil|PIF|Keytruda|Metex|Perjeta/i);
  });
});

describe("the registry", () => {
  it("lists the tool as a live notes page on the economics chapter", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "economics-errors")!;
    expect(t.status).toBe("live"); expect(t.kind).toBe("notes"); expect(t.theory).toBe("ch:economics");
    expect(t.discipline).toBe("Process design & economics");
  });
  it("the Theory Guide chapter it links to and the Tutorials Guide section exist", () => {
    expect(read("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-economics-errors}");
    expect(g).toContain("tool=economics-errors");
  });
});
