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
  Designing for overpressure, as LESSON TEXT (commission C61, 2026-10-11).
  Vitor: "E depois outro sobre design de sistemas para lidar com a sobre
  pressão".

  WHAT WAS READ AND WHAT WAS NOT, said once here and again on the page.
  The controlling texts -- API STD 520 Part I (10th ed., 2020), API STD 521
  (7th ed., 2020) and ASME BPVC Section VIII Div. 1 -- are copyrighted and
  were NOT read for this page.  Every number taken from them reached it
  through an open secondary source, named beside the number in
  OVERPRESSURE_SOURCES:

    * the gas and liquid sizing equations, their constants and the
      preliminary discharge coefficients: the open-source `fluids` library's
      implementation of API 520 Part I (C. Bell, MIT licence), whose tests
      reproduce the standard's own Examples 1, 2 and 5 -- and the page
      DERIVES the three constants from first principles as a second check;
    * the fire heat input: the DIERS Users Group project document on fire
      exposure of low-volatility liquids (Rev. 9, 2018), which quotes API 521
      6th ed. (2014) section 4.4.13.2.4.2 in US customary units;
    * the accumulation and set-pressure rules: a secondary summary of ASME
      VIII-1 UG-125 and UG-134 (Tata Consulting Engineers);
    * DIERS and Leung's omega method: named bibliographically.  Neither the
      DIERS Project Manual nor Leung's papers nor API 520's two-phase annex
      was read, so the omega method's EQUATIONS are not on this page; the
      page says so where it would have used them.

  NOTHING IS QUOTED.  No sentence of any source is reproduced in quotation
  marks, and the test refuses a quotation mark in the steps.  The equations
  are stated as facts with their citation, never transcribed as tables.

  ENGINE CLAIMS carry the file and line they were read at.

  REVISED 2026-10-20 on an external review (DEV.md 4c C112, points 1-4, 10,
  11): the governing scenario is the largest required AREA, each cause sized
  at its own relieving state (step 1); operating, design, MAWP and set are
  four quantities, the rule of thumb gives a preliminary design pressure and
  every MAWP here is an assumption (step 6); a liquid chokes when its vena
  contracta vaporises, coherent with the letdown page (step 10); an
  accumulated energy is not a released power, and W = Q_r/(x lambda) is an
  energy approximation, not DIERS sizing (steps 13-14); the disposal
  inequality is necessary, not sufficient (step 12); the blocked-outlet
  compressor's nominal flow is a declared hypothesis (step 2).
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** Every source the page leans on, with what was taken from it and how it
 *  was reached.  Drawn at the foot of the page. */
export interface OverpressureSource { id: string; cite: string; used: string }

export const OVERPRESSURE_SOURCES: readonly OverpressureSource[] = [
  { id: "api520",
    cite: "API STD 520, Sizing, Selection, and Installation of Pressure-"
      + "relieving Devices, Part I -- Sizing and Selection, 10th ed. "
      + "(American Petroleum Institute, 2020)",
    used: "the gas (critical and subcritical) and liquid sizing equations "
      + "and the preliminary discharge coefficients.  NOT READ: reached "
      + "through the fluids implementation below." },
  { id: "fluids",
    cite: "C. Bell and contributors, fluids -- Fluid dynamics component of "
      + "the Chemical Engineering Design Library (ChEDL), module "
      + "fluids.safety_valve (MIT licence)",
    used: "read in full: the API 520 equations as implemented, the "
      + "standard's Examples 1, 2 and 5 that the implementation reproduces "
      + "(3699 mm2, 4248 mm2, 3066 mm2) -- the test reproduces them too -- "
      + "and the API STD 526 orifice letters, of which the page names only "
      + "the largest." },
  { id: "api521",
    cite: "API STD 521, Pressure-relieving and Depressuring Systems, "
      + "6th ed. (2014), section 4.4.13.2.4.2; current edition 7th (2020)",
    used: "the fire heat input Q = C F A^0.82 with C = 21 000 or 34 500 "
      + "(Btu/h, ft2).  NOT READ: reached through the DIERS document below." },
  { id: "diers-fire",
    cite: "DIERS Users Group, Technology Project: Fire Exposure of Low "
      + "Volatility Liquids, Rev. 9 (16 October 2018)",
    used: "read in full: the API 521 fire equation and its constants as "
      + "quoted, and the relief load as absorbed heat over latent heat." },
  { id: "asme-viii",
    cite: "ASME Boiler and Pressure Vessel Code, Section VIII Division 1, "
      + "UG-125(c) and UG-134 (the numbering before the 2021 edition, which "
      + "moved these rules to UG-150 onward)",
    used: "the allowed accumulation (10 % or 3 psi, 16 % or 4 psi, 21 % for "
      + "fire) and the set-pressure limits.  NOT READ: reached through "
      + "Tata Consulting Engineers, Pressure Relief Valve -- ASME Section "
      + "VIII Unfired Pressure Vessel Code Requirements (web article)." },
  { id: "diers-manual",
    cite: "H. G. Fisher et al., Emergency Relief System Design Using DIERS "
      + "Technology: The Design Institute for Emergency Relief Systems "
      + "(DIERS) Project Manual (AIChE, 1992)",
    used: "named as where two-phase venting of runaway reactions was "
      + "worked out.  NOT READ." },
  { id: "leung-1986",
    cite: "J. C. Leung, A generalized correlation for one-component "
      + "homogeneous equilibrium flashing choked flow, AIChE J. 32 (1986) "
      + "1743-1746, doi:10.1002/aic.690321019",
    used: "named as the origin of the omega method.  NOT READ: no open copy "
      + "was found, so its equations are not on this page." },
  { id: "design-guide",
    cite: "Choupo Design Guide, chapter Pressure relief, flare & safety "
      + "basics (docs/designGuide.tex)",
    used: "the rule of thumb for a preliminary design pressure, max(1.1 x "
      + "operating, operating + 1.7 bar), on which the loop's MAWP is then "
      + "ASSUMED, never derived (step 6)." },
];

export const OVERPRESSURE_STEPS: readonly LessonStep[] = [
  // ---- Part 1: the cause decides the rate --------------------------------
  {
    n: 1,
    title: "A relief device answers two questions: how much, and at what pressure",
    body: "A vessel that can be shut in and over-pressured needs a device "
      + "that opens on its own, with nobody acting and no instrument power: "
      + "a spring-loaded relief valve, a pilot-operated one, or a rupture "
      + "disc.  It is the last layer of the kind the Process-safety page "
      + "warns about -- a system that must work on the day everything else "
      + "has failed, and that can itself be blocked, corroded or set wrong.  "
      + "Sizing it asks two questions.  At what pressure does it open, and "
      + "how high may the pressure go while it passes its flow?  That is the "
      + "pressure ladder of Part 2.  And how much must it pass?  That has no "
      + "single answer, because the flow depends on WHY the pressure is "
      + "rising.  The designer lists every credible cause and sizes each one "
      + "under ITS OWN relieving conditions -- its own relieving pressure "
      + "(the fire allowance of step 6 is not the blocked outlet's), its own "
      + "temperature, its own phase and its own flow regime (critical or "
      + "subcritical vapour, liquid) -- which gives each cause a flow W_s "
      + "AND the area A_s that flow needs.  The device is sized for the "
      + "cause that needs the LARGEST AREA, and that is not always the cause "
      + "with the largest flow: a kilogram of liquid passes a square "
      + "millimetre many times faster than a kilogram of vapour, so a "
      + "vapour load several times smaller than a liquid one can need the "
      + "larger valve.  API 520's own worked examples show the size of the "
      + "effect: the liquid of Example 5 is about fifteen times the mass "
      + "flow of the gas of Example 1, and needs the smaller area (two "
      + "different services, set side by side only for that).  On this "
      + "page the acetone drum of Part 3 has two causes, a fire and a pump "
      + "blocked into it, and the table after the fire bench shows which "
      + "one governs.  The engine's reliefValve sizer "
      + "takes the governing scenario the same way, by the largest area "
      + "(src/postProcessing/sizing/ReliefValveSize.cpp:542).  A cause whose "
      + "discharge is two-phase -- a runaway that froths, a liquid that "
      + "flashes in the valve (step 10, Part 5) -- cannot be sized by the "
      + "single-phase equations of Part 3.  It is marked as needing a "
      + "two-phase method and is not compared until one has sized it, "
      + "because a device sized without it is not sized for it.  The causes "
      + "below are the ones every list starts with.",
    formula: String.raw`A_\mathrm{relief} = \max_s A_s\left(W_s;\ P_{1,s},\ T_{1,s},\ \text{phase and regime of } s\right)`,
    where: [
      { sym: "A_\\mathrm{relief}", means: "the required discharge area the "
        + "device is sized for: that of the governing scenario", unit: "mm2" },
      { sym: "A_s", means: "the area cause s needs to pass its own flow at "
        + "its own relieving state", unit: "mm2" },
      { sym: "s", means: "one credible cause (a scenario)", unit: "–" },
      { sym: "W_s", means: "the rate that one credible cause s would push "
        + "through the device", unit: "kg/h" },
      { sym: "P_{1,s}", means: "the relieving pressure of cause s, absolute "
        + "(step 6)", unit: "Pa" },
      { sym: "T_{1,s}", means: "the relieving temperature of cause s",
        unit: "K" },
    ],
  },
  {
    n: 2,
    title: "Blocked outlet: the source keeps delivering",
    body: "A valve downstream is shut, a line plugs, a control valve fails "
      + "closed -- and whatever feeds the vessel keeps feeding it.  A pump "
      + "delivers until its curve meets the rising pressure; a compressor "
      + "delivers until it surges or trips; a higher-pressure source "
      + "delivers through whatever lets it in.  The relieving rate is that "
      + "inflow at relieving conditions.  The loop bench below takes the "
      + "simplest version on the green-ammonia synthesis loop: the "
      + "converter's outlet is blocked while the recycle compressor goes on "
      + "delivering the whole converter feed, so the device on the feed side "
      + "must pass that feed.  That is a DIDACTIC HYPOTHESIS, and the bench "
      + "says so beside the number: it takes the compressor's NOMINAL flow, "
      + "the plant's converged feed, whatever the pressure it pushes "
      + "against.  What a real compressor delivers into a closed outlet is "
      + "set by its own curve (a centrifugal machine delivers less as its "
      + "discharge pressure rises, until it surges), by the antisurge "
      + "recycle that opens to protect it, by the trips that stop it, and "
      + "by the topology of the loop -- what else feeds the blocked section, "
      + "and what the blocked section can still send elsewhere.  None of "
      + "those is modelled here, so the bench's rate is an upper bound on "
      + "that one hypothesis, not the loop's relief load.",
    formula: String.raw`W = W_\mathrm{in,max}`,
    where: [
      { sym: "W", means: "the relieving rate of this cause", unit: "kg/h" },
      { sym: "W_\\mathrm{in,max}", means: "the largest flow the source can "
        + "deliver against the relieving pressure", unit: "kg/h" },
    ],
  },
  {
    n: 3,
    title: "External fire: heat in, vapour out",
    body: "A pool of burning liquid under a vessel heats the wall wherever "
      + "liquid wets it from inside, and the liquid boils.  Once the device "
      + "is open the pressure holds near the relieving pressure, so the "
      + "liquid boils at its boiling temperature THERE, and every joule the "
      + "fire puts in leaves as vapour.  API STD 521 gives the heat absorbed "
      + "as an empirical function of the wetted area: with prompt "
      + "fire-fighting and drainage that carries burning liquid away from "
      + "the vessel the coefficient is 21 000, without them 34 500, both in "
      + "Btu/h with the area in ft2 (API 521 6th ed., section 4.4.13.2.4.2, as "
      + "the DIERS fire-exposure project document quotes it; the standard "
      + "itself was not read).  The page converts them to SI exactly: "
      + "43.19 kW and 70.96 kW for A in m2 -- the first is the 43.2 the "
      + "Design Guide uses.  F is an environment factor, 1 for a bare "
      + "vessel and lower when insulation that survives a fire protects "
      + "it; its values are in the standard and are not reproduced here.  "
      + "Only wetted surface within the height a pool fire reaches above "
      + "grade counts, and the standard says how high that is.  The "
      + "exponent below 1 is the empirical admission that a big vessel is "
      + "not engulfed as evenly as a small one.",
    formula: String.raw`Q = C\, F\, A_\mathrm{wet}^{0.82}, \qquad W = \frac{Q}{\lambda}`,
    where: [
      { sym: "Q", means: "the heat the fire puts into the liquid", unit: "W" },
      { sym: "C", means: "the API 521 coefficient: 21 000 or 34 500 in "
        + "Btu/h with A in ft2 (43 190 or 70 960 in W with A in m2)",
        unit: "W/m^1.64" },
      { sym: "F", means: "the environment factor: 1 for a bare vessel",
        unit: "–" },
      { sym: "A_\\mathrm{wet}", means: "the wetted surface the fire can "
        + "reach", unit: "m2" },
      { sym: "\\lambda", means: "the latent heat of the liquid at the "
        + "relieving temperature", unit: "J/kg" },
    ],
    note: "The latent heat on this page is the engine's: the acetone "
      + "witness's propertyPoint asks for Hvap_acetone at the boiling "
      + "temperature it finds at the relieving pressure.  That key is "
      + "Component::Hvap_latent (src/thermo/Component.cpp:1334-1342), the "
      + "record's HvapTb carried to T by the Watson correlation -- the same "
      + "term the engine subtracts from the ideal-gas enthalpy to price a "
      + "liquid (src/thermo/ThermoPackage.H:290) -- exposed to the props "
      + "bench for this page (src/propertyOps/PropertyEvaluator.cpp:192).",
  },
  {
    n: 4,
    title: "Cooling or reflux failure: the vapour nobody condenses",
    body: "A distillation column, or a reactor refluxed through a condenser, "
      + "makes vapour all the time; the condenser turns it back into liquid. "
      + "Lose the cooling water, the fan, or the reflux pump and the vapour "
      + "keeps coming with nowhere to go but the relief device.  The "
      + "relieving rate is the vapour the lost duty would have condensed, "
      + "which is why the condenser duty every Choupo column case publishes "
      + "is a relief number as well as a utility number.  Two corrections a "
      + "real study makes are named and not taken here: the vapour is at "
      + "the relieving pressure, not the operating one, so its latent heat "
      + "and composition shift; and a reboiler that loses its own heat "
      + "medium at the same moment makes less vapour.",
    formula: String.raw`W = \frac{Q_\mathrm{c}}{\lambda}`,
    where: [
      { sym: "Q_\\mathrm{c}", means: "the condenser duty that is lost",
        unit: "W" },
    ],
  },
  {
    n: 5,
    title: "Runaway reaction, tube rupture, thermal expansion",
    body: "Three more causes, each a different kind of rate.  A RUNAWAY "
      + "REACTION is the cooling-failure scenario of the Process-safety page "
      + "carried past the point where the methodology stops: the mass "
      + "reaches its boiling point at the relieving pressure, and the vent "
      + "must remove the reaction's heat as vapour -- usually as a "
      + "two-phase mixture, which Part 5 explains.  An EXCHANGER TUBE "
      + "RUPTURE lets the high-pressure side flow into the low-pressure "
      + "side through the two open ends of one broken tube; the rate is two "
      + "orifice flows, and the standard gives a criterion for when the "
      + "low-pressure side need not be protected against it (not reproduced "
      + "here).  THERMAL EXPANSION is the smallest "
      + "and the easiest to forget: liquid trapped between two closed "
      + "valves and warmed by the sun or by a tracing line expands, and a "
      + "liquid is nearly incompressible, so the pressure rises very fast "
      + "for very little heat.  The device only has to let out the volume "
      + "the liquid gains, and that rate follows from two definitions.",
    formula: String.raw`\frac{\mathrm{d}V}{\mathrm{d}t} = \frac{\beta\, \Phi}{\rho\, c_p}`,
    derivation: [
      { step: "The volumetric expansion coefficient says how fast the "
        + "volume of a fixed mass grows with temperature.",
        eq: String.raw`\mathrm{d}V = \beta\, V\, \mathrm{d}T` },
      { step: "The heat entering the trapped mass warms it.",
        eq: String.raw`\Phi = \rho\, V\, c_p \frac{\mathrm{d}T}{\mathrm{d}t}` },
      { step: "Eliminate the temperature: the trapped volume V cancels, so "
        + "the size of the trapped section does not set the rate -- the "
        + "heat input does." },
    ],
    where: [
      { sym: "V", means: "the volume of the trapped liquid", unit: "m3" },
      { sym: "t", means: "time", unit: "s" },
      { sym: "\\beta", means: "the liquid's volumetric expansion coefficient",
        unit: "1/K" },
      { sym: "\\Phi", means: "the heat entering the trapped liquid",
        unit: "W" },
      { sym: "\\rho", means: "the liquid density", unit: "kg/m3" },
      { sym: "c_p", means: "the liquid's specific heat capacity",
        unit: "J/(kg K)" },
      { sym: "T", means: "the liquid temperature", unit: "K" },
    ],
  },
  // ---- Part 2: devices and the pressure ladder ---------------------------
  {
    n: 6,
    title: "The pressure ladder",
    body: "Four pressures, and they are four different quantities.  The "
      + "OPERATING pressure is where the process runs.  The DESIGN pressure "
      + "is what the designer chooses to design the vessel for, above the "
      + "operating pressure with a margin so that normal swings do not lift "
      + "the device; the Design Guide's rule of thumb, the larger of 10 % "
      + "and 1.7 bar above the operating pressure, gives a PRELIMINARY "
      + "design pressure and nothing more.  The MAXIMUM ALLOWABLE WORKING "
      + "PRESSURE (MAWP) is a property of the BUILT vessel: what its actual "
      + "wall, in its actual material, carries under the pressure code it "
      + "is built and stamped to.  It is at least the design pressure, "
      + "because the wall was chosen to carry that, and a thicker plate "
      + "than the calculation needs raises it.  No rule of thumb gives a "
      + "MAWP, and nothing on this page certifies one: the engine's "
      + "vessel sizer goes the other way, from a design pressure to a wall "
      + "thickness (src/postProcessing/sizing/VesselMechanics.H), and stamps "
      + "nothing.  So the benches below ASSUME a MAWP and say so: equal to "
      + "the preliminary design pressure, the lowest it can be, which is "
      + "the conservative choice for a gas valve (a lower relieving "
      + "pressure needs a larger area), or a declared round number for the "
      + "acetone drum.  The SET pressure is where the device starts to "
      + "open; with one device it may not exceed the MAWP, and here it is "
      + "taken AT the MAWP.  Above the set pressure the device "
      + "needs some OVERPRESSURE to open fully and pass its rated flow, so "
      + "the vessel is allowed a short ACCUMULATION above its MAWP while it "
      + "relieves: 10 % (or 3 psi, whichever is larger) with one device; "
      + "16 % (or 4 psi) with several, because their set pressures are "
      + "staggered -- the first at the MAWP, the others up to 105 % of it; "
      + "and 21 % for the fire case, where a device added for fire alone "
      + "may be set up to 110 %.  These are the rules of ASME VIII-1 "
      + "UG-125(c) and UG-134 as a secondary source quotes them; the Code "
      + "was not read.  With the device set at the MAWP, the overpressure "
      + "and the accumulation are the same number, and the relieving "
      + "pressure P1 every sizing equation takes is the top of the ladder, "
      + "in ABSOLUTE terms.",
    formula: String.raw`P_1 = \max\left[(1 + a)\,\mathrm{MAWP},\ \mathrm{MAWP} + \Delta p_\mathrm{min}\right] + P_\mathrm{atm}`,
    where: [
      { sym: "P_1", means: "the relieving pressure, absolute", unit: "Pa" },
      { sym: "a", means: "the allowed accumulation: 0.10 one device, 0.16 "
        + "several, 0.21 fire", unit: "–" },
      { sym: "\\mathrm{MAWP}", means: "the maximum allowable working "
        + "pressure of the built vessel, gauge -- ASSUMED on this page, "
        + "never derived from the rule of thumb", unit: "Pa g" },
      { sym: "\\Delta p_\\mathrm{min}", means: "the floor on the "
        + "accumulation: 3 psi one device, 4 psi several, none quoted for "
        + "fire", unit: "Pa" },
      { sym: "P_\\mathrm{atm}", means: "the atmosphere, 101 325 Pa",
        unit: "Pa" },
    ],
  },
  {
    n: 7,
    title: "The devices, and the pressure behind them",
    body: "A CONVENTIONAL spring-loaded valve holds its disc shut with a "
      + "spring; whatever pressure sits on the outlet side pushes on the "
      + "disc too, so back pressure changes when it opens and how far it "
      + "lifts.  Back pressure comes in two kinds: SUPERIMPOSED, already in "
      + "the discharge header before the valve opens (other valves "
      + "relieving into the same flare header), and BUILT-UP, made by this "
      + "valve's own flow through its outlet piping.  Secondary summaries of "
      + "API 520 put the built-up back pressure a conventional valve "
      + "tolerates at 10 % of its set pressure.  A BALANCED-BELLOWS valve "
      + "shields the disc from the outlet with a bellows and so tolerates "
      + "more, at a capacity reduced by a back-pressure factor read from the "
      + "manufacturer or the standard's figure (not reproduced here; the "
      + "benches below take it as 1 and let you change it).  A "
      + "PILOT-OPERATED valve uses the process pressure itself to hold the "
      + "main valve shut, through a small pilot, and opens fully at the set "
      + "pressure.  A RUPTURE DISC is a membrane that bursts: it does not "
      + "leak and it does not foul, but it does not reclose, so the whole "
      + "inventory can leave.  A disc UPSTREAM of a valve protects the valve "
      + "from a corrosive or fouling fluid and keeps the reclosing; the pair "
      + "passes less than the valve alone, which a combination factor "
      + "carries -- 0.9 when the combination has not been certified "
      + "together.",
    formula: String.raw`K_\mathrm{c} = 0.9 \;\; \text{(disc + valve, not certified together)}`,
    where: [
      { sym: "K_\\mathrm{c}", means: "the combination factor: 1 for a valve "
        + "alone", unit: "–" },
    ],
  },
  // ---- Part 3: sizing ----------------------------------------------------
  {
    n: 8,
    title: "Sizing a gas or vapour valve: critical flow",
    body: "A gas leaving a vessel through a nozzle speeds up as its pressure "
      + "falls, until at the narrowest section it reaches the speed of "
      + "sound.  From then on, lowering the downstream pressure further "
      + "does not increase the flow: it is CHOKED, and the flow depends "
      + "only on the upstream state.  For a relief valve discharging to "
      + "atmosphere or a flare this is almost always the case.  The "
      + "equation is the isentropic ideal-gas nozzle, with Z carried as a "
      + "correction and a discharge coefficient for the real valve.  The "
      + "constant 0.03948 is not data: it is the unit bookkeeping of kg/h, "
      + "kPa, mm2 and kg/kmol, as the last derivation step shows, and the "
      + "test recomputes it.  The fluid properties come from the engine: "
      + "Z from the SRK vapour root and k as Cp_ig/(Cp_ig - R), the "
      + "ideal-gas ratio the equation is derived with "
      + "(src/propertyOps/PropertyPoint.cpp:72-75).",
    formula: String.raw`A = \frac{W}{C\, K_\mathrm{d}\, P_1\, K_\mathrm{b}\, K_\mathrm{c}} \sqrt{\frac{T\, Z}{M}}, \qquad C = 0.03948 \sqrt{k \left(\frac{2}{k+1}\right)^{\frac{k+1}{k-1}}}`,
    derivation: [
      { step: "An ideal gas expanding isentropically from rest at P1 and T1 "
        + "chokes when the throat pressure falls to the critical ratio.",
        eq: String.raw`\frac{P_\mathrm{cf}}{P_1} = \left(\frac{2}{k+1}\right)^{\frac{k}{k-1}}` },
      { step: "The mass flux at the throat then depends only on the "
        + "upstream state.",
        eq: String.raw`\dot{m}_\mathrm{t} = P_1 \sqrt{\frac{k\, M}{Z\, R\, T} \left(\frac{2}{k+1}\right)^{\frac{k+1}{k-1}}}` },
      { step: "The valve passes a fraction of the ideal nozzle's flow.",
        eq: String.raw`W = K_\mathrm{d}\, K_\mathrm{b}\, K_\mathrm{c}\, A\, \dot{m}_\mathrm{t}` },
      { step: "In the units the standard uses (W in kg/h, P1 in kPa, A in "
        + "mm2, M in kg/kmol, R in J/(mol K)), the conversion collects into "
        + "one number, 3.6 over the square root of 1000 R, which is "
        + "0.039481 -- the 0.03948 of the equation.",
        eq: String.raw`C = \frac{3.6}{\sqrt{1000\, R}} \sqrt{k \left(\frac{2}{k+1}\right)^{\frac{k+1}{k-1}}}` },
    ],
    where: [
      { sym: "A", means: "the effective discharge area the valve needs",
        unit: "mm2" },
      { sym: "C", means: "the critical-flow coefficient, a function of k",
        unit: "–" },
      { sym: "K_\\mathrm{d}", means: "the effective discharge coefficient: "
        + "0.975 for preliminary sizing of a gas valve, 0.62 for a rupture "
        + "disc alone", unit: "–" },
      { sym: "K_\\mathrm{b}", means: "the back-pressure correction "
        + "(1 for a conventional valve within its limit)", unit: "–" },
      { sym: "T", means: "the relieving temperature", unit: "K" },
      { sym: "Z", means: "the compressibility factor at relieving "
        + "conditions", unit: "–" },
      { sym: "M", means: "the molar mass of the gas", unit: "kg/kmol" },
      { sym: "k", means: "the ratio of specific heats Cp/Cv (ideal gas)",
        unit: "–" },
      { sym: "P_\\mathrm{cf}", means: "the critical flow pressure at the "
        + "throat", unit: "kPa" },
      { sym: "\\dot{m}_\\mathrm{t}", means: "the choked mass flux at the throat of the ideal nozzle",
        unit: "kg/(s m2)" },
      { sym: "R", means: "the molar gas constant, 8.314 J/(mol K)",
        unit: "J/(mol K)" },
    ],
    //  C64, 2026-10-11: the same choke, met from the other side -- a valve
    //  meant to TAKE a large pressure drop, not to relieve one.
    leadsTo: {
      tool: "letdown",
      toolLabel: "Large pressure letdown",
      stepTitle: "Choked flow: the mass flow stops rising when the throat is sonic",
      body: "The same choked flow is what a letdown valve meets when it "
        + "takes a large pressure drop: the letdown page draws the "
        + "flow flattening against the pressure-drop ratio, then follows a "
        + "liquid into cavitation and flashing, and the staged trims, "
        + "installation and power-recovery turbines industry uses instead.",
    },
  },
  {
    n: 9,
    title: "Subcritical flow: when the back pressure is high",
    body: "If the pressure downstream is above the critical flow pressure "
      + "the flow does not choke, and it then depends on the pressure "
      + "difference as well.  A valve discharging into a header that is "
      + "itself at a few bar -- a closed system, a long flare line at full "
      + "load -- can end here; the page checks the ratio and switches "
      + "equations.  The constant 17.9 is again bookkeeping (it is 1e6/3600 "
      + "times the square root of R/2000, which is 17.910).  This form "
      + "carries no back-pressure factor: the back pressure enters through "
      + "P2 itself.",
    formula: String.raw`A = \frac{17.9\, W}{F_2\, K_\mathrm{d}\, K_\mathrm{c}} \sqrt{\frac{T\, Z}{M\, P_1 (P_1 - P_2)}}, \qquad F_2 = \sqrt{\frac{k}{k-1}\, r^{2/k} \frac{1 - r^{(k-1)/k}}{1 - r}}`,
    where: [
      { sym: "P_2", means: "the back pressure, absolute", unit: "kPa" },
      { sym: "F_2", means: "the subcritical flow coefficient", unit: "–" },
      { sym: "r", means: "the ratio P2/P1", unit: "–" },
    ],
  },
  {
    n: 10,
    title: "Sizing a liquid valve, while the liquid stays liquid",
    body: "A liquid that stays liquid all the way through the valve is an "
      + "orifice: the flow goes as the square root of the pressure "
      + "difference over the density.  The standard writes it with a "
      + "volumetric flow in L/min, pressures in kPa gauge and the specific "
      + "gravity, and its constant 11.78 is, once more, the units: "
      + "1e6/60 000 times the square root of the water density over 2000.  "
      + "The preliminary discharge coefficient for a liquid valve is 0.65, "
      + "much lower than a gas valve's, and there are two more corrections: "
      + "Kw for back pressure on a balanced valve and Kv for a viscous "
      + "liquid (both 1 here, and named rather than computed).  The "
      + "equation is NOT universal.  It carries a hypothesis none of its "
      + "symbols shows: the liquid does not vaporise anywhere in the valve.  "
      + "The lowest pressure in a liquid valve is not at its outlet but at "
      + "the vena contracta, the narrowest section of the jet, below the "
      + "outlet pressure (the letdown page's step 7), so a liquid can reach "
      + "its vapour pressure there while the outlet is above it.  Four "
      + "cases follow, the same four the letdown page draws for a control "
      + "valve.  SINGLE-PHASE LIQUID: the vena contracta stays above the "
      + "vapour pressure, and the equation applies.  CAVITATION WITH "
      + "RECOVERY: the vena contracta falls below the vapour pressure and "
      + "the outlet stays above it; vapour forms in the jet and collapses as "
      + "the pressure recovers, and as it develops the flow rises less than "
      + "the equation says.  FLASHING: the outlet is at or below the vapour "
      + "pressure; the vapour stays, and the valve passes a two-phase "
      + "mixture.  CHOKED LIQUID FLOW, which the last two reach: once the "
      + "vaporising vena contracta limits the flow, a lower outlet pressure "
      + "no longer raises it, even with the outlet still above the vapour "
      + "pressure (the letdown page puts the ammonia throttle's choke at "
      + "about 5.22 bar against a vapour pressure of 1.894 bar).  An area "
      + "sized on the whole difference p1 - p2 is then too small, because "
      + "the flow it was sized for never arrives.  A liquid drawn from a "
      + "drum is SATURATED at the drum's pressure, so relieved to a lower "
      + "one it flashes: that is a two-phase discharge (Part 5), and this "
      + "equation is then the wrong equation, not a rough one.",
    formula: String.raw`A = \frac{11.78\, Q_\mathrm{L}}{K_\mathrm{d}\, K_\mathrm{w}\, K_\mathrm{c}\, K_\mathrm{v}} \sqrt{\frac{G}{p_1 - p_2}} \qquad \text{only while } P_\mathrm{vc} > P_v`,
    where: [
      { sym: "P_\\mathrm{vc}", means: "the pressure at the vena contracta, "
        + "the narrowest section of the jet, below the outlet pressure",
        unit: "Pa" },
      { sym: "P_v", means: "the vapour pressure of the liquid at its "
        + "relieving temperature (its bubble pressure, for a mixture)",
        unit: "Pa" },
      { sym: "Q_\\mathrm{L}", means: "the liquid flow to relieve",
        unit: "L/min" },
      { sym: "K_\\mathrm{w}", means: "the back-pressure correction of a "
        + "balanced valve in liquid service", unit: "–" },
      { sym: "K_\\mathrm{v}", means: "the viscosity correction", unit: "–" },
      { sym: "G", means: "the specific gravity: liquid density over that of "
        + "water", unit: "–" },
      { sym: "p_1", means: "the relieving pressure, gauge", unit: "kPa g" },
      { sym: "p_2", means: "the back pressure, gauge", unit: "kPa g" },
    ],
    note: "Where the vena contracta sits needs the valve's own pressure "
      + "recovery, a maker's number, and this page states none for a relief "
      + "valve; the liquid bench therefore DECLARES its hypothesis (a pump "
      + "delivering cold acetone, far below its boiling point) instead of "
      + "checking it.  The engine's reliefValve sizer applies the same "
      + "equation to a blocked liquid outlet "
      + "(src/postProcessing/sizing/ReliefValveSize.cpp:361) and tests "
      + "neither pressure: its two-phase refusal reads the stream's vapour "
      + "fraction in the VESSEL (ReliefValveSize.cpp:376), not what the "
      + "liquid does in the valve.  In the green-ammonia basic design the "
      + "three liquid scenarios are drum liquids, saturated at their drums' "
      + "pressures, and the sizer relieves them to its default atmospheric "
      + "back pressure: the Separator's (140 bar) and LetdownHP's liquids "
      + "flash, and StorageFlash's, saturated at 1 atm itself, leaves at its "
      + "own vapour pressure with the vena contracta below it.  Their "
      + "published areas -- the LetdownHP and StorageFlash valves' governing "
      + "ones among them -- rest on the hypothesis this step names.  Named "
      + "here, not yet fixed in the engine.",
  },
  {
    n: 11,
    title: "From an area to a valve",
    body: "The equations give the smallest effective area that passes the "
      + "flow.  A real valve is bought in standard orifice sizes, lettered "
      + "D to T in API STD 526 (the largest, T, is 26 in2, about 16 800 "
      + "mm2), and the designer takes the next size up.  Where the largest "
      + "is not enough, several valves share the load -- which is exactly "
      + "the multiple-device case of step 6, with its larger accumulation "
      + "and its staggered set pressures.  And the area is only the start: "
      + "the inlet line must not starve the valve (a valve whose inlet loss "
      + "is too large opens and closes violently, which destroys it), the "
      + "outlet line sets the built-up back pressure of step 7, and the "
      + "discharge pushes back on the piping with a reaction force someone "
      + "must support.  None of that is on this page.",
    formula: String.raw`A_\mathrm{valve} \ge A`,
    where: [
      { sym: "A_\\mathrm{valve}", means: "the effective area of the "
        + "standard orifice chosen", unit: "mm2" },
    ],
  },
  // ---- Part 4: disposal --------------------------------------------------
  {
    n: 12,
    title: "Relief is not finished at the valve outlet",
    body: "A valve that opens has moved the hazard, not removed it.  A "
      + "steam or air relief may go to atmosphere; a flammable or toxic "
      + "one goes into a closed header and then through equipment that "
      + "makes it harmless.  A KNOCK-OUT DRUM first: a relief stream "
      + "carries liquid (entrained, condensed, or two-phase from the start) "
      + "and a flare cannot burn liquid -- it rains burning droplets -- so "
      + "the drum separates it.  Then a FLARE, which burns what is "
      + "flammable, sized so that its flame is stable and the heat it "
      + "radiates at grade is tolerable for people (API STD 521 and 537 "
      + "carry the rules); or a SCRUBBER, which absorbs what is toxic into a "
      + "liquid that neutralises it; or a QUENCH or CATCH TANK that receives "
      + "a two-phase runaway vent whole.  Each of these is a system with a "
      + "capacity, and each must be in service on the day.  The Bhopal "
      + "account on the Process-safety page is this paragraph's whole "
      + "argument: the relief valve on the methyl isocyanate tank opened, "
      + "and the scrubber and the flare behind it were not in service, so "
      + "the relief went into the city.  The inequality below is an "
      + "ILLUSTRATIVE capacity condition: NECESSARY, and nowhere near "
      + "sufficient.  The rate it compares is the sum over every device one "
      + "cause opens at once -- a power failure or a cooling-water failure "
      + "lifts many valves into one header together -- which is why a "
      + "disposal system is sized on its own worst cause, not on one valve's "
      + "governing scenario.  And meeting the mass rate designs none of the "
      + "equipment.  A knock-out drum is sized on the droplets it must "
      + "settle and the liquid it must hold; a flare on the stability of "
      + "its flame, the heat it radiates at grade, and the back pressure "
      + "its header puts on every valve discharging into it (steps 7 and "
      + "9); a scrubber on how much of the toxic component its liquid "
      + "absorbs, how much liquid it holds and circulates, and what happens "
      + "when that liquid is spent.  None of that is on this page, and the "
      + "standards that carry it were not read.",
    formula: String.raw`W_\mathrm{disposal} \ge \sum_{v} W_v \quad \text{(necessary, not sufficient)}`,
    where: [
      { sym: "W_\\mathrm{disposal}", means: "the rate the knock-out drum, "
        + "flare or scrubber can take", unit: "kg/h" },
      { sym: "v", means: "each relief device that one cause opens at the "
        + "same time into the same disposal system", unit: "–" },
      { sym: "W_v", means: "the rate device v passes in that cause", unit: "kg/h" },
    ],
  },
  // ---- Part 5: two-phase venting -----------------------------------------
  {
    n: 13,
    title: "Why a runaway vent is two-phase, and why that makes it larger",
    body: "When a reactor full of boiling liquid is vented, the vapour "
      + "forms throughout the liquid, not only at its surface.  The bubbles "
      + "take up room, the level SWELLS, and if it reaches the vent the "
      + "device passes a frothy mixture of liquid and vapour.  For a "
      + "runaway that is the usual case, and it is what the Design "
      + "Institute for Emergency Relief Systems (DIERS, an AIChE "
      + "consortium) set out to quantify; its project manual (Fisher et "
      + "al., 1992) is the reference, and it was not read for this page.  The DIRECTION "
      + "of the consequence follows from an energy balance, under "
      + "hypotheses that are restrictive and are stated: the vent holds the "
      + "pressure, so the mass sits at its boiling temperature and stores "
      + "no more sensible heat; all the power the reaction releases at that "
      + "instant leaves through the vent; the liquid leaving carries no "
      + "latent heat; and the latent heat and the vapour fraction are "
      + "constants.  The vent then removes the reaction's power because the "
      + "vapour leaving carries latent heat.  If only a mass fraction x of "
      + "what leaves is vapour, the vent must pass 1/x times as much mass "
      + "to remove the same power -- ten times as much at x = 0.1.  Two of "
      + "those hypotheses fail in a real vent, and both matter: the liquid "
      + "that leaves carries ENTHALPY out of the vessel with it, and as its "
      + "pressure falls through the vent it FLASHES, so x is not a fixed "
      + "number but changes along the flow.  The line is therefore an "
      + "energy approximation, not DIERS sizing: DIERS methods size a vent "
      + "from the rates of temperature and pressure rise measured in "
      + "adiabatic calorimetry, from whether the mass froths, and from a "
      + "two-phase flow model at the vent.  A two-phase mixture is denser than vapour and passes "
      + "more mass through each square millimetre, so the AREA does not "
      + "grow by the whole factor 1/x -- it grows unless the denser flow "
      + "makes up all of it.  How much more mass per unit area a flashing "
      + "two-phase flow passes is the question "
      + "Leung's omega method answers (AIChE J. 32 (1986) 1743), and the "
      + "method API 520 Part I builds its two-phase sizing on.  Its "
      + "equations are NOT on this page: neither Leung's papers nor the "
      + "standard's annex could be read for it, and a correlation copied "
      + "from memory is the false source this project refuses to publish.",
    formula: String.raw`W = \frac{Q_\mathrm{r}}{x\, \lambda}`,
    where: [
      { sym: "Q_\\mathrm{r}", means: "the POWER the runaway releases at the "
        + "relieving temperature while the vent holds the pressure -- a "
        + "rate, set by the kinetics there", unit: "W" },
      { sym: "x", means: "the mass fraction of vapour in what the vent "
        + "passes, taken constant", unit: "–" },
    ],
    note: "The formula is an energy approximation, not a sizing method: "
      + "under its hypotheses it says how much MASS must leave, and nothing "
      + "about the AREA that mass needs.  The bench below puts the fire "
      + "bench's heat input through it only to show the factor 1/x; a fire "
      + "on a drum of solvent is not a runaway.",
  },
  {
    n: 14,
    title: "Back to the cooling failure",
    body: "The Process-safety page computed the MTSR of a batch whose "
      + "cooling fails, and stopped at the boiling point: the engine's "
      + "batch reactor has no vapour phase, and in Stoessel's classes 3 and "
      + "4 the boiling can be the barrier, provided the condenser or vent "
      + "it relies on is designed for that duty.  This page is what that "
      + "proviso costs.  The barrier is a vent, sized for the reaction's "
      + "POWER at the relieving temperature, very likely two-phase, "
      + "discharging into a disposal system that must take the liquid too.  "
      + "Two different quantities meet here and must not be confused.  The "
      + "accumulation fixes an ENERGY, in joules: what the unreacted "
      + "reactant would release if all of it reacted.  That energy is what "
      + "the MTSR is computed from.  A vent is sized on a POWER, in watts: "
      + "the RATE at which that energy is released once the mass is at the "
      + "relieving temperature, and that rate is set by the kinetics there "
      + "-- the rate constant at that temperature and the concentrations "
      + "left.  The same energy released slowly needs a small vent and "
      + "released fast a large one, so the peak power cannot be read off the "
      + "accumulation.  The integral below holds only if the main reaction "
      + "runs to completion and nothing else reacts (no secondary "
      + "decomposition, no further dosing).  Dosing the reactant so that "
      + "little of it is ever there to run away -- the inherently safer "
      + "answer of that page -- still helps the vent: less energy may never "
      + "bring the mass to the relieving pressure at all, and with less "
      + "reactant present a reaction of positive order is slower at any "
      + "given temperature.  How much smaller the vent becomes is a kinetic "
      + "question, which a rate measured by adiabatic calorimetry answers "
      + "and the accumulation alone does not.",
    formula: String.raw`E_\mathrm{ac} = X_\mathrm{ac}\, n_\mathrm{A}\, (-\Delta H_\mathrm{r}) = \int Q_\mathrm{r}\, \mathrm{d}t`,
    where: [
      { sym: "E_\\mathrm{ac}", means: "the energy the accumulation holds: "
        + "what the unreacted reactant would release reacting completely",
        unit: "J" },
      { sym: "X_\\mathrm{ac}", means: "the accumulation: the fraction of all "
        + "the limiting reactant the batch will receive that is in the "
        + "vessel, unreacted, when the cooling fails (the Process-safety "
        + "page's lesson 1)", unit: "–" },
      { sym: "n_\\mathrm{A}", means: "the moles of the limiting reactant the "
        + "whole batch receives", unit: "mol" },
      { sym: "\\Delta H_\\mathrm{r}", means: "the heat of reaction per mole "
        + "of the limiting reactant (negative: exothermic)", unit: "J/mol" },
    ],
    note: "The integral runs over the runaway, from the failure to the end "
      + "of the reaction; the vent must handle the largest value Q_r takes "
      + "while it is open, which the integral does not fix.",
  },
];

export const OVERPRESSURE_LIMITS: readonly LessonLimit[] = [
  { id: "not-a-design",
    title: "Nothing here is a design",
    body: "Every MAWP, wetted area and flow on this page is chosen for the "
      + "lesson: each MAWP is an ASSUMPTION, never a certified value, and "
      + "the loop's relieving rate rests on the nominal-flow hypothesis of "
      + "step 2.  A relief system is sized to the controlling standards, "
      + "with the manufacturer's certified coefficients, and independently "
      + "reviewed -- see the Design Guide's disclaimer and its relief "
      + "chapter." },
  { id: "standards-unread",
    title: "The standards were not read",
    body: "API STD 520, API STD 521 and ASME VIII are copyrighted and were "
      + "not available for this page.  Every equation and percentage here "
      + "came through the open secondary sources listed below, and the three "
      + "sizing constants are also derived from first principles.  Read the "
      + "standard before using any of it." },
  { id: "no-engine-model",
    title: "Choupo sizes a relief valve; it does not model relief",
    body: "The engine computes the fluid properties (Z, k, the relieving "
      + "temperature, the latent heat).  This page's arithmetic is its own, "
      + "and the engine's reliefValve sizer (a sizing-pass item, worked in "
      + "the green-ammonia basic design) carries the same equations, held to "
      + "the same published examples by a gate.  No flowsheet case relieves, "
      + "and no balance ever sees a relief stream." },
  { id: "ideal-k",
    title: "k is the ideal-gas ratio",
    body: "The gas equation is derived for an ideal gas with Z as a "
      + "correction, and the engine's gamma is Cp_ig/(Cp_ig - R).  Near the "
      + "critical point the real isentropic exponent departs from it and the "
      + "simple equation is no longer adequate; the page does not detect "
      + "that." },
  { id: "two-phase",
    title: "No two-phase sizing",
    body: "The omega method, the homogeneous direct integration and the "
      + "DIERS methods are named, not computed.  The page shows how much more "
      + "MASS a two-phase vent passes under an energy approximation, never "
      + "the area it needs; a scenario that needs one is marked and left "
      + "out of the comparison that picks the governing area." },
  { id: "liquid-flash",
    title: "The liquid equation is not checked against flashing",
    body: "Neither this page nor the engine's reliefValve sizer tests "
      + "whether a relieved liquid reaches its vapour pressure in the valve "
      + "(step 10).  The page declares the hypothesis on its one liquid "
      + "bench; the sizer applies the single-phase equation to saturated "
      + "drum liquids that would flash, and its areas for them carry that "
      + "hypothesis." },
  { id: "fire-scope",
    title: "The fire case is the wetted-vessel case only",
    body: "A vessel full of gas in a fire, whose wall overheats because "
      + "nothing boils inside it, is a different calculation (and a "
      + "different danger: the wall fails before the valve helps), and is not "
      + "here.  Nor is a liquid that cracks or decomposes before it boils." },
  { id: "records",
    title: "The records carry no review",
    body: "Acetone, N2, H2, NH3 and Ar carry no reviewStatus, and the engine "
      + "says so on every run of the two witnesses; the loop gas runs SRK "
      + "with every kij = 0, also announced." },
];
