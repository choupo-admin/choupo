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
  lesson -- a case's README.md, parsed for the app.

  A `tier tutorial;` case carries a README.md (bin/curate/check_case_tiers
  requires it): the lesson a student reads beside the numbers.  Until
  2026-09-02 the GUI bundled that file and read it nowhere -- it sat last in
  the Case tree, rendered through the DICT highlighter, and the intro screen
  went on showing a generic sentence.  This module is the reader.

  IT IS A SUBSET, AND IT REFUSES OUTSIDE IT.  No markdown dependency is added
  (the project favours readable local code over dependency expansion) and no
  attempt is made at the whole language: the subset is what the first-path
  READMEs actually use, measured on 2026-09-02 -- `#`/`##`/`###` headings,
  paragraphs, `*` (or `-`) bullets with one nested level, `N.` numbered
  items, fenced code, pipe tables, and inline **bold**, *italic*, `code`,
  and -- since C264 (2026-11-09), when 31 of 133 case READMEs were found to
  carry one -- a `[text](href)` link: a web link opens in a new tab, an
  in-page anchor and a repository path are shown as text (the path in code
  style after it), never as a broken link.  A construct outside it (an
  image, raw HTML, a blockquote, a rule, a deeper heading) THROWS
  `LessonSyntaxError` naming the line -- and tests/everyReadme.test.ts
  parses EVERY shipped README, so a README written with a construct the app
  cannot show fails a test rather than rendering as garbage in front of a
  student.  Widen the subset here and the test widens with it; never the
  other way round.

  Pure: no React, no DOM -- the component in ui/Lesson.tsx draws what this
  returns, and the Case view's outline reads the headings off it.
\*---------------------------------------------------------------------------*/

export type Inline =
  | { t: "text"; s: string }
  | { t: "code"; s: string }
  /** `s` is the plain text (for the outline); `runs` carries the code spans
   *  a bold run may hold (`**\`type\` -> \`model\`**` is how the READMEs
   *  write a grammar rule). */
  | { t: "bold"; s: string; runs: Inline[] }
  | { t: "em"; s: string }
  /** `[text](href)` (C264 addition): `s` is the plain text, `runs` its
   *  inline content (a code span, bold).  `target` says what the href is:
   *  `web` (http/https: the renderer makes it clickable, in a new tab),
   *  `anchor` (`#section`, in-page: shown as its text), `repo` (a relative
   *  path into the repository, which the site does not publish as a page:
   *  shown as its text, followed by the path in code style unless the text
   *  already names it -- never a broken link). */
  | { t: "link"; s: string; runs: Inline[]; href: string; target: "web" | "anchor" | "repo" };

export interface ListItem {
  inlines: Inline[];
  /** One nested bullet level, when the README indents `*` under an item. */
  children?: ListItem[];
}

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; inlines: Inline[]; line: number }
  | { kind: "paragraph"; inlines: Inline[]; line: number }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[]; line: number }
  | { kind: "code"; lang: string; text: string; line: number }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][]; line: number };

export class LessonSyntaxError extends Error {
  readonly line: number;
  constructor(line: number, what: string) {
    super(`README.md line ${line}: ${what} is outside the subset the app renders`);
    this.name = "LessonSyntaxError";
    this.line = line;
  }
}

// ---- inline ----------------------------------------------------------------

/** Bold, italic and code; everything else is literal text.  A lone `*`
 *  between characters (`0.9995*n`) stays a star: italic needs a non-space
 *  right after the opener and a closer on the same line. */
export function parseInline(s: string, line: number): Inline[] {
  // A code span is LITERAL: `design/<unit>/` or `a[i](x)` between backticks
  // is code, not HTML or a link.  So the refusals read the line with its
  // code spans set aside (C264: the whole line used to be tested, and one
  // backticked path refused a whole lesson in front of a student).
  const bare = s.replace(/`[^`]*`/g, "``");
  // An image is refused (the app shows no picture a README embeds; a link
  // is accepted since C264, so the error says which of the two it saw).
  if (/!\[[^\]]*\]\(/.test(bare))
    throw new LessonSyntaxError(line, "an image (a link renders; an image does not)");
  if (/<[A-Za-z][^>]*>/.test(bare)) throw new LessonSyntaxError(line, "raw HTML");
  const out: Inline[] = [];
  // A link is tried before a code span, because its text may hold one
  // (`[\`case\`](../case)`) and the whole bracket is then one token.
  const re = /(\[[^\]]*\]\([^)\s]*\)|`[^`]*`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ t: "text", s: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const text = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      const runs = parseInline(text, line);
      out.push({ t: "link", s: inlineText(runs), runs, href, target: linkTarget(href) });
    }
    else if (tok.startsWith("`")) out.push({ t: "code", s: tok.slice(1, -1) });
    else if (tok.startsWith("**")) {
      const inner = tok.slice(2, -2);
      out.push({ t: "bold", s: inner.replace(/`/g, ""), runs: parseInline(inner, line) });
    }
    else out.push({ t: "em", s: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ t: "text", s: s.slice(last) });
  return out;
}

/** What a link's href is.  Only http(s) is a destination the app can open;
 *  any other scheme (mailto:, javascript:, ...) is treated as a repository
 *  path and is never made clickable. */
export function linkTarget(href: string): "web" | "anchor" | "repo" {
  if (/^https?:\/\//i.test(href)) return "web";
  if (href.startsWith("#")) return "anchor";
  return "repo";
}

/** For a `repo` link: does the text already name the target?  Then the path
 *  is not repeated after it.  `[\`ammonia02_full_plant\`](../ammonia02_full_plant)`
 *  and `[\`system/postDict\`](system/postDict)` do; `[the dossier](../../docs/x.md)`
 *  does not. */
export function linkTextNamesTarget(text: string, href: string): boolean {
  const t = text.replace(/`/g, "").trim();
  if (t === "") return false;
  const path = href.replace(/#.*$/, "").replace(/\/README\.md$/, "").replace(/\/+$/, "");
  if (path === "" || path === "." || path === "..") return t === "../" || t === "..";
  const last = path.slice(path.lastIndexOf("/") + 1);
  return t === path || t === href || t.endsWith("/" + last) || t === last;
}

/** The plain text of an inline run (the outline shows headings as text). */
export function inlineText(inlines: Inline[]): string {
  return inlines.map((i) => i.s).join("");
}

// ---- blocks ----------------------------------------------------------------

const BULLET = /^(\s*)[*-]\s+(.*)$/;
// A numbered item is `N.` followed by WHITESPACE: `18.5 mol` and `341.66 K`
// open paragraph lines in the corpus and are decimals, not items.
const NUMBERED = /^(\s*)(\d+)\.\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*```(.*)$/;

function splitRow(s: string): string[] {
  const t = s.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

export function parseLesson(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i] ?? "";
    const ln = i + 1;

    if (line.trim() === "") { i++; continue; }

    // Fenced code: literal until the closing fence.
    const f = FENCE.exec(line);
    if (f) {
      const lang = (f[1] ?? "").trim();
      const buf: string[] = [];
      i++;
      while (i < n && !FENCE.test(lines[i] ?? "")) { buf.push(lines[i] ?? ""); i++; }
      if (i >= n) throw new LessonSyntaxError(ln, "an unclosed code fence");
      i++; // closing fence
      blocks.push({ kind: "code", lang, text: buf.join("\n"), line: ln });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      if (level > 3) throw new LessonSyntaxError(ln, `a level-${level} heading`);
      const text = (h[2] ?? "").replace(/\s+#+\s*$/, "");
      blocks.push({ kind: "heading", level: level as 1 | 2 | 3, text, inlines: parseInline(text, ln), line: ln });
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) throw new LessonSyntaxError(ln, "a blockquote");
    if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) throw new LessonSyntaxError(ln, "a horizontal rule");

    // Pipe table: a header row, a separator row of dashes, then rows.
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const header = splitRow(line).map((c) => parseInline(c, ln));
      i += 2;
      const rows: Inline[][][] = [];
      while (i < n && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(splitRow(lines[i] ?? "").map((c) => parseInline(c, i + 1)));
        i++;
      }
      blocks.push({ kind: "table", header, rows, line: ln });
      continue;
    }

    // Lists: top-level items at indent 0, continuation lines indented, and
    // one nested `*` level (indented bullets under an item).
    const num = NUMBERED.exec(line);
    const bul = BULLET.exec(line);
    if ((num && (num[1] ?? "").length === 0) || (bul && (bul[1] ?? "").length === 0)) {
      const ordered = !!num;
      const start = num ? parseInt(num[2] ?? "1", 10) : 1;
      const items: ListItem[] = [];
      while (i < n) {
        const l = lines[i] ?? "";
        const m = ordered ? NUMBERED.exec(l) : BULLET.exec(l);
        if (!m || (m[1] ?? "").length !== 0) break;
        const itemLine = i + 1;
        const textParts: string[] = [ordered ? (m[3] ?? "") : (m[2] ?? "")];
        const children: ListItem[] = [];
        let childIndent = -1;   // the indent of the FIRST nested bullet; deeper refuses
        i++;
        // Continuation and nested lines: anything indented, up to a blank
        // line followed by an unindented line (a new block) or the next item.
        while (i < n) {
          const c = lines[i] ?? "";
          if (c.trim() === "") {
            // A blank line ends the item unless the next non-blank line is
            // still indented (a wrapped item with a paragraph gap).
            const nxt = lines[i + 1] ?? "";
            if (/^\s+\S/.test(nxt)) { i++; continue; }
            break;
          }
          if (!/^\s+\S/.test(c)) break;
          const nb = BULLET.exec(c);
          if (nb && (nb[1] ?? "").length > 0) {
            const nbIndent = (nb[1] ?? "").length;
            if (childIndent < 0) childIndent = nbIndent;
            else if (nbIndent > childIndent)
              throw new LessonSyntaxError(i + 1, "a nested list deeper than one bullet level");
            // Wrapped nested bullet: deeper-indented continuation lines.
            // The RAW text is joined and parsed once -- re-parsing the
            // rendered text would drop the backticks and turn a code span
            // back into prose (and `<unit>` back into "raw HTML").
            const childLine = i + 1;
            let raw = nb[2] ?? "";
            i++;
            while (i < n) {
              const cc = lines[i] ?? "";
              const ind = (/^(\s*)/.exec(cc)?.[1] ?? "").length;
              if (cc.trim() === "" || ind <= nbIndent || BULLET.test(cc)) break;
              raw += " " + cc.trim();
              i++;
            }
            children.push({ inlines: parseInline(raw, childLine) });
            continue;
          }
          if (BULLET.test(c) || NUMBERED.test(c)) {
            throw new LessonSyntaxError(i + 1, "a nested list deeper than one bullet level");
          }
          textParts.push(c.trim());
          i++;
        }
        const item: ListItem = { inlines: parseInline(textParts.join(" "), itemLine) };
        if (children.length) item.children = children;
        items.push(item);
        // Skip a blank line between items of the same list.
        if (i < n && (lines[i] ?? "").trim() === "") {
          const nxt = lines[i + 1] ?? "";
          const nm = ordered ? NUMBERED.exec(nxt) : BULLET.exec(nxt);
          if (nm && (nm[1] ?? "").length === 0) i++;
        }
      }
      blocks.push({ kind: "list", ordered, start, items, line: ln });
      continue;
    }

    // Paragraph: consecutive non-blank lines that open no other block.
    const buf: string[] = [line.trim()];
    i++;
    while (i < n) {
      const c = lines[i] ?? "";
      if (c.trim() === "" || HEADING.test(c) || FENCE.test(c)
          || (BULLET.exec(c)?.[1] ?? "x").length === 0
          || (NUMBERED.exec(c)?.[1] ?? "x").length === 0
          || c.trim().startsWith("|")) break;
      buf.push(c.trim());
      i++;
    }
    blocks.push({ kind: "paragraph", inlines: parseInline(buf.join(" "), ln), line: ln });
  }
  return blocks;
}

/** The headings, for an outline: text + 1-based line. */
export function lessonOutline(md: string): { key: string; line: number; level: number }[] {
  return parseLesson(md)
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading")
    .map((b) => ({ key: b.text, line: b.line, level: b.level }));
}
