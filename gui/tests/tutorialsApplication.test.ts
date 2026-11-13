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
  The tutorial index reads each case's binary from the case, not its folder.

  Ruled 2026-09-20: a top-level tutorials/ folder is a DISCIPLINE, and the
  binary is `controlDict.application`.  The index used to derive the binary
  from the folder name (batch -> choupoBatch, ctrl -> choupoCtrl, props ->
  choupoProps, else choupoSolve), which went false the day unsteady/ existed
  (choupoSemiContinuous) and had always been false for the two choupoProps
  cases inside steady/.  These tests hold the one home: `applicationOf`.
\*---------------------------------------------------------------------------*/
import { describe, it, expect } from "vitest";
import { TUTORIALS, applicationOf } from "../src/cases/tutorials.js";

describe("applicationOf reads the controlDict text", () => {
  it("returns the declared word, and choupoSolve ONLY when the key is absent", () => {
    expect(applicationOf("application   choupoSemiContinuous;\nverbosity 3;")).toBe("choupoSemiContinuous");
    expect(applicationOf("  application choupoProps; // trailing")).toBe("choupoProps");
    expect(applicationOf("verbosity 3;")).toBe("choupoSolve");
    expect(applicationOf(undefined)).toBe("choupoSolve");
  });
});

describe("the index carries the case's own application", () => {
  const byName = new Map(TUTORIALS.map((t) => [t.name, t]));
  it("an unsteady/ case indexes as choupoSemiContinuous", () => {
    const u = byName.get("unsteady/unsteady01_startup_transient");
    expect(u).toBeDefined();
    expect(u!.application).toBe("choupoSemiContinuous");
  });
  it("a choupoProps case inside steady/ indexes as choupoProps, not by its folder", () => {
    const p = byName.get("steady/optimisation/fitNRTL02_thermoml_isobars");
    expect(p).toBeDefined();
    expect(p!.application).toBe("choupoProps");
  });
  it("a ctrl/ case still indexes as choupoCtrl", () => {
    expect(byName.get("ctrl/ctrl01_cstr_temp_control")!.application).toBe("choupoCtrl");
  });
  it("every indexed application is one of the five binaries", () => {
    const five = new Set(["choupoSolve", "choupoBatch", "choupoCtrl", "choupoSemiContinuous", "choupoProps"]);
    for (const t of TUTORIALS) expect(five.has(t.application), `${t.name}: ${t.application}`).toBe(true);
  });
});
