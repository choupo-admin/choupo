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
  CSV-artifact pop-out: render a CSV the agent wrote (a sweep report etc.)
  through the SHARED CsvAutoPlot (shape sniffing, units menu, dropPointColumn)
  and pop the figure out into a new browser tab.

  How: mount CsvAutoPlot in an offscreen, fixed-size container in the main
  document (it needs the live Mantine + zustand context for theme/units), wait
  for Plotly to draw, then hand the plot element to popOutPlotElement -- the
  same static-PNG pop-out every other plot uses (offline-friendly: no Plotly
  runtime shipped into the new tab).  The offscreen root is unmounted whether
  the render succeeds or not.
\*---------------------------------------------------------------------------*/

import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";

import { theme } from "../theme.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { popOutPlotElement } from "./plotPopOut.js";

// Offscreen render size -- the aspect the PNG is rasterised from.
const RENDER_W = 1200;
const RENDER_H = 750;

/** Render `csvText` with the shared CsvAutoPlot offscreen and open the result
 *  as a pop-out tab (high-resolution PNG).  `rel` is the case-relative file
 *  name, used as the title.  Alerts (and cleans up) on failure. */
export async function popOutCsvArtifact(rel: string, csvText: string): Promise<void> {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_W}px`,
    height: `${RENDER_H}px`,
    overflow: "hidden",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(
      <MantineProvider theme={theme} defaultColorScheme="light">
        <div style={{ width: RENDER_W, height: RENDER_H }}>
          <CsvAutoPlot csv={dropPointColumn(csvText)} filename={rel} />
        </div>
      </MantineProvider>,
    );
    const plotDiv = await waitForPlot(host, 8000);
    if (!plotDiv) {
      alert(`Could not render ${rel} as a plot (not a plottable CSV?).`);
      return;
    }
    await popOutPlotElement(plotDiv, rel);
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Poll the offscreen host until Plotly has actually drawn (the .js-plotly-plot
 *  div exists AND carries its main SVG), or give up after `timeoutMs`. */
function waitForPlot(host: HTMLElement, timeoutMs: number): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const poll = () => {
      const el = host.querySelector<HTMLElement>(".js-plotly-plot");
      if (el && el.querySelector(".main-svg")) {
        resolve(el);
        return;
      }
      if (Date.now() > deadline) {
        resolve(null);
        return;
      }
      setTimeout(poll, 120);
    };
    poll();
  });
}
