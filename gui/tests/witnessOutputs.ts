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
  WITNESS OUTPUTS -- the engine's own run outputs that a GUI test reads.

  THE CONTRACT (2026-09-27).  A few GUI tests hold a construction to what the
  engine ACTUALLY computed -- a staircase that must walk back down onto the
  pot, a lesson whose "friction grows as Q^2" is recomputed from the sweep --
  and so they read a file the engine WRITES: `txy.csv`, `ternary.csv`,
  `trajectory.csv`, a sweep CSV.  Every one of those is a RUN OUTPUT, matched
  by the root `.gitignore`'s rule for every CSV under `tutorials/` (only
  `constant/experimental/` is re-included) and never committed.  Until today the
  tests read them straight off disk and said, in their own headers, that the
  witness "ships" the file.  It never did: the tests passed on a machine that
  had run the corpus and failed in every fresh clone and worktree with an
  assertion that read like a regression -- a check whose red means "you have
  not run something" teaches its reader to ignore red.

  So the file is GENERATED, never assumed, and never committed:

    * THIS LIST is the one home for "which run outputs do the GUI tests read".
      A test reads a witness output ONLY through `witnessOutput()`
      (`witnessRead.ts`), which refuses a (case, file) pair not declared here
      -- so a new reader cannot quietly go back to reading whatever happens
      to be on disk.  (Two files, not one, because this one is imported by
      the globalSetup, which runs outside vitest's worker and may not import
      the `vitest` runtime; the reader needs its `inject`.)
    * `witnessSetup.ts` (vitest `globalSetup`) RUNS every witness below with
      THIS checkout's native binary before any test file loads, after
      deleting the old output, so what a test reads is the output of the
      engine in this tree -- not whatever binary ran last (CLAUDE.md §6, the
      `converged/` sweep trap).  It says what it ran, one line per witness.
    * When it CANNOT run one -- no native build, a build older than the
      source, a witness that exits non-zero or writes no such file -- the
      reading test REFUSES by name with the command that fixes it.  It never
      skips: a skip-when-absent check is permanently green in exactly the
      checkout where it matters.

  Why not commit the files (the `constant/experimental/` whitelist two lines
  below the ignore rule)?  Three reasons, each sufficient.  A committed run
  output is a SECOND GOLDEN with no tolerance, rewritten by every run of its
  case, so the tree goes dirty the first time the engine moves a digit.  The
  GUI bundle's eager glob (`src/cases/tutorials.ts`) refuses these files by
  the SAME location rule `.gitignore` uses (every CSV under `tutorials/`
  except one sitting directly in a case's `constant/experimental/`), because
  the worker harvests every CSV under the case root as a RUN output -- a
  bundled one would be drawn as a run's answer.
  A committed copy would therefore be a file the site deliberately refuses to
  carry, and moving it under `constant/experimental/` to get it bundled would
  file an engine output as measured data.  And the
  tests' own premise is that they read the ENGINE, which a file frozen on one
  day is not.

  Why not a transcription beside the test (the `designSheet.test.ts`
  precedent)?  That precedent needs a gate that re-runs the witness to hold
  the transcription to it -- which needs the same native build this does, to
  keep a second copy of the same numbers.
\*---------------------------------------------------------------------------*/

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface WitnessOutput {
  /** The witness case, relative to the repository root. */
  readonly caseDir: string;
  /** The run output a test reads, relative to the case directory. */
  readonly file: string;
  /** Which test files read it -- documentation for the reader of a refusal. */
  readonly readBy: readonly string[];
  /** The run's STDOUT is the output (written to `file` by the setup), for a
   *  result the engine publishes only there -- the structured result block
   *  between its `<<<Choupo:result-...>>>` markers, which no binary writes
   *  to disk.  `file` must then be a `log.choupo<App>` name: gitignored by
   *  the root `.gitignore`'s `log.choupo*` rule under tutorials/ and kept out
   *  of the GUI bundle by the glob's `log.*` exclusion, like every run log. */
  readonly stdout?: true;
  /** `file` is a DIRECTORY the run writes (`design/`, one sheet per sized
   *  item), read whole by `witnessOutputFiles()`: a sweep over "every sheet
   *  this run wrote" cannot name the files in advance, which a per-file
   *  entry would have to.  The setup deletes the old tree first and
   *  requires a non-empty one afterwards, so a run that wrote nothing is a
   *  refusal and not a silently empty sweep (C269). */
  readonly dir?: true;
}

/** THE list.  Add an entry here, not a `readFileSync` in a test. */
export const WITNESS_OUTPUTS: readonly WitnessOutput[] = [
  {
    caseDir: "tutorials/props/scan/ternary03_lle_water_ethanol_benzene",
    file: "ternary.csv",
    readBy: ["hunterNash.test.ts"],
  },
  {
    caseDir: "tutorials/props/molecular/flash01_operating_line",
    file: "txy.csv",
    readBy: ["flashOperatingLineTool.test.ts", "batchStaircase.test.ts"],
  },
  {
    caseDir: "tutorials/batch/still/still04_rectifier_benzene_toluene",
    file: "trajectory.csv",
    readBy: ["batchStaircase.test.ts"],
  },
  //  The PFD sheet (S2): the engine's own stream table, which the sheet's
  //  columns are held to row by row.
  {
    caseDir: "tutorials/batch/plant/donepezil01_tablets",
    file: "reports/streams/streamTable.csv",
    readBy: ["pfdSheet.test.ts"],
  },
  {
    caseDir: "tutorials/steady/hydraulics/pumpSystem01_operating_point",
    file: "sweep_pumpSystem.csv",
    readBy: ["pumpSystemLesson.test.ts"],
  },
  //  The salt-mixtures EduTool (C316): the page's own Pitzer gamma_+- held to
  //  the engine's single-salt kernel, NaCl and KCl at 25 C and NaCl at 100 C.
  {
    caseDir: "tutorials/props/electrolyte/pitzer_gamma_hamer_wu",
    file: "pitzer_nacl.csv",
    readBy: ["saltMixing.test.ts"],
  },
  {
    caseDir: "tutorials/props/electrolyte/pitzer_gamma_hamer_wu",
    file: "pitzer_kcl.csv",
    readBy: ["saltMixing.test.ts"],
  },
  {
    caseDir: "tutorials/props/electrolyte/pitzer_hmw_hot_agreement",
    file: "kernel_nacl_100C.csv",
    readBy: ["saltMixing.test.ts"],
  },
  //  The element-potential lesson (C15): the gibbsReactor's opt-in
  //  `newtonLog`, one file per reactor that declares it.
  {
    caseDir: "tutorials/steady/gibbs/gibbs12_element_potential_newton",
    file: "newtonLog_shift.csv",
    readBy: ["elementPotentialLesson.test.ts"],
  },
  {
    caseDir: "tutorials/steady/gibbs/gibbs12_element_potential_newton",
    file: "newtonLog_coking.csv",
    readBy: ["elementPotentialLesson.test.ts"],
  },
  {
    caseDir: "tutorials/steady/gibbs/gibbs12_element_potential_newton",
    file: "newtonLog_ammonia.csv",
    readBy: ["elementPotentialLesson.test.ts"],
  },
  {
    caseDir: "tutorials/steady/gibbs/gibbs07_wgs_cooled",
    file: "newtonLog.csv",
    readBy: ["elementPotentialLesson.test.ts"],
  },
  //  The Kern-designed exchanger datasheet (C51): the specification sheets
  //  the green-ammonia plant's sizing pass writes under `design/` -- a
  //  two-stream interchanger in four shells, a condensing cooler against
  //  cooling water, and a condensing chiller against a boiling refrigerant.
  {
    caseDir: "tutorials/plant/greenAmmoniaPEQ_baseCase",
    file: "design/FEHE/shellTubeHX",
    readBy: ["hxDatasheet.test.ts"],
  },
  {
    caseDir: "tutorials/plant/greenAmmoniaPEQ_baseCase",
    file: "design/WaterCooler/shellTubeHX",
    readBy: ["hxDatasheet.test.ts"],
  },
  {
    caseDir: "tutorials/plant/greenAmmoniaPEQ_baseCase",
    file: "design/Chiller/shellTubeHX",
    readBy: ["hxDatasheet.test.ts"],
  },
  //  The process-safety EduTool (C60): the two cooling-failure witnesses'
  //  trajectories, and the converged loop streams of the two feasibility
  //  cases the inventory lesson compares.
  {
    caseDir: "tutorials/batch/reactor/batch26_cooling_failure",
    file: "trajectory.csv",
    readBy: ["processSafety.test.ts"],
  },
  {
    caseDir: "tutorials/batch/reactor/batch27_semibatch_dosing",
    file: "trajectory.csv",
    readBy: ["processSafety.test.ts"],
  },
  //  The overpressure EduTool (C61) reads the same PreheatedFeed files: its
  //  loop witness copies each plant's converter feed, and its test holds the
  //  copy to them.
  ...["greenAmmonia02_feasibility150bar", "greenAmmonia02_feasibility50bar"].flatMap(
    (c) => ["Recycle", "PreheatedFeed", "HotEffluent"].map((s) => ({
      caseDir: `tutorials/plant/${c}`,
      file: `converged/${s}`,
      readBy: s === "PreheatedFeed"
        ? ["processSafety.test.ts", "overpressure.test.ts"]
        : ["processSafety.test.ts"],
    }))),
  //  The pressure-letdown EduTool (C64): its witness copies the basic
  //  design's separator liquid and purge, and its props witness copies the
  //  20 bar drum liquid letdown01 itself converges to; the test holds each
  //  copy to the file it was taken from.  The plant is SECTORED since
  //  DEV.md 4c C69 (its beds are the CONVERTER sector), so its state views
  //  repeat the geography and a plant-level stream lives under MAIN/.
  ...["RawLiquid", "Purge"].map((s) => ({
    caseDir: "tutorials/plant/greenAmmonia03_basicDesign",
    file: `converged/MAIN/${s}`,
    readBy: ["letdown.test.ts"],
  })),
  {
    caseDir: "tutorials/steady/hydraulics/letdown01_ammonia_flashing",
    file: "converged/LetdownLiquid",
    readBy: ["letdown.test.ts"],
  },
  //  Why correlations are simple (C119): the engine's own friction-factor
  //  and Nusselt correlations swept over Re, which the page draws,
  //  differentiates and fits.
  ...["moodySweep.csv", "nusseltSweep.csv"].map((file) => ({
    caseDir: "tutorials/props/hydraulics/moody02_correlation_sweeps",
    file,
    readBy: ["correlationSimplicityLesson.test.ts"],
  })),
  //  Data reconciliation, and how Bayes helps (C121): the engine's
  //  reconciliation of an invented recycle loop, its tests and its posterior
  //  covariance, which the page reads through its own CSV readers.
  ...["honest", "drifted", "without", "prior"].flatMap((op) =>
    ["streams", "balances", "covariance"].map((t) => `${op}_${t}.csv`)).map((file) => ({
    caseDir: "tutorials/props/reconciliation/reconcile01_recycle_loop",
    file,
    readBy: ["dataReconciliationLesson.test.ts"],
  })),
  //  The solvent-selection EduTool (C128): the hansenMixture CSVs of its
  //  three witnesses -- the synthetic pair, polystyrene's two hexane blends,
  //  and the thirteen-solvent screen the thesis's ratings are drawn beside.
  {
    caseDir: "tutorials/props/solvents/solvent01_synthetic_mixture",
    file: "hansenMixture.csv",
    readBy: ["solventMixtureLesson.test.ts"],
  },
  ...["hansen_hexane_acetone.csv", "hansen_hexane_nitromethane.csv"].map((file) => ({
    caseDir: "tutorials/props/solvents/solvent02_polystyrene_hexane_blends",
    file,
    readBy: ["solventMixtureLesson.test.ts"],
  })),
  {
    caseDir: "tutorials/props/solvents/solvent03_polystyrene_observed",
    file: "hansen_screen.csv",
    readBy: ["solventMixtureLesson.test.ts"],
  },
  //  The Explorer's phase-split lens (C118 stage 2): the scan's CSV and the
  //  run's stdout, whose result block (`phaseSplitScans`) the adapter reads
  //  -- the test holds the block's shaping to the CSV of the same run.
  {
    caseDir: "tutorials/props/thermo/phaseSplit01_freeze_water_ethanol",
    file: "freeze.csv",
    readBy: ["phaseSplitScan.test.ts"],
  },
  {
    caseDir: "tutorials/props/thermo/phaseSplit01_freeze_water_ethanol",
    file: "log.choupoProps",
    readBy: ["phaseSplitScan.test.ts"],
    stdout: true,
  },
  //  The sle-pair EduTool's NRTL (DEV.md 4c C316): the page transcribes the
  //  engine's NRTL loop, and the test holds it to the gamma this run prints
  //  (12 significant digits in the result block) for the catalogue pair.
  {
    caseDir: "tutorials/props/molecular/nrtl01_ethanol_water_package",
    file: "log.choupoProps",
    readBy: ["slePair.test.ts"],
    stdout: true,
  },
  //  A props run's VIEWS (DEV.md 4c C149): the result block's `postProcessing`
  //  description, held to the CSVs the same run wrote under postProcessing/.
  //  The CSV entries come first and the stdout one last, so the files on
  //  disk when the test reads them are the last run's -- the run whose log it
  //  reads.  isotherm02 carries the generic fit defaults, polarisation01 a
  //  bench's defaults and the views its propsDict declares.
  {
    caseDir: "tutorials/props/adsorption/isotherm02_fit_jaschik",
    file: "postProcessing/fit_jaschik/parity.csv",
    readBy: ["postProcessing.test.ts"],
  },
  {
    caseDir: "tutorials/props/adsorption/isotherm02_fit_jaschik",
    file: "postProcessing/fit_jaschik/parameters.csv",
    readBy: ["postProcessing.test.ts"],
  },
  {
    caseDir: "tutorials/props/adsorption/isotherm02_fit_jaschik",
    file: "log.choupoProps",
    readBy: ["postProcessing.test.ts"],
    stdout: true,
  },
  {
    caseDir: "tutorials/props/membrane/polarisation01_geraldes_afonso_table1",
    file: "postProcessing/table1/rejection_dye4.csv",
    readBy: ["postProcessing.test.ts"],
  },
  {
    caseDir: "tutorials/props/membrane/polarisation01_geraldes_afonso_table1",
    file: "postProcessing/table1/rows.csv",
    readBy: ["postProcessing.test.ts"],
  },
  {
    caseDir: "tutorials/props/membrane/polarisation01_geraldes_afonso_table1",
    file: "log.choupoProps",
    readBy: ["postProcessing.test.ts", "citation.test.ts"],
    stdout: true,
  },
  //  The batch plan's Gantt chart (DEV.md 4c C99, C110 G5): apalutamide01's
  //  run log, whose result block (`batchPlan`) the adapter reads, held to
  //  the gantt.csv its `batchPlan {}` pass writes from the same record.
  //  The gantt.csv first and the stdout last, so the file on disk when the
  //  test reads it is the run's whose log it reads.
  {
    caseDir: "tutorials/batch/plant/apalutamide01_tablets",
    file: "reports/batchPlan/gantt.csv",
    readBy: ["batchGantt.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/apalutamide01_tablets",
    file: "log.choupoSolve",
    readBy: ["batchGantt.test.ts", "citation.test.ts", "machineUtilisation.test.ts"],
    stdout: true,
  },
  //  The per-machine utilisation table (DEV.md 4c C195/C210): the two tablet
  //  plants' run logs (apalutamide01's is the entry above), whose result blocks carry `equipment` (the
  //  `ratedMachine` sheets) and the sizing advisories.
  {
    caseDir: "tutorials/batch/plant/donepezil01_tablets",
    file: "log.choupoSolve",
    readBy: ["machineUtilisation.test.ts"],
    stdout: true,
  },
  //  THE DESALINATION PLANT'S SHEETS AND RESULT (DEV.md 4c C199 phase B): the
  //  seven sized kinds of six trains (42 sheets) and the structured result
  //  (layout + building), read by the tests that build the 3D bank model and
  //  every 2D drawing of the hall from the case's REAL run output.
  ...["HPpump", "Booster", "Pass2Pump", "PX", "RO1", "RO2a", "RO2b"].flatMap((u) =>
    [1, 2, 3, 4, 5, 6].map((k) => ({
      caseDir: "tutorials/plant/swro01_campoDalias",
      file: `design/${u}/train${k}`,
      readBy: ["roHallDrawings.test.ts", "membraneBankModel.test.ts"],
    }))),
  //  the header sheets (C199, the header sizer): unit = the bank, tag train<k>.<role>
  ...["RO1", "RO2a", "RO2b"].flatMap((u) =>
    [1, 2, 3, 4, 5, 6].flatMap((k) => ["feed", "brine", "permeate"].map((role) => ({
      caseDir: "tutorials/plant/swro01_campoDalias",
      file: `design/${u}/train${k}.${role}`,
      readBy: ["roHallDrawings.test.ts", "membraneBankModel.test.ts"],
    })))),
  {
    caseDir: "tutorials/plant/swro01_campoDalias",
    file: "log.choupoSolve",
    readBy: ["roHallDrawings.test.ts", "membraneBankModel.test.ts"],
    stdout: true,
  },
  //  The campaign-plan EduTool (DEV.md 4c C249 c): the batch plans the
  //  engine PUBLISHED for the two cases its engine halves draw, which the
  //  toy's TypeScript method is held to (1e-6) in campaignPlan.test.ts.
  {
    caseDir: "tutorials/batch/plant/apalutamide01_tablets",
    file: "reports/batchPlan/stages.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/apalutamide01_tablets",
    file: "reports/batchPlan/trains.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/apalutamide01_tablets",
    file: "reports/batchPlan/gantt.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/donepezil02_two_strengths",
    file: "reports/batchPlan/products.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/donepezil02_two_strengths",
    file: "reports/batchPlan/productStages.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/donepezil02_two_strengths",
    file: "reports/batchPlan/productTrains.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/donepezil02_two_strengths",
    file: "reports/batchPlan/stages.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/donepezil02_two_strengths",
    file: "reports/batchPlan/trains.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  {
    caseDir: "tutorials/batch/plant/donepezil02_two_strengths",
    file: "reports/batchPlan/gantt.csv",
    readBy: ["campaignPlan.test.ts"],
  },
  //  The stack-dispersion EduTool (DEV.md 4c C247): the burner's outlet
  //  stream, which the engine half READS (flow, T, P, NO) and the test holds
  //  the page's emission rate to, by hand, from the published NO flow.
  {
    caseDir: "tutorials/steady/gibbs/gibbs06_thermal_nox",
    file: "converged/flueGas",
    readBy: ["stackDispersion.test.ts"],
  },
  //  EVERY SPECIFICATION SHEET A RUN WRITES PARSES WITH THE APP'S OWN PARSER
  //  (DEV.md 4c C269, after the C266 walk met sheets the app refused whole:
  //  `m3/yr` on the purified-water generator of every tablet plant, `um` and
  //  `rpm` on the spray dryer's design sheet).  The `design/` trees of the
  //  writers that failed and of the gate's own flat and multi-item witnesses,
  //  swept whole by designSheetCorpus.test.ts; swro01's 60 sheets are the
  //  per-file entries above and are swept by the same test.
  {
    caseDir: "tutorials/batch/plant/donepezil01_tablets",
    file: "design",
    readBy: ["designSheetCorpus.test.ts"],
    dir: true,
  },
  {
    caseDir: "tutorials/steady/drying/sprayDryer07_design",
    file: "design",
    readBy: ["designSheetCorpus.test.ts"],
    dir: true,
  },
  {
    caseDir: "tutorials/steady/flowsheets/process02_with_design",
    file: "design",
    readBy: ["designSheetCorpus.test.ts"],
    dir: true,
  },
  {
    caseDir: "tutorials/steady/distillation/column09_tray_hydraulics",
    file: "design",
    readBy: ["designSheetCorpus.test.ts"],
    dir: true,
  },
  {
    caseDir: "tutorials/plant/swro01_campoDalias",
    file: "design",
    readBy: ["designSheetCorpus.test.ts"],
    dir: true,
  },
  //  THE STREAM CARD AGAINST THE STREAMS TABLE on a solid-carrying case
  //  (C266 S1 / C269): the canvas card added the solid part to an F that
  //  already held it.  solidDryer01's result block (`drySolid` is sugar and
  //  water, F_solid_mass > 0) is what streamCardFlow.test.ts holds the card to.
  {
    caseDir: "tutorials/steady/drying/solidDryer01_sugar",
    file: "log.choupoSolve",
    readBy: ["streamCardFlow.test.ts"],
    stdout: true,
  },
  //  THE OPERATOR PANEL (DEV.md 4c C371, the operator-panels EduTool): the
  //  engine's own `panel` block for the shipped edbatch01 panelDict, which the
  //  page's reader (adapters/panelPayload via extractStructured) must carry
  //  unchanged, and the trajectory its stale-answer guard reads.
  {
    caseDir: "tutorials/batch/electrodialysis/edbatch01_constant_current",
    file: "log.choupoBatch",
    readBy: ["operatorPanels.test.ts", "panelWorkspace.test.ts"],
    stdout: true,
  },
  {
    caseDir: "tutorials/batch/electrodialysis/edbatch01_constant_current",
    file: "trajectory.csv",
    readBy: ["operatorPanels.test.ts", "panelWorkspace.test.ts"],
  },
];

/** What `witnessSetup.ts` found for each declared output, keyed by
 *  `witnessKey()`.  `ok: false` carries the refusal and its remedy. */
export type WitnessStatus =
  | { ok: true; binary: string; seconds: number }
  | { ok: false; why: string; remedy: string };

export type WitnessStatusMap = { [key: string]: WitnessStatus };

declare module "vitest" {
  export interface ProvidedContext {
    witnessOutputs: WitnessStatusMap;
  }
}

export const witnessKey = (caseDir: string, file: string): string =>
  `${caseDir}/${file}`;

/** The marker every refusal carries -- the reader's thrown error and the
 *  setup's console line alike -- and the one `bin/runTests` looks for to
 *  report REFUSED rather than FAIL.  Changing it means changing both. */
export const REFUSAL_MARKER = "WITNESS OUTPUT REFUSED";
