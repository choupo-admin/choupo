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

import {
  LessonSyntaxError, linkTarget, linkTextNamesTarget, parseInline, parseLesson,
} from "../src/case/lesson.js";
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

describe("a link renders (C264 addition: 31 of 133 case READMEs carry one)", () => {
  it("a web link is a link to the web, its text parsed", () => {
    const r = parseInline("see [the `paper`](https://doi.org/10.1/x) now", 1);
    expect(r.map((x) => x.t)).toEqual(["text", "link", "text"]);
    const l = r[1]!;
    if (l.t !== "link") throw new Error("not a link");
    expect(l.href).toBe("https://doi.org/10.1/x");
    expect(l.target).toBe("web");
    expect(l.s).toBe("the paper");
    expect(l.runs.map((x) => x.t)).toEqual(["text", "code"]);
  });
  it("a repository path and an in-page anchor are not web targets", () => {
    expect(linkTarget("../ammonia02_full_plant")).toBe("repo");
    expect(linkTarget("system/postDict")).toBe("repo");
    expect(linkTarget("#from-feasibility")).toBe("anchor");
    expect(linkTarget("HTTP://x.y")).toBe("web");
  });
  it("no other scheme is ever clickable", () => {
    expect(linkTarget("javascript:alert(1)")).toBe("repo");
    expect(linkTarget("mailto:a@b.c")).toBe("repo");
  });
  it("the path is repeated after the text only when the text does not name it", () => {
    expect(linkTextNamesTarget("`ammonia02_full_plant`", "../ammonia02_full_plant")).toBe(true);
    expect(linkTextNamesTarget("`ignition01_h2o2`", "../ignition01_h2o2/README.md")).toBe(true);
    expect(linkTextNamesTarget("`system/postDict`", "system/postDict")).toBe(true);
    expect(linkTextNamesTarget("`docs/design/x.md`", "../../../docs/design/x.md")).toBe(true);
    expect(linkTextNamesTarget("the dossier", "../../docs/design/dossier.md")).toBe(false);
    expect(linkTextNamesTarget("From feasibility to basic design",
      "../greenAmmonia03_basicDesign/README.md#from-feasibility")).toBe(false);
  });
  it("a link inside a table cell and inside bold parses", () => {
    const b = parseLesson("# T\n\n| a | b |\n|---|---|\n| [x](../y) | **[z](https://q)** |\n");
    expect(b[1]?.kind).toBe("table");
  });
  it("an image is still refused, and the error says a link would render", () => {
    expect(() => parseInline("![alt](x.png)", 4)).toThrow(/an image \(a link renders/);
  });
  it("a bracket that is not a link is text", () => {
    expect(parseInline("a [note] and [ref][1] here", 1).every((x) => x.t === "text")).toBe(true);
  });
});

describe("a code span is literal", () => {
  it("angle brackets inside backticks are not raw HTML", () => {
    const r = parseInline("sheets under `design/<unit>/` per item", 1);
    expect(r.map((x) => x.t)).toEqual(["text", "code", "text"]);
    expect(r[1]?.s).toBe("design/<unit>/");
  });
  it("an image shape inside backticks is code, not an image", () => {
    const r = parseInline("index `a[i](x)` and `![b](c)`", 1);
    expect(r.filter((x) => x.t === "code")).toHaveLength(2);
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
