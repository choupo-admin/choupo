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
  methodsChrome — the Methods workspace's collapse-persistence contract.
  Pure helpers (no DOM): a minimal window/localStorage stub mirrors
  exploreRail.test.ts (the project ships no jsdom).
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
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

describe("collapse flags — the persisted keys", () => {
  it("the rail key is the documented contract string", async () => {
    const { RAIL_COLLAPSED_KEY } = await import("../src/ui/methods/methodsChrome.js");
    expect(RAIL_COLLAPSED_KEY).toBe("choupo.methods.railCollapsed");
  });

  it("the setup-bar key is distinct from the rail key (two folds, two facts)", async () => {
    const { CONTROLS_COLLAPSED_KEY, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(CONTROLS_COLLAPSED_KEY).toBe("choupo.methods.controlsCollapsed");
    expect(CONTROLS_COLLAPSED_KEY).not.toBe(RAIL_COLLAPSED_KEY);
  });
});

describe("collapse flags — persist round-trip", () => {
  it("defaults to EXPANDED (false) when the key is absent", async () => {
    const { loadCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
  });

  it("save(true) then load returns true under the given key", async () => {
    const { loadCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(RAIL_COLLAPSED_KEY, true);
    expect(ls.getItem(RAIL_COLLAPSED_KEY)).toBe("1");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(true);
  });

  it("save(false) round-trips and reads as EXPANDED", async () => {
    const { loadCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(RAIL_COLLAPSED_KEY, false);
    expect(ls.getItem(RAIL_COLLAPSED_KEY)).toBe("0");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
  });

  it("the two keys are independent: folding the rail never folds the setup bar", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(RAIL_COLLAPSED_KEY, true);
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(true);
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
  });

  it("treats any value other than \"1\" as EXPANDED (junk-tolerant)", async () => {
    const { loadCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    ls.setItem(RAIL_COLLAPSED_KEY, "yes");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
  });

  it("a throwing storage reads EXPANDED and saves without throwing (best-effort)", async () => {
    const { loadCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
    };
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
    expect(() => saveCollapsed(RAIL_COLLAPSED_KEY, true)).not.toThrow();
  });

  it("no window at all (SSR / node): load is EXPANDED, save is a no-op", async () => {
    const { loadCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    delete (globalThis as Record<string, unknown>).window;
    expect(loadCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
    expect(() => saveCollapsed(RAIL_COLLAPSED_KEY, true)).not.toThrow();
  });
});

describe("collapse flags — the optional posture default (sm–md autofold)", () => {
  it("an absent key answers with the given default, both ways", async () => {
    const { loadCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, true)).toBe(true);
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, false)).toBe(false);
  });

  it("a stored user toggle WINS over the posture default, both ways", async () => {
    const { loadCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(RAIL_COLLAPSED_KEY, false);          // explicit EXPANDED
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, true)).toBe(false);
    saveCollapsed(RAIL_COLLAPSED_KEY, true);           // explicit COLLAPSED
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, false)).toBe(true);
  });

  it("junk reads as the default (not as an explicit toggle)", async () => {
    const { loadCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    ls.setItem(RAIL_COLLAPSED_KEY, "maybe");
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, true)).toBe(true);
    expect(loadCollapsed(RAIL_COLLAPSED_KEY, false)).toBe(false);
  });

  it("hasStoredCollapsed: only a real \"1\"/\"0\" counts as a user toggle", async () => {
    const { hasStoredCollapsed, saveCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);   // absent
    ls.setItem(RAIL_COLLAPSED_KEY, "junk");
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);   // junk
    saveCollapsed(RAIL_COLLAPSED_KEY, true);
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(true);    // "1"
    saveCollapsed(RAIL_COLLAPSED_KEY, false);
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(true);    // "0"
  });

  it("hasStoredCollapsed: blocked storage or no window reads as no toggle", async () => {
    const { hasStoredCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    (globalThis as Record<string, unknown>).window = {
      localStorage: { getItem: () => { throw new Error("blocked"); } },
    };
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
    delete (globalThis as Record<string, unknown>).window;
    expect(hasStoredCollapsed(RAIL_COLLAPSED_KEY)).toBe(false);
  });
});
