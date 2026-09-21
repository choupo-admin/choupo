// The T-x-y / y-x / γ(x) family runs the binary VOLATILITY-ORDERED, so which
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

import { readFileSync } from "node:fs";

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

  //  D4 (2026-09-21).  The equilibrium curve y(x) became a LENS.  It is the
  //  SAME engine run as the T-x-y read against the other axis pair, so the
  //  rule above must hold for it BYTE FOR BYTE — a second run shape here would
  //  be a second home for the same question.
  it("the y-x lens runs the IDENTICAL spec as the T-x-y", () => {
    const args = {
      catalogue: CATALOGUE, activity: "NRTL", eos: "idealGas",
      P: 101325, n: 11, localUnifac: NO_LOCAL,
    } as const;
    for (const pair of [["water", "ethanol"], ["benzene", "toluene"]] as [string, string][]) {
      const txy = binaryVleSpec({ ...args, pair, kind: "txy" });
      const yx = binaryVleSpec({ ...args, pair, kind: "yx" });
      expect(yx).toEqual(txy);
      //  and it carries the liquid-stability probe, so the y-x lens drops the
      //  same column the T-x-y does rather than plotting it as a curve.
      expect(yx.properties).toContain("liquid_stable");
    }
  });

  //  EQUAL AXIS SCALE is what makes an x-y equilibrium diagram readable: the
  //  y = x reference must be drawn at 45 degrees, because the VERTICAL GAP to
  //  the curve is the enrichment.  Measured off the pre-fix screenshot's own
  //  axis ticks (benzene/toluene, 1440x900): the plot box was 1088 x 491 px,
  //  aspect 2.22, so the diagonal came out at 24 degrees.
  //  `constrain: "domain"` is what makes `scaleanchor` safe — without it
  //  Plotly widens the anchored axis's RANGE to satisfy the ratio, which is
  //  how a mole-fraction axis came to show -1.5 (commit 377618c16).
  it("the x-y diagram declares equal scale AND constrains the domain", () => {
    const src = readFileSync(
      new URL("../src/ui/plotting/CsvAutoPlot.tsx", import.meta.url), "utf8");
    //  BOUNDED to buildPlot's x-y branch: the file carries other plots with
    //  their own layouts (the multi-model T-x-y among them), and an unbounded
    //  slice would count theirs and pass on somebody else's declaration.
    const a = src.indexOf('// mode === "x-y"');
    const b = src.indexOf("/** Build the red azeotrope marker", a);
    expect(a, "buildPlot's x-y branch moved — this gate has gone blind").toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const xy = src.slice(a, b);
    expect(xy.length).toBeGreaterThan(400);
    //  COMMENTS STRIPPED before counting.  Prose is not a declaration -- the
    //  lesson of 2026-09-06, and it fired here on the first run: the branch's
    //  own comment explains why `constrain: "domain"` is load-bearing, and the
    //  count read three declarations where the code makes two.
    const layout = xy.slice(xy.indexOf("layout: {"))
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(layout).toMatch(/scaleanchor:\s*"x"/);
    expect(layout).toMatch(/scaleratio:\s*1/);
    //  BOTH axes: the ratio is satisfied by giving on the drawing area, and
    //  an unconstrained partner axis is where the range runs away.
    expect(layout.match(/constrain:\s*"domain"/g) ?? []).toHaveLength(2);
    expect(layout).not.toMatch(/constrain:\s*"range"/);
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
