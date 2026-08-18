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
  methodsChrome — the EduTools workspace's collapse-persistence contract.
  Pure helpers (no DOM): a minimal window/localStorage stub mirrors
  exploreRail.test.ts (the project ships no jsdom).

  RE-AIMED 2026-08-16.  These cases used to drive the persistence helpers
  through CONTROLS_COLLAPSED_KEY, which went out with the tool rail (the chooser
  is the top bar's EduTools dropdown now).  The CONTRACT they pin — junk
  tolerance, blocked/absent storage, default-vs-explicit-toggle — is unchanged
  and still load-bearing for every tool's setup-bar fold, so they now drive it
  through the keys that survive: the shared setup-bar key and a per-tool one.
  A test kept alive by renaming its subject would be a test of nothing; these
  keys are real and read by real code.
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
  it("the setup-bar key is the documented contract string", async () => {
    const { CONTROLS_COLLAPSED_KEY } = await import("../src/ui/methods/methodsChrome.js");
    expect(CONTROLS_COLLAPSED_KEY).toBe("choupo.methods.controlsCollapsed");
  });

  it("the rail's key and its strip are GONE with the rail they served", async () => {
    // Named as STRINGS, deliberately: an import of a removed export would not
    // compile, and a test that cannot compile is not a test that the export is
    // absent.  Each tool also owns a namespaced key of its own
    // (choupo.methods.<tool>.controlsCollapsed, declared beside the tool) —
    // those modules reach the store, which needs a real window, so they are
    // not imported here.
    const chrome = await import("../src/ui/methods/methodsChrome.js");
    expect("RAIL_COLLAPSED_KEY" in chrome).toBe(false);
    expect("REOPEN_STRIP_PX" in chrome).toBe(false);
    expect("RailReopenStrip" in chrome).toBe(false);
    expect("useRailAutofoldDefault" in chrome).toBe(false);
  });
});

describe("collapse flags — persist round-trip", () => {
  it("defaults to EXPANDED (false) when the key is absent", async () => {
    const { loadCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
  });

  it("save(true) then load returns true under the given key", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(CONTROLS_COLLAPSED_KEY, true);
    expect(ls.getItem(CONTROLS_COLLAPSED_KEY)).toBe("1");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(true);
  });

  it("save(false) round-trips and reads as EXPANDED", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(CONTROLS_COLLAPSED_KEY, false);
    expect(ls.getItem(CONTROLS_COLLAPSED_KEY)).toBe("0");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
  });

  it("keys are independent: folding one tool's bar never folds another's", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    const perTool = "choupo.methods.entu.controlsCollapsed";
    saveCollapsed(perTool, true);
    expect(loadCollapsed(perTool)).toBe(true);
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
  });

  it("treats any value other than \"1\" as EXPANDED (junk-tolerant)", async () => {
    const { loadCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    ls.setItem(CONTROLS_COLLAPSED_KEY, "yes");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
  });

  it("a throwing storage reads EXPANDED and saves without throwing (best-effort)", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
    };
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
    expect(() => saveCollapsed(CONTROLS_COLLAPSED_KEY, true)).not.toThrow();
  });

  it("no window at all (SSR / node): load is EXPANDED, save is a no-op", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    delete (globalThis as Record<string, unknown>).window;
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
    expect(() => saveCollapsed(CONTROLS_COLLAPSED_KEY, true)).not.toThrow();
  });
});

describe("collapse flags — the optional posture default", () => {
  it("an absent key answers with the given default, both ways", async () => {
    const { loadCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, true)).toBe(true);
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, false)).toBe(false);
  });

  it("a stored user toggle WINS over the posture default, both ways", async () => {
    const { loadCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    saveCollapsed(CONTROLS_COLLAPSED_KEY, false);          // explicit EXPANDED
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, true)).toBe(false);
    saveCollapsed(CONTROLS_COLLAPSED_KEY, true);           // explicit COLLAPSED
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, false)).toBe(true);
  });

  it("junk reads as the default (not as an explicit toggle)", async () => {
    const { loadCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    ls.setItem(CONTROLS_COLLAPSED_KEY, "maybe");
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, true)).toBe(true);
    expect(loadCollapsed(CONTROLS_COLLAPSED_KEY, false)).toBe(false);
  });

  it("hasStoredCollapsed: only a real \"1\"/\"0\" counts as a user toggle", async () => {
    const { hasStoredCollapsed, saveCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);   // absent
    ls.setItem(CONTROLS_COLLAPSED_KEY, "junk");
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);   // junk
    saveCollapsed(CONTROLS_COLLAPSED_KEY, true);
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(true);    // "1"
    saveCollapsed(CONTROLS_COLLAPSED_KEY, false);
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(true);    // "0"
  });

  it("hasStoredCollapsed: blocked storage or no window reads as no toggle", async () => {
    const { hasStoredCollapsed, CONTROLS_COLLAPSED_KEY } =
      await import("../src/ui/methods/methodsChrome.js");
    (globalThis as Record<string, unknown>).window = {
      localStorage: { getItem: () => { throw new Error("blocked"); } },
    };
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
    delete (globalThis as Record<string, unknown>).window;
    expect(hasStoredCollapsed(CONTROLS_COLLAPSED_KEY)).toBe(false);
  });
});

/* The setup bar's two postures — the `setupBarLayout` describe block that
 * stood here is DELETED with the helper itself (2026-08-18).
 *
 * The rule it pinned was real and its reason is worth keeping: on a 390 px
 * screen a nowrap row put 13 (McCabe) and 29 (psychrometric) controls behind an
 * `overflow: hidden` edge no gesture could reach.  What changed is that there
 * is no row: every tool's setup controls are a docked left panel
 * (ui/methods/knobPanel.tsx), which scrolls vertically and whose width the
 * reader drags.
 *
 * Keeping the three assertions would have left a green test about a helper no
 * screen calls — a pass that reports on nothing, which is the failure mode this
 * project retired `check_true_ions` for.  The phone's own behaviour is not left
 * untested by the deletion: it is now `autoCollapseDefault` in
 * tests/panelContract.test.ts, asked of the panel's minimum against the
 * measured host. */
