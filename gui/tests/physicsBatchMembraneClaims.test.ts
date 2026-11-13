/*---------------------------------------------------------------------------*\
  Physics held by recomputation (batch-membrane lesson): three statements
  that read as laws of nature and are properties of THIS tool.

  1. "exactly two pure batch operations" -- the unit's diafiltrate rate is
     only ever zero or the permeate rate (BatchDiafilter.cpp:397): that is a
     scope, and the page says diafiltration at variable volume exists.
  2. "in real equipment the flux falls" -- it falls when something makes it:
     the osmotic pressure rising with concentration is recomputed here
     (J = A_w (dP - pi(c)), pi = i R T c, monotone in c); a washing rig at
     constant volume has the opposite trend, which is why the page says
     "can".
  3. "a stirred vessel cannot [correlate k_film]" -- stirred-cell correlations
     exist; the unit is declared a pressure and an area, so none could be fed
     (the refusal text names stirrer speed and geometry as what it is NOT told,
     BatchDiafilter.cpp:130-138).
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BATCH_MEMBRANE_LIMITS, BATCH_MEMBRANE_STEPS } from "../src/ui/methods/batchMembraneLesson.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const src = readFileSync(new URL(
  "../../src/unitOperations/batch/BatchDiafilter.cpp", import.meta.url), "utf-8")
  .split("\n");
const step = (n: number): string => prose(BATCH_MEMBRANE_STEPS.find((s) => s.n === n)!.body);

describe("osmotic pressure makes the flux fall as the retentate concentrates", () => {
  const Aw = 2e-12, dP = 2.0e6, i = 2, R = 8.314, T = 298.15;     // SI, NaCl-like
  const J = (c: number): number => Aw * (dP - i * R * T * c);
  it("is strictly decreasing in c, while a diluted (washed) retentate has the higher flux", () => {
    const cs = [10, 50, 100, 200];                                // mol/m3
    const js = cs.map(J);
    for (let k = 1; k < js.length; k++) expect(js[k] as number).toBeLessThan(js[k - 1] as number);
    expect(J(10)).toBeGreaterThan(J(100));
  });
});

describe("the page states its scope, not a law", () => {
  it("step 2: two modes THIS tool treats, with the variable-volume mode named", () => {
    const b = step(2);
    expect(b).not.toContain("There are exactly two pure batch operations");
    expect(b).toContain("This tool treats two batch modes");
    expect(b).toContain("diafiltration at variable volume");
    expect(src[397 - 1]).toContain("constantVolume_ ? f.Q_p : 0.0");
  });
  it("step 6: the flux CAN fall, for named reasons", () => {
    const b = step(6);
    expect(b).not.toContain("On real equipment the flux falls");
    expect(b).toContain("the flux can fall during a run");
    for (const reason of ["osmotic pressure rises", "viscosity", "fouling"])
      expect(b).toContain(reason);
  });
  it("k_film: stirred-cell correlations exist; the unit has no geometry to feed one", () => {
    const l = prose(BATCH_MEMBRANE_LIMITS.find((x) => x.id === "k-film-is-declared")!.body);
    expect(l).not.toContain("a stirred vessel cannot");
    expect(l).not.toContain("CAN correlate");
    expect(l).toContain("Correlations for stirred cells exist in the membrane literature");
    expect(l).toContain("no geometry or stirrer speed to feed any correlation");
    const refusal = src.slice(130 - 1, 138).join(" ");
    expect(refusal).toContain("stirrer speed");
    expect(refusal).toContain("geometry");
  });
});
