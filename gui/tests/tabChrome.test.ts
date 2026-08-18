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
  tabChrome — the chrome belongs to what the tab IS.

  Vítor, opening an EduTools tab on 2026-08-18: "Porque raio há File no menu se
  isto é uma tool?  Não podes gravar: é só para usar e aprender.  Depois volta
  a aparecer o help genérico, quando só devia aparecer um help ou F1 a remeter
  para a teoria deste tool!"  Both halves of that are pinned here.

  WHY THE HELP HALF IS TESTABLE AND WORTH TESTING.  The old resolution went
  through `docs/help-index.json`, whose `workspaces` map has no `methods`
  entry — so all twelve tools fell through to DEFAULT_HELP and every one of
  them opened the User Guide at `sec:gui`.  Nothing failed: a wrong help
  destination is a page that opens, which is exactly the silent shape
  tests/methodTheoryAnchors.test.ts was written for one level down.  So this
  asserts the DESTINATION, per tool, against the tool's own declaration.

  Deliberately NOT pinned here: that MenuBar renders one menu and not the
  other, or that F1 reaches the browser.  Those need a DOM and a window.open;
  asserting them from a stub would pin the stub.  The rendering is walked at
  two real viewports by `bin/checkGui`, whose per-page control counts drop by
  exactly one on each of the twelve tool pages when File leaves.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import {
  TAB_CHROME, tabChromeFor, tabHelp, tabKindFor, selectedUnitTypeIn,
  type TabKind,
} from "../src/ui/tabChrome.js";
import { METHOD_TOOLS, theoryUrl } from "../src/ui/methods/registry.js";
import { guideUrl } from "../src/help/guideLinks.js";
import { helpUrl, resolveHelp } from "../src/help/helpMap.js";

const HUB = { hasCase: false, activeWorkspace: null };
const CASE = { hasCase: true, activeWorkspace: null };
const EXPLORE = { hasCase: false, activeWorkspace: "explore" };
const TOOL = { hasCase: false, activeWorkspace: "methods" };

describe("what a tab IS", () => {
  it("names the four kinds of one-tab-one-thing.md §1", () => {
    expect(tabKindFor(HUB)).toBe("hub");
    expect(tabKindFor(CASE)).toBe("case");
    expect(tabKindFor(EXPLORE)).toBe("explore");
    expect(tabKindFor(TOOL)).toBe("tool");
  });

  it("a case tab showing a tool in its body is still a CASE tab", () => {
    // `?case=<c>&workspace=methods` is a live address -- bin/checkGui's own
    // `shell+case` page uses it.  That tab has a case loaded and its views in
    // the row, so stripping its File menu would have the chrome announce
    // "there is no case" over a case.
    expect(tabKindFor({ hasCase: true, activeWorkspace: "methods" })).toBe("case");
    expect(tabKindFor({ hasCase: true, activeWorkspace: "explore" })).toBe("case");
  });

  it("a case tab on any of its own views stays a case tab", () => {
    for (const w of ["streams", "plots", "log", "case", "pinch", "reports"]) {
      expect(tabKindFor({ hasCase: true, activeWorkspace: w })).toBe("case");
    }
  });
});

describe("File leaves the tool tab", () => {
  it("THE INSTRUCTION: a tool tab's chrome says nothing about a case", () => {
    // One flag, three surfaces: MenuBar's File menu, the shortcuts it binds
    // (Ctrl+O / Ctrl+R / Ctrl+Shift+N) and advertises, and TopBar's case
    // identity slot ("No case open").
    expect(tabChromeFor(TOOL).caseChrome).toBe(false);
  });

  it("the hub KEEPS it -- that is where a case is opened from", () => {
    // "No case open" beside "File -> Open Case…" is an honest pair; the tool
    // tab's version of it reports the absence of something that is not that
    // tab's business.
    expect(tabChromeFor(HUB).caseChrome).toBe(true);
    expect(tabChromeFor(CASE).caseChrome).toBe(true);
  });

  it("Explore carries no case chrome either -- it is a mode with no case", () => {
    // The pin that stood here said Explore was the status quo "until the
    // owner answers".  He answered by pointing out that the question was the
    // architect's to settle: File is dead in Explore for exactly the reason
    // it is dead in a tool tab, and "a student might want to open a case
    // from here" answers itself -- under one-tab-one-thing you go back to
    // the HUB to open a case.
    expect(tabChromeFor(EXPLORE).caseChrome).toBe(false);
    // Its HELP is a different question and keeps a different answer: Explore
    // owns its F1 and resolves the ACTIVE PLOT's chapter, which no table
    // entry could name.  Two questions, two answers, one table.
    expect(tabChromeFor(EXPLORE).help).toBe("context");
  });

  it("every kind is in the table, and the table is the only home", () => {
    const kinds: TabKind[] = ["hub", "case", "explore", "tool"];
    for (const k of kinds) expect(TAB_CHROME[k]).toBeDefined();
    expect(Object.keys(TAB_CHROME).sort()).toEqual([...kinds].sort());
  });
});

describe("Help in a tool tab goes to THAT tool's theory", () => {
  it("every live tool resolves to its OWN named destination", () => {
    for (const t of METHOD_TOOLS.filter((m) => m.status === "live")) {
      expect(t.theory, `${t.id} declares no theory anchor`).toBeTruthy();
      const help = tabHelp({ kind: "tool", toolId: t.id, activeWorkspace: "methods" });
      expect(help.url).toContain(`nameddest=${encodeURIComponent(t.theory!)}`);
      expect(help.url).toContain("g=theoryGuide");
      // The item NAMES the tool, so a reader can see which room the door
      // opens before opening it.
      expect(help.item).toContain(t.label);
    }
  });

  it("THE NEGATIVE: it is no longer the generic guide front", () => {
    // What every tool used to get: docs/help-index.json has no `methods`
    // entry, so resolveHelp fell through to DEFAULT_HELP -- the User Guide at
    // sec:gui -- for all twelve.
    const generic = helpUrl(resolveHelp({ activeWorkspace: "methods" }));
    expect(generic).toContain("g=userGuide");
    for (const t of METHOD_TOOLS.filter((m) => m.status === "live")) {
      expect(tabHelp({ kind: "tool", toolId: t.id, activeWorkspace: "methods" }).url)
        .not.toBe(generic);
    }
  });

  it("ONE HOME FOR THE URL: it is guideLinks', not a seventh builder", () => {
    // help/guideLinks.ts exists because there were SIX homes for this string.
    // tabHelp must add none: its answer has to be exactly what the registry's
    // theoryUrl -- itself a guideUrl call -- produces.
    const t = METHOD_TOOLS.find((m) => m.id === "kremser")!;
    const url = tabHelp({ kind: "tool", toolId: t.id }).url;
    expect(url).toBe(theoryUrl(t.theory!));
    expect(url).toBe(guideUrl("theoryGuide", t.theory!));
  });

  it("a case tab ignores the open tool and resolves its own context", () => {
    // The tool selection is module state that outlives a tab's kind; a case
    // tab must not inherit it.
    const inCase = tabHelp({
      kind: "case", toolId: "kremser",
      selectedUnitType: "flash", activeWorkspace: null,
    });
    expect(inCase.url).toBe(helpUrl(resolveHelp({ selectedUnitType: "flash" })));
    expect(inCase.item).toBe("Help on current view");
  });

  it("refuses to CLAIM a tool's theory it cannot reach", () => {
    // An unknown id must not produce an item reading "Theory: …" over the
    // guide's front page -- that is the same lie in a different sentence.
    const help = tabHelp({ kind: "tool", toolId: null, activeWorkspace: "methods" });
    expect(help.item).toBe("Help on current view");
    expect(help.url).toBe(helpUrl(resolveHelp({ activeWorkspace: "methods" })));
  });
});

describe("selectedUnitTypeIn", () => {
  const flowsheet = { units: [{ name: "F1", type: "flash" }, { name: "M1", type: "mixer" }] };

  it("reads the selected unit's type, and nothing else's", () => {
    expect(selectedUnitTypeIn("unit:F1", flowsheet)).toBe("flash");
    expect(selectedUnitTypeIn("unit:M1", flowsheet)).toBe("mixer");
  });

  it("answers null where there is nothing to read", () => {
    expect(selectedUnitTypeIn(null, flowsheet)).toBeNull();
    expect(selectedUnitTypeIn("stream:S1", flowsheet)).toBeNull();
    expect(selectedUnitTypeIn("unit:nope", flowsheet)).toBeNull();
    expect(selectedUnitTypeIn("unit:F1", undefined)).toBeNull();
  });
});
