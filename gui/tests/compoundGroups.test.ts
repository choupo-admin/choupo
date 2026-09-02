import { describe, expect, it } from "vitest";
import { CATALOGUE, metaByName } from "../src/case/catalogue.js";

//  The Property Explorer's compound groups are a VIEW derived from declared
//  record facts (tags, solidPhases, dissociatesTo, Tb) -- never from names.
//  These pin the derivation on records whose facts are not in dispute.
function must(n: string) {
  const m = metaByName(n);
  if (!m) throw new Error(`record ${n} missing from the catalogue`);
  return m;
}

describe("compound groups", () => {
  it("OH is a radical and a combustion species (tags on the record)", () => {
    const m = must("OH");
    expect(m.isRadical).toBe(true);
    expect(m.isCombustion).toBe(true);
  });
  it("NaCl is a salt/mineral and still an electrolyte", () => {
    const m = must("NaCl");
    expect(m.isSaltOrMineral).toBe(true);
    expect(m.isElectrolyte).toBe(true);
  });
  it("N2 and CO2 are gases at 25 C by their declared Tb", () => {
    expect(must("N2").isRoomTemperatureGas).toBe(true);
    expect(must("N2").isPermanentGas).toBe(true);
    expect(must("CO2").isRoomTemperatureGas).toBe(true);
  });
  it("benzene is a volatile liquid and none of the other groups", () => {
    const m = must("benzene");
    expect(m.vleAble).toBe(true);
    expect(m.isRoomTemperatureGas).toBe(false);
    expect(m.isRadical).toBe(false);
    expect(m.isSaltOrMineral).toBe(false);
  });
  it("a record with no Tb is never a room-temperature gas", () => {
    for (const m of CATALOGUE) {
      if (m.tb === undefined) expect(m.isRoomTemperatureGas).toBe(false);
    }
  });
  it("compA is a synthetic stand-in", () => {
    expect(must("compA").isSynthetic).toBe(true);
  });
});
