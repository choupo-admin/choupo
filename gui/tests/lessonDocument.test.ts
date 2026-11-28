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
  lessonDocument -- the one chapter renderer (C535 S1): fixed h4 titles in a
  fixed order, ascending steps, quiz, limits and references placed by the
  renderer, an empty section drawing no heading.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { LessonDocument, type LessonDoc } from "../src/ui/methods/lessonDocument.js";
import { WhyDidItNotDryTool } from "../src/ui/methods/WhyDidItNotDryTool.js";
import { WHY_LIMITS, WHY_QUIZ, WHY_STEPS } from "../src/ui/methods/whyDidItNotDryLesson.js";

const wrap = (c: () => JSX.Element): string =>
  renderToStaticMarkup(createElement(MantineProvider, null, createElement(c)));
const h4s = (html: string): string[] =>
  [...html.matchAll(/<h4[^>]*>(.*?)<\/h4>/g)].map((m) => m[1]!);

describe("LessonDocument on the diagnose chapter", () => {
  const html = wrap(WhyDidItNotDryTool);

  it("draws the h4 titles in the fixed order", () => {
    expect(h4s(html)).toEqual([
      "The question", "Try it with the engine", "What you see", "Why it goes wrong",
      "Check yourself", "Limits and sources",
    ]);
  });

  it("numbers the steps in ascending order", () => {
    const ns = [...html.matchAll(/<h5[^>]*>(\d+) · /g)].map((m) => Number(m[1]));
    expect(ns).toEqual([1, 2, 3, 4]);
  });

  it("places the quiz, the limits and the references", () => {
    expect(html).toContain("Check your understanding");
    expect(html).toContain("data-lesson-limits");
    expect(html).toContain("data-lesson-references");
    expect(WHY_QUIZ.length).toBeGreaterThan(0);
    expect(WHY_LIMITS.length).toBeGreaterThan(0);
  });
});

describe("LessonDocument omits an empty section", () => {
  it("draws no heading for a section without pieces", () => {
    const doc: LessonDoc = {
      title: "T", question: "Q", steps: WHY_STEPS, quiz: [], limits: [],
      sections: {
        question: [{ kind: "step", n: 1 }], try: [], see: [], why: [{ kind: "step", n: 4 }],
      },
    };
    const html = wrap(() => createElement(LessonDocument, { tool: "why-did-it-not-dry", doc }));
    expect(h4s(html)).toEqual(["The question", "Why it goes wrong", "Limits and sources"]);
    expect(html).not.toContain("Check yourself");
  });
});
