/*---------------------------------------------------------------------------*\
  PinchGridPlot -- the classical pinch-analysis GRID DIAGRAM, drawn from the
  computed PinchResult (no physics here).  Hot streams run left->right on top,
  cold streams right->left below, each as its FULL line from Ts to Tt with the
  actual temperatures at both ends; the x axis is an EXPLICIT ticked scale of
  SHIFTED temperature T* (the endpoint labels are the secondary, actual-T
  scale -- the header says so; tooltips carry both).  The pinch is a vertical
  dashed line with NAMED hot/cold pinch temperatures and shaded above/below
  zones; the minimum-utility tails are dashed segments in their own thin
  lanes; the screened candidate matches are vertical connections with the
  feasible duty, coloured by pinch side -- and when there are NONE the
  diagram says so and explains what that means for the utility targets.

  The Pareto filter (displayPrefs.pinchParetoPct) omits minor streams from
  the DRAWING only -- announced BY NAME in the footer, with an inline
  "Show all" override for this view (the Display-menu setting stays the
  persistent default); the pinch numbers always count every stream.  Pure
  SVG -- no plotting dependency; the geometry lives in pinchGridLayout.ts
  (unit-tested without DOM).
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PinchResult } from "../../case/pinch.js";
import {
  paretoFilter, gridLanes, gridAxis, gridTicks, gridSegments, gridMatchLines,
  utilitySegments, xOfShifted,
  LANE_HEIGHT, LANE_TOP, GROUP_GAP, PLOT_RIGHT,
  type GridSegment, type GridMatchLine, type UtilitySegment,
} from "./pinchGridLayout.js";

// Same palette as the composite curves (hot/cold) and the match badges
// (orange = above the pinch, cyan = below).
const HOT_COLOUR = "#ff5252";
const COLD_COLOUR = "#4dabf7";
const PINCH_COLOUR = "#c99117";
const SIDE_COLOUR: { above: string; below: string } = {
  above: "#e8590c",
  below: "#0c8599",
};
const ZONE_FILL: { above: string; below: string } = {
  above: "rgba(232,89,12,0.05)",
  below: "rgba(12,133,153,0.05)",
};

export function PinchGridPlot({
  pinch,
  paretoPct,
}: {
  pinch: PinchResult;
  paretoPct: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(860);
  // Inline override of the Pareto threshold for THIS view only -- the
  // Display-menu preference (the persistent default) is untouched.
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 860));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectivePct = showAll ? 0 : paretoPct;
  const filter = useMemo(
    () => paretoFilter(pinch.streams, effectivePct),
    [pinch, effectivePct],
  );
  const lanes = useMemo(
    () => gridLanes(filter.kept, {
      hotUtility: pinch.QhMin > 0.5,
      coldUtility: pinch.QcMin > 0.5,
    }),
    [filter, pinch],
  );
  const axis = useMemo(
    () => gridAxis(filter.kept, pinch.dTmin, pinch.pinchShift, width),
    [filter, pinch, width],
  );
  const segments = useMemo(
    () => gridSegments(lanes, pinch.dTmin, axis),
    [lanes, pinch, axis],
  );
  const matchRes = useMemo(
    () => gridMatchLines(pinch.matches, lanes, pinch.dTmin, axis),
    [pinch, lanes, axis],
  );
  const pinchX =
    pinch.pinchShift == null ? null : xOfShifted(pinch.pinchShift, axis);
  const utils = useMemo(
    () => utilitySegments(lanes, axis, pinchX),
    [lanes, axis, pinchX],
  );
  const ticks = useMemo(() => gridTicks(axis), [axis]);
  const right = axis.left + axis.plotWidth;
  // INTRINSIC width: on a narrow container gridAxis clamps plotWidth to a
  // usable minimum, so the svg must claim the full content width for the
  // wrapper's overflowX:auto to actually scroll instead of clipping.
  const svgWidth = axis.left + axis.plotWidth + PLOT_RIGHT;

  // No-matches diagnosis.  The ONLY nonexistence claim we make is the one the
  // COMPUTATION supports: QhMin == QhNow (zero composite overlap) means no
  // process-process exchange of any kind is possible -- equivalently the
  // hottest hot stream is within ΔTmin of the coldest cold stream.  When the
  // targets DO promise recovery but the list is empty, we say only that the
  // screening (a heuristic: direct shifted-T overlap pairs) found nothing --
  // feasible counter-current pairs may exist that it misses; we never infer
  // that no match exists.
  const recovKW = pinch.QhNow - pinch.QhMin;
  const hotAll = pinch.streams.filter((s) => s.kind === "hot");
  const coldAll = pinch.streams.filter((s) => s.kind === "cold");
  const hotMaxT = hotAll.length ? Math.max(...hotAll.map((s) => Math.max(s.Ts, s.Tt))) : NaN;
  const coldMinT = coldAll.length ? Math.min(...coldAll.map((s) => Math.min(s.Ts, s.Tt))) : NaN;
  const noMatches = pinch.matches.length === 0;
  const noMatchExplanation = noMatches
    ? recovKW <= 0.5
      ? `the hottest hot stream (${hotMaxT.toFixed(0)} K) is colder than the coldest cold ` +
        `stream (${coldMinT.toFixed(0)} K) once ΔTmin is applied — no process-process ` +
        `exchange is possible`
      : `the candidate screening is a HEURISTIC (it only pairs streams whose shifted-T ` +
        `intervals overlap directly) and found none here — yet the targets say ` +
        `${recovKW.toFixed(0)} kW IS recoverable, so feasible counter-current pairings the ` +
        `heuristic misses may exist; read the composite curves for where the overlap sits`
    : null;
  // y of the annotation row: the gap between the hot and cold blocks.
  const gapY = lanes.cold.length
    ? lanes.cold[0]!.y - LANE_HEIGHT / 2 - GROUP_GAP / 2
    : null;

  // The Pareto announcement -- shown whenever anything is omitted (house rule:
  // no silent crutch), NAMING the omitted streams.  Drawing-only; the numbers
  // keep every stream.
  const omittedNames = filter.omitted.map((s) => `${s.unit} (${s.Q_kW.toFixed(0)} kW)`);
  const shownNames = omittedNames.slice(0, 4).join(", ") +
    (omittedNames.length > 4 ? ` +${omittedNames.length - 4} more` : "");

  // NOTE: the all-filtered notice renders INSIDE the ref'd wrapper -- the
  // ResizeObserver must mount on first render even when nothing is drawn,
  // or the width would stay stale after "Show all".
  if (filter.kept.length === 0) {
    return (
      <div ref={ref} style={{ width: "100%" }}>
        <div style={{ padding: "16px 8px", fontSize: 13, opacity: 0.85 }}>
          Nothing to draw — every stream is below the {paretoPct} % cutoff:{" "}
          {shownNames || "no thermal streams."}{" "}
          {filter.omitted.length > 0 && (
            <FooterButton onClick={() => setShowAll(true)}>Show all</FooterButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ fontSize: 12, opacity: 0.7, padding: "2px 8px" }}>
        Grid diagram · ΔT<sub>min</sub> = {pinch.dTmin} K · axis = <em>shifted</em> temperature
        T* (hot −ΔT<sub>min</sub>/2, cold +ΔT<sub>min</sub>/2), high T on the left ·
        endpoint labels = <em>actual</em> stream T
      </div>
      <svg width={svgWidth} height={lanes.height} role="img"
           aria-label="Pinch grid diagram">
        {/* above/below-pinch zones (shaded, labelled) */}
        {pinchX != null && (
          <g>
            <rect x={axis.left} y={LANE_TOP - 4} width={Math.max(0, pinchX - axis.left)}
                  height={Math.max(0, lanes.lanesBottom - LANE_TOP + 4)} fill={ZONE_FILL.above} />
            <rect x={pinchX} y={LANE_TOP - 4} width={Math.max(0, right - pinchX)}
                  height={Math.max(0, lanes.lanesBottom - LANE_TOP + 4)} fill={ZONE_FILL.below} />
            <text x={axis.left + 6} y={13} fontSize={10} fill={SIDE_COLOUR.above}
                  style={{ textTransform: "uppercase", letterSpacing: 1 }}>
              above pinch
            </text>
            <text x={right - 6} y={13} fontSize={10} fill={SIDE_COLOUR.below} textAnchor="end"
                  style={{ textTransform: "uppercase", letterSpacing: 1 }}>
              below pinch
            </text>
          </g>
        )}
        {/* lane zebra */}
        {[...lanes.hot, ...lanes.cold].map((l, i) => (
          <rect key={`band-${l.stream.unit}-${i}`} x={axis.left}
                y={l.y - LANE_HEIGHT / 2} width={axis.plotWidth} height={LANE_HEIGHT}
                fill={i % 2 ? "rgba(127,127,127,0.05)" : "transparent"} />
        ))}
        {/* utility tails (dashed, in their own thin lanes) */}
        {utils.map((u) => (
          <UtilityTail key={u.kind} u={u}
            kW={u.kind === "hotUtility" ? pinch.QhMin : pinch.QcMin} />
        ))}
        {/* stream segments (full Ts -> Tt lines) */}
        {segments.map((s) => (
          <StreamSegment key={s.unit} seg={s} dTmin={pinch.dTmin} left={axis.left} />
        ))}
        {/* candidate matches (circles ON the stream lines, classical style) */}
        {matchRes.drawn.map((m, i) => <MatchLine key={i} m={m} />)}
        {/* explicit match state when there are none (never an empty implication) */}
        {noMatches && gapY != null && (
          <g>
            <text x={axis.left + axis.plotWidth / 2} y={gapY + 3.5} textAnchor="middle"
                  fontSize={11.5} fontStyle="italic" fill="currentColor" opacity={0.8}>
              {recovKW <= 0.5
                ? "No process-process recovery possible — utility targets equal today's duties"
                : "No candidates from the (heuristic) direct-overlap screening — recovery exists, see the composite curves"}
            </text>
            <title>{noMatchExplanation ?? ""}</title>
          </g>
        )}
        {/* the pinch: ONE dashed line, hot/cold temperatures NAMED */}
        {pinchX != null && pinch.pinchHot != null && (
          <g>
            <line x1={pinchX} y1={LANE_TOP - 4} x2={pinchX} y2={lanes.lanesBottom}
                  stroke={PINCH_COLOUR} strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={pinchX - 6} y={27} textAnchor="end" fontSize={11}
                  fill={PINCH_COLOUR}>
              hot pinch {pinch.pinchHot.toFixed(1)} K
            </text>
            <text x={pinchX + 6} y={27} textAnchor="start" fontSize={11}
                  fill={PINCH_COLOUR}>
              cold pinch {pinch.pinchCold!.toFixed(1)} K
            </text>
            <title>{`Pinch: hot streams reach ${pinch.pinchHot.toFixed(2)} K here, cold streams ${pinch.pinchCold!.toFixed(2)} K (ΔTmin = ${pinch.dTmin} K apart; shifted T* = ${pinch.pinchShift!.toFixed(2)} K).\nGolden rule: no match across the pinch — heat above stays above, heat below stays below.`}</title>
          </g>
        )}
        {/* explicit shifted-temperature axis (the PRIMARY scale) */}
        <g>
          <line x1={axis.left} y1={lanes.lanesBottom + 0.5} x2={right}
                y2={lanes.lanesBottom + 0.5} stroke="currentColor" strokeWidth={1}
                opacity={0.6} />
          {ticks.map((t) => {
            const x = xOfShifted(t, axis);
            return (
              <g key={t}>
                <line x1={x} y1={LANE_TOP - 4} x2={x} y2={lanes.lanesBottom}
                      stroke="rgba(127,127,127,0.12)" />
                <line x1={x} y1={lanes.lanesBottom} x2={x} y2={lanes.lanesBottom + 5}
                      stroke="currentColor" opacity={0.6} />
                <text x={x} y={lanes.lanesBottom + 17} textAnchor="middle" fontSize={10}
                      fill="currentColor" opacity={0.8}>{formatTick(t)}</text>
              </g>
            );
          })}
          <text x={axis.left + axis.plotWidth / 2} y={lanes.lanesBottom + 32}
                textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.75}>
            shifted temperature T* (K) — decreases →
          </text>
        </g>
        <defs>
          <marker id="pinchgrid-arrow-hot" viewBox="0 0 10 10" refX={8} refY={5}
                  markerWidth={6} markerHeight={6} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={HOT_COLOUR} />
          </marker>
          <marker id="pinchgrid-arrow-cold" viewBox="0 0 10 10" refX={8} refY={5}
                  markerWidth={6} markerHeight={6} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLD_COLOUR} />
          </marker>
        </defs>
      </svg>
      {/* legend + the Pareto announcement (never silent) */}
      <div style={{ display: "flex", gap: 18, fontSize: 12, opacity: 0.85,
                    padding: "2px 8px 4px", flexWrap: "wrap" }}>
        <span style={{ color: HOT_COLOUR }}>— hot stream (needs cooling, →)</span>
        <span style={{ color: COLD_COLOUR }}>— cold stream (needs heating, ←)</span>
        {matchRes.drawn.length > 0 && (
          <>
            <span style={{ color: SIDE_COLOUR.above }}>●│● match above the pinch</span>
            <span style={{ color: SIDE_COLOUR.below }}>●│● match below the pinch</span>
          </>
        )}
        <span style={{ opacity: 0.7 }}>╌╌→ utility tail · hover any element for the numbers</span>
      </div>
      {noMatchExplanation && (
        <div style={{ fontSize: 12, padding: "0 8px 4px", opacity: 0.8 }}>
          No candidate matches drawn: {noMatchExplanation}.
        </div>
      )}
      {filter.omitted.length > 0 && (
        <div style={{ fontSize: 12, padding: "0 8px 8px", color: PINCH_COLOUR }}
             title={omittedNames.join(", ")}>
          ⚠ omitted from the drawing (each &lt; {paretoPct} % of the {filter.refKW.toFixed(0)} kW
          process heating+cooling duty): {shownNames} — Σ = {filter.omittedKW.toFixed(0)} kW
          {matchRes.hidden > 0 ? `, ${matchRes.hidden} match${matchRes.hidden > 1 ? "es" : ""} hidden with them` : ""}.
          Drawing only — the targets count every stream.{" "}
          <FooterButton onClick={() => setShowAll(true)}>Show all</FooterButton>
          <span style={{ opacity: 0.65 }}> · persistent threshold in the Display menu</span>
        </div>
      )}
      {showAll && paretoPct > 0 && (
        <div style={{ fontSize: 12, padding: "0 8px 8px", color: PINCH_COLOUR }}>
          Showing ALL streams — the {paretoPct} % minor-stream threshold is overridden for
          this view only.{" "}
          <FooterButton onClick={() => setShowAll(false)}>
            Re-apply {paretoPct} % filter
          </FooterButton>
        </div>
      )}
    </div>
  );
}

function FooterButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ font: "inherit", fontSize: 11, padding: "0 7px", cursor: "pointer",
               background: "transparent", color: "inherit",
               border: "1px solid currentColor", borderRadius: 3 }}>
      {children}
    </button>
  );
}

function StreamSegment({ seg, dTmin, left }: {
  seg: GridSegment;
  dTmin: number;
  left: number;
}) {
  const colour = seg.kind === "hot" ? HOT_COLOUR : COLD_COLOUR;
  const marker = `url(#pinchgrid-arrow-${seg.kind})`;
  const iso = Math.abs(seg.Ts - seg.Tt) <= 1.01;   // ISO_BAND duty (phase change)
  const dir = Math.sign(seg.xd2 - seg.xd1) || 1;   // drawing direction
  const cp = iso ? null : seg.Q_kW / Math.abs(seg.Ts - seg.Tt);
  const d = seg.kind === "hot" ? -dTmin / 2 : dTmin / 2;
  return (
    <g>
      {/* lane label: unit + duty (the responsive left column) */}
      <text x={left - 8} y={seg.y - 2} textAnchor="end" fontSize={12}
            fill="currentColor">{seg.unit}</text>
      <text x={left - 8} y={seg.y + 11} textAnchor="end" fontSize={10}
            fill="currentColor" opacity={0.65}>{seg.Q_kW.toFixed(0)} kW</text>
      {/* the FULL stream line: supply dot -> target arrowhead */}
      <line x1={seg.xd1} y1={seg.y} x2={seg.xd2} y2={seg.y}
            stroke={colour} strokeWidth={2.5} markerEnd={marker} />
      <circle cx={seg.xd1} cy={seg.y} r={3} fill={colour} />
      {/* BOTH actual temperatures flanking the ends (the secondary scale) */}
      <text x={seg.xd1 - dir * 6} y={seg.y + 3.5}
            textAnchor={dir > 0 ? "end" : "start"} fontSize={10}
            fill="currentColor" opacity={0.8}>{seg.Ts.toFixed(0)}</text>
      <text x={seg.xd2 + dir * 10} y={seg.y + 3.5}
            textAnchor={dir > 0 ? "start" : "end"} fontSize={10}
            fill="currentColor" opacity={0.8}>{seg.Tt.toFixed(0)} K</text>
      <title>{`${seg.unit} — ${seg.kind === "hot" ? "hot stream (needs cooling)" : "cold stream (needs heating)"}\nactual  Ts = ${seg.Ts.toFixed(2)} K → Tt = ${seg.Tt.toFixed(2)} K\nshifted  T* = ${(seg.Ts + d).toFixed(2)} → ${(seg.Tt + d).toFixed(2)} K (position on the axis)\nQ = ${seg.Q_kW.toFixed(1)} kW${cp != null ? ` · CP ≈ ${cp.toFixed(2)} kW/K` : " · ≈ isothermal duty (phase change / reboil / condense)"}`}</title>
    </g>
  );
}

function UtilityTail({ u, kW }: { u: UtilitySegment; kW: number }) {
  const hot = u.kind === "hotUtility";
  const colour = hot ? HOT_COLOUR : COLD_COLOUR;
  return (
    <g>
      <line x1={u.x1} y1={u.y} x2={u.x2} y2={u.y}
            stroke={colour} strokeWidth={2} strokeDasharray="6 4"
            markerEnd={`url(#pinchgrid-arrow-${hot ? "hot" : "cold"})`} opacity={0.85} />
      <text x={(u.x1 + u.x2) / 2} y={u.y - 7} textAnchor="middle" fontSize={10}
            fill={colour}>
        {hot ? "hot utility" : "cold utility"} — min {kW.toFixed(0)} kW
      </text>
      <title>{hot
        ? `Hot utility: at least ${kW.toFixed(1)} kW of external heating, ALL of it above the pinch (left of the pinch line).`
        : `Cold utility: at least ${kW.toFixed(1)} kW of external cooling, ALL of it below the pinch (right of the pinch line).`}</title>
    </g>
  );
}

function MatchLine({ m }: { m: GridMatchLine }) {
  const colour = SIDE_COLOUR[m.side];
  const yMid = (m.yHot + m.yCold) / 2;
  return (
    <g>
      <line x1={m.x} y1={m.yHot} x2={m.x} y2={m.yCold}
            stroke={colour} strokeWidth={2} />
      <circle cx={m.x} cy={m.yHot} r={4.5} fill={colour} />
      <circle cx={m.x} cy={m.yCold} r={4.5} fill={colour} />
      <text x={m.x + 6} y={yMid + 3} textAnchor="start" fontSize={10}
            fill={colour}>≤{m.capKW.toFixed(0)} kW</text>
      <title>{`${m.hot} (hot) → ${m.cold} (cold)\nfeasible duty ≤ ${m.capKW.toFixed(1)} kW — ${m.side} the pinch\nHeuristic screening: bound = min of the two stream duties (NOT a per-side capacity); side classified by the overlap midpoint.  The network design sizes the real exchanger.`}</title>
    </g>
  );
}

function formatTick(t: number): string {
  return Math.abs(t - Math.round(t)) < 1e-6 ? String(Math.round(t)) : t.toFixed(1);
}
