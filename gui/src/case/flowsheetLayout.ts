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
  THE AUTOMATIC FLOWSHEET LAYOUT (DEV.md 4c C59).

  Vítor, seeing the green-ammonia plants: "the flowsheet layout looks like
  spaghetti!  Can you generate a more optimised layout that is easy to read?
  And do it always?"  The layout it replaces (toGraph.ts, until 2026-10-10)
  gave each unit its longest path from a feed, put EVERY feed in the first
  column and EVERY product in the last, and stacked each column in
  declaration order -- so a feed consumed deep in the plant, or a purge
  leaving early, drew a wire across the whole canvas, and nothing tried to
  keep two wires from crossing.

  This is a layered (Sugiyama) drawing, process flow left to right, written
  out here rather than imported (no dependency; a student can read every
  step).  Five steps, each a function below:

    1. CYCLES.  A recycle makes the stream graph cyclic.  A DECLARED tear is
       the back edge (the author already said where the loop is cut).  Any
       cycle left -- a dynamic case with no tear, a loop nobody declared --
       is broken DETERMINISTICALLY by a depth-first search in declaration
       order, never by failing.  A back edge is drawn as a recycle (step 5).
    2. LAYERS.  Longest path from the sources, then BALANCED: a node with
       fewer inputs than outputs (a feed, a recycle compressor whose only
       input is the tear) moves right to sit just before its first consumer;
       a product sits just after its producer.  No more feeds stranded in
       column 0, no more purges dragged to the last column.
    3. LONG EDGES get virtual nodes, one per layer crossed, so step 4 sees
       them as the wires they are.
    4. ORDER inside each layer: barycenter sweeps down and up, PORT-AWARE (a
       separator's vapour leaves above its liquid), followed by adjacent
       swaps; the order with fewest crossings found is kept.  Deterministic:
       no random restarts, ties broken by declaration order.
    5. COORDINATES.  Each node is pulled to the WEIGHTED MEDIAN of where its
       neighbours' ports say it should be -- a median, not a mean, so a mixer
       with two inlets lines up with ONE of them and the main train is a
       straight line instead of every wire kinking -- and the layer is then
       spread by an exact isotonic regression (pool-adjacent-violators), so
       no two boxes overlap and the order of step 4 is kept.  Boxes reserve
       room above / below for the utility stubs docked to them.  Back edges
       get a horizontal RUN above or below every box their span covers
       (whichever is shorter), in their own lane, so a recycle reads as a
       recycle and never runs through the train.

  PURE: no React, no DOM, no clock; the same input draws the same picture.
  The sizes it is given are ESTIMATES of the rendered cards (a browser is
  needed to measure, and the layout must exist before the first paint) --
  see toGraph.ts for where they come from.
\*---------------------------------------------------------------------------*/

export interface XY { x: number; y: number }

export interface LayoutPort {
  id: string;
  /** Where the port sits along the node's left (in) / right (out) side, 0..1. */
  frac: number;
}

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  ins: LayoutPort[];
  outs: LayoutPort[];
  /** Clearance kept free ABOVE / BELOW the box (docked utility stubs). */
  above?: number;
  below?: number;
  /** A boundary terminal: its wire is less important to straighten. */
  terminal?: boolean;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  /** `tear`: a declared recycle cut.  `material`: a process stream.
   *  `soft`: an energy wire or a recipe transfer -- a layering HINT only. */
  kind: "tear" | "material" | "soft";
  /** Where a soft edge leaves / lands, as a fraction of the box HEIGHT used
   *  only to ORDER a column (an energy wire docks at the bottom: 1). */
  sourceFrac?: number;
  targetFrac?: number;
}

export interface LayoutOptions {
  originX: number;
  originY: number;
  /** Horizontal air between two columns (room for the wire + its badge). */
  xGap: number;
  /** Vertical air between two boxes of one column. */
  yGap: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  originX: 80,
  originY: 80,
  xGap: 120,
  yGap: 46,
};

export interface FlowsheetLayout {
  /** Top-left corner of every node, flow coordinates. */
  positions: Map<string, XY>;
  /** The column each node was given (diagnostic; tests read it). */
  layer: Map<string, number>;
  /** Material edges drawn AGAINST the flow: declared tears + cycle breaks. */
  backEdges: Set<string>;
  /** The y of each back edge's horizontal run (above or below the train). */
  routeY: Map<string, number>;
  /** How far each back edge's vertical legs stand off its two boxes, px:
   *  just outside the COLUMN, not just outside the box -- a narrow box in a
   *  column with a wider one would otherwise drop its leg through the
   *  wider neighbour. */
  routeOutset: Map<string, { source: number; target: number }>;
}

/* ------------------------------------------------------------------------ */
/*  Step 1 -- cycles                                                        */
/* ------------------------------------------------------------------------ */

interface DEdge {
  e: LayoutEdge;
  from: string;     // the left end in the drawing
  to: string;       // the right end in the drawing
  reversed: boolean;
}

function breakCycles(
  nodes: LayoutNode[], edges: LayoutEdge[],
): { dag: DEdge[]; back: Set<string> } {
  const known = new Set(nodes.map((n) => n.id));
  const back = new Set<string>();
  const material: DEdge[] = [];
  for (const e of edges) {
    if (e.kind === "soft") continue;
    if (!known.has(e.source) || !known.has(e.target)) continue;
    if (e.source === e.target) { back.add(e.id); continue; }   // a self-loop
    const rev = e.kind === "tear";
    material.push({ e, from: rev ? e.target : e.source, to: rev ? e.source : e.target, reversed: rev });
  }
  // Depth-first search in declaration order; every edge into a node still on
  // the stack closes a cycle and is flipped.  Flipping every DFS back edge
  // leaves a DAG (a classical result), so this never fails.
  const out = new Map<string, DEdge[]>();
  for (const d of material) {
    const l = out.get(d.from) ?? [];
    l.push(d);
    out.set(d.from, l);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const flip: DEdge[] = [];
  for (const root of nodes) {
    if (state.get(root.id)) continue;
    const stack: { id: string; i: number }[] = [{ id: root.id, i: 0 }];
    state.set(root.id, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const list = out.get(top.id) ?? [];
      if (top.i >= list.length) { state.set(top.id, 2); stack.pop(); continue; }
      const d = list[top.i++]!;
      const s = state.get(d.to) ?? 0;
      if (s === 1) flip.push(d);
      else if (s === 0) { state.set(d.to, 1); stack.push({ id: d.to, i: 0 }); }
    }
  }
  for (const d of flip) {
    const f = d.from;
    d.from = d.to;
    d.to = f;
    d.reversed = !d.reversed;
  }
  for (const d of material) if (d.reversed) back.add(d.e.id);

  // Soft edges (energy wires, recipe transfers) are hints: kept only where
  // they agree with the material DAG, never allowed to make a cycle.
  const dag = [...material];
  const succ = new Map<string, string[]>();
  for (const d of dag) succ.set(d.from, [...(succ.get(d.from) ?? []), d.to]);
  const reaches = (a: string, b: string): boolean => {
    const seen = new Set<string>([a]);
    const q = [a];
    while (q.length > 0) {
      const x = q.shift()!;
      if (x === b) return true;
      for (const y of succ.get(x) ?? []) if (!seen.has(y)) { seen.add(y); q.push(y); }
    }
    return false;
  };
  for (const e of edges) {
    if (e.kind !== "soft" || e.source === e.target) continue;
    if (!known.has(e.source) || !known.has(e.target)) continue;
    if (reaches(e.target, e.source)) continue;
    dag.push({ e, from: e.source, to: e.target, reversed: false });
    succ.set(e.source, [...(succ.get(e.source) ?? []), e.target]);
  }
  return { dag, back };
}

/* ------------------------------------------------------------------------ */
/*  Step 2 -- layers                                                        */
/* ------------------------------------------------------------------------ */

function topoOrder(ids: string[], dag: DEdge[]): string[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  const succ = new Map<string, string[]>();
  for (const d of dag) {
    indeg.set(d.to, (indeg.get(d.to) ?? 0) + 1);
    succ.set(d.from, [...(succ.get(d.from) ?? []), d.to]);
  }
  const ready = ids.filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => rank.get(a)! - rank.get(b)!);
    const v = ready.shift()!;
    order.push(v);
    for (const w of succ.get(v) ?? []) {
      const k = indeg.get(w)! - 1;
      indeg.set(w, k);
      if (k === 0) ready.push(w);
    }
  }
  return order;
}

function assignLayers(ids: string[], dag: DEdge[]): Map<string, number> {
  const order = topoOrder(ids, dag);
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const d of dag) {
    preds.set(d.to, [...(preds.get(d.to) ?? []), d.from]);
    succs.set(d.from, [...(succs.get(d.from) ?? []), d.to]);
  }
  const layer = new Map<string, number>();
  for (const v of order) {
    let l = 0;
    for (const u of preds.get(v) ?? []) l = Math.max(l, layer.get(u)! + 1);
    layer.set(v, l);
  }
  // Balance: a node with fewer wires in than out moves as far right as its
  // consumers allow (it shortens more wires than it lengthens).  Reverse
  // topological order, so a chain of such nodes slides together.
  for (let pass = 0; pass < 3; pass++) {
    for (let k = order.length - 1; k >= 0; k--) {
      const v = order[k]!;
      const p = preds.get(v) ?? [];
      const s = succs.get(v) ?? [];
      if (s.length === 0 || p.length >= s.length) continue;
      let lim = Infinity;
      for (const w of s) lim = Math.min(lim, layer.get(w)! - 1);
      if (lim > layer.get(v)!) layer.set(v, lim);
    }
  }
  let min = Infinity;
  for (const l of layer.values()) min = Math.min(min, l);
  if (Number.isFinite(min) && min !== 0) for (const [k, l] of layer) layer.set(k, l - min);
  return layer;
}

/* ------------------------------------------------------------------------ */
/*  Step 3 -- the layered graph with virtual nodes                          */
/* ------------------------------------------------------------------------ */

interface Item {
  id: string;            // node id, or a virtual id
  real: boolean;
  terminal: boolean;
  w: number;
  h: number;
  above: number;
  below: number;
  rank: number;          // tie-break: declaration order
}

/** One wire between two ADJACENT layers. */
interface Seg {
  u: string;             // left item
  v: string;             // right item
  uFrac: number;         // port fraction on u's right side
  vFrac: number;         // port fraction on v's left side
  w: number;             // straightening priority
  soft: boolean;
}

const portFrac = (ports: LayoutPort[], id: string | undefined): number => {
  if (id !== undefined) {
    const p = ports.find((q) => q.id === id);
    if (p) return p.frac;
  }
  return 0.5;
};

/* ------------------------------------------------------------------------ */
/*  The whole layout                                                        */
/* ------------------------------------------------------------------------ */

export function layoutFlowsheet(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: Partial<LayoutOptions> = {},
): FlowsheetLayout {
  const opt = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = nodes.map((n) => n.id);

  // 1 + 2
  const { dag, back } = breakCycles(nodes, edges);
  const layer = assignLayers(ids, dag);

  // 3
  const items = new Map<string, Item>();
  nodes.forEach((n, i) => items.set(n.id, {
    id: n.id, real: true, terminal: !!n.terminal, w: n.width, h: n.height,
    above: n.above ?? 0, below: n.below ?? 0, rank: i,
  }));
  const segs: Seg[] = [];
  let vCount = 0;
  for (const d of dag) {
    if (d.reversed) continue;                  // a back edge is routed, not layered
    const lu = layer.get(d.from)!;
    const lv = layer.get(d.to)!;
    const nu = byId.get(d.from)!;
    const nv = byId.get(d.to)!;
    const uFrac = d.e.kind === "soft" ? (d.e.sourceFrac ?? 1) : portFrac(nu.outs, d.e.sourcePort);
    const vFrac = d.e.kind === "soft" ? (d.e.targetFrac ?? 1) : portFrac(nv.ins, d.e.targetPort);
    const soft = d.e.kind === "soft";
    const base = soft ? 0.5 : (nu.terminal || nv.terminal) ? 1 : 2;
    if (lv - lu === 1) {
      segs.push({ u: d.from, v: d.to, uFrac, vFrac, w: base, soft });
      continue;
    }
    if (soft) continue;                        // a long hint is not worth a lane
    let prev = d.from;
    let prevFrac = uFrac;
    const rank = items.get(d.from)!.rank + 0.5;
    for (let l = lu + 1; l < lv; l++) {
      const vid = `\u0000v${vCount++}`;
      items.set(vid, { id: vid, real: false, terminal: false, w: 0, h: 0, above: 0, below: 0, rank });
      layer.set(vid, l);
      segs.push({ u: prev, v: vid, uFrac: prevFrac, vFrac: 0.5, w: prev === d.from ? 3 : 8, soft });
      prev = vid;
      prevFrac = 0.5;
    }
    segs.push({ u: prev, v: d.to, uFrac: prevFrac, vFrac, w: 3, soft });
  }

  let maxLayer = 0;
  for (const l of layer.values()) maxLayer = Math.max(maxLayer, l);
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const [id, l] of layer) if (items.has(id)) layers[l]!.push(id);

  const inSegs = new Map<string, Seg[]>();
  const outSegs = new Map<string, Seg[]>();
  for (const s of segs) {
    inSegs.set(s.v, [...(inSegs.get(s.v) ?? []), s]);
    outSegs.set(s.u, [...(outSegs.get(s.u) ?? []), s]);
  }

  // 4
  const order = orderLayers(layers, items, segs, inSegs, outSegs);

  // 5 -- x by column, y by median alignment + isotonic spreading
  const colX: number[] = [];
  const colW: number[] = [];
  let x = opt.originX;
  for (let l = 0; l <= maxLayer; l++) {
    let w = 0;
    for (const id of order[l]!) w = Math.max(w, items.get(id)!.w);
    colX.push(x);
    colW.push(w);
    x += w + opt.xGap;
  }
  const y = assignY(order, items, inSegs, outSegs, opt.yGap);

  const positions = new Map<string, XY>();
  let minTop = Infinity;
  for (const n of nodes) minTop = Math.min(minTop, y.get(n.id)! - (n.above ?? 0));
  const dy = Number.isFinite(minTop) ? opt.originY - minTop : 0;
  for (const n of nodes) {
    const l = layer.get(n.id)!;
    positions.set(n.id, {
      x: Math.round(colX[l]! + (colW[l]! - n.width) / 2),
      y: Math.round(y.get(n.id)! + dy),
    });
  }

  const nodeLayer = new Map<string, number>();
  for (const n of nodes) nodeLayer.set(n.id, layer.get(n.id)!);
  const outset = new Map<string, { source: number; target: number }>();
  for (const e of edges) {
    if (!back.has(e.id) || !byId.has(e.source) || !byId.has(e.target)) continue;
    const ls = layer.get(e.source)!;
    const lt = layer.get(e.target)!;
    const ps = positions.get(e.source)!;
    const pt = positions.get(e.target)!;
    outset.set(e.id, {
      source: Math.round(colX[ls]! + colW[ls]! - (ps.x + byId.get(e.source)!.width)) + LEG_OUTSET,
      target: Math.round(pt.x - colX[lt]!) + LEG_OUTSET,
    });
  }
  const routeY = routeBackEdges(edges, back, nodes, positions, nodeLayer, outset);
  return { positions, layer: nodeLayer, backEdges: back, routeY, routeOutset: outset };
}

/* ------------------------------------------------------------------------ */
/*  Step 4 -- crossing reduction                                            */
/* ------------------------------------------------------------------------ */

const PORT_SPREAD = 0.8;    // a node's ports fill 80 % of its slot in the order
const offsetOf = (frac: number) => (frac - 0.5) * PORT_SPREAD;

function crossingsBetween(gap: Seg[], pos: Map<string, number>): number {
  let c = 0;
  for (let i = 0; i < gap.length; i++) {
    const a = gap[i]!;
    const a1 = pos.get(a.u)! + offsetOf(a.uFrac);
    const a2 = pos.get(a.v)! + offsetOf(a.vFrac);
    for (let j = i + 1; j < gap.length; j++) {
      const b = gap[j]!;
      const b1 = pos.get(b.u)! + offsetOf(b.uFrac);
      const b2 = pos.get(b.v)! + offsetOf(b.vFrac);
      //  A wire crossing an ENERGY / recipe wire costs double: those dock at
      //  the bottom of a box, so on the canvas the crossing tends to become a
      //  wire through a box, which is worse than a crossing.
      if ((a1 - b1) * (a2 - b2) < 0) c += a.soft || b.soft ? 2 : 1;
    }
  }
  return c;
}

function orderLayers(
  layers: string[][], items: Map<string, Item>, segs: Seg[],
  inSegs: Map<string, Seg[]>, outSegs: Map<string, Seg[]>,
): string[][] {
  const L = layers.length;
  // Wires grouped by the gap they cross (gap g = layer g -> g+1).
  const layerOf = new Map<string, number>();
  layers.forEach((ids, l) => ids.forEach((id) => layerOf.set(id, l)));
  const gaps: Seg[][] = Array.from({ length: Math.max(0, L - 1) }, () => []);
  for (const s of segs) {
    const g = layerOf.get(s.u);
    if (g !== undefined && g < L - 1) gaps[g]!.push(s);
  }

  let order = layers.map((ids) => [...ids].sort((a, b) => items.get(a)!.rank - items.get(b)!.rank));
  const pos = new Map<string, number>();
  const index = () => { for (const ids of order) ids.forEach((id, i) => pos.set(id, i)); };
  const total = () => {
    let c = 0;
    for (const g of gaps) c += crossingsBetween(g, pos);
    return c;
  };
  const reorder = (l: number, dir: "in" | "out") => {
    const ids = order[l]!;
    const key = new Map<string, number>();
    for (const id of ids) {
      const list = (dir === "in" ? inSegs.get(id) : outSegs.get(id)) ?? [];
      let sw = 0;
      let sp = 0;
      for (const s of list) {
        const other = dir === "in"
          ? pos.get(s.u)! + offsetOf(s.uFrac) - offsetOf(s.vFrac)
          : pos.get(s.v)! + offsetOf(s.vFrac) - offsetOf(s.uFrac);
        sw += s.w;
        sp += s.w * other;
      }
      key.set(id, sw > 0 ? sp / sw : pos.get(id)!);
    }
    ids.sort((a, b) => key.get(a)! - key.get(b)! || pos.get(a)! - pos.get(b)!);
    ids.forEach((id, i) => pos.set(id, i));
  };
  const transpose = () => {
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 20) {
      improved = false;
      for (let l = 0; l < L; l++) {
        const ids = order[l]!;
        for (let j = 0; j + 1 < ids.length; j++) {
          const local = () =>
            (l > 0 ? crossingsBetween(gaps[l - 1]!, pos) : 0)
            + (l < L - 1 ? crossingsBetween(gaps[l]!, pos) : 0);
          const before = local();
          const a = ids[j]!;
          const b = ids[j + 1]!;
          ids[j] = b; ids[j + 1] = a;
          pos.set(b, j); pos.set(a, j + 1);
          if (local() < before) { improved = true; continue; }
          ids[j] = a; ids[j + 1] = b;
          pos.set(a, j); pos.set(b, j + 1);
        }
      }
    }
  };

  index();
  // A first downward pass places every later layer by its predecessors.
  for (let l = 1; l < L; l++) reorder(l, "in");
  let best = order.map((ids) => [...ids]);
  let bestC = total();
  for (let it = 0; it < 24 && bestC > 0; it++) {
    if (it % 2 === 0) for (let l = L - 2; l >= 0; l--) reorder(l, "out");
    else for (let l = 1; l < L; l++) reorder(l, "in");
    transpose();
    const c = total();
    if (c < bestC) { bestC = c; best = order.map((ids) => [...ids]); }
  }
  order = best;
  return order;
}

/* ------------------------------------------------------------------------ */
/*  Step 5 -- vertical coordinates                                          */
/* ------------------------------------------------------------------------ */

/** Weighted median of (value, weight) pairs; the LOWER one on a tie. */
function weightedMedian(vals: { v: number; w: number }[]): number {
  const s = [...vals].sort((a, b) => a.v - b.v);
  let total = 0;
  for (const p of s) total += p.w;
  let acc = 0;
  for (const p of s) {
    acc += p.w;
    if (acc >= total / 2 - 1e-9) return p.v;
  }
  return s[s.length - 1]!.v;
}

/** Pool adjacent violators, BY PRIORITY: the nondecreasing z closest to the
 *  targets t, where two boxes that want overlapping places do not split the
 *  difference (least squares would put BOTH wires on a kink) -- the one with
 *  the heavier wires keeps its exact place and the other is pushed aside, so
 *  at least one wire is straight.  Ties go to the box higher in the column.
 *  This is Sugiyama's "priority method" written as the pooling step. */
function isotonic(t: number[], w: number[]): number[] {
  const blocks: { val: number; lw: number; n: number }[] = [];
  for (let i = 0; i < t.length; i++) {
    blocks.push({ val: t[i]!, lw: w[i]!, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.val <= b.val) break;
      const lead = a.lw >= b.lw ? a : b;
      blocks.splice(blocks.length - 2, 2, { val: lead.val, lw: lead.lw, n: a.n + b.n });
    }
  }
  const z: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) z.push(b.val);
  return z;
}

function assignY(
  order: string[][], items: Map<string, Item>,
  inSegs: Map<string, Seg[]>, outSegs: Map<string, Seg[]>, yGap: number,
): Map<string, number> {
  const y = new Map<string, number>();
  const sep = (a: Item, b: Item) =>
    a.real && b.real ? yGap : a.real || b.real ? 26 : 16;
  // offsets: y_k >= y_{k-1} + h_{k-1} + below_{k-1} + sep + above_k
  const offsets = order.map((ids) => {
    const off: number[] = [];
    let acc = 0;
    ids.forEach((id, k) => {
      const it = items.get(id)!;
      if (k > 0) {
        const p = items.get(ids[k - 1]!)!;
        acc += p.h + p.below + sep(p, it) + it.above;
      }
      off.push(acc);
    });
    return off;
  });
  // Initial: each column stacked and centred on 0.
  order.forEach((ids, l) => {
    const off = offsets[l]!;
    const last = ids.length - 1;
    const span = last >= 0 ? off[last]! + items.get(ids[last]!)!.h : 0;
    ids.forEach((id, k) => y.set(id, off[k]! - span / 2));
  });

  const place = (l: number, dir: "in" | "out" | "both") => {
    const ids = order[l]!;
    const t: number[] = [];
    const w: number[] = [];
    ids.forEach((id, k) => {
      const it = items.get(id)!;
      const cand: { v: number; w: number }[] = [];
      if (dir !== "out")
        for (const s of inSegs.get(id) ?? []) {
          const u = items.get(s.u)!;
          cand.push({ v: y.get(s.u)! + (s.soft ? 0.5 : s.uFrac) * u.h - (s.soft ? 0.5 : s.vFrac) * it.h, w: s.w });
        }
      if (dir !== "in")
        for (const s of outSegs.get(id) ?? []) {
          const v = items.get(s.v)!;
          cand.push({ v: y.get(s.v)! + (s.soft ? 0.5 : s.vFrac) * v.h - (s.soft ? 0.5 : s.uFrac) * it.h, w: s.w });
        }
      const target = cand.length > 0 ? weightedMedian(cand) : y.get(id)!;
      let wt = 0;
      for (const c of cand) wt += c.w;
      t.push(target - offsets[l]![k]!);
      w.push(cand.length > 0 ? wt : 0.05);
    });
    const z = isotonic(t, w);
    ids.forEach((id, k) => y.set(id, z[k]! + offsets[l]![k]!));
  };

  const L = order.length;
  for (let r = 0; r < 8; r++) {
    for (let l = 1; l < L; l++) place(l, "in");
    for (let l = L - 2; l >= 0; l--) place(l, "out");
  }
  for (let r = 0; r < 3; r++) {
    for (let l = 0; l < L; l++) place(l, "both");
    for (let l = L - 1; l >= 0; l--) place(l, "both");
  }
  // Snap to whole pixels so equal ports land on exactly one line.
  for (const [k, v] of y) y.set(k, Math.round(v));
  return y;
}

/* ------------------------------------------------------------------------ */
/*  Back-edge routing                                                       */
/* ------------------------------------------------------------------------ */

const ROUTE_CLEAR = 34;    // air between the last box and a recycle run
const ROUTE_LANE = 26;     // air between two recycle runs that overlap
const ROUTE_MIN_DROP = 70; // the shortest leg TearEdge draws (its own default)
const LEG_OUTSET = 18;     // TearEdge's own jut beyond the column

function routeBackEdges(
  edges: LayoutEdge[], back: Set<string>, nodes: LayoutNode[],
  positions: Map<string, XY>, layer: Map<string, number>,
  outset: Map<string, { source: number; target: number }>,
): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const portY = (id: string, side: "in" | "out", port: string | undefined): number => {
    const n = byId.get(id)!;
    const p = positions.get(id)!;
    return p.y + portFrac(side === "in" ? n.ins : n.outs, port) * n.height;
  };
  const list = edges.filter((e) => back.has(e.id) && byId.has(e.source) && byId.has(e.target));
  const span = (e: LayoutEdge) => {
    const a = layer.get(e.source)!;
    const b = layer.get(e.target)!;
    return [Math.min(a, b), Math.max(a, b)] as const;
  };
  // Narrow loops first, so they take the inner lane.
  list.sort((a, b) => {
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    return (a1 - a0) - (b1 - b0) || edges.indexOf(a) - edges.indexOf(b);
  });
  const lanes: { lo: number; hi: number; y: number; below: boolean }[] = [];
  const routeY = new Map<string, number>();

  // What a run above or below would have to cross: every forward wire (as
  // the canvas draws it: out, one vertical at mid-gap, in), every recycle
  // already routed, and every box with the room its stubs take.
  type S = [number, number, number, number];
  const wires: S[] = [];
  const poly = (pts: [number, number][]) => {
    const out: S[] = [];
    for (let i = 0; i + 1 < pts.length; i++)
      out.push([pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]]);
    return out;
  };
  for (const e of edges) {
    if (back.has(e.id) || e.kind === "soft" || !byId.has(e.source) || !byId.has(e.target)) continue;
    const sx = positions.get(e.source)!.x + byId.get(e.source)!.width;
    const tx = positions.get(e.target)!.x;
    const sy = portY(e.source, "out", e.sourcePort);
    const ty = portY(e.target, "in", e.targetPort);
    const mx = (sx + tx) / 2;
    wires.push(...poly([[sx, sy], [mx, sy], [mx, ty], [tx, ty]]));
  }
  const crosses = (a: S, b: S): boolean => {
    const h = (s: S) => Math.abs(s[1] - s[3]) < 0.5;
    const v = (s: S) => Math.abs(s[0] - s[2]) < 0.5;
    const btw = (q: number, p0: number, p1: number) => q > Math.min(p0, p1) + 1 && q < Math.max(p0, p1) - 1;
    if (h(a) && v(b)) return btw(b[0], a[0], a[2]) && btw(a[1], b[1], b[3]);
    if (v(a) && h(b)) return btw(a[0], b[0], b[2]) && btw(b[1], a[1], a[3]);
    return false;
  };
  const hitsBox = (s: S, n: LayoutNode): boolean => {
    const p = positions.get(n.id)!;
    const x0 = p.x, x1 = p.x + n.width;
    const y0 = p.y - (n.above ?? 0), y1 = p.y + n.height + (n.below ?? 0);
    const lo = (a: number, b: number) => Math.min(a, b);
    const hi = (a: number, b: number) => Math.max(a, b);
    return hi(s[0], s[2]) > x0 && lo(s[0], s[2]) < x1 && hi(s[1], s[3]) > y0 && lo(s[1], s[3]) < y1;
  };
  const runCost = (e: LayoutEdge, yRun: number): { cost: number; segs: S[] } => {
    const o = outset.get(e.id) ?? { source: LEG_OUTSET, target: LEG_OUTSET };
    const sx = positions.get(e.source)!.x + byId.get(e.source)!.width + o.source;
    const tx = positions.get(e.target)!.x - o.target;
    const sy = portY(e.source, "out", e.sourcePort);
    const ty = portY(e.target, "in", e.targetPort);
    const segs = poly([[sx, sy], [sx, yRun], [tx, yRun], [tx, ty]]);
    let cost = (Math.abs(yRun - sy) + Math.abs(yRun - ty)) / 1000;
    for (const s of segs) {
      for (const w of wires) if (crosses(s, w)) cost += 1;
      for (const n of nodes)
        if (n.id !== e.source && n.id !== e.target && hitsBox(s, n)) cost += 3;
    }
    return { cost, segs };
  };

  for (const e of list) {
    const [lo, hi] = span(e);
    let bottom = -Infinity;
    let top = Infinity;
    for (const n of nodes) {
      const l = layer.get(n.id)!;
      if (l < lo || l > hi) continue;
      const p = positions.get(n.id)!;
      bottom = Math.max(bottom, p.y + n.height + (n.below ?? 0));
      top = Math.min(top, p.y - (n.above ?? 0));
    }
    const sy = portY(e.source, "out", e.sourcePort);
    const ty = portY(e.target, "in", e.targetPort);
    const downY = Math.max(bottom + ROUTE_CLEAR, Math.max(sy, ty) + ROUTE_MIN_DROP);
    const upY = Math.min(top - ROUTE_CLEAR, Math.min(sy, ty) - ROUTE_MIN_DROP);
    // Each side in its own lane (clear of an overlapping recycle already
    // routed there); the side whose run crosses fewer wires and boxes wins,
    // the shorter legs breaking a tie, below breaking an exact one.
    const laneFor = (below: boolean) => {
      let yRun = below ? downY : upY;
      for (let guard = 0; guard < 50; guard++) {
        const clash = lanes.find((ln) => ln.below === below && ln.lo <= hi && lo <= ln.hi
                                         && Math.abs(ln.y - yRun) < ROUTE_LANE);
        if (!clash) break;
        yRun = below ? clash.y + ROUTE_LANE : clash.y - ROUTE_LANE;
      }
      return yRun;
    };
    const down = runCost(e, laneFor(true));
    const up = runCost(e, laneFor(false));
    const below = down.cost <= up.cost;
    const yRun = laneFor(below);
    lanes.push({ lo, hi, y: yRun, below });
    wires.push(...(below ? down : up).segs);
    routeY.set(e.id, Math.round(yRun));
  }
  return routeY;
}

/* ------------------------------------------------------------------------ */
/*  Placing what a saved arrangement does not know                          */
/* ------------------------------------------------------------------------ */

/**
 * A case whose layout the user (or a curated `.cho`) already arranged, and
 * which has since gained nodes the saved layout does not name -- a unit added
 * to the case, a utility stub the snapshot predates.  Every SAVED node keeps
 * its saved position, exactly; each new node is placed by the automatic
 * layout RELATIVE TO A SAVED NEIGHBOUR (its offset from that neighbour in the
 * automatic drawing is kept), then nudged down until it overlaps no box.
 * A docked stub follows its owner first (`ownerOf`).  A node with no saved
 * neighbour at all goes below everything that was saved.
 */
export function placeUnsavedNodes(
  ids: string[],
  auto: Map<string, XY>,
  saved: { [id: string]: XY },
  size: (id: string) => { w: number; h: number },
  neighbours: (id: string) => string[],
  ownerOf: (id: string) => string | undefined = () => undefined,
): Map<string, XY> {
  const out = new Map<string, XY>();
  for (const id of ids) if (saved[id]) out.set(id, { ...saved[id]! });
  const missing = ids.filter((id) => !saved[id]);
  if (missing.length === 0 || out.size === 0) {
    for (const id of missing) out.set(id, { ...(auto.get(id) ?? { x: 0, y: 0 }) });
    return out;
  }
  const overlaps = (id: string, p: XY) => {
    const s = size(id);
    for (const [k, q] of out) {
      if (k === id) continue;
      const t = size(k);
      if (p.x < q.x + t.w + 8 && q.x < p.x + s.w + 8 && p.y < q.y + t.h + 8 && q.y < p.y + s.h + 8)
        return true;
    }
    return false;
  };
  let savedBottom = -Infinity;
  let savedLeft = Infinity;
  for (const [k, q] of out) {
    savedBottom = Math.max(savedBottom, q.y + size(k).h);
    savedLeft = Math.min(savedLeft, q.x);
  }
  // Owners and neighbours first: a node placed here can anchor the next one.
  const pending = [...missing];
  for (let round = 0; round < 4 && pending.length > 0; round++) {
    for (let i = 0; i < pending.length; i++) {
      const id = pending[i]!;
      const a = auto.get(id);
      if (!a) continue;
      const owner = ownerOf(id);
      const anchors = owner !== undefined ? [owner, ...neighbours(id)] : neighbours(id);
      const anchor = anchors.find((n) => out.has(n) && auto.has(n));
      if (anchor === undefined) continue;
      const aa = auto.get(anchor)!;
      const pa = out.get(anchor)!;
      const p = { x: pa.x + (a.x - aa.x), y: pa.y + (a.y - aa.y) };
      // A stub is drawn where its owner is; anything else must not cover a box.
      if (owner === undefined)
        for (let g = 0; g < 60 && overlaps(id, p); g++) p.y += 40;
      out.set(id, p);
      pending.splice(i--, 1);
    }
  }
  let x = Number.isFinite(savedLeft) ? savedLeft : 0;
  for (const id of pending) {
    const p = { x, y: savedBottom + 80 };
    out.set(id, p);
    x += size(id).w + 60;
  }
  return out;
}
