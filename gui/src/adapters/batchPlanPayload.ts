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
  THE BATCH PLAN as the engine published it (DEV.md 4c C99): the result
  JSON's top-level `"batchPlan"` block (src/result/BatchPlanJson.cpp) -- the
  summary, the trains, the stages, the FIRST campaign's Gantt as data and the
  findings -- its TYPES and the one function that polices them.  Its own file
  so the adapter that carries a run's result touches it through one import.

  Only the types are policed: a Gantt bar whose start or end is not a finite
  number is DROPPED rather than drawn at hour zero, because a bar at the
  origin would read as a time the engine published.  Nothing is computed here
  -- no cycle time, no occupancy, no position.

  A Gantt row carries what the engine wrote and nothing more.  `kind` and
  `product` are read WHEN PRESENT (a multiproduct plan with cleaning and
  changeover segments may publish them, DEV.md 4c C110 G2); absent, the
  drawing decides a row's kind from what IS published (case/batchGantt.ts).
\*---------------------------------------------------------------------------*/

export interface BatchPlanSummary {
  product: string;
  /** [kg/h] the product stream's flowsheet rate. */
  productRate: number;
  /** [kg/yr] the declared production. */
  productPerYear: number;
  lotRule: string;
  lotStream?: string;
  lotStreamMass?: number;
  lotLimitingStage?: string;
  /** [kg] product per lot. */
  lotSize: number;
  lotsPerYear: number;
  /** [kg/yr] lotsPerYear x lotSize, as published. */
  production: number;
  equivalentHours: number;
  streamFactor: number;
  unplannedUnits: string[];
  productionSource: string;
  productionReason: string;
  lotSource: string;
  lotReason: string;
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
  source: string;
  reason: string;
}

export interface BatchStage {
  name: string;
  train: string;
  /** "batch" | "continuous" (as the engine wrote it). */
  type: string;
  holds: string;
  feeds: string;
  limiting: boolean;
  /** [kg] the stage's mass per lot. */
  massPerLot: number;
  /** [m3] batch stages only. */
  volume?: number;
  volumePerUnit?: number;
  /** [kg/h] continuous stages only. */
  rate?: number;
  inPhase: number;
  outOfPhase: number;
  unitsInstalled: number;
  /** [h] the four parts of one cycle and their sum. */
  chargeTime: number;
  processTime: number;
  dischargeTime: number;
  cleanTime: number;
  cycleTime: number;
  effectiveCycle: number;
  /** [-] effectiveCycle / T_L. */
  utilisation: number;
  /** [h] the stage's start in its train's first campaign. */
  offset: number;
  /** [h/yr] */
  busyHours: number;
  /** [-] busyHours / availableTime. */
  occupancy: number;
  idleHours: number;
  units: string[];
  source: string;
  reason: string;
}

/** One bar of the first campaign, as published. */
export interface BatchGanttRow {
  id: string;
  train: string;
  /** A published stage's name, or a word the engine uses for a
   *  train-level segment (today `changeover`). */
  stage: string;
  /** 1-based; 0 for a segment that is not a lot. */
  lot: number;
  /** 1-based out-of-phase unit; 0 for a segment that is not on a unit. */
  unit: number;
  /** [h] from the campaign's start. */
  start: number;
  end: number;
  /** Read only when the engine publishes it. */
  kind?: string;
  product?: string;
}

export interface BatchFinding {
  id: string; kind: string; subject: string;
  value: number; limit: number; message: string;
}

export interface BatchPlan {
  summary: BatchPlanSummary;
  trains: BatchTrain[];
  stages: BatchStage[];
  gantt: BatchGanttRow[];
  findings: BatchFinding[];
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown): number => (fin(v) ? v : NaN);
const int = (v: unknown): number => (fin(v) ? Math.round(v) : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v.map(rec) : []);
const words = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const opt = <K extends string>(k: K, v: unknown): { [P in K]?: number } =>
  (fin(v) ? ({ [k]: v } as { [P in K]?: number }) : {});
const optS = <K extends string>(k: K, v: unknown): { [P in K]?: string } =>
  (typeof v === "string" && v ? ({ [k]: v } as { [P in K]?: string }) : {});

/** The published block, typed; undefined when it carries no stage. */
export function shapeBatchPlan(raw: unknown): BatchPlan | undefined {
  const b = rec(raw);
  const s = rec(b.summary);
  const stages: BatchStage[] = arr(b.stages)
    .filter((x) => typeof x.name === "string" && x.name !== "")
    .map((x) => ({
      name: str(x.name), train: str(x.train), type: str(x.type),
      holds: str(x.holds), feeds: str(x.feeds),
      limiting: x.limiting === "yes" || x.limiting === true,
      massPerLot: num(x.massPerLot),
      ...opt("volume", x.volume), ...opt("volumePerUnit", x.volumePerUnit),
      ...opt("rate", x.rate),
      inPhase: int(x.inPhase), outOfPhase: int(x.outOfPhase),
      unitsInstalled: int(x.unitsInstalled),
      chargeTime: num(x.chargeTime), processTime: num(x.processTime),
      dischargeTime: num(x.dischargeTime), cleanTime: num(x.cleanTime),
      cycleTime: num(x.cycleTime), effectiveCycle: num(x.effectiveCycle),
      utilisation: num(x.utilisation), offset: num(x.offset),
      busyHours: num(x.busyHours), occupancy: num(x.occupancy),
      idleHours: num(x.idleHours), units: words(x.units),
      source: str(x.source), reason: str(x.reason),
    }));
  if (stages.length === 0) return undefined;
  return {
    summary: {
      product: str(s.product), productRate: num(s.productRate),
      productPerYear: num(s.productPerYear), lotRule: str(s.lotRule),
      ...optS("lotStream", s.lotStream), ...opt("lotStreamMass", s.lotStreamMass),
      ...optS("lotLimitingStage", s.lotLimitingStage),
      lotSize: num(s.lotSize), lotsPerYear: int(s.lotsPerYear),
      production: num(s.production), equivalentHours: num(s.equivalentHours),
      streamFactor: num(s.streamFactor), unplannedUnits: words(s.unplannedUnits),
      productionSource: str(s.productionSource), productionReason: str(s.productionReason),
      lotSource: str(s.lotSource), lotReason: str(s.lotReason),
    },
    trains: arr(b.trains).filter((t) => typeof t.name === "string").map((t) => ({
      name: str(t.name), limitingStage: str(t.limitingStage),
      availableTime: num(t.availableTime), lotsPerCampaign: int(t.lotsPerCampaign),
      changeover: num(t.changeover), cycleTime: num(t.cycleTime),
      campaigns: int(t.campaigns), campaignSpan: num(t.campaignSpan),
      campaignDuration: num(t.campaignDuration), requiredTime: num(t.requiredTime),
      occupancy: num(t.occupancy), stages: words(t.stages),
      source: str(t.source), reason: str(t.reason),
    })),
    stages,
    gantt: arr(b.gantt)
      .filter((g) => fin(g.start) && fin(g.end) && typeof g.train === "string"
        && typeof g.stage === "string")
      .map((g) => ({
        id: str(g.id), train: str(g.train), stage: str(g.stage),
        lot: int(g.lot), unit: int(g.unit),
        start: g.start as number, end: g.end as number,
        ...optS("kind", g.kind), ...optS("product", g.product),
      })),
    findings: arr(b.findings).map((f) => ({
      id: str(f.id), kind: str(f.kind), subject: str(f.subject),
      value: num(f.value), limit: num(f.limit), message: str(f.message),
    })),
  };
}
