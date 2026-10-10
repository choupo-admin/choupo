/*---------------------------------------------------------------------------*\
  The automatic flowsheet layout (case/flowsheetLayout.ts, DEV.md 4c C59)
  and the rule that decides when it is used (state/layout.ts + FlowCanvas).

  Vítor, 2026-10-10: "the first time a case is opened, the flowsheet
  arrangement is done by you (the automatic layout); once the user has
  arranged it, you no longer move anything."  The last two describe blocks
  pin that sentence: a drag snapshots EVERY node, and a unit that appears
  later is placed beside its neighbours without moving a saved node.
\*---------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  layoutFlowsheet, placeUnsavedNodes,
  type LayoutEdge, type LayoutNode, type XY,
} from "../src/case/flowsheetLayout.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import type { JsonDict } from "../src/dict/index.js";
import {
  clearLayout, layoutFromChoText, loadLayout, mergeLayouts, saveLayout, snapshotLayout,
} from "../src/state/layout.js";

const box = (id: string, ins: string[] = [], outs: string[] = [], terminal = false): LayoutNode => ({
  id, width: 190, height: 84, terminal,
  ins: ins.map((p, i) => ({ id: p, frac: ins.length <= 1 ? 0.5 : 0.25 + 0.5 * i / (ins.length - 1) })),
  outs: outs.map((p, i) => ({ id: p, frac: outs.length <= 1 ? 0.5 : 0.25 + 0.5 * i / (outs.length - 1) })),
});
const edge = (id: string, s: string, t: string, p: string, kind: LayoutEdge["kind"] = "material"): LayoutEdge =>
  ({ id, source: s, target: t, sourcePort: p, targetPort: p, kind });
const portY = (n: LayoutNode, pos: XY, port: string, side: "in" | "out") =>
  pos.y + (side === "in" ? n.ins : n.outs).find((q) => q.id === port)!.frac * n.height;

describe("layoutFlowsheet", () => {
  it("draws a chain as ONE straight horizontal line, left to right", () => {
    const nodes = [box("F", [], ["a"], true), box("A", ["a"], ["b"]), box("B", ["b"], ["c"]),
                   box("C", ["c"], ["d"]), box("P", ["d"], [], true)];
    const edges = [edge("1", "F", "A", "a"), edge("2", "A", "B", "b"),
                   edge("3", "B", "C", "c"), edge("4", "C", "P", "d")];
    const l = layoutFlowsheet(nodes, edges);
    const ys = nodes.map((n) => l.positions.get(n.id)!.y);
    expect(new Set(ys).size).toBe(1);
    const xs = nodes.map((n) => l.positions.get(n.id)!.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("puts a feed consumed deep in the plant just before its consumer, a product just after its producer", () => {
    // F1 -> A -> B -> C -> D ; F2 feeds D ; B also leaves a purge P1
    const nodes = [box("F1", [], ["a"], true), box("F2", [], ["x"], true),
                   box("A", ["a"], ["b"]), box("B", ["b"], ["c", "p"]), box("C", ["c"], ["d"]),
                   box("D", ["d", "x"], ["e"]), box("P1", ["p"], [], true), box("P2", ["e"], [], true)];
    const edges = [edge("1", "F1", "A", "a"), edge("2", "A", "B", "b"), edge("3", "B", "C", "c"),
                   edge("4", "C", "D", "d"), edge("5", "F2", "D", "x"), edge("6", "B", "P1", "p"),
                   edge("7", "D", "P2", "e")];
    const l = layoutFlowsheet(nodes, edges);
    expect(l.layer.get("F2")).toBe(l.layer.get("D")! - 1);
    expect(l.layer.get("P1")).toBe(l.layer.get("B")! + 1);
    expect(l.layer.get("F1")).toBe(0);
  });

  it("takes a declared tear as the back edge and routes it clear of every box it spans", () => {
    // feed -> Mix -> R -> Sep -> prod ; Sep -> rec -> Mix (tear)
    const nodes = [box("feed", [], ["f"], true), box("Mix", ["f", "rec"], ["m"]),
                   box("R", ["m"], ["r"]), box("Sep", ["r"], ["rec", "p"]), box("prod", ["p"], [], true)];
    const edges = [edge("1", "feed", "Mix", "f"), edge("2", "Mix", "R", "m"), edge("3", "R", "Sep", "r"),
                   edge("tear", "Sep", "Mix", "rec", "tear"), edge("5", "Sep", "prod", "p")];
    const l = layoutFlowsheet(nodes, edges);
    expect(l.backEdges.has("tear")).toBe(true);
    expect(l.layer.get("Mix")!).toBeLessThan(l.layer.get("Sep")!);
    const run = l.routeY.get("tear")!;
    for (const id of ["Mix", "R", "Sep"]) {
      const p = l.positions.get(id)!;
      const outside = run > p.y + 84 || run < p.y;
      expect(outside, id).toBe(true);
    }
  });

  it("breaks an UNDECLARED cycle deterministically instead of failing", () => {
    const nodes = [box("A", ["c"], ["a"]), box("B", ["a"], ["b"]), box("C", ["b"], ["c"])];
    const edges = [edge("1", "A", "B", "a"), edge("2", "B", "C", "b"), edge("3", "C", "A", "c")];
    const a = layoutFlowsheet(nodes, edges);
    const b = layoutFlowsheet(nodes, edges);
    expect(a.backEdges.size).toBe(1);
    expect([...a.backEdges]).toEqual([...b.backEdges]);
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it("orders a column to remove a crossing the declaration order would draw", () => {
    // S splits to top/bottom; X consumes bottom, Y consumes top -- declared X first.
    const nodes = [box("S", [], ["t", "b"]), box("X", ["b"], []), box("Y", ["t"], [])];
    const edges = [edge("1", "S", "X", "b"), edge("2", "S", "Y", "t")];
    const l = layoutFlowsheet(nodes, edges);
    expect(l.positions.get("Y")!.y).toBeLessThan(l.positions.get("X")!.y);
  });

  it("never overlaps two boxes, stubs' room included", () => {
    const nodes: LayoutNode[] = [box("F", [], ["a", "b", "c"], true)];
    const edges: LayoutEdge[] = [];
    for (const [i, p] of ["a", "b", "c"].entries()) {
      nodes.push({ ...box(`U${i}`, [p], []), above: 86, below: 86 });
      edges.push(edge(`${i}`, "F", `U${i}`, p));
    }
    const l = layoutFlowsheet(nodes, edges);
    const us = ["U0", "U1", "U2"].map((id) => l.positions.get(id)!.y).sort((a, b) => a - b);
    expect(us[1]! - us[0]!).toBeGreaterThanOrEqual(84 + 86 + 86);
    expect(us[2]! - us[1]!).toBeGreaterThanOrEqual(84 + 86 + 86);
  });

  it("aligns a mixer with one inlet's port, not between two (median, not mean)", () => {
    const nodes = [box("A", [], ["a"]), box("B", [], ["b"]), box("M", ["a", "b"], ["m"]), box("N", ["m"], [])];
    const edges = [edge("1", "A", "M", "a"), edge("2", "B", "M", "b"), edge("3", "M", "N", "m")];
    const l = layoutFlowsheet(nodes, edges);
    const m = l.positions.get("M")!;
    const hits = [["A", "a"], ["B", "b"]].filter(([id, p]) =>
      Math.abs(portY(nodes.find((n) => n.id === id)!, l.positions.get(id!)!, p!, "out")
               - portY(nodes[2]!, m, p!, "in")) < 1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe("flowsheetToGraph uses the automatic layout", () => {
  it("places a deep feed beside its consumer and routes the declared recycle", () => {
    const fs = {
      units: [
        { name: "Mix", type: "mixer", inputs: ["feed", "rec"], outputs: ["m"] },
        { name: "Heat", type: "heater", in: "m", outputs: ["h"] },
        { name: "Mix2", type: "mixer", inputs: ["h", "late"], outputs: ["m2"] },
        { name: "Split", type: "splitter", in: "m2", outputs: ["rec", "prod"] },
      ],
      tearStreams: ["rec"],
    } as unknown as JsonDict;
    const g = flowsheetToGraph(fs);
    const x = (id: string) => g.nodes.find((n) => n.id === id)!.position.x;
    expect(x("stream:late")).toBeLessThan(x("unit:Mix2"));
    expect(x("stream:late")).toBeGreaterThan(x("unit:Mix"));
    const tear = g.edges.find((e) => (e.data as { kind?: string })?.kind === "tear")!;
    expect(typeof (tear.data as { routeY?: number }).routeY).toBe("number");
    // the duty stub docks to its own unit's column
    const stub = g.nodes.find((n) => n.id === "duty:Heat:Q")!;
    expect(Math.abs(stub.position.x + 48 - (x("unit:Heat") + g.sizes.get("unit:Heat")!.width / 2))).toBeLessThan(2);
  });
});

/* ---- the precedence rule: working copy > curated .cho > automatic ---------- */

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("an arrangement the reader made is never moved (Vítor, 2026-10-10)", () => {
  beforeEach(() => { (globalThis as Record<string, unknown>).localStorage = fakeStorage(); });
  afterEach(() => { delete (globalThis as Record<string, unknown>).localStorage; });

  const ids = ["stream:F", "unit:A", "unit:B", "unit:C", "stream:P"];
  const sizes = (_id: string) => ({ w: 190, h: 84 });
  const chain = new Map<string, string[]>([
    ["stream:F", ["unit:A"]], ["unit:A", ["stream:F", "unit:B"]], ["unit:B", ["unit:A", "unit:C"]],
    ["unit:C", ["unit:B", "stream:P"]], ["stream:P", ["unit:C"]],
  ]);
  const autoV1 = new Map<string, XY>(ids.map((id, i) => [id, { x: 80 + 300 * i, y: 80 }]));
  // A later, "improved" algorithm that would draw every node elsewhere.
  const autoV2 = new Map<string, XY>(ids.map((id, i) => [id, { x: 100 + 280 * i, y: 400 + 10 * i }]));

  it("(2) moving ONE node snapshots EVERY node, so a new algorithm reshuffles none", () => {
    // The canvas drew v1; the reader drags unit:B down by 200 px.
    const drawn = ids.map((id) => ({ id, position: id === "unit:B"
      ? { x: autoV1.get(id)!.x, y: 280 } : autoV1.get(id)! }));
    saveLayout("case", snapshotLayout(drawn, {}, {}));
    const working = loadLayout("case");
    expect(Object.keys(working.nodes).sort()).toEqual([...ids].sort());
    // Next session, the algorithm is v2: every saved node stays exactly where it was.
    const resolved = placeUnsavedNodes(ids, autoV2, mergeLayouts(working, layoutFromChoText("")).nodes,
                                       sizes, (id) => chain.get(id) ?? []);
    for (const d of drawn) expect(resolved.get(d.id)).toEqual(d.position);
  });

  it("(3) a unit added later is placed beside its neighbour and moves no saved node", () => {
    const saved: { [id: string]: XY } = {};
    for (const id of ids) saved[id] = { x: autoV1.get(id)!.x, y: 80 + (id === "unit:C" ? 300 : 0) };
    // The case gained unit:D between C and P; the automatic layout puts D
    // one column after C at C's height.
    const ids2 = [...ids, "unit:D"];
    const auto2 = new Map(autoV1);
    auto2.set("unit:D", { x: autoV1.get("unit:C")!.x + 300, y: 80 });
    const nb = new Map(chain);
    nb.set("unit:D", ["unit:C", "stream:P"]);
    const resolved = placeUnsavedNodes(ids2, auto2, saved, sizes, (id) => nb.get(id) ?? []);
    for (const id of ids) expect(resolved.get(id)).toEqual(saved[id]);
    // D keeps its automatic offset from the SAVED C (which the reader moved).
    expect(resolved.get("unit:D")).toEqual({ x: saved["unit:C"]!.x + 300, y: saved["unit:C"]!.y });
  });

  it("a placed newcomer is nudged off any saved box it would cover", () => {
    const saved = { "unit:A": { x: 0, y: 0 }, "unit:B": { x: 300, y: 0 } };
    const auto = new Map<string, XY>([["unit:A", { x: 0, y: 0 }], ["unit:B", { x: 300, y: 0 }],
                                      ["unit:N", { x: 300, y: 0 }]]);
    const r = placeUnsavedNodes(["unit:A", "unit:B", "unit:N"], auto, saved, sizes,
                                (id) => (id === "unit:N" ? ["unit:A"] : []));
    expect(r.get("unit:B")).toEqual({ x: 300, y: 0 });
    expect(r.get("unit:N")!.y).toBeGreaterThanOrEqual(84);
  });

  it("a stub the saved arrangement predates follows its OWNER", () => {
    const saved = { "unit:A": { x: 1000, y: 500 } };
    const auto = new Map<string, XY>([["unit:A", { x: 80, y: 80 }], ["duty:A:Q", { x: 127, y: 208 }]]);
    const r = placeUnsavedNodes(["unit:A", "duty:A:Q"], auto, saved, sizes, () => [],
                                (id) => (id === "duty:A:Q" ? "unit:A" : undefined));
    expect(r.get("duty:A:Q")).toEqual({ x: 1047, y: 628 });
  });

  it("precedence: a working copy wins WHOLE over the .cho; without one the .cho; without either, automatic", () => {
    const cho = layoutFromChoText(JSON.stringify({ choupoLayout: 1, nodes: { "unit:A": { x: 1, y: 1 } },
                                                   edges: { e1: { x: 5, y: 5 } } }));
    expect(mergeLayouts(loadLayout("case"), cho).nodes).toEqual({ "unit:A": { x: 1, y: 1 } });
    saveLayout("case", snapshotLayout([{ id: "unit:A", position: { x: 9, y: 9 } }], {}, {}));
    const m = mergeLayouts(loadLayout("case"), cho);
    expect(m.nodes).toEqual({ "unit:A": { x: 9, y: 9 } });
    expect(m.edges).toEqual({});           // the reader's snapshot had no bend: none
    clearLayout("case");
    expect(mergeLayouts(loadLayout("case"), cho).nodes).toEqual({ "unit:A": { x: 1, y: 1 } });
    expect(mergeLayouts(loadLayout("case"), layoutFromChoText("")).nodes).toEqual({});
  });
});
