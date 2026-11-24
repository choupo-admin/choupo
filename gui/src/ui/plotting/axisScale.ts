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
  axisScale -- the lin/log toggle's RULE, pure (DEV.md 4c C486).

  Every Plotly figure of the app passes through <Plot> (plotly.ts), which
  gives each Cartesian axis a small lin/log toggle.  This file holds the
  decision and the layout surgery; it imports nothing from Plotly or React.

  THE RULE.  An axis can be drawn on a log scale only if every value SHOWN
  on it is > 0:
    * the values are the numbers of every trace that sits on the axis (x of
      a trace for its x axis, y for its y axis; a right axis `yaxis2` is
      judged on its own traces only), plus the low end of every error bar
      (value - error): a bar that reaches <= 0 makes log impossible too;
    * a trace with `visible: false` is not shown and is not counted (a
      `legendonly` trace is counted: the reader can switch it on);
    * NaN, null, undefined and non-numbers are IGNORED -- they draw no
      point, so they are not "<= 0";
    * if the axis carries a window (`range` with two finite numbers, or
      `rangemode: "tozero"`), the window is what is shown: the window must
      start above 0, and only the values inside it are judged;
    * an axis the figure DECLARED log (`type: "log"`) gets NO toggle -- the
      author's declaration stands (a `views` axis with `scale log;` arrives
      here as `type: "log"` from ViewFigure);
    * an axis with no numeric value, a category or date axis, or one that
      holds a trace type other than scatter / scattergl / bar gets no toggle
      (it is not covered; heatmaps, contours and ternaries have their own
      scales).
  When the toggle is disabled the reason is its tooltip.
\*---------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AxisScaleInput {
  /** The numbers drawn on the axis (any order; non-finite ignored). */
  values: ReadonlyArray<unknown>;
  /** The low ends of error bars on the axis (value - error); optional. */
  errorLows?: ReadonlyArray<unknown>;
  /** True when the figure declared this axis log: no toggle. */
  declaredLog: boolean;
  /** The axis window, when one is declared (data units). */
  window?: [number, number] | null;
  /** Plotly `rangemode` of the axis ("tozero" forces 0 into view). */
  rangeMode?: string;
  /** Name used in the tooltip: "x", "y", "right y", or the axis title. */
  name: string;
}

export interface AxisScaleDecision {
  show: boolean;
  enabled: boolean;
  reason?: string;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** THE RULE (see the header). */
export function axisScaleDecision(inp: AxisScaleInput): AxisScaleDecision {
  if (inp.declaredLog) return { show: false, enabled: false };
  const all = inp.values.map(num).filter((v): v is number => v !== null);
  if (all.length === 0) return { show: false, enabled: false };
  const w = inp.window && num(inp.window[0]) !== null && num(inp.window[1]) !== null
    ? ([Math.min(inp.window[0], inp.window[1]), Math.max(inp.window[0], inp.window[1])] as [number, number])
    : null;
  const lo0 = w ? w[0] : inp.rangeMode === "tozero" ? 0 : null;
  if (lo0 !== null && lo0 <= 0) {
    return { show: true, enabled: false, reason: `log scale unavailable: the ${inp.name} axis window includes values <= 0` };
  }
  const shown = w ? all.filter((v) => v >= w[0] && v <= w[1]) : all;
  if (shown.some((v) => v <= 0)) {
    return { show: true, enabled: false, reason: `log scale unavailable: values <= 0 on the ${inp.name} axis` };
  }
  const lows = (inp.errorLows ?? []).map(num).filter((v): v is number => v !== null);
  if (lows.some((v) => v <= 0)) {
    return { show: true, enabled: false, reason: `log scale unavailable: error bars reach <= 0 on the ${inp.name} axis` };
  }
  return { show: true, enabled: true };
}

export type AxisKind = "x" | "y";
export interface AxisInfo extends AxisScaleDecision {
  /** The layout key: xaxis, yaxis, yaxis2, ... */
  key: string;
  kind: AxisKind;
  name: string;
}

const COVERED = new Set(["scatter", "scattergl", "bar"]);

function traceAxisKey(t: any, kind: AxisKind): string {
  const ref = typeof t?.[kind + "axis"] === "string" ? (t[kind + "axis"] as string) : kind;
  const n = ref.slice(1);
  return `${kind}axis${n === "" || n === "1" ? "" : n}`;
}

function titleOf(ax: any): string {
  const t = ax?.title;
  const s = typeof t === "string" ? t : typeof t?.text === "string" ? t.text : "";
  return s.replace(/<[^>]*>/g, "").trim();
}

function errorLowsOf(t: any, kind: AxisKind, vals: unknown[]): unknown[] {
  const e = t?.["error_" + kind];
  if (!e || e.visible === false) return [];
  const out: unknown[] = [];
  if (e.type === "data" && Array.isArray(e.array)) {
    const minus: unknown[] = Array.isArray(e.arrayminus) ? e.arrayminus : e.array;
    vals.forEach((v, i) => { const m = num(minus[i]), x = num(v); if (m !== null && x !== null) out.push(x - m); });
  } else if (e.type === "constant" && num(e.value) !== null) {
    const m = num(e.valueminus) ?? (e.value as number);
    vals.forEach((v) => { const x = num(v); if (x !== null) out.push(x - m); });
  } else if (e.type === "percent" && num(e.value) !== null) {
    const m = num(e.valueminus) ?? (e.value as number);
    vals.forEach((v) => { const x = num(v); if (x !== null) out.push(x - Math.abs(x) * m / 100); });
  }
  return out;
}

/** Every Cartesian axis of a figure that can carry a toggle, with its decision. */
export function collectAxes(layout: any, data: ReadonlyArray<any>): AxisInfo[] {
  const lay = layout ?? {};
  const acc = new Map<string, { kind: AxisKind; values: unknown[]; lows: unknown[]; bad: boolean }>();
  for (const t of data ?? []) {
    if (!t || typeof t !== "object" || t.visible === false) continue;
    for (const kind of ["x", "y"] as AxisKind[]) {
      const key = traceAxisKey(t, kind);
      const a = acc.get(key) ?? { kind, values: [], lows: [], bad: false };
      acc.set(key, a);
      if (!COVERED.has(t.type ?? "scatter")) { a.bad = true; continue; }
      const vals: unknown[] = Array.isArray(t[kind]) ? t[kind] : [];
      if (vals.some((v) => typeof v === "string")) { a.bad = true; continue; }
      a.values.push(...vals);
      a.lows.push(...errorLowsOf(t, kind, vals));
    }
  }
  const out: AxisInfo[] = [];
  for (const [key, a] of acc) {
    const ax = lay[key] ?? {};
    if (a.bad || (ax.type && ax.type !== "linear" && ax.type !== "log")) continue;
    const title = titleOf(ax);
    const name = key === "xaxis" ? "x" : key === "yaxis" ? "y" : key.startsWith("yaxis") ? "right y" : "x" + key.slice(5);
    const r = ax.range;
    const d = axisScaleDecision({
      values: a.values, errorLows: a.lows, declaredLog: ax.type === "log",
      window: Array.isArray(r) && r.length === 2 ? [Number(r[0]), Number(r[1])] : null,
      rangeMode: ax.rangemode, name: title ? `${name} (${title})` : name,
    });
    if (d.show) out.push({ ...d, key, kind: a.kind, name });
  }
  return out.sort((p, q) => p.key.localeCompare(q.key));
}

export type AxisTypes = Record<string, "linear" | "log">;

/** The toggle state that is in force: a log choice on an axis that is no
 *  longer enabled (the data changed) falls back to linear. */
export function effectiveTypes(axes: ReadonlyArray<AxisInfo>, chosen: AxisTypes): AxisTypes {
  const out: AxisTypes = {};
  for (const a of axes) if (a.enabled && chosen[a.key] === "log") out[a.key] = "log";
  return out;
}

/** The layout with the chosen axes switched to log.  Only `type` (and a
 *  declared window, converted to the decades Plotly expects on a log axis)
 *  changes; nothing a figure draws is altered. */
export function applyAxisTypes(layout: any, types: AxisTypes): any {
  const keys = Object.keys(types).filter((k) => types[k] === "log");
  if (keys.length === 0) return layout;
  const out = { ...layout };
  for (const k of keys) {
    const ax = { ...(layout[k] ?? {}), type: "log" };
    const r = ax.range;
    if (Array.isArray(r) && r.length === 2 && r[0] > 0 && r[1] > 0) ax.range = [Math.log10(r[0]), Math.log10(r[1])];
    out[k] = ax;
  }
  return out;
}
