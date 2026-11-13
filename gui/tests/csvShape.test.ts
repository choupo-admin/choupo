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

import { describe, expect, it } from "vitest";

import { detectCategoricalCsv, hasSiColumns } from "../src/ui/plotting/csvShape.js";
import {
  DEFAULT_PREFS,
  effectiveConcentrationUnit,
  molalToDisplay,
} from "../src/state/displayUnits.js";

// The speciate ops emit species tables (categorical first column); the
// scalingScan op emits a numeric recovery sweep.  Shapes copied from
// tutorials/props/electrolyte/scaling_ro_brackish.
const SPECIATE = [
  "species,molality,activity,gamma",
  "Ca,1.92208549e-03,1.04202255e-03,5.42131219e-01",
  "Cl,1.23999999e-02,1.06401509e-02,8.58076690e-01",
  "CaSO4aq,3.89409503e-03,3.89409503e-03,1.00000000e+00",
].join("\n");

const SCALING = [
  "recovery,I,SI_calcite,SI_gypsum",
  "0.00,2.56444993e-02,3.27846477e-01,-1.37241132e+00",
  "0.05,2.69543807e-02,3.64712385e-01,-1.34169522e+00",
].join("\n");

describe("csvShape — categorical (species-table) detection", () => {
  it("detects the speciate shape: non-numeric first column, numeric values", () => {
    const cat = detectCategoricalCsv(SPECIATE);
    expect(cat).not.toBeNull();
    expect(cat!.xName).toBe("species");
    expect(cat!.labels).toEqual(["Ca", "Cl", "CaSO4aq"]);
    expect(cat!.valueCols.map((c) => c.name)).toEqual(["molality", "activity", "gamma"]);
    expect(cat!.valueCols[0]!.values[1]).toBeCloseTo(1.24e-2, 6);
  });

  it("a numeric scan is NOT categorical", () => {
    expect(detectCategoricalCsv(SCALING)).toBeNull();
  });

  it("one numeric first-column cell disqualifies (a scan with a bad row keeps the line plot)", () => {
    expect(detectCategoricalCsv("species,molality\nCa,1e-3\n42,2e-3")).toBeNull();
  });

  it("needs at least one numeric value column to plot", () => {
    expect(detectCategoricalCsv("species,note\nCa,low\nCl,high")).toBeNull();
  });
});

describe("csvShape — SI = 0 saturation-line trigger", () => {
  it("fires when SI_* value columns are plotted (scalingScan)", () => {
    expect(hasSiColumns(["recovery", "I", "SI_calcite", "SI_gypsum"])).toBe(true);
  });

  it("fires on methodCompare-merged SI columns (SI_<mineral>__<model>)", () => {
    expect(hasSiColumns(["recovery", "SI_calcite__Pitzer"])).toBe(true);
  });

  it("stays off without SI columns, and never keys on the x column", () => {
    expect(hasSiColumns(["T", "Psat_water"])).toBe(false);
    expect(hasSiColumns(["SI_calcite"])).toBe(false);
  });
});

describe("displayUnits — concentration preference", () => {
  it("defaults to canonical mol/kg", () => {
    expect(DEFAULT_PREFS.concentration).toBe("mol/kg");
  });

  it("mol/kg <-> mmol/kg is exact, no molar mass needed", () => {
    expect(molalToDisplay(1.922e-3, "mol/kg")).toBeCloseTo(1.922e-3, 9);
    expect(molalToDisplay(1.922e-3, "mmol/kg")).toBeCloseTo(1.922, 6);
  });

  it("mg/L needs a molar mass: NaN without one (never invented), exact with one", () => {
    expect(Number.isNaN(molalToDisplay(1e-3, "mg/L"))).toBe(true);
    // Ca (40.078 g/mol): 1 mmol/kg ≈ 40.078 mg/L at rho ~ 1 kg/L
    expect(molalToDisplay(1e-3, "mg/L", 40.078)).toBeCloseTo(40.078, 6);
  });

  it("the effective unit falls back to mol/kg when no molar-mass map exists", () => {
    expect(effectiveConcentrationUnit("mg/L", false)).toBe("mol/kg");
    expect(effectiveConcentrationUnit("mg/L", true)).toBe("mg/L");
    expect(effectiveConcentrationUnit("mmol/kg", false)).toBe("mmol/kg");
  });
});
