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
  The chapter menu of every EduTool is read off the rendered page (chapters.ts),
  so the order of a page's headings IS the order of its menu.  The real defect
  this gate would have caught (Vítor, 2026-11-25, `tool=dryer-selection`: "the
  navigation between the parts is confusing"): the page's parts came as a card,
  a card, a group "steps 9 to 12", then steps 1 to 8 inside a closed drawer; 26
  flat entries, "When each is used, and why" twice.

  Every live tool that the workspace mounts without props is rendered to static
  markup and its <h4>/<h5> headings are read in DOM order.  Per page:
    R1  no chapter without a title;
    R2  no two chapters with the same key (chapterSlug: two identical titles
        make a Find hit and a `&step=` link ambiguous);
    R3  the numbers of the numbered chapters ("n · title"; a part that begins
        with a number or "Part n") ascend in DOM order, parts and steps each on
        their own;
    R4  at most two parts (<h4>) come before the first numbered step.
  A page that fails today is pinned BY NAME in chapterOrderDebt.tsv with the
  rule it breaks.  The ratchet is exact: a page that fails and is not pinned
  fails, and a pinned page that no longer fails fails too, so the file can only
  shrink.  The two tools the workspace mounts with props (mccabe, psychro) and
  any tool whose static render throws are listed in UNRENDERED, and that list
  is pinned the same way.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { breaks, headingsOf, type Heading } from "./chapterOrderKit.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = readFileSync(join(HERE, "../src/ui/MethodsWorkspace.tsx"), "utf8");

/** tool id -> [module file, export name], read from the workspace's own dispatch. */
function mounted(): Map<string, [string, string]> {
  const lazy = new Map<string, [string, string]>();
  const re = /const (\w+) = lazy\(\(\) =>\s*import\("\.\/methods\/(\w+)\.js"\)\s*\.then\(\(m\) => \(\{ default: m\.(\w+) \}\)\)\)/g;
  for (let m = re.exec(WORKSPACE); m; m = re.exec(WORKSPACE)) lazy.set(m[1]!, [m[2]!, m[3]!]);
  const out = new Map<string, [string, string]>();
  const d = /tool === "([\w-]+)" \? <(\w+) \/>/g;
  for (let m = d.exec(WORKSPACE); m; m = d.exec(WORKSPACE)) {
    const t = lazy.get(m[2]!);
    if (t) out.set(m[1]!, t);
  }
  return out;
}

const DEBT = readFileSync(join(HERE, "chapterOrderDebt.tsv"), "utf8")
  .split("\n").filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t") as [string, string, string]);

// The Plotly bundle needs a browser (`self`, `document`) and is the bulk of the load time;
// no heading is drawn by it, so it is mocked at its two seams (as axisScale.test.ts does).
vi.mock("plotly.js-basic-dist-min", () => ({ default: {} }));
vi.mock("react-plotly.js/factory", () => ({ default: () => () => null }));

const MODULES = import.meta.glob("../src/ui/methods/*.tsx") as Record<string, () => Promise<unknown>>;

async function render(tool: string, mod: string, exp: string): Promise<string | null> {
  try {
    const load = MODULES[`../src/ui/methods/${mod}.tsx`];
    if (!load) throw new Error(`no module ${mod}.tsx`);
    const m = await load() as Record<string, never>;
    return renderToStaticMarkup(createElement(MantineProvider, null, createElement(m[exp] as never)));
  } catch (e) { if (process.env.CHAPTER_DEBUG) console.log(tool, String(e).slice(0, 200)); return null; }
}

describe("the chapter order of every live EduTool (menu = DOM order)", () => {
  const live = new Map<string, [string, string]>();
  for (const [id, t] of mounted()) {
    const e = METHOD_TOOLS.find((x) => x.id === id);
    if (e && e.status === "live") live.set(id, t);
  }
  const results = new Map<string, string[] | "unrendered">();

  it("renders every live prop-free tool and applies R1 to R4", async () => {
    expect(live.size).toBeGreaterThan(90);
    for (const [id, [mod, exp]] of live) {
      const html = await render(id, mod, exp);
      if (html === null) { results.set(id, "unrendered"); continue; }
      const h = headingsOf(html);
      results.set(id, h.length >= 4 ? breaks(h) : []);
    }
    expect(results.size).toBe(live.size);
  }, 900000);

  it("the failing pages are exactly the pinned ones (the debt only shrinks)", () => {
    const now = new Set<string>();
    for (const [id, r] of results) {
      if (r === "unrendered") now.add(`${id}\tUNRENDERED`);
      else for (const rule of r) now.add(`${id}\t${rule}`);
    }
    const pinned = new Set(DEBT.map(([id, rule]) => `${id}\t${rule}`));
    const fresh = [...now].filter((x) => !pinned.has(x));
    const stale = [...pinned].filter((x) => !now.has(x));
    expect(fresh, "pages failing the chapter rules and not pinned in chapterOrderDebt.tsv").toEqual([]);
    expect(stale, "pinned pages that no longer fail: delete the row").toEqual([]);
  });

  it("the rules themselves, on small pages", () => {
    const h = (...t: [4 | 5, string][]): Heading[] => t.map(([level, title]) => ({ level, title }));
    expect(breaks(h([5, "1 · a"], [5, "2 · b"], [5, "3 · c"], [5, "4 · d"]))).toEqual([]);
    expect(breaks(h([5, "2 · a"], [5, "1 · b"]))).toEqual(["R3"]);
    expect(breaks(h([4, "1 · Understand"], [5, "1 · a"], [5, "2 · b"], [4, "2 · Experiment"], [5, "3 · c"]))).toEqual([]);
    expect(breaks(h([4, "2 · Experiment"], [4, "1 · Understand"]))).toEqual(["R3"]);
    expect(breaks(h([5, "1 · same"], [5, "2 · same"]))).toEqual(["R2"]);
    expect(breaks(h([5, "1 · same"], [5, "Same"]))).toEqual(["R2"]);
    expect(breaks(h([5, ""], [5, "1 · b"]))).toEqual(["R1"]);
    expect(breaks(h([4, "p"], [5, "x"], [4, "q"], [5, "y"], [4, "r"], [5, "1 · z"]))).toEqual(["R4"]);
    expect(breaks(h([4, "p"], [4, "q"], [5, "1 · z"]))).toEqual([]);
  });
});
