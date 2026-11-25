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
  compressorChoice -- "Which compressor, and how far can I turn it down?"
  (C510), held to what it claims about itself:

    * the machine chart the page draws is the ENGINE's: it is read from the
      design sheets this tree's native build wrote (compressor03 and the
      make-up compressor of ammonia02), and the page's copy of the selection
      rule reproduces the engine's own pick, and its own words (the region's
      cell, the inlet flow in m3/h), on both;
    * the rule's three branches (inside a region, below the chart, outside it)
      and the overlap tie-break are exercised on constructed points;
    * the recorded plant points are held to the same rule;
    * the ceiling and the recycle arithmetic are checked against compression.ts's
      own `stage` (the driver ceiling reproduces the driver rating) and by the
      mass balance;
    * the feed the page scales for card 5 is the feed the witness declares;
    * the lesson: every equation parses, each leadsTo exists, the registry entry
      is live, the grid has its seven questions and four machines, and the page
      renders with no NaN or "undefined".

  WHAT THIS CANNOT PROVE: that the browser's WASM run gives the sheet this tree's
  native binary wrote (same C++), nor any teaching judgement, nor that a grid
  cell is right (it is authored and says so).
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { findDesignSheet } from "../src/case/designSheet.js";
import { COMPRESSION_REAL_UNIT, COMPRESSION_UNIT, readCompressionSheet, stage, staged } from "../src/ui/methods/compression.js";
import {
  CFM_PER_M3S, antiSurge, cfmFromM3h, driverCeilingRatio, eligible, enginePick, m3hFromCfm, readChart,
  readDuty, rMaxAt, shutOffRatio, suctionMix, swapGas, type Chart,
} from "../src/ui/methods/compressorChoiceMath.js";
import {
  CC_LIMITS, CC_QUIZ, CC_STEPS, GRID, GRID_MACHINES, GRID_QUESTIONS,
} from "../src/ui/methods/compressorChoiceLesson.js";
import { OVERPRESSURE_STEPS } from "../src/ui/methods/overpressureLesson.js";
import { PLANT_COMPRESSORS } from "../src/ui/methods/compressorChoicePlant.js";
import { AIR_FEED_KMOL_H, AIR_FEED_T, CompressorChoiceTool } from "../src/ui/methods/CompressorChoiceTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { witnessOutputFiles } from "./witnessRead.js";

const AIR = "tutorials/steady/rotating/compressor03_staged_design";
const REAL = "tutorials/plant/ammonia02_full_plant";

function runOf(caseDir: string, sub: string, unit: string) {
  const files: { [rel: string]: string } = {};
  for (const [rel, text] of witnessOutputFiles(caseDir, `design/${sub}`))
    files[`design/${sub}/${rel}`] = text;
  const sheet = readCompressionSheet(files, unit);
  if ("error" in sheet) throw new Error(sheet.error);
  const ds = findDesignSheet(files, unit, "compressor");
  if (!ds || !ds.compressor) throw new Error(`no compressor block for ${unit}`);
  const duty = readDuty(ds.compressor, sheet);
  if ("error" in duty) throw new Error(duty.error);
  const chart = readChart(ds.compressor);
  if ("error" in chart) throw new Error(chart.error);
  const driver = ds.sizing.find((s) => s.key === "driverRating")!.value;
  return { sheet, ds, c: ds.compressor, duty, chart, driver };
}
let airMemo: ReturnType<typeof runOf> | undefined, realMemo: ReturnType<typeof runOf> | undefined;
const air = () => airMemo ??= runOf(AIR, "compressor1", COMPRESSION_UNIT);
const real = () => realMemo ??= runOf(REAL, "makeupComp", COMPRESSION_REAL_UNIT);

describe("compressor-choice: the chart is the engine's", () => {
  it("the sheet publishes the four regions, in the engine's order, and both runs publish the same chart", () => {
    expect(air().chart.regions.map((r) => r.machine)).toEqual(["centrifugal", "axial", "screw", "reciprocating"]);
    expect(real().chart.regions).toEqual(air().chart.regions);
  });

  for (const which of ["air", "real"] as const) {
    it(`the page's rule reproduces the engine's own pick and words (${which})`, () => {
      const r = which === "air" ? air() : real();
      const pick = enginePick(r.chart, r.duty.cfm, r.duty.ratio);
      expect(pick.machine).toBe(r.c.machine);
      // the engine's sentence names the cfm, the m3/h and the ratio the page recomputes
      const text = r.c.selection;
      expect(text).toContain(`inlet ${Math.round(r.duty.cfm)} cfm`);
      const m3h = Number(/\(([0-9.e+]+) m3\/h\)/.exec(text)![1]);
      expect(Math.abs(m3hFromCfm(r.duty.cfm) / m3h - 1)).toBeLessThan(1e-3);
      if (pick.how === "region") {
        const cell = r.chart.regions.find((x) => x.machine === pick.machine)!.cell;
        expect(text).toContain(`'${cell}'`);
      }
    });
  }

  it("the conversion constant is the one the engine's sentence implies", () => {
    const a = air();
    // engine: Q [m3/s] * CFM_PER_M3S = cfm, and the sentence prints Q*3600 in m3/h
    const m3h = Number(/\(([0-9.e+]+) m3\/h\)/.exec(a.c.selection)![1]);
    expect(Math.abs(cfmFromM3h(m3h) / a.duty.cfm - 1)).toBeLessThan(1e-3);
    expect(CFM_PER_M3S).toBeCloseTo(2118.88, 1);
  });

  it("the sheet carries the rule in words, so the page does not invent it", () => {
    const notes = air().c.notes.join(" ");
    for (const frag of ["tie-break", "1.4", "reciprocating", "log-log"])
      expect(notes.includes(frag), `the sheet does not say: ${frag}`).toBe(true);
  });
});

describe("compressor-choice: the rule's branches, on constructed points", () => {
  const chart = (): Chart => air().chart;
  it("inside one region", () => {
    const p = enginePick(chart(), 5e3, 8);
    expect(p).toMatchObject({ machine: "centrifugal", how: "region" });
    expect(p.candidates).toEqual(["centrifugal"]);
  });
  it("an overlap goes to the first region of the list", () => {
    // 5e2 cfm, ratio 5: screw (126..2150, to 12.4) and reciprocating (100..1000) both hold it
    const e = eligible(chart(), 5e2, 5);
    expect(e).toEqual(["screw", "reciprocating"]);
    expect(enginePick(chart(), 5e2, 5).machine).toBe("screw");
  });
  it("below ratio 1.4 the first machine whose flow range holds the flow", () => {
    expect(enginePick(chart(), 5e3, 1.2)).toMatchObject({ machine: "centrifugal", how: "belowChart" });
    expect(enginePick(chart(), 5e4, 1.2)).toMatchObject({ machine: "axial", how: "belowChart" });
  });
  it("above every region's ratio: reciprocating; beyond 1e6 cfm: refused", () => {
    expect(enginePick(chart(), 5e3, 60)).toMatchObject({ machine: "reciprocating", how: "outside" });
    expect(enginePick(chart(), 2e6, 4)).toMatchObject({ machine: null, how: "beyondFlow" });
  });
  it("the upper edge is a straight line on the log-log axes between the corners", () => {
    const c = chart().regions[0]!;
    expect(rMaxAt(c, c.QminCfm)).toBeCloseTo(c.rMaxAtQmin, 9);
    expect(rMaxAt(c, c.QmaxCfm)).toBeCloseTo(c.rMaxAtQmax, 9);
    const mid = Math.sqrt(c.QminCfm * c.QmaxCfm);
    expect(rMaxAt(c, mid)).toBeCloseTo(Math.sqrt(c.rMaxAtQmin * c.rMaxAtQmax), 9);
  });
});

describe("compressor-choice: the recorded plant points", () => {
  it("each point's pick, by the page's rule on the engine's chart, is the machine the engine named", () => {
    for (const p of PLANT_COMPRESSORS)
      expect(enginePick(air().chart, p.cfm, p.ratio).machine, p.name).toBe(p.machine);
  });
  it("there are four, and the one below the chart's lowest edge is the recycle compressor", () => {
    expect(PLANT_COMPRESSORS.map((p) => p.name)).toEqual(["N2Boost", "MakeupComp1", "MakeupComp2", "RecycleComp"]);
    expect(PLANT_COMPRESSORS.filter((p) => p.ratio < 1.4).map((p) => p.name)).toEqual(["RecycleComp"]);
  });
});

describe("compressor-choice: card 1, the same machine for two gases", () => {
  it("the two engine duties differ in molar mass by a factor above three but in volume and ratio by far less", () => {
    const a = air().duty, r = real().duty;
    expect(a.MW / r.MW).toBeGreaterThan(3);
  });
  it("the swap's mass flow follows the density, the head the molar mass the other way", () => {
    const a = air().duty, r = real().duty;
    const s = swapGas(a, { MW: r.MW, n: r.n, Z: r.Z, etaP: r.etaP });
    expect(s.mdot).toBeLessThan(a.mdot);                 // a lighter gas weighs less at the same volume
    expect(s.head).toBeGreaterThan(a.head1);             // and asks more head per kilogram
    // swapping a gas for itself returns the air machine's own first section to ~the engine's number
    const self = swapGas(a, { MW: a.MW, n: a.n, Z: a.Z, etaP: a.etaP });
    expect(self.mdot / a.mdot).toBeGreaterThan(0.9);
    expect(self.mdot / a.mdot).toBeLessThan(1.1);
  });
  it("the algebra of step 1: W = P1 Q (r^m - 1) / (m etaP), with the density of the real gas", () => {
    const d = air().duty;
    const m = (d.n - 1) / d.n;
    const R = 8314.462618;
    const Q = d.m3h / 3600, rho = d.P1 * d.MW / (d.Z * R * d.T1);
    const s = stage({ T1: d.T1, r: d.ratio, n: d.n, Z: d.Z, MW: d.MW, mdot: rho * Q, etaP: d.etaP, mech: 0 });
    const closed = d.P1 * Q * (Math.pow(d.ratio, m) - 1) / (m * d.etaP);
    expect(Math.abs(s.Wgas / closed - 1)).toBeLessThan(1e-12);
  });
});

describe("compressor-choice: card 4, the ceiling", () => {
  it("at the driver ceiling, the staged shaft power is the driver rating, and the design ratio sits below it", () => {
    const a = air();
    const rmax = driverCeilingRatio(a.duty, a.driver);
    const w = staged({ N: a.duty.nStages, Tcool: a.duty.Tcool, T1: a.duty.T1, P1: a.duty.P1, P2: a.duty.P1 * rmax,
      n: a.duty.n, Z: a.duty.Z, MW: a.duty.MW, mdot: a.duty.mdot, etaP: a.duty.etaP, mech: a.duty.mech }).Wshaft / 1000;
    expect(Math.abs(w / a.driver - 1)).toBeLessThan(1e-9);
    expect(rmax).toBeGreaterThan(a.duty.ratio);          // the 110 % margin leaves room above the design
    expect(rmax).toBeLessThan(a.duty.ratio * 1.5);       // and not far: the 110 % margin buys a quarter of ratio here
  });
  it("at the engine's design ratio the page's staging reproduces the engine's shaft power", () => {
    const a = air();
    const w = staged({ N: a.duty.nStages, Tcool: a.duty.Tcool, T1: a.duty.T1, P1: a.duty.P1, P2: a.duty.P2,
      n: a.duty.n, Z: a.duty.Z, MW: a.duty.MW, mdot: a.duty.mdot, etaP: a.duty.etaP, mech: a.duty.mech }).Wshaft / 1000;
    expect(Math.abs(w / a.duty.powerShaft - 1)).toBeLessThan(0.02);
  });
  it("a shut-off head multiple of one is the design ratio; a larger one is higher", () => {
    const d = air().duty;
    expect(shutOffRatio(d, 1)).toBeCloseTo(d.ratio, 9);
    expect(shutOffRatio(d, 1.2)).toBeGreaterThan(d.ratio);
  });
});

describe("compressor-choice: card 5, the recycle", () => {
  it("a demand above the floor needs no recycle; below it the recycle is the difference", () => {
    expect(antiSurge(0.9, 0.7, 0.1)).toMatchObject({ total: 0.9, recycle: 0, share: 0 });
    const r = antiSurge(0.5, 0.7, 0.1);
    expect(r.total).toBeCloseTo(0.77, 12);
    expect(r.recycle).toBeCloseTo(0.27, 12);
    expect(r.share).toBeCloseTo(0.27 / 0.77, 12);
    // the mass balance at the suction: delivered + recycle = what the machine passes
    expect(r.demand + r.recycle).toBeCloseTo(r.total, 12);
  });
  it("never above the design flow", () => {
    expect(antiSurge(0.2, 0.95, 0.2).total).toBe(1);
  });
  it("the mixed suction temperature is bracketed by the fresh gas and the recycle", () => {
    expect(suctionMix(0, 300, 450)).toBe(300);
    expect(suctionMix(1, 300, 450)).toBe(450);
    const t = suctionMix(0.35, 300, 450);
    expect(t).toBeGreaterThan(300);
    expect(t).toBeLessThan(450);
  });
  it("the feed the page scales is the feed the witness declares", () => {
    const feed = readFileSync(`../${AIR}/0/feed`, "utf-8");
    expect(feed).toMatch(new RegExp(`N2\\s+${AIR_FEED_KMOL_H.N2.toFixed(1)}\\s+kmol/h`));
    expect(feed).toMatch(new RegExp(`O2\\s+${AIR_FEED_KMOL_H.O2.toFixed(1)}\\s+kmol/h`));
    expect(feed).toMatch(new RegExp(`\\bT\\s+${AIR_FEED_T}\\s+K`));
    // each override key is unique in the file, so the page's override cannot refuse
    for (const k of ["N2", "O2", "T"])
      expect(feed.match(new RegExp(`^\\s*${k}\\s`, "gm"))?.length, k).toBe(1);
  });
});

describe("compressor-choice: the lesson", () => {
  const steps = CC_STEPS;
  it("every equation parses, and the five steps are numbered 1..5", () => {
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    for (const s of steps) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n} formula`).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), `step ${s.n} symbol ${w.sym}`).toBe(true);
    }
  });
  it("the lesson never copies a corner of the engine's chart into prose", () => {
    const text = steps.map((s) => `${s.body} ${s.note ?? ""}`).join(" ");
    for (const r of air().chart.regions)
      for (const v of [r.QminCfm, r.QmaxCfm, r.rMaxAtQmin, r.rMaxAtQmax])
        expect(new RegExp(`(^|[^0-9.])${String(v).replace(".", "\\.")}([^0-9]|$)`).test(text),
          `the lesson states the corner ${v}`).toBe(false);
  });
  it("the step-4 link names a step the overpressure lesson has", () => {
    const lt = steps.find((s) => s.n === 4)!.leadsTo!;
    expect(lt.tool).toBe("overpressure");
    expect(OVERPRESSURE_STEPS.some((s) => s.title === lt.stepTitle)).toBe(true);
  });
  it("the grid answers seven questions for four machines, each cell with a reason, and is marked authored", () => {
    expect(GRID_QUESTIONS).toHaveLength(7);
    expect(GRID_MACHINES).toHaveLength(4);
    for (const q of GRID_QUESTIONS)
      for (const m of GRID_MACHINES) {
        expect(GRID[q.id][m].why.length, `${q.id}:${m}`).toBeGreaterThan(20);
        expect(["favoured", "neutral", "against"]).toContain(GRID[q.id][m].favour);
      }
    expect(steps.find((s) => s.n === 3)!.body).toContain("AUTHORED");
  });
  it("the limits name the missing characteristic map, and the quiz points at steps that exist", () => {
    expect(CC_LIMITS.some((l) => l.id === "no-map")).toBe(true);
    for (const q of CC_QUIZ) for (const n of q.steps) expect(steps.some((s) => s.n === n)).toBe(true);
  });
  it("the registry entry is live, on the Hydraulics & control shelf, with its theory anchor", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "compressor-choice")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe("Hydraulics & control");
    expect(t.theory).toBe("sec:compressor-choice");
  });
});

describe("compressor-choice: the page renders", () => {
  it("renders every card, with the authored badge, without NaN or undefined", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(CompressorChoiceTool)));
    for (const c of ["duty", "chart", "grid", "ceiling", "recycle"])
      expect(html).toContain(`data-cc-card="${c}"`);
    expect(html).toContain("data-cc-authored");
    expect(html).not.toMatch(/NaN|undefined/);
    expect(html).toContain("Which compressor, and how far can I turn it down?");
  });
});
