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
  The reactor-sizing lesson, as DATA, for the same reason the Kremser and
  Hunter-Nash ones are: prose is the part of a tool that rots with nothing
  failing, and an argument held as data can be asserted to still run end to
  end.

  ONE IDEA, and everything else on the page is geometry on it: plot the
  RECIPROCAL rate against conversion and the design equations become areas.
  The PFR collects the area under the curve; the CSTR is a rectangle, because
  a perfectly mixed tank does its entire duty at its outlet condition.  Which
  of the two is smaller is then a question about the SHAPE of the curve, and
  it is read off the picture rather than remembered -- including the case that
  surprises students, where the curve falls and the stirred tank wins.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const LEVENSPIEL_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The plot that turns a rate into a volume",
    body: "Both continuous-reactor design equations are built from the same "
      + "quantity: dX divided by the rate at which the limiting reactant is "
      + "consumed.  So plot the RECIPROCAL rate, 1/(−r_A), against conversion "
      + "X, and the integral you would otherwise do by hand becomes an AREA "
      + "you can see.  Multiply that area by F_A0, the molar feed rate of the "
      + "limiting reactant, and it is a volume in m³.  AREA IS VOLUME — that "
      + "is the whole method, and everything below is geometry on this one "
      + "picture.",
    formula: "PFR:   V = F_A0 ∫₀^X dX/(−r_A)     — the AREA under the curve\n"
      + "CSTR:  V = F_A0 · X/(−r_A)|exit    — a RECTANGLE of that height",
    where: [
      { sym: "V", means: "The reactor VOLUME — the quantity this whole "
        + "construction exists to produce.  Note the direction of travel: in "
        + "the engine the volume is an INPUT and the conversion is the "
        + "result; this diagram reads the same equation backwards, sizing a "
        + "reactor for a conversion you want.", unit: "m³" },
      { sym: "F_A0", means: "The molar feed rate of the LIMITING reactant A: "
        + "its inlet mole fraction times the total inlet molar flow, fixed "
        + "once and used as the reference for every conversion on the page.  "
        + "It is what turns an area into a volume.", unit: "mol/s" },
      { sym: "X", means: "CONVERSION of the limiting reactant — the fraction "
        + "of A fed that has been consumed.  In this corpus the letter X "
        + "carries three OTHER meanings you will meet on neighbouring pages: "
        + "dry-basis moisture content in drying, a solute mole ratio in "
        + "Kremser, and the Gilliland abscissa in the shortcut-column page.  "
        + "Here it is conversion and nothing else.", unit: "dimensionless" },
      { sym: "dX", means: "A differential slice of conversion — the width of "
        + "one strip under the curve.  The engine does not march in X: it "
        + "integrates the mole balance in reactor VOLUME and computes X at "
        + "each stored point.  The two are the same equation with the "
        + "variable changed, which is why a strip's area is a slice of volume "
        + "per mole of feed.", unit: "dimensionless" },
      { sym: "r_A", means: "The rate of reaction OF A per unit volume.  Since "
        + "A is a reactant its stoichiometric coefficient is negative, so "
        + "r_A itself is NEGATIVE while the reaction runs forward.  That is "
        + "why the minus sign in −r_A is written explicitly: it makes the "
        + "plotted quantity a positive rate of CONSUMPTION.  On a reversible "
        + "law it goes negative past equilibrium — the sign is information, "
        + "not an error.", unit: "mol/(m³·s)" },
    ],
    note: "Read the ordinate as a price: a slow reaction is a small −r_A, "
      + "hence a TALL ordinate, hence an expensive reactor.  Where the curve "
      + "is high, conversion is dear; where it is low, it is cheap.  The "
      + "construction needs one condition to mean anything — that −r_A be a "
      + "function of X alone.  Both reactors on this page satisfy it the "
      + "simplest way: isothermal, one liquid phase, one reaction, and the "
      + "volumetric flow held at its feed value.",
  },
  {
    n: 2,
    title: "The CSTR is a rectangle, because it is all one point",
    body: "A tubular reactor changes composition along its length: each slice "
      + "works at its own local conversion, so the reactor accumulates the "
      + "whole area from 0 up to the outlet X.  A perfectly mixed tank has no "
      + "such gradient.  The vessel is at its OUTLET composition everywhere, "
      + "so every mole of feed is converted at the exit rate — one rate, for "
      + "the entire job.  That is why its volume is a conversion divided by a "
      + "single number, and why on this plot it is a rectangle: width X_exit, "
      + "height the ordinate at that same X_exit.",
    formula: "V_CSTR = F_A0 · X_exit / (−r_A)|exit\n"
      + "rectangle:  width X_exit,  height 1/(−r_A)|exit",
    where: [
      { sym: "V_CSTR", means: "The volume of the perfectly mixed tank — the "
        + "RECTANGLE.  Nothing is approximated to get it: it is the exact "
        + "mole balance of an ideal CSTR, drawn instead of solved.",
        unit: "m³" },
      { sym: "X_exit", means: "The conversion at the tank's outlet — ONE "
        + "number, not a profile, because a perfectly mixed vessel has no "
        + "gradient: the whole vessel sits at its exit state.  That is also "
        + "why the rectangle's height is read at the exit and not anywhere "
        + "else.", unit: "dimensionless" },
    ],
    note: "Nothing was approximated to get the rectangle.  It is the exact "
      + "mole balance of an ideal CSTR — F_A0·X = (−r_A)·V — drawn instead of "
      + "solved.  The plot below takes its width and height from the engine's "
      + "own published X_limiting and minus_r KPIs, so the rectangle is the "
      + "reactor the solver actually converged on.",
  },
  {
    n: 3,
    title: "Ordinary kinetics: the rectangle swallows the area",
    body: "For a rate that falls as the reactant is consumed — any positive "
      + "order in that reactant, which is most of what you meet — 1/(−r_A) "
      + "RISES with X.  The exit ordinate is then the highest one on the "
      + "whole interval, so the rectangle drawn at that height contains the "
      + "entire area beneath the curve.  Same feed, same chemistry, same "
      + "conversion: the stirred tank needs the larger volume, and the "
      + "picture says by how much.  The chip beside the plot measures exactly "
      + "that ratio, at the CSTR's own conversion.",
    formula: "1/(−r_A) increasing on [0, X]  ⇒  ∫₀^X dX/(−r_A) ≤ X · "
      + "1/(−r_A)|exit\nhence  V_PFR ≤ V_CSTR   for the same feed and the "
      + "same conversion",
    where: [
      { sym: "V_PFR", means: "The volume of the tubular reactor — the AREA "
        + "under the curve.  The inequality on this line is the whole reason "
        + "a plug-flow reactor is smaller than a tank for the same job "
        + "whenever the ordinate rises with conversion: the tank pays the "
        + "EXIT price for every mole, the tube pays each mole its own price.",
        unit: "m³" },
    ],
    note: "The same reading explains tanks in SERIES.  Each tank is its own "
      + "rectangle standing on the previous tank's conversion, so N tanks are "
      + "a staircase of rectangles under one curve — always more than the "
      + "area, but less than one big tank, and closing on the area as N "
      + "grows.  An infinite chain of stirred tanks is a plug-flow reactor, "
      + "which is this same statement said twice.",
  },
  {
    n: 4,
    title: "The surprise: when the curve falls, the CSTR wins",
    body: "Nothing in that geometry cared which way the curve ran — the "
      + "rising came from the kinetics, not from the method.  Any rate that "
      + "IMPROVES with conversion turns the picture over.  The classical case "
      + "is autocatalysis, where a product accelerates the reaction: at zero "
      + "conversion there is almost nothing to catalyse it, so 1/(−r_A) "
      + "starts high, falls as the product builds up, and climbs again only "
      + "once the reactant runs short.  On that falling branch the exit "
      + "ordinate is the LOWEST on the interval, the rectangle sits UNDER the "
      + "curve, and the stirred tank is the smaller reactor.  A mixed tank "
      + "delivers fresh reactant straight into a product-rich environment; a "
      + "tubular reactor has to crawl through the slow inlet region first.  "
      + "If the law has no uncatalysed path at all, the rate at X = 0 is "
      + "exactly zero, the ordinate is unbounded, and a plug-flow reactor "
      + "cannot start — it needs a recycle or a seed of product, which a "
      + "stirred tank provides by construction.",
    formula: "autocatalytic:  −r_A = k · C_A · C_P\n"
      + "C_P = 0 at X = 0  ⇒  −r_A = 0  ⇒  1/(−r_A) unbounded there",
    where: [
      { sym: "C_A", means: "The molar CONCENTRATION of A that the rate law "
        + "sees — a molar flow divided by a volumetric flow.  The volumetric "
        + "flow is evaluated once at the INLET composition and held constant "
        + "through the reactor, which is the ordinary constant-density "
        + "reading and what makes a single residence time well defined.",
        unit: "mol/m³" },
      { sym: "C_P", means: "The concentration of a PRODUCT, formed the same "
        + "way — there is no separate product path in the engine.  A product "
        + "enters the forward rate only if its stoichiometry entry declares "
        + "its own reaction ORDER; an undeclared product contributes nothing. "
        + " That is what makes an autocatalytic law expressible here rather "
        + "than a special case.", unit: "mol/m³" },
      { sym: "k", means: "The rate constant of the law as written.  Its units "
        + "are whatever makes the product of concentrations come out as "
        + "mol/(m³·s) — they depend on the orders, so they are not fixed in "
        + "advance.", unit: "depends on the reaction orders" },
    ],
    note: "Read this off the plot rather than memorising which reactor wins: "
      + "whichever way the curve runs, compare the rectangle at the exit "
      + "height against the area, and the smaller one is the smaller reactor.  "
      + "NEITHER witness below is autocatalytic — both are pseudo-first-order "
      + "in ethanol, so both curves rise — so the falling branch is described "
      + "here, not demonstrated.  Choupo can express one: a PRODUCT that "
      + "declares its own `order` in the reaction's stoichiometry list enters "
      + "the forward rate like any other species.",
  },
  {
    n: 5,
    title: "Two reactors beat one, and the picture says which two",
    body: "When 1/(−r_A) falls and then rises, neither single reactor is the "
      + "best answer, and the best arrangement is read straight off the "
      + "curve: a CSTR carried as far as the MINIMUM of 1/(−r_A) — the "
      + "cheapest ordinate there is, where its rectangle is at its shallowest "
      + "— followed by a PFR that takes the rest, collecting only the area on "
      + "the rising branch that nothing can avoid.  Each reactor is used "
      + "exactly where its own geometry is favourable.  For an ordinary "
      + "rising curve the minimum sits at X = 0, the CSTR shrinks to nothing, "
      + "and the rule degenerates into the answer you already had.",
    formula: "V_total/F_A0 = X*·1/(−r_A)|X*  +  ∫_{X*}^{X_f} dX/(−r_A)\n"
      + "d/dX* of that total  =  X* · d[1/(−r_A)]/dX  =  0   ⇒   X* at the "
      + "curve's MINIMUM",
    where: [
      { sym: "V_total", means: "The volume of the two reactors in SERIES: a "
        + "tank carried to the minimum of the ordinate, then a tube taking "
        + "the rest.  This combination is a lesson construction — no engine "
        + "site computes it and no tutorial flowsheet puts a tank and a tube "
        + "in series, so what you see here is the two published volumes "
        + "added, not a simulated train.", unit: "m³" },
      { sym: "X*", means: "The conversion at which you switch from the tank "
        + "to the tube — the abscissa of the curve's MINIMUM.  The derivative "
        + "in the second line is why: at the minimum the extra volume of "
        + "widening the rectangle exactly matches the strip the tube would "
        + "have cost.", unit: "dimensionless" },
      { sym: "X_f", means: "The FINAL conversion demanded of the train — the "
        + "specification, the thing you were told to achieve.",
        unit: "dimensionless" },
    ],
    note: "The derivative is worth doing once: differentiating the rectangle "
      + "gives 1/(−r_A) + X*·d[1/(−r_A)]/dX, and extending the CSTR by dX "
      + "removes exactly 1/(−r_A) of integral from the PFR, so the two "
      + "ordinate terms cancel and only X*·d[1/(−r_A)]/dX is left.  The "
      + "optimum is where the curve is FLAT — not where the two reactors are "
      + "equal in size, and not at any conversion a rule of thumb supplies.",
  },
];

export const LEVENSPIEL_LIMITS: readonly {
  id: string; title: string; body: string;
}[] = [
  {
    id: "single-reaction",
    title: "One reaction, one ordinate — selectivity is not on this plot.",
    body: "The curve is drawn for ONE limiting reactant consumed by ONE "
      + "reaction, which is what both witnesses declare. Where reactions run "
      + "in parallel or in series, the reactor with the smaller volume is "
      + "routinely not the one with the better yield of what you wanted: a "
      + "tank's uniform, low reactant concentration favours a different "
      + "product distribution from a tube's gradient. That trade-off is "
      + "invisible here — it needs the whole product distribution, not a "
      + "single rate.",
  },
  {
    id: "isothermal",
    title: "One temperature, and a rate that must depend on X alone.",
    body: "Both reactors here run isothermal at the feed temperature; "
      + "Choupo's PFR also offers adiabatic and jacketed modes, and this "
      + "construction is not drawn for them. The ordinate only means "
      + "something if a given conversion implies a given rate in BOTH "
      + "reactors. An adiabatic pair nearly satisfies that, because the "
      + "energy balance ties T to X the same way in each; a cooled reactor or "
      + "an imposed temperature profile along a tube does not, and then two "
      + "reactors at the same X are simply not at the same rate.",
  },
  {
    id: "constant-density",
    title: "Volumetric flow is held at the feed value.",
    body: "Both units compute concentrations from Q = F_in · v_mol(feed) and "
      + "keep it constant through the reactor — the incompressible-liquid "
      + "assumption their own sources state. A gas-phase reaction that "
      + "changes the number of moles, or a pressure drop along a tube, moves "
      + "the concentration for reasons the conversion axis cannot carry, and "
      + "the two constructions stop being comparable in the simple way drawn "
      + "here.",
  },
  {
    id: "bulk-rate",
    title: "Rates are evaluated at BULK conditions — η = 1, and no decay.",
    body: "Where a case declares a catalyst loading, the reactors convert a "
      + "per-mass rate constant into a volumetric one and then evaluate the "
      + "rate at the bulk composition and temperature: the effectiveness "
      + "factor is taken as one, which the engine announces rather than "
      + "assumes silently. A real pellet with internal diffusion resistance "
      + "has η < 1, so an area drawn from bulk rates UNDERSTATES the volume. "
      + "Catalyst decay with time on stream is not modelled at all, and a "
      + "steady plot has no axis to show it on.",
  },
  {
    id: "not-validation",
    title: "Area matching V_R checks the drawing, not the chemistry.",
    body: "The chips compare this page's trapezoids against the reactor "
      + "volume the case declares. Agreement means the graphical construction "
      + "reproduces the engine's own integration over the engine's own "
      + "points — the residual is trapezoid-versus-RK4 truncation on one grid "
      + "— and it is not evidence that the kinetics are right. The witnesses' "
      + "reaction file says so itself: its Arrhenius parameters are "
      + "illustrative, a mass-conserving test reaction rather than a fitted "
      + "esterification rate.",
  },
];
