/*---------------------------------------------------------------------------*\
  The process-safety EduTool (C60), held to the tree.

  What it holds, block by block:
    * the shelf and the registry entry;
    * the recipe lines the page moves: every override set is applied to the
      REAL witness and the result read back, so a reordered recipe or a
      renamed key fails here rather than on a student's screen running the
      wrong question -- for all three readings of the feed event;
    * the dosing schedules the page copies (16 portions, 900 s apart; the
      day tank's three refills) against the witnesses' own dicts;
    * the five criticality classes, one ordering each;
    * the FICTITIOUS records: coherent by construction, recomputed here from
      the author-set numbers they say they derive from (second review,
      point 1), and the engine's heat of reaction against them;
    * the MTT: the proxy against the component records it reads, the
      bubble-point witness's overrides read back, its shipped composition
      against batch26's own trajectory, and its golden against the
      components' boiling points;
    * Stoessel's mass correction on the witnesses' own trajectories: 1 for
      the batch, exact for it (dCp = 0), and the semi-batch's worst instant
      right after a portion, where DEFAULT_PORTION says;
    * the state just BEFORE a portion, read as the row after it minus what
      the transfer moved;
    * the engine claims the technical note cites by file:line;
    * the quotations: each appears in a step, and nothing else in the steps
      is set in quotation marks unless the list carries it;
    * the run outputs: the readers on the engine's own trajectory files, the
      goldens the page's numbers come from, the dosing vessel's bound, and
      the ammonia lesson's two ratios against the loops' converged streams;
    * the wordings both 2026-10-11 reviews retired, refused wherever the
      page could carry them again.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import { methodCase, type DictOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { RELIEF_WITNESS_LOOP } from "../src/ui/methods/overpressure.js";
import {
  BATCH_TF_MAX_S, BUBBLE_P_BAR, CLASS_MEANING, DEFAULT_PORTION, DOSED,
  FAIL_OFFSET_S, PORTIONS, PORTION_SPACING_S, REFILL_TIMES,
  SAFETY_WITNESS_BATCH, SAFETY_WITNESS_BUBBLE, SAFETY_WITNESS_NH3_150,
  SAFETY_WITNESS_NH3_50, SAFETY_WITNESS_SEMI, SAFETY_WITNESS_TANK,
  SAFETY_WITNESS_Z, SPECIES, TANK_WORST_T,
  accumulation, at, batchOverrides, bubbleOverrides, criticalityClass,
  dumpEstimate, estimateAt, failTime, massRatio, readFailure, reactorComposition,
  reactorMoles, recordBoilingPoints, recordMolarMasses, semiOverrides,
  tankOverrides,
} from "../src/ui/methods/processSafety.js";
import {
  SAFETY_LIMITS, SAFETY_QUOTES, SAFETY_STEPS, SAFETY_TECH_NOTES,
} from "../src/ui/methods/processSafetyLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_DISCIPLINES, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const FLOW = "system/flowsheetDict";
const R = 8.314462618;

/** The numbers of every `key <n>;` line in a dict, in file order. */
function values(text: string, key: string): number[] {
  const re = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)[ \\t]*;`, "gm");
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}
/** The words of every `key <word>;` line in a dict, in file order. */
function words(text: string, key: string): string[] {
  const re = new RegExp(`^[ \\t]*${key}[ \\t]+([A-Za-z][A-Za-z0-9_]*)[ \\t]*;`, "gm");
  return [...text.matchAll(re)].map((m) => m[1]!);
}

function flowsheetOf(witness: string, o: DictOverride[]): string {
  const cf = methodCase(witness, o);
  const body = cf.rawFiles?.[FLOW];
  if (body === undefined) throw new Error(`${witness}: no ${FLOW}`);
  return body;
}

/** trajectory.csv -> TrajectoryData, the shape the adapter hands the page. */
function parseTrajectory(csv: string): TrajectoryData {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  head.slice(1).forEach((h, j) => { vars[h] = rows.map((r) => r[j + 1]!); });
  return { t: rows.map((r) => r[0]!), vars };
}
const trajOf = (w: string): TrajectoryData =>
  parseTrajectory(witnessOutput(`tutorials/${w}`, "trajectory.csv"));

function golden(caseDir: string, unit: string, key: string): number {
  const m = new RegExp(`^(?:kpi|diag)\\s+${unit}\\s+${key}\\s+([-+0-9.eE]+)`, "m")
    .exec(tree(`${caseDir}/expected`));
  if (!m) throw new Error(`${caseDir}: no golden ${unit}.${key}`);
  return Number(m[1]);
}

/** kmol/h of one species in a converged stream file. */
function convergedFlow(text: string, comp: string): number {
  const m = new RegExp(`^\\s*${comp}\\s+([-+0-9.eE]+)\\s+kmol/h;`, "m").exec(text);
  if (!m) throw new Error(`no ${comp} in a converged stream`);
  return Number(m[1]);
}
function convergedScalar(text: string, key: string): number {
  const m = new RegExp(`^${key}\\s+([-+0-9.eE]+)`, "m").exec(text);
  if (!m) throw new Error(`no ${key} in a converged stream`);
  return Number(m[1]);
}

/** A record's number, `key value;` at the start of a line. */
function rec(caseDir: string, comp: string): string {
  return tree(`tutorials/${caseDir}/constant/components/${comp}.dat`);
}
function num(body: string, key: string): number {
  const m = new RegExp(`^\\s*${key}\\s+([-+0-9.eE]+)`, "m").exec(body);
  if (!m) throw new Error(`no ${key}`);
  return Number(m[1]);
}
function poly(body: string, block: string): number {
  const m = new RegExp(`${block}\\s*\\{[^}]*coefficients\\s*\\(\\s*([-+0-9.eE]+)\\s*\\)`)
    .exec(body);
  if (!m) throw new Error(`no ${block}`);
  return Number(m[1]);
}
function antoine(body: string): [number, number, number] {
  const m = /vaporPressure\s*\{[^}]*coefficients\s*\(\s*([-0-9.eE]+)\s+([-0-9.eE]+)\s+([-0-9.eE]+)\s*\)/
    .exec(body)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("process-safety: the shelf and the registry entry", () => {
  it("sits on its own 'Process safety' shelf, live, as notes", () => {
    expect(METHOD_DISCIPLINES).toContain("Process safety");
    const t = METHOD_TOOLS.find((m) => m.id === "process-safety");
    expect(t?.discipline).toBe("Process safety");
    expect(t?.kind).toBe("notes");
    expect(t?.status).toBe("live");
  });
  it("names witnesses the bundled corpus carries", () => {
    for (const w of [SAFETY_WITNESS_BATCH, SAFETY_WITNESS_SEMI, SAFETY_WITNESS_TANK,
      SAFETY_WITNESS_BUBBLE, SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50,
      SAFETY_WITNESS_Z])
      expect(tutorialByName(w), w).toBeDefined();
  });
  it("reuses the overpressure page's loop-gas witness for Z", () => {
    expect(SAFETY_WITNESS_Z).toBe(RELIEF_WITNESS_LOOP);
  });
});

describe("process-safety: the recipe lines the page moves", () => {
  it("batch: normal operation keeps the jacket (value 0), a failure moves the time", () => {
    expect(values(flowsheetOf(SAFETY_WITNESS_BATCH, batchOverrides(null)), "value"))
      .toEqual([0]);
    const f = flowsheetOf(SAFETY_WITNESS_BATCH, batchOverrides(1260));
    expect(values(f, "time")).toEqual([1260]);
    expect(values(f, "value")).toEqual([1]);
  });
  it("the batch witness ships the failure at 600 s, inside the knob's range", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_BATCH}/${FLOW}`);
    expect(values(shipped, "time")).toEqual([600]);
    expect(600).toBeLessThanOrEqual(BATCH_TF_MAX_S);
  });
  it.each([
    ["held", "heldFeed", 1], ["pumpOn", "heldFeed", 0], ["wholeTank", "reactor", 1],
  ] as const)("semi-batch, feed %s: the two safety events move together, the portions stay",
    (feed, to, frac) => {
      const shipped = tree(`tutorials/${SAFETY_WITNESS_SEMI}/${FLOW}`);
      const t5 = failTime(5, "after");
      const f = flowsheetOf(SAFETY_WITNESS_SEMI, semiOverrides(t5, feed));
      const t = values(f, "time");
      expect(t.slice(0, 2)).toEqual([t5, t5]);
      expect(t.slice(2)).toEqual(values(shipped, "time").slice(2));
      expect(values(f, "value")).toEqual([1]);
      expect(words(f, "to")[0]).toBe(to);
      expect(words(f, "to").slice(1)).toEqual(words(shipped, "to").slice(1));
      expect(values(f, "fraction")[0]).toBe(frac);
      expect(values(f, "fraction").slice(1)).toEqual(values(shipped, "fraction").slice(1));
    });
  it("semi-batch normal operation moves nothing", () => {
    const n = flowsheetOf(SAFETY_WITNESS_SEMI, semiOverrides(null));
    expect(values(n, "value")).toEqual([0]);
    expect(values(n, "fraction")[0]).toBe(0);
  });
  it("the page's copy of the dosing schedule is the dict's", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_SEMI}/${FLOW}`);
    const portionTimes = values(shipped, "time").slice(2);
    expect(portionTimes).toHaveLength(PORTIONS);
    portionTimes.forEach((t, k) => expect(t).toBe(k * PORTION_SPACING_S));
    //  Every portion is 1/16 of B: fraction 1/(16-k) of the rest.
    values(shipped, "fraction").slice(1).forEach((f, k) =>
      expect(f).toBeCloseTo(1 / (PORTIONS - k), 10));
    //  The shipped failure is 1 s after the LAST portion, never on one.
    expect(values(shipped, "time").slice(0, 2))
      .toEqual([failTime(PORTIONS, "after"), failTime(PORTIONS, "after")]);
    expect(FAIL_OFFSET_S).toBeGreaterThan(0);
    expect(FAIL_OFFSET_S % PORTION_SPACING_S).not.toBe(0);
    expect(failTime(3, "before")).toBe(2 * PORTION_SPACING_S - FAIL_OFFSET_S);
  });
  it("the dosing-vessel witness: three safety events, three refills, the same portions", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_TANK}/${FLOW}`);
    const t = values(shipped, "time");
    //  Shipped: the failure 1 s after the first refill, all three events.
    expect(t.slice(0, 3)).toEqual([TANK_WORST_T[1], TANK_WORST_T[1], TANK_WORST_T[1]]);
    expect(t.slice(3, 6)).toEqual([...REFILL_TIMES]);
    expect(t.slice(6)).toEqual(Array.from({ length: PORTIONS }, (_, k) => k * PORTION_SPACING_S));
    //  The refills move 1/3, 1/2, all of storage: a quarter of B each.
    expect(values(shipped, "fraction").slice(2, 5).map((f) => Math.round(f * 1e6) / 1e6))
      .toEqual([0.333333, 0.5, 1]);
    //  Each refill lands between portions 4k and 4k+1, never on a portion.
    for (const r of REFILL_TIMES) expect(r % PORTION_SPACING_S).not.toBe(0);
    expect(TANK_WORST_T).toEqual([FAIL_OFFSET_S, ...REFILL_TIMES.map((r) => r + FAIL_OFFSET_S)]);
    const f = flowsheetOf(SAFETY_WITNESS_TANK, tankOverrides(failTime(9, "after")));
    expect(values(f, "time").slice(0, 3)).toEqual(Array(3).fill(failTime(9, "after")));
    expect(words(f, "to")[0]).toBe("reactor");
    expect(values(f, "fraction").slice(0, 2)).toEqual([1, 1]);
    const n = flowsheetOf(SAFETY_WITNESS_TANK, tankOverrides(null));
    expect(values(n, "value")).toEqual([0]);
    expect(values(n, "fraction").slice(0, 2)).toEqual([0, 0]);
  });
});

describe("process-safety: the criticality classes", () => {
  //  Tp = 300 throughout; one ordering per class (Molecules 30 (2025) 2939,
  //  Table 11, citing Stoessel 2008).
  it.each([
    [320, 350, 400, 1], [320, 400, 350, 2], [360, 350, 400, 3],
    [420, 350, 400, 4], [420, 450, 400, 5], [380, 450, 350, 5],
  ] as const)("MTSR %d, MTT %d, T_D24 %d -> class %d", (mtsr, mtt, td24, cls) => {
    expect(criticalityClass(300, mtsr, mtt, td24).cls).toBe(cls);
  });
  it("refuses a class when the process already runs above a limit", () => {
    expect(criticalityClass(360, 380, 350, 400).cls).toBeNull();
  });
});

describe("process-safety: the fictitious records are coherent by construction", () => {
  const B = SAFETY_WITNESS_BATCH;
  it("every witness carries the same four authored records and thermo", () => {
    const bat = tutorialByName(B)?.files.rawFiles;
    for (const w of [SAFETY_WITNESS_SEMI, SAFETY_WITNESS_TANK, SAFETY_WITNESS_BUBBLE]) {
      const other = tutorialByName(w)?.files.rawFiles;
      expect(other).toBeDefined();
      for (const rel of Object.keys(bat!).filter((r) => r.startsWith("constant/")
        && r !== "constant/reactions"))
        expect(other![rel], `${w}: ${rel}`).toBe(bat![rel]);
    }
    expect(Object.keys(bat!).filter((r) => r.startsWith("constant/components/")).sort())
      .toEqual(SPECIES.map((s) => `constant/components/${s}.dat`).sort());
    expect(tree(`tutorials/${B}/constant/thermoPhysPropDict`))
      .toMatch(/activityModel\s+ideal;/);
  });
  it("says it is fictitious, and claims no formula", () => {
    for (const s of SPECIES) {
      const r = rec(B, s);
      expect(r).toContain("FICTITIOUS");
      expect(r).not.toMatch(/^formula\s/m);
    }
  });
  it("conserves mass and has dCp = 0", () => {
    expect(num(rec(B, "productP"), "MW"))
      .toBe(num(rec(B, "reactantA"), "MW") + num(rec(B, "reactantB"), "MW"));
    expect(poly(rec(B, "productP"), "liquidHeatCapacity"))
      .toBe(poly(rec(B, "reactantA"), "liquidHeatCapacity")
        + poly(rec(B, "reactantB"), "liquidHeatCapacity"));
  });
  it.each(SPECIES.map((s) => [s]))("%s: Tb, HvapTb, Tc, Cp_ig follow from the author-set numbers", (s) => {
    const r = rec(B, s);
    const [A, Bc, C] = antoine(r);
    const Tb = num(r, "Tb");
    expect(Math.pow(10, A - Bc / (Tb + C))).toBeCloseTo(1.01325, 3);
    const Hv = R * Tb * Tb * Math.LN10 * Bc / ((Tb + C) * (Tb + C));
    expect(Math.abs(num(r, "HvapTb") - Hv)).toBeLessThan(1.0);
    expect(num(r, "Tc")).toBeCloseTo(Tb / 0.65, 0);
    const slope = -0.38 * num(r, "HvapTb") / (num(r, "Tc") - Tb);
    expect(poly(r, "idealGasHeatCapacity"))
      .toBeCloseTo(poly(r, "liquidHeatCapacity") + slope, 1);
  });
  it("the liquid heat of reaction from the records is -60.000 kJ per mol of B", () => {
    //  The engine's liquid rung: dHf_298 - Watson Hvap(298.15) + Cp_liq dT;
    //  with dCp = 0 the dT term cancels at every T.
    const hl = (s: string) => {
      const r = rec(B, s);
      const w = num(r, "HvapTb") * Math.pow(
        (num(r, "Tc") - 298.15) / (num(r, "Tc") - num(r, "Tb")), 0.38);
      return num(r, "dHf_298") - w;
    };
    const dH = hl("productP") - hl("reactantA") - hl("reactantB");
    expect(dH).toBeCloseTo(-60000, 0);
  });
  it("the engine's isothermal duty is that heat per mole converted", () => {
    const traj = trajOf(B);
    const nB = traj.vars[`reactor.n_${DOSED}`]!;
    const conv = (nB[0]! - at({ t: traj.t, y: nB }, 600)) * 1000;   // mol
    const E = golden(`tutorials/${B}`, "reactor", "E_reaction_seg0_kJ");
    expect(E / conv).toBeCloseTo(-60.0, 3);
  });
});

describe("process-safety: the MTT", () => {
  it("the PROXY is the lowest Tb among the witness's component records", () => {
    const raw = tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles;
    const tbs = recordBoilingPoints(raw);
    expect(tbs.length).toBe(4);
    const low = tbs[0]!;
    expect(low.component).toBe(DOSED);
    for (const t of tbs) expect(t.Tb).toBeGreaterThanOrEqual(low.Tb);
  });
  it("its four composition lines are the ones the page rewrites, at the reactor's pressure", () => {
    const x = { reactantA: 0.1, reactantB: 0.2, productP: 0.3, solventS: 0.4 };
    const body = methodCase(SAFETY_WITNESS_BUBBLE, bubbleOverrides(x))
      .rawFiles?.["system/propsDict"];
    expect(body).toBeDefined();
    for (const sp of SPECIES) expect(values(body!, sp)).toEqual([x[sp]]);
    expect(body).toMatch(new RegExp(`P\\s+${BUBBLE_P_BAR} bar;`));
    expect(tree(`tutorials/${SAFETY_WITNESS_BATCH}/0/internalStates/reactor`))
      .toMatch(new RegExp(`P\\s+${BUBBLE_P_BAR} bar;`));
  });
  it("ships batch26's reactor composition at its shipped failure, 600 s", () => {
    const x = reactorComposition(trajOf(SAFETY_WITNESS_BATCH), 600)!;
    const shipped = tree(`tutorials/${SAFETY_WITNESS_BUBBLE}/system/propsDict`);
    for (const sp of SPECIES)
      expect(values(shipped, sp)[0]).toBeCloseTo(x[sp]!, 6);
  });
  it("its golden bubble point lies between the present components' boiling points, above the proxy", () => {
    const Tbub = golden(`tutorials/${SAFETY_WITNESS_BUBBLE}`,
      "reactionMassBubblePoint", "T_bubble");
    const tbs = recordBoilingPoints(tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles);
    expect(Tbub).toBeGreaterThan(tbs[0]!.Tb + 5);
    expect(Tbub).toBeLessThan(tbs[tbs.length - 1]!.Tb);
    //  ... and the batch's T_cf at the same instant is just below it: the
    //  default class there is 1, by a kelvin.
    const Tcf = golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final");
    expect(Tbub - Tcf).toBeGreaterThan(0);
    expect(Tbub - Tcf).toBeLessThan(3);
  });
});

describe("process-safety: Stoessel's estimate on the witnesses' own runs", () => {
  const mw = recordMolarMasses(tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles);
  const dTad = (() => {
    //  The adiabatic rise from the records: -dH n_B / sum n Cp, with the
    //  batch charge of 0/internalStates/reactor (5 A, 5 B, 15 S mol).
    const cp = (s: string) => poly(rec(SAFETY_WITNESS_BATCH, s), "liquidHeatCapacity");
    return 60000 * 5 / (5 * cp("reactantA") + 5 * cp("reactantB") + 15 * cp("solventS"));
  })();
  it("reads every species' molar mass from the records", () => {
    for (const sp of SPECIES) expect(mw[sp], sp).toBeGreaterThan(0);
  });
  it("is 1 for the batch, whose mass does not change", () => {
    for (const r of massRatio(trajOf(SAFETY_WITNESS_BATCH), mw)!.y)
      expect(r).toBeCloseTo(1, 8);
  });
  it("is EXACT for the batch: dCp = 0 here, so the estimate is the engine's T_cf", () => {
    const traj = trajOf(SAFETY_WITNESS_BATCH);
    const p = estimateAt(traj, mw, 330, dTad, 600)!;
    const Tcf = golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final");
    expect(Math.abs(p.Tcf - Tcf)).toBeLessThan(0.01);
  });
  it("puts the semi-batch's worst instant right after portion DEFAULT_PORTION, not at the end", () => {
    //  The shipped run fails 1 s after the last portion, so up to then its
    //  trajectory IS normal operation.  T_cf - T_p is X_ac dT_ad M_f/M.
    const traj = trajOf(SAFETY_WITNESS_SEMI);
    const ns = Array.from({ length: PORTIONS - 1 }, (_, k) => k + 1);
    const est = (n: number) => estimateAt(traj, mw, 330, dTad, failTime(n, "after"))!;
    const argmax = (f: (n: number) => number) =>
      ns.reduce((b, n) => (f(n) > f(b) ? n : b), 1);
    expect(argmax((n) => est(n).Tcf)).toBe(DEFAULT_PORTION);
    expect(argmax((n) => est(n).X)).toBeGreaterThan(DEFAULT_PORTION + 6);
    expect(est(1).ratio).toBeGreaterThan(1.15);
    expect(est(PORTIONS - 1).ratio).toBeLessThan(1.02);
  });
  it("reads the state just BEFORE a portion as the row after it minus the transfer", () => {
    const traj = trajOf(SAFETY_WITNESS_SEMI);
    const t0 = 2 * PORTION_SPACING_S;
    const after = reactorMoles(traj, t0 + FAIL_OFFSET_S)!;
    const before = reactorMoles(traj, t0 - FAIL_OFFSET_S)!;
    //  One portion is 1/16 of the 5 mol of B.
    expect((after[DOSED]! - before[DOSED]!) * 1000).toBeCloseTo(5 / PORTIONS, 2);
    const X = accumulation(traj)!;
    const p = estimateAt(traj, mw, 330, dTad, t0 - FAIL_OFFSET_S)!;
    expect(p.X).toBeLessThan(at(X, t0));
  });
});

describe("process-safety: the lesson text", () => {
  const all = prose(SAFETY_STEPS.map((s) => `${s.body} ${s.note ?? ""}`).join(" "));
  it("every quotation in the list appears in a step, verbatim", () => {
    for (const q of SAFETY_QUOTES) expect(all, q.id).toContain(prose(q.text));
  });
  it("nothing else in the steps sits in quotation marks", () => {
    const quoted = [...all.matchAll(/"([^"]+)"/g)].map((m) => prose(m[1]!));
    for (const q of quoted)
      expect(SAFETY_QUOTES.some((s) => prose(s.text) === q),
        `unlisted quotation: "${q}"`).toBe(true);
  });
  it("Gall is paraphrased and the page says so", () => {
    expect(all).toMatch(/In paraphrase/);
    for (const m of all.matchAll(/"([^"]+)"/g))
      expect(/failing to fail|fails? by fail/i.test(m[1]!), m[1]).toBe(false);
  });
  it("Gall is a paediatrician and Kletz a chemist", () => {
    const s1 = SAFETY_STEPS.find((s) => s.n === 1)!;
    expect(s1.title).toBe("A paediatrician and a chemist who said the same thing");
    expect(prose(s1.body)).toContain("John Gall was a paediatrician");
    expect(prose(s1.body)).toContain("Trevor Kletz was a chemist");
  });
  it("every equation parses, and no step repeats another's equation", () => {
    const fs = SAFETY_STEPS.filter((s) => s.formula).map((s) => s.formula!);
    for (const s of SAFETY_STEPS) if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
    expect(new Set(fs).size).toBe(fs.length);
  });
  it("puts the caveats before the runs: fictitious, no vapour phase, T_D24 assumed", () => {
    const s8 = prose(SAFETY_STEPS.find((s) => s.n === 8)!.body);
    for (const w of ["FICTITIOUS", "NO VAPOUR PHASE", "T_D24 is ASSUMED",
      "declared IDEAL", "no azeotrope", "heat capacity is a CONSTANT",
      "MIXTURE's specific heat changes with composition", "1.013 bar"])
      expect(s8, w).toContain(w);
    const page = tree("gui/src/ui/methods/ProcessSafetyTool.tsx");
    expect(page.indexOf("{step(8)}")).toBeLessThan(page.indexOf("<CoolingFailureBench"));
  });
  it("keeps code paths and binary names out of the lesson prose", () => {
    const steps = prose(SAFETY_STEPS.map((s) => `${s.title} ${s.body} ${s.note ?? ""}`).join(" "));
    expect(steps).not.toMatch(/src\/|\.cpp|choupoBatch|choupoProps|choupoSolve|tutorials\//);
    expect(steps).not.toMatch(/setParameter|fraction 0|value 0/);
  });
  it("the cited engine lines are what the technical note says they are", () => {
    const notes = prose(SAFETY_TECH_NOTES.map((n) => n.body).join(" "));
    const m = /BatchReactor\.cpp:(\d+)-(\d+)/.exec(notes);
    expect(m).not.toBeNull();
    const lines = tree("src/unitOperations/batch/BatchReactor.cpp").split("\n");
    const lo = Number(m![1]), hi = Number(m![2]);
    expect(lines[lo - 1]).toContain('key == "adiabatic"');
    expect(lines.slice(lo - 1, hi).join("\n")).toContain("[cooling failure]");
    const c = /BatchUnitOperation\.cpp:(\d+)-(\d+)/.exec(notes);
    expect(c).not.toBeNull();
    const ul = tree("src/unitOperations/batch/BatchUnitOperation.cpp").split("\n");
    const block = ul.slice(Number(c![1]) - 1, Number(c![2])).join("\n");
    expect(block).toContain("H-EQUALITY");
    expect(block).toContain("Htarget");
  });
});

describe("process-safety: the engine's own run outputs", () => {
  const mw = recordMolarMasses(tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles);
  it("the batch witness: held at T_p until 600 s, then the T_cf its golden pins", () => {
    const traj = trajOf(SAFETY_WITNESS_BATCH);
    const f = readFailure(traj)!;
    expect(f.T0).toBe(330);
    expect(at({ t: traj.t, y: traj.vars["reactor.T"]! }, 600)).toBe(330);
    expect(f.Tmax).toBeCloseTo(golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final"), 3);
    expect(f.stillRising).toBe(false);
    //  The accumulation starts at 1 in a batch.
    expect(accumulation(traj)!.y[0]).toBe(1);
  });
  it("the semi-batch witness: the accumulation is a fraction of the dosed total, and stays small", () => {
    const traj = trajOf(SAFETY_WITNESS_SEMI);
    const X = accumulation(traj)!;
    //  The first portion (1/16) is in the reactor at t = 0.
    expect(X.y[0]).toBeCloseTo(1 / PORTIONS, 12);
    expect(Math.max(...X.y)).toBeLessThan(0.25);
    const f = readFailure(traj)!;
    expect(f.Tmax).toBeCloseTo(golden(`tutorials/${SAFETY_WITNESS_SEMI}`, "reactor", "T_final"), 3);
    expect(f.Tmax).toBeLessThan(golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final") - 20);
  });
  it("the day tank bounds a whole-tank failure: below the bubble point, far below the batch", () => {
    //  batch28 ships the whole day tank entering 1 s after the first refill.
    const T = golden(`tutorials/${SAFETY_WITNESS_TANK}`, "reactor", "T_final");
    const tf0 = golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final");
    const Tbub = golden(`tutorials/${SAFETY_WITNESS_BUBBLE}`,
      "reactionMassBubblePoint", "T_bubble");
    expect(T).toBeLessThan(tf0 - 15);
    expect(T).toBeLessThan(Tbub);
    //  ... and the dump estimate on batch27's own run says the whole tank
    //  of all of B, at t = 1 s, is the batch's MTSR: the rise of the whole
    //  charge.
    const traj = trajOf(SAFETY_WITNESS_SEMI);
    const cp = (s: string) => poly(rec(SAFETY_WITNESS_BATCH, s), "liquidHeatCapacity");
    const dTad = 60000 * 5 / (5 * cp("reactantA") + 5 * cp("reactantB") + 15 * cp("solventS"));
    const e = dumpEstimate(traj, "dosingTank", mw, 330, dTad)!;
    expect(e.y[0]).toBeCloseTo(330 + dTad, 6);
  });
  it("the ammonia loops: the gross margins the page reports, and 'about four times' the recycled ammonia", () => {
    const g150 = golden(`tutorials/${SAFETY_WITNESS_NH3_150}`, "economics", "grossMargin_RM_UT");
    const g50 = golden(`tutorials/${SAFETY_WITNESS_NH3_50}`, "economics", "grossMargin_RM_UT");
    expect(g50).toBeLessThan(g150);
    const conv = (w: string, s: string) => witnessOutput(`tutorials/${w}`, `converged/${s}`);
    const ratio = convergedFlow(conv(SAFETY_WITNESS_NH3_50, "Recycle"), "NH3")
      / convergedFlow(conv(SAFETY_WITNESS_NH3_150, "Recycle"), "NH3");
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
    const t = METHOD_TOOLS.find((m) => m.id === "process-safety")!.teaches;
    expect(t).toContain("about four times as much ammonia in the recycle stream");
    expect(prose(SAFETY_STEPS.map((s) => s.body).join(" ")))
      .toContain("about four times as much ammonia in the recycle stream");
    //  Less hydrogen converted per pass at 50 bar, from the converter's own
    //  feed and effluent.
    const pass = (w: string) => {
      const feed = conv(w, "PreheatedFeed");
      const out = conv(w, "HotEffluent");
      return 1.5 * (convergedFlow(out, "NH3") - convergedFlow(feed, "NH3"))
        / convergedFlow(feed, "H2");
    };
    expect(pass(SAFETY_WITNESS_NH3_50)).toBeLessThan(pass(SAFETY_WITNESS_NH3_150));
  });
  it("the converter feeds: 'about four times the volume of gas' from F, T, P and the engine's Z", () => {
    const conv = (w: string) => witnessOutput(`tutorials/${w}`, "converged/PreheatedFeed");
    const F = (w: string) => ["N2", "H2", "NH3", "Ar"]
      .reduce((a, c) => a + convergedFlow(conv(w), c), 0);
    const ideal = (F(SAFETY_WITNESS_NH3_50) / F(SAFETY_WITNESS_NH3_150))
      * (convergedScalar(conv(SAFETY_WITNESS_NH3_50), "T")
        / convergedScalar(conv(SAFETY_WITNESS_NH3_150), "T"))
      * (convergedScalar(conv(SAFETY_WITNESS_NH3_150), "P")
        / convergedScalar(conv(SAFETY_WITNESS_NH3_50), "P"));
    expect(ideal).toBeGreaterThan(4.2);
    expect(ideal).toBeLessThan(4.5);
    //  Z nearer 1 at 50 bar takes some of it back: the witness's own Z at
    //  its shipped (relieving) states bounds the ratio between 0.9 and 1.
    const z = (op: string) => golden(`tutorials/${SAFETY_WITNESS_Z}`, op, "Z");
    const zr = z("loop50") / z("loop150");
    expect(zr).toBeGreaterThan(0.9);
    expect(zr).toBeLessThan(1);
    expect(ideal * zr).toBeGreaterThan(3.8);
    expect(ideal * zr).toBeLessThan(4.5);
    expect(prose(SAFETY_STEPS.find((s) => s.n === 15)!.body))
      .toContain("about four times the volume of gas per hour");
  });
});

describe("process-safety: the 2026-10-11 reviews' corrections stay made", () => {
  const page = prose([
    ...SAFETY_STEPS.flatMap((s) => [s.title, s.body, s.note ?? "",
      ...(s.where ?? []).map((w) => w.means)]),
    ...SAFETY_LIMITS.map((l) => `${l.title} ${l.body}`),
    ...SAFETY_TECH_NOTES.map((l) => `${l.title} ${l.body}`),
    ...Object.values(CLASS_MEANING),
    METHOD_TOOLS.find((m) => m.id === "process-safety")!.teaches,
    tree("gui/src/ui/methods/ProcessSafetyTool.tsx"),
  ].join(" "));
  it.each([
    //  the first review
    "four times the ammonia",
    "so that there is nothing to interlock",
    "Every one of those layers existed",
    "every flange, every vessel",
    "attenuation here did not shrink the hazard",
    "nothing in the physics stops",
    "must be redesigned",
    "never held for long at the MTT",
    "The kinetics are illustrative",
    //  the second review
    "Two engineers",
    "two engineers",
    "a pump that cannot deliver faster",
    "or a pressure times a volume",
    "None of these is a layer that can be switched off",
    "azeotropes would boil lower",
    "over every failure instant",
    "diluted, refrigerated",
    "aceticAcid",
    "ethanol",
    "ethyl acetate",
  ])("refuses the retired wording %j", (w) => {
    expect(page).not.toContain(w);
  });
  it("T_D24 is never called a decomposition onset (only said not to be one)", () => {
    for (const m of page.matchAll(/(.{0,12})decomposition onset/g))
      expect(m[1], m[0]).toMatch(/not a $/);
  });
  it("the textbook MTSR carries the mass correction, and reduces for a batch", () => {
    const s5 = SAFETY_STEPS.find((s) => s.n === 5)!;
    expect(s5.formula).toContain(String.raw`\frac{M_\mathrm{f}}{M(t)}`);
    expect(s5.formula).toContain(String.raw`\mathrm{MTSR} = \max_t T_\mathrm{cf}(t)`);
    expect(prose(s5.body)).toContain("MTSR = T_p + X_ac ΔT_ad");
  });
  it("the interlock step: compound, rate not total, the dosing vessel, the refill named", () => {
    const s = prose(SAFETY_STEPS.find((q) => q.n === 13)!.body);
    expect(s).toContain("COMPOUND");
    expect(s).toContain("it is not an MTSR");
    expect(s).toContain("limits the RATE at which the feed enters, not the TOTAL");
    expect(s).toContain("safety no longer depend on the interlock");
    expect(s).toContain("WHOLE content, added to what has already accumulated");
    expect(s).toContain("the refill is a discrete, deliberate act");
  });
  it("the search: three maxima kept apart, and the sample said", () => {
    const s = prose(SAFETY_STEPS.find((q) => q.n === 11)!.body);
    expect(s).toContain("right AFTER a portion");
    for (const w of ["(a) The scenario you chose", "(b) The largest value of the estimate",
      "(c) The largest T_cf the ENGINE reached among the failure instants it was asked about",
      "Neither (b) nor (c) is a maximum over every instant"])
      expect(s, w).toContain(w);
  });
  it("the class: of a scenario, of the process, and the margin along the run", () => {
    const s = prose(SAFETY_STEPS.find((q) => q.n === 12)!.body);
    expect(s).toContain("it is not the class of the process");
    expect(s).toContain("MTT(t) - T_cf(t)");
    const s6 = prose(SAFETY_STEPS.find((q) => q.n === 6)!.body);
    expect(s6).toContain("one technical limit among others");
    expect(s6).toContain("1.013 bar");
    expect(tree("gui/src/ui/methods/ProcessSafetyTool.tsx")).toContain("class of this scenario");
    expect(tree("gui/src/ui/methods/ProcessSafetyTool.tsx")).toContain("class of the process");
  });
  it("refrigeration is not inherent", () => {
    const s4 = prose(SAFETY_STEPS.find((q) => q.n === 4)!.body);
    expect(s4).toContain("REFRIGERATION is not on the list");
    expect(s4).toContain("the refrigeration had been switched off");
  });
  it("the thesis keeps the protection layers for the hazard that remains", () => {
    expect(prose(SAFETY_STEPS.find((s) => s.n === 1)!.body))
      .toContain("independent protection layers are still needed for the hazard that remains");
  });
  it("the ammonia lesson names BOTH changes, from the cases' own converter KPIs", () => {
    const T150 = golden(`tutorials/${SAFETY_WITNESS_NH3_150}`, "Converter", "T");
    const T50 = golden(`tutorials/${SAFETY_WITNESS_NH3_50}`, "Converter", "T");
    const s14 = prose(SAFETY_STEPS.find((s) => s.n === 14)!.body);
    expect(s14).toContain(`150 bar and ${Math.round(T150)} K`);
    expect(s14).toContain(`50 bar and ${Math.round(T50)} K`);
    expect(s14).toContain("not the effect of pressure alone");
    const s15 = prose(SAFETY_STEPS.find((s) => s.n === 15)!.body);
    expect(s15).toContain("the engine cannot conclude that the lower-pressure design is safer overall");
    expect(s15).toContain("n = PV/(ZRT)");
    expect(s15).toContain("release scenarios");
    expect(s15).toContain("who is exposed");
  });
});
