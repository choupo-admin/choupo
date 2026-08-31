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

  S4  revert the label to "Four ways to price a mixture" -> SURVIVED, and
        that is recorded above rather than patched away: the arm is real but
        aimed elsewhere.
  S5  MenuBar stops passing `m.teaches` -> the second arm fails, naming the
        consequence (everything a tool declares about itself stays off the
        screen).  This is the arm that pins the reported defect.

  NOT CHECKED, deliberately: that the mounted component renders anything
  useful, or that its witness case runs.  This reads source text for a
  branch's existence; a tool wired to the wrong component passes here and is
  caught by that tool's own test.
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const WORKSPACE = readFileSync(
  new URL("../src/ui/MethodsWorkspace.tsx", import.meta.url), "utf-8");

/** Every `tool === "<id>"` branch the workspace actually carries. */
const mountedIds = (): string[] => {
  const hits = WORKSPACE.match(/tool === "([a-z0-9-]+)"/g) ?? [];
  return [...new Set(hits.map((h) => h.replace(/^tool === "|"$/g, "")))];
};

//  THE MODELS A PAGE TEACHES MUST BE FINDABLE BY NAME.  Reported by the
//  owner on 2026-08-31: "os modelos de previsao de propriedades com o pc saft
//  etc nao estao no EduTools".  They were -- two pages cover PC-SAFT,
//  COSMO-SAC, UNIFAC and Joback -- but the menu rendered `label` and nothing
//  else, and no label named a model, so scanning the Thermodynamics shelf
//  returned nothing and the reasonable conclusion was that they were absent.
//
//  Pinned as CONTENT, not as a rendering detail: each model name must reach
//  the reader through the label or through `teaches` (which the menu now
//  shows as the item's tooltip).  Either surface satisfies it -- what must
//  not happen is the name living only inside the page's own body, reachable
//  only by opening the page you cannot find.
//
//  WHICH ARM ACTUALLY CATCHES THE REPORTED DEFECT, said plainly because the
//  sabotage showed it is not the obvious one.  S4 reverted the label to its
//  pre-fix wording and the first arm PASSED: `teaches` already named all four
//  models before any of this, so that arm would have been green on the day
//  the defect was reported.  It pins a DIFFERENT and still-real failure -- a
//  future page teaching a model its registry entry names nowhere -- and it
//  must not be read as covering this one.  The arm that covers this one is
//  the second: the names were present and the menu did not show them, so
//  what was broken was the RENDERING, and only `m.teaches` reaching MenuBar
//  fixes it (S5 fails when it stops).
const MODELS_TAUGHT: Record<string, string[]> = {
  "four-ways-mixture": ["NRTL", "UNIFAC", "COSMO-SAC", "PC-SAFT"],
  "property-origins": ["Joback"],
};

describe("a taught model is findable by its name", () => {
  it("names each model in the label or in what the tool teaches", () => {
    for (const [id, models] of Object.entries(MODELS_TAUGHT)) {
      const t = METHOD_TOOLS.find((m) => m.id === id);
      expect(t, `no registry entry "${id}"`).toBeTruthy();
      const shelf = `${t!.label} ${t!.teaches}`;
      for (const model of models)
        expect(shelf, `"${id}" teaches ${model}, but neither its label nor `
          + "its `teaches` names it — so a reader scanning the menu for "
          + `${model} finds nothing and concludes it is not taught`)
          .toContain(model);
    }
  });

  it("the menu actually shows `teaches`, not the label alone", () => {
    const menu = readFileSync(
      new URL("../src/ui/MenuBar.tsx", import.meta.url), "utf-8");
    expect(menu, "MenuBar renders only `label`, so everything a tool declares "
      + "about itself stays off the screen")
      .toMatch(/m\.teaches/);
  });
});

//  MOUNTED IS NOT USABLE.  Three pages shipped registered, dispatched, and
//  with everything below the fold UNREACHABLE: a tool renders into a flex
//  parent, so a bare <Stack> overflows instead of scrolling.  Nothing caught
//  it -- the mounting arms above pass on a page nobody can read past the
//  first screen, the typechecker is indifferent, and the page LOOKS finished
//  in a screenshot.  The owner found it by scrolling, 2026-08-31.
//
//  Pinned as SOURCE TEXT, and the limits of that are worth stating: this
//  cannot prove a page scrolls, only that it declares the container the 23
//  working pages all declare.  A page could satisfy it and still be broken
//  by a nested overflow.  What it does buy is the failure that actually
//  happened -- a new page written without the wrapper at all.
//
//  `minHeight: 0` is required explicitly, not merely `overflowY`, because it
//  is the load-bearing half: a flex child will not shrink below its content
//  without it and the inner scroll never engages, which is a page that has
//  the property and is still frozen.
//  NO TEST FILE IMPORTS THE SAME MODULE TWICE.  Twice in one day I built a
//  new test by copying an existing file's licence header with a line range
//  that reached line 26 -- where the vitest import lives -- and then wrote
//  my own import below it.  VITEST RUNS SUCH A FILE HAPPILY; `tsc` calls it
//  TS2300 and refuses.  The second time I ran the targeted vitest, the full
//  vitest, and two sabotages, all green, without running typecheck after
//  creating the file -- and the publish workflow (which runs `tsc --noEmit
//  && vite build`) FAILED, leaving an error-boundary fix committed, pushed
//  and not on the site.
//
//  A green test run is not evidence that the file compiles, and the habit
//  that produced it is mine, so the check has to live outside my head.
//  THE DEFECT IS A REPEATED BINDING, NOT A REPEATED MODULE, and this arm's
//  first run proved it: it fired on drillLeaf.test.ts, which imports
//  `{ parse, toJson }` and then `type { JsonDict }` from the same module --
//  entirely legal, and `tsc` accepts it.  A guard aimed one concept wide
//  would have made the suite red over correct code, which is how a check
//  gets disabled.  What TS2300 refuses is the same NAME declared twice.
describe("no test file declares one import binding twice", () => {
  it("has one declaration per imported name per file", () => {
    const dir = new URL("./", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts")
      || f.endsWith(".test.tsx"));
    expect(files.length, "no test files found — the glob moved")
      .toBeGreaterThan(20);
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), "utf-8");
      const seen = new Map<string, number>();
      for (const m of src.matchAll(
             /^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s+"[^"]+";/gm))
        for (const raw of m[1]!.split(",")) {
          //  `a as b` declares b; a bare name declares itself.
          const name = (raw.includes(" as ")
            ? raw.split(" as ")[1] : raw)!.trim();
          if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
        }
      for (const [name, n] of seen)
        expect(n, `${f} declares the import binding "${name}" ${n} times — `
          + "tsc refuses that as TS2300 and the publish workflow fails on "
          + "it, while vitest runs the file without complaint").toBe(1);
    }
  });
});

describe("every EduTool can be scrolled", () => {
  const toolFiles = readdirSync(new URL("../src/ui/methods/", import.meta.url))
    .filter((f) => f.endsWith("Tool.tsx"));

  it("declares the scroll container the working pages declare", () => {
    expect(toolFiles.length, "no tool files found — the glob moved")
      .toBeGreaterThan(20);
    for (const f of toolFiles) {
      const src = readFileSync(
        new URL(`../src/ui/methods/${f}`, import.meta.url), "utf-8");
      expect(src, `${f} never declares overflowY:"auto" — it renders into a `
        + "flex parent, so its content overflows instead of scrolling and "
        + "everything below the fold is unreachable")
        .toMatch(/overflowY:\s*"auto"/);
      //  BOTH PROPERTIES, ON ONE STYLE OBJECT.  Searching the file for
      //  `minHeight: 0` anywhere was satisfied by the COMMENT above the
      //  container explaining why it is needed -- sabotage S7 deleted the
      //  real property and the arm stayed green, matching prose about the
      //  thing instead of the thing.  Anchoring both on the same line is
      //  what makes the sabotage bite.
      expect(src, `${f} declares overflowY but not minHeight: 0 beside it — `
        + "a flex child will not shrink below its content, so the inner "
        + "scroll never engages and the page is frozen anyway")
        .toMatch(/minHeight:\s*0[^\n]*overflowY:\s*"auto"|overflowY:\s*"auto"[^\n]*minHeight:\s*0/);
    }
  });
});

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
