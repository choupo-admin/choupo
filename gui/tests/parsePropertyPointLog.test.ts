import { describe, expect, it } from "vitest";
import {
  parsePropertyPointLog,
  type PointResult,
} from "../src/ui/parsePropertyPointLog.js";

// One real block produced by choupoProps on N2 @ 298.15 K, 1 bar (ideal gas).
const N2_BLOCK = `
>>>  Operation [0]:  N2_298K_1bar   (type = propertyPoint)

==========================  PropertyPoint  ==========================
  State:           T = 298.15 K   ( 25.00 degC )
                   P = 1.00 bar   ( 100000.00 Pa )
  Composition (mole frac):
    N2                1.000000

  Ideal-gas MIXTURE:
    H_ig         = 0.000000e+00  J/mol
    S_ig         = 191.6100  J/(mol*K)
    Cp_ig        = 29.1769  J/(mol*K)
    gamma=Cp/Cv  = 1.3985

  EoS = idealGas  (vapour root):
    Z            = 1.000000
    v_molar      = 2.47896e-02  m3/mol
    H_residual   = 0.00000e+00  J/mol
    S_residual   = 0.0000  J/(mol*K)
    H_real       = 0.000000e+00  J/mol
    S_real       = 191.6100  J/(mol*K)
=====================================================================
`;

// Mixture block: air 79% N2 / 21% O2 at 298.15 K, 5 bar.
const AIR_BLOCK = `
>>>  Operation [3]:  air_298K_5bar   (type = propertyPoint)

==========================  PropertyPoint  ==========================
  State:           T = 298.15 K   ( 25.00 degC )
                   P = 5.00 bar   ( 500000.00 Pa )
  Composition (mole frac):
    N2                0.790000
    O2                0.210000

  Ideal-gas MIXTURE:
    H_ig         = 0.000000e+00  J/mol
    S_ig         = 185.3451  J/(mol*K)
    Cp_ig        = 29.2193  J/(mol*K)
    gamma=Cp/Cv  = 1.3977

  EoS = idealGas  (vapour root):
    Z            = 1.000000
    v_molar      = 4.95791e-03  m3/mol
    H_residual   = 0.00000e+00  J/mol
    S_residual   = 0.0000  J/(mol*K)
    H_real       = 0.000000e+00  J/mol
    S_real       = 185.3451  J/(mol*K)
=====================================================================
`;

describe("parsePropertyPointLog", () => {
  it("extracts a single pure-component point", () => {
    const r = parsePropertyPointLog(N2_BLOCK);
    expect(r).toHaveLength(1);
    const p = r[0]!;
    expect(p.name).toBe("N2_298K_1bar");
    expect(p.composition).toBe("N2");
    expect(p.T_K).toBe(298.15);
    expect(p.P_bar).toBe(1.0);
    expect(p.S_ig).toBe(191.6100);
    expect(p.Cp_ig).toBe(29.1769);
    expect(p.gamma).toBe(1.3985);
    expect(p.Z).toBe(1.0);
    expect(p.S_real).toBe(191.6100);
  });

  it("extracts a mixture point with two-decimal composition fractions", () => {
    const r = parsePropertyPointLog(AIR_BLOCK);
    expect(r).toHaveLength(1);
    const p = r[0]!;
    expect(p.name).toBe("air_298K_5bar");
    expect(p.composition).toBe("N2:0.79 O2:0.21");
    expect(p.P_bar).toBe(5.0);
    expect(p.S_ig).toBe(185.3451);
  });

  it("extracts multiple consecutive blocks in order", () => {
    const r = parsePropertyPointLog(N2_BLOCK + "\n" + AIR_BLOCK);
    expect(r).toHaveLength(2);
    expect(r[0]!.name).toBe("N2_298K_1bar");
    expect(r[1]!.name).toBe("air_298K_5bar");
  });

  it("skips non-propertyPoint operations", () => {
    const mixed = N2_BLOCK + `
>>>  Operation [1]:  scan01   (type = propertyScan1D)
... scan goes here ...
=====================================================================
` + AIR_BLOCK;
    const r = parsePropertyPointLog(mixed);
    expect(r.map((p: PointResult) => p.name)).toEqual([
      "N2_298K_1bar",
      "air_298K_5bar",
    ]);
  });

  it("returns empty array for a log with no property-point operations", () => {
    expect(parsePropertyPointLog("just some text")).toEqual([]);
    expect(parsePropertyPointLog("")).toEqual([]);
  });
});
