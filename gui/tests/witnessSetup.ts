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

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
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

/** One witness run, as a promise: spawnSync's answer, asynchronously, so
 *  several cases can run at once.  stdout and stderr are kept whole. */
function runAsync(cmd: string, args: string[], env: NodeJS.ProcessEnv):
    Promise<{ status: number | null; signal: string | null; stdout: string;
              stderr: string; error?: Error }> {
  return new Promise((resolve) => {
    const out: Buffer[] = [], err: Buffer[] = [];
    let child;
    try {
      child = spawn(cmd, args, { cwd: REPO, env });
    } catch (e) {
      resolve({ status: null, signal: null, stdout: "", stderr: "", error: e as Error });
      return;
    }
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.on("error", (e) => resolve({ status: null, signal: null,
      stdout: "", stderr: "", error: e }));
    child.on("close", (status, signal) => resolve({ status, signal,
      stdout: Buffer.concat(out).toString("utf-8"),
      stderr: Buffer.concat(err).toString("utf-8") }));
  });
}

/*  THE WITNESSES RUN N-WIDE (2026-10-26, DEV.md 4c C167).  They were run one
    after another, which on a ten-core laptop held the whole suite on one core
    for minutes.  Now each CASE is one task -- its declared outputs still in
    the order this list gives them, one run each, exactly as before, because
    "the files on disk when the test reads them are the last run's" is a
    promise about one case's own sequence -- and the cases run side by side,
    at most CHOUPO_JOBS at a time (default: every CPU; `bin/runTests -j 1`
    makes it 1, the old serial setup).  Each run gets CHOUPO_THREADS =
    max(1, CPUs / width) unless the caller set one, so the engine's parallel
    Jacobian does not oversubscribe the machine.  The log lines are printed
    in the list's order once every case is done, so the log does not depend
    on which run finished first. */
export default async function setup({ provide }: GlobalSetupContext): Promise<void> {
  const status: WitnessStatusMap = {};
  const refused = buildRefusal();
  const cpus = availableParallelism();
  const jobsEnv = Number.parseInt(process.env.CHOUPO_JOBS ?? "", 10);
  const width = Number.isFinite(jobsEnv) && jobsEnv >= 1 ? jobsEnv : cpus;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (width > 1 && !env.CHOUPO_THREADS)
    env.CHOUPO_THREADS = String(Math.max(1, Math.floor(cpus / width)));

  //  one task per case, its entries in list order
  const byCase = new Map<string, number[]>();
  WITNESS_OUTPUTS.forEach((w, i) => {
    const l = byCase.get(w.caseDir);
    if (l) l.push(i); else byCase.set(w.caseDir, [i]);
  });
  const logs: string[] = new Array(WITNESS_OUTPUTS.length).fill("");

  async function runEntry(i: number): Promise<void> {
    const w = WITNESS_OUTPUTS[i];
    if (!w) return;
    const key = witnessKey(w.caseDir, w.file);
    const caseAbs = join(REPO, w.caseDir);
    const out = join(caseAbs, w.file);
    const app = applicationOf(caseAbs);
    rmSync(out, { force: true });
    const t0 = Date.now();
    const r = await runAsync(join(REPO, app), [caseAbs], env);
    const seconds = (Date.now() - t0) / 1000;
    if (w.stdout && !r.error && r.status === 0) writeFileSync(out, r.stdout ?? "");
    if (r.error || r.status !== 0 || !existsSync(out)) {
      const why = r.error ? `${app} could not start (${r.error.message})`
        : r.status !== 0 ? `${app} exited ${r.status ?? r.signal}`
        : `${app} exited 0 but wrote no ${w.file}`;
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n")
        .slice(-8).join("\n    ");
      logs[i] = `${TAG} ${REFUSAL_MARKER}: ${key}: ${why}\n    ${tail}`;
      status[key] = {
        ok: false, why,
        remedy: `run \`${app} ${w.caseDir}\` from the repository root and`
          + " read its log -- the witness itself is broken, not the GUI test",
      };
      return;
    }
    logs[i] = `${TAG} ran ${app} ${w.caseDir} -> ${w.file}`
      + ` (${seconds.toFixed(1)} s; read by ${w.readBy.join(", ")})`;
    status[key] = { ok: true, binary: app, seconds };
  }

  if (refused) {
    for (const w of WITNESS_OUTPUTS) {
      status[witnessKey(w.caseDir, w.file)] = {
        ok: false, why: refused,
        remedy: "run `make all` at the repository root, then re-run"
          + " (`bin/runTests --gui` or `cd gui && npm test`)",
      };
    }
  } else {
    const queue = [...byCase.values()];
    const worker = async (): Promise<void> => {
      for (let entries = queue.shift(); entries; entries = queue.shift())
        for (const i of entries) await runEntry(i);
    };
    await Promise.all(Array.from({ length: Math.min(width, queue.length) }, worker));
    for (const l of logs) if (l) console.log(l);
  }

  if (refused)
    console.log(`${TAG} ${REFUSAL_MARKER} (all ${WITNESS_OUTPUTS.length}): ${refused}.`
      + "  Remedy: `make all`, then re-run.  The test files that read them"
      + " will refuse by name; every other test file still runs.");
  provide("witnessOutputs", status);
}
