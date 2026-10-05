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
  Declared pathways, as DATA: equilibrium, but only along the reactions you
  say are possible.

  WHY THIS PAGE EXISTS.  Commissioned 2026-09-27 (C11), in the architect's
  words: "assume equilibrium, but now declare which reaction pathways are the
  ONLY ones possible".  In the operating region an engineer knows that some
  reactions are kinetically limited, so they can be excluded, and the
  exclusion combines experiential heuristics with thermodynamics.  The
  companion pages carry the species-list level (`approach-to-equilibrium`,
  `equilibrium-landscapes`); this one carries the level above it, where the
  author writes the REACTIONS, and sets the two side by side on one feed.

  THE PREMISE IS THE STUDENT'S, AND THE PAGE SAYS SO.  Which reaction a
  catalyst makes fast and which it leaves frozen is kinetic knowledge the
  engine cannot check.  Nothing in this tree cites a source for the
  selectivity of any methanol catalyst, so the page states the exclusion as a
  premise the student DECLARES and cites nothing for it -- an invented
  citation turns an unsourced claim into a falsely sourced one.

  EVERY ENGINE CLAIM CARRIES A file:line, read in the source on 2026-09-27
  (re-read the same day when the equilibrium reactor moved to ln n, and
  again when it gained a pure-solid phase; records
  docs/design/an-equilibrium-that-runs-to-completion.md and
  docs/design/a-solid-in-a-declared-reaction-set.md).  That is a drafting
  discipline, not a gate: `check_lesson_symbols` holds the `where` glosses
  and nothing parses a citation out of a lesson.  Every number quoted in the
  prose was measured on the witnesses `equil02_methanol_declared_pathways`,
  `equil03_ammonia_oxidation_declared_pathways` and
  `equil04_reforming_carbon_declared_pathways` with the native build the
  same day; the numbers the PANEL shows are the engine's, read live (the
  panel runs equil02; equil03 and equil04 are further examples, run as
  cases).
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "./lessonStep.js";
export type { LessonStep, LessonLimit };

export const PATHWAYS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Two questions that both answer to the word “equilibrium”",
    body: "A Gibbs reactor is told SPECIES: the elements, the candidate "
      + "species with their atom counts, a temperature and a pressure.  It "
      + "returns the composition of least Gibbs energy that conserves every "
      + "atom of the feed, and every transformation the species list permits "
      + "is open to it (the atom inventory is built from the feed, "
      + "GibbsReactor.cpp:270).  An equilibrium reactor is told REACTIONS: a "
      + "list of names from constant/reactions, each a stoichiometry.  The "
      + "outlet can move only along those reactions, n = n0 + Σ ν ξ (the "
      + "engine writes it as the conservation laws the declared set leaves "
      + "intact, EquilibriumReactor.cpp:276–288), and each declared reaction "
      + "is driven to its own equilibrium constant, the residual ln Q − ln K "
      + "(EquilibriumReactor.cpp:333–336), with every K from the same "
      + "formation data the Gibbs reactor minimises over "
      + "(`pureSolidPhase::reactionEquilibrium`, which is "
      + "`Reaction::equilibrium` itself for a reaction with no pure solid, "
      + "EquilibriumReactor.cpp:116).  Same "
      + "thermodynamics, same data, two different questions.",
    formula: String.raw`\min_{n \ge 0}\; G(T,P,n) \quad \text{subject to} \quad A\,n = b
\qquad\text{versus}\qquad
n = n_0 + \nu^{\top}\xi, \quad \sum_i \nu_{ji}\,\ln\frac{y_i\,P}{P^{\circ}} = \ln K_j(T)`,
    where: [
      { sym: "G", means: "the total Gibbs energy of the outlet mixture — what "
        + "the Gibbs reactor minimises", unit: "J/s" },
      { sym: "T", means: "the PHYSICAL temperature of the reactor and of the "
        + "stream that leaves it", unit: "K" },
      { sym: "P", means: "the reactor pressure", unit: "Pa" },
      { sym: "n", means: "the vector of outlet molar flows, one entry per "
        + "species", unit: "mol/s" },
      { sym: "A", means: "the atom matrix: one row per element, one column "
        + "per species, each entry the count of that element in that "
        + "species — the `atoms ( ... )` list the case declares",
        unit: "atoms per molecule" },
      { sym: "b", means: "the atom inventory of the FEED, element by element",
        unit: "mol/s of atoms" },
      { sym: "n_0", means: "the feed's molar flows, species by species",
        unit: "mol/s" },
      { sym: "\\nu", means: "the stoichiometric matrix of the DECLARED "
        + "reactions: one row per reaction, one column per species, negative "
        + "for a reactant and positive for a product" },
      { sym: "\\xi", means: "the vector of reaction EXTENTS, one per declared "
        + "reaction: how far each has run.  Negative when a reaction runs "
        + "backward from the feed.  The engine solves for the LOGARITHMS of "
        + "the outlet amounts and recovers ξ from them "
        + "(EquilibriumReactor.cpp:532–576), so a species left at 10⁻¹⁴ of the "
        + "feed is resolved, not lost to a subtraction", unit: "mol/s" },
      { sym: "\\nu_{ji}", means: "the entry of ν in row j and column i: the "
        + "stoichiometric coefficient of species i in reaction j (rows are "
        + "reactions, as in ν above)" },
      { sym: "i", means: "the species index" },
      { sym: "j", means: "the reaction index, over the DECLARED reactions "
        + "only" },
      { sym: "y_i", means: "the outlet mole fraction of species i" },
      { sym: "P^{\\circ}", means: "the standard pressure of the formation "
        + "data, 1 bar", unit: "Pa" },
      { sym: "K_j", means: "the equilibrium constant of reaction j at T, "
        + "exp(−ΔG°_j / RT), from the species' formation data on the "
        + "ideal-gas rung" },
    ],
    note: "THE SPECIES LIST AND THE REACTION LIST ARE BOTH KINETIC "
      + "STATEMENTS, at two different resolutions.  A species left off the "
      + "Gibbs list cannot form however favourable it is; a reaction left off "
      + "the equilibrium reactor's list cannot run however favourable it is, "
      + "even when every species it would touch is present.  The second is "
      + "the finer knife: it can keep methane in the problem and still say "
      + "that the pathway which MAKES it is closed.",
  },
  {
    n: 2,
    title: "Declare every independent reaction and you have the Gibbs reactor",
    body: "How many reactions does a set of species admit?  As many as the "
      + "species exceed the independent element balances: R = N − rank(A).  "
      + "The witness carries six species (CO, H₂, methanol, water, CO₂, CH₄) "
      + "over three elements, so three independent reactions — methanol "
      + "synthesis, the water–gas shift and methanation.  Its `complete` "
      + "reactor declares all three, and its outlet is the Gibbs reactor's "
      + "outlet: the same methanol mole fraction, 1.76 × 10⁻¹⁰, the same "
      + "outlet flow per mole fed, every species agreeing to ten significant "
      + "figures.  So when the next step removes one reaction and the answer "
      + "changes, the change is the EXCLUSION — not a difference between two "
      + "solvers.",
    formula: String.raw`R = N - \mathrm{rank}(A) = 6 - 3 = 3`,
    where: [
      { sym: "R", means: "the number of independent reactions a species set "
        + "admits.  Not the gas constant, and not the reflux ratio of the "
        + "distillation pages" },
      { sym: "N", means: "the number of species in the list" },
      { sym: "\\mathrm{rank}", means: "the rank of a matrix: here, how many "
        + "of the element balances are independent" },
    ],
    note: "The equality is a check on the engine, not a theorem you must take "
      + "on trust: the gate `check_reaction_subset_approach` re-runs the "
      + "witness and requires the two outlets to agree on every species "
      + "above 10⁻⁸.",
  },
  {
    n: 3,
    title: "Close one pathway: the premise is yours, the consequence is the engine's",
    body: "The `declared` reactor keeps methanol synthesis and the shift and "
      + "leaves METHANATION off its list.  That single word is a claim about "
      + "the catalyst: at these conditions, over this bed, the pathway that "
      + "makes methane is too slow to matter.  Experience supplies it; the "
      + "engine cannot check it and does not try.  What it does is compute "
      + "what FOLLOWS: equilibrium, but only along the pathways you declared "
      + "possible.  On the witness, 525 K and 50 bar, the difference is not "
      + "a correction, it is a different product.  Every pathway open: "
      + "methane and water, y_CH₄ = 0.451, methanol 1.8 × 10⁻¹⁰.  Methanation "
      + "closed: methanol, 61 % of the carbon monoxide fed converted to it, "
      + "and no methane at all.  An equilibrium calculation that ignores which reactions a "
      + "catalyst actually runs does not merely lose accuracy — it can point "
      + "the plant at the wrong molecule.",
    formula: String.raw`\xi_\mathrm{methanation} \equiv 0
\qquad\implies\qquad
\min_{\xi}\; G\!\left(T,P,\,n_0 + \nu^{\top}\xi\right) \;\ge\; \min_{n \ge 0,\; A n = b} G(T,P,n)`,
    where: [
      { sym: "\\xi_\\mathrm{methanation}", means: "the extent of the "
        + "methanation reaction — fixed at zero by LEAVING IT OFF THE LIST, "
        + "not by any number you type", unit: "mol/s" },
    ],
    derivation: [
      { step: "Every outlet the declared list can reach is an outlet the "
          + "Gibbs reactor could also reach: moving along a reaction "
          + "conserves every atom." },
      { step: "The reverse is not true once a reaction is excluded: the "
          + "reachable compositions are a subset of the atom-conserving "
          + "ones.  A minimum over a subset can never sit below the minimum "
          + "over the whole set — so the declared equilibrium is a "
          + "CONSTRAINED minimum of the same G, and the Gibbs reactor's "
          + "answer is its lower bound, never its competitor." },
    ],
    note: "HEURISTICS AND THERMODYNAMICS, EACH DOING ITS OWN JOB.  The "
      + "heuristic decides which pathways exist; thermodynamics decides where "
      + "each of them stops.  Neither can do the other's job: no amount of "
      + "equilibrium arithmetic says a catalyst is selective, and no amount "
      + "of plant experience says where a reaction's equilibrium lies.",
  },
  {
    n: 4,
    title: "The second knob: an approach temperature, read reaction by reaction",
    body: "A real bed does not reach even the equilibrium of its OWN "
      + "pathways.  `temperatureApproach` declares how far it falls short, as "
      + "a MAGNITUDE — a negative value is refused by name "
      + "(EquilibriumReactor.cpp:159 and :170) — and the ENGINE assigns the "
      + "direction to each declared reaction separately "
      + "(EquilibriumReactor.cpp:671–769).  It first solves the true "
      + "equilibrium at the physical T, reads which way each reaction RUNS "
      + "from this feed, and multiplies that direction by the reaction's "
      + "enthalpy as written: exothermic AS IT RUNS, Kp is taken at T + ΔT; "
      + "endothermic as it runs, at T − ΔT.  The rule has one home, shared "
      + "with the Gibbs reactor (TemperatureApproach.H:87, "
      + "`fromThermicity`).  On the witness the shift runs BACKWARD — the "
      + "feed carries CO₂ and no water — so as it runs it is endothermic and "
      + "its Kp is taken BELOW T while methanol synthesis, exothermic and "
      + "running forward, is taken above it: with 20 K the conversion falls "
      + "from 0.610 to 0.442.  The reactor itself stays at T; only each K "
      + "moves, and each reaction's evaluation temperature is published as "
      + "`T_Kp_<name>` (EquilibriumReactor.cpp:935).",
    formula: String.raw`K_j \;\to\; K_j\!\left(T + s_j\,\lvert\Delta T\rvert\right),
\qquad
s_j = \begin{cases} +1 & \xi_j^{\,0}\,\Delta H_j < 0 \\ -1 & \xi_j^{\,0}\,\Delta H_j > 0 \end{cases}`,
    where: [
      { sym: "\\Delta T", means: "the declared approach: a MAGNITUDE, global "
        + "on the unit or per reaction in constant/reactions (0 exempts a "
        + "reaction)", unit: "K" },
      { sym: "s_j", means: "the sign the ENGINE assigns reaction j, never "
        + "declared by the author" },
      { sym: "\\xi_j^{\\,0}", means: "the extent reaction j reaches at the "
        + "TRUE equilibrium at the physical T — the probe solve.  Its sign is "
        + "the direction the reaction runs from this feed", unit: "mol/s" },
      { sym: "\\Delta H_j", means: "the enthalpy of reaction j AS WRITTEN, at "
        + "the physical T, on the ideal-gas rung — the rung its K is priced "
        + "on, so by van 't Hoff its sign is exactly the sign of d ln K_j / "
        + "dT", unit: "J/mol" },
    ],
    note: "READ PER REACTION, NOT JOINTLY.  In a coupled set a shift on one "
      + "reaction moves the extents of the others too, and the engine says "
      + "so in every announcement rather than pretending to resolve it.  "
      + "This is exactly what the Gibbs reactor's approach cannot do: told "
      + "no reactions, it reads ONE thermicity for the whole transformation "
      + "and applies one sign to all of it.",
  },
  {
    n: 5,
    title: "What a declared list can and cannot tell you",
    body: "It can tell you the consequence of a premise, exactly.  It cannot "
      + "tell you the premise is true.  If methanation does run on your bed — "
      + "a different catalyst, a hotter spot, a poisoned promoter — the "
      + "declared equilibrium is not a conservative estimate, it is the "
      + "answer to a question the plant is not asking.  The Gibbs reactor on "
      + "the same feed is therefore not a rival to ignore: it is the bound "
      + "that says what the thermodynamics would do if the kinetics stopped "
      + "protecting you, and the distance between the two columns of the "
      + "panel is the size of the bet the declared list makes.",
    note: "The companion page `equilibrium-landscapes` draws where a single "
      + "reaction's equilibrium lies across temperature and pressure; this "
      + "page is the level above it, where the choice of WHICH reactions "
      + "equilibrate is made by you.",
  },
];

export const PATHWAYS_LIMITS: readonly LessonLimit[] = [
  {
    id: "premise-not-cited",
    title: "The exclusion on this page is a premise, cited to nothing.",
    body: "Nothing in this repository documents the selectivity of a methanol "
      + "catalyst, so the page does not claim one.  Methanation is left off "
      + "the list because the lesson needs a pathway to close, and the "
      + "witness says so in its own header.  A real design would cite the "
      + "catalyst's measured selectivity at the operating point.",
  },
  {
    id: "ammonia-oxidation",
    title: "A second example: ammonia oxidation, where the declared route runs to completion.",
    body: "The witness `equil03_ammonia_oxidation_declared_pathways` asks the "
      + "same three questions of ten per cent ammonia in air at 1100 K and "
      + "5 bar.  With every pathway open the Gibbs reactor burns the ammonia "
      + "to NITROGEN — y_N₂ = 0.742, NO at 6.8 × 10⁻⁵ — and the complete set "
      + "(both routes, 5 − 3 = 2) reproduces it to the last printed digit, "
      + "the ammonia at 5.7 × 10⁻¹⁸ included.  Declare the NO route alone, "
      + "4 NH₃ + 5 O₂ → 4 NO + 6 H₂O, and leave the N₂ route off — and with "
      + "it every path to nitrogen, the decomposition of NO included — and "
      + "the answer is NO: y_NO = 0.098, all of the ammonia converted.  The "
      + "exclusion is again your premise, and this page cites no catalyst "
      + "for it.  The engine prices the declared route at ln K = 121.5 at "
      + "1100 K (`Reaction::equilibrium`), and the ammonia it leaves is "
      + "1.7 × 10⁻¹⁴ of the outlet; recompute it by hand from "
      + "4 ln y_NH₃ = 4 ln y_NO + 6 ln y_H₂O − 5 ln y_O₂ + ln(P/P°) − ln K.  "
      + "Until 2026-09-27 this example could not be built: the equilibrium "
      + "reactor solved for the extents, so every amount was the feed minus a "
      + "multiple of an extent, and it held every species above 10⁻¹² of the "
      + "feed — it stalled and refused rather than print a wrong equilibrium.  "
      + "It now solves for the logarithms of the amounts "
      + "(EquilibriumReactor.cpp:175–201), where 10⁻¹⁴, or 10⁻³⁰⁰, is an "
      + "ordinary number.",
  },
  {
    id: "carbon-formation",
    title: "A third example: a steam reformer, where the declared list keeps carbon out.",
    body: "The witness `equil04_reforming_carbon_declared_pathways` asks the "
      + "same three questions of methane and steam at a steam-to-carbon ratio "
      + "of 1.0, 900 K and 1 bar.  Graphite is a species with a phase of its "
      + "own: its record says `referenceState pureSolid;`, so it is priced "
      + "at ACTIVITY ONE — no mole fraction, no mixing term — and enters "
      + "each equilibrium constant only through its pure-solid standard "
      + "Gibbs energy (PureSolidPhase.cpp:68–94; the residual that leaves it "
      + "out of ln Q, EquilibriumReactor.cpp:333–336).  With every pathway "
      + "open the Gibbs reactor DEPOSITS it: 0.217 mol of graphite per mol "
      + "of methane fed, 21.7 % of the carbon.  The complete set — reforming, "
      + "the shift and methane cracking, CH₄ → C + 2 H₂ (6 − 3 = 3) — "
      + "reproduces it, gas and graphite, to the printed digits; the "
      + "Boudouard reaction, 2 CO → C + CO₂, is cracking − reforming + shift, "
      + "so declaring it as well is refused as linearly dependent, and "
      + "declaring it INSTEAD of cracking gives the same outlet.  The engine "
      + "decides whether the solid appears exactly as the Gibbs reactor does: "
      + "it first solves with no solid, reads the carbon activity a_C that "
      + "gas leaves, and deposits graphite only if a_C > 1 "
      + "(EquilibriumReactor.cpp:584–669).  Here a_C = exp[(μ_C − g_C)/RT], "
      + "where μ_C is the chemical potential of carbon that the equilibrated "
      + "gas implies, g_C the molar Gibbs energy of pure graphite, R the gas "
      + "constant and T the reactor temperature: above one, depositing "
      + "carbon LOWERS the Gibbs energy.  Now leave Boudouard and cracking OFF the "
      + "list, keeping reforming and the shift, and no graphite forms — but "
      + "the gas it leaves has a_C = 1.580, published as "
      + "`activity_graphite` (EquilibriumReactor.cpp:849–883).  Recompute it "
      + "by hand by either route the list excludes: a_C = K_crack · p_CH₄ / "
      + "p_H₂², or a_C = K_boud · p_CO² / p_CO₂, where each p is the "
      + "outlet mole fraction times P / 1 bar and each K is that reaction's "
      + "equilibrium constant with graphite at activity one — K_crack = "
      + "3.228 at 900 K is the complete reactor's published "
      + "`Kp_methaneCracking`, and K_boud = 5.589 is what the same reactor "
      + "publishes as `Kp_boudouard` when Boudouard is declared in "
      + "cracking's place.  Both give 1.580, because reforming and the shift are the "
      + "complete set for the five gases.  READ WHAT THE PREMISE SAYS.  The "
      + "declared list does not say carbon cannot form: the outlet says the "
      + "opposite, a gas SUPERSATURATED in carbon by a factor of 1.58.  It "
      + "says the catalyst is assumed not to form it — a metastable state "
      + "the declaration asserts, and a_C is the size of that bet.  Whether "
      + "a real catalyst keeps that promise is not on this page, and the "
      + "page cites no catalyst for it.  Raise the steam to S/C 3.0 and a_C "
      + "falls to 0.294: no carbon anywhere, and the declared list then "
      + "costs nothing.",
  },
  {
    id: "slider-range",
    title: "The temperature slider stays between 525 and 625 K.",
    body: "Below about 450 K at 50 bar the Gibbs reactor condenses water — "
      + "its gas + liquid method emits a condensate stream — while the "
      + "equilibrium reactor is gas-only, so the columns would stop answering "
      + "the same question.  (This page once reported that the complete set's "
      + "Newton stalled at 500 K; that was the extent formulation, and it is "
      + "gone.)",
  },
  {
    id: "ideal-gas-at-fifty-bar",
    title: "Fifty bar, priced as an ideal gas.",
    body: "Every equilibrium constant the declared reactor uses is on the "
      + "ideal-gas rung, so the witness declares `fugacityModel idealGas` for "
      + "both reactors: a real equation of state in the Gibbs reactor alone "
      + "would make the two columns answer two different questions.  At 50 "
      + "bar that is an approximation, and the case says so.",
  },
  {
    id: "no-number-here-is-calibrated",
    title: "No ΔT on this page is fitted to anything.",
    body: "The approach slider demonstrates the mechanism; a real approach "
      + "comes from a plant measurement on a specific catalyst at a specific "
      + "point in its life, and there is no measurement anywhere in this "
      + "tool.",
  },
  {
    id: "isothermal-only",
    title: "Isothermal only.",
    body: "The equilibrium reactor holds T and publishes the duty that holds "
      + "it; it has no adiabatic mode.  A methanol converter's temperature "
      + "rise, and the equilibrium limit it imposes, is not on this page.",
  },
];
