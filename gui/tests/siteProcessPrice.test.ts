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
  siteProcessPrice.test -- "Where to build it, what to make, and what it sells
  for" (commission C212, the market side).

  Every number below is worked by hand in a comment beside it, from the
  page's own illustration inputs.  The page ships no margin, tax rate or
  weight, and a test holds that.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  chainDown, chainUp, crossingWeight, flipTable, leaderAtMultiple, matrixStart, patentBasis,
  patentStart, rankOf, stageProblem, type Stage, stagesStart, stepDown, stepUp, weightedScores,
  PATENT_CHECKLIST, SITE_PROMPTS,
} from "../src/ui/methods/siteProcessPriceMath.js";
import { SITE_PROCESS_PRICE_QUIZ, SITE_PROCESS_PRICE_STEPS } from "../src/ui/methods/siteProcessPriceLesson.js";
import { SiteProcessPriceTool } from "../src/ui/methods/SiteProcessPriceTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("the weighted matrix", () => {
  const { criteria: cs } = matrixStart();
  it("scores: A 50/8, B 53/8, C 54/8 (weights 3,2,2,1)", () => {
    // A = 3*8+2*5+2*6+1*4 = 50; B = 18+16+14+5 = 53; C = 15+12+18+9 = 54
    const s = weightedScores(cs, 3)!;
    near(s[0]!, 6.25); near(s[1]!, 6.625); near(s[2]!, 6.75);
    expect(rankOf(s)).toEqual([2, 1, 0]);
  });
  it("no weight, no score", () => {
    expect(weightedScores(cs.map((c) => ({ ...c, weight: 0 })), 3)).toBeNull();
  });
  it("crossing weight of criterion 1 between C and B is 4: (39-35)/(6-5)", () => {
    near(crossingWeight(cs, 0, 2, 1)!, 4);
    // at that weight the two scores really tie: (R + 4 s) / (5 + 4)
    const at = (i: number) =>
      (cs.slice(1).reduce((a, c) => a + c.weight * c.scores[i]!, 0) + 4 * cs[0]!.scores[i]!) / (4 + 5);
    near(at(2), at(1));
  });
  it("crossing against A is 13/3 and negative or absent crossings are refused", () => {
    near(crossingWeight(cs, 0, 2, 0)!, 13 / 3);
    expect(crossingWeight(cs, 1, 2, 0)).toBeNull(); // (42-40)/(5-6) = -2
    expect(crossingWeight(cs, 0, 0, 0)).toBeNull(); // equal scores
  });
  it("flip table: 4, 2.5, 1.5 and 0.75, all by site B", () => {
    // crit 2: (42-37)/2 = 2.5; crit 3: (36-39)/(7-9) = 1.5 (A at 0.667 is farther from 2);
    // crit 4: (45-48)/(5-9) = 0.75 (A at 0.2 is farther from 1)
    const t = flipTable(cs, 3);
    [4, 2.5, 1.5, 0.75].forEach((x, k) => near(t[k]!.flipAt!, x));
    expect(t.every((r) => r.by === 1)).toBe(true);
  });
  it("removing criterion 4 makes B the leader: 48/7 against 45/7", () => {
    expect(leaderAtMultiple(cs, 3, 3, 0)).toBe(1);
    expect(leaderAtMultiple(cs, 3, 3, 1)).toBe(2);
  });
  it("lists the seven prompts and no numbers in them", () => {
    expect(SITE_PROMPTS).toHaveLength(7);
    for (const p of SITE_PROMPTS) expect(p.ask).not.toMatch(/\d/);
  });
});

describe("the patent example", () => {
  const b = patentBasis(patentStart())!;
  it("PMI 106/7.5 and E-factor 98.5/7.5", () => {
    near(b.totalIn, 106); near(b.pmi, 106 / 7.5); near(b.eFactor, 98.5 / 7.5);
    near(b.perKg[0]!.kgPerKg, 10 / 7.5);
  });
  it("yield 7.5 / (40 mol x 0.25 kg/mol) = 75 %", () => {
    near(b.theoreticalKg, 10); near(b.yieldFraction, 0.75);
  });
  it("cycle 6+4+2 = 12 h, 7.5/12 kg per h, scale 100/7.5", () => {
    near(b.cycleH, 12); near(b.kgPerH, 7.5 / 12); near(b.scale, 100 / 7.5);
    near(b.scaled[0]!.kg, 1000 / 7.5);
  });
  it("no product, no basis", () => {
    expect(patentBasis({ ...patentStart(), productKg: 0 })).toBeNull();
  });
  it("the checklist has the six steps in order", () => {
    expect(PATENT_CHECKLIST.map((c) => c.id)).toEqual(["encyclopedia", "owner", "scale", "examples", "route", "status"]);
  });
});

describe("the margin chain", () => {
  const stages = stagesStart();
  it("each step and its inverse", () => {
    near(stepDown(14.55, { name: "p", kind: "onSelling", value: 0.2 }), 11.64);
    near(stepDown(14.55, { name: "p", kind: "onCost", value: 0.2 }), 12.125);
    near(stepDown(11, { name: "t", kind: "taxAdded", value: 0.1 }), 10);
    near(stepDown(5, { name: "f", kind: "fixed", value: 0.5 }), 4.5);
    for (const k of ["onSelling", "onCost", "taxAdded", "fixed"] as const) {
      const s = { name: "x", kind: k, value: 0.15 };
      near(stepUp(stepDown(7.3, s), s), 7.3);
    }
  });
  it("20 down: /1.1, x0.8, /1.08, -0.5 = 12.968", () => {
    const d = chainDown(20, stages);
    near(d.rows[0]!.priceAfter, 20 / 1.1);
    near(d.rows[1]!.priceAfter, (20 / 1.1) * 0.8);
    near(d.exFactory, ((20 / 1.1) * 0.8) / 1.08 - 0.5);
    expect(d.exFactory).toBeCloseTo(12.968, 3);
  });
  it("and back up returns exactly the shelf price", () => {
    const d = chainDown(20, stages);
    near(chainUp(d.exFactory, stages).shelf, 20, 1e-12);
  });
  it("percentage stages commute, a fixed amount does not", () => {
    const [t, ph, wh, fee] = stages as [Stage, Stage, Stage, Stage];
    const pct = [ph, t, wh, fee];
    near(chainDown(20, pct).exFactory, chainDown(20, stages).exFactory);
    const fx = [fee, t, ph, wh];
    // fee first: (20-0.5)/1.1*0.8/1.08 = 13.1313 against 12.9680
    expect(chainDown(20, fx).exFactory).toBeCloseTo(((20 - 0.5) / 1.1) * 0.8 / 1.08, 9);
    expect(chainDown(20, fx).exFactory - chainDown(20, stages).exFactory).toBeGreaterThan(0.1);
  });
  it("refuses a share of 100 % or a negative rate", () => {
    expect(stageProblem({ name: "x", kind: "onSelling", value: 1 })).not.toBeNull();
    expect(stageProblem({ name: "x", kind: "onCost", value: -0.1 })).not.toBeNull();
    expect(stageProblem({ name: "x", kind: "fixed", value: 0.5 })).toBeNull();
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(SiteProcessPriceTool)));
  it("draws every section and the plot", () => {
    for (const k of ["data-section=\"site\"", "data-section=\"sensitivity\"", "data-section=\"patent-method\"",
      "data-section=\"patent-basis\"", "data-section=\"patent-cycle\"", "data-section=\"chain-down\"",
      "data-section=\"chain-up\"", "data-chart=\"weight-sweep\"", "data-illustrations", "data-declare"]) expect(html, k).toContain(k);
  });
  it("prints the default numbers computed here", () => {
    expect(html).toContain((54 / 8).toFixed(3));
    expect(html).toContain(patentBasis(patentStart())!.pmi.toFixed(2));
    expect(html).toContain(chainDown(20, stagesStart()).exFactory.toFixed(4));
  });
  it("ships no margin or tax figure in its lesson prose", () => {
    const prose = SITE_PROCESS_PRICE_STEPS.map((s) => s.body).join(" ");
    expect(prose).not.toMatch(/\d+(\.\d+)?\s?%/);
  });
  it("the quiz answers are the numbers computed here", () => {
    const m = SITE_PROCESS_PRICE_QUIZ.find((q) => q.id === "pmi")!;
    expect(m.options[m.correct]).toContain(patentBasis(patentStart())!.pmi.toFixed(2));
    const w = SITE_PROCESS_PRICE_QUIZ.find((q) => q.id === "weights-sum")!;
    expect(w.options[w.correct]).toContain("6.75"); // (3*6+9)/4
  });
});

describe("the registry and the guide", () => {
  it("lists the tool as a live notes page on the economics chapter", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "site-process-price")!;
    expect(t.status).toBe("live"); expect(t.kind).toBe("notes"); expect(t.theory).toBe("ch:economics");
    expect(t.discipline).toBe("Process design & economics");
  });
  it("the guide section exists", () => {
    expect(existsSync(new URL("docs/eduToolsGuide.tex", REPO))).toBe(true);
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-site-process-price}");
    expect(g).toContain("tool=site-process-price");
  });
});
