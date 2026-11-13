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

/*  THE STREAMS VIEW GROUPS ADVISORIES OF ONE KIND (rehearsal 2026-11-13: 35
    lines of the same provenance notice on the reactive column).  The key is the
    engine's `category` (+ `severity`), never the sentence; the engine's texts
    stay verbatim behind the group's disclosure.  The rendering arms use the
    real component with a mocked store. */

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { groupAdvisories, groupLoci } from "../src/case/advisoryGroups.js";
import type { Advisory } from "../src/adapters/SolverAdapter.js";

vi.mock("../src/state/store.js", () => ({
  useStore: Object.assign(
    (sel: (s: unknown) => unknown) => sel({}),
    { getState: () => ({}), setState: () => undefined, subscribe: () => () => undefined }),
}));

const prov = (name: string): Advisory => ({
  category: "provenance", severity: "info", locus: name,
  message: "reviewStatus interim -- imported, not yet checked against primary sources",
});
const comps = ["isoButene", "methanol", "nButane", "propane", "mtbe"];
const ADV: Advisory[] = [
  ...comps.map(prov),
  { category: "bound", severity: "warning", locus: "tear 'recycle'", message: "bound active" },
  { category: "provenance", severity: "warning", locus: "x", message: "a provenance WARNING" },
  { category: "init", severity: "info", locus: "tear 'a'", message: "auto-initialised" },
];

describe("groupAdvisories", () => {
  const g = groupAdvisories(ADV);
  it("groups by the engine's category and severity, in order of first appearance", () => {
    expect(g.map((x) => `${x.category}/${x.severity}`))
      .toEqual(["provenance/info", "bound/warning", "provenance/warning", "init/info"]);
    expect(g[0]!.items).toHaveLength(5);
  });
  it("never folds a warning into a group of notices", () => {
    expect(g.find((x) => x.severity === "warning" && x.category === "provenance")!.items)
      .toHaveLength(1);
  });
  it("drops no advisory and rewords none", () => {
    expect(g.flatMap((x) => x.items)).toHaveLength(ADV.length);
    expect(g[0]!.items[0]!.message).toBe(ADV[0]!.message);
  });
  it("is not a parse of the sentence: same text under two categories stays two groups", () => {
    const two = groupAdvisories([
      { category: "a", severity: "info", locus: "l", message: "same" },
      { category: "b", severity: "info", locus: "l", message: "same" },
    ]);
    expect(two).toHaveLength(2);
  });
  it("lists the distinct loci of a group from the published locus field", () => {
    expect(groupLoci(g[0]!)).toEqual(comps);
  });
});

describe("the Streams summary band", () => {
  it("shows one line per kind, with the count and every engine text behind a disclosure", async () => {
    const { StreamsSummary } = await import("../src/ui/StreamsSummary.js");
    const run = { status: "done", log: "", streams: [], kpis: {}, advisories: ADV,
      convergence: [] } as never;
    const html = renderToStaticMarkup(
      createElement(MantineProvider, null, createElement(StreamsSummary, { result: run, flow: "mol/s" as never })));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Solver advisories (8)");
    expect(text).toContain("[provenance] 5 advisories");
    expect(html).toContain("data-advisory-group=\"provenance\"");
    //  the engine's text is in the page once per advisory (behind the <details>)
    expect(text.split("reviewStatus interim -- imported").length - 1).toBe(5);
    //  and the old overflow line is gone
    expect(text).not.toContain("more — see Log");
  }, 120_000);
});
