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
  The ignition / extinction lesson, as DATA, for the reason every lesson in
  this directory is: prose is the part of a tool that rots with nothing
  failing, and an argument held as data can be asserted to still run end to
  end.

  This is the most consequential diagram in the sequence, and the difference
  shows in what the steps are FOR.  The flash, McCabe, Kremser and Hunter-Nash
  all answer "how much separation do I get".  This one answers "which of the
  answers can the plant actually sit on, and what happens at the moment one
  of them stops existing" -- and the second half of that question is why a
  runaway is not the mirror image of a shutdown.

  Every quantity named below is one the ENGINE publishes or one the reader can
  read off the drawn curves.  Where the textbook idealisation and what Choupo
  actually computes differ -- the removal "line" is the case, and it is not
  exactly a line -- the step says so rather than repeating the idealisation.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const VAN_HEERDEN_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One equation, split into two curves you can draw",
    body: "A stirred tank at steady state has to satisfy two things at once: "
      + "the material balance, which fixes how far the reaction goes, and the "
      + "energy balance, which fixes the temperature.  At a FIXED temperature "
      + "the material balance is monotone in the extent, so it has one root — "
      + "eliminate it, and what is left is ONE equation in the temperature "
      + "alone.  Choupo scans that equation and bisects every root it finds.  "
      + "The Van Heerden picture is the same equation split in two, by adding "
      + "and subtracting the outlet's enthalpy at the FEED temperature: what "
      + "the chemistry released, drawn against what the reactor carried away.",
    formula: "phi(T) = H_out(T) − H_in − Q_ext(T) = 0\n"
      + "phi(T) = R(T) − G(T)\n"
      + "\n"
      + "G(T) = H_in − H(T_in, x(T))                    heat generated  [W]\n"
      + "R(T) = H(T, x(T)) − H(T_in, x(T)) − Q_ext(T)   heat removed    [W]",
    where: [
      { sym: "T", means: "The REACTOR temperature — one temperature for the "
        + "whole perfectly-mixed vessel, and also the outlet's.  In an "
        + "adiabatic or jacketed run it is not something you declare: it is "
        + "the UNKNOWN the energy balance solves for, and the axis every "
        + "curve on this page is drawn against.", unit: "K" },
      { sym: "H_out", means: "The enthalpy flow leaving with the product, on "
        + "the elements/formation datum: the outlet's molar flow priced at "
        + "the reactor temperature and the outlet composition.  Because the "
        + "datum is formation-from-elements, the chemical energy released is "
        + "already inside this one number.", unit: "W" },
      { sym: "H_in", means: "The enthalpy flow entering with the feed, on the "
        + "same datum, priced at the FEED temperature and composition.  It is "
        + "a constant along the whole scan — only H_out moves.", unit: "W" },
      { sym: "Q_ext", means: "The rate of heat crossing the boundary from "
        + "OUTSIDE (the jacket's UA·(T_coolant − T)).  Its sign convention is "
        + "heat INTO the reactor: positive when the jacket is hotter than the "
        + "contents.  It is identically zero in an adiabatic case, which is "
        + "why this page's witness has no coolant knob.", unit: "W" },
      { sym: "phi", means: "The energy-balance RESIDUAL: what the solver "
        + "drives to zero.  A steady state is a temperature at which it "
        + "vanishes, so counting the states is counting this function's "
        + "roots.", unit: "W" },
      { sym: "G", means: "The heat GENERATION curve: the enthalpy the "
        + "chemistry releases, evaluated ALL AT THE FEED TEMPERATURE so that "
        + "it is pure chemistry with the sensible heat held out of it.  Note "
        + "this is not the G of the cooling-tower page (an air mass flow) — "
        + "same letter, different quantity.", unit: "W (plotted in kW)" },
      { sym: "R", means: "The heat REMOVAL curve: sensible heat carried out "
        + "by the product plus whatever the exchanger takes.  Here R is a "
        + "curve of watts against temperature — it is NOT the reflux ratio a "
        + "distillation page calls R, not the gas constant, and not the "
        + "retardation factor the adsorption page writes R_f.",
        unit: "W (plotted in kW)" },
      { sym: "x", means: "The outlet COMPOSITION at temperature T.  It is "
        + "written as a function of T because it is one: hotter means more "
        + "converted, which is exactly why G bends.", unit: "mole fractions" },
      { sym: "W", means: "The watt — the unit every quantity on the vertical "
        + "axis carries.  Worth pausing on: these are RATES of energy, not "
        + "amounts of it.  Both curves are power, so their crossing is a "
        + "steady state and not an energy total.", unit: "W = J/s" },
      { sym: "T_in", means: "The FEED temperature, declared in the stream and "
        + "constant across the whole diagram.  It is both what H_in is priced "
        + "at and the reference the generation curve is evaluated at.",
        unit: "K" },
    ],
    note: "On the elements datum this split is an IDENTITY, not a second "
      + "model: R − G reproduces phi exactly, point for point, which is what "
      + "makes the picture a view of the engine's own equation rather than a "
      + "parallel calculation drawn beside it.  Notice also that there is no "
      + "separate heat-of-reaction term to add — on that datum the heat of "
      + "reaction is already inside H, and G is what you get when you ask how "
      + "much the enthalpy fell at constant temperature.",
  },
  {
    n: 2,
    title: "Generation is a sigmoid, removal is a line",
    body: "Heat GENERATED rises steeply with temperature because the rate "
      + "constant does — the Arrhenius factor is exponential — and then it "
      + "stops rising, because the limiting reactant runs out and there is no "
      + "more chemical energy left to release.  That is the sigmoid.  Heat "
      + "REMOVED is the sensible heat that leaves with the product, plus "
      + "whatever an exchanger takes; both terms are proportional to a "
      + "temperature difference, so removal is a STRAIGHT LINE in T.  And a "
      + "straight line can cut a sigmoid once, twice or three times.  That is "
      + "the entire content of the diagram.",
    formula: "G(T) = (−ΔH_rxn(T_in)) · ξ(T)          one reaction; a sum over ξ_j for several\n"
      + "R(T) = F·c_p·(T − T_in) + UA·(T − T_coolant)",
    where: [
      { sym: "ΔH_rxn", means: "The heat of reaction per mole of extent, always "
        + "Σ νᵢ·hᵢ(T) on the elements/formation datum, each species carrying "
        + "its own heat of formation.  A dH_rxn written in a reactions dict "
        + "is never a primary input here: where formation data exist it is "
        + "only cross-checked, and a disagreement is warned aloud.",
        unit: "J per mole of extent" },
      { sym: "ξ", means: "The reaction EXTENT — moles of reaction turned over "
        + "per second, an ABSOLUTE amount, which is why every species' flow "
        + "follows from it as F_i,out = F_i,in + νᵢ·ξ.  It is NOT conversion: "
        + "conversion is a dimensionless fraction of ONE nominated reactant, "
        + "so one extent gives you every species at once while a conversion "
        + "is always about a single named one.", unit: "mol/s" },
      { sym: "ξ_j", means: "The extent of reaction j when several run at "
        + "once — one per reaction, solved together, each species' flow being "
        + "the sum over all of them.", unit: "mol/s" },
      { sym: "F", means: "The total molar flow through the reactor.  Careful: "
        + "in the textbook removal line this is one number, whereas the "
        + "engine prices H_out on the OUTLET total, which equals the feed's "
        + "only when the stoichiometry conserves moles.", unit: "mol/s" },
      { sym: "c_p", means: "Molar heat capacity — the constant that makes the "
        + "textbook removal line STRAIGHT.  THE ENGINE NEVER USES IT HERE: it "
        + "computes the exact enthalpy difference instead, which is precisely "
        + "why the drawn removal curve bends where the textbook line does "
        + "not.", unit: "J/(mol·K)" },
      { sym: "UA", means: "The overall heat-transfer coefficient times the "
        + "exchange area — one lumped number, the jacket's ability to move "
        + "heat per kelvin of difference.  It TILTS the removal line: more "
        + "cooling capacity, steeper line, and stability is a statement about "
        + "slopes.", unit: "W/K" },
      { sym: "T_coolant", means: "The temperature of the medium in the "
        + "jacket, read only when a heat-exchange mode is declared.  It "
        + "enters the INTERCEPT — it slides the line without tilting it.  "
        + "This page's witness is adiabatic and declares none.", unit: "K" },
    ],
    note: "The removal line is straight in the textbook idealisation of a "
      + "CONSTANT heat capacity.  What the engine publishes is the exact "
      + "enthalpy difference, so the drawn curve bends a little: the heat "
      + "capacity being integrated depends on temperature, and on an outlet "
      + "composition that itself changes along the scan.  Straight enough to "
      + "read as a line; not straight by construction, and the difference is "
      + "visible if you look along it.",
  },
  {
    n: 3,
    title: "Which crossings the reactor can hold: compare the slopes",
    body: "Every crossing is a steady state.  The equations are satisfied "
      + "there and a steady-state solver will sit on it happily.  Whether the "
      + "reactor can HOLD it is a different question, and the diagram answers "
      + "it by comparing slopes.  Nudge the temperature up a little at a "
      + "crossing: if generation grows faster than removal, the surplus heat "
      + "pushes the temperature further up and the reactor leaves; if removal "
      + "grows faster, the extra removal pulls it back.  So a steady state is "
      + "stable when the REMOVAL LINE IS STEEPER than the generation curve "
      + "where they meet.",
    formula: "d(Q_rem)/dT > d(Q_gen)/dT   at the crossing   →   stable\n"
      + "dR/dT > dG/dT",
    where: [
      { sym: "Q_rem", means: "The same removal curve step 1 called R, written "
        + "out for the stability statement.  Two spellings of one quantity — "
        + "the classical literature uses both.", unit: "W" },
      { sym: "Q_gen", means: "The same generation curve step 1 called G.",
        unit: "W" },
      { sym: "dR/dT", means: "The SLOPE of the removal curve at the crossing — "
        + "how much extra heat you get rid of for one more kelvin.  Stability "
        + "is entirely a contest between this and dG/dT: if a small warm "
        + "excursion removes more than it generates, the reactor comes back.",
        unit: "W/K" },
      { sym: "dG/dT", means: "The slope of the generation curve — how much "
        + "extra heat one more kelvin of chemistry releases.", unit: "W/K" },
    ],
    note: "Where there are three crossings the MIDDLE one fails this test — "
      + "the generation curve is cutting upward through the line there — which "
      + "is why it can never be observed however carefully the plant is tuned. "
      + " \"The solver converged\" and \"the plant can run there\" are "
      + "different claims, and this is the cleanest place in the corpus to see "
      + "that the second does not follow from the first.",
  },
  {
    n: 4,
    title: "Ignition, extinction, and why they are not mirror images",
    body: "Now move something.  As a parameter changes, two of the crossings "
      + "slide toward each other, touch, and disappear — and at the moment "
      + "they touch the two curves are TANGENT, which is where a steady state "
      + "stops existing rather than merely becoming unstable.  If the reactor "
      + "was sitting on one of the two that vanished, it now has nowhere to "
      + "be, and it goes to the crossing that is left: IGNITION when the cold "
      + "pair disappears, EXTINCTION when the hot pair does.  How far it "
      + "travels is the ignition span reported beside the plot — the gap "
      + "between the coldest and the hottest crossing.",
    formula: "at ignition / extinction:   G(T) = R(T)   and   dG/dT = dR/dT\n"
      + "                            (the curves are tangent — the two roots merge)",
    note: "THE CONSEQUENCE IS HYSTERESIS, and it is why a runaway is not the "
      + "mirror image of a shutdown.  The cold pair and the hot pair disappear "
      + "at DIFFERENT parameter values, so the setting that ignites the "
      + "reactor is not the setting that puts it out: back the parameter off "
      + "to where it was and the reactor stays hot.  Getting out of a runaway "
      + "means going well past the point that caused it, not undoing it.",
  },
  {
    n: 5,
    title: "What actually moves the removal line",
    body: "The generation curve belongs to the chemistry; the removal line is "
      + "the part an operator holds.  Write it as a slope and an intercept and "
      + "the handles are visible.  Coolant temperature enters the INTERCEPT "
      + "only — it slides the line sideways without tilting it.  UA and the "
      + "total flow enter the SLOPE: more area, a better coefficient or a "
      + "higher throughput all tilt the line steeper, and a steeper line cuts "
      + "the sigmoid fewer times, which is why a well-cooled reactor can have "
      + "one steady state where the adiabatic version of the same chemistry "
      + "has three.",
    formula: "R(T) = (F·c_p + UA)·T − (F·c_p·T_in + UA·T_coolant)\n"
      + "\n"
      + "slope     = F·c_p + UA                 flow and cooling tilt it\n"
      + "intercept = −(F·c_p·T_in + UA·T_coolant)   feed and coolant slide it",
    note: "This page's witness is ADIABATIC: UA is zero and there is no "
      + "coolant to move, so the handles here are the feed temperature, the "
      + "feed flows and the reactor volume.  The corpus carries the jacketed "
      + "twin of the same chemistry — "
      + "tutorials/steady/reactors/cstr06_jacketed, which declares thermalMode "
      + "heatExchange with UA and T_coolant — so run that case and switch the "
      + "source to \"Current run\" to see a removal line with a jacket in it.  "
      + "And watch the feed-flow knobs: raising a feed steepens the removal "
      + "line AND lifts the generation curve's plateau, so what happens to the "
      + "number of crossings cannot be read off either curve alone.",
  },
];

export const VAN_HEERDEN_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "steady-state-only",
    title: "It says which states EXIST, not how the reactor reaches one.",
    body: "Nothing on this page is integrated in time. There is no thermal "
      + "inertia, no time constant, no ignition delay, no overshoot past the "
      + "hot crossing, and no answer to how long any of it takes — a vessel "
      + "with enough thermal mass can spend a long while far from every "
      + "crossing drawn here. The transient is a different calculation, not a "
      + "reading of this picture: it is choupoCtrl's subject, through the "
      + "dynamicCSTR unit.",
  },
  {
    id: "static-criterion",
    title: "The slope test is necessary, not sufficient.",
    body: "dR/dT > dG/dT rules a steady state OUT when it fails. Passing it "
      + "does not prove the reactor is stable there: that verdict needs the "
      + "full dynamic equations, material and energy together, and a state "
      + "that passes the slope comparison can still be dynamically unstable "
      + "and settle into a sustained oscillation rather than a fixed point. "
      + "Nothing here computes that.",
  },
  {
    id: "ordering-not-analysis",
    title: "The tool's unstable flag is an ORDERING, not a measurement.",
    body: "With exactly three roots the tool marks the middle one, which is "
      + "arithmetic on the engine's own list of root temperatures — it "
      + "evaluates dG/dT and dR/dT nowhere. With any other root count it makes "
      + "no stability claim at all. The slopes are on the plot for you to "
      + "read; nothing reads them for you.",
  },
  {
    id: "lumped-cstr",
    title: "ONE temperature and ONE composition, perfectly mixed.",
    body: "The unit is a lumped CSTR: no spatial gradients, no hot spot, no "
      + "mixing time, no wall or jacket dynamics. UA, in a case that declares "
      + "one, is a single overall conductance with no film, no fouling and no "
      + "coolant-side temperature rise inside it. A vessel that mixes "
      + "imperfectly can ignite locally while its average temperature still "
      + "sits on a crossing this diagram calls cold.",
  },
  {
    id: "one-reaction-here",
    title: "The witness carries a SINGLE reaction, with declared teaching kinetics.",
    body: "The construction generalises — G sums over the extents when there "
      + "are several, and the engine scans the same way — but this page's "
      + "witness has one esterification, and its own reactions file says the "
      + "rate law is a teaching variant chosen to place the ignition window "
      + "inside a temperature range the liquid thermo can be trusted over, not "
      + "a measured one. A second reaction that only starts at high "
      + "temperature, a decomposition, would add generation that is simply not "
      + "in the curve you are looking at.",
  },
  {
    id: "not-a-safety-analysis",
    title: "A diagram with two axes is not a hazard assessment.",
    body: "Loss of coolant, loss of agitation, a blocked vent, external fire, "
      + "the pressure the vapour reaches at the hot crossing, relief sizing, "
      + "and what the reactor does on the way rather than at rest — none of it "
      + "is on these axes, and none of it is computed anywhere in this tool. "
      + "The diagram is a good reason to ask those questions. It is not an "
      + "answer to any of them.",
  },
  {
    id: "property-windows",
    title: "The hot branch can sit outside the property correlations' declared range.",
    body: "An ignited crossing is often well above the temperatures the "
      + "vapour-pressure and heat-capacity fits were declared over, and the "
      + "engine says so rather than refusing: it raises an advisory naming "
      + "each component and each excursion. Those advisories are in the run's "
      + "own output and this page does not repeat them, so a hot answer read "
      + "here should be read together with the run's log.",
  },
];
