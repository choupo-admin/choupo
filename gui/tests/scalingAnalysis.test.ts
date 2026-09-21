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
  The scaling lens's opening water analysis, held to the tutorial it cites.

  The comment said "copied from tutorials/props/electrolyte/scaling_ro_brackish"
  and six of the seven ions were.  This reads that file.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BRACKISH_MG_PER_L, SCALING_IONS, brackishDefaultMolal, mgPerLFromMolal,
  molalFromMgPerL,
} from "../src/case/scalingSpec.js";

const PROPS_DICT = new URL(
  "../../tutorials/props/electrolyte/scaling_ro_brackish/system/propsDict",
  import.meta.url);

/** Every `analyticalTotals { ... }` block of the tutorial, as {ion: mg/L}. */
function tutorialAnalyses(): { [ion: string]: number }[] {
  const text = readFileSync(PROPS_DICT, "utf-8");
  const out: { [ion: string]: number }[] = [];
  //  `analyticalTotals { Ca 84 mg/L; ... }`, possibly wrapped over lines.
  const re = /analyticalTotals\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1]!;
    const totals: { [ion: string]: number } = {};
    const ion = /([A-Za-z][A-Za-z0-9]*)\s+([0-9.eE+-]+)\s+mg\/L\s*;/g;
    let t: RegExpExecArray | null;
    while ((t = ion.exec(body)) !== null) totals[t[1]!] = Number(t[2]!);
    if (Object.keys(totals).length > 0) out.push(totals);
  }
  return out;
}

describe("the scaling lens opens on the tutorial's own analysis", () => {
  it("the tutorial is readable and states an mg/L analysis", () => {
    //  A test whose subject may be absent must not pass silently.
    const all = tutorialAnalyses();
    expect(all.length, "no `analyticalTotals { ... mg/L; }` block found")
      .toBeGreaterThan(0);
  });

  it("matches the feed analysis ion for ion", () => {
    //  THE DEFECT: Cl was 0.0124 mol/kg here = 440 mg/L, against 510 in the
    //  file this table says it was copied from.  That single ion put the feed
    //  8.8 % out of charge balance, which the engine announces and which the
    //  solved pH then absorbs -- pH 10.0 against the tutorial's 7.72.
    const mgL = tutorialAnalyses().find((a) => "Cl" in a && "HCO3" in a)!;
    for (const { ion } of SCALING_IONS)
      expect(BRACKISH_MG_PER_L[ion], `${ion}`).toBe(mgL[ion]);
    //  ...and nothing the tutorial declares is missing from the lens.
    expect(Object.keys(BRACKISH_MG_PER_L).sort()).toEqual(Object.keys(mgL).sort());
  });

  it("every analysis in that tutorial is the SAME analysis", () => {
    //  The file declares it three times (feed, closed scan, open scan).  If
    //  they ever diverge, "the tutorial's analysis" stops being one thing and
    //  the arm above is picking one of several.
    const all = tutorialAnalyses().filter((a) => "HCO3" in a);
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const a of all) expect(a).toEqual(all[0]);
  });

  it("the mol/kg the dict carries is DERIVED, not a second list", () => {
    const molal = brackishDefaultMolal();
    for (const { ion, mw } of SCALING_IONS) {
      expect(mgPerLFromMolal(molal[ion]!, mw)).toBeCloseTo(BRACKISH_MG_PER_L[ion]!, 9);
      expect(molal[ion]).toBeCloseTo(molalFromMgPerL(BRACKISH_MG_PER_L[ion]!, mw), 15);
    }
  });

  it("the analysis it opens on is CHARGE-BALANCED to better than 1 %", () => {
    //  The reason the number matters.  Charges are written here and nowhere
    //  else in the GUI: they are the TEST's own arithmetic over a declared
    //  analysis, never sent to the engine (the dict carries molalities and the
    //  engine reads charge off its own species records).
    const Z: { [ion: string]: number } = {
      Ca: +2, Mg: +2, Na: +1, K: +1, Cl: -1, SO4: -2, HCO3: -1,
    };
    const molal = brackishDefaultMolal();
    let pos = 0, neg = 0;
    for (const { ion } of SCALING_IONS) {
      const eq = (molal[ion] ?? 0) * Z[ion]!;
      if (eq > 0) pos += eq; else neg -= eq;
    }
    const imbalance = Math.abs(pos - neg) / ((pos + neg) / 2);
    //  Measured: 0.352 % with the tutorial's chloride (the figure its own
    //  header states), 8.817 % with the old 0.0124 literal -- above the
    //  engine's own ~5 % distrust threshold.
    expect(imbalance).toBeLessThan(0.01);
  });
});
