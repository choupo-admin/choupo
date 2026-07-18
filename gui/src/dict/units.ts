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
  Choupo GUI -- named-unit catalogue (TS mirror of src/core/Units.cpp)

  Only the bits the GUI's dict parser needs:
    - `lookupUnit(suffix)` returns the multiplicative factor to convert
      the value to canonical SI, plus an `affine` flag for the temperature
      scales that need a translation rather than a scaling.
    - `affineToK(value, suffix)` for degC / degF.

  The simulator's WASM owns the full dimensions table; the GUI only
  needs the conversion factor to display values consistently.  Keep
  this table aligned with the C++ source.
\*---------------------------------------------------------------------------*/

export interface UnitSpec {
  factor: number;
  affine: boolean;
}

// Mirror of the table in src/core/Units.cpp.  When you add a unit
// there, drop it here too so the GUI parser can ingest the same
// tutorials.  Most aliases are pure multiplicative factors to SI;
// degC / C / Celsius / degF / F / Fahrenheit set `affine: true` and
// route through `affineToK`.
const TABLE: Record<string, UnitSpec> = {
  // pressure → Pa
  Pa: { factor: 1.0, affine: false },
  kPa: { factor: 1.0e3, affine: false },
  MPa: { factor: 1.0e6, affine: false },
  bar: { factor: 1.0e5, affine: false },
  atm: { factor: 101325.0, affine: false },
  psi: { factor: 6894.757, affine: false },
  mmHg: { factor: 133.322, affine: false },
  torr: { factor: 133.322, affine: false },

  // molar flow → kmol/s
  "kmol/s": { factor: 1.0, affine: false },
  "kmol/h": { factor: 1.0 / 3600.0, affine: false },
  "mol/s": { factor: 1.0e-3, affine: false },
  "mol/h": { factor: 1.0e-3 / 3600.0, affine: false },

  // mass flow → kg/s
  "kg/s": { factor: 1.0, affine: false },
  "kg/h": { factor: 1.0 / 3600.0, affine: false },
  "g/s": { factor: 1.0e-3, affine: false },
  "g/h": { factor: 1.0e-3 / 3600.0, affine: false },
  "t/h": { factor: 1000.0 / 3600.0, affine: false },

  // volumetric flow → m³/s
  "m3/s": { factor: 1.0, affine: false },
  "m3/h": { factor: 1.0 / 3600.0, affine: false },
  "L/s": { factor: 1.0e-3, affine: false },
  "L/h": { factor: 1.0e-3 / 3600.0, affine: false },
  "L/min": { factor: 1.0e-3 / 60.0, affine: false },

  // time → s
  s: { factor: 1.0, affine: false },
  sec: { factor: 1.0, affine: false },
  min: { factor: 60.0, affine: false },
  h: { factor: 3600.0, affine: false },
  hr: { factor: 3600.0, affine: false },
  day: { factor: 86400.0, affine: false },

  // length → m
  m: { factor: 1.0, affine: false },
  mm: { factor: 1.0e-3, affine: false },
  cm: { factor: 1.0e-2, affine: false },
  km: { factor: 1.0e3, affine: false },
  in: { factor: 0.0254, affine: false },
  inch: { factor: 0.0254, affine: false },
  ft: { factor: 0.3048, affine: false },

  // area → m²
  m2: { factor: 1.0, affine: false },
  "m^2": { factor: 1.0, affine: false },
  cm2: { factor: 1.0e-4, affine: false },
  mm2: { factor: 1.0e-6, affine: false },

  // volume → m³
  m3: { factor: 1.0, affine: false },
  "m^3": { factor: 1.0, affine: false },
  L: { factor: 1.0e-3, affine: false },
  l: { factor: 1.0e-3, affine: false },
  mL: { factor: 1.0e-6, affine: false },
  ml: { factor: 1.0e-6, affine: false },

  // mass → kg
  kg: { factor: 1.0, affine: false },
  g: { factor: 1.0e-3, affine: false },
  t: { factor: 1.0e3, affine: false },
  ton: { factor: 1.0e3, affine: false },
  tonne: { factor: 1.0e3, affine: false },

  // temperature
  K: { factor: 1.0, affine: false },
  degC: { factor: 1.0, affine: true },
  C: { factor: 1.0, affine: true },
  Celsius: { factor: 1.0, affine: true },
  degF: { factor: 1.0, affine: true },
  F: { factor: 1.0, affine: true },
  Fahrenheit: { factor: 1.0, affine: true },

  // velocity → m/s
  "m/s": { factor: 1.0, affine: false },
  "cm/s": { factor: 1.0e-2, affine: false },
  "mm/s": { factor: 1.0e-3, affine: false },

  // concentration → kmol/m³
  "kmol/m3": { factor: 1.0, affine: false },
  "mol/m3": { factor: 1.0e-3, affine: false },
  "mol/L": { factor: 1.0, affine: false },
  "mmol/L": { factor: 1.0e-3, affine: false },
  M: { factor: 1.0, affine: false },
  // eq = mole of charge; numerically a mole, so eq/L reads as a
  // concentration (the volumetric basis an ion-exchange CEC is quoted in)
  "eq/L": { factor: 1.0, affine: false },
  "meq/L": { factor: 1.0e-3, affine: false },

  // molality → kmol/kg (solvent) -- water analyses / electrolyte totals
  "mol/kg": { factor: 1.0e-3, affine: false },
  "mmol/kg": { factor: 1.0e-6, affine: false },
  // exchange capacity per mass (eq = mole of charge; eq/kg = mol/kg)
  "eq/kg": { factor: 1.0e-3, affine: false },
  "meq/kg": { factor: 1.0e-6, affine: false },

  // specific volume → m³/kg (a resin dose: bed litres per kg of water)
  "m3/kg": { factor: 1.0, affine: false },
  "L/kg": { factor: 1.0e-3, affine: false },
  "mL/g": { factor: 1.0e-3, affine: false },

  // density / mass concentration → kg/m³
  // (`ppm` is the w/v water-analysis convention: 1 ppm = 1 mg/L)
  "kg/m3": { factor: 1.0, affine: false },
  "g/cm3": { factor: 1.0e3, affine: false },
  "g/mL": { factor: 1.0e3, affine: false },
  "mg/L": { factor: 1.0e-3, affine: false },
  "g/L": { factor: 1.0, affine: false },
  ppm: { factor: 1.0e-3, affine: false },

  // energy + power
  J: { factor: 1.0, affine: false },
  kJ: { factor: 1.0e3, affine: false },
  MJ: { factor: 1.0e6, affine: false },
  W: { factor: 1.0, affine: false },
  kW: { factor: 1.0e3, affine: false },
  MW_power: { factor: 1.0e6, affine: false },

  // molar energy → J/mol  (Choupo's canonical molar enthalpy / Gibbs unit;
  // mirrors src/core/Units.cpp -- e.g. `dH_rxn -60 kJ/mol`)
  "J/mol": { factor: 1.0, affine: false },
  "kJ/mol": { factor: 1.0e3, affine: false },
  "J/kmol": { factor: 1.0e-3, affine: false },
  "kJ/kmol": { factor: 1.0, affine: false },

  // molar heat capacity → J/(mol.K)  (mirrors src/core/Units.cpp)
  "J/(mol.K)": { factor: 1.0, affine: false },
  "J/(kmol.K)": { factor: 1.0e-3, affine: false },
  "kJ/(kmol.K)": { factor: 1.0, affine: false },

  // amount → kmol
  mol: { factor: 1.0e-3, affine: false },
  kmol: { factor: 1.0, affine: false },

  // viscosity → Pa·s
  "Pa.s": { factor: 1.0, affine: false },
  cP: { factor: 1.0e-3, affine: false },

  // overall heat-transfer coefficient → W/(m²·K)
  "W/(m^2.K)":  { factor: 1.0,    affine: false },
  "W/(m2.K)":   { factor: 1.0,    affine: false },
  "W/m^2/K":    { factor: 1.0,    affine: false },
  "W/m2/K":     { factor: 1.0,    affine: false },
  "kW/(m^2.K)": { factor: 1.0e3,  affine: false },
  "kW/(m2.K)":  { factor: 1.0e3,  affine: false },

  // molar mass → kg/kmol
  "kg/kmol": { factor: 1.0, affine: false },
  "g/mol": { factor: 1.0, affine: false },

  // membrane permeability  m/(s·Pa) and m/(s·bar)
  "m/s/Pa": { factor: 1.0, affine: false },
  "m/s/bar": { factor: 1.0e-5, affine: false },

  // dimensionless / percent
  "-": { factor: 1.0, affine: false },
  "%": { factor: 1.0e-2, affine: false },
  // mass ratio (e.g. dry resin per kg water)
  "kg/kg": { factor: 1.0, affine: false },
};

export function lookupUnit(suffix: string): UnitSpec | null {
  return Object.prototype.hasOwnProperty.call(TABLE, suffix)
    ? TABLE[suffix] ?? null
  : null;
}

export function isKnownUnit(suffix: string): boolean {
  return lookupUnit(suffix) !== null;
}

export function affineToK(value: number, suffix: string): number {
  if (suffix === "C" || suffix === "degC" || suffix === "Celsius") {
    return value + 273.15;
  }
  if (suffix === "F" || suffix === "degF" || suffix === "Fahrenheit") {
    return (value - 32.0) * (5.0 / 9.0) + 273.15;
  }
  throw new Error(
    `affineToK: '${suffix}' is not an affine temperature unit`,
  );
}
