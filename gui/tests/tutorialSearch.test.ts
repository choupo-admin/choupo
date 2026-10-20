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
  The Open Case search (DEV.md 4c C113, part 1).  What is pinned is the
  CONTRACT Vítor wrote, each arm a sentence of it: case- and
  accent-insensitive, several words in any order, README hits, the ranking
  name > description > README, a click / Enter / double-click opening the
  RIGHT case, and an empty query leaving the folder browser alone.

  The search runs over the REAL index (`TUTORIALS`), not a fixture, for the
  arms that are about the corpus (the RO tutorials must be findable); the
  ranking arms use small synthetic entries so the order they pin is the
  rule's and not an accident of today's descriptions.

  The rows are tested as React ELEMENTS (their props called directly): the
  suite has no DOM, and what is being pinned is which name a row's handler
  hands to `openByName`, which an element answers without one.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { TUTORIALS, type TutorialEntry } from "../src/cases/tutorials.js";
import { searchEnterTarget, searchTutorials } from "../src/cases/tutorialSearch.js";
import { excerptAround, fold, parseQuery } from "../src/search/textSearch.js";
import { renderCases, searchResultRows } from "../src/ui/OpenTutorialModal.js";

function entry(name: string, description: string, readme = ""): TutorialEntry {
  const shortName = name.split("/").pop()!;
  return {
    name, shortName, category: "steady", subclass: "", description,
    application: "choupoSolve", tier: "", readme, files: {} as TutorialEntry["files"],
  };
}

describe("folding and terms", () => {
  it("is case- and accent-insensitive on both sides", () => {
    expect(fold("Destilação ÉTANOL")).toBe("destilacao etanol");
    const a = searchTutorials("DESTILACAO", [entry("steady/x/a", "uma destilação")]);
    const b = searchTutorials("destilação", [entry("steady/x/a", "uma DESTILACAO")]);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });

  it("several words match in any order, and EVERY word must match", () => {
    const es = [entry("steady/x/a", "seawater desalination by membranes"),
                entry("steady/x/b", "seawater cooling")];
    expect(searchTutorials("membranes seawater", es).map((h) => h.entry.name))
      .toEqual(["steady/x/a"]);
    expect(searchTutorials("seawater membranes", es).map((h) => h.entry.name))
      .toEqual(["steady/x/a"]);
  });

  it("a blank query is NO search, never 'everything'", () => {
    expect(parseQuery("   ")).toEqual([]);
    expect(searchTutorials("  ", TUTORIALS)).toEqual([]);
  });

  it("a two-letter term matches only at a word start", () => {
    const es = [entry("steady/x/proc", "a process"), entry("steady/x/ro", "an RO train")];
    expect(searchTutorials("ro", es).map((h) => h.entry.name)).toEqual(["steady/x/ro"]);
  });
});

describe("the corpus", () => {
  it("'reverse osmosis' and 'osmose inversa' find the RO tutorials (the abbreviation bridge)", () => {
    for (const q of ["reverse osmosis", "osmose inversa", "Osmose Inversa", "RO"]) {
      const names = searchTutorials(q, TUTORIALS).map((h) => h.entry.name);
      expect(names, q).toContain("steady/membranes/membrane01_RO_NaCl_seawater");
      expect(names, q).toContain("steady/membranes/membrane16_module_sw30hr_8040");
      // ...and not every page that has "ro" inside a word ("process").
      expect(names.length, q).toBeLessThan(TUTORIALS.length / 4);
    }
  });

  it("finds a case by a word only its README carries", () => {
    // Read a word off a real README that its name and description do not
    // carry, so the arm cannot pass through another field.
    const e = TUTORIALS.find((t) => (t.readme ?? "").length > 400)!;
    const words = (e.readme ?? "").match(/[A-Za-z]{9,}/g) ?? [];
    const w = words.find((x) =>
      !fold(`${e.name} ${e.description} ${e.category} ${e.subclass}`).includes(fold(x)))!;
    expect(w).toBeTruthy();
    const hits = searchTutorials(w, TUTORIALS);
    const mine = hits.find((h) => h.entry.name === e.name);
    expect(mine).toBeTruthy();
    expect(mine!.bestField).toBe("readme");
    const ex = excerptAround(e.readme!, parseQuery(w))!;
    expect(fold(ex.hit)).toBe(fold(w));
  });

  it("searches every category regardless of the folder", () => {
    const cats = new Set(searchTutorials("e", TUTORIALS).map((h) => h.entry.category));
    expect(cats.size).toBeGreaterThan(3);
  });
});

describe("ranking: name > description > README", () => {
  it("orders by the field the words matched in", () => {
    const es = [
      entry("steady/x/zzz_readme", "nothing", "about a crystalliser here"),
      entry("steady/x/zzz_desc", "a crystalliser"),
      entry("steady/x/crystalliser01", "nothing"),
    ];
    expect(searchTutorials("crystalliser", es).map((h) => h.entry.shortName))
      .toEqual(["crystalliser01", "zzz_desc", "zzz_readme"]);
  });
});

describe("opening the RIGHT case", () => {
  it("Enter opens the highlighted result, or nothing -- never a prior selection", () => {
    const es = [entry("steady/x/a1", "alpha one"), entry("steady/x/a2", "alpha two")];
    const hits = searchTutorials("alpha", es);
    expect(searchEnterTarget(hits, 0)).toBe(hits[0]!.entry.name);
    expect(searchEnterTarget(hits, 1)).toBe(hits[1]!.entry.name);
    expect(searchEnterTarget(hits, 99)).toBe(hits[1]!.entry.name);
    expect(searchEnterTarget([], 0)).toBeNull();
  });

  it("a click on a result opens THAT result", () => {
    const hits = searchTutorials("membrane", TUTORIALS);
    expect(hits.length).toBeGreaterThan(2);
    const opened: string[] = [];
    const rows = searchResultRows(hits, "membrane", 0, () => {}, (n) => opened.push(n));
    (rows[2] as ReactElement<{ onOpen: () => void }>).props.onOpen();
    expect(opened).toEqual([hits[2]!.entry.name]);
  });

  it("a double-click opens the CLICKED case, whatever was selected before", () => {
    const es = [entry("steady/x/first", "a"), entry("steady/x/second", "b")];
    const opened: string[] = [];
    // The selection is still "first" (the stale one) when the second row is
    // double-clicked: the row must not read it.
    const rows = renderCases(es, "steady/x/first", () => {}, (n) => opened.push(n));
    (rows[1] as ReactElement<{ onDoubleSelect: () => void }>).props.onDoubleSelect();
    expect(opened).toEqual(["steady/x/second"]);
  });
});
