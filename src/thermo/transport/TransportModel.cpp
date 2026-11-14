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
#include "core/RegistryRefusal.H"
#include "ChapmanEnskog.H"
#include "ChungViscosity.H"

#include <map>
#include <memory>
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
    if (!dict->found("model"))
        throw std::runtime_error("vapour viscosity: the block names no `model` -- the factory"
            " default (Chung) was removed (DEV.md 4c C398, review row SL-04): a"
            " property block that names no model is either a liquid property"
            " block read per constituent from the records, or refused.  Write"
            " `model <word>;` -- registered:" + []
            {
                std::string s;
                for (const auto& kv : registry()) s += " " + kv.first;
                return s;
            }());
    const std::string name = dict->lookupWord("model");
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error(registryRefusal::message(
            "gas-viscosity model", name, registryRefusal::keysOf(registry())));
    return it->second(dict);
}

void TransportModel::registerBuiltins()
{
    registerModel("Chung", [](const DictPtr& d) { return std::make_unique<ChungViscosity>(d); });
    registerModel("chung", [](const DictPtr& d) { return std::make_unique<ChungViscosity>(d); });
    registerModel("ChapmanEnskog", [](const DictPtr& d) { return std::make_unique<ChapmanEnskog>(d); });
    registerModel("chapmanEnskog", [](const DictPtr& d) { return std::make_unique<ChapmanEnskog>(d); });
}

std::vector<std::string> TransportModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
