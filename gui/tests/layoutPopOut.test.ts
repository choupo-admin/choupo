/*---------------------------------------------------------------------------*\
  The 3D layout pop-out (DEV.md 4c C78): the stash, the route and the expiry
  (case/layoutPopOut.ts, pure), the isolated-tab boot of `?layout=`, and the
  wiring that puts the button only where a layout block exists.

  Modelled on focusBoot.test.ts (the `?focus=` stash: stable, never consumed,
  expiry honest) -- the `?internals=` precedent C78 follows.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlantLayout, RunResult } from "../src/adapters/SolverAdapter.js";
import {
  canPopOutLayout, caseLayoutStash, followedCaseStash, layoutKeyOf,
  layoutTabKey, layoutTabStaleness, layoutTabTitle, layoutTabUrl, layoutViewOf,
  readLayoutStash, refreshLayoutStash, stashDrawsView, writeLayoutStash,
  type LayoutPopOutStash,
} from "../src/case/layoutPopOut.js";
import { declaredInputsOf } from "../src/case/staleness.js";
import type { CaseFiles } from "../src/case/types.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

const LAYOUT: PlantLayout = {
  items: [
    { id: "separator", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 56, y: -6, z: 0,
      dx: 2.6, dy: 2.6, dz: 7.9 },
    { id: "letdown", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 59.5, y: -6, z: 0,
      dx: 0.58, dy: 0.58, dz: 1.75 },
  ],
  areas: [],
  separation: [],
  findings: [
    { id: "separation:separator:letdown", kind: "separation", a: "separator", b: "letdown",
      value: 1.89, limit: 4, message: "too close" },
  ],
  unplaced: [], internal: [],
};

const RAN = { fingerprint: "0badf00d", edits: { "units[0].operation.T": "300 K" } };

const CASE_FILES: CaseFiles = { controlDict: { application: "choupoSolve" }, thermoPackage: {} };

function stash(over: Partial<LayoutPopOutStash> = {}): LayoutPopOutStash {
  return { v: 1, source: "case", caseName: "plant/ammonia02_full_plant",
           layout: LAYOUT, ran: RAN, declared: RAN, ...over };
}

function memStore() {
  const m = new Map<string, string>();
  let writes = 0;
  return {
    m,
    get writes() { return writes; },
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { writes++; m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
  };
}

// ---- the button exists only where there is a layout to draw -----------------

describe("canPopOutLayout: the button's condition", () => {
  it("no block, an empty block, or a block with no items offers nothing", () => {
    expect(canPopOutLayout(undefined)).toBe(false);
    expect(canPopOutLayout(null)).toBe(false);
    expect(canPopOutLayout({ ...LAYOUT, items: [] })).toBe(false);
  });
  it("a block the engine published with placed items offers the pop-out", () => {
    expect(canPopOutLayout(LAYOUT)).toBe(true);
  });
  it("the Reports button sits in the section body, which exists only with a scene", () => {
    const reports = tree("gui/src/ui/ReportsWorkspace.tsx");
    //  the section (and so its button) is drawn only when the scene exists.
    expect(reports).toContain("layout: scene !== null,");
    expect(reports).toContain("layout:     () => (scene && layout ? <LayoutBody");
    const body = reports.slice(reports.indexOf("function LayoutBody"),
                               reports.indexOf("/*  ---- Equipment sheets"));
    expect(body).toMatch(/<Button[\s\S]*?onClick=\{\(\) => popOutCaseLayout\("plot"\)\}/);
    //  and nowhere else in the workspace offers it.
    expect(reports.split('popOutCaseLayout("plot")').length - 1).toBe(1);
    //  The GMP section's own button opens the SAME stash in its building
    //  view (C100), and only where the case declares a building.
    expect(body).toMatch(/\{building && <GmpBuildingSection[\s\S]*?onPopOut=\{\(\) => popOutCaseLayout\("building"\)\}/);
    expect(reports.split('popOutCaseLayout("building")').length - 1).toBe(1);
  });
  it("the case stash is null unless a case is open, the run is done and its layout is drawable", () => {
    const view = { tutorialName: "plant/x", runResult: { status: "done", layout: LAYOUT } as unknown as RunResult,
                   runInputs: RAN, caseFiles: CASE_FILES, scratchEdits: {} };
    expect(caseLayoutStash(view)).not.toBeNull();
    expect(caseLayoutStash({ ...view, tutorialName: "" })).toBeNull();
    expect(caseLayoutStash({ ...view, runResult: null })).toBeNull();
    expect(caseLayoutStash({ ...view,
      runResult: { status: "error", layout: LAYOUT } as unknown as RunResult })).toBeNull();
    expect(caseLayoutStash({ ...view,
      runResult: { status: "done" } as unknown as RunResult })).toBeNull();
    expect(caseLayoutStash({ ...view,
      runResult: { status: "done", layout: { ...LAYOUT, items: [] } } as unknown as RunResult })).toBeNull();
  });
  it("the case stash carries the engine's block verbatim, the run's stamp and the case declared now", () => {
    const view = { tutorialName: "plant/x", runResult: { status: "done", layout: LAYOUT } as unknown as RunResult,
                   runInputs: RAN, caseFiles: CASE_FILES, scratchEdits: {} };
    const s = caseLayoutStash(view)!;
    expect(s.layout).toBe(LAYOUT);
    expect(s.ran).toBe(RAN);
    expect(s.declared).toEqual(declaredInputsOf(CASE_FILES, {}));
    expect(s.source).toBe("case");
    expect(s.caseName).toBe("plant/x");
  });
  it("the bench button exists only beside a drawn scene of an unrefused, finished run", () => {
    const bench = tree("gui/src/ui/methods/PlantLayoutTool.tsx");
    expect(bench).toMatch(/if \(run\.busy \|\| run\.err !== null \|\| !built\.current\) return null;/);
    expect(bench).toMatch(/if \(!canPopOutLayout\(lay\)\) return null;/);
    expect(bench).toMatch(/\{popStash && \([\s\S]*?openLayoutPopOut\(popStash\)/);
  });
});

// ---- the key and the route --------------------------------------------------

describe("the stable key and the ?layout= route", () => {
  it("one key per source, its own prefix, never colliding with another family", () => {
    const k = layoutTabKey("case", "plant/ammonia02_full_plant");
    expect(k).toBe("choupo.layoutTab.case.plant/ammonia02_full_plant");
    expect(layoutTabKey("bench", "plant/ammonia02_full_plant")).not.toBe(k);
    expect(k.startsWith("choupo.focus.") || k.startsWith("choupo.internals.")).toBe(false);
  });
  it("the URL carries the key and the route reads it back, slashes and all", () => {
    const k = layoutTabKey("case", "local:/home/me/my case");
    const url = layoutTabUrl("/app/", k);
    expect(url.startsWith("/app/?layout=")).toBe(true);
    expect(layoutKeyOf(url.slice(url.indexOf("?")))).toBe(k);
  });
  it("an address with no layout key is not a layout tab", () => {
    expect(layoutKeyOf("")).toBeNull();
    expect(layoutKeyOf("?internals=choupo.internals.F1")).toBeNull();
    expect(layoutKeyOf("?layout=")).toBeNull();
  });
  it("AppShell routes ?layout= to the tab, lazily, before the bootExpired branch", () => {
    const shell = tree("gui/src/ui/AppShell.tsx");
    expect(shell).toMatch(/const LayoutPopOutTab = lazy\(\(\) =>\s*import\("\.\/LayoutPopOutTab\.js"\)/);
    const route = shell.indexOf("layoutKeyOf(window.location.search) !== null");
    const expired = shell.indexOf("if (bootExpired) {");
    expect(route).toBeGreaterThan(0);
    expect(route).toBeLessThan(expired);
  });
  it("three.js stays out of the static import graph of the tab and the shell", () => {
    for (const rel of ["gui/src/ui/LayoutPopOutTab.tsx", "gui/src/ui/AppShell.tsx",
                       "gui/src/ui/PlantLayoutTables.tsx"])
      expect(tree(rel)).not.toMatch(/^import [^;]*from "three/m);
    //  the scene component imports three.js (and its addons, C88) only at
    //  draw time: a dynamic import, never a static one.
    const scene3d = tree("gui/src/ui/plotting/PlantLayout3D.tsx");
    expect(scene3d).toContain('import("three")');
    expect(scene3d).not.toMatch(/^import [^;]*from "three/m);
  });
  it("the tab reuses the ONE mapping and the ONE scene component", () => {
    const tab = tree("gui/src/ui/LayoutPopOutTab.tsx");
    expect(tab).toContain('import { layoutScene, type LayoutScene } from "../case/plantLayout.js";');
    expect(tab).toContain('import { PlantLayout3D } from "./plotting/PlantLayout3D.js";');
    //  C100: the plot plan draws the building through the ONE overlay the
    //  Reports view uses -- glass shell, rooms, flows, toggles.
    expect(tab).toContain("const overlay = useBuildingOverlay(stash.building, scene);");
    expect(tab).toMatch(/<PlantLayout3D scene=\{overlay\.shown\} height="fill" extend=\{overlay\.extend\}\s+toolbarExtra=\{overlay\.toggles\} \/>/);
    expect(tab).not.toContain("<PlantLayout3D scene={scene}");
    //  C91: the tables in their bottom panel, each a section the reader folds.
    expect(tab).toContain("<PlantLayoutTables layout={stash.layout} sectioned />");
  });
  it("the building view draws the GMP section itself -- no second renderer (C100)", () => {
    const tab = tree("gui/src/ui/LayoutPopOutTab.tsx");
    expect(tab).toContain("<GmpBuildingSection building={building} scene={scene} items={stash.layout.items}");
    //  no button to pop out of the pop-out
    expect(tab).not.toContain("onPopOut=");
    //  a stash with no building refuses the building view, never draws the plot plan under it
    expect(tab).toContain(
      'if (!stashDrawsView(stash, view)) return <ExpiredTabPanel kind="building" />;');
    expect(tree("gui/src/ui/ExpiredTabPanel.tsx")).toContain('kind === "building" ? "GMP building"');
    //  the section's 3D cutaway is the plot plan's view, extended through the one hook
    const section = tree("gui/src/ui/GmpBuildingSection.tsx");
    expect(section).toContain("<PlantLayout3D scene={shown} height={viewHeight} extend={extend} toolbarExtra={toggles} />");
    expect(section).toMatch(/\{onPopOut && \([\s\S]*?onClick=\{onPopOut\}/);
  });
});

describe("the building view of the same stash (C100)", () => {
  it("the plot plan's address is unchanged; the building view adds view=building", () => {
    const k = layoutTabKey("case", "batch/plant/apalutamide01_tablets");
    expect(layoutTabUrl("/app/", k)).toBe(layoutTabUrl("/app/", k, "plot"));
    expect(layoutTabUrl("/app/", k)).not.toContain("view=");
    const url = layoutTabUrl("/app/", k, "building");
    expect(url.endsWith("&view=building")).toBe(true);
    //  ONE key: the same route (AppShell's layoutKeyOf) opens both views.
    expect(layoutKeyOf(url.slice(url.indexOf("?")))).toBe(k);
    expect(layoutViewOf(url.slice(url.indexOf("?")))).toBe("building");
  });
  it("any address but view=building is the plot plan, so old addresses read as before", () => {
    expect(layoutViewOf("?layout=k")).toBe("plot");
    expect(layoutViewOf("?layout=k&view=")).toBe("plot");
    expect(layoutViewOf("?layout=k&view=plot")).toBe("plot");
    expect(layoutViewOf("?layout=k&view=Building")).toBe("plot");
  });
  it("the building view needs a building in the stash; the plot plan never does", () => {
    const b = { name: "productionBuilding" } as unknown as LayoutPopOutStash["building"];
    expect(stashDrawsView(stash(), "plot")).toBe(true);
    expect(stashDrawsView(stash(), "building")).toBe(false);
    expect(stashDrawsView(stash({ building: b }), "building")).toBe(true);
  });
  it("the title names the view", () => {
    const b = { name: "productionBuilding" } as unknown as LayoutPopOutStash["building"];
    expect(layoutTabTitle(stash({ building: b }), "building"))
      .toBe("ammonia02_full_plant · GMP building productionBuilding · run 0badf00d");
    expect(layoutTabTitle(stash({ building: b }))).toBe("ammonia02_full_plant · layout 3D · run 0badf00d");
    //  no building: the title never claims one
    expect(layoutTabTitle(stash(), "building")).toBe("ammonia02_full_plant · layout 3D · run 0badf00d");
  });
  it("opening refuses a view the stash cannot draw, and passes the view to the address", () => {
    const hook = tree("gui/src/state/useLayoutPopOut.ts");
    expect(hook).toContain("if (!stashDrawsView(stash, view)) return;");
    expect(hook).toContain("layoutTabUrl(window.location.pathname, key, view)");
  });
});

// ---- the stash: stable, never consumed, honest on expiry --------------------

describe("the stash", () => {
  it("round-trips and is NEVER consumed -- F5 reproduces the tab", () => {
    const ls = memStore();
    const key = writeLayoutStash(ls, stash());
    expect(key).toBe(layoutTabKey("case", "plant/ammonia02_full_plant"));
    const a = readLayoutStash(ls, key);
    const b = readLayoutStash(ls, key);   // the F5
    expect(a).toEqual(stash());
    expect(b).toEqual(stash());
    expect(ls.getItem(key)).not.toBeNull();
  });
  it("latest pop-out wins: a second write replaces the first under the same key", () => {
    const ls = memStore();
    writeLayoutStash(ls, stash());
    const key = writeLayoutStash(ls, stash({ ran: { fingerprint: "feedface", edits: {} } }));
    expect(ls.m.size).toBe(1);
    expect(readLayoutStash(ls, key)?.ran?.fingerprint).toBe("feedface");
  });
  it("gone, corrupt, another version or an undrawable block reads as EXPIRED", () => {
    const ls = memStore();
    const key = layoutTabKey("case", "x");
    expect(readLayoutStash(ls, key)).toBeNull();                                   // gone
    ls.setItem(key, "{not json");
    expect(readLayoutStash(ls, key)).toBeNull();                                   // corrupt
    ls.setItem(key, JSON.stringify({ ...stash(), v: 2 }));
    expect(readLayoutStash(ls, key)).toBeNull();                                   // version
    ls.setItem(key, JSON.stringify(stash({ layout: { ...LAYOUT, items: [] } })));
    expect(readLayoutStash(ls, key)).toBeNull();                                   // nothing to draw
    ls.setItem(key, JSON.stringify({ ...stash(), ran: { fingerprint: 3 } }));
    expect(readLayoutStash(ls, key)).toBeNull();                                   // bad stamp
    ls.setItem(key, "null");
    expect(readLayoutStash(ls, key)).toBeNull();
  });
  it("a storage that throws reads as expired, never as an exception", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
    expect(readLayoutStash(bad, "k")).toBeNull();
    expect(refreshLayoutStash(bad, stash())).toBe(false);
  });
  it("the tab's expired panel names the way back to the parent", () => {
    const panel = tree("gui/src/ui/ExpiredTabPanel.tsx");
    expect(panel).toContain('kind === "layout" ? "3D plant layout"');
    expect(panel).toContain("Plant layout (3D)");
    const tab = tree("gui/src/ui/LayoutPopOutTab.tsx");
    expect(tab).toContain('if (!stash || !scene) return <ExpiredTabPanel kind="layout" />;');
  });
});

// ---- following the parent -----------------------------------------------------

describe("refreshLayoutStash: an open tab follows its parent", () => {
  it("writes NOTHING where no pop-out was ever opened", () => {
    const ls = memStore();
    expect(refreshLayoutStash(ls, stash())).toBe(false);
    expect(ls.m.size).toBe(0);
  });
  it("followedCaseStash: a new drawable run replaces the drawn plan", () => {
    const prev = stash({ caseName: "plant/x" });
    const newer: PlantLayout = { ...LAYOUT, findings: [] };
    const next = followedCaseStash({ tutorialName: "plant/x",
      runResult: { status: "done", layout: newer } as unknown as RunResult,
      runInputs: { fingerprint: "11111111", edits: {} }, caseFiles: CASE_FILES, scratchEdits: {} }, prev)!;
    expect(next.layout).toBe(newer);
    expect(next.ran?.fingerprint).toBe("11111111");
  });
  it("followedCaseStash: with no drawable result the plan is KEPT and only the declared case moves", () => {
    const prev = stash({ caseName: "plant/x" });
    const next = followedCaseStash({ tutorialName: "plant/x", runResult: null, runInputs: null,
      caseFiles: CASE_FILES, scratchEdits: {} }, prev)!;
    expect(next.layout).toEqual(prev.layout);
    expect(next.ran).toEqual(prev.ran);
    expect(next.declared).toEqual(declaredInputsOf(CASE_FILES, {}));
    //  CASE_FILES is not the case RAN was stamped from, so the tab dims.
    expect(layoutTabStaleness(next).stale).toBe(true);
  });
  it("followedCaseStash: no stash, another case or the bench's stash -> write nothing", () => {
    const view = { tutorialName: "plant/x", runResult: null, runInputs: null,
                   caseFiles: CASE_FILES, scratchEdits: {} };
    expect(followedCaseStash(view, null)).toBeNull();
    expect(followedCaseStash(view, stash({ caseName: "plant/y" }))).toBeNull();
    expect(followedCaseStash(view, stash({ caseName: "plant/x", source: "bench" }))).toBeNull();
    expect(followedCaseStash({ ...view, tutorialName: "" }, stash({ caseName: "" }))).toBeNull();
  });
  it("the main shell mounts the follower; the bench follows its own runs", () => {
    expect(tree("gui/src/ui/AppShell.tsx")).toContain("useLayoutPopOutFollow();");
    expect(tree("gui/src/ui/methods/PlantLayoutTool.tsx"))
      .toContain("refreshLayoutStash(window.localStorage, popStash)");
  });
  it("rewrites an existing stash when the content moved, and only then", () => {
    const ls = memStore();
    const key = writeLayoutStash(ls, stash());
    const w0 = ls.writes;
    expect(refreshLayoutStash(ls, stash())).toBe(false);          // unchanged: no write,
    expect(ls.writes).toBe(w0);                                     // so no storage event
    const moved = stash({ declared: { fingerprint: "c0ffee00", edits: {} } });
    expect(refreshLayoutStash(ls, moved)).toBe(true);
    expect(readLayoutStash(ls, key)?.declared?.fingerprint).toBe("c0ffee00");
  });
});

// ---- staleness: the parent's ONE decision -------------------------------------

describe("layoutTabStaleness: dims exactly as the parent does", () => {
  it("the declared case is the run's case -> not stale", () => {
    expect(layoutTabStaleness(stash())).toEqual({ stale: false, pendingEdits: 0 });
  });
  it("the declared case moved -> stale, counting the knobs moved", () => {
    const s = stash({ declared: { fingerprint: "deadbeef", edits: { "units[0].operation.T": "310 K" } } });
    expect(layoutTabStaleness(s)).toEqual({ stale: true, pendingEdits: 1 });
  });
  it("the case FILES moved under an unmoved overlay -> stale with no count", () => {
    const s = stash({ declared: { fingerprint: "deadbeef", edits: RAN.edits } });
    expect(layoutTabStaleness(s)).toEqual({ stale: true, pendingEdits: 0 });
  });
  it("no declared (the bench) or no stamp (an inherited result) -> no claim", () => {
    expect(layoutTabStaleness(stash({ source: "bench", declared: null })).stale).toBe(false);
    expect(layoutTabStaleness(stash({ ran: null,
      declared: { fingerprint: "deadbeef", edits: {} } })).stale).toBe(false);
  });
  it("the tab dims its body with the parent's own class, the reason outside it", () => {
    const tab = tree("gui/src/ui/LayoutPopOutTab.tsx");
    expect(tab).toContain('className={stale.stale ? "choupo-stale-body" : undefined}');
    expect(tree("gui/src/ui/AppShell.tsx")).toContain('"choupo-stale-body"');
  });
});

// ---- the title --------------------------------------------------------------

describe("layoutTabTitle: which case, and which run", () => {
  it("the case leaf and the run's fingerprint", () => {
    expect(layoutTabTitle(stash())).toBe("ammonia02_full_plant · layout 3D · run 0badf00d");
  });
  it("the bench says it is the bench", () => {
    expect(layoutTabTitle(stash({ source: "bench" })))
      .toBe("ammonia02_full_plant (EduTools bench) · layout 3D · run 0badf00d");
  });
  it("a run with no stamp says so rather than inventing a fingerprint", () => {
    expect(layoutTabTitle(stash({ ran: null }))).toBe("ammonia02_full_plant · layout 3D · run not stamped");
  });
});

// ---- the boot: an isolated satellite tab --------------------------------------

//  Load the corpus modules ONCE (focusBoot.test.ts explains why).
import * as _tutorialsMod from "../src/cases/tutorials.js";
import * as _catalogueMod from "../src/case/catalogue.js";
import * as _pairsMod from "../src/case/pairsCatalogue.js";
const mockHeavyDataModules = () => {
  vi.doMock("../src/cases/tutorials.js", () => _tutorialsMod);
  vi.doMock("../src/case/catalogue.js", () => _catalogueMod);
  vi.doMock("../src/case/pairsCatalogue.js", () => _pairsMod);
};

describe("?layout= boot", () => {
  let ls: ReturnType<typeof memStore>;
  beforeEach(() => {
    vi.resetModules();
    mockHeavyDataModules();
    ls = memStore();
  });
  afterEach(async () => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
    await new Promise((r) => setTimeout(r, 25));
  });
  function seedWindow(search: string) {
    (globalThis as Record<string, unknown>).window = { localStorage: ls, location: { search }, innerHeight: 800 };
    (globalThis as Record<string, unknown>).localStorage = ls;
  }

  it("is an isolated tab: boots blank, restores no session, consumes nothing", async () => {
    const key = writeLayoutStash(ls, stash());
    ls.setItem("choupo.session.v1", JSON.stringify({
      caseRef: { kind: "tutorial", name: "steady/flash/flash01_benzene_toluene" },
      activeWorkspace: "reports", agentOpen: false }));
    seedWindow(`?layout=${encodeURIComponent(key)}`);
    const { useStore, isIsolatedTab } = await import("../src/state/store.js");
    expect(isIsolatedTab()).toBe(true);
    expect(useStore.getState().tutorialName).toBe("");
    expect(useStore.getState().bootExpired).toBeNull();   // the TAB decides its expiry
    expect(useStore.getState().activeWorkspace).not.toBe("reports");
    expect(ls.getItem(key)).not.toBeNull();
  });
});
