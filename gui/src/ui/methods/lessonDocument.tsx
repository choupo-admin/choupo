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
  LessonDocument -- the ONE renderer of an EduTool chapter (C535, slice S1).

  A chapter builds a LessonDoc (its hooks and interactive cards stay in its
  own component) and hands it here.  The renderer draws, always in this order:
  the scroll container, the title and the question, then h4 sections with
  FIXED titles ("The question", "Try it with the engine", "What you see",
  "Why it goes wrong", "Check yourself", "Limits and sources").  A section
  with nothing in it is omitted; the quiz, the limits and the references are
  placed by this file only.  It wraps LessonStepView, LessonQuiz,
  LessonLimits and LessonReferences; it re-implements none of them.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { Box, Stack, Text, Title } from "@mantine/core";

import { LessonQuiz, type QuizQuestion } from "./lessonQuiz.js";
import {
  LessonLimits, LessonReferences, LessonStepView, type LessonLimit, type LessonStep,
} from "./lessonStep.js";
import type { MethodToolId } from "./registry.js";

export type SectionId = "question" | "try" | "see" | "why";

export type Piece =
  | { kind: "step"; n: number }               // LessonStepView over doc.steps
  | { kind: "heading"; title: string }        // unnumbered h5 (keeps old chapter keys)
  | { kind: "bench"; node: ReactNode };       // an interactive card the chapter built

export interface LessonDoc {
  title: string;
  question: string;
  steps: readonly LessonStep[];
  quiz: readonly QuizQuestion[];
  limits: readonly LessonLimit[];
  sections: Readonly<Record<SectionId, readonly Piece[]>>;
}

/** Fixed titles, fixed order: the reader learns one skeleton. */
const SECTION_TITLES: readonly { id: SectionId; title: string }[] = [
  { id: "question", title: "The question" },
  { id: "try", title: "Try it with the engine" },
  { id: "see", title: "What you see" },
  { id: "why", title: "Why it goes wrong" },
];

function drawPiece(doc: LessonDoc, p: Piece, i: number): ReactNode {
  if (p.kind === "heading") return <Title key={`h${i}`} order={5}>{p.title}</Title>;
  if (p.kind === "bench") return <Box key={`b${i}`}>{p.node}</Box>;
  const st = doc.steps.find((s) => s.n === p.n);
  // A step the chapter does not have loses a paragraph, never the page.
  return st ? <LessonStepView key={`s${p.n}`} step={st} /> : null;
}

export function LessonDocument(
  { tool, doc, alerts }: { tool: MethodToolId; doc: LessonDoc; alerts?: ReactNode },
): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>{doc.title}</Title>
          <Text size="sm" c="dimmed" mt={4}>{doc.question}</Text>
        </Box>
        {alerts}
        {SECTION_TITLES.map(({ id, title }) => {
          const pieces = doc.sections[id];
          if (pieces.length === 0) return null;
          return (
            <Stack key={id} gap="md" data-lesson-section={id}>
              <Title order={4}>{title}</Title>
              {pieces.map((p, i) => drawPiece(doc, p, i))}
            </Stack>
          );
        })}
        {doc.quiz.length > 0 && (
          <Stack gap="md" data-lesson-section="check">
            <Title order={4}>Check yourself</Title>
            <LessonQuiz title="Check your understanding" questions={doc.quiz} lesson={doc.steps} />
          </Stack>
        )}
        <Stack gap="md" data-lesson-section="limits">
          <Title order={4}>Limits and sources</Title>
          {doc.limits.length > 0 && <LessonLimits limits={doc.limits} title="What this does not show" />}
          <LessonReferences tool={tool} />
        </Stack>
      </Stack>
    </Box>
  );
}
