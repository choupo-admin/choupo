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
  FirstLawPlot -- the plant-boundary first law, drawn as the equation.

  Vitor's own design (2026-09-12).  Two columns of signed terms: on the left
  the enthalpy the streams gained, on the right what crossed the boundary.
  Positives stack up from zero; negatives are laid back DOWN over them,
  TRANSLUCENT, and where the translucency stops is the column's net -- marked
  by a white line.  The two lines must land at the same height, because

        SUM H(out) - SUM H(in)  =  Q - W

  and the visible gap between them IS the plant's first-law residual.

  IT IS NOT THE OTHER ENERGY VIEW.  `EnergyBalancePlot` answers *what does
  each stream carry?* -- a per-stream inventory of the boundary, with the
  engine's net Q as one more bar.  This answers *does the first law hold, and
  by how much does it fail?*  Different questions; both kept.

  THE GEOMETRY IS IN `case/firstLaw.ts` and is tested there.  This file draws
  it and computes nothing of its own -- every number is the engine's
  `globalEnergyBoundary` ledger, which exists precisely so the GUI stops
  summing duties for itself (2026-09-05).

  READABLE WITHOUT COLOUR.  Each term carries its signed value as text and
  each level carries its own, because colour does not survive a greyscale
  print and green/red is the classic colour-vision trap.  The white level
  line is drawn over a dark halo so it reads on the light chrome, the dark
  chrome, and a monochrome printout alike.
\*---------------------------------------------------------------------------*/

import type { GlobalEnergyBoundary } from "../../adapters/SolverAdapter.js";
import {
  firstLawFigure, stackedBars, fmtKw, SUBTRACT_OPACITY,
} from "../../case/firstLaw.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface FirstLawPlotProps {
  /** The engine's ledger.  Absent when its energyBalance report did not run
   *  or refused -- the figure then SAYS so and draws nothing in its place. */
  boundary?: GlobalEnergyBoundary;
}

/** Half-width of a column in category units -- the bars, and the level line
 *  that must span exactly the same span. */
const HALF = 0.34;

export function FirstLawPlot({ boundary }: FirstLawPlotProps) {
  const fig = firstLawFigure(boundary);

  if (!fig) {
    return (
      <Plot
        data={[]}
        layout={{
          ...darkLayout,
          title: { text: "First law — the engine published no boundary ledger", font: { ...darkLayout.font, size: 12 } },
          annotations: [{
            text: "This run's energyBalance report did not produce a plant-boundary"
                + " first law (it did not run, or it refused for a missing enthalpy"
                + " datum).<br>Nothing is drawn in its place: the balance is the"
                + " engine's to decide, and a figure computed here instead would be"
                + "<br>a second answer to the same question.",
            xref: "paper", yref: "paper", x: 0.5, y: 0.5,
            showarrow: false, align: "center", font: { ...darkLayout.font, size: 13 },
          }],
          xaxis: { ...darkLayout.xaxis, visible: false },
          yaxis: { ...darkLayout.yaxis, visible: false },
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  const [enthalpy, boundaryCol] = fig.columns;
  const categories = fig.columns.map((c) => c.axisLabel);

  //  One trace per term.  `barmode: overlay` + an explicit `base` gives the
  //  construction directly: the solid stack sits on 0, the translucent one
  //  hangs off its top, and the transition is the net.  Positives are pushed
  //  first so the subtracting terms draw OVER them.
  const data: Record<string, unknown>[] = [];
  const push = (subtracting: boolean) => {
    fig.columns.forEach((col, ci) => {
      for (const { term, base, height } of stackedBars(col)) {
        if (term.subtracts !== subtracting) continue;
        const y = categories.map((_, i) => (i === ci ? height : 0));
        const b = categories.map((_, i) => (i === ci ? base : 0));
        data.push({
          type: "bar",
          name: `${term.label} = ${fmtKw(term.kw)} kW`,
          x: categories,
          y,
          base: b,
          width: categories.map((_, i) => (i === ci ? 2 * HALF : 0)),
          marker: { color: term.color, opacity: subtracting ? SUBTRACT_OPACITY : 1 },
          text: categories.map((_, i) =>
            (i === ci ? `${term.label}  ${fmtKw(term.kw)} kW` : "")),
          textposition: "inside",
          insidetextanchor: "middle",
          textfont: { size: 11, color: "#10242b" },
          hovertemplate:
            `<b>${term.label} = ${fmtKw(term.kw)} kW</b><br>${term.detail}`
            + `<extra></extra>`,
        });
      }
    });
  };
  push(false);
  push(true);

  //  THE WHITE LINE AT THE TRANSITION -- the level, which is the answer.
  //  Drawn twice: a dark, wider line first so the white core keeps its
  //  contrast on the light chrome and on a greyscale print, then the white
  //  one on top.  Plotly draws shapes in order.
  const shapes: Record<string, unknown>[] = [];
  fig.columns.forEach((col, ci) => {
    for (const [w, color, op] of [[6, "#000000", 0.5], [2.5, "#ffffff", 1]] as const) {
      shapes.push({
        type: "line", xref: "x", yref: "y",
        x0: ci - HALF, x1: ci + HALF, y0: col.level, y1: col.level,
        line: { color, width: w }, opacity: op, layer: "above",
      });
    }
  });

  //  ...and the gap between the two levels, when there is one to see.  It is
  //  the ENGINE's residual, drawn: nothing here recomputes it.
  const gapVisible = Math.abs(fig.levelGapKw)
    > 0.004 * (fig.window[1] - fig.window[0]);
  if (gapVisible) {
    shapes.push({
      type: "line", xref: "x", yref: "y",
      x0: 0 + HALF, x1: 1 - HALF,
      y0: enthalpy.level, y1: boundaryCol.level,
      line: { color: PLOT_COLORS.text, width: 1.5, dash: "dot" },
      layer: "above",
    });
  }

  const annotations: Record<string, unknown>[] = [];
  fig.columns.forEach((col, ci) => {
    annotations.push({
      xref: "x", yref: "y", x: ci, y: col.level,
      text: `<b>${col.levelLabel} = ${fmtKw(col.level)} kW</b>`,
      showarrow: false, yshift: 13,
      font: { ...darkLayout.font, size: 12, color: "#ffffff" },
      bgcolor: "rgba(0,0,0,0.62)", borderpad: 3,
    });
  });
  if (gapVisible) {
    annotations.push({
      xref: "x", yref: "y", x: 0.5,
      y: 0.5 * (enthalpy.level + boundaryCol.level),
      text: `residual ${fmtKw(fig.residualKw)} kW`,
      showarrow: false, yshift: -12,
      font: { ...darkLayout.font, size: 11 },
      bgcolor: "rgba(0,0,0,0.45)", borderpad: 2,
    });
  }

  //  The datum caption.  ALWAYS shown, because the two enthalpy terms are
  //  the reason the window is not the bars' own extent, and a reader who
  //  cannot see where a bar ends must be able to read where it ends.
  const datumNote =
    `Σ H(in) = ${fmtKw(fig.H_in_kW)} kW · Σ H(out) = ${fmtKw(fig.H_out_kW)} kW`
    + `, on the ${fig.datum} datum — absolute values are set by that reference,`
    + ` only their difference is physical`
    + (fig.clipped
        ? `; the enthalpy bars run off this window, which is scaled to the`
          + ` process quantities (above the level a column is uniformly`
          + ` translucent-over-solid, so nothing is hidden but the foot)`
        : "");

  const title =
    `First law at the plant boundary — ΔH = Q − W`
    + `  ·  ΔH ${fmtKw(enthalpy.level)} kW`
    + `  ·  Q − W ${fmtKw(boundaryCol.level)} kW`
    + `  ·  residual ${fmtKw(fig.residualKw)} kW`
    + (fig.splitPublished ? "" : "  ·  ⚠ this engine published only Q − W, not Q and W apart")
    + (fig.vacuous ? "  ·  closed loop: nothing crosses the boundary, the law is vacuous here" : "");

  return (
    <Plot
      data={data}
      layout={{
        ...darkLayout,
        title: { text: title, font: { ...darkLayout.font, size: 12 } },
        barmode: "overlay",
        bargap: 0.3,
        showlegend: true,
        margin: { l: 68, r: 24, t: 40, b: 76 },
        shapes,
        annotations: [
          ...annotations,
          {
            xref: "paper", yref: "paper", x: 0, y: -0.16, xanchor: "left",
            text: datumNote, showarrow: false, align: "left",
            font: { ...darkLayout.font, size: 10 },
          },
        ],
        xaxis: {
          ...darkLayout.xaxis,
          type: "category",
          title: { text: "" },
          tickfont: { ...darkLayout.font, size: 13 },
        },
        yaxis: {
          ...darkLayout.yaxis,
          title: { text: "kW  (window scaled to the process terms, not to Σ H)" },
          range: fig.window,
          zeroline: true,
        },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
