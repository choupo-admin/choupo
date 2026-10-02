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
  LimitingReactantTool -- the limiting reactant and the feed ratio in a
  recycle loop (registry id `limiting-reactant`; DEV.md 4c, C30).

  THE TOOL'S ONE PIECE OF ARITHMETIC is the closed form of step 3, in
  `purgeLoop` below: a reactor converting X of A, a perfect product
  separation, and a purge taking a fraction p of the unreacted gas in the
  loop's own proportion.  No engine run: the point of the page is a balance a
  student can do on paper, and the engine's version of it -- with a SELECTIVE
  loss -- is the green ammonia case measured in step 4.
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import { Alert, Badge, Box, Group, Stack, Text, Title } from "@mantine/core";

import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LIMITING_LIMITS, LIMITING_STEPS } from "./limitingReactantLesson.js";

/** The purge loop of step 3, per unit fresh feed of A.  Returns null when no
 *  steady state exists at this conversion (the fresh feed is so short of B
 *  that the reactor would need more B than reaches it). */
export interface PurgeLoopResult {
  /** D = X + p (1 - X): the fraction of the A entering that leaves per pass. */
  D: number;
  /** Reactor-inlet ratio B/A. */
  rIn: number;
  /** A entering the reactor per unit fresh A (= 1/D). */
  aInPerFresh: number;
  /** B recirculated per B consumed (step 6's rho_B). */
  rhoB: number;
  /** Fraction of the fresh B lost in the purge. */
  bLostFraction: number;
}

export function purgeLoop(nu: number, eps: number, X: number, p: number):
  PurgeLoopResult | null {
  if (!(nu > 0) || !(X > 0) || X > 1 || !(p > 0) || p > 1) return null;
  const D = X + p * (1 - X);
  //  Step 3's bound: the B left after the reactor cannot be negative.
  if (eps < -(p * (1 - X)) / D - 1e-15) return null;
  const rIn = nu * (1 + (eps * D) / p);
  const aIn = 1 / D;
  const bIn = rIn * aIn;                 // per unit fresh A
  const bConsumed = nu * X * aIn;
  const bLeft = bIn - bConsumed;
  const rhoB = bLeft / bConsumed;
  const bFresh = nu * (1 + eps);
  const bLostFraction = (p * bLeft) / bFresh;
  return { D, rIn, aInPerFresh: aIn, rhoB, bLostFraction };
}

/** The purge slider is logarithmic: a purge is kept SMALL, and the effect the
 *  page is about lives between 0.1 % and a few per cent. */
export function purgeFromSlider(s: number): number {
  return Math.pow(10, s);
}

function fmt(v: number, d: number): string {
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}

export function LimitingReactantTool(): JSX.Element {
  const nu = 3;                            // N2 + 3 H2 -> 2 NH3, A = N2
  const [X, setX] = useState(0.355);
  const [logP, setLogP] = useState(-2.7);   // p = 0.2 %
  const [epsPpm, setEpsPpm] = useState(100);   // parts per million
  const p = purgeFromSlider(logP);
  const eps = epsPpm * 1e-6;
  const r = purgeLoop(nu, eps, X, p);
  const step = lessonStepper(LIMITING_STEPS);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>
            The limiting reactant and the feed ratio in a recycle loop
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Choosing the limiting reactant and the molar ratio looks like two
            free variables. In a plant with a recycle the balance fixes one,
            the loop fixes another, and what is left to choose is a single
            variable with named reasons behind it.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}

        <Box>
          <Title order={5}>Now move it</Title>
          <Text size="sm" mt={4}>
            The purge loop of step 3 with the ammonia stoichiometry (A = N₂,
            B = H₂, three moles of B per mole of A). Start where the green
            ammonia case sits — a 0.2 % purge, 35.5 % conversion per pass,
            100 ppm of excess hydrogen in the fresh feed — then shrink the
            purge and watch what a fresh-feed error of one part in ten
            thousand does to the reactor inlet.
          </Text>
          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 260px) 1fr",
          }}>
            <Stack gap={8}>
              <KnobSlider
                knob={{ id: "X", label: "per-pass conversion of A, X",
                  min: 0.05, max: 0.95, step: 0.005, unit: "",
                  why: "The fraction of the A entering the reactor that "
                    + "reacts on one pass." }}
                value={X} onChange={setX} showWhy />
              <KnobSlider
                knob={{ id: "logp", label: "purge fraction, log10 p",
                  min: -4, max: -0.7, step: 0.05, unit: "",
                  why: "The fraction of the unreacted gas thrown away before "
                    + "the rest is recycled.  Logarithmic, because a purge is "
                    + "kept small." }}
                value={logP} onChange={setLogP} showWhy />
              <KnobSlider
                knob={{ id: "eps", label: "fresh-feed excess of B, ε [ppm]",
                  min: -2000, max: 2000, step: 10, unit: "",
                  why: "How far the fresh feed is from the stoichiometric "
                    + "ratio, in parts per million.  The ammonia case's "
                    + "argon puts it at about +100." }}
                value={epsPpm} onChange={setEpsPpm} showWhy />
              <PanelNote>
                Computed here, in your browser, from the closed form of step
                3 — no engine run. The selective loss of step 4 is not in it.
              </PanelNote>
            </Stack>
            <Box style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="wrap" mb={8}>
                <Badge variant="light" color="gray">p = {fmt(p * 100, 3)} %</Badge>
                <Badge variant="light" color="gray">
                  fresh ratio = {fmt(nu * (1 + eps), 5)}
                </Badge>
              </Group>
              {r === null ? (
                <Alert color="red" variant="light"
                  title="No steady state at this conversion">
                  The fresh feed is so short of B that, with this purge, the
                  reactor would need more B than reaches it. B accumulates as a
                  deficit pass after pass: the loop cannot hold this
                  conversion. Raise ε, raise the purge, or lower X — step 3's
                  bound.
                </Alert>
              ) : (
                <>
                  <Text size="sm">
                    Reactor-inlet ratio r<sub>in</sub> ={" "}
                    <b>{fmt(r.rIn, 4)}</b> against a stoichiometric {nu}.
                  </Text>
                  <Text size="sm" mt={4}>
                    A reaches the reactor at <b>{fmt(r.aInPerFresh, 2)}</b>{" "}
                    times the fresh feed of A (D = {fmt(r.D, 4)}).
                  </Text>
                  <Text size="sm" mt={4}>
                    B recirculated per B consumed, ρ<sub>B</sub> ={" "}
                    <b>{fmt(r.rhoB, 2)}</b>.
                  </Text>
                  <Text size="sm" mt={4}>
                    Fresh B thrown away in the purge:{" "}
                    <b>{fmt(r.bLostFraction * 100, 3)} %</b>.
                  </Text>
                </>
              )}
            </Box>
          </Box>
        </Box>

        {step(4)}
        {step(5)}
        {step(6)}

        <LessonLimits limits={LIMITING_LIMITS} />
      </Stack>
    </Box>
  );
}
