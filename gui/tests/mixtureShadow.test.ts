/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  A name with two owners: "air" is BOTH a catalogue mixture expansion table
  (mixtures/air.dat -> N2 + O2 + Ar) and a standard pseudo-component (the
  lumped MW-28.96 carrier the psychrometric menu offers).  The engine's
  settled precedence gives the tie to the CASE -- a case-local
  constant/components/air.dat loads the component and shadows the
  expansion -- so a synthesized explore case that means the component must
  ship its body.  Found 2026-08-31: without this the psychrometric chart
  refused "carrier 'air' is not a component" the day the menu offered air,
  in the EduTool and the Explorer alike.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE, mixtureShadowedBodies } from "../src/case/catalogue.js";
import { synthesizeExploreCase } from "../src/case/exploreSynth.js";
import { psychroSpec } from "../src/case/methodFeeds.js";

describe("mixture-shadowed component bodies", () => {
  it("air is shadowed and gets its catalogue body, others contribute nothing", () => {
    const out = mixtureShadowedBodies(["air", "water", "N2"]);
    expect(Object.keys(out)).toEqual(["constant/components/air.dat"]);
    expect(out["constant/components/air.dat"]).toContain("noncondensable true;");
    expect(out["constant/components/air.dat"]).toContain("idealGasHeatCapacity");
    expect(out["constant/components/air.dat"]).toContain("diffusionVolume");
  });

  it("a synthesized psychro case with the air carrier ships the body", () => {
    const spec = psychroSpec({
      pair: ["air", "water"], catalogue: CATALOGUE, P: 101325,
      TminK: 273.15, TmaxK: 333.15, gridN: 61,
      rhFrom: 20, rhTo: 80, rhStep: 20, wbStepC: 10,
    });
    const files = synthesizeExploreCase(spec);
    expect(files.extraFiles?.["constant/components/air.dat"],
      "the air body is not shipped — the engine would expand the mixture"
      + " and the chart would refuse the carrier").toBeTruthy();
  });

  it("an explicit case file still wins over the shadow body", () => {
    const spec = psychroSpec({
      pair: ["air", "water"], catalogue: CATALOGUE, P: 101325,
      TminK: 273.15, TmaxK: 333.15, gridN: 61,
      rhFrom: 20, rhTo: 80, rhStep: 20, wbStepC: 10,
      componentFiles: { "constant/components/air.dat": "name air;\n// case's own\n" },
    });
    const files = synthesizeExploreCase(spec);
    expect(files.extraFiles?.["constant/components/air.dat"])
      .toContain("case's own");
  });
});
