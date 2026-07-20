/*---------------------------------------------------------------------------*\
  GanttPlot -- the batch CAMPAIGN SEQUENCE, drawn from the result's timeline
  (every recipe action that fired, with its trigger, plus unit status
  events).  One lane per vessel; a transfer is an arrow from source to
  destination lane; hover any mark for the engine's own detail line and the
  trigger that fired it.  Pure SVG -- no plotting dependency; the geometry
  lives in ganttLayout.ts (unit-tested without DOM).
\*---------------------------------------------------------------------------*/

import { useMemo, useRef, useState, useEffect } from "react";
import type { TimelineEvent } from "../../adapters/SolverAdapter.js";
import {
  ganttLanes, ganttSpan, ganttMarks,
  LANE_HEIGHT, LANE_TOP, PLOT_LEFT, PLOT_RIGHT,
} from "./ganttLayout.js";

const COLOURS: { [action: string]: string } = {
  transfer: "#2f7fd0",
  setParameter: "#c99117",
};
const STATUS_COLOUR = "#c0392b";

export function GanttPlot({
  timeline,
  kpis,
}: {
  timeline: TimelineEvent[];
  kpis?: { [unit: string]: { [k: string]: number } };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kpiUnits = useMemo(() => Object.keys(kpis ?? {}), [kpis]);
  const tEnd = useMemo(() => {
    for (const u of kpiUnits) {
      const v = kpis?.[u]?.["t_end"];
      if (typeof v === "number") return v;
    }
    return undefined;
  }, [kpis, kpiUnits]);

  const lanes = useMemo(() => ganttLanes(kpiUnits, timeline), [kpiUnits, timeline]);
  const span = useMemo(() => ganttSpan(tEnd, timeline), [tEnd, timeline]);
  const plotWidth = Math.max(200, width - PLOT_LEFT - PLOT_RIGHT);
  const marks = useMemo(
    () => ganttMarks(timeline, lanes, span, plotWidth),
    [timeline, lanes, span, plotWidth],
  );
  const height = LANE_TOP + lanes.length * LANE_HEIGHT + 34;

  // Time axis: 5 round ticks.
  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n + 1 }, (_, i) => (span * i) / n);
  }, [span]);

  return (
    <div ref={ref} style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height} role="img"
           aria-label="Batch campaign sequence">
        {/* lanes */}
        {lanes.map((u, i) => {
          const y = LANE_TOP + LANE_HEIGHT * i;
          return (
            <g key={u}>
              <rect x={PLOT_LEFT} y={y} width={plotWidth} height={LANE_HEIGHT}
                    fill={i % 2 ? "rgba(127,127,127,0.05)" : "transparent"} />
              <line x1={PLOT_LEFT} y1={y + LANE_HEIGHT / 2}
                    x2={PLOT_LEFT + plotWidth} y2={y + LANE_HEIGHT / 2}
                    stroke="rgba(127,127,127,0.35)" strokeWidth={1.5} />
              <text x={PLOT_LEFT - 8} y={y + LANE_HEIGHT / 2 + 4}
                    textAnchor="end" fontSize={12} fill="currentColor">{u}</text>
            </g>
          );
        })}
        {/* time axis */}
        {ticks.map((t) => {
          const x = PLOT_LEFT + (t / span) * plotWidth;
          return (
            <g key={t}>
              <line x1={x} y1={LANE_TOP - 4}
                    x2={x} y2={LANE_TOP + lanes.length * LANE_HEIGHT}
                    stroke="rgba(127,127,127,0.15)" />
              <text x={x} y={LANE_TOP - 8} textAnchor="middle" fontSize={11}
                    fill="currentColor">{formatT(t)}</text>
            </g>
          );
        })}
        <text x={PLOT_LEFT + plotWidth / 2}
              y={LANE_TOP + lanes.length * LANE_HEIGHT + 26}
              textAnchor="middle" fontSize={11} fill="currentColor">t [s]</text>
        {/* marks (after lanes so they sit on top) */}
        {marks.map((m, i) => {
          const colour = m.kind === "status"
            ? STATUS_COLOUR : (COLOURS[m.action] ?? "#666");
          return (
            <g key={i}>
              {m.toY !== undefined && (
                <g>
                  <line x1={m.x} y1={m.laneY} x2={m.x} y2={m.toY}
                        stroke={colour} strokeWidth={2}
                        markerEnd={`url(#gantt-arrow-${m.kind})`} />
                </g>
              )}
              {m.xEnd !== undefined ? (
                // CONTINUOUS action: a DURATION BAR over [t, tEnd] on the
                // acting lane (temporal honesty -- an 800 s distillation is
                // not an instant), with end caps.
                <g>
                  <rect x={m.x} y={m.laneY - 5} width={m.xEnd - m.x} height={10}
                        rx={3} fill={colour} fillOpacity={0.45}
                        stroke={colour} strokeWidth={1.2} />
                  <line x1={m.x} y1={m.laneY - 7} x2={m.x} y2={m.laneY + 7}
                        stroke={colour} strokeWidth={2} />
                  <line x1={m.xEnd} y1={m.laneY - 7} x2={m.xEnd} y2={m.laneY + 7}
                        stroke={colour} strokeWidth={2} />
                </g>
              ) : m.kind === "status" ? (
                // status: a warning triangle
                <polygon
                  points={`${m.x},${m.laneY - 7} ${m.x - 6},${m.laneY + 5} ${m.x + 6},${m.laneY + 5}`}
                  fill={colour} />
              ) : (
                // recipe: a diamond
                <polygon
                  points={`${m.x},${m.laneY - 6} ${m.x + 6},${m.laneY} ${m.x},${m.laneY + 6} ${m.x - 6},${m.laneY}`}
                  fill={colour} />
              )}
              <title>{m.xEnd !== undefined
                ? `[${formatT(m.t)}, ${formatT(m.tEnd!)}] s -- ${m.detail}${m.trigger ? `\ntrigger: ${m.trigger}` : ""}`
                : `t = ${formatT(m.t)} s -- ${m.detail}${m.trigger ? `\ntrigger: ${m.trigger}` : ""}`}</title>
            </g>
          );
        })}
        <defs>
          <marker id="gantt-arrow-recipe" viewBox="0 0 10 10" refX={8} refY={5}
                  markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f7fd0" />
          </marker>
          <marker id="gantt-arrow-status" viewBox="0 0 10 10" refX={8} refY={5}
                  markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#c0392b" />
          </marker>
        </defs>
      </svg>
      {/* legend */}
      <div style={{ display: "flex", gap: 18, fontSize: 12, opacity: 0.85,
                    padding: "2px 8px 8px" }}>
        <span><svg width={12} height={12}><polygon points="6,0 12,6 6,12 0,6" fill={COLOURS.transfer} /></svg> transfer (arrow → destination)</span>
        <span><svg width={12} height={12}><polygon points="6,0 12,6 6,12 0,6" fill={COLOURS.setParameter} /></svg> setParameter</span>
        <span><svg width={12} height={12}><polygon points="6,1 0,11 12,11" fill={STATUS_COLOUR} /></svg> unit status event</span>
        <span><svg width={16} height={12}><rect x={1} y={3} width={14} height={6} rx={2} fill={COLOURS.transfer} fillOpacity={0.45} stroke={COLOURS.transfer} /></svg> continuous action (bar spans its interval)</span>
        <span style={{ opacity: 0.7 }}>hover a mark for the engine's detail + trigger</span>
      </div>
    </div>
  );
}

function formatT(t: number): string {
  if (t >= 100) return String(Math.round(t));
  return String(Math.round(t * 100) / 100);
}
