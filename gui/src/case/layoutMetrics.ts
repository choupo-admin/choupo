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
  HOW READABLE IS A FLOWSHEET DRAWING -- a measurement, so "the layout is
  better" is a number and not an impression (DEV.md 4c C59).

  Every wire is reconstructed as the polyline the canvas draws for it: a
  stream as React Flow's smoothstep (out of the right side, one vertical, into
  the left side; a wire that must go BACKWARDS jogs round), a recycle as
  TearEdge's U-turn at the run depth the layout chose, a utility stub as the
  short drop to its box, an energy or recipe wire under both boxes.  Boxes
  take the ESTIMATED sizes the layout itself used (FlowsheetGraph.sizes).
  Then it counts:

    crossings     -- two wires crossing (an orthogonal H x V intersection);
    throughNodes  -- a wire running through a box that is neither of its ends;
    overlaps      -- two boxes that overlap;
    bends         -- corners along the wires;
    length        -- total wire length, px.

  What it does NOT see, said rather than implied: label collisions, the
  rounded corners, a wire lying ALONG another (collinear overlap is not a
  crossing here), and anything the reader's eye finds ugly that none of the
  five counts.  The screenshots are the other half of the evidence.
\*---------------------------------------------------------------------------*/

import type { Edge, Node } from "@xyflow/react";

import type { XY } from "./flowsheetLayout.js";
import { PHASE_SPLIT_TYPES } from "./dutyTypes.js";
import type { UnitSpec } from "./types.js";

export interface LayoutMetrics {
  crossings: number;
  throughNodes: number;
  overlaps: number;
  bends: number;
  length: number;
}

interface Box { x: number; y: number; w: number; h: number }
type Seg = [number, number, number, number];   // x1 y1 x2 y2

const fracOf = (i: number, n: number) => (n <= 1 ? 0.5 : 0.25 + 0.5 * (i / (n - 1)));

function portY(node: Node, box: Box, handle: string | null | undefined, side: "in" | "out"): number {
  const unit = (node.data as { unit?: UnitSpec }).unit;
  if (!unit || handle == null) return box.y + box.h / 2;
  if (side === "in") {
    const ins = Array.isArray(unit.in) ? unit.in : [unit.in];
    const i = ins.indexOf(handle);
    return i < 0 ? box.y + box.h / 2 : box.y + fracOf(i, ins.length) * box.h;
  }
  const j = unit.outputs.indexOf(handle);
  if (j < 0) return box.y + box.h / 2;
  const r = PHASE_SPLIT_TYPES.has(unit.type) ? unit.outputs.length - 1 - j : j;
  return box.y + fracOf(r, unit.outputs.length) * box.h;
}

/** The polyline the canvas draws for one edge. */
function polyline(
  e: Edge, nodes: Map<string, Node>, boxes: Map<string, Box>, routed: boolean,
): XY[] | null {
  const sn = nodes.get(e.source);
  const tn = nodes.get(e.target);
  const sb = boxes.get(e.source);
  const tb = boxes.get(e.target);
  if (!sn || !tn || !sb || !tb) return null;
  const raw = (e.data ?? {}) as {
    kind?: string; backEdge?: boolean; routeY?: number; sourceOutset?: number; targetOutset?: number;
  };
  //  `routed: false` measures a drawing made WITHOUT the layout's routing
  //  (the previous layout): a recycle at TearEdge's own default depth, an
  //  undeclared back edge as a plain smoothstep.
  const data = routed ? raw : { kind: raw.kind };
  if (data.kind === "duty") {
    const sx = sb.x + sb.w / 2;
    const above = sb.y + sb.h / 2 < tb.y + tb.h / 2;
    const sy = above ? sb.y + sb.h : sb.y;
    const tx = tb.x + tb.w / 2;
    const ty = above ? tb.y : tb.y + tb.h;
    const my = (sy + ty) / 2;
    return [{ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty }];
  }
  if (data.kind === "energy" || data.kind === "recipe") {
    const sx = sb.x + sb.w / 2;
    const tx = tb.x + tb.w / 2;
    const sy = sb.y + sb.h;
    const ty = tb.y + tb.h;
    const low = Math.max(sy, ty) + 30;
    return [{ x: sx, y: sy }, { x: sx, y: low }, { x: tx, y: low }, { x: tx, y: ty }];
  }
  const sx = sb.x + sb.w;
  const sy = portY(sn, sb, e.sourceHandle, "out");
  const tx = tb.x;
  const ty = portY(tn, tb, e.targetHandle, "in");
  if (data.kind === "tear" || data.backEdge) {
    const bus = data.routeY ?? Math.max(sy, ty) + 70;
    const os = data.sourceOutset ?? 18;
    const ot = data.targetOutset ?? 18;
    return [{ x: sx, y: sy }, { x: sx + os, y: sy }, { x: sx + os, y: bus },
            { x: tx - ot, y: bus }, { x: tx - ot, y: ty }, { x: tx, y: ty }];
  }
  if (tx >= sx + 20) {
    const mx = (sx + tx) / 2;
    return [{ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: tx, y: ty }];
  }
  const my = (sy + ty) / 2;
  return [{ x: sx, y: sy }, { x: sx + 20, y: sy }, { x: sx + 20, y: my },
          { x: tx - 20, y: my }, { x: tx - 20, y: ty }, { x: tx, y: ty }];
}

function segsOf(p: XY[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) continue;
    out.push([a.x, a.y, b.x, b.y]);
  }
  return out;
}

const EPS = 1;
const isH = (s: Seg) => Math.abs(s[1] - s[3]) < 0.5;
const isV = (s: Seg) => Math.abs(s[0] - s[2]) < 0.5;
const between = (v: number, a: number, b: number) =>
  v > Math.min(a, b) + EPS && v < Math.max(a, b) - EPS;

function cross(a: Seg, b: Seg): boolean {
  if (isH(a) && isV(b)) return between(b[0], a[0], a[2]) && between(a[1], b[1], b[3]);
  if (isV(a) && isH(b)) return cross(b, a);
  return false;
}

function throughBox(s: Seg, b: Box): boolean {
  const x0 = b.x + 2, x1 = b.x + b.w - 2, y0 = b.y + 2, y1 = b.y + b.h - 2;
  if (isH(s)) return s[1] > y0 && s[1] < y1 && Math.max(s[0], s[2]) > x0 && Math.min(s[0], s[2]) < x1;
  if (isV(s)) return s[0] > x0 && s[0] < x1 && Math.max(s[1], s[3]) > y0 && Math.min(s[1], s[3]) < y1;
  return false;
}

/** Measure a drawing: the graph's nodes at `positions` (default: their own). */
export function measureLayout(
  graph: { nodes: Node[]; edges: Edge[]; sizes: Map<string, { width: number; height: number }> },
  positions?: Map<string, XY>,
  routed = true,
  explain?: string[],
): LayoutMetrics {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const boxes = new Map<string, Box>();
  for (const n of graph.nodes) {
    const p = positions?.get(n.id) ?? n.position;
    const s = graph.sizes.get(n.id) ?? { width: 190, height: 84 };
    boxes.set(n.id, { x: p.x, y: p.y, w: s.width, h: s.height });
  }
  const wires: { e: Edge; segs: Seg[] }[] = [];
  let bends = 0;
  let length = 0;
  for (const e of graph.edges) {
    const p = polyline(e, nodes, boxes, routed);
    if (!p) continue;
    const segs = segsOf(p);
    wires.push({ e, segs });
    bends += Math.max(0, segs.length - 1);
    for (const s of segs) length += Math.abs(s[2] - s[0]) + Math.abs(s[3] - s[1]);
  }
  let crossings = 0;
  for (let i = 0; i < wires.length; i++)
    for (let j = i + 1; j < wires.length; j++)
      for (const a of wires[i]!.segs)
        for (const b of wires[j]!.segs)
          if (cross(a, b)) { crossings++; explain?.push(`cross ${wires[i]!.e.id} X ${wires[j]!.e.id}`); }
  let throughNodes = 0;
  for (const w of wires)
    for (const [id, b] of boxes) {
      if (id === w.e.source || id === w.e.target) continue;
      if (w.segs.some((s) => throughBox(s, b))) { throughNodes++; explain?.push(`thru ${w.e.id} @ ${id}`); }
    }
  let overlaps = 0;
  const list = [...boxes.values()];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps++;
    }
  return { crossings, throughNodes, overlaps, bends, length: Math.round(length) };
}

/** One number to rank drawings by, defects first: an overlap hides a box, a
 *  wire through a box lies about the topology, a crossing costs the eye. */
export function layoutScore(m: LayoutMetrics): number {
  return 10 * m.overlaps + 3 * m.throughNodes + m.crossings;
}
