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
    Choupo::CostingModel

Description
    Abstract base for a capital-cost estimation method (Guthrie/Turton,
    Lang factors,...).  Reads a EquipmentSizing record + a
    Material record and produces a CostBreakdown.

    All built-in models use CEPCI to update the base-year cost to the
    user-specified target year.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"
#include "materials/Material.H"

#include <functional>
#include <map>
#include <memory>
#include <string>

namespace Choupo {

class CostingModel
{
public:
    virtual ~CostingModel() = default;
    virtual const std::string& type() const = 0;

    // The configuration dict (e.g. costingDict subset) is given at
    // construction; per-equipment data comes through `cost()`.
    virtual CostBreakdown cost(const EquipmentSizing& dim,
                                const Material&   mat) const = 0;

    using Factory = std::function<std::unique_ptr<CostingModel>(const DictPtr&)>;
    static void                          registerType(const std::string& name, Factory f);
    static std::unique_ptr<CostingModel> New(const DictPtr& costingDict);
    static void                          registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
