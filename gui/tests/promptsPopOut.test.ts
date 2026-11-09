// The Help menu's prompts pop-out carries EXACTLY the prompts of
// docs/ai/prompts.md (DEV.md 4c C252): the generated module is the home's
// text, and the pop-out's document holds every prompt, escaped, with a copy
// button each.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PROMPTS } from "../src/help/prompts.generated";
import { promptsHtml } from "../src/ui/promptsPopOut";

const HOME = readFileSync(resolve(__dirname, "../../docs/ai/prompts.md"), "utf8");

describe("prompts pop-out", () => {
  it("holds the three prompts of docs/ai/prompts.md, verbatim", () => {
    expect(PROMPTS.sections.map((s) => s.id)).toEqual(["A", "B", "C"]);
    for (const s of PROMPTS.sections) expect(HOME).toContain(s.prompt);
  });

  it("draws each prompt, escaped, with its own copy button", () => {
    const html = promptsHtml();
    for (const s of PROMPTS.sections) {
      expect(html).toContain(`id="prompt${s.id}"`);
      expect(html).toContain(`data-copy="prompt${s.id}"`);
    }
    // the angle brackets of <pack> must not become markup
    expect(html).toContain("llm/packs/&lt;pack&gt;.md");
    expect(html).not.toContain("packs/<pack>");
  });
});
