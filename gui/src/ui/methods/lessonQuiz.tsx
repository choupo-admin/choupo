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
  lessonQuiz -- a short set of questions with explanatory feedback, shared by
  every EduTool that asks one (first use: `standard-state`, DEV.md 4c, C32;
  every tool, C158).

  A question is DATA on the lesson module, like a LessonStep, so a test can
  hold it and so no page draws its own quiz.  The feedback is shown for a
  wrong answer AND a right one: the point of the page is the reason, not the
  score, so a student who guessed right still reads why.

  EVERY QUESTION NAMES THE STEPS IT TESTS (C158).  `steps` holds the
  lesson's own step numbers -- `LessonStep.n`, or the section number of a
  lesson built of sections -- and the quiz is handed that lesson's list, so
  the pointer it draws under the feedback is the step's OWN title, read from
  the one place the step is defined.  A title typed into the question would
  be a second home for it.  tests/lessonQuiz.test.ts holds every `steps`
  entry to a step that exists.

  A NUMBER IN A QUESTION SAYS WHERE IT CAME FROM (C158, in C112's words:
  engine / page / reference / assumption).  `origins` is drawn as the same
  OriginMark the result panels carry, and the test holds it to the tool's
  registry origins, so a quiz cannot claim an origin its page does not
  draw.  WHETHER a question needs one is the author's judgement and is NOT
  checked: a definition (q = 1 is a saturated liquid) is not a result, and
  no test can tell the two apart.

  Options that are sentences are drawn one per line, full width and
  wrapped; short ones (Yes / No) stay on one row.
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";

import { OriginMark } from "./origin.js";
import type { OriginKind } from "./originKinds.js";

export interface QuizQuestion {
  id: string;
  /** The question, as a sentence ending in a question mark. */
  q: string;
  /** The answers offered, in display order. */
  options: readonly string[];
  /** Index into `options` of the right one. */
  correct: number;
  /** Why -- shown whatever was chosen. */
  feedback: string;
  /** The lesson steps this question tests (their `n`), at least one. */
  steps: readonly number[];
  /** Where a number the question quotes came from (C112's words). */
  origins?: readonly OriginKind[];
}

/** What the quiz needs to know about the lesson it closes: each step's
 *  number and title, so a question can point back to the step by name. */
export interface QuizStepRef {
  n: number;
  title: string;
}

/** An option this long reads as a sentence and is drawn on a line of its own. */
const SENTENCE_OPTION = 28;

export function LessonQuiz({ title, questions, lesson, numbered = true }: {
  title: string;
  questions: readonly QuizQuestion[];
  /** The lesson's steps (or sections), in which `steps` are looked up. */
  lesson: readonly QuizStepRef[];
  /** Does the page print the step's number in its heading?  A lesson of
   *  unnumbered sections points back by the title alone. */
  numbered?: boolean;
}): JSX.Element {
  const [picked, setPicked] = useState<{ [id: string]: number }>({});
  const titleOf = (n: number): string => {
    const s = lesson.find((x) => x.n === n);
    if (!s) return `${n}`;
    return numbered ? `${n} · ${s.title}` : s.title;
  };
  return (
    <Box data-lesson-quiz="">
      <Title order={5}>{title}</Title>
      <Stack gap="sm" mt={6}>
        {questions.map((qq, i) => {
          const p = picked[qq.id];
          const answered = p !== undefined;
          const right = answered && p === qq.correct;
          const sentences = qq.options.some((o) => o.length > SENTENCE_OPTION);
          const buttons = qq.options.map((o, k) => (
            <Button key={o} size="compact-xs"
              fullWidth={sentences} justify={sentences ? "flex-start" : undefined}
              styles={sentences ? {
                root: { height: "auto", paddingTop: 4, paddingBottom: 4 },
                label: { whiteSpace: "normal", textAlign: "left", lineHeight: 1.35 },
              } : undefined}
              variant={answered && k === p ? "filled" : "light"}
              color={!answered ? "gray" : k === qq.correct ? "teal"
                : k === p ? "red" : "gray"}
              onClick={() => setPicked({ ...picked, [qq.id]: k })}>
              {o}
            </Button>
          ));
          return (
            <Box key={qq.id} px="sm" py={8} data-quiz-question={qq.id}
              style={{ border: "1px solid var(--mantine-color-default-border)",
                borderRadius: 4 }}>
              <Text size="sm">
                <Text span c="dimmed" ff="monospace" size="xs">{i + 1}.</Text>
                {"  "}{qq.q}
              </Text>
              {qq.origins && qq.origins.length > 0 && (
                <Box mt={2}><OriginMark of={qq.origins} /></Box>
              )}
              {sentences
                ? <Stack gap={4} mt={6}>{buttons}</Stack>
                : <Group gap="xs" mt={6}>{buttons}</Group>}
              {answered && (
                <>
                  <Text size="sm" mt={6} c={right ? "teal" : "red"}>
                    <b>{right ? "Yes." : `No — ${qq.options[qq.correct]}.`}</b>{" "}
                    <Text span c="var(--mantine-color-text)">{qq.feedback}</Text>
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {"Back to: "}
                    {qq.steps.map(titleOf).join("; ")}
                  </Text>
                </>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
