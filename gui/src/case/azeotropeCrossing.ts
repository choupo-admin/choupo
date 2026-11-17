// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vítor Geraldes
//
// Where an equilibrium curve y(x) crosses the diagonal y = x: the azeotrope.
//
// An azeotrope is a CHANGE OF SIGN of (y - x) inside the composition range,
// not a point that lies close to the diagonal.  A closeness band marks every
// sampled point of a curve that hugs the diagonal (ethanol/water above
// x = 0.85 showed seven "azeotropes" for the one that exists), and misses a
// crossing on a coarse grid.  The crossing is located by linear interpolation
// between the two rows that bracket it; the temperature is interpolated the
// same way.  The pure ends (y = x by definition) are never reported.

export interface XyRow { x: number; y: number; T: number }
export interface AzeotropePoint { x: number; T: number }

/** Rows must be sorted by x.  `edge` excludes the pure ends. */
export function azeotropeCrossings(rows: XyRow[], edge = 1e-3): AzeotropePoint[] {
  const out: AzeotropePoint[] = [];
  const inside = (x: number) => x > edge && x < 1 - edge;
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!, b = rows[i + 1]!;
    const da = a.y - a.x, db = b.y - b.x;
    if (da === 0) {
      // A sampled point exactly on the diagonal counts once, at its own row.
      if (inside(a.x)) out.push({ x: a.x, T: a.T });
      continue;
    }
    if (da * db < 0) {
      const t = da / (da - db);
      const x = a.x + t * (b.x - a.x);
      if (inside(x)) out.push({ x, T: a.T + t * (b.T - a.T) });
    }
  }
  return out;
}
