/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  oneFluxManyUnitsLesson — the lesson text of the `one-flux-many-units`
  EduTool (DEV.md 4c C401): one interfacial flux, and the many forms in which
  its film coefficients, its Henry's-law constant and its overall coefficient
  are written; then a reaction in the liquid film.

  EVERY EQUATION WAS READ IN A FILED SOURCE, and each says where: Treybal
  (1980), Seader et al. (2016), Sander (2015), Taylor and Kooijman (2014) and
  Missen et al. (1999), with the equation numbers and printed pages.  Every
  number the page shows is its own arithmetic (gui/src/case/
  oneFluxManyUnits.ts); the engine is cited by file:line where it uses one of
  these forms, and gui/tests/oneFluxManyUnits.test.ts holds each cited line to
  the text this lesson claims for it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** The student's task, one sentence, written first (CLAUDE.md §10: design a
 *  screen from the user's task). */
export const OFMU_TASK = "I have a film coefficient from a correlation, a Henry's-law constant from a table and a "
  + "flux to compute: which form is each one in, how do I get the form my equation needs, and what changes "
  + "when the gas reacts in the liquid?";

/** What Choupo's engine does with these forms, each claim at its line. */
export const OFMU_ENGINE_SCOPE = "The engine computes none of the numbers on this page; every one is the page's own "
  + "arithmetic, from the formula printed beside it.  Where the engine uses one of these forms it is cited.  "
  + "The rate-based packed segment (model rateBased) takes its film coefficients from the packing correlation in "
  + "velocity units: the gas coefficient k_G in m/s (PackingRBF.cpp:127), the liquid one k_L in m/s "
  + "(PackingRBF.cpp:129), and the effective area a_e in m²/m³ (PackingRBF.cpp:133).  It multiplies each by its "
  + "phase's molar density (RateBasedSegment.cpp:424), which is the conversion to the mole-fraction form k_y = "
  + "c_G k_c of step 1, then by a_e and the segment's volume A_T Δz, and divides by a reference boil-up V_ref: "
  + "its β_V = c_G k_G a_e A_T Δz/V_ref is k_y a times the segment's volume, made dimensionless by V_ref "
  + "(RateBasedSegment.cpp:425; β_L the same for the liquid, RateBasedSegment.cpp:426).  The Henry records store "
  + "a pressure (HenrysLaw.cpp:50) that is p/x, and a Henry solute's K-value is that pressure over the total "
  + "pressure (ThermoPackage.cpp:1277): the slope m of step 3.";

export const OFMU_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One flux, five coefficients",
    body: "A solute A crosses a gas film into a liquid.  Its flux N_A, in moles per unit of interface area per unit "
      + "of time, is ONE number.  What changes from book to book, and from correlation to correlation, is the "
      + "driving force the flux is divided by: a difference of mole fractions, of molar concentrations or of partial "
      + "pressures.  Each choice gives a coefficient with its own units, and each is the same flux.  In the gas, "
      + "N_A = k_y Δy = k_c Δc = k_p Δp; in the liquid, N_A = k_x Δx = k_L Δc (Seader et al., Eqs. 3-180, 3-181, "
      + "3-193 and Table 3.12, pp. 76-78; Treybal, Eqs. 3.3-3.6, p. 48).  Because the flux is the same, the "
      + "coefficients are tied by the factor that turns one driving force into another: the gas molar density c_G "
      + "for a concentration, the total pressure P for a partial pressure, the liquid's total molar concentration c "
      + "for a liquid concentration.  A coefficient per unit VOLUME of contactor, k a, is the same coefficient times "
      + "the interfacial area per volume a; packed-bed correlations often give k a, or k and a separately.  The "
      + "coefficients defined here are the LOW-FLUX (equimolar) ones: the form a correlation measured at small "
      + "transfer rates gives (Taylor and Kooijman, Eq. 3.44 and its discussion, p. 111, where k has the units of a "
      + "velocity).  Step 2 corrects them for a film that only one component crosses.  Use the converter below: "
      + "type a coefficient in any form and unit, and the state that fixes the factors, and read every other form.",
    derivation: [
      { step: "The gas is ideal, so its molar density is c_G = P/(R T); a mole-fraction difference is a "
          + "concentration difference over c_G and, by Dalton's law, a partial-pressure difference over P:",
        eq: String.raw`\Delta y = \frac{\Delta c}{c_G} = \frac{\Delta p}{P}, \qquad c_G = \frac{P}{R\,T}` },
      { step: "The same N_A divided by the three driving forces gives Seader's Eq. 3-201 (Treybal's Table 3.1, p. 49, "
          + "writes the same chain for its equimolar coefficients):",
        eq: String.raw`k_y = k_c\,c_G = k_c\,\frac{P}{R\,T} = k_p\,P` },
      { step: "In the liquid a mole-fraction difference is a concentration difference over the total molar "
          + "concentration c = ρ_L/M_L (Seader Eq. 3-200):",
        eq: String.raw`k_x = k_L\,c = k_L\,\frac{\rho_L}{M_L}` },
      { step: "Per unit volume of contactor, every coefficient is multiplied by the interfacial area per volume:",
        eq: String.raw`N_\mathrm{A}\,a = (k_y\,a)\,\Delta y = (k_L\,a)\,\Delta c` },
    ],
    formula: String.raw`\begin{aligned} N_\mathrm{A} &= k_y\,\Delta y = k_c\,\Delta c = k_p\,\Delta p && \text{gas} \\ N_\mathrm{A} &= k_x\,\Delta x = k_L\,\Delta c && \text{liquid} \end{aligned}`,
    where: [
      { sym: "N_\\mathrm{A}", means: "molar flux of the solute A across the interface", unit: "mol/(m² s)" },
      { sym: "k_y", means: "gas film coefficient per mole-fraction difference", unit: "mol/(m² s)" },
      { sym: "k_c", means: "gas film coefficient per molar-concentration difference (a velocity)", unit: "m/s" },
      { sym: "k_p", means: "gas film coefficient per partial-pressure difference", unit: "mol/(m² s Pa)" },
      { sym: "k_x", means: "liquid film coefficient per mole-fraction difference", unit: "mol/(m² s)" },
      { sym: "k_L", means: "liquid film coefficient per molar-concentration difference (a velocity)", unit: "m/s" },
      { sym: "\\Delta y", means: "difference of the gas mole fraction of A across the gas film" },
      { sym: "\\Delta c", means: "difference of the molar concentration of A across the film", unit: "mol/m³" },
      { sym: "\\Delta p", means: "difference of the partial pressure of A across the gas film", unit: "Pa" },
      { sym: "\\Delta x", means: "difference of the liquid mole fraction of A across the liquid film" },
      { sym: "c_G", means: "molar density of the gas, P/(R T)", unit: "mol/m³" },
      { sym: "P", means: "total pressure", unit: "Pa" },
      { sym: "R", means: "molar gas constant, 8.314462618", unit: "J/(mol K)" },
      { sym: "T", means: "temperature", unit: "K" },
      { sym: "c", means: "total molar concentration of the liquid", unit: "mol/m³" },
      { sym: "\\rho_L", means: "liquid density", unit: "kg/m³" },
      { sym: "M_L", means: "molar mass of the liquid", unit: "kg/mol" },
      { sym: "a", means: "interfacial area per unit volume of contactor", unit: "m²/m³" },
    ],
    note: "The names are the trap, not the arithmetic.  Seader writes k_c for the liquid coefficient per "
      + "concentration (Eq. 3-181) and k_c again for the gas one (Eq. 3-201); Treybal calls the liquid one k_L; "
      + "Missen calls the two films k_Ag (per pressure) and k_Al (per concentration).  The table under the "
      + "converter lists who calls what.",
  },
  {
    n: 2,
    title: "A film only one component crosses: the drift factor",
    body: "In distillation the two components cross the interface in roughly equal and opposite amounts, and the "
      + "low-flux coefficient of step 1 applies.  In absorption the carrier gas B does not dissolve: only A "
      + "crosses, and A rides on the bulk flow it creates itself.  Taylor and Kooijman write the flux as diffusion "
      + "plus that bulk flow (their Eq. 3.8) and solve the film model when B stands still: their Eq. 3.82, a "
      + "logarithm (p. 117).  Rewritten over the ordinary driving force, the logarithm becomes the low-flux "
      + "coefficient divided by the LOG MEAN of the mole fraction of B across the film, (y_B)_LM.  So the "
      + "coefficient for A through stagnant B is k/(y_B)_LM; Seader writes it k′ (Eqs. 3-202, 3-203, p. 78), "
      + "Treybal writes it k_y, with F in Table 3.1 the coefficient that carries no such factor.  The two books "
      + "put the PRIME on opposite coefficients: in Treybal k′ is the equimolar one (Eqs. 3.5, 3.6, p. 48); in "
      + "Seader k′ is the one corrected for the stagnant film.  This page writes k^s for the stagnant film and no "
      + "mark for the low-flux coefficient.  For a dilute gas (y_B)_LM is close to 1 and the correction is small; at "
      + "8.5 % SO₂ it is 1/0.915 = 1.09 (Seader Example 3.18 (c), p. 80).",
    derivation: [
      { step: "The flux of A is its diffusion flux plus its share of the total flux N_t (Taylor and Kooijman Eq. 3.8); "
          + "the low-flux coefficient k, a velocity, sets the diffusion flux (their Eq. 3.44):",
        eq: String.raw`N_\mathrm{A} = J_\mathrm{A} + y_\mathrm{A}\,N_t, \qquad J_\mathrm{A} = c\,k\,\Delta y` },
      { step: "If B does not cross (N_B = 0, so N_t = N_A), the film model gives Taylor and Kooijman's Eq. 3.82, here "
          + "with the bulk b and the interface i at the two faces of the gas film:",
        eq: String.raw`N_\mathrm{A} = c\,k\,\ln\frac{1 - y_{\mathrm{A},i}}{1 - y_{\mathrm{A},b}}` },
      { step: "Multiply and divide by y_A,b − y_A,i.  What multiplies the driving force is c k over the log mean of "
          + "1 − y_A, the mole fraction of B:",
        eq: String.raw`N_\mathrm{A} = \frac{c\,k}{y_\mathrm{B,LM}}\,(y_{\mathrm{A},b} - y_{\mathrm{A},i}), \qquad y_\mathrm{B,LM} = \frac{(1 - y_{\mathrm{A},i}) - (1 - y_{\mathrm{A},b})}{\ln\left[(1 - y_{\mathrm{A},i})/(1 - y_{\mathrm{A},b})\right]}` },
    ],
    formula: String.raw`k_y^\mathrm{s} = \frac{k_y}{y_\mathrm{B,LM}}, \qquad k_x^\mathrm{s} = \frac{k_x}{x_\mathrm{B,LM}}`,
    where: [
      { sym: "J_\\mathrm{A}", means: "diffusion flux of A, relative to the molar-average velocity", unit: "mol/(m² s)" },
      { sym: "y_\\mathrm{A}", means: "mole fraction of A in the gas" },
      { sym: "N_t", means: "total molar flux, the sum over the components", unit: "mol/(m² s)" },
      { sym: "k", means: "low-flux film coefficient as a velocity (Taylor and Kooijman's k)", unit: "m/s" },
      { sym: "y_{\\mathrm{A},b}", means: "mole fraction of A in the bulk gas" },
      { sym: "y_{\\mathrm{A},i}", means: "mole fraction of A in the gas at the interface" },
      { sym: "y_\\mathrm{B,LM}", means: "log mean of the mole fraction of B, 1 − y_A, across the gas film: the drift factor" },
      { sym: "k_y^\\mathrm{s}", means: "gas coefficient for A through stagnant B (Seader's k′_y; Treybal's k_y)", unit: "mol/(m² s)" },
      { sym: "k_x^\\mathrm{s}", means: "liquid coefficient for A through stagnant B", unit: "mol/(m² s)" },
      { sym: "x_\\mathrm{B,LM}", means: "log mean of the mole fraction of B across the liquid film" },
    ],
    note: "Choupo's rate-based segment uses the low-flux coefficient and writes the bulk-flow term explicitly, with "
      + "the film-average composition (RateBasedSegment.cpp:559 for the vapour film, RateBasedSegment.cpp:560 for "
      + "the liquid): the same split as the first line of the derivation, with no high-flux correction.",
  },
  {
    n: 3,
    title: "Henry's law: seven constants for one straight line",
    body: "A Henry's-law constant relates the gas-phase and the aqueous-phase amounts of a dissolved gas at "
      + "equilibrium, at infinite dilution.  Sander's compilation sorts every variant into two fundamental types: a "
      + "SOLUBILITY, aqueous over gas (H), and a VOLATILITY, gas over aqueous (K_H), the inverse; \"statements like "
      + "'a large Henry's law constant' are meaningless unless the type is specified\" (Sander, Sect. 2.1, p. 4401).  "
      + "Each type is then written with a choice of composition variables, which the two superscripts of Sander's "
      + "notation name, numerator first: H^cp is a concentration over a pressure, K_H^px a pressure over a mole "
      + "fraction.  The dimensionless forms are the most error-prone, because their type cannot be read from their "
      + "unit (p. 4401).  The books use their own letters: Seader's H_A is a solubility c/p in chapter 3 (Eq. 3-182, "
      + "p. 76, with a footnote listing three other forms) and his H′ is a volatility p/c in chapter 6 (Eq. 6-128, "
      + "p. 181); Missen's H_A is a volatility p/c (Eq. 9.2-8, p. 241).  Choupo's Henry records store p/x in Pa and "
      + "call it H_xp (data/standards/parameters/Henry/README.md); in Sander's notation that is K_H^px, while "
      + "Sander's own H^xp is its inverse, x/p.  The engine reads the stored value as a pressure "
      + "(HenrysLaw.cpp:50), carries it in temperature with van 't Hoff's form (HenrysLaw.cpp:163), and divides it "
      + "by the total pressure to get the solute's K-value (ThermoPackage.cpp:1277).  Use the converter below with "
      + "Sander's value for oxygen, and compare with Choupo's oxygen record.",
    derivation: [
      { step: "Sander's definitions (Eqs. 1, 2, 4, 14, 15, 16, pp. 4401-4403); the volatilities are the inverses of "
          + "the solubilities:",
        eq: String.raw`H^{cp} = \frac{c_a}{p}, \quad H^{cc} = \frac{c_a}{c_g}, \quad H^{xp} = \frac{x}{p}, \quad K_\mathrm{H}^{pc} = \frac{1}{H^{cp}}, \quad K_\mathrm{H}^{px} = \frac{1}{H^{xp}}, \quad K_\mathrm{H}^{cc} = \frac{1}{H^{cc}}` },
      { step: "For an ideal gas c_g = p/(R T), which gives Sander's Eq. 3:",
        eq: String.raw`H^{cc} = H^{cp}\,R\,T` },
      { step: "For a dilute aqueous solution c_a ≈ x ρ_w/M_w (Eq. 5), which gives Eq. 6; the molality form follows "
          + "the same way, Eq. 11:",
        eq: String.raw`H^{xp} \approx \frac{M_w}{\rho_w}\,H^{cp}, \qquad H^{bp} \approx \frac{H^{cp}}{\rho_w}` },
      { step: "With Dalton's law y = p/P, the volatility per mole fraction is the slope of the equilibrium line in "
          + "y = m x; it is Seader's K-value K_A = y/x (Eq. 3-194, p. 78):",
        eq: String.raw`y = \frac{p}{P} = \frac{K_\mathrm{H}^{px}}{P}\,x = m\,x` },
      { step: "The temperature dependence Choupo applies to the stored volatility, van 't Hoff's form with the "
          + "enthalpy of dissolution (HenrysLaw.cpp:163; Sander Eq. 19 writes the same for a solubility, with the "
          + "opposite sign in the exponent):",
        eq: String.raw`K_\mathrm{H}^{px}(T) = K_\mathrm{ref}\,\exp\left[\frac{\Delta H_\mathrm{sol}}{R}\left(\frac{1}{T} - \frac{1}{T_\mathrm{ref}}\right)\right]` },
    ],
    formula: String.raw`m = \frac{K_\mathrm{H}^{px}}{P} = \frac{\rho_w}{M_w\,H^{cp}\,P}`,
    where: [
      { sym: "H^{cp}", means: "Henry solubility, aqueous concentration over partial pressure (Sander's H^cp)", unit: "mol/(m³ Pa)" },
      { sym: "H^{cc}", means: "dimensionless Henry solubility, aqueous over gas concentration" },
      { sym: "H^{xp}", means: "Henry solubility, aqueous mole fraction over partial pressure", unit: "1/Pa" },
      { sym: "H^{bp}", means: "Henry solubility, molality over partial pressure", unit: "mol/(kg Pa)" },
      { sym: "K_\\mathrm{H}^{pc}", means: "Henry volatility, partial pressure over aqueous concentration", unit: "Pa m³/mol" },
      { sym: "K_\\mathrm{H}^{px}", means: "Henry volatility, partial pressure over aqueous mole fraction (what Choupo's records store)", unit: "Pa" },
      { sym: "K_\\mathrm{H}^{cc}", means: "dimensionless Henry volatility, gas over aqueous concentration" },
      { sym: "c_a", means: "concentration of the gas in the aqueous phase", unit: "mol/m³" },
      { sym: "c_g", means: "concentration of the gas in the gas phase", unit: "mol/m³" },
      { sym: "p", means: "partial pressure of the gas", unit: "Pa" },
      { sym: "x", means: "mole fraction of the gas in the liquid" },
      { sym: "y", means: "mole fraction of the gas in the gas phase" },
      { sym: "M_w", means: "molar mass of water", unit: "kg/mol" },
      { sym: "\\rho_w", means: "density of water", unit: "kg/m³" },
      { sym: "m", means: "slope of the equilibrium line y = m x (the K-value)" },
      { sym: "K_\\mathrm{ref}", means: "the stored volatility at the reference temperature (the record's H_ref)", unit: "Pa" },
      { sym: "\\Delta H_\\mathrm{sol}", means: "molar enthalpy of dissolution (negative when dissolving releases heat)", unit: "J/mol" },
      { sym: "T_\\mathrm{ref}", means: "reference temperature of the record, 298.15", unit: "K" },
    ],
    note: "The slope m of a sparingly soluble gas is large (oxygen at 1 atm: about 4×10⁴): a little dissolved gas "
      + "stands against a lot of gas.  Sander's conversion factors (Tables 1-3, p. 4400) are printed for 298.15 K "
      + "and ρ_w = 997 kg/m³; the converter uses those values unless you change them.",
  },
  {
    n: 4,
    title: "Two films in series: the overall coefficient",
    body: "Nobody can sample the interface, so a measured or designed flux is written on the BULK compositions, "
      + "with an overall coefficient.  The trick is a fictitious composition: y*, the gas that would be in "
      + "equilibrium with the bulk liquid, or x*, the liquid in equilibrium with the bulk gas.  Treybal writes the "
      + "overall driving force y_b − y* as the drop across the gas film plus the drop across the liquid film "
      + "mapped onto gas mole fractions by the slope of the equilibrium line, and dividing by the flux gives "
      + "resistances that ADD (Eqs. 5.1-5.9, pp. 108-110).  The shares of the total resistance (Eqs. 5.10, 5.11) "
      + "say which film CONTROLS: a very soluble gas (small m) puts the resistance in the gas film; a sparingly "
      + "soluble one (large m) in the liquid film, and then the overall coefficient is nearly the liquid's (Treybal "
      + "Eqs. 5.12-5.15, pp. 110-111; Seader Eqs. 3-188, 3-192).  The same sum is written with concentrations and "
      + "a Henry solubility (Seader Eqs. 3-187, 3-191), with partial pressures and a volatility (Missen Eqs. 9.2-13, "
      + "9.2-14, p. 241), and with velocity coefficients and the ratio of the two molar densities (Taylor and "
      + "Kooijman Eq. 3.68, p. 115).  Choupo's rate-based segment does NOT use an overall coefficient: it solves "
      + "both films with the interface compositions as unknowns, and the interface in equilibrium "
      + "(RateBasedSegment.cpp:541), except in the limit mode that checks it against the transfer-unit bed, where the "
      + "interface equation is linearised about the bulk liquid with one slope m (RateBasedSegment.cpp:553).  The one place the sum appears is the first guess of the profile, "
      + "1/(1/β_V + m/β_L) on the segment's own coefficients (RateBasedSegment.cpp:635).",
    derivation: [
      { step: "Steady state: the flux through the gas film equals the flux through the liquid film (Treybal Eq. 5.1):",
        eq: String.raw`N_\mathrm{A} = k_y\,(y_b - y_i) = k_x\,(x_i - x_b)` },
      { step: "Define the overall coefficient on the gas side with y*, the gas in equilibrium with the bulk liquid "
          + "(Eq. 5.4):",
        eq: String.raw`N_\mathrm{A} = K_y\,(y_b - y^{*})` },
      { step: "Split the overall difference at the interface; on a STRAIGHT equilibrium line both pieces of the "
          + "liquid side scale with the one slope m (Eq. 5.5 with m′ = m):",
        eq: String.raw`y_b - y^{*} = (y_b - y_i) + (y_i - y^{*}) = (y_b - y_i) + m\,(x_i - x_b)` },
      { step: "Replace each difference by the flux over its coefficient and divide by N_A (Eqs. 5.7 and, on the "
          + "liquid side, 5.9):",
        eq: String.raw`\frac{1}{K_y} = \frac{1}{k_y} + \frac{m}{k_x}, \qquad \frac{1}{K_x} = \frac{1}{m\,k_y} + \frac{1}{k_x}, \qquad K_x = m\,K_y` },
      { step: "The same in concentrations, with a Henry solubility H^cp = c/p (Seader Eqs. 3-187 and 3-191):",
        eq: String.raw`\frac{1}{K_G} = \frac{1}{k_p} + \frac{1}{H^{cp}\,k_L}, \qquad \frac{1}{K_L} = \frac{H^{cp}}{k_p} + \frac{1}{k_L}` },
      { step: "And in velocity units, a binary at low flux (Taylor and Kooijman Eq. 3.68):",
        eq: String.raw`\frac{1}{K_\mathrm{OV}} = \frac{1}{k_V} + \frac{c_t^{V}}{c_t^{L}}\,\frac{m}{k_L}` },
    ],
    formula: String.raw`\frac{1/k_y}{1/K_y} + \frac{m/k_x}{1/K_y} = 1`,
    where: [
      { sym: "y_b", means: "mole fraction of A in the bulk gas" },
      { sym: "y_i", means: "mole fraction of A in the gas at the interface" },
      { sym: "x_i", means: "mole fraction of A in the liquid at the interface" },
      { sym: "x_b", means: "mole fraction of A in the bulk liquid" },
      { sym: "K_y", means: "overall coefficient on the gas side, per mole fraction", unit: "mol/(m² s)" },
      { sym: "y^{*}", means: "gas mole fraction in equilibrium with the bulk liquid (fictitious)" },
      { sym: "K_x", means: "overall coefficient on the liquid side, per mole fraction", unit: "mol/(m² s)" },
      { sym: "K_G", means: "overall coefficient per partial pressure (Seader's K_G)", unit: "mol/(m² s Pa)" },
      { sym: "K_L", means: "overall coefficient per liquid concentration (Seader's K_L)", unit: "m/s" },
      { sym: "K_\\mathrm{OV}", means: "overall vapour-side coefficient in velocity units (Taylor and Kooijman)", unit: "m/s" },
      { sym: "k_V", means: "vapour film coefficient in velocity units (Taylor and Kooijman's k_V; this page's k_c)", unit: "m/s" },
      { sym: "c_t^{V}", means: "total molar density of the vapour (c_t^V; the superscript names the phase)", unit: "mol/m³" },
      { sym: "c_t^{L}", means: "total molar density of the liquid", unit: "mol/m³" },
    ],
    note: "\"Controlling\" on this page means a film holding 90 % or more of the resistance; that line is the "
      + "page's own, and the books draw none.  Treybal's warning about the films themselves (p. 113): the "
      + "individual coefficients come from correlations measured in other conditions, and interfacial "
      + "turbulence or surfactants can make the rates differ from what the sum predicts.",
  },
  {
    n: 5,
    title: "When the overall coefficient fails: a curved equilibrium line",
    body: "The sum of resistances in step 4 used ONE slope for two different chords of the equilibrium curve: the "
      + "chord from the bulk liquid to the interface (Treybal's m′) and the chord from the interface to the liquid in "
      + "equilibrium with the bulk gas (his m″).  On a straight line they are equal.  On a curved line they are "
      + "not, and Treybal says plainly that an AVERAGE overall coefficient \"will have meaning only when m′ = m″ = "
      + "const, in other words, for cases of straight-line equilibrium-distribution curves\" (p. 114).  Seader's "
      + "Example 3.18 (pp. 79-80) works this on a measured curve: SO₂ into water at 50 °C and 2 atm, with the curve "
      + "fitted by y = 29.74 x + 6733 x² (his Eq. (1)).  The panel below solves the interface exactly for his data, "
      + "and sets beside it three overall coefficients built from three choices of slope: his average chord, his "
      + "local slope at x*, and the straight Henry line through the origin at the dilute slope 29.74.  The first two "
      + "land within a percent of the exact flux, because the liquid film holds almost all the resistance and the "
      + "interface sits close to the bulk liquid.  The straight line is wrong by more than 80 %: it misplaces x* "
      + "itself, the end of the driving force.  Weaken the gas film with the slider and watch the slope choices "
      + "drift apart as the interface moves along the curve.",
    derivation: [
      { step: "With the two chords kept apart, the gas-side and liquid-side overall coefficients are exact (Treybal "
          + "Eqs. 5.7, 5.9 and 5.18; Seader Eqs. 3-213 to 3-216 write m_x and m_y):",
        eq: String.raw`m' = \frac{y_i - y^{*}}{x_i - x_b}, \qquad m'' = \frac{y_b - y_i}{x^{*} - x_i}, \qquad \frac{1}{K_x} = \frac{1}{m''\,k_y} + \frac{1}{k_x}` },
      { step: "Seader's curve and its slope (Example 3.18, Eqs. (1) and (2)):",
        eq: String.raw`y = 29.74\,x + 6733\,x^2, \qquad \frac{\mathrm{d}y}{\mathrm{d}x} = 29.74 + 13466\,x` },
    ],
    formula: String.raw`N_\mathrm{A} = K_x\,(x^{*} - x_b), \qquad x^{*}: \; y_b = 29.74\,x^{*} + 6733\,(x^{*})^2`,
    where: [
      { sym: "m'", means: "slope of the chord from the bulk-liquid point to the interface (Treybal's m′)" },
      { sym: "m''", means: "slope of the chord from the interface to the point in equilibrium with the bulk gas (Treybal's m″)" },
      { sym: "x^{*}", means: "liquid mole fraction in equilibrium with the bulk gas (fictitious)" },
    ],
    note: "The demonstration ignores the bulk-flow correction of step 2, as Seader's parts (a) and (b) do; his part "
      + "(c) adds it and moves K_x from 9.69 to 9.71 kmol/(h m²).  The page solves the interface by bisection on the "
      + "two film equations and the fitted curve, and prints the residual nowhere because the bracket halves to "
      + "machine precision.",
  },
  {
    n: 6,
    title: "A reaction in the liquid film: the Hatta number and the enhancement factor",
    body: "If A reacts with a reagent B dissolved in the liquid, the reaction consumes A on its way across the "
      + "liquid film, keeps the concentration gradient at the interface steep, and the flux rises above the physical "
      + "one.  Missen et al. treat it on the same two-film model (Sect. 9.2.3, pp. 242-255).  The ENHANCEMENT FACTOR "
      + "E is the flux with reaction over the flux the liquid film would carry without it at the same interface "
      + "concentration (Eq. 9.2-26).  The HATTA NUMBER compares the fastest reaction the film can hold with the "
      + "fastest transport through it (Eq. 9.2-55); its square is that ratio.  Missen's criterion (p. 253): with Ha "
      + "above about 3 the reaction happens in the liquid film only; below about 0.1 it happens in the bulk liquid, "
      + "and the film carries A as if there were no reaction.  For a first-order or pseudo-first-order reaction "
      + "(B in excess, its concentration the same everywhere) the film equation solves exactly and E = Ha/tanh Ha "
      + "(Eq. 9.2-49): E → 1 as Ha → 0 and E → Ha when Ha is large.  When the reaction is fast enough that B runs "
      + "out near the interface, the rate is set by how fast B can diffuse to meet A: the INSTANTANEOUS limit E_i "
      + "(Eq. 9.2-53).  Between the two, for a second-order reaction, van Krevelen and Hoftijzer's approximation is "
      + "an implicit equation for E (Eqs. 9.2-51 and 9.2-52), which Missen draws as his Figure 9.8 and Seader as his "
      + "Figure 6.45 (p. 182); the page solves it by bisection and draws it below.  Seader adds the reaction to the "
      + "resistances in series by dividing the liquid film's resistance by E (Eq. 6-130, p. 181).",
    derivation: [
      { step: "A balance on a slice of the liquid film, first-order reaction, in Missen's dimensionless form (Eq. "
          + "9.2-39), with λ the concentration of A over its interface value and z the distance from the interface "
          + "over the film thickness:",
        eq: String.raw`\frac{\mathrm{d}^2\lambda}{\mathrm{d}z^2} = \mathrm{Ha}^2\,\lambda, \qquad \mathrm{Ha} = \delta_L\,\sqrt{\frac{k_1}{D_\mathrm{A}}} = \frac{\sqrt{D_\mathrm{A}\,k_1}}{k_L}, \qquad k_L = \frac{D_\mathrm{A}}{\delta_L}` },
      { step: "A consumed within the film (λ = 1 at the interface, 0 at the film's far side), Missen's Eq. 9.2-46:",
        eq: String.raw`\lambda = \frac{\sinh\left[\mathrm{Ha}\,(1 - z)\right]}{\sinh \mathrm{Ha}}` },
      { step: "The flux is the diffusion flux at the interface; over the physical flux k_L c_Ai it is E "
          + "(Eqs. 9.2-47 and 9.2-49):",
        eq: String.raw`N_\mathrm{A} = \frac{\mathrm{Ha}}{\tanh \mathrm{Ha}}\,k_L\,c_{\mathrm{A}i} = E\,k_L\,c_{\mathrm{A}i}` },
      { step: "With a gas film in series and a volatility H_A (Missen Eq. 9.2-48; Seader Eq. 6-130 without its "
          + "bulk-liquid term):",
        eq: String.raw`N_\mathrm{A} = \frac{p_\mathrm{A}}{\dfrac{1}{k_{\mathrm{A}g}} + \dfrac{H_\mathrm{A}}{E\,k_L}}` },
      { step: "A second-order reaction A + b B, first order in each: the Hatta number takes the bulk c_B (Eq. "
          + "9.2-54; Seader Eq. 6-131), the instantaneous limit is set by the diffusion of B (Eq. 9.2-53; Seader "
          + "Eq. 6-132), and van Krevelen and Hoftijzer's E lies between (Eqs. 9.2-51, 9.2-52):",
        eq: String.raw`\mathrm{Ha} = \frac{\sqrt{k_2\,D_\mathrm{A}\,c_\mathrm{B}}}{k_L}, \qquad E_i = 1 + \frac{D_\mathrm{B}\,c_\mathrm{B}}{D_\mathrm{A}\,b\,c_{\mathrm{A}i}}, \qquad E = \frac{\psi}{\tanh\psi}, \quad \psi = \mathrm{Ha}\left(\frac{E_i - E}{E_i - 1}\right)^{1/2}` },
    ],
    formula: String.raw`E = \frac{N_\mathrm{A}}{k_L\,c_{\mathrm{A}i}}, \qquad 1 \le E \le E_i`,
    where: [
      { sym: "\\lambda", means: "concentration of A in the liquid film over its interface value" },
      { sym: "z", means: "distance from the interface over the film thickness" },
      { sym: "\\mathrm{Ha}", means: "Hatta number" },
      { sym: "\\delta_L", means: "thickness of the liquid film (a model length, never measured)", unit: "m" },
      { sym: "k_1", means: "first-order (or pseudo-first-order, k_2 c_B) rate constant", unit: "1/s" },
      { sym: "D_\\mathrm{A}", means: "diffusivity of A in the liquid", unit: "m²/s" },
      { sym: "c_{\\mathrm{A}i}", means: "concentration of A in the liquid at the interface", unit: "mol/m³" },
      { sym: "E", means: "enhancement factor: the flux with reaction over the physical flux k_L c_Ai" },
      { sym: "p_\\mathrm{A}", means: "partial pressure of A in the bulk gas", unit: "Pa" },
      { sym: "k_{\\mathrm{A}g}", means: "gas film coefficient per partial pressure (Missen's k_Ag; this page's k_p)", unit: "mol/(m² s Pa)" },
      { sym: "H_\\mathrm{A}", means: "Henry volatility p/c (Missen's H_A; Sander's K_H^pc)", unit: "Pa m³/mol" },
      { sym: "k_2", means: "second-order rate constant", unit: "m³/(mol s)" },
      { sym: "c_\\mathrm{B}", means: "concentration of the reagent B in the bulk liquid", unit: "mol/m³" },
      { sym: "E_i", means: "enhancement factor of an instantaneous reaction" },
      { sym: "D_\\mathrm{B}", means: "diffusivity of B in the liquid", unit: "m²/s" },
      { sym: "b", means: "moles of B consumed per mole of A" },
      { sym: "\\psi", means: "van Krevelen and Hoftijzer's modified Hatta number" },
    ],
    note: "The film model is a model: δ_L is never measured, and only k_L = D_A/δ_L is.  The penetration and "
      + "surface-renewal models give other E(Ha) curves; the filed sources this page was written from do not print "
      + "them for a reacting film, so they are not drawn.  Missen's Example 9-6 (pp. 253-255) is exercises 5 and 6.",
  },
  {
    n: 7,
    title: "What Choupo does with these forms, and where to go next",
    body: "The engine's one mass-transfer column model that uses film coefficients, the rate-based packed "
      + "segment, takes k_G and k_L from the packing correlation as velocities, turns them into the mole-fraction "
      + "form with each phase's molar density, multiplies by the effective area and the segment's volume, and divides "
      + "by a reference boil-up V_ref, so its β_V and β_L are k_y a and k_x a times the segment's volume made "
      + "dimensionless (RateBasedSegment.cpp:425, RateBasedSegment.cpp:426).  It solves the two films with the "
      + "interface as an unknown, in equilibrium at the interface's own K-values (RateBasedSegment.cpp:541), so it "
      + "needs no overall coefficient and is not hurt by a curved equilibrium line (step 5); only its limit mode, "
      + "kept to compare with the transfer-unit bed, linearises the interface about the bulk liquid with one slope "
      + "(RateBasedSegment.cpp:553), which is step 4's straight line.  It "
      + "carries the bulk flow explicitly with low-flux coefficients (step 2).  It has no reaction in the film: the "
      + "rate-based segment is a binary at total reflux, and the engine's absorbers are equilibrium stages with "
      + "Henry's law.  The Theory Guide section on the rate-based segment writes its film equations in full.",
    leadsTo: {
      tool: "equilibrium-or-rate-based", toolLabel: "Equilibrium stages or rate-based?",
      stepTitle: "One number per tray: the Murphree efficiency",
      body: "The same films, summed over a column: when one efficiency per tray is enough, and when the film "
        + "coefficients must be carried into the column model itself.",
    },
  },
];

/** WHO CALLS WHAT: one row per quantity, one column per source, each cell read
 *  at the equation it names.  "—" means the source does not write that form. */
export interface NotationRow {
  quantity: string;
  page: string;
  treybal: string;
  seader: string;
  missen: string;
  taylorKooijman: string;
  choupo: string;
}

export const NOTATION_ROWS: readonly NotationRow[] = [
  {
    quantity: "gas film, per partial pressure",
    page: "k_p", treybal: "k_G (A through stagnant B), k′_G (equimolar); Eqs. 3.3, 3.5",
    seader: "k_p (Eq. 3-180, Table 3.12); k_G in Eq. 6-128",
    missen: "k_Ag (Eq. 9.2-3)", taylorKooijman: "—", choupo: "—",
  },
  {
    quantity: "gas film, per mole fraction",
    page: "k_y", treybal: "k_y (stagnant B), k′_y (equimolar) = F; Eqs. 3.3, 3.5, Table 3.1",
    seader: "k_y (equimolar), k′_y (stagnant B); Eqs. 3-193, 3-203",
    missen: "—", taylorKooijman: "c_t k (Eq. 3.44)",
    choupo: "c_G k_G, inside β_V (RateBasedSegment.cpp:425)",
  },
  {
    quantity: "gas film, per concentration (m/s)",
    page: "k_c", treybal: "k_c (stagnant B), k′_c (equimolar); Eqs. 3.3, 3.5",
    seader: "k_c, or (k_c)_g (Eq. 3-201); k_G in Table 3.12's last line",
    missen: "—", taylorKooijman: "k, k_V (Eqs. 3.44, 3.68)",
    choupo: "k_G (PackingRBF.cpp:127)",
  },
  {
    quantity: "liquid film, per concentration (m/s)",
    page: "k_L", treybal: "k_L (stagnant B), k′_L (equimolar); Eqs. 3.4, 3.6",
    seader: "k_c (Eq. 3-181); k_L in Table 3.12's last line",
    missen: "k_Al (Eq. 9.2-6)", taylorKooijman: "k, k_L (Eqs. 3.44, 3.68)",
    choupo: "k_L (PackingRBF.cpp:129)",
  },
  {
    quantity: "liquid film, per mole fraction",
    page: "k_x", treybal: "k_x (stagnant B), k′_x (equimolar) = F; Eqs. 3.4, 3.6, Table 3.1",
    seader: "k_x (equimolar), k′_x (stagnant B); Eqs. 3-193, 3-202",
    missen: "—", taylorKooijman: "c_t k (Eq. 3.44)",
    choupo: "c_L k_L, inside β_L (RateBasedSegment.cpp:426)",
  },
  {
    quantity: "Henry's-law constant",
    page: "Sander's seven names", treybal: "m, the equilibrium slope dy*/dx (chapter 8 notation, p. 334)",
    seader: "H_A = c/p (Eq. 3-182); H′ = p/c (Eq. 6-128); K_A = y/x (Eq. 3-194)",
    missen: "H_A = p/c (Eq. 9.2-8)", taylorKooijman: "K = y/x, M = dy*/dx (Eqs. 3.58, 3.59)",
    choupo: "H_ref = p/x in Pa, called H_xp (HenrysLaw.cpp:50); Sander's K_H^px",
  },
  {
    quantity: "what a prime means",
    page: "no prime; k^s for the stagnant film",
    treybal: "equimolar counter-diffusion (Eqs. 3.5, 3.6)",
    seader: "diffusion through stagnant B (Eqs. 3-202, 3-203)",
    missen: "—", taylorKooijman: "• marks a finite-flux coefficient (Eq. 3.45)", choupo: "—",
  },
];

export const OFMU_LIMITS: readonly LessonLimit[] = [
  {
    id: "binary-film",
    title: "One solute, one film model.",
    body: "Every relation on the page is for one transferring solute through a film (a binary, or a solute and a "
      + "carrier).  Multicomponent films need matrices of coefficients (Taylor and Kooijman, Sect. 3.5.2), which "
      + "the page does not treat.",
  },
  {
    id: "low-flux",
    title: "Low flux, except for the drift factor.",
    body: "The coefficients are the low-flux ones, corrected only for the stagnant film of step 2.  The general "
      + "finite-flux correction of the film model (Taylor and Kooijman Eq. 3.78) is not applied anywhere.",
  },
  {
    id: "dilute-henry",
    title: "Henry's law is a dilute-solution law.",
    body: "The conversions between Henry variants use Sander's dilute approximations (his Eqs. 5, 6, 10, 11) and an "
      + "ideal gas (Eq. 3).  A gas that dissociates or reacts in water (ammonia, SO₂, CO₂) has an effective solubility "
      + "that depends on the pH; the page uses the physical constant only.",
  },
  {
    id: "film-reaction",
    title: "The film model of a reacting liquid.",
    body: "E(Ha) is the film-model result, irreversible reaction, isothermal film.  Reversible reactions, the heat "
      + "of reaction at the interface, the penetration and surface-renewal versions of E, and the reaction of a "
      + "dissolved gas in the bulk (Missen's Sect. 9.2.3.2) are named and not computed.",
  },
  {
    id: "not-engine",
    title: "The page's arithmetic, not the engine's.",
    body: "Choupo's engine computes no number on this page.  Its rate-based segment uses the step-1 forms at the "
      + "lines cited; it has no reaction in a film and no overall coefficient.",
  },
];
