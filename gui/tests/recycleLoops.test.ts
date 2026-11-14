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

import { describe, it, expect } from "vitest";
import { loopMembership } from "../src/case/recycleLoops";

const loops = [{ tear: "recycle", units: ["mixer", "reactor", "splitter"],
                 streams: ["mixed", "out", "recycle"] }];

describe("recycle loop membership comes from the engine's list", () => {
  it("a stream on the loop is on it; one off it is not", () => {
    const m = loopMembership(loops, () => undefined);
    expect(m.streamOnLoop("recycle")).toBe(true);
    expect(m.streamOnLoop("feed")).toBe(false);
    expect(m.unitOnLoop("reactor")).toBe(true);
    expect(m.unitOnLoop("flash")).toBe(false);
  });

  it("a canvas label resolves through the run's own stream, never by its tail", () => {
    const m = loopMembership(
      [{ tear: "LOOP.recycle", units: ["LOOP.mixer"], streams: ["LOOP.recycle"] }],
      (label) => (label === "recycle" ? "LOOP.recycle" : undefined));
    expect(m.streamOnLoop("recycle")).toBe(true);
    //  a different pipe sharing the leaf word is NOT on the loop
    expect(m.streamOnLoop("OTHER.recycle")).toBe(false);
  });

  it("a sector box is on the loop when the engine stamped a loop unit with it", () => {
    const m = loopMembership(
      [{ tear: "LOOP.recycle", units: ["LOOP.mixer"], streams: ["LOOP.recycle"] }],
      () => undefined, { "LOOP.mixer": "LOOP" });
    expect(m.unitOnLoop("LOOP")).toBe(true);
    expect(m.unitOnLoop("DRYING")).toBe(false);
  });

  it("no published loop draws nothing", () => {
    const m = loopMembership(undefined, () => undefined);
    expect(m.any).toBe(false);
    expect(m.streamOnLoop("x")).toBe(false);
  });
});
