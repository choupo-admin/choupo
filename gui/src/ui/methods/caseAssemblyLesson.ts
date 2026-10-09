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
  How dictionaries assemble a case -- the lesson, as DATA (DEV.md 4c C53).

  Vitor, 2026-10-09, after a class: the students felt the EduTools said a
  great deal about chemical engineering and nothing about how Choupo itself
  works.  This is the first page on that shelf, and its subject is the one
  every other page assumes: a case is a folder of plain-text dictionaries,
  and the engine reads them in a definite order.

  Every line of the engine this prose names is reached through
  `caseAssembly.at(...)`, never typed: tests/caseAssembly.test.ts holds each
  citation to the statement on its line, and refuses a bare `file:line` in
  this file.
\*---------------------------------------------------------------------------*/

import { at } from "./caseAssembly.js";
import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const CASE_ASSEMBLY_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A case is a folder, and its three folders answer three questions",
    body: "Choupo has no project file and no hidden database of cases. A case "
      + "IS a folder of plain-text files, and the engine is pointed at the "
      + "folder: runCase tutorials/steady/flash/flash01_benzene_toluene. "
      + "Inside, three folders divide the case by the question each one "
      + "answers. system/ says HOW to run it: which program, how much to "
      + "print, which units in which order, with which numerical options. "
      + "constant/ says WITH WHAT: the substances and the thermodynamic "
      + "models the run may use — data that does not change while the case "
      + "runs. 0/ says FROM WHERE: the state of every stream before the "
      + "solve, one file per stream. The layout follows OpenFOAM's, where 0/ "
      + "is the state at time zero.",
    note: "The empty flash01_benzene_toluene.cho beside them is the GUI's "
      + "handle on the folder, and README.md is the case's lesson for you; "
      + "the engine opens neither. Two optional dictionaries appear only "
      + "when a case uses them: system/postDict (sizing and costing after "
      + "the solve) and system/outerDict (a sweep or an optimisation wrapped "
      + "around it). flash01 has neither, and the run header says so. Click "
      + "any file below to read it, and to see which line of the engine "
      + "reads it and when.",
  },
  {
    n: 2,
    title: "The grammar: a keyword, a value and a semicolon",
    body: "Every file in system/, constant/ and 0/ is read by the same "
      + "parser, and it knows four shapes. `keyword value;` is one entry "
      + "(`application choupoSolve;`). `keyword { ... }` is a sub-dictionary, "
      + "a group of entries under a name (`operation { T 370.0 K; P 1.0 bar; "
      + "}`). `keyword ( ... );` is a list (`components ( benzene toluene );`, "
      + "`outputs ( liquid vapor );`). And comments — `//` to the end of the "
      + "line, or `/* ... */` — are skipped (" + at("dictComment") + "). A "
      + "value is a word, a number, or a number followed by its unit, and "
      + "the unit is converted to SI the moment the file is read ("
      + at("unitToSI") + "). The parser also remembers WHAT KIND of quantity "
      + "the unit named, so when the flash later asks for its pressure "
      + "(" + at("flashPressureDims") + ") and finds a temperature, it "
      + "refuses rather than guessing (" + at("dimsCheck") + ").",
    derivation: [
      { step: "The flash's operation pressure is written in bar, and the "
          + "engine's unit table gives the bar a factor of 100 000 Pa ("
          + at("unitBar") + ").",
        eq: String.raw`P = 1.0\ \text{bar} = 1.0 \times 10^{5}\ \text{Pa}` },
      { step: "The feed's benzene flow is written in kmol/h; the engine "
          + "carries molar flows in kmol/s (" + at("unitKmolH") + ").",
        eq: String.raw`F_\mathrm{benzene} = 40\ \text{kmol/h} = \frac{40}{3600}\ \text{kmol/s} = 0.0111\ \text{kmol/s}` },
      { step: "The feed file states its pressure as 100000 Pa, already SI: "
          + "the unit's own entry and the stream's file spell one pressure "
          + "two ways, and both arrive as the same number.",
        eq: String.raw`100000\ \text{Pa} = 1.0\ \text{bar}` },
    ],
    formula: String.raw`x_\mathrm{SI} = f_u \, x`,
    where: [
      { sym: "x", means: "the number as written in the file" },
      { sym: "f_u", means: "the factor of the unit word that follows it, "
        + "from the engine's unit table" },
      { sym: "x_\\mathrm{SI}", means: "the value the engine stores and "
        + "computes with" },
      { sym: "P", means: "a pressure", unit: "Pa" },
      { sym: "F_\\mathrm{benzene}", means: "the molar flow of benzene in "
        + "the feed", unit: "kmol/s" },
    ],
    note: "A unit the parser does not know is refused where it is written ("
      + at("unitUnknown") + "), and the lookup is case-sensitive: `Pa` is a "
      + "pascal, `pa` is a typo. The last break at the bottom of this page "
      + "plants exactly that.",
  },
  {
    n: 3,
    title: "The order the engine assembles them in",
    body: "Before any physics, bin/runCase reads ONE word — `application` "
      + "in system/controlDict — to know which of the five programs to "
      + "start. The program then registers every unit type it knows, by "
      + "name, in an explicit list you can read (" + at("registerUnits")
      + "); nothing registers itself behind your back. It parses the "
      + "flowsheetDict, then the controlDict, checks the seal on the "
      + "component records, finds the thermoPhysPropDict, picks up whichever "
      + "optional dictionaries exist and prints a header saying which it "
      + "found. Only then does a pass begin (" + at("solve") + "): the "
      + "thermodynamic package is built from constant/, the streams are "
      + "read from 0/, the count of streams against files is checked, the "
      + "order and any recycle cuts are validated, and the units run one at "
      + "a time in the order the flowsheetDict lists them. After a converged "
      + "pass come the post-processing chain (only with a postDict), the "
      + "reports, and the files written beside the case.",
    note: "The order is not trivia: a refusal comes from the first move "
      + "that cannot proceed, so where it stops tells you which file to "
      + "open. The panel below lists the moves with the line that does each, "
      + "and beside them the lines the run printed about itself, taken from "
      + "the run this page just made.",
    leadsTo: {
      tool: "tear-streams",
      toolLabel: "Tear streams",
      stepTitle: "A sequential solver walks the units once, in the order "
        + "you wrote them",
      body: "flash01 has one unit, so the declared order is trivial here. "
        + "When a plant has a recycle, that order decides which stream "
        + "must be assumed and iterated — the subject of the tear-streams "
        + "page, which starts from exactly this move.",
    },
  },
  {
    n: 4,
    title: "Topology is not state",
    body: "The flowsheetDict NAMES the streams — `in feed;`, `outputs ( "
      + "liquid vapor );` — and gives none of them a value. The values live "
      + "in 0/, one file per stream. The engine holds both halves: a "
      + "flowsheetDict carrying a `streams {}` block of values is refused ("
      + at("streamsBlockRefused") + "), and the streams the topology names "
      + "must be exactly the files in 0/, none missing and none extra ("
      + at("completeness") + "). An outlet is counted too: 0/liquid and "
      + "0/vapor are starting values the flash replaces, and they must exist "
      + "all the same (bin/choupo-init0 writes them for you). Then each file "
      + "has to FIX its stream, which takes exactly as many numbers as the "
      + "stream has degrees of freedom: one flow per component, and two "
      + "intensive variables.",
    derivation: [
      { step: "By Duhem's theorem, a stream whose component flows are known "
          + "has two intensive degrees of freedom. For a mixture, T and P "
          + "take both, and the vapour fraction follows from them." },
      { step: "flash01's feed carries two components.",
        eq: String.raw`N_c = 2 \;\Rightarrow\; n_\mathrm{spec} = 4` },
      { step: "And 0/feed declares exactly four numbers: benzene 40 kmol/h, "
          + "toluene 60 kmol/h, T = 370 K, P = 100000 Pa." },
    ],
    formula: String.raw`n_\mathrm{spec} = N_c + 2`,
    where: [
      { sym: "n_\\mathrm{spec}", means: "how many independent numbers fix "
        + "the stream" },
      { sym: "N_c", means: "the number of components it carries" },
    ],
    note: "A third intensive value beside T and P on a mixture is either "
      + "redundant (it agrees with the (T, P) flash) or a contradiction (it "
      + "does not), and Choupo refuses it rather than choosing which to "
      + "believe (" + at("overSpecified") + "). The one exception is kept on "
      + "purpose: a PURE component in two phases sits on its saturation "
      + "curve, where T and P are not independent, so it keeps "
      + "`vaporFraction q;`.",
  },
  {
    n: 5,
    title: "What a run writes, and why you never edit it",
    body: "A converged steady run writes beside the case. converged/ holds "
      + "the solved state, one file per stream in the same grammar as 0/, "
      + "plus problemDivergence (where the problem solved differed from the "
      + "one posed — empty here). reports/ holds the stream table and the "
      + "mass, element and energy balances: the three balances run on every "
      + "converged steady run, the rest because controlDict's `reports {}` "
      + "asks. design/ holds one specification sheet per sized piece of "
      + "equipment, and is written only when a postDict runs a sizing pass ("
      + at("designNone") + "), so flash01 writes none. And there is the "
      + "log: runCase saves it as log.choupoSolve (" + at("runCaseLog")
      + "), and this app shows it in the Log tab.",
    note: "All of it is regenerated on every run: converged/ is deleted and "
      + "rewritten whole (" + at("convergedWipe") + "), and a run that does "
      + "not converge writes no converged/ at all ("
      + at("convergedOnlyIfConverged") + "). An edit made there is lost on "
      + "the next run. A value you want the next run to start from belongs "
      + "in 0/.",
  },
  {
    n: 6,
    title: "Break it, and read the refusal",
    body: "Each button below damages a COPY of flash01 held in this page's "
      + "memory — the case files themselves are never touched — and runs "
      + "that copy with the same engine, compiled for the browser. What "
      + "appears is what the engine printed, lifted out of the run's own "
      + "log; nothing in it is written by this page. Read where each one "
      + "stopped: a refusal comes from the move of the assembly that could "
      + "not proceed, and it names the file, the rule and, usually, the "
      + "remedy. A refusal is the engine doing its job: a run that silently "
      + "guessed would give you a number you could not defend.",
  },
];

export const CASE_ASSEMBLY_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-case",
    title: "One case, one program",
    body: "flash01 is a flat, single-unit steady case. A fractal plant adds "
      + "sector folders and a rule for which level a stream's file lives "
      + "at; the time-integrated programs also read each vessel's interior "
      + "from 0/internalStates/ and write a folder per saved time; a "
      + "property study reads system/propsDict instead of a flowsheetDict. "
      + "None of that is shown here.",
  },
  {
    id: "bundle",
    title: "The files the browser carries, not every file on disk",
    body: "On disk the folder also holds `expected`, the reference numbers "
      + "bin/runTests compares this case's run against. It is not a case input, "
      + "so the browser bundle leaves it out (" + at("guiNoExpected")
      + ") and the tree above does not show it.",
  },
  {
    id: "verbatim",
    title: "Why every break edits 0/ or constant/",
    body: "In the browser, controlDict, flowsheetDict and solverDict are "
      + "re-written by the app's own parser before the engine receives them, "
      + "while 0/ files and the thermoPhysPropDict travel exactly as written ("
      + at("guiVerbatim") + "). A typo planted in a re-written dictionary "
      + "would be caught by the app's parser first, and you would be reading "
      + "the app, not the engine. Run the same edits on a copy of the folder "
      + "with runCase and you get the same refusals.",
  },
  {
    id: "snapshot",
    title: "Line numbers are a snapshot of this version",
    body: "Each file:line on this page points at the engine as it stands in "
      + "this version of Choupo, and a test holds every one of them to the "
      + "statement it names. When the engine changes, the lines move and "
      + "the page is corrected; the order of the assembly does not change "
      + "that way.",
  },
];
