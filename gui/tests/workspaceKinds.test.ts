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
  workspaceKinds — the mode/view split, pinned where it is decidable.

  The split is a pure function of the workspace lineup, so it needs no
  browser: the posture question ("does the row fit?") belongs to checkGui, and
  the MEANING question ("is this a mode or a view?") belongs here.

  WHAT THESE TESTS NOW PIN, AND WHY THEY CHANGED (2026-08-17,
  docs/design/one-tab-one-thing.md, DECIDED by Vítor: "E no flowsheet eu não
  quero no menu EduTools nem Explore!").

  Until today the split was drawn INSIDE the row: `kind: "mode"` on Explore
  and EduTools kept them visible while the views collapsed into a chooser, and
  these tests pinned exactly that — "a blank boot offers exactly the modes",
  "the modes are in every non-empty set", and a steady case's lineup naming
  Explore and EduTools between Props and Streams.  Every one of those
  assertions is now FALSE, and it is false because the contract moved, not
  because the code drifted away from it.  The distinction survives; it is
  STRUCTURAL now (record §2: "a mode is a tab, a view is a menu item"), so the
  row carries one side of it and none of the other.

  These are therefore re-pointed rather than deleted.  What they assert:

  1. THE INVARIANT THAT REPLACES THE FALSIFIER.  A mode in WORKSPACES is the
     defect now, so the day someone puts Explore or EduTools back into a case
     tab's menu, this fails.  That is the owner's instruction, expressed as a
     test rather than as a comment nobody runs.

  2. THE MODES DID NOT VANISH — they moved list.  MODE_TABS names both, each
     with the address that IS it (record §1).  A mode dropped from the row and
     not added there would be unreachable, which is a worse outcome than the
     duplicate the decision removed.

  3. ONE HOME FOR THE ADDRESSES.  MODE_TABS' searches must be the addresses
     ui/openInTab.ts builds — two spellings of one contract is how a deep link
     in a student's notes stops working.

  4. NO LOSS AND NO REORDER in the lineup that remains, and every view still
     carrying the `?workspace=` key the deep-link contract is written in.

  Deliberately NOT pinned here: whether the row FITS, whether the chooser is
  labelled `Views: Case`, and whether anything is reachable at 390 px.  Those
  are pixels, and this runner has none -- `bin/checkGui` is where they are
  measured.  A test that asserted them from jsdom would report a fit that no
  layout engine had computed.

  Also NOT pinned: that the hub RENDERS a button per MODE_TABS entry, or that
  a click opens a tab.  Those need a DOM and a window.open, and asserting them
  from a stub would pin the stub.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import {
  WORKSPACES, VIEW_LABELS, MODE_TABS, allowedWorkspaceLabels,
  visibleWorkspacesFor, type WorkspaceContext,
} from "../src/ui/workspaces.js";
import { exploreTabSearch, toolsTabSearch, caseTabSearch } from "../src/ui/openInTab.js";

const BLANK: WorkspaceContext = {
  hasCase: false, showIntro: false, isPropsCase: false, hasPid: false,
};
const SOLVE: WorkspaceContext = {
  hasCase: true, showIntro: false, isPropsCase: false,
  application: "choupoSolve", hasPid: false,
};
const PROPS: WorkspaceContext = {
  hasCase: true, showIntro: false, isPropsCase: true, hasPid: false,
};
const CTRL_PID: WorkspaceContext = {
  hasCase: true, showIntro: false, isPropsCase: false,
  application: "choupoCtrl", hasPid: true,
};
const CTRL_NO_PID: WorkspaceContext = { ...CTRL_PID, hasPid: false };
const INTRO: WorkspaceContext = { ...SOLVE, showIntro: true };

/** The two modes, by the name a reader of the decision would use. */
const MODE_NAMES = ["Explore", "EduTools"];

describe("a case tab's menu carries views and nothing else", () => {
  it("THE INVARIANT: no mode is in the row, in ANY context", () => {
    // The owner's instruction, as a test.  Checked against the declared
    // lineup AND against every context that renders it, because a mode could
    // be reintroduced either in WORKSPACES or in allowedWorkspaceLabels.
    for (const m of MODE_NAMES) {
      expect(VIEW_LABELS.has(m)).toBe(false);
      expect(WORKSPACES.map((w) => w.label)).not.toContain(m);
      for (const ctx of [BLANK, SOLVE, PROPS, CTRL_PID, CTRL_NO_PID, INTRO]) {
        expect(allowedWorkspaceLabels(ctx).has(m)).toBe(false);
        expect(visibleWorkspacesFor(ctx).map((w) => w.label)).not.toContain(m);
      }
    }
  });

  it("gives every view a deep-link key, except the canvas itself", () => {
    // Flowsheet IS activeWorkspace === null; every other entry must carry the
    // ?workspace= key the deep-link contract is written in.
    for (const w of WORKSPACES) {
      if (w.label === "Flowsheet") expect(w.key).toBeNull();
      else expect(typeof w.key).toBe("string");
    }
  });

  it("VIEW_LABELS is derived from the lineup, never a second list", () => {
    expect([...VIEW_LABELS].sort()).toEqual(WORKSPACES.map((w) => w.label).sort());
    expect(VIEW_LABELS.size).toBe(WORKSPACES.length);   // no duplicate labels
  });
});

describe("the modes moved list, they did not vanish", () => {
  it("MODE_TABS names both, in the order the hub offers them", () => {
    expect(MODE_TABS.map((m) => m.label)).toEqual(MODE_NAMES);
  });

  it("ONE HOME: each mode's search is the address openInTab builds", () => {
    // Two spellings of one contract is how a deep link in a student's notes
    // stops working.  EduTools keeps the `methods` URL key deliberately -- the
    // caption changed in 2026-08-16, the bookmark did not.
    const byLabel = new Map(MODE_TABS.map((m) => [m.label, m.search]));
    expect(byLabel.get("Explore")).toBe(exploreTabSearch());
    expect(byLabel.get("EduTools")).toBe(toolsTabSearch());
    expect(byLabel.get("EduTools")).toContain("workspace=methods");
  });

  it("every mode states what it is for", () => {
    // The hub shows the blurb as the button's title; an empty one would be a
    // destination with no description of where it goes.
    for (const m of MODE_TABS) expect(m.blurb.length).toBeGreaterThan(20);
  });
});

describe("caseTabSearch", () => {
  it("addresses a case, and encodes a path-shaped tutorial id", () => {
    expect(caseTabSearch("steady/flash/flash01_benzene_toluene"))
      .toBe("?case=steady%2Fflash%2Fflash01_benzene_toluene");
  });

  it("carries the newcomer intro on-ramp only when asked", () => {
    // The hub's start-here cards used to pass { intro: true } as a call
    // argument; a TAB cannot be handed one, so it rides the address.
    expect(caseTabSearch("a/b", { intro: true })).toBe("?case=a%2Fb&intro=1");
    expect(caseTabSearch("a/b")).not.toContain("intro");
    expect(caseTabSearch("a/b", { intro: false })).not.toContain("intro");
  });
});

describe("allowedWorkspaceLabels", () => {
  it("a blank boot offers NOTHING: that tab is the hub", () => {
    // It used to offer exactly the modes.  With the modes in their own tabs
    // there is nothing left for a caseless tab's menu to hold, and the hub's
    // on-ramp is the WelcomeScreen's own.
    expect(allowedWorkspaceLabels(BLANK).size).toBe(0);
    expect(visibleWorkspacesFor(BLANK)).toEqual([]);
  });

  it("shows no workspace at all on a tutorial's intro screen", () => {
    expect(allowedWorkspaceLabels(INTRO).size).toBe(0);
    expect(visibleWorkspacesFor(INTRO)).toEqual([]);
  });

  it("keeps each case type's own view set, in declared order", () => {
    // steady: the full set
    expect(visibleWorkspacesFor(SOLVE).map((w) => w.label)).toEqual([
      "Flowsheet", "Props", "Streams", "Variables",
      "Plots", "Log", "Case", "Pinch", "Reports",
    ]);
    // props-only: no canvas, no streams, no duties
    expect(visibleWorkspacesFor(PROPS).map((w) => w.label)).toEqual([
      "Props", "Plots", "Log", "Case",
    ]);
    // time-dependent: no steady-only views; Control only with a declared PID
    expect(visibleWorkspacesFor(CTRL_PID).map((w) => w.label)).toEqual([
      "Flowsheet", "Props", "Control", "Plots", "Log", "Case",
    ]);
    expect(visibleWorkspacesFor(CTRL_NO_PID).map((w) => w.label))
      .not.toContain("Control");
  });

  it("allows nothing the lineup does not declare", () => {
    for (const ctx of [SOLVE, PROPS, CTRL_PID, CTRL_NO_PID]) {
      for (const label of allowedWorkspaceLabels(ctx)) {
        expect(VIEW_LABELS.has(label)).toBe(true);
      }
    }
  });
});

describe("what the narrow posture renders", () => {
  it("the chooser holds ALL of it, because all of it is views", () => {
    // Before today the narrow row was [Views chooser] + the modes, and the
    // chooser deliberately excluded them.  There is nothing to exclude now.
    const visible = visibleWorkspacesFor(SOLVE);
    expect(visible.length).toBe(9);
    for (const w of visible) expect(VIEW_LABELS.has(w.label)).toBe(true);
  });

  it("blank boot: nothing for the chooser to hold, so it does not render", () => {
    // MenuBar renders ViewsMenu only when there ARE views; with no case there
    // are none, and a chooser reading "Views: none" over an empty list would
    // be a control that answers nothing.
    expect(visibleWorkspacesFor(BLANK)).toEqual([]);
  });
});
