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
  Patent expiry and generic entry -- the arithmetic (commission C195,
  DECIDED 2026-11-02).  React-free: the page (PatentExpiryTool.tsx) draws
  what this file computes, and tests/patentExpiry.test.ts recomputes every
  number from the declared curves by hand.

  WHAT IS COMPUTED, in four lines.  Market year k = 1, 2, ... counts the
  years since the FIRST generic entry.  The newcomer (the student's plant)
  launches in market year k0 = 1 + delay.  In market year k:

      generic share of the molecule's volume   g_k = (G(k-1) + G(k)) / 2
      producers on the market                   n_k = rivals(k) + 1
      newcomer's share of the generic volume    w(n_k)
      generic price / originator's pre-LoE      rho_k  (by competitors or by time)

  and the newcomer sells  min(V0 g_k w(n_k), Q)  tablets at  P0 rho_k.  G is
  a CUMULATIVE curve read at the END of a year, so a year's volume uses the
  mean of its two ends (the trapezoid) -- the curve is "30 % at the end of
  year one", not "30 % through year one".

  EVERY CURVE IS DATA THE STUDENT CAN READ AND EDIT, each point with an origin
  word: `stated` (a published study states this very number, cited) or
  `assumed` (interpolated, extended or simply illustrative, with its reason).
  Nothing here is a prediction, and no commercial-database figure is shipped.
\*---------------------------------------------------------------------------*/

export type PointOrigin = "stated" | "assumed";

export interface CurvePoint {
  x: number;
  y: number;
  origin: PointOrigin;
  /** why this point has this origin (the page shows it) */
  note: string;
}

export interface DeclaredCurve {
  id: "priceByCompetitors" | "priceByTime" | "genericShare" | "rivals"
    | "newcomerShare";
  label: string;
  xLabel: string;
  yLabel: string;
  points: CurvePoint[];
  /** the study the stated points come from, or "none" */
  source: string;
}

/** Piecewise-linear read of a curve, held at its first and last points. */
export function readCurve(points: readonly CurvePoint[], x: number): number {
  const p = [...points].sort((a, b) => a.x - b.x);
  let prev = p[0];
  if (prev === undefined) return NaN;
  if (x <= prev.x) return prev.y;
  for (const q of p.slice(1)) {
    if (x <= q.x) {
      const t = (x - prev.x) / (q.x - prev.x);
      return prev.y + t * (q.y - prev.y);
    }
    prev = q;
  }
  return prev.y;
}

/** Piecewise-CONSTANT read (a count of producers is a step function). */
export function readStep(points: readonly CurvePoint[], x: number): number {
  const p = [...points].sort((a, b) => a.x - b.x);
  const first = p[0];
  if (first === undefined) return NaN;
  let y = first.y;
  for (const q of p) if (q.x <= x) y = q.y;
  return y;
}

// ---- Sources actually read -------------------------------------------------

export interface PatentSource {
  short: string;
  cite: string;
  read: string;
  url: string;
}

export const PATENT_SOURCES: readonly PatentSource[] = [
  { short: "FDA 2019",
    cite: "Conrad R, Lutter R. Generic Competition and Drug Prices: New "
      + "Evidence Linking Greater Generic Competition and Lower Generic Drug "
      + "Prices. U.S. Food and Drug Administration, December 2019",
    read: "p. 2 (the prose under the figure): generic AMP 39 % below the "
      + "brand's pre-entry AMP with one generic producer, 54 % with two, "
      + "79 % with four, more than 95 % with six or more; invoice basis "
      + "31, 44, 73 and more than 95 %.  Median over products with initial "
      + "generic entry in 2015-2017, United States retail.  The values for "
      + "three and five producers are in the report's figure only and were "
      + "not read",
    url: "https://www.fda.gov/media/133509/download" },
  { short: "EC 2009",
    cite: "European Commission, Pharmaceutical Sector Inquiry, Fact Sheet "
      + "\"Prices, time to generic entry and consumer savings\" (the fact "
      + "sheet is headed Preliminary Report; it is the one the Commission "
      + "lists for the Final Report of 8 July 2009), p. 1-2",
    read: "p. 1: generic medicines enter on average about 25 % below the "
      + "originator's price before loss of exclusivity and, after two "
      + "years, are 40 % below it (sample: medicines with generic entry "
      + "2000-2007; originator prices also fall, no figure given); p. 2: "
      + "generics reach about 30 % of the volume at the end of the first "
      + "year and 45 % after two years; the average gap between loss of "
      + "exclusivity and first generic entry is more than seven months",
    url: "https://competition-policy.ec.europa.eu/sectors/pharmaceuticals-health-services/pharmaceutical-sector-inquiry_en" },
  { short: "Dossier",
    cite: "docs/design/apalutamide-design-basis-dossier.md, sections 3.3, "
      + "3.4, 3.6 and 4.4 (this repository)",
    read: "the European demand arithmetic (2121 MUSD x 0.533 x 0.92 / 75 "
      + "EUR per patient-day), the 19.13 EUR ex-factory reference price "
      + "per tablet, the exclusivity facts (US 12,303,493 B2, anticipated "
      + "expiry 3 Dec 2035, an assumption by Google Patents; EP "
      + "counterparts and SPCs NOT verified)",
    url: "docs/design/apalutamide-design-basis-dossier.md" },
];

// ---- The declared curves (defaults) ---------------------------------------

const FDA = "FDA 2019 p. 2 (median generic price cut, AMP basis)";

export function defaultCurves(): DeclaredCurve[] {
  return [
    {
      id: "priceByCompetitors",
      label: "Generic price relative to the originator's price before "
        + "loss of exclusivity, by number of generic producers",
      xLabel: "generic producers", yLabel: "price ratio",
      source: "FDA 2019 (United States)",
      points: [
        { x: 1, y: 0.61, origin: "stated", note: `${FDA}: 39 % cut` },
        { x: 2, y: 0.46, origin: "stated", note: `${FDA}: 54 % cut` },
        { x: 3, y: 0.335, origin: "assumed",
          note: "straight line between the stated 2 and 4 producers; the "
            + "report's figure has it, this page did not read it" },
        { x: 4, y: 0.21, origin: "stated", note: `${FDA}: 79 % cut` },
        { x: 5, y: 0.13, origin: "assumed",
          note: "straight line between the stated 4 and 6 producers" },
        { x: 6, y: 0.05, origin: "stated",
          note: "the report says MORE than 95 % cut at six or more; 0.05 is "
            + "the bound, so the true median is lower" },
      ],
    },
    {
      id: "priceByTime",
      label: "Generic price relative to the originator's price before "
        + "loss of exclusivity, by years since the first generic entry",
      xLabel: "years since first generic entry", yLabel: "price ratio",
      source: "EC 2009 (European Union, average of medicines)",
      points: [
        { x: 0, y: 0.75, origin: "stated",
          note: "EC 2009 p. 1: generics enter about 25 % below" },
        { x: 1, y: 0.675, origin: "assumed",
          note: "straight line between the stated entry and two-year points" },
        { x: 2, y: 0.60, origin: "stated",
          note: "EC 2009 p. 1: 40 % below after two years" },
        { x: 3, y: 0.60, origin: "assumed",
          note: "held at the two-year value; the study reports nothing later "
            + "that this page read" },
      ],
    },
    {
      id: "genericShare",
      label: "Cumulative generic share of the molecule's volume, at the END "
        + "of each year since the first generic entry",
      xLabel: "years since first generic entry", yLabel: "generic volume share",
      source: "EC 2009 (European Union)",
      points: [
        { x: 0, y: 0, origin: "assumed", note: "by definition: no generic yet, so the curve starts at zero (a convention, not a study's number)" },
        { x: 1, y: 0.30, origin: "stated", note: "EC 2009 p. 2: about 30 % at the end of year one" },
        { x: 2, y: 0.45, origin: "stated", note: "EC 2009 p. 2: 45 % after two years" },
        { x: 3, y: 0.55, origin: "assumed", note: "illustration: the study stops here; the curve is continued with a decreasing slope" },
        { x: 4, y: 0.63, origin: "assumed", note: "illustration, as above" },
        { x: 5, y: 0.70, origin: "assumed", note: "illustration, as above" },
        { x: 6, y: 0.75, origin: "assumed", note: "illustration: a plateau chosen by the page, not a finding" },
      ],
    },
    {
      id: "rivals",
      label: "Generic producers on the market besides the newcomer, in "
        + "each year since the first generic entry",
      xLabel: "market year", yLabel: "rival producers",
      source: "none",
      points: [
        { x: 1, y: 1, origin: "assumed", note: "illustration: one rival in the first year" },
        { x: 2, y: 2, origin: "assumed", note: "illustration" },
        { x: 3, y: 3, origin: "assumed", note: "illustration: three rivals, so four producers with the newcomer, the case's own 2-4 competitor range" },
      ],
    },
    {
      id: "newcomerShare",
      label: "The newcomer's share of the generic volume, by number of "
        + "generic producers on the market",
      xLabel: "generic producers", yLabel: "newcomer's share",
      source: "none",
      points: [
        { x: 1, y: 1, origin: "assumed", note: "equal split, 1/n: no study read states a share by entrant for a product class" },
        { x: 2, y: 0.5, origin: "assumed", note: "equal split, 1/n" },
        { x: 3, y: 1 / 3, origin: "assumed", note: "equal split, 1/n" },
        { x: 4, y: 0.25, origin: "assumed", note: "equal split, 1/n" },
        { x: 5, y: 0.2, origin: "assumed", note: "equal split, 1/n" },
        { x: 6, y: 1 / 6, origin: "assumed", note: "equal split, 1/n" },
      ],
    },
  ];
}

// ---- Inputs ----------------------------------------------------------------

export type PriceMode = "byCompetitors" | "byTime";

export interface PatentInputs {
  /** originator's annual net sales in the market, million EUR / yr */
  salesMEUR: number;
  /** originator's net ex-factory price per tablet before loss of exclusivity, EUR */
  originatorPrice: number;
  /** loss of exclusivity, ISO date */
  loeDate: string;
  /** months from loss of exclusivity to the first generic entry */
  entryLagMonths: number;
  /** how many years after the first generic entry the newcomer launches */
  delayYears: number;
  /** operating years of the project (the case's projectLife) */
  projectLife: number;
  /** the case's discountRate */
  discountRate: number;
  /** mass of one packaged tablet, g (the case's run) */
  tabletMassG: number;
  /** the plant's design production Q, million tablets / yr */
  capacityMTablets: number;
  priceMode: PriceMode;
  /** multiplies the price ratio: 1 = the curve, 0.5 = erosion twice as deep */
  priceDepth: number;
  curves: DeclaredCurve[];
}

/** The defaults are the apalutamide01_tablets business case: 2121 MUSD x
 *  0.533 x 0.92 = 1040 MEUR (the dossier rounds an intermediate
 *  and writes 1039, the default below), the 19.13 EUR reference price (dossier 3.2,
 *  3.3), 0.72546 g a tablet and 14.0 M tablets a year (10156 kg), the
 *  case's projectLife 10 and discountRate 0.10. */
export function defaultInputs(): PatentInputs {
  return {
    salesMEUR: 1039, originatorPrice: 19.13,
    loeDate: "2035-12-03", entryLagMonths: 7, delayYears: 0,
    projectLife: 10, discountRate: 0.10,
    tabletMassG: 0.72546, capacityMTablets: 14.0,
    priceMode: "byCompetitors", priceDepth: 1,
    curves: defaultCurves(),
  };
}

export function curveOf(inp: PatentInputs, id: DeclaredCurve["id"]): DeclaredCurve {
  const c = inp.curves.find((x) => x.id === id);
  if (!c) throw new Error(`patentExpiryMath: curve ${id} is missing`);
  return c;
}

// ---- The model -------------------------------------------------------------

export interface YearRow {
  /** operating year of the cash flow, 1..projectLife (year 0 is the launch) */
  j: number;
  /** market year since the first generic entry */
  k: number;
  /** generic producers on the market, the newcomer included */
  n: number;
  /** generic share of the molecule's volume, mean over the year */
  genericShare: number;
  /** the newcomer's share of the generic volume */
  newcomerShare: number;
  /** generic price / originator's pre-LoE price, after the depth factor */
  priceRatio: number;
  /** what the market would give the newcomer, tablets / yr */
  demandTablets: number;
  /** what the plant sells, tablets / yr */
  soldTablets: number;
  /** the plant is at its capacity this year */
  capped: boolean;
  /** EUR per tablet */
  price: number;
  /** million EUR / yr */
  revenueMEUR: number;
  /** kg of packaged tablets / yr */
  soldKg: number;
  /** EUR per kg of packaged tablets */
  pricePerKg: number;
  /** (1 + i)^-j */
  discount: number;
}

export interface Summary {
  rows: YearRow[];
  /** mean tablets sold per operating year */
  meanTablets: number;
  totalRevenueMEUR: number;
  /** sum of discounted revenues, million EUR (to the launch) */
  pvRevenueMEUR: number;
  /** the same revenue discounted back to the FIRST GENERIC ENTRY, i.e.
   *  PV x (1 + i)^-delay: the common date on which a late entrant and an
   *  on-time one can be compared (the case's NPV is taken at the launch) */
  pvAtFirstEntryMEUR: number;
  /** undiscounted: total revenue / total tablets, EUR per tablet */
  meanPrice: number;
  /** discounted: PV revenue / sum(sold_j d_j), EUR per tablet */
  pasteTabletPrice: number;
  /** the same, EUR per kg of packaged tablets */
  pastePricePerKg: number;
  /** rampUp entries, sold_j / Q, one per operating year */
  rampUp: number[];
  /** Q in kg of packaged tablets per year */
  designKgPerYear: number;
  /** originator's pre-LoE volume, tablets / yr */
  v0: number;
}

export function originatorVolume(inp: PatentInputs): number {
  return (inp.salesMEUR * 1e6) / inp.originatorPrice;
}

export function priceRatioAt(inp: PatentInputs, k: number, n: number): number {
  const byN = readCurve(curveOf(inp, "priceByCompetitors").points, n);
  const T = curveOf(inp, "priceByTime").points;
  const byT = (readCurve(T, k - 1) + readCurve(T, k)) / 2;
  return (inp.priceMode === "byCompetitors" ? byN : byT) * inp.priceDepth;
}

export function runModel(inp: PatentInputs): Summary {
  const G = curveOf(inp, "genericShare").points;
  const R = curveOf(inp, "rivals").points;
  const W = curveOf(inp, "newcomerShare").points;
  const v0 = originatorVolume(inp);
  const cap = inp.capacityMTablets * 1e6;
  const k0 = 1 + inp.delayYears;
  const rows: YearRow[] = [];
  for (let j = 1; j <= inp.projectLife; j++) {
    const k = k0 + j - 1;
    const g = (readCurve(G, k - 1) + readCurve(G, k)) / 2;
    const n = readStep(R, k) + 1;
    const w = readCurve(W, n);
    const ratio = priceRatioAt(inp, k, n);
    const demand = v0 * g * w;
    const sold = Math.min(demand, cap);
    const price = inp.originatorPrice * ratio;
    const d = Math.pow(1 + inp.discountRate, -j);
    rows.push({
      j, k, n, genericShare: g, newcomerShare: w, priceRatio: ratio,
      demandTablets: demand, soldTablets: sold, capped: demand > cap,
      price, revenueMEUR: (sold * price) / 1e6,
      soldKg: (sold * inp.tabletMassG) / 1000,
      pricePerKg: price / (inp.tabletMassG / 1000), discount: d,
    });
  }
  const totalTablets = rows.reduce((s, r) => s + r.soldTablets, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenueMEUR, 0);
  const pv = rows.reduce((s, r) => s + r.revenueMEUR * r.discount, 0);
  const dTablets = rows.reduce((s, r) => s + r.soldTablets * r.discount, 0);
  const pasteTab = dTablets > 0 ? (pv * 1e6) / dTablets : NaN;
  return {
    rows,
    meanTablets: totalTablets / inp.projectLife,
    totalRevenueMEUR: totalRev, pvRevenueMEUR: pv,
    pvAtFirstEntryMEUR: pv * Math.pow(1 + inp.discountRate, -inp.delayYears),
    meanPrice: totalTablets > 0 ? (totalRev * 1e6) / totalTablets : NaN,
    pasteTabletPrice: pasteTab,
    pastePricePerKg: pasteTab / (inp.tabletMassG / 1000),
    rampUp: rows.map((r) => (cap > 0 ? r.soldTablets / cap : NaN)),
    designKgPerYear: (cap * inp.tabletMassG) / 1000,
    v0,
  };
}

export interface Scenario {
  id: "base" | "late1" | "late2" | "deeper";
  label: string;
  inputs: PatentInputs;
  summary: Summary;
  /** change of the PV revenue at the first generic entry against the base, % */
  pvChangePct: number;
}

/** The sensitivity the student READS: the base, the entrant late by one and
 *  two years, and the erosion deeper by `deeperFactor` -- each moved ALONE
 *  from the base, on the same curves.  Not a prediction. */
export function scenarios(inp: PatentInputs, deeperFactor: number): Scenario[] {
  const make = (id: Scenario["id"], label: string, patch: Partial<PatentInputs>) => {
    const inputs = { ...inp, ...patch };
    return { id, label, inputs, summary: runModel(inputs) };
  };
  const list = [
    make("base", "as declared", {}),
    make("late1", "entrant late by 1 year", { delayYears: inp.delayYears + 1 }),
    make("late2", "entrant late by 2 years", { delayYears: inp.delayYears + 2 }),
    make("deeper", `erosion deeper (price ratio x ${deeperFactor})`,
      { priceDepth: inp.priceDepth * deeperFactor }),
  ];
  const base = list[0]?.summary.pvAtFirstEntryMEUR ?? NaN;
  return list.map((s) => ({
    ...s, pvChangePct: base > 0 ? (100 * (s.summary.pvAtFirstEntryMEUR - base)) / base : NaN,
  }));
}

// ---- Calendar --------------------------------------------------------------

/** ISO date plus whole months, UTC; null when the date does not read. */
export function addMonthsIso(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo || t.getUTCDate() !== d) return null;
  const e = new Date(Date.UTC(y, mo + months, 1));
  const last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
  e.setUTCDate(Math.min(d, last));
  return e.toISOString().slice(0, 10);
}

/** The text a student pastes into the case: the `rampUp` list and the price. */
export function pasteBlock(inp: PatentInputs, s: Summary): string {
  const f = (x: number, p: number) => x.toFixed(p);
  return [
    "// system/postDict, economics { ... }   (rampUp is the production fraction of each operating year)",
    `rampUp ( ${s.rampUp.map((x) => f(x, 4)).join(" ")} );`,
    "// system/postDict, batchPlan { production { ... } }",
    `perYear  ${f(s.designKgPerYear, 0)} kg;   // = ${f(inp.capacityMTablets, 1)} million tablets x ${inp.tabletMassG} g`,
    "// constant/economics, products ( ... )  -- the discounted-volume-weighted price",
    `price    ${f(s.pastePricePerKg, 1)};   // EUR/kg of packagedTablets = ${f(s.pasteTabletPrice, 3)} EUR/tablet`,
  ].join("\n");
}
