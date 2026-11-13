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
  THE PANEL AT AN INSTANT -- the pure mapping from the engine's `panel` block
  and the run's trajectory to what each widget draws (DEV.md 4c C371, slice S2;
  docs/design/operator-panel-in-the-case.md section 7).

  THE TASK THE SCREEN SERVES: "An operator-in-training opens a time-integrated
  case and sees, at the instant the cursor is on, whether each watched
  variable is inside its limits, how it got there, and what the case's author
  declared about it."

  WHAT IS READ, AND FROM WHERE.  The value under the cursor is the trajectory's
  own sample at that written instant; the limits, the range, the placement,
  the words, the reasons and the actions are the engine's element record; the
  STATE of an element at that instant is the engine's alarm INTERVALS (the
  alarm's delay applied, on the write grid) -- membership of an instant in a
  published interval, never a comparison of the value with a limit.

  WHAT IS NOT PUBLISHED, SAID BY THE TYPE.  An element with a limit but no
  `alarm` carries NO interval: the engine publishes no per-instant state for
  it, so its state is `noAlarm` -- the limit is drawn, the element is never
  coloured, and it is NOT counted.  `alarmsActive` publishes only the maximum
  and its first instant, so the number of elements in alarm at the cursor is
  the number of alarmed elements whose published interval holds the cursor's
  instant, and the denominator is the number of alarms declared.  No number is
  derived from a value.  The column's physical unit is not published either
  (the column name carries it: `i_A_per_m2`); the widgets print the column.

  NO REACT, NO STORE, NO DOM: the node test runner exercises all of it.
\*---------------------------------------------------------------------------*/

import type { PanelElementReport, PanelReport } from "../adapters/panelPayload.js";
import { inAlarmAt } from "./operatorPanels.js";

/** The run's time series, as `RunResult.trajectory` carries them. */
export interface PanelTrajectory {
  t: number[];
  vars: { [name: string]: number[] };
}

export type WidgetKind = "number" | "bar" | "trend" | "lamp" | "unknown";

/** `alarm`: inside a published alarm interval at the cursor.  `normal`: the
 *  element declares an alarm and the cursor is outside every interval.
 *  `noAlarm`: no alarm declared, so no state is published.
 *  `notPublished`: the run does not carry the element's column. */
export type WidgetState = "alarm" | "normal" | "noAlarm" | "notPublished";

export interface WidgetView {
  name: string;
  title: string;
  reason: string;
  kind: WidgetKind;
  column: string;
  referenceColumn?: string;
  state: WidgetState;
  /** The trajectory's sample at the cursor's instant (absent when not published). */
  value?: number;
  series?: number[];
  referenceSeries?: number[];
  /** The engine's range; absent when the element declares none. */
  range?: [number, number];
  /** The span the engine published for the run (min, max), for the drawing
   *  scale of an element that declares no range. */
  runSpan?: [number, number];
  limitLow?: number;
  limitHigh?: number;
  limitSource?: string;
  limitReason?: string;
  /** What the case's author asks the operator to do when the alarm sounds. */
  action?: string;
  alarmOn?: string;
  intervals?: [number, number][];
  /** The lamp's words, the element's own or the engine's stated defaults. */
  words: { normal: string; alarm: string };
  place?: { column: number; row: number; width: number; height: number };
}

const KINDS: readonly WidgetKind[] = ["number", "bar", "trend", "lamp"];

/** The word a lamp (and the badge of any element) shows in alarm.  `on high`
 *  -> the high word, `on low` -> the low word, `on outside` -> neither side is
 *  published as a state, so a fixed `OUTSIDE LIMITS`. */
export function alarmWord(e: PanelElementReport): string {
  if (e.alarmOn === "high") return e.text["wordHigh"] ?? "HIGH";
  if (e.alarmOn === "low") return e.text["wordLow"] ?? "LOW";
  return "OUTSIDE LIMITS";
}

/** Every element of the report as a widget, at written instant `i`. */
export function widgetsAt(report: PanelReport, traj: PanelTrajectory, i: number): WidgetView[] {
  const idx = Math.min(Math.max(i, 0), Math.max(traj.t.length - 1, 0));
  const t = traj.t[idx];
  return report.elements.map((e): WidgetView => {
    const kind = (KINDS as readonly string[]).includes(e.kind) ? e.kind as WidgetKind : "unknown";
    const series = traj.vars[e.column];
    const present = e.published && series !== undefined;
    const w: WidgetView = {
      name: e.name,
      title: e.text["title"] ?? e.name,
      reason: e.text["reason"] ?? "",
      kind, column: e.column,
      state: "noAlarm",
      words: { normal: e.text["wordNormal"] ?? "NORMAL", alarm: alarmWord(e) },
    };
    if (e.referenceColumn) w.referenceColumn = e.referenceColumn;
    if (e.rangeMin !== undefined && e.rangeMax !== undefined && e.rangeMax > e.rangeMin)
      w.range = [e.rangeMin, e.rangeMax];
    if (e.min !== undefined && e.max !== undefined) w.runSpan = [e.min, e.max];
    if (e.limitLow !== undefined) w.limitLow = e.limitLow;
    if (e.limitHigh !== undefined) w.limitHigh = e.limitHigh;
    if (e.text["limitSource"]) w.limitSource = e.text["limitSource"];
    if (e.text["limitReason"]) w.limitReason = e.text["limitReason"];
    if (e.text["action"]) w.action = e.text["action"];
    if (e.alarmOn) w.alarmOn = e.alarmOn;
    if (e.intervals) w.intervals = e.intervals;
    if (e.place) w.place = e.place;
    if (!present) { w.state = "notPublished"; return w; }
    w.series = series;
    const ref = e.referenceColumn ? traj.vars[e.referenceColumn] : undefined;
    if (ref) w.referenceSeries = ref;
    const v = series![idx];
    if (v !== undefined && Number.isFinite(v)) w.value = v;
    const a = t === undefined ? undefined : inAlarmAt(e, t);
    w.state = a === undefined ? "noAlarm" : a ? "alarm" : "normal";
    return w;
  });
}

/** How many alarmed elements the engine reports in alarm at the cursor, of how
 *  many alarms the panel declares.  A count of published interval membership. */
export function alarmCountAt(widgets: readonly WidgetView[]): { active: number; declared: number } {
  let active = 0, declared = 0;
  for (const w of widgets) {
    if (w.state === "alarm") { active++; declared++; }
    else if (w.state === "normal") declared++;
  }
  return { active, declared };
}

/** The scale a trend or bar is drawn on: the engine's range, or -- for an
 *  element that declares none -- the span the engine published for the run,
 *  widened by one unit only when the run never moved so a flat line has
 *  somewhere to sit.  A drawing scale, never a displayed number. */
export function drawingRange(w: WidgetView): [number, number] {
  if (w.range) return w.range;
  const [lo, hi] = w.runSpan ?? [0, 1];
  return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
}
