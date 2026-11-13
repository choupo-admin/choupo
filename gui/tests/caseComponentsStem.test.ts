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

import { describe, expect, it } from "vitest";

import { caseComponentFiles, caseComponents } from "../src/case/catalogue.js";

describe("caseComponents — stem-keyed, proposals excluded", () => {
  it("skips un-promoted <name>.estimate-DATE.dat proposals (not usable as a component)", () => {
    const raw = {
      "constant/components/pentadiene.estimate-2026-06-06.dat":
        "name pentadiene;\nTc 490;\nvaporPressure { model AmbroseWalton; }\n",
    };
    expect(caseComponents(raw)).toEqual([]);
    expect(caseComponentFiles(raw)).toEqual({});
  });

  it("keys by the FILENAME STEM (the engine's key), not the in-file name field", () => {
    // file is foo.dat though the body says name=bar — the engine resolves 'foo'
    const list = caseComponents({
      "constant/components/foo.dat": "name bar;\nTc 400;\nvaporPressure { model AmbroseWalton; }\n",
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("foo");
  });
});
