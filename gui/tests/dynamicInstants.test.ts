// Tests for the dynamic-instant pipeline: the parser of the OpenFOAM-style
// time directories the choupoBatch / choupoCtrl / choupoSemiContinuous WASM
// binaries write at the case root -- since task #186 in the layout of 0/:
// `<t>/<stream>` (one file per stream) and `<t>/internalStates/<unit>` (one
// holdup record per vessel) -- and the binary-dispatch logic that routes a
// case to the right WASM module by controlDict.application.
//
// The fixtures are the shape a native ctrl03 / batch04 run writes (the
// stream header, kmol/h flows, the holdup record with units on every value).

import { describe, expect, it } from "vitest";

import { parseDynamicInstants } from "../src/case/dynamicInstants.js";
import { selectBinary } from "../src/adapters/WasmAdapter.js";

// ---- Fixtures --------------------------------------------------------------

const STREAM_HEAD = `/*--- Choupo stream state.  Every DIMENSIONAL value carries its unit; the parser converts to SI.
     componentMolarFlows is the OVERALL material (all phases); a phases{} block, when present,
     is a decomposition that sums back to it exactly. ---*/
`;

// ctrl03 (continuous dynamicCSTR): the authored 0/ and one written instant.
const ctrlHoldup0 = `recordType  internalState;
unit        "reactor";
equipment   dynamicCSTR;
holdup
{
    T           320.0;
    P           101299.99999999999;
    V           0.001;
    holdupMolar
    {
        compA   0.012;
        compB   0.0;
    }
}
`;

const ctrlFeed0 = `componentMolarFlows
{
    compA  5e-05 kmol/s;
    compB  0.0 kmol/s;
}
T               320.0 K;
P               101299.99999999999 Pa;
`;

const ctrlHoldup500 = `/*--------------------------------*- Choupo -*--------------------------------*\\
  THE HOLDUP OF ONE VESSEL at t = 500 s (ctrl).
\\*---------------------------------------------------------------------------*/

recordType  internalState;

unit        "reactor";
equipment   dynamicCSTR;
time        500;   // s (real, physical)

holdup
{
    T           349.91763572550042 K;
    P           101299.99999999999 Pa;
    V           0.001 m3;
    holdupMolar
    {
        compA            0.011203454249963758 kmol;
        compB            0.00079654575003620324 kmol;
    }
    extras
    {
        F_in             5.0000000000000002e-05;
        T_jacket         349.67495182942599;
    }
}
`;

const ctrlProduct500 = STREAM_HEAD + `
componentMolarFlows
{
    compA    0.1680518137 kmol/h;
    compB    0.01194818625 kmol/h;
}

T               349.9176357 K;
P               101300 Pa;
`;

// batch04 (closed batchReactor): the AUTHORED 0/ holdup is written the way an
// author writes it (totalMoles + molarComposition), the instant the way the
// engine writes it (holdupMolar) -- the parser reads both spellings.
const batchHoldup0 = `recordType internalState;
unit "reactor";
equipment batchReactor;
holdup
{
    T            350.0 K;
    P            1.013 bar;
    V            0.001;
    totalMoles   0.0185;
    molarComposition  { ethanol 0.5;  aceticAcid 0.5;  ethylAcetate 0.0;  water 0.0; }
}
`;

const batchHoldup120 = `recordType  internalState;
unit        "reactor";
equipment   batchReactor;
time        120;
holdup
{
    T           327.41585281358238 K;
    P           101299.99999999999 Pa;
    V           0.001 m3;
    holdupMolar
    {
        ethanol          0.0087110259117045667 kmol;
        water            0.00053897408829541721 kmol;
        aceticAcid       0.0087110259117045667 kmol;
        ethylAcetate     0.00053897408829541721 kmol;
    }
    notRestored "nothing, for the test";
}
`;

describe("parseDynamicInstants", () => {
  it("returns null when no time-directory files are present (steady run)", () => {
    expect(parseDynamicInstants({})).toBeNull();
    expect(
      parseDynamicInstants({ "psat.csv": "T,P\n300,1\n", "scan/Z.csv": "x\n1\n" }),
    ).toBeNull();
  });

  it("parses a continuous (ctrl) run: ordered instants, holdups AND streams", () => {
    const out = parseDynamicInstants({
      "0/internalStates/reactor": ctrlHoldup0,
      "0/feed": ctrlFeed0,
      "500/internalStates/reactor": ctrlHoldup500,
      "500/product": ctrlProduct500,
    });
    expect(out).not.toBeNull();
    expect(out!.application).toBe("ctrl");
    expect(out!.components).toEqual(["compA", "compB"]);

    // Instants are time-ordered numerically (0 then 500).
    expect(out!.instants.map((i) => i.t)).toEqual([0, 500]);
    expect(out!.instants.map((i) => i.dir)).toEqual(["0", "500"]);

    const at0 = out!.instants[0]!;
    const reactor0 = at0.units[0]!;
    expect(reactor0.name).toBe("reactor");
    expect(reactor0.type).toBe("dynamicCSTR");
    expect(reactor0.T).toBeCloseTo(320, 6);
    expect(reactor0.holdupMolar.compA).toBeCloseTo(0.012, 9);
    expect(reactor0.holdupMolar.compB).toBe(0);
    // The feed stream at 0 is its own file, named by the stream.
    expect(at0.streams.map((s) => s.name)).toEqual(["feed"]);
    expect(at0.streams[0]!.F).toBeCloseTo(5e-5, 12);

    // The 500 s instant evolved; its product stream is read in kmol/s.
    const i500 = out!.instants[1]!;
    const reactor500 = i500.units[0]!;
    expect(reactor500.T).toBeGreaterThan(320);
    expect(reactor500.holdupMolar.compB).toBeCloseTo(0.00079654575003620324, 12);
    expect(reactor500.extras!.T_jacket).toBeCloseTo(349.67495182942599, 9);
    const product = i500.streams.find((s) => s.name === "product")!;
    expect(product.molarFlows.compA).toBeCloseTo(0.1680518137 / 3600, 12);
    expect(product.T).toBeCloseTo(349.9176357, 6);
  });

  it("parses a batch run: both inventory spellings, V, notRestored, batch app", () => {
    const out = parseDynamicInstants({
      "0/internalStates/reactor": batchHoldup0,
      "120/internalStates/reactor": batchHoldup120,
    });
    expect(out).not.toBeNull();
    expect(out!.application).toBe("batch");
    const r0 = out!.instants[0]!.units[0]!;
    expect(r0.holdupMolar.ethanol).toBeCloseTo(0.0185 * 0.5, 12);
    expect(r0.P).toBeCloseTo(101300, 6);
    const r120 = out!.instants[1]!.units[0]!;
    expect(r120.type).toBe("batchReactor");
    expect(r120.V).toBeCloseTo(0.001, 9);
    expect(r120.holdupMolar.aceticAcid).toBeCloseTo(0.0087110259117, 9);
    expect(r120.notRestored).toBe("nothing, for the test");
    expect(out!.instants[1]!.streams).toHaveLength(0);
  });

  it("sorts numerically, not lexically (100 after 50)", () => {
    const mk = (t: number) =>
      `recordType internalState; unit "r"; equipment dynamicCSTR;\nholdup { T 3${t}; P 1; holdupMolar { a ${t}; } }\n`;
    const out = parseDynamicInstants({
      "50/internalStates/r": mk(50),
      "100/internalStates/r": mk(100),
      "0/internalStates/r": mk(0),
    });
    expect(out!.instants.map((i) => i.t)).toEqual([0, 50, 100]);
  });

  it("ignores non-instant files, nested paths and the RETIRED shape", () => {
    const out = parseDynamicInstants({
      "0/internalStates/reactor": ctrlHoldup0,
      "trajectory.csv": "t,x\n0,1\n",
      "constant/internalStates/x": "bogus",   // not a time directory
      "system/feed": "bogus",
      // The retired layout: no dual reader in the GUI either.
      "50/internalState": 'time 50; units { "reactor" { T 330; P 1; holdupMolar { compA 1; } } }',
      "50/streamFaces": "time 50; faces { }",
    });
    expect(out).not.toBeNull();
    expect(out!.instants.map((i) => i.dir)).toEqual(["0"]);
  });

  it("survives malformed instant text without throwing", () => {
    const out = parseDynamicInstants({
      "0/internalStates/reactor": "this is not a dict {{{ ;;; ",
      "500/internalStates/reactor": ctrlHoldup500,
    });
    // The garbage instant is dropped; the valid one survives.
    expect(out).not.toBeNull();
    expect(out!.instants.map((i) => i.t)).toEqual([500]);
  });
});

describe("selectBinary (WASM dispatch by application)", () => {
  it("routes choupoCtrl / choupoBatch to their own binaries", () => {
    expect(selectBinary("choupoCtrl")).toBe("choupoCtrl");
    expect(selectBinary("choupoBatch")).toBe("choupoBatch");
  });
  it("routes choupoSemiContinuous (the fifth class, 2026-09-20) to its own binary", () => {
    expect(selectBinary("choupoSemiContinuous")).toBe("choupoSemiContinuous");
  });
  it("routes choupoProps to the props binary", () => {
    expect(selectBinary("choupoProps")).toBe("choupoProps");
  });
  it("defaults to choupoSolve for steady / absent / unknown application", () => {
    expect(selectBinary("choupoSolve")).toBe("choupoSolve");
    expect(selectBinary(undefined)).toBe("choupoSolve");
    expect(selectBinary("")).toBe("choupoSolve");
    expect(selectBinary("somethingElse")).toBe("choupoSolve");
  });
});
