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
  Wire react-plotly.js to the lightweight basic-dist bundle (~600 KB
  instead of the full 3 MB).  Covers scatter / line / bar / histogram /
  heatmap / contour -- enough for Phase 1.5.  Full bundle returns in
  Phase 3 when we wire up 3D (VTK.js handles 3D scientific data; full
  Plotly only if we want WebGL 3D scatter etc.).
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { useComputedColorScheme } from "@mantine/core";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the basic-dist package has no types
import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

const RawPlot = createPlotlyComponent(Plotly);

// Mantine v7 dark palette (resolved hex so Plotly can render -- it does
// not resolve CSS custom properties).  Series/accent colours read on BOTH a
// dark and a light background, so only the CHROME (bg / text / grid / axis)
// differs per scheme -- see the light set below + the <Plot> wrapper.
export const PLOT_COLORS = {
  background: "#1f1f1f",
  grid: "#3b3b3b",
  axis: "#828282",
  text: "#c9c9c9",
  accent: "#26c6da",
  accent2: "#80deea",
  warm: "#ffb74d",
  warm2: "#ff8a65",
  series: ["#26c6da", "#ffb74d", "#80deea", "#ff8a65", "#a5d6a7", "#ce93d8"],
};

// Per-scheme CHROME colours.  Plotly cannot read CSS variables, so the <Plot>
// wrapper below resolves these at render time from the active colour scheme and
// overrides the layout's bg / font / grid / axis fields.  Consumers keep
// spreading `darkLayout`; the wrapper re-themes it for light mode (and leaves
// dark mode exactly as before).
const CHROME_DARK = { background: "#1f1f1f", grid: "#3b3b3b", axis: "#828282", text: "#c9c9c9", hover: "#2e2e2e" };
const CHROME_LIGHT = { background: "#ffffff", grid: "#dee2e6", axis: "#adb5bd", text: "#343a40", hover: "#f1f3f5" };

export const PLOT_FONT = {
  family: "Inter, sans-serif",
  size: 12,
  color: PLOT_COLORS.text,
};

/**
 * Common dark-theme layout fragments.  Spread into per-plot layout
 * objects so each chart can override axis ranges, titles, etc.
 */
export const darkLayout = {
  paper_bgcolor: PLOT_COLORS.background,
  plot_bgcolor: PLOT_COLORS.background,
  font: PLOT_FONT,
  margin: { l: 56, r: 24, t: 36, b: 44 },
  hoverlabel: {
    bgcolor: "#2e2e2e",
    bordercolor: PLOT_COLORS.accent,
    font: {...PLOT_FONT, color: "#fff" },
  },
  xaxis: {
    gridcolor: PLOT_COLORS.grid,
    zerolinecolor: PLOT_COLORS.grid,
    linecolor: PLOT_COLORS.axis,
    tickfont: PLOT_FONT,
    titlefont: {...PLOT_FONT, size: 13 },
  },
  yaxis: {
    gridcolor: PLOT_COLORS.grid,
    zerolinecolor: PLOT_COLORS.grid,
    linecolor: PLOT_COLORS.axis,
    tickfont: PLOT_FONT,
    titlefont: {...PLOT_FONT, size: 13 },
  },
  legend: {
    font: PLOT_FONT,
    bgcolor: "rgba(0,0,0,0)",
    bordercolor: PLOT_COLORS.grid,
  },
} as const;

export const PLOT_CONFIG = {
  displaylogo: false,
  responsive: true,
  toImageButtonOptions: {
    format: "png" as const,
    filename: "Choupo",
    scale: 2,
  },
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] as Array<
    "lasso2d" | "select2d" | "autoScale2d"
  >,
};

/* eslint-disable @typescript-eslint/no-explicit-any */

type Chrome = typeof CHROME_DARK;

// Override only an axis's COLOUR fields, preserving title / range / type / etc.
function themeAxis(axis: any, c: Chrome): any {
  return {
    ...axis,
    gridcolor: c.grid,
    zerolinecolor: c.grid,
    linecolor: c.axis,
    tickfont: { ...(axis?.tickfont ?? {}), color: c.text },
    titlefont: { ...(axis?.titlefont ?? {}), color: c.text },
  };
}

// Re-theme a layout's chrome (bg / font / grid / axes / legend / hover / title)
// for the active scheme, leaving every other field (titles, ranges, traces,
// domains, annotations) untouched.
function themeLayout(layout: any, c: Chrome): any {
  const out: any = {
    ...layout,
    paper_bgcolor: c.background,
    plot_bgcolor: c.background,
    font: { ...(layout.font ?? {}), color: c.text },
  };
  if (layout.hoverlabel) {
    out.hoverlabel = {
      ...layout.hoverlabel,
      bgcolor: c.hover,
      font: { ...(layout.hoverlabel.font ?? {}), color: c.text },
    };
  }
  if (layout.legend) {
    out.legend = {
      ...layout.legend,
      bordercolor: c.grid,
      font: { ...(layout.legend.font ?? {}), color: c.text },
    };
  }
  if (layout.title?.font) {
    out.title = { ...layout.title, font: { ...layout.title.font, color: c.text } };
  }
  // Any number of axes: xaxis, yaxis, xaxis2, yaxis2, ...
  for (const k of Object.keys(layout)) {
    if (/^[xy]axis\d*$/.test(k)) out[k] = themeAxis(layout[k], c);
  }
  return out;
}

// The exported <Plot> wraps react-plotly.js and re-themes the incoming layout
// to the active colour scheme.  Consumers pass a `darkLayout`-based layout as
// before; in light mode the chrome is swapped to light here (one place), and it
// re-renders on toggle via useComputedColorScheme.  Trace colours are left
// alone (they read on both backgrounds).
export function Plot(props: any) {
  const scheme = useComputedColorScheme("light");
  const c = scheme === "dark" ? CHROME_DARK : CHROME_LIGHT;
  const layout = themeLayout(props.layout ?? {}, c);
  return createElement(RawPlot, { ...props, layout });
}
