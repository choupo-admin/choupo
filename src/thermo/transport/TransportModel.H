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
    Choupo::TransportModel

Description
    Abstract base for transport-property correlations (viscosity, and
    later thermal conductivity, diffusivity).  Built-in correlations
    register through `TransportModel::registerModel(name, factory)`, the
    same explicit-factory pattern as ActivityModel / EquationOfState.

    Selected in the thermoPackage:

        transport
        {
            model       Chung;      // low-pressure gas viscosity
        }

    The pure-component methods take a Component so a correlation can read
    Tc / Pc / omega / MW directly; mixture rules live in ThermoPackage
    (e.g. Wilke for gas viscosity).
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

class TransportModel
{
public:
    virtual ~TransportModel() = default;

    virtual const std::string& modelName() const = 0;

    // Pure-component low-pressure gas viscosity [Pa·s].
    virtual scalar viscosityGasPure(const Component& c, scalar T_K) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<TransportModel>(const DictPtr&)>;

    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<TransportModel> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableModels();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
