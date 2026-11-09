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
  campaignPlanMath -- THE TOY HALF of the `campaign-plan` EduTool (DEV.md 4c
  C249 c): the batch-plant method of src/postProcessing/BatchPlanPass.H,
  recomputed in TypeScript on a plant the student can move, so the Gantt
  chart answers a slider at once.

  THIS IS A SECOND IMPLEMENTATION, and the tool says so at the top of the
  half that uses it.  It exists to be MOVED, not to be believed: the engine
  half of the page reads what the engine published and recomputes nothing.
  What keeps the toy honest is tests/campaignPlan.test.ts, which feeds it
  the apalutamide01 and donepezil02 declarations and holds every number it
  returns to what the engine PUBLISHED for them (1e-6), and every formula to
  the BatchPlanPass.H line it was read at (CAMPAIGN_SOURCES).

  THE RESULT IS THE ENGINE'S OWN SHAPE.  `singlePlan` returns a
  `SingleProductPlan` and `multiPlan` a `MultiProductPlan`
  (adapters/batchPlanPayload.ts), with the Gantt rows the engine writes
  (BatchPlanPass.cpp, the first campaign's lots and the changeover bar for
  one product; the year's campaigns, lots of each first campaign, changeovers
  and stage cleans for several).  So ONE drawing -- case/batchGantt.ts and
  ui/BatchPlanSection.tsx's BatchGanttSvg -- draws the toy and the engine's
  plan: one instrument, not two.

  What the toy leaves out, on purpose: several trains per plan (the page
  has one train; trains are decoupled by a store and each repeats this
  arithmetic), a lot defined by `largestEquipment` (the lot is the slider),
  per-product mass balances (`massPerProduct`), cleaning water and the
  findings other than the two the lesson needs.
\*---------------------------------------------------------------------------*/

import type {
  BatchGanttRow, BatchMultiStage, BatchMultiTrain, BatchProduct, BatchProductStage,
  BatchProductTrain, BatchStage, BatchTrain, MultiProductPlan, SingleProductPlan,
} from "../../adapters/batchPlanPayload.js";

/** One stage of the toy, as the case declares one (BatchPlanPass.H:50-60). */
export interface StageSpec {
  name: string;
  type: "batch" | "semicontinuous";
  /** [h] */
  charge: number;
  /** [h] a batch stage's processing time; a semicontinuous stage's
   *  DECLARED operating time (used unless `operating` is `fromRate`). */
  process: number;
  /** [h], or the vessel empties through the stage it feeds
   *  (`dischargeTime throughFedStage`). */
  discharge: number | "fedStage";
  /** [h] between two lots. */
  clean: number;
  /** N_op: units out of phase. */
  outOfPhase: number;
  /** N_ip: units in phase (they split the lot). */
  inPhase: number;
  /** The stage this one feeds; null for none. */
  feeds: string | null;
  /** f_j [kg per kg of product]: the mass the stage handles. */
  holdsFactor: number;
  /** [kg/m3] and [-], batch stages: the size factor S_j = f_j / (rho phi). */
  bulkDensity?: number;
  fillFraction?: number;
  /** [kg/h] a semicontinuous stage's own machine rate (all N_ip together). */
  rate?: number;
  /** `declared`: `process` is the operating time; `fromRate`: it is
   *  m_j / (N_ip rate), the engine's `operatingTime fromFlowsheet`. */
  operating?: "declared" | "fromRate";
}

export interface TrainSpec {
  name: string;
  /** [h/yr] */
  available: number;
  lotsPerCampaign: number;
  /** [h] the clean between two campaigns of one product. */
  changeover: number;
  stages: StageSpec[];
}

export interface SingleSpec {
  product: string;
  /** [kg/yr] */
  perYear: number;
  /** [kg] product per lot, B. */
  lotSize: number;
  train: TrainSpec;
}

/** The year's lots, N = ceil(Q / B), with the engine's own 1e-9 guard
 *  (BatchPlanPass.cpp:518) so 20000/400 is 50 and not 51. */
export function lotsPerYear(perYear: number, lotSize: number): number {
  const ratio = perYear / lotSize;
  const n = Math.ceil(ratio - 1e-9 * ratio);
  return n < 1 ? 1 : n;
}

// ---- the one campaign schedule -------------------------------------------

export interface SchedStage {
  name: string;
  feeds: string | null;
  charge: number; proc: number; cycle: number;
  offset: number;
}

/** ONE CAMPAIGN'S OFFSETS (BatchPlanPass.cpp:160-225 -- the one home of the
 *  schedule), ported line for line.  A stage fed by earlier ones starts
 *  when their discharge starts; a side feed is scheduled backwards so that
 *  its discharge starts when the stage it feeds starts processing; the
 *  earliest start is time zero.  Fills `offset` and returns
 *  max_j (o_j + t_j). */
export function scheduleCampaign(v: SchedStage[]): number {
  const at = new Map<string, number>();
  v.forEach((s, k) => at.set(s.name, k));
  const fedBy = new Map<string, string[]>();
  for (const s of v)
    if (s.feeds) fedBy.set(s.feeds, [...(fedBy.get(s.feeds) ?? []), s.name]);
  const scheduled = new Set<string>();
  v.forEach((s, k) => {
    if (k === 0) { s.offset = 0; scheduled.add(s.name); return; }
    let any = false;
    let o = 0;
    for (const f of fedBy.get(s.name) ?? []) {
      if (!scheduled.has(f)) continue;
      const fs = v[at.get(f)!]!;
      const dischargeStart = fs.offset + fs.charge + fs.proc;
      o = any ? Math.max(o, dischargeStart) : dischargeStart;
      any = true;
    }
    if (any) { s.offset = o; scheduled.add(s.name); }
  });
  for (let k = v.length - 1; k >= 0; k--) {
    const s = v[k]!;
    if (scheduled.has(s.name)) continue;
    if (s.feeds) {
      const tg = v[at.get(s.feeds)!]!;
      s.offset = tg.offset + tg.charge - s.charge - s.proc;
    } else s.offset = 0;
    scheduled.add(s.name);
  }
  let oMin = 0; let first = true;
  for (const s of v) { oMin = first ? s.offset : Math.min(oMin, s.offset); first = false; }
  let last = 0;
  for (const s of v) { s.offset -= oMin; last = Math.max(last, s.offset + s.cycle); }
  return last;
}

// ---- one product's stage times -------------------------------------------

export interface StageTimes {
  name: string;
  massPerLot: number;
  /** [m3] batch stages. */
  volume: number;
  /** [kg/h] semicontinuous stages: the rate the plan asks of the machine. */
  requiredRate: number;
  charge: number; process: number; discharge: number; clean: number;
  cycle: number; effectiveCycle: number;
}

/** t_j and the rest for one product: the sizes, the processing time of a
 *  rated stage, `throughFedStage`, the cycle (BatchPlanPass.H:97-111). */
export function stageTimes(stages: readonly StageSpec[], lotSize: number): StageTimes[] {
  const out = new Map<string, StageTimes>();
  for (const s of stages) {
    const m = s.holdsFactor * lotSize;
    let process = s.process;
    let volume = NaN; let requiredRate = NaN;
    if (s.type === "batch") {
      const S = s.holdsFactor / ((s.bulkDensity ?? 1) * (s.fillFraction ?? 1));
      volume = S * lotSize;
    } else {
      if (s.operating === "fromRate" && s.rate) process = m / (s.inPhase * s.rate);
      requiredRate = m / process;
    }
    out.set(s.name, { name: s.name, massPerLot: m, volume, requiredRate,
      charge: s.charge, process, discharge: 0, clean: s.clean, cycle: 0, effectiveCycle: 0 });
  }
  for (const s of stages) {
    const t = out.get(s.name)!;
    if (s.discharge === "fedStage") {
      const fed = s.feeds ? out.get(s.feeds) : undefined;
      t.discharge = fed ? fed.process : 0;
    } else t.discharge = s.discharge;
    t.cycle = t.charge + t.process + t.discharge + t.clean;
    t.effectiveCycle = t.cycle / s.outOfPhase;
  }
  return stages.map((s) => out.get(s.name)!);
}

/** T_L = max_j t_j / N_op,j over the train, and the stage that sets it.  A
 *  later stage takes the title only by exceeding the earlier by more than
 *  1e-12 (BatchPlanPass.cpp:578). */
export function limiting(times: readonly StageTimes[]): { cycle: number; stage: string } {
  let cycle = 0; let stage = "";
  for (const t of times)
    if (t.effectiveCycle > cycle + 1e-12) { cycle = t.effectiveCycle; stage = t.name; }
  return { cycle, stage };
}

function schedOf(stages: readonly StageSpec[], times: readonly StageTimes[]): SchedStage[] {
  return stages.map((s, k) => ({
    name: s.name, feeds: s.feeds, charge: times[k]!.charge, proc: times[k]!.process,
    cycle: times[k]!.cycle, offset: 0,
  }));
}

const defaultFeeds = (stages: readonly StageSpec[]): StageSpec[] =>
  stages.map((s) => ({ ...s }));

// ---- ONE PRODUCT ---------------------------------------------------------

/** The single-product plan, in the shape the engine publishes it. */
export function singlePlan(spec: SingleSpec): SingleProductPlan {
  const t = spec.train;
  const stages = defaultFeeds(t.stages);
  const N = lotsPerYear(spec.perYear, spec.lotSize);
  const times = stageTimes(stages, spec.lotSize);
  const lim = limiting(times);
  const sv = schedOf(stages, times);
  const last = scheduleCampaign(sv);
  const span = (n: number) => last + (n - 1) * lim.cycle;
  const nc = t.lotsPerCampaign;
  const campaigns = Math.floor((N + nc - 1) / nc);
  const full = Math.floor(N / nc); const rem = N % nc;
  const nFirst = Math.min(nc, N);
  const campaignSpan = span(nFirst);
  const campaignDuration = campaignSpan + t.changeover;
  const required = full * (span(nc) + t.changeover) + (rem > 0 ? span(rem) + t.changeover : 0);
  const gantt: BatchGanttRow[] = [];
  const stageRows: BatchStage[] = stages.map((s, k) => {
    const x = times[k]!;
    const busy = N * x.cycle / s.outOfPhase + campaigns * t.changeover;
    for (let i = 0; i < nFirst; i++) {
      const start = sv[k]!.offset + i * lim.cycle;
      gantt.push({ id: `${s.name}-${i + 1}`, train: t.name, stage: s.name, lot: i + 1,
        unit: (i % s.outOfPhase) + 1, start, end: start + x.cycle, kind: "", product: "",
        campaign: 0, lots: 0 });
    }
    return {
      name: s.name, train: t.name, type: s.type, holds: "", feeds: s.feeds ?? "",
      limiting: s.name === lim.stage, inPhase: s.inPhase, outOfPhase: s.outOfPhase,
      unitsInstalled: s.inPhase * s.outOfPhase,
      ...(s.type === "batch" ? { volume: x.volume, volumePerUnit: x.volume / s.inPhase }
        : { rate: x.requiredRate }),
      busyHours: busy, occupancy: busy / t.available, idleHours: t.available - busy, units: [],
      chargeTime: x.charge, processTime: x.process, dischargeTime: x.discharge,
      cleanTime: x.clean, cycleTime: x.cycle, effectiveCycle: x.effectiveCycle,
      utilisation: x.effectiveCycle / lim.cycle, offset: sv[k]!.offset, massPerLot: x.massPerLot,
    };
  });
  gantt.push({ id: "changeover", train: t.name, stage: "changeover", lot: 0, unit: 0,
    start: campaignSpan, end: campaignDuration, kind: "", product: "", campaign: 0, lots: 0 });
  const train: BatchTrain = {
    name: t.name, limitingStage: lim.stage, availableTime: t.available,
    lotsPerCampaign: nc, changeover: t.changeover, cycleTime: lim.cycle, campaigns,
    campaignSpan, campaignDuration, requiredTime: required, occupancy: required / t.available,
    stages: stages.map((s) => s.name),
  };
  return {
    multiProduct: false,
    summary: {
      product: spec.product, productPerYear: spec.perYear, lotRule: "declared",
      lotSize: spec.lotSize, lotsPerYear: N, production: N * spec.lotSize,
      equivalentHours: NaN, streamFactor: NaN, unplannedUnits: [],
    },
    trains: [train], stages: stageRows, gantt,
    findings: toyFindings(stageRows, [train]), missing: [],
  };
}

/** The two findings the lesson needs, in the engine's words' spirit
 *  (BatchPlanPass.H:148-153): a stage that never limits and is busy less
 *  than `lowUtilisation` of the cycle, and a rated stage whose required
 *  rate is not the machine's. */
function toyFindings(stages: readonly BatchStage[], trains: readonly BatchTrain[]) {
  const out: SingleProductPlan["findings"] = [];
  for (const s of stages)
    if (!s.limiting && s.utilisation < LOW_UTILISATION)
      out.push({ id: `lowUtilisation:${s.name}`, kind: "lowUtilisation", subject: s.name,
        value: s.utilisation, limit: LOW_UTILISATION,
        message: `stage ${s.name} is busy ${(100 * s.utilisation).toFixed(1)} % of the cycle `
          + `and never limits` });
  for (const t of trains)
    if (t.requiredTime > t.availableTime)
      out.push({ id: `overYear:${t.name}`, kind: "overYear", subject: t.name,
        value: t.requiredTime, limit: t.availableTime,
        message: `train ${t.name} needs ${t.requiredTime.toFixed(1)} h of ${t.availableTime} h; `
          + `the engine REFUSES such a plan` });
  return out;
}

/** A rated stage whose required rate differs from the machine's by more than
 *  this share is announced (BatchPlanPass.H:148-153: 1 %). */
export const TOY_DRYER_MISMATCH = 0.01;

/** The stated default of `lowUtilisation` (BatchPlanPass.H:153). */
export const LOW_UTILISATION = 0.25;

// ---- SEVERAL PRODUCTS ----------------------------------------------------

export interface ProductSpec {
  name: string;
  perYear: number;
  lotSize: number;
  /** Per stage, what this product changes: the processing (or operating)
   *  time.  Everything else is the stage's (BatchPlanPass.H:182-184). */
  process?: { [stage: string]: number };
}

export interface MultiSpec {
  products: ProductSpec[];
  /** The campaign order: a permutation of the products. */
  order: string[];
  train: TrainSpec;
  /** [h] per stage: the default clean between campaigns of different
   *  products (`productChangeover`). */
  productChangeover: { [stage: string]: number };
  /** `changeoverTo`: stage -> "from>to" -> [h], the clean after `from`'s
   *  last campaign, before `to`. */
  changeoverTo?: { [stage: string]: { [fromTo: string]: number } };
}

export const fromTo = (from: string, to: string) => `${from}>${to}`;

/** The clean after `from`, before `to`, at `stage`: the declared
 *  `changeoverTo` if the product declares one, else the stage's
 *  `productChangeover` (BatchPlanPass.cpp:476-482). */
export function cleanAfter(spec: MultiSpec, stage: string, from: string, to: string): number {
  const o = spec.changeoverTo?.[stage]?.[fromTo(from, to)];
  return o !== undefined ? o : (spec.productChangeover[stage] ?? 0);
}

/** The several-product plan (BatchPlanPass.H:184-216), published shape. */
export function multiPlan(spec: MultiSpec): MultiProductPlan {
  const t = spec.train;
  const NP = spec.products.length;
  const byName = new Map(spec.products.map((p) => [p.name, p]));
  const order = spec.order.map((n) => byName.get(n)!);
  const next = (i: number) => order[(i + 1) % NP]!.name;
  const gantt: BatchGanttRow[] = [];
  const productStages: BatchProductStage[] = [];
  const productTrains: BatchProductTrain[] = [];
  const products: BatchProduct[] = [];
  const perProduct = order.map((p) => {
    const stages = t.stages.map((s) => ({
      ...s, process: p.process?.[s.name] ?? s.process,
    }));
    return { p, times: stageTimes(stages, p.lotSize), stages };
  });
  const N = order.map((p) => lotsPerYear(p.perYear, p.lotSize));
  const nc = t.lotsPerCampaign;
  let clock = 0; let required = 0; let campaignsAll = 0; let changeoverHours = 0;
  const busy = new Map<string, number>();
  order.forEach((p, i) => {
    const { times, stages } = perProduct[i]!;
    const lim = limiting(times);
    const sv = schedOf(stages, times);
    const last = scheduleCampaign(sv);
    const span = (n: number) => last + (n - 1) * lim.cycle;
    const after = stages.map((s) => (NP < 2 ? t.changeover
      : cleanAfter(spec, s.name, p.name, next(i))));
    const pco = NP < 2 ? t.changeover : Math.max(0, ...after);
    const campaigns = Math.floor((N[i]! + nc - 1) / nc);
    const full = Math.floor(N[i]! / nc); const rem = N[i]! % nc;
    const requiredP = full * span(nc) + (rem > 0 ? span(rem) : 0)
      + (campaigns - 1) * t.changeover + pco;
    productTrains.push({ product: p.name, train: t.name, limitingStage: lim.stage,
      next: next(i), cycleTime: lim.cycle, campaigns,
      lotsLastCampaign: rem > 0 ? rem : Math.min(nc, N[i]!), campaignSpan: span(Math.min(nc, N[i]!)),
      start: clock, productChangeover: pco, requiredTime: requiredP });
    let c0 = clock;
    for (let k = 1; k <= campaigns; k++) {
      const nl = k <= full ? nc : rem;
      gantt.push({ id: `${p.name}-c${k}`, train: t.name, stage: "", lot: 0, unit: 0,
        start: c0, end: c0 + span(nl), kind: "campaign", product: p.name, campaign: k, lots: nl });
      if (k === 1)
        stages.forEach((s, j) => {
          for (let l = 0; l < nl; l++) {
            const start = c0 + sv[j]!.offset + l * lim.cycle;
            gantt.push({ id: `${p.name}-${s.name}-${l + 1}`, train: t.name, stage: s.name,
              lot: l + 1, unit: (l % s.outOfPhase) + 1, start, end: start + times[j]!.cycle,
              kind: "lot", product: p.name, campaign: 1, lots: 0 });
          }
        });
      c0 += span(nl);
      if (k < campaigns || NP < 2) {
        gantt.push({ id: `${p.name}-co${k}`, train: t.name, stage: "changeover", lot: 0, unit: 0,
          start: c0, end: c0 + t.changeover, kind: "changeover", product: p.name, campaign: k, lots: 0 });
        c0 += t.changeover;
      } else {
        gantt.push({ id: `${p.name}-pco`, train: t.name, stage: "productChangeover", lot: 0,
          unit: 0, start: c0, end: c0 + pco, kind: "productChangeover", product: p.name,
          campaign: k, lots: 0 });
        stages.forEach((s, j) =>
          gantt.push({ id: `${p.name}-${s.name}-clean`, train: t.name, stage: s.name, lot: 0,
            unit: 0, start: c0, end: c0 + after[j]!, kind: "stageClean", product: p.name,
            campaign: 0, lots: 0 }));
        c0 += pco;
      }
    }
    clock += requiredP; required += requiredP; campaignsAll += campaigns;
    changeoverHours += (campaigns - 1) * t.changeover + pco;
    stages.forEach((s, j) => {
      const x = times[j]!;
      productStages.push({ product: p.name, stage: s.name, limiting: s.name === lim.stage,
        massPerLot: x.massPerLot, chargeTime: x.charge, processTime: x.process,
        dischargeTime: x.discharge, cleanTime: x.clean, cycleTime: x.cycle,
        effectiveCycle: x.effectiveCycle, utilisation: x.effectiveCycle / lim.cycle,
        offset: sv[j]!.offset, changeoverAfter: after[j]! });
      busy.set(s.name, (busy.get(s.name) ?? 0) + N[i]! * x.cycle / s.outOfPhase
        + (campaigns - 1) * t.changeover + after[j]!);
    });
    products.push({ name: p.name, next: next(i), lotRule: "declared", perYear: p.perYear,
      lotSize: p.lotSize, lotsPerYear: N[i]!, production: N[i]! * p.lotSize,
      equivalentHours: NaN, ownBalance: [] });
  });
  const stageRows: BatchMultiStage[] = t.stages.map((s) => {
    const b = busy.get(s.name) ?? 0;
    const pss = productStages.filter((x) => x.stage === s.name);
    return {
      name: s.name, train: t.name, type: s.type, holds: "", feeds: s.feeds ?? "",
      limiting: pss.some((x) => x.limiting), inPhase: s.inPhase, outOfPhase: s.outOfPhase,
      unitsInstalled: s.inPhase * s.outOfPhase, busyHours: b, occupancy: b / t.available,
      idleHours: t.available - b, units: [], sizingProduct: "",
      productChangeover: spec.productChangeover[s.name] ?? 0,
      maxUtilisation: Math.max(...pss.map((x) => x.utilisation)),
    };
  });
  const train: BatchMultiTrain = {
    name: t.name, availableTime: t.available, lotsPerCampaign: nc, changeover: t.changeover,
    campaigns: campaignsAll, productChangeovers: NP >= 2 ? NP : 0, changeoverHours,
    requiredTime: required, occupancy: required / t.available, stages: t.stages.map((s) => s.name),
  };
  return {
    multiProduct: true,
    summary: {
      productPerYear: order.reduce((a, p) => a + p.perYear, 0), campaignOrder: [...spec.order],
      lotsPerYear: N.reduce((a, b) => a + b, 0),
      production: order.reduce((a, p, i) => a + N[i]! * p.lotSize, 0),
      equivalentHours: NaN, streamFactor: NaN, unplannedUnits: [],
    },
    products, trains: [train], productTrains, stages: stageRows, productStages, gantt,
    findings: [], missing: [],
  };
}

/** Every distinct order of the products, each with the train's required
 *  hours.  With cleans that depend on the stage alone every order costs the
 *  same; the orders that differ do so only through `changeoverTo`
 *  (BatchPlanPass.H:219-224).  Orders that are rotations of one another are
 *  the same CYCLE (the last product's clean is the one before the first),
 *  so `cycle` groups them. */
export interface OrderRow { order: string[]; required: number; cycle: string }

export function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)])
    .map((p) => [x, ...p]));
}

export function everyOrder(spec: MultiSpec): OrderRow[] {
  const names = spec.products.map((p) => p.name);
  return permutations(names).map((order) => {
    const plan = multiPlan({ ...spec, order });
    const k = order.indexOf(names.slice().sort()[0]!);
    const rot = [...order.slice(k), ...order.slice(0, k)];
    return { order, required: plan.trains[0]!.requiredTime, cycle: rot.join(" > ") };
  });
}

// ---- where each formula was read -----------------------------------------

/** Every engine claim the lesson makes, held by tests/campaignPlan.test.ts to
 *  the line it cites: the file's line must contain `needle`. */
export interface CampaignSource { file: string; line: number; needle: string; says: string }

export const CAMPAIGN_SOURCES: readonly CampaignSource[] = [
  { file: "src/postProcessing/BatchPlanPass.H", line: 97, needle: "f_j   = r_holds,j / r_P",
    says: "kg a stage handles per kg of product" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 98, needle: "B     = M_lot r_P / r_lotStream",
    says: "the lot is declared as a mass of a stream" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 103, needle: "t_op = declared, or m_j / (N_ip r_holds,j)",
    says: "a semicontinuous stage's operating time" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 108, needle: "t_j   = charge + process + discharge + clean",
    says: "a stage's cycle" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 109, needle: "dischargeTime throughFedStage",
    says: "a vessel that empties through the stage it feeds is held for that stage's run" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 111, needle: "T_L   = max_j t_j / N_op,j",
    says: "the limiting cycle time" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 112, needle: "u_j   = t_j / (N_op,j T_L)",
    says: "cycle utilisation" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 113, needle: "N     = ceil(Q / B)",
    says: "lots a year" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 114, needle: "campaigns = ceil(N / n_c)",
    says: "campaigns a year" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 120, needle: "span(n) = max_j (o_j + t_j) + (n - 1) T_L",
    says: "the makespan of n lots" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 121, needle: "required = SUM over campaigns of span(n) + changeover",
    says: "the year's required hours" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 122, needle: "busy_j   = N t_j / N_op + campaigns x changeover",
    says: "a unit's busy hours" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 123, needle: "occupancy_j = busy_j / available",
    says: "a stage's occupancy and the train's" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 210, needle: "C_i = max_j c_ij",
    says: "the clean before the next product is the longest of the stages' cleans" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 214, needle: "required = SUM_i [ SUM spans + (c_i - 1) changeover + C_i ]",
    says: "the year of several products" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 219, needle: "The ORDER moves the year only",
    says: "the order moves the year only through changeoverTo" },
  { file: "src/postProcessing/BatchPlanPass.H", line: 220, needle: "through `changeoverTo`: with cleans that depend on the stage alone, any",
    says: "with cleans that depend on the stage alone any order costs the same" },
  { file: "tutorials/batch/plant/apalutamide01_tablets/system/postDict", line: 112,
    needle: "lotsPerCampaign 7", says: "seven lots a campaign on the spray-drying train" },
  { file: "tutorials/batch/plant/apalutamide01_tablets/system/postDict", line: 113,
    needle: "changeover      48 h", says: "the 48 h clean between campaigns" },
  { file: "tutorials/batch/plant/apalutamide01_tablets/system/postDict", line: 170,
    needle: "dischargeTime throughFedStage", says: "the solution tank empties through the dryer" },
  { file: "tutorials/batch/plant/apalutamide01_tablets/system/postDict", line: 178,
    needle: "operatingTime fromFlowsheet", says: "the dryer's operating time is the flowsheet's own; cleanTime 0 h" },
  { file: "src/postProcessing/BatchPlanPass.cpp", line: 518, needle: "std::ceil(ratio - 1e-9 * ratio)",
    says: "the lots-a-year ceiling with its guard" },
  { file: "src/postProcessing/BatchPlanPass.cpp", line: 578, needle: "x.effectiveCycle > pt.cycleTime + 1e-12",
    says: "the limiting stage is the first to reach the largest effective cycle" },
];
