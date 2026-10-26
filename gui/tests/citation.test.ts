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
  HOW TO CITE (DEV.md 4c C171 B): the GUI's citation is the ENGINE's.

  The wording has one home (bin/curate/gen_citation.py, from CITATION.cff),
  and two readers substitute it: src/core/Citation.cpp for the result JSON,
  src/case/citation.ts for Help, the About sections and the zip.  This test
  holds the two to each other on the engine's OWN output: a native run's
  `citation` block (version, commit, citations, text) must be what the GUI
  composes from the same case's controlDict and the same engine identity --
  for a case that declares sources (polarisation01, choupoProps) and one
  that declares none (apalutamide01, choupoSolve).  Arm (b) of
  bin/curate/check_citation.py holds the generated wording to the cff.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { parse, toJson, type JsonDict } from "../src/dict/index.js";
import { caseCitations, citationText, CITATION_FILE } from "../src/case/citation.js";
import { buildCaseZip } from "../src/case/saveCase.js";
import { CITATION_TEMPLATE } from "../src/help/citation.generated.js";
import type { CaseFiles } from "../src/case/types.js";
import { REPO } from "./witnessOutputs.js";
import { witnessOutput } from "./witnessRead.js";

function resultBlock(log: string): { citation?: { engineVersion: string; commit?: string;
  citations: string[]; text: string } } {
  const b = log.indexOf("<<<Choupo:result-begin>>>");
  const e = log.indexOf("<<<Choupo:result-end>>>");
  expect(b).toBeGreaterThanOrEqual(0);
  return JSON.parse(log.slice(b + "<<<Choupo:result-begin>>>".length, e));
}

function controlDictOf(caseDir: string): JsonDict {
  return toJson(parse(readFileSync(join(REPO, caseDir, "system/controlDict"), "utf-8"))) as JsonDict;
}

const CASES: [string, string][] = [
  ["tutorials/props/membrane/polarisation01_geraldes_afonso_table1", "log.choupoProps"],
  ["tutorials/batch/plant/apalutamide01_tablets", "log.choupoSolve"],
];

describe("the GUI composes the citation the engine publishes", () => {
  it.each(CASES)("%s", (caseDir, log) => {
    const js = resultBlock(witnessOutput(caseDir, log));
    const c = js.citation!;
    expect(c).toBeDefined();
    const refs = caseCitations(controlDictOf(caseDir));
    expect(refs.problem).toBeUndefined();
    // the GUI reads the same list the engine read
    expect(refs.citations).toEqual(c.citations);
    // and composes the same text for the same engine identity
    const engine = c.commit ? { version: c.engineVersion, commit: c.commit } : { version: c.engineVersion };
    expect(citationText(refs.citations, engine)).toBe(c.text);
  });

  it("polarisation01 lists its declared source; apalutamide01 says it declares none", () => {
    const pol = resultBlock(witnessOutput(CASES[0]![0], CASES[0]![1])).citation!;
    expect(pol.citations.length).toBe(1);
    expect(pol.text).toContain("  [1] Geraldes, V., & Afonso, M. D. (2007).");
    const apa = resultBlock(witnessOutput(CASES[1]![0], CASES[1]![1])).citation!;
    expect(apa.citations).toEqual([]);
    expect(apa.text).toContain("This case declares no primary sources");
  });
});

describe("the text's honest states", () => {
  it("no DOI is invented: the cff carries none, and the text says so", () => {
    expect(CITATION_TEMPLATE.DOCUMENT).toContain("Choupo has no DOI yet.");
    expect(CITATION_TEMPLATE.DOCUMENT).not.toMatch(/doi\.org/);
  });
  it("no engine stamp is said, never guessed; no commit is said", () => {
    expect(citationText(null, null)).toContain("version unknown: no engine version stamp was found");
    expect(citationText(null, { version: "Choupo-dev" }))
      .toContain("version Choupo-dev; this build recorded no commit");
    expect(citationText(null, { version: "Choupo-dev", commit: "abc1234" }))
      .toContain("version Choupo-dev, commit abc1234");
  });
  it("no case = no case section, and a footer that names no controlDict", () => {
    const t = citationText(null, null);
    expect(t).not.toContain("this case");
    expect(t).not.toContain("controlDict");
    expect(t.trimEnd().endsWith("Generated from CITATION.cff and the engine's version stamp "
      + "-- edit those, never this text.")).toBe(true);
    // a case keeps its footer naming its controlDict
    expect(citationText([], null)).toContain("the case's system/controlDict");
  });
  it("a malformed list is named, never cited", () => {
    expect(caseCitations({ citations: [1, 2] } as unknown as JsonDict).problem).toMatch(/citations/);
    expect(caseCitations({ citations: ["A source.", " "] }).problem).toMatch(/entry 2 is empty/);
    expect(caseCitations({}).citations).toEqual([]);
  });
});

describe("a downloaded case carries CITATION.txt", () => {
  it("the zip's CITATION.txt is the composed text, regenerated over any old copy", () => {
    const caseDir = CASES[0]![0];
    const controlDict = controlDictOf(caseDir);
    const files = {
      controlDict,
      rawFiles: {
        "system/controlDict": readFileSync(join(REPO, caseDir, "system/controlDict"), "utf-8"),
        "CITATION.txt": "a stale copy from an earlier download",
      },
    } as unknown as CaseFiles;
    const engine = { version: "Choupo-dev", commit: "abc1234" };
    const z = buildCaseZip(files, "polarisation01", undefined, engine)!;
    const out = unzipSync(z.bytes);
    const txt = strFromU8(out[`polarisation01/${CITATION_FILE}`]!);
    expect(txt).toBe(citationText(caseCitations(controlDict).citations, engine));
    expect(txt).toContain("commit abc1234");
  });
});
