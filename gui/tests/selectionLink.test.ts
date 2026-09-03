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
  The compound SET as an address (2026-09-03).  Vítor split the Explore
  workspace in two -- a Compounds tab that chooses, an Explore tab that plots
  -- and the selection crosses between them in the URL because a tab may not
  depend on state its address does not name (one-tab-one-thing).  These pin the
  wire format from BOTH sides, since one home with two callers is only one home
  while the round trip holds.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { componentsInSearch, propertiesLink } from "../src/ui/explore/selectionLink.js";

describe("the compound SET travels in the URL", () => {
  it("reads the names an Explore URL carries, in order", () => {
    expect(componentsInSearch("?workspace=properties&components=water,ethanol"))
      .toEqual(["water", "ethanol"]);
    //  The address the FIRST build emitted still parses: `?workspace=explore`
    //  with a set reaches the surfaces (store.bootWorkspace), because a URL
    //  that names components is asking to plot them.
    expect(componentsInSearch("?workspace=explore&components=water,ethanol"))
      .toEqual(["water", "ethanol"]);
  });

  it("treats a URL naming no components as a legitimate address, not an error", () => {
    //  THE DOOR IS NOT A GATE.  The Explore tab must open with an empty SET:
    //  if it could only be reached through the catalogue, the pair would be
    //  the STEP-1/STEP-2 setup wizard docs/ai/gui-credo.md §5 forbids.
    expect(componentsInSearch("?workspace=properties")).toEqual([]);
    expect(propertiesLink([])).toBe("?workspace=properties");
  });

  it("passes names through verbatim -- the catalogue resolves them EXACTLY", () => {
    //  components/<name>.dat is an exact-name lookup (Database.cpp, CLAUDE.md
    //  §7).  A helpful lowercase here would be a name the engine cannot find.
    expect(componentsInSearch("?components=Water,MEA")).toEqual(["Water", "MEA"]);
  });

  it("drops empties and duplicates but keeps first-seen order", () => {
    expect(componentsInSearch("?components=water,,ethanol,water,"))
      .toEqual(["water", "ethanol"]);
  });

  it("round-trips: what the button writes is what the plot tab reads", () => {
    for (const set of [["water"], ["water", "ethanol"], ["1-butanol", "n-hexane"]]) {
      expect(componentsInSearch(propertiesLink(set))).toEqual(set);
    }
  });

  it("encodes a name that would otherwise break the query string", () => {
    const link = propertiesLink(["ethyl acetate", "a&b"]);
    expect(link).toContain("ethyl%20acetate");
    expect(componentsInSearch(link)).toEqual(["ethyl acetate", "a&b"]);
  });
});
