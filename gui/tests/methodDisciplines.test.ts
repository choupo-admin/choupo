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
  The discipline shelves (owner, 2026-08-30: "Os EduTools estão a ficar
  longos" -- 23 tools had outgrown a flat list).  These pins hold the
  contract, not the taxonomy: every tool sits on a shelf from the ONE
  ordered list, no shelf is empty (an empty shelf is a label with nothing
  under it), and no shelf holds the whole list (a single shelf would be
  the flat list wearing a heading).  WHICH shelf a tool belongs on is an
  editorial judgement the registry owns; a test that pinned it would have
  to be edited every time the judgement is exercised.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { METHOD_DISCIPLINES, METHOD_TOOLS }
  from "../src/ui/methods/registry.js";

describe("the discipline shelves", () => {
  it("every tool sits on a shelf from the one ordered list", () => {
    for (const t of METHOD_TOOLS) {
      expect(METHOD_DISCIPLINES, `${t.id} declares discipline `
        + `"${t.discipline}", which is not on the shelf list`)
        .toContain(t.discipline);
    }
  });

  it("no shelf is empty, and no shelf is the whole list", () => {
    for (const d of METHOD_DISCIPLINES) {
      const n = METHOD_TOOLS.filter((m) => m.discipline === d).length;
      expect(n, `shelf "${d}" holds no tool — a label with nothing under `
        + "it").toBeGreaterThan(0);
      expect(n, `shelf "${d}" holds every tool — the flat list wearing a `
        + "heading").toBeLessThan(METHOD_TOOLS.length);
    }
  });

  it("the shelves partition the registry (no tool counted twice or zero)", () => {
    const total = METHOD_DISCIPLINES
      .map((d) => METHOD_TOOLS.filter((m) => m.discipline === d).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(METHOD_TOOLS.length);
  });
});
