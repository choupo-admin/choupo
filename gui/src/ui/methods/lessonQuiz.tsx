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
  every EduTool that asks one (first use: `standard-state`, DEV.md 4c, C32).

  A question is DATA on the lesson module, like a LessonStep, so a test can
  hold it (six questions, every `correct` index in range, every feedback
  non-empty) and so no page draws its own quiz.  The feedback is shown for a
  wrong answer AND a right one: the point of the page is the reason, not the
  score, so a student who guessed right still reads why.
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";

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
}

export function LessonQuiz({ title, questions }: {
  title: string;
  questions: readonly QuizQuestion[];
}): JSX.Element {
  const [picked, setPicked] = useState<{ [id: string]: number }>({});
  return (
    <Box>
      <Title order={5}>{title}</Title>
      <Stack gap="sm" mt={6}>
        {questions.map((qq, i) => {
          const p = picked[qq.id];
          const answered = p !== undefined;
          const right = answered && p === qq.correct;
          return (
            <Box key={qq.id} px="sm" py={8}
              style={{ border: "1px solid var(--mantine-color-default-border)",
                borderRadius: 4 }}>
              <Text size="sm">
                <Text span c="dimmed" ff="monospace" size="xs">{i + 1}.</Text>
                {"  "}{qq.q}
              </Text>
              <Group gap="xs" mt={6}>
                {qq.options.map((o, k) => (
                  <Button key={o} size="compact-xs"
                    variant={answered && k === p ? "filled" : "light"}
                    color={!answered ? "gray" : k === qq.correct ? "teal"
                      : k === p ? "red" : "gray"}
                    onClick={() => setPicked({ ...picked, [qq.id]: k })}>
                    {o}
                  </Button>
                ))}
              </Group>
              {answered && (
                <Text size="sm" mt={6} c={right ? "teal" : "red"}>
                  <b>{right ? "Yes." : `No — ${qq.options[qq.correct]}.`}</b>{" "}
                  <Text span c="var(--mantine-color-text)">{qq.feedback}</Text>
                </Text>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
