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
  The "Choosing an electrolyte activity model" lesson, as DATA.

  The question a student arrives with: I have a solution with salts; which
  activity model should I declare, and what do I lose with the others?  The
  page answers it in six steps -- the term every model shares, what each one
  adds, the same salt under each against a measured table, the consequence
  as a design number (an osmotic pressure), the choice as four questions, and
  what happens when the catalogue lacks a pair.

  Every equation written here is the one the engine runs, and the source it
  is read from is named beside it; gui/tests/electrolyteModels.test.ts holds
  each cited line to the text it is cited for.  Every number on the page
  about a model's accuracy comes from the engine run the page makes; none is
  written in this file.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** The source lines this lesson cites, with a fragment each must contain.
 *  The test reads every file and holds the line to its fragment, so a
 *  citation cannot outlive the line it names. */
export const EM_CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "src/thermo/electrolyte/PitzerForm.H", line: 88, contains: "aPhiRef25 = 0.3915" },
  { file: "src/thermo/electrolyte/PitzerForm.H", line: 87, contains: "bDH       = 1.2" },
  { file: "src/thermo/electrolyte/AqueousActivity.cpp", line: 131, contains: "0.51 * SolventProperties::debyeHuckelFactor(T)" },
  { file: "src/thermo/electrolyte/AqueousActivity.cpp", line: 142, contains: "-A * z * z * (s / (1.0 + s) - 0.3 * I)" },
  { file: "src/thermo/electrolyte/SpeciationSolver.cpp", line: 1569, contains: "phi = 1" },
  { file: "src/thermo/electrolyte/PitzerForm.H", line: 103, contains: "(2.0 / bDH) * std::log(1.0 + bDH * sI)" },
  { file: "src/thermo/electrolyte/PitzerForm.H", line: 262, contains: "inline double bGammaSingleSalt(double alpha, double beta, double I)" },
  { file: "src/thermo/electrolyte/PitzerSingleSalt.H", line: 199, contains: "Cg = 1.5 * CphiT(T)" },
  { file: "src/thermo/electrolyte/PitzerSingleSalt.H", line: 191, contains: "fGamma(I, aPhi(T))" },
  { file: "src/thermo/electrolyte/PitzerSingleSalt.H", line: 201, contains: "return std::fabs(z_c * z_a) * fg" },
  { file: "src/thermo/electrolyte/PitzerSingleSalt.H", line: 244, contains: "osmoticCoefficient(m, T) * nu * m * Mw_solvent / 1000.0" },
  { file: "src/thermo/electrolyte/ENRTLSingleSalt.H", line: 84, contains: "tau_m_ca * (298.15 / T)" },
  { file: "src/thermo/electrolyte/ENRTLSingleSalt.H", line: 90, contains: "(1.0 + 0.001 * Mw * (nu_c + nu_a) * m)" },
  { file: "src/thermo/electrolyte/ENRTLSingleSalt.H", line: 154, contains: "(nu_c*(pdh(z_c)+lcC) + nu_a*(pdh(z_a)+lcA)) / nu" },
  { file: "src/thermo/electrolyte/SolventProperties.H", line: 78, contains: "1.807e-5" },
  { file: "src/propertyOps/ElectrolyteFit.H", line: 70, contains: "heldOut { every N; offset k; }" },
];

export const EM_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Every model starts from the same term: an ion is never ideal, even dilute",
    body: "An ion carries a charge, and a charge orders the solution around "
      + "it: ions of the opposite sign gather a little closer, ions of the "
      + "same sign stay a little further away.  That ionic atmosphere lowers "
      + "the ion's energy, so its activity is lower than its molality -- and "
      + "the effect does not vanish at the dilutions where a neutral solute "
      + "is already ideal, because the electric field reaches far.  Debye "
      + "and Hückel worked out the limit for very dilute solutions in 1923.  "
      + "Every model on this page -- Davies, Pitzer, eNRTL -- contains that "
      + "limit as its first term, and they differ only in what they add to "
      + "it.  The panel below draws the limit ALONE against the measured "
      + "table of the salt you pick.",
    derivation: [
      { step: "The ionic strength measures how much charge the solution "
          + "carries, each ion weighted by the square of its charge:",
        eq: String.raw`I = \tfrac{1}{2}\sum_i m_i z_i^2` },
      { step: "Solving Poisson's equation for the potential around one ion, "
          + "with the other ions distributed by Boltzmann's law and the "
          + "exponential linearised, gives an atmosphere of thickness "
          + "proportional to the inverse square root of I and an energy that "
          + "makes the ion's activity coefficient fall as its charge squared "
          + "times the square root of I:",
        eq: String.raw`\ln\gamma_i = -3A_\phi\, z_i^2 \sqrt{I}` },
      { step: "A single ion's coefficient cannot be measured, because a "
          + "solution is electrically neutral.  What is measured is the mean "
          + "over the ions of one salt, weighted by how many of each it "
          + "releases; electroneutrality of the salt turns the sum of squares "
          + "into the product of the two charges:",
        eq: String.raw`\ln\gamma_\pm = \frac{\nu_+\ln\gamma_+ + \nu_-\ln\gamma_-}{\nu}, \qquad \nu_+ z_+ = \nu_- \lvert z_- \rvert` },
    ],
    formula: String.raw`\ln\gamma_\pm = -3A_\phi\,\lvert z_+ z_-\rvert\sqrt{I}, \qquad \phi = 1 - A_\phi\,\lvert z_+ z_-\rvert\sqrt{I}`,
    where: [
      { sym: "I", means: "ionic strength", unit: "mol/kg" },
      { sym: "m_i", means: "molality of ion i: moles per kilogram of water", unit: "mol/kg" },
      { sym: "z_i", means: "charge number of ion i (+1 for Na+, -2 for SO4 2-)" },
      { sym: "i", means: "which ion" },
      { sym: "\\gamma_i", means: "activity coefficient of ion i on the molality scale: activity divided by molality" },
      { sym: "A_\\phi", means: "the Debye-Hückel osmotic slope of water, 0.3915 (kg/mol)^1/2 at 25 °C in the engine "
        + "(src/thermo/electrolyte/PitzerForm.H, line 88); 3 A_phi / ln 10 = 0.510 is the familiar log10 slope", unit: "(kg/mol)^1/2" },
      { sym: "\\gamma_\\pm", means: "mean ionic activity coefficient of the salt: the number measured tables report" },
      { sym: "\\nu_+", means: "cations one formula unit of the salt releases (2 for Na2SO4)" },
      { sym: "\\nu_-", means: "anions one formula unit releases (2 for CaCl2)" },
      { sym: "\\gamma_+", means: "activity coefficient of the cation" },
      { sym: "\\gamma_-", means: "activity coefficient of the anion" },
      { sym: "\\nu", means: "ions per formula unit, nu+ + nu-" },
      { sym: "z_+", means: "charge number of the cation" },
      { sym: "z_-", means: "charge number of the anion" },
      { sym: "\\phi", means: "the molal osmotic coefficient: how far the water's activity is from what the ions' "
        + "number alone would give (1 for an ideal solution)" },
    ],
    note: "The limit is exact only as the solution becomes infinitely dilute.  "
      + "The measured tables on this page start at 0.1 mol/kg, and the panel "
      + "shows how far the limit already is from them there: it keeps "
      + "falling as the square root of I, while the measured coefficient "
      + "turns and, for most salts, rises again.  What each model adds is "
      + "what bends that line back.",
  },
  {
    n: 2,
    title: "What each model adds to the limit",
    body: "Davies adds a fixed correction that depends on the charge only: "
      + "every singly charged ion gets the same coefficient, whatever it is.  "
      + "Pitzer adds terms for the short-range encounters of each cation-anion "
      + "pair, a virial expansion in the molality with two or three numbers "
      + "fitted to that salt.  eNRTL adds a local-composition term: the "
      + "water and the ion pair are both species, with interaction energies "
      + "between them, so another solvent is another set of pairs rather than "
      + "another model.  The three equations below are the ones the engine "
      + "evaluates, each read from the source file named in its line.",
    derivation: [
      { step: "Davies (AqueousActivity.cpp, line 142): the limit, softened by "
          + "a closest-approach factor, plus a linear term with the same "
          + "fixed coefficient 0.3 for every salt (the form printed as eq 17 by "
          + "Plummer and Busenberg 1982, who attribute it to Davies 1962; "
          + "the engine uses 0.3).  Nothing in it knows "
          + "which ions they are.",
        eq: String.raw`\ln\gamma_i = -\ln(10)\,A\,z_i^2\left(\frac{\sqrt{I}}{1+\sqrt{I}} - 0.3\,I\right)` },
      { step: "Pitzer (PitzerSingleSalt.H, lines 191-201; the form of Pitzer and "
          + "Mayorga 1973, eqs 3 and 6-11): the limit in an "
          + "extended form f, then a second and a third virial coefficient "
          + "of the salt -- B depends on the ionic strength through "
          + "beta(0) and beta(1), and through a third parameter beta(2) in the "
          + "records that carry one (Pitzer and Kim 1974 add it for 2-2 salts; "
          + "the catalogue's CaCl2 and MgSO4 records carry one), C is a constant.  "
          + "Three numbers per salt, four where a record carries beta(2), "
          + "read from its record in the catalogue.",
        eq: String.raw`\ln\gamma_\pm = \lvert z_+ z_-\rvert f^\gamma + m\,\frac{2\nu_+\nu_-}{\nu}\,B^\gamma + m^2\,\frac{2(\nu_+\nu_-)^{3/2}}{\nu}\,C^\gamma` },
      { step: "with the extended limit and the second virial coefficient "
          + "(PitzerForm.H, lines 98-103 and 259-262; PitzerSingleSalt.H, line 199):",
        eq: String.raw`f^\gamma = -A_\phi\left[\frac{\sqrt{I}}{1+b\sqrt{I}} + \frac{2}{b}\ln\left(1+b\sqrt{I}\right)\right], \qquad B^\gamma = 2\beta^{(0)} + \frac{2\beta^{(1)}}{\alpha_1^2 I}\left[1-\left(1+\alpha_1\sqrt{I}-\frac{\alpha_1^2 I}{2}\right)e^{-\alpha_1\sqrt{I}}\right] + \frac{2\beta^{(2)}}{\alpha_2^2 I}\left[1-\left(1+\alpha_2\sqrt{I}-\frac{\alpha_2^2 I}{2}\right)e^{-\alpha_2\sqrt{I}}\right], \qquad C^\gamma = \tfrac{3}{2}C^\phi` },
      { step: "eNRTL (ENRTLSingleSalt.H, lines 90 and 154): a Pitzer-Debye-"
          + "Hückel long-range term and an NRTL local-composition term for "
          + "each ion, averaged like the limit above, on the mole-fraction "
          + "scale; the local term holds two interaction parameters between "
          + "water and the salt, tau_m,ca and tau_ca,m, at a non-randomness "
          + "of 0.2.  The last factor converts to the molality scale.",
        eq: String.raw`\ln\gamma_\pm^{x} = \frac{\nu_+\left(\ln\gamma_+^{\mathrm{PDH}}+\ln\gamma_+^{\mathrm{lc}}\right) + \nu_-\left(\ln\gamma_-^{\mathrm{PDH}}+\ln\gamma_-^{\mathrm{lc}}\right)}{\nu}, \qquad \gamma_\pm = \frac{\gamma_\pm^{x}}{1+\nu\, m\, M_w}` },
    ],
    where: [
      { sym: "A", means: "Davies' slope on the log10 scale, 0.51 at 25 °C in the engine (AqueousActivity.cpp, line 131)", unit: "(kg/mol)^1/2" },
      { sym: "f^\\gamma", means: "Pitzer's extended Debye-Hückel term" },
      { sym: "b", means: "Pitzer's closest-approach constant, 1.2 for every salt (PitzerForm.H, line 87)", unit: "(kg/mol)^1/2" },
      { sym: "m", means: "molality of the salt", unit: "mol/kg" },
      { sym: "B^\\gamma", means: "Pitzer's second virial coefficient of the salt, as it enters the activity coefficient", unit: "kg/mol" },
      { sym: "C^\\gamma", means: "Pitzer's third virial coefficient of the salt, as it enters the activity coefficient", unit: "(kg/mol)^2" },
      { sym: "\\beta^{(0)}", means: "the salt's first Pitzer parameter, from its catalogue record", unit: "kg/mol" },
      { sym: "\\beta^{(1)}", means: "the salt's second Pitzer parameter, from its catalogue record", unit: "kg/mol" },
      { sym: "C^\\phi", means: "the salt's third Pitzer parameter, from its catalogue record", unit: "(kg/mol)^2" },
      { sym: "\\beta^{(2)}", means: "the salt's optional fourth Pitzer parameter, zero unless its catalogue record carries one", unit: "kg/mol" },
      { sym: "\\alpha_1", means: "the ionic-strength scale of beta(1): 2.0 for salts with a univalent ion "
        + "(Pitzer and Mayorga 1973, p. 2301), 1.4 for 2-2 salts (Pitzer and Kim 1974, p. 5702)", unit: "(kg/mol)^1/2" },
      { sym: "\\alpha_2", means: "the ionic-strength scale of beta(2), 12.0 (Pitzer and Kim 1974, p. 5702)", unit: "(kg/mol)^1/2" },
      { sym: "e", means: "the base of the natural logarithm" },
      { sym: "\\gamma_\\pm^{x}", means: "eNRTL's mean coefficient on the mole-fraction scale, before conversion" },
      { sym: "\\gamma_+^{\\mathrm{PDH}}", means: "the cation's long-range (Pitzer-Debye-Hückel) factor in eNRTL" },
      { sym: "\\gamma_-^{\\mathrm{PDH}}", means: "the anion's long-range factor in eNRTL" },
      { sym: "\\gamma_+^{\\mathrm{lc}}", means: "the cation's local-composition (NRTL) factor, from the two water-salt parameters" },
      { sym: "\\gamma_-^{\\mathrm{lc}}", means: "the anion's local-composition factor" },
      { sym: "M_w", means: "molar mass of water, 0.018015 kg/mol", unit: "kg/mol" },
    ],
    note: "Pitzer's coefficients and eNRTL's two energies are FITTED to a "
      + "salt's own measurements; Davies has nothing to fit.  That is the "
      + "whole trade: Davies works for any ion and is right only while the "
      + "charge dominates; the other two are right further, for the salts "
      + "the catalogue holds a record of, and refuse the rest by name (step 6).",
  },
  {
    n: 3,
    title: "The same salt under each model, against measurement",
    body: "Pick a salt.  The page writes one props case per model with one "
      + "operation per molality, runs them with choupoProps in your browser, "
      + "and draws what each returned beside the critically evaluated table "
      + "the tree carries for that salt.  Read two things.  Where does Davies "
      + "leave the measurements -- at what ionic strength does its error pass "
      + "a few per cent?  And where do Pitzer and eNRTL part from each other?  "
      + "Before believing a small error, read the table's column that says "
      + "whether the model was FITTED to that very table: an error on the "
      + "points a model was fitted to shows only that the fit worked.",
    formula: String.raw`\delta = 100\,\frac{\gamma_\pm^{\mathrm{model}} - \gamma_\pm^{\mathrm{meas}}}{\gamma_\pm^{\mathrm{meas}}}, \qquad \ln a_w = -\nu\, m\, M_w\, \phi`,
    where: [
      { sym: "\\delta", means: "the deviation of a model from a measured value, in per cent of the measured value" },
      { sym: "\\gamma_\\pm^{\\mathrm{model}}", means: "the mean ionic activity coefficient the engine computed with one model" },
      { sym: "\\gamma_\\pm^{\\mathrm{meas}}", means: "the evaluated (measured) value of the table at the same molality" },
      { sym: "a_w", means: "activity of the water" },
    ],
    note: "The osmotic coefficient is the other half of the same solution: "
      + "it measures the water rather than the ions, and the two are tied by "
      + "the Gibbs-Duhem equation.  Davies has no expression for the water: "
      + "the speciation solver takes its water activity at phi = 1 on the "
      + "species it carries (SpeciationSolver.cpp, line 1569), so its "
      + "osmotic coefficient is 1 for a salt with no ion pair, whatever the "
      + "concentration.",
  },
  {
    n: 4,
    title: "The deviation as a design number: the osmotic pressure a membrane must overcome",
    body: "A reverse-osmosis membrane passes water and holds the salt back.  "
      + "Water flows to the salty side until the pressure there rises by the "
      + "osmotic pressure, so that is the least pressure a pump must add to "
      + "push water the other way.  It depends on the activity of the water, "
      + "and therefore on the model.  An ideal solution (phi = 1) gives van 't "
      + "Hoff's law in its molality form (nu m RT times the density of pure water, "
      + "not the molarity of the solution); the measured osmotic coefficient below 1 lowers the "
      + "pressure, and where it passes 1 (for NaCl, between 2 and 2.5 mol/kg "
      + "in the table) the pressure rises past the ideal one.",
    derivation: [
      { step: "At equilibrium across the membrane the water's chemical "
          + "potential is the same on both sides: pure water at P on one, "
          + "the solution at P + Pi on the other.",
        eq: String.raw`\mu_w^{\circ}(T,P) = \mu_w^{\circ}(T,P) + \bar V_w \Pi + RT\ln a_w` },
      { step: "Cancel the pure-water potential and take the molar volume of "
          + "water as constant over the pressure step:",
        eq: String.raw`\Pi = -\frac{RT}{\bar V_w}\ln a_w = \frac{RT}{\bar V_w}\,\nu\, m\, M_w\, \phi` },
    ],
    formula: String.raw`\Pi = -\frac{RT}{\bar V_w}\ln a_w`,
    where: [
      { sym: "\\mu_w^{\\circ}", means: "chemical potential of pure water", unit: "J/mol" },
      { sym: "T", means: "temperature, 298.15 K on this page", unit: "K" },
      { sym: "P", means: "pressure on the pure-water side", unit: "Pa" },
      { sym: "\\bar V_w", means: "molar volume of water; the page uses the engine's 1.807e-5 m3/mol at 25 °C "
        + "(SolventProperties.H, line 78)", unit: "m3/mol" },
      { sym: "\\Pi", means: "osmotic pressure", unit: "Pa (shown in bar)" },
      { sym: "R", means: "gas constant, 8.314462618", unit: "J/(mol K)" },
    ],
    note: "The engine supplies a_w for each model; the line from a_w to Pi "
      + "is the page's arithmetic, printed with its constants under the "
      + "table.  The measured row converts the table's osmotic coefficient "
      + "by the formula of step 3.",
  },
  {
    n: 5,
    title: "The choice, as four questions",
    body: "The measurements answer the question for the salts the tree has "
      + "tables of.  For your own solution the choice turns on four facts "
      + "about it, asked in the order that decides: does it carry dissolved "
      + "acid gases (NH3, CO2, H2S)?  A solvent besides water?  More than one "
      + "salt?  And how high does its ionic strength go?  Answer them in the "
      + "panel; the page names the model, the word you declare, and the "
      + "reason, and quotes the deviation the run above measured for Davies "
      + "on your chosen salt at I near 0.1 and 0.5 mol/kg, so the threshold "
      + "is a number you have seen rather than a rule you were told.",
  },
  {
    n: 6,
    title: "When the catalogue has no pair: the engine refuses, by name",
    body: "Pitzer and eNRTL are only as wide as their records: one file per "
      + "cation-anion pair.  When a case asks for a pair no record holds, "
      + "the engine does not substitute a neighbour or fall back to Davies; "
      + "it stops and names the files it looked in.  The panel asks for "
      + "MgSO4 under both models -- the catalogue holds a Pitzer record for "
      + "it and no eNRTL record -- and shows what the engine answered.  To "
      + "see whether a pair exists before you declare it, look for the file "
      + "the refusal names: data/standards/parameters/eNRTL/<cation>-<anion>.dat "
      + "for eNRTL, data/standards/parameters/Pitzer/pairs/<cation>-<anion>.dat "
      + "for Pitzer.  For eNRTL a case may also carry its own pair, in "
      + "constant/electrolyte/enrtl.dat, the first place the refusal names.",
  },
];

export const EM_LIMITS: readonly LessonLimit[] = [
  {
    id: "25C",
    title: "Everything here is at 25 °C.",
    body: "The tables, the runs and the comparison are at 298.15 K, and the "
      + "page offers no temperature control.  Off 25 °C the models are not "
      + "equally prepared: 96 of the catalogue's 99 Pitzer pair records hold "
      + "their parameters at 25 °C only (three carry a temperature "
      + "dependence), and the single-salt eNRTL scales its two energies as "
      + "tau(T) = tau(25 °C) x 298.15/T and nothing else "
      + "(ENRTLSingleSalt.H, line 84), which is the engine's own simplification, "
      + "not the form Chen and Evans (1986, eq 45) give, "
      + "tau = a + b(1/T - 1/298.15) + c(...) with fitted b and c.  "
      + "Neither model is tested here away from 25 °C.",
  },
  {
    id: "in-sample",
    title: "Some of the comparisons are in-sample.",
    body: "The catalogue's eNRTL records for KCl, CaCl2 and Na2SO4 were "
      + "regressed to the very tables drawn here, so their small errors show "
      + "that the fit worked, not that the model predicts.  For CaCl2 and "
      + "Na2SO4 the regression held every fourth row out "
      + "(ElectrolyteFit.H, line 70); those rows are interleaved points of "
      + "the same source and cannot contradict it.  The page reads each "
      + "record's own source line and says which comparisons are in-sample.  "
      + "The Pitzer records and the NaCl eNRTL record are not regressed to a "
      + "table in this tree, but their authors fitted them to measurements of "
      + "the same salts at 25 °C (Pitzer and Mayorga 1973 fitted the osmotic "
      + "coefficients; Chen et al. 1982, Table 1, those of NaCl), so at 25 °C "
      + "their small errors also show the quality of a fit, not a prediction.",
  },
  {
    id: "dilute",
    title: "The measured tables start at 0.1 mol/kg.",
    body: "Below that the page has no measurement; the dilute end of each "
      + "curve is the model's alone, and step 1's limit is compared with "
      + "the table only from 0.1 mol/kg up.",
  },
  {
    id: "one-salt",
    title: "One salt in water at a time.",
    body: "The comparison is single-salt.  Mixtures of salts (pitzerHMW), a "
      + "second solvent (eNRTL mixed-solvent) and dissolved acid gases "
      + "(edwardsPitzer) appear in step 5 as answers to questions, not as "
      + "curves checked against measurement on this page.",
  },
  {
    id: "davies-range",
    title: "Davies is drawn only up to I = 2 mol/kg, and its water is ideal.",
    body: "Two mol/kg is far beyond the ionic strengths at which an "
      + "equation of this kind is normally used, far enough to see it "
      + "leave (this page has no source for the band its author stated).  "
      + "Its water activity is the ideal one on the species it "
      + "carries, so its osmotic coefficient is a statement about ion "
      + "pairing, not about the water.",
  },
  {
    id: "osmotic",
    title: "The osmotic pressure is the thermodynamic minimum.",
    body: "It takes the molar volume of pure water for the partial molar "
      + "volume of water in the solution, ignores the water's "
      + "compressibility, and says nothing about the concentration at the "
      + "membrane wall, which in a real module is higher than in the bulk.",
  },
];
