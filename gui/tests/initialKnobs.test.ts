import { describe, expect, it } from "vitest";

import {
  applyInitial,
  collectInitialKnobs,
} from "../src/case/initialKnobs.js";
import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";

// A dynamicCSTR flowsheet text (ctrl02-shaped): the `initial{}` block carries
// T as a unit-bearing scalar ("320.0 K"), V as a bare SI number, and a binary
// seed composition.  Parsed through the engine's OWN tokenizer so the unit
// string handling is exercised end-to-end (not a hand-built JSON).
const FLOWSHEET_TEXT = `
units
(
    {
        name        reactor;
        type        dynamicCSTR;
        initial
        {
            T            320.0 K;
            P            1.013 bar;
            V            0.001;
            totalMoles   0.012;
            molarComposition  { compA 1.0;  compB 0.0; }
        }
        inlet
        {
            F            5.0e-5 kmol/h;
            T            320.0 K;
            molarComposition  { compA 1.0;  compB 0.0; }
        }
        operation
        {
            UA           50.0;
            T_jacket     320.0 K;
        }
        reaction    compA_to_compB;
    }
);
controllers
(
    {
        name         TC1;
        type         PID;
        measurement  { unit reactor;  cv T; }
        actuator     { unit reactor;  mv T_jacket; }
        setpoint     350.0;
        gains        { Kp 4.0;  Ki 0.04;  Kd 0.0; }
    }
);
`;

function parseFlowsheet(text: string): JsonDict {
  return toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
}

const FS = parseFlowsheet(FLOWSHEET_TEXT);

describe("collectInitialKnobs — lifting the dynamic unit's initial{} block", () => {
  it("finds the dynamicCSTR's initial conditions at its authored index", () => {
    const ic = collectInitialKnobs(FS);
    expect(ic).not.toBeNull();
    expect(ic!.index).toBe(0);
    expect(ic!.name).toBe("reactor");
    // "320.0 K" canonicalises to 320 K (SI).
    expect(ic!.t0).toBeCloseTo(320.0, 6);
    expect(ic!.v0).toBeCloseTo(0.001, 9);
    expect(ic!.totalMoles).toBeCloseTo(0.012, 9);
    expect(ic!.composition).toEqual({ compA: 1.0, compB: 0.0 });
  });

  it("builds indexed setScalarAtPath targets that match the authored list", () => {
    const ic = collectInitialKnobs(FS);
    expect(ic!.targetPaths).toEqual({
      t0: "units[0].initial.T",
      v0: "units[0].initial.V",
      totalMoles: "units[0].initial.totalMoles",
      composition: "units[0].initial.molarComposition",
    });
  });

  it("returns null when no dynamic-holdup unit has an initial{} block", () => {
    expect(collectInitialKnobs({ units: [{ name: "f", type: "isothermalFlash" }] })).toBeNull();
    expect(collectInitialKnobs({ units: [{ name: "r", type: "dynamicCSTR" }] })).toBeNull();
    expect(collectInitialKnobs(undefined)).toBeNull();
    expect(collectInitialKnobs({ })).toBeNull();
  });
});

describe("applyInitial — pure clone-and-patch of the initial{} scalars", () => {
  it("patches T0 without mutating the input", () => {
    const ic = collectInitialKnobs(FS)!;
    const before = JSON.stringify(FS);
    const next = applyInitial(FS, ic, { t0: 300 }) as JsonDict;
    // Input untouched (pure).
    expect(JSON.stringify(FS)).toBe(before);
    const unit = (next["units"] as JsonDict[])[0]!;
    const init = unit["initial"] as JsonDict;
    expect(init["T"]).toBe(300);
    // Other fields ride along unchanged.
    expect(init["V"]).toBe(0.001);
  });

  it("replaces the seed composition when patched", () => {
    const ic = collectInitialKnobs(FS)!;
    const next = applyInitial(FS, ic, { composition: { compA: 0.6, compB: 0.4 } }) as JsonDict;
    const init = (next["units"] as JsonDict[])[0]!["initial"] as JsonDict;
    expect(init["molarComposition"]).toEqual({ compA: 0.6, compB: 0.4 });
  });

  it("leaves a non-target unit index alone", () => {
    const ic = collectInitialKnobs(FS)!;
    const twoUnit: JsonDict = {
      units: [
        ...(FS["units"] as JsonDict[]),
        { name: "other", type: "dynamicCSTR", initial: { T: 290 } },
      ],
    };
    const next = applyInitial(twoUnit, ic, { t0: 333 }) as JsonDict;
    const units = next["units"] as JsonDict[];
    expect((units[0]!["initial"] as JsonDict)["T"]).toBe(333);
    expect((units[1]!["initial"] as JsonDict)["T"]).toBe(290);   // untouched
  });
});
