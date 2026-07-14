/*---------------------------------------------------------------------------*\
  Tab citizenship of the ?focus= pop-out (gui-credo §4, 2026-06-12): a pop-out
  tab is a REAL tab --

    - its stash lives under the STABLE key `choupo.focus.<unit>` and is NEVER
      consumed at boot, so F5 reproduces the tab;
    - legacy one-shot keys (`choupo.focus.<unit>.<timestampMs>`) from older
      builds are garbage-collected at boot;
    - when the stash is gone the boot sets `bootExpired` so the UI refuses
      honestly ("expired -- reopen from the parent case") instead of silently
      degrading to the welcome screen.

  The store reads window.location/localStorage at module init, so each test
  resets modules and seeds the stubs BEFORE importing the store fresh (same
  harness pattern as session.test.ts).
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---- Heavy-glob cache (suite health, forum #99/#100.1) --------------------
//  The store's import graph reaches the eager import.meta.glob catalogues
//  (the WHOLE tutorials corpus + data/standards) -- under vitest each
//  vi.resetModules() + fresh import re-reads and re-transforms every matched
//  file: ~5 s and huge sys-time PER TEST (48 s for 6 tests on an idle
//  machine; the 20 s timeout then trips under any extra load).  The data
//  modules are PURE (derived constants, no mutable state this suite
//  exercises), so load them ONCE and re-register the loaded exports as mocks:
//  the STORE still re-initialises fresh each test (the behaviour under
//  test); only the corpus re-read is gone.
import * as _tutorialsMod from "../src/cases/tutorials.js";
import * as _catalogueMod from "../src/case/catalogue.js";
import * as _pairsMod from "../src/case/pairsCatalogue.js";
const mockHeavyDataModules = () => {
  vi.doMock("../src/cases/tutorials.js", () => _tutorialsMod);
  vi.doMock("../src/case/catalogue.js", () => _catalogueMod);
  vi.doMock("../src/case/pairsCatalogue.js", () => _pairsMod);
};


// localStorage stub WITH length/key (the boot-time GC iterates the keys).
function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
  };
}

let ls: ReturnType<typeof makeLocalStorage>;

function seedWindow(search: string) {
  (globalThis as Record<string, unknown>).window = {
    localStorage: ls,
    location: { search },
    innerHeight: 800,
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
}

const STASH_KEY = "choupo.focus.flash1";
const stash = JSON.stringify({
  displayName: "focus:flash1",
  files: {
    controlDict: {},
    thermoPackage: {},
    flowsheet: { streams: { hot: { F: 1, T: 340, P: 2e5 } }, units: [{ name: "flash1", type: "flash" }] },
  },
});

beforeEach(() => {
  vi.resetModules();
  mockHeavyDataModules();
  ls = makeLocalStorage();
});

afterEach(async () => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
  await new Promise((r) => setTimeout(r, 25));
});

describe("?focus= boot (stable, never-consumed stash)", () => {
  it("boots the focus clone WITHOUT consuming the stash -- F5 reproduces the tab", async () => {
    ls.setItem(STASH_KEY, stash);
    seedWindow(`?focus=${encodeURIComponent(STASH_KEY)}`);

    let { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().tutorialName).toBe("focus:flash1");
    expect(useStore.getState().bootExpired).toBeNull();
    expect(ls.getItem(STASH_KEY)).not.toBeNull();   // NOT removed

    // Simulate F5: fresh module init over the same storage.
    vi.resetModules();
  mockHeavyDataModules();
    ({ useStore } = await import("../src/state/store.js"));
    expect(useStore.getState().tutorialName).toBe("focus:flash1");
  });

  it("garbage-collects legacy one-shot timestamped keys, keeps the stable one", async () => {
    ls.setItem(STASH_KEY, stash);
    ls.setItem("choupo.focus.flash1.1718000000000", "legacy");
    ls.setItem("choupo.focus.otherUnit.1718000000001", "legacy");
    seedWindow(`?focus=${encodeURIComponent(STASH_KEY)}`);

    await import("../src/state/store.js");
    expect(ls.getItem("choupo.focus.flash1.1718000000000")).toBeNull();
    expect(ls.getItem("choupo.focus.otherUnit.1718000000001")).toBeNull();
    expect(ls.getItem(STASH_KEY)).not.toBeNull();
  });

  it("missing stash -> boots blank with bootExpired = 'focus' (honest refusal)", async () => {
    seedWindow(`?focus=${encodeURIComponent("choupo.focus.ghost")}`);
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().tutorialName).toBe("");
    expect(useStore.getState().bootExpired).toBe("focus");
  });

  it("a normal boot is untouched: no bootExpired, blank welcome", async () => {
    seedWindow("");
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().bootExpired).toBeNull();
    expect(useStore.getState().tutorialName).toBe("");
  });
});
