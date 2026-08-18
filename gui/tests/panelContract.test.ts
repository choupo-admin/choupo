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
  panelContract — the docked-panel contract every left rail and the bottom
  window obey (ui/panelContract.tsx).  Pure decisions only: the project ships
  no jsdom, so what is pinned here is what is decidable without a layout
  engine.

  WHAT IS NOT HERE, deliberately.  The STORAGE posture (junk / absence /
  blocked storage / clamping) belongs to `state/prefs.ts` and is pinned with
  it; re-testing it through this module would be a second home for the
  question.  And the HIT TARGET cannot be pinned here at all — a pointer
  target is a fact about layout, so it is measured in Chromium and reported
  with the change.  Only the constants it is built from are asserted below.

  The first block is the owner's complaint in test form: "algumas não têm".
  Every panel the contract covers must declare BOTH a size key and a fold key,
  so a panel that adopts the contract and quietly keeps neither fails here.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import {
  BOTTOM_DOCK_PANEL, CASE_FILES_PANEL, CONTROL_RAIL_PANEL, EXPLORE_SET_PANEL,
  HANDLE_HIT_PX, HANDLE_KEY_STEP_PX, HANDLE_SEAM_PX, LOG_JUMP_PANEL,
  METHOD_KNOBS_PANEL, PLOTS_NAV_PANEL, STREAMS_NAV_PANEL, panelBoxStyle,
  autoCollapseDefault, collapseTooltip, expandTooltip, nudgeSize, shortcutHint,
  swallowsShortcut,
  type PanelChrome,
} from "../src/ui/panelContract.js";

const ALL: [string, PanelChrome][] = [
  ["explore SET rail", EXPLORE_SET_PANEL],
  ["control tuning rail", CONTROL_RAIL_PANEL],
  ["log jump list", LOG_JUMP_PANEL],
  ["plots navigator", PLOTS_NAV_PANEL],
  ["streams navigator", STREAMS_NAV_PANEL],
  ["case file list", CASE_FILES_PANEL],
  // The EduTools setup panel joined the contract on 2026-08-18, when the
  // twelve tools' horizontal knob strips became one docked left panel.  It is
  // in this table for the same reason the other six are: the table IS the
  // "every panel answers all three questions" claim, and a panel outside it is
  // a panel nobody checked.
  ["EduTools setup panel", METHOD_KNOBS_PANEL],
  ["bottom dock", BOTTOM_DOCK_PANEL],
];

describe("every panel answers all three questions — the owner's 'algumas não têm'", () => {
  for (const [name, p] of ALL) {
    it(`${name}: has a size, a fold, and a home for both`, () => {
      expect(p.prefs.sizeKey, `${name} has no persisted size`).toBeTruthy();
      expect(p.prefs.collapsedKey, `${name} has no persisted fold`).toBeTruthy();
      expect(p.prefs.size.min).toBeGreaterThan(0);
      expect(p.prefs.size.max).toBeGreaterThan(p.prefs.size.min);
      expect(p.prefs.size.default).toBeGreaterThanOrEqual(p.prefs.size.min);
      expect(p.prefs.size.default).toBeLessThanOrEqual(p.prefs.size.max);
    });
  }

  it("no two panels share a storage key", () => {
    const keys = ALL.flatMap(([, p]) => [p.prefs.sizeKey, p.prefs.collapsedKey]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the bottom window does not share the left rails' shortcut", () => {
    // It is the one panel mounted ALONGSIDE a rail, so one key would fold two.
    const railKeys = ALL.filter(([, p]) => p.edge === "left").map(([, p]) => p.shortcut);
    expect(new Set(railKeys)).toEqual(new Set(["["]));
    expect(BOTTOM_DOCK_PANEL.shortcut).not.toBe("[");
  });
});

describe("rule 3 — the collapse DEFAULT is measured, never a breakpoint", () => {
  it("collapses when the rail's minimum and its content's minimum do not fit", () => {
    const need = EXPLORE_SET_PANEL.prefs.size.min + EXPLORE_SET_PANEL.contentMin;
    expect(autoCollapseDefault(EXPLORE_SET_PANEL, 390)).toBe(true);       // a phone
    expect(autoCollapseDefault(EXPLORE_SET_PANEL, need - 1)).toBe(true);  // one px short is short
    expect(autoCollapseDefault(EXPLORE_SET_PANEL, need)).toBe(false);     // exactly enough fits
    expect(autoCollapseDefault(EXPLORE_SET_PANEL, 1400)).toBe(false);     // the desk
  });

  it("an UNMEASURED host is not a failure to fit (fitsRow's own rule)", () => {
    // Before the first layout pass, and in this runner, a measurement reads 0.
    // Answering "does not fit" there would collapse every rail on its first
    // frame — the uncollapsed shape is the honest answer until measured.
    expect(autoCollapseDefault(EXPLORE_SET_PANEL, 0)).toBe(false);
    expect(autoCollapseDefault(EXPLORE_SET_PANEL, NaN)).toBe(false);
  });

  it("the EduTools setup panel starts folded on a phone and open on the desk", () => {
    // The measured default that keeps a 390 px screen usable: 240 (the panel's
    // own minimum) + 360 (what a construction needs to be worth drawing) is
    // 600, which 390 cannot give.  Nothing here reads a breakpoint or a
    // pointer — the same two widths decide at every size.
    const need = METHOD_KNOBS_PANEL.prefs.size.min + METHOD_KNOBS_PANEL.contentMin;
    expect(need).toBe(600);
    expect(autoCollapseDefault(METHOD_KNOBS_PANEL, 390)).toBe(true);
    expect(autoCollapseDefault(METHOD_KNOBS_PANEL, 599)).toBe(true);
    expect(autoCollapseDefault(METHOD_KNOBS_PANEL, 600)).toBe(false);
    expect(autoCollapseDefault(METHOD_KNOBS_PANEL, 1368)).toBe(false);
  });

  it("a panel that declares no content minimum never auto-collapses", () => {
    // The bottom window takes height, not width, from a surface that has no
    // stated minimum of its own — so it folds only when the reader says so.
    expect(BOTTOM_DOCK_PANEL.contentMin).toBe(0);
    expect(autoCollapseDefault(BOTTOM_DOCK_PANEL, 100)).toBe(false);
  });
});

describe("keyboard resize — a splitter only a pointer can move is half a control", () => {
  it("moves a LEFT panel on the x keys, by one step, clamped", () => {
    const s = EXPLORE_SET_PANEL.prefs.size;
    expect(nudgeSize(EXPLORE_SET_PANEL, s.default, "ArrowRight")).toBe(s.default + HANDLE_KEY_STEP_PX);
    expect(nudgeSize(EXPLORE_SET_PANEL, s.default, "ArrowLeft")).toBe(s.default - HANDLE_KEY_STEP_PX);
    expect(nudgeSize(EXPLORE_SET_PANEL, s.max - 1, "ArrowRight")).toBe(s.max);
    expect(nudgeSize(EXPLORE_SET_PANEL, s.min + 1, "ArrowLeft")).toBe(s.min);
  });

  it("moves a BOTTOM panel on the y keys, and UP means bigger", () => {
    const s = BOTTOM_DOCK_PANEL.prefs.size;
    expect(nudgeSize(BOTTOM_DOCK_PANEL, s.default, "ArrowUp")).toBe(s.default + HANDLE_KEY_STEP_PX);
    expect(nudgeSize(BOTTOM_DOCK_PANEL, s.default, "ArrowDown")).toBe(s.default - HANDLE_KEY_STEP_PX);
  });

  it("leaves the other axis's keys alone", () => {
    expect(nudgeSize(BOTTOM_DOCK_PANEL, 360, "ArrowLeft")).toBeNull();
    expect(nudgeSize(EXPLORE_SET_PANEL, 240, "ArrowUp")).toBeNull();
  });

  it("Home / End snap to the limits; anything else is not claimed", () => {
    const s = EXPLORE_SET_PANEL.prefs.size;
    expect(nudgeSize(EXPLORE_SET_PANEL, 300, "Home")).toBe(s.min);
    expect(nudgeSize(EXPLORE_SET_PANEL, 300, "End")).toBe(s.max);
    expect(nudgeSize(EXPLORE_SET_PANEL, 300, "a")).toBeNull();
    expect(nudgeSize(EXPLORE_SET_PANEL, 300, "Escape")).toBeNull();
  });
});

describe("rule 2 — a tooltip cannot advertise a key nothing binds", () => {
  it("names the shortcut from the one field that also binds it", () => {
    expect(shortcutHint(EXPLORE_SET_PANEL)).toContain("[");
    expect(collapseTooltip(EXPLORE_SET_PANEL)).toBe("Hide the component browser (shortcut: [ )");
    expect(expandTooltip(EXPLORE_SET_PANEL)).toBe("Show the component browser (shortcut: [ )");
  });

  it("says nothing about a shortcut a panel does not declare", () => {
    // This is the Control Room defect in test form, from the other side: its
    // rail's two tooltips read "( [ )" while nothing anywhere bound `[` for
    // it.  Wording that is derived cannot drift from binding that is derived.
    const silent: PanelChrome = { ...EXPLORE_SET_PANEL, shortcut: undefined };
    expect(shortcutHint(silent)).toBe("");
    expect(collapseTooltip(silent)).toBe("Hide the component browser");
  });

  it("every panel that declares a shortcut declares exactly one character", () => {
    for (const [name, p] of ALL) {
      if (!p.shortcut) continue;
      expect(p.shortcut.length, `${name} declares a multi-key shortcut`).toBe(1);
    }
  });
});

describe("the shortcut guard asks whether the key is a CHARACTER being typed", () => {
  it("stands aside for text entry", () => {
    expect(swallowsShortcut({ tagName: "TEXTAREA" })).toBe(true);
    expect(swallowsShortcut({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(swallowsShortcut({ tagName: "INPUT", type: "search" })).toBe(true);
    expect(swallowsShortcut({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(swallowsShortcut({ tagName: "DIV", isContentEditable: true })).toBe(true);
    // an INPUT with no declared type IS a text field, by HTML's own default
    expect(swallowsShortcut({ tagName: "INPUT" })).toBe(true);
  });

  it("does NOT stand aside for an input that takes no characters", () => {
    // THE MEASURED DEFECT.  The rule inherited from ExploreWorkspace was
    // `tagName === "INPUT"`, and Mantine's SegmentedControl is a group of
    // radios — so after clicking "Detail" in the Streams workspace the focused
    // element was a radio and `[` did nothing.  Measured in Chromium
    // 2026-08-18 on the run built to prove the shortcut worked there: the rail
    // stayed at 240 px and no strip appeared.
    expect(swallowsShortcut({ tagName: "INPUT", type: "radio" })).toBe(false);
    expect(swallowsShortcut({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(swallowsShortcut({ tagName: "INPUT", type: "range" })).toBe(false);
    expect(swallowsShortcut({ tagName: "BUTTON" })).toBe(false);
    expect(swallowsShortcut({ tagName: "DIV" })).toBe(false);
    expect(swallowsShortcut(null)).toBe(false);
  });
});

describe("handle geometry — the constants the measured hit target is built from", () => {
  it("gives the seam a grab band several times its own width", () => {
    // Measured in Chromium BEFORE this contract (elementFromPoint scanned at
    // 1 px across each handle): the Explorer rail's splitter was a 6 px box
    // with 3 px hittable, and the assistant console's was 6 px with 3 px
    // hittable — in both cases the outer half was clipped by an ancestor's
    // `overflow: hidden`.  The band is now the whole target.
    expect(HANDLE_HIT_PX).toBeGreaterThanOrEqual(10);
    expect(HANDLE_SEAM_PX).toBeLessThan(HANDLE_HIT_PX);
    // odd total, so the band straddles the seam symmetrically
    expect((HANDLE_HIT_PX - HANDLE_SEAM_PX) % 2).toBe(0);
  });
});

describe("a FOLDED panel is hidden, not merely clipped", () => {
  /* THE DEFECT THIS PINS, measured 2026-08-18 by bin/checkGui at 390x844 while
   * the EduTools setup panel was being adopted into this contract: 94 COVERED
   * controls and 196 clipped, against a baseline of 0 and 6.  Every one was a
   * knob inside a FOLDED panel.
   *
   * Width 0 with `overflow: hidden` clips the PAINT and nothing else: the
   * children keep real boxes, keep their place in the tab order, and keep
   * answering elementFromPoint — as something underneath whatever is drawn
   * over them.  `visibility: hidden` is what a fold actually means, and it is
   * the one line that made the phone numbers come back. */
  const handle = (collapsed: boolean) => ({
    chrome: EXPLORE_SET_PANEL,
    size: 240, collapsed,
    toggle: () => {}, expand: () => {}, reset: () => {},
    onPointerDown: () => {}, onKeyDown: () => {},
  });

  it("folded: zero on its own axis AND out of the hit test", () => {
    const st = panelBoxStyle(handle(true) as never, false);
    expect(st.width).toBe(0);
    expect(st.visibility).toBe("hidden");
    expect(st.overflow).toBe("hidden");
  });

  it("open: its declared size, and visible", () => {
    const st = panelBoxStyle(handle(false) as never, false);
    expect(st.width).toBe(240);
    expect(st.visibility).toBe("visible");
  });

  it("holds for a BOTTOM panel too — the rule is the fold's, not the edge's", () => {
    const dock = { ...handle(true), chrome: BOTTOM_DOCK_PANEL };
    const st = panelBoxStyle(dock as never, false);
    expect(st.height).toBe(0);
    expect(st.visibility).toBe("hidden");
  });
});
