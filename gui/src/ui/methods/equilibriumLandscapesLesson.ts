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
  What the equilibrium model with an approach temperature can reach, as DATA.

  WHY THIS PAGE EXISTS.  The companion page `approach-to-equilibrium` teaches
  the PARAMETER: one reactor, one number, the sign the engine assigns.  This
  page is the SURVEY that was commissioned the day after (2026-09-27): the
  same Gibbs kernel over five reaction systems the corpus already solves, the
  whole conversion-versus-temperature curve at three pressures, and what a
  declared approach does to each curve -- where it moves the answer, where it
  cannot, and the one case where the single number points the wrong way for
  a product riding inside the feed's overall transformation.  It closes on
  the contrast the architect named: ammonia at ambient conditions is
  thermodynamically favourable and the engine shows it; the price of the
  rate is what differs between an enzyme and a converter.

  WHAT IS NOT REPEATED HERE.  What a Gibbs reactor IS, why it turns up early
  in a design, the enthalpy-at-T separation and the three caveats are the
  companion page's and are pointed at, not restated.

  EVERY ENGINE CLAIM CARRIES A file:line, verified by reading the source, not
  by reading the companion page.  That is a drafting discipline, not a gate:
  `check_lesson_symbols` holds the `where` glosses and nothing parses a
  citation out of a lesson.  NO NUMBER IN THIS PROSE WAS TYPED FROM A RUN:
  every value the page shows is read from the witness run in the browser,
  and the witness headers carry the measured values with the run that
  produced them.
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "./lessonStep.js";
export type { LessonStep, LessonLimit };

export const LANDSCAPE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One kernel, five chemistries: what a landscape is",
    body: "Every curve on this page is the same computation the Gibbs reactor "
      + "performs, repeated.  The `gibbsMap` property operation takes a species "
      + "list with its atom counts, a feed, a temperature grid and a pressure "
      + "grid, and at every (T, P) cell minimises the mixture's Gibbs energy "
      + "subject to the element balances -- the element-potential kernel "
      + "(GibbsMapOp.cpp:231–269, the sweep; ElementPotential.cpp:47–48, the "
      + "standard-state term).  It writes one row per cell to a CSV with the "
      + "signed approach it used, a converged flag, the metric and every "
      + "species' gas mole fraction (GibbsMapOp.cpp:220 and 242–244), and the page "
      + "reads that file.  The METRIC is one of two the design forum allowed: "
      + "a product's mole fraction, or an ELEMENT YIELD -- the atoms of one "
      + "element that leave in one product, divided by the atoms of that "
      + "element fed (GibbsMapOp.cpp:168–213).  A species \"conversion\" is "
      + "refused by name where the species is also produced, because water in "
      + "a reformer would convert negatively.  So the shift landscape here is "
      + "the carbon in CO₂, which IS the CO conversion because every carbon "
      + "atom fed arrives as CO; and the reforming landscape is the carbon "
      + "still in CH₄, which is one minus the methane conversion and is drawn "
      + "as the engine wrote it rather than subtracted.  Five systems are "
      + "drawn, each a bundled witness case under tutorials/props/gibbs/, "
      + "each carrying the species list and feed of the steady case it comes "
      + "from: ammonia synthesis (gibbs10's feed), the water–gas shift "
      + "(gibbs01's), methane steam reforming (gibbs02's), methane combustion "
      + "(gibbs03's) and thermal NO (gibbs06_thermal_nox's).",
    formula: String.raw`Y_E = \frac{a_{E,p}\, n_p}{b_E}
\qquad\qquad y_p = \frac{n_p}{\sum_i n_i^{\mathrm{gas}}}`,
    where: [
      { sym: "Y_E", means: "the element yield: the fraction of the atoms of "
        + "element E that were fed and leave in the chosen product p.  For "
        + "the shift, with E = C and p = CO₂, it is the CO conversion",
        unit: "—" },
      { sym: "a_{E,p}", means: "the atom count of element E in one molecule "
        + "of product p -- the entry of the atom matrix the case declares in "
        + "its `atoms ( ... )` list", unit: "atoms per molecule" },
      { sym: "n_p", means: "the equilibrium molar amount of product p in the "
        + "GAS phase at that cell (GibbsMapOp.cpp:204–213 reads the gas "
        + "amounts; a condensed liquid is not in it), or, for a product whose "
        + "record declares a pure solid, its deposit", unit: "mol" },
      { sym: "b_E", means: "the atoms of element E in the feed, computed from "
        + "the feed and the atom matrix, never declared "
        + "(GibbsMapOp.cpp:107–110)", unit: "mol of atoms" },
      { sym: "y_p", means: "the other permitted metric: the gas-phase mole "
        + "fraction of product p at the cell", unit: "—" },
      { sym: "n_i^{\\mathrm{gas}}", means: "the equilibrium molar amount of "
        + "species i in the gas phase; the sum runs over every declared "
        + "species", unit: "mol" },
    ],
    note: "THE SPECIES LIST IS THE ONLY KINETIC STATEMENT, on this page as on "
      + "the companion one.  The combustion landscape has no NO in it and the "
      + "thermal-NO landscape has the same feed with NO added: the difference "
      + "between the two curves you can select is one line in a dictionary, "
      + "and nothing in the minimisation knows which of them is the truer "
      + "flame.  A species that is not listed cannot form, however "
      + "favourable; a species that is listed will form wherever the "
      + "minimisation finds it lower.  THERE IS A SECOND LEVEL, and it has "
      + "its own page, the EduTool `declared-pathways`: "
      + "`equilibriumReactor` takes a DECLARED reaction list from "
      + "constant/reactions and drives only those to equilibrium "
      + "(EquilibriumReactor.cpp:93–116; witnesses `equil01_reforming`, "
      + "`reactions ( smr wgs )`, and `equil02_methanol_declared_pathways`), "
      + "so an empirical exclusion — a reaction known to be kinetically "
      + "irrelevant, left off the list — can be declared.  It reads the "
      + "approach temperature PER REACTION since 2026-09-27 and runs "
      + "isothermally only.",
  },
  {
    n: 2,
    title: "Read the shape before the number: thermicity and mole change decide the two axes",
    body: "Two derivatives fix the whole shape of an ideal-gas equilibrium "
      + "landscape, and both are signs you can read off the reaction before "
      + "the engine runs.  Van 't Hoff: the equilibrium constant falls with "
      + "temperature for an exothermic reaction and rises for an endothermic "
      + "one.  The mole change: for an ideal gas the constant in mole "
      + "fractions carries the pressure to the power of minus the change in "
      + "moles, so a reaction that makes fewer moles is helped by pressure, "
      + "one that makes more is hurt, and one that conserves them does not "
      + "see the pressure at all.  The five witnesses were chosen to cover "
      + "the table.  Ammonia is exothermic and mole-reducing: the curve falls "
      + "with T and the 100 bar curve sits above the 1 bar one.  The shift "
      + "is exothermic and mole-conserving: the three pressures give the "
      + "SAME curve, and the witness header records that the three columns "
      + "of its own CSV agree to every printed digit.  Reforming is "
      + "endothermic and mole-increasing: the methane left rises with "
      + "pressure and falls with temperature, which is why the reformer runs "
      + "hot and why its pressure is a compromise paid for downstream.  "
      + "Combustion is exothermic and complete until the flame is hot enough "
      + "for CO₂ to dissociate, and the dissociation makes moles, so pressure "
      + "holds the CO₂ together.  Thermal NO is endothermic and "
      + "mole-conserving, a rising curve that the pressure barely moves.",
    formula: String.raw`\left(\frac{\partial \ln K}{\partial T}\right)_P = \frac{\Delta H_\mathrm{rxn}}{R\,T^{2}}
\qquad\qquad K_y = K \left(\frac{P}{P^\circ}\right)^{-\Delta\nu}`,
    where: [
      { sym: "K", means: "the equilibrium constant of the reaction in "
        + "activities; for the ideal gas the kernel assumes, in partial "
        + "pressures over the standard pressure.  The Gibbs reactor never "
        + "forms one -- it minimises G -- but K is the shortest route to the "
        + "two signs", unit: "—" },
      { sym: "T", means: "the temperature of the cell, the abscissa of every "
        + "curve on this page", unit: "K" },
      { sym: "P", means: "the pressure of the cell; each curve is one "
        + "pressure of the witness's grid", unit: "Pa" },
      { sym: "\\Delta H_\\mathrm{rxn}", means: "the enthalpy change of the "
        + "reaction, negative when it releases heat -- the sign that decides "
        + "whether the curve falls or rises with T", unit: "J/mol" },
      { sym: "R", means: "the gas constant.  Not the heat-removal rate of the "
        + "ignition page, not the reflux ratio of the distillation pages",
        unit: "J/(mol·K)" },
      { sym: "K_y", means: "the equilibrium constant written in mole "
        + "fractions -- the quantity a landscape draws", unit: "—" },
      { sym: "P^\\circ", means: "the standard pressure the constant K refers "
        + "to", unit: "Pa" },
      { sym: "\\Delta\\nu", means: "the change in the number of gas moles "
        + "across the reaction as written: negative for ammonia synthesis, "
        + "zero for the shift and for NO formation, positive for reforming",
        unit: "—" },
    ],
    note: "ONE THING ON THE AMMONIA CURVE IS NOT CHEMISTRY.  The kernel checks "
      + "every condensable species against its vapour pressure at the "
      + "PHYSICAL temperature and, where one is supersaturated, condenses it "
      + "and reports the gas that remains (ElementPotential.cpp:54–65, the "
      + "two-phase branch below it).  On the ammonia witness that happens on "
      + "the 100 bar curve at its cold end: the reported mole fraction there "
      + "is ammonia's vapour pressure divided by the pressure, rising with T "
      + "until the dew point, and only above it does the curve become the "
      + "equilibrium.  The witness header records the two cells that bracket "
      + "it.  A reader who takes the cold end of that curve for a conversion "
      + "is reading a vapour pressure.",
  },
  {
    n: 3,
    title: "The approach moves the curve sideways, and the engine decides which way at every cell",
    body: "Declare a magnitude and the map re-evaluates the chemistry at a "
      + "shifted temperature while everything physical stays at T -- the "
      + "companion page's separation, unchanged.  What the map adds is that "
      + "the DIRECTION is decided per cell: `temperatureApproach` is refused "
      + "if negative (GibbsMapOp.cpp:135–144), and at every (T, P) the op "
      + "calls the one home of the sign rule, `GibbsReactor::"
      + "approachDirection` (GibbsMapOp.cpp:159–165; GibbsReactor.cpp:67–161), "
      + "which solves the true equilibrium from the feed at that cell's T, "
      + "reads the isothermal enthalpy change over that transformation, and "
      + "returns +1 for exothermic and −1 for endothermic (GibbsReactor.cpp:"
      + "106–107).  The CSV carries the SIGNED value each cell was solved with "
      + "in its `deltaT_K` column, and the run publishes a tally -- how many "
      + "solves went exothermic, how many endothermic, how many were "
      + "undetermined and took the announced default -- as diagnostics "
      + "(GibbsMapOp.cpp:319–343).  The readout beneath the plot draws that "
      + "tally, so when you move the slider you see the engine's decision and "
      + "not this page's.  Across the five witnesses the tally reads the way "
      + "step 2 predicts: ammonia, the shift, combustion and the NO feed are "
      + "exothermic at every cell and take T + |ΔT|; reforming is endothermic "
      + "at every cell and takes T − |ΔT|.  The map also says when it CROSSES "
      + "a thermicity boundary, because then no single signed number "
      + "describes the run and only the column does.",
    formula: String.raw`X_\mathrm{reported}(T,P) = X_\mathrm{eq}\!\left(T + s\,|\Delta T|,\; P\right),
\qquad s = -\operatorname{sgn}\!\left(\Delta H_\mathrm{rxn}\right)`,
    where: [
      { sym: "X_\\mathrm{reported}", means: "what the model reports at the "
        + "physical (T, P) once an approach is declared: the metric of the "
        + "equilibrium at the shifted temperature", unit: "— (the metric)" },
      { sym: "X_\\mathrm{eq}", means: "the true equilibrium metric as a "
        + "function of temperature and pressure -- the curve drawn at "
        + "|ΔT| = 0", unit: "— (the metric)" },
      { sym: "s", means: "the sign the ENGINE assigns at that cell: +1 when "
        + "the overall transformation from the feed is exothermic, −1 when "
        + "endothermic.  Never declared", unit: "—" },
      { sym: "|\\Delta T|", means: "the declared MAGNITUDE of the approach, "
        + "the slider on this page", unit: "K" },
      { sym: "\\operatorname{sgn}", means: "the sign function: +1 for a "
        + "positive argument, −1 for a negative one", unit: "—" },
    ],
    note: "WHY IT IS DECIDED PER CELL AND NOT PER MAP.  The thermicity the "
      + "engine reads is that of the transformation FROM THIS FEED to the "
      + "equilibrium AT THIS T, and a feed on the reactant side of an "
      + "exothermic equilibrium stays exothermic at every temperature -- so "
      + "on four of the five witnesses the tally is unanimous.  It need not "
      + "be: a feed that is already past the hot equilibrium runs the "
      + "transformation backward at the hot cells, and a map that spans both "
      + "regimes crosses the boundary.  The tally is published so that a "
      + "reader can see whether the run was one signed number or two.",
  },
  {
    n: 4,
    title: "Where |ΔT| matters and where it is indifferent: the local slope",
    body: "A temperature approach is a HORIZONTAL move along the equilibrium "
      + "curve.  How much it changes the answer is therefore the slope of the "
      + "curve where you are, times the distance you moved -- to first order, "
      + "and the plot shows the exact difference rather than the estimate.  "
      + "So the same declared magnitude is a large shortfall on a steep "
      + "curve and nothing at all on a flat one.  Select ammonia at 1 bar and "
      + "the shifted curve parts from the equilibrium one across the whole "
      + "middle of the grid, where the mole fraction is falling fastest; at "
      + "the hot end both curves lie on the axis and the approach changes a "
      + "number nobody could read.  Select combustion and the two curves "
      + "coincide over the entire plateau, because there is no slope to "
      + "multiply: a bed that falls short of complete conversion by an "
      + "equilibrium argument falls short by nothing, and any real shortfall "
      + "there is kinetics or mixing, which no ΔT can express.  The readout "
      + "names, for each pressure, the temperature at which the shifted "
      + "curve is farthest from the equilibrium one -- the only arithmetic "
      + "this page performs beyond drawing, and it is a comparison of two "
      + "engine numbers.",
    formula: String.raw`X_\mathrm{eq}(T + s|\Delta T|) - X_\mathrm{eq}(T)
\;\approx\; s\,|\Delta T|\,\frac{\partial X_\mathrm{eq}}{\partial T}`,
    where: [
      { sym: "\\frac{\\partial X_\\mathrm{eq}}{\\partial T}", means: "the "
        + "local slope of the equilibrium curve at constant pressure -- a "
        + "property of the curve, not of the approach, and the reason one "
        + "magnitude means different things on different systems",
        unit: "1/K" },
    ],
    note: "THIS IS ALSO WHY THE TWO DEFINITIONS OF \"APPROACH\" ARE NOT "
      + "INTERCHANGEABLE, which the companion page states and this page "
      + "lets you see: a temperature approach is a horizontal distance, a "
      + "fractional approach is a vertical one, and the local slope is the "
      + "exchange rate between them.  It is different at every point of every "
      + "curve on this page.",
  },
  {
    n: 5,
    title: "The GLOBAL caveat, drawn: thermal NO inside a flame",
    body: "The engine prints, on every run that declares an approach, that "
      + "the parameter is GLOBAL and cannot resolve per-reaction approaches "
      + "(GibbsReactor.cpp:369–368; the map's own line at GibbsMapOp.cpp:"
      + "149–157).  The thermal-NO witness makes the sentence into a curve.  "
      + "NO formation from N₂ and O₂ is endothermic: its equilibrium mole "
      + "fraction RISES with temperature over many decades, which is why the page draws it on a log axis.  "
      + "But it rides inside a feed -- methane in air -- whose overall "
      + "transformation is combustion, which is exothermic, and the "
      + "direction is read from the overall transformation "
      + "(GibbsReactor.cpp:155–160 says so in the announcement itself: the "
      + "reading is GLOBAL, a reaction of the other thermicity riding inside "
      + "it is not resolved).  So every cell takes T + |ΔT|.  For the "
      + "combustion that is the conservative direction.  For the NO riding "
      + "inside it, T + |ΔT| sits HIGHER on a rising curve: the model with an "
      + "approach declared reports MORE NO than the true equilibrium at the "
      + "physical temperature -- an outlet beyond equilibrium, for the minor "
      + "product, from a parameter whose whole purpose is to fall short.  "
      + "Move the slider on that witness and watch the dashed curve sit "
      + "above the solid one.",
    formula: String.raw`\ce{N2 + O2 <=> 2 NO}\quad (\Delta H_\mathrm{rxn} > 0)
\qquad\text{inside}\qquad
\ce{CH4 + 2 O2 -> CO2 + 2 H2O}\quad (\Delta H_\mathrm{rxn} < 0)`,
    where: [
      { sym: "\\Delta H_\\mathrm{rxn}", means: "the enthalpy change of each "
        + "reaction as written; the engine reads only the OVERALL one, from "
        + "the feed to the equilibrium, and it is dominated by the "
        + "combustion", unit: "J/mol" },
    ],
    note: "THIS IS A LIMITATION OF THE SINGLE-NUMBER MODEL, NOT A FINDING "
      + "ABOUT FLAMES.  Thermal NO in a real furnace is a kinetic quantity "
      + "-- the corpus carries a Zeldovich post-flame case for exactly that "
      + "reason -- and no equilibrium map with or without an approach "
      + "predicts a stack concentration.  What the witness shows is narrower "
      + "and worth knowing before any ΔT is calibrated on a multi-reaction "
      + "system: the parameter has one sign per feed, and a product whose "
      + "thermicity opposes the feed's is moved the wrong way by "
      + "construction.  The reformer's shift, which the companion page names, "
      + "is the same shape with the signs reversed.",
  },
  {
    n: 6,
    title: "The contrast: three overall routes to fixed nitrogen, priced on one surface",
    body: "Nitrogenase does not run the Haber–Bosch reaction cold.  There is "
      + "no hydrogen on the biological route: the enzyme reduces N₂ with "
      + "PROTONS and ELECTRONS, and the electrons come from the organism's "
      + "substrate — a sugar it respires, or, in a phototroph, water it "
      + "oxidises with light.  So the thermodynamics the engine can attack is "
      + "the OVERALL reaction with the real electron donor, balanced by "
      + "electron count: a fully oxidised glucose gives up 24 electrons and "
      + "a reduced N₂ takes 6, so one sugar fixes four nitrogens; a water "
      + "oxidised to O₂ gives up 2, so three waters fix one.  The panel "
      + "beside this step prices both routes, and the industrial one, with "
      + "the `reactionGibbs` operation on the sixth witness: every species on "
      + "a DECLARED standard state — the sugar on its own solid rung, water "
      + "as a pure liquid reached by the vaporisation crossing from its "
      + "ideal-gas datum, the gases on theirs — and the run names the route "
      + "each potential took (ReactionGibbs.cpp, `price`).  Read the signs "
      + "off the panel, not off this paragraph: the sugar route is "
      + "EXERGONIC, because respiration pays for the fixation inside the same "
      + "overall reaction; the water route is ENDERGONIC, and light pays; the "
      + "industrial route is exergonic at the datum temperature and is not "
      + "at the converter's, which is the whole reason a converter needs its "
      + "pressure — the landscape above draws that loss.  WHAT DOES NOT "
      + "TRANSFER.  The temperature approach of step 3 has no meaning for an "
      + "enzyme: `T + ΔT` is a statement about a catalyst bed whose "
      + "shortfall can be expressed as a temperature, and nothing about a "
      + "cell at body temperature in water is that.  What transfers is the "
      + "EQUILIBRIUM LIMIT — the sign and size of ΔG the panel shows, the "
      + "ceiling no enzyme lifts — and the EXTENT BOOKKEEPING: atoms and "
      + "electrons conserved, one extent per overall reaction.  A "
      + "bioreactor in Choupo would be a `batchReactor` or a `dynamicCSTR` "
      + "with DECLARED kinetics and a declared rate law, never a Gibbs "
      + "reactor: the enzyme's rate is the thing an equilibrium reactor "
      + "cannot say, and the tree has no rate law for it.  WHAT THE ENGINE "
      + "REFUSES, quoted rather than hidden.  The sugar route can be priced "
      + "only at 298.15 K: glucose.dat carries a solid-rung datum and NO "
      + "heat-capacity block on any rung (its own words: FLAGGED, NOT "
      + "FABRICATED), so asking that route at body temperature refuses by "
      + "name — measured on a copy of the witness: \"Component 'glucose': "
      + "h_formation liquid leg needs liquidHeatCapacity\" (Component.cpp:"
      + "1084–1090; the solid leg falls back to the liquid Cp and finds "
      + "none).  The witness therefore asks the sugar route at the datum "
      + "temperature only, and the water and industrial routes at body "
      + "temperature as well, so the gap is stated and nothing is invented.  "
      + "And the kinetic side is shown by no engine number anywhere on this "
      + "page: the one ammonia rate law in the tree, Dyson & Simon (1968), "
      + "declares a validity window of 150 to 300 atm and refuses a pressure "
      + "outside it by name (AmmoniaSynthesisRate.cpp:111–117).  No document "
      + "in this repository describes nitrogenase or its ATP stoichiometry, "
      + "so this page cites nothing for it and states only the qualitative "
      + "fact.",
    formula: String.raw`\begin{aligned}
&\ce{C6H12O6(s) + 4 N2 + 6 H2O(l) -> 6 CO2 + 8 NH3} &&\text{heterotrophic: 24 e}^{-}\text{ from the sugar}\\
&\ce{N2 + 3 H2O(l) -> 2 NH3 + 3/2 O2} &&\text{phototrophic: 6 e}^{-}\text{ from water}\\
&\ce{N2 + 3 H2 -> 2 NH3} &&\text{industrial}\\[4pt]
&\Delta G^\circ(T) = \sum_i \nu_i\, h_i(T) - T \sum_i \nu_i\, s_i(T),
\qquad \ln K = -\frac{\Delta G^\circ(T)}{R\,T}
\end{aligned}`,
    where: [
      { sym: "\\Delta G^\\circ", means: "the standard Gibbs energy change of "
        + "the overall reaction as written, every species on its declared "
        + "standard state; negative is exergonic — the equilibrium permits "
        + "it — and says nothing about a rate", unit: "J/mol" },
      { sym: "\\nu_i", means: "the stoichiometric coefficient of species i in "
        + "the reaction as written, negative for a reactant — the "
        + "`stoichiometry` block of the witness's constant/reactions",
        unit: "—" },
      { sym: "h_i(T)", means: "the standard-state enthalpy of species i on its "
        + "declared phase, referenced to the elements at 298.15 K: the "
        + "record's `dHf_298` at the datum temperature, or "
        + "`Component::h_formation` beyond it", unit: "J/mol" },
      { sym: "s_i(T)", means: "the third-law absolute entropy of species i on "
        + "its declared phase: the record's `s_298` at the datum, or "
        + "`Component::s_formation` beyond it — for liquid water, the "
        + "vaporisation crossing from the ideal-gas datum", unit: "J/(mol·K)" },
      { sym: "T", means: "the temperature the route is priced at: the datum, "
        + "298.15 K, body temperature, 310.15 K, and for the industrial route "
        + "the converter's 700 K", unit: "K" },
      { sym: "K", means: "the equilibrium constant of the overall reaction, "
        + "on the standard states declared — a pure liquid's activity is 1 "
        + "in it, a gas's is its partial pressure over 1 bar", unit: "—" },
      { sym: "R", means: "the gas constant", unit: "J/(mol·K)" },
    ],
    note: "WHY THE THREE NUMBERS ARE ON ONE SURFACE, and why that had to be "
      + "built.  The engine's one route to a reaction's Gibbs energy before "
      + "this page, `Reaction::equilibrium` (Reaction.cpp:136–149), prices "
      + "every species with `g_pure_ig` — the ideal-gas rung — and that rung "
      + "refuses a record tabulated on the solid standard state by name "
      + "(Component.cpp:1413–1425).  Measured when this page was written: a "
      + "`gibbsMap` with glucose beside the gases refused with \"reading them "
      + "here would be wrong by a heat of sublimation\".  The Gibbs reactor "
      + "(2026-09-27) and the map (2026-09-29) now take a declared pure solid "
      + "as its own phase, but a map answers where the atoms go with every "
      + "pathway open, not whether one declared route is permitted — the "
      + "witness landscape07_sugar_nitrogen_all_pathways shows the two "
      + "answers differ.  So the sixth witness runs `reactionGibbs`, "
      + "which sums a declared reaction over the phase-aware `h_formation` "
      + "and `s_formation` surface the Component already carried (Component."
      + "cpp:1071, 1206), at the datum temperature from each declared rung's "
      + "own pair with nothing integrated, and announces every crossing as an "
      + "advisory.  It solves no equilibrium: it is the price tag on each "
      + "route, and the landscapes above are what the cheapest of them buys.",
  },
];

export const LANDSCAPE_LIMITS: readonly LessonLimit[] = [
  {
    id: "ideal-gas-kernel",
    title: "Every curve is ideal gas; the 100 bar curves are shape, not prediction.",
    body: "The map kernel builds its standard-state term from the ideal-gas "
      + "Gibbs energy alone (ElementPotential.cpp:47–48) and the five "
      + "witnesses declare `fugacityModel idealGas`.  At 1 bar that is the "
      + "physics; at 100 bar it is the trend.  The contrast panel puts the "
      + "corpus's SRK answer beside the ideal one at 200 bar so the size of "
      + "what is missing is visible on one system; on the other four nothing "
      + "on this page measures it.",
  },
  {
    id: "gas-phase-metric",
    title: "The metric is the GAS phase, and one condensable species is all the kernel handles.",
    body: "Mole fractions and element yields are formed over the gas amounts "
      + "(GibbsMapOp.cpp:204–213).  Where one condensable species is "
      + "supersaturated the kernel condenses it and the reported gas is "
      + "saturated -- the ammonia witness's cold 100 bar leg -- and where "
      + "MORE than one is supersaturated the kernel returns the gas-only "
      + "solution unchanged (ElementPotential.cpp:71), converged and "
      + "unannounced.  On these five witnesses no cell reaches that second "
      + "branch: the shift and combustion grids are dry at every cell "
      + "(checked against the run, not assumed -- the shift's three pressure "
      + "columns are identical), the reforming and NO grids sit above every "
      + "product's dew point, and ammonia has one condensable.  A witness "
      + "with two condensables and a cold corner would need the reactor's "
      + "multi-phase methods, which the map does not call.",
  },
  {
    id: "no-kinetics-anywhere",
    title: "Nothing here is a rate.  The page shows what equilibrium permits and what an approach reports.",
    body: "No curve says how fast a bed gets to the value drawn, and the "
      + "approach is a stand-in for a rate law, not one.  The enzyme of step 6 "
      + "has no model in this tree and no citation in it, and the industrial "
      + "rate law the tree does carry refuses the ambient pressure by name.  "
      + "A student who wants the kinetic side of ammonia has the Dyson & Simon "
      + "bench (`ammoniaRate01_dyson_simon`) and the staged kinetic converter "
      + "(`ammoniaStaged04_kinetic`), both inside that law's own window; a "
      + "student who wants a bioreactor has `batchReactor` and `dynamicCSTR`, "
      + "which take a DECLARED rate law and are the right door.",
  },
  {
    id: "biological-routes-at-the-datum-only",
    title: "The sugar route is priced at 298.15 K and nowhere else, and that is a refusal, not a choice.",
    body: "`reactionGibbs` prices a species at the datum temperature from its "
      + "declared rung's own pair, so a record with a datum and no heat "
      + "capacity can answer there.  glucose.dat has no Cp on any rung, so the "
      + "heterotrophic route at 310.15 K refuses by name (quoted in step 6), "
      + "and the panel shows that route at 298.15 K only.  Liquid water is "
      + "not asked at 700 K either: a pure-liquid standard state above its "
      + "critical temperature is a number with no state behind it, so the "
      + "converter-temperature row is the industrial route alone.  The "
      + "biological routes are priced on the same datum as the gases, with "
      + "the crossings announced; nothing on this page compares them with a "
      + "measured value.",
  },
  {
    id: "species-lists-are-the-corpus-cases",
    title: "Each landscape's species list is its steady case's, and that list is a modelling decision.",
    body: "No radicals, no soot, no ammonia in the flame, no allotropes: the "
      + "lists are exactly the ones gibbs01, gibbs02, gibbs03, "
      + "gibbs06_thermal_nox and gibbs10 declare, so a curve here answers "
      + "the same question those cases ask and no other.  The companion "
      + "page's first step, and the Claus page's whole lesson, are about what "
      + "changes when the list does.",
  },
  {
    id: "not-a-calibration",
    title: "No |ΔT| on this page is fitted to anything, and no curve is a measurement.",
    body: "The slider demonstrates the mechanism.  The only measured anchors "
      + "for these chemistries in the corpus are the Larson & Dodge (1923) "
      + "pins on nh3_equilibrium_map, at pressures where the ideal-gas kernel "
      + "is honest; nothing on this page is compared with a measurement, and "
      + "its numbers are the engine's, pinned only against themselves.",
  },
  {
    id: "the-survey-is-five-of-twenty-two",
    title: "Five systems, chosen from the corpus's Gibbs reactors by what a fixed-T landscape can say.",
    body: "The corpus carries more `gibbsReactor` units than this page draws.  "
      + "The adiabatic ones -- the Claus furnace, the flame cases, the "
      + "power-cycle burners -- were left out on purpose: their physical "
      + "temperature is the ANSWER of the energy balance, not a knob, so a "
      + "landscape drawn at fixed T is not the question those cases ask; "
      + "the Claus furnace also depends on records the catalogue does not "
      + "carry, and has a page of its own.  The ammonia plants share "
      + "gibbs10's chemistry and are represented by it.",
  },
];
