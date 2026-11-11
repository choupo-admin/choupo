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
  The salt-mixtures lesson, as DATA (DEV.md 4c C316): why two salts that
  share an ion dissolve less together than apart, and how the two Pitzer
  MIXING parameters theta and psi are read off a measured ternary solubility
  curve once the single-salt parameters are fixed by single-salt data.

  THE ONE IDEA: a solubility product is one number per salt and per
  temperature; everything a second salt changes, it changes through the
  activity coefficients.  With the single-salt parameters fixed, the only
  freedom left in a common-anion mixture is theta (the two cations meeting)
  and psi (the two cations meeting near an anion).  A measured branch is
  therefore a measurement of those two numbers -- and a fit to ONE
  temperature is in-sample there and nowhere else (C300).

  The page is organised as Understand / Experiment / Verify (C305); this file
  holds the Understand steps, the predictions asked before each run in
  Experiment, the design question and the limits.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonLimit, LessonStep, SymbolGloss };

export const SALT_MIXING_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A salt dissolves until its ions reach the solubility product",
    body: "Put NaCl crystals in water and stir.  Ions leave the crystal until "
      + "the solution's chemical potential of NaCl equals the crystal's.  "
      + "Written with molalities and activity coefficients, that equality is "
      + "one number per salt and per temperature, the solubility product.  "
      + "It says nothing about what else is dissolved: a second salt can "
      + "only act through the molalities it adds and the activity "
      + "coefficients it changes.",
    formula: String.raw`\begin{aligned}
K_\mathrm{sp}(T) &= a_M\, a_X = m_M\, \gamma_M \; m_X\, \gamma_X\\
\text{one salt alone:}\quad K_\mathrm{sp}(T) &= \left(m_\mathrm{sat}\, \gamma_\pm\right)^2,
\qquad \gamma_\pm = \sqrt{\gamma_M \gamma_X}
\end{aligned}`,
    where: [
      { sym: "K_\\mathrm{sp}", means: "The solubility product of the salt "
        + "M X (here NaCl or KCl): the ion activity product at which the "
        + "solution is in equilibrium with the anhydrous crystal.  It depends "
        + "on temperature only.", unit: "(mol/kg)² on the molality scale" },
      { sym: "T", means: "Temperature.", unit: "K" },
      { sym: "a_M", means: "The activity of the cation M (Na⁺ or K⁺), "
        + "m_M γ_M on the molality scale." },
      { sym: "a_X", means: "The activity of the anion X (Cl⁻)." },
      { sym: "m_M", means: "Molality of the cation: moles per kilogram of "
        + "WATER, not of solution.", unit: "mol/kg water" },
      { sym: "m_X", means: "Molality of the anion.  In NaCl + KCl it is the "
        + "SUM of both salts' molalities, which is the common-ion effect in "
        + "one line.", unit: "mol/kg water" },
      { sym: "\\gamma_M", means: "Activity coefficient of the cation, "
        + "referred to infinite dilution in water (γ → 1 as m → 0)." },
      { sym: "\\gamma_X", means: "Activity coefficient of the anion, same "
        + "reference." },
      { sym: "m_\\mathrm{sat}", means: "The measured solubility of the salt "
        + "in pure water at T (Farelo et al. 1993, Table 1).",
        unit: "mol/kg water" },
      { sym: "\\gamma_\\pm", means: "The mean ionic activity coefficient: "
        + "the only combination of γ_M and γ_X a measurement can see." },
    ],
    note: "A salt that forms a hydrate (LiCl·H₂O, AlCl₃·6H₂O) has a product "
      + "that also contains the water activity; NaCl and KCl crystallise "
      + "anhydrous between 293 and 363 K, so these two do not need it.",
  },
  {
    n: 2,
    title: "Two salts with one ion in common",
    body: "Now add KCl to a solution already saturated with NaCl.  Two things "
      + "happen at once.  The chloride molality rises, so to keep the product "
      + "at K_sp the sodium molality must fall: the common-ion effect, which "
      + "lowers the NaCl solubility.  The ionic strength rises too, which "
      + "changes every γ; whether that adds to the fall or works against it "
      + "depends on where the solution sits on its γ(I) curve, and a "
      + "saturated brine is far from dilute.  The page separates the two in "
      + "the first prediction.",
    formula: String.raw`\begin{aligned}
m_X &= m_M + m_N, \qquad I = \tfrac{1}{2}\sum_i z_i^2 m_i = m_X\\
K_{\mathrm{sp},M} &= m_M\,(m_M + m_N)\;\gamma_M\,\gamma_X
\end{aligned}`,
    where: [
      { sym: "m_N", means: "Molality of the second cation N (K⁺ when M is "
        + "Na⁺).", unit: "mol/kg water" },
      { sym: "I", means: "Ionic strength.  For two 1:1 chlorides it equals "
        + "the chloride molality.", unit: "mol/kg water" },
      { sym: "z_i", means: "The charge number of ion i (+1 for Na⁺ and K⁺, "
        + "−1 for Cl⁻)." },
      { sym: "m_i", means: "Molality of ion i; the sum runs over every ion "
        + "in solution.", unit: "mol/kg water" },
      { sym: "K_{\\mathrm{sp},M}", means: "The solubility product of salt "
        + "M X, the one that is saturated on this branch.",
        unit: "(mol/kg)²" },
    ],
  },
  {
    n: 3,
    title: "Pitzer's equation for the mixture: what the binaries fix, and what they cannot",
    body: "Pitzer writes ln γ as a Debye-Hückel term plus a virial series in "
      + "the molalities.  For each salt alone, three parameters (β⁽⁰⁾, β⁽¹⁾, "
      + "C^φ) are regressed from that salt's own activity and osmotic data, "
      + "and they are already in Choupo's catalogue.  In the mixture two new "
      + "terms appear, and they appear ONLY when Na⁺ and K⁺ meet: θ for a "
      + "Na⁺-K⁺ encounter, ψ for a Na⁺-K⁺-Cl⁻ triplet.  No single-salt "
      + "measurement contains them.  Set them to zero and the binaries "
      + "predict the mixture; measure the mixture and the gap between "
      + "measurement and that prediction IS θ and ψ.",
    formula: String.raw`\begin{aligned}
\ln\gamma_M ={}& F + m_X\left(2B_{MX} + Z C_{MX}\right) + S_C
 + m_N\left(2\theta_{MN} + m_X\,\psi_{MNX}\right)\\
\ln\gamma_X ={}& F + m_M\left(2B_{MX} + Z C_{MX}\right) + m_N\left(2B_{NX} + Z C_{NX}\right)
 + S_C + m_M m_N\,\psi_{MNX}\\
B_{MX} ={}& \beta^{(0)}_{MX} + \beta^{(1)}_{MX}\, g\!\left(\alpha\sqrt{I}\right),
\qquad C_{MX} = C^{\phi}_{MX}/2,\qquad Z = 2 m_X
\end{aligned}`,
    where: [
      { sym: "F", means: "The long-range Debye-Hückel term, −A_φ[√I/(1 + "
        + "b√I) + (2/b) ln(1 + b√I)], plus the ionic-strength derivatives of "
        + "the B's.  The same for every ion of charge ±1." },
      { sym: "B_{MX}", means: "The second virial coefficient of the M-X "
        + "pair; it depends on I through g.", unit: "kg/mol" },
      { sym: "B_{NX}", means: "The same for the N-X pair.", unit: "kg/mol" },
      { sym: "Z", means: "Σ|z_i| m_i, twice the chloride molality here.",
        unit: "mol/kg" },
      { sym: "C_{MX}", means: "The third virial coefficient of M X in the "
        + "activity form.", unit: "kg²/mol²" },
      { sym: "C_{NX}", means: "The same for N X.", unit: "kg²/mol²" },
      { sym: "S_C", means: "m_M m_X C_MX + m_N m_X C_NX, a term every ion "
        + "carries.", unit: "dimensionless" },
      { sym: "\\theta_{MN}", means: "The MIXING parameter of the two cations "
        + "(like charges, so it is usually small; negative means Na⁺ and K⁺ "
        + "together are slightly more stable than apart).", unit: "kg/mol" },
      { sym: "\\psi_{MNX}", means: "The TRIPLET mixing parameter: Na⁺ and "
        + "K⁺ near a Cl⁻.", unit: "kg²/mol²" },
      { sym: "\\beta^{(0)}_{MX}", means: "The single-salt parameters β⁽⁰⁾ and "
        + "β⁽¹⁾ of M X, from the catalogue record; their temperature form is "
        + "the record's own (Silvester-Pitzer for NaCl, linear slopes for "
        + "KCl).", unit: "kg/mol" },
      { sym: "\\beta^{(1)}_{MX}", means: "See β⁽⁰⁾.", unit: "kg/mol" },
      { sym: "g", means: "Pitzer's function g(x) = 2[1 − (1 + x)e^(−x)]/x²." },
      { sym: "\\alpha", means: "2 kg^½ mol^−½ for a 1:1 salt." },
      { sym: "C^{\\phi}_{MX}", means: "The single-salt third virial "
        + "parameter in the osmotic form.", unit: "kg²/mol²" },
    ],
    note: "These are the engine's own sums (src/thermo/electrolyte/"
      + "PitzerHMW.cpp, evaluate(), the cation and anion loops) reduced to "
      + "two cations and one anion; Verify shows the page's γ's beside the "
      + "engine's.  For two ions of the SAME charge the higher-order "
      + "electrostatic term E_θ is zero, so θ is the whole cation-cation "
      + "term.",
  },
  {
    n: 4,
    title: "Where the solubility product comes from",
    body: "There are two honest routes, and the page shows both.  A record "
      + "can carry a mass-action constant at 25 °C and a van't Hoff enthalpy, "
      + "as the catalogue's halite and sylvite do (from PHREEQC's database).  "
      + "Or the product can be computed from the measured solubility in pure "
      + "water and the single-salt γ_± at that molality: that route makes the "
      + "binary exact by construction, so every error left in the ternary "
      + "belongs to the mixing terms.  The ternary fits below use the second "
      + "route, as Farelo et al. did (their eq. 11).",
    formula: String.raw`\begin{aligned}
\ln K_\mathrm{sp}(T) &= \ln 10\,\log_{10} K_{25} + \frac{\Delta H}{R}\left(\frac{1}{T_\mathrm{ref}} - \frac{1}{T}\right)\\
\ln K_\mathrm{sp}(T) &= 2\ln\!\left[m_\mathrm{sat}(T)\,\gamma_\pm\!\left(m_\mathrm{sat}, T\right)\right]
\end{aligned}`,
    where: [
      { sym: "K_{25}", means: "The record's mass-action constant at 25 °C "
        + "(logK25 in data/standards/components/NaCl.dat and KCl.dat)." },
      { sym: "\\Delta H", means: "The van't Hoff enthalpy the record pairs "
        + "with it (dH).", unit: "J/mol" },
      { sym: "R", means: "The gas constant, 8.314 J/(mol K).",
        unit: "J/(mol·K)" },
      { sym: "T_\\mathrm{ref}", means: "298.15 K, where the record's "
        + "constant is stated.", unit: "K" },
    ],
    note: "The first route is only as good as its ΔH.  The catalogue's sylvite "
      + "record carries dH = 8.5 kJ/mol beside a calorimetric dissolution "
      + "enthalpy of 17.2 kJ/mol in the same file; the binary KCl solubility "
      + "it predicts falls 17 % short of Farelo's at 343 K.  The first figure "
      + "of Experiment shows it.",
  },
  {
    n: 5,
    title: "Reading θ and ψ off a measured branch is a linear fit",
    body: "At a MEASURED saturated composition every molality is known, so "
      + "the only unknowns in ln K_sp = ln(m_M m_X) + ln γ_M + ln γ_X are θ "
      + "and ψ, and they enter linearly.  Subtract the prediction with θ = ψ "
      + "= 0 and what is left is a straight-line model in the two "
      + "parameters.  Least squares on that residual is two normal "
      + "equations; the errors are then reported where the measurement "
      + "lives, in grams of salt per kilogram of water, by solving each "
      + "branch again with the fitted values.",
    formula: String.raw`\begin{aligned}
r &= \ln K_\mathrm{sp} - \ln\!\left(m_M m_X \gamma_M \gamma_X\right)\Big|_{\theta=\psi=0}\\
r &= 2 m_N\,\theta_{MN} + \left(m_N m_X + m_M m_N\right)\psi_{MNX}
\end{aligned}`,
    where: [
      { sym: "r", means: "The activity residual of one measured row: how far "
        + "the binaries-only model misses ln K_sp at the measured "
        + "composition." },
    ],
    note: "At one temperature the two columns of that design are nearly "
      + "proportional (both grow with m_N), so θ and ψ are strongly "
      + "correlated: many (θ, ψ) pairs fit equally well.  The page prints the "
      + "correlation coefficient; the held-out temperatures are what tell the "
      + "pairs apart, if anything does.",
  },
];

// ---- Experiment: the predictions asked before each run ---------------------

export interface SaltPrediction {
  id: "common-ion" | "eutonic" | "largest-mixing";
  title: string;
  prompt: string;
  /** What the page sets beside the guess (never a grade). */
  check: string;
}

export const SALT_PREDICTIONS: readonly SaltPrediction[] = [
  { id: "common-ion",
    title: "Prediction 1 · KCl into a saturated NaCl solution",
    prompt: "Adding KCl to a solution saturated with NaCl at 298 K: does the "
      + "NaCl solubility rise or fall?  Which effect do you expect to win, "
      + "the common ion or the ionic strength?",
    check: "The page then solves the NaCl branch at 0, 50, 100 and 150 g "
      + "KCl/kg water and sets the result beside Farelo's measurements." },
  { id: "eutonic",
    title: "Prediction 2 · the eutonic point with θ = ψ = 0",
    prompt: "With θ = ψ = 0, will the predicted eutonic point (both salts "
      + "saturated) lie at a higher or a lower total molality than the "
      + "mixture really has?",
    check: "Farelo et al. (1993) did not measure the eutonic, so the "
      + "comparison is with the model whose θ and ψ were fitted to their "
      + "measured branches, at the temperature you choose." },
  { id: "largest-mixing",
    title: "Prediction 3 · which of Farelo's six systems mixes most?",
    prompt: "Farelo, Fernandes & Avelino (2005) measured NaCl or KCl in "
      + "solutions of NH₄Cl, LiCl and AlCl₃.  From the charges of the ions "
      + "alone, in which system do you expect the largest mixing effect?",
    check: "For the four 1:1 systems the page computes the binaries-only "
      + "prediction from the catalogue and prints the measured minus "
      + "predicted solubility.  The two AlCl₃ systems are shown as "
      + "measured only, with the reason." },
];

export const SALT_DESIGN_QUESTION = {
  title: "Design · crystallising KCl selectively from a NaCl-KCl brine",
  prompt: "A brine saturated with both salts leaves a hot dissolver.  To "
    + "crystallise KCl without NaCl, to which temperature would you cool it? "
    + "Read the two branches before you answer: how does each salt's "
    + "solubility move with temperature?",
  note: "This is the hot-leach idea behind potash refining.  The page "
    + "computes, with the θ and ψ you have chosen, the brine saturated with "
    + "both salts at the hot temperature, the KCl that crystallises when it "
    + "is cooled with its NaCl held in solution, and whether NaCl stays "
    + "undersaturated.  It is a design exercise: no energy balance, no "
    + "kinetics, no wash, no recycle of the mother liquor.",
} as const;

// ---- Verify: what the page assumes ------------------------------------------

export const SALT_MIXING_LIMITS: readonly LessonLimit[] = [
  { id: "in-sample", title: "A mixing parameter fitted at one temperature is in-sample there",
    body: "θ and ψ fitted to the rows within ±1.5 K of one temperature "
      + "describe THOSE rows; their error at that temperature is an "
      + "in-sample error (C300 vocabulary).  Only the rows at the other "
      + "temperatures, which the fit never saw, can contradict it, and the "
      + "page reports the two errors apart." },
  { id: "anhydrous", title: "Anhydrous solids, no solid solution",
    body: "The model assumes pure NaCl and pure KCl crystals.  Farelo et "
      + "al. (1993) treat the solids that way between 293 and 360 K; NaCl "
      + "forms a dihydrate only below about 0 °C and KCl none.  LiCl "
      + "crystallises as LiCl·H₂O and AlCl₃ as AlCl₃·6H₂O (Farelo et al. "
      + "2005), whose products would carry the water activity; the page "
      + "never computes their solubility." },
  { id: "theta-T", title: "θ and ψ held constant in temperature",
    body: "The engine's records for θ(K,Na) and ψ(K,Na,Cl) are 25 °C "
      + "constants, and so is every fit here.  Holmes, Baes & Mesmer (1979) "
      + "found θ_NaK varying with temperature (Farelo et al. 1993, eq. 10); "
      + "the page offers that form as one of the models so you can see what "
      + "it buys at the held-out temperatures." },
  { id: "second-salt-T", title: "NH₄Cl and LiCl at 25 °C",
    body: "The catalogue's NH₄-Cl and Li-Cl records carry no temperature "
      + "form, so the third prediction evaluates them at their 25 °C values "
      + "for rows between 296 and 301 K." },
  { id: "aluminium", title: "AlCl₃ is not computed",
    body: "The catalogue holds no Al-Cl Pitzer record.  A 3:1 salt mixed with "
      + "a 1:1 salt also brings the unsymmetric E_θ term (non-zero for ions of "
      + "different charge), and Al³⁺ hydrolyses: Farelo et al. (2005) report "
      + "pH 2.75 and 1.47 at 0.375 and 1.49 mol/kg AlCl₃.  The page shows "
      + "those systems as measured." },
];
