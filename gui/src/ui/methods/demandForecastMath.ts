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
  Demand forecast for a drug product -- the arithmetic (commission C210,
  synthesis item E8).  React-free: the page (DemandForecastTool.tsx) draws
  what this file computes, and tests/demandForecast.test.ts recomputes every
  number by hand.

  THREE METHODS ON ONE HISTORY, none of them a measurement:

    A  trend regression      y = a + b t  by ordinary least squares on the
                             historic series, with R^2, the standard error,
                             the slope's t statistic and p value, and the
                             prediction interval of a future year.
    B  DDD x prevalence      packs = N p q m c 365 / D_pack, a bottom-up count
                             of the doses the treated patients take.
    C  penetration curve     the market volume of the molecule times a
                             logistic share  S(j) = S_max / (1 + exp(-k (j -
                             j_half)))  that the product wins j years after
                             launch.

  EVERY SOLD QUANTITY IS  market x share x capacity factor, three named
  terms, so the factor that the reports multiply by without saying so is a
  line of the table and a sentence of the page: an assumption, and the
  quantity it produces is compared with the market it must come from.

  UNITS.  The page asks the scale of the series (units, thousands, millions)
  and of the answer, converts through units, and refuses until both are
  chosen, refuses a series that jumps by an order of magnitude between
  adjacent years (a thousands/millions mix) unless the jump is confirmed,
  and warns when the plant and the forecast differ by two orders.

  THE OUTPUT is the pair the batch plan's economics reads: `rampUp` (the
  fraction of the design production sold in each operating year, each in
  [0, 1]) and the design production in kilograms; the streamFactor stays
  `fromBatchPlan`.  Nothing here is physics.
\*---------------------------------------------------------------------------*/

// ---- scales and units ---------------------------------------------------------

export type Scale = "units" | "thousands" | "millions";
export const SCALE_FACTOR: Readonly<Record<Scale, number>> = {
  units: 1, thousands: 1e3, millions: 1e6,
};
export type SeriesKind = "packs" | "DDD";

// ---- the Student t distribution (for the prediction band) ---------------------

function lgamma(x: number): number {
  // Lanczos approximation, g = 7, n = 9
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0] ?? 0;
  const t = x + 7.5;
  for (let k = 1; k < 9; k++) a += (c[k] ?? 0) / (x + k);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** The regularised incomplete beta function I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b)
    + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Cumulative distribution of Student's t with df degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** The p quantile of Student's t (p in (0.5, 1)), by bisection. */
export function tQuantile(p: number, df: number): number {
  let lo = 0, hi = 1e4;
  for (let it = 0; it < 200; it++) {
    const m = 0.5 * (lo + hi);
    if (tCdf(m, df) < p) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

// ---- the units check ----------------------------------------------------------

export interface UnitsInput {
  values: readonly number[];
  /** the scale the series is written in, or "" while the student has not said */
  seriesScale: Scale | "";
  /** the scale the student wants the answer in, or "" */
  answerScale: Scale | "";
  /** a jump this large between adjacent years is refused unless confirmed */
  jumpConfirmed: boolean;
}

export interface UnitsVerdict {
  /** the page may compute */
  ok: boolean;
  refusals: string[];
}

/** Adjacent-year ratio from which a jump is taken for a unit slip. */
export const JUMP_RATIO = 10;

export function unitsCheck(u: UnitsInput, years: readonly number[]): UnitsVerdict {
  const refusals: string[] = [];
  if (u.seriesScale === "")
    refusals.push("Say what unit the historic series is written in (units, thousands or millions).");
  if (u.answerScale === "")
    refusals.push("Say what unit you want the answer in (units, thousands or millions).");
  if (u.values.some((v) => !Number.isFinite(v) || v <= 0))
    refusals.push("Every value of the series must be a positive number.");
  if (!u.jumpConfirmed) {
    for (let k = 1; k < u.values.length; k++) {
      const a = u.values[k - 1] ?? NaN, b = u.values[k] ?? NaN;
      if (a > 0 && b > 0 && (b / a >= JUMP_RATIO || a / b >= JUMP_RATIO)) {
        refusals.push(`The series jumps from ${a} to ${b} between ${years[k - 1]} and ${years[k]}, `
          + `a factor of ${(b > a ? b / a : a / b).toFixed(1)}: that looks like thousands mixed with `
          + `millions. Correct the series, or confirm the jump is real.`);
        break;
      }
    }
  }
  return { ok: refusals.length === 0, refusals };
}

/** Warnings that do not stop the computation. */
export function scaleWarnings(plantPacks: number, meanForecastPacks: number): string[] {
  const w: string[] = [];
  if (meanForecastPacks > 0 && plantPacks > 0) {
    const r = plantPacks / meanForecastPacks;
    if (r >= 100 || r <= 0.01)
      w.push(`The plant's design production is ${r.toExponential(1)} times the forecast market: `
        + "two orders of magnitude apart is the signature of a thousands/millions slip.");
  }
  return w;
}

// ---- method A: the trend regression -------------------------------------------

export interface Regression {
  n: number;
  df: number;
  intercept: number;
  slope: number;
  tBar: number;
  sxx: number;
  /** standard error of the regression (residual standard deviation) */
  s: number;
  r2: number;
  seSlope: number;
  tSlope: number;
  /** two-sided p value of the slope against zero */
  pSlope: number;
  predict: (t: number) => number;
  /** half width of the (1 - alpha) prediction interval of a new observation at t */
  halfWidth: (t: number, level: number) => number;
}

export function regress(t: readonly number[], y: readonly number[]): Regression | null {
  const n = t.length;
  if (n < 3 || y.length !== n) return null;
  const tBar = t.reduce((a, b) => a + b, 0) / n;
  const yBar = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let k = 0; k < n; k++) {
    const dt = (t[k] ?? 0) - tBar, dy = (y[k] ?? 0) - yBar;
    sxx += dt * dt; sxy += dt * dy; syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx, intercept = yBar - slope * tBar;
  let sse = 0;
  for (let k = 0; k < n; k++) {
    const e = (y[k] ?? 0) - (intercept + slope * (t[k] ?? 0));
    sse += e * e;
  }
  const df = n - 2;
  const s = Math.sqrt(sse / df);
  const seSlope = s / Math.sqrt(sxx);
  const tSlope = seSlope > 0 ? slope / seSlope : Infinity;
  const pSlope = Number.isFinite(tSlope) ? 2 * (1 - tCdf(Math.abs(tSlope), df)) : 0;
  return {
    n, df, intercept, slope, tBar, sxx, s,
    r2: syy > 0 ? 1 - sse / syy : 1, seSlope, tSlope, pSlope,
    predict: (x) => intercept + slope * x,
    halfWidth: (x, level) =>
      tQuantile(1 - (1 - level) / 2, df) * s * Math.sqrt(1 + 1 / n + (x - tBar) ** 2 / sxx),
  };
}

// ---- method B: doses, prevalence and the treatment share ----------------------

export interface DddInputs {
  /** population of the market, persons */
  population: number;
  /** prevalence of the condition (fraction of the population) */
  prevalence: number;
  /** fraction of the prevalent patients who are on drug treatment */
  treated: number;
  /** fraction of the treated patients on this molecule (treatment share) */
  moleculeShare: number;
  /** fraction of days the patient actually takes the dose (adherence) */
  adherence: number;
  /** defined daily doses per day per patient (1 when one DDD is the usual dose) */
  dddPerDay: number;
  /** DDDs in one pack */
  dddPerPack: number;
  /** yearly growth of the treated population */
  growth: number;
}

export interface DddRow { j: number; patients: number; ddd: number; packs: number; }

/** Packs a year, j years after the base year (j = 0 is the base year). */
export function dddPacks(d: DddInputs, j: number): DddRow {
  const patients = d.population * d.prevalence * d.treated * d.moleculeShare
    * Math.pow(1 + d.growth, j);
  const ddd = patients * d.adherence * d.dddPerDay * 365;
  return { j, patients, ddd, packs: ddd / d.dddPerPack };
}

// ---- method C: the penetration curve ------------------------------------------

export interface Penetration {
  /** the share the product ends at */
  sMax: number;
  /** years after launch at which it holds half of sMax */
  jHalf: number;
  /** steepness, 1 / year */
  k: number;
}

/** Share held in operating year j (j = 1 is the first). */
export function penetration(p: Penetration, j: number): number {
  return p.sMax / (1 + Math.exp(-p.k * (j - p.jHalf)));
}

// ---- the three forecasts on one footing ---------------------------------------

export type MethodId = "trend" | "ddd" | "penetration";

export interface ForecastRow {
  /** calendar year */
  year: number;
  /** operating year 1 .. H */
  j: number;
  /** the market volume of the molecule, in units (packs or DDD as the series kind says) */
  market: number;
  /** the share of that market the plant is assumed to hold */
  share: number;
  /** the capacity factor applied */
  factor: number;
  /** sold = market x share x factor */
  sold: number;
  /** sold as a fraction of the whole market (> 1 is more than the market) */
  soldOverMarket: number;
  /** sold as a fraction of the design production, capped at 1 */
  ramp: number;
  /** the market volume exceeded the design production */
  capped: boolean;
  /** lower and upper limits of the market volume (trend only) */
  lo?: number;
  hi?: number;
}

export interface ForecastInputs {
  years: readonly number[];
  /** the historic series in UNITS (already converted through the scale) */
  values: readonly number[];
  kind: SeriesKind;
  dddPerPack: number;
  /** years after the last observation at which the plant starts selling */
  delay: number;
  /** operating years forecast */
  horizon: number;
  /** share of the market the plant holds (methods A and B) */
  share: number;
  /** the capacity factor: an assumption */
  factor: number;
  /** design production, packs per year */
  designPacks: number;
  /** prediction level of the band */
  level: number;
  ddd: DddInputs;
  pen: Penetration;
  /** method C market base: the fitted trend or the last observation held */
  penBase: "trend" | "last";
}

/** Convert a quantity of the series kind to packs. */
const toPacks = (x: number, kind: SeriesKind, dddPerPack: number): number =>
  kind === "DDD" ? x / dddPerPack : x;

export interface Forecast {
  method: MethodId;
  rows: ForecastRow[];
  meanSoldPacks: number;
  meanMarketPacks: number;
  /** design production over the mean forecast sold: the factor that would fill the plant */
  fillFactor: number;
  fit?: Regression;
  notes: string[];
}

export function forecast(method: MethodId, inp: ForecastInputs): Forecast | null {
  const fit = regress(inp.years, inp.values);
  const lastYear = inp.years[inp.years.length - 1] ?? 0;
  const lastObs = inp.values[inp.values.length - 1] ?? 0;
  const notes: string[] = [];
  const rows: ForecastRow[] = [];
  if (method === "trend" && !fit) return null;
  for (let j = 1; j <= inp.horizon; j++) {
    const year = lastYear + inp.delay + j;
    let market = 0, share = inp.share, lo: number | undefined, hi: number | undefined;
    if (method === "trend") {
      const f = fit!;
      const raw = f.predict(year);
      market = toPacks(Math.max(raw, 0), inp.kind, inp.dddPerPack);
      if (raw < 0 && !notes.some((n) => n.startsWith("The fitted line goes below zero")))
        notes.push("The fitted line goes below zero within the horizon; the market is floored at zero.");
      const hw = f.halfWidth(year, inp.level);
      lo = toPacks(Math.max(raw - hw, 0), inp.kind, inp.dddPerPack);
      hi = toPacks(Math.max(raw + hw, 0), inp.kind, inp.dddPerPack);
    } else if (method === "ddd") {
      market = dddPacks(inp.ddd, inp.delay + j).packs;
    } else {
      const base = inp.penBase === "trend" && fit
        ? Math.max(fit.predict(year), 0) : lastObs;
      market = toPacks(base, inp.kind, inp.dddPerPack);
      share = penetration(inp.pen, j);
    }
    const sold = market * share * inp.factor;
    const row: ForecastRow = {
      year, j, market, share, factor: inp.factor, sold,
      soldOverMarket: market > 0 ? sold / market : Infinity,
      ramp: inp.designPacks > 0 ? Math.min(1, sold / inp.designPacks) : 0,
      capped: sold >= inp.designPacks,
    };
    if (lo !== undefined) row.lo = lo;
    if (hi !== undefined) row.hi = hi;
    rows.push(row);
  }
  const mean = (f: (r: ForecastRow) => number) =>
    rows.reduce((a, r) => a + f(r), 0) / Math.max(rows.length, 1);
  const meanSold = mean((r) => r.sold);
  const out: Forecast = {
    method, rows, meanSoldPacks: meanSold, meanMarketPacks: mean((r) => r.market),
    fillFactor: meanSold > 0 ? inp.designPacks / meanSold : Infinity, notes,
  };
  if (fit) out.fit = fit;
  return out;
}

/** Reconcile method B's base year against the last observed year, in packs: B / observed. */
export function dddReconciliation(inp: ForecastInputs): number {
  const lastObs = inp.values[inp.values.length - 1] ?? NaN;
  const obs = toPacks(lastObs, inp.kind, inp.dddPerPack);
  return dddPacks(inp.ddd, 0).packs / obs;
}

// ---- the keys the batch plan's economics reads --------------------------------

export function designKgPerYear(designPacks: number, tabletsPerPack: number, tabletMassG: number): number {
  return designPacks * tabletsPerPack * tabletMassG / 1000;
}

export function pasteBlock(f: Forecast, designPacks: number, tabletsPerPack: number,
  tabletMassG: number, scaleLabel: string, scaleFactor: number): string {
  const x = (v: number, p: number) => v.toFixed(p);
  return [
    "// system/postDict, economics { ... }   (rampUp is the production fraction of each operating year)",
    `rampUp ( ${f.rows.map((r) => x(r.ramp, 4)).join(" ")} );`,
    "// system/postDict, batchPlan { production { ... } }",
    `perYear  ${x(designKgPerYear(designPacks, tabletsPerPack, tabletMassG), 0)} kg;   // = ${x(designPacks / scaleFactor, 3)} ${scaleLabel === "" ? "" : scaleLabel + " "}packs x ${tabletsPerPack} tablets x ${tabletMassG} g`,
    "// system/postDict, economics { ... }",
    "streamFactor fromBatchPlan;",
  ].join("\n");
}
