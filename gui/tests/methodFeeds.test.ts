import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import { binaryVleSpec, orderBinaryByVolatility } from "../src/case/methodFeeds.js";

// The binary-VLE feed moved to ONE home (case/methodFeeds.ts) when McCabe-
// Thiele migrated to the Methods workspace (2026-08-15): Explore's T-x-y /
// γ(x) / flash lenses and Methods' McCabe tool consume the SAME spec builder.
// This pins the shared contract so the two hosts cannot drift apart.
const NO_LOCAL = buildLocalUnifac({});

describe("methodFeeds — the ONE binary-VLE feed shared by Explore and Methods", () => {
  it("puts the more volatile component on the x-axis and shapes mccabe like the T-x-y", () => {
    // toluene picked first: the feed reorders by Tb so y*(x) sits above y = x
    expect(orderBinaryByVolatility(["toluene", "benzene"], CATALOGUE))
      .toEqual(["benzene", "toluene"]);
    const spec = binaryVleSpec({
      pair: ["toluene", "benzene"], catalogue: CATALOGUE, kind: "mccabe",
      activity: "NRTL", eos: "idealGas", P: 101325, n: 60, localUnifac: NO_LOCAL,
    });
    expect(spec.components).toEqual(["benzene", "toluene"]);
    expect(spec.properties).toEqual(["T_bubble", "y_eq_benzene", "liquid_stable"]);
    expect(spec.axis.variable).toBe("x[benzene]");
    expect(spec.vleTwoLiquid).toBe(true);   // the LL probe rides the T-x-y family
    // γ(x) sweeps the two activity coefficients instead — no stability probe
    const g = binaryVleSpec({
      pair: ["benzene", "toluene"], catalogue: CATALOGUE, kind: "gamma",
      activity: "NRTL", eos: "idealGas", P: 101325, n: 60, localUnifac: NO_LOCAL,
    });
    expect(g.properties).toEqual(["gamma_benzene", "gamma_toluene"]);
    expect(g.vleTwoLiquid).toBeUndefined();
  });
});
