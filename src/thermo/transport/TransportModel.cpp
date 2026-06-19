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

#include "TransportModel.H"
#include "ChungViscosity.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, TransportModel::Factory>& TransportModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void TransportModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<TransportModel> TransportModel::New(const DictPtr& dict)
{
    const std::string name = dict->lookupWordOrDefault("model", "Chung");
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error("TransportModel: unknown model '" + name
            + "'.  Registered: see TransportModel::availableModels().");
    return it->second(dict);
}

void TransportModel::registerBuiltins()
{
    registerModel("Chung", [](const DictPtr& d) { return std::make_unique<ChungViscosity>(d); });
    registerModel("chung", [](const DictPtr& d) { return std::make_unique<ChungViscosity>(d); });
}

std::vector<std::string> TransportModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
