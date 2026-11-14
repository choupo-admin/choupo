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
  C305: the Pinch EduTool in three moments, rendered.  The page is drawn the
  way the app draws it (renderToStaticMarkup inside MantineProvider), with
  the classroom engine run replaced by pinch01's verbatim output (native
  choupoSolve, 2026-11-11) and the 20 K / 10 K sweep of prediction 1 by the
  same witness at both approaches.

  Hand check of the 10 K row: shifted intervals 418.15 / 403.15 / 378.15 /
  358.15 / 328.15 / 303.15 / 298.15 K give dH = +30, -12.5, -70, +135,
  -137.5, -12.5 kW; the cascade's lowest value is -67.5, so Q_H,min = 67.5
  and the corrected cascade ends at 0: Q_C,min = 0, a threshold problem.
  Both targets fall by 40 kW, as step 3's identity says they must.
\*---------------------------------------------------------------------------*/

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { DEFAULT_PREFS } from "../src/state/displayUnits.js";
import { PINCH_ECONOMIC_STEP, PINCH_PREDICTIONS, PINCH_STEPS } from "../src/ui/methods/pinchLesson.js";
import {
  COMPOSITE_CURVES_CSV_PATH, CANDIDATE_MATCHES_CSV_PATH, PinchCompositeTool,
} from "../src/ui/methods/PinchCompositeTool.js";
import { POPULATION_CSV_PATH, PROBLEM_TABLE_CSV_PATH, SUMMARY_CSV_PATH } from "../src/case/pinch.js";

const mock = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  run: null as unknown,
  sweep: [] as unknown[],
}));
vi.mock("../src/state/store.js", () => {
  const useStore = Object.assign(
    (sel: (s: unknown) => unknown) => sel(mock.state),
    { getState: () => mock.state, setState: () => undefined, subscribe: () => () => undefined });
  return { useStore };
});
vi.mock("../src/case/methodRun.js", async (orig) => ({
  ...(await orig<object>()),
  useMethodRun: () => ({ result: mock.run, err: null, busy: false, log: null }),
  useMethodRunSweep: () => ({ results: mock.sweep, errs: [], done: mock.sweep.length, busy: false }),
}));

const P01_POPULATION = "unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason\ncoolerH1,Q,segment,hot,423.15,333.15,-180,2,\ncoolerH2,Q,segment,hot,363.15,333.15,-240,8,\nheaterC1,Q,segment,cold,293.15,398.15,262.5,2.5,\nheaterC2,Q,segment,cold,298.15,373.15,225,3,\n";
const P01_SUMMARY = "key,value\nclass,interiorPinch\nn_pinches,1\npinch_T_star_K,353.15\nH_pinch_kW,300\ncold_curve_offset_kW,40\n";
const P01_PROBLEMTABLE = "interval,T_star_hi_K,T_star_lo_K,sumCP_hot_kW_K,sumCP_cold_kW_K,dH_kW,cascade_in_kW,cascade_out_kW,corrected_in_kW,corrected_out_kW,boundary_out,hot_streams,cold_streams\n1,413.15,408.15,2,0,10,0,10,107.5,117.5,,coolerH1,\n2,408.15,383.15,2,2.5,-12.5,10,-2.5,117.5,105,,coolerH1,heaterC1\n3,383.15,353.15,2,5.5,-105,-2.5,-107.5,105,0,pinch,coolerH1,heaterC1;heaterC2\n4,353.15,323.15,10,5.5,135,-107.5,27.5,0,135,,coolerH1;coolerH2,heaterC1;heaterC2\n5,323.15,308.15,0,5.5,-82.5,27.5,-55,135,52.5,,,heaterC1;heaterC2\n6,308.15,303.15,0,2.5,-12.5,-55,-67.5,52.5,40,bottom,,heaterC1\n";
const P01_COMPOSITECURVES = "curve,T_K,H_kW\nhot,333.15,0\nhot,363.15,300\nhot,423.15,420\ncold,293.15,0\ncold,298.15,12.5\ncold,373.15,425\ncold,398.15,487.5\nhotShifted,323.15,0\nhotShifted,353.15,300\nhotShifted,413.15,420\ncoldShifted,303.15,0\ncoldShifted,308.15,12.5\ncoldShifted,383.15,425\ncoldShifted,408.15,487.5\n";
const P01_KPIS: { [k: string]: number } = { "Q_C_min_kW": 40, "Q_H_min_kW": 107.5, "Q_cold_total_kW": 487.5, "Q_cool_current_kW": 420, "Q_excluded_kW": 0, "Q_heat_current_kW": 487.5, "Q_hot_total_kW": 420, "Q_recovery_max_kW": 380, "T_pinch_K": 353.15, "T_pinch_cold_K": 343.15, "T_pinch_hot_K": 363.15, "candidates_admissible": 6, "candidates_total": 6, "dTmin_K": 20, "duties_excluded": 0, "n_pinches": 1, "pinch_exists": 1, "problem_class": 1, "segments": 4, "utility_sides": 0, "violation_cool_above_pinch_kW": 120, "violation_heat_below_pinch_kW": 260 };
const P01_AT10: { [k: string]: number } = { ...P01_KPIS, Q_H_min_kW: 67.5, Q_C_min_kW: 0,
  dTmin_K: 10, n_pinches: 0, pinch_exists: 0, problem_class: 4 };

const P01 = {
  status: "done", log: "", streams: [], kpis: { pinch: P01_KPIS },
  csvFiles: {
    "reports/pinch/population.csv": P01_POPULATION,
    "reports/pinch/summary.csv": P01_SUMMARY,
    "reports/pinch/problemTable.csv": P01_PROBLEMTABLE,
    "reports/pinch/compositeCurves.csv": P01_COMPOSITECURVES,
  },
};

const text = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"")
  .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ");
const prose = (s: string) => s.replace(/\s+/g, " ");

function edu(sweep: unknown[] = []): string {
  mock.state = { runResult: null, displayPrefs: { ...DEFAULT_PREFS }, setDisplayPrefs: () => undefined };
  mock.run = P01;
  mock.sweep = sweep;
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(PinchCompositeTool)));
}
function caseTab(): string {
  mock.state = { runResult: P01, displayPrefs: { ...DEFAULT_PREFS }, setDisplayPrefs: () => undefined };
  mock.run = null;
  mock.sweep = [];
  return renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(() => PinchCompositeTool({ fixedSource: "current" }))));
}

const H = edu();
const T = text(H);
const at = (s: string) => {
  const i = T.indexOf(s);
  expect(i, `"${s}" is not on the page`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("C305 1 -- three moments, in order", () => {
  it("Understand, Experiment, Verify are the page's parts (<h4>), in that order", () => {
    const h4 = [...H.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/g)].map((m) => text(m[1]!).trim());
    expect(h4).toEqual([
      "1 · Understand · the physical problem",
      "2 · Experiment · the knobs",
      "3 · Verify · every number, its file and its assumptions",
    ]);
    for (const id of ["understand", "experiment", "verify"])
      expect(H).toContain(`data-moment="${id}"`);
    expect(H).toContain("data-moments-nav");
  });

  it("step 1, then the figure, then steps 2-5 (C277), all inside Understand", () => {
    const fig = H.indexOf('aria-label="hot and cold composite curves');
    expect(fig).toBeGreaterThan(0);
    const title = (n: number) => H.indexOf(`${n} · ${PINCH_STEPS[n - 1]!.title}`);
    expect(title(1)).toBeGreaterThan(H.indexOf('data-moment="understand"'));
    expect(title(1)).toBeLessThan(fig);
    for (const n of [2, 3, 4, 5]) {
      expect(title(n), `step ${n}`).toBeGreaterThan(fig);
      expect(title(n), `step ${n}`).toBeLessThan(H.indexOf('data-moment="experiment"'));
    }
  });

  it("the knobs are in Experiment, beside a second drawing of the figure", () => {
    const ex = H.indexOf('data-moment="experiment"'), ve = H.indexOf('data-moment="verify"');
    const knob = H.indexOf("H1 supply T");
    expect(knob).toBeGreaterThan(ex);
    expect(knob).toBeLessThan(ve);
    expect(H.indexOf('aria-label="hot and cold composite curves', ex)).toBeLessThan(ve);
  });

  it("the file names live in Verify, not in Understand", () => {
    const u0 = T.indexOf("1 · Understand · the"), e0 = T.indexOf("2 · Experiment · the knobs"), v0 = T.indexOf("3 · Verify · every");
    expect(T.slice(u0, e0)).not.toContain("reports/pinch/");
    const verify = T.slice(v0);
    for (const p of [POPULATION_CSV_PATH, PROBLEM_TABLE_CSV_PATH, SUMMARY_CSV_PATH,
      COMPOSITE_CURVES_CSV_PATH, CANDIDATE_MATCHES_CSV_PATH])
      expect(verify, p).toContain(p);
    expect(verify).toContain("src/postProcessing/PinchPass.H");
    expect(verify).toContain("tutorials/steady/heat/pinch01_four_stream_classic");
    expect(verify).toContain("gui/src/case/pinchViolations.ts");
    //  The engine's tables, the assumptions and the references close the page.
    expect(verify).toContain("The worked cascade");
    expect(verify).toContain("What this does not model");
    expect(verify).toContain("References");
  });

  it("no equation failed to render", () => {
    expect(T).not.toContain("this equation did not render");
  });
});

describe("C305 2 -- symbol definitions fold under each equation, every word kept", () => {
  it("each step with an equation has one folded Symbols panel (5 lesson steps + economic)", () => {
    expect((H.match(/<details[^>]*data-symbols-panel/g) ?? []).length).toBe(6);
    expect(T).toContain("Symbols (4) — click to open their definitions");
  });
  it("every previous definition text is still on the page", () => {
    for (const s of PINCH_STEPS)
      for (const g of s.where ?? [])
        expect(T, `step ${s.n} ${g.sym}`).toContain(prose(g.means));
  });
  it("and so is every limit", () => {
    expect(T).toContain("A target says what is achievable, never that anything achieves it.");
  });
});

describe("C305 3 -- a prediction before each run, the engine's answer beside it", () => {
  it("the three prompts are on the page, inside Experiment", () => {
    const ex = T.indexOf("2 · Experiment · the knobs"), ve = T.indexOf("3 · Verify · every");
    for (const p of PINCH_PREDICTIONS) {
      const i = at(p.title);
      expect(i).toBeGreaterThan(ex);
      expect(i).toBeLessThan(ve);
      expect(T).toContain(prose(p.prompt));
    }
    expect(T).toContain("Reduce ΔT_min from 20 K to 10 K");
    expect(T).toContain("reports no interior pinch");
  });
  it("the network prompt is labelled a design exercise the tool does not build", () => {
    expect(T).toContain("DESIGN EXERCISE — the tool does not build networks");
    expect(T).toContain("This tool does not build networks.");
  });
  it("the run waits for a guess", () => {
    expect(T).toContain("Choose rise, fall or stay first");
  });
  it("prediction 2 prints the engine's class at the knob values", () => {
    expect(T).toContain("interiorPinch");
    expect(T).toContain("none — the witness as shipped");
  });
  it("prediction 1 prints both targets at 20 K and 10 K side by side, no grade", () => {
    const t = text(edu([{ kpis: { pinch: P01_KPIS } }, { kpis: { pinch: P01_AT10 } }]));
    expect(t).toContain("your prediction the engine");
    expect(t).toContain("Q_H,min, 20 K → 10 K");
    expect(t).toContain("107.5 → 67.5 kW: fall by 40.0 kW");
    expect(t).toContain("40.0 → 0.0 kW: fall by 40.0 kW");
    for (const w of ["correct", "wrong", "score", "grade"])
      expect(t.toLowerCase()).not.toContain(` ${w} `);
  });
});

describe("C305 4 -- is it economic?", () => {
  it("the step says the target is not the cheapest plant and that area is not priced", () => {
    const i = at("6 · Is it economic?");
    expect(i).toBeGreaterThan(T.indexOf("2 · Experiment · the knobs"));
    expect(i).toBeLessThan(T.indexOf("3 · Verify · every"));
    expect(T).toContain("They are not the cheapest plant.");
    expect(T).toContain("its pinch pass prices no area");
    expect(T).toContain("The data I would need");
    //  The list sits folded behind the student's own answer.
    expect(H).toMatch(/<details[^>]*>\s*<summary[^>]*>[\s\S]*?Compare with a list/);
    expect(T).toContain(prose(PINCH_ECONOMIC_STEP.note!));
  });
});

describe("C305 5 -- the witness network shows the term the utility-only network hides", () => {
  it("is in Understand, after step 5", () => {
    const i = at("The rule in numbers: one exchanger across the pinch");
    expect(i).toBeGreaterThan(T.indexOf(`5 · ${PINCH_STEPS[4]!.title}`));
    expect(i).toBeLessThan(T.indexOf("2 · Experiment · the knobs"));
  });
  it("names the crossing exchanger, its approaches and the two identity lines", () => {
    expect(T).toContain("coolerH1 gives 100 kW to heaterC1");
    expect(T).toContain("Its approaches are 90 and 80 K");
    expect(T).toContain("utilities only (what the case declares): Q_H − Q_H,min = 488 − 108 = 380 kW"
      + " = 0 cross-pinch + 260 heating below + 120 cooling above");
    expect(T).toContain("with coolerH1 → heaterC1: Q_H − Q_H,min = 387.5 − 107.5 = 280.0 kW"
      + " = 100.0 cross-pinch + 160.0 heating below + 20.0 cooling above");
    expect(T).toContain("below Q_H,min + 100 = 208 kW");
  });
  it("its item table is sortable (SortableTable)", () => {
    const w = H.slice(H.indexOf("data-witness-network"), H.indexOf('data-moment="experiment"'));
    expect((w.match(/data-sortable="/g) ?? []).length).toBe(5);
  });
});

describe("the case's own Pinch tab keeps the instrument layout", () => {
  const c = caseTab();
  it("no moments, no predictions, no witness network, no economic step", () => {
    expect(c).not.toContain("data-moment=");
    expect(c).not.toContain("data-prediction=");
    expect(c).not.toContain("data-witness-network");
    expect(c).not.toContain("Is it economic?");
  });
  it("still opens on the plant's figure, with steps 4 and 5 after it", () => {
    const fig = c.indexOf('aria-label="hot and cold composite curves');
    expect(fig).toBeGreaterThan(0);
    expect(c.indexOf(PINCH_STEPS[3]!.title)).toBeGreaterThan(fig);
    expect(c).not.toContain(PINCH_STEPS[0]!.title);
  });
});
