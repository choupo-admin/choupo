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
  mccabeThiele — the PURE geometry of the McCabe-Thiele binary-distillation
  construction.  ZERO physics is reimplemented here: the equilibrium curve
  y*(x) arrives already computed by the engine (SaturationCurves::binaryTxy →
  the (x[c1], y_eq_c1) pairing of the T-x-y run, the REAL NRTL/UNIFAC/Wilson/
  EOS curve at constant P — NOT a constant-α toy).  This module only:

    • inverts y*(x) by monotone interpolation (the frozen curve is the truth);
    • draws the straight operating lines (rectifying / stripping) + the q-line
      (the Constant Molar Overflow assumption — made VISIBLE, never hidden);
    • walks the staircase between y*(x) and the active operating line, counting
      equilibrium stages and detecting the feed stage;
    • finds the two limits — N_min (total reflux, geometric Fenske) and R_min
      (the pinch, q-line ∩ y*(x)) — and the pinch trap (R ≤ R_min ⇒ ∞ stages).

  Everything here is O(N) TypeScript so the R/q knobs redraw at 60 fps with NO
  WASM re-solve — the curve only changes when P or the thermo model change
  (those legitimately reshape it).  Turning R is a CONSTRUCTION move, not a
  thermo-state change, so re-solving would be physically pointless.

  Kept free of React / the DOM so the staircase is unit-tested directly
  (tests/mccabeThiele.test.ts): step count vs R, R_min detection, the q = 1
  vertical case, total vs partial condenser ±1 stage.

  References: Wankat, Separation Process Engineering 4e ch. 4;
  Seader-Henley-Roper, Separation Process Principles 3e §7.2; King, Separation
  Processes 2e ch. 9.
\*---------------------------------------------------------------------------*/

/** One monotone point of the equilibrium curve y*(x), light component basis. */
export interface EqPoint { x: number; y: number; }

/** The equilibrium curve y*(x): a frozen, sorted, monotone set of points the
 *  engine produced.  Interpolated (monotone, through exactly these points) for
 *  the staircase walk — interpolation error is a SEEable quantity (raise the
 *  grid n), never a hidden crutch. */
export interface EqCurve {
  pts: EqPoint[];     // sorted by x ascending, x in [0,1], y in [0,1]
}

/** The McCabe-Thiele problem statement (SET values — the inputs you author).
 *  xF/xD/xW are LIGHT-component mole fractions. */
export interface MccabeSpec {
  xF: number;            // feed composition
  xD: number;            // distillate composition (top)
  xW: number;            // bottoms / residue composition
  R: number;             // reflux ratio L/D (the knob)
  q: number;             // feed quality (the knob): 1 sat-liq, 0 sat-vap, …
  totalCondenser: boolean; // total → distillate vapour-of-comp = xD; partial → 1 stage
  partialReboiler: boolean; // a partial reboiler is an equilibrium stage (default true)
}

export interface Pt { x: number; y: number; }

/** A straight operating line y = m·x + b (drawing aid). */
export interface Line { m: number; b: number; }

/** The full geometric result the plot + readouts consume. */
export interface MccabeResult {
  rol: Line;                 // rectifying operating line
  sol: Line;                 // stripping operating line (DETERMINED, not input)
  qVertical: boolean;        // q == 1 → the q-line is vertical at x = xF
  qLine: Line | null;        // null when vertical
  feedInt: Pt;               // ROL ∩ q-line (the optimal feed switch abscissa)
  staircase: Pt[];           // polyline (alternating horizontal/vertical corners)
  nStages: number;           // equilibrium stages (incl. reboiler; partial cond +1)
  nStagesFractional: number; // with the fractional last step (N = 8.3 → 9)
  feedStage: number;         // 1-based stage where the step crosses to the SOL
  rMin: number;              // minimum reflux (the pinch)
  pinch: Pt | null;          // the pinch point (q-line ∩ y*), null if none
  nMin: number;              // total-reflux stages (geometric Fenske)
  pinched: boolean;          // R ≤ R_min(q) → trapped, infinite stages
  azeotrope: Pt | null;      // y*(x) crosses y = x between xW and xD → halt
  capped: boolean;           // staircase hit the safety step cap (treat as ∞)
}

const STEP_CAP = 400;        // honest ∞ guard: a real column never needs this many
const EPS = 1e-9;

/*---------------------------------------------------------------------------*\
  CSV → EqCurve.  The T-x-y run emits `x[<c1>], T_bubble, y_eq_<c1>, …`; the
  (x[c1], y_eq_c1) pairing IS y*(x) at constant P.  We read those two columns,
  drop non-finite / out-of-range rows, sort by x, and collapse duplicate x so
  the inverse is single-valued.  This is the ONLY bridge from engine physics
  into the construction — nothing is recomputed.
\*---------------------------------------------------------------------------*/
export function eqCurveFromTxyCsv(csv: string, comp: string): EqCurve | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const xi = header.findIndex((h) => h === `x[${comp}]` || h === `x_${comp}` || h === "x");
  const yi = header.indexOf(`y_eq_${comp}`);
  if (xi < 0 || yi < 0) return null;
  const raw: EqPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    const x = Number(cells[xi]);
    const y = Number(cells[yi]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < -EPS || x > 1 + EPS) continue;
    raw.push({ x: clamp01(x), y: clamp01(y) });
  }
  if (raw.length < 2) return null;
  raw.sort((a, b) => a.x - b.x);
  // collapse duplicate x (keep the last) so the inverse is well-posed
  const pts: EqPoint[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-7) pts[pts.length - 1] = p;
    else pts.push(p);
  }
  return pts.length >= 2 ? { pts } : null;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Build an EqCurve directly from (x,y) arrays — used by tests and any in-TS
 *  synthetic curve.  Same sorting / de-duplication as the CSV path. */
export function eqCurveFromPoints(xs: number[], ys: number[]): EqCurve | null {
  const csvLike: EqPoint[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]!, y = ys[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) csvLike.push({ x: clamp01(x), y: clamp01(y) });
  }
  if (csvLike.length < 2) return null;
  csvLike.sort((a, b) => a.x - b.x);
  const pts: EqPoint[] = [];
  for (const p of csvLike) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-7) pts[pts.length - 1] = p;
    else pts.push(p);
  }
  return pts.length >= 2 ? { pts } : null;
}

/** A constant-relative-volatility equilibrium curve y = αx/(1+(α−1)x) sampled
 *  on a grid — ONLY for tests (the real curve comes from the engine).  α > 1. */
export function constantAlphaCurve(alpha: number, n = 101): EqCurve {
  const pts: EqPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    pts.push({ x, y: (alpha * x) / (1 + (alpha - 1) * x) });
  }
  return { pts };
}

/*---------------------------------------------------------------------------*\
  Interpolation on the frozen curve.  Linear (monotone, through exactly the
  engine's points) is honest and robust for a staircase walk; a cubic would
  risk overshoot above y = x near a pinch.  yStar(x) forward; xForY(y) inverse
  (the curve is monotone in x along the engine's grid).
\*---------------------------------------------------------------------------*/
export function yStar(curve: EqCurve, x: number): number {
  const p = curve.pts;
  if (x <= p[0]!.x) return p[0]!.y;
  if (x >= p[p.length - 1]!.x) return p[p.length - 1]!.y;
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid]!.x <= x) lo = mid; else hi = mid;
  }
  const a = p[lo]!, b = p[hi]!;
  const t = (x - a.x) / (b.x - a.x || 1);
  return a.y + t * (b.y - a.y);
}

/** Inverse: the liquid composition x whose equilibrium vapour is y.  Used to
 *  step horizontally from an operating line to the equilibrium curve. */
export function xForY(curve: EqCurve, y: number): number {
  const p = curve.pts;
  if (y <= p[0]!.y) return p[0]!.x;
  if (y >= p[p.length - 1]!.y) return p[p.length - 1]!.x;
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid]!.y <= y) lo = mid; else hi = mid;
  }
  const a = p[lo]!, b = p[hi]!;
  const t = (y - a.y) / (b.y - a.y || 1);
  return a.x + t * (b.x - a.x);
}

/*---------------------------------------------------------------------------*\
  The two operating lines + the q-line.
\*---------------------------------------------------------------------------*/

/** Rectifying operating line: y = R/(R+1)·x + xD/(R+1), anchored at (xD,xD). */
export function rectifyingLine(R: number, xD: number): Line {
  const m = R / (R + 1);
  return { m, b: xD / (R + 1) };
}

/** q-line through (xF,xF), slope q/(q-1).  q == 1 → vertical (handled apart). */
export function qLine(q: number, xF: number): { vertical: boolean; line: Line | null } {
  if (Math.abs(q - 1) < 1e-6) return { vertical: true, line: null };
  const m = q / (q - 1);
  return { vertical: false, line: { m, b: xF - m * xF } };
}

/** ROL ∩ q-line: the abscissa where the staircase switches ROL → SOL (the
 *  OPTIMAL feed location).  For a vertical q-line, x = xF. */
export function feedIntersection(rol: Line, qv: { vertical: boolean; line: Line | null }, xF: number): Pt {
  if (qv.vertical) return { x: xF, y: rol.m * xF + rol.b };
  const ql = qv.line!;
  const x = (ql.b - rol.b) / (rol.m - ql.m);
  return { x, y: rol.m * x + rol.b };
}

/** Stripping operating line: DETERMINED, not input — the line from (xW,xW) to
 *  the ROL ∩ q-line intersection.  Pivots about (xW,xW) as R and q move. */
export function strippingLine(feedInt: Pt, xW: number): Line {
  const m = (feedInt.y - xW) / (feedInt.x - xW || EPS);
  return { m, b: xW - m * xW };
}

/*---------------------------------------------------------------------------*\
  R_min (the pinch) and N_min (total reflux).
\*---------------------------------------------------------------------------*/

/** The pinch: where the q-line meets the equilibrium curve y*(x).  Returns the
 *  intersection (x_p, y_p) and R_min from
 *      R_min/(R_min+1) = (xD − y_p)/(xD − x_p).
 *  A tangent-pinch (the line through (xD,xD) grazing a convex curve before the
 *  q-line) is approximated by scanning curve points between xF and xD for the
 *  secant from (xD,xD) that demands the MOST reflux; we report whichever pinch
 *  (q-line or tangent) binds harder. */
export function minimumReflux(curve: EqCurve, xF: number, xD: number, q: number): { rMin: number; pinch: Pt | null } {
  const qv = qLine(q, xF);
  const pinchQ = intersectQlineWithCurve(curve, qv, xF);
  let rMinTangent = -Infinity;
  let pinchTangent: Pt | null = null;
  for (const p of curve.pts) {
    if (p.x >= xD - EPS) continue;
    if (p.x < xF - 1e-6) continue;            // tangent pinch lives between xF and xD
    const slope = (xD - p.y) / (xD - p.x);    // = R/(R+1)
    if (slope <= 0 || slope >= 1) continue;
    const r = slope / (1 - slope);
    if (r > rMinTangent) { rMinTangent = r; pinchTangent = { x: p.x, y: p.y }; }
  }
  let rMinQ = -Infinity;
  if (pinchQ) {
    const slope = (xD - pinchQ.y) / (xD - pinchQ.x);
    if (slope > 0 && slope < 1) rMinQ = slope / (1 - slope);
  }
  if (rMinQ >= rMinTangent && pinchQ) return { rMin: Math.max(0, rMinQ), pinch: pinchQ };
  if (pinchTangent) return { rMin: Math.max(0, rMinTangent), pinch: pinchTangent };
  return { rMin: Math.max(0, rMinQ), pinch: pinchQ };
}

/** q-line ∩ equilibrium curve.  Vertical q-line: y*(xF).  Else march the curve
 *  for the sign change of (y_curve − y_qline). */
function intersectQlineWithCurve(curve: EqCurve, qv: { vertical: boolean; line: Line | null }, xF: number): Pt | null {
  if (qv.vertical) return { x: xF, y: yStar(curve, xF) };
  const ql = qv.line!;
  const p = curve.pts;
  let prev = p[0]!.y - (ql.m * p[0]!.x + ql.b);
  for (let i = 1; i < p.length; i++) {
    const cur = p[i]!.y - (ql.m * p[i]!.x + ql.b);
    if (prev === 0) return { x: p[i - 1]!.x, y: p[i - 1]!.y };
    if ((prev < 0) !== (cur < 0)) {
      const t = prev / (prev - cur);
      const x = p[i - 1]!.x + t * (p[i]!.x - p[i - 1]!.x);
      return { x, y: yStar(curve, x) };
    }
    prev = cur;
  }
  return null;
}

/** N_min: total reflux, both operating lines collapse to y = x; step between
 *  y*(x) and the 45° line from xD down to xW (geometric Fenske). */
export function minimumStages(curve: EqCurve, xD: number, xW: number, partialReboiler: boolean): number {
  let x = xD;
  let n = 0;
  while (x > xW + 1e-6 && n < STEP_CAP) {
    const y = x;                       // op-line is the 45° diagonal
    const xEq = xForY(curve, y);
    if (xEq >= x - 1e-9) break;        // not advancing → pinched even at total reflux
    x = xEq;
    n++;
  }
  if (!partialReboiler && n > 0) n -= 0; // a (rare) total reboiler is not a stage
  return n;
}

/*---------------------------------------------------------------------------*\
  THE STAIRCASE.  From (xD,xD): step horizontally to y*(x) (invert), then
  vertically down to the ACTIVE operating line; switch ROL → SOL once the step
  passes the ROL ∩ q-line abscissa (the feed stage).  Continue until x ≤ xW.
\*---------------------------------------------------------------------------*/
export function buildMccabe(curve: EqCurve, spec: MccabeSpec): MccabeResult {
  const { xF, xD, xW, R, q, totalCondenser, partialReboiler } = spec;
  const rol = rectifyingLine(R, xD);
  const qv = qLine(q, xF);
  const feedInt = feedIntersection(rol, qv, xF);
  const sol = strippingLine(feedInt, xW);

  const { rMin, pinch } = minimumReflux(curve, xF, xD, q);
  const nMin = minimumStages(curve, xD, xW, partialReboiler);

  // azeotrope: y*(x) meets y = x strictly between xW and xD → no op-line steps
  // past it; the staircase cannot cross the diagonal.
  const azeotrope = findAzeotrope(curve, Math.min(xW, xD), Math.max(xW, xD));

  // pinch trap: R at or below R_min(q) jams the staircase at the pinch.
  const pinched = R <= rMin + 1e-6;

  // active op-line at a given x: ROL right of the feed abscissa, SOL left.
  const activeLine = (x: number): Line => (x >= feedInt.x - 1e-9 ? rol : sol);

  const staircase: Pt[] = [];
  let nStages = 0;
  let feedStage = 0;
  let nFrac = 0;
  let capped = false;

  if (!pinched && !azeotrope) {
    // Walk from (xD,xD) on the 45° line.  Each loop = one equilibrium stage:
    // horizontal LEFT to the curve, then vertical DOWN to the active op-line.
    let x = xD;
    let y = xD;
    staircase.push({ x, y });
    let crossed = false;
    let xPrev = xD;

    while (x > xW + 1e-6 && nStages < STEP_CAP) {
      const xEq = xForY(curve, y);             // horizontal step to the curve
      staircase.push({ x: xEq, y });
      xPrev = x;
      x = xEq;
      nStages++;
      if (!crossed && x <= feedInt.x + 1e-9) { crossed = true; feedStage = nStages; }
      if (x <= xW + 1e-6) {
        // fractional last step: how much of this step was needed to reach xW.
        const fullStep = xPrev - x;
        const need = xPrev - xW;
        nFrac = (nStages - 1) + (fullStep > EPS ? clamp01(need / fullStep) : 1);
        break;
      }
      const line = activeLine(x);              // vertical step to the op-line
      y = line.m * x + line.b;
      staircase.push({ x, y });
    }
    if (nStages >= STEP_CAP) capped = true;
    if (feedStage === 0) feedStage = nStages;  // feed at/after the bottom
    if (nFrac === 0) nFrac = nStages;

    // partial condenser is an extra equilibrium stage above the top tray.
    if (!totalCondenser) { nStages += 1; nFrac += 1; feedStage += 1; }
    // a TOTAL reboiler (no equilibrium stage) subtracts one; the default is a
    // partial reboiler (an equilibrium stage), already counted by the walk.
    if (!partialReboiler && nStages > 0) { nStages -= 1; nFrac -= 1; }
  }

  return {
    rol, sol,
    qVertical: qv.vertical,
    qLine: qv.line,
    feedInt,
    staircase,
    nStages: pinched || azeotrope || capped ? Infinity : nStages,
    nStagesFractional: pinched || azeotrope || capped ? Infinity : nFrac,
    feedStage,
    rMin,
    pinch,
    nMin,
    pinched,
    azeotrope,
    capped,
  };
}

/** y*(x) crossing y = x strictly inside (lo,hi): the azeotrope.  Endpoints
 *  (pure components) are excluded. */
function findAzeotrope(curve: EqCurve, lo: number, hi: number): Pt | null {
  const p = curve.pts;
  const inside = (x: number) => x > lo + 1e-3 && x < hi - 1e-3;
  for (let i = 1; i < p.length; i++) {
    const prev = p[i - 1]!.y - p[i - 1]!.x;
    const cur = p[i]!.y - p[i]!.x;
    // an interior grid point that sits EXACTLY on the diagonal is a crossing
    if (Math.abs(cur) < 1e-9 && inside(p[i]!.x)) return { x: p[i]!.x, y: p[i]!.x };
    // a sign change of (y − x) between two grid points brackets a crossing
    if (Math.sign(prev) !== Math.sign(cur) && Math.abs(prev) > 1e-9 && Math.abs(cur) > 1e-9) {
      const t = prev / (prev - cur);
      const x = p[i - 1]!.x + t * (p[i]!.x - p[i - 1]!.x);
      if (inside(x)) return { x, y: x };
    }
  }
  return null;
}

/*---------------------------------------------------------------------------*\
  Sensitivity sweep: N(R).  Re-walk the BROWSER staircase across a range of R
  (no WASM).  The R_min asymptote and the N_min floor are the anchors.
\*---------------------------------------------------------------------------*/
export interface SweepPoint { R: number; ratio: number; N: number; }

export function sweepReflux(curve: EqCurve, spec: MccabeSpec, n = 60, maxFactor = 5): { rMin: number; nMin: number; points: SweepPoint[] } {
  const r = minimumReflux(curve, spec.xF, spec.xD, spec.q);
  const rMin = r.rMin;
  const nMin = minimumStages(curve, spec.xD, spec.xW, spec.partialReboiler);
  const points: SweepPoint[] = [];
  const r0 = rMin * 1.02 + 1e-3;                 // never AT R_min (∞ there)
  const r1 = Math.max(rMin * maxFactor, r0 + 1);
  for (let i = 0; i < n; i++) {
    const R = r0 + (r1 - r0) * (i / (n - 1));
    const res = buildMccabe(curve, { ...spec, R });
    const N = Number.isFinite(res.nStages) ? res.nStages : NaN;
    points.push({ R, ratio: rMin > EPS ? R / rMin : R, N });
  }
  return { rMin, nMin, points };
}

/** Convenience: spec with sensible defaults for a sharp split. */
export function defaultSpec(partial: { [k in keyof MccabeSpec]?: MccabeSpec[k] } = {}): MccabeSpec {
  return {
    xF: 0.5, xD: 0.95, xW: 0.05, R: 2, q: 1,
    totalCondenser: true, partialReboiler: true,
    ...partial,
  };
}

/*---------------------------------------------------------------------------*\
  TODO — gas absorption (Kremser / operating-line) is the SAME pattern and
  belongs here next (DESIGN BRIEF §1.2, slices 3-4):

    • ONE counter-current section, no reflux / q-split.
    • Equilibrium line y = m·x (dilute, Henry slope) OR a curved Y*(X) drawn
      from the SAME engine K (mole-ratio axes when the inlet solute > ~10 %).
    • Operating line from (X_in, Y_out) to (X_out, Y_in); ABOVE equilibrium for
      absorption, BELOW for stripping (a sign-flip toggle).
    • Staircase between them → N; ONE knob L/G; (L/G)_min the pinch (same honest
      trap as R_min here); the Kremser closed form
          N = ln[((y_in−m·x_in)/(y_out−m·x_in))(1−1/A)+1/A]/ln A,  A = L/(mV)
      as the analytical anchor (the absorption analogue of Fenske/Underwood).

  Reuse THIS module's xForY / staircase walk / pinch guard verbatim — only the
  operating-line construction (no reflux split) and the coordinate choice
  (mole ratios) differ.  Add `"kremser"` to PlotKind gated by carrier+soluble-
  solute, and a KremserPlot.tsx sibling of McCabePlot.tsx.  Not built here so
  the distillation instrument ships first and complete.
\*---------------------------------------------------------------------------*/
