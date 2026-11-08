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
  campaignPlanToy -- the two DECLARED TOYS of the `campaign-plan` EduTool, and
  the witnesses of its engine halves.  Every number here is an illustration
  chosen to be followed by hand (the page says so); none is a Choupo run.

  Toy A is one train of five stages, built so that the lesson's two moves are
  one slider apart: the solution tank is held through the dryer's run, so
  with ONE tank the tank paces the train and with TWO out of phase the dryer
  does.  Toy B is three stages and up to three products, with a clean at the
  coating pan that depends on the direction of the change (a colour carried
  over), so the order of the campaigns is a decision from the third product.
\*---------------------------------------------------------------------------*/

import type {
  MultiSpec, ProductSpec, SingleSpec, StageSpec, TrainSpec,
} from "./campaignPlanMath.js";

/** The engine halves read these two cases, by the bundled corpus's names. */
export const CAMPAIGN_WITNESS_ONE = "batch/plant/apalutamide01_tablets";
export const CAMPAIGN_WITNESS_MULTI = "batch/plant/donepezil02_two_strengths";

// ---- Toy A: one product, one train ---------------------------------------

export interface ToyAKnobs {
  /** [kg] product per lot. */
  lot: number;
  /** [lots] per campaign. */
  lotsPerCampaign: number;
  /** [h] between two campaigns. */
  changeover: number;
  /** [h] declared operating time of the spray dryer. */
  dryerHours: number;
  /** units of the solution tank, out of phase. */
  tanks: 1 | 2;
  /** [kg/yr] */
  perYear: number;
  /** [h/yr] */
  available: number;
}

export const TOY_A_DEFAULT: ToyAKnobs = {
  lot: 100, lotsPerCampaign: 8, changeover: 24, dryerHours: 4, tanks: 1,
  perYear: 4000, available: 3840,
};

/** The dryer's own rate, kg/h of dried powder: the machine the plan asks
 *  for a run of m / t_op (100 kg in 4 h is 25 kg/h). */
export const TOY_A_DRYER_RATE = 25;

export function toyAStages(k: ToyAKnobs): StageSpec[] {
  return [
    { name: "solutionTank", type: "batch", charge: 1, process: 1, discharge: "fedStage",
      clean: 1, outOfPhase: k.tanks, inPhase: 1, feeds: "sprayDryer", holdsFactor: 4,
      bulkDensity: 800, fillFraction: 0.8 },
    { name: "sprayDryer", type: "semicontinuous", charge: 0, process: k.dryerHours,
      discharge: 0, clean: 0, outOfPhase: 1, inPhase: 1, feeds: "blender", holdsFactor: 1,
      rate: TOY_A_DRYER_RATE, operating: "declared" },
    { name: "blender", type: "batch", charge: 1, process: 0.5, discharge: 0.5, clean: 1,
      outOfPhase: 1, inPhase: 1, feeds: "press", holdsFactor: 1, bulkDensity: 450,
      fillFraction: 0.6 },
    { name: "press", type: "semicontinuous", charge: 0.5, process: 2.5, discharge: 0, clean: 0.5,
      outOfPhase: 1, inPhase: 1, feeds: "coater", holdsFactor: 1, rate: 40,
      operating: "declared" },
    { name: "coater", type: "batch", charge: 0.5, process: 2, discharge: 0.5, clean: 0.5,
      outOfPhase: 1, inPhase: 1, feeds: null, holdsFactor: 1, bulkDensity: 750,
      fillFraction: 0.65 },
  ];
}

export function toyASpec(k: ToyAKnobs): SingleSpec {
  const train: TrainSpec = {
    name: "line", available: k.available, lotsPerCampaign: k.lotsPerCampaign,
    changeover: k.changeover, stages: toyAStages(k),
  };
  return { product: "tablets", perYear: k.perYear, lotSize: k.lot, train };
}

// ---- Toy B: several products ---------------------------------------------

export interface ToyBKnobs {
  /** the products in play, a prefix of TOY_B_PRODUCTS (2 or 3). */
  count: 2 | 3;
  /** the campaign order. */
  order: string[];
  /** [h] the clean at the coating pan for each direction, "from>to". */
  coatingClean: { [fromTo: string]: number };
  /** [h] the cleans that depend on the stage alone. */
  granulationClean: number;
  pressClean: number;
  /** [h] between two campaigns of one product. */
  changeover: number;
  lotsPerCampaign: number;
}

export const TOY_B_PRODUCTS: readonly ProductSpec[] = [
  { name: "white", perYear: 12000, lotSize: 300 },
  { name: "yellow", perYear: 18000, lotSize: 300 },
  { name: "pink", perYear: 6000, lotSize: 300, process: { press: 12 } },
];

export const TOY_B_DEFAULT: ToyBKnobs = {
  count: 2, order: ["white", "yellow", "pink"],
  coatingClean: { "white>yellow": 2, "yellow>white": 8, "white>pink": 4, "pink>white": 3,
    "yellow>pink": 6, "pink>yellow": 5 },
  granulationClean: 1, pressClean: 1, changeover: 24, lotsPerCampaign: 8,
};

export function toyBSpec(k: ToyBKnobs): MultiSpec {
  const products = TOY_B_PRODUCTS.slice(0, k.count).map((p) => ({ ...p }));
  const names = new Set(products.map((p) => p.name));
  const order = k.order.filter((n) => names.has(n));
  for (const p of products) if (!order.includes(p.name)) order.push(p.name);
  const stages: StageSpec[] = [
    { name: "granulation", type: "batch", charge: 0.5, process: 1.5, discharge: 0.5, clean: 1,
      outOfPhase: 1, inPhase: 1, feeds: "press", holdsFactor: 1.1, bulkDensity: 550,
      fillFraction: 0.6 },
    { name: "press", type: "semicontinuous", charge: 1, process: 7, discharge: 0, clean: 1.5,
      outOfPhase: 1, inPhase: 1, feeds: "coating", holdsFactor: 1, rate: 60,
      operating: "declared" },
    { name: "coating", type: "batch", charge: 0.5, process: 4, discharge: 0.5, clean: 1.5,
      outOfPhase: 1, inPhase: 1, feeds: null, holdsFactor: 1, bulkDensity: 750,
      fillFraction: 0.65 },
  ];
  const coating: { [fromTo: string]: number } = {};
  for (const a of names) for (const b of names)
    if (a !== b) coating[`${a}>${b}`] = k.coatingClean[`${a}>${b}`] ?? 0;
  return {
    products, order,
    train: { name: "tableting", available: 3840, lotsPerCampaign: k.lotsPerCampaign,
      changeover: k.changeover, stages },
    productChangeover: { granulation: k.granulationClean, press: k.pressClean, coating: 0 },
    changeoverTo: { coating },
  };
}
