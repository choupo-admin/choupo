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
  THE BATCH PLAN as the engine published it (DEV.md 4c C99, C110 G2): the
  result JSON's top-level `"batchPlan"` block (src/result/BatchPlanJson.cpp),
  its TYPES and the one function that polices them.  Its own file so the
  adapter that carries a run's result touches it through one import.

  TWO SHAPES, because the engine writes two (BatchPlanJson.cpp,
  `emitBatchPlanJson` and `emitMultiProduct`): ONE PRODUCT -- the summary,
  the trains, the stages with their times, the FIRST campaign's Gantt, the
  findings -- and SEVERAL PRODUCTS in single-product campaigns, which moves
  every per-product number into `products`, `productTrains` and
  `productStages` and publishes the YEAR's Gantt with a `kind` on every bar
  (`lot | campaign | changeover | productChangeover | stageClean`).  The
  discriminator is the engine's own: a `products` list is written by the
  multiproduct emitter and by nothing else.

  Nothing is computed here -- no cycle time, no occupancy, no position, no
  schedule.  A field the drawing reads and the block does not carry is NOT
  defaulted: it is NAMED in `missing` (`stages[blending].cycleTime`) and the
  section says so; a Gantt bar without a finite start and end is named there
  too and not drawn, because a bar at hour zero would read as a time the
  engine published.
\*---------------------------------------------------------------------------*/

export interface BatchFinding {
  id: string; kind: string; subject: string;
  value: number; limit: number; message: string;
}

/** One published Gantt bar, unchanged. */
export interface BatchGanttRow {
  id: string;
  train: string;
  /** A published stage's name, or the engine's word for a train-level
   *  segment (`changeover`, `productChangeover`; "" on a campaign bar). */
  stage: string;
  /** 1-based; 0 for a bar that is not a lot. */
  lot: number;
  /** 1-based out-of-phase unit; 0 for a bar that is not on a unit. */
  unit: number;
  /** [h] from the start of the first campaign (one product) or of the
   *  year's first campaign (several products). */
  start: number;
  end: number;
  /** The engine's own word: `lot | campaign | changeover |
   *  productChangeover | stageClean` (several products).  One product
   *  publishes none ("" here); the drawing reads the bar's stage word. */
  kind: string;
  /** Several products only: the product the bar belongs to, its campaign
   *  (1-based) and, on a campaign bar, the lots in it. */
  product: string;
  campaign: number;
  lots: number;
}

/** A stage as both shapes publish it. */
export interface BatchStageCommon {
  name: string;
  train: string;
  /** "batch" | "semicontinuous" | ... (as the engine wrote it). */
  type: string;
  holds: string;
  feeds: string;
  limiting: boolean;
  inPhase: number;
  outOfPhase: number;
  unitsInstalled: number;
  /** [m3] batch stages only. */
  volume?: number;
  volumePerUnit?: number;
  /** [kg/h] continuous stages only. */
  rate?: number;
  /** [h/yr] */
  busyHours: number;
  /** [-] busyHours / the train's availableTime. */
  occupancy: number;
  idleHours: number;
  units: string[];
}

/** The four parts of one stage cycle and what follows from them, per stage
 *  (one product) or per product and stage (several). */
export interface BatchStageTimes {
  chargeTime: number;
  processTime: number;
  dischargeTime: number;
  cleanTime: number;
  cycleTime: number;
  effectiveCycle: number;
  /** [-] effectiveCycle / T_L. */
  utilisation: number;
  /** [h] the stage's start in its train's (its product's) first campaign. */
  offset: number;
}

export interface BatchStage extends BatchStageCommon, BatchStageTimes {
  /** [kg] the stage's mass per lot. */
  massPerLot: number;
}

export interface BatchTrain {
  name: string;
  limitingStage: string;
  /** [h/yr] */
  availableTime: number;
  lotsPerCampaign: number;
  /** [h] between campaigns. */
  changeover: number;
  /** [h] T_L, the train's limiting cycle time. */
  cycleTime: number;
  campaigns: number;
  /** [h] the first campaign, lots only. */
  campaignSpan: number;
  /** [h] span + changeover. */
  campaignDuration: number;
  /** [h/yr] */
  requiredTime: number;
  /** [-] requiredTime / availableTime. */
  occupancy: number;
  stages: string[];
}

export interface SingleProductPlan {
  multiProduct: false;
  summary: {
    product: string;
    productPerYear: number;
    lotRule: string;
    lotStream?: string;
    lotLimitingStage?: string;
    /** [kg] product per lot. */
    lotSize: number;
    lotsPerYear: number;
    /** [kg/yr] lotsPerYear x lotSize, as published. */
    production: number;
    equivalentHours: number;
    streamFactor: number;
    unplannedUnits: string[];
  };
  trains: BatchTrain[];
  stages: BatchStage[];
  gantt: BatchGanttRow[];
  findings: BatchFinding[];
  /** Fields the drawing reads that the block did not carry, by name. */
  missing: string[];
}

export interface BatchProduct {
  name: string;
  /** The product whose campaign follows in the declared order. */
  next: string;
  lotRule: string;
  perYear: number;
  lotSize: number;
  lotsPerYear: number;
  production: number;
  equivalentHours: number;
  /** Streams whose balance is this product's own (`massPerProduct`). */
  ownBalance: string[];
}

export interface BatchMultiTrain {
  name: string;
  availableTime: number;
  lotsPerCampaign: number;
  /** [h] between two campaigns of ONE product. */
  changeover: number;
  campaigns: number;
  productChangeovers: number;
  /** [h/yr] every changeover of the year. */
  changeoverHours: number;
  requiredTime: number;
  occupancy: number;
  stages: string[];
}

/** One product on one train: its own T_L, its campaigns, where its year
 *  starts on the train and the clean that follows its last campaign. */
export interface BatchProductTrain {
  product: string;
  train: string;
  limitingStage: string;
  next: string;
  cycleTime: number;
  campaigns: number;
  lotsLastCampaign: number;
  campaignSpan: number;
  start: number;
  productChangeover: number;
  requiredTime: number;
}

export interface BatchMultiStage extends BatchStageCommon {
  /** The product the stage is sized for. */
  sizingProduct: string;
  /** [h] the declared clean between campaigns of different products. */
  productChangeover: number;
  maxUtilisation: number;
}

export interface BatchProductStage extends BatchStageTimes {
  product: string;
  stage: string;
  limiting: boolean;
  massPerLot: number;
  /** [h] the clean this product's last campaign took at this stage. */
  changeoverAfter: number;
}

export interface MultiProductPlan {
  multiProduct: true;
  summary: {
    productPerYear: number;
    campaignOrder: string[];
    lotsPerYear: number;
    production: number;
    equivalentHours: number;
    streamFactor: number;
    unplannedUnits: string[];
  };
  products: BatchProduct[];
  trains: BatchMultiTrain[];
  productTrains: BatchProductTrain[];
  stages: BatchMultiStage[];
  productStages: BatchProductStage[];
  gantt: BatchGanttRow[];
  findings: BatchFinding[];
  missing: string[];
}

export type BatchPlan = SingleProductPlan | MultiProductPlan;

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v.map(rec) : []);
const words = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A reader that NAMES every required field the block does not carry. */
class Reader {
  readonly missing: string[] = [];
  num(o: Record<string, unknown>, k: string, where: string): number {
    if (fin(o[k])) return o[k] as number;
    this.missing.push(`${where}.${k}`);
    return NaN;
  }
  int(o: Record<string, unknown>, k: string, where: string): number {
    const v = this.num(o, k, where);
    return Number.isFinite(v) ? Math.round(v) : NaN;
  }
  word(o: Record<string, unknown>, k: string, where: string): string {
    if (typeof o[k] === "string") return o[k] as string;
    this.missing.push(`${where}.${k}`);
    return "";
  }
  list(o: Record<string, unknown>, k: string, where: string): string[] {
    if (Array.isArray(o[k])) return words(o[k]);
    this.missing.push(`${where}.${k}`);
    return [];
  }
}

/** Optional numbers: present on one stage type and not on the other. */
const opt = <K extends string>(key: K, v: unknown): { [P in K]?: number } =>
  (fin(v) ? ({ [key]: v } as { [P in K]?: number }) : {});

const named = (xs: Record<string, unknown>[], k = "name") =>
  xs.filter((x) => typeof x[k] === "string" && x[k] !== "");

function shapeFindings(b: Record<string, unknown>): BatchFinding[] {
  return arr(b.findings).map((f) => ({
    id: str(f.id), kind: str(f.kind), subject: str(f.subject),
    value: fin(f.value) ? f.value : NaN, limit: fin(f.limit) ? f.limit : NaN,
    message: str(f.message),
  }));
}

function shapeGantt(b: Record<string, unknown>, R: Reader, multi: boolean): BatchGanttRow[] {
  const out: BatchGanttRow[] = [];
  arr(b.gantt).forEach((g, i) => {
    const where = `gantt[${str(g.id) || i}]`;
    if (!fin(g.start) || !fin(g.end) || typeof g.train !== "string") {
      //  Named and not drawn: a bar at the origin is a time nobody published.
      R.missing.push(`${where}.${!fin(g.start) ? "start" : !fin(g.end) ? "end" : "train"}`);
      return;
    }
    out.push({
      id: str(g.id), train: g.train, stage: str(g.stage),
      lot: fin(g.lot) ? Math.round(g.lot) : 0, unit: fin(g.unit) ? Math.round(g.unit) : 0,
      start: g.start, end: g.end,
      kind: multi ? R.word(g, "kind", where) : str(g.kind),
      product: multi ? R.word(g, "product", where) : str(g.product),
      campaign: fin(g.campaign) ? Math.round(g.campaign) : 0,
      lots: fin(g.lots) ? Math.round(g.lots) : 0,
    });
  });
  return out;
}

function stageCommon(x: Record<string, unknown>, R: Reader): BatchStageCommon {
  const w = `stages[${str(x.name)}]`;
  return {
    name: str(x.name), train: R.word(x, "train", w), type: R.word(x, "type", w),
    holds: str(x.holds), feeds: str(x.feeds),
    limiting: x.limiting === "yes" || x.limiting === true,
    inPhase: R.int(x, "inPhase", w), outOfPhase: R.int(x, "outOfPhase", w),
    unitsInstalled: R.int(x, "unitsInstalled", w),
    ...opt("volume", x.volume), ...opt("volumePerUnit", x.volumePerUnit),
    ...opt("rate", x.rate),
    busyHours: R.num(x, "busyHours", w), occupancy: R.num(x, "occupancy", w),
    idleHours: R.num(x, "idleHours", w), units: words(x.units),
  };
}

function stageTimes(x: Record<string, unknown>, R: Reader, w: string): BatchStageTimes {
  return {
    chargeTime: R.num(x, "chargeTime", w), processTime: R.num(x, "processTime", w),
    dischargeTime: R.num(x, "dischargeTime", w), cleanTime: R.num(x, "cleanTime", w),
    cycleTime: R.num(x, "cycleTime", w), effectiveCycle: R.num(x, "effectiveCycle", w),
    utilisation: R.num(x, "utilisation", w), offset: R.num(x, "offset", w),
  };
}

function shapeSingle(b: Record<string, unknown>, R: Reader,
                     stagesRaw: Record<string, unknown>[]): SingleProductPlan {
  const s = rec(b.summary);
  const sw = "summary";
  return {
    multiProduct: false,
    summary: {
      product: R.word(s, "product", sw), productPerYear: R.num(s, "productPerYear", sw),
      lotRule: R.word(s, "lotRule", sw),
      ...(typeof s.lotStream === "string" && s.lotStream ? { lotStream: s.lotStream } : {}),
      ...(typeof s.lotLimitingStage === "string" && s.lotLimitingStage
        ? { lotLimitingStage: s.lotLimitingStage } : {}),
      lotSize: R.num(s, "lotSize", sw), lotsPerYear: R.int(s, "lotsPerYear", sw),
      production: R.num(s, "production", sw), equivalentHours: R.num(s, "equivalentHours", sw),
      streamFactor: R.num(s, "streamFactor", sw), unplannedUnits: words(s.unplannedUnits),
    },
    trains: named(arr(b.trains)).map((t) => {
      const w = `trains[${str(t.name)}]`;
      return {
        name: str(t.name), limitingStage: R.word(t, "limitingStage", w),
        availableTime: R.num(t, "availableTime", w),
        lotsPerCampaign: R.int(t, "lotsPerCampaign", w), changeover: R.num(t, "changeover", w),
        cycleTime: R.num(t, "cycleTime", w), campaigns: R.int(t, "campaigns", w),
        campaignSpan: R.num(t, "campaignSpan", w),
        campaignDuration: R.num(t, "campaignDuration", w),
        requiredTime: R.num(t, "requiredTime", w), occupancy: R.num(t, "occupancy", w),
        stages: R.list(t, "stages", w),
      };
    }),
    stages: stagesRaw.map((x) => ({
      ...stageCommon(x, R), ...stageTimes(x, R, `stages[${str(x.name)}]`),
      massPerLot: R.num(x, "massPerLot", `stages[${str(x.name)}]`),
    })),
    gantt: shapeGantt(b, R, false),
    findings: shapeFindings(b),
    missing: R.missing,
  };
}

function shapeMulti(b: Record<string, unknown>, R: Reader,
                    stagesRaw: Record<string, unknown>[]): MultiProductPlan {
  const s = rec(b.summary);
  const sw = "summary";
  return {
    multiProduct: true,
    summary: {
      productPerYear: R.num(s, "productPerYear", sw),
      campaignOrder: R.list(s, "campaignOrder", sw),
      lotsPerYear: R.int(s, "lotsPerYear", sw), production: R.num(s, "production", sw),
      equivalentHours: R.num(s, "equivalentHours", sw),
      streamFactor: R.num(s, "streamFactor", sw), unplannedUnits: words(s.unplannedUnits),
    },
    products: named(arr(b.products)).map((p) => {
      const w = `products[${str(p.name)}]`;
      return {
        name: str(p.name), next: R.word(p, "next", w), lotRule: R.word(p, "lotRule", w),
        perYear: R.num(p, "perYear", w), lotSize: R.num(p, "lotSize", w),
        lotsPerYear: R.int(p, "lotsPerYear", w), production: R.num(p, "production", w),
        equivalentHours: R.num(p, "equivalentHours", w), ownBalance: words(p.ownBalance),
      };
    }),
    trains: named(arr(b.trains)).map((t) => {
      const w = `trains[${str(t.name)}]`;
      return {
        name: str(t.name), availableTime: R.num(t, "availableTime", w),
        lotsPerCampaign: R.int(t, "lotsPerCampaign", w), changeover: R.num(t, "changeover", w),
        campaigns: R.int(t, "campaigns", w),
        productChangeovers: R.int(t, "productChangeovers", w),
        changeoverHours: R.num(t, "changeoverHours", w),
        requiredTime: R.num(t, "requiredTime", w), occupancy: R.num(t, "occupancy", w),
        stages: R.list(t, "stages", w),
      };
    }),
    productTrains: named(arr(b.productTrains), "product").map((x) => {
      const w = `productTrains[${str(x.product)}:${str(x.train)}]`;
      return {
        product: str(x.product), train: R.word(x, "train", w),
        limitingStage: R.word(x, "limitingStage", w), next: R.word(x, "next", w),
        cycleTime: R.num(x, "cycleTime", w), campaigns: R.int(x, "campaigns", w),
        lotsLastCampaign: R.int(x, "lotsLastCampaign", w),
        campaignSpan: R.num(x, "campaignSpan", w), start: R.num(x, "start", w),
        productChangeover: R.num(x, "productChangeover", w),
        requiredTime: R.num(x, "requiredTime", w),
      };
    }),
    stages: stagesRaw.map((x) => {
      const w = `stages[${str(x.name)}]`;
      return {
        ...stageCommon(x, R), sizingProduct: R.word(x, "sizingProduct", w),
        productChangeover: R.num(x, "productChangeover", w),
        maxUtilisation: R.num(x, "maxUtilisation", w),
      };
    }),
    productStages: named(arr(b.productStages), "product").map((x) => {
      const w = `productStages[${str(x.product)}:${str(x.stage)}]`;
      return {
        product: str(x.product), stage: R.word(x, "stage", w),
        limiting: x.limiting === "yes" || x.limiting === true,
        massPerLot: R.num(x, "massPerLot", w), ...stageTimes(x, R, w),
        changeoverAfter: R.num(x, "changeoverAfter", w),
      };
    }),
    gantt: shapeGantt(b, R, true),
    findings: shapeFindings(b),
    missing: R.missing,
  };
}

/** The published block, typed; undefined when it carries no stage (no plan
 *  to draw).  Never a schedule of its own: every number is the engine's. */
export function shapeBatchPlan(raw: unknown): BatchPlan | undefined {
  const b = rec(raw);
  const stagesRaw = named(arr(b.stages));
  if (stagesRaw.length === 0) return undefined;
  const R = new Reader();
  return Array.isArray(b.products) ? shapeMulti(b, R, stagesRaw) : shapeSingle(b, R, stagesRaw);
}
