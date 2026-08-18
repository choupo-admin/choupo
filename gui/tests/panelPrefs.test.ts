/*---------------------------------------------------------------------------*\
  Panel preferences — the READER's layout, and the line between it and the
  tab's own state (state/prefs.ts + the split in state/store.ts, 2026-08-18).

  WHAT THIS SUITE CAN HONESTLY SEE.  There is no jsdom and no layout engine
  here: these tests drive the state layer with a stubbed window + localStorage,
  exactly as tests/session.test.ts does.  So they pin WHAT IS STORED, WHAT IS
  READ BACK, and WHICH HOME each value lives in — the part that can be wrong
  without a browser to show it.

  WHAT THEY CANNOT SEE, named rather than stubbed:
    * that a rail is actually 320 px wide on screen, or that the card visibly
      slides — no box here has a size;
    * that a SECOND real browser tab picks the preference up.  A second tab is
      a second `window` over the SAME localStorage; the closest honest proxy is
      a fresh module registry over the same store (used below), and the real
      thing was measured in Chromium instead (see the report / prefs.ts header);
    * anything about the pointer drag itself (pointer capture, rAF throttling).
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Heavy-glob cache — same reason as tests/session.test.ts: the store's import
// graph reaches the eager tutorial + catalogue globs, and re-reading them on
// every vi.resetModules() costs seconds per test.
import * as _tutorialsMod from "../src/cases/tutorials.js";
import * as _catalogueMod from "../src/case/catalogue.js";
import * as _pairsMod from "../src/case/pairsCatalogue.js";
const mockHeavyDataModules = () => {
  vi.doMock("../src/cases/tutorials.js", () => _tutorialsMod);
  vi.doMock("../src/case/catalogue.js", () => _catalogueMod);
  vi.doMock("../src/case/pairsCatalogue.js", () => _pairsMod);
};

const SESSION_KEY = "choupo.session.v1";
const CARD_KEY = "choupo.panel.selectionCard.collapsed";
const DOCK_H_KEY = "choupo.panel.bottomDock.height";
const DOCK_C_KEY = "choupo.panel.bottomDock.collapsed";
const DOCKED_KEY = "choupo.panel.bottomDock.docked";

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    map: m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
  };
}

let ls: ReturnType<typeof makeLocalStorage>;

/** Seed the globals the state layer reads.  `search` is what makes a tab
 *  ISOLATED: `?case=…` is every opened case since ONE TAB, ONE THING. */
function seedWindow(search = "") {
  (globalThis as Record<string, unknown>).window = {
    localStorage: ls,
    location: { search },
    innerHeight: 800,
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
}

beforeEach(() => {
  vi.resetModules();
  mockHeavyDataModules();
  ls = makeLocalStorage();
  seedWindow();
});

afterEach(async () => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
  await new Promise((r) => setTimeout(r, 25));
});

// ---------------------------------------------------------------------------
describe("storage primitives: junk in, default out", () => {
  it("reads only 1/0 as a flag; junk, absence and an older shape give the default", async () => {
    const { readFlag, hasFlag } = await import("../src/state/prefs.js");
    expect(readFlag("k", false)).toBe(false);          // absent
    expect(readFlag("k", true)).toBe(true);            // absent, other default
    ls.setItem("k", "true");                            // an older shape
    expect(readFlag("k", false)).toBe(false);
    expect(hasFlag("k")).toBe(false);                   // junk is not an answer
    ls.setItem("k", "1");
    expect(readFlag("k", false)).toBe(true);
    expect(hasFlag("k")).toBe(true);
  });

  it("CLAMPS an out-of-range size and DEFAULTS a junk one (they are different)", async () => {
    const { readSize } = await import("../src/state/prefs.js");
    const spec = { min: 200, max: 460, default: 240 };
    ls.setItem("w", "3");                               // a real drag, too narrow
    expect(readSize("w", spec)).toBe(200);              // clamped, never 3 px
    ls.setItem("w", "9999");
    expect(readSize("w", spec)).toBe(460);
    ls.setItem("w", "not-a-number");                    // not an answer at all
    expect(readSize("w", spec)).toBe(240);
    ls.setItem("w", "");
    expect(readSize("w", spec)).toBe(240);
    ls.setItem("w", '{"width":320}');                   // an older shape
    expect(readSize("w", spec)).toBe(240);
  });

  it("never writes a value it would refuse to read", async () => {
    const { writeSize, readSize } = await import("../src/state/prefs.js");
    const spec = { min: 140, max: 1600, default: 360 };
    writeSize("h", spec, 5);
    expect(ls.getItem("h")).toBe("140");
    writeSize("h", spec, Number.NaN);
    expect(readSize("h", spec)).toBe(360);
  });

  it("survives a storage that throws on every access (private mode)", async () => {
    const hostile = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    (globalThis as Record<string, unknown>).window = {
      localStorage: hostile, location: { search: "" }, innerHeight: 800,
    };
    const { readFlag, writeFlag, readSize, writeSize } =
      await import("../src/state/prefs.js");
    expect(readFlag("k", true)).toBe(true);
    expect(() => writeFlag("k", false)).not.toThrow();
    const spec = { min: 1, max: 2, default: 2 };
    expect(readSize("k", spec)).toBe(2);
    expect(() => writeSize("k", spec, 1)).not.toThrow();
  });

  it("survives having no window at all (the node/SSR path)", async () => {
    delete (globalThis as Record<string, unknown>).window;
    const { readFlag, writeFlag, readSize } = await import("../src/state/prefs.js");
    expect(readFlag("k", true)).toBe(true);
    expect(() => writeFlag("k", true)).not.toThrow();
    expect(readSize("k", { min: 1, max: 9, default: 4 })).toBe(4);
  });

  it("fits a size to the viewport WITHOUT touching what is stored", async () => {
    const { fitToViewport, savePanelSize, loadPanelSize, PANELS } =
      await import("../src/state/prefs.js");
    const spec = PANELS.bottomDock.size;
    savePanelSize(PANELS.bottomDock, 900);
    expect(fitToViewport(900, 400, spec)).toBe(400);     // drawn smaller
    expect(loadPanelSize(PANELS.bottomDock)).toBe(900);  // preference intact
    expect(fitToViewport(900, 0, spec)).toBe(900);       // unmeasured: unchanged
  });
});

// ---------------------------------------------------------------------------
describe("the key registry is the one home", () => {
  it("derives every EduTools fold key from the tool id by one rule", async () => {
    const { methodsToolCollapsedKey } = await import("../src/state/prefs.js");
    expect(methodsToolCollapsedKey("pinch-composite"))
      .toBe("choupo.methods.pinch-composite.controlsCollapsed");
    expect(methodsToolCollapsedKey("pump-system"))
      .toBe("choupo.methods.pump-system.controlsCollapsed");
  });

  it("T7: the three CONTROLS_COLLAPSED_KEY homes are gone — and so are the "
    + "per-tool ones", async () => {
    const prefs = await import("../src/state/prefs.js");
    const chrome = await import("../src/ui/methods/methodsChrome.js");
    const pinch = await import("../src/ui/methods/PinchCompositeTool.js");
    const pump = await import("../src/ui/methods/PumpSystemTool.js");

    // The shared setup key still carries its historical spelling (renaming a
    // live key resets every student's browser), and it is spelled ONCE.
    expect(chrome.CONTROLS_COLLAPSED_KEY).toBe(prefs.METHODS_SETUP_COLLAPSED_KEY);
    expect(prefs.METHODS_SETUP_COLLAPSED_KEY).toBe("choupo.methods.controlsCollapsed");

    // No tool exports a fold key of its own any more.  The three same-named,
    // different-valued exports went first (2026-08-18, morning); the two
    // distinctly-named ones went with the horizontal knob strips they folded
    // (2026-08-18, this slice), when all twelve tools adopted ONE docked setup
    // panel.  A tool that re-exported one would be re-opening a per-tool
    // question the panel no longer asks.
    for (const mod of [pinch, pump]) {
      for (const name of Object.keys(mod)) {
        expect(name).not.toMatch(/COLLAPSED_KEY$/);
      }
    }
  });

  it("T7b: the EduTools setup panel's fold IS the registry's shared key",
    async () => {
      const prefs = await import("../src/state/prefs.js");
      const contract = await import("../src/ui/panelContract.js");
      // One entry, one width, one fold — for every tool in METHOD_TOOLS.
      expect(prefs.PANELS.methodKnobsRail.collapsedKey)
        .toBe(prefs.METHODS_SETUP_COLLAPSED_KEY);
      expect(prefs.PANELS.methodKnobsRail.sizeKey)
        .toBe("choupo.panel.methodKnobsRail.size");
      expect(contract.METHOD_KNOBS_PANEL.prefs)
        .toBe(prefs.PANELS.methodKnobsRail);
      expect(contract.METHOD_KNOBS_PANEL.edge).toBe("left");
      expect(contract.METHOD_KNOBS_PANEL.shortcut).toBe("[");
    });

  it("methodsChrome's readers delegate to the state layer (no second copy)", async () => {
    const { loadCollapsed, saveCollapsed, hasStoredCollapsed } =
      await import("../src/ui/methods/methodsChrome.js");
    const { readFlag } = await import("../src/state/prefs.js");
    saveCollapsed("choupo.test.fold", true);
    expect(readFlag("choupo.test.fold", false)).toBe(true);
    expect(loadCollapsed("choupo.test.fold")).toBe(true);
    ls.setItem("choupo.test.fold", "junk");
    expect(hasStoredCollapsed("choupo.test.fold")).toBe(false);
    expect(loadCollapsed("choupo.test.fold", true)).toBe(true);   // default wins
  });
});

// ---------------------------------------------------------------------------
describe("reader preference vs tab state", () => {
  it("an ISOLATED (?case=) tab persists the card fold and reads it back", async () => {
    seedWindow("?case=steady/flash/flash01_benzene_toluene");
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().panels.property).toBe(true);       // default open
    useStore.getState().togglePanel("property");                  // tuck it away
    expect(ls.getItem(CARD_KEY)).toBe("1");
    // The tab's SESSION is still not written — that half of the guard stands.
    expect(ls.getItem(SESSION_KEY)).toBeNull();

    // Reload the same isolated tab: fresh modules, same storage.
    vi.resetModules();
    mockHeavyDataModules();
    seedWindow("?case=steady/flash/flash01_benzene_toluene");
    const { useStore: reloaded } = await import("../src/state/store.js");
    expect(reloaded.getState().panels.property).toBe(false);      // still tucked
  });

  it("the preference crosses tabs: set in the hub, present in a case tab", async () => {
    const { useStore } = await import("../src/state/store.js");
    useStore.getState().togglePanel("property");                  // hub tab
    useStore.getState().toggleAgentCollapsed();
    useStore.getState().setAgentHeight(520);

    vi.resetModules();
    mockHeavyDataModules();
    seedWindow("?case=steady/flash/flash01_benzene_toluene");     // a new tab
    const { useStore: caseTab } = await import("../src/state/store.js");
    expect(caseTab.getState().panels.property).toBe(false);
    expect(caseTab.getState().agentCollapsed).toBe(true);
    expect(caseTab.getState().agentHeight).toBe(520);
  });

  it("the bottom dock's height is persisted at all (it was not, before)", async () => {
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().agentHeight).toBe(360);            // default
    useStore.getState().setAgentHeight(420);
    expect(ls.getItem(DOCK_H_KEY)).toBe("420");
    expect(useStore.getState().agentHeight).toBe(420);
  });

  it("a dock height set on a tall screen survives a session on a short one", async () => {
    ls.setItem(DOCK_H_KEY, "900");
    (globalThis as Record<string, unknown>).window = {
      localStorage: ls, location: { search: "" }, innerHeight: 500,
    };
    const { useStore } = await import("../src/state/store.js");
    // What is DRAWN is the reader's height; what is STORED is untouched, so the
    // same browser on the big monitor gets 900 back.
    expect(ls.getItem(DOCK_H_KEY)).toBe("900");
    expect(useStore.getState().agentHeight).toBe(900);
  });

  it("the dock's drag is clamped to the panel's own floor, not to nothing", async () => {
    const { useStore } = await import("../src/state/store.js");
    useStore.getState().setAgentHeight(10);
    expect(useStore.getState().agentHeight).toBe(140);
    expect(ls.getItem(DOCK_H_KEY)).toBe("140");
  });

  it("the session blob carries TAB STATE only — no folds, no output", async () => {
    const { useStore } = await import("../src/state/store.js");
    useStore.getState().toggleWorkspace("streams");
    useStore.getState().togglePanel("property");
    useStore.getState().toggleAgentCollapsed();
    const blob = JSON.parse(ls.getItem(SESSION_KEY)!);
    expect(blob.activeWorkspace).toBe("streams");
    expect("panels" in blob).toBe(false);
    expect("agentCollapsed" in blob).toBe(false);
    expect("agentDocked" in blob).toBe(false);
    expect(JSON.stringify(blob)).not.toContain("output");
  });
});

// ---------------------------------------------------------------------------
describe("a browser that already has the old shape", () => {
  it("T4: a stored blob carrying panels.output still loads, and output is dropped", async () => {
    ls.setItem(SESSION_KEY, JSON.stringify({
      caseRef: null, activeWorkspace: "props", agentOpen: true,
      agentDocked: false, agentCollapsed: true,
      panels: { property: false, output: true },
    }));
    const { useStore } = await import("../src/state/store.js");
    const s = useStore.getState();
    expect(s.activeWorkspace).toBe("props");                 // tab state restored
    expect(s.agentOpen).toBe(true);
    expect((s.panels as Record<string, boolean>).output).toBeUndefined();
    // and the migrated preferences arrived at their own keys
    expect(s.panels.property).toBe(false);
    expect(s.agentCollapsed).toBe(true);
    expect(s.agentDocked).toBe(false);
    expect(ls.getItem(CARD_KEY)).toBe("1");
    expect(ls.getItem(DOCK_C_KEY)).toBe("1");
    expect(ls.getItem(DOCKED_KEY)).toBe("0");
  });

  it("migrates in an ISOLATED tab too — where the session reader is blind", async () => {
    ls.setItem(SESSION_KEY, JSON.stringify({
      caseRef: null, activeWorkspace: null, agentOpen: false,
      agentCollapsed: true, panels: { property: false, output: true },
    }));
    seedWindow("?case=steady/flash/flash01_benzene_toluene");
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().panels.property).toBe(false);
    expect(useStore.getState().agentCollapsed).toBe(true);
  });

  it("the migration never overrides a preference the reader has since set", async () => {
    ls.setItem(SESSION_KEY, JSON.stringify({
      caseRef: null, activeWorkspace: null, agentOpen: false,
      panels: { property: false },                       // legacy: tucked
    }));
    ls.setItem(CARD_KEY, "0");                           // reader: expanded
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().panels.property).toBe(true);
    expect(ls.getItem(CARD_KEY)).toBe("0");
  });

  it("a corrupt legacy blob costs the defaults, not the boot", async () => {
    ls.setItem(SESSION_KEY, "{not json");
    const { useStore } = await import("../src/state/store.js");
    expect(useStore.getState().panels.property).toBe(true);
    expect(useStore.getState().agentCollapsed).toBe(false);
    expect(useStore.getState().agentHeight).toBe(360);
  });
});
