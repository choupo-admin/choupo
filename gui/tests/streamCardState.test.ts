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

// WHICH state a stream's Properties card shows -- the run's or the file's.
//
// The rule inverted itself silently.  Before the stream-state architecture
// only feeds had authored values, so "the flowsheet's stream if there is one,
// else the run result" meant "the answer".  The completeness contract then
// gave EVERY stream a file in 0/, and the same condition started preferring a
// product's choupo-init0 SEED.
//
// Live on www.choupo.org, flash19: the `vapor` card read F 53000 mol/h with
// the FEED's composition -- 53 kmol/h is the seed's total -- while the node
// beside it showed the solved 2890 mol/h, and the card carried `vf` from the
// run at the same time.  Two states in one table.

import { describe, expect, it } from "vitest";

import { streamCardSource } from "../src/case/streamCardState.js";

describe("streamCardSource", () => {
  it("shows the RUN for a computed stream, even though 0/ has a file for it", () => {
    //  flash19's `vapor`: seeded in 0/ by choupo-init0, solved by the run.
    expect(streamCardSource({
      hasAuthored: true, hasRun: true, isAuthoredFeed: false,
    })).toBe("run");
  });

  it("shows the AUTHORED values for a feed -- they are the input the scratch fields edit", () => {
    expect(streamCardSource({
      hasAuthored: true, hasRun: true, isAuthoredFeed: true,
    })).toBe("authored");
  });

  it("pre-run, shows the file -- it is all there is", () => {
    expect(streamCardSource({
      hasAuthored: true, hasRun: false, isAuthoredFeed: false,
    })).toBe("authored");
    expect(streamCardSource({
      hasAuthored: true, hasRun: false, isAuthoredFeed: true,
    })).toBe("authored");
  });

  it("shows the run for an INTERNAL stream, which no file describes", () => {
    //  The original reason the fallback existed: a recycle/internal stream is
    //  in no top-level block, so the run is its only description.
    expect(streamCardSource({
      hasAuthored: false, hasRun: true, isAuthoredFeed: false,
    })).toBe("run");
  });

  it("has nothing to show when there is neither", () => {
    expect(streamCardSource({
      hasAuthored: false, hasRun: false, isAuthoredFeed: false,
    })).toBe("none");
  });
});
