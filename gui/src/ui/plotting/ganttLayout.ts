/*---------------------------------------------------------------------------*\
  ganttLayout -- pure geometry for the batch campaign sequence (Gantt) plot.

  Lanes are the run's VESSELS (every unit the KPI table reports, in that
  order, plus any event-only unit appended by first appearance); each fired
  timeline event lands on its acting unit's lane (`from`), and a transfer
  additionally points at its destination lane (`to`).  Kept free of DOM/React
  so the mapping is unit-testable (the panelFold.ts twin).
\*---------------------------------------------------------------------------*/

import type { TimelineEvent } from "../../adapters/SolverAdapter.js";

export interface GanttLane {
  unit: string;
  y: number;          // lane centre, px
}

export interface GanttMark {
  t: number;
  x: number;          // px
  lane: string;       // acting unit (from)
  laneY: number;      // px, centre of the acting lane
  toLane?: string;    // transfer destination
  toY?: number;       // px, centre of the destination lane
  tEnd?: number;      // continuous action: interval end (s)
  xEnd?: number;      // px of tEnd -- present iff tEnd > t (a duration bar)
  kind: "recipe" | "status";
  action: string;
  detail: string;
  trigger: string;
}

export const LANE_HEIGHT = 34;
export const LANE_TOP = 26;      // axis strip above the first lane
export const PLOT_LEFT = 130;    // room for lane labels
export const PLOT_RIGHT = 24;

/** Lane order: KPI vessels first (the run's own order), then any unit that
 *  only appears in events, by first appearance.  Never invents a lane for
 *  an empty `from`. */
export function ganttLanes(
  kpiUnits: string[],
  events: TimelineEvent[],
): string[] {
  const lanes: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    if (u && !seen.has(u)) { seen.add(u); lanes.push(u); }
  };
  for (const u of kpiUnits) push(u);
  for (const e of events) { push(e.from); push(e.to); }
  return lanes;
}

/** Time span of the plot: [0, max(t_end KPI, last event)] with a 2 % pad;
 *  a degenerate span (all events at t = 0) widens to 1 s so marks render. */
export function ganttSpan(tEnd: number | undefined, events: TimelineEvent[]): number {
  let span = tEnd ?? 0;
  for (const e of events) span = Math.max(span, e.t, e.tEnd ?? 0);
  return span > 0 ? span * 1.02 : 1;
}

export function ganttMarks(
  events: TimelineEvent[],
  lanes: string[],
  span: number,
  plotWidth: number,
): GanttMark[] {
  const yOf = new Map<string, number>();
  lanes.forEach((u, i) => yOf.set(u, LANE_TOP + LANE_HEIGHT * (i + 0.5)));
  const xOf = (t: number) => PLOT_LEFT + (t / span) * plotWidth;
  return events
    .filter((e) => yOf.has(e.from))
    .map((e) => ({
      t: e.t,
      x: xOf(e.t),
      lane: e.from,
      laneY: yOf.get(e.from)!,
      ...(e.to && yOf.has(e.to) ? { toLane: e.to, toY: yOf.get(e.to)! } : {}),
      // A CONTINUOUS action (engine tEnd > t) renders as a DURATION BAR on
      // the acting unit's lane, not an instantaneous mark -- the temporal
      // honesty of the sequence (Vitor's batch audit, Codex point 3).
      ...(e.tEnd !== undefined && e.tEnd > e.t
        ? { tEnd: e.tEnd, xEnd: xOf(e.tEnd) } : {}),
      kind: e.kind,
      action: e.action,
      detail: e.detail,
      trigger: e.trigger,
    }));
}
