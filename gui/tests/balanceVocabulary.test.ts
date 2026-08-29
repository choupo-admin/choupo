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
  One word, one polarity (2026-08-29).  The ENGINE'S "closure" is out/in*100
  -- 100 % is perfect -- on every CSV, console line and gate.  The GUI used
  the SAME word for |in-out|/in, where 0 % is perfect: a student who learned
  "closure 100 %" from the report read "closure 0.0000 %" in the Streams
  band over a perfect balance.  The GUI's quantity is an IMBALANCE and is
  labelled so; these pins keep the collision from growing back.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf-8");

describe("the GUI labels its error quantity 'imbalance', never 'closure'", () => {
  it("the Streams summary band", () => {
    const s = read("../src/ui/StreamsSummary.tsx");
    expect(s).toContain("imbalance {closurePct} %");
    expect(s).toContain("imbalance {energyPct} %");
    expect(s).not.toContain("closure {closurePct}");
    expect(s).not.toContain("closure {energyPct}");
  });

  it("the Reports view, formula kept", () => {
    const s = read("../src/ui/ReportsWorkspace.tsx");
    expect(s).toContain("Imbalance |in−out|/in");
    expect(s).toContain("Imbalance |H in + Q + W − H out|");
    expect(s).not.toContain("Closure |in−out|/in");
    expect(s).not.toContain("Closure |H in + Q + W");
  });
});
