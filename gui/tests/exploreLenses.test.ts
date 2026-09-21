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
  exploreLenses — every lens has a WORD, an entry, and a sane lens to open on.

  WHY THIS GATE EXISTS (2026-09-21).  `PLOT_KINDS` (pure, walkable by a test)
  and its two label tables (150 lines into a 2300-line React component) were
  two homes for one list.  So a kind could join the union, be gated correctly
  by `viewsFor`, and still arrive on the strip with no word of its own — which
  is precisely the shape `yx` had: it was not even in the union, it was a
  sub-mode of a SegmentedControl drawn inside the plot.

  The cover arms below are the point: they are written over PLOT_KINDS, so the
  day a kind is added and forgotten, a test fails rather than a reader
  squinting at a strip.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import { PLOT_KINDS, viewsFor } from "../src/case/exploreViews.js";
import { LENS_SHORT, PLOT_TYPES, defaultLensFor } from "../src/case/exploreLenses.js";

const NO_LOCAL = buildLocalUnifac({});
const boots = (sel: string[]) => defaultLensFor(sel, CATALOGUE, NO_LOCAL);

describe("the lens catalogue covers the kind space, both ways", () => {
  it("every PlotKind has a toolbar word and a PLOT_TYPES entry", () => {
    for (const k of PLOT_KINDS) {
      expect(LENS_SHORT[k], `plot kind "${k}" has no toolbar word`).toBeTruthy();
      expect(PLOT_TYPES.find((p) => p.id === k),
        `plot kind "${k}" has no PLOT_TYPES entry, so the strip cannot render it`)
        .toBeTruthy();
    }
  });

  it("nothing is labelled that is no longer a kind", () => {
    for (const k of Object.keys(LENS_SHORT))
      expect((PLOT_KINDS as readonly string[]).includes(k),
        `LENS_SHORT names "${k}", which is not a PlotKind`).toBe(true);
    for (const p of PLOT_TYPES)
      expect((PLOT_KINDS as readonly string[]).includes(p.id),
        `PLOT_TYPES names "${p.id}", which is not a PlotKind`).toBe(true);
  });

  it("each word is distinct — a strip with two identical buttons names nothing", () => {
    const words = PLOT_KINDS.map((k) => LENS_SHORT[k]);
    expect(new Set(words).size).toBe(words.length);
  });

  it("the equilibrium curve is named for the diagram, not for its symbol", () => {
    //  `y-x` beside `T-x-y` reads as the same family of axis pair.  And it must
    //  NOT be a lone glyph: `activity γ` carries a WORD for exactly the reason
    //  commit 377618c16 recorded — in this face a lowercase gamma and a
    //  lowercase y are the same glyph, and that button used to stand alone.
    expect(LENS_SHORT.yx).toBe("y-x");
    expect(LENS_SHORT.gamma).toMatch(/activity/);
  });
});

describe("defaultLensFor — what a selection OPENS on", () => {
  it("water + a salt opens on the scaling audit, not on a refused Psat scan", () => {
    //  THE DEFECT: the scan's own boot property is Psat, a salt has none, and
    //  a props run whose only question is refused fails AS A WHOLE — so
    //  `?workspace=properties&components=water,NaCl` opened on a red banner
    //  with nothing drawn, before the student had touched anything.
    expect(boots(["water", "NaCl"])).toBe("scaling");
    expect(boots(["water", "CaCl2"])).toBe("scaling");
    //  MEASURED, not assumed: `CaSO4` does NOT classify as an electrolyte in
    //  today's catalogue (its record declares neither an `electrolyte {}`
    //  block nor a dissociation), so water + CaSO4 is not an aqueous
    //  electrolyte here and opens on the scan.  Its Psat curve is still not
    //  asked for — that is scanProperties' half of D1, and the two halves
    //  cover the landing between them.
    expect(boots(["water", "CaSO4"])).toBe("scan");
  });

  it("everything else opens on the property scan", () => {
    expect(boots(["benzene"])).toBe("scan");
    expect(boots(["benzene", "toluene"])).toBe("scan");
    expect(boots(["water"])).toBe("scan");
    expect(boots(["water", "ethanol", "benzene"])).toBe("scan");
    expect(boots([])).toBe("scan");
  });

  it("only ever names a lens the strip actually offers", () => {
    for (const sel of [[], ["water"], ["water", "NaCl"], ["benzene", "toluene"],
                       ["N2", "H2", "NH3"], ["water", "ethanol", "benzene"]]) {
      const k = boots(sel);
      if (sel.length === 0) { expect(k).toBe("scan"); continue; }
      expect(viewsFor(sel, CATALOGUE, NO_LOCAL).has(k),
        `defaultLensFor(${sel.join("+")}) = "${k}", which viewsFor does not offer`)
        .toBe(true);
    }
  });
});
