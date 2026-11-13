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
  What a plant costs to run, and when it pays -- the arithmetic
  (commission C212, item B).  React-free: PlantRunTool.tsx draws what this
  file computes and tests/plantRun.test.ts recomputes it by hand.

  ONE illustrative plant is carried through every step, so the itemised cost
  of production, the crew, the depreciation, the break-even, the cash flow and
  the sensitivity are all about the SAME plant.  Every number the plant starts
  from is an illustration the student replaces; the only numbers that are not
  are (a) none for the factor ranges (RANGES points to the book, it gives no
  number), and (b) the engine's own coefficients, each with the engine line it was read at
  (ENGINE_FACTS), which the test opens and holds to the source.

  The cash flow is the engine's (EconomicsPass.cpp, appraise): year-end,
  straight-line depreciation of the whole fixed capital over its life, tax on
  taxable income with no floor, working capital and the taxed salvage back in
  the last year.  Nothing here is a forecast.
\*---------------------------------------------------------------------------*/

import { annuityFactor, irrOf, npvOf } from "./economicsErrorsMath.js";

export { annuityFactor, irrOf, npvOf };

// ---- what the engine does, with the line it was read at ---------------------

export interface EngineFact {
  /** repo-relative file */
  file: string;
  /** the line the claim was read at, in the file as of the commit that wrote this */
  line: number;
  /** text that must occur in that file, verbatim */
  needle: string;
  says: string;
}

export const ENGINE_FACTS = {
  comD: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1805,
    needle: "const scalar COM_d = 0.180 * FCI",
    says: "the engine's cost of manufacture without depreciation is COM_d = 0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT + C_WT).",
  },
  wasteZero: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1804,
    needle: "const scalar C_WT = 0.0;",
    says: "waste treatment C_WT is set to zero: not costed, and the run says so.",
  },
  positions: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 3285,
    needle: "scalar positionsPerOperatorPerShift = 4.5;",
    says: "about 4.5 shift-positions cover one operating position round the clock (the default; a case declares its own with `operatorCover`); the operators per shift come from Turton's N_OL or from a declared `operatingCrew`.",
  },
  operatorHours: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1724,
    needle: "scalar  operatorAnnualHours    = 1960.0;",
    says: "one operator is paid for 1960 h per year by default (49 weeks x 40 h); `operatorAnnualHours` overrides it.",
  },
  crew: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 3139,
    needle: 'if (econDict_->found("operatingCrew"))',
    says: "a case may declare its own crew in `economics { operatingCrew { ... } }` in place of Turton's correlation.",
  },
  straightLine: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1829,
    needle: "const scalar d_annual = (in.depreciableLife > 0.0) ? (FCI / in.depreciableLife) : 0.0;",
    says: "depreciation is the fixed capital over ONE depreciable life, straight line; one life for the whole plant, no asset classes.",
  },
  otherDepreciation: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 2940,
    needle: 'if (deprMethod != "straightLine")',
    says: "any other `depreciation` word is announced as not implemented and straight line is used.",
  },
  taxable: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1891,
    needle: "projectTaxable[at(t)] = revenueAt(t) - comAt(t) - royaltyAt(t) - startupAt(t) - d_t;",
    says: "taxable income is revenue less cost of manufacture less depreciation; the cash flow is taxable x (1 - rate) + depreciation -- in a loss year too, where the negative tax is a credit (the default `taxOnLoss credit`, announced when it bites); `taxOnLoss none` is the stand-alone reading, no tax and no credit in a loss year.",
  },
  wcSalvage: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1897,
    needle: "cashFlow[at(Nlife)] += WC + salvage * (1.0 - taxRate);",
    says: "in the last year the working capital comes back untaxed and the salvage comes back taxed.",
  },
  appraise: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1761,
    needle: "AppraisalOutcome appraise(const AppraisalInputs& in,",
    says: "`appraise` is the one home of the cash flow; the base case and every sensitivity bar call it.",
  },
  paybackDisc: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 2128,
    needle: "auto discPaybackOf =",
    says: "the discounted payback is the year in which the cumulative discounted cash flow first reaches zero, interpolated within that year.",
  },
  irrWarning: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 2117,
    needle: "is EXTREME (>200%)",
    says: "an IRR above 200 % is printed with a warning: the cash flow dwarfs the investment, which points to a scale error.",
  },
  breakEven: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 4302,
    needle: "x = F / (R - V) = ",
    says: "with `breakEven {}` declared, the engine prints the operating break-even x = F/(R - V) (fixed: 0.180 FCI + 2.73 C_OL + depreciation; variable: 1.23 (C_RM + C_UT + C_WT)) and the NPV break-even, the production fraction at which `appraise` on a copy returns NPV = 0; the two are published separately.",
  },
  royalty: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 1514,
    needle: "if (!d->found(\"expiry\"))",
    says: "with `royalty {}` declared, a royalty on sales or on the cost of manufacture is charged in operating years 1..expiry only; a royalty with no declared expiry year stops the run.",
  },
  sensitivity: {
    file: "src/postProcessing/EconomicsPass.cpp", line: 2691,
    needle: "Economic sensitivity (one input at a time)",
    says: "the `sensitivity {}` block (C68) moves one declared input at a time and prices the base appraisal again; it is not an uncertainty analysis.",
  },
} as const satisfies Record<string, EngineFact>;

/** Things the engine does NOT have, each stated with the search that showed it. */
export const ENGINE_ABSENCES: readonly { id: string; says: string }[] = [
  { id: "itemised",
    says: "Choupo has no itemised cost of production (supervision, maintenance, overhead, administration, selling, research as separate lines): COM_d is Turton's three-term form." },
  { id: "classes",
    says: "Choupo has no depreciation by asset class; straight line over one life is the only method." },
];

// ---- the factor ranges, and the book each is read from ----------------------

export interface FactorRange {
  key: string;
  label: string;
  /** what the factor multiplies */
  basis: string;
  /** a range as a fraction of the basis; null for every factor today (none is shipped unchecked) */
  lo: number | null;
  hi: number | null;
  /** the starting value on the page: an illustration inside the range when there is one */
  start: number;
  source: string;
}

const PTW = "Peters, Timmerhaus & West (2003), Plant Design and Economics for Chemical Engineers, 5th ed., ch. 6, tabulates this factor; Towler & Sinnott, Chemical Engineering Design, ch. 8, and Turton et al., Analysis, Synthesis and Design of Chemical Processes, ch. 8, treat the cost of production too. Read it there and declare your value with that source";
const NONE = "declare it with your own source";

//  NO RANGE IS SHIPPED (commander's rule, 2026-11-03): a range cited to a book
//  and recalled, not checked against it, would turn "unsourced" into "falsely
//  sourced".  `lo`/`hi` stay in the record so a range can be added the day it
//  is read from the book; today they are null for every factor, and `start` is
//  an illustration.
export const RANGES: readonly FactorRange[] = [
  { key: "supervision", label: "Supervision and clerical", basis: "operating labour",
    lo: null, hi: null, start: 0.15, source: PTW },
  { key: "maintenance", label: "Maintenance and repairs", basis: "fixed capital",
    lo: null, hi: null, start: 0.05, source: PTW },
  { key: "supplies", label: "Operating supplies", basis: "maintenance",
    lo: null, hi: null, start: 0.15, source: PTW },
  { key: "laboratory", label: "Laboratory charges", basis: "operating labour",
    lo: null, hi: null, start: 0.15, source: PTW },
  { key: "overhead", label: "Plant overhead", basis: "labour + supervision + maintenance",
    lo: null, hi: null, start: 0.60, source: PTW },
  { key: "taxes", label: "Local taxes", basis: "fixed capital",
    lo: null, hi: null, start: 0.02, source: PTW },
  { key: "insurance", label: "Insurance", basis: "fixed capital",
    lo: null, hi: null, start: 0.007, source: PTW },
  { key: "royalty", label: "Royalties", basis: "sales (this page; the book states it on the cost of production)",
    lo: null, hi: null, start: 0, source: "the licence you hold; " + NONE },
  { key: "admin", label: "Administration", basis: "labour + supervision + maintenance",
    lo: null, hi: null, start: 0.15, source: PTW },
  { key: "selling", label: "Distribution and selling", basis: "cost of production",
    lo: null, hi: null, start: 0.05, source: PTW },
  { key: "research", label: "Research and development", basis: "cost of production",
    lo: null, hi: null, start: 0.02, source: PTW },
];

export const rangeOf = (key: string): FactorRange =>
  RANGES.find((r) => r.key === key) as FactorRange;

// ---- the plant ---------------------------------------------------------------

export interface RunPlant {
  // sales (all money in million EUR, quantities in million units)
  capacity: number;        // design production, million units / year
  load: number;            // fraction of the capacity sold
  price: number;           // EUR per unit
  // direct bills at full capacity (from the mass balance: quantity x price)
  rawMaterial: number;     // million EUR / year
  catalystSolvent: number; // million EUR / year
  utilities: number;       // million EUR / year
  // labour
  operatorsPerShift: number;
  shiftsPerDay: number;
  daysPerYear: number;
  hoursPerShift: number;
  hoursPerOperatorYear: number;
  wage: number;            // EUR per paid hour, loaded
  // capital
  fci: number;             // million EUR
  workingCapital: number;  // million EUR
  salvage: number;         // fraction of fci recovered at the end
  life: number;            // project life, years
  deprLife: number;        // straight-line depreciation life, years
  // factors (fractions of their basis)
  supervision: number; maintenance: number; supplies: number; laboratory: number;
  overhead: number; taxes: number; insurance: number; royalty: number;
  admin: number; selling: number; research: number;
  rent: number;            // million EUR / year, declared
  financing: number;       // million EUR / year of interest, declared
  // appraisal
  tax: number;             // rate on taxable income
  rate: number;            // discount rate
}

export const plantStart = (): RunPlant => ({
  capacity: 20, load: 0.9, price: 2.7,
  rawMaterial: 18, catalystSolvent: 1.2, utilities: 4.0,
  operatorsPerShift: 6, shiftsPerDay: 3, daysPerYear: 330, hoursPerShift: 8,
  hoursPerOperatorYear: 1960, wage: 28,
  fci: 60, workingCapital: 9, salvage: 0.05, life: 15, deprLife: 10,
  supervision: rangeOf("supervision").start, maintenance: rangeOf("maintenance").start,
  supplies: rangeOf("supplies").start, laboratory: rangeOf("laboratory").start,
  overhead: rangeOf("overhead").start, taxes: rangeOf("taxes").start,
  insurance: rangeOf("insurance").start, royalty: 0,
  admin: rangeOf("admin").start, selling: rangeOf("selling").start,
  research: rangeOf("research").start,
  rent: 0, financing: 0,
  tax: 0.21, rate: 0.10,
});

// ---- step 2: labour by shifts -------------------------------------------------

export interface Crew {
  /** hours per year each post must be staffed */
  postHours: number;
  /** operators needed in the plant at any time during the shifts worked */
  onDuty: number;
  /** operators to hire so that every post is covered every hour */
  hired: number;
  /** the unrounded ratio postHours / hoursPerOperatorYear, per post */
  perPost: number;
  /** annual labour cost, million EUR */
  cost: number;
  /** operators per post if the plant ran round the clock, 8760 h */
  roundTheClock: number;
}

export function crewOf(p: Pick<RunPlant, "operatorsPerShift" | "shiftsPerDay" | "daysPerYear"
  | "hoursPerShift" | "hoursPerOperatorYear" | "wage">): Crew {
  const postHours = p.shiftsPerDay * p.hoursPerShift * p.daysPerYear;
  const perPost = postHours / p.hoursPerOperatorYear;
  const hired = Math.ceil(p.operatorsPerShift * perPost - 1e-9);
  return {
    postHours, onDuty: p.operatorsPerShift, perPost, hired,
    cost: hired * p.wage * p.hoursPerOperatorYear / 1e6,
    roundTheClock: 8760 / p.hoursPerOperatorYear,
  };
}

/** What the engine's positions factor would hire for the same operators per shift. */
export const enginePositions = (operatorsPerShift: number): number => 4.5 * operatorsPerShift;

// ---- step 1: the cost of production, itemised, and Turton's ----------------------

export interface CostLines {
  sales: number;
  // direct
  rawMaterial: number; labour: number; supervision: number; utilities: number;
  maintenance: number; supplies: number; royalty: number; catalystSolvent: number;
  laboratory: number;
  directTotal: number;
  // indirect
  overhead: number;
  // fixed
  depreciation: number; taxes: number; insurance: number; rent: number;
  fixedTotal: number;
  manufacturing: number;
  // general
  admin: number; selling: number; research: number;
  generalTotal: number;
  financing: number;
  /** everything, depreciation and financing included */
  total: number;
  /** cash cost of the project: total less depreciation and financing */
  cash: number;
}

/**
 * The itemised cost of production at a sold fraction `f` of the capacity.
 * Raw material, catalyst and solvent, utilities and royalties follow the
 * quantity sold; everything else is fixed.  Selling and research are
 * fractions of the cost of production itself, so
 *     T = A / (1 - s - r)
 * with A the sum of every other line (the closed form of the circularity).
 */
export function itemise(p: RunPlant, f: number = p.load): CostLines {
  const labour = crewOf(p).cost;
  const sales = p.price * p.capacity * f;
  const rawMaterial = p.rawMaterial * f;
  const catalystSolvent = p.catalystSolvent * f;
  const utilities = p.utilities * f;
  const royalty = p.royalty * sales;
  const supervision = p.supervision * labour;
  const maintenance = p.maintenance * p.fci;
  const supplies = p.supplies * maintenance;
  const laboratory = p.laboratory * labour;
  const directTotal = rawMaterial + labour + supervision + utilities + maintenance
    + supplies + royalty + catalystSolvent + laboratory;
  const overhead = p.overhead * (labour + supervision + maintenance);
  const depreciation = p.deprLife > 0 ? p.fci / p.deprLife : 0;
  const taxes = p.taxes * p.fci;
  const insurance = p.insurance * p.fci;
  const fixedTotal = depreciation + taxes + insurance + p.rent;
  const manufacturing = directTotal + overhead + fixedTotal;
  const admin = p.admin * (labour + supervision + maintenance);
  const A = manufacturing + admin;
  const T = A / (1 - p.selling - p.research);
  const selling = p.selling * T;
  const research = p.research * T;
  const generalTotal = admin + selling + research;
  const total = T + p.financing;
  return {
    sales, rawMaterial, labour, supervision, utilities, maintenance, supplies, royalty,
    catalystSolvent, laboratory, directTotal, overhead, depreciation, taxes, insurance,
    rent: p.rent, fixedTotal, manufacturing, admin, selling, research, generalTotal,
    financing: p.financing, total, cash: T - depreciation,
  };
}

export interface TurtonCost {
  fci: number; cOL: number; cRM: number; cUT: number; cWT: number;
  termFci: number; termLabour: number; termVariable: number;
  comD: number;
}

/**
 * The engine's cost of manufacture without depreciation, on the same direct
 * bills.  C_RM takes the raw material AND the catalyst and solvent bought
 * (both are purchases of materials); C_OL is the hired crew's wage bill;
 * C_WT is zero, as in the engine.
 */
export function turton(p: RunPlant, f: number = p.load): TurtonCost {
  const cOL = crewOf(p).cost;
  const cRM = (p.rawMaterial + p.catalystSolvent) * f;
  const cUT = p.utilities * f;
  const cWT = 0;
  const termFci = 0.180 * p.fci;
  const termLabour = 2.73 * cOL;
  const termVariable = 1.23 * (cRM + cUT + cWT);
  return { fci: p.fci, cOL, cRM, cUT, cWT, termFci, termLabour, termVariable,
    comD: termFci + termLabour + termVariable };
}


export interface CostGroups {
  /** lines that rest on the fixed capital: maintenance, supplies, taxes, insurance, rent and the overhead and administration charged on maintenance */
  fciRelated: number;
  /** lines that rest on the crew: labour, supervision, laboratory and the overhead and administration charged on them */
  labourRelated: number;
  /** the bills that follow the quantity: raw material, catalyst and solvent, utilities, royalty */
  variable: number;
  /** distribution and selling plus research, which are fractions of the cost of production */
  sellingResearch: number;
}

/**
 * The itemised cash cost regrouped into the three heads of the engine's
 * COM_d (fixed capital, labour, the bills) plus the two lines that are
 * fractions of the cost itself.  The four add up to `itemise().cash`.
 */
export function groupsOf(p: RunPlant, f: number = p.load): CostGroups {
  const c = itemise(p, f);
  const lab = c.labour + c.supervision;
  return {
    fciRelated: c.maintenance + c.supplies + c.taxes + c.insurance + c.rent
      + (p.overhead + p.admin) * c.maintenance,
    labourRelated: lab + c.laboratory + (p.overhead + p.admin) * lab,
    variable: c.rawMaterial + c.catalystSolvent + c.utilities + c.royalty,
    sellingResearch: c.selling + c.research,
  };
}

// ---- step 3: depreciation by asset class ------------------------------------------

export interface AssetClass {
  name: string;
  cost: number;       // million EUR
  life: number;       // years
  residual: number;   // fraction of the cost left at the end of the life
}

export const classesStart = (): AssetClass[] => [
  { name: "Engineering and start-up", cost: 6, life: 3, residual: 0 },
  { name: "Equipment", cost: 38, life: 10, residual: 0.05 },
  { name: "Buildings and site", cost: 16, life: 25, residual: 0.10 },
];

/** Depreciation of each year 1..horizon by class: cost (1 - residual) / life while j <= life. */
export function classSchedule(cs: readonly AssetClass[], horizon: number): number[] {
  const out: number[] = [];
  for (let j = 1; j <= horizon; j++) {
    let d = 0;
    for (const c of cs) if (c.life > 0 && j <= c.life) d += c.cost * (1 - c.residual) / c.life;
    out.push(d);
  }
  return out;
}

/** The engine's single straight line over `life` years on the whole cost (no residual in the base). */
export function singleSchedule(total: number, life: number, horizon: number): number[] {
  const out: number[] = [];
  for (let j = 1; j <= horizon; j++) out.push(life > 0 && j <= life ? total / life : 0);
  return out;
}

export interface DeprComparison {
  total: number;
  byClass: number[]; single: number[];
  /** present value of the tax saved by depreciating, each way */
  pvShieldClass: number; pvShieldSingle: number;
  /** book value left at the horizon: the cost less what was depreciated */
  bookClass: number; bookSingle: number;
}

export function compareDepreciation(cs: readonly AssetClass[], singleLife: number,
  tax: number, rate: number, horizon: number): DeprComparison {
  const total = cs.reduce((s, c) => s + c.cost, 0);
  const byClass = classSchedule(cs, horizon);
  const single = singleSchedule(total, singleLife, horizon);
  const pv = (d: readonly number[]) =>
    d.reduce((s, x, k) => s + tax * x / Math.pow(1 + rate, k + 1), 0);
  const sum = (d: readonly number[]) => d.reduce((s, x) => s + x, 0);
  return { total, byClass, single, pvShieldClass: pv(byClass), pvShieldSingle: pv(single),
    bookClass: total - sum(byClass), bookSingle: total - sum(single) };
}

// ---- step 5: the cash flow and what it gives -----------------------------------------

export type CostRoute = "itemised" | "turton";

export interface CashFlowResult {
  cf: number[];                 // years 0..life
  sales: number; cash: number; depreciation: number;
  npv: number; irr: number | null;
  discountedPayback: number | null;
  simplePayback: number | null;
}

export function cashFlowOf(p: RunPlant, route: CostRoute = "itemised"): CashFlowResult {
  const c = itemise(p);
  const cash = route === "itemised" ? c.cash : turton(p).comD;
  const d = c.depreciation;
  const cf: number[] = [-(p.fci + p.workingCapital)];
  for (let t = 1; t <= p.life; t++) {
    const dt = t <= p.deprLife ? d : 0;
    const taxable = c.sales - cash - dt;
    cf.push(taxable * (1 - p.tax) + dt);
  }
  cf[p.life] = (cf[p.life] ?? 0) + p.workingCapital + p.salvage * p.fci * (1 - p.tax);
  return {
    cf, sales: c.sales, cash, depreciation: d,
    npv: npvOf(cf, p.rate), irr: irrOf(cf),
    discountedPayback: paybackOf(cf, p.rate), simplePayback: paybackOf(cf, 0),
  };
}

/** First year in which the cumulative (discounted) cash flow reaches zero, interpolated within it; the engine's rule. */
export function paybackOf(cf: readonly number[], rate: number): number | null {
  let cum = 0;
  for (let t = 0; t < cf.length; t++) {
    const disc = (cf[t] ?? 0) / Math.pow(1 + rate, t);
    const prev = cum;
    cum += disc;
    if (cum >= 0 && t > 0) return (t - 1) + (disc !== 0 ? -prev / disc : 0);
  }
  return null;
}

/** i = (1 + T1)(1 + T2) - 1, the discount rate built from two components. */
export const composedRate = (t1: number, t2: number): number => (1 + t1) * (1 + t2) - 1;

/** The same, for a rate in constant prices turned into current prices with inflation. */
export const nominalRate = (real: number, inflation: number): number => composedRate(real, inflation);

// ---- step 4: fixed and variable costs, and the break-even capacity ------------------------

export interface BreakEven {
  /** sales and total cost at 100 % of capacity */
  salesFull: number; costFull: number;
  /** the cost that does not move with the quantity sold: at 0 % of capacity */
  fixed: number;
  /** the part of the cost that grows from 0 % to 100 % of capacity */
  variableFull: number;
  /** fraction of the capacity at which sales equal the total cost, or null */
  accounting: number | null;
  /** the same on cash cost (without depreciation and financing) */
  cash: number | null;
  /** fraction at which the NPV is zero on the SAME revenue, or null */
  npv: number | null;
}

export function breakEvenOf(p: RunPlant, route: CostRoute = "itemised"): BreakEven {
  const c1 = itemise(p, 1), c0 = itemise(p, 0);
  const salesFull = c1.sales;
  const fixed = c0.total, variableFull = c1.total - c0.total;
  const slope = salesFull - variableFull;
  const accounting = slope > 0 ? fixed / slope : null;
  const cashFixed = c0.cash, cashVar = c1.cash - c0.cash;
  const cashSlope = salesFull - cashVar;
  const cash = cashSlope > 0 ? cashFixed / cashSlope : null;
  // NPV is linear in the sold fraction: two evaluations give the root.
  const n0 = cashFlowOf({ ...p, load: 0 }, route).npv;
  const n1 = cashFlowOf({ ...p, load: 1 }, route).npv;
  const npv = n1 > n0 ? -n0 / (n1 - n0) : null;
  return { salesFull, costFull: c1.total, fixed, variableFull, accounting, cash, npv };
}

// ---- step 6: sensitivity, tornado, elasticity ----------------------------------------------

export type SensKey = "price" | "load" | "rawMaterial" | "catalystSolvent" | "utilities"
  | "wage" | "fci" | "rate" | "tax";

export const SENS_LABEL: Readonly<Record<SensKey, string>> = {
  price: "Selling price", load: "Quantity sold", rawMaterial: "Raw-material bill",
  catalystSolvent: "Catalyst and solvents", utilities: "Utilities",
  wage: "Wage", fci: "Fixed capital", rate: "Discount rate", tax: "Tax rate",
};

export const SENS_KEYS: readonly SensKey[] = ["price", "load", "rawMaterial", "catalystSolvent",
  "utilities", "wage", "fci", "rate", "tax"];

export interface SensRow {
  key: SensKey; label: string;
  npvLow: number; npvHigh: number;
  /** (dNPV / NPV0) / (dx / x0), central; null when NPV0 is zero */
  elasticity: number | null;
  /** share of the cash cost of production for a cost input, null for the others */
  costShare: number | null;
  above10: boolean;
}

export function sensitivityOf(p: RunPlant, delta: number, route: CostRoute = "itemised"): SensRow[] {
  const base = cashFlowOf(p, route);
  const c = itemise(p);
  const shareOf: Partial<Record<SensKey, number>> = {
    rawMaterial: c.rawMaterial, catalystSolvent: c.catalystSolvent, utilities: c.utilities,
    wage: c.labour,
  };
  return SENS_KEYS.map((key) => {
    const x0 = p[key];
    const lo = cashFlowOf({ ...p, [key]: x0 * (1 - delta) }, route).npv;
    const hi = cashFlowOf({ ...p, [key]: x0 * (1 + delta) }, route).npv;
    const part = shareOf[key];
    const share = part === undefined || c.cash <= 0 ? null : part / c.cash;
    return {
      key, label: SENS_LABEL[key], npvLow: lo, npvHigh: hi,
      elasticity: Math.abs(base.npv) > 1e-12 ? ((hi - lo) / base.npv) / (2 * delta) : null,
      costShare: share, above10: share !== null && share >= 0.10,
    };
  }).sort((a, b) => Math.abs(b.npvHigh - b.npvLow) - Math.abs(a.npvHigh - a.npvLow));
}

// ---- step 7: market arithmetic ------------------------------------------------------------------

/** A cost of year x brought to the price level of year "now": cost * index_now / index_x. */
export const actualised = (cost: number, indexNow: number, indexThen: number): number =>
  cost * indexNow / indexThen;

/** Currency conversion with a declared rate: target units per one source unit. */
export const converted = (amount: number, targetPerSource: number): number =>
  amount * targetPerSource;

/** Apparent consumption = production + imports - exports. */
export const apparentConsumption = (production: number, imports: number, exports: number): number =>
  production + imports - exports;

/** CIF = FOB + freight + insurance, the last two declared as fractions of FOB. */
export const cifOf = (fob: number, freight: number, insurance: number): number =>
  fob * (1 + freight + insurance);

/** Unit gross margin: price less the raw-material cost per unit sold. */
export const unitMargin = (price: number, rawPerUnit: number): { margin: number; fraction: number } =>
  ({ margin: price - rawPerUnit, fraction: price > 0 ? (price - rawPerUnit) / price : NaN });
