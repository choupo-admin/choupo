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
  the SAME location rule `.gitignore` uses (every `tutorials/**/*.csv` except
  `constant/experimental/*.csv`), because the worker harvests every case-root
  `*.csv` as a RUN output -- a bundled one would be drawn as a run's answer.
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
  {
    caseDir: "tutorials/steady/hydraulics/pumpSystem01_operating_point",
    file: "sweep_pumpSystem.csv",
    readBy: ["pumpSystemLesson.test.ts"],
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
