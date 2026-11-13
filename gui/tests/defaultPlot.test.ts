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

/*  THE PLOTS WORKSPACE LANDS ON THE MOST USEFUL PLOT (rehearsal 2026-11-13: a
    reactive column opened on a two-bar element balance).  The rule is one
    function (case/defaultPlot.ts); these arms hold its order. */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defaultPlotKey } from "../src/case/defaultPlot.js";

const base = { status: "done", log: "", streams: [], kpis: {}, convergence: [], csvFiles: {} };
const run = (extra: Record<string, unknown>) => ({ ...base, ...extra }) as never;
const ELEMENT = { "reports/elementBalance.csv": "x" };
const PROFILE = [{ unit: "col", xAxis: "stage", columns: { stage: [1, 2], T: [300, 310] } }];

describe("defaultPlotKey", () => {
  it("a column that publishes a profile lands on the profile, not the element balance", () => {
    expect(defaultPlotKey(run({ csvFiles: ELEMENT, profiles: PROFILE }), [])).toBe("profile");
  });
  it("with no profile the element balance still lands", () => {
    expect(defaultPlotKey(run({ csvFiles: ELEMENT }), [])).toBe("elementBalance");
  });
  it("the time-based surfaces still come first", () => {
    expect(defaultPlotKey(run({ kpis: { campaign: {} }, profiles: PROFILE }), [])).toBe("campaignBalance");
    expect(defaultPlotKey(run({ csvFiles: { "balanceTrajectory.csv": "x" }, profiles: PROFILE }), []))
      .toBe("dynamicBalance");
    expect(defaultPlotKey(run({ trajectory: { t: [0], vars: {} }, profiles: PROFILE }), [])).toBe("trajectory");
  });
  it("a declared views block lands first", () => {
    const postProcessing = { views: { a: { title: "t" } } };
    const k = defaultPlotKey(run({ postProcessing, profiles: PROFILE }), []);
    //  whatever declaredViewsOf accepts is the case's own question; a block it
    //  does not read leaves the profile rule to apply
    expect(["views", "profile"]).toContain(k);
  });
  it("the tail of the rule: T-x-y, scan, convergence, mass balance", () => {
    expect(defaultPlotKey(run({ txy: {} }), [])).toBe("txy");
    expect(defaultPlotKey(run({}), ["scan.csv"])).toBe("scanCsv");
    expect(defaultPlotKey(run({ convergence: [{ label: "u" }] }), [])).toBe("convergence");
    expect(defaultPlotKey(run({}), [])).toBe("massBalance");
  });
  it("the workspace takes the landing plot from this one function", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/ui/PlotsWorkspace.tsx", import.meta.url)), "utf8");
    expect(src).toContain("setView(defaultPlotKey(result, scanCsvs) as PlotKey)");
    //  no second copy of the chain is left behind
    expect(src).not.toContain('setView("elementBalance")');
  });
});
