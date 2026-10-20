/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  batchGantt -- THE GEOMETRY of the batch plan's Gantt chart (DEV.md 4c C99,
  C110 G5).  Pure: the published `batchPlan` block in, rows and bars in
  pixels out; ui/BatchPlanSection.tsx only draws what this returns.

  THE ENGINE DECIDES, THE GUI DRAWS.  Every bar is one published Gantt row,
  at its published start and end, in the lane of its published out-of-phase
  unit; every stage row is one published stage, in its train's published
  order; the limiting stage, T_L, the occupancy and the campaign span are the
  published words and numbers.  Nothing here schedules, sums or infers a
  time -- the only arithmetic is the hours-to-pixels scale and the axis
  ticks.  A bar spans the stage's WHOLE cycle as published (charge + process
  + discharge + clean); where in it each part falls is not published as
  positioned data, so it is not drawn -- the four durations are columns of
  the stage table instead.

  EACH TRAIN ON ITS OWN TIME AXIS.  The trains are decoupled by intermediate
  stores and run their own campaigns (CLAUDE.md §6, the batch-plan
  paragraph); apalutamide01's spray-drying campaign spans 420 h and its
  solid-dose one 101 h, so one shared axis would squash the second into a
  quarter of the width.

  DRAWN DEFENSIVELY.  A Gantt row is a LOT when it names a published stage
  and a lot >= 1 (or the engine says `kind lot|operation`); anything else is
  a SEGMENT of its own kind -- the engine's own `kind` word when it publishes
  one, else the stage word it wrote (today `changeover`).  A segment is never
  dropped: one on a published stage is drawn on that stage's row, one that
  names no stage gets a row of its own in its train labelled by its word, and
  every kind present -- known or not -- gets a distinct look and a legend
  entry.  A multiproduct plan's cleaning or changeover bars therefore reach
  the reader the day the engine writes them, before any GUI change.
\*---------------------------------------------------------------------------*/

import type { BatchGanttRow, BatchPlan, BatchStage, BatchTrain }
  from "../adapters/batchPlanPayload.js";

/** The kind every ordinary lot bar has. */
export const LOT_KIND = "lot";
/** Words an engine `kind` may use for an ordinary lot bar. */
const LOT_WORDS = new Set(["lot", "operation"]);

/** The kind a published Gantt row is drawn as. */
export function segmentKind(g: BatchGanttRow, stageNames: ReadonlySet<string>): string {
  if (g.kind) return LOT_WORDS.has(g.kind) ? LOT_KIND : g.kind;
  if (stageNames.has(g.stage) && g.lot >= 1) return LOT_KIND;
  return g.stage || "segment";
}

/** Layout constants, in SVG pixels.  Exported so tests and the drawing
 *  share one home. */
export const GANTT = {
  labelW: 210,
  plotW: 760,
  occW: 130,
  marginL: 12,
  marginR: 12,
  titleH: 52,
  /** The band above a train's rows: its axis labels and the T_L dimension. */
  axisH: 30,
  trainH: 22,
  trainGap: 18,
  laneH: 16,
  rowPad: 4,
  /** A row carries two text lines in the label column. */
  minRowH: 30,
  legendLineH: 16,
} as const;

export interface GanttRowGeom {
  key: string;
  train: string;
  /** The published stage this row draws; null for a segment row. */
  stage: BatchStage | null;
  /** The label: the stage's name, or a segment row's kind word. */
  label: string;
  lanes: number;
  y: number;
  h: number;
  limiting: boolean;
}

export interface GanttBarGeom {
  /** The published Gantt row this bar draws, unchanged. */
  src: BatchGanttRow;
  kind: string;
  /** The type of the stage a lot bar belongs to ("" for a segment row). */
  stageType: string;
  rowKey: string;
  lane: number;
  x: number;
  w: number;
  y: number;
  h: number;
  /** The short text inside the bar, when it fits ("" otherwise). */
  label: string;
  /** A SEGMENT's word when it does not fit inside: drawn just after the
   *  bar, so a segment is never an unlabelled sliver ("" otherwise). */
  labelOutside: string;
  limiting: boolean;
}

export interface GanttTrainGeom {
  train: BatchTrain | null;
  name: string;
  /** The train's header band. */
  y: number;
  /** The train's own time axis: its baseline y, its end [h], its ticks [h]
   *  and its scale [px/h]. */
  axisY: number;
  tMax: number;
  ticks: number[];
  scale: number;
  rows: GanttRowGeom[];
  /** T_L as a dimension on the limiting stage: from its lot-1 bar's start to
   *  its lot-2 bar's start, both published.  Null when there is no lot 2. */
  cycleDim: { x0: number; x1: number; y: number } | null;
}

export interface GanttFigure {
  width: number;
  height: number;
  plotX: number;
  trains: GanttTrainGeom[];
  bars: GanttBarGeom[];
  /** Every kind present, lots first, then segments in order of appearance. */
  kinds: string[];
  /** The stage types present on lot bars (`batch`, `semicontinuous`, ...),
   *  in order of appearance: a lot is coloured by its stage's type. */
  stageTypes: string[];
  legendY: number;
}

/** Tick hours for an axis 0..tMax: four to ten intervals at a 1/2/5 step, the last
 *  tick at or past tMax. */
export function axisTicks(tMax: number): number[] {
  if (!(tMax > 0)) return [0];
  const raw = tMax / 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [0];
  while ((out.at(-1) ?? 0) < tMax - 1e-9 * step)
    out.push(Number((out.length * step).toPrecision(12)));
  return out;
}

const stageOrder = (plan: BatchPlan, t: string): BatchStage[] => {
  const byName = new Map(plan.stages.map((s) => [s.name, s]));
  const tr = plan.trains.find((x) => x.name === t);
  const listed = (tr?.stages ?? []).map((n) => byName.get(n))
    .filter((s): s is BatchStage => !!s);
  const rest = plan.stages.filter((s) => s.train === t && !listed.includes(s));
  return [...listed, ...rest];
};

/** The whole figure.  Null when the plan publishes no stage. */
export function ganttFigure(plan: BatchPlan | undefined): GanttFigure | null {
  if (!plan || plan.stages.length === 0) return null;
  const G = GANTT;
  const stageNames = new Set(plan.stages.map((s) => s.name));
  const stageByName = new Map(plan.stages.map((s) => [s.name, s]));

  //  The trains, published order first; a train only a stage or a bar names
  //  is still drawn, after them.
  const trainNames: string[] = plan.trains.map((t) => t.name);
  for (const s of plan.stages) if (!trainNames.includes(s.train)) trainNames.push(s.train);
  for (const g of plan.gantt) {
    const t = stageByName.get(g.stage)?.train ?? g.train;
    if (!trainNames.includes(t)) trainNames.push(t);
  }

  //  Which row each bar goes on: its stage's row, else a segment row of its
  //  train keyed by its kind.
  const kinds: string[] = [];
  const stageTypes: string[] = [];
  const placed = plan.gantt.map((g) => {
    const kind = segmentKind(g, stageNames);
    if (!kinds.includes(kind)) kinds.push(kind);
    const st = stageByName.get(g.stage);
    if (kind === LOT_KIND && st && !stageTypes.includes(st.type)) stageTypes.push(st.type);
    const train = st?.train ?? g.train;
    const rowKey = st ? `stage:${st.name}` : `segment:${train}:${kind}`;
    return { g, kind, train, rowKey, label: st ? st.name : kind, stageType: st?.type ?? "" };
  });
  kinds.sort((a, b) => (a === LOT_KIND ? -1 : b === LOT_KIND ? 1 : 0));

  const plotX = G.marginL + G.labelW;
  const trains: GanttTrainGeom[] = [];
  const bars: GanttBarGeom[] = [];
  let y: number = G.titleH;
  for (const name of trainNames) {
    const train = plan.trains.find((t) => t.name === name) ?? null;
    const mineAll = placed.filter((p) => p.train === name);
    const tMax = Math.max(
      0, ...mineAll.map((p) => p.g.end),
      train && Number.isFinite(train.campaignDuration) ? train.campaignDuration : 0);
    const ticks = axisTicks(tMax);
    const last = ticks.at(-1) ?? 0;
    const axisEnd = last > 0 ? last : 1;
    const scale = G.plotW / axisEnd;
    const xOf = (h: number) => plotX + h * scale;

    const ty = y;
    const axisY = ty + G.trainH + G.axisH;
    y = axisY;
    const rowDefs: { key: string; stage: BatchStage | null; label: string }[] =
      stageOrder(plan, name).map((s) => ({ key: `stage:${s.name}`, stage: s, label: s.name }));
    for (const p of mineAll)
      if (!rowDefs.some((r) => r.key === p.rowKey))
        rowDefs.push({ key: p.rowKey, stage: null, label: p.label });
    const rows: GanttRowGeom[] = [];
    for (const r of rowDefs) {
      const mine = placed.filter((p) => p.rowKey === r.key);
      const lanes = Math.max(1, ...mine.map((p) => p.g.unit));
      const h = Math.max(lanes * G.laneH + 2 * G.rowPad, G.minRowH);
      const limiting = !!r.stage && (r.stage.limiting || train?.limitingStage === r.stage.name);
      rows.push({ key: r.key, train: name, stage: r.stage, label: r.label,
                  lanes, y, h, limiting });
      const top = y + (h - lanes * G.laneH) / 2;
      for (const p of mine) {
        const lane = Math.max(1, p.g.unit) - 1;
        const x = xOf(p.g.start);
        const w = Math.max(0, (p.g.end - p.g.start) * scale);
        const text = p.kind === LOT_KIND ? String(p.g.lot) : p.kind;
        const fits = text.length * 6 + 4 <= w;
        bars.push({
          src: p.g, kind: p.kind, stageType: p.stageType, rowKey: r.key, lane, x, w,
          y: top + lane * G.laneH + 1, h: G.laneH - 2,
          label: fits ? text : "",
          labelOutside: !fits && p.kind !== LOT_KIND ? text : "", limiting,
        });
      }
      y += h;
    }
    //  T_L as a dimension between two PUBLISHED bar starts.
    let cycleDim: GanttTrainGeom["cycleDim"] = null;
    const limRow = rows.find((r) => r.limiting);
    if (limRow) {
      const lotBars = bars.filter((b) => b.rowKey === limRow.key && b.kind === LOT_KIND);
      const b1 = lotBars.find((b) => b.src.lot === 1);
      const b2 = lotBars.find((b) => b.src.lot === 2);
      if (b1 && b2) cycleDim = { x0: b1.x, x1: b2.x, y: ty + G.trainH + 7 };
    }
    trains.push({ train, name, y: ty, axisY, tMax, ticks, scale, rows, cycleDim });
    y += G.trainGap;
  }
  const legendY = y + 4;
  const legendLines = stageTypes.length + kinds.filter((k) => k !== LOT_KIND).length + 5;
  const height = legendY + legendLines * G.legendLineH + 8;
  return {
    width: G.marginL + G.labelW + G.plotW + G.occW + G.marginR,
    height, plotX, trains, bars, kinds, stageTypes, legendY,
  };
}

/** A lot's fill, by its stage's type; every segment kind its own colour (in
 *  order of appearance), so a kind this GUI does not know is still distinct. */
const SEGMENT_PALETTE = ["#868e96", "#e8590c", "#7048e8", "#c2255c", "#2b8a3e", "#e67700"];
const TYPE_PALETTE = ["#4c6ef5", "#15aabf", "#82c91e", "#be4bdb"];
export function lotColour(stageType: string, stageTypes: readonly string[]): string {
  const i = Math.max(0, stageTypes.indexOf(stageType));
  return TYPE_PALETTE[i % TYPE_PALETTE.length] ?? "#4c6ef5";
}
export function kindColour(kind: string, kinds: readonly string[]): string {
  const others = kinds.filter((k) => k !== LOT_KIND);
  const i = Math.max(0, others.indexOf(kind));
  return SEGMENT_PALETTE[i % SEGMENT_PALETTE.length] ?? "#868e96";
}

/** What a segment kind means, for the legend: the engine's own word, with
 *  its meaning where this GUI knows it, and said plainly where it does not. */
export function kindLegend(kind: string): string {
  if (kind === "changeover")
    return "changeover: the train's clean between campaigns, as published";
  return `${kind}: a segment the engine published with this word`;
}
