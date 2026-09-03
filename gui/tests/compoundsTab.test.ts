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
  The Compounds tab is a DOOR, not the first step of a wizard (2026-09-03).

  Vítor split the Explore workspace in two: a Compounds tab that chooses
  substances and shows each record, and the Explore tab that plots them.  The
  amendment that came with the split is the thing worth pinning, because it is
  the difference between this pair and the "setup wizard / first-step dialog"
  gui-credo §5 forbids by name: BOTH tabs are listed on the hub, and the
  Explore door names no components, so it opens with an empty set.

  A promise in a header cannot be checked.  These can.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { tabKindFor } from "../src/ui/tabChrome.js";
import { componentsInSearch } from "../src/ui/explore/selectionLink.js";
import { MODE_TABS } from "../src/ui/workspaces.js";

describe("two doors on the hub", () => {
  it("lists Compounds and Explore side by side", () => {
    const labels = MODE_TABS.map((m) => m.label);
    expect(labels).toContain("Compounds");
    expect(labels).toContain("Explore");
  });

  it("opens Compounds first — where a student who does not know what to plot starts", () => {
    expect(MODE_TABS[0]!.label).toBe("Compounds");
  });

  it("gives the Explore door an address that names NO components", () => {
    //  THE ANTI-WIZARD PROPERTY, structural rather than promised: if the hub's
    //  Explore door carried a selection, or did not exist, the only way in
    //  would be through the catalogue and the pair would be STEP 1 / STEP 2.
    const explore = MODE_TABS.find((m) => m.label === "Explore");
    expect(explore, "the Explore door must stay on the hub").toBeTruthy();
    expect(componentsInSearch(explore!.search)).toEqual([]);
  });

  it("gives Compounds its own workspace address", () => {
    const compounds = MODE_TABS.find((m) => m.label === "Compounds");
    expect(compounds!.search).toBe("?workspace=compounds");
  });
});

describe("the Compounds tab's chrome", () => {
  it("wears Explore's chrome — no case, the Property Explorer's help", () => {
    //  A chrome decision, not an identity claim (see tabChrome.ts): the two
    //  tabs were split BECAUSE they are different things.
    expect(tabKindFor({ hasCase: false, activeWorkspace: "compounds" })).toBe("explore");
  });

  it("still yields to an open case, like every other workspace", () => {
    expect(tabKindFor({ hasCase: true, activeWorkspace: "compounds" })).toBe("case");
  });
});
