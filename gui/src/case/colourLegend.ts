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
  Choupo GUI -- the colour LEGEND as data (DEV.md 4c C114, items 3 and 6)

  ONE model of what a colour on the canvas means, drawn by TWO surfaces: the
  legend box floating on the canvas and the legend block of an exported
  SVG/PNG.  Built once here, so the exported figure a student pastes into a
  report cannot say something the screen did not.

  A legend states every rule the drawing uses that a reader could not guess:
  the field and its unit (the Units menu's), linear or log, automatic or a
  fixed range (and that values outside a fixed range take the end colours),
  the NO-DATA grey, the colour of a value <= 0 on a log scale, what is
  dimmed by a threshold, and the width rule with its floor.
\*---------------------------------------------------------------------------*/

import { gradientColor, type ColorMap } from "../ui/plotting/palette.js";
import { type DisplayPrefs, formatSig } from "../state/displayUnits.js";
import {
  type FieldKey,
  type ResolvedScale,
  type Threshold,
  type UnitColouring,
  BELOW_RANGE_COLOUR,
  NO_DATA_COLOUR,
  FOLLOW_FLOOR_PX,
  fieldDisplay,
  fieldLabel,
  scaleTicks,
} from "./streamColouring.js";

export interface LegendSwatch { colour: string; label: string }

export interface ColourLegend {
  /** "Temperature", "NH3 mole fraction", "unit Q_kW". */
  title: string;
  /** Display unit of the bar's numbers ("" when dimensionless). */
  unit: string;
  /** Colours sampled left -> right along the bar. */
  stops: string[];
  /** Tick labels under the bar, already formatted (min, mid, max). */
  ticks: string[];
  /** "log", "fixed range", "centred at 0" ... said beside the title. */
  qualifiers: string[];
  /** Colours that are NOT on the bar (no data, below range). */
  extras: LegendSwatch[];
  /** Sentences the drawing needs said (dimming, width rule, clamping). */
  notes: string[];
}

function sampleStops(map: ColorMap, n = 11): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(gradientColor(i / (n - 1), map));
  return out;
}

export interface StreamLegendInput {
  field: FieldKey;
  scale: ResolvedScale | null;
  map: ColorMap;
  prefs: DisplayPrefs;
  /** Whether at least one drawn stream lacks the field. */
  anyNoData: boolean;
  /** Whether at least one drawn stream has a value <= 0 (log only). */
  anyBelow: boolean;
  threshold: Threshold | null;
  /** The component followed, when "follow a molecule" is on. */
  follow: string | null;
  /** The width rule's subject when not following ("mass flow"). */
}

/** The legend of the stream colouring. */
export function streamLegend(inp: StreamLegendInput): ColourLegend {
  const disp = fieldDisplay(inp.field, inp.prefs);
  const fmt = (si: number) => formatSig(disp.toDisplay(si));
  const qualifiers: string[] = [];
  const notes: string[] = [];
  const extras: LegendSwatch[] = [];
  let ticks: string[] = [];
  let stops = sampleStops(inp.map);
  if (inp.scale) {
    if (inp.scale.scale === "log") qualifiers.push("log scale");
    if (inp.scale.origin === "fixed") {
      qualifiers.push("fixed range");
      notes.push("values outside the range take the end colours");
    }
    if (inp.scale.degenerate) {
      ticks = [`all ${fmt(inp.scale.min)}`];
      stops = [gradientColor(0.5, inp.map)];
    } else {
      ticks = scaleTicks(inp.scale).map(fmt);
    }
  } else {
    notes.push("no stream publishes this field");
  }
  if (inp.anyNoData) extras.push({ colour: NO_DATA_COLOUR, label: "no data" });
  if (inp.anyBelow && inp.scale?.scale === "log")
    extras.push({ colour: BELOW_RANGE_COLOUR, label: "≤ 0 (below a log scale)" });
  if (inp.threshold) {
    const lo = Number.isFinite(inp.threshold.min) ? fmt(inp.threshold.min) : "−∞";
    const hi = Number.isFinite(inp.threshold.max) ? fmt(inp.threshold.max) : "+∞";
    notes.push(`dimmed: outside [${lo}, ${hi}]${disp.unit ? " " + disp.unit : ""}`);
  }
  if (inp.follow) {
    notes.push(`wire thickness ∝ √(${inp.follow} flow), floor ${FOLLOW_FLOOR_PX} px;`
      + ` streams without ${inp.follow} dimmed`);
  } else {
    notes.push("wire thickness ∝ √(mass flow)");
  }
  return { title: fieldLabel(inp.field), unit: disp.unit, stops, ticks, qualifiers, extras, notes };
}

/** The legend of the unit colouring by a KPI. */
export function unitLegend(kpi: string, uc: UnitColouring, map: ColorMap,
  threshold: Threshold | null, anyWithout: boolean): ColourLegend {
  const qualifiers: string[] = [];
  const notes: string[] = [];
  let stops: string[];
  let ticks: string[];
  if (uc.map === "diverging") {
    qualifiers.push("centred at 0");
    stops = sampleStops("coolwarm");
    ticks = [formatSig(-uc.maxAbs), "0", formatSig(uc.maxAbs)];
    //  The SIGN is the one each unit publishes, and for a duty it does not
    //  mean the same thing on every unit: a heater/cooler's Q_kW is + heat
    //  added, − heat removed (case/dutySign.ts), while a two-stream
    //  exchanger publishes the heat it TRANSFERS, never negative -- measured
    //  on ammonia02, whose water cooler reads +57 500 kW.  Saying "heating
    //  red" over that exchanger would be a claim the number does not make.
    notes.push(/^Q/.test(kpi)
      ? "+ red · − blue, the sign each unit publishes: a heater/cooler duty is + heating, − cooling; a two-stream exchanger's is the heat it transfers (≥ 0)"
      : "+ red · − blue, the sign each unit publishes");
  } else {
    stops = sampleStops(map);
    ticks = uc.max > uc.min
      ? [formatSig(uc.min), formatSig((uc.min + uc.max) / 2), formatSig(uc.max)]
      : [`all ${formatSig(uc.min)}`];
  }
  const extras: LegendSwatch[] = anyWithout
    ? [{ colour: NO_DATA_COLOUR, label: `no ${kpi}` }] : [];
  if (threshold) {
    const lo = Number.isFinite(threshold.min) ? formatSig(threshold.min) : "−∞";
    const hi = Number.isFinite(threshold.max) ? formatSig(threshold.max) : "+∞";
    notes.push(`units dimmed: outside [${lo}, ${hi}]`);
  }
  //  A KPI carries its unit in its NAME (`Q_kW`), as the engine publishes
  //  it; the legend repeats the name rather than guessing a unit from it.
  return { title: `unit ${kpi}`, unit: "", stops, ticks, qualifiers, extras, notes };
}

/** The legend of the default PHASE colouring, in the same shape, so the
 *  export draws it with the same code as a field legend. */
export function phaseLegend(swatches: LegendSwatch[]): ColourLegend {
  return { title: "phase", unit: "", stops: [], ticks: [], qualifiers: [],
           extras: swatches, notes: ["wire thickness ∝ √(mass flow)"] };
}
