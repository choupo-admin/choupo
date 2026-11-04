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
  plantRun.test -- "What a plant costs to run, and when it pays"
  (commission C212, item B).

  Every number is recomputed by arithmetic written out here (hand-worked
  literals for a small plant whose lines can be added up on paper), and every
  engine statement the page prints is held to the engine source it cites:
  the file must contain the quoted text AT the line the page gives.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  ENGINE_ABSENCES, ENGINE_FACTS, RANGES, actualised, annuityFactor, apparentConsumption,
  breakEvenOf, cashFlowOf, cifOf, classSchedule, compareDepreciation, composedRate,
  converted, crewOf, enginePositions, groupsOf, itemise, nominalRate, npvOf,
  paybackOf, plantStart, sensitivityOf, turton, unitMargin, irrOf, type RunPlant,
} from "../src/ui/methods/plantRunMath.js";
import { PLANT_RUN_QUIZ } from "../src/ui/methods/plantRunLesson.js";
import { PlantRunTool } from "../src/ui/methods/PlantRunTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

/** A small plant whose lines add up on paper (all money in million EUR). */
function small(over: Partial<RunPlant> = {}): RunPlant {
  return {
    ...plantStart(),
    capacity: 10, load: 1, price: 2,
    rawMaterial: 8, catalystSolvent: 0, utilities: 2,
    operatorsPerShift: 1, shiftsPerDay: 1, daysPerYear: 245, hoursPerShift: 8,
    hoursPerOperatorYear: 1960, wage: 50,
    fci: 10, workingCapital: 1, salvage: 0, life: 10, deprLife: 10,
    supervision: 0.1, maintenance: 0.05, supplies: 0.1, laboratory: 0,
    overhead: 0.5, taxes: 0.02, insurance: 0.01, royalty: 0,
    admin: 0, selling: 0.1, research: 0.05, rent: 0, financing: 0,
    tax: 0.5, rate: 0.1,
    ...over,
  };
}

describe("the engine statements are held to the engine source at the line the page gives", () => {
  for (const [id, g] of Object.entries(ENGINE_FACTS)) {
    it(`${id}: ${g.file}:${g.line}`, () => {
      expect(existsSync(new URL(g.file, REPO)), g.file).toBe(true);
      const lines = read(g.file).split("\n");
      expect(lines[g.line - 1] ?? "", `line ${g.line}`).toContain(g.needle);
    });
  }
  it("the absences are stated for the two things the engine lacks (the break-even and the royalty are now facts, held to their lines above)", () => {
    expect(ENGINE_ABSENCES.map((a) => a.id).sort()).toEqual(["classes", "itemised"]);
    const src = read("src/postProcessing/EconomicsPass.cpp");
    // no function or key for an asset class (a break-even and a royalty exist since 2026-11-04)
    expect(src).not.toMatch(/assetClass/);
  });
});

describe("the factors carry a pointer to the book and no range", () => {
  it("no range is shipped: a range recalled and not checked would be falsely sourced", () => {
    for (const r of RANGES) {
      expect(r.lo, r.key).toBeNull(); expect(r.hi, r.key).toBeNull();
      expect(r.source, r.key).toMatch(/declare/);
      expect(r.source, r.key).not.toMatch(/\d+\s*(-|to)\s*\d+\s*%/);
    }
  });
  it("the factors a book tabulates point to it by edition and chapter", () => {
    const pointed = RANGES.filter((r) => r.source.includes("Peters, Timmerhaus & West (2003)"));
    expect(pointed.map((r) => r.key).sort()).toEqual(["admin", "insurance", "laboratory", "maintenance",
      "overhead", "research", "selling", "supervision", "supplies", "taxes"]);
  });
});

describe("labour by shifts", () => {
  it("three shifts of 8 h on 330 days, 6 on duty, 1960 h paid: 7920 h, 4.0408 per post, 25 hired", () => {
    const c = crewOf(plantStart());
    expect(c.postHours).toBe(3 * 8 * 330);
    near(c.perPost, 7920 / 1960);
    expect(c.hired).toBe(25);                     // ceil(6 x 4.0408 = 24.24)
    near(c.cost, 25 * 28 * 1960 / 1e6);           // 1.372 M EUR
  });
  it("one shift of 8 h on 245 days, 1960 h paid: exactly one person per post", () => {
    const c = crewOf(small());
    expect(c.perPost).toBe(1);
    expect(c.hired).toBe(1);
    near(c.cost, 0.098);
  });
  it("one shift on 330 days needs 8 x 330/1960 = 1.347 per post: 6 on duty -> 9", () => {
    expect(crewOf({ ...plantStart(), shiftsPerDay: 1 }).hired).toBe(9);
  });
  it("round the clock is 8760/1960 = 4.469 per post, and the engine's factor is 4.5", () => {
    near(crewOf(plantStart()).roundTheClock, 8760 / 1960);
    expect(enginePositions(6)).toBe(27);
  });
});

describe("the cost of production, itemised (hand-worked small plant)", () => {
  const c = itemise(small());
  it("the direct lines", () => {
    near(c.labour, 0.098); near(c.supervision, 0.0098); near(c.maintenance, 0.5);
    near(c.supplies, 0.05); near(c.rawMaterial, 8); near(c.utilities, 2);
    near(c.directTotal, 10.6578);
  });
  it("overhead is 50 % of labour + supervision + maintenance", () => { near(c.overhead, 0.3039); });
  it("fixed lines: depreciation 1, taxes 0.2, insurance 0.1", () => {
    near(c.depreciation, 1); near(c.taxes, 0.2); near(c.insurance, 0.1); near(c.fixedTotal, 1.3);
  });
  it("selling and research are fractions of the cost itself: T = A/(1 - 0.15), A = 12.2617", () => {
    near(c.manufacturing, 10.6578 + 0.3039 + 1.3);
    near(c.total, 14.42552941176471);
    near(c.selling, 1.442552941176471); near(c.research, 0.7212764705882355);
    near(c.cash, 13.42552941176471);
    near(c.selling / c.total, 0.1); near(c.research / c.total, 0.05);
  });
  it("financing and rent add to the total, and rent is a fixed line", () => {
    near(itemise(small({ financing: 0.7 })).total, 14.42552941176471 + 0.7);
    const r = itemise(small({ rent: 0.3 }));
    near(r.fixedTotal, 1.6);
  });
  it("a royalty is a rate on sales and follows the quantity", () => {
    const r1 = itemise(small({ royalty: 0.03 }), 1), r5 = itemise(small({ royalty: 0.03 }), 0.5);
    near(r1.royalty, 0.03 * 20); near(r5.royalty, 0.03 * 10);
  });
});

describe("Choupo's three terms on the same bills", () => {
  it("COM_d = 0.180 I + 2.73 C_OL + 1.23 (C_RM + C_UT), with C_WT = 0", () => {
    const t = turton(small());
    near(t.termFci, 1.8); near(t.termLabour, 2.73 * 0.098); near(t.termVariable, 12.3);
    near(t.comD, 14.36754);
    expect(t.cWT).toBe(0);
  });
  it("the catalyst and solvent bill is part of C_RM", () => {
    near(turton(small({ catalystSolvent: 1 })).cRM, 9);
  });
  it("the four regrouped lines add up to the itemised cash cost", () => {
    const g = groupsOf(small());
    near(g.fciRelated + g.labourRelated + g.variable + g.sellingResearch, itemise(small()).cash);
    const d = groupsOf(plantStart());
    near(d.fciRelated + d.labourRelated + d.variable + d.sellingResearch, itemise(plantStart()).cash);
  });
  it("hand values of the groups on the small plant", () => {
    const g = groupsOf(small());
    near(g.variable, 10);
    near(g.fciRelated, 0.5 + 0.05 + 0.2 + 0.1 + 0.5 * 0.5);          // 1.1 with overhead on maintenance
    near(g.labourRelated, 0.098 + 0.0098 + 0.5 * (0.098 + 0.0098));
    near(g.sellingResearch, 1.442552941176471 + 0.7212764705882355);
  });
});

describe("depreciation by asset class", () => {
  const cs = [
    { name: "A", cost: 6, life: 3, residual: 0 },
    { name: "B", cost: 4, life: 10, residual: 0.5 },
  ];
  it("schedule: 2 + 0.2 for three years, then 0.2 to year 10, then nothing", () => {
    const s = classSchedule(cs, 12);
    near(s[0]!, 2.2); near(s[2]!, 2.2); near(s[3]!, 0.2); near(s[9]!, 0.2); expect(s[10]).toBe(0);
  });
  it("present value of the shield at t = 0.5, i = 10 %: 3.1013 by class, 3.7908 by one 5-year line", () => {
    const r = compareDepreciation(cs, 5, 0.5, 0.1, 25);
    near(r.pvShieldClass, 3.1013087015546903, 1e-9);
    near(r.pvShieldSingle, 0.5 * 2 * annuityFactor(0.1, 5));
    near(r.pvShieldSingle, 3.7907867694084474, 1e-9);
    near(r.total, 10); near(r.bookClass, 2); near(r.bookSingle, 0);
  });
  it("when the lives and residuals coincide the two ways are the same", () => {
    const r = compareDepreciation([{ name: "X", cost: 30, life: 3, residual: 0 }], 3, 0.3, 0.08, 10);
    near(r.pvShieldClass, r.pvShieldSingle);
  });
});

describe("the cash flow, NPV, IRR and payback", () => {
  it("year j: (S - K - d)(1 - t) + d, with W and the taxed salvage back in the last year", () => {
    const p = small({ salvage: 0.1 });
    const r = cashFlowOf(p);
    const c = itemise(p);
    const C = (c.sales - c.cash - 1) * 0.5 + 1;
    near(r.cf[0]!, -(10 + 1));
    near(r.cf[1]!, C);
    near(r.cf[10]!, C + 1 + 0.1 * 10 * 0.5);
  });
  it("with the whole plant depreciated over the life the NPV is the annuity formula", () => {
    const p = small();
    const c = itemise(p);
    const C = (c.sales - c.cash - 1) * 0.5 + 1;
    const a = (1 - Math.pow(1.1, -10)) / 0.1;
    near(cashFlowOf(p).npv, -11 + C * a + 1 / Math.pow(1.1, 10));
  });
  it("the IRR is a root of the NPV", () => {
    const r = cashFlowOf(small());
    expect(r.irr).not.toBeNull();
    near(npvOf(r.cf, r.irr!), 0, 1e-7);
    expect(irrOf([-100, 60, 60])).not.toBeNull();
  });
  it("payback: [-100, 50, 50, 50] is 2.0 years simple and 2.352 discounted at 10 %", () => {
    near(paybackOf([-100, 50, 50, 50], 0)!, 2);
    near(paybackOf([-100, 50, 50, 50], 0.1)!, 2 + 13.223140495867769 / 37.565740045078884, 1e-9);
    expect(paybackOf([-100, 10, 10], 0)).toBeNull();
  });
  it("the Choupo cost route uses COM_d in place of the itemised cash cost", () => {
    const r = cashFlowOf(small(), "turton");
    near(r.cash, 14.36754);
  });
  it("the discount rate: (1.03)(1.06) - 1 = 9.18 %; with 2 % inflation (1.0918)(1.02) - 1", () => {
    near(composedRate(0.03, 0.06), 0.0918);
    near(nominalRate(0.0918, 0.02), 1.0918 * 1.02 - 1);
  });
});

describe("the break-even capacity", () => {
  // all factors zero: fixed = labour 0.098 + depreciation 1 = 1.098; variable 8 + 2 = 10; sales 20
  const z = small({ supervision: 0, maintenance: 0, supplies: 0, overhead: 0, taxes: 0, insurance: 0,
    selling: 0, research: 0, utilities: 0, workingCapital: 0 });
  it("accounting: 1.098 / (20 - 8) = 9.15 %", () => {
    const b = breakEvenOf(z);
    near(b.fixed, 1.098); near(b.variableFull, 8); near(b.salesFull, 20);
    near(b.accounting!, 1.098 / 12);
    near(b.cash!, 0.098 / 12);
  });
  it("the NPV break-even put back into the cash flow returns zero, on every route", () => {
    for (const route of ["itemised", "turton"] as const) {
      const b = breakEvenOf(plantStart(), route);
      expect(b.npv, route).not.toBeNull();
      near(cashFlowOf({ ...plantStart(), load: b.npv! }, route).npv, 0, 1e-9);
    }
  });
  it("the accounting break-even puts sales equal to the total cost", () => {
    const p = plantStart();
    const b = breakEvenOf(p);
    const c = itemise(p, b.accounting!);
    near(c.sales, c.total, 1e-9);
  });
  it("the NPV break-even is above the accounting one when capital must also be repaid", () => {
    const b = breakEvenOf(plantStart());
    expect(b.npv!).toBeGreaterThan(b.cash!);
  });
});

describe("the sensitivity and the elasticity", () => {
  const p = plantStart();
  const rows = sensitivityOf(p, 0.1);
  const base = cashFlowOf(p).npv;
  it("the price moves the NPV by 2 delta S (1 - t) a: sales enter every operating year after tax", () => {
    const r = rows.find((x) => x.key === "price")!;
    const S = p.price * p.capacity * p.load;
    // royalty is zero and the selling cost does not depend on the price
    near(r.npvHigh - r.npvLow, 2 * 0.1 * S * (1 - p.tax) * annuityFactor(p.rate, p.life), 1e-9);
    near(r.elasticity!, ((r.npvHigh - r.npvLow) / base) / 0.2, 1e-12);
  });
  it("sorted by the length of the bar, longest first", () => {
    for (let k = 1; k < rows.length; k++)
      expect(Math.abs(rows[k - 1]!.npvHigh - rows[k - 1]!.npvLow))
        .toBeGreaterThanOrEqual(Math.abs(rows[k]!.npvHigh - rows[k]!.npvLow) - 1e-12);
  });
  it("cost inputs carry their share of the cash cost and the flag at 10 %", () => {
    const rm = rows.find((x) => x.key === "rawMaterial")!;
    const c = itemise(p);
    near(rm.costShare!, c.rawMaterial / c.cash);
    expect(rm.above10).toBe(true);
    expect(rows.find((x) => x.key === "catalystSolvent")!.above10).toBe(false);
    expect(rows.find((x) => x.key === "price")!.costShare).toBeNull();
  });
  it("a zero base NPV leaves the elasticity undefined, not infinite", () => {
    const q = { ...p, load: breakEvenOf(p).npv! };
    expect(sensitivityOf(q, 0.1).every((r) => r.elasticity === null)).toBe(true);
  });
});

describe("the market arithmetic", () => {
  it("price index: 10 x 500/400 = 12.5", () => { near(actualised(10, 500, 400), 12.5); });
  it("currency: 100 x 1.1 = 110", () => { near(converted(100, 1.1), 110); });
  it("apparent consumption = 120 + 80 - 30 = 170", () => { expect(apparentConsumption(120, 80, 30)).toBe(170); });
  it("CIF = 1000 x (1 + 0.08 + 0.01) = 1090", () => { near(cifOf(1000, 0.08, 0.01), 1090); });
  it("unit margin: 2.7 - 1.9 = 0.8, 29.6 % of the price", () => {
    const m = unitMargin(2.7, 1.9);
    near(m.margin, 0.8); near(m.fraction, 0.8 / 2.7);
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(PlantRunTool)));
  it("draws every section, the two tables of step 1 and the charts", () => {
    for (const k of ["data-section=\"cost\"", "data-section=\"labour\"", "data-section=\"depreciation\"",
      "data-section=\"breakeven\"", "data-section=\"cashflow\"", "data-section=\"sensitivity\"",
      "data-section=\"market\"", "data-itemised", "data-turton", "data-chart=\"break-even\"",
      "data-chart=\"tornado\"", "data-illustrations"]) expect(html, k).toContain(k);
  });
  it("prints the default numbers computed here", () => {
    const p = plantStart();
    expect(html).toContain(`<b>${crewOf(p).hired}</b>`);
    expect(html).toContain(turton(p).comD.toFixed(2));
    expect(html).toContain(itemise(p).cash.toFixed(2));
    expect(html).toContain(cashFlowOf(p).npv.toFixed(2));
  });
  it("cites each engine line it relies on", () => {
    for (const g of Object.values(ENGINE_FACTS)) expect(html).toContain(`${g.file}:${g.line}`);
  });
  //  No competitor-name test here: check_doctrine holds the ban repo-wide,
  //  and a test that spells the names is itself a site it refuses.
});

describe("the registry and the guide", () => {
  it("lists the tool as a live notes page on the economics chapter", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "plant-running-cost")!;
    expect(t.status).toBe("live"); expect(t.kind).toBe("notes"); expect(t.theory).toBe("ch:economics");
    expect(t.discipline).toBe("Process design & economics");
    expect(t.origins).toEqual(["page", "reference", "assumption"]);
  });
  it("the Theory Guide chapter and the Tutorials Guide section exist", () => {
    expect(read("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-plant-running-cost}");
    expect(g).toContain("tool=plant-running-cost");
  });
  it("the quiz answer to the crew question is the number the page computes", () => {
    const q = PLANT_RUN_QUIZ.find((x) => x.id === "crew-hired")!;
    expect(q.options[q.correct]).toContain(String(crewOf(plantStart()).hired));
  });
});
