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
  syngasLesson -- the text of "Synthesis gas: one gas, many products"
  (DEV.md 4c C109).

  THE OUTLINE IS VITOR'S, approved 2026-10-19 ("Podes avancar") and recorded
  in DEV.md 4c C109: eight parts -- where syngas comes from; why reforming is
  run hot and at low pressure; carbon deposition; the shift as the ratio knob;
  each destination's ratio; cleaning the gas; the historical family and the
  green future; what the model does not do -- in that order.  Syngas is
  explained here as a PLATFORM.  The equilibrium METHODS it is solved with
  have their own pages (approach-to-equilibrium, declared-pathways,
  equilibrium-landscapes, element-potential), and this one points to them
  rather than repeating them.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, and
  tests/syngasLesson.test.ts holds each citation to the source text it names.
  The engine half is src/unitOperations/reactor/GibbsReactor.cpp,
  reactor/gibbsMethod/GibbsSolidPhase.cpp, reactor/EquilibriumReactor.cpp and
  separation/PSA.cpp.

  NO INDUSTRIAL OR HISTORICAL NUMBER IS STATED.  Every number on the page is
  either a run of the engine (held by the test to a native run of the very
  files the browser sends), a value a corpus case DECLARES (named with its
  case), or exact stoichiometry.  Industrial practice and history are told as
  general knowledge, without figures; nothing is quoted and no external
  source is cited, because none was needed for a claim the page makes.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const SYNGAS_STEPS: readonly LessonStep[] = [
  // ---- Part 1: where syngas comes from ------------------------------------------
  {
    n: 1,
    title: "One gas, many products",
    body: "Synthesis gas -- syngas -- is a mixture of carbon monoxide and "
      + "hydrogen, nearly always carrying some carbon dioxide, steam and "
      + "unconverted methane with it.  It is mostly made where it is used, "
      + "and what matters here is its role: it is a PLATFORM: the form in which carbon, hydrogen and "
      + "oxygen are handed to a catalyst that reassembles them into something "
      + "else.  From the same two molecules come methanol, the hydrocarbon "
      + "chains of Fischer-Tropsch fuels and waxes, aldehydes by "
      + "hydroformylation (the oxo process), and -- once the carbon monoxide "
      + "has been converted and removed -- the hydrogen of ammonia and of "
      + "refinery hydrotreating.  So the one question that decides what a "
      + "given syngas is good for is its COMPOSITION, and two numbers carry "
      + "most of it: the hydrogen-to-carbon-monoxide ratio, and the "
      + "stoichiometric module that a methanol designer uses because it "
      + "also counts the CO2.  Every exercise on this page reports both, "
      + "computed from the outlet flows the engine publishes.",
    formula: String.raw`r = \frac{n_{\ce{H2}}}{n_{\ce{CO}}}, \qquad M = \frac{n_{\ce{H2}} - n_{\ce{CO2}}}{n_{\ce{CO}} + n_{\ce{CO2}}}`,
    where: [
      { sym: "r", means: "the H2/CO ratio of the gas", unit: "mol/mol" },
      { sym: "n_{\\ce{H2}}", means: "the molar flow of hydrogen in the gas",
        unit: "kmol/h" },
      { sym: "n_{\\ce{CO}}", means: "the molar flow of carbon monoxide",
        unit: "kmol/h" },
      { sym: "M", means: "the stoichiometric module (also written SN): the "
        + "hydrogen left after CO2 has taken its share, per carbon oxide",
        unit: "mol/mol" },
      { sym: "n_{\\ce{CO2}}", means: "the molar flow of carbon dioxide",
        unit: "kmol/h" },
    ],
    note: "Both numbers on this page are arithmetic on the outlet stream the "
      + "engine publishes (its overall molar flow and mole fractions); the "
      + "test recomputes each from a native run.",
  },
  {
    n: 2,
    title: "Four ways to make it",
    body: "Syngas is made by taking a carbon source apart with steam, oxygen "
      + "or CO2.  STEAM REFORMING passes methane and steam over a nickel "
      + "catalyst in tubes heated by a furnace: strongly endothermic, so the "
      + "heat must be supplied through the tube walls.  PARTIAL OXIDATION "
      + "burns the methane with too little oxygen to make CO2 and water, so it "
      + "stops at CO and hydrogen and pays for itself in heat.  AUTOTHERMAL "
      + "reforming does both in one vessel: part of the methane burns, and "
      + "the heat it releases drives the reforming of the rest with the steam "
      + "added beside the oxygen -- no furnace, no heat through a wall.  "
      + "GASIFICATION does the same to a solid: coal, petroleum coke or "
      + "biomass, with steam and oxygen, at a high temperature.  And methane "
      + "can be reformed with CO2 instead of steam, which turns a waste gas "
      + "into a reactant.  Each equation below is balanced in C, H and O.",
    formula: String.raw`\begin{aligned}
&\ce{CH4 + H2O <=> CO + 3 H2} &&\text{steam reforming}\\
&\ce{CH4 + 1/2 O2 -> CO + 2 H2} &&\text{partial oxidation}\\
&\ce{CH4 + 2 O2 -> CO2 + 2 H2O} &&\text{the combustion inside an autothermal reformer}\\
&\ce{CH4 + CO2 <=> 2 CO + 2 H2} &&\text{CO2 (dry) reforming}\\
&\ce{C + H2O -> CO + H2},\quad \ce{C + 1/2 O2 -> CO} &&\text{gasification of a solid carbon}
\end{aligned}`,
    note: "The engine runs the first four on this page and cannot run the "
      + "fifth: a coal or biomass feed is a solid, and no reactor in Choupo "
      + "carries a solid feed into its equilibrium -- the equilibrium reactor "
      + "refuses one by name (EquilibriumReactor.cpp:82-86).  Gasification is "
      + "told here, not run.",
  },
  {
    n: 3,
    title: "An equilibrium reformer: what the engine solves",
    body: "The exercises use the Gibbs reactor: it is told a temperature, a "
      + "pressure, the elements and the list of species allowed to exist, and "
      + "it finds the composition of lowest Gibbs energy that conserves the "
      + "atoms of the feed -- no reaction list, no rate.  That is the right "
      + "first model for a reformer because the reforming catalyst brings the "
      + "gas close to equilibrium at the exit of the tubes; how close is the "
      + "subject of the approach-to-equilibrium page, and how the engine finds "
      + "the minimum is the subject of the element-potential page.  The "
      + "duty Q the reactor publishes is the enthalpy of what leaves minus "
      + "the enthalpy of what entered, both on the elements datum, so a "
      + "positive Q is heat the furnace must supply.  Try the three knobs of "
      + "steam reforming below: temperature, pressure and steam-to-carbon "
      + "ratio, and read H2/CO and the duty.",
    formula: String.raw`Q = H_\mathrm{out}(T) - H_\mathrm{in}(T_\mathrm{feed}), \qquad \mathrm{S/C} = \frac{n_{\ce{H2O}}}{n_{\ce{CH4}}}`,
    where: [
      { sym: "Q", means: "the reactor duty: positive is heat supplied to the "
        + "gas, negative is heat removed", unit: "kW" },
      { sym: "H_\\mathrm{out}", means: "the enthalpy flow of the outlet at the "
        + "reactor temperature, elements datum", unit: "kW" },
      { sym: "T", means: "the reactor temperature", unit: "K" },
      { sym: "H_\\mathrm{in}", means: "the enthalpy flow of the feed at its own "
        + "temperature, the same datum", unit: "kW" },
      { sym: "T_\\mathrm{feed}", means: "the feed temperature", unit: "K" },
      { sym: "\\mathrm{S/C}", means: "the steam-to-carbon ratio: moles of steam "
        + "fed per mole of methane carbon", unit: "mol/mol" },
      { sym: "n_{\\ce{H2O}}", means: "the molar flow of steam in the feed",
        unit: "kmol/h" },
      { sym: "n_{\\ce{CH4}}", means: "the molar flow of methane in the feed",
        unit: "kmol/h" },
    ],
    note: "The elements and the allowed species are read from the unit's "
      + "operation block, GibbsReactor.cpp:225-228; the pressure from the same "
      + "block, GibbsReactor.cpp:180; the duty, GibbsReactor.cpp:712.",
    leadsTo: {
      tool: "approach-to-equilibrium",
      toolLabel: "Approach to equilibrium (Gibbs reactor)",
      stepTitle: "how far from equilibrium a reformer leaves",
      body: "A real reformer outlet stops short of the equilibrium this page "
        + "computes; the approach temperature, its sign for an endothermic "
        + "reaction, and why the engine assigns it, are taught there.",
    },
  },
  {
    n: 4,
    title: "Oxygen instead of a furnace",
    body: "The second exercise of this part compares the routes on the same "
      + "methane.  Partial oxidation and autothermal reforming are run "
      + "ADIABATIC: no heat crosses the wall, so the engine is not told the "
      + "temperature but finds it -- the outlet temperature at which the "
      + "enthalpy of the equilibrium gas equals the enthalpy of the feed.  "
      + "That temperature is the whole story of these routes.  Too little "
      + "oxygen and the gas cools before the methane is converted; adding "
      + "steam cools it further while it raises the hydrogen; adding oxygen "
      + "heats it and burns some product.  Notice also what each route gives.  "
      + "By the stoichiometry of its own reaction, steam reforming makes three "
      + "hydrogen per CO, partial oxidation two and CO2 reforming one; the "
      + "equilibrium gas departs from those because the shift of part 4 runs "
      + "inside the reformer too, which is why the steam reformer at S/C 3 "
      + "reads 5.74.",
    formula: String.raw`H_\mathrm{out}(T_\mathrm{ad}) = H_\mathrm{in}(T_\mathrm{feed})`,
    where: [
      { sym: "T_\\mathrm{ad}", means: "the adiabatic outlet temperature, which "
        + "the engine solves for", unit: "K" },
    ],
    note: "The adiabatic mode and its residual: GibbsReactor.cpp:181-184 (the "
      + "mode word) and GibbsReactor.cpp:508 (enthalpy out minus enthalpy in, "
      + "driven to zero by a Newton on T).  An adiabatic reactor publishes no "
      + "duty, so the Q column reads a dash.",
  },

  // ---- Part 2: why hot and at low pressure ----------------------------------------
  {
    n: 5,
    title: "Why a reformer is run hot and at low pressure",
    body: "Two signs read off the reforming reaction decide its conditions.  "
      + "It absorbs heat, so by van 't Hoff its equilibrium constant grows with "
      + "temperature: hotter converts more methane.  And it turns two moles of "
      + "gas into four, so pressure works against it: at a fixed equilibrium "
      + "constant, raising the pressure P multiplies the right-hand side by P "
      + "squared, and the mole fractions of the products must fall to keep "
      + "the equality.  Both statements are visible in one line, the "
      + "equilibrium condition the engine solves, written in mole fractions.  "
      + "Run the reformer at 5 and 25 bar and watch the methane come back; "
      + "then heat it to 1200 K at 25 bar and watch most of it go again.",
    derivation: [
      { step: "Equilibrium of an ideal-gas reaction: the product of the "
        + "partial pressures, each over the standard pressure and raised to "
        + "its stoichiometric coefficient, equals the equilibrium constant.",
        eq: String.raw`K(T) = \prod_i \left(\frac{y_i P}{P^\circ}\right)^{\nu_i}` },
      { step: "For steam reforming the coefficients are -1, -1, +1, +3, so the "
        + "pressure appears to the power of the mole change, 1 + 3 - 1 - 1 = 2.",
        eq: String.raw`K(T) = \frac{y_{\ce{CO}}\, y_{\ce{H2}}^{3}}{y_{\ce{CH4}}\, y_{\ce{H2O}}}\left(\frac{P}{P^\circ}\right)^{2}` },
      { step: "Van 't Hoff: the constant moves with temperature as the "
        + "reaction enthalpy over RT squared.  Reforming absorbs heat, so the "
        + "slope is positive.",
        eq: String.raw`\frac{\mathrm{d}\ln K}{\mathrm{d}T} = \frac{\Delta H^\circ_\mathrm{rxn}}{R\,T^2} > 0` },
    ],
    where: [
      { sym: "K", means: "the equilibrium constant of the reaction, a function "
        + "of temperature only" },
      { sym: "y_i", means: "the mole fraction of species i in the gas" },
      { sym: "P", means: "the total pressure", unit: "bar" },
      { sym: "P^\\circ", means: "the standard pressure", unit: "1 bar" },
      { sym: "\\nu_i", means: "the stoichiometric coefficient of species i, "
        + "negative for a reactant" },
      { sym: "y_{\\ce{CO}}", means: "the mole fraction of CO (and likewise for "
        + "the other species named in the subscripts)" },
      { sym: "y_{\\ce{H2}}", means: "the mole fraction of hydrogen" },
      { sym: "y_{\\ce{CH4}}", means: "the mole fraction of methane" },
      { sym: "y_{\\ce{H2O}}", means: "the mole fraction of steam" },
      { sym: "\\Delta H^\\circ_\\mathrm{rxn}", means: "the standard enthalpy of "
        + "reaction", unit: "J/mol" },
      { sym: "R", means: "the gas constant", unit: "J/(mol K)" },
    ],
    note: "The Gibbs reactor minimises the Gibbs energy rather than writing "
      + "this equation, but at its minimum every reaction among the declared "
      + "species satisfies it (the element-potential page shows why).  The "
      + "equilibrium reactor writes it literally, in logarithms, with the "
      + "pressure term ln P/P0: EquilibriumReactor.cpp:195.",
  },
  {
    n: 6,
    title: "And why industry runs it under pressure anyway",
    body: "If equilibrium were the only consideration a reformer would run at "
      + "atmospheric pressure.  Industrial steam reformers run well above it, "
      + "and the reason is downstream.  Every user of syngas wants it under "
      + "pressure -- in this corpus, the methanol screen feeds its synthesis "
      + "gas at 50 bar and the ammonia route screen feeds its synthesis at 150 "
      + "bar -- and the reforming reaction DOUBLES the number of moles.  "
      + "Compressing a gas costs work in proportion to the moles compressed, "
      + "so it is far cheaper to compress the methane before the reformer "
      + "(the steam is raised from water already pumped as a liquid, which "
      + "costs almost nothing) than to compress four moles of syngas after "
      + "it.  The price is the methane slip the exercise showed, recovered by "
      + "running hotter, with more steam, and -- in ammonia plants -- with a "
      + "secondary reformer that burns part of the gas with air.  That is an "
      + "engineering trade-off, not an equilibrium result, and the engine "
      + "does not make it for you: it computes no compression work on this "
      + "page.",
    formula: String.raw`W_\mathrm{isothermal} = n\,R\,T \ln\frac{P_2}{P_1}`,
    where: [
      { sym: "W_\\mathrm{isothermal}", means: "the least work to compress an "
        + "ideal gas from P1 to P2 at constant temperature", unit: "J" },
      { sym: "n", means: "the moles compressed", unit: "mol" },
      { sym: "P_2", means: "the delivery pressure", unit: "bar" },
      { sym: "P_1", means: "the suction pressure", unit: "bar" },
    ],
    note: "The two declared pressures: screen01_methanol_routes, 0/feedSyngas "
      + "(P 50 bar), and ammoniaRoutes01_screening, 0/feedSynthesis150 (P 150 "
      + "bar).  The isothermal-work formula is the ideal-gas lower bound, "
      + "stated for its proportionality to n; a real compressor needs more.",
  },

  // ---- Part 3: carbon deposition ---------------------------------------------------
  {
    n: 7,
    title: "Too little steam and the catalyst cokes",
    body: "Steam does more than reform the methane: it keeps carbon off the "
      + "catalyst.  Three reactions can lay down solid carbon -- methane "
      + "cracking, the Boudouard reaction, and the reduction of CO by hydrogen "
      + "-- and a reformer short of steam runs into all of them.  Carbon "
      + "blocks the catalyst, can break the pellets, and blocks the tubes.  "
      + "Whether the equilibrium wants carbon is a single test.  The engine "
      + "solves the gas WITHOUT carbon and reads the carbon activity there: "
      + "the ratio of what carbon would cost in the gas to what it costs as "
      + "graphite.  Above one, depositing carbon lowers the Gibbs energy, so "
      + "the solid appears and the gas is re-equilibrated with it; at or "
      + "below one it does not.  The second reformer of the bench runs at a "
      + "steam-to-carbon ratio of 0.8 and cokes; raise the ratio and find "
      + "where the carbon disappears.  Then replace the steam by CO2: dry "
      + "reforming gives the low ratio a hydroformylation plant wants, and "
      + "cokes even harder.",
    formula: String.raw`\begin{aligned}
&\ce{CH4 <=> C + 2 H2},\qquad \ce{2 CO <=> C + CO2},\qquad \ce{CO + H2 <=> C + H2O}\\[4pt]
&\ln a_{\ce{C}} = \sum_k \pi_k A_{k,\ce{C}} - \frac{g_{\ce{C}}(T)}{R\,T}, \qquad a_{\ce{C}} = K_\mathrm{crack}\,\frac{p_{\ce{CH4}}}{p_{\ce{H2}}^{2}}
\end{aligned}`,
    where: [
      { sym: "a_{\\ce{C}}", means: "the activity of carbon in the gas: one at "
        + "equilibrium with graphite, above one when graphite would form" },
      { sym: "\\pi_k", means: "the element potential of element k at the "
        + "carbon-free equilibrium, per RT" },
      { sym: "A_{k,\\ce{C}}", means: "the number of atoms of element k in one "
        + "carbon atom (one for C, zero for H and O)" },
      { sym: "g_{\\ce{C}}", means: "the molar Gibbs energy of pure graphite on "
        + "the elements datum", unit: "J/mol" },
      { sym: "K_\\mathrm{crack}", means: "the equilibrium constant of methane "
        + "cracking at the reactor temperature" },
      { sym: "p_{\\ce{CH4}}", means: "the partial pressure of methane",
        unit: "bar" },
      { sym: "p_{\\ce{H2}}", means: "the partial pressure of hydrogen",
        unit: "bar" },
    ],
    note: "The activity as the engine reads it off the solid-free answer: "
      + "GibbsSolidPhase.cpp:102-107; the solid appears when its logarithm is "
      + "positive, GibbsSolidPhase.cpp:231.  The form with partial pressures "
      + "is the same test written for the cracking reaction alone, as the "
      + "witness case gibbs11_carbon_deposition states in its header.  "
      + "Equilibrium carbon is graphite; the filamentary carbon that grows on "
      + "a real nickel catalyst is not modelled.",
  },

  // ---- Part 4: the shift -----------------------------------------------------------
  {
    n: 8,
    title: "The water-gas shift: the ratio knob",
    body: "A syngas with the wrong ratio is not thrown away: its ratio is "
      + "adjusted, and the tool for that is the water-gas shift.  Carbon "
      + "monoxide and steam become CO2 and hydrogen -- each mole of CO "
      + "shifted is one more mole of hydrogen.  The shift releases heat, so "
      + "by van 't Hoff its constant falls with temperature: the colder the "
      + "reactor, the further it goes.  And it does not change the number of "
      + "moles, so pressure drops out of the equilibrium entirely.  The "
      + "bench below takes the reformer's own gas and shifts it in two stages, "
      + "a high-temperature one and a low-temperature one, and reports the CO "
      + "left after each.",
    formula: String.raw`\ce{CO + H2O <=> CO2 + H2}, \qquad K_\mathrm{shift}(T) = \frac{y_{\ce{CO2}}\, y_{\ce{H2}}}{y_{\ce{CO}}\, y_{\ce{H2O}}}\left(\frac{P}{P^\circ}\right)^{0}`,
    where: [
      { sym: "K_\\mathrm{shift}", means: "the equilibrium constant of the shift "
        + "at the reactor temperature, published by the engine as Kp_wgs" },
      { sym: "y_{\\ce{CO2}}", means: "the mole fraction of CO2" },
    ],
    note: "The shift reactors are equilibrium reactors told ONE reaction, "
      + "reactions ( wgs ); (EquilibriumReactor.cpp:100), so they cannot make "
      + "methane: which pathways a catalyst allows is the declared-pathways "
      + "page.  The constant is computed from the standard Gibbs energy of "
      + "reaction at the reactor temperature, EquilibriumReactor.cpp:116; the "
      + "pressure is read from the feed, EquilibriumReactor.cpp:58.",
    leadsTo: {
      tool: "declared-pathways",
      toolLabel: "Declared pathways (equilibrium over the reactions you allow)",
      stepTitle: "why the shift reactor may not make methane",
      body: "Told every species, a Gibbs reactor at the low-temperature-shift "
        + "temperature would turn this gas into methane; the shift is the "
        + "equilibrium over the ONE reaction its catalyst allows.  That "
        + "distinction is taught there.",
    },
  },
  {
    n: 9,
    title: "Why two stages, when equilibrium needs only one",
    body: "Run the exercise's second move: a single stage at 480 K gives "
      + "EXACTLY the outlet of the two stages, to the last digit.  Equilibrium "
      + "does not know the path -- only the final temperature.  So the two "
      + "stages are not there for thermodynamics.  They are there for RATE "
      + "and HEAT, which this model does not compute.  The shift is slow at "
      + "low temperature, where it would go furthest, and fast at high "
      + "temperature, where it stops early; so a robust catalyst does most of "
      + "the work hot and fast, and a more active one finishes the job cold.  "
      + "And the shift releases heat: in a real adiabatic bed the gas warms as "
      + "it reacts and the equilibrium retreats, so the gas is cooled between "
      + "the stages.  Here each stage is held at its temperature, and the "
      + "heat that holding costs is the negative duty each one publishes.",
    note: "The equilibrium reactor is isothermal: its temperature defaults to "
      + "the feed's and is otherwise the declared one, "
      + "EquilibriumReactor.cpp:59; its duty, EquilibriumReactor.cpp:922.",
  },

  // ---- Part 5: each destination asks its own ratio ---------------------------------
  {
    n: 10,
    title: "Each product asks its own ratio",
    body: "A synthesis consumes CO, CO2 and hydrogen in fixed proportions, "
      + "and the syngas fed to it should match them, because whatever is in "
      + "excess accumulates in the recycle loop and has to be purged.  "
      + "Methanol is made from CO and from CO2; counting both is exactly what "
      + "the module does, and a methanol syngas wants a module of about two.  "
      + "Fischer-Tropsch grows hydrocarbon chains from CO alone and wants H2/CO "
      + "of about two.  Hydroformylation adds one CO and one H2 across a double "
      + "bond and wants a ratio of about one.  Ammonia wants no carbon at all: "
      + "the CO is shifted to CO2 and hydrogen, the CO2 is removed, the last "
      + "traces of carbon oxides are turned back into methane (a poison "
      + "becomes an inert), and nitrogen is added -- from air in a secondary "
      + "reformer, or from an air separation unit -- to three hydrogen per "
      + "nitrogen.",
    formula: String.raw`\begin{aligned}
&\ce{CO + 2 H2 -> CH3OH},\quad \ce{CO2 + 3 H2 -> CH3OH + H2O} &&M \approx 2\\
&\ce{$n$ CO + 2$n$ H2 -> (CH2)_{$n$} + $n$ H2O} &&r \approx 2\\
&\ce{C3H6 + CO + H2 -> C3H7CHO} &&r \approx 1\\
&\ce{CO + 3 H2 -> CH4 + H2O},\quad \ce{N2 + 3 H2 -> 2 NH3} &&\text{no carbon; } \ce{N2}:\ce{H2} = 1:3
\end{aligned}`,
    note: "Each equation is balanced in every element.  The targets are "
      + "stoichiometric, read off the equations; a plant runs near them, not "
      + "at them, and by how much is a design choice this page does not make.",
  },
  {
    n: 11,
    title: "The module is fixed by the atoms of the feed",
    body: "Here is the result that explains why each feedstock suits some "
      + "products and not others.  Write the element balances of a reformer "
      + "fed methane, CO2, oxygen, steam and hydrogen, and solve for the "
      + "module: the steam CANCELS.  The shift moves H2/CO but cannot move the "
      + "module either -- it adds one hydrogen and one CO2 to the numerator "
      + "and swaps one CO for one CO2 in the denominator.  So once the methane "
      + "is converted, the module of any of these gases is fixed by what was "
      + "FED, not by the temperature, the pressure or the shift: three for "
      + "steam reforming whatever its conditions, two for partial oxidation "
      + "at half a mole of oxygen per carbon, less than two for autothermal "
      + "reforming.  Natural gas, four hydrogen per carbon, gives a "
      + "hydrogen-rich gas; coal, with far less hydrogen than carbon, gives a "
      + "gas much poorer in hydrogen.  Too much hydrogen for "
      + "methanol is corrected by adding CO2; too little, by shifting and "
      + "REMOVING CO2 -- removal is the one operation here that moves the "
      + "module.  The engine confirms the identity: the module of the steam "
      + "reformer reads 3.000 on every guided move of parts 1, 2 and 4, "
      + "whatever the temperature, the pressure, the steam or the shift.",
    derivation: [
      { step: "Element balances over the reactor, all methane converted, no "
        + "carbon deposited (C, then O, then H):",
        eq: String.raw`\begin{aligned}
a + c &= n_{\ce{CO}} + n_{\ce{CO2}}\\
2c + 2o + w &= n_{\ce{CO}} + 2\,n_{\ce{CO2}} + n_{\ce{H2O}}\\
4a + 2w + 2h &= 2\,n_{\ce{H2O}} + 2\,n_{\ce{H2}}
\end{aligned}` },
      { step: "Eliminate the water between the O and H balances, then use the C "
        + "balance:",
        eq: String.raw`n_{\ce{H2}} - n_{\ce{CO2}} = 3a + h - c - 2o` },
      { step: "Divide by the carbon oxides: the steam w is gone.",
        eq: String.raw`M = \frac{3a + h - c - 2o}{a + c}` },
    ],
    where: [
      { sym: "a", means: "methane fed", unit: "kmol/h" },
      { sym: "c", means: "CO2 fed", unit: "kmol/h" },
      { sym: "o", means: "oxygen (O2) fed", unit: "kmol/h" },
      { sym: "w", means: "steam fed", unit: "kmol/h" },
      { sym: "h", means: "hydrogen fed", unit: "kmol/h" },
    ],
    note: "This is algebra on the atoms, not a model.  With methane left "
      + "unconverted the numerator loses three times the slip and the "
      + "denominator once; with carbon deposited the denominator loses the "
      + "carbon -- the coking reformer of part 3 reads a module above three "
      + "for that reason.",
  },

  // ---- Part 6: cleaning the gas ----------------------------------------------------
  {
    n: 12,
    title: "Cleaning the gas: sulfur, CO2 and the last impurities",
    body: "Raw syngas is not fed to a synthesis catalyst as it comes.  Sulfur "
      + "is removed from the natural gas BEFORE the reformer, because it "
      + "poisons the nickel.  CO2 is removed after the shift by absorption: "
      + "in a solvent that reacts with it (an amine) or that simply dissolves "
      + "more of it under pressure (a physical solvent), regenerated by "
      + "heating or by letting the pressure down.  And where pure hydrogen is "
      + "wanted -- a refinery, a fuel cell -- the shifted gas goes to a "
      + "pressure-swing adsorber: beds of adsorbent take up CO2, methane, CO "
      + "and nitrogen at high pressure and let hydrogen, which hardly "
      + "adsorbs, pass through as product; each bed is then blown down to a "
      + "low pressure, releasing what it held as the tail gas.  The heavier "
      + "the impurity, the more strongly it is held, which is why the "
      + "adsorber removes CO2 first and nitrogen last.",
    formula: String.raw`\Delta q_i = \eta\,\bigl(q_i(P_\mathrm{high}) - q_i(P_\mathrm{low})\bigr), \qquad S_i = \min(\Delta q_i\, w\, F,\; z_i F)`,
    where: [
      { sym: "\\Delta q_i", means: "the working capacity of the adsorbent for "
        + "species i: what a bed holds at the high pressure and gives up at "
        + "the low", unit: "mol/kg" },
      { sym: "\\eta", means: "the utilisation of the equilibrium capacity (the "
        + "case declares 0.80)" },
      { sym: "q_i", means: "the competitive Langmuir loading of species i at "
        + "the feed composition", unit: "mol/kg" },
      { sym: "P_\\mathrm{high}", means: "the adsorption pressure", unit: "bar" },
      { sym: "P_\\mathrm{low}", means: "the regeneration (blowdown) pressure",
        unit: "bar" },
      { sym: "S_i", means: "the flow of species i captured to the tail gas",
        unit: "kmol/s" },
      { sym: "w", means: "the declared bed capacity: kilograms of adsorbent "
        + "per mole of feed throughput", unit: "kg/mol" },
      { sym: "F", means: "the feed flow", unit: "kmol/s" },
      { sym: "z_i", means: "the feed mole fraction of species i" },
    ],
    note: "The working capacity: PSA.cpp:196; the capture, limited by what "
      + "the feed brings: PSA.cpp:205-206.  CO2 removal by a solvent and "
      + "sulfur removal are told here, not run: no case in the corpus carries "
      + "either.",
  },
  {
    n: 13,
    title: "What the PSA exercise shows, and what it cannot",
    body: "Raise the regeneration pressure and the purity falls: a bed blown "
      + "down to a higher pressure gives up less, so it holds less on the "
      + "next cycle, and methane and CO break into the product.  Now change "
      + "the purge -- a fraction of the product sent back through the bed to "
      + "sweep it clean -- and see what this model does with it: the recovery "
      + "moves and the purity does not.  In this equilibrium shortcut the "
      + "purge leaves at the product's own composition, so it can only cost "
      + "hydrogen; what a purge buys in a real cycle, a cleaner bed end and "
      + "so a purer product, is not modelled.  The model is honest about it "
      + "rather than right about it, and the difference is the lesson.",
    formula: String.raw`G = \gamma F, \qquad \text{purity} = \frac{n_{\ce{H2},\mathrm{R}}}{\sum_i n_{i,\mathrm{R}}}, \qquad \text{recovery} = \frac{n_{\ce{H2},\mathrm{R}}}{z_{\ce{H2}} F}`,
    where: [
      { sym: "G", means: "the purge flow", unit: "kmol/s" },
      { sym: "\\gamma", means: "the declared purge ratio" },
      { sym: "n_{\\ce{H2},\\mathrm{R}}", means: "hydrogen in the product "
        + "(raffinate)", unit: "kmol/s" },
      { sym: "n_{i,\\mathrm{R}}", means: "species i in the product", unit: "kmol/s" },
      { sym: "z_{\\ce{H2}}", means: "the hydrogen mole fraction of the feed" },
    ],
    note: "The purge: PSA.cpp:225; it leaves at the product composition, "
      + "PSA.cpp:248; purity and recovery as published: PSA.cpp:314-315.",
  },

  // ---- Part 7: the historical family and the future --------------------------------
  {
    n: 14,
    title: "Water gas, producer gas, town gas",
    body: "Syngas is older than the word.  WATER GAS was made by blowing steam "
      + "through a bed of white-hot coke: carbon and steam give CO and "
      + "hydrogen, and because the reaction absorbs heat the bed cooled and "
      + "had to be reheated by blowing air through it, in alternating blows.  "
      + "PRODUCER GAS was made by blowing air through coke continuously: CO "
      + "diluted by all the nitrogen of the air, a weak fuel gas for furnaces "
      + "and engines.  TOWN GAS, the gas piped to cities for lighting and "
      + "cooking before natural gas replaced it, was mostly gas driven out of "
      + "coal by heating it without air -- rich in hydrogen and methane -- "
      + "often blended with water gas; its carbon monoxide made it poisonous.  "
      + "The same chemistry later became the feedstock of synthetic fuels "
      + "made from coal by Fischer-Tropsch synthesis.",
    formula: String.raw`\ce{C + H2O -> CO + H2}\ \text{(water gas)}, \qquad \ce{2 C + O2 + $x$ N2 -> 2 CO + $x$ N2}\ \text{(producer gas)}`,
    where: [
      { sym: "x", means: "the moles of nitrogen that come into the bed with "
        + "each mole of oxygen of the air blown through it" },
    ],
    note: "Told as history; nothing in this step is run.",
  },
  {
    n: 15,
    title: "The future: CO2 and green hydrogen",
    body: "The newest member of the family has no fossil carbon in it.  "
      + "Hydrogen made by electrolysing water with renewable electricity, and "
      + "CO2 captured from a process or the air, are the two halves of a "
      + "syngas.  For methanol nothing more is needed: one CO2 and three "
      + "hydrogen already have a module of exactly two, and CO2 hydrogenation "
      + "makes methanol directly.  For Fischer-Tropsch fuels the CO2 must "
      + "first become CO, and that is the shift run BACKWARDS -- the reverse "
      + "water-gas shift, which absorbs heat and is therefore run hot.  The "
      + "exercise feeds CO2 and hydrogen to the equilibrium reactor of part 4, "
      + "allowed the shift alone, at 1100 K: the module reads 2.000, as the "
      + "identity of step 11 says it must, and H2/CO is 2.98.  Feed less "
      + "hydrogen per CO2 and H2/CO comes toward two (and the module, by the "
      + "same identity, falls below it); cool the reactor and it makes less "
      + "CO.  Green ammonia is the simplest of all: electrolytic hydrogen and "
      + "nitrogen from air, no carbon to remove.",
    formula: String.raw`\ce{2 H2O -> 2 H2 + O2}, \qquad \ce{CO2 + H2 <=> CO + H2O}`,
    note: "The same reactor and the same reaction (wgs) as the shift; at "
      + "1100 K its constant is near one and the extent comes out negative -- "
      + "the engine solves for extents of either sign "
      + "(EquilibriumReactor.cpp:195).",
    leadsTo: {
      tool: "route-screening",
      toolLabel: "Route screening",
      stepTitle: "three routes to methanol, compared on paper",
      body: "CO2 hydrogenation against syngas against direct oxidation, on "
        + "the same host case this page borrows its partial-oxidation feed "
        + "from, with the heat, equilibrium and atom-economy filters.",
    },
  },
  {
    n: 16,
    title: "Now read a real one",
    body: "Everything on this page is a reactor on its own.  The corpus also "
      + "carries the step in which syngas becomes a product inside a loop: the "
      + "limiting-reactant page follows hydrogen and nitrogen around an "
      + "ammonia synthesis loop with its purge, which is where the ratio "
      + "rules of part 5 cost money when they are broken.  Open the four host "
      + "cases themselves, read their headers, and change one number at a "
      + "time on your own copy.",
    leadsTo: {
      tool: "limiting-reactant",
      toolLabel: "Limiting reactant and feed ratio in a recycle loop",
      stepTitle: "the two ratios of a loop",
      body: "Why the reactor-inlet ratio of a recycle loop differs from the "
        + "fresh-feed ratio, and how a small error in the syngas you feed is "
        + "amplified by the purge.",
    },
  },
];

/** What this page, and the engine under it, does not do. */
export const SYNGAS_LIMITS: readonly LessonLimit[] = [
  { id: "kinetics", title: "No kinetics: equilibrium only",
    body: "Every reactor here reaches equilibrium.  How fast a reforming or "
      + "shift catalyst gets there, how close a real outlet comes, and why "
      + "two shift stages beat one are rate questions the page answers in "
      + "words and the engine does not compute." },
  { id: "deactivation", title: "No catalyst deactivation",
    body: "Sulfur poisoning, sintering and the slow loss of activity of a "
      + "real catalyst are not modelled.  Carbon is predicted as equilibrium "
      + "graphite, which says whether the gas WANTS to deposit carbon; the "
      + "filamentary carbon that grows on nickel, and the rate at which it "
      + "grows, are not." },
  { id: "tubes", title: "No reformer tubes, no furnace",
    body: "The duty Q is a number at the reactor boundary.  Heat transfer "
      + "through the tube wall, the tube-wall temperature that limits a real "
      + "reformer, the furnace firing and the pressure drop are not "
      + "computed." },
  { id: "gasifier", title: "No gasifier",
    body: "A coal or biomass feed is a solid, and no reactor in Choupo carries "
      + "a solid feed into its equilibrium.  Char, tar, ash and slag, the "
      + "devolatilisation of the fuel and the behaviour of a real gasifier "
      + "are not modelled." },
  { id: "ideal", title: "An ideal gas at every pressure",
    body: "The benches use ideal-gas thermodynamics, and no fugacity "
      + "correction is applied.  How large that correction is at tens of "
      + "bar depends on the composition and the temperature — modest for "
      + "hot hydrogen and carbon monoxide, larger for a cooler gas rich in "
      + "steam, carbon dioxide or methane — and it has not been measured "
      + "against an equation of state on these benches." },
  { id: "cleaning", title: "No CO2 absorber, no sulfur guard bed",
    body: "CO2 removal by a solvent and sulfur removal are described, not "
      + "run.  The PSA is an equilibrium shortcut: no breakthrough, no cycle "
      + "schedule, no thermal swing, and a purge that can only cost "
      + "product." },
  { id: "loop", title: "No synthesis loop",
    body: "The destinations of part 5 are stoichiometry.  No methanol, "
      + "Fischer-Tropsch or oxo reactor is run on this page, and nothing here "
      + "decides by how much a plant should depart from the stoichiometric "
      + "ratio." },
];
