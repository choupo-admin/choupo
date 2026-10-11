/*---------------------------------------------------------------------------*\
  THE LAYOUT C59 REPLACED, frozen as a REFERENCE for the layout metric test
  (flowsheetLayoutCorpus.test.ts) -- never imported by the app.

  This is gui/src/case/toGraph.ts's placement as it stood at 14077fb31
  (2026-10-10), transcribed onto a FlowsheetGraph so both drawings are
  measured on the same nodes, edges and box sizes: longest path from a feed
  with declared tears skipped, every feed in column 0, every product in the
  last column, each column stacked in declaration order at Y_STEP; docked
  stubs at the fixed offsets it used.  Kept so "the new layout is not worse"
  is a measurement against the old one rather than a memory of it.
\*---------------------------------------------------------------------------*/

import type { FlowsheetGraph } from "../src/case/toGraph.js";
import type { XY } from "../src/case/flowsheetLayout.js";
import { COOLING_DUTY_TYPES, PHASE_SPLIT_TYPES } from "../src/case/dutyTypes.js";

const X_STEP = 240;
const X_STEP_COMPOSITE = 340;
const Y_STEP = 130;
const X_ORIGIN = 80;
const Y_ORIGIN = 80;

export function legacyPositions(graph: FlowsheetGraph): Map<string, XY> {
  const view = graph.view;
  const xStep = view.units.some((u) => u.type === "sector") ? X_STEP_COMPOSITE : X_STEP;
  const producers = new Map<string, string>();
  const consumers = new Map<string, string[]>();
  for (const u of view.units) {
    for (const out of u.outputs) producers.set(out, u.name);
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) consumers.set(s, [...(consumers.get(s) ?? []), u.name]);
  }
  const allStreams = new Set<string>(Object.keys(view.streams));
  for (const u of view.units) for (const o of u.outputs) allStreams.add(o);
  const feeds = new Set<string>();
  for (const u of view.units) {
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) if (!producers.has(s)) feeds.add(s);
  }
  const products = new Set<string>();
  for (const s of allStreams) if (producers.has(s) && !consumers.has(s)) products.add(s);

  const tearSet = view.tearStreams ?? new Set<string>();
  const unitLayer = new Map<string, number>();
  const unitsByName = new Map(view.units.map((u) => [u.name, u]));
  const visiting = new Set<string>();
  const computeLayer = (name: string): number => {
    const cached = unitLayer.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) return 1;
    visiting.add(name);
    const u = unitsByName.get(name);
    if (!u) { visiting.delete(name); return 0; }
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    let max = 1;
    for (const s of ins) {
      if (tearSet.has(s)) continue;
      const prod = producers.get(s);
      if (prod) max = Math.max(max, computeLayer(prod) + 1);
    }
    visiting.delete(name);
    unitLayer.set(name, max);
    return max;
  };
  for (const u of view.units) computeLayer(u.name);
  const maxLayer = Math.max(1, ...unitLayer.values());

  const layered: { layer: number; id: string }[] = [];
  for (const f of feeds) layered.push({ layer: 0, id: `stream:${f}` });
  for (const u of view.units) layered.push({ layer: unitLayer.get(u.name)!, id: `unit:${u.name}` });
  const phaseRankOf = (p: string): number => {
    const owner = producers.get(p);
    const u = owner ? unitsByName.get(owner) : undefined;
    if (!u) return 0;
    const j = u.outputs.indexOf(p);
    if (j < 0) return 0;
    return PHASE_SPLIT_TYPES.has(u.type) ? u.outputs.length - 1 - j : j;
  };
  const producerRankOf = (p: string): number => {
    const owner = producers.get(p);
    const idx = owner ? view.units.findIndex((u) => u.name === owner) : -1;
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
  };
  const ordered = [...products].sort(
    (a, b) => producerRankOf(a) - producerRankOf(b) || phaseRankOf(a) - phaseRankOf(b));
  for (const p of ordered) layered.push({ layer: maxLayer + 1, id: `stream:${p}` });

  const perLayer = new Map<number, string[]>();
  for (const it of layered) perLayer.set(it.layer, [...(perLayer.get(it.layer) ?? []), it.id]);
  const pos = new Map<string, XY>();
  for (const [layer, ids] of perLayer)
    ids.forEach((id, i) => pos.set(id, {
      x: X_ORIGIN + layer * xStep,
      y: Y_ORIGIN + (i - (ids.length - 1) / 2) * Y_STEP + 220,
    }));

  // Docked stubs at the old fixed offsets from their owner.
  for (const n of graph.nodes) {
    const d = n.data as { dutyPort?: string; ownerUnit?: string; tier?: string };
    if (d.dutyPort === undefined || d.ownerUnit === undefined) continue;
    const p = pos.get(`unit:${d.ownerUnit}`);
    if (!p) continue;
    // The single-duty stub's side by the rule of THAT time (a numeric Q's
    // sign, else the cooling-by-construction types), not by today's
    // case/dutySign.ts -- the reference must not move when the app does.
    const owner = view.units.find((u) => u.name === d.ownerUnit);
    const q = (owner?.operation as { Q?: unknown } | undefined)?.Q;
    const oldCooling = d.dutyPort === "Q"
      ? (typeof q === "number" ? q < 0 : COOLING_DUTY_TYPES.has(owner?.type ?? ""))
      : d.tier === "cooling";
    const dy = d.dutyPort === "reboiler" ? 175
      : d.dutyPort === "condenser" ? -150
      : d.dutyPort === "power" ? 150
      : oldCooling ? -150 : 150;
    pos.set(n.id, { x: p.x + 35, y: p.y + dy });
  }
  return pos;
}
