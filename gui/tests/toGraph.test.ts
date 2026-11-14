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
  toGraph cycle-safety tests.

  Recycle / tear streams make the directed unit graph CYCLIC (a recycle
  stream is produced downstream and consumed upstream).  flowsheetToGraph's
  longest-path layering must not loop forever on such graphs -- it did,
  hanging the GUI on open for EVERY recycle case (process03, process05,
  evaporator05).  These tests pin the fix down; if the cycle guard
  regresses, the recursion blows the stack / times out here instead of in
  the browser.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");

function loadFlowsheet(rel: string): JsonDict {
  const text = readFileSync(
    join(TUTORIALS, rel, "system", "flowsheetDict"),
    "utf8",
  );
  return toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
}

describe("toGraph cycle safety (recycle / tear streams)", () => {
  const RECYCLE_CASES = [
    "steady/flowsheets/process03_recycle",
    "steady/flowsheets/process05_isomerization_recycle",
    "steady/evaporation/evaporator05_counter_current",
  ];

  for (const c of RECYCLE_CASES) {
    it(`builds a graph for ${c} without hanging`, () => {
      const g = flowsheetToGraph(loadFlowsheet(c));
      expect(g.nodes.length).toBeGreaterThan(0);
      expect(g.edges.length).toBeGreaterThan(0);
      expect(g.view.units.length).toBeGreaterThan(0);
      // every unit must have become a node
      for (const u of g.view.units) {
        expect(g.nodes.some((n) => n.id === `unit:${u.name}`)).toBe(true);
      }
    }, 5000);
  }

  it("handles a minimal 2-unit recycle cycle", () => {
    const flowsheet = {
      units: [
        { name: "A", type: "mixer", inputs: ["feed", "rec"], outputs: ["mid"] },
        { name: "B", type: "splitter", in: "mid", outputs: ["rec", "prod"] },
      ],
    } as unknown as JsonDict;
    const g = flowsheetToGraph(flowsheet);
    expect(g.nodes.some((n) => n.id === "unit:A")).toBe(true);
    expect(g.nodes.some((n) => n.id === "unit:B")).toBe(true);
  }, 5000);
});

describe("toGraph composite nodes (sector children + connections)", () => {
  it("draws a composite sector as child boxes wired by connections", () => {
    const g = flowsheetToGraph(
      loadFlowsheet("plant/ChemicalPlantTutorial/CONCENTRATION"),
    );
    for (const child of ["Evap1", "Evap2", "Cryst"])
      expect(g.nodes.some((n) => n.id === `unit:${child}`)).toBe(true);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("draws a recursive plant (factory of composite sectors)", () => {
    const g = flowsheetToGraph(loadFlowsheet("steady/flowsheets/plant01_two_sectors"));
    for (const sec of ["secA", "secB"])
      expect(g.nodes.some((n) => n.id === `unit:${sec}`)).toBe(true);
    // the inter-sector connection secA/liquid -> secB makes a secA->secB edge
    expect(
      g.edges.some((e) => e.source === "unit:secA" && e.target === "unit:secB"),
    ).toBe(true);
  });
});
