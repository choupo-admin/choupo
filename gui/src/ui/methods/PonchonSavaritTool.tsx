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
  PONCHON-SAVARIT, DERIVED -- the construction McCabe-Thiele is an
  APPROXIMATION OF.  Ordered by the owner (credo §10, 2026-08-31: "e o
  Savarit também tem de ficar").

  WHY IT BELONGS BESIDE McCABE RATHER THAN INSTEAD OF IT.  McCabe-Thiele
  buys its straight operating lines with constant molar overflow.  That
  assumption is stated on the McCabe page and, until this one, could only be
  BELIEVED: nothing in the tree let a reader see what it costs.  This
  construction carries the enthalpy, so the same column is solved without
  it, and the difference stops being a caveat and becomes a diagram.

  WHAT IS BUILT AND WHAT IS NOT, said here rather than discovered by a
  student: the ENGINE half exists (the enthalpyConcentration op publishes
  both saturation curves and the equilibrium ties; witness
  tutorials/props/scan/hxy01_ethanol_water_1atm).  The INTERACTIVE drawing
  -- difference point, lever arms, a staircase the reader drags -- is NOT
  built.  This page derives the construction and points at the data; it
  does not pretend to draw it.  A page that showed a static picture of a
  construction the reader cannot drive would be worse than one that says so.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Text, Title } from "@mantine/core";

import { LessonStepView } from "./lessonStep.js";
import type { LessonStep } from "./lessonStep.js";

const INK = "var(--mantine-color-dimmed)";

export const PONCHON_WITNESS = "props/scan/hxy01_ethanol_water_1atm";

export const PONCHON_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Put enthalpy on the vertical axis instead of vapour composition",
    body: "McCabe-Thiele plots y against x: equilibrium and material balance, "
      + "and no energy anywhere.  Ponchon-Savarit plots ENTHALPY against "
      + "composition.  Two curves appear — the saturated liquid below, the "
      + "saturated vapour above — and an equilibrium pair is a TIE LINE "
      + "joining a point on one to a point on the other.  Everything that "
      + "follows is geometry on that diagram.",
    formula: "saturated liquid:  h(x)        saturated vapour:  H(y)\n"
      + "one tie line: (x, h) —— (y, H) at the temperature they share",
    where: [
      { sym: "x", means: "mole fraction of the more volatile component in the "
        + "saturated LIQUID" },
      { sym: "y", means: "mole fraction of the same component in the vapour "
        + "in equilibrium with that liquid" },
      { sym: "h", means: "molar enthalpy of the saturated liquid",
        unit: "J/mol" },
      { sym: "H", means: "molar enthalpy of the saturated vapour",
        unit: "J/mol" },
    ],
    note: "The engine publishes exactly this and nothing more: one row per "
      + "equilibrium, carrying BOTH ends of the tie and the temperature they "
      + "share, so nothing downstream has to pair rows or interpolate one "
      + "end of a tie.",
  },
  {
    n: 2,
    title: "Two balances at once, and why that forces a straight line",
    body: "Take any envelope around the top of the column — the condenser, "
      + "the trays above the cut, and the distillate leaving.  Write BOTH "
      + "balances over it: material, and energy.",
    derivation: [
      { step: "Total, component and energy balances over the top envelope.  "
          + "Q_C is the condenser duty, negative because heat leaves.",
        eq: "V = L + D\n"
          + "V·y = L·x + D·x_D\n"
          + "V·H = L·h + D·h_D − Q_C" },
      { step: "Divide the energy balance by D and group everything that "
          + "belongs to the product.  Define ONE quantity for it — the net "
          + "enthalpy leaving the top per mole of distillate.",
        eq: "Δ_D ≡ h_D − Q_C/D" },
      { step: "Eliminate V and L between the three balances.  What survives "
          + "is a statement that three points are COLINEAR: the liquid "
          + "(x, h), the vapour (y, H), and a single point Δ at "
          + "(x_D, Δ_D) that does not move as you go from tray to tray.",
        eq: "(y, H) , (x, h) and (x_D, Δ_D) lie on one straight line" },
      { step: "That fixed point is the DIFFERENCE POINT.  It is not a state "
          + "of any stream — its enthalpy is a net flow divided by a flow, "
          + "and it usually sits far off the diagram.  It is the whole "
          + "construction: every operating line in the rectifying section "
          + "is a ray drawn FROM it.", eq: "" },
      { step: "Repeat the argument on a bottom envelope and a second "
          + "difference point appears, carrying the reboiler duty.  The feed "
          + "ties the two: Δ_D, the feed point and Δ_B are themselves "
          + "colinear, which is the overall balance drawn rather than "
          + "written.",
        eq: "Δ_B ≡ h_B − Q_R/B      and      Δ_D , (z_F, h_F) , Δ_B colinear" },
    ],
    formula: "rectifying ray:  Δ_D —— (x_n, h_n) —— (y_{n+1}, H_{n+1})",
    where: [
      { sym: "V", means: "vapour molar flow rising past the cut",
        unit: "mol/s" },
      { sym: "L", means: "liquid molar flow falling past the cut",
        unit: "mol/s" },
      { sym: "D", means: "distillate molar flow", unit: "mol/s" },
      { sym: "B", means: "bottoms molar flow", unit: "mol/s" },
      { sym: "x_D", means: "distillate composition" },
      { sym: "h_D", means: "molar enthalpy of the distillate", unit: "J/mol" },
      { sym: "h_B", means: "molar enthalpy of the bottoms", unit: "J/mol" },
      { sym: "h_F", means: "molar enthalpy of the feed, which is what makes "
        + "its thermal condition a POSITION on this diagram rather than a "
        + "separate parameter q", unit: "J/mol" },
      { sym: "z_F", means: "feed composition" },
      { sym: "Q_C", means: "condenser duty, removed from the top", unit: "W" },
      { sym: "Q_R", means: "reboiler duty, added at the bottom", unit: "W" },
      { sym: "Δ_D", means: "the difference point's enthalpy coordinate at the "
        + "top: net enthalpy leaving per mole of distillate.  NOT a stream "
        + "enthalpy — no stream in the column has it", unit: "J/mol" },
      { sym: "Δ_B", means: "the same at the bottom", unit: "J/mol" },
      { sym: "x_n", means: "liquid leaving tray n" },
      { sym: "h_n", means: "its molar enthalpy", unit: "J/mol" },
      { sym: "y_{n+1}", means: "vapour rising to tray n from below" },
      { sym: "H_{n+1}", means: "its molar enthalpy", unit: "J/mol" },
    ],
  },
  {
    n: 3,
    title: "The lever rule: flows read off the diagram with a ruler",
    body: "Because the three points are colinear, the RATIO of the flows is "
      + "the ratio of the segments — the ordinary lever rule of any "
      + "two-phase mixture, now doing the work a numerical balance does in "
      + "McCabe-Thiele.",
    derivation: [
      { step: "The internal reflux ratio at the top is a ratio of two "
          + "lengths measured on the vertical axis, between the difference "
          + "point, the vapour and the liquid.",
        eq: "L/V  =  (Δ_D − H) / (Δ_D − h)" },
      { step: "So the reflux is not a number you carry alongside the "
          + "diagram — it IS the position of Δ_D.  Pull the difference "
          + "point further from the curves and the reflux falls; push it "
          + "away to infinity and the rays become vertical, which is total "
          + "reflux and the minimum stage count.", eq: "" },
      { step: "And minimum reflux is where a ray coincides with a TIE LINE: "
          + "the two ends of the step meet and no separation is bought.  "
          + "The pinch is a geometric coincidence you can point at, not a "
          + "root-finding problem.", eq: "" },
    ],
    formula: "L/V = (Δ_D − H) / (Δ_D − h)",
    where: [],
    note: "Stepping off stages is then the same alternation as McCabe: a TIE "
      + "LINE to move from a liquid to the vapour in equilibrium with it, "
      + "then a RAY from the difference point to move to the next tray.",
  },
  {
    n: 4,
    title: "What this buys, and it is the point of the whole page",
    body: "McCabe-Thiele's operating lines are straight because of CONSTANT "
      + "MOLAR OVERFLOW: the assumption that one mole condensing releases "
      + "exactly the heat one mole needs to vaporise, so L and V never "
      + "change within a section.  Nothing on that page can show you what "
      + "the assumption costs, because the assumption is what makes the "
      + "page drawable.",
    derivation: [
      { step: "Here nothing was assumed about the latent heats.  L and V "
          + "vary from tray to tray, and that variation is carried by the "
          + "SHAPE of the two enthalpy curves — which the engine computes "
          + "from the same thermophysical system the rest of the case "
          + "declares.", eq: "" },
      { step: "Constant molar overflow is exactly the statement that the two "
          + "curves are PARALLEL STRAIGHT LINES.  Look at h(x) and H(y) for "
          + "your system: how far they are from parallel and straight is how "
          + "wrong McCabe-Thiele is for it.", eq: "" },
      { step: "For ethanol/water the curves are visibly neither, which is "
          + "why the witness uses that pair — and it is also the honest "
          + "reason a shortcut method survives: for many hydrocarbon pairs "
          + "they are very nearly both.", eq: "" },
    ],
    note: "So the two constructions are not rivals.  One is the other with "
      + "an assumption spent, and this diagram is where the assumption "
      + "becomes visible instead of remaining a sentence at the foot of a "
      + "page.",
  },
] as const;

export function PonchonSavaritTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap={14}>
        <Box>
          <Title order={3}>Ponchon-Savarit, derived</Title>
          <Text size="sm" mt={4}>
            The construction McCabe-Thiele is an approximation of.  Put
            enthalpy on the vertical axis and the energy balance stops being
            a separate calculation: it becomes a point on the diagram, and
            constant molar overflow — the assumption McCabe-Thiele spends to
            get straight lines — becomes something you can look at.
          </Text>
        </Box>

        {PONCHON_STEPS.map((s) => <LessonStepView key={s.n} step={s} />)}

        <Alert variant="light" color="orange"
          title="What is built, and what is not">
          <Text size="sm">
            The <strong>engine half exists</strong>.  The{" "}
            <Code>enthalpyConcentration</Code> op publishes both saturation
            curves and the equilibrium ties — one row per equilibrium,
            carrying both ends and the temperature they share, so nothing
            downstream pairs rows by index or interpolates one end of a tie.
            Run it:{" "}
            <Code>runCase tutorials/{PONCHON_WITNESS}</Code>.
          </Text>
          <Text size="sm" mt={6}>
            The <strong>interactive construction is not built</strong>: no
            difference point you can drag, no lever arms, no staircase on
            screen.  This page derives the method and points at the data it
            is drawn on.  A static picture of a construction the reader
            cannot drive would teach less than saying plainly that it is not
            here yet.
          </Text>
        </Alert>

        <Text size="xs" c={INK}>
          Theory: <Code>ch:ponchon</Code> in the Theory Guide.  Engine:{" "}
          <Code>src/propertyOps/EnthalpyConcentration.{"{H,cpp}"}</Code>.
        </Text>
      </Stack>
    </Box>
  );
}
