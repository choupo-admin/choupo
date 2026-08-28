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
  The psychrometric-chart lesson, as DATA, for the same reason the McCabe and
  Kremser ones are: prose is the part of a tool that rots with nothing
  failing, and an argument held as data can be asserted to still run end to
  end.

  The tool that renders it is defined inline in MethodsWorkspace.tsx (it takes
  the catalogue and the case-local component files as props, and shares
  HandOffFooter with its neighbours there).

  THE ORDER IS THE POINT, and it is different from the staircase tools.  A
  McCabe diagram is a CONSTRUCTION: you draw lines and the answer falls out.
  A psychrometric chart is a MAP: nothing is constructed, every point is a
  state of moist gas, and the lesson is learning to read a process as a
  DIRECTION on it.  So the page defines the coordinates first (what a point
  IS), then the two curve families that bound and grade them, then the one
  temperature that is a balance rather than a reading -- and only after the
  chart itself does it draw the four moves every humid-gas process is made
  of, plus the pressure the whole page was drawn at.

  WHAT THE ENGINE ACTUALLY EMITS, checked against
  src/propertyOps/PsychrometricChart.cpp before this prose was written:
  four curve families and no others -- `saturation`, `rh:<phi>`,
  `adiabatic:<Tas>` (the adiabatic-saturation locus) and `wetbulb:<Tas>`
  (the TRUE wet bulb, slope scaled by Le^(2/3), emitted only when the
  package can give a gas diffusivity and a thermal conductivity).  There
  are NO enthalpy lines and NO process paths, and the lesson says so
  rather than describing a chart the reader does not have.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const PSYCHRO_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Every point is a state of moist gas",
    body: "This is a map, not a graph.  Across the bottom is the DRY-BULB "
      + "temperature — an ordinary thermometer held in the stream.  Up the "
      + "side is the HUMIDITY RATIO Y, the mass of vapour carried per unit "
      + "mass of DRY carrier gas.  Fix those two and the state of the moist "
      + "gas is fixed; everything else the chart shows you — relative "
      + "humidity, dew point, wet-bulb temperature, enthalpy — is a property "
      + "read off at that point, not a third coordinate you get to set.  The "
      + "curves are computed for the pair you name, so the carrier's molar "
      + "mass is part of the answer and not a decoration.",
    formula: "Y = (M_v / M_c) · p_v / (P − p_v)      [kg vapour / kg dry gas]",
    note: "The DRY basis is the whole trick.  The dry carrier is the one "
      + "thing that passes through a heater, a dryer or a cooling coil "
      + "UNCHANGED — nothing condenses it and nothing evaporates it — so per "
      + "kilogram of it every balance on this chart is a subtraction between "
      + "two points.  Counted per kilogram of MOIST gas the denominator would "
      + "move as the gas took up vapour, and every balance would have to "
      + "solve for it as well.  Absorption makes the same move for the same "
      + "reason when it works in mole ratios per mole of solute-free carrier.",
  },
  {
    n: 2,
    title: "The saturation curve is the ceiling; relative humidity is the family under it",
    body: "At each temperature the gas can hold only so much vapour: the "
      + "vapour's partial pressure cannot exceed the condensable's saturation "
      + "pressure P_sat(T), which climbs steeply with temperature.  Converted "
      + "to Y, that bound is the SATURATION CURVE, and it is the top edge of "
      + "the habitable chart — a point above it is not a state of unsaturated "
      + "gas at all, it is gas plus a mist.  Relative humidity is how far up "
      + "you are: φ = p_v/P_sat(T), a ratio of PRESSURES and not of "
      + "humidities, so each φ curve is the saturation curve scaled at every "
      + "temperature.",
    formula: "φ = p_v / P_sat(T)\n"
      + "Y(φ, T) = (M_v/M_c) · φ P_sat(T) / (P − φ P_sat(T))\n"
      + "saturation:  φ = 1",
    note: "Because P_sat(T) sits in the denominator, relative humidity moves "
      + "when NOTHING is added or removed: heat the gas at constant Y and φ "
      + "falls, purely because the ceiling rose.  That is why Y is the "
      + "variable you can do a mass balance in and φ is not.  It is also why "
      + "the DEW POINT — where cooling at constant Y and constant P first "
      + "meets the saturation curve — is a horizontal walk to the left, and "
      + "is a property of Y alone.  The curves stop before the condensable's "
      + "boiling point on purpose: as P_sat approaches P the gas becomes pure "
      + "vapour and Y runs to infinity, so the engine cuts every curve where "
      + "the vapour would exceed 65 % of the total pressure — an asymptote "
      + "carries no information and would flatten the rest of the chart onto "
      + "the axis.",
  },
  {
    n: 3,
    title: "Wet bulb is a balance, not another thermometer reading",
    body: "Wrap a bulb in a wet wick and hold it in the stream.  Liquid "
      + "evaporates and takes latent heat out of the bulb; the gas, now the "
      + "warmer of the two, feeds sensible heat back in.  The reading settles "
      + "where the two rates cancel, and that steady value is the WET-BULB "
      + "temperature.  It is not the temperature of the gas — it is the "
      + "temperature a free liquid surface reaches while sitting in that gas "
      + "— and it is the FLOOR for any adiabatic humidification: evaporating "
      + "the condensable into the gas cannot cool the gas past it.  Enthalpy "
      + "is why those lines are straight.  Counted per kilogram of the same "
      + "dry carrier, moist-gas enthalpy is sensible plus latent, and along "
      + "an adiabatic-saturation line the sensible heat given up is very "
      + "nearly the latent heat taken in — so the constant-enthalpy lines and "
      + "the adiabatic-saturation lines almost coincide, and an adiabatic "
      + "humidification reads as a straight line at all.",
    formula: "adiabatic saturation:  c_s · (T − T_as) = ( Y_sat(T_as) − Y ) · λ(T_as)\n"
      + "humid heat:            c_s = c_p,carrier + Y · c_p,vapour\n"
      + "moist-gas enthalpy:    h = c_s · (T − T₀) + Y · λ(T₀)   [per kg dry gas]\n"
      + "true wet bulb:         same anchor, slope × Le^(2/3),  Le = α / D_AB",
    note: "THE TWO TEMPERATURES ARE NOT THE SAME QUANTITY.  The "
      + "adiabatic-saturation temperature comes from an energy balance on gas "
      + "saturated to the end; the wet-bulb temperature comes from the RATIO "
      + "of heat transfer to mass transfer at a wet surface, and that ratio "
      + "brings in the Lewis number Le = α/D_AB.  They coincide when Le ≈ 1, "
      + "which air-water happens to satisfy — a near-coincidence of two "
      + "transport properties, not a law, and the reason a printed air-water "
      + "chart can label one set of lines with both names.  This chart draws "
      + "them as SEPARATE families, dashed for adiabatic saturation and solid "
      + "for the true wet bulb, so a pair with Le ≠ 1 shows the gap instead "
      + "of hiding it.  There is no enthalpy scale drawn: the expression "
      + "above is the reason the lines are straight, not a set of lines to "
      + "trace a kJ/kg off.",
  },
  {
    n: 4,
    title: "Four moves, and every humid-gas process is made of them",
    body: "HEATING is horizontal to the right: nothing is added, Y is "
      + "unchanged, and relative humidity falls because the ceiling rose.  "
      + "COOLING is horizontal to the left until the saturation curve — that "
      + "meeting point is the dew point — and further cooling can only run "
      + "DOWN the curve, the gas staying saturated at the surface "
      + "temperature while the difference in Y drops out as liquid.  That is "
      + "DEHUMIDIFICATION, and the chart gives the condensate directly: the "
      + "vertical drop, in kg per kg of dry gas.  ADIABATIC HUMIDIFICATION "
      + "runs UP a wet-bulb line towards saturation — liquid evaporates, Y "
      + "rises, and the gas pays the latent heat out of its own temperature.  "
      + "MIXING two streams puts the mixed state on the straight segment "
      + "joining them, dividing it in the inverse ratio of the two dry-gas "
      + "flows.",
    formula: "heating / cooling:        Y constant, move along T\n"
      + "dehumidification:         condensate = Y_in − Y_sat(T_surface)\n"
      + "adiabatic humidification: up a wet-bulb line, bounded below by T_wb\n"
      + "mixing:  Y_m = (G₁·Y₁ + G₂·Y₂) / (G₁ + G₂),   G = dry-gas mass flow",
    note: "The mixing rule is the LEVER RULE again — the same geometry as the "
      + "flash's tie line and the extraction triangle, and for the same "
      + "reason: Y and h are both averages weighted by the dry-gas flow.  It "
      + "is exact in Y and only very nearly right in T, because what mixes "
      + "linearly is enthalpy and the humid heat carries a Y·c_p,vapour term, "
      + "so the true point sits a little off the chord when the two streams "
      + "differ in both temperature and humidity.  Two moves compose into a "
      + "DRYER: heat the gas (right), then pass it over the wet solid, where "
      + "it picks up moisture along a wet-bulb line (up and left) — the "
      + "heater is paying in sensible heat for the evaporation the dryer "
      + "does.  Two more compose into a COOLING COIL: not all of the stream "
      + "reaches the cold surface, so the outlet sits on the mixing line "
      + "between saturated gas at the surface and feed that went through "
      + "untouched.",
  },
  {
    n: 5,
    title: "One chart, one pressure",
    body: "The total pressure is in the definition of Y and is nowhere on the "
      + "axes.  Every curve on this page was drawn at the pressure in the "
      + "setup, and at any other pressure the whole family moves: hold T and "
      + "φ and the vapour's partial pressure does not change — it depends "
      + "only on those two — while the dry gas is thinner, so Y rises as P "
      + "falls.  This is the classic altitude trap.  A chart printed for sea "
      + "level and read in a city a kilometre up understates the humidity "
      + "ratio of every state on it, and a dryer or a coil sized from it is "
      + "sized for a gas that is not there.",
    formula: "Y = (M_v/M_c) · p_v / (P − p_v)     →     Y rises as P falls, at fixed T and φ",
    note: "The remedy is not a correction factor: P is a knob here, so redraw "
      + "the chart at the pressure you actually have.  The same applies, far "
      + "more strongly, to a pressurised or a vacuum dryer.  What does NOT "
      + "move with total pressure is P_sat(T) itself — that is a property of "
      + "the condensable alone — which is why the BOILING temperature falls "
      + "with pressure while the vapour pressure at a given temperature does "
      + "not.",
  },
];

export const PSYCHRO_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "one-pressure",
    title: "Every curve is drawn at ONE total pressure.",
    body: "The pressure you set enters every humidity ratio on the page and "
      + "appears on neither axis, so a chart is not portable between "
      + "pressures. Nothing here warns you when you read a state off a chart "
      + "drawn at another P — the tool can only redraw at the pressure you "
      + "give it.",
  },
  {
    id: "ideal-gas",
    title: "Y comes from Dalton's law and the IDEAL gas.",
    body: "The humidity ratio (M_v/M_c)·p_v/(P − p_v) assumes carrier and "
      + "vapour both behave ideally and mix without interacting. At ambient "
      + "conditions the error is small; at elevated pressure it is not, and "
      + "no fugacity coefficient and no Poynting correction is applied "
      + "anywhere on this chart.",
  },
  {
    id: "pure-condensable",
    title: "The ceiling is the PURE condensable's vapour pressure.",
    body: "The saturation curve is P_sat(T) of the condensable on its own. A "
      + "liquid that is not pure — a brine, a sugar solution, moisture bound "
      + "in a porous solid — has a lower vapour pressure and comes to "
      + "equilibrium with gas below saturation. No water activity and no "
      + "sorption isotherm appears on this chart, so the ceiling it draws is "
      + "the highest a real drying medium could reach and usually not the one "
      + "it does.",
  },
  {
    id: "wetbulb-needs-transport",
    title: "The TRUE wet-bulb family is drawn only if the transport data exist.",
    body: "It needs a gas diffusivity (Fuller) and a thermal conductivity "
      + "(Eucken) to form the Lewis number; a component whose record carries "
      + "no diffusion volume simply yields no wet-bulb lines. Their ABSENCE "
      + "means the data was missing, never that Le = 1 and the two families "
      + "coincide — and since 2026-08-28 the run SAYS which of those it is, "
      + "naming the reason no line was drawn, because for most of this "
      + "chart's life the transport block was written in a dialect the "
      + "builder dropped and the family was silently missing from every "
      + "chart. Le is also evaluated once per line, at its saturation "
      + "anchor and in a carrier-dominated gas, rather than along it.",
  },
  {
    id: "no-enthalpy-lines",
    title: "There is no enthalpy scale on this chart.",
    body: "The engine emits four families — saturation, relative humidity, "
      + "adiabatic saturation, wet bulb — and nothing else. The enthalpy "
      + "expression above explains why the adiabatic lines are straight; it "
      + "is not a set of lines you can read kJ/kg off, and an energy balance "
      + "on a dryer or a coil has to be written out rather than traced.",
  },
  {
    id: "no-process-paths",
    title: "It is a state MAP; it does not run your process.",
    body: "The four moves are constructions you draw on it. Nothing here "
      + "integrates a dryer, sizes a coil, or checks that the condensate you "
      + "read off actually leaves. Choupo's own unit operations do the "
      + "material and energy balances — this page is what you read to know "
      + "what those balances mean.",
  },
  {
    id: "carrier-is-not-air",
    title: "The default carrier is NITROGEN, not air.",
    body: "Y is proportional to M_v/M_c, so the carrier's molar mass scales "
      + "the whole chart: nitrogen at 28.013 against air at 28.96 puts every "
      + "humidity ratio about 3 % above a printed air chart. The carrier list "
      + "offers only components whose record declares them noncondensable, "
      + "and the catalogue's air record does not — so air cannot be selected "
      + "here today. That is a gap in the data, not in the physics.",
  },
];
