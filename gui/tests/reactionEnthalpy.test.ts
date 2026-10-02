/*---------------------------------------------------------------------------*\
  reaction-enthalpy (DEV.md 4c, C31): the lesson's claims, the panel's one
  piece of arithmetic (the constant-heat-capacity Kirchhoff line), and that
  the numbers the prose quotes are the witness golden's -- read from the
  golden file itself, so a moved engine number cannot leave the prose behind.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ENTHALPY_LIMITS, ENTHALPY_STEPS } from "../src/ui/methods/reactionEnthalpyLesson.js";
import {
  BASE_DATA_DH, ENTHALPY_TEMPERATURES, ENTHALPY_WITNESS, NH3_PER_REACTION,
  diagKey, kirchhoffConstant,
} from "../src/ui/methods/ReactionEnthalpyTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const step = (n: number) => ENTHALPY_STEPS.find((s) => s.n === n)!;
const all = (n: number): string => {
  const s = step(n);
  return prose([s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" "));
};

/** The witness golden: `diag  haberT  <key>  <value>  <tol>`. */
const GOLDEN = readFileSync(
  new URL(`../../tutorials/${ENTHALPY_WITNESS}/expected`, import.meta.url), "utf-8");
const golden = (key: string): number => {
  const row = GOLDEN.split("\n").find((l) => l.split(/\s+/)[2] === key);
  if (!row) throw new Error(`no golden row ${key}`);
  return Number(row.split(/\s+/)[3]);
};
const perNH3 = (T: number) => golden(diagKey(T)) / NH3_PER_REACTION;

describe("the lesson", () => {
  it("has six steps, numbered without a gap", () => {
    expect(ENTHALPY_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("says the degree sign fixes the state, not the temperature, with its source", () => {
    const s = all(1);
    expect(s).toContain("temperature is not part of the definition of a standard state");
    expect(s).toContain("Pure Appl. Chem. 54 (1982) 1239");
  });

  it("states Kirchhoff's law", () => {
    expect(prose(step(2).formula!)).toContain(
      String.raw`\frac{\mathrm{d}\,\Delta_r H^\circ}{\mathrm{d}T} = \Delta_r c_p^\circ`);
  });

  it("quotes the witness golden, not a remembered number", () => {
    const s = all(3);
    expect(s).toContain(perNH3(298.15).toFixed(2).replace("-", "−"));
    expect(s).toContain(perNH3(700).toFixed(2).replace("-", "−"));
    expect(s).toContain(perNH3(773.15).toFixed(2).replace("-", "−"));
    expect(s).toContain("−46.1");
  });

  it("gets step 4's 14 % and step 6's −55.9 from the same numbers", () => {
    expect(100 * (1 - BASE_DATA_DH / perNH3(773.15))).toBeCloseTo(13.7, 1);
    const slope = 1000 * (perNH3(400) - perNH3(298.15)) / (400 - 298.15);
    expect(slope).toBeCloseTo(-20.9, 1);
    expect(kirchhoffConstant(perNH3(298.15), slope, 298.15, 773.15))
      .toBeCloseTo(-55.87, 1);
    expect(all(6)).toContain("−55.9");
  });

  it("cites the engine where it prices the reaction heat", () => {
    expect(all(5)).toContain("ReactionHeat.cpp:40");
    expect(all(5)).toContain("PFR.cpp:647");
  });

  it("names its three limits", () => {
    expect(ENTHALPY_LIMITS.map((l) => l.id)).toEqual(
      ["standard-pressure", "one-phase-path", "no-study"]);
  });
});

describe("the panel", () => {
  it("reads one diagnostic key per declared temperature", () => {
    expect(ENTHALPY_TEMPERATURES.map(diagKey)).toContain("haberBosch_T773K_dH_kJ_mol");
    for (const T of ENTHALPY_TEMPERATURES) expect(Number.isFinite(perNH3(T))).toBe(true);
  });

  it("draws a straight line through the 25 °C point", () => {
    expect(kirchhoffConstant(-45.94, -21, 298.15, 298.15)).toBe(-45.94);
    expect(kirchhoffConstant(-45.94, -20, 298.15, 398.15)).toBeCloseTo(-47.94, 10);
  });

  it("is live, a lesson, on the reaction-engineering shelf", () => {
    const e = METHOD_TOOLS.find((t) => t.id === "reaction-enthalpy")!;
    expect(e.status).toBe("live");
    expect(e.kind).toBe("notes");
    expect(e.theory).toBe("sec:elements-reference");
  });
});
