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
  fluidisedBedPresets — the example particles and gases of the
  `fluidised-beds` EduTool, in ONE home for its two surfaces: the page
  (ui/methods/FluidisedBedsTool.tsx) and its laboratory tab
  (ui/methods/FluidisationLabTab.tsx, whose drawing is case/fluidisationLab.ts).

  The particle numbers are the page's own ILLUSTRATIVE values, chosen for
  the page, not measurements of any material; the gases are named by their
  molar mass only (the density is the ideal-gas law, the viscosity typed).
  They were moved here unchanged from FluidisedBedsTool.tsx on 2026-11-13,
  when the laboratory became their second reader.
\*---------------------------------------------------------------------------*/

export interface ParticlePreset {
  id: string;
  label: string;
  /** a short name for a column heading */
  short: string;
  /** diameter, micrometres */
  d_um: number;
  /** particle density, kg/m3 */
  rhoP: number;
  /** voidage at minimum fluidisation */
  eps: number;
  /** mass fraction of fines below 45 micrometres */
  F: number;
}

/** Example particles, this page's own illustrative numbers, not measurements. */
export const PARTICLES: readonly ParticlePreset[] = [
  { id: "sand", label: "Sand-like, 200 µm, 2600 kg/m³", short: "sand-like", d_um: 200, rhoP: 2600, eps: 0.42, F: 0 },
  { id: "catalyst", label: "Cracking-catalyst-like, 70 µm, 1500 kg/m³", short: "catalyst-like", d_um: 70, rhoP: 1500, eps: 0.45, F: 0.15 },
  { id: "fine", label: "A fine powder, 15 µm, 1200 kg/m³", short: "fine powder", d_um: 15, rhoP: 1200, eps: 0.55, F: 1 },
  { id: "grain", label: "Grain-like, 3 mm, 1200 kg/m³", short: "grain-like", d_um: 3000, rhoP: 1200, eps: 0.40, F: 0 },
];

/** Gases by molar mass (g/mol); the viscosity is typed by the student. */
export const GASES: readonly { id: string; label: string; M: number }[] = [
  { id: "air", label: "air (M = 28.96 g/mol)", M: 28.96 },
  { id: "N2", label: "nitrogen (M = 28.01 g/mol)", M: 28.01 },
  { id: "CO2", label: "carbon dioxide (M = 44.01 g/mol)", M: 44.01 },
  { id: "He", label: "helium (M = 4.003 g/mol)", M: 4.003 },
];
