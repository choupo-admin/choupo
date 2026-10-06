/*---------------------------------------------------------------------------*\
  standard-state (DEV.md 4c, C32): the lesson's claims, the panel's parsing
  of the shipped reference, and that every number the prose quotes is the
  witness golden's or the reference CSV's -- both read from the files
  themselves, so a moved engine number or a re-run reference cannot leave
  the prose behind.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STANDARD_STATE_LIMITS, STANDARD_STATE_QUIZ, STANDARD_STATE_STEPS,
} from "../src/ui/methods/standardStateLesson.js";
import {
  CONVERTER, GRID_P, GRID_T, REFERENCE_PATH, STANDARD_STATE_WITNESS,
  nodeKey, parseReference, refKey,
} from "../src/ui/methods/StandardStateTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const step = (n: number) => STANDARD_STATE_STEPS.find((s) => s.n === n)!;
const all = (n: number): string => {
  const s = step(n);
  return prose([s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" "));
};
const limits = prose(STANDARD_STATE_LIMITS.map((l) => l.title + " " + l.body).join(" "));

const CASE = new URL(`../../tutorials/${STANDARD_STATE_WITNESS}/`, import.meta.url);
/** The witness golden: `diag  <op>  <key>  <value>  <tol>`. */
const GOLDEN = readFileSync(new URL("expected", CASE), "utf-8");
const golden = (op: string, key: string): number => {
  const row = GOLDEN.split("\n").find((l) => {
    const p = l.split(/\s+/); return p[0] === "diag" && p[1] === op && p[2] === key;
  });
  if (!row) throw new Error(`no golden row ${op} ${key}`);
  return Number(row.split(/\s+/)[3]);
};
const REF = parseReference(readFileSync(new URL(REFERENCE_PATH, CASE), "utf-8"));

const eng = (T: number, P: number, k: "H_ig" | "H_R" | "H_real") => golden(nodeKey(T, P), k);
const kJ = (v: number) => v / 1000;
/** Engine difference between two states, kJ/mol (the zero cancels). */
const dEng = (T1: number, P1: number, T2: number, P2: number) =>
  kJ(eng(T2, P2, "H_real") - eng(T1, P1, "H_real"));
const dRef = (T1: number, P1: number, T2: number, P2: number) =>
  kJ(REF.get(refKey(T2, P2))!.h - REF.get(refKey(T1, P1))!.h);

describe("the reference CSV", () => {
  it("parses to the page's grid plus the converter's two states", () => {
    expect(REF.size).toBe(GRID_T.length * GRID_P.length + 2);
    for (const T of GRID_T) for (const P of GRID_P) expect(REF.has(refKey(T, P))).toBe(true);
    expect(REF.has(refKey(CONVERTER.T, CONVERTER.P))).toBe(true);
    expect(REF.has(refKey(CONVERTER.T, 1))).toBe(true);
  });

  it("agrees with the engine's ideal-gas part to a few J/mol along 1 bar", () => {
    //  Both ideal-gas enthalpies are Cp integrals from the same kind of
    //  data; the residual is where the models part.  Measured 6.0 J/mol at
    //  most (at 700 K) over a 20 kJ/mol rise: ten is the bound.
    for (const T of GRID_T)
      expect(Math.abs(1000 * (dEng(300, 1, T, 1) - dRef(300, 1, T, 1)))).toBeLessThan(10);
  });
});

describe("the lesson", () => {
  it("has ten steps, numbered without a gap", () => {
    expect(STANDARD_STATE_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("quotes step 1's four differences from the golden and the reference", () => {
    const s = all(1);
    expect(s).toContain(dEng(300, 1, 1000, 1).toFixed(2));          // 20.64
    expect(s).toContain(dEng(300, 1, 300, 1000).toFixed(2));        // 1.29
    expect(s).toContain(dRef(300, 1, 300, 1000).toFixed(2));        // 1.38
    expect(s).toContain(dEng(1000, 1, 1000, 1000).toFixed(2));      // 1.69
    expect(s).toContain(dRef(1000, 1, 1000, 1000).toFixed(2));      // 1.73
  });

  it("quotes the real-gas-at-1-bar residuals of step 3's note in J/mol", () => {
    expect(all(3)).toContain(eng(300, 1, "H_R").toFixed(1) + " J/mol at 300 K");
    expect(all(3)).toContain(golden(CONVERTER.key1bar, "H_R").toFixed(1) + " J/mol at 733 K");
  });

  it("quotes the converter's two halves and their ratio in step 5", () => {
    const hig = kJ(golden(CONVERTER.key, "H_ig"));
    const hr = kJ(golden(CONVERTER.key, "H_R"));
    const hrRef = kJ(REF.get(refKey(CONVERTER.T, CONVERTER.P))!.hr);
    const s = all(5);
    expect(s).toContain(`${hig.toFixed(2)} kJ/mol`);
    expect(s).toContain(`adds ${hr.toFixed(2)} kJ/mol (reference ${hrRef.toFixed(2)})`);
    expect(s).toContain(`${(100 * hr / hig).toFixed(1)} % of that rise`);
  });

  it("repeats step 1's two differences in step 6, where the zero moves", () => {
    const s = all(6);
    expect(s).toContain(dEng(300, 1, 1000, 1).toFixed(2));
    expect(s).toContain(dEng(300, 1, 300, 1000).toFixed(2));
  });

  it("cites the engine where it prices the three terms", () => {
    const s = all(7);
    expect(s).toContain("src/thermo/Component.cpp:1429");
    expect(s).toContain("src/thermo/ThermoPackage.cpp:1200");
    expect(s).toContain("src/propertyOps/PropertyPoint.cpp:79");
  });

  it("states the SRK-against-reference gap in its limits, from the files", () => {
    const pct = (T: number, P: number) =>
      Math.round(100 * (1 - eng(T, P, "H_R") / REF.get(refKey(T, P))!.hr));
    expect(limits).toContain(`${pct(300, 1000)} % below the reference at 300 K and 1000 bar`);
    expect(pct(300, 100)).toBeGreaterThanOrEqual(30);   // "a third below"
    expect(pct(300, 100)).toBeLessThanOrEqual(36);
    const conv = Math.round(100 * (1 - golden(CONVERTER.key, "H_R")
      / REF.get(refKey(CONVERTER.T, CONVERTER.P))!.hr));
    expect(limits).toContain(`${conv} % below at the converter`);
  });

  //  No arm here checks that the page names no commercial simulator: that
  //  rule has ONE home, bin/curate/check_doctrine.py, which scans every
  //  tracked file -- this test included -- so an arm spelling the names
  //  out to forbid them was itself the violation (caught by the gate the
  //  day it was written, 2026-10-03).

  it("asks six questions, each with its right answer in range and a reason", () => {
    expect(STANDARD_STATE_QUIZ).toHaveLength(6);
    for (const q of STANDARD_STATE_QUIZ) {
      expect(q.q.endsWith("?")).toBe(true);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
      expect(q.feedback.length).toBeGreaterThan(40);
    }
    //  The brief's six answers: yes, no, can affect, no, no, no.
    expect(STANDARD_STATE_QUIZ.map((q) => q.options[q.correct]))
      .toEqual(["Yes", "No", "No — it can change it", "No", "No", "No"]);
  });

  it("names its four limits", () => {
    expect(STANDARD_STATE_LIMITS.map((l) => l.id)).toEqual(
      ["one-substance-one-phase", "srk-is-a-model", "reference-is-an-implementation", "no-study"]);
  });
});

describe("the panel", () => {
  it("reads one op per grid node by the op's own name", () => {
    expect(nodeKey(300, 1)).toBe("h_T300_P1");
    for (const T of GRID_T) for (const P of GRID_P)
      expect(Number.isFinite(eng(T, P, "H_real"))).toBe(true);
    expect(Number.isFinite(golden(CONVERTER.key, "H_real"))).toBe(true);
  });

  it("is live, a lesson, on the thermodynamics shelf", () => {
    const e = METHOD_TOOLS.find((t) => t.id === "standard-state")!;
    expect(e.status).toBe("live");
    expect(e.kind).toBe("notes");
    expect(e.discipline).toBe("Thermodynamics");
    expect(e.theory).toBe("sec:elements-reference");
  });
});
