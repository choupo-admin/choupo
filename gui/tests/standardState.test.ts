/*---------------------------------------------------------------------------*\
  standard-state (DEV.md 4c, C32): the lesson's claims, the panel's parsing
  of the shipped reference, and that every number the prose quotes is the
  witness golden's or the reference CSV's -- both read from the files
  themselves, so a moved engine number or a re-run reference cannot leave
  the prose behind.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    expect(s).toContain("src/thermo/Component.cpp:1477");
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

// ---- C112 point 13: does any residual have to be subtracted at the reference? ----
//
//  Step 7 writes h_i(T, P) = dHf(298.15 K) + [h_ig(T) - h_ig(298.15 K)] + h_R(T, P).
//  The question: is the formation datum the IDEAL GAS's (then h_R is zero at
//  the reference by construction and nothing is subtracted), or the real
//  gas's at 1 bar (then h_R(298.15 K, 1 bar) would have to be taken off)?
//  Read off the source: `Component::h_pure_ig` is `h_formation(T, "gas")`
//  and refuses a record whose referenceState is not gas
//  (Component.cpp, requireIdealGasRung) -- the datum is the ideal gas's.
//  This test settles it NUMERICALLY and INDEPENDENTLY, on a species whose
//  datum is not zero (methane, the catalogue record, SRK): this checkout's
//  native choupoProps prices five states, and each of the three terms is
//  recomputed here without the engine's arithmetic --
//    * term 1 against the record's own dHf_298;
//    * term 2 as the analytic integral of the record's own Cp polynomial;
//    * term 3 as the SRK departure by QUADRATURE of (T dP/dT - P) from
//      infinite volume (the ideal gas at the same T) to the state, with the
//      volume found by Newton and dP/dT by finite difference -- not the
//      closed form and not the Cardano root the engine uses.
//  The model's parameters (Omega_a, Omega_b, the m(omega) correlation) are
//  SRK.cpp's: they DEFINE the model under test; what is checked is the
//  REFERENCE the departure is measured from.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const R_GAS = 8.314462618;
const CH4 = readFileSync(join(REPO_ROOT, "data/standards/components/CH4.dat"), "utf-8");
const rec = (re: RegExp) => Number(re.exec(CH4)![1]);
const CH4_DHF = rec(/dHf_298\s+([-0-9.eE+]+)/);
const CH4_TC = rec(/^Tc\s+([0-9.]+)/m);
const CH4_PC = rec(/^Pc\s+([0-9.]+)/m) * 1e5;
const CH4_OMEGA = rec(/^omega\s+([0-9.]+)/m);
const CH4_CP = /idealGasHeatCapacity\s*\{[^}]*coefficients\s*\(([^)]*)\)/.exec(CH4)![1]!
  .trim().split(/\s+/).map(Number);

/** The states priced, [name, T K, P Pa]. */
const SS_STATES: ReadonlyArray<readonly [string, number, number]> = [
  ["ref_1Pa", 298.15, 1], ["ref_1bar", 298.15, 1e5],
  ["hot_1Pa", 600, 1], ["hot_50bar", 600, 50e5], ["mid_100bar", 450, 100e5],
];

type Diag = { [k: string]: number };
let ssMemo: Map<string, Diag> | undefined;
function ssRun(): Map<string, Diag> {
  if (ssMemo) return ssMemo;
  const bin = join(REPO_ROOT, "choupoProps");
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the repository `
    + "root; this test runs the native engine and must not skip").toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "choupo-c112-ss-"));
  try {
    mkdirSync(join(dir, "system")); mkdirSync(join(dir, "constant"));
    writeFileSync(join(dir, "system/controlDict"),
      "application choupoProps;\ndescription \"C112 point 13\";\nverbosity 0;\n");
    writeFileSync(join(dir, "system/propsDict"), "operations\n(\n"
      + SS_STATES.map(([n, T, P]) => `    { name ${n}; type propertyPoint; state { T ${T} K; `
        + `P ${P} Pa; composition { CH4 1.0; } } properties ( H_ig H_R H_real Z ); }`)
        .join("\n") + "\n);\n");
    writeFileSync(join(dir, "constant/thermoPhysPropDict"),
      "recordType thermophysicalPropertySystem;\nschemaVersion 2;\ncomponents ( CH4 );\n"
      + "equilibrium\n{\n    formulation phiPhi;\n    equationOfState { model SRK; }\n}\n");
    const r = spawnSync(bin, [dir], { cwd: REPO_ROOT, encoding: "utf-8",
      env: { ...process.env, CHOUPO_HOME: REPO_ROOT }, maxBuffer: 64 * 1024 * 1024 });
    expect(r.status, r.stderr).toBe(0);
    const m = /<<<Choupo:result-begin>>>\s*\n([\s\S]*?)\n<<<Choupo:result-end>>>/
      .exec(r.stdout ?? "");
    expect(m, "the run published no result block").not.toBeNull();
    const json = JSON.parse(m![1]!) as
      { operationResults: { name: string; diagnostics: Diag }[] };
    ssMemo = new Map(json.operationResults.map((o) => [o.name, o.diagnostics]));
    return ssMemo;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The ideal-gas enthalpy rise, the record's Cp = a + bT + cT^2 + dT^3 integrated. */
function cpIntegral(T0: number, T1: number): number {
  const F = (T: number) => CH4_CP.reduce((acc, c, k) => acc + c * T ** (k + 1) / (k + 1), 0);
  return F(T1) - F(T0);
}

/** SRK departure enthalpy by quadrature from the ideal gas (v -> infinity). */
function srkDepartureByQuadrature(T: number, P: number): number {
  const ac = 0.42747 * R_GAS * R_GAS * CH4_TC * CH4_TC / CH4_PC;
  const b = 0.08664 * R_GAS * CH4_TC / CH4_PC;
  const m = 0.48508 + 1.55171 * CH4_OMEGA - 0.15613 * CH4_OMEGA ** 2;
  const a = (t: number) => ac * (1 + m * (1 - Math.sqrt(t / CH4_TC))) ** 2;
  const pOf = (v: number) => R_GAS * T / (v - b) - a(T) / (v * (v + b));
  //  The vapour volume by Newton from the ideal gas, dP/dv by difference.
  let v = R_GAS * T / P;
  for (let k = 0; k < 200; ++k) {
    const h = v * 1e-7;
    const f = pOf(v) - P, df = (pOf(v + h) - pOf(v - h)) / (2 * h);
    const dv = f / df;
    v -= dv;
    if (Math.abs(dv) < 1e-15 * v) break;
  }
  const dT = 1e-3;
  const ap = (a(T + dT) - a(T - dT)) / (2 * dT);
  //  integral_inf^v (T dP/dT - P) dv' = -integral_0^{1/v} (a - T a')/(1 + b u) du
  const g = (u: number) => (a(T) - T * ap) / (1 + b * u);
  const N = 2000, U = 1 / v, du = U / N;
  let simpson = g(0) + g(U);
  for (let i = 1; i < N; ++i) simpson += (i % 2 ? 4 : 2) * g(i * du);
  const integral = -simpson * du / 3;
  return integral + P * v - R_GAS * T;
}

describe("C112 point 13: the formation datum is the ideal gas's -- nothing is subtracted at the reference", () => {
  it("term 1: at 298.15 K the ideal-gas term IS the record's datum", () => {
    expect(CH4).toMatch(/dHf_298\s+-74520\.0;\s*\/\/ J\/mol\s+-- ideal-gas reference/);
    const d = ssRun();
    expect(d.get("ref_1Pa")!["H_ig"]!).toBeCloseTo(CH4_DHF, 6);
    expect(d.get("ref_1bar")!["H_ig"]!).toBeCloseTo(CH4_DHF, 6);
  }, 60_000);

  it("term 2: the ideal-gas rise is the record's Cp integral, and does not depend on P", () => {
    const d = ssRun();
    const rise = d.get("hot_1Pa")!["H_ig"]! - d.get("ref_1Pa")!["H_ig"]!;
    expect(Math.abs(rise - cpIntegral(298.15, 600)) / rise).toBeLessThan(1e-9);
    //  So the standard PRESSURE (1 bar or 1 atm) cannot move an enthalpy:
    //  only an entropy or a Gibbs energy.
    expect(d.get("hot_50bar")!["H_ig"]!).toBe(d.get("hot_1Pa")!["H_ig"]!);
  }, 60_000);

  it("term 3: the residual is the departure from the ideal gas at the SAME T, recomputed by quadrature", () => {
    const d = ssRun();
    for (const [n, T, P] of SS_STATES) {
      const hr = d.get(n)!["H_R"]!;
      const mine = srkDepartureByQuadrature(T, P);
      expect(Math.abs(hr - mine), `${n}: engine ${hr}, quadrature ${mine}`)
        .toBeLessThan(1e-6 * Math.max(1, Math.abs(mine)));
      expect(d.get(n)!["H_real"]!).toBeCloseTo(d.get(n)!["H_ig"]! + hr, 6);
    }
  }, 60_000);

  it("the ideal-gas limit at the reference returns the datum itself; a subtraction would not", () => {
    const d = ssRun();
    //  P -> 0 at 298.15 K: the state the datum is TABULATED for.  The
    //  three-term formula gives the datum, with nothing taken off.
    const hLimit = d.get("ref_1Pa")!["H_real"]!;
    expect(Math.abs(d.get("ref_1Pa")!["H_R"]!)).toBeLessThan(1e-3);
    expect(Math.abs(hLimit - CH4_DHF)).toBeLessThan(1e-3);
    //  The real gas at 298.15 K and 1 bar is NOT the standard state: it sits
    //  h_R(298.15 K, 1 bar) away from the datum (about -17 J/mol for methane
    //  on SRK), and the engine says so.
    const hr1 = d.get("ref_1bar")!["H_R"]!;
    expect(hr1).toBeLessThan(-10);
    expect(d.get("ref_1bar")!["H_real"]! - CH4_DHF).toBeCloseTo(hr1, 6);
    //  The figure step 7's note quotes is this run's, rounded.
    expect(all(7)).toContain(`about −${Math.abs(Math.round(hr1))} J/mol`);
    //  The convention that would SUBTRACT h_R(298.15 K, 1 bar) is the one for
    //  a datum tabulated on the REAL gas at 1 bar.  Applied here it moves
    //  the ideal-gas limit off the tabulated value by exactly that amount --
    //  i.e. it would contradict the record's own declaration.
    const subtracted = hLimit - hr1;
    expect(Math.abs(subtracted - CH4_DHF)).toBeGreaterThan(10);
  }, 60_000);

  it("step 7 says what this test confirms", () => {
    const s = all(7);
    expect(s).toContain("the ideal gas's");
    expect(s).toContain("no residual is subtracted at the reference");
  });
});
