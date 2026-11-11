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
  The `sle-pair` lesson, as DATA (DEV.md 4c C316): a binary pair obtained
  INDIRECTLY, from the solubility of a solid.  Same reason as every other
  lesson module: prose rots with nothing failing, and data can be asserted.

  Every number written into the prose below is recomputed by
  tests/slePair.test.ts from slePairData.ts and slePairMath.ts and held to
  the printed digits; a number that moves fails that test, not a reader.

  Every claim about the ENGINE carries the file and line it was read at, and
  the same test reads each line back (SLE_ENGINE_SOURCES).
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

/** One engine claim and the line it was read at; the test reads it back. */
export interface EngineSource { file: string; line: number; contains: string; claim: string }

export const SLE_ENGINE_SOURCES: readonly EngineSource[] = [
  { file: "src/thermo/activityCoefficient/NRTL.cpp", line: 376,
    contains: "scalar t = a(i,j) + b(i,j) / T;",
    claim: "the engine's NRTL builds tau_ij = a_ij + b_ij/T; this page uses a_ij = 0" },
  { file: "src/thermo/activityCoefficient/NRTL.cpp", line: 415,
    contains: "lnGamma[i] = termA + termB;",
    claim: "ln gamma_i is the sum of the two NRTL terms; slePairMath.ts transcribes the "
      + "loop and a test holds it to the engine's printed gamma to 1e-10" },
  { file: "src/thermo/phase/SolidPhase.H", line: 46,
    contains: "f_solid(T) = Psat(T) * exp(-dG_fus(T) / (R T))",
    claim: "the engine's crystallising solid is the same condition, written as a fugacity" },
  { file: "src/thermo/phase/SolidPhase.H", line: 124,
    contains: "THE NEGLECTED HEAT-CAPACITY TERM",
    claim: "the engine drops the dCp term too, and announces it" },
  { file: "src/unitOperations/flash/IsothermalFlash.cpp", line: 110,
    contains: "FlashSolution solveSLE(",
    claim: "the flash has a liquid + crystallising-solid branch (used today for ice)" },
  { file: "src/propertyOps/FitParameters.cpp", line: 406,
    contains: "kind != \"T_bubble\" && kind != \"P_bubble\"",
    claim: "the engine's pair fitter reads bubble-point and liquid-liquid evidence only: "
      + "no solubility of a solid" },
];

export const SLE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A solid dissolves until its molecules are as content in the liquid as in the crystal",
    body: "Put crystals of benzoic acid in a solvent and stir.  Molecules leave the crystal "
      + "until the liquid holds as many as it can at that temperature: the liquid is then "
      + "SATURATED, and its mole fraction of acid is the solubility \\(x_1\\).  At that point "
      + "the acid's chemical potential is the same in the crystal and in the solution.  "
      + "Measure the solution against a reference that is easy to reason about — the pure "
      + "acid as a LIQUID at the same temperature, even below its melting point — and the "
      + "condition becomes one line: the activity of the acid in solution equals the "
      + "ratio of the crystal's fugacity to the pure liquid's.",
    formula: String.raw`x_1\,\gamma_1 \;=\; \frac{f_1^\mathrm{solid}(T)}{f_1^\mathrm{liquid}(T)} \;=\; \exp\!\left(-\frac{\Delta G_\mathrm{fus}(T)}{R\,T}\right)`,
    where: [
      { sym: "x_1", means: "The mole fraction of the dissolved solid (component 1) in the saturated liquid: the solubility." },
      { sym: "\\gamma_1", means: "The activity coefficient of the solid's molecules in the solution, against the pure subcooled liquid: 1 for an ideal solution." },
      { sym: "f_1^\\mathrm{solid}", means: "The fugacity of the pure crystal at T.", unit: "Pa" },
      { sym: "f_1^\\mathrm{liquid}", means: "The fugacity the pure acid would have as a liquid at the same T (below its melting point this liquid is hypothetical, subcooled).", unit: "Pa" },
      { sym: "\\Delta G_\\mathrm{fus}", means: "The Gibbs energy of melting one mole of the crystal at T: positive below the melting point, zero at it.", unit: "J/mol" },
      { sym: "R", means: "The gas constant, 8.314462618 J/(mol·K).", unit: "J/(mol·K)" },
      { sym: "T", means: "The temperature of the saturated solution.", unit: "K" },
    ],
    note: "The solvent appears nowhere on the right-hand side.  Everything the solvent does "
      + "to the solubility goes through \\(\\gamma_1\\) — which is why a solubility measures an "
      + "activity coefficient.",
  },
  {
    n: 2,
    title: "The melting Gibbs energy, from two measured numbers of the solid",
    body: "\\(\\Delta G_\\mathrm{fus}\\) at T is not measured directly.  It is built from what is "
      + "measured at the melting point — the temperature \\(T_\\mathrm{fus}\\) and the enthalpy "
      + "\\(\\Delta H_\\mathrm{fus}\\), both read by differential scanning calorimetry — carried "
      + "down to T along a path through the melting point.  The heat capacity of the liquid "
      + "and of the crystal differ by \\(\\Delta C_p\\), and that difference adds the second term.",
    formula: String.raw`\ln(x_1\gamma_1) = -\frac{\Delta H_\mathrm{fus}}{R}\left(\frac{1}{T}-\frac{1}{T_\mathrm{fus}}\right) + \frac{\Delta C_p}{R}\left(\frac{T_\mathrm{fus}}{T}-1+\ln\frac{T}{T_\mathrm{fus}}\right)`,
    where: [
      { sym: "\\Delta H_\\mathrm{fus}", means: "The molar enthalpy of fusion of the crystal, measured at its melting point.", unit: "J/mol" },
      { sym: "T_\\mathrm{fus}", means: "The melting temperature of the crystal (taken equal to its triple point; the difference is a few millikelvin).", unit: "K" },
      { sym: "\\Delta C_p", means: "The molar heat capacity of the liquid minus that of the crystal, at the melting point, taken constant below it.", unit: "J/(mol·K)" },
      { sym: "\\Delta H", means: "The enthalpy of melting at T (liquid minus crystal), along the path in the derivation.", unit: "J/mol" },
      { sym: "\\Delta S", means: "The entropy of melting at T, along the same path.", unit: "J/(mol·K)" },
    ],
    derivation: [
      { step: "Along a path crystal at T → crystal at the melting point → liquid there → liquid back at T:",
        eq: String.raw`\Delta H(T) = \Delta H_\mathrm{fus} + \Delta C_p\,(T - T_\mathrm{fus}), \qquad \Delta S(T) = \frac{\Delta H_\mathrm{fus}}{T_\mathrm{fus}} + \Delta C_p \ln\frac{T}{T_\mathrm{fus}}` },
      { step: "Then G = H − TS, divided by −RT:",
        eq: String.raw`-\frac{\Delta G_\mathrm{fus}(T)}{R\,T} = -\frac{\Delta H_\mathrm{fus}}{R}\left(\frac{1}{T}-\frac{1}{T_\mathrm{fus}}\right) + \frac{\Delta C_p}{R}\left(\frac{T_\mathrm{fus}}{T}-1+\ln\frac{T}{T_\mathrm{fus}}\right)` },
    ],
  },
  {
    n: 3,
    title: "The ideal solubility belongs to the solid alone",
    body: "Set \\(\\gamma_1 = 1\\) and drop the heat-capacity term: what is left is the IDEAL "
      + "solubility.  It depends on the solid's two measured numbers and on T, and on nothing "
      + "else — it is the same in every solvent.  On a plot of \\(\\ln x\\) against \\(1/T\\) it "
      + "is a straight line of slope \\(-\\Delta H_\\mathrm{fus}/R\\) that reaches "
      + "\\(x = 1\\) at the melting point.  For benzoic acid (Wang, Lai & Chen 2010: "
      + "396.08 K, 18.05 kJ/mol) it is 0.165 at 298.15 K.  A second laboratory "
      + "(Yang, Thati & Rasmuson 2012: 394.95 K, 16.82 kJ/mol) gives 0.190: the two "
      + "measured fusion enthalpies differ by 7 %, and the ideal solubility by 15 %.  "
      + "Every activity coefficient this page extracts carries that spread.",
    formula: String.raw`\ln x_1^\mathrm{id} = -\frac{\Delta H_\mathrm{fus}}{R}\left(\frac{1}{T}-\frac{1}{T_\mathrm{fus}}\right)`,
    where: [
      { sym: "x_1^\\mathrm{id}", means: "The ideal solubility: the mole fraction a saturated IDEAL solution would hold (γ = 1, ΔCp term dropped)." },
    ],
  },
  {
    n: 4,
    title: "The heat-capacity term: measured, sized, then neglected",
    body: "Yang, Thati & Rasmuson (2012) measured the heat capacity of crystalline benzoic acid "
      + "up to 369 K and of the liquid from 407 K.  A straight line through each, extrapolated "
      + "to the melting point, gives \\(\\Delta C_p\\) = 44.7 J/(mol·K).  The term it adds to "
      + "\\(\\ln x_1^\\mathrm{id}\\) is 0.239 at 298.15 K — a factor 1.27 on the solubility, not "
      + "small — and 0.0589 at 342.8 K, the warmest measurement.  This page neglects it, as the "
      + "engine's crystallising solid does.  The consequence is precise: every \\(\\gamma_1\\) "
      + "extracted without the term is the true one divided by \\(\\exp\\) of the term, and the "
      + "fitted pair absorbs that.  The pair is then correct ONLY when it is used again with "
      + "the same neglect — inside a model that omits \\(\\Delta C_p\\) — and is wrong by up to "
      + "that factor in one that includes it.  The Verify moment lists the term at every "
      + "measured temperature.",
    formula: String.raw`\ln\gamma_1^\mathrm{extracted} = \ln\gamma_1 - \frac{\Delta C_p}{R}\left(\frac{T_\mathrm{fus}}{T}-1+\ln\frac{T}{T_\mathrm{fus}}\right)`,
    where: [
      { sym: "\\gamma_1^\\mathrm{extracted}", means: "The activity coefficient a measurement yields when the ΔCp term is left out of the ideal solubility." },
    ],
  },
  {
    n: 5,
    title: "Each measured solubility is one activity coefficient",
    body: "Divide: the ideal solubility at the temperature of the measurement over the "
      + "measured solubility.  Above 1 the solvent pushes the acid out (it dissolves less "
      + "than ideally); below 1 the solvent holds it (it dissolves more).  Benzoic acid in "
      + "acetone gives \\(\\gamma_1\\) from 0.761 to 0.948 over the eleven points of Long et al. "
      + "(2010): acetone accepts the acid's hydrogen bond.  In cyclohexane it gives 35.3 at "
      + "283 K: the acid has no partner there and stays as its own dimer.",
    formula: String.raw`\gamma_1 = \frac{x_1^\mathrm{id}(T)}{x_1^\mathrm{meas}}`,
    where: [
      { sym: "x_1^\\mathrm{meas}", means: "The measured solubility at T." },
    ],
  },
  {
    n: 6,
    title: "Two NRTL parameters from those activity coefficients",
    body: "The NRTL model writes \\(\\ln\\gamma_1\\) for a binary as a function of composition and "
      + "temperature through two interaction energies.  This page holds the non-randomness "
      + "\\(\\alpha\\) at 0.3 and fits \\(b_{12}\\) and \\(b_{21}\\) — the same form the engine "
      + "evaluates, with its \\(a_{ij}\\) set to zero — by least squares on \\(\\ln\\gamma_1\\).  "
      + "Every fourth measurement is HELD OUT of the fit and only predicted afterwards: the "
      + "residual on the points the fit saw is IN-SAMPLE, the one on the points it did not see "
      + "is HELD-OUT, and only the second could have contradicted the pair.",
    formula: String.raw`\begin{aligned}
\ln\gamma_1 &= x_2^2\left[\tau_{21}\left(\frac{G_{21}}{x_1+x_2G_{21}}\right)^2 + \frac{\tau_{12}\,G_{12}}{(x_2+x_1G_{12})^2}\right]\\
\tau_{12} &= \frac{b_{12}}{T},\quad \tau_{21} = \frac{b_{21}}{T},\quad G_{ij} = \exp(-\alpha\,\tau_{ij})\\
\min_{b_{12},\,b_{21}} &\sum_k \left(\ln\gamma_{1,k}^\mathrm{NRTL} - \ln\gamma_{1,k}\right)^2
\end{aligned}`,
    where: [
      { sym: "x_2", means: "The mole fraction of the solvent, 1 − x₁." },
      { sym: "\\tau_{12}", means: "The dimensionless interaction parameter for the pair, indices in the engine's order (τ_ij = a_ij + b_ij/T, here a_ij = 0); τ₂₁ likewise with the indices swapped." },
      { sym: "\\tau_{21}", means: "As τ₁₂, with the indices swapped." },
      { sym: "G_{12}", means: "exp(−α τ₁₂): the local-composition weight; G₂₁ likewise." },
      { sym: "G_{21}", means: "exp(−α τ₂₁)." },
      { sym: "G_{ij}", means: "Either of the two weights." },
      { sym: "\\tau_{ij}", means: "Either of the two interaction parameters." },
      { sym: "b_{12}", means: "The fitted interaction energy over R, solvent around solute.", unit: "K" },
      { sym: "b_{21}", means: "The fitted interaction energy over R, solute around solvent.", unit: "K" },
      { sym: "\\alpha", means: "The NRTL non-randomness, held at 0.3 (the page lets you change it)." },
      { sym: "\\gamma_{1,k}", means: "The activity coefficient extracted from measurement k (step 5)." },
      { sym: "\\gamma_{1,k}^\\mathrm{NRTL}", means: "The model's value at the same T and x₁." },
      { sym: "k", means: "The index of a fitted measurement." },
    ],
  },
  {
    n: 7,
    title: "What the measurements cannot see",
    body: "Every point lies on the saturation line, so it reports \\(\\gamma_1\\) only where "
      + "the solution is saturated: in acetone between \\(x_1\\) = 0.127 and 0.303, over 45 K.  "
      + "Nothing in it measures \\(\\gamma_2\\), the solvent's coefficient, and nothing measures "
      + "the acid-rich end.  Two pairs that agree on every measurement can disagree there by "
      + "orders of magnitude: the pair fitted to the cold half of the acetone data reproduces "
      + "that half, and predicts \\(\\gamma_2^\\infty\\) at 320 K about 190 000 times "
      + "larger than the pair fitted to all of it.  An SLE-only pair describes the "
      + "solvent-rich side it was measured on, and is a guess at the other end.",
    formula: String.raw`\gamma_2^\infty = \lim_{x_1 \to 1} \gamma_2`,
    where: [
      { sym: "\\gamma_2", means: "The activity coefficient of the solvent in the solution." },
      { sym: "\\gamma_2^\\infty", means: "The solvent's activity coefficient at infinite dilution in the molten solid: the acid-rich end." },
    ],
  },
];

/** A prediction the student writes BEFORE the page computes (C305). */
export interface SlePrediction { id: "positive" | "tfus" | "rank"; title: string; prompt: string; check: string }

export const SLE_PREDICTIONS: readonly SlePrediction[] = [
  { id: "positive", title: "Prediction (a) · a positive deviation",
    prompt: "Benzoic acid in cyclohexane has γ₁ > 1 (positive deviation).  Is its real "
      + "solubility higher or lower than the ideal one?  And by how much, at x₁ = 0.1: an ideal "
      + "solution of x₁ = 0.1 is saturated at 278.9 K — at what temperature is the real one?",
    check: "The page then shows the measured solubility in cyclohexane beside the ideal "
      + "one at 298 K, and the saturation temperature of x₁ = 0.1 read from the "
      + "measurements (interpolated in ln x against 1/T between the two that bracket it)." },
  { id: "tfus", title: "Prediction (b) · a solid that melts 10 K higher",
    prompt: "Keep the solvent (acetone) and the fitted pair, keep ΔH_fus, and raise "
      + "T_fus by 10 K.  What happens to the solubility at 298.15 K: rises, falls or stays?  "
      + "By how much?",
    check: "The page recomputes the ideal and the predicted solubility with the higher "
      + "melting point; the pair is unchanged, because the solvent is." },
  { id: "rank", title: "Prediction (c) · a design question: which solvent?",
    prompt: "You must dissolve as much benzoic acid as possible at room temperature, in "
      + "acetone, acetic acid or cyclohexane.  Rank the three, most to least.",
    check: "The page then shows the three measured solubilities nearest 298 K (one "
      + "article, one method), the ideal solubility — the same for all three — and the γ₁ "
      + "each implies." },
];

export const SLE_LIMITS: readonly LessonLimit[] = [
  { id: "pure-crystal", title: "The crystal is pure",
    body: "No solvent enters the lattice (no solid solution) and no solvate forms.  A solid "
      + "that crystallises with solvent has a different \\(\\Delta H_\\mathrm{fus}\\) and "
      + "melting point, and the extracted \\(\\gamma_1\\) would be wrong by the difference." },
  { id: "one-polymorph", title: "One solid form",
    body: "The fusion data and the solubility must belong to the same polymorph.  Benzoic "
      + "acid has one stable form at these temperatures; many pharmaceuticals do not." },
  { id: "no-dcp", title: "ΔCp neglected",
    body: "As step 4 says, with its size at every measured temperature in the Verify table.  "
      + "The pair absorbs the omission and is consistent only with a model that omits it too." },
  { id: "nrtl-form", title: "One model form, two parameters",
    body: "τ = b/T with a = 0 and α fixed.  If the residuals of a fit form a pattern instead "
      + "of scattering about zero, the form cannot follow the data: cyclohexane, where the "
      + "acid dimerises, shows it — select it in the fit and read the residuals." },
  { id: "one-lab", title: "One laboratory",
    body: "All four solubility series come from one article.  Under DEV.md 4c C300 a pair "
      + "fitted to one laboratory's evidence cannot be graded clean whatever its residual "
      + "(singleLaboratory cap): the held-out residual tests the pair against that "
      + "laboratory's other points, not against another laboratory." },
  { id: "eutectic", title: "No eutectic",
    body: "The solvent's own crystal (cyclohexane freezes at about 280 K, acetic acid at "
      + "about 290 K) is not modelled, so the curve is not drawn to a eutectic: it stops "
      + "where the measurements stop, and its continuation to the melting point is drawn "
      + "dashed as what it is — an extrapolation of the pair." },
];
