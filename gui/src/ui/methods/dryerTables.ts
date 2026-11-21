/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/


/*---------------------------------------------------------------------------*\
  dryerTables -- the habitual tables of dryer selection, TRANSCRIBED at their
  pages (Vitor 2026-11-21, after an expert review: "as tabelas habituais").

  Nothing here is computed and nothing is from memory: every cell was read
  from the page (a text layer where it was legible, an image of the page where
  it was not), and every table carries the source id of dryerSelection.ts that
  names its book and page.  A cell is printed AS THE BOOK PRINTS IT, with its
  units; where the printing is odd the oddity is kept and said (Towler's
  "6.48 h" is a range whose dash the copy prints as a point, Mujumdar's "large
  five" is as printed).  tests/dryerSelection.test.ts pins every cell.

    Mujumdar Table 1.1   dryer against feed form, ELEVEN feed columns (p. 21)
    Mujumdar Table 1.5   ha, log-mean temperature difference, inlet gas (p. 27)
    Mujumdar Table 1.6   the vendor's selection checklist (p. 28)
    van 't Land 3.1, 3.2 data to assess, criteria for the dried product (p. 22)
    Towler Table 10.7    dryer selection (printed p. 571)
    Perry Table 12-46    drum dryer operating information (p. 12-81),
                         beside Mujumdar's drum figures (Table 1.4, p. 26;
                         Chapter 9, p. 206): both are shown, they differ.
\*---------------------------------------------------------------------------*/

import { efficiency, type SourceId } from "./dryerSelection.js";

// ---- Mujumdar Table 1.1, p. 21 ---------------------------------------------------------

export const MUJ_T11_SRC: readonly SourceId[] = ["muj-t1.1"];

/** The eleven feed columns of Table 1.1, in the printed order, with the
 *  printed group above them (Liquids, Cakes, Free-flowing solids, Formed). */
export const MUJ_T11_COLUMNS: readonly { label: string; group: string }[] = [
  { label: "Solution", group: "Liquids" },
  { label: "Slurry", group: "Liquids" },
  { label: "Pastes", group: "Liquids" },
  { label: "Centrifuge", group: "Cakes" },
  { label: "Filter", group: "Cakes" },
  { label: "Powder", group: "Free-flowing solids" },
  { label: "Granule", group: "Free-flowing solids" },
  { label: "Fragile crystal", group: "Free-flowing solids" },
  { label: "Pellet", group: "Free-flowing solids" },
  { label: "Fiber", group: "Free-flowing solids" },
  { label: "Formed solids", group: "Formed solids" },
];

export interface FeedTickRow {
  group: "Convection dryers" | "Conduction dryers";
  dryer: string;
  /** the printed columns that carry a cross, by column index of MUJ_T11_COLUMNS */
  ticks: readonly number[];
}

export const MUJ_T11_ROWS: readonly FeedTickRow[] = [
  { group: "Convection dryers", dryer: "Belt conveyer dryer", ticks: [6, 7, 8, 9, 10] },
  { group: "Convection dryers", dryer: "Flash dryer", ticks: [3, 4, 5, 6, 9] },
  { group: "Convection dryers", dryer: "Fluid bed dryer", ticks: [0, 1, 3, 4, 5, 6, 8] },
  { group: "Convection dryers", dryer: "Rotary dryer", ticks: [3, 4, 5, 6, 8, 9] },
  { group: "Convection dryers", dryer: "Spray dryer", ticks: [0, 1, 2] },
  { group: "Convection dryers", dryer: "Tray dryer (batch)", ticks: [3, 4, 5, 6, 7, 8, 9, 10] },
  { group: "Convection dryers", dryer: "Tray dryer (continuous)", ticks: [3, 4, 5, 6, 7, 8, 9] },
  { group: "Conduction dryers", dryer: "Drum dryer", ticks: [0, 1, 2] },
  { group: "Conduction dryers", dryer: "Steam jacket rotary dryer", ticks: [3, 4, 5, 6, 8, 9] },
  { group: "Conduction dryers", dryer: "Steam tube rotary dryer", ticks: [3, 4, 5, 6, 8, 9] },
  { group: "Conduction dryers", dryer: "Tray dryer (batch)", ticks: [3, 4, 5, 6, 7, 8, 9, 10] },
  { group: "Conduction dryers", dryer: "Tray dryer (continuous)", ticks: [3, 4, 5, 6, 7, 8, 9] },
];

// ---- Mujumdar Table 1.5, p. 27 ---------------------------------------------------------

export const MUJ_T15_SRC: readonly SourceId[] = ["muj-t1.5"];

/** Table 1.5 prints ha in kcal/(h degC m3) for the convection dryers and U in
 *  kcal/(h degC m2) for the conduction dryers; the log-mean temperature
 *  difference (t - tm) in degC, split by flow direction where the book splits
 *  it, and the inlet hot-air temperature in degC. */
export interface HaRow {
  group: "Convection" | "Conduction";
  type: string;
  /** ha (convection) or U (conduction), as printed */
  coefficient: string;
  /** one entry per printed line: the flow direction (or null), the log-mean
   *  temperature difference and the inlet gas temperature (or null) */
  lines: readonly { flow: string | null; dT: string; tIn: string | null }[];
}

export const MUJ_T15_ROWS: readonly HaRow[] = [
  { group: "Convection", type: "Rotary", coefficient: "100-200", lines: [
    { flow: "Countercurrent", dT: "80-150", tIn: "200-600" },
    { flow: "Cocurrent", dT: "100-180", tIn: "300-600" }] },
  { group: "Convection", type: "Flash", coefficient: "2000-6000", lines: [
    { flow: "Parallel flow only", dT: "100-180", tIn: "400-600" }] },
  { group: "Convection", type: "Fluid bed", coefficient: "2000-6000", lines: [
    { flow: null, dT: "50-150", tIn: "100-600" }] },
  { group: "Convection", type: "Spray", coefficient: "20-80 (large five)", lines: [
    { flow: "Counterflow", dT: "80-90", tIn: "200-300" },
    { flow: "Cocurrent", dT: "70-170", tIn: "200-450" }] },
  { group: "Convection", type: "Tunnel", coefficient: "200-300", lines: [
    { flow: "Counterflow", dT: "30-60", tIn: "100-200" },
    { flow: "Cocurrent", dT: "50-70", tIn: "100-200" }] },
  { group: "Convection", type: "Jet flow", coefficient: "h = 100-150", lines: [
    { flow: null, dT: "30-80", tIn: "60-150" }] },
  { group: "Conduction", type: "Drum", coefficient: "100-200", lines: [
    { flow: null, dT: "50-80", tIn: null }] },
  { group: "Conduction", type: "Agitated through rotary with steam tubes, etc.",
    coefficient: "60-130 (smaller for sticky solids)", lines: [
      { flow: null, dT: "50-100", tIn: null }] },
];

// ---- Mujumdar Table 1.6, p. 28, and the minimum information on pp. 27-28 ----------------

export const MUJ_T16_SRC: readonly SourceId[] = ["muj-t1.6"];

/** The vendor's checklist, in the printed order.  `items` is empty for the
 *  printed lines that carry a heading and no list (they head the group that
 *  follows). */
export const MUJ_T16_ROWS: readonly { factor: string; items: readonly string[] }[] = [
  { factor: "Physical form of feed", items: [
    "Granular, particulate, sludge, crystalline, liquid, pasty, suspension, solution, "
      + "continuous sheets, planks, odd-shapes (small/large)", "Sticky, lumpy"] },
  { factor: "Average throughput", items: ["kg/h (dry/wet); continuous", "kg per batch (dry/wet)"] },
  { factor: "Expected variation in throughput (turndown ratio)", items: [] },
  { factor: "Fuel choice", items: ["Oil", "Gas", "Electricity"] },
  { factor: "Pre- and postdrying operations (if any)", items: [] },
  { factor: "For particulate feed products", items: [
    "Mean particle size", "Size distribution", "Particle density", "Bulk density",
    "Rehydration properties"] },
  { factor: "Inlet-outlet moisture content", items: ["Dry basis", "Wet basis"] },
  { factor: "Chemical/biochemical/microbiological activity", items: [] },
  { factor: "Heat sensitivity", items: ["Melting point", "Glass transition temperature"] },
  { factor: "Sorption isotherms (equilibrium moisture content)", items: [] },
  { factor: "Drying time", items: ["Drying curves", "Effect of process variables"] },
  { factor: "Special requirements", items: [
    "Material of construction", "Corrosion", "Toxicity", "Nonaqueous solution",
    "Flammability limits", "Fire hazard", "Color/texture/aroma requirements (if any)"] },
  { factor: "Footprint of drying system", items: ["Space availability for dryer and ancillaries"] },
];

/** "As a minimum, the following quantitative information is necessary to
 *  arrive at a suitable dryer" (pp. 27-28), in the printed order. */
export const MUJ_MINIMUM_INFO: readonly string[] = [
  "Dryer throughput; mode of feedstock production (batch/continuous)",
  "Physical, chemical, and biochemical properties of the wet feed as well as desired product "
    + "specifications; expected variability in feed characteristics",
  "Upstream and downstream processing operations",
  "Moisture content of the feed and product",
  "Drying kinetics; moist solid sorption isotherms",
  "Quality parameters (physical, chemical, biochemical)",
  "Safety aspects, e.g., fire hazard and explosion hazards, toxicity",
  "Value of the product",
  "Need for automatic control",
  "Toxicological properties of the product",
  "Turndown ratio, flexibility in capacity requirements",
  "Type and cost of fuel, cost of electricity",
  "Environmental regulations",
  "Space in plant",
];

// ---- van 't Land Tables 3.1 and 3.2, p. 22 ----------------------------------------------

export const VTL_T3_SRC: readonly SourceId[] = ["vtl-t3.1"];

/** Table 3.1, "Data to be assessed before attempting dryer selection": the two
 *  printed columns, read down. */
export const VTL_T31_LEFT: readonly string[] = [
  "Production capacity (kg/h)", "Initial moisture content", "Particle-size distribution",
  "Drying curve", "Maximum allowable product temperature",
  "Explosion characteristics (vapor-air and dust-air)", "Toxicological properties",
];
export const VTL_T31_RIGHT: readonly string[] = [
  "Experience already gained", "Moisture isotherms", "Solubility of the solid in the liquid",
  "Solution vapor pressure", "Contamination by the drying gas", "Corrosion aspects",
  "Physical data on the relevant materials",
];

/** Table 3.2, "Some criteria for judging a dried particulate material". */
export const VTL_T32_LEFT: readonly string[] = [
  "Moisture content", "Particle-size distribution", "Bulk density", "Hardness", "Dust content",
  "Flow characteristics", "Color",
];
export const VTL_T32_RIGHT: readonly string[] = [
  "Odor, taste", "Appearance", "Dispersibility", "Dissolution or rewetting behavior", "Assay",
  "Caking tendency", "Segregation of originally dissolved components (food)",
];

// ---- Towler Table 10.7, printed p. 571 ----------------------------------------------------

export const TOW_T107_SRC: readonly SourceId[] = ["tow-t10.7"];

/** The key to the three feed-condition columns, as printed under the table. */
export const TOW_FEED_KEY: readonly string[] = [
  "Solutions, colloidal suspensions and emulsions, pumpable solids suspensions, pastes and sludges.",
  "Free-flowing powders, granular, crystalline or fibrous solids that can withstand mechanical handling.",
  "Solids incapable of withstanding mechanical handling.",
];

export type Dep = "Yes" | "No" | "Depends on material";

export interface TowlerRow {
  mode: "Batch" | "Continuous";
  generic: "Stationary" | "Drum" | "Rotary" | "Conveyor" | "Suspended particle";
  /** the specific dryer type(s) of the printed row */
  types: readonly string[];
  /** feed conditions (1, 2, 3) the row's arrow covers */
  feed: readonly (1 | 2 | 3)[];
  jacketed: "Yes" | "No";
  heatSensitive: Dep;
  vacuum: "Yes" | "No";
  /** retention or cycle time, as printed */
  retention: string;
  heatTransfer: string;
  capacity: string;
  /** typical evaporation capacity, as printed, or null where the table prints a dash */
  evap: string | null;
  /** its unit, as printed beside the group of rows */
  evapUnit: "kg/(h m2) of heat-transfer area" | "kg/(h m3) of dryer volume" | "kg/(h m2)"
    | "kg/(h m3)";
}

const AREA = "kg/(h m2) of heat-transfer area" as const;
const VOL = "kg/(h m3) of dryer volume" as const;

export const TOW_T107_ROWS: readonly TowlerRow[] = [
  { mode: "Batch", generic: "Stationary", types: ["Shelf", "Cabinet", "Compartment"], feed: [2, 3],
    jacketed: "Yes", heatSensitive: "Yes", vacuum: "Yes", retention: "6.48 h",
    heatTransfer: "Radiant and conduction", capacity: "Limited", evap: "0.15-1.0", evapUnit: AREA },
  { mode: "Batch", generic: "Stationary", types: ["Truck"], feed: [2, 3],
    jacketed: "No", heatSensitive: "Yes", vacuum: "No", retention: "6.48 h",
    heatTransfer: "Convection", capacity: "Limited", evap: "0.15-1.0", evapUnit: AREA },
  { mode: "Batch", generic: "Stationary", types: ["Kettle", "Pan"], feed: [1, 2],
    jacketed: "Yes", heatSensitive: "No", vacuum: "Yes", retention: "3.12 h",
    heatTransfer: "Conduction", capacity: "Limited", evap: "1.5-15", evapUnit: AREA },
  { mode: "Batch", generic: "Stationary", types: ["Rotary shell"], feed: [2],
    jacketed: "Yes", heatSensitive: "Yes", vacuum: "Yes", retention: "4.48 h",
    heatTransfer: "Conduction", capacity: "Limited", evap: "0.5-12", evapUnit: AREA },
  { mode: "Batch", generic: "Stationary", types: ["Rotary internal"], feed: [2],
    jacketed: "Yes", heatSensitive: "Yes", vacuum: "Yes", retention: "4.48 h",
    heatTransfer: "Conduction", capacity: "Limited", evap: "0.5-12", evapUnit: AREA },
  { mode: "Batch", generic: "Stationary", types: ["Double cone"], feed: [2],
    jacketed: "Yes", heatSensitive: "Yes", vacuum: "Yes", retention: "3.12 h",
    heatTransfer: "Conduction", capacity: "Limited", evap: "0.5-12", evapUnit: AREA },
  { mode: "Continuous", generic: "Drum", types: ["Single drum", "Double drum", "Twin drum"],
    feed: [1], jacketed: "No", heatSensitive: "Yes", vacuum: "Yes", retention: "Very short",
    heatTransfer: "Conduction", capacity: "Medium", evap: "5-50", evapUnit: AREA },
  { mode: "Continuous", generic: "Rotary", types: ["Rotary, direct heat"], feed: [2],
    jacketed: "No", heatSensitive: "No", vacuum: "No", retention: "Long",
    heatTransfer: "Convection", capacity: "High", evap: "3-110", evapUnit: VOL },
  { mode: "Continuous", generic: "Rotary", types: ["Rotary, indirect heat"], feed: [2],
    jacketed: "No", heatSensitive: "No", vacuum: "No", retention: "Long",
    heatTransfer: "Conduction", capacity: "Medium", evap: "15-200", evapUnit: VOL },
  { mode: "Continuous", generic: "Rotary", types: ["Rotary, steam tube"], feed: [2],
    jacketed: "No", heatSensitive: "Depends on material", vacuum: "No", retention: "Long",
    heatTransfer: "Conduction", capacity: "High", evap: "15-200", evapUnit: VOL },
  { mode: "Continuous", generic: "Rotary", types: ["Rotary, direct-indirect heat"], feed: [2],
    jacketed: "No", heatSensitive: "No", vacuum: "No", retention: "Long",
    heatTransfer: "Conduction, convection", capacity: "High", evap: "50-150", evapUnit: VOL },
  { mode: "Continuous", generic: "Rotary", types: ["Louver"], feed: [2],
    jacketed: "No", heatSensitive: "Depends on material", vacuum: "No", retention: "Long",
    heatTransfer: "Convection", capacity: "High", evap: "5-240", evapUnit: VOL },
  { mode: "Continuous", generic: "Conveyor", types: ["Tunnel", "belt, screen"], feed: [2, 3],
    jacketed: "No", heatSensitive: "Yes", vacuum: "No", retention: "Long",
    heatTransfer: "Convection", capacity: "Medium", evap: "1.5-35", evapUnit: VOL },
  { mode: "Continuous", generic: "Conveyor", types: ["Rotary shelf"], feed: [2],
    jacketed: "Yes", heatSensitive: "Depends on material", vacuum: "No", retention: "Medium",
    heatTransfer: "Conduction, convection", capacity: "Medium", evap: "0.5-10",
    evapUnit: "kg/(h m2)" },
  { mode: "Continuous", generic: "Conveyor", types: ["Trough"], feed: [2],
    jacketed: "Yes", heatSensitive: "Depends on material", vacuum: "Yes", retention: "Varies",
    heatTransfer: "Conduction", capacity: "Medium", evap: "0.5-15", evapUnit: "kg/(h m2)" },
  { mode: "Continuous", generic: "Conveyor", types: ["Vibrating"], feed: [2],
    jacketed: "Yes", heatSensitive: "Depends on material", vacuum: "No", retention: "Medium",
    heatTransfer: "Convection, conduction", capacity: "Medium", evap: "0.5-100",
    evapUnit: "kg/(h m2)" },
  { mode: "Continuous", generic: "Conveyor", types: ["Turbo"], feed: [2],
    jacketed: "No", heatSensitive: "Depends on material", vacuum: "No", retention: "Medium",
    heatTransfer: "Convection", capacity: "Medium", evap: "1-10", evapUnit: "kg/(h m2)" },
  { mode: "Continuous", generic: "Suspended particle", types: ["Spray"], feed: [1],
    jacketed: "No", heatSensitive: "Yes", vacuum: "No", retention: "Short",
    heatTransfer: "Convection", capacity: "High", evap: "1.5-50", evapUnit: "kg/(h m3)" },
  { mode: "Continuous", generic: "Suspended particle", types: ["Flash"], feed: [2],
    jacketed: "No", heatSensitive: "Yes", vacuum: "No", retention: "Short",
    heatTransfer: "Convection", capacity: "High", evap: null, evapUnit: "kg/(h m3)" },
  { mode: "Continuous", generic: "Suspended particle", types: ["Fluid bed"], feed: [2],
    jacketed: "No", heatSensitive: "Yes", vacuum: "No", retention: "Short",
    heatTransfer: "Convection", capacity: "Medium", evap: null, evapUnit: "kg/(h m3)" },
];

// ---- the drum dryer in two books ----------------------------------------------------------

/** Perry's Table 12-46 (p. 12-81) beside Mujumdar's drum figures.  The two
 *  books DISAGREE on the evaporation per square metre of drum and AGREE on the
 *  thermal efficiency; the page shows both and converts nothing silently: the
 *  conversion of g/(m2 s) to kg/(m2 h) is the factor 3.6, printed. */
export const DRUM_BOOKS = {
  perry: {
    src: ["perry-t12-46"] as readonly SourceId[],
    /** "This estimate" (the worked example's) and the "Typical range", g/(m2 s) */
    evapEstimateGPerM2s: 9.3,
    evapRangeGPerM2s: [7, 11] as const,
    /** thermal efficiency: the example's estimate and the typical range */
    effEstimate: 0.85,
    effRange: [0.4, 0.7] as const,
  },
  mujumdar14: {
    src: ["muj-t1.4"] as readonly SourceId[],
    /** Table 1.4, "Drum dryer (for pastes)", kg water/(h m2) */
    evapKgPerM2h: [6, 20] as const,
    /** kJ per kg of water evaporated */
    energy: [3200, 6500] as const,
  },
  mujumdar9: {
    src: ["muj-drum"] as readonly SourceId[],
    /** Chapter 9, section 9.3.2 (p. 206): specific evaporation rate, kg water per m2 and h */
    evapDifficultKgPerM2h: [10, 30] as const,
    evapEasyKgPerM2h: [40, 50] as const,
    /** specific heat consumption, kJ per kg of water removed */
    energy: [3000, 3500] as const,
  },
};

export const G_PER_M2S_TO_KG_PER_M2H = 3.6;

/** Perry's range of specific evaporation in the unit the other book uses. */
export function perryDrumEvapKgPerM2h(): readonly [number, number] {
  const [a, b] = DRUM_BOOKS.perry.evapRangeGPerM2s;
  return [a * G_PER_M2S_TO_KG_PER_M2H, b * G_PER_M2S_TO_KG_PER_M2H];
}

/** The thermal efficiency implied by Mujumdar's Table 1.4 energy range
 *  (latent heat of water at 100 degC over the energy per kg), low and high. */
export function mujumdarDrumEfficiency(): readonly [number, number] {
  const [lo, hi] = DRUM_BOOKS.mujumdar14.energy;
  return [efficiency(hi), efficiency(lo)];
}
