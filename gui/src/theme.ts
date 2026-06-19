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

import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Cyan-leaning teal -- distinguishes from the default Mantine blue,
// reads as engineering/scientific.
const accent: MantineColorsTuple = [
  "#e0f7fa",
  "#b2ebf2",
  "#80deea",
  "#4dd0e1",
  "#26c6da",
  "#00bcd4",
  "#00acc1",
  "#0097a7",
  "#00838f",
  "#006064",
];

// Graphite-teal DARK scale (overrides Mantine's neutral-grey `dark`).  Goal: a
// dark mode that reads as a polished engineering tool, NOT a flat near-black
// debug console -- a subtle teal-tinted graphite with WELL-SEPARATED steps so
// the UI layers (canvas < panels < object blocks) are visibly distinct.
// Index 0 = lightest (default dark-mode text), 9 = darkest (deepest bg).
// Surface map already in the components: canvas/header = dark-8, panels/shell =
// dark-7, unit + stream blocks = dark-6 (so objects sit a layer above canvas),
// borders = dark-4/5.  light-dark()'s dark branch picks these up everywhere.
const graphite: MantineColorsTuple = [
  "#E8F2F2", // 0  text primary
  "#C9D6D7", // 1
  "#A6B4B7", // 2  text secondary / dimmed
  "#748388", // 3  text dim
  "#3A484C", // 4  object border / selected-adjacent
  "#2B383B", // 5  borders / hover
  "#212B2E", // 6  unit + stream block background (a layer above the canvas)
  "#172123", // 7  panels / sidebars / shell
  "#121A1C", // 8  canvas + header (graphite, not black)
  "#0E1517", // 9  deepest
];

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: { light: 6, dark: 4 },
  // The accent is a LIGHT cyan; white text on a filled accent button washes out
  // (dark-mode fill accent[4] #26c6da + white ≈ 1.8:1).  autoContrast flips the
  // filled text to BLACK when the fill is "light".  CAVEAT (Mantine internals):
  // the variant resolver computes this ONCE, scheme-independently, from the
  // *light* primaryShade (parse-theme-color passes colorScheme||"light"), so a
  // threshold tuned per-scheme does NOT work.  We therefore put the threshold
  // BELOW both fills so the accent always reads as "light" → BLACK text in BOTH
  // modes (consistent, ~8-12:1):
  //   accent[6] #00acc1 L≈0.33   accent[4] #26c6da L≈0.46   → both > 0.25
  autoContrast: true,
  luminanceThreshold: 0.25,
  colors: { accent, dark: graphite },
  defaultRadius: "md",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace:
    "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
  headings: {
    fontWeight: "600",
  },
});
