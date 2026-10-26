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
import { MIN_TEXT_PX } from "../../case/legibility.js";
import { withSecondChannel } from "../../case/plotChannels.js";
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

// THE ONE MINIMUM TEXT SIZE ON A FIGURE (DEV.md 4c C168 slice 2, ruling
// (c)): a tick, a legend entry, an annotation, a title is never drawn below
// MIN_TEXT_PX.  The audit measured 9 px legend and tick text on NanoFiltran's
// overview figures; one floor here reaches every figure in the app.  A size
// above the floor is kept as the figure declared it.
function floorFont(f: any): any {
  if (!f || typeof f !== "object") return f;
  return typeof f.size === "number" && f.size < MIN_TEXT_PX ? { ...f, size: MIN_TEXT_PX } : f;
}

function floorLayout(layout: any): any {
  const out: any = { ...layout };
  out.font = { ...(layout.font ?? {}), size: Math.max(layout.font?.size ?? 12, MIN_TEXT_PX) };
  if (layout.legend) out.legend = { ...layout.legend, font: floorFont(layout.legend.font) };
  if (layout.title && typeof layout.title === "object") out.title = { ...layout.title, font: floorFont(layout.title.font) };
  if (layout.hoverlabel) out.hoverlabel = { ...layout.hoverlabel, font: floorFont(layout.hoverlabel.font) };
  if (Array.isArray(layout.annotations))
    out.annotations = layout.annotations.map((a: any) => (a && a.font ? { ...a, font: floorFont(a.font) } : a));
  for (const k of Object.keys(layout)) {
    if (!/^[xy]axis\d*$/.test(k) || !layout[k]) continue;
    const ax = layout[k];
    //  A LOG axis draws its in-between digits (2, 3, ... 9 under a "D1"/"D2"
    //  tick step) at 0.75 of the tick font -- Plotly's own rule -- which is
    //  where the audit's 9 px tick text came from (12 x 0.75).  So the font of
    //  a log axis is floored at MIN / 0.75, which puts those digits at the
    //  minimum and the decade labels a little larger.
    const tickMin = ax.type === "log" ? Math.ceil(MIN_TEXT_PX / 0.75) : MIN_TEXT_PX;
    const tf = ax.tickfont ?? {};
    out[k] = {
      ...ax,
      tickfont: { ...tf, size: Math.max(tf.size ?? out.font.size, tickMin) },
      titlefont: floorFont(ax.titlefont),
      ...(ax.title && typeof ax.title === "object" ? { title: { ...ax.title, font: floorFont(ax.title.font) } } : {}),
    };
  }
  return out;
}

// NAMED PLOT CONTROLS (C168 slice 2; the audit counted 330 unnamed
// interactive nodes on NanoFiltran after a run: 15 mode-bar links on each of
// 22 figures, every one `title=""`).  Plotly writes the button's name into
// `data-title` and leaves the link with no accessible name; this copies it
// into aria-label and gives the link the button role it acts as.
function nameModebar(gd: any): void {
  if (!gd || typeof gd.querySelectorAll !== "function") return;
  for (const a of gd.querySelectorAll(".modebar-btn")) {
    const name = a.getAttribute("data-title");
    if (name && a.getAttribute("aria-label") !== name) {
      a.setAttribute("aria-label", name);
      a.setAttribute("role", "button");
    }
  }
}

// The exported <Plot> wraps react-plotly.js and re-themes the incoming layout
// to the active colour scheme.  Consumers pass a `darkLayout`-based layout as
// before; in light mode the chrome is swapped to light here (one place), and it
// re-renders on toggle via useComputedColorScheme.  Trace colours are left
// alone (they read on both backgrounds).
//
// It also applies, in this one place, the two rules every figure owes a
// reader (C168 slice 2): the minimum text size (`floorLayout`) and no two
// series told apart by colour alone (case/plotChannels.ts) -- and it names
// the mode-bar controls.
export function Plot(props: any) {
  const scheme = useComputedColorScheme("light");
  const c = scheme === "dark" ? CHROME_DARK : CHROME_LIGHT;
  const layout = floorLayout(themeLayout(props.layout ?? {}, c));
  const data = withSecondChannel(props.data ?? []);
  const onInitialized = (fig: any, gd: any) => { nameModebar(gd); props.onInitialized?.(fig, gd); };
  const onUpdate = (fig: any, gd: any) => { nameModebar(gd); props.onUpdate?.(fig, gd); };
  return createElement(RawPlot, { ...props, layout, data, onInitialized, onUpdate });
}
