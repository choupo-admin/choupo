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
  How to read a run's log -- the lesson, as DATA (DEV.md 4c C54).

  Vitor, 2026-10-09, answering the commander's list of further "How Choupo
  works" pages: "Faz esse!".  The first page (caseAssemblyLesson.ts) ends
  where this one starts: a run has been made, and it said a great deal.  A
  student who cannot tell an advisory from a divergence from a refusal reads
  three very different statements as one wall of text.

  Every line of the engine this prose names is reached through `at(...)`,
  never typed: tests/runLog.test.ts holds each citation to the statement on
  its line, refuses a bare `file:line` here, and checks every number quoted
  below against a native run of the same witness.
\*---------------------------------------------------------------------------*/

import { at } from "./runLog.js";
import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const RUN_LOG_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A run talks, and the log is where it says what it did",
    body: "Every run prints what it did while it did it: what it found, how "
      + "each unit converged, what it wrote, and what it wants you to know "
      + "about the answer. From a terminal, runCase sends ALL of it — both "
      + "the standard output and the standard error — into one file beside "
      + "the case, log.choupoSolve (" + at("runCaseRedirect") + ", "
      + at("runCaseLog") + "), and shows you only a summary: the last 14 "
      + "lines of it on success (" + at("runCaseSummary") + "), or FAILED "
      + "with the exit code and the last 20 lines when the run stops ("
      + at("runCaseFailed") + "). In this app the same text is the Log tab. "
      + "The log ends with a block of JSON between two marker lines ("
      + at("resultJson") + "): it is for programs, not for you, and the Log "
      + "tab and this page leave it out (" + at("displayLogCut") + ").",
    note: "How much the run says is the `verbosity` in system/controlDict, "
      + "0 to 4, 3 when absent (" + at("verbosityRead") + "). The table "
      + "under the viewer says what each level adds, measured on flash01 — "
      + "and verbosity 0 is not silent. Pick a level and a run in the viewer: "
      + "every line is coloured by what KIND of line it is, and a click on a "
      + "line says what it is and which line of the engine printed it.",
  },
  {
    n: 2,
    title: "The header: what the run found before it computed anything",
    body: "Read the top first. The banner's first line is the version — on a "
      + "development build, the exact commit — that produced this log ("
      + at("banner") + "). Then the case folder, then one line per question "
      + "the case's system/ answers: which binary, the description, the "
      + "verbosity, and whether an outerDict, a postDict and a solverDict "
      + "were found (" + at("outerDictLine") + ", " + at("solverDictLine")
      + "). \"not present (built-in defaults)\" is said, never assumed. Then "
      + "the property package AS ASSEMBLED — `[v2 native] equilibrium "
      + "gammaPhi: liquid activity.ideal; vapour idealGas` for flash01 ("
      + at("v2GammaPhi") + ") — and `[state] seeded 3 stream(s) from 0/` ("
      + at("stateSeeded") + "). A flowsheet with a recycle adds a `[plan]` "
      + "line naming the loop and the tear that cuts it (" + at("plan")
      + ").",
    note: "Each unit then opens with a banner: its index in the declared "
      + "order, its name and type, the streams it reads and writes, and a "
      + "line saying which property package it computes with — `thermo: "
      + "inherited (global package)`, or `LOCAL override` when the unit "
      + "carries its own thermo {} block (" + at("unitThermo") + ", "
      + at("unitThermoLocal") + "). The inheritance is printed for every unit "
      + "so that an override can never pass unnoticed.",
  },
  {
    n: 3,
    title: "A unit's trace: its iterations, printed",
    body: "Inside a unit's block the unit talks about its own solve. flash01's "
      + "isothermal flash prints its feed, its K-values from the vapour "
      + "pressures, a phase test, and then the Rachford-Rice Newton iterate by "
      + "iterate (" + at("rrNewton") + "): the vapour fraction V, the "
      + "residual g(V), its slope and the step. Read the residual column. "
      + "It falls 3.8e-2, 7.8e-4, 5.7e-7, 2.9e-13: each iterate roughly "
      + "squares the error of the one before, which is what a Newton method "
      + "does when it is close enough. A residual that stalls, oscillates or "
      + "grows is the first thing to look for when a run goes wrong.",
    derivation: [
      { step: "The flash solves one equation for V, the fraction of the feed "
          + "that leaves as vapour.",
        eq: String.raw`g(V) = \sum_i \frac{z_i\,(K_i - 1)}{1 + V\,(K_i - 1)} = 0` },
      { step: "Newton's step uses the residual and its slope, the two numbers "
          + "printed on each row.",
        eq: String.raw`V_{k+1} = V_k - \frac{g(V_k)}{g'(V_k)}` },
      { step: "Row 0 of flash01's table: V = 0.5, g = −3.75806e-02, "
          + "g′ = −1.87920e-01.",
        eq: String.raw`V_1 = 0.5 - \frac{-3.75806\times10^{-2}}{-1.87920\times10^{-1}}` },
      { step: "The step lands where row 1 starts: the table prints "
          + "0.30001863 there.",
        eq: String.raw`V_1 = 0.30002` },
    ],
    formula: String.raw`V_{k+1} = V_k - \frac{g(V_k)}{g'(V_k)}`,
    where: [
      { sym: "g(V)", means: "the Rachford-Rice residual, printed as g(V)" },
      { sym: "z_i", means: "the feed mole fraction of component i" },
      { sym: "K_i", means: "its K-value, y_i / x_i, printed above the table" },
      { sym: "V", means: "the vapour fraction V/F, the unknown" },
      { sym: "V_k", means: "the iterate on row k" },
      { sym: "V_{k+1}", means: "the next iterate" },
      { sym: "V_1", means: "the iterate on row 1" },
      { sym: "g'(V_k)", means: "the slope dg/dV at that iterate" },
    ],
    note: "A unit ends with its result block — for the flash, \"Flash "
      + "Result\" with \"Converged: yes\", the iteration count and the final "
      + "|g(V)| (" + at("flashResult") + "). That is the unit's verdict. "
      + "Each solver states it in its own terms; the next step shows the "
      + "fullest form.",
  },
  {
    n: 4,
    title: "\"Converged\" is a verdict, and a verdict has numbers",
    body: "A residual quoted alone is a magnitude compared with nothing: "
      + "1e-9 kmol/s is tiny for a plant and huge for a trace species. "
      + "Choupo's convergence home (" + at("rawL1") + ") divides the summed "
      + "residual by the spread of the very terms each equation balances ("
      + at("normFactor") + ", " + at("normalized") + "). The reactive "
      + "flash takes its verdict there, and prints FIVE numbers and the "
      + "criterion that decided: the raw "
      + "residual at the start and at the end, the normalised one at the "
      + "start and at the end, and their reduction (" + at("fiveNumbers")
      + "). flash13 is such a flash — pick it in the viewer and click the "
      + "block.",
    derivation: [
      { step: "flash13's raw residual fell from 1.1964 to 8.3e-13; the "
          + "normalised one from 7.4889e-02 to 5.1947e-14.",
        eq: String.raw`\frac{\tilde r_\mathrm{final}}{\tilde r_\mathrm{initial}} = \frac{5.1947\times10^{-14}}{7.4889\times10^{-2}}` },
      { step: "That quotient is the reduction the block prints, "
          + "6.9365e-13.",
        eq: String.raw`\frac{\tilde r_\mathrm{final}}{\tilde r_\mathrm{initial}} = 6.94\times10^{-13}` },
      { step: "The absolute test is taken on the normalised residual, against "
          + "the tolerance (" + at("absoluteTest") + "); a relative test on "
          + "the reduction, against relTol, is the second way to pass ("
          + at("relativeTest") + "). Here relTol is 0, so only the first can "
          + "decide, and it does — the block says \"criterion absolute "
          + "tolerance\".",
        eq: String.raw`\tilde r_\mathrm{final} = 5.1947\times10^{-14} \le \tau = 10^{-12}` },
    ],
    formula: String.raw`\tilde r = \frac{\sum_k |r_k|}{\sum_j |t_j - \bar t| + \epsilon}`,
    where: [
      { sym: "\\tilde r", means: "the normalised residual, what the verdict "
        + "is taken on" },
      { sym: "r_k", means: "the residual of equation k, in that equation's "
        + "own units" },
      { sym: "t_j", means: "the terms the equations balance (their difference "
        + "within an equation is its residual)" },
      { sym: "\\bar t", means: "their mean" },
      { sym: "\\epsilon", means: "a floor of 1e-20 that keeps the quotient "
        + "finite; not a physical scale" },
      { sym: "\\tilde r_\\mathrm{initial}", means: "the normalised residual "
        + "at the starting guess" },
      { sym: "\\tilde r_\\mathrm{final}", means: "the normalised residual "
        + "at the accepted state" },
      { sym: "\\tau", means: "the tolerance, from system/solverDict or the "
        + "documented default, printed by the [convergence] line" },
    ],
    note: "The [convergence] line printed when the solve starts says which "
      + "controls apply and whether the case DECLARED them or the defaults "
      + "did (" + at("convergenceControls") + "). Of the runs on this page, "
      + "only the reactive flash prints the five numbers; the plain flash "
      + "reports its own final |g(V)|, and the recycle its relative |r|2.",
  },
  {
    n: 5,
    title: "A recycle: the units fall silent while the tear converges",
    body: "process03 has a recycle, and its log has a different shape. The "
      + "`[plan]` line names the loop and the tear (" + at("plan") + "), "
      + "the topology table shows the tear's starting guess read from 0/ ("
      + at("tearGuesses") + "), and then comes the recycle loop: one row per "
      + "Newton iteration on the tear, with its relative residual ("
      + at("recycleLoop") + "), and a verdict, \"Recycle converged in 2 "
      + "Newton iteration(s)\" (" + at("recycleConverged") + "). No unit "
      + "says a word during those iterations: they run quietly ("
      + at("quietSweep") + ", " + at("quietVerbosity") + "). Only when the "
      + "loop has converged does the engine run them once more, with their "
      + "full trace, under \"Final pass with full unit logging\" ("
      + at("finalPass") + ").",
    note: "So in a recycle case the unit blocks you read are the LAST pass, "
      + "the one at the answer — not the history of how it got there. That "
      + "history is the recycle table. Cut the loop to one iteration (the "
      + "\"exit 1\" run in the viewer) and the verdict becomes a WARNING: "
      + "the run still prints the stream table, but it is the last iterate "
      + "and the exit code is 1.",
    leadsTo: {
      tool: "wegstein",
      toolLabel: "Wegstein acceleration",
      stepTitle: "A recycle makes the flowsheet a fixed-point problem",
      body: "The recycle table is the outer loop of a fixed-point problem. "
        + "How Newton and Wegstein close it, and what that residual really "
        + "measures, is the subject of the recycle page — run on this very "
        + "case.",
    },
  },
  {
    n: 6,
    title: "The end of the run: balances, then two blocks you must read",
    body: "After a converged solve the reports run, each printing one line "
      + "with the file it wrote and its headline number: the mass balance "
      + "with its global closure in percent (" + at("reportMass") + "), the "
      + "element balance with its worst element (" + at("reportElement")
      + "), and the first law at the plant boundary, a residual in kW ("
      + at("reportEnergyBoundary") + "). Read the numbers, not just the "
      + "file names. Then the solved state is written to converged/ ("
      + at("convergedWritten") + "). And then two blocks, in this order on "
      + "purpose: first whether the problem solved is the problem posed ("
      + at("divergenceFirst") + "), then every caveat about the answer ("
      + at("caveatsAfter") + ") — you must learn WHICH problem was solved "
      + "before reading how well.",
    note: "Both blocks are printed even when they have nothing to say: "
      + "\"PROBLEM SOLVED == PROBLEM POSED\" (" + at("divergenceNone") + ") "
      + "and \"ASSUMPTIONS AND CAVEATS: none raised.\" (" + at("caveatsNone")
      + "), so that a missing block can never be read as good news. And "
      + "\"none raised\" claims exactly one thing: nothing was put on the "
      + "advisory log. A record announced [unmarked] does not ride that log, "
      + "and the block says so in its own words (" + at("caveatsNotUnmarked")
      + ") — bubbleT01 in the viewer shows both on one run.",
  },
  {
    n: 7,
    title: "Three kinds of message, and what each one asks of you",
    body: "An ADVISORY qualifies the answer: the run went on, and told you "
      + "something you need to know to trust the number — a vapour pressure "
      + "evaluated outside the range its fit declares (" + at("psat")
      + "), an enthalpy integrated beyond its data (" + at("cp") + "), a "
      + "model used beyond its trust range. It is printed where it "
      + "happens and put on the advisory log (" + at("psatLogged") + "), "
      + "which is how it reaches the caveat block at the end. A DIVERGENCE "
      + "says the answer is to a DIFFERENT question: shortcut01 asks for a "
      + "distillation and gets the Fenske-Underwood-Gilliland shortcut, and "
      + "the block names what was requested, what was solved and why ("
      + at("divergenceBlock") + "). A REFUSAL means there is no answer: the "
      + "engine prints ERROR: with what is wrong and usually the remedy, "
      + "and exits with code 2 (" + at("error") + ", " + at("exit2") + ").",
    note: "The exit code is the one-number summary, and the browser prints "
      + "it too, as the worker's \"run_case returned rc=\" line: 0 is an "
      + "answer; 1 is a run that finished WITHOUT converging — no "
      + "converged/ is written (" + at("exit1") + ", "
      + at("convergedOnlyIfConverged") + "; the recount of 0/ after the run "
      + "also returns 1 when it fails, " + at("exit1Recount") + "); 2 is a "
      + "refusal. Click a "
      + "message in the viewer for what to do about it: read an advisory "
      + "against your question; never quote a number past a divergence as "
      + "the answer to the question the case posed; fix the case a refusal "
      + "names; and never use the numbers of a run that exited 1.",
  },
];

export const RUN_LOG_LIMITS: readonly LessonLimit[] = [
  {
    id: "steady-only",
    title: "Steady runs only",
    body: "Every run here is choupoSolve. The time-integrated programs "
      + "(choupoBatch, choupoSemiContinuous, choupoCtrl) and choupoProps share "
      + "the header and the two end blocks, but their trace is a time "
      + "integration, not a sequence of units, and none of it is classified "
      + "here.",
  },
  {
    id: "markers",
    title: "A line with no marker is called unclassified, not guessed",
    body: "The viewer gives a line a kind only from words the engine prints "
      + "at a known place, from the block such a line opens, or from the "
      + "stderr line it continues — and says which. The table of markers "
      + "covers what these seven runs print; another case prints lines it "
      + "does not know, and they are shown as unclassified.",
  },
  {
    id: "browser",
    title: "The browser's log is not byte-for-byte the terminal's",
    body: "In the browser the engine's standard error arrives marked "
      + "[stderr], and this app adds its own lines ([adapter], [worker]); "
      + "the file runCase writes has neither. The case folder reads /case, "
      + "and the CSV and spreadsheet paths are the browser's memory, not "
      + "your disk.",
  },
  {
    id: "snapshot",
    title: "Line numbers are a snapshot of this version",
    body: "Each file:line on this page points at the engine as it stands in "
      + "this version of Choupo, and a test holds every one of them to the "
      + "statement it names. When the engine changes, the lines move and the "
      + "page is corrected; what the log says does not change that way.",
  },
];
