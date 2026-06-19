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
Class
    Choupo::HeatCapacityModel

Description
    Abstract base for pure-component molar heat capacity Cp(T) [J/(mol·K)].
    Used both for ideal-gas Cp and for liquid Cp (two independent instances
    per component).  Concrete models register via the usual factory.

    Not exercised by the isothermal flash; included now so that adiabatic
    flash, reactors and heat exchangers can use it without a re-design.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>

namespace Choupo {

class HeatCapacityModel
{
public:
    virtual ~HeatCapacityModel() = default;

    // Cp at temperature T [K]   -- units: J/(mol·K)
    virtual scalar Cp(scalar T_K) const = 0;

    // Sensible enthalpy ∫_{Tref}^{T} Cp(T') dT'  -- units: J/mol
    virtual scalar H (scalar T_K, scalar Tref_K) const = 0;

    // Sensible entropy ∫_{Tref}^{T} Cp(T')/T' dT'  -- units: J/(mol·K).
    // Used together with the standard-state s°(298.15) to compute the
    // total absolute entropy at T, which the Gibbs reactor needs.
    virtual scalar S (scalar T_K, scalar Tref_K) const = 0;

    virtual const std::string& modelName() const = 0;

    using Factory = std::function<std::unique_ptr<HeatCapacityModel>(const DictPtr&)>;
    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<HeatCapacityModel> New(const DictPtr& dict);
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
