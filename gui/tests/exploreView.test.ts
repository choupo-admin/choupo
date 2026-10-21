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
  ONE Explore: two VIEWS of one set, one door (2026-10-21, DEV.md 4c C116).

  Vítor, 2026-10-20: "temos o 'explore' e o 'Property Surfaces' que acho que
  fazem a mesma coisa e so se cria confusao por se ter dois".  The 2026-09-03
  split had made the catalogue and the plots two tabs, labelled against their
  internal keys (label "Explore" = key `compounds`, label "Property surfaces"
  = key `explore`), mounting the same browser, inspector and estimate form
  twice.  They are two views of one tab now.

  What is pinned here, because a promise in a header cannot be checked:
    - ONE door on the hub, labelled "Explore", keyed `explore`;
    - the anti-wizard property survives the merge: the SURFACES open with no
      set (`view=surfaces`, and the retired `?workspace=properties` lands
      there), so the catalogue is a door and never step one;
    - the retired key is gone from the chrome table;
    - the three shared components are mounted by ONE screen (source arm);
    - F1 on the catalogue view lands on a real Explorer Guide section.
  (Successor of compoundsTab.test.ts, which pinned the two-door shape.)
\*---------------------------------------------------------------------------*/

import { readFileSync, existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveWorkspaceSearch } from "../src/state/workspaceUrl.js";
import { tabKindFor } from "../src/ui/tabChrome.js";
import {
  EXPLORER_GUIDE_CATALOGUE, componentsInSearch, exploreLink, exploreViewInSearch,
} from "../src/ui/explore/selectionLink.js";
import { MODE_TABS } from "../src/ui/workspaces.js";

describe("one door on the hub", () => {
  it("lists Explore once, and no 'Property surfaces' door beside it", () => {
    const labels = MODE_TABS.map((m) => m.label);
    expect(labels.filter((l) => l === "Explore")).toHaveLength(1);
    expect(labels).not.toContain("Property surfaces");
    expect(MODE_TABS[0]!.label).toBe("Explore");
  });

  it("the label and the key agree: the Explore door opens the `explore` key", () => {
    const door = MODE_TABS.find((m) => m.label === "Explore")!;
    expect(door.search).toBe("?workspace=explore");
    expect(resolveWorkspaceSearch(door.search)).toEqual({ key: "explore", canonical: null });
  });
});

describe("the surfaces are a door, not step two", () => {
  it("open with NO set, by their own address and by the retired one", () => {
    //  THE ANTI-WIZARD PROPERTY, structural rather than promised: if the
    //  surfaces could only be reached with a set chosen in the catalogue, the
    //  pair would be STEP 1 / STEP 2 -- the setup wizard gui-credo §5 forbids.
    const own = exploreLink([], "surfaces");
    expect(componentsInSearch(own)).toEqual([]);
    expect(exploreViewInSearch(own)).toBe("surfaces");
    const redirected = resolveWorkspaceSearch("?workspace=properties").canonical!;
    expect(exploreViewInSearch(redirected)).toBe("surfaces");
  });

  it("an address naming no view and no set opens the catalogue (where a "
     + "student who does not yet know what to plot starts)", () => {
    expect(exploreViewInSearch("?workspace=explore")).toBe("catalogue");
  });
});

describe("the chrome", () => {
  it("Explore wears the explore chrome, and yields to an open case", () => {
    expect(tabKindFor({ hasCase: false, activeWorkspace: "explore" })).toBe("explore");
    expect(tabKindFor({ hasCase: true, activeWorkspace: "explore" })).toBe("case");
  });
});

describe("one screen mounts the browser, the inspector and the estimate form", () => {
  //  The two tabs mounted all three twice.  The catalogue's own screen is
  //  deleted; anything that re-creates it re-creates the second home.
  const code = (f: string): string =>
    readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("CompoundCatalogue.tsx is gone and nothing imports it", () => {
    expect(existsSync("src/ui/CompoundCatalogue.tsx")).toBe(false);
    expect(code("src/ui/AppShell.tsx")).not.toContain("CompoundCatalogue");
  });

  it("CompoundBrowser and EstimateForm are mounted by ExploreWorkspace alone", () => {
    for (const f of ["src/ui/AppShell.tsx", "src/ui/explore/ComponentTab.tsx",
                     "src/ui/explore/EvidenceLens.tsx"]) {
      expect(code(f), f).not.toMatch(/<CompoundBrowser\b|<EstimateForm\b/);
    }
    expect(code("src/ui/ExploreWorkspace.tsx")).toMatch(/<CompoundBrowser\b/);
    expect(code("src/ui/ExploreWorkspace.tsx")).toMatch(/<EstimateForm\b/);
  });

  it("inside ExploreWorkspace the ComponentInspector has ONE mount site "
     + "(InspectorPanel), wide in the catalogue, beside the plot in the surfaces", () => {
    const ew = code("src/ui/ExploreWorkspace.tsx");
    expect(ew.match(/<ComponentInspector\b/g) ?? []).toHaveLength(1);
    //  the `wide` form is the catalogue's (the JSX carries an arrow function
    //  in onClose, so the match runs on the tag's own span, not up to `>`)
    expect(ew).toMatch(/<InspectorPanel[\s\S]{0,200}?\bwide\s*\/>/);
  });

  it("the screen writes the view and the set into the address", () => {
    const ew = code("src/ui/ExploreWorkspace.tsx");
    expect(ew).toContain('url.searchParams.set("view", view)');
    expect(ew).toContain('url.searchParams.set("components"');
    expect(ew).toContain('url.searchParams.set("workspace", "explore")');
  });
});

describe("F1 on the catalogue view lands on its own guide section", () => {
  it("EXPLORER_GUIDE_CATALOGUE is a \\label of docs/explorerGuide.tex", () => {
    const tex = readFileSync(new URL("../../docs/explorerGuide.tex", import.meta.url), "utf-8");
    expect(tex).toContain(`\\label{${EXPLORER_GUIDE_CATALOGUE}}`);
  });
});
