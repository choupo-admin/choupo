/*---------------------------------------------------------------------------*\
  GanttPlot -- the batch CAMPAIGN SEQUENCE, drawn from the result's timeline
  (every recipe action that fired, with its trigger, plus unit status
  events).  One lane per vessel; a transfer is an arrow from source to
  destination lane; hover any mark for what the LEDGER says moved and what it
  carried.  Pure SVG -- no plotting dependency; the geometry lives in
  ganttLayout.ts and the ledger semantics in case/campaignLedger.ts (both
  unit-tested without DOM).

  THE LANE HAS TWO BANDS (2026-09-20).  Above, the MATERIAL band this plot
  always drew, its geometry untouched.  Below -- only where the vessel has
  energy records -- the ENERGY band: the `energyLedger` segments on the same
  time axis, coloured by `kind`, height proportional to |E| against a scale
  the legend PRINTS, sign drawn as DIRECTION (up = heat added to the vessel).

  AND AN UNPRICEABLE RECORD IS HATCHED AT FULL HEIGHT, with no direction.
  That is the load-bearing rule of the whole drawing: the engine emits `E_kJ`
  only when it could price the segment, so an absent number means UNKNOWN --
  and a zero-height bar sitting on the baseline is exactly what ZERO looks
  like.  The corpus contains both states, which is why they must not share a
  picture.

  ONE LIMITATION, FOUND BY LOOKING AT THE DRAWING AND NAMED RATHER THAN
  HALF-FIXED.  Two records that are refused over the SAME interval on the
  SAME lane draw the same full-height rectangle, so the second paints over
  the first and only its outline colour survives -- `still06`'s potA is
  exactly that (a reboiler and a condenser, both unpriceable over [0, 200]).
  A reader sees one refused block where there are two, and the `<title>`
  reaches only the topmost.  Nothing is fabricated by it and nothing is
  hidden: the legend's "ledger tables" pop-out lists every record with its
  own reason, which is where a reader counts them.  It is NOT fixed here
  because every fix costs the claim the form exists to make -- nesting or
  splitting the rectangles gives a refusal a height, and a height is a
  magnitude.
\*---------------------------------------------------------------------------*/

import { useMemo, useRef, useState, useEffect } from "react";
import type {
  EnergyRecord, TimelineEvent, TransferRecord,
} from "../../adapters/SolverAdapter.js";
import {
  ganttLanes, ganttSpan, ganttMarks, ganttGeometry, ganttEnergyTiles,
  energyKindColour,
  LANE_TOP, PLOT_LEFT, PLOT_RIGHT,
} from "./ganttLayout.js";
import {
  campaignLedgerView, energyHover, transferHover, matchTransferRows,
  energyScaleSentence,
} from "../../case/campaignLedger.js";
import { popOutCampaignLedger } from "../campaignLedgerPopOut.js";

const COLOURS: { [action: string]: string } = {
  transfer: "#2f7fd0",
  setParameter: "#c99117",
  dischargeTo: "#20c997",       // teal -- matches the dashed recipe edges
  externalOutlet: "#20c997",
};
const STATUS_COLOUR = "#c0392b";

export function GanttPlot({
  timeline,
  kpis,
  transfers,
  energyLedger,
}: {
  timeline: TimelineEvent[];
  kpis?: { [unit: string]: { [k: string]: number } };
  /** The MATERIAL ledger the timeline is a projection of.  Read for the
   *  hover, because the projection collapses `dn` to a total and drops the
   *  transported `H_kJ` -- a student watching the sequence could not see
   *  what moved or what it carried. */
  transfers?: TransferRecord[];
  /** The ENERGY ledger -- the second band. */
  energyLedger?: EnergyRecord[];
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
  //  ONE HOME for both ledgers' semantics -- validity, grouping, scale and
  //  every sentence this plot prints (case/campaignLedger.ts).  Nothing is
  //  re-derived here: no sum, no default, no fallback number.
  const ledger = useMemo(
    () => campaignLedgerView(transfers, energyLedger),
    [transfers, energyLedger],
  );
  const geom = useMemo(
    () => ganttGeometry(lanes, ledger.energyByUnit),
    [lanes, ledger],
  );
  const marks = useMemo(
    () => ganttMarks(timeline, lanes, span, plotWidth, geom.laneCentres),
    [timeline, lanes, span, plotWidth, geom],
  );
  const height = geom.contentBottom + 34;

  // Time axis: 5 round ticks.
  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n + 1 }, (_, i) => (span * i) / n);
  }, [span]);

  return (
    <div ref={ref} style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height} role="img"
           aria-label="Batch campaign sequence">
        {/* lanes: the MATERIAL band, plus an ENERGY band only where the
            vessel has energy records.  A lane with none gets no band AND no
            height -- an empty band would read as "no heat", which is a
            different claim from "this vessel ledgers no segment". */}
        {geom.boxes.map((box, i) => (
          <g key={box.unit}>
            <rect x={PLOT_LEFT} y={box.top} width={plotWidth}
                  height={box.bottom - box.top}
                  fill={i % 2 ? "rgba(127,127,127,0.05)" : "transparent"} />
            <line x1={PLOT_LEFT} y1={box.centreY}
                  x2={PLOT_LEFT + plotWidth} y2={box.centreY}
                  stroke="rgba(127,127,127,0.35)" strokeWidth={1.5} />
            <text x={PLOT_LEFT - 8} y={box.centreY + 4}
                  textAnchor="end" fontSize={12} fill="currentColor">
              {box.unit}
            </text>
            {box.energyBaselineY !== undefined && (
              <g>
                <line x1={PLOT_LEFT} y1={box.energyBaselineY}
                      x2={PLOT_LEFT + plotWidth} y2={box.energyBaselineY}
                      stroke="rgba(127,127,127,0.5)" strokeWidth={1}
                      strokeDasharray="2 3" />
                <text x={PLOT_LEFT - 8} y={box.energyBaselineY + 3}
                      textAnchor="end" fontSize={9} fill="currentColor"
                      opacity={0.6}>energy</text>
              </g>
            )}
          </g>
        ))}
        {/* energy tiles, per lane */}
        {geom.boxes.map((box) => {
          const rows = ledger.energyByUnit.get(box.unit);
          if (!rows) return null;
          const tiles = ganttEnergyTiles(rows, box, ledger.scale, span,
                                         plotWidth);
          return (
            <g key={`e-${box.unit}`}>
              {tiles.map((tile, j) => {
                const colour = energyKindColour(tile.row.kind);
                const title = <title>{energyHover(tile.row)}</title>;
                if (tile.form === "refused") {
                  //  UNKNOWN IS NOT ZERO.  Full band height, hatched, no
                  //  direction -- a zero-height bar on the baseline is
                  //  exactly what zero looks like, and the engine refused
                  //  to say which side of it this segment is on.
                  return (
                    <g key={j}>
                      <rect x={tile.x} y={tile.y} width={tile.width}
                            height={tile.height}
                            fill="url(#gantt-energy-hatch)"
                            stroke={colour} strokeWidth={1}
                            strokeDasharray="3 2" />
                      {title}
                    </g>
                  );
                }
                if (tile.form === "zero") {
                  //  A PRICED EXACT ZERO: a tick on the baseline.  It is NOT
                  //  given the minimum height a tiny non-zero record gets --
                  //  that would make a measured zero look like a small duty.
                  return (
                    <g key={j}>
                      <line x1={tile.x} y1={tile.y}
                            x2={tile.x + tile.width} y2={tile.y}
                            stroke={colour} strokeWidth={2.5} />
                      {title}
                    </g>
                  );
                }
                return (
                  <g key={j}>
                    <rect x={tile.x} y={tile.y} width={tile.width}
                          height={tile.height} fill={colour}
                          fillOpacity={0.55} stroke={colour}
                          strokeWidth={1}
                          strokeDasharray={tile.row.instantaneous
                            ? "2 2" : undefined} />
                    {title}
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* time axis */}
        {ticks.map((t) => {
          const x = PLOT_LEFT + (t / span) * plotWidth;
          return (
            <g key={t}>
              <line x1={x} y1={LANE_TOP - 4}
                    x2={x} y2={geom.contentBottom}
                    stroke="rgba(127,127,127,0.15)" />
              <text x={x} y={LANE_TOP - 8} textAnchor="middle" fontSize={11}
                    fill="currentColor">{formatT(t)}</text>
            </g>
          );
        })}
        <text x={PLOT_LEFT + plotWidth / 2}
              y={geom.contentBottom + 26}
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
                // not an instant), with end caps.  The DESTINATION lane
                // mirrors a lighter bar over the same interval: the receiver
                // fills THROUGHOUT, never in one end-of-run dump (Vitor read
                // the lone arrow as exactly that).
                <g>
                  <rect x={m.x} y={m.laneY - 5} width={m.xEnd - m.x} height={10}
                        rx={3} fill={colour} fillOpacity={0.45}
                        stroke={colour} strokeWidth={1.2} />
                  <line x1={m.x} y1={m.laneY - 7} x2={m.x} y2={m.laneY + 7}
                        stroke={colour} strokeWidth={2} />
                  <line x1={m.xEnd} y1={m.laneY - 7} x2={m.xEnd} y2={m.laneY + 7}
                        stroke={colour} strokeWidth={2} />
                  {m.toY !== undefined && (
                    <rect x={m.x} y={m.toY - 4} width={m.xEnd - m.x} height={8}
                          rx={3} fill={colour} fillOpacity={0.18}
                          stroke={colour} strokeWidth={1}
                          strokeDasharray="4 3" />
                  )}
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
              {/*  THE HOVER READS THE LEDGER, not only the timeline's
                   pre-formatted `detail`.  That string is the projection
                   this slice exists to undo: choupoBatch builds it by
                   SUMMING the record's per-component `dn` and never carries
                   the `H_kJ` the same record publishes, so "TRANSFER 0.0005
                   kmol hot -> cold" is all a student could see of an edge
                   that moved 0.0005 kmol of ethanol carrying -136.6 kJ.
                   Where no ledger record matches (a setParameter, a status
                   event, or a run with no material ledger at all) the hover
                   is exactly what it was. */}
              <title>{[
                m.xEnd !== undefined
                  ? `[${formatT(m.t)}, ${formatT(m.tEnd!)}] s -- ${m.detail}`
                  : `t = ${formatT(m.t)} s -- ${m.detail}`,
                ...(m.trigger ? [`trigger: ${m.trigger}`] : []),
                ...matchTransferRows(ledger.transfers, m)
                     .map((r) => `\n${transferHover(r)}`),
              ].join("\n")}</title>
            </g>
          );
        })}
        <defs>
          {/*  The UNPRICEABLE fill.  Deliberately a PATTERN and not a
               colour: a reader scanning the band sees a texture that is not
               a magnitude at all, where any solid fill -- however pale --
               would still be a height to compare. */}
          <pattern id="gantt-energy-hatch" width={6} height={6}
                   patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill="rgba(127,127,127,0.10)" />
            <line x1={0} y1={0} x2={0} y2={6}
                  stroke="currentColor" strokeWidth={1.4} opacity={0.55} />
          </pattern>
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
        <span style={{ opacity: 0.7 }}>hover a mark for what moved, what it carried, and the trigger</span>
      </div>
      {/*  THE ENERGY LEGEND, and above all THE SCALE.
           A height encoding whose reference is not printed is the 2026-09-08
           "the numerical FLOOR is not a scale" defect one drawing along: the
           bars would be comparable within the plot and meaningless off it.
           So the reference is stated, in kJ, from this run's own ledger.
           Where there is NO scale -- every record refused, or every priced
           record exactly zero, both of which the corpus contains -- the
           legend says WHICH, and no bar claims a magnitude. */}
      {ledger.energy.length > 0 ? (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap",
                      fontSize: 12, opacity: 0.85, padding: "0 8px 8px",
                      alignItems: "center" }}>
          <strong style={{ fontWeight: 600, opacity: 0.8 }}>energy band:</strong>
          {ledger.energyKinds.map((k) => (
            <span key={k}>
              <svg width={12} height={12}>
                <rect x={1} y={1} width={10} height={10} rx={2}
                      fill={energyKindColour(k)} fillOpacity={0.55}
                      stroke={energyKindColour(k)} />
              </svg>{" "}{k}
            </span>
          ))}
          <span style={{ opacity: 0.85 }}>
            {energyScaleSentence(ledger.scale, true)}
          </span>
          <span style={{ opacity: 0.85 }}>up = heat added to the vessel, down = removed</span>
          <span>
            <svg width={16} height={12}>
              <rect x={1} y={1} width={14} height={10}
                    fill="url(#gantt-energy-hatch-legend)"
                    stroke="currentColor" strokeWidth={1}
                    strokeDasharray="3 2" />
              <defs>
                <pattern id="gantt-energy-hatch-legend" width={6} height={6}
                         patternUnits="userSpaceOnUse"
                         patternTransform="rotate(45)">
                  <rect width={6} height={6} fill="rgba(127,127,127,0.10)" />
                  <line x1={0} y1={0} x2={0} y2={6} stroke="currentColor"
                        strokeWidth={1.4} opacity={0.55} />
                </pattern>
              </defs>
            </svg>{" "}UNPRICEABLE (the engine refused — not zero)
          </span>
          <button type="button" onClick={() => {
            popOutCampaignLedger(transfers, energyLedger);
          }} style={{ font: "inherit", cursor: "pointer", padding: "1px 8px",
                      borderRadius: 3, border: "1px solid currentColor",
                      background: "transparent", color: "inherit",
                      opacity: 0.85 }}>
            ledger tables ↗
          </button>
        </div>
      ) : (
        //  AN ABSENT LEDGER IS SAID, NEVER DRAWN AS AN EMPTY BAND.  A batch
        //  run whose units ledger no energy segment is not a run with no
        //  heat, and an empty band would claim exactly that.
        <div style={{ fontSize: 12, opacity: 0.7, padding: "0 8px 8px",
                      display: "flex", gap: 14, alignItems: "center" }}>
          <span>this run published no energy ledger — no segment was
                ledgered, which is not the same as no heat</span>
          {(transfers?.length ?? 0) > 0 && (
            <button type="button" onClick={() => {
              popOutCampaignLedger(transfers, energyLedger);
            }} style={{ font: "inherit", cursor: "pointer", padding: "1px 8px",
                        borderRadius: 3, border: "1px solid currentColor",
                        background: "transparent", color: "inherit" }}>
              ledger tables ↗
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatT(t: number): string {
  if (t >= 100) return String(Math.round(t));
  return String(Math.round(t * 100) / 100);
}
