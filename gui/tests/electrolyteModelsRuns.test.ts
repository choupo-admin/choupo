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
  The electrolyte-models EduTool: every engine run the page starts ON OPEN
  finishes, on THIS checkout's native choupoProps.

  WHY (2026-11-13).  The page started six runs on open, one of them designed
  to be refused (step 6, eNRTL on MgSO4: no record).  Its other tests passed;
  the site smoke (`bin/drive-app --edutools`), which judges every run started
  on open by its exit code, failed the page in three publications in a row and
  the site stayed unpublished.  Nothing before the push ran the page's own
  cases through the engine.  This test does, for every salt the page offers,
  with the EXACT file map the browser's worker receives
  (`serialiseCase(filesToCaseFiles(...))`, the WasmAdapter's own path), built
  by the page's own function (`emOnOpenCaseFiles` over `EM_ON_OPEN`).

  And it holds the other half: the refusal step 6 shows on the student's
  click IS a refusal, by name -- the line the page picks out of the log.

  It runs the native binary at the repository root and does not skip when it
  is absent (`make all`): a skip-when-absent check is green exactly where it
  matters.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  EM_CASE_NAME, EM_ON_OPEN, EM_REFUSAL_MS, EM_REFUSAL_SALT, EM_SALTS, emMolalities,
  emOnOpenCaseFiles, emPackageCaseFiles,
} from "../src/case/electrolyteModels.js";
import { filesToCaseFiles } from "../src/cases/tutorials.js";
import { serialiseCase } from "../src/adapters/WasmAdapter.js";
import { measuredTable } from "../src/ui/methods/electrolyteModelsData.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function runProps(files: Record<string, string>): { status: number | null; out: string; csvs: string[] } {
  const bin = join(REPO, "choupoProps");
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the repository `
    + "root; this test runs the native engine and must not skip").toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "choupo-em-"));
  try {
    for (const [rel, body] of Object.entries(serialiseCase(filesToCaseFiles(EM_CASE_NAME, files)))) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    const r = spawnSync(bin, [dir], { cwd: REPO, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
    const csvs = readdirSync(dir).filter((f) => f.endsWith(".csv"));
    return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, csvs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const lastErrorLine = (log: string): string =>
  log.split("\n").map((l) => l.trim()).reverse().find((l) => /error|fatal|refused|failed/i.test(l)) ?? "";

describe("electrolyte-models: the runs the page starts on open all finish", () => {
  for (const s of EM_SALTS) {
    const ms = emMolalities(measuredTable(s));
    for (const run of EM_ON_OPEN) {
      it(`${s.id} / ${run} exits 0`, () => {
        const r = runProps(emOnOpenCaseFiles(s, ms, run));
        expect(r.status, `${s.id} / ${run}: ${lastErrorLine(r.out)}`).toBe(0);
        //  One CSV per operation: a run that exits 0 and answers nothing is
        //  not what the page reads.
        expect(r.csvs.length).toBeGreaterThan(0);
      }, 60_000);
    }
  }
});

describe("electrolyte-models step 6: the run behind the button", () => {
  it("Pitzer on MgSO4 answers", () => {
    const r = runProps(emPackageCaseFiles(EM_REFUSAL_SALT, "Pitzer", EM_REFUSAL_MS));
    expect(r.status, lastErrorLine(r.out)).toBe(0);
    expect(r.csvs.length).toBe(EM_REFUSAL_MS.length);
  }, 60_000);

  it("eNRTL on MgSO4 is refused by name, with the line the page shows", () => {
    const r = runProps(emPackageCaseFiles(EM_REFUSAL_SALT, "eNRTL", EM_REFUSAL_MS));
    expect(r.status).not.toBe(0);
    const line = r.out.split("\n").map((l) => l.trim()).find((l) => /fatal error|no parameters/i.test(l));
    expect(line).toMatch(/no parameters for \(Mg, SO4\)/);
    expect(line).toMatch(/eNRTL\/Mg-SO4\.dat/);
  }, 60_000);
});
