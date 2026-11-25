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
  column-design (C501): the numbers on the page held to the recorded engine
  run, the page's own arithmetic held to hand calculations written IN this
  file, and the engine claims of the lesson held to the lines they cite.

  THE HAND CALCULATIONS.
    lever rule, z = 0.30, x_D = 0.85, x_B = 0.01:
        D/F = (0.30 - 0.01)/(0.85 - 0.01) = 0.29/0.84 = 0.345238
    capital-recovery factor, i = 0.10, n = 15 y:
        1.1^15 = 4.177248;  f_c = 0.1 x 4.177248/3.177248 = 0.131474
    annual cost of a point with C_inst = 500 000 EUR, Q_reb = 1000 kW,
    p_E = 0.05 EUR/kWh, cooling 2 EUR/h, f_c = 0.13, 8000 h/yr:
        capital 65 000 + energy 1000 x 8000 x 0.05 = 400 000 + cooling 16 000
        = 481 000 EUR/yr
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: { series: ["#26c6da", "#ffb74d"] },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {}, margin: {} },
}));

import {
  HOURS_PER_YEAR, RECORD, annualCost, capitalRecovery, costOptimum,
  designCurve, distillateReachable, leverD, limitGap, systemRecord,
  type DesignPoint, type SystemId,
} from "../src/case/columnDesign.js";
import {
  COLUMN_DESIGN_LIMITS, COLUMN_DESIGN_QUIZ, COLUMN_DESIGN_STEPS,
} from "../src/ui/methods/columnDesignLesson.js";
import { ColumnDesignTool } from "../src/ui/methods/ColumnDesignTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const near = (a: number, b: number, rel: number, what = ""): void => {
  const err = Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  expect(err, `${what}: ${a} vs ${b}`).toBeLessThan(rel);
};
const SYSTEMS: SystemId[] = ["ew", "bt"];

describe("the recorded run is one run of the shipped case's procedure", () => {
  for (const id of SYSTEMS) {
    const rec = systemRecord(id);
    const pts = designCurve(id);
    it(`${id}: every converged point is ON the fixed specification`, () => {
      expect(pts.length).toBeGreaterThanOrEqual(8);
      for (const p of pts) {
        near(p.xD, rec.spec.xD, 1e-4, `${id} N=${p.N} x_D`);
        near(p.xB, rec.spec.xB, 1e-4, `${id} N=${p.N} x_B`);
      }
    });
    it(`${id}: the reflux falls with the stage count towards a floor`, () => {
      for (let i = 1; i < pts.length; ++i) expect(pts[i]!.R).toBeLessThan(pts[i - 1]!.R);
      const n = pts.length;
      const last = pts[n - 1]!.R, before = pts[n - 2]!.R;
      expect((before - last) / last, "flattening at the largest N").toBeLessThan(0.05);
    });
    it(`${id}: N_min is at or below every recorded N and the reflux diverges towards it`, () => {
      expect(rec.nMin).not.toBeNull();
      expect(rec.nMin!).toBeLessThanOrEqual(pts[0]!.N);
      expect(pts[0]!.R).toBeGreaterThan(2 * pts[pts.length - 1]!.R);
    });
    it(`${id}: the shortcut record carries its limits and a Gilliland curve`, () => {
      const s = rec.shortcut;
      expect(s.Nmin).toBeGreaterThan(0);
      expect(s.Rmin).toBeGreaterThan(0);
      expect(s.alpha).toBeGreaterThan(1);
      expect(s.curve.length).toBeGreaterThanOrEqual(10);
      for (let i = 1; i < s.curve.length; ++i)
        expect(s.curve[i]!.N, "Gilliland falls with R").toBeLessThan(s.curve[i - 1]!.N);
    });
    it(`${id}: the recorded duty, diameter and cost are the engine's, positive and consistent`, () => {
      for (const p of pts) {
        expect(p.Qreb_kW).toBeGreaterThan(0);
        expect(p.diameter_m).toBeGreaterThan(0.2);
        const c = p.capex_EUR;
        near(c.total, c.condenser + c.reboiler + c.shell + c.trays + c.refluxDrum, 1e-9, "total");
        near(p.reboilerUtility.EUR_per_h, p.reboilerUtility.EUR_per_kWh * p.Qreb_kW, 1e-6, "steam bill");
      }
    });
  }
  it("the control: the shortcut is closer to the rigorous column on the ideal mixture than on the real one", () => {
    const ew = limitGap("ew")!, bt = limitGap("bt")!;
    expect(bt.rRatio).toBeLessThan(ew.rRatio);
    expect(bt.nRatio).toBeLessThan(ew.nRatio);
    expect(bt.rRatio, "control within 25 %").toBeLessThan(1.25);
    expect(ew.rRatio, "the real mixture is clearly off").toBeGreaterThan(1.5);
  });
  it("the shortcut's error grows as the distillate is asked closer to the azeotrope", () => {
    const rows = RECORD.specs.rows.filter((r) => r.rigorousR_atNbig && r.fugRmin);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const ratio = rows.map((r) => r.rigorousR_atNbig! / r.fugRmin!);
    expect(ratio[ratio.length - 1]!).toBeGreaterThan(ratio[0]!);
  });
  it("the azeotrope the page draws is read on the engine's scan, and the control has none", () => {
    const az = systemRecord("ew").txy!.azeotropeX;
    expect(az).not.toBeNull();
    expect(az!).toBeGreaterThan(0.85);
    expect(az!).toBeLessThan(0.93);
    expect(systemRecord("bt").txy!.azeotropeX).toBeNull();
  });
});

describe("the page's own arithmetic, against hand calculations", () => {
  it("lever rule: D/F = 0.29/0.84", () => {
    near(leverD(0.30, 0.85, 0.01), 0.29 / 0.84, 1e-12);
    expect(Number.isNaN(leverD(0.3, 0.5, 0.5))).toBe(true);
  });
  it("capital recovery: i = 0.10, n = 15 gives 0.131474", () => {
    near(capitalRecovery(0.10, 15), 0.131474, 1e-5);
    near(capitalRecovery(0, 10), 0.1, 1e-12);
  });
  it("annual cost of a made-up point: 481 000 EUR/yr", () => {
    const p = {
      N: 20, R: 2, Qreb_kW: 1000, capex_EUR: { total: 500000 },
      condenserUtility: { EUR_per_h: 2 },
    } as unknown as DesignPoint;
    const c = annualCost(p, { energyPrice: 0.05, capitalCharge: 0.13 });
    near(c.capital, 65000, 1e-12);
    near(c.energy, 1000 * HOURS_PER_YEAR * 0.05, 1e-12);
    near(c.total, 481000, 1e-12);
  });
  it("a dearer heat price moves the optimum to more stages and less reflux (recorded points)", () => {
    for (const id of SYSTEMS) {
      const cheap = costOptimum(id, { energyPrice: 0.01, capitalCharge: 0.13 })!;
      const dear = costOptimum(id, { energyPrice: 0.20, capitalCharge: 0.13 })!;
      expect(dear.N, id).toBeGreaterThan(cheap.N);
      expect(dear.R, id).toBeLessThan(cheap.R);
    }
  });
  it("the cost curve has an interior minimum at the engine's own price", () => {
    for (const id of SYSTEMS) {
      const pts = designCurve(id);
      const o = costOptimum(id, { energyPrice: pts[0]!.reboilerUtility.EUR_per_kWh, capitalCharge: 0.13 })!;
      expect(o.N, id).toBeGreaterThan(pts[0]!.N);
      expect(o.N, id).toBeLessThan(pts[pts.length - 1]!.N);
    }
  });
  it("the page lets a distillate past the azeotrope be named, and calls it unreachable", () => {
    expect(distillateReachable("ew", 0.85)).toBe(true);
    expect(distillateReachable("ew", 0.95)).toBe(false);
    expect(distillateReachable("bt", 0.99)).toBe(true);
  });
  it("columnDesign.ts has no physics: no logarithm, exponential or root", () => {
    const src = read("gui/src/case/columnDesign.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/Math\.(log|exp|sqrt|log10)/);
    expect((src.match(/Math\.pow/g) ?? []).length, "(1+i)^n is the only power").toBe(1);
  });
});

describe("what the rendered page prints is the recorded run's number", () => {
  const html = renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(ColumnDesignTool)));
  const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
  it("opens on ethanol/water and draws the four cards", () => {
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`data-column-design-card="${n}"`);
    expect(text).toContain("ethanol / water (real)");
  });
  it("prints every recorded reflux of the curve to four decimals, in a row of its N", () => {
    for (const p of designCurve("ew"))
      expect(text, `N=${p.N}`).toContain(p.R.toFixed(4));
  });
  it("prints N_min, the floor reflux and the azeotrope as recorded", () => {
    const ew = systemRecord("ew");
    const pts = designCurve("ew");
    expect(text).toContain(`N_min: ${ew.nMin} stages`);
    expect(text).toContain(`R at N = ${pts[pts.length - 1]!.N}: ${pts[pts.length - 1]!.R.toFixed(3)}`);
    expect(text).toContain(`azeotrope at x = ${ew.txy!.azeotropeX!.toFixed(3)}`);
  });
  it("prints the shortcut's limits for both mixtures and the two ratios", () => {
    for (const id of SYSTEMS) {
      const g = limitGap(id)!;
      expect(text).toContain(g.fugRmin.toFixed(3));
      expect(text).toContain(g.rRatio.toFixed(2));
      expect(text).toContain(g.nRatio.toFixed(2));
    }
  });
  it("prints the purity table row of every recorded specification", () => {
    for (const r of RECORD.specs.rows.filter((q) => q.rigorousR_atNbig !== null)) {
      expect(text).toContain(r.xD.toFixed(2));
      expect(text).toContain(r.rigorousR_atNbig!.toFixed(3));
      expect(text).toContain((r.rigorousR_atNbig! / r.fugRmin!).toFixed(2));
    }
  });
  it("names the recorded run and the command that reproduces it", () => {
    expect(text).toContain("Recorded run");
    expect(text).toContain("bin/curate/c501_column_design_table.py");
    expect(text).toContain("column21_design_curve_ethanol_water");
  });
  it("the cheapest recorded N printed is the optimum of the cost arithmetic", () => {
    const pts = designCurve("ew");
    const price = Number(pts[0]!.reboilerUtility.EUR_per_kWh.toFixed(3));
    const o = costOptimum("ew", { energyPrice: price, capitalCharge: Number(capitalRecovery(0.10, 15).toFixed(2)) })!;
    expect(text).toContain(`cheapest recorded N = ${o.N}`);
  });
});

describe("the lesson", () => {
  it("is registered, live and declares the four origins it draws", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "column-design")!;
    expect(t.status).toBe("live");
    expect([...t.origins].sort()).toEqual(["assumption", "engine", "page", "reference"]);
    expect(t.theory).toBe("ch:column-design");
  });
  it("has four steps, six limits and a quiz that names its steps", () => {
    expect(COLUMN_DESIGN_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(COLUMN_DESIGN_LIMITS.length).toBe(6);
    for (const q of COLUMN_DESIGN_QUIZ) for (const n of q.steps)
      expect(COLUMN_DESIGN_STEPS.some((s) => s.n === n)).toBe(true);
  });
  it("links its first step to the residue curve page, where ternary feasibility lives", () => {
    expect(COLUMN_DESIGN_STEPS[0]!.leadsTo?.tool).toBe("residue-curves");
    const ts = read("gui/src/ui/methods/residueCurvesLesson.ts");
    expect(ts).toContain(COLUMN_DESIGN_STEPS[0]!.leadsTo!.stepTitle);
  });
  it("quotes no number of the recorded run in its prose", () => {
    const prose = [...COLUMN_DESIGN_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...COLUMN_DESIGN_LIMITS.map((l) => l.body)].join("\n")
      .replace(/[A-Za-z]+\.cpp:[\d-]+/g, "");
    expect(prose).not.toMatch(/\b\d+\.\d+\b/);
  });
  it("uses no dash made of hyphens in its own prose", () => {
    const prose = [...COLUMN_DESIGN_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...COLUMN_DESIGN_LIMITS.map((l) => l.body)].join("\n");
    expect(prose).not.toContain(" -- ");
  });
  it("holds every engine citation to the text it claims", () => {
    const all = [...COLUMN_DESIGN_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...COLUMN_DESIGN_LIMITS.map((l) => l.body)].join("\n");
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const FILES: Record<string, string> = {
      "DesignSpec.cpp": "src/outerDriver/DesignSpec.cpp",
      "DistillationColumn.cpp": "src/unitOperations/distillation/DistillationColumn.cpp",
      "ShortcutColumn.cpp": "src/unitOperations/distillation/ShortcutColumn.cpp",
    };
    const CLAIMS: Record<string, string | RegExp> = {
      "DesignSpec.cpp:375": "solver::newtonND(residual, x0, opts)",
      "DistillationColumn.cpp:4531-4532": /kpis_\["x_D_LK"\]\s*= xD\[0\];\s*kpis_\["x_B_HK"\]\s*=/,
      "DistillationColumn.cpp:4659": "kpis_[\"Q_reboiler_kW\"]  = dH - Q_cond;",
      "ShortcutColumn.cpp:136": "alpha[i] = K[i] / Khk;",
      "ShortcutColumn.cpp:306": "Gilliland (Molokanov)",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = read(FILES[file]!).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const text = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
  it("the case the page names exists with its designSpec and its two targets", () => {
    const d = "tutorials/steady/distillation/column21_design_curve_ethanol_water/";
    const outer = read(d + "system/outerDict");
    expect(outer).toContain("type         designSpec;");
    expect(outer).toContain("column.x_D_LK");
    expect(outer).toContain("column.x_B_HK");
    expect(read(d + "system/flowsheetDict")).toContain("model       simultaneous;");
  });
});
