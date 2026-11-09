// The Help menu's prompts pop-out carries EXACTLY the prompt of
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
  it("holds the ONE prompt of docs/ai/prompts.md, verbatim", () => {
    expect(PROMPTS.sections.length).toBe(1);
    for (const s of PROMPTS.sections) expect(HOME).toContain(s.prompt);
  });

  it("draws the prompt, escaped, with its copy button", () => {
    const html = promptsHtml();
    expect(html).toContain('id="prompt"');
    expect(html).toContain('data-copy="prompt"');
    expect(html).toContain("Copy the prompt for your AI");
  });
});
