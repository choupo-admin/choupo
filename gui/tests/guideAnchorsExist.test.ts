/*---------------------------------------------------------------------------*\
  EVERY guide anchor in the GUI names a section the guides actually define.

  WHY THIS IS A SOURCE SCAN and not a check over two exported tables.  Anchor
  literals had THREE homes: the EduTools registry (covered by
  methodTheoryAnchors), docs/help-index.json (covered by helpIndex), and
  `case/modelDocs.ts` + `ExploreWorkspace.theoryAnchor()`, covered by nothing.
  A dead anchor lived in the uncovered one -- the Gibbs-map lens pointed at
  `ch:gibbs`, which has never been a label in any build of the Theory Guide,
  so that Theory button opened the manual at page 1 and said nothing.  A link
  that lands on the wrong page is worse than a missing link, because the
  reader believes it.

  Checking the two tables would have closed that hole and left the NEXT one
  open.  So the claim here is the complete one: whatever file it lives in,
  however it is stored, a `"ch:x"` or `"sec:x"` string literal anywhere in
  gui/src must be a `\label{...}` in one of the guides.  A fourth home is
  covered the day it is written, by nobody remembering to cover it.

  WHAT IT DELIBERATELY DOES NOT CLAIM, because the difference matters:

    * it does not check that the anchor is the RIGHT section for the thing
      linking it.  `ch:vap` existing says nothing about whether vapour
      pressure is written there;
    * it reads the `.tex` SOURCES, not the built PDFs.  A label present in
      source and absent from the shipped guide (a stale build) passes here.
      `tools/checkGui/checkGuideViewer.mjs` is what reads the built artefact.

  Comments are stripped before scanning, on purpose: a comment that RECORDS a
  dead anchor ("`ch:gibbs` was never a label") is the fix's own evidence, and
  a gate that fails on its own repair record teaches people to delete
  records.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src");
const DOCS = resolve(here, "../../docs");

/** Every .tex label in the guides, pooled: an anchor may legitimately live in
 *  any of the four, and which guide a link opens is the link's business. */
function labelPool(): Set<string> {
  const labels = new Set<string>();
  for (const f of readdirSync(DOCS)) {
    if (extname(f) !== ".tex") continue;
    const tex = readFileSync(join(DOCS, f), "utf8");
    for (const m of tex.matchAll(/\\label\{([^}]+)\}/g)) labels.add(m[1]!);
  }
  return labels;
}

/** Strip // and /* *\/ comments so a recorded dead anchor is not read as a
 *  live one.  Crude by design -- it may also blank a `//` inside a string,
 *  which can only ever LOSE an anchor from the scan, never invent one. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

describe("guide anchors — every ch:/sec: literal in gui/src is a real \\label", () => {
  it("finds no anchor the guides do not define", () => {
    const labels = labelPool();
    expect(labels.size, "no \\label found in docs/*.tex -- the scan would pass vacuously")
      .toBeGreaterThan(100);

    const dead: string[] = [];
    let checked = 0;
    for (const file of sourceFiles(SRC)) {
      const code = stripComments(readFileSync(file, "utf8"));
      //  Quoted string literals only: "ch:x", 'ch:x' or `ch:x`.
      for (const m of code.matchAll(/["'`]((?:ch|sec):[A-Za-z0-9:_-]+)["'`]/g)) {
        checked++;
        if (!labels.has(m[1]!)) dead.push(`${file.slice(SRC.length + 1)}: ${m[1]}`);
      }
    }

    //  A scan over nothing is not a clean tree.  If the literals stop being
    //  found, the shape of the code changed and this gate stopped watching.
    expect(checked, "no anchor literals found at all -- this gate has gone blind")
      .toBeGreaterThan(50);
    expect(dead, `anchors named by the GUI that no guide defines:\n  ${dead.join("\n  ")}`)
      .toEqual([]);
  });
});
