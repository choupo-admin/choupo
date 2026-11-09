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
  Every shipped README renders (C264).

  firstPath.test.ts held the first-path cases to the lesson subset; nothing
  held the REST of the corpus, so donepezil02's README -- a batch-plant case
  a student opens on purpose -- was refused at its line 124 for a code span
  (`design/<unit>/`) the parser read as raw HTML.  This walks EVERY README.md
  under tutorials/ on disk (not the bundle: a README the bundle someday
  drops must still be one the app could show) and parses it with the app's
  own parser.  A failure names the file and the line the parser refused.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { LessonSyntaxError, parseInline, parseLesson } from "../src/case/lesson.js";
import { REPO } from "./witnessOutputs.js";

function readmes(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // Run output is never a lesson.
      if (e.name === "reports" || e.name === "converged" || e.name === "design") continue;
      readmes(p, out);
    } else if (e.name === "README.md") out.push(p);
  }
  return out;
}

describe("every shipped tutorial README renders in the app", () => {
  const files = readmes(join(REPO, "tutorials"));

  it("finds the corpus", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("each one parses with the app's own lesson parser", () => {
    const refused: string[] = [];
    for (const f of files) {
      try { parseLesson(readFileSync(f, "utf-8")); }
      catch (e) {
        const where = relative(REPO, f);
        if (e instanceof LessonSyntaxError) refused.push(`${where}: ${e.message}`);
        else refused.push(`${where}: ${(e as Error).message}`);
      }
    }
    expect(refused, refused.join("\n")).toEqual([]);
  });
});

describe("a code span is literal", () => {
  it("angle brackets inside backticks are not raw HTML", () => {
    const r = parseInline("sheets under `design/<unit>/` per item", 1);
    expect(r.map((x) => x.t)).toEqual(["text", "code", "text"]);
    expect(r[1]?.s).toBe("design/<unit>/");
  });
  it("a link or image shape inside backticks is code", () => {
    expect(() => parseInline("index `a[i](x)` and `![b](c)`", 1)).not.toThrow();
  });
  it("inside bold, a code span is still literal", () => {
    expect(() => parseInline("**the `<unit>` folder**", 1)).not.toThrow();
  });
  it("a wrapped nested bullet keeps its code span", () => {
    const b = parseLesson("# T\n\n* item\n  * child with `x<y>`\n    continued `<z>`\n");
    expect(b[1]?.kind).toBe("list");
  });
  it("outside backticks raw HTML is still refused", () => {
    expect(() => parseInline("a <b>bold</b> `ok`", 3)).toThrow(LessonSyntaxError);
  });
});
