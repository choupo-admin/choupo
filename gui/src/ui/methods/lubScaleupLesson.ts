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
  The LUB scale-up lesson, as DATA -- the design method that turns a measured
  breakthrough curve from a laboratory column into a full-scale bed.

  It is a DIFFERENT lesson from breakthroughLesson.ts and deliberately does
  not repeat it.  That page teaches what the S-curve IS (a mass-transfer zone
  going past the exit) and defines LUB in one step; this one starts from a
  curve a student already has and asks the plant question: how long a bed,
  at what diameter, for the service time the process needs.  The two share
  their symbols on purpose -- a reader who has done that page meets nothing
  renamed here.

  Everything asserted was checked against the code and the witness before it
  was written, never against memory:

    what the engine solves            src/unitOperations/batch/FixedBedAdsorber.H:41
    the declared lab column           system/flowsheetDict operation {L, area,
                                      eps, u, T, P} -- FixedBedAdsorber.cpp:146-151
    rho_b from the adsorbent record   Adsorbent.cpp:42 (`rho_bulk`),
                                      FixedBedAdsorber.cpp:199
    the pre-run t_st claim            FixedBedAdsorber.cpp:703-704, printed at
                                      816-822
    the engine's own trapezoid        FixedBedAdsorber.cpp:1384
    the engine's own 5 % crossing     FixedBedAdsorber.cpp:1385-1394
    the KPIs the tool reads           FixedBedAdsorber.cpp:2411-2421, 2437
    the witness's numbers             tutorials/batch/adsorber/
                                        batch13_breakthrough_co2/{system,expected}
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonLimit, LessonStep, SymbolGloss };

export const LUB_SCALEUP_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "What a laboratory run gives you, and what the plant asks for",
    body: "A breakthrough experiment is cheap: pack a short column, feed it "
      + "at a fixed superficial velocity, and log the outlet concentration "
      + "against time until the column is spent.  What you hold afterwards "
      + "is one curve, c_out/c_in against t, measured at a known column "
      + "length, velocity, feed concentration, packing density, void "
      + "fraction and temperature.  The plant question is different in kind: "
      + "not what this column did, but how long a bed and what diameter will "
      + "hold a required feed flow for a required SERVICE TIME before the "
      + "outlet goes off specification.  The whole method rests on one "
      + "premise, and it is stated here rather than discovered later: on a "
      + "FAVOURABLE isotherm the mass-transfer zone, once formed, travels "
      + "down the bed WITHOUT CHANGING SHAPE.  Its length is then a property "
      + "of the adsorbent, the feed, the velocity, the temperature and the "
      + "particle size -- and NOT of the bed length.  That is what lets a "
      + "half-metre column say anything about a three-metre bed.",
    formula: "given   c_out/c_in against t,  at  L_lab, u, c_in, ρ_b, ε, T\n"
      + "wanted  L_full and D  for a service time t_req  at the SAME u",
    where: [
      { sym: "c_out", means: "concentration leaving the column -- the "
        + "logged signal", unit: "mol/m³" },
      { sym: "c_in", means: "the feed concentration, which the outlet "
        + "climbs toward", unit: "mol/m³" },
      { sym: "t", means: "time since the feed was switched onto the clean "
        + "column", unit: "s" },
      { sym: "L_lab", means: "the LABORATORY column's packed length -- the "
        + "one number the method is going to change", unit: "m" },
      { sym: "u", means: "the SUPERFICIAL velocity, volumetric flow over "
        + "the empty tube's cross-section.  Held constant across the "
        + "scale-up, for a reason step 5 states", unit: "m/s" },
      { sym: "ρ_b", means: "the BULK density of the packing, kilograms of "
        + "adsorbent per cubic metre of bed, voids included", unit: "kg/m³" },
      { sym: "ε", means: "the interparticle VOID FRACTION of the bed" },
      { sym: "T", means: "the bed temperature -- isothermal in the "
        + "laboratory, and assumed the same at full scale", unit: "K" },
      { sym: "L_full", means: "the full-scale bed length the method "
        + "delivers", unit: "m" },
      { sym: "D", means: "the full-scale bed diameter, set by the design "
        + "feed flow at the same u", unit: "m" },
      { sym: "t_req", means: "the REQUIRED service time: how long the plant "
        + "needs the outlet on specification before the bed is switched",
        unit: "s" },
    ],
    note: "When the premise fails, so does everything below.  On an "
      + "UNFAVOURABLE or LINEAR isotherm the zone never settles: it spreads "
      + "as it travels, proportionally to √t for a dispersive front and to t "
      + "for a linear one, so a length measured in a short column "
      + "underestimates it in a long one.  A laboratory column SHORTER than "
      + "the zone never lets it form, so the curve you measured is not the "
      + "constant pattern at all.  And a plant bed run at a different "
      + "velocity, temperature or particle size has a different zone: the "
      + "number carried across is only valid at the conditions it was "
      + "measured under.  The classroom witness is a Langmuir (favourable) "
      + "isotherm on a 0.5 m bed with a zone about 0.05 m long, so the "
      + "premise holds there; a real data set has to be checked, and step 3 "
      + "is the check.",
  },
  {
    n: 2,
    title: "Two times read off the curve: breakthrough, and the stoichiometric "
      + "front",
    body: "The curve yields two times.  The BREAKTHROUGH time t_b is where "
      + "the outlet first reaches the fraction of the feed you have declared "
      + "unacceptable -- 5 % by default here, and a knob, because it is a "
      + "specification and not a property of the bed.  The STOICHIOMETRIC "
      + "time t_st is where the front WOULD have arrived if it were "
      + "infinitely sharp, and the curve gives it as an AREA: the solute that "
      + "leaked out before t_st and the capacity still filling after it are "
      + "equal, so the area above the curve, out to where it reaches the "
      + "feed value, is t_st itself.  On data that area is a trapezoid sum "
      + "over the samples.",
    formula: "t_b :  c_out/c_in = f_b        (f_b = 0.05 unless you choose otherwise)\n"
      + "t_st = ∫₀^∞ (1 − c_out/c_in) dt\n"
      + "     ≈ Σ_k ½ (t_{k+1} − t_k) [(1 − f_k) + (1 − f_{k+1})]",
    where: [
      { sym: "t_b", means: "the BREAKTHROUGH time -- the first instant the "
        + "outlet reaches the declared fraction f_b, found by linear "
        + "interpolation between the two samples that bracket it, which is "
        + "the engine's own rule for its 5 % crossing "
        + "(FixedBedAdsorber.cpp:1385-1394)", unit: "s" },
      { sym: "f_b", means: "the breakthrough CRITERION, c_out/c_in at which "
        + "you switch beds -- a specification you declare (the knob), never "
        + "a datum the curve carries" },
      { sym: "t_st", means: "the STOICHIOMETRIC time: the area above the "
        + "curve, and the arrival time of an ideal square front carrying the "
        + "same total", unit: "s" },
      { sym: "Σ_k", means: "a sum over every pair of consecutive samples k, "
        + "k+1 of the logged curve" },
      { sym: "t_k, t_{k+1}", means: "the times of two consecutive samples",
        unit: "s" },
      { sym: "f_k, f_{k+1}", means: "c_out/c_in at those two samples -- the "
        + "trapezoid rule applied to the data, which is exactly the "
        + "quadrature the engine runs on its own outlet "
        + "(FixedBedAdsorber.cpp:1384)" },
    ],
    note: "The tail is handled honestly rather than extrapolated.  The sum "
      + "runs to the LAST sample; whatever the curve would still have "
      + "contributed after it is dropped, and the tool says what the outlet "
      + "had reached there.  If the last sample has not reached "
      + "c_out/c_in = 0.95 the data are INCOMPLETE and every length below is "
      + "a LOWER BOUND, because a t_st that is too small makes the bed look "
      + "worse than it is.  The engine publishes its own t_st for the same "
      + "curve -- the analytic (L/u)·R_f it announced BEFORE integrating "
      + "(t_stoichiometric_<i>, FixedBedAdsorber.cpp:703-704) -- and the "
      + "tool prints it beside the trapezoid: two readings of ONE quantity, "
      + "and the gap between them is the mesh plus the dropped tail, nothing "
      + "else.  On the witness they agree to about seven digits.",
  },
  {
    n: 3,
    title: "The capacity the curve implies, checked against the isotherm",
    body: "Before scaling anything, check that the curve is the curve of a "
      + "bed that reached equilibrium.  A solute balance over the column up "
      + "to t_st says so: everything fed until then either sits on the solid "
      + "at the equilibrium loading or fills the voids at the feed "
      + "concentration.  Solve that for the loading and you have a capacity "
      + "read purely from the curve.  The engine holds an independent "
      + "reading of the same number -- its retention factor KPI folds the "
      + "isotherm's q*(c_in) in, by its own definition, and solving that "
      + "definition for q* gives the isotherm's answer.  The two must agree.",
    formula: "ρ_b q* L_lab = u c_in t_st − ε c_in L_lab\n"
      + "q*_curve    = c_in (u t_st − ε L_lab) / (ρ_b L_lab)\n"
      + "q*_isotherm = (R_f − ε) c_in / ρ_b        R_f = ε + ρ_b q*(c_in)/c_in",
    where: [
      { sym: "q*", means: "the EQUILIBRIUM loading of the solid at the feed "
        + "concentration -- moles held per kilogram of adsorbent when the "
        + "solid has stopped taking anything up", unit: "mol/kg" },
      { sym: "q*_curve", means: "that loading as the CURVE implies it: the "
        + "solute fed to t_st, less what the voids hold, per kilogram of "
        + "packing", unit: "mol/kg" },
      { sym: "q*_isotherm", means: "the same loading as the ISOTHERM gives "
        + "it, recovered from the engine's own retention factor "
        + "(retention_factor_<i>, FixedBedAdsorber.cpp:2411-2412) by "
        + "inverting the definition the engine prints", unit: "mol/kg" },
      { sym: "R_f", means: "the RETENTION FACTOR, how many empty-tube "
        + "transit times the front lags the gas -- defined at "
        + "FixedBedAdsorber.cpp:814 exactly as written here" },
    ],
    note: "A DISAGREEMENT IS THE DIAGNOSTIC, and it points at the data, not "
      + "at the isotherm.  If q*_curve falls short, the curve's tail was cut "
      + "before the outlet reached the feed value, or the run was stopped "
      + "before the bed was in equilibrium with its feed -- either way the "
      + "area is too small and so is every length sized from it.  If it "
      + "overshoots, the feed concentration or the packing density you "
      + "recorded is not the one the column saw.  Neither is something to "
      + "tune away; both are reasons to go back to the column.  The tool "
      + "also prints the bed-average loading the run actually reached at "
      + "its end (qbar_<i>_final, FixedBedAdsorber.cpp:2437), which equals "
      + "q* only on a saturated bed.",
  },
  {
    n: 4,
    title: "The unused bed",
    body: "At the moment you switch, the zone is still inside the column.  "
      + "Everything upstream of it is at equilibrium, everything downstream "
      + "is clean, and the zone itself is half-loaded.  The fraction of the "
      + "column's capacity you used is the ratio of the two times; the rest "
      + "is a LENGTH of bed that did no work, and under the constant-pattern "
      + "premise that length is the same in every bed run at these "
      + "conditions, however long the bed.  That is the quantity carried to "
      + "full scale.",
    formula: "f_used = t_b / t_st\n"
      + "LUB    = L_lab (1 − t_b / t_st)\n"
      + "L_MTZ  ≈ 2 · LUB        (a SYMMETRIC front only)",
    where: [
      { sym: "f_used", means: "the fraction of the laboratory bed's "
        + "capacity used at breakthrough" },
      { sym: "LUB", means: "the LENGTH OF UNUSED BED -- the part of the "
        + "column still clean when it was switched, which the constant "
        + "pattern makes a property of the conditions rather than of the "
        + "column", unit: "m" },
      { sym: "L_MTZ", means: "the length of the MASS-TRANSFER ZONE, "
        + "estimated as twice the unused length.  That equality holds only "
        + "for a front symmetric about t_st; the sizing below uses LUB "
        + "directly, which needs no symmetry", unit: "m" },
    ],
    note: "The plot marks both areas: above the curve up to t_b is the "
      + "capacity you used, between t_b and t_st is the capacity you paid "
      + "for and switched away.  The two vertical lines are the two times "
      + "of step 2.  On the witness's own numbers, t_b(5 %) = 2891 s against "
      + "t_st = 3041 s, so about 5 % of the half-metre column -- some "
      + "2.5 cm -- is unused.  Move the criterion knob and watch LUB move "
      + "with it: a stricter specification switches earlier and wastes more "
      + "bed, which is the trade the specification buys.",
  },
  {
    n: 5,
    title: "Scale-up at the same velocity: length from the service time, "
      + "diameter from the flow",
    body: "The rule is to keep u.  LUB is a property of the velocity -- "
      + "faster gas means a solid that cannot keep up and a wider zone -- so "
      + "the only length you may carry across unchanged is one measured at "
      + "the velocity the plant will run.  The bed then divides in two: an "
      + "EQUILIBRIUM section long enough that its stoichiometric front takes "
      + "exactly the required service time to arrive, and the unused length "
      + "added on top so that the zone is still inside the bed when that "
      + "time comes.  Because the stoichiometric time is proportional to "
      + "length at fixed u, the equilibrium section is the laboratory column "
      + "scaled by the ratio of the two times.  The diameter is set by "
      + "nothing but the design flow and the velocity you are keeping.",
    formula: "L_es   = u c_in t_req / (ρ_b q* + ε c_in)  =  L_lab · t_req / t_st\n"
      + "L_full = L_es + LUB\n"
      + "η_bed  = L_es / L_full\n"
      + "D      = √(4 Q / (π u))\n"
      + "m_ads  = ρ_b (π D² / 4) L_full",
    where: [
      { sym: "L_es", means: "the EQUILIBRIUM-SECTION length -- the bed that "
        + "would suffice if the front were a square wave arriving at t_req",
        unit: "m" },
      { sym: "η_bed", means: "the bed UTILISATION at full scale: the share "
        + "of the bed that is doing equilibrium work at switch" },
      { sym: "Q", means: "the DESIGN feed volumetric flow the plant bed "
        + "must take -- the second design requirement, beside t_req",
        unit: "m³/s" },
      { sym: "π", means: "the circle constant, because the bed is a "
        + "cylinder" },
      { sym: "m_ads", means: "the mass of adsorbent the full-scale bed "
        + "holds, ρ_b times its volume", unit: "kg" },
    ],
    note: "THE LESSON'S POINT IS IN η_bed.  LUB is fixed by the conditions, "
      + "so a longer bed wastes a SMALLER fraction: a half-metre laboratory "
      + "column that throws away 5 % of itself looks poor, and a three-metre "
      + "plant bed with the same 2.5 cm unused wastes under 1 %.  That is "
      + "why laboratory columns look terrible and plant beds do not, and why "
      + "the plant bed's service time is not the laboratory column's scaled "
      + "by length -- it is a little longer than that, because the unused "
      + "length is added once rather than scaled.  Which knob re-runs the "
      + "engine and which does not: the velocity, length, temperature, "
      + "pressure and horizon knobs write the witness's dict and RE-RUN the "
      + "bed in your browser; the criterion, the service time and the "
      + "design flow are POST-PROCESSING and re-draw only, because none of "
      + "them changes the curve the column produced.",
  },
  {
    n: 6,
    title: "Beds work in pairs, and the service time bounds the cycle",
    body: "A single bed is a batch device, so a continuous plant runs two: "
      + "one loads while the other is regenerated, and they swap at or "
      + "before t_req.  The service time you just sized for is therefore an "
      + "upper bound on the cycle time, and the regeneration -- a hot purge, "
      + "a pressure swing, a displacement -- has to finish inside it, or a "
      + "third bed is needed.  Regeneration is its own subject, with its own "
      + "cases in the corpus: batch21_tsa_hot_purge runs one "
      + "temperature-swing half-cycle, batch23_tsa_cycles runs three cycles "
      + "in one campaign, and batch24_blowdown_inert is the pressure-swing "
      + "blowdown witness.  This page sizes the LOADING step of a clean bed "
      + "and teaches none of that.",
  },
];

export const LUB_SCALEUP_LIMITS: readonly LessonLimit[] = [
  {
    id: "constant-pattern",
    title: "Constant pattern is ASSUMED, not checked by the tool.",
    body: "Every length here rests on the zone travelling unchanged, which a "
      + "favourable isotherm and a column longer than the zone buy.  The tool "
      + "cannot tell from one curve whether the zone had settled; the "
      + "equilibrium check of step 3 catches a cut tail, not a spreading "
      + "front.  A linear or unfavourable isotherm, or a column shorter than "
      + "its zone, gives a curve this method sizes from wrongly with no "
      + "warning.",
  },
  {
    id: "isothermal-lab-data",
    title: "Isothermal laboratory data, carried to an isothermal plant bed.",
    body: "The witness holds T at 298 K by declaration and the arithmetic "
      + "assumes the plant bed does too.  Adsorption is exothermic; a large "
      + "bed with a concentrated feed heats where it loads, the affinity "
      + "falls, the zone broadens and arrives early.  A thermal run "
      + "(batch20, batch22) changes the curve the tool reads, but the "
      + "scale-up still treats LUB as a constant of the conditions.",
  },
  {
    id: "same-conditions",
    title: "Same velocity, temperature and particle size -- or the LUB is "
      + "someone else's.",
    body: "The unused length is transferred, never scaled.  Change u and the "
      + "zone width changes with the rate of uptake; change the particle "
      + "size and both the LDF coefficient and the dispersion change; change "
      + "T and the isotherm changes.  A plant bed at other conditions needs "
      + "a curve measured at those conditions.",
  },
  {
    id: "single-adsorbate",
    title: "One adsorbate.",
    body: "The witness feeds one adsorbing species in an inert carrier and "
      + "the arithmetic sizes for one front.  A multi-component feed carries "
      + "one zone per species, the weakly held one displaced ahead of the "
      + "strongly held one, and the bed is sized on whichever breaks through "
      + "first at its own criterion -- a decision this page does not make.",
  },
  {
    id: "tail-cut",
    title: "The tail is cut at the last sample.",
    body: "The trapezoid stops where the data stop.  On the witness the "
      + "outlet reaches 0.99999999 of the feed and the dropped tail is "
      + "negligible; on a run or a measurement stopped early the reported "
      + "t_st is a lower bound and the tool says so.  Extend the horizon "
      + "knob (or the experiment) until the outlet is at the feed value "
      + "before believing a length.",
  },
  {
    id: "model-not-measurement",
    title: "The engine's curve is a MODEL, and the measured column is empty "
      + "until a case brings one.",
    body: "Everything on the plot by default is the engine's integration of "
      + "the witness -- the same 1-D, LDF, first-order-upwind model the "
      + "breakthrough tool draws, mesh spreading included.  A MEASUREMENT "
      + "enters through the open case: ship `constant/experimental/"
      + "breakthrough.csv` (a `t_s,c_over_c0` header, `#` comments allowed, "
      + "one row per sample, the same shape as the digitised figures under "
      + "membrane12's constant/experimental/) and the tool draws it as "
      + "markers beside the engine's curve and runs the SAME arithmetic on "
      + "it, labelled measured.  No tutorial ships one today, and the tool "
      + "says so rather than inventing a curve.",
  },
];
