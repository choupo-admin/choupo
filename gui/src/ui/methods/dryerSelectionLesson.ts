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
  The "Which dryer for which product" lesson, as DATA (DEV.md 4c C460, Vitor
  2026-11-19).  A page that helps a reader CHOOSE between defensible
  alternatives is a SELECTION aid in the registry's own sense; it constructs
  no answer and the engine computes none of it.

  EVERY CLAIM IS A BOOK'S, AT A PAGE.  The numbers and rules the steps state
  are held by tests/dryerSelection.test.ts against the data and the rules of
  dryerSelection.ts, where each carries its source id; a step that prints a
  number the data does not hold fails.  The books are Mujumdar (ed.), Handbook
  of Industrial Drying, 3rd ed. (2006), Chapter 1 (and, for the drawings,
  Chapters 7 to 11 and 17); Perry's Chemical Engineers' Handbook, 9th ed.
  (2019), Section 12; van 't Land, Drying in the Process Industry (2012);
  and Towler and Sinnott, Chemical Engineering Design (2008), Chapter 10, the
  page numbers being the printed ones.  The habitual tables of step 6 are
  transcribed in dryerTables.ts and pinned cell by cell by the test.
  Steps 1 to 8 cite no engine source line, so there is no citation to
  drift there.  Steps 9 to 12 (C465, the three flow arrangements) DO cite the
  engine's own unit by file:line, and every such citation is a CLAIMS key of
  tests/dryerArrangements.test.ts, which repoint_lesson_citations keeps
  current and check_lesson_prose_citations requires.
\*---------------------------------------------------------------------------*/

import type { QuizQuestion } from "./lessonQuiz.js";
import type { LessonLimit, LessonStep } from "./lessonStep.js";

export type { LessonStep };

export const DRYER_SELECTION_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Nine types do most of the drying, and they differ in how heat reaches the product",
    body: "Hundreds of dryers are sold, but a handful of types account for most of what a "
      + "chemical or food plant meets: the spray dryer, the direct-heat rotary dryer, the "
      + "fluidised-bed dryer, the tray dryer, the belt (band) dryer, the drum dryer, the "
      + "freeze dryer, the flash (pneumatic-conveying) dryer and the agitated vacuum dryer "
      + "(the conical, double-cone or pan dryer).  Mujumdar sorts dryers by three things: how heat is supplied "
      + "(convection, conduction or radiation), the temperature and pressure of operation, and "
      + "how the material is handled inside (Mujumdar 2006, section 1.5, p.21).  In a convective "
      + "(direct) dryer hot gas touches the product and carries the vapour away: spray, rotary, "
      + "fluidised bed, belt and flash, which carries the solid up a duct in the gas "
      + "(Perry p.12-67).  In a conduction (indirect) dryer a heated wall touches it: the "
      + "drum, the heated-shelf tray and the jacket of an agitated vacuum dryer, whose "
      + "contents are stirred or tumbled under vacuum (Perry p.12-46); the thermal efficiency of conduction dryers tends to be "
      + "higher because the hot gas of a convective dryer carries away a large enthalpy "
      + "(Mujumdar p.22).  The freeze dryer is a special case: the water leaves as ice sublimes "
      + "under vacuum, below the triple point (Mujumdar p.22).  The page draws each type as a "
      + "schematic made for it, with one colour code: wet feed and wet material in blue, hot "
      + "gas in red, dry product in amber, vapour in grey, a cold surface in teal.  Each "
      + "drawing was checked against the chapter of Mujumdar's Handbook that describes the "
      + "equipment: the rotary shell is inclined so that the feed enters the upper end and "
      + "the product leaves the lower end, with a burner at the feed end and a cyclone on the "
      + "exhaust (Mujumdar p.151-152).",
    note: "The drawings carry no dimension: they show where the feed enters, where the gas "
      + "flows and where the product leaves, which is what a selection rule turns on.",
  },
  {
    n: 2,
    title: "The form of the feed is asked first",
    body: "A dryer must be able to take the feed as it arrives.  Mujumdar's Table 1.1 (p.21) "
      + "ticks, for each dryer, the feed forms it handles: the spray dryer and the drum dryer "
      + "take liquids (solution, slurry, paste) and nothing else; the flash dryer takes cakes, "
      + "powders, granules and fibres, never a liquid (Perry admits a slurry only with dry "
      + "product mixed back); the belt dryer takes "
      + "granules, pellets, fragile crystals, fibres and formed solids; the rotary and the "
      + "fluidised-bed dryers take cakes, powders, granules and pellets, and the fluidised bed "
      + "also solutions and slurries in the table; the tray dryer takes almost every solid "
      + "form.  Perry's Table 12-11 (p.12-33 and 12-34) is more careful: it attaches the "
      + "conditions.  A spray dryer takes a paste only if it can be pumped to the atomiser; a "
      + "drum dryer takes a paste only if it can be made to flow; a tray takes a paste only "
      + "if it can be pre-formed; a fluidised bed takes a liquid only as a granulator with an "
      + "inert bed or with dry solid mixed back.  For liquid feeds the choice is normally "
      + "limited to a spray dryer, a drum dryer or an agitated batch vacuum dryer "
      + "(Mujumdar p.24).  A sheet or a web (paper, film, fabric) is none of the nine: it is "
      + "dried on cylinders or by impinging gas (Perry p.12-34; Mujumdar Table 1.3, p.23).",
    note: "A tick in Table 1.1 means the type is used for that form, not that it is the "
      + "best; Perry's conditions are where the real decisions are.",
  },
  {
    n: 3,
    title: "Heat sensitivity: how long, how hot, and in which direction",
    body: "A product is hurt by temperature and by time, and the types differ greatly in both.  "
      + "Mujumdar's Table 1.2 (p.21) gives the typical residence time: 10 to 30 s in a spray "
      + "dryer and in a drum dryer, 0 to 10 s in a flash dryer, 10 to 60 min in a fluidised bed, a "
      + "rotary dryer and a belt dryer, 1 to 6 h in a batch tray dryer, and Towler gives 3 to 12 h "
      + "for the cycle of a double-cone vacuum dryer (his Table 10.7 prints it '3.12 h'); van 't Land gives 10 to 20 h for a 1 cm layer of "
      + "a simple material in a freeze dryer (p.236).  While the surface is wet the solid sits "
      + "at the wet-bulb temperature of the gas, and only in the falling-rate period does it "
      + "approach the gas's dry-bulb temperature (Mujumdar p.21-22), a fact the book asks "
      + "you to weigh when drying heat-sensitive solids.  The direction matters: in co-current flow the gas "
      + "cools as it dries the wet solid, so the solid leaves far below the inlet gas "
      + "temperature, and Perry calls co-current, vacuum and freeze dryers particularly suitable "
      + "for heat-sensitive materials; counter-current dryers meet the driest solid with the "
      + "hottest gas and are unsuitable for thermally sensitive solids (Perry p.12-36).  Vacuum "
      + "operation is expensive and is recommended only if the product must be dried at low "
      + "temperature or without oxygen (Mujumdar p.22).  The "
      + "page uses van 't Land's two temperature bands: at a maximum product temperature of "
      + "30 degC or less, or if the product oxidises in air or is toxic, his batch tree goes to "
      + "vacuum drying (Figure 3.1, p.23).  His continuous tree (Figure 3.2, p.25) is drawn "
      + "for a particulate solid, and the 75 degC question reaches the spray dryer only "
      + "together with a second one: if the maximum product temperature is 75 degC or more "
      + "AND a particle-size increase is required, the answer is re-slurrying additives and a "
      + "spray dryer; otherwise the tree goes on to the drying time and the particle size.  "
      + "A liquid feed is outside that tree, and reaches the spray dryer by the feed-form "
      + "tables of step 2.",
    note: "Freeze drying costs two to three times what spray drying does, for coffee, and "
      + "keeps the flavour better (Mujumdar p.22): the price of protecting a sensitive product "
      + "is stated by the same book that recommends it.  The same sentence says the heat of "
      + "sublimation is severalfold lower than that of evaporation, which is wrong by the book's "
      + "own Chapter 11: it gives 2840 kJ per kg of ice (p.259), against 2257 kJ per kg of "
      + "water at 100 degC.  What makes freeze drying dear is the vacuum, the cold condenser "
      + "and the long cycle, not a lower heat.",
  },
  {
    n: 4,
    title: "Scale and mode: batch below about 50 kg/h, continuous above about a tonne an hour",
    body: "Perry's rule of thumb is that batch dryers are almost invariably used below a mean "
      + "throughput of 50 kg/h and continuous dryers generally above 1 t/h, either being "
      + "suitable in between (p.12-36).  The other two books put the line elsewhere: Mujumdar "
      + "says a batch dryer may suit a feed rate below 100 kg/h (p.28), and van 't Land that "
      + "capacities above 100 kg/h often require a continuous dryer (p.21).  The page uses "
      + "Perry's two thresholds and says when a choice runs against them.  A batch tray dryer "
      + "is rarely economical except for a long heating cycle (over 12 to 24 h), several "
      + "products that need strict batch identity, or quantities that do not justify "
      + "continuous equipment (Perry p.12-38), which is why pharmaceutical plants use it; "
      + "pharmaceutical freeze drying is usually batchwise for the same reason, good "
      + "manufacturing practice (van 't Land p.232).  The mode also limits the choice of type: "
      + "among the nine, the spray, rotary, belt, drum and flash dryers are continuous, the tray "
      + "and agitated vacuum dryers are batch, the freeze dryer is batch for pharmaceuticals, "
      + "and the fluidised-bed dryer comes in both.",
  },
  {
    n: 5,
    title: "What the energy column costs",
    body: "Mujumdar's Table 1.4 (p.26) lists, for the dryers it prices, a typical energy "
      + "consumption in kJ per kg of water evaporated: 3,200 to 6,500 for a drum dryer, "
      + "4,000 to 6,000 for a fluidised bed and for a belt dryer, 4,500 to 9,000 for a flash "
      + "dryer, 4,600 to 9,200 for a rotary dryer and 4,500 to 11,500 for a spray dryer; the figures are approximate and are "
      + "current practice, not the limit of the art.  The book gives none for a batch tray "
      + "dryer, a freeze dryer or an agitated vacuum dryer, and the page leaves them blank.  Evaporating a kilogram of "
      + "water at 100 degC needs 2257 kJ (Perry's Example 12-19, p.12-71), so the ratio of "
      + "that heat to the table's energy is the share of the energy that does the evaporating: "
      + "at 4,500 kJ/kg a spray dryer sends about half of it into the vapour, at 11,500 about a "
      + "fifth.  The water to be removed follows from the dry-solid rate and the moisture "
      + "before and after, on a dry basis; the duty is that water times the energy per "
      + "kilogram.  For 1000 kg/h of water the spray dryer's range is 1,250 to 3,194 kW.  This "
      + "is the page's arithmetic on a cited table: it ranks the types by the energy they use, "
      + "and it is not a design.",
    formula: String.raw`\dot m_\mathrm{w} = \dot m_\mathrm{s}\,(X_0 - X_\mathrm{f}),\qquad
\dot Q = \dot m_\mathrm{w}\,e,\qquad
\eta \approx \frac{\Delta h_\mathrm{vap}}{e}`,
    where: [
      { sym: "\\dot m_\\mathrm{w}", means: "The water the dryer must evaporate.", unit: "kg/h" },
      { sym: "\\dot m_\\mathrm{s}", means: "The flow of dry solid through the dryer: the product "
        + "rate, counted without its moisture.", unit: "kg/h" },
      { sym: "X_0", means: "The moisture of the feed on a dry basis: kilograms of water per "
        + "kilogram of dry solid.", unit: "kg/kg" },
      { sym: "X_\\mathrm{f}", means: "The moisture of the product on a dry basis, the same "
        + "units.", unit: "kg/kg" },
      { sym: "\\dot Q", means: "The heat the dryer consumes, at the energy per kilogram of "
        + "water of the chosen type.", unit: "kJ/h" },
      { sym: "e", means: "The typical energy consumption of the type, kilojoules per "
        + "kilogram of water evaporated (Mujumdar Table 1.4): a range, never one number.",
        unit: "kJ/kg" },
      { sym: "\\eta", means: "The share of the consumed energy that is the latent heat of "
        + "evaporation itself: an upper bound on how well the dryer uses its heat, since heat "
        + "also warms the solid, the gas and the surroundings." },
      { sym: "\\Delta h_\\mathrm{vap}", means: "The heat of vaporisation of water, 2257 kJ/kg "
        + "at 100 degC in Perry's worked example.", unit: "kJ/kg" },
    ],
    note: "An energy figure is about the dryer and its duty, not the product: a drum dryer's "
      + "low figure holds for a paste that suits a drum, and says nothing for a feed it cannot take.",
  },
  {
    n: 6,
    title: "The habitual tables, as the books print them",
    body: "The page ends its reading with the tables a drying engineer is shown, each "
      + "transcribed at its page and printed as the book prints it.  Mujumdar's Table 1.1 "
      + "(p.21) ticks the dryers against eleven feed forms (solution, slurry, pastes; "
      + "centrifuge and filter cakes; powder, granule, fragile crystal, pellet, fibre; "
      + "formed solids), which is wider than the three forms of the tree.  His Table 1.5 "
      + "(p.27) gives, for a very rough sizing, the volumetric coefficient ha of the "
      + "convection dryers in kcal/(h degC m3), the log-mean temperature difference and the "
      + "inlet gas temperature, co-current against counter-current for the rotary, spray and "
      + "tunnel dryers, and U and t_k - t_m for the drum and the agitated contact dryers.  "
      + "Towler's Table 10.7 (printed p.571) lists some twenty specific dryers with whether "
      + "they are jacketed, suit heat-sensitive materials or vacuum service, their retention "
      + "or cycle time, heat-transfer method, capacity and typical evaporation capacity; it "
      + "is where the tray (0.15 to 1.0 kg/(h m2) of heat-transfer area, cabinet type), "
      + "the belt (1.5 to 35 kg/(h m3), tunnel belt type) and the double-cone vacuum dryer (0.5 "
      + "to 12 kg/(h m2)) get a number the other books do not give.  For the tray, Perry's "
      + "performance data (p.12-39) give an overall 0.0025 to 0.025 kg of water per second per "
      + "m2 of tray area, which is 9 to 90 kg/(h m2): sixty to ninety times Towler's figure.  The lower "
      + "ends agree if Towler's unit is read per minute (0.0025 kg/s is 0.15 kg/min), so the "
      + "printed unit looks like the error, but that is a reading, not a proof, and the page "
      + "keeps both.  Before choosing, Mujumdar's Table 1.6 (p.28) is the checklist vendors use to "
      + "select and quote a dryer, to be read with van 't Land's list of the data to assess "
      + "(Table 3.1) and of the criteria for judging the dried product (Table 3.2), both on "
      + "p.22.  Last, the drum dryer is the one place where two books give different "
      + "numbers: Perry's Table 12-46 (p.12-81) gives a typical specific evaporation of 7 to "
      + "11 g/(m2 s), which is 25 to 40 kg/(m2 h), and Mujumdar's Table 1.4 gives 6 to 20 "
      + "kg/(m2 h) for pastes (his Chapter 9, p.206, 10 to 30 for materials difficult to dry "
      + "and 40 to 50 for easy ones); on the thermal efficiency they agree, 0.4 to 0.7 against "
      + "the 0.35 to 0.71 that 2257 kJ/kg and Mujumdar's 3,200 to 6,500 kJ/kg imply.  Both are "
      + "shown, none is averaged.",
    note: "Two prints are kept as they are: Towler's retention times read '6.48 h' and '3.12 "
      + "h' in the library copy (a range whose dash is printed as a point), and Mujumdar's ha "
      + "for a spray dryer reads '20-80 (large five)'.  Towler marks the direct rotary dryer "
      + "'No' for heat-sensitive materials as a type, where Mujumdar (p.151) and Perry (p.12-36) "
      + "run it co-current for them: another disagreement to test, not to average.",
  },
  {
    n: 7,
    title: "Which of these the engine models",
    body: "Choupo models some of this equipment, and each model has a tutorial case that the "
      + "page opens in a new tab.  The flash dryer is limited as the engine's evaporativeDryer "
      + "is: free surface water on a non-sorbing solid, evaporated into a hot gas until it is "
      + "gone, the exhaust saturates or the gas runs out of heat; that unit carries no residence "
      + "time, so it cannot say whether a few seconds are enough, and the drying duct is the "
      + "pneumaticConveyor unit, which dries nothing.  No unit of the engine stands "
      + "near the agitated vacuum dryer (the batchDryer is a tray in air, not a jacketed vessel under vacuum).  The spray dryer is the engine's sprayDryer unit, and its "
      + "case dries a sugar solution.  The fluidised-bed type is nearest to the engine's "
      + "solidDryer, a powder dried toward the moisture set by the hot air and its sorption "
      + "isotherm; it has no fluidisation or bed height.  The continuous convective dryers "
      + "(co-current or counter-current over a contact area, as in a rotary dryer) are "
      + "nearest to the convectiveDryer unit, which has no shell, flights or belt.  The "
      + "batch tray dryer is the engine's batchDryer, one tray of wet sucrose in declared "
      + "air.  The drum dryer, the belt dryer's geometry, the agitated vacuum dryer and the freeze "
      + "dryer have no model, and the page does not pretend otherwise: those rows have no case.",
  },
  {
    n: 8,
    title: "Reading the answer, and what to do when the books disagree",
    body: "The page returns one or two types and the reason for each, with its source.  Treat "
      + "it as a shortlist, which is how Perry uses his own Table 12-11: a preliminary "
      + "selection, then a rough comparison by cost and performance, then drying tests on the "
      + "dryers still standing, then a final choice from the tests and the quotations "
      + "(p.12-37).  Mujumdar adds that the tests should use the real feed, because a minor "
      + "change in composition can change the drying and handling and block the dryer, and that "
      + "the choice is a compromise between cost, quality, safety and convenience "
      + "(p.24 and p.27).  Where the books disagree the page says so: Perry marks the batch "
      + "tray dryer not applicable to a free-flowing powder, while van 't Land's batch tree "
      + "and Mujumdar's Table 1.1 admit it; for a fine powder in a continuous dryer Perry "
      + "admits a fluidised bed 'if not too dusty' (Table 12-11) while van 't Land's tree and "
      + "Mujumdar's remark on entrainment (p.152) point to an indirect rotary or a disk "
      + "dryer; and the drum's evaporation per square metre differs between Perry and "
      + "Mujumdar (step 6).  A book can also disagree with itself, as Mujumdar does on the heat "
      + "of sublimation (step 3).  A disagreement is not a reason to average the "
      + "books, it is the thing to test.",
  },
  {
    n: 9,
    title: "Co-current, counter-current, cross-flow: which gas meets which solid",
    body: "A continuous convective dryer has two streams, the wet solid and the hot gas, and "
      + "the one choice the designer makes about how they meet is their direction.  The gas "
      + "is hot and dry where it enters and cool and humid where it leaves, because it has "
      + "given its heat to evaporate water and has taken the water up.  So WHERE the gas "
      + "enters decides what each part of the solid sees.  With the gas flowing WITH the solid "
      + "(co-current, or parallel flow) the wettest solid meets the hottest, driest gas and "
      + "the driest solid meets gas that is already used up.  With the gas flowing AGAINST the "
      + "solid (counter-current) the driest solid meets the freshest, hottest gas and the "
      + "wettest solid meets the used-up gas.  With the gas ACROSS the solid (cross-flow) "
      + "every length of the solid is given gas fresh from the inlet, passes it through "
      + "once, and the exhaust is the mix of what left each length.  Mujumdar develops the "
      + "three as the cases of his distributed-parameter model (Handbook, Chapter 3, section "
      + "3.6.2, pp. 63 to 66), van 't Land lists the modes of flow in section 4.1 (p. 42) "
      + "and Perry describes them on p. 12-36.  The three drawings below use the page's "
      + "colour code and add one thing: the gas is red where it is hot and grey where it is "
      + "used up, and the solid goes from the feed's blue to the product's amber, so the end "
      + "of the solid that meets the red gas can be read off the picture.",
    note: "The drawings carry no dimension; the arrows show which way each stream goes.",
  },
  {
    n: 10,
    title: "The balances along the length, and what the driving force does in each",
    body: "Three balances run along the dryer.  The water balance says that what the solid "
      + "loses the gas gains.  The heat balance says that the gas cools as it gives up the "
      + "heat of evaporation (the engine prices both streams on the package's own enthalpy "
      + "surface, so the unit's first law closes and is printed).  The rate says how fast a "
      + "place on the solid dries: in proportion to how far the gas there is from saturation, "
      + "the driving force, and to a function of how dry the solid is, the drying curve of "
      + "the page on drying curves.  Put together, the engine has one differential equation "
      + "for the solid's moisture along the fraction of the contact area, because the gas "
      + "humidity follows from the water balance (ConvectiveDryer.H:51).  In co-current flow "
      + "the gas humidity starts at the fed value and rises along the solid, and in "
      + "counter-current flow it starts, at the solid inlet, at the value of the exhaust "
      + "and falls to the fed value at the solid outlet (ConvectiveDryer.H:55).  So the gas "
      + "grows more humid, and has less room left to take up water, along a co-current dryer, "
      + "and grows drier, and has more room, toward the dry end of a counter-current one, "
      + "where the solid is driest and its equilibrium moisture lowest.  Counter-current flow does not know the exhaust, so the engine guesses the "
      + "outlet moisture and bisects on it until the gas arriving at the far end is the gas "
      + "fed (ConvectiveDryer.cpp:561); co-current flow starts from known inlets.  In "
      + "cross-flow the rate of every element depends on the solid's moisture alone, because "
      + "its gas is fresh (ConvectiveDryer.H:85), and the engine takes the gas through the "
      + "element as plug flow, which gives the log-mean form (ConvectiveDryer.H:86; "
      + "ConvectiveDryer.cpp:463).  The Theory Guide, section on continuous convective "
      + "dryers, carries these equations with their book equation numbers "
      + "(Mujumdar 2006, Eq. 3.12 to 3.15, p. 57; Eq. 3.66 to 3.78, pp. 65 and 66).",
    formula: String.raw`\begin{aligned}
S\,\frac{\mathrm{d}X}{\mathrm{d}\xi} &= -R\,A, \qquad R = k_Y\,(Y^{*}-Y)\,f(\Phi), \qquad \Phi = \frac{X-X_\mathrm{eq}}{X_c-X_\mathrm{eq}} \\
Y &= Y_\mathrm{in} + \frac{S\,(X_\mathrm{in}-X)}{G} \quad \text{(co-current)}, \qquad
Y = Y_\mathrm{ex} - \frac{S\,(X_\mathrm{in}-X)}{G} \quad \text{(counter-current)} \\
\dot W &= G\,(Y^{*}-Y_\mathrm{in})\left(1 - e^{-k_Y A f/G}\right) \quad \text{(cross-flow, log-mean)}
\end{aligned}`,
    where: [
      { sym: "S", means: "The flow of dry solid through the dryer, counted without its moisture.",
        unit: "kg/s" },
      { sym: "G", means: "The flow of dry gas, counted without its water vapour.", unit: "kg/s" },
      { sym: "X", means: "The solid's moisture on a dry basis at the place considered.",
        unit: "kg/kg" },
      { sym: "X_\\mathrm{in}", means: "The moisture of the solid as it enters.", unit: "kg/kg" },
      { sym: "\\xi", means: "The fraction of the gas-solid contact area the solid has passed: "
        + "0 at the solid inlet, 1 at the solid outlet." },
      { sym: "A", means: "The whole gas-solid contact area of the dryer.", unit: "m2" },
      { sym: "R", means: "The drying flux: water leaving the solid per unit contact area.",
        unit: "kg/(m2 s)" },
      { sym: "k_Y", means: "The gas-film mass-transfer coefficient: flux per unit of humidity "
        + "difference.", unit: "kg/(m2 s)" },
      { sym: "Y", means: "The humidity of the gas at the place considered, kg of water per kg "
        + "of dry gas.", unit: "kg/kg" },
      { sym: "Y^{*}", means: "The saturation humidity at the solid's surface, which sits at the "
        + "wet-bulb temperature of the local gas: the most the gas could carry there.",
        unit: "kg/kg" },
      { sym: "Y_\\mathrm{in}", means: "The humidity of the gas as it is fed.", unit: "kg/kg" },
      { sym: "Y_\\mathrm{ex}", means: "The humidity of the exhaust gas, the end the counter-current "
        + "march is started from by guessing and corrected until the fed gas is met.",
        unit: "kg/kg" },
      { sym: "f", means: "The drying-curve function: the share of the constant rate the solid "
        + "still dries at, a number from 0 to 1." },
      { sym: "\\Phi", means: "How far the solid is above its equilibrium moisture, scaled so that "
        + "it is 1 at the critical moisture and 0 at equilibrium." },
      { sym: "X_\\mathrm{eq}", means: "The moisture the solid would hold in equilibrium with the "
        + "local gas: the floor below which that gas cannot dry it.", unit: "kg/kg" },
      { sym: "X_c", means: "The critical moisture, where the surface stops being wet.",
        unit: "kg/kg" },
      { sym: "\\dot W", means: "The water one cross-flow element removes from the solid, "
        + "which the same element's gas takes up.", unit: "kg/s" },
    ],
    note: "The solid is held at the local wet-bulb temperature in all three, and its warm-up "
      + "toward the gas temperature in the falling-rate period is not modelled (the unit "
      + "announces it); so the engine's solid leaves at nearly the same temperature in all "
      + "three, and the heat-sensitivity argument of step 12 is carried by the gas "
      + "temperature along the dryer, not by the solid's.",
  },
  {
    n: 11,
    title: "The same dryer, run three ways, by the engine",
    body: "Below, the page runs three of the engine's own tutorial cases in the browser: "
      + "the same sugar, the same hot air, the same 300 m2 of contact area, the same drying "
      + "curve, and only the direction changes.  The figure plots, along the fraction of the "
      + "contact area the solid has passed, the solid's moisture, the humidity of the gas "
      + "and its temperature, read from the engine's profile of each unit, and the table "
      + "gives the outlet of each, read from the same run.  None of it is typed.  Read it "
      + "against step 9: co-current ends where the used-up gas meets the driest solid, so it "
      + "stops highest; counter-current meets the driest solid with the freshest gas and "
      + "ends lowest; cross-flow lies between.  The order of counter-current below "
      + "co-current is the book's; where cross-flow falls is what the cross-flow equations "
      + "give for these conditions, not a statement of the books.  The gas curves are not "
      + "one stream running down the length in cross-flow: there each point is the gas that "
      + "left the element at that position.  The data are hypothetical teaching values, not "
      + "a measured dryer.",
    note: "A figure that is blank means the in-browser engine could not run the case (the "
      + "WASM bundle is older than the cross-flow option); it is never replaced by numbers "
      + "typed into the page.",
  },
  {
    n: 12,
    title: "When each is used, and why",
    body: "The choice is made by the product more than by the outlet moisture of step 11.  "
      + "For a heat-sensitive product the books favour co-current flow: the gas cools as it "
      + "dries the wet solid, the final solids temperature is far below the inlet gas "
      + "temperature, and Perry calls co-current dryers very suitable for heat-sensitive "
      + "materials (p. 12-36), while van 't Land notes that parallel flow exposes the feed "
      + "to the highest temperature and that too rapid an evaporation may harden the case "
      + "(p. 42).  For the lowest final moisture, in a solid that stands heat, the books "
      + "favour counter-current flow, which Perry says gives a low final moisture by "
      + "minimising the local equilibrium moisture and which he calls obviously unsuitable "
      + "for thermally sensitive solids (p. 12-36); van 't Land says the same of it (p. 42).  "
      + "For a bed of particles that the gas can cross, as on a through-circulation belt or "
      + "in a plug-flow fluid bed, the arrangement is cross-flow: van 't Land lists fluid-bed "
      + "and band dryers as cross-flow (p. 42) and Mujumdar develops the plug-flow fluid bed "
      + "as its one-dimensional case (section 3.6.2.3.1, p. 65).  The two trades are the "
      + "same trade seen from two ends: the arrangement that dries furthest meets the "
      + "driest solid with the hottest gas.",
    note: "van 't Land also says the mode of flow does not strongly influence operational "
      + "efficiency, since the bulk of the drying takes place at the adiabatic saturation "
      + "temperature (p. 42); the choice is about the product and the final moisture, not "
      + "the energy bill.",
  },
];

export const DRYER_SELECTION_LIMITS: readonly LessonLimit[] = [
  {
    id: "seven",
    title: "Nine types, not all dryers",
    body: "The page does not cover paddle and other continuous agitated contact dryers, plate "
      + "and turbo-tray dryers, steam dryers, infrared or microwave dryers, or the dryers of "
      + "sheets and webs.  A rule whose answer is one of those names it as 'outside the nine' "
      + "and says where the book describes it.  The two types added last, the flash and the "
      + "agitated vacuum dryer, are picks only where a book's rule names them: the flash dryer "
      + "when you say a test shows the drying over in about 10 s, or for a paste mixed back "
      + "with dry product; the agitated vacuum dryer for a batch of liquid or paste, or of a "
      + "granular solid at 30 degC or a fine, flammable one.",
  },
  {
    id: "rules",
    title: "The rules are the books' rules, in the page's order",
    body: "The tree asks feed form, heat sensitivity, scale and mode in the order the request "
      + "named; the content of every rule is a book's, at a page, but the books order their "
      + "own questions differently, and an engineer who starts from the product's moisture "
      + "or its value will meet other branches.  The two product temperatures (30 and 75 "
      + "degC) are van 't Land's; the throughput bands are Perry's.  A narrow band is a "
      + "convention, not a wall.",
  },
  {
    id: "table",
    title: "The comparison table is approximate",
    body: "Mujumdar's Table 1.4 is excerpted from Toei's compilation of operating industrial dryers "
      + "(Mujumdar's reference 24) and says its figures are approximate and 'based on "
      + "current practice'; better results can often be "
      + "obtained.  The evaporation capacities are per cubic metre of shell or chamber for "
      + "some types and per square metre of surface for others, as the book prints them, and "
      + "cannot be compared across a row.  A cell the three books do not give is blank and "
      + "marked 'not cited': the batch tray dryer's energy, the freeze dryer's energy and "
      + "the evaporation capacity of the fluidised-bed dryer (Towler's Table 10.7 prints a "
      + "dash for it).  The tray's and the belt's capacity come from Towler's Table 10.7, per "
      + "square metre of heat-transfer area and per cubic metre of dryer volume respectively, "
      + "and are not comparable with each other or with Mujumdar's.",
  },
  {
    id: "transcribed",
    title: "The habitual tables are transcriptions",
    body: "Every cell of the tables of step 6 was read from the page and is pinned by the "
      + "test, but a transcription is not a proof that the book is right: Mujumdar's Table "
      + "1.5 gives ha in kcal/(h degC m3) for a very rough sizing and warns that the volume "
      + "includes the voids and that the drop in air temperature must be assumed first; "
      + "Towler's Table 10.7 was adapted by him from an older selection guide and its "
      + "qualitative columns (high, medium, limited) have no definition in the book.  "
      + "The page draws no conclusion from them.",
  },
  {
    id: "engine-limits",
    title: "The engine's models are not the equipment",
    body: "The four cases that open are the engine's models of a spray dryer, a convective "
      + "dryer, a solid dryer and a tray, each with the limits its page states; none models a "
      + "rotary shell, a fluidised bed's hydrodynamics or a belt, and there is no drum or "
      + "freeze dryer.  The page reads no number from them, except from the three "
      + "convective-dryer cases of step 11 (co-current, counter-current, cross-flow), whose "
      + "profiles and outlets it draws from the engine's run; those carry hypothetical "
      + "teaching values for the rate coefficient, the critical moisture and the curve, "
      + "not a measured dryer.",
  },
  {
    id: "tests",
    title: "No tree replaces a drying test",
    body: "Mujumdar and Perry both say that a dryer should be chosen after tests with the "
      + "real feed and, in some types, at full scale.  This page narrows the field before "
      + "the tests; it does not stand in for them.",
  },
];

export const DRYER_SELECTION_QUIZ: readonly QuizQuestion[] = [
  {
    id: "feed-form", steps: [2],
    q: "A free-flowing granular crystal of about 2 mm is wet from a centrifuge.  By the "
      + "feed-form tables, which of these can take it?",
    options: [
      "A spray dryer",
      "A drum dryer",
      "A rotary or a fluidised-bed dryer",
      "None of the nine",
    ],
    correct: 2,
    feedback: "Mujumdar's Table 1.1 ticks the rotary and the fluidised-bed dryers for cakes, "
      + "powders and granules, and the spray and drum dryers only for liquids; Perry's Table "
      + "12-11 says a spray dryer is not applicable to a solid unless it is made pumpable.",
  },
  {
    id: "which-end", steps: [9],
    q: "In a counter-current dryer, which solid meets the freshest, hottest gas?",
    options: [
      "The wettest solid, at the feed end",
      "The driest solid, at the product end",
      "The solid in the middle of the dryer",
      "None in particular: the gas has the same state all along",
    ],
    correct: 1,
    feedback: "The gas enters where the solid leaves, so the driest solid meets the freshest "
      + "gas, where the equilibrium moisture is lowest; that is why the run of step 11 ends "
      + "driest, and why Perry calls the arrangement unsuitable for thermally sensitive "
      + "solids (p. 12-36).",
  },
  {
    id: "scale-mode", steps: [4],
    q: "A plant makes 20 kg/h of a solid in several grades.  Which does Perry's rule of "
      + "thumb point to?",
    options: [
      "A continuous dryer, because continuous is always cheaper",
      "A batch dryer: batch is almost invariably used below about 50 kg/h",
      "Either, because the range is 50 kg/h to 1 t/h",
      "A spray dryer, which scales down well",
    ],
    correct: 1,
    feedback: "Perry puts batch dryers below about 50 kg/h and continuous dryers generally "
      + "above 1 t/h; several grades needing strict batch identity is one of the three "
      + "situations in which a batch tray dryer is economical (p.12-36 and 12-38).",
  },
  {
    id: "energy", steps: [5],
    q: "Mujumdar's table gives a spray dryer 4,500 to 11,500 kJ per kg of water, and "
      + "evaporating water takes 2257 kJ/kg.  What does the low end of the range say?",
    options: [
      "About half of the energy ends in the vapour as latent heat",
      "The dryer is 4,500 % efficient",
      "The dryer uses 4,500 kg of gas per kg of water",
      "The product must be 4,500 s in the chamber",
    ],
    correct: 0,
    feedback: "2257 divided by 4500 is about 0.5; at 11,500 it is about 0.2.  The rest of the "
      + "energy warms the gas, the solid and the surroundings, and leaves in the exhaust "
      + "(step 5).",
  },
  {
    id: "very-sensitive", steps: [3, 4],
    q: "A valuable product must not exceed 25 degC and is made at 20 kg/h.  Which type do the "
      + "books point to?",
    options: [
      "A rotary dryer, run counter-current",
      "A spray dryer with very hot gas",
      "A belt dryer in air at 80 degC",
      "A freeze or vacuum dryer, batchwise",
    ],
    correct: 3,
    feedback: "At 30 degC or less van 't Land's batch tree goes to vacuum drying, Perry names "
      + "vacuum and freeze dryers as particularly suitable for heat-sensitive materials and "
      + "freeze drying as the choice for high-value products, and the scale is a batch's.  "
      + "The price is stated too: freeze drying costs two to three times spray drying.",
  },
  {
    id: "sublimation", steps: [3],
    q: "Mujumdar's Chapter 1 says the heat for sublimation is severalfold lower than for "
      + "evaporation.  What do his Chapter 11 and Perry's worked example say?",
    options: [
      "Sublimating ice takes about 2840 kJ/kg, more than the 2257 kJ/kg of evaporating water "
        + "at 100 degC",
      "Sublimating ice takes about 450 kJ/kg, five times less than evaporation",
      "The two heats are the same, to the digit",
      "The heat of sublimation is not given by either book",
    ],
    correct: 0,
    feedback: "Chapter 11 (p.259) gives 2840 kJ per kg of ice and Perry's Example 12-19 gives "
      + "2257 kJ per kg of water at 100 degC, so the sentence of Chapter 1 (p.22) is wrong by "
      + "its own book; freeze drying is dear because of the vacuum, the cold condenser and the "
      + "10 to 20 h cycle, not because of the heat (step 3).",
  },
  {
    id: "pick-arrangement", steps: [11, 12],
    q: "A heat-sensitive product must be dried continuously in hot air.  Which arrangement do "
      + "the books favour, and what does the run on this page show it costs?",
    options: [
      "Counter-current, because it dries furthest; the cost is a bigger dryer",
      "Co-current, because the gas is cool where the dry solid leaves; the cost is the "
        + "highest final moisture of the three",
      "Cross-flow, because it has no cost: it dries as far as counter-current",
      "Any: the arrangement does not change the gas the solid meets",
    ],
    correct: 1,
    feedback: "Perry (p. 12-36) calls co-current dryers very suitable for heat-sensitive "
      + "materials because the gas cools along the dryer; the engine's runs of step 11 show the "
      + "price, the highest outlet moisture of the three on the same area.  Counter-current "
      + "dries furthest and is the one Perry calls unsuitable for thermally sensitive solids.",
  },
];
