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
  THE PONCHON-SAVARIT GEOMETRY, as pure functions over the engine's own rows.

  SEPARATED FROM THE VIEW deliberately: this file computes the CONSTRUCTION
  (difference point, rays, tie-line stepping) and knows nothing about
  Plotly, so every claim the page makes is testable without a DOM -- the
  same split BjerrumTool and mccabeThiele already use.

  IT COMPUTES NO THERMODYNAMICS.  The two saturation curves and the
  equilibrium ties are READ from the enthalpyConcentration op's CSV; nothing
  here solves a bubble point or evaluates an enthalpy.  What it does is
  GEOMETRY on the points the engine published -- which is exactly what the
  construction is, and is why it can live in TypeScript without violating
  the zero-physics rule.
\*---------------------------------------------------------------------------*/

/** One equilibrium as the engine publishes it: BOTH ends of a tie line and
 *  the temperature they share.  Rows are never paired by index downstream --
 *  the op emits the pair together for exactly that reason. */
export interface HxyRow {
  x1: number;      // saturated-liquid composition
  y1: number;      // vapour in equilibrium with it
  T: number;       // K, shared by the pair
  h: number;       // J/mol, saturated liquid at x1
  H: number;       // J/mol, saturated vapour at y1
}

/** Read the op's CSV.  HEADER EQUALITY, not a prefix test: a drifted header
 *  must refuse rather than be read positionally and mis-columned -- the
 *  ThermoML slice paid for that lesson with an x1 column labelled water. */
export function readHxy(csv: string): HxyRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0]!.split(",").map((s) => s.trim());
  const iX = head.indexOf("x1");
  const iY = head.indexOf("y1");
  const iT = head.indexOf("T_K");
  const iH = head.indexOf("h_liquid_J_per_mol");
  const iV = head.indexOf("H_vapour_J_per_mol");
  const iS = head.indexOf("status");
  if (iX < 0 || iY < 0 || iT < 0 || iH < 0 || iV < 0) return [];

  const out: HxyRow[] = [];
  for (let i = 1; i < lines.length; ++i) {
    const c = lines[i]!.split(",");
    //  A REFUSED NODE KEEPS ITS GRID COORDINATE AND EMPTY SOLVED FIELDS, so
    //  a gap stays visible rather than being silently bridged.  Dropping the
    //  row here is what keeps the curve honest: an interpolation across a
    //  refusal would draw a line through a state the engine declined to
    //  compute.
    if (iS >= 0 && (c[iS] ?? "").trim() !== "ok") continue;
    const r: HxyRow = {
      x1: Number(c[iX]), y1: Number(c[iY]), T: Number(c[iT]),
      h: Number(c[iH]), H: Number(c[iV]),
    };
    if ([r.x1, r.y1, r.T, r.h, r.H].every(Number.isFinite)) out.push(r);
  }
  out.sort((a, b) => a.x1 - b.x1);
  return out;
}

export interface Pt { x: number; y: number }

/** Linear interpolation of the saturated-LIQUID enthalpy at a composition.
 *  Used only to place declared products (x_D, x_B) on the curve; it never
 *  invents a state between two the engine refused, because refused rows are
 *  already gone. */
export function hAt(rows: readonly HxyRow[], x: number): number | null {
  if (rows.length < 2) return null;
  if (x <= rows[0]!.x1) return rows[0]!.h;
  if (x >= rows[rows.length - 1]!.x1) return rows[rows.length - 1]!.h;
  for (let i = 1; i < rows.length; ++i) {
    const a = rows[i - 1]!, b = rows[i]!;
    if (x <= b.x1) {
      const t = (x - a.x1) / (b.x1 - a.x1 || 1);
      return a.h + t * (b.h - a.h);
    }
  }
  return null;
}

/** THE DIFFERENCE POINT from the reflux ratio.
 *
 *  Delta_D = h_D + (R + 1)(H_1 - h_D) - R(H_1 - h_D) ... is the long way.
 *  The short one, and the one the construction actually uses: the condenser
 *  duty per mole of distillate is (R+1)(H_1 - h_D) for a total condenser,
 *  so
 *      Delta_D = h_D + Q_C/D = h_D + (R + 1) * (H_1 - h_D),
 *  with H_1 the enthalpy of the saturated vapour leaving the top tray --
 *  the vapour in equilibrium with the distillate composition on a total
 *  condenser.  Delta_D therefore sits ABOVE the vapour curve, and further
 *  above it the LARGER the reflux: at total reflux it is at infinity, which
 *  is the geometry the lesson's step 3 describes. */
export function deltaD(rows: readonly HxyRow[], xD: number, R: number): Pt | null {
  const hD = hAt(rows, xD);
  if (hD === null) return null;
  //  The top vapour is in equilibrium with x_D on a total condenser, so its
  //  enthalpy is the H of the row whose LIQUID composition is x_D.
  const H1 = vapourEnthalpyAtLiquid(rows, xD);
  if (H1 === null) return null;
  return { x: xD, y: hD + (R + 1) * (H1 - hD) };
}

/** H of the vapour in equilibrium with the liquid at composition x. */
export function vapourEnthalpyAtLiquid(
  rows: readonly HxyRow[], x: number,
): number | null {
  if (rows.length < 2) return null;
  if (x <= rows[0]!.x1) return rows[0]!.H;
  if (x >= rows[rows.length - 1]!.x1) return rows[rows.length - 1]!.H;
  for (let i = 1; i < rows.length; ++i) {
    const a = rows[i - 1]!, b = rows[i]!;
    if (x <= b.x1) {
      const t = (x - a.x1) / (b.x1 - a.x1 || 1);
      return a.H + t * (b.H - a.H);
    }
  }
  return null;
}

/** The internal reflux ratio read off the diagram by the lever rule --
 *  L/V = (Delta_D - H) / (Delta_D - h).  Published so the page can SHOW that
 *  the ruler and the declared R agree at the top, which is the check a
 *  reader should demand of any construction. */
export function leverLV(delta: Pt, H: number, h: number): number | null {
  const den = delta.y - h;
  if (Math.abs(den) < 1e-12) return null;
  return (delta.y - H) / den;
}
