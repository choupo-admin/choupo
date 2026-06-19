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
    Choupo::ThermalConductivityModel

Description
    Abstract base for low-pressure gas thermal-conductivity correlations,
    one family of the transport layer (parallel to the viscosity
    TransportModel and the DiffusivityModel).  Built-in correlations
    register through the usual explicit-factory pattern.

    Selected in a sub-block of the thermoPackage `transport`:

        transport
        {
            model               Chung;      // viscosity
            thermalConductivity { model Eucken; }
        }

    A correlation gets the Component (for MW, Tc,...) plus the already-
    computed pure-component gas viscosity `mu_pure` and ideal-gas heat
    capacity `cp_ig_pure`, so a method like Eucken needs no extra data.
    Mixture rules (Wassiljewa / Mason-Saxena) live in ThermoPackage.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Component;   // forward; the.cpp includes the full definition

class ThermalConductivityModel
{
public:
    virtual ~ThermalConductivityModel() = default;

    virtual const std::string& modelName() const = 0;

    // Pure-component low-pressure gas thermal conductivity [W/(m·K)].
    //   mu_pure   : pure-component gas viscosity [Pa·s]      (from TransportModel)
    //   cp_ig_pure: pure-component ideal-gas Cp [J/(mol·K)]  (from the.dat)
    virtual scalar conductivityGasPure(const Component& c, scalar T_K,
                                       scalar mu_pure,
                                       scalar cp_ig_pure) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<ThermalConductivityModel>(const DictPtr&)>;

    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<ThermalConductivityModel> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableModels();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
