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
  Choupo GUI -- the canvas colouring that belongs to THIS CASE (DEV.md 4c C114)

  Two homes for colouring state, and the split is the prefs.ts ruling: a
  WAY OF LOOKING belongs to the reader and persists (what the wires encode,
  the colormap, linear or log -- `DisplayPrefs`), while a choice that only
  means something on the case in front of the reader lives here, per tab,
  and is cleared when another case opens: a range typed in this plant's
  numbers, a threshold, the compound being followed, the unit KPI (KPI
  names differ from case to case).  A fixed range of 300-400 K carried into
  a cryogenic plant, or "follow NH3" into a case with no NH3, would draw a
  picture nobody asked for.
\*---------------------------------------------------------------------------*/

import { create } from "zustand";

import type { FixedRange, Threshold, UnitMapKind } from "../case/streamColouring.js";

export interface CanvasColourState {
  /** A fixed colour range for the stream field, canonical SI (null = auto). */
  range: FixedRange;
  /** Dim streams whose field value lies outside this (null = off). */
  threshold: Threshold | null;
  /** The component being followed ("follow a molecule"), or null. */
  follow: string | null;
  /** The unit KPI the unit boxes are coloured by, or null (no colouring). */
  unitKpi: string | null;
  unitMap: UnitMapKind;
  /** Dim units whose KPI value lies outside this (null = off). */
  unitThreshold: Threshold | null;
  /** The range the canvas is DRAWING right now (canonical SI), published by
   *  the canvas so the Colours menu can offer it as the starting point of a
   *  fixed range.  Written by FlowCanvas only. */
  shownRange: { min: number; max: number } | null;

  set: (patch: Partial<Omit<CanvasColourState, "set" | "resetForCase">>) => void;
  resetForCase: () => void;
}

const CLEAR = {
  shownRange: null,
  range: null,
  threshold: null,
  follow: null,
  unitKpi: null,
  unitMap: "diverging" as UnitMapKind,
  unitThreshold: null,
};

export const useCanvasColour = create<CanvasColourState>((set) => ({
  ...CLEAR,
  set: (patch) => set(patch),
  resetForCase: () => set(CLEAR),
}));
