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

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  note?: string;
}

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
    note: "In ratios the operating line is straight even when the total flows "
      + "are not constant, which is exactly the assumption distillation has "
      + "to make and absorption gets for free.",
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
      + "breaks the series and the formula stops being exact. Choupo's "
      + "absorber solves the stages regardless; the formula is what is being "
      + "checked here, not the column.",
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
