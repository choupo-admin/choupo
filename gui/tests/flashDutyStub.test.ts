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
  The isothermal flash's heat duty must appear as an ENERGY STREAM on the
  flowsheet (a docked utility stub + dashed wire), exactly like a column's
  reboiler/condenser or a heater — NOT as a text line on the node.  This pins
  the consolidation so the flash never silently loses its heat stream again.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const loadFs = (rel: string): JsonDict =>
  toJson(parse(
    readFileSync(join(HERE, "..", "..", "tutorials", rel, "system", "flowsheetDict"), "utf8"),
    { sourceName: "flowsheetDict" },
  )) as JsonDict;

describe("isothermalFlash heat duty as an energy stream", () => {
  it("flash01 gets a docked heat-duty stub + an energy edge to the flash", () => {
    const g = flowsheetToGraph(loadFs("steady/flash/flash01_benzene_toluene"));
    const stub = g.nodes.find((n) => n.id === "duty:flash01:Q");
    expect(stub, "isothermalFlash should synthesize a duty stub").toBeDefined();
    const d = stub!.data as { role?: string; dutyPort?: string; ownerUnit?: string };
    expect(d.role).toBe("utility");
    expect(d.dutyPort).toBe("Q");
    expect(d.ownerUnit).toBe("flash01");
    const edge = g.edges.find((e) => e.source === stub!.id || e.target === stub!.id);
    expect(edge, "an energy wire should connect the duty stub to the flash").toBeDefined();
  });
});
