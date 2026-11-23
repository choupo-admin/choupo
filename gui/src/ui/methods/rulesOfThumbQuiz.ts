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
  rulesOfThumbQuiz -- the ideas the Rules-of-thumb page states in its own
  framing, and the quiz that checks them (DEV.md 4c C158).  The page carries
  no rule text by design (see RulesOfThumbTool.tsx), so these are the page's
  framing, not heuristics.  The sections are unnumbered on the page, so the
  quiz points back to them by title.
\*---------------------------------------------------------------------------*/

import type { QuizQuestion, QuizStepRef } from "./lessonQuiz.js";

export const RULES_OF_THUMB_STEPS: readonly QuizStepRef[] = [
  { n: 1, title: "A rule is a starting bet, not a verdict" },
  { n: 2, title: "Safety-critical decisions follow the standard" },
  { n: 3, title: "Falsify the rule with a run" },
  { n: 4, title: "The rules live in the guide, and nowhere else" },
];

export const RULES_OF_THUMB_QUIZ: readonly QuizQuestion[] = [
  {
    id: "starting-bet", steps: [1],
    q: "How should a rule of thumb from the Design Guide be used?",
    options: [
      "As a verdict that replaces running the case",
      "As a starting bet that buys most of the answer cheaply, to be tested by a run",
      "Only for equipment that has already been built",
      "As a number to copy into the case without reading the guide's chapter",
    ],
    correct: 1,
    feedback: "The page frames a rule as buying 80 % of the answer for "
      + "20 % of the effort, and as no substitute for the run; the "
      + "simulator is glass-box so that the bet can be tested (A rule is "
      + "a starting bet, not a verdict).",
  },
  {
    id: "safety", steps: [2],
    q: "A rule of thumb exists for sizing a pressure-relief device.  Is it "
      + "enough to follow it?",
    options: [
      "Yes, when the rule comes from a reputable guide",
      "Yes, if a simulation run confirms the result",
      "No: safety-critical decisions follow the applicable standard and competent review, never a rule of thumb",
      "Only for toxic inventories, not for flammable ones",
    ],
    correct: 2,
    feedback: "Pressure relief, fired equipment, toxic or flammable "
      + "inventories, area classification and effluent limits are named "
      + "as decisions for the controlling standard and competent review "
      + "(Safety-critical decisions follow the standard).",
  },
  {
    id: "falsify", steps: [3],
    q: "What makes a heuristic worth more than one you only memorised?",
    options: [
      "Having read it in several textbooks",
      "Having tested it in a case and seen it confirmed or refuted by the run",
      "Having a number with many significant figures",
      "Having applied it to a problem without checking the result",
    ],
    correct: 1,
    feedback: "The page's own line is that a heuristic you have "
      + "personally falsified once is worth ten you memorised: build "
      + "the case, watch the iterations, read the KPIs, confirm or "
      + "refute it (Falsify the rule with a run).",
  },
  {
    id: "single-home", steps: [4],
    q: "Why does the Rules-of-thumb page list chapter titles and open the "
      + "guide instead of showing the rules?",
    options: [
      "The rules are too long to fit on a page",
      "The rules are secret and cannot be shown in the app",
      "A second copy of the numbers could drift from the guide, and a student acts on them",
      "The page filters rules by the case that is open",
    ],
    correct: 2,
    feedback: "Transcribing rules would create a second home for numbers "
      + "a student acts on, some beside safety standards; the index is "
      + "derived from the guide and every row deep-links to its own "
      + "chapter, so nothing here can drift (The rules live in the guide, "
      + "and nowhere else).",
  },
];
