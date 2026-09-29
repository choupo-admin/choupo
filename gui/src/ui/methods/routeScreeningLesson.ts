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
  Screening reaction routes to a product, as DATA (commission C24,
  2026-09-28, built 2026-09-29).

  WHY THIS PAGE EXISTS.  The architect asked how industry finds the route to
  a product, and suspected thermodynamics has to enter at the very start.
  It does, but second: the first filter is money, and both come long before
  any rate is measured.  The page runs the funnel on three known routes to
  methanol, and the route that wins on paper is the one that fails.

  THE PROSE CARRIES ITS MATHEMATICS BETWEEN `$` MARKS; each section's display
  equation is a String.raw literal whose symbols its `where` glosses
  (check_lesson_symbols reads this module; sections carry `n:` for it).

  MEASURED on the native build before this file was written, witness
  tutorials/steady/reactors/screen01_methanol_routes, 525 K, 50 bar:

      route A  X_eq 0.529340322518  Kp 1.9134e-3   dHrxn -98.3588581921
      route B  X_eq 0.21185113285   Kp 2.2039e-5   dHrxn -58.7023434406
      route C  X_eq 0.999999924497  Kp 9.2931e19   dHrxn -254.841540127
               (per reaction as written: 2 CH3OH, so -127.42 per mole)
      gibbsC   y_methanol 1.819e-10, y_CH4 0.4991, y_water 0.3321,
               y_CO2 0.1670 -- half the methane burns, none becomes methanol
      corners 475/575 K x 10/100 bar all run; gibbsC methanol <= 1.1e-9.
\*---------------------------------------------------------------------------*/

export interface ScreenGloss { sym: string; means: string; unit?: string }

export interface ScreenSection {
  /** Position on the page (and the block marker the symbol gate splits on). */
  n: number;
  id: string;
  title: string;
  /** Prose; mathematics between `$` marks. */
  body: string;
  /** The section's display equation, KaTeX. */
  eq?: string;
  /** Every symbol `eq` uses. */
  where?: readonly ScreenGloss[];
  check?: { q: string; a: string };
}

export const SCREEN_SECTIONS: readonly ScreenSection[] = [
  {
    n: 1,
    id: "funnel",
    title: "The funnel: the cheapest filter first",
    body: "Nobody starts a new product by measuring rates.  The routes already "
      + "known from the literature and the patents are listed first, and "
      + "then passed through filters in order of COST, cheapest first.  "
      + "Arithmetic on the stoichiometry and a table of prices costs nothing.  "
      + "Thermodynamics costs a calculation from data the catalogue already "
      + "holds.  A laboratory screen of catalysts costs months, a rate law "
      + "costs more, and a pilot plant costs years.  Most routes die on paper, "
      + "and that is the point of doing the paper first.  This page runs the "
      + "paper filters on three known routes to methanol, each fed at its own "
      + "stoichiometric ratio.  Every thermodynamic number comes from the "
      + "engine in one run.  The route that looks best on paper is the one "
      + "that fails.",
  },
  {
    n: 2,
    id: "margin",
    title: "Filter 1 — does the stoichiometry make money?",
    body: "Before any reactor exists, the reaction equation already fixes how "
      + "many kilograms of each raw material a kilogram of product consumes.  "
      + "Multiply by prices and subtract from the product's price: that is the "
      + "stoichiometric gross margin, the first economic test of Douglas's "
      + "hierarchical design procedure (Conceptual Design of Chemical "
      + "Processes, 1988).  It is an UPPER bound, because a real plant never "
      + "reaches complete conversion and full selectivity, and it pays for "
      + "energy, equipment and people too.  A route with a negative margin "
      + "here cannot be rescued downstream.  The prices on this page are "
      + "yours to set.  Their starting values are round placeholders and not "
      + "market data, and moving them re-ranks the routes.  Try the price of "
      + "hydrogen.",
    eq: String.raw`GM = p_P - \sum_{r} \frac{|\nu_r|\,M_r}{\nu_P\,M_P}\,p_r`,
    where: [
      { sym: "GM", means: "the stoichiometric gross margin per kilogram of "
        + "product", unit: "€/kg" },
      { sym: "p_P", means: "the price of the product, methanol", unit: "€/kg" },
      { sym: "\\nu_r", means: "the stoichiometric coefficient of raw "
        + "material r (negative; its magnitude is used)", unit: "–" },
      { sym: "M_r", means: "the molar mass of raw material r", unit: "kg/kmol" },
      { sym: "\\nu_P", means: "the stoichiometric coefficient of the product",
        unit: "–" },
      { sym: "M_P", means: "the molar mass of the product", unit: "kg/kmol" },
      { sym: "p_r", means: "the price of raw material r", unit: "€/kg" },
    ],
    check: {
      q: "Route B needs three hydrogens per methanol; route A needs two.  Which "
        + "price decides whether B is worth pursuing?",
      a: "Hydrogen's.  Route B carries 0.19 kg of hydrogen per kg of methanol "
        + "against A's 0.13, so the same hydrogen price costs B half as much "
        + "again.",
    },
  },
  {
    n: 3,
    id: "atom",
    title: "Filter 2 — where do the atoms go?",
    body: "Atom economy asks what fraction of the mass fed ends up in the "
      + "product if the reaction runs exactly as written (Trost, Science 254 "
      + "(1991) 1471).  Routes A and C put every atom into methanol.  Route B "
      + "puts a third of its mass into water, because the extra oxygen of "
      + "$\\mathrm{CO_2}$ has to leave somewhere and takes hydrogen with it.  "
      + "That is hydrogen bought and thrown away as water, and it is the same "
      + "fact the margin already saw, read in kilograms instead of euros.",
    eq: String.raw`AE = \frac{\nu_P\,M_P}{\sum_r |\nu_r|\,M_r}`,
    where: [
      { sym: "AE", means: "the atom economy", unit: "–" },
      { sym: "\\nu_P", means: "the stoichiometric coefficient of the product",
        unit: "–" },
      { sym: "M_P", means: "the molar mass of the product", unit: "kg/kmol" },
      { sym: "\\nu_r", means: "the stoichiometric coefficient of reactant r",
        unit: "–" },
      { sym: "M_r", means: "the molar mass of reactant r", unit: "kg/kmol" },
    ],
  },
  {
    n: 4,
    id: "equilibrium",
    title: "Filter 3 — does thermodynamics allow it, where the catalyst works?",
    body: "A route can make money on paper and still be forbidden.  The "
      + "question is asked at the temperature a catalyst can actually work at, "
      + "not at 25 °C.  The equilibrium reactor computes $K$ from the "
      + "formation data and the conversion it allows.  At 525 K and 50 bar "
      + "route A stops at about 53 %, route B at about 21 % and route C runs "
      + "to completion ($K \\approx 10^{20}$).  All three lose moles of gas, so "
      + "pressure helps all three; heat helps none, since all three are "
      + "exothermic.  A partial conversion is not a verdict.  It means a "
      + "recycle, and the recycle has a cost the next level of design will "
      + "price.  A conversion of $10^{-6}$ would be a verdict.",
    eq: String.raw`K(T) = \exp\!\left(-\frac{\Delta G^\circ(T)}{R\,T}\right)
= \prod_i \left(\frac{y_i\,P}{P^\circ}\right)^{\nu_i}`,
    where: [
      { sym: "K", means: "the equilibrium constant of the route's reaction",
        unit: "–" },
      { sym: "T", means: "the reactor temperature", unit: "K" },
      { sym: "\\Delta G^\\circ", means: "the standard Gibbs energy of "
        + "reaction, from the formation data", unit: "J/mol" },
      { sym: "R", means: "the gas constant", unit: "J/(mol·K)" },
      { sym: "y_i", means: "the outlet mole fraction of species i", unit: "–" },
      { sym: "P", means: "the reactor pressure", unit: "bar" },
      { sym: "P^\\circ", means: "the standard pressure, 1 bar", unit: "bar" },
      { sym: "\\nu_i", means: "the stoichiometric coefficient of species i",
        unit: "–" },
    ],
    check: {
      q: "Why does raising the pressure help every route here?",
      a: "Each route has fewer moles of gas on the product side, so the "
        + "product of (y P/P°)^ν carries a negative power of P.  At fixed K "
        + "a higher P forces the mole fractions toward the products.",
    },
  },
  {
    n: 5,
    id: "heat",
    title: "Filter 4 — how much heat, and how dangerous?",
    body: "The conversion reactor at complete conversion reports the heat of "
      + "reaction the route would have to remove.  Per mole of methanol that "
      + "is about 98 kJ for A, 59 kJ for B and 127 kJ for C.  Heat is not "
      + "only a utility bill.  An exothermic reaction whose rate climbs with "
      + "temperature can run away, and route C is an oxidation run next to a "
      + "combustion of the same methane that releases several times more.  "
      + "The heat filter is where the safety filter begins.",
    eq: String.raw`\Delta H_\mathrm{rxn}(T) = \sum_i \nu_i\,h_i(T)`,
    where: [
      { sym: "\\Delta H_\\mathrm{rxn}", means: "the heat of reaction as "
        + "written, on the elements datum", unit: "kJ/mol" },
      { sym: "T", means: "the reactor temperature", unit: "K" },
      { sym: "\\nu_i", means: "the stoichiometric coefficient of species i",
        unit: "–" },
      { sym: "h_i", means: "the molar enthalpy of species i, formation "
        + "enthalpy included", unit: "kJ/mol" },
    ],
  },
  {
    n: 6,
    id: "selectivity",
    title: "Filter 5 — is the product where the atoms want to go?",
    body: "Filter 3 asked the route's OWN reaction, and route C passed it "
      + "with the largest $K$ on the page.  Now give a Gibbs reactor the same "
      + "methane and oxygen and every species the case knows, and let it find "
      + "where the atoms end up when nothing stops them at methanol.  "
      + "Methanol falls to about $10^{-10}$.  Half the methane burns to carbon "
      + "dioxide and water, the other half is left over, and the oxygen is "
      + "gone.  Methanol is favoured over methane and oxygen, but the "
      + "combustion products are favoured far more, and methanol burns more "
      + "easily than the methane it came from.  So route C stands or falls on "
      + "a catalyst that stops at methanol.  That is a question of RATES, and "
      + "no paper screen can answer it.  Direct oxidation of methane to "
      + "methanol has been pursued for decades and is not how methanol is "
      + "made at scale.  Routes A and B have the same weakness, milder: on "
      + "syngas with methanation allowed, the Gibbs answer is methane (the "
      + "page Declared pathways).  Every methanol process is a bet on "
      + "selectivity, and route A is the one where industry has a catalyst "
      + "that wins it.",
  },
  {
    n: 7,
    id: "select",
    title: "Filter 6 — the questions that are not thermodynamics",
    body: "Pharmaceutical process chemists wrote the remaining filters down "
      + "as SELECT (Butters et al., Chem. Rev. 106 (2006) 3002): Safety, "
      + "Environmental, Legal, Economics, Control, Throughput.  Is the route "
      + "safe to run: route C mixes methane with pure oxygen at 50 bar, "
      + "and how close that mixture sits to its flammable envelope at the "
      + "operating temperature and pressure is the first thing to measure.  What does it emit, and what does its hydrogen "
      + "carry: route B consumes CO₂ only if its hydrogen is made without "
      + "emitting more.  Is it free to operate under the patents.  Does it pay "
      + "once the plant is costed.  Can the product be made reliably to "
      + "specification.  Can it be made in the quantity and in the time "
      + "required, from raw materials that are actually available.  None of "
      + "these needs a rate constant, and any one of them can end a route.",
  },
  {
    n: 8,
    id: "last",
    title: "Kinetics last",
    body: "What survives goes to the laboratory: catalysts screened for "
      + "selectivity first, then activity.  Only for the route that is left "
      + "is a rate law measured, and only then can a reactor be sized.  That "
      + "is the top rung of the page The reactor ladder.  The rate is the most "
      + "expensive fact in the whole funnel, so it is bought last, for one "
      + "route, when every cheaper question has already been answered.",
  },
];

export interface ScreenLimit { id: string; title: string; body: string }

export const SCREEN_LIMITS: readonly ScreenLimit[] = [
  {
    id: "prices",
    title: "The prices are placeholders, and the ranking follows them.",
    body: "This repository curates no prices, and inventing one with a "
      + "citation would be a falsehood nobody could detect.  The starting "
      + "values are round numbers chosen to make the arithmetic visible.  "
      + "Enter prices you can cite before you believe a ranking.",
  },
  {
    id: "boundary",
    title: "Route A starts from synthesis gas, which is itself made.",
    body: "A fair comparison would start every route from the same raw "
      + "material: natural gas, reformed to syngas for A, and the source of "
      + "B's hydrogen.  The screen's boundary is drawn at the reactor feed, "
      + "which flatters whichever route has the costliest feed preparation "
      + "hidden in a price.",
  },
  {
    id: "one-reaction",
    title: "One reaction per route, ideal gas at 50 bar.",
    body: "A real CO₂-to-methanol reactor also runs the reverse water-gas "
      + "shift, and a real syngas contains CO₂.  Declaring both reactions is "
      + "the page Declared pathways.  At 50 bar the ideal gas is an "
      + "approximation that every reactor here shares.",
  },
  {
    id: "mass-metrics",
    title: "Atom economy is the first mass metric, not the last.",
    body: "It assumes complete conversion and ignores solvents, separations "
      + "and energy.  Waste metrics measured on a real process go further, "
      + "and they need the process first.",
  },
];
