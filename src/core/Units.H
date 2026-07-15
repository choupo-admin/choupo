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
-------------------------------------------------------------------------------
File
    Units.H

Description
    Choupo uses SI units canonically inside the simulator.  This
    header documents the canonical units and provides named
    conversion factors for user-facing input/output where industrial
    or pedagogical convenience demands a non-SI unit (e.g. bar for
    pressure, kmol/h for flow).

    Canonical units:

        Quantity              Symbol      SI unit
        ---------------------------------------------
        time                  t           s
        length                L           m
        mass                  m           kg
        amount of substance   n           kmol     (*)
        temperature           T           K
        molar flow            F           kmol/s
        concentration         c           kmol/m³
        pressure              P           Pa
        energy                E, H        J
        molar energy          h, ΔH       J/mol     (= J/kmol numerically × 1e-3)
        molar heat capacity   Cp          J/(mol·K)
        molar mass            MW          kg/kmol   (= g/mol numerically)
        viscosity             μ           Pa·s
        thermal conductivity  k           W/(m·K)
        diffusivity           D           m²/s

    (*) We keep `kmol` rather than `mol` as the canonical amount unit
        because chem-eng practice gives manageable numbers (e.g. water
        at 1000 kg/m³ → 55.5 kmol/m³, not 55500 mol/m³).  The SI
        purist alternative would be `mol`, which would multiply every
        MW value in `data/standards/components/` by 1000.  Since
        kg/kmol is numerically identical to g/mol, the kmol convention
        keeps the database literature-friendly.

    Conversion factors below are named `<unit>_to_<canonical>` so the
    code reads naturally:

        Pa = lookupPressure(dict, "P");                   // already SI
        Pa = dict->lookupScalar("P") * units::bar_to_Pa;  // explicit
\*---------------------------------------------------------------------------*/

#pragma once

#include "Dimensions.H"
#include "Types.H"

#include <optional>
#include <string>

namespace Choupo::units {

// =====================================================================
//  UnitSpec  --  a named unit's factor-to-SI plus its physical dims.
//
//  Multiplicative units (almost all of them: bar, kmol/h, m, kg, etc.)
//  set `affine = false` and use `factor` to convert to canonical SI.
//  Affine units (°C, °F) set `affine = true` and store the dimensions
//  of the canonical SI target (always Dims::temperature for now);
//  `factor` is unused for those — the caller routes through
//  `affineToK()`.
// =====================================================================
struct UnitSpec
{
    scalar     factor = 1.0;
    Dimensions dims;
    bool       affine = false;
};

// Returns the UnitSpec for a known unit alias (e.g. "bar", "kmol/h",
// "degC"), or nullopt if the suffix is not recognised.  This is the
// single source of truth for unit names + their dimensions.
std::optional<UnitSpec> lookupUnit(const std::string& suffix);

// =====================================================================
//  Pressure  (canonical: Pa)
// =====================================================================
constexpr scalar Pa_to_Pa     = 1.0;
constexpr scalar bar_to_Pa    = 1.0e5;
constexpr scalar kPa_to_Pa    = 1.0e3;
constexpr scalar MPa_to_Pa    = 1.0e6;
constexpr scalar atm_to_Pa    = 101325.0;
constexpr scalar psi_to_Pa    = 6894.757;
constexpr scalar mmHg_to_Pa   = 133.322;
constexpr scalar torr_to_Pa   = 133.322;   // synonym for mmHg

// =====================================================================
//  Molar flow  (canonical: kmol/s)
// =====================================================================
constexpr scalar kmol_per_s_to_kmol_per_s  = 1.0;
constexpr scalar kmol_per_h_to_kmol_per_s  = 1.0 / 3600.0;
constexpr scalar mol_per_s_to_kmol_per_s   = 1.0e-3;
constexpr scalar mol_per_h_to_kmol_per_s   = 1.0e-3 / 3600.0;

// =====================================================================
//  Time  (canonical: s)
// =====================================================================
constexpr scalar s_to_s       = 1.0;
constexpr scalar min_to_s     = 60.0;
constexpr scalar h_to_s       = 3600.0;
constexpr scalar day_to_s     = 86400.0;

// =====================================================================
//  Temperature  (canonical: K)
//
//  The other temperature scales are affine, not multiplicative, so
//  the API is via the named functions below rather than a factor.
// =====================================================================
inline scalar celsius_to_K(scalar t_C)    { return t_C + 273.15; }
inline scalar K_to_celsius(scalar T_K)    { return T_K - 273.15; }
inline scalar fahrenheit_to_K(scalar t_F) { return (t_F - 32.0) * 5.0 / 9.0 + 273.15; }
inline scalar K_to_fahrenheit(scalar T_K) { return (T_K - 273.15) * 9.0 / 5.0 + 32.0; }

// =====================================================================
//  Length  (canonical: m)
// =====================================================================
constexpr scalar m_to_m       = 1.0;
constexpr scalar mm_to_m      = 1.0e-3;
constexpr scalar cm_to_m      = 1.0e-2;
constexpr scalar km_to_m      = 1.0e3;
constexpr scalar inch_to_m    = 0.0254;
constexpr scalar ft_to_m      = 0.3048;

// =====================================================================
//  Volume  (canonical: m³)
// =====================================================================
constexpr scalar m3_to_m3     = 1.0;
constexpr scalar L_to_m3      = 1.0e-3;
constexpr scalar mL_to_m3     = 1.0e-6;

// =====================================================================
//  Mass  (canonical: kg)
// =====================================================================
constexpr scalar kg_to_kg     = 1.0;
constexpr scalar g_to_kg      = 1.0e-3;
constexpr scalar t_to_kg      = 1.0e3;     // metric tonne

// =====================================================================
//  Suffix lookup
//
//  Given a unit name like "bar", "kmol/h", "atm", "h", "L", "kg",
//  return the multiplicative factor needed to convert to the
//  canonical SI unit of the relevant quantity.  Returns NaN if the
//  suffix is unrecognised (the parser then throws with a clear
//  message including the suffix string).
//
//  Quantities supported: pressure, molar-flow, time, length, volume,
//  mass, energy.  Temperature is special (affine) --- the parser
//  calls celsius_to_K / fahrenheit_to_K directly.
//
//  This function is the bridge between the dict parser
//  (`Dictionary::lookupScalarWithUnit`) and the canonical math
//  everywhere else.  Add a new alias here in one place and the whole
//  codebase picks it up automatically.
// =====================================================================
// Convert an affine temperature unit value to K.  Throws if `suffix`
// is not "degC" / "C" / "Celsius" / "degF" / "F" / "Fahrenheit".
scalar affineToK(scalar value, const std::string& suffix);

} // namespace Choupo::units
