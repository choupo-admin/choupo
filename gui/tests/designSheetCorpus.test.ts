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
  EVERY SPECIFICATION SHEET A RUN WRITES PARSES WITH THE APP'S OWN PARSER
  (DEV.md 4c C269, after the C266 student walk).

  A sheet is a Choupo dictionary the engine writes and the app reads back
  (`case/designSheet.ts`).  On the running app the walk met three sheets the
  app refused WHOLE -- "could not be read as a specification sheet" over the
  raw file -- for one unit word each: `m3/yr` on the purified-water generator
  of every tablet plant, `um` and `rpm` on the spray dryer's design sheet,
  which in sprayDryer07 IS the case's answer.  `check_design_sheet` arm (k)
  held the sizers' unit words against a REGEX MIRROR of the two unit tables,
  read `sizing/` alone (CleanUtilitiesPass sits one level up) and carried a
  waiver for `um` and `rpm`; nothing ever handed a written sheet to the
  parser the app uses.

  This does.  The `design/` trees the witnesses write (declared in
  `witnessOutputs.ts`, generated from THIS tree's engine by the setup) are
  swept whole, every file through `parse()` -- so a refusal names the case,
  the file and the parser's own `file:line:col` -- and then through
  `parseDesignSheet()`, so a file under `design/` that is not a sheet is also
  found.  swro01's sixty sheets, declared per file for the hall drawings, are
  swept by the same walk of its directory.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";

import { parse } from "../src/dict/index.js";
import { parseDesignSheet } from "../src/case/designSheet.js";
import { WITNESS_OUTPUTS } from "./witnessOutputs.js";
import { witnessOutputFiles } from "./witnessRead.js";

const SWEPT = WITNESS_OUTPUTS.filter((w) => w.dir && w.file === "design");

describe("every design sheet the witnesses write parses with the app's parser", () => {
  it("declares at least the writers the walk found refused", () => {
    const dirs = SWEPT.map((w) => w.caseDir);
    expect(dirs).toContain("tutorials/batch/plant/donepezil01_tablets");   // m3/yr
    expect(dirs).toContain("tutorials/steady/drying/sprayDryer07_design");  // um, rpm
  });

  describe.each(SWEPT.map((w) => w.caseDir))("%s", (caseDir) => {
    it("every file under design/ is a sheet the app's parser reads", () => {
      const files = witnessOutputFiles(caseDir, "design");
      expect(files.length).toBeGreaterThan(0);
      const refused: string[] = [];
      for (const [rel, text] of files) {
        try {
          parse(text, { sourceName: `${caseDir}/design/${rel}` });
        } catch (e) {
          refused.push(String((e as Error).message ?? e));
          continue;
        }
        if (parseDesignSheet(text) === null)
          refused.push(`${caseDir}/design/${rel}: parses, but is not a`
            + " specification sheet (no `recordType designSheet;`)");
      }
      expect(refused, refused.join("\n")).toEqual([]);
    });
  });
});
