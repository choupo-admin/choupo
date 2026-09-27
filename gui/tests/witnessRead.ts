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
  witnessOutput() -- the ONLY way a GUI test reads a run output the engine
  writes.  The contract and the list are in `witnessOutputs.ts`; the setup
  that generates the files is `witnessSetup.ts`.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { inject } from "vitest";

import {
  REFUSAL_MARKER, REPO, WITNESS_OUTPUTS, witnessKey,
} from "./witnessOutputs.js";

/** Read a declared witness output.  Throws a NAMED refusal -- never returns
 *  a substitute, never skips -- when the setup could not produce it from
 *  this tree's engine. */
export function witnessOutput(caseDir: string, file: string): string {
  const key = witnessKey(caseDir, file);
  if (!WITNESS_OUTPUTS.some((w) => witnessKey(w.caseDir, w.file) === key))
    throw new Error(`'${key}' is not declared in gui/tests/witnessOutputs.ts`
      + " -- a test may read a run output only through that list, so the"
      + " setup generates it from this tree's engine before the test runs");
  const status = inject("witnessOutputs")?.[key];
  if (!status)
    throw new Error(`${REFUSAL_MARKER}: ${key} -- the witness setup did not`
      + " run (gui/vitest.config.ts must list tests/witnessSetup.ts under"
      + " test.globalSetup)");
  if (!status.ok)
    throw new Error(`${REFUSAL_MARKER}: ${key} is a run output of`
      + ` ${caseDir} (gitignored, never committed) and could not be`
      + ` generated from this tree's engine: ${status.why}.`
      + `  Remedy: ${status.remedy}`);
  return readFileSync(join(REPO, caseDir, file), "utf-8");
}
