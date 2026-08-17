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
  methodsResponsive — the EduTools workspace's responsive-posture CONTRACT,
  pinned at the level the node runner can reach (the project ships no jsdom,
  so the hooks themselves are exercised in the browser, not here).

  RE-AIMED 2026-08-16.  The sm–md rail autofold and its persisted key went out
  with the tool rail — the chooser is the top bar's EduTools dropdown now, and
  a dropdown has no posture to fold.  What survives, and is pinned here:

  * `sm` is still the ONE narrow breakpoint, and useNarrowViewport /
    useCoarsePointer are still the ONE detection home (the tools read them for
    caption wrapping and touch-target sizing);
  * `fitsRow` is the ONE rule for "does this content fit this space", pinned
    below at its boundaries — 2026-08-17, when `useNarrowViewport` stopped
    being `width < sm || coarse pointer` and the collapse decisions became
    measurements instead;
  * the persistence helpers still never WRITE while only reading — a posture
    default is an answer, not a decision, and the first explicit toggle is what
    writes the key and wins from then on;
  * the rail's exports are GONE rather than left dangling: a constant nobody
    reads is a second home for a decision already taken.
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    size: () => m.size,
  };
}

let ls: ReturnType<typeof makeLocalStorage>;

beforeEach(() => {
  vi.resetModules();
  ls = makeLocalStorage();
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
  (globalThis as Record<string, unknown>).localStorage = ls;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("responsive breakpoints — the named constants", () => {
  it("narrow = Mantine sm (48em)", async () => {
    const { NARROW_BREAKPOINT_EM } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(NARROW_BREAKPOINT_EM).toBe(48);
  });

  it("the posture hooks are exported (the ONE detection home)", async () => {
    const chrome = await import("../src/ui/methods/methodsChrome.js");
    expect(typeof chrome.useNarrowViewport).toBe("function");
    expect(typeof chrome.useCoarsePointer).toBe("function");
  });

  it("the rail autofold is GONE — no breakpoint, no hook, no key", async () => {
    const chrome = await import("../src/ui/methods/methodsChrome.js");
    expect("RAIL_AUTOFOLD_BREAKPOINT_EM" in chrome).toBe(false);
    expect("useRailAutofoldDefault" in chrome).toBe(false);
    expect("RAIL_COLLAPSED_KEY" in chrome).toBe(false);
    expect("REOPEN_STRIP_PX" in chrome).toBe(false);
  });
});

/*---------------------------------------------------------------------------*\
  THE FIT RULE.  Only the PURE rule is pinned here, and deliberately so: what
  a row is actually WIDE is a browser measurement (the ghost in MenuBar, the
  ResizeObserver in AppShell, the media query behind useFitsOneRow), and this
  runner has no layout engine at all — asserting a pixel from here would be
  asserting a number this environment cannot produce.  The measured half is
  checked in the browser, by a CDP probe at real viewports.

  What CAN be wrong without a browser to show it is the rule itself, and the
  boundary cases are exactly where a fit rule goes wrong: the exact fit (which
  must FIT — a row that is precisely as wide as its box is not overflowing),
  and the unmeasured state (which must NOT collapse the row).
\*---------------------------------------------------------------------------*/
describe("fitsRow — the ONE fit rule", () => {
  it("fits when the space is wider than the content", async () => {
    const { fitsRow } = await import("../src/ui/methods/methodsChrome.js");
    expect(fitsRow(833, 1070)).toBe(true);
  });

  it("does NOT fit when the content is wider than the space", async () => {
    const { fitsRow } = await import("../src/ui/methods/methodsChrome.js");
    // The landscape phone, from the real measurement: an 833 px row against
    // the 514 px left over once the top bar keeps its brand and its icons.
    expect(fitsRow(833, 514)).toBe(false);
  });

  it("an EXACT fit fits — the boundary belongs to the wider posture", async () => {
    const { fitsRow } = await import("../src/ui/methods/methodsChrome.js");
    expect(fitsRow(833, 833)).toBe(true);
    expect(fitsRow(833, 832)).toBe(false);
  });

  it("an UNMEASURED width never collapses anything", async () => {
    const { fitsRow } = await import("../src/ui/methods/methodsChrome.js");
    // Before the first layout pass — and in this very runner — a measurement
    // reads 0.  Answering "does not fit" there would collapse a desk row
    // because nothing had been measured yet, which is a guess wearing the
    // clothes of a measurement.
    expect(fitsRow(0, 1400)).toBe(true);
    expect(fitsRow(833, 0)).toBe(true);
    expect(fitsRow(NaN, 1400)).toBe(true);
    expect(fitsRow(833, Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("the rule reads NOTHING but two widths", async () => {
    const { fitsRow } = await import("../src/ui/methods/methodsChrome.js");
    // No window, no matchMedia, no pointer: a pure function of two numbers is
    // the whole point — the pointer decides target SIZE, never how many
    // controls exist, and it must not be reachable from here.
    expect(fitsRow.length).toBe(2);
    expect(String(fitsRow)).not.toMatch(/pointer|coarse|matchMedia|window/);
  });
});

/* NOT pinned here, and the reason is worth stating rather than leaving as an
 * absence: CaseWorkspace's own threshold (CASE_PANES_ONE_ROW_PX).  It is built
 * FROM the two column widths the grid template is built from, so there is no
 * second home for it to drift out of step with — and importing the component
 * to read it drags in the store and the whole tutorial index, which cost this
 * file ~30 s per assertion when it was tried.  A slow test for a number that
 * cannot disagree with itself is a poor trade. */

describe("a posture default is READ-ONLY — reading never writes", () => {
  it("loadCollapsed with a posture default writes nothing to storage", async () => {
    const { loadCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, true)).toBe(true);
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, false)).toBe(false);
    expect(ls.size()).toBe(0);
    expect(ls.getItem(CONTROLS_COLLAPSED_KEY)).toBeNull();
  });

  it("hasStoredCollapsed writes nothing either", async () => {
    const { hasStoredCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
    expect(ls.size()).toBe(0);
  });

  it("only an explicit save writes the key — and then it beats the default", async () => {
    const { hasStoredCollapsed, loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(CONTROLS_COLLAPSED_KEY, false);      // user pins EXPANDED
    expect(ls.getItem(CONTROLS_COLLAPSED_KEY)).toBe("0");
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(true);
    // …so a collapsed DEFAULT no longer applies:
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, true)).toBe(false);
  });
});
