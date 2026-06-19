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

#include "LiquidViscosityModel.H"
#include "Andrade.H"
#include "Vogel.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, LiquidViscosityModel::Factory>& LiquidViscosityModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void LiquidViscosityModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<LiquidViscosityModel> LiquidViscosityModel::New(const DictPtr& dict)
{
    const std::string name = dict->lookupWordOrDefault("model", "Andrade");
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error("LiquidViscosityModel: unknown model '" + name
            + "'.  Registered: see LiquidViscosityModel::availableModels().");
    return it->second(dict);
}

void LiquidViscosityModel::registerBuiltins()
{
    registerModel("Andrade", [](const DictPtr& d) { return std::make_unique<Andrade>(d); });
    registerModel("andrade", [](const DictPtr& d) { return std::make_unique<Andrade>(d); });
    registerModel("Vogel",   [](const DictPtr& d) { return std::make_unique<Vogel>(d); });
    registerModel("vogel",   [](const DictPtr& d) { return std::make_unique<Vogel>(d); });
}

std::vector<std::string> LiquidViscosityModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
