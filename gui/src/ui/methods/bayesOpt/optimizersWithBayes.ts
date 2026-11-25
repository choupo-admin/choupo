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
  The `optimizers` lesson with the Bayesian-optimisation card (C499) as its
  steps 7 to 12.  Kept in this folder, not in optimizersLesson.ts, so that a
  step is declared in ONE module (the tests that read every top-level lesson
  module would otherwise see the card's steps twice).
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "../lessonStep.js";
import type { QuizQuestion } from "../lessonQuiz.js";
import { OPT_LIMITS, OPT_QUIZ, OPT_STEPS } from "../optimizersLesson.js";
import { BAYES_LIMITS, BAYES_QUIZ_IN_TOOL, BAYES_STEPS_IN_TOOL } from "./bayesOptLesson.js";

export const OPT_STEPS_ALL: readonly LessonStep[] = [...OPT_STEPS, ...BAYES_STEPS_IN_TOOL];
export const OPT_LIMITS_ALL: readonly LessonLimit[] = [...OPT_LIMITS, ...BAYES_LIMITS];
export const OPT_QUIZ_ALL: readonly QuizQuestion[] = [...OPT_QUIZ, ...BAYES_QUIZ_IN_TOOL];
