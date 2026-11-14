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
  unitAcceptance -- the Model tab draws what a unit ACCEPTS from the
  generated gui/schemas/unitAcceptance.json (bin/curate/
  gen_unit_acceptance_docs.py, from both binaries' --describe-units; DEV.md
  4c C188 item 5, slice C), and the raw catalogue text drops the generated
  region rather than show it twice.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";

import { acceptanceOf, acceptanceTypes } from "../src/case/unitAcceptance.js";
import { modelSection } from "../src/case/modelDocs.js";

describe("unit acceptance (generated)", () => {
  it("a declared unit carries the four lists in the generator's words", () => {
    const d = acceptanceOf("batchDiafilter");
    expect(d).not.toBeNull();
    expect(d!.binary).toBe("choupoBatch");
    expect(d!.rule).toBe("aqueousSolventAndNonvolatileSolutes");
    expect(d!.refuses.some((s) => s.startsWith("A component outside what it models"))).toBe(true);
    expect(d!.mayPass[0]).toMatch(/^Nothing/);
    const ed = acceptanceOf("electrodialysisStack");
    expect(ed!.mayPass[0]).toContain("fate diluate | concentrate");
    expect(ed!.needs[0]).toContain("`aqueousActivityModel`");
  });

  it("an undeclared unit has no entry: silence means nothing declared", () => {
    expect(acceptanceOf("cyclone")).toBeNull();
    expect(acceptanceTypes()).not.toContain("cyclone");
  });

  it("the raw section drops the generated region and its markers", () => {
    const s = modelSection("batchDiafilter") ?? "";
    expect(s).toContain("batchDiafilter");
    expect(s).not.toContain("GENERATED unit-acceptance");
    expect(s).not.toContain("**What `batchDiafilter` accepts**");
  });
});
