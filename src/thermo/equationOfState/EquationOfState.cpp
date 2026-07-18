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

#include "EquationOfState.H"
#include "IdealGas.H"
#include "SRK.H"
#include "PCSAFT.H"
#include "PR.H"
#include "thermo/Component.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, EquationOfState::Factory>& EquationOfState::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void EquationOfState::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<EquationOfState>
EquationOfState::New(const DictPtr& dict, const std::vector<Component>& comps)
{
    const std::string modelName = dict->lookupWord("model");
    auto it = registry().find(modelName);
    if (it == registry().end())
        throw std::runtime_error("Unknown EoS model '" + modelName + "'");
    return it->second(dict, comps);
}

void EquationOfState::registerBuiltins()
{
    registerModel("idealGas",
        [](const DictPtr&, const std::vector<Component>& comps)
            -> std::unique_ptr<EquationOfState>
        { return std::make_unique<IdealGas>(comps.size()); });

    registerModel("SRK",
        [](const DictPtr& dict, const std::vector<Component>& comps)
            -> std::unique_ptr<EquationOfState>
        { return SRK::fromDict(dict, comps); });

    registerModel("PR",
        [](const DictPtr& dict, const std::vector<Component>& comps)
            -> std::unique_ptr<EquationOfState>
        { return PR::fromDict(dict, comps); });
    registerModel("PengRobinson",
        [](const DictPtr& dict, const std::vector<Component>& comps)
            -> std::unique_ptr<EquationOfState>
        { return PR::fromDict(dict, comps); });

    registerModel("PCSAFT",
        [](const DictPtr& dict, const std::vector<Component>& comps)
            -> std::unique_ptr<EquationOfState>
        { return std::make_unique<PCSAFT>(dict, comps); });
}

} // namespace Choupo
