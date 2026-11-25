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
  controlValve -- "Why does a correctly sized valve still control badly?"
  (C509), held to what it claims about itself:

    * the installed-flow relation is the algebra of a real series circuit
      (solved numerically for Q, not by the closed form), its analytic slope
      equals a central difference, and the hand-checked gain ratios of the
      commission (linear a = 1: 1.0, 0.5: 2.8, 0.2: 10.5; equal percentage
      R = 50 a = 1: 33.8, 0.2: 6.5, 0.1: 4.4) are reproduced;
    * the engine feed: the authority read from the sweep of
      pumpSystem01_operating_point is the arithmetic of the CSV the engine
      wrote (this tree's native build), and the pump's rise at the minimum
      flow is higher than at the rated one (constant power);
    * the water temperature override lands on the real props witness's FIRST
      state only;
    * card 6 reuses letdown.ts (the same functions, not a copy);
    * the lesson: it cites no source, every equation parses, each leadsTo
      points at a step that exists, the registry entry is live, and the page
      renders on a fixture with no NaN and no "undefined".

  WHAT THIS CANNOT PROVE: that the browser's WASM run gives the CSV this
  tree's native binary wrote (same C++), nor any teaching judgement.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { tutorialByName } from "../src/cases/tutorials.js";
import {
  CV_LINE_WITNESS, CV_PROPS_OP, CV_PROPS_WITNESS, CV_SHAPES, R_DEFAULT,
  capacityForFlow, deviationOpening, gainRange, inherent, inherentInverse,
  inherentSlope, installedFlow, installedFlowSlope, installedTurndown, loopGain,
  maxFlowOfCapacity, minControllableFlow, openingForFlow, quadraticityRatio, readLine,
  readPsatWater, sizeValve, splitAt, waterCase, waterTemperatureText, type Shape,
} from "../src/ui/methods/controlValveMath.js";
import {
  CV_LIMITS, CV_QUIZ, CV_STEPS, FAIL_SERVICES,
} from "../src/ui/methods/controlValveLesson.js";
import { ControlValveTool } from "../src/ui/methods/ControlValveTool.js";
import { findPumpSystemSweep, PUMP_WITNESS } from "../src/ui/methods/PumpSystemTool.js";
import { cavitationIndex, chokedLiquidDrop, liquidRegime } from "../src/ui/methods/letdown.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { LETDOWN_STEPS } from "../src/ui/methods/letdownLesson.js";
import { BODE_STEPS } from "../src/ui/methods/bodeLesson.js";
import { PUMP_STEPS } from "../src/ui/methods/pumpSystemLesson.js";
import { witnessOutput } from "./witnessRead.js";

const REPO_CASE = "tutorials/steady/hydraulics/pumpSystem01_operating_point";

describe("control-valve: the installed flow is the series circuit", () => {
  it("equals the numerical solution of P_t = kQ^2 + Q^2/Cv^2", () => {
    // a line k and a valve Cv_max fix a; compare at several f
    const k = 3.0, CvMax = 0.8, Pt = 10;
    const Qmax = Math.sqrt(Pt / (k + 1 / (CvMax * CvMax)));
    const a = (Qmax * Qmax / (CvMax * CvMax)) / Pt;
    for (const f of [0.05, 0.2, 0.5, 0.8, 1]) {
      const Cv = f * CvMax;
      // bisection on the circuit equation, independent of the closed form
      let lo = 0, hi = 10;
      for (let i = 0; i < 200; i++) {
        const Q = (lo + hi) / 2;
        const need = k * Q * Q + Q * Q / (Cv * Cv);
        if (need < Pt) lo = Q; else hi = Q;
      }
      expect(installedFlow(f, a)).toBeCloseTo(((lo + hi) / 2) / Qmax, 9);
    }
  });

  it("is f at authority 1 and flat as the authority falls", () => {
    for (const f of [0.1, 0.5, 0.9]) {
      expect(installedFlow(f, 1)).toBeCloseTo(f, 12);
      expect(installedFlow(f, 1e-6)).toBeCloseTo(1, 3);
    }
    expect(installedFlow(1, 0.3)).toBeCloseTo(1, 12);
  });

  it("has the analytic slope a central difference gives", () => {
    for (const a of [0.1, 0.5, 0.9]) for (const f of [0.1, 0.4, 0.9]) {
      const h = 1e-6;
      const fd = (installedFlow(f + h, a) - installedFlow(f - h, a)) / (2 * h);
      expect(installedFlowSlope(f, a)).toBeCloseTo(fd, 6);
    }
  });

  it("the loop gain is the analytic slope of the installed curve in x, for every shape", () => {
    for (const s of CV_SHAPES) for (const a of [0.2, 1]) for (const x of [0.2, 0.5, 0.9]) {
      const h = 1e-6;
      const fd = (installedFlow(inherent(s, x + h, R_DEFAULT), a)
        - installedFlow(inherent(s, x - h, R_DEFAULT), a)) / (2 * h);
      expect(loopGain(s, x, a, R_DEFAULT)).toBeCloseTo(fd, 5);
    }
    for (const s of CV_SHAPES) {
      const x = 0.4, h = 1e-6;
      expect(inherentSlope(s, x, R_DEFAULT))
        .toBeCloseTo((inherent(s, x + h, R_DEFAULT) - inherent(s, x - h, R_DEFAULT)) / (2 * h), 5);
    }
  });
});

describe("control-valve: the hand-checked gain ratios (x = 0.1 to 1)", () => {
  const table: [Shape, number, number][] = [
    ["linear", 1, 1.0], ["linear", 0.5, 2.8], ["linear", 0.2, 10.5],
    ["equalPercentage", 1, 33.8], ["equalPercentage", 0.2, 6.5], ["equalPercentage", 0.1, 4.4],
  ];
  for (const [s, a, expected] of table) {
    it(`${s} at a = ${a}: ${expected}`, () => {
      expect(gainRange(s, a, 50).ratio).toBeGreaterThan(expected - 0.06);
      expect(gainRange(s, a, 50).ratio).toBeLessThan(expected + 0.06);
    });
  }
  it("the linear valve is flattest with a stiff source, equal percentage with a hungry line", () => {
    expect(gainRange("linear", 1, 50).ratio).toBeLessThan(gainRange("equalPercentage", 1, 50).ratio);
    expect(gainRange("equalPercentage", 0.1, 50).ratio).toBeLessThan(gainRange("linear", 0.1, 50).ratio);
  });
  it("half-travel flows of the commission: linear a = 0.2 gives 0.791, equal percentage 0.304", () => {
    expect(installedFlow(inherent("linear", 0.5, 50), 0.2)).toBeCloseTo(0.791, 3);
    expect(installedFlow(inherent("equalPercentage", 0.5, 50), 0.2)).toBeCloseTo(0.304, 3);
  });
});

describe("control-valve: inverses, deviation point, turndown", () => {
  it("the opening a flow demands reproduces the flow", () => {
    for (const s of CV_SHAPES) for (const a of [0.2, 0.6, 1]) for (const q of [0.3, 0.6, 0.95]) {
      const x = openingForFlow(s, q, a, 50);
      if (x === null || x <= 0 || x >= 1) continue;
      expect(installedFlow(inherent(s, x, 50), a)).toBeCloseTo(q, 9);
    }
    expect(capacityForFlow(0.5, 1)).toBeCloseTo(0.5, 12);
  });

  it("the deviation opening is where the installed flow is exactly 10 % above the promise", () => {
    for (const s of CV_SHAPES) for (const a of [0.1, 0.3, 0.6]) {
      const x = deviationOpening(s, a, 50, 0.1);
      expect(x).not.toBeNull();
      if (x !== null && x > 0 && x < 1) {
        const f = inherent(s, x, 50);
        expect(installedFlow(f, a) / f).toBeCloseTo(1.1, 6);
      }
    }
    expect(deviationOpening("linear", 1, 50)).toBeNull();
    expect(deviationOpening("linear", 0.9, 50)).toBeNull();
  });

  it("a small valve cannot carry a flow above its own wide-open flow", () => {
    expect(openingForFlow("linear", 0.9, 0.5, 50, 0.3)).toBeNull();
    expect(maxFlowOfCapacity(0.5, 0.3)).toBeCloseTo(installedFlow(0.3, 0.5), 12);
  });

  it("a starting valve widens the installed turndown", () => {
    const big = installedTurndown("equalPercentage", 0.3, 50, 0.1, 1);
    const small = installedTurndown("equalPercentage", 0.3, 50, 0.1, 0.3);
    expect(small).toBeGreaterThan(big);
    expect(minControllableFlow("linear", 0.3, 50, 0.1, 0.3))
      .toBeLessThan(minControllableFlow("linear", 0.3, 50, 0.1, 1));
  });

  it("splits the budget so line + valve = P_t, the valve largest at small flow", () => {
    const s0 = splitAt(7e4, 0.4, 0.2), s1 = splitAt(7e4, 0.4, 1);
    expect(s0.line + s0.valve).toBeCloseTo(7e4, 6);
    expect(s1.valve).toBeCloseTo(0.4 * 7e4, 6);   // wide open: a P_t
    expect(s0.valve).toBeGreaterThan(s1.valve);
    expect(inherentInverse("equalPercentage", 1, 50)).toBeCloseTo(1, 12);
  });
});

describe("control-valve: the authority from the engine's pump and line", () => {
  const csv = witnessOutput(REPO_CASE, "sweep_pumpSystem.csv");
  const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": csv });

  it("the witness is the pump-and-system case the page names", () => {
    expect(CV_LINE_WITNESS).toBe(PUMP_WITNESS);
    expect(sweep).not.toBeNull();
  });

  it("a at the rated 0.8 kmol/s is (pump rise - system drop)/(pump rise - elevation) of the CSV row", () => {
    const rated = readLine(sweep, 0.8)!;
    const i = sweep!.F.findIndex((f) => Math.abs(f - 0.8) < 1e-9);
    expect(i).toBeGreaterThanOrEqual(0);
    const dP = sweep!.pumpDP[i]!, sys = sweep!.systemDP[i]!;
    const elev = sweep!.columns["P1.dP_elevation"]![i]!;
    const sz = sizeValve(rated)!;
    expect(sz.a).toBeCloseTo((dP - sys) / (dP - elev), 12);
    expect(sz.a).toBeGreaterThan(0.3);
    expect(sz.a).toBeLessThan(0.7);
    expect(sz.dpValveOpen + rated.lineLoss + rated.elevation).toBeCloseTo(rated.pumpDP, 6);
  });

  it("the authority falls as the rated flow rises, and no valve fits past the crossing", () => {
    const a = (F: number) => sizeValve(readLine(sweep, F))?.a;
    expect(a(0.5)!).toBeGreaterThan(a(0.8)!);
    expect(a(0.8)!).toBeGreaterThan(a(0.9)!);
    expect(a(1.2)).toBeUndefined();
  });

  it("the engine's pump has constant power: its rise is higher at the minimum flow", () => {
    const rated = readLine(sweep, 0.8)!, low = readLine(sweep, 0.4)!;
    expect(low.pumpDP).toBeGreaterThan(rated.pumpDP);
    expect(low.pumpDP * low.F).toBeCloseTo(rated.pumpDP * rated.F, -1);
  });

  it("the line loss is nearly quadratic in the flow, and not exactly", () => {
    const q = quadraticityRatio(readLine(sweep, 0.8)!, readLine(sweep, 0.4)!);
    expect(q).toBeGreaterThan(0.85);
    expect(q).toBeLessThan(1.0);
  });

  it("the pressure at the pump inlet is the feed's, as the case declares it", () => {
    const feed = tutorialByName(CV_LINE_WITNESS)!.files.rawFiles!["0/feed"]!;
    const m = /^P\s+([0-9.eE+-]+)\s*Pa\s*;/m.exec(feed)!;
    expect(readLine(sweep, 0.8)!.P_in).toBeCloseTo(Number(m[1]), -2);
  });
});

describe("control-valve: the water temperature edit", () => {
  it("moves the first state's T and no other line, on the real props witness", () => {
    const base = tutorialByName(CV_PROPS_WITNESS)!.files.rawFiles!["system/propsDict"]!;
    const moved = waterCase(300).rawFiles!["system/propsDict"]!;
    const a = base.split("\n"), b = moved.split("\n");
    expect(b.length).toBe(a.length);
    const changed = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
    expect(changed.length).toBe(1);
    expect(b[changed[0]!]).toMatch(/state\s*\{\s*T\s+300\s+K;/);
    expect(a[changed[0]!]).toMatch(/state\s*\{\s*T\s+350\s+K;/);
    expect(a[changed[0]!]).toContain("P 1 bar");
    expect(base).toContain(CV_PROPS_OP);
  });

  it("the edit is refused by name when the declaration is not there", () => {
    expect(() => waterTemperatureText("operations ( );", 300)).toThrow(/first state/);
  });

  it("reads Psat_water from an operation result, and nothing else", () => {
    const r = { operationResults: [{ name: CV_PROPS_OP, diagnostics: { Psat_water: 3536 } }] } as never;
    expect(readPsatWater(r)).toBe(3536);
    expect(readPsatWater({ operationResults: [] } as never)).toBeUndefined();
    expect(readPsatWater(null)).toBeUndefined();
  });
});

describe("control-valve: card 6 uses letdown.ts", () => {
  it("water at 300 K with a small pump is neither choked nor cavitating; a large head chokes at small flow", () => {
    const Pv = 3.5e3, Pc = 220.64e5, FL = 0.9, P2 = 1e5;
    const small = P2 + 0.9e5;
    expect(liquidRegime(small, P2, Pv, FL)).toBe("neither");
    expect(chokedLiquidDrop(small, Pv, Pc, FL)).toBeGreaterThan(0.9e5);
    const big = P2 + 14e5;
    expect(chokedLiquidDrop(big, Pv, Pc, FL)).toBeLessThan(14e5);
    expect(cavitationIndex(big, P2, Pv)).toBeGreaterThan(0.95);
  });
  it("the tool imports its choking arithmetic from letdown.ts, not a second home", () => {
    const src = readFileSync(
      new URL("../src/ui/methods/ControlValveTool.tsx", import.meta.url), "utf-8") as string;
    expect(src).toMatch(/from "\.\/letdown\.js"/);
    expect(src).not.toMatch(/function chokedLiquidDrop|0\.96 - 0\.28/);
  });
});

describe("control-valve: the lesson", () => {
  const all = CV_STEPS.flatMap((s) => [s.title, s.body, s.note ?? ""]).join(" ")
    + FAIL_SERVICES.map((f) => f.pull).join(" ");

  it("seven steps, numbered 1..7, a quiz over real steps, five limits", () => {
    expect(CV_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const q of CV_QUIZ) for (const n of q.steps) expect(CV_STEPS.some((s) => s.n === n)).toBe(true);
    expect(CV_LIMITS.length).toBe(5);
  });

  it("every equation parses and every formula symbol is glossed", () => {
    for (const s of CV_STEPS) {
      if (s.formula) { expect(texParses(s.formula)).toBe(true); expect((s.where ?? []).length).toBeGreaterThan(0); }
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq)).toBe(true);
    }
  });

  it("the derivation is four lines", () => {
    expect(CV_STEPS[0]!.derivation!.length).toBe(4);
  });

  it("cites no source: no URL, no DOI, no standard number, no quotation mark", () => {
    expect(all).not.toMatch(/https?:|doi\.org|10\.\d{4}\/|IEC ?\d|ISA-?\d|"/);
  });

  it("each leadsTo lands on a live tool and a step it has", () => {
    const steps: Record<string, readonly { title: string }[]> = {
      bode: BODE_STEPS, letdown: LETDOWN_STEPS, "pump-system": PUMP_STEPS,
    };
    for (const s of CV_STEPS) if (s.leadsTo) {
      const t = METHOD_TOOLS.find((m) => m.id === s.leadsTo!.tool);
      expect(t?.status).toBe("live");
      expect(t!.label.toLowerCase()).toContain(s.leadsTo.toolLabel.toLowerCase());
      expect(steps[s.leadsTo.tool]!.some((x) => x.title.startsWith(s.leadsTo!.stepTitle))).toBe(true);
    }
  });

  it("the fail cards cover six services, three actions each, and say they are authored", () => {
    expect(FAIL_SERVICES.length).toBe(6);
    for (const f of FAIL_SERVICES) {
      for (const k of ["open", "closed", "inPlace"] as const) expect(f.consequence[k].length).toBeGreaterThan(20);
      expect(METHOD_TOOLS.some((m) => m.id === f.tool)).toBe(true);
    }
    expect(CV_STEPS[6]!.body).toMatch(/AUTHORED/);
    expect(CV_STEPS[6]!.body).toMatch(/nothing here is computed/);
  });

  it("is registered live on the Hydraulics & control shelf with a Theory Guide label that exists", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "control-valve")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe("Hydraulics & control");
    const tex = readFileSync(
      new URL("../../docs/theoryGuide.tex", import.meta.url), "utf-8") as string;
    expect(tex).toContain(`\\label{${t.theory}}`);
  });
});

describe("control-valve: the page renders", () => {
  it("renders every card, with the authored badge, without NaN or undefined", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(ControlValveTool)));
    for (const c of ["series", "inherent", "installed", "gain", "rangeability", "choke", "fail"])
      expect(html).toContain(`data-cv-card="${c}"`);
    expect(html).toContain("data-cv-authored");
    expect(html).not.toMatch(/NaN|undefined/);
    expect(html).toContain("Why does a correctly sized valve still control badly?");
  });
});
