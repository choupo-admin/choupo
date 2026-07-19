/*---------------------------------------------------------------------------*\
  molarBalance + elementBalanceSurface tests -- the addendum's gates:
  a non-reactive boundary closes (IN = OUT); a reactive one shows a NET
  change without a false alarm; solids convert via MW and a missing MW is
  PARTIAL naming the component; the steady element surface respects the
  engine's FULL/PARTIAL/UNAVAILABLE status (metadata sovereign).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import type { StreamResult } from "../src/adapters/SolverAdapter.js";
import { atomicBalanceView, elementBalanceSurface } from "../src/case/elementBalanceSurface.js";
import { molarBalanceView } from "../src/case/molarBalance.js";

const s = (name: string, role: StreamResult["role"], F: number,
           solids?: { [c: string]: number }): StreamResult =>
  ({ name, role, F, T: 300, P: 1e5, composition: {},
     ...(solids ? { solids } : {}) }) as StreamResult;

describe("molarBalanceView", () => {
  it("non-reactive boundary: net = 0 (the number speaks; no seal exists)", () => {
    const v = molarBalanceView(
      [s("feed", "feed", 0.02778), s("vap", "product", 0.02122),
       s("liq", "product", 0.00656), s("mid", "intermediate", 99)],
      {});
    expect(v.inKmolS).toBeCloseTo(0.02778, 9);
    expect(v.netKmolS).toBeCloseTo(0, 9);
  });

  it("reacting boundary: IN != OUT is a NET CHANGE, never an alarm state"
     + " -- the view carries no reactive/closure boolean at all", () => {
    // A -> 2B doubles the moles legally.
    const v = molarBalanceView(
      [s("A", "feed", 1.0), s("B", "product", 2.0)], {});
    expect(v.netKmolS).toBeCloseTo(1.0, 12);   // exposed as net, not closure
    expect("reactive" in v).toBe(false);
    expect("closed" in v).toBe(false);
  });

  it("solids convert kg/s -> kmol/s via MW", () => {
    const v = molarBalanceView(
      [s("brine", "feed", 0.01),
       s("cake", "product", 0.002, { halite: 0.05844 })],  // 1e-3 kmol/s
      { halite: 58.44 });
    expect(v.outKmolS).toBeCloseTo(0.002 + 0.001, 9);
  });

  it("a solid with a missing MW is PARTIAL naming the component -- never a"
     + " silent omission, and a zero net earns no seal", () => {
    const v = molarBalanceView(
      [s("feed", "feed", 0.002),
       s("cake", "product", 0.002, { mysterySolid: 0.05 })],
      {});
    expect(v.partialMissingMW).toEqual(["mysterySolid"]);
    expect(v.outKmolS).toBeCloseTo(0.002, 12);   // the known part only
    // net of the KNOWN part is zero, yet the view exposes PARTIAL -- the
    // renderer never shows a closure seal while partialMissingMW is set.
    expect(v.netKmolS).toBeCloseTo(0, 12);
  });
});

const META_FULL = 'key,value\nstatus,FULL\n';
const META_PARTIAL = 'key,value\nstatus,PARTIAL\n'
  + 'partialSpecies.petCut,0.005\n';
const META_UNAVAIL = 'key,value\nstatus,UNAVAILABLE\n'
  + 'refusedSpecies.toluene,"formula \'aromaticCut\': \'Ar\' is followed by'
  + ' garbage"\n';
const CSV = "element,in_kmol_atom_h,out_kmol_atom_h,residual_kmol_atom_h,"
  + "closure_pct\nC,700,700,1e-13,100.0000\nH,1400,1400,2e-13,100.0000\n";

describe("elementBalanceSurface", () => {
  it("FULL: rows drawn with the engine's numbers", () => {
    const v = elementBalanceSurface(CSV, META_FULL);
    expect(v.status).toBe("FULL");
    expect(v.rows.map((r) => r.element)).toEqual(["C", "H"]);
    expect(v.rows[0]!.closurePct).toBeCloseTo(100, 6);
  });

  it("PARTIAL: rows drawn + the partial species named", () => {
    const v = elementBalanceSurface(CSV, META_PARTIAL);
    expect(v.status).toBe("PARTIAL");
    expect(v.partial[0]).toEqual({ species: "petCut", unaccounted: 0.005 });
    expect(v.rows.length).toBe(2);
  });

  it("UNAVAILABLE: metadata sovereign -- a stale CSV's rows are never drawn", () => {
    const v = elementBalanceSurface(CSV, META_UNAVAIL);
    expect(v.status).toBe("UNAVAILABLE");
    expect(v.rows).toEqual([]);                  // sovereignty
    expect(v.refused[0]!.species).toBe("toluene");
  });

  it("absent artefacts -> not present", () => {
    expect(elementBalanceSurface(undefined, undefined).present).toBe(false);
  });

  it("CAUSAL: a malformed numeric row withdraws the claim -- never a FULL"
     + " badge over skipped rows", () => {
    const bad = CSV + "N,not-a-number,3,0,100.0\n";
    const v = elementBalanceSurface(bad, META_FULL);
    expect(v.status).toBe("UNAVAILABLE");
    expect(v.rows).toEqual([]);
    expect(v.malformedReason).toContain("row");
  });

  it("CAUSAL: a table without the canonical header is malformed WITH a"
     + " reason", () => {
    const v = elementBalanceSurface("foo,bar\n1,2\n", META_FULL);
    expect(v.status).toBe("UNAVAILABLE");
    expect(v.malformedReason).toContain("header");
  });

  it("CAUSAL: a non-finite partialSpecies fraction withdraws the claim", () => {
    const meta = 'key,value\nstatus,PARTIAL\npartialSpecies.petCut,NaN\n';
    const v = elementBalanceSurface(CSV, meta);
    expect(v.status).toBe("UNAVAILABLE");
    expect(v.malformedReason).toContain("partialSpecies");
  });
});

describe("atomicBalanceView", () => {
  it("the plant shape: species moles change, ATOMS close, seal FULL", () => {
    // ChemicalPlantTutorial: C/H/O/N each close ~100% while species moles
    // go 660 -> 677.8 kmol/h -- the atomic totals are the conserved view.
    const csv = "element,in_kmol_atom_h,out_kmol_atom_h,"
      + "residual_kmol_atom_h,closure_pct\n"
      + "C,108,108.0003,2.7e-04,100.0003\n"
      + "H,619.5,619.5009,8.6e-04,100.0001\n"
      + "N,880.5,880.5,0,100.0000\n"
      + "O,309.75,309.75,-2.1e-05,100.0000\n";
    const v = atomicBalanceView(elementBalanceSurface(csv, META_FULL));
    expect(v.totalInKmolAtomH).toBeCloseTo(1917.75, 2);
    expect(v.allElementsClose).toBe(true);
    expect(v.worstElementOffPct).toBeLessThan(0.01);
  });

  it("CAUSAL: a +C error cancelling a -O error in the signed TOTAL never"
     + " earns the seal -- every element must close", () => {
    const csv = "element,in_kmol_atom_h,out_kmol_atom_h,"
      + "residual_kmol_atom_h,closure_pct\n"
      + "C,100,110,10,110.0\n"        // +10 atoms fabricated
      + "O,100,90,-10,90.0\n";        // -10 atoms lost
    const v = atomicBalanceView(elementBalanceSurface(csv, META_FULL));
    expect(v.residualKmolAtomH).toBeCloseTo(0, 12);   // the total LIES
    expect(v.allElementsClose).toBe(false);           // the seal does not
    expect(v.worstElementOffPct).toBeCloseTo(10, 6);
  });

  it("no rows -> never sealed", () => {
    const v = atomicBalanceView(elementBalanceSurface(undefined, META_FULL));
    expect(v.allElementsClose).toBe(false);
  });
});
