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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { literatureLink, literatureSeed, resolveWorkspaceSearch } from "../src/state/workspaceUrl.js";
import { exploreLink, exploreViewInSearch } from "../src/ui/explore/selectionLink.js";
import { MODE_TABS } from "../src/ui/workspaces.js";

describe("resolveWorkspaceSearch: one URL word per screen", () => {
  //  ONE EXPLORE SINCE 2026-10-21 (DEV.md 4c C116): the catalogue and the
  //  property surfaces are two VIEWS of one tab, keyed `explore` and labelled
  //  "Explore"; the view is the screen's own reading of `view=`.
  it("?workspace=explore is Explore, already canonical, with or without a set", () => {
    expect(resolveWorkspaceSearch("?workspace=explore"))
      .toEqual({ key: "explore", canonical: null });
    expect(resolveWorkspaceSearch("?workspace=explore&components=water,ethanol"))
      .toEqual({ key: "explore", canonical: null });
    expect(resolveWorkspaceSearch("?workspace=explore&view=catalogue"))
      .toEqual({ key: "explore", canonical: null });
  });

  it("the retired `properties` is a REDIRECT to the surfaces view, set kept", () => {
    const r = resolveWorkspaceSearch("?workspace=properties&components=water,ethanol");
    expect(r.key).toBe("explore");
    expect(r.canonical).toBe("?workspace=explore&components=water,ethanol&view=surfaces");
    expect(exploreViewInSearch(r.canonical!)).toBe("surfaces");
    //  and with no set: the surfaces still, never the catalogue (no wizard)
    const e = resolveWorkspaceSearch("?workspace=properties");
    expect(e.canonical).toBe("?workspace=explore&view=surfaces");
    expect(exploreViewInSearch(e.canonical!)).toBe("surfaces");
  });

  it("the retired `compounds` is a REDIRECT to the catalogue view", () => {
    const r = resolveWorkspaceSearch("?workspace=compounds");
    expect(r).toEqual({ key: "explore", canonical: "?workspace=explore&view=catalogue" });
    expect(exploreViewInSearch(r.canonical!)).toBe("catalogue");
  });

  it("a redirect reads as the address the screen itself publishes", () => {
    //  Two spellings of one address is how a reader concludes they are two
    //  addresses: the redirected bar opens the view exploreLink names.
    for (const v of ["surfaces", "catalogue"] as const) {
      const legacy = v === "surfaces" ? "?workspace=properties&components=water"
                                      : "?workspace=compounds&components=water";
      const r = resolveWorkspaceSearch(legacy);
      expect(exploreViewInSearch(r.canonical!)).toBe(exploreViewInSearch(exploreLink(["water"], v)));
    }
  });

  it("a redirect keeps every OTHER parameter, and a view already named wins", () => {
    const r = resolveWorkspaceSearch("?foo=1&workspace=properties&components=a,b&bar=2&lens=gamma");
    const p = new URLSearchParams(r.canonical!);
    expect(p.get("workspace")).toBe("explore");
    expect(p.get("view")).toBe("surfaces");
    expect(p.get("components")).toBe("a,b");
    expect(p.get("lens")).toBe("gamma");
    expect(p.get("foo")).toBe("1");
    expect(p.get("bar")).toBe("2");
    expect(new URLSearchParams(resolveWorkspaceSearch(
      "?workspace=compounds&view=surfaces").canonical!).get("view")).toBe("surfaces");
  });

  it("`component=` (singular, a record tab) is NOT a set", () => {
    //  componentTab.test.ts pins `?workspace=explore&component=water` as a
    //  record tab; AppShell routes it before the workspace.  A plural/singular
    //  slip would read it as a set and open the surfaces.
    expect(resolveWorkspaceSearch("?workspace=explore&component=water"))
      .toEqual({ key: "explore", canonical: null });
    expect(exploreViewInSearch("?workspace=explore&component=water")).toBe("catalogue");
  });

  it("methods, the McCabe legacy, control, and nothing", () => {
    expect(resolveWorkspaceSearch("?workspace=methods&tool=wegstein").key).toBe("methods");
    //  The McCabe legacy has NO canonical here: setActiveMethodTool rewrites
    //  the bar the moment the tool is selected, and two writers of one
    //  address would be a second home.
    expect(resolveWorkspaceSearch("?explore=mccabe"))
      .toEqual({ key: "methods", canonical: null });
    expect(resolveWorkspaceSearch("?explore=mccabe&key=abc").key).toBeNull();
    expect(resolveWorkspaceSearch("?case=ctrl02&view=control").key).toBe("control");
    expect(resolveWorkspaceSearch("?workspace=control").key).toBe("control");
    expect(resolveWorkspaceSearch("").key).toBeNull();
    expect(resolveWorkspaceSearch("?case=steady/flash01").key).toBeNull();
  });

  it("A CANONICAL ADDRESS IS A FIXED POINT: resolving what the rewrite "
     + "produced yields the same screen and no further rewrite", () => {
    //  This is the property that makes 'one word per screen' true rather
    //  than asserted: after one translation the address stops moving.
    for (const legacy of [
      "?workspace=properties&components=water,ethanol",
      "?workspace=properties",
      "?workspace=compounds",
      "?workspace=compounds&component=water",
    ]) {
      const first = resolveWorkspaceSearch(legacy);
      expect(first.canonical, legacy).toBeTruthy();
      const again = resolveWorkspaceSearch(first.canonical!);
      expect(again.key, legacy).toBe(first.key);
      expect(again.canonical, legacy).toBeNull();
    }
  });

  it("every published door in MODE_TABS is already canonical", () => {
    //  The hub's own tabs must never emit an address that boot would rewrite:
    //  that would be the hub publishing a legacy spelling.
    for (const tab of MODE_TABS) {
      const r = resolveWorkspaceSearch(tab.search);
      expect(r.key, tab.label).not.toBeNull();
      expect(r.canonical, `${tab.label} publishes ${tab.search}, which boot would rewrite`)
        .toBeNull();
    }
  });
});

/*  ---- THE SOURCE ARM -------------------------------------------------------
 *  A routing decision nobody can test is how a query parameter got to choose
 *  a screen unnoticed.  The decision now has one pure home; this arm keeps
 *  it the only one.  */
describe("one reader of ?workspace=", () => {
  const code = (f: string): string =>
    readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("the store delegates to resolveWorkspaceSearch and does not read the "
     + "word itself", () => {
    const s = code("src/state/store.ts");
    expect(s).toContain("resolveWorkspaceSearch(");
    expect(s).not.toContain('get("workspace")');
  });

  it("the store applies the canonical rewrite with replaceState, never "
     + "pushState (no history spam)", () => {
    const s = code("src/state/store.ts");
    const boot = s.slice(s.indexOf("function bootWorkspace"),
                         s.indexOf("function bootWorkspace") + 900);
    expect(boot).toContain("canonical");
    expect(boot).toContain("replaceState");
    expect(boot).not.toContain("pushState");
  });
});

describe("the literature address (2026-09-24)", () => {
  it("?workspace=literature opens the literature -- it used to open NOTHING", () => {
    expect(resolveWorkspaceSearch("?workspace=literature"))
      .toEqual({ key: "literature", canonical: null });
  });
  it("the compound rides beside it and the ROUTER does not interpret it", () => {
    expect(resolveWorkspaceSearch("?workspace=literature&compound=water"))
      .toEqual({ key: "literature", canonical: null });
  });
  it("the link the inspector builds is the link the panel reads -- both ways", () => {
    for (const name of ["water", "ethyl acetate", "2-propanol", "a&b=c"]) {
      expect(literatureSeed(literatureLink(name))).toBe(name);
    }
  });
  it("no compound asked for is an EMPTY seed, never a search for nothing", () => {
    expect(literatureSeed("?workspace=literature")).toBe("");
    expect(literatureSeed("?workspace=literature&compound=%20%20")).toBe("");
  });
});
