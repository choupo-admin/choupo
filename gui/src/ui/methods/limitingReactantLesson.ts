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
  limiting-reactant -- the limiting reactant and the feed ratio in a recycle
  loop (DEV.md 4c, C30, commissioned 2026-10-02).

  THE QUESTION IT ANSWERS is the one Vitor asked: which heuristics fix the
  limiting reactant and the molar ratio of a gas-phase reactor, given that
  the choice "introduces many variables".  The answer is that it introduces
  fewer than it seems: a steady-state plant balance FORCES the fresh-feed
  ratio, the loop SETS the reactor-inlet ratio, and what is left to choose is
  one variable, made by named reasons.

  EVERY OUTSIDE CLAIM CARRIES THE SOURCE IT WAS READ FROM, online, on
  2026-10-02: US 2,734,906 for the oxygen limit, EP 0 873 291 B1 for the
  benzene excess.  Douglas's hierarchy is named as the framework and was NOT
  read back online -- the page says so where it uses it.  The ammonia numbers
  are MEASURED on tutorials/plant/greenAmmoniaIndustrialN2 (converged/), and
  the closed form of step 3 is derived on the page.
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "./lessonStep.js";
export type { LessonStep, LessonLimit };

export const LIMITING_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Two ratios, and only one of them is yours",
    body: "A reactor with two reactants, A and B, seems to need two numbers "
      + "chosen at once: which one is limiting, and the ratio between them.  "
      + "In a plant with a recycle there are in fact TWO different ratios, "
      + "measured at two different places, and they behave completely "
      + "differently.  The FRESH-FEED ratio is measured on what enters the "
      + "plant.  The REACTOR-INLET ratio is measured where the fresh feed and "
      + "the recycle have already been mixed.  The rest of this page shows "
      + "that the plant decides the first one for you, the loop decides the "
      + "second one, and what is left to choose is a single variable.",
    formula: String.raw`r_\mathrm{f} = \frac{F_B^\mathrm{f}}{F_A^\mathrm{f}}
\qquad\qquad
r_\mathrm{in} = \frac{F_B^\mathrm{in}}{F_A^\mathrm{in}}`,
    where: [
      { sym: "A", means: "the LIMITING reactant: the one whose conversion is "
        + "quoted, and which runs out first", unit: "—" },
      { sym: "B", means: "the reactant fed in EXCESS", unit: "—" },
      { sym: "r_\\mathrm{f}", means: "the molar ratio of B to A in the FRESH "
        + "feed, the material that crosses the plant boundary", unit: "—" },
      { sym: "r_\\mathrm{in}", means: "the molar ratio of B to A at the "
        + "REACTOR INLET, after the recycle has been mixed in", unit: "—" },
      { sym: "F_B^\\mathrm{f}", means: "the fresh feed of B", unit: "mol/s" },
      { sym: "F_A^\\mathrm{f}", means: "the fresh feed of A", unit: "mol/s" },
      { sym: "F_B^\\mathrm{in}", means: "the flow of B entering the reactor",
        unit: "mol/s" },
      { sym: "F_A^\\mathrm{in}", means: "the flow of A entering the reactor",
        unit: "mol/s" },
    ],
  },
  {
    n: 2,
    title: "At steady state the fresh feed is stoichiometric, plus the losses",
    body: "Draw the balance around the WHOLE plant, not around the reactor.  "
      + "At steady state nothing accumulates, so every mole of A that enters "
      + "either reacts or leaves in a loss stream (a purge, a gas dissolved in "
      + "the product, a vent), and the same for B.  The reaction consumes them "
      + "in the stoichiometric proportion.  So the fresh-feed ratio is NOT a "
      + "design variable: it is the stoichiometric coefficient ratio plus a "
      + "correction for whatever leaves unreacted.  Feed the plant a ratio "
      + "that does not satisfy this balance and there is no steady state — "
      + "the reactant in surplus accumulates in the loop until a loss stream "
      + "grows enough to carry it out.",
    formula: String.raw`\begin{aligned}
F_A^\mathrm{f} &= \xi + L_A, \qquad F_B^\mathrm{f} = \nu\,\xi + L_B\\
r_\mathrm{f} &= \frac{\nu\,\xi + L_B}{\xi + L_A}
\;\xrightarrow{\;L \to 0\;}\; \nu
\end{aligned}`,
    where: [
      { sym: "\\xi", means: "the extent of reaction of the whole plant, per "
        + "mole of A consumed: the moles of A that react per second", unit:
        "mol/s" },
      { sym: "\\nu", means: "the stoichiometric ratio, moles of B consumed per "
        + "mole of A (3 for N₂ + 3 H₂ → 2 NH₃, with A = N₂)", unit: "—" },
      { sym: "L_A", means: "the A that leaves the plant unreacted, summed "
        + "over every loss stream", unit: "mol/s" },
      { sym: "L_B", means: "the B that leaves the plant unreacted", unit:
        "mol/s" },
      { sym: "L", means: "the two losses together, in the limit where both "
        + "are small", unit: "mol/s" },
    ],
  },
  {
    n: 3,
    title: "The inlet ratio is set by the loop, and a tiny error moves it a lot",
    body: "Take the simplest loop that shows it: a reactor converting a "
      + "fraction X of the A that enters it, a separator that removes the "
      + "product completely, and a purge that throws away a fraction p of the "
      + "unreacted gas, A and B alike, before the rest is recycled.  Write the "
      + "fresh-feed ratio as the stoichiometric one with a small relative "
      + "excess ε.  The component balances around the mixing point close in "
      + "two lines, and the inlet ratio comes out in closed form.  Read the "
      + "result for what it says: ε, the error in the FRESH ratio, is divided "
      + "by p.  When the purge is small — and a purge is kept small because it "
      + "throws reactant away — a fresh-feed error of one part in ten "
      + "thousand becomes a large change in the reactor-inlet ratio.  With a "
      + "negative ε the inlet runs short of B, and below the bound shown there "
      + "is no steady state at that conversion at all.",
    formula: String.raw`\begin{aligned}
r_\mathrm{f} &= \nu\,(1 + \varepsilon)\\
r_\mathrm{in} &= \nu \left( 1 + \varepsilon\,\frac{D}{p} \right),
\qquad D = X + p\,(1 - X)\\
\text{steady state needs}\quad \varepsilon &\ge -\,\frac{p\,(1 - X)}{D}
\end{aligned}`,
    where: [
      { sym: "\\varepsilon", means: "the relative excess of B in the fresh "
        + "feed over the stoichiometric ratio; 0 is a fresh feed exactly in "
        + "the proportion the reaction consumes", unit: "—" },
      { sym: "X", means: "the per-pass conversion of A in the reactor", unit:
        "—" },
      { sym: "p", means: "the fraction of the unreacted gas thrown away in "
        + "the purge, taken from A and B in the same proportion", unit: "—" },
      { sym: "D", means: "a shorthand for the fraction of the A entering the "
        + "reactor that leaves the loop per pass, reacted or purged; it is "
        + "also the fresh feed of A divided by the A entering the reactor", unit: "—" },
    ],
    derivation: [
      { step: "A balance at the mixing point: the inlet is the fresh feed plus "
          + "what survives one pass and the purge.",
        eq: String.raw`F_A^\mathrm{in} = F_A^\mathrm{f} + (1-p)(1-X)\,F_A^\mathrm{in}
\;\Rightarrow\; F_A^\mathrm{in} = \frac{F_A^\mathrm{f}}{D}` },
      { step: "B balance: the reactor consumes ν X of the A that enters, and "
          + "the purge removes a fraction p of the B left over.",
        eq: String.raw`F_B^\mathrm{in} = \nu\,(1+\varepsilon)\,F_A^\mathrm{f}
  + (1-p)\left(F_B^\mathrm{in} - \nu\,X\,F_A^\mathrm{in}\right)` },
      { step: "Solve for the B inlet and divide by the A inlet.  The terms "
          + "that do not carry ε cancel to exactly ν: a stoichiometric fresh "
          + "feed through a non-selective purge gives a stoichiometric inlet.",
        eq: String.raw`F_B^\mathrm{in} = \nu\,F_A^\mathrm{f}\left(\frac{\varepsilon}{p}
  + \frac{1}{D}\right)
\;\Rightarrow\; r_\mathrm{in} = \nu\left(1 + \varepsilon\,\frac{D}{p}\right)` },
      { step: "The B left over after the reactor cannot be negative; that is "
          + "the bound on ε." },
    ],
    note: "WHAT THE SIMPLE LOOP LEAVES OUT IS THE NEXT STEP.  Here the purge "
      + "takes A and B in the proportion they have in the loop, so a "
      + "stoichiometric fresh feed gives a stoichiometric inlet.  A real loop "
      + "also loses gas DISSOLVED in the liquid product, and a gas does not "
      + "dissolve in the proportion it has in the loop.  That is a SELECTIVE "
      + "loss, and it moves the inlet ratio even when ε is exactly zero.",
  },
  {
    n: 4,
    title: "The ammonia loop, measured: 3.0 in, 3.6 at the converter",
    body: "Choupo's green ammonia case (tutorials/plant/"
      + "greenAmmoniaIndustrialN2) feeds hydrogen and nitrogen at 3 : 1 and "
      + "its converter sees H₂/N₂ = 3.589.  Both effects of step 3 are in "
      + "it, and they can be separated by running it twice.  The SELECTIVE "
      + "loss first: nitrogen dissolves in liquid ammonia more than hydrogen, "
      + "so the gas released when the product is let down is nitrogen-rich — "
      + "H₂/N₂ = 2.77 in the let-down gas and 1.70 in the storage flash "
      + "gas, against 3.92 in the purge.  If the loop sat at 3, its losses "
      + "would take more nitrogen than the fresh feed brings, hydrogen would "
      + "accumulate, and it does until the losses come back to the fresh "
      + "ratio.  Run with a fresh feed EXACTLY 3 : 1, the converter inlet "
      + "settles at 3.532.  Then the FRESH-RATIO error: the case's nitrogen "
      + "carries 100 ppm of argon in place of nitrogen, so its fresh H₂/N₂ "
      + "is 3.0003, an ε of one part in ten thousand.  That moves the inlet "
      + "from 3.532 to 3.589.  The loop throws away about 0.2 % of its "
      + "unreacted gas, and the closed form of step 3 with that p, X = 0.355 "
      + "and ε = 0.0001 predicts a shift of 0.053; the case shows 0.057.",
    note: "WHAT A REAL LOOP DOES ABOUT IT.  It does not fight the loop with "
      + "the fresh feed held at exactly 3 : 1.  It measures the converter-inlet "
      + "ratio and trims the make-up ratio to bring it where it should be — "
      + "which, by step 2, means a make-up ratio a hair away from "
      + "stoichiometric, by exactly the selectivity of the losses.  (All the "
      + "numbers in this step were read from the case's converged/ streams on "
      + "2026-10-02; the exact-3 run changed the H₂ feed from 4410 to "
      + "4409.559 kmol/h and nothing else.)",
  },
  {
    n: 5,
    title: "Which reactant to make limiting: four reasons, in order of force",
    body: "Once the plant balance and the loop have taken their share, the "
      + "remaining choice — which reactant is in excess at the reactor inlet, "
      + "and by how much — is made for one of four reasons, and it is worth "
      + "knowing which one is deciding.  SAFETY first.  In the old air-based "
      + "ethylene-oxide process, \"oxygen concentrations in inlet gases are "
      + "kept below 8% and preferably at 3-6% to minimize explosive hazards\" "
      + "(US 2,734,906, Allied Chemical & Dye, 1956): the oxygen is limited "
      + "because a flammable mixture is not an option, whatever the kinetics "
      + "would prefer.  SELECTIVITY second.  In ethylbenzene manufacture "
      + "\"the ethylbenzene formed is more reactive than benzene with respect "
      + "to ethylene\", so the prior art used \"a strong excess of benzene\" "
      + "at the reactor entry — a benzene/ethylene ratio \"generally between "
      + "2 and 2.5\" with aluminium chloride and up to \"between 8 and 16\" "
      + "with zeolites in the gas phase (EP 0 873 291 B1, 2002).  The excess "
      + "starves the side reaction of the reagent it needs.  COST third: make "
      + "limiting the reactant that is expensive, or hard to recover and "
      + "recycle, so that little of it travels round the loop.  EQUILIBRIUM "
      + "last: an excess of one reactant pushes the conversion of the other "
      + "towards completion.",
    note: "WHERE THE FRAMEWORK COMES FROM.  Treating the reactor-inlet excess "
      + "as a design decision of the recycle structure, taken after the "
      + "structure is fixed and before the separations are designed, is "
      + "J. M. Douglas's hierarchy (Conceptual Design of Chemical Processes, "
      + "McGraw-Hill, 1988).  Its text was not read back online for this "
      + "page, so nothing here is quoted from it.  The two quotations above "
      + "were read on 2026-10-02 from the patents named.",
  },
  {
    n: 6,
    title: "What is left is one variable, and it is optimised, not guessed",
    body: "Put the pieces together.  The fresh-feed ratio is fixed by the plant "
      + "balance (step 2).  The inlet ratio is the loop's response to the "
      + "fresh ratio and to the selectivity of the losses (steps 3 and 4), and "
      + "in practice it is held where it is wanted by trimming the make-up.  "
      + "Which reactant is limiting is decided by the first of the four "
      + "reasons that applies (step 5).  What remains free is how large the "
      + "excess at the inlet should be — and that is an economic trade-off "
      + "between what the excess buys (selectivity, conversion, safety margin) "
      + "and what it costs: every mole of excess travels round the loop "
      + "through the compressor, the exchangers and the separation, on every "
      + "pass.  It is the variable to sweep, with everything else held, and "
      + "to read the operating cost against.",
    formula: String.raw`\rho_B = \frac{F_B^\mathrm{in} - \nu\,X\,F_A^\mathrm{in}}{\nu\,X\,F_A^\mathrm{in}}
= \frac{r_\mathrm{in}}{\nu X} - 1`,
    where: [
      { sym: "\\rho_B", means: "the moles of B recirculated per mole of B "
        + "consumed: the B that leaves the reactor unreacted, divided by the B "
        + "the reaction uses", unit: "—" },
    ],
    note: "READ IT AS A PRICE.  At the green ammonia converter, "
      + "with an inlet ratio of 3.589 and X = 0.355 per pass, it is 2.4: "
      + "for every mole of hydrogen that becomes ammonia, 2.4 more go round "
      + "the loop and through the recycle compressor.",
  },
];

export const LIMITING_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-reaction",
    title: "One reaction, one stoichiometric ratio.",
    body: "Everything on this page assumes a single reaction consuming A and B "
      + "in a fixed proportion.  With parallel or consecutive reactions the "
      + "consumption ratio itself depends on the inlet ratio — which is the "
      + "selectivity reason of step 5 — and the closed form of step 3 no "
      + "longer holds.",
  },
  {
    id: "non-selective-purge",
    title: "The closed form assumes a non-selective purge.",
    body: "Step 3 lets the purge take A and B in the loop's own proportion.  "
      + "A loss that prefers one of them — gas dissolved in a liquid "
      + "product, a membrane, an absorber — shifts the inlet ratio even with "
      + "a stoichiometric fresh feed, and step 4 measures how much on one "
      + "case.  The calculator below has no selective loss.",
  },
  {
    id: "no-kinetics",
    title: "Nothing here says what ratio the catalyst prefers.",
    body: "The rate of a reaction depends on the inlet ratio, and for some "
      + "catalysts the fastest ratio is not the stoichiometric one.  This page "
      + "computes balances, not rates; the ratio that maximises the rate needs "
      + "a kinetic reactor model.",
  },
  {
    id: "one-witness",
    title: "The ammonia numbers come from one case.",
    body: "They were measured on the green ammonia case as it stood on "
      + "2026-10-02.  They show the mechanism; they are not design values for "
      + "another plant.",
  },
];
