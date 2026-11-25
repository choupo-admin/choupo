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
  The dryer-selection page in four parts (Vítor, 2026-11-25: "the navigation
  between the parts is confusing").  Pins (1) the order of the parts and the
  steps in the chapter menu, (2) that every `&step=` key the page had before
  the reorder (read off its render that day) still opens a heading of the
  page, directly or through CHAPTER_ALIASES, and (3) that the intro's four
  links name the four parts.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("plotly.js-basic-dist-min", () => ({ default: {} }));
vi.mock("react-plotly.js/factory", () => ({ default: () => () => null }));

import { CHAPTER_ALIASES, chapterSlug } from "../src/ui/methods/chapters.js";
import { DRYER_PARTS, DryerSelectionTool } from "../src/ui/methods/DryerSelectionTool.js";
import { headingsOf, breaks } from "./chapterOrderKit.js";

/** Every chapter key of the page as published on 2026-11-25 before the reorder. */
const OLD_KEYS = [
  "what-you-cannot-calculate-the-bill-of-tests",
  "what-stands-before-and-after-the-dryer",
  "co-current-counter-current-cross-flow-steps-9-to-12",
  "which-of-these-the-engine-models",
  "what-the-energy-column-costs",
  "the-habitual-tables-as-the-books-print-them",
  "along-the-dryer-the-three-arrangements",
  "the-outlets-side-by-side",
  "reading-the-answer-and-what-to-do-when-the-books-disagree",
  "when-each-is-used-and-why",
  "the-form-of-the-feed-is-asked-first",
  "heat-sensitivity-how-long-how-hot-and-in-which-direction",
  "scale-and-mode-batch-below-about-50-kg-h-continuous-above-about-a-tonne-an-hour",
  "nine-types-do-most-of-the-drying-and-they-differ-in-how-heat-reaches-the-product",
  "ask-the-tree",
  "co-current-counter-current-cross-flow-which-gas-meets-which-solid",
  "the-energy-bill-of-a-duty",
  "the-nine-side-by-side",
  "the-balances-along-the-length-and-what-the-driving-force-does-in-each",
  "before-you-choose-what-to-know-about-the-product",
  "the-drum-dryer-in-two-books",
  "the-same-dryer-run-three-ways-by-the-engine",
  "check-your-understanding",
  "what-this-does-not-show",
  "references",
];

const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));
const heads = headingsOf(html);
const keys = new Set(heads.map((h) => chapterSlug(h.title)));

describe("dryer-selection: four parts, numbered in reading order", () => {
  it("the menu reads: four parts (h4) in order, the steps ascending, no repeated title", () => {
    expect(heads.filter((h) => h.level === 4).map((h) => h.title)).toEqual(DRYER_PARTS.map((p) => p.title));
    expect(breaks(heads)).toEqual([]);
    const nums = heads.map((h) => /^(\d+) · /.exec(h.title)?.[1]).filter(Boolean).map(Number);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("each step sits in the part it belongs to", () => {
    const part = (n: number): string => {
      let cur = "";
      for (const h of heads) {
        if (h.level === 4) cur = h.title;
        if (h.title.startsWith(`${n} · `)) return cur;
      }
      return "";
    };
    for (const n of [1, 2, 3, 4]) expect(part(n)).toBe(DRYER_PARTS[0].title);
    for (const n of [5, 6, 7, 8]) expect(part(n)).toBe(DRYER_PARTS[2].title);
    for (const n of [9, 10, 11, 12]) expect(part(n)).toBe(DRYER_PARTS[3].title);
  });
  it("the part keys are the slugs of the part titles (the intro links open them)", () => {
    for (const p of DRYER_PARTS) {
      expect(chapterSlug(p.title)).toBe(p.key);
      expect(html).toContain(`data-part-link="${p.key}"`);
    }
  });
});

describe("dryer-selection: every link to a chapter of the old page still opens one", () => {
  it("each old key is a heading of the page, or an alias that is", () => {
    for (const k of OLD_KEYS) {
      const alias = CHAPTER_ALIASES[k];
      const target = alias ? alias.key : k;
      if (alias) expect(alias.tool, k).toBe("dryer-selection");
      expect(keys.has(target) || target === "references" || target === "what-this-does-not-show",
        `${k} -> ${target}`).toBe(true);
    }
  });
  it("every alias row names a heading that exists", () => {
    for (const [old, a] of Object.entries(CHAPTER_ALIASES))
      if (a.tool === "dryer-selection") {
        expect(keys.has(a.key), old).toBe(true);
        expect(OLD_KEYS).toContain(old);
      }
  });
});
