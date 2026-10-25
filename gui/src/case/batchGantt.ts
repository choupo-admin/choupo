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
  C110 G2/G5).  Pure: the published `batchPlan` block in, blocks, rows and
  bars in pixels out; ui/BatchPlanSection.tsx only draws what this returns.

  THE ENGINE DECIDES, THE GUI DRAWS.  Every bar is one published Gantt row
  (src/postProcessing/BatchPlanPass.cpp writes them), at its published start
  and end, in the lane of its published out-of-phase unit; every stage row is
  one published stage, in its train's published order; the limiting stage,
  T_L, the occupancy and the campaign spans are the published words and
  numbers.  Nothing here schedules, sums or infers a time -- the only
  arithmetic is the hours-to-pixels scale of a window and its axis ticks.  A
  lot bar spans the stage's WHOLE cycle as published (charge + process +
  discharge + clean); where in it each part falls is not published as
  positioned data, so it is not drawn -- the four durations are columns of
  the stage table instead.

  TWO SHAPES, as the engine publishes two:

  ONE PRODUCT -- the engine writes each train's FIRST campaign (later ones
  repeat it shifted by the campaign duration): one BLOCK per train, on its
  own time axis (apalutamide01's spray-drying campaign spans 420 h and its
  solid-dose one 101 h; one shared axis would squash the second), a row per
  stage and a `changeover` row for the train's clean between campaigns.

  SEVERAL PRODUCTS -- the engine writes each train's YEAR in the declared
  campaign order: every campaign and every changeover (`campaign`,
  `changeover`, `productChangeover` bars), the lots of each product's FIRST
  campaign, and each stage's own clean at a product change (`stageClean`).
  Per train a YEAR block -- one `campaigns` row carrying the campaign and
  changeover bars in sequence, a row per stage carrying the lots and the
  stage cleans, the train's published available time marked -- and then,
  per product in the published campaign order, a FIRST-CAMPAIGN block: a
  window on the same hours, from that product's campaign-1 bar's start to
  the end of the changeover the engine published after it, showing every
  bar of that product the window holds.  The window is chosen from two
  published bars; nothing in it is re-timed.

  DRAWN DEFENSIVELY.  A bar on a published stage goes on that stage's row; a
  bar naming no stage goes on its train's segment row (one product: by its
  stage word; several: the `campaigns` row for the three train-level kinds,
  else a row of its own kind).  A kind this GUI does not know is drawn, with
  a legend entry, never dropped.
\*---------------------------------------------------------------------------*/

import type {
  BatchGanttRow, BatchPlan, BatchStageCommon, MultiProductPlan, SingleProductPlan,
} from "../adapters/batchPlanPayload.js";

/** The kind every ordinary lot bar has. */
export const LOT_KIND = "lot";
/** The train-level kinds a multiproduct plan publishes on one `campaigns`
 *  row, in sequence (BatchPlanPass.cpp). */
export const TRAIN_KINDS = new Set(["campaign", "changeover", "productChangeover"]);
/** The row that carries them. */
export const CAMPAIGNS_ROW = "campaigns";

/** The kind a published Gantt row is drawn as: the engine's own word when
 *  it publishes one (several products), else a lot when the bar names a
 *  published stage and a lot >= 1, else the stage word it wrote (one
 *  product's `changeover`). */
export function segmentKind(g: BatchGanttRow, stageNames: ReadonlySet<string>): string {
  if (g.kind) return g.kind;
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
  /** A block's header: its title line and its published-numbers line. */
  headH: 34,
  /** The band between a block's header and its rows: the axis labels. */
  axisH: 30,
  blockGap: 18,
  laneH: 16,
  rowPad: 4,
  /** A row carries two text lines in the label column... */
  minRowH: 30,
  /** ...except in a first-campaign block, which carries one. */
  minRowHDetail: 22,
  legendLineH: 16,
} as const;

export interface GanttRowGeom {
  key: string;
  /** The published stage this row draws; null for a segment row. */
  stage: BatchStageCommon | null;
  /** The label: the stage's name, or a segment row's word. */
  label: string;
  /** The second label line ("" for none). */
  sub: string;
  /** Text in the right-hand column: the published occupancy (a year or a
   *  one-product block) or the product's utilisation (a first-campaign
   *  block); "" where nothing is published for the row. */
  right: string;
  /** The published fraction behind `right`, for its bar; NaN for none. */
  rightValue: number;
  lanes: number;
  y: number;
  h: number;
  limiting: boolean;
}

export interface GanttBarGeom {
  /** The published Gantt row this bar draws, unchanged. */
  src: BatchGanttRow;
  kind: string;
  /** The block it is drawn in. */
  block: string;
  /** The type of the stage a lot bar belongs to ("" otherwise). */
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
   *  bar (or just before it, where after would leave the plot), so a
   *  segment is never an unlabelled sliver ("" otherwise).  A year block
   *  writes none: at a year's scale the changeovers sit a few pixels apart
   *  and their words would overprint each other; the legend names them and
   *  each product's first-campaign block labels them. */
  labelOutside: string;
  labelBefore: boolean;
  limiting: boolean;
}

export interface GanttBlockGeom {
  key: string;
  /** "single" (one product's first campaign), "year" or "first". */
  role: "single" | "year" | "first";
  train: string;
  /** The product a first-campaign block is about ("" otherwise). */
  product: string;
  title: string;
  /** The header line beside the title: published numbers only. */
  detail: string;
  /** The block's top. */
  y: number;
  /** Its axis: the baseline y, the window [h], the ticks [h], the scale. */
  axisY: number;
  t0: number;
  t1: number;
  ticks: number[];
  scale: number;
  rows: GanttRowGeom[];
  /** T_L as a dimension on the limiting stage: from its lot-1 bar's start
   *  to its lot-2 bar's start, both published.  Null when there is no lot 2. */
  cycleDim: { x0: number; x1: number; y: number; hours: number } | null;
  /** The train's published available time, as a vertical mark (a year
   *  block, when it lies on the axis); null otherwise. */
  availableX: number | null;
  availableHours: number;
}

export interface GanttFigure {
  width: number;
  height: number;
  plotX: number;
  multiProduct: boolean;
  blocks: GanttBlockGeom[];
  bars: GanttBarGeom[];
  /** Every kind present, lots first, then the others in order of appearance. */
  kinds: string[];
  /** One product: the stage types present on lot bars, in order of
   *  appearance (a lot is coloured by its stage's type).  Several: empty. */
  stageTypes: string[];
  /** Several products: the products in the published campaign order (a lot
   *  and a campaign are coloured by their product).  One: empty. */
  products: string[];
  legendY: number;
  legendLines: number;
}

/** Tick hours over a window t0..t1: four to ten intervals at a 1/2/5 step,
 *  the first at or before t0, the last at or past t1. */
export function axisTicks(t1: number, t0 = 0): number[] {
  if (!(t1 > t0)) return [t0];
  const raw = (t1 - t0) / 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const first = Math.floor(t0 / step + 1e-9) * step;
  const out: number[] = [Number(first.toPrecision(12))];
  while ((out.at(-1) ?? 0) < t1 - 1e-9 * step)
    out.push(Number((first + out.length * step).toPrecision(12)));
  return out;
}

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const pct = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)} %` : "—");

/** The stages of a train, in its published order (a stage only its own
 *  record places on the train comes after). */
function stageOrder<S extends BatchStageCommon>(stages: S[], listed: string[], t: string): S[] {
  const byName = new Map(stages.map((s) => [s.name, s]));
  const first = listed.map((n) => byName.get(n)).filter((s): s is S => !!s);
  return [...first, ...stages.filter((s) => s.train === t && !first.includes(s))];
}

interface Placed {
  g: BatchGanttRow;
  kind: string;
  train: string;
  rowKey: string;
  rowLabel: string;
  stage: BatchStageCommon | null;
}

interface RowDef {
  key: string;
  stage: BatchStageCommon | null;
  label: string;
  sub: string;
  right: string;
  rightValue: number;
  limiting: boolean;
}

/** One block: rows top to bottom, every bar the block holds on its row. */
function layBlock(
  ctx: { plotX: number; bars: GanttBarGeom[]; kinds: string[] },
  head: Pick<GanttBlockGeom, "key" | "role" | "train" | "product" | "title" | "detail"
    | "t0" | "t1"> & { available?: number },
  rowDefs: RowDef[], mine: Placed[], y: number, minRowH: number,
  cycle: { stage: string; hours: number; product: string } | null,
): GanttBlockGeom {
  const G = GANTT;
  const t1w = Math.max(head.t1, head.available ?? -Infinity);
  const ticks = axisTicks(t1w, head.t0);
  const lo = ticks[0] ?? head.t0;
  const hi = ticks.at(-1) ?? t1w;
  const scale = G.plotW / (hi > lo ? hi - lo : 1);
  const xOf = (h: number) => ctx.plotX + (h - lo) * scale;
  const top = y;
  const axisY = top + G.headH + G.axisH;
  let ry = axisY;
  const rows: GanttRowGeom[] = [];
  for (const r of rowDefs) {
    const here = mine.filter((p) => p.rowKey === r.key);
    const lanes = Math.max(1, ...here.map((p) => p.g.unit));
    const h = Math.max(lanes * G.laneH + 2 * G.rowPad, minRowH);
    rows.push({ key: r.key, stage: r.stage, label: r.label, sub: r.sub, right: r.right,
                rightValue: r.rightValue, lanes, y: ry, h, limiting: r.limiting });
    const laneTop = ry + (h - lanes * G.laneH) / 2;
    for (const p of here) {
      const lane = Math.max(1, p.g.unit) - 1;
      const x = xOf(p.g.start);
      const w = Math.max(0, (p.g.end - p.g.start) * scale);
      const text = p.kind === LOT_KIND ? String(p.g.lot)
        : p.kind === "campaign" ? `${p.g.product} ${p.g.campaign} (${p.g.lots} lots)`
        : p.kind;
      const fits = text.length * 6 + 4 <= w;
      const outside = !fits && p.kind !== LOT_KIND && p.kind !== "campaign"
        && head.role !== "year" ? text : "";
      const plotEnd = ctx.plotX + G.plotW;
      ctx.bars.push({
        src: p.g, kind: p.kind, block: head.key, stageType: p.stage?.type ?? "",
        rowKey: r.key, lane, x, w, y: laneTop + lane * G.laneH + 1, h: G.laneH - 2,
        label: fits ? text : "",
        labelOutside: outside,
        labelBefore: outside !== "" && x + Math.max(w, 1) + 3 + outside.length * 5.5 > plotEnd,
        //  The limiting outline only where it can be seen as an outline.
        limiting: r.limiting && w >= 6,
      });
    }
    ry += h;
  }
  let cycleDim: GanttBlockGeom["cycleDim"] = null;
  if (cycle) {
    const lot = ctx.bars.filter((b) => b.block === head.key && b.kind === LOT_KIND
      && b.src.stage === cycle.stage && (!cycle.product || b.src.product === cycle.product));
    const b1 = lot.find((b) => b.src.lot === 1);
    const b2 = lot.find((b) => b.src.lot === 2);
    if (b1 && b2) cycleDim = { x0: b1.x, x1: b2.x, y: top + G.headH + 7, hours: cycle.hours };
  }
  const av = head.available;
  const availableX = av !== undefined && Number.isFinite(av) && av >= lo && av <= hi ? xOf(av) : null;
  return { key: head.key, role: head.role, train: head.train, product: head.product,
           title: head.title, detail: head.detail, t0: lo, t1: hi, y: top, axisY, ticks, scale, rows, cycleDim,
           availableX, availableHours: av ?? NaN };
}

function singleFigure(plan: SingleProductPlan, ctx: { plotX: number; bars: GanttBarGeom[];
                      kinds: string[] }, stageTypes: string[]): { blocks: GanttBlockGeom[]; y: number } {
  const G = GANTT;
  const stageNames = new Set(plan.stages.map((s) => s.name));
  const stageByName = new Map(plan.stages.map((s) => [s.name, s]));
  const trainNames: string[] = plan.trains.map((t) => t.name);
  for (const s of plan.stages) if (!trainNames.includes(s.train)) trainNames.push(s.train);
  const placed: Placed[] = plan.gantt.map((g) => {
    const kind = segmentKind(g, stageNames);
    const st = stageByName.get(g.stage) ?? null;
    const train = st?.train ?? g.train;
    if (!trainNames.includes(train)) trainNames.push(train);
    return { g, kind, train, stage: st, rowKey: st ? `stage:${st.name}` : `segment:${train}:${kind}`,
             rowLabel: st ? st.name : kind };
  });
  for (const p of placed) {
    if (!ctx.kinds.includes(p.kind)) ctx.kinds.push(p.kind);
    if (p.kind === LOT_KIND && p.stage && !stageTypes.includes(p.stage.type))
      stageTypes.push(p.stage.type);
  }
  const blocks: GanttBlockGeom[] = [];
  let y: number = G.titleH;
  for (const name of trainNames) {
    const tr = plan.trains.find((t) => t.name === name) ?? null;
    const mine = placed.filter((p) => p.train === name);
    const rowDefs: RowDef[] = stageOrder(plan.stages, tr?.stages ?? [], name).map((s) => ({
      key: `stage:${s.name}`, stage: s, label: s.name,
      sub: `${s.type} · cycle ${fmt(s.cycleTime)} h · ${s.unitsInstalled} unit`
        + `${s.unitsInstalled === 1 ? "" : "s"}`
        + (s.outOfPhase > 1 ? ` (${s.outOfPhase} out of phase)` : ""),
      right: pct(s.occupancy), rightValue: s.occupancy,
      limiting: s.limiting || tr?.limitingStage === s.name,
    }));
    for (const p of mine)
      if (!rowDefs.some((r) => r.key === p.rowKey))
        rowDefs.push({ key: p.rowKey, stage: null, label: p.rowLabel, sub: "train segment (not a stage)",
                       right: "", rightValue: NaN, limiting: false });
    const tEnd = Math.max(0, ...mine.map((p) => p.g.end),
      tr && Number.isFinite(tr.campaignDuration) ? tr.campaignDuration : 0);
    const b = layBlock(ctx, {
      key: `single:${name}`, role: "single", train: name, product: "",
      title: `Train ${name}`,
      detail: tr
        ? `T_L = ${fmt(tr.cycleTime)} h (limiting: ${tr.limitingStage || "—"}) · `
          + `${tr.lotsPerCampaign} lots a campaign · span ${fmt(tr.campaignSpan)} h `
          + `+ changeover ${fmt(tr.changeover)} h = ${fmt(tr.campaignDuration)} h · `
          + `${tr.campaigns} campaigns a year · train occupancy ${pct(tr.occupancy)}`
        : "(no train record published)",
      t0: 0, t1: tEnd,
    }, rowDefs, mine, y, G.minRowH,
      tr ? { stage: tr.limitingStage, hours: tr.cycleTime, product: "" } : null);
    blocks.push(b);
    const last = b.rows.at(-1);
    y = (last ? last.y + last.h : b.axisY) + G.blockGap;
  }
  return { blocks, y };
}

function multiFigure(plan: MultiProductPlan, ctx: { plotX: number; bars: GanttBarGeom[];
                     kinds: string[] }, products: string[]): { blocks: GanttBlockGeom[]; y: number } {
  const G = GANTT;
  const stageNames = new Set(plan.stages.map((s) => s.name));
  const stageByName = new Map(plan.stages.map((s) => [s.name, s]));
  for (const p of plan.summary.campaignOrder) if (!products.includes(p)) products.push(p);
  for (const p of plan.products) if (!products.includes(p.name)) products.push(p.name);
  const trainNames: string[] = plan.trains.map((t) => t.name);
  for (const s of plan.stages) if (!trainNames.includes(s.train)) trainNames.push(s.train);
  const placed: Placed[] = plan.gantt.map((g) => {
    const kind = segmentKind(g, stageNames);
    const st = stageByName.get(g.stage) ?? null;
    const train = st?.train ?? g.train;
    if (!trainNames.includes(train)) trainNames.push(train);
    if (g.product && !products.includes(g.product)) products.push(g.product);
    const rowKey = st ? `stage:${st.name}`
      : TRAIN_KINDS.has(kind) ? `segment:${train}:${CAMPAIGNS_ROW}` : `segment:${train}:${kind}`;
    const rowLabel = st ? st.name : TRAIN_KINDS.has(kind) ? CAMPAIGNS_ROW : kind;
    return { g, kind, train, stage: st, rowKey, rowLabel };
  });
  for (const p of placed) if (!ctx.kinds.includes(p.kind)) ctx.kinds.push(p.kind);

  const blocks: GanttBlockGeom[] = [];
  let y: number = G.titleH;
  const push = (b: GanttBlockGeom) => {
    blocks.push(b);
    const last = b.rows.at(-1);
    y = (last ? last.y + last.h : b.axisY) + G.blockGap;
  };
  for (const name of trainNames) {
    const tr = plan.trains.find((t) => t.name === name) ?? null;
    const stages = stageOrder(plan.stages, tr?.stages ?? [], name);
    const mine = placed.filter((p) => p.train === name);
    const segRows = (ps: Placed[], sub: string): RowDef[] => {
      const out: RowDef[] = [];
      for (const p of ps)
        if (!p.stage && !out.some((r) => r.key === p.rowKey))
          out.push({ key: p.rowKey, stage: null, label: p.rowLabel, sub, right: "",
                     rightValue: NaN, limiting: false });
      return out;
    };
    //  The year.
    const yearRows: RowDef[] = [
      ...segRows(mine, "campaigns and changeovers, in order"),
      ...stages.map((s) => ({
        key: `stage:${s.name}`, stage: s as BatchStageCommon, label: s.name,
        sub: `${s.type} · sized for ${s.sizingProduct || "—"} · ${s.unitsInstalled} unit`
          + `${s.unitsInstalled === 1 ? "" : "s"}`
          + (s.outOfPhase > 1 ? ` (${s.outOfPhase} out of phase)` : ""),
        right: pct(s.occupancy), rightValue: s.occupancy, limiting: s.limiting,
      })),
    ];
    const tEnd = Math.max(0, ...mine.map((p) => p.g.end));
    push(layBlock(ctx, {
      key: `year:${name}`, role: "year", train: name, product: "",
      title: `Train ${name} — the year`,
      detail: tr
        ? `${tr.campaigns} campaigns · ${tr.productChangeovers} product changeovers · `
          + `required ${fmt(tr.requiredTime, 1)} h of ${fmt(tr.availableTime, 0)} h available `
          + `(occupancy ${pct(tr.occupancy)}) · changeovers ${fmt(tr.changeoverHours, 1)} h`
        : "(no train record published)",
      t0: 0, t1: tEnd, ...(tr ? { available: tr.availableTime } : {}),
    }, yearRows, mine, y, G.minRowH, null));

    //  Each product's first campaign: a window between two published bars.
    for (const prod of products) {
      const c1 = mine.find((p) => p.kind === "campaign" && p.g.product === prod && p.g.campaign === 1);
      if (!c1) continue;
      const after = mine.find((p) => (p.kind === "changeover" || p.kind === "productChangeover")
        && p.g.product === prod && p.g.campaign === 1);
      const w0 = c1.g.start;
      const w1 = Math.max(c1.g.end, after ? after.g.end : c1.g.end);
      //  A bar is in the window when it overlaps it (one that only touches
      //  an edge -- the next campaign starting as this one's changeover
      //  ends -- is not); a zero-length bar when it lies inside it.
      const eps = 1e-9;
      const inWin = mine.filter((p) => p.g.product === prod
        && (p.g.end - p.g.start > eps
          ? p.g.start < w1 - eps && p.g.end > w0 + eps
          : p.g.start >= w0 - eps && p.g.start <= w1 + eps));
      const pt = plan.productTrains.find((x) => x.product === prod && x.train === name) ?? null;
      const psOf = (s: string) => plan.productStages.find((x) => x.product === prod && x.stage === s);
      const rows: RowDef[] = [
        ...segRows(inWin, ""),
        ...stages.map((s) => {
          const ps = psOf(s.name);
          return {
            key: `stage:${s.name}`, stage: s as BatchStageCommon,
            label: `${s.name} (${ps ? fmt(ps.cycleTime) : "—"} h)`, sub: "",
            right: ps ? `util. ${pct(ps.utilisation)}` : "",
            rightValue: ps ? ps.utilisation : NaN,
            limiting: !!ps?.limiting || pt?.limitingStage === s.name,
          };
        }),
      ];
      push(layBlock(ctx, {
        key: `first:${name}:${prod}`, role: "first", train: name, product: prod,
        title: `${prod} on ${name} — campaign 1 of ${pt ? pt.campaigns : "—"}`,
        detail: pt
          ? `T_L = ${fmt(pt.cycleTime)} h (limiting: ${pt.limitingStage || "—"}) · `
            + `${c1.g.lots} lots · span ${fmt(pt.campaignSpan)} h · `
            + (after?.kind === "productChangeover"
              ? `then the clean before ${pt.next || "—"}: ${fmt(pt.productChangeover)} h`
              : `then the changeover: ${fmt(tr ? tr.changeover : NaN)} h`)
          : "(no product-train record published)",
        t0: w0, t1: w1,
      }, rows, inWin, y, G.minRowHDetail,
        pt ? { stage: pt.limitingStage, hours: pt.cycleTime, product: prod } : null));
    }
  }
  return { blocks, y };
}

/** The whole figure.  Null when the plan publishes no stage. */
export function ganttFigure(plan: BatchPlan | undefined): GanttFigure | null {
  if (!plan || plan.stages.length === 0) return null;
  const G = GANTT;
  const plotX = G.marginL + G.labelW;
  const bars: GanttBarGeom[] = [];
  const kinds: string[] = [];
  const stageTypes: string[] = [];
  const products: string[] = [];
  const ctx = { plotX, bars, kinds };
  const { blocks, y } = plan.multiProduct
    ? multiFigure(plan, ctx, products) : singleFigure(plan, ctx, stageTypes);
  kinds.sort((a, b) => (a === LOT_KIND ? -1 : b === LOT_KIND ? 1 : 0));
  const legendY = y + 4;
  const legendLines = (plan.multiProduct ? products.length : stageTypes.length)
    + kinds.filter((k) => k !== LOT_KIND).length + 5 + (plan.multiProduct ? 1 : 0);
  return {
    width: G.marginL + G.labelW + G.plotW + G.occW + G.marginR,
    height: legendY + legendLines * G.legendLineH + 8,
    plotX, multiProduct: plan.multiProduct, blocks, bars, kinds, stageTypes, products,
    legendY, legendLines,
  };
}

/** Fills.  A lot is coloured by its stage's type (one product) or by its
 *  product (several); every other kind its own colour, in order of
 *  appearance, so a kind this GUI does not know is still distinct.  The
 *  drawing is ink on white paper whatever the app's theme (the C103
 *  floor-plan rule), so these are fixed print colours, not theme tokens. */
const SEGMENT_PALETTE = ["#868e96", "#e8590c", "#7048e8", "#c2255c", "#2b8a3e", "#e67700"];
const TYPE_PALETTE = ["#4c6ef5", "#15aabf", "#82c91e", "#be4bdb"];
const PRODUCT_PALETTE = ["#1c7ed6", "#f08c00", "#2f9e44", "#ae3ec9", "#e03131", "#0c8599"];
export function lotColour(stageType: string, stageTypes: readonly string[]): string {
  const i = Math.max(0, stageTypes.indexOf(stageType));
  return TYPE_PALETTE[i % TYPE_PALETTE.length] ?? "#4c6ef5";
}
export function productColour(product: string, products: readonly string[]): string {
  const i = Math.max(0, products.indexOf(product));
  return PRODUCT_PALETTE[i % PRODUCT_PALETTE.length] ?? "#1c7ed6";
}
export function kindColour(kind: string, kinds: readonly string[]): string {
  const others = kinds.filter((k) => k !== LOT_KIND && k !== "campaign");
  const i = Math.max(0, others.indexOf(kind));
  return SEGMENT_PALETTE[i % SEGMENT_PALETTE.length] ?? "#868e96";
}

/** What a kind means, for the legend: the engine's own word, with its
 *  meaning where this GUI knows it (BatchPlanRecords.H), and said plainly
 *  where it does not. */
export function kindLegend(kind: string): string {
  switch (kind) {
    case "changeover":
      return "changeover: the train's clean between two campaigns of one product, as published";
    case "productChangeover":
      return "productChangeover: the train's clean before the next product in the campaign order "
        + "(the longest of its stages' cleans), as published";
    case "stageClean":
      return "stageClean: a stage's own clean at the product change, as published";
    case "campaign":
      return "campaign: one campaign of a product (its number and lots inside), as published";
    default:
      return `${kind}: a segment the engine published with this word`;
  }
}
