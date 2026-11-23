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
/* C266 item 8: the Variables tab shows a unit column only from a unit the case
   published; nothing is guessed. */
import { describe, expect, it } from "vitest";
import { variableUnit } from "../src/ui/VariablesWorkspace.js";

describe("variableUnit", () => {
  it("takes a computed entry's declared unit", () => {
    expect(variableUnit({ unit: "kW", declared: undefined })).toBe("kW");
  });
  it("reads the unit an authored scalar carries", () => {
    expect(variableUnit({ unit: undefined, declared: "20 m2" })).toBe("m2");
    expect(variableUnit({ unit: undefined, declared: "1.5e-3 kg/s" })).toBe("kg/s");
  });
  it("a bare number, an expression or nothing has no unit", () => {
    expect(variableUnit({ unit: undefined, declared: "49.3" })).toBeUndefined();
    expect(variableUnit({ unit: undefined, declared: "= a + b" })).toBeUndefined();
    expect(variableUnit({ unit: undefined, declared: undefined })).toBeUndefined();
  });
});
