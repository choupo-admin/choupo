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
  caseAssembly — the DATA behind "How dictionaries assemble a case"
  (DEV.md 4c C53), kept React-free so every claim the page makes can be
  held to the tree by tests/caseAssembly.test.ts.

  THE WITNESS IS A REAL CASE, READ, NEVER TYPED.  The page draws
  `tutorials/steady/flash/flash01_benzene_toluene` -- the first case of
  docs/start-here.md -- from the bundled tutorial registry
  (src/cases/tutorials.ts).  Nothing below carries a copy of its text: the
  file table names the files and says what each one DOES, and the test
  requires every bundled file to have exactly one entry and every keyword an
  entry claims the file declares to be declared in the real text.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT.  A `Cite` is a file,
  a line and a string that must be ON that line; the test opens the file and
  checks.  Citations are written ONLY through `Cite` objects -- a bare
  file-colon-line typed into prose here would be a claim nobody holds, and the
  test refuses one (the 2026-08-28/29 citation rule, CLAUDE.md 6).

  THE BREAKS EDIT A COPY, AND ONLY FILES THAT TRAVEL VERBATIM.  The browser
  does not hand the engine every file as authored: `serialiseCase`
  (adapters/WasmAdapter.ts) re-serialises controlDict, flowsheetDict and
  solverDict from the GUI's own parser, while 0/ files and
  thermoPhysPropDict go through as written.  A typo planted in a
  re-serialised dict would be answered by the GUI's parser before the engine
  ever saw it -- and this page exists to show the ENGINE's refusal.  So every
  break edits a verbatim file, and the test runs each edited copy through
  the exact file map the worker receives, natively, and requires the refusal
  it promises.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../../adapters/SolverAdapter.js";

/** The witness, as `tutorialByName` keys it. */
export const CASE_ASSEMBLY_WITNESS = "steady/flash/flash01_benzene_toluene";

// ---- Citations --------------------------------------------------------------

/** One engine (or tool) line a claim rests on.  `contains` must be ON that
 *  line -- not near it -- which is what the test checks. */
export interface Cite {
  readonly file: string;
  readonly line: number;
  readonly contains: string;
}

export const citeText = (c: Cite): string => `${c.file}:${c.line}`;

const MAIN = "src/applications/choupoSolve/main.cpp";
const FLOWSHEET = "src/unitOperations/flowsheet/Flowsheet.cpp";
const STATE_IO = "src/streams/StreamStateIO.cpp";
const DICT = "src/core/Dictionary.cpp";
const BUILDER = "src/thermo/ThermoPackageBuilder.cpp";

/** Every line this page cites, by name.  ONE home: the file table, the
 *  assembly list, the breaks and the lesson prose all reach a line through
 *  this map, so a line that moves is corrected once. */
export const CITES = {
  runCaseApplication: { file: "bin/runCase", line: 206,
    contains: "application[[:space:]]+" },
  runCaseLog: { file: "bin/runCase", line: 220,
    contains: 'LOG="$CASE_ABS/log.$APP"' },
  registerUnits: { file: MAIN, line: 458,
    contains: "UnitOperation   ::registerBuiltins();" },
  registerFlash: { file: "src/unitOperations/UnitOperation.cpp", line: 157,
    contains: 'reg("isothermalFlash"' },
  flowsheetWhere: { file: MAIN, line: 567,
    contains: 'fs::exists("flowsheetDict") ? "flowsheetDict" : "system/flowsheetDict"' },
  flowsheetRead: { file: MAIN, line: 568,
    contains: "auto flowsheetDict = Dictionary::fromFile(flowsheetPath);" },
  controlDictRead: { file: MAIN, line: 569,
    contains: 'Dictionary::fromFile(resolveUp("system/controlDict"))' },
  verbosityRead: { file: MAIN, line: 574,
    contains: 'lookupScalarOrDefault("verbosity", 3)' },
  sealVerify: { file: MAIN, line: 594, contains: "records::verifySeal(verbosity);" },
  sealFunction: { file: "src/thermo/SealCheck.cpp", line: 51,
    contains: "int verifySeal(int verbosity)" },
  thermoWhere: { file: MAIN, line: 611,
    contains: 'resolveUp("constant/thermoPhysPropDict")' },
  thermoRecordType: { file: MAIN, line: 636,
    contains: '!= "thermophysicalPropertySystem"' },
  solverDictRead: { file: MAIN, line: 680,
    contains: 'Dictionary::fromFile("system/solverDict")' },
  outerDictRead: { file: MAIN, line: 718,
    contains: 'Dictionary::fromFile("system/outerDict")' },
  postDictRead: { file: MAIN, line: 722,
    contains: 'Dictionary::fromFile("system/postDict")' },
  reportsRead: { file: MAIN, line: 729,
    contains: 'controlDict->subDict("reports")' },
  applicationRead: { file: MAIN, line: 776,
    contains: 'lookupWordOrDefault("application", "choupoSolve")' },
  thermoBuild: { file: MAIN, line: 179,
    contains: "ThermoPackage thermo = ThermoPackageBuilder::build(" },
  formulationRead: { file: BUILDER, line: 2204,
    contains: 'eq->lookupWord("formulation")' },
  activityWordRead: { file: BUILDER, line: 2610,
    contains: 'liq->entryValue("activityModel")' },
  activityLookup: { file: "src/thermo/activityCoefficient/ActivityModel.cpp",
    line: 62, contains: "registry().find(modelName)" },
  activityRefusal: { file: "src/thermo/activityCoefficient/ActivityModel.cpp",
    line: 64, contains: "throw std::runtime_error(registryRefusal::message(" },
  componentFile: { file: "src/thermo/Database.cpp", line: 167,
    contains: 'p / "constant" / "components" / (name + ".dat")' },
  componentSealed: { file: "src/thermo/Database.cpp", line: 174,
    contains: "const bool sealed = records::sealed();" },
  solve: { file: MAIN, line: 273,
    contains: "int rc = flowsheet.solve(flowsheetDict, thermo, verbosity);" },
  stateRead: { file: FLOWSHEET, line: 2109,
    contains: 'StreamStateIO::readStateDir("0", thermo)' },
  streamsBlockRefused: { file: FLOWSHEET, line: 2116,
    contains: 'if (dict->found("streams"))' },
  completeness: { file: FLOWSHEET, line: 2400,
    contains: '"Flowsheet: 0/ COMPLETENESS violated BEFORE the "' },
  completenessMissing: { file: FLOWSHEET, line: 2409,
    contains: 'msg += "  MISSING  0/"' },
  planValidate: { file: FLOWSHEET, line: 2494,
    contains: "validateSequentialPlan(tears, verbosity, &recycleLoops_)" },
  declaredOrder: { file: FLOWSHEET, line: 3034,
    contains: "for (const auto& udict : units)" },
  unitFactory: { file: FLOWSHEET, line: 1121,
    contains: "auto unit = UnitOperation::New(utype);" },
  solverMerge: { file: "src/unitOperations/flowsheet/UnitInputs.cpp", line: 125,
    contains: "if (solverDict && solverDict->found(utype))" },
  solverMergeYields: { file: "src/unitOperations/flowsheet/UnitInputs.cpp",
    line: 129, contains: "if (!out->found(key))" },
  flashModelWord: { file: "src/unitOperations/flash/IsothermalFlash.cpp",
    line: 1597, contains: 'declaredModel != "rachfordRice"' },
  flashPressureDims: { file: "src/unitOperations/flash/IsothermalFlash.cpp",
    line: 1505, contains: 'lookupScalar("P", Dims::pressure)' },
  stateT: { file: STATE_IO, line: 3119,
    contains: 'lookupScalarOrDefault("T", 0.0, Dims::temperature)' },
  stateP: { file: STATE_IO, line: 3129,
    contains: 'lookupScalarOrDefault("P", 0.0, Dims::pressure)' },
  vfCheck: { file: STATE_IO, line: 3165,
    contains: 'if (d->found("vaporFraction"))' },
  overSpecified: { file: STATE_IO, line: 3183,
    contains: "OVER-SPECIFIED -- declares T = " },
  dictComment: { file: DICT, line: 206,
    contains: "src_[pos_+1] == '/'" },
  dictSubDict: { file: DICT, line: 344,
    contains: "parseEntries(*sub, /*topLevel=*/false);" },
  unitLookup: { file: DICT, line: 456,
    contains: "units::lookupUnit(suffix)" },
  unitUnknown: { file: DICT, line: 459,
    contains: ": unknown unit suffix '" },
  unitToSI: { file: DICT, line: 465, contains: "v *= spec->factor;" },
  dimsCheck: { file: DICT, line: 925,
    contains: "it->second != expectedDims" },
  unitBar: { file: "src/core/Units.cpp", line: 54,
    contains: '{ "bar",     UnitSpec{ bar_to_Pa,   Dims::pressure } }' },
  unitKmolH: { file: "src/core/Units.cpp", line: 62,
    contains: '{ "kmol/h",  UnitSpec{ kmol_per_h_to_kmol_per_s' },
  postChain: { file: MAIN, line: 1351, contains: "pp->run(result)" },
  reportsRun: { file: MAIN, line: 1395, contains: "runReports(result);" },
  reportsDir: { file: MAIN, line: 910,
    contains: '(postProc ? "postProcessing" : "reports")' },
  convergedWrite: { file: MAIN, line: 1397, contains: "writeConverged(result);" },
  convergedOnlyIfConverged: { file: MAIN, line: 1019,
    contains: "if (!result.converged) return;" },
  convergedWipe: { file: MAIN, line: 1023, contains: "fs::remove_all(dir);" },
  designWrite: { file: MAIN, line: 1398, contains: "writeDesignSheets(result);" },
  designNone: { file: "src/io/DesignSheetWriter.cpp", line: 165,
    contains: "if (result.sizings.empty()) return 0;" },
  resultJson: { file: MAIN, line: 1425,
    contains: "emitResultJson(std::cout, result);" },
  errorPrinted: { file: MAIN, line: 1438,
    contains: 'std::cerr << "\\nERROR: " << e.what()' },
  guiCho: { file: "gui/src/ui/FlowCanvas.tsx", line: 453,
    contains: 'k.endsWith(".cho")' },
  guiReadme: { file: "gui/src/cases/tutorials.ts", line: 447,
    contains: 'entry.readme = files["README.md"]' },
  guiNoExpected: { file: "gui/src/cases/tutorials.ts", line: 114,
    contains: '"!../../../tutorials/**/expected"' },
  guiVerbatim: { file: "gui/src/adapters/WasmAdapter.ts", line: 329,
    contains: "if (caseFiles.extraFiles) {" },
} as const satisfies { [name: string]: Cite };

export type CiteName = keyof typeof CITES;

/** The text of a citation by name -- the only way prose here names a line. */
export const at = (name: CiteName): string => citeText(CITES[name]);

// ---- The three folders ------------------------------------------------------

export type FolderId = "root" | "system" | "constant" | "0";

export interface FolderQuestion {
  readonly dir: Exclude<FolderId, "root">;
  readonly question: string;
  readonly says: string;
}

/** The three questions, in the order a reader meets them. */
export const FOLDERS: readonly FolderQuestion[] = [
  { dir: "system", question: "HOW",
    says: "how to run: which binary, how loudly, which units in which "
      + "order, with which numerical options" },
  { dir: "constant", question: "WITH WHAT",
    says: "with what: the substances and the thermodynamic models the run "
      + "may use — data that does not change while the case runs" },
  { dir: "0", question: "FROM WHERE",
    says: "from where: the state of every stream before the solve, one "
      + "file per stream" },
];

// ---- The file table ---------------------------------------------------------

/** Who reads a file, when, and the line that does it. */
export interface Reader {
  readonly who: "engine" | "bin/runCase" | "the GUI";
  readonly when: string;
  readonly cite: CiteName;
}

export interface FileRole {
  /** Relative to the case root, exactly as the bundle keys it. */
  readonly path: string;
  readonly folder: FolderId;
  /** What the file says, in plain words. */
  readonly says: string;
  /** Keywords this description claims the file DECLARES.  The test requires
   *  each to be declared in the real text (`keyword` at the start of an
   *  entry), so the description cannot drift from the file. */
  readonly declares: readonly string[];
  readonly readers: readonly Reader[];
}

/** One entry per file the browser bundle carries for the witness, in the
 *  order the tree draws them.  The order is editorial (a reader meets HOW,
 *  then WITH WHAT, then FROM WHERE); the coverage is not, and is tested. */
export const FILE_ROLES: readonly FileRole[] = [
  {
    path: "flash01_benzene_toluene.cho", folder: "root",
    says: "Empty, and that is correct. It is the file the GUI opens — the "
      + "handle that says \"this folder is a Choupo case\". The engine never "
      + "opens it: runCase and choupoSolve are given the folder. The GUI may "
      + "store the canvas layout you save in it.",
    declares: [],
    readers: [
      { who: "the GUI", cite: "guiCho",
        when: "when the flowsheet canvas is drawn, to restore a saved "
          + "layout (this one is empty, so the GUI lays the canvas out "
          + "itself)" },
    ],
  },
  {
    path: "README.md", folder: "root",
    says: "The lesson that goes with the case, in prose: what it shows and "
      + "what to try. It is for you. The engine never opens it.",
    declares: [],
    readers: [
      { who: "the GUI", cite: "guiReadme",
        when: "when the tutorial list is built, so the case's lesson can be "
          + "shown beside it" },
    ],
  },
  {
    path: "system/controlDict", folder: "system",
    says: "Meta-control, no physics: `application choupoSolve;` names the "
      + "binary that runs the case, `description` is the one-line label "
      + "printed in the run header, `tier tutorial;` marks it as a case a "
      + "student meets first, `verbosity 3;` asks for every Newton "
      + "iteration to be printed, and `reports { ... }` lists the reports to "
      + "write after a converged solve.",
    declares: ["application", "description", "tier", "verbosity", "reports"],
    readers: [
      { who: "bin/runCase", cite: "runCaseApplication",
        when: "before any binary starts: the one word `application` decides "
          + "which of the five binaries runs the case" },
      { who: "engine", cite: "controlDictRead",
        when: "at start-up, right after the flowsheetDict is parsed" },
      { who: "engine", cite: "verbosityRead",
        when: "immediately, before any thermodynamics is loaded, so even "
          + "the loading is as quiet or as loud as you asked" },
      { who: "engine", cite: "reportsRead",
        when: "at start-up; the reports themselves run after the solve" },
      { who: "engine", cite: "applicationRead",
        when: "for the run header (the binary already knows what it is)" },
    ],
  },
  {
    path: "system/flowsheetDict", folder: "system",
    says: "The TOPOLOGY, and nothing else: a list of units, here one. Each "
      + "unit gives its `name`, its `type` (which C++ class to build), its "
      + "`model` (which machine inside that class), the streams it reads "
      + "(`in feed;`) and writes (`outputs ( liquid vapor );`), and the "
      + "numbers that define its OPERATION (here T and P). It names streams "
      + "and gives none of them a value.",
    declares: ["units", "name", "type", "model", "in", "outputs", "operation"],
    readers: [
      { who: "engine", cite: "flowsheetWhere",
        when: "at start-up: it is looked for at the case root first, then "
          + "under system/" },
      { who: "engine", cite: "flowsheetRead",
        when: "at start-up, the first dictionary parsed" },
      { who: "engine", cite: "declaredOrder",
        when: "during the solve: the units are run in the order this list "
          + "declares them, never re-sorted" },
      { who: "engine", cite: "unitFactory",
        when: "for each unit, as its turn comes: the `type` word is looked "
          + "up in the explicit factory every type was registered in at "
          + "start-up" },
      { who: "engine", cite: "flashModelWord",
        when: "when the flash runs: `model` must be one of the machines this "
          + "type has" },
      { who: "engine", cite: "flashPressureDims",
        when: "when the flash runs: the operation pressure is asked for AS A "
          + "PRESSURE, and a temperature found there is refused" },
    ],
  },
  {
    path: "system/solverDict", folder: "system",
    says: "Numerical options, by unit TYPE: the block `isothermalFlash { ... }` "
      + "applies to every isothermal flash in the case (tolerance, iteration "
      + "limits, the outer accelerator). A key the unit's own entry in "
      + "flowsheetDict also declares is NOT overwritten — the unit wins. "
      + "Optional: without it the built-in defaults apply.",
    declares: ["isothermalFlash", "tolerance", "maxIter"],
    readers: [
      { who: "engine", cite: "solverDictRead",
        when: "at start-up, if the file exists" },
      { who: "engine", cite: "solverMerge",
        when: "for each unit, just before it is built: the block named after "
          + "its type is merged into the unit's own entry" },
      { who: "engine", cite: "solverMergeYields",
        when: "in that merge, a key only fills a gap — the unit's own "
          + "declaration is never overwritten" },
    ],
  },
  {
    path: "constant/thermoPhysPropDict", folder: "constant",
    says: "The thermophysical system, declared rather than defaulted: the "
      + "components (`components ( benzene toluene );`), and an "
      + "`equilibrium` block saying how phases are computed — formulation "
      + "gammaPhi, a liquid with `activityModel ideal;` (gamma = 1, Raoult's "
      + "law) on the pure-liquid standard state, a vapour with "
      + "`fugacityModel idealGas;`.",
    declares: ["recordType", "schemaVersion", "components", "equilibrium",
      "formulation", "activityModel", "standardState", "fugacityModel"],
    readers: [
      { who: "engine", cite: "thermoWhere",
        when: "at start-up (a sector of a larger plant may inherit it from a "
          + "folder above)" },
      { who: "engine", cite: "thermoRecordType",
        when: "at start-up: a file that does not declare what it is is refused" },
      { who: "engine", cite: "thermoBuild",
        when: "at the start of every pass: the whole package is assembled "
          + "from this file and the component records" },
      { who: "engine", cite: "formulationRead",
        when: "inside that build: the formulation decides which phases "
          + "and models exist" },
      { who: "engine", cite: "activityWordRead",
        when: "inside that build: the liquid's model word" },
      { who: "engine", cite: "activityLookup",
        when: "the word is looked up among the registered activity models; "
          + "an unknown one is refused, with the list" },
    ],
  },
  {
    path: "constant/propertyManifest", folder: "constant",
    says: "The SEAL. `sealed true;` forbids the engine every record outside "
      + "this case: the two component files below are the only ones it may "
      + "read, and each is listed with the sha256 of the copy that was "
      + "imported and the catalogue record it came from. A sealed case runs "
      + "the same on any machine.",
    declares: ["propertyManifest", "sealed", "records"],
    readers: [
      { who: "engine", cite: "sealVerify",
        when: "at start-up, before any thermodynamics: each claimed record "
          + "is re-hashed and a changed one is announced" },
      { who: "engine", cite: "componentSealed",
        when: "each time a component is loaded: in a sealed case the "
          + "installation catalogue is forbidden" },
    ],
  },
  {
    path: "constant/components/benzene.dat", folder: "constant",
    says: "Everything Choupo knows about benzene, with sources: molar mass, "
      + "critical constants and acentric factor, normal boiling point and "
      + "latent heat, formation enthalpy and entropy, the Antoine vapour "
      + "pressure (with the temperature range it was fitted over), heat "
      + "capacities, transport properties.",
    declares: ["name", "formula", "MW", "Tc", "Pc", "vaporPressure"],
    readers: [
      { who: "engine", cite: "componentFile",
        when: "while the package is built, once for each name in "
          + "thermoPhysPropDict's `components ( ... )`" },
      { who: "engine", cite: "componentSealed",
        when: "the case is sealed, so this copy IS the record" },
    ],
  },
  {
    path: "constant/components/toluene.dat", folder: "constant",
    says: "The same record for toluene. Each record states the temperature "
      + "range its Antoine fit covers (`Trange`): toluene's runs to 380 K, "
      + "benzene's stops at 354 K, below this flash's 370 K. The run says so "
      + "out loud (the [psat] lines in the log): extrapolation is allowed, "
      + "never silent.",
    declares: ["name", "formula", "MW", "Tc", "Pc", "vaporPressure", "Trange"],
    readers: [
      { who: "engine", cite: "componentFile",
        when: "while the package is built, once for each name in "
          + "thermoPhysPropDict's `components ( ... )`" },
    ],
  },
  {
    path: "0/feed", folder: "0",
    says: "The state of the stream entering the plant — the only one you "
      + "really author here: 40 kmol/h of benzene and 60 kmol/h of toluene "
      + "(`componentMolarFlows`), at T = 370 K and P = 100000 Pa. Four "
      + "numbers, and for a two-component stream four is exactly the count "
      + "that fixes it.",
    declares: ["componentMolarFlows", "T", "P"],
    readers: [
      { who: "engine", cite: "stateRead",
        when: "at the start of the solve, after the package is built (a "
          + "stream's numbers need the component list to mean anything)" },
      { who: "engine", cite: "stateT",
        when: "T is read AS A TEMPERATURE, converted to kelvin" },
      { who: "engine", cite: "stateP",
        when: "P is read AS A PRESSURE, converted to pascal" },
      { who: "engine", cite: "vfCheck",
        when: "a third intensive value beside T and P on a mixture is "
          + "refused here" },
      { who: "engine", cite: "completeness",
        when: "before the solve: every stream the topology names must have "
          + "its file here" },
    ],
  },
  {
    path: "0/liquid", folder: "0",
    says: "A starting state for the liquid the flash will produce. The "
      + "completeness rule counts EVERY stream the flowsheet names, outlets "
      + "included, so the file must exist; the flash overwrites the values. "
      + "bin/choupo-init0 writes such files for you.",
    declares: ["componentMolarFlows", "T", "P"],
    readers: [
      { who: "engine", cite: "stateRead",
        when: "at the start of the solve, as the stream's initial state" },
      { who: "engine", cite: "completeness",
        when: "before the solve, counted like every other stream" },
    ],
  },
  {
    path: "0/vapor", folder: "0",
    says: "The same for the vapour outlet: a starting state, required by "
      + "the count, replaced by the flash's answer.",
    declares: ["componentMolarFlows", "T", "P"],
    readers: [
      { who: "engine", cite: "stateRead",
        when: "at the start of the solve, as the stream's initial state" },
      { who: "engine", cite: "completeness",
        when: "before the solve, counted like every other stream" },
    ],
  },
];

/** The depth at which the tree indents a path (`constant/components/x` = 2). */
export const depthOf = (path: string): number => path.split("/").length - 1;

/** Is `keyword` declared in this dictionary text?  An entry starts a line
 *  (after indentation) with the keyword followed by whitespace, `{` or `(`.
 *  Comments are removed first, so a keyword named in a comment does not
 *  count as declared. */
export function declaresKeyword(text: string, keyword: string): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const k = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s;{(])${k}(?=[\\s{(;])`, "m").test(code);
}

// ---- The assembly, in the order the engine does it -------------------------

export interface AssemblyMove {
  readonly what: string;
  /** The case file this move reads, when it reads one. */
  readonly reads?: string;
  readonly cite: CiteName;
}

/** What happens between `runCase <folder>` and the files a run leaves
 *  behind, one move per row, each at the line that does it. */
export const ASSEMBLY: readonly AssemblyMove[] = [
  { what: "bin/runCase reads one word, `application`, and starts that binary",
    reads: "system/controlDict", cite: "runCaseApplication" },
  { what: "the binary registers every unit type by name, in an explicit "
      + "list (no hidden self-registration)", cite: "registerUnits" },
  { what: "it parses the topology", reads: "system/flowsheetDict",
    cite: "flowsheetRead" },
  { what: "it parses the meta-control and reads the verbosity",
    reads: "system/controlDict", cite: "controlDictRead" },
  { what: "it checks the seal before trusting any record",
    reads: "constant/propertyManifest", cite: "sealVerify" },
  { what: "it finds the thermophysical system and checks it says what it is",
    reads: "constant/thermoPhysPropDict", cite: "thermoWhere" },
  { what: "it picks up the optional numerical options, if present",
    reads: "system/solverDict", cite: "solverDictRead" },
  { what: "it looks for an outer driver and a post-processing chain "
      + "(flash01 has neither)", cite: "postDictRead" },
  { what: "a pass begins: the thermodynamic package is built from "
      + "constant/, each component from its record",
    reads: "constant/components/benzene.dat", cite: "thermoBuild" },
  { what: "the solve reads every stream's state from 0/",
    reads: "0/feed", cite: "stateRead" },
  { what: "every stream the topology names must have its file, and no "
      + "file may name a stream the topology lacks", cite: "completeness" },
  { what: "the order and the recycle cuts are validated (flash01 has no "
      + "recycle)", cite: "planValidate" },
  { what: "the units run one by one, in the declared order, each built "
      + "from its `type` with its solverDict block merged in",
    reads: "system/flowsheetDict", cite: "declaredOrder" },
  { what: "after a converged pass: the post-processing chain (only with a "
      + "postDict)", cite: "postChain" },
  { what: "the reports", cite: "reportsRun" },
  { what: "the solved state is written to converged/", cite: "convergedWrite" },
  { what: "the specification sheets to design/ (only when a sizing pass "
      + "ran)", cite: "designWrite" },
];

/** What the run SAYS about its own assembly: lines of the engine's stdout,
 *  matched by their opening words, each tied to the case file it answers. */
export interface NarrationMark {
  readonly id: string;
  readonly startsWith: string;
  readonly answers?: string;
  readonly means: string;
}

export const NARRATION: readonly NarrationMark[] = [
  { id: "package", startsWith: "Property package:",
    answers: "constant/thermoPhysPropDict",
    means: "the thermophysical system was found in the case itself" },
  { id: "application", startsWith: "Application:",
    answers: "system/controlDict", means: "the binary named by `application`" },
  { id: "verbosity", startsWith: "Verbosity:", answers: "system/controlDict",
    means: "how much of the run you will see" },
  { id: "outer", startsWith: "outerDict:",
    means: "no outer driver: one pass, not a sweep" },
  { id: "post", startsWith: "postDict:",
    means: "no post-processing chain, so no sizing and no design/" },
  { id: "solver", startsWith: "solverDict:", answers: "system/solverDict",
    means: "the numerical options were found" },
  { id: "built", startsWith: "[v2 native] equilibrium",
    answers: "constant/thermoPhysPropDict",
    means: "the package, assembled from what the file declares" },
  { id: "seeded", startsWith: "[state] seeded", answers: "0/feed",
    means: "every stream's starting state read from 0/" },
  { id: "unit", startsWith: ">>>  Unit [0]:", answers: "system/flowsheetDict",
    means: "the first (and only) unit, in declared order" },
  { id: "model", startsWith: "[flash] model", answers: "system/flowsheetDict",
    means: "the machine the unit's `model` word selected" },
  { id: "complete", startsWith: "[state] 0/ complete", answers: "0/feed",
    means: "the count re-checked after the run: N streams, N files" },
  { id: "converged", startsWith: "[state] wrote converged/",
    means: "the solved state, written beside the case" },
];

/** The narration lines a log carries, in the order the log carries them. */
export function narrationOf(log: string):
  { mark: NarrationMark; line: string }[] {
  const lines = log.split("\n").map((l) => l.replace(/^\[stderr\] /, ""));
  const out: { mark: NarrationMark; line: string; at: number }[] = [];
  for (const mark of NARRATION) {
    const at = lines.findIndex((l) => l.trimStart().startsWith(mark.startsWith));
    if (at >= 0) out.push({ mark, line: lines[at]!.trim(), at });
  }
  return out.sort((a, b) => a.at - b.at).map(({ mark, line }) => ({ mark, line }));
}

// ---- What a run writes ------------------------------------------------------

/** The files a finished run handed back, grouped by the folder they live
 *  in -- read off the run result, never listed by hand. */
export function writtenFiles(r: Pick<RunResult,
  "convergedFiles" | "csvFiles" | "designFiles">):
  { folder: string; files: string[] }[] {
  const all = [
    ...Object.keys(r.convergedFiles ?? {}),
    ...Object.keys(r.csvFiles ?? {}),
    ...Object.keys(r.designFiles ?? {}),
  ];
  const by = new Map<string, string[]>();
  for (const f of all) {
    const top = f.includes("/") ? f.slice(0, f.indexOf("/")) : ".";
    by.set(top, [...(by.get(top) ?? []), f]);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, files]) => ({ folder, files: files.sort() }));
}

// ---- Breaking it ------------------------------------------------------------

export type BreakEdit =
  | { readonly kind: "remove"; readonly file: string }
  | { readonly kind: "replace"; readonly file: string;
      readonly find: string; readonly replace: string };

export interface CaseBreak {
  readonly id: "delete-feed" | "misspell-model" | "three-variables" | "unit-typo";
  readonly label: string;
  readonly edit: BreakEdit;
  /** The rule the edit breaks, in a sentence. */
  readonly rule: string;
  /** Where in the assembly the run stops. */
  readonly stopsAt: string;
  /** The line that throws the refusal. */
  readonly site: CiteName;
  /** A phrase the engine's refusal must contain (checked natively). */
  readonly expect: string;
}

export const BREAKS: readonly CaseBreak[] = [
  {
    id: "delete-feed", label: "Delete 0/feed",
    edit: { kind: "remove", file: "0/feed" },
    rule: "N streams, N files: the flowsheet names a stream called feed, so "
      + "0/ must hold a file for it.",
    stopsAt: "after the package is built and 0/ is read, before any unit runs",
    site: "completenessMissing",
    expect: "MISSING  0/feed",
  },
  {
    id: "misspell-model", label: "Misspell the activity model",
    edit: { kind: "replace", file: "constant/thermoPhysPropDict",
      find: "activityModel ideal;", replace: "activityModel idael;" },
    rule: "A word the engine dispatches on must be a word it knows: an "
      + "unknown model is refused by name, never replaced by a default.",
    stopsAt: "while the thermodynamic package is being built, before 0/ is read",
    site: "activityRefusal",
    expect: "unknown activity model 'idael'",
  },
  {
    id: "three-variables", label: "Declare T, P and vaporFraction",
    edit: { kind: "replace", file: "0/feed",
      find: "P               100000 Pa;\n",
      replace: "P               100000 Pa;\nvaporFraction   0.3;\n" },
    rule: "A stream of known component flows is fixed by two intensive "
      + "variables; for a mixture T and P already fix the vapour fraction.",
    stopsAt: "while 0/feed is being read, before the completeness count",
    site: "overSpecified",
    expect: "OVER-SPECIFIED",
  },
  {
    id: "unit-typo", label: "Write the pressure unit in lower case",
    edit: { kind: "replace", file: "0/feed",
      find: "100000 Pa;", replace: "100000 pa;" },
    rule: "A unit the parser does not know is refused where it is read; "
      + "unit names are case-sensitive (pa is not Pa).",
    stopsAt: "while 0/feed is being parsed, before any of its values is used",
    site: "unitUnknown",
    expect: "unknown unit suffix 'pa'",
  },
];

/** Apply a break to a COPY of the case's raw files.  The input map is never
 *  modified.  A `replace` must match EXACTLY ONCE, and the file must exist:
 *  a break that silently edits nothing would run the intact case and show
 *  its success as if it were the refusal -- the methodRun override rule. */
export function applyBreak(
  raw: { readonly [rel: string]: string }, brk: CaseBreak,
): { [rel: string]: string } {
  const out: { [rel: string]: string } = { ...raw };
  const e = brk.edit;
  if (out[e.file] === undefined)
    throw new Error(`break '${brk.id}': ${e.file} is not in the case`);
  if (e.kind === "remove") {
    delete out[e.file];
    return out;
  }
  const body = out[e.file]!;
  const n = body.split(e.find).length - 1;
  if (n !== 1)
    throw new Error(`break '${brk.id}': '${e.find.trim()}' occurs ${n} times `
      + `in ${e.file}, not once`);
  out[e.file] = body.replace(e.find, e.replace);
  return out;
}

/** The lines a break changes, for the page to show as removed / added. */
export function breakDiff(brk: CaseBreak):
  { file: string; kept: string[]; removed: string[]; added: string[] } {
  const e = brk.edit;
  if (e.kind === "remove")
    return { file: e.file, kept: [], removed: ["(the whole file)"], added: [] };
  const lines = (s: string) => s.split("\n").filter((l) => l.trim() !== "");
  const before = lines(e.find), after = lines(e.replace);
  return {
    file: e.file,
    kept: before.filter((l) => after.includes(l)),
    removed: before.filter((l) => !after.includes(l)),
    added: after.filter((l) => !before.includes(l)),
  };
}

/** Choupo's refusal, lifted out of a run log: the LAST `ERROR:` line and
 *  the error lines that follow it.  The browser worker prefixes every
 *  stderr line with "[stderr] "; a native run's stderr has no prefix.  Null
 *  when the log holds no refusal (the run finished). */
export function refusalOf(log: string | null | undefined): string | null {
  if (!log) return null;
  const lines = log.split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--)
    if (/^(\[stderr\] )?ERROR: /.test(lines[i]!)) { at = i; break; }
  if (at < 0) return null;
  const prefixed = lines[at]!.startsWith("[stderr] ");
  const out: string[] = [];
  for (let i = at; i < lines.length; i++) {
    const l = lines[i]!;
    if (prefixed) {
      if (!l.startsWith("[stderr] ")) break;
      out.push(l.slice("[stderr] ".length));
    } else {
      out.push(l);
    }
  }
  return out.join("\n").replace(/\s+$/, "") || null;
}
