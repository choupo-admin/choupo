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
  bicarbonate solution is something you choose -- nor that an engine which
  lets you type one has therefore computed it.

  WHAT THE ENGINE ACTUALLY EMITS, checked against the witness before this
  prose was written: 44 `speciate` operations, each publishing pH, the
  molality and activity coefficient of CO2(aq), HCO3- and CO3--, the ionic
  strength, the water activity, the charge residual, and three saturation
  indices.  Nothing here is computed in TypeScript.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
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
      + "shows is not how much carbon there is, but WHICH FORM it is in.",
    formula: "CO2(aq) + H2O  ⇌  HCO3-  +  H+        K1\n"
      + "HCO3-          ⇌  CO3--  +  H+        K2",
    note: "The two constants are not free numbers on this page: they come "
      + "from data/standards/chemistry/CO2aq-formation.dat and "
      + "CO3-formation.dat, curated from the USGS PHREEQC database (public "
      + "domain), and each carries a van't Hoff enthalpy and a full analytic "
      + "log K(T) — which is why the temperature knob moves them.",
  },
  {
    n: 2,
    title: "The pH is NOT a knob here — and that is the whole lesson",
    body: "A textbook plots the three fractions against pH by putting pH into "
      + "the two mass-action expressions and solving for the ratios.  That is "
      + "arithmetic, and it always works.  Choupo will do it too: `pH 7.8;` is "
      + "a legal declaration.  Look at what it costs.  Fixing [H+] REMOVES the "
      + "electroneutrality equation, so the run reports the net charge the "
      + "composition carries instead of forcing it to zero — the curve you "
      + "drew is a set of compositions no beaker can hold.  That mode is for "
      + "a MEASURED pH off a laboratory sheet, which is a datum somebody read "
      + "off an instrument.  This case declares `pH solve;` instead, so [H+] "
      + "joins the unknowns and CHARGE is what decides it: the solution must "
      + "be electrically neutral, and given everything else in the beaker "
      + "that fixes [H+].",
    formula: "Σ z_i m_i = 0     →     [H+] , and therefore pH",
    where: [
      { sym: "Σ", means: "The sum runs over EVERY aqueous species in the "
        + "converged table — the masters, H+, OH- and every complex.  It is "
        + "not decoration: this is a row the solver assembles and imposes, "
        + "and it is the row that closes the system when the pH is unknown.  "
        + "A precipitated solid is not in it (a crystal is neutral)." },
      { sym: "z_i", means: "The charge NUMBER of species i, signed: +1 for "
        + "Na+, −2 for CO3--, 0 for a neutral such as CO2(aq).  It is not "
        + "fitted — it is read off the species' own curated identity record, "
        + "and every formation reaction is checked to conserve it before the "
        + "solve begins.", unit: "dimensionless (elementary charges, signed)" },
      { sym: "m_i", means: "The molality of species i: moles of i per "
        + "KILOGRAM OF SOLVENT, not per litre of solution.  A concentration "
        + "declared per litre has to pass through a density before it can "
        + "enter here, and the engine announces that conversion.",
        unit: "mol/kg water" },
      { sym: "pH", means: "A RESULT on this page.  With `pH solve;` the free "
        + "H+ molality joins the Newton unknowns and the row above is what "
        + "closes for it.  It is reported WITH its scale: −log10(γ_H · m_H) "
        + "on the Davies charge-symmetric convention, so this is a FREE H+ "
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
    body: "If the pH cannot be set, the only way to move along the diagram is "
      + "to change what is in the solution.  The total carbonate is held at 1 "
      + "mmol/kg throughout; what varies is how much strong acid or strong "
      + "base sits beside it.  Each of the 44 points is a real neutral "
      + "mixture — something you could weigh out and dissolve.",
    formula: "Na/C_T = 0   dissolved CO2            (carbonic acid)\n"
      + "Na/C_T = 1   sodium bicarbonate       (NaHCO3)\n"
      + "Na/C_T = 2   sodium carbonate         (Na2CO3)\n"
      + "Na/C_T > 2   Na2CO3 + caustic soda\n"
      + "the acid side  dissolved CO2 + hydrochloric acid",
    note: "The case declares `totalsBasis stoichiometric;` to say so.  Without "
      + "it the engine reads the totals as a LABORATORY ANALYSIS, where a "
      + "charge imbalance means somebody mismeasured, and warns that the "
      + "solved pH absorbs the error.  That warning is right for a lab sheet "
      + "and wrong here: this imbalance IS the titrant.  Declaring the basis "
      + "changes no number — it changes what the engine says about them.",
    where: [
      { sym: "C_T", means: "The TOTAL carbonate, held fixed at the same value "
        + "in all 44 beakers — the one quantity that does not vary from point "
        + "to point.  That is what makes the diagram a statement about WHICH "
        + "form the carbon is in rather than how much of it there is.  It is "
        + "declared once as a case variable and read by every operation.",
        unit: "mol/kg water (the witness declares 0.001)" },
      { sym: "Na", means: "The total sodium in the beaker, added as strong "
        + "base (NaOH).  Na/C_T is therefore the titration coordinate: how "
        + "many equivalents of base per carbonate.  It is an INPUT — the "
        + "thing you weigh out — while the pH it produces is the output.",
        unit: "mol/kg water" },
    ],
  },
  {
    n: 4,
    title: "The crossovers land on the pK's, and nobody put them there",
    body: "Read the diagram where two curves cross.  Below the first "
      + "crossover the solution is essentially dissolved CO2; between the two "
      + "it is bicarbonate; above the second it is carbonate.  The crossovers "
      + "are where two forms are present in equal amounts — and that happens "
      + "at the pH equal to the pK of the step that separates them.  Neither "
      + "pK was an input to any of the 44 calculations.  They are constants "
      + "inside the reaction network, and the titration simply ARRIVES there.",
    formula: "CO2(aq) = HCO3-   at pH 6.341     (pK1 = 6.352)\n"
      + "HCO3-   = CO3--   at pH 10.262    (pK2 = 10.329)",
    where: [
      { sym: "pK1", means: "−log10 of the equilibrium constant for the FIRST "
        + "dissociation, CO2(aq) + H2O = HCO3- + H+.  Choupo's chemistry "
        + "record writes the reaction the other way round, as a FORMATION, "
        + "so the file carries logK25 = +6.352 for CO2aq-formation and the "
        + "number you read here is its negative-log twin — the same "
        + "constant, one convention apart, which is exactly the kind of sign "
        + "that gets copied wrong between a book and a data file",
        unit: "dimensionless" },
      { sym: "pK2", means: "the same for the SECOND dissociation, "
        + "HCO3- = CO3-- + H+ (the record is CO3-formation, logK25 = "
        + "−10.329).  It is nearly four pH units above pK1, which is why the "
        + "three curves separate rather than overlapping",
        unit: "dimensionless" },
    ],
    note: "Both crossovers sit slightly BELOW the thermodynamic pK, and the "
      + "gap is the activity coefficients: the engine works in activities, a "
      + "textbook diagram works in concentrations and takes every gamma as 1. "
      + " The divalent carbonate ion is the one that feels it — its gamma is "
      + "0.90 at the first crossover and 0.81 at the second.  Both crossover "
      + "pH's are INTERPOLATED between the two beakers that bracket them: the "
      + "axis is 44 sampled points, not a continuum, and no beaker lands "
      + "exactly on a crossing.",
  },
  {
    n: 5,
    title: "The three fractions do not sum to one",
    body: "Add up the three species' MOLALITIES at any point in the middle "
      + "of the range, divide by all the carbon in the beaker, and you get "
      + "0.9997, not 1.  (The curves plotted below will not show you that: "
      + "they are renormalised onto the three, so they sum to exactly 1 by "
      + "construction, and the shortfall is printed separately beneath "
      + "them.)  That missing 0.03 % is not round-off and "
      + "it is not an error: it is a FOURTH species, the ion pair NaHCO3(aq), "
      + "which the curated chemistry carries and a three-curve drawing has no "
      + "room for.  The sodium you added as titrant is not a spectator — it "
      + "associates weakly with bicarbonate and takes a little of the carbon "
      + "out of the diagram you are reading.",
    note: "Look also at where that species is ABSENT.  In the ELEVEN beakers "
      + "with no sodium in them at all — the whole acid side, and Na/C_T = 0 "
      + "— the pair does not EXIST, and the "
      + "engine refuses to report a species that is not in its table rather "
      + "than printing a zero — absent and zero are different claims.  This "
      + "matters more than it looks: a real 'inert' background electrolyte "
      + "usually is not one either.  Potassium nitrate at 0.5 mol/kg puts "
      + "5.4 % of all the carbon into KHCO3(aq).",
  },
  {
    n: 6,
    title: "Two ways to move the diagram, and they are different",
    body: "Raise the temperature and the pK's THEMSELVES move: each constant "
      + "carries its own enthalpy of reaction, so the two steps respond by "
      + "different amounts and the two crossovers slide by different "
      + "distances.  Raise the ionic strength instead and the pK's do not "
      + "move at all — but the activity coefficients fall, hardest for the "
      + "divalent carbonate ion, and the crossovers move anyway.  Two "
      + "mechanisms, one appearance.",
    note: "Only the temperature knob is here.  The background-electrolyte "
      + "knob is measured and NOT built: 0.5 mol/kg of KNO3 shifts the first "
      + "crossover from pH 6.341 to 6.177 and drops the carbonate gamma from "
      + "0.903 to 0.289.  Two defects in the sealing machinery blocked it "
      + "and were fixed on 2026-08-30; what remains is the CURATION half, "
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
      + "case.  The crossovers landing near the two pK's is an INTERNAL "
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
      + "no carbonate pair HERE — which is a statement about this reaction "
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
      + "Choupo can pin a gas phase — `atmosphere { pCO2 ...; }`, as "
      + "pb82_calcite_open_co2 does — but this case deliberately does not, "
      + "because a closed system is the one the textbook diagram assumes.",
  },
  {
    id: "no-precipitation",
    title: "Nothing precipitates here, and the engine says how close it came.",
    body: "Every SODIUM-BEARING point reports saturation indices for "
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
    body: "Carbonate is two steps and three forms, which is the smallest "
      + "system where a diagram teaches anything.  Boron would be prettier "
      + "still — one step, two curves crossing once — and it is not "
      + "available: the species record for borate exists but there is no "
      + "boric-acid species and no formation reaction, which is a curation "
      + "act and not a code change.",
  },
];
