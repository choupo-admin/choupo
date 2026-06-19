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
  Plot pop-out: open the currently visible Plotly figure in a SEPARATE
  browser tab.  The new tab shows a high-resolution PNG rendering of
  the plot, centred against a dark background, so the student can
  zoom / save / paste it into a report.

  Static (not interactive), because shipping a full Plotly runtime
  into the new tab would either need an internet-only CDN (breaks
  Choupo's offline-friendly stance) or bundle ~1 MB of Plotly inline
  per pop-out (slow + duplicated).  Interactivity is already available
  in the inline plot; the pop-out is for inspection + reporting.

  Implementation: query the currently mounted `.js-plotly-plot` div,
  call Plotly.toImage with a high-resolution canvas, and open the
  resulting data URL via the same Blob+anchor pattern as the other
  pop-outs (no popup blocker).
\*---------------------------------------------------------------------------*/

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the basic-dist package has no types
import Plotly from "plotly.js-basic-dist-min";

import { openHtmlInNewTab, popoutColors } from "./filePopOut.js";

/** Open the currently-visible Plotly figure in a new browser tab as a
 *  high-resolution PNG.  Title becomes part of the new tab's title bar. */
export async function popOutCurrentPlot(title: string): Promise<void> {
  const plotDiv = document.querySelector<HTMLElement>(".js-plotly-plot");
  if (!plotDiv) {
    alert("No plot currently rendered.  Press Run and select a plot view first.");
    return;
  }
  await popOutPlotElement(plotDiv, title);
}

/** Pop a SPECIFIC mounted Plotly div out into a new tab (high-resolution PNG).
 *  Extracted from popOutCurrentPlot so callers that render their own plot
 *  (e.g. the console's CSV-artifact chips, which mount a CsvAutoPlot
 *  offscreen) can reuse the same machinery on a known element instead of
 *  whatever `.js-plotly-plot` happens to be visible. */
export async function popOutPlotElement(plotDiv: HTMLElement, title: string): Promise<void> {
  let dataUrl: string;
  try {
    // `as any` for the Plotly typing — basic-dist-min ships incomplete
    // typings for toImage.  The runtime call is correct.
    dataUrl = await (Plotly as { toImage: (el: HTMLElement, opts: object) => Promise<string> })
      .toImage(plotDiv, { format: "png", width: 1600, height: 1000, scale: 2 });
  } catch (e) {
    alert("Failed to render the plot to PNG: " + (e as Error).message);
    return;
  }
  const safeTitle = escAttr(title);
  const C = popoutColors();
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — ${safeTitle}</title>
<style>
  body { margin: 0; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif;
         min-height: 100vh; display: flex; flex-direction: column; }
  header { padding: 10px 16px; border-bottom: 1px solid ${C.border};
           font-size: 13px; color: ${C.dim};
           display: flex; justify-content: space-between; align-items: center; }
  header b { color: ${C.accent}; }
  main { flex: 1; display: flex; align-items: center; justify-content: center;
         padding: 16px; }
  img { max-width: 100%; max-height: calc(100vh - 80px);
        border-radius: 4px; background: ${C.panel}; }
  a.dl { color: ${C.accent}; text-decoration: none; font-size: 12px; }
  a.dl:hover { text-decoration: underline; }
</style>
</head><body>
<header>
  <span><b>Plot</b> · ${safeTitle}</span>
  <a class="dl" href="${dataUrl}" download="${safeTitle.replace(/[^A-Za-z0-9_-]/g, "_")}.png">
    Download PNG
  </a>
</header>
<main><img src="${dataUrl}" alt="${safeTitle}"></main>
</body></html>`;
  openHtmlInNewTab(html);
}

function escAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[c]!);
}
