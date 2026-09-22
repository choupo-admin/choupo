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
    Millipore Technical Brief, "Protein Concentration and Diafiltration by
      Tangential Flow Filtration", Lit. No. TB032, Rev. C, 06/03, 03-117,
      (c) 2003 Millipore Corporation, Billerica, MA -- the citation is
      transcribed from the document's own back cover, which is the only place
      it states a number or a year.  It is the source of steps 8 and 9: the
      graphical construction for the diafiltration optimum (p. 12, figures 12
      and 13) and the governing group ln VCF + N with its worked example
      (p. 6, figure 6).  It is a COPYRIGHTED technical brief: the equations
      and the method are implemented and cited, no sentence of it is
      reproduced, and every number this page prints from its worked example
      is recomputed from the formula in batchMembraneMath.ts.
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
    formula: String.raw`\begin{aligned}
& V(t) \qquad c_i(t) \qquad J_w(t) \qquad R_i(t)\\
& \text{one run } \longrightarrow \text{ one trajectory, never one design point}
\end{aligned}`,
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
    formula: String.raw`\begin{array}{ll}
\text{solutes} & \dfrac{\mathrm{d}n_i}{\mathrm{d}t} = -J_\mathrm{s,i}\, A + Q_d\, c_\mathrm{d,i}\\[8pt]
\text{solvent} & \text{the permeate's mass, closed on the SAME solution density } \rho\\
& \text{the concentrations were built from (BatchDiafilter.cpp:439-446)}\\[8pt]
\text{concentration} & Q_d = 0 \qquad \text{the vessel shrinks}\\
\text{constantVolume} & Q_d = Q_p \qquad \text{the volume is held}
\end{array}`,
    where: [
      { sym: "\\mathrm{d}n_i/\\mathrm{d}t",
        means: "the rate of change of the moles of solute i "
        + "held in the vessel", unit: "kmol/s" },
      { sym: "J_\\mathrm{s,i}",
        means: "the flux of solute i through the membrane, "
        + "which solution-diffusion writes as B_s,i (c_m,i − c_p,i) "
        + "(SolutionDiffusion.cpp:153)", unit: "kmol/(m²·s)" },
      { sym: "A", means: "the membrane area the case declares "
        + "(BatchDiafilter.cpp:118)", unit: "m²" },
      { sym: "Q_d", means: "the DIAFILTRATE rate: clean solvent added to the "
        + "vessel.  This is the whole difference between the two modes",
        unit: "m³/s" },
      { sym: "Q_p", means: "the PERMEATE rate, A J_w -- what leaves through "
        + "the membrane", unit: "m³/s" },
      { sym: "c_\\mathrm{d,i}", means: "the concentration of solute i in the "
        + "diafiltrate.  A clean wash carries none, which is the only case "
        + "this unit supports", unit: "kmol/m³" },
      { sym: "\\rho", means: "the solution mass density every concentration in "
        + "the vessel is closed on.  The case declares it; when it does not, "
        + "the engine takes 1000 kg/m³ and ANNOUNCES that it did "
        + "(BatchDiafilter.cpp:140-158)", unit: "kg/m³" },
      { sym: "B_\\mathrm{s,i}",
        means: "the membrane's solute permeability for i, read "
        + "from the membrane record", unit: "m/s" },
      { sym: "c_\\mathrm{m,i}",
        means: "the concentration of i at the membrane WALL -- "
        + "step 5", unit: "kmol/m³" },
      { sym: "c_\\mathrm{p,i}", means: "the concentration of i in the permeate",
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
    formula: String.raw`\begin{aligned}
\mathrm{VCF} &= \frac{V_0}{V} &\qquad& \text{the concentration clock}\\[4pt]
N &= \frac{\int Q_d\, \mathrm{d}t}{V_0} &\qquad& \text{the wash clock}
\end{aligned}`,
    where: [
      { sym: "\\mathrm{VCF}",
        means: "the VOLUME CONCENTRATION FACTOR, how many times "
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
      { sym: "\\mathrm{d}t",
        means: "the element of time the diafiltrate flow is "
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
        eq: String.raw`\frac{\mathrm{d}n}{\mathrm{d}t} = -Q_p c_p = -Q_p (1 - R)\, c`},
      { step: "Write the volume balance.  This is the only line that knows "
          + "which mode you are running.",
        eq: String.raw`\frac{\mathrm{d}V}{\mathrm{d}t} = Q_d - Q_p`},
      { step: "CONSTANT VOLUME: Q_d = Q_p, so V never moves and c = n/V.  "
          + "Divide through and the natural variable is the wash clock.",
        eq: String.raw`\begin{aligned}
\frac{\mathrm{d}n}{n} &= -(1 - R)\, \frac{Q_p\, \mathrm{d}t}{V} = -(1 - R)\, \mathrm{d}N\\[4pt]
\frac{n}{n_0} &= \exp(-(1 - R) N)
\end{aligned}`},
      { step: "CONCENTRATION: Q_d = 0, so dV/dt = −Q_p and the volume is the "
          + "clock.  Divide the two balances and time cancels entirely -- "
          + "which is why the answer holds whatever the flux does.",
        eq: String.raw`\begin{aligned}
\frac{\mathrm{d}n}{n} &= (1 - R)\, \frac{\mathrm{d}V}{V}\\[4pt]
\frac{n}{n_0} &= \left( \frac{V}{V_0} \right)^{1 - R} = \mathrm{VCF}^{-(1 - R)}
\end{aligned}`},
      { step: "The concentration follows from the retained moles and the "
          + "volume they now sit in.",
        eq: String.raw`\frac{c}{c_0} = \frac{n}{n_0} \cdot \frac{V_0}{V} = \mathrm{VCF}^{R}`},
      { step: "A concentration and then a wash are two retained fractions "
          + "multiplied, so their exponents ADD -- concentrating by VCF costs "
          + "exactly what washing ln(VCF) diavolumes costs.",
        eq: String.raw`\frac{n}{n_0} = \exp\!\left( (R - 1)(\ln \mathrm{VCF} + N) \right)`},
      { step: "EVERY LINE ABOVE PULLED R OUT OF THE INTEGRAL.  That is the "
          + "whole of what the rest of this page is about." },
    ],
    formula: String.raw`\begin{array}{lll}
\text{constant volume} & n/n_0 = \exp(-(1 - R) N)\\
\text{concentration} & n/n_0 = \mathrm{VCF}^{-(1 - R)} & c/c_0 = \mathrm{VCF}^{R}\\
\text{both in sequence} & \mathrm{loss} = 1 - \exp\!\left( (R - 1)(\ln \mathrm{VCF} + N) \right)
\end{array}`,
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
      { sym: "\\mathrm{d}N",
        means: "an element of the wash clock, Q_p dt / V" },
      { sym: "\\mathrm{VCF}",
        means: "the volume concentration factor of step 3" },
      { sym: "V", means: "the vessel volume", unit: "m³" },
      { sym: "V_0", means: "the volume of the initial charge", unit: "m³" },
      { sym: "\\mathrm{d}V/\\mathrm{d}t",
        means: "the rate of change of that volume",
        unit: "m³/s" },
      { sym: "Q_p", means: "the permeate rate", unit: "m³/s" },
      { sym: "Q_d", means: "the diafiltrate rate", unit: "m³/s" },
      { sym: "\\mathrm{loss}",
        means: "the fraction of the solute NOT left in the "
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
    formula: String.raw`\begin{array}{ll}
R_\mathrm{obs} = 1 - \dfrac{c_p}{c_b} & \text{measured against the BULK}\\[8pt]
c_m > c_b & \text{the wall is richer than the bulk}\\[8pt]
\mathrm{washoutActual} = n/n_0 \text{ from the run}\\
\mathrm{washoutIdeal} = \exp(-(1 - R_0) N), & R_0 = R_\mathrm{obs} \text{ at } t = 0
\end{array}`,
    where: [
      { sym: "\\mathrm{washoutActual}",
        means: "the solute fraction REMAINING at the end of this run, read off the "
        + "integrated inventory" },
      { sym: "\\mathrm{washoutIdeal}",
        means: "what the constant-rejection law predicts for the same wash, "
        + "evaluated from THIS run's own initial rejection.  The gap between "
        + "the two is the lesson" },
      { sym: "R_\\mathrm{obs}",
        means: "the OBSERVED rejection the run publishes at "
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
    formula: String.raw`\begin{array}{ll}
\dfrac{1}{A_\mathrm{eff}} = \dfrac{1}{A_w} + r_f(v), & v = \dfrac{V_\mathrm{permeated}}{A}\\[10pt]
\text{cake} \qquad r_f = k v & \text{a deposited layer}\\[4pt]
\text{intermediate} \qquad \dfrac{1}{A_\mathrm{eff}} = \dfrac{\exp(k v)}{A_w} & \text{pores being covered}
\end{array}`,
    where: [
      { sym: "V_\\mathrm{permeated}",
        means: "the cumulative permeate VOLUME, an integrated state of the run",
        unit: "m^3" },
      { sym: "A_\\mathrm{eff}",
        means: "the EFFECTIVE water permeance the transport "
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
    formula: String.raw`\begin{aligned}
t_\mathrm{DF} &= \frac{N V}{A J_w} &\qquad& \text{the time } N \text{ diavolumes take}\\[4pt]
V &\propto \frac{1}{c} \text{ at fixed inventory} &\Rightarrow\quad& t_\mathrm{DF} \propto \frac{1}{J_w c}\\[4pt]
&\text{cheapest wash} &\Rightarrow\quad& J_w c \text{ at its maximum}
\end{aligned}`,
    where: [
      { sym: "t_\\mathrm{DF}",
        means: "the time a wash of N diavolumes takes at this "
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
  {
    n: 8,
    title: "How an engineer actually ARRIVES at that concentration",
    body: "Step 7 says where the optimum is.  It does not say how anybody "
      + "finds it, and a criterion you cannot execute is a slogan.  The "
      + "method industry uses is graphical and takes an afternoon on a "
      + "bench rig.  Measure the filtrate flux at several product "
      + "concentrations and plot it against the LOGARITHM of concentration, "
      + "where the decay is close to a straight line and is therefore "
      + "readable.  Do it TWICE: once with the product in the buffer it "
      + "starts in and once in the buffer you will wash with, because a "
      + "change of buffer moves the whole flux curve and the wash crosses "
      + "from one to the other.  Then form the product of concentration and "
      + "flux at points along each curve, plot THAT against concentration, "
      + "and read off where it turns over.  Two curves give two maxima, and "
      + "where they differ materially you take the lower of them.",
    derivation: [
      { step: "Measure the flux against product concentration, in the "
          + "STARTING buffer and again in the DIAFILTRATION buffer.  The log "
          + "axis is not decoration: it is what makes the decay straight "
          + "enough to interpolate between measured points.",
        eq: String.raw`J_f = J_f(\log C) \qquad \text{two buffers, two curves}`},
      { step: "At several concentrations spanning the range the process will "
          + "pass through, form the product of concentration and flux.  Step "
          + "7 showed the wash time is inversely proportional to it, so the "
          + "largest value is the cheapest place to wash.",
        eq: String.raw`\mathrm{DFOP}(C) = C\, J_f(C)`},
      { step: "Plot that product against concentration and read where it "
          + "turns over.  Each buffer curve gives its own maximum, and the "
          + "turn is what an optimum IS -- a value at the end of the range "
          + "you measured is a range that was too short.",
        eq: String.raw`C_\mathrm{opt,start} \text{ and } C_\mathrm{opt,DF}: \quad \mathrm{DFOP} \text{ at its maximum on each curve}`},
      { step: "Where the two differ materially, take the LOWER.  The true "
          + "optimum lies between the curves, because the product is "
          + "exchanged from the starting buffer into the wash buffer as the "
          + "diavolumes go through; the lower choice errs toward more buffer "
          + "and more area rather than toward a concentration the product "
          + "may not survive.",
        eq: String.raw`C_\mathrm{opt} = \min\left( C_\mathrm{opt,start},\; C_\mathrm{opt,DF} \right)`},
      { step: "The rule you were probably taught -- wash at the gel "
          + "concentration divided by e -- is an APPROXIMATION of this "
          + "construction, and the industrial source of the construction is "
          + "the one that says so: it holds where the flux decay follows a "
          + "well-defined standard curve, and the construction above holds "
          + "generally.",
        eq: String.raw`C_\mathrm{opt} \approx \frac{c_g}{e} \qquad (e = 2.718\ldots)`},
    ],
    formula: String.raw`\begin{array}{ll}
\mathrm{DFOP} = C\, J_f & \text{maximise this; it is the general rule}\\[6pt]
C_\mathrm{opt} = \min\left( C_\mathrm{opt,start},\, C_\mathrm{opt,DF} \right) & \text{when the two buffers disagree, take the lower}\\[6pt]
C_\mathrm{opt} \approx c_g/e & \text{the classical shortcut, and an approximation of the above}
\end{array}`,
    where: [
      { sym: "\\mathrm{DFOP}",
        means: "the DIAFILTRATION OPTIMISATION PARAMETER: the product of the "
        + "concentration and the flux at a point on a flux curve.  It is the "
        + "same quantity step 7 calls J_w c, named the way the bench method "
        + "names it", unit: "g/(m²·h)" },
      { sym: "C", means: "the product concentration -- the RETAINED species, "
        + "the one whose inventory fixes how small the vessel can be",
        unit: "g/L" },
      { sym: "J_f", means: "the FILTRATE flux at that concentration, measured "
        + "on the rig.  It is step 1's J_w read off an experiment instead of "
        + "computed", unit: "L/(m²·h)" },
      { sym: "C_\\mathrm{opt,start}",
        means: "the concentration at which DFOP is largest on the curve "
        + "measured in the STARTING buffer", unit: "g/L" },
      { sym: "C_\\mathrm{opt,DF}",
        means: "the same, on the curve measured in the DIAFILTRATION buffer",
        unit: "g/L" },
      { sym: "C_\\mathrm{opt}",
        means: "the concentration to pre-concentrate to before washing: the "
        + "LOWER of the two, which is the conservative choice", unit: "g/L" },
      { sym: "c_g", means: "the GEL concentration of the classical "
        + "ultrafiltration flux law -- the concentration at which its flux "
        + "extrapolates to zero.  This engine carries no such law and no "
        + "case declares one", unit: "g/L" },
      { sym: "e", means: "Euler's number, 2.718…, which appears here only "
        + "because it falls out of maximising the gel-polarised flux law -- "
        + "not because anything general puts it there" },
      { sym: "\\min", means: "the smaller of the two values, which is the "
        + "conservative rule being applied" },
    ],
    note: "THREE REASONS YOU MIGHT NOT BE ABLE TO USE THE ANSWER, and they "
      + "are practical rather than thermodynamic.  The optimum may sit BELOW "
      + "the rig's minimum recirculation volume -- a vessel and a loop have "
      + "a smallest working charge and no optimum overrides it.  The product "
      + "may not be STABLE that concentrated.  Either way you work at a lower "
      + "concentration and pay for it in buffer, in membrane area and in "
      + "time.  The trade runs the other way too: if buffer is the scarce "
      + "thing, work HIGHER than the optimum and pay in area or in "
      + "processing time instead.  WHAT THIS PAGE CANNOT DO, said before you "
      + "look at the plot: Choupo sweeps ONE solution.  The construction "
      + "above wants the flux curve in the diafiltration buffer as well, and "
      + "no case in the corpus declares a second buffer's flux behaviour, so "
      + "the figure below draws the curve the engine has and marks its "
      + "maximum.  That is one buffer's answer, not the two-buffer "
      + "construction, and it is not bracketed: the second curve would move "
      + "the optimum, and the rule above says which way you would then go.  "
      + "The method is Millipore Technical Brief TB032 (Rev. C, 06/03, "
      + "03-117), \"Protein Concentration and Diafiltration by Tangential "
      + "Flow Filtration\", p. 12 -- which is also where the claim that the "
      + "c_g/e rule is only an approximation comes from, so step 7's refusal "
      + "to quote that closed form here and industrial practice are saying "
      + "the same thing.",
  },
  {
    n: 9,
    title: "ln VCF + N is ONE number, and it decides the yield",
    body: "Look again at the composite loss of step 4.  The concentration "
      + "factor and the diavolumes do not appear in it separately -- they "
      + "appear only through their sum once the concentration factor has "
      + "been logged.  Call that sum the governing group.  Two consequences "
      + "follow immediately and both are design decisions.  First, VCF and N "
      + "are INTERCHANGEABLE as far as product yield is concerned: "
      + "concentrating twenty-fold costs exactly what washing ln(20) = 3 "
      + "diavolumes costs, and a process may trade one against the other "
      + "freely without changing what it loses.  Second, a yield goal is a "
      + "CEILING ON THE GROUP, so it can be met in three ways and only one "
      + "of them leaves the separation alone.",
    derivation: [
      { step: "Take the composite loss of step 4 exactly as it was derived "
          + "there, from the two retained fractions multiplied.",
        eq: String.raw`\mathrm{loss} = 1 - \exp\!\left( (R - 1)(\ln \mathrm{VCF} + N) \right)`},
      { step: "The two process variables never appear apart.  Name their "
          + "combination and the loss becomes a curve in one variable, which "
          + "is the figure this step draws.",
        eq: String.raw`G = \ln \mathrm{VCF} + N \qquad \mathrm{loss} = 1 - \exp\!\left( (R - 1) G \right)`},
      { step: "Invert it.  A yield goal fixes the LARGEST group a given "
          + "retention can spend -- this is the number a design is checked "
          + "against, and it needs no iteration.",
        eq: String.raw`G_\mathrm{max} = \frac{\ln\!\left( 1 - \mathrm{loss}_\mathrm{goal} \right)}{R - 1}`},
      { step: "A process outside that ceiling has three ways back inside, "
          + "and they are not equivalent: concentrating less leaves the wash "
          + "intact but enlarges the vessel, washing less cuts the BUFFER "
          + "EXCHANGE the wash existed to achieve, and a membrane that "
          + "retains better meets the goal without touching either.",
        eq: String.raw`\mathrm{VCF} \downarrow \qquad N \downarrow \qquad R \uparrow`},
    ],
    formula: String.raw`\begin{array}{ll}
G = \ln \mathrm{VCF} + N & \text{the concentration and the wash enter ONLY here}\\[6pt]
\mathrm{loss} = 1 - \exp\!\left( (R - 1) G \right) & \text{so they are interchangeable in the yield}\\[6pt]
G_\mathrm{max} = \dfrac{\ln\!\left( 1 - \mathrm{loss}_\mathrm{goal} \right)}{R - 1} & \text{the group a yield goal can afford}
\end{array}`,
    where: [
      { sym: "G", means: "the GOVERNING GROUP, ln VCF + N -- the only "
        + "combination of the concentration factor and the diavolumes that "
        + "the product loss can see" },
      { sym: "\\mathrm{VCF}",
        means: "the volume concentration factor of step 3" },
      { sym: "N", means: "the diavolumes of step 3" },
      { sym: "R", means: "the retention of the product, HELD CONSTANT "
        + "through the whole process -- the same assumption step 4 spends, "
        + "and step 5 is about why it is not true" },
      { sym: "\\mathrm{loss}",
        means: "the fraction of the product lost to the filtrate over the "
        + "whole concentrate-then-wash process" },
      { sym: "\\mathrm{loss}_\\mathrm{goal}",
        means: "the largest loss the process is allowed -- a yield "
        + "specification, which is a decision and never a measurement" },
      { sym: "G_\\mathrm{max}",
        means: "the largest governing group that retention can spend and "
        + "still meet the goal" },
    ],
    note: "THE WORKED EXAMPLE, RECOMPUTED.  Millipore Technical Brief TB032 "
      + "(Rev. C, 06/03, 03-117) p. 6 makes this concrete: concentrate "
      + "twenty-fold, then wash seven diavolumes, and keep more than 93 % of "
      + "the product.  The group is ln(20) + 7 = 9.9957 (the source rounds "
      + "ln 20 to 3 and calls it 10; this page does not round, which is why "
      + "its figures can differ in the third decimal).  At a retention of "
      + "0.99 the loss is 9.51 %, and the goal is missed.  Cutting the wash "
      + "to 4.3 diavolumes brings the group to 7.2957 and the loss to "
      + "7.04 %, which is MARGINALLY OVER a goal of less than 7 % -- it "
      + "meets the goal only at the one decimal a graph is read to, and "
      + "the wash that exactly meets it is 4.2613 diavolumes.  That "
      + "difference is small and it is the whole argument for doing this "
      + "step as arithmetic rather than with a ruler.  Either way the "
      + "wash was there to exchange the buffer, and "
      + "step 4's own exponential prices that: a freely permeating buffer "
      + "species (R = 0) leaves exp(-N) behind, so stopping at 4.3 "
      + "diavolumes instead of 7 leaves exp(7 - 4.3) = 14.9 times as much of "
      + "the old buffer in the vessel.  Raising the retention "
      + "to 0.999 instead leaves VCF, N and the buffer exchange exactly "
      + "where they were and drops the loss to 0.99 %.  THAT is the reason "
      + "the membrane choice is the first decision and not the last.  The "
      + "table below carries those numbers as this page computes them from "
      + "the formula above; nothing in it is transcribed.",
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
    id: "one-buffer-only",
    title: "The two-buffer optimum construction is HALF done here, and the "
      + "missing half is the one that brackets the answer.",
    body: "Step 8's construction reads the flux curve in the product's "
      + "STARTING buffer and again in the DIAFILTRATION buffer, takes the "
      + "maximum of concentration times flux on each, and works at the lower "
      + "of the two.  Choupo sweeps ONE solution.  The only fact the unit holds "
      + "about the wash buffer is its DENSITY (`rho_diafiltrate`, which "
      + "closes the solvent mass balance and enters no flux law), and it "
      + "carries no solute at all -- so there is nothing from which a "
      + "second flux curve could be built, and no case in the corpus even "
      + "declares that density.  So the "
      + "figure on this page is ONE curve and its maximum is ONE buffer's "
      + "answer.  What the second curve would change: it would give a second "
      + "maximum, the true optimum would lie between the two, and the "
      + "conservative rule would send you to the lower of them -- so the "
      + "number here is not bracketed and could move in either direction.  "
      + "Nothing on this page implies otherwise, and the plot's own caption "
      + "repeats it rather than leaving it in this list.",
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
