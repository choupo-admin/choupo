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
  The reactor ladder, as DATA (commission C23, 2026-09-28).

  WHY THIS PAGE EXISTS.  The architect asked how a reaction-engineering course
  is built and found the order he had been taught -- rate law first,
  equilibrium as its long-time limit -- in the syllabus he looked up.  A design
  goes the other way: what the atoms allow, then what thermodynamics allows,
  and only then, when the decision in hand needs a volume, what the rate
  delivers.  Process simulators carry exactly that ladder of reactor models,
  and so does Choupo.  This page climbs it on ONE reaction and ONE feed.

  THE PROSE CARRIES ITS MATHEMATICS BETWEEN `$` MARKS and the page draws it
  with KaTeX; every symbol an equation uses is glossed in that section's
  `where`.  Every engine claim carries the file:line it was READ at when this
  was written -- a drafting discipline, not a gate (see CLAUDE.md §6, "A
  CITATION REQUIREMENT CHANGED WHAT THE READERS READ").

  MEASURED on the native build before this file was written, witness
  tutorials/steady/reactors/ladder01_wgs_three_rungs, equimolar CO + H2O at
  10 bar, one fifth of the feed to each reactor:

      600 K   stoich (declared)     0.900
              limit                 0.841432775225   Kp 28.1586609387
              approach 25 K         0.8195501646     Kp at 625 K 20.6270966354
              gibbs  y_CO2          0.420716387613   (= limit, X/2)
              pfr    X at V_R       0.84143272012
      550 K   limit 0.883502911646, pfr 0.865598497629   (the RATE binds)
      650 K   limit 0.797474319208, pfr 0.797474319208
      700 K   limit 0.753662089481, pfr 0.753662089481
      600 K with a 50 K approach = 0.797474319208 = the 650 K limit, exactly.
\*---------------------------------------------------------------------------*/

export interface LadderGloss { sym: string; means: string; unit?: string }

export interface LadderSection {
  /** Position on the page (and the block marker the symbol gate splits on). */
  n: number;
  id: string;
  /** Which rung this section describes (0 for the frame around them). */
  rung: 0 | 1 | 2 | 3;
  title: string;
  /** Prose; mathematics between `$` marks. */
  body: string;
  /** The section's display equation, KaTeX. */
  eq?: string;
  /** Every symbol `eq` uses. */
  where?: readonly LadderGloss[];
  /** What the rung NEEDS before it can answer -- the cost of climbing. */
  needs?: string;
  /** A question to answer before reading on. */
  check?: { q: string; a: string };
}

export const LADDER_SECTIONS: readonly LadderSection[] = [
  {
    n: 1,
    id: "order",
    rung: 0,
    title: "The order a design climbs in",
    body: "A reaction-engineering course usually begins with the rate law and "
      + "reaches equilibrium at the end, as the limit of a very long reactor.  "
      + "A design runs the other way.  The first question is what the atoms "
      + "allow, the second is what thermodynamics allows, and only when a "
      + "decision needs a VOLUME does anyone ask what the rate delivers.  "
      + "Each rung needs more information than the one below it, and the "
      + "information on the top rung is the most expensive to get: somebody "
      + "has to measure it.  So a design climbs only as far as the decision "
      + "in front of it requires.  This page runs one reaction, the "
      + "water-gas shift $\\mathrm{CO} + \\mathrm{H_2O} \\rightleftharpoons "
      + "\\mathrm{CO_2} + \\mathrm{H_2}$, on one equimolar feed at 10 bar, "
      + "split five ways to five models of the same reactor, in one run.",
  },
  {
    n: 2,
    id: "rung1",
    rung: 1,
    title: "Rung 1 — what the atoms allow: a declared conversion",
    body: "The conversion reactor is told the stoichiometry, the limiting "
      + "reactant and a conversion $X$, and returns every outlet flow by "
      + "arithmetic (ConversionReactor.cpp:195–213).  There is no solver.  "
      + "It is the right model for a first mass balance, and whenever $X$ "
      + "is known from a running plant, a patent or a vendor.  What it cannot "
      + "do is tell you whether $X$ is possible: the only bounds it checks are "
      + "$0 \\le X \\le 1$ and that no outlet amount goes negative "
      + "(ConversionReactor.cpp:190–193 and 205–208).  The witness declares $X = 0.90$ "
      + "on purpose.  At 600 K that is above this feed's equilibrium, and the "
      + "rung prints it without complaint.",
    eq: String.raw`\xi = \frac{X\,n_{\mathrm{CO},0}}{-\nu_{\mathrm{CO}}}
\qquad n_i = n_{i,0} + \nu_i\,\xi`,
    where: [
      { sym: "\\xi", means: "the extent of reaction", unit: "kmol/h" },
      { sym: "X", means: "the DECLARED conversion of the limiting reactant, "
        + "CO here — an input, not a result", unit: "–" },
      { sym: "n_{\\mathrm{CO},0}", means: "the CO fed", unit: "kmol/h" },
      { sym: "\\nu_{\\mathrm{CO}}", means: "the stoichiometric coefficient "
        + "of CO, −1", unit: "–" },
      { sym: "n_i", means: "the outlet flow of species i", unit: "kmol/h" },
      { sym: "n_{i,0}", means: "the inlet flow of species i", unit: "kmol/h" },
      { sym: "\\nu_i", means: "the stoichiometric coefficient of species i, "
        + "negative for a reactant", unit: "–" },
    ],
    needs: "The stoichiometry, and one number somebody else must supply.",
    check: {
      q: "Why does this rung accept X = 0.90 when thermodynamics forbids it?",
      a: "Because nothing on this rung knows the equilibrium constant.  It "
        + "balances atoms; whether the number is reachable is a question for "
        + "the rung above, and nothing in the engine compares the two today.",
    },
  },
  {
    n: 3,
    id: "rung2",
    rung: 2,
    title: "Rung 2 — what thermodynamics allows: the limit",
    body: "The equilibrium reactor is told the same reaction and no "
      + "conversion.  It computes $K(T)$ from the Gibbs energies of formation "
      + "the catalogue already holds and solves for the composition that "
      + "satisfies it.  There is no rate and no volume in it.  For the shift, "
      + "two moles of gas give two, so the pressure cancels and, on an "
      + "equimolar feed, the whole solve collapses to one line you can check "
      + "by hand.  With the engine's $K(600\\,\\mathrm{K}) = 28.1587$, "
      + "$\\sqrt{K} = 5.3065$ and $X_\\mathrm{eq} = 0.8414$, which is the "
      + "number in the table.  The Gibbs reactor gets there by another road: "
      + "it is given elements and species and no reaction at all, and it "
      + "minimises the mixture's Gibbs energy.  Over exactly these four "
      + "species the only reaction they permit is the shift, so the two must "
      + "agree to every digit.  Add methane to its list and they would not "
      + "(the page Declared pathways is that lesson).",
    eq: String.raw`K(T) = \exp\!\left(-\frac{\Delta G^\circ(T)}{R\,T}\right)
= \frac{y_{\mathrm{CO_2}}\,y_{\mathrm{H_2}}}{y_{\mathrm{CO}}\,y_{\mathrm{H_2O}}}
= \frac{X_\mathrm{eq}^2}{(1-X_\mathrm{eq})^2}
\;\;\Rightarrow\;\;
X_\mathrm{eq} = \frac{\sqrt{K}}{1+\sqrt{K}}`,
    where: [
      { sym: "K", means: "the equilibrium constant of the shift; with "
        + "Δν = 0 it is the same on a pressure and a mole-fraction basis",
        unit: "–" },
      { sym: "T", means: "the reactor temperature", unit: "K" },
      { sym: "\\Delta G^\\circ", means: "the standard Gibbs energy of "
        + "reaction, Σ ν_i g_i° from the formation data", unit: "J/mol" },
      { sym: "R", means: "the gas constant", unit: "J/(mol·K)" },
      { sym: "y_{\\mathrm{CO_2}}", means: "the outlet mole fraction of CO₂; "
        + "likewise H₂, CO and H₂O", unit: "–" },
      { sym: "y_{\\mathrm{H_2}}", means: "the outlet mole fraction of H₂",
        unit: "–" },
      { sym: "y_{\\mathrm{CO}}", means: "the outlet mole fraction of CO",
        unit: "–" },
      { sym: "y_{\\mathrm{H_2O}}", means: "the outlet mole fraction of "
        + "water", unit: "–" },
      { sym: "X_\\mathrm{eq}", means: "the equilibrium conversion of CO — "
        + "a RESULT here", unit: "–" },
    ],
    needs: "Formation data (already curated, so free) and a decision about "
      + "which reactions — or which species — are allowed.",
    check: {
      q: "Heat the reactor from 550 K to 700 K.  Which way does the limit move, "
        + "and why?",
      a: "Down, from 0.884 to 0.754: the shift is exothermic, so K falls as T "
        + "rises (van 't Hoff).  A hotter bed is faster and allows less.",
    },
  },
  {
    n: 4,
    id: "approach",
    rung: 2,
    title: "Rung 2, with a margin — the temperature approach",
    body: "No real bed reaches the limit, because the last few per cent cost "
      + "most of the volume (rung 3 shows how much).  Before any rate law "
      + "exists, a designer states how far short of the limit the bed will "
      + "sit, and states it as a TEMPERATURE: $K$ is evaluated at "
      + "$T + \\Delta T$ for a reaction that is exothermic as it runs, at "
      + "$T - \\Delta T$ for one that is endothermic.  You declare only the "
      + "magnitude and the engine picks the side from a probe solve at $T$ "
      + "(EquilibriumReactor.cpp:694–737; announced in the run log).  The "
      + "outlet stays at the physical $T$; only $K$ moves.  $\\Delta T$ is a "
      + "number calibrated from plants and catalyst vendors, never predicted, "
      + "and it is the bridge between the limit and a real reactor.  The "
      + "page Approach to equilibrium teaches it in full.",
    eq: String.raw`K_\mathrm{design} = K\!\left(T + \Delta T\right)
\quad\text{(exothermic as it runs)}`,
    where: [
      { sym: "K_\\mathrm{design}", means: "the equilibrium constant the "
        + "design is solved against", unit: "–" },
      { sym: "K", means: "the equilibrium constant as a function of "
        + "temperature, as in rung 2", unit: "–" },
      { sym: "T", means: "the physical reactor temperature, which the outlet "
        + "keeps", unit: "K" },
      { sym: "\\Delta T", means: "the declared approach, a MAGNITUDE",
        unit: "K" },
    ],
    needs: "One number from experience: how far from equilibrium beds of "
      + "this kind actually run.",
    check: {
      q: "At 600 K a 50 K approach gives exactly the 650 K limit.  Why exactly?",
      a: "On an ideal gas the composition depends on the temperature only "
        + "through K, and the approach moves only K.  So evaluating K at "
        + "650 K and running at 600 K gives the 650 K composition.",
    },
  },
  {
    n: 5,
    id: "rung3",
    rung: 3,
    title: "Rung 3 — what the rate delivers: a volume",
    body: "Only now does a volume appear.  The plug-flow reactor integrates "
      + "the rate along the bed.  Its reverse term is built from the SAME "
      + "equilibrium constant, $k_r = k_f / K$ (PFR.cpp:373–377), so the net "
      + "rate vanishes exactly at the limit: the profile rises toward the "
      + "rung-2 line and cannot cross it, however long the bed.  Read the "
      + "shape.  Most of the conversion arrives in the first part of the bed, "
      + "and the approach line is crossed early.  After that, most of the "
      + "remaining volume buys the last couple of per cent.  That tail is why "
      + "the approach heuristic exists.  Now cool the bed to 550 K.  The limit "
      + "rises to 0.884, but the same bed delivers only 0.866, because the "
      + "rate is now what binds.  Hot beds are limited by equilibrium and cool "
      + "beds by the rate.  That is why industry runs the shift in two beds: "
      + "a hot one where the rate is fast, then a cooler one on a more active "
      + "catalyst, where the limit is higher.",
    eq: String.raw`\frac{\mathrm{d}F_{\mathrm{CO}}}{\mathrm{d}V} = -r, \qquad
r = k_f(T)\left(C_{\mathrm{CO}}\,C_{\mathrm{H_2O}}
- \frac{C_{\mathrm{CO_2}}\,C_{\mathrm{H_2}}}{K(T)}\right), \qquad
k_f = A\,\exp\!\left(-\frac{E_a}{R\,T}\right)`,
    where: [
      { sym: "F_{\\mathrm{CO}}", means: "the CO molar flow at a point in the "
        + "bed", unit: "mol/s" },
      { sym: "V", means: "the reactor volume from the inlet to that point",
        unit: "m³" },
      { sym: "r", means: "the net rate of the shift per unit volume",
        unit: "mol/(m³·s)" },
      { sym: "k_f", means: "the forward rate constant", unit: "m³/(mol·s)" },
      { sym: "T", means: "the reactor temperature", unit: "K" },
      { sym: "C_{\\mathrm{CO}}", means: "the CO concentration; likewise "
        + "H₂O, CO₂ and H₂", unit: "mol/m³" },
      { sym: "C_{\\mathrm{H_2O}}", means: "the water concentration",
        unit: "mol/m³" },
      { sym: "C_{\\mathrm{CO_2}}", means: "the CO₂ concentration",
        unit: "mol/m³" },
      { sym: "C_{\\mathrm{H_2}}", means: "the H₂ concentration",
        unit: "mol/m³" },
      { sym: "K", means: "the equilibrium constant of rung 2 (Δν = 0, so the "
        + "concentration basis is the same number)", unit: "–" },
      { sym: "A", means: "the pre-exponential factor", unit: "m³/(mol·s)" },
      { sym: "E_a", means: "the activation energy", unit: "J/mol" },
      { sym: "R", means: "the gas constant", unit: "J/(mol·K)" },
    ],
    needs: "A rate law somebody MEASURED, on this catalyst, over this range: "
      + "the most expensive fact on the page.",
    check: {
      q: "Could a longer bed ever beat the equilibrium reactor's number?",
      a: "No.  At the limit the forward and reverse terms are equal, because "
        + "the reverse constant is k_f/K, so the rate there is zero.  Volume "
        + "buys approach to the limit, never passage beyond it.",
    },
  },
  {
    n: 6,
    id: "phases",
    rung: 0,
    title: "Where each rung is used",
    body: "In a conceptual design, choosing the route and the flowsheet, the "
      + "first two rungs carry the work.  They need no catalyst data, and the "
      + "question is only whether the route is worth pursuing.  In basic "
      + "engineering the equilibrium reactor with an approach temperature "
      + "sizes the recycle and the separation around a realistic outlet.  "
      + "The kinetic rung is climbed when the decision is the reactor itself: "
      + "its volume, the temperature profile, the catalyst charge, a "
      + "debottleneck.  A student who starts at rung 3 can calculate a volume "
      + "without knowing whether the target was possible.  One who climbs "
      + "from rung 1 knows at every step what the number rests on.",
  },
];

export interface LadderLimit { id: string; title: string; body: string }

export const LADDER_LIMITS: readonly LadderLimit[] = [
  {
    id: "volume-is-a-shape",
    title: "The PFR's volume axis is a shape, not a size.",
    body: "This kinetic reactor prices concentrations on a LIQUID molar volume "
      + "(PFR.cpp:804, \"liquid-basis volumetric flow\"), so on a gas at "
      + "10 bar the concentrations, and hence the volume, are not those of "
      + "the real gas.  The rate constant is pfr02's illustrative one, chosen "
      + "small for the same reason.  What the profile shows faithfully is its "
      + "SHAPE and its ceiling.  Neither the axis nor the residence time is a "
      + "design number.",
  },
  {
    id: "isothermal",
    title: "Every reactor here is isothermal.",
    body: "A real high-temperature shift bed is adiabatic: the exothermic "
      + "reaction heats the gas, which lowers the limit as the bed proceeds.  "
      + "That coupling is the next rung of realism and is not on this page.",
  },
  {
    id: "one-reaction",
    title: "One reaction, ideal gas.",
    body: "With several reactions, rung 1 needs a conversion for each of "
      + "them, and rung 2 needs a decision about which ones equilibrate: the "
      + "page Declared pathways.  At 10 bar the shift is close enough to an "
      + "ideal gas that the case declares one.",
  },
  {
    id: "no-cross-check",
    title: "Nothing warns when rung 1 exceeds rung 2.",
    body: "The engine does not compare a declared conversion with the "
      + "equilibrium one.  The page exists so that the student makes that "
      + "comparison.",
  },
];
