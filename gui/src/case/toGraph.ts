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
  Project a flowsheet JSON into React Flow nodes + edges.

  Nodes:
    - feed terminals  (input streams with no producer)
    - units           (reactor, flash, column,...)
    - product terminals (output streams not consumed by any unit)

  Edges are streams with a label.

  Layout: longest-path layering (Sugiyama-lite), no external solver.
  Good enough for flowsheets up to ~30 units; swap for dagre/ELK later.
\*---------------------------------------------------------------------------*/

import type { Edge, Node } from "@xyflow/react";

import { parse, toJson } from "../dict/index.js";
import type { JsonDict, JsonValue } from "../dict/index.js";
import { scalarToSI } from "../dict/scalarSI.js";
import type { FlowsheetView, StreamSpec, UnitSpec } from "./types.js";
// The duty/work unit-type sets — SHARED with UnitNode.tsx (single source of
// truth), so the stub node + edge here always match the handle there.
import { COLUMN_TYPES, HEAT_DUTY_TYPES, COOLING_DUTY_TYPES, POWER_DRAW_TYPES, PHASE_SPLIT_TYPES, DYNAMIC_HOLDUP_TYPES } from "./dutyTypes.js";

export interface FlowsheetGraph {
  nodes: Node[];
  edges: Edge[];
  view: FlowsheetView;
  /** Deterministic per-stream number (PFD convention), keyed by stream name.
   *  Display-only (GUI-derived, never written to the dict); the same map keys
   *  the canvas badges AND the Streams-table `#` column so they agree. */
  streamNumbers: Map<string, number>;
}

// Assign a stable PFD number to every stream in a view: feeds first (in unit
// input order), then every produced stream in unit/output order.  Deterministic
// for a given flowsheet (so the canvas and the Streams table never disagree);
// it is a presentation INDEX, not a persistent id -- editing the topology may
// renumber, like figure captions (an honest trade-off, see the forum verdict).
function assignStreamNumbers(view: FlowsheetView): Map<string, number> {
  const num = new Map<string, number>();
  let n = 0;
  const add = (s: string) => { if (s && !num.has(s)) num.set(s, ++n); };
  const produced = new Set<string>();
  for (const u of view.units) for (const o of u.outputs) produced.add(o);
  // Order intent (kept stable so the canvas badge and the Streams `#` column
  // agree): boundary feeds first, then every produced stream, THEN any stream
  // that still has no number -- interior pipes, declared tears, and inputs that
  // are not a unit output.  Without that last sweep a fractal/flattened view
  // left interior streams unnumbered ("muitas correntes nao tem numero"); now
  // EVERY stream that appears in the view (edge or table row) gets one.
  for (const u of view.units) {
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) if (!produced.has(s)) add(s);   // boundary feeds first
  }
  for (const u of view.units) for (const o of u.outputs) add(o);   // then products
  // Backstop -- cover everything still missed, deterministically:
  for (const u of view.units) {                          // any input not yet seen
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) add(s);
  }
  for (const s of view.tearStreams ?? []) add(s);        // declared tears
  for (const s of Object.keys(view.streams)) add(s);     // declared streams
  return num;
}

/** Stream numbers for a flowsheet, deterministic and matching the canvas.
 *  Used by the Streams table so its `#` column agrees with the diagram. */
export function streamNumbersForFlowsheet(
  flowsheet: JsonDict, rawFiles?: { [relPath: string]: string },
): Map<string, number> {
  return assignStreamNumbers(readFlowsheet(flowsheet, rawFiles));
}

const X_STEP = 240;
const X_STEP_COMPOSITE = 340;   // sectors + their inter-sector labels need air
const Y_STEP = 130;
const X_ORIGIN = 80;
const Y_ORIGIN = 80;

export function flowsheetToGraph(
  flowsheet: JsonDict,
  rawFiles?: { [relPath: string]: string },
): FlowsheetGraph {
  const view = readFlowsheet(flowsheet, rawFiles);
  // Composite views (sectors as units) draw wider cards AND carry the
  // `Producer/Port` namespaced label on inter-sector edges -- both eat
  // horizontal room.  Bump the layer step so adjacent cards don't kiss.
  const xStep = view.units.some((u) => u.type === "sector")
    ? X_STEP_COMPOSITE
    : X_STEP;

  const producers = new Map<string, string>(); // stream -> unit name
  const consumers = new Map<string, string[]>();
  for (const u of view.units) {
    for (const out of u.outputs) producers.set(out, u.name);
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) {
      const list = consumers.get(s) ?? [];
      list.push(u.name);
      consumers.set(s, list);
    }
  }

  // All stream names = explicit streams + every output mentioned.
  const allStreams = new Set<string>();
  for (const s of Object.keys(view.streams)) allStreams.add(s);
  for (const u of view.units) for (const o of u.outputs) allStreams.add(o);

  // Feeds: streams declared as inputs to a unit but never produced.
  const feeds = new Set<string>();
  for (const u of view.units) {
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) if (!producers.has(s)) feeds.add(s);
  }

  // Products: streams produced but never consumed.
  const products = new Set<string>();
  for (const s of allStreams) {
    if (producers.has(s) && !consumers.has(s)) products.add(s);
  }

  // Layer index for every unit (longest path from any feed).
  //
  // Recycle / tear streams make this directed graph CYCLIC: a recycle
  // stream is produced by a downstream unit and consumed by an upstream
  // one (e.g. process03's `recycle`, evaporator05's `V1`/`V2`).
  // Two complementary cycle-breakers:
  //   (1) `visiting` -- the recursion stack; re-entering a unit returns
  //       layer 1 (treats the back-edge as non-contributing).  Saves us
  //       from infinite recursion on any cycle, even an unmarked one.
  //   (2) `tearSet` -- streams the case author EXPLICITLY declared as
  //       tears.  Skipping them in computeLayer makes the layout read
  //       the right direction: the recycle's producer (e.g. Splitter)
  //       stays DOWNSTREAM of the consumer (e.g. Mixer) instead of
  //       being pulled in front of it by the longest-path rule.  The
  //       tear edge is still drawn -- just as a back-edge in the
  //       final React Flow render.
  const tearSet = view.tearStreams ?? new Set<string>();
  const unitLayer = new Map<string, number>();
  const unitsByName = new Map(view.units.map((u) => [u.name, u]));
  const visiting = new Set<string>();
  const computeLayer = (name: string): number => {
    const cached = unitLayer.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) return 1;   // back-edge of an unmarked cycle: break it
    visiting.add(name);
    const u = unitsByName.get(name);
    if (!u) { visiting.delete(name); return 0; }
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    let max = 1;
    for (const s of ins) {
      if (tearSet.has(s)) continue;       // declared tear -> ignore for layering
      const prod = producers.get(s);
      if (prod) max = Math.max(max, computeLayer(prod) + 1);
    }
    visiting.delete(name);
    unitLayer.set(name, max);
    return max;
  };
  for (const u of view.units) computeLayer(u.name);

  const maxLayer = Math.max(1,...unitLayer.values());

  // Group nodes by layer for vertical distribution.
  const layered: { layer: number; id: string; kind: "feed" | "unit" | "product" }[] = [];
  for (const f of feeds) layered.push({ layer: 0, id: f, kind: "feed" });
  for (const u of view.units) {
    layered.push({ layer: unitLayer.get(u.name)!, id: u.name, kind: "unit" });
  }
  // Product terminals stack top->bottom grouped by their producing unit, and
  // WITHIN a unit by its output order -- except a vapour/liquid separator,
  // whose slots are (liquid, vapor) but which a PFD draws vapour-on-top: those
  // outputs are reversed so the LIQUID terminal lands at the BOTTOM (matching
  // the reversed output handles in UnitNode).
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
  const orderedProducts = [...products].sort(
    (a, b) => producerRankOf(a) - producerRankOf(b) || phaseRankOf(a) - phaseRankOf(b),
  );
  for (const p of orderedProducts) layered.push({ layer: maxLayer + 1, id: p, kind: "product" });

  const perLayer = new Map<number, string[]>();
  for (const item of layered) {
    const arr = perLayer.get(item.layer) ?? [];
    arr.push(item.id);
    perLayer.set(item.layer, arr);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [layer, ids] of perLayer) {
    const total = ids.length;
    ids.forEach((id, i) => {
      const x = X_ORIGIN + layer * xStep;
      const y = Y_ORIGIN + (i - (total - 1) / 2) * Y_STEP + 220;
      positions.set(id, { x, y });
    });
  }

  // Column ports that are HEAT-LINKED (consumed by some unit's energyInputs
  // `from <col>.<port>`, kind heat): their auto utility-stub is suppressed
  // and the column handle becomes a SOURCE feeding the link, not a target
  // for a utility stub.  Keyed "<col>:<port>".
  const heatLinked = new Set<string>();
  for (const cu of view.units)
    for (const ein of cu.energyInputs ?? [])
      if (ein.kind === "heat" && typeof ein.from === "string") {
        const d = ein.from.indexOf(".");
        if (d > 0) heatLinked.add(ein.from.slice(0, d) + ":" + ein.from.slice(d + 1));
      }

  // Units mechanically coupled by a WORK wire -- driven by one (an energyInput
  // of kind work) OR exporting their shaft to one (their port is some unit's
  // `from`).  Their W is mechanical, not grid electricity, so they get NO power
  // stub (mirrors the engine's allocateUtilities skip; no double-count).
  const workCoupled = new Set<string>();
  for (const cu of view.units)
    for (const ein of cu.energyInputs ?? [])
      if ((ein.kind ?? "work") === "work") {
        workCoupled.add(cu.name);
        if (typeof ein.from === "string") {
          const d = ein.from.indexOf(".");
          workCoupled.add(d > 0 ? ein.from.slice(0, d) : ein.from);
        }
      }

  // Build React Flow nodes.
  const nodes: Node[] = [];
  for (const f of feeds) {
    nodes.push({
      id: `stream:${f}`,
      type: "streamTerminal",
      // A feed is a plant INPUT: seed its terminal with the authored state, or
      // the ambient default (25 C / 1 atm) when the case carries it in 0/ we do
      // not yet read here -- never a blank 0 K / 0 Pa.
      data: { name: f, role: "feed",
              stream: view.streams[f] ?? { F: 0, T: AMBIENT_T, P: AMBIENT_P, composition: {} } },
      position: positions.get(f)!,
    });
  }
  for (const u of view.units) {
    const linkedPorts = ["reboiler", "condenser"].filter((p) => heatLinked.has(`${u.name}:${p}`));
    // Does this unit get a ⚡ power stub? (a grid-drawing pump/compressor or a
    // generator) -> it needs a docking handle for the stub edge.
    const powerStub = u.type === "electricLoad"
      || (POWER_DRAW_TYPES.has(u.type) && !workCoupled.has(u.name));
    nodes.push({
      id: `unit:${u.name}`,
      type: "unitNode",
      data: { unit: u, heatLinkedPorts: linkedPorts, powerStub },
      position: positions.get(u.name)!,
    });
  }
  for (const p of products) {
    nodes.push({
      id: `stream:${p}`,
      type: "streamTerminal",
      data: { name: p, role: "product", stream: view.streams[p] ?? null },
      position: positions.get(p)!,
    });
  }

  // A distillation column carries two intrinsic heat duties: a reboiler
  // (heating, at the base) and a condenser (cooling, at the top).  Dock a
  // synthetic UTILITY stub to the column's bottom and top so "heat at the
  // base, cold at the top" reads straight off the canvas.  Values are
  // filled post-run from the column KPIs (Q_reboiler_kW / Q_condenser_kW);
  // the utilityAllocation report sizes the real steam / cooling water.
  // They belong to the toggleable `utility` class.
  for (const u of view.units) {
    if (!COLUMN_TYPES.has(u.type)) continue;
    const p = positions.get(u.name);
    if (!p) continue;
    // Explicit per-port utility named in the dict (operation.<port>.utility),
    // if any --- shown on the stub; otherwise the stub just reads its tier
    // (the auto-picked utility lives in the utilityAllocation report).
    const portUtility = (port: string): string | undefined => {
      const op = u.operation as { [k: string]: JsonValue } | undefined;
      const blk = op?.[port] as { utility?: JsonValue } | undefined;
      return typeof blk?.utility === "string" ? blk.utility : undefined;
    };
    // Heat-linked ports show the link edge instead of a utility stub.
    if (!heatLinked.has(`${u.name}:reboiler`))
      nodes.push({
        id: `duty:${u.name}:reboiler`,
        type: "streamTerminal",
        data: { name: "reboiler", role: "utility", dutyPort: "reboiler",
                ownerUnit: u.name, tier: "heating", utilityName: portUtility("reboiler") },
        position: { x: p.x + 35, y: p.y + 175 },
      });
    if (!heatLinked.has(`${u.name}:condenser`))
      nodes.push({
        id: `duty:${u.name}:condenser`,
        type: "streamTerminal",
        data: { name: "condenser", role: "utility", dutyPort: "condenser",
                ownerUnit: u.name, tier: "cooling", utilityName: portUtility("condenser") },
        position: { x: p.x + 35, y: p.y - 150 },
      });
  }

  // A heater / cooler / heat-exchanger carries ONE intrinsic heat duty (kpi
  // "Q").  Dock a single utility stub to it -- below if heating, above if
  // cooling -- mirroring the column's reboiler/condenser.  Value + allocated
  // utility + €/h fill post-run from the result (FlowCanvas reads kpi "Q_kW"
  // and the utilityAllocation row with empty port).
  for (const u of view.units) {
    if (!HEAT_DUTY_TYPES.has(u.type)) continue;
    const p = positions.get(u.name);
    if (!p) continue;
    // Pre-run tier guess: from a numeric Q in the dict, else the type
    // (cooler -> cooling, otherwise heating).  Post-run the sign of the
    // resolved Q is authoritative (FlowCanvas/StreamTerminal).
    const opQ = (u.operation as { [k: string]: JsonValue } | undefined)?.["Q"];
    const tier: "heating" | "cooling" =
      typeof opQ === "number" ? (opQ >= 0 ? "heating" : "cooling")
      : COOLING_DUTY_TYPES.has(u.type) ? "cooling" : "heating";
    const opUtil = (u.operation as { utility?: JsonValue } | undefined)?.["utility"];
    nodes.push({
      id: `duty:${u.name}:Q`,
      type: "streamTerminal",
      data: { name: "duty", role: "utility", dutyPort: "Q", ownerUnit: u.name,
              tier, utilityName: typeof opUtil === "string" ? opUtil : undefined },
      position: { x: p.x + 35, y: tier === "cooling" ? p.y - 150 : p.y + 150 },
    });
  }

  // Jacket stub: a dynamicCSTR's heat-transfer jacket (operation.UA + T_jacket)
  // is its energy boundary -- heat is a STREAM, never a Q= on the node.  Dock a
  // utility stub keyed dutyPort:"jacket", tier from sign(T_jacket - T_initial)
  // (jacket above the holdup => heating, below => cooling).  Only when UA > 0
  // (no UA => an adiabatic vessel, no jacket).  T_jacket may be driven by a
  // controller at run time; the live scrub overlay (slice 2) updates the tier.
  for (const u of view.units) {
    if (!DYNAMIC_HOLDUP_TYPES.has(u.type)) continue;
    const op = u.operation as { [k: string]: JsonValue } | undefined;
    const ua = scalarToSI(op?.["UA"]);
    if (!(Number.isFinite(ua) && ua > 0)) continue;
    const p = positions.get(u.name);
    if (!p) continue;
    const tJacket = scalarToSI(op?.["T_jacket"]);
    // Holdup initial T sets the pre-run jacket tier sign.  It lives in
    // 0/internalState now (the retired inline initial{} block was the legacy
    // home); fall back to that legacy block for an un-migrated case.
    const rawUnits = (flowsheet["units"] ?? []) as JsonDict[];
    const rawUnit = Array.isArray(rawUnits)
      ? rawUnits.find((ru) => String(ru["name"]) === u.name) : undefined;
    const tInitInline = scalarToSI((rawUnit?.["initial"] as JsonDict | undefined)?.["T"]);
    const tInit = Number.isFinite(tInitInline)
      ? tInitInline : (zeroInternalT(rawFiles, u.name) ?? NaN);
    const heating = !(Number.isFinite(tJacket) && Number.isFinite(tInit) && tJacket < tInit);
    nodes.push({
      id: `duty:${u.name}:jacket`,
      type: "streamTerminal",
      data: { name: "jacket", role: "utility", dutyPort: "jacket", ownerUnit: u.name,
              tier: heating ? "heating" : "cooling" },
      position: { x: p.x + 35, y: heating ? p.y + 150 : p.y - 150 },
    });
  }

  // ⚡ Power stub: a pump / compressor MOTOR draws grid electricity (its W comes
  // from the grid when not wired), an electricLoad GENERATOR feeds it back.
  // The symmetric twin of the heat duty stub; value + €/h fill post-run from
  // the utilityAllocation power rows (FlowCanvas).
  for (const u of view.units) {
    const isDraw = POWER_DRAW_TYPES.has(u.type);
    const isGen  = u.type === "electricLoad";
    if (!isDraw && !isGen) continue;
    if (isDraw && workCoupled.has(u.name)) continue;   // mechanically driven -> no grid stub
    const p = positions.get(u.name);
    if (!p) continue;
    nodes.push({
      id: `duty:${u.name}:power`,
      type: "streamTerminal",
      data: { name: "power", role: "utility", dutyPort: "power", ownerUnit: u.name,
              tier: "power",
              utilityName: isGen ? "electricity (generated)" : "electricity" },
      position: { x: p.x + 35, y: p.y + 150 },
    });
  }

  // Build edges. One per (stream, consumer) pair so multi-consumer streams render.
  //
  // Each unit-node now exposes ONE handle per input stream (left side)
  // and ONE handle per output stream (right side), with handle id =
  // stream name (see UnitNode.tsx).  We pass targetHandle / sourceHandle
  // so React Flow lands each edge on its dedicated dot, instead of
  // bunching everything onto a single connector.
  const edges: Edge[] = [];
  for (const u of view.units) {
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) {
      const sourceUnit = producers.get(s);
      const source = sourceUnit ? `unit:${sourceUnit}` : `stream:${s}`;
      const isTear = tearSet.has(s);
      edges.push({
        id: `e:${source}->unit:${u.name}:${s}`,
        source,
        target: `unit:${u.name}`,
        // On the upstream side: if it's a unit, route from that
        // unit's output handle for stream `s`.  If it's a feed
        // terminal, the terminal has no handle ids -- React Flow
        // attaches to its default.
...(sourceUnit ? { sourceHandle: s } : {}),
        targetHandle: s,
        label: s,
        // Tear edges route via the custom TearEdge component, which
        // draws an explicit U-turn BELOW the unit row.  Default
        // smoothstep for same-row back-edges disappears behind
        // intermediate nodes; the custom path keeps the recycle
        // visually distinct.
        type: isTear ? "tear" : "smoothstep",
        animated: false,
        ...(isTear ? { data: { kind: "tear" }, zIndex: 1000 } : {}),
      });
    }
    for (const o of u.outputs) {
      if (!consumers.has(o)) {
        edges.push({
          id: `e:unit:${u.name}->stream:${o}:${o}`,
          source: `unit:${u.name}`,
          target: `stream:${o}`,
          sourceHandle: o,
          label: o,
          type: "smoothstep",
          animated: false,
        });
      }
    }
    // Energy wires.  One edge per consumer's `energyInputs`
    // entry, source = producer's matching `energyOutputs.name`, target =
    // this unit (the consumer's `target` operation key).  Styled dashed
    // + warm accent so the energy graph is visually distinct from the
    // material graph.  Both endpoints are units --- there is no
    // intermediate stream node (energy is bookkeeping, not a stream).
    if (u.energyInputs) {
      for (const ein of u.energyInputs) {
        const dot = ein.from.indexOf(".");
        if (dot < 0) continue;
        const srcUnit = ein.from.slice(0, dot);
        const srcPort = ein.from.slice(dot + 1);
        const isHeat = ein.kind === "heat";
        // A heat-link FROM a column's condenser/reboiler leaves that port's
        // handle (top / base); otherwise the producer's generic energy-out.
        const fromColumnPort = srcPort === "condenser" || srcPort === "reboiler";
        edges.push({
          id: `e:energy:${srcUnit}->unit:${u.name}:${ein.target}`,
          source: `unit:${srcUnit}`,
          target: `unit:${u.name}`,
          // Attach to the producer's `energy-out` source handle (or the
          // column port handle) and the consumer's `energy-in` target handle.
          // Without these the edge has no dot to land on --- especially for a
          // stream-less consumer like electricLoad.
          sourceHandle: fromColumnPort ? srcPort : "energy-out",
          targetHandle: "energy-in",
          label: ein.kind === "heat" ? `Q -> ${ein.target}` : `W -> ${ein.target}`,
          type: "smoothstep",
          animated: false,
          style: {
            stroke: isHeat ? "#e8590c" : "#fab005",   // heat = orange, work = amber
            strokeWidth: 1.6,
            strokeDasharray: "6 4",
          },
          labelStyle: { fill: isHeat ? "#e8590c" : "#fab005", fontWeight: 600 },
          data: { kind: "energy", energyKind: ein.kind },
        });
      }
    }
  }

  // RECIPE edges (batch campaigns).  A `transfer` is an EVENT, not a
  // permanent stream -- the topology is honest -- but two disconnected
  // vessels teach the wrong story (Vitor's batch audit, 2026-07-20).  Draw
  // each recipe transfer as a dashed edge labelled with its trigger time,
  // and a batchStill's continuous `dischargeTo` as a dashed edge into its
  // receiver.  Drawing only: the recipe block stays the source of truth.
  const recipeRaw = (flowsheet as { recipe?: unknown }).recipe;
  if (Array.isArray(recipeRaw)) {
    for (const evRaw of recipeRaw) {
      const ev = evRaw as { action?: unknown; from?: unknown; to?: unknown; time?: unknown };
      if (ev.action !== "transfer") continue;
      if (typeof ev.from !== "string" || typeof ev.to !== "string") continue;
      const t = typeof ev.time === "number" ? `${ev.time} s` : String(ev.time ?? "");
      edges.push({
        id: `e:recipe:${ev.from}->${ev.to}:${t}`,
        source: `unit:${ev.from}`,
        target: `unit:${ev.to}`,
        sourceHandle: "energy-out",
        targetHandle: "energy-in",
        label: `transfer @ ${t}`,
        type: "smoothstep",
        animated: false,
        style: { stroke: "#20c997", strokeWidth: 1.6, strokeDasharray: "4 4" },
        labelStyle: { fill: "#20c997", fontWeight: 600 },
        data: { kind: "recipe" },
      });
    }
  }
  for (const u of view.units) {
    const dt = (u as { dischargeTo?: unknown }).dischargeTo;
    if (typeof dt !== "string" || dt.length === 0) continue;
    edges.push({
      id: `e:discharge:${u.name}->${dt}`,
      source: `unit:${u.name}`,
      target: `unit:${dt}`,
      sourceHandle: "energy-out",
      targetHandle: "energy-in",
      label: "distillate (continuous)",
      type: "smoothstep",
      animated: false,
      style: { stroke: "#20c997", strokeWidth: 1.6, strokeDasharray: "4 4" },
      labelStyle: { fill: "#20c997", fontWeight: 600 },
      data: { kind: "recipe" },
    });
  }

  // Duty stubs -> column: a dashed UTILITY edge from each synthetic duty
  // terminal into the column's reboiler (base) / condenser (top) handle.
  // Coloured by tier (heating warm / cooling cyan); hidden with the
  // `utility` class toggle (handled in FlowCanvas).
  for (const u of view.units) {
    if (!COLUMN_TYPES.has(u.type)) continue;
    for (const port of ["reboiler", "condenser"] as const) {
      const heating = port === "reboiler";
      edges.push({
        id: `e:duty:${u.name}:${port}`,
        source: `duty:${u.name}:${port}`,
        target: `unit:${u.name}`,
        targetHandle: port,
        type: "smoothstep",
        animated: false,
        style: {
          stroke: heating ? "#e8590c" : "#22b8cf",   // heat = orange, cooling = cyan
          strokeWidth: 1.6,
          strokeDasharray: "6 3",
        },
        data: { kind: "duty", tier: heating ? "heating" : "cooling" },
      });
    }
  }

  // Duty stub -> heater/cooler: the same dashed UTILITY edge for the single-Q
  // units.  No dedicated target handle (the unit has stream handles only), so
  // it lands on the nearest border; tier colour follows the pre-run guess.
  for (const u of view.units) {
    if (!HEAT_DUTY_TYPES.has(u.type)) continue;
    const opQ = (u.operation as { [k: string]: JsonValue } | undefined)?.["Q"];
    const heating = typeof opQ === "number" ? opQ >= 0 : u.type !== "cooler";
    edges.push({
      id: `e:duty:${u.name}:Q`,
      source: `duty:${u.name}:Q`,
      target: `unit:${u.name}`,
      targetHandle: "Q",
      type: "smoothstep",
      animated: false,
      style: {
        stroke: heating ? "#e8590c" : "#22b8cf",
        strokeWidth: 1.6,
        strokeDasharray: "6 3",
      },
      data: { kind: "duty", tier: heating ? "heating" : "cooling" },
    });
  }

  // Jacket-stub edges: the same dashed UTILITY edge for a dynamicCSTR's jacket.
  // No dedicated target handle (the dynamic unit has stream handles only), so
  // it lands on the nearest border; tier colour follows the pre-run sign of
  // (T_jacket - T_initial).  Mirrors the heater/cooler duty edge.
  for (const u of view.units) {
    if (!DYNAMIC_HOLDUP_TYPES.has(u.type)) continue;
    const stub = nodes.find((n) => n.id === `duty:${u.name}:jacket`);
    if (!stub) continue;
    const heating = (stub.data as { tier?: string }).tier !== "cooling";
    edges.push({
      id: `e:duty:${u.name}:jacket`,
      source: `duty:${u.name}:jacket`,
      target: `unit:${u.name}`,
      type: "smoothstep",
      animated: false,
      style: {
        stroke: heating ? "#e8590c" : "#22b8cf",
        strokeWidth: 1.6,
        strokeDasharray: "6 3",
      },
      data: { kind: "duty", tier: heating ? "heating" : "cooling" },
    });
  }

  // ⚡ Power-stub edges: dashed yellow, dock on the unit's nearest border (no
  // dedicated handle).  One per power stub created above.
  for (const u of view.units) {
    const isDraw = POWER_DRAW_TYPES.has(u.type);
    const isGen  = u.type === "electricLoad";
    if (!isDraw && !isGen) continue;
    if (isDraw && workCoupled.has(u.name)) continue;
    edges.push({
      id: `e:duty:${u.name}:power`,
      source: `duty:${u.name}:power`,
      target: `unit:${u.name}`,
      targetHandle: "power",
      type: "smoothstep",
      animated: false,
      style: { stroke: "#9775fa", strokeWidth: 1.6, strokeDasharray: "6 3" },
      data: { kind: "duty", tier: "power" },
    });
  }

  // Attach the deterministic stream number to every edge, and the number +
  // (renamed) origin to every stream terminal -- a post-pass so each build
  // site above stays untouched.  Display-only; the SHOW toggle in FlowCanvas
  // decides whether the badges actually render.
  const streamNumbers = assignStreamNumbers(view);
  for (const e of edges) {
    const label = typeof e.label === "string" ? e.label : "";
    const num = streamNumbers.get(label);
    if (num !== undefined) e.data = {...(e.data as object ?? {}), num };
  }
  for (const node of nodes) {
    if (node.type !== "streamTerminal") continue;
    const nm = (node.data as { name?: string }).name ?? "";
    const num = streamNumbers.get(nm);
    const origin = view.origins?.[nm];
    if (num !== undefined || origin) {
      node.data = {
        ...(node.data as object),
        ...(num !== undefined ? { streamNumber: num } : {}),
        ...(origin ? { streamOrigin: origin } : {}),
      };
    }
  }

  return { nodes, edges, view, streamNumbers };
}

// A COMPOSITE node (fractal): `children` + `connections` instead of a
// `units` list.  Project it to a FlowsheetView so the existing layout/edges
// code draws the sectors as boxes wired by the connections.  Each connection's
// `from` IS the stream name (qualified `child/port` or a bare boundary inlet);
// a child produces every `from` that starts with its name, and consumes the
// `from` of every connection whose `to` points at it.
//
// When a connection routes a child's port to a `boundary.outlets` name, the
// child's output is RENAMED to the boundary-outlet name on the canvas, so the
// student reads `Powder` (the plant's product, declared in `boundary.outlets`)
// instead of `DRYING/Powder` (the child's internal port path).  Every name
// on the diagram is then a name the author typed into the dict's
// `boundary {...}` block -- the diagram speaks the dict's language.
//
// Tear streams (this composite's `tearStreams (...)`): treated as INTERNAL
// recycle, NOT as feed and NOT as product.  The producer (a `child/port` whose
// connection's `to` is the tear name) gets its output renamed to the tear name,
// AND any connection `from <tearname>` references the same tear name on the
// consumer side -- a single name, just like the C++ engine treats it after
// flattening.  The longest-path layout then draws a back-edge that visually
// closes the recycle loop.
// Normalise BOTH connection grammars to edges {name, from, to}: the named-edge
// dict `connections { liquor { from A; to B; } }` (the KEY is the stream ID) and
// the legacy anonymous list `connections ( { from; to; } )`.  Shared by every
// consumer that walks the graph, so no reader ever iterates a dict as a list.
export function readEdges(
  flowsheet: JsonDict,
): { name: string; from: string; to: string }[] {
  const raw = flowsheet["connections"];
  const edges: { name: string; from: string; to: string }[] = [];
  if (Array.isArray(raw)) {
    for (const c of raw as JsonDict[])
      edges.push({ name: "", from: String((c as JsonDict)["from"] ?? ""), to: String((c as JsonDict)["to"] ?? "") });
  } else if (raw && typeof raw === "object") {
    for (const [name, v] of Object.entries(raw as JsonDict))
      if (v && typeof v === "object" && !Array.isArray(v))
        edges.push({ name, from: String((v as JsonDict)["from"] ?? ""), to: String((v as JsonDict)["to"] ?? "") });
  }
  return edges;
}

// `units` is EITHER inline dict blocks (a flat case) OR a WORD list of dignified
// folder names (a composite: three unit ops in their own folders).  Return the
// folder names, or [] when `units` is inline / absent.
// Resolve a fractal MEMBER's flowsheetDict text from the case rawFiles, mirroring
// the engine's resolveMemberBase: a member `<name>` may live directly at
// `<name>/`, under `sectors/<name>/` (a real sector), or `unitOperations/<name>/`
// (a dignified unit op) -- each with the dict at `system/flowsheetDict` or the lean
// `flowsheetDict`.
function memberFlowsheetText(
  rawFiles: { [relPath: string]: string } | undefined, child: string,
): string | undefined {
  if (!rawFiles) return undefined;
  for (const base of [child, `sectors/${child}`, `unitOperations/${child}`])
    for (const p of [`${base}/system/flowsheetDict`, `${base}/flowsheetDict`])
      if (rawFiles[p] !== undefined) return rawFiles[p];
  return undefined;
}

export function unitFolderNames(flowsheet: JsonDict): string[] {
  const u = flowsheet["units"];
  return Array.isArray(u) && u.every((x) => typeof x === "string")
    ? (u as string[])
    : [];
}

/** A flowsheet's composite MEMBERS: `sectors` (composites) + dignified `units`
 *  (folder unit ops).  Empty for a flat/leaf case. */
export function compositeMembers(flowsheet: JsonDict): string[] {
  return [
    ...((flowsheet["sectors"] ?? []) as string[]),
    ...unitFolderNames(flowsheet),
  ];
}

// Tear streams are declared in the flowsheetDict (legacy) OR in system/solverDict
// (the clean home) -- read from whichever carries them, so the recycle is still
// drawn as a TEAR even after the designation moved to solverDict.
function readTearStreams(flowsheet: JsonDict, rawFiles?: { [relPath: string]: string }): string[] {
  const inline = (flowsheet["tearStreams"] ?? []) as string[];
  if (Array.isArray(inline) && inline.length > 0) return inline;
  const sd = rawFiles?.["system/solverDict"];
  if (sd) {
    try {
      const j = toJson(parse(sd, { sourceName: "solverDict" })) as JsonDict;
      const t = j["tearStreams"];
      if (Array.isArray(t)) return t as string[];
    } catch { /* unparseable solverDict -- ignore */ }
  }
  return [];
}

function readComposite(
  flowsheet: JsonDict,
  rawFiles?: { [relPath: string]: string },
): FlowsheetView {
  // Members are folders under `sectors` (composites) and/or `units` (dignified
  // unit ops) -- both flattened the same way, the keyword is a semantic label.
  const children = [
    ...((flowsheet["sectors"] ?? []) as string[]),
    ...unitFolderNames(flowsheet),
  ];

  // Named-edge grammar: `connections { liquor { from A; to B; } }` -- the KEY is
  // the stream ID; from/to are ports.  Normalise it (and the legacy anonymous
  // list `connections ( { from; to; } )`) to edges {name, from, to}.
  type Edge = { name: string; from: string; to: string };
  const edges: Edge[] = [];
  const rawConns = flowsheet["connections"];
  if (Array.isArray(rawConns)) {
    for (const c of rawConns as JsonDict[])
      edges.push({ name: "", from: String(c["from"] ?? ""), to: String(c["to"] ?? "") });
  } else if (rawConns && typeof rawConns === "object") {
    for (const [name, v] of Object.entries(rawConns as JsonDict))
      if (v && typeof v === "object" && !Array.isArray(v))
        edges.push({ name, from: String((v as JsonDict)["from"] ?? ""), to: String((v as JsonDict)["to"] ?? "") });
  }
  const tears = new Set<string>(readTearStreams(flowsheet, rawFiles));

  // Boundary: an explicit legacy block, OR inferred from edge shape in this
  // domain -- to-only = inlet, from-only = outlet (named-edge world, no boundary{}).
  const boundary = (flowsheet["boundary"] ?? {}) as JsonDict;
  const hasBoundary = Array.isArray(boundary["inlets"]) || Array.isArray(boundary["outlets"]);
  const inlets = hasBoundary
    ? (boundary["inlets"] ?? []) as string[]
    : edges.filter((e) => !e.from && e.to).map((e) => e.name);
  const outlets = new Set<string>(hasBoundary
    ? (boundary["outlets"] ?? []) as string[]
    : edges.filter((e) => e.from && !e.to).map((e) => e.name));

  // A producer port `child/port` -> the edge NAME (the stream) it produces.
  const edgeFromPort = new Map<string, string>();
  for (const e of edges) if (e.name && e.from) edgeFromPort.set(e.from, e.name);

  // For each child name, peek at its own flowsheetDict (when we have
  // rawFiles) to see whether it's a COMPOSITE sub-sector (has
  // `children`) or a LEAF unit op (has `type`).  The canvas badge
  // should then read the unit op's real type (cstr, isothermalFlash,
  // ...) instead of a generic "sector" -- without this the FERMENTATION
  // sub-case drew Mixer / Fermentor / Flash / Splitter all as SECTORs.
  const childType = (child: string): string => {
    if (!rawFiles) return "sector";
    const text = memberFlowsheetText(rawFiles, child);
    if (!text) return "sector";
    try {
      const ast = toJson(parse(text, { sourceName: child + "/flowsheetDict" })) as JsonDict;
      if (Array.isArray(ast["sectors"]) || unitFolderNames(ast).length > 0) return "sector";
      if (typeof ast["type"] === "string") return ast["type"] as string;
    } catch {
      // unparseable: fall back to sector
    }
    return "sector";
  };

  // `from` -> display name.  Rename to:
  //   - the boundary outlet name when `to` lands in boundary.outlets
  //   - the tear name when `to` is a declared tear (so producer + consumer
  //     reference the same canonical stream name, which makes the recycle
  //     a back-edge instead of a phantom feed + phantom product)
  const renameForOutlet = new Map<string, string>();
  // Boundary outlet display-name -> its child-qualified origin, but ONLY when
  // the parent genuinely RENAMES it (the displayed name differs from the
  // child's own outlet leaf).  Surfaced on the terminal so the rename is
  // visible (forum 2026-06-15: announce, don't ban, don't hide).
  const origins: { [displayName: string]: string } = {};
  for (const e of edges) {
    if (e.name) continue;   // a named edge IS its own identity -- no rename
    if (outlets.has(e.to)) {
      renameForOutlet.set(e.from, e.to);
      const leaf = e.from.includes("/") ? e.from.slice(e.from.lastIndexOf("/") + 1) : e.from;
      if (e.to !== leaf) origins[e.to] = e.from;   // e.g. Stack -> DRYING/ExhaustClean
    }
    else if (tears.has(e.to)) renameForOutlet.set(e.from, e.to);
  }
  // Display a producer port as its stream: the edge NAME (named edges), else a
  // legacy boundary/tear rename, else the port itself.
  const display = (name: string): string =>
    edgeFromPort.get(name) ?? renameForOutlet.get(name) ?? name;

  const units: UnitSpec[] = children.map((child) => ({
    name: child,
    type: childType(child),
    // Stream feeding / leaving this child = the edge NAME (named edges), else
    // the producer `from` (legacy anonymous).
    in: edges.filter((e) => e.to.startsWith(child + "/")).map((e) => e.name || e.from),
    outputs: [
      ...new Set(
        edges
          .filter((e) => e.from.startsWith(child + "/"))
          .map((e) => e.name || display(e.from)),
      ),
    ],
    operation: {},
  }));

  // Seed the streams map from the per-stream 0/ state (the only home of
  // authored stream state) -- the feed terminal then shows its real
  // conditions pre-run AND after a reset (the run result clears, the
  // authored input does not).  Tear streams are NOT seeded here: they render
  // invisible (the recycle back-edge carries the meaning), not as feed
  // terminals.
  const streams: { [name: string]: StreamSpec } = {};
  // Read EVERY stream's state from `0/<stream>` (the plant run / drill projection
  // materialised it) -- inlets, internal edges AND outlets, so a drilled sector
  // shows real F/T/P/composition on all its streams, not just the feeds.  An
  // inlet with no 0/ falls back to ambient (honestly empty).
  for (const e of edges) {
    if (!e.name || tears.has(e.name)) continue;
    const spec = streamStateSpec(zeroStateText(rawFiles, e.name));
    if (spec) streams[e.name] = spec;
  }
  for (const inl of inlets)
    if (!streams[inl])
      streams[inl] = { F: 0, T: AMBIENT_T, P: AMBIENT_P, composition: {} };

  return { streams, units, tearStreams: tears, origins };
}

// A LEAF node (fractal): `type` + `operation` + `boundary` instead of
// a `units` list -- one unit op (its own flowsheet of one).  Project it to a
// single-unit view so the canvas draws the unit with its feed/product
// terminals when you open a leaf node on its own.
// Parse ONE 0/ stream-state file (`componentMolarFlows { c <flow>; } T; P;`)
// into a display StreamSpec.  A migrated case carries its stream state HERE, not
// in the flowsheetDict -- so a drilled unit / composite reads its real values
// from 0/<stream> (the plant run materialised them) instead of showing blanks.
/** Resolve a stream's 0/ state TEXT under the engine's ownership layout: a
 *  stream may sit at the root (`0/RawJuice`) OR be sector-owned
 *  (`0/CONCENTRATION/PlantSteam`) -- a feed is owned by its consuming sector, an
 *  internal edge by its producing sector.  Try the root path first (unchanged
 *  behaviour for flat cases); else accept a UNIQUE `0/.../<name>` match.  On an
 *  ambiguous base name (the same local name in two sectors) return undefined --
 *  never guess the wrong sector's file; the caller falls back to authored/ambient. */
export function zeroStatePath(
  rawFiles: { [relPath: string]: string } | undefined, name: string,
): string | undefined {
  if (!rawFiles) return undefined;
  if (rawFiles[`0/${name}`] !== undefined) return `0/${name}`;
  const hits = Object.keys(rawFiles).filter(
    (k) => k.startsWith("0/") && k.endsWith(`/${name}`));
  return hits.length === 1 ? hits[0] : undefined;
}

export function zeroStateText(
  rawFiles: { [relPath: string]: string } | undefined, name: string,
): string | undefined {
  const path = zeroStatePath(rawFiles, name);
  return path === undefined ? undefined : rawFiles![path];
}

/** The flowsheet's FEED stream names, inferred from TOPOLOGY (consumed by a
 *  unit, produced by none; or a to-only named edge; or a declared boundary
 *  inlet) -- the stream-state architecture's role rule.  Works for flat,
 *  composite and leaf dict shapes. */
export function topologyFeedNames(fs: JsonDict | undefined): string[] {
  if (!fs) return [];
  const consumed = new Set<string>();
  const produced = new Set<string>();
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string" && v.length > 0 ? [v] : [];
  for (const uv of (fs["units"] ?? []) as JsonValue[]) {
    if (!uv || typeof uv !== "object" || Array.isArray(uv)) continue;
    const u = uv as JsonDict;
    for (const n of asList(u["in"] ?? u["inputs"])) consumed.add(n);
    for (const n of asList(u["outputs"])) produced.add(n);
  }
  const feeds = new Set<string>();
  for (const n of consumed) if (!produced.has(n)) feeds.add(n);
  for (const e of readEdges(fs)) if (!e.from && e.to) feeds.add(e.name);
  const boundary = (fs["boundary"] ?? {}) as JsonDict;
  for (const n of asList(boundary["inlets"])) feeds.add(n);
  return [...feeds];
}

export function streamStateSpec(text: string | undefined): StreamSpec | null {
  if (!text) return null;
  let d: JsonDict;
  try { d = toJson(parse(text, { sourceName: "0/state" })) as JsonDict; }
  catch { return null; }
  const flowsBlk = (d["componentMolarFlows"] ?? d["componentFlows"]) as JsonDict | undefined;
  if (!flowsBlk || typeof flowsBlk !== "object" || Array.isArray(flowsBlk)) return null;
  const flows: Record<string, number> = {};
  let F = 0;
  for (const [k, v] of Object.entries(flowsBlk)) {
    const n = scalarToSI(v);
    if (Number.isFinite(n)) { flows[k] = n; F += n; }
  }
  const spec: StreamSpec = { F, T: AMBIENT_T, P: AMBIENT_P, composition: {} };
  if (F > 0) for (const [k, n] of Object.entries(flows)) spec.composition[k] = n / F;
  const t = scalarToSI(d["T"]); if (Number.isFinite(t) && t > 0) spec.T = t;
  const p = scalarToSI(d["P"]); if (Number.isFinite(p) && p > 0) spec.P = p;
  const vf = scalarToSI(d["vaporFraction"] ?? d["vapourFraction"]);
  if (Number.isFinite(vf)) spec.vf = vf;
  return spec;
}

function readLeaf(flowsheet: JsonDict, rawFiles?: { [relPath: string]: string }): FlowsheetView {
  const boundary = (flowsheet["boundary"] ?? {}) as JsonDict;
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string" && v.length > 0 ? [v] : [];
  // A dignified leaf NAMES its streams directly (sequential-modular: inputs /
  // outputs); a legacy leaf used a `boundary { inlets; outlets }` block.
  const inlets = flowsheet["inputs"] !== undefined || flowsheet["in"] !== undefined
    ? asList(flowsheet["inputs"] ?? flowsheet["in"])
    : asList(boundary["inlets"]);
  const outlets = flowsheet["outputs"] !== undefined
    ? asList(flowsheet["outputs"])
    : asList(boundary["outlets"]);
  const name = String(flowsheet["name"] ?? "unit");
  // Read each stream's state from 0/<stream> (the drilled unit's own snapshot,
  // materialised by the plant run); fall back to ambient for an unfed inlet.
  const streams: { [name: string]: StreamSpec } = {};
  for (const s of [...inlets, ...outlets]) {
    const spec = streamStateSpec(zeroStateText(rawFiles, s));
    if (spec) streams[s] = spec;
    else if (inlets.includes(s)) streams[s] = { F: 0, T: AMBIENT_T, P: AMBIENT_P, composition: {} };
  }
  return {
    streams,
    units: [
      {
        name,
        type: String(flowsheet["type"]),
        in: inlets,
        outputs: outlets,
        operation: (flowsheet["operation"] ?? {}) as JsonDict,
      },
    ],
  };
}

// Ambient reference state for a stream we have to seed WITHOUT an authored
// value (a reset, or an inlet whose 0/ state is missing): 25 C and 1 atm --
// a sensible physical default, NEVER 0 K / 0 Pa (which reads as a
// non-physical blank).  Flow stays 0 (an unknown inlet flow is honestly empty).
const AMBIENT_T = 298.15;      // K   (25 C)
const AMBIENT_P = 101325;      // Pa  (1 atm)

// A dynamicCSTR's feed lives in 0/streamFaces (the authored inlet face).  The
// face carries T, P and per-species molarFlows{} (F is their sum,
// composition their normalisation).
function feedSpecFromFace(face: JsonValue | undefined): StreamSpec {
  const spec: StreamSpec = { F: 0, T: AMBIENT_T, P: AMBIENT_P, composition: {} };
  if (!face || typeof face !== "object" || Array.isArray(face)) return spec;
  const blk = face as JsonDict;
  const t = scalarToSI(blk["T"]);
  if (Number.isFinite(t) && t > 0) spec.T = t;
  const p = scalarToSI(blk["P"]);
  if (Number.isFinite(p) && p > 0) spec.P = p;
  const mf = blk["molarFlows"];
  if (mf && typeof mf === "object" && !Array.isArray(mf)) {
    let F = 0;
    for (const [k, v] of Object.entries(mf as JsonDict)) {
      const n = scalarToSI(v);
      if (Number.isFinite(n)) { spec.composition[k] = n; F += n; }
    }
    spec.F = F;
    if (F > 0) for (const k of Object.keys(spec.composition)) spec.composition[k]! /= F;
  }
  return spec;
}

// The 0/streamFaces file (a dynamic case's authored inlet faces) parsed to a faces
// map { "<unit>.feed": {bc, T, P, molarFlows}, ... }; {} when absent/unparseable.
function zeroStreamsFaces(
  rawFiles: { [relPath: string]: string } | undefined,
): JsonDict {
  const text = rawFiles?.["0/streamFaces"];
  if (!text) return {};
  try {
    const j = toJson(parse(text)) as JsonDict;
    const blk = j["faces"];
    if (blk && typeof blk === "object" && !Array.isArray(blk)) return blk as JsonDict;
  } catch { /* unparseable -> no faces */ }
  return {};
}

// A dynamic unit's initial holdup T [K] from 0/internalState (the authored
// state, now that initial{} no longer lives inline in the flowsheet).  Sets the
// jacket tier sign pre-run; undefined when absent/unparseable.
function zeroInternalT(
  rawFiles: { [relPath: string]: string } | undefined, uname: string,
): number | undefined {
  const text = rawFiles?.["0/internalState"];
  if (!text) return undefined;
  try {
    const units = (toJson(parse(text)) as JsonDict)["units"];
    if (units && typeof units === "object" && !Array.isArray(units)) {
      const ud = (units as JsonDict)[uname];
      if (ud && typeof ud === "object" && !Array.isArray(ud)) {
        const t = scalarToSI((ud as JsonDict)["T"]);
        if (Number.isFinite(t) && t > 0) return t;
      }
    }
  } catch { /* unparseable -> undefined */ }
  return undefined;
}

// Does a parsed unit declare its OWN material wiring (in/inputs/outputs)?  When
// it does, the author is in control and the dynamic-holdup synthesis below
// stays out of the way (purely additive).
function hasExplicitStreams(u: JsonDict): boolean {
  const has = (k: string) => {
    const v = u[k];
    return typeof v === "string" ? v.length > 0 : Array.isArray(v) && v.length > 0;
  };
  return has("in") || has("inputs") || has("outputs");
}

function readFlowsheet(
  flowsheet: JsonDict,
  rawFiles?: { [relPath: string]: string },
): FlowsheetView {
  if (flowsheet["sectors"] !== undefined || unitFolderNames(flowsheet).length > 0)
    return readComposite(flowsheet, rawFiles);
  if (flowsheet["type"] !== undefined) return readLeaf(flowsheet, rawFiles);

  const unitsJson = (flowsheet["units"] ?? []) as JsonValue[];

  // Stream state lives in the per-stream 0/ files (the only authored home);
  // read every referenced stream from there so feed terminals show real
  // F/T/P/composition pre-run.  Names are collected from the unit pass below.
  const streams: { [name: string]: StreamSpec } = {};

  // Synthesised feed terminals for dynamic-holdup units (collected here,
  // merged into `streams` after the unit pass).
  const synthFeeds: { [name: string]: StreamSpec } = {};
  const faces = zeroStreamsFaces(rawFiles);

  const units: UnitSpec[] = (unitsJson as JsonDict[]).map((u) => {
    // A DYNAMIC continuous holdup unit (dynamicCSTR) declares its feed in
    // 0/streamFaces (the authored inlet face) plus an `operation{}` jacket,
    // instead of in/outputs.  Without a synthesis it renders as a lone box.
    // SYNTHESISE its feed + product streams: a `<name>.feed` terminal (read
    // from the 0/streamFaces face) and a `<name>.out` product (the name the
    // engine writes in <t>/streamFaces, so the live scrub overlay keys cleanly).
    // Additive: only when the unit declares no streams of its own.
    const uname = String(u["name"]);
    const utype = String(u["type"]);
    const feedFace = faces[`${uname}.feed`];
    if (DYNAMIC_HOLDUP_TYPES.has(utype)
        && feedFace !== undefined
        && !hasExplicitStreams(u)) {
      const feedName = `${uname}.feed`;
      synthFeeds[feedName] = feedSpecFromFace(feedFace);
      return {
        name: uname,
        type: utype,
        in: [feedName],
        outputs: [`${uname}.out`],
        operation: (u["operation"] ?? {}) as JsonDict,
        reaction: u["reaction"] !== undefined ? String(u["reaction"]) : undefined,
      };
    }
    // Multi-input units (mixer, evaporator with feed+steam,...) carry
    // `inputs (a b c );`; single-input units carry `in feed;`.  Either
    // form lands on UnitSpec.in --- the rest of the graph code already
    // handles both shapes.
    const inputs = (u["inputs"] ?? u["in"] ?? []) as string | string[];
    // Energy-wire ports.  Optional, both sides; absent on every
    // older case so the parse is a no-op.
    const eOuts = (u["energyOutputs"] ?? []) as JsonDict[];
    const eIns  = (u["energyInputs"]  ?? []) as JsonDict[];
    return {
      name: String(u["name"]),
      type: String(u["type"]),
      in: inputs,
      outputs: (u["outputs"] ?? []) as string[],
      operation: (u["operation"] ?? {}) as JsonDict,
      reaction: u["reaction"] !== undefined ? String(u["reaction"]) : undefined,
      energyOutputs: eOuts.length === 0
        ? undefined
      : eOuts.map((e) => ({
            name: String(e["name"]),
            kind: ((e["kind"] as string) ?? "work") as "work" | "heat",
            expression: String(e["expression"] ?? ""),
            unit: e["unit"] !== undefined ? String(e["unit"]) : undefined,
          })),
      energyInputs: eIns.length === 0
        ? undefined
      : eIns.map((e) => ({
            from: String(e["from"]),
            kind: ((e["kind"] as string) ?? "work") as "work" | "heat",
            target: String(e["target"]),
          })),
    };
  });

  // Every stream the units reference reads its state from 0/<stream>.
  for (const u of units) {
    const names = [
      ...(Array.isArray(u.in) ? u.in : u.in ? [u.in] : []),
      ...(Array.isArray(u.outputs) ? u.outputs : []),
    ];
    for (const nm of names) {
      if (nm in streams) continue;
      const spec = streamStateSpec(zeroStateText(rawFiles, nm));
      if (spec) streams[nm] = spec;
    }
  }

  // Merge synthesised dynamic-holdup feed specs (0/ state wins when present).
  for (const [name, spec] of Object.entries(synthFeeds)) {
    if (!(name in streams)) streams[name] = spec;
  }

  const flatTears = new Set<string>(readTearStreams(flowsheet, rawFiles));
  return { streams, units, tearStreams: flatTears };
}

