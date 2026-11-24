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

// caseNameResolver -- ONE resolver of a case name (bare or full), held by
// the browser pass of 2026-11-24: `?case=<bare name>` and the EduTool
// witnesses written by bare name did not open their case.
import { describe, expect, it } from "vitest";

import { resolveCaseName, tutorialByName } from "../src/cases/tutorials.js";

describe("resolveCaseName (pure)", () => {
  const names = ["steady/flash/a1", "batch/x/a1", "steady/flash/b2"];
  it("resolves a full path and a unique bare name", () => {
    expect(resolveCaseName("steady/flash/b2", names)).toEqual({ status: "found", name: "steady/flash/b2" });
    expect(resolveCaseName("b2", names)).toEqual({ status: "found", name: "steady/flash/b2" });
  });
  it("refuses an ambiguous bare name BY NAME, with the candidates", () => {
    expect(resolveCaseName("a1", names)).toEqual({
      status: "ambiguous", candidates: ["batch/x/a1", "steady/flash/a1"],
    });
  });
  it("answers none for an unknown name and for an unknown path", () => {
    expect(resolveCaseName("nope", names).status).toBe("none");
    expect(resolveCaseName("steady/flash/nope", names).status).toBe("none");
  });
});

describe("the bundled corpus", () => {
  it("opens flash01 by bare name and by full path to the same entry", () => {
    const full = tutorialByName("steady/flash/flash01_benzene_toluene");
    expect(full).toBeDefined();
    expect(tutorialByName("flash01_benzene_toluene")).toBe(full);
  });
});

