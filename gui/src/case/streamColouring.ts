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
  Choupo GUI -- COLOUR BY A PUBLISHED FIELD (DEV.md 4c C114, items 1-5)

  What the flowsheet canvas may paint a wire or a unit with, and how.  Pure:
  no React, no store, so every rule below is held by tests.

  THE CANVAS MAPS PUBLISHED NUMBERS AND COMPUTES NO PHYSICS.  A field is
  offered only when the run PUBLISHES it on at least one stream (T, P, vf,
  F, F_mass, H_kW, the speciation pH) or when it is a UNIT CONVERSION of
  what is published: a component's mole fraction is the stream's own
  `composition`, its mass fraction and its flows come from the ONE shared
  per-component conversion (case/streamComposition.ts -- the same numbers
  the Streams table prints), never from a second copy of that arithmetic.
  Density is not on this list because no stream publishes one today; the
  day the engine emits it, it is one more entry in SCALAR_FIELDS.

  A STREAM THAT DOES NOT CARRY THE FIELD IS "NO DATA", NEVER ZERO.  It is
  drawn in NO_DATA_COLOUR and the legend says so; painting it as the low end
  of the scale would tell a student a stream has no ammonia when the run
  simply did not say.  A zero that IS published (a component absent from a
  stream that publishes its composition) is a real zero and is drawn as one
  -- except on a LOG scale, where it has no position and takes the stated
  BELOW_RANGE_COLOUR.

  Phase colour stays the default and the semantic resting state
  (docs/ai/gui-credo.md); everything here is a deliberate display MODE.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";
import type { StreamComposition } from "./streamComposition.js";
import { gradientColor, type ColorMap } from "../ui/plotting/palette.js";
import {
  type DisplayPrefs,
  flowBasis,
  flowToDisplay,
  kToDisplay,
  paToDisplay,
  temperatureLabel,
  pressureLabel,
  formatSig,
  parsePressure,
  parseTemperature,
  parseFlow,
  type FlowUnit,
} from "../state/displayUnits.js";

// ---------------------------------------------------------------------------
//  Fields
// ---------------------------------------------------------------------------

/** A scalar the stream itself publishes. */
export type ScalarKind = "T" | "P" | "vf" | "F" | "F_mass" | "H_kW" | "pH";
/** A per-component quantity: mole fraction, mass fraction, molar flow,
 *  mass flow. */
export type ComponentKind = "x" | "w" | "n" | "m";
export type FieldKind = ScalarKind | ComponentKind;

/** A field is named by a string so it can be persisted: a scalar is its
 *  kind (`T`), a per-component field is `<kind>:<component>` (`x:NH3`). */
export type FieldKey = string;

export interface ParsedField {
  kind: FieldKind;
  component?: string;
}

const SCALAR_FIELDS: { kind: ScalarKind; label: string; group: FieldGroup }[] = [
  { kind: "T", label: "Temperature", group: "Stream state" },
  { kind: "P", label: "Pressure", group: "Stream state" },
  { kind: "vf", label: "Vapour fraction", group: "Stream state" },
  { kind: "pH", label: "pH (speciation)", group: "Stream state" },
  { kind: "F", label: "Molar flow", group: "Flows" },
  { kind: "F_mass", label: "Mass flow", group: "Flows" },
  { kind: "H_kW", label: "Enthalpy flow", group: "Flows" },
];

const COMPONENT_LABEL: Record<ComponentKind, string> = {
  x: "mole fraction",
  w: "mass fraction",
  n: "molar flow",
  m: "mass flow",
};

export type FieldGroup = "Stream state" | "Flows" | "Per component";

export interface FieldDef {
  key: FieldKey;
  kind: FieldKind;
  component?: string;
  label: string;
  group: FieldGroup;
}

export function parseFieldKey(key: FieldKey): ParsedField | null {
  const i = key.indexOf(":");
  if (i < 0) {
    return SCALAR_FIELDS.some((f) => f.kind === key) ? { kind: key as ScalarKind } : null;
  }
  const k = key.slice(0, i);
  const c = key.slice(i + 1);
  if (!c || !(k in COMPONENT_LABEL)) return null;
  return { kind: k as ComponentKind, component: c };
}

export function fieldKey(kind: FieldKind, component?: string): FieldKey {
  return component ? `${kind}:${component}` : kind;
}

export function isComponentKind(k: FieldKind): k is ComponentKind {
  return k in COMPONENT_LABEL;
}

/** The human label of a field: "Temperature", "NH3 mole fraction". */
export function fieldLabel(key: FieldKey): string {
  const p = parseFieldKey(key);
  if (!p) return key;
  if (p.component) return `${p.component} ${COMPONENT_LABEL[p.kind as ComponentKind]}`;
  return SCALAR_FIELDS.find((f) => f.kind === p.kind)?.label ?? key;
}

/** The value of one field on one stream, in CANONICAL SI (K, Pa, kmol/s,
 *  kg/s, kW; fractions and pH dimensionless) -- or `undefined` when the
 *  stream does not publish it.  `comp` is that stream's entry from
 *  `computePerStream` (case/streamComposition.ts). */
export function streamFieldValue(
  s: StreamResult,
  comp: StreamComposition | undefined,
  key: FieldKey,
): number | undefined {
  const p = parseFieldKey(key);
  if (!p) return undefined;
  const fin = (v: number | undefined | null): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  switch (p.kind) {
    case "T": return fin(s.T);
    case "P": return fin(s.P);
    case "vf": return fin(s.vf);
    case "F": return fin(s.F);
    case "F_mass": return fin(s.F_mass);
    //  H_kW is the published total; the documented fallback when it is
    //  absent is F*H (SolverAdapter.ts), the same pair the engine defines.
    case "H_kW":
      return fin(s.H_kW) ?? (fin(s.H) !== undefined && fin(s.F) !== undefined
        ? s.F * (s.H as number) : undefined);   // kmol/s x J/mol = kW
    case "pH": return fin(s.speciation?.pH);
  }
  const c = p.component!;
  if (!comp) return undefined;
  // A component the stream does not list is a fact the run did not state.
  const listed = c in (s.composition ?? {}) || c in (s.solids ?? {});
  if (!listed) return undefined;
  switch (p.kind) {
    //  An EMPTY stream (published F = 0) carries none of anything -- a real
    //  zero flow -- but its fractions are 0/0 and are therefore no data.
    case "x": return comp.totMol > 0 ? (comp.molFrac[c] ?? 0) : undefined;
    case "n": return comp.totMol > 0 ? (comp.molFrac[c] ?? 0) * comp.totMol
                                     : fin(s.F) === 0 ? 0 : undefined;
    //  Mass needs the molar masses; without them the shared conversion
    //  leaves massFrac empty and the honest answer is "no data".
    case "w": return comp.totMass > 0 ? fin(comp.massFrac[c]) : undefined;
    case "m": return comp.totMass > 0 && comp.massFrac[c] !== undefined
      ? comp.massFrac[c]! * comp.totMass
      : fin(s.F) === 0 && fin(s.F_mass) === 0 ? 0 : undefined;
  }
  return undefined;
}

/** The fields this run can be coloured by: every scalar at least one stream
 *  publishes, and, per component, the four per-component quantities (the
 *  mass-based two only where the conversion had the molar masses). */
export function availableFields(
  streams: StreamResult[],
  perStream: { [name: string]: StreamComposition },
): FieldDef[] {
  const out: FieldDef[] = [];
  for (const f of SCALAR_FIELDS) {
    if (streams.some((s) => streamFieldValue(s, perStream[s.name], f.kind) !== undefined))
      out.push({ key: f.kind, kind: f.kind, label: f.label, group: f.group });
  }
  for (const c of componentsOf(streams)) {
    for (const k of ["x", "w", "n", "m"] as ComponentKind[]) {
      const key = fieldKey(k, c);
      if (streams.some((s) => streamFieldValue(s, perStream[s.name], key) !== undefined))
        out.push({ key, kind: k, component: c, label: fieldLabel(key), group: "Per component" });
    }
  }
  return out;
}

/** Every component any stream lists, sorted case-insensitively. */
export function componentsOf(streams: StreamResult[]): string[] {
  const set = new Set<string>();
  for (const s of streams) {
    for (const c of Object.keys(s.composition ?? {})) set.add(c);
    for (const c of Object.keys(s.solids ?? {})) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// ---------------------------------------------------------------------------
//  Display units (the Units menu) -- the legend speaks the reader's unit
// ---------------------------------------------------------------------------

export interface FieldDisplay {
  /** Unit label for the legend ("" for a dimensionless field). */
  unit: string;
  /** Canonical SI -> displayed number. */
  toDisplay: (si: number) => number;
  /** Displayed number -> canonical SI (for a typed fixed range). */
  fromDisplay: (d: number) => number;
}

const ID = (v: number) => v;

/** How a field is shown under the reader's Units menu.  A molar field shown
 *  while the menu is on a mass basis (or the other way) keeps its own basis
 *  in kmol/h or kg/h: converting basis would need molar masses and is a
 *  different number, not a different unit. */
export function fieldDisplay(key: FieldKey, prefs: DisplayPrefs): FieldDisplay {
  const p = parseFieldKey(key);
  const kind = p?.kind;
  const flowIn = (basis: "molar" | "mass"): FieldDisplay => {
    const u: FlowUnit = flowBasis(prefs.flow) === basis
      ? prefs.flow : basis === "molar" ? "kmol/h" : "kg/h";
    return { unit: u, toDisplay: (si) => flowToDisplay(si, u), fromDisplay: (d) => parseFlow(d, u) };
  };
  switch (kind) {
    case "T":
      return { unit: temperatureLabel(prefs.temperature),
               toDisplay: (si) => kToDisplay(si, prefs.temperature),
               fromDisplay: (d) => parseTemperature(d, prefs.temperature) };
    case "P":
      return { unit: pressureLabel(prefs.pressure),
               toDisplay: (si) => paToDisplay(si, prefs.pressure),
               fromDisplay: (d) => parsePressure(d, prefs.pressure) };
    case "F": case "n": return flowIn("molar");
    case "F_mass": case "m": return flowIn("mass");
    case "H_kW": return { unit: "kW", toDisplay: ID, fromDisplay: ID };
    default: return { unit: "", toDisplay: ID, fromDisplay: ID };
  }
}

/** One value formatted in the field's display unit (no unit suffix). */
export function formatFieldValue(si: number | undefined, key: FieldKey, prefs: DisplayPrefs): string {
  if (si === undefined || !Number.isFinite(si)) return "no data";
  return formatSig(fieldDisplay(key, prefs).toDisplay(si));
}

// ---------------------------------------------------------------------------
//  Scale: auto / fixed range, linear / log
// ---------------------------------------------------------------------------

export type ScaleKind = "linear" | "log";

/** A range the reader typed, in CANONICAL SI.  `null` = automatic. */
export type FixedRange = { min: number; max: number } | null;

export interface ResolvedScale {
  min: number;
  max: number;
  scale: ScaleKind;
  /** True when min == max (an isothermal plant): every value is the mid
   *  colour, and the legend says "all streams <value>". */
  degenerate: boolean;
  /** How the range was obtained, for the legend. */
  origin: "auto" | "fixed";
}

/** The colour shown for a stream that does not publish the field. */
export const NO_DATA_COLOUR = "#8e959c";
/** The colour shown, on a LOG scale, for a value <= 0 (it has no position
 *  on a log axis).  Stated in the legend as "<= 0 (below a log range)". */
export const BELOW_RANGE_COLOUR = "#16181b";

/** The automatic range over the values given (the VISIBLE streams').  On a
 *  log scale only positive values count.  `null` when nothing qualifies. */
export function autoRange(values: (number | undefined)[], scale: ScaleKind):
  { min: number; max: number } | null {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) {
    if (v === undefined || !Number.isFinite(v)) continue;
    if (scale === "log" && !(v > 0)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? { min: lo, max: hi } : null;
}

/** The scale actually drawn: the fixed range when the reader gave a usable
 *  one (on a log scale both ends must be positive), else the automatic one. */
export function resolveScale(
  values: (number | undefined)[],
  scale: ScaleKind,
  fixed: FixedRange,
): ResolvedScale | null {
  if (fixed && Number.isFinite(fixed.min) && Number.isFinite(fixed.max)
      && fixed.max >= fixed.min && (scale === "linear" || fixed.min > 0)) {
    return { min: fixed.min, max: fixed.max, scale, origin: "fixed",
             degenerate: !(fixed.max > fixed.min) };
  }
  const r = autoRange(values, scale);
  if (!r) return null;
  const degenerate = Math.abs(r.max - r.min) <= 1e-9 * Math.max(Math.abs(r.max), 1e-300);
  return { ...r, scale, origin: "auto", degenerate };
}

/** Position of a value on the scale, in [0,1] (clamped -- a value outside a
 *  fixed range takes the end colour, as a colour bar does), or the word
 *  "below" for a non-positive value on a log scale. */
export function scalePosition(v: number, rs: ResolvedScale): number | "below" {
  if (rs.scale === "log" && !(v > 0)) return "below";
  if (rs.degenerate) return 0.5;
  const t = rs.scale === "log"
    ? (Math.log10(v) - Math.log10(rs.min)) / (Math.log10(rs.max) - Math.log10(rs.min))
    : (v - rs.min) / (rs.max - rs.min);
  return Math.min(1, Math.max(0, t));
}

/** The colour of one stream: NO_DATA for an absent value, BELOW_RANGE for a
 *  non-positive value on a log scale, otherwise the colormap. */
export function colourOfValue(v: number | undefined, rs: ResolvedScale | null, map: ColorMap): string {
  if (v === undefined || !Number.isFinite(v) || !rs) return NO_DATA_COLOUR;
  const t = scalePosition(v, rs);
  return t === "below" ? BELOW_RANGE_COLOUR : gradientColor(t, map);
}

/** Tick values for the legend (min, mid, max): the mid is the arithmetic
 *  mean on a linear scale and the GEOMETRIC mean on a log scale, so it sits
 *  under the middle of the bar either way. */
export function scaleTicks(rs: ResolvedScale): number[] {
  if (rs.degenerate) return [rs.min];
  const mid = rs.scale === "log" ? Math.sqrt(rs.min * rs.max) : (rs.min + rs.max) / 2;
  return [rs.min, mid, rs.max];
}

// ---------------------------------------------------------------------------
//  Diverging map for a signed unit KPI (a duty: heating red, cooling blue)
// ---------------------------------------------------------------------------

/** Colour of a signed value on a map CENTRED AT ZERO: coolwarm, blue for
 *  negative (cooling, Q < 0), grey at zero, red for positive (heating,
 *  Q > 0) -- the sign convention of case/dutySign.ts.  `maxAbs` is the
 *  largest magnitude shown, so the two halves share one scale. */
export function divergingColour(v: number | undefined, maxAbs: number): string {
  if (v === undefined || !Number.isFinite(v)) return NO_DATA_COLOUR;
  if (!(maxAbs > 0)) return gradientColor(0.5, "coolwarm");
  return gradientColor(0.5 + 0.5 * Math.max(-1, Math.min(1, v / maxAbs)), "coolwarm");
}

export type UnitMapKind = "diverging" | "sequential";

export interface UnitKpiDef {
  key: string;
  /** How many units publish it. */
  count: number;
}

/** The numeric KPIs the run publishes on units, most common first (a KPI
 *  several units share is what makes a comparison across the plant). */
export function availableUnitKpis(kpis: { [unit: string]: { [k: string]: number } } | undefined): UnitKpiDef[] {
  const n = new Map<string, number>();
  for (const per of Object.values(kpis ?? {})) {
    for (const [k, v] of Object.entries(per ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) n.set(k, (n.get(k) ?? 0) + 1);
    }
  }
  return [...n.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface UnitColouring {
  /** unit name -> colour, only for units publishing the KPI. */
  colour: Map<string, string>;
  value: Map<string, number>;
  min: number;
  max: number;
  maxAbs: number;
  map: UnitMapKind;
}

/** Colour every unit that publishes `key`; units that do not are absent
 *  from the map and are drawn neutral by the caller. */
export function colourUnits(
  kpis: { [unit: string]: { [k: string]: number } } | undefined,
  key: string,
  map: UnitMapKind,
  colormap: ColorMap,
): UnitColouring | null {
  const value = new Map<string, number>();
  for (const [u, per] of Object.entries(kpis ?? {})) {
    const v = per?.[key];
    if (typeof v === "number" && Number.isFinite(v)) value.set(u, v);
  }
  if (value.size === 0) return null;
  let min = Infinity, max = -Infinity, maxAbs = 0;
  for (const v of value.values()) {
    if (v < min) min = v;
    if (v > max) max = v;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  const colour = new Map<string, string>();
  const rs: ResolvedScale = { min, max, scale: "linear", origin: "auto", degenerate: !(max > min) };
  for (const [u, v] of value) {
    colour.set(u, map === "diverging" ? divergingColour(v, maxAbs) : colourOfValue(v, rs, colormap));
  }
  return { colour, value, min, max, maxAbs, map };
}

// ---------------------------------------------------------------------------
//  Threshold: dim what lies outside a chosen range
// ---------------------------------------------------------------------------

/** A threshold in canonical SI; an open end is +-Infinity. */
export interface Threshold { min: number; max: number }

/** True when the value lies inside the threshold.  A value that is absent
 *  is NOT inside: under a threshold a stream with no data is dimmed, since
 *  nothing says it meets the condition. */
export function insideThreshold(v: number | undefined, th: Threshold | null): boolean {
  if (!th) return true;
  if (v === undefined || !Number.isFinite(v)) return false;
  return v >= th.min && v <= th.max;
}

/** The opacity a dimmed wire is drawn with. */
export const DIMMED_OPACITY = 0.14;
/** The opacity a dimmed BOX (a unit, a stream terminal) is drawn with: a box
 *  carries its name, which must stay legible enough to find again. */
export const DIMMED_NODE_OPACITY = 0.3;

// ---------------------------------------------------------------------------
//  "Follow a molecule": colour = its concentration, width = its own flow
// ---------------------------------------------------------------------------

/** Width rule while following a component: FOLLOW_FLOOR_PX + FOLLOW_SPAN_PX
 *  * sqrt(flow / max flow).  The floor is what keeps a TRACE visible: at a
 *  millionth of the largest flow the square root alone would draw a 0.005 px
 *  line.  A stream that carries none of it is dimmed at FOLLOW_ABSENT_PX. */
export const FOLLOW_FLOOR_PX = 1.5;
export const FOLLOW_SPAN_PX = 5.0;
export const FOLLOW_ABSENT_PX = 1.0;

export function followWidth(flow: number | undefined, maxFlow: number): number {
  if (flow === undefined || !(flow > 0) || !(maxFlow > 0)) return FOLLOW_ABSENT_PX;
  return FOLLOW_FLOOR_PX + FOLLOW_SPAN_PX * Math.sqrt(Math.min(1, flow / maxFlow));
}

/** The two fields "follow a molecule" draws: concentration and flow, on
 *  the basis of the Units menu (mole fraction + molar flow on a molar
 *  basis, mass fraction + mass flow on a mass basis). */
export function followFields(component: string, prefs: DisplayPrefs): { colour: FieldKey; width: FieldKey } {
  return flowBasis(prefs.flow) === "mass"
    ? { colour: fieldKey("w", component), width: fieldKey("m", component) }
    : { colour: fieldKey("x", component), width: fieldKey("n", component) };
}

// ---------------------------------------------------------------------------
//  The probe: every field a stream publishes, as rows
// ---------------------------------------------------------------------------

export interface ProbeRow { label: string; value: string }

/** The rows the hover probe shows for one stream: every scalar it publishes
 *  in the reader's units, then its components by mole fraction (largest
 *  first, `maxComponents` of them, with how many more there are). */
export function probeRows(
  s: StreamResult,
  comp: StreamComposition | undefined,
  prefs: DisplayPrefs,
  maxComponents = 6,
): ProbeRow[] {
  const rows: ProbeRow[] = [];
  for (const f of SCALAR_FIELDS) {
    const v = streamFieldValue(s, comp, f.kind);
    if (v === undefined) continue;
    const d = fieldDisplay(f.kind, prefs);
    rows.push({ label: f.label, value: `${formatSig(d.toDisplay(v))}${d.unit ? " " + d.unit : ""}` });
  }
  if (comp) {
    const entries = Object.entries(comp.molFrac).filter(([, x]) => x > 0)
      .sort((a, b) => b[1] - a[1]);
    for (const [c, x] of entries.slice(0, maxComponents)) {
      const w = comp.massFrac[c];
      rows.push({ label: `x ${c}`,
                  value: `${formatSig(x)}${w !== undefined ? `  (w ${formatSig(w)})` : ""}` });
    }
    if (entries.length > maxComponents)
      rows.push({ label: "", value: `+${entries.length - maxComponents} more components` });
  }
  return rows;
}

// ---------------------------------------------------------------------------
//  Which field the wires encode, read off the persisted prefs
// ---------------------------------------------------------------------------

/** The field the wires are coloured by, or null in the default PHASE mode.
 *  The two original modes are fields too (`temperature` -> T, `pressure` ->
 *  P), so a pref persisted before C114 keeps its meaning. */
export function activeFieldKey(prefs: Pick<DisplayPrefs, "colorMode" | "colorField">): FieldKey | null {
  switch (prefs.colorMode) {
    case "temperature": return "T";
    case "pressure": return "P";
    case "field": return parseFieldKey(prefs.colorField) ? prefs.colorField : null;
    default: return null;
  }
}
