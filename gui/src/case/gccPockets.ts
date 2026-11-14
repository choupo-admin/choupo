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
  Choupo GUI -- heat-recovery pockets of the grand composite curve (C301)

  A pure function over the corrected cascade (T*, Q) points of the engine's
  problem table, ordered from the highest T* to the lowest, as
  grandCompositeFromTable() returns them.  No engine number is changed; the
  only new numbers are the linear-interpolation crossings that close a pocket.

  DEFINITION IMPLEMENTED (the textbook construction, one pocket per "nose"):
    1. The curve is split at its ANCHOR, the point of least Q (the pinch; for a
       threshold problem the end of the range where the curve touches zero).
       Each side is walked OUTWARD from the anchor (away from the pinch).
    2. A NOSE is an interior point of that walk that is a strict local maximum
       of Q: the cascade runs away from the Q = 0 axis, then turns back.
    3. Walking on from the nose, the curve falls to the next local minimum (or
       to the end of the range); its Q there is the CLOSING LEVEL L.  The
       vertical line Q = L is the closure.
    4. Walking back from the nose towards the anchor, the curve first reaches
       Q = L at a crossing (linear interpolation).  The pocket is the region
       between the curve and the vertical line Q = L, from that crossing,
       over the nose, to the minimum.
  Why: inside that region the cascade is being reused -- heat that the process
  releases in one band is taken by the process in another, so the duty there
  is exchanged process-to-process and no utility is placed in it; the utility
  is read where the curve leaves the pocket (at Q = L), which is what makes
  the pocket the place a student should not put a heater or a cooler.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

export interface GccPoint { T: number; Q: number; }

export interface GccPocket {
  /** "above" the anchor (higher T*) or "below" it */
  side: "above" | "below";
  /** the nose: local maximum of Q */
  nose: GccPoint;
  /** closing level L [same unit as Q]: the vertical line Q = L */
  closeQ: number;
  /** the crossing where the curve first reaches Q = L on the way back */
  crossing: GccPoint;
  /** the point where the curve reaches its next local minimum (Q = L) */
  end: GccPoint;
  /** closed outline: crossing, the curve points to the end (closed by Q = L) */
  polygon: GccPoint[];
}

const EPS = 1e-9;

export function gccPockets(points: GccPoint[]): GccPocket[] {
  if (points.length < 3) return [];
  let anchor = 0;
  for (let i = 1; i < points.length; i++)
    if (points[i]!.Q < points[anchor]!.Q - EPS) anchor = i;

  const out: GccPocket[] = [];
  const walk = (seq: GccPoint[], side: "above" | "below") => {
    // seq[0] is the anchor; seq runs outward
    for (let i = 1; i < seq.length - 1; i++) {
      const p = seq[i]!;
      if (!(p.Q > seq[i - 1]!.Q + EPS && p.Q > seq[i + 1]!.Q + EPS)) continue;
      let j = i + 1;                       // fall to the next local minimum
      while (j + 1 < seq.length && seq[j + 1]!.Q < seq[j]!.Q - EPS) j++;
      const end = seq[j]!;
      const L = end.Q;
      let k = i;                           // first crossing of Q = L, walking back
      while (k > 0 && seq[k - 1]!.Q > L + EPS) k--;
      const a = seq[k]!;                   // first point above L
      const b = seq[Math.max(k - 1, 0)]!;  // the point at or below L
      const f = Math.abs(a.Q - b.Q) < EPS ? 0 : (L - b.Q) / (a.Q - b.Q);
      const crossing = { T: b.T + f * (a.T - b.T), Q: L };
      out.push({ side, nose: p, closeQ: L, crossing, end,
        polygon: [crossing, ...seq.slice(k, j + 1)] });
      i = j - 1;                           // the next nose lies beyond the minimum
    }
  };
  walk(points.slice(0, anchor + 1).reverse(), "above");
  walk(points.slice(anchor), "below");
  return out;
}
