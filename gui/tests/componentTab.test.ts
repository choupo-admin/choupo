import { describe, expect, it } from "vitest";

import { rawRecordFor } from "../src/case/catalogue.js";
import { readComponentRecord } from "../src/case/componentRecord.js";
import { componentTabName } from "../src/ui/explore/ComponentTab.js";

describe("componentTabName — the tab is ADDRESSABLE, not stashed", () => {
  it("reads the component name out of the URL", () => {
    expect(componentTabName("?component=acetophenone")).toBe("acetophenone");
    expect(componentTabName("?workspace=explore&component=water")).toBe("water");
  });

  it("survives encoding and stray whitespace", () => {
    expect(componentTabName("?component=1%2C4-dioxane")).toBe("1,4-dioxane");
    expect(componentTabName("?component=%20water%20")).toBe("water");
  });

  it("an absent or empty parameter yields no name (the tab then refuses)", () => {
    expect(componentTabName("")).toBe("");
    expect(componentTabName("?workspace=explore")).toBe("");
    expect(componentTabName("?component=")).toBe("");
  });

  // The whole point of addressing by name: a URL round-trips through the
  // catalogue with no stash in between, so the tab is bookmarkable and cannot
  // expire. If this ever needed a localStorage key, it would have lost that.
  it("a name from a URL resolves straight to a record", () => {
    const name = componentTabName("?component=water");
    const record = readComponentRecord(rawRecordFor(name)!);
    expect(record!.name).toBe("water");
  });

  // Names resolve EXACTLY (Database.cpp: no CAS, no alias resolution). A tab
  // that quietly fuzzy-matched would open a different substance than the URL
  // names -- the worst possible failure for a shareable link.
  it("does not resolve a CAS number or a near-miss to a component", () => {
    expect(rawRecordFor("7732-18-5")).toBeNull();
    expect(rawRecordFor("Water")).toBeNull();
  });
});
