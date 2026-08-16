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
