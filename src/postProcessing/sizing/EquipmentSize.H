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
    Choupo::EquipmentSize

Description
    Abstract base for a *physical sizing* model.  Each concrete reads:
      * the user-specified design rules (operating P, L/D, U,...);
      * the corresponding unit-op KPIs from the SimulationResult
        (V_R from a CSTR, Q from a Heater,...);
      * the construction material's properties (σ_y, ρ).

    Produces an EquipmentSizing record (D, H, A, wall thickness, weight,...).

    Concrete sizing types register via `EquipmentSize::registerType()`
    and `registerBuiltins()`.
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

class EquipmentSize
{
public:
    virtual ~EquipmentSize() = default;

    virtual const std::string& type() const = 0;

    // Compute dimensions for `unitName`.  The caller supplies the matching
    // KPIs (from result.kpis[unitName]) and a unit-specific sub-dict with
    // the user-declared `designRules`.
    virtual EquipmentSizing size(const std::string&             unitName,
        const SimulationResult&        result,
        const Material&                material,
        const DictPtr&                 designRules) const = 0;

    using Factory = std::function<std::unique_ptr<EquipmentSize>()>;
    static void                          registerType(const std::string& name, Factory f);
    static std::unique_ptr<EquipmentSize> New(const std::string& type);
    static void                          registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
