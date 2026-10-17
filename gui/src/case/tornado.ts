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
  THE ECONOMIC TORNADO -- the geometry, with no drawing in it.

  The engine's opt-in `economics { sensitivity { ... } }` block (DEV.md 4c
  C68, src/postProcessing/EconomicsPass.cpp) moves ONE declared input at a
  time to two declared ends, prices the SAME converged plant again through the
  SAME cash flow, and publishes one row per input on the result
  (`economics.sensitivity`, the rows of reports/economics/sensitivity.csv).
  This module turns those rows into bars about the base NPV, so the Plotly
  component (ui/plotting/TornadoPlot.tsx) draws and decides nothing, and the
  construction can be tested without a canvas.

  ZERO ECONOMICS HERE (gui-credo; CLAUDE.md "A FIRST LAW THE GUI COMPUTED FOR
  ITSELF").  Every NPV, every input value, the swing, the sign flip and the
  ORDER are the engine's.  The bars are drawn in the order the engine
  published them -- largest |NPV(high) - NPV(low)| first, a tie in declared
  order (`tornadoOrder`) -- and this module does not sort: a second sort here
  would be a second home for the ranking, free to disagree with the console
  table and the CSV the student also reads.  The one subtraction below,
  NPV(end) - NPV(base), is the LENGTH of a bar that Plotly anchors at the base
  NPV; it is geometry, not a published number, and it is never printed.

  ABSENT IS ABSENT.  No economics, no sensitivity block, or a block with no
  drawable row: `tornadoFigure` returns null and the Reports section draws no
  chart -- never an empty frame that would read as "nothing matters".
\*---------------------------------------------------------------------------*/

import type { Economics, EconomicSensitivityInput } from "../adapters/SolverAdapter.js";

/** One bar pair: the NPV with the input at its low end and at its high end. */
export interface TornadoBar {
  /** The input as the case declared it (FCI, price.ProductNH3, ...). */
  input: string;
  /** The category drawn on the axis: the input, plus a mark when the engine
   *  says an end turns the NPV's sign. */
  axisLabel: string;
  /** The input's value at each end, as text (the engine's numbers, formatted). */
  lowValueText: string;
  highValueText: string;
  /** The engine's NPVs at each end. */
  npvLow: number;
  npvHigh: number;
  /** Bar lengths from the base NPV (geometry for Plotly's `base`, never printed). */
  dLow: number;
  dHigh: number;
  /** The engine's |NPV(high) - NPV(low)|. */
  swing: number;
  /** "" | "low" | "high" | "both", the engine's word. */
  signFlip: string;
}

export interface TornadoFigure {
  baseNPV: number;
  currency: string;
  /** The engine's own sentence: a sensitivity, NOT an uncertainty analysis. */
  caveat: string;
  /** In the engine's published (tornado) order: largest swing first. */
  bars: TornadoBar[];
}

/** Compact money: 1.23M / 456k / 789, with a true minus sign. */
export function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}G`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)}k`;
  return `${sign}${a.toFixed(0)}`;
}

/** A significant-figure number without trailing zeros (0.08, 4.5, 1250). */
function sig(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return "—";
  return String(Number(v.toPrecision(digits))).replace("-", "−");
}

/** The declared change of a RELATIVE end, as a signed percentage. */
function pct(f: number): string {
  if (!Number.isFinite(f)) return "";
  const p = Number((100 * f).toPrecision(4));
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`;
}

/** The input's value at one end, in the unit the engine declared for it,
 *  with the declared relative change beside it when the end was relative. */
export function endValueText(row: EconomicSensitivityInput, end: "low" | "high"): string {
  const v = end === "low" ? row.valueLow : row.valueHigh;
  const d = end === "low" ? row.declaredLow : row.declaredHigh;
  let value: string;
  switch (row.unit) {
    case "EUR":    value = `${fmtMoney(v)} EUR`; break;
    case "x bill": value = `×${Number.isFinite(v) ? v.toFixed(3) : "—"} bill`; break;
    case "-":
    case "":       value = sig(v); break;
    default:       value = `${sig(v)} ${row.unit}`;
  }
  if (row.mode !== "relative") return value;
  const change = pct(d);
  if (!change) return value;
  return row.fromBand ? `${value} (${change}, accuracy band)` : `${value} (${change})`;
}

/** The bars of the tornado, or null when there is nothing to draw. */
export function tornadoFigure(econ: Economics | undefined): TornadoFigure | null {
  const s = econ?.sensitivity;
  if (!econ || !s || s.inputs.length === 0 || !Number.isFinite(econ.NPV)) return null;
  const base = econ.NPV;
  const bars: TornadoBar[] = s.inputs
    .filter((r) => Number.isFinite(r.NPV_low) && Number.isFinite(r.NPV_high))
    .map((r) => ({
      input: r.input,
      axisLabel: r.NPVsignFlip ? `${r.input} (NPV sign flips)` : r.input,
      lowValueText: endValueText(r, "low"),
      highValueText: endValueText(r, "high"),
      npvLow: r.NPV_low,
      npvHigh: r.NPV_high,
      dLow: r.NPV_low - base,
      dHigh: r.NPV_high - base,
      swing: r.NPVswing,
      signFlip: r.NPVsignFlip,
    }));
  if (bars.length === 0) return null;
  return { baseNPV: base, currency: econ.currency, caveat: s.caveat, bars };
}
