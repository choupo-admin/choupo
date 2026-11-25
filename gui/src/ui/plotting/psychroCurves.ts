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
  Choupo -- Copyright (C) 2026 Vítor Geraldes -- GPL-3.0-or-later

  The pure half of the psychrometric chart (no plotting library, so a test can
  import it): the engine's CSV rows grouped by curve key.
\*---------------------------------------------------------------------------*/

export interface Series { x: number[]; y: number[]; }

/** Curve key -> its points.  The key is the engine's CSV text AS WRITTEN
 *  (`adiabatic:20.1` and `adiabatic:20.9` are two curves; the third external
 *  review found them both named `adiabatic:20`), so nothing here may round
 *  it: rounding is for the legend only (`curveLabelNumber`). */
export function groupPsychroCurves(rows: string[]): Map<string, Series> {
  const groups = new Map<string, Series>();
  for (let i = 1; i < rows.length; i++) {
    const parts = rows[i]!.split(",");
    if (parts.length < 3) continue;
    const t = Number(parts[0]);
    const y = Number(parts[1]);
    const curve = parts[2]!;
    if (!Number.isFinite(t) || !Number.isFinite(y)) continue;
    if (!groups.has(curve)) groups.set(curve, { x: [], y: [] });
    const g = groups.get(curve)!;
    g.x.push(t);
    g.y.push(y);
  }
  return groups;
}

/** The anchor value of a curve key, rounded to 2 decimals for the LEGEND. */
export function curveLabelNumber(txt: string): string {
  const v = Number(txt);
  return Number.isFinite(v) ? String(Number(v.toFixed(2))) : txt;
}

