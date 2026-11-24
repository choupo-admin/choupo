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

// witnessResolution -- every case name an EduTool or registry entry hands to
// tutorialByName resolves to exactly ONE bundled case (browser pass
// 2026-11-24: transfer-unit step 5 threw "not in the bundled corpus").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CASE_STUDIES } from "../src/case/fastSlow.js";
import { TUTORIALS, resolveCaseName } from "../src/cases/tutorials.js";

/** Every case name a source file hands to the registry: the constants named
 *  *WITNESS*, *HOST* or LAYOUT_CASE, the syngas benches' `host:` fields, the
 *  run-log witnesses' `case:` fields, the fast/slow case studies. */
function witnessNames(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(p, "utf8");
      const consts = /const ([A-Z_]*(?:WITNESS|HOST)[A-Z_]*|LAYOUT_CASE)(?:: [^=]+)? = "([A-Za-z0-9_/]+)"/g;
      for (let m = consts.exec(src); m; m = consts.exec(src))
        // a case name has a number and an underscore (a catalyst's name has not)
        if (/^[a-z]/.test(m[2]!) && /[0-9]/.test(m[2]!) && m[2]!.includes("_")) out.set(m[2]!, `${p}:${m[1]}`);
      if (/syngasExercise|runLog/.test(f)) {
        const fields = /\b(?:host|case): "([A-Za-z0-9_/]+)"/g;
        for (let m = fields.exec(src); m; m = fields.exec(src)) out.set(m[1]!, `${p}:field`);
      }
    }
  };
  walk(join(__dirname, "..", "src"));
  for (const c of Object.values(CASE_STUDIES)) {
    out.set(c.full, "fastSlow:full");
    out.set(c.reduced, "fastSlow:reduced");
  }
  return out;
}

describe("every witness name an EduTool runs", () => {
  const names = witnessNames();
  it("finds the registry (a scan that finds nothing proves nothing)", () => {
    expect(names.size).toBeGreaterThan(60);
    expect(names.has("ratebased01_schulz_0p10bar")).toBe(true);
  });
  it("resolves each to exactly one bundled case", () => {
    const bad = [...names].filter(([n]) => resolveCaseName(n).status !== "found")
      .map(([n, where]) => `${n} (${where})`);
    expect(bad).toEqual([]);
  });
  it("has no bare case name shared by two bundled cases among them", () => {
    const counts = new Map<string, number>();
    for (const t of TUTORIALS) {
      const b = t.name.slice(t.name.lastIndexOf("/") + 1);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const dup = [...names.keys()].filter((n) => (counts.get(n.slice(n.lastIndexOf("/") + 1)) ?? 0) > 1);
    expect(dup).toEqual([]);
  });
});
