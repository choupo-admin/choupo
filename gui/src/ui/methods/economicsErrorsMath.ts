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
  Ways a pharmaceutical-plant economics goes wrong -- the arithmetic
  (commission C210, synthesis item E7).  React-free: the page
  (EconomicsErrorsTool.tsx) draws what this file computes, and
  tests/economicsErrors.test.ts recomputes every number by hand.

  EIGHT ERROR CLASSES, each a pair of functions: the WRONG calculation and
  the RIGHT one on the SAME inputs, so the page can set them side by side.
  Every class also carries its GUARD: what Choupo does about it, read from
  the engine, with the file and the exact text the claim rests on (GUARDS
  below) -- the test opens those files and holds each needle to the source,
  so a guard that stops existing makes the test fail rather than the page
  go on claiming it.  A class Choupo does not catch says so.

  The standard arithmetic only: present value of an annuity, straight-line
  depreciation, tax on taxable income, the net present value and its root.
  Nothing here is physics, nothing is a forecast, and every default input
  is an illustration (origin `assumption`) the student replaces.
\*---------------------------------------------------------------------------*/

// ---- shared: the standard discounting --------------------------------------

/** Present value factor of an annuity of L equal end-of-year payments. */
export function annuityFactor(i: number, L: number): number {
  if (Math.abs(i) < 1e-12) return L;
  return (1 - Math.pow(1 + i, -L)) / i;
}

/** NPV of a cash flow whose element j is paid at the end of year j (year 0 now). */
export function npvOf(cf: readonly number[], i: number): number {
  let s = 0;
  for (let j = 0; j < cf.length; j++) s += (cf[j] ?? 0) / Math.pow(1 + i, j);
  return s;
}

/** The root of NPV(i) = 0 on (-0.99, 1000] by scan + bisection, or null. */
export function irrOf(cf: readonly number[]): number | null {
  const f = (i: number) => npvOf(cf, i);
  let prevI = -0.99, prevF = f(prevI);
  const grid: number[] = [];
  for (let x = -0.99; x <= 1; x += 0.01) grid.push(x);
  for (let x = 1.5; x <= 1000; x *= 1.25) grid.push(x);
  for (const x of grid.slice(1)) {
    const fx = f(x);
    if (prevF === 0) return prevI;
    if (prevF * fx < 0) {
      let a = prevI, b = x, fa = prevF;
      for (let it = 0; it < 200; it++) {
        const m = 0.5 * (a + b), fm = f(m);
        if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
      }
      return 0.5 * (a + b);
    }
    prevI = x; prevF = fx;
  }
  return null;
}

// ---- the GUARDS: what Choupo does about each class --------------------------

/** What the engine does about a class.
 *   refuses     the run stops and names the fault
 *   announces   the run goes on and prints the fault
 *   constructs  the engine's own calculation is done the right way, in one
 *               place, and published -- but nothing compares it with yours
 *   none        Choupo does not catch this; you must check it
 */
export type GuardKind = "refuses" | "announces" | "constructs" | "none";

export interface Guard {
  kind: GuardKind;
  /** what it does, in a sentence */
  says: string;
  /** the engine source the claim rests on (repo-relative), or "" for none */
  file: string;
  /** text that must occur in that file, verbatim; "" for none */
  needle: string;
  /** the gate that holds the guard, when one exists and was read */
  gate?: string;
}

export type ClassId =
  | "sold" | "twoRevenues" | "taxBase" | "royalty"
  | "workingCapital" | "discountRate" | "units" | "unitCost";

export const GUARDS: Readonly<Record<ClassId, readonly Guard[]>> = {
  sold: [
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "fraction outside [0, 1]",
      says: "a `rampUp` entry outside [0, 1] stops the run: a year cannot sell more than the design production." },
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "is declared beside a batch plan",
      says: "a numeric `streamFactor` beside a `batchPlan` stops the run: the year's production has ONE home, the plan (`streamFactor fromBatchPlan;`).",
      gate: "check_batch_plan" },
    { kind: "none", file: "", needle: "",
      says: "Choupo does not compare the production with the market. Choupo does not catch a plant sized for more than the market buys; you must check it (see the demand-forecast tool)." },
  ],
  twoRevenues: [
    { kind: "constructs", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "R += ps.price * ps.massFlow * 3600.0 * H",
      says: "the revenue of the NPV is computed in one place from the product stream and its price, and the economics sensitivity re-prices through the same function (never a second copy of the cash flow).",
      gate: "check_economic_sensitivity" },
    { kind: "constructs", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "x = F / (R - V) = ",
      says: "with `breakEven {}` declared, the engine prints the operating break-even and the NPV one (found by pricing the same appraisal again) from the SAME revenue as the NPV, with its fixed and variable costs shown.",
      gate: "check_economic_extensions" },
    { kind: "none", file: "", needle: "",
      says: "Choupo does not catch a break-even computed by hand on another revenue; you must check it against the revenue line of the cash flow." },
  ],
  taxBase: [
    { kind: "constructs", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "projectTaxable[at(t)] * (1.0 - taxRate)",
      says: "the tax is the rate times the TAXABLE income (revenue - cost of manufacture - depreciation), and the cash-flow table writes both the taxable income and the tax of every year, so a hand calculation can be compared line by line.",
      gate: "check_economic_sensitivity" },
    { kind: "none", file: "", needle: "",
      says: "Nothing refuses a tax rate applied to sales in YOUR spreadsheet; the engine's rows are the thing to compare it with." },
  ],
  royalty: [
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "if (!d->found(\"expiry\"))",
      says: "a `royalty {}` without the last operating year that carries it stops the run, and the royalty is charged in years 1..expiry only; a royalty with no end is the error.",
      gate: "check_economic_extensions" },
    { kind: "none", file: "", needle: "",
      says: "Choupo does not catch a royalty whose window you declared wrongly against the patent, nor one paid for a licence you do not hold; you must check it (and see the patent-expiry tool for the calendar)." },
  ],
  workingCapital: [
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "a default number of days is a policy nobody",
      says: "the build-up model `workingCapital { ... }` needs every one of its four periods declared, each with its unit; nothing is defaulted." },
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "carries no unit",
      says: "a period written as a bare number (read by the grammar as seconds) stops the run." },
    { kind: "constructs", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "wcb.fractionRule = in.workingCapitalFraction * FCI",
      says: "the case declares ONE method; the build-up is printed with the fraction-of-FCI figure beside it. Choupo does not choose among methods, and does not catch a convenient choice: you must check it." },
  ],
  discountRate: [
    { kind: "announces", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "is EXTREME (>200%)",
      says: "an IRR above 200 % prints a warning that the cash flow dwarfs the investment (a mis-scaled appraisal). It does not look at the discount rate." },
    { kind: "announces", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "Multiple-IRR guard",
      says: "a cumulative cash flow that changes sign more than once flags that the IRR may not be unique: use the NPV." },
    { kind: "none", file: "", needle: "",
      says: "Choupo does not judge the discount rate you declare, and the sensitivity can move it (`discountRate`). Choupo does not catch a rate of 40-80 %; you must defend your rate." },
  ],
  units: [
    { kind: "constructs", file: "src/reporting/UtilityAllocationReport.cpp",
      needle: "W->GJ/h",
      says: "a utility bill is computed once, from the unit's duty in watts and the utility's cost in EUR per GJ, and printed per service in the utility-allocation report." },
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "Dimensions(0, -2, 0, 0, 0)",
      says: "a quantity written with a unit is checked against the dimension the key expects (for example the land price in currency per m2) and a mismatch stops the run, so a per-m3 price cannot stand in for a per-m2 one." },
    { kind: "none", file: "", needle: "",
      says: "A utility `cost` is a bare number in EUR per GJ. Choupo does not catch a EUR/kWh price typed in that slot unconverted, or a bill you multiply by hand; you must check it." },
  ],
  unitCost: [
    { kind: "refuses", file: "src/postProcessing/costing/DeclaredQuote.cpp",
      needle: "a quoted cost is an assumption the case",
      says: "a declared quote without a `source` and a `reason` stops the run; nothing is defaulted.",
      gate: "check_cost_provenance" },
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "a land price is an assumption the case owes its",
      says: "the land price per m2 likewise needs its source and its reason." },
    { kind: "refuses", file: "src/postProcessing/EconomicsPass.cpp",
      needle: "a building price is an assumption the case owes",
      says: "a `buildings {}` price per m2 (or per room grade) without its source and reason stops the run; the area is the GMP rooms' own.",
      gate: "check_economic_extensions" },
    { kind: "none", file: "", needle: "",
      says: "Choupo does not compare your unit cost with another's. Choupo does not catch a cost per m2 five times another's; the declared source and reason are what make the spread visible." },
  ],
};

// ---- class 1: a sold quantity that is not the plant's production -----------

export interface SoldInputs {
  /** the plant's design production, million packs a year */
  productionM: number;
  /** the market for the product, million packs a year (as the series gives it) */
  marketM: number;
  /** the share of that market the plant can win */
  share: number;
  /** the unargued factor "to fill the plant" */
  factor: number;
  /** the packs value of one price unit: EUR per pack */
  price: number;
  /** the market series is in thousands but is read as millions: 1000, else 1 */
  scaleSlip: number;
}

export interface SoldResult {
  /** million packs a year the market gives the plant */
  right: number;
  /** million packs a year after the unargued factor and the scale slip */
  wrong: number;
  /** the wrong quantity divided by the plant's production (above 1 is impossible) */
  wrongOverProduction: number;
  /** the factor that would make the market share fill the plant exactly */
  fillFactor: number;
  revenueRightMEUR: number;
  revenueWrongMEUR: number;
}

export function soldQuantity(i: SoldInputs): SoldResult {
  const market = i.marketM * i.share;
  const right = Math.min(i.productionM, market);
  const wrong = market * i.factor * i.scaleSlip;
  return {
    right, wrong,
    wrongOverProduction: wrong / i.productionM,
    fillFactor: market > 0 ? i.productionM / market : Infinity,
    revenueRightMEUR: right * i.price,
    revenueWrongMEUR: wrong * i.price,
  };
}

// ---- classes 2 and 3: one plant's annual economics --------------------------

export interface PlantEcon {
  /** fixed capital investment, M EUR */
  I: number;
  /** fixed annual costs, M EUR / yr */
  F: number;
  /** variable cost, EUR per pack */
  v: number;
  /** price, EUR per pack */
  p: number;
  /** quantity sold, million packs per year */
  N: number;
  /** tax rate on taxable income */
  t: number;
  /** depreciable life, years (straight line, no salvage) */
  Ld: number;
  /** project life, years */
  L: number;
  /** discount rate */
  i: number;
}

export const plantDefaults = (): PlantEcon => ({
  I: 30, F: 6, v: 1.1, p: 3.0, N: 10, t: 0.21, Ld: 10, L: 10, i: 0.10,
});

/** Annual depreciation, M EUR / yr. */
export const depreciation = (e: PlantEcon): number => e.I / e.Ld;

/** Annual after-tax cash flow at quantity N and price p, M EUR / yr. */
export function annualCashFlow(e: PlantEcon, N: number, p: number): number {
  const d = depreciation(e);
  const taxable = (p - e.v) * N - e.F - d;
  return taxable * (1 - e.t) + d;
}

/** NPV (M EUR) of -I at year 0 and L equal years of the cash flow. */
export function plantNpv(e: PlantEcon, N: number, p: number): number {
  return -e.I + annualCashFlow(e, N, p) * annuityFactor(e.i, e.L);
}

/** The quantity at which the NPV is zero, at price p (million packs / yr). */
export function npvBreakEvenN(e: PlantEcon, p: number): number {
  const d = depreciation(e), a = annuityFactor(e.i, e.L);
  return (((e.I / a - d) / (1 - e.t)) + e.F + d) / (p - e.v);
}

/** The accounting break-even: revenue = cost of manufacture + depreciation. */
export function profitBreakEvenN(e: PlantEcon, p: number): number {
  return (e.F + depreciation(e)) / (p - e.v);
}

export interface TwoRevenuesResult {
  /** break-even from the price the NPV uses (consistent) */
  nConsistent: number;
  /** break-even from the other price the report used */
  nWrong: number;
  /** NPV at the consistent break-even, at the NPV's own price: zero */
  npvAtConsistent: number;
  /** NPV at the wrong break-even, at the NPV's own price: not zero */
  npvAtWrong: number;
  /** the revenue each uses at the sold quantity, M EUR / yr */
  revenueNpv: number;
  revenueBreakEven: number;
}

export function twoRevenues(e: PlantEcon, pBreakEven: number): TwoRevenuesResult {
  const nC = npvBreakEvenN(e, e.p), nW = npvBreakEvenN(e, pBreakEven);
  return {
    nConsistent: nC, nWrong: nW,
    npvAtConsistent: plantNpv(e, nC, e.p), npvAtWrong: plantNpv(e, nW, e.p),
    revenueNpv: e.p * e.N, revenueBreakEven: pBreakEven * e.N,
  };
}

export interface TaxResult {
  sales: number;
  costOfManufacture: number;
  depreciation: number;
  taxableIncome: number;
  taxWrong: number;
  taxRight: number;
  cashFlowWrong: number;
  cashFlowRight: number;
  npvWrong: number;
  npvRight: number;
}

export function taxBase(e: PlantEcon): TaxResult {
  const sales = e.p * e.N;
  const com = e.v * e.N + e.F;
  const d = depreciation(e);
  const taxable = sales - com - d;
  const taxWrong = e.t * sales, taxRight = e.t * taxable;
  // cash flow = revenue - cost - tax  (the depreciation is not a cash cost)
  const cfW = sales - com - taxWrong, cfR = sales - com - taxRight;
  const a = annuityFactor(e.i, e.L);
  return {
    sales, costOfManufacture: com, depreciation: d, taxableIncome: taxable,
    taxWrong, taxRight, cashFlowWrong: cfW, cashFlowRight: cfR,
    npvWrong: -e.I + cfW * a, npvRight: -e.I + cfR * a,
  };
}

// ---- class 4: royalties -------------------------------------------------------

export interface RoyaltyInputs {
  /** royalty rate on net sales */
  rate: number;
  /** net sales, M EUR / yr */
  sales: number;
  /** operating years in which a LICENSED live patent covers the product (0 = expired) */
  window: number;
  L: number;
  i: number;
}

export interface RoyaltyResult {
  /** the royalty paid in each operating year, wrong: every year */
  wrongPerYear: number[];
  rightPerYear: number[];
  pvWrong: number;
  pvRight: number;
}

export function royalty(r: RoyaltyInputs): RoyaltyResult {
  const wrong: number[] = [], right: number[] = [];
  let pvW = 0, pvR = 0;
  for (let j = 1; j <= r.L; j++) {
    const w = r.rate * r.sales, rt = j <= r.window ? w : 0;
    wrong.push(w); right.push(rt);
    pvW += w / Math.pow(1 + r.i, j); pvR += rt / Math.pow(1 + r.i, j);
  }
  return { wrongPerYear: wrong, rightPerYear: right, pvWrong: pvW, pvRight: pvR };
}

// ---- class 5: three working capitals -----------------------------------------

export interface WcInputs {
  /** fixed capital investment, M EUR */
  fci: number;
  /** annual sales, M EUR / yr */
  sales: number;
  /** annual cost of manufacture without depreciation, M EUR / yr */
  com: number;
  /** annual raw-material purchases, M EUR / yr */
  rawMaterials: number;
  /** method A: fraction of the fixed capital */
  fracFci: number;
  /** method B: fraction of annual sales */
  fracSales: number;
  /** method C: days of the build-up (the engine's block) */
  daysStock: number;
  daysReceivables: number;
  daysPayables: number;
  daysCash: number;
  L: number;
  i: number;
}

export const wcDefaults = (): WcInputs => ({
  fci: 18, sales: 80, com: 35, rawMaterials: 20,
  fracFci: 0.15, fracSales: 0.25,
  daysStock: 120, daysReceivables: 90, daysPayables: 30, daysCash: 30,
  L: 10, i: 0.10,
});

export interface WcResult {
  a: number; b: number; c: number;
  /** the five lines of method C: stock, receivables, cash, payables, net */
  cLines: { stock: number; receivables: number; cash: number; payables: number };
  /** largest over smallest of the three */
  spread: number;
  /** NPV cost of each: WC out at year 0, back at the end of year L */
  npvCost: { a: number; b: number; c: number };
}

export function workingCapitals(w: WcInputs): WcResult {
  const a = w.fracFci * w.fci;
  const b = w.fracSales * w.sales;
  const lines = {
    stock: w.rawMaterials * w.daysStock / 365,
    receivables: w.sales * w.daysReceivables / 365,
    cash: w.com * w.daysCash / 365,
    payables: w.rawMaterials * w.daysPayables / 365,
  };
  const c = lines.stock + lines.receivables + lines.cash - lines.payables;
  const all = [a, b, c];
  const cost = (x: number) => x * (1 - Math.pow(1 + w.i, -w.L));
  return {
    a, b, c, cLines: lines,
    spread: Math.max(...all) / Math.max(Math.min(...all), 1e-12),
    npvCost: { a: cost(a), b: cost(b), c: cost(c) },
  };
}

// ---- class 6: the discount rate and the IRR -----------------------------------

export interface RateInputs {
  /** fixed capital investment, M EUR (year 0) */
  I: number;
  /** equal annual after-tax cash flow, M EUR / yr */
  cf: number;
  L: number;
  /** the discount rate the report chose */
  i: number;
  /** the factor by which a scale error multiplies the cash flow */
  scale: number;
}

export interface RateResult {
  rates: number[];
  npvs: number[];
  irr: number | null;
  npvAtChosen: number;
  /** the IRR after the scale error */
  irrScaled: number | null;
  npvScaledAtChosen: number;
}

export function rateAndIrr(r: RateInputs): RateResult {
  const flow = (k: number) => [-r.I, ...Array.from({ length: r.L }, () => r.cf * k)];
  const rates = Array.from({ length: 17 }, (_, n) => n * 0.05);   // 0 .. 80 %
  return {
    rates, npvs: rates.map((x) => npvOf(flow(1), x)),
    irr: irrOf(flow(1)), npvAtChosen: npvOf(flow(1), r.i),
    irrScaled: irrOf(flow(r.scale)), npvScaledAtChosen: npvOf(flow(r.scale), r.i),
  };
}

// ---- class 7: units ------------------------------------------------------------

export type Dim = "energy" | "volume";
export interface UnitDef { id: string; dim: Dim; toBase: number; }

/** Energy in joules, volume in cubic metres. */
export const UNITS: readonly UnitDef[] = [
  { id: "kWh", dim: "energy", toBase: 3.6e6 },
  { id: "MWh", dim: "energy", toBase: 3.6e9 },
  { id: "GJ", dim: "energy", toBase: 1e9 },
  { id: "m3", dim: "volume", toBase: 1 },
  { id: "L", dim: "volume", toBase: 1e-3 },
];

const unit = (id: string): UnitDef => {
  const u = UNITS.find((x) => x.id === id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
};

export type BillResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** quantity converted to the unit the price is quoted in */
      quantityInPriceUnit: number;
      right: number;
      /** price times the number as written, no conversion */
      wrong: number;
      /** wrong / right: the conversion factor, 1 when the units agree */
      ratio: number;
    };

/** EUR bill of `qty` expressed in `qtyUnit`, at `price` EUR per `priceUnit`. */
export function utilityBill(qty: number, qtyUnit: string, price: number, priceUnit: string): BillResult {
  const q = unit(qtyUnit), p = unit(priceUnit);
  if (q.dim !== p.dim)
    return { ok: false, reason: `refused: ${qtyUnit} is a ${q.dim} and the price is per ${priceUnit}, a ${p.dim}; a bill cannot mix them` };
  const inPrice = qty * q.toBase / p.toBase;
  const right = inPrice * price, wrong = qty * price;
  return { ok: true, quantityInPriceUnit: inPrice, right, wrong, ratio: wrong / right };
}

/** The EUR/kWh price as the engine's EUR/GJ slot wants it. */
export const eurPerKwhToEurPerGJ = (x: number): number => x / (3.6e6 / 1e9);

// ---- class 8: a declared unit cost ----------------------------------------------

export interface UnitCostDecl {
  /** EUR per m2 */
  perM2: number;
  /** price year */
  year: number;
  source: string;
  reason: string;
}

export type UnitCostResult =
  | { ok: false; missing: string[] }
  | { ok: true; totalMEUR: number };

/** The building cost, refused without a source and a reason (the rule the
 *  engine applies to a quote and to the land price). */
export function buildingCost(areaM2: number, d: UnitCostDecl): UnitCostResult {
  const missing: string[] = [];
  if (d.source.trim() === "") missing.push("source");
  if (d.reason.trim() === "") missing.push("reason");
  if (missing.length) return { ok: false, missing };
  return { ok: true, totalMEUR: areaM2 * d.perM2 / 1e6 };
}

/** Largest over smallest of a list of unit costs. */
export const spreadOf = (xs: readonly number[]): number =>
  Math.max(...xs) / Math.max(Math.min(...xs), 1e-12);
