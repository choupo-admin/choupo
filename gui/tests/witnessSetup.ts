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
    2. For each distinct case: delete its declared outputs, run the witness
       ONCE with THIS checkout's binary (`<repo>/<application> <case>`,
       exactly as `bin/runTests` does -- never the `$PATH` lookup `bin/runCase`
       prefers, which may resolve to another checkout's engine), and require
       each declared file to exist afterwards.  Deleting first is what makes a failed run
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
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/*  ONE RUN PER DISTINCT RUN (2026-11-17).  Every witness runs with the same
    argument list (`<application> <case directory>`) and the same environment,
    so two outputs of one case are two readings of ONE run.  The list names a
    case once per output it supplies (195 entries over 49 cases when this was
    written) and each entry used to launch the engine again: swro01 98 times
    (the sixty sheet outputs and their kin; 0.7 s a run), greenAmmonia03
    twice at ~225 s a run, which was the whole wall clock of the setup.
    Now the key of a run is (case directory, application, argument list); every output of the case is
    deleted first, the case runs once, and each declared output is then
    checked on its own.  Two outputs that ever need DIFFERENT arguments must
    carry them as part of the key (`WitnessOutput.args`, not yet needed).
    Runs are scheduled longest first, so the slowest case starts at once and
    does not become the tail: the order is the case's seconds in
    `build/suiteTimings.csv` when it has a row for it, else `STATIC_WEIGHT`
    (a measured-once order, greenAmmonia03 first), else the case's own list
    position.

    THE WITNESSES RUN N-WIDE (2026-10-26, DEV.md 4c C167).  The cases run side
    by side, at most CHOUPO_JOBS at a time (default: every CPU; `bin/runTests
    -j 1` makes it 1, the old serial setup).  Each run gets CHOUPO_THREADS =
    max(1, CPUs / width) unless the caller set one, so the engine's parallel
    Jacobian does not oversubscribe the machine.  The log lines are printed
    in the list's order once every run is done, so the log does not depend
    on which run finished first. */
const STATIC_WEIGHT: Record<string, number> = {
  greenAmmonia03_basicDesign: 225,   // ~225 s a run under load (2026-11-17)
  ratebased04_schulz_delft_0p02bar: 13,
  edbatch01_constant_current: 6,
  swro01_campoDalias: 1,             // 0.7 s a run
};

function weightOf(caseDir: string): number {
  const name = caseDir.split("/").pop() ?? caseDir;
  try {
    const csv = join(REPO, "build", "suiteTimings.csv");
    if (existsSync(csv)) {
      for (const line of readFileSync(csv, "utf-8").split("\n")) {
        const f = line.split(",");
        if (f[0] === name && f[1] === "case") {
          const sec = Number.parseFloat(f[3] ?? "");
          if (Number.isFinite(sec)) return Math.max(sec, STATIC_WEIGHT[name] ?? 0);
        }
      }
    }
  } catch { /* the static order below is the fallback */ }
  return STATIC_WEIGHT[name] ?? 0;
}

export default async function setup({ provide }: GlobalSetupContext): Promise<void> {
  const status: WitnessStatusMap = {};
  const refused = buildRefusal();
  const cpus = availableParallelism();
  const jobsEnv = Number.parseInt(process.env.CHOUPO_JOBS ?? "", 10);
  const width = Number.isFinite(jobsEnv) && jobsEnv >= 1 ? jobsEnv : cpus;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (width > 1 && !env.CHOUPO_THREADS)
    env.CHOUPO_THREADS = String(Math.max(1, Math.floor(cpus / width)));

  //  one task per distinct run: the case directory (application and
  //  arguments are functions of it), its entries in list order
  const byCase = new Map<string, number[]>();
  WITNESS_OUTPUTS.forEach((w, i) => {
    const l = byCase.get(w.caseDir);
    if (l) l.push(i); else byCase.set(w.caseDir, [i]);
  });
  const logs: string[] = new Array(WITNESS_OUTPUTS.length).fill("");
  let launches = 0;

  async function runCase(entries: number[]): Promise<void> {
    const first = WITNESS_OUTPUTS[entries[0] ?? -1];
    if (!first) return;
    const caseAbs = join(REPO, first.caseDir);
    const app = applicationOf(caseAbs);
    //  every output is deleted BEFORE the one run, so a failed run is visible
    for (const i of entries) {
      const w = WITNESS_OUTPUTS[i];
      if (w) rmSync(join(caseAbs, w.file), { force: true, recursive: w.dir === true });
    }
    const t0 = Date.now();
    launches++;
    const r = await runAsync(join(REPO, app), [caseAbs], env);
    const seconds = (Date.now() - t0) / 1000;
    for (const i of entries) {
      const w = WITNESS_OUTPUTS[i];
      if (!w) continue;
      const key = witnessKey(w.caseDir, w.file);
      const out = join(caseAbs, w.file);
      if (w.stdout && !r.error && r.status === 0) writeFileSync(out, r.stdout ?? "");
      //  a directory witness must come back NON-EMPTY: an empty `design/` is a
      //  run that sized nothing, and a sweep over it would pass on nothing
      const written = existsSync(out) && (!w.dir || readdirSync(out).length > 0);
      if (r.error || r.status !== 0 || !written) {
        const why = r.error ? `${app} could not start (${r.error.message})`
          : r.status !== 0 ? `${app} exited ${r.status ?? r.signal}`
          : `${app} exited 0 but wrote no ${w.dir ? "file under " : ""}${w.file}`;
        const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n")
          .slice(-8).join("\n    ");
        logs[i] = `${TAG} ${REFUSAL_MARKER}: ${key}: ${why}\n    ${tail}`;
        status[key] = {
          ok: false, why,
          remedy: `run \`${app} ${w.caseDir}\` from the repository root and`
            + " read its log -- the witness itself is broken, not the GUI test",
        };
        continue;
      }
      logs[i] = `${TAG} ran ${app} ${w.caseDir} -> ${w.file}`
        + ` (${seconds.toFixed(1)} s, one run for ${entries.length} output`
        + `${entries.length === 1 ? "" : "s"}; read by ${w.readBy.join(", ")})`;
      status[key] = { ok: true, binary: app, seconds };
    }
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
    //  longest first (stable: equal weights keep the list's order)
    const queue = [...byCase.entries()]
      .map(([caseDir, entries], pos) => ({ entries, pos, wt: weightOf(caseDir) }))
      .sort((a, b) => b.wt - a.wt || a.pos - b.pos)
      .map((t) => t.entries);
    const worker = async (): Promise<void> => {
      for (let entries = queue.shift(); entries; entries = queue.shift())
        await runCase(entries);
    };
    await Promise.all(Array.from({ length: Math.min(width, queue.length) }, worker));
    for (const l of logs) if (l) console.log(l);
    console.log(`${TAG} ${launches} engine launches for ${WITNESS_OUTPUTS.length}`
      + " declared outputs (one per distinct case).");
  }

  if (refused)
    console.log(`${TAG} ${REFUSAL_MARKER} (all ${WITNESS_OUTPUTS.length}): ${refused}.`
      + "  Remedy: `make all`, then re-run.  The test files that read them"
      + " will refuse by name; every other test file still runs.");
  provide("witnessOutputs", status);
}
