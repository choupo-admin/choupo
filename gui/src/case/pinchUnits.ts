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
  /** duties [kW] shown TOGETHER in one identity (a sum, a difference):
   *  returns a formatter with ONE absolute precision for all of them, chosen
   *  so the SMALLEST nonzero |value| carries the preference's significant
   *  figures.  61412.4 / 61494.0 / 81.6, never 61400 / 61500 / 81.6, which
   *  a reader would subtract to 100. */
  group(kWs: number[]): (kW: number) => string;
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
    group: (kWs) => {
      const mags = kWs.map((k) => Math.abs(kWToDisplay(k, q)))
        .filter((a) => Number.isFinite(a) && a > 0);
      const d = mags.length === 0 ? 0    // all zero: nothing to carry
        : Math.max(0, Math.min(12, sig() - 1 - Math.floor(Math.log10(Math.min(...mags)))));
      return (kW) => {
        const v = kWToDisplay(kW, q);
        if (!Number.isFinite(v)) return "—";
        const s = v.toFixed(d);
        return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;   // never "-0.0"
      };
    },
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
