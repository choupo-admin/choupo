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
  The lesson of "Why did it not dry?" (C508, page A of the dryer redesign):
  three cards, "ten percent of what?", "why did it not dry?" and "the humid
  day".  The words are this project's own; the numbers on the page are engine
  runs (WhyDidItNotDryTool), not numbers in this file -- prose here quotes
  none beyond a round figure.

  EVERY CLAIM WAS CHECKED against the unit sources before it was written:
    * SolidDryer and EvaporativeDryer carry no kinetics: no residence time, no
      rate, a balance plus (for the solid dryer) the sorption isotherm.  The
      page says so on the card, and the absence is a probed claim in
      check_lesson_absence_claims.
    * the gas cannot leave a solid dryer colder than its wet bulb: the unit
      solves its outlet temperature between that floor and the inlet air
      (src/unitOperations/heatTransfer/SolidDryer.cpp:268).
    * the spray dryer is the only unit of the page with a clock: its
      residence time is a RESULT of the chamber geometry and the particle's
      fall speed.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const WHY_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Ten percent of what?",
    body: "\"The product is at ten percent moisture\" means two different "
      + "things, and a plant says the first by habit.  On the wet basis the "
      + "ten percent is water as a share of the whole wet product; on the dry "
      + "basis, which the calculations of this chapter use, it is water per "
      + "kilogram of bone-dry solid (the solid with no water in it).  Ten percent wet is about 0.11 on the dry "
      + "basis.  The two scales agree near zero and part company quickly: a "
      + "feed at half its mass water is X = 1 on the dry basis, and going "
      + "from 50 to 10 percent wet removes almost nine tenths of the water, "
      + "while going from 10 to 5 percent wet, a drop that sounds five times "
      + "smaller, removes about half of what is left.  The conversion is "
      + "algebra on the two definitions, not a model, and both numbers "
      + "belong in every statement of a specification.",
    formula: String.raw`w = \frac{X}{1+X} \qquad X = \frac{w}{1-w}`,
    where: [
      { sym: "w", means: "The moisture on the wet basis: kilograms of water "
        + "per kilogram of wet product.  It runs from 0 to 1.",
        unit: "kg water / kg wet solid" },
      { sym: "X", means: "The moisture on the dry basis: kilograms of water "
        + "per kilogram of bone-dry solid.  It can exceed 1.",
        unit: "kg water / kg dry solid" },
    ],
    note: "The dry basis is the one that subtracts: the dry solid does not "
      + "change while it dries, so the water to remove is the dry mass times "
      + "the drop in X.  Every dryer on this page reports its X and, beside "
      + "it, the wet-basis percentage, so the page can show both of the "
      + "case's own numbers rather than typed ones.",
  },
  {
    n: 2,
    title: "The air must carry the water, and pay for it",
    body: "A convective dryer moves water from the solid into a stream of "
      + "hot gas, and three things can stop it.  The first is room: the gas "
      + "can carry only so much, and the most it holds at its outlet "
      + "temperature is the saturation humidity of that temperature.  The "
      + "ratio of the water vapour pressure in the gas to the vapour pressure "
      + "of water at the same temperature is its water activity, a_w, which "
      + "is 1 for saturated gas.  The second is heat: evaporating water takes "
      + "its latent heat from the gas and cools it, and a gas that meets a "
      + "wet surface settles at the wet-bulb temperature, the temperature a "
      + "wet surface takes in that gas (the Chart chapter of this family, "
      + "the psychrometric chart, shows it), and evaporation cannot cool it "
      + "below that.  The third is the solid's own floor: its sorption "
      + "isotherm, the moisture the solid holds in balance with air of a "
      + "given water activity, gives X_eq, the driest it can get in that "
      + "air.  So the water that can leave is the smallest of three amounts: "
      + "what the solid holds above X_eq, what the exhaust can carry, and "
      + "what the gas can pay for in heat.  "
      + "Are room and heat really two limits?  In an adiabatic dryer all the "
      + "heat comes from the gas itself, and a gas that gives up heat only "
      + "to evaporate water moves along its adiabatic-saturation line, "
      + "which for air and water is, to a good approximation, the line of "
      + "its wet bulb: it reaches the wet bulb just as it reaches saturation, "
      + "so for pure evaporation the two bounds are one.  They part because "
      + "the gas must also warm the solid and the water still in it from the "
      + "feed temperature (and, in a real dryer, cover the wall loss): that "
      + "heat evaporates nothing, so the gas can arrive at its wet bulb "
      + "before it is saturated.  The page's chip calls both cases "
      + "air-limited, the dryer starved of gas, and tells them apart: "
      + "exhaust saturated means the gas ran out of room; gas at its wet "
      + "bulb with the exhaust unsaturated means it ran out of heat.  The "
      + "remedy is more gas, whose heat and whose room both grow with its "
      + "flow, or hotter gas for the heat case.  More time, in a unit without "
      + "a clock, changes nothing, and neither does more gas once the "
      + "product is on its isotherm.",
    formula: String.raw`m_s\,(X_\mathrm{in} - X_\mathrm{out}) = G\,(Y_\mathrm{out} - Y_\mathrm{in}) \qquad Y_\mathrm{out} \le Y_\mathrm{sat}(T_\mathrm{out}) \qquad T_\mathrm{out} \ge T_\mathrm{wb}`,
    where: [
      { sym: "m_s", means: "The flow of bone-dry solid through the dryer.  "
        + "It is the same at the inlet and the outlet.", unit: "kg/s" },
      { sym: "X_\\mathrm{in}", means: "The moisture of the wet feed on the dry basis.",
        unit: "kg/kg dry solid" },
      { sym: "X_\\mathrm{out}", means: "The moisture of the product on the dry basis.",
        unit: "kg/kg dry solid" },
      { sym: "G", means: "The flow of dry gas through the dryer.",
        unit: "kg/s" },
      { sym: "Y_\\mathrm{in}", means: "The humidity of the gas entering: kilograms of "
        + "water per kilogram of dry gas.", unit: "kg/kg dry gas" },
      { sym: "Y_\\mathrm{out}", means: "The humidity of the exhaust, in the same "
        + "units.", unit: "kg/kg dry gas" },
      { sym: "Y_\\mathrm{sat}", means: "The humidity the gas would have if it were "
        + "saturated with water vapour at the temperature in brackets.",
        unit: "kg/kg dry gas" },
      { sym: "T_\\mathrm{out}", means: "The temperature of the exhaust.", unit: "K" },
      { sym: "T_\\mathrm{wb}", means: "The wet-bulb temperature of the inlet gas: "
        + "where a wet surface in that gas settles; it is the floor of the "
        + "exhaust temperature.", unit: "K" },
    ],
    note: "The page reads which of these bound from the engine's own numbers: "
      + "the exhaust's water activity, and how far the outlet sits above the "
      + "wet bulb.  The balance on the left is the engine's first law "
      + "restated; the page solves nothing.  Mind the units: the air knob "
      + "of the card below is in kmol/h of humid air, and the balance is "
      + "written for kilograms of dry gas per second.",
  },
  {
    n: 3,
    title: "The clock: a droplet has only so long",
    body: "A solid dryer and an evaporative dryer in this engine are a "
      + "balance with no time in it; a spray dryer is different.  A droplet "
      + "enters at the top of the chamber and falls at a speed the engine "
      + "computes from its size, so the time it spends in the dryer is "
      + "set by the height of the chamber and that speed, and the time it "
      + "needs is set by its size and the heat transfer around it.  When the "
      + "second is longer than the first, the powder leaves wetter than its "
      + "isotherm would allow while the exhaust still has room: the dryer "
      + "ran out of time, not of air.  The two are told apart by the same "
      + "numbers as before: the exhaust is not full, the outlet is well above "
      + "the wet bulb, and the product is above its floor.  The remedy is a "
      + "taller chamber or a finer spray, not more air.",
    formula: String.raw`t_\mathrm{res} = \frac{H}{v_p} \qquad X_\mathrm{final} \ge X_\mathrm{eq}(a_w)`,
    where: [
      { sym: "t_\\mathrm{res}", means: "The residence time of a particle in the "
        + "chamber, a result of the chamber's geometry and of the particle's "
        + "fall speed.", unit: "s" },
      { sym: "H", means: "The height of the drying chamber, a hardware "
        + "dimension.", unit: "m" },
      { sym: "v_p", means: "The speed at which a particle falls through the "
        + "chamber, which the engine computes from the gas speed and the "
        + "particle's terminal speed.", unit: "m/s" },
      { sym: "X_\\mathrm{final}", means: "The moisture of the powder leaving, on "
        + "the dry basis.", unit: "kg/kg dry solid" },
      { sym: "X_\\mathrm{eq}", means: "The moisture the solid would reach in "
        + "contact with the exhaust for ever: the sorption isotherm of the "
        + "solid read at the water activity in brackets.", unit: "kg/kg dry solid" },
      { sym: "a_w", means: "The water activity of the exhaust: its relative "
        + "humidity as a fraction, 1 for saturated gas.", unit: "-" },
    ],
    note: "The solid and evaporative dryers publish no residence time, "
      + "and the page does not invent one: for them the card can say "
      + "air-limited or isotherm-bound and nothing about time.",
  },
  {
    n: 4,
    title: "The humid day: a floor that time cannot pass",
    body: "How dry a solid can get in a given air is set by that air's "
      + "relative humidity, not by how long you wait.  The solid's isotherm "
      + "gives the moisture it holds in equilibrium with air of a given "
      + "water activity, and the water activity of the drying air is the "
      + "partial pressure of its water vapour over the vapour pressure at its "
      + "temperature.  On a humid day the air's partial pressure is higher, "
      + "so the floor is higher: a specification below it cannot be met with "
      + "that air, whatever the batch time.  The tail of a drying curve "
      + "approaches this floor and never crosses it, which is why the last "
      + "percent costs so much time and why a humid day can make it "
      + "unreachable.",
    formula: String.raw`a_w = \frac{p_v}{p^\mathrm{sat}(T)} \qquad p_v = \frac{P\,Y}{Y + \varepsilon}`,
    where: [
      { sym: "p_v", means: "The partial pressure of water vapour in the air.",
        unit: "Pa" },
      { sym: "p^\\mathrm{sat}", means: "The vapour pressure of water at the "
        + "temperature in brackets.", unit: "Pa" },
      { sym: "T", means: "The dry-bulb temperature of the drying air.", unit: "K" },
      { sym: "P", means: "The total pressure of the air.", unit: "Pa" },
      { sym: "Y", means: "The humidity of the air: kilograms of water per "
        + "kilogram of dry gas.", unit: "kg/kg dry gas" },
      { sym: "\\varepsilon", means: "The ratio of the molar mass of water to "
        + "that of the dry carrier gas.", unit: "-" },
    ],
    note: "The engine evaluates this for the tray: it prints the air's water "
      + "activity and the floor, X_eq, that the isotherm gives there.  The "
      + "isotherm of the sample is a declared record, not a prediction, and "
      + "its fit is trusted only inside the window it was fitted over.",
  },
];

export const WHY_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "classification-not-diagnosis",
    title: "A verdict orders numbers; it is not a diagnosis of a plant.",
    body: "The chip is an ordering of the engine's own numbers against "
      + "tolerances printed beside it.  A real dryer can be limited by "
      + "several things at once, and a number just inside a tolerance would "
      + "read differently with the tolerance moved; the page prints the "
      + "numbers so that the reader can judge the margin.",
  },
  {
    id: "heat-and-room-one-line",
    title: "Heat and room are one bound until something else takes heat.",
    body: "For pure evaporation in an adiabatic dryer the gas reaches its "
      + "wet bulb as it reaches saturation (the equality is approximate, "
      + "the psychrometric ratio being near 1 for air and water; Treybal "
      + "1980).  The gas can leave at its wet bulb with room to spare only "
      + "because the engine also charges it for warming the solid and its "
      + "water: the solid dryer solves its outlet temperature between the "
      + "wet-bulb floor and the inlet temperature (SolidDryer.cpp:268).  The "
      + "chip separates the two by reading a_w and T_out - T_wb; it does not "
      + "say how much of the heat went to the solid.",
  },
  {
    id: "no-kinetics-in-two-units",
    title: "Two of the units are without a clock.",
    body: "The solid dryer and the evaporative dryer are a mass and energy "
      + "balance (the first with an isotherm, the second with free water): "
      + "they publish no residence time and no rate, so \"time-limited\" "
      + "cannot appear for them.  Only the spray dryer has a clock, and it "
      + "is a single-size model.",
  },
  {
    id: "evaporative-no-isotherm",
    title: "The crystal is without an isotherm.",
    body: "The evaporative dryer models free surface water, so it lacks an "
      + "equilibrium moisture to reach; its verdict can be air-limited or "
      + "not classified, never isotherm-bound.",
  },
  {
    id: "declared-isotherm",
    title: "The floor is a declared record.",
    body: "X_eq comes from the sorption record the case declares for the "
      + "sample, evaluated at the exhaust's water activity.  It is not "
      + "predicted from the chemistry, and a fit used below the lowest water "
      + "activity it was fitted over is extrapolating.",
  },
  {
    id: "fixed-air",
    title: "The tray's air is a declared constant.",
    body: "In the humid-day card the tray sits in air of fixed temperature "
      + "and humidity that does not humidify as it picks up water; a real "
      + "tray in a real dryer has air that is wetter at its outlet end.",
  },
];

export const WHY_QUIZ: readonly QuizQuestion[] = [
  {
    id: "which-percent", steps: [1],
    q: "A feed is cut from 50 percent to 10 percent moisture on the wet basis. What share of its water has been removed?",
    options: [
      "40 percent of it, the difference of the two numbers",
      "Almost 90 percent of it: on the dry basis X falls from 1 to about 0.11",
      "50 percent of it",
      "It cannot be said without the mass of solid",
    ],
    correct: 1,
    feedback: "The dry solid does not change, so the share removed is the drop "
      + "in X over its starting value: from X = 1 to X = 0.11 that is almost "
      + "nine tenths, and no mass of solid is needed (step 1).",
  },
  {
    id: "starved-dryer", steps: [2],
    q: "A solid dryer leaves its product wet and its exhaust saturated. What helps?",
    options: [
      "A longer residence time",
      "More dry gas through the dryer",
      "A finer product",
      "A hotter product",
    ],
    correct: 1,
    feedback: "A saturated exhaust cannot carry any more water, and a unit "
      + "without a clock offers no time to lengthen.  The water that can leave is "
      + "the gas's capacity, which grows with the gas flow (step 2).",
  },
  {
    id: "wet-bulb-floor", steps: [2],
    q: "The exhaust is not saturated, yet the gas leaves at its wet bulb with water still on the solid. What does that say?",
    options: [
      "The dryer is time-limited",
      "The gas ran out of heat before it ran out of room, because part of its heat went into warming the solid and its water; more or hotter gas helps",
      "The solid is on its isotherm",
      "The wet bulb was measured wrongly",
    ],
    correct: 1,
    feedback: "For pure evaporation the gas reaches its wet bulb exactly "
      + "when it is saturated, so an unsaturated exhaust at the wet bulb "
      + "means heat went elsewhere: warming the solid and its water.  The "
      + "gas has paid all the heat it has while it could still carry more "
      + "water, and the remedy is more or hotter gas (step 2).",
  },
  {
    id: "clock", steps: [3],
    q: "A spray dryer's exhaust is far from saturated and its outlet is well above the wet bulb, yet the powder is above its isotherm moisture. What limits it?",
    options: [
      "The air, as always",
      "The residence time: the droplet needed longer than the chamber gave it",
      "The isotherm",
      "Nothing, the product is dry",
    ],
    correct: 1,
    feedback: "With room in the exhaust and in the heat, what is left is the "
      + "clock: a taller chamber or a finer spray, not more air (step 3).",
  },
  {
    id: "humid-day", steps: [4],
    q: "A tray is run for as long as you like in air that is more humid than yesterday's. What happens to the lowest moisture it can reach?",
    options: [
      "It is unchanged; time reaches any moisture",
      "It rises, because the floor is the isotherm at the air's higher water activity",
      "It falls",
      "It becomes zero",
    ],
    correct: 1,
    feedback: "The floor is the equilibrium moisture at the air's water "
      + "activity, and humid air has a higher one.  Waiting longer only "
      + "approaches the floor (step 4).",
  },
];
