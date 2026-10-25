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
  sinesPta -- the DATA and the ARITHMETIC behind "Economic appraisal and
  project risk: lessons from the Sines PTA plant" (DEV.md 4c C143), kept
  React-free so every number the page shows can be held by
  tests/sinesPta.test.ts.

  THE CONTENT SOURCE IS ONE RECORD: docs/design/the-sines-pta-plant-appraisal-
  and-project-risk.md.  Every documented figure below carries the short
  source name and page that record uses; nothing here adds a fact the record
  does not carry.  The scope is the record's: economic and pedagogical
  analysis of institutions' documented decisions, without determination of
  individual responsibilities.

  EVERY NUMBER CARRIES ITS STATUS (`Status`): DOCUMENTED (read in a primary
  document, at the page given), ATTRIBUTED (a conclusion or estimate that a
  document states as its own -- the inquiry commission's, the auditor's --
  and that this page repeats as theirs), CALCULATION (this page's own
  arithmetic on documented figures), or ASSUMPTION (a teaching value, or a
  modelling choice, that no document read gives).  And every documented
  figure carries WHEN it is from (`Period`), because information that came
  during construction or afterwards was not available at the decision.

  THE APPRAISAL IS NOT THE BUSINESS PLAN AND NOT A HISTORICAL VALUATION.
  The business plan is not public; no document read gives its conversion
  cost, fixed costs, assumed spread, discount rate or cash flows.  The
  calculator is a SIMPLIFIED, PRE-TAX, UNFINANCED appraisal for teaching: two
  documented quantities (the capacity, the capital of the November 2008
  proposal) and assumptions for the rest, each labelled.

  THE ARITHMETIC, a pre-tax discounted cash flow at t = 0 (the decision):
    * the capital C is spent in N_c equal parts, at the end of construction
      years t = 1 .. N_c (a stated policy, labelled on the page);
    * operating year k = 1 .. N falls at t = N_c + D + k, where D is a delay
      (a delay only SHIFTS the operating years; it adds no cost);
    * production P_k = Q u_1 in year 1 and Q u after (kt/yr);
    * the captive customer takes V_c,k = min(Q_c, P_k) while it buys, and
      nothing after the year it stops; the rest, V_m,k, is sold merchant at
      the spread less a discount d;
    * CF_k = 1e-3 [P_k (S - c_v) - V_m,k d] / X - F   [M EUR]
      (kt x US$/t = 1e3 US$ = 1e-3 M US$; X in US$ per EUR).
  NPV is LINEAR in the spread S, so the break-even spread is exact:
  NPV(S) = NPV(0) + S b, with b = sum_k 1e-3 P_k / X / (1+i)^t_k.
  Taxes, depreciation, working capital, financing and receivables are not
  modelled, and the page says so.
\*---------------------------------------------------------------------------*/

import type { TornadoBar, TornadoFigure } from "../../case/tornado.js";
import { fmtMoney } from "../../case/tornado.js";

// ---- what each number is ---------------------------------------------------

/** documented: read in a primary document at the page given;
 *  attributed: a conclusion or estimate a document states as its own;
 *  calculation: this page's arithmetic on documented figures;
 *  assumption: a teaching value or modelling choice no document gives. */
export type Status = "documented" | "attributed" | "calculation" | "assumption";

export const STATUS_WORD: Record<Status, string> = {
  documented: "documented", attributed: "attributed conclusion",
  calculation: "own calculation", assumption: "assumption",
};

export const STATUS_MEANING: Record<Status, string> = {
  documented: "read in a primary public document, at the page given",
  attributed: "a conclusion or estimate that a document states as its own; "
    + "repeated here as that document's, not as this page's",
  calculation: "this page's own arithmetic on documented figures",
  assumption: "a teaching value or modelling choice that no document read "
    + "gives; change it",
};

/** When a documented fact is from.  The decision is the period up to the
 *  approval of the project-finance structure in November 2008. */
export type Period = "decision" | "construction" | "operation" | "after";

export const PERIOD_WORD: Record<Period, string> = {
  decision: "the decision, 2006-2008",
  construction: "construction and financing, 2009-2011",
  operation: "operation, restructuring and sale, 2012-2017",
  after: "after the sale, 2018-2025",
};

// ---- the appraisal --------------------------------------------------------

export interface Appraisal {
  /** Nominal capacity Q [kt/yr]. */
  capacity: number;
  /** Utilisation u from operating year 2 on [-]. */
  utilisation: number;
  /** Utilisation u_1 in the first operating year [-]. */
  firstYearUtilisation: number;
  /** Volume the captive customer is ASSUMED to take, Q_c [kt/yr]. */
  captive: number;
  /** The captive customer buys in operating years 1 .. this, and nothing
   *  after; 0 means it never stops. */
  captiveStopsAfter: number;
  /** Industry spread S, selling price less raw materials [US$/t]. */
  spread: number;
  /** Conversion cost c_v, variable, beyond the raw materials [US$/t]. */
  conversionCost: number;
  /** Discount d on a merchant tonne (freight, price to win the sale) [US$/t]. */
  merchantDiscount: number;
  /** Exchange rate X [US$ per EUR]. */
  usdPerEur: number;
  /** Fixed costs F [M EUR/yr]. */
  fixedCost: number;
  /** Capital cost C [M EUR]. */
  capex: number;
  /** Planned construction period N_c [yr], integer >= 1. */
  constructionYears: number;
  /** Delay D of the start-up beyond the plan [yr], integer >= 0. */
  delayYears: number;
  /** Discount rate i [-]. */
  discountRate: number;
  /** Operating life N [yr], integer >= 1. */
  life: number;
}

/** An input of the calculator is either documented or an assumption. */
export type InputStatus = Extract<Status, "documented" | "assumption">;

export interface AppraisalInput {
  key: keyof Appraisal;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  status: InputStatus;
  /** Where the default comes from and when that document is from, or why
   *  it is an assumption. */
  basis: string;
}

export const DEFAULT_APPRAISAL: Appraisal = {
  capacity: 700,
  utilisation: 0.9,
  firstYearUtilisation: 0.6,
  captive: 450,
  captiveStopsAfter: 0,
  spread: 200,
  conversionCost: 60,
  merchantDiscount: 30,
  usdPerEur: 1.3,
  fixedCost: 25,
  capex: 425,
  constructionYears: 2,
  delayYears: 0,
  discountRate: 0.08,
  life: 15,
};

export const APPRAISAL_INPUTS: readonly AppraisalInput[] = [
  { key: "capacity", label: "nominal capacity Q", unit: "kt/yr",
    min: 100, max: 1000, step: 10, status: "documented",
    basis: "700 000 t/yr (LSB-2012 p. 29, a 2012 document)" },
  { key: "capex", label: "capital cost C", unit: "M EUR",
    min: 50, max: 1000, step: 5, status: "documented",
    basis: "425, the investment in the project-finance proposal of November "
      + "2008, which excludes its opex (12) and financing costs (97) "
      + "(CPI-2019 p. 309): the perimeter of an unfinanced appraisal.  Other "
      + "documents state other figures with other perimeters (see the table)" },
  { key: "firstYearUtilisation", label: "utilisation in the first year u_1",
    unit: "-", min: 0, max: 1, step: 0.05, status: "assumption",
    basis: "a teaching value; in 2012 LSB wrote that nominal capacity was "
      + "expected in the second year of production (LSB-2012 p. 44)" },
  { key: "utilisation", label: "utilisation from year 2 u", unit: "-",
    min: 0, max: 1, step: 0.05, status: "assumption",
    basis: "a teaching value" },
  { key: "captive", label: "volume the captive customer buys Q_c", unit: "kt/yr",
    min: 0, max: 1000, step: 10, status: "assumption",
    basis: "the model ASSUMES the customer buys the contract's maximum every "
      + "year.  The 2010 contract set an annual quantity, by written offer, of "
      + "up to 450 000 t/yr while LSB was a shareholder (LSB-2012 pp. 29, 183; "
      + "LSB-2014 pp. 122-123): a maximum, not a guaranteed purchase.  At the 2008 "
      + "decision the plan assumed the whole output (CPI-2019 p. 288); set "
      + "700 to see that case" },
  { key: "captiveStopsAfter", label: "captive customer stops buying after "
      + "operating year (0 = never)", unit: "yr",
    min: 0, max: 30, step: 1, status: "assumption",
    basis: "a downside case you set.  Later information: the customer filed "
      + "for insolvency in June 2013, about fifteen months after PTA "
      + "production began (LSB-2014 p. 8)" },
  { key: "spread", label: "industry spread S", unit: "US$/t",
    min: 0, max: 400, step: 1, status: "assumption",
    basis: "a teaching value.  No spread available at the 2007-2008 "
      + "decision was found in the documents read; the published figures in "
      + "the chart are from reports of 2015-2018 and serve only as "
      + "retrospective scenarios" },
  { key: "conversionCost", label: "conversion cost c_v (beyond raw materials)",
    unit: "US$/t", min: 0, max: 300, step: 5, status: "assumption",
    basis: "a teaching value" },
  { key: "merchantDiscount", label: "discount on a merchant tonne d",
    unit: "US$/t", min: 0, max: 200, step: 5, status: "assumption",
    basis: "a teaching value" },
  { key: "usdPerEur", label: "exchange rate X", unit: "US$/EUR",
    min: 0.8, max: 2, step: 0.01, status: "assumption",
    basis: "a teaching value" },
  { key: "fixedCost", label: "fixed costs F", unit: "M EUR/yr",
    min: 0, max: 200, step: 1, status: "assumption",
    basis: "a teaching value" },
  { key: "constructionYears", label: "planned construction N_c", unit: "yr",
    min: 1, max: 6, step: 1, status: "assumption",
    basis: "a modelling choice on documented dates: construction to start in "
      + "the first half of 2008 (CPI-2019 p. 303), end planned for 2010 "
      + "(CPI-2019 p. 310)" },
  { key: "delayYears", label: "delay of the start-up D", unit: "yr",
    min: 0, max: 5, step: 1, status: "assumption",
    basis: "a scenario you set.  In this model a delay only shifts the "
      + "operating years: it adds no cost unless you add one.  Later "
      + "information: PTA production began in March 2012 (CPI-2019 p. 320)" },
  { key: "discountRate", label: "discount rate i", unit: "-",
    min: 0, max: 0.3, step: 0.005, status: "assumption",
    basis: "a teaching value" },
  { key: "life", label: "operating life N", unit: "yr",
    min: 1, max: 40, step: 1, status: "assumption",
    basis: "a teaching value; the financing maturity was to be up to 15 "
      + "years (CPI-2019 pp. 301, 310)" },
];

/** The notice that sits beside every result of the calculator. */
export const SCENARIO_NOTICE = "Illustrative teaching scenario — not an "
  + "estimate of the historical project's NPV.  Results depend on the "
  + "assumptions selected below.";

export interface AppraisalYear {
  /** Operating year k (1-based) and its time on the decision clock. */
  k: number;
  t: number;
  production: number;
  captiveVolume: number;
  merchantVolume: number;
  /** Cash flow CF_k [M EUR]. */
  cashFlow: number;
  discountFactor: number;
}

export interface AppraisalResult {
  years: AppraisalYear[];
  /** Present value of the capital [M EUR], a positive number. */
  pvCapex: number;
  /** Present value of the operating cash flows [M EUR]. */
  pvOperating: number;
  npv: number;
  /** Merchant share of the first full year (year 2, or year 1 if N = 1). */
  merchantShare: number;
}

const df = (i: number, t: number): number => Math.pow(1 + i, -t);

function intOf(v: number, lo: number): number {
  return Math.max(lo, Math.round(v));
}

export function appraise(a: Appraisal): AppraisalResult {
  const Nc = intOf(a.constructionYears, 1);
  const D = intOf(a.delayYears, 0);
  const N = intOf(a.life, 1);
  const stop = intOf(a.captiveStopsAfter, 0);
  let pvCapex = 0;
  for (let j = 1; j <= Nc; j++) pvCapex += (a.capex / Nc) * df(a.discountRate, j);
  const years: AppraisalYear[] = [];
  let pvOperating = 0;
  for (let k = 1; k <= N; k++) {
    const t = Nc + D + k;
    const production = a.capacity * (k === 1 ? a.firstYearUtilisation : a.utilisation);
    const buys = stop === 0 || k <= stop;
    const captiveVolume = buys ? Math.min(Math.max(a.captive, 0), production) : 0;
    const merchantVolume = production - captiveVolume;
    const cashFlow = 1e-3 * (production * (a.spread - a.conversionCost)
      - merchantVolume * a.merchantDiscount) / a.usdPerEur - a.fixedCost;
    const discountFactor = df(a.discountRate, t);
    pvOperating += cashFlow * discountFactor;
    years.push({ k, t, production, captiveVolume, merchantVolume, cashFlow,
      discountFactor });
  }
  const ref = years[Math.min(1, years.length - 1)]!;
  const merchantShare = ref.production > 0 ? ref.merchantVolume / ref.production : 0;
  return { years, pvCapex, pvOperating, npv: pvOperating - pvCapex, merchantShare };
}

/** dNPV/dS [M EUR per US$/t]: the slope of the line NPV(S). */
export function npvSlopeInSpread(a: Appraisal): number {
  return appraise(a).years.reduce(
    (s, y) => s + 1e-3 * y.production / a.usdPerEur * y.discountFactor, 0);
}

/** The constant spread at which NPV = 0 [US$/t] -- exact, because NPV is
 *  linear in S.  NaN when nothing is produced (the line is flat). */
export function breakEvenSpread(a: Appraisal): number {
  const b = npvSlopeInSpread(a);
  if (!(b > 0)) return NaN;
  const npv0 = appraise({ ...a, spread: 0 }).npv;
  return -npv0 / b;
}

/** NPV(S) on [sLo, sHi], n points. */
export function npvCurve(a: Appraisal, sLo: number, sHi: number, n = 61):
  { s: number[]; npv: number[] } {
  const s: number[] = [];
  const npv: number[] = [];
  for (let q = 0; q < n; q++) {
    const v = sLo + (sHi - sLo) * q / (n - 1);
    s.push(v);
    npv.push(appraise({ ...a, spread: v }).npv);
  }
  return { s, npv };
}

/** Merchant share at a given production: the part the captive volume does
 *  not take, 1 - min(Q_c, P)/P. */
export function merchantShareAt(production: number, captive: number): number {
  if (!(production > 0)) return 0;
  return 1 - Math.min(Math.max(captive, 0), production) / production;
}

// ---- the tornado ----------------------------------------------------------

export interface TornadoRange {
  key: keyof Appraisal;
  label: string;
  low: number;
  high: number;
  /** How the ends are written on the bars. */
  text: (v: number) => string;
  /** What the two ends are. */
  basis: string;
}

const pctText = (v: number): string => `${(100 * v).toFixed(0)} %`;

/** One input moved at a time, every other at the student's value. */
export const TORNADO_RANGES: readonly TornadoRange[] = [
  { key: "spread", label: "spread S", low: 87, high: 231,
    text: (v) => `${v} US$/t`,
    basis: "retrospective scenarios, not available at the decision: IVL's "
      + "industry spreads for 2014, Asia 87 and West (a 50:50 North America : "
      + "Europe index, not the Sines plant's own) 231 (IVL-AR2015)" },
  { key: "capex", label: "capital cost C", low: 360, high: 462.056,
    text: (v) => `${v} M EUR`,
    basis: "the lowest and highest capital figures the documents state, of "
      + "different perimeters (EC-2007; LSB-2012 p. 28); not a measure of "
      + "overrun" },
  { key: "captiveStopsAfter", label: "captive customer", low: 2, high: 0,
    text: (v) => (v === 0 ? "never stops" : `stops after year ${v}`),
    basis: "a downside case (assumption)" },
  { key: "delayYears", label: "start-up delay D", low: 0, high: 2,
    text: (v) => `${v} yr`,
    basis: "a scenario (assumption); the delay only shifts the operating "
      + "years" },
  { key: "utilisation", label: "utilisation u", low: 0.7, high: 1.0,
    text: pctText, basis: "assumption" },
  { key: "usdPerEur", label: "exchange rate X", low: 1.1, high: 1.5,
    text: (v) => `${v.toFixed(2)} US$/EUR`, basis: "assumption" },
  { key: "conversionCost", label: "conversion cost c_v", low: 42, high: 78,
    text: (v) => `${v} US$/t`, basis: "the default -30 % / +30 % (assumption)" },
  { key: "fixedCost", label: "fixed costs F", low: 17.5, high: 32.5,
    text: (v) => `${v} M EUR/yr`, basis: "the default -30 % / +30 % (assumption)" },
  { key: "merchantDiscount", label: "merchant discount d", low: 0, high: 60,
    text: (v) => `${v} US$/t`, basis: "assumption" },
  { key: "discountRate", label: "discount rate i", low: 0.06, high: 0.12,
    text: pctText, basis: "assumption" },
];

export const TORNADO_CAVEAT = "One input moved at a time, every other at the "
  + "value set in the inputs.  A sensitivity, NOT an uncertainty analysis: the ends "
  + "are not equally likely and the inputs are not independent.  An "
  + "illustrative teaching scenario, not an estimate of the historical "
  + "project.";

/** The tornado as the shared TornadoPlot draws it (case/tornado.ts), in the
 *  order of the swing, largest first. NPVs in EUR, as that plot formats. */
export function tornadoFigure(a: Appraisal,
  ranges: readonly TornadoRange[] = TORNADO_RANGES): TornadoFigure {
  const M = 1e6;
  const base = appraise(a).npv * M;
  const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const bars: TornadoBar[] = ranges.map((r) => {
    const npvLow = appraise({ ...a, [r.key]: r.low }).npv * M;
    const npvHigh = appraise({ ...a, [r.key]: r.high }).npv * M;
    const flipLow = sign(npvLow) !== sign(base);
    const flipHigh = sign(npvHigh) !== sign(base);
    const signFlip = flipLow && flipHigh ? "both" : flipLow ? "low" : flipHigh ? "high" : "";
    return {
      input: r.label,
      axisLabel: signFlip ? `${r.label} (NPV sign flips)` : r.label,
      lowValueText: r.text(r.low),
      highValueText: r.text(r.high),
      npvLow, npvHigh,
      dLow: npvLow - base, dHigh: npvHigh - base,
      swing: Math.abs(npvHigh - npvLow),
      signFlip,
    };
  });
  bars.sort((p, q) => q.swing - p.swing);
  return { baseNPV: base, currency: "EUR", caveat: TORNADO_CAVEAT, bars };
}

export { fmtMoney };

// ---- the documented facts the page draws ----------------------------------

export interface Sourced { source: string; status: Status }

/** The capital cost, as each document stated it, with its perimeter
 *  (record §3).  Values of DIFFERENT perimeters: never compared as a ratio. */
export interface CapexRow extends Sourced {
  when: string; period: Period; perimeter: string; value: number;
}

export const CAPEX_HISTORY: readonly CapexRow[] = [
  { when: "Jul 2007", period: "decision", value: 360,
    perimeter: "total costs of the new investment, approximately (a state-aid "
      + "press release)", source: "EC-2007", status: "documented" },
  { when: "undated", period: "decision", value: 400,
    perimeter: "budgeted investment, approximately", source: "CPI-2019 p. 288",
    status: "documented" },
  { when: "Jan 2008", period: "decision", value: 420,
    perimeter: "total investment of the project-finance offer, with 27 % "
      + "equity", source: "CPI-2019 p. 301", status: "documented" },
  { when: "Jan 2008", period: "decision", value: 380,
    perimeter: "investment in the industrial unit, as the bridge-loan "
      + "proposal stated it", source: "CPI-2019 pp. 302-303", status: "documented" },
  { when: "Nov 2008", period: "decision", value: 425,
    perimeter: "investment only; with opex (12) and financing costs (97) the "
      + "uses of funds were 534", source: "CPI-2019 p. 309", status: "documented" },
  { when: "2012", period: "operation", value: 440,
    perimeter: "estimated total cost of the project", source: "LSB-2012 p. 29",
    status: "documented" },
  { when: "2012", period: "operation", value: 462.056,
    perimeter: "gross investments in progress of the plant company, as the "
      + "shareholder's registration document listed them", source: "LSB-2012 p. 28",
    status: "documented" },
];

/** Published industry spreads, US$/t (record §5).  Every row is LATER
 *  information: the first was published in IVL's report for 2014. */
export interface SpreadRow extends Sourced {
  year: string; asia: number; west: number | null; published: string;
}

export const PUBLISHED_SPREADS: readonly SpreadRow[] = [
  { year: "5-yr simple avg to 2014", asia: 163, west: null,
    published: "annual report 2014", source: "IVL-AR2014 PDF p. 94", status: "documented" },
  { year: "2014", asia: 87, west: 231, published: "annual report 2015",
    source: "IVL-AR2015 PDF p. 98", status: "documented" },
  { year: "2015", asia: 95, west: 214, published: "annual report 2015",
    source: "IVL-AR2015 PDF p. 98", status: "documented" },
  { year: "2016", asia: 97, west: 213, published: "annual report 2016",
    source: "IVL-AR2016 PDF p. 104", status: "documented" },
  { year: "2017", asia: 104, west: 223, published: "annual report 2017",
    source: "IVL-AR2017 PDF p. 110", status: "documented" },
];

/** The offtake figures (record §4). */
export const OFFTAKE = {
  capacity: 700, contract: 450, need: 470, petCapacity: 560, ptaPerPet: 0.85,
} as const;

/** The rows of the offtake table, each with its status and period. */
export interface OfftakeRow extends Sourced { quantity: string; value: string; period: Period | null; }

export function offtakeRows(): OfftakeRow[] {
  const pct = (v: number) => `${(100 * v).toFixed(1)} %`;
  return [
    { quantity: "nominal capacity of the plant", value: `${OFFTAKE.capacity}`,
      period: "operation", source: "LSB-2012 p. 29", status: "documented" },
    { quantity: "what the plan assumed the shareholder would buy",
      value: "the whole output", period: "decision", source: "CPI-2019 p. 288",
      status: "documented" },
    { quantity: "the contract's MAXIMUM: an annual quantity set by written "
        + "offer, while LSB was a shareholder", value: `up to ${OFFTAKE.contract}`,
      period: "construction", source: "LSB-2012 pp. 29, 183; LSB-2014 pp. 122-123",
      status: "documented" },
    { quantity: `what LSB's PET plants (${OFFTAKE.petCapacity} kt/yr) needed`,
      value: `${OFFTAKE.need}`, period: "operation", source: "LSB-2012 p. 37",
      status: "documented" },
    { quantity: "share of nominal capacity NOT covered by the contract's "
        + "maximum: 1 - 450/700", value: pct(merchantShareAt(OFFTAKE.capacity, OFFTAKE.contract)),
      period: null, source: "this page's arithmetic", status: "calculation" },
    { quantity: "the same against LSB's whole need: 1 - 470/700",
      value: pct(merchantShareAt(OFFTAKE.capacity, OFFTAKE.need)),
      period: null, source: "this page's arithmetic", status: "calculation" },
  ];
}

/** The loss and price metrics, each defined; they OVERLAP and are never
 *  added (record §8).  `kind` says what sort of number each one is. */
export interface LossMetric extends Sourced {
  metric: string; kind: string; definition: string; value: string;
}

export const LOSS_METRICS: readonly LossMetric[] = [
  { metric: "Facilities contracted", kind: "a credit commitment",
    definition: "the four project-finance facilities approved in January 2010",
    value: "EUR 381 M", source: "CPI-2019 p. 318; EY-final p. 29", status: "documented" },
  { metric: "Exposure submitted to the PER", kind: "an amount owed",
    definition: "what the CGD group was owed by the plant company in September "
      + "2014, by facility",
    value: "EUR 520 M", source: "CPI-2019 p. 319", status: "documented" },
  { metric: "Exposure after restructuring", kind: "an amount owed",
    definition: "the exposure at 2015, after the revitalisation process",
    value: "EUR 351 M", source: "EY-final pp. 29, 115", status: "documented" },
  { metric: "Accumulated impairment", kind: "an accounting impairment",
    definition: "the part of that exposure recognised in the accounts as "
      + "impaired by 2015; an impairment is a recognised expected loss, not a "
      + "realised one",
    value: "EUR 211 M (60 %)", source: "EY-final p. 29; CPI-2019 p. 322",
    status: "documented" },
  { metric: "Gross involvement", kind: "the commission's aggregate",
    definition: "equity holdings plus financing in LSB and the plant company "
      + "together, over the whole period, as the inquiry commission summed them",
    value: "about EUR 900 M", source: "CPI-2019 p. 322", status: "attributed" },
  { metric: "The inquiry commission's loss estimate", kind: "the commission's estimate",
    definition: "the parliamentary inquiry commission's own estimate of the "
      + "losses on the bank's whole involvement in the project",
    value: "at least EUR 400 M", source: "CPI-2019 p. 323", status: "attributed" },
  { metric: "Result on the LSB shareholding", kind: "realised loss plus impairment",
    definition: "on the bank's shares in LSB to 2015: realised losses of EUR "
      + "78.5 M plus an impairment of EUR 52.8 M; credit impairments not included",
    value: "-EUR 131.4 M", source: "EY-final p. 189", status: "documented" },
  { metric: "Price of the plant's assets", kind: "an asset price",
    definition: "what the buyer paid in November 2017 for the plant company's "
      + "assets (the assets were bought, not the company's shares)",
    value: "EUR 28 M", source: "CPI-2019 p. 322; IVL-AR2017 PDF p. 224",
    status: "documented" },
  { metric: "The buyer's consideration, with the utility", kind: "an asset price",
    definition: "the same PTA assets together with the adjacent utility's "
      + "assets, in the buyer's own accounts; neither document gives the split",
    value: "EUR 42.5 M", source: "IVL-AR2017 PDF p. 224", status: "documented" },
  { metric: "Price of the buyer's Portuguese subsidiary, 2025", kind: "a share price",
    definition: "100 % of the quotas of the subsidiary through which the "
      + "buyer had bought the plant's assets in 2017, sold with the purchaser assuming its future "
      + "obligations, after its assets had been impaired in 2024",
    value: "EUR 100 000", source: "IVL-SET-2025; IVL-AR2017 PDF p. 224",
    status: "documented" },
];

export interface TimelineRow extends Sourced { when: string; period: Period; event: string; }

const TIMELINE_ROWS: readonly Omit<TimelineRow, "status">[] = [
  { when: "Oct 2006", period: "decision", event: "The plant company is "
      + "constituted (18 ha, Sines petrochemical area)", source: "CPI-2019 p. 287" },
  { when: "Jan 2008", period: "decision", event: "A project-finance offer is "
      + "approved, conditional on favourable market conditions, internal credit "
      + "approvals and technical, legal and audit due diligence; the risk "
      + "department's opinion on a first bridge loan is unfavourable (18 Jan), "
      + "then conditional, with conditions (29 Jan)",
    source: "CPI-2019 pp. 301-304" },
  { when: "Nov 2008", period: "decision", event: "The project-finance "
      + "structure is approved, with the bank to underwrite 100 % pending a "
      + "syndicate; the risk department's opinion lists risks and conditions",
    source: "CPI-2019 pp. 308-313" },
  { when: "2008-2010", period: "construction", event: "Construction financed by "
      + "five bridge loans (EUR 117 M by Mar 2009, 222 M by Jan 2010) while the "
      + "project finance and its due diligences were completed",
    source: "CPI-2019 pp. 316-317, 322" },
  { when: "Jan 2010", period: "construction", event: "Facility agreement signed "
      + "(22 Jan); project-finance facilities of EUR 381 M approved (28 Jan); "
      + "the planned syndicate did not materialise",
    source: "CPI-2019 pp. 309, 317-318" },
  { when: "Aug-Sep 2010", period: "construction", event: "Supply contract: LSB "
      + "to buy an annual quantity, set by written offer, of up to 450 kt/yr at "
      + "market-indexed prices to 2030; a EUR 55 M capital increase reduces "
      + "LSB's holding to 41 %, and the bank's venture fund takes 19 %",
    source: "LSB-2012 pp. 29, 183; LSB-2014 pp. 122-123; CPI-2019 p. 318" },
  { when: "21 Dec 2011", period: "construction", event: "Production activities start",
    source: "CPI-2019 p. 320" },
  { when: "Mar 2012", period: "operation", event: "PTA production; in "
      + "operation from 30 March", source: "CPI-2019 p. 320; LSB-2012 p. 37" },
  { when: "17 Apr-4 May 2012", period: "operation", event: "Stopped for "
      + "technical problems", source: "CPI-2019 p. 320" },
  { when: "Jun-Jul 2013", period: "operation", event: "LSB, the captive "
      + "customer, files for voluntary insolvency (17 Jun); a Barcelona "
      + "commercial court declares it (4 Jul)", source: "LSB-2014 pp. 8-9" },
  { when: "9 Oct 2013", period: "operation", event: "Production stops again "
      + "for lack of raw material (paraxylene)", source: "CPI-2019 p. 321" },
  { when: "2013", period: "operation", event: "LSB books a provision of EUR "
      + "43.061 M against a claim by the plant company under the supply contract",
    source: "LSB-2014 p. 122" },
  { when: "2013 / 2014", period: "operation", event: "Net loss of the plant "
      + "company: EUR 150.457 M / EUR 51.470 M", source: "LSB-2014 p. 69" },
  { when: "29 Jan 2014", period: "operation", event: "LSB's liquidation phase "
      + "opens", source: "LSB-2014 p. 10" },
  { when: "2014", period: "operation", event: "EUR 50 M of receivables on LSB "
      + "for PTA sold and not paid", source: "CPI-2019 p. 321" },
  { when: "4 Aug 2014", period: "operation", event: "The plant company enters "
      + "a special revitalisation process (PER); EUR 520 M of the bank group's "
      + "exposure is submitted to it", source: "LSB-2014 p. 13; CPI-2019 p. 319" },
  { when: "2015", period: "operation", event: "The PER's refinancing agreement "
      + "is approved by the court; exposure EUR 351 M, of which EUR 211 M impaired",
    source: "LSB-2014 p. 13; CPI-2019 pp. 319, 322; EY-final p. 29" },
  { when: "Jun 2016", period: "operation", event: "A sale process is mandated",
    source: "CPI-2019 p. 321" },
  { when: "Nov 2017", period: "operation", event: "Indorama Ventures acquires "
      + "the plant's assets for EUR 28 M (the buyer's accounts: EUR 42.5 M "
      + "with the adjacent utility's assets)",
    source: "CPI-2019 p. 322; IVL-AR2017 PDF p. 224" },
  { when: "about 2023", period: "after", event: "The plant ceases operation",
    source: "IVL-SET-2025" },
  { when: "2024", period: "after", event: "The buyer impairs its subsidiary's "
      + "assets", source: "IVL-SET-2025" },
  { when: "11 Apr 2025", period: "after", event: "The buyer sells its "
      + "Portuguese PTA subsidiary for EUR 100 000, the purchaser assuming its "
      + "future obligations; the reasons it states include competition from "
      + "low-cost PTA imports", source: "IVL-SET-2025" },
];

/** Every timeline row is documented. */
export const TIMELINE: readonly TimelineRow[] =
  TIMELINE_ROWS.map((r) => ({ ...r, status: "documented" as const }));

/** The sources, as the record's §1 defines them: what each document IS, and
 *  where the public can read it. */
export interface SourceRow { short: string; cite: string; nature: string; url: string; }

export const SOURCES: readonly SourceRow[] = [
  { short: "CPI-2019", cite: "Assembleia da República, II Comissão Parlamentar "
      + "de Inquérito à Recapitalização da Caixa Geral de Depósitos e à "
      + "Gestão do Banco, Relatório Final, July 2019 (§3.5.4, pp. 286-323)",
    nature: "the final report of a parliamentary inquiry commission: its "
      + "findings and conclusions are the commission's, drawn from documents "
      + "and hearings; it is not a court decision",
    url: "https://app.parlamento.pt/webutils/docs/doc.pdf?path=6148523063446f764c324679626d56304c334e706447567a4c31684a53556c4d5a5763765130394e4c306c4a5131424a556b4e48524564434c30467963585670646d39446232317063334e68627939535a577868644d4f7a636d6c76637938794a5449774c5355794d464a6c6247463077374e796157386c4d6a424761573568624355794d43306c4d6a424a535355794d454e5153564a4452305248516935775a47593d&fich=2+-+Relat%C3%B3rio+Final+-+II+CPIRCGDGB.pdf&Inline=true" },
  { short: "EY-final", cite: "EY, Caixa Geral de Depósitos: Auditoria "
      + "Independente aos Atos de Gestão praticados entre 2000 e 2015, 26 June "
      + "2018 (the redacted copy for the Assembleia da República, 31 January "
      + "2019; the plant company is borrower C001)",
    nature: "an audit of management acts commissioned by the bank; by its own "
      + "statement not an audit of financial statements, and based on the "
      + "information the bank made available.  The copy read is the one "
      + "published by the newspaper Observador; no copy on an official site "
      + "was located",
    url: "https://s3.observador.pt/wp-content/uploads/2019/02/01184552/relatorioauditoriafinalcgd2.pdf" },
  { short: "LSB-2012", cite: "La Seda de Barcelona, S.A., Documento de Registro "
      + "de Acciones, CNMV, 12 June 2012",
    nature: "a share-registration document filed by the plant's shareholder "
      + "with the Spanish securities regulator: the issuer's own statements",
    url: "https://www.cnmv.es/webservices/verdocumento/ver?e=yrtC2NtJnVAymJkZo7WHHSJs3cK80xVpwaYndxidzOsOt0h97PRqpgpiEhvAbqfG" },
  { short: "LSB-2014", cite: "La Seda de Barcelona, S.A., en liquidación, "
      + "Memoria de las cuentas anuales consolidadas del ejercicio 2014",
    nature: "the notes to the consolidated annual accounts of a company in "
      + "liquidation; they report, among other things, the court's insolvency "
      + "orders.  The copy read is held by a university repository of annual "
      + "reports",
    url: "https://ddd.uab.cat/pub/infanu/89477/iaLSBa2014ispa.pdf" },
  { short: "IVL-AR2012 ... AR2017", cite: "Indorama Ventures PCL, Annual "
      + "Reports 2012-2017 (PDF pages)",
    nature: "the annual reports of the company that later bought the plant: "
      + "its own statements about the market and its own accounts",
    url: "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2015-en.pdf" },
  { short: "IVL-SET-2025", cite: "Indorama Ventures PCL, notices IVL001/04/2025 "
      + "to the Stock Exchange of Thailand, 16 April 2025",
    nature: "a listed company's notices to its stock exchange",
    url: "https://hub.optiwise.io/en/documents/160007/download" },
  { short: "EC-2007", cite: "European Commission, press release IP/07/1067, "
      + "11 July 2007",
    nature: "a press release announcing a state-aid decision",
    url: "https://ec.europa.eu/commission/presscorner/detail/en/ip_07_1067" },
  { short: "USITC-4604", cite: "U.S. International Trade Commission, PET Resin "
      + "from Canada, China, India, and Oman, Publication 4604, April 2016",
    nature: "a US agency's investigation report on the PET resin market",
    url: "https://usitc.gov/publications/safeguards/pub4604.pdf" },
];

/** The annual-report files of IVL, one per year, as the copies read were
 *  served. */
export const IVL_REPORT_URLS: Readonly<Record<string, string>> = {
  "IVL-AR2012": "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2012-en.pdf",
  "IVL-AR2013": "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2013-en.pdf",
  "IVL-AR2014": "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2014-en.pdf",
  "IVL-AR2015": "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2015-en.pdf",
  "IVL-AR2016": "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2016-en.pdf",
  "IVL-AR2017": "https://hub.optiwise.io/storage/5/annual-report/ivl-ar2017-en.pdf",
};
