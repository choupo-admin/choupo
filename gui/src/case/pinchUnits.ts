/*---------------------------------------------------------------------------*\
  Choupo GUI -- the Pinch page's units (DEV.md 4c C299)

  The engine writes the pinch in K and kW.  This module is the ONE place the
  page turns those into the Units menu's temperature and duty preferences:
  an absolute temperature (T), a temperature DIFFERENCE (dT: dTmin, no
  offset), a duty (Q) and a heat-capacity flow rate (CP = Q/dT).  Geometry
  stays in K; only what is PRINTED is converted.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import {
  DEFAULT_PREFS, cpLabel, cpToDisplay, dKToDisplay, dutyLabel, formatSig,
  getDisplaySigFigs, kToDisplay, kWToDisplay, temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";
import { noInteriorPinchText } from "./pinchWording.js";

export interface PinchUnits {
  tLabel: string;     // "K" | "°C"
  qLabel: string;     // "kW" | "MW" | ...
  cpLabel: string;    // "kW/K" | "MW/°C" | ...
  /** absolute temperature [K] -> picked unit (the `d` argument is ignored:
   *  every number follows the significant-figures preference) */
  T(K: number, d?: number): string;
  /** temperature difference [K] -> picked unit (no offset) */
  dT(K: number, d?: number): string;
  /** temperature difference [K]; the same rule as dT (kept for callers) */
  dTraw(K: number): string;
  /** duty [kW] -> picked unit */
  Q(kW: number, d?: number): string;
  /** a TARGET duty [kW]; the same rule as Q (kept for callers) */
  Qt(kW: number): string;
  /** CP [kW/K] -> picked unit */
  CP(kWperK: number, d?: number): string;
  /** a number ALREADY in display units (an axis tick), the same rule */
  n(v: number): string;
  /** numeric converters, for axes */
  qNum(kW: number): number;
  tNum(K: number): number;
}

/** EVERY printed number follows the Units menu's significant figures (C304,
 *  Vitor 2026-11-11: "41051.0, 61412.4, 107.50" were too many digits): the
 *  page shows `sigFigs` significant figures (default 3: 41100 kW, 108 kW,
 *  353 K) and a user who sets 5 sees 5.  The `d` arguments call sites still
 *  pass are IGNORED -- one rule, not one per call site.  `sigFigs` is read
 *  from `prefs` when given, else from the live global the store keeps
 *  (getDisplaySigFigs) at the moment of printing.  The CSV files stay at
 *  full precision: nothing here writes one. */
export function pinchUnits(
  prefs: Pick<DisplayPrefs, "temperature" | "duty"> & { sigFigs?: number } = DEFAULT_PREFS,
): PinchUnits {
  const t = prefs.temperature, q = prefs.duty;
  const sig = () => prefs.sigFigs ?? getDisplaySigFigs();
  const f = (v: number) => (Number.isFinite(v) ? formatSig(v, sig()) : "—");
  return {
    tLabel: temperatureLabel(t),
    qLabel: dutyLabel(q),
    cpLabel: cpLabel(q, t),
    T: (K) => f(kToDisplay(K, t)),
    dT: (K) => f(dKToDisplay(K, t)),
    dTraw: (K) => f(dKToDisplay(K, t)),
    Q: (kW) => f(kWToDisplay(kW, q)),
    Qt: (kW) => f(kWToDisplay(kW, q)),
    CP: (c) => f(cpToDisplay(c, q, t)),
    n: (v) => f(v),
    qNum: (kW) => kWToDisplay(kW, q),
    tNum: (K) => kToDisplay(K, t),
  };
}

/** The Pinch page's status line (PinchView footer), in the picked units and
 *  significant figures. */
export function pinchStatusLine(
  pinch: { streams: unknown[]; dTmin: number; QhMin: number; QcMin: number;
           pinchShift: number | null },
  u: PinchUnits,
): string {
  return `${pinch.streams.length} process streams in the engine's population `
    + `(reports/pinch/population.csv) · ΔTmin ${u.dTraw(pinch.dTmin)} ${u.tLabel} · targets `
    + `${u.Qt(pinch.QhMin)} ${u.qLabel} hot / ${u.Qt(pinch.QcMin)} ${u.qLabel} cold · `
    + (pinch.pinchShift == null ? noInteriorPinchText(pinch.dTmin, u)
                                : `pinch T* ${u.T(pinch.pinchShift, 1)} ${u.tLabel}`) + ".";
}
