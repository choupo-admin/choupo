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
  The Evidence view's ADDRESS (DEV.md 4c C117): the lens, the datasets and
  the candidate models in the URL a professor pastes -- one writer, one
  reader, and every address written before the keys existed unchanged.
  Also: the lens is OFFERED for a pair only where some tier carries a
  dataset about it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { evidenceForPair } from "../src/case/evidence.js";
import { viewsFor } from "../src/case/exploreViews.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import {
  componentsInSearch, evidenceLink, evidenceSelectionInSearch, lensInSearch, propertiesLink,
} from "../src/ui/explore/selectionLink.js";

describe("the Evidence address round-trips", () => {
  it("writer -> reader, lists verbatim, the lens named", () => {
    const link = evidenceLink(["methanol", "water"],
      ["methanol-water-bubble-je200341c", "methanol-water-bubble-j.jct.2009.11.020"],
      ["NRTL@standards", "UNIFAC", "ideal"]);
    expect(link).toBe("?workspace=properties&components=methanol,water&lens=evidence"
      + "&datasets=methanol-water-bubble-je200341c,methanol-water-bubble-j.jct.2009.11.020"
      + "&models=NRTL@standards,UNIFAC,ideal");
    expect(componentsInSearch(link)).toEqual(["methanol", "water"]);
    expect(lensInSearch(link)).toBe("evidence");
    expect(evidenceSelectionInSearch(link)).toEqual({
      datasets: ["methanol-water-bubble-je200341c", "methanol-water-bubble-j.jct.2009.11.020"],
      models: ["NRTL@standards", "UNIFAC", "ideal"],
    });
  });

  it("an absent list means ALL (null); a present empty list means NONE ([])", () => {
    expect(evidenceSelectionInSearch("?workspace=properties&components=a,b&lens=evidence"))
      .toEqual({ datasets: null, models: null });
    expect(evidenceSelectionInSearch(evidenceLink(["a", "b"], [], ["ideal"])))
      .toEqual({ datasets: [], models: ["ideal"] });
  });

  it("every older address still reads as it did: no lens, no selection", () => {
    const old = propertiesLink(["water", "ethanol"]);
    expect(lensInSearch(old)).toBeNull();
    expect(evidenceSelectionInSearch(old)).toEqual({ datasets: null, models: null });
    expect(componentsInSearch(old)).toEqual(["water", "ethanol"]);
    expect(lensInSearch("?workspace=properties&lens=")).toBeNull();
  });
});

describe("the lens is offered where a dataset exists, and only there", () => {
  const NO_LOCAL = buildLocalUnifac({});
  it("methanol + water (curate04's two studies) offers it, order-free", () => {
    expect(viewsFor(["methanol", "water"], CATALOGUE, NO_LOCAL).has("evidence")).toBe(true);
    expect(viewsFor(["water", "methanol"], CATALOGUE, NO_LOCAL).has("evidence")).toBe(true);
  });
  it("a pair nobody measured in any bundled tier does not", () => {
    //  measured, not assumed: pick a VLE-able pair with no dataset in the tree
    const pair: [string, string] = ["nHexane", "nHeptane"];
    expect(evidenceForPair(...pair).length).toBe(0);
    expect(viewsFor(pair, CATALOGUE, NO_LOCAL).has("evidence")).toBe(false);
    //  ... until the open case carries one
    const je = evidenceForPair("methanol", "water").find((d) => d.provenance.doi === "10.1021/je200341c")!;
    const text = `property binaryVLE.T_bubble;\nsystem ( nHexane nHeptane );\npressure 101325 Pa;\n`
      + `provenance { source measured; citation "x"; sha256 "${"0".repeat(64)}"; }\n`
      + `columns ( { name x[nHexane]; unit -; } { name T_bubble; unit K; } );\n`
      + `data ( ${je.rows.slice(0, 3).map((r) => `${r[0]} ${r[1]}`).join(" ")} );\n`;
    expect(viewsFor(pair, CATALOGUE, NO_LOCAL, { "constant/experiments/hh.dat": text }).has("evidence")).toBe(true);
  });
  it("a single component or a triple never offers it", () => {
    expect(viewsFor(["water"], CATALOGUE, NO_LOCAL).has("evidence")).toBe(false);
    expect(viewsFor(["methanol", "water", "ethanol"], CATALOGUE, NO_LOCAL).has("evidence")).toBe(false);
  });
});
