/*---------------------------------------------------------------------------*\
  molarBalance + elementBalanceSurface tests -- the addendum's gates:
  a non-reactive boundary closes (IN = OUT); a reactive one shows a NET
  change without a false alarm; solids convert via MW and a missing MW is
  PARTIAL naming the component; the steady element surface respects the
  engine's FULL/PARTIAL/UNAVAILABLE status (metadata sovereign).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import type { StreamResult } from "../src/adapters/SolverAdapter.js";
import { elementBalanceSurface } from "../src/case/elementBalanceSurface.js";
import { molarBalanceView } from "../src/case/molarBalance.js";

const s = (name: string, role: StreamResult["role"], F: number,
           solids?: { [c: string]: number }): StreamResult =>
  ({ name, role, F, T: 300, P: 1e5, composition: {},
     ...(solids ? { solids } : {}) }) as StreamResult;

describe("molarBalanceView", () => {
  it("non-reactive: IN = OUT closes", () => {
    const v = molarBalanceView(
      [s("feed", "feed", 0.02778), s("vap", "product", 0.02122),
       s("liq", "product", 0.00656), s("mid", "intermediate", 99)],
      {}, false);
    expect(v.reactive).toBe(false);
    expect(v.inKmolS).toBeCloseTo(0.02778, 9);
    expect(v.netKmolS).toBeCloseTo(0, 9);
  });

  it("reactive: IN != OUT is a NET CHANGE, never an alarm state", () => {
    // toluene + H2 -> benzene + CH4 keeps moles here, but a generic
    // reacting case may not: A -> 2B doubles them.
    const v = molarBalanceView(
      [s("A", "feed", 1.0), s("B", "product", 2.0)], {}, true);
    expect(v.reactive).toBe(true);
    expect(v.netKmolS).toBeCloseTo(1.0, 12);   // exposed as net, not closure
  });

  it("solids convert kg/s -> kmol/s via MW", () => {
    const v = molarBalanceView(
      [s("brine", "feed", 0.01),
       s("cake", "product", 0.002, { halite: 0.05844 })],  // 1e-3 kmol/s
      { halite: 58.44 }, false);
    expect(v.outKmolS).toBeCloseTo(0.002 + 0.001, 9);
  });

  it("a solid with a missing MW is PARTIAL naming the component -- never a"
     + " silent omission", () => {
    const v = molarBalanceView(
      [s("feed", "feed", 0.01),
       s("cake", "product", 0.002, { mysterySolid: 0.05 })],
      {}, false);
    expect(v.partialMissingMW).toEqual(["mysterySolid"]);
    expect(v.outKmolS).toBeCloseTo(0.002, 12);   // the known part only
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
});
