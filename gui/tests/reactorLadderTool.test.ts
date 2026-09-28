/*---------------------------------------------------------------------------*\
  The reactor-ladder EduTool (C23), held to its witness.

  What is pinned: every piece of mathematics parses under KaTeX's strict
  mode; every display equation's section glosses its symbols; the knobs land
  on the slots the witness declares (the approach knob on the SECOND
  `temperatureApproach`, the one on the `approach` reactor); and the numbers
  the lesson QUOTES agree with the witness's own golden, so a lesson that
  drifted from the engine fails here rather than on a student's desk.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LADDER_LIMITS, LADDER_SECTIONS,
} from "../src/ui/methods/reactorLadderLesson.js";
import {
  LADDER_COLUMNS, LADDER_WITNESS, ladderOverrides, T_KNOB,
} from "../src/ui/methods/ReactorLadderTool.js";
import { applyDictOverride } from "../src/case/methodRun.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const read = (rel: string): string =>
  readFileSync(new URL(`../../tutorials/${LADDER_WITNESS}/${rel}`,
    import.meta.url), "utf-8");

const FLOWSHEET = read("system/flowsheetDict");
const FEED = read("0/feed");
const EXPECTED = read("expected");

/** A golden `kpi <unit> <key> <value>` row, as a number. */
function golden(unit: string, key: string): number {
  const re = new RegExp(`^kpi\\s+${unit}\\s+${key}\\s+(\\S+)`, "m");
  const m = EXPECTED.match(re);
  if (!m) throw new Error(`no golden row kpi ${unit} ${key}`);
  return Number(m[1]);
}

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const section = (id: string) => LADDER_SECTIONS.find((s) => s.id === id)!;

describe("the reactor-ladder lesson", () => {
  it("is registered, live, under reaction engineering", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "reactor-ladder");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("Reaction engineering");
  });

  it("parses every piece of mathematics it carries", () => {
    const tex: string[] = [];
    for (const s of LADDER_SECTIONS) {
      s.body.split("$").forEach((p, i) => { if (i % 2 === 1) tex.push(p); });
      if (s.eq) tex.push(s.eq);
      tex.push(...(s.where ?? []).map((g) => g.sym));
    }
    expect(tex.length).toBeGreaterThan(20);
    for (const t of tex) expect(texParses(t), `does not parse: ${t}`).toBe(true);
  });

  it("glosses the symbols of every section that shows an equation", () => {
    for (const s of LADDER_SECTIONS) {
      if (!s.eq) continue;
      expect(s.where?.length ?? 0, s.id).toBeGreaterThan(0);
    }
  });

  it("climbs in the design's order: rung 1, then 2, then 3", () => {
    const rungs = LADDER_SECTIONS.map((s) => s.rung).filter((r) => r > 0);
    expect([...rungs].sort()).toEqual(rungs);
    expect(LADDER_COLUMNS.map((c) => c.rung)).toEqual([1, 2, 2, 2, 3]);
  });

  it("quotes the limit the engine computes, and the hand check reproduces it", () => {
    const K = golden("limit", "Kp_wgs");
    const X = golden("limit", "conversion_wgs");
    expect(Math.sqrt(K) / (1 + Math.sqrt(K))).toBeCloseTo(X, 9);
    const body = prose(section("rung2").body);
    expect(body).toContain(K.toFixed(4));
    expect(body).toContain(X.toFixed(4));
  });

  it("declares a conversion above the limit, as the lesson says", () => {
    expect(golden("stoich", "conversion")).toBeGreaterThan(
      golden("limit", "conversion_wgs"));
    expect(prose(section("rung1").body)).toContain("$X = 0.90$");
  });

  it("the Gibbs reactor and the PFR meet the limit, never exceed it", () => {
    const X = golden("limit", "conversion_wgs");
    //  equimolar feed, one mole in gives one mole out: y_CO2 = X / 2
    const yCO2 = Number(EXPECTED.match(/^kpi\s+gibbs\s+y_CO2\s+(\S+)/m)![1]);
    expect(2 * yCO2).toBeCloseTo(X, 6);
    expect(golden("kinetic", "X_limiting")).toBeLessThanOrEqual(X + 1e-9);
  });

  it("the approach reactor takes K above T for the exothermic shift", () => {
    expect(golden("approach", "T_Kp_wgs")).toBe(625);
    expect(golden("approach", "conversion_wgs")).toBeLessThan(
      golden("limit", "conversion_wgs"));
  });

  it("names the liquid-basis volume among its limits", () => {
    const l = LADDER_LIMITS.find((x) => x.id === "volume-is-a-shape");
    expect(l?.body).toContain("PFR.cpp:804");
  });
});

describe("the knobs land on the slots the witness declares", () => {
  it("writes every override without a refusal", () => {
    for (const o of ladderOverrides(T_KNOB.max, 40, 0.6)) {
      const text = o.file === "0/feed" ? FEED : FLOWSHEET;
      expect(() => applyDictOverride(text, o), `${o.file} ${"key" in o ? o.key : ""}`)
        .not.toThrow();
    }
  });

  it("puts the approach on the approach reactor and leaves the limit at zero", () => {
    let text = FLOWSHEET;
    for (const o of ladderOverrides(600, 40, 0.9))
      if (o.file === "system/flowsheetDict") text = applyDictOverride(text, o);
    const limitBlock = text.slice(text.indexOf("name        limit;"),
      text.indexOf("name        approach;"));
    const approachBlock = text.slice(text.indexOf("name        approach;"),
      text.indexOf("name        gibbs;"));
    expect(limitBlock).toMatch(/temperatureApproach\s+0;/);
    expect(approachBlock).toMatch(/temperatureApproach\s+40;/);
  });
});
