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
  reaction-enthalpy -- the reaction enthalpy is a function of temperature
  (DEV.md 4c, C31, commissioned 2026-10-02: "isso é realmente importante").

  THE CONFUSION IT ADDRESSES is the one Vitor named: the tabulated reaction
  enthalpy is a 25 C number and a reactor does not run at 25 C.  The online
  search of 2026-10-02 found no study measuring this confusion on its own,
  and the page does not claim one.  What it rests on: the IUPAC statement
  (read through Wikipedia's "Standard state", which cites Pure Appl. Chem.
  54 (1982) 1239) that temperature is not part of the standard state; and
  the ENGINE's own numbers for N2 + 3 H2 -> 2 NH3, produced by the witness
  tutorials/props/gibbs/reactionEnthalpy01_haber_kirchhoff (golden-pinned)
  and drawn on the page from a live run, never typed into it.  The numbers
  quoted in the prose below are that golden's, rounded.
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "./lessonStep.js";
export type { LessonStep, LessonLimit };

export const ENTHALPY_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "What the degree sign fixes — and what it does not",
    body: "A table gives the standard reaction enthalpy of ammonia synthesis as "
      + "about −46 kJ per mole of ammonia, and it is tempting to read the "
      + "degree sign as \"at 25 °C\".  It does not mean that.  The degree sign "
      + "fixes the STANDARD STATE: the standard pressure, 1 bar, and each "
      + "species in its reference phase (here, the ideal gas).  It says "
      + "nothing about temperature.  In the words IUPAC's 1982 notation "
      + "recommendations are summarised by, \"strictly speaking, temperature "
      + "is not part of the definition of a standard state\" (Wikipedia, "
      + "\"Standard state\", citing Pure Appl. Chem. 54 (1982) 1239, read "
      + "2026-10-02).  Tables are printed at 298.15 K because a table must be "
      + "printed at SOME temperature.  So there is a standard reaction "
      + "enthalpy at every temperature, and the one in the table is only the "
      + "one at 298.15 K.",
    formula: String.raw`\Delta_r H^\circ(T) = \sum_i \nu_i\, h_i^\circ(T)`,
    where: [
      { sym: "\\Delta_r H^\\circ", means: "the standard reaction enthalpy: the "
        + "enthalpy change when the reactants, each pure in its standard "
        + "state, become the products in theirs — at the temperature T",
        unit: "J per mole of reaction" },
      { sym: "T", means: "the temperature it is evaluated at — ANY "
        + "temperature, not only 298.15 K", unit: "K" },
      { sym: "\\nu_i", means: "the stoichiometric coefficient of species i, "
        + "negative for a reactant and positive for a product", unit: "—" },
      { sym: "h_i^\\circ", means: "the molar enthalpy of species i in its "
        + "standard state, on the elements datum: its formation enthalpy at "
        + "298.15 K plus the heat needed to bring it from 298.15 K to T",
        unit: "J/mol" },
      { sym: "i", means: "the species index", unit: "—" },
    ],
  },
  {
    n: 2,
    title: "Kirchhoff's law: the reaction enthalpy moves with the heat capacities",
    body: "Each species' standard enthalpy changes with temperature by its own "
      + "heat capacity.  Sum them with the stoichiometric coefficients and "
      + "the reaction enthalpy changes by the DIFFERENCE between the heat "
      + "capacity of the products and that of the reactants.  If the products "
      + "can store more heat than the reactants, heating the system makes the "
      + "reaction more endothermic; if they store less, more exothermic.  "
      + "That is all Kirchhoff's law is: the reaction enthalpy at T is the "
      + "tabulated one plus the heat-capacity difference integrated from "
      + "298.15 K to T.",
    formula: String.raw`\frac{\mathrm{d}\,\Delta_r H^\circ}{\mathrm{d}T} = \Delta_r c_p^\circ
\qquad
\Delta_r H^\circ(T) = \Delta_r H^\circ(T_0) + \int_{T_0}^{T} \Delta_r c_p^\circ\,\mathrm{d}T`,
    where: [
      { sym: "\\Delta_r c_p^\\circ", means: "the reaction heat capacity: the sum "
        + "of the species' standard molar heat capacities weighted by their "
        + "stoichiometric coefficients", unit: "J/(K·mol of reaction)" },
      { sym: "T_0", means: "the temperature of the table, 298.15 K", unit: "K" },
      { sym: "\\Delta_f H_i^\\circ", means: "the standard formation enthalpy of "
        + "species i at the table temperature: the number the table prints",
        unit: "J/mol" },
      { sym: "c_{p,i}^\\circ", means: "the standard molar heat capacity of "
        + "species i", unit: "J/(mol·K)" },
    ],
    derivation: [
      { step: "Each species' standard enthalpy is its formation enthalpy at "
          + "the table temperature plus its sensible heat.",
        eq: String.raw`h_i^\circ(T) = \Delta_f H_i^\circ(T_0) + \int_{T_0}^{T} c_{p,i}^\circ\,\mathrm{d}T` },
      { step: "Multiply by the stoichiometric coefficients and sum.",
        eq: String.raw`\Delta_r H^\circ(T) = \sum_i \nu_i\,\Delta_f H_i^\circ(T_0)
  + \int_{T_0}^{T} \sum_i \nu_i\, c_{p,i}^\circ\,\mathrm{d}T` },
      { step: "The first sum is the tabulated reaction enthalpy, and the sum "
          + "under the integral is the reaction heat capacity." },
    ],
    note: "THE LAW HOLDS ALONG ONE PHASE.  If a species changes phase between "
      + "298.15 K and T — water condensing, a salt melting — its enthalpy "
      + "jumps by the latent heat on the way, and the integral alone misses it.",
    //  DEV.md 4c C43 (Vítor, 2026-10-07): a pointer to where the chain
    //  continues, never a copy of Standard State's own derivation.
    leadsTo: {
      tool: "standard-state",
      toolLabel: "Standard State",
      stepTitle: "Where the 1/T² comes from",
      body: "Kirchhoff tells us how the reaction enthalpy changes with "
        + "temperature.  Gibbs–Helmholtz then connects the reaction enthalpy "
        + "to how the reaction Gibbs energy over T changes with temperature, "
        + "and ΔG° = −RT ln K turns that into van 't Hoff: how the equilibrium "
        + "constant changes.  One structure, three links:",
      chain: String.raw`\Delta_r c_p^\circ
\xrightarrow{\ \text{Kirchhoff}\ }
\Delta_r H^\circ(T)
\xrightarrow{\ \text{Gibbs--Helmholtz}\ }
\frac{\Delta_r G^\circ(T)}{T}
\xrightarrow{\ \Delta_r G^\circ = -RT\ln K\ }
K(T)`,
    },
  },
  {
    n: 3,
    title: "Ammonia, priced by the engine: −46 at 25 °C, −53 at the converter",
    body: "The witness of this page asks Choupo for the standard reaction "
      + "enthalpy of N₂ + 3 H₂ → 2 NH₃ at seven temperatures, every species an "
      + "ideal gas at 1 bar, on the same formation surface every Choupo "
      + "reactor uses.  Per mole of ammonia it gives −45.94 kJ at 298.15 K, "
      + "−52.68 kJ at 700 K and −53.44 kJ at 773.15 K (the panel below draws "
      + "all seven, from a live run).  The magnitude GROWS with temperature, "
      + "so by step 2 the reaction heat capacity is negative: four moles of "
      + "gas become two, and the two can store less heat than the four.  The "
      + "PEQ 2026-27 base data give −46.1 kJ per mole of ammonia (section "
      + "2.4) — the 25 °C value.  At a converter's 450–500 °C the reaction "
      + "releases about 16 % more heat per mole of ammonia than that.",
    note: "THE NUMBERS ARE THE WITNESS'S GOLDEN, rounded: "
      + "tutorials/props/gibbs/reactionEnthalpy01_haber_kirchhoff, operation "
      + "`haberT`.  Its 298.15 K row reproduces "
      + "landscape06_nitrogen_fixation_routes' own Haber-Bosch row to the "
      + "last digit, because the two cases price on one formation surface.",
  },
  {
    n: 4,
    title: "What the 25 °C value gets wrong in a design",
    body: "A group that sizes the converter's heat removal with the tabulated "
      + "value under-states it, and so under-states the steam the reaction "
      + "can raise, by the same 14 % (the 25 °C value is 46.1 against the "
      + "53.4 the reaction actually releases at 500 °C).  The adiabatic "
      + "temperature rise of a bed is under-stated in the same proportion, "
      + "and the rise is what decides whether a bed stays below the "
      + "catalyst's 520 °C limit.  Neither error is visible in the arithmetic: "
      + "the number came from a respectable table, at the wrong temperature.",
    formula: String.raw`\Delta T_\mathrm{ad} \approx
\frac{\left(-\Delta_r H^\circ(T)\right)\,\dot{\xi}}{\dot{F}\,\bar{c}_p}`,
    where: [
      { sym: "\\Delta T_\\mathrm{ad}", means: "the adiabatic temperature rise "
        + "of a catalyst bed", unit: "K" },
      { sym: "\\dot{\\xi}", means: "the extent of reaction per second in the "
        + "bed", unit: "mol of reaction/s" },
      { sym: "\\dot{F}", means: "the total molar flow through the bed", unit:
        "mol/s" },
      { sym: "\\bar{c}_p", means: "the mean molar heat capacity of the gas "
        + "over the bed's temperature range", unit: "J/(mol·K)" },
    ],
    note: "THE ESTIMATE IS AN ESTIMATE.  The heat capacity of the gas also "
      + "changes along the bed, and the composition changes as it reacts; "
      + "the formula is the order of magnitude a student checks a simulator "
      + "against, not a design equation.",
  },
  {
    n: 5,
    title: "The energy balance that never needs a reaction enthalpy",
    body: "There is a way to write the energy balance of a reactor in which the "
      + "reaction enthalpy never appears: price every stream on the ELEMENTS "
      + "datum, with each species' enthalpy including its formation enthalpy, "
      + "and balance the outlet against the inlet, each at its own "
      + "temperature.  The reaction heat at whatever temperature the reactor "
      + "runs at is then already inside the difference — the Hess cycle is "
      + "done by the bookkeeping, and no temperature has to be chosen for "
      + "it.  This is how every Choupo reactor closes its energy balance, and "
      + "when a reactor announces a reaction enthalpy it evaluates it at the "
      + "reactor's own temperature, never at 25 °C (`reactionHeat`, "
      + "ReactionHeat.cpp:40, called with the local temperature — for a plug "
      + "flow reactor at PFR.cpp:647).",
    formula: String.raw`\dot{Q} = \sum_i \dot{n}_i^\mathrm{out}\, h_i(T_\mathrm{out})
- \sum_i \dot{n}_i^\mathrm{in}\, h_i(T_\mathrm{in})`,
    where: [
      { sym: "\\dot{Q}", means: "the heat the reactor exchanges with its "
        + "surroundings, positive into the reactor", unit: "W" },
      { sym: "\\dot{n}_i^\\mathrm{out}", means: "the outlet molar flow of "
        + "species i", unit: "mol/s" },
      { sym: "\\dot{n}_i^\\mathrm{in}", means: "the inlet molar flow of "
        + "species i", unit: "mol/s" },
      { sym: "h_i", means: "the molar enthalpy of species i on the elements "
        + "datum, at the stream's own temperature and pressure", unit:
        "J/mol" },
      { sym: "T_\\mathrm{out}", means: "the outlet temperature", unit: "K" },
      { sym: "T_\\mathrm{in}", means: "the inlet temperature", unit: "K" },
    ],
  },
  {
    n: 6,
    title: "When the 25 °C value is good enough",
    body: "The tabulated value is a fair approximation when the correction of "
      + "step 2 is small against it: a reactor close to room temperature, or "
      + "a reaction whose products and reactants have nearly the same heat "
      + "capacity.  A one-line check before trusting it: multiply a rough "
      + "reaction heat capacity by the distance from 298.15 K and compare "
      + "with the tabulated value.  For ammonia the engine's own numbers "
      + "give about −21 J per kelvin per mole of ammonia between 298 and "
      + "400 K, and 475 K of distance makes that about −10 kJ against −46: "
      + "far too large to ignore.  The same check also shows the limit of a "
      + "CONSTANT reaction heat capacity — carried to 773 K it predicts −55.9 "
      + "kJ against the engine's −53.4, because the heat capacities "
      + "themselves change with temperature.  The panel lets you see both.",
    formula: String.raw`\left|\Delta_r c_p^\circ\right|\,\left|T - T_0\right| \ll \left|\Delta_r H^\circ(T_0)\right|`,
    where: [],
  },
];

export const ENTHALPY_LIMITS: readonly LessonLimit[] = [
  {
    id: "standard-pressure",
    title: "Standard means 1 bar, and a converter runs at 150.",
    body: "Everything on this page is the STANDARD reaction enthalpy: each gas "
      + "ideal, at 1 bar.  At a loop pressure of 150 bar the real gases depart "
      + "from that, and the enthalpy of the real mixture carries a residual "
      + "term the standard one does not.  A Choupo case at that pressure "
      + "prices its streams with its declared equation of state; this page "
      + "shows only the standard part.",
  },
  {
    id: "one-phase-path",
    title: "Kirchhoff's integral assumes no phase change on the way.",
    body: "Between 298.15 K and T every species here stays a gas.  A reaction "
      + "with a species that condenses or melts in that range needs the "
      + "latent heat added on its path, and the simple integral misses it.",
  },
  {
    id: "no-study",
    title: "No study was found that measures this confusion on its own.",
    body: "The online search of 2026-10-02 found the standard-state convention "
      + "stated and the general difficulty of enthalpy with students "
      + "documented, but no study measuring specifically how many students "
      + "take the tabulated value as valid at any temperature.  The page "
      + "teaches the point because it matters in design, not because a "
      + "prevalence was measured.",
  },
];
