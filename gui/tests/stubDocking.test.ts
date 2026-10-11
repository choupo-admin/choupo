/*---------------------------------------------------------------------------*\
  A DOCKED STUB IS AN ANNOTATION OF ITS UNIT (DEV.md 4c C59, the stub
  follow-up, 2026-10-11).

  Vítor opened plant/greenAmmoniaFeasibility50bar on the live site after C59
  and saw "the location of the utilities is a big mess": every DUTY stub in
  one row across the top of the canvas, far from its unit, and the three
  coolers labelled "heating" before any run.  Cause: the pre-C59 canvas had
  saved EVERY node -- stubs included, at the automatic position of a unit
  the case's `.cho` had moved elsewhere -- into a `choupo.layouts.v1`
  working copy, and C59 honoured that copy whole.

  Pinned here, as pure functions over the real case:
    (1) a stub's position is its unit's plus an offset, in every source of
        an arrangement (none, a curated `.cho`, a working copy, a v1 copy);
    (2) a v1 copy is set aside, not applied, and can be restored -- its
        stubs never come back at the coordinates nobody chose;
    (3) a stub follows its unit when the unit is dragged, and a stub the
        reader dragged keeps HIS offset and still follows;
    (4) before a run a duty claims only the sign its declaration implies.
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph, type FlowsheetGraph } from "../src/case/toGraph.js";
import type { XY } from "../src/case/flowsheetLayout.js";
import {
  automaticStubOffsets, dockStubs, isStubId, resolveArrangement, splitStubPositions,
  stubNodeId, stubOwnerOf,
} from "../src/case/stubDocking.js";
import { preRunDutyTier } from "../src/case/dutySign.js";
import type { UnitSpec } from "../src/case/types.js";
import {
  layoutFromChoText, layoutToChoText, loadLayout, loadLegacyLayout, mergeLayouts, migrateV1,
  restoreLegacyLayout, saveLayout, snapshotLayout,
} from "../src/state/layout.js";
import { legacyPositions } from "./layoutLegacy.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CASE = join(HERE, "..", "..", "tutorials", "plant", "greenAmmoniaFeasibility50bar");

/** The case as the canvas receives it: every text file, keyed relative to
 *  the case root (run outputs left out). */
function caseFiles(dir: string, base: string, out: { [rel: string]: string }): void {
  for (const nm of readdirSync(dir)) {
    if (/^(converged|design|reports|iterations|expected|curation)$/.test(nm)) continue;
    const p = join(dir, nm);
    const st = statSync(p);
    if (st.isDirectory()) caseFiles(p, base, out);
    else if (!nm.endsWith(".md")) out[relative(base, p)] = readFileSync(p, "utf8");
  }
}
function ammoniaGraph(): FlowsheetGraph {
  const raw: { [rel: string]: string } = {};
  caseFiles(CASE, CASE, raw);
  const fs = toJson(parse(raw["system/flowsheetDict"]!, { sourceName: "flowsheetDict" })) as JsonDict;
  return flowsheetToGraph(fs, raw);
}
const G = ammoniaGraph();
const IDS = G.nodes.map((n) => n.id);
const AUTO = new Map(G.nodes.map((n) => [n.id, n.position]));
const SIZE = (id: string) => {
  const s = G.sizes.get(id) ?? { width: 190, height: 84 };
  return { w: s.width, h: s.height };
};
const NB = new Map<string, string[]>();
for (const e of G.edges) {
  NB.set(e.source, [...(NB.get(e.source) ?? []), e.target]);
  NB.set(e.target, [...(NB.get(e.target) ?? []), e.source]);
}
const STUBS = IDS.filter(isStubId);

/** Every stub sits within one stub-gap of its unit's box (the automatic
 *  docking: centred on the unit, just above or just below). */
function expectDocked(pos: Map<string, XY>, offsets: { [id: string]: XY } = {}) {
  expect(STUBS.length).toBeGreaterThan(5);
  for (const id of STUBS) {
    const owner = stubOwnerOf(id)!;
    const p = pos.get(id)!;
    const o = pos.get(owner)!;
    const off = offsets[id] ?? { x: AUTO.get(id)!.x - AUTO.get(owner)!.x,
                                  y: AUTO.get(id)!.y - AUTO.get(owner)!.y };
    expect({ id, x: p.x - o.x, y: p.y - o.y }).toEqual({ id, x: off.x, y: off.y });
    expect(Math.abs(p.y - o.y), `${id} is far from ${owner}`).toBeLessThan(200);
  }
}

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("stub ids", () => {
  it("are minted and read back in one place", () => {
    expect(stubNodeId("Chiller", "Q")).toBe("duty:Chiller:Q");
    expect(stubOwnerOf("duty:Chiller:Q")).toBe("unit:Chiller");
    expect(stubOwnerOf("duty:a:b:power")).toBe("unit:a:b");
    expect(stubOwnerOf("unit:Chiller")).toBeUndefined();
    expect(stubOwnerOf("stream:duty")).toBeUndefined();
  });
});

describe("(1) a stub is where its unit is, whatever the arrangement", () => {
  it("(a) no arrangement: the automatic layout, stubs docked", () => {
    expectDocked(resolveArrangement(IDS, AUTO, { nodes: {} }, SIZE, (id) => NB.get(id) ?? []));
  });

  it("a stub absolute position that reached `nodes` is never honoured", () => {
    const nodes: { [id: string]: XY } = {};
    for (const id of IDS) nodes[id] = { x: AUTO.get(id)!.x + 500, y: AUTO.get(id)!.y };
    for (const id of STUBS) nodes[id] = { x: 1, y: 1 };       // nobody's choice
    expectDocked(resolveArrangement(IDS, AUTO, { nodes }, SIZE, (id) => NB.get(id) ?? []));
  });

  it("a schema-1 .cho's absolute stubs become offsets from the same marker's units", () => {
    const abs = { "unit:A": { x: 100, y: 100 }, "duty:A:Q": { x: 130, y: -20 },
                  "duty:Z:Q": { x: 0, y: 0 } };            // owner absent -> dropped
    expect(splitStubPositions(abs)).toEqual({
      nodes: { "unit:A": { x: 100, y: 100 } }, stubs: { "duty:A:Q": { x: 30, y: -120 } } });
    const l = layoutFromChoText(JSON.stringify({ choupoLayout: 1, nodes: abs }));
    expect(l.nodes).toEqual({ "unit:A": { x: 100, y: 100 } });
    expect(l.stubs).toEqual({ "duty:A:Q": { x: 30, y: -120 } });
    // ...and round-trips through a schema-2 marker.
    const back = layoutFromChoText(layoutToChoText(l));
    expect(back.nodes).toEqual(l.nodes);
    expect(back.stubs).toEqual(l.stubs);
  });

  it("a snapshot never stores a stub absolutely, only the offsets the reader chose", () => {
    const snap = snapshotLayout(
      [{ id: "unit:A", position: { x: 5, y: 6 } }, { id: "duty:A:Q", position: { x: 9, y: 9 } }],
      {}, {}, undefined, { "duty:A:Q": { x: 0, y: -90 } });
    expect(snap.nodes).toEqual({ "unit:A": { x: 5, y: 6 } });
    expect(snap.stubs).toEqual({ "duty:A:Q": { x: 0, y: -90 } });
  });
});

describe("(2) a v1 working copy, written the way the old canvas wrote it", () => {
  beforeEach(() => { (globalThis as Record<string, unknown>).localStorage = fakeStorage(); });
  afterEach(() => { delete (globalThis as Record<string, unknown>).localStorage; });

  // The old canvas saved EVERY node: here the units where a machine-written
  // .cho had put them (a serpentine, shifted) and the stubs where the old
  // automatic layout docked them on a unit that was no longer there.
  const legacy = legacyPositions(G);
  const v1Nodes: { [id: string]: XY } = {};
  IDS.forEach((id, i) => {
    const p = legacy.get(id)!;
    v1Nodes[id] = isStubId(id) ? { x: p.x, y: p.y }
      : { x: 320 * (i % 6), y: 260 * Math.floor(i / 6) };
  });
  const V1 = { "plant/greenAmmoniaFeasibility50bar": { nodes: v1Nodes, edges: { e: { x: 1, y: 2 } },
                                                       handles: {} } };

  it("the v1 stubs WERE far from their units (the defect, reproduced)", () => {
    const far = STUBS.filter((id) => {
      const o = v1Nodes[stubOwnerOf(id)!]!;
      const p = v1Nodes[id]!;
      return Math.hypot(p.x - o.x, p.y - o.y) > 400;
    });
    expect(far.length).toBeGreaterThan(STUBS.length / 2);
  });

  it("is set aside, not applied: the case opens on the automatic layout with stubs docked", () => {
    localStorage.setItem("choupo.layouts.v1", JSON.stringify(V1));
    const working = loadLayout("plant/greenAmmoniaFeasibility50bar");
    expect(working.nodes).toEqual({});
    const l = mergeLayouts(working, layoutFromChoText(""));
    expectDocked(resolveArrangement(IDS, AUTO, l, SIZE, (id) => NB.get(id) ?? []));
    // Migrated ONCE, under the new key; the v1 store is left untouched.
    expect(localStorage.getItem("choupo.layouts.v2")).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("choupo.layouts.v1")!)).toEqual(V1);
    // The set-aside copy carries no stub.
    const kept = loadLegacyLayout("plant/greenAmmoniaFeasibility50bar")!;
    expect(Object.keys(kept.nodes).some(isStubId)).toBe(false);
    expect(Object.keys(kept.nodes).length).toBe(IDS.length - STUBS.length);
  });

  it("restored, it brings the reader's units back -- and docks every stub on its unit", () => {
    localStorage.setItem("choupo.layouts.v1", JSON.stringify(V1));
    expect(restoreLegacyLayout("plant/greenAmmoniaFeasibility50bar")).toBe(true);
    expect(loadLegacyLayout("plant/greenAmmoniaFeasibility50bar")).toBeUndefined();
    const l = mergeLayouts(loadLayout("plant/greenAmmoniaFeasibility50bar"), layoutFromChoText(""));
    const pos = resolveArrangement(IDS, AUTO, l, SIZE, (id) => NB.get(id) ?? []);
    for (const id of IDS.filter((i) => !isStubId(i))) expect(pos.get(id)).toEqual(v1Nodes[id]);
    expectDocked(pos);
  });

  it("migrates a store with no nodes to nothing worth restoring", () => {
    expect(migrateV1({ a: { nodes: { "duty:A:Q": { x: 1, y: 1 } } } }).legacy).toEqual({});
  });
});

describe("(3) a stub follows its unit", () => {
  const auto = automaticStubOffsets(IDS, AUTO);
  const unit = "unit:Chiller";
  const stub = "duty:Chiller:Q";

  it("(c) a dragged unit carries its stubs; nothing else moves", () => {
    const pos = resolveArrangement(IDS, AUTO, { nodes: {} }, SIZE, (id) => NB.get(id) ?? []);
    const before = new Map(pos);
    pos.set(unit, { x: pos.get(unit)!.x + 400, y: pos.get(unit)!.y + 250 });
    const after = dockStubs(pos, STUBS, auto, {});
    expectDocked(after);
    expect(after.get(stub)).toEqual({ x: before.get(stub)!.x + 400, y: before.get(stub)!.y + 250 });
    for (const id of STUBS.filter((s) => stubOwnerOf(s) !== unit))
      expect(after.get(id)).toEqual(before.get(id));
  });

  it("a stub the reader dragged keeps HIS offset and still follows the unit", () => {
    const mine = { [stub]: { x: 260, y: 10 } };
    const pos = resolveArrangement(IDS, AUTO, { nodes: {}, stubs: mine }, SIZE, (id) => NB.get(id) ?? []);
    expectDocked(pos, mine);
    pos.set(unit, { x: 3000, y: 3000 });
    expect(dockStubs(pos, STUBS, auto, mine).get(stub)).toEqual({ x: 3260, y: 3010 });
  });

  it("a stub being dragged right now is left free", () => {
    const pos = new Map(AUTO);
    pos.set(stub, { x: -7, y: -7 });
    expect(dockStubs(pos, STUBS, auto, {}, new Set([stub])).get(stub)).toEqual({ x: -7, y: -7 });
  });

  it("a working copy saved after a drag carries no stub, and reopens docked", () => {
    (globalThis as Record<string, unknown>).localStorage = fakeStorage();
    try {
      const pos = resolveArrangement(IDS, AUTO, { nodes: {} }, SIZE, (id) => NB.get(id) ?? []);
      pos.set(unit, { x: 9999, y: 50 });
      const drawn = [...dockStubs(pos, STUBS, auto, {})].map(([id, position]) => ({ id, position }));
      saveLayout("c", snapshotLayout(drawn, {}, {}));
      const l = loadLayout("c");
      expect(Object.keys(l.nodes).some(isStubId)).toBe(false);
      const re = resolveArrangement(IDS, AUTO, l, SIZE, (id) => NB.get(id) ?? []);
      expectDocked(re);
      expect(re.get(unit)).toEqual({ x: 9999, y: 50 });
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
});

describe("(4) before a run a duty claims only the sign its declaration implies", () => {
  const tierOf = (unit: string) =>
    (G.nodes.find((n) => n.id === `duty:${unit}:Q`)?.data as { tier?: string } | undefined)?.tier;

  it("the three coolers of the 50 bar loop read cooling, from outletT below a declared inlet T", () => {
    // Converter (isothermal Gibbs, T 400 C) -> EffluentCooler 72 C -> WaterCooler -> Chiller -20 C.
    expect(tierOf("EffluentCooler")).toBe("cooling");
    expect(tierOf("WaterCooler")).toBe("cooling");
    expect(tierOf("Chiller")).toBe("cooling");
  });

  it("no stub reads heating unless something declares it; the rest are neutral", () => {
    const tiers = STUBS.filter((id) => id.endsWith(":Q"))
      .map((id) => (G.nodes.find((n) => n.id === id)!.data as { tier: string }).tier);
    expect(tiers).not.toContain("heating");
    // A unit whose inlet is a mixer or a compressor outlet: the sign is the run's.
    expect(tierOf("FeedPreheater")).toBe("unknown");
    expect(tierOf("Converter")).toBe("unknown");
    expect(tierOf("LetdownHP")).toBe("unknown");
  });

  it("the stub, its wire and the unit's anchor agree on the side", () => {
    for (const unit of ["EffluentCooler", "FeedPreheater"]) {
      const u = G.nodes.find((n) => n.id === `unit:${unit}`)!.data as { dutyQSide?: string };
      const s = G.nodes.find((n) => n.id === `duty:${unit}:Q`)!.data as { dockSide?: string };
      expect(s.dockSide).toBe(u.dutyQSide);
      const above = G.nodes.find((n) => n.id === `duty:${unit}:Q`)!.position.y
                  < G.nodes.find((n) => n.id === `unit:${unit}`)!.position.y;
      expect(above).toBe(u.dutyQSide === "above");
    }
  });

  const unit = (type: string, op: JsonDict, ins: string[] = ["s"]): UnitSpec =>
    ({ name: "U", type, in: ins, outputs: ["o"], operation: op });
  const ctx = (streams: { [n: string]: number }, producers: [string, UnitSpec][] = []) => ({
    producers: new Map(producers.map(([s, u]) => [s, u.name])),
    unitsByName: new Map(producers.map(([, u]) => [u.name, u])),
    streams: Object.fromEntries(Object.entries(streams).map(([n, T]) =>
      [n, { F: 1, T, P: 1e5, composition: {} }])),
  });

  it("a declared Q is the sign; a phaseChanger on a plant feed compares with the feed's own T", () => {
    expect(preRunDutyTier(unit("heater", { Q: "-50 kW" }), ctx({}))).toBe("cooling");
    expect(preRunDutyTier(unit("heater", { Q: 2000 }), ctx({}))).toBe("heating");
    expect(preRunDutyTier(unit("phaseChanger", { outletT: "400 K" }), ctx({ s: 300 }))).toBe("heating");
    expect(preRunDutyTier(unit("phaseChanger", { outletT: "250 K" }), ctx({ s: 300 }))).toBe("cooling");
    expect(preRunDutyTier(unit("phaseChanger", { outletState: "saturatedVapour" }), ctx({ s: 300 })))
      .toBe("unknown");
    expect(preRunDutyTier(unit("cooler", {}), ctx({}))).toBe("cooling");
    expect(preRunDutyTier(unit("cstr", {}), ctx({}))).toBe("unknown");
  });

  it("a PRODUCED stream's 0/ temperature is a seed, never read as a declaration", () => {
    const mixer: UnitSpec = { name: "M", type: "mixer", in: ["a"], outputs: ["s"], operation: {} };
    // 0/s says 900 K, but s is the mixer's product: the sign is unknown.
    expect(preRunDutyTier(unit("phaseChanger", { outletT: "300 K" }), ctx({ s: 900 }, [["s", mixer]])))
      .toBe("unknown");
    const flash: UnitSpec = { name: "F", type: "isothermalFlash", in: ["a"], outputs: ["s"],
                              operation: { T: "350 K" } };
    expect(preRunDutyTier(unit("phaseChanger", { outletT: "300 K" }), ctx({ s: 900 }, [["s", flash]])))
      .toBe("cooling");
  });
});
