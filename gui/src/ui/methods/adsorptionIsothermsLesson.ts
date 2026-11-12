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
  adsorptionIsothermsLesson — the lesson text of the `adsorption-isotherms`
  EduTool: which isotherm describes a set of laboratory (c, q) points, with
  what parameters, and how far it can be trusted.

  Every number the page shows is its own arithmetic
  (gui/src/case/adsorptionIsotherms.ts): the engine has no liquid-phase
  isotherm and no Freundlich model today, and the design record says what
  was measured and what is proposed for the engine:
  docs/design/adsorption-isotherms-from-laboratory-data.md.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const ISO_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "An isotherm is the loading against the fluid concentration, at one temperature",
    body: "Put a known mass of adsorbent into a known volume of solution, shake it until "
      + "nothing changes any more, and measure what is left in the liquid.  The solute that "
      + "disappeared from the liquid is on the solid.  One flask gives one point: the "
      + "concentration left in the liquid, and the loading on the solid in equilibrium with "
      + "it.  A series of flasks at one temperature, with different starting concentrations "
      + "or different doses, gives the isotherm.  Its SHAPE matters before any model does.  "
      + "A FAVOURABLE isotherm is concave: the solid fills quickly at low concentration, "
      + "then levels off.  A LINEAR one is a straight line through the origin.  An "
      + "UNFAVOURABLE one is convex: the solid takes little until the concentration is high.",
    derivation: [
      { step: "A balance on the solute in one flask, between the start (concentration "
          + "c_0, adsorbent as charged) and equilibrium (concentration c, loading q):",
        eq: String.raw`V c_0 + M q_0 = V c + M q` },
      { step: "With fresh adsorbent, q_0 = 0, so each flask's loading is read from what "
          + "the liquid lost:",
        eq: String.raw`q = \frac{V\,(c_0 - c)}{M}` },
    ],
    formula: String.raw`q = q^{*}(c) \qquad \text{at fixed } T`,
    where: [
      { sym: "V", means: "volume of solution in the flask", unit: "L" },
      { sym: "c_0", means: "concentration of the solute before the adsorbent is added",
        unit: "mg/L, g/L or mmol/L" },
      { sym: "M", means: "mass of adsorbent in the flask", unit: "g" },
      { sym: "q_0", means: "loading the adsorbent carried when it was added (zero when fresh)",
        unit: "mg/g, kg/kg or mmol/g" },
      { sym: "c", means: "concentration left in the liquid at equilibrium",
        unit: "mg/L, g/L or mmol/L" },
      { sym: "q", means: "loading: amount of solute held per mass of adsorbent, at "
        + "equilibrium with c", unit: "mg/g, kg/kg or mmol/g" },
      { sym: "q^{*}", means: "the isotherm: the equilibrium loading as a function of the "
        + "concentration; the star marks equilibrium" },
      { sym: "T", means: "temperature, held fixed along one isotherm", unit: "K" },
    ],
    note: "The shape decides how a packed bed behaves.  On a favourable isotherm a "
      + "concentration front SHARPENS as it moves down the bed, because the high "
      + "concentrations travel faster than the low ones, and the breakthrough curve is "
      + "steep.  On an unfavourable one the front spreads out the further it travels.  "
      + "The breakthrough page follows such a front through a bed.",
    leadsTo: {
      tool: "breakthrough", toolLabel: "Adsorption breakthrough",
      stepTitle: "The S-shaped breakthrough curve",
      body: "What a favourable isotherm does to a front moving through a packed bed, and "
        + "why the bed is not saturated when the solute first appears at its outlet.",
    },
  },
  {
    n: 2,
    title: "Three models, three assumptions",
    body: "Three equations describe most single-solute isotherms met in a laboratory.  "
      + "The LINEAR isotherm (a Henry's law of the adsorbed phase) says the loading is "
      + "proportional to the concentration; every isotherm becomes linear at low enough "
      + "concentration.  The LANGMUIR isotherm counts SITES: a fixed number of identical, "
      + "independent sites, each holding one molecule, so the solid saturates at q_max.  "
      + "The FREUNDLICH isotherm is a power law with no saturation: it fits a surface whose "
      + "sites are not alike, the strongest filling first.",
    derivation: [
      { step: "Langmuir.  Let θ be the fraction of sites occupied.  Molecules land on "
          + "empty sites at a rate proportional to c and to (1 − θ), and leave occupied "
          + "sites at a rate proportional to θ.  At equilibrium the two rates are equal:",
        eq: String.raw`k_a\, c\,(1 - \theta) = k_d\, \theta` },
      { step: "Solve for θ, write K_L = k_d/k_a, and multiply by the loading of a full "
          + "surface, q = q_max θ:",
        eq: String.raw`\theta = \frac{c}{K_L + c} \;\Rightarrow\; q = \frac{q_\mathrm{max}\, c}{K_L + c}` },
      { step: "The same equation is often written with the affinity b = 1/K_L instead; "
          + "the two forms are one model:",
        eq: String.raw`q = \frac{q_\mathrm{max}\, b\, c}{1 + b\, c}, \quad b = \frac{1}{K_L}` },
      { step: "At low concentration (c much smaller than K_L) the Langmuir isotherm becomes "
          + "linear, with a slope fixed by the RATIO of its two parameters:",
        eq: String.raw`q \to \frac{q_\mathrm{max}}{K_L}\, c = K c \quad (c \ll K_L)` },
      { step: "Freundlich has neither limit.  As c falls its slope dq/dc grows without bound "
          + "when 1/n < 1, so it has no Henry region; as c rises q grows without bound, so it "
          + "has no plateau:",
        eq: String.raw`\begin{aligned} q &= K_F\, c^{1/n} \\ \frac{\mathrm{d}q}{\mathrm{d}c} &= \frac{K_F}{n}\, c^{1/n - 1} \end{aligned}` },
    ],
    formula: String.raw`\begin{aligned} &\text{linear:} & q &= K c \\ &\text{Langmuir:} & q &= \frac{q_\mathrm{max}\, c}{K_L + c} \\ &\text{Freundlich:} & q &= K_F\, c^{1/n} \end{aligned}`,
    where: [
      { sym: "K", means: "the linear (Henry) constant: loading per unit concentration",
        unit: "(units of q)/(units of c), e.g. L/g" },
      { sym: "\\theta", means: "fraction of the sites occupied, between 0 and 1" },
      { sym: "k_a", means: "rate constant of adsorption onto an empty site" },
      { sym: "k_d", means: "rate constant of desorption from an occupied site" },
      { sym: "q_\\mathrm{max}", means: "the Langmuir capacity: the loading when every site is "
        + "occupied", unit: "units of q" },
      { sym: "K_L", means: "the Langmuir half-saturation concentration: the c at which half "
        + "the sites are occupied", unit: "units of c" },
      { sym: "b", means: "the Langmuir affinity, 1/K_L", unit: "1/(units of c)" },
      { sym: "K_F", means: "the Freundlich capacity factor: the loading at c = 1 in the "
        + "units chosen, so its value depends on those units",
        unit: "(units of q)·(units of c)^(−1/n)" },
      { sym: "n", means: "the Freundlich intensity: 1/n below 1 is favourable, 1/n = 1 is "
        + "linear, above 1 unfavourable" },
      { sym: "\\mathrm{d}q/\\mathrm{d}c", means: "the slope of the isotherm",
        unit: "(units of q)/(units of c)" },
    ],
    note: "Langmuir's assumptions are rarely all true for a liquid on an activated carbon, "
      + "and Freundlich's power law was proposed as an empirical description.  A model "
      + "that fits is not thereby a mechanism: the page asks which equation DESCRIBES "
      + "the points, which is a narrower question.",
  },
  {
    n: 3,
    title: "Fitting: straight lines in transformed variables, or least squares on q",
    body: "Before computers, an isotherm was fitted by turning it into a straight line and "
      + "drawing that line through the points.  Langmuir becomes straight when 1/q is "
      + "plotted against 1/c; Freundlich when log q is plotted against log c.  The slope "
      + "and the intercept give the parameters.  The catch is that a straight-line fit "
      + "minimises the squared errors of the TRANSFORMED variable, not of q.  Taking 1/q "
      + "stretches the smallest loadings into the largest values, so the points at the "
      + "lowest concentration -- usually the least precise -- decide the line.  The direct "
      + "fit minimises the squared errors in q itself, which is what was measured, and needs "
      + "an iterative method because the model is not linear in its parameters.",
    derivation: [
      { step: "Langmuir, inverted term by term (the double-reciprocal form):",
        eq: String.raw`\frac{1}{q} = \frac{1}{q_\mathrm{max}} + \frac{K_L}{q_\mathrm{max}}\,\frac{1}{c}` },
      { step: "Freundlich, in logarithms:",
        eq: String.raw`\log_{10} q = \log_{10} K_F + \frac{1}{n}\,\log_{10} c` },
      { step: "The direct fit chooses the parameters β that make the sum of squared "
          + "residuals in q smallest, with a weight w_i per point (w_i = 1 for absolute "
          + "residuals; w_i = 1/q_i for relative ones):",
        eq: String.raw`S(\beta) = \sum_{i=1}^{N} w_i^2 \left[ q^{*}(c_i;\beta) - q_i \right]^2` },
      { step: "Levenberg-Marquardt: linearise the model about the current β, and take the "
          + "step δ that solves a damped version of the normal equations; λ is raised when a "
          + "step does not lower S and lowered when it does:",
        eq: String.raw`\begin{aligned} &\left( J^\mathrm{T} W J + \lambda\, \mathrm{diag}(J^\mathrm{T} W J) \right) \delta \\ &\qquad = -J^\mathrm{T} W r \end{aligned}` },
    ],
    formula: String.raw`\begin{aligned} J_{ik} &= \frac{\partial q^{*}(c_i;\beta)}{\partial \beta_k} \\ r_i &= q^{*}(c_i;\beta) - q_i \end{aligned}`,
    where: [
      { sym: "\\log_{10}", means: "logarithm to base 10" },
      { sym: "\\beta", means: "the parameter vector of the model: (K), (q_max, K_L) or "
        + "(K_F, 1/n)" },
      { sym: "\\beta_k", means: "the k-th parameter" },
      { sym: "S", means: "the weighted sum of squared residuals" },
      { sym: "N", means: "number of measured points" },
      { sym: "i", means: "which point" },
      { sym: "k", means: "which parameter" },
      { sym: "w_i", means: "weight of point i" },
      { sym: "c_i", means: "measured concentration of point i", unit: "units of c" },
      { sym: "q_i", means: "measured loading of point i", unit: "units of q" },
      { sym: "J", means: "the Jacobian: how each model loading moves with each parameter" },
      { sym: "J_{ik}", means: "one element of J" },
      { sym: "W", means: "the diagonal matrix of the squared weights w_i²" },
      { sym: "\\lambda", means: "the damping: large, a short step down the gradient; small, "
        + "a Gauss-Newton step" },
      { sym: "\\delta", means: "the step taken in the parameters" },
      { sym: "r", means: "the vector of residuals r_i" },
      { sym: "r_i", means: "residual of point i: model minus measurement", unit: "units of q" },
      { sym: "\\mathrm{T}", means: "the transpose" },
      { sym: "\\mathrm{diag}", means: "the diagonal of a matrix, as a diagonal matrix" },
    ],
    note: "The page iterates on the logarithm of each positive parameter (q_max, K_L, K_F), "
      + "so they cannot turn negative, and starts from the straight-line fit.  The linear "
      + "model needs no iteration: K = Σ w² c q / Σ w² c².",
  },
  {
    n: 4,
    title: "Which model: residuals, errors and the standard error of each parameter",
    body: "A fit is judged by what it leaves behind.  The residuals of a model that "
      + "describes the data scatter about zero with no pattern; a model with the wrong "
      + "shape leaves a run of positive residuals, then a run of negative ones.  The "
      + "root-mean-square residual says how far, on average, the curve passes from the "
      + "points, in the units of q; the largest relative error says how badly the worst "
      + "point is missed.  Neither says how well the PARAMETERS are known: two parameters "
      + "that trade off against each other can both be uncertain while the curve fits "
      + "well.  That is what the standard errors say.",
    derivation: [
      { step: "Estimate the variance of a measurement from what the fit left, with one "
          + "degree of freedom spent on each parameter:",
        eq: String.raw`s^2 = \frac{S(\hat\beta)}{N - p}` },
      { step: "Near the minimum the parameters are distributed, approximately, with this "
          + "covariance matrix; the standard error of each is the square root of its "
          + "diagonal element:",
        eq: String.raw`\begin{aligned} \mathrm{Cov}(\hat\beta) &\approx s^2 \left( J^\mathrm{T} W J \right)^{-1} \\ \mathrm{se}(\hat\beta_k) &= \sqrt{\mathrm{Cov}_{kk}} \end{aligned}` },
    ],
    formula: String.raw`\begin{aligned} \mathrm{RMS} &= \sqrt{\frac{1}{N}\sum_{i=1}^{N} r_i^2} \\ e_\mathrm{max} &= \max_i \left| \frac{r_i}{q_i} \right| \end{aligned}`,
    where: [
      { sym: "s^2", means: "the estimated variance of one (weighted) measurement" },
      { sym: "\\hat\\beta", means: "the fitted parameters, at the minimum of S" },
      { sym: "\\hat\\beta_k", means: "the k-th fitted parameter" },
      { sym: "p", means: "number of parameters of the model (1 or 2)" },
      { sym: "\\mathrm{Cov}", means: "covariance matrix of the fitted parameters" },
      { sym: "\\mathrm{Cov}_{kk}", means: "its k-th diagonal element" },
      { sym: "\\mathrm{se}", means: "standard error" },
      { sym: "\\mathrm{RMS}", means: "root-mean-square residual on q", unit: "units of q" },
      { sym: "e_\\mathrm{max}", means: "largest relative error over the points" },
    ],
    note: "The standard errors assume the errors are independent, of equal size after "
      + "weighting, and that the model is close to linear in its parameters over their "
      + "uncertainty.  The last is the weakest: when a standard error is as large as its "
      + "parameter, the linear approximation behind it is no longer good, and the honest "
      + "reading is that the data do not fix that parameter.  The page also asks whether "
      + "the measured range COULD tell the models apart: how many decades of c it spans, "
      + "and how far up the fitted Langmuir plateau the highest point reaches.",
  },
  {
    n: 5,
    title: "Using it: how much adsorbent a single flask or tank needs",
    body: "The balance of step 1 is also a design equation.  For a tank of solution "
      + "treated with a dose of adsorbent and left to reach equilibrium, the final state "
      + "lies on the isotherm AND on the balance.  Written as q against c, the balance is "
      + "a straight line -- the operating line -- that starts at (c_0, q_0) and falls with "
      + "slope −V/M.  Where it meets the isotherm is the answer.  Turned round: choose the "
      + "concentration to reach, read q* there, and the balance gives the dose.",
    formula: String.raw`\begin{aligned} q &= q_0 + \frac{V}{M}\,(c_0 - c) \\ M &= \frac{V\,(c_0 - c)}{q^{*}(c) - q_0} \end{aligned}`,
    where: [
      { sym: "V", means: "volume of solution treated", unit: "L" },
      { sym: "M", means: "mass of adsorbent added", unit: "g" },
      { sym: "c_0", means: "initial concentration", unit: "units of c" },
      { sym: "c", means: "final concentration, the target", unit: "units of c" },
      { sym: "q_0", means: "loading of the adsorbent as added", unit: "units of q" },
      { sym: "q^{*}(c)", means: "the fitted isotherm's loading at the final concentration",
        unit: "units of q" },
    ],
    note: "The target concentration is where the isotherm is READ, so it should lie inside "
      + "the measured range; the page says when it does not.  One stage only: two smaller "
      + "doses in two stages, or a column, use less adsorbent for the same removal, which "
      + "this page does not compute.",
    leadsTo: {
      tool: "batch-adsorption", toolLabel: "Batch adsorption in a stirred tank",
      stepTitle: "Stages: split the adsorbent, or send it the other way",
      body: "The same balance on several stages -- crossflow and countercurrent -- the dose "
        + "against the removal, and how long the tank takes to get there.",
    },
  },
];

export const ISO_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-temperature",
    title: "One temperature.",
    body: "Every parameter on the page belongs to the temperature the points were measured "
      + "at.  Adsorption is exothermic, so the loading usually falls as the temperature "
      + "rises; carrying an isotherm to another temperature needs a heat of adsorption, "
      + "which these data do not contain.",
  },
  {
    id: "one-solute",
    title: "One solute, no competition.",
    body: "The models describe one solute alone.  In a real water several solutes compete "
      + "for the same sites, and a single-solute isotherm overstates the capacity for each "
      + "of them.",
  },
  {
    id: "range",
    title: "Outside the measured range the curve is not a prediction.",
    body: "Outside the concentrations measured, the three models diverge -- Freundlich keeps "
      + "rising where Langmuir levels off -- and nothing in the data says which is right.  "
      + "The page shades that region on every plot and flags a batch target that falls in it.",
  },
  {
    id: "equilibrium",
    title: "Equilibrium only.",
    body: "Each point is assumed to be at equilibrium.  A flask taken off the shaker too "
      + "early reports a loading below the isotherm, and no model fitted to it can know.  "
      + "How fast the solid fills is a separate measurement.",
  },
  {
    id: "errors",
    title: "The error model is the student's choice, and it changes the answer.",
    body: "Absolute residuals assume every loading is measured to the same number of mg/g; "
      + "relative residuals assume to the same percentage.  Over several decades of "
      + "concentration the two choices give different parameters, and the page shows both.  "
      + "The standard errors are only as good as the choice.",
  },
  {
    id: "no-engine",
    title: "This page's arithmetic, not the engine's.",
    body: "Choupo's engine carries the Henry and Langmuir isotherms for a GAS, in partial "
      + "pressure, and fits them to measured (T, p, q) data; it has no liquid-phase "
      + "isotherm and no Freundlich model.  Every fit and every number here is computed by "
      + "this page, in the browser, from the formulas written on it.",
  },
];
