/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * totalRefluxLoop -- what a column at TOTAL REFLUX draws on the canvas.
 *
 * WHY THIS EXISTS (DEV.md 4c C404).  A column run at total reflux has no feed
 * and no product: its flowsheet is one unit and two duties, so the canvas drew
 * a box with nothing flowing -- right physically, empty pedagogically, and it
 * read as a broken case ("Isto nao tem correntes?!", Vitor, 2026-11-15, on
 * ratebased04).  What DOES flow is internal: the vapour rising to the
 * condenser, the reflux returning, the boilup at the bottom.  The node draws
 * that loop.
 *
 * THE LOOP IS NOT A STREAM.  Nothing is added to the flowsheet graph, the
 * stream table, the balances or the layout; it is a drawing inside the unit's
 * own card, dashed, and it says so.
 *
 * THE GUI NEVER COMPUTES PHYSICS.  Before a run the loop shows only what the
 * case dict DECLARES (the composition at the specified end).  After a run it
 * shows only numbers the engine PUBLISHED in the unit's KPIs, under the keys
 * listed in PUBLISHED below, unconverted.  A key the run did not publish is
 * absent from the result -- never filled in.  In particular the engine does
 * not publish a molar liquid flow L: at total reflux it equals the vapour
 * flow by construction, but that is an inference and this module does not
 * make it; the reflux arrow carries the composition and temperature the
 * engine published (and the condensate volume flow where a model publishes
 * it).
 *
 * PURE, as nodeDetail.ts is: the drawing is `ui/TotalRefluxLoop.tsx`.
 */

import type { JsonDict, JsonValue } from "../dict/index.js";
import {
  flowBasis, flowLabel, flowToDisplay, formatSig, formatTemperature, temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";

/** The one label, spelled in one place. */
export const TOTAL_REFLUX_LABEL = "total reflux: no feed, no product";

/** The KPI keys the loop reads, per arrow.  Every one is published by
 *  DistillationColumn.cpp (tray, packed, `totalReflux` models) or
 *  RateBasedSegment.cpp; a model that publishes only some shows only those. */
export const PUBLISHED = {
  vapour: ["V_top", "V_top_over_V_bottom", "T_top"],
  reflux: ["x_reflux_LK", "T_reflux", "Q_condensate_m3_s", "x_topTray_LK"],
  boilup: ["V_boilup", "x_reboiler_LK", "T_bottom", "x_bottomTray_LK", "x_belowBed_LK"],
} as const;

export type LoopArrow = keyof typeof PUBLISHED;

export interface TotalRefluxUnit {
  type: string;
  operation: JsonDict;
}

export interface DeclaredEnd {
  /** Where the composition is specified: "reboiler" (every shipped case). */
  end: string;
  /** Mole fractions as the case writes them, in the dict's order. */
  composition: Array<{ component: string; x: number }>;
}

export interface TotalRefluxLoop {
  label: string;
  /** The light key's name when the case declares one (efficiency or packing
   *  block); null otherwise (the engine then takes the system's first
   *  component, which the dict does not name). */
  lightKey: string | null;
  declared: DeclaredEnd | null;
  /** Published values per arrow; null before a run (or a run that published
   *  none of the loop's keys). */
  after: Record<LoopArrow, Record<string, number>> | null;
}

function isDict(v: JsonValue | undefined): v is JsonDict {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A column whose operation declares a `totalReflux { }` block.  The model is
 *  `totalReflux` for trays and the transfer-unit bed, `rateBased` for the
 *  rate-based bed: the BLOCK is the test, never the model word. */
export function isTotalRefluxColumn(unit: TotalRefluxUnit): boolean {
  return unit.type === "distillationColumn" && isDict(unit.operation?.totalReflux);
}

function declaredEnd(op: JsonDict): DeclaredEnd | null {
  const tr = op.totalReflux;
  if (!isDict(tr)) return null;
  const comp = tr.composition;
  if (!isDict(comp)) return null;
  const rows: Array<{ component: string; x: number }> = [];
  for (const [component, v] of Object.entries(comp)) {
    if (typeof v === "number" && Number.isFinite(v)) rows.push({ component, x: v });
  }
  if (rows.length === 0) return null;
  const end = typeof tr.specifiedAt === "string" ? tr.specifiedAt : "reboiler";
  return { end, composition: rows };
}

function declaredLightKey(op: JsonDict): string | null {
  for (const block of ["efficiency", "packing"]) {
    const b = op[block];
    if (isDict(b) && typeof b.lightKey === "string") return b.lightKey;
  }
  return null;
}

/** The loop of a total-reflux column, or null for any other unit.  `kpis` is
 *  the unit's published KPI map from the last run, or undefined before one. */
export function totalRefluxLoop(
  unit: TotalRefluxUnit,
  kpis?: { [key: string]: number },
): TotalRefluxLoop | null {
  if (!isTotalRefluxColumn(unit)) return null;
  let after: TotalRefluxLoop["after"] = null;
  if (kpis) {
    const a: Record<LoopArrow, Record<string, number>> = { vapour: {}, reflux: {}, boilup: {} };
    let any = false;
    for (const arrow of Object.keys(PUBLISHED) as LoopArrow[]) {
      for (const key of PUBLISHED[arrow]) {
        const v = kpis[key];
        if (typeof v === "number" && Number.isFinite(v)) { a[arrow][key] = v; any = true; }
      }
    }
    if (any) after = a;
  }
  return {
    label: TOTAL_REFLUX_LABEL,
    lightKey: declaredLightKey(unit.operation),
    declared: declaredEnd(unit.operation),
    after,
  };
}

/** One printed row of the after-run loop: the published value, untouched, and
 *  its text in the reader's display units.  `value` is what the engine
 *  published (canonical units); `text` is only its formatting. */
export interface LoopRow {
  arrow: LoopArrow;
  key: string;
  label: string;
  value: number;
  text: string;
}

const ROW_LABEL: Record<string, string> = {
  V_top: "V to condenser",
  V_top_over_V_bottom: "V(top)/V(bottom)",
  T_top: "T top",
  x_reflux_LK: "x LK in reflux",
  T_reflux: "T reflux",
  Q_condensate_m3_s: "condensate",
  x_topTray_LK: "x LK top tray",
  V_boilup: "V boilup",
  x_reboiler_LK: "x LK reboiler",
  T_bottom: "T bottom",
  x_bottomTray_LK: "x LK bottom tray",
  x_belowBed_LK: "x LK below bed",
};

function formatRow(key: string, v: number, prefs: DisplayPrefs): string {
  const sig = prefs.sigFigs;
  if (key.startsWith("T_")) {
    return `${formatTemperature(v, prefs.temperature, sig)} ${temperatureLabel(prefs.temperature)}`;
  }
  if (key === "V_top" || key === "V_boilup") {
    //  The engine's molar flows are kmol/s.  A mass-basis flow preference
    //  cannot convert a molar value without a molar mass the loop does not
    //  have, so it falls back to kmol/h rather than invent one.
    const u = flowBasis(prefs.flow) === "molar" ? prefs.flow : "kmol/h";
    return `${formatSig(flowToDisplay(v, u), sig)} ${flowLabel(u)}`;
  }
  if (key === "Q_condensate_m3_s") return `${formatSig(v * 3600, sig)} m3/h`;
  return formatSig(v, sig);
}

/** The after-run rows of one arrow, in PUBLISHED order. */
export function loopRows(
  loop: TotalRefluxLoop,
  arrow: LoopArrow,
  prefs: DisplayPrefs,
): LoopRow[] {
  if (!loop.after) return [];
  return Object.entries(loop.after[arrow]).map(([key, value]) => ({
    arrow, key, value,
    label: key.startsWith("x_") && loop.lightKey
      ? `${ROW_LABEL[key] ?? key} (${loop.lightKey})` : (ROW_LABEL[key] ?? key),
    text: formatRow(key, value, prefs),
  }));
}
