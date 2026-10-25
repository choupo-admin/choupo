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
  "Secondary containment: designing a bund" (DEV.md 4c C136).  Pinned:
    * THE ENGINE'S TWIN: every `pin(...)` line below is read by
      bin/curate/check_bund_arithmetic.py, which compiles the SAME call
      against src/postProcessing/layout/BundArithmetic.H and requires the
      C++ to give the number pinned here.  The `green_*` pins are the
      green-ammonia witness's bund, and that gate also holds them to the
      witness's own golden rows and layoutDict.  Keep one pin per line.
    * volume conservation in the four scenarios, and what each must do;
    * geometric against net against useful capacity, the slope, the
      freeboard and the engine's safe-side margin, closed forms;
    * tank displacement: taller than the wall, submerged, on legs, on a
      solid plinth;
    * overtopping and the limit cases: an empty bund, zero rain;
    * Vitor's exercise: 20, 15 and 10 m3, dry and after rain;
    * the lesson text: nothing quoted, every equation parses, every cited
      line is the one it names, every pointer lands, every unread source
      says so, the closing reflection is Vitor's verbatim;
    * the page renders, with no NaN.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CLOSING_REFLECTION, EXERCISE_BUND, EXERCISE_RAIN_M, EXERCISE_TANKS, RULES,
  applyRule, area, depthAllowance, designCheck, displacedBox, displacedLying,
  displacedStanding, drainFlow, floorVolume, footprint, freeVolume, grossVolume,
  hsg176WallClearance, levelOf, poolArea, problems, requiredVolume, scenarioDefaults,
  shellHeight, simulate, termVolume, wallForEngineRule, wallLoad, G_N,
  type Bund, type ScenarioInput, type Tank,
} from "../src/ui/methods/bund.js";
import { BUND_LIMITS, BUND_SOURCES, BUND_STEPS } from "../src/ui/methods/bundLesson.js";
import { BundTool, BUND_TITLE } from "../src/ui/methods/BundTool.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { SAFETY_STEPS as PROCESS_SAFETY_STEPS } from "../src/ui/methods/processSafetyLesson.js";
import { POOL_STEPS } from "../src/ui/methods/poolFireLesson.js";
import { MATERIALS_STEPS } from "../src/ui/methods/materialsLesson.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const relErr = (a: number, b: number): number =>
  b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b);

/** One pinned example of the engine's twin: the value the TypeScript gives,
 *  and the number check_bund_arithmetic holds the C++ to. */
function pin(name: string, value: number, expected: number): void {
  expect(relErr(value, expected), name).toBeLessThan(1e-14);
}

describe("the engine's twin: pinned examples (check_bund_arithmetic reads these lines)", () => {
  it("a standing cylinder", () => {
    pin("standing_tall", displacedStanding(2.6, 0, 4, 0.55), 2.9201103715117132);
    pin("standing_short", displacedStanding(1.0, 0, 0.4, 0.55), 0.31415926535897931);
    pin("standing_legs", displacedStanding(2.0, 0.3, 2.0, 0.55), 0.78539816339744850);
    pin("standing_above", displacedStanding(2.0, 0.6, 2.0, 0.55), 0);
  });
  it("a lying cylinder", () => {
    pin("lying_half", displacedLying(2.0, 5.0, 0, 1.0), 7.8539816339744828);
    pin("lying_partial", displacedLying(2.0, 5.0, 0.2, 0.55), 1.8462732753924733);
    pin("lying_full", displacedLying(1.5, 4.0, 0, 3.0), 7.0685834705770345);
  });
  it("the green-ammonia witness's tank-farm bund", () => {
    pin("green_box", displacedBox(34, 34, 0, 20, 4), 4624);
    pin("green_gross", grossVolume(7480, 4), 29920);
    pin("green_net", grossVolume(7480, 4) - 2 * displacedBox(34, 34, 0, 20, 4), 20672);
    pin("green_term", termVolume(1.1, true, 17897.6025908, 35795.2051815), 19687.362849880003);
    pin("green_rain", depthAllowance(0.1, 7480), 748);
    pin("green_required", requiredVolume(termVolume(1.1, true, 17897.6025908, 35795.2051815), depthAllowance(0.1, 7480)), 20435.362849880003);
  });
  it("the rule's other branches", () => {
    pin("term_total", termVolume(0.25, false, 20, 45), 11.25);
    pin("required_none", requiredVolume(-1, 0), 0);
  });
  it("closed forms the pins agree with", () => {
    expect(displacedStanding(2.6, 0, 4, 0.55)).toBeCloseTo(Math.PI * 2.6 * 2.6 / 4 * 0.55, 13);
    expect(displacedLying(2.0, 5.0, 0, 1.0)).toBeCloseTo(Math.PI / 2 * 5, 13);
    expect(displacedLying(1.5, 4.0, 0, 3.0)).toBeCloseTo(Math.PI * 1.5 * 1.5 / 4 * 4, 13);
  });
});

const T = EXERCISE_TANKS;
const B0 = EXERCISE_BUND;
const R110 = RULES.find((r) => r.id === "110-25")!;
const allIntact = T.map(() => true);

function run(over: Partial<ScenarioInput>, b: Bund = B0, tanks: readonly Tank[] = T) {
  return simulate({ ...scenarioDefaults(b, tanks, "T1"), ...over });
}
const last = (r: ReturnType<typeof simulate>) => r.points[r.points.length - 1]!;
const sum = (p: ReturnType<typeof last>) => p.inTank + p.inBund + p.overtopped + p.drained;

describe("volume conservation in the four scenarios", () => {
  it("A, a rupture: all of it in the bund at once, nothing lost", () => {
    const r = run({ kind: "rupture" });
    expect(r.imbalance).toBeLessThan(1e-9);
    expect(r.points[0]!.inBund).toBe(20);
    expect(last(r).overtopped).toBe(0);
    // the level is V0 over the free area, the failing footprint left free
    const free = area(B0) - footprint(T[1]!) - footprint(T[2]!);
    expect(last(r).level).toBeCloseTo(20 / free, 10);
  });
  it("A on a low wall: what does not fit overtops, and the balance still closes", () => {
    const low = { ...B0, wall: 0.3 };
    const r = run({ kind: "rupture" }, low);
    const cap = freeVolume(low, T, [false, true, true], 0.3);
    expect(last(r).level).toBe(0.3);
    expect(last(r).overtopped).toBeCloseTo(20 - cap, 10);
    expect(sum(last(r))).toBeCloseTo(20, 10);
  });
  it("B, a leak: moves at the declared flow, stops when isolated, closes the balance", () => {
    const r = run({ kind: "leak", qStart: 30, qEnd: 30, leakEnd: 1, stopAt: 0.25, duration: 1, dt: 1 });
    expect(r.imbalance).toBeLessThan(1e-9);
    const at = (t: number) => r.points.find((p) => p.t >= t)!;
    expect(at(0.25).inBund).toBeCloseTo(7.5, 2);
    expect(last(r).inTank).toBeCloseTo(at(0.3).inTank, 12);
    expect(last(r).shellIntact).toBe(true);
  });
  it("B run to the end meets A: the leak joins the pool where the levels meet", () => {
    const a = run({ kind: "rupture" });
    const b = run({ kind: "leak", qStart: 60, qEnd: 60, duration: 1, dt: 1 });
    expect(last(b).shellIntact).toBe(false);
    expect(last(b).level).toBeCloseTo(last(a).level, 9);
    expect(b.imbalance).toBeLessThan(1e-9);
  });
  it("C, rain first: a bund that held on a dry day overtops", () => {
    const dry = run({ kind: "rupture" }, { ...B0, wall: 0.45 });
    const wet = run({ kind: "rupture", rainDepth: 0.1 }, { ...B0, wall: 0.45 });
    expect(last(dry).overtopped).toBe(0);
    expect(wet.rain).toBeCloseTo(5.5, 12);
    expect(last(wet).overtopped).toBeGreaterThan(0);
    expect(sum(last(wet))).toBeCloseTo(20 + 5.5, 10);
  });
  it("D, the drain open: the wall holds and the liquid leaves anyway", () => {
    const r = run({ kind: "leak", qStart: 30, qEnd: 10, drainOpen: true, drainDiameter: 0.1, duration: 1, dt: 1 });
    expect(r.imbalance).toBeLessThan(1e-9);
    expect(last(r).overtopped).toBe(0);
    expect(last(r).drained).toBeGreaterThan(15);
    expect(sum(last(r))).toBeCloseTo(20, 10);
  });
  it("the orifice law, and a dry bund passes nothing", () => {
    expect(drainFlow(0.61, 0.1, 0.5)).toBeCloseTo(0.61 * Math.PI * 0.01 / 4 * Math.sqrt(2 * G_N * 0.5), 14);
    expect(drainFlow(0.61, 0.1, 0)).toBe(0);
  });
});

describe("geometric, net and useful capacity", () => {
  it("the engine reading of the exercise bund, by hand", () => {
    const d = designCheck(B0, T, R110, "capacity", 0);
    const fp = T.reduce((s, t) => s + footprint(t), 0);
    expect(d.gross).toBeCloseTo(55 * 0.55, 12);
    expect(d.net).toBeCloseTo((55 - fp) * 0.55, 12);
    expect(d.required).toBe(22);
    expect(d.engineAdequate).toBe(true);
    expect(d.geometric).toBe(d.gross);
  });
  it("useful minus net is the failing tank's footprint times the wall (flat, no freeboard, no rain)", () => {
    const d = designCheck(B0, T, R110, "capacity", 0);
    expect(d.useful - d.net).toBeCloseTo(footprint(T[0]!) * 0.55, 12);
    expect(d.engineCredit).toBeCloseTo(footprint(T[0]!) * 0.55, 12);
    expect(d.failing).toBe("T1");
  });
  it("a sloped floor takes half the fall times the area; a freeboard takes the top", () => {
    const b = { ...B0, slope: 0.01 };
    expect(floorVolume(b, b.wall)).toBeCloseTo(55 * (0.55 - 0.11 / 2), 12);
    // a wedge before the far end is wet
    expect(floorVolume(b, 0.05)).toBeCloseTo(5 * 0.05 * 0.05 / (2 * 0.01), 12);
    const f = designCheck({ ...B0, freeboard: 0.1 }, T, R110, "capacity", 0);
    expect(f.useful).toBeCloseTo(freeVolume(B0, T, [false, true, true], 0.45), 12);
    // the engine reading ignores both, by construction
    expect(designCheck(b, T, R110, "capacity", 0).net).toBeCloseTo(designCheck(B0, T, R110, "capacity", 0).net, 12);
  });
  it("the basis: what a tank holds against its capacity", () => {
    const half = T.map((t) => ({ ...t, fill: 0.5 }));
    expect(designCheck(B0, half, R110, "held", 0).required).toBeCloseTo(11, 12);
    expect(designCheck(B0, half, R110, "capacity", 0).required).toBe(22);
  });
});

describe("tank displacement", () => {
  it("a tank taller than the wall displaces only up to it; a shorter one is submerged", () => {
    const tall: Tank = { id: "a", capacity: 20, D: 2.6, fill: 1, plinth: 0, solidPlinth: true };
    expect(shellHeight(tall)).toBeGreaterThan(0.55);
    const short: Tank = { id: "b", capacity: 0.2, D: 1.0, fill: 1, plinth: 0, solidPlinth: true };
    const b = { ...B0, wall: 0.55 };
    expect(freeVolume(b, [tall], [true], 0.55)).toBeCloseTo(55 * 0.55 - footprint(tall) * 0.55, 12);
    expect(freeVolume(b, [short], [true], 0.55)).toBeCloseTo(55 * 0.55 - 0.2, 12);
  });
  it("legs leave the space under a tank free; a solid plinth does not, even after the shell fails", () => {
    const legs: Tank = { id: "a", capacity: 10, D: 2, fill: 1, plinth: 0.3, solidPlinth: false };
    const solid: Tank = { ...legs, solidPlinth: true };
    const b = B0;
    expect(55 * 0.55 - freeVolume(b, [legs], [true], 0.55)).toBeCloseTo(Math.PI * 0.25, 12);
    expect(55 * 0.55 - freeVolume(b, [solid], [true], 0.55)).toBeCloseTo(Math.PI * 0.55, 12);
    expect(55 * 0.55 - freeVolume(b, [solid], [false], 0.55)).toBeCloseTo(Math.PI * 0.3, 12);
    expect(55 * 0.55 - freeVolume(b, [legs], [false], 0.55)).toBeCloseTo(0, 12);
  });
});

describe("overtopping and the limit cases", () => {
  it("a volume larger than the free volume at the wall top overtops by the difference", () => {
    const cap = freeVolume(B0, T, allIntact, B0.wall);
    const r = levelOf(B0, T, allIntact, cap + 3);
    expect(r.level).toBe(B0.wall);
    expect(r.overtop).toBeCloseTo(3, 12);
    const r2 = levelOf(B0, T, allIntact, cap / 2);
    expect(freeVolume(B0, T, allIntact, r2.level)).toBeCloseTo(cap / 2, 9);
    expect(r2.overtop).toBe(0);
  });
  it("an empty bund: net = gross, the free volume is the box, the pool covers the floor", () => {
    const d = designCheck(B0, [], R110, "capacity", 0);
    expect(d.net).toBe(d.gross);
    expect(d.required).toBe(0);
    expect(poolArea(B0, [], [], 0.2)).toBe(55);
  });
  it("zero rain adds nothing; the rain is the depth times the area", () => {
    expect(designCheck(B0, T, R110, "capacity", 0).rain).toBe(0);
    expect(designCheck(B0, T, R110, "capacity", 0.05).rain).toBeCloseTo(2.75, 12);
  });
  it("a bund that cannot be built is refused in words", () => {
    expect(problems({ ...B0, W: 2 }, T).join(" ")).toContain("wider than the bund");
    expect(problems({ ...B0, slope: 0.06 }, T).join(" ")).toContain("no wall at all");
    expect(problems(B0, T)).toEqual([]);
  });
  it("the wall load grows as the square and the cube", () => {
    const a = wallLoad(1000, 0.5), b = wallLoad(1000, 1.0);
    expect(b.F / a.F).toBeCloseTo(4, 12);
    expect(b.M / a.M).toBeCloseTo(8, 12);
    expect(a.F).toBeCloseTo(0.5 * 1000 * G_N * 0.25, 9);
  });
});

describe("Vitor's exercise: 20, 15 and 10 m3", () => {
  it("the 110 % / 25 % example: the largest governs, 22 m3 against 11.25", () => {
    const r = applyRule(R110, T.map((t) => t.capacity));
    expect(r.terms.map((t) => t.volume)).toEqual([22, 11.25]);
    expect(r.governing).toBe("largest");
  });
  it("the wall the engine's check needs is 22 m3 over the free floor", () => {
    const fp = T.reduce((s, t) => s + footprint(t), 0);
    expect(wallForEngineRule(B0, T, R110, "capacity", 0)!).toBeCloseTo(22 / (55 - fp), 9);
  });
  it("the largest ruptures: the margin is the free volume at the wall top less 20 m3", () => {
    const intact = [false, true, true];
    const r = levelOf(B0, T, intact, 20);
    expect(r.overtop).toBe(0);
    expect(freeVolume(B0, T, intact, B0.wall) - 20).toBeCloseTo(6.0339826588825, 9);
    expect((B0.wall - r.level) * 100).toBeCloseTo(12.75, 1);
  });
  it("after 50 mm of rain the same bund is short by the engine's reading", () => {
    const dry = designCheck(B0, T, R110, "capacity", 0);
    const wet = designCheck(B0, T, R110, "capacity", EXERCISE_RAIN_M);
    expect(dry.engineAdequate).toBe(true);
    expect(wet.engineAdequate).toBe(false);
    expect(wet.required).toBeCloseTo(24.75, 12);
  });
  it("HSG176 para 161's clearances", () => {
    expect(hsg176WallClearance(100)).toBe(1);
    expect(hsg176WallClearance(101)).toBe(2);
  });
});

describe("the lesson text", () => {
  const all = prose(BUND_STEPS.map((s) => `${s.title} ${s.body} ${s.note ?? ""}`).join(" "));
  it("quotes nothing: no quotation mark in a step, a limit or a source", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of BUND_LIMITS) expect(l.body).not.toMatch(/["“”]/);
    for (const s of BUND_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(/["“”]/);
  });
  it("follows the commission: sixteen steps", () => {
    expect(BUND_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });
  it("every equation parses", () => {
    for (const s of BUND_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? [])
        if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
    }
  });
  it("every bund.ts line it cites is the function it names", () => {
    const src = tree("gui/src/ui/methods/bund.ts").split("\n");
    const cites = [...all.matchAll(/bund\.ts:(\d+) \((\w+)/g)];
    expect(cites.length).toBeGreaterThan(6);
    for (const c of cites)
      expect(src[Number(c[1]) - 1], `bund.ts:${c[1]}`).toContain(`function ${c[2]}`);
  });
  it("every engine line it cites is the one it names", () => {
    const hdr = tree("src/postProcessing/layout/BundArithmetic.H").split("\n");
    const cites = [...all.matchAll(/BundArithmetic\.H:(\d+) \((\w+)/g)];
    expect(cites.length).toBeGreaterThan(6);
    for (const c of cites)
      expect(hdr[Number(c[1]) - 1], `BundArithmetic.H:${c[1]}`).toContain(`inline scalar ${c[2]}`);
    const pl = tree("src/postProcessing/layout/PlantLayout.cpp").split("\n");
    const net = /PlantLayout\.cpp:(\d+)\) and holds/.exec(all)!;
    expect(pl[Number(net[1]) - 1]).toContain("b.netVolume = b.grossVolume - b.displacedVolume");
    const pit = /PlantLayout\.cpp:(\d+)\) and announces/.exec(all)!;
    expect(pl[Number(pit[1]) - 1]).toContain("b.grossVolume = b.pitLength * b.pitWidth * b.pitDepth");
  });
  it("the TypeScript twin names the header function it mirrors", () => {
    const src = tree("gui/src/ui/methods/bund.ts").replace(/\n\s*\*\s*/g, " ");
    for (const f of ["displacedStanding", "displacedLying", "displacedBox", "grossVolume",
      "termVolume", "depthAllowance", "requiredVolume"]) {
      expect(src).toContain(`Twin of bundMath::${f}`);
      expect(tree("src/postProcessing/layout/BundArithmetic.H")).toContain(`inline scalar ${f}(`);
    }
  });
  it("every pointer lands on a live tool, at a step it has", () => {
    const steps: Record<string, readonly { title: string }[]> = {
      "process-safety": PROCESS_SAFETY_STEPS, "pool-fire": POOL_STEPS, materials: MATERIALS_STEPS,
    };
    const ptrs = BUND_STEPS.filter((s) => s.leadsTo);
    expect(ptrs.length).toBe(3);
    for (const s of ptrs) {
      const lt = s.leadsTo!;
      const tool = METHOD_TOOLS.find((t) => t.id === lt.tool);
      expect(tool?.status).toBe("live");
      expect(tool!.label.toLowerCase()).toContain(lt.toolLabel.toLowerCase());
      expect(steps[lt.tool]!.some((q) => q.title.startsWith(lt.stepTitle)), lt.stepTitle).toBe(true);
    }
  });
  it("tells legal requirement, guidance and example apart, and says what was not read", () => {
    const kinds = new Set(BUND_SOURCES.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(["example", "guidance", "legal requirement"]);
    for (const id of ["ciria-c736", "eu-seveso-iii", "eu-bref-storage", "pt-dl-150-2015"])
      expect(BUND_SOURCES.find((s) => s.id === id)!.used, id).toMatch(/^NOT READ/);
    for (const id of ["uk-oil-2001", "hse-hsg176"])
      expect(BUND_SOURCES.find((s) => s.id === id)!.used, id).toMatch(/^READ/);
  });
  it("calls the 110 % / 25 % rule an example, never an obligation", () => {
    expect(all).toContain("treats the figures as an EXAMPLE");
    expect(all).not.toMatch(/\bmust hold 110\b|\bis required by law everywhere\b/);
  });
  it("closes on Vitor's reflection, verbatim from his specification", () => {
    const spec = prose(tree("DEV.md").replace(/^> ?/gm, ""));
    expect(spec).toContain(CLOSING_REFLECTION);
  });
});

describe("the registry and the page", () => {
  it("sits on the Process safety shelf as a live construction", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "bund")!;
    expect(t.discipline).toBe("Process safety");
    expect(t.kind).toBe("construction");
    expect(t.status).toBe("live");
    expect(t.label).toBe(BUND_TITLE);
  });
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(BundTool)));
  const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  it("renders every step, the three benches, the limits and the sources, with no NaN", () => {
    expect(text).toContain(BUND_TITLE);
    for (const s of BUND_STEPS) expect(text).toContain(s.title);
    for (const id of ["bund-design", "bund-scenarios", "bund-exercise", "bund-closing"])
      expect(html).toContain(`data-testid="${id}"`);
    for (const l of BUND_LIMITS) expect(text).toContain(l.title);
    expect(text).toContain(CLOSING_REFLECTION);
    expect(html).toContain("normal operation");
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });
});
