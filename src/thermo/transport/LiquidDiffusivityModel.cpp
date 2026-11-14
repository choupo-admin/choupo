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

#include "LiquidDiffusivityModel.H"
#include "WilkeChang.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

std::map<std::string, LiquidDiffusivityModel::Factory>& LiquidDiffusivityModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void LiquidDiffusivityModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<LiquidDiffusivityModel> LiquidDiffusivityModel::New(const DictPtr& dict)
{
    if (!dict->found("model"))
        throw std::runtime_error("liquid diffusivity: the block names no `model` -- the factory"
            " default (WilkeChang) was removed (DEV.md 4c C398, review row SL-04): a"
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
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("LiquidDiffusivityModel: unknown model '" + name
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void LiquidDiffusivityModel::registerBuiltins()
{
    registerModel("WilkeChang", [](const DictPtr& d) { return std::make_unique<WilkeChang>(d); });
    registerModel("wilkeChang", [](const DictPtr& d) { return std::make_unique<WilkeChang>(d); });
}

std::vector<std::string> LiquidDiffusivityModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
