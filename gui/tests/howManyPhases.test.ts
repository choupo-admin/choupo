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
  howManyPhases -- "How many phases? Gibbs energy and the tangent plane",
  held to the engine.

  THE CLAIM HELD: every curve of the page is a table of the engine's own run of
  tutorials/props/scan/binary04_tangent_plane_water_nbutanol in THIS tree
  (witnessOutputs.ts: the series views under postProcessing/lle and the log),
  and what the page adds -- the tangent algebra, the lever rule, the
  tangent-plane distance for a feed on the slider -- is arithmetic on those
  activities that agrees with the engine where the engine also computes it:

    * g_mix in J/mol equals R T sum x_i ln a_i of the activity table;
    * for the engine's declared feed the page's tm(y) equals the engine's
      `tpd` table to 1e-9, and tm(z) = 0;
    * the engine's two liquids have equal activities (the iso-activity
      conditions) and tm of each, seen from the other, is zero;
    * the engine's phase fractions are the lever rule on its two liquids;
    * the page's verdict (a negative tm somewhere) is the engine's Michelsen
      verdict at the declared feed, and follows the binodal elsewhere.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { REPO } from "./witnessOutputs.js";
import { witnessOutput, witnessOutputFiles } from "./witnessRead.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  CASE_T_K, ENGINE_FEED, FEED_KNOB, HowManyPhasesTool, HowManyPhasesView, PHASES_WITNESS, quotedLines,
} from "../src/ui/methods/HowManyPhasesTool.js";
import { PHASES_LIMITS, PHASES_QUIZ, PHASES_STEPS } from "../src/ui/methods/howManyPhasesLesson.js";
import {
  commonTangent, gOverRT, isoActivityPairs, lever, nodeOf, phasesFromViews, stationaryPoints,
  tangentAt, tmAt, tmCurve, verdictAt, type PhasesData,
} from "../src/ui/methods/phaseTangent.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const CASE = "tutorials/props/scan/binary04_tangent_plane_water_nbutanol";
const R_GAS = 8.314462618; // src/core/Constants.H:47

function witnessData(): PhasesData {
  const files = witnessOutputFiles(CASE, "postProcessing/lle");
  const get = (view: string): string | undefined =>
    files.find(([p]) => p.endsWith(`/${view}.csv`) || p === `${view}.csv`)?.[1];
  const d = phasesFromViews(get, CASE_T_K);
  if (!d) throw new Error("the witness run did not write the views the page reads");
  return d;
}

const CLAIMS: Record<string, [string, number, number | undefined, string | RegExp]> = {
  "IsothermalFlash.cpp:584-605": ["src/unitOperations/flash/IsothermalFlash.cpp", 584, 605,
    /LL flash via direct minimisation[\s\S]*Direct minimisation cannot fall into the K=1 saddle/],
  "IsothermalFlash.cpp:607-608": ["src/unitOperations/flash/IsothermalFlash.cpp", 607, 608,
    /Decision-only Michelsen TPD[\s\S]*michelsenTPD\(thermo\.phase\(phaseAlpha\), in\.T, in\.P, in\.z\)/],
  "StabilityTest.cpp:63-72": ["src/solver/StabilityTest.cpp", 63, 72,
    /scalar evalTm[\s\S]*tm \+= Yi \* \(std::log\(Yi\) \+ lnGamma\[i\] - h\[i\] - 1\.0\)/],
  "PropertyScanBinary.cpp:259-260": ["src/propertyOps/PropertyScanBinary.cpp", 259, 260,
    /const scalar tm = x1 \* \(std::log\(x1\) \+ lg\[0\] - hz1\)/],
};

describe("the page's data is the engine's run of binary04 (witness, this tree)", () => {
  const d = witnessData();
  const k = nodeOf(d, ENGINE_FEED);

  it("reads 99 interior nodes, two liquids with their activities and the engine's verdict", () => {
    expect(d.x.length).toBe(99);
    expect(d.x[0]).toBeCloseTo(0.01, 12);
    expect(d.binodal.length).toBe(2);
    expect(d.binAct.length).toBe(2);
    expect(d.stationary).not.toBeNull();
    expect(d.x[k]).toBeCloseTo(ENGINE_FEED, 12);
    expect(d.stationary!.feed).toBeCloseTo(ENGINE_FEED, 12);
  });

  it("g_mix in J/mol is R T sum x_i ln a_i of the activity table (1e-9 relative)", () => {
    for (let j = 0; j < d.x.length; j++) {
      const g = R_GAS * CASE_T_K * gOverRT(d, j);
      expect(Math.abs(g / d.gJ[j]! - 1), `node ${j}`).toBeLessThan(1e-9);
    }
    for (const b of d.binodal) {
      const a = d.binAct.find((r) => Math.abs(r.x - b.x) < 1e-9)!;
      const g = R_GAS * CASE_T_K * (b.x * Math.log(a.a1) + (1 - b.x) * Math.log(a.a2));
      expect(Math.abs(g / b.gJ - 1)).toBeLessThan(1e-9);
    }
  });

  it("for the engine's declared feed the page's tm(y) equals the engine's tpd table (1e-9), and tm(z) = 0", () => {
    expect(d.tpd.length).toBe(d.x.length);
    const own = tmCurve(d, k).filter((p) => !p.binodal);
    let worst = 0;
    for (let j = 0; j < d.tpd.length; j++) {
      expect(own[j]!.y).toBeCloseTo(d.tpd[j]!.y, 12);
      worst = Math.max(worst, Math.abs(own[j]!.tm - d.tpd[j]!.tm));
    }
    expect(worst).toBeLessThan(1e-9);
    expect(Math.abs(d.tpd[k]!.tm)).toBeLessThan(1e-9);
    expect(Math.abs(own[k]!.tm)).toBeLessThan(1e-12);
  });

  it("the engine's two liquids have equal activities and tm = 0 seen from each other", () => {
    const [A, B] = d.binAct as [typeof d.binAct[0], typeof d.binAct[0]];
    expect(Math.abs(A.a1 / B.a1 - 1)).toBeLessThan(1e-4);
    expect(Math.abs(A.a2 / B.a2 - 1)).toBeLessThan(1e-4);
    const ct = commonTangent(d)!;
    // the tangent at the water-rich liquid is the common tangent: slope ln a1 - ln a2
    expect(Math.abs((Math.log(A.a1) - Math.log(A.a2)) - ct.slope)).toBeLessThan(1e-3);
    // tm of the other liquid, with the feed at this one, to the flash's tolerance
    const tmBA = B.x * (Math.log(B.a1) - Math.log(A.a1)) + (1 - B.x) * (Math.log(B.a2) - Math.log(A.a2));
    const tmAB = A.x * (Math.log(A.a1) - Math.log(B.a1)) + (1 - A.x) * (Math.log(A.a2) - Math.log(B.a2));
    expect(Math.abs(tmBA)).toBeLessThan(1e-4);
    expect(Math.abs(tmAB)).toBeLessThan(1e-4);
  });

  it("the engine's phase fractions are the lever rule on its two liquids at its feed", () => {
    const lv = lever(d, ENGINE_FEED)!;
    expect(lv.inside).toBe(true);
    expect(lv.betaLo).toBeCloseTo(d.binodal[0]!.beta, 6);
    expect(lv.betaHi).toBeCloseTo(d.binodal[1]!.beta, 6);
    expect(d.binodal[0]!.beta + d.binodal[1]!.beta).toBeCloseTo(1, 12);
  });

  it("the splitting feed's mixture sits on the tangent and below the curve", () => {
    const ct = commonTangent(d)!;
    const gLine = ct.intercept + ct.slope * ENGINE_FEED;
    expect(gOverRT(d, k)).toBeGreaterThan(gLine);
    // the lever rule on the two liquids' g equals the tangent line's value at z
    const lv = lever(d, ENGINE_FEED)!;
    expect(lv.betaLo * ct.ga + lv.betaHi * ct.gb).toBeCloseTo(gLine, 9);
  });

  it("the engine's Michelsen test says unstable at its feed, and the page's grid agrees", () => {
    const e = d.stationary!;
    expect(e.unstable).toBe(true);
    expect(e.tmMin).toBeLessThan(0);
    const v = verdictAt(d, k);
    expect(v.unstable).toBe(true);
    // the engine's incipient phase and the page's lowest-tm composition are in the same well
    expect(Math.abs(e.y1 - v.y)).toBeLessThan(0.05);
    // the engine's form (1 - sum Y) and the page's form share their sign at the minimum
    expect(Math.sign(e.tmMin)).toBe(Math.sign(v.tmMin));
  });

  it("the page's verdict follows the binodal for every feed on the grid", () => {
    const xa = d.binodal[0]!.x, xb = d.binodal[1]!.x;
    for (let j = 0; j < d.x.length; j++) {
      const z = d.x[j]!;
      const edge = Math.min(Math.abs(z - xa), Math.abs(z - xb));
      if (edge < 0.011) continue; // within one node of a binodal composition the grid cannot decide
      const inside = z > xa && z < xb;
      expect(verdictAt(d, j).unstable, `z = ${z}`).toBe(inside);
      expect(lever(d, z)!.inside).toBe(inside);
    }
  });

  it("outside the two liquids the equal-activity pair gives a fraction below 0 or above 1", () => {
    for (const z of [0.2, 0.4, 0.99]) {
      const lv = lever(d, z)!;
      expect(lv.inside).toBe(false);
      expect(lv.betaLo < 0 || lv.betaLo > 1 || lv.betaHi < 0 || lv.betaHi > 1).toBe(true);
    }
  });

  it("the stationary points of tm sit where the tangent has the slope of g (a grid reading)", () => {
    const pts = stationaryPoints(d, k);
    expect(pts.some((p) => p.kind === "trivial" && Math.abs(p.y - ENGINE_FEED) < 1e-12)).toBe(true);
    const mins = pts.filter((p) => p.kind === "minimum" && p.tm < 0);
    expect(mins.length).toBeGreaterThanOrEqual(1);
    for (const m of mins) {
      const j = nodeOf(d, m.y);
      // slope of g at the minimum equals the tangent's, to the grid's resolution
      const dg = (gOverRT(d, j + 1) - gOverRT(d, j - 1)) / (d.x[j + 1]! - d.x[j - 1]!);
      expect(Math.abs(dg - tangentAt(d, k).slope)).toBeLessThan(0.5);
    }
  });

  it("the equal-activity pairs read off the sampled curves are one, at the engine's binodal", () => {
    const pairs = isoActivityPairs(d);
    expect(pairs.length).toBe(1);
    expect(Math.abs(pairs[0]!.lo - d.binodal[0]!.x)).toBeLessThan(0.01);
    expect(Math.abs(pairs[0]!.hi - d.binodal[1]!.x)).toBeLessThan(0.01);
  });

  it("tmAt at the engine's own binodal activities is the same distance as the table's nodes", () => {
    const b = d.binAct[0]!;
    const j = nodeOf(d, b.x);
    expect(Math.abs(tmAt(d, k, d.x[j]!, d.a1[j]!, d.a2[j]!) - d.tpd[j]!.tm)).toBeLessThan(1e-9);
  });
});

describe("the engine's log quoted on the page", () => {
  const log = witnessOutput(CASE, "log.choupoProps");
  const q = quotedLines(log);
  it("holds the flash's own Michelsen line, the binodal line and the stability line", () => {
    expect(q.some((l) => /Michelsen TPD stability test/.test(l))).toBe(true);
    expect(q.some((l) => /unstable = YES|tm_min/.test(l))).toBe(true);
    expect(q.some((l) => l.startsWith("[binaryLLE] two liquid phases"))).toBe(true);
    expect(q.some((l) => l.startsWith("[tangentPlane]") && /UNSTABLE/.test(l))).toBe(true);
  });
  it("the binodal line of the log is the binodal table (6 figures)", () => {
    const d = witnessData();
    const m = /x1 = ([0-9.]+) \| ([0-9.]+)/.exec(log)!;
    // the log prints the water-rich liquid first; the page's table is in increasing x1
    expect(Number(m[1])).toBeCloseTo(d.binodal[1]!.x, 5);
    expect(Number(m[2])).toBeCloseTo(d.binodal[0]!.x, 5);
  });
  it("the flash's tm_min (its own form) is the stationary table's, 4 figures", () => {
    const d = witnessData();
    const m = /tm_min\s+=\s+([-+0-9.e]+)/.exec(log)!;
    expect(Math.abs(Number(m[1]) / d.stationary!.tmMin - 1)).toBeLessThan(2e-3);
  });
});

describe("the bundled case and the page's constants", () => {
  const raws = tutorialByName(PHASES_WITNESS)!.files.rawFiles!;
  const props = raws["system/propsDict"]!;
  it("the case's T, grid and feed are the page's constants", () => {
    expect(Number(/state\s*\{\s*T\s+([0-9.]+)\s*K/.exec(props)![1])).toBe(CASE_T_K);
    expect(Number(/grid\s*\{\s*n\s+(\d+)/.exec(props)![1])).toBe(100);
    expect(Number(/stability\s*\{\s*feed\s*\{\s*water\s+([0-9.]+)/.exec(props)![1])).toBe(ENGINE_FEED);
    expect(FEED_KNOB.def).toBe(ENGINE_FEED);
  });
  it("the slider steps on the engine's nodes", () => {
    expect(FEED_KNOB.step).toBeCloseTo(1 / 100, 12);
    expect(FEED_KNOB.min * 100).toBeCloseTo(Math.round(FEED_KNOB.min * 100), 9);
    expect(FEED_KNOB.max * 100).toBeCloseTo(Math.round(FEED_KNOB.max * 100), 9);
  });
  it("every engine line the page cites says what the page claims for it", () => {
    const text = [
      "src/ui/methods/howManyPhasesLesson.ts", "src/ui/methods/HowManyPhasesTool.tsx",
      "src/ui/methods/phaseTangent.ts",
    ].map((f) => readFileSync(join(REPO, "gui", f), "utf-8")).join("\n");
    const cited = new Set([...text.matchAll(/(?:IsothermalFlash|StabilityTest|PropertyScanBinary)\.cpp:\d+(?:-\d+)?/g)].map((m) => m[0]));
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const c of Object.keys(CLAIMS)) expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
    for (const [c, [rel, a, b, want]] of Object.entries(CLAIMS)) {
      const src = readFileSync(join(REPO, rel), "utf-8").split("\n");
      const t = src.slice(a - 1, b ?? a).join("\n");
      if (typeof want === "string") expect(t, c).toContain(want);
      else expect(t, c).toMatch(want);
    }
  });
});

describe("the page drawn from the witness run (initial state: the engine's own feed)", () => {
  const d = witnessData();
  const log = witnessOutput(CASE, "log.choupoProps");
  const h = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(HowManyPhasesView, { d, log, busy: false, err: null, ran: true })));
  const readout = (key: string): string => {
    const m = new RegExp(`data-readout="${key}"[^>]*>(.*?)</div></div>|data-readout="${key}"[^>]*>.*?<p[^>]*>(.*?)</p>`, "s").exec(h);
    return (m?.[0] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  };
  it("shows the split, the lever fractions of the engine and the engine's verdict", () => {
    expect(readout("verdict")).toContain("splits into two liquids");
    expect(readout("betaLo")).toContain(String(Number(d.binodal[0]!.beta.toPrecision(4))));
    expect(readout("betaHi")).toContain(String(Number(d.binodal[1]!.beta.toPrecision(4))));
    expect(readout("tmVerdict")).toContain("unstable");
    expect(h).toContain("data-engine-verdict");
    expect(h).toContain("UNSTABLE");
    expect(h).toContain("data-engine-log");
    expect(h).toContain("Michelsen TPD stability test");
  });
  it("draws the five charts and the four solutions of equal activities", () => {
    for (const c of ["gmix", "tangent", "activity", "tpd"]) expect(h).toContain(`data-chart="${c}"`);
    for (const r of ["trivial", "true", "found", "wrong-number"]) expect(h).toContain(`data-iso-row="${r}"`);
  });
  it("says so when the run left no tables", () => {
    const e = renderToStaticMarkup(createElement(MantineProvider, null,
      createElement(HowManyPhasesView, { d: null, log: null, busy: false, err: null, ran: true })));
    expect(e).toContain("data-no-tables");
  });
});

describe("the page", () => {
  const html = (c: () => JSX.Element): string =>
    renderToStaticMarkup(createElement(MantineProvider, null, createElement(c)));

  it("is registered on the Separations shelf, live, with its theory anchor", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "how-many-phases")!;
    expect(t.label).toBe("How many phases? Gibbs energy and the tangent plane");
    expect(t.discipline).toBe("Separations & phase equilibria");
    expect(t.status).toBe("live");
    expect(t.theory).toBe("sec:tangent-plane");
  });
  it("renders its five steps, the cards, the quiz and the limits", () => {
    const h = html(HowManyPhasesTool);
    expect(h).toContain("How many phases? Gibbs energy and the tangent plane");
    for (const c of ["gmix", "tangent", "isoactivity", "tpd", "engine"])
      expect(h).toContain(`data-card="${c}"`);
    expect(h).toContain("What this does not show");
    for (const s of PHASES_STEPS) expect(h).toContain(s.title.replace(/'/g, "&#x27;"));
    expect(PHASES_STEPS.length).toBe(5);
    expect(PHASES_LIMITS.length).toBeGreaterThanOrEqual(5);
    expect(PHASES_QUIZ.length).toBeGreaterThanOrEqual(4);
  });
});
