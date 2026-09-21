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


/*---------------------------------------------------------------------------*\
  WHAT THE BUNDLE CARRIES AS A CASE FILE.

  The tutorial glob inlines every match as a raw string in the shipped app, and
  its own comments lock two run-output trees out by name -- `design/` and
  `converged/` -- with the reason written twice: one machine's stale run,
  served to every visitor before they run anything.  It did not lock out CSVs.
  MEASURED on 2026-09-21, on this machine, after an ordinary corpus run: 287
  solver-generated CSVs were in the bundle, among them every
  `balanceTrajectory.csv`, a whole `postProcessing/` tree on the flagship
  plant, and the `txy.csv` that tests/flashOperatingLineTool.test.ts was
  reading as its subject.

  It is worse than the two locked cases rather than the same: `design/` and
  `converged/` are NAMED views that the Case tree dims and badges as run
  output (caseTree.kindOf), while a CSV at a case root is drawn as a file the
  student authored.

  These assertions are over the REAL index, so they measure whatever is on
  disk right now.  On a checkout where nothing has been run they pass
  vacuously -- which is why the second one exists: the four CSVs that ARE case
  inputs must still be there, and they are the arm that fails if the exclusion
  is ever widened into them.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { TUTORIALS } from "../src/cases/tutorials.js";

const csvFilesInBundle = () => {
  const out: string[] = [];
  for (const t of TUTORIALS)
    for (const k of Object.keys(t.files.rawFiles ?? {}))
      if (/\.csv$/.test(k)) out.push(`${t.name}:${k}`);
  return out;
};

const INPUT_CSV = /(^|:)constant\/experimental\/[^/]+\.csv$/;

describe("solver-generated CSVs stay OUT of the bundle", () => {
  it("no case carries a CSV that is not a declared case input", () => {
    const strays = csvFilesInBundle().filter((f) => !INPUT_CSV.test(f));
    expect(strays, `run-output CSVs inlined as case files:\n${strays.join("\n")}`)
      .toEqual([]);
  });

  it("...and every CSV that IS an input is still there", () => {
    //  .gitignore whitelists exactly `constant/experimental/` and so does the
    //  bundle.  A blanket exclusion would have taken these with it: Vite's
    //  glob does not re-include after a negation, measured -- putting the
    //  path back as a later positive pattern left all four excluded, which is
    //  why they arrive through a glob of their own.
    const inputs = csvFilesInBundle().filter((f) => INPUT_CSV.test(f));
    expect(inputs.length,
      "the experimental datasets some cases ship for the engine to read")
      .toBeGreaterThanOrEqual(4);
    expect(inputs.some((f) => f.includes("fdl2021_figures.csv"))).toBe(true);
    expect(inputs.some((f) => f.includes("methyl_acetate_RD_profile.csv"))).toBe(true);
  });

  it("the run-output VIEWS the glob already locked are still locked", () => {
    //  Checked here too because all three are one rule and they were written
    //  three years apart in three places; a future edit to the pattern list
    //  should fail on whichever it breaks.
    for (const t of TUTORIALS)
      for (const k of Object.keys(t.files.rawFiles ?? {})) {
        expect(k, `${t.name}: a run output in the bundle`)
          .not.toMatch(/(^|\/)(converged|design)\//);
        expect(k).not.toMatch(/(^|\/)log\./);
      }
  });
});
