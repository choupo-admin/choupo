/*---------------------------------------------------------------------------*\
  Session restore (slice 4): the GUI reopens exactly what was open when it was
  last closed -- the case, the active workspace tab, the console, the panels.
  The store reads localStorage at module init, so each test resets modules and
  seeds a minimal window/localStorage stub BEFORE importing the store fresh
  (the project ships no jsdom; the store only needs window.localStorage +
  window.location.search).
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
});
