/*---------------------------------------------------------------------------*\
  pinchGridLayout -- pure geometry for the classical pinch GRID DIAGRAM.

  Hot streams are horizontal lanes on top (they run left->right: temperature
  DECREASES to the right, so a hot stream flows from its supply T towards its
  target T); cold streams are lanes below (right->left, heating up).  The x
  axis is SHIFTED temperature T* (hot -dTmin/2, cold +dTmin/2), drawn as an
  EXPLICIT ticked axis along the bottom, so the pinch is ONE vertical line
  and a feasible match (>= dTmin driving force) is a vertical line inside the
  pair's shifted-T overlap -- the same construction computePinch() used to
  screen the matches.  Stream endpoint labels show the ACTUAL temperatures
  (the secondary scale; the tooltip carries both).  The minimum-utility
  tails are drawn as dashed segments in their own thin lanes: hot utility
  above the pinch (left of the pinch line), cold utility below it.

  The PARETO FILTER is VIEW-side only: a stream whose duty is below a
  threshold fraction of the characteristic process enthalpy (the TOTAL
  heating + cooling demand) is omitted from the DRAWING -- announced BY NAME
  in the footer with an inline Show-all override, never silent -- while the
  pinch computation (targets, curves, matches) keeps using every stream.  A
  stream exactly AT the threshold is KEPT; 0 % draws all.  Kept free of
  DOM/React so the mapping is unit-testable (the ganttLayout.ts twin).
\*---------------------------------------------------------------------------*/

import type { ThermalStream, HeatMatch } from "../../case/pinch.js";

export const LANE_HEIGHT = 34;
export const LANE_TOP = 34;        // header strip (zone + named pinch labels)
export const GROUP_GAP = 30;       // hot block <-> cold block separation
export const UTIL_LANE_HEIGHT = 26; // thin lanes for the utility tails
export const AXIS_STRIP = 38;      // ticked shifted-T axis along the bottom
export const PLOT_RIGHT = 46;      // room for the target-end temperature label
export const MIN_MATCH_SEP = 18;   // px between match lines that would overlap
export const MIN_SEG_PX = 24;      // minimum drawn extent of a stream segment
export const MIN_LEFT = 120;       // name column: responsive within these
export const MAX_LEFT = 340;
export const NAME_CHAR_PX = 7;     // conservative 12-px-font char width

// ---- Pareto filter ---------------------------------------------------------

export interface ParetoFilter {
  kept: ThermalStream[];
  omitted: ThermalStream[];
  /** Characteristic process enthalpy: total heating + cooling demand of ALL
   *  streams in the analysis (kW) -- the Pareto reference. */
  refKW: number;
  /** Sum of the omitted duties (kW) -- for the footer announcement. */
  omittedKW: number;
  /** The cutoff in kW: (pct/100) * refKW. */
  thresholdKW: number;
}

/** Split the thermal streams into drawn / omitted by the Pareto threshold
 *  (percent of the total process duty).  Strictly-below is omitted, so a
 *  stream exactly AT the threshold stays; pct <= 0 (or non-finite) keeps
 *  everything -- passing 0 is the footer's "Show all" override.  Never
 *  reorders. */
export function paretoFilter(
  streams: ThermalStream[],
  thresholdPct: number,
): ParetoFilter {
  const pct = Number.isFinite(thresholdPct)
    ? Math.min(100, Math.max(0, thresholdPct))
    : 0;
  const refKW = streams.reduce((a, s) => a + s.Q_kW, 0);
  const thresholdKW = (pct / 100) * refKW;
  const kept: ThermalStream[] = [];
  const omitted: ThermalStream[] = [];
  // Cross-multiplied comparison: (Q/ref)*100 < pct without the division, so a
  // stream sitting EXACTLY at the threshold is kept (no (5/100)*100 = 5.0…01).
  for (const s of streams) (s.Q_kW * 100 < pct * refKW ? omitted : kept).push(s);
  return {
    kept,
    omitted,
    refKW,
    omittedKW: omitted.reduce((a, s) => a + s.Q_kW, 0),
    thresholdKW,
  };
}

// ---- Lanes -----------------------------------------------------------------

export interface GridLane {
  stream: ThermalStream;
  y: number;           // lane centre, px
}

export interface GridLanes {
  hot: GridLane[];     // top block, input order
  cold: GridLane[];    // bottom block, input order
  utilHotY: number | null;   // thin hot-utility lane ABOVE the hot block
  utilColdY: number | null;  // thin cold-utility lane BELOW the cold block
  lanesBottom: number; // y where the lane region ends (the axis sits here)
  height: number;      // total svg height (lanes + the ticked axis strip)
}

/** Assign lanes: an optional thin hot-utility lane, the hot streams (input
 *  order), a gap (the no-matches annotation row), the cold streams, an
 *  optional thin cold-utility lane, then the axis strip.  y is the lane
 *  CENTRE. */
export function gridLanes(
  kept: ThermalStream[],
  utils: { hotUtility: boolean; coldUtility: boolean },
): GridLanes {
  const hotS = kept.filter((s) => s.kind === "hot");
  const coldS = kept.filter((s) => s.kind === "cold");
  let y = LANE_TOP;
  const utilHotY = utils.hotUtility ? y + UTIL_LANE_HEIGHT / 2 : null;
  if (utils.hotUtility) y += UTIL_LANE_HEIGHT;
  const hot = hotS.map((s, i) => ({
    stream: s,
    y: y + LANE_HEIGHT * (i + 0.5),
  }));
  y += LANE_HEIGHT * hotS.length + GROUP_GAP;
  const cold = coldS.map((s, i) => ({
    stream: s,
    y: y + LANE_HEIGHT * (i + 0.5),
  }));
  y += LANE_HEIGHT * coldS.length;
  const utilColdY = utils.coldUtility ? y + UTIL_LANE_HEIGHT / 2 : null;
  if (utils.coldUtility) y += UTIL_LANE_HEIGHT;
  const lanesBottom = y + 6;
  return { hot, cold, utilHotY, utilColdY, lanesBottom, height: lanesBottom + AXIS_STRIP };
}

// ---- Shifted-temperature axis ----------------------------------------------

export interface GridAxis {
  tLo: number;         // shifted T at the RIGHT edge
  tHi: number;         // shifted T at the LEFT edge (high T left)
  left: number;        // responsive name-column width (px)
  plotWidth: number;   // drawable width (px)
}

/** Responsive left column: wide enough for the longest stream name (so
 *  qualified names like FERMENTATION.Fermentor never clip), bounded to keep
 *  the plot usable. */
export function gridLeft(names: string[]): number {
  const maxChars = names.reduce((a, n) => Math.max(a, n.length), 0);
  return Math.min(MAX_LEFT, Math.max(MIN_LEFT, 20 + maxChars * NAME_CHAR_PX));
}

/** The shifted-T axis: domain covering every drawn endpoint AND the pinch
 *  (the pinch line must stay drawable even when filtering trims the
 *  extremes), padded 4 % (a degenerate span widens to 1 K); left margin from
 *  the kept stream names; plot width from the container. */
export function gridAxis(
  kept: ThermalStream[],
  dTmin: number,
  pinchShift: number | null,
  width: number,
): GridAxis {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of kept) {
    const d = s.kind === "hot" ? -dTmin / 2 : dTmin / 2;
    lo = Math.min(lo, s.Ts + d, s.Tt + d);
    hi = Math.max(hi, s.Ts + d, s.Tt + d);
  }
  if (pinchShift != null) {
    lo = Math.min(lo, pinchShift);
    hi = Math.max(hi, pinchShift);
  }
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const pad = 0.04 * (hi - lo);
  const left = gridLeft(kept.map((s) => s.unit));
  return {
    tLo: lo - pad,
    tHi: hi + pad,
    left,
    plotWidth: Math.max(240, width - left - PLOT_RIGHT),
  };
}

/** Shifted T -> x.  HIGH temperature on the LEFT (the classical grid reads
 *  hot supply left, so hot streams run left->right as they cool). */
export function xOfShifted(tStar: number, axis: GridAxis): number {
  return axis.left + ((axis.tHi - tStar) / (axis.tHi - axis.tLo)) * axis.plotWidth;
}

/** Round tick values (1-2-5 steps) inside the shifted-T domain, ~6 of them,
 *  for the explicit bottom axis. */
export function gridTicks(axis: GridAxis): number[] {
  const range = axis.tHi - axis.tLo;
  const raw = range / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let t = Math.ceil(axis.tLo / step) * step; t <= axis.tHi + 1e-9; t += step) {
    out.push(Number(t.toFixed(6)));
  }
  return out;
}

// ---- Stream segments ---------------------------------------------------------

export interface GridSegment {
  unit: string;
  kind: "hot" | "cold";
  y: number;
  x1: number;          // TRUE supply end (Ts, shifted position)
  x2: number;          // TRUE target end (Tt, shifted position)
  /** DRAWN endpoints: equal to x1/x2 for a real temperature span, widened
   *  symmetrically about the midpoint to MIN_SEG_PX for a near-isothermal
   *  band, direction preserved -- so every stream reads as a full line with
   *  an arrowhead, never an isolated arrow. */
  xd1: number;
  xd2: number;
  Ts: number;          // ACTUAL temperatures for the endpoint labels
  Tt: number;
  Q_kW: number;
}

/** One horizontal segment per lane, endpoints at the SHIFTED temperatures.
 *  A hot stream comes out x1 < x2 (left->right), a cold one x1 > x2. */
export function gridSegments(
  lanes: GridLanes,
  dTmin: number,
  axis: GridAxis,
): GridSegment[] {
  const seg = (l: GridLane): GridSegment => {
    const s = l.stream;
    const d = s.kind === "hot" ? -dTmin / 2 : dTmin / 2;
    const x1 = xOfShifted(s.Ts + d, axis);
    const x2 = xOfShifted(s.Tt + d, axis);
    let xd1 = x1;
    let xd2 = x2;
    if (Math.abs(x2 - x1) < MIN_SEG_PX) {
      const mid = (x1 + x2) / 2;
      const dir = Math.sign(x2 - x1) || (s.kind === "hot" ? 1 : -1);
      xd1 = mid - (dir * MIN_SEG_PX) / 2;
      xd2 = mid + (dir * MIN_SEG_PX) / 2;
    }
    return {
      unit: s.unit, kind: s.kind, y: l.y,
      x1, x2, xd1, xd2,
      Ts: s.Ts, Tt: s.Tt, Q_kW: s.Q_kW,
    };
  };
  return [...lanes.hot.map(seg), ...lanes.cold.map(seg)];
}

// ---- Utility tails -----------------------------------------------------------

export interface UtilitySegment {
  kind: "hotUtility" | "coldUtility";
  y: number;
  x1: number;          // tail
  x2: number;          // head (arrow) -- always points AT the pinch
}

/** The minimum-utility tails as explicit dashed segments: the hot utility
 *  serves the ABOVE-pinch zone (left of the pinch line, arrow ->), the cold
 *  utility the BELOW-pinch zone (right of it, arrow <-).  Without a pinch
 *  they span the whole width.  A zone too narrow to draw (< 12 px) is
 *  skipped (the lane label still announces the duty). */
export function utilitySegments(
  lanes: GridLanes,
  axis: GridAxis,
  pinchX: number | null,
): UtilitySegment[] {
  const right = axis.left + axis.plotWidth;
  const out: UtilitySegment[] = [];
  if (lanes.utilHotY != null) {
    const x1 = axis.left + 2;
    const x2 = (pinchX ?? right) - 4;
    if (x2 - x1 >= 12) out.push({ kind: "hotUtility", y: lanes.utilHotY, x1, x2 });
  }
  if (lanes.utilColdY != null) {
    const x1 = right - 2;
    const x2 = (pinchX ?? axis.left) + 4;
    if (x1 - x2 >= 12) out.push({ kind: "coldUtility", y: lanes.utilColdY, x1, x2 });
  }
  return out;
}

// ---- Match lines -------------------------------------------------------------

export interface GridMatchLine {
  hot: string;
  cold: string;
  capKW: number;
  side: "above" | "below";
  x: number;           // placed inside the pair's feasible shifted-T overlap
  yHot: number;        // hot lane centre
  yCold: number;       // cold lane centre
}

export interface GridMatchLines {
  drawn: GridMatchLine[];        // sorted by x
  /** Matches NOT drawn because an endpoint stream was Pareto-omitted --
   *  the footer announces them alongside the omitted streams. */
  hidden: number;
}

/** Place each candidate match as a vertical line at the midpoint of the
 *  pair's shifted-T overlap (the same band computePinch screened with);
 *  lines that would land on top of each other are nudged apart by
 *  MIN_MATCH_SEP, clamped to their own feasible band -- placement only,
 *  the physics (capKW, side) is carried through untouched. */
export function gridMatchLines(
  matches: HeatMatch[],
  lanes: GridLanes,
  dTmin: number,
  axis: GridAxis,
): GridMatchLines {
  const hotBy = new Map(lanes.hot.map((l) => [l.stream.unit, l]));
  const coldBy = new Map(lanes.cold.map((l) => [l.stream.unit, l]));
  interface Placed extends GridMatchLine { xLo: number; xHi: number; }
  const placed: Placed[] = [];
  let hidden = 0;
  for (const m of matches) {
    const h = hotBy.get(m.hot);
    const c = coldBy.get(m.cold);
    if (!h || !c) { hidden++; continue; }
    const hs = h.stream;
    const cs = c.stream;
    const hLo = Math.min(hs.Ts, hs.Tt) - dTmin / 2;
    const hHi = Math.max(hs.Ts, hs.Tt) - dTmin / 2;
    const cLo = Math.min(cs.Ts, cs.Tt) + dTmin / 2;
    const cHi = Math.max(cs.Ts, cs.Tt) + dTmin / 2;
    const ovLo = Math.max(hLo, cLo);
    const ovHi = Math.min(hHi, cHi);
    if (ovHi <= ovLo) { hidden++; continue; }   // screened out upstream; guard anyway
    const xLo = xOfShifted(ovHi, axis);   // left edge (high T*)
    const xHi = xOfShifted(ovLo, axis);   // right edge
    placed.push({
      hot: m.hot, cold: m.cold, capKW: m.capKW, side: m.side,
      x: (xLo + xHi) / 2, yHot: h.y, yCold: c.y, xLo, xHi,
    });
  }
  // Collision pass: left->right, push a line that crowds its neighbour to the
  // right, but never outside its own feasible band.
  placed.sort((a, b) => a.x - b.x);
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]!;
    const cur = placed[i]!;
    if (cur.x - prev.x < MIN_MATCH_SEP) {
      cur.x = Math.min(prev.x + MIN_MATCH_SEP, cur.xHi);
    }
  }
  placed.sort((a, b) => a.x - b.x);
  return {
    drawn: placed.map(({ xLo: _lo, xHi: _hi, ...rest }) => rest),
    hidden,
  };
}
