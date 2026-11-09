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
  THE STREAM CARD DRAWS THE ENGINE'S FLOW ONCE (DEV.md 4c C266 S1 / C269).

  The engine's result block publishes, for every stream, `F` and `F_mass` as
  the OVERALL material -- solids included, exactly as `converged/<stream>`
  stores it -- and `F_solid_mass` as the solid PART of that same material
  (the result's own `streamsNote`, src/result/ResultEmitter.cpp).  The canvas
  card (`StreamTerminal.formatFlowFor`) added the part to the whole, so on
  the running app solidDryer01's `drySolid` read 20.2 kmol/h on the card
  beside 10.2 kmol/h in the Streams table, and donepezil01's eleven solid
  feeds were all exactly doubled.

  Held here against the engine's own run of solidDryer01 (a witness output,
  generated from this tree's binary): the card's label, on both bases, equals
  what the Streams table prints from the same `F` / `F_mass`, on a stream
  whose `F_solid_mass` is not zero -- the only kind of stream on which the
  two could ever differ.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";

import { extractStructured } from "../src/adapters/WasmAdapter.js";
import type { CaseFiles } from "../src/case/types.js";
import { formatFlow } from "../src/state/displayUnits.js";
import { formatFlowFor } from "../src/ui/StreamTerminal.js";
import { totalFlowOf } from "../src/ui/plotting/palette.js";
import { witnessOutput } from "./witnessRead.js";

const CASE = "tutorials/steady/drying/solidDryer01_sugar";
//  `shapeStreams` returns no stream without a flowsheet; an empty one is
//  enough here (the roles it classifies are not what this test reads).
const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {}, flowsheet: {} };

describe("the stream card against the Streams table on a solid-carrying stream", () => {
  const result = () => extractStructured(witnessOutput(CASE, "log.choupoSolve"), emptyCase);

  it("the witness carries a stream with solids, or this test holds nothing", () => {
    const solid = result().streams.filter((s) => (s.F_solid_mass ?? 0) > 1e-12);
    expect(solid.map((s) => s.name)).toContain("drySolid");
  });

  it("molar basis: the card's number is the table's F, not F plus the solid part", () => {
    for (const s of result().streams) {
      const card = formatFlowFor("kmol/h", { F: s.F, F_mass: s.F_mass, F_solid_mass: s.F_solid_mass }, null);
      expect(card, s.name).toBe(`${formatFlow(s.F, "kmol/h")} kmol/h`);
    }
  });

  it("mass basis: the card's number is the table's F_mass, which already holds the solid", () => {
    for (const s of result().streams) {
      if (s.F_mass === undefined) continue;
      const card = formatFlowFor("kg/h", { F: s.F, F_mass: s.F_mass, F_solid_mass: s.F_solid_mass }, null);
      expect(card, s.name).toBe(`${formatFlow(s.F_mass, "kg/h")} kg/h`);
      //  the edge's thickness reads the same overall mass
      expect(totalFlowOf(s)).toBe(s.F_mass);
    }
  });

  it("drySolid: sugar and water, 10.2 kmol/h -- never the 20.2 the card used to show", () => {
    const d = result().streams.find((s) => s.name === "drySolid")!;
    expect(d.F_solid_mass).toBeGreaterThan(0);
    const kmolh = d.F * 3600;
    expect(kmolh).toBeGreaterThan(9);
    expect(kmolh).toBeLessThan(12);
    const card = formatFlowFor("kmol/h", { F: d.F, F_mass: d.F_mass, F_solid_mass: d.F_solid_mass }, null);
    expect(Number(card.split(" ")[0])).toBeCloseTo(kmolh, 1);
  });
});
