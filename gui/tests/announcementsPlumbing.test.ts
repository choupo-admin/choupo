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

// announcementsPlumbing -- the Log rail groups the ENGINE's `[tag]` lines; the
// runner's own `[adapter]` / `[worker]` lines are not announcements (browser
// pass 2026-11-24: "[worker] received run" showed twice per click, once in the
// log and once in the rail, while exactly one worker was spawned).
import { describe, expect, it } from "vitest";

import { groupAnnouncements } from "../src/case/unitBanner.js";

describe("groupAnnouncements", () => {
  const log = [
    "[adapter] spawning worker at /workers/solverWorker.js?t=1",
    "[worker] received run for binary=choupoSolve; files: system/controlDict",
    "[worker] fetching WASM glue (choupoSolve)...",
    "[stderr] extrapolated Antoine for benzene at 370 K",
    "[stderr] extrapolated Antoine for benzene at 371 K",
  ].join("\n");

  it("leaves the runner's plumbing out of the rail", () => {
    expect(groupAnnouncements(log).map((g) => g.tag)).toEqual(["stderr"]);
  });
  it("still groups the engine's own lines with their count", () => {
    expect(groupAnnouncements(log)[0]!.count).toBe(2);
  });
});
