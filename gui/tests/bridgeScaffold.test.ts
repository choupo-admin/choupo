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
  The case skeleton has ONE writer: bin/newCase.  Found 2026-08-29: the bridge
  carried its own copy of the file map under a comment saying "keep the two in
  sync", and the copy had drifted in the worst field possible -- it wrote the
  RETIRED v1 `constant/propertyDict`, which every binary refuses by name, so a
  case created through the GUI's "File / New Case..." was born broken.  These
  tests read both SOURCES (the bridge and bin/newCase), because only reading
  the source can see a second home growing back -- a behavioural test would
  pass while two writers happened to agree.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const BRIDGE = readFileSync(
  new URL("../bridge/claudeBridge.mjs", import.meta.url), "utf-8");
const NEWCASE = readFileSync(
  new URL("../../bin/newCase", import.meta.url), "utf-8");

describe("the bridge delegates case creation to the one writer", () => {
  it("shells out to bin/newCase", () => {
    expect(BRIDGE).toContain("scaffoldWithNewCase");
    expect(BRIDGE).toContain('"bin", "newCase"');
  });

  it("carries no file map of its own", () => {
    //  The drift machine: a {relPath: content} skeleton in the bridge is a
    //  second home for a load-bearing structure.  Any of these keys coming
    //  back means the mirror is growing again.
    for (const key of [
      'files["system/controlDict"]',
      'files["system/flowsheetDict"]',
      'files["constant/propertyDict"]',
      'files["constant/thermoPhysPropDict"]',
    ]) {
      expect(BRIDGE, `the bridge writes ${key} itself again`).not.toContain(key);
    }
  });

  it("never instructs the console agent to write the retired dict", () => {
    //  `constant/propertyDict` is the retired v1 grammar; every binary
    //  refuses it by name.  The import path may still ACCEPT it as evidence
    //  that an old zip looks like a Choupo case (read tolerance -- fine);
    //  what must never return is telling anyone to WRITE it: the born-taught
    //  interview prompt carried exactly that instruction until 2026-08-29.
    expect(BRIDGE).not.toContain("EXPLICITLY in constant/propertyDict");
    expect(BRIDGE).toContain("EXPLICITLY in constant/thermoPhysPropDict");
  });
});

describe("bin/newCase, the one writer, writes the current grammar", () => {
  it("writes constant/thermoPhysPropDict, not the retired name", () => {
    expect(NEWCASE).toContain("constant/thermoPhysPropDict");
    expect(NEWCASE).not.toContain("constant/propertyDict");
  });

  it("its header lists the same files its body writes", () => {
    //  The header count drifted once already ("all five files" over seven).
    //  Pin each name the body creates into the header list.
    for (const f of ["CLAUDE.md", "AGENTS.md", "ai/choupo-authoring.md",
      "system/controlDict", "system/flowsheetDict",
      "constant/thermoPhysPropDict"]) {
      expect(NEWCASE.slice(0, 4000), `header does not list ${f}`).toContain(f);
    }
  });
});
