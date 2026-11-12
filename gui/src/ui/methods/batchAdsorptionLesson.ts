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
  batchAdsorptionLesson — the lesson text of the `batch-adsorption` EduTool:
  a tank of solution and an adsorbent with a known isotherm -- how much
  adsorbent, whether to split it into stages, and how long it takes.

  Every number the page shows is its own arithmetic
  (gui/src/case/batchAdsorption.ts, on the isotherm functions of
  gui/src/case/adsorptionIsotherms.ts): the engine's batch adsorber contacts
  a gas, not a liquid.  The design record says what was measured and what is
  proposed: docs/design/batch-adsorption-in-a-stirred-tank.md.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const BATCH_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The balance and the operating line",
    body: "A tank holds V litres of solution at concentration c_0.  A mass M of adsorbent is "
      + "added and the tank is stirred until nothing changes.  Solute is neither made nor "
      + "destroyed: what the liquid loses, the solid gains.  Plotted as loading q against "
      + "concentration c, that balance is a straight line -- the OPERATING LINE -- which "
      + "starts at the state the adsorbent was added in, (c_0, q_0), and falls with slope "
      + "−V/M.  The end state must also lie on the isotherm.  So the answer is where the "
      + "two lines cross.  For a linear and for a Langmuir isotherm that crossing can be "
      + "written down; for a Freundlich isotherm it cannot.  The page finds it the same way "
      + "for all three, by bisection: the gap between the balance and the isotherm is "
      + "positive at c = 0 and negative at the largest concentration the balance allows, "
      + "so the crossing is bracketed and halving the bracket always closes on it.",
    derivation: [
      { step: "The solute balance on the tank, between the start and equilibrium:",
        eq: String.raw`V c_0 + M q_0 = V c + M q` },
      { step: "Solved for q, it is a straight line in the (c, q) plane of slope −V/M "
          + "through (c_0, q_0):",
        eq: String.raw`q = q_0 - \frac{V}{M}\,(c - c_0)` },
      { step: "At equilibrium q = q*(c).  For a LINEAR isotherm q* = K c, and with fresh "
          + "adsorbent (q_0 = 0):",
        eq: String.raw`c = \frac{c_0\, V}{V + M K}` },
      { step: "For a LANGMUIR isotherm q* = q_max c/(K_L + c); multiplying out gives a "
          + "quadratic in c, of which one root is positive:",
        eq: String.raw`V c^2 + \left(V K_L + M q_\mathrm{max} - V c_0 - M q_0\right) c - \left(V c_0 + M q_0\right) K_L = 0` },
    ],
    formula: String.raw`\begin{aligned} f(c) &= V\,(c_0 - c) + M\,\left(q_0 - q^{*}(c)\right) = 0 \\ R &= 100\,\frac{c_0 - c}{c_0} \end{aligned}`,
    where: [
      { sym: "V", means: "volume of solution in the tank", unit: "L" },
      { sym: "c_0", means: "concentration before the adsorbent is added", unit: "mg/L" },
      { sym: "M", means: "mass of adsorbent added", unit: "g" },
      { sym: "q_0", means: "loading the adsorbent carries when it is added (zero when fresh)",
        unit: "mg/g" },
      { sym: "c", means: "concentration in the liquid at equilibrium", unit: "mg/L" },
      { sym: "q", means: "loading on the adsorbent at equilibrium", unit: "mg/g" },
      { sym: "q^{*}", means: "the isotherm: the loading in equilibrium with a concentration",
        unit: "mg/g" },
      { sym: "q^{*}(c)", means: "the isotherm read at the concentration c", unit: "mg/g" },
      { sym: "K", means: "linear isotherm constant", unit: "L/g" },
      { sym: "q_\\mathrm{max}", means: "Langmuir capacity", unit: "mg/g" },
      { sym: "K_L", means: "Langmuir half-saturation concentration", unit: "mg/L" },
      { sym: "f", means: "the gap between what the liquid lost and what the solid gained; "
        + "zero at the answer", unit: "mg" },
      { sym: "f(c)", means: "that gap as a function of the trial concentration c", unit: "mg" },
      { sym: "R", means: "percentage of the solute removed from the liquid", unit: "%" },
    ],
    note: "The units are chosen so the balance needs no conversion: c in mg/L times V in L "
      + "is milligrams, and q in mg/g times M in g is milligrams.  An isotherm measured in "
      + "other units must be converted before it is typed in.",
    leadsTo: {
      tool: "adsorption-isotherms", toolLabel: "Adsorption isotherms from laboratory data",
      stepTitle: "An isotherm is the loading against the fluid concentration",
      body: "Where the isotherm comes from: fitted to laboratory points, with what "
        + "parameters, and how far it can be trusted.",
    },
  },
  {
    n: 2,
    title: "The dose for a target, and why the last few percent are expensive",
    body: "Turned round, the balance gives the dose.  Choose the concentration to reach, "
      + "read the isotherm there, and the balance gives M.  As the target removal approaches "
      + "100 %, two things happen at once: the solute still to be removed grows only a "
      + "little, but the loading the adsorbent can reach -- q* at the FINAL concentration, "
      + "which is low -- falls towards zero.  Each kilogram of adsorbent does less, so the "
      + "dose climbs steeply.  For a linear isotherm M grows like R/(100 − R); for a "
      + "favourable isotherm the climb starts later but is just as steep at the end.  "
      + "A pre-loaded adsorbent adds a floor: it is already in equilibrium with c*(q_0), "
      + "and no dose takes the liquid below that.",
    derivation: [
      { step: "The balance with c fixed by the target:",
        eq: String.raw`M = \frac{V\,(c_0 - c)}{q^{*}(c) - q_0}, \qquad c = c_0\left(1 - \frac{R}{100}\right)` },
      { step: "For a linear isotherm and fresh adsorbent:",
        eq: String.raw`M = \frac{V}{K}\,\frac{c_0 - c}{c} = \frac{V}{K}\,\frac{R}{100 - R}` },
    ],
    formula: String.raw`c_\mathrm{floor} = c^{*}(q_0)`,
    where: [
      { sym: "M", means: "adsorbent mass needed", unit: "g" },
      { sym: "V", means: "volume of solution", unit: "L" },
      { sym: "c_0", means: "initial concentration", unit: "mg/L" },
      { sym: "c", means: "target concentration", unit: "mg/L" },
      { sym: "q^{*}(c)", means: "the isotherm's loading at the target", unit: "mg/g" },
      { sym: "q_0", means: "loading of the adsorbent as added", unit: "mg/g" },
      { sym: "R", means: "target removal", unit: "%" },
      { sym: "K", means: "linear isotherm constant", unit: "L/g" },
      { sym: "c_\\mathrm{floor}", means: "the lowest concentration any dose can reach",
        unit: "mg/L" },
      { sym: "c^{*}", means: "the inverse isotherm: the concentration in equilibrium with a "
        + "loading", unit: "mg/L" },
      { sym: "c^{*}(q_0)", means: "the inverse isotherm at the loading q_0", unit: "mg/L" },
    ],
    note: "A target at or below the floor is refused by name, never clipped to the floor: "
      + "clipping would print a dose for a removal the student did not ask for.",
  },
  {
    n: 3,
    title: "Stages: split the adsorbent, or send it the other way",
    body: "The same mass of adsorbent can be used in more than one contact.  In CROSSFLOW "
      + "the liquid passes through N tanks in turn and each gets fresh adsorbent, a share "
      + "of the total.  In COUNTERCURRENT the solid moves the other way: fresh adsorbent "
      + "meets the cleanest liquid in the last stage, and adsorbent that is already loaded "
      + "meets the fresh feed in the first, where the concentration is highest.  In a "
      + "laboratory or a small plant that is a sequence of batches with the solid carried "
      + "back one tank each time.  Why staging helps: in one stage the WHOLE charge ends "
      + "in equilibrium with the final, low concentration, so it is loaded only to q* at "
      + "that low c.  In stages, part of the adsorbent finishes at a higher concentration "
      + "and therefore carries more.  Countercurrent takes this furthest: the solid that "
      + "leaves is in equilibrium with the FEED.",
    derivation: [
      { step: "Crossflow: stage k receives the liquid from stage k − 1 and its own fresh "
          + "mass M_k; each stage is the single-stage problem of step 1:",
        eq: String.raw`V\,(c_{k-1} - c_k) = M_k\, q^{*}(c_k), \qquad \sum_k M_k = M` },
      { step: "Countercurrent: one solid stream of mass M through all N stages, entering "
          + "fresh at stage N.  A balance on stage k, with q_{N+1} = 0:",
        eq: String.raw`V\,(c_{k-1} - c_k) = M\,\left(q_k - q_{k+1}\right), \qquad q_k = q^{*}(c_k)` },
      { step: "Given c_N, these give c_{N−1}, ..., c_0 one after another.  The page "
          + "bisects on c_N until the c_0 they return is the declared one.  For a linear "
          + "isotherm and two stages, with a = M K/V:",
        eq: String.raw`\frac{c_2}{c_0}\Big|_\mathrm{cross} = \frac{1}{(1 + a/2)^2}, \qquad \frac{c_2}{c_0}\Big|_\mathrm{counter} = \frac{1}{1 + a + a^2}` },
    ],
    formula: String.raw`V c_0 = V c_N + \sum_{k=1}^{N} M_k\, q_k`,
    where: [
      { sym: "V", means: "volume of solution", unit: "L" },
      { sym: "c_0", means: "concentration of the feed", unit: "mg/L" },
      { sym: "c_k", means: "concentration leaving stage k", unit: "mg/L" },
      { sym: "c_{k-1}", means: "concentration entering stage k", unit: "mg/L" },
      { sym: "c_N", means: "concentration leaving the last stage", unit: "mg/L" },
      { sym: "c_2", means: "concentration leaving the second of two stages", unit: "mg/L" },
      { sym: "k", means: "which stage, counted in the direction the liquid moves" },
      { sym: "N", means: "number of stages" },
      { sym: "M", means: "total adsorbent mass", unit: "g" },
      { sym: "M_k", means: "adsorbent mass in stage k (crossflow) or carried through it "
        + "(countercurrent, M_k = M, and only the solid leaving stage 1 leaves the system)",
        unit: "g" },
      { sym: "q^{*}(c_k)", means: "the isotherm at the concentration leaving stage k", unit: "mg/g" },
      { sym: "q_k", means: "loading on the adsorbent leaving stage k", unit: "mg/g" },
      { sym: "q_{k+1}", means: "loading on the adsorbent entering stage k from stage k + 1",
        unit: "mg/g" },
      { sym: "a", means: "the adsorption factor M K/V of the whole charge" },
      { sym: "K", means: "linear isotherm constant", unit: "L/g" },
    ],
    note: "How the total is split between two crossflow stages also matters, and the page "
      + "computes the best split.  For a linear isotherm it is exactly half and half "
      + "(c_2/c_0 = 1/[(1 + a f)(1 + a(1 − f))] is smallest at f = 1/2).  For a "
      + "favourable Langmuir or Freundlich isotherm it is NOT: the optimum puts more than "
      + "half in the first stage, and the page prints by how much and what it buys.",
  },
  {
    n: 4,
    title: "How long it takes: the liquid film",
    body: "Equilibrium says where the tank ends; it says nothing about when.  The simplest "
      + "rate model puts the whole resistance in a stagnant film of liquid around each "
      + "particle.  Across it the solute moves at a rate proportional to the film "
      + "coefficient k_L, the external area of the particles, and the difference between "
      + "the bulk concentration c and the concentration c* in equilibrium with the "
      + "particle's loading.  The particle itself is taken as uniformly loaded -- no "
      + "gradient inside it -- which is what 'film only' means.  For a linear isotherm the "
      + "equation integrates in closed form; for the others the page integrates it "
      + "numerically (fourth-order Runge-Kutta with step doubling) and says so.",
    derivation: [
      { step: "The rate across the film, for the whole tank:",
        eq: String.raw`-V\,\frac{\mathrm{d}c}{\mathrm{d}t} = V\, k_L\, a\, (c - c^{*}), \qquad c^{*} = \frac{q}{K}` },
      { step: "The balance of step 1 with fresh adsorbent gives q at every instant, so "
          + "c* is a function of c alone:",
        eq: String.raw`q = \frac{V\,(c_0 - c)}{M} \;\Rightarrow\; c^{*} = \alpha\,(c_0 - c), \quad \alpha = \frac{V}{M K}` },
      { step: "Substituting, with β = 1 + α, the equation is linear in c:",
        eq: String.raw`\frac{\mathrm{d}c}{\mathrm{d}t} = -k_L a\,\left(\beta c - \alpha c_0\right)` },
      { step: "Separate and integrate from c(0) = c_0; as t grows, c tends to α c_0/β, "
          + "which is the equilibrium c_0 V/(V + M K) of step 1:",
        eq: String.raw`c(t) = \frac{c_0}{\beta}\left[ e^{-k_L a \beta t} + \alpha \right]` },
      { step: "The film coefficient from a Sherwood number, and the external area per "
          + "volume of liquid of M grams of spheres of diameter d and particle density ρ_p:",
        eq: String.raw`k_L = \frac{\mathrm{Sh}\, D_{AB}}{d}, \qquad a = \frac{6 M}{\rho_p\, d\, V}` },
    ],
    formula: String.raw`\begin{aligned} t &= -\frac{1}{k_L a \beta}\,\ln\!\left(\frac{\beta\, c}{c_0} - \alpha\right) \\ k_L a &= \frac{6\,\mathrm{Sh}\, D_{AB}\, M}{\rho_p\, d^2\, V} \end{aligned}`,
    where: [
      { sym: "V", means: "volume of solution", unit: "m³ in this step" },
      { sym: "c", means: "concentration in the bulk liquid at time t", unit: "mg/L" },
      { sym: "\\mathrm{d}c/\\mathrm{d}t", means: "rate of change of the bulk concentration",
        unit: "mg/(L s)" },
      { sym: "\\mathrm{d}c", means: "change of the bulk concentration", unit: "mg/L" },
      { sym: "\\mathrm{d}t", means: "the time step it happens in", unit: "s" },
      { sym: "t", means: "time since the adsorbent was added", unit: "s" },
      { sym: "k_L", means: "film mass-transfer coefficient", unit: "m/s" },
      { sym: "a", means: "external area of the particles per volume of liquid", unit: "1/m" },
      { sym: "k_L a", means: "their product, the film rate constant", unit: "1/s" },
      { sym: "c^{*}", means: "concentration in equilibrium with the particle's present "
        + "loading (the liquid at the particle surface)", unit: "mg/L" },
      { sym: "q", means: "loading of the adsorbent at time t", unit: "mg/g" },
      { sym: "K", means: "linear isotherm constant", unit: "L/g" },
      { sym: "c_0", means: "initial concentration", unit: "mg/L" },
      { sym: "M", means: "adsorbent mass", unit: "g, or kg in k_L a" },
      { sym: "\\alpha", means: "V/(M K): how much solute the liquid can hold against how "
        + "much the solid can, at one concentration" },
      { sym: "\\beta", means: "1 + α" },
      { sym: "e", means: "the base of natural logarithms" },
      { sym: "\\ln", means: "natural logarithm" },
      { sym: "\\mathrm{Sh}", means: "Sherwood number k_L d/D_AB; 2 for a sphere in a "
        + "stagnant liquid, which is a lower bound for a stirred tank" },
      { sym: "D_{AB}", means: "molecular diffusivity of the solute in the liquid", unit: "m²/s" },
      { sym: "d", means: "particle diameter", unit: "m" },
      { sym: "\\rho_p", means: "PARTICLE density: the mass of a particle over its own volume, "
        + "pores included -- not the density of the solid skeleton and not the bulk "
        + "density of a packed heap", unit: "kg/m³" },
      { sym: "d^2", means: "the square of the diameter", unit: "m²" },
    ],
    note: "With Sh fixed, k_L a is proportional to 1/d², so every time on this page "
      + "scales as d²: twice the diameter, four times as long.  That holds for all three "
      + "isotherms, because the diameter only multiplies the rate constant; the tests "
      + "check it to 1e-6.  For Langmuir and Freundlich the curve drawn is the numerical "
      + "integral, not a closed form.",
  },
  {
    n: 5,
    title: "What the film model leaves out: diffusion inside the particle",
    body: "An adsorbent particle is porous, and the solute must diffuse through its pores "
      + "to reach most of its surface.  That is a second resistance, in series with the "
      + "film, and the film-only model of step 4 sets it to zero.  The mass-transfer Biot "
      + "number compares the two.  A useful estimate of their ratio comes from Glueckauf's "
      + "linear-driving-force approximation for a sphere, in which the inside of the "
      + "particle behaves like a second film of coefficient 5 D_e/R.  When that ratio is "
      + "small the film model is fine; when it is not, the film-only times on this page "
      + "are too short.  The effective pore diffusivity D_e is an input the page cannot "
      + "know: it is marked as an assumption.",
    derivation: [
      { step: "The two resistances in series, per unit of external area (Glueckauf):",
        eq: String.raw`\frac{1}{k_\mathrm{ov}} = \frac{1}{k_L} + \frac{R_p}{5\, D_e}` },
      { step: "Their ratio is the Biot number over five:",
        eq: String.raw`\frac{R_p/(5 D_e)}{1/k_L} = \frac{\mathrm{Bi}}{5}` },
      { step: "With k_L = Sh D_AB/d and R_p = d/2, the diameter cancels:",
        eq: String.raw`\mathrm{Bi} = \frac{\mathrm{Sh}}{2}\,\frac{D_{AB}}{D_e}` },
    ],
    formula: String.raw`\mathrm{Bi} = \frac{k_L\, R_p}{D_e}`,
    where: [
      { sym: "\\mathrm{Bi}", means: "mass-transfer Biot number of the particle" },
      { sym: "k_L", means: "film mass-transfer coefficient", unit: "m/s" },
      { sym: "R_p", means: "particle radius, d/2", unit: "m" },
      { sym: "D_e", means: "effective diffusivity in the pores, on the whole particle "
        + "cross-section (an assumption the student declares)", unit: "m²/s" },
      { sym: "k_\\mathrm{ov}", means: "overall coefficient of film and particle in series",
        unit: "m/s" },
      { sym: "\\mathrm{Sh}", means: "Sherwood number" },
      { sym: "D_{AB}", means: "molecular diffusivity of the solute in the liquid", unit: "m²/s" },
    ],
    note: "The last line is the finding of this step, and it is not what one might expect: "
      + "with Sh fixed the Biot number does NOT depend on the particle size, and at Sh = 2 "
      + "it is D_AB/D_e, larger than 1 for any porous particle because diffusion in pores "
      + "is slower than in free liquid.  So at Sh = 2 the internal resistance is never "
      + "negligible.  In a stirred tank Sh is larger than 2 and grows with the particle "
      + "size, so larger particles fall further under internal control.  Two errors in the "
      + "film-only model point opposite ways -- Sh = 2 under-rates the film, and leaving out "
      + "the pores over-rates the particle -- and the Biot number says which dominates.  "
      + "The page does not solve the diffusion equation inside the particle.",
  },
  {
    n: 6,
    title: "Limits, and where to go next",
    body: "Everything on the page rests on an isotherm measured at one temperature, for one "
      + "solute, in a tank that is perfectly mixed.  The kinetics rest on a stagnant-film "
      + "coefficient that a real impeller will exceed, and on a particle that is uniformly "
      + "loaded.  The continuous alternative to a stirred tank is a packed bed, where the "
      + "adsorbent stays put and a concentration front moves through it.",
    leadsTo: {
      tool: "breakthrough", toolLabel: "Adsorption breakthrough",
      stepTitle: "The S-shaped breakthrough curve",
      body: "The fixed bed: the same isotherm, used continuously, and why the bed is not "
        + "saturated when the solute first appears at its outlet.",
    },
  },
];

export const BATCH_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-temperature",
    title: "One temperature.",
    body: "The isotherm belongs to the temperature it was measured at, and the tank is "
      + "assumed to stay there.  The heat of adsorption is not accounted.",
  },
  {
    id: "one-solute",
    title: "One solute.",
    body: "A real water carries several solutes that compete for the same sites; a "
      + "single-solute isotherm overstates the capacity for each.",
  },
  {
    id: "mixed",
    title: "A perfectly mixed tank.",
    body: "The bulk liquid has one concentration everywhere; every particle sees it.",
  },
  {
    id: "sherwood",
    title: "Sh = 2 is a bound, not a stirred tank.",
    body: "Sh = 2 is a sphere in a liquid that does not move.  In a stirred tank the film "
      + "coefficient is larger, and depends on the impeller power, the particle size and "
      + "the density difference; Harriott (1962) measured it, and the page lets the "
      + "Sherwood number be declared instead of taken as 2.",
  },
  {
    id: "no-pores",
    title: "No diffusion inside the particle.",
    body: "The page flags, by the Biot number, when the film-only model is unreliable; it "
      + "does not solve the diffusion inside the particle.",
  },
  {
    id: "no-engine",
    title: "This page's arithmetic, not the engine's.",
    body: "Choupo's engine has a batch adsorber and a fixed bed, but both contact a GAS with "
      + "the adsorbent, in partial pressure, with Henry or Langmuir isotherms; it has no "
      + "liquid-phase adsorption and no Freundlich model.  Every number here is computed "
      + "by this page, in the browser, from the formulas written on it.",
  },
];
