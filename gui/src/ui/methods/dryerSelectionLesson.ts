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
  of Industrial Drying, 3rd ed. (2006), Chapter 1; Perry's Chemical
  Engineers' Handbook, 9th ed. (2019), Section 12; and van 't Land, Drying
  in the Process Industry (2012), the page numbers being the printed ones.
  Prose that cites a page of the engine is avoided on purpose: the page
  names the tutorial cases and no engine source line, so there is no citation
  to drift.
\*---------------------------------------------------------------------------*/

import type { QuizQuestion } from "./lessonQuiz.js";
import type { LessonLimit, LessonStep } from "./lessonStep.js";

export type { LessonStep };

export const DRYER_SELECTION_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Seven types do most of the drying, and they differ in how heat reaches the product",
    body: "Hundreds of dryers are sold, but a handful of types account for most of what a "
      + "chemical or food plant meets: the spray dryer, the direct-heat rotary dryer, the "
      + "fluidised-bed dryer, the tray dryer, the belt (band) dryer, the drum dryer and the "
      + "freeze dryer.  Mujumdar sorts dryers by three things: how heat is supplied "
      + "(convection, conduction or radiation), the temperature and pressure of operation, and "
      + "how the material is handled inside (Mujumdar 2006, section 1.5, p.21).  In a convective "
      + "(direct) dryer hot gas touches the product and carries the vapour away: spray, rotary, "
      + "fluidised bed and belt.  In a conduction (indirect) dryer a heated wall touches it: the "
      + "drum, and the heated-shelf tray; the thermal efficiency of conduction dryers tends to be "
      + "higher because the hot gas of a convective dryer carries away a large enthalpy "
      + "(Mujumdar p.22).  The freeze dryer is a special case: the water leaves as ice sublimes "
      + "under vacuum, below the triple point (Mujumdar p.22).  The page draws each type as a "
      + "schematic made for it, with one colour code: wet feed in blue, hot gas in red, dry "
      + "product in amber, vapour in grey.",
    note: "The drawings carry no dimension: they show where the feed enters, where the gas "
      + "flows and where the product leaves, which is what a selection rule turns on.",
  },
  {
    n: 2,
    title: "The form of the feed is asked first",
    body: "A dryer must be able to take the feed as it arrives.  Mujumdar's Table 1.1 (p.21) "
      + "ticks, for each dryer, the feed forms it handles: the spray dryer and the drum dryer "
      + "take liquids (solution, slurry, paste) and nothing else; the belt dryer takes "
      + "granules, pellets, fragile crystals, fibres and formed solids; the rotary and the "
      + "fluidised-bed dryers take cakes, powders, granules and pellets, and the fluidised bed "
      + "also solutions and slurries in the table; the tray dryer takes almost every solid "
      + "form.  Perry's Table 12-11 (p.12-33 and 12-34) is more careful: it attaches the "
      + "conditions.  A spray dryer takes a paste only if it can be pumped to the atomiser; a "
      + "drum dryer takes a paste only if it can be made to flow; a tray takes a paste only "
      + "if it can be pre-formed; a fluidised bed takes a liquid only as a granulator with an "
      + "inert bed or with dry solid mixed back.  For liquid feeds the choice is normally "
      + "limited to a spray dryer, a drum dryer or an agitated batch vacuum dryer "
      + "(Mujumdar p.24).  A sheet or a web (paper, film, fabric) is none of the seven: it is "
      + "dried on cylinders or by impinging gas (Perry p.12-34; Mujumdar Table 1.3, p.23).",
    note: "A tick in Table 1.1 means the type is used for that form, not that it is the "
      + "best; Perry's conditions are where the real decisions are.",
  },
  {
    n: 3,
    title: "Heat sensitivity: how long, how hot, and in which direction",
    body: "A product is hurt by temperature and by time, and the types differ greatly in both.  "
      + "Mujumdar's Table 1.2 (p.21) gives the typical residence time: 10 to 30 s in a spray "
      + "dryer and in a drum dryer, 10 to 60 min in a fluidised bed, a rotary dryer and a belt "
      + "dryer, 1 to 6 h in a batch tray dryer; van 't Land gives 10 to 20 h for a 1 cm layer of "
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
      + "vacuum drying (Figure 3.1, p.23); at 75 degC or more his continuous tree opens the "
      + "spray-dryer branch (Figure 3.2, p.25).",
    note: "Freeze drying costs two to three times what spray drying does, for coffee, and "
      + "keeps the flavour better (Mujumdar p.22): the price of protecting a sensitive product "
      + "is stated by the same book that recommends it.",
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
      + "among the seven, the spray, rotary, belt and drum dryers are continuous, the tray "
      + "dryer is batch, the freeze dryer is batch for pharmaceuticals, and the fluidised-bed "
      + "dryer comes in both.",
  },
  {
    n: 5,
    title: "What the energy column costs",
    body: "Mujumdar's Table 1.4 (p.26) lists, for the dryers it prices, a typical energy "
      + "consumption in kJ per kg of water evaporated: 3,200 to 6,500 for a drum dryer, "
      + "4,000 to 6,000 for a fluidised bed and for a belt dryer, 4,600 to 9,200 for a rotary "
      + "dryer and 4,500 to 11,500 for a spray dryer; the figures are approximate and are "
      + "current practice, not the limit of the art.  The book gives none for a batch tray "
      + "dryer or a freeze dryer, and the page leaves them blank.  Evaporating a kilogram of "
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
    title: "Which of these the engine models",
    body: "Choupo models some of this equipment, and each model has a tutorial case that the "
      + "page opens in a new tab.  The spray dryer is the engine's sprayDryer unit, and its "
      + "case dries a sugar solution.  The fluidised-bed type is nearest to the engine's "
      + "solidDryer, a powder dried toward the moisture set by the hot air and its sorption "
      + "isotherm; it has no fluidisation or bed height.  The continuous convective dryers "
      + "(co-current or counter-current over a contact area, as in a rotary dryer) are "
      + "nearest to the convectiveDryer unit, which has no shell, flights or belt.  The "
      + "batch tray dryer is the engine's batchDryer, one tray of wet sucrose in declared "
      + "air.  The drum dryer, the belt dryer's geometry and the freeze dryer have no model, "
      + "and the page does not pretend otherwise: those rows have no case.",
  },
  {
    n: 7,
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
      + "and Mujumdar's Table 1.1 admit it.  A disagreement is not a reason to average the "
      + "books, it is the thing to test.",
  },
];

export const DRYER_SELECTION_LIMITS: readonly LessonLimit[] = [
  {
    id: "seven",
    title: "Seven types, not all dryers",
    body: "The page does not cover flash and pneumatic dryers, paddle and other agitated contact "
      + "dryers, plate and turbo-tray dryers, steam dryers, infrared or microwave dryers, "
      + "or the dryers of sheets and webs.  A rule whose answer is one of those names it as "
      + "'outside the seven' and says where the book describes it.",
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
      + "the evaporation capacity of the fluidised-bed, belt and tray dryers.",
  },
  {
    id: "engine-limits",
    title: "The engine's models are not the equipment",
    body: "The four cases that open are the engine's models of a spray dryer, a convective "
      + "dryer, a solid dryer and a tray, each with the limits its page states; none models a "
      + "rotary shell, a fluidised bed's hydrodynamics or a belt, and there is no drum or "
      + "freeze dryer.  The page reads no number from them.",
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
      "None of the seven",
    ],
    correct: 2,
    feedback: "Mujumdar's Table 1.1 ticks the rotary and the fluidised-bed dryers for cakes, "
      + "powders and granules, and the spray and drum dryers only for liquids; Perry's Table "
      + "12-11 says a spray dryer is not applicable to a solid unless it is made pumpable.",
  },
  {
    id: "cocurrent", steps: [3],
    q: "Why do the books favour a co-current dryer for a heat-sensitive solid?",
    options: [
      "The gas cools as it dries the wet solid, so the solid leaves far below the inlet gas "
        + "temperature",
      "Co-current dryers use less gas than counter-current ones",
      "The residence time is always shorter",
      "Counter-current dryers cannot reach a low final moisture",
    ],
    correct: 0,
    feedback: "In co-current flow the hottest gas meets the wettest solid, which sits at the "
      + "wet-bulb temperature while it is wet; counter-current flow meets the driest solid with "
      + "the hottest gas (Perry p.12-36).  Counter-current does give the lower final moisture, "
      + "which is the other side of the same trade.",
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
    id: "disagree", steps: [7],
    q: "Perry's table marks the batch tray dryer 'not applicable' to a free-flowing powder; "
      + "van 't Land's tree and Mujumdar's table admit it.  What does the page advise?",
    options: [
      "Follow the newest book",
      "Average the two answers",
      "Test it with the real feed, because the disagreement is the thing to find out",
      "Reject the tray dryer for every powder",
    ],
    correct: 2,
    feedback: "Perry's procedure ends in drying tests on the dryers that remain, and Mujumdar "
      + "says to test the real feed; a disagreement between books is a question for the "
      + "laboratory, not a vote (step 7).",
  },
];
