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
  methodsResponsive — the Methods workspace's responsive-posture CONTRACT
  (panel-ratified 2026-08), pinned at the level the node runner can reach
  (the project ships no jsdom, so the hooks themselves are exercised in the
  browser, not here):

  * the two breakpoint constants are Mantine's own `sm` / `md` and ordered;
  * the sm–md autofold is a DEFAULT, never a write: seeding a posture default
    into loadCollapsed touches nothing in storage (a narrow session never
    writes the rail key — item pinned here because it is the persistence
    half of the responsive contract);
  * the first explicit toggle writes the key and wins over any later default.
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
  it("narrow = Mantine sm (48em), rail autofold = Mantine md (62em)", async () => {
    const { NARROW_BREAKPOINT_EM, RAIL_AUTOFOLD_BREAKPOINT_EM } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(NARROW_BREAKPOINT_EM).toBe(48);
    expect(RAIL_AUTOFOLD_BREAKPOINT_EM).toBe(62);
  });

  it("the narrow boundary sits strictly below the autofold boundary", async () => {
    const { NARROW_BREAKPOINT_EM, RAIL_AUTOFOLD_BREAKPOINT_EM } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(NARROW_BREAKPOINT_EM).toBeLessThan(RAIL_AUTOFOLD_BREAKPOINT_EM);
  });

  it("the posture hooks are exported (the ONE detection home)", async () => {
    const chrome = await import("../src/ui/methods/methodsChrome.js");
    expect(typeof chrome.useNarrowViewport).toBe("function");
    expect(typeof chrome.useCoarsePointer).toBe("function");
    expect(typeof chrome.useRailAutofoldDefault).toBe("function");
  });
});

describe("the autofold default is READ-ONLY — a narrow session never writes", () => {
  it("loadCollapsed with a posture default writes nothing to storage", async () => {
    const { loadCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, true)).toBe(true);
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, false)).toBe(false);
    expect(ls.size()).toBe(0);
    expect(ls.getItem(RAIL_COLLAPSED_KEY)).toBeNull();
  });

  it("hasStoredCollapsed writes nothing either", async () => {
    const { hasStoredCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
    expect(ls.size()).toBe(0);
  });

  it("only an explicit save writes the key — and then it beats the default", async () => {
    const { hasStoredCollapsed, loadCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(RAIL_COLLAPSED_KEY, false);      // user pins EXPANDED
    expect(ls.getItem(RAIL_COLLAPSED_KEY)).toBe("0");
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(true);
    // …so the sm–md collapsed DEFAULT no longer applies:
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, true)).toBe(false);
  });
});
