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

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/


/*---------------------------------------------------------------------------*\
  The P-T lens's caption, against the picture it captions.

  The two CSV shapes below are the HEADS of real native runs (choupoProps,
  2026-09-21): water with the GUI's solid-phase table, and benzene, which has
  no entry in it.  The engine's own summary lines for those two runs read

      water:   + solid (triple 273.160000 K)   saturation 60, sublimation 30, fusion 30
      benzene: (L-V only)                      saturation 60, sublimation 0,  fusion 0

  and the caption said "Solid region omitted" for BOTH.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  phaseCurvesDrawn, solidPhaseFor, solidRegionCaption,
} from "../src/case/solidPhaseData.js";

const WATER = [
  "T,P,curve",
  "2.73160000e+02,6.11657000e+02,saturation",
  "6.47140000e+02,2.20640000e+07,critical",
  "2.13064800e+02,1.03062719e+00,sublimation",
  "2.73160000e+02,6.11657000e+02,triple",
  "2.73160000e+02,6.11657000e+02,fusion",
].join("\n");

const BENZENE = [
  "T,P,curve",
  "2.52922500e+02,2.66332293e+01,saturation",
  "5.62050000e+02,4.89500000e+06,critical",
].join("\n");

describe("the P-T caption describes the picture, not the wish", () => {
  it("water: the solid lines ARE drawn, and the caption says so", () => {
    const drawn = phaseCurvesDrawn(WATER);
    expect(drawn).toEqual({ sublimation: true, fusion: true, triple: true });
    const cap = solidRegionCaption(drawn);
    //  THE DEFECT: this sentence used to read "Solid region omitted" under a
    //  legend carrying "sublimation (S-V)" and "fusion (S-L)".
    expect(cap).not.toMatch(/omitted/i);
    expect(cap).toContain("sublimation");
    expect(cap).toContain("fusion");
    expect(cap).toContain("triple point");
    //  ...and it is the FULL caption, not the partial one.  A first version
    //  of this arm asserted only the four lines above, and every one of them
    //  is ALSO true of the "sublimation drawn, fusion not" sentence -- so a
    //  sabotage that downgraded water to the partial caption SURVIVED it.
    //  The distinguishing words are the ones that say something is MISSING.
    expect(cap).toMatch(/^Solid region drawn:/);
    expect(cap).not.toMatch(/needs|does not carry/);
  });

  it("benzene: nothing solid is drawn, and the caption says THAT", () => {
    const drawn = phaseCurvesDrawn(BENZENE);
    expect(drawn).toEqual({ sublimation: false, fusion: false, triple: false });
    expect(solidRegionCaption(drawn)).toMatch(/omitted/i);
    //  ...and the reason it is: benzene has no entry in the solid table.
    expect(solidPhaseFor("benzene")).toBeUndefined();
    expect(solidPhaseFor("water")).toBeTruthy();
  });

  it("states the THIRD case the old two-way sentence could not", () => {
    //  The engine draws the sublimation curve whenever the S-V anchor exists
    //  and the melting line only when dVfus does too (PurePhaseDiagram.cpp).
    //  No shipped compound reaches this today -- water is the only entry in
    //  the solid table and it carries dVfus -- but the branch exists because
    //  the ENGINE has three states, and a caption that can only say two must
    //  be wrong about one of them the day the third appears.
    const cap = solidRegionCaption({ sublimation: true, fusion: false, triple: true });
    expect(cap).toContain("sublimation");
    expect(cap).toMatch(/fusion \(S–L\) line needs/);
    expect(cap).not.toMatch(/^Solid region drawn/);
  });

  it("claims nothing when there is no picture yet", () => {
    //  A caption is rendered before the first run returns; asserting a solid
    //  region there would be the same defect pointing the other way.
    for (const nothing of [null, undefined, "", "T,P,curve", "no,header,here"])
      expect(phaseCurvesDrawn(nothing))
        .toEqual({ sublimation: false, fusion: false, triple: false });
  });

  it("reads the `curve` column wherever it sits", () => {
    const reordered = ["curve,T,P", "sublimation,2.1e2,1.0", "fusion,2.7e2,6.1e2"].join("\n");
    expect(phaseCurvesDrawn(reordered).sublimation).toBe(true);
    expect(phaseCurvesDrawn(reordered).fusion).toBe(true);
    expect(phaseCurvesDrawn(reordered).triple).toBe(false);
  });
});
