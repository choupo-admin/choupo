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
  The process-safety EduTool (C60), held to the tree.

  What it holds, block by block:
    * the shelf and the registry entry;
    * the recipe lines the page moves: every override set is applied to the
      REAL witness and the result read back, so a reordered recipe or a
      renamed key fails here rather than on a student's screen running the
      wrong question;
    * the dosing schedule the page copies (16 portions, 900 s apart, the
      default failure 50 s after the last) against the witness's own dict;
    * the five criticality classes, one ordering each;
    * the MTT default against the component records it reads;
    * the engine claim the lesson cites by file:line;
    * the quotations: each appears in a step, and nothing else in the steps
      is set in quotation marks unless the list carries it;
    * the run outputs: the readers on the engine's own trajectory files, the
      goldens the page's numbers come from, and the ammonia lesson's "about
      four times" against the two loops' converged recycle streams.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import { methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  BATCH_TF_MAX_S, FAIL_AFTER_PORTION_S, PORTIONS, PORTION_SPACING_S,
  SAFETY_WITNESS_BATCH, SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50,
  SAFETY_WITNESS_SEMI, accumulation, at, batchOverrides, criticalityClass,
  failTimeAfterPortion, readFailure, recordBoilingPoints, semiOverrides,
} from "../src/ui/methods/processSafety.js";
import {
  SAFETY_QUOTES, SAFETY_STEPS,
} from "../src/ui/methods/processSafetyLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_DISCIPLINES, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const FLOW = "system/flowsheetDict";

/** The numbers of every `key <n>;` line in a dict, in file order. */
function values(text: string, key: string): number[] {
  const re = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)[ \\t]*;`, "gm");
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}

function flowsheetOf(witness: string, o: ReturnType<typeof batchOverrides>): string {
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

function golden(caseDir: string, unit: string, key: string): number {
  const m = new RegExp(`^kpi\\s+${unit}\\s+${key}\\s+([-+0-9.eE]+)`, "m")
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

describe("process-safety: the shelf and the registry entry", () => {
  it("sits on its own 'Process safety' shelf, live, as notes", () => {
    expect(METHOD_DISCIPLINES).toContain("Process safety");
    const t = METHOD_TOOLS.find((m) => m.id === "process-safety");
    expect(t?.discipline).toBe("Process safety");
    expect(t?.kind).toBe("notes");
    expect(t?.status).toBe("live");
  });
  it("names witnesses the bundled corpus carries", () => {
    for (const w of [SAFETY_WITNESS_BATCH, SAFETY_WITNESS_SEMI,
      SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50])
      expect(tutorialByName(w), w).toBeDefined();
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
  it("semi-batch: the two safety events move together and the portions stay", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_SEMI}/${FLOW}`);
    const f = flowsheetOf(SAFETY_WITNESS_SEMI, semiOverrides(5, false));
    const t = values(f, "time");
    expect(t.slice(0, 2)).toEqual([failTimeAfterPortion(5), failTimeAfterPortion(5)]);
    expect(t.slice(2)).toEqual(values(shipped, "time").slice(2));
    expect(values(f, "value")).toEqual([1]);
    expect(values(f, "fraction")[0]).toBe(0);
    expect(values(f, "fraction").slice(1)).toEqual(values(shipped, "fraction").slice(1));
    const n = flowsheetOf(SAFETY_WITNESS_SEMI, semiOverrides(null, true));
    expect(values(n, "value")).toEqual([0]);
    expect(values(n, "fraction")[0]).toBe(0);
  });
  it("the page's copy of the dosing schedule is the dict's", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_SEMI}/${FLOW}`);
    const portionTimes = values(shipped, "time").slice(2);
    expect(portionTimes).toHaveLength(PORTIONS);
    portionTimes.forEach((t, k) => expect(t).toBe(k * PORTION_SPACING_S));
    //  Every portion is 1/16 of the ethanol: fraction 1/(16-k) of the rest.
    values(shipped, "fraction").slice(1).forEach((f, k) =>
      expect(f).toBeCloseTo(1 / (PORTIONS - k), 10));
    //  The shipped failure is 50 s after the LAST portion, never on one.
    expect(values(shipped, "time").slice(0, 2))
      .toEqual([failTimeAfterPortion(PORTIONS), failTimeAfterPortion(PORTIONS)]);
    expect(FAIL_AFTER_PORTION_S % PORTION_SPACING_S).not.toBe(0);
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

describe("process-safety: the MTT default is read from the records", () => {
  it("is the lowest Tb among the witness's component records", () => {
    const raw = tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles;
    const tbs = recordBoilingPoints(raw);
    expect(tbs.length).toBe(4);
    const low = tbs[0]!;
    const rec = tree(`tutorials/${SAFETY_WITNESS_BATCH}/constant/components/${low.component}.dat`);
    expect(Number(/^Tb\s+([0-9.]+)\s*;/m.exec(rec)![1])).toBe(low.Tb);
    for (const t of tbs) expect(t.Tb).toBeGreaterThanOrEqual(low.Tb);
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
  it("every equation parses", () => {
    for (const s of SAFETY_STEPS) if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
  });
  it("the cited engine lines are the cooling-failure branch", () => {
    const m = /BatchReactor\.cpp:(\d+)-(\d+)/.exec(all);
    expect(m).not.toBeNull();
    const lines = tree("src/unitOperations/batch/BatchReactor.cpp").split("\n");
    const lo = Number(m![1]), hi = Number(m![2]);
    expect(lines[lo - 1]).toContain('key == "adiabatic"');
    expect(lines.slice(lo - 1, hi).join("\n")).toContain("[cooling failure]");
  });
});

describe("process-safety: the engine's own run outputs", () => {
  it("the batch witness: held at T_p until 600 s, then the MTSR its golden pins", () => {
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_BATCH}`, "trajectory.csv"));
    const f = readFailure(traj)!;
    expect(f.T0).toBe(330);
    expect(at({ t: traj.t, y: traj.vars["reactor.T"]! }, 600)).toBe(330);
    expect(f.Tmax).toBeCloseTo(golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final"), 3);
    expect(f.stillRising).toBe(false);
    //  The accumulation starts at 1 in a batch.
    expect(accumulation(traj)!.y[0]).toBe(1);
  });
  it("the semi-batch witness: the accumulation is a fraction of the dosed total, and stays small", () => {
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_SEMI}`, "trajectory.csv"));
    const X = accumulation(traj)!;
    //  The first portion (1/16) is in the reactor at t = 0.
    expect(X.y[0]).toBeCloseTo(1 / PORTIONS, 12);
    //  Never more than a quarter of the ethanol unreacted in the reactor.
    expect(Math.max(...X.y)).toBeLessThan(0.25);
    const f = readFailure(traj)!;
    expect(f.Tmax).toBeCloseTo(golden(`tutorials/${SAFETY_WITNESS_SEMI}`, "reactor", "T_final"), 3);
    //  ... and it ends far below the batch's.
    expect(f.Tmax).toBeLessThan(golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final") - 40);
  });
  it("the ammonia loops: the gross margins the page reports, and 'about four times' the recycled ammonia", () => {
    const g150 = golden(`tutorials/${SAFETY_WITNESS_NH3_150}`, "economics", "grossMargin_RM_UT");
    const g50 = golden(`tutorials/${SAFETY_WITNESS_NH3_50}`, "economics", "grossMargin_RM_UT");
    expect(g50).toBeLessThan(g150);
    const rec = (w: string) => witnessOutput(`tutorials/${w}`, "converged/Recycle");
    const ratio = convergedFlow(rec(SAFETY_WITNESS_NH3_50), "NH3")
      / convergedFlow(rec(SAFETY_WITNESS_NH3_150), "NH3");
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
    const t = METHOD_TOOLS.find((m) => m.id === "process-safety")!.teaches;
    expect(t).toContain("four times the ammonia");
    //  Less hydrogen converted per pass at 50 bar, from the converter's own
    //  feed and effluent.
    const pass = (w: string) => {
      const feed = witnessOutput(`tutorials/${w}`, "converged/PreheatedFeed");
      const out = witnessOutput(`tutorials/${w}`, "converged/HotEffluent");
      return 1.5 * (convergedFlow(out, "NH3") - convergedFlow(feed, "NH3"))
        / convergedFlow(feed, "H2");
    };
    expect(pass(SAFETY_WITNESS_NH3_50)).toBeLessThan(pass(SAFETY_WITNESS_NH3_150));
  });
});
