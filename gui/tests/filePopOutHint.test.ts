/*  THE POP-OUT'S HINT, pinned to the KIND of file it opens.
 *
 *  Until 2026-09-06 `popOutFileHtml` printed ONE sentence under every file it
 *  opened -- "Edit this file in your text editor and reload the case" -- which
 *  is true of an authored dict and of the authored `0/` state, and false of
 *  every run output: the engine regenerates `converged/`, `design/`, the
 *  transient instants and the unit interiors under them WHOLE on the next run.
 *  A student who followed it edited a file, reloaded, and saw nothing change,
 *  with no way to tell from the screen whether the app had ignored them or
 *  whether they had changed an answer.
 *
 *  The arm that matters most is `0/internalStates/...`: `kindOf` says
 *  "interior" for a unit interior in EVERY view, so a reader who keys the hint
 *  on the kind gives the machine-written sentence to a profile the case
 *  AUTHORS.  Only `isRunOutput` -- the view the path sits in -- draws that
 *  line, and this pins it.
 */
import { describe, it, expect } from "vitest";
import { fileHtml } from "../src/ui/filePopOut";
import { AUTHORED_FILE_HINT, RUN_OUTPUT_HINT } from "../src/ui/caseTree";

const authored = [
  "system/flowsheetDict",
  "constant/thermoPhysPropDict",
  "CONCENTRATION/system/flowsheetDict",
  "0/feed",
  "0/CONCENTRATION/brine",
  //  A unit interior the CASE declares: the profile the column starts from.
  "0/internalStates/column01",
  "0/internalStates/SEPARATION/column01",
];

const written = [
  "converged/product",
  "converged/CONCENTRATION/brine",
  "design/CONCENTRATION/Evap1/E-101",
  "converged/internalStates/column01",
  "converged/internalStates/SEPARATION/column01",
  "iterations/feed",
  "economics/summary",
  "0.01/feed",           // a transient instant
  "50/feed",
];

describe("the file pop-out states what may be done with the file", () => {
  it("tells the reader to edit an authored file", () => {
    for (const rel of authored) {
      const html = fileHtml(rel, "T 300;\n");
      expect(html, rel).toContain(AUTHORED_FILE_HINT);
      expect(html, rel).not.toContain(RUN_OUTPUT_HINT);
    }
  });

  it("tells the reader a run output is regenerated whole", () => {
    for (const rel of written) {
      const html = fileHtml(rel, "T 300;\n");
      expect(html, rel).toContain(RUN_OUTPUT_HINT);
      expect(html, rel).not.toContain(AUTHORED_FILE_HINT);
    }
  });

  it("still shows the file's own name and content", () => {
    const html = fileHtml("converged/product", "x <& 1;\n");
    expect(html).toContain("converged/product");
    expect(html).toContain("x &lt;&amp; 1;");     // escaped, not raw
  });
});
