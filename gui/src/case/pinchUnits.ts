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
  kToDisplay, kWToDisplay, temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";

export interface PinchUnits {
  tLabel: string;     // "K" | "°C"
  qLabel: string;     // "kW" | "MW" | ...
  cpLabel: string;    // "kW/K" | "MW/°C" | ...
  /** absolute temperature [K] -> picked unit, `d` decimals */
  T(K: number, d?: number): string;
  /** temperature difference [K] -> picked unit (no offset) */
  dT(K: number, d?: number): string;
  /** temperature difference [K] as the bare number (no fixed decimals) */
  dTraw(K: number): string;
  /** duty [kW] -> picked unit */
  Q(kW: number, d?: number): string;
  /** a TARGET duty [kW]: 107.5 stays 107.5 (one decimal below 1000 in the
   *  default unit; other units keep four significant figures) */
  Qt(kW: number): string;
  /** CP [kW/K] -> picked unit */
  CP(kWperK: number, d?: number): string;
  /** numeric converters, for axes */
  qNum(kW: number): number;
  tNum(K: number): number;
}

/** The default duty (kW) keeps toFixed so every existing screen stays
 *  byte-identical; any other duty unit spans decades (0.02 MW would print
 *  0.0), so it is shown to significant figures instead. */
export function pinchUnits(
  prefs: Pick<DisplayPrefs, "temperature" | "duty"> = DEFAULT_PREFS,
): PinchUnits {
  const t = prefs.temperature, q = prefs.duty;
  const fixedQ = q === "kW";
  const fix = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const qfmt = (v: number, d: number) =>
    (fixedQ ? fix(v, d) : Number.isFinite(v) ? formatSig(v, Math.max(4, d + 3)) : "—");
  return {
    tLabel: temperatureLabel(t),
    qLabel: dutyLabel(q),
    cpLabel: cpLabel(q, t),
    T: (K, d = 0) => fix(kToDisplay(K, t), d),
    dT: (K, d = 0) => fix(dKToDisplay(K, t), d),
    dTraw: (K) => String(dKToDisplay(K, t)),
    Q: (kW, d = 0) => qfmt(kWToDisplay(kW, q), d),
    Qt: (kW) => {
      if (!Number.isFinite(kW)) return "—";
      const v = kWToDisplay(kW, q);
      if (!fixedQ) return formatSig(v, 4);
      return Math.abs(v) >= 1000 ? v.toFixed(0) : String(Number(v.toFixed(1)));
    },
    CP: (c, d = 2) => qfmt(cpToDisplay(c, q, t), d),
    qNum: (kW) => kWToDisplay(kW, q),
    tNum: (K) => kToDisplay(K, t),
  };
}

/** The Pinch page's status line (PinchView footer), in the picked units.
 *  Default prefs reproduce the old literal text exactly. */
export function pinchStatusLine(
  pinch: { streams: unknown[]; dTmin: number; QhMin: number; QcMin: number;
           pinchShift: number | null },
  u: PinchUnits,
): string {
  return `${pinch.streams.length} process streams in the engine's population `
    + `(reports/pinch/population.csv) · ΔTmin ${u.dTraw(pinch.dTmin)} ${u.tLabel} · targets `
    + `${u.Qt(pinch.QhMin)} ${u.qLabel} hot / ${u.Qt(pinch.QcMin)} ${u.qLabel} cold · `
    + (pinch.pinchShift == null ? "no pinch (threshold problem)"
                                : `pinch T* ${u.T(pinch.pinchShift, 1)} ${u.tLabel}`) + ".";
}
