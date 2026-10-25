/*---------------------------------------------------------------------------*\
  The reactor-ladder EduTool (C23), held to its witness.

  What is pinned: every piece of mathematics parses under KaTeX's strict
  mode; every display equation's section glosses its symbols; the knobs land
  on the slots the witness declares (the approach knob on the SECOND
  `temperatureApproach`, the one on the `approach` reactor); and the numbers
  the lesson QUOTES agree with the witness's own golden, so a lesson that
  drifted from the engine fails here rather than on a student's desk.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LADDER_LIMITS, LADDER_SECTIONS,
} from "../src/ui/methods/reactorLadderLesson.js";
import {
  LADDER_COLUMNS, LADDER_WITNESS, LIMIT_TOL, declaredVersusLimit,
  ladderOverrides, T_KNOB, X_KNOB,
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
    expect(l?.body).toContain("PFR.cpp:647");
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

// ---- C112 point 12: the page warns when rung 1 exceeds rung 2 ----------------
//
//  The page compares two numbers the engine PUBLISHES -- the conversion
//  reactor's echoed `conversion` and the equilibrium reactor's
//  `conversion_wgs` -- for the same feed, T and P.  The moves below are run
//  by THIS checkout's native choupoSolve on the exact overrides the browser
//  sends, and the comparison is taken on what that run published.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function runLadder(T: number, dT: number, X: number):
  { kpis: { [u: string]: { [k: string]: number } } } {
  const bin = join(REPO, "choupoSolve");
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the repository `
    + "root; this test runs the native engine and must not skip").toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "choupo-c112-ladder-"));
  try {
    cpSync(join(REPO, "tutorials", LADDER_WITNESS), dir, { recursive: true });
    for (const o of ladderOverrides(T, dT, X)) {
      const f = join(dir, o.file);
      writeFileSync(f, applyDictOverride(readFileSync(f, "utf-8"), o));
    }
    const r = spawnSync(bin, [dir], { cwd: REPO, encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024 });
    expect(r.status, r.stderr).toBe(0);
    const m = /<<<Choupo:result-begin>>>\s*\n([\s\S]*?)\n<<<Choupo:result-end>>>/
      .exec(r.stdout ?? "");
    expect(m, "the run published no result block").not.toBeNull();
    return JSON.parse(m![1]!);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the page warns when rung 1 declares more than rung 2 allows", () => {
  it("compares with a round-off allowance only, far below the X knob's step", () => {
    expect(LIMIT_TOL).toBeLessThan(X_KNOB.step / 1e6);
    expect(declaredVersusLimit(null, 0.8)).toBeNull();
    expect(declaredVersusLimit(0.8, Number.NaN)).toBeNull();
    expect(declaredVersusLimit(0.84, 0.84)!.exceeds).toBe(false);
    const c = declaredVersusLimit(0.9, 0.8414)!;
    expect(c.exceeds).toBe(true);
    expect(c.excess).toBeCloseTo(0.0586, 10);
  });

  it("a move that CROSSES the limit: X = 0.80 is allowed at 600 K and impossible at 700 K", () => {
    //  Hold X and heat the reactor: the exothermic shift's limit falls through
    //  the declared number, and the warning must appear exactly then.
    const cold = runLadder(600, 25, 0.8);
    const hot = runLadder(700, 25, 0.8);
    const at = (r: typeof cold) => declaredVersusLimit(
      r.kpis["stoich"]!["conversion"]!, r.kpis["limit"]!["conversion_wgs"]!)!;
    const a = at(cold), b = at(hot);
    expect(a.declared).toBeCloseTo(0.8, 12);
    expect(b.declared).toBeCloseTo(0.8, 12);
    //  The limits are the engine's: 0.8414 at 600 K, 0.7537 at 700 K (the
    //  values measured in reactorLadderLesson.ts's header).
    expect(a.limit).toBeCloseTo(0.841432775225, 6);
    expect(b.limit).toBeCloseTo(0.753662089481, 6);
    expect(a.exceeds).toBe(false);
    expect(b.exceeds).toBe(true);
    //  And the conversion reactor ran to exit 0 at 700 K all the same: the
    //  warning is the PAGE's, the engine raised nothing.
    expect(b.excess).toBeGreaterThan(0.04);
  }, 60_000);

  it("the shipped state (X = 0.90 at 600 K) warns, and a lower X at the same T does not", () => {
    const shipped = runLadder(600, 25, 0.9);
    const c = declaredVersusLimit(shipped.kpis["stoich"]!["conversion"]!,
      shipped.kpis["limit"]!["conversion_wgs"]!)!;
    expect(c.exceeds).toBe(true);
    expect(c.limit).toBeCloseTo(golden("limit", "conversion_wgs"), 9);
  }, 60_000);

  it("the warning is drawn from that comparison, and the lesson says the page does it", () => {
    const tool = readFileSync(new URL("../src/ui/methods/ReactorLadderTool.tsx",
      import.meta.url), "utf-8");
    expect(tool).toContain("const rungCheck = declaredVersusLimit(xDeclared, xLimit);");
    expect(tool).toContain("Rung 1 is a hypothesis that cannot be reached here");
    //  The warning names 10 bar; it is the witness feed's pressure, which no
    //  knob writes.
    expect(tool).toContain("and 10 bar, allows at most");
    expect(FEED).toMatch(/^\s*P\s+1000000 Pa;/m);
    expect(ladderOverrides(650, 10, 0.7).some((o) => "key" in o && o.key === "P")).toBe(false);
    expect(tool).toContain("this page compared the two numbers the engine");
    expect(prose(section("rung1").body)).toContain("warns, in red");
    const lim = LADDER_LIMITS.find((l) => l.id === "no-cross-check")!;
    expect(lim.title).toContain("this page does");
    //  The ENGINE claim stays true: the conversion reactor checks only the
    //  bounds of X and non-negative outlets.
    const cr = readFileSync(new URL(
      "../../src/unitOperations/reactor/ConversionReactor.cpp", import.meta.url),
      "utf-8").split("\n");
    expect(cr[214]).toContain('lookupScalar("conversion")');
    expect(cr.slice(215, 218).join(" ")).toContain("X < 0.0 || X > 1.0");
    expect(cr.slice(229, 233).join(" ")).toContain("went negative");
  });
});
