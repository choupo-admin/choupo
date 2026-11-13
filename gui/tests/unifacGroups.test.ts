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

import {
  buildLocalUnifac, hasUnifacGroups, unifacGroupsBlock, unifacGroupsFromDat,
} from "../src/case/unifacGroups.js";

const WITH_GROUPS =
  "name testol;\nformula C2H6O;\nTc 514;\nvaporPressure { model AmbroseWalton; }\n" +
  "unifac { groups ( { group CH3; count 1; } { group CH2; count 1; } { group OH; count 1; } ); }\n";
const NO_GROUPS = "name plain;\nformula C2H6;\nTc 305;\nvaporPressure { model AmbroseWalton; }\n";

describe("case-local UNIFAC groups (Explorer G2)", () => {
  it("unifacGroupsFromDat parses the unifac { groups (...) } block", () => {
    const g = unifacGroupsFromDat(WITH_GROUPS);
    expect(g).toEqual([
      { group: "CH3", count: 1 },
      { group: "CH2", count: 1 },
      { group: "OH", count: 1 },
    ]);
  });

  it("returns null when there is no unifac block (never throws)", () => {
    expect(unifacGroupsFromDat(NO_GROUPS)).toBeNull();
    expect(unifacGroupsFromDat("this is not a dict {{{")).toBeNull();
  });

  it("buildLocalUnifac maps case-local component name -> groups", () => {
    const local = buildLocalUnifac({
      "constant/components/testol.dat": WITH_GROUPS,
      "constant/components/plain.dat": NO_GROUPS,
      "system/controlDict": "application choupoProps;",
    });
    expect(Object.keys(local)).toEqual(["testol"]);
    expect(local.testol).toHaveLength(3);
    expect(buildLocalUnifac(undefined)).toEqual({});
  });

  it("local declarations are consulted first, the bundled map as fallback", () => {
    const local = { testol: [{ group: "CH3", count: 2 }] };
    expect(hasUnifacGroups("testol", local)).toBe(true);   // local only
    expect(hasUnifacGroups("water", local)).toBe(true);    // bundled fallback
    expect(hasUnifacGroups("nope", local)).toBe(false);
    expect(hasUnifacGroups("water")).toBe(true);           // no local arg
  });

  it("unifacGroupsBlock: local overrides the bundled map", () => {
    const local = { water: [{ group: "FAKE", count: 9 }] };
    const block = unifacGroupsBlock(["water", "ethanol", "nope"], local);
    expect(block.water).toEqual([{ group: "FAKE", count: 9 }]);   // local wins
    expect(block.ethanol).toHaveLength(3);                         // bundled
    expect(block.nope).toBeUndefined();                           // neither
  });
});
