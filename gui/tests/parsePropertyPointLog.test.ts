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
import { parsePropertyPointReferences } from "../src/ui/parsePropertyPointLog.js";

// The log-scraping parser was retired (strategy P4b): property-point VALUES
// now travel through the machine block (each op's engine diagnostics).  What
// remains here is the DICT side: the per-op reference{} blocks.
describe("parsePropertyPointReferences", () => {
  it("reads per-op reference blocks from the propsDict", () => {
    const refs = parsePropertyPointReferences({
      operations: [
        { name: "N2_298K_1bar", type: "propertyPoint",
          reference: { Cp_ig: 29.12, source: "NIST WebBook" } },
      ],
    });
    expect(refs.get("N2_298K_1bar")?.values["Cp_ig"]).toBe(29.12);
  });
});
