/*---------------------------------------------------------------------------*\
  The Mass Balance plot's arithmetic on a stream carrying a CRYSTAL.

  The solver publishes F and composition as the OVERALL stream material
  INCLUDING any crystalline solid (its streamsNote states the convention);
  `solids` merely LOCATES part of that same material.  The GUI's
  massPerComponent used to ADD solids[c] on top of F·x·MW -- counting every
  crystal twice -- so the Mass Balance plot reported out > in on exactly the
  freeze/crystalliser cases whose stream table closed (found by Vitor on
  flash21_freeze_concentration, 2026-08-10).  This test is the regression
  pin: a feed and a product of identical overall material, where the product
  locates part of itself as solid, MUST close exactly.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { massBalance } from "../src/case/balances";
//  StreamResult's ONE home is the adapter that mints it; `balances` imports
//  the type, it does not own or re-export it.  (Importing it from `balances`
//  typechecks nowhere and was caught by bin/buildSite, which runs tsc over
//  the tests -- `npm test` does not typecheck, so vitest was green on a file
//  that could not compile.)
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

const MW = { water: 18.015, NaCl: 58.44 };

const base = {
  T: 298.15, P: 101325, vf: 0,
} as Partial<StreamResult>;

describe("mass balance over a crystal-carrying product", () => {
  it("closes when the product locates part of its material as solid", () => {
    const feed = {
      ...base, role: "feed",
      F: 1.0,
      composition: { water: 0.8, NaCl: 0.2 },
    } as StreamResult;
    //  SAME overall material out -- but half the salt has crystallised, so
    //  the stream LOCATES it in `solids` [kg/s].  Under the solver's
    //  convention F/composition already include it.
    const product = {
      ...base, role: "product",
      F: 1.0,
      composition: { water: 0.8, NaCl: 0.2 },
      solids: { NaCl: 0.1 * MW.NaCl },       // 0.1 kmol/s located as crystal
    } as StreamResult;

    const mb = massBalance([feed, product], MW);
    //  In == out exactly: locating material must never create material.
    expect(mb.inSum).toBeCloseTo(mb.outSum, 10);
    expect(mb.closureErr).toBeLessThan(1e-12);
  });

  it("still counts the solid once when only `solids` names a component", () => {
    //  A component present ONLY as solid (composition x = 0 would be a
    //  solver inconsistency under the overall convention, but the component
    //  UNION must still include solids-only names so nothing vanishes from
    //  the table).
    const feed = {
      ...base, role: "feed", F: 1.0, composition: { water: 1.0 },
    } as StreamResult;
    const product = {
      ...base, role: "product", F: 1.0, composition: { water: 1.0 },
      solids: { NaCl: 0 },
    } as StreamResult;
    const mb = massBalance([feed, product], MW);
    expect(mb.components).toContain("NaCl");
    expect(mb.closureErr).toBeLessThan(1e-12);
  });
});

/*---------------------------------------------------------------------------*\
  THE PLOT'S OWN PATH.  The test above pinned `massBalance` and passed while
  the Mass Balance CHART was still wrong, because the chart carried a private
  copy of the arithmetic -- so the fix reached the shared function and not the
  pixels Vitor was looking at.  A test of the shared home does not test a
  caller that declined to use it.  This one asserts the property structurally:
  MassBalancePlot must not compute mass itself.
\*---------------------------------------------------------------------------*/
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("the Mass Balance chart does not own the arithmetic", () => {
  it("has no private F*x*MW + solids computation", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/ui/plotting/MassBalancePlot.tsx", import.meta.url)),
      "utf8",
    );
    //  The chart must import the one home...
    expect(src).toContain("massPerComponent");
    //  ...and must not re-derive mass from solids itself.  `solids` may
    //  still be READ to enumerate components; what is banned is adding it
    //  to a fluid term (the double count).
    const addsSolid = /const\s+solid\s*=\s*s\.solids/.test(src)
      || /fluid\s*\+\s*solid/.test(src);
    expect(addsSolid).toBe(false);
  });
});
