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
  Choupo GUI -- stream colour palette (single source of truth)

  ONE place for everything that decides what colour a stream gets.  Before
  this module the phase palette + the classify() rule were duplicated
  byte-for-byte in FlowCanvas.tsx and StreamsWorkspace.tsx; any drift between
  the two silently desynchronised the canvas from the Streams workspace.

  Two orthogonal axes the user controls from the TopBar "Colours" menu
  (persisted alongside the display-unit prefs):

    colorScheme : which PALETTE the phases use   (default | cvd-safe)
    colorMode   : what the colour ENCODES        (phase | temperature | pressure)

  PEDAGOGICAL CONTRACT (docs/ai/gui-credo.md): in the default `phase` mode the
  stroke / terminal-border colour is SEMANTIC -- it is the solver's phase
  classification (vf + solid mass) and is never repainted on hover/selection.
  The `temperature` / `pressure` modes are an OPT-IN re-encoding: they map the
  stream's T (or P) through a luminance-monotonic, colour-blind-safe gradient
  (viridis) into the SAME colour slot, with a continuous-scale legend so a
  student never mistakes a gradient cyan for a liquid-phase cyan.  Phase stays
  the shipped default and the one-click resting state.
\*---------------------------------------------------------------------------*/

export type PhaseKind =
  | "empty"
  | "liquid"
  | "vapour"
  | "twoPhase"
  | "slurry"
  | "solid";

export type ColorScheme = "default" | "cvd-safe";
export type ColorMode = "phase" | "temperature" | "pressure";

/** Phase palettes.  `default` is the project cyan/orange lineup; `cvd-safe`
 *  is an Okabe-Ito-derived set chosen to stay distinct under deuteranopia /
 *  protanopia and separated in luminance (so it also survives a projector). */
const SCHEMES: Record<ColorScheme, Record<PhaseKind, string>> = {
  default: {
    empty: "#555a60",
    liquid: "#26c6da", // project cyan (matches accent-5)
    vapour: "#fa8c16", // warm orange
    twoPhase: "#b06ec1", // muted purple (liquid + vapour together)
    slurry: "#a07050", // warm brown (liquid + solid)
    solid: "#c89060", // tan
  },
  "cvd-safe": {
    empty: "#555a60",
    liquid: "#56b4e9", // sky blue
    vapour: "#e69f00", // orange
    twoPhase: "#cc79a7", // reddish purple
    slurry: "#8c6d31", // brown
    solid: "#f0e442", // yellow
  },
};

export const PHASE_LABEL: Record<PhaseKind, string> = {
  empty: "empty",
  liquid: "liquid",
  vapour: "vapour",
  twoPhase: "two-phase",
  slurry: "slurry",
  solid: "solid",
};

/** Short token shown beside the colour so phase is never colour-ALONE
 *  (accessibility: deuteranopia + at-a-distance projector legibility). */
export const PHASE_GLYPH: Record<PhaseKind, string> = {
  empty: "·",
  liquid: "L",
  vapour: "V",
  twoPhase: "V+L",
  slurry: "S+L",
  solid: "S",
};

export const PHASE_ORDER: PhaseKind[] = [
  "empty",
  "liquid",
  "vapour",
  "twoPhase",
  "slurry",
  "solid",
];

/** The colour assigned to a phase under the chosen scheme. */
export function phaseColor(phase: PhaseKind, scheme: ColorScheme = "default"): string {
  return SCHEMES[scheme][phase];
}

/** The whole phase->colour map for a scheme (legend rendering). */
export function phaseColors(scheme: ColorScheme = "default"): Record<PhaseKind, string> {
  return SCHEMES[scheme];
}

// ---- phase classification (the ONE rule) -----------------------------------

/** The stream fields the classifier needs (a structural subset of
 *  StreamResult, so callers can pass either a solver result or a partial). */
export interface PhaseInput {
  F?: number;
  F_mass?: number;
  F_solid_mass?: number;
  vf?: number;
}

export function classifyPhase(s: PhaseInput): PhaseKind {
  const fm = s.F_mass ?? 0;
  const fs = s.F_solid_mass ?? 0;
  const fluidEmpty = fm < 1e-15 && (s.F ?? 0) < 1e-15;
  if (fluidEmpty && fs < 1e-15) return "empty";
  if (fs > 0 && fluidEmpty) return "solid";
  if (fs > 0) return "slurry";
  const vf = s.vf;
  if (vf === undefined) return "liquid";
  if (vf >= 0.999) return "vapour";
  if (vf <= 0.001) return "liquid";
  return "twoPhase";
}

/** Total mass flow (fluid + solid) in kg/s -- drives the √F line thickness. */
export function totalFlowOf(s: PhaseInput): number {
  return (s.F_mass ?? 0) + (s.F_solid_mass ?? 0);
}

// ---- property gradient (colour-by-T / colour-by-P) -------------------------
//
// Three selectable colormaps (Colours menu).  For TEMPERATURE the intuitive
// model is blue = cold, red = hot -- the default `turbo` honours that.
//
//  turbo     The "rainbow done right" (Mikhailov/Google): dark-blue (deep
//            cold) -> blue -> cyan -> green -> yellow -> orange -> dark-red
//            (hot).  Keeps a classic rainbow's intuition + contrast but is
//            engineered to be perceptually smooth (no false bands) and far
//            more colour-blind-legible than the old jet.  Deliberately ends
//            in RED, not purple: a violet hot-end rhymes with the cold blue
//            and confuses "hottest" with "coldest".
//  coolwarm  Moreland diverging blue -> light grey -> red; ParaView's modern
//            default.  The cleanest / most honest, lower visual resolution.
//  viridis   Perceptually-uniform, the most colour-blind-safe; NOT intuitive
//            for temperature (purple-cold / yellow-hot), kept for a11y.

export type ColorMap = "turbo" | "coolwarm" | "viridis";

const RAMPS: Record<ColorMap, Array<[number, number, number]>> = {
  turbo: [
    [48, 18, 59], // #30123b  deep cold (dark indigo-blue)
    [65, 69, 171], // #4145ab  blue
    [70, 117, 237], // #4675ed
    [57, 162, 252], // #39a2fc  light blue (mild cold)
    [27, 207, 212], // #1bcfd4  cyan
    [36, 236, 166], // #24eca6
    [97, 252, 108], // #61fc6c  green
    [164, 252, 59], // #a4fc3b
    [209, 232, 52], // #d1e834  yellow
    [243, 198, 58], // #f3c63a
    [254, 155, 45], // #fe9b2d  orange
    [243, 99, 21], // #f36315
    [122, 4, 3], // #7a0403  hot (dark red)
  ],
  coolwarm: [
    [59, 76, 192], // #3b4cc0  cold (blue)
    [111, 145, 242], // #6f91f2
    [185, 204, 237], // #b9cced
    [221, 221, 221], // #dddddd  midpoint (neutral)
    [240, 169, 135], // #f0a987
    [226, 106, 83], // #e26a53
    [180, 4, 38], // #b40426  hot (red)
  ],
  viridis: [
    [68, 1, 84], // #440154
    [72, 40, 120],
    [62, 74, 137],
    [49, 104, 142],
    [38, 130, 142],
    [31, 158, 137],
    [53, 183, 121],
    [109, 205, 89],
    [253, 231, 37], // #fde725
  ],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map t in [0,1] to a hex colour on the chosen colormap (default turbo). */
export function gradientColor(t: number, map: ColorMap = "turbo"): string {
  const stops = RAMPS[map];
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const seg = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const r = Math.round(lerp(a[0], b[0], f));
  const g = Math.round(lerp(a[1], b[1], f));
  const bl = Math.round(lerp(a[2], b[2], f));
  return `#${[r, g, bl].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Colour for a value within [min,max] (clamped; degenerate range -> mid). */
export function colorForValue(
  value: number, min: number, max: number, map: ColorMap = "turbo",
): string {
  if (!Number.isFinite(value)) return "#555a60";
  if (!(max > min)) return gradientColor(0.5, map);
  return gradientColor((value - min) / (max - min), map);
}

/** A few legend stops (value + colour) across [min,max] for the scale bar. */
export function gradientStops(
  min: number, max: number, n = 5, map: ColorMap = "turbo",
): Array<{ value: number; color: string }> {
  const out: Array<{ value: number; color: string }> = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ value: min + (max - min) * t, color: gradientColor(t, map) });
  }
  return out;
}

/** A CSS linear-gradient(...) string sampling the colormap left->right. */
export function gradientCss(map: ColorMap = "turbo", n = 9): string {
  const stops: string[] = [];
  for (let i = 0; i < n; i++) stops.push(gradientColor(i / (n - 1), map));
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
