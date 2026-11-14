/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

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
