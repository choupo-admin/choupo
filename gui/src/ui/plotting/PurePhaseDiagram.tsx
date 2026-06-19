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
  PurePhaseDiagram — the pure-compound P–T phase diagram.

  Draws the coexistence curves from the engine's purePhaseDiagram CSV
  (T,P,curve; P in Pa): the saturation (liquid–vapour) curve to the critical
  point, and — when the compound has curated solid data — the sublimation
  (solid–vapour) and fusion (solid–liquid) lines, with triple + critical points
  marked and the solid / liquid / vapour / supercritical regions labelled.

  NO physics here: every curve point comes from the engine (Psat + Clapeyron);
  this only draws them on a log-P vs T map.
\*---------------------------------------------------------------------------*/

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";
import { useStore } from "../../state/store.js";
import { kToDisplay, paToDisplay } from "../../state/displayUnits.js";

interface Row { T: number; P: number; curve: string; }

function parse(csv: string): Row[] {
  const lines = csv.trim().split(/\r?\n/);
  const out: Row[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    const T = Number(c[0]); const P = Number(c[1]);
    if (Number.isFinite(T) && Number.isFinite(P)) out.push({ T, P, curve: (c[2] ?? "").trim() });
  }
  return out;
}

export function PurePhaseDiagram({ csv, comp, tb }: {
  csv: string; comp: string; tc?: number; pc?: number; tb?: number;
}) {
  // Axes obey the global Units menu.  T is converted via kToDisplay; P via
  // paToDisplay (multiplicative for every pressure unit, so the log axis and
  // the multiplicative range margins stay valid).
  const prefs = useStore((s) => s.displayPrefs);
  const tU = prefs.temperature === "degC" ? "°C" : "K";
  const pU = prefs.pressure;
  const tC = (K: number) => kToDisplay(K, prefs.temperature);
  const pC = (Pa: number) => paToDisplay(Pa, prefs.pressure);

  const rows = parse(csv);
  if (rows.length === 0) return null;

  const line = (curve: string) => rows.filter((r) => r.curve === curve);
  const sat = line("saturation");
  const sub = line("sublimation");
  const fus = line("fusion");
  const crit = rows.find((r) => r.curve === "critical");
  const trip = rows.find((r) => r.curve === "triple");
  const hasSolid = sub.length > 0 && fus.length > 0;

  const mkLine = (pts: Row[], name: string, color: string, dash?: "dash") => ({
    type: "scatter" as const, mode: "lines" as const, name,
    x: pts.map((p) => tC(p.T)), y: pts.map((p) => pC(p.P)),
    line: { color, width: 2.4, ...(dash ? { dash } : {}) },
    hovertemplate: `T=%{x:.1f} ${tU}<br>P=%{y:.4g} ${pU}<extra>${name}</extra>`,
  });

  const traces: object[] = [mkLine(sat, "saturation (L–V)", PLOT_COLORS.accent)];
  if (sub.length) traces.push(mkLine(sub, "sublimation (S–V)", "#64b5f6"));
  if (fus.length) traces.push(mkLine(fus, "fusion (S–L)", "#9ccc65"));
  if (crit) traces.push({
    type: "scatter" as const, mode: "markers" as const, name: "critical point",
    x: [tC(crit.T)], y: [pC(crit.P)], marker: { color: PLOT_COLORS.warm, size: 11 },
    hovertemplate: `Tc=${tC(crit.T).toFixed(1)} ${tU}<br>Pc=${pC(crit.P).toFixed(2)} ${pU}<extra>critical</extra>`,
  });
  if (trip) traces.push({
    type: "scatter" as const, mode: "markers" as const, name: "triple point",
    x: [tC(trip.T)], y: [pC(trip.P)], marker: { color: PLOT_COLORS.text, size: 9, symbol: "square" },
    hovertemplate: `Tt=${tC(trip.T).toFixed(2)} ${tU}<br>Pt=${pC(trip.P).toPrecision(3)} ${pU}<extra>triple point</extra>`,
  });
  if (tb) traces.push({
    type: "scatter" as const, mode: "markers" as const, name: "normal b.p. (1 atm)",
    x: [tC(tb)], y: [pC(101325)], marker: { color: PLOT_COLORS.text, size: 8, symbol: "diamond" },
    hovertemplate: `Tb=${tC(tb).toFixed(1)} ${tU} @ 1 atm<extra>normal b.p.</extra>`,
  });

  const allP = rows.map((r) => pC(r.P)).filter((p) => p > 0);
  const allT = rows.map((r) => r.T);
  const Tc = crit?.T ?? Math.max(...allT);
  const yLo = Math.min(...allP, pC(101325)) * 0.4;
  const yHi = Math.max(...allP) * 2;
  // Range margins are multiplicative in KELVIN (offset-safe), then converted.
  const xLo = tC(Math.min(...allT) * 0.98);
  const xHi = tC(Tc * 1.06);

  // Region labels (paper coords, log-safe).
  const annotations: object[] = [
    { xref: "paper", yref: "paper", x: 0.42, y: 0.72, text: "liquid", showarrow: false,
      font: { ...darkLayout.font, color: PLOT_COLORS.text } },
    { xref: "paper", yref: "paper", x: 0.72, y: 0.14, text: "vapour", showarrow: false,
      font: { ...darkLayout.font, color: PLOT_COLORS.text } },
  ];
  if (crit) annotations.push({ xref: "paper", yref: "paper", x: 0.82, y: 0.965, text: "supercritical fluid",
    showarrow: false, font: { ...darkLayout.font, color: PLOT_COLORS.text } });
  if (hasSolid) annotations.push({ xref: "paper", yref: "paper", x: 0.08, y: 0.7, text: "solid",
    showarrow: false, font: { ...darkLayout.font, color: PLOT_COLORS.text } });

  return (
    <Plot
      data={traces}
      layout={{
        ...darkLayout,
        title: { text: `P–T phase diagram  ·  ${comp}${hasSolid ? "" : "  (liquid–vapour)"}`,
          font: { ...darkLayout.font, size: 14 } },
        xaxis: { ...darkLayout.xaxis, title: { text: `temperature   T   [${tU}]` }, range: [xLo, xHi] },
        yaxis: {
          ...darkLayout.yaxis, title: { text: `pressure   P   [${pU}]` },
          type: "log" as const, range: [Math.log10(yLo), Math.log10(yHi)],
        },
        legend: { ...darkLayout.legend, x: 0.02, y: 0.98 },
        annotations,
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
