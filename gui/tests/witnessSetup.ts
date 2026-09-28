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
  vitest globalSetup: GENERATE the witness outputs the GUI tests read.

  The contract is stated once, in `witnessOutputs.ts`; this file carries it
  out.  In order, and each step SAYS what it did:

    1. Is there a native build OF THIS TREE?  Asked of
       `bin/curate/check_build_fresh.py`, the one home for that question --
       never re-derived here.  If not, no witness is run (a stale binary
       would write a plausible file about a different engine) and every
       declared output is marked REFUSED with that gate's own first finding
       and the remedy `make all`.
    2. For each declared output: delete the old file, run the witness with
       THIS checkout's binary (`<repo>/<application> <case>`, exactly as
       `bin/runTests` does -- never the `$PATH` lookup `bin/runCase` prefers,
       which may resolve to another checkout's engine), and require the file
       to exist afterwards.  Deleting first is what makes a failed run
       visible: otherwise the previous run's file would be read as this one.
    3. Hand the per-output verdict to the tests (`provide`).  A test that
       reads a refused output throws the refusal; every OTHER test file still
       runs, so a checkout without a build loses exactly the files that
       need the engine and not the whole suite.

  NOT CHECKED, said plainly: whether the witness's answer is RIGHT (its own
  `expected` golden, compared by `bin/runTests`, says it has not moved); and
  the WASM build, which the GUI runs in the browser and which is separate.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { GlobalSetupContext } from "vitest/node";

import {
  REFUSAL_MARKER, REPO, WITNESS_OUTPUTS, witnessKey,
  type WitnessStatusMap,
} from "./witnessOutputs.js";

const TAG = "[witness outputs]";

function applicationOf(caseAbs: string): string {
  const cd = readFileSync(join(caseAbs, "system", "controlDict"), "utf-8");
  return /^\s*application\s+(\w+)/m.exec(cd)?.[1] ?? "choupoSolve";
}

/** The build question, asked of its one home.  Returns null when the build
 *  is a build of this tree, otherwise the gate's own finding. */
function buildRefusal(): string | null {
  const gate = join(REPO, "bin", "curate", "check_build_fresh.py");
  const r = spawnSync("python3", [gate], { cwd: REPO, encoding: "utf-8" });
  if (r.error)
    return `could not run ${gate} (${r.error.message}) -- a build check that`
      + " cannot run must not pass";
  if (r.status === 0) return null;
  //  The gate's first finding, to its first full stop: the file it names or
  //  the absence it found.  Its remedy is ours too, and is given separately.
  const finding = (r.stdout ?? "").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("check_build_fresh:"))[0]
    ?.split(/\.\s/)[0];
  return `the native build is not a build of this tree (check_build_fresh: ${
    finding ?? "FAILED"})`;
}

export default function setup({ provide }: GlobalSetupContext): void {
  const status: WitnessStatusMap = {};
  const refused = buildRefusal();

  for (const w of WITNESS_OUTPUTS) {
    const key = witnessKey(w.caseDir, w.file);
    const caseAbs = join(REPO, w.caseDir);
    const out = join(caseAbs, w.file);
    if (refused) {
      status[key] = {
        ok: false, why: refused,
        remedy: "run `make all` at the repository root, then re-run"
          + " (`bin/runTests --gui` or `cd gui && npm test`)",
      };
      continue;
    }
    const app = applicationOf(caseAbs);
    rmSync(out, { force: true });
    const t0 = Date.now();
    const r = spawnSync(join(REPO, app), [caseAbs],
      { cwd: REPO, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
    const seconds = (Date.now() - t0) / 1000;
    if (r.error || r.status !== 0 || !existsSync(out)) {
      const why = r.error ? `${app} could not start (${r.error.message})`
        : r.status !== 0 ? `${app} exited ${r.status ?? r.signal}`
        : `${app} exited 0 but wrote no ${w.file}`;
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n")
        .slice(-8).join("\n    ");
      console.log(`${TAG} ${REFUSAL_MARKER}: ${key}: ${why}\n    ${tail}`);
      status[key] = {
        ok: false, why,
        remedy: `run \`${app} ${w.caseDir}\` from the repository root and`
          + " read its log -- the witness itself is broken, not the GUI test",
      };
      continue;
    }
    console.log(`${TAG} ran ${app} ${w.caseDir} -> ${w.file}`
      + ` (${seconds.toFixed(1)} s; read by ${w.readBy.join(", ")})`);
    status[key] = { ok: true, binary: app, seconds };
  }

  if (refused)
    console.log(`${TAG} ${REFUSAL_MARKER} (all ${WITNESS_OUTPUTS.length}): ${refused}.`
      + "  Remedy: `make all`, then re-run.  The test files that read them"
      + " will refuse by name; every other test file still runs.");
  provide("witnessOutputs", status);
}
