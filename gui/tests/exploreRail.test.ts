/*---------------------------------------------------------------------------*\
  exploreRail — the Property Explorer's resizable-rail clamp/persist logic + the
  McCabe pop-out state-carry.  Pure helpers (no DOM): a minimal window/local
  Storage stub mirrors session.test.ts (the project ships no jsdom).
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

describe("rail width — clamp", () => {
  it("clamps to [200, 460] and rounds", async () => {
    const { clampRailWidth } = await import("../src/ui/explore/useRailWidth.js");
    expect(clampRailWidth(50)).toBe(200);     // below MIN
    expect(clampRailWidth(1000)).toBe(460);   // above MAX
    expect(clampRailWidth(240)).toBe(240);    // in range
    expect(clampRailWidth(333.7)).toBe(334);  // rounded
  });

  it("falls back to the default on a non-finite candidate", async () => {
    const { clampRailWidth, RAIL_DEFAULT } = await import("../src/ui/explore/useRailWidth.js");
    expect(clampRailWidth(NaN)).toBe(RAIL_DEFAULT);       // non-finite -> default
    expect(clampRailWidth(Infinity)).toBe(RAIL_DEFAULT);  // non-finite -> default
  });
});

describe("rail width — persist round-trip", () => {
  it("save then load returns the clamped value under the GLOBAL key", async () => {
    const { saveRailWidth, loadRailWidth, RAIL_KEY } = await import("../src/ui/explore/useRailWidth.js");
    saveRailWidth(300);
    expect(ls.getItem(RAIL_KEY)).toBe("300");
    expect(loadRailWidth()).toBe(300);
  });

  it("save clamps out-of-range before persisting", async () => {
    const { saveRailWidth, loadRailWidth } = await import("../src/ui/explore/useRailWidth.js");
    saveRailWidth(9999);
    expect(loadRailWidth()).toBe(460);
    saveRailWidth(10);
    expect(loadRailWidth()).toBe(200);
  });

  it("load returns the default when the key is absent or junk", async () => {
    const { loadRailWidth, RAIL_DEFAULT, RAIL_KEY } = await import("../src/ui/explore/useRailWidth.js");
    expect(loadRailWidth()).toBe(RAIL_DEFAULT);   // absent
    ls.setItem(RAIL_KEY, "not-a-number");
    expect(loadRailWidth()).toBe(RAIL_DEFAULT);   // junk
  });
});

describe("rail collapse — persist round-trip", () => {
  it("defaults to EXPANDED (false) when the key is absent", async () => {
    const { loadRailCollapsed } = await import("../src/ui/explore/useRailWidth.js");
    expect(loadRailCollapsed()).toBe(false);
  });

  it("save(true) then load returns true under the GLOBAL collapsed key", async () => {
    const { saveRailCollapsed, loadRailCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/explore/useRailWidth.js");
    saveRailCollapsed(true);
    expect(ls.getItem(RAIL_COLLAPSED_KEY)).toBe("1");
    expect(loadRailCollapsed()).toBe(true);
  });

  it("save(false) round-trips and reads as EXPANDED", async () => {
    const { saveRailCollapsed, loadRailCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/explore/useRailWidth.js");
    saveRailCollapsed(false);
    expect(ls.getItem(RAIL_COLLAPSED_KEY)).toBe("0");
    expect(loadRailCollapsed()).toBe(false);
  });

  it("treats any value other than \"1\" as EXPANDED (junk-tolerant)", async () => {
    const { loadRailCollapsed, RAIL_COLLAPSED_KEY } =
      await import("../src/ui/explore/useRailWidth.js");
    ls.setItem(RAIL_COLLAPSED_KEY, "yes");
    expect(loadRailCollapsed()).toBe(false);
  });

  it("is INDEPENDENT of the dragged width (collapse is lossless)", async () => {
    const { saveRailWidth, loadRailWidth, saveRailCollapsed, loadRailCollapsed } =
      await import("../src/ui/explore/useRailWidth.js");
    saveRailWidth(380);          // user drags the rail wide
    saveRailCollapsed(true);     // then folds it
    // the width is preserved verbatim — re-opening restores 380, not 0/default
    expect(loadRailWidth()).toBe(380);
    expect(loadRailCollapsed()).toBe(true);
    saveRailCollapsed(false);    // re-open
    expect(loadRailWidth()).toBe(380);
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
