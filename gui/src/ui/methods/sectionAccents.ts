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
  sectionAccents -- ONE accent colour per EduTools section (DEV.md 4c C374).

  Colour here means "which section" and nothing else: the section's tile, its
  heading marker and the left edge of its cards.  It is a different channel
  from the flowsheet's phase colours (liquid blue, vapour crimson, two-phase
  green are reserved and NOT used), and no hue reads as error, success or
  warning.  Every fact a colour carries has a second channel (the section's
  NAME on tile and heading, and its count): credo 2.6(d).

  `light` is held >= 3:1 against the white page, `dark` >= 3:1 against the
  graphite canvas (non-text marks, WCAG 1.4.11); the tile's text is the app's
  ordinary text colour over a 14 % tint of the accent, held >= 4.5:1
  (tests/eduToolsHomeTiles.test.ts computes both).  This table is the only
  place a section's hue is written.
\*---------------------------------------------------------------------------*/

import type { MethodDiscipline } from "./registry.js";

export interface SectionAccent { light: string; dark: string }

export const SECTION_ACCENTS: Record<MethodDiscipline, SectionAccent> = {
  "How Choupo works":                { light: "#7a6a58", dark: "#c9b8a3" },
  "Modelling & scale-up":            { light: "#8a3fc0", dark: "#cd9cf0" },
  "Thermodynamics":                  { light: "#4a43d0", dark: "#a6a3ff" },
  "Property data & parameters":      { light: "#0b7a75", dark: "#4fd1c5" },
  "Separations & phase equilibria":  { light: "#0b78a8", dark: "#5ec2ee" },
  "Heat transfer & energy":          { light: "#c2570c", dark: "#ff9d5c" },
  "Reaction engineering":            { light: "#b02aa8", dark: "#f08be8" },
  "Hydraulics & control":            { light: "#4f6b85", dark: "#a4bdd6" },
  "Process design & economics":      { light: "#8a6410", dark: "#e0b84f" },
  "Process safety":                  { light: "#8a3a22", dark: "#e07a60" },
  "Flowsheeting & numerics":         { light: "#6b7a0c", dark: "#c3d16a" },
};

/** The CSS custom property value for a section (resolved by the scheme). */
export const accentCss = (d: MethodDiscipline): string =>
  `light-dark(${SECTION_ACCENTS[d].light}, ${SECTION_ACCENTS[d].dark})`;
