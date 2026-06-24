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
  binaryFlash — the geometry of a binary isothermal flash, the next member of
  the operating-line graphical-method family.  PURE TypeScript: it reimplements
  ZERO equilibrium physics.  It consumes the SAME equilibrium curve the binary
  T-x-y view already draws (the engine's `x[c1] / T_bubble / y_eq_c1` trio, run
  once at the case P + γ-model) and does only the GRAPHICAL construction on it —
  the monotone interpolation/inversion of y*(x) and T_bubble(x), the
  Rachford-Rice split on that curve, the LEVER RULE, and the regime detection
  (bubble point V/F→0, dew point V/F→1, single-phase = no tie-line).

  A binary isothermal flash is fixed by 2 of {T, P, V/F} (Duhem).  At a frozen
  (P, model) the equilibrium curve is frozen too, so turning a knob is a 60-fps
  pure-TS redraw — no WASM re-run.  The construction the student SEES:
    · the equilibrium curve y*(x) and the 45° line,
    · the FEED z marked on the diagram,
    · the horizontal TIE-LINE from the liquid x_liq to the vapour y_vap at the
      flash condition (the equilibrium chord),
    · the LEVER RULE V/F = (z − x_liq)/(y_vap − x_liq), the two segment lengths
      drawn on the tie-line — the lever the student reads off as geometry.

  Convention throughout: x, y, z are mole fractions of the FIRST component (the
  one the equilibrium curve is indexed by — the more volatile if the engine
  emitted an increasing y*(x), which it does for component[0] of a binary).
\*---------------------------------------------------------------------------*/

/** The frozen equilibrium curve, lifted from the engine's T-x-y CSV.
 *  `x` is monotone increasing in [0,1]; `yEq[i]` is y*(x[i]); `Tbub[i]` the
 *  bubble temperature (K) at x[i].  All three arrays share the same length. */
export interface EqCurve
{
  /** liquid mole fraction of the first component, sorted ascending */
  x: number[];
  /** equilibrium vapour mole fraction y*(x[i]) of the first component */
  yEq: number[];
  /** bubble-point temperature (K) at x[i] — the boiling locus */
  Tbub: number[];
  /** the indexed component name (for labels) */
  comp: string;
}

/** A solved binary flash at one (T,P,z) or (V/F,P,z) condition. */
export interface FlashSolution
{
  /** the feed mole fraction of the first component */
  z: number;
  /** vapour fraction V/F ∈ [0,1] when two-phase; clamped + flagged otherwise */
  VF: number;
  /** liquid mole fraction x of the first component (= z when all-vapour edge) */
  xLiq: number;
  /** vapour mole fraction y of the first component (= z when all-liquid edge) */
  yVap: number;
  /** flash temperature (K) — the input when spec="TP", a result when spec="VF" */
  T: number;
  /** which side of the envelope we are on */
  regime: "two-phase" | "all-liquid" | "all-vapour";
  /** the bubble-point temperature (K) at the feed z — the lower phase boundary */
  Tbubble: number;
  /** the dew-point temperature (K) at the feed z — the upper phase boundary */
  Tdew: number;
  /** honest note when the construction degenerates (single phase, off-curve…) */
  note?: string;
}

/*---------------------------------------------------------------------------*\
  CSV sourcing — reuse the engine's T-x-y trio (zero physics here).
\*---------------------------------------------------------------------------*/

/** Build the equilibrium curve from the binary T-x-y CSV the Explorer already
 *  runs (header `x[<comp>], …, T_bubble, …, y_eq_<comp>, …`).  Rows whose y*
 *  or T_bubble is non-finite (an immiscibility gap the engine flagged) are
 *  dropped — the construction stays on the well-defined part of the curve.
 *  Returns null when the CSV is not a binary T-x-y table. */
export function eqCurveFromTxyCsv(csv: string): EqCurve | null
{
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 3) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const m = /^x\[([^\]]+)\]$/.exec(header[0] ?? "");
  if (!m) return null;
  const comp = m[1]!;
  const iX = 0;
  const iTbub = header.indexOf("T_bubble");
  const iYeq = header.indexOf("y_eq_" + comp);
  if (iTbub < 0 || iYeq < 0) return null;

  const rows: { x: number; y: number; T: number }[] = [];
  for (let r = 1; r < lines.length; r++)
  {
    const cells = lines[r]!.split(",");
    const x = Number(cells[iX]);
    const y = Number(cells[iYeq]);
    const T = Number(cells[iTbub]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(T))
      rows.push({ x, y, T });
  }
  if (rows.length < 2) return null;
  rows.sort((a, b) => a.x - b.x);
  return {
    comp,
    x: rows.map((p) => p.x),
    yEq: rows.map((p) => p.y),
    Tbub: rows.map((p) => p.T),
  };
}

/*---------------------------------------------------------------------------*\
  Monotone 1-D interpolation + inversion on the tabulated curve.
\*---------------------------------------------------------------------------*/

/** Piecewise-linear interpolation of ys(xs) at q, clamped to the table ends.
 *  xs must be ascending.  (Linear, like the McCabe staircase — the curve is
 *  already sampled finely; no spline overshoot near an azeotrope.) */
export function interpAt(xs: number[], ys: number[], q: number): number
{
  const n = xs.length;
  if (n === 0) return NaN;
  if (q <= xs[0]!) return ys[0]!;
  if (q >= xs[n - 1]!) return ys[n - 1]!;
  // binary search for the bracketing interval
  let lo = 0, hi = n - 1;
  while (hi - lo > 1)
  {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= q) lo = mid; else hi = mid;
  }
  const x0 = xs[lo]!, x1 = xs[hi]!;
  const t = x1 === x0 ? 0 : (q - x0) / (x1 - x0);
  return ys[lo]! + t * (ys[hi]! - ys[lo]!);
}

/** Equilibrium vapour y*(x) at a liquid composition x. */
export function yStar(curve: EqCurve, x: number): number
{
  return interpAt(curve.x, curve.yEq, x);
}

/** Bubble-point temperature T_bubble(x) at a liquid composition x. */
export function bubbleT(curve: EqCurve, x: number): number
{
  return interpAt(curve.x, curve.Tbub, x);
}

/** Invert a monotone tabulated relation ys(xs): find x such that ys(x) = target.
 *  Bisection on the bracket (robust whether ys ascends or descends; the bubble-
 *  T locus descends if component[0] is the lighter, ascends otherwise).
 *  Returns the nearest end when target is outside the table range. */
export function invertMonotone(xs: number[], ys: number[], target: number): number
{
  const n = xs.length;
  if (n === 0) return NaN;
  const ascending = ys[n - 1]! >= ys[0]!;
  const yLo = ascending ? ys[0]! : ys[n - 1]!;
  const yHi = ascending ? ys[n - 1]! : ys[0]!;
  if (target <= yLo) return ascending ? xs[0]! : xs[n - 1]!;
  if (target >= yHi) return ascending ? xs[n - 1]! : xs[0]!;
  // bisection on x within [xs[0], xs[n-1]]
  let a = xs[0]!, b = xs[n - 1]!;
  const f = (xq: number) => interpAt(xs, ys, xq) - target;
  let fa = f(a);
  for (let it = 0; it < 80; it++)
  {
    const mid = 0.5 * (a + b);
    const fm = f(mid);
    if (Math.abs(fm) < 1e-12 || (b - a) < 1e-10) return mid;
    if ((fa < 0) === (fm < 0)) { a = mid; fa = fm; }
    else b = mid;
  }
  return 0.5 * (a + b);
}

/*---------------------------------------------------------------------------*\
  The flash construction + the lever rule.
\*---------------------------------------------------------------------------*/

/** The bubble- and dew-point temperatures (K) at the feed z on this curve.
 *  Bubble: the boiling locus T_bubble(z).  Dew: the temperature whose
 *  equilibrium VAPOUR is z, i.e. T_bubble(x where y*(x)=z) — the first dew of a
 *  vapour of composition z is the bubble of the liquid it would condense to. */
export function envelopeAtFeed(curve: EqCurve, z: number): { Tbubble: number; Tdew: number }
{
  const Tbubble = bubbleT(curve, z);
  const xAtDew = invertMonotone(curve.x, curve.yEq, z);   // liquid whose y* = z
  const Tdew = bubbleT(curve, xAtDew);
  return { Tbubble, Tdew };
}

/** The lever-rule vapour fraction for a candidate liquid composition x against
 *  the feed z: V/F = (z − x)/(y*(x) − x).  Pure geometry on the tie-line. */
export function leverVF(curve: EqCurve, z: number, x: number): number
{
  const y = yStar(curve, x);
  const denom = y - x;
  if (Math.abs(denom) < 1e-12) return NaN;   // pinch / azeotrope: tie-line collapses
  return (z - x) / denom;
}

/** Solve the flash given the flash temperature T (and the frozen P/model curve).
 *
 *  At T the liquid sits at x_liq = T_bubble⁻¹(T) on the boiling locus, the
 *  vapour at y_vap = y*(x_liq); the lever rule on z gives V/F.  Outside the
 *  envelope (T below the feed bubble point, or above the feed dew point) the
 *  feed is single-phase: V/F is clamped to 0 / 1 and the tie-line collapses
 *  (regime + an honest note).  This is the Rachford-Rice solution specialised
 *  to a 2-component curve — the root is the temperature, not a Σ over K_i. */
export function flashAtT(curve: EqCurve, z: number, T: number): FlashSolution
{
  const { Tbubble, Tdew } = envelopeAtFeed(curve, z);
  const base: Pick<FlashSolution, "z" | "T" | "Tbubble" | "Tdew"> = { z, T, Tbubble, Tdew };

  // bubble/dew may be in either T-order depending on which component is lighter
  const Tlo = Math.min(Tbubble, Tdew);
  const Thi = Math.max(Tbubble, Tdew);

  if (T <= Tlo + 1e-9)
    return { ...base, VF: 0, xLiq: z, yVap: yStar(curve, z), regime: "all-liquid",
      note: T < Tlo - 1e-6 ? "below the bubble point — subcooled liquid; the tie-line collapses (V/F = 0)" : undefined };
  if (T >= Thi - 1e-9)
    return { ...base, VF: 1, xLiq: invertMonotone(curve.x, curve.yEq, z), yVap: z, regime: "all-vapour",
      note: T > Thi + 1e-6 ? "above the dew point — superheated vapour; the tie-line collapses (V/F = 1)" : undefined };

  const xLiq = invertMonotone(curve.x, curve.Tbub, T);
  const yVap = yStar(curve, xLiq);
  let VF = leverVF(curve, z, xLiq);
  VF = Math.min(1, Math.max(0, VF));
  return { ...base, VF, xLiq, yVap, regime: "two-phase" };
}

/** Solve the flash given a TARGET vapour fraction V/F (spec V/F mode), P/model
 *  frozen.  Find the liquid x whose lever rule yields V/F = target, then read
 *  the flash temperature off the boiling locus.  V/F=0 → bubble point (x=z);
 *  V/F=1 → dew point (y=z).  Monotone bisection in x between the two phase
 *  boundaries (x_bubble = z and x_dew = y*⁻¹(z)). */
export function flashAtVF(curve: EqCurve, z: number, vfTarget: number): FlashSolution
{
  const { Tbubble, Tdew } = envelopeAtFeed(curve, z);
  const base: Pick<FlashSolution, "z" | "Tbubble" | "Tdew"> = { z, Tbubble, Tdew };
  const vf = Math.min(1, Math.max(0, vfTarget));

  // the two endpoints of the tie-line family for this feed: at V/F=0 the liquid
  // IS the feed (x=z); at V/F=1 the vapour IS the feed (x = y*⁻¹(z)).
  const xBubble = z;
  const xDew = invertMonotone(curve.x, curve.yEq, z);

  if (vf <= 1e-9)
    return { ...base, VF: 0, xLiq: z, yVap: yStar(curve, z), T: Tbubble, regime: "all-liquid" };
  if (vf >= 1 - 1e-9)
    return { ...base, VF: 1, xLiq: xDew, yVap: z, T: Tdew, regime: "all-vapour" };

  // bisection on x in [min(xBubble,xDew), max(...)] for leverVF(x) = vf.
  // leverVF is monotone in x along the boiling locus between the two boundaries.
  let a = Math.min(xBubble, xDew), b = Math.max(xBubble, xDew);
  const f = (xq: number) => {
    const v = leverVF(curve, z, xq);
    return Number.isFinite(v) ? v - vf : 0;
  };
  let fa = f(a);
  let xLiq = 0.5 * (a + b);
  for (let it = 0; it < 80; it++)
  {
    xLiq = 0.5 * (a + b);
    const fm = f(xLiq);
    if (Math.abs(fm) < 1e-12 || (b - a) < 1e-12) break;
    if ((fa < 0) === (fm < 0)) { a = xLiq; fa = fm; }
    else b = xLiq;
  }
  const yVap = yStar(curve, xLiq);
  const T = bubbleT(curve, xLiq);
  return { ...base, VF: vf, xLiq, yVap, T, regime: "two-phase" };
}

/** Single-phase detection at (T) on this feed: true when the feed cannot split
 *  (T outside the [bubble, dew] window) — the construction has no tie-line. */
export function isSinglePhaseAtT(curve: EqCurve, z: number, T: number): boolean
{
  const { Tbubble, Tdew } = envelopeAtFeed(curve, z);
  const Tlo = Math.min(Tbubble, Tdew), Thi = Math.max(Tbubble, Tdew);
  return T <= Tlo + 1e-9 || T >= Thi - 1e-9;
}

/** The two lever-rule segment LENGTHS on the tie-line, in mole-fraction units
 *  of the first component:
 *    · liquidArm  = |z − x_liq|   (the arm whose length ∝ vapour amount V)
 *    · vapourArm  = |y_vap − z|   (the arm whose length ∝ liquid amount L)
 *  and the identity check V/F = liquidArm / (liquidArm + vapourArm).  Drawn as
 *  labelled segments so the lever rule is SEEN, not asserted. */
export function leverSegments(sol: FlashSolution): { liquidArm: number; vapourArm: number; total: number; vfFromArms: number }
{
  const liquidArm = Math.abs(sol.z - sol.xLiq);
  const vapourArm = Math.abs(sol.yVap - sol.z);
  const total = liquidArm + vapourArm;
  const vfFromArms = total > 1e-15 ? liquidArm / total : NaN;
  return { liquidArm, vapourArm, total, vfFromArms };
}
