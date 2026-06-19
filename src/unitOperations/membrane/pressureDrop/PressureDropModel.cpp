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

#include "PressureDropModel.H"
#include "ConstantDrop.H"
#include "SchockMiquelDrop.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, PressureDropModel::Factory>& PressureDropModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void PressureDropModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<PressureDropModel> PressureDropModel::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("PressureDropModel::New: unknown model '" + name
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second();
}

std::vector<std::string> PressureDropModel::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void PressureDropModel::registerBuiltins()
{
    registerType("constant",     []{ return std::make_unique<ConstantDrop>();     });
    registerType("SchockMiquel", []{ return std::make_unique<SchockMiquelDrop>(); });
}

} // namespace Choupo
