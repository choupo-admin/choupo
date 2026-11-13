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
  The EduTools home and the guided-sequence bar (DEV.md 4c C251).

  Vítor, 2026-11-08: the workspace opened straight on McCabe-Thiele and the
  "Path" bar was unexplained.  Held here: with no tool in the address the
  boot is null (the home); `&tool=` and `&path=` deep links still open a tool;
  the home leads with a search field, lists every live tool once by section,
  offers no sequence (2026-11-09) and filters through the Find's own index;
  the bar says "Guided sequence", never "Path", and leaves to the home.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it } from "vitest";

import { EduToolsHome } from "../src/ui/methods/EduToolsHome.js";
import { PathBar } from "../src/ui/methods/PathBar.js";
import { groupHits } from "../src/ui/methods/homeFilter.js";
import { eduToolsIndex, searchEduTools } from "../src/ui/methods/eduToolsIndex.js";
import {
  METHOD_DISCIPLINES, METHOD_PATHS, METHOD_TOOLS, bootTool, getActiveMethodTool, getActivePath,
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
  const live = METHOD_TOOLS.filter((m) => m.status === "live");
  it("says what an EduTool is, and the search field comes first", () => {
    expect(out).toContain("An EduTool is a method built in front of the student");
    const f = out.indexOf("data-method-home-search");
    expect(f).toBeGreaterThan(-1);
    expect(f).toBeLessThan(out.indexOf("data-method-shelf="));
    expect(f).toBeLessThan(out.indexOf("data-method-home-tool="));
    expect(out).toContain("Find a method, a symbol, an equation");
  });
  it("lists every live tool exactly once, with its blurb, by section", () => {
    for (const t of live) {
      const n = out.split(`data-method-home-tool="${t.id}"`).length - 1;
      expect(n, t.id).toBe(1);
    }
    for (const d of METHOD_DISCIPLINES) {
      if (live.some((m) => m.discipline === d)) expect(out).toContain(`data-method-shelf="${d.replace(/&/g, "&amp;")}"`);
    }
    expect(out).toContain(`${live.length} tools`);
  });
  it("offers no guided sequence", () => {
    expect(out).not.toContain("data-method-home-sequences");
    expect(out).not.toContain("data-method-sequence");
    expect(out).not.toContain("Guided sequence");
    expect(out).not.toContain(">Start<");
  });
});

describe("the home's filter (the Find's own index and matcher)", () => {
  const live = METHOD_TOOLS.filter((m) => m.status === "live");
  const kept = (q: string) => {
    const idx = eduToolsIndex();
    return groupHits(searchEduTools(idx, q, 100000), q);
  };
  it("an empty query keeps every live tool (75 at the time of writing)", () => {
    expect(live.length).toBeGreaterThanOrEqual(74);
    expect(kept("").tools).toBeNull();
    expect(kept("   ").tools).toBeNull();
  });
  it("a tool label leaves that tool", () => {
    const t = live[0]!;
    expect(kept(t.label).tools!.has(t.id)).toBe(true);
    expect(kept(t.label).tools!.size).toBeLessThan(live.length);
  });
  it("a blurb word leaves the tool whose blurb has it", () => {
    const t = live.find((m) => m.blurb.split(/\s+/).some((w) => /^[a-z]{7,}$/.test(w)))!;
    const w = t.blurb.split(/\s+/).find((x) => /^[a-z]{7,}$/.test(x))!;
    expect(kept(w).tools!.has(t.id)).toBe(true);
  });
  it("a section name keeps tools of that section", () => {
    const d = METHOD_DISCIPLINES.find((x) => live.some((m) => m.discipline === x))!;
    const k = kept(d).tools!;
    expect(live.some((m) => m.discipline === d && k.has(m.id))).toBe(true);
    expect(k.size).toBeLessThan(live.length);
  });
  it("a lesson-chapter phrase finds the tool and names the chapter", () => {
    const docs = eduToolsIndex().filter((d) => d.kind === "step" && d.chapter && d.chapter.length > 12);
    const d = docs[0]!;
    const m = kept(d.chapter!);
    expect(m.tools!.has(d.tool)).toBe(true);
    // Either the tool's own row matched or the chapter is shown as the reason.
    expect(m.chapter.has(d.tool) || m.tools!.has(d.tool)).toBe(true);
  });
  it("nonsense keeps nothing", () => {
    expect(kept("zzqxjvkk").tools!.size).toBe(0);
  });
});

describe("a path link", () => {
  it("still opens the first step with the bar showing", () => {
    const p = METHOD_PATHS[0]!;
    expect(withSearch(`?workspace=methods&path=${p.id}`, () => bootTool())).toBe(p.steps[0]!.tool);
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
