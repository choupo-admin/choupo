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
  demandForecast.test -- "Demand forecast for a drug product" (commission
  C210, E8).  The regression is held to a worked example computed by hand and
  the Student t quantiles to the standard table; the units check, the dose
  count, the S-curve, the capacity factor and the keys the economics reads are
  recomputed from their formulas.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  JUMP_RATIO, dddPacks, dddReconciliation, designKgPerYear, forecast, pasteBlock,
  penetration, regress, scaleWarnings, tCdf, tQuantile, unitsCheck,
  type ForecastInputs,
} from "../src/ui/methods/demandForecastMath.js";
import { DEMAND_STEPS } from "../src/ui/methods/demandForecastLesson.js";
import {
  DEFAULT_SERIES, DemandForecastTool, parseSeries,
} from "../src/ui/methods/DemandForecastTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("Student t", () => {
  it("two-sided 95 % quantiles of the standard table", () => {
    near(tQuantile(0.975, 1), 12.7062, 1e-4);
    near(tQuantile(0.975, 3), 3.182446, 1e-5);
    near(tQuantile(0.975, 8), 2.306004, 1e-5);
    near(tQuantile(0.975, 10), 2.228139, 1e-5);
    near(tQuantile(0.975, 30), 2.042272, 1e-5);
    near(tQuantile(0.995, 10), 3.169273, 1e-5);
  });
  it("the cdf is symmetric and 1/2 at zero; df = 1 is the Cauchy arctangent", () => {
    near(tCdf(0, 7), 0.5); near(tCdf(1.3, 7) + tCdf(-1.3, 7), 1);
    near(tCdf(2, 1), 0.5 + Math.atan(2) / Math.PI, 1e-9);
  });
});

describe("method A: the regression, on a worked example", () => {
  // t = 1..5, y = 2 4 5 4 5: slope 0.6, intercept 2.2, SSE 2.4, Syy 6, R^2 0.6
  const r = regress([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!;
  it("slope, intercept, R^2, s", () => {
    near(r.slope, 0.6); near(r.intercept, 2.2); near(r.r2, 0.6);
    near(r.s, Math.sqrt(2.4 / 3)); near(r.sxx, 10); near(r.df, 3);
    near(r.seSlope, Math.sqrt(0.8) / Math.sqrt(10));
    near(r.tSlope, 0.6 / (Math.sqrt(0.8) / Math.sqrt(10)));
  });
  it("the p value of the slope: t = 2.121, df = 3 gives about 0.124", () => {
    near(r.pSlope, 2 * (1 - tCdf(r.tSlope, 3)));
    expect(r.pSlope).toBeGreaterThan(0.12); expect(r.pSlope).toBeLessThan(0.13);
  });
  it("the 95 % prediction interval at t = 6", () => {
    near(r.predict(6), 5.8);
    near(r.halfWidth(6, 0.95), 3.182446 * Math.sqrt(0.8) * Math.sqrt(1 + 1 / 5 + 9 / 10), 1e-5);
  });
  it("the band widens away from the mean year", () => {
    expect(r.halfWidth(10, 0.95)).toBeGreaterThan(r.halfWidth(6, 0.95));
    expect(r.halfWidth(3, 0.95)).toBeLessThan(r.halfWidth(6, 0.95));
  });
  it("a perfect line has R^2 = 1", () => {
    const p = regress([1, 2, 3, 4], [2, 4, 6, 8])!;
    near(p.r2, 1); near(p.slope, 2); near(p.intercept, 0);
  });
  it("fewer than three points, or one year repeated, cannot be fitted", () => {
    expect(regress([1, 2], [1, 2])).toBeNull();
    expect(regress([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("the units check", () => {
  const yrs = [2020, 2021, 2022, 2023];
  it("computes nothing until both units are chosen", () => {
    const v = unitsCheck({ values: [1, 2, 3, 4], seriesScale: "", answerScale: "", jumpConfirmed: false }, yrs);
    expect(v.ok).toBe(false); expect(v.refusals.length).toBe(2);
    expect(unitsCheck({ values: [1, 2, 3, 4], seriesScale: "units", answerScale: "", jumpConfirmed: false }, yrs).refusals.length).toBe(1);
  });
  it("a thousands value among millions is refused naming the years, unless confirmed", () => {
    const vals = [5200, 5410, 6010000, 6200];
    const v = unitsCheck({ values: vals, seriesScale: "thousands", answerScale: "millions", jumpConfirmed: false }, yrs);
    expect(v.ok).toBe(false);
    expect(v.refusals.join(" ")).toContain("2021 and 2022");
    const c = unitsCheck({ values: vals, seriesScale: "thousands", answerScale: "millions", jumpConfirmed: true }, yrs);
    expect(c.ok).toBe(true);
    expect(JUMP_RATIO).toBe(10);
  });
  it("a jump just under the ratio passes; non-positive values are refused", () => {
    expect(unitsCheck({ values: [100, 999, 1000, 1001], seriesScale: "units", answerScale: "units", jumpConfirmed: false }, yrs).ok).toBe(true);
    expect(unitsCheck({ values: [100, 0, 1000, 1001], seriesScale: "units", answerScale: "units", jumpConfirmed: false }, yrs).ok).toBe(false);
  });
  it("warns when the plant and the forecast are two orders apart", () => {
    expect(scaleWarnings(1000, 5).length).toBe(1);
    expect(scaleWarnings(2, 3).length).toBe(0);
  });
  it("parses 'year value' lines and reports the unreadable ones", () => {
    const p = parseSeries("2020 5\n2021, 6\n\nnonsense\n2022;7");
    expect(p.years).toEqual([2020, 2021, 2022]); expect(p.values).toEqual([5, 6, 7]);
    expect(p.bad).toEqual(["nonsense"]);
  });
});

describe("methods B and C, by hand", () => {
  const d = { population: 10.3e6, prevalence: 0.20, treated: 0.60, moleculeShare: 0.50,
    adherence: 0.80, dddPerDay: 1, dddPerPack: 28, growth: 0.02 };
  it("the dose count", () => {
    const r = dddPacks(d, 0);
    const patients = 10.3e6 * 0.2 * 0.6 * 0.5;
    near(r.patients, patients); near(r.ddd, patients * 0.8 * 365); near(r.packs, patients * 0.8 * 365 / 28);
    near(dddPacks(d, 3).packs, r.packs * Math.pow(1.02, 3));
  });
  it("the S-curve is half the ceiling at the half-year and tends to the ceiling", () => {
    const p = { sMax: 0.3, jHalf: 3, k: 1 };
    near(penetration(p, 3), 0.15);
    near(penetration(p, 5), 0.3 / (1 + Math.exp(-2)));
    expect(penetration(p, 40)).toBeGreaterThan(0.2999);
    expect(penetration(p, 1)).toBeLessThan(penetration(p, 2));
  });
});

describe("the forecasts on the default history", () => {
  const parsed = parseSeries(DEFAULT_SERIES);
  const base = (): ForecastInputs => ({
    years: parsed.years, values: parsed.values.map((v) => v * 1000), kind: "packs", dddPerPack: 28,
    delay: 1, horizon: 10, share: 0.25, factor: 1, designPacks: 2e6, level: 0.95,
    ddd: { population: 10.3e6, prevalence: 0.20, treated: 0.60, moleculeShare: 0.50, adherence: 0.80,
      dddPerDay: 1, dddPerPack: 28, growth: 0.02 },
    pen: { sMax: 0.3, jHalf: 3, k: 1 }, penBase: "trend",
  });
  it("trend: market(year) is the fitted line, sold = market x share x factor, ramp capped at 1", () => {
    const inp = base();
    const fit = regress(inp.years, inp.values)!;
    const f = forecast("trend", inp)!;
    expect(f.rows.length).toBe(10);
    const r1 = f.rows[0]!;
    expect(r1.year).toBe(2025 + 1 + 1);
    near(r1.market, fit.predict(r1.year)); near(r1.sold, r1.market * 0.25);
    near(r1.ramp, Math.min(1, r1.sold / 2e6));
    expect(r1.lo!).toBeLessThan(r1.market); expect(r1.hi!).toBeGreaterThan(r1.market);
    near(r1.hi! - r1.market, fit.halfWidth(r1.year, 0.95), 1e-9);
    for (const r of f.rows) { expect(r.ramp).toBeGreaterThanOrEqual(0); expect(r.ramp).toBeLessThanOrEqual(1); }
  });
  it("the capacity factor multiplies the sold quantity and is compared with the market", () => {
    const f1 = forecast("trend", base())!;
    const f6 = forecast("trend", { ...base(), factor: 6 })!;
    near(f6.meanSoldPacks, 6 * f1.meanSoldPacks);
    near(f6.rows[0]!.soldOverMarket, 0.25 * 6);   // 1.5: more than the market
    expect(f6.rows.every((r) => r.soldOverMarket > 1)).toBe(true);
    // the factor that would fill the plant, at factor 1 and at factor 6
    near(f1.fillFactor, 2e6 / f1.meanSoldPacks);
    near(f6.fillFactor * 6, f1.fillFactor);
  });
  it("penetration uses the S-curve share; ddd the dose count", () => {
    const fc = forecast("penetration", base())!;
    near(fc.rows[2]!.share, penetration({ sMax: 0.3, jHalf: 3, k: 1 }, 3));
    const fd = forecast("ddd", base())!;
    near(fd.rows[0]!.market, dddPacks(base().ddd, 2).packs);   // delay 1 + j 1
  });
  it("a DDD series is converted through the pack size", () => {
    const inp = { ...base(), kind: "DDD" as const, values: parsed.values.map((v) => v * 1000 * 28) };
    const a = forecast("trend", base())!, b = forecast("trend", inp)!;
    near(b.rows[0]!.market, a.rows[0]!.market, 1e-9);
  });
  it("the dose count's base year is reconciled against the last observed year", () => {
    const inp = base();
    near(dddReconciliation(inp), dddPacks(inp.ddd, 0).packs / 6930000);
    expect(dddReconciliation(inp)).toBeGreaterThan(0.5);
  });
  it("a falling line is floored at zero and says so", () => {
    const f = forecast("trend", { ...base(), values: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0.5].map((v) => v * 1e6) })!;
    expect(f.notes.join(" ")).toContain("below zero");
    expect(f.rows[f.rows.length - 1]!.market).toBe(0);
  });
});

describe("the keys the economics reads", () => {
  it("design production in kg = packs x tablets x mass / 1000, and the block carries rampUp in [0, 1]", () => {
    near(designKgPerYear(2e6, 28, 0.5), 28000);
    const parsed = parseSeries(DEFAULT_SERIES);
    const inp: ForecastInputs = {
      years: parsed.years, values: parsed.values.map((v) => v * 1000), kind: "packs", dddPerPack: 28,
      delay: 1, horizon: 5, share: 0.25, factor: 1, designPacks: 2e6, level: 0.95,
      ddd: { population: 1e7, prevalence: 0.2, treated: 0.6, moleculeShare: 0.5, adherence: 0.8, dddPerDay: 1, dddPerPack: 28, growth: 0 },
      pen: { sMax: 0.3, jHalf: 3, k: 1 }, penBase: "last",
    };
    const f = forecast("trend", inp)!;
    const block = pasteBlock(f, 2e6, 28, 0.5, "million", 1e6);
    const m = block.match(/rampUp \( ([^)]*) \);/)!;
    const list = m[1]!.split(" ").map(Number);
    expect(list.length).toBe(5);
    for (const x of list) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
    expect(block).toContain("perYear  28000 kg;");
    expect(block).toContain("streamFactor fromBatchPlan;");
  });
  it("the grammar the page writes is the grammar the engine reads", () => {
    const src = read("src/postProcessing/EconomicsPass.cpp");
    expect(src).toContain('d->found("rampUp")');
    expect(src).toContain("fraction outside [0, 1]");
    expect(src).toContain("fromBatchPlan");
  });
});

describe("the page and the registry", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DemandForecastTool)));
  it("draws the three methods, the factor note and the paste block on the default history", () => {
    for (const m of ["trend", "ddd", "penetration"]) expect(html).toContain(`data-method-summary="${m}"`);
    expect(html).toContain("data-factor-note");
    expect(html).toContain("data-paste-block");
    expect(html).toContain("data-fit");
    expect(html).toContain("data-not-measurement");
  });
  it("does not refuse the default history", () => {
    expect(html).not.toContain("data-units-refusal");
  });
  it("walks the lesson steps", () => {
    expect(DEMAND_STEPS.length).toBe(8);
  });
  it("is a live notes page on the economics chapter", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "demand-forecast")!;
    expect(t.status).toBe("live"); expect(t.kind).toBe("notes"); expect(t.theory).toBe("ch:economics");
  });
  it("the Theory Guide chapter it links to and the Tutorials Guide section exist", () => {
    expect(read("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-demand-forecast}");
    expect(g).toContain("tool=demand-forecast");
  });
});
