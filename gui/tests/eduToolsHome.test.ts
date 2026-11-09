/*---------------------------------------------------------------------------*\
  The EduTools home and the guided-sequence bar (DEV.md 4c C251).

  Vítor, 2026-11-08: the workspace opened straight on McCabe-Thiele and the
  "Path" bar was unexplained.  Held here: with no tool in the address the
  boot is null (the home); `&tool=` and `&path=` deep links still open a tool;
  the home lists every live tool exactly once and every sequence with each
  step's reason; the bar says "Guided sequence", never "Path", and leaves to
  the home.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it } from "vitest";

import { EduToolsHome } from "../src/ui/methods/EduToolsHome.js";
import { PathBar } from "../src/ui/methods/PathBar.js";
import {
  METHOD_PATHS, METHOD_TOOLS, bootTool, getActiveMethodTool, getActivePath,
  goToEduToolsHome, startGuidedSequence,
} from "../src/ui/methods/registry.js";

type G = { window?: unknown };
function withSearch<T>(search: string, f: () => T): T {
  const g = globalThis as G;
  const saved = g.window;
  g.window = { location: { search } };
  try { return f(); } finally { g.window = saved; }
}
const html = (el: unknown): string =>
  renderToStaticMarkup(createElement(MantineProvider, null, el as never));

afterEach(() => { goToEduToolsHome(); });

describe("the null boot", () => {
  it("an empty query boots to the home, not to a tool", () => {
    expect(withSearch("", () => bootTool())).toBeNull();
    expect(withSearch("?workspace=methods", () => bootTool())).toBeNull();
    expect(withSearch("?workspace=methods&tool=nonsense", () => bootTool())).toBeNull();
  });
  it("a deep link still opens its tool; a path link opens the first step", () => {
    expect(withSearch("?workspace=methods&tool=letdown", () => bootTool())).toBe("letdown");
    const p = METHOD_PATHS[0]!;
    expect(withSearch(`?workspace=methods&path=${p.id}`, () => bootTool())).toBe(p.steps[0]!.tool);
  });
});

describe("the home", () => {
  const out = html(createElement(EduToolsHome));
  it("says what an EduTool is", () => {
    expect(out).toContain("An EduTool is a method built in front of the student");
  });
  it("lists every live tool exactly once, with its blurb", () => {
    for (const t of METHOD_TOOLS.filter((m) => m.status === "live")) {
      const n = out.split(`data-method-home-tool="${t.id}"`).length - 1;
      expect(n, t.id).toBe(1);
    }
  });
  it("shows every sequence with a Start button and every step's reason", () => {
    for (const p of METHOD_PATHS) {
      expect(out).toContain(`data-method-sequence="${p.id}"`);
      for (const s of p.steps) expect(out).toContain(s.why.replace(/&/g, "&amp;"));
    }
    expect(out.split(">Start<").length - 1).toBe(METHOD_PATHS.length);
  });
});

describe("the guided-sequence bar", () => {
  it("is absent at the home, reads Guided sequence (never Path), and Leave returns to the home", () => {
    expect(html(createElement(PathBar))).not.toContain("data-method-paths");
    const p = METHOD_PATHS[0]!;
    startGuidedSequence(p.id);
    expect(getActiveMethodTool()).toBe(p.steps[0]!.tool);
    const bar = html(createElement(PathBar));
    expect(bar).toContain(`Guided sequence: ${p.title}`);
    expect(bar).toContain(`step 1 of ${p.steps.length}`);
    expect(bar).toContain(p.steps[0]!.why.replace(/&/g, "&amp;"));
    expect(bar).toContain("Previous");
    expect(bar).toContain("Next");
    expect(bar).toContain("Leave the sequence");
    expect(bar).not.toMatch(/>Path</);
    goToEduToolsHome();
    expect(getActiveMethodTool()).toBeNull();
    expect(getActivePath()).toBeNull();
  });
});
