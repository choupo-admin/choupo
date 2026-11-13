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
/*---------------------------------------------------------------------------*\
  LAYOUT FACTS -- what the RESULT published that the 3D view may SAY (DEV.md
  4c C229).

  The plot plan draws the layout block.  A guided tour, a click card, a colour
  by concentration and a KPI panel need more than the block carries: the
  stream table (composition), the sized items' sheets (with their units and
  costs) and the headline numbers.  This module gathers them, ONCE, from the
  RunResult -- and invents nothing.  A fact the engine did not publish is
  ABSENT here (never zero, never a default), and every surface that reads
  this object drops the sentence or the row for it: "no value, no line".

  PURE: no three.js, no DOM, tested without a screen.  The app builds a
  `LayoutFacts` from the run it holds; a surface with the layout block alone
  (the exported page, the pop-out tab) passes none, and the view then offers
  what the block carries -- pipe temperature and pressure, phase, flow, the
  sectors and items -- and says so.
\*---------------------------------------------------------------------------*/

import type {
  Economics, EquipmentItem, GlobalEnergyBoundary, PlantLayout, RunResult, StreamResult,
} from "../adapters/SolverAdapter.js";
import { parseDesignSheet, type DesignSheet } from "./designSheet.js";

/** One stream as the result's table states it; a field not published is absent. */
export interface FactStream {
  T?: number;            // K
  P?: number;            // Pa
  F?: number;            // kmol/s (overall)
  F_mass?: number;       // kg/s
  vf?: number;
  /** OVERALL mole fractions, as the stream table publishes them. */
  composition?: { [component: string]: number };
}

export interface FactSizing { key: string; value: number; unit: string }

/** One SIZED item (the engine's equipment row, with its sheet when read). */
export interface FactItem {
  id: string;
  tagNo?: string;
  type: string;
  material?: string;
  basis?: string;
  /** From the design sheet, WITH the unit the sizer declared; empty when the
   *  sheet was not read (a number with no unit is not shown). */
  sizing: FactSizing[];
  assumed: string[];
  cost?: { currency: string; purchased: number; bareModule: number; totalModule: number };
}

export interface FactKpi { label: string; value: string; source: string }

export interface LayoutFacts {
  /** By stream name AND by every alias the result carries. */
  streams: { [name: string]: FactStream };
  /** Components that appear in at least one published composition, in the
   *  order of their first appearance. */
  components: string[];
  /** Sized items, by the id the layout uses (`EquipmentSizing::itemId()`). */
  items: { [id: string]: FactItem };
  /** True when the result carried a sizing pass at all: then an item with no
   *  entry is "not sized", whereas with no pass nothing can be said of it. */
  sized: boolean;
  kpis: FactKpi[];
}

/** Compact number for a sentence: `digits` significant figures. */
export function sig(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return "?";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 1e-3)) return v.toExponential(digits - 1);
  return Number(v.toPrecision(digits)).toString();
}

/** A money amount in millions or thousands, with its currency. */
export function money(v: number, currency: string): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${sig(v / 1e6, 3)} M${currency}`;
  if (a >= 1e3) return `${sig(v / 1e3, 3)} k${currency}`;
  return `${sig(v, 3)} ${currency}`;
}

/** Sizing keys read first on a headline (dimensions and duty), in this order;
 *  the rest follow in the sheet's own order.  A preference, not a filter. */
const HEADLINE_FIRST = ["D", "L", "H", "V", "volume", "A", "Q_kW", "power", "W_shaft",
                        "shellID", "tubeLength", "nTubes", "pressureDesign", "weight"];

/** The first `n` sizing rows worth a sentence: preferred keys first; a row
 *  with no unit (a bare ratio) is left to the card. */
export function headlineSizing(sizing: FactSizing[], n = 4): FactSizing[] {
  const rank = (k: string) => { const i = HEADLINE_FIRST.indexOf(k); return i < 0 ? 99 : i; };
  return sizing.map((s, i) => ({ s, i }))
    .filter(({ s }) => s.unit !== "" && Number.isFinite(s.value))
    .sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i)
    .slice(0, n).map(({ s }) => s);
}

/** "key = value unit" as a sentence part. */
export function sizingPhrase(s: FactSizing): string {
  const unit = s.unit === "" || s.unit.startsWith("[") ? "" : ` ${s.unit}`;
  return `${s.key} = ${sig(s.value)}${unit}`;
}

function streamOf(s: StreamResult): FactStream {
  const out: FactStream = {};
  if (Number.isFinite(s.T)) out.T = s.T;
  if (Number.isFinite(s.P)) out.P = s.P;
  if (Number.isFinite(s.F)) out.F = s.F;
  if (s.F_mass !== undefined && Number.isFinite(s.F_mass)) out.F_mass = s.F_mass;
  if (s.vf !== undefined && Number.isFinite(s.vf)) out.vf = s.vf;
  if (s.composition && Object.keys(s.composition).length > 0) out.composition = { ...s.composition };
  return out;
}

/** The id a sheet answers to in the layout: the unit, or `unit/item`. */
function sheetId(sh: DesignSheet): string {
  const unit = sh.sector !== "" && sh.unit.startsWith(`${sh.sector}.`)
    ? sh.unit.slice(sh.sector.length + 1) : sh.unit;
  return sh.item !== "" ? `${unit}/${sh.item}` : unit;
}

function energyKpis(g: GlobalEnergyBoundary | undefined): FactKpi[] {
  if (!g) return [];
  const out: FactKpi[] = [];
  if (Number.isFinite(g.Q_boundary_kW))
    out.push({ label: "Plant boundary duty", value: `${sig(g.Q_boundary_kW / 1e3, 4)} MW`,
               source: "globalEnergyBoundary.Q_boundary_kW" });
  if (g.W_shaft_kW !== undefined && Number.isFinite(g.W_shaft_kW))
    out.push({ label: "Shaft work", value: `${sig(g.W_shaft_kW / 1e3, 4)} MW`,
               source: "globalEnergyBoundary.W_shaft_kW" });
  if (g.residual_pct_available && typeof g.residual_pct === "number" && Number.isFinite(g.residual_pct))
    out.push({ label: "First-law residual", value: `${sig(g.residual_pct, 3)} %`,
               source: "globalEnergyBoundary.residual_pct" });
  return out;
}

function economicsKpis(e: Economics | undefined): FactKpi[] {
  if (!e) return [];
  const c = e.currency;
  const out: FactKpi[] = [];
  if (Number.isFinite(e.TCI))
    out.push({ label: "Total capital investment", value: money(e.TCI, c), source: "economics.TCI" });
  if (Number.isFinite(e.NPV))
    out.push({ label: "Net present value", value: money(e.NPV, c), source: "economics.NPV" });
  if (e.IRR !== null && Number.isFinite(e.IRR))
    out.push({ label: "IRR", value: `${sig(e.IRR * 100, 3)} %`, source: "economics.IRR" });
  if (e.simplePayback !== null && Number.isFinite(e.simplePayback))
    out.push({ label: "Simple payback", value: `${sig(e.simplePayback, 3)} y`,
               source: "economics.simplePayback" });
  return out;
}

export function layoutKpis(l: PlantLayout | undefined): FactKpi[] {
  const s = l?.summary;
  if (!s) return [];
  const out: FactKpi[] = [
    { label: "Items placed", value: String(s.placed), source: "layout.summary.placed" },
    { label: "Pipes routed", value: `${s.pipes} (${sig(s.pipeLength, 4)} m)`,
      source: "layout.summary.pipes" },
  ];
  if (s.utilityLines !== undefined && s.utilityLines > 0 && s.utilityLength !== undefined)
    out.push({ label: "Utility lines", value: `${s.utilityLines} (${sig(s.utilityLength, 4)} m, unsized)`,
               source: "layout.summary.utilityLines" });
  if (s.notRouted > 0)
    out.push({ label: "Not routed", value: String(s.notRouted), source: "layout.summary.notRouted" });
  out.push({ label: "Layout findings", value: String(s.findings), source: "layout.summary.findings" });
  if (l?.plot && Number.isFinite(l.plot.plotArea))
    out.push({ label: "Plot area", value: `${sig(l.plot.plotArea, 4)} m²`,
               source: "layout.plot.plotArea" });
  return out;
}

export type FactsSource = Pick<RunResult,
  "streams" | "streamAliases" | "equipment" | "designFiles" | "economics"
  | "globalEnergyBoundary" | "converged" | "layout">;

/** Gather the facts.  Returns null when the result carries nothing the view
 *  could add to the layout block (no streams, no sizing, no headline). */
export function layoutFactsOf(r: FactsSource | undefined | null): LayoutFacts | null {
  if (!r) return null;
  const streams: LayoutFacts["streams"] = {};
  const components: string[] = [];
  for (const s of r.streams ?? []) {
    const f = streamOf(s);
    streams[s.name] = f;
    for (const c of Object.keys(f.composition ?? {})) if (!components.includes(c)) components.push(c);
  }
  for (const [alias, id] of Object.entries(r.streamAliases ?? {})) {
    const f = streams[id];
    if (f && !(alias in streams)) streams[alias] = f;
  }
  const sheets = new Map<string, DesignSheet>();
  for (const [rel, text] of Object.entries(r.designFiles ?? {})) {
    if (!rel.startsWith("design/")) continue;
    const sh = parseDesignSheet(text);
    if (sh) sheets.set(sheetId(sh), sh);
  }
  const items: LayoutFacts["items"] = {};
  const fromEquipment = (e: EquipmentItem) => {
    const sh = sheets.get(e.item);
    const it: FactItem = {
      id: e.item, type: e.type,
      sizing: sh ? sh.sizing.map((v) => ({ ...v })) : [],
      assumed: sh ? [...sh.assumed] : [],
    };
    if (e.tagNo) it.tagNo = e.tagNo;
    if (e.material) it.material = e.material;
    if (e.basis) it.basis = e.basis;
    if (e.cost && Number.isFinite(e.cost.totalModule))
      it.cost = { currency: e.cost.currency, purchased: e.cost.purchased,
                  bareModule: e.cost.bareModule, totalModule: e.cost.totalModule };
    items[e.item] = it;
  };
  for (const e of r.equipment ?? []) fromEquipment(e);
  //  A sheet with no equipment row (a run read from files alone) is still a sized item.
  for (const [id, sh] of sheets)
    if (!(id in items)) {
      const it: FactItem = { id, type: sh.equipment, sizing: sh.sizing.map((v) => ({ ...v })),
                             assumed: [...sh.assumed] };
      if (sh.material) it.material = sh.material;
      if (sh.basis && sh.basis !== "(not stated)") it.basis = sh.basis;
      if (sh.cost && sh.cost.totalModule !== undefined)
        it.cost = { currency: sh.cost.currency, purchased: sh.cost.purchased ?? NaN,
                    bareModule: sh.cost.bareModule ?? NaN, totalModule: sh.cost.totalModule };
      items[id] = it;
    }
  const kpis: FactKpi[] = [];
  if (typeof r.converged === "boolean")
    kpis.push({ label: "Flowsheet converged", value: r.converged ? "yes" : "no", source: "converged" });
  kpis.push(...layoutKpis(r.layout), ...economicsKpis(r.economics), ...energyKpis(r.globalEnergyBoundary));
  const sized = Object.keys(items).length > 0;
  if (Object.keys(streams).length === 0 && !sized && kpis.length === 0) return null;
  return { streams, components, items, sized, kpis };
}
