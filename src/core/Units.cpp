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

#include "Units.H"

#include <cmath>
#include <map>
#include <stdexcept>

namespace Choupo::units {

namespace {

// =====================================================================
//  Single source of truth: every alias the parser may see, mapped to
//  its UnitSpec (factor + dimensions, plus an affine flag for the
//  temperature scales that need a translation rather than a scaling).
//
//  Grouped by quantity for readability.  When you add a new alias,
//  drop it here and the parser picks it up automatically.
// =====================================================================
const std::map<std::string, UnitSpec>& table()
{
    static const std::map<std::string, UnitSpec> t = {
        // ----- pressure → Pa --------------------------------------------
        { "Pa",      UnitSpec{ Pa_to_Pa,    Dims::pressure } },
        { "kPa",     UnitSpec{ kPa_to_Pa,   Dims::pressure } },
        { "MPa",     UnitSpec{ MPa_to_Pa,   Dims::pressure } },
        { "bar",     UnitSpec{ bar_to_Pa,   Dims::pressure } },
        { "atm",     UnitSpec{ atm_to_Pa,   Dims::pressure } },
        { "psi",     UnitSpec{ psi_to_Pa,   Dims::pressure } },
        { "mmHg",    UnitSpec{ mmHg_to_Pa,  Dims::pressure } },
        { "torr",    UnitSpec{ torr_to_Pa,  Dims::pressure } },

        // ----- molar flow → kmol/s --------------------------------------
        { "kmol/s",  UnitSpec{ kmol_per_s_to_kmol_per_s, Dims::molarFlow } },
        { "kmol/h",  UnitSpec{ kmol_per_h_to_kmol_per_s, Dims::molarFlow } },
        { "mol/s",   UnitSpec{ mol_per_s_to_kmol_per_s,  Dims::molarFlow } },
        { "mol/h",   UnitSpec{ mol_per_h_to_kmol_per_s,  Dims::molarFlow } },

        // ----- mass flow → kg/s -----------------------------------------
        { "kg/s",    UnitSpec{ 1.0,         Dims::massFlow } },
        { "kg/h",    UnitSpec{ 1.0/3600.0,  Dims::massFlow } },
        { "g/s",     UnitSpec{ 1.0e-3,      Dims::massFlow } },
        { "g/h",     UnitSpec{ 1.0e-3/3600.0, Dims::massFlow } },
        { "t/h",     UnitSpec{ 1000.0/3600.0, Dims::massFlow } },

        // ----- volumetric flow → m³/s -----------------------------------
        { "m3/s",    UnitSpec{ 1.0,         Dims::volumetricFlow } },
        { "m3/h",    UnitSpec{ 1.0/3600.0,  Dims::volumetricFlow } },
        { "L/s",     UnitSpec{ 1.0e-3,      Dims::volumetricFlow } },
        { "L/h",     UnitSpec{ 1.0e-3/3600.0, Dims::volumetricFlow } },
        { "L/min",   UnitSpec{ 1.0e-3/60.0, Dims::volumetricFlow } },

        // ----- time → s -------------------------------------------------
        { "s",       UnitSpec{ s_to_s,      Dims::time } },
        { "sec",     UnitSpec{ s_to_s,      Dims::time } },
        { "min",     UnitSpec{ min_to_s,    Dims::time } },
        { "h",       UnitSpec{ h_to_s,      Dims::time } },
        { "hr",      UnitSpec{ h_to_s,      Dims::time } },
        { "day",     UnitSpec{ day_to_s,    Dims::time } },

        // ----- length → m -----------------------------------------------
        { "m",       UnitSpec{ m_to_m,      Dims::length } },
        { "mm",      UnitSpec{ mm_to_m,     Dims::length } },
        { "cm",      UnitSpec{ cm_to_m,     Dims::length } },
        { "km",      UnitSpec{ km_to_m,     Dims::length } },
        { "in",      UnitSpec{ inch_to_m,   Dims::length } },
        { "inch",    UnitSpec{ inch_to_m,   Dims::length } },
        { "ft",      UnitSpec{ ft_to_m,     Dims::length } },

        // ----- area → m² ------------------------------------------------
        { "m2",      UnitSpec{ 1.0,         Dims::area } },
        { "m^2",     UnitSpec{ 1.0,         Dims::area } },
        { "cm2",     UnitSpec{ 1.0e-4,      Dims::area } },
        { "mm2",     UnitSpec{ 1.0e-6,      Dims::area } },

        // ----- volume → m³ ----------------------------------------------
        { "m3",      UnitSpec{ m3_to_m3,    Dims::volume } },
        { "m^3",     UnitSpec{ m3_to_m3,    Dims::volume } },
        { "L",       UnitSpec{ L_to_m3,     Dims::volume } },
        { "l",       UnitSpec{ L_to_m3,     Dims::volume } },
        { "mL",      UnitSpec{ mL_to_m3,    Dims::volume } },
        { "ml",      UnitSpec{ mL_to_m3,    Dims::volume } },

        // ----- mass → kg ------------------------------------------------
        { "kg",      UnitSpec{ kg_to_kg,    Dims::mass } },
        { "g",       UnitSpec{ g_to_kg,     Dims::mass } },
        { "t",       UnitSpec{ t_to_kg,     Dims::mass } },
        { "ton",     UnitSpec{ t_to_kg,     Dims::mass } },
        { "tonne",   UnitSpec{ t_to_kg,     Dims::mass } },

        // ----- temperature ---------------------------------------------
        //  K is multiplicative.  C and F are affine; we still register
        //  them in the table (with affine=true) so lookupUnit() sees
        //  them and the parser routes to affineToK().
        { "K",       UnitSpec{ 1.0,         Dims::temperature } },
        { "degC",    UnitSpec{ 1.0,         Dims::temperature, /*affine=*/true } },
        { "C",       UnitSpec{ 1.0,         Dims::temperature, /*affine=*/true } },
        { "Celsius", UnitSpec{ 1.0,         Dims::temperature, /*affine=*/true } },
        { "degF",    UnitSpec{ 1.0,         Dims::temperature, /*affine=*/true } },
        { "F",       UnitSpec{ 1.0,         Dims::temperature, /*affine=*/true } },
        { "Fahrenheit", UnitSpec{ 1.0,      Dims::temperature, /*affine=*/true } },

        // ----- velocity → m/s -------------------------------------------
        { "m/s",     UnitSpec{ 1.0,         Dims::velocity } },
        { "cm/s",    UnitSpec{ 1.0e-2,      Dims::velocity } },
        { "mm/s",    UnitSpec{ 1.0e-3,      Dims::velocity } },

        // ----- concentration → kmol/m³ ----------------------------------
        { "kmol/m3", UnitSpec{ 1.0,         Dims::concentration } },
        { "mol/m3",  UnitSpec{ 1.0e-3,      Dims::concentration } },
        { "mol/L",   UnitSpec{ 1.0,         Dims::concentration } },   // mol/L = kmol/m³
        { "mmol/L",  UnitSpec{ 1.0e-3,      Dims::concentration } },
        { "M",       UnitSpec{ 1.0,         Dims::concentration } },   // molar
        // an equivalent (eq) = one mole of CHARGE (= one mole of exchange sites
        // for a monovalent ion); numerically a mole, so eq/L reads as a
        // concentration -- the volumetric basis an ion-exchange CEC is quoted in.
        { "eq/L",    UnitSpec{ 1.0,         Dims::concentration } },
        { "meq/L",   UnitSpec{ 1.0e-3,      Dims::concentration } },

        // ----- molality → kmol/kg (solvent) ------------------------------
        //   Water analyses / electrolyte totals.  Canonical is kmol/kg
        //   (the kmol convention), so mol/kg carries the 1e-3.
        { "mol/kg",  UnitSpec{ 1.0e-3,      Dims::molality } },
        { "mmol/kg", UnitSpec{ 1.0e-6,      Dims::molality } },
        // exchange capacity per mass (eq = mole of charge; eq/kg = mol/kg)
        { "eq/kg",   UnitSpec{ 1.0e-3,      Dims::molality } },
        { "meq/kg",  UnitSpec{ 1.0e-6,      Dims::molality } },

        // ----- specific volume → m³/kg -----------------------------------
        //   A resin DOSE (litres of settled bed contacted per kg of water)
        //   is dimensionally a specific volume; canonical is m³/kg.
        { "m3/kg",   UnitSpec{ 1.0,         Dims::specificVolume } },
        { "L/kg",    UnitSpec{ 1.0e-3,      Dims::specificVolume } },
        { "mL/g",    UnitSpec{ 1.0e-3,      Dims::specificVolume } },

        // ----- density → kg/m³ ------------------------------------------
        { "kg/m3",   UnitSpec{ 1.0,         Dims::density } },
        { "g/cm3",   UnitSpec{ 1.0e3,       Dims::density } },
        { "g/mL",    UnitSpec{ 1.0e3,       Dims::density } },
        //   Mass concentration of a solute (water-analysis lab sheets) is
        //   dimensionally a density.  `ppm` here is the w/v water-analysis
        //   convention (1 ppm = 1 mg/L, dilute aqueous) -- NOT a fraction;
        //   a dim-checked dimensionless lookup will refuse it loudly.
        { "mg/L",    UnitSpec{ 1.0e-3,      Dims::density } },
        { "g/L",     UnitSpec{ 1.0,         Dims::density } },
        { "ppm",     UnitSpec{ 1.0e-3,      Dims::density } },   // = mg/L (w/v)

        // ----- energy, power -------------------------------------------
        { "J",       UnitSpec{ 1.0,         Dims::energy } },
        { "kJ",      UnitSpec{ 1.0e3,       Dims::energy } },
        { "MJ",      UnitSpec{ 1.0e6,       Dims::energy } },
        { "W",       UnitSpec{ 1.0,         Dims::power } },
        { "kW",      UnitSpec{ 1.0e3,       Dims::power } },
        { "MW_power", UnitSpec{ 1.0e6,      Dims::power } },   // disambiguates from MPa
        // NOTE: molar-energy units (J/mol, kJ/mol, J/kmol, kJ/kmol) already
        // live further down -- Choupo's molarEnergy is J/mol NUMERICALLY.

        // ----- molar amount → kmol --------------------------------------
        { "mol",     UnitSpec{ 1.0e-3,      Dims::amount } },
        { "kmol",    UnitSpec{ 1.0,         Dims::amount } },

        // ----- membrane permeability  J_w = A_w · ΔP --------------------
        //   J_w in m/s, ΔP in Pa  →  A_w in m/(s·Pa).  We register
        //   `m/s/Pa` and `m/s/bar` so manufacturer data sheets in either
        //   convention can be expressed as named units.  Both convert
        //   into the same SI canonical [-1 2 1 0 0].
        { "m/s/Pa",  UnitSpec{ 1.0,    Dims::permeabilityWater } },
        { "m/s/bar", UnitSpec{ 1.0e-5, Dims::permeabilityWater } },

        // ----- viscosity → Pa·s -----------------------------------------
        { "Pa.s",    UnitSpec{ 1.0,         Dims::viscosity } },
        { "cP",      UnitSpec{ 1.0e-3,      Dims::viscosity } },   // centipoise

        // ----- overall heat-transfer coefficient → W/(m²·K) -------------
        //   Used by Evaporator (and any future two-stream heat
        //   exchanger).  Aliases keep the case files readable across
        //   conventions.
        { "W/(m^2.K)",  UnitSpec{ 1.0,      Dims::heatTransfer_h } },
        { "W/(m2.K)",   UnitSpec{ 1.0,      Dims::heatTransfer_h } },
        { "W/m^2/K",    UnitSpec{ 1.0,      Dims::heatTransfer_h } },
        { "W/m2/K",     UnitSpec{ 1.0,      Dims::heatTransfer_h } },
        { "kW/(m^2.K)", UnitSpec{ 1.0e3,    Dims::heatTransfer_h } },
        { "kW/(m2.K)",  UnitSpec{ 1.0e3,    Dims::heatTransfer_h } },

        // ----- molar mass → kg/kmol -------------------------------------
        { "kg/kmol", UnitSpec{ 1.0,         Dims::molarMass } },
        { "g/mol",   UnitSpec{ 1.0,         Dims::molarMass } },   // numerically equal

        // ----- molar energy ---------------------------------------------
        //   Convention: Choupo uses J/mol internally for molar enthalpies
        //   and Gibbs energies (it lines up with `constant::R = 8.314
        //   J/(mol*K)` and the existing dHf_298 / s_298.dat values).
        //   The Dims tag is `[1 2 -2 0 -1]` (molar energy on N=kmol);
        //   the conversion factors below reflect that the *canonical*
        //   numerical unit is J/mol, so J/kmol and kJ/mol scale relative
        //   to it.
        { "J/mol",   UnitSpec{ 1.0,         Dims::molarEnergy } },
        { "kJ/mol",  UnitSpec{ 1.0e3,       Dims::molarEnergy } },
        { "J/kmol",  UnitSpec{ 1.0e-3,      Dims::molarEnergy } },
        { "kJ/kmol", UnitSpec{ 1.0,         Dims::molarEnergy } },

        // ----- molar heat capacity → J/(mol*K) --------------------------
        { "J/(mol.K)",   UnitSpec{ 1.0,     Dims::molarHeatCap } },
        { "J/(kmol.K)",  UnitSpec{ 1.0e-3,  Dims::molarHeatCap } },
        { "kJ/(kmol.K)", UnitSpec{ 1.0,     Dims::molarHeatCap } },

        // ----- dimensionless / percent ----------------------------------
        { "-",       UnitSpec{ 1.0,         Dims::dimensionless } },
        { "%",       UnitSpec{ 1.0e-2,      Dims::dimensionless } },
        { "kg/kg",   UnitSpec{ 1.0,         Dims::dimensionless } },   // mass ratio (e.g. dry resin per kg water)
    };
    return t;
}

} // anonymous namespace

std::optional<UnitSpec> lookupUnit(const std::string& suffix)
{
    const auto& t = table();
    auto it = t.find(suffix);
    if (it == t.end()) return std::nullopt;
    return it->second;
}

scalar affineToK(scalar value, const std::string& suffix)
{
    auto s = lookupUnit(suffix);
    if (!s || !s->affine)
        throw std::runtime_error("units::affineToK: '" + suffix +
            "' is not an affine temperature unit (expected C / degC /"
            " Celsius / F / degF / Fahrenheit)");

    if (suffix == "C" || suffix == "degC" || suffix == "Celsius")
        return celsius_to_K(value);
    if (suffix == "F" || suffix == "degF" || suffix == "Fahrenheit")
        return fahrenheit_to_K(value);
    return std::nan("");
}

} // namespace Choupo::units
