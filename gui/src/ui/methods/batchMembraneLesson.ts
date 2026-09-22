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
  The BATCH MEMBRANE lesson, as DATA -- concentrating and washing a vessel
  behind an ultrafiltration or nanofiltration membrane.

  It is a DIFFERENT lesson from the spiral-wound module's steady page.  A
  module at steady state has an operating point; a batch rig has a HISTORY,
  and every classical result a student is taught about one -- the exponential
  washout, the power law of a concentration, the loss over a concentrate-then-
  wash schedule -- is an integral taken with the rejection held constant.  This
  page runs the engine, which holds nothing constant, and puts the two side by
  side.

  EVERY CLAIM ABOUT THE ENGINE BELOW WAS READ IN THE SOURCE BEFORE IT WAS
  WRITTEN, never from memory:

    the unit, its model and its scope     src/unitOperations/batch/
                                            BatchDiafilter.H:31-134
    the two modes, and the ONE line
      that differs (Q_d)                  BatchDiafilter.cpp:389
    the mode words, and the refusal of
      any third                           BatchDiafilter.cpp:202-210
    the solute balance                    BatchDiafilter.cpp:429-437
    the solvent line, closed on the
      solution density                    BatchDiafilter.cpp:439-446
    the permeated volume is a STATE,
      not a re-quadrature                 BatchDiafilter.cpp:451,
                                          BatchDiafilter.H:255-263
    diavolumes = V_perm/V_0, counted
      in constant-volume mode ONLY        BatchDiafilter.H:262-263
    concentrationFactor = V_0/V           BatchDiafilter.cpp:580
    R_0 taken from THIS run at t = 0      BatchDiafilter.cpp:281-283
    R_obs published at every instant      BatchDiafilter.cpp:566-569
    washoutActual_/washoutIdeal_,
      published in constant volume ONLY   BatchDiafilter.cpp:597-607
    k_film REQUIRED, refused by name      BatchDiafilter.cpp:129-137
    rho ANNOUNCED when it defaults        BatchDiafilter.cpp:140-158
    Hermia's laws; `standard`/`complete`
      refused rather than approximated    BatchDiafilter.cpp:161-182,
                                          BatchDiafilter.H:105-118
    the `reason` is REQUIRED              BatchDiafilter.cpp:191-199
    the permeance in series                BatchDiafilter.cpp:340-357
    the flux residual J_w = A_w(dP - dpi) SolutionDiffusion.cpp:126
    dpi summed over the WALL and the
      permeate, per solute                SolutionDiffusion.cpp:99-112
    the solute flux B_s (c_m - c_p)       SolutionDiffusion.cpp:153
    the wall has ONE home                 membrane/massTransfer/
                                            Polarisation.H:41-46
    the pump work is NOT ledgered         BatchDiafilter.cpp:616-632

  SOURCES cited to the reader, each already carried in the tree at the line
  given:
    Hermia, J., Trans. IChemE 60 (1982) 183-187
                                          BatchDiafilter.H:109
    Schock, G. & Miquel, A., Desalination 64 (1987) 339
                                          massTransfer/SchockMiquel.H:37
    Geraldes, V. & Afonso, M.D., J. Membr. Sci. 300 (2007) 20-27
                                          massTransfer/Polarisation.H:43
    Ng, P., Lundblad, J. & Mitra, G., "Optimization of Solute Separation by
      Diafiltration", Separation Science 11(5) (1976) 499-502,
      doi:10.1080/01496397608085339 -- the ONLY citation on this page that is
      NOT already in the tree.  It reaches a READER in exactly one place,
      step 7's note; the other two occurrences are source comments (this
      header and batchMembraneMath.ts's scanWashOptimum docstring), and a
      test pins the reader-facing count at one.  Note the JOURNAL NAME: in
      1976 it was `Separation Science`; it became `Separation Science and
      Technology` from volume 12 (1977), so anything citing volume 11 under
      the later name has back-filled it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonLimit, LessonStep, SymbolGloss };

export const BATCH_MEMBRANE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A batch membrane run is a history, not an operating point",
    body: "A spiral-wound module at steady state has ONE answer: a feed goes "
      + "in, a permeate and a retentate come out, and the numbers do not "
      + "move.  A laboratory or pilot rig is not like that.  You charge a "
      + "vessel, put a pressure across the membrane and let it run, and every "
      + "quantity you care about is a function of time from the first second "
      + "-- the volume left in the vessel, the concentration of everything in "
      + "it, the water flux through the membrane, and the rejection the "
      + "membrane appears to have.  That is how ultrafiltration and "
      + "nanofiltration are actually run at bench and pilot scale, and it is "
      + "how they are taught, so the thing to read is a TRAJECTORY.  What "
      + "makes the page worth scrolling is that the classical results you "
      + "were taught for this rig are all integrals of that trajectory taken "
      + "with one of its quantities held still.",
    formula: "V(t)    c_i(t)    J_w(t)    R_i(t)\n"
      + "one run  ->  one trajectory, never one design point",
    where: [
      { sym: "V", means: "the volume of liquid still in the vessel -- the "
        + "RETENTATE, what is left behind the membrane", unit: "m³" },
      { sym: "t", means: "time since the pressure was applied to a charged "
        + "vessel", unit: "s" },
      { sym: "c_i", means: "the bulk concentration of solute i in the "
        + "vessel", unit: "kmol/m³" },
      { sym: "i", means: "an index over the solutes the case declares -- "
        + "this page makes no assumption about how many there are" },
      { sym: "J_w", means: "the WATER FLUX through the membrane, volume of "
        + "permeate per unit area per unit time.  The engine computes it in "
        + "m/s and publishes it as L/(m²·h), the unit a membrane rig is read "
        + "in (BatchDiafilter.cpp:553)", unit: "L/(m²·h)" },
      { sym: "R_i", means: "the OBSERVED rejection of solute i: how much of "
        + "what reaches the membrane it keeps back, measured against the "
        + "bulk.  Step 5 is about why it moves" },
    ],
    note: "The engine's vessel is WELL MIXED, so there is one bulk "
      + "composition and the local flux law is evaluated at it "
      + "(BatchDiafilter.H:45-46).  That is a real assumption and it is the "
      + "right one for a stirred cell or a fast recirculation loop; it is the "
      + "wrong one for a rig whose retentate loop is slow enough to develop "
      + "an axial profile, and nothing in this page would tell you which you "
      + "have.",
  },
  {
    n: 2,
    title: "Two modes, and the one line that differs",
    body: "There are exactly two pure batch operations, and the engine "
      + "implements both with the same balances.  In CONCENTRATION mode you "
      + "add nothing: permeate leaves, the vessel shrinks, and everything the "
      + "membrane keeps gets more concentrated.  In CONSTANT-VOLUME "
      + "diafiltration you add clean solvent exactly as fast as permeate "
      + "leaves: the volume is held, and everything the membrane does NOT "
      + "keep is washed out.  The two are not different models.  They are the "
      + "same solute balance under two different volume balances, and in the "
      + "code the difference is a single line -- the diafiltrate rate is "
      + "either zero or the permeate rate (BatchDiafilter.cpp:389).  A word "
      + "the engine does not know is refused by name rather than defaulted "
      + "(BatchDiafilter.cpp:202-210).",
    formula: "solutes   dn_i/dt = -J_s,i A  +  Q_d c_d,i\n"
      + "solvent   the permeate's mass, closed on the SAME solution density ρ\n"
      + "          the concentrations were built from (BatchDiafilter.cpp:439-446)\n"
      + "\n"
      + "concentration     Q_d = 0       the vessel shrinks\n"
      + "constantVolume    Q_d = Q_p     the volume is held",
    where: [
      { sym: "dn_i/dt", means: "the rate of change of the moles of solute i "
        + "held in the vessel", unit: "kmol/s" },
      { sym: "J_s,i", means: "the flux of solute i through the membrane, "
        + "which solution-diffusion writes as B_s,i (c_m,i − c_p,i) "
        + "(SolutionDiffusion.cpp:153)", unit: "kmol/(m²·s)" },
      { sym: "A", means: "the membrane area the case declares "
        + "(BatchDiafilter.cpp:118)", unit: "m²" },
      { sym: "Q_d", means: "the DIAFILTRATE rate: clean solvent added to the "
        + "vessel.  This is the whole difference between the two modes",
        unit: "m³/s" },
      { sym: "Q_p", means: "the PERMEATE rate, A J_w -- what leaves through "
        + "the membrane", unit: "m³/s" },
      { sym: "c_d,i", means: "the concentration of solute i in the "
        + "diafiltrate.  A clean wash carries none, which is the only case "
        + "this unit supports", unit: "kmol/m³" },
      { sym: "ρ", means: "the solution mass density every concentration in "
        + "the vessel is closed on.  The case declares it; when it does not, "
        + "the engine takes 1000 kg/m³ and ANNOUNCES that it did "
        + "(BatchDiafilter.cpp:140-158)", unit: "kg/m³" },
      { sym: "B_s,i", means: "the membrane's solute permeability for i, read "
        + "from the membrane record", unit: "m/s" },
      { sym: "c_m,i", means: "the concentration of i at the membrane WALL -- "
        + "step 5", unit: "kmol/m³" },
      { sym: "c_p,i", means: "the concentration of i in the permeate",
        unit: "kmol/m³" },
    ],
    note: "WHY THE SOLVENT LINE IS WRITTEN IN WORDS ABOVE AND NOT AS AN "
      + "EQUATION: because the equation is a closure, not a flux.  The "
      + "permeate's water is taken as the permeate's MASS less the solute "
      + "mass it carries, both on the one solution density, rather than as a "
      + "pure-water concentration times a flow -- the second reads like the "
      + "obvious thing to write and leaks about one per cent of the vessel's "
      + "mass across a run (BatchDiafilter.H:56-64).  A third mode a reader "
      + "will look for is NOT here, and the limits at the foot of this page "
      + "say so rather than leaving it to be discovered: Choupo has no "
      + "feed-and-bleed membrane loop today.",
  },
  {
    n: 3,
    title: "Each mode has its own clock, and neither of them is time",
    body: "Ask how far a batch run has gone and the answer is never seconds.  "
      + "A concentration is measured by how much smaller the vessel is than "
      + "it started -- the VOLUME CONCENTRATION FACTOR -- and a wash is "
      + "measured by how many vessel volumes of clean solvent have been "
      + "pushed through it, the DIAVOLUMES.  Both are dimensionless, both "
      + "start at their own natural origin, and both make runs at different "
      + "areas and pressures comparable, which seconds do not.  The engine "
      + "publishes each of them, and publishes the diavolume count ONLY in "
      + "constant-volume mode, because outside it the number would be "
      + "counting a wash that is not happening (BatchDiafilter.H:262-263).",
    formula: "VCF = V_0 / V                    the concentration clock\n"
      + "N   = ∫ Q_d dt / V_0             the wash clock",
    where: [
      { sym: "VCF", means: "the VOLUME CONCENTRATION FACTOR, how many times "
        + "smaller the vessel is than its charge.  VCF = 1 at the start; the "
        + "engine publishes it as `concentrationFactor` "
        + "(BatchDiafilter.cpp:580)" },
      { sym: "V_0", means: "the volume of the initial charge, published as "
        + "`V_initial_m3`", unit: "m³" },
      { sym: "V", means: "the volume in the vessel now", unit: "m³" },
      { sym: "N", means: "the DIAVOLUMES: vessel volumes of clean solvent "
        + "pushed through.  N = 0 at the start, and the engine derives it "
        + "from the permeated volume it integrated as a STATE, so the count "
        + "and the trajectory cannot disagree (BatchDiafilter.H:255-263)" },
      { sym: "Q_d", means: "the diafiltrate rate of step 2, equal to the "
        + "permeate rate in constant-volume mode", unit: "m³/s" },
      { sym: "dt", means: "the element of time the diafiltrate flow is "
        + "integrated over", unit: "s" },
    ],
    note: "THE PAGE PUTS THE RUN'S OWN CLOCK ON THE AXIS, so flipping the "
      + "mode knob changes what the horizontal axis MEANS, not just the "
      + "curve.  That is the point rather than a convenience: the two modes "
      + "are two different questions, and a student who plots both against "
      + "seconds will read neither.  The tool also re-integrates the "
      + "permeate flow over the written samples by the trapezoid rule and "
      + "prints it beside the volume the adaptive integrator ACCEPTED.  The "
      + "gap between the two is the write mesh and nothing else, and the "
      + "engine's own header says why the state is the authority "
      + "(BatchDiafilter.H:255-263): a ledger built by re-quadrature "
      + "disagrees with the state at first order in the step.",
  },
  {
    n: 4,
    title: "The classical results, and the assumption every one of them spends",
    body: "These are the formulae a student meets before ever opening a "
      + "simulator, and they are worth knowing because they say what MUST "
      + "happen: washing removes a poorly-rejected solute exponentially in "
      + "diavolumes, concentrating enriches a well-rejected one as a power of "
      + "the volume factor, and doing both in sequence costs product by the "
      + "sum of the two exponents.  Every one of them comes out of the same "
      + "two balances of step 2, and every one of them spends the same "
      + "assumption to get there: that the rejection can be taken outside the "
      + "integral.",
    derivation: [
      { step: "Write the solute balance.  By the DEFINITION of the observed "
          + "rejection the permeate carries c_p = (1 − R) c, so the solute "
          + "leaves in proportion to what is in the vessel.",
        eq: "dn/dt = -Q_p c_p = -Q_p (1 − R) c" },
      { step: "Write the volume balance.  This is the only line that knows "
          + "which mode you are running.",
        eq: "dV/dt = Q_d − Q_p" },
      { step: "CONSTANT VOLUME: Q_d = Q_p, so V never moves and c = n/V.  "
          + "Divide through and the natural variable is the wash clock.",
        eq: "dn/n = −(1 − R) Q_p dt / V = −(1 − R) dN\n"
          + "n/n_0 = exp(−(1 − R) N)" },
      { step: "CONCENTRATION: Q_d = 0, so dV/dt = −Q_p and the volume is the "
          + "clock.  Divide the two balances and time cancels entirely -- "
          + "which is why the answer holds whatever the flux does.",
        eq: "dn/n = (1 − R) dV/V\n"
          + "n/n_0 = (V/V_0)^(1 − R) = VCF^−(1 − R)" },
      { step: "The concentration follows from the retained moles and the "
          + "volume they now sit in.",
        eq: "c/c_0 = (n/n_0)(V_0/V) = VCF^R" },
      { step: "A concentration and then a wash are two retained fractions "
          + "multiplied, so their exponents ADD -- concentrating by VCF costs "
          + "exactly what washing ln(VCF) diavolumes costs.",
        eq: "n/n_0 = exp((R − 1)(ln VCF + N))" },
      { step: "EVERY LINE ABOVE PULLED R OUT OF THE INTEGRAL.  That is the "
          + "whole of what the rest of this page is about." },
    ],
    formula: "constant volume    n/n_0 = exp(−(1 − R) N)\n"
      + "concentration      n/n_0 = VCF^−(1 − R)        c/c_0 = VCF^R\n"
      + "both in sequence   loss  = 1 − exp((R − 1)(ln VCF + N))",
    where: [
      { sym: "n", means: "moles of the solute still in the vessel",
        unit: "kmol" },
      { sym: "n_0", means: "moles of it in the initial charge", unit: "kmol" },
      { sym: "c", means: "its bulk concentration in the vessel",
        unit: "kmol/m³" },
      { sym: "c_0", means: "its bulk concentration in the initial charge",
        unit: "kmol/m³" },
      { sym: "c_p", means: "its concentration in the permeate",
        unit: "kmol/m³" },
      { sym: "R", means: "the rejection, HELD CONSTANT -- the assumption "
        + "every line here spends" },
      { sym: "N", means: "the diavolumes of step 3" },
      { sym: "dN", means: "an element of the wash clock, Q_p dt / V" },
      { sym: "VCF", means: "the volume concentration factor of step 3" },
      { sym: "V", means: "the vessel volume", unit: "m³" },
      { sym: "V_0", means: "the volume of the initial charge", unit: "m³" },
      { sym: "dV/dt", means: "the rate of change of that volume",
        unit: "m³/s" },
      { sym: "Q_p", means: "the permeate rate", unit: "m³/s" },
      { sym: "Q_d", means: "the diafiltrate rate", unit: "m³/s" },
      { sym: "loss", means: "the fraction of the solute NOT left in the "
        + "vessel at the end of a concentration followed by a wash" },
    ],
    note: "READ THE TWO EXTREMES AND THE FORMULAE STOP BEING SYMBOLS.  At "
      + "R = 1 the membrane keeps everything: the wash removes nothing "
      + "(n/n_0 = 1) and concentrating multiplies the concentration by the "
      + "volume factor exactly (c/c_0 = VCF).  At R = 0 the solute goes "
      + "through as freely as the solvent: the wash removes it exponentially "
      + "at the fastest rate the geometry allows, and concentrating does not "
      + "concentrate it at all (c/c_0 = 1).  A real solute is somewhere "
      + "between, and it does not stay there.",
  },
  {
    n: 5,
    title: "Why the rejection is not constant, and how to see it",
    body: "The rejection in those formulae is the OBSERVED one -- what a "
      + "sample of permeate and a sample of the bulk tell you -- and it is "
      + "not a property of the membrane.  Follow the chain the engine "
      + "actually solves.  The flux is fixed by the applied pressure LESS the "
      + "osmotic pressure difference across the membrane, which is a Newton "
      + "solve because the flux appears on both sides "
      + "(SolutionDiffusion.cpp:126).  The osmotic term is evaluated at the "
      + "membrane WALL, not in the bulk (SolutionDiffusion.cpp:99-112), and "
      + "the wall is richer than the bulk by a polarisation factor that grows "
      + "with the flux (Polarisation.H:41-46).  The solute flux is driven by "
      + "the wall-to-permeate difference (SolutionDiffusion.cpp:153).  Now "
      + "run the vessel: the composition changes, so the osmotic pressure "
      + "changes, so the flux changes, so the wall changes, so the permeate "
      + "changes -- and the rejection you would MEASURE moves although the "
      + "membrane has not changed at all.",
    formula: "R_obs = 1 − c_p / c_b          measured against the BULK\n"
      + "c_m  >  c_b                    the wall is richer than the bulk\n"
      + "\n"
      + "washoutActual = n/n_0 from the run\n"
      + "washoutIdeal  = exp(−(1 − R_0) N),   R_0 = R_obs at t = 0",
    where: [
      { sym: "R_obs", means: "the OBSERVED rejection the run publishes at "
        + "every instant as `R_obs_<solute>` (BatchDiafilter.cpp:566-569)" },
      { sym: "c_b", means: "the solute's concentration in the well-mixed "
        + "BULK of the vessel, published as `c_b_<solute>`",
        unit: "kmol/m³" },
      { sym: "c_p", means: "its concentration in the permeate, published as "
        + "`c_p_<solute>`", unit: "kmol/m³" },
      { sym: "c_m", means: "its concentration at the membrane WALL, which no "
        + "sample of the vessel can reach and which is what the physics "
        + "answers to", unit: "kmol/m³" },
      { sym: "R_0", means: "the observed rejection at the FIRST instant of "
        + "this run, which the engine takes from the run itself rather than "
        + "from any declaration (BatchDiafilter.cpp:281-283)" },
      { sym: "n", means: "moles of the solute left in the vessel",
        unit: "kmol" },
      { sym: "n_0", means: "moles of it in the charge", unit: "kmol" },
      { sym: "N", means: "diavolumes" },
      { sym: "t", means: "time", unit: "s" },
    ],
    note: "THE COMPARISON CANNOT HAVE BEEN ARRANGED, and that is why it is "
      + "worth looking at.  In constant-volume mode the unit publishes BOTH "
      + "`washoutActual_<solute>` -- what the vessel did -- and "
      + "`washoutIdeal_<solute>`, the constant-R law evaluated at THIS run's "
      + "own initial rejection and its own diavolume count "
      + "(BatchDiafilter.cpp:597-607).  No case declares either number.  Read "
      + "the SIGN of the gap against the rejection trajectory beside it: a "
      + "rejection that ROSE means less solute passed than the law predicted, "
      + "so more was retained than the ideal; a rejection that FELL means the "
      + "opposite.  Both signs occur in the shipped witnesses, which is the "
      + "cleanest evidence that the constant-R assumption is not conservative "
      + "in either direction.  IN CONCENTRATION MODE THE ENGINE PUBLISHES NO "
      + "IDEAL AT ALL, deliberately -- the washout law is not the law of that "
      + "mode and quoting it there would be a category error "
      + "(BatchDiafilter.cpp:597-601) -- so the power law on that branch is "
      + "computed by this page, from the engine's own R_0 and VCF, and is "
      + "labelled as the tool's rather than the engine's.",
  },
  {
    n: 6,
    title: "Fouling: a claim about a mechanism, not a fitted exponent",
    body: "Everything so far makes the flux RISE during a wash: the salt "
      + "leaves, the osmotic pressure falls, the driving force grows.  That "
      + "is what the model has, and it is not what a rig does.  On real "
      + "equipment the flux falls, because material accumulates on or in the "
      + "membrane, and every schedule anyone writes is sized on that decline. "
      + " The engine offers it as a resistance in series on the permeance it "
      + "hands the transport law -- applied where the transport CONTEXT is "
      + "assembled, so solution-diffusion and DSPM-DE are served alike and "
      + "neither law is modified (BatchDiafilter.cpp:340-357).  The "
      + "resistance grows with the volume filtered per unit area, by one of "
      + "Hermia's blocking laws.",
    formula: "1 / A_eff = 1 / A_w + r_f(v),      v = V_permeated / A\n"
      + "\n"
      + "cake           r_f = k v                  a deposited layer\n"
      + "intermediate   1 / A_eff = e^(k v) / A_w  pores being covered",
    where: [
      { sym: "A_eff", means: "the EFFECTIVE water permeance the transport "
        + "law is handed -- what the membrane still has", unit: "m/(s·Pa)" },
      { sym: "A_w", means: "the CLEAN water permeance, the membrane record's "
        + "own datum", unit: "m/(s·Pa)" },
      { sym: "r_f", means: "the fouling resistance, in series with the "
        + "membrane's own", unit: "s·Pa/m" },
      { sym: "v", means: "the volume filtered per unit of membrane area -- "
        + "the natural clock of a fouling layer, not time", unit: "m" },
      { sym: "A", means: "the membrane area", unit: "m²" },
      { sym: "k", means: "the blocking constant.  It belongs to a RIG AND A "
        + "MATERIAL, so the case declares it and no catalogue record is "
        + "touched" },
    ],
    note: "TWO LAWS, NOT FOUR, AND THE BLOCK REQUIRES A REASON.  `standard` "
      + "and `complete` describe changes in pore-INTERNAL geometry that one "
      + "lumped permeance cannot represent honestly, so they are REFUSED BY "
      + "NAME rather than approximated by a neighbour that would fit the data "
      + "and mean something else (BatchDiafilter.cpp:161-182).  And because a "
      + "blocking law asserts a MECHANISM -- cake says a layer was deposited, "
      + "intermediate says pores were covered -- and nothing in the engine "
      + "can tell which describes your feed, the `fouling {}` block will not "
      + "run without a written `reason` (BatchDiafilter.cpp:191-199).  Use "
      + "the tool's witness toggle to put the two shipped cases side by side: "
      + "diafilter01 and diafilter02 are the SAME charge, area, pressure and "
      + "horizon, and the only difference between them is the fouling block, "
      + "so the difference in the answer IS the fouling.  Read diafilter02's "
      + "own header before believing its constant: a fully dissolved brine "
      + "has nothing to deposit, the value is declared hypothetical in the "
      + "case, and what the case demonstrates is the CONSEQUENCE of a decline "
      + "rather than this feed's fouling.",
  },
  {
    n: 7,
    title: "The trade you actually make: purity against product and time",
    body: "Washing longer buys purity and costs two things.  It costs PRODUCT "
      + ", because no rejection is one and the exponent of step 4 never "
      + "stops running; and it costs TIME, because every diavolume is a "
      + "vessel volume of permeate that has to go through the membrane.  The "
      + "time is where the design decision lives.  For a fixed inventory of "
      + "the thing you are keeping, a smaller vessel means a more "
      + "concentrated one, so pre-concentrating before you wash shortens "
      + "every diavolume -- but it also raises the osmotic pressure and the "
      + "polarisation, which cuts the flux.  The two pull against each other, "
      + "so there is a concentration at which the wash is cheapest, and the "
      + "classical statement of it is that it is where the product of flux "
      + "and concentration is largest.",
    formula: "t_DF = N V / (A J_w)             the time N diavolumes take\n"
      + "V ∝ 1 / c  at fixed inventory   =>   t_DF ∝ 1 / (J_w c)\n"
      + "cheapest wash  =>  J_w c at its maximum",
    where: [
      { sym: "t_DF", means: "the time a wash of N diavolumes takes at this "
        + "volume, area and flux", unit: "s" },
      { sym: "N", means: "the diavolumes the wash must deliver, which step 4 "
        + "fixes from the purity you need" },
      { sym: "V", means: "the volume being washed", unit: "m³" },
      { sym: "A", means: "the membrane area", unit: "m²" },
      { sym: "J_w", means: "the water flux at that volume", unit: "m/s" },
      { sym: "c", means: "the concentration of the RETAINED species -- the "
        + "one whose inventory fixes how small the vessel can be",
        unit: "kmol/m³" },
    ],
    note: "THE CLASSICAL OPTIMUM AND WHAT THIS PAGE DOES WITH IT.  The result "
      + "is Ng, Lundblad & Mitra, \"Optimization of Solute Separation by "
      + "Diafiltration\", Separation Science 11(5) (1976) 499-502 "
      + "(doi:10.1080/01496397608085339): wash where the product of flux and "
      + "retained concentration is greatest.  The familiar closed form that "
      + "goes with it -- wash at the gel concentration divided by e -- does "
      + "NOT follow from the criterion alone; it follows from the "
      + "GEL-POLARISED flux law of ultrafiltration, and this engine does not "
      + "carry that law.  Its flux comes from an applied pressure less an "
      + "osmotic pressure through the declared transport model.  So the page "
      + "applies the criterion and NOT the closed form: it reads the product "
      + "off the engine's own concentration-mode trajectory, marks the "
      + "maximum, and says whether the maximum was inside the window the run "
      + "swept or sitting on one of its ends -- because an endpoint is not an "
      + "optimum, it is a run that did not bracket one.  Nothing here borrows "
      + "a constant from a model that is not running.",
  },
];

export const BATCH_MEMBRANE_LIMITS: readonly LessonLimit[] = [
  {
    id: "no-feed-and-bleed",
    title: "There is no feed-and-bleed membrane loop in Choupo today.",
    body: "A reader who knows how pilot and production plants are actually "
      + "run will look for a third mode, and it is not here: Choupo has no "
      + "feed-and-bleed membrane loop today -- that is a STEADY module inside "
      + "a recirculating tank, and the seam between a steady unit and a "
      + "time-integrated vessel is open (CLAUDE.md names it as the "
      + "quasi-steady seam, task #185, NOT done).  The two modes on this page "
      + "are the two the unit implements, and nothing here should be read as "
      + "a model of a continuous loop.  If you need one, you are writing it, "
      + "not selecting it.",
  },
  {
    id: "r-is-the-lesson-not-a-verdict",
    title: "A gap between actual and ideal is a finding, not an error.",
    body: "Where the run and the hand law part, the hand law's assumption is "
      + "what failed, and the rejection trajectory beside them says how.  "
      + "Nothing on this page adjusts either number to close the gap, and "
      + "nothing here judges the engine's answer to be right -- the goldens "
      + "of the two witnesses pin what this MODEL gives, and neither case is "
      + "validated against a measured diafiltration.",
  },
  {
    id: "no-measured-fouling",
    title: "The tree carries no measured fouling data at all.",
    body: "diafilter02's blocking constant is declared HYPOTHETICAL in its "
      + "own header: a fully dissolved brine has nothing to deposit, so cake "
      + "is not a mechanism that feed can claim, and the constant was chosen "
      + "to make the consequence of a decline visible against its clean twin. "
      + " Critical flux, gel layers, cleaning and backwash cycles, and any "
      + "PREDICTION of the blocking constant are all outside the engine.",
  },
  {
    id: "k-film-is-declared",
    title: "The polarisation coefficient is declared, never correlated.",
    body: "The unit is told a transmembrane pressure and an area, not a "
      + "stirrer speed or a channel, so it REFUSES to run without `k_film` "
      + "rather than inventing a correlation for a geometry nobody described "
      + "(BatchDiafilter.cpp:129-137).  A crossflow module CAN correlate it "
      + "-- that is what Schock & Miquel's spacer fit is for (Desalination 64 "
      + "(1987) 339, massTransfer/SchockMiquel.H:37) -- and a stirred vessel "
      + "cannot.  Turn the knob down and watch the polarisation bite.",
  },
  {
    id: "no-energy",
    title: "The campaign's first law is UNAVAILABLE, and says so.",
    body: "The pump work driving the filtration is not ledgered: the unit is "
      + "declared a pressure, not a pump, so there is no flow and no "
      + "efficiency to price it with, and the batch ledger's shaft-work kind "
      + "is reserved and unimplemented.  The material and the vessel enthalpy "
      + "ARE priced, and the campaign energy balance reports UNAVAILABLE "
      + "rather than closing with a term quietly set to zero "
      + "(BatchDiafilter.cpp:616-632).",
  },
  {
    id: "isothermal-single-liquid",
    title: "One well-mixed liquid, at one temperature.",
    body: "There is no temperature transient, no axial profile down a "
      + "retentate loop, and no second liquid phase.  The vessel has one bulk "
      + "composition and the flux law is evaluated at it, which is the right "
      + "model for a stirred cell and the wrong one for a long module run "
      + "slowly.  Nothing in the output would tell you which rig you have.",
  },
];
