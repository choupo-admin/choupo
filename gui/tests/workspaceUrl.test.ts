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

import { resolveWorkspaceSearch } from "../src/state/workspaceUrl.js";
import { propertiesLink } from "../src/ui/explore/selectionLink.js";
import { MODE_TABS } from "../src/ui/workspaces.js";

describe("resolveWorkspaceSearch: one URL word per screen", () => {
  it("?workspace=properties is the plots, already canonical", () => {
    expect(resolveWorkspaceSearch("?workspace=properties"))
      .toEqual({ key: "explore", canonical: null });
  });

  it("?workspace=explore with NO set is the catalogue, already canonical", () => {
    expect(resolveWorkspaceSearch("?workspace=explore"))
      .toEqual({ key: "compounds", canonical: null });
  });

  it("THE DEFECT: ?workspace=explore WITH a set still opens the plots -- and "
     + "is rewritten so the word matches the screen", () => {
    const r = resolveWorkspaceSearch("?workspace=explore&components=water,ethanol");
    expect(r.key).toBe("explore");
    expect(r.canonical).toBe("?workspace=properties&components=water,ethanol");
  });

  it("the rewrite spells the set exactly as propertiesLink publishes it", () => {
    //  Two spellings of one address is how a reader concludes they are two
    //  addresses.  The rewritten bar must be byte-for-byte the link the
    //  catalogue itself hands out for the same set.
    const r = resolveWorkspaceSearch("?workspace=explore&components=water,ethanol");
    expect(r.canonical).toBe(propertiesLink(["water", "ethanol"]));
  });

  it("the rewrite keeps every OTHER parameter: data travels untouched", () => {
    const r = resolveWorkspaceSearch("?foo=1&workspace=explore&components=a,b&bar=2");
    const p = new URLSearchParams(r.canonical!);
    expect(p.get("workspace")).toBe("properties");
    expect(p.get("components")).toBe("a,b");
    expect(p.get("foo")).toBe("1");
    expect(p.get("bar")).toBe("2");
  });

  it("`component=` (singular, a record tab) is NOT a set and does not bend "
     + "the catalogue into the plots", () => {
    //  componentTab.test.ts pins `?workspace=explore&component=water` as a
    //  record tab on the landing.  A plural/singular slip here would send
    //  every such tab to the plots with an empty set.
    expect(resolveWorkspaceSearch("?workspace=explore&component=water"))
      .toEqual({ key: "compounds", canonical: null });
  });

  it("the internal key `compounds` is honoured as a link and rewritten to the "
     + "landing's published word", () => {
    expect(resolveWorkspaceSearch("?workspace=compounds"))
      .toEqual({ key: "compounds", canonical: "?workspace=explore" });
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
      "?workspace=explore&components=water,ethanol",
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
