/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  adsorptionIsothermsSources -- the `adsorption-isotherms` page held against
  numbers that were not produced by the page's own code.

    * the shipped `resin` set is fitted by two routes written outside the page
      (numpy: polyfit of 1/q on 1/c; a Levenberg-Marquardt on q with a
      central-difference Jacobian; s^2 (J'J)^-1 with N - 2 degrees of
      freedom), and the page must agree;
    * the batch balance is held to the worked example of the course text
      (Geankoplis, Hersel and Lepek, 5th ed., Example 28.2-1, p. 1350);
    * the Freundlich exponent is written n, as that text and the course
      slides write it.
  Source check: docs/design/adsorption-isotherms-from-laboratory-data.md.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  C_UNITS, PARAM_NAMES, Q_UNITS, SYNTHETIC,
  batchDose, directFit, linearisedFit, syntheticPoints,
} from "../src/case/adsorptionIsotherms.js";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("the shipped `resin` set, read by two routes written outside the page", () => {
  //  Hand check of the straight line: slope 0.0767344 and intercept 0.586224
  //  of 1/q against 1/c give q_max = 1/0.586224 = 1.7058 and
  //  K_L = 0.0767344/0.586224 = 0.13090 (Geankoplis, after Eq. 28.1-3).
  const resin = SYNTHETIC.find((s) => s.id === "resin")!;
  const pts = syntheticPoints(resin);

  it("the ten points are the ones the independent program was given", () => {
    expect(pts.length).toBe(10);
    expect(pts[0]).toEqual({ c: 0.02, q: 0.23 });
    expect(pts[9]).toEqual({ c: 20, q: 1.871 });
  });

  it("the double-reciprocal line: q_max 1.7058, K_L 0.1309", () => {
    const f = linearisedFit("langmuir", pts);
    expect(rel(f.params[0]!, 1.7058)).toBeLessThan(2e-4);
    expect(rel(f.params[1]!, 0.13090)).toBeLessThan(5e-4);
  });

  it("the direct fit: q_max 1.7863 +- 0.0264, K_L 0.14776 +- 0.0112, RMS 0.04532", () => {
    const f = directFit("langmuir", pts);
    expect(rel(f.params[0]!, 1.7863)).toBeLessThan(2e-4);
    expect(rel(f.params[1]!, 0.14776)).toBeLessThan(5e-4);
    expect(rel(f.se![0]!, 0.0264)).toBeLessThan(5e-3);
    expect(rel(f.se![1]!, 0.0112)).toBeLessThan(5e-3);
    expect(rel(f.rms, 0.04532)).toBeLessThan(5e-4);
  });
});

describe("the batch balance against a worked example of the course text", () => {
  //  Geankoplis, Hersel and Lepek (5th ed.), Example 28.2-1 (p. 1350): 1.0 m3
  //  of 0.21 kg/m3 phenol with 1.40 kg of fresh carbon, on the Freundlich
  //  isotherm of Example 28.1-1, q = 0.199 c^0.229 (kg/kg, kg/m3), ends at
  //  c = 0.062 kg/m3, q = 0.106 kg/kg.  Run the other way round, the dose to
  //  reach c = 0.062 must come back as about 1.40 kg.
  it("reproduces the dose of Example 28.2-1 to its printed digits", () => {
    const gL = C_UNITS.find((u) => u.id === "g/L")!, kgkg = Q_UNITS.find((u) => u.id === "kg/kg")!;
    const removal = 1 - 0.062 / 0.21;
    const b = batchDose({ model: "freundlich", params: [0.199, 0.229], cU: gL, qU: kgkg, V_L: 1000, c0: 0.21, removal, q0: 0 });
    expect(b.refused).toBeUndefined();
    expect(b.q).toBeCloseTo(0.106, 2);     // 0.1053 against the printed 0.106 (c is rounded to 0.062)
    expect(b.M_g / 1000).toBeGreaterThan(1.39);
    expect(b.M_g / 1000).toBeLessThan(1.41);
  });
});

describe("the Freundlich exponent is written n, as the course text writes it", () => {
  it("the parameter names are K_F and n", () => {
    expect(PARAM_NAMES.freundlich).toEqual(["K_F", "n"]);
  });
});
