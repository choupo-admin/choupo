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
  WHERE EACH UNIT TOOK ITS LIQUID PROPERTIES FROM, as the engine reported it:
  the result JSON's top-level `"propertySources"` block (DEV.md 4c C378,
  src/core/PropertySourceLog.cpp `json()`, written by ResultEmitter).

  The block has `used` (one entry per unit, property and source), `declared`
  (the classes of source each unit said it may take), and the engine's own
  findings as lists of sentences: `declaredNotUsed`, `mismatches`,
  `pricedTwice` (the same liquid given two densities), `constantBesideComputed`
  and `modelParameters`.

  NOTHING IS DECIDED HERE.  The GUI does not pick a source, compare two
  numbers, or word a finding: it carries what the engine wrote.  Two things
  are tolerated on purpose:

    * A FIELD THIS FILE DOES NOT KNOW is kept, under `extra`, never dropped:
      the property kernel is adding fields to each entry (the method, its
      leaves, what was passed over, the domain, the evidence) and a page that
      renders `extra` generically shows them the day the engine writes them.
    * A VALUE THE ENGINE DID NOT RECORD is `null`, never zero: the engine's
      own table prints "value not recorded" for it, and so does the page.

  The one piece of formatting that lives here is the unit and the digits of
  each property's number (`valueText`, `stateText`): the block carries SI
  values, the engine's printed table shows mPa s and cm3/mol, and the table
  below mirrors `displayOf` in PropertySourceLog.cpp.  A test holds the two
  to each other on a real run's printed line.
\*---------------------------------------------------------------------------*/

export type JsonValue = unknown;

/** One consumer, one property, one source: a `used` entry. */
export interface PropertySourceRow {
  unit: string;
  consumerType: string;
  /** The engine's property key: `liquidDensity`, `liquidViscosity`, ... */
  property: string;
  /** Stable id of the source (pinned by the golden row kind `source`). */
  sourceId: string;
  /** The source in the engine's own words (includes "pressure not applied"
   *  and what was left out, exactly as the printed table does). */
  label: string;
  /** The engine's class word: `kernel`, `bypass` or `declared`.  Any other
   *  word the engine writes is carried as it is. */
  sourceClass: string;
  pressure: string;
  calls: number | null;
  valueMin: number | null; valueMax: number | null;
  TMin: number | null; TMax: number | null;
  PMin: number | null; PMax: number | null;
  /** Components left out of the number (no liquid volume at that state). */
  leftOut: string[];
  /** Every field of the entry this file does not know, as the engine wrote it. */
  extra: Record<string, JsonValue>;
}

export interface PropertySourceDeclared {
  unit: string; consumerType: string; property: string; sourceClass: string;
  extra: Record<string, JsonValue>;
}

export interface PropertySourcesReport {
  used: PropertySourceRow[];
  declared: PropertySourceDeclared[];
  declaredNotUsed: string[];
  mismatches: string[];
  /** "the same liquid (T, P, one composition) is given two densities: ..." */
  pricedTwice: string[];
  constantBesideComputed: string[];
  modelParameters: { model: string; reads: string }[];
  /** Top-level fields of the block this file does not know. */
  extra: Record<string, JsonValue>;
}

const KNOWN_ROW = new Set([
  "unit", "consumerType", "property", "sourceId", "label", "class", "kernel",
  "pressure", "calls", "valueMin", "valueMax", "TMin", "TMax", "PMin", "PMax", "leftOut",
]);
const KNOWN_DECLARED = new Set(["unit", "consumerType", "property", "class"]);
const KNOWN_BLOCK = new Set([
  "used", "declared", "declaredNotUsed", "mismatches", "pricedTwice",
  "constantBesideComputed", "modelParameters",
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const fin = (v: unknown): number | null =>
  (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
const rest = (o: Record<string, unknown>, known: Set<string>): Record<string, JsonValue> => {
  const out: Record<string, JsonValue> = {};
  for (const k of Object.keys(o)) if (!known.has(k)) out[k] = o[k];
  return out;
};

/** Police the TYPES of the engine's block; derive nothing.  Returns undefined
 *  when the run carries no such block (an older result), so the page shows
 *  nothing rather than an empty box. */
export function shapePropertySources(raw: unknown): PropertySourcesReport | undefined {
  if (!isObj(raw)) return undefined;
  const used: PropertySourceRow[] = [];
  for (const e of Array.isArray(raw["used"]) ? raw["used"] : []) {
    //  A row with no unit or no property names nobody: dropped, not drawn blank.
    if (!isObj(e) || !str(e["unit"]) || !str(e["property"])) continue;
    used.push({
      unit: str(e["unit"]), consumerType: str(e["consumerType"]),
      property: str(e["property"]), sourceId: str(e["sourceId"]),
      label: str(e["label"]), sourceClass: str(e["class"]),
      pressure: str(e["pressure"]), calls: fin(e["calls"]),
      valueMin: fin(e["valueMin"]), valueMax: fin(e["valueMax"]),
      TMin: fin(e["TMin"]), TMax: fin(e["TMax"]),
      PMin: fin(e["PMin"]), PMax: fin(e["PMax"]),
      leftOut: strings(e["leftOut"]),
      extra: rest(e, KNOWN_ROW),
    });
  }
  const declared: PropertySourceDeclared[] = [];
  for (const e of Array.isArray(raw["declared"]) ? raw["declared"] : []) {
    if (!isObj(e) || !str(e["unit"])) continue;
    declared.push({
      unit: str(e["unit"]), consumerType: str(e["consumerType"]),
      property: str(e["property"]), sourceClass: str(e["class"]),
      extra: rest(e, KNOWN_DECLARED),
    });
  }
  const modelParameters: { model: string; reads: string }[] = [];
  for (const e of Array.isArray(raw["modelParameters"]) ? raw["modelParameters"] : [])
    if (isObj(e) && str(e["model"])) modelParameters.push({ model: str(e["model"]), reads: str(e["reads"]) });
  return {
    used, declared, modelParameters,
    declaredNotUsed: strings(raw["declaredNotUsed"]),
    mismatches: strings(raw["mismatches"]),
    pricedTwice: strings(raw["pricedTwice"]),
    constantBesideComputed: strings(raw["constantBesideComputed"]),
    extra: rest(raw, KNOWN_BLOCK),
  };
}

/** The rows that belong to one flowsheet unit, in the engine's order; empty
 *  when it has none.  The engine names a consumer either by the unit itself
 *  (`pump01`) or, for the sizing pass, by a phrase that quotes it
 *  (`inventory 'Separator'`, `ShellTubeHX: unit 'Aftercooler' (design)`); both
 *  belong to the unit, and the row keeps the engine's phrase so the page can
 *  show it.  Nothing else is guessed: a name that is only a substring of
 *  another does not match, because the quotes are part of the test. */
export function rowsOfUnit(r: PropertySourcesReport | undefined, unit: string): PropertySourceRow[] {
  if (!r || !unit) return [];
  const quoted = `'${unit}'`;
  return r.used.filter((u) => u.unit === unit || u.unit.includes(quoted));
}

/** The rows grouped by unit, units in the order the engine first named them. */
export function rowsByUnit(r: PropertySourcesReport | undefined):
  { unit: string; consumerType: string; rows: PropertySourceRow[] }[] {
  const out: { unit: string; consumerType: string; rows: PropertySourceRow[] }[] = [];
  for (const row of r?.used ?? []) {
    let g = out.find((x) => x.unit === row.unit);
    if (!g) { g = { unit: row.unit, consumerType: row.consumerType, rows: [] }; out.push(g); }
    g.rows.push(row);
  }
  return out;
}

//  ---- the engine's display of a number (mirrors PropertySourceLog.cpp) ----

interface Display { words: string; unit: string; scale: number; digits: number; fixed: boolean }
const DISPLAY: Record<string, Display> = {
  liquidDensity:            { words: "liquid density", unit: "kg/m3", scale: 1, digits: 2, fixed: true },
  liquidVolume:             { words: "liquid molar volume", unit: "cm3/mol", scale: 1e6, digits: 2, fixed: true },
  liquidViscosity:          { words: "liquid viscosity", unit: "mPa s", scale: 1e3, digits: 4, fixed: false },
  surfaceTension:           { words: "surface tension", unit: "mN/m", scale: 1e3, digits: 4, fixed: false },
  liquidDiffusivity:        { words: "liquid diffusivity", unit: "m2/s", scale: 1, digits: 3, fixed: false },
  liquidKinematicViscosity: { words: "liquid kinematic viscosity", unit: "m2/s", scale: 1, digits: 3, fixed: false },
  vapourVolume:             { words: "vapour molar volume", unit: "cm3/mol", scale: 1e6, digits: 2, fixed: true },
};

/** The property in the engine's words; an unknown key is shown as it is. */
export function propertyWords(property: string): string {
  return DISPLAY[property]?.words ?? property;
}

/** C's `%.<p>g`, which JavaScript has no spelling for. */
function cg(v: number, p: number): string {
  if (v === 0) return "0";
  const [m, ex] = v.toExponential(p - 1).split("e") as [string, string];
  const e = Number(ex);
  const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
  if (e < -4 || e >= p) {
    const n = Math.abs(e);
    return `${trim(m)}e${e < 0 ? "-" : "+"}${n < 10 ? "0" : ""}${n}`;
  }
  return trim(v.toFixed(Math.max(0, p - 1 - e)));
}

/** "787.27 kg/m3", "785.12 .. 787.30 kg/m3", or "" when the engine recorded
 *  no number -- the caller then says "value not recorded". */
export function valueText(u: PropertySourceRow): string {
  if (u.valueMin === null || u.valueMax === null) return "";
  const d = DISPLAY[u.property];
  if (!d) {
    //  A property this page has no unit for: the SI number, labelled as such.
    const a = cg(u.valueMin, 6), b = cg(u.valueMax, 6);
    return a === b ? `${a} (SI)` : `${a} .. ${b} (SI)`;
  }
  const f = (x: number) => (d.fixed ? (x * d.scale).toFixed(d.digits) : cg(x * d.scale, d.digits));
  const lo = f(u.valueMin), hi = f(u.valueMax);
  return lo === hi ? `${lo} ${d.unit}` : `${lo} .. ${hi} ${d.unit}`;
}

/** "at 298.2 K, 1 bar" (a range when the unit asked at several states), or "". */
export function stateText(u: PropertySourceRow): string {
  let s = "";
  if (u.TMin !== null && u.TMax !== null) {
    const a = u.TMin.toFixed(1), b = u.TMax.toFixed(1);
    s += `at ${a === b ? a : `${a} .. ${b}`} K`;
  }
  if (u.PMin !== null && u.PMax !== null) {
    const a = cg(u.PMin * 1e-5, 3), b = cg(u.PMax * 1e-5, 3);
    s += `${s ? ", " : "at "}${a === b ? a : `${a} .. ${b}`} bar`;
  }
  return s;
}
