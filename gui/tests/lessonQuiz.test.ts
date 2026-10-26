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
  lessonQuiz.test -- every EduTool ends with a learning quiz (DEV.md 4c C158).

  THE COVERAGE REQUIREMENT IS THE TABLE `QUIZZES` BELOW.  C158's first wave
  is a sample for Vitor's review: standard-state (C32) and six tools from
  six disciplines.  The other tools wait for that review, so the test does
  not yet require a quiz of every tool; it requires one of every tool in the
  table, holds each to the shape, and refuses a quiz that is drawn without
  being in the table.  When every tool has one, the requirement becomes
  "every live tool in the registry" -- the arm that would say so is (a).

    (a) every tool in the table is a LIVE tool of the registry;
    (b) every question: an id unique in its quiz, a question ending in a
        question mark, 3 to 5 distinct options (standard-state's six are
        Yes/No and are the one named exception), one `correct` in range,
        a feedback that explains (not a word), at least one step, and every
        step a step THAT LESSON HAS; a declared origin is one the tool's
        registry entry declares;
    (c) the source draws it: each quiz is rendered by exactly one
        <LessonQuiz> in the tool's own file, with the lesson it names, and
        no file draws a quiz the table does not hold;
    (d) the rendered tool shows it, every question, for the tools that
        render in the node test environment (McCabe lives inside
        MethodsWorkspace, which reaches Plotly at module scope, so (c) is
        its arm).

  WHAT THIS DOES NOT CHECK, and cannot: whether a question tests a concept
  rather than trivia, whether its distractors are the misconceptions the
  lesson warns against, whether its feedback is right, and whether a number
  in a question needed an origin.  That is the pedagogy, and it is Vitor's.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync } from "node:fs";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import type { QuizQuestion, QuizStepRef } from "../src/ui/methods/lessonQuiz.js";
import { METHOD_TOOLS, type MethodToolId } from "../src/ui/methods/registry.js";
import { STANDARD_STATE_QUIZ, STANDARD_STATE_STEPS } from "../src/ui/methods/standardStateLesson.js";
import { MCCABE_QUIZ, MCCABE_STEPS } from "../src/ui/methods/mccabeLesson.js";
import { DR_QUIZ, DR_STEPS } from "../src/ui/methods/dataReconciliationLesson.js";
import { SIMPLICITY_QUIZ, SIMPLICITY_STEPS } from "../src/ui/methods/correlationSimplicityLesson.js";
import { BUND_QUIZ, BUND_STEPS } from "../src/ui/methods/bundLesson.js";
import { LADDER_QUIZ, LADDER_SECTIONS } from "../src/ui/methods/reactorLadderLesson.js";
import { FEL_QUIZ, FEL_STEPS } from "../src/ui/methods/frontEndLoadingLesson.js";
import { IP_QUIZ, IP_STEPS } from "../src/ui/methods/ipStrategyLesson.js";
import { StandardStateTool } from "../src/ui/methods/StandardStateTool.js";
import { DataReconciliationTool } from "../src/ui/methods/DataReconciliationTool.js";
import { CorrelationSimplicityTool } from "../src/ui/methods/CorrelationSimplicityTool.js";
import { BundTool } from "../src/ui/methods/BundTool.js";
import { ReactorLadderTool } from "../src/ui/methods/ReactorLadderTool.js";
import { FrontEndLoadingTool } from "../src/ui/methods/FrontEndLoadingTool.js";
import { IpStrategyTool } from "../src/ui/methods/IpStrategyTool.js";

const GUI = new URL("../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, GUI), "utf-8");

interface QuizEntry {
  quiz: readonly QuizQuestion[];
  quizName: string;
  lesson: readonly QuizStepRef[];
  lessonName: string;
  /** The file (under gui/) that draws the quiz. */
  file: string;
  /** The tool's component, when it renders in the node environment. */
  tool?: FunctionComponent;
  /** A named exception to the 3-5 options rule. */
  minOptions?: { n: number; why: string };
}

/** THE COVERAGE REQUIREMENT: the tools that must end with a quiz. */
const QUIZZES: Partial<Record<MethodToolId, QuizEntry>> = {
  "standard-state": {
    quiz: STANDARD_STATE_QUIZ, quizName: "STANDARD_STATE_QUIZ",
    lesson: STANDARD_STATE_STEPS, lessonName: "STANDARD_STATE_STEPS",
    file: "src/ui/methods/StandardStateTool.tsx", tool: StandardStateTool,
    minOptions: { n: 2, why: "C32's six questions are Yes/No, as the brief asked" },
  },
  mccabe: {
    quiz: MCCABE_QUIZ, quizName: "MCCABE_QUIZ",
    lesson: MCCABE_STEPS, lessonName: "MCCABE_STEPS",
    file: "src/ui/MethodsWorkspace.tsx",
  },
  "data-reconciliation": {
    quiz: DR_QUIZ, quizName: "DR_QUIZ", lesson: DR_STEPS, lessonName: "DR_STEPS",
    file: "src/ui/methods/DataReconciliationTool.tsx", tool: DataReconciliationTool,
  },
  "correlation-simplicity": {
    quiz: SIMPLICITY_QUIZ, quizName: "SIMPLICITY_QUIZ",
    lesson: SIMPLICITY_STEPS, lessonName: "SIMPLICITY_STEPS",
    file: "src/ui/methods/CorrelationSimplicityTool.tsx", tool: CorrelationSimplicityTool,
  },
  bund: {
    quiz: BUND_QUIZ, quizName: "BUND_QUIZ", lesson: BUND_STEPS, lessonName: "BUND_STEPS",
    file: "src/ui/methods/BundTool.tsx", tool: BundTool,
  },
  "reactor-ladder": {
    quiz: LADDER_QUIZ, quizName: "LADDER_QUIZ",
    lesson: LADDER_SECTIONS, lessonName: "LADDER_SECTIONS",
    file: "src/ui/methods/ReactorLadderTool.tsx", tool: ReactorLadderTool,
  },
  "front-end-loading": {
    quiz: FEL_QUIZ, quizName: "FEL_QUIZ", lesson: FEL_STEPS, lessonName: "FEL_STEPS",
    file: "src/ui/methods/FrontEndLoadingTool.tsx", tool: FrontEndLoadingTool,
  },
  "ip-strategy": {
    quiz: IP_QUIZ, quizName: "IP_QUIZ", lesson: IP_STEPS, lessonName: "IP_STEPS",
    file: "src/ui/methods/IpStrategyTool.tsx", tool: IpStrategyTool,
  },
};

const live = METHOD_TOOLS.filter((t) => t.status === "live");
const quizzed = live.filter((t) => QUIZZES[t.id] !== undefined);

describe("the quiz coverage (C158)", () => {
  it("(a) every tool the table requires is a live tool of the registry", () => {
    const ids = new Set(live.map((t) => t.id));
    for (const id of Object.keys(QUIZZES)) expect(ids.has(id as MethodToolId), id).toBe(true);
    expect(quizzed.length).toBe(Object.keys(QUIZZES).length);
    expect(quizzed.length).toBeGreaterThanOrEqual(7);
  });
});

describe.each(quizzed.map((t) => [t.id, t] as const))("%s: its quiz", (id, t) => {
  const e = QUIZZES[id]!;
  it("(b) has the shape, and every step it names is a step of its lesson", () => {
    expect(e.quiz.length, "about five questions").toBeGreaterThanOrEqual(4);
    expect(e.quiz.length, "about five questions").toBeLessThanOrEqual(7);
    expect(new Set(e.quiz.map((q) => q.id)).size).toBe(e.quiz.length);
    const steps = new Set(e.lesson.map((s) => s.n));
    const lo = e.minOptions?.n ?? 3;
    for (const q of e.quiz) {
      expect(q.q.trim().endsWith("?"), q.id).toBe(true);
      expect(q.options.length, `${q.id}: options`).toBeGreaterThanOrEqual(lo);
      expect(q.options.length, `${q.id}: options`).toBeLessThanOrEqual(5);
      expect(new Set(q.options).size, `${q.id}: repeated option`).toBe(q.options.length);
      expect(Number.isInteger(q.correct), q.id).toBe(true);
      expect(q.correct, q.id).toBeGreaterThanOrEqual(0);
      expect(q.correct, q.id).toBeLessThan(q.options.length);
      expect(q.feedback.trim().length, `${q.id}: feedback`).toBeGreaterThan(40);
      expect(q.steps.length, `${q.id}: names no step`).toBeGreaterThan(0);
      for (const n of q.steps) expect(steps.has(n), `${q.id}: step ${n} is not in the lesson`).toBe(true);
      for (const k of q.origins ?? [])
        expect(t.origins as readonly string[], `${q.id}: origin "${k}" the tool does not declare`)
          .toContain(k);
    }
  });
  it("(c) is drawn by its own tool, with its own lesson", () => {
    const src = read(e.file);
    const calls = [...src.matchAll(/<LessonQuiz\b[^>]*?questions=\{(\w+)\}[^>]*?lesson=\{(\w+)\}/gs)];
    const mine = calls.filter((c) => c[1] === e.quizName);
    expect(mine.length, `${e.file} draws ${e.quizName}`).toBe(1);
    expect(mine[0]?.[2]).toBe(e.lessonName);
  });
  if (e.tool) {
    it("(d) the rendered tool shows every question", () => {
      const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(e.tool!)));
      expect(html).toContain("data-lesson-quiz");
      for (const q of e.quiz) expect(html, q.id).toContain(`data-quiz-question="${q.id}"`);
    });
  }
});

describe("no quiz outside the table", () => {
  it("(c) every <LessonQuiz> in the GUI draws a quiz the table holds", () => {
    const files = ["src/ui/MethodsWorkspace.tsx",
      ...readdirSync(new URL("src/ui/methods/", GUI))
        .filter((f) => f.endsWith(".tsx") && f !== "lessonQuiz.tsx")
        .map((f) => `src/ui/methods/${f}`)];
    const known = new Set(Object.values(QUIZZES).map((e) => e!.quizName));
    let seen = 0;
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/<LessonQuiz\b[^>]*?questions=\{(\w+)\}/gs)) {
        seen++;
        expect(known.has(m[1] ?? ""), `${f} draws ${m[1]}, which no QUIZZES entry holds`).toBe(true);
      }
      //  A quiz drawn any other way would escape the table.
      expect((src.match(/<LessonQuiz\b/g) ?? []).length, f)
        .toBe([...src.matchAll(/<LessonQuiz\b[^>]*?questions=\{\w+\}/gs)].length);
    }
    expect(seen).toBe(Object.keys(QUIZZES).length);
  });
});
