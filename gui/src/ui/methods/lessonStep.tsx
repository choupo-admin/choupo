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
  ONE numbered lesson step, and ONE place that draws it.

  WHY THIS FILE EXISTS.  Seventeen EduTools each carried their own copy of a
  nine-line step renderer, and sixteen lesson modules each declared their own
  identical `export interface LessonStep`.  Measured before this was written:
  the seventeen copies had already drifted into SEVEN distinct variants -- nine
  identical, two pairs, four one-offs -- which is what copy-paste does to a
  thing nobody owns.  The cost was not the duplication itself; it was that any
  change to how a step is PRESENTED cost seventeen edits, so no such change was
  ever made.

  WHAT THAT COST, concretely, and it is why this file exists NOW.  The owner
  read the tools and asked whether a student would know what the symbols in
  the equations mean.  Measured across the sixteen lesson modules: 133 symbol
  uses where the LETTER never appears outside a formula.  Some are harmless
  (Kremser writes `Y = y/(1−y)` and says in words what a mole ratio is, so the
  letter is bound even though a text search cannot see it); some are not
  (`ε ∂c_i/∂t + ρ_b ∂q_i/∂t` opens the breakthrough lesson, and the words
  "porosity" and "bulk density" appear nowhere in that file).  A student meets
  a Greek letter with nothing to attach it to.

  THE REMEDY IS A FIELD, NOT A PROSE PASS.  Definitions scattered through
  paragraphs are exactly the kind of thing that rots with nothing failing --
  this project's standing complaint about prose.  A structured `where` list is
  CHECKABLE: check_lesson_symbols asserts that every symbol appearing in a
  formula is glossed in that step or an earlier one.  What that gate cannot
  check, and says so about itself, is whether a definition is any GOOD.
\*---------------------------------------------------------------------------*/

import { Box, Text, Title } from "@mantine/core";

/** One symbol, bound to the words it stands for.
 *
 *  `unit` is optional because not every symbol has one -- a mole fraction, an
 *  effectiveness and a Lewis number are dimensionless, and writing "[-]"
 *  everywhere trains a reader to skip the column.  A symbol that DOES carry a
 *  unit should say so: half of what a student needs from a definition is
 *  which quantity it is, and the other half is what it is measured in. */
export interface SymbolGloss {
  sym: string;
  means: string;
  unit?: string;
}

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  /** Every symbol the formula uses, in the order it uses them.  Omitted only
   *  where the step has no formula; a formula with unglossed symbols is a
   *  gate failure, waived by name in the debt registry while the debt lasts. */
  where?: readonly SymbolGloss[];
  note?: string;
}

/** A limit: something the construction cannot show, named rather than implied. */
export interface LessonLimit { id: string; title: string; body: string; }

const BORDER = "var(--mantine-color-default-border)";

/** Draw one step.  Every EduTool calls THIS; none of them draws its own. */
export function LessonStepView({ step }: { step: LessonStep }): JSX.Element {
  return (
    <Box>
      <Title order={5}>{step.n} · {step.title}</Title>
      <Text size="sm" mt={4}>{step.body}</Text>
      {step.formula && (
        <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${BORDER}` }}>
          <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {step.formula}
          </Text>
          {step.where && step.where.length > 0 && (
            <Box mt={8}>
              {step.where.map((g) => (
                <Text key={g.sym} size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                  <Text span ff="monospace" size="xs" fw={600}>{g.sym}</Text>
                  {"  "}{g.means}
                  {g.unit ? <Text span c="dimmed"> [{g.unit}]</Text> : null}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}
      {step.note && <Text size="sm" c="dimmed">{step.note}</Text>}
    </Box>
  );
}

/** The renderer every tool used to define for itself: find step `n` in the
 *  module's own list and draw it, or draw nothing if there is no such step.
 *  Returning null rather than throwing is deliberate -- a page that asks for
 *  a step it does not have should lose a paragraph, not the whole tool. */
export function lessonStepper(
  steps: readonly LessonStep[],
): (n: number) => JSX.Element | null {
  return (n: number) => {
    const st = steps.find((s) => s.n === n);
    return st ? <LessonStepView key={n} step={st} /> : null;
  };
}

/** The limits block, drawn the same way everywhere for the same reason. */
export function LessonLimits(
  { limits, title = "What this does not show" }:
  { limits: readonly LessonLimit[]; title?: string },
): JSX.Element {
  return (
    <Box>
      <Title order={5}>{title}</Title>
      <Box mt={6}>
        {limits.map((l) => (
          <Box key={l.id} mb={8}>
            <Text size="sm" fw={600}>{l.title}</Text>
            <Text size="sm" c="dimmed">{l.body}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
