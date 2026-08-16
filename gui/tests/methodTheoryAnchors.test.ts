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

/*---------------------------------------------------------------------------*\
  methodTheoryAnchors — the EduTools registry's Theory Guide links.

  WHY THIS FILE EXISTS (2026-08-16).  helpIndex.test.ts already checks every
  anchor in docs/help-index.json against the guides' `\label{...}` — but the
  method tools do NOT go through that index: each carries its own `theory`
  destination in the registry, and nothing checked those.  So
  `sec:mccabe-tray-efficiency` shipped on the DEFAULT tool, naming a section
  that has never existed in any build of the Theory Guide.

  A DEAD NAMED DESTINATION FAILS SILENTLY.  The viewer opens the PDF at page 1
  and says nothing — no error, no 404, no console line the student would see.
  That is exactly the failure this gate has to be loud about, because the
  symptom ("the Help link doesn't jump") is indistinguishable from a stale PDF,
  a wrong base URL, or a viewer that ignores the fragment.

  What this gate does NOT cover, stated rather than implied:
    * it reads the .tex SOURCE, not the built PDF — so it cannot see a guide
      that has not been rebuilt since a label was added;
    * it cannot see whether gui/public/docs/theoryGuide.pdf (a gitignored copy
      that bin/runGui syncs on launch) is current.  A fresh anchor behind a
      stale copy still lands on page 1, and no test in this suite can tell.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  METHOD_TOOLS, bootTool, theoryUrl, type MethodTool,
} from "../src/ui/methods/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const THEORY_TEX = resolve(here, "../../docs/theoryGuide.tex");
const tex: string | null =
  existsSync(THEORY_TEX) ? readFileSync(THEORY_TEX, "utf8") : null;

const labelExists = (anchor: string): boolean =>
  new RegExp(`\\\\label\\{${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`)
    .test(tex ?? "");

describe("EduTools registry — shape", () => {
  it("is non-empty and every id is unique", () => {
    expect(METHOD_TOOLS.length).toBeGreaterThan(5);
    const ids = METHOD_TOOLS.map((m: MethodTool) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry carries a label and a one-line 'teaches'", () => {
    for (const m of METHOD_TOOLS) {
      expect(m.label.trim().length, `${m.id} needs a label`).toBeGreaterThan(0);
      expect(m.teaches.trim().length, `${m.id} needs a teaches line`).toBeGreaterThan(0);
    }
  });

  it("a planned entry names the engine output that will feed it", () => {
    for (const m of METHOD_TOOLS.filter((t) => t.status === "planned")) {
      expect(m.fedBy, `planned tool ${m.id} must state its engine feed`).toBeTruthy();
    }
  });

  it("the boot default is a LIVE tool", () => {
    const boot = bootTool();
    const m = METHOD_TOOLS.find((t) => t.id === boot);
    expect(m, `bootTool() returned an unknown id: ${boot}`).toBeTruthy();
    expect(m!.status).toBe("live");
  });
});

describe("EduTools registry — the Theory Guide deep link", () => {
  it("is BASE-AWARE (never a hardcoded leading slash)", () => {
    const url = theoryUrl("ch:flash");
    // The base is whatever Vite injected; what must hold is that the path is
    // built ON it and carries the named destination.
    expect(url.endsWith("docs/theoryGuide.pdf#nameddest=ch:flash")).toBe(true);
    expect(url.startsWith(import.meta.env.BASE_URL)).toBe(true);
  });

  it("every LIVE tool declares a theory destination", () => {
    for (const m of METHOD_TOOLS.filter((t) => t.status === "live")) {
      expect(m.theory, `live tool ${m.id} must name a Theory Guide section`).toBeTruthy();
    }
  });

  // One case per tool, so a failure names the tool AND the dead anchor.
  for (const m of METHOD_TOOLS) {
    if (!m.theory) continue;
    it(`${m.id} -> \\label{${m.theory}} exists in theoryGuide.tex`, () => {
      if (tex == null) {
        // The .tex is tracked; its absence means a broken checkout, not a
        // condition to wave through.  "A check that cannot run must not pass."
        throw new Error(`docs/theoryGuide.tex not found at ${THEORY_TEX}`);
      }
      expect(
        labelExists(m.theory!),
        `${m.id} points at #nameddest=${m.theory}, which theoryGuide.tex does not `
        + "define — the viewer will open the PDF at page 1 and say nothing",
      ).toBe(true);
    });
  }
});
