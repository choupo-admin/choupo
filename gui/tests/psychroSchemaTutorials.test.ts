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
  Choupo -- Copyright (C) 2026 Vítor Geraldes -- GPL-3.0-or-later

  DEFECT NAMED (third external review, 2026-11-25): the psychrometricChart
  schema bounded `relativeHumidity` to a maximum of 1 while the engine reads
  PERCENT (divides by 100) and the shipped tutorials write 20 ... 80.  Every
  tutorial dict would have failed its own schema.  This test reads each
  tutorial propsDict that runs psychrometricChart and checks its
  `relativeHumidity` list against the schema's item bounds.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = JSON.parse(readFileSync(
  join(ROOT, "gui", "schemas", "operations", "psychrometricChart.schema.json"),
  "utf8")) as { properties: Record<string, any> };

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "propsDict") out.push(p);
  }
}
function listOf(text: string, key: string): number[] | null {
  const m = new RegExp(`\\b${key}\\s*\\(([^)]*)\\)`).exec(text);
  return m ? m[1]!.trim().split(/\s+/).map(Number) : null;
}

describe("psychrometricChart schema against the tutorials' own dicts", () => {
  const files: string[] = [];
  walk(join(ROOT, "tutorials", "props"), files);
  const psy = files.filter((f) => /type\s+psychrometricChart/.test(readFileSync(f, "utf8")));

  it("finds the psychro tutorials", () => { expect(psy.length).toBeGreaterThanOrEqual(2); });

  it("states the percent unit and a maximum of 100", () => {
    const rh = schema.properties.relativeHumidity;
    expect(rh.items.maximum).toBe(100);
    expect(rh.unit).toBe("%");
  });

  for (const f of psy) {
    it(`validates ${f.split("tutorials/")[1]}`, () => {
      const t = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      const rh = listOf(t, "relativeHumidity");
      const item = schema.properties.relativeHumidity.items;
      for (const v of rh ?? []) {
        expect(v).toBeGreaterThan(item.exclusiveMinimum);
        expect(v).toBeLessThanOrEqual(item.maximum);
      }
    });
  }
});
