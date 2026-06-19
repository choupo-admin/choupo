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

#include "CostingModel.H"
#include "Guthrie.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, CostingModel::Factory>& CostingModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void CostingModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<CostingModel> CostingModel::New(const DictPtr& dict)
{
    const std::string method = dict->lookupWord("method");
    auto it = registry().find(method);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("CostingModel: unknown method '" + method
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void CostingModel::registerBuiltins()
{
    registerType("Guthrie",
        [](const DictPtr& d) -> std::unique_ptr<CostingModel>
        { return std::make_unique<Guthrie>(d); });
}

} // namespace Choupo
