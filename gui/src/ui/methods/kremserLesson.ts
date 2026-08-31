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
  The absorption lesson, as DATA, for the same reason the McCabe one is: prose
  is the part of a tool that rots with nothing failing, and an argument held
  as data can be asserted to still run end to end.

  THIRD IN THE SEQUENCE, and it earns the place by being the same idea a third
  time.  The flash put a balance line on an equilibrium curve.  McCabe-Thiele
  walked that step down a column.  Absorption is the same walk again, and the
  thing worth teaching is that the whole staircase collapses into ONE
  ALGEBRAIC EXPRESSION when the equilibrium line is straight -- which is why
  absorber design is usually done with a formula and distillation is not.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const KREMSER_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Same construction, different axes",
    body: "A gas carries something you want out of it; a liquid runs down "
      + "against it and takes it.  Stage by stage this is the McCabe "
      + "staircase again — an operating line from the material balance, an "
      + "equilibrium line from the thermodynamics, and steps between them.  "
      + "What changes is the bookkeeping: absorption is written in MOLE "
      + "RATIOS, moles of solute per mole of solute-free carrier, because the "
      + "carrier gas and the solvent pass through almost unchanged while the "
      + "total flows do not.",
    formula: "Y = y/(1−y)      X = x/(1−x)",
    where: [
      { sym: "y", means: "solute MOLE FRACTION in the gas — per mole of gas, "
        + "total" },
      { sym: "Y", means: "solute MOLE RATIO in the gas — per mole of "
        + "solute-free carrier gas, which is the quantity that does not "
        + "change as the solute leaves",
        unit: "mol solute / mol carrier" },
      { sym: "x", means: "solute mole fraction in the liquid — per mole of "
        + "liquid, total" },
      { sym: "X", means: "solute mole ratio in the liquid — per mole of "
        + "solute-free solvent",
        unit: "mol solute / mol solvent" },
    ],
    note: "In ratios the operating line is straight even when the total flows "
      + "are not constant, which is exactly the assumption distillation has "
      + "to make and absorption gets for free — ON PAPER.  Choupo's absorber "
      + "does NOT take that road: it solves a stage tridiagonal in mole "
      + "FRACTIONS at constant total L and V, so it makes the same "
      + "constant-flow assumption after all, and the A it publishes is a "
      + "total-flow ratio.  The ratio bookkeeping is here because it is how "
      + "the method is taught and derived, not because it is what runs.",
  },
  {
    n: 2,
    title: "One number decides almost everything: the absorption factor",
    body: "The operating line's slope is L/V, the liquid-to-gas ratio.  The "
      + "equilibrium line's slope is K.  Their RATIO is the absorption "
      + "factor, and it is the single number that says whether the column "
      + "can work at all: it compares the solvent's capacity to carry the "
      + "solute away against the solute's tendency to stay in the gas.",
    formula: "A = L / (K · V)",
    where: [
      { sym: "A", means: "the absorption factor — how hard the solvent pulls "
        + "relative to how hard the equilibrium pushes back.  A > 1 and the "
        + "solvent wins" },
      { sym: "L", means: "molar flow of the LEAN SOLVENT STREAM — the whole "
        + "stream, not a solute-free basis.  Textbooks usually write Kremser "
        + "solute-free; Choupo's absorber reads the declared stream F and "
        + "publishes it as the L_in KPI, so recompute A with the total or "
        + "your arithmetic will not match the screen",
        unit: "mol/s" },
      { sym: "V", means: "molar flow of the GAS FEED STREAM — again the whole "
        + "stream (L_over_V is 1.5 on the witness: 150/100, not 150/90)",
        unit: "mol/s" },
      { sym: "K", means: "the equilibrium ratio y/x — the slope of the "
        + "equilibrium line.  The published K_i, and the A built from it, are "
        + "the engine's single REFERENCE value at the gas feed temperature; "
        + "the stages are solved on their own K(T_j), which on the witness "
        + "run 309-315 K against a feed at 298 K" },
    ],
    note: "A > 1: the operating line is steeper than the equilibrium line, "
      + "the two diverge going up the column, and more stages keep buying "
      + "recovery.  A < 1: they converge, the staircase pinches, and no "
      + "number of stages will finish the job — you need more solvent or a "
      + "better one, not a taller column.  A ≈ 1.4 is the classical economic "
      + "compromise between solvent pumping and column height.",
  },
  {
    n: 3,
    title: "And then the staircase collapses into a formula",
    body: "This is the part worth remembering.  When the equilibrium line is "
      + "STRAIGHT, the steps of the staircase form a geometric series, and "
      + "the whole construction sums in closed form.  You no longer draw "
      + "stages — you compute the recovery directly from A and N.  That is "
      + "Kremser, and it is why absorbers are designed with a formula while "
      + "distillation columns are drawn or solved stage by stage.",
    formula: "recovery = (A^(N+1) − A) / (A^(N+1) − 1)        A ≠ 1\n"
      + "recovery = N / (N + 1)                              A = 1",
    where: [
      { sym: "recovery", means: "the fraction of the entering solute the "
        + "solvent captures" },
      { sym: "A", means: "the absorption factor, as above" },
      { sym: "N", means: "the number of EQUILIBRIUM stages — ideal ones, not "
        + "trays: a real column needs more" },
    ],
    note: "The A = 1 case is a removable singularity, not a special physics: "
      + "both branches meet there, and the limit is the textbook N/(N+1).  "
      + "The engine's stagewise answer is plotted against this formula on the "
      + "same axes, so you can see where the assumption holds and where it "
      + "starts to cost you.",
  },
  {
    n: 4,
    title: "Where the formula and the column disagree",
    body: "The deviation shown beside the plot is not decoration.  Kremser "
      + "assumes a straight equilibrium line and one temperature; a real "
      + "absorber has neither.  Dissolving a solute releases heat, the liquid "
      + "warms as it runs down, K rises with temperature, and A falls — so "
      + "the bottom of a hot column is worse at absorbing than the formula "
      + "believes.  When the tool reports a temperature rise, that is the "
      + "mechanism, and the gap you see is what it costs.",
    note: "This is the honest version of a comparison a textbook usually "
      + "makes in the student's favour.  The formula is not wrong; it is "
      + "answering a question with fewer conditions than the column obeys.",
  },
];

export const KREMSER_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "straight-equilibrium",
    title: "The closed form needs a STRAIGHT equilibrium line.",
    body: "Kremser sums a geometric series, and that series exists only "
      + "because each step scales by the same factor A. A curved equilibrium "
      + "line — a concentrated solute, a solute that reacts in the liquid — "
      + "breaks the series and the formula stops being exact.  Choupo's "
      + "absorber does not rescue you there either: it reads HENRY'S LAW and "
      + "REFUSES an activity-model package by name, and it re-evaluates K at "
      + "the fixed INLET compositions, so its K bends with stage temperature "
      + "and never with composition.  What the column buys over the formula "
      + "is the temperature profile, not a curved equilibrium.",
  },
  {
    id: "isothermal",
    title: "It also assumes ONE temperature, and absorption is exothermic.",
    body: "Heat of solution warms the liquid as it descends, K rises, and A "
      + "falls where the formula assumes it constant. The tool announces a "
      + "temperature rise when the run has one, and the deviation beside the "
      + "plot is where that shows up. A strongly exothermic absorber needs "
      + "interstage cooling, and none of it is in the formula.",
  },
  {
    id: "dilute",
    title: "Mole RATIOS, and the usual dilute-solution habits.",
    body: "The construction is exact in ratios, but the carrier gas is taken "
      + "as insoluble and the solvent as non-volatile — both moving through "
      + "unchanged. A solvent that evaporates into the gas, or a carrier that "
      + "dissolves, is not covered.",
  },
  {
    id: "ideal-stages",
    title: "Stages, not trays or packing height.",
    body: "N is a count of ideal equilibrium stages. A real tray column needs "
      + "an efficiency; a packed column needs the count converted to height "
      + "through an HTU or an HETP, which depends on the packing, the flows "
      + "and the system. Nothing here does that conversion.",
  },
];
