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
 *  ONE SIGN CONVENTION, and it is the lesson page's: Q_C is the condenser
 *  duty as the energy balance carries it, NEGATIVE because heat leaves, so
 *
 *      Delta_D = h_D - Q_C/D
 *
 *  and Delta_D sits ABOVE h_D.  This docstring used to write `h_D + Q_C/D`
 *  while the page wrote `h_D - Q_C/D`: two conventions for one quantity in
 *  two homes, and a reader comparing them has no way to tell which is meant.
 *  (It also opened with `h_D + (R+1)(H_1-h_D) - R(H_1-h_D)` as "the long
 *  way", which simplifies to H_1 and is not Delta_D at all.)
 *
 *  The heat REMOVED per mole of distillate is (R+1)(H_1 - h_D) for a total
 *  condenser -- that is -Q_C/D -- so
 *      Delta_D = h_D + (R + 1) * (H_1 - h_D),
 *  with H_1 the enthalpy of the saturated vapour leaving the top tray, read
 *  on the vapour curve AT x_D because a total condenser condenses it
 *  entirely (y_1 = x_D).  Delta_D therefore sits ABOVE the vapour curve, and further
 *  above it the LARGER the reflux: at total reflux it is at infinity, which
 *  is the geometry the lesson's step 3 describes. */
export function deltaD(rows: readonly HxyRow[], xD: number, R: number): Pt | null {
  const hD = hAt(rows, xD);
  if (hD === null) return null;
  //  On a TOTAL condenser the top vapour is condensed entirely, so y_1 = x_D
  //  and its enthalpy is the vapour curve read AT x_D -- NOT the vapour in
  //  equilibrium with a liquid of that composition, which is what a partial
  //  condenser would give.  See vapourEnthalpyAt.
  const H1 = vapourEnthalpyAt(rows, xD);
  if (H1 === null) return null;
  return { x: xD, y: hD + (R + 1) * (H1 - hD) };
}

/** Saturated-VAPOUR enthalpy at a VAPOUR composition, H(y).
 *
 *  THIS REPLACED A FUNCTION THAT ANSWERED A DIFFERENT QUESTION, and the
 *  difference is a physical claim rather than an indexing detail.  The old
 *  `vapourEnthalpyAtLiquid(rows, x)` interpolated H over the LIQUID column,
 *  so it returned the enthalpy of the vapour IN EQUILIBRIUM WITH a liquid of
 *  composition x -- which is what a PARTIAL condenser produces.  On a TOTAL
 *  condenser the top vapour is condensed entirely, so it does not sit in
 *  equilibrium with the distillate: it has the SAME COMPOSITION as it,
 *  y_1 = x_D, and its enthalpy must be read on the vapour curve AT x_D.
 *
 *  Measured on the witness at x_D = 0.66: the equilibrium vapour is at
 *  y = 0.7291 with H = -233.590 kJ/mol, while the vapour curve at 0.66 gives
 *  -234.147.  Delta_D moved from -221.037 to -221.761 kJ/mol.  Small here
 *  because ethanol/water's vapour curve is nearly flat across that gap --
 *  which is luck, not correctness -- and visible on the plot, where the top
 *  vapour marker now lands ON the vapour curve instead of beside it.
 */
export function vapourEnthalpyAt(
  rows: readonly HxyRow[], y: number,
): number | null {
  if (rows.length < 2) return null;
  //  The rows arrive sorted by x1 (readHxy), and the vapour curve is indexed
  //  by y1, so this walk needs its own ordering.  Sorting a copy keeps
  //  readHxy's contract -- the caller's array is the liquid-curve order that
  //  every other consumer relies on.
  const byY = [...rows].sort((a, b) => a.y1 - b.y1);
  if (y <= byY[0]!.y1) return byY[0]!.H;
  if (y >= byY[byY.length - 1]!.y1) return byY[byY.length - 1]!.H;
  for (let i = 1; i < byY.length; ++i) {
    const a = byY[i - 1]!, b = byY[i]!;
    if (y <= b.y1) {
      const t = (y - a.y1) / (b.y1 - a.y1 || 1);
      return a.H + t * (b.H - a.H);
    }
  }
  return null;
}

/** The internal reflux ratio read off the diagram by the lever rule --
 *  L/V = (Delta_D - H) / (Delta_D - h).
 *
 *  AT THE TOP TRAY THIS IS AN IDENTITY, NOT A CHECK: with Delta_D placed by
 *  deltaD as h_D + (R+1)(H_1 - h_D), substituting gives
 *  (R+1)(H_1-h_D) - (H_1-h_D) over (R+1)(H_1-h_D) = R/(R+1) for ANY H_1 --
 *  the ruler reproduces the number it was built from, right or wrong.  The
 *  page used to call it "the check a reader should demand"; it is the lever
 *  RULE the page shows, and the check that would mean something is the same
 *  lever on the NEXT tray against V_2 = L_1 + D, which needs the staircase
 *  this construction does not yet draw. */
export function leverLV(delta: Pt, H: number, h: number): number | null {
  const den = delta.y - h;
  if (Math.abs(den) < 1e-12) return null;
  return (delta.y - H) / den;
}
