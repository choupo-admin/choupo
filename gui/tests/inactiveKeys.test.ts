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
import { describe, expect, it } from "vitest";

import { inactiveLines, inactiveRecordLines, unreadKeysFromLog } from "../src/case/inactiveKeys.js";
import { keyHelp } from "../src/case/keyHelp.js";

const LOG = [
  "[props] running",
  "[dict] 2 key(s) written and never read -- they had NO effect on this run:",
  "[dict]   propsDict operations[1] 'bench': `A_w`",
  "[dict]   propsDict operations[1] 'bench' pore: `poreRadius`  -- did you mean `radius`?  (the model looked for that one and did not find it)",
  "[dict] the run CONTINUES on the defaults -- a declared value that nothing reads is a result you did not compute.",
  "[dict]   propsDict operations[2] 'later': `afterTheBlock`",
].join("\n");

const PROPS = [
  "operations",
  "(",
  "    {",
  "        name other;",
  "        A_w 1;",
  "    }",
  "    {",
  "        name bench;",
  "        A_w 2.0e-12;",
  "        pore",
  "        {",
  "            poreRadius 4e-10;",
  "        }",
  "    }",
  ");",
].join("\n");

describe("C154: keys declared and never read by the run are marked inactive", () => {
  it("reads the engine's own unread-keys report from the log, and only that block", () => {
    const u = unreadKeysFromLog(LOG);
    expect(u).toEqual([
      { operation: "bench", blocks: [], key: "A_w" },
      { operation: "bench", blocks: ["pore"], key: "poreRadius" },
    ]);
  });

  it("marks the line of that key inside the named operation, not the same key in another operation", () => {
    const m = inactiveLines(PROPS, unreadKeysFromLog(LOG));
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([9, 12]);
    expect(m.get(9)).toContain("never read");
  });

  it("marks nothing when the log has no report", () => {
    expect(inactiveLines(PROPS, unreadKeysFromLog("nothing here")).size).toBe(0);
  });
});

describe("C154: F1 on a thermoPhysPropDict key opens the Theory Guide section of its model", () => {
  const T = ["equilibrium", "{", "    liquid", "    {", "        activityModel NRTL;", "    }", "}",
    "transport", "{", "    liquid", "    {", "        viscosity { x 1; }", "    }", "}"].join("\n");

  it("a model word opens that model's section", () => {
    const h = keyHelp("constant/thermoPhysPropDict", T, 5);
    expect(decodeURIComponent(h.guide?.url ?? "")).toContain("ch:activity");
    expect(h.description).toContain("No schema documents");
  });

  it("a property family key opens the family's chapter", () => {
    const h = keyHelp("constant/thermoPhysPropDict", T, 12);
    expect(decodeURIComponent(h.guide?.url ?? "")).toContain("ch:viscosity");
  });
});

describe("C154: a record value the engine reports inactive is marked in its record file", () => {
  const rec = ["recordType membrane;", "A_w 1.2e-12;", "poreModel", "{", "    radius 3e-10;", "}"].join("\n");
  const facts = [{ source: "membrane NanoFiltranExample", key: "A_w", reason: "J_v is imposed" }];

  it("marks the key's line in the named record, with the engine's reason", () => {
    const m = inactiveRecordLines("constant/assets/NanoFiltranExample.dat", rec, facts);
    expect([...m.keys()]).toEqual([2]);
    expect(m.get(2)).toContain("J_v is imposed");
  });

  it("marks nothing in another file", () => {
    expect(inactiveRecordLines("constant/assets/Other.dat", rec, facts).size).toBe(0);
  });
});
