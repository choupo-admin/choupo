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
  dryerSelection -- the DATA and the RULES of the "Which dryer for which
  product" page (DEV.md 4c C460, Vitor 2026-11-19: "heuristicas de seleccao
  de secadores ... estilo Pareto e com os esquemas mais comuns").

  NOTHING HERE IS COMPUTED BY THE ENGINE AND NOTHING WAS WRITTEN FROM MEMORY.
  Every row of every table and every rule of the selection tree carries the
  SOURCE it was read from -- a book, a table or a figure, a page -- and the
  tests refuse a rule whose source is not in SOURCES.  A cell the three books
  do not give is `null` and the page prints "not cited"; it is never filled
  with a plausible number.

  THE FOUR BOOKS (library copies, ~/Choupo-Literature):

    Mujumdar   Mujumdar, A. S. (ed.) (2006), Handbook of Industrial Drying,
               3rd ed., Taylor & Francis / CRC Press.  Chapter 1 (Mujumdar),
               "Principles, Classification, and Selection of Dryers".
               PRINTED page = PDF page - 26 (the section 1.8 heading is on
               PDF page 52 and the book's contents list puts it on page 26).
    Perry      Green, D. W. and Southard, M. Z. (eds.) (2019), Perry's
               Chemical Engineers' Handbook, 9th ed., McGraw-Hill, Section 12.
               Pages are the printed "12-nn".
    vantLand   van 't Land, C. M. (2012), Drying in the Process Industry,
               Wiley.  Printed page = PDF page - 14.
    Towler     Towler, G. and Sinnott, R. (2008), Chemical Engineering Design,
               1st ed., Butterworth-Heinemann, Chapter 10 (section 10.4, Table
               10.7 and the dryer descriptions, pp. 570-576).  Printed page =
               PDF page - 18.

  Mujumdar's chapters on the equipment (7 rotary, 8 fluidised bed, 9 drum, 10
  spray, 11 freeze, 17 conveyor) were read for the drawings of
  dryerDrawings.tsx and for the notes on the rules; the page numbers of those
  chapters are the printed ones (PDF page - 26).

  WHERE THE BOOKS DISAGREE the page says so (the batch tray for a fine
  powder is the case: Perry's Table 12-11 marks it "not applicable", van 't
  Land's batch tree and Mujumdar's Table 1.1 admit it; a fine powder in a
  continuous dryer is another: Perry's table admits a fluidised bed "if not
  too dusty", van 't Land's tree and Mujumdar's remark on entrainment send it
  to an indirect rotary or a disk dryer; and the drum's evaporation per square
  metre is a third, where Perry's Table 12-46 and Mujumdar's Table 1.4 differ);
  it does not pick one and hide the other.  ONE ERROR OF A BOOK is named, not
  copied: Mujumdar p. 22 says the heat of sublimation is "severalfold lower"
  than that of evaporation, and his own Chapter 11 (p. 259) gives 2840 kJ/kg
  of ice against 2257 kJ/kg for water at 100 degC (SUBLIMATION_NOTE).

  WHAT IS THE PAGE'S OWN: the ORDER in which the rules are asked (feed form,
  then heat sensitivity, then scale, then batch or continuous, which is the
  order Vitor asked for), the three heat-sensitivity bands (the two product
  temperatures, 30 and 75 degC, are van 't Land's Figures 3.1 and 3.2, the
  second only together with "particle size increase required?"), the
  three scale bands (Perry's two thresholds) and the pairing of a rule with
  its picks.  The comparison table and the energy arithmetic are page
  arithmetic on the cited table.
\*---------------------------------------------------------------------------*/

// ---- the sources ------------------------------------------------------------------

export type SourceId =
  | "muj-t1.1" | "muj-t1.2" | "muj-t1.3" | "muj-t1.4" | "muj-heat" | "muj-feed" | "muj-batch"
  | "muj-t1.5" | "muj-t1.6" | "muj-rotary" | "muj-fluid" | "muj-drum" | "muj-spray" | "muj-conv"
  | "muj-freeze-heat" | "tow-t10.7" | "tow-text" | "perry-t12-46" | "perry-tray-air" | "vtl-t3.1"
  | "vtl-spray-flow" | "vtl-drum-vac"
  | "perry-t12-11" | "perry-cons" | "perry-proc" | "perry-tray" | "perry-t12-41" | "perry-t12-37"
  | "perry-latent" | "perry-fluid" | "perry-direct"
  | "vtl-batch-tree" | "vtl-cont-tree" | "vtl-text" | "vtl-spray" | "vtl-rotary" | "vtl-fluid"
  | "vtl-conveyor" | "vtl-drum" | "vtl-freeze" | "vtl-freeze-time" | "vtl-freeze-tunnel"
  | "vtl-flash" | "vtl-flash-sel" | "vtl-agvac" | "perry-flash" | "perry-agbatch" | "tow-pneu" | "tow-t10.8"
  | "muj-safety" | "muj-prepost" | "perry-tests" | "perry-tray-cycle" | "perry-t12-12";

export interface Source { id: SourceId; work: "Mujumdar" | "Perry" | "van 't Land" | "Towler"; where: string }

/** Where each fact was read.  `where` is what the student sees; the
 *  reading itself is recorded in lessonReferences.json. */
export const SOURCES: Readonly<Record<SourceId, Source>> = {
  "muj-t1.1": { id: "muj-t1.1", work: "Mujumdar", where: "Ch. 1, Table 1.1, p. 21" },
  "muj-t1.2": { id: "muj-t1.2", work: "Mujumdar", where: "Ch. 1, Table 1.2, p. 21" },
  "muj-t1.3": { id: "muj-t1.3", work: "Mujumdar", where: "Ch. 1, Table 1.3, p. 23" },
  "muj-t1.4": { id: "muj-t1.4", work: "Mujumdar", where: "Ch. 1, Table 1.4, p. 26" },
  "muj-heat": { id: "muj-heat", work: "Mujumdar", where: "Ch. 1, sections 1.5.1-1.5.2, p. 21-22" },
  "muj-feed": { id: "muj-feed", work: "Mujumdar", where: "Ch. 1, section 1.5.3, p. 23-24" },
  "muj-batch": { id: "muj-batch", work: "Mujumdar", where: "Ch. 1, section 1.8, p. 28" },
  "muj-t1.5": { id: "muj-t1.5", work: "Mujumdar", where: "Ch. 1, Table 1.5, p. 27" },
  "muj-t1.6": { id: "muj-t1.6", work: "Mujumdar", where: "Ch. 1, Table 1.6 and the text before it, pp. 27-28" },
  "muj-rotary": { id: "muj-rotary", work: "Mujumdar", where: "Ch. 7, sections 7.1-7.2 and Fig. 7.1, pp. 151-152" },
  "muj-fluid": { id: "muj-fluid", work: "Mujumdar", where: "Ch. 8, section 8.7.3 and Fig. 8.8, p. 184" },
  "muj-drum": { id: "muj-drum", work: "Mujumdar", where: "Ch. 9, sections 9.2-9.3, pp. 204-208" },
  "muj-spray": { id: "muj-spray", work: "Mujumdar", where: "Ch. 10, section 10.1 and Fig. 10.1, pp. 216 and 219" },
  "muj-conv": { id: "muj-conv", work: "Mujumdar", where: "Ch. 17, sections 17.1-17.2 and Fig. 17.2, pp. 411-413" },
  "muj-freeze-heat": { id: "muj-freeze-heat", work: "Mujumdar", where: "Ch. 11, section 11.2, p. 259 (and Ch. 1, p. 22)" },
  "tow-t10.7": { id: "tow-t10.7", work: "Towler", where: "Table 10.7, p. 571" },
  "tow-text": { id: "tow-text", work: "Towler", where: "section 10.4, dryer descriptions and Figs. 10.25-10.28, pp. 570-574" },
  "perry-t12-46": { id: "perry-t12-46", work: "Perry", where: "Table 12-46, p. 12-81" },
  "perry-tray-air": { id: "perry-tray-air", work: "Perry", where: "Batch tray dryers, auxiliary equipment, p. 12-39" },
  "vtl-t3.1": { id: "vtl-t3.1", work: "van 't Land", where: "Tables 3.1 and 3.2, p. 22" },
  "vtl-spray-flow": { id: "vtl-spray-flow", work: "van 't Land", where: "section 8.1, Fig. 8.2 and text, p. 135" },
  "vtl-drum-vac": { id: "vtl-drum-vac", work: "van 't Land", where: "section 10.5, p. 205" },
  "perry-t12-11": { id: "perry-t12-11", work: "Perry", where: "Table 12-11, p. 12-33 and 12-34" },
  "perry-cons": { id: "perry-cons", work: "Perry", where: "Selection of drying equipment, p. 12-36" },
  "perry-proc": { id: "perry-proc", work: "Perry", where: "Selection of drying equipment, p. 12-37 and 12-38" },
  "perry-tray": { id: "perry-tray", work: "Perry", where: "Batch tray dryers, p. 12-38" },
  "perry-t12-41": { id: "perry-t12-41", work: "Perry", where: "Table 12-41, p. 12-72" },
  "perry-t12-37": { id: "perry-t12-37", work: "Perry", where: "Table 12-37, p. 12-62" },
  "perry-latent": { id: "perry-latent", work: "Perry", where: "Example 12-19, p. 12-71" },
  "perry-fluid": { id: "perry-fluid", work: "Perry", where: "Fluidized-bed and spouted-bed dryers, p. 12-62" },
  "perry-direct": { id: "perry-direct", work: "Perry", where: "Direct (convective) dryers, p. 12-35" },
  "vtl-batch-tree": { id: "vtl-batch-tree", work: "van 't Land", where: "Figure 3.1, p. 23" },
  "vtl-cont-tree": { id: "vtl-cont-tree", work: "van 't Land", where: "Figure 3.2, p. 25" },
  "vtl-text": { id: "vtl-text", work: "van 't Land", where: "Chapter 3, p. 21-28" },
  "vtl-spray": { id: "vtl-spray", work: "van 't Land", where: "section 8.1, p. 133-134" },
  "vtl-rotary": { id: "vtl-rotary", work: "van 't Land", where: "section 6.1, p. 99-100" },
  "vtl-fluid": { id: "vtl-fluid", work: "van 't Land", where: "section 5.1, p. 67-68" },
  "vtl-conveyor": { id: "vtl-conveyor", work: "van 't Land", where: "section 9.1, p. 164-165" },
  "vtl-drum": { id: "vtl-drum", work: "van 't Land", where: "section 10.5, p. 204-205" },
  "vtl-freeze": { id: "vtl-freeze", work: "van 't Land", where: "section 11.2, p. 232-233" },
  "vtl-freeze-time": { id: "vtl-freeze-time", work: "van 't Land", where: "section 11.2, p. 236" },
  "vtl-freeze-tunnel": { id: "vtl-freeze-tunnel", work: "van 't Land", where: "section 11.2, p. 242" },
  "vtl-flash": { id: "vtl-flash", work: "van 't Land", where: "Chapter 7, section 7.1, Fig. 7.1, pp. 117-120" },
  "vtl-flash-sel": { id: "vtl-flash-sel", work: "van 't Land", where: "Chapter 3, Flash Dryers p. 28 and Fig. 3.2 p. 25" },
  "vtl-agvac": { id: "vtl-agvac", work: "van 't Land", where: "Chapter 3: Vacuum Dryers p. 22, Fig. 3.1 pp. 23-24, section 3.3 and Fig. 3.10 p. 33, Example 3.3 p. 39" },
  "perry-flash": { id: "perry-flash", work: "Perry", where: "Pneumatic conveying dryers, pp. 12-67 to 12-70 (Table 12-40, p. 12-69)" },
  "perry-agbatch": { id: "perry-agbatch", work: "Perry", where: "Batch agitated and rotating dryers, pp. 12-46 and 12-47" },
  "tow-pneu": { id: "tow-pneu", work: "Towler", where: "section 10.4, Pneumatic dryers, pp. 574-575" },
  "tow-t10.8": { id: "tow-t10.8", work: "Towler", where: "Table 10.8, p. 572" },
  "muj-safety": { id: "muj-safety", work: "Mujumdar", where: "Ch. 1, section 1.6, pp. 24-25" },
  "muj-prepost": { id: "muj-prepost", work: "Mujumdar", where: "Ch. 1, section 1.6 (pre- and postprocessing), p. 24; Table 1.6 and the minimum information, pp. 27-28" },
  "perry-tests": { id: "perry-tests", work: "Perry", where: "Selection of drying equipment, steps 1 to 4 (drying tests, vendors' quotations), p. 12-37" },
  "perry-tray-cycle": { id: "perry-tray-cycle", work: "Perry", where: "Batch tray dryers, field of application, p. 12-39" },
  "perry-t12-12": { id: "perry-t12-12", work: "Perry", where: "Batch tray dryers, performance data, p. 12-39 (Table 12-12)" },
};

export const citeOf = (ids: readonly SourceId[]): string =>
  ids.map((s) => `${SOURCES[s].work}, ${SOURCES[s].where}`).join("; ");

// ---- the nine types (the first seven C460; flash and agitated vacuum C508) ----------------------------------------------------------------

export const DRYER_IDS = ["spray", "rotary", "fluidBed", "tray", "belt", "drum", "freeze",
  "flash", "agitatedVacuum"] as const;
export type DryerId = typeof DRYER_IDS[number];

/** A value read from a source, or `null`: "not cited". */
export interface Cited<T> { value: T; src: readonly SourceId[] }

export type FeedForm = "solution" | "paste" | "cake" | "granular" | "sheet";
/** How a type meets a feed form: `yes`, `conditional` (the book attaches a
 *  condition, named in `why`) or `no`. */
export interface FeedFit { fit: "yes" | "conditional" | "no"; why: string; src: readonly SourceId[] }

export interface EngineCase {
  /** The tutorial's key, as `?case=` takes it: category/class/folder. */
  name: string;
  /** What the engine's unit is, and how far it stands from the real dryer. */
  note: string;
}

export interface DryerInfo {
  id: DryerId;
  label: string;
  /** One sentence in the page's own words: what the equipment does. */
  idea: string;
  ideaSrc: readonly SourceId[];
  heat: Cited<string>;
  mode: Cited<string>;
  residence: Cited<string> | null;
  /** kJ per kg of water evaporated, a range. */
  energy: Cited<readonly [number, number]> | null;
  /** The book's typical evaporation capacity, with its own basis. */
  capacity: Cited<string> | null;
  products: Cited<string>;
  feed: Readonly<Record<Exclude<FeedForm, "sheet">, FeedFit>>;
  engine: EngineCase | null;
  /** When `engine` is null: the engine unit that stands nearest, if any, and how
   *  far it is from the real dryer (null = nothing stands near). */
  engineGap?: string | null;
}

export const DRYERS: Readonly<Record<DryerId, DryerInfo>> = {
  spray: {
    id: "spray", label: "Spray dryer",
    idea: "A pumpable liquid is atomised into a hot gas in a tall chamber; each droplet "
      + "dries into a particle while it falls; the hot gas enters at the roof around the "
      + "atomiser, and the powder is separated from the gas at the bottom of the cone and "
      + "in a cyclone or bag filter on the exhaust duct.",
    ideaSrc: ["vtl-spray", "perry-t12-11", "muj-spray"],
    heat: { value: "convective (hot gas contacts the droplets)", src: ["muj-heat"] },
    mode: { value: "continuous", src: ["muj-feed"] },
    residence: { value: "10-30 s", src: ["muj-t1.2"] },
    energy: { value: [4500, 11500], src: ["muj-t1.4"] },
    capacity: { value: "1-30 kg water/h per m3 of chamber", src: ["muj-t1.4"] },
    products: {
      value: "milk and coffee (Mujumdar); detergent, coffee extract, yeast, pigment, "
        + "zinc sulfate (Perry's list of products that have been spray-dried)",
      src: ["muj-t1.3", "perry-t12-41"],
    },
    feed: {
      solution: { fit: "yes", why: "suited to large capacities; the product is usually powdery, "
        + "spherical and free-flowing", src: ["perry-t12-11", "muj-t1.1"] },
      paste: { fit: "conditional", why: "only if the paste can be pumped to the atomiser, which "
        + "needs special pumping equipment (a filter cake is re-slurried first)",
        src: ["perry-t12-11", "muj-feed"] },
      cake: { fit: "no", why: "Table 1.1 ticks the spray dryer for solutions, slurries and pastes, not for cakes: a cake is re-slurried to a pumpable liquid first",
        src: ["muj-t1.1","perry-t12-11"] },
      granular: { fit: "no", why: "a solid feed is not applicable unless it is made pumpable",
        src: ["perry-t12-11", "muj-t1.1"] },
    },
    engine: {
      name: "steady/drying/sprayDryer01_sugar",
      note: "the engine's sprayDryer: a 40 wt % sugar solution atomised by a rotary wheel, "
        + "droplet drying on a falling-rate curve, the powder's moisture from a sorption isotherm",
    },
  },
  rotary: {
    id: "rotary", label: "Rotary dryer (direct-heat)",
    idea: "A slightly inclined rotating cylinder carries the wet particles from the high "
      + "end, where the feed enters, to the low end, where the product leaves, lifting them "
      + "on flights so they fall through a stream of hot gas from a burner or heater at the "
      + "feed end that flows with them (co-current, the usual choice for heat-sensitive "
      + "solids) or against them; a cyclone takes the dust from the exhaust.",
    ideaSrc: ["vtl-rotary", "perry-cons", "muj-rotary"],
    heat: { value: "convective in the direct-heat type; the steam-tube and steam-jacket "
      + "types are conductive", src: ["muj-t1.1", "vtl-rotary"] },
    mode: { value: "continuous", src: ["vtl-rotary"] },
    residence: { value: "10-60 min", src: ["muj-t1.2"] },
    energy: { value: [4600, 9200], src: ["muj-t1.4"] },
    capacity: { value: "30-80 kg water/h per m3 of shell", src: ["muj-t1.4"] },
    products: {
      value: "free-flowing granules (Mujumdar); sand and limestone (van 't Land); "
        + "ammonium sulfate, foundry sand, metallurgical coke (Perry's manufacturer data)",
      src: ["muj-t1.3", "vtl-cont-tree", "perry-t12-37"],
    },
    feed: {
      solution: { fit: "no", why: "a direct-heat rotary dryer normally cannot process solutions, "
        + "slurries or pastes (van 't Land); Perry's wider class of continuous agitated and "
        + "rotating dryers admits a liquid or slurry only with dry product recirculated, so a "
        + "practitioner's 'a rotary dryer dries slurries' holds only with that back-mixing",
        src: ["vtl-rotary", "perry-t12-11", "muj-t1.1"] },
      paste: { fit: "conditional", why: "only with dry product mixed back into the feed, so it "
        + "does not stick and can be handled", src: ["muj-feed", "perry-t12-11"] },
      cake: { fit: "yes", why: "Table 1.1 ticks the direct rotary dryer for both centrifuge and filter cakes",
        src: ["muj-t1.1"] },
      granular: { fit: "yes", why: "universally applicable to particulate materials; the usual "
        + "choice for granular crystals above about 300 micrometres", src: ["vtl-rotary", "muj-feed"] },
    },
    engine: {
      name: "steady/drying/convDryer01_sugar_curve",
      note: "the engine's convectiveDryer: a continuous convective dryer, co- or counter-current "
        + "over a declared contact area; it has no shell, flights or hold-up, so it stands for the "
        + "continuous convective family and not for a rotary geometry",
    },
  },
  fluidBed: {
    id: "fluidBed", label: "Fluidised-bed dryer",
    idea: "Hot gas blown up through a perforated plate keeps a deep bed of particles "
      + "suspended and mixed like a boiling liquid; the particles dry in intimate contact "
      + "with the gas and overflow a weir continuously, or the bed is emptied batchwise; a "
      + "cyclone keeps the fines in the exhaust.",
    ideaSrc: ["vtl-fluid", "perry-t12-11", "muj-fluid", "tow-text"],
    heat: { value: "convective (conduction coils can be added)", src: ["muj-heat", "perry-t12-11"] },
    mode: { value: "continuous or batch", src: ["vtl-fluid", "vtl-batch-tree"] },
    residence: { value: "10-60 min", src: ["muj-t1.2"] },
    energy: { value: [4000, 6000], src: ["muj-t1.4"] },
    capacity: null,
    products: {
      value: "free-flowing granules (Mujumdar); high-density polyethylene freed of hexane "
        + "with warm nitrogen (van 't Land); coal and limestone (van 't Land)",
      src: ["muj-t1.3", "vtl-cont-tree", "vtl-fluid"],
    },
    feed: {
      solution: { fit: "conditional", why: "only as a fluid-bed granulator with an inert bed or "
        + "dry-solids recirculation", src: ["perry-t12-11"] },
      paste: { fit: "conditional", why: "as for liquids: dispersion of the feed in a deep bed is "
        + "the difficulty", src: ["perry-t12-11", "muj-feed"] },
      cake: { fit: "yes", why: "Table 1.1 ticks the fluid-bed dryer for both centrifuge and filter cakes",
        src: ["muj-t1.1"] },
      granular: { fit: "yes", why: "suited to crystals, granules and short fibres, at high "
        + "capacities, when the particles fluidise (about 0.1 mm and larger in van 't Land; "
        + "Perry admits free-flowing powders of 150 micrometres or less 'if not too dusty'; "
        + "Towler gives 1 to 3 mm): the lower size limit is not one number across the books",
        src: ["perry-t12-11", "vtl-text", "tow-text"] },
    },
    engine: {
      name: "steady/drying/solidDryer01_sugar",
      note: "the engine's solidDryer: a powder dried toward the moisture set by hot air and its "
        + "sorption isotherm, with the binding limit named; it is the nearest model of a "
        + "well-mixed bed but has no fluidisation, bubbles or bed height",
    },
  },
  tray: {
    id: "tray", label: "Tray dryer (batch)",
    idea: "The wet material lies on trays stacked in an insulated cabinet; hot gas is "
      + "blown across the trays (or the shelves are heated and the cabinet is evacuated), "
      + "mostly recirculated through the heater (80 to 95 percent) with a little fresh air "
      + "in and a small exhaust out, and the batch is unloaded when it is dry.",
    ideaSrc: ["perry-tray", "perry-tray-air", "tow-text"],
    heat: { value: "convective, or conductive from heated shelves", src: ["muj-t1.1", "perry-tray"] },
    mode: { value: "batch (a continuous tray version exists)", src: ["muj-t1.1", "perry-t12-11"] },
    residence: { value: "1-6 h", src: ["muj-t1.2"] },
    energy: null,
    capacity: { value: "0.15-1.0 kg water/h per m2 of heat-transfer area (shelf, cabinet or compartment type)", src: ["tow-t10.7"] },
    products: {
      value: "a wide range of pastes and granules (Mujumdar); small multi-product "
        + "operations such as pharmaceuticals (Perry)",
      src: ["muj-t1.3", "perry-tray"],
    },
    feed: {
      solution: { fit: "no", why: "not applicable to liquids", src: ["perry-t12-11", "muj-t1.1"] },
      paste: { fit: "conditional", why: "only if the paste can be pre-formed (extruded or "
        + "granulated) so a bed can be laid", src: ["perry-t12-11"] },
      cake: { fit: "yes", why: "Table 1.1 ticks the batch tray dryer for both centrifuge and filter cakes",
        src: ["muj-t1.1"] },
      granular: { fit: "yes", why: "takes granules, crystals and cakes of almost any shape; "
        + "Perry marks it unsuited below about 0.5 mm and not applicable to free-flowing "
        + "100-mesh powders, while Mujumdar's Table 1.1 admits powders: test it",
        src: ["perry-t12-11", "muj-t1.1"] },
    },
    engine: {
      name: "batch/drying/dryer01_sucrose_tray",
      note: "the engine's batchDryer: one wet sucrose tray in declared 60 C air, the constant-rate "
        + "and falling-rate periods, the wet bulb and the GAB equilibrium moisture as results",
    },
  },
  belt: {
    id: "belt", label: "Belt (band, conveyor) dryer",
    idea: "The material is spread on a slowly moving perforated belt that carries it "
      + "through a cabinet divided into zones, where warm gas is blown up through the layer "
      + "in one zone and down in the next, with a cooling zone at the end; the "
      + "material is not stirred, so friable pieces survive.",
    ideaSrc: ["vtl-conveyor", "vtl-text", "muj-conv", "tow-text"],
    heat: { value: "convective", src: ["muj-t1.1", "vtl-conveyor"] },
    mode: { value: "continuous", src: ["vtl-conveyor"] },
    residence: { value: "10-60 min", src: ["muj-t1.2"] },
    energy: { value: [4000, 6000], src: ["muj-t1.4"] },
    capacity: { value: "1.5-35 kg water/h per m3 of dryer volume (tunnel, belt or screen type)", src: ["tow-t10.7"] },
    products: {
      value: "pellets and grains (Mujumdar); diced carrots and pasta (van 't Land)",
      src: ["muj-t1.3", "vtl-text", "vtl-conveyor"],
    },
    feed: {
      solution: { fit: "no", why: "not applicable to liquids", src: ["perry-t12-11", "muj-t1.1"] },
      paste: { fit: "conditional", why: "only if the paste can be pre-formed into a permeable "
        + "layer (an extruder or granulator upstream)", src: ["perry-t12-11", "vtl-conveyor"] },
      cake: { fit: "no", why: "Table 1.1 does not tick the belt dryer for cakes (its columns are the free-flowing and formed solids): the cake is pre-formed first",
        src: ["muj-t1.1"] },
      granular: { fit: "yes", why: "coarse particles, from about 1 mm to several centimetres, "
        + "pellets and fragile crystals; the layer must be permeable",
        src: ["vtl-conveyor", "muj-t1.1", "perry-t12-11"] },
    },
    engine: null,
  },
  drum: {
    id: "drum", label: "Drum dryer",
    idea: "A thin film of liquid or paste is spread on the outside of a slowly rotating "
      + "steam-heated drum (here by dipping the drum into a pan of the feed), dries during "
      + "less than one turn and is scraped off by a knife as flakes; the vapour leaves "
      + "through a hood.",
    ideaSrc: ["vtl-drum", "perry-t12-11", "muj-drum"],
    heat: { value: "conductive (steam inside the drum)", src: ["muj-t1.1", "vtl-drum"] },
    mode: { value: "continuous (the film is applied and scraped off as the drum turns)", src: ["vtl-drum"] },
    residence: { value: "10-30 s", src: ["muj-t1.2"] },
    energy: { value: [3200, 6500], src: ["muj-t1.4"] },
    capacity: { value: "6-20 kg water/h per m2 of drum surface (for pastes)", src: ["muj-t1.4"] },
    products: {
      value: "solutions, suspensions and pastes giving powders, flakes or chips; "
        + "the product is flaky and usually dusty (Perry)",
      src: ["vtl-drum", "perry-t12-11"],
    },
    feed: {
      solution: { fit: "yes", why: "single, double or twin drums, atmospheric or vacuum",
        src: ["perry-t12-11", "muj-t1.1"] },
      paste: { fit: "conditional", why: "only when the paste or sludge can be made to flow; a "
        + "top-fed single drum copes with viscous feeds that a double drum does not",
        src: ["perry-t12-11", "vtl-drum"] },
      cake: { fit: "no", why: "Table 1.1 does not tick the drum dryer for cakes, only for solutions, slurries and pastes: a cake is slurried to a flowing liquid first",
        src: ["muj-t1.1"] },
      granular: { fit: "no", why: "not applicable to solids", src: ["perry-t12-11", "muj-t1.1"] },
    },
    engine: null,
  },
  freeze: {
    id: "freeze", label: "Freeze dryer",
    idea: "The product is frozen, then held under a deep vacuum on heated shelves while "
      + "its ice sublimes; the vapour is caught on a very cold condenser in front of the "
      + "vacuum pumps.",
    ideaSrc: ["vtl-freeze", "muj-heat"],
    heat: { value: "conduction or radiation into a frozen product, air removed", src: ["perry-t12-11"] },
    mode: { value: "batch for pharmaceuticals; continuous tunnels for some foods",
      src: ["vtl-freeze", "vtl-freeze-tunnel"] },
    residence: { value: "10-20 h for 1 cm of a simple material", src: ["vtl-freeze-time"] },
    energy: null,
    capacity: { value: "continuous tunnels: 5-20 t of intake per 24 h", src: ["vtl-freeze-tunnel"] },
    products: {
      value: "vaccines, blood proteins, antibiotics (van 't Land); coffee and soup mixes "
        + "(van 't Land)",
      src: ["vtl-freeze"],
    },
    feed: {
      solution: { fit: "yes", why: "expensive, usually only for high-value, heat-sensitive or "
        + "easily oxidised products such as pharmaceuticals", src: ["perry-t12-11"] },
      paste: { fit: "conditional", why: "as for solutions: only where the value of the product "
        + "carries the cost", src: ["perry-t12-11"] },
      cake: { fit: "conditional", why: "not a row of Table 1.1; a cake is a solid like any other here, and the freeze dryer is for a product whose value carries its cost",
        src: ["perry-t12-11"] },
      granular: { fit: "conditional", why: "expensive; used on pharmaceuticals and fine chemicals "
        + "that cannot be dried successfully by other means", src: ["perry-t12-11"] },
    },
    engine: null,
  },
  flash: {
    id: "flash", label: "Flash (pneumatic-conveying) dryer",
    idea: "A feeder disperses wet, finely divided solid into a fast stream of hot gas in a long "
      + "duct, often vertical, and the gas that dries the solid also carries it up the duct; "
      + "the drying is over in a few seconds, so only moisture on the surface can come out; a "
      + "cyclone, with a bag filter or a scrubber if the dust must be recovered fully, takes "
      + "the dry solid from the exhaust.  The same feed system can mix a sticky feed back "
      + "with dry product or break it up in a mill.",
    ideaSrc: ["vtl-flash", "perry-flash", "tow-pneu"],
    heat: { value: "convective (the hot gas dries and conveys the solid, parallel flow only)",
      src: ["muj-heat", "muj-t1.5"] },
    mode: { value: "continuous", src: ["tow-t10.7"] },
    residence: { value: "0-10 s", src: ["muj-t1.2"] },
    energy: { value: [4500, 9000], src: ["muj-t1.4"] },
    capacity: { value: "5-100 kg water/h per m3 of dryer volume (depends on particle size)",
      src: ["muj-t1.4"] },
    products: {
      value: "free-flowing granules (Mujumdar); potato starch, aspirin, melamine, coal fines, "
        + "polycarbonate resin and expandable polystyrene beads (Perry's table of products "
        + "dried in pneumatic conveyors)",
      src: ["muj-t1.3", "perry-flash"],
    },
    feed: {
      solution: { fit: "conditional", why: "Perry admits a slurry only if dry product is "
        + "recirculated (backmixed) to make the feed suitable, and sends a liquid to that "
        + "comment; Mujumdar's Table 1.1 marks no liquid column for it, so the books differ: test it",
        src: ["perry-t12-11", "muj-t1.1"] },
      paste: { fit: "conditional", why: "only with dry product mixed back into the feed (or a "
        + "mill in the feed line) to make it a friable, dispersible feed; Perry adds that "
        + "disintegration is usually required",
        src: ["perry-t12-11", "muj-feed", "vtl-flash"] },
      cake: { fit: "conditional", why: "Table 1.1 ticks the flash dryer for both cakes, with the lumps disintegrated and dispersed in the gas (a flooded screw and a disperser, a mill, or dry product mixed back)",
        src: ["muj-t1.1","vtl-flash"] },
      granular: { fit: "yes", why: "for solids that are easily suspended in a gas stream and lose "
        + "moisture readily, up to about 1 to 2 mm (larger particles are not entrained); only "
        + "surface moisture is removed, and fragile crystals can be broken by the gas velocity",
        src: ["perry-t12-11", "vtl-flash", "perry-flash"] },
    },
    engine: {
      name: "steady/drying/evapDryer01_nacl",
      note: "the engine's evaporativeDryer: free surface water on a non-sorbing solid evaporated "
        + "into a hot gas until all the water is gone, the exhaust saturates or the gas runs out "
        + "of heat, which is how a flash dryer is limited (internal diffusion plays no part, "
        + "Perry p. 12-67); it carries no residence time or duct, so it cannot say whether a few "
        + "seconds are enough, and the duct itself is the pneumaticConveyor unit, which dries "
        + "nothing",
    },
  },
  agitatedVacuum: {
    id: "agitatedVacuum", label: "Agitated vacuum dryer (conical, double-cone, pan)",
    idea: "A closed, jacketed vessel holds one batch of wet solid, liquid or paste under vacuum; hot "
      + "water, steam or thermal oil in the jacket heats it by conduction while the contents "
      + "are moved, either by a stirrer inside a fixed vessel (the pan, conical-screw, paddle "
      + "and plough types) or by turning the whole vessel (the tumbler or double-cone type); "
      + "the vapour leaves through a dust filter to a condenser, which recovers the solvent, "
      + "and the dry batch is discharged through a port.",
    ideaSrc: ["perry-agbatch", "vtl-agvac", "tow-t10.7"],
    heat: { value: "conductive (jacket, and sometimes the stirrer, heated by hot water, steam or "
      + "thermal oil), under vacuum", src: ["perry-agbatch"] },
    mode: { value: "batch", src: ["perry-agbatch", "vtl-agvac"] },
    residence: { value: "3-12 h (Towler prints '3.12 h', a range whose dash is printed as a point); "
      + "10-30 h in van 't Land's one example of a conical mixer drying a toxic organotin batch",
      src: ["tow-t10.7", "vtl-agvac"] },
    energy: null,
    capacity: { value: "0.5-12 kg water/h per m2 of heat-transfer area (double-cone, rotary-shell "
      + "and rotary-internal types)", src: ["tow-t10.7"] },
    products: {
      value: "free-flowing powders wet with solvent or water in small batches, in pharmaceuticals, "
        + "specialty and fine chemicals, also polymers, additives and inorganic salts (Perry); "
        + "toxic organotin compounds (van 't Land); crystals, granules and powders (Towler)",
      src: ["perry-agbatch", "vtl-agvac", "tow-t10.8"],
    },
    feed: {
      solution: { fit: "yes", why: "the batch answer for a liquid, with solvent recovery and an inert "
        + "atmosphere possible; the stirrer power peaks while the liquid turns into a viscous "
        + "paste and then falls as it becomes a powder",
        src: ["muj-feed", "vtl-agvac", "perry-t12-11"] },
      paste: { fit: "yes", why: "slurries and pastes are dried batchwise in it, again with solvent "
        + "recovery", src: ["vtl-agvac", "perry-t12-11"] },
      cake: { fit: "conditional", why: "not a row of Table 1.1; the books place it with the wet solids that need vacuum, a closed vessel or low temperature, so test the cake in it",
        src: ["muj-feed","perry-t12-11"] },
      granular: { fit: "yes", why: "free-flowing powders in small batches (1000 L or less), when the "
        + "product is heat-sensitive, oxidises in air, is toxic or is wet with a flammable "
        + "solvent; the agitation causes some degradation or balling up, so a fragile "
        + "product belongs in a non-agitated vacuum tray",
        src: ["perry-agbatch", "vtl-batch-tree", "perry-t12-11"] },
    },
    engine: null,
    engineGap: "nothing stands near it: the engine's batchDryer is a tray in air of declared, constant "
      + "condition (convective, at atmospheric pressure, no jacket, no stirrer, no vacuum or "
      + "condenser), so it is not this dryer; no unit of the engine models conduction through a "
      + "jacket into a stirred batch under vacuum",
  },
};

/** Mujumdar's remark on what freeze drying costs against the spray dryer,
 *  quoted in the table's note because it is a COST, not an energy figure.
 *  The same sentence of the book says the sublimation heat is "severalfold
 *  lower than for evaporation"; that half is NOT repeated here (see
 *  SUBLIMATION_NOTE). */
export const FREEZE_COST_NOTE: { text: string; src: readonly SourceId[] } = {
  text: "Freeze drying of coffee costs two to three times what spray drying does, and keeps "
    + "the flavour better; the cost is the vacuum and the long cycle, not a dearer heat.",
  src: ["muj-heat"],
};

/** AN ERROR OF A BOOK, NAMED.  Mujumdar p. 22 says the heat required for
 *  sublimation is "severalfold lower than for evaporation".  His Chapter 11
 *  (p. 259) gives the heat of sublimation as 2840 kJ/kg of ice, and Perry's
 *  Example 12-19 (p. 12-71) the heat of vaporisation of water at 100 degC as
 *  2257 kJ/kg: the sublimation heat is the larger by about a quarter. */
export const SUBLIMATION_HEAT_KJ_PER_KG = 2840;
export const SUBLIMATION_NOTE: { text: string; src: readonly SourceId[] } = {
  text: "Mujumdar's Chapter 1 (p. 22) says the heat for sublimation is severalfold lower than "
    + "for evaporation; his own Chapter 11 (p. 259) gives 2840 kJ per kg of ice, against 2257 "
    + "kJ per kg of water evaporated at 100 degC (Perry, Example 12-19), so it is higher, not "
    + "lower.  The page does not repeat the sentence: what makes freeze drying dear is the "
    + "vacuum, the cold condenser and the 10-20 h cycle.",
  src: ["muj-heat", "muj-freeze-heat", "perry-latent"],
};

// ---- the questions and the tree ------------------------------------------------------

export type Heat = "high" | "medium" | "low";
export type Scale = "small" | "medium" | "large";
export type Mode = "batch" | "continuous";
export type Size = "fine" | "medium" | "coarse";

export interface Inputs {
  feed: FeedForm;
  /** high: the product may reach 75 degC or more; medium: between 30 and 75;
   *  low: 30 degC or less, or it oxidises in air (van 't Land Figs. 3.1, 3.2). */
  heat: Heat;
  /** small: below 50 kg/h; medium: 50 kg/h to 1 t/h; large: above 1 t/h (Perry p. 12-36). */
  scale: Scale;
  mode: Mode;
  /** Granular feeds only: fine below 0.1 mm; medium 0.1 mm to about 5 mm;
   *  coarse above about 5-10 mm or pre-formed (van 't Land Figs. 3.1, 3.2). */
  size: Size;
  /** Granular feeds only: the particles break if stirred. */
  fragile: boolean;
  /** C508.  Can the dust or the solvent vapour burn or explode?  (A warning on every
   *  answer; a rule for a fine granular batch, van 't Land Fig. 3.1.) */
  flammable: boolean;
  /** C508.  The feed is sticky or lumpy: it cakes and must be mixed back with dry product,
   *  pre-formed or disintegrated.  (A warning; the books' remedies, with their pages.) */
  sticky: boolean;
  /** C508.  Granular continuous feed only: a test on the sample shows the drying is over in
   *  about 10 s, because only surface moisture is to come out (van 't Land Fig. 3.2). */
  quick: boolean;
}

export interface Reason { text: string; src: readonly SourceId[] }

export interface Rule {
  id: string;
  /** What the rule says in one line, for the "rule that fired" label. */
  label: string;
  when: (i: Inputs) => boolean;
  picks: readonly DryerId[];
  /** A dryer the sources name that is not one of the seven. */
  outside: string | null;
  reasons: (i: Inputs) => readonly Reason[];
}

const notLow = (i: Inputs): boolean => i.heat !== "low";

/** What flow direction means for the PICKED types, attached only where it
 *  does.  Spray and (direct) rotary dryers have a gas stream that meets the
 *  solid co- or counter-currently; a well-mixed fluidised bed has one
 *  temperature (the bed's); a belt dryer blows the gas THROUGH the bed, up or
 *  down by zone; the drum is a conduction dryer with no gas stream at all, so
 *  nothing is said for it. */
const flowNotes = (i: Inputs, picks: readonly DryerId[]): Reason[] => {
  if (i.heat !== "medium") return [];
  const out: Reason[] = [];
  if (picks.includes("spray") || picks.includes("rotary")) {
    out.push({
      text: "With a product limit below 75 degC run the spray or rotary dryer co-current: the "
        + "gas cools as it dries the wet solid, so the solid leaves far below the inlet gas "
        + "temperature (a spray droplet enters at the feed temperature and within milliseconds sits near the gas's wet-bulb temperature), while "
        + "counter-current meets the driest solid with the hottest gas.",
      src: ["perry-cons", "vtl-cont-tree", "vtl-spray-flow", "muj-rotary"] });
  }
  if (picks.includes("fluidBed")) {
    out.push({
      text: "A well-mixed continuous fluidised bed has one temperature, equal to the product and "
        + "exhaust gas temperatures, so co-current against counter-current does not arise: the "
        + "product temperature is the exhaust temperature you choose.",
      src: ["muj-fluid"] });
  }
  if (picks.includes("flash")) {
    out.push({
      text: "A flash dryer has parallel flow only (Mujumdar's Table 1.5), and it takes a high inlet gas "
        + "temperature because most of the water leaves while the particles sit at the wet-bulb "
        + "temperature; the air leaves 10 to 30 K above the product, and the short time is what "
        + "protects a heat-sensitive solid.",
      src: ["muj-t1.5", "vtl-flash", "perry-flash"] });
  }
  if (picks.includes("belt")) {
    out.push({
      text: "A belt dryer blows the gas through the bed, up in one zone and down in the next, "
        + "with a cooling zone at the end; Towler adds that the solids and the air move "
        + "parallel or, more usually, counter-current overall.  A product limit is held by the "
        + "zone temperatures, not by a co-current layout.",
      src: ["tow-text", "muj-conv", "perry-cons"] });
  }
  return out;
};

export const RULES: readonly Rule[] = [
  {
    id: "sheet", label: "A continuous sheet or web",
    when: (i) => i.feed === "sheet", picks: [],
    outside: "a cylinder (multi-cylinder contact) or an impingement dryer",
    reasons: () => [
      { text: "Sheets, films and webs (paper, textiles, pulp) are dried on cylinders or by "
          + "impinging gas, and a discrete or continuous sheet is its own column in the "
          + "feed-form table; none of the seven types of this page is built for one.",
        src: ["perry-t12-11", "muj-t1.3"] },
    ],
  },
  {
    id: "liq-low-batch", label: "Solution, product limit 30 degC, batch",
    when: (i) => i.feed === "solution" && i.heat === "low" && i.mode === "batch",
    picks: ["agitatedVacuum", "freeze"], outside: null,
    reasons: () => [
      { text: "For a liquid feed batchwise the agitated vacuum dryer (long residence time, low "
          + "temperature, solvent recovery and an inert atmosphere possible) is the plainer "
          + "choice, and the freeze dryer the one for a product whose value carries it.",
        src: ["muj-feed", "perry-t12-11", "perry-agbatch", "vtl-agvac"] },
      { text: "Pharmaceutical freeze drying is usually batchwise, because of good "
          + "manufacturing practice, and a heat-sensitive, easily oxidised product is exactly "
          + "what the table of feed forms assigns to it.",
        src: ["vtl-freeze", "perry-t12-11"] },
      { text: FREEZE_COST_NOTE.text, src: FREEZE_COST_NOTE.src },
      { text: SUBLIMATION_NOTE.text, src: SUBLIMATION_NOTE.src },
    ],
  },
  {
    id: "liq-low-cont", label: "Solution, product limit 30 degC, continuous",
    when: (i) => i.feed === "solution" && i.heat === "low" && i.mode === "continuous",
    picks: ["freeze", "drum"], outside: null,
    reasons: () => [
      { text: "Continuous freeze-drying tunnels exist (coffee extract, soup mixes), at 5 to 20 "
          + "t of intake per 24 h, but the method is very expensive.",
        src: ["vtl-freeze", "vtl-freeze-tunnel"] },
      { text: "A drum dryer can be run under vacuum to keep the temperature down while the "
          + "residence time stays at seconds, and van 't Land says only that it is possible; "
          + "none of the books ties a product limit of 30 degC to a drum, so this is a "
          + "possibility to check with the vendor (the film still meets a steam-heated "
          + "surface), not a rule.",
        src: ["vtl-drum-vac", "muj-drum", "muj-t1.2"] },
      { text: FREEZE_COST_NOTE.text, src: FREEZE_COST_NOTE.src },
      { text: SUBLIMATION_NOTE.text, src: SUBLIMATION_NOTE.src },
    ],
  },
  {
    id: "liq-batch", label: "Solution, batch",
    when: (i) => i.feed === "solution" && i.mode === "batch",
    picks: ["agitatedVacuum"], outside: null,
    reasons: () => [
      { text: "For liquid feeds the choice is normally limited to a spray dryer, a drum dryer "
          + "(atmospheric or vacuum) or an agitated batch vacuum dryer; the last is the batch "
          + "answer, and van 't Land says to consider it for batchwise drying of liquids, "
          + "slurries or pastes, with solvent recovery possible.",
        src: ["muj-feed", "vtl-agvac", "perry-agbatch"] },
      { text: "Among the nine only the agitated vacuum dryer and the freeze dryer take a solution "
          + "batchwise, and the freeze dryer is expensive, usually used only for high-value "
          + "products.",
        src: ["perry-t12-11"] },
    ],
  },
  {
    id: "liq-cont", label: "Solution, continuous",
    when: (i) => i.feed === "solution" && i.mode === "continuous",
    picks: ["spray", "drum"], outside: null,
    reasons: (i) => [
      { text: "A spray dryer has a short contact time with a wide range of operating "
          + "temperatures (seconds, 10 to 30 s in the book's table), suits large capacities, "
          + "and gives a powdery, usually spherical, free-flowing product; it needs a "
          + "pumpable feed.",
        src: ["muj-feed", "muj-t1.2", "perry-t12-11"] },
      { text: "A drum dryer is the other continuous answer for a liquid: a high mean "
          + "temperature with a short contact time, a lower energy range in the book's table "
          + "than a spray dryer, and a flaky, usually dusty product with high maintenance.",
        src: ["muj-feed", "muj-t1.4", "perry-t12-11"] },
      ...flowNotes(i, ["spray", "drum"]),
    ],
  },
  {
    id: "paste-low-batch", label: "Paste, product limit 30 degC, batch",
    when: (i) => i.feed === "paste" && i.heat === "low" && i.mode === "batch",
    picks: ["tray", "agitatedVacuum", "freeze"], outside: null,
    reasons: () => [
      { text: "At a product limit of 30 degC or below look at vacuum drying; the vacuum tray "
          + "dryer is the simplest, its product usually needs sieving, and its capacity is low "
          + "(an agitated vacuum dryer moves the contents mechanically, and is widely used).",
        src: ["vtl-batch-tree", "vtl-text", "vtl-agvac"] },
      { text: "A tray takes a paste only if it can be pre-formed.", src: ["perry-t12-11"] },
      { text: "Freeze drying handles a paste that cannot be dried any other way, where the "
          + "product's value carries the cost.", src: ["perry-t12-11"] },
    ],
  },
  {
    id: "paste-low-cont", label: "Paste, product limit 30 degC, continuous",
    when: (i) => i.feed === "paste" && i.heat === "low" && i.mode === "continuous",
    picks: ["drum", "freeze"], outside: null,
    reasons: () => [
      { text: "A drum dryer takes a paste that flows, and can be run under vacuum to keep the "
          + "temperature down; the books do not give a limit of 30 degC for it, so a vacuum "
          + "drum is a possibility to check, not a rule.",
        src: ["perry-t12-11", "vtl-drum-vac", "muj-drum"] },
      { text: "Freeze drying is the expensive alternative for a heat-sensitive paste of high value.",
        src: ["perry-t12-11", "vtl-freeze"] },
    ],
  },
  {
    id: "paste-batch", label: "Paste, batch",
    when: (i) => i.feed === "paste" && i.mode === "batch",
    picks: ["tray", "agitatedVacuum"], outside: "a batch rotary dryer at atmospheric pressure",
    reasons: () => [
      { text: "For pastes and sludges the batch dryers normally used are tray (atmospheric or "
          + "vacuum), agitated batch and rotary; the tray is suitable only if the material can "
          + "be pre-formed, while the agitated vacuum dryer takes the paste as it is.  Vacuum "
          + "operation is preferable for solvent recovery, a fire or toxic hazard, or a "
          + "temperature limit; a rotating-shell vacuum dryer is the double-cone type of the "
          + "agitated vacuum card.",
        src: ["muj-feed", "perry-t12-11", "vtl-agvac", "perry-agbatch"] },
      { text: "A batch tray dryer is rarely economical except for long cycles, several "
          + "products needing strict batch identity, or quantities too small for continuous "
          + "equipment.",
        src: ["perry-tray"] },
    ],
  },
  {
    id: "paste-cont", label: "Paste, continuous",
    when: (i) => i.feed === "paste" && i.mode === "continuous",
    picks: ["drum", "spray", "flash"], outside: "an agitated contact (paddle) dryer",
    reasons: (i) => [
      { text: "A drum dryer takes a paste or sludge only when it can be made to flow.",
        src: ["perry-t12-11", "muj-t1.1"] },
      { text: "A spray dryer takes a paste only if it can be pumped to the atomiser, which "
          + "needs special pumping equipment; a hard paste can be diluted to a pumpable slurry "
          + "first, at an extra cost.",
        src: ["perry-t12-11", "muj-feed"] },
      { text: "A flash dryer takes a paste only with dry product mixed back into the feed "
          + "(Perry: usually requires recirculation of dry product, and disintegration; "
          + "Mujumdar: the pneumatic dryer requires mixing of feed with dry product to disperse "
          + "the wet solid in the gas), and it is well suited to high capacities.",
        src: ["perry-t12-11", "muj-feed", "perry-flash"] },
      { text: "Continuous dryers for pastes and sludges also include fluidised-bed, band and "
          + "rotary types, which need the feed blended with dry product or pre-formed.",
        src: ["muj-feed"] },
      ...flowNotes(i, ["drum", "spray", "flash"]),
    ],
  },
  {
    id: "cake-low-batch", label: "Cake, product limit 30 degC, batch",
    when: (i) => i.feed === "cake" && i.heat === "low" && i.mode === "batch",
    picks: ["tray", "freeze"], outside: null,
    reasons: () => [
      { text: "Table 1.1 ticks the batch tray dryer for filter and centrifuge cakes, and at a "
          + "product limit of 30 degC or below the tray is run under vacuum (the vacuum tray "
          + "dryer is the simplest, and its product usually needs sieving).",
        src: ["muj-t1.1", "vtl-batch-tree", "vtl-text"] },
      { text: "Freeze drying is the expensive alternative, for a product whose value carries "
          + "the cost.", src: ["perry-t12-11"] },
    ],
  },
  {
    id: "cake-low-cont", label: "Cake, product limit 30 degC, continuous",
    when: (i) => i.feed === "cake" && i.heat === "low" && i.mode === "continuous",
    picks: ["freeze"], outside: null,
    reasons: () => [
      { text: "Vacuum drying is usually carried out batchwise, so a continuous plant at a "
          + "product limit of 30 degC is rare; the continuous freeze-drying tunnel is the one "
          + "the books describe, and it is expensive.  Table 1.1 gives no limit by temperature.",
        src: ["vtl-text", "vtl-freeze", "muj-t1.1"] },
    ],
  },
  {
    id: "cake-batch", label: "Cake, batch",
    when: (i) => i.feed === "cake" && i.mode === "batch",
    picks: ["tray"], outside: null,
    reasons: () => [
      { text: "Table 1.1 ticks the batch tray dryer for both centrifuge and filter cakes; the "
          + "tray dryer wants a bed of uniform depth, so a cake too lumpy or sticky to lay "
          + "that way is pre-formed first.",
        src: ["muj-t1.1", "perry-tray-cycle"] },
      { text: "A batch tray dryer is rarely economical except for long cycles, several "
          + "products needing strict batch identity, or quantities too small for continuous "
          + "equipment.",
        src: ["perry-tray"] },
    ],
  },
  {
    id: "cake-cont", label: "Cake, continuous",
    when: (i) => i.feed === "cake" && i.mode === "continuous",
    picks: ["rotary", "fluidBed", "flash"], outside: null,
    reasons: (i) => [
      { text: "Table 1.1 ticks the rotary, fluid-bed and flash dryers for both centrifuge and "
          + "filter cakes, and does not tick the spray, drum or belt dryers for them.",
        src: ["muj-t1.1"] },
      { text: "A flash dryer takes a cake with the lumps disintegrated and dispersed in the gas "
          + "(a flooded screw and a disperser, a mill, or dry product mixed back into the "
          + "feed); a fluid bed has the same difficulty of dispersing the feed in the bed.",
        src: ["vtl-flash", "perry-flash", "muj-feed"] },
      ...flowNotes(i, ["rotary", "fluidBed", "flash"]),
    ],
  },
  {
    id: "gran-low-batch", label: "Granular, product limit 30 degC, batch",
    when: (i) => i.feed === "granular" && i.heat === "low" && i.mode === "batch",
    picks: ["tray", "agitatedVacuum", "freeze"], outside: null,
    reasons: () => [
      { text: "At a maximum product temperature of 30 degC or below, or when the product "
          + "oxidises in air or is toxic, the batch tree goes to vacuum drying: a vacuum tray "
          + "dryer if no agitation is needed, an agitated vacuum dryer if it is (a tumbler or "
          + "double-cone if the agitation must be gentle).",
        src: ["vtl-batch-tree", "vtl-text", "vtl-agvac"] },
      { text: "Freeze drying is the expensive alternative, used on pharmaceuticals and fine "
          + "chemicals that cannot be dried successfully by other means.",
        src: ["perry-t12-11"] },
    ],
  },
  {
    id: "gran-low-cont", label: "Granular, product limit 30 degC, continuous",
    when: (i) => i.feed === "granular" && i.heat === "low" && i.mode === "continuous",
    picks: ["freeze"], outside: null,
    reasons: () => [
      { text: "Vacuum drying is usually carried out batchwise, so a continuous plant at a "
          + "product limit of 30 degC is rare; the continuous freeze-drying tunnel is the one "
          + "the books describe, at 5 to 20 t of intake per 24 h, and it is expensive.",
        src: ["vtl-text", "vtl-freeze", "vtl-freeze-tunnel"] },
      { text: "Cocurrent, vacuum and freeze dryers are the types named as particularly suitable "
          + "for heat-sensitive materials.",
        src: ["perry-cons"] },
    ],
  },
  {
    id: "gran-batch-flammable", label: "Granular, batch, fine, flammable vapour or dust",
    when: (i) => i.feed === "granular" && i.mode === "batch" && notLow(i) && i.flammable
      && i.size === "fine" && !i.fragile,
    picks: ["agitatedVacuum", "tray"], outside: null,
    reasons: () => [
      { text: "In van 't Land's batch tree a flammable vapour sends the product to vacuum drying "
          + "once a fluidised bed is ruled out, and below 0.1 mm it is: a vacuum tray dryer if no "
          + "agitation is needed, an agitated vacuum dryer if it is.  Perry says the batch forms "
          + "are almost invariably run under vacuum, with a nitrogen bleed late in the cycle to "
          + "keep the solids temperature low, especially for removing flammable organic "
          + "solvents.",
        src: ["vtl-batch-tree", "vtl-agvac", "perry-agbatch"] },
    ],
  },
  {
    id: "gran-batch-nonagitated", label: "Granular, batch, fine or fragile",
    when: (i) => i.feed === "granular" && i.mode === "batch" && notLow(i)
      && (i.fragile || i.size === "fine"),
    picks: ["tray"], outside: null,
    reasons: (i) => [
      { text: i.fragile
          ? "Non-agitated dryers (tray, belt, through-circulation) are preferable for fragile "
            + "particles, where attrition is to be avoided."
          : "A fluidised bed is worth considering from about 0.1 mm; with smaller particles the "
            + "equipment needed to handle them may be too large, and the batch tree then ends "
            + "in a tray dryer (post-treatment of lumps is necessary).",
        src: i.fragile ? ["perry-cons", "muj-t1.1"] : ["vtl-text", "vtl-batch-tree"] },
      { text: "A batch tray dryer is rarely economical except for long cycles, several products "
          + "needing strict batch identity, or quantities too small for continuous equipment.",
        src: ["perry-tray"] },
      ...(i.size === "fine" ? [{ text: "Perry's Table 12-11 marks the batch tray 'not applicable' to "
          + "free-flowing powders of 100 mesh or less, while van 't Land's tree and Mujumdar's "
          + "Table 1.1 admit it: the books disagree, so test it.",
        src: ["perry-t12-11", "vtl-batch-tree", "muj-t1.1"] as readonly SourceId[] }] : []),
    ],
  },
  {
    id: "gran-batch", label: "Granular, batch",
    when: (i) => i.feed === "granular" && i.mode === "batch",
    picks: ["fluidBed", "tray"], outside: null,
    reasons: () => [
      { text: "From a mean particle size of about 0.1 mm a batch fluidised-bed dryer may be "
          + "considered, with inert gas if the vapour or dust can burn; a small fluid-bed test "
          + "unit is easy to run.",
        src: ["vtl-text", "vtl-batch-tree"] },
      { text: "A batch tray dryer is rarely economical except for long cycles, several products "
          + "needing strict batch identity, or quantities too small for continuous equipment.",
        src: ["perry-tray"] },
    ],
  },
  {
    id: "gran-cont-coarse", label: "Granular, continuous, coarse or fragile",
    when: (i) => i.feed === "granular" && i.mode === "continuous"
      && (i.fragile || i.size === "coarse"),
    picks: ["belt", "rotary"], outside: null,
    reasons: (i) => [
      { text: "A band dryer is preferable when the particles are coarse (over about 5 to 10 mm, "
          + "possibly after pre-forming) or cannot be suspended in the gas; the bed needs a "
          + "residence time of the order of 15 minutes for bound moisture to diffuse out.",
        src: ["vtl-cont-tree", "vtl-text"] },
      { text: i.fragile
          ? "The belt does not move the material while it dries, which is why it suits fragile "
            + "particles; a rotary dryer breaks crystals unless its flights are designed for them."
          : "For particles of several millimetres and above, through-circulation, rotary and "
            + "spouted-bed dryers are all suitable; a direct rotary dryer is the usual choice "
            + "for granular crystals above about 300 micrometres.",
        src: i.fragile ? ["vtl-conveyor", "muj-feed", "perry-cons"] : ["perry-cons", "muj-feed"] },
      ...flowNotes(i, ["belt", "rotary"]),
    ],
  },
  {
    id: "gran-cont-quick", label: "Granular, continuous, drying over in about 10 s",
    when: (i) => i.feed === "granular" && i.mode === "continuous" && i.quick,
    picks: ["flash"], outside: null,
    reasons: (i) => [
      { text: "In van 't Land's continuous tree a drying time of 10 s or less, after the particle "
          + "size, the product-temperature and the solvent questions, ends at the flash dryer, "
          + "possibly with product recirculation; drying must take place within a couple of "
          + "seconds, so only surface moisture can come out and bound moisture is hard to remove.",
        src: ["vtl-cont-tree", "vtl-flash-sel", "vtl-flash"] },
      { text: "Perry gives the same condition: the moisture must go instantaneously, internal "
          + "diffusion must not limit and the particles must be small enough for heat and mass "
          + "transfer from their interior to be essentially instantaneous; a pneumatic dryer "
          + "suits heat-sensitive, easily oxidised or flammable material that cannot stay long "
          + "at the conditions, but rarely an abrasive solid, and it can reduce the particle "
          + "size of a friable one.",
        src: ["perry-flash"] },
      { text: i.size === "medium"
          ? "THE BOOK DISAGREES WITH ITSELF on size: the tree puts no size limit on the flash "
            + "dryer, but van 't Land's own Chapter 7 gives 1 to 2 mm as the largest particle "
            + "that can be entrained, so check that your 0.1 to 5 mm material is at the small "
            + "end of that range."
          : "The largest particle van 't Land gives for a flash dryer is 1 to 2 mm, larger ones "
            + "are not entrained; fine powder is no problem for the dryer, but the gas velocity "
            + "(10 to 30 m/s at the exit) can abrade a crystal and make dust.",
        src: ["vtl-flash-sel", "vtl-flash"] },
      ...flowNotes(i, ["flash"]),
    ],
  },
  {
    id: "gran-cont-medium", label: "Granular, continuous, 0.1 mm to 5 mm",
    when: (i) => i.feed === "granular" && i.mode === "continuous" && i.size === "medium",
    picks: ["fluidBed", "rotary"], outside: null,
    reasons: (i) => [
      { text: "In the continuous tree, particles larger than 0.1 mm that fluidise go to a "
          + "fluidised-bed dryer; what cannot be handled by a flash or fluid-bed dryer can "
          + "often be done in a direct-heat rotary dryer.",
        src: ["vtl-cont-tree", "vtl-text"] },
      { text: "A fluidised bed suits crystals and granules at high capacities, has no moving "
          + "parts and a fan duty that is high because the fan fluidises the bed.",
        src: ["perry-fluid", "vtl-fluid"] },
      { text: "If a test on the sample shows the drying is over in about 10 s (surface moisture "
          + "only), say so in the question above: van 't Land's tree then ends at the flash "
          + "dryer, ahead of the fluidised bed.",
        src: ["vtl-cont-tree", "vtl-flash-sel"] },
      ...flowNotes(i, ["fluidBed", "rotary"]),
    ],
  },
  {
    id: "gran-cont-fine", label: "Granular, continuous, fine (below 0.1 mm)",
    when: (i) => i.feed === "granular" && i.mode === "continuous" && i.size === "fine",
    picks: [], outside: "an indirect-heat rotary dryer (steam-tube) or a disk dryer",
    reasons: () => [
      { text: "Below 0.1 mm van 't Land's continuous tree leaves the fluidised bed and ends at a "
          + "convection or conduction dryer with a rotating shell or agitation (a rotary or "
          + "disk dryer); if the drying takes about 10 s or less it ends at a flash dryer "
          + "instead, which the question above selects.",
        src: ["vtl-cont-tree"] },
      { text: "The direct-heat rotary dryer of the seven is the wrong kind of rotary dryer for "
          + "fines: if the solids contain extremely fine particles the large gas volumes and "
          + "high gas velocities of a direct dryer entrain them in the exit gas, and the "
          + "indirect types (steam-tube, steam-jacket) need only enough gas to carry the "
          + "vapour away; Perry likewise advises the indirect mode for a feed with fines, and "
          + "lists the continuous agitated and rotating dryers, whose chief advantage is low "
          + "dust loss, for free-flowing powders of 100 mesh or less.",
        src: ["muj-rotary", "perry-direct", "muj-feed", "perry-t12-11"] },
      { text: "THE BOOKS DISAGREE here: Perry's Table 12-11 marks a fluidised bed 'suitable, if "
          + "not too dusty' for free-flowing powders of 100 mesh (150 micrometres) or less, "
          + "with internal coils for fine powders, while van 't Land's tree stops the fluid "
          + "bed at 0.1 mm and his batch text says equipment for smaller particles may be too "
          + "large.  The thresholds differ too (150 against 100 micrometres).  How dusty the "
          + "powder is decides it: test it.",
        src: ["perry-t12-11", "vtl-cont-tree", "vtl-text"] },
    ],
  },
];

export interface Result {
  rule: Rule;
  picks: readonly DryerId[];
  outside: string | null;
  reasons: readonly Reason[];
  /** Consistency notes between the throughput and the batch/continuous choice. */
  warnings: readonly Reason[];
}

export function scaleWarnings(i: Inputs): Reason[] {
  const out: Reason[] = [];
  if (i.mode === "continuous" && i.scale === "small") {
    out.push({
      text: "Batch dryers are almost invariably used below about 50 kg/h; a continuous dryer at "
        + "this scale is unusual.  The three books draw the line at different places (50, 100 and "
        + "100 kg/h), so treat it as a band, not a wall.",
      src: ["perry-cons", "muj-batch", "vtl-text"],
    });
  }
  if (i.mode === "batch" && i.scale === "large") {
    out.push({
      text: "Continuous dryers are generally used above about 1 t/h; a batch dryer at this scale "
        + "means many parallel units or a very long cycle.",
      src: ["perry-cons"],
    });
  }
  if (i.scale === "medium") {
    out.push({
      text: "Between 50 kg/h and 1 t/h either batch or continuous equipment may be suitable; "
        + "the neighbouring operations upstream and downstream usually decide.",
      src: ["perry-cons", "vtl-text"],
    });
  }
  return out;
}

/** The plain warning printed on every answer (C508).  Perry: the preliminary selection is
 *  followed by a rough size and cost comparison, then DRYING TESTS on the dryers still standing,
 *  which "will determine the optimum operating conditions and the product characteristics and
 *  will form the basis for firm quotations from equipment vendors", and the final selection is
 *  made from the tests and the quotations (p. 12-37).  Mujumdar: preliminary tests, and for some
 *  dryers full-scale tests only (p. 24). */
export const FIRST_SCREEN: { text: string; src: readonly SourceId[] } = {
  text: "This is a first screen, not a selection: it narrows the field the way the books do, by "
    + "feed form, heat sensitivity, scale and mode.  Drying tests on your own sample, in the "
    + "dryers still standing, and the vendors' quotations decide (Perry's steps 3 and 4 of the "
    + "selection procedure).",
  src: ["perry-tests", "muj-feed"],
};

/** The three questions of C508, asked as warnings that follow the answers and never change
 *  a pick silently (the one rule they do change, a flammable fine powder in a batch, is the
 *  rule "gran-batch-flammable").  Qualitative: each sentence carries the page it was read at. */
export function questionWarnings(i: Inputs): Reason[] {
  const out: Reason[] = [];
  if (i.flammable) {
    out.push({
      text: i.mode === "batch"
        ? "Dust or solvent vapour that can burn changes the dryer, not only its settings.  In the "
          + "books the way out is to dry under vacuum (a closed vessel, the solvent recovered in a "
          + "condenser, no air to burn it), or in an inert gas such as nitrogen: a batch "
          + "fluidised bed can run on inert gas.  Where a hot-air dryer stays, Mujumdar's remedies are to cut the oxygen by "
          + "recycling the gas, to fit explosion vents and to avoid any build-up of product; "
          + "removing every source of ignition is not accepted as enough."
        : "Dust or solvent vapour that can burn changes the dryer, not only its settings.  In "
          + "van 't Land's continuous tree a solvent to be evaporated and recovered comes first "
          + "of all and ends at a conduction dryer with an inert stripping gas (a plate dryer), "
          + "because a convective dryer would have to condense the solvent from a large "
          + "carrier-gas flow; a fluidised bed on warm nitrogen is his example for hexane on "
          + "polyethylene.  Mujumdar's remedies for a convective dryer are a closed cycle or "
          + "self-inertising system with the oxygen cut by recycling, explosion vents and no "
          + "build-up of product (it is often cheaper to inert the system than to build a "
          + "chamber that withstands the explosion); Perry notes that indirect dryers suit "
          + "reduced pressure and inert atmospheres, and that a flash dryer, which holds little "
          + "material for a few seconds, is suited to flammable or explosive material.",
      src: i.mode === "batch"
        ? ["vtl-agvac", "vtl-batch-tree", "perry-agbatch", "muj-safety"]
        : ["vtl-cont-tree", "vtl-text", "muj-safety", "perry-direct", "perry-flash"],
    });
  }
  if (i.sticky && i.feed !== "solution") {
    out.push({
      text: "A sticky or lumpy feed does not feed, disperse or flow as it arrives.  The books' "
        + "remedies are three: mix it back with dry product until it is friable (Mujumdar and "
        + "Perry name the continuous rotary and the pneumatic dryer for pastes and sludges; "
        + "the difficulty of a fluidised bed is dispersing the feed in the bed), pre-form it by extruding or granulating so a permeable bed can be laid, or "
        + "break it up in the dryer with a mill or an air-swept disintegrator.  Each has a "
        + "price: the recycled product is dried again, which costs heat and capacity; a "
        + "rotating vessel can ball sticky solids up (a special agitator design prevents it); "
        + "a rotary dryer wants a product that does "
        + "not stick to its walls; and with several drying stages the first can leave a "
        + "product too sticky to handle.",
      src: ["muj-feed", "perry-t12-11", "vtl-flash", "perry-flash", "perry-agbatch", "muj-safety"],
    });
  }
  return out;
}

/** What stands before and after the dryer (C508, the third question): not an input, a
 *  list of the things a first screen does not size and the books say must be sized. */
export interface AroundItem { heading: string; text: string; src: readonly SourceId[] }
export const AROUND_THE_DRYER: readonly AroundItem[] = [
  {
    heading: "Before: how the feed gets in",
    text: "A dryer is fed by what comes before it, usually a paste or a cake that is wet and "
      + "sticky.  Mujumdar counts the preprocessing (mechanical dewatering, centrifugation, "
      + "evaporation, pressing) as part of the dryer system, and his vendor checklist asks "
      + "about the operations before and after the dryer.  The feed system itself is part of "
      + "the choice: a spray dryer needs the feed pumped to an atomiser, a flash dryer a "
      + "flooded screw and a disperser (or a mill, or back-mixing with dry product), and a tray "
      + "dryer wants a paste pre-formed so that a bed of uniform depth can be laid.",
    src: ["muj-prepost", "perry-t12-11", "vtl-flash", "perry-tray-cycle"],
  },
  {
    heading: "After the gas: cleaning the exhaust",
    text: "The exhaust carries dust and vapour out of every dryer that uses a large gas flow, "
      + "and the equipment to clean it may be very large and dear, especially for very small "
      + "particles.  A cyclone is the cheap first step (the books' spray and flash dryers have "
      + "one), and bag filters, scrubbers or electrostatic precipitators follow where the "
      + "emission limit or the value of the dust asks for it; noxious gases go to absorption, "
      + "adsorption or incineration.  High collection efficiency costs pressure drop, which "
      + "costs fan power and noise.",
    src: ["perry-direct", "muj-safety", "vtl-flash", "tow-pneu"],
  },
  {
    heading: "After the solid: cooling and collecting the product",
    text: "A dried product is hot, and the books do not combine the two jobs: drying and cooling "
      + "can rarely be done in one dryer, so the dry product is cooled in a separate pneumatic "
      + "line after a flash dryer, in an air-swept rotary cooler after a rotary dryer, or in a "
      + "cooling zone at the end of a fluidised bed or a belt.  Mujumdar lists product "
      + "collection, cooling, agglomeration, granulation and scrubbing as the postprocessing of "
      + "the dryer system.",
    src: ["vtl-flash", "vtl-rotary", "vtl-conveyor", "tow-text", "muj-prepost"],
  },
];

/** THE TREE: the first rule whose condition holds fires.  The order is the
 *  page's (feed, heat, mode); the content of every rule is a book's. */
export function recommend(i: Inputs): Result {
  const rule = RULES.find((r) => r.when(i));
  if (!rule) throw new Error(`dryerSelection: no rule covers ${JSON.stringify(i)}`);
  return {
    rule, picks: rule.picks, outside: rule.outside,
    reasons: rule.reasons(i), warnings: [...scaleWarnings(i), ...questionWarnings(i)],
  };
}

export const DEFAULT_INPUTS: Inputs = {
  feed: "solution", heat: "medium", scale: "large", mode: "continuous",
  size: "medium", fragile: false, flammable: false, sticky: false, quick: false,
};

// ---- the comparison table ---------------------------------------------------------------

export interface ComparisonRow {
  id: DryerId; label: string;
  heat: string; mode: string;
  residence: string | null; energy: string | null; capacity: string | null;
  products: string;
  /** every source the row's cells were read from */
  src: readonly SourceId[];
}

const fmtInt = (v: number): string => v.toLocaleString("en-US");

export function comparisonRows(): ComparisonRow[] {
  return DRYER_IDS.map((id) => {
    const d = DRYERS[id];
    const src = new Set<SourceId>([...d.heat.src, ...d.mode.src, ...d.products.src]);
    for (const c of [d.residence, d.energy, d.capacity]) if (c) c.src.forEach((s) => src.add(s));
    return {
      id, label: d.label, heat: d.heat.value, mode: d.mode.value,
      residence: d.residence ? d.residence.value : null,
      energy: d.energy ? `${fmtInt(d.energy.value[0])}-${fmtInt(d.energy.value[1])}` : null,
      capacity: d.capacity ? d.capacity.value : null,
      products: d.products.value, src: [...src],
    };
  });
}

// ---- the energy arithmetic (page arithmetic on the cited table) -------------------------

/** The heat of vaporisation of water at 100 degC used in Perry's worked
 *  example, kJ/kg (2257 J/g, Example 12-19, p. 12-71). */
export const LATENT_HEAT_KJ_PER_KG = 2257;

/** Water to evaporate, kg/h, from a dry-solid rate and dry-basis moistures. */
export function waterEvaporated(msDry: number, X0: number, Xf: number): number {
  return Math.max(0, msDry * (X0 - Xf));
}

/** Heat duty in kW for `mw` kg/h of water at `e` kJ/kg. */
export function dutyKW(mw: number, e: number): number {
  return (mw * e) / 3600;
}

/** The fraction of the supplied energy that is the latent heat itself. */
export function efficiency(e: number): number {
  return LATENT_HEAT_KJ_PER_KG / e;
}

export interface EnergyBill {
  id: DryerId; label: string;
  lowKW: number; highKW: number; effHigh: number; effLow: number;
}

/** The bill for every type the book prices (kJ/kg) at one duty. */
export function energyBills(mw: number): EnergyBill[] {
  const out: EnergyBill[] = [];
  for (const id of DRYER_IDS) {
    const e = DRYERS[id].energy;
    if (!e) continue;
    out.push({
      id, label: DRYERS[id].label,
      lowKW: dutyKW(mw, e.value[0]), highKW: dutyKW(mw, e.value[1]),
      effHigh: efficiency(e.value[0]), effLow: efficiency(e.value[1]),
    });
  }
  return out;
}

export const FEED_LABEL: Readonly<Record<FeedForm, string>> = {
  solution: "Solution or slurry (pumpable liquid)",
  paste: "Paste or sludge (a wet mass that flows or can be made to)",
  cake: "Filter or centrifuge cake (a damp, lumpy solid)",
  granular: "Granular or particulate solid",
  sheet: "Sheet, film or web",
};
export const HEAT_LABEL: Readonly<Record<Heat, string>> = {
  high: "Robust: the product may reach 75 degC or more",
  medium: "Sensitive: between 30 and 75 degC",
  low: "Very sensitive: 30 degC or less, or oxidises in air",
};
export const SCALE_LABEL: Readonly<Record<Scale, string>> = {
  small: "Small: below 50 kg/h",
  medium: "Medium: 50 kg/h to 1 t/h",
  large: "Large: above 1 t/h",
};
export const MODE_LABEL: Readonly<Record<Mode, string>> = {
  batch: "Batch", continuous: "Continuous",
};
export const SIZE_LABEL: Readonly<Record<Size, string>> = {
  fine: "Fine: below 0.1 mm",
  medium: "Medium: 0.1 mm to about 5 mm",
  coarse: "Coarse: above about 5-10 mm, or pre-formed",
};
