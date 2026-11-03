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
  What a plant costs to build -- the arithmetic (DEV.md 4c C212 A).

  Pure functions, no React.  Three routes to a fixed capital (Lang, a
  factored estimate, the engine's bare-module route), three working capitals
  and a loan schedule.  Every default input is an ILLUSTRATION the student
  replaces; a typical range is NOT printed (none has been checked against its
  book): beside each input is a pointer to the chapter that tabulates it.
  The engine's own routes are re-written from the lines listed in
  ENGINE_SOURCES, which tests/plantCost.test.ts holds to the source.
\*---------------------------------------------------------------------------*/

// ---- 2. Lang ----------------------------------------------------------------

export type ProcessType = "solids" | "solidsFluids" | "fluids";

/** H. J. Lang's factors, Chem. Eng. 54(10) 117 (1947) and 55(6) 112 (1948):
 *  fixed capital = K x purchased equipment cost. */
export const LANG_FACTORS: Readonly<Record<ProcessType, number>> = {
  solids: 3.10,
  solidsFluids: 3.63,
  fluids: 4.74,
};

export const PROCESS_TYPE_LABEL: Readonly<Record<ProcessType, string>> = {
  solids: "solids processing",
  solidsFluids: "solids-fluids processing",
  fluids: "fluids processing",
};

export function langFci(cbe: number, type: ProcessType): number {
  return LANG_FACTORS[type] * cbe;
}

// ---- 3. the factored estimate -------------------------------------------------

export type DirectKey =
  | "installation" | "piping" | "instrumentation" | "electrical"
  | "buildings" | "yard" | "land" | "services" | "insulation";
export type IndirectKey = "engineering" | "construction" | "fee" | "contingency";

export interface Range { lo: number; hi: number }

export interface FactorRow<K extends string> {
  key: K;
  label: string;
  /** Typical range as a fraction of the purchased equipment cost.  Null for
   *  every row today: a range not checked against its book is not shipped.
   *  `source` is then a POINTER to where the student reads it. */
  range: Range | null;
  source: string;
}

const PTW = "Peters, Timmerhaus & West, Plant Design and Economics for Chemical Engineers, 5th ed. (2003), ch. 6, tabulates this as a fraction of delivered equipment cost by process type (solid, solid-fluid, fluid): read it there and declare your value with that source";

export const DIRECT_ROWS: readonly FactorRow<DirectKey>[] = [
  { key: "installation", label: "Equipment installation", range: null, source: PTW },
  { key: "piping", label: "Process piping", range: null, source: PTW },
  { key: "instrumentation", label: "Instrumentation and controls", range: null, source: PTW },
  { key: "electrical", label: "Electrical systems", range: null, source: PTW },
  { key: "buildings", label: "Buildings (including services)", range: null, source: PTW },
  { key: "yard", label: "Yard improvements", range: null, source: PTW },
  { key: "land", label: "Land", range: null, source: PTW },
  { key: "services", label: "Service facilities", range: null, source: PTW },
  { key: "insulation", label: "Insulation (if not inside installation)", range: null,
    source: "no number given: declare it with your source" },
];

export const INDIRECT_ROWS: readonly FactorRow<IndirectKey>[] = [
  { key: "engineering", label: "Engineering and supervision", range: null,
    source: "books quote it on another base than the direct cost: declare yours with your source" },
  { key: "construction", label: "Construction expenses", range: null,
    source: "books quote it on another base than the direct cost: declare yours with your source" },
  { key: "fee", label: "Contractor's fee", range: null,
    source: "declare it with your source" },
  { key: "contingency", label: "Contingency", range: null,
    source: "declare it with your source" },
];

export type DirectFactors = Readonly<Record<DirectKey, number>>;
export type IndirectFactors = Readonly<Record<IndirectKey, number>>;

/** ILLUSTRATION values (not any book's): the student replaces them. */
export function directDefaults(): DirectFactors {
  return {
    installation: 0.40, piping: 0.30, instrumentation: 0.12, electrical: 0.10,
    buildings: 0.20, yard: 0.10, land: 0.05, services: 0.40, insulation: 0.03,
  };
}
export function indirectDefaults(): IndirectFactors {
  return { engineering: 0.15, construction: 0.10, fee: 0.05, contingency: 0.10 };
}

export interface Factored {
  directItems: Readonly<Record<DirectKey, number>>;
  direct: number;
  indirectItems: Readonly<Record<IndirectKey, number>>;
  indirect: number;
  fci: number;
  /** FCI over the purchased equipment cost: the "Lang factor" this estimate implies. */
  impliedLang: number;
}

/** D = CBe (1 + sum f_i);  I = D sum g_j;  FCI = D + I. */
export function factored(cbe: number, f: DirectFactors, g: IndirectFactors): Factored {
  const directItems = {} as Record<DirectKey, number>;
  let sumF = 0;
  for (const r of DIRECT_ROWS) { directItems[r.key] = cbe * f[r.key]; sumF += f[r.key]; }
  const direct = cbe * (1 + sumF);
  const indirectItems = {} as Record<IndirectKey, number>;
  let indirect = 0;
  for (const r of INDIRECT_ROWS) {
    indirectItems[r.key] = direct * g[r.key];
    indirect += direct * g[r.key];
  }
  const fci = direct + indirect;
  return { directItems, direct, indirectItems, indirect, fci, impliedLang: cbe > 0 ? fci / cbe : NaN };
}

/** Is a factor outside the typical range the page cites?  null range = no claim. */
export function outsideRange(value: number, r: Range | null): "below" | "above" | "inside" | "none" {
  if (r === null) return "none";
  if (value < r.lo - 1e-12) return "below";
  if (value > r.hi + 1e-12) return "above";
  return "inside";
}

// ---- 4. the engine's bare-module route -------------------------------------------

export interface EquipItem { name: string; cp: number; fbm: number }

/** Choupo's FCI = contingencyFee x sum C_BM + siteFactor x sum C_BM0
 *  (EconomicsPass.cpp:2690).  On this page the items are at base conditions,
 *  so C_BM0 = C_BM: a stated simplification, not the engine's per-item
 *  material and pressure factors. */
export const ENGINE_CONTINGENCY_FEE = 1.18;   // costing::contingencyAndFee, CostingModel.H:69
export const ENGINE_SITE_FACTOR = 0.50;       // EconomicsPass.cpp:2553

export interface BareModule {
  sumCp: number;
  sumCbm: number;
  ctm: number;
  fci: number;
  impliedLang: number;
}

export function bareModule(
  items: readonly EquipItem[], contingencyFee = ENGINE_CONTINGENCY_FEE,
  siteFactor = ENGINE_SITE_FACTOR,
): BareModule {
  const sumCp = items.reduce((s, x) => s + x.cp, 0);
  const sumCbm = items.reduce((s, x) => s + x.cp * x.fbm, 0);
  const ctm = contingencyFee * sumCbm;
  const fci = ctm + siteFactor * sumCbm;
  return { sumCp, sumCbm, ctm, fci, impliedLang: sumCp > 0 ? fci / sumCp : NaN };
}

export interface ThreeRoutes {
  lang: number; factored: number; bareModule: number;
  min: number; max: number; spread: number;
}

export function threeRoutes(lang: number, fac: number, bm: number): ThreeRoutes {
  const v = [lang, fac, bm];
  const min = Math.min(...v), max = Math.max(...v);
  return { lang, factored: fac, bareModule: bm, min, max, spread: min > 0 ? max / min : NaN };
}

export type ExampleId = "fluids" | "tablets" | "asgharian";

/** A worked example taken from a paper: the citation, the licence words, the
 *  multiplier the authors apply and the figures they print. */
export interface PaperExample {
  citation: string;
  licence: string;
  /** Lang multiplier as the paper applies it */
  langK: number;
  /** the paper's printed total of the component costs, M EUR */
  printedTotal: number;
  /** the paper's printed cost of establishing the plant, M EUR */
  printedPlant: number;
  where: string;
}

export interface ExampleDef {
  label: string;
  type: ProcessType;
  items: EquipItem[];
  /** present only for a list read from a paper */
  paper?: PaperExample;
  /** a sentence shown under the list when something in it is not the paper's */
  note?: string;
}

/** Equipment lists.  `fluids` and `tablets` are invented, labelled
 *  illustrations (purchased cost in M EUR, bare-module multiplier F_BM; no
 *  vendor, no quotation).  `asgharian` is Table 3 of a CC BY paper, re-typed
 *  as numbers (no figure, no table image copied). */
export const EXAMPLES: Readonly<Record<ExampleId, ExampleDef>> = {
  fluids: {
    label: "Fluid-processing plant (generic illustration)",
    type: "fluids",
    items: [
      { name: "Reactor (stirred tank)", cp: 0.45, fbm: 4.0 },
      { name: "Heat exchangers (2)", cp: 0.30, fbm: 3.2 },
      { name: "Distillation column with trays", cp: 0.55, fbm: 4.2 },
      { name: "Pumps (4)", cp: 0.12, fbm: 3.3 },
      { name: "Storage tanks (3)", cp: 0.25, fbm: 3.0 },
    ],
  },
  tablets: {
    label: "Pharmaceutical tablet plant (solids, illustration)",
    type: "solids",
    items: [
      { name: "High-shear granulator", cp: 0.60, fbm: 3.2 },
      { name: "Fluid-bed dryer", cp: 0.80, fbm: 3.6 },
      { name: "Blender", cp: 0.25, fbm: 3.0 },
      { name: "Tablet press", cp: 0.90, fbm: 2.8 },
      { name: "Film coater", cp: 0.50, fbm: 3.2 },
      { name: "Blister packaging line", cp: 1.20, fbm: 2.6 },
    ],
  },
  asgharian: {
    label: "Green ammonia, 8.5 kg/h (Asgharian et al. 2024, Table 3)",
    type: "fluids",
    // Table 3, p. 12 of the printed article, column "Costs (M EUR)".
    // The paper gives no bare-module multiplier: F_BM is a PLACEHOLDER of 1.0.
    items: [
      { name: "AEL (alkaline electrolyser)", cp: 0.19, fbm: 1.0 },
      { name: "Catalyst and sorbent material", cp: 0.00187, fbm: 1.0 },
      { name: "Reactors and containers for sorbent material", cp: 0.183, fbm: 1.0 },
      { name: "Compressors", cp: 0.242, fbm: 1.0 },
      { name: "Pumps", cp: 0.005, fbm: 1.0 },
      { name: "Heat exchangers", cp: 0.08, fbm: 1.0 },
      { name: "Distillation columns", cp: 0.17, fbm: 1.0 },
      { name: "Flash tank", cp: 0.015, fbm: 1.0 },
    ],
    paper: {
      citation: "H. Asgharian et al., \"Exceeding equilibrium limitations: Enhanced "
        + "temperature control for sustainable decentralized green ammonia production "
        + "- a techno-economic analysis\", Energy Conversion and Management 315 "
        + "(2024) 118764, doi 10.1016/j.enconman.2024.118764, Table 3 (p. 12)",
      licence: "\"This is an open access article under the CC BY license "
        + "(http://creativecommons.org/licenses/by/4.0/)\" (article footer, p. 1); "
        + "only the numbers of Table 3 are re-typed here, no figure is copied",
      langK: 4.7,
      printedTotal: 0.887,
      printedPlant: 4.17,
      where: "Section 3.3: \"one can estimate the establishment costs of the plant using "
        + "a Lang factor, which has a value of 4.7 according to reference [50] for "
        + "fluid processing plants\"",
    },
    note: "The paper gives costs only (estimated, as the paper states, with a commercial "
      + "cost-estimating program); the bare-module factor F_BM of 1.0 is a placeholder "
      + "of this page, not the paper's, so step 4 shows the engine's route on the "
      + "purchased costs alone.",
  },
};

/** Lang's multiplier as a paper applies it: its K on the summed list.  Returns
 *  the unrounded product, the product rounded to the paper's two decimals and
 *  whether that reproduces the paper's printed figure. */
export function paperLang(items: readonly EquipItem[], p: PaperExample) {
  const sum = items.reduce((t, x) => t + x.cp, 0);
  const product = p.langK * sum;
  const reproduces = Math.abs(Math.round(product * 100) / 100 - p.printedPlant) < 1e-9
    && Math.abs(Math.round(sum * 1000) / 1000 - p.printedTotal) < 1e-9;
  return { sum, product, reproduces };
}

// ---- 5. working capital -----------------------------------------------------------

export interface WcInputs {
  /** annual raw-material bill, M EUR/yr */
  rawBill: number;
  /** annual cash cost of manufacture (no depreciation), M EUR/yr */
  com: number;
  /** annual sales, M EUR/yr */
  sales: number;
  /** fixed capital, M EUR */
  fci: number;
  daysRaw: number; daysProduct: number; daysReceivables: number;
  daysPayables: number; daysCash: number;
  fractionOfSales: number;
  fractionOfFci: number;
}

/** ILLUSTRATION values. */
export function wcDefaults(): WcInputs {
  return {
    rawBill: 12, com: 20, sales: 30, fci: 40,
    daysRaw: 30, daysProduct: 30, daysReceivables: 45, daysPayables: 30, daysCash: 0,
    fractionOfSales: 0.10, fractionOfFci: 0.15,
  };
}

export interface WcResult {
  rawStock: number; productStock: number; receivables: number; cash: number; payables: number;
  itemised: number; ofSales: number; ofFci: number;
  min: number; max: number; spread: number;
}

/** (i) itemised -- a "day" of an annual figure is 1/365 of it, as in the
 *  engine (EconomicsPass.cpp:216, :365-:371); (ii) a fraction of sales;
 *  (iii) a fraction of the fixed capital. */
export function workingCapitals(w: WcInputs): WcResult {
  const rawStock = w.rawBill * w.daysRaw / 365;
  const productStock = w.com * w.daysProduct / 365;
  const receivables = w.sales * w.daysReceivables / 365;
  const cash = w.com * w.daysCash / 365;
  const payables = w.rawBill * w.daysPayables / 365;
  const itemised = rawStock + productStock + receivables + cash - payables;
  const ofSales = w.fractionOfSales * w.sales;
  const ofFci = w.fractionOfFci * w.fci;
  const v = [itemised, ofSales, ofFci];
  const min = Math.min(...v), max = Math.max(...v);
  return { rawStock, productStock, receivables, cash, payables, itemised, ofSales, ofFci,
    min, max, spread: min > 0 ? max / min : NaN };
}

/** A book that quotes working capital as a share x of TOTAL capital T = F + W
 *  gives W = x/(1-x) F: the fraction of the FIXED capital to type in (iii). */
export function fciFractionFromTciShare(x: number): number {
  return x / (1 - x);
}

// ---- 6. financing -----------------------------------------------------------------

export type Repayment = "annuity" | "linear";

export interface LoanInputs {
  fci: number;
  debtFraction: number;
  rate: number;
  constructionYears: number;
  graceYears: number;
  termYears: number;
  repayment: Repayment;
}

/** ILLUSTRATION values. */
export function loanDefaults(): LoanInputs {
  return {
    fci: 40, debtFraction: 0.5, rate: 0.06, constructionYears: 2,
    graceYears: 1, termYears: 6, repayment: "annuity",
  };
}

export interface LoanRow {
  year: number;
  phase: "construction" | "operation";
  open: number; draw: number; interestCapitalised: number; interestPaid: number;
  repayment: number; close: number;
}

export interface LoanSchedule {
  rows: LoanRow[];
  loanDrawn: number;
  idc: number;
  atStartup: number;
  interestPaidTotal: number;
  equity: number;
  /** a one-year construction accrues no interest: the whole outlay is made at its end */
  idcNote: boolean;
}

/** The engine's convention (EconomicsPass.cpp:1636-1700): construction year k
 *  draws debtFraction x FCI / Nc at the END of the year (the page spreads the
 *  outlay evenly; the engine follows the case's capital schedule); the
 *  interest on the balance already drawn is capitalised; in operation the
 *  interest on the opening balance is paid, the grace years repay nothing,
 *  then `termYears` repayments, annuity or linear, the last clearing the
 *  balance exactly. */
export function loanSchedule(L: LoanInputs): LoanSchedule {
  const Nc = Math.max(1, Math.round(L.constructionYears));
  const g = Math.max(0, Math.round(L.graceYears));
  const n = Math.max(1, Math.round(L.termYears));
  const r = L.rate;
  const rows: LoanRow[] = [];
  let B = 0, idc = 0, drawn = 0;
  for (let k = 1; k <= Nc; k++) {
    const draw = L.debtFraction * L.fci / Nc;
    const cap = r * B;
    const open = B;
    B += cap + draw;
    idc += cap; drawn += draw;
    rows.push({ year: k - Nc, phase: "construction", open, draw, interestCapitalised: cap,
      interestPaid: 0, repayment: 0, close: B });
  }
  const P = B;
  const annuity = L.repayment === "annuity"
    ? (r > 0 ? P * r / (1 - Math.pow(1 + r, -n)) : P / n) : 0;
  let paid = 0;
  for (let t = 1; t <= g + n; t++) {
    const open = B;
    const interest = r * B;
    let pr = 0;
    if (t > g) pr = (t === g + n) ? B : (L.repayment === "annuity" ? annuity - interest : P / n);
    B -= pr; paid += interest;
    rows.push({ year: t, phase: "operation", open, draw: 0, interestCapitalised: 0,
      interestPaid: interest, repayment: pr, close: B });
  }
  return { rows, loanDrawn: drawn, idc, atStartup: P, interestPaidTotal: paid,
    equity: L.fci - drawn, idcNote: Nc === 1 };
}

// ---- the lines the lesson cites, held to the engine by the test -------------------

export interface EngineSource { file: string; line: number; needle: string; says: string }

export const ENGINE_SOURCES: readonly EngineSource[] = [
  { file: "src/postProcessing/EconomicsPass.cpp", line: 2696,
    needle: "const scalar langFactor   = econDict_->lookupScalarOrDefault(\"langFactor\", 3.63);",
    says: "the Lang cross-check factor defaults to 3.63 (solids-fluids) and can be declared as langFactor" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 2697,
    needle: "const scalar FCI_Lang     = langFactor * sum_Cp;",
    says: "FCI_Lang = K times the sum of the purchased costs; a reconciliation line, never fed into the FCI" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 2690,
    needle: "const scalar FCI = contingencyFee * sum_C_BM + siteFactor * sum_C_BM0;",
    says: "the engine's FCI: contingencyFee times the sum of C_BM plus siteFactor times the sum of the base-case C_BM" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 2553,
    needle: "lookupScalarOrDefault(\"siteFactor\",           0.50)",
    says: "siteFactor defaults to 0.50" },
  { file: "src/postProcessing/costing/CostingModel.H", line: 69,
    needle: "inline constexpr scalar contingencyAndFee = 1.18;",
    says: "C_TM = 1.18 C_BM, contingency and fee" },
  { file: "src/postProcessing/costing/Turton.cpp", line: 722,
    needle: "const scalar C_TM       = costing::contingencyAndFee * C_BM;",
    says: "each item's total module cost is 1.18 times its bare-module cost" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 240,
    needle: "WorkingCapitalBuildUp buildWorkingCapital(",
    says: "the itemised working capital build-up (days of stock, receivables, payables, minimum cash)" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 216,
    needle: "of an annual figure is 1/365 of it, for every line alike.",
    says: "a day of an annual figure is 1/365 of it, for every line alike" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 365,
    needle: "dRec / 365.0 * R,",
    says: "receivables are days/365 of the revenue (at the sales price)" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 371,
    needle: "dPay / 365.0 * C_RM,",
    says: "payables are days/365 of the raw-material bill" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 2505,
    needle: "constexpr scalar workingCapitalDefault = 0.15;",
    says: "without a model the working capital is the fraction 0.15 of the FCI" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 548,
    needle: "THE LOAN AND THE EQUITY CASH FLOW (G4) -> reports/economics/financing.csv",
    says: "the loan schedule is written to reports/economics/financing.csv when the case declares financing {}" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 1640,
    needle: "draw[at(k - Nc)] += fin.debtFraction",
    says: "construction draws: debtFraction of each year's capital outlay, at the end of the year" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 1652,
    needle: "y.interestCapitalised = r * B;",
    says: "interest during construction is r times the balance already drawn, added to the balance" },
  { file: "src/postProcessing/EconomicsPass.cpp", line: 1673,
    needle: "y.interestPaid = r * B;",
    says: "operating years: interest on the opening balance is paid" },
];
