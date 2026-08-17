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

  What these pin, in order of what they would catch:

  1. THE FALSIFIER the design record names (§6).  A mode is defined by
     surviving a blank boot, so `allowedWorkspaceLabels` with no case must
     return EXACTLY the modes -- no more (a view leaking into a caseless app)
     and no fewer (a mode that turned out to need a case).  The day someone
     marks a case-dependent workspace `mode`, this fails instead of the split
     quietly becoming a lie.

  2. ONE HOME.  Every case type's set is built from MODE_LABELS, so the modes
     must appear in every non-empty set.  Before 2026-08-17 that was four
     hand-written sets each naming Explore and EduTools, and the blank-boot
     set was a fifth copy.

  3. NO LOSS AND NO REORDER.  modes + views is the whole lineup, each half in
     declared order -- the wide row and the narrow chooser are two renderings
     of ONE array, and a workspace that fell out of both would be
     unreachable.

  Deliberately NOT pinned here: whether the row FITS, whether the chooser is
  labelled `Views: Case`, and whether anything is reachable at 390 px.  Those
  are pixels, and this runner has none -- `bin/checkGui` is where they are
  measured.  A test that asserted them from jsdom would report a fit that no
  layout engine had computed.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import {
  WORKSPACES, MODE_LABELS, splitWorkspaces, allowedWorkspaceLabels,
  visibleWorkspacesFor, type WorkspaceContext,
} from "../src/ui/workspaces.js";

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

describe("the mode/view split", () => {
  it("marks exactly the two case-free workspaces as modes", () => {
    const { modes } = splitWorkspaces(WORKSPACES);
    expect(modes.map((w) => w.label)).toEqual(["Explore", "EduTools"]);
    expect([...MODE_LABELS].sort()).toEqual(["EduTools", "Explore"]);
  });

  it("loses nothing and reorders nothing: modes + views is the lineup", () => {
    const { modes, views } = splitWorkspaces(WORKSPACES);
    expect(modes.length + views.length).toBe(WORKSPACES.length);
    // each half in declared order
    const order = WORKSPACES.map((w) => w.label);
    for (const half of [modes, views]) {
      const idx = half.map((w) => order.indexOf(w.label));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
    // and every entry lands in exactly one half
    expect([...modes, ...views].map((w) => w.label).sort())
      .toEqual([...order].sort());
  });

  it("gives every view a deep-link key, except the canvas itself", () => {
    // Flowsheet IS activeWorkspace === null; every other entry must carry the
    // ?workspace= key the deep-link contract is written in.
    for (const w of WORKSPACES) {
      if (w.label === "Flowsheet") expect(w.key).toBeNull();
      else expect(typeof w.key).toBe("string");
    }
  });
});

describe("allowedWorkspaceLabels", () => {
  it("THE FALSIFIER: a blank boot offers exactly the modes", () => {
    expect([...allowedWorkspaceLabels(BLANK)].sort()).toEqual([...MODE_LABELS].sort());
  });

  it("puts the modes in every non-empty set", () => {
    for (const ctx of [SOLVE, PROPS, CTRL_PID, CTRL_NO_PID]) {
      for (const m of MODE_LABELS) {
        expect(allowedWorkspaceLabels(ctx).has(m)).toBe(true);
      }
    }
  });

  it("shows no workspace at all on a tutorial's intro screen", () => {
    expect(allowedWorkspaceLabels(INTRO).size).toBe(0);
    expect(visibleWorkspacesFor(INTRO)).toEqual([]);
  });

  it("keeps each case type's own view set", () => {
    // steady: the full set
    expect(visibleWorkspacesFor(SOLVE).map((w) => w.label)).toEqual([
      "Flowsheet", "Props", "Explore", "EduTools", "Streams", "Variables",
      "Plots", "Log", "Case", "Pinch", "Reports",
    ]);
    // props-only: no canvas, no streams, no duties
    expect(visibleWorkspacesFor(PROPS).map((w) => w.label)).toEqual([
      "Props", "Explore", "EduTools", "Plots", "Log", "Case",
    ]);
    // time-dependent: no steady-only views; Control only with a declared PID
    expect(visibleWorkspacesFor(CTRL_PID).map((w) => w.label)).toEqual([
      "Flowsheet", "Props", "Explore", "EduTools", "Control", "Plots", "Log", "Case",
    ]);
    expect(visibleWorkspacesFor(CTRL_NO_PID).map((w) => w.label))
      .not.toContain("Control");
  });
});

describe("what each posture renders", () => {
  it("narrow: the chooser holds the views, the modes stay out of it", () => {
    // The narrow row is [Views chooser] + the modes.  A mode inside the
    // chooser is the exact defect of 2026-08-17: Explore, one of only two
    // things a caseless visitor can do, filed under a menu named for a view.
    const { modes, views } = splitWorkspaces(visibleWorkspacesFor(SOLVE));
    expect(views.map((w) => w.label)).not.toContain("Explore");
    expect(views.map((w) => w.label)).not.toContain("EduTools");
    expect(modes.map((w) => w.label)).toEqual(["Explore", "EduTools"]);
    expect(views.length).toBe(9);   // steady: 11 visible - 2 modes
  });

  it("blank boot: nothing for the chooser to hold, so it does not render", () => {
    // MenuBar renders ViewsMenu only when there ARE views; with no case there
    // are none, and a chooser reading "Views: none" over an empty list would
    // be a control that answers nothing.
    const { views } = splitWorkspaces(visibleWorkspacesFor(BLANK));
    expect(views).toEqual([]);
  });
});
