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
  The chapter index of a long EduTool (DEV.md 4c C113, part 3) and the
  resolution of a chapter key on the page (parts 2 and 3).

  The suite has no DOM, so the page is a small FAKE that answers the three
  queries chapters.ts asks (`h4, h5`, `[data-chapter-anchor]`,
  `[data-lesson-limits]`); the list is rendered to static markup inside a
  MantineProvider, which is enough to pin what it SAYS -- the current chapter
  marked, Back to top always, Limits and Sources when the page has them --
  and the small-screen rules are pinned as the pure functions they are.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { ChapterList, chapterButtonLabel } from "../src/ui/methods/ChapterIndex.js";
import {
  chapterListWidth, chapterOf, chapterSlug, currentChapterIndex, isLimitsHeading,
  isSourcesHeading, resolveChapter, stripStepNumber, type Chapter,
} from "../src/ui/methods/chapters.js";

interface FakeEl { tagName: string; textContent: string; attrs: Record<string, string> }
const el = (tagName: string, textContent: string, attrs: Record<string, string> = {}): FakeEl =>
  ({ tagName, textContent, attrs });

/** A page that answers the queries chapters.ts asks, in document order. */
function page(els: FakeEl[]): ParentNode {
  const wrap = (e: FakeEl) => ({ ...e, getAttribute: (k: string) => e.attrs[k] ?? null }) as unknown as Element;
  return {
    querySelectorAll: (sel: string) => {
      if (sel === "h4, h5") return els.filter((e) => e.tagName === "H4" || e.tagName === "H5").map(wrap);
      if (sel === "[data-chapter-anchor]") return els.filter((e) => "data-chapter-anchor" in e.attrs).map(wrap);
      throw new Error(`unexpected selector ${sel}`);
    },
    querySelector: (sel: string) => {
      if (sel === "[data-lesson-limits]") {
        const e = els.find((x) => "data-lesson-limits" in x.attrs);
        return e ? wrap(e) : null;
      }
      throw new Error(`unexpected selector ${sel}`);
    },
  } as unknown as ParentNode;
}

const LETDOWN_LIKE = [
  el("H4", "Part 2 — the liquid valve"),
  el("H5", "8 · Cavitation: vapour that forms, and then collapses"),
  el("H5", "9 · Flashing: vapour that stays"),
  el("DIV", "", { "data-lesson-limits": "" }),
  el("H5", "What this does not show"),
  el("DIV", "Equal-ratio stages are this page's model", { "data-chapter-anchor": chapterSlug("Equal-ratio stages are this page's model") }),
  el("H5", "Sources, and how each was reached"),
];

describe("chapter keys", () => {
  it("drop the step number, the accents and the punctuation", () => {
    expect(stripStepNumber("8 · Cavitation: vapour")).toBe("Cavitation: vapour");
    expect(chapterSlug("8 · Cavitation: vapour that forms")).toBe("cavitation-vapour-that-forms");
    expect(chapterSlug("Destilação à pressão")).toBe("destilacao-a-pressao");
  });

  it("recognise the limits and sources sections, and nothing else", () => {
    expect(isLimitsHeading("What this does not show")).toBe(true);
    expect(isLimitsHeading("What this page is not")).toBe(true);
    expect(isLimitsHeading("Part 6 — limits")).toBe(true);
    expect(isLimitsHeading("6 · T is not K — and K is not T90")).toBe(false);
    expect(isSourcesHeading("Sources, and how each was reached")).toBe(true);
    expect(isSourcesHeading("Where the valve stands")).toBe(false);
  });
});

describe("resolving a chapter on the page (the deep link)", () => {
  const p = page(LETDOWN_LIKE);
  it("a step key finds its heading", () => {
    expect(resolveChapter(p, "cavitation-vapour-that-forms-and-then-collapses")?.textContent)
      .toMatch(/^8 · Cavitation/);
  });
  it("`limits` and `sources` find their sections; `limits/<x>` one limit", () => {
    expect(resolveChapter(p, "limits")?.getAttribute("data-lesson-limits")).toBe("");
    expect(resolveChapter(p, "sources")?.textContent).toMatch(/^Sources/);
    expect(resolveChapter(p, `limits/${chapterSlug("Equal-ratio stages are this page's model")}`)
      ?.textContent).toMatch(/^Equal-ratio/);
    // A limit the page does not anchor falls back to the limits section.
    expect(resolveChapter(p, "limits/no-such-limit")?.getAttribute("data-lesson-limits")).toBe("");
  });
  it("a chapter the page does not draw resolves to nothing (the page opens at its top)", () => {
    expect(resolveChapter(p, "no-such-chapter")).toBeNull();
  });
});

describe("the current chapter", () => {
  it("is the last heading at or above the reading line", () => {
    expect(currentChapterIndex([100, 300, 900], 50)).toBe(-1);
    expect(currentChapterIndex([100, 300, 900], 100)).toBe(0);
    expect(currentChapterIndex([-400, 120, 900], 200)).toBe(1);
    expect(currentChapterIndex([-900, -400, -10], 96)).toBe(2);
  });
});

const CHAPTERS: Chapter[] = LETDOWN_LIKE
  .filter((e) => e.tagName === "H4" || e.tagName === "H5")
  .map((e) => chapterOf({ tagName: e.tagName, textContent: e.textContent } as Element)!);

describe("the list", () => {
  const html = (current: number) => renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(ChapterList, {
      chapters: CHAPTERS, current, limitsAt: 3, sourcesAt: 4, onChapter: () => {}, onTop: () => {},
    })));

  it("marks the current chapter, and only it", () => {
    const h = html(1);
    expect(h.match(/aria-current="location"/g)?.length).toBe(1);
    expect(h).toMatch(/aria-current="location"[^>]*>(?:(?!<\/button>)[\s\S])*Cavitation/);
  });

  it("offers Back to top always, Limits and Sources when the page has them", () => {
    const h = html(-1);
    expect(h).toContain("Back to top");
    expect(h).toContain(">Limits<");
    expect(h).toContain(">Sources<");
    expect(h).not.toMatch(/aria-current/);
    const none = renderToStaticMarkup(createElement(MantineProvider, null,
      createElement(ChapterList, {
        chapters: CHAPTERS, current: 0, limitsAt: -1, sourcesAt: -1, onChapter: () => {}, onTop: () => {},
      })));
    expect(none).toContain("Back to top");
    expect(none).not.toContain(">Limits<");
    expect(none).not.toContain(">Sources<");
  });
});

describe("on a phone", () => {
  it("the list is never wider than the screen less its 16 px gutters", () => {
    expect(chapterListWidth(390)).toBe(358);
    expect(chapterListWidth(320)).toBeLessThanOrEqual(320 - 32);
    expect(chapterListWidth(1280)).toBe(380);
  });

  it("the button says where the reader is, compactly", () => {
    expect(chapterButtonLabel(CHAPTERS, 1, true)).toBe(`2/${CHAPTERS.length}`);
    expect(chapterButtonLabel(CHAPTERS, -1, true)).toBe(`${CHAPTERS.length}`);
    expect(chapterButtonLabel(CHAPTERS, 1, false)).toMatch(/Cavitation/);
    expect(chapterButtonLabel(CHAPTERS, -1, false)).toBe(`Chapters (${CHAPTERS.length})`);
  });
});
