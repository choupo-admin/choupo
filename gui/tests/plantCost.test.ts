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
  plantCost.test -- "What a plant costs to build" (DEV.md 4c C212 A).

  Every number is recomputed by hand arithmetic written out in the test, and
  every engine claim the page prints is held to the source LINE it cites: the
  line must contain the quoted text, so a line that moves fails the test
  instead of the page going on citing it.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  DIRECT_ROWS, ENGINE_SOURCES, EXAMPLES, INDIRECT_ROWS, LANG_FACTORS,
  bareModule, directDefaults, factored, fciFractionFromTciShare, indirectDefaults,
  langFci, loanDefaults, loanSchedule, outsideRange, threeRoutes, wcDefaults,
  workingCapitals,
} from "../src/ui/methods/plantCostMath.js";
import {
  PLANT_COST_LIMITS, PLANT_COST_QUIZ, PLANT_COST_STEPS,
} from "../src/ui/methods/plantCostLesson.js";
import { PlantCostTool } from "../src/ui/methods/PlantCostTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("every engine claim is held to the line it cites", () => {
  it("each cited line contains the quoted text", () => {
    for (const s of ENGINE_SOURCES) {
      expect(existsSync(new URL(s.file, REPO)), s.file).toBe(true);
      const lines = read(s.file).split("\n");
      expect(lines[s.line - 1] ?? "", `${s.file}:${s.line} (${s.says})`).toContain(s.needle);
    }
    expect(ENGINE_SOURCES.length).toBeGreaterThanOrEqual(12);
  });
  it("the lesson text cites the same lines (the numbers in the prose are not a second home)", () => {
    const text = JSON.stringify(PLANT_COST_STEPS);
    for (const cite of ["2696-2697", "2690", "2553", "69", "722", "240", "216", "2505", "548", "1640", "1652", "1673"])
      expect(text, cite).toContain(cite);
  });
  it("the engine's constants are the ones the page defaults to", () => {
    const eng = read("src/postProcessing/EconomicsPass.cpp");
    expect(eng).toContain("\"langFactor\", 3.63");
    expect(LANG_FACTORS.solidsFluids).toBe(3.63);
    expect(read("src/postProcessing/costing/CostingModel.H")).toContain("contingencyAndFee = 1.18");
  });
});

describe("step 2: Lang", () => {
  it("his three factors, and F = K x C_Be by hand", () => {
    expect(LANG_FACTORS).toEqual({ solids: 3.10, solidsFluids: 3.63, fluids: 4.74 });
    near(langFci(3.0, "solids"), 9.3);          // 3.10 x 3.0
    near(langFci(3.0, "fluids"), 14.22);        // 4.74 x 3.0
  });
  it("cites Lang's two original papers", () => {
    const t = JSON.stringify(PLANT_COST_STEPS);
    expect(t).toContain("Chem. Eng. 54(10) 117 (1947)");
    expect(t).toContain("55(6) 112 (1948)");
  });
});

describe("step 3: the factored estimate", () => {
  const cbe = EXAMPLES.tablets.items.reduce((s, x) => s + x.cp, 0);
  it("the tablet list sums to 4.25 M EUR", () => near(cbe, 0.6 + 0.8 + 0.25 + 0.9 + 0.5 + 1.2));
  it("D, I and F by hand on the defaults", () => {
    // sum f = .40+.30+.12+.10+.20+.10+.05+.40+.03 = 1.70 ; sum g = .15+.10+.05+.10 = .40
    const r = factored(cbe, directDefaults(), indirectDefaults());
    near(r.direct, 4.25 * 2.70);                // 11.475
    near(r.indirect, 11.475 * 0.40);            // 4.59
    near(r.fci, 11.475 * 1.40);                 // 16.065
    near(r.impliedLang, 16.065 / 4.25);
    near(r.directItems.piping, 4.25 * 0.30);
  });
  it("a zero-fraction estimate is the equipment alone", () => {
    const z = { installation: 0, piping: 0, instrumentation: 0, electrical: 0, buildings: 0,
      yard: 0, land: 0, services: 0, insulation: 0 };
    const g = { engineering: 0, construction: 0, fee: 0, contingency: 0 };
    near(factored(cbe, z, g).fci, cbe);
  });
  it("NO range is shipped: every row is a pointer without a number, or says 'declare'", () => {
    for (const r of DIRECT_ROWS) {
      expect(r.range, r.key).toBeNull();
      expect(r.source, r.key).toMatch(/declare/);
      expect(r.source, r.key).not.toMatch(/[0-9]\.[0-9]|%/);
    }
    const ptw = DIRECT_ROWS.find((r) => r.key === "installation")!;
    expect(ptw.source).toMatch(/Peters, Timmerhaus & West.*ch\. 6/);
    for (const r of INDIRECT_ROWS) {
      expect(r.range, r.key).toBeNull();
      expect(r.source, r.key).toMatch(/declare/);
    }
  });
  it("outsideRange says below / inside / above, and nothing for no range", () => {
    expect(outsideRange(0.2, { lo: 0.3, hi: 0.5 })).toBe("below");
    expect(outsideRange(0.4, { lo: 0.3, hi: 0.5 })).toBe("inside");
    expect(outsideRange(0.9, { lo: 0.3, hi: 0.5 })).toBe("above");
    expect(outsideRange(0.9, null)).toBe("none");
  });
});

describe("step 4: three numbers for one list", () => {
  it("the tablet list: Lang, factored and bare-module by hand, and their spread", () => {
    const items = EXAMPLES.tablets.items;
    const cbm = 0.6 * 3.2 + 0.8 * 3.6 + 0.25 * 3.0 + 0.9 * 2.8 + 0.5 * 3.2 + 1.2 * 2.6;
    near(cbm, 12.79);
    const bm = bareModule(items);
    near(bm.sumCbm, 12.79);
    near(bm.ctm, 1.18 * 12.79);                 // 15.0922
    near(bm.fci, 1.68 * 12.79);                 // 21.4872
    const lang = langFci(4.25, EXAMPLES.tablets.type);
    near(lang, 13.175);
    const fac = factored(4.25, directDefaults(), indirectDefaults()).fci;
    const t = threeRoutes(lang, fac, bm.fci);
    near(t.min, 13.175); near(t.max, 21.4872);
    near(t.spread, 21.4872 / 13.175);
    expect(t.spread).toBeGreaterThan(1.5);      // the spread is the lesson
  });
  it("the fluid list sums to 1.67 M EUR purchased and uses K = 4.74", () => {
    near(EXAMPLES.fluids.items.reduce((s, x) => s + x.cp, 0), 1.67);
    expect(EXAMPLES.fluids.type).toBe("fluids");
    expect(EXAMPLES.tablets.type).toBe("solids");
  });
  it("the engine multipliers can be declared", () => {
    near(bareModule(EXAMPLES.tablets.items, 1.0, 0.0).fci, 12.79);
  });
});

describe("step 5: working capital", () => {
  it("each method by hand on the defaults, and the spread", () => {
    const r = workingCapitals(wcDefaults());
    near(r.rawStock, 12 * 30 / 365); near(r.productStock, 20 * 30 / 365);
    near(r.receivables, 30 * 45 / 365); near(r.cash, 0); near(r.payables, 12 * 30 / 365);
    // raw stock and payables cancel at equal days: itemised = 600/365 + 1350/365
    near(r.itemised, (600 + 1350) / 365);
    near(r.ofSales, 3.0); near(r.ofFci, 6.0);
    near(r.spread, 6.0 / 3.0);
  });
  it("minimum cash adds K d / 365", () => {
    const a = workingCapitals({ ...wcDefaults(), daysCash: 15 });
    near(a.cash, 20 * 15 / 365);
    near(a.itemised - workingCapitals(wcDefaults()).itemised, 20 * 15 / 365);
  });
  it("a share x of the total capital is x/(1-x) of the fixed", () => {
    near(fciFractionFromTciShare(0.15), 0.15 / 0.85);
    near(fciFractionFromTciShare(0.5), 1.0);
  });
});

describe("step 6: the loan", () => {
  const L = loanDefaults();
  it("annuity: the draws, the capitalised interest, the schedule closes at zero", () => {
    const s = loanSchedule(L);
    // 40 x 0.5 / 2 = 10 drawn at the end of each of two construction years
    near(s.loanDrawn, 20);
    near(s.idc, 0.06 * 10);                     // interest on the first draw, in year 0
    near(s.atStartup, 20.6);
    near(s.equity, 20);
    expect(s.rows.length).toBe(2 + 1 + 6);
    near(s.rows[0]!.close, 10); near(s.rows[1]!.interestCapitalised, 0.6); near(s.rows[1]!.close, 20.6);
    // grace year: interest only
    near(s.rows[2]!.interestPaid, 0.06 * 20.6); near(s.rows[2]!.repayment, 0);
    // annuity A = P r / (1 - (1+r)^-n)
    const A = 20.6 * 0.06 / (1 - Math.pow(1.06, -6));
    near(s.rows[3]!.interestPaid + s.rows[3]!.repayment, A);
    near(s.rows[8]!.close, 0, 1e-9);
    near(s.rows.reduce((x, r) => x + r.repayment, 0), 20.6);
    near(s.interestPaidTotal, 0.06 * 20.6 + 6 * A - 20.6);
  });
  it("linear: equal principal, interest falls with the balance", () => {
    const s = loanSchedule({ ...L, repayment: "linear" });
    near(s.rows[3]!.repayment, 20.6 / 6);
    near(s.interestPaidTotal, 0.06 * 20.6 + 0.06 * 20.6 * 21 / 6);   // 5.562 in all
    near(s.rows[8]!.close, 0, 1e-9);
  });
  it("a one-year construction accrues no interest, as the engine says", () => {
    const s = loanSchedule({ ...L, constructionYears: 1 });
    near(s.idc, 0); expect(s.idcNote).toBe(true);
    near(s.atStartup, 20);
  });
  it("a zero rate repays the principal evenly", () => {
    const s = loanSchedule({ ...L, rate: 0 });
    near(s.interestPaidTotal, 0); near(s.rows[3]!.repayment, 20 / 6);
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(PlantCostTool)));
  it("draws every section and the numbers computed here", () => {
    for (const s of ["lang", "factored", "three", "workingCapital", "financing"])
      expect(html, s).toContain(`data-section="${s}"`);
    for (const r of ["lang", "factored", "bareModule"]) expect(html, r).toContain(`data-route="${r}"`);
    for (const m of ["itemised", "sales", "fci"]) expect(html, m).toContain(`data-wc="${m}"`);
    expect(html).toContain("data-spread");
    expect(html).toContain("data-wc-spread");
    expect(html).toContain("data-loan");
    expect(html).toContain("data-illustrations");
    expect(html).toMatch(/13\.1[78]/);   // Lang 13.175 M EUR
  });
  it("prints a pointer, never a range, beside each input", () => {
    expect(html).toContain("Peters, Timmerhaus");
    expect(html).toContain("no number");
    expect(html).not.toMatch(/10 to 20|0\.39 to|0\.16 to/);
    for (const r of DIRECT_ROWS) expect(html, r.key).toContain(`data-direct="${r.key}"`);
  });
  it("names no competitor or report", () => {
    const text = [html, JSON.stringify(PLANT_COST_STEPS), JSON.stringify(PLANT_COST_LIMITS),
      JSON.stringify(PLANT_COST_QUIZ)].join(" ");
    expect(text).not.toMatch(/apalutamide|donepezil/i);
  });
});

describe("the registry and the guide", () => {
  it("lists the tool as a live notes page on the economics chapter", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "plant-cost")!;
    expect(t.status).toBe("live"); expect(t.kind).toBe("notes"); expect(t.theory).toBe("ch:economics");
    expect(t.discipline).toBe("Process design & economics");
  });
  it("the Tutorials Guide has its section, and the Theory Guide chapter exists", () => {
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-plant-cost}");
    expect(g).toContain("tool=plant-cost");
    expect(read("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
  });
});
