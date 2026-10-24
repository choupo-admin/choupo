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
  TornadoPlot -- the one-at-a-time economic sensitivity, drawn.

  Horizontal bars about the BASE NPV, one row per declared input, in the
  order the engine published them (largest NPV swing on top).  Each row is
  two bars: the NPV with the input at its LOW end and at its HIGH end, each
  labelled with the input's value there.  The colour says WHICH END of the
  input, never whether the NPV went up or down -- a lower discount rate and a
  lower product price both sit on the cyan side, and which way each moves
  the NPV is exactly what the student reads off the picture.

  THE GEOMETRY IS IN `case/tornado.ts` and is tested there; this file draws
  it.  Every number is the engine's `economics.sensitivity` block.

  READABLE WITHOUT COLOUR.  Every bar carries its input value as text, the
  legend names the two ends, and the hover repeats the input, the end, its
  value and the NPV, so a greyscale print loses nothing.

  THE TEXT TAKES THE THEME'S INK (2026-10-24, C143).  The value labels and
  the two annotations used to spread `darkLayout.font`, whose colour is the
  DARK scheme's light grey; the <Plot> wrapper re-themes the layout's font
  but not a trace's `textfont` or an annotation's own font, so in the light
  scheme every value was #c9c9c9 on white -- the text that makes the chart
  readable without colour was the least readable thing on it.  They now
  name the family and size only and inherit the re-themed colour.
\*---------------------------------------------------------------------------*/

import type { TornadoFigure } from "../../case/tornado.js";
import { fmtMoney } from "../../case/tornado.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface TornadoPlotProps {
  fig: TornadoFigure;
  /** The two END colours, low and high.  Optional, and absent on every
   *  engine-fed caller, which keep the house accent/warm pair.  Added for the
   *  Sines EduTool (C143), whose light-scheme page needs a pair that passes
   *  the 3:1 contrast check on white (Mantine blue-6 / orange-8, validated on
   *  both chrome backgrounds); the bars carry their values as text either
   *  way, so colour stays secondary. */
  colors?: { low: string; high: string };
}

/** Row height in px: two lines of axis label fit, the bars stay thin. */
const ROW_PX = 34;

export function TornadoPlot({ fig, colors }: TornadoPlotProps) {
  const cats = fig.bars.map((b) => b.axisLabel);
  const cur = fig.currency;
  const end = (which: "low" | "high") => {
    const lo = which === "low";
    return {
      type: "bar",
      orientation: "h",
      name: lo ? "input at its LOW end" : "input at its HIGH end",
      y: cats,
      x: fig.bars.map((b) => (lo ? b.dLow : b.dHigh)),
      base: fig.bars.map(() => fig.baseNPV),
      width: 0.62,
      marker: {
        color: lo ? (colors?.low ?? PLOT_COLORS.accent)
                  : (colors?.high ?? PLOT_COLORS.warm),
        line: { color: PLOT_COLORS.background, width: 1 },
      },
      text: fig.bars.map((b) => (lo ? b.lowValueText : b.highValueText)),
      textposition: "outside",
      cliponaxis: false,
      textfont: { family: darkLayout.font.family, size: 11 },
      customdata: fig.bars.map((b) => [
        b.input,
        lo ? b.lowValueText : b.highValueText,
        fmtMoney(lo ? b.npvLow : b.npvHigh),
        fmtMoney(b.swing),
      ]),
      hovertemplate:
        `<b>%{customdata[0]}</b> at its ${which} end: %{customdata[1]}`
        + `<br>NPV = %{customdata[2]} ${cur}`
        + `<br>swing |NPV(high) − NPV(low)| = %{customdata[3]} ${cur}`
        + `<extra></extra>`,
    };
  };

  //  The base NPV is the axis every bar hangs from; the break-even (NPV = 0)
  //  is drawn too, dotted, when it falls inside the bars' reach -- it is the
  //  line a sign flip crosses.
  const xs = fig.bars.flatMap((b) => [b.npvLow, b.npvHigh]).concat(fig.baseNPV);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const shapes: Record<string, unknown>[] = [{
    type: "line", xref: "x", yref: "paper", x0: fig.baseNPV, x1: fig.baseNPV,
    y0: 0, y1: 1, line: { color: PLOT_COLORS.text, width: 1.5 }, layer: "above",
  }];
  if (lo < 0 && hi > 0) {
    shapes.push({
      type: "line", xref: "x", yref: "paper", x0: 0, x1: 0, y0: 0, y1: 1,
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dot" }, layer: "below",
    });
  }
  const annotations: Record<string, unknown>[] = [{
    xref: "x", yref: "paper", x: fig.baseNPV, y: 1, yanchor: "bottom",
    text: `base NPV ${fmtMoney(fig.baseNPV)} ${cur}`, showarrow: false,
    font: { family: darkLayout.font.family, size: 11 },
  }];
  if (lo < 0 && hi > 0) {
    annotations.push({
      xref: "x", yref: "paper", x: 0, y: 0, yanchor: "top",
      text: "NPV = 0", showarrow: false, font: { family: darkLayout.font.family, size: 10 },
    });
  }
  //  Room either side for the outside labels.
  const pad = 0.28 * Math.max(hi - lo, Math.abs(fig.baseNPV) * 1e-6, 1);

  return (
    <Plot
      data={[end("low"), end("high")]}
      layout={{
        ...darkLayout,
        barmode: "overlay",
        height: 120 + ROW_PX * fig.bars.length,
        margin: { l: 8, r: 16, t: 28, b: 72 },
        showlegend: true,
        //  Below the axis title, pinned to the container so it does not
        //  drift into the tick labels as the number of rows changes.
        legend: { ...darkLayout.legend, orientation: "h", x: 0, xanchor: "left",
          yref: "container", y: 0, yanchor: "bottom" },
        xaxis: {
          ...darkLayout.xaxis,
          title: { text: `NPV (${cur})` },
          range: [lo - pad, hi + pad],
          zeroline: false,
        },
        yaxis: {
          ...darkLayout.yaxis,
          autorange: "reversed",
          automargin: true,
          type: "category",
        },
        shapes,
        annotations,
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%" }}
      useResizeHandler
    />
  );
}
