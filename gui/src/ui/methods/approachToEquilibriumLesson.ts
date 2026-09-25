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
  The Gibbs reactor and the approach to equilibrium, as DATA.

  WHY THIS PAGE EXISTS, and it is worth stating because it is unusual.  The
  architect of this project met the temperature approach to equilibrium for the
  first time on 2026-09-25, in conversation, and commissioned the page because
  of it.  The engine has read the key since 2026-07-02, announces it in three
  sentences that are each worth a paragraph of teaching, and NOTHING anywhere
  carried that teaching.  Measured the same day: no flowsheet case in the
  corpus declares an approach of any kind.

  So the reader this page is written for is intelligent, has met equilibrium
  reactors, and has never been told this.  That is the opposite of a licence to
  pad: every paragraph has to carry something.

  WHAT IS NOT REPEATED HERE.  `claus-gibbs` already teaches what a Gibbs
  reactor IS at length -- a stoichiometry that cannot be written by hand, the
  collapse of N unknowns into one element potential per element.  Step 1 states
  the construction and its TRAP and points there; restating the Claus argument
  would be a second home for it.

  EVERY ENGINE CLAIM ON THIS PAGE CARRIES A file:line, verified by reading the
  source, not the page.  That requirement is a DRAFTING discipline here, not a
  gate: `check_lesson_symbols` holds the `where` glosses, and nothing anywhere
  parses a citation out of a lesson.  The citations are in the prose so a
  reader -- and the next author -- can check them.
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "./lessonStep.js";
export type { LessonStep, LessonLimit };

export const APPROACH_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A reactor that is told no reactions at all",
    body: "Every other reactor in a flowsheet is handed a mechanism: a "
      + "stoichiometry, a conversion, a rate law.  A Gibbs reactor is handed "
      + "none.  It is given the ELEMENTS, a list of candidate SPECIES with "
      + "their atom counts, and a temperature and pressure — and it returns "
      + "the composition that minimises the mixture's Gibbs energy while "
      + "conserving every atom that came in.  Whatever reactions would have "
      + "been written are implied by the species list and never appear "
      + "anywhere.  In Choupo the atom inventory b is built from the feed "
      + "itself (GibbsReactor.cpp:125–127) and an element the feed does not "
      + "contain is refused by name (GibbsReactor.cpp:128–131).",
    formula: String.raw`\min_{n \ge 0}\; G(T,P,n) = \sum_i n_i\,\mu_i(T,P,n)
\qquad \text{subject to} \qquad A\,n = b`,
    where: [
      { sym: "G", means: "the total Gibbs energy of the outlet mixture — the "
        + "quantity being minimised, and the only thing this reactor is "
        + "trying to do", unit: "J/s" },
      { sym: "n", means: "the vector of outlet molar flows, one entry per "
        + "declared candidate species: the UNKNOWN", unit: "mol/s" },
      { sym: "n_i",
        means: "the outlet molar flow of species i, one component of n",
        unit: "mol/s" },
      { sym: "\\mu_i",
        means: "the chemical potential of species i in the outlet mixture; "
        + "for an ideal gas it is the pure-species standard Gibbs energy plus "
        + "RT ln(y_i P / P0), and for a real gas a fugacity coefficient is "
        + "added to it", unit: "J/mol" },
      { sym: "T", means: "the PHYSICAL temperature of the reactor and of the "
        + "stream that leaves it — the one this page is about keeping apart "
        + "from the temperature the chemistry is asked at", unit: "K" },
      { sym: "P", means: "the reactor pressure, which enters through the "
        + "partial pressures and, in a real-gas package, through the fugacity "
        + "coefficients", unit: "Pa" },
      { sym: "A", means: "the ATOM MATRIX: one row per element, one column "
        + "per species, each entry the count of that element in that species. "
        + "It is exactly the `atoms ( ... )` list the case declares beside "
        + "each species", unit: "atoms per molecule" },
      { sym: "b", means: "the atom inventory of the FEED, element by element. "
        + "Choupo computes it as A n_feed rather than reading it — the "
        + "conservation law is built from the feed, never declared",
        unit: "mol/s of atoms" },
    ],
    note: "THE POWER AND THE TRAP ARE THE SAME SENTENCE.  A reactor that needs "
      + "no mechanism also cannot be told one it should respect.  There is no "
      + "way to say \"this reaction is fast and that one does not happen at "
      + "all\": if a species is in the list it is available to the minimisation, "
      + "and if it is not, it cannot form no matter how favourable it is.  The "
      + "species list is therefore a MODELLING DECISION disguised as an "
      + "inventory, and it is the only kinetic statement a Gibbs reactor lets "
      + "you make.  The companion page \"The allotrope nobody declared\" works "
      + "one case through this in full.",
  },
  {
    n: 2,
    title: "Why it turns up early — and the reason is not the one you expect",
    body: "The usual story is a ladder climbed by project stage: a yield "
      + "reactor for the first sketch, a Gibbs reactor for the concept, a "
      + "kinetic packed bed for the final design.  The ladder is real, but "
      + "the thing that moves you up it is DATA AVAILABILITY, not the date.  "
      + "A Gibbs reactor is used early because nobody has the kinetics yet — "
      + "they belong to the licensor, or they have not been measured.  A "
      + "company that owns its own kinetics from day one, as a licensor does "
      + "for its own process, may run the kinetic model in the very first "
      + "screening flowsheet.  Northwestern's process-design wiki puts the "
      + "same point the other way round: the Gibbs reactor is what you reach "
      + "for when \"the user does not possess any data pertinent to the "
      + "reaction\".",
    note: "AND THERE IS A STEP IN BETWEEN, which is what the rest of this page "
      + "is about.  Real practice does not jump from \"equilibrium\" to "
      + "\"packed bed\".  It inserts an equilibrium reactor DETUNED by one "
      + "calibrated number, so that every unit downstream is sized against a "
      + "realistic outlet long before anyone has a rate law.  A Gibbs reactor "
      + "run at true equilibrium hands the flowsheet a conversion no real "
      + "converter achieves, and the separation train, the recycle compressor "
      + "and the refrigeration are then all sized against a fiction.  Sourcing "
      + "for both paragraphs: docs/design/how-a-process-design-is-staged.md "
      + "§6 and §9.",
  },
  {
    n: 3,
    title: "One number, and the separation the engine refuses to blur",
    body: "The device is blunt and it is what industry uses: do not touch the "
      + "reactor, move the THERMOMETER THE CHEMISTRY READS.  Ask for the "
      + "equilibrium composition at T + ΔT, and then hand that composition to "
      + "a stream that is still at T.  For an exothermic reaction the "
      + "equilibrium conversion falls as temperature rises, so a bed that "
      + "falls short of equilibrium at T reaches the conversion equilibrium "
      + "would have given at some HIGHER temperature; ΔT is that distance, in "
      + "kelvin.  Johnson Matthey's field definition is the same construction "
      + "read backwards from a plant: take the measured outlet composition, "
      + "ask at what temperature it WOULD be the equilibrium composition, and "
      + "the gap to the real outlet temperature is the approach to "
      + "equilibrium.  Their worked steam-reforming example: a tube outlet at "
      + "808 °C with 4.60 mol% methane slip, a slip whose equilibrium "
      + "temperature is 796 °C, hence an approach of 12 °C.  (Johnson "
      + "Matthey, Guide to Approach-to-Equilibrium, flyer, c. 2020 — "
      + "retrieved and read in full for "
      + "docs/design/how-a-process-design-is-staged.md §3.1, which is where "
      + "the quotations on this page come from.)",
    formula: String.raw`\begin{aligned}
n &= n_\mathrm{eq}(T + \Delta T,\; P) && \text{the CHEMISTRY is asked here}\\
H &= \sum_i n_i\, h_i(T,\, P) && \text{the STATE is priced here}
\end{aligned}`,
    where: [
      { sym: "\\Delta T",
        means: "the TEMPERATURE APPROACH to equilibrium: a single calibrated "
        + "number, declared as `temperatureApproach` in the reactor's "
        + "`operation` block.  Zero means true equilibrium, and zero is the "
        + "default", unit: "K" },
      { sym: "n_\\mathrm{eq}",
        means: "the equilibrium composition function — the answer the "
        + "minimisation of step 1 returns at whatever temperature and pressure "
        + "it is asked for", unit: "mol/s" },
      { sym: "H", means: "the enthalpy flow the outlet stream carries away, on "
        + "Choupo's elements/formation datum.  It is the number the energy "
        + "balance and every downstream exchanger see", unit: "J/s" },
      { sym: "h_i",
        means: "the partial molar enthalpy of species i, evaluated at the "
        + "PHYSICAL temperature and pressure and never at the shifted one",
        unit: "J/mol" },
    ],
    note: "THIS IS THE SINGLE MOST TEACHABLE LINE IN THE ENGINE, and it is "
      + "worth reading in the source.  `temperatureApproach` is added to the "
      + "argument of the standard Gibbs energy alone — "
      + "`g_pure_ig(T + p.dTapproach)` at ElementPotential.cpp:47–48, with the "
      + "saturation pressure that decides condensation still evaluated at T "
      + "fourteen lines below (ElementPotential.cpp:61) — and the run says so "
      + "out loud: \"REACTION equilibrium evaluated at T + ΔT; enthalpy, Psat "
      + "and the energy balance stay at the physical T\" "
      + "(GibbsReactor.cpp:143–149).  The outlet is therefore a legitimate "
      + "NON-EQUILIBRIUM state: its composition belongs to one temperature and "
      + "its enthalpy to another, its affinity at T is not zero, and that "
      + "nonzero affinity IS the distance from equilibrium rather than a bug.",
  },
  {
    n: 4,
    title: "The sign, which is the part nobody is told",
    body: "Both signs are accepted and the engine constrains neither — it "
      + "prints \"T + \" or \"T − \" from the sign it was given and solves "
      + "(GibbsReactor.cpp:143–147).  Which sign you WANT is not a convention "
      + "to memorise; it follows from the thermicity of the reaction, through "
      + "van 't Hoff.  An exothermic equilibrium loses ground as it heats, so "
      + "asking the chemistry a HIGHER temperature under-predicts, and the "
      + "approach is POSITIVE: ammonia, methanol, the shift converters.  An "
      + "endothermic one gains ground as it heats, so under-predicting it "
      + "means asking a LOWER temperature, and the approach is NEGATIVE: "
      + "steam reforming.  Say that plainly, because the half-memory is "
      + "worse than no memory: POSITIVE IS CONSERVATIVE ONLY FOR AN "
      + "EXOTHERMIC REACTION.  Put the wrong sign on a reformer and the model "
      + "does not merely flatter it — it reports a conversion above the "
      + "equilibrium the same model just computed.  ONE QUALIFIER, and it is "
      + "not a quibble: \"above equilibrium is impossible\" holds for a "
      + "reactor whose FEED is on the reactant side of equilibrium at the "
      + "physical T, which is the ordinary case and is the case on both "
      + "witnesses here.  Feed an exothermic bed a gas that was already "
      + "equilibrated COLDER and it arrives past the hot equilibrium; the "
      + "reaction then runs backward, the approach is made from the other "
      + "side, and the wanted sign flips with it.  Which side the feed sits "
      + "on is a fact about the flowsheet, not about the reaction.",
    formula: String.raw`\begin{aligned}
\Delta H_\mathrm{rxn} < 0 \;&\implies\; \frac{\partial X_\mathrm{eq}}{\partial T} < 0
  \;&&\implies\; \Delta T > 0 \quad \text{(exothermic)}\\
\Delta H_\mathrm{rxn} > 0 \;&\implies\; \frac{\partial X_\mathrm{eq}}{\partial T} > 0
  \;&&\implies\; \Delta T < 0 \quad \text{(endothermic)}
\end{aligned}`,
    where: [
      { sym: "\\Delta H_\\mathrm{rxn}",
        means: "the enthalpy change of the overall transformation the reactor "
        + "performs — negative when it releases heat.  A Gibbs reactor never "
        + "sees this as an input, because it is told no reactions; but an "
        + "ISOTHERMAL one publishes its sign, as the duty the surroundings "
        + "must supply to hold T (`Q_kW`, GibbsReactor.cpp:323)",
        unit: "J/mol" },
      { sym: "X_\\mathrm{eq}",
        means: "the equilibrium conversion — or any monotone stand-in for it, "
        + "such as the equilibrium mole fraction of the product you care "
        + "about", unit: "mole fraction, or fractional conversion" },
      { sym: "K", means: "the equilibrium constant of the reaction whose "
        + "thermicity is in question.  A Gibbs reactor never forms one — it "
        + "minimises G instead — but van 't Hoff is the shortest route to the "
        + "sign, and the sign is what this step is for",
        unit: "— (activity based)" },
      { sym: "R", means: "the GAS CONSTANT.  Not the heat-removal rate the "
        + "ignition/extinction page calls R, and not the reflux ratio of the "
        + "distillation pages", unit: "J/(mol·K)" },
    ],
    derivation: [
      { step: "van 't Hoff: the temperature dependence of the equilibrium "
          + "constant carries the sign of the reaction enthalpy, and nothing "
          + "else.",
        eq: String.raw`\frac{\mathrm{d}\ln K}{\mathrm{d}T}
          = \frac{\Delta H_\mathrm{rxn}}{R\,T^{2}}` },
      { step: "So an exothermic K falls with temperature, an endothermic K "
          + "rises, and the equilibrium conversion follows K." },
      { step: "A real reactor falls SHORT of equilibrium.  To make the model "
          + "fall short you must move the evaluation temperature in whichever "
          + "direction makes the equilibrium WORSE — up for exothermic, down "
          + "for endothermic." },
    ],
    note: "ONE MORE GLOSS, because the letters are overloaded across these "
      + "pages: K here is the equilibrium constant and R is the gas constant. "
      + "On the ignition/extinction page R is a heat-removal RATE in watts, "
      + "and on the distillation pages it is a reflux ratio.",
  },
  {
    n: 5,
    title: "The three caveats the engine prints on its own",
    body: "A run that declares an approach prints them every time "
      + "(GibbsReactor.cpp:150–154), and each of the three is a lesson rather "
      + "than a disclaimer.  FIRST, it is EMPIRICAL — calibrated, never "
      + "predicted.  It lumps catalyst activity, bed geometry, transport and "
      + "age into one number you fit against a plant measurement, which also "
      + "means it is a statement about a particular catalyst charge at a "
      + "particular point in its life: Johnson Matthey note that the approach "
      + "is small at start-of-run and grows steadily as a catalyst "
      + "deactivates, so an approach declared in a design case is usually an "
      + "END-OF-RUN claim.  SECOND, it is GLOBAL.  There is ONE number for the "
      + "whole reactor, and it cannot express different approaches for "
      + "different reactions — which is most damaging exactly where a Gibbs "
      + "reactor is most attractive.  A reformer runs methane reforming "
      + "(endothermic) and the water–gas shift (exothermic) on the same "
      + "catalyst: their wanted signs are OPPOSITE, so any single ΔT moves one "
      + "of them the wrong way.  THIRD, and this is the one to be afraid of: "
      + "AT HIGH PRESSURE IT WILL ABSORB MISSING FUGACITY CORRECTIONS.",
    note: "WHY THE THIRD ONE IS THE DANGEROUS ONE.  Calibrating a ΔT against "
      + "plant data asks the parameter to close whatever gap is left between "
      + "the model and the measurement — and it has no way to know what that "
      + "gap is made of.  On a 200 bar ammonia converter the non-ideality is "
      + "not a detail: Choupo's own gibbs10_ammonia_fugacity case reports "
      + "32.4 % ammonia with the package's SRK fugacity coefficients folded "
      + "in and 30.0 % with an ideal-gas package, from the same minimisation. "
      + "Fit a ΔT with the ideal package and you will find a number that works "
      + "— and what you will have calibrated is your equation of state, under "
      + "the name of catalyst performance.  It will then follow you to a "
      + "different pressure, where it is simply wrong, and nothing on the "
      + "screen will say so.  (The 32.4 % is that case's own recorded golden; "
      + "the 30.0 % was measured by switching that package's `fugacityModel` "
      + "to `idealGas` and running it.  If the case moves, this paragraph is "
      + "wrong, and the check that catches it is `bin/runTests` on the case.)",
  },
  {
    n: 6,
    title: "What Choupo does NOT have here, said rather than implied",
    body: "TWO THINGS, and both matter to a reader who has just learned the "
      + "first one.  (i) There is a SECOND quantity also called \"approach to "
      + "equilibrium\", and it is not this one: the FRACTIONAL or extent "
      + "approach, the achieved conversion divided by the equilibrium "
      + "conversion at the SAME temperature and pressure.  Nadiri and "
      + "co-workers use exactly that, calling it efficiency (S. Nadiri et al., "
      + "ChemCatChem 2024, e202400890, doi:10.1002/cctc.202400890).  The two "
      + "are not "
      + "interchangeable — the temperature approach is a HORIZONTAL distance "
      + "on a conversion-versus-temperature plot and the fractional one a "
      + "VERTICAL distance, and converting between them needs the local slope "
      + "of the equilibrium curve, which depends on the reaction enthalpy, the "
      + "pressure and the composition.  For a steep equilibrium a 10 K "
      + "approach is a small shortfall; for a flat one it is a large one.  "
      + "Choupo implements only the temperature form, and only in two places "
      + "— the `gibbsReactor` unit and the `gibbsMap` property operation. "
      + "`equilibriumReactor`, which DOES take a reaction list, reads no "
      + "approach key at all, so a case that declares an approach should say "
      + "which definition it means and can only mean this one.  (ii) The PELLET EFFECTIVENESS FACTOR is absent and announced "
      + "as absent: Choupo's kinetic reactors evaluate the rate at bulk "
      + "conditions, which is η taken as 1, and they say so without judging it "
      + "(CatalystPellet.cpp:50–54).  It is not a Gibbs-reactor parameter at "
      + "all — but it is the next rung of the same ladder, and it is the rung "
      + "that turns an assumed approach into a predicted one.",
    formula: String.raw`\eta_\mathrm{eq} = \frac{X}{X_\mathrm{eq}(T,\,P)}
\qquad \text{the FRACTIONAL approach, which Choupo does not implement}`,
    where: [
      { sym: "\\eta_\\mathrm{eq}",
        means: "the fractional approach, or efficiency: how far along the way "
        + "to equilibrium the real reactor got, as a fraction of the way "
        + "there.  1 is equilibrium", unit: "—" },
      { sym: "X", means: "the ACHIEVED conversion (or product mole fraction) "
        + "at the real outlet", unit: "mole fraction, or fractional conversion" },
    ],
    note: "The symbol η is doing double duty across this page and that is the "
      + "point of naming it twice: here it is the fractional approach to "
      + "equilibrium, and in the sentence about the pellet it is the "
      + "effectiveness factor — a different quantity, in a different model, at "
      + "a different rung of the ladder.  Neither is implemented; only one of "
      + "them is announced when it is missing.",
  },
];

export const APPROACH_LIMITS: readonly LessonLimit[] = [
  {
    id: "two-runs-not-one",
    title: "The panel runs the case TWICE; it does not declare an approach.",
    body: "Nothing on this page writes `temperatureApproach` into a dict.  The "
      + "two runs are the same case at T and at T + ΔT, and the second run's "
      + "COMPOSITION is what a declared approach would report.  Its "
      + "temperature, its enthalpy and its duty are NOT — those belong to the "
      + "physical T, which is exactly the separation step 3 is about.  Read "
      + "the composition from the shifted run and everything else from the "
      + "unshifted one, which is what the engine itself does.",
  },
  {
    id: "exact-only-for-an-ideal-gas",
    title: "That equivalence is exact HERE, and it is not exact everywhere.",
    body: "The outlet composition depends on the evaluation temperature only "
      + "through the standard Gibbs energies and, in a real-gas package, "
      + "through the fugacity coefficients (GibbsMethod.cpp:64–94 — the "
      + "residual is built from `g_eff`, `ln_P` and the atom matrix alone, "
      + "and `g_eff == g_over_RT` whenever the package's equation of state is "
      + "ideal).  Both "
      + "witnesses on this page run at 1 bar with `fugacityModel idealGas`, so "
      + "the coefficients are 1 and the two constructions agree to every digit "
      + "the engine prints.  Under a real equation of state they do NOT: the "
      + "fugacity coefficients are evaluated at the PHYSICAL temperature by a "
      + "declared approach and at the shifted one by a shifted run.  The "
      + "temperature sliders are bounded to keep both runs single-phase gas "
      + "for the same reason — condensation is decided at the physical "
      + "temperature too.",
  },
  {
    id: "global-only",
    title: "One ΔT for the whole reactor, including the reformer.",
    body: "The reforming witness carries methane reforming and the water–gas "
      + "shift at once, with opposite thermicity.  The single ΔT you drag "
      + "applies to both, which is the engine's own GLOBAL caveat made "
      + "visible.  A number that de-tunes one of them flatters the other, and "
      + "no reading of this panel can separate them.",
  },
  {
    id: "no-number-here-is-calibrated",
    title: "No ΔT on this page is fitted to anything.",
    body: "The slider is a demonstration of the mechanism, not a "
      + "recommendation.  A real approach comes from a plant measurement on a "
      + "specific catalyst at a specific point in its life; there is no "
      + "measurement anywhere in this tool, and Choupo ships no case that "
      + "declares an approach at all.",
  },
  {
    id: "equilibrium-is-not-the-only-shortfall",
    title: "A bed can also fall short for reasons a temperature cannot express.",
    body: "Bypassing, maldistribution, a poisoned inlet layer, a pressure drop "
      + "that moves the equilibrium, a selectivity loss to a species nobody "
      + "put in the list — all of them make a real outlet differ from "
      + "equilibrium, and none of them is a horizontal shift along the "
      + "equilibrium curve.  Fitting them into a ΔT is exactly the lumping "
      + "the first caveat warns about.",
  },
];
