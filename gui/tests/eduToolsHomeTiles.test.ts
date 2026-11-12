/*---------------------------------------------------------------------------*\
  The EduTools home's section tiles and accents (DEV.md 4c C374).
  Held: one tile per section with the right count and its anchor; counts are
  the matches under a query and a section with none is dimmed; every section
  has an accent from the one table, no two share one, and the colours pass
  the contrast floor the credo (2.6) sets.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { EduToolsHome, homeTiles } from "../src/ui/methods/EduToolsHome.js";
import { SECTION_ACCENTS } from "../src/ui/methods/sectionAccents.js";
import { eduToolsIndex, searchEduTools } from "../src/ui/methods/eduToolsIndex.js";
import { groupHits } from "../src/ui/methods/homeFilter.js";
import { METHOD_DISCIPLINES, METHOD_TOOLS } from "../src/ui/methods/registry.js";

const live = METHOD_TOOLS.filter((m) => m.status === "live");
const sections = METHOD_DISCIPLINES.filter((d) => live.some((m) => m.discipline === d));
const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(EduToolsHome)));
const esc = (s: string) => s.replace(/&/g, "&amp;");

const lum = (h: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const mix = (a: string, b: string, t: number): string =>
  "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t
    + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, "0")).join("");

describe("the section tiles", () => {
  it("one tile per section, with its count and its anchor", () => {
    const tiles = homeTiles(live, () => true);
    for (const d of sections) {
      const n = live.filter((m) => m.discipline === d).length;
      expect(tiles.find((t) => t.d === d)!.n).toBe(n);
      expect(html.split(`data-method-tile="${esc(d)}"`).length - 1, d).toBe(1);
      expect(html).toContain(`href="#method-section-${esc(encodeURIComponent(d))}"`);
      expect(html).toContain(`id="method-section-${esc(d)}"`);
    }
    expect(tiles.length).toBe(sections.length);
    expect(html).not.toContain("Jump to");
    expect(html).not.toContain("data-method-home-jump");
  });
  it("a tile is a real link (Tab, Enter) and the tiles come before the first shelf", () => {
    expect(html).toMatch(/<a [^>]*data-method-tile=/);
    expect(html.indexOf("data-method-tile=")).toBeLessThan(html.indexOf("data-method-shelf="));
  });
  it("under a query the count is the matches; a section with none reads 0", () => {
    expect(homeTiles(live, () => false).every((t) => t.n === 0)).toBe(true);
    const d = sections[2]!;
    const m = groupHits(searchEduTools(eduToolsIndex(), d, 100000), d);
    const t = homeTiles(live, (id) => m.tools !== null && m.tools.has(id as never));
    for (const x of t) {
      const expected = live.filter((l) => l.discipline === x.d && m.tools!.has(l.id as never)).length;
      expect(x.n).toBe(expected);
    }
    expect(t.reduce((a, x) => a + x.n, 0)).toBe(m.tools!.size);
    expect(t.some((x) => x.n === 0)).toBe(true);
  });
});

describe("the accents", () => {
  const hex = /^#[0-9a-f]{6}$/;
  it("every section has one accent, from the table, and no two share one", () => {
    expect(Object.keys(SECTION_ACCENTS).sort()).toEqual([...METHOD_DISCIPLINES].sort());
    for (const scheme of ["light", "dark"] as const) {
      const vals = METHOD_DISCIPLINES.map((d) => SECTION_ACCENTS[d][scheme]);
      for (const v of vals) expect(v).toMatch(hex);
      expect(new Set(vals).size).toBe(vals.length);
    }
  });
  it("does not use the reserved phase colours", () => {
    const phase = ["#1971c2", "#c2255c", "#2b8a3e"];
    for (const d of METHOD_DISCIPLINES) {
      expect(phase).not.toContain(SECTION_ACCENTS[d].light);
      expect(phase).not.toContain(SECTION_ACCENTS[d].dark);
    }
  });
  it("marks hold 3:1 on the page, tile text holds 4.5:1 on the hovered tint", () => {
    for (const d of METHOD_DISCIPLINES) {
      const { light, dark } = SECTION_ACCENTS[d];
      expect(ratio(light, "#ffffff"), `${d} light mark`).toBeGreaterThanOrEqual(3);
      expect(ratio(dark, "#121a1c"), `${d} dark mark`).toBeGreaterThanOrEqual(3);
      expect(ratio("#000000", mix(light, "#ffffff", 0.24)), `${d} light tile`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("#e8f2f2", mix(dark, "#121a1c", 0.24)), `${d} dark tile`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
