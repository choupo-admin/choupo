/*---------------------------------------------------------------------------*\
  The two scopes of the plant material balance.

  A case may DECLARE that a pair of boundary streams is an auxiliary circuit
  (`utilities ( { name CW1; service coolingWater; supply cw; return cwOut; } )`
  in the flowsheetDict).  The ENGINE reads that declaration, raises every
  refusal it can earn, and stamps each stream it names with the circuit's own
  name (`utilityCircuit`); the GUI groups by that stamp and never re-reads the
  block -- the second home the first law was taken out of on 2026-09-05.

  WHY IT MATTERS, measured on tutorials/plant/ammonia02_full_plant: the
  declared cooling water is 9 007 500 kg/h against 70 637 kg/h of process
  material, 99.2 % of the mass crossing the boundary.  Drawn on the total
  scope, every process component is a sliver and the closure quoted is a
  statement about the cooling tower (Vitor, on the live site).

  THE SEPARATION IS PRESENTATION, NEVER VALIDATION SCOPE: the total scope
  stays available beside the process one, so a reader can see both.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { massBalance } from "../src/case/balances";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

const MW = { water: 18.015, NH3: 17.031 };

const base = { T: 298.15, P: 101325, vf: 0 } as Partial<StreamResult>;

//  1 kmol/s of ammonia in, 1 kmol/s out -- and a cooling circuit two orders
//  of magnitude larger, exactly the shape that hid the process on screen.
const nh3Feed = {
  ...base, role: "feed", F: 1.0, composition: { NH3: 1.0 },
} as StreamResult;
const nh3Product = {
  ...base, role: "product", F: 1.0, composition: { NH3: 1.0 },
} as StreamResult;
const cw = {
  ...base, role: "feed", F: 100.0, composition: { water: 1.0 },
  utilityCircuit: "CW1",
} as StreamResult;
const cwOut = {
  ...base, role: "product", F: 100.0, composition: { water: 1.0 },
  utilityCircuit: "CW1",
} as StreamResult;

describe("plant material balance, two scopes", () => {
  it("leaves a declared circuit out of the process scope and names it", () => {
    const mb = massBalance([nh3Feed, nh3Product, cw, cwOut], MW);

    expect(mb.inSum).toBeCloseTo(MW.NH3, 9);
    expect(mb.outSum).toBeCloseTo(MW.NH3, 9);
    expect(mb.utilityCircuits).toEqual(["CW1"]);
    expect(mb.utilityPerCircuit["CW1"]).toBeCloseTo(100 * MW.water, 6);

    //  The cooling water carries no process component onto the axis.
    expect(mb.visibleComponents).toEqual(["NH3"]);
  });

  it("keeps the TOTAL scope beside it rather than replacing it", () => {
    const mb = massBalance([nh3Feed, nh3Product, cw, cwOut], MW);
    expect(mb.totalInSum).toBeCloseTo(MW.NH3 + 100 * MW.water, 6);
    expect(mb.totalOutSum).toBeCloseTo(MW.NH3 + 100 * MW.water, 6);
    expect(mb.totalClosureErr).toBeLessThan(1e-12);
  });

  it("counts the circuit on the SUPPLY side only", () => {
    //  Both ends carry the same matter -- the engine refuses a declared pair
    //  that does not conserve component-wise -- so adding both would report
    //  twice the mass that was set aside.
    const mb = massBalance([nh3Feed, nh3Product, cw, cwOut], MW);
    expect(mb.utilitySum).toBeCloseTo(100 * MW.water, 6);
  });

  it("is byte-identical on a case that declares nothing", () => {
    //  An absence must keep meaning what it meant: with no stamp anywhere,
    //  the process scope IS the total scope and no circuit is named.
    const mb = massBalance([nh3Feed, nh3Product], MW);
    expect(mb.utilityCircuits).toEqual([]);
    expect(mb.utilitySum).toBe(0);
    expect(mb.inSum).toBeCloseTo(mb.totalInSum, 12);
    expect(mb.outSum).toBeCloseTo(mb.totalOutSum, 12);
  });
});
