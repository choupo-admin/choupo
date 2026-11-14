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
  The selection card reads stream.composition.  A feed authored with
  `molarComposition` (or massComposition / molarFlows) must map to it -- else
  the panel shows an EMPTY composition (the freshCO bug, fixed v0.0.132).
\*---------------------------------------------------------------------------*/
import { describe, it, expect } from "vitest";
import { normaliseStreamSpec } from "../src/ui/PropertyPanel.js";

describe("normaliseStreamSpec", () => {
  it("maps molarComposition -> composition (the freshCO feed case)", () => {
    const s = normaliseStreamSpec({ F: 0.0333, T: 298.15, P: 3e6, molarComposition: { CO: 1 } } as never);
    expect(s.composition).toEqual({ CO: 1 });
    expect(s.F).toBeCloseTo(0.0333);
  });
  it("maps massComposition + composition fallbacks", () => {
    expect(normaliseStreamSpec({ massComposition: { water: 0.6, ethanol: 0.4 } } as never).composition)
      .toEqual({ water: 0.6, ethanol: 0.4 });
    expect(normaliseStreamSpec({ composition: { benzene: 1 } } as never).composition)
      .toEqual({ benzene: 1 });
  });
  it("derives F + composition from molarFlows when there is no F", () => {
    const s = normaliseStreamSpec({ T: 350, P: 1e5, molarFlows: { CO: 3, H2: 1 } } as never);
    expect(s.F).toBeCloseTo(4);
    expect(s.composition.CO).toBeCloseTo(0.75);
    expect(s.composition.H2).toBeCloseTo(0.25);
  });
});
