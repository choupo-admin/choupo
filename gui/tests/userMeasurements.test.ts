/*---------------------------------------------------------------------------*\
  userMeasurements -- C289: the points a user brings to a fitted record.
  The parse, the refusal of a malformed file by name, the hash match and
  mismatch, the outlier rule, the run plan and the reading of the engine's
  answer.  The engine's CSV below is a RECORDED SHAPE (the scan writer's
  header and `nan`), not a model evaluated here.
\*---------------------------------------------------------------------------*/

import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EXPLORER_GUIDE_USER_POINTS, hashVerdict, isOutlier, outlierRule, parseMeasurementsCsv, sha256Hex,
  type Subject,
} from "../src/case/userMeasurements.js";
import { userResults, userRunPlan } from "../src/case/userMeasurementsSynth.js";

//  older Node has no global WebCrypto; browsers always do
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const PAIR: Subject = { kind: "pair", components: ["methanol", "water"] };
const PURE: Subject = { kind: "component", component: "water" };
const fixture = readFileSync(new URL("./fixtures/own_txy.csv", import.meta.url), "utf-8");

describe("the accepted format", () => {
  it("parses the fixture T-x-y file, converting C to K and kPa to Pa", () => {
    const r = parseMeasurementsCsv(fixture, PAIR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.kind).toBe("txy");
    expect(r.data.xComponent).toBe("methanol");
    expect(r.data.points).toHaveLength(3);
    expect(r.data.points[0]!.T).toBeCloseTo(91.2 + 273.15, 10);
    expect(r.data.points[0]!.P).toBeCloseTo(101325, 6);
    expect(r.data.points[1]!.y).toBe(0.78);
  });
  it("parses a P-x-y file and a pure Psat file", () => {
    const pxy = parseMeasurementsCsv("x[water]/-,P_bubble/bar,T/K\n0.2,0.5,330\n", PAIR);
    expect(pxy.ok && pxy.data.kind).toBe("pxy");
    expect(pxy.ok && pxy.data.points[0]!.P).toBeCloseTo(5e4, 6);
    const ps = parseMeasurementsCsv("T/C,Psat/kPa\n80,47.4\n100,101.3\n", PURE);
    expect(ps.ok && ps.data.kind).toBe("psat");
    expect(ps.ok && ps.data.points[1]!.T).toBeCloseTo(373.15, 10);
  });
});

describe("a malformed file is refused whole, by name", () => {
  const bad = (text: string, subject: Subject, re: RegExp) => {
    const r = parseMeasurementsCsv(text, subject);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toMatch(re);
  };
  it("empty, no measured column, bad header, unknown unit", () => {
    bad("", PAIR, /empty/);
    bad("a/-,b/-\n1,2\n", PAIR, /no measured column/);
    bad("x[methanol],T_bubble/K,P/kPa\n0.1,350,101\n", PAIR, /name\/unit/);
    bad("x[methanol]/-,T_bubble/F,P/kPa\n0.1,350,101\n", PAIR, /unit "F"/);
  });
  it("a bad row names its line", () => {
    bad("x[methanol]/-,T_bubble/K,P/kPa\n0.1,350,101\n0.2,abc,101\n", PAIR, /line 3: "abc"/);
    bad("x[methanol]/-,T_bubble/K,P/kPa\n0.1,350\n", PAIR, /line 2: 2 cell/);
    bad("x[methanol]/-,T_bubble/K,P/kPa\n1.5,350,101\n", PAIR, /line 2:.*outside \[0, 1\]/);
    bad("x[methanol]/-,T_bubble/K,P/kPa\n0.5,-5,101\n", PAIR, /temperature is not positive/);
  });
  it("a column the kind does not accept, a foreign component, the wrong subject", () => {
    bad("x[methanol]/-,T_bubble/K,P/kPa,foo/-\n0.1,350,101,1\n", PAIR, /"foo" is not accepted/);
    bad("x[ethanol]/-,T_bubble/K,P/kPa\n0.1,350,101\n", PAIR, /not a component of this pair/);
    bad("T/K,Psat/kPa\n350,40\n", PAIR, /single component/);
    bad("x[methanol]/-,T_bubble/K,P/kPa\n0.1,350,101\n", PURE, /pair's record/);
    bad("x[methanol]/-;T_bubble/K;P/kPa\n0.1;350;101\n", PAIR, /not comma separated/);
    bad("x[methanol]/-,T_bubble/K\n0.1,350\n", PAIR, /needs a P/);
    bad("x[methanol]/-,T_bubble/K,P/kPa\n", PAIR, /no data rows/);
  });
});

describe("the hash", () => {
  const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  it("sha256Hex is the standard digest of the bytes", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(abc);
  });
  it("a claimed file matches its declared hash, or says plainly that it does not", () => {
    expect(hashVerdict(abc, abc.toUpperCase(), true).state).toBe("match");
    const mm = hashVerdict(abc, "0".repeat(64), true);
    expect(mm.state).toBe("mismatch");
    expect(mm.text).toMatch(/MISMATCH/);
  });
  it("an unclaimed file is not compared; a record with no hash cannot be checked", () => {
    expect(hashVerdict(abc, abc, false).state).toBe("notClaimed");
    expect(hashVerdict(abc, "", true).state).toBe("noDeclaredHash");
  });
});

describe("the outlier rule is stated in what the record provides", () => {
  it("3 x the held-out AAD; else 3 x the band; else nothing", () => {
    const a = outlierRule({ aadHeldOutPct: 0.2, acceptanceMaxAADPct: 1 });
    expect(a.thresholdRelPct).toBeCloseTo(0.6, 12);
    expect(a.text).toMatch(/held-out AAD/);
    expect(outlierRule({ aadHeldOutPct: null, acceptanceMaxAADPct: 1 }).thresholdRelPct).toBe(3);
    const none = outlierRule(null);
    expect(none.thresholdRelPct).toBeNull();
    expect(isOutlier(50, none)).toBe(false);
  });
  it("marks strictly above the threshold, either sign", () => {
    const r = outlierRule({ aadHeldOutPct: 0.2, acceptanceMaxAADPct: null });
    expect(isOutlier(0.6, r)).toBe(false);
    expect(isOutlier(0.61, r)).toBe(true);
    expect(isOutlier(-0.61, r)).toBe(true);
    expect(isOutlier(null, r)).toBe(false);
  });
});

describe("the run plan asks the engine AT the points; the reading is engine minus measured", () => {
  it("txy: one points op and one curve op per held pressure", () => {
    const r = parseMeasurementsCsv(fixture, PAIR);
    if (!r.ok) throw new Error("fixture");
    const plan = userRunPlan({ data: r.data, components: ["methanol", "water"] });
    expect(plan.property).toBe("T_bubble");
    expect(plan.ops.map((o) => o.name)).toEqual(["pts_0", "curve_0"]);
    const ops = (plan.files.propsDict as { operations: { vary: { points?: number[] } }[] }).operations;
    expect(ops[0]!.vary.points).toEqual([0.1, 0.5, 0.9]);

    const rule = outlierRule({ aadHeldOutPct: 0.1, acceptanceMaxAADPct: null });   // 0.3 % of ~350 K = ~1 K
    const csv = {
      "pts_0.csv": "x[methanol],T_bubble\n0.1,364.35\n0.5,345.15\n0.9,nan\n",
      "curve_0.csv": "x[methanol],T_bubble\n0,373\n1,337\n",
    };
    const res = userResults(plan, r.data, rule, csv);
    expect(res.missing).toEqual([]);
    expect(res.points[0]!.residual).toBeCloseTo(364.35 - (91.2 + 273.15), 9);
    expect(res.points[0]!.outlier).toBe(false);
    expect(res.points[1]!.residual).toBeCloseTo(0, 9);
    expect(res.points[2]!.engine).toBeNull();
    expect(res.nUsed).toBe(2);
    //  a point 10 K off is an outlier at 3 x 0.1 %
    const off = userResults(plan, r.data, rule, { ...csv, "pts_0.csv": "x[methanol],T_bubble\n0.1,374.35\n0.5,345.15\n0.9,339\n" });
    expect(off.points[0]!.outlier).toBe(true);
    expect(off.nOutliers).toBeGreaterThanOrEqual(1);
  });
  it("psat asks Psat_<component> at the measured T; a missing CSV is named", () => {
    const r = parseMeasurementsCsv("T/K,Psat/kPa\n350,41.7\n370,90.9\n", PURE);
    if (!r.ok) throw new Error("fixture");
    const plan = userRunPlan({ data: r.data, components: ["water"] });
    expect(plan.property).toBe("Psat_water");
    const res = userResults(plan, r.data, outlierRule(null), { "pts_0.csv": "T,Psat_water\n350,41700\n370,90900\n" });
    expect(res.missing).toEqual(["curve_0"]);
    expect(res.aadRelPct).toBeCloseTo(0, 9);
  });
});

describe("the Explorer Guide section exists", () => {
  it("EXPLORER_GUIDE_USER_POINTS is a \\label of docs/explorerGuide.tex", () => {
    const tex = readFileSync(new URL("../../docs/explorerGuide.tex", import.meta.url), "utf-8");
    expect(tex).toContain(`\\label{${EXPLORER_GUIDE_USER_POINTS}}`);
  });
});
