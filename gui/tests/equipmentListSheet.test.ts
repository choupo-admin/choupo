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
  The printable equipment list (slice S1 of the plant document set).

  A pure builder: it lays out the rows the ENGINE built and computes nothing.
  What is held here: one table row per engine row, the tag printed as given
  (a declared one marked), the title naming the case and the engine version,
  the A3 `@page` rule and the print button, a dash for a value the item does
  not have, and HTML escaping of every word.  NOT CHECKED: how a browser
  prints it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { equipmentListHtml } from "../src/case/equipmentListSheet.js";
import type { EquipmentListRow } from "../src/adapters/SolverAdapter.js";

const row = (o: Partial<EquipmentListRow>): EquipmentListRow => ({
  tag: "P-101A", itemId: "HPpump/train1", unit: "HPpump", sector: "",
  equipment: "ratedMachine", installed: 2, sizeKey: "utilisation",
  sizeValue: 0.51, sizeUnit: "-", dimensions: "", pressureDesign: null,
  pressureUnit: "", material: "SS316", currency: "", purchased: null,
  bareModule: null, totalModule: null, costNote: "not costed: quoted",
  tagBy: "generated", ...o,
});

describe("equipmentListHtml", () => {
  const rows = [
    row({}),
    row({ tag: "V-900", itemId: "drum", unit: "drum", equipment: "vessel",
          tagBy: "declared", pressureDesign: 3, pressureUnit: "bar",
          dimensions: "D 1.2 m; H 3.4 m", currency: "EUR_2026",
          purchased: 12345.6, bareModule: 40000.2, totalModule: 47000,
          costNote: "priced by log-quadratic" }),
    row({ tag: "E-<1>", itemId: "x&y", unit: "x&y" }),
  ];
  const html = equipmentListHtml(rows, "myCase", "Choupo-dev · abc123");

  it("has one body row per engine row and prints the tags", () => {
    expect((html.match(/<tr><td class="tag/g) ?? []).length).toBe(3);
    expect(html).toContain("P-101A");
    expect(html).toContain("V-900");
  });
  it("marks a declared tag and titles the page with case and version", () => {
    expect(html).toContain('class="tag decl">V-900');
    expect(html).toContain("<title>Equipment list — myCase</title>");
    expect(html).toContain("Choupo-dev · abc123");
  });
  it("prints for print: A3 landscape, a print button, nothing recomputed", () => {
    expect(html).toContain("@page{size:A3 landscape");
    expect(html).toContain("window.print()");
    expect(html).not.toContain("TOTAL");
  });
  it("draws a dash where the item has no value, and escapes words", () => {
    expect(html).toContain("—");
    expect(html).toContain("E-&lt;1&gt;");
    expect(html).toContain("x&amp;y");
    expect(html).not.toContain("E-<1>");
  });
  it("says so when the engine version was not read", () => {
    expect(equipmentListHtml(rows, "c", null)).toContain("engine version not read");
  });
});
