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
  The adsorption-breakthrough lesson, as DATA, for the same reason the McCabe,
  Kremser and Hunter-Nash ones are: prose is the part of a tool that rots with
  nothing failing, and an argument held as data can be asserted to still run
  end to end.

  THE FIRST GENUINELY UNSTEADY SEPARATION IN THE LIST, and that is the lesson.
  Every construction before this one settled: flash, McCabe, Kremser and
  Hunter-Nash each draw ONE operating point that a plant then sits on.  A fixed
  bed has no such point.  It has a life -- clean, loading, breaking through,
  spent -- and the number a designer acts on is a TIME.

  Everything asserted here was checked against the code and the witness case
  before it was written, never against memory:

    the two governing equations   src/unitOperations/batch/FixedBedAdsorber.H
    the isotherm (competitive
      extended Langmuir, van't
      Hoff affinity)              src/thermo/adsorbent/Adsorbent.{H,cpp},
                                  IsothermModel.cpp
    R_f / u_sh / t_st             FixedBedAdsorber.H (announced pre-run) and
                                  the case's own header
    the witness's numbers         tutorials/batch/adsorber/
                                    batch13_breakthrough_co2/{system,expected}
    the mesh's share of the
      spreading                   tutorials/batch/adsorber/batch15_mesh_study
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const BREAKTHROUGH_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A bed has no steady state — it has a life",
    body: "Every construction before this one settled.  A flash, a column, an "
      + "absorber, an extractor: you draw one operating point and the plant "
      + "sits on it.  A fixed bed never does.  Feed enters clean solid, the "
      + "solid fills up, and what leaves the outlet changes with the clock — "
      + "so the answer is not a point but a HISTORY, and the number a designer "
      + "acts on is a time.  What the engine integrates is a concentration "
      + "field moving down a bed while the solid underneath it loads.",
    formula: "ε ∂c_i/∂t + ρ_b ∂q_i/∂t = −∂(u c_i)/∂z + D_ax ∂²c_i/∂z²\n"
      + "∂q_i/∂t = k_i · (q*_i − q_i)",
    where: [
      { sym: "c_i", means: "concentration of species i in the GAS moving "
        + "through the bed", unit: "mol/m³" },
      { sym: "q_i", means: "the LOADING — moles of i held on the solid per "
        + "kilogram of adsorbent.  Per kilogram of the thing that stays "
        + "behind, which is why the bed's inventory is a simple sum",
        unit: "mol/kg" },
      { sym: "q*_i", means: "the loading the solid WOULD hold if it were at "
        + "equilibrium with the gas beside it — the star is equilibrium, not "
        + "an operating value", unit: "mol/kg" },
      { sym: "ε", means: "the VOID FRACTION of the bed — the share of its "
        + "volume that is gas, between the particles.  The engine's own line "
        + "prints ρ_p = ρ_b/(1−ε), which is what fixes both meanings" },
      { sym: "ρ_b", means: "the BULK density of the packing — kilograms of "
        + "adsorbent per cubic metre of BED, voids included (not per cubic "
        + "metre of solid, which is ρ_p)", unit: "kg/m³" },
      { sym: "u", means: "the SUPERFICIAL velocity — volumetric flow divided "
        + "by the empty tube's cross-section, as if the packing were not "
        + "there.  The gas between the particles actually moves faster, at "
        + "u/ε", unit: "m/s" },
      { sym: "z", means: "distance along the bed from the inlet", unit: "m" },
      { sym: "D_ax", means: "the AXIAL DISPERSION coefficient — how much the "
        + "front smears by mixing along the flow", unit: "m²/s" },
      { sym: "k_i", means: "the LINEAR DRIVING FORCE coefficient — one "
        + "declared rate constant standing for the pore, film and crystal "
        + "resistances together", unit: "1/s" },
    ],
    note: "Those two lines are what this unit actually solves — no more.  One "
      + "dimension (axial), a declared mesh of finite volumes, first-order "
      + "upwind advection, and a LINEAR DRIVING FORCE for the uptake: the "
      + "solid chases its own equilibrium loading q* at a rate k, and the "
      + "whole of pore diffusion, film resistance and crystal uptake is "
      + "lumped into that one declared coefficient.",
  },
  {
    n: 2,
    title: "The mass-transfer zone: a band of half-loaded solid, travelling",
    body: "The solid nearest the inlet saturates first; far downstream it is "
      + "still clean.  Between the two sits a band where the loading runs from "
      + "full to zero — the MASS-TRANSFER ZONE — and it is the only part of "
      + "the bed where anything is happening at all.  It forms near the inlet "
      + "and then travels, and it travels far more slowly than the gas, "
      + "because nearly every mole that enters leaves the gas and sits on the "
      + "solid.  The ratio of the two speeds is the retention factor, and it "
      + "is set by the feed concentration and the isotherm together.",
    formula: "R_f  = ε + ρ_b · q*(c_in) / c_in\n"
      + "u_zone = u / R_f\n"
      + "t_st = (L / u) · R_f",
    where: [
      { sym: "R_f", means: "the RETARDATION FACTOR — how many times slower the "
        + "concentration front travels than the gas does, because most of "
        + "each molecule's time is spent on the solid" },
      { sym: "c_in", means: "the feed concentration entering the bed",
        unit: "mol/m³" },
      { sym: "u_zone", means: "the speed of the mass-transfer zone through "
        + "the bed — the front, not the gas", unit: "m/s" },
      { sym: "t_st", means: "the STOICHIOMETRIC time — when the front would "
        + "reach the exit if it were infinitely sharp", unit: "s" },
      { sym: "L", means: "the length of the bed", unit: "m" },
    ],
    note: "The engine prints all three BEFORE it integrates and publishes R_f "
      + "and t_st as KPIs — so the arrival time is a prediction you can check "
      + "against the curve, not a number read off it afterwards.  On the "
      + "classroom witness R_f ≈ 304: the gas crosses the bed in L/u = 10 s "
      + "and the front needs about 3040 s to follow it.",
  },
  {
    n: 3,
    title: "Breakthrough is the zone reaching the exit; the S-curve is the "
      + "zone going past it",
    body: "While clean solid remains downstream of the zone the outlet is "
      + "clean — from outside, a bed half spent looks exactly like a fresh "
      + "one.  The outlet lifts when the zone's leading edge arrives and "
      + "reaches the feed value when its trailing edge has left.  So the "
      + "S-shaped curve is a picture of the ZONE itself, redrawn in time at "
      + "one fixed place: its steepness IS the zone's width, and a bed with a "
      + "zone of zero width would give the square wave the plot draws at t_st "
      + "instead.",
    formula: "∫₀^∞ (1 − c_out/c_in) dt = t_st",
    where: [
      { sym: "c_out", means: "concentration leaving the bed — the curve this "
        + "whole page is about", unit: "mol/m³" },
    ],
    note: "That identity is exact for the conservative scheme, and the engine "
      + "publishes both sides — integral_anchor beside t_stoichiometric — "
      + "which is why they agree here to about ten digits.  It also says what "
      + "the square wave means: the solute that leaks out before t_st and the "
      + "capacity still being filled after it are equal in area.  The real "
      + "curve and the ideal step carry the same total; only their timing "
      + "differs.",
  },
  {
    n: 4,
    title: "The consequence a designer acts on: the bed is only partly used",
    body: "You cannot run to t_st, because the product is off specification "
      + "the moment the leading edge arrives.  You switch at BREAKTHROUGH — "
      + "t_b, some small chosen fraction of the feed value, 5 % here.  At that "
      + "instant everything upstream of the zone is saturated, everything "
      + "downstream is still clean, and the zone itself is somewhere in "
      + "between: the capacity you bought and did not use is set entirely by "
      + "how WIDE the zone is.  The usual bookkeeping turns that width into a "
      + "length of bed thrown away at every switch.",
    formula: "LUB = L · (1 − t_b / t_st)        (length of unused bed)",
    where: [
      { sym: "LUB", means: "LENGTH OF UNUSED BED — the part still clean when "
        + "you switched, which is the price of a front with width",
        unit: "m" },
      { sym: "t_b", means: "the BREAKTHROUGH time — when the outlet first "
        + "reaches the concentration you declared unacceptable.  It is a "
        + "CHOICE, not a property of the bed", unit: "s" },
    ],
    note: "On the witness's own numbers t_b(5 %) = 2891 s against t_st = "
      + "3041 s, so about 5 % of the 0.5 m bed — some 2.5 cm — is unused when "
      + "it is switched.  A sharp zone means a bed you can use almost fully; a "
      + "broad one means switching early and paying for adsorbent you never "
      + "loaded.  The design move is to make the bed comfortably longer than "
      + "the zone, since the zone's width is set by the rates rather than by "
      + "L — but that argument assumes the zone has settled into a shape that "
      + "stops changing as it travels, which is the next step's subject.",
  },
  {
    n: 5,
    title: "What makes the zone sharp or broad — and why beds work in pairs",
    body: "Two things fight.  The ISOTHERM decides whether the front sharpens "
      + "itself: on a FAVOURABLE isotherm — concave and saturating, the "
      + "Langmuir shape this case uses — the concentrated part of the wave "
      + "travels faster than the dilute part, so the front keeps steepening "
      + "until dispersion balances it and settles into a constant pattern "
      + "that no longer changes as it travels.  On an UNFAVOURABLE isotherm "
      + "the ordering reverses, and the front spreads for the whole length of "
      + "the bed.  Against sharpening work the rate processes, whatever the "
      + "isotherm does: a finite LDF coefficient means the solid cannot keep "
      + "up with the gas going past it, and axial dispersion smears the front "
      + "directly.  Slow uptake or a low Péclet number widens the zone, and "
      + "the wasted length of step 4 grows with it.",
    formula: "q*_i = q_sat,i · b_i(T) · p_i / (1 + Σ_j b_j(T) · p_j)\n"
      + "b(T) = b(T_ref) · exp[ −(ΔH_ads/R)(1/T − 1/T_ref) ]",
    where: [
      { sym: "q_sat,i", means: "the saturation loading of i — the monolayer "
        + "the Langmuir picture allows", unit: "mol/kg" },
      { sym: "b_i", means: "the AFFINITY of i for the surface, which falls as "
        + "the bed warms", unit: "1/Pa" },
      { sym: "p_i", means: "partial pressure of i in the gas", unit: "Pa" },
      { sym: "b_j, p_j", means: "the same two quantities for EVERY OTHER "
        + "adsorbing species — the subscript changes, the meaning does not" },
      { sym: "T", means: "the temperature of the bed at that point",
        unit: "K" },
      { sym: "Σ_j", means: "a sum over EVERY adsorbing species, including "
        + "i itself.  The shared denominator is the competition: what one "
        + "species takes, another cannot have" },
      { sym: "ΔH_ads", means: "the heat of adsorption, NEGATIVE because "
        + "adsorption releases heat — which is why a warm bed holds less and "
        + "why a hot purge regenerates one", unit: "J/mol" },
      { sym: "T_ref", means: "the temperature at which the affinity was "
        + "measured, the anchor the van't Hoff term moves away from",
        unit: "K" },
      { sym: "R", means: "the gas constant — NOT the reflux ratio a "
        + "distillation page calls R, and not the retardation factor R_f "
        + "above", unit: "J/(mol·K)" },
    ],
    note: "ΔH_ads is negative — adsorption is exothermic — so b falls as T "
      + "rises and a warm bed holds less: raise the temperature knob and the "
      + "front arrives sooner.  That is the lever temperature-swing "
      + "regeneration pulls, and it is why a bed is a batch operation run in "
      + "PAIRS: one loads while the other is purged, heated or depressurised, "
      + "so the breakthrough time IS the cycle time — it sets how often you "
      + "switch, how much adsorbent you buy and how much regeneration duty "
      + "you pay for.  This tool draws ONE loading step from a clean bed.",
  },
];

export const BREAKTHROUGH_LIMITS:
  readonly { id: string; title: string; body: string }[] = [
  {
    id: "isothermal-witness",
    title: "The classroom bed is DECLARED isothermal, and adsorption is "
      + "exothermic.",
    body: "The witness holds T at 298 K by declaration, so no temperature "
      + "field is computed and none is drawn. A real bed heats where it "
      + "loads: this pair releases 45 kJ per mole adsorbed, the affinity b "
      + "falls with the local temperature, the solid holds less there, and "
      + "the front both broadens and arrives earlier than an isothermal model "
      + "says. The engine does carry adiabatic and wall-cooled beds — the "
      + "thermal overlay draws T_out/T_max when a run has them — but they "
      + "require the Ergun flow model, which this witness does not declare "
      + "and no knob here reaches.",
  },
  {
    id: "constant-velocity",
    title: "u, P and T are held constant by declaration, and the price is "
      + "announced rather than hidden.",
    body: "The witness runs the constant-velocity closure: superficial "
      + "velocity, pressure and temperature are declared constants of the "
      + "run. The case says out loud what that costs — the real gas slows by "
      + "roughly 15 % across the uptake zone, and pinning u while the bed "
      + "removes adsorbate fabricates carrier moles at exactly the net uptake "
      + "rate (9.19 mol here, published as carrier_fabricated_mol, and "
      + "showing as physical_mass_closure_rel ≈ 0.108). The plotted CO2 "
      + "balance itself closes at machine level; what the assumption distorts "
      + "is the speed at which the front is carried. `flowModel ergun` closes "
      + "it, and other cases in the corpus run it.",
  },
  {
    id: "single-adsorbate",
    title: "One adsorbate on this curve, though the engine's isotherm is "
      + "competitive.",
    body: "The witness feeds 15 % CO2 in helium; helium carries no isotherm "
      + "record on 13X, so it is transported and never adsorbs. The engine's "
      + "mixture loading IS the competitive extended Langmuir — a strong "
      + "adsorbate suppresses a weak one through the shared site denominator "
      + "— but no fixed-bed case in the corpus runs two adsorbing species, so "
      + "nothing on this plot exercises it. The roll-up and displacement a "
      + "real multi-component front shows, where a weakly held species is "
      + "pushed out ahead of a strongly held one and briefly leaves at MORE "
      + "than its feed concentration, is not here.",
  },
  {
    id: "one-dimension",
    title: "One dimension: no radial profile, no channelling.",
    body: "The model is axial only. A real packed bed is looser at the wall "
      + "than in the core, carries radial velocity and temperature profiles, "
      + "and — badly packed, or at low flow — channels gas past whole regions "
      + "of solid, which broadens or wrecks a breakthrough curve outright. "
      + "None of that can appear in a 1-D model: what you see is the "
      + "spreading that dispersion and finite uptake produce in a perfectly "
      + "uniform bed.",
  },
  {
    id: "mesh",
    title: "Part of the spreading is the MESH, and the case that measures it "
      + "is a separate one.",
    body: "First-order upwind advection on a declared mesh adds numerical "
      + "dispersion of order u·Δz/2. With the witness's own numbers — u = "
      + "0.05 m/s, L = 0.5 m, 100 cells — that is 1.25e-4 m²/s against the "
      + "declared physical D_ax = 1e-4 m²/s, so the numerics contribute at "
      + "least as much spreading as the physics does, and the Pe = 250 in the "
      + "caption is the declared physical one, not an effective one. The mesh "
      + "study on this same bed (25/50/100/200 cells) finds t_b(5 %) still "
      + "moving at first order, with the 100-cell answer about 1.7 % below "
      + "the extrapolated limit. The cell count is not a knob here, and the "
      + "bed-length knob changes Δz without refining it.",
  },
  {
    id: "one-loading-step",
    title: "One loading step from a clean bed — not a cycle.",
    body: "The bed starts empty and is never regenerated here. A working bed "
      + "starts each cycle with whatever the last regeneration failed to "
      + "strip, so its usable swing is smaller than q* and its service "
      + "breakthrough time is shorter than the one drawn from a clean bed. "
      + "The corpus carries the regeneration steps — a concentration-swing "
      + "purge, a hot purge, cycling to a cyclic steady state — as separate "
      + "cases; none of them is this plot.",
  },
];
