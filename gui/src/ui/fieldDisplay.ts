/*---------------------------------------------------------------------------*\
  fieldDisplay -- how the Properties panel shows ONE operation scalar in the
  display units the TopBar Units menu picked.

  Two defects lived in the panel's own copy of this, both seen by Vitor on
  the green-ammonia converter (DEV.md 4c C49, 2026-10-07):

    1. A temperature DIFFERENCE was converted as an absolute temperature.
       `temperatureApproach 5;` is 5 K of detuning; read through the
       absolute formatter it printed -268 degC.  A difference converts by
       the SCALE and never by the OFFSET, so its schema says so
       (`"quantity": "temperatureDifference"`, operationSchemas.ts).
    2. A scalar written WITH its unit (`T 733.15 K;` -- the dict keeps it
       as the string "733.15 K") was never converted at all: only a bare
       number reached the formatter, so the operating temperature stayed
       in K whatever the menu said.  A string scalar is now read to SI
       first, through the dict's own unit table, and then formatted.

  Only the three quantities the menu converts (temperature, pressure, molar
  flow) are touched; a string whose unit is of another family than the
  field's declared unit is shown as written, never converted across
  dimensions.  Pure and React-free, so the tests reach it directly.
\*---------------------------------------------------------------------------*/

import type { OperationField } from "../case/operationSchemas.js";
import type { JsonValue } from "../dict/index.js";
import { parseScalarString } from "../dict/json.js";
import { affineToK, lookupUnit } from "../dict/units.js";
import {
  type DisplayPrefs,
  formatFlow,
  formatPressure,
  formatSig,
  formatTemperature,
  temperatureLabel,
} from "../state/displayUnits.js";

const FAMILY: Record<string, readonly string[]> = {
  K: ["K", "degC", "C", "Celsius", "degF", "F", "Fahrenheit"],
  Pa: ["Pa", "kPa", "MPa", "bar", "atm", "psi", "mmHg", "torr"],
  "kmol/s": ["kmol/s", "kmol/h", "mol/s", "mol/h"],
};

const isDifference = (f: OperationField) => f.quantity === "temperatureDifference";

/** The value of `raw` in the field's declared SI unit, or undefined when it
 *  is not a scalar this panel converts (a $ref, a word, a list, a unit of
 *  another family). */
export function fieldValueToSI(field: OperationField,
  raw: JsonValue | undefined,
): number | undefined {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string" || !field.unit) return undefined;
  const p = parseScalarString(raw);
  if (!p) return undefined;
  if (!p.unit) return p.value;
  const family = FAMILY[field.unit];
  if (!family || !family.includes(p.unit)) return undefined;
  const u = lookupUnit(p.unit);
  if (!u) return undefined;
  if (!u.affine) return p.value * u.factor;
  // An affine scale: an absolute temperature takes the offset, a difference
  // takes only the scale (1 degC = 1 K, 1 degF = 5/9 K).
  if (isDifference(field))
    return (p.unit === "degF" || p.unit === "F" || p.unit === "Fahrenheit")
      ? p.value * 5.0 / 9.0 : p.value;
  return affineToK(p.value, p.unit);
}

/** The display string and unit label of an operation scalar. */
export function renderFieldValue(field: OperationField,
  value: JsonValue | undefined,
  prefs: DisplayPrefs,
): { displayValue: string; displayUnit: string | undefined } | null {
  if (value === undefined || !field.unit || !FAMILY[field.unit]) return null;
  const si = fieldValueToSI(field, value);
  if (si === undefined) return null;
  if (field.unit === "K") {
    return isDifference(field)
      // a difference is the same number in K and in degC
      ? { displayValue: formatSig(si), displayUnit: temperatureLabel(prefs.temperature) }
      : { displayValue: formatTemperature(si, prefs.temperature),
          displayUnit: temperatureLabel(prefs.temperature) };
  }
  if (field.unit === "Pa")
    return { displayValue: formatPressure(si, prefs.pressure), displayUnit: prefs.pressure };
  return { displayValue: formatFlow(si, prefs.flow), displayUnit: prefs.flow };
}

/** For an EDITABLE field, which is edited in the unit the FILE wrote (the
 *  tinkering rule: honest to the file, no round-trip): the same value in
 *  the menu's unit, as a hint beside the input -- or null when the two
 *  already agree, so a hint only appears when it says something. */
export function displayHint(field: OperationField,
  raw: JsonValue | undefined,
  prefs: DisplayPrefs,
): string | null {
  const r = renderFieldValue(field, raw, prefs);
  if (!r || !r.displayUnit) return null;
  const authored = typeof raw === "string" ? parseScalarString(raw)?.unit : undefined;
  const shownAs = r.displayUnit === "°C" ? ["degC", "C", "Celsius"] : [r.displayUnit];
  const authoredIs = authored ?? field.unit;
  if (authoredIs && shownAs.includes(authoredIs)) return null;
  return `= ${r.displayValue} ${r.displayUnit}`;
}
