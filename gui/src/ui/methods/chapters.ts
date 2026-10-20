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
  chapters -- what a CHAPTER of an EduTool is, and how one is found on the
  page (DEV.md 4c C113, parts 2 and 3).

  A chapter is a HEADING the page draws: every lesson step is drawn by
  `LessonStepView` as an `<h5>` "n · title", a page's parts are `<h4>`, and
  the limits and sources blocks open with their own `<h5>`.  So the chapter
  index is read off the RENDERED page, never off a list kept beside it: it
  shows exactly what the reader can scroll to, in the order they meet it,
  whether the page's steps come from a lesson module or are written inline.

  A chapter's KEY is the slug of its title with the step number dropped
  ("7 · Cavitation" -> "cavitation"), so a Find hit computed from a lesson
  module's title and a heading on the page agree without either knowing the
  other.  Two keywords name sections rather than headings -- `limits` and
  `sources` -- and `limits/<slug>` names one limit inside the limits block
  (LessonLimits marks each item with `data-chapter-anchor`).

  Everything here is pure or takes the DOM as an argument, so the rules are
  testable in the node test environment.
\*---------------------------------------------------------------------------*/

import { fold } from "../../search/textSearch.js";

/** "7 · Cavitation in the vena contracta" -> "Cavitation in the vena contracta". */
export function stripStepNumber(title: string): string {
  return title.replace(/^\s*\d+\s*[·.:)-]\s*/, "").trim();
}

/** The chapter key of a title: folded, the step number dropped, every run of
 *  non-alphanumerics one hyphen. */
export function chapterSlug(title: string): string {
  return fold(stripStepNumber(title))
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Does a heading open the page's LIMITS section? */
export function isLimitsHeading(title: string): boolean {
  // "What this does not show / model", "What this page is not",
  // "Part 6 — limits", "Limits of the model".
  const t = stripStepNumber(title);
  return /^what this\b.*\bnot\b/i.test(t) || /^limits?\b/i.test(t) || /\blimits$/i.test(t);
}

/** Does a heading open the page's SOURCES section? */
export function isSourcesHeading(title: string): boolean {
  return /^(sources?|references?|bibliography|further reading)\b/i.test(stripStepNumber(title));
}

export interface Chapter {
  /** The heading's visible title. */
  title: string;
  key: string;
  /** 4 = a part of the page, 5 = a chapter inside it. */
  level: 4 | 5;
}

/** The headings that are chapters, in page order. */
export const CHAPTER_SELECTOR = "h4, h5";

/** How many chapters make a page LONG enough to deserve an index. */
export const LONG_PAGE_CHAPTERS = 4;

export function chapterOf(el: Element): Chapter | null {
  const title = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!title) return null;
  return { title, key: chapterSlug(title), level: el.tagName === "H4" ? 4 : 5 };
}

/** The element a chapter key names inside `root`, or null when the page does
 *  not (yet) draw it.  Resolution order: a heading whose key matches; an
 *  element anchored with that key; then the section keywords. */
export function resolveChapter(root: ParentNode, key: string): Element | null {
  const [section, item] = key.includes("/") ? key.split("/", 2) as [string, string] : [key, ""];
  const headings = [...root.querySelectorAll(CHAPTER_SELECTOR)];
  if (!item) {
    const h = headings.find((e) => chapterOf(e)?.key === key);
    if (h) return h;
  }
  const anchors = [...root.querySelectorAll("[data-chapter-anchor]")];
  const a = anchors.find((e) => e.getAttribute("data-chapter-anchor") === (item || key));
  if (a) return a;
  if (section === "limits") {
    return root.querySelector("[data-lesson-limits]")
      ?? headings.find((e) => isLimitsHeading(e.textContent ?? "")) ?? null;
  }
  if (section === "sources") {
    return headings.find((e) => isSourcesHeading(e.textContent ?? "")) ?? null;
  }
  return null;
}

/** Which chapter the reader is in: the last one whose top has scrolled to
 *  within `threshold` px of the reading line.  -1 above the first. */
export function currentChapterIndex(tops: readonly number[], line: number): number {
  let cur = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i]! <= line) cur = i;
    else break;
  }
  return cur;
}

/** How wide the chapter list may be: never wider than the screen less the
 *  16 px gutter on each side, never wider than it reads well. */
export function chapterListWidth(viewportWidth: number): number {
  return Math.max(200, Math.min(380, viewportWidth - 32));
}

/** Scroll every scrolling ancestor of `el` (up to `root`) back to its top. */
export function scrollToTop(root: Element): void {
  const first = root.querySelector(CHAPTER_SELECTOR) ?? root.firstElementChild;
  let n: Element | null = first;
  while (n && n !== root.parentElement) {
    if ((n as HTMLElement).scrollTop > 0) (n as HTMLElement).scrollTop = 0;
    n = n.parentElement;
  }
}
