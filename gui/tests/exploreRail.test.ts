/*---------------------------------------------------------------------------*\
  exploreRail — the Property Explorer's resizable-rail clamp/persist contract +
  the McCabe pop-out state-carry.  Pure helpers (no DOM): a minimal
  window/localStorage stub mirrors session.test.ts (the project ships no jsdom).

  RE-AIMED 2026-08-18 at where the rail's preferences now live — see the note
  above the first describe.  The claims are unchanged; the home is not.
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
  (globalThis as Record<string, unknown>).window = { localStorage: ls, location: { pathname: "/app", search: "" } };
  (globalThis as Record<string, unknown>).localStorage = ls;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

/* THE RAIL'S OWN PERSISTENCE MOVED, TWICE, ON THE SAME DAY (2026-08-18) — and
 * these cases follow it rather than being deleted, because what they pin is
 * still a live claim about the EXPLORER'S rail: it clamps to 200–460, defaults
 * to 240, tolerates junk, and its fold is independent of its dragged width so
 * re-opening is lossless.
 *
 * Where that now lives: the KEYS and the junk-tolerant reading are the reader-
 * preference registry's (`state/prefs.ts`, PANELS.exploreRail — the legacy key
 * spellings kept on purpose, so nobody's rail resets); the BEHAVIOUR built on
 * top of them is the panel contract's (`ui/panelContract.tsx`).  The hook this
 * file used to import, `explore/useRailWidth.ts`, is gone: its mechanics became
 * the contract's, which is what let five other rails have them too.
 */
describe("Explorer rail — clamp", () => {
  it("clamps to [200, 460] and rounds", async () => {
    const { clampSize, PANELS } = await import("../src/state/prefs.js");
    const spec = PANELS.exploreRail.size;
    expect(spec).toEqual({ min: 200, max: 460, default: 240 });
    expect(clampSize(50, spec)).toBe(200);      // below MIN
    expect(clampSize(1000, spec)).toBe(460);    // above MAX
    expect(clampSize(240, spec)).toBe(240);     // in range
    expect(clampSize(333.7, spec)).toBe(334);   // rounded
  });

  it("falls back to the default on a non-finite candidate", async () => {
    const { clampSize, PANELS } = await import("../src/state/prefs.js");
    const spec = PANELS.exploreRail.size;
    expect(clampSize(NaN, spec)).toBe(spec.default);
    expect(clampSize(Infinity, spec)).toBe(spec.default);
  });
});

describe("Explorer rail — persist round-trip", () => {
  it("save then load returns the clamped value under the rail's key", async () => {
    const { savePanelSize, loadPanelSize, PANELS } = await import("../src/state/prefs.js");
    savePanelSize(PANELS.exploreRail, 300);
    expect(ls.getItem(PANELS.exploreRail.sizeKey!)).toBe("300");
    expect(loadPanelSize(PANELS.exploreRail)).toBe(300);
  });

  it("save clamps out-of-range before persisting", async () => {
    const { savePanelSize, loadPanelSize, PANELS } = await import("../src/state/prefs.js");
    savePanelSize(PANELS.exploreRail, 9999);
    expect(loadPanelSize(PANELS.exploreRail)).toBe(460);
    savePanelSize(PANELS.exploreRail, 10);
    expect(loadPanelSize(PANELS.exploreRail)).toBe(200);
  });

  it("load returns the default when the key is absent or junk", async () => {
    const { loadPanelSize, PANELS } = await import("../src/state/prefs.js");
    expect(loadPanelSize(PANELS.exploreRail)).toBe(240);          // absent
    ls.setItem(PANELS.exploreRail.sizeKey!, "not-a-number");
    expect(loadPanelSize(PANELS.exploreRail)).toBe(240);          // junk
  });
});

describe("Explorer rail — collapse round-trip", () => {
  it("defaults to EXPANDED (false) when the key is absent", async () => {
    const { loadPanelCollapsed, PANELS } = await import("../src/state/prefs.js");
    expect(loadPanelCollapsed(PANELS.exploreRail)).toBe(false);
  });

  it("save(true) then load returns true under the collapsed key", async () => {
    const { savePanelCollapsed, loadPanelCollapsed, PANELS } = await import("../src/state/prefs.js");
    savePanelCollapsed(PANELS.exploreRail, true);
    expect(ls.getItem(PANELS.exploreRail.collapsedKey!)).toBe("1");
    expect(loadPanelCollapsed(PANELS.exploreRail)).toBe(true);
  });

  it("treats any value other than \"1\"/\"0\" as the default (junk-tolerant)", async () => {
    const { loadPanelCollapsed, PANELS } = await import("../src/state/prefs.js");
    ls.setItem(PANELS.exploreRail.collapsedKey!, "yes");
    expect(loadPanelCollapsed(PANELS.exploreRail)).toBe(false);
  });

  it("is INDEPENDENT of the dragged width (collapse is lossless)", async () => {
    const { savePanelSize, loadPanelSize, savePanelCollapsed, loadPanelCollapsed, PANELS } =
      await import("../src/state/prefs.js");
    const p = PANELS.exploreRail;
    savePanelSize(p, 380);            // the reader drags the rail wide
    savePanelCollapsed(p, true);      // then folds it
    // the width is preserved verbatim — re-opening restores 380, not 0/default
    expect(loadPanelSize(p)).toBe(380);
    expect(loadPanelCollapsed(p)).toBe(true);
    savePanelCollapsed(p, false);     // re-open
    expect(loadPanelSize(p)).toBe(380);
  });
});

describe("McCabe pop-out — state carry", () => {
  it("stashes the frozen curve + provenance + knobs and reads them back identically", async () => {
    const { popOutExploreMccabe, readExploreMccabeStash, mccabeKey } =
      await import("../src/ui/explore/exploreMccabePopOut.js");
    // window.open is on the stub; make it a no-op spy so the pop-out doesn't throw.
    (globalThis as Record<string, unknown>).window = {
      ...(globalThis as Record<string, unknown>).window as object,
      open: vi.fn(),
    };
    const payload = {
      csv: "x,T,y\n0,373,0\n1,353,1\n", compA: "benzene", compB: "toluene",
      P: 101325, model: "NRTL",
    };
    popOutExploreMccabe(payload);
    const key = mccabeKey("benzene", "toluene");
    const got = readExploreMccabeStash(key);
    expect(got).toEqual(payload);
  });

  it("returns null for a missing or corrupt stash (the tab refuses honestly)", async () => {
    const { readExploreMccabeStash, mccabeKey } =
      await import("../src/ui/explore/exploreMccabePopOut.js");
    expect(readExploreMccabeStash(mccabeKey("a", "b"))).toBeNull();   // absent
    ls.setItem(mccabeKey("a", "b"), "{ not json");
    expect(readExploreMccabeStash(mccabeKey("a", "b"))).toBeNull();   // corrupt
    ls.setItem(mccabeKey("a", "b"), JSON.stringify({ P: 1 }));        // missing csv/compA
    expect(readExploreMccabeStash(mccabeKey("a", "b"))).toBeNull();
  });

  it("keys by the binary pair (stable, never-consumed)", async () => {
    const { mccabeKey } = await import("../src/ui/explore/exploreMccabePopOut.js");
    expect(mccabeKey("ethanol", "water")).toBe("choupo.explore.ethanol-water.mccabe");
  });
});
