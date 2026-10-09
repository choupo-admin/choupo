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
  runLog — the DATA behind "How to read a run's log" (DEV.md 4c C54), kept
  React-free so every claim the page makes can be held to the tree by
  tests/runLog.test.ts.  The second page on the "How Choupo works" shelf; it
  extends the first (caseAssembly.ts), reusing its `Cite` shape, its breaks
  and its refusal reader rather than keeping copies of them.

  THE LOGS ARE REAL RUNS, NEVER TYPED.  Every witness below is a bundled
  tutorial case, run by the engine in the browser on an in-memory copy
  (methodRun.useCaseFilesRun).  Nothing on the page carries a line of log
  text written by hand: the viewer draws what the run printed.

  THE CLASSIFICATION READS ONLY WHAT THE ENGINE PRINTS.  A line is given a
  kind in exactly three ways, and the page says which:

    * OWN MARKER  -- the line opens with words the engine prints at a known
      site (`[plan]`, `Recycle converged in`, `ERROR:`, the caveat heading,
      the divergence banner, ...).  Every marker below carries the line that
      prints it, and the test runs the witnesses natively and requires every
      marker to be printed by at least one of them.
    * INSIDE A BLOCK -- the line has no marker of its own but follows, on the
      same stream, a marker that OPENS a block (a unit's `>>>  Unit [n]`
      banner, the `Flash Result` heading, the caveat heading).  The page
      names the opener; it does not pretend the line has a marker.
    * CONTINUATION -- an indented stderr line continuing the stderr line
      above it (the engine wraps its site announcements that way).

  Anything else is UNCLASSIFIED and is drawn as such.  Guessing a kind from
  the words of a line would be exactly the name-reading the project bans
  elsewhere; a line the table does not know is a fact about the table.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, through `Cite` objects
  only (a bare file-colon-line typed into prose here would be a claim nobody
  holds, and the test refuses one -- the C53 rule).
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";
import { applyDictOverride } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import {
  BREAKS, CASE_ASSEMBLY_WITNESS, applyBreak, citeText, type Cite,
} from "./caseAssembly.js";

export { citeText, refusalOf } from "./caseAssembly.js";

// ---- Citations --------------------------------------------------------------

const MAIN = "src/applications/choupoSolve/main.cpp";
const FLOWSHEET = "src/unitOperations/flowsheet/Flowsheet.cpp";
const FLASH = "src/unitOperations/flash/IsothermalFlash.cpp";
const BUILDER = "src/thermo/ThermoPackageBuilder.cpp";
const CONV = "src/solver/Convergence.H";
const RVLE = "src/thermo/electrolyte/ReactiveVLE.cpp";
const ADVISORY = "src/core/AdvisorySummary.H";
const DIVERGENCE = "src/core/DivergenceSummary.H";
const ADAPTER = "gui/src/adapters/WasmAdapter.ts";
const WORKER = "gui/public/workers/solverWorker.js";

/** Every line this page cites, by name.  ONE home: the markers, the lesson
 *  prose and the page all reach a line through this map. */
export const CITES = {
  // -- where the log goes ----------------------------------------------------
  runCaseRedirect: { file: "bin/runCase", line: 274,
    contains: '"$RUN_BIN" "$CASE_ABS"  > "$LOG" 2>&1 || rc=$?' },
  runCaseLog: { file: "bin/runCase", line: 220,
    contains: 'LOG="$CASE_ABS/log.$APP"' },
  runCaseSummary: { file: "bin/runCase", line: 289,
    contains: "tail -14" },
  runCaseFailed: { file: "bin/runCase", line: 334,
    contains: 'FAILED (exit $rc) -- last 20 lines of log:' },
  resultJson: { file: MAIN, line: 1425,
    contains: "emitResultJson(std::cout, result);" },
  displayLogCut: { file: ADAPTER, line: 419,
    contains: "const displayLog = log.slice(0, cutStart) + log.slice(cutEnd);" },
  verbosityRead: { file: MAIN, line: 574,
    contains: 'lookupScalarOrDefault("verbosity", 3)' },
  // -- what each verbosity level adds (measured on flash01, see the test) ----
  packageGuard: { file: MAIN, line: 644, contains: "if (verbosity >= 2)" },
  flashHeaderGuard: { file: FLASH, line: 1629,
    contains: "if (opts.verbosity >= 3)" },
  flashResultGuard: { file: FLASH, line: 1656,
    contains: "if (opts.verbosity >= 2) printFlashResult(sol, thermo, in);" },
  rrTableGuard: { file: FLASH, line: 1263,
    contains: "const bool showInner = (opts.verbosity >= 4)" },
  reportsGuard: { file: MAIN, line: 941, contains: "if (verbosity >= 2)" },
  blocksGuard: { file: MAIN, line: 1413, contains: "if (verbosity >= 1)" },
  // -- the header --------------------------------------------------------------
  banner: { file: "src/core/Banner.cpp", line: 60,
    contains: 'R"CH(/*---' },
  caseDirectory: { file: MAIN, line: 536,
    contains: 'std::cout << "Case directory: "' },
  databaseRoot: { file: MAIN, line: 537, contains: '"Database root:  "' },
  propertyPackage: { file: MAIN, line: 645,
    contains: '"Property package:  INLINE in the case"' },
  application: { file: MAIN, line: 792, contains: '"Application:       "' },
  description: { file: MAIN, line: 794, contains: '"Description:       "' },
  verbosityLine: { file: MAIN, line: 795, contains: '"Verbosity:         "' },
  outerDictLine: { file: MAIN, line: 796, contains: '"outerDict:         "' },
  postDictLine: { file: MAIN, line: 798, contains: '"\\npostDict:          "' },
  solverDictLine: { file: MAIN, line: 816,
    contains: '"\\nsolverDict:        "' },
  reactionsLine: { file: MAIN, line: 818,
    contains: '"\\nreactions library: "' },
  v2GammaPhi: { file: BUILDER, line: 2732,
    contains: '"[v2 native] equilibrium gammaPhi: liquid activity."' },
  v2Reactive: { file: BUILDER, line: 1914,
    contains: '"[v2 native] equilibrium electrolyteGammaPhi (REACTIVE"' },
  resolverNotes: { file: BUILDER, line: 1060,
    contains: "std::cout << line << \"\\n\";" },
  chemistryMasters: { file: BUILDER, line: 1193,
    contains: '"[chemistry] masters DERIVED from the declared"' },
  basisMap: { file: BUILDER, line: 1642,
    contains: '"[basis] component -> master map: "' },
  builderBackbone: { file: BUILDER, line: 1786,
    contains: '"[builder] molecular backbone pair "' },
  sealedMirror: { file: "src/core/RegistryScan.cpp", line: 96,
    contains: 'std::cerr << "[sealed] " << noun_' },
  stateSeeded: { file: FLOWSHEET, line: 2423,
    contains: 'std::cout << "[state] seeded "' },
  plan: { file: FLOWSHEET, line: 4575,
    contains: "\"[plan] material recycle: tear '\"" },
  // -- stream tables -------------------------------------------------------------
  topology: { file: FLOWSHEET, line: 2939,
    contains: "Flowsheet topology" },
  initialState: { file: FLOWSHEET, line: 2945,
    contains: '"Initial stream state (all graph streams, seeded from 0/):\\n"' },
  tearGuesses: { file: FLOWSHEET, line: 2949,
    contains: '"Tear streams (initial guesses):\\n"' },
  summary: { file: FLOWSHEET, line: 3780, contains: "Flowsheet summary" },
  finalTable: { file: FLOWSHEET, line: 3781,
    contains: '"Final stream table (all registered streams):\\n"' },
  // -- a unit's trace ------------------------------------------------------------
  unitBanner: { file: FLOWSHEET, line: 1081, contains: '">>>  Unit ["' },
  unitInputs: { file: FLOWSHEET, line: 1086, contains: '"Inputs: "' },
  unitInput: { file: FLOWSHEET, line: 1091, contains: '"Input: "' },
  unitThermo: { file: FLOWSHEET, line: 1100,
    contains: '"\\n>>>  thermo: "' },
  unitThermoLocal: { file: FLOWSHEET, line: 1103,
    contains: '"LOCAL override —"' },
  quietSweep: { file: FLOWSHEET, line: 3317, contains: "sweep(/*quiet=*/true);" },
  quietVerbosity: { file: FLOWSHEET, line: 1135,
    contains: "int vUsed = quiet ? 0 : verbosity;" },
  finalPass: { file: FLOWSHEET, line: 3405,
    contains: '"\\n----- Final pass with full unit logging -----\\n"' },
  flashModel: { file: FLASH, line: 1621, contains: '"  [flash] model "' },
  rrNewton: { file: FLASH, line: 1268,
    contains: '"] Rachford-Rice Newton (inner):\\n"' },
  bubbleNewton: { file: "src/unitOperations/saturation/BubblePoint.cpp",
    line: 173, contains: '"Bubble-T Newton-Raphson:\\n"' },
  // -- convergence -----------------------------------------------------------------
  flashResult: { file: FLASH, line: 2220, contains: "Flash Result" },
  bubbleResult: { file: "src/unitOperations/saturation/BubblePoint.cpp",
    line: 210, contains: "Bubble-T Result" },
  compositionLoop: { file: FLASH, line: 1367,
    contains: '"\\nComposition outer loop (gamma/K refresh) converged after "' },
  convergenceControls: { file: CONV, line: 196,
    contains: 'os << "[convergence] " << name << ": "' },
  fiveNumbers: { file: RVLE, line: 2133,
    contains: '"  outer-Newton convergence (normalized residual,"' },
  fiveVerdict: { file: RVLE, line: 2149, contains: '"    verdict      "' },
  rawL1: { file: CONV, line: 240,
    contains: "for (const scalar r : residual) out.rawL1 += std::abs(r);" },
  normFactor: { file: CONV, line: 258,
    contains: "out.normFactor = spread + floorValue;" },
  normalized: { file: CONV, line: 259,
    contains: "out.normalized = out.rawL1 / out.normFactor;" },
  absoluteTest: { file: CONV, line: 330,
    contains: "if (normNow <= c.tolerance)" },
  relativeTest: { file: CONV, line: 336,
    contains: "&& normNow / normInitial <= c.relTol)" },
  recycleLoop: { file: FLOWSHEET, line: 3311,
    contains: '"Recycle outer loop (Newton over "' },
  recycleConverged: { file: FLOWSHEET, line: 3387,
    contains: '"Recycle converged in "' },
  recycleFailed: { file: FLOWSHEET, line: 3391,
    contains: '"WARNING: recycle Newton did NOT converge in "' },
  // -- the end of the run ------------------------------------------------------------
  txy: { file: MAIN, line: 389,
    contains: '"[txy] scanning bubble/dew T across composition"' },
  reportsDir: { file: MAIN, line: 942, contains: '"\\nReports (-> "' },
  reportStreamTable: { file: "src/reporting/StreamTableReport.cpp",
    line: 370, contains: '"  [report] streamTable -> "' },
  reportMass: { file: "src/reporting/MassBalanceReport.cpp", line: 201,
    contains: '"  [report] massBalance -> "' },
  reportMassByUnit: { file: "src/reporting/MassBalanceReport.cpp",
    line: 336, contains: '"  [report] massBalance_byUnit -> "' },
  reportEnergyBoundary: { file: "src/reporting/EnergyBalanceReport.cpp",
    line: 1125, contains: '"  [report] globalEnergyBoundary -> "' },
  reportEnergyByUnit: { file: "src/reporting/EnergyBalanceReport.cpp",
    line: 1141, contains: '"  [report] energyBalance_byUnit -> "' },
  reportElement: { file: "src/reporting/ElementBalanceReport.cpp",
    line: 208, contains: '"  [report] elementBalance -> "' },
  reportUtilities: { file: "src/reporting/UtilitiesReport.cpp", line: 93,
    contains: '"  [report] utilities -> "' },
  reportSpreadsheet: { file: "src/reporting/SpreadsheetReport.cpp",
    line: 529, contains: '"  [report] spreadsheet -> "' },
  stateComplete: { file: MAIN, line: 1147,
    contains: 'std::cout << "[state] 0/ complete: "' },
  convergedWritten: { file: MAIN, line: 1088,
    contains: '"[state] wrote converged/ -- (sector-owned, componentFlows)"' },
  convergedOnlyIfConverged: { file: MAIN, line: 1019,
    contains: "if (!result.converged) return;" },
  divergenceFirst: { file: MAIN, line: 1417,
    contains: "printProblemDivergence(result.divergences);" },
  caveatsAfter: { file: MAIN, line: 1418,
    contains: "printAdvisorySummary(result.advisories);" },
  divergenceNone: { file: DIVERGENCE, line: 80,
    contains: '"PROBLEM SOLVED == PROBLEM POSED.  No divergence declared or"' },
  divergenceBlock: { file: DIVERGENCE, line: 93,
    contains: '"THE PROBLEM SOLVED IS NOT THE PROBLEM POSED\\n"' },
  caveatsNone: { file: ADVISORY, line: 135,
    contains: '"ASSUMPTIONS AND CAVEATS: none raised.\\n"' },
  caveatsNotUnmarked: { file: ADVISORY, line: 138,
    contains: "log ([unmarked] records, " },
  caveatsBlock: { file: ADVISORY, line: 177,
    contains: '"ASSUMPTIONS AND CAVEATS -- what this run announced along the way\\n"' },
  // -- advisories at their site ------------------------------------------------------
  psatLogged: { file: "src/thermo/vaporPressure/VaporPressureModel.cpp",
    line: 161, contains: "const bool fresh = AdvisoryLog::instance().add(" },
  psat: { file: "src/thermo/vaporPressure/VaporPressureModel.cpp", line: 167,
    contains: 'std::cerr << "[psat] " << who << ": " << modelName()' },
  cpLogged: { file: "src/thermo/heatCapacity/PolynomialCp.cpp", line: 244,
    contains: "AdvisoryLog::instance().add(" },
  cp: { file: "src/thermo/heatCapacity/PolynomialCp.cpp", line: 247,
    contains: 'std::cerr << "[cp] polynomial Cp"' },
  phase: { file: "src/reporting/EnergyBalanceReport.cpp", line: 632,
    contains: "std::cerr << \"[phase] stream '\"" },
  davies: { file: "src/thermo/electrolyte/SpeciationSolver.cpp", line: 2404,
    contains: 'std::cout << "  [advisory] " << msg.str() << "\\n";' },
  daviesLogged: { file: "src/thermo/electrolyte/SpeciationSolver.cpp",
    line: 2402,
    contains: 'AdvisoryLog::instance().add("model", "warning", "speciation", msg.str())' },
  unmarked: { file: "src/thermo/Database.cpp", line: 635,
    contains: "std::cerr << \"[unmarked] component '\" << name" },
  unmarkedOnce: { file: "src/thermo/Database.cpp", line: 633,
    contains: 'if (announceOnce("unmarked:" + name))' },
  // -- a refusal, and the exit codes ---------------------------------------------------
  error: { file: MAIN, line: 1438,
    contains: 'std::cerr << "\\nERROR: " << e.what() << "\\n";' },
  exit2: { file: MAIN, line: 1439, contains: "return 2;" },
  exit1: { file: MAIN, line: 1345,
    contains: "finalRc = result.converged ? 0 : 1;" },
  exit1Recount: { file: MAIN, line: 1396,
    contains: "if (!validate0(result)) finalRc = 1;" },
  // -- this app's own lines -------------------------------------------------------------
  adapterSpawn: { file: ADAPTER, line: 160,
    contains: 'emit("[adapter] spawning worker at " + workerUrl);' },
  adapterConstructed: { file: ADAPTER, line: 162,
    contains: 'emit("[adapter] worker constructed; posting run message");' },
  adapterDispatch: { file: ADAPTER, line: 280,
    contains: "emit(`[adapter] dispatching to ${binary} WASM`);" },
  wasmExit: { file: ADAPTER, line: 263,
    contains: "if (msg.rc !== 0) emit(`\\n[wasm] exited with code ${msg.rc}`);" },
  workerLog: { file: WORKER, line: 145,
    contains: 'const log = (s) => self.postMessage({ type: "log", line: s });' },
  workerStderr: { file: WORKER, line: 188,
    contains: 'self.postMessage({ type: "log", line: "[stderr] " + line }),' },
  workerRc: { file: WORKER, line: 211,
    contains: 'log("[worker] run_case returned rc=" + rc);' },
} as const satisfies { [name: string]: Cite };

export type CiteName = keyof typeof CITES;

/** The text of a citation by name -- the only way prose here names a line. */
export const at = (name: CiteName): string => citeText(CITES[name]);

// ---- The kinds ----------------------------------------------------------------

export type LogKind =
  | "header" | "streams" | "trace" | "convergence" | "written"
  | "divergence" | "caveats" | "advisory" | "refusal" | "app";

export interface KindInfo {
  readonly label: string;
  /** A Mantine colour name, so the page draws it in both themes. */
  readonly color: string;
  readonly says: string;
}

/** In the order a run prints them, roughly; the legend follows it. */
export const KINDS: { readonly [k in LogKind]: KindInfo } = {
  header: { label: "header", color: "blue",
    says: "what the run is and what it found before computing anything: the "
      + "version, the case, which dictionaries exist, the property package it "
      + "assembled, the plan" },
  streams: { label: "stream tables", color: "lime",
    says: "every stream's state, before the solve (as read from 0/) and after" },
  trace: { label: "unit trace", color: "cyan",
    says: "a unit narrating its own solve: its inputs, its model, its "
      + "iterations" },
  convergence: { label: "convergence", color: "teal",
    says: "a verdict: whether a solve converged, with the numbers it was "
      + "decided on" },
  written: { label: "balances and files", color: "indigo",
    says: "after a converged solve: the reports (mass, element and energy "
      + "balances among them) and the files written beside the case" },
  divergence: { label: "divergence", color: "grape",
    says: "whether the problem solved is the problem the case posed" },
  caveats: { label: "caveat block", color: "yellow",
    says: "every advisory the run raised about its answer, repeated at the end" },
  advisory: { label: "advisory", color: "orange",
    says: "an announcement at the place it happened: the answer is "
      + "qualified (an extrapolation, an unreviewed record, a model outside "
      + "its range)" },
  refusal: { label: "refusal", color: "red",
    says: "the engine stopped: no answer exists" },
  app: { label: "this app", color: "gray",
    says: "written by this app's runner in your browser, not by the engine; "
      + "a terminal run has none of these" },
};

export const KIND_ORDER: readonly LogKind[] = [
  "header", "streams", "trace", "convergence", "written", "divergence",
  "caveats", "advisory", "refusal", "app",
];

// ---- The markers ----------------------------------------------------------------

/** Which output a marker is printed on.  `err` is the engine's standard
 *  error, which the browser worker prefixes with "[stderr] " (WORKER line
 *  `workerStderr`); `app` is a line this app writes itself. */
export type LogStream = "out" | "err" | "app";

/** A block a marker opens.  `region`: every following unmarked line on the
 *  same stream belongs to it until another region opens.  `rule`: until the
 *  next line made only of that rule character repeated (inclusive) -- the
 *  character matters, because a result block draws a `----` rule under its
 *  table header and closes on `====`.  `startsWith`: until the next line
 *  that starts with it (inclusive). */
export type BlockEnd =
  | "region"
  | { readonly rule: "=" | "-" }
  | { readonly startsWith: string };

export interface LogMarker {
  readonly id: string;
  readonly kind: LogKind;
  readonly stream: LogStream;
  /** The line, its indentation removed, starts with this.  Exactly one of
   *  `startsWith` / `pattern`. */
  readonly startsWith?: string;
  readonly pattern?: RegExp;
  /** For a `pattern`: how the marker reads to a person, the variable part
   *  written as a placeholder.  The page draws this, never the regex. */
  readonly looksLike?: string;
  readonly opens?: BlockEnd;
  /** The rule character the SAME print statement draws just above the
   *  marker (a unit's `>>>>` banner, the `====` of the divergence block, the
   *  `----` of the caveat block).  Only such a rule is given to the block
   *  below it; any other rule stays with what it closes. */
  readonly ruledBy?: "=" | "-" | ">";
  /** The engine line that prints it. */
  readonly cite: CiteName;
  /** What it says, in plain words. */
  readonly means: string;
  /** What a reader should DO about it, where there is something to do. */
  readonly act?: string;
  /** The line reports a FAILED solve. */
  readonly failure?: boolean;
}

const ACT_ADVISORY = "Read it and decide whether it touches YOUR question. "
  + "The run went on, and the number it gave is the number the model gives "
  + "there — but it is no longer covered by the data or the model's stated "
  + "range. If your conclusion depends on it, check the record's range, "
  + "choose a model or record that covers the conditions, or report the "
  + "caveat with the answer.";

const ACT_DIVERGENCE = "Before you use any number below it, read "
  + "`requested` against `solved`: the answer is the answer to the second. "
  + "If that is not the question you are asking, change the case so it asks "
  + "it (for shortcut01: a rigorous column instead of the shortcut), or "
  + "supply what was missing; never quote the number as if it answered the "
  + "first.";

const ACT_REFUSAL = "There is no answer to read, and no number on screen "
  + "came from this run. The message names the file, the rule it breaks "
  + "and, usually, the remedy: fix the case and run it again.";

const ACT_NOT_CONVERGED = "There is no answer. The stream table that "
  + "follows is the LAST ITERATE, not a solution; no converged/ is written "
  + "and the exit code is 1. Give the loop more iterations, a better "
  + "starting guess in 0/, or look at why it is not contracting — never "
  + "use those numbers.";

export const MARKERS: readonly LogMarker[] = [
  // ---- header ----------------------------------------------------------------
  { id: "banner", kind: "header", stream: "out", startsWith: "/*----",
    opens: { startsWith: "\\*----" }, cite: "banner",
    means: "The banner. Its first line carries the version — and, on a "
      + "development build, the exact commit — that produced this log: the "
      + "first thing to quote when you ask someone about a run." },
  { id: "caseDirectory", kind: "header", stream: "out",
    startsWith: "Case directory:", cite: "caseDirectory",
    means: "The folder the engine was pointed at. In the browser it is "
      + "/case, the in-memory copy." },
  { id: "databaseRoot", kind: "header", stream: "out",
    startsWith: "Database root:", cite: "databaseRoot",
    means: "Where the shared data catalogue lives. A sealed case reads only "
      + "its own constant/ records and never this." },
  { id: "propertyPackage", kind: "header", stream: "out",
    startsWith: "Property package:", cite: "propertyPackage",
    means: "Where the thermophysical system came from: declared inline in "
      + "the case's constant/thermoPhysPropDict." },
  { id: "application", kind: "header", stream: "out",
    startsWith: "Application:", cite: "application",
    means: "The binary named by `application` in system/controlDict." },
  { id: "description", kind: "header", stream: "out",
    startsWith: "Description:", cite: "description",
    means: "The case's own one-line description, from system/controlDict." },
  { id: "verbosity", kind: "header", stream: "out", startsWith: "Verbosity:",
    cite: "verbosityLine",
    means: "How much this log says, from system/controlDict (0 to 4). Change "
      + "it in the viewer and watch the log grow or shrink." },
  { id: "outerDict", kind: "header", stream: "out", startsWith: "outerDict:",
    cite: "outerDictLine",
    means: "Whether an outer driver (a sweep, an optimisation) wraps the "
      + "solve. \"not present\" means one pass." },
  { id: "postDict", kind: "header", stream: "out", startsWith: "postDict:",
    cite: "postDictLine",
    means: "Whether a post-processing chain (sizing, costing) runs after a "
      + "converged solve." },
  { id: "solverDict", kind: "header", stream: "out", startsWith: "solverDict:",
    cite: "solverDictLine",
    means: "Whether system/solverDict was found. \"not present (built-in "
      + "defaults)\" is said, never assumed silently." },
  { id: "reactions", kind: "header", stream: "out",
    startsWith: "reactions library:", cite: "reactionsLine",
    means: "Whether a named-reaction library was loaded, and from where." },
  { id: "v2GammaPhi", kind: "header", stream: "out",
    startsWith: "[v2 native] equilibrium gammaPhi", cite: "v2GammaPhi",
    means: "The property package, as assembled: the formulation, the liquid "
      + "model and the vapour model. It is printed each time a package is "
      + "built — once for the solve, and again by the steps after it that "
      + "rebuild one (the T-x-y scan, the writers) — so it repeats." },
  { id: "v2Reactive", kind: "header", stream: "out",
    startsWith: "[v2 native] equilibrium electrolyteGammaPhi", cite: "v2Reactive",
    means: "The property package, as assembled, for a reactive electrolyte "
      + "system: speciation network, gas-liquid transfer records, which "
      + "species may enter the vapour." },
  { id: "resolver", kind: "header", stream: "out", startsWith: "[resolver]",
    cite: "resolverNotes",
    means: "The classifier's conclusions about each component (how it takes "
      + "part in the chemistry, which convention prices it), printed by the "
      + "loop cited here; the builder then adds [resolver] lines naming "
      + "what it built and what the case authorised." },
  { id: "chemistryMasters", kind: "header", stream: "out",
    startsWith: "[chemistry] masters DERIVED", cite: "chemistryMasters",
    means: "The master species of the aqueous network, derived from the "
      + "components' own declared bridges — not typed by the case." },
  { id: "basisMap", kind: "header", stream: "out",
    startsWith: "[basis] component -> master map", cite: "basisMap",
    means: "A check that the converged state can be read back uniquely: the "
      + "map from components to masters has full rank." },
  { id: "builderBackbone", kind: "header", stream: "out",
    startsWith: "[builder] molecular backbone pair", cite: "builderBackbone",
    means: "Which binary-pair record the activity model was built from, with "
      + "its path: the parameters behind every gamma on this run." },
  { id: "sealed", kind: "header", stream: "err", startsWith: "[sealed] ",
    cite: "sealedMirror",
    means: "A record read from the case's own sealed copy, verified against "
      + "the manifest, instead of from the shared catalogue." },
  { id: "stateSeeded", kind: "header", stream: "out",
    startsWith: "[state] seeded", cite: "stateSeeded",
    means: "Every stream's starting state read from 0/, one file per stream." },
  { id: "plan", kind: "header", stream: "out",
    startsWith: "[plan] material recycle", cite: "plan",
    means: "The recycle the engine found, and the declared tear that cuts "
      + "it: the units in the loop, in order, and the stream that will be "
      + "guessed and iterated." },
  // ---- stream tables ------------------------------------------------------------
  { id: "topology", kind: "streams", stream: "out",
    startsWith: "================  Flowsheet topology", opens: "region",
    cite: "topology",
    means: "The streams BEFORE the solve, as read from 0/. For an outlet "
      + "these are only the starting values the unit will replace." },
  { id: "initialState", kind: "streams", stream: "out",
    startsWith: "Initial stream state", cite: "initialState",
    means: "Every stream of the graph, seeded from 0/." },
  { id: "tearGuesses", kind: "streams", stream: "out",
    startsWith: "Tear streams (initial guesses):", cite: "tearGuesses",
    means: "The tear's starting guess — the value the recycle loop starts "
      + "iterating from, read from 0/." },
  { id: "summary", kind: "streams", stream: "out",
    startsWith: "================  Flowsheet summary", opens: "region",
    cite: "summary",
    means: "The streams AFTER the solve. On a converged run this is the "
      + "answer; on a run that did not converge it is only the last iterate." },
  { id: "finalTable", kind: "streams", stream: "out",
    startsWith: "Final stream table", cite: "finalTable",
    means: "Every registered stream, as the solve left it." },
  // ---- a unit's trace -----------------------------------------------------------
  { id: "unitBanner", kind: "trace", stream: "out", startsWith: ">>>  Unit [",
    opens: "region", ruledBy: ">", cite: "unitBanner",
    means: "A unit starts, in the order flowsheetDict declares: its index, "
      + "its name and its type. Everything below, up to the next unit, is "
      + "that unit talking." },
  { id: "unitInputs", kind: "trace", stream: "out", startsWith: ">>>  Inputs:",
    cite: "unitInputs",
    means: "The streams the unit reads, and (after the arrow) the streams it "
      + "writes." },
  { id: "unitInput", kind: "trace", stream: "out", startsWith: ">>>  Input:",
    cite: "unitInput",
    means: "The stream the unit reads, and (after the arrow) the streams it "
      + "writes." },
  { id: "unitThermo", kind: "trace", stream: "out", startsWith: ">>>  thermo:",
    cite: "unitThermo",
    means: "Which property package this unit computes with: \"inherited "
      + "(global package)\", or \"LOCAL override\" when the unit carries its "
      + "own thermo {} block. The inheritance is printed for every unit, so "
      + "an override can never pass unnoticed." },
  { id: "finalPass", kind: "trace", stream: "out",
    startsWith: "----- Final pass with full unit logging", opens: "region",
    cite: "finalPass",
    means: "The recycle has converged; the units now run once more, this "
      + "time printing their trace. While the loop iterated they ran quietly." },
  { id: "flashModel", kind: "trace", stream: "out", startsWith: "[flash] model",
    cite: "flashModel",
    means: "The machine the flash's `model` word selected, and whether it was "
      + "declared or implied." },
  { id: "rrNewton", kind: "trace", stream: "out",
    pattern: /^\[outer \d+\] Rachford-Rice Newton \(inner\):/,
    looksLike: "[outer N] Rachford-Rice Newton (inner):", cite: "rrNewton",
    means: "The Rachford-Rice Newton, iterate by iterate: V, the residual "
      + "g(V), its slope and the step. Watch g(V) fall by orders of "
      + "magnitude — that is what quadratic convergence looks like." },
  { id: "bubbleNewton", kind: "trace", stream: "out",
    startsWith: "Bubble-T Newton-Raphson:", cite: "bubbleNewton",
    means: "The bubble-point Newton, iterate by iterate: T, the residual "
      + "f(T), its slope and the step." },
  // ---- convergence --------------------------------------------------------------
  { id: "flashResult", kind: "convergence", stream: "out",
    pattern: /^=+ {2}Flash Result {2}=+$/, opens: { rule: "=" },
    looksLike: "=====  Flash Result  =====", cite: "flashResult",
    means: "The flash's verdict and answer: the regime, \"Converged: yes\", "
      + "the iteration count, the final residual |g(V)|, V/F and the phase "
      + "compositions." },
  { id: "bubbleResult", kind: "convergence", stream: "out",
    pattern: /^=+ {2}Bubble-T Result {2}=+$/, opens: { rule: "=" },
    looksLike: "=====  Bubble-T Result  =====", cite: "bubbleResult",
    means: "The bubble-point verdict and answer: T_bubble, \"Converged: "
      + "yes\", the iteration count and the final residual." },
  { id: "compositionLoop", kind: "convergence", stream: "out",
    startsWith: "Composition outer loop (gamma/K refresh) converged",
    cite: "compositionLoop",
    means: "The outer loop that refreshes the K-values with the new "
      + "compositions has converged, and says after how many passes." },
  { id: "convergenceControls", kind: "convergence", stream: "out",
    startsWith: "[convergence] ", cite: "convergenceControls",
    means: "The three controls this solve will be judged by — tolerance, "
      + "relTol, maxIter — and whether the case DECLARED them or the "
      + "documented defaults apply." },
  { id: "fiveNumbers", kind: "convergence", stream: "out",
    startsWith: "outer-Newton convergence (normalized residual",
    opens: { startsWith: "verdict" }, cite: "fiveNumbers",
    means: "The full verdict: the raw residual at the start and the end, the "
      + "normalised residual at the start and the end, their reduction, the "
      + "controls, the criterion that decided and the verdict. A residual "
      + "quoted alone is a magnitude compared with nothing; this block says "
      + "what it was compared with." },
  { id: "recycleLoop", kind: "convergence", stream: "out",
    startsWith: "Recycle outer loop (Newton over", opens: "region",
    cite: "recycleLoop",
    means: "The recycle loop: one row per Newton iteration on the tear, with "
      + "the relative residual |r|2 and the step length alpha." },
  { id: "recycleConverged", kind: "convergence", stream: "out",
    startsWith: "Recycle converged in", cite: "recycleConverged",
    means: "The recycle verdict: converged, after how many iterations, at "
      + "which residual." },
  { id: "recycleFailed", kind: "convergence", stream: "out",
    startsWith: "WARNING: recycle Newton did NOT converge", cite: "recycleFailed",
    failure: true,
    means: "The recycle loop ran out of iterations before its residual met "
      + "the tolerance. The run continues to the end so you can see where it "
      + "stopped, and then exits with code 1.",
    act: ACT_NOT_CONVERGED },
  // ---- balances and files -------------------------------------------------------
  { id: "txy", kind: "written", stream: "out", startsWith: "[txy] scanning",
    cite: "txy",
    means: "A diagnostic sweep for the T-x-y diagram, after the solve. Any "
      + "range warning it raises is about the sweep, not your operating point, "
      + "and the line says so." },
  { id: "reportsDir", kind: "written", stream: "out", startsWith: "Reports (->",
    opens: "region", cite: "reportsDir",
    means: "The reports, and the folder they are written to." },
  { id: "reportStreamTable", kind: "written", stream: "out",
    startsWith: "[report] streamTable", cite: "reportStreamTable",
    means: "The stream table, as a CSV." },
  { id: "reportMass", kind: "written", stream: "out",
    startsWith: "[report] massBalance ->", cite: "reportMass",
    means: "The plant's mass balance, with its global closure in percent: "
      + "100.000 % means what entered left." },
  { id: "reportMassByUnit", kind: "written", stream: "out",
    startsWith: "[report] massBalance_byUnit", cite: "reportMassByUnit",
    means: "The mass balance unit by unit." },
  { id: "reportEnergyBoundary", kind: "written", stream: "out",
    startsWith: "[report] globalEnergyBoundary", cite: "reportEnergyBoundary",
    means: "The first law at the plant boundary: the residual in kW, and a "
      + "percentage when there is an exchanged energy to divide it by. Read "
      + "the kW: a residual is a number to look at, not a box to tick." },
  { id: "reportEnergyByUnit", kind: "written", stream: "out",
    startsWith: "[report] energyBalance_byUnit", cite: "reportEnergyByUnit",
    means: "The energy balance unit by unit." },
  { id: "reportElement", kind: "written", stream: "out",
    startsWith: "[report] elementBalance", cite: "reportElement",
    means: "Atoms in against atoms out, element by element; the worst "
      + "closure is printed." },
  { id: "reportUtilities", kind: "written", stream: "out",
    startsWith: "[report] utilities", cite: "reportUtilities",
    means: "The utility consumption report (none in this case, and it says "
      + "so)." },
  { id: "reportSpreadsheet", kind: "written", stream: "out",
    startsWith: "[report] spreadsheet", cite: "reportSpreadsheet",
    means: "The same reports gathered into one spreadsheet." },
  { id: "stateComplete", kind: "written", stream: "out",
    startsWith: "[state] 0/ complete", cite: "stateComplete",
    means: "The count re-checked after the run: as many state files in 0/ as "
      + "streams in the graph." },
  { id: "convergedWritten", kind: "written", stream: "out",
    startsWith: "[state] wrote converged/", cite: "convergedWritten",
    means: "The solved state written to converged/, plus problemDivergence "
      + "(the count in brackets is how many divergences it records). Only a "
      + "converged run writes this." },
  // ---- divergence ---------------------------------------------------------------
  { id: "divergenceNone", kind: "divergence", stream: "out",
    startsWith: "PROBLEM SOLVED == PROBLEM POSED", opens: { rule: "=" },
    ruledBy: "=",
    cite: "divergenceNone",
    means: "Nothing was replaced or approximated: the answer is to the "
      + "question the case asks. The line is printed even then, so its "
      + "absence can never be read as \"nothing diverged\"." },
  { id: "divergenceBlock", kind: "divergence", stream: "out",
    startsWith: "THE PROBLEM SOLVED IS NOT THE PROBLEM POSED", opens: { rule: "=" },
    ruledBy: "=",
    cite: "divergenceBlock",
    means: "The answer below is to a DIFFERENT question from the one the "
      + "case describes on its face. Each entry names the unit, what was "
      + "requested, what was solved instead and why.",
    act: ACT_DIVERGENCE },
  // ---- caveat block -------------------------------------------------------------
  { id: "caveatsNone", kind: "caveats", stream: "out",
    startsWith: "ASSUMPTIONS AND CAVEATS: none raised.", opens: "region",
    ruledBy: "-",
    cite: "caveatsNone",
    means: "Nothing was raised on the advisory log. That is all it claims: "
      + "announcements that do not ride the log (an [unmarked] record) stay "
      + "where they were printed, and the block says so in its own words." },
  { id: "caveatsBlock", kind: "caveats", stream: "out",
    startsWith: "ASSUMPTIONS AND CAVEATS -- what this run announced",
    opens: { rule: "-" }, ruledBy: "-", cite: "caveatsBlock",
    means: "Every advisory the run raised about its answer, repeated here, "
      + "grouped by heading, because a warning a thousand lines above the "
      + "answer has been delivered, not received. A heading THE SOLVER'S PATH "
      + "counts advisories about states a solver visited and did NOT publish.",
    act: ACT_ADVISORY },
  // ---- advisories at their site -------------------------------------------------
  { id: "psat", kind: "advisory", stream: "err", startsWith: "[psat] ",
    cite: "psat",
    means: "A vapour pressure was evaluated outside the temperature range its "
      + "fit declares. The value is still returned — extrapolation is a "
      + "legitimate choice — and said, here and again in the caveat block.",
    act: ACT_ADVISORY },
  { id: "cp", kind: "advisory", stream: "err", startsWith: "[cp] ",
    cite: "cp",
    means: "A heat capacity was integrated along a path that leaves its "
      + "declared range, so part of an enthalpy difference is extrapolated. "
      + "Said here, and again in the caveat block.",
    act: ACT_ADVISORY },
  { id: "phase", kind: "advisory", stream: "err", startsWith: "[phase] ",
    cite: "phase",
    means: "A stream priced in a phase its own equilibrium does not support "
      + "at its (T, P): the energy report names it.",
    act: ACT_ADVISORY },
  { id: "davies", kind: "advisory", stream: "out", startsWith: "[advisory] ",
    cite: "davies",
    means: "The Davies activity model was used beyond the ionic strength it "
      + "is trusted to: the speciation is indicative. This line is printed "
      + "only at verbosity 2 or more; the caveat block repeats it at any "
      + "verbosity from 1, which is why the block exists.",
    act: ACT_ADVISORY },
  { id: "unmarked", kind: "advisory", stream: "err", startsWith: "[unmarked] ",
    cite: "unmarked",
    means: "A component record declares no review status: it makes no claim "
      + "about whether its values were checked. It is announced once, here, "
      + "and does NOT ride the advisory log — so it is never in the caveat "
      + "block, even when the block says \"none raised\".",
    act: "Nothing to fix in your case. Know that the record's numbers carry "
      + "no review claim; if your answer leans on them, read the record's "
      + "sources." },
  // ---- refusal ------------------------------------------------------------------
  { id: "error", kind: "refusal", stream: "err", startsWith: "ERROR: ",
    opens: "region", cite: "error",
    means: "The engine refused the case and stopped. Everything it says "
      + "after ERROR: is the refusal: what is wrong, where, and what to do. "
      + "The exit code is 2; there is no answer, no converged/, no caveat "
      + "block.",
    act: ACT_REFUSAL },
  // ---- this app -------------------------------------------------------------------
  { id: "adapterSpawn", kind: "app", stream: "app",
    startsWith: "[adapter] spawning worker", cite: "adapterSpawn",
    means: "This app starting the engine in a background worker." },
  { id: "adapterConstructed", kind: "app", stream: "app",
    startsWith: "[adapter] worker constructed", cite: "adapterConstructed",
    means: "The worker exists; the case files are being handed to it." },
  { id: "adapterDispatch", kind: "app", stream: "app",
    startsWith: "[adapter] dispatching to", cite: "adapterDispatch",
    means: "Which compiled binary the app chose, from `application`." },
  { id: "workerRc", kind: "app", stream: "app",
    startsWith: "[worker] run_case returned rc=", cite: "workerRc",
    means: "The engine's EXIT CODE, as the worker received it: 0 an answer, "
      + "1 a run that did not converge, 2 a refusal. In a terminal, `echo $?` "
      + "after the run gives the same number." },
  { id: "wasmExit", kind: "app", stream: "app",
    startsWith: "[wasm] exited with code", cite: "wasmExit",
    means: "The app repeating a non-zero exit code at the end of the log." },
  { id: "worker", kind: "app", stream: "app", startsWith: "[worker] ",
    cite: "workerLog",
    means: "The worker narrating its own steps (loading the engine, writing "
      + "the case into memory, collecting the files the run wrote)." },
];

const findMarker = (text: string, stream: LogStream): LogMarker | null => {
  const t = text.trimStart();
  for (const m of MARKERS) {
    if (m.stream !== stream) continue;
    if (m.startsWith !== undefined ? t.startsWith(m.startsWith)
      : m.pattern!.test(t)) return m;
  }
  return null;
};

/** A line made of one rule character repeated, and nothing else. */
const isRule = (text: string, ch?: string): boolean => {
  const m = /^\s*([-=>])\1{19,}\s*$/.exec(text);
  return m !== null && (ch === undefined || m[1] === ch);
};

// ---- Classifying a log --------------------------------------------------------

export type Via =
  | "marker"        // the line carries a marker of its own
  | "block"         // inside the block a marker opened (`opener`)
  | "rule"          // the rule line drawn right before a marker that opens a block
  | "continuation"; // an indented stderr line continuing the line above

export interface LogLine {
  /** 1-based line number in the log as drawn. */
  readonly n: number;
  /** The text as the engine printed it (the "[stderr] " prefix removed). */
  readonly text: string;
  readonly stream: LogStream;
  readonly blank: boolean;
  readonly kind: LogKind | "unclassified" | null;
  readonly marker: LogMarker | null;
  readonly via: Via | null;
  /** For `block`, `rule` and `continuation`: the line that gives the kind. */
  readonly from: number | null;
}

const STDERR_PREFIX = "[stderr] ";
const APP_PREFIX = /^\[(?:adapter|worker|wasm|wasm-worker|user)\] /;

/** Split a log into what the engine printed on each output.  The browser
 *  worker prefixes the engine's stderr; a line this app writes is
 *  recognised by its own bracket; everything else is the engine's stdout. */
function streamOf(raw: string): { stream: LogStream; text: string } {
  if (raw.startsWith(STDERR_PREFIX))
    return { stream: "err", text: raw.slice(STDERR_PREFIX.length) };
  if (APP_PREFIX.test(raw)) return { stream: "app", text: raw };
  return { stream: "out", text: raw };
}

/** The machine-readable result block, which the app's log view already
 *  removes (WasmAdapter `displayLogCut`) and a native run still carries. */
export function stripResultBlock(log: string): string {
  const b = log.indexOf("<<<Choupo:result-begin>>>");
  if (b < 0) return log;
  const e = log.indexOf("<<<Choupo:result-end>>>", b);
  const end = e < 0 ? log.length : e + "<<<Choupo:result-end>>>".length;
  return log.slice(0, b) + log.slice(end).replace(/^\n/, "");
}

/** Classify every line of a log, by the markers above and nothing else.
 *  The engine's stdout and stderr are followed separately -- a block opened
 *  on one is never continued by a line of the other. */
export function classifyLog(log: string): LogLine[] {
  const raws = stripResultBlock(log).replace(/\n$/, "").split("\n");
  const parsed = raws.map(streamOf);
  const out: LogLine[] = [];

  let region: { kind: LogKind; marker: LogMarker; n: number } | null = null;
  let block: { kind: LogKind; marker: LogMarker; n: number; end: BlockEnd }
    | null = null;
  let errLast: { kind: LogKind | "unclassified"; marker: LogMarker | null;
    n: number } | null = null;

  //  The marker on the next non-blank stdout line, if its own print
  //  statement draws THIS rule above it.
  const ruledOpener = (i: number, ch: string): LogMarker | null => {
    for (let j = i + 1; j < parsed.length; j++) {
      const p = parsed[j]!;
      if (p.stream !== "out" || p.text.trim() === "") continue;
      const m = findMarker(p.text, "out");
      return m && m.ruledBy === ch ? m : null;
    }
    return null;
  };

  parsed.forEach(({ stream, text }, i) => {
    const n = i + 1;
    const blank = text.trim() === "";
    const push = (kind: LogLine["kind"], marker: LogMarker | null,
      via: Via | null, from: number | null) =>
      out.push({ n, text, stream, blank, kind, marker, via, from });

    if (blank) { push(null, null, null, null); return; }

    if (stream === "app") {
      const m = findMarker(text, "app");
      push(m ? m.kind : "unclassified", m, m ? "marker" : null, null);
      return;
    }

    if (stream === "err") {
      const m = findMarker(text, "err");
      if (m) {
        push(m.kind, m, "marker", null);
        errLast = { kind: m.kind, marker: m, n };
      } else if (errLast && (/^\s/.test(text)
        || errLast.marker?.opens === "region")) {
        //  An indented line continues the one above; after ERROR: every
        //  stderr line is the refusal (it opens a region on stderr).
        push(errLast.kind, errLast.marker, "continuation", errLast.n);
      } else {
        push("unclassified", null, null, null);
        errLast = { kind: "unclassified", marker: null, n };
      }
      return;
    }

    //  stdout
    if (block) {
      const end = block.end;
      const ends = end === "region" ? false
        : "rule" in end ? isRule(text, end.rule)
        : text.trimStart().startsWith(end.startsWith);
      if (ends) {
        push(block.kind, block.marker, "block", block.n);
        block = null;
        return;
      }
      const own = findMarker(text, "out");
      if (own && own.opens) block = null;           // a new opener closes it
      else if (own) { push(own.kind, own, "marker", null); return; }
      else { push(block.kind, block.marker, "block", block.n); return; }
    }

    const ruleCh = /^\s*([-=>])\1{19,}\s*$/.exec(text)?.[1];
    if (ruleCh) {
      const opener = ruledOpener(i, ruleCh);
      if (opener) {
        //  The rule belongs to the block it introduces; `from` is filled
        //  with the opener's own line number once it is reached.
        let j = i + 1;
        while (j < parsed.length && (parsed[j]!.stream !== "out"
          || parsed[j]!.text.trim() === "")) j++;
        push(opener.kind, opener, "rule", j + 1);
        return;
      }
    }

    const m = findMarker(text, "out");
    if (m) {
      push(m.kind, m, "marker", null);
      if (m.opens === "region") region = { kind: m.kind, marker: m, n };
      else if (m.opens) block = { kind: m.kind, marker: m, n, end: m.opens };
      return;
    }
    if (region) { push(region.kind, region.marker, "block", region.n); return; }
    push("unclassified", null, null, null);
  });
  return out;
}

/** The engine's exit code, read from the worker's own line; null when the
 *  log carries none (the run is still going, or never started). */
export function exitCodeOf(log: string | null | undefined): number | null {
  if (!log) return null;
  const m = /\[worker\] run_case returned rc=(-?\d+)/.exec(log);
  return m ? Number(m[1]) : null;
}

/** What an exit code means, in the engine's own terms. */
export const EXIT_MEANING: { readonly [code: number]: {
  readonly says: string; readonly cite: CiteName } } = {
  0: { says: "an answer: every solve converged and converged/ was written",
    cite: "exit1" },
  1: { says: "no answer the run vouches for: it finished but did not "
      + "converge (or its 0/ recount failed); no converged/ was written",
    cite: "exit1" },
  2: { says: "no answer: the engine refused the case", cite: "exit2" },
};

/** Counts per kind, blank lines left out. */
export function kindCounts(lines: readonly LogLine[]):
  { [k in LogKind | "unclassified"]?: number } {
  const c: { [k in LogKind | "unclassified"]?: number } = {};
  for (const l of lines) if (l.kind) c[l.kind] = (c[l.kind] ?? 0) + 1;
  return c;
}

/** The lines of one block, opener included, in order. */
export function blockLines(lines: readonly LogLine[], markerId: string):
  LogLine[] {
  const opener = lines.find((l) => l.via === "marker" && l.marker?.id === markerId);
  if (!opener) return [];
  return lines.filter((l) => l.n === opener.n
    || ((l.via === "block" || l.via === "rule") && l.from === opener.n
      && l.marker?.id === markerId));
}

// ---- The witnesses ------------------------------------------------------------

export type RunId =
  | "flash" | "quiet" | "recycle" | "verdict" | "divergence" | "capped"
  | "refused";

export interface RunWitness {
  readonly id: RunId;
  /** The bundled tutorial, as `tutorialByName` keys it. */
  readonly case: string;
  readonly label: string;
  /** What the run is on this page to show. */
  readonly shows: string;
  /** The exit code the engine must return on it (held natively). */
  readonly exit: 0 | 1 | 2;
  /** Edits made to the in-memory copy beyond the verbosity, if any. */
  readonly overrides?: readonly DictOverride[];
  /** A break of the first page (caseAssembly.BREAKS), by id. */
  readonly breakId?: string;
  /** Marker ids this run must print (held natively, at verbosity 3). */
  readonly prints: readonly string[];
}

const PROCESS03 = "steady/flowsheets/process03_recycle";

export const RUNS: readonly RunWitness[] = [
  { id: "flash", case: CASE_ASSEMBLY_WITNESS, exit: 0,
    label: "flash01 · one flash",
    shows: "a whole run of the first case: header, one unit's Newton "
      + "iterations, its verdict, the balances, and three advisories",
    prints: ["banner", "v2GammaPhi", "stateSeeded", "unitBanner", "unitThermo",
      "flashModel", "rrNewton", "compositionLoop", "flashResult", "reportMass",
      "reportElement", "reportEnergyBoundary", "convergedWritten",
      "divergenceNone", "caveatsBlock", "psat", "cp", "unmarked"] },
  { id: "quiet", case: "steady/flash/bubbleT01_ethanol_water", exit: 0,
    label: "bubbleT01 · nothing raised",
    shows: "a run whose caveat block says \"none raised\" — and the "
      + "[unmarked] lines it does not repeat",
    prints: ["bubbleNewton", "bubbleResult", "caveatsNone", "unmarked"] },
  { id: "recycle", case: PROCESS03, exit: 0,
    label: "process03 · a recycle",
    shows: "the [plan] line, the tear's guess, the recycle iterations while "
      + "the units stay quiet, then the final pass",
    prints: ["plan", "tearGuesses", "recycleLoop", "recycleConverged",
      "finalPass", "unitInputs", "reactions"] },
  { id: "verdict", case: "steady/flash/flash13_acetic_ethanol_vacuum_flash",
    exit: 0, label: "flash13 · a verdict in numbers",
    shows: "the five numbers and the criterion behind a \"converged\"",
    prints: ["convergenceControls", "fiveNumbers", "v2Reactive", "resolver",
      "davies", "phase"] },
  { id: "divergence", case: "steady/distillation/shortcut01_benzene_toluene",
    exit: 0, label: "shortcut01 · a divergence",
    shows: "an answer to a different question, and the block that says so "
      + "above everything else",
    prints: ["divergenceBlock", "caveatsBlock"] },
  { id: "capped", case: PROCESS03, exit: 1,
    label: "process03, one iteration · exit 1",
    shows: "a recycle stopped after one iteration: a run that finishes "
      + "without an answer",
    overrides: [{ file: "system/solverDict", key: "recycleMaxIter", value: 1,
      unit: "" }],
    prints: ["recycleFailed", "summary"] },
  { id: "refused", case: CASE_ASSEMBLY_WITNESS, exit: 2,
    label: "flash01, misspelt model · exit 2",
    shows: "a refusal: the engine stops, and says why",
    breakId: "misspell-model",
    prints: ["error"] },
];

export const VERBOSITY_LEVELS = [0, 1, 2, 3, 4] as const;
export type Verbosity = typeof VERBOSITY_LEVELS[number];

/** The raw files of a witness, as run: the bundled case, the verbosity
 *  written into its controlDict, and the run's own edits.  A copy; the
 *  bundled files are never touched.  Throws when an edit misses -- a run
 *  that silently edited nothing would show the wrong thing. */
export function witnessRaw(run: RunWitness, verbosity: Verbosity):
  { [rel: string]: string } {
  const entry = tutorialByName(run.case);
  if (!entry?.files.rawFiles)
    throw new Error(`run-log witness '${run.case}' is not in the bundled corpus`);
  let raw: { [rel: string]: string } = { ...entry.files.rawFiles };
  const edits: DictOverride[] = [
    { file: "system/controlDict", key: "verbosity", value: verbosity, unit: "" },
    ...(run.overrides ?? []),
  ];
  for (const o of edits) {
    const body = raw[o.file];
    if (body === undefined)
      throw new Error(`run-log: ${o.file} is not in ${run.case}`);
    raw[o.file] = applyDictOverride(body, o);
  }
  if (run.breakId) {
    const brk = BREAKS.find((b) => b.id === run.breakId);
    if (!brk) throw new Error(`run-log: no break '${run.breakId}'`);
    raw = applyBreak(raw, brk);
  }
  return raw;
}

// ---- What each verbosity level adds ---------------------------------------------

export interface VerbosityStep {
  readonly level: Verbosity;
  /** What this level adds to the one below, measured on flash01. */
  readonly adds: string;
  /** Marker ids that first appear at this level on flash01 (held natively). */
  readonly first: readonly string[];
  readonly cite?: CiteName;
}

export const VERBOSITY: readonly VerbosityStep[] = [
  { level: 0, adds: "the header, the stream tables before and after, and "
      + "each unit's banner — never what happens inside a unit. Not silent.",
    first: ["banner", "application", "topology", "unitBanner", "summary"] },
  { level: 1, adds: "the two blocks at the end: the divergence verdict and "
      + "the caveat block.", first: ["divergenceNone", "caveatsBlock"],
    cite: "blocksGuard" },
  { level: 2, adds: "what was assembled (the property package, [state] "
      + "lines), each unit's result block with its verdict, and the reports "
      + "with their balances.",
    first: ["propertyPackage", "v2GammaPhi", "stateSeeded", "flashModel",
      "flashResult", "reportMass", "convergedWritten"],
    cite: "flashResultGuard" },
  { level: 3, adds: "the iterations: the flash's feed, its K-values and the "
      + "Rachford-Rice Newton of the first composition pass. The default, "
      + "and the level the tutorials ship with.",
    first: ["rrNewton", "compositionLoop"], cite: "flashHeaderGuard" },
  { level: 4, adds: "the Newton tables of every later composition pass too.",
    first: [], cite: "rrTableGuard" },
];
