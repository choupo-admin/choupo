/*---------------------------------------------------------------------------*\
  Session restore (slice 4): the GUI reopens exactly what was open when it was
  last closed -- the case, the active workspace tab, the console, the panels.
  The store reads localStorage at module init, so each test resets modules and
  seeds a minimal window/localStorage stub BEFORE importing the store fresh
  (the project ships no jsdom; the store only needs window.localStorage +
  window.location.search).
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


const KEY = "choupo.session.v1";

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
  mockHeavyDataModules();
  ls = makeLocalStorage();
  (globalThis as Record<string, unknown>).window = {
    localStorage: ls,
    location: { search: "" },
    innerHeight: 800,
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
});

afterEach(async () => {
  // Tear down FIRST, then drain: with window gone, any pending async persist from
  // this test (e.g. reopenLastCase's trailing setState -> session subscriber)
  // fires into `typeof window === "undefined"` and saveSession no-ops -- so it can
  // never leak into the NEXT test's freshly-seeded storage.  Deterministic.
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
  await new Promise((r) => setTimeout(r, 25));
});

describe("session restore", () => {
  it("boots BLANK but restores workspace/console/panels; reopenLastCase loads the case", async () => {
    const { TUTORIALS } = await import("../src/cases/tutorials.js");
    const name = TUTORIALS[0]!.name;
    ls.setItem(KEY, JSON.stringify({
      caseRef: { kind: "tutorial", name },
      activeWorkspace: "props",
      agentOpen: true,
      panels: { property: false, output: true },
    }));

    const { useStore, reopenLastCase } = await import("../src/state/store.js");
    const s = useStore.getState();
    expect(s.tutorialName).toBe("");            // boots BLANK -- no auto-load
    expect(s.activeWorkspace).toBe("props");     // UI state IS still restored
    expect(s.agentOpen).toBe(true);
    expect(s.panels).toEqual({ property: false, output: true });
    await reopenLastCase();                       // deliberate reopen (File menu)
    expect(useStore.getState().tutorialName).toBe(name);
  });

  it("persists the session when the active workspace changes", async () => {
    const { useStore } = await import("../src/state/store.js");
    useStore.getState().toggleWorkspace("streams");
    const blob = JSON.parse(ls.getItem(KEY)!);
    expect(blob.activeWorkspace).toBe("streams");
    expect(blob.caseRef).toBeNull(); // booted blank, no case opened -> no ref
  });

  it("records a local case as a restorable ref (by absolute dir)", async () => {
    const { useStore } = await import("../src/state/store.js");
    useStore.getState().loadLocalCase("/path/to/cases/my_case", {
      controlDict: {}, thermoPackage: {},
    } as never);
    const blob = JSON.parse(ls.getItem(KEY)!);
    expect(blob.caseRef).toEqual({ kind: "local", dir: "/path/to/cases/my_case" });
  });

  it("boots BLANK with no stored session", async () => {
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().tutorialName).toBe(""); // blank, no case open
    expect(useStore.getState().activeWorkspace).toBeNull();
    expect(useStore.getState().agentOpen).toBe(false);
  });

  it("restores the panel folds (selection card + console) from the session", async () => {
    ls.setItem(KEY, JSON.stringify({
      caseRef: null,
      activeWorkspace: null,
      agentOpen: true,
      agentDocked: true,
      agentCollapsed: true,
      panels: { property: false, output: true },
    }));
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().agentCollapsed).toBe(true);     // console folded
    expect(useStore.getState().panels.property).toBe(false);   // card tucked away
  });

  it("persists the panel folds when toggled (card via togglePanel, console via toggleAgentCollapsed)", async () => {
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().agentCollapsed).toBe(false);    // defaults expanded
    expect(useStore.getState().panels.property).toBe(true);
    useStore.getState().togglePanel("property");
    useStore.getState().toggleAgentCollapsed();
    const blob = JSON.parse(ls.getItem(KEY)!);
    expect(blob.panels.property).toBe(false);
    expect(blob.agentCollapsed).toBe(true);
  });
});
