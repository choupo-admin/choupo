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

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

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
    derivation: [
      { step: "Cut the column anywhere ABOVE the feed and write a balance on "
          + "the more volatile component over the envelope containing the "
          + "cut, the condenser and the top product.  Vapour V rises past "
          + "the cut carrying y; liquid L falls past it carrying x; D leaves "
          + "at x_D.",
        eq: "V · y_{n+1} = L · x_n + D · x_D" },
      { step: "Divide by V to get y on its own.  Nothing has been assumed "
          + "yet — this is exact for any column.",
        eq: "y_{n+1} = (L/V) · x_n + (D/V) · x_D" },
      { step: "SPEND THE ASSUMPTION.  Constant molar overflow says L and V "
          + "do not change from tray to tray within a section, so L/V is one "
          + "number and the relation is a STRAIGHT LINE.  This is the whole "
          + "reason the method can be drawn rather than solved.", eq: "" },
      { step: "Now write both in terms of R = L/D, which is the knob an "
          + "operator actually turns.  A total balance on the same envelope "
          + "gives V = L + D, so",
        eq: "L/V = L/(L+D) = R/(R+1)     and     D/V = 1/(R+1)" },
      { step: "Substitute.  The rectifying operating line falls out, and "
          + "notice it passes through (x_D, x_D) for every R — which is why "
          + "turning the reflux PIVOTS it about that point on the diagonal.",
        eq: "y = R/(R+1) · x + x_D/(R+1)" },
      { step: "Below the feed the same cut is made downward, over the "
          + "envelope containing the reboiler and the bottoms.  The bar "
          + "marks the section, not an average: the feed has changed both "
          + "flows.",
        eq: "V̄ · y_{m+1} = L̄ · x_m − B · x_B\n"
          + "y = (L̄/V̄) · x − (B/V̄) · x_B" },
      { step: "In the engine the stripping line is not asked for as an "
          + "input at all.  It is DETERMINED: the line through (x_B, x_B) "
          + "and the point where the rectifying line meets the q-line, so it "
          + "pivots about the bottoms as R and q move.  Two lines, one "
          + "degree of freedom.  (strippingLine in "
          + "gui/src/case/mccabeThiele.ts is the six lines that do it.)" },
    ],
    formula: "rectifying:  y = R/(R+1) · x + x_D/(R+1)\n"
      + "stripping:   y = (L̄/V̄) · x − (B/V̄) · x_B",
    where: [
      { sym: "x", means: "mole fraction of the MORE VOLATILE component in the "
        + "liquid on a tray" },
      { sym: "y", means: "mole fraction of the same component in the vapour "
        + "leaving that tray" },
      { sym: "R", means: "the REFLUX RATIO L/D — liquid returned to the "
        + "column per mole of distillate taken off" },
      { sym: "x_D", means: "composition of the distillate, the product leaving "
        + "the top" },
      { sym: "x_B", means: "composition of the bottoms, the product leaving "
        + "the reboiler" },
      { sym: "B", means: "molar flow of bottoms", unit: "mol/s" },
      { sym: "L", means: "liquid molar flow in the RECTIFYING section, above "
        + "the feed", unit: "mol/s" },
      { sym: "V", means: "vapour molar flow in the rectifying section",
        unit: "mol/s" },
      { sym: "F", means: "molar flow of FEED entering the column",
        unit: "mol/s" },
      { sym: "D", means: "molar flow of distillate leaving the top",
        unit: "mol/s" },
      { sym: "x_n", means: "liquid leaving tray n in the RECTIFYING section, "
        + "trays counted down from the top" },
      { sym: "y_{n+1}", means: "vapour rising to tray n from the tray below "
        + "it.  The offset is the whole point of the balance: the vapour "
        + "arriving at a tray came from the one beneath, and it is that pair "
        + "-- not two streams on one tray -- that the operating line relates" },
      { sym: "x_m", means: "the same as x_n, in the STRIPPING section below "
        + "the feed" },
      { sym: "y_{m+1}", means: "the stripping section's counterpart to "
        + "y_{n+1}" },
      { sym: "L̄, V̄", means: "the same two flows BELOW the feed.  The bar "
        + "marks a SECTION, not an average — the feed changes both, which is "
        + "why the column needs two operating lines and not one" },
    ],
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
    derivation: [
      { step: "q is DEFINED as the heat needed to bring one mole of feed to "
          + "saturated vapour, divided by the molar latent heat.  Read off "
          + "the consequences: a saturated liquid feed needs a full latent "
          + "heat, so q = 1; a saturated vapour needs none, so q = 0; a "
          + "sub-cooled liquid needs more than one, so q > 1.", eq: "" },
      { step: "What the feed does to the internal flows follows directly "
          + "from that definition — the liquid gains the liquid FRACTION of "
          + "the feed, and the vapour loses the rest.",
        eq: "L̄ = L + q · F        V = V̄ + (1 − q) · F" },
      { step: "Subtract the two operating-line balances, one from the "
          + "other, and use the overall balance F·z_F = D·x_D + B·x_B.  "
          + "Every term in x_D and x_B cancels.",
        eq: "(V − V̄) · y = (L − L̄) · x + F · z_F" },
      { step: "Substitute the two flow relations above.  This is the q-line: "
          + "the locus of every point where the two operating lines can "
          + "meet, fixed by the feed alone and by neither product.",
        eq: "y = q/(q−1) · x − z_F/(q−1)" },
      { step: "Two readings worth having.  It passes through (z_F, z_F) for "
          + "every q, so changing the feed's thermal state ROTATES it about "
          + "that point on the diagonal; and at q = 1 the slope is "
          + "infinite, which is why a saturated-liquid feed gives a VERTICAL "
          + "q-line — the engine tests for it and handles it apart rather "
          + "than dividing by zero.  (qLine in "
          + "gui/src/case/mccabeThiele.ts carries that test.)" },
    ],
    formula: "q-line:  y = q/(q−1) · x − z_F/(q−1)",
    where: [
      { sym: "q", means: "the FEED THERMAL CONDITION — moles of liquid added "
        + "to the stripping section per mole of feed.  1 for a saturated "
        + "liquid, 0 for a saturated vapour, above 1 for a sub-cooled "
        + "liquid.  NOT the adsorbed loading that adsorption calls q: same "
        + "letter, no relation" },
      { sym: "z_F", means: "composition of the feed" },
    ],
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
    where: [
      { sym: "N", means: "number of EQUILIBRIUM stages — ideal ones; a real "
        + "column needs more" },
      { sym: "N_min", means: "the fewest stages that can make the separation, "
        + "reached at total reflux (Fenske)" },
      { sym: "R_min", means: "the smallest reflux ratio that can make it, "
        + "needing infinitely many stages" },
    ],
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
      + "step count, often by half again.  This diagram DOES carry it: the "
      + "E_MV knob pulls a pseudo-equilibrium curve down towards the "
      + "operating line and the staircase then counts actual trays.  What it "
      + "cannot do is tell you the number — E_MV is a value you supply (or "
      + "estimate, e.g. by O'Connell), never one the thermodynamics hands "
      + "you.",
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
