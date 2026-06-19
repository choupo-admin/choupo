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

#include "VaporPressureModel.H"
#include "Antoine.H"
#include "AmbroseWalton.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, VaporPressureModel::Factory>&
VaporPressureModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void VaporPressureModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<VaporPressureModel>
VaporPressureModel::New(const DictPtr& dict)
{
    const std::string modelName = dict->lookupWord("model");
    auto it = registry().find(modelName);
    if (it == registry().end())
        throw std::runtime_error("Unknown vapor-pressure model '" + modelName +
            "'.  Available: " + [&]() {
                std::string s;
                for (const auto& kv : registry()) s += " " + kv.first;
                return s.empty() ? std::string(" (none)") : s;
            }());
    return it->second(dict);
}

void VaporPressureModel::registerBuiltins()
{
    registerModel("Antoine",
        [](const DictPtr& d) -> std::unique_ptr<VaporPressureModel>
        { return std::make_unique<Antoine>(d); });

    registerModel("AmbroseWalton",
        [](const DictPtr& d) -> std::unique_ptr<VaporPressureModel>
        { return std::make_unique<AmbroseWalton>(d); });
}

} // namespace Choupo
