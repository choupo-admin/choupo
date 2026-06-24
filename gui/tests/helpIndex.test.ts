import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  UNIT_HELP,
  WORKSPACE_HELP,
  ALGORITHM_HELP,
  DEFAULT_HELP,
  HELP_TOPICS,
  helpUrl,
  resolveHelp,
} from "../src/help/helpMap.js";

// The tracked Help index (docs/help-index.json) is the single source of truth
// for the GUI's F1 / "Help on current view" / "Browse help topics" deep links.
// These tests guard two invariants:
//   1. the JSON parses into a usable, non-empty map and the URL builder works;
//   2. EVERY anchor it names is a real `\label{...}` in the matching guide .tex
//      (the destlabel=true preamble turns each into a PDF named destination).
// If a guide section is renamed without updating the index, (2) fails loudly
// instead of shipping a Help link that lands at the top of the wrong PDF.

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = resolve(here, "../../docs");
const TEX: Record<string, string> = {
  theory: "theoryGuide.tex",
  user: "userGuide.tex",
  props: "propsGuide.tex",
  developer: "developerGuide.tex",
};

// Load each guide's source once; tolerate a missing .tex (gitignored build
// artifact) by skipping the anchor existence check for that guide only.
const texSource: Record<string, string | null> = {};
for (const [k, file] of Object.entries(TEX)) {
  const p = resolve(docsDir, file);
  texSource[k] = existsSync(p) ? readFileSync(p, "utf8") : null;
}

function labelExists(guide: string, anchor: string): boolean | null {
  const src = texSource[guide];
  if (src == null) return null; // .tex not present -> cannot check
  return new RegExp(`\\\\label\\{${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`).test(src);
}

describe("help index — structure & URL building", () => {
  it("parses into non-empty unit / workspace / algorithm maps", () => {
    expect(Object.keys(UNIT_HELP).length).toBeGreaterThan(10);
    expect(Object.keys(WORKSPACE_HELP).length).toBeGreaterThan(5);
    expect(Object.keys(ALGORITHM_HELP).length).toBeGreaterThan(5);
  });

  it("HELP_TOPICS flattens every bucket with an id and a group", () => {
    const total =
      Object.keys(UNIT_HELP).length +
      Object.keys(WORKSPACE_HELP).length +
      Object.keys(ALGORITHM_HELP).length;
    expect(HELP_TOPICS).toHaveLength(total);
    for (const t of HELP_TOPICS) {
      expect(t.id).toBeTruthy();
      expect(["Unit operations", "Workspaces", "Algorithms & solvers"]).toContain(t.group);
    }
  });

  it("builds a PDF named-destination URL honouring the base", () => {
    const url = helpUrl({ guide: "theory", anchor: "ch:flash" }, "/app/");
    expect(url).toBe("/app/docs/theoryGuide.pdf#nameddest=ch:flash");
    const top = helpUrl({ guide: "user" }, "/");
    expect(top).toBe("/docs/userGuide.pdf");
  });

  it("resolveHelp prefers a selected unit, then workspace, then default", () => {
    expect(resolveHelp({ selectedUnitType: "isothermalFlash" }).anchor).toBe("ch:flash");
    expect(resolveHelp({ activeWorkspace: "props" }).guide).toBe("props");
    expect(resolveHelp({})).toEqual(DEFAULT_HELP);
  });
});

describe("help index — every anchor is a real \\label in its guide", () => {
  const all = [
    ...HELP_TOPICS.map((t) => ({ id: t.id, guide: t.guide, anchor: t.anchor })),
    { id: "(default)", guide: DEFAULT_HELP.guide, anchor: DEFAULT_HELP.anchor },
  ];
  for (const t of all) {
    it(`${t.id} -> ${t.guide}#${t.anchor}`, () => {
      expect(t.anchor, `${t.id} must name an anchor`).toBeTruthy();
      const ok = labelExists(t.guide, t.anchor!);
      if (ok === null) return; // guide .tex not present in this checkout — skip
      expect(ok, `\\label{${t.anchor}} not found in ${TEX[t.guide]}`).toBe(true);
    });
  }
});
