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
  The speciation-versus-pH lesson, as DATA, for the same reason every other
  lesson in this directory is: prose is the part of a tool that rots with
  nothing failing, and an argument held as data can be asserted to still run
  end to end.

  THE REASON THIS TOOL EXISTS IS NOT THE DIAGRAM.  Every textbook draws it.
  What no textbook can show is that the horizontal axis is a RESULT -- and
  that this is a CHOICE, visible in one word of the case file.  A book
  substitutes pH into the mass-action expressions, which is arithmetic and
  always works; Choupo will do that too (`pH 7.8;` fixes [H+] and DROPS the
  electroneutrality row, reporting the net charge the composition carries
  instead of forcing it to zero -- the mode a measured laboratory pH needs).
  This witness declines it: every op says `pH solve;`, so each point had to
  be a beaker somebody could weigh out and the pH came back from charge.
  A student who has understood that will never again think the pH of a
  bicarbonate solution OF GIVEN COMPOSITION is something you choose -- nor
  that an engine which lets you type one has therefore computed it.  An
  imposed-pH diagram is a different, valid specification (C150 R11): it
  needs one total left free, an acid or base amount, to carry the charge.

  WHAT THE ENGINE ACTUALLY EMITS, checked against the witness before this
  prose was written: 44 `speciate` operations, each publishing pH, the
  molality and activity coefficient of CO2(aq), HCO3- and CO3--, the ionic
  strength, the water activity, the charge residual, and three saturation
  indices.  Nothing here is computed in TypeScript.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const BJERRUM_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One family, three forms, and a proton moving between them",
    body: "Dissolve carbon dioxide in water and it does not stay one thing.  "
      + "It becomes a family: the dissolved gas CO2(aq), the bicarbonate ion "
      + "HCO3-, and the carbonate ion CO3--, each differing from the next by "
      + "one proton.  Nothing is created or destroyed as you move between "
      + "them — the total carbon is fixed — so what a diagram of this system "
      + "shows is not how much carbon there is, but which form it is in.",
    formula: String.raw`\begin{aligned}
\ce{CO2(aq) + H2O &<=> HCO3^- + H^+} &\qquad& K_1\\
\ce{HCO3^- &<=> CO3^2- + H^+} &\qquad& K_2
\end{aligned}`,
    where: [
      { sym: "K_1",
        means: "the first dissociation constant, written on dissolved CO2: the "
        + "loss of the first proton, from dissolved CO2 to bicarbonate.  In "
        + "the convention of the PHREEQC data used here, CO2(aq) stands for "
        + "all the dissolved CO2, the small amount of true carbonic acid "
        + "H2CO3 included (often written H2CO3*); the constant of the H2CO3 "
        + "molecule alone is a different, much larger number" },
      { sym: "K_2",
        means: "the second: the loss of the proton from bicarbonate to carbonate" },
    ],
    note: "The two constants are not free numbers on this page: they come "
      + "from data/standards/chemistry/CO2aq-formation.dat and "
      + "CO3-formation.dat, curated from the USGS PHREEQC database (public "
      + "domain), and each carries a van't Hoff enthalpy and a full analytic "
      + "log K(T) — which is why the temperature knob moves them.",
  },
  {
    n: 2,
    title: "The pH is not a knob here — and that is the whole lesson",
    body: "A textbook plots the three fractions against pH by putting pH into "
      + "the two mass-action expressions and solving for the ratios.  That is "
      + "arithmetic, and it always works.  Choupo will do it too: “pH 7.8;” is "
      + "a legal declaration.  Look at what it costs.  Fixing [H+] removes the "
      + "electroneutrality equation, so the run reports the net charge the "
      + "composition carries instead of forcing it to zero — the curve you "
      + "drew describes a real beaker only if something you did not write "
      + "down carries the missing charge: the Na+ or Cl- of the base or acid "
      + "that set the pH, or a buffer.  The diagram is real; its counter-ion "
      + "is untracked.  An imposed-pH diagram is a valid specification, not "
      + "a forbidden one — it answers a different question, and it describes "
      + "a real solution once it says what carries the charge: an amount of "
      + "acid or base left free to hold the pH, which equilibrium codes such "
      + "as PHREEQC let you name.  What no specification can do is fix every "
      + "total, the pH and neutrality at once.  In Choupo the given-pH mode "
      + "is for "
      + "a measured pH off a laboratory sheet, which is a datum somebody read "
      + "off an instrument.  This case declares “pH solve;” instead, so [H+] "
      + "joins the unknowns and charge is what decides it: the solution must "
      + "be electrically neutral, and given everything else in the beaker "
      + "that fixes [H+].",
    formula: String.raw`\sum_i z_i m_i = 0 \quad \longrightarrow \quad [\ce{H+}] \text{, and therefore } \mathrm{pH}`,
    where: [
      { sym: "\\sum", means: "The sum runs over every aqueous species in the "
        + "converged table — the masters, H+, OH- and every complex.  It is "
        + "not decoration: this is a row the solver assembles and imposes, "
        + "and it is the row that closes the system when the pH is unknown.  "
        + "A precipitated solid is not in it (a crystal is neutral)." },
      { sym: "z_i", means: "The charge number of species i, signed: +1 for "
        + "Na+, −2 for CO3--, 0 for a neutral such as CO2(aq).  It is not "
        + "fitted — it is read off the species' own curated identity record, "
        + "and every formation reaction is checked to conserve it before the "
        + "solve begins.", unit: "dimensionless (elementary charges, signed)" },
      { sym: "m_i", means: "The molality of species i: moles of i per "
        + "kilogram of solvent, not per litre of solution.  A concentration "
        + "declared per litre has to pass through a density before it can "
        + "enter here, and the engine announces that conversion.",
        unit: "mol/kg water" },
      { sym: "\\mathrm{pH}",
        means: "A result on this page.  With “pH solve;” the free "
        + "H+ molality joins the Newton unknowns and the row above is what "
        + "closes for it.  It is reported with its scale: −log10(γ_H · m_H) "
        + "on the Davies charge-symmetric convention, so this is a free H+ "
        + "activity — not the total proton concentration, and not the "
        + "operational scale a laboratory meter reads against buffers.",
        unit: "dimensionless (a decimal logarithm)" },
    ],
    note: "So the horizontal axis of the diagram below is not an axis anybody "
      + "set.  It is 44 separate equilibrium calculations, each landing "
      + "wherever its own charge balance puts it — which is exactly what "
      + "happens when you titrate in a laboratory, and exactly why a "
      + "titration curve has the shape it has.",
  },
  {
    n: 3,
    title: "Every point is a beaker",
    body: "Because this case does not set the pH, the only way to move along "
      + "its diagram is to change what is in the solution.  The total carbonate is held at 1 "
      + "mmol/kg throughout; what varies is how much strong acid or strong "
      + "base sits beside it.  Each of the 44 points is a real neutral "
      + "mixture — something you could weigh out and dissolve.",
    formula: String.raw`\begin{array}{ll}
\mathrm{Na}/C_T = 0 & \text{dissolved } \ce{CO2} \text{ (carbonic acid)}\\
\mathrm{Na}/C_T = 1 & \text{sodium bicarbonate } (\ce{NaHCO3})\\
\mathrm{Na}/C_T = 2 & \text{sodium carbonate } (\ce{Na2CO3})\\
\mathrm{Na}/C_T > 2 & \ce{Na2CO3} + \text{caustic soda}\\
\text{the acid side} & \text{dissolved } \ce{CO2} + \text{hydrochloric acid}
\end{array}`,
    note: "The case declares “totalsBasis stoichiometric;” to say so.  Without "
      + "it the engine reads the totals as a laboratory analysis, where a "
      + "charge imbalance means somebody mismeasured, and warns that the "
      + "solved pH absorbs the error.  That warning is right for a lab sheet "
      + "and wrong here: this imbalance is the titrant.  Declaring the basis "
      + "changes no number — it changes what the engine says about them.",
    where: [
      { sym: "C_T", means: "The total carbonate, held fixed at the same value "
        + "in all 44 beakers — the one quantity that does not vary from point "
        + "to point.  That is what makes the diagram a statement about which "
        + "form the carbon is in rather than how much of it there is.  It is "
        + "declared once as a case variable and read by every operation.",
        unit: "mol/kg water (the witness declares 0.001)" },
      { sym: "\\mathrm{Na}",
        means: "The total sodium in the beaker, added as strong "
        + "base (NaOH).  Na/C_T is therefore the titration coordinate: how "
        + "many equivalents of base per carbonate.  It is an input — the "
        + "thing you weigh out — while the pH it produces is the output.",
        unit: "mol/kg water" },
    ],
  },
  {
    n: 4,
    title: "The crossovers land on the pK's, and nobody put them there",
    body: "Read the diagram, at its default settings of 298.15 K and "
      + "1 mmol/kg total carbonate, where two curves cross.  Below the first "
      + "crossover the solution is essentially dissolved CO2; between the two "
      + "it is bicarbonate; above the second it is carbonate.  The crossovers "
      + "are where two forms are present in equal amounts — and, if every "
      + "activity coefficient were 1, that would happen at the pH equal to "
      + "the pK of the step that separates them.  The K's are inputs — the "
      + "chemistry records of step 1 — but no crossover was: nothing told "
      + "the solver where to put one, and the titration simply arrives "
      + "there.  In activities the exact statement, for the first step, is "
      + "pH = pK1 + log10(a_HCO3 / a_CO2): at equal molalities what is left "
      + "is log10(γ_HCO3 / γ_CO2), not zero.",
    formula: String.raw`\begin{aligned}
\ce{CO2(aq)} &= \ce{HCO3^-} &\quad& \text{at } \mathrm{pH}\ 6.341 &\quad& (\mathrm{p}K_1 = 6.352)\\
\ce{HCO3^-} &= \ce{CO3^2-} &\quad& \text{at } \mathrm{pH}\ 10.262 &\quad& (\mathrm{p}K_2 = 10.329)
\end{aligned}`,
    where: [
      { sym: "\\mathrm{p}K_1",
        means: "−log10 of the equilibrium constant for the first "
        + "dissociation, CO2(aq) + H2O = HCO3- + H+.  Choupo's chemistry "
        + "record writes the reaction the other way round, as a formation, "
        + "so the file carries logK25 = +6.352 for CO2aq-formation and the "
        + "number you read here is its negative-log twin — the same "
        + "constant, one convention apart, which is exactly the kind of sign "
        + "that gets copied wrong between a book and a data file",
        unit: "dimensionless" },
      { sym: "\\mathrm{p}K_2", means: "the same for the second dissociation, "
        + "HCO3- = CO3-- + H+ (the record is CO3-formation, logK25 = "
        + "−10.329).  It is nearly four pH units above pK1, which is why the "
        + "three curves separate rather than overlapping",
        unit: "dimensionless" },
    ],
    note: "Both crossovers sit slightly below the thermodynamic pK, and the "
      + "gap is that quotient of activity coefficients: the engine works in activities, a "
      + "textbook diagram works in concentrations and takes every gamma as 1. "
      + " The first crossover is moved by the bicarbonate's gamma alone — "
      + "about 0.975 there, the dissolved CO2 being neutral with gamma 1 — so "
      + "it shifts only slightly; the carbonate's own gamma there, 0.90, "
      + "moves nothing, carbonate being a trace at that pH.  The second is "
      + "moved by the ratio of the "
      + "carbonate's gamma to the bicarbonate's, and the divalent carbonate is "
      + "the one that feels it most: 0.81 against 0.95.  Both crossover "
      + "pH's are interpolated between the two beakers that bracket them: the "
      + "axis is 44 sampled points, not a continuum, and no beaker lands "
      + "exactly on a crossing.",
  },
  {
    n: 5,
    title: "The three fractions do not sum to one",
    body: "Add up the three species' molalities at any point in the middle "
      + "of the range, divide by all the carbon in the beaker, and you get "
      + "0.9997, not 1.  (The curves plotted below will not show you that: "
      + "they are renormalised onto the three, so they sum to exactly 1 by "
      + "construction, and the shortfall is printed separately beneath "
      + "them.)  That missing 0.03 % is not round-off and "
      + "it is not an error: it is a fourth species, the ion pair NaHCO3(aq), "
      + "which the curated chemistry carries and a three-curve drawing has no "
      + "room for.  The sodium you added as titrant is not a spectator — it "
      + "associates weakly with bicarbonate and takes a little of the carbon "
      + "out of the diagram you are reading.",
    note: "Look also at where that species is absent.  In the eleven beakers "
      + "with no sodium in them at all — the whole acid side, and Na/C_T = 0 "
      + "— the pair does not exist, and the "
      + "engine refuses to report a species that is not in its table rather "
      + "than printing a zero — absent and zero are different claims.  This "
      + "matters more than it looks: a real 'inert' background electrolyte "
      + "usually is not one either.  Potassium nitrate at 0.5 mol/kg puts "
      + "5.4 % of all the carbon into KHCO3(aq).",
  },
  {
    n: 6,
    title: "Two ways to move the diagram, and they are different",
    body: "Raise the temperature and the pK's themselves move: each constant "
      + "carries its own enthalpy of reaction, so the two steps respond by "
      + "different amounts and the two crossovers slide by different "
      + "distances.  Raise the ionic strength instead and the pK's do not "
      + "move at all — but the activity coefficients fall, hardest for the "
      + "divalent carbonate ion, and the crossovers move anyway.  Two "
      + "mechanisms, one appearance.",
    note: "Only the temperature knob is here.  The background-electrolyte "
      + "knob is not built.  What it would show follows from step 4 by "
      + "hand: at 0.5 mol/kg of KNO3, Davies drops the carbonate gamma from "
      + "0.903 to 0.289 and the bicarbonate's from 0.975 to 0.733 (one ionic "
      + "strength, so the univalent gamma is the fourth root of the "
      + "divalent one), and the first crossover of the free species moves "
      + "from pH 6.341 to about 6.22 (6.352 + log10 0.733).  Counting the "
      + "KHCO3(aq) pair with the bicarbonate would move it further, to about "
      + "6.17.  Two defects in the sealing machinery blocked it "
      + "and were fixed on 2026-08-30; what remains is the curation half, "
      + "which is the honest blocker — the chemistry list carries no "
      + "LiHCO3aq record, and potassium is the wrong carrier precisely "
      + "because KHCO3(aq) would take 5.4 % of the carbon out of the "
      + "diagram.  Saying so is better than a knob that half works.",
  },
];

import type { LessonLimit } from "./lessonStep.js";
export type { LessonLimit };

export const BJERRUM_LIMITS: readonly LessonLimit[] = [
  {
    id: "not-validated",
    title: "This is a structural witness, not a validation.",
    body: "No titration measurement is compared against anywhere in this "
      + "case.  The crossovers landing near the two pK's is an internal "
      + "consistency check — that the network, the activity model and the "
      + "charge balance compose into the diagram the chemistry predicts — "
      + "and not agreement with an experiment.",
  },
  {
    id: "davies-band",
    title: "The activity model is Davies, and it has a band.",
    body: "Davies is a charge-only extension of Debye-Hückel: it returns the "
      + "same gamma for every ion of the same charge and exactly 1 for every "
      + "neutral species, and it is usually quoted as useful to roughly "
      + "0.5 mol/kg ionic strength.  At the 1 mmol/kg of this diagram it is "
      + "comfortable; the run announces the band when a point leaves it.",
  },
  {
    id: "complete-only-to-the-reaction-list",
    title: "The diagram is complete only up to the reactions somebody wrote down.",
    body: "NaHCO3(aq) appears because a record for it exists.  Lithium forms "
      + "no carbonate pair here — which is a statement about this reaction "
      + "list, not about nature: LiHCO3(aq) exists and is weak, and the "
      + "database simply has nothing to say about it.  A species with no "
      + "record is invisible, and invisible is not the same as absent.",
  },
  {
    id: "no-gas-phase",
    title: "This is a closed solution: no CO2 escapes.",
    body: "Total carbonate is held fixed at every point.  A real beaker open "
      + "to the air loses CO2 as it is acidified and gains it as it is made "
      + "alkaline, which changes the total and bends the whole diagram.  "
      + "Choupo can pin a gas phase — “atmosphere { pCO2 ...; }”, as "
      + "pb82_calcite_open_co2 does — but this case deliberately does not, "
      + "because a closed system is the one the textbook diagram assumes.",
  },
  {
    id: "no-precipitation",
    title: "Nothing precipitates here, and the engine says how close it came.",
    body: "Every sodium-bearing point reports saturation indices for "
      + "nahcolite, natron and trona — 33 of the 44, the acid side having no "
      + "sodium and therefore no such mineral to be saturated in.  At "
      + "1 mmol/kg they stay far below zero, which is why this "
      + "stays a clean acid-base diagram.  Make the total carbonate a hundred "
      + "times larger and the diagram acquires a ceiling the drawing has no "
      + "way to show.",
  },
  {
    id: "one-family",
    title: "One acid-base family, chosen for that reason.",
    body: "Carbonate is two steps and three forms, the smallest system that "
      + "shows two crossovers and a middle species rising and falling between "
      + "them.  Boron would be simpler — one step, two curves crossing once "
      + "(pK 9.24) — and the catalogue carries it (the H3BO3 species and the "
      + "BOH4-formation reaction; tutorials/props/electrolyte/borate01_felmyWeare "
      + "speciates it), but this page's witness and its sliders are the "
      + "carbonate case, so boron is not drawn here.",
  },
];

/** The questions at the foot of the page (DEV.md 4c C158): drafts for
 *  Vitor's review, each testing a step and naming it. */
export const BJERRUM_QUIZ: readonly QuizQuestion[] = [
  {
    id: "which-form", steps: [1],
    q: "Moving along the carbonate family from CO2(aq) to HCO3- to CO3--, what does a speciation diagram show?",
    options: [
      "How much carbon there is in the solution",
      "Which form the fixed total carbon is in",
      "How much carbon dioxide is created at each pH",
      "How much strong acid has been consumed",
    ],
    correct: 1,
    feedback: "Nothing is created or destroyed between the forms; the total "
      + "carbon is fixed, so the diagram says which form it is in, not how "
      + "much there is (step 1).",
  },
  {
    id: "ph-not-a-knob", steps: [2, 3],
    q: "Why does the page not simply set the pH and compute the fractions?",
    options: [
      "Fixing [H+] removes the electroneutrality equation, so the curve describes a beaker only if something unwritten carries the missing charge",
      "The engine cannot accept a pH declaration",
      "The pH is a measured quantity that cannot be varied",
      "Mass action does not apply at fixed pH",
    ],
    correct: 0,
    feedback: "Declaring the pH is legal but drops the charge balance.  Here "
      + "every point is a real neutral mixture of carbonate with strong acid "
      + "or base, and the pH is the result of that beaker's own equilibrium "
      + "(steps 2 and 3).",
  },
  {
    id: "crossovers", steps: [4],
    q: "The crossovers of the curves land close to the pK values, though nobody entered them as crossovers.  What does that tell you?",
    options: [
      "The crossovers are drawn by hand on the page",
      "Two forms are present in equal amounts at the pK of the step separating them, shifted slightly by activity coefficients",
      "The activity coefficients are always exactly one",
      "The pK values depend on the total carbonate",
    ],
    correct: 1,
    feedback: "Equal amounts of two forms means pH = pK when every gamma is 1; "
      + "the engine works in activities, so the crossovers sit slightly below "
      + "the thermodynamic pK (step 4).",
  },
  {
    id: "temperature-vs-ionic", steps: [6],
    q: "Raising the ionic strength moves the crossovers although the pK values do not change.  Why?",
    options: [
      "The temperature rises with ionic strength",
      "The activity coefficients fall, hardest for the divalent carbonate ion",
      "The total carbonate changes",
      "The pK values change but are not shown",
    ],
    correct: 1,
    feedback: "Temperature moves the constants themselves, each by its own "
      + "enthalpy; ionic strength leaves the constants alone but lowers the "
      + "activity coefficients, so the crossovers move anyway (step 6).",
  },
];
