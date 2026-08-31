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


/*---------------------------------------------------------------------------*\
  methodMounting — REGISTERED IFF RENDERED, for every EduTool at once.

  A registry entry is what a student sees in the EduTools dropdown; a
  `tool === "<id>"` arm in MethodsWorkspace is what actually draws when they
  click it.  Nothing tied the two together, so a tool could be registered with
  no arm (a menu item that opens blank) or an arm could be orphaned by a
  renamed id (dead code that reads as coverage).  Neither is a type error:
  MethodToolId constrains the id, not the existence of a branch that matches
  it, and vitest was green with both possible.

  The per-tool form of this check already existed -- flashOperatingLineTool's
  "is live and mounted" case -- and it is OPT-IN, which is the failure mode
  rather than the fix: it protects the tool whose author remembered it and
  nothing else.  MEASURED when this file was written: 1 of 25 tools carried
  it.  The other 24 were mounted, so this file pins an invariant that HOLDS
  today; what it buys is the 26th tool, whose author will not write a test
  file at all.

  Derived from METHOD_TOOLS, never from a literal id list -- the registry owns
  that fact (the METHOD_TOOL_KINDS lesson in registry.ts: a second home for a
  list this file owns failed the day a kind was added).

  SABOTAGE-VERIFIED (2026-08-31), each restored byte-identical:
    S1  delete the `four-ways-mixture` arm  -> arm 1 names the tool and says
        clicking it draws nothing; arm 3 reports 24 against 25.
    S2  rename `property-origins` to `property-origin` -> arms 1 AND 2 fire,
        so a rename is caught from both directions at once.
    S3  ADD a `ghost-tool` arm, every real one left intact -> arms 2 and 3
        fire while arm 1 PASSES.  S2 tripped both sides, so it never tested
        arm 2 alone; this one attacks the orphan mechanism by itself.

  NOT CHECKED, deliberately: that the mounted component renders anything
  useful, or that its witness case runs.  This reads source text for a
  branch's existence; a tool wired to the wrong component passes here and is
  caught by that tool's own test.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const WORKSPACE = readFileSync(
  new URL("../src/ui/MethodsWorkspace.tsx", import.meta.url), "utf-8");

/** Every `tool === "<id>"` branch the workspace actually carries. */
const mountedIds = (): string[] => {
  const hits = WORKSPACE.match(/tool === "([a-z0-9-]+)"/g) ?? [];
  return [...new Set(hits.map((h) => h.replace(/^tool === "|"$/g, "")))];
};

describe("every EduTool is mounted", () => {
  it("registered => rendered (no menu entry opens blank)", () => {
    for (const t of METHOD_TOOLS) {
      if (t.status !== "live") continue;
      expect(WORKSPACE, `"${t.id}" is in the registry — so it is in the `
        + "EduTools dropdown — but MethodsWorkspace carries no "
        + `\`tool === "${t.id}"\` arm, so clicking it draws nothing`)
        .toContain(`tool === "${t.id}"`);
    }
  });

  it("rendered => registered (no orphaned arm)", () => {
    const ids = new Set(METHOD_TOOLS.map((t) => t.id as string));
    for (const m of mountedIds()) {
      expect(ids, `MethodsWorkspace draws "${m}", which no registry entry `
        + "declares — a renamed id leaves the old arm behind, and dead code "
        + "that looks like coverage is worse than none").toContain(m);
    }
  });

  it("the two sides are the same size (neither is a subset by accident)", () => {
    const live = METHOD_TOOLS.filter((t) => t.status === "live").length;
    expect(mountedIds()).toHaveLength(live);
  });
});
