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
  The batch-drying lesson, as DATA -- the kremserLesson / hunterNashLesson
  shape, for the same reason: prose is the part of a tool that rots with
  nothing failing, and an argument held as data can be asserted to still say
  what it claims.

  THE LESSON: drying is not one operation, it is TWO, and they are controlled
  by different things.  While the surface stays wet the solid is barely in the
  problem at all -- the rate is set by the air film and the surface sits at the
  air's WET BULB.  Below the critical moisture the solid takes over, the rate
  falls, and the surface warms.  Students size the first period and pay for the
  second.

  EVERY CLAIM HERE WAS CHECKED AGAINST src/unitOperations/batch/BatchDryer.{H,cpp}
  AND AGAINST THE WITNESS tutorials/batch/drying/dryer01_sucrose_tray BEFORE IT
  WAS WRITTEN, and the ones the model does NOT support are labelled instead of
  dropped.  The two that matter most:

    * X_c is a DECLARED INPUT (`operation.criticalMoisture`), echoed back as a
      KPI.  Nothing here predicts it.
    * the solid's own temperature is NOT integrated.  The warm-up toward the
      dry bulb is real physics and is a named gap in this model, so the page
      says both halves rather than the flattering one.

  There is also no transfer CORRELATION anywhere in this unit: k_Y is declared
  sample/equipment data.  A step that spoke of Nusselt or Sherwood numbers
  would be describing a model this engine does not run.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const DRYING_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One curve, two completely different operations",
    body: "Plot the moisture of a wet solid against time and you get a "
      + "straight stretch that bends into a long tail.  That bend is not a "
      + "numerical artefact and it is not a smooth transition of one "
      + "mechanism: it is the point where the operation changes hands.  "
      + "Before it, the rate is set by the AIR.  After it, the rate is set by "
      + "the SOLID.  Everything else on this page follows from that, "
      + "including the two ways a dryer gets sized wrong.  Moisture is "
      + "counted on the DRY basis — kg of water per kg of bone-dry solid — "
      + "because the dry solid is the one quantity in the tray that does not "
      + "change while it dries.",
    formula: "X = m_moisture / m_drySolid        [kg/kg dry solid]",
    where: [
      { sym: "X", means: "The moisture content on the DRY BASIS: kg of "
        + "moisture per kg of BONE-DRY solid.  The dry solid is the one thing "
        + "drying does not change, which is what turns a moisture balance "
        + "into a subtraction — and it is also why X has no ceiling and can "
        + "happily exceed 1.  In this corpus X is ALSO conversion on the "
        + "reactor-sizing page, a liquid solute mole ratio in Kremser, and "
        + "Gilliland's reduced reflux coordinate on the shortcut-column "
        + "page: four unrelated quantities, one letter.",
        unit: "kg moisture / kg dry solid" },
      { sym: "m_moisture", means: "The mass of moisture in the charge — the "
        + "only part of the state that moves.", unit: "kg" },
      { sym: "m_drySolid", means: "The bone-dry solid mass, fixed once at the "
        + "start and constant thereafter.  Written m_s below.", unit: "kg" },
    ],
    note: "The dry basis is why X can exceed 1 and why the axis has no "
      + "ceiling: a solid holding twice its own dry weight in water sits at "
      + "X = 2.  A wet-basis fraction would compress the whole interesting "
      + "part of the curve against its own upper bound.",
  },
  {
    n: 2,
    title: "Constant rate: the surface is free liquid, and it stays COOL",
    body: "While the surface is kept wet, the solid is barely in the problem. "
      + " The water evaporating there behaves like a free liquid pool: the "
      + "rate is set by transfer through the air film, and the solid supplies "
      + "moisture as fast as the air can take it away.  The consequence "
      + "students under-use is thermal.  Evaporation cools the surface until "
      + "the heat arriving from the air exactly matches the latent heat "
      + "leaving with the vapour, and that balance point is the air's WET-BULB "
      + "temperature — well below its dry bulb.  So the material sits cool "
      + "while it dries, which is why the constant-rate period is the safe one "
      + "for a heat-sensitive product, and why hot air is not automatically a "
      + "danger to it.",
    formula: "Y_sat(T_wb) − Y = (cp_c + Y·cp_v)(T_air − T_wb) / λ(T_wb)\n"
      + "R_c = k_Y · ( Y_sat(T_wb) − Y )                 [kg/(m² s)]",
    where: [
      { sym: "Y", means: "The HUMIDITY RATIO of the drying air: kg of "
        + "moisture carried per kg of DRY gas.  Here it is a declared "
        + "constant of the run — this model's air does not humidify as it "
        + "picks moisture up.  (Kremser's Y is a gas-phase solute mole ratio "
        + "and the shortcut column's is a reduced stage count; neither is "
        + "this.)", unit: "kg moisture / kg dry gas" },
      { sym: "Y_sat", means: "The SATURATION humidity ratio at a given "
        + "temperature — what that gas would carry if it were saturated, "
        + "built from the moisture's own vapour pressure at the declared "
        + "pressure.  Evaluated at T_wb it is one half of the driving force.",
        unit: "kg moisture / kg dry gas" },
      { sym: "T_wb", means: "The WET-BULB temperature: where the heat "
        + "arriving from the air exactly matches the latent heat leaving with "
        + "the vapour, so an evaporating free surface parks there.  The "
        + "engine finds it by bisection and holds the surface at it by "
        + "HYPOTHESIS for as long as the surface stays wet.", unit: "K" },
      { sym: "T_air", means: "The DRY-BULB temperature of the air — constant "
        + "for the whole run.  The solid is never integrated toward it, and "
        + "note what that means precisely: the SURFACE is held at T_wb by "
        + "hypothesis while it stays wet, but the vessel's own temperature "
        + "is not a state this model solves — it is carried at whatever the "
        + "case charged.  On this witness the two agree because the tray was "
        + "authored AT the wet bulb (300.53 K against T_wb 300.5343), not "
        + "because the engine computed the agreement.", unit: "K" },
      { sym: "cp_c", means: "The specific heat of the dry CARRIER gas — the "
        + "dry-gas term of the humid heat.", unit: "J/(kg·K)" },
      { sym: "cp_v", means: "The specific heat of the moisture VAPOUR — the "
        + "second term of the humid heat cp_c + Y·cp_v.", unit: "J/(kg·K)" },
      { sym: "λ", means: "The LATENT HEAT of vaporisation of the moisture per "
        + "unit mass, taken at the wet-bulb temperature.  It is what the AIR "
        + "supplies — heat crossing in from outside the batch boundary.",
        unit: "J/kg" },
      { sym: "R_c", means: "The CONSTANT-RATE drying flux: the evaporation "
        + "rate per unit exposed area while the surface is still wet.  It is "
        + "formed on the mass-transfer side alone.", unit: "kg/(m²·s)" },
      { sym: "k_Y", means: "The GAS-FILM mass-transfer coefficient — flux per "
        + "unit humidity-ratio driving force.  READ THIS BEFORE YOU DEFEND A "
        + "RESULT: it is DECLARED sample-and-equipment data (air velocity, "
        + "tray geometry) with no default, and nothing in this unit predicts "
        + "it — there is no Sherwood, Reynolds or Schmidt correlation "
        + "anywhere in it.  Raising the air temperature moves T_wb and the "
        + "driving force and leaves k_Y exactly where you typed it.",
        unit: "kg/(m²·s) per (kg/kg)" },
    ],
    note: "The engine solves the first line for T_wb by bisection at Lewis = 1 "
      + "and publishes it as the T_wb KPI; the flux is then formed on the "
      + "mass-transfer side alone.  Those are the same statement only BECAUSE "
      + "Lewis = 1 is assumed — that is the hypothesis doing the work here.  "
      + "And k_Y is DECLARED sample and equipment data (air velocity, tray "
      + "geometry), not a correlation: this model does not predict a transfer "
      + "coefficient from the air's condition, so changing the air temperature "
      + "moves T_wb and the driving force, and leaves k_Y exactly where you "
      + "put it.",
  },
  {
    n: 3,
    title: "The critical moisture — and in this model you DECLARE it",
    body: "Eventually the solid can no longer deliver moisture to the surface "
      + "fast enough to keep it wet.  The moisture content at which that "
      + "happens is the CRITICAL MOISTURE X_c, and it is the corner in the "
      + "rate curve.  Be clear about what it is not: it is not a pure "
      + "material property.  The same powder dried harder — faster air, hotter "
      + "air — reaches the limit at a HIGHER moisture, because the surface is "
      + "being stripped faster than the interior can resupply.  X_c belongs to "
      + "the material AND the conditions together, which is why it is "
      + "measured.",
    formula: "t_c = m_s · (X_0 − X_c) / (R_c · A)      [the constant-rate leg]",
    where: [
      { sym: "t_c", means: "The BREAK TIME — the instant the moisture crosses "
        + "X_c and the falling-rate law takes over.  In the engine it is "
        + "OBSERVED, not predicted: interpolated between the two accepted "
        + "states that bracket the crossing, and published only when the run "
        + "actually saw it.  The formula here is the hand-check to compare "
        + "against.", unit: "s" },
      { sym: "m_s", means: "The DRY-SOLID charge: the mass of bone-dry solid "
        + "in the tray, computed once and constant.  It is the denominator "
        + "of X, and a zero dry charge is refused because X would mean "
        + "nothing.", unit: "kg" },
      { sym: "X_0", means: "The INITIAL moisture content — where the run "
        + "starts on the dry basis.", unit: "kg/kg dry solid" },
      { sym: "X_c", means: "The CRITICAL moisture content: where the surface "
        + "stops being able to keep itself wet and the rate begins to fall.  "
        + "It is DECLARED material data, not something this model derives.",
        unit: "kg/kg dry solid" },
      { sym: "A", means: "The exposed drying AREA of the tray — the surface "
        + "the flux acts over.", unit: "m²" },
    ],
    note: "IN THIS ENGINE X_c IS AN INPUT, not a result: the case declares "
      + "operation.criticalMoisture and the KPI X_critical echoes it back.  So "
      + "reading X_c off the corner of the R(X) plot recovers what was "
      + "declared — the corner sits there by construction of the two-period "
      + "law.  What the RUN decides is WHEN the curve arrives there, and that "
      + "is the t_critical KPI, which the engine publishes only when it "
      + "actually observed the crossing.",
  },
  {
    n: 4,
    title: "Falling rate: now the solid controls, and the surface warms",
    body: "Below X_c the wet surface is gone.  Moisture now has to travel from "
      + "inside the solid to a receding or partly dry surface, and that "
      + "journey — not the air film — sets the pace.  The rate falls, and "
      + "keeps falling, all the way to the equilibrium moisture X_eq where it "
      + "reaches zero.  The thermal picture inverts with it: with less "
      + "evaporation to cool it, the surface leaves the wet bulb and climbs "
      + "toward the air's DRY-BULB temperature.  That is where a "
      + "heat-sensitive product is actually at risk, and it is the opposite "
      + "end of the curve from where the hot air first worried you.",
    formula: "R = R_c · (X − X_eq) / (X_c − X_eq)\n"
      + "X(t) − X_eq = (X_c − X_eq)·exp(−(t − t_c)/τ),   "
      + "τ = m_s (X_c − X_eq)/(R_c A)",
    where: [
      { sym: "R", means: "The drying flux at moisture content X — falling "
        + "linearly here from R_c at the critical point to zero at "
        + "equilibrium.  Note it is not the R of any other page: not a reflux "
        + "ratio, not the gas constant.", unit: "kg/(m²·s)" },
      { sym: "X_eq", means: "The EQUILIBRIUM moisture content — where the "
        + "solid is in equilibrium with the air and drying stops.  It is a "
        + "RESULT of the air's condition, not a property of the solid alone: "
        + "drier air means a lower X_eq.", unit: "kg/kg dry solid" },
      { sym: "τ", means: "The TIME CONSTANT of the falling-rate period — the "
        + "e-folding time of the approach to equilibrium.  Read its "
        + "definition: it is built from the SAME R_c and A as the constant "
        + "rate, so the two periods are not independently parameterised.",
        unit: "s" },
      { sym: "t", means: "Elapsed time from the start of the run.", unit: "s" },
    ],
    note: "TWO HONESTY MARKS ON THIS STEP.  The linear falling-rate law above "
      + "is a MODELLING CHOICE the engine announces on every run in those "
      + "words — the simplest defensible law, not a mechanism: no internal "
      + "diffusion coefficient, no receding front, and only ONE falling-rate "
      + "period where many real materials show two.  And the warm-up toward "
      + "the dry bulb is described here but NOT computed: the solid's own "
      + "temperature is not integrated at all, which the engine also announces "
      + "as a named gap.  So this tool can tell you the product stays at T_wb "
      + "during the constant-rate period; it cannot tell you how hot it gets "
      + "afterwards.",
  },
  {
    n: 5,
    title: "Two consequences you have to size for",
    body: "FIRST: most of the WATER usually leaves in the constant-rate "
      + "period, and most of the TIME is usually spent in the falling-rate "
      + "one.  Those two sentences are not in conflict — they are what an "
      + "exponential tail does.  Size a dryer by taking the water to be "
      + "removed and dividing by the constant rate and you will underestimate "
      + "the drying time badly, because you priced the whole job at the "
      + "fastest rate it ever achieves.  Read the break time against the run's "
      + "horizon on the plot below and you can see the split for yourself.  "
      + "SECOND: X_eq is a FLOOR.  The rate vanishes there by construction, so "
      + "no amount of extra time gets you below it; drier product needs drier "
      + "or hotter air, not a longer run.  A dryer specified to a moisture "
      + "below the equilibrium value of the air it is fed cannot meet its "
      + "specification at any residence time.",
    formula: "t(X) = t_c + τ · ln( (X_c − X_eq) / (X − X_eq) )   →  ∞  as X → X_eq",
    note: "Both consequences are visible in the two diagrams: on X(t) the tail "
      + "flattens onto X_eq and never touches it; on R(X) the sloping segment "
      + "aims at R = 0 exactly at X_eq.  X_eq here is a RESULT, not a "
      + "declaration — the GAB isotherm of the solid evaluated at the water "
      + "activity of the declared air — so it moves when you move the air's "
      + "humidity, and that is the knob that raises or lowers the floor.",
  },
];

export const DRYING_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "declared-critical-moisture",
    title: "X_c is DECLARED, so the corner is not a prediction.",
    body: "operation.criticalMoisture is an input echoed back as the "
      + "X_critical KPI. Nothing in this engine predicts where the "
      + "constant-rate period ends, and nothing here makes X_c move when you "
      + "change the air — which real materials do, since drying harder pushes "
      + "the critical moisture up. Reading X_c off the plot recovers what was "
      + "typed into the case.",
  },
  {
    id: "falling-rate-law",
    title: "ONE falling-rate period, by a law that is a CHOICE.",
    body: "R = R_c (X − X_eq)/(X_c − X_eq) is announced by the engine as a "
      + "modelling choice, not physics. There is no internal diffusion "
      + "coefficient, no moisture profile inside the solid, no receding "
      + "evaporation front, no case hardening, and no second falling-rate "
      + "period. A material whose tail is governed by liquid capillary flow "
      + "and one governed by vapour diffusion are drawn identically here.",
  },
  {
    id: "solid-temperature",
    title: "The solid's temperature is NOT integrated.",
    body: "The surface is held at the wet bulb by hypothesis while X > X_c, "
      + "and the falling-rate warm-up toward the air's dry bulb is a gap the "
      + "engine names on every run. So this tool cannot tell you the product "
      + "temperature after the break, and no thermal-degradation or "
      + "product-quality claim can be read off it.",
  },
  {
    id: "constant-air",
    title: "The air is a DECLARED, CONSTANT environment.",
    body: "T, Y and the carrier are fixed for the whole run: the air does not "
      + "humidify as it picks up moisture, there is no air flow rate, no "
      + "outlet-air state and no recycle. A real tray dryer's air is drier at "
      + "the inlet end than at the outlet end, which is one reason a real "
      + "batch does not dry uniformly. None of that is here.",
  },
  {
    id: "no-spatial-resolution",
    title: "ONE moisture for the whole charge.",
    body: "The tray is a single well-mixed inventory: no bed depth, no "
      + "position along the tray, no non-uniform loading, and no distinction "
      + "between the top and the bottom of the layer. The exposed area is a "
      + "declared constant, so shrinkage of the drying surface as the solid "
      + "contracts is not modelled either.",
  },
  {
    id: "declared-transfer-coefficient",
    title: "k_Y is declared data, not a correlation.",
    body: "The gas-film coefficient is sample and equipment data — air "
      + "velocity, tray geometry — and the engine refuses to default it. "
      + "Nothing here computes it from a Reynolds or Sherwood number, so the "
      + "air-temperature knob changes the wet bulb and the driving force but "
      + "never k_Y itself. The wet-bulb equation also assumes Lewis = 1.",
  },
  {
    id: "energy-from-outside",
    title: "The latent load is published, and deliberately NOT ledgered.",
    body: "The drying heat comes from the declared air environment, which "
      + "lies outside the campaign boundary, so the engine publishes "
      + "latentDuty_kW and latentEnergy_kJ as KPIs and reports the campaign "
      + "energy balance as UNAVAILABLE rather than closing it with a term it "
      + "cannot price. The evaporated water is reported the same way — as "
      + "matter the declared closure destroys, never as a silent leak.",
  },
];
