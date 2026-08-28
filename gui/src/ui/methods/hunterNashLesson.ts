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
  The liquid-liquid extraction lesson, as DATA.

  FIFTH in the sequence, and the one where the picture changes shape.  The
  flash, McCabe, Kremser and the batch still all lived in an x-y plane,
  because two components mean ONE independent composition.  Extraction has
  three, so the diagram becomes a triangle -- and the operating line, which
  has been a line in every tool so far, becomes a PENCIL of lines through a
  single point that is usually off the page.

  That last part is where students lose their footing, so it gets its own
  step and its own reassurance: the difference point is a NET FLOW, not a
  mixture, and a net flow has every right to lie outside a diagram of
  mixtures.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const HUNTER_NASH_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Three components, so the diagram grows a dimension",
    body: "Everything so far has been binary, and a binary mixture needs one "
      + "number: give x and the other component is 1 − x.  Extraction has "
      + "three — the carrier you are taking the solute OUT of, the solute, "
      + "and the solvent you are taking it INTO — so a composition needs two "
      + "numbers, and the diagram becomes a triangle.  Each corner is a pure "
      + "component; each point inside is a whole mixture; and distance from a "
      + "side is how much of the opposite corner it contains.",
    note: "The x-y square has not been abandoned, it has been outgrown.  "
      + "Everything you know still applies — it just applies in a plane "
      + "instead of on a line.",
  },
  {
    n: 2,
    title: "Mixing is a straight line, and it is the lever rule again",
    body: "Add two streams together and the product sits ON the straight line "
      + "joining them — always, because a mixture's composition is the "
      + "flow-weighted average of what went in.  Where on that line is fixed "
      + "by the flows, and the arithmetic is exactly the lever rule you read "
      + "off the flash: the mixing point sits closer to the bigger stream.",
    formula: "M = F + S        FM / MS = S / F",
    note: "That is the whole of the material balance in this diagram: a "
      + "SUM lies between its parts, on the line joining them.",
  },
  {
    n: 3,
    title: "Tie lines are what equilibrium says, and they are not parallel",
    body: "Inside the two-phase region a mixture cannot exist as one liquid: "
      + "it splits into an extract, rich in solvent, and a raffinate, rich in "
      + "carrier.  The line joining those two is a TIE LINE, and the mixture "
      + "sits on it — again by the lever rule.  Unlike the vapour-liquid case "
      + "there is no single curve to read them off: the tie lines have their "
      + "own slopes, they rotate across the region, and they SHRINK TO A "
      + "POINT at the plait point, where the two liquids become one.",
    note: "This is why an extraction diagram is drawn from measured or "
      + "computed tie lines rather than from a correlation. The tool draws "
      + "the ones the engine solved, and says so — a tie line at a "
      + "composition nobody computed is not on the diagram.",
  },
  {
    n: 4,
    title: "The operating line becomes a point — and it is usually off the page",
    body: "In a countercurrent cascade the material balance still holds "
      + "everywhere, but it no longer gives ONE line.  Rearranged, it says "
      + "that the NET flow crossing any section of the cascade is the same: "
      + "feed minus the extract leaving the top equals the raffinate leaving "
      + "the bottom minus the solvent entering it.  Call that Δ.  Every "
      + "operating line in the construction passes through it, so the pencil "
      + "of lines through Δ plays the part the single operating line played "
      + "in McCabe.",
    formula: "Δ = F − E₁ = R_N − S",
    note: "AND IT IS OFTEN OUTSIDE THE TRIANGLE, which alarms every student "
      + "who meets it and is entirely correct.  Δ is a DIFFERENCE of flows, "
      + "not a mixture, and a difference has no obligation to be a "
      + "composition. A negative amount of something is exactly what a net "
      + "flow in the other direction looks like.",
  },
  {
    n: 5,
    title: "Then it is the same alternation you already know",
    body: "Equilibrium, then balance, then equilibrium again.  A tie line "
      + "carries you from a raffinate to the extract in equilibrium with it; "
      + "a line through Δ carries you from that extract to the raffinate of "
      + "the next stage.  Alternate, and you have walked the cascade — the "
      + "McCabe staircase, on a triangle, with the operating line replaced by "
      + "the pencil through the difference point.",
  },
];

export const HUNTER_NASH_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "ternary",
    title: "TERNARY only. Four components have no triangle to live in.",
    body: "The whole construction depends on two independent compositions "
      + "fitting in a plane. A fourth component needs a tetrahedron, and real "
      + "extraction systems — a solvent that is itself a mixture, a second "
      + "solute — routinely have more. Those are solved as equations, not "
      + "drawn.",
  },
  {
    id: "no-binodal",
    title: "The binodal CURVE is not drawn, because nothing publishes one.",
    body: "The engine publishes tie-line ENDS and a node classification, not "
      + "a curve through them. Drawing a smooth binodal would be this view "
      + "inventing the boundary of the two-phase region, which is a physical "
      + "claim and not a drawing decision. The plait point and the spinodal "
      + "are absent for the same reason.",
  },
  {
    id: "engine-stages",
    title: "The staircase walks the ENGINE's stages, not a graphical count.",
    body: "A graphical stage count needs the tie line through a composition "
      + "the solver was never asked about, and no engine surface returns one "
      + "yet. So this draws the cascade the engine actually converged, stage "
      + "by stage. That is a smaller claim than a textbook construction "
      + "makes, and it is the one that is true here.",
  },
  {
    id: "isothermal",
    title: "One temperature, and mutual solubility that does not move.",
    body: "The tie lines are computed at the declared temperature. Real "
      + "extraction is run over a temperature range, the two-phase region "
      + "changes shape with it, and a system can lose its plait point "
      + "entirely — which is a design variable and is not on this diagram.",
  },
];
