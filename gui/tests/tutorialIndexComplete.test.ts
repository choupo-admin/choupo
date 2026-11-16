// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
/*---------------------------------------------------------------------------*\
  Every runnable tutorial on disk is in the GUI's tutorial index.

  The index SKIPS a case whose dictionaries its parser cannot read (it warns
  and moves on, so one bad folder never kills the catalogue).  That made two
  shipped cases (liquidDiffusivity01 and 02, "unknown unit suffix 'cm2/s'")
  silently unopenable in the app (C398 slice d2, review row VB-09).  This test
  holds the other half: a folder that carries a system/flowsheetDict or a
  system/propsDict is a case, and a case is in the index.  The one folder the
  index is DESIGNED to pass over (props/curation/fixtures, which carries
  fixtures and neither dictionary) is not a case and so not a counter-example.
\*---------------------------------------------------------------------------*/
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { TUTORIALS } from "../src/cases/tutorials.js";

const ROOT = resolve(__dirname, "..", "..", "tutorials");

function caseFolders(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let isDir = false;
    try { isDir = statSync(p).isDirectory(); } catch { /* a dangling link */ }
    if (!isDir || name === "system" || name === "constant" || name === "expected") continue;
    if (existsSync(join(p, "system", "flowsheetDict")) || existsSync(join(p, "system", "propsDict"))) {
      out.push(relative(ROOT, p));        // a case: its sub-folders are its own nodes, not cases
      continue;
    }
    caseFolders(p, out);
  }
}

describe("the tutorial index", () => {
  it("holds every case folder on disk: none is skipped for a dictionary it cannot parse", () => {
    const folders: string[] = [];
    caseFolders(ROOT, folders);
    expect(folders.length).toBeGreaterThan(500);
    const indexed = new Set(TUTORIALS.map((t) => t.name));
    const missing = folders.filter((f) => !indexed.has(f)).sort();
    expect(missing, `skipped by the index: ${missing.join(", ")}`).toEqual([]);
  });
});
