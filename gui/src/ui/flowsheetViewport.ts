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
  flowsheetViewport -- how far the flowsheet canvas may zoom, and the ONE set
  of options every "fit the whole flowsheet" call uses (DEV.md 4c C102).

  WHY THIS FILE EXISTS.  Vitor, on the live site (apalutamide01_tablets):
  "the zoom out does not let me see the whole flowsheet; there is a part at
  the top that is hard to reach".  Three causes, each measured in a browser:

    1. React Flow's default `minZoom` is 0.5 and nothing here set another,
       so a flowsheet that needs a smaller zoom to fit could not be zoomed
       out to, and a fit was CLAMPED at 0.5 -- centred on the drawing with
       its top and bottom off-screen.
    2. The first fit ran before React Flow had measured the boxes, so it
       fitted the few boxes already measured and stopped at the fit's own
       maxZoom (1.1): on every flowsheet larger than the window the first
       view was NOT the whole flowsheet.  FlowCanvas now fits once every
       box of the case is measured.
    3. The SHOW / PHASE / WIRES legends and the Run button float over the
       top of the canvas, and a fit with an even 10 % margin put the top
       row of units UNDER them.  The fit's top margin clears them now
       (FLOWSHEET_FIT_PADDING).

  Panning was never bounded (no translateExtent / nodeExtent is set), so
  every box can be reached by dragging once the zoom allows it.

  Pinned by tests/flowsheetViewport.test.ts: every view of every tutorial
  (the automatic layout, and the case's own .cho where it ships one) must
  fit, with this padding, in a small reference pane at a zoom ABOVE
  FLOWSHEET_MIN_ZOOM -- so the fit is never clamped.
\*---------------------------------------------------------------------------*/

import type { FitViewOptions } from "@xyflow/react";

/** The smallest zoom the canvas allows (React Flow's default is 0.5).  Low
 *  enough that the largest flowsheet in the corpus fits a small pane with a
 *  factor of two in hand (apalutamide01_tablets, about 5100 x 7100 px as
 *  laid out, needs 0.03 in a 1024 x 420 pane); at a zoom this low the
 *  canvas draws a map of the plant, which is what zooming all the way out
 *  is for, and F brings the fit back. */
export const FLOWSHEET_MIN_ZOOM = 0.01;

/** A fit never magnifies a small flowsheet past this (the value the canvas
 *  has always used). */
export const FLOWSHEET_FIT_MAX_ZOOM = 1.1;

/** The margin a fit leaves round the drawing, in screen pixels or as a
 *  percentage of the pane.  The TOP margin clears the legends and the Run
 *  button that float over the canvas (about 120 px tall, measured at
 *  1280 x 720); the bottom one clears the zoom controls and the
 *  keyboard-hint line. */
export const FLOWSHEET_FIT_PADDING = {
  top: "150px", bottom: "56px", left: "6%", right: "6%",
} as const;

/** The ONE set of options every fit of the whole flowsheet uses. */
export const FLOWSHEET_FIT: FitViewOptions = {
  padding: FLOWSHEET_FIT_PADDING,
  minZoom: FLOWSHEET_MIN_ZOOM,
  maxZoom: FLOWSHEET_FIT_MAX_ZOOM,
};

/** The same fit, animated -- for a re-fit the reader asked for (F, the
 *  layout menu), where the camera moving tells him what happened. */
export const FLOWSHEET_FIT_ANIMATED: FitViewOptions = { ...FLOWSHEET_FIT, duration: 200 };

/** The rectangle a set of boxes covers, in flowsheet coordinates. */
export interface Rect { x: number; y: number; width: number; height: number }

export function boundsOf(boxes: Iterable<Rect>): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
