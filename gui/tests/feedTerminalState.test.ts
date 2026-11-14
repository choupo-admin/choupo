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

/* Feed terminals must carry a stream state (authored, or an ambient default),
   NEVER a blank 0 K / 0 Pa -- regression guard for the reset/display bug. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parse, toJson } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

const TUT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "tutorials");
const graphOf = (rel: string) =>
  flowsheetToGraph(toJson(parse(readFileSync(join(TUT, rel), "utf8"), { sourceName: rel })) as any);
const feed = (g: any, name: string) =>
  (g.nodes.find((n: any) => n.id === "stream:" + name) as any)?.data.stream;

describe("feed terminal state (never 0 K / 0 Pa)", () => {
  // (The old "composite crystalliser09 reads the authored streams{} state" test
  //  was retired: that case was renamed and MIGRATED to per-stream 0/ state files
  //  -- the feed state no longer lives in the flowsheetDict's streams{}, so a
  //  flowsheetDict-only graphOf cannot read it.  The ambient-default guard below
  //  still holds and is the live regression for the never-0/0 rule.)
  it("an un-authored feed defaults to ambient (298.15 K, 1 atm), not 0/0", () => {
    // A composite whose inlet has no streams{} entry -> feedSpecFromInlet(undefined).
    const g = graphOf("steady/flowsheets/composite01_two_flashes/system/flowsheetDict");
    const f = feed(g, "feed");
    expect(f.T).toBeGreaterThan(0);
    expect(f.P).toBeGreaterThan(0);
    expect(f.T).toBeCloseTo(298.15, 1);
    expect(f.P).toBeCloseTo(101325, 0);
  });
});
