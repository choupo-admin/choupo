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
  for (const u of view.units) {
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    for (const s of ins) if (!produced.has(s)) add(s);   // boundary feeds first
  }
  for (const u of view.units) for (const o of u.outputs) add(o);   // then products
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
      data: { name: f, role: "feed", stream: view.streams[f] ?? null },
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
      data: { name: p, role: "product", stream: null },
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
    // Holdup initial T (from the `initial{}` block) sets the pre-run tier sign.
    const rawUnits = (flowsheet["units"] ?? []) as JsonDict[];
    const rawUnit = Array.isArray(rawUnits)
      ? rawUnits.find((ru) => String(ru["name"]) === u.name) : undefined;
    const tInit = scalarToSI((rawUnit?.["initial"] as JsonDict | undefined)?.["T"]);
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
function readComposite(
  flowsheet: JsonDict,
  rawFiles?: { [relPath: string]: string },
): FlowsheetView {
  const children = (flowsheet["children"] ?? []) as string[];
  const conns = (flowsheet["connections"] ?? []) as JsonDict[];
  const boundary = (flowsheet["boundary"] ?? {}) as JsonDict;
  const inlets = (boundary["inlets"] ?? []) as string[];
  const outlets = new Set<string>((boundary["outlets"] ?? []) as string[]);
  const tears = new Set<string>(
    (flowsheet["tearStreams"] ?? []) as string[],
  );
  const s = (c: JsonDict, k: string): string => String(c[k] ?? "");

  // For each child name, peek at its own flowsheetDict (when we have
  // rawFiles) to see whether it's a COMPOSITE sub-sector (has
  // `children`) or a LEAF unit op (has `type`).  The canvas badge
  // should then read the unit op's real type (cstr, isothermalFlash,
  // ...) instead of a generic "sector" -- without this the FERMENTATION
  // sub-case drew Mixer / Fermentor / Flash / Splitter all as SECTORs.
  const childType = (child: string): string => {
    if (!rawFiles) return "sector";
    const text = rawFiles[`${child}/system/flowsheetDict`];
    if (!text) return "sector";
    try {
      const ast = toJson(parse(text, { sourceName: child + "/flowsheetDict" })) as JsonDict;
      if (Array.isArray(ast["children"])) return "sector";
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
  for (const c of conns) {
    const from = s(c, "from");
    const to = s(c, "to");
    if (outlets.has(to)) {
      renameForOutlet.set(from, to);
      const leaf = from.includes("/") ? from.slice(from.lastIndexOf("/") + 1) : from;
      if (to !== leaf) origins[to] = from;   // e.g. Stack -> DRYING/ExhaustClean
    }
    else if (tears.has(to)) renameForOutlet.set(from, to);
  }
  const display = (name: string): string => renameForOutlet.get(name) ?? name;

  const units: UnitSpec[] = children.map((child) => ({
    name: child,
    type: childType(child),
    in: conns.filter((c) => s(c, "to").startsWith(child + "/")).map((c) => s(c, "from")),
    outputs: [
      ...new Set(
        conns
          .filter((c) => s(c, "from").startsWith(child + "/"))
          .map((c) => display(s(c, "from"))),
      ),
    ],
    operation: {},
  }));

  // Seed the streams map with boundary inlets.  Tear streams are NOT seeded
  // here: they would render as feed terminals (their own initial-guess block
  // doubles as a stream declaration in the dict, but on the canvas we want
  // them to be invisible -- the back-edge between Splitter and Mixer carries
  // the meaning).
  const streams: { [name: string]: StreamSpec } = {};
  for (const inl of inlets) streams[inl] = { F: 0, T: 0, P: 0, composition: {} };

  return { streams, units, tearStreams: tears, origins };
}

// A LEAF node (fractal): `type` + `operation` + `boundary` instead of
// a `units` list -- one unit op (its own flowsheet of one).  Project it to a
// single-unit view so the canvas draws the unit with its feed/product
// terminals when you open a leaf node on its own.
function readLeaf(flowsheet: JsonDict): FlowsheetView {
  const boundary = (flowsheet["boundary"] ?? {}) as JsonDict;
  const inlets = (boundary["inlets"] ?? []) as string[];
  const outlets = (boundary["outlets"] ?? []) as string[];
  const name = String(flowsheet["name"] ?? "unit");
  const streams: { [name: string]: StreamSpec } = {};
  for (const inl of inlets) streams[inl] = { F: 0, T: 0, P: 0, composition: {} };
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

// A dynamic continuous unit (dynamicCSTR) declares its feed in an `inlet{}`
// sub-dict: F + T as unit-bearing scalars and a `molarComposition {...}`.
// Project it to a display StreamSpec (SI numbers, normalised composition) so
// the synthesised `<unit>.feed` terminal reads the real feed conditions
// pre-run.  Scalars cross JSON as "<n> <unit>" strings; scalarToSI canonicalises.
function feedSpecFromInlet(inlet: JsonValue | undefined): StreamSpec {
  const spec: StreamSpec = { F: 0, T: 0, P: 0, composition: {} };
  if (!inlet || typeof inlet !== "object" || Array.isArray(inlet)) return spec;
  const blk = inlet as JsonDict;
  const f = scalarToSI(blk["F"]);
  if (Number.isFinite(f)) spec.F = f;
  const t = scalarToSI(blk["T"]);
  if (Number.isFinite(t)) spec.T = t;
  const p = scalarToSI(blk["P"]);
  if (Number.isFinite(p)) spec.P = p;
  const comp = blk["molarComposition"] ?? blk["composition"];
  if (comp && typeof comp === "object" && !Array.isArray(comp)) {
    for (const [k, v] of Object.entries(comp as JsonDict)) {
      const n = scalarToSI(v);
      if (Number.isFinite(n)) spec.composition[k] = n;
    }
  }
  return spec;
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
  if (flowsheet["children"] !== undefined) return readComposite(flowsheet, rawFiles);
  if (flowsheet["type"] !== undefined) return readLeaf(flowsheet);

  const streamsJson = (flowsheet["streams"] ?? {}) as JsonDict;
  const unitsJson = (flowsheet["units"] ?? []) as JsonValue[];

  const streams: { [name: string]: StreamSpec } = {};
  for (const [name, val] of Object.entries(streamsJson)) {
    const v = val as JsonDict;
    // Composition: prefer the explicit forms; fall back to
    // the legacy `composition` (which is molar by convention).
    const explicitComp =
      (v["molarComposition"] as { [k: string]: number } | undefined) ??
      (v["massComposition"]  as { [k: string]: number } | undefined) ??
      (v["composition"]      as { [k: string]: number } | undefined);
    // Flow declarations from: `molarFlows {... }` or
    // `massFlows {... }` carry per-species flows without a top-level
    // `F`.  Derive F (sum) and the composition (normalised) here so
    // the Property panel can show the stream regardless of which
    // syntax the case author used.
    const molarFlows = v["molarFlows"] as { [k: string]: number } | undefined;
    const massFlows  = v["massFlows"]  as { [k: string]: number } | undefined;
    let comp: { [k: string]: number } = explicitComp ?? {};
    let F = 0;
    if (typeof v["F"] === "number") {
      F = v["F"] as number;
    } else if (molarFlows || massFlows) {
      const flows = (molarFlows ?? massFlows)!;
      F = Object.values(flows).reduce((s, x) => s + x, 0);
      if (F > 0 && Object.keys(comp).length === 0) {
        comp = Object.fromEntries(Object.entries(flows).map(([k, x]) => [k, x / F]),
        );
      }
    }
    streams[name] = {
      F,
      T: typeof v["T"] === "number" ? (v["T"] as number) : 0,
      P: typeof v["P"] === "number" ? (v["P"] as number) : 0,
      composition: comp,
    };
  }

  // Synthesised feed terminals for dynamic-holdup units (collected here,
  // merged into `streams` after the unit pass).
  const synthFeeds: { [name: string]: StreamSpec } = {};

  const units: UnitSpec[] = (unitsJson as JsonDict[]).map((u) => {
    // A DYNAMIC continuous holdup unit (dynamicCSTR) carries an `inlet{}`
    // block + an `operation{}` jacket instead of in/outputs -- so without
    // this it renders as a lone box.  SYNTHESISE its feed + product streams
    // from the sub-dicts already on disk: a `<name>.feed` terminal (read from
    // inlet{}) and a `<name>.out` product (the name the engine writes in
    // <t>/streams, so the live scrub overlay keys cleanly).  Additive: only
    // when the unit declares no streams of its own.
    const uname = String(u["name"]);
    const utype = String(u["type"]);
    if (DYNAMIC_HOLDUP_TYPES.has(utype)
        && u["inlet"] !== undefined
        && !hasExplicitStreams(u)) {
      const feedName = `${uname}.feed`;
      synthFeeds[feedName] = feedSpecFromInlet(u["inlet"]);
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

  // Merge synthesised dynamic-holdup feed specs (don't clobber an explicit
  // `streams{}` entry of the same name, should one exist).
  for (const [name, spec] of Object.entries(synthFeeds)) {
    if (!(name in streams)) streams[name] = spec;
  }

  const flatTears = new Set<string>(
    (flowsheet["tearStreams"] ?? []) as string[],
  );
  return { streams, units, tearStreams: flatTears };
}

