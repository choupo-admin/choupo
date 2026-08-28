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
  The batch-distillation lesson, as DATA.

  FOURTH in the sequence, and the one where the construction stops standing
  still.  The flash was one step; McCabe walked it down a column; Kremser
  summed it into a formula; here the SAME staircase moves, because the thing
  being separated is being consumed while you separate it.

  The stages-move section exists because it was asked for by name: students
  want to see the stages in transient distillation, and no static diagram can
  show a distillate getting leaner while the pot empties.
\*---------------------------------------------------------------------------*/

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  note?: string;
}

export const RAYLEIGH_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Nothing is steady, and that changes the question",
    body: "Everything so far had a feed coming in and products going out at "
      + "a fixed rate, so the answer was a state.  A batch still has no feed: "
      + "you charge the pot, boil, and take the vapour away.  The liquid left "
      + "behind gets heavier as the light component leaves, so the "
      + "composition you are separating CHANGES WHILE YOU SEPARATE IT.  The "
      + "answer is no longer a state but a history.",
  },
  {
    n: 2,
    title: "The Rayleigh equation is a material balance over one instant",
    body: "Take dW moles out of a pot holding W at composition x.  What "
      + "leaves is vapour at y*(x), in equilibrium with what stays.  Write "
      + "the balance on the light component, cancel, and separate the "
      + "variables — and what falls out is an integral you can evaluate on "
      + "the equilibrium curve without ever solving a differential equation "
      + "in time.",
    formula: "ln(W₀/W) = ∫ dx / (y*(x) − x)     from x_W to x₀",
    note: "The area under 1/(y* − x) between the two pot compositions IS the "
      + "logarithm of how much you boiled away.  The tool shades that area "
      + "over the engine's own equilibrium points and compares it with the "
      + "engine's own holdups — two routes to one number, and the gap between "
      + "them is the price of trapezoids.",
  },
  {
    n: 3,
    title: "Put trays on it, and the staircase starts to move",
    body: "A simple still separates by one equilibrium step.  Put a "
      + "rectifying column above the pot and you get a McCabe staircase — "
      + "the same construction as a continuous column, with one difference "
      + "that is the whole point of this page.  In a column the staircase is "
      + "FIXED and you count it once.  Here the pot depletes, so the "
      + "distillate the same column can deliver gets leaner every minute, and "
      + "the staircase slides down the curve as you watch.",
    formula: "y = R/(R+1) · x + x_D/(R+1)      anchored at (x_D, x_D)",
    note: "There is no stripping section: the pot IS the reboiler and there "
      + "is nothing below it. So one operating line, anchored at the "
      + "distillate — and the walk down takes the trays plus ONE more step, "
      + "because the pot is itself an equilibrium stage.",
  },
  {
    n: 4,
    title: "Two ways to run it, and they trade against each other",
    body: "CONSTANT REFLUX is what the drawing above shows: hold R, and let "
      + "the distillate drift down as the pot empties.  Simple to operate, "
      + "and the product is a blend of everything that came over.  CONSTANT "
      + "COMPOSITION is the other choice: hold x_D where you want it and "
      + "raise R to keep it there as the pot gets leaner — the operating line "
      + "steepens toward the diagonal until the reflux you would need is more "
      + "than the column can carry, and that moment is when the batch ends.",
    note: "Choupo models both (refluxPolicy constantReflux | "
      + "constantComposition), and the second publishes the reflux climbing "
      + "and a refluxLimitReached flag when it hits the ceiling. The "
      + "staircase above is the constant-reflux witness; watch x_D fall.",
  },
];

export const RAYLEIGH_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "binary",
    title: "BINARY, like every construction in this family.",
    body: "The Rayleigh integral and the staircase both live in an x-y plane "
      + "that exists only for two components. Multicomponent batch "
      + "distillation is solved as equations, not drawn.",
  },
  {
    id: "holdup",
    title: "The trays hold NO liquid in this construction.",
    body: "A real column holds liquid on every tray and in the condenser, and "
      + "that inventory is composition the pot has already lost but the "
      + "receiver has not yet gained. Neglecting it is standard for teaching "
      + "and is worst exactly where batch distillation is used — small "
      + "charges, where the holdup is a real fraction of what you started "
      + "with.",
  },
  {
    id: "equilibrium-stages",
    title: "Ideal stages, and an instantaneous column.",
    body: "Each step assumes equilibrium, so a real column needs an "
      + "efficiency. And the staircase is redrawn at each instant as though "
      + "the column reached steady state immediately — the trays are assumed "
      + "to track the pot with no lag of their own.",
  },
  {
    id: "one-pressure",
    title: "One pressure, one equilibrium curve.",
    body: "The curve is computed once at the declared pressure and the whole "
      + "history is drawn on it. A still whose pressure drifts, or a column "
      + "with a real pressure drop, has a curve that moves too.",
  },
];
