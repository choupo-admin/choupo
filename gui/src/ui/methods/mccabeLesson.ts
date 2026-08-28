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
  The McCabe-Thiele lesson, as DATA.

  The tool that renders it is defined inline in MethodsWorkspace.tsx (it takes
  the catalogue, the local UNIFAC map and the case-local component files as
  props, and shares HandOffFooter with its neighbours there).  The prose lives
  here instead so a test can reach it: prose is the part of a tool that rots
  with nothing failing, and an argument held as data can be asserted to still
  run end to end.

  THE ORDER IS THE POINT.  The flash tool teaches ONE step -- a balance line
  meeting an equilibrium curve.  This is that step repeated, so it opens by
  saying so rather than starting from a staircase the reader has no reason to
  expect.  Everything after it is the consequence of a column having TWO
  halves and therefore two balances.
\*---------------------------------------------------------------------------*/

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  note?: string;
}

export const MCCABE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "You have already drawn one of these",
    body: "A flash is one equilibrium stage: a balance line meeting the "
      + "equilibrium curve, and the intersection is the answer.  A column is "
      + "a stack of those stages, each taking liquid from the one above and "
      + "vapour from the one below.  The staircase is not a new idea — it is "
      + "the flash construction walked repeatedly, and every corner of it is "
      + "one of the two things you already know.",
    note: "Horizontal to the curve = one ideal stage reaching equilibrium.  "
      + "Vertical to the line = the material balance carrying you to the next "
      + "stage.  That is the whole construction.",
  },
  {
    n: 2,
    title: "Two operating lines, because the column has two halves",
    body: "Above the feed, the liquid running down is reflux returned from "
      + "the condenser.  Below it, the liquid is the feed plus that reflux.  "
      + "The two halves therefore obey DIFFERENT material balances, and each "
      + "gets its own line.  The reflux ratio R = L/D is what sets the slope "
      + "of the upper one — which is why turning R moves the staircase.",
    formula: "rectifying:  y = R/(R+1) · x + x_D/(R+1)\n"
      + "stripping:   y = (L̄/V̄) · x − (B/V̄) · x_B",
    note: "Both lines are STRAIGHT, and that is an assumption, not a fact — "
      + "see the limits at the foot of this page.",
  },
  {
    n: 3,
    title: "The q-line: what the feed's condition does to the column",
    body: "The two operating lines meet on a third, fixed by the feed alone: "
      + "how much of it arrives as liquid.  q is the heat needed to bring one "
      + "mole of feed to saturated liquid, over the molar latent heat — so "
      + "q = 1 is a saturated liquid and q = 0 a saturated vapour.  Its slope "
      + "is q/(q−1), which is why a saturated-liquid feed gives a VERTICAL "
      + "q-line and a saturated vapour a horizontal one.",
    formula: "q-line:  y = q/(q−1) · x − z_F/(q−1)",
    note: "q > 1 subcooled liquid, q = 1 saturated liquid, 0 < q < 1 partly "
      + "vaporised, q = 0 saturated vapour, q < 0 superheated vapour.  Feed "
      + "condition is a design variable, not a given: it moves the "
      + "intersection, and with it the stage count.",
  },
  {
    n: 4,
    title: "Two limits bracket every real column",
    body: "TOTAL REFLUX (R → ∞) collapses both operating lines onto the "
      + "diagonal.  The staircase is then as wide as it can be and you get "
      + "the MINIMUM number of stages — for infinite energy and zero "
      + "product.  MINIMUM REFLUX (R → R_min) is the opposite: the operating "
      + "line touches the equilibrium curve, and at that pinch the steps "
      + "become infinitely small, so you need infinitely many.  Minimum "
      + "energy, infinite column.",
    formula: "N_min at R → ∞      ·      N → ∞ at R → R_min",
    note: "Neither is buildable, and that is what makes them useful: every "
      + "real design sits between them, and the usual working range is "
      + "R ≈ 1.1 to 1.5 × R_min, where the capital cost of trays and the "
      + "running cost of reboiler duty trade off against each other.",
  },
  {
    n: 5,
    title: "And what stops it working",
    body: "Where the equilibrium curve crosses the diagonal, y* = x: a "
      + "vapour with the same composition as its liquid.  No staircase can "
      + "step past that point, because a step needs the curve and the "
      + "diagonal to be apart.  That is an AZEOTROPE, and the construction "
      + "failing there is not a numerical problem — it is the physics saying "
      + "this separation cannot be done by ordinary distillation at this "
      + "pressure.",
    note: "The usual answers are to change the pressure (which moves the "
      + "azeotrope, and sometimes removes it), add an entrainer, or use "
      + "something other than distillation.  Try ethanol/water in the "
      + "chooser and watch the staircase run into the wall.",
  },
];

export const MCCABE_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "cmo",
    title: "The operating lines are STRAIGHT only because of an assumption.",
    body: "Constant molal overflow: every mole of vapour that condenses "
      + "boils a mole of liquid, so the molar flows are constant in each "
      + "section. It holds when the two components have similar molar latent "
      + "heats and the column is near-adiabatic. Where it does not, the "
      + "balances still hold but the lines curve, and this construction "
      + "quietly stops being exact.",
  },
  {
    id: "ideal-stages",
    title: "The steps are IDEAL stages, not trays you can buy.",
    body: "Each step assumes the vapour leaving is in equilibrium with the "
      + "liquid leaving. A real tray is not, and the gap is the tray "
      + "efficiency — commonly 60-80 %, so the tray count is larger than the "
      + "step count, often by half again. Nothing on this diagram knows that.",
  },
  {
    id: "binary",
    title: "BINARY only, like the flash before it.",
    body: "The whole construction lives in an x-y plane, which exists "
      + "because there are two components and the second composition is one "
      + "minus the first. With three there is no such plane, and a "
      + "multicomponent column is solved as equations — Choupo's own "
      + "distillationColumn does exactly that, stage by stage.",
  },
  {
    id: "one-pressure",
    title: "One equilibrium curve, at ONE pressure.",
    body: "The engine computes y*(x) at the pressure you set, and the whole "
      + "staircase is drawn on it. A real column has a pressure profile — "
      + "the reboiler sits above the condenser by the pressure drop of every "
      + "tray between them — so its equilibrium curve is different at every "
      + "stage.",
  },
];
