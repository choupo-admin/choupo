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
  sinesPta -- the DATA and the ARITHMETIC behind "A negative case: the Sines
  PTA plant" (DEV.md 4c C143), kept React-free so every number the page
  shows can be held by tests/sinesPta.test.ts.

  THE CONTENT SOURCE IS ONE RECORD: docs/design/the-sines-pta-plant-a-
  negative-case.md.  Every documented figure below carries the short source
  name and page that record uses; nothing here adds a fact the record does
  not carry.  Vitor's scope ruling (2026-10-24, "Deixa a politica de fora")
  binds this file as it binds the record: institutions only, no persons, no
  motives.

  THE APPRAISAL IS NOT THE BUSINESS PLAN.  No document read gives the plan's
  conversion cost, fixed costs, assumed spread, discount rate or cash flows.
  The calculator is the analysis a student should have done: the documented
  quantities where documents give them, SYNTHETIC teaching values where they
  do not, and every input says which (`APPRAISAL_INPUTS[].status`).

  THE ARITHMETIC, a pre-tax discounted cash flow at t = 0 (the decision):
    * the capital C is spent in N_c equal parts, at the end of construction
      years t = 1 .. N_c (a stated policy, labelled on the page);
    * operating year k = 1 .. N falls at t = N_c + D + k, where D is a delay;
    * production P_k = Q u_1 in year 1 and Q u after (kt/yr);
    * the captive customer takes V_c,k = min(Q_c, P_k) while it buys, and
      nothing after the year it stops; the rest, V_m,k, is sold merchant at
      the spread less a discount d;
    * CF_k = 1e-3 [P_k (S - c_v) - V_m,k d] / X - F   [M EUR]
      (kt x US$/t = 1e3 US$ = 1e-3 M US$; X in US$ per EUR).
  NPV is LINEAR in the spread S, so the break-even spread is exact:
  NPV(S) = NPV(0) + S b, with b = sum_k 1e-3 P_k / X / (1+i)^t_k.
  Taxes, depreciation, working capital, debt service and receivables are
  not modelled, and the page says so.
\*---------------------------------------------------------------------------*/

import type { TornadoBar, TornadoFigure } from "../../case/tornado.js";
import { fmtMoney } from "../../case/tornado.js";

// ---- the appraisal --------------------------------------------------------

export interface Appraisal {
  /** Nominal capacity Q [kt/yr]. */
  capacity: number;
  /** Utilisation u from operating year 2 on [-]. */
  utilisation: number;
  /** Utilisation u_1 in the first operating year [-]. */
  firstYearUtilisation: number;
  /** Volume the captive customer contracted to take, Q_c [kt/yr]. */
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

/** documented: read in a primary document (the record says where);
 *  published: a published market figure; synthetic: a teaching value. */
export type InputStatus = "documented" | "published" | "synthetic";

export interface AppraisalInput {
  key: keyof Appraisal;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  status: InputStatus;
  /** Where the default comes from, or why it is synthetic. */
  basis: string;
}

export const DEFAULT_APPRAISAL: Appraisal = {
  capacity: 700,
  utilisation: 0.9,
  firstYearUtilisation: 0.6,
  captive: 450,
  captiveStopsAfter: 0,
  spread: 163,
  conversionCost: 60,
  merchantDiscount: 30,
  usdPerEur: 1.3,
  fixedCost: 25,
  capex: 440,
  constructionYears: 2,
  delayYears: 0,
  discountRate: 0.08,
  life: 15,
};

export const APPRAISAL_INPUTS: readonly AppraisalInput[] = [
  { key: "capacity", label: "nominal capacity Q", unit: "kt/yr",
    min: 100, max: 1000, step: 10, status: "documented",
    basis: "700 000 t/yr (LSB-2012 p. 29)" },
  { key: "firstYearUtilisation", label: "utilisation in the first year u_1",
    unit: "-", min: 0, max: 1, step: 0.05, status: "synthetic",
    basis: "synthetic teaching value; the plan expected nominal capacity in "
      + "the second year of production (LSB-2012 p. 44)" },
  { key: "utilisation", label: "utilisation from year 2 u", unit: "-",
    min: 0, max: 1, step: 0.05, status: "synthetic",
    basis: "synthetic teaching value" },
  { key: "captive", label: "captive contract Q_c", unit: "kt/yr",
    min: 0, max: 1000, step: 10, status: "documented",
    basis: "up to 450 000 t/yr, market-indexed, no explicit penalty "
      + "(LSB-2012 p. 29; LSB-2014 pp. 122-123)" },
  { key: "captiveStopsAfter", label: "captive customer stops buying after "
      + "operating year (0 = never)", unit: "yr",
    min: 0, max: 30, step: 1, status: "synthetic",
    basis: "a downside case you set; the documented customer was declared "
      + "insolvent about a year and a quarter after start-up "
      + "(LSB-2014 p. 9)" },
  { key: "spread", label: "industry spread S", unit: "US$/t",
    min: 0, max: 400, step: 1, status: "published",
    basis: "163: IVL's five-year simple average for Asian PTA to 2014 "
      + "(IVL-AR2014); 87 Asia and 231 West in 2014 (IVL-AR2015)" },
  { key: "conversionCost", label: "conversion cost c_v (beyond raw materials)",
    unit: "US$/t", min: 0, max: 300, step: 5, status: "synthetic",
    basis: "synthetic teaching value" },
  { key: "merchantDiscount", label: "discount on a merchant tonne d",
    unit: "US$/t", min: 0, max: 200, step: 5, status: "synthetic",
    basis: "synthetic teaching value" },
  { key: "usdPerEur", label: "exchange rate X", unit: "US$/EUR",
    min: 0.8, max: 2, step: 0.01, status: "synthetic",
    basis: "you set it; synthetic default" },
  { key: "fixedCost", label: "fixed costs F", unit: "M EUR/yr",
    min: 0, max: 200, step: 1, status: "synthetic",
    basis: "synthetic teaching value" },
  { key: "capex", label: "capital cost C", unit: "M EUR",
    min: 50, max: 1000, step: 5, status: "documented",
    basis: "440, the total project cost stated in 2012 (LSB-2012 p. 29); the "
      + "documents range from about 360 (EC-2007) to 462.056 (LSB-2012 p. 28)" },
  { key: "constructionYears", label: "planned construction N_c", unit: "yr",
    min: 1, max: 6, step: 1, status: "documented",
    basis: "construction from 2008, end planned for 2010 (CPI-2019 p. 310)" },
  { key: "delayYears", label: "delay of the start-up D", unit: "yr",
    min: 0, max: 5, step: 1, status: "synthetic",
    basis: "you set it; PTA production came in March 2012 "
      + "(CPI-2019 p. 320) against an end of construction planned for 2010" },
  { key: "discountRate", label: "discount rate i", unit: "-",
    min: 0, max: 0.3, step: 0.005, status: "synthetic",
    basis: "synthetic teaching value" },
  { key: "life", label: "operating life N", unit: "yr",
    min: 1, max: 40, step: 1, status: "synthetic",
    basis: "synthetic; the financing maturity was up to 15 years "
      + "(CPI-2019 p. 310)" },
];

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

/** The spread at which NPV = 0 [US$/t] -- exact, because NPV is linear in S.
 *  NaN when nothing is produced (the line is flat). */
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

/** Merchant share at a given production: the part the captive contract
 *  does not take, 1 - min(Q_c, P)/P. */
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
  status: InputStatus;
  basis: string;
}

const pctText = (v: number): string => `${(100 * v).toFixed(0)} %`;

/** One input moved at a time, every other at the student's value. */
export const TORNADO_RANGES: readonly TornadoRange[] = [
  { key: "spread", label: "spread S", low: 87, high: 231,
    text: (v) => `${v} US$/t`, status: "published",
    basis: "Asia 2014 and West 2014 (IVL-AR2015)" },
  { key: "capex", label: "capital cost C", low: 360, high: 462.056,
    text: (v) => `${v} M EUR`, status: "documented",
    basis: "EC-2007 and LSB-2012 p. 28" },
  { key: "captiveStopsAfter", label: "captive customer", low: 2, high: 0,
    text: (v) => (v === 0 ? "never stops" : `stops after year ${v}`),
    status: "synthetic", basis: "a downside case" },
  { key: "delayYears", label: "start-up delay D", low: 0, high: 2,
    text: (v) => `${v} yr`, status: "synthetic",
    basis: "PTA came in 2012 against an end planned for 2010" },
  { key: "utilisation", label: "utilisation u", low: 0.7, high: 1.0,
    text: pctText, status: "synthetic", basis: "synthetic range" },
  { key: "usdPerEur", label: "exchange rate X", low: 1.1, high: 1.5,
    text: (v) => `${v.toFixed(2)} US$/EUR`, status: "synthetic",
    basis: "synthetic range" },
  { key: "conversionCost", label: "conversion cost c_v", low: 42, high: 78,
    text: (v) => `${v} US$/t`, status: "synthetic",
    basis: "the default -30 % / +30 %" },
  { key: "fixedCost", label: "fixed costs F", low: 17.5, high: 32.5,
    text: (v) => `${v} M EUR/yr`, status: "synthetic",
    basis: "the default -30 % / +30 %" },
  { key: "merchantDiscount", label: "merchant discount d", low: 0, high: 60,
    text: (v) => `${v} US$/t`, status: "synthetic", basis: "synthetic range" },
  { key: "discountRate", label: "discount rate i", low: 0.06, high: 0.12,
    text: pctText, status: "synthetic", basis: "synthetic range" },
];

export const TORNADO_CAVEAT = "One input moved at a time, every other at the "
  + "value set above.  A sensitivity, NOT an uncertainty analysis: the ends "
  + "are not equally likely and the inputs are not independent.";

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

export interface Sourced { source: string }

/** The capital cost, as each document stated it (record §3). */
export interface CapexRow extends Sourced { when: string; what: string; value: number; }

export const CAPEX_HISTORY: readonly CapexRow[] = [
  { when: "Jul 2007", what: "total costs of the new investment (approx.)",
    value: 360, source: "EC-2007" },
  { when: "undated", what: "budgeted investment (approx.)", value: 400,
    source: "CPI-2019 p. 288" },
  { when: "Jan 2008", what: "total investment, project-finance offer",
    value: 420, source: "CPI-2019 p. 301" },
  { when: "Jan 2008", what: "investment in the unit, bridge-loan proposal",
    value: 380, source: "CPI-2019 pp. 302-303" },
  { when: "Nov 2008", what: "investment (534 with opex and financing costs)",
    value: 425, source: "CPI-2019 p. 309" },
  { when: "2012", what: "total project cost (estimate)", value: 440,
    source: "LSB-2012 p. 29" },
  { when: "2012", what: "gross investment in progress", value: 462.056,
    source: "LSB-2012 p. 28" },
];

/** Published industry spreads, US$/t (record §5). */
export interface SpreadRow extends Sourced { year: string; asia: number; west: number | null; }

export const PUBLISHED_SPREADS: readonly SpreadRow[] = [
  { year: "5-yr avg to 2014", asia: 163, west: null, source: "IVL-AR2014 PDF p. 94" },
  { year: "2014", asia: 87, west: 231, source: "IVL-AR2015 PDF p. 98" },
  { year: "2015", asia: 95, west: 214, source: "IVL-AR2015 PDF p. 98" },
  { year: "2016", asia: 97, west: 213, source: "IVL-AR2016 PDF p. 104" },
  { year: "2017", asia: 104, west: 223, source: "IVL-AR2017 PDF p. 110" },
];

/** The offtake figures (record §4). */
export const OFFTAKE = {
  capacity: 700, contract: 450, need: 470, petCapacity: 560, ptaPerPet: 0.85,
} as const;

/** The loss metrics, each defined; they OVERLAP and are never added (record §8). */
export interface LossMetric extends Sourced { metric: string; definition: string; value: string; }

export const LOSS_METRICS: readonly LossMetric[] = [
  { metric: "Facilities contracted",
    definition: "the four project-finance facilities approved in January 2010",
    value: "EUR 381 M", source: "CPI-2019 p. 318; EY-final p. 29" },
  { metric: "Exposure submitted to the PER",
    definition: "what the CGD group was owed by the plant company in September 2014",
    value: "EUR 520 M", source: "CPI-2019 p. 319" },
  { metric: "Exposure after restructuring",
    definition: "the exposure at 31 December 2015, after the revitalisation process",
    value: "EUR 351 M", source: "EY-final pp. 29, 115" },
  { metric: "Accumulated impairment",
    definition: "the part of that exposure recognised as lost by 2015, the "
      + "largest of the auditor's top 25",
    value: "EUR 211 M (60 %)", source: "EY-final p. 29; CPI-2019 p. 322" },
  { metric: "Gross involvement",
    definition: "equity holdings plus financing in LSB and the plant company "
      + "together, over the whole period",
    value: "about EUR 900 M", source: "CPI-2019 p. 322" },
  { metric: "The inquiry commission's loss estimate",
    definition: "that commission's estimate of the loss on the whole involvement",
    value: "at least EUR 400 M", source: "CPI-2019 p. 323" },
  { metric: "Result on the LSB equity",
    definition: "realised loss plus impairment on the bank's shares in LSB to "
      + "2015, credit impairments not included",
    value: "-EUR 131.4 M", source: "EY-final p. 189" },
  { metric: "Price of the plant's assets",
    definition: "what the buyer paid in November 2017",
    value: "EUR 28 M", source: "CPI-2019 p. 322" },
  { metric: "Price of the company in 2025",
    definition: "what the second buyer paid, taking on the obligations",
    value: "EUR 100 000", source: "IVL-SET-2025" },
];

export interface TimelineRow extends Sourced { when: string; event: string; }

export const TIMELINE: readonly TimelineRow[] = [
  { when: "Oct 2006", event: "The plant company is constituted (18 ha, Sines "
      + "petrochemical area)", source: "CPI-2019 p. 287" },
  { when: "2008-2010", event: "Construction financed by five bridge loans "
      + "(EUR 117 M by Mar 2009, 222 M by Jan 2010) while the project "
      + "finance and its due diligences were completed", source: "CPI-2019 pp. 316-317, 322" },
  { when: "Jan 2010", event: "Project-finance facilities of EUR 381 M; the "
      + "planned syndicate never forms", source: "CPI-2019 pp. 309, 318" },
  { when: "Sep 2010", event: "Supply contract: LSB buys up to 450 kt/yr at "
      + "market-indexed prices; LSB keeps 41 % of the plant company",
    source: "LSB-2012 p. 29; CPI-2019 p. 318" },
  { when: "21 Dec 2011", event: "Production activities start", source: "CPI-2019 p. 320" },
  { when: "Mar 2012", event: "PTA production; in operation from 30 March",
    source: "CPI-2019 p. 320; LSB-2012 p. 37" },
  { when: "17 Apr-4 May 2012", event: "Stopped for technical problems",
    source: "CPI-2019 p. 320" },
  { when: "4 Jul 2013", event: "LSB, the captive customer, is declared insolvent",
    source: "LSB-2014 p. 9" },
  { when: "9 Oct 2013", event: "Production stops again for lack of raw material (paraxylene)",
    source: "CPI-2019 p. 321" },
  { when: "2013 / 2014", event: "Net loss of the plant company: EUR 150.457 M / EUR 51.470 M",
    source: "LSB-2014 p. 69" },
  { when: "29 Jan 2014", event: "LSB enters liquidation", source: "LSB-2014 p. 10" },
  { when: "2014", event: "EUR 50 M of receivables on LSB for PTA sold and not paid",
    source: "CPI-2019 p. 321" },
  { when: "4 Aug 2014", event: "The plant company enters a special "
      + "revitalisation process (PER); EUR 520 M of CGD exposure is submitted to it",
    source: "LSB-2014 p. 13; CPI-2019 p. 319" },
  { when: "2015", event: "PER approved; exposure EUR 351 M, of which EUR 211 M impaired",
    source: "CPI-2019 pp. 319, 322; EY-final p. 29" },
  { when: "Nov 2017", event: "Indorama Ventures acquires the plant's assets "
      + "for EUR 28 M (IVL's own accounts: EUR 42.5 M with the adjacent "
      + "utility assets)", source: "CPI-2019 p. 322; IVL-AR2017 PDF p. 224" },
  { when: "about 2023", event: "The plant ceases operation", source: "IVL-SET-2025" },
  { when: "2024", event: "IVL impairs the subsidiary's assets", source: "IVL-SET-2025" },
  { when: "11 Apr 2025", event: "IVL sells the Portuguese PTA company for "
      + "EUR 100 000, the buyer taking on its obligations; one stated reason "
      + "is competition from low-cost PTA imports", source: "IVL-SET-2025" },
];

/** The short names of the sources, as the record's §1 defines them. */
export const SOURCES: readonly { short: string; cite: string }[] = [
  { short: "CPI-2019", cite: "Assembleia da República, II Comissão Parlamentar "
      + "de Inquérito à Recapitalização da Caixa Geral de Depósitos e à "
      + "Gestão do Banco, Relatório Final, July 2019 (§3.5.4, pp. 286-323)" },
  { short: "EY-final", cite: "EY, Caixa Geral de Depósitos: Auditoria "
      + "Independente aos Atos de Gestão praticados entre 2000 e 2015, 26 June "
      + "2018 (copy for the Assembleia da República, 31 January 2019; the plant "
      + "company is borrower C001)" },
  { short: "LSB-2012", cite: "La Seda de Barcelona, S.A., Documento de Registro "
      + "de Acciones, CNMV, 12 June 2012" },
  { short: "LSB-2014", cite: "La Seda de Barcelona, S.A., en liquidación, "
      + "Memoria de las cuentas anuales consolidadas del ejercicio 2014" },
  { short: "IVL-AR2012 ... AR2017", cite: "Indorama Ventures PCL, Annual "
      + "Reports 2012-2017 (PDF pages)" },
  { short: "IVL-SET-2025", cite: "Indorama Ventures PCL, notices IVL001/04/2025 "
      + "to the Stock Exchange of Thailand, 16 April 2025" },
  { short: "EC-2007", cite: "European Commission, press release IP/07/1067, "
      + "11 July 2007" },
  { short: "USITC-4604", cite: "U.S. International Trade Commission, PET Resin "
      + "from Canada, China, India, and Oman, Publication 4604, April 2016" },
];
