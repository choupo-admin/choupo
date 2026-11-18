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

/*  K4: the case a student takes away runs alone -- the download of a case that
 *  REFERENCES the catalogue carries the records its manifest pins.  Defect
 *  class: a pinned case holds no copy, so its .zip had left the records behind.
 *  The worker's read of the bundled catalogue is the one part this file cannot
 *  drive (it needs a browser); the contract on each side of it is held here. */
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildCaseZip } from "../src/case/saveCase.js";
import { catalogueNeeds } from "../src/case/carryCatalogue.js";
import type { CaseFiles } from "../src/case/types.js";

const H = "a".repeat(64);
const MANIFEST = `/* header "quoted" ${"b".repeat(64)}; */
propertyManifest
{
    pins
    {
        "components/benzene.dat"  "${H}";
        "components/toluene.dat"  "${H}";
        "chemistry/aceticAcid-dissolution.dat"  "${H}";
        "parameters/Henry/"  "relevant:${H}";
        "components/gone.dat"  "absent";
    }
}
`;

const files = (manifest: string): CaseFiles => ({
  rawFiles: { "system/controlDict": "application choupoSolve;\n", "constant/propertyManifest": manifest },
} as unknown as CaseFiles);

describe("catalogueNeeds", () => {
  it("lists the pinned files, the relevant-set directories and the components", () => {
    const n = catalogueNeeds(files(MANIFEST).rawFiles)!;
    expect(n.paths).toEqual(["components/benzene.dat", "components/toluene.dat",
      "chemistry/aceticAcid-dissolution.dat"]);   // `absent` pins carry nothing
    expect(n.dirs).toEqual(["parameters/Henry/"]);
    expect(n.components).toEqual(["benzene", "toluene"]);
  });
  it("a sealed case already carries its records; one with no manifest needs none", () => {
    expect(catalogueNeeds(files("propertyManifest { sealed true; records { } }").rawFiles)).toBeNull();
    expect(catalogueNeeds({ "system/controlDict": "x" })).toBeNull();
  });
});

describe("buildCaseZip carries the records under <case>/data/standards", () => {
  it("adds them where the engine looks first, and refuses a path that escapes", () => {
    const built = buildCaseZip(files(MANIFEST), "flash01", undefined, null, {
      "components/benzene.dat": "BENZENE",
      "parameters/Henry/benzene-toluene.dat": "PAIR",
      "../escape.dat": "NO",
    })!;
    const z = unzipSync(built.bytes);
    expect(strFromU8(z["flash01/data/standards/components/benzene.dat"]!)).toBe("BENZENE");
    expect(strFromU8(z["flash01/data/standards/parameters/Henry/benzene-toluene.dat"]!)).toBe("PAIR");
    expect(Object.keys(z).some((p) => p.includes("escape"))).toBe(false);
    expect(z["flash01/constant/propertyManifest"]).toBeDefined();
  });
  it("without a catalogue the zip is what it was", () => {
    const z = unzipSync(buildCaseZip(files(MANIFEST), "flash01")!.bytes);
    expect(Object.keys(z).some((p) => p.includes("data/standards"))).toBe(false);
  });
});
