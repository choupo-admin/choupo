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
  Where to build it, what to make, and what it sells for -- the arithmetic
  (commission C212, the market side).  React-free: SiteProcessPriceTool.tsx
  draws what this file computes and tests/siteProcessPrice.test.ts recomputes
  it by hand.

  Three independent calculations, none of which needs the engine:

    1. a weighted-criteria matrix for choosing a site, and the sensitivity of
       its ranking to each weight (a closed-form crossing weight);
    2. a patent example (quantities in, product out, times) turned into a
       per-kg-of-product mass basis and a cycle-time basis;
    3. the margin chain between the shelf price and the ex-factory price,
       computed down and back up.

  NO NUMBER HERE IS A DATUM.  No criterion weight, no margin and no tax rate
  is shipped as a fact: every starting value is an illustration the student
  replaces, and the margins and taxes are the student's DECLARED inputs, read
  from the regulation of their market with its source.
\*---------------------------------------------------------------------------*/

// ---- 1. the weighted-criteria matrix ---------------------------------------

export interface Criterion {
  name: string;
  /** relative importance, any non-negative scale */
  weight: number;
  /** one score per site, same order as the sites */
  scores: number[];
}

/** weighted score of every site: sum(w_j s_ij) / sum(w_j); null if no weight. */
export function weightedScores(cs: readonly Criterion[], nSites: number): number[] | null {
  const W = cs.reduce((a, c) => a + c.weight, 0);
  if (!(W > 0)) return null;
  const out: number[] = [];
  for (let i = 0; i < nSites; i++) {
    out.push(cs.reduce((a, c) => a + c.weight * (c.scores[i] ?? 0), 0) / W);
  }
  return out;
}

/** site indices, best first (ties keep declaration order). */
export function rankOf(scores: readonly number[]): number[] {
  return scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]! || a - b);
}

/** the scores when criterion j carries weight x instead of its own. */
export function scoresWithWeight(cs: readonly Criterion[], nSites: number, j: number, x: number): number[] | null {
  const alt = cs.map((c, k) => (k === j ? { ...c, weight: x } : c));
  return weightedScores(alt, nSites);
}

/**
 * The weight x* of criterion j at which sites a and b tie, the others held:
 *   (R_a + x s_aj) / (D + x) = (R_b + x s_bj) / (D + x)  =>  x* = (R_a - R_b)/(s_bj - s_aj)
 * with R the weighted sum of the OTHER criteria.  null if the two sites score
 * alike on j (they never cross) or the crossing is at a negative weight.
 */
export function crossingWeight(cs: readonly Criterion[], j: number, a: number, b: number): number | null {
  const ds = (cs[j]!.scores[b] ?? 0) - (cs[j]!.scores[a] ?? 0);
  if (ds === 0) return null;
  let Ra = 0, Rb = 0;
  cs.forEach((c, k) => {
    if (k === j) return;
    Ra += c.weight * (c.scores[a] ?? 0);
    Rb += c.weight * (c.scores[b] ?? 0);
  });
  const x = (Ra - Rb) / ds;
  return x >= 0 ? x : null;
}

export interface FlipRow {
  criterion: string;
  weight: number;
  /** the nearest weight at which the leader is overtaken, or null: it never is */
  flipAt: number | null;
  /** the site that overtakes at that weight */
  by: number | null;
}

/** For each criterion: the nearest weight (either direction) at which the
 *  current leader is tied by another site, i.e. where the ranking changes. */
export function flipTable(cs: readonly Criterion[], nSites: number): FlipRow[] {
  const sc = weightedScores(cs, nSites);
  if (!sc) return [];
  const lead = rankOf(sc)[0]!;
  return cs.map((c, j) => {
    let best: { x: number; by: number } | null = null;
    for (let b = 0; b < nSites; b++) {
      if (b === lead) continue;
      const x = crossingWeight(cs, j, lead, b);
      if (x === null) continue;
      if (best === null || Math.abs(x - c.weight) < Math.abs(best.x - c.weight)) best = { x, by: b };
    }
    return { criterion: c.name, weight: c.weight, flipAt: best ? best.x : null, by: best ? best.by : null };
  });
}

/** the leader's index when criterion j's weight is multiplied by m. */
export function leaderAtMultiple(cs: readonly Criterion[], nSites: number, j: number, m: number): number | null {
  const s = scoresWithWeight(cs, nSites, j, cs[j]!.weight * m);
  return s ? rankOf(s)[0]! : null;
}

export function matrixStart(): { sites: string[]; criteria: Criterion[] } {
  // ILLUSTRATION: weights and scores are round numbers on a 0-10 scale, and
  // the sites are letters.  They describe no real place.
  return {
    sites: ["Site A", "Site B", "Site C"],
    criteria: [
      { name: "Utilities availability and price", weight: 3, scores: [8, 6, 5] },
      { name: "Labour qualification and cost", weight: 2, scores: [5, 8, 6] },
      { name: "Transport access", weight: 2, scores: [6, 7, 9] },
      { name: "Incentives", weight: 1, scores: [4, 5, 9] },
    ],
  };
}

/** the prompts: what to declare, with no number attached to any of them. */
export const SITE_PROMPTS: readonly { name: string; ask: string }[] = [
  { name: "Raw-material and customer proximity", ask: "How far, by what route, and what does moving each tonne cost you?" },
  { name: "Utilities availability and price", ask: "Which utilities does the process need, and can the site deliver them at the duty and the price?" },
  { name: "Labour qualification and cost", ask: "Can the site staff the crew of the running-cost page, with the qualifications the plant needs?" },
  { name: "Transport access", ask: "Road, rail, port, pipeline: which does the product and the feed need?" },
  { name: "Climate", ask: "Cooling-water temperature, freezing, wind and flooding: which of them touch a design variable?" },
  { name: "Incentives", ask: "Which grants, tax terms or zones apply, for how long, and under what conditions? Declare them with their source." },
  { name: "Land", ask: "Is there room to build, to expand and to keep the distances of the layout page?" },
];

// ---- 2. a patent example as a per-kg basis ---------------------------------

export type InputRole = "reactant" | "reagent" | "solvent" | "work-up";

export interface PatentInput { name: string; role: InputRole; kg: number }

export interface PatentExample {
  inputs: PatentInput[];
  /** isolated product, kg */
  productKg: number;
  /** moles of the limiting reactant charged (mol) */
  limitingMol: number;
  /** molar mass of the product (kg per mol) */
  productMw: number;
  reactionH: number;
  workupH: number;
  cleaningH: number;
  /** batch size the student wants to make */
  targetKg: number;
}

export function patentStart(): PatentExample {
  // ILLUSTRATION: an invented example, not taken from any patent.
  return {
    inputs: [
      { name: "Reactant A", role: "reactant", kg: 10 },
      { name: "Reagent B", role: "reagent", kg: 6 },
      { name: "Reaction solvent", role: "solvent", kg: 60 },
      { name: "Work-up solvent", role: "work-up", kg: 30 },
    ],
    productKg: 7.5, limitingMol: 40, productMw: 0.25,
    reactionH: 6, workupH: 4, cleaningH: 2, targetKg: 100,
  };
}

export interface PatentBasis {
  totalIn: number;
  perKg: { name: string; role: InputRole; kgPerKg: number }[];
  /** process mass intensity: total mass in / product out */
  pmi: number;
  /** (total in - product) / product */
  eFactor: number;
  theoreticalKg: number;
  yieldFraction: number;
  cycleH: number;
  /** kg of product per hour of the cycle */
  kgPerH: number;
  /** factor by which every quantity is multiplied to reach the target batch */
  scale: number;
  /** the quantity of each input at the target batch, kg */
  scaled: { name: string; kg: number }[];
}

export function patentBasis(e: PatentExample): PatentBasis | null {
  if (!(e.productKg > 0)) return null;
  const totalIn = e.inputs.reduce((a, i) => a + i.kg, 0);
  const theoreticalKg = e.limitingMol * e.productMw;
  const cycleH = e.reactionH + e.workupH + e.cleaningH;
  const scale = e.targetKg / e.productKg;
  return {
    totalIn,
    perKg: e.inputs.map((i) => ({ name: i.name, role: i.role, kgPerKg: i.kg / e.productKg })),
    pmi: totalIn / e.productKg,
    eFactor: (totalIn - e.productKg) / e.productKg,
    theoreticalKg,
    yieldFraction: theoreticalKg > 0 ? e.productKg / theoreticalKg : NaN,
    cycleH,
    kgPerH: cycleH > 0 ? e.productKg / cycleH : NaN,
    scale,
    scaled: e.inputs.map((i) => ({ name: i.name, kg: i.kg * scale })),
  };
}

/** the search method as a checklist: the order is the method. */
export const PATENT_CHECKLIST: readonly { id: string; text: string }[] = [
  { id: "encyclopedia", text: "Start from the patents cited in an encyclopedia entry on the product or its class." },
  { id: "owner", text: "Group what you find by owner: a company that makes the product is not a company that wrote one example." },
  { id: "scale", text: "Separate the industrial examples from the laboratory-scale ones, by the batch size the example states." },
  { id: "examples", text: "Read the Examples section for temperatures, pressures, times and yields, and copy each with its example number." },
  { id: "route", text: "Check that the patent covers the WHOLE route, from your raw material to the product you sell, or name the steps it leaves out." },
  { id: "status", text: "Look up each patent's legal status in the register of the patent office concerned; this page cannot, and a status is not a freedom-to-operate opinion." },
];

// ---- 3. the margin chain ----------------------------------------------------

/**
 * The four ways a stage takes its share, because "a 20 % margin" is two
 * different numbers depending on what the 20 % is taken of:
 *   onSelling  the share of the price this stage SELLS at:   cost = sell (1 - r)
 *   onCost     a markup on the price this stage PAYS:        cost = sell / (1 + r)
 *   taxAdded   a tax added on top of the price before it:    net  = gross / (1 + r)
 *   fixed      a fixed amount per unit sold:                 cost = sell - amount
 */
export type StageKind = "onSelling" | "onCost" | "taxAdded" | "fixed";

export interface Stage { name: string; kind: StageKind; value: number }

export function stagesStart(): Stage[] {
  // ILLUSTRATION: round numbers, no market's.  Read the regulation of your
  // market and declare each stage with its source.
  return [
    { name: "Tax on the shelf price", kind: "taxAdded", value: 0.10 },
    { name: "Pharmacy", kind: "onSelling", value: 0.20 },
    { name: "Wholesaler", kind: "onCost", value: 0.08 },
    { name: "Fixed fee per pack", kind: "fixed", value: 0.5 },
  ];
}

/** the price one stage pays/leaves, given the price it sells at/shows. */
export function stepDown(price: number, s: Stage): number {
  switch (s.kind) {
    case "onSelling": return price * (1 - s.value);
    case "onCost": return price / (1 + s.value);
    case "taxAdded": return price / (1 + s.value);
    case "fixed": return price - s.value;
  }
}

/** the inverse of stepDown. */
export function stepUp(price: number, s: Stage): number {
  switch (s.kind) {
    case "onSelling": return price / (1 - s.value);
    case "onCost": return price * (1 + s.value);
    case "taxAdded": return price * (1 + s.value);
    case "fixed": return price + s.value;
  }
}

export interface ChainRow { stage: string; priceBefore: number; priceAfter: number; taken: number }

/** from the shelf price down to the ex-factory price. */
export function chainDown(shelf: number, stages: readonly Stage[]): { rows: ChainRow[]; exFactory: number } {
  let p = shelf;
  const rows: ChainRow[] = [];
  for (const s of stages) {
    const next = stepDown(p, s);
    rows.push({ stage: s.name, priceBefore: p, priceAfter: next, taken: p - next });
    p = next;
  }
  return { rows, exFactory: p };
}

/** from the ex-factory price up to the shelf price, stages walked in reverse. */
export function chainUp(exFactory: number, stages: readonly Stage[]): { rows: ChainRow[]; shelf: number } {
  let p = exFactory;
  const rows: ChainRow[] = [];
  for (let k = stages.length - 1; k >= 0; k--) {
    const next = stepUp(p, stages[k]!);
    rows.push({ stage: stages[k]!.name, priceBefore: p, priceAfter: next, taken: next - p });
    p = next;
  }
  return { rows, shelf: p };
}

/** a stage whose value cannot be a real rate (an onSelling share of 100 % or more, a negative rate). */
export function stageProblem(s: Stage): string | null {
  if (!Number.isFinite(s.value)) return "not a number";
  if (s.kind !== "fixed" && s.value < 0) return "a rate cannot be negative";
  if (s.kind === "onSelling" && s.value >= 1) return "a share of the selling price must be below 100 %";
  return null;
}
