/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

// artifactChannel -- the bridge's CSV side channel: the path-traversal guard,
// the mtime diff (no re-announce of unchanged files) and the disk scan.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  diffArtifacts, isArtifactCsv, readArtifactText, safeArtifactPath,
  scanCsvArtifacts, type ArtifactEntry,
} from "../bridge/artifactChannel.mjs";

const CASE = mkdtempSync(join(tmpdir(), "choupo-artifact-test-"));
afterAll(() => { rmSync(CASE, { recursive: true, force: true }); });

describe("isArtifactCsv", () => {
  it("accepts .csv (case-insensitive), rejects everything else", () => {
    expect(isArtifactCsv("sweep_results.csv")).toBe(true);
    expect(isArtifactCsv("reports/balances/mass.CSV")).toBe(true);
    expect(isArtifactCsv("system/flowsheetDict")).toBe(false);
    expect(isArtifactCsv("log.run")).toBe(false);
    expect(isArtifactCsv("")).toBe(false);
    expect(isArtifactCsv(42)).toBe(false);
  });
});

describe("safeArtifactPath (the confinement guard)", () => {
  it("resolves a rel path inside the case", () => {
    expect(safeArtifactPath("/tmp/case", "sweep.csv")).toBe("/tmp/case/sweep.csv");
    expect(safeArtifactPath("/tmp/case", "reports/x.csv")).toBe("/tmp/case/reports/x.csv");
  });

  it("refuses traversal, absolute paths and the case dir itself", () => {
    expect(safeArtifactPath("/tmp/case", "../other/sweep.csv")).toBeNull();
    expect(safeArtifactPath("/tmp/case", "a/../../etc/passwd.csv")).toBeNull();
    expect(safeArtifactPath("/tmp/case", "/etc/passwd.csv")).toBeNull();
    // a sibling dir whose name merely STARTS with the case path
    expect(safeArtifactPath("/tmp/case", "../case2/x.csv")).toBeNull();
  });

  it("refuses non-CSV files outright (this channel serves artifacts only)", () => {
    expect(safeArtifactPath("/tmp/case", "system/flowsheetDict")).toBeNull();
    expect(safeArtifactPath("/tmp/case", "x.csv.bak")).toBeNull();
  });
});

describe("diffArtifacts", () => {
  const e = (rel: string, mtimeMs: number): ArtifactEntry => ({ rel, size: 1, mtimeMs });

  it("announces new files and changed mtimes only", () => {
    const prev = new Map([["a.csv", 100], ["b.csv", 200]]);
    const { next, changed } = diffArtifacts(prev, [e("a.csv", 100), e("b.csv", 250), e("c.csv", 300)]);
    expect(changed.map((c) => c.rel)).toEqual(["b.csv", "c.csv"]); // a.csv unchanged -> silent
    expect(next.get("b.csv")).toBe(250);
    expect(next.has("a.csv")).toBe(true);
  });

  it("silently drops deleted files from the map", () => {
    const prev = new Map([["gone.csv", 100]]);
    const { next, changed } = diffArtifacts(prev, []);
    expect(changed).toEqual([]);
    expect(next.size).toBe(0);
  });
});

describe("scanCsvArtifacts + readArtifactText (on a real tmp case)", () => {
  it("finds CSVs incl. under reports/, skipping code/ and dot-dirs", () => {
    writeFileSync(join(CASE, "sweep_results.csv"), "point,T,duty\n1,300,2\n2,310,3\n");
    mkdirSync(join(CASE, "reports", "balances"), { recursive: true });
    writeFileSync(join(CASE, "reports", "balances", "mass.csv"), "unit,in,out\nmix,1,1\n");
    mkdirSync(join(CASE, "code"));
    writeFileSync(join(CASE, "code", "skipped.csv"), "x\n1\n");
    mkdirSync(join(CASE, ".claude"));
    writeFileSync(join(CASE, ".claude", "hidden.csv"), "x\n1\n");
    writeFileSync(join(CASE, "notes.txt"), "not an artifact");

    const rels = scanCsvArtifacts(CASE).map((a) => a.rel);
    expect(rels).toEqual(["reports/balances/mass.csv", "sweep_results.csv"]);
    const sweep = scanCsvArtifacts(CASE).find((a) => a.rel === "sweep_results.csv")!;
    expect(sweep.size).toBeGreaterThan(0);
    expect(sweep.mtimeMs).toBeGreaterThan(0);
  });

  it("round-trips an artifact's text and guards the path", () => {
    expect(readArtifactText(CASE, "sweep_results.csv").text)
      .toBe("point,T,duty\n1,300,2\n2,310,3\n");
    expect(readArtifactText(CASE, "reports/balances/mass.csv").text).toContain("unit,in,out");
    expect(readArtifactText(CASE, "missing.csv").error).toBeTruthy();
    expect(readArtifactText(CASE, "../escape.csv").error).toBeTruthy();
    expect(readArtifactText(CASE, "notes.txt").error).toBeTruthy();
  });
});
