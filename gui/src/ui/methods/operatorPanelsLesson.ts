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
  The operator-panels lesson, as DATA.

  The question a student brings: "my process publishes dozens of variables;
  what do I put in front of the operator, in what form, and which alarms?"
  The worked case is the batch electrodialysis rig the engine already runs
  (edbatch01_constant_current) and the panel it already carries; the
  engine reads the panel after the run and reports FACTS about it
  (src/postProcessing/panel/PanelPass.cpp).  What makes a panel GOOD is not
  a fact and no engine grades it: the rules on this page are good practice
  written from reasoning, and every one taken from the practice of alarm
  management and operator displays is marked UNCHECKED against its source in
  docs/design/operator-panels-good-practice.md, section 6.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const PANEL_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The problem is saturation, not a lack of data",
    body: "A batch electrodialysis rig, run by the engine: a diluate tank and a "
      + "concentrate tank recirculated through a seven-pair stack at a constant "
      + "current.  The run publishes every quantity the unit computes, at every "
      + "written instant.  Below, the same run is shown twice: everything the "
      + "engine publishes, and the six elements of the panel the case declares.  "
      + "Pick a disturbance, move the time cursor, and before you open the "
      + "answer write down what is happening -- first from the wall of numbers, "
      + "then from the panel.  The data is the same; what changes is how much "
      + "of it a person has to read to answer.",
    note: "The run is the engine's: choupoBatch on the witness case, with at "
      + "most one declared value changed for the disturbance and the page's "
      + "panelDict in place of the shipped one.  A disturbance here is a second "
      + "run of a varied case -- this unit accepts no change in the middle of a "
      + "run today.",
  },
  {
    n: 2,
    title: "Start from the operator's questions, not from the outputs",
    body: "An operator at the rig asks three things, in this order: is it "
      + "normal?  where is it heading?  what do I do?  A panel is designed "
      + "backwards from those questions: for each task the operator performs, "
      + "the least information that answers it, and the element that shows "
      + "that information.  Everything else is left off -- not because it is "
      + "wrong, but because it answers no question the operator has at the "
      + "rig.  The table maps the worked panel; the list under it is what the "
      + "run publishes and the panel does not show, each with the reason.",
    note: "The mapping is this page's design reasoning for this rig, not a "
      + "rule from a standard.  A different operator (a maintenance "
      + "technician, a process engineer reviewing a campaign) has different "
      + "questions and gets a different panel from the same run.",
  },
  {
    n: 3,
    title: "How to show one value",
    body: "A bare number says what the value is and nothing about whether it "
      + "is normal: the reader must remember the limit.  The same number drawn "
      + "on its scale, with its limit marked, says how close it is.  A trend "
      + "says where it is heading.  A lamp says only whether it is normal, in a "
      + "word.  Colour is reserved for the abnormal: a panel where everything "
      + "is grey when all is well makes the one coloured element impossible to "
      + "miss.  And colour never works alone -- a word or a shape doubles it, "
      + "because some operators do not see the difference between red and "
      + "green and a printed panel may be in black and white.",
    formula: String.raw`d \;=\; \frac{x_{\text{high}} - \max_k x_k}{x_{\max} - x_{\min}}`,
    where: [
      { sym: "d", means: "the closest approach of a run to a high limit, as a "
        + "fraction of the element's scale; the engine publishes it as "
        + "closestApproachFraction (negative when the limit is crossed)" },
      { sym: "x_{\\text{high}}", means: "the high limit the panel declares for "
        + "the element" },
      { sym: "x_k", means: "the value of the element's published series at the "
        + "k-th written instant" },
      { sym: "x_{\\max}", means: "the top of the element's declared scale "
        + "(range max)" },
      { sym: "x_{\\min}", means: "the bottom of the element's declared scale "
        + "(range min)" },
    ],
    note: "The four drawings are the page's illustrations of four display "
      + "forms, kept small and local to this lesson.  Whether the value is "
      + "abnormal at the cursor is not decided by the page: it is read from "
      + "the alarm intervals the engine published for that element.",
  },
  {
    n: 4,
    title: "A hierarchy: overview, unit, detail",
    body: "No single screen answers every question.  Panels are arranged in a "
      + "few levels.  The OVERVIEW answers \"is the plant normal?\" at a "
      + "glance: one line per unit, a word, and the count of active alarms.  "
      + "The UNIT level is the panel of this page: the handful of elements "
      + "that say how this unit is doing and where it is heading.  The DETAIL "
      + "level holds everything the unit publishes, for the engineer who has "
      + "to diagnose -- which is where the wall of numbers belongs.  Moving "
      + "down a level is a choice the operator makes; nothing forces him to "
      + "read the detail to know the plant is normal.",
  },
  {
    n: 5,
    title: "Alarms: an alarm asks for an action",
    body: "An alarm interrupts a person, so it must ask for something he can "
      + "do; a quantity that only needs watching is a trend, and an event "
      + "someone should know about is a message.  One cause, one alarm: two "
      + "alarms that always sound together teach the operator to acknowledge "
      + "both without reading either.  Alarms have priorities, so the "
      + "operator knows which to act on first.  A normal end of batch is a "
      + "message, never an alarm.  And a person can act on only so many "
      + "alarms in a given time: when a single upset sets off many at once -- "
      + "an alarm flood -- the one that matters is lost among the others.  "
      + "Move the over-limiting limit and watch the engine's facts change; "
      + "then run the naive panel, which puts an alarm on everything that "
      + "moves, and count what the operator would face.",
    note: "The facts (violated, never approached, alarms active) are the "
      + "engine's, from a re-run of the case with the changed panel.  How "
      + "many alarms a person can handle is NOT taken from a standard here: "
      + "it is an adjustable assumption of the page, labelled as such, and "
      + "the onsets per window are the page's own count over the engine's "
      + "alarm intervals.",
  },
  {
    n: 6,
    title: "A panel is a system that grows",
    body: "A complex system that works is found to have grown from a simple "
      + "system that worked; one designed complex from scratch rarely does.  "
      + "So a panel starts with the simplest thing that works -- here, one "
      + "trend of the product -- and gains an element only when a test shows "
      + "something was missed.  Each stage below was added because a run of "
      + "the rectifier-set-too-high disturbance showed what the previous one "
      + "could not.  Watch the count of elements and alarms: it is the "
      + "visible cost of every addition, paid in the operator's attention.",
    note: "The life cycle the design record gives a panel kept in the case is "
      + "DRAFT (the engine proposes one from what the case declares), TUNE "
      + "(the student changes it) and LOCK (it is frozen with a reason).  "
      + "Today only the first slice exists: the engine reads a declared panel "
      + "and reports facts about it.  The draft, the tuning workspace and the "
      + "lock are not built yet.",
  },
  {
    n: 7,
    title: "An exercise: find the defects",
    body: "The panel below has five planted defects.  Run it on the engine, "
      + "read the facts it reports, and find them before you open the key.  "
      + "Some of the defects the engine reports as facts; others it cannot "
      + "see, because they are about what a sentence means or what two "
      + "quantities have in common physically, and only a person can judge "
      + "them.  Telling the two kinds apart is half of the exercise.",
  },
];

export const PANEL_LIMITS: readonly LessonLimit[] = [
  {
    id: "no-grade",
    title: "Nothing on this page is a grade.",
    body: "The engine reports facts about a panel -- which limit was crossed "
      + "and when, which element never moved -- and never whether the panel "
      + "is good.  A panel with two constant elements is not wrong: it shows "
      + "a mode of operation in which two quantities do not move.",
  },
  {
    id: "s1-only",
    title: "Only the first slice of the panel exists in the engine.",
    body: "Today the engine reads a declared system/panelDict in a "
      + "choupoBatch run and reports facts.  There is no panel workspace that "
      + "draws a case's panel, no draft written by the engine, no tuning and "
      + "no lock yet; the drawings on this page are the lesson's own "
      + "illustrations, not that workspace.",
  },
  {
    id: "no-mid-run",
    title: "A disturbance is a second run.",
    body: "The batch electrodialysis unit takes no change of its operation "
      + "in the middle of a run, so each disturbance is the same case run "
      + "again with one declared value changed.",
  },
  {
    id: "write-grid",
    title: "Facts are resolved to the write grid.",
    body: "The engine evaluates the panel at the 41 written instants (every "
      + "50 s), not at every integration step: a crossing between two writes "
      + "is seen at the next one and an excursion shorter than 50 s is "
      + "missed.  The unit's own step-resolved crossing in the base run is "
      + "1593 s; the panel sees it at 1600 s.",
  },
  {
    id: "unchecked-practice",
    title: "The good-practice rules are unchecked against their sources.",
    body: "The standards on alarm management and operator displays are "
      + "published texts that are not in hand here; no number, table or "
      + "figure is taken from them.  The rules on this page are written from "
      + "reasoning, and the design note lists each with its status.  The "
      + "never-approached threshold of 0.5 is a default of the design "
      + "record, and the alarm-handling rate is an assumption of this page.",
  },
  {
    id: "dimension",
    title: "A limit's unit is not checked against its series.",
    body: "A raw number in a range or limit is in the unit the column is "
      + "published in; no published column declares its dimension, so the "
      + "engine cannot check it.",
  },
];
