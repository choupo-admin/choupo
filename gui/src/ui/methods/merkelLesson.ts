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
  The cooling-tower lesson, as DATA — same reason as the McCabe, Kremser and
  Hunter-Nash pages: prose is the part of a tool that rots with nothing
  failing, and an argument held as data can be asserted to still run.

  THE REASON THIS PAGE EXISTS AT ALL: a cooling tower is where a student
  meets a driving force that is NOT a temperature difference.  Every exchanger
  before it was priced on a ΔT; this one is priced on an ENTHALPY difference,
  because most of the heat leaves with the water that evaporates.  Everything
  else on the page — the wet-bulb floor, the approach, the Merkel integral —
  follows from that one substitution.

  Every hypothesis stated here was read off the engine that computes the
  answer (src/unitOperations/heatTransfer/CoolingTower.{H,cpp}); the
  concrete numbers quoted are this tool's own witness at its authored
  settings (tutorials/steady/heat/coolingTower01_merkel, `expected`).
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const MERKEL_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The heat leaves as vapour, so the driving force is not a ΔT",
    body: "Water enters a tower hot and leaves cooler, and almost none of "
      + "that happens by simply touching cooler air.  Most of the heat leaves "
      + "with the small fraction of the water that EVAPORATES into the air "
      + "stream: the air goes out a little hotter and a lot wetter.  Sensible "
      + "and latent transfer run side by side across the same interface, so "
      + "Merkel's method stops tracking them separately and writes ONE "
      + "potential — the enthalpy of air SATURATED at the water temperature, "
      + "minus the enthalpy of the bulk air passing it.  That difference, in "
      + "kJ per kg of dry air, is the entire driving force of the tower.",
    formula: "driving force = h*(T_water) − h_air      [kJ per kg dry air]",
    where: [
      { sym: "T_water", means: "The LOCAL bulk temperature of the water at a "
        + "section of the packing — the abscissa of the whole Merkel diagram, "
        + "and the temperature at which the saturation enthalpy h* is taken.  "
        + "Note what that means: h* is air saturated at the WATER's "
        + "temperature, not at the air's.", unit: "K" },
      { sym: "h*", means: "The enthalpy of air SATURATED at T_water — the "
        + "equilibrium curve of the diagram.  It is the state the air at the "
        + "interface would have, never the state of the bulk air.",
        unit: "kJ per kg dry air" },
      { sym: "h_air", means: "The enthalpy of the bulk moist air PER KILOGRAM "
        + "OF DRY AIR (the carrier alone), not per kg of the moist mixture.  "
        + "That basis is the whole reason Merkel's method works: the dry air "
        + "is conserved down the packing while the water it carries is not, "
        + "so a per-kg-dry-air enthalpy is a well-posed coordinate and a "
        + "per-kg-of-mixture one is not.", unit: "kJ per kg dry air" },
    ],
    note: "The diagram below is that sentence drawn: h*(T) is the upper "
      + "curve, the air-side operating line is the lower one, and the shaded "
      + "gap between them IS the driving force at each water temperature.  "
      + "Where the gap narrows, the same heat costs more tower.  Replacing "
      + "two transfer processes by one potential is an ASSUMPTION — a Lewis "
      + "factor of one — not a derivation; step 5 says what it buys and what "
      + "it costs.",
  },
  {
    n: 2,
    title: "The floor is the WET bulb, and the approach is what you pay for",
    body: "Ask how cold a tower can make water and the usual answer is the "
      + "air temperature.  It is not: it is the WET-BULB temperature — what a "
      + "thermometer with a wetted wick reads, the temperature air reaches "
      + "when it saturates itself by evaporating water into itself with no "
      + "heat from outside.  Water sitting at the incoming air's wet bulb is "
      + "already in balance with that air: the enthalpy gap there is zero and "
      + "the tower has nothing left to work with.  How far ABOVE that floor "
      + "the cold water actually ends up is the APPROACH, and it is the "
      + "number that sizes and prices the tower.",
    formula: "approach = T_water,out − T_wb,in        (the engine publishes both)",
    where: [
      { sym: "T_wb", means: "The WET-BULB temperature of the INLET air — what "
        + "that air reaches by saturating itself adiabatically.  It is the "
        + "thermodynamic FLOOR for the cold water: a design specification at "
        + "or below it is refused by name, and in rating mode the solver "
        + "brackets its search just above it so the answer can never sit "
        + "under it.  It is a property of the site's climate, not of the "
        + "tower — buy a bigger tower and this number does not move.",
        unit: "K" },
      { sym: "T_water,out", means: "The COLD-WATER outlet temperature — the "
        + "water stream, not the air (the air has its own outlet, reported "
        + "separately).  It is the RESULT in rating mode and the SPEC in "
        + "design mode.", unit: "K" },
    ],
    note: "The approach cannot be bought down cheaply.  Push T_water,out "
      + "towards T_wb and the gap at the cold end of the diagram closes, the "
      + "integrand 1/(h* − h) grows without bound, and so does the packing "
      + "the duty demands — the engine's rating solver relies on exactly that "
      + "divergence at the wet-bulb floor to bracket its bisection, and a "
      + "DESIGN asking for a cold-water temperature at or below T_wb is "
      + "refused by name rather than answered.  The wet bulb belongs to the "
      + "site's climate, not to the tower, so the same hardware is a "
      + "different machine somewhere else.  On this tool's witness the air "
      + "enters at 25 °C dry bulb and the engine reports a wet bulb near "
      + "19.9 °C — the dry bulb is not the floor, and reading it as one "
      + "flatters the tower by several kelvin.",
  },
  {
    n: 3,
    title: "Range is the process's number; the tower answers with the cold end",
    body: "The RANGE is how far the water cools, T_water,in − T_water,out.  "
      + "It reads like a tower property and it is not: it is set on the other "
      + "side of the fence.  The process rejects a duty Q into a circuit "
      + "carrying a water flow L, and a sensible-heat balance then fixes the "
      + "range.  Choose a wide range for that duty and you pump less water; "
      + "choose a narrow one and you pump more.  What the tower and the "
      + "ambient wet bulb decide between them is the cold end — the approach. "
      + " The ratio that couples the two sides is L/G, kg of water per kg of "
      + "dry air.  It SETS the slope of the operating line but is not itself "
      + "the slope: the diagram's vertical axis is an enthalpy and its "
      + "horizontal one a temperature, so the slope carries cp_L with it and "
      + "is (L/G)·cp_L — read the formula below and check the units.",
    formula: "Q = L · cp_L · range            range = T_water,in − T_water,out\n"
      + "operating line:  h(T) = h_air,in + (L·cp_L / G) (T − T_water,out)",
    where: [
      { sym: "Q", means: "The tower's heat duty, computed on the WATER side "
        + "as L·cp_L·range.  Be careful what you conclude from it: because "
        + "the air outlet enthalpy is DEFINED by this same operating line, "
        + "the air-side product G(h₂−h₁) is identically equal to it.  The two "
        + "sides agreeing is arithmetic, not an independent energy check.",
        unit: "kW as published" },
      { sym: "L", means: "The water MASS flow — specifically the mass flow of "
        + "the condensable component in the water inlet, so a dissolved "
        + "solute in that stream is not counted in L.  Across this corpus L "
        + "is overloaded: in the distillation pages it is a liquid MOLAR flow "
        + "inside a column, and in Kremser a solute-free molar solvent flow. "
        + " Same letter, different quantity, different units.", unit: "kg/s" },
      { sym: "G", means: "The DRY-air mass flow: the carrier component alone, "
        + "deliberately excluding the water vapour the air already carries "
        + "and the water it is about to pick up.  That exclusion is what "
        + "makes G constant down the packing.", unit: "kg/s dry air" },
      { sym: "cp_L", means: "The specific heat capacity of LIQUID water — "
        + "what turns a water temperature drop into heat the air must carry "
        + "away.  The engine evaluates it ONCE and holds it constant; see "
        + "step 5 for where that approximation bites.", unit: "J/(kg·K)" },
      { sym: "T", means: "A water temperature ANYWHERE in the packing — the "
        + "running coordinate, not a terminal.  The operating line gives the "
        + "air enthalpy at the section where the water is at T.", unit: "K" },
      { sym: "range", means: "How far the water is cooled: T_water,in − "
        + "T_water,out.  Range and approach are the two numbers that describe "
        + "a tower's job, and they are independent — range is set by the duty "
        + "and the water flow, approach by the tower and the climate.",
        unit: "K" },
    ],
    note: "The engine's two spec modes ARE these two questions, and exactly "
      + "one may be declared (both, or neither, is refused).  Declare the "
      + "packing — merkelNumber, RATING — and the cold-water temperature is "
      + "the result; declare T_water_out — DESIGN — and the Merkel number the "
      + "duty requires is the result.  Raising L/G tilts the operating line "
      + "up towards the saturation curve; when it touches, the tower is "
      + "PINCHED.  In DESIGN mode the engine refuses by name and gives the "
      + "remedy — more air, or less water.  In RATING mode, which is what "
      + "this page's classroom run is, there is no such message: the Merkel "
      + "integral simply diverges at the pinch and the bisection cannot cool "
      + "the water past it.",
  },
  {
    n: 4,
    title: "The Merkel number: how much packing this duty demands",
    body: "With one driving force defined, the tower's balance collapses into "
      + "one dimensionless group.  Follow a kilogram of water down the "
      + "packing: cooling it by dT releases cp_L dT, and the rate at which "
      + "the tower can carry that away is proportional to the local enthalpy "
      + "gap.  Adding up dT/(h* − h) from the cold end to the hot end gives "
      + "the tower's number of transfer units, KaV/L — the Merkel number.  K "
      + "is a mass-transfer coefficient, a the interfacial area per unit "
      + "volume, V the packing volume and L the water flow, so the same "
      + "number reads two ways: as the DEMAND this duty places on a tower, "
      + "and as the SUPPLY an installed packing offers.",
    formula: "Me = KaV/L = ∫[T_out → T_in]  cp_L dT / (h*(T) − h(T))",
    where: [
      { sym: "Me", means: "The Merkel number — the dimensionless size of the "
        + "transfer job, obtained by integrating the reciprocal driving force "
        + "across the range.  A big Me means a hard job: either a small "
        + "driving force or a wide range.", unit: "dimensionless" },
      { sym: "KaV/L", means: "The classical name for the same group: mass "
        + "transfer coefficient K, interfacial area per unit volume a, "
        + "packing volume V, water flow L.  READ THIS CAREFULLY — in this "
        + "engine K, a and V never appear apart.  There is no variable, no "
        + "dict key and no correlation for any of them anywhere in the unit; "
        + "the group is declared or computed only as a whole.  So the Merkel "
        + "number sizes NOTHING by itself: turning it into a fill height or "
        + "a plan area needs a packing model this engine does not have.",
        unit: "dimensionless" },
      { sym: "T_out", means: "The lower limit of the integral: the COLD-water "
        + "outlet, the same quantity step 2 wrote T_water,out.  The shorter "
        + "spelling is the one the classical integral is written with.",
        unit: "K" },
      { sym: "T_in", means: "The upper limit: the HOT-water inlet (step 3's "
        + "T_water,in).  Both limits are the WATER's temperatures — the air "
        + "never appears in the limits, only in the driving force.",
        unit: "K" },
      { sym: "T", means: "The integration variable — the water temperature at "
        + "a point in the packing, marched from the cold end to the hot end.  "
        + "It is the diagram's x-axis; both the saturation curve and the "
        + "operating line are read at it, and their gap is the local driving "
        + "force.", unit: "K" },
      { sym: "dT", means: "The differential of WATER temperature: the slice "
        + "of cooling whose released heat cp_L dT the enthalpy gap must "
        + "carry.  It is emphatically NOT a temperature-difference driving "
        + "force — that is step 1's whole point.  Numerically the engine "
        + "discretises it as a composite-Simpson step over a fixed grid.",
        unit: "K" },
    ],
    note: "Choupo evaluates that integral by composite Simpson on a fine "
      + "grid and publishes the classical CTI four-point Chebyshev hand "
      + "evaluation beside it, so the shortcut a student would do on paper is "
      + "visible against the converged answer: on the witness they agree to "
      + "about 4e-5, and the chip says so rather than manufacturing a "
      + "discrepancy.  Note what the group does NOT give you — K, a and V "
      + "never appear apart.  Me is a duty requirement; turning it into a "
      + "tower needs a Ka for the actual fill, and this model carries none.",
  },
  {
    n: 5,
    title: "What Merkel assumes, and where it costs you",
    body: "Merkel's method is an approximation with a named set of "
      + "hypotheses, and the engine announces them on every solve rather than "
      + "burying them.  It takes the LEWIS FACTOR AS ONE, which is what lets "
      + "heat and mass transfer be lumped into a single coefficient against a "
      + "single enthalpy potential — the unit's own header puts that factor "
      + "near 0.87–1 for air and water, so this is a near-coincidence of one "
      + "pair of substances and not a general law.  It holds the WATER FLOW "
      + "CONSTANT inside the integral, ignoring the water that evaporates "
      + "away as the stream descends.  It closes the air outlet by assuming "
      + "the EXIT AIR IS SATURATED, because an enthalpy profile alone does "
      + "not fix a humidity.  And it evaluates the SPECIFIC HEATS ONCE and "
      + "holds them constant down the packing — the gas ones at the mean of "
      + "the two inlets, and the LIQUID one at the MEAN of the water INLET "
      + "and a fixed 25 °C surrogate standing in for the water outlet, "
      + "because in rating mode that outlet is precisely the unknown being "
      + "solved for (on the witness that mean is 35 °C, not 25).  That last one is a real "
      + "approximation at the cold end of a tower whose outlet is far from "
      + "25 °C.",
    note: "The neglected evaporation is not hidden: the engine computes it "
      + "from the air's humidity gain, publishes it, and subtracts it from "
      + "the cold-water outlet FLOW (the outlet temperature is untouched), "
      + "so the boundary mass balance is exact even "
      + "though the integrand's L is not.  On the witness at its authored "
      + "settings that loss is about 2.4 % of the water fed — the water flow "
      + "at the bottom of the packing is that much lower than at the top, "
      + "while the integral uses one L throughout.  Small, and not zero.  "
      + "Later formulations (Poppe's, for instance) carry the Lewis factor "
      + "and the air humidity explicitly; Choupo implements Merkel only, and "
      + "the comparison is not available here.",
  },
];

export const MERKEL_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "lewis-one",
    title: "The Lewis factor is taken as ONE — that is what makes it one coefficient.",
    body: "Heat and mass transfer are lumped into a single coefficient acting "
      + "on a single enthalpy potential, which is exact only at a Lewis "
      + "factor of one. The unit's own header puts it near 0.87–1 for "
      + "air–water, which is why the method serves this pair so well and why "
      + "it should not be assumed to travel to another one. Nothing here "
      + "computes a Lewis factor, and nothing lets you set one.",
  },
  {
    id: "constant-water-flow",
    title: "The water lost to evaporation is left OUT of the integral.",
    body: "L is held constant along the packing — the classical Merkel form. "
      + "The loss itself is not ignored elsewhere: the engine gets it from "
      + "the air's humidity gain, publishes it (evaporation_kg_s, "
      + "evaporation_pct_of_L) and subtracts it from the cold-water outlet, "
      + "so the boundary mass balance is exact while the integrand's L is "
      + "not. The specific heats are likewise taken once, at mean "
      + "temperatures, and not re-evaluated along the packing.",
  },
  {
    id: "saturated-exit-air",
    title: "The exit air is ASSUMED saturated, because Merkel cannot resolve it.",
    body: "The method carries an enthalpy profile, not a humidity profile, so "
      + "the leaving air needs one closing assumption and this is the "
      + "classical one: the engine finds T_air_out from h*(T) = h_air,out. It "
      + "is stated to be good near design loading, and the evaporation — "
      + "hence the make-up — is computed from it, so a lightly loaded tower's "
      + "reported water consumption inherits that assumption. Real exit air "
      + "can leave unsaturated, or supersaturated carrying entrained mist.",
  },
  {
    id: "no-packing-model",
    title: "KaV/L is DECLARED, not predicted — there is no fill in this model.",
    body: "K, a and V never appear apart, so a Merkel number cannot be turned "
      + "into a packing height, a plan area or a fill selection here. Choupo "
      + "ships no packing-characteristic correlation of the manufacturer's "
      + "Me = c (L/G)^(−n) kind, so a rating run is exactly as good as the "
      + "number you declare for it. Air-side pressure drop, fan power, "
      + "draught (mechanical or natural) and pump work are all absent too — a "
      + "tighter approach is bought with fan and pump energy this model never "
      + "prices.",
  },
  {
    id: "water-losses",
    title: "Make-up here is EVAPORATION only — no drift, no blowdown.",
    body: "The engine sets makeup_kg_s equal to the evaporation and says so "
      + "in its own console line. A real circuit also loses water as drift "
      + "(droplets carried out with the air) and must be bled continuously as "
      + "blowdown, because evaporation leaves the dissolved salts behind and "
      + "concentrates them. Cycles of concentration, treatment chemistry, "
      + "scaling, fouling and biological control are all outside this model, "
      + "so the make-up shown is a LOWER BOUND on what a tower consumes.",
  },
  {
    id: "one-dimensional-counterflow",
    title: "One-dimensional, counter-current, steady.",
    body: "Both streams are treated as plug flow at a single state across any "
      + "section of a counter-current contact: no crossflow tower, no air or "
      + "water maldistribution, no bypassing, no end effects at the spray and "
      + "the basin, and no transients. Plume formation, and recirculation of "
      + "the tower's own humid exit air into its intake — which raises the "
      + "wet bulb the tower actually sees, and so the approach it can reach — "
      + "are not modelled either.",
  },
];
