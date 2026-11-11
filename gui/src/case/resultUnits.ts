/*---------------------------------------------------------------------------*\
  Choupo GUI -- the plain RESULT displays' units (DEV.md 4c C299, slice 2)

  The engine writes duties in kW and temperatures in K.  A result display that
  prints one of them goes through THIS module, so it follows the Units menu's
  duty and temperature preferences exactly as the Pinch page does
  (case/pinchUnits.ts, slice 1).  Only RATES convert: an energy (kJ), a ratio
  or a closure percent is never passed here.  A temperature DIFFERENCE keeps
  its size and takes the unit's label (no offset).

  The default (kW, K) keeps `toFixed(d)` so every existing screen prints the
  string it printed before; any other duty unit spans decades (0.02 MW would
  print 0.0 at one decimal), so it is shown to significant figures instead.
  Exports (CSV / ODS) stay in SI and do not come through here.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import {
  DEFAULT_PREFS, dKToDisplay, dutyLabel, formatSig, kToDisplay, kWToDisplay,
  temperatureLabel, type DisplayPrefs,
} from "../state/displayUnits.js";

export type ResultUnitPrefs = Pick<DisplayPrefs, "temperature" | "duty">;

/** duty [kW] -> the picked unit, `d` decimals when the unit is kW. */
export function dutyFixed(kW: number, d: number,
  prefs: ResultUnitPrefs = DEFAULT_PREFS): string {
  if (!Number.isFinite(kW)) return "—";
  const v = kWToDisplay(kW, prefs.duty);
  return prefs.duty === "kW" ? v.toFixed(d) : formatSig(v, Math.max(4, d + 3));
}

/** duty [kW] -> "<value> <unit>". */
export function dutyText(kW: number, d: number,
  prefs: ResultUnitPrefs = DEFAULT_PREFS): string {
  return `${dutyFixed(kW, d, prefs)} ${dutyLabel(prefs.duty)}`;
}

/** temperature difference [K] -> "<value> <unit>" (no offset). */
export function dTText(dK: number, d: number,
  prefs: ResultUnitPrefs = DEFAULT_PREFS): string {
  if (!Number.isFinite(dK)) return "—";
  return `${dKToDisplay(dK, prefs.temperature).toFixed(d)} ${temperatureLabel(prefs.temperature)}`;
}

/** absolute temperature [K] -> picked unit, `d` decimals. */
export function tFixed(K: number, d: number,
  prefs: ResultUnitPrefs = DEFAULT_PREFS): string {
  if (!Number.isFinite(K)) return "—";
  return kToDisplay(K, prefs.temperature).toFixed(d);
}
