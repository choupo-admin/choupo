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

/* Choupo -- Copyright (C) Vítor Geraldes and the Choupo contributors; GPL-3.0-or-later.
 * C535 S5: the family data, its URL door and its row.  Defect caught: a tool in
 * two families, a chapter naming a dead tool, a door that opens nothing. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { PathBar } from "../src/ui/methods/PathBar.js";
import {
  METHOD_FAMILIES, METHOD_TOOLS, bootTool, familyOf, goToEduToolsHome,
  setActiveMethodTool,
} from "../src/ui/methods/registry.js";

describe("method families", () => {
  it("a tool sits in at most one family, and every member is a live tool", () => {
    const seen = new Set<string>();
    for (const f of METHOD_FAMILIES) for (const s of f.steps) {
      expect(seen.has(s.tool)).toBe(false);
      seen.add(s.tool);
      expect(METHOD_TOOLS.find((m) => m.id === s.tool)?.status).toBe("live");
    }
  });
  it("familyOf answers", () => {
    expect(familyOf("why-did-it-not-dry")?.id).toBe("drying");
    expect(familyOf("mccabe")).toBeNull();
  });
  it("the family URL opens the first chapter", () => {
    const g = globalThis as { window?: unknown };
    const saved = g.window;
    g.window = { location: { search: "?workspace=methods&family=drying" } };
    try { expect(bootTool()).toBe("psychro"); } finally { g.window = saved; }
  });
  it("the row shows the four labels with the open one current", () => {
    setActiveMethodTool("why-did-it-not-dry");
    const h = renderToStaticMarkup(createElement(MantineProvider, null, createElement(PathBar)));
    for (const l of ["Choose", "Curve", "Diagnose", "Chart"]) expect(h).toContain(l);
    expect(h.match(/aria-current="page"/g)?.length).toBe(1);
    expect(h).toMatch(/data-family-chapter="why-did-it-not-dry"[^>]*aria-current="page"|aria-current="page"[^>]*data-family-chapter="why-did-it-not-dry"/);
    goToEduToolsHome();
  });
});
