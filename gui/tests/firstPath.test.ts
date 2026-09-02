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
  The first path reaches the app.

  bin/curate/check_case_tiers (C++-side gate) requires a README.md on every
  `tier tutorial;` case.  This test owns the OTHER half of the claim: that the
  app can SHOW it.  case/lesson.ts renders a deliberate SUBSET of markdown
  and refuses outside it -- so a README written with a link, an image, raw
  HTML or a four-level heading fails HERE, in a test, and never renders as a
  refusal notice in front of a student.

  Also pinned: the welcome cards (the hand-picked entrance) all name
  first-path cases, and every first-path case is runnable in the browser --
  a "start here" that dead-ends in "view only" is not a start.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { LessonSyntaxError, inlineText, parseInline, parseLesson, type Inline } from "../src/case/lesson.js";
import { FIRST_PATH, TUTORIALS } from "../src/cases/tutorials.js";
import { SUGGESTED } from "../src/ui/WelcomeScreen.js";

describe("the first path (tier tutorial) in the bundle", () => {
  it("is non-empty and every member carries a README.md the app can render", () => {
    expect(FIRST_PATH.length).toBeGreaterThan(0);
    for (const e of FIRST_PATH) {
      expect(e.readme, `${e.name} has no README.md`).toBeDefined();
      const blocks = parseLesson(e.readme!);
      // A lesson opens with its title and has at least one section.
      expect(blocks[0]?.kind, `${e.name}: README does not open with a heading`).toBe("heading");
      expect(blocks.filter((b) => b.kind === "heading").length,
        `${e.name}: README has no section headings`).toBeGreaterThan(1);
    }
  });

  it("every member runs in the browser (no view-only case is a start)", () => {
    for (const e of FIRST_PATH)
      expect(e.unsupportedReason, `${e.name} is view-only`).toBeUndefined();
  });

  it("the welcome cards all point inside the first path", () => {
    const ids = new Set(FIRST_PATH.map((e) => e.name));
    for (const card of SUGGESTED)
      expect(ids.has(card.id), `welcome card '${card.title}' -> ${card.id} is not tier tutorial`).toBe(true);
  });

  it("the tier word is read off every case, and only the known words appear", () => {
    const seen = new Set(TUTORIALS.map((e) => e.tier));
    for (const w of seen) expect(["", "witness", "tutorial", "showcase"]).toContain(w);
    expect(seen.has("tutorial")).toBe(true);
  });
});

describe("the lesson subset refuses what it cannot show", () => {
  const refuses = (md: string, what: RegExp) => {
    let err: unknown;
    try { parseLesson(md); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LessonSyntaxError);
    expect((err as Error).message).toMatch(what);
  };
  it("a link", () => refuses("# T\n\nsee [here](http://x)\n", /a link/));
  it("an image", () => refuses("# T\n\n![alt](x.png)\n", /an image/));
  it("raw HTML", () => refuses("# T\n\n<b>bold</b>\n", /raw HTML/));
  it("a blockquote", () => refuses("# T\n\n> quoted\n", /a blockquote/));
  it("a horizontal rule", () => refuses("# T\n\n---\n", /a horizontal rule/));
  it("a level-4 heading", () => refuses("# T\n\n#### deep\n", /level-4 heading/));
  it("an unclosed fence", () => refuses("# T\n\n```\ncode\n", /unclosed code fence/));
  it("a list nested two levels", () =>
    refuses("# T\n\n1. one\n   * two\n      * three\n", /nested list deeper/));
});

describe("the lesson subset parses what the READMEs use", () => {
  it("decimals at a line head are prose, not numbered items", () => {
    const b = parseLesson("# T\n\nthe charge is\n18.5 mol of ethanol at\n341.66 K.\n");
    expect(b[1]?.kind).toBe("paragraph");
    expect(inlineText((b[1] as unknown as { inlines: never[] }).inlines)).toBe("the charge is 18.5 mol of ethanol at 341.66 K.");
  });
  it("numbered items with wrapped lines and one nested bullet level", () => {
    const b = parseLesson("# T\n\n1. **first** point\n   continues here\n   * nested a\n   * nested b\n2. second\n");
    expect(b[1]?.kind).toBe("list");
    const l = b[1] as unknown as { ordered: boolean; items: { inlines: never[]; children?: unknown[] }[] };
    expect(l.ordered).toBe(true);
    expect(l.items.length).toBe(2);
    expect(inlineText(l.items[0]!.inlines)).toBe("first point continues here");
    expect(l.items[0]!.children?.length).toBe(2);
  });
  it("a pipe table", () => {
    const b = parseLesson("# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n");
    expect(b[1]?.kind).toBe("table");
    const t = b[1] as unknown as { header: unknown[]; rows: unknown[][] };
    expect(t.header.length).toBe(2);
    expect(t.rows.length).toBe(2);
  });
  it("a fenced block keeps its text and language", () => {
    const b = parseLesson("# T\n\n```bash\nrunCase x\n```\n");
    expect(b[1]).toMatchObject({ kind: "code", lang: "bash", text: "runCase x" });
  });
  it("inline bold, italic, code -- and a bare star stays a star", () => {
    const r = parseInline("**b** and *i* and `c` at 0.9995*n", 1);
    expect(r.map((x) => x.t)).toEqual(["bold", "text", "em", "text", "code", "text"]);
    expect(inlineText(r)).toBe("b and i and c at 0.9995*n");
  });
  it("code inside bold keeps its code spans (the grammar-rule shape)", () => {
    const r = parseInline("**`type` -> `model`.** next", 1);
    expect(r[0]).toMatchObject({ t: "bold", s: "type -> model." });
    expect((r[0] as { runs: Inline[] }).runs.map((x) => x.t)).toEqual(["code", "text", "code", "text"]);
  });
  it("headings carry their 1-based line for the outline", () => {
    const b = parseLesson("# T\n\npara\n\n## Two\n");
    expect(b[2]).toMatchObject({ kind: "heading", level: 2, line: 5 });
  });
});
