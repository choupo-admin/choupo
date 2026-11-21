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
  LinearAlgebraTool -- "Linear algebra without the pain" (DEV.md 4c C463).

  The page walks a second-year student from "why does Choupo solve a linear
  system at all" (every Newton step) to the conjugate-gradient method, in the
  order the questions arise, each hard idea first as a picture or an everyday
  image, then the symbol, then where Choupo uses it.  Eight steps, nine small
  figures on 2x2 / 3x3 numbers the student drags (LinearAlgebraFigures), and
  static sketches before each step (LinearAlgebraDiagrams), a
  glossary built from the steps' own symbol lists, a quiz and the limits.

  EVERYTHING DRAWN IS THE PAGE'S OWN ARITHMETIC (linearAlgebraMath) on toy
  matrices the page declares; the engine appears as citations, each held to
  the line it names by tests/linearAlgebraLesson.test.ts.
\*---------------------------------------------------------------------------*/

import { Box, Stack, Text, Title } from "@mantine/core";

import { LessonLimits, LessonReferences, Tex, TexText, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import {
  LA_GLOSSARY, LA_INTRO_DIAGRAMS, LA_LIMITS, LA_QUIZ, LA_STEPS, LA_STEP_DIAGRAMS,
} from "./linearAlgebraLesson.js";
import { LA_DIAGRAM_VIEWS } from "./LinearAlgebraDiagrams.js";
import {
  BowlFigure, CgFigure, EliminationFigure, FanFigure, PositiveMeansFigure, NewtonFigure, PivotFigure, StructureFigure,
  WobbleFigure,
} from "./LinearAlgebraFigures.js";

const FigureFrame = ({ title, note, children }: {
  title: string; note: string; children: JSX.Element;
}): JSX.Element => (
  <Stack gap={6} style={{ borderLeft: "3px solid var(--mantine-color-default-border)", paddingLeft: 12 }}>
    <OriginMark of="page" note={note} />
    <Title order={5}>{title}</Title>
    {children}
  </Stack>
);

const diagrams = (ids: readonly string[]): JSX.Element => (
  <Box style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
    {ids.map((id) => { const V = LA_DIAGRAM_VIEWS[id]!; return <V key={id} />; })}
  </Box>);

export function LinearAlgebraTool(): JSX.Element {
  const stepOnly = lessonStepper(LA_STEPS);
  //  The picture first: a step's sketches come before its words and symbols.
  const step = (n: number): JSX.Element => (
    <Stack gap={8}>
      <OriginMark of="page" note="a sketch drawn from SVG primitives; its numbers are this page's arithmetic" />
      {diagrams(LA_STEP_DIAGRAMS[n] ?? [])}
      {stepOnly(n)}
    </Stack>);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>Linear algebra without the pain</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You do not need to love matrices to use a simulator, but you do need to know why the
            simulator is full of them. This page starts from the one place you meet linear algebra in
            Choupo, the step every Newton iteration takes, and asks the questions in the order they
            arise: why solve at all, how, what goes wrong, what is free, and what changes when the
            problem is a minimisation. Each idea is a picture first. The symbol comes second, and where
            Choupo does it comes last. It is inspired by Shewchuk&apos;s &ldquo;An Introduction to the
            Conjugate Gradient Method Without the Agonizing Pain&rdquo;, and tries to keep the promise
            of that title from the first line.
          </Text>
          <Text size="sm" mt={6}>
            Every table below is a toy of two or three equations that you can drag. They are not Choupo
            runs; what is Choupo&apos;s is each file and line a step cites.
          </Text>
          <OriginMark of="assumption" note="the numbers you choose with the sliders and handles" />
        </Box>

        {diagrams(LA_INTRO_DIAGRAMS)}
        {step(1)}
        <FigureFrame title="Figure 1. Two rulers cross: a Newton step is a linear solve"
          note="this page's arithmetic on a circle and a hyperbola">
          <NewtonFigure />
        </FigureFrame>

        {step(2)}
        <FigureFrame title="Figure 2. Eliminate, keep the receipt, reuse it"
          note="this page's arithmetic on a 3x3 table; operation counts measured in its loops">
          <EliminationFigure />
        </FigureFrame>

        {step(3)}
        <FigureFrame title="Figure 3. The same two equations on a calculator with few digits"
          note="this page's arithmetic, rounding every operation to the digits you choose">
          <PivotFigure />
        </FigureFrame>

        {step(4)}
        <FigureFrame title="Figure 4. The wobbly table: drag the crossing"
          note="this page's arithmetic on two nearly parallel lines">
          <WobbleFigure />
        </FigureFrame>

        {step(5)}
        <FigureFrame title="Figure 5. A column's Jacobian is almost all zeros"
          note="this page's block-Thomas and dense solves of the same synthetic system, operations counted">
          <StructureFigure />
        </FigureFrame>

        {step(6)}
        <FigureFrame title="Figure 6. What 'positive' means: the number x'Ax, not the entries of A"
          note="this page's quadratic form of two 2x2 tables, over the direction you turn">
          <PositiveMeansFigure />
        </FigureFrame>
        <FigureFrame title="Figure 7. Bowl, dome, saddle, ridge: shape the table"
          note="this page's arithmetic on a symmetric 2x2 table">
          <BowlFigure />
        </FigureFrame>

        {step(7)}
        <FigureFrame title="Figure 8. Many variables: perturb the table, watch the parabolas and the pivots"
          note="this page's eigenvalues and elimination pivots of a symmetric table you perturb">
          <FanFigure />
        </FigureFrame>

        {step(8)}
        <FigureFrame title="Figure 9. A long narrow bowl: zigzag against conjugate directions"
          note="this page's steepest descent and conjugate gradient on a 2x2 bowl">
          <CgFigure />
        </FigureFrame>

        <Box>
          <Title order={4}>Glossary of every symbol</Title>
          <Text size="xs" c="dimmed">
            The same definitions each step prints under its equation, gathered once, in order of first use.
          </Text>
          <Box component="dl" mt={6}
            style={{ display: "grid", gridTemplateColumns: "minmax(80px, 140px) 1fr", gap: "4px 12px", margin: 0 }}
            data-testid="la-glossary">
            {LA_GLOSSARY.map((g) => (
              <Box key={g.sym} style={{ display: "contents" }}>
                <Box component="dt"><Tex mode="inline" src={g.sym} /></Box>
                <Box component="dd" style={{ margin: 0 }}>
                  <Text size="sm"><TexText text={g.means} /> <Text span size="xs" c="dimmed">(step {g.step})</Text></Text>
                </Box>
              </Box>))}
          </Box>
        </Box>

        <LessonQuiz title="Check your understanding" questions={LA_QUIZ} lesson={LA_STEPS} />

        <LessonLimits limits={LA_LIMITS} />

        <LessonReferences tool="linear-algebra-without-pain" />
      </Stack>
    </Box>
  );
}
