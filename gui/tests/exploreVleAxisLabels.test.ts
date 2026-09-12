// The T-x-y / γ(x) / flash family runs the binary VOLATILITY-ORDERED, so which
// component the axes carry is a fact about the ENGINE RUN, not about the order
// the reader clicked the two compounds.  This pins the rule on both sides of
// the seam, because it had drifted on one of them:
//
//   * the HOST (ExploreWorkspace) labelled from `selected`, so picking water
//     first and ethanol second drew the T-x-y title as "ethanol / ethanol" and
//     labelled the binary flash's x AND y axes "water" over a curve that is
//     ethanol's;
//   * MethodsWorkspace already reordered for exactly this reason, and PropsView
//     already derives the partner as "the one that is not the indexed
//     component" — the Explorer was the outlier.
//
// The CSV below is the real header the engine writes for this pair (verified by
// running choupoProps on the synthesized case: `x[ethanol],T_bubble,
// y_eq_ethanol,liquid_stable`), which is why the axis component can be READ
// rather than inferred.

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import { binaryVleSpec, orderBinaryByVolatility } from "../src/case/methodFeeds.js";
import { eqCurveFromTxyCsv } from "../src/case/binaryFlash.js";

const NO_LOCAL = buildLocalUnifac({});

// Verbatim from a choupoProps run of the case exploreSynth builds for this
// lens (NRTL, two-liquid package, P = 101325 Pa, n = 11) — first rows only.
const ETOH_WATER_TXY = [
  "x[ethanol],T_bubble,y_eq_ethanol,liquid_stable",
  "0.00000000e+00,3.72453622e+02,0.00000000e+00,1.00000000e+00",
  "1.00000000e-01,3.59151571e+02,4.42332122e-01,1.00000000e+00",
  "5.00000000e-01,3.52762050e+02,6.54893445e-01,1.00000000e+00",
  "1.00000000e+00,3.51452746e+02,1.00000000e+00,1.00000000e+00",
].join("\n");

describe("the binary-VLE lenses label the pair the SPEC ran, not the pick order", () => {
  it("the engine sweeps the more volatile component whichever way the pair is picked", () => {
    // ethanol boils at 351.44 K, water at 373.15 K — ethanol leads.
    for (const pair of [["water", "ethanol"], ["ethanol", "water"]] as [string, string][]) {
      const spec = binaryVleSpec({
        pair, catalogue: CATALOGUE, kind: "flash", activity: "NRTL",
        eos: "idealGas", P: 101325, n: 11, localUnifac: NO_LOCAL,
      });
      expect(spec.axis.variable).toBe("x[ethanol]");
      expect(spec.properties).toContain("y_eq_ethanol");
    }
  });

  it("the HOST's label pair is the ordered one — selected[1] is NOT the partner", () => {
    const selected: [string, string] = ["water", "ethanol"];
    const vlePair = orderBinaryByVolatility(selected, CATALOGUE);
    expect(vlePair).toEqual(["ethanol", "water"]);
    // the T-x-y title reads `${comp} / ${partner}`; comp comes off the CSV, so
    // a partner taken from the pick order repeats it.
    expect(vlePair[1]).toBe("water");
    expect(selected[1]).toBe("ethanol");        // the value that drew "ethanol / ethanol"
  });

  it("the axis component is READ off the CSV, and the partner is the other of the pair", () => {
    const curve = eqCurveFromTxyCsv(ETOH_WATER_TXY);
    expect(curve).not.toBeNull();
    expect(curve!.comp).toBe("ethanol");
    // FlashPlot's rule: the pair is a SET; the indexed one is whichever the
    // header names.  It must hold for BOTH argument orders.
    const partnerOf = (compA: string, compB: string) =>
      (compA === curve!.comp ? compB : compA);
    expect(partnerOf("water", "ethanol")).toBe("water");
    expect(partnerOf("ethanol", "water")).toBe("water");
  });

  it("a pair already in volatility order is untouched (no case that works today moves)", () => {
    const spec = binaryVleSpec({
      pair: ["benzene", "toluene"], catalogue: CATALOGUE, kind: "txy",
      activity: "ideal", eos: "idealGas", P: 101325, n: 11, localUnifac: NO_LOCAL,
    });
    expect(spec.axis.variable).toBe("x[benzene]");
    expect(orderBinaryByVolatility(["benzene", "toluene"], CATALOGUE))
      .toEqual(["benzene", "toluene"]);
  });
});
