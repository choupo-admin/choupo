// Tests for the dynamic-instant pipeline: the parser of the OpenFOAM-style
// <t>/internalState + <t>/streamFaces files the choupoBatch / choupoCtrl WASM
// binaries write at the case root, and the binary-dispatch logic that routes a
// case to the right WASM module by controlDict.application.
//
// The fixtures are REAL output captured from a native ctrl03 / batch04 run, so
// the parser is exercised against the exact dict shape the C++ engine emits
// (header comment block + scientific-notation scalars + trailing-comment units).

import { describe, expect, it } from "vitest";

import { parseDynamicInstants } from "../src/case/dynamicInstants.js";
import { selectBinary } from "../src/adapters/WasmAdapter.js";

// ---- Fixtures (verbatim from a native run) --------------------------------

// ctrl03 (continuous dynamicCSTR) -- internalState + streamFaces, two instants.
const ctrlInternal0 = `/*--------------------------------*- Choupo -*----------------------------------*\\
| Choupo v0.3.0   DYNAMIC instant   time 0 s   (ctrl)
\\*-----------------------------------------------------------------------------*/

time            0;   // s (real, physical)
application     ctrl;

units
{
    "reactor"
    {
        type        dynamicCSTR;
        T           320;   // K
        P           101299.99999999999;   // Pa
        holdupMolar                       // kmol per species (inventory)
        {
            compA            0.012;
            compB            0;
        }
    }
}
`;

const ctrlStreams0 = `time            0;
faces
{
    "reactor.out"
    {
        bc          computed;
        T           320;   // K
        P           101299.99999999999;   // Pa
        vf          0;
        molarFlows
        {
            compA            1.388888888888889e-08;
            compB            0;
        }
    }
}
`;

const ctrlInternal500 = `time            500;
application     ctrl;

units
{
    "reactor"
    {
        type        dynamicCSTR;
        T           320.84003501084953;   // K
        P           101299.99999999999;   // Pa
        holdupMolar
        {
            compA            0.011574254173456486;
            compB            0.00042574582654350226;
        }
    }
}
`;

// batch04 (closed batchReactor) -- internalState only, carries V.
const batchInternal120 = `time            120;
application     batch;

units
{
    "reactor"
    {
        type        batchReactor;
        T           327.41585281358238;   // K
        P           101299.99999999999;   // Pa
        V           0.001;   // m^3
        holdupMolar
        {
            ethanol          0.0087110259117045667;
            water            0.00053897408829541721;
            aceticAcid       0.0087110259117045667;
            ethylAcetate     0.00053897408829541721;
        }
    }
}
`;

describe("parseDynamicInstants", () => {
  it("returns null when no instant files are present (steady run)", () => {
    expect(parseDynamicInstants({})).toBeNull();
    expect(
      parseDynamicInstants({ "psat.csv": "T,P\n300,1\n", "scan/Z.csv": "x\n1\n" }),
    ).toBeNull();
  });

  it("parses a continuous (ctrl) run: ordered instants + holdup + outlet faces", () => {
    const out = parseDynamicInstants({
      "0/internalState": ctrlInternal0,
      "0/streamFaces": ctrlStreams0,
      "500/internalState": ctrlInternal500,
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
    // Outlet face overlaid from the streamFaces file.
    expect(reactor0.outletMolarFlows!.compA).toBeCloseTo(1.388888888888889e-8, 12);
    expect(reactor0.outletT).toBeCloseTo(320, 6);

    // The 500 s instant evolved (compB grew, T rose); no streamFaces file here.
    const reactor500 = out!.instants[1]!.units[0]!;
    expect(reactor500.T).toBeGreaterThan(320);
    expect(reactor500.holdupMolar.compB).toBeGreaterThan(0);
    expect(reactor500.outletMolarFlows).toBeUndefined();
  });

  it("parses a batch run: closed vessel carries V, no outlet face, batch app", () => {
    const out = parseDynamicInstants({ "120/internalState": batchInternal120 });
    expect(out).not.toBeNull();
    expect(out!.application).toBe("batch");
    expect(out!.components).toEqual([
      "ethanol",
      "water",
      "aceticAcid",
      "ethylAcetate",
    ]);
    const reactor = out!.instants[0]!.units[0]!;
    expect(reactor.type).toBe("batchReactor");
    expect(reactor.V).toBeCloseTo(0.001, 9);
    expect(reactor.holdupMolar.aceticAcid).toBeCloseTo(0.0087110259117, 9);
    expect(reactor.outletMolarFlows).toBeUndefined();
  });

  it("sorts numerically, not lexically (100 after 50)", () => {
    const mk = (t: number) =>
      `time ${t};\nunits\n{\n  "r" { type dynamicCSTR; T 3${t}; P 1; holdupMolar { a ${t}; } }\n}\n`;
    const out = parseDynamicInstants({
      "50/internalState": mk(50),
      "100/internalState": mk(100),
      "0/internalState": mk(0),
    });
    expect(out!.instants.map((i) => i.t)).toEqual([0, 50, 100]);
  });

  it("ignores non-instant files and nested paths", () => {
    const out = parseDynamicInstants({
      "0/internalState": ctrlInternal0,
      "trajectory.csv": "t,x\n0,1\n",
      "constant/internalState": "bogus",   // nested -> not a root instant dir
      "system/streamFaces": "bogus",
    });
    expect(out).not.toBeNull();
    expect(out!.instants).toHaveLength(1);
  });

  it("survives malformed instant text without throwing", () => {
    const out = parseDynamicInstants({
      "0/internalState": "this is not a dict {{{ ;;; ",
      "50/internalState": ctrlInternal500,
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
